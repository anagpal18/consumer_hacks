import { v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { category as categoryValidator, cut as cutValidator, descriptor as descriptorValidator } from "./schema";
import { ensureProfile, fail, findProfile, type Category } from "./lib";
import { colorFamily } from "./renderAssets";

/**
 * Sample catalog behind Feed and Shop: brands, deals, products and feed posts.
 * Everything here is demo content. The UI labels it "Sample", and there is no checkout,
 * no partner integration and no real account behind any row.
 */

const BRANDS: [string, string, string, string][] = [
  ["uniqlo", "Uniqlo", "Everyday basics that layer", "#C8102E"],
  ["levis", "Levi's", "Denim that outlasts trends", "#B5121B"],
  ["everlane", "Everlane", "Clean staples, clear pricing", "#2B2B2B"],
  ["cos", "COS", "Modern tailoring", "#5B6770"],
  ["zara", "Zara", "This season, right now", "#111111"],
  ["hm", "H&M", "Trend pieces for less", "#CC071E"],
  ["nike", "Nike", "Sport and street", "#111111"],
  ["adidas", "Adidas", "Three stripes, every day", "#1F2A44"],
  ["patagonia", "Patagonia", "Built for weather", "#2F5D3A"],
  ["madewell", "Madewell", "Denim-first casual", "#3F5878"],
  ["jcrew", "J.Crew", "Preppy classics", "#1F2A44"],
  ["arket", "Arket", "Nordic essentials", "#6B7045"],
  ["muji", "Muji", "Quiet, useful pieces", "#7A1F2B"],
  ["carhartt-wip", "Carhartt WIP", "Workwear, cut for the city", "#C9A227"],
  ["new-balance", "New Balance", "Sneakers for walking days", "#8C8C8C"],
  ["dr-martens", "Dr. Martens", "Boots with a long life", "#1E1E1E"],
  ["allbirds", "Allbirds", "Soft, light shoes", "#2C7A7B"],
  ["reformation", "Reformation", "Dresses for plans", "#A6532B"],
  ["aritzia", "Aritzia", "Polished everyday", "#6D1F2B"],
  ["banana-republic", "Banana Republic", "Office to dinner", "#B49A72"],
];

const COLORS: [string, string][] = [
  ["black", "#1E1E1E"], ["white", "#F1EEE8"], ["navy", "#1F2A44"], ["grey", "#8C8C8C"], ["charcoal", "#3B3B40"],
  ["beige", "#D8C7A8"], ["camel", "#B88A55"], ["olive", "#6B7045"], ["brown", "#6B4630"], ["burgundy", "#6D1F2B"],
  ["rust", "#A6532B"], ["forest green", "#2F5D3A"], ["light blue", "#A9C4DE"], ["indigo", "#3F5878"], ["cream", "#EFE6D2"],
];

const KINDS: [Category, string, number, Category[]][] = [
  ["outerwear", "wool overcoat", 18000, ["top", "bottom", "shoes"]],
  ["outerwear", "bomber jacket", 12000, ["top", "bottom", "shoes"]],
  ["outerwear", "blazer", 15000, ["top", "bottom", "shoes"]],
  ["outerwear", "rain shell", 9000, ["top", "bottom", "shoes"]],
  ["top", "crewneck sweater", 6500, ["bottom", "shoes", "outerwear"]],
  ["top", "oxford shirt", 5500, ["bottom", "shoes", "outerwear"]],
  ["top", "t-shirt", 2500, ["bottom", "shoes", "outerwear"]],
  ["top", "linen shirt", 6000, ["bottom", "shoes"]],
  ["bottom", "jeans", 8900, ["top", "shoes", "outerwear"]],
  ["bottom", "chinos", 7000, ["top", "shoes", "outerwear"]],
  ["bottom", "trousers", 9500, ["top", "shoes", "outerwear"]],
  ["dress", "slip dress", 11000, ["shoes", "outerwear"]],
  ["dress", "shirt dress", 9800, ["shoes", "outerwear"]],
  ["shoes", "sneakers", 9000, ["bottom", "top", "dress"]],
  ["shoes", "chelsea boots", 16000, ["bottom", "top", "outerwear"]],
  ["shoes", "loafers", 13000, ["bottom", "top", "dress"]],
  ["accessory", "scarf", 4000, ["outerwear", "top"]],
  ["accessory", "tote bag", 5000, ["top", "bottom", "dress"]],
];

const PEOPLE = ["Maya R.", "Dev K.", "Sofia L.", "Jonah P.", "Aiko T.", "Priya S.", "Marcus W.", "Lena B.", "Tomas G.", "Zoe H.", "Idris A.", "Nora F.", "Kai M.", "Elena V.", "Sam O."];
const CREATORS = ["Studio Nine", "The Capsule Edit", "Thirty Wears", "Closet Math", "Rewear Diaries", "Slow Style Co."];
const PLANS: [string, string][] = [
  ["Gallery opening, then dinner", "dinner after a gallery opening"],
  ["Saturday coffee run", "weekend coffee with friends"],
  ["Smart casual for the office", "a smart casual day at the office"],
  ["First date, wine bar", "a first date at a wine bar"],
  ["Rainy day errands", "running errands on a rainy day"],
  ["Airport outfit, long flight", "a comfortable outfit for a long flight"],
  ["Sunday farmers market", "a sunny morning at the farmers market"],
  ["Job interview, creative studio", "a job interview at a creative studio"],
  ["Concert night", "a concert with friends tonight"],
  ["Brunch, then a long walk", "brunch and a long walk"],
  ["Cold morning commute", "a cold morning commute"],
  ["Rooftop drinks at sunset", "rooftop drinks at sunset"],
  ["Winter wedding guest", "being a guest at a winter wedding"],
  ["Work from a cafe", "working from a cafe all day"],
  ["Museum afternoon", "an afternoon at the museum"],
  ["Dinner with the in-laws", "dinner with the in-laws"],
  ["Beach day", "a beach day"],
  ["Hike, then lunch in town", "a light hike and lunch in town"],
  ["Birthday dinner", "a birthday dinner at a nice restaurant"],
  ["Monday, back to it", "an ordinary Monday at work"],
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Idempotent: fills the sample catalog once. Pass `force` to rebuild it. */
export const seed = mutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("brands").take(1);
    if (existing.length && !args.force) return { seeded: false as const };
    for (const table of ["brands", "deals", "products", "feedPosts"] as const) {
      for (const row of await ctx.db.query(table).take(1000)) await ctx.db.delete(table, row._id);
    }
    const r = rng(7);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const now = Date.now();
    let deals = 0;
    let products = 0;
    for (const [slug, name, tagline, colorHex] of BRANDS) {
      await ctx.db.insert("brands", { slug, name, tagline, colorHex });
      const offers: [string, string, number, number][] = [
        [`${10 + Math.floor(r() * 4) * 5}% off your next order`, `Sample offer from ${name}. Redeem with Wear Again points.`, 0, 300],
        ["Free repair or alteration", `Keep a ${name} piece going instead of replacing it.`, 0, 500],
      ];
      for (const [title, description, , pointsCost] of offers) {
        const pct = parseInt(title, 10) || 0;
        await ctx.db.insert("deals", {
          brandSlug: slug,
          title,
          description,
          code: `SAMPLE-${slug.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}-${pct || "FIX"}`,
          discountPct: pct,
          pointsCost,
          expiresAt: now + (7 + Math.floor(r() * 30)) * 86_400_000,
        });
        deals++;
      }
      for (let i = 0; i < 6; i++) {
        const [category, subtype, base, pairsWith] = pick(KINDS);
        const [color, hex] = pick(COLORS);
        await ctx.db.insert("products", {
          brandSlug: slug,
          name: `${cap(color)} ${subtype}`,
          category,
          subtype,
          color,
          colorHex: hex,
          priceCents: Math.round((base * (0.8 + r() * 0.5)) / 100) * 100,
          pairsWith,
        });
        products++;
      }
    }
    const POSTS = 120;
    for (let i = 0; i < POSTS; i++) {
      const roll = r();
      const kind = roll < 0.6 ? ("friend" as const) : roll < 0.85 ? ("creator" as const) : ("brand" as const);
      const brand = pick(BRANDS);
      const author = kind === "friend" ? pick(PEOPLE) : kind === "creator" ? pick(CREATORS) : brand[1];
      const [caption, prompt] = pick(PLANS);
      await ctx.db.insert("feedPosts", {
        rank: i,
        kind,
        author,
        handle: "@" + author.toLowerCase().replace(/[^a-z0-9]+/g, ""),
        brandSlug: kind === "brand" ? brand[0] : undefined,
        caption,
        prompt,
        swatches: [pick(COLORS)[1], pick(COLORS)[1], pick(COLORS)[1], pick(COLORS)[1]],
        likes: 12 + Math.floor(r() * 900),
      });
    }
    return { seeded: true as const, brands: BRANDS.length, deals, products, posts: POSTS };
  },
});

const BRAND_INFO: Record<string, [string, string, string]> = {
  zara: ["Zara", "This season, right now", "#111111"],
  hm: ["H&M", "Trend pieces for less", "#CC071E"],
  uniqlo: ["Uniqlo", "Everyday basics that layer", "#C8102E"],
  levis: ["Levi's", "Denim that outlasts trends", "#B5121B"],
  nike: ["Nike", "Sport and street", "#111111"],
  cos: ["COS", "Modern tailoring", "#5B6770"],
};
const PAIRS: Record<string, Category[]> = {
  outerwear: ["top", "bottom", "shoes"],
  top: ["bottom", "shoes", "outerwear"],
  bottom: ["top", "shoes", "outerwear"],
  dress: ["shoes", "outerwear"],
  shoes: ["bottom", "top", "dress"],
  accessory: ["outerwear", "top"],
};

/**
 * Replaces the sample catalog with photographed products (images already uploaded to storage)
 * and builds feed posts that show those photos as outfits. Run with `npx convex run`.
 * Product photos are generated sample images, not the brands' own product shots.
 */
export const importPhotographed = internalMutation({
  args: {
    products: v.array(
      v.object({
        brandSlug: v.string(),
        name: v.string(),
        category: categoryValidator,
        subtype: v.string(),
        color: v.string(),
        colorHex: v.string(),
        priceCents: v.number(),
        imageStorageId: v.id("_storage"),
        cut: v.optional(cutValidator),
        descriptor: v.optional(descriptorValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const table of ["brands", "deals", "products", "feedPosts", "postLikes"] as const) {
      for (const row of await ctx.db.query(table).take(1000)) await ctx.db.delete(table, row._id);
    }
    const r = rng(11);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const now = Date.now();
    const slugs = [...new Set(args.products.map((p) => p.brandSlug))];
    for (const slug of slugs) {
      const [name, tagline, colorHex] = BRAND_INFO[slug] ?? [slug, "Sample brand", "#333333"];
      await ctx.db.insert("brands", { slug, name, tagline, colorHex });
      const pct = 10 + Math.floor(r() * 4) * 5;
      await ctx.db.insert("deals", { brandSlug: slug, title: `${pct}% off your next order`, description: `Sample offer from ${name}. Redeem with Wear Again points.`, code: `SAMPLE-${slug.toUpperCase()}-${pct}`, discountPct: pct, pointsCost: 300, expiresAt: now + 14 * 86_400_000 });
      await ctx.db.insert("deals", { brandSlug: slug, title: "Free repair or alteration", description: `Keep a ${name} piece going instead of replacing it.`, code: `SAMPLE-${slug.toUpperCase()}-FIX`, discountPct: 0, pointsCost: 500, expiresAt: now + 30 * 86_400_000 });
    }
    const inserted: ((typeof args.products)[number] & { _id: Id<"products"> })[] = [];
    for (const p of args.products) inserted.push({ ...p, _id: await ctx.db.insert("products", { ...p, pairsWith: PAIRS[p.category] ?? ["top", "bottom"] }) });

    const wearable = inserted.filter((p) => p.cut !== "womens" && p.category !== "dress");
    const by = (cat: string, slug?: string) => wearable.filter((p) => p.category === cat && (!slug || p.brandSlug === slug));
    const POSTS = 48;
    for (let i = 0; i < POSTS; i++) {
      const kind = "brand" as const;
      const slug = slugs[i % slugs.length];
      const from = (cat: string) => {
        const own = kind === "brand" ? by(cat, slug) : [];
        return own.length ? pick(own) : by(cat).length ? pick(by(cat)) : undefined;
      };
      const look = (i % 2 === 0 ? [from("outerwear"), from("top"), from("bottom"), from("shoes")] : [from("top"), from("bottom"), from("shoes")]).filter(
        (p): p is (typeof inserted)[number] => !!p,
      );
      const author = BRAND_INFO[slug]?.[0] ?? slug;
      const [caption, prompt] = pick(PLANS);
      await ctx.db.insert("feedPosts", {
        rank: i,
        kind,
        author,
        handle: "@" + author.toLowerCase().replace(/[^a-z0-9]+/g, ""),
        brandSlug: kind === "brand" ? slug : undefined,
        caption,
        prompt,
        swatches: look.map((p) => p.colorHex),
        imageStorageIds: look.map((p) => p.imageStorageId),
        productIds: look.map((p) => p._id),
        pieces: look.map((p) => `${BRAND_INFO[p.brandSlug]?.[0] ?? p.brandSlug} ${p.name}`),
        likes: 12 + Math.floor(r() * 900),
      });
    }
    return { brands: slugs.length, products: args.products.length, posts: POSTS };
  },
});

export const brands = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("brands").take(100);
    return rows.map((b) => ({ slug: b.slug, name: b.name, tagline: b.tagline, colorHex: b.colorHex, sample: true as const }));
  },
});

export const deals = query({
  args: { brandSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = args.brandSlug
      ? await ctx.db.query("deals").withIndex("by_brandSlug", (q) => q.eq("brandSlug", args.brandSlug!)).take(20)
      : await ctx.db.query("deals").take(100);
    const names = new Map((await ctx.db.query("brands").take(100)).map((b) => [b.slug, b.name] as const));
    return rows.map((d) => ({
      dealId: d._id,
      brandSlug: d.brandSlug,
      brandName: names.get(d.brandSlug) ?? d.brandSlug,
      title: d.title,
      description: d.description,
      code: d.code,
      discountPct: d.discountPct,
      pointsCost: d.pointsCost,
      expiresAt: d.expiresAt,
      sample: true as const,
    }));
  },
});

export const feed = query({
  args: { limit: v.optional(v.number()), after: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 60);
    const rows = await ctx.db
      .query("feedPosts")
      .withIndex("by_rank", (q) => q.gt("rank", args.after ?? -1))
      .take(limit);
    const urls = new Map<string, string | null>();
    for (const p of rows) for (const id of p.imageStorageIds ?? []) if (!urls.has(id)) urls.set(id, await ctx.storage.getUrl(id));
    return {
      posts: rows.map((p) => ({
        images: (p.imageStorageIds ?? []).map((id) => urls.get(id) ?? null).filter((u): u is string => !!u),
        pieces: p.pieces ?? [],
        postId: p._id,
        rank: p.rank,
        kind: p.kind,
        author: p.author,
        handle: p.handle,
        brandSlug: p.brandSlug ?? null,
        caption: p.caption,
        prompt: p.prompt,
        swatches: p.swatches,
        likes: p.likes,
        sample: true as const,
      })),
      next: rows.length === limit ? rows[rows.length - 1].rank : null,
    };
  },
});

/**
 * Shop: sample products ranked by how many of the closet's own available pieces they pair with.
 * A product the closet already has (same subtype and color family) is skipped.
 */
export const recommend = query({
  args: { closetCode: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 40);
    const profile = await findProfile(ctx, args.closetCode);
    const owned = profile
      ? (await ctx.db.query("items").withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id)).take(500)).filter(
          (i) => i.availability !== "retired" && !i.isPrivate,
        )
      : [];
    const names = new Map((await ctx.db.query("brands").take(100)).map((b) => [b.slug, b.name] as const));
    const products = (await ctx.db.query("products").take(300)).filter(isWearable);
    const neutral = new Set(["black", "white", "grey", "beige", "brown"]);
    const scored = products
      .filter((p) => !owned.some((i) => i.subtype === p.subtype && colorFamily(i.colorHex) === colorFamily(p.colorHex)))
      .map((p) => {
        const family = colorFamily(p.colorHex);
        const matches = owned
          .filter((i) => p.pairsWith.includes(i.category))
          .map((i) => {
            const f = colorFamily(i.colorHex);
            const harmony = f === family ? 0 : (f && neutral.has(f)) || (family && neutral.has(family)) ? 2 : 1;
            return { item: i, harmony };
          })
          .filter((m) => m.harmony > 0)
          .sort((a, b) => b.harmony - a.harmony || a.item.wearCount - b.item.wearCount);
        const slots = new Set(matches.map((m) => m.item.category)).size;
        return { p, matches, score: slots * 10 + Math.min(matches.length, 9) };
      })
      .sort((a, b) => b.score - a.score || (a.p._id < b.p._id ? -1 : 1))
      .slice(0, limit);
    const imageUrls = new Map<string, string | null>();
    for (const { p } of scored) if (p.imageStorageId) imageUrls.set(p._id, await ctx.storage.getUrl(p.imageStorageId));
    const photoUrls = new Map<string, string | null>();
    return await Promise.all(scored.map(async ({ p, matches }) => {
      const top: typeof matches = [];
      for (const m of matches) {
        if (!top.some((t) => t.item.category === m.item.category)) top.push(m);
        if (top.length === 3) break;
      }
      for (const m of top) {
        if (m.item.photoStorageId && !photoUrls.has(m.item._id)) photoUrls.set(m.item._id, await ctx.storage.getUrl(m.item.photoStorageId));
      }
      return {
        imageUrl: imageUrls.get(p._id) ?? null,
        productId: p._id,
        brandSlug: p.brandSlug,
        brandName: names.get(p.brandSlug) ?? p.brandSlug,
        name: p.name,
        category: p.category,
        subtype: p.subtype,
        color: p.color,
        colorHex: p.colorHex,
        priceCents: p.priceCents,
        matchCount: matches.length,
        matches: top.map((m) => ({ photoUrl: photoUrls.get(m.item._id) ?? null, itemId: m.item._id, name: m.item.name, category: m.item.category, colorHex: m.item.colorHex ?? null, wearCount: m.item.wearCount })),
        prompt: `an outfit built around a ${p.color} ${p.subtype}`,
        sample: true as const,
      };
    }));
  },
});


// ---------------------------------------------------------------------------------------------
// Menswear reels, likes, add-to-closet and closet gaps. Profiles are menswear for now, so nothing
// cut for women (and no dresses) is returned anywhere below.

type Traits = { formality: number; warmth: number };

const isWearable = (x: { cut?: string; category: string }) => x.cut !== "womens" && x.category !== "dress";

/** Descriptor values when the photo was described, otherwise a guess from the subtype. */
export function traits(x: { subtype: string; category: string; descriptor?: Doc<"products">["descriptor"] }): Traits {
  if (x.descriptor) return { formality: x.descriptor.formality, warmth: x.descriptor.warmth };
  const s = x.subtype.toLowerCase();
  const formality = /blazer|overcoat|derb|loafer|oxford|poplin|dress shirt|tailored|merino|turtleneck|suit/.test(s)
    ? 4
    : /sneaker|hoodie|jogger|shorts|t-?shirt|tee|running|training|sweatshirt|legging|sock/.test(s)
      ? 1
      : /jeans|cargo|polo|flannel|denim|fleece|windbreaker|bomber|chelsea|boot/.test(s)
        ? 2
        : 3;
  const warmth = /overcoat|puffer|parka|down|sherpa|coat/.test(s)
    ? 5
    : /fleece|sweater|knit|cardigan|crewneck|hoodie|turtleneck/.test(s)
      ? 3
      : /jacket|bomber|overshirt|windbreaker|shell|vest/.test(s)
        ? 3
        : /shorts|resort|linen|t-?shirt|tee|polo/.test(s)
          ? 1
          : 2;
  return { formality, warmth };
}

async function ownedItems(ctx: QueryCtx, ownerId: Id<"profiles">) {
  return (await ctx.db.query("items").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(500)).filter(
    (i) => i.availability !== "retired" && !i.isPrivate,
  );
}

async function brandNames(ctx: QueryCtx) {
  return new Map((await ctx.db.query("brands").take(100)).map((b) => [b.slug, b.name] as const));
}

export const reels = query({
  args: { closetCode: v.string(), limit: v.optional(v.number()), after: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 30);
    const profile = await findProfile(ctx, args.closetCode);
    const liked = new Set<string>();
    const ownedProducts = new Set<string>();
    if (profile) {
      for await (const l of ctx.db.query("postLikes").withIndex("by_ownerId_and_postId", (q) => q.eq("ownerId", profile._id))) liked.add(l.postId);
      for (const i of await ownedItems(ctx, profile._id)) if (i.sourceProductId) ownedProducts.add(i.sourceProductId);
    }
    const names = await brandNames(ctx);
    const posts: Doc<"feedPosts">[] = [];
    let cursor = args.after ?? -1;
    while (posts.length < limit) {
      const page = await ctx.db.query("feedPosts").withIndex("by_rank", (q) => q.gt("rank", cursor)).take(limit * 2);
      if (!page.length) break;
      for (const p of page) if (p.kind === "brand" && p.productIds?.length && posts.length < limit) posts.push(p);
      cursor = page[page.length - 1].rank;
      if (page.length < limit * 2) break;
    }
    const out = [];
    for (const p of posts) {
      const pieces = [];
      for (const id of p.productIds ?? []) {
        const prod = await ctx.db.get(id);
        if (!prod || !isWearable(prod)) continue;
        pieces.push({
          productId: prod._id,
          name: prod.name,
          brandName: names.get(prod.brandSlug) ?? prod.brandSlug,
          category: prod.category,
          imageUrl: prod.imageStorageId ? await ctx.storage.getUrl(prod.imageStorageId) : null,
          priceCents: prod.priceCents,
          summary: prod.descriptor?.summary ?? "",
          inCloset: ownedProducts.has(prod._id),
        });
      }
      if (!pieces.length) continue;
      out.push({
        postId: p._id,
        rank: p.rank,
        brandSlug: p.brandSlug ?? "",
        brandName: names.get(p.brandSlug ?? "") ?? p.author,
        caption: p.caption,
        prompt: p.prompt,
        likes: p.likes,
        likedByMe: liked.has(p._id),
        pieces,
        sample: true as const,
      });
    }
    return { posts: out, next: posts.length === limit ? posts[posts.length - 1].rank : null };
  },
});

export const toggleLike = mutation({
  args: { closetCode: v.string(), postId: v.id("feedPosts") },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    const post = await ctx.db.get(args.postId);
    if (!post) fail("NOT_FOUND", "That post is gone.");
    const existing = await ctx.db
      .query("postLikes")
      .withIndex("by_ownerId_and_postId", (q) => q.eq("ownerId", profile._id).eq("postId", args.postId))
      .unique();
    if (existing) {
      await ctx.db.delete("postLikes", existing._id);
      await ctx.db.patch("feedPosts", post._id, { likes: Math.max(0, post.likes - 1) });
      return { liked: false, likes: Math.max(0, post.likes - 1) };
    }
    await ctx.db.insert("postLikes", { ownerId: profile._id, postId: args.postId });
    await ctx.db.patch("feedPosts", post._id, { likes: post.likes + 1 });
    return { liked: true, likes: post.likes + 1 };
  },
});

/**
 * Copies a catalog product into the closet with its photo and descriptor, so the stylist can use it.
 * The photo stays the catalog's file: it is not claimed as the user's media, so deleting the item
 * never deletes the shared product image.
 */
export const addToCloset = mutation({
  args: { closetCode: v.string(), productId: v.id("products") },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx, args.closetCode);
    const product = await ctx.db.get(args.productId);
    if (!product) fail("NOT_FOUND", "That product is gone.");
    const owned = await ctx.db.query("items").withIndex("by_ownerId", (q) => q.eq("ownerId", profile._id)).take(500);
    const existing = owned.find((i) => i.sourceProductId === product._id && i.availability !== "retired");
    if (existing) return { itemId: existing._id, alreadyOwned: true };
    const brand = (await brandNames(ctx)).get(product.brandSlug) ?? product.brandSlug;
    const itemId = await ctx.db.insert("items", {
      ownerId: profile._id,
      name: `${brand} ${product.name.charAt(0).toLowerCase()}${product.name.slice(1)}`,
      category: product.category,
      subtype: product.subtype,
      color: product.color,
      colorHex: product.colorHex,
      photoStorageId: product.imageStorageId,
      availability: "available",
      wearCount: 0,
      wearsSinceWash: 0,
      isPrivate: false,
      cut: product.cut,
      descriptor: product.descriptor,
      sourceProductId: product._id,
    });
    return { itemId, alreadyOwned: false };
  },
});

type GapRule = {
  gapId: string;
  title: string;
  /** Returns the reason when the closet has this gap, else null. */
  check: (owned: (Doc<"items"> & Traits)[]) => string | null;
  fits: (p: Doc<"products"> & Traits) => boolean;
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const GAP_RULES: GapRule[] = [
  {
    gapId: "smart-shoes",
    title: "Smart shoes",
    check: (o) => {
      const shoes = o.filter((i) => i.category === "shoes");
      return shoes.some((i) => i.formality >= 4) ? null : `You own ${count(shoes.length, "pair of shoes", "pairs of shoes")} and none dressy enough for the office or a dinner.`;
    },
    fits: (p) => p.category === "shoes" && p.formality >= 4,
  },
  {
    gapId: "warm-coat",
    title: "A warm coat",
    check: (o) => (o.some((i) => i.category === "outerwear" && i.warmth >= 4) ? null : "Nothing in your closet is warm enough for a cold day."),
    fits: (p) => p.category === "outerwear" && p.warmth >= 4,
  },
  {
    gapId: "more-tops",
    title: "More tops to rotate",
    check: (o) => {
      const tops = o.filter((i) => i.category === "top").length;
      return tops >= 4 ? null : `You have ${count(tops, "top", "tops")}, so the same one keeps coming back.`;
    },
    fits: (p) => p.category === "top",
  },
  {
    gapId: "casual-bottoms",
    title: "Easy weekend bottoms",
    check: (o) => (o.some((i) => i.category === "bottom" && i.formality <= 2) ? null : "Every pair of trousers you own is on the smart side."),
    fits: (p) => p.category === "bottom" && p.formality <= 2,
  },
  {
    gapId: "smart-layer",
    title: "A smart layer",
    check: (o) => (o.some((i) => i.category === "outerwear" && i.formality >= 4) ? null : "You have no blazer or tailored coat for meetings and dinners."),
    fits: (p) => p.category === "outerwear" && p.formality >= 4,
  },
  {
    gapId: "knitwear",
    title: "A knit for cooler days",
    check: (o) => (o.some((i) => i.category === "top" && i.warmth >= 3) ? null : "None of your tops are warm on their own."),
    fits: (p) => p.category === "top" && p.warmth >= 3,
  },
];

/** Shop: what the closet is missing, each gap with the catalog pieces that fill it best. */
export const gaps = query({
  args: { closetCode: v.string() },
  handler: async (ctx, args) => {
    const profile = await findProfile(ctx, args.closetCode);
    const owned = profile ? (await ownedItems(ctx, profile._id)).filter(isWearable).map((i) => ({ ...i, ...traits(i) })) : [];
    const ownedProducts = new Set(owned.map((i) => i.sourceProductId).filter(Boolean));
    const products = (await ctx.db.query("products").take(300))
      .filter((p) => isWearable(p) && !ownedProducts.has(p._id))
      .map((p) => ({ ...p, ...traits(p) }));
    const names = await brandNames(ctx);
    const out = [];
    for (const rule of GAP_RULES) {
      const reason = rule.check(owned);
      if (!reason) continue;
      const picks = products
        .filter(rule.fits)
        .map((p) => ({ p, pairs: owned.filter((i) => p.pairsWith.includes(i.category)).length }))
        .sort((a, b) => b.pairs - a.pairs || a.p.priceCents - b.p.priceCents)
        .slice(0, 4);
      if (!picks.length) continue;
      const items = [];
      for (const { p, pairs } of picks) {
        items.push({
          productId: p._id,
          name: p.name,
          brandName: names.get(p.brandSlug) ?? p.brandSlug,
          category: p.category,
          imageUrl: p.imageStorageId ? await ctx.storage.getUrl(p.imageStorageId) : null,
          priceCents: p.priceCents,
          summary: p.descriptor?.summary ?? "",
          pairsWithCount: pairs,
        });
      }
      out.push({ gapId: rule.gapId, title: rule.title, reason, products: items });
      if (out.length === 4) break;
    }
    return out;
  },
});

