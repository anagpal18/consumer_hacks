/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jpegBlob, stubOpenAI } from "../tests/openaiStub";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("look-alike pieces in different frames are flagged even when the model doesn't link them", async () => {
  stubOpenAI([
    { category: "top", subtype: "t-shirt", color: "black", frameId: "f1" },
    { category: "top", subtype: "t-shirt", color: "black", frameId: "f2" },
    { category: "top", subtype: "t-shirt", color: "white", frameId: "f3" },
    { category: "bottom", subtype: "jeans", color: "black", frameId: "f1" },
  ]);
  const t = convexTest(schema, modules);
  const closetCode = "demo-dedupe";
  const frames = await t.run(async (ctx) => {
    const out = [];
    for (const [i, color] of [0x1e1e1eff, 0x2a2a2cff, 0xf1eee8ff].entries()) {
      out.push({ frameId: `f${i + 1}`, storageId: await ctx.storage.store(await jpegBlob(color)), timestampMs: i * 1000 });
    }
    return out;
  });
  const { scanId } = await t.mutation(api.scans.start, { closetCode, frames });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const review = await t.query(api.scans.get, { closetCode, scanId });
  expect(review.status).toBe("review");
  const [teeA, teeB, white, jeans] = review.candidates;
  expect(teeA.colorHex).toMatch(/^#/);
  expect(teeA.possibleDuplicateOf).toBe(teeB.candidateId);
  expect(teeB.possibleDuplicateOf).toBe(teeA.candidateId);
  expect(teeA.uncertain && teeB.uncertain).toBe(true);
  expect(white.uncertain).toBe(false);
  expect(jeans.possibleDuplicateOf).toBeUndefined();

  const { itemIds } = await t.mutation(api.scans.confirm, { closetCode, scanId, acceptedCandidateIds: [teeA.candidateId, white.candidateId], edits: [] });
  const closet = await t.query(api.closet.list, { closetCode });
  expect(closet.find((i) => i.itemId === itemIds[0])!.renderAssetKey).toBe("demo/tee-black");
  expect(closet.find((i) => i.itemId === itemIds[1])!.renderAssetKey).toBeUndefined();
});

test("demo:reset removes scans, candidates and files with the items", async () => {
  stubOpenAI([{ category: "top", subtype: "t-shirt", color: "black", frameId: "f1" }]);
  const t = convexTest(schema, modules);
  const closetCode = "demo-reset-check";
  const storageId = await t.run(async (ctx) => ctx.storage.store(await jpegBlob(0x1e1e1eff)));
  const { scanId } = await t.mutation(api.scans.start, { closetCode, frames: [{ frameId: "f1", storageId, timestampMs: 0 }] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const review = await t.query(api.scans.get, { closetCode, scanId });
  await t.mutation(api.scans.confirm, { closetCode, scanId, acceptedCandidateIds: [review.candidates[0].candidateId], edits: [] });
  await t.mutation(api.demo.reset, { closetCode });
  const left = await t.run(async (ctx) => ({
    scans: (await ctx.db.query("scans").collect()).length,
    candidates: (await ctx.db.query("candidates").collect()).length,
    items: (await ctx.db.query("items").collect()).length,
    media: (await ctx.db.query("media").collect()).length,
    frame: await ctx.db.system.get("_storage", storageId),
  }));
  expect(left).toEqual({ scans: 0, candidates: 0, items: 0, media: 0, frame: null });
});
