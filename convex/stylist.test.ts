/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { streakFromTimes } from "./outfits";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const A = "demo-stylist-a";
const B = "demo-stylist-b";

type T = ReturnType<typeof convexTest>;
type Items = Record<string, Id<"items">>;

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function seed(t: T, closetCode = A): Promise<Items> {
  const { items } = await t.mutation(api.demo.seed, { closetCode });
  return Object.fromEntries(items.map((i) => [i.demoKey, i.itemId as Id<"items">]));
}

async function categories(t: T, closetCode = A) {
  const list = await t.query(api.closet.list, { closetCode });
  return new Map(list.map((i) => [i.itemId, i] as const));
}

async function expectValidLooks(t: T, outfits: { itemIds: string[] }[], closetCode = A) {
  const byId = await categories(t, closetCode);
  for (const o of outfits) {
    const cats = o.itemIds.map((id) => byId.get(id as Id<"items">)!.category);
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats.includes("dress") || (cats.includes("top") && cats.includes("bottom"))).toBe(true);
    expect(cats).not.toContain("socks");
    expect(cats).not.toContain("underwear");
    for (const id of o.itemIds) expect(byId.get(id as Id<"items">)!.availability).toBe("available");
  }
}

function mockModel(reply: (lookIds: string[][]) => unknown, status = 200) {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const input = (JSON.parse(init.body) as { input: string }).input;
    const looks = input
      .split("\n")
      .filter((l) => l.startsWith("Look "))
      .map((l) => [...l.matchAll(/(\S+) \(/g)].map((m) => m[1]));
    const body = { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reply(looks)) }] }] };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("stylist:suggest", () => {
  test("never styles laundry, retired or private items and returns two valid looks", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: ids.sneakers_white, availability: "laundry" });
    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: ids.chinos_khaki, availability: "retired" });
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [] });
    expect(res.source).toBe("fallback");
    expect(res.outfits).toHaveLength(2);
    expect(res.outfits.map((o) => o.rank)).toEqual([1, 2]);
    await expectValidLooks(t, res.outfits);
    for (const o of res.outfits) {
      expect(o.itemIds).not.toContain(ids.sneakers_white);
      expect(o.itemIds).not.toContain(ids.chinos_khaki);
      expect(o.itemIds).not.toContain(ids.socks_grey);
      expect(o.reason.length).toBeGreaterThan(0);
    }
    expect(res.outfits[0].itemIds).not.toEqual(res.outfits[1].itemIds);
  });

  test("locked items stay in every look", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [ids.jacket_denim], weather: { tempC: 14, condition: "clear" } });
    expect(res.outfits).toHaveLength(2);
    for (const o of res.outfits) expect(o.itemIds).toContain(ids.jacket_denim);
    await expectValidLooks(t, res.outfits);
  });

  test("a locked item that became unavailable returns replace-or-unlock instead of being dropped", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: ids.jacket_denim, availability: "laundry" });
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [ids.jacket_denim] });
    expect(res.outfits).toEqual([]);
    expect(res.lockedUnavailableItemIds).toEqual([ids.jacket_denim]);
    expect(res.message).toContain("Denim jacket (laundry)");
    expect(res.message).toContain("Replace or unlock");
  });

  test("single-slot recompute: shoes go to laundry, only the shoes change and the locked jacket stays", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const fetchMock = mockModel(() => ({ picks: [] }));
    const current = [ids.jacket_denim, ids.shirt_white, ids.trousers_charcoal, ids.sneakers_white, ids.socks_grey];
    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: ids.sneakers_white, availability: "laundry" });
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [ids.jacket_denim], currentItemIds: current });
    expect(res.outfits[0].itemIds).toEqual([ids.jacket_denim, ids.shirt_white, ids.trousers_charcoal, ids.boots_brown]);
    expect(res.outfits[0].swaps).toEqual([{ from: ids.sneakers_white, to: ids.boots_brown }]);
    expect(res.outfits[0].reason).toContain("Brown leather boots replace the white sneakers (laundry)");
    expect(res.source).toBe("rules");
    for (const o of res.outfits) for (const kept of [ids.jacket_denim, ids.shirt_white, ids.trousers_charcoal]) expect(o.itemIds).toContain(kept);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("single-slot recompute by excluding one piece keeps the rest of the look", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const current = [ids.shirt_white, ids.trousers_charcoal, ids.boots_brown];
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "brunch", lockedItemIds: [], currentItemIds: current, excludeItemIds: [ids.trousers_charcoal] });
    expect(res.outfits[0].itemIds).toEqual([ids.shirt_white, ids.chinos_khaki, ids.boots_brown]);
    expect(res.outfits[0].swaps).toEqual([{ from: ids.trousers_charcoal, to: ids.chinos_khaki }]);
    expect(res.outfits).toHaveLength(1);
  });

  test("recompute with nothing changed returns the current look as is", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const current = [ids.shirt_white, ids.trousers_charcoal, ids.boots_brown];
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [], currentItemIds: current });
    expect(res.outfits).toHaveLength(1);
    expect(new Set(res.outfits[0].itemIds)).toEqual(new Set(current));
    expect(res.outfits[0].swaps).toEqual([]);
  });

  test("model failure falls back to deterministic valid looks", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const fetchMock = mockModel(() => ({ error: "boom" }), 500);
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [ids.jacket_denim] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.source).toBe("fallback");
    expect(res.outfits).toHaveLength(2);
    await expectValidLooks(t, res.outfits);
  });

  test("model output with invented or foreign ids is ignored", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const other = await seed(t, B);
    mockModel(() => ({ picks: [{ itemIds: [other.shirt_white, other.trousers_charcoal, other.boots_brown], reason: "stolen" }, { itemIds: ["made_up"], reason: "fake" }] }));
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [ids.jacket_denim] });
    expect(res.source).toBe("fallback");
    for (const o of res.outfits) for (const id of o.itemIds) expect(Object.values(ids)).toContain(id);
  });

  test("a valid model pick is used and a second valid look is filled in", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    mockModel((looks) => ({ picks: [{ itemIds: looks[looks.length - 1], reason: "Model pick." }] }));
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [ids.jacket_denim] });
    expect(res.source).toBe("model");
    expect(res.outfits).toHaveLength(2);
    expect(res.outfits[0].reason).toBe("Model pick.");
    await expectValidLooks(t, res.outfits);
  });

  test("ids from another closet are rejected", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const other = await seed(t, B);
    await expect(t.action(api.stylist.suggest, { closetCode: A, prompt: "x", lockedItemIds: [other.jacket_denim] })).rejects.toThrow();
    await expect(t.action(api.stylist.suggest, { closetCode: A, prompt: "x", lockedItemIds: [], currentItemIds: [other.shirt_white] })).rejects.toThrow();
    await expect(t.action(api.stylist.suggest, { closetCode: A, prompt: "x", lockedItemIds: [], excludeItemIds: [other.shirt_white] })).rejects.toThrow();
  });
});

describe("outfits:confirmWear", () => {
  test("the same requestId counts once, even when sent concurrently", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const args = { closetCode: A, itemIds: [ids.jacket_denim, ids.shirt_white, ids.trousers_charcoal, ids.sneakers_white, ids.socks_grey], requestId: "req-1" };
    const [a, b] = await Promise.all([t.mutation(api.outfits.confirmWear, args), t.mutation(api.outfits.confirmWear, args)]);
    const c = await t.mutation(api.outfits.confirmWear, args);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(c.duplicate).toBe(true);
    expect(c.wear.wearId).toBe(a.wear.wearId);
    expect(c.challenge.map((p) => p.itemId)).not.toContain(ids.socks_grey);
    const byId = await categories(t);
    expect(byId.get(ids.jacket_denim)!.wearCount).toBe(1);
    expect(byId.get(ids.jacket_denim)!.wearsSinceWash).toBe(1);
    expect(byId.get(ids.socks_grey)!.wearCount).toBe(1);
    expect((await t.query(api.outfits.recentWears, { closetCode: A }))).toHaveLength(1);
  });

  test("worn stays separate from laundry, wash reminders fire and Laundry done resets the cycle", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const look = [ids.shirt_white, ids.trousers_charcoal, ids.sneakers_white, ids.socks_grey];
    const first = await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: look, requestId: "w1" });
    expect(first.washReminderItemIds).toEqual([ids.socks_grey]);
    let byId = await categories(t);
    expect(byId.get(ids.shirt_white)!.availability).toBe("available");
    expect(byId.get(ids.shirt_white)!.washReminder).toBe(false);
    expect(byId.get(ids.socks_grey)!.washReminder).toBe(true);
    expect(byId.get(ids.socks_grey)!.isPrivate).toBe(true);
    await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: look, requestId: "w2" });
    byId = await categories(t);
    expect(byId.get(ids.shirt_white)!.washReminder).toBe(true);
    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: ids.shirt_white, availability: "laundry" });
    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: ids.socks_grey, availability: "laundry" });
    await expect(t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: look, requestId: "w3" })).rejects.toThrow(/laundry/);
    const { items } = await t.mutation(api.closet.markWashed, { closetCode: A });
    expect(items.map((i) => i.itemId).sort()).toEqual([ids.shirt_white, ids.socks_grey].sort());
    for (const i of items) {
      expect(i.availability).toBe("available");
      expect(i.wearsSinceWash).toBe(0);
      expect(i.wearCount).toBe(2);
      expect(i.washReminder).toBe(false);
    }
    byId = await categories(t);
    expect(byId.get(ids.trousers_charcoal)!.wearsSinceWash).toBe(2);
  });

  test("One Piece, Three Ways reaches 3/3 on three distinct outfits with the same garment", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const confirm = (itemIds: Id<"items">[], requestId: string) => t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds, requestId });
    const jacket = (r: { challenge: { itemId: string; distinctOutfits: number; completed: boolean; target: number }[] }) => r.challenge.find((p) => p.itemId === ids.jacket_denim)!;
    const r1 = await confirm([ids.jacket_denim, ids.shirt_white, ids.trousers_charcoal, ids.boots_brown], "c1");
    expect(jacket(r1)).toMatchObject({ distinctOutfits: 1, target: 3, completed: false });
    const again = await confirm([ids.jacket_denim, ids.shirt_white, ids.trousers_charcoal, ids.boots_brown, ids.socks_grey], "c1b");
    expect(jacket(again).distinctOutfits).toBe(1);
    const r2 = await confirm([ids.jacket_denim, ids.tee_black, ids.chinos_khaki, ids.sneakers_white], "c2");
    expect(jacket(r2).distinctOutfits).toBe(2);
    const r3 = await confirm([ids.jacket_denim, ids.shirt_white, ids.chinos_khaki, ids.boots_brown], "c3");
    expect(jacket(r3)).toMatchObject({ distinctOutfits: 3, target: 3, completed: true });
    expect(r3.challenge[0].itemId).toBe(ids.jacket_denim);
    const board = await t.query(api.outfits.challenge, { closetCode: A });
    expect(board.find((p) => p.itemId === ids.jacket_denim)!.completed).toBe(true);
  });

  test("streak counts consecutive local days with a confirmed wear", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const look = [ids.shirt_white, ids.trousers_charcoal];
    expect((await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: look, requestId: "s1" })).streakDays).toBe(1);
    await t.run(async (ctx) => {
      const { ownerId, outfitId, itemIds, wornAt } = (await ctx.db.query("wearLogs").first())!;
      await ctx.db.insert("wearLogs", { ownerId, outfitId, itemIds, requestId: "s0", wornAt: wornAt - 86_400_000 });
      await ctx.db.insert("wearLogs", { ownerId, outfitId, itemIds, requestId: "s-gap", wornAt: wornAt - 3 * 86_400_000 });
    });
    expect((await t.query(api.outfits.streak, { closetCode: A })).streakDays).toBe(2);
  });

  test("tzOffsetMinutes is minutes east of UTC: -480 puts a wear just before Pacific midnight on the right day", () => {
    const pst = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h + 8, m);
    const lateNov14 = pst(14, 23, 50);
    const nov15 = pst(15, 10);
    expect(streakFromTimes([lateNov14, nov15], pst(15, 12), -480)).toBe(2);
    expect(streakFromTimes([lateNov14, nov15], pst(15, 12), 0)).toBe(1);
    const earlyNov14 = pst(14, 0, 10);
    expect(streakFromTimes([earlyNov14], pst(15, 23, 50), -480)).toBe(1);
    expect(streakFromTimes([earlyNov14], pst(15, 23, 50), 480)).toBe(0);
    expect(streakFromTimes([earlyNov14], pst(16, 0, 10), -480)).toBe(0);
  });

  test("items from another closet are rejected", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const other = await seed(t, B);
    await expect(t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: [ids.shirt_white, other.trousers_charcoal], requestId: "x" })).rejects.toThrow(/not found/i);
    await expect(t.mutation(api.closet.setStatus, { closetCode: A, itemId: other.shirt_white, availability: "laundry" })).rejects.toThrow(/not found/i);
    await expect(t.mutation(api.closet.markWashed, { closetCode: A, itemIds: [other.shirt_white] })).rejects.toThrow(/not found/i);
  });
});
