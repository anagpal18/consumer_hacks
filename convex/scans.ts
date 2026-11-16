import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { category, cropBox, frame, pattern, scanError } from "./schema";
import {
  checkClosetCode,
  claimMedia,
  defaultName,
  ensureProfile,
  fail,
  findProfile,
  MAX_FRAMES,
  PRIVATE_CATEGORIES,
  requireOwnedScan,
  requireProfile,
} from "./lib";
import { matchRenderAsset } from "./renderAssets";

const STUCK_AFTER_MS = 5 * 60 * 1000;

async function candidateView(ctx: QueryCtx, c: Doc<"candidates">, idByIndex: Map<number, Id<"candidates">>) {
  const similarTo = c.similarToIndexes
    .map((i) => idByIndex.get(i))
    .filter((id): id is Id<"candidates"> => !!id && id !== c._id);
  return {
    candidateId: c._id,
    category: c.category,
    subtype: c.subtype,
    color: c.color,
    pattern: c.pattern,
    colorHex: c.colorHex,
    crop: {
      url: c.cropStorageId ? await ctx.storage.getUrl(c.cropStorageId) : null,
      storageId: c.cropStorageId,
    },
    frameId: c.frameId,
    uncertain: c.uncertain,
    uncertainReason: c.reviewReason,
    possibleDuplicateOf: similarTo[0],
    similarTo,
    evidenceFrameIds: c.evidenceFrameIds,
    cropBox: c.cropBox,
    confidence: c.confidence,
    suggestedName: defaultName(c.color, c.subtype),
    isPrivate: c.isPrivate,
    itemId: c.itemId,
  };
}

export const generateUploadUrl = mutation({
  args: { closetCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.closetCode) checkClosetCode(args.closetCode);
    return await ctx.storage.generateUploadUrl();
  },
});

export const start = mutation({
  args: {
    closetCode: v.string(),
    frames: v.array(v.object({ frameId: v.optional(v.string()), storageId: v.id("_storage"), timestampMs: v.number() })),
    videoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    if (args.frames.length === 0 && !args.videoStorageId) {
      fail("NEEDS_FRAMES", "Send 1-16 extracted frames with timestamps, or a videoStorageId for server-side extraction.");
    }
    if (args.frames.length > MAX_FRAMES) fail("TOO_MANY_FRAMES", `Send at most ${MAX_FRAMES} frames.`);
    for (const f of args.frames) await claimMedia(ctx, profile._id, f.storageId, "frame");
    if (args.videoStorageId) await claimMedia(ctx, profile._id, args.videoStorageId, "clip");
    const frames = [...args.frames]
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .map((f, i) => ({ frameId: f.frameId || `f${i + 1}`, storageId: f.storageId, timestampMs: f.timestampMs }));
    if (new Set(frames.map((f) => f.frameId)).size !== frames.length) fail("BAD_FRAMES", "Frame ids must be unique.");
    const scanId = await ctx.db.insert("scans", {
      ownerId: profile._id,
      status: "queued",
      frames,
      videoStorageId: args.videoStorageId,
      attempts: 1,
    });
    await ctx.scheduler.runAfter(0, internal.detect.run, { scanId, attempt: 1 });
    return { scanId, status: "queued" as const };
  },
});

export const get = query({
  args: { closetCode: v.string(), scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    const scan = await requireOwnedScan(ctx, profile._id, args.scanId);
    const rows = await ctx.db
      .query("candidates")
      .withIndex("by_scanId_and_attempt", (q) => q.eq("scanId", scan._id).eq("attempt", scan.attempts))
      .take(100);
    const idByIndex = new Map(rows.map((c) => [c.index, c._id] as const));
    const candidates = await Promise.all(rows.map((c) => candidateView(ctx, c, idByIndex)));
    const frames = await Promise.all(
      scan.frames.map(async (f) => ({ frameId: f.frameId, timestampMs: f.timestampMs, url: await ctx.storage.getUrl(f.storageId) })),
    );
    const confirmedItemIds = candidates.flatMap((c) => (c.itemId ? [c.itemId] : []));
    return {
      scanId: scan._id,
      status: scan.status,
      progress: {
        framesDone: scan.status === "queued" || scan.status === "processing" ? 0 : scan.frames.length,
        framesTotal: scan.frames.length,
      },
      candidates,
      error: scan.error?.message,
      errorCode: scan.error?.code,
      retryable: scan.error?.retryable,
      confirmedItemIds: scan.status === "confirmed" ? confirmedItemIds : undefined,
      attempts: scan.attempts,
      createdAt: scan._creationTime,
      elapsedMs: scan.elapsedMs,
      model: scan.model,
      frames,
    };
  },
});

export const list = query({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    if (!profile) return [];
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))
      .order("desc")
      .take(20);
    return scans.map((s) => ({
      scanId: s._id,
      status: s.status,
      error: s.error?.message,
      createdAt: s._creationTime,
      frameCount: s.frames.length,
      elapsedMs: s.elapsedMs,
    }));
  },
});

export const retry = mutation({
  args: { closetCode: v.string(), scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    const scan = await requireOwnedScan(ctx, profile._id, args.scanId);
    const stuck =
      (scan.status === "processing" || scan.status === "queued") &&
      Date.now() - (scan.processingStartedAt ?? scan._creationTime) > STUCK_AFTER_MS;
    if (scan.status !== "failed" && scan.status !== "review" && !stuck) {
      fail("CANNOT_RETRY", `Scan is ${scan.status}; only failed, review or stuck scans can be retried.`);
    }
    const attempt = scan.attempts + 1;
    await ctx.db.patch("scans", scan._id, {
      status: "queued",
      attempts: attempt,
      error: undefined,
      elapsedMs: undefined,
      processingStartedAt: undefined,
      processingFinishedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.detect.run, { scanId: scan._id, attempt });
    return { scanId: scan._id, status: "queued" as const, attempt };
  },
});

export const confirm = mutation({
  args: {
    closetCode: v.string(),
    scanId: v.id("scans"),
    acceptedCandidateIds: v.array(v.id("candidates")),
    edits: v.optional(
      v.array(
        v.object({
          candidateId: v.id("candidates"),
          category: v.optional(category),
          subtype: v.optional(v.string()),
          color: v.optional(v.string()),
          mergeInto: v.optional(v.id("candidates")),
          name: v.optional(v.string()),
          isPrivate: v.optional(v.boolean()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    const scan = await requireOwnedScan(ctx, profile._id, args.scanId);
    if (scan.status !== "review" && scan.status !== "confirmed") {
      fail("NOT_READY", `Scan is ${scan.status}; wait for review before confirming.`);
    }
    const edits = new Map((args.edits ?? []).map((e) => [e.candidateId, e] as const));
    const itemIds: Id<"items">[] = [];
    let createdCount = 0;
    for (const candidateId of new Set(args.acceptedCandidateIds)) {
      if (edits.get(candidateId)?.mergeInto) continue;
      const c = await ctx.db.get(candidateId);
      if (!c || c.ownerId !== profile._id || c.scanId !== scan._id) {
        fail("NOT_FOUND", "A candidate does not belong to this scan.");
      }
      let itemId = c.itemId;
      if (!itemId) {
        const e = edits.get(candidateId);
        const cat = e?.category ?? c.category;
        const subtype = e?.subtype ?? c.subtype;
        const color = e?.color ?? c.color;
        itemId = await ctx.db.insert("items", {
          ownerId: profile._id,
          name: e?.name ?? defaultName(color, subtype),
          category: cat,
          subtype,
          color,
          colorHex: c.colorHex,
          pattern: c.pattern,
          renderAssetKey: matchRenderAsset({ category: cat, subtype, color, pattern: c.pattern, colorHex: c.colorHex, confidence: c.confidence }),
          photoStorageId: c.cropStorageId,
          availability: "available",
          wearCount: 0,
          wearsSinceWash: 0,
          isPrivate: e?.isPrivate ?? (PRIVATE_CATEGORIES.includes(cat) || c.isPrivate),
          sourceCandidateId: c._id,
        });
        await ctx.db.patch("candidates", c._id, { itemId });
        if (c.cropStorageId) await ctx.scheduler.runAfter(0, internal.describe.item, { itemId });
        createdCount++;
      }
      if (!itemIds.includes(itemId)) itemIds.push(itemId);
    }
    await ctx.db.patch("scans", scan._id, { status: "confirmed", confirmedAt: scan.confirmedAt ?? Date.now() });
    return { scanId: scan._id, status: "confirmed" as const, itemIds, createdCount };
  },
});

export const beginProcessing = internalMutation({
  args: { scanId: v.id("scans"), attempt: v.number() },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan || scan.attempts !== args.attempt || scan.status !== "queued") return null;
    await ctx.db.patch("scans", scan._id, { status: "processing", processingStartedAt: Date.now() });
    return { ownerId: scan.ownerId, frames: scan.frames, videoStorageId: scan.videoStorageId };
  },
});

export const setFrames = internalMutation({
  args: { scanId: v.id("scans"), attempt: v.number(), frames: v.array(frame) },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan || scan.attempts !== args.attempt) return;
    for (const f of args.frames) {
      await ctx.db.insert("media", { ownerId: scan.ownerId, storageId: f.storageId, kind: "frame", contentType: "image/jpeg" });
    }
    await ctx.db.patch("scans", scan._id, { frames: args.frames });
  },
});

export const saveCandidates = internalMutation({
  args: {
    scanId: v.id("scans"),
    attempt: v.number(),
    model: v.string(),
    candidates: v.array(
      v.object({
        index: v.number(),
        frameId: v.string(),
        evidenceFrameIds: v.array(v.string()),
        category,
        subtype: v.string(),
        color: v.string(),
        pattern: v.optional(pattern),
        colorHex: v.optional(v.string()),
        cropBox,
        cropStorageId: v.optional(v.id("_storage")),
        confidence: v.number(),
        uncertain: v.boolean(),
        reviewReason: v.optional(v.string()),
        similarToIndexes: v.array(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan || scan.attempts !== args.attempt || scan.status !== "processing") return;
    for (const c of args.candidates) {
      if (c.cropStorageId) {
        await ctx.db.insert("media", { ownerId: scan.ownerId, storageId: c.cropStorageId, kind: "crop" });
      }
      await ctx.db.insert("candidates", {
        ...c,
        ownerId: scan.ownerId,
        scanId: scan._id,
        attempt: args.attempt,
        isPrivate: PRIVATE_CATEGORIES.includes(c.category),
      });
    }
    const now = Date.now();
    await ctx.db.patch("scans", scan._id, {
      status: "review",
      model: args.model,
      processingFinishedAt: now,
      elapsedMs: now - (scan.processingStartedAt ?? scan._creationTime),
    });
  },
});

export const markFailed = internalMutation({
  args: { scanId: v.id("scans"), attempt: v.number(), error: scanError },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan || scan.attempts !== args.attempt) return;
    const now = Date.now();
    await ctx.db.patch("scans", scan._id, {
      status: "failed",
      error: args.error,
      processingFinishedAt: now,
      elapsedMs: now - (scan.processingStartedAt ?? scan._creationTime),
    });
  },
});
