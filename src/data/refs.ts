import { makeFunctionReference } from 'convex/server';

import type {
  ClosetListArgs,
  ClosetListResult,
  ClosetMarkWashedArgs,
  ClosetMarkWashedResult,
  ClosetSetStatusArgs,
  ClosetSetStatusResult,
  ConfirmWearArgs,
  ConfirmWearResult,
  ScanConfirmArgs,
  ScanConfirmResult,
  ScanGenerateUploadUrlArgs,
  ScanGenerateUploadUrlResult,
  ScanGetArgs,
  ScanJob,
  ScanStartArgs,
  ScanStartResult,
  StylistSuggestArgs,
  StylistSuggestResult,
} from '@shared/contract';

/**
 * Convex functions by string path, typed by shared/contract.ts, so the app compiles
 * before convex/ exists. Swap for the generated `api` once convex/_generated lands.
 * scans:get may return null for an unknown scan id.
 */
export const refs = {
  scansGenerateUploadUrl: makeFunctionReference<'mutation', ScanGenerateUploadUrlArgs, ScanGenerateUploadUrlResult>('scans:generateUploadUrl'),
  scansStart: makeFunctionReference<'mutation', ScanStartArgs, ScanStartResult>('scans:start'),
  scansGet: makeFunctionReference<'query', ScanGetArgs, ScanJob | null>('scans:get'),
  scansConfirm: makeFunctionReference<'mutation', ScanConfirmArgs, ScanConfirmResult>('scans:confirm'),
  closetList: makeFunctionReference<'query', ClosetListArgs, ClosetListResult>('closet:list'),
  closetSetStatus: makeFunctionReference<'mutation', ClosetSetStatusArgs, ClosetSetStatusResult>('closet:setStatus'),
  closetMarkWashed: makeFunctionReference<'mutation', ClosetMarkWashedArgs, ClosetMarkWashedResult>('closet:markWashed'),
  stylistSuggest: makeFunctionReference<'action', StylistSuggestArgs, StylistSuggestResult>('stylist:suggest'),
  outfitsConfirmWear: makeFunctionReference<'mutation', ConfirmWearArgs, ConfirmWearResult>('outfits:confirmWear'),
};
