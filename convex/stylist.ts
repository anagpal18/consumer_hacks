import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { fail, requireProfile } from "./lib";

const MODEL_TIMEOUT_MS = 25_000;
const SWAP_TIMEOUT_MS = 10_000;
const MAX_COMBOS = 60;
const SLOT_ORDER = ["outerwear", "top", "dress", "bottom", "shoes", "accessory"];
const STYLED = new Set(["outerwear", "top", "dress", "bottom", "shoes", "accessory"]);

type StyleItem = Pick<Doc<"items">, "_id" | "name" | "category" | "subtype" | "color" | "availability" | "wearCount" | "wearsSinceWash" | "isPrivate">;
type Combo = { itemIds: Id<"items">[]; key: string; score: number };
type Weather = { tempC: number; condition: string };
type Swap = { from: Id<"items">; to: Id<"items"> | null };

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

function comboKey(ids: Id<"items">[]) {
  return [...new Set(ids)].sort().join(",");
}

function orderBySlot(items: StyleItem[]) {
  return [...items].sort((a, b) => SLOT_ORDER.indexOf(a.category) - SLOT_ORDER.indexOf(b.category));
}

function statusWord(item: StyleItem) {
  return item.availability === "available" ? "excluded" : item.availability.replace(/_/g, " ");
}

export function buildCombos(pool: StyleItem[], locked: StyleItem[], weather: Weather | undefined): Combo[] {
  const lockedBy = new Map<string, StyleItem>();
  for (const l of locked) {
    if (!STYLED.has(l.category) || l.isPrivate) fail("BAD_LOCK", `${l.name} can't be styled on the avatar.`);
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
        const score = -wear + (s ? 0 : -5) + (o ? (cold ? 3 : hot ? -3 : 0.5) : cold ? -3 : 0);
        combos.push({ itemIds, key: comboKey(itemIds), score });
      }
    }
  }
  return combos.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1)).slice(0, MAX_COMBOS);
}

export function secondLook(combos: Combo[], first: Combo) {
  const others = combos.filter((c) => c.key !== first.key);
  const diff = (c: Combo) => c.itemIds.filter((id) => !first.itemIds.includes(id)).length;
  return others.find((c) => diff(c) >= 2) ?? others.find((c) => diff(c) >= 1 && c.itemIds.length === first.itemIds.length) ?? others[0];
}

async function rankWithModel(
  prompt: string,
  weather: Weather | undefined,
  items: Map<Id<"items">, StyleItem>,
  combos: Combo[],
  note: string | undefined,
  timeoutMs: number,
): Promise<{ itemIds: Id<"items">[]; reason: string }[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const describe = (id: Id<"items">) => {
    const i = items.get(id)!;
    return `${id} (${i.category}: ${i.name}, worn ${i.wearCount}x, ${i.wearsSinceWash} since wash)`;
  };
  const lines = combos.map((c, n) => `Look ${n}: ${c.itemIds.map(describe).join(" + ")}`).join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_STYLIST_MODEL || "gpt-5-mini",
        reasoning: { effort: "minimal" },
        instructions:
          "You are a concise personal stylist. Pick the best two looks for the user's plan from the numbered valid looks only (one if only one fits). Copy each chosen look's item ids exactly. Give one short reason (max 14 words) per look.",
        input: `Plan: ${prompt.trim() || "everyday"}\nWeather: ${weather ? `${weather.tempC}C, ${weather.condition}` : "unknown"}${note ? `\nNote: ${note}` : ""}\nValid looks:\n${lines}`,
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
    const picks = (JSON.parse(text) as { picks?: unknown }).picks;
    if (!Array.isArray(picks)) return null;
    return picks.filter(
      (p): p is { itemIds: Id<"items">[]; reason: string } =>
        !!p && Array.isArray(p.itemIds) && p.itemIds.every((id: unknown) => typeof id === "string") && typeof p.reason === "string",
    );
  } catch (e) {
    console.error("stylist model failed", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fallbackReason(items: StyleItem[], prompt: string, weather: Weather | undefined) {
  const names = items.filter((i) => i.category !== "outerwear").slice(0, 2).map((i) => i.name.toLowerCase());
  const layer = items.find((i) => i.category === "outerwear");
  const weatherNote = weather && layer && weather.tempC < 15 ? `, with the ${layer.name.toLowerCase()} for ${weather.tempC}°C` : "";
  return `Fresh, available pieces for ${prompt.trim() || "today"}: ${names.join(" with ")}${weatherNote}.`;
}

function swapReason(swaps: Swap[], byId: Map<Id<"items">, StyleItem>) {
  const parts = swaps.map((s) => {
    const from = byId.get(s.from)!;
    const to = s.to ? byId.get(s.to)! : null;
    return to
      ? `${to.name} replace the ${from.name.toLowerCase()} (${statusWord(from)})`
      : `dropped the ${from.name.toLowerCase()} (${statusWord(from)})`;
  });
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. The rest of the look stays.`;
}

export const suggest = action({
  args: {
    closetCode: v.string(),
    prompt: v.string(),
    lockedItemIds: v.array(v.id("items")),
    excludeItemIds: v.optional(v.array(v.id("items"))),
    currentItemIds: v.optional(v.array(v.id("items"))),
    weather: v.optional(v.object({ tempC: v.number(), condition: v.string() })),
  },
  handler: async (ctx, args) => {
    const all: StyleItem[] = await ctx.runQuery(internal.stylist.context, { closetCode: args.closetCode });
    const byId = new Map(all.map((i) => [i._id, i] as const));
    const owned = (ids: Id<"items">[] | undefined, what: string) =>
      [...new Set(ids ?? [])].map((id) => byId.get(id) ?? fail("NOT_FOUND", `${what} is not in this closet.`));
    const locked = owned(args.lockedItemIds, "A locked item");
    const exclude = new Set(owned(args.excludeItemIds, "An excluded item").map((i) => i._id));
    const current = args.currentItemIds ? owned(args.currentItemIds, "An item in the current look") : null;

    const lockedGone = locked.filter((l) => l.availability !== "available");
    if (lockedGone.length) {
      const names = lockedGone.map((l) => `${l.name} (${statusWord(l)})`);
      return {
        outfits: [],
        lockedUnavailableItemIds: lockedGone.map((l) => l._id),
        source: "rules" as const,
        message: `${names.join(", ")} ${lockedGone.length > 1 ? "are" : "is"} no longer available. Replace or unlock ${lockedGone.length > 1 ? "them" : "it"}.`,
      };
    }
    if (locked.some((l) => exclude.has(l._id))) fail("BAD_LOCK", "Unlock an item before asking to change it.");

    const usable = (i: StyleItem) => i.availability === "available" && !i.isPrivate && !exclude.has(i._id) && STYLED.has(i.category);
    let keep = locked;
    let pool = all.filter(usable);
    let swappedOut: StyleItem[] = [];
    if (current) {
      const lockedCats = new Set(locked.map((l) => l.category));
      const lockedIds = new Set(locked.map((l) => l._id));
      const styled = current.filter((i) => STYLED.has(i.category) && !i.isPrivate && !lockedIds.has(i._id) && !lockedCats.has(i.category));
      keep = [...locked, ...styled.filter(usable)];
      swappedOut = styled.filter((i) => !usable(i));
      if (!swappedOut.length) {
        const itemIds = orderBySlot(keep).map((i) => i._id);
        return {
          outfits: [{ outfitId: lookId(comboKey(itemIds)), rank: 1, itemIds, reason: "Everything in this look is still available.", swaps: [] as Swap[] }],
          source: "rules" as const,
        };
      }
      const open = new Set(swappedOut.map((i) => i.category));
      const currentIds = new Set(current.map((i) => i._id));
      pool = all.filter((i) => usable(i) && open.has(i.category) && !currentIds.has(i._id));
    }

    const combos = buildCombos(pool, keep, args.weather);
    if (combos.length === 0) {
      return {
        outfits: [],
        source: "rules" as const,
        message: current
          ? `No available replacement for ${swappedOut.map((i) => i.name.toLowerCase()).join(", ")}. Wash or add one, or pick a new look.`
          : "Not enough available pieces for a full look: add or wash a top and bottom (or a dress).",
      };
    }

    const swapsFor = (combo: Combo): Swap[] | undefined => {
      if (!current) return undefined;
      const added = combo.itemIds.filter((id) => !current.some((c) => c._id === id));
      return swappedOut.map((from) => {
        const to = added.find((id) => byId.get(id)!.category === from.category);
        return { from: from._id, to: to ?? null };
      });
    };
    const note = current
      ? `Keep the current look; only replace ${swappedOut.map((i) => `${i.name} (${statusWord(i)})`).join(", ")}. Every look below already does that.`
      : undefined;
    const byKey = new Map(combos.map((c) => [c.key, c] as const));
    const picks = combos.length > 1 ? await rankWithModel(args.prompt, args.weather, byId, combos, note, current ? SWAP_TIMEOUT_MS : MODEL_TIMEOUT_MS) : null;
    const chosen: { combo: Combo; reason: string }[] = [];
    for (const p of picks ?? []) {
      const combo = byKey.get(comboKey(p.itemIds));
      if (combo && !chosen.some((c) => c.combo.key === combo.key)) chosen.push({ combo, reason: p.reason.trim().slice(0, 160) });
      if (chosen.length === 2) break;
    }
    const source = chosen.length ? ("model" as const) : combos.length > 1 ? ("fallback" as const) : ("rules" as const);
    const reasonFor = (combo: Combo) => {
      const swaps = swapsFor(combo);
      return swaps ? swapReason(swaps, byId) : fallbackReason(combo.itemIds.map((id) => byId.get(id)!), args.prompt, args.weather);
    };
    if (!chosen.length) chosen.push({ combo: combos[0], reason: reasonFor(combos[0]) });
    if (chosen.length === 1) {
      const next = secondLook(combos, chosen[0].combo);
      if (next) chosen.push({ combo: next, reason: reasonFor(next) });
    }
    return {
      outfits: chosen.map((c, i) => ({
        outfitId: lookId(c.combo.key),
        rank: i + 1,
        itemIds: c.combo.itemIds,
        reason: c.reason,
        ...(current ? { swaps: swapsFor(c.combo)! } : {}),
      })),
      source,
    };
  },
});
