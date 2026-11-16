import { makeFunctionReference } from 'convex/server';
import { useCallback, useEffect, useRef, useState } from 'react';

import { convex, liveClient } from './client';
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

export type Piece = {
  productId: string;
  name: string;
  brandName: string;
  category: string;
  imageUrl: string | null;
  priceCents: number;
  summary: string;
  inCloset: boolean;
  colorHex?: string;
};

export type Reel = {
  postId: string;
  rank: number;
  brandSlug: string;
  brandName: string;
  caption: string;
  prompt: string;
  likes: number;
  likedByMe: boolean;
  pieces: Piece[];
};

export type GapProduct = {
  productId: string;
  name: string;
  brandName: string;
  category: string;
  imageUrl: string | null;
  priceCents: number;
  summary: string;
  pairsWithCount: number;
  colorHex?: string;
};

export type Gap = { gapId: string; title: string; reason: string; products: GapProduct[] };

const reelsRef = makeFunctionReference<'query', { closetCode: string; limit?: number; after?: number }, { posts: Reel[]; next: number | null }>('catalog:reels');
const gapsRef = makeFunctionReference<'query', { closetCode: string }, Gap[]>('catalog:gaps');
const toggleLikeRef = makeFunctionReference<'mutation', { closetCode: string; postId: string }, { liked: boolean; likes: number }>('catalog:toggleLike');
const addToClosetRef = makeFunctionReference<'mutation', { closetCode: string; productId: string }, { itemId: string; alreadyOwned: boolean }>('catalog:addToCloset');

const isMissingFunction = (error: unknown) => String(error instanceof Error ? error.message : error).includes('Could not find public function');

/** Old catalog:feed posts in the Reel shape, for deployments without catalog:reels. They carry no product ids, so likes stay local and pieces cannot be added. */
function feedToReel(post: FeedPost): Reel {
  const images = post.images ?? [];
  const names = post.pieces ?? [];
  const count = Math.max(images.length, names.length);
  return {
    postId: post.postId,
    rank: post.rank,
    brandSlug: post.brandSlug ?? '',
    brandName: post.author,
    caption: post.caption,
    prompt: post.prompt,
    likes: post.likes,
    likedByMe: false,
    pieces: Array.from({ length: count }, (_, index) => ({
      productId: '',
      name: names[index] ?? post.caption,
      brandName: post.author,
      category: '',
      imageUrl: images[index] ?? null,
      priceCents: 0,
      summary: '',
      inCloset: false,
      colorHex: post.swatches[index],
    })),
  };
}

export type ReelSource = 'reels' | 'feed';

type ReelsPage = { posts: Reel[]; next: number | null; source: ReelSource };

async function fetchReels(limit: number, after?: number): Promise<ReelsPage | null> {
  if (!convex) return null;
  try {
    const page = await convex.query(reelsRef, { closetCode: CLOSET_CODE, limit, after });
    return { ...page, source: 'reels' };
  } catch (error) {
    if (!isMissingFunction(error)) console.warn('reels load failed', error);
    if (after !== undefined) return null;
  }
  try {
    const page = await convex.query(feedRef, { limit: 40 });
    return { posts: page.posts.map(feedToReel), next: null, source: 'feed' };
  } catch (error) {
    console.warn('feed load failed', error);
    return null;
  }
}

/** Live reels with paging; falls back to catalog:feed when catalog:reels is not deployed. Null in fixture mode or while loading. */
export function useReels(pageSize = 10) {
  const [state, setState] = useState<ReelsPage | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    fetchReels(pageSize).then((page) => live && page && setState(page));
    return () => {
      live = false;
    };
  }, [pageSize]);

  const loadMore = useCallback(() => {
    if (!state || state.source !== 'reels' || state.next === null || busy.current) return;
    busy.current = true;
    fetchReels(pageSize, state.next)
      .then((page) => page && setState((prev) => (prev ? { ...page, posts: [...prev.posts, ...page.posts.filter((post) => !prev.posts.some((seen) => seen.postId === post.postId))] } : page)))
      .finally(() => {
        busy.current = false;
      });
  }, [pageSize, state]);

  return state ? { posts: state.posts, source: state.source, loadMore } : null;
}

/** Closet gaps for the current closet. Null in fixture mode, while loading, or when catalog:gaps is not deployed. */
export function useGaps() {
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  useEffect(() => {
    let live = true;
    if (!convex) return;
    convex.query(gapsRef, { closetCode: CLOSET_CODE }).then(
      (next) => live && setGaps(next),
      (error) => !isMissingFunction(error) && console.warn('gaps load failed', error),
    );
    return () => {
      live = false;
    };
  }, []);
  return gaps;
}

export const toggleLike = (postId: string) => liveClient().mutation(toggleLikeRef, { closetCode: CLOSET_CODE, postId });
export const addToCloset = (productId: string) => liveClient().mutation(addToClosetRef, { closetCode: CLOSET_CODE, productId });
