import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { fail } from "./lib";

/**
 * Whop checkouts for catalog products, and the DRIPP- deal codes as Whop promo codes.
 * WHOP_API_KEY stays in the Convex env and never reaches the app.
 * WHOP_ENVIRONMENT picks the Whop sandbox (the default: test cards, no money moves) or "production".
 *
 * A checkout is created at the product's full price. A redeemed code is applied by Whop itself: the
 * hosted checkout opens with `?promoCode=`, so Whop's page shows the discount and charges the discounted total.
 */

const API_VERSION_DATE = "2026-11-14";

const isSandbox = () => process.env.WHOP_ENVIRONMENT !== "production";
const apiBase = () => (isSandbox() ? "https://sandbox-api.whop.com/api/v1" : "https://api.whop.com/api/v1");

function whopKey() {
  const key = process.env.WHOP_API_KEY;
  if (!key) fail("WHOP_NOT_CONFIGURED", "Whop checkout is not set up on this backend (WHOP_API_KEY is missing).");
  return key;
}

/** Calls the Whop API and returns the parsed JSON body; throws a ConvexError naming `what` failed, with Whop's message. */
async function whopFetch(key: string, what: string, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}) {
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Api-Version-Date": API_VERSION_DATE,
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    console.error("whop request failed", what, error);
    fail("WHOP_UNREACHABLE", "Could not reach Whop. Try again in a moment.");
  }
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok) {
    console.error("whop rejected", what, res.status, text.slice(0, 500));
    const message = (body?.error as { message?: unknown } | undefined)?.message;
    fail("WHOP_FAILED", `Whop could not ${what} (HTTP ${res.status})${typeof message === "string" ? ": " + message : ""}`);
  }
  return body ?? {};
}

export type CodeCheck =
  | { ok: true; code: string; dealId: Id<"deals">; discountPct: number; brandSlug: string; brandName: string; expiresAt: number }
  | { ok: false; reason: "empty" | "unknown" | "wrong_deal" | "wrong_brand" | "no_discount" | "expired"; message: string };

const brandName = async (ctx: QueryCtx, slug: string) =>
  (await ctx.db.query("brands").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())?.name ?? slug;

/**
 * Validates a typed deal code. With a dealId it must be that deal's code; with a product it must be a code for
 * the product's brand. Codes for a free repair take no money off, so they never apply to a checkout.
 */
async function checkCode(ctx: QueryCtx, raw: string, scope: { dealId?: Id<"deals">; product?: Doc<"products"> }, now: number): Promise<CodeCheck & { deal?: Doc<"deals"> }> {
  const code = raw.trim().toUpperCase();
  if (!code) return { ok: false, reason: "empty", message: "Enter a code first." };
  const deal = await ctx.db.query("deals").withIndex("by_code", (q) => q.eq("code", code)).first();
  if (!deal) return { ok: false, reason: "unknown", message: `${code} isn't a Dripp code. Check the spelling and try again.` };
  const brand = await brandName(ctx, deal.brandSlug);
  if (scope.dealId && scope.dealId !== deal._id) return { ok: false, reason: "wrong_deal", message: `${code} is for the ${brand} deal, not this one.` };
  if (scope.product && scope.product.brandSlug !== deal.brandSlug) {
    return { ok: false, reason: "wrong_brand", message: `${code} only works on ${brand} pieces.` };
  }
  if (deal.discountPct <= 0) return { ok: false, reason: "no_discount", message: `${code} is for a ${deal.title.toLowerCase()}, not money off a purchase.` };
  if (deal.expiresAt < now) return { ok: false, reason: "expired", message: `${code} expired on ${new Date(deal.expiresAt).toISOString().slice(0, 10)}.` };
  return { ok: true, code, dealId: deal._id, discountPct: deal.discountPct, brandSlug: deal.brandSlug, brandName: brand, expiresAt: deal.expiresAt, deal };
}

const publicCheck = (check: CodeCheck & { deal?: unknown }): CodeCheck => {
  const { deal: _deal, ...rest } = check;
  return rest as CodeCheck;
};

export const codeCheck = internalQuery({
  args: { code: v.string(), dealId: v.optional(v.id("deals")), productId: v.optional(v.id("products")), now: v.number() },
  handler: async (ctx, args): Promise<CodeCheck> => {
    const product = args.productId ? await ctx.db.get(args.productId) : null;
    if (args.productId && !product) fail("NOT_FOUND", "That product is no longer in the catalog.");
    return publicCheck(await checkCode(ctx, args.code, { dealId: args.dealId, product: product ?? undefined }, args.now));
  },
});

/** Redeem code: checks a typed code for one deal (dealId) or one product's brand (productId) and returns its discount or why it can't be used. */
export const redeemCode = action({
  args: { code: v.string(), dealId: v.optional(v.id("deals")), productId: v.optional(v.id("products")) },
  handler: async (ctx, args): Promise<CodeCheck> => ctx.runQuery(internal.whop.codeCheck, { ...args, now: Date.now() }),
});

export const productForCheckout = internalQuery({
  args: { productId: v.id("products"), dealId: v.optional(v.id("deals")), code: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) fail("NOT_FOUND", "That product is no longer in the catalog.");
    const deal = args.dealId ? await ctx.db.get(args.dealId) : null;
    if (args.dealId && !deal) fail("NOT_FOUND", "That deal is no longer available.");
    if (deal && deal.brandSlug !== product.brandSlug) fail("BAD_DEAL", "That deal is for a different brand.");
    if (deal && deal.expiresAt < args.now) fail("DEAL_EXPIRED", "That deal has expired.");
    let promo: { code: string; dealId: Id<"deals">; discountPct: number; expiresAt: number; whopPromo: Doc<"deals">["whopPromo"] } | null = null;
    if (args.code !== undefined) {
      const check = await checkCode(ctx, args.code, { dealId: args.dealId, product }, args.now);
      if (!check.ok) fail("BAD_CODE", check.message);
      promo = { code: check.code, dealId: check.dealId, discountPct: check.discountPct, expiresAt: check.expiresAt, whopPromo: check.deal?.whopPromo };
    }
    return {
      productId: product._id,
      brandName: await brandName(ctx, product.brandSlug),
      name: product.name,
      priceCents: product.priceCents,
      promo,
    };
  },
});

/** Price in dollars after a percentage discount, rounded to the cent. */
export const discounted = (priceCents: number, pct: number) => Math.round(priceCents * (1 - pct / 100)) / 100;

const whopCode = (code: string) => code.trim().toLowerCase();

/** The Whop account that owns the API key; promo codes are created under it. */
async function whopAccountId(key: string) {
  const me = await whopFetch(key, "load the account for this API key", "/accounts/me");
  if (typeof me.id !== "string") fail("WHOP_FAILED", "Whop did not return the account for this API key.");
  return me.id;
}

/** Every active promo code on the account, keyed by lowercase code (Whop stores codes in lowercase). */
async function whopPromoIds(key: string, accountId: string) {
  const ids = new Map<string, string>();
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ account_id: accountId, first: "100", ...(after ? { after } : {}) });
    const body = await whopFetch(key, "list promo codes", `/promo_codes?${query}`);
    for (const promo of (body.data as { id?: unknown; code?: unknown; status?: unknown }[] | undefined) ?? []) {
      if (typeof promo.id === "string" && typeof promo.code === "string" && promo.status !== "archived") ids.set(whopCode(promo.code), promo.id);
    }
    const info = body.page_info as { has_next_page?: boolean; end_cursor?: string | null } | undefined;
    if (!info?.has_next_page || !info.end_cursor) break;
    after = info.end_cursor;
  }
  return ids;
}

/** Creates the Whop promo code for one deal: a percentage off, once, no redemption limit, ending with the deal. */
async function createWhopPromo(key: string, accountId: string, deal: { code: string; discountPct: number; expiresAt: number }) {
  const promo = await whopFetch(key, `create promo code ${deal.code}`, "/promo_codes", {
    method: "POST",
    idempotencyKey: `dripp-promo-${whopCode(deal.code)}-${deal.discountPct}`,
    body: {
      account_id: accountId,
      code: deal.code,
      amount_off: deal.discountPct,
      promo_type: "percentage",
      base_currency: "usd",
      new_users_only: false,
      promo_duration_months: 1,
      unlimited_stock: true,
      one_per_customer: false,
      expires_at: new Date(deal.expiresAt).toISOString(),
    },
  });
  if (typeof promo.id !== "string") fail("WHOP_FAILED", `Whop did not return an id for promo code ${deal.code}.`);
  return promo.id;
}

export const discountDeals = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("deals").take(500)).filter((d) => d.discountPct > 0),
});

export const setWhopPromo = internalMutation({
  args: { dealId: v.id("deals"), id: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("deals", args.dealId, { whopPromo: { id: args.id, code: args.code } });
  },
});

/**
 * Makes every discount deal's code a Whop promo code and stores the Whop promo id on the deal.
 * Idempotent: a deal whose stored promo matches its code is skipped, and a code that already exists in Whop
 * is linked instead of created. Run after catalog:refreshDealCopy, since that can change codes.
 */
export const syncPromoCodes = internalAction({
  args: {},
  handler: async (ctx): Promise<{ created: string[]; linked: string[]; unchanged: string[] }> => {
    const key = whopKey();
    const deals: Doc<"deals">[] = await ctx.runQuery(internal.whop.discountDeals, {});
    const result = { created: [] as string[], linked: [] as string[], unchanged: [] as string[] };
    const todo = deals.filter((d) => d.whopPromo?.code !== whopCode(d.code));
    result.unchanged = deals.filter((d) => !todo.includes(d)).map((d) => d.code);
    if (!todo.length) return result;
    const accountId = await whopAccountId(key);
    const existing = await whopPromoIds(key, accountId);
    for (const deal of todo) {
      let id = existing.get(whopCode(deal.code));
      if (id) result.linked.push(deal.code);
      else {
        id = await createWhopPromo(key, accountId, deal);
        existing.set(whopCode(deal.code), id);
        result.created.push(deal.code);
      }
      await ctx.runMutation(internal.whop.setWhopPromo, { dealId: deal._id, id, code: whopCode(deal.code) });
    }
    return result;
  },
});

/**
 * Creates a one-time Whop checkout for one product at its full price. With a code, the code is checked here
 * (and against dealId when given), its Whop promo code is created if the sync has not run yet, and the checkout
 * URL carries `promoCode` so Whop applies the discount. Returns the hosted checkout URL to open in a browser.
 */
export const checkout = action({
  args: { productId: v.id("products"), dealId: v.optional(v.id("deals")), code: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; price: number; listPrice: number; pct: number; code: string | null; sandbox: boolean }> => {
    const key = whopKey();
    const p = await ctx.runQuery(internal.whop.productForCheckout, { ...args, now: Date.now() });
    const promo = p.promo;
    if (promo && promo.whopPromo?.code !== whopCode(promo.code)) {
      const accountId = await whopAccountId(key);
      const id = (await whopPromoIds(key, accountId)).get(whopCode(promo.code)) ?? (await createWhopPromo(key, accountId, promo));
      await ctx.runMutation(internal.whop.setWhopPromo, { dealId: promo.dealId, id, code: whopCode(promo.code) });
    }
    const listPrice = p.priceCents / 100;
    const pct = promo?.discountPct ?? 0;
    const body = await whopFetch(key, "create the checkout", "/checkout_configurations", {
      method: "POST",
      body: {
        variant: {
          title: `${p.brandName} ${p.name}`.slice(0, 80),
          description: promo ? `${pct}% off with code ${promo.code}` : undefined,
          billing_type: "one_time",
          initial_price: listPrice,
          currency: "usd",
        },
        metadata: { source: "wear-again", productId: p.productId, ...(promo ? { dealId: promo.dealId, promoCode: promo.code } : {}) },
      },
    });
    if (typeof body.purchase_url !== "string") fail("WHOP_FAILED", "Whop returned a checkout without a purchase URL.");
    const url = new URL(body.purchase_url);
    if (promo) url.searchParams.set("promoCode", promo.code);
    return { url: url.toString(), price: discounted(p.priceCents, pct), listPrice, pct, code: promo?.code ?? null, sandbox: isSandbox() };
  },
});
