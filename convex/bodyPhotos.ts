import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { bodyEstimate } from "./schema";
import { claimMedia, ensureProfile, fail } from "./lib";

export const claim = internalMutation({
  args: { closetCode: v.string(), photoStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    await claimMedia(ctx, profile._id, args.photoStorageId, "body");
    const media = await ctx.db
      .query("media")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.photoStorageId))
      .unique();
    if (!media || media.kind !== "body") fail("BAD_MEDIA", "That file is not a body photo for this closet.");
    await ctx.db.patch("profiles", profile._id, { bodyPhotoStorageId: args.photoStorageId });
    return profile._id;
  },
});

export const saveEstimate = internalMutation({
  args: { profileId: v.id("profiles"), photoStorageId: v.id("_storage"), estimate: bodyEstimate },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.bodyPhotoStorageId !== args.photoStorageId) return;
    await ctx.db.patch("profiles", profile._id, { bodyEstimate: args.estimate });
  },
});
