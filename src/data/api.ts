import type {
  ClosetMarkWashedArgs,
  ClosetMarkWashedResult,
  ClosetSetStatusArgs,
  ClosetSetStatusResult,
  ConfirmWearArgs,
  ConfirmWearResult,
  ScanConfirmArgs,
  ScanConfirmResult,
  ScanStartArgs,
  ScanStartResult,
  StylistSuggestArgs,
  StylistSuggestResult,
} from '@shared/contract';

import { liveClient } from './client';
import { fixtureApi } from './fixtures';
import { CLOSET_CODE, IS_FIXTURE_MODE } from './mode';
import { refs } from './refs';

/** Imperative calls. Reads go through the hooks so they stay reactive. */
export type DataApi = {
  generateUploadUrl: () => Promise<string>;
  startScan: (args: ScanStartArgs) => Promise<ScanStartResult>;
  confirmScan: (args: ScanConfirmArgs) => Promise<ScanConfirmResult>;
  setStatus: (args: ClosetSetStatusArgs) => Promise<ClosetSetStatusResult>;
  markWashed: (args?: ClosetMarkWashedArgs) => Promise<ClosetMarkWashedResult>;
  suggest: (args: StylistSuggestArgs) => Promise<StylistSuggestResult>;
  confirmWear: (args: ConfirmWearArgs) => Promise<ConfirmWearResult>;
};

const closetCode = CLOSET_CODE;

const liveApi: DataApi = {
  generateUploadUrl: () => liveClient().mutation(refs.scansGenerateUploadUrl, { closetCode }),
  startScan: (args) => liveClient().mutation(refs.scansStart, { ...args, closetCode }),
  confirmScan: (args) => liveClient().mutation(refs.scansConfirm, { ...args, closetCode }),
  setStatus: (args) => liveClient().mutation(refs.closetSetStatus, { ...args, closetCode }),
  markWashed: (args = {}) => liveClient().mutation(refs.closetMarkWashed, { ...args, closetCode }),
  suggest: (args) => liveClient().action(refs.stylistSuggest, { ...args, closetCode }),
  confirmWear: (args) => liveClient().mutation(refs.outfitsConfirmWear, { ...args, closetCode }),
};

export const api: DataApi = IS_FIXTURE_MODE ? fixtureApi : liveApi;

export const { generateUploadUrl, startScan, confirmScan, setStatus, markWashed } = api;
