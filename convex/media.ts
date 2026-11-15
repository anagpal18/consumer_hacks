import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { ensureProfile } from "./lib";

export const generateUploadUrl = mutation({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    await ensureProfile(ctx, args.closetCode);
    return await ctx.storage.generateUploadUrl();
  },
});
