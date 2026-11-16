import { Asset } from 'expo-asset';
import { makeFunctionReference } from 'convex/server';

import { SAMPLE_AVATAR, type ChallengeProgress, type DeleteScanResult, type ScanFrame, type StorageUploadResponse } from '@shared/contract';

import { liveClient } from './client';
import { CLOSET_CODE } from './mode';
import { refs } from './refs';
import { extractFrames } from './scanClip';
import type { AvatarProfile, WearAgainApi } from './types';

/**
 * WearAgainApi (the UI's data seam) on the live Convex backend, built from the
 * PR #1 client, refs and clip helpers. Profile and onboarding stay on the phone:
 * the backend stores no avatar profile.
 */

const closetCode = CLOSET_CODE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const deleteScanRef = makeFunctionReference<'mutation', { closetCode: string; scanId: string }, DeleteScanResult>('privacy:deleteScan');
const streakRef = makeFunctionReference<'query', { closetCode: string; tzOffsetMinutes?: number }, { streakDays: number }>('outfits:streak');
const challengeRef = makeFunctionReference<'query', { closetCode: string }, ChallengeProgress[]>('outfits:challenge');
const recentWearsRef = makeFunctionReference<'query', { closetCode: string }, unknown[]>('outfits:recentWears');

let profile: AvatarProfile = {
  onboarded: false,
  photoUri: null,
  heightCm: 170,
  proportion: 'straight',
  adjust: { shoulders: 0, waist: 0, hips: 0, legs: 0 },
  avatar: SAMPLE_AVATAR,
  avatarStatus: 'none',
};

let closetWatch: (() => void) | null = null;

async function upload(uri: string, contentType: string): Promise<string> {
  const uploadUrl = await liveClient().mutation(refs.scansGenerateUploadUrl, { closetCode });
  const body = await (await fetch(uri)).blob();
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  if (!response.ok) throw new Error('Upload failed (' + response.status + ').');
  return ((await response.json()) as StorageUploadResponse).storageId;
}

export const convexApi: WearAgainApi = {
  usingMockData: false,
  closetCode,

  privacy: {
    deleteScan: ({ scanId }) => liveClient().mutation(deleteScanRef, { closetCode, scanId }),
  },

  media: {
    /** A null clip means the demo clip bundled with this build (fixtures/closet-demo.mp4). */
    async prepareScan(clipUri) {
      let uri = clipUri;
      if (!uri) {
        const asset = Asset.fromModule(require('../../fixtures/closet-demo.mp4'));
        await asset.downloadAsync();
        uri = asset.localUri ?? asset.uri;
      }
      let extracted: { uri: string; timestampMs: number }[] = [];
      try {
        extracted = await extractFrames({ uri, durationMs: null });
      } catch (error) {
        console.warn('Frame extraction failed, uploading the clip instead', error);
      }
      if (extracted.length < 3) return { frames: [], videoStorageId: await upload(uri, 'video/mp4') };
      const frames: ScanFrame[] = [];
      for (const [index, frame] of extracted.entries()) {
        frames.push({ frameId: 'f' + (index + 1), storageId: await upload(frame.uri, 'image/jpeg'), timestampMs: frame.timestampMs });
      }
      return { frames };
    },
  },

  scans: {
    start: (args) => liveClient().mutation(refs.scansStart, { ...args, closetCode }),
    async get({ scanId }) {
      const job = await liveClient().query(refs.scansGet, { scanId, closetCode });
      return job ?? { scanId, status: 'failed', candidates: [], error: 'This scan was not found. Start a new one.' };
    },
    confirm: (args) => liveClient().mutation(refs.scansConfirm, { ...args, closetCode }),
  },

  closet: {
    list: (args) => liveClient().query(refs.closetList, { ...args, closetCode }),
    setStatus: (args) => liveClient().mutation(refs.closetSetStatus, { ...args, closetCode }),
    markWashed: (args) => liveClient().mutation(refs.closetMarkWashed, { ...args, closetCode }),
  },

  stylist: {
    suggest: (args) => liveClient().action(refs.stylistSuggest, { ...args, closetCode }),
  },

  outfits: {
    async confirmWear(args) {
      const result = await liveClient().mutation(refs.outfitsConfirmWear, { ...args, closetCode });
      emit();
      return result;
    },
    async progress() {
      const client = liveClient();
      const [streak, challenge, wears] = await Promise.all([
        client.query(streakRef, { closetCode, tzOffsetMinutes: -new Date().getTimezoneOffset() }),
        client.query(challengeRef, { closetCode }),
        client.query(recentWearsRef, { closetCode }),
      ]);
      return { wearsLogged: wears.length, streakDays: streak.streakDays, challenge };
    },
  },

  profile: {
    async get() {
      return profile;
    },
    async save(patch) {
      profile = { ...profile, ...patch, avatarStatus: patch.avatarStatus === 'preparing' ? 'ready' : (patch.avatarStatus ?? profile.avatarStatus) };
      emit();
      return profile;
    },
  },

  /** Listeners fire on every closet change from any device (Convex pushes closet:list) and on local wear or profile changes. */
  subscribe(listener) {
    listeners.add(listener);
    if (!closetWatch) closetWatch = liveClient().watchQuery(refs.closetList, { closetCode }).onUpdate(emit);
    return () => {
      listeners.delete(listener);
    };
  },
};
