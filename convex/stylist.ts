import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { fail, requireProfile } from "./lib";

const STYLIST_MODEL = process.env.OPENAI_STYLIST_MODEL || "gpt-5-mini";
const MODEL_TIMEOUT_MS = 25_000;
const MAX_COMBOS = 60;
const SLOT_ORDER = ["outerwear", "top", "dress", "bottom", "shoes", "accessory"];
const STYLED = new Set(["outerwear", "top", "dress", "bottom", "shoes", "accessory"]);

type StyleItem = Pick<Doc<"items">, "_id" | "name" | "category" | "subtype" | "color" | "availability" | "wearCount" | "wearsSinceWash" | "isPrivate">;
type Combo = { itemIds: Id<"items">[]; key: string; score: number };

export const context = internalQuery({
  args: { closetCode: v.string() },
  handler: async (ctx, args): Promise<StyleItem[]> => {
    const profile = await requireProfile(ctx, args.closetCode);
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))
      .take(500);
    return items.map((i) => ({
      _id: i._id,
      name: i.name,
      category: i.category,
      subtype: i.subtype,
      color: i.color,
      availability: i.availability,
      wearCount: i.wearCount,
      wearsSinceWash: i.wearsSinceWash,
      isPrivate: i.isPrivate,
    }));
  },
});

function lookId(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return `look_${(h >>> 0).toString(36)}`;
}

function orderBySlot(items: StyleItem[]) {
  return [...items].sort((a, b) => SLOT_ORDER.indexOf(a.category) - SLOT_ORDER.indexOf(b.category));
}

export function buildCombos(
  pool: StyleItem[],
  locked: StyleItem[],
  weather: { tempC: number; condition: string } | undefined,
): Combo[] {
  const lockedBy = new Map<string, StyleItem>();
  for (const l of locked) {
    if (!STYLED.has(l.category)) fail("BAD_LOCK", `${l.name} can't be styled on the avatar.`);
    if (lockedBy.has(l.category)) fail("BAD_LOCK", `Only one locked ${l.category} fits in an outfit.`);
    lockedBy.set(l.category, l);
  }
  if (lockedBy.has("dress") && (lockedBy.has("top") || lockedBy.has("bottom"))) {
    fail("BAD_LOCK", "A locked dress can't be combined with a locked top or bottom.");
  }
  const options = (cat: string) => {
    const l = lockedBy.get(cat);
    if (l) return [l];
    return pool
      .filter((i) => i.category === cat)
      .sort((a, b) => a.wearsSinceWash - b.wearsSinceWash || a.wearCount - b.wearCount || (a._id < b._id ? -1 : 1));
  };
  const bases: StyleItem[][] = [];
  const useDress = !lockedBy.has("top") && !lockedBy.has("bottom");
  const useSeparates = !lockedBy.has("dress");
  if (useSeparates) for (const t of options("top")) for (const b of options("bottom")) bases.push([t, b]);
  if (useDress) for (const d of options("dress")) bases.push([d]);
  const shoes = options("shoes");
  const outer = lockedBy.has("outerwear") ? options("outerwear") : [undefined, ...options("outerwear")];
  const acc = lockedBy.get("accessory");
  const cold = weather ? weather.tempC < 15 || /rain|snow|wind/i.test(weather.condition) : false;
  const hot = weather ? weather.tempC > 24 : false;
  const combos: Combo[] = [];
  for (const base of bases) {
    for (const s of shoes.length ? shoes : [undefined]) {
      for (const o of outer) {
        const parts = [...base, s, o, acc].filter((x): x is StyleItem => !!x);
        const itemIds = orderBySlot(parts).map((p) => p._id);
        const wear = parts.reduce((n, p) => n + p.wearsSinceWash * 2 + p.wearCount * 0.1, 0);
        const score = -wear + (o ? (cold ? 3 : hot ? -3 : 0.5) : cold ? -3 : 0);
        combos.push({ itemIds, key: [...itemIds].sort().join(","), score });
      }
    }
  }
  return combos.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1)).slice(0, MAX_COMBOS);
}

async function rankWithModel(
  prompt: string,
  weather: { tempC: number; condition: string } | undefined,
  items: Map<Id<"items">, StyleItem>,
  combos: Combo[],
): Promise<{ itemIds: Id<"items">[]; reason: string }[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const describe = (id: Id<"items">) => {
    const i = items.get(id)!;
    return `${id} (${i.category}: ${i.name}, worn ${i.wearCount}x)`;
  };
  const lines = combos.map((c, n) => `Look ${n}: ${c.itemIds.map(describe).join(" + ")}`).join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: STYLIST_MODEL,
        reasoning: { effort: "minimal" },
        instructions:
          "You are a concise personal stylist. Pick the best one or two looks for the user's plan from the numbered valid looks only. Copy each chosen look's item ids exactly. Give one short reason (max 14 words) per look.",
        input: `Plan: ${prompt || "everyday"}\nWeather: ${weather ? `${weather.tempC}C, ${weather.condition}` : "unknown"}\nValid looks:\n${lines}`,
        text: {
          format: {
            type: "json_schema",
            name: "stylist_picks",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["picks"],
              properties: {
                picks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["itemIds", "reason"],
                    properties: { itemIds: { type: "array", items: { type: "string" } }, reason: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("stylist model error", res.status);
      return null;
    }
    const json = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const text = (json.output ?? [])
      .flatMap((o) => (o.type === "message" ? (o.content ?? []) : []))
      .find((p) => p.type === "output_text")?.text;
    if (!text) return null;
    return (JSON.parse(text) as { picks: { itemIds: Id<"items">[]; reason: string }[] }).picks;
  } catch (e) {
    console.error("stylist model failed", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fallbackReason(items: StyleItem[], prompt: string) {
  const names = items.slice(0, 2).map((i) => i.name.toLowerCase());
  return `Available pieces that work for ${prompt.trim() || "today"}: ${names.join(" with ")}.`;
}

export const suggest = action({
  args: {
    closetCode: v.string(),
    prompt: v.string(),
    lockedItemIds: v.array(v.id("items")),
    excludeItemIds: v.optional(v.array(v.id("items"))),
    weather: v.optional(v.object({ tempC: v.number(), condition: v.string() })),
  },
  handler: async (ctx, args) => {
    const all: StyleItem[] = await ctx.runQuery(internal.stylist.context, { closetCode: args.closetCode });
    const byId = new Map(all.map((i) => [i._id, i] as const));
    const locked: StyleItem[] = [];
    for (const id of new Set(args.lockedItemIds)) {
      const item = byId.get(id);
      if (!item) fail("NOT_FOUND", "A locked item is not in this closet.");
      locked.push(item);
    }
    const lockedUnavailableItemIds = locked.filter((l) => l.availability !== "available").map((l) => l._id);
    if (lockedUnavailableItemIds.length) {
      const names = locked.filter((l) => l.availability !== "available").map((l) => `${l.name} (${l.availability.replace(/_/g, " ")})`);
      return {
        outfits: [],
        lockedUnavailableItemIds,
        source: "rules" as const,
        message: `${names.join(", ")} is no longer available. Replace or unlock it.`,
      };
    }
    const exclude = new Set(args.excludeItemIds ?? []);
    const pool = all.filter((i) => i.availability === "available" && !i.isPrivate && !exclude.has(i._id) && STYLED.has(i.category));
    const combos = buildCombos(pool, locked, args.weather);
    if (combos.length === 0) {
      return {
        outfits: [],
        source: "rules" as const,
        message: "Not enough available pieces for a full look: add or wash a top and bottom (or a dress).",
      };
    }
    const byKey = new Map(combos.map((c) => [c.key, c] as const));
    const picks = combos.length > 1 ? await rankWithModel(args.prompt, args.weather, byId, combos) : null;
    const chosen: { combo: Combo; reason: string }[] = [];
    for (const p of picks ?? []) {
      const combo = byKey.get([...new Set(p.itemIds)].sort().join(","));
      if (combo && !chosen.some((c) => c.combo.key === combo.key)) chosen.push({ combo, reason: p.reason.trim() });
      if (chosen.length === 2) break;
    }
    const source = chosen.length ? ("model" as const) : ("fallback" as const);
    if (!chosen.length) {
      for (const combo of combos.slice(0, 2)) {
        chosen.push({ combo, reason: fallbackReason(combo.itemIds.map((id) => byId.get(id)!), args.prompt) });
      }
    }
    return {
      outfits: chosen.map((c, i) => ({ outfitId: lookId(c.combo.key), rank: i + 1, itemIds: c.combo.itemIds, reason: c.reason })),
      source,
    };
  },
});
