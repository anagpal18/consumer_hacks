import { ConvexError } from 'convex/values';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { whopCheckout } from '@/data/catalog';
import { IS_FIXTURE_MODE } from '@/data/mode';

const keyOf = (productId: string, dealId?: string) => (dealId ?? '') + ':' + productId;

function messageOf(error: unknown) {
  if (error instanceof ConvexError && typeof error.data?.message === 'string') return error.data.message as string;
  if (String(error).includes('Could not find public function')) return 'Whop checkout is not deployed on this backend yet.';
  return 'Checkout failed. Check your connection and try again.';
}

/**
 * Buy with Whop: asks the backend for a Whop checkout (the API key never leaves Convex) and opens it
 * in the in-app browser. Tracks which product is loading and the last error per product.
 */
export function useWhopCheckout() {
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buy = async (productId: string, dealId?: string) => {
    const key = keyOf(productId, dealId);
    if (pending) return;
    if (IS_FIXTURE_MODE || !productId || productId.startsWith('sample')) {
      setErrors((map) => ({ ...map, [key]: productId ? 'Checkout needs the app to be connected to the store.' : 'This piece is not in the catalog, so it cannot be bought.' }));
      return;
    }
    setPending(key);
    setErrors(({ [key]: _, ...rest }) => rest);
    try {
      const { url } = await whopCheckout(productId, dealId);
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
