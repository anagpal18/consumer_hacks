import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { fail, findProfile, requireOwnedItem, requireProfile, WASH_AFTER } from "./lib";

export const CHALLENGE_TARGET = 3;

export function outfitKey(itemIds: Id<"items">[]) {
  return [...new Set(itemIds)].sort().join(",");
}

async function challengeFor(ctx: QueryCtx, ownerId: Id<"profiles">, itemIds: Id<"items">[]) {
  const outfits = await ctx.db
    .query("outfits")
    .withIndex("by_ownerId_and_key", (q) => q.eq("ownerId", ownerId))
    .take(1000);
  return itemIds
    .map((itemId) => {
      const distinctOutfits = Math.min(outfits.filter((o) => o.itemIds.includes(itemId)).length, CHALLENGE_TARGET);
      return { itemId, distinctOutfits, target: CHALLENGE_TARGET, completed: distinctOutfits >= CHALLENGE_TARGET };
    })
    .sort((a, b) => b.distinctOutfits - a.distinctOutfits);
}

function savedWear(log: Doc<"wearLogs">) {
  return { wearId: log._id, itemIds: log.itemIds, wornAt: log.wornAt, requestId: log.requestId, outfitId: log.outfitId };
}

export const confirmWear = mutation({
  args: {
    closetCode: v.string(),
    itemIds: v.array(v.id("items")),
    requestId: v.string(),
    outfitId: v.optional(v.string()),
    occasion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    if (!args.requestId) fail("BAD_REQUEST", "requestId is required.");
    const existing = await ctx.db
      .query("wearLogs")
      .withIndex("by_ownerId_and_requestId", (q) => q.eq("ownerId", profile._id).eq("requestId", args.requestId))
      .unique();
    if (existing) {
      return {
        wear: savedWear(existing),
        challenge: await challengeFor(ctx, profile._id, existing.itemIds),
        washReminderItemIds: [] as Id<"items">[],
        duplicate: true,
      };
    }
    const itemIds = [...new Set(args.itemIds)];
    if (itemIds.length === 0) fail("BAD_REQUEST", "Pick at least one item.");
    const items = [];
    for (const id of itemIds) {
      const item = await requireOwnedItem(ctx, profile._id, id);
      if (item.availability !== "available") {
        fail("ITEM_UNAVAILABLE", `${item.name} is ${item.availability.replace(/_/g, " ")}; swap it before confirming.`);
      }
      items.push(item);
    }
    const now = Date.now();
    const key = outfitKey(itemIds);
    const outfit = await ctx.db
      .query("outfits")
      .withIndex("by_ownerId_and_key", (q) => q.eq("ownerId", profile._id).eq("key", key))
      .unique();
    let outfitDocId: Id<"outfits">;
    if (outfit) {
      outfitDocId = outfit._id;
      await ctx.db.patch("outfits", outfit._id, { wearCount: outfit.wearCount + 1, lastWornAt: now });
    } else {
      outfitDocId = await ctx.db.insert("outfits", {
        ownerId: profile._id,
        key,
        itemIds: [...itemIds].sort(),
        wearCount: 1,
        lastWornAt: now,
      });
    }
    const washReminderItemIds: Id<"items">[] = [];
    for (const item of items) {
      const wearsSinceWash = item.wearsSinceWash + 1;
      await ctx.db.patch("items", item._id, { wearCount: item.wearCount + 1, wearsSinceWash, lastWornAt: now });
      if (wearsSinceWash >= WASH_AFTER[item.category]) washReminderItemIds.push(item._id);
    }
    const logId = await ctx.db.insert("wearLogs", {
      ownerId: profile._id,
      requestId: args.requestId,
      outfitId: outfitDocId,
      itemIds,
      occasion: args.occasion,
      wornAt: now,
    });
    return {
      wear: savedWear((await ctx.db.get(logId))!),
      challenge: await challengeFor(ctx, profile._id, items.filter((i) => !i.isPrivate).map((i) => i._id)),
      washReminderItemIds,
      duplicate: false,
    };
  },
});

export const challenge = query({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    if (!profile) return [];
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))
      .take(500);
    const progress = await challengeFor(
      ctx,
      profile._id,
      items.filter((i) => !i.isPrivate).map((i) => i._id),
    );
    return progress.filter((p) => p.distinctOutfits > 0);
  },
});

export const recentWears = query({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    if (!profile) return [];
    const logs = await ctx.db
      .query("wearLogs")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))
      .order("desc")
      .take(20);
    return logs.map((l) => ({ ...savedWear(l), occasion: l.occasion }));
  },
});
