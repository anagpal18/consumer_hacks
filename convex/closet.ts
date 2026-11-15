import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { availability, category } from "./schema";
import {
  claimMedia,
  defaultName,
  ensureProfile,
  findProfile,
  itemView,
  PRIVATE_CATEGORIES,
  requireOwnedItem,
  requireProfile,
} from "./lib";

export const list = query({
  args: { closetCode: v.string(), category: v.optional(category) },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    if (!profile) return [];
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))
      .take(500);
    const filtered = args.category ? items.filter((i) => i.category === args.category) : items;
    return await Promise.all(filtered.map((i) => itemView(ctx, i)));
  },
});

export const get = query({
  args: { closetCode: v.string(), itemId: v.id("items") },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    return await itemView(ctx, await requireOwnedItem(ctx, profile._id, args.itemId));
  },
});

export const setStatus = mutation({
  args: { closetCode: v.string(), itemId: v.id("items"), availability },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    await requireOwnedItem(ctx, profile._id, args.itemId);
    await ctx.db.patch("items", args.itemId, { availability: args.availability });
    return await itemView(ctx, (await ctx.db.get(args.itemId))!);
  },
});

export const markWashed = mutation({
  args: { closetCode: v.string(), itemIds: v.optional(v.array(v.id("items"))) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    let targets: Doc<"items">[];
    if (args.itemIds) {
      targets = [];
      for (const id of new Set(args.itemIds)) targets.push(await requireOwnedItem(ctx, profile._id, id));
    } else {
      const all = await ctx.db
        .query("items")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))
        .take(500);
      targets = all.filter((i) => i.availability === "laundry");
    }
    const now = Date.now();
    const items = [];
    for (const item of targets) {
      await ctx.db.patch("items", item._id, {
        availability: item.availability === "laundry" ? "available" : item.availability,
        wearsSinceWash: 0,
        lastWashedAt: now,
      });
      items.push(await itemView(ctx, (await ctx.db.get(item._id))!));
    }
    return { items };
  },
});

export const setRenderAssetKey = mutation({
  args: { closetCode: v.string(), itemId: v.id("items"), renderAssetKey: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    await requireOwnedItem(ctx, profile._id, args.itemId);
    await ctx.db.patch("items", args.itemId, { renderAssetKey: args.renderAssetKey ?? undefined });
    return await itemView(ctx, (await ctx.db.get(args.itemId))!);
  },
});

export const updateItem = mutation({
  args: {
    closetCode: v.string(),
    itemId: v.id("items"),
    name: v.optional(v.string()),
    category: v.optional(category),
    subtype: v.optional(v.string()),
    color: v.optional(v.string()),
    colorHex: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    await requireOwnedItem(ctx, profile._id, args.itemId);
    const { closetCode: _c, itemId, ...fields } = args;
    if (fields.category && fields.isPrivate === undefined) fields.isPrivate = PRIVATE_CATEGORIES.includes(fields.category);
    await ctx.db.patch("items", itemId, fields);
    return await itemView(ctx, (await ctx.db.get(itemId))!);
  },
});

export const addItem = mutation({
  args: {
    closetCode: v.string(),
    category,
    color: v.string(),
    subtype: v.optional(v.string()),
    name: v.optional(v.string()),
    colorHex: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    renderAssetKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    if (args.photoStorageId) await claimMedia(ctx, profile._id, args.photoStorageId, "photo");
    const subtype = args.subtype ?? args.category;
    const itemId: Id<"items"> = await ctx.db.insert("items", {
      ownerId: profile._id,
      name: args.name ?? defaultName(args.color, subtype),
      category: args.category,
      subtype,
      color: args.color,
      colorHex: args.colorHex,
      photoStorageId: args.photoStorageId,
      renderAssetKey: args.renderAssetKey,
      availability: "available",
      wearCount: 0,
      wearsSinceWash: 0,
      isPrivate: PRIVATE_CATEGORIES.includes(args.category),
    });
    return await itemView(ctx, (await ctx.db.get(itemId))!);
  },
});

export const deleteItem = mutation({
  args: { closetCode: v.string(), itemId: v.id("items") },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.closetCode);
    const item = await requireOwnedItem(ctx, profile._id, args.itemId);
    if (item.photoStorageId) {
      const media = await ctx.db
        .query("media")
        .withIndex("by_storageId", (q) => q.eq("storageId", item.photoStorageId!))
        .unique();
      if (media && media.ownerId === profile._id) {
        await ctx.db.delete("media", media._id);
        await ctx.storage.delete(item.photoStorageId);
      }
    }
    await ctx.db.delete("items", item._id);
    return null;
  },
});
