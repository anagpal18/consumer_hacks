/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { jpegBlob, stubOpenAI } from "../tests/openaiStub";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const CLOSET = "demo-stage";
const OTHER = "demo-intruder";

const DETECTED = [
  { category: "outerwear", subtype: "denim jacket", color: "indigo", frameId: "f1" },
  { category: "top", subtype: "t-shirt", color: "black", frameId: "f2", similarTo: [2], needsReview: true },
  { category: "top", subtype: "t-shirt", color: "black", frameId: "f3", similarTo: [1], needsReview: true },
  { category: "top", subtype: "oxford shirt", color: "white", frameId: "f2" },
  { category: "bottom", subtype: "jeans", color: "blue", frameId: "f3" },
  { category: "bottom", subtype: "chinos", color: "khaki", frameId: "f3", alsoSeenIn: ["f4"] },
  { category: "shoes", subtype: "sneakers", color: "white", frameId: "f4" },
  { category: "shoes", subtype: "boots", color: "brown", frameId: "f4" },
  { category: "socks", subtype: "crew socks", color: "grey", frameId: "f4" },
  { category: "underwear", subtype: "boxer briefs", color: "black", frameId: "f4" },
  { category: "top", subtype: "hoodie", color: "red", frameId: "f99" },
];

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("no network in tests");
  }));
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function scanToReview(t: ReturnType<typeof convexTest>, closetCode: string) {
  await t.mutation(api.profiles.join, { closetCode });
  const frames = await t.run(async (ctx) => {
    const out = [];
    for (const [i, color] of [0x3f5878ff, 0x1e1e1eff, 0x6b4630ff, 0xedeae4ff].entries()) {
      out.push({ frameId: `f${i + 1}`, storageId: await ctx.storage.store(await jpegBlob(color)), timestampMs: 800 + i * 1500 });
    }
    return out;
  });
  const started = await t.mutation(api.scans.start, { closetCode, frames });
  expect(started.status).toBe("queued");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return { scanId: started.scanId, frames };
}

describe("60-second stage flow", () => {
  test("scan, review, double-tap confirm, dinner look, laundry swap, idempotent wear, challenge", async () => {
    const calls = stubOpenAI(DETECTED);
    const t = convexTest(schema, modules);

    const { scanId } = await scanToReview(t, CLOSET);
    expect(calls.detect).toBe(1);
    const review = await t.query(api.scans.get, { closetCode: CLOSET, scanId });
    expect(review.status).toBe("review");
    expect(review.candidates).toHaveLength(10);
    for (const c of review.candidates) {
      expect(c.crop.url).toMatch(/^https?:/);
    }
    const tees = review.candidates.filter((c) => c.subtype === "t-shirt");
    expect(tees).toHaveLength(2);
    expect(tees[0].uncertain).toBe(true);
    expect(tees[0].possibleDuplicateOf).toBe(tees[1].candidateId);
    const byType = (s: string) => review.candidates.find((c) => c.subtype === s)!;
    expect(byType("crew socks").isPrivate).toBe(true);
    expect(byType("boxer briefs").isPrivate).toBe(true);
    expect(byType("chinos").evidenceFrameIds).toEqual(["f3", "f4"]);

    const accepted = review.candidates.map((c) => c.candidateId);
    const confirmArgs = {
      closetCode: CLOSET,
      scanId,
      acceptedCandidateIds: accepted,
      edits: [{ candidateId: tees[1].candidateId, mergeInto: tees[0].candidateId }],
    };
    const [tap1, tap2] = await Promise.all([
      t.mutation(api.scans.confirm, confirmArgs),
      t.mutation(api.scans.confirm, confirmArgs),
    ]);
    expect(tap1.itemIds).toHaveLength(9);
    expect(new Set(tap1.itemIds).size).toBe(9);
    expect(tap2.itemIds).toEqual(tap1.itemIds);
    expect(tap1.createdCount + tap2.createdCount).toBe(9);
    const closet = await t.query(api.closet.list, { closetCode: CLOSET });
    expect(closet).toHaveLength(9);
    const sources = await t.run(async (ctx) => (await ctx.db.query("items").collect()).map((i) => i.sourceCandidateId));
    expect(new Set(sources).size).toBe(9);
    expect(sources).not.toContain(tees[1].candidateId);
    const item = (subtype: string) => closet.find((i) => i.subtype === subtype)!.itemId as Id<"items">;
    const jacket = item("denim jacket");

    const dinner = await t.action(api.stylist.suggest, { closetCode: CLOSET, prompt: "dinner", lockedItemIds: [jacket] });
    expect(dinner.source).toBe("model");
    expect(calls.stylist).toBe(1);
    const look = dinner.outfits[0].itemIds as Id<"items">[];
    expect(look).toContain(jacket);
    expect(look).not.toContain(item("crew socks"));
    expect(look).not.toContain(item("boxer briefs"));
    const shoes = look.find((id) => id === item("sneakers") || id === item("boots"))!;
    expect(shoes).toBeDefined();

    const secondDevice = { closetCode: CLOSET };
    await t.mutation(api.closet.setStatus, { ...secondDevice, itemId: shoes, availability: "laundry" });

    const recomputed = await t.action(api.stylist.suggest, { closetCode: CLOSET, prompt: "dinner", lockedItemIds: [jacket], currentItemIds: look });
    const next = recomputed.outfits[0].itemIds as Id<"items">[];
    expect(recomputed.outfits[0].swaps).toEqual([{ from: shoes, to: next.find((id) => !look.includes(id)) }]);
    expect(next).toContain(jacket);
    expect(next).not.toContain(shoes);
    expect(next.filter((id) => !look.includes(id))).toHaveLength(1);
    expect(look.filter((id) => !next.includes(id))).toEqual([shoes]);

    const wearArgs = { closetCode: CLOSET, itemIds: next, requestId: "stage-wear-1", outfitId: recomputed.outfits[0].outfitId, occasion: "dinner" };
    const first = await t.mutation(api.outfits.confirmWear, wearArgs);
    const again = await t.mutation(api.outfits.confirmWear, wearArgs);
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.wear.wearId).toBe(first.wear.wearId);
    const after = await t.query(api.closet.list, { closetCode: CLOSET });
    for (const id of next) {
      const worn = after.find((i) => i.itemId === id)!;
      expect(worn.wearCount).toBe(1);
      expect(worn.wearsSinceWash).toBe(1);
    }
    expect(after.find((i) => i.itemId === shoes)!.wearCount).toBe(0);
    expect(await t.query(api.outfits.recentWears, { closetCode: CLOSET })).toHaveLength(1);

    const jacketProgress = first.challenge.find((c) => c.itemId === jacket)!;
    expect(jacketProgress).toEqual({ itemId: jacket, distinctOutfits: 1, target: 3, completed: false });
    const challenge = await t.query(api.outfits.challenge, { closetCode: CLOSET });
    expect(challenge.find((c) => c.itemId === jacket)!.distinctOutfits).toBe(1);
  });

  test("a different closet cannot read private media or touch items it does not own", async () => {
    stubOpenAI(DETECTED);
    const t = convexTest(schema, modules);
    const { scanId, frames } = await scanToReview(t, CLOSET);
    const review = await t.query(api.scans.get, { closetCode: CLOSET, scanId });
    const socks = review.candidates.find((c) => c.subtype === "crew socks")!;
    const { itemIds } = await t.mutation(api.scans.confirm, {
      closetCode: CLOSET,
      scanId,
      acceptedCandidateIds: [socks.candidateId],
      edits: [],
    });
    const socksItem = itemIds[0] as Id<"items">;
    await t.mutation(api.profiles.join, { closetCode: OTHER });

    await expect(t.query(api.scans.get, { closetCode: OTHER, scanId })).rejects.toThrow(/not found/i);
    await expect(t.query(api.closet.get, { closetCode: OTHER, itemId: socksItem })).rejects.toThrow(/not found/i);
    expect(await t.query(api.closet.list, { closetCode: OTHER })).toEqual([]);
    expect(await t.query(api.scans.list, { closetCode: OTHER })).toEqual([]);
    expect(await t.query(api.outfits.recentWears, { closetCode: OTHER })).toEqual([]);

    await expect(
      t.mutation(api.scans.start, { closetCode: OTHER, frames: [frames[0]] }),
    ).rejects.toThrow(/another closet/i);
    await expect(
      t.mutation(api.closet.addItem, { closetCode: OTHER, category: "socks", color: "grey", photoStorageId: socks.crop.storageId as Id<"_storage"> }),
    ).rejects.toThrow(/another closet/i);

    const denied = [
      t.mutation(api.closet.setStatus, { closetCode: OTHER, itemId: socksItem, availability: "retired" }),
      t.mutation(api.closet.updateItem, { closetCode: OTHER, itemId: socksItem, isPrivate: false }),
      t.mutation(api.closet.setRenderAssetKey, { closetCode: OTHER, itemId: socksItem, renderAssetKey: "x" }),
      t.mutation(api.closet.markWashed, { closetCode: OTHER, itemIds: [socksItem] }),
      t.mutation(api.closet.deleteItem, { closetCode: OTHER, itemId: socksItem }),
      t.mutation(api.outfits.confirmWear, { closetCode: OTHER, itemIds: [socksItem], requestId: "x" }),
      t.mutation(api.scans.retry, { closetCode: OTHER, scanId }),
      t.mutation(api.scans.confirm, { closetCode: OTHER, scanId, acceptedCandidateIds: [socks.candidateId], edits: [] }),
      t.mutation(api.privacy.deleteScan, { closetCode: OTHER, scanId }),
    ];
    for (const p of denied) await expect(p).rejects.toThrow(/not found/i);
    await expect(
      t.action(api.stylist.suggest, { closetCode: OTHER, prompt: "dinner", lockedItemIds: [socksItem] }),
    ).rejects.toThrow(/not in this closet/i);

    const untouched = await t.query(api.closet.get, { closetCode: CLOSET, itemId: socksItem });
    expect(untouched).toMatchObject({ availability: "available", isPrivate: true, wearCount: 0 });
    expect(untouched.media.url).toMatch(/^https?:/);
  });
});
