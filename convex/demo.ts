import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ensureProfile, fail, itemView, requireProfile } from "./lib";

type DemoItem = Pick<Doc<"items">, "demoKey" | "name" | "category" | "subtype" | "color" | "colorHex" | "renderAssetKey">;

export const DEMO_ITEMS: DemoItem[] = [
  { demoKey: "jacket_denim", name: "Denim jacket", category: "outerwear", subtype: "denim jacket", color: "indigo", colorHex: "#3F5878", renderAssetKey: "demo/jacket-denim" },
  { demoKey: "shirt_white", name: "White oxford shirt", category: "top", subtype: "oxford shirt", color: "white", colorHex: "#F1EEE8", renderAssetKey: "demo/shirt-white" },
  { demoKey: "tee_black", name: "Black t-shirt", category: "top", subtype: "t-shirt", color: "black", colorHex: "#1E1E1E", renderAssetKey: "demo/tee-black" },
  { demoKey: "trousers_charcoal", name: "Charcoal trousers", category: "bottom", subtype: "trousers", color: "charcoal", colorHex: "#3B3B40", renderAssetKey: "demo/trousers-charcoal" },
  { demoKey: "chinos_khaki", name: "Khaki chinos", category: "bottom", subtype: "chinos", color: "khaki", colorHex: "#B49A72" },
  { demoKey: "sneakers_white", name: "White sneakers", category: "shoes", subtype: "sneakers", color: "white", colorHex: "#EDEAE4", renderAssetKey: "demo/sneakers-white" },
  { demoKey: "boots_brown", name: "Brown leather boots", category: "shoes", subtype: "boots", color: "brown", colorHex: "#6B4630", renderAssetKey: "demo/boots-brown" },
  { demoKey: "socks_grey", name: "Grey crew socks", category: "socks", subtype: "crew socks", color: "grey", colorHex: "#9A9A9A" },
];

export const seed = mutation({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    const items = [];
    for (const d of DEMO_ITEMS) {
      let item = await ctx.db
        .query("items")
        .withIndex("by_ownerId_and_demoKey", (q) => q.eq("ownerId", profile._id).eq("demoKey", d.demoKey))
        .unique();
      if (!item) {
        const id = await ctx.db.insert("items", {
          ...d,
          ownerId: profile._id,
          availability: "available",
          wearCount: 0,
          wearsSinceWash: 0,
          isPrivate: d.category === "socks" || d.category === "underwear",
        });
        item = (await ctx.db.get(id))!;
      }
      items.push({ demoKey: d.demoKey!, ...(await itemView(ctx, item)) });
    }
    return { items };
  },
});

export const reset = mutation({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    if (!args.closetCode.startsWith("demo")) fail("FORBIDDEN", "Only closets whose code starts with 'demo' can be reset.");
    const profile = await requireProfile(ctx, args.closetCode);
    let deleted = 0;
    for (const table of ["items", "wearLogs"] as const) {
      for await (const row of ctx.db.query(table).withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))) {
        await ctx.db.delete(table, row._id);
        deleted++;
      }
    }
    for await (const row of ctx.db.query("outfits").withIndex("by_ownerId_and_key", (q) => q.eq("ownerId", profile._id))) {
      await ctx.db.delete("outfits", row._id);
      deleted++;
    }
    for await (const scan of ctx.db.query("scans").withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))) {
      for await (const c of ctx.db.query("candidates").withIndex("by_scanId_and_attempt", (q) => q.eq("scanId", scan._id))) {
        await ctx.db.delete("candidates", c._id);
        deleted++;
      }
      await ctx.db.delete("scans", scan._id);
      deleted++;
    }
    for await (const m of ctx.db.query("media").withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id))) {
      await ctx.storage.delete(m.storageId);
      await ctx.db.delete("media", m._id);
      deleted++;
    }
    return { deleted };
  },
});
