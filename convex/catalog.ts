import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { category as categoryValidator } from "./schema";
import { findProfile, type Category } from "./lib";
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
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const table of ["brands", "deals", "products", "feedPosts"] as const) {
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
    for (const p of args.products) await ctx.db.insert("products", { ...p, pairsWith: PAIRS[p.category] ?? ["top", "bottom"] });

    const by = (cat: string, slug?: string) => args.products.filter((p) => p.category === cat && (!slug || p.brandSlug === slug));
    const POSTS = 48;
    for (let i = 0; i < POSTS; i++) {
      const kind = i % 3 === 0 ? ("brand" as const) : i % 3 === 1 ? ("friend" as const) : ("creator" as const);
      const slug = slugs[i % slugs.length];
      const from = (cat: string) => {
        const own = kind === "brand" ? by(cat, slug) : [];
        return own.length ? pick(own) : by(cat).length ? pick(by(cat)) : undefined;
      };
      const useDress = r() < 0.2 && by("dress").length > 0;
      const look = (useDress ? [from("outerwear"), from("dress"), from("shoes")] : [from("outerwear"), from("top"), from("bottom"), from("shoes")]).filter(
        (p): p is (typeof args.products)[number] => !!p,
      );
      const author = kind === "brand" ? (BRAND_INFO[slug]?.[0] ?? slug) : kind === "friend" ? pick(PEOPLE) : pick(CREATORS);
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
    const products = await ctx.db.query("products").take(300);
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
