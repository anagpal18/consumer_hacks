import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Category = Doc<"items">["category"];
export type Availability = Doc<"items">["availability"];
export type Pattern = NonNullable<Doc<"items">["pattern"]>;

export const MAX_FRAMES = 16;
export const MAX_FRAME_BYTES = 10 * 1024 * 1024;
export const MAX_CLIP_BYTES = 100 * 1024 * 1024;
export const PRIVATE_CATEGORIES: Category[] = ["socks", "underwear"];
export const WASH_AFTER: Record<Category, number> = {
  top: 2,
  bottom: 4,
  outerwear: 8,
  dress: 2,
  shoes: 15,
  socks: 1,
  underwear: 1,
  accessory: 20,
};

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export function checkClosetCode(closetCode: string) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(closetCode)) {
    fail("BAD_CLOSET_CODE", "Closet code must be 4-64 letters, digits, '-' or '_'.");
  }
}

export async function findProfile(ctx: QueryCtx, closetCode: string) {
  checkClosetCode(closetCode);
  return await ctx.db
    .query("profiles")
    .withIndex("by_closetCode", (q) => q.eq("closetCode", closetCode))
    .unique();
}

export async function requireProfile(ctx: QueryCtx, closetCode: string) {
  const profile = await findProfile(ctx, closetCode);
  if (!profile) fail("NO_CLOSET", "Unknown closet. Call profiles:join with this closet code first.");
  return profile;
}

export async function ensureProfile(ctx: MutationCtx, closetCode: string) {
  const existing = await findProfile(ctx, closetCode);
  if (existing) return existing;
  const id = await ctx.db.insert("profiles", { closetCode });
  return (await ctx.db.get(id))!;
}

export async function requireOwnedItem(ctx: QueryCtx, ownerId: Id<"profiles">, itemId: Id<"items">) {
  const item = await ctx.db.get(itemId);
  if (!item || item.ownerId !== ownerId) fail("NOT_FOUND", "Item not found in this closet.");
  return item;
}

export async function requireOwnedScan(ctx: QueryCtx, ownerId: Id<"profiles">, scanId: Id<"scans">) {
  const scan = await ctx.db.get(scanId);
  if (!scan || scan.ownerId !== ownerId) fail("NOT_FOUND", "Scan not found in this closet.");
  return scan;
}

export async function claimMedia(
  ctx: MutationCtx,
  ownerId: Id<"profiles">,
  storageId: Id<"_storage">,
  kind: Doc<"media">["kind"],
) {
  const meta = await ctx.db.system.get("_storage", storageId);
  if (!meta) fail("BAD_MEDIA", "Uploaded file not found. Upload it again.");
  const claimed = await ctx.db
    .query("media")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .unique();
  if (claimed && claimed.ownerId !== ownerId) fail("FORBIDDEN", "That file belongs to another closet.");
  const contentType = meta.contentType ?? "";
  if (kind === "clip") {
    if (!contentType.startsWith("video/")) fail("BAD_MEDIA", `Clip must be a video, got '${contentType || "unknown"}'.`);
    if (meta.size > MAX_CLIP_BYTES) fail("BAD_MEDIA", "Clip is larger than 100 MB.");
  } else {
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(contentType)) {
      fail("BAD_MEDIA", `Frames must be JPEG, PNG or WebP, got '${contentType || "unknown"}'.`);
    }
    if (meta.size > MAX_FRAME_BYTES) fail("BAD_MEDIA", "A frame is larger than 10 MB.");
  }
  if (!claimed) {
    await ctx.db.insert("media", { ownerId, storageId, kind, contentType, size: meta.size });
  }
}

export async function itemView(ctx: QueryCtx, item: Doc<"items">) {
  return {
    itemId: item._id,
    category: item.category,
    subtype: item.subtype,
    name: item.name,
    color: item.color,
    colorHex: item.colorHex,
    media: {
      url: item.photoStorageId ? await ctx.storage.getUrl(item.photoStorageId) : null,
      storageId: item.photoStorageId,
    },
    renderAssetKey: item.renderAssetKey,
    availability: item.availability,
    wearCount: item.wearCount,
    wearsSinceWash: item.wearsSinceWash,
    lastWornAt: item.lastWornAt,
    isPrivate: item.isPrivate,
    washReminder: item.availability === "available" && item.wearsSinceWash >= WASH_AFTER[item.category],
  };
}

export type ItemView = Awaited<ReturnType<typeof itemView>>;

export function defaultName(color: string, subtype: string) {
  const s = `${color} ${subtype}`.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
