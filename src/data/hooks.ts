import { useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  SAMPLE_AVATAR,
  type ClosetItem,
  type ClosetListArgs,
  type ConfirmWearArgs,
  type ConfirmWearResult,
  type Id,
  type ScanJob,
  type StylistSuggestArgs,
  type StylistSuggestResult,
} from '@shared/contract';

import { api } from './api';
import { fixtureStore } from './fixtures';
import { CLOSET_CODE, IS_FIXTURE_MODE } from './mode';
import { outfitToMirrorProps } from './mirror';
import { refs } from './refs';

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

/**
 * Calls stylist:suggest. The previous result stays in `result` while a new request
 * runs, so the mirror keeps the current outfit until the next one arrives.
 */
export function useStylistSuggest() {
  const [result, setResult] = useState<StylistSuggestResult>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const latest = useRef(0);

  const suggest = useCallback(async (args: StylistSuggestArgs) => {
    const call = ++latest.current;
    setIsLoading(true);
    setError(undefined);
    try {
      const next = await api.suggest(args);
      if (call === latest.current) setResult(next);
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
  const [lastResult, setLastResult] = useState<ConfirmWearResult>();
  const pending = useRef<{ key: string; requestId: string } | null>(null);

  const confirmWear = useCallback(async (args: Omit<ConfirmWearArgs, 'requestId'>) => {
    const key = [...args.itemIds].sort().join(',');
    if (pending.current?.key !== key) pending.current = { key, requestId: newRequestId() };
    const { requestId } = pending.current;
    setIsSaving(true);
    setError(undefined);
    try {
      const result = await api.confirmWear({ ...args, requestId });
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
