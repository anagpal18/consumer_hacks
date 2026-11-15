/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const A = "demo-closet-a";
const B = "demo-closet-b";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const makeT = () => convexTest(schema, modules);

async function seedReviewScan(t: ReturnType<typeof makeT>, closetCode: string) {
  await t.mutation(api.profiles.join, { closetCode });
  return await t.run(async (ctx) => {
    const profile = (await ctx.db
      .query("profiles")
      .withIndex("by_closetCode", (q) => q.eq("closetCode", closetCode))
      .unique())!;
    const storageId = await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" }));
    const scanId = await ctx.db.insert("scans", {
      ownerId: profile._id,
      status: "review",
      frames: [{ frameId: "f1", storageId, timestampMs: 0 }],
      attempts: 1,
    });
    const base = {
      ownerId: profile._id,
      scanId,
      attempt: 1,
      frameId: "f1",
      evidenceFrameIds: ["f1"],
      cropBox: { x: 0, y: 0, w: 1, h: 1 },
      confidence: 0.9,
      isPrivate: false,
    };
    const c1 = await ctx.db.insert("candidates", { ...base, index: 0, category: "top", subtype: "t-shirt", color: "black", uncertain: true, similarToIndexes: [1] });
    const c2 = await ctx.db.insert("candidates", { ...base, index: 1, category: "top", subtype: "t-shirt", color: "black", uncertain: true, similarToIndexes: [0] });
    const c3 = await ctx.db.insert("candidates", { ...base, index: 2, category: "socks", subtype: "crew socks", color: "grey", uncertain: false, similarToIndexes: [], isPrivate: true });
    return { scanId, candidates: [c1, c2, c3] };
  });
}

describe("scans:confirm", () => {
  test("is idempotent: double confirm creates one item per accepted candidate", async () => {
    const t = makeT();
    const { scanId, candidates } = await seedReviewScan(t, A);
    const review = await t.query(api.scans.get, { closetCode: A, scanId });
    expect(review.status).toBe("review");
    expect(review.candidates[0].possibleDuplicateOf).toBe(candidates[1]);

    const args = { closetCode: A, scanId, acceptedCandidateIds: [candidates[0], candidates[0], candidates[2]], edits: [{ candidateId: candidates[0], color: "navy" }] };
    const [first, second] = await Promise.all([t.mutation(api.scans.confirm, args), t.mutation(api.scans.confirm, args)]);
    const third = await t.mutation(api.scans.confirm, args);
    expect(first.itemIds).toHaveLength(2);
    expect(second.itemIds).toEqual(first.itemIds);
    expect(third.itemIds).toEqual(first.itemIds);
    expect(third.createdCount).toBe(0);

    const closet = await t.query(api.closet.list, { closetCode: A });
    expect(closet).toHaveLength(2);
    expect(closet.find((i) => i.category === "top")!.color).toBe("navy");
    expect(closet.find((i) => i.category === "socks")!.isPrivate).toBe(true);
    const after = await t.query(api.scans.get, { closetCode: A, scanId });
    expect(after.status).toBe("confirmed");
    expect(after.confirmedItemIds).toHaveLength(2);
  });

  test("merged candidates create no item of their own", async () => {
    const t = makeT();
    const { scanId, candidates } = await seedReviewScan(t, A);
    const res = await t.mutation(api.scans.confirm, {
      closetCode: A,
      scanId,
      acceptedCandidateIds: [candidates[0], candidates[1]],
      edits: [{ candidateId: candidates[1], mergeInto: candidates[0] }],
    });
    expect(res.itemIds).toHaveLength(1);
  });
});

describe("owner checks", () => {
  test("another closet cannot read, confirm or mutate", async () => {
    const t = makeT();
    const { scanId, candidates } = await seedReviewScan(t, A);
    await t.mutation(api.profiles.join, { closetCode: B });
    await expect(t.query(api.scans.get, { closetCode: B, scanId })).rejects.toThrow(/not found/i);
    await expect(
      t.mutation(api.scans.confirm, { closetCode: B, scanId, acceptedCandidateIds: candidates, edits: [] }),
    ).rejects.toThrow(/not found/i);

    const { items } = await t.mutation(api.demo.seed, { closetCode: A });
    const jacket = items.find((i) => i.demoKey === "jacket_denim")!.itemId;
    await expect(t.mutation(api.closet.setStatus, { closetCode: B, itemId: jacket, availability: "laundry" })).rejects.toThrow(/not found/i);
    await expect(t.mutation(api.closet.markWashed, { closetCode: B, itemIds: [jacket] })).rejects.toThrow(/not found/i);
    await expect(
      t.mutation(api.outfits.confirmWear, { closetCode: B, itemIds: [jacket], requestId: "r1" }),
    ).rejects.toThrow(/not found/i);
    await expect(t.action(api.stylist.suggest, { closetCode: B, prompt: "dinner", lockedItemIds: [jacket] })).rejects.toThrow(/not in this closet/i);
    expect(await t.query(api.closet.list, { closetCode: B })).toHaveLength(0);
  });

  test("scans:start claims frames per closet and validates type", async () => {
    const t = makeT();
    const [img, vid] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })),
      await ctx.storage.store(new Blob(["x"], { type: "video/mp4" })),
    ]);
    const started = await t.mutation(api.scans.start, { closetCode: A, frames: [{ frameId: "f1", storageId: img, timestampMs: 0 }] });
    expect(started.status).toBe("queued");
    await expect(
      t.mutation(api.scans.start, { closetCode: B, frames: [{ frameId: "f1", storageId: img, timestampMs: 0 }] }),
    ).rejects.toThrow(/another closet/i);
    await expect(
      t.mutation(api.scans.start, { closetCode: A, frames: [{ frameId: "f1", storageId: vid, timestampMs: 0 }] }),
    ).rejects.toThrow(/JPEG, PNG or WebP/);
  });
});

describe("laundry and styling", () => {
  test("an item in laundry is excluded and a locked piece stays", async () => {
    const t = makeT();
    const { items } = await t.mutation(api.demo.seed, { closetCode: A });
    const id = (k: string) => items.find((i) => i.demoKey === k)!.itemId as Id<"items">;
    const jacket = id("jacket_denim");

    const before = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [jacket], weather: { tempC: 12, condition: "clear" } });
    expect(before.source).toBe("fallback");
    expect(before.outfits.length).toBeGreaterThan(0);
    const shoes = before.outfits[0].itemIds.find((i) => i === id("sneakers_white") || i === id("boots_brown"))!;
    expect(shoes).toBeDefined();

    await t.mutation(api.closet.setStatus, { closetCode: A, itemId: shoes, availability: "laundry" });
    const kept = before.outfits[0].itemIds.filter((i) => i !== shoes);
    const after = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: kept });
    for (const o of after.outfits) {
      expect(o.itemIds).not.toContain(shoes);
      expect(o.itemIds).not.toContain(id("socks_grey"));
      for (const k of kept) expect(o.itemIds).toContain(k);
    }
    expect(after.outfits[0].itemIds).toHaveLength(before.outfits[0].itemIds.length);

    const locked = await t.action(api.stylist.suggest, { closetCode: A, prompt: "dinner", lockedItemIds: [jacket, shoes] });
    expect(locked.outfits).toHaveLength(0);
    expect(locked.lockedUnavailableItemIds).toEqual([shoes]);

    await expect(
      t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: [shoes], requestId: "laundry-wear" }),
    ).rejects.toThrow(/laundry/);

    const washed = await t.mutation(api.closet.markWashed, { closetCode: A });
    expect(washed.items.map((i) => i.itemId)).toEqual([shoes]);
    expect(washed.items[0].availability).toBe("available");
  });
});

describe("outfits:confirmWear", () => {
  test("the same requestId increments once; three distinct outfits complete the challenge", async () => {
    const t = makeT();
    const { items } = await t.mutation(api.demo.seed, { closetCode: A });
    const id = (k: string) => items.find((i) => i.demoKey === k)!.itemId as Id<"items">;
    const look = [id("jacket_denim"), id("shirt_white"), id("trousers_charcoal"), id("boots_brown")];

    const first = await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: look, requestId: "req-1" });
    const again = await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: look, requestId: "req-1" });
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.wear.wearId).toBe(first.wear.wearId);
    const jacket = (await t.query(api.closet.list, { closetCode: A })).find((i) => i.itemId === look[0])!;
    expect(jacket.wearCount).toBe(1);
    expect(jacket.wearsSinceWash).toBe(1);

    await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: [look[0], id("tee_black"), look[2], look[3]], requestId: "req-2" });
    const third = await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: [look[0], id("tee_black"), id("chinos_khaki"), id("sneakers_white")], requestId: "req-3" });
    const jacketProgress = third.challenge.find((c) => c.itemId === look[0])!;
    expect(jacketProgress).toEqual({ itemId: look[0], distinctOutfits: 3, target: 3, completed: true });
  });
});
