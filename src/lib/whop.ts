import { ConvexError } from 'convex/values';
import * as WebBrowser from 'expo-web-browser';
import { useState, useSyncExternalStore } from 'react';

import { redeemCode, whopCheckout, type CodeScope, type RedeemResult } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';

const keyOf = (productId: string, dealId?: string) => (dealId ?? '') + ':' + productId;

function messageOf(error: unknown) {
  if (error instanceof ConvexError && typeof error.data?.message === 'string') return error.data.message as string;
  if (String(error).includes('Could not find public function')) return 'Whop checkout is not deployed on this backend yet.';
  return 'Checkout failed. Check your connection and try again.';
}

/** A code the backend accepted. It applies to every checkout for its brand until removed. */
export type AppliedCode = Extract<RedeemResult, { ok: true }>;

let applied: Record<string, AppliedCode> = {};
const listeners = new Set<() => void>();
const setApplied = (next: Record<string, AppliedCode>) => {
  applied = next;
  listeners.forEach((listener) => listener());
};

/** Redeemed codes by brand slug, shared by Deals and For you so a code redeemed in one shows in the other. */
export function useAppliedCodes() {
  const codes = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => applied,
    () => applied,
  );
  return {
    forBrand: (brandSlug?: string | null) => (brandSlug ? codes[brandSlug] ?? null : null),
    remove: (brandSlug: string) => {
      const { [brandSlug]: _, ...rest } = applied;
      setApplied(rest);
    },
  };
}

/** Checks a typed code on the backend; an accepted code is applied to its brand. Returns the result to show. */
export async function redeem(code: string, scope: CodeScope): Promise<RedeemResult> {
  if (IS_FIXTURE_MODE) return { ok: false, reason: 'offline', message: 'Codes need the app to be connected to the store.' };
  try {
    const result = await redeemCode(code, scope);
    if (result.ok) setApplied({ ...applied, [result.brandSlug]: result });
    return result;
  } catch (error) {
    console.warn('redeem code failed', error);
    const message = String(error).includes('Could not find public function') ? 'Codes are not available on this backend yet.' : 'Could not check that code. Try again in a moment.';
    return { ok: false, reason: 'error', message };
  }
}

/**
 * Buy with Whop: asks the backend for a Whop checkout (the API key never leaves Convex) and opens it
 * in the in-app browser. A redeemed code goes with it so Whop applies the discount. Tracks which
 * product is loading and the last error per product.
 */
export function useWhopCheckout() {
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buy = async (productId: string, opts: { dealId?: string; code?: string } = {}) => {
    const key = keyOf(productId, opts.dealId);
    if (pending) return;
    if (IS_FIXTURE_MODE || !productId || productId.startsWith('sample')) {
      setErrors((map) => ({ ...map, [key]: productId ? 'Checkout needs the app to be connected to the store.' : 'This piece is not in the catalog, so it cannot be bought.' }));
      return;
    }
    setPending(key);
    setErrors(({ [key]: _, ...rest }) => rest);
    try {
      const { url } = await whopCheckout(productId, opts);
      setPending(null);
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    } catch (error) {
      console.warn('whop checkout failed', error);
      setPending(null);
      setErrors((map) => ({ ...map, [key]: messageOf(error) }));
    }
  };

  return {
    buy,
    isPending: (productId: string, dealId?: string) => pending === keyOf(productId, dealId),
    busy: pending !== null,
    errorFor: (productId: string, dealId?: string) => errors[keyOf(productId, dealId)] ?? null,
  };
}
