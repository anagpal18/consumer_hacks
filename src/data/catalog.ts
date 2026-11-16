import { makeFunctionReference } from 'convex/server';
import { useEffect, useState } from 'react';

import { convex } from './client';
import { CLOSET_CODE } from './mode';

/**
 * Sample catalog (brands, deals, feed posts, closet-aware product picks) from the Convex backend.
 * All of it is demo content and stays labeled "Sample" on screen. Hooks return null in fixture
 * mode or while loading, so screens fall back to their built-in sample cards.
 */

export type FeedPost = {
  postId: string;
  rank: number;
  kind: 'friend' | 'creator' | 'brand';
  author: string;
  handle: string;
  brandSlug: string | null;
  caption: string;
  prompt: string;
  swatches: string[];
  images?: string[];
  pieces?: string[];
  likes: number;
};

export type Deal = {
  dealId: string;
  brandSlug: string;
  brandName: string;
  title: string;
  description: string;
  code: string;
  discountPct: number;
  pointsCost: number;
  expiresAt: number;
};

export type ProductPick = {
  productId: string;
  brandSlug: string;
  brandName: string;
  name: string;
  category: string;
  colorHex: string;
  imageUrl?: string | null;
  priceCents: number;
  matchCount: number;
  matches: { photoUrl?: string | null; itemId: string; name: string; category: string; colorHex: string | null; wearCount: number }[];
  prompt: string;
};

const feedRef = makeFunctionReference<'query', { limit?: number; after?: number }, { posts: FeedPost[]; next: number | null }>('catalog:feed');
const dealsRef = makeFunctionReference<'query', { brandSlug?: string }, Deal[]>('catalog:deals');
const recommendRef = makeFunctionReference<'query', { closetCode: string; limit?: number }, ProductPick[]>('catalog:recommend');

function useOnce<T>(load: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    if (!convex) return;
    load().then(
      (next) => live && setValue(next),
      (error) => console.warn('catalog load failed', error),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export const useFeed = (limit = 40) => useOnce(() => convex!.query(feedRef, { limit }).then((page) => page.posts));
export const useDeals = () => useOnce(() => convex!.query(dealsRef, {}));
export const useProductPicks = (limit = 12) => useOnce(() => convex!.query(recommendRef, { closetCode: CLOSET_CODE, limit }));
