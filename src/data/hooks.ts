import { useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  SAMPLE_AVATAR,
  type ClosetItem,
  type ClosetListArgs,
  type Id,
  type ScanJob,
} from '@shared/contract';

import { api } from './api';
import { fixtureStore } from './fixtures';
import { CLOSET_CODE, IS_FIXTURE_MODE } from './mode';
import { outfitToMirrorProps } from './mirror';
import { refs } from './refs';
import type { Outfit, SuggestArgs, SuggestResult, WearArgs, WearResult } from './types';

function useClosetFixture(args: ClosetListArgs = {}): ClosetItem[] | undefined {
  const closet = useSyncExternalStore(fixtureStore.subscribe, fixtureStore.getCloset);
  const { category } = args;
  return useMemo(() => (category ? closet.filter((item) => item.category === category) : closet), [closet, category]);
}

function useClosetLive(args: ClosetListArgs = {}): ClosetItem[] | undefined {
  return useQuery(refs.closetList, { ...args, closetCode: CLOSET_CODE });
}

/** Live closet items, undefined while loading. Re-renders on every change, from any device. */
export const useCloset = IS_FIXTURE_MODE ? useClosetFixture : useClosetLive;

function useScanFixture(scanId: Id | null | undefined): ScanJob | null | undefined {
  const scans = useSyncExternalStore(fixtureStore.subscribe, fixtureStore.getScans);
  return scanId ? (scans[scanId] ?? null) : undefined;
}

function useScanLive(scanId: Id | null | undefined): ScanJob | null | undefined {
  return useQuery(refs.scansGet, scanId ? { scanId, closetCode: CLOSET_CODE } : 'skip');
}

/** Scan job status and candidates, undefined while loading or when scanId is empty, null when unknown. */
export const useScan = IS_FIXTURE_MODE ? useScanFixture : useScanLive;

/** Applies swaps to the look on screen, keeping its order, so only the swapped slots change. */
function applySwaps(currentItemIds: Id[], outfit: Outfit): Outfit {
  if (!outfit.swaps?.length) return outfit;
  const swaps = new Map(outfit.swaps.map((swap) => [swap.from, swap.to]));
  const itemIds = currentItemIds.flatMap((id) => {
    const replacement = swaps.has(id) ? swaps.get(id) : id;
    return replacement ? [replacement] : [];
  });
  const added = outfit.itemIds.filter((id) => !itemIds.includes(id));
  return { ...outfit, itemIds: [...itemIds, ...added] };
}

/**
 * Calls stylist:suggest. The previous result stays in `result` while a new request
 * runs, so the mirror keeps the current outfit until the next one arrives. Whenever an
 * outfit is on screen its item ids are always sent as currentItemIds (the backend needs
 * them to swap only the changed slot), and returned swaps are applied to it in place.
 */
export function useStylistSuggest() {
  const [result, setResult] = useState<SuggestResult>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const latest = useRef(0);
  const shown = useRef<Id[] | undefined>(undefined);

  const suggest = useCallback(async (args: Omit<SuggestArgs, 'currentItemIds'>) => {
    const call = ++latest.current;
    const currentItemIds = shown.current;
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await api.suggest({ ...args, currentItemIds });
      const next = currentItemIds
        ? { ...response, outfits: response.outfits.map((outfit) => applySwaps(currentItemIds, outfit)) }
        : response;
      if (call === latest.current) {
        shown.current = next.outfits[0]?.itemIds ?? shown.current;
        setResult(next);
      }
      return next;
    } catch (cause) {
      if (call === latest.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
      throw cause;
    } finally {
      if (call === latest.current) setIsLoading(false);
    }
  }, []);

  return { result, isLoading, error, suggest };
}

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Calls outfits:confirmWear with one requestId per tap. Taps that overlap, and a
 * retry after a failure, reuse that id for the same items, so the backend counts
 * the wear once. A new id is minted after a success or when the items change.
 */
export function useConfirmWear() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error>();
  const [lastResult, setLastResult] = useState<WearResult>();
  const pending = useRef<{ key: string; requestId: string } | null>(null);

  const confirmWear = useCallback(async (args: Omit<WearArgs, 'requestId' | 'tzOffsetMinutes'>) => {
    const key = [...args.itemIds].sort().join(',');
    if (pending.current?.key !== key) pending.current = { key, requestId: newRequestId() };
    const { requestId } = pending.current;
    setIsSaving(true);
    setError(undefined);
    try {
      const result = await api.confirmWear({ ...args, requestId, tzOffsetMinutes: -new Date().getTimezoneOffset() });
      if (pending.current?.requestId === requestId) pending.current = null;
      setLastResult(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      throw cause;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { confirmWear, isSaving, error, lastResult };
}

/**
 * Today's Look for Home: asks the stylist once the closet loads and again whenever
 * an item's availability changes, keeping locked items, so a piece moved to laundry
 * is replaced in place.
 */
export function useTodaysLook(prompt = 'today', lockedItemIds: Id[] = []) {
  const closet = useCloset();
  const { result, isLoading, error, suggest } = useStylistSuggest();
  const availabilityKey = closet?.map((item) => `${item.itemId}:${item.availability}`).join('|');
  const lockedKey = lockedItemIds.join(',');

  useEffect(() => {
    if (availabilityKey === undefined) return;
    suggest({ prompt, lockedItemIds: lockedKey ? lockedKey.split(',') : [] }).catch(() => {});
  }, [availabilityKey, prompt, lockedKey, suggest]);

  const outfit = result?.outfits[0];
  const items = useMemo(() => {
    if (!outfit || !closet) return [];
    return outfit.itemIds.flatMap((id) => closet.find((item) => item.itemId === id) ?? []);
  }, [outfit, closet]);
  const mirrorProps = useMemo(() => outfitToMirrorProps(SAMPLE_AVATAR, items), [items]);

  return {
    outfit,
    items,
    mirrorProps,
    garmentAssetKeys: mirrorProps.garmentAssetKeys,
    lockedUnavailableItemIds: result?.lockedUnavailableItemIds ?? [],
    isLoading,
    error,
  };
}
