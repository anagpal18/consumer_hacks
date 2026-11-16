import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const D = (formality: number, warmth: number) => ({
  fabric: "cotton",
  fit: "regular",
  pattern: "",
  formality,
  warmth,
  seasons: ["autumn"],
  occasions: ["office"],
  summary: `formality ${formality}`,
});

async function setup() {
  const t = convexTest(schema, modules);
  const img = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })));
  const P = (name: string, category: string, subtype: string, formality: number, warmth: number, cut = "mens") => ({
    brandSlug: "zara",
    name,
    category: category as "top",
    subtype,
    color: "black",
    colorHex: "#1E1E1E",
    priceCents: 5000,
    imageStorageId: img,
    cut: cut as "mens",
    descriptor: D(formality, warmth),
  });
  await t.mutation(internal.catalog.importPhotographed, {
    products: [
      P("Black blazer", "outerwear", "blazer", 4, 2),
      P("Camel overcoat", "outerwear", "overcoat", 4, 5),
      P("White oxford", "top", "oxford shirt", 4, 2),
      P("Grey hoodie", "top", "hoodie", 1, 3),
      P("Navy knit", "top", "crewneck", 3, 3),
      P("Dark jeans", "bottom", "jeans", 2, 2),
      P("Charcoal trousers", "bottom", "trousers", 4, 2),
      P("White sneakers", "shoes", "sneakers", 1, 2),
      P("Black derbies", "shoes", "derbies", 4, 2),
      P("Slip dress", "dress", "slip dress", 4, 1, "womens"),
      P("Leggings", "bottom", "leggings", 1, 2, "womens"),
    ],
  });
  const products = await t.run((ctx) => ctx.db.query("products").collect());
  const id = (name: string) => products.find((p) => p.name === name)!._id as Id<"products">;
  return { t, id };
}

test("reels are brand-only menswear looks with likes and add-to-closet state", async () => {
  const { t, id } = await setup();
  const code = "demo-reels-test";
  const page = await t.query(api.catalog.reels, { closetCode: code, limit: 5 });
  expect(page.posts).toHaveLength(5);
  for (const post of page.posts) {
    expect(post.pieces.length).toBeGreaterThan(0);
    expect(post.pieces.every((p) => p.category !== "dress" && p.name !== "Leggings")).toBe(true);
    expect(post.pieces.every((p) => p.imageUrl && p.summary)).toBe(true);
    expect(post.likedByMe).toBe(false);
  }
  const next = await t.query(api.catalog.reels, { closetCode: code, limit: 5, after: page.next! });
  expect(next.posts[0].rank).toBeGreaterThan(page.posts[4].rank);

  const post = page.posts[0];
  const liked = await t.mutation(api.catalog.toggleLike, { closetCode: code, postId: post.postId });
  expect(liked).toEqual({ liked: true, likes: post.likes + 1 });
  expect((await t.query(api.catalog.reels, { closetCode: code, limit: 1 })).posts[0].likedByMe).toBe(true);
  expect((await t.query(api.catalog.reels, { closetCode: "demo-someone-else", limit: 1 })).posts[0].likedByMe).toBe(false);
  expect(await t.mutation(api.catalog.toggleLike, { closetCode: code, postId: post.postId })).toEqual({ liked: false, likes: post.likes });

  const piece = post.pieces[0];
  const added = await t.mutation(api.catalog.addToCloset, { closetCode: code, productId: piece.productId as Id<"products"> });
  expect(added.alreadyOwned).toBe(false);
  expect((await t.mutation(api.catalog.addToCloset, { closetCode: code, productId: piece.productId as Id<"products"> })).alreadyOwned).toBe(true);
  const after = await t.query(api.catalog.reels, { closetCode: code, limit: 1 });
  expect(after.posts[0].pieces.find((p) => p.productId === piece.productId)!.inCloset).toBe(true);
  const closet = await t.query(api.closet.list, { closetCode: code });
  expect(closet).toHaveLength(1);
  expect(closet[0].media.url).toBeTruthy();

  // Deleting the copied item must not delete the shared catalog photo.
  await t.mutation(api.closet.deleteItem, { closetCode: code, itemId: added.itemId });
  const stillThere = await t.run(async (ctx) => {
    const p = await ctx.db.get(id("Black blazer"));
    return ctx.storage.getUrl(p!.imageStorageId!);
  });
  expect(stillThere).toBeTruthy();
});

test("gaps name what a small closet lacks and suggest pieces that fill it", async () => {
  const { t, id } = await setup();
  const code = "demo-gaps-test";
  for (const name of ["White oxford", "Charcoal trousers", "White sneakers"]) {
    await t.mutation(api.catalog.addToCloset, { closetCode: code, productId: id(name) });
  }
  const gaps = await t.query(api.catalog.gaps, { closetCode: code });
  const byId = Object.fromEntries(gaps.map((g) => [g.gapId, g]));
  expect(byId["smart-shoes"].products.map((p) => p.name)).toEqual(["Black derbies"]);
  expect(byId["warm-coat"].products.map((p) => p.name)).toEqual(["Camel overcoat"]);
  expect(byId["more-tops"].products.map((p) => p.name)).not.toContain("White oxford");
  expect(gaps.length).toBeLessThanOrEqual(4);
  for (const g of gaps) {
    expect(g.reason.length).toBeGreaterThan(10);
    expect(g.products.every((p) => p.name !== "Slip dress" && p.name !== "Leggings")).toBe(true);
  }

  await t.mutation(api.catalog.addToCloset, { closetCode: code, productId: id("Black derbies") });
  const after = await t.query(api.catalog.gaps, { closetCode: code });
  expect(after.find((g) => g.gapId === "smart-shoes")).toBeUndefined();
});

test("the stylist never offers dresses or womenswear to a menswear profile", async () => {
  const t = convexTest(schema, modules);
  const code = "demo-menswear-test";
  await t.mutation(api.closet.addItem, { closetCode: code, category: "dress", color: "red", subtype: "slip dress" });
  await t.mutation(api.closet.addItem, { closetCode: code, category: "top", color: "black", subtype: "t-shirt" });
  const ctxItems = await t.query(internal.stylist.context, { closetCode: code });
  expect(ctxItems.map((i) => i.subtype)).toEqual(["t-shirt"]);
});
