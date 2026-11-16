import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("WHOP_API_KEY", "test-whop-key");
  vi.stubEnv("WHOP_ENVIRONMENT", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const whopOk = (url = "https://sandbox.whop.com/checkout/ch_test123/") =>
  new Response(JSON.stringify({ id: "ch_test123", purchase_url: url, redirect_url: null }), { status: 200, headers: { "content-type": "application/json" } });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const img = await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" }));
    await ctx.db.insert("brands", { slug: "zara", name: "Zara", tagline: "t", colorHex: "#111111" });
    await ctx.db.insert("brands", { slug: "hm", name: "H&M", tagline: "t", colorHex: "#CC071E" });
    const base = { category: "outerwear" as const, subtype: "blazer", color: "black", colorHex: "#1E1E1E", pairsWith: ["top" as const] };
    const blazer = await ctx.db.insert("products", { ...base, brandSlug: "zara", name: "Black blazer", priceCents: 12900, imageStorageId: img, cut: "mens" });
    const dress = await ctx.db.insert("products", { ...base, brandSlug: "zara", name: "Slip dress", category: "dress", priceCents: 9900, cut: "womens" });
    const hmTee = await ctx.db.insert("products", { ...base, brandSlug: "hm", name: "White tee", category: "top", priceCents: 1500 });
    const deal = { title: "10% off", description: "d", code: "SAMPLE", pointsCost: 300, expiresAt: Date.now() + 86_400_000 };
    const zara10 = await ctx.db.insert("deals", { ...deal, brandSlug: "zara", discountPct: 10 });
    const hm20 = await ctx.db.insert("deals", { ...deal, brandSlug: "hm", discountPct: 20 });
    const expired = await ctx.db.insert("deals", { ...deal, brandSlug: "zara", discountPct: 50, expiresAt: Date.now() - 1000 });
    return { blazer, dress, hmTee, zara10, hm20, expired };
  });
  return { t, ...ids };
}

test("brandProducts lists a brand's wearable products with photo URLs", async () => {
  const { t, blazer } = await setup();
  const rows = await t.query(api.catalog.brandProducts, { brandSlug: "zara" });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ productId: blazer, name: "Black blazer", priceCents: 12900 });
  expect(rows[0].imageUrl).toMatch(/^https?:/);
  expect(await t.query(api.catalog.brandProducts, { brandSlug: "nobody" })).toEqual([]);
});

test("checkout applies the deal discount and creates a sandbox Whop checkout", async () => {
  const { t, blazer, zara10 } = await setup();
  fetchMock.mockResolvedValueOnce(whopOk());
  const result = await t.action(api.whop.checkout, { productId: blazer, dealId: zara10 });
  expect(result).toEqual({ url: "https://sandbox.whop.com/checkout/ch_test123/", price: 116.1, pct: 10, sandbox: true });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://sandbox-api.whop.com/api/v1/checkout_configurations");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer test-whop-key");
  const body = JSON.parse(init.body);
  expect(body.variant).toMatchObject({ title: "Zara Black blazer", billing_type: "one_time", initial_price: 116.1, currency: "usd" });
  expect(body.metadata).toEqual({ source: "wear-again", productId: blazer, dealId: zara10 });
});

test("checkout without a deal charges full price; production env uses the live API", async () => {
  const { t, blazer } = await setup();
  vi.stubEnv("WHOP_ENVIRONMENT", "production");
  fetchMock.mockResolvedValueOnce(whopOk("https://whop.com/checkout/ch_live/"));
  expect(await t.action(api.whop.checkout, { productId: blazer })).toEqual({ url: "https://whop.com/checkout/ch_live/", price: 129, pct: 0, sandbox: false });
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.whop.com/api/v1/checkout_configurations");
});

test("checkout validates the product and deal before calling Whop", async () => {
  const { t, blazer, hmTee, hm20, expired } = await setup();
  const gone = await t.run(async (ctx) => {
    const id = await ctx.db.insert("products", { brandSlug: "zara", name: "Gone", category: "top", subtype: "t-shirt", color: "black", colorHex: "#000000", priceCents: 100, pairsWith: [] });
    await ctx.db.delete(id);
    return id;
  });
  const goneDeal = await t.run(async (ctx) => {
    const id = await ctx.db.insert("deals", { brandSlug: "zara", title: "x", description: "x", code: "x", discountPct: 5, pointsCost: 1, expiresAt: Date.now() + 1000 });
    await ctx.db.delete(id);
    return id;
  });
  await expect(t.action(api.whop.checkout, { productId: gone })).rejects.toThrow(/no longer in the catalog/);
  await expect(t.action(api.whop.checkout, { productId: blazer, dealId: goneDeal })).rejects.toThrow(/deal is no longer available/);
  await expect(t.action(api.whop.checkout, { productId: blazer, dealId: hm20 })).rejects.toThrow(/different brand/);
  await expect(t.action(api.whop.checkout, { productId: blazer, dealId: expired })).rejects.toThrow(/expired/);
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(whopOk());
  expect(await t.action(api.whop.checkout, { productId: hmTee, dealId: hm20 })).toMatchObject({ price: 12, pct: 20 });
});

test("checkout reports a missing key and Whop failures clearly", async () => {
  const { t, blazer } = await setup();
  vi.stubEnv("WHOP_API_KEY", "");
  await expect(t.action(api.whop.checkout, { productId: blazer })).rejects.toThrow(/WHOP_API_KEY is missing/);
  expect(fetchMock).not.toHaveBeenCalled();

  vi.stubEnv("WHOP_API_KEY", "test-whop-key");
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { type: "unauthorized", message: "Authentication failed" } }), { status: 401 }));
  await expect(t.action(api.whop.checkout, { productId: blazer })).rejects.toThrow(/HTTP 401\): Authentication failed/);

  fetchMock.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 502 }));
  await expect(t.action(api.whop.checkout, { productId: blazer })).rejects.toThrow(/HTTP 502/);

  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "ch_x" }), { status: 200 }));
  await expect(t.action(api.whop.checkout, { productId: blazer })).rejects.toThrow(/without a purchase URL/);

  fetchMock.mockRejectedValueOnce(new TypeError("network down"));
  await expect(t.action(api.whop.checkout, { productId: blazer })).rejects.toThrow(/Could not reach Whop/);
});
