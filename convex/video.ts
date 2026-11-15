"use node";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";

export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
export const MAX_CLIP_MS = 60_000;
export const DEFAULT_MAX_FRAMES = 10;
export const MIN_GAP_MS = 700;
const FRAME_MAX_SIDE = 1280;
const SAMPLE_FPS = 5;
const SCORE_SIDE = 256;
const TOO_DARK_LUMA = 25;
const CONTAINER_BOXES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip"]);

export type VideoFrame = { frameId: string; storageId: Id<"_storage">; timestampMs: number };
export type FrameScore = { timestampMs: number; sharpness: number; luma: number; motion: number };

function videoError(code: string, message: string, retryable = false): never {
  throw new ConvexError({ code, message, retryable });
}

function ffmpeg(args: string[], maxBuffer = 16 * 1024 * 1024) {
  return new Promise<{ stdout: Buffer; stderr: string; code: number }>((resolve, reject) => {
    ffmpegBinary().then((bin) => {
      execFile(bin, ["-hide_banner", "-nostdin", ...args], { encoding: "buffer", maxBuffer }, (err, stdout, stderr) => {
        if (err && typeof err.code !== "number") return reject(err);
        resolve({ stdout, stderr: stderr.toString(), code: err ? Number(err.code) : 0 });
      });
    }, reject);
  });
}

let binary: Promise<string> | undefined;
function ffmpegBinary() {
  binary ??= (async () => {
    const dst = path.join(os.tmpdir(), "wear-again-ffmpeg");
    try {
      await fs.access(dst, fs.constants.X_OK);
      return dst;
    } catch {}
    const tmp = `${dst}.${randomUUID()}`;
    await fs.copyFile(ffmpegInstaller.path, tmp);
    await fs.chmod(tmp, 0o755);
    await fs.rename(tmp, dst);
    return dst;
  })();
  binary.catch(() => (binary = undefined));
  return binary;
}

export function scoreGrayFrame(px: Uint8Array, w: number, h: number) {
  let sum = 0;
  let sumSq = 0;
  let luma = 0;
  for (let i = 0; i < px.length; i++) luma += px[i];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * px[i] - px[i - 1] - px[i + 1] - px[i - w] - px[i + w];
      sum += lap;
      sumSq += lap * lap;
    }
  }
  const n = (w - 2) * (h - 2);
  const mean = sum / n;
  return { sharpness: sumSq / n - mean * mean, luma: luma / px.length };
}

export function meanAbsDiff(a: Uint8Array, b: Uint8Array) {
  let d = 0;
  for (let i = 0; i < a.length; i += 3) d += Math.abs(a[i] - b[i]);
  return d / Math.ceil(a.length / 3);
}

const quality = (s: FrameScore) => s.sharpness / (1 + s.motion);
const percentile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))];

export function pickFrames(scores: FrameScore[], maxFrames: number, durationMs: number): FrameScore[] {
  if (scores.length === 0) return [];
  const steadyMotion = Math.max(4, 1.5 * percentile(scores.map((s) => s.motion), 0.5));
  const sharpFloor = 0.1 * percentile(scores.map((s) => s.sharpness), 0.9);
  const usable = scores.filter((s) => s.motion <= steadyMotion && s.sharpness >= sharpFloor && s.luma >= TOO_DARK_LUMA / 2);
  const pool = usable.length > 0 ? usable : scores;
  const chosen: FrameScore[] = [];
  const fits = (s: FrameScore) => chosen.every((c) => Math.abs(c.timestampMs - s.timestampMs) >= MIN_GAP_MS);
  const bins = Array.from({ length: maxFrames }, (_, b) =>
    pool
      .filter((s) => Math.min(maxFrames - 1, Math.floor((s.timestampMs / Math.max(durationMs, 1)) * maxFrames)) === b)
      .sort((a, b2) => quality(b2) - quality(a)),
  ).sort((a, b) => (b[0] ? quality(b[0]) : -1) - (a[0] ? quality(a[0]) : -1));
  for (const bin of bins) {
    const best = bin.find(fits);
    if (best) chosen.push(best);
  }
  for (const s of [...pool].sort((a, b) => quality(b) - quality(a))) {
    if (chosen.length >= maxFrames) break;
    if (!chosen.includes(s) && fits(s)) chosen.push(s);
  }
  return chosen.sort((a, b) => a.timestampMs - b.timestampMs);
}

function parseDurationMs(stderr: string) {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : null;
}

export async function extractFramesFromVideo(
  ctx: ActionCtx,
  videoStorageId: Id<"_storage">,
  maxFrames = DEFAULT_MAX_FRAMES,
): Promise<VideoFrame[]> {
  const started = Date.now();
  const limit = Math.max(1, Math.min(16, Math.round(maxFrames)));
  const blob = await ctx.storage.get(videoStorageId);
  if (!blob) videoError("BAD_VIDEO", "The uploaded clip was not found. Upload it again.");
  if (blob.size > MAX_CLIP_BYTES) videoError("VIDEO_TOO_LARGE", "The clip is larger than 50 MB. Record a shorter clip.");
  if (blob.type && !/^(video\/(mp4|quicktime|x-m4v)|application\/octet-stream)$/.test(blob.type)) {
    videoError("BAD_VIDEO", `Upload an MP4 or MOV clip, got '${blob.type}'.`);
  }
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length < 12 || !CONTAINER_BOXES.has(bytes.toString("latin1", 4, 8))) {
    videoError("BAD_VIDEO", "Upload an MP4 or MOV clip.");
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-"));
  try {
    const file = path.join(dir, "clip");
    await fs.writeFile(file, bytes);

    const info = await ffmpeg(["-i", file]);
    const durationMs = parseDurationMs(info.stderr);
    if (!/Stream #\S+.*Video:/.test(info.stderr) || durationMs === null) {
      videoError("BAD_VIDEO", "The clip could not be read as a video. Record it again.");
    }
    if (durationMs > MAX_CLIP_MS + 500) videoError("VIDEO_TOO_LONG", "The clip is longer than 60 seconds. Record a shorter clip.");

    const frameBytes = SCORE_SIDE * SCORE_SIDE;
    const sampled = await ffmpeg(
      ["-v", "error", "-i", file, "-an", "-vf", `fps=${SAMPLE_FPS},scale=${SCORE_SIDE}:${SCORE_SIDE},format=gray`, "-f", "rawvideo", "-"],
      Math.ceil(((MAX_CLIP_MS / 1000) * SAMPLE_FPS + 20) * frameBytes),
    );
    if (sampled.code !== 0 || sampled.stdout.length < frameBytes) {
      videoError("BAD_VIDEO", "The clip could not be decoded. Record it again as MP4 or MOV.");
    }
    const count = Math.floor(sampled.stdout.length / frameBytes);
    const gray = Array.from({ length: count }, (_, n) => sampled.stdout.subarray(n * frameBytes, (n + 1) * frameBytes));
    const scores: FrameScore[] = gray.map((px, n) => ({
      timestampMs: Math.round((n * 1000) / SAMPLE_FPS),
      ...scoreGrayFrame(px, SCORE_SIDE, SCORE_SIDE),
      motion: Math.max(n > 0 ? meanAbsDiff(px, gray[n - 1]) : 0, n + 1 < count ? meanAbsDiff(px, gray[n + 1]) : 0),
    }));
    const lumas = scores.map((s) => s.luma).sort((a, b) => a - b);
    if (lumas[Math.floor(lumas.length / 2)] < TOO_DARK_LUMA) {
      videoError("TOO_DARK", "The clip was too dark to read. Try again near a window.", true);
    }

    const picked = pickFrames(scores, limit, durationMs);
    const scale = `scale='min(${FRAME_MAX_SIDE},iw)':'min(${FRAME_MAX_SIDE},ih)':force_original_aspect_ratio=decrease,format=yuvj420p`;
    const frames: VideoFrame[] = [];
    for (const [i, p] of picked.entries()) {
      const out = await ffmpeg(
        ["-v", "error", "-ss", (p.timestampMs / 1000).toFixed(3), "-i", file, "-frames:v", "1", "-an", "-vf", scale, "-q:v", "3", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
      );
      if (out.code !== 0 || out.stdout.length === 0) continue;
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(out.stdout)], { type: "image/jpeg" }));
      frames.push({ frameId: `f${i + 1}`, storageId, timestampMs: p.timestampMs });
    }
    if (frames.length === 0) videoError("BAD_VIDEO", "No usable frames were found in the clip. Record it again.");
    console.log(
      `extractFrames: ${durationMs}ms clip, ${scores.length} sampled, ${frames.length} kept at [${frames.map((f) => f.timestampMs).join(", ")}] in ${Date.now() - started}ms`,
    );
    return frames;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const extractFrames = internalAction({
  args: { videoStorageId: v.id("_storage"), maxFrames: v.optional(v.number()) },
  handler: async (ctx, args): Promise<VideoFrame[]> => extractFramesFromVideo(ctx, args.videoStorageId, args.maxFrames),
});
