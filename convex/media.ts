import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { checkClosetCode } from "./lib";

export const generateUploadUrl = mutation({
  args: { closetCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.closetCode) checkClosetCode(args.closetCode);
    return await ctx.storage.generateUploadUrl();
  },
});
