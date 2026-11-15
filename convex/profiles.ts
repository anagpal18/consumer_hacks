import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureProfile, findProfile } from "./lib";

export const join = mutation({
  args: { closetCode: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    if (args.displayName && profile.displayName !== args.displayName) {
      await ctx.db.patch("profiles", profile._id, { displayName: args.displayName });
    }
    return { profileId: profile._id, closetCode: profile.closetCode };
  },
});

export const get = query({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    if (!profile) return null;
    return { profileId: profile._id, closetCode: profile.closetCode, displayName: profile.displayName ?? null };
  },
});
