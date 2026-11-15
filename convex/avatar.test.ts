/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { Jimp } from "jimp";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const A = "demo-avatar-a";
const B = "demo-avatar-b";

const VALID = {
  usable: true,
  reason: "",
  sex: "male",
  build: "broad",
  proportions: { head: 0.1, chest: 0.4, arms: 0.2, waist: -0.1, hips: 0, shoulders: 0.5 },
  faceBox: { found: true, x: 0.5, y: 0, w: 0.5, h: 0.5 },
  confidence: 0.8,
};

function stubModel(reply: unknown | Error) {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const fetchMock = vi.fn(async () => {
    if (reply instanceof Error) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reply) }] }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function uploadPhoto(t: ReturnType<typeof convexTest>) {
  const img = new Jimp({ width: 40, height: 40, color: 0x202020ff });
  for (let y = 0; y < 20; y++) for (let x = 20; x < 40; x++) img.setPixelColor(0xc68c6aff, x, y);
  const blob = new Blob([new Uint8Array(await img.getBuffer("image/png"))], { type: "image/png" });
  return await t.run(async (ctx) => ctx.storage.store(blob));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("avatar:estimateBody", () => {
  test("valid model output passes through; sex and height from the user win; skin tone comes from pixels", async () => {
    const fetchMock = stubModel(VALID);
    const t = convexTest(schema, modules);
    const photoStorageId = await uploadPhoto(t);
    const res = await t.action(api.avatar.estimateBody, { closetCode: A, photoStorageId, heightCm: 172, sex: "female" });
    expect(res.body).toEqual({
      sex: "female",
      preset: "broad",
      skinTone: "#c68c6a",
      heightCm: 172,
      proportions: VALID.proportions,
    });
    expect(res.confidence).toBe(0.8);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(JSON.stringify(sent.input)).toContain("sex: female, height: 172 cm");
    const profile = await t.query(api.profiles.get, { closetCode: A });
    expect(profile?.hasBodyPhoto).toBe(true);
    expect(profile?.bodyEstimate?.body.preset).toBe("broad");
  });

  test("out-of-range values are clamped and unknown enums fall back", async () => {
    stubModel({
      ...VALID,
      build: "huge",
      proportions: { head: 5, chest: -9, arms: 1.5, waist: -1.2, hips: 0.333, shoulders: 0 },
      faceBox: { found: true, x: -1, y: -1, w: 9, h: 0.5 },
      confidence: 3,
    });
    const t = convexTest(schema, modules);
    const photoStorageId = await uploadPhoto(t);
    const res = await t.action(api.avatar.estimateBody, { closetCode: A, photoStorageId });
    expect(res.body.preset).toBe("average");
    expect(res.body.sex).toBe("male");
    expect(res.body.proportions).toEqual({ head: 1, chest: -1, arms: 1, waist: -1, hips: 0.33, shoulders: 0 });
    expect(res.confidence).toBe(1);
    expect(res.body.skinTone).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("a model failure or an unusable photo returns the average preset instead of throwing", async () => {
    stubModel(new Error("down"));
    const t = convexTest(schema, modules);
    const photoStorageId = await uploadPhoto(t);
    const failed = await t.action(api.avatar.estimateBody, { closetCode: A, photoStorageId, heightCm: 180 });
    expect(failed.body).toEqual({
      sex: "unspecified",
      preset: "average",
      skinTone: null,
      heightCm: 180,
      proportions: { head: 0, chest: 0, arms: 0, waist: 0, hips: 0, shoulders: 0 },
    });
    expect(failed.confidence).toBeLessThan(0.3);
    expect(failed.notes).toMatch(/average/);

    stubModel({ ...VALID, usable: false, reason: "Only the face is visible." });
    const unusable = await t.action(api.avatar.estimateBody, { closetCode: A, photoStorageId });
    expect(unusable.body.preset).toBe("average");
    expect(unusable.notes).toBe("Only the face is visible.");
  });

  test("another closet cannot use the photo, and deleteBodyPhoto removes it", async () => {
    stubModel(VALID);
    const t = convexTest(schema, modules);
    const photoStorageId = await uploadPhoto(t);
    await t.action(api.avatar.estimateBody, { closetCode: A, photoStorageId });
    await expect(t.action(api.avatar.estimateBody, { closetCode: B, photoStorageId })).rejects.toThrow(/another closet/);
    await t.mutation(api.profiles.join, { closetCode: B });
    expect(await t.mutation(api.privacy.deleteBodyPhoto, { closetCode: B })).toEqual({ deleted: true, deletedFiles: 0 });
    expect(await t.run(async (ctx) => ctx.db.system.get("_storage", photoStorageId))).not.toBeNull();

    expect(await t.mutation(api.privacy.deleteBodyPhoto, { closetCode: A })).toEqual({ deleted: true, deletedFiles: 1 });
    const left = await t.run(async (ctx) => ({
      file: await ctx.db.system.get("_storage", photoStorageId),
      media: (await ctx.db.query("media").collect()).length,
    }));
    expect(left).toEqual({ file: null, media: 0 });
    expect((await t.query(api.profiles.get, { closetCode: A }))?.hasBodyPhoto).toBe(false);
  });
});
