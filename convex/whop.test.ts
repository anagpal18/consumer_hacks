import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const whopOk = (url = "https://sandbox.whop.com/checkout/ch_test123/") => json({ id: "ch_test123", purchase_url: url, redirect_url: null });

/** Fake Whop API: one account, a promo code list, promo creation and checkout creation. Records every call. */
function fakeWhop(existing: { id: string; code: string }[] = []) {
  const promos = [...existing.map((p) => ({ ...p, status: "active" }))];
  let next = 1;
  fetchMock.mockImplementation(async (url: string, init: { method?: string; body?: string }) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? "GET";
    if (method === "GET" && pathname === "/api/v1/accounts/me") return json({ id: "biz_test" });
    if (method === "GET" && pathname === "/api/v1/promo_codes") return json({ data: promos, page_info: { has_next_page: false, end_cursor: null } });
    if (method === "POST" && pathname === "/api/v1/promo_codes") {
      const body = JSON.parse(init.body!);
      const promo = { id: `promo_${next++}`, code: String(body.code).toLowerCase(), status: "active" };
      promos.push(promo);
      return json({ ...promo, amount_off: body.amount_off / 100, promo_type: body.promo_type });
    }
    if (method === "POST" && pathname === "/api/v1/checkout_configurations") return whopOk();
    return json({ error: { message: "not found" } }, 404);
  });
  const calls = () =>
    fetchMock.mock.calls.map((call) => {
      const [url, init] = call as [string, { method?: string; body?: string; headers: Record<string, string> }];
      return { method: init?.method ?? "GET", path: new URL(url).pathname, body: init?.body ? JSON.parse(init.body) : undefined, headers: init.headers };
    });
  return { calls };
}

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
    const deal = { title: "10% off", description: "d", pointsCost: 300, expiresAt: Date.now() + 86_400_000 };
    const zara10 = await ctx.db.insert("deals", { ...deal, brandSlug: "zara", code: "DRIPP-ZARA-10", discountPct: 10 });
    const hm20 = await ctx.db.insert("deals", { ...deal, brandSlug: "hm", code: "DRIPP-HM-20", discountPct: 20 });
    const expired = await ctx.db.insert("deals", { ...deal, brandSlug: "zara", code: "DRIPP-ZARA-50", discountPct: 50, expiresAt: Date.now() - 1000 });
    const zaraFix = await ctx.db.insert("deals", { ...deal, title: "Free repair or alteration", brandSlug: "zara", code: "DRIPP-ZARA-FIX", discountPct: 0 });
    return { blazer, dress, hmTee, zara10, hm20, expired, zaraFix };
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

test("checkout without a code charges full price, even for a deal; production env uses the live API", async () => {
  const { t, blazer, zara10 } = await setup();
  fetchMock.mockResolvedValueOnce(whopOk());
  expect(await t.action(api.whop.checkout, { productId: blazer, dealId: zara10 })).toEqual({
    url: "https://sandbox.whop.com/checkout/ch_test123/",
    price: 129,
    listPrice: 129,
    pct: 0,
    code: null,
    sandbox: true,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://sandbox-api.whop.com/api/v1/checkout_configurations");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer test-whop-key");
  const body = JSON.parse(init.body);
  expect(body.variant).toMatchObject({ title: "Zara Black blazer", billing_type: "one_time", initial_price: 129, currency: "usd" });
  expect(body.variant.description).toBeUndefined();
  expect(body.metadata).toEqual({ source: "wear-again", productId: blazer });

  vi.stubEnv("WHOP_ENVIRONMENT", "production");
  fetchMock.mockResolvedValueOnce(whopOk("https://whop.com/checkout/ch_live/"));
  expect(await t.action(api.whop.checkout, { productId: blazer })).toMatchObject({ url: "https://whop.com/checkout/ch_live/", price: 129, pct: 0, sandbox: false });
  expect(fetchMock.mock.calls[1][0]).toBe("https://api.whop.com/api/v1/checkout_configurations");
});

test("checkout with a code creates the Whop promo once, keeps the full price and opens Whop with promoCode", async () => {
  const { t, blazer, zara10 } = await setup();
  const whop = fakeWhop();
  const result = await t.action(api.whop.checkout, { productId: blazer, dealId: zara10, code: " dripp-zara-10 " });
  expect(result).toEqual({
    url: "https://sandbox.whop.com/checkout/ch_test123/?promoCode=DRIPP-ZARA-10",
    price: 116.1,
    listPrice: 129,
    pct: 10,
    code: "DRIPP-ZARA-10",
    sandbox: true,
  });
  const calls = whop.calls();
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "GET /api/v1/accounts/me",
    "GET /api/v1/promo_codes",
    "POST /api/v1/promo_codes",
    "POST /api/v1/checkout_configurations",
  ]);
  expect(calls[2].body).toMatchObject({ account_id: "biz_test", code: "DRIPP-ZARA-10", amount_off: 10, promo_type: "percentage", base_currency: "usd", unlimited_stock: true });
  expect(calls[2].headers["Idempotency-Key"]).toBe("dripp-promo-dripp-zara-10-10");
  expect(calls[3].body.variant).toMatchObject({ initial_price: 129, description: "10% off with code DRIPP-ZARA-10" });
  expect(calls[3].body.metadata).toEqual({ source: "wear-again", productId: blazer, dealId: zara10, promoCode: "DRIPP-ZARA-10" });
  expect((await t.run((ctx) => ctx.db.get(zara10)))?.whopPromo).toEqual({ id: "promo_1", code: "dripp-zara-10" });

  fetchMock.mockClear();
  expect(await t.action(api.whop.checkout, { productId: blazer, code: "DRIPP-ZARA-10" })).toMatchObject({ pct: 10, code: "DRIPP-ZARA-10" });
  expect(whop.calls().map((c) => c.path)).toEqual(["/api/v1/checkout_configurations"]);
});

test("checkout refuses bad codes before calling Whop", async () => {
  const { t, blazer, hmTee, zara10, hm20 } = await setup();
  await expect(t.action(api.whop.checkout, { productId: blazer, code: "DRIPP-NOPE-10" })).rejects.toThrow(/isn't a Dripp code/);
  await expect(t.action(api.whop.checkout, { productId: blazer, code: "DRIPP-HM-20" })).rejects.toThrow(/only works on H&M pieces/);
  await expect(t.action(api.whop.checkout, { productId: hmTee, dealId: hm20, code: "DRIPP-ZARA-10" })).rejects.toThrow(/is for the Zara deal, not this one/);
  await expect(t.action(api.whop.checkout, { productId: blazer, code: "DRIPP-ZARA-50" })).rejects.toThrow(/DRIPP-ZARA-50 expired on/);
  await expect(t.action(api.whop.checkout, { productId: blazer, code: "DRIPP-ZARA-FIX" })).rejects.toThrow(/free repair or alteration, not money off/);
  await expect(t.action(api.whop.checkout, { productId: blazer, dealId: zara10, code: "" })).rejects.toThrow(/Enter a code/);
  expect(fetchMock).not.toHaveBeenCalled();
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

  fakeWhop([{ id: "promo_hm", code: "dripp-hm-20" }]);
  expect(await t.action(api.whop.checkout, { productId: hmTee, dealId: hm20, code: "DRIPP-HM-20" })).toMatchObject({ price: 12, listPrice: 15, pct: 20 });
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

test("redeemCode accepts a deal's code and explains every refusal", async () => {
  const { t, blazer, hmTee, zara10, hm20 } = await setup();
  const ok = { ok: true, code: "DRIPP-ZARA-10", dealId: zara10, discountPct: 10, brandSlug: "zara", brandName: "Zara" };
  expect(await t.action(api.whop.redeemCode, { code: "dripp-zara-10 ", dealId: zara10 })).toMatchObject(ok);
  expect(await t.action(api.whop.redeemCode, { code: "DRIPP-ZARA-10", productId: blazer })).toMatchObject(ok);
  expect(await t.action(api.whop.redeemCode, { code: "DRIPP-ZARA-10" })).toMatchObject(ok);

  const refused = async (args: { code: string; dealId?: typeof zara10; productId?: typeof blazer }, reason: string, message: RegExp) => {
    const result = await t.action(api.whop.redeemCode, args);
    expect(result).toMatchObject({ ok: false, reason });
    expect(result.ok === false && result.message).toMatch(message);
  };
  await refused({ code: "  " }, "empty", /Enter a code/);
  await refused({ code: "DRIPP-ZARA-99", dealId: zara10 }, "unknown", /DRIPP-ZARA-99 isn't a Dripp code/);
  await refused({ code: "DRIPP-HM-20", dealId: zara10 }, "wrong_deal", /DRIPP-HM-20 is for the H&M deal, not this one/);
  await refused({ code: "DRIPP-ZARA-10", productId: hmTee }, "wrong_brand", /DRIPP-ZARA-10 only works on Zara pieces/);
  await refused({ code: "DRIPP-ZARA-50", productId: blazer }, "expired", /DRIPP-ZARA-50 expired on \d{4}-\d{2}-\d{2}/);
  await refused({ code: "DRIPP-ZARA-FIX", productId: blazer }, "no_discount", /not money off a purchase/);
  expect(await t.action(api.whop.redeemCode, { code: "DRIPP-HM-20", dealId: hm20 })).toMatchObject({ ok: true, discountPct: 20 });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("syncPromoCodes creates each discount deal's Whop promo once, links existing ones, and resyncs a changed code", async () => {
  const { t, zara10, hm20, expired, zaraFix } = await setup();
  const whop = fakeWhop([{ id: "promo_existing", code: "dripp-hm-20" }]);

  expect(await t.action(internal.whop.syncPromoCodes, {})).toEqual({ created: ["DRIPP-ZARA-10", "DRIPP-ZARA-50"], linked: ["DRIPP-HM-20"], unchanged: [] });
  const created = whop.calls().filter((c) => c.method === "POST");
  expect(created.map((c) => c.body.code)).toEqual(["DRIPP-ZARA-10", "DRIPP-ZARA-50"]);
  const deals = await t.run(async (ctx) => Promise.all([zara10, hm20, expired, zaraFix].map((id) => ctx.db.get(id))));
  expect(deals.map((d) => d?.whopPromo)).toEqual([{ id: "promo_1", code: "dripp-zara-10" }, { id: "promo_existing", code: "dripp-hm-20" }, { id: "promo_2", code: "dripp-zara-50" }, undefined]);

  fetchMock.mockClear();
  expect(await t.action(internal.whop.syncPromoCodes, {})).toEqual({ created: [], linked: [], unchanged: ["DRIPP-ZARA-10", "DRIPP-HM-20", "DRIPP-ZARA-50"] });
  expect(fetchMock).not.toHaveBeenCalled();

  await t.run((ctx) => ctx.db.patch("deals", zara10, { code: "DRIPP-ZARA-15", discountPct: 15 }));
  expect(await t.action(internal.whop.syncPromoCodes, {})).toMatchObject({ created: ["DRIPP-ZARA-15"], linked: [] });
  expect((await t.run((ctx) => ctx.db.get(zara10)))?.whopPromo).toEqual({ id: "promo_3", code: "dripp-zara-15" });
});
