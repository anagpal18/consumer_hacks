import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, query } from "./_generated/server";
import { fail } from "./lib";

/**
 * Whop checkouts for catalog products. WHOP_API_KEY stays in the Convex env and never reaches the app.
 * WHOP_ENVIRONMENT picks the Whop sandbox (the default: test cards, no money moves) or "production".
 */

const API_VERSION_DATE = "2026-11-14";

const isSandbox = () => process.env.WHOP_ENVIRONMENT !== "production";

/** Whether the app should label checkouts as test checkouts, and whether checkout is set up at all. */
export const config = query({
  args: {},
  handler: async () => ({ sandbox: isSandbox(), configured: !!process.env.WHOP_API_KEY }),
});

export const productForCheckout = internalQuery({
  args: { productId: v.id("products"), dealId: v.optional(v.id("deals")) },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) fail("NOT_FOUND", "That product is no longer in the catalog.");
    const deal = args.dealId ? await ctx.db.get(args.dealId) : null;
    if (args.dealId && !deal) fail("NOT_FOUND", "That deal is no longer available.");
    if (deal && deal.brandSlug !== product.brandSlug) fail("BAD_DEAL", "That deal is for a different brand.");
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", product.brandSlug))
      .unique();
    return {
      productId: product._id,
      brandName: brand?.name ?? product.brandSlug,
      name: product.name,
      priceCents: product.priceCents,
      dealId: deal?._id ?? null,
      discountPct: deal?.discountPct ?? 0,
      dealExpiresAt: deal?.expiresAt ?? null,
    };
  },
});

/** Price in dollars after a percentage discount, rounded to the cent. */
export const discounted = (priceCents: number, pct: number) => Math.round(priceCents * (1 - pct / 100)) / 100;

/**
 * Creates a one-time Whop checkout for one product, with the brand deal's discount applied when a deal is given.
 * Returns the hosted checkout URL to open in a browser.
 */
export const checkout = action({
  args: { productId: v.id("products"), dealId: v.optional(v.id("deals")) },
  handler: async (ctx, args): Promise<{ url: string; price: number; pct: number; sandbox: boolean }> => {
    const key = process.env.WHOP_API_KEY;
    if (!key) fail("WHOP_NOT_CONFIGURED", "Whop checkout is not set up on this backend (WHOP_API_KEY is missing).");
    const p = await ctx.runQuery(internal.whop.productForCheckout, args);
    if (p.dealExpiresAt !== null && p.dealExpiresAt < Date.now()) fail("DEAL_EXPIRED", "That deal has expired.");
    const price = discounted(p.priceCents, p.discountPct);
    const sandbox = isSandbox();
    const base = sandbox ? "https://sandbox-api.whop.com/api/v1" : "https://api.whop.com/api/v1";

    let res: Response;
    try {
      res = await fetch(`${base}/checkout_configurations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Api-Version-Date": API_VERSION_DATE },
        body: JSON.stringify({
          variant: {
            title: `${p.brandName} ${p.name}`.slice(0, 80),
            description: p.discountPct ? `${p.discountPct}% off with your Wear Again deal` : undefined,
            billing_type: "one_time",
            initial_price: price,
            currency: "usd",
          },
          metadata: { source: "wear-again", productId: p.productId, ...(p.dealId ? { dealId: p.dealId } : {}) },
        }),
      });
    } catch (error) {
      console.error("whop checkout request failed", error);
      fail("WHOP_UNREACHABLE", "Could not reach Whop. Try again in a moment.");
    }
    const text = await res.text();
    let body: { purchase_url?: unknown; error?: { message?: unknown } } | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!res.ok) {
      console.error("whop checkout rejected", res.status, text.slice(0, 500));
      const detail = typeof body?.error?.message === "string" ? `: ${body.error.message}` : "";
      fail("WHOP_FAILED", `Whop could not create the checkout (HTTP ${res.status})${detail}`);
    }
    if (typeof body?.purchase_url !== "string") fail("WHOP_FAILED", "Whop returned a checkout without a purchase URL.");
    return { url: body.purchase_url, price, pct: p.discountPct, sandbox };
  },
});
