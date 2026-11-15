// @vitest-environment node
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { Jimp } from "jimp";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { MIN_GAP_MS, pickFrames, type FrameScore } from "./video";

const modules = import.meta.glob("./**/*.ts");
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

async function store(t: ReturnType<typeof convexTest>, bytes: Uint8Array, type: string) {
  return await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
}

async function errorCode(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof ConvexError ? (e.data as { code: string }).code : String(e);
  }
  return "no error";
}

describe("video.extractFrames", () => {
  test("picks sharp, spread-out JPEG frames from the closet fixture", { timeout: 60_000 }, async () => {
    const t = convexTest(schema, modules);
    const videoStorageId = await store(t, fixture("closet-demo.mp4"), "video/mp4");
    const frames = await t.action(internal.video.extractFrames, { videoStorageId });

    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.length).toBeLessThanOrEqual(10);
    expect(frames.map((f) => f.frameId)).toEqual(frames.map((_, i) => `f${i + 1}`));
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].timestampMs - frames[i - 1].timestampMs).toBeGreaterThanOrEqual(MIN_GAP_MS);
    }
    const holds = [[0, 1500], [1900, 3000], [3400, 4500], [4900, 6000], [6400, 7500], [7900, 9000], [9400, 10500], [10900, 12400]];
    for (const [from, to] of holds) {
      expect(frames.some((f) => f.timestampMs >= from && f.timestampMs <= to)).toBe(true);
    }
    for (const f of frames) {
      const stored = await t.run(async (ctx) => {
        const blob = await ctx.storage.get(f.storageId);
        const img = await Jimp.read(Buffer.from(await blob!.arrayBuffer()));
        return { type: blob!.type, longSide: Math.max(img.width, img.height) };
      });
      expect(stored.type).toBe("image/jpeg");
      expect(stored.longSide).toBeLessThanOrEqual(1280);
    }
  });

  test("respects maxFrames", { timeout: 60_000 }, async () => {
    const t = convexTest(schema, modules);
    const videoStorageId = await store(t, fixture("closet-demo.mp4"), "video/mp4");
    const frames = await t.action(internal.video.extractFrames, { videoStorageId, maxFrames: 4 });
    expect(frames).toHaveLength(4);
  });

  test("rejects files that are not MP4 or MOV", async () => {
    const t = convexTest(schema, modules);
    const wrongType = await store(t, fixture("closet-demo.mp4"), "image/gif");
    expect(await errorCode(t.action(internal.video.extractFrames, { videoStorageId: wrongType }))).toBe("BAD_VIDEO");
    const notVideo = await store(t, new TextEncoder().encode("definitely not a video file"), "video/mp4");
    expect(await errorCode(t.action(internal.video.extractFrames, { videoStorageId: notVideo }))).toBe("BAD_VIDEO");
  });

  test("rejects clips over 60 seconds or 50 MB", { timeout: 30_000 }, async () => {
    const t = convexTest(schema, modules);
    const long = await store(t, fixture("too-long.mp4"), "video/mp4");
    expect(await errorCode(t.action(internal.video.extractFrames, { videoStorageId: long }))).toBe("VIDEO_TOO_LONG");
    const big = await store(t, new Uint8Array(51 * 1024 * 1024), "video/mp4");
    expect(await errorCode(t.action(internal.video.extractFrames, { videoStorageId: big }))).toBe("VIDEO_TOO_LARGE");
  });
});

describe("pickFrames", () => {
  test("skips moving frames and keeps picks at least MIN_GAP_MS apart", () => {
    const scores: FrameScore[] = Array.from({ length: 50 }, (_, n) => {
      const moving = n % 10 >= 7;
      return { timestampMs: n * 200, sharpness: moving ? 900 : 300 + (n % 3), luma: 120, motion: moving ? 30 : 1 };
    });
    const picked = pickFrames(scores, 10, 10_000);
    expect(picked.length).toBeGreaterThanOrEqual(5);
    expect(picked.every((p) => p.motion === 1)).toBe(true);
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i].timestampMs - picked[i - 1].timestampMs).toBeGreaterThanOrEqual(MIN_GAP_MS);
    }
  });
});
