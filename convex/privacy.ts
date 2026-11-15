import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireOwnedScan, requireProfile } from "./lib";

export const deleteScan = mutation({
  args: { closetCode: v.string(), scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    const scan = await requireOwnedScan(ctx, profile._id, args.scanId);
    const files = new Set<Id<"_storage">>(scan.frames.map((f) => f.storageId));
    if (scan.videoStorageId) files.add(scan.videoStorageId);
    const keptPhotos = new Set<Id<"_storage">>();
    let deletedCandidates = 0;
    for await (const c of ctx.db.query("candidates").withIndex("by_scanId_and_attempt", (q) => q.eq("scanId", scan._id))) {
      const item = c.itemId ? await ctx.db.get(c.itemId) : null;
      if (item) {
        if (item.photoStorageId) keptPhotos.add(item.photoStorageId);
        await ctx.db.patch("items", item._id, { sourceCandidateId: undefined });
      }
      if (c.cropStorageId) files.add(c.cropStorageId);
      await ctx.db.delete("candidates", c._id);
      deletedCandidates++;
    }
    let deletedFiles = 0;
    for (const storageId of files) {
      if (keptPhotos.has(storageId)) continue;
      const media = await ctx.db
        .query("media")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .unique();
      if (media && media.ownerId !== profile._id) continue;
      if (media) await ctx.db.delete("media", media._id);
      if (await ctx.db.system.get("_storage", storageId)) {
        await ctx.storage.delete(storageId);
        deletedFiles++;
      }
    }
    await ctx.db.delete("scans", scan._id);
    return { deleted: true as const, scanId: scan._id, deletedCandidates, deletedFiles, keptItemPhotos: keptPhotos.size };
  },
});
