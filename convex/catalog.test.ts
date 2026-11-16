import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("catalog seeds once and serves brands, deals, feed pages and closet-aware recommendations", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.catalog.seed, {});
  expect(first).toMatchObject({ seeded: true, brands: 20, deals: 40, products: 120, posts: 120 });
  expect(await t.mutation(api.catalog.seed, {})).toEqual({ seeded: false });

  expect(await t.query(api.catalog.brands, {})).toHaveLength(20);
  const deals = await t.query(api.catalog.deals, { brandSlug: "uniqlo" });
  expect(deals).toHaveLength(2);
  expect(deals.every((d) => d.sample && d.code.startsWith("DRIPP-UNIQLO-"))).toBe(true);
  expect(deals.some((d) => /sample/i.test(d.description + d.code))).toBe(false);

  const page1 = await t.query(api.catalog.feed, { limit: 50 });
  expect(page1.posts).toHaveLength(50);
  const page2 = await t.query(api.catalog.feed, { limit: 50, after: page1.next! });
  expect(page2.posts[0].rank).toBe(50);

  expect((await t.query(api.catalog.recommend, { closetCode: "demo-empty-closet" })).every((r) => r.matchCount === 0)).toBe(true);
  await t.mutation(api.demo.seed, { closetCode: "demo-catalog-test" });
  const recs = await t.query(api.catalog.recommend, { closetCode: "demo-catalog-test", limit: 5 });
  expect(recs).toHaveLength(5);
  expect(recs[0].matchCount).toBeGreaterThan(0);
  expect(recs[0].matches.every((m) => !m.name.toLowerCase().includes("socks"))).toBe(true);
});
