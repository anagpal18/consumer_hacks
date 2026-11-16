import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const category = v.union(
  v.literal("top"),
  v.literal("bottom"),
  v.literal("outerwear"),
  v.literal("dress"),
  v.literal("shoes"),
  v.literal("socks"),
  v.literal("underwear"),
  v.literal("accessory"),
);

export const availability = v.union(
  v.literal("available"),
  v.literal("laundry"),
  v.literal("retired"),
  v.literal("on_the_way"),
);

export const scanStatus = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("review"),
  v.literal("failed"),
  v.literal("confirmed"),
);

export const cropBox = v.object({
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
});

export const frame = v.object({
  frameId: v.string(),
  storageId: v.id("_storage"),
  timestampMs: v.number(),
});

export const scanError = v.object({
  code: v.string(),
  message: v.string(),
  retryable: v.boolean(),
});

export const bodyEstimate = v.object({
  body: v.object({
    sex: v.string(),
    preset: v.string(),
    skinTone: v.union(v.string(), v.null()),
    heightCm: v.optional(v.number()),
    proportions: v.object({
      head: v.number(),
      chest: v.number(),
      arms: v.number(),
      waist: v.number(),
      hips: v.number(),
      shoulders: v.number(),
    }),
  }),
  confidence: v.number(),
  notes: v.string(),
});

export default defineSchema({
  profiles: defineTable({
    closetCode: v.string(),
    displayName: v.optional(v.string()),
    bodyPhotoStorageId: v.optional(v.id("_storage")),
    bodyEstimate: v.optional(bodyEstimate),
  }).index("by_closetCode", ["closetCode"]),

  media: defineTable({
    ownerId: v.id("profiles"),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("frame"), v.literal("clip"), v.literal("crop"), v.literal("photo"), v.literal("body")),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  })
    .index("by_storageId", ["storageId"])
    .index("by_ownerId", ["ownerId"]),

  scans: defineTable({
    ownerId: v.id("profiles"),
    status: scanStatus,
    frames: v.array(frame),
    videoStorageId: v.optional(v.id("_storage")),
    attempts: v.number(),
    error: v.optional(scanError),
    model: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    processingFinishedAt: v.optional(v.number()),
    elapsedMs: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
  }).index("by_ownerId", ["ownerId"]),

  candidates: defineTable({
    ownerId: v.id("profiles"),
    scanId: v.id("scans"),
    attempt: v.number(),
    index: v.number(),
    frameId: v.string(),
    evidenceFrameIds: v.array(v.string()),
    category,
    subtype: v.string(),
    color: v.string(),
    colorHex: v.optional(v.string()),
    cropBox,
    cropStorageId: v.optional(v.id("_storage")),
    confidence: v.number(),
    uncertain: v.boolean(),
    reviewReason: v.optional(v.string()),
    similarToIndexes: v.array(v.number()),
    isPrivate: v.boolean(),
    itemId: v.optional(v.id("items")),
  })
    .index("by_scanId_and_attempt", ["scanId", "attempt"]),

  items: defineTable({
    ownerId: v.id("profiles"),
    name: v.string(),
    category,
    subtype: v.string(),
    color: v.string(),
    colorHex: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    renderAssetKey: v.optional(v.string()),
    availability,
    wearCount: v.number(),
    wearsSinceWash: v.number(),
    lastWornAt: v.optional(v.number()),
    lastWashedAt: v.optional(v.number()),
    isPrivate: v.boolean(),
    sourceCandidateId: v.optional(v.id("candidates")),
    demoKey: v.optional(v.string()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_demoKey", ["ownerId", "demoKey"]),

  outfits: defineTable({
    ownerId: v.id("profiles"),
    key: v.string(),
    itemIds: v.array(v.id("items")),
    wearCount: v.number(),
    lastWornAt: v.number(),
  }).index("by_ownerId_and_key", ["ownerId", "key"]),

  // Sample catalog for Feed and Shop. Every row is demo content, never a real partner or account.
  brands: defineTable({
    slug: v.string(),
    name: v.string(),
    tagline: v.string(),
    colorHex: v.string(),
  }).index("by_slug", ["slug"]),

  deals: defineTable({
    brandSlug: v.string(),
    title: v.string(),
    description: v.string(),
    code: v.string(),
    discountPct: v.number(),
    pointsCost: v.number(),
    expiresAt: v.number(),
  }).index("by_brandSlug", ["brandSlug"]),

  products: defineTable({
    brandSlug: v.string(),
    name: v.string(),
    category,
    subtype: v.string(),
    color: v.string(),
    colorHex: v.string(),
    priceCents: v.number(),
    pairsWith: v.array(category),
    imageStorageId: v.optional(v.id("_storage")),
  }).index("by_brandSlug", ["brandSlug"]),

  feedPosts: defineTable({
    rank: v.number(),
    kind: v.union(v.literal("friend"), v.literal("creator"), v.literal("brand")),
    author: v.string(),
    handle: v.string(),
    brandSlug: v.optional(v.string()),
    caption: v.string(),
    prompt: v.string(),
    swatches: v.array(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    pieces: v.optional(v.array(v.string())),
    likes: v.number(),
  }).index("by_rank", ["rank"]),

  wearLogs: defineTable({
    ownerId: v.id("profiles"),
    requestId: v.string(),
    outfitId: v.id("outfits"),
    itemIds: v.array(v.id("items")),
    occasion: v.optional(v.string()),
    wornAt: v.number(),
  })
    .index("by_ownerId_and_requestId", ["ownerId", "requestId"])
    .index("by_ownerId", ["ownerId"]),
});
