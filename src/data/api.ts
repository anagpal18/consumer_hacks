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
import { IS_FIXTURE_MODE } from './mode';
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

const liveApi: DataApi = {
  generateUploadUrl: () => liveClient().mutation(refs.scansGenerateUploadUrl, {}),
  startScan: (args) => liveClient().mutation(refs.scansStart, args),
  confirmScan: (args) => liveClient().mutation(refs.scansConfirm, args),
  setStatus: (args) => liveClient().mutation(refs.closetSetStatus, args),
  markWashed: (args = {}) => liveClient().mutation(refs.closetMarkWashed, args),
  suggest: (args) => liveClient().action(refs.stylistSuggest, args),
  confirmWear: (args) => liveClient().mutation(refs.outfitsConfirmWear, args),
};

export const api: DataApi = IS_FIXTURE_MODE ? fixtureApi : liveApi;

export const { generateUploadUrl, startScan, confirmScan, setStatus, markWashed } = api;
