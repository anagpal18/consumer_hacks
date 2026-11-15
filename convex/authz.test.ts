/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { jpegBlob, stubOpenAI } from "../tests/openaiStub";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const A = "demo-authz-a";
const B = "demo-authz-b";

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

const makeT = () => convexTest(schema, modules);

async function storageCount(t: ReturnType<typeof makeT>) {
  return await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);
}

describe("privacy defaults", () => {
  test("socks and underwear are private when added by hand or seeded", async () => {
    const t = makeT();
    const added = await t.mutation(api.closet.addItem, { closetCode: A, category: "underwear", color: "black" });
    expect(added.isPrivate).toBe(true);
    const { items } = await t.mutation(api.demo.seed, { closetCode: A });
    expect(items.find((i) => i.category === "socks")!.isPrivate).toBe(true);
    expect(items.filter((i) => i.isPrivate).every((i) => i.category === "socks")).toBe(true);
  });

  test("recategorizing an item as underwear makes it private", async () => {
    const t = makeT();
    const top = await t.mutation(api.closet.addItem, { closetCode: A, category: "top", color: "black" });
    const edited = await t.mutation(api.closet.updateItem, { closetCode: A, itemId: top.itemId, category: "underwear" });
    expect(edited.isPrivate).toBe(true);
  });

  test("private pieces are never styled, locked or counted in challenge progress", async () => {
    const t = makeT();
    const { items } = await t.mutation(api.demo.seed, { closetCode: A });
    const socks = items.find((i) => i.category === "socks")!.itemId as Id<"items">;
    const res = await t.action(api.stylist.suggest, { closetCode: A, prompt: "gym", lockedItemIds: [] });
    for (const o of res.outfits) expect(o.itemIds).not.toContain(socks);
    await expect(t.action(api.stylist.suggest, { closetCode: A, prompt: "gym", lockedItemIds: [socks] })).rejects.toThrow();
    const tee = items.find((i) => i.category === "top")!.itemId as Id<"items">;
    const wear = await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: [tee, socks], requestId: "w1" });
    expect(wear.challenge.map((c) => c.itemId)).not.toContain(socks);
    expect((await t.query(api.outfits.challenge, { closetCode: A })).map((c) => c.itemId)).not.toContain(socks);
  });
});

describe("ownership", () => {
  test("wear request ids are namespaced per closet", async () => {
    const t = makeT();
    const a = await t.mutation(api.closet.addItem, { closetCode: A, category: "top", color: "black" });
    const b = await t.mutation(api.closet.addItem, { closetCode: B, category: "top", color: "white" });
    const wa = await t.mutation(api.outfits.confirmWear, { closetCode: A, itemIds: [a.itemId], requestId: "same" });
    const wb = await t.mutation(api.outfits.confirmWear, { closetCode: B, itemIds: [b.itemId], requestId: "same" });
    expect(wb.duplicate).toBe(false);
    expect(wb.wear.wearId).not.toBe(wa.wear.wearId);
    expect(wb.wear.itemIds).toEqual([b.itemId]);
  });

  test("confirm only accepts candidates of the scan being confirmed", async () => {
    stubOpenAI([{ category: "top", subtype: "t-shirt", color: "black", frameId: "f1" }]);
    const t = makeT();
    const scanIds: Id<"scans">[] = [];
    for (let i = 0; i < 2; i++) {
      const storageId = await t.run(async (ctx) => ctx.storage.store(await jpegBlob()));
      const s = await t.mutation(api.scans.start, { closetCode: A, frames: [{ frameId: "f1", storageId, timestampMs: 0 }] });
      scanIds.push(s.scanId);
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const other = await t.query(api.scans.get, { closetCode: A, scanId: scanIds[1] });
    await expect(
      t.mutation(api.scans.confirm, { closetCode: A, scanId: scanIds[0], acceptedCandidateIds: [other.candidates[0].candidateId], edits: [] }),
    ).rejects.toThrow(/does not belong/i);
  });

  test("closet codes must be well formed", async () => {
    const t = makeT();
    await expect(t.mutation(api.profiles.join, { closetCode: "ab" })).rejects.toThrow(/closet code/i);
    await expect(t.query(api.closet.list, { closetCode: "../x" })).rejects.toThrow(/closet code/i);
  });

  test("demo reset only works on demo closets", async () => {
    const t = makeT();
    await t.mutation(api.profiles.join, { closetCode: "real-closet" });
    await expect(t.mutation(api.demo.reset, { closetCode: "real-closet" })).rejects.toThrow(/demo/);
  });
});

describe("upload limits", () => {
  test("frames must be small images and clips must be videos", async () => {
    const t = makeT();
    const [gif, huge, img, notVideo] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["GIF89a"], { type: "image/gif" })),
      await ctx.storage.store(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/jpeg" })),
      await ctx.storage.store(await jpegBlob()),
      await ctx.storage.store(new Blob(["x"], { type: "application/pdf" })),
    ]);
    const frame = (storageId: Id<"_storage">, frameId = "f1") => ({ frameId, storageId, timestampMs: 0 });
    await expect(t.mutation(api.scans.start, { closetCode: A, frames: [frame(gif)] })).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(t.mutation(api.scans.start, { closetCode: A, frames: [frame(huge)] })).rejects.toThrow(/10 MB/);
    await expect(t.mutation(api.scans.start, { closetCode: A, frames: [frame(img)], videoStorageId: notVideo })).rejects.toThrow(/video/);
    await expect(
      t.mutation(api.scans.start, { closetCode: A, frames: Array.from({ length: 17 }, (_, i) => frame(img, `f${i}`)) }),
    ).rejects.toThrow(/at most 16/);
    await expect(t.mutation(api.scans.start, { closetCode: A, frames: [] })).rejects.toThrow(/frames/);
    await expect(t.mutation(api.closet.addItem, { closetCode: A, category: "top", color: "red", photoStorageId: notVideo })).rejects.toThrow(/JPEG, PNG or WebP/);
  });
});

describe("deletion with stored media", () => {
  test("privacy:deleteScan removes frames, clip, unconfirmed crops and candidates but keeps confirmed item photos", async () => {
    stubOpenAI([
      { category: "outerwear", subtype: "denim jacket", color: "indigo", frameId: "f1" },
      { category: "underwear", subtype: "boxer briefs", color: "black", frameId: "f2" },
    ]);
    const t = makeT();
    const { frames, video } = await t.run(async (ctx) => ({
      frames: [
        { frameId: "f1", storageId: await ctx.storage.store(await jpegBlob(0x3f5878ff)), timestampMs: 0 },
        { frameId: "f2", storageId: await ctx.storage.store(await jpegBlob(0x111111ff)), timestampMs: 900 },
      ],
      video: await ctx.storage.store(new Blob(["mp4"], { type: "video/mp4" })),
    }));
    const { scanId } = await t.mutation(api.scans.start, { closetCode: A, frames, videoStorageId: video });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const review = await t.query(api.scans.get, { closetCode: A, scanId });
    expect(review.candidates).toHaveLength(2);
    const jacket = review.candidates.find((c) => c.category === "outerwear")!;
    const { itemIds } = await t.mutation(api.scans.confirm, { closetCode: A, scanId, acceptedCandidateIds: [jacket.candidateId], edits: [] });
    expect(await storageCount(t)).toBe(5);

    const res = await t.mutation(api.privacy.deleteScan, { closetCode: A, scanId });
    expect(res).toMatchObject({ deletedCandidates: 2, deletedFiles: 4, keptItemPhotos: 1 });
    expect(await storageCount(t)).toBe(1);
    await expect(t.query(api.scans.get, { closetCode: A, scanId })).rejects.toThrow(/not found/i);
    expect(await t.query(api.scans.list, { closetCode: A })).toEqual([]);
    const item = await t.query(api.closet.get, { closetCode: A, itemId: itemIds[0] });
    expect(item.media.url).toMatch(/^https?:/);
    const leftovers = await t.run(async (ctx) => ({
      candidates: (await ctx.db.query("candidates").collect()).length,
      media: (await ctx.db.query("media").collect()).map((m) => m.kind),
    }));
    expect(leftovers).toEqual({ candidates: 0, media: ["crop"] });

    await t.mutation(api.closet.deleteItem, { closetCode: A, itemId: itemIds[0] });
    expect(await storageCount(t)).toBe(0);
    expect(await t.query(api.closet.list, { closetCode: A })).toEqual([]);
  });

  test("deleting a scan never deletes a file another closet owns", async () => {
    const t = makeT();
    await t.mutation(api.profiles.join, { closetCode: B });
    const shared = await t.run(async (ctx) => ctx.storage.store(await jpegBlob()));
    await t.mutation(api.closet.addItem, { closetCode: B, category: "top", color: "red", photoStorageId: shared });
    const scanId = await t.run(async (ctx) => {
      const a = await ctx.db.insert("profiles", { closetCode: A });
      return await ctx.db.insert("scans", { ownerId: a, status: "failed", frames: [{ frameId: "f1", storageId: shared, timestampMs: 0 }], attempts: 1 });
    });
    const res = await t.mutation(api.privacy.deleteScan, { closetCode: A, scanId });
    expect(res.deletedFiles).toBe(0);
    expect(await storageCount(t)).toBe(1);
  });
});
