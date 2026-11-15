import type {
  Id,
  ClosetMarkWashedArgs,
  ClosetMarkWashedResult,
  ClosetSetStatusArgs,
  ClosetSetStatusResult,
  ScanConfirmArgs,
  ScanConfirmResult,
  ScanStartArgs,
  ScanStartResult,
} from '@shared/contract';

import { liveClient } from './client';
import { fixtureApi } from './fixtures';
import { CLOSET_CODE, IS_FIXTURE_MODE } from './mode';
import { refs } from './refs';
import type { SuggestArgs, SuggestResult, WearArgs, WearResult } from './types';

/** Imperative calls. Reads go through the hooks so they stay reactive. */
export type DataApi = {
  generateUploadUrl: () => Promise<string>;
  startScan: (args: ScanStartArgs) => Promise<ScanStartResult>;
  confirmScan: (args: ScanConfirmArgs) => Promise<ScanConfirmResult>;
  /** Deletes a scan with its frames and crops (privacy:deleteScan). */
  deleteScan: (scanId: Id) => Promise<void>;
  setStatus: (args: ClosetSetStatusArgs) => Promise<ClosetSetStatusResult>;
  markWashed: (args?: ClosetMarkWashedArgs) => Promise<ClosetMarkWashedResult>;
  suggest: (args: SuggestArgs) => Promise<SuggestResult>;
  confirmWear: (args: WearArgs) => Promise<WearResult>;
};

const closetCode = CLOSET_CODE;

const liveApi: DataApi = {
  generateUploadUrl: () => liveClient().mutation(refs.scansGenerateUploadUrl, { closetCode }),
  startScan: (args) => liveClient().mutation(refs.scansStart, { ...args, closetCode }),
  confirmScan: (args) => liveClient().mutation(refs.scansConfirm, { ...args, closetCode }),
  deleteScan: async (scanId) => {
    await liveClient().mutation(refs.privacyDeleteScan, { scanId, closetCode });
  },
  setStatus: (args) => liveClient().mutation(refs.closetSetStatus, { ...args, closetCode }),
  markWashed: (args = {}) => liveClient().mutation(refs.closetMarkWashed, { ...args, closetCode }),
  suggest: (args) => liveClient().action(refs.stylistSuggest, { ...args, closetCode }),
  confirmWear: (args) => liveClient().mutation(refs.outfitsConfirmWear, { ...args, closetCode }),
};

export const api: DataApi = IS_FIXTURE_MODE ? fixtureApi : liveApi;

export const { generateUploadUrl, startScan, confirmScan, deleteScan, setStatus, markWashed } = api;
