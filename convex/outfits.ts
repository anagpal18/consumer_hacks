import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { fail, findProfile, requireOwnedItem, requireProfile, WASH_AFTER } from "./lib";

export const CHALLENGE_TARGET = 3;
const DAY_MS = 86_400_000;

export function outfitKey(itemIds: Id<"items">[]) {
  return [...new Set(itemIds)].sort().join(",");
}

export function streakFromTimes(times: number[], now: number, tzOffsetMinutes: number) {
  const day = (t: number) => Math.floor((t + tzOffsetMinutes * 60_000) / DAY_MS);
  const days = new Set(times.map(day));
  let d = day(now);
  if (!days.has(d)) d--;
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d--;
  }
  return streak;
}

async function streakDays(ctx: QueryCtx, ownerId: Id<"profiles">, tzOffsetMinutes = 0) {
  const logs = await ctx.db
    .query("wearLogs")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(400);
  return streakFromTimes(logs.map((l) => l.wornAt), Date.now(), tzOffsetMinutes);
}

async function visibleIds(ctx: QueryCtx, itemIds: Id<"items">[]) {
  const items = await Promise.all(itemIds.map((id) => ctx.db.get(id)));
  return items.filter((i): i is Doc<"items"> => !!i && !i.isPrivate).map((i) => i._id);
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
    /** Minutes east of UTC for the streak's local day, e.g. -480 for Pacific standard time; the opposite sign of Date#getTimezoneOffset(). Defaults to 0 (UTC). */
    tzOffsetMinutes: v.optional(v.number()),
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
        challenge: await challengeFor(ctx, profile._id, await visibleIds(ctx, existing.itemIds)),
        washReminderItemIds: [] as Id<"items">[],
        streakDays: await streakDays(ctx, profile._id, args.tzOffsetMinutes),
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
    const styledIds = items.filter((i) => !i.isPrivate).map((i) => i._id);
    const outfitIds = styledIds.length ? styledIds : itemIds;
    const key = outfitKey(outfitIds);
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
        itemIds: [...outfitIds].sort(),
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
      challenge: await challengeFor(ctx, profile._id, styledIds),
      washReminderItemIds,
      streakDays: await streakDays(ctx, profile._id, args.tzOffsetMinutes),
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

export const streak = query({
  args: {
    closetCode: v.string(),
    /** Minutes east of UTC, e.g. -480 for Pacific standard time; the opposite sign of Date#getTimezoneOffset(). Defaults to 0 (UTC). */
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    if (!profile) return { streakDays: 0 };
    return { streakDays: await streakDays(ctx, profile._id, args.tzOffsetMinutes) };
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
