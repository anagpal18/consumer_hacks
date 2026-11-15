import {
  PRIVATE_CATEGORIES,
  SAMPLE_AVATAR,
  SAMPLE_CLOSET,
  SAMPLE_SCAN_REVIEW,
  SAMPLE_SCAN_START_ARGS,
  type ChallengeProgress,
  type ClosetItem,
  type ConfirmWearResult,
  type GarmentCategory,
  type Id,
  type SavedWear,
  type ScanJob,
  type SuggestedOutfit,
} from '@shared/contract';

import type { AvatarProfile, WearAgainApi } from './types';

/**
 * MOCK implementation of WearAgainApi. In-memory, resets on reload, built from the
 * SAMPLE_* payloads in shared/contract.ts. Nothing here talks to a server.
 */

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let closet: ClosetItem[] = [];
let profile: AvatarProfile = {
  onboarded: false,
  photoUri: null,
  heightCm: 170,
  proportion: 'straight',
  adjust: { shoulders: 0, waist: 0, hips: 0, legs: 0 },
  avatar: SAMPLE_AVATAR,
  avatarStatus: 'none',
};
const scans = new Map<Id, { startedAt: number; confirmedItemIds?: Id[] }>();
const wearResults = new Map<string, ConfirmWearResult>();
const wearLog: SavedWear[] = [];

const PROCESS_MS = 3500;
const STYLED_SLOTS: GarmentCategory[] = ['outerwear', 'top', 'bottom', 'shoes'];
const ASSET_BY_DESCRIPTION: Record<string, string> = {
  'indigo denim jacket': 'demo/jacket-denim',
  'black t-shirt': 'demo/tee-black',
  'white sneakers': 'demo/sneakers-white',
  'brown boots': 'demo/boots-brown',
};

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function challengeFor(itemIds: Id[]): ChallengeProgress[] {
  return itemIds
    .map((itemId) => {
      const distinct = new Set(
        wearLog.filter((wear) => wear.itemIds.includes(itemId)).map((wear) => [...wear.itemIds].sort().join('+')),
      ).size;
      return { itemId, distinctOutfits: Math.min(distinct, 3), target: 3, completed: distinct >= 3 };
    })
    .sort((a, b) => b.distinctOutfits - a.distinctOutfits);
}

export const mockApi: WearAgainApi = {
  usingMockData: true,

  media: {
    async prepareScan() {
      await delay(300);
      return SAMPLE_SCAN_START_ARGS;
    },
  },

  scans: {
    async start() {
      const scanId = `scan_mock_${scans.size + 1}`;
      scans.set(scanId, { startedAt: Date.now() });
      return { scanId, status: 'queued' };
    },
    async get({ scanId }) {
      const scan = scans.get(scanId);
      if (!scan) return { scanId, status: 'failed', candidates: [], error: 'This scan was not found. Start a new one.' };
      const candidates = SAMPLE_SCAN_REVIEW.candidates;
      if (scan.confirmedItemIds) return { scanId, status: 'confirmed', candidates, confirmedItemIds: scan.confirmedItemIds };
      const elapsed = Date.now() - scan.startedAt;
      if (elapsed >= PROCESS_MS) return { scanId, status: 'review', progress: { framesDone: 10, framesTotal: 10 }, candidates };
      const job: ScanJob = {
        scanId,
        status: elapsed < 400 ? 'queued' : 'processing',
        progress: { framesDone: Math.floor((elapsed / PROCESS_MS) * 10), framesTotal: 10 },
        candidates: [],
      };
      return job;
    },
    async confirm({ scanId, acceptedCandidateIds, edits }) {
      await delay(400);
      const scan = scans.get(scanId);
      if (!scan) throw new Error('This scan was not found.');
      if (scan.confirmedItemIds) return { scanId, status: 'confirmed', itemIds: scan.confirmedItemIds };
      const editById = new Map(edits.map((edit) => [edit.candidateId, edit]));
      const created: ClosetItem[] = SAMPLE_SCAN_REVIEW.candidates
        .filter((candidate) => acceptedCandidateIds.includes(candidate.candidateId) && !editById.get(candidate.candidateId)?.mergeInto)
        .map((candidate) => {
          const edit = editById.get(candidate.candidateId);
          const category = edit?.category ?? candidate.category;
          const color = edit?.color ?? candidate.color;
          const subtype = edit?.subtype ?? (edit?.category ? undefined : candidate.subtype);
          const description = `${color} ${subtype ?? category}`;
          return {
            itemId: `item_${scanId}_${candidate.candidateId}`,
            category,
            subtype,
            name: sentence(description),
            color,
            colorHex: edit?.color ? undefined : candidate.colorHex,
            media: candidate.crop,
            renderAssetKey: ASSET_BY_DESCRIPTION[description],
            availability: 'available',
            wearCount: 0,
            wearsSinceWash: 0,
          };
        });
      closet = [...closet, ...created];
      scan.confirmedItemIds = created.map((item) => item.itemId);
      emit();
      return { scanId, status: 'confirmed', itemIds: scan.confirmedItemIds };
    },
  },

  closet: {
    async list({ category }) {
      return category ? closet.filter((item) => item.category === category) : closet;
    },
    async setStatus({ itemId, availability }) {
      const current = closet.find((item) => item.itemId === itemId);
      if (!current) throw new Error('That piece is no longer in your closet.');
      const updated = { ...current, availability };
      closet = closet.map((item) => (item.itemId === itemId ? updated : item));
      emit();
      return updated;
    },
    async markWashed({ itemIds }) {
      const washed = closet
        .filter((item) => (itemIds ? itemIds.includes(item.itemId) : item.availability === 'laundry'))
        .map((item) => ({ ...item, availability: 'available' as const, wearsSinceWash: 0 }));
      const washedById = new Map(washed.map((item) => [item.itemId, item]));
      closet = closet.map((item) => washedById.get(item.itemId) ?? item);
      emit();
      return { items: washed };
    },
  },

  stylist: {
    async suggest({ prompt, lockedItemIds, excludeItemIds = [], currentItemIds }) {
      await delay(500);
      const lockedUnavailable = lockedItemIds.filter(
        (id) => closet.find((item) => item.itemId === id)?.availability !== 'available',
      );
      if (lockedUnavailable.length > 0) return { outfits: [], lockedUnavailableItemIds: lockedUnavailable };

      const dressy = /dinner|date|work|office|interview|meeting|wedding|party/i.test(prompt);
      const preferred = dressy ? ['boots', 'oxford shirt', 'trousers', 'denim jacket'] : ['sneakers', 't-shirt', 'chinos'];
      const score = (item: ClosetItem) => (item.subtype && preferred.includes(item.subtype) ? 1 : 0);
      const wearable = closet.filter(
        (item) => item.availability === 'available' && !PRIVATE_CATEGORIES.includes(item.category),
      );
      const occasion = prompt.trim() || 'today';

      const outfits: SuggestedOutfit[] = [];
      for (const variant of [0, 1]) {
        const itemIds: Id[] = [];
        for (const slot of STYLED_SLOTS) {
          const inSlot = wearable.filter((item) => item.category === slot);
          const locked = inSlot.find((item) => lockedItemIds.includes(item.itemId));
          const options = inSlot
            .filter((item) => !excludeItemIds.includes(item.itemId))
            .sort((a, b) => score(b) - score(a));
          const pick = locked ?? options[variant % Math.max(options.length, 1)];
          if (pick) itemIds.push(pick.itemId);
        }
        if (itemIds.length === 0) break;
        if (outfits.some((outfit) => outfit.itemIds.join() === itemIds.join())) continue;
        const categoryOf = (id: Id) => closet.find((item) => item.itemId === id)?.category;
        outfits.push({
          swaps: currentItemIds
            ?.filter((id) => !itemIds.includes(id))
            .map((from) => ({ from, to: itemIds.find((id) => categoryOf(id) === categoryOf(from)) ?? null })),
          outfitId: `outfit_mock_${Date.now()}_${variant}`,
          rank: variant + 1,
          itemIds,
          reason:
            variant === 1
              ? `A second option for ${occasion} from what is clean.`
              : dressy
                ? `Polished enough for ${occasion}, and all of it is clean and ready.`
                : `Easy and comfortable for ${occasion}, using what is clean.`,
        });
      }
      return { outfits };
    },
  },

  outfits: {
    async confirmWear({ itemIds, requestId }) {
      await delay(400);
      const saved = wearResults.get(requestId);
      if (saved) return { ...saved, duplicate: true };
      const wornAt = Date.now();
      closet = closet.map((item) =>
        itemIds.includes(item.itemId)
          ? { ...item, wearCount: item.wearCount + 1, wearsSinceWash: item.wearsSinceWash + 1, lastWornAt: wornAt }
          : item,
      );
      const wear: SavedWear = { wearId: `wear_mock_${wearLog.length + 1}`, itemIds, wornAt, requestId };
      wearLog.push(wear);
      const result: ConfirmWearResult = { wear, challenge: challengeFor(itemIds), duplicate: false, streakDays: 1 };
      wearResults.set(requestId, result);
      emit();
      return result;
    },
    async progress() {
      return {
        wearsLogged: wearLog.length,
        streakDays: wearLog.length > 0 ? 1 : 0,
        challenge: challengeFor(closet.filter((item) => item.wearCount > 0).map((item) => item.itemId)),
      };
    },
  },

  profile: {
    async get() {
      return profile;
    },
    async save(patch) {
      profile = { ...profile, ...patch };
      emit();
      if (patch.avatarStatus === 'preparing') {
        setTimeout(() => {
          profile = { ...profile, avatarStatus: 'ready' };
          emit();
        }, 6000);
      }
      return profile;
    },
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  dev: {
    loadSampleCloset() {
      const existing = new Set(closet.map((item) => item.itemId));
      closet = [...closet, ...SAMPLE_CLOSET.filter((item) => !existing.has(item.itemId))];
      emit();
    },
  },
};
