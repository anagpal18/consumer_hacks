import {
  PRIVATE_CATEGORIES,
  SAMPLE_CLOSET,
  SAMPLE_SCAN_REVIEW,
  SAMPLE_SUGGEST_RESULT,
  type ChallengeProgress,
  type ClosetItem,
  type Id,
  type SavedWear,
  type ScanJob,
} from '@shared/contract';

import type { DataApi } from './api';
import type { Outfit, OutfitSwap } from './types';

/**
 * In-memory backend for FIXTURE mode, seeded from the SAMPLE_* payloads.
 * Changes (laundry, wears, confirmed scans) persist until the app reloads.
 */
type State = {
  closet: ClosetItem[];
  scans: Record<Id, ScanJob>;
  wears: SavedWear[];
};

const CHALLENGE_TARGET = 3;
const LATENCY_MS = 250;

let state: State = { closet: structuredClone(SAMPLE_CLOSET), scans: {}, wears: [] };
const listeners = new Set<() => void>();
let scanCounter = 0;

function update(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function updateScan(scanId: Id, patch: Partial<ScanJob>) {
  const scan = state.scans[scanId];
  if (scan) update({ scans: { ...state.scans, [scanId]: { ...scan, ...patch } } });
}

function outfitKey(itemIds: Id[]) {
  return [...itemIds].sort().join(',');
}

export const fixtureStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getCloset: () => state.closet,
  getScans: () => state.scans,
  reset() {
    update({ closet: structuredClone(SAMPLE_CLOSET), scans: {}, wears: [] });
  },
};

function styleable(item: ClosetItem, excluded: Set<Id>) {
  return item.availability === 'available' && !excluded.has(item.itemId) && !PRIVATE_CATEGORIES.includes(item.category);
}

function fillOutfit(template: Outfit, kept: ClosetItem[], excluded: Set<Id>): Outfit | null {
  const byId = new Map(state.closet.map((item) => [item.itemId, item]));
  const picked: ClosetItem[] = [...kept];
  const swapped: string[] = [];
  for (const id of template.itemIds) {
    const wanted = byId.get(id);
    if (!wanted || picked.some((item) => item.category === wanted.category)) continue;
    if (styleable(wanted, excluded)) {
      picked.push(wanted);
      continue;
    }
    const replacement = state.closet.find(
      (item) => item.category === wanted.category && styleable(item, excluded) && !picked.includes(item),
    );
    if (replacement) {
      picked.push(replacement);
      swapped.push(replacement.name);
    }
  }
  if (picked.length === 0) return null;
  const itemIds = picked.map((item) => item.itemId);
  return {
    outfitId: `${template.outfitId}:${outfitKey(itemIds)}`,
    rank: template.rank,
    itemIds,
    reason: swapped.length ? `${template.reason} Swapped in ${swapped.join(', ')} for what is unavailable.` : template.reason,
  };
}

export const fixtureApi: DataApi = {
  async generateUploadUrl() {
    return delay('fixture://upload');
  },

  async startScan({ frames }) {
    scanCounter += 1;
    const scanId = `scan_fixture_${scanCounter}`;
    const framesTotal = frames.length || 10;
    update({
      scans: { ...state.scans, [scanId]: { scanId, status: 'queued', progress: { framesDone: 0, framesTotal }, candidates: [] } },
    });
    setTimeout(() => updateScan(scanId, { status: 'processing', progress: { framesDone: Math.ceil(framesTotal / 2), framesTotal } }), 800);
    setTimeout(
      () =>
        updateScan(scanId, {
          status: 'review',
          progress: { framesDone: framesTotal, framesTotal },
          candidates: SAMPLE_SCAN_REVIEW.candidates,
        }),
      2000,
    );
    return delay({ scanId, status: 'queued' as const });
  },

  async confirmScan({ scanId, acceptedCandidateIds, edits }) {
    const scan = state.scans[scanId];
    if (!scan) throw new Error(`Unknown scan ${scanId}`);
    if (scan.status === 'confirmed') return delay({ scanId, status: 'confirmed' as const, itemIds: scan.confirmedItemIds ?? [] });

    const editsById = new Map(edits.map((edit) => [edit.candidateId, edit]));
    const created: ClosetItem[] = [];
    for (const candidate of scan.candidates) {
      const edit = editsById.get(candidate.candidateId);
      if (!acceptedCandidateIds.includes(candidate.candidateId) || edit?.mergeInto) continue;
      const merged = { ...candidate, ...edit };
      const label = `${merged.color} ${merged.subtype ?? merged.category}`;
      created.push({
        itemId: `item_${scanId}_${candidate.candidateId}`,
        category: merged.category,
        subtype: merged.subtype,
        name: label.charAt(0).toUpperCase() + label.slice(1),
        color: merged.color,
        colorHex: merged.colorHex,
        media: candidate.crop,
        availability: 'available',
        wearCount: 0,
        wearsSinceWash: 0,
      });
    }
    const itemIds = created.map((item) => item.itemId);
    update({ closet: [...state.closet, ...created] });
    updateScan(scanId, { status: 'confirmed', confirmedItemIds: itemIds });
    return delay({ scanId, status: 'confirmed' as const, itemIds });
  },

  async deleteScan(scanId) {
    const scans = { ...state.scans };
    delete scans[scanId];
    update({ scans });
    await delay(null);
  },

  async setStatus({ itemId, availability }) {
    const item = state.closet.find((candidate) => candidate.itemId === itemId);
    if (!item) throw new Error(`Unknown item ${itemId}`);
    const next = { ...item, availability };
    update({ closet: state.closet.map((candidate) => (candidate.itemId === itemId ? next : candidate)) });
    return delay(next);
  },

  async markWashed({ itemIds } = {}) {
    const targets = new Set(
      itemIds ?? state.closet.filter((item) => item.availability === 'laundry').map((item) => item.itemId),
    );
    const washed: ClosetItem[] = [];
    const closet = state.closet.map((item) => {
      if (!targets.has(item.itemId)) return item;
      const next: ClosetItem = {
        ...item,
        availability: item.availability === 'laundry' ? 'available' : item.availability,
        wearsSinceWash: 0,
      };
      washed.push(next);
      return next;
    });
    update({ closet });
    return delay({ items: washed });
  },

  async suggest({ lockedItemIds, excludeItemIds = [], currentItemIds }) {
    const locked = state.closet.filter((item) => lockedItemIds.includes(item.itemId));
    const lockedUnavailableItemIds = locked.filter((item) => item.availability !== 'available').map((item) => item.itemId);
    if (lockedUnavailableItemIds.length) return delay({ outfits: [], lockedUnavailableItemIds });

    const excluded = new Set(excludeItemIds);
    const current = (currentItemIds ?? []).flatMap((id) => state.closet.find((item) => item.itemId === id) ?? []);
    const keptCurrent = current.filter((item) => styleable(item, excluded) && !locked.some((lockedItem) => lockedItem.category === item.category));
    const kept = [...locked, ...keptCurrent];
    const seen = new Set<string>();
    const outfits: Outfit[] = [];
    for (const template of SAMPLE_SUGGEST_RESULT.outfits) {
      const outfit = fillOutfit(template, kept, excluded);
      if (!outfit || seen.has(outfitKey(outfit.itemIds))) continue;
      seen.add(outfitKey(outfit.itemIds));
      const swaps: OutfitSwap[] | undefined = currentItemIds
        ? current
            .filter((item) => !outfit.itemIds.includes(item.itemId))
            .map((item) => ({
              from: item.itemId,
              to:
                outfit.itemIds.find(
                  (id) => !currentItemIds.includes(id) && state.closet.find((other) => other.itemId === id)?.category === item.category,
                ) ?? null,
            }))
        : undefined;
      outfits.push({ ...outfit, rank: outfits.length + 1, swaps });
    }
    return delay({ outfits });
  },

  async confirmWear({ itemIds, requestId }) {
    const existing = state.wears.find((wear) => wear.requestId === requestId);
    const wear: SavedWear = existing ?? {
      wearId: `wear_fixture_${state.wears.length + 1}`,
      itemIds,
      wornAt: Date.now(),
      requestId,
    };
    if (!existing) {
      update({
        wears: [...state.wears, wear],
        closet: state.closet.map((item) =>
          itemIds.includes(item.itemId)
            ? { ...item, wearCount: item.wearCount + 1, wearsSinceWash: item.wearsSinceWash + 1, lastWornAt: wear.wornAt }
            : item,
        ),
      });
    }
    const challenge: ChallengeProgress[] = wear.itemIds.map((itemId) => {
      const distinctOutfits = new Set(
        state.wears.filter((saved) => saved.itemIds.includes(itemId)).map((saved) => outfitKey(saved.itemIds)),
      ).size;
      return { itemId, distinctOutfits, target: CHALLENGE_TARGET, completed: distinctOutfits >= CHALLENGE_TARGET };
    });
    const wornDays = new Set(state.wears.map((saved) => new Date(saved.wornAt).toDateString()));
    let streakDays = 0;
    for (const day = new Date(); wornDays.has(day.toDateString()); day.setDate(day.getDate() - 1)) streakDays += 1;
    return delay({ wear, challenge, duplicate: Boolean(existing), streakDays });
  },
};
