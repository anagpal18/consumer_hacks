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
  ScanGenerateUploadUrlResult,
  ScanGetArgs,
  ScanJob,
  ScanStartArgs,
  ScanStartResult,
  StylistSuggestArgs,
  StylistSuggestResult,
} from '@shared/contract';

/** The backend scopes every call to a closet code (see CLOSET_CODE in mode.ts). */
type InCloset<Args> = Args & { closetCode: string };

/**
 * Convex functions by string path, typed by shared/contract.ts, so the app compiles
 * without convex/_generated. scans:get may return null for an unknown scan id.
 */
export const refs = {
  profilesJoin: makeFunctionReference<'mutation', { closetCode: string }, unknown>('profiles:join'),
  scansGenerateUploadUrl: makeFunctionReference<'mutation', { closetCode: string }, ScanGenerateUploadUrlResult>('scans:generateUploadUrl'),
  scansStart: makeFunctionReference<'mutation', InCloset<ScanStartArgs>, ScanStartResult>('scans:start'),
  scansGet: makeFunctionReference<'query', InCloset<ScanGetArgs>, ScanJob | null>('scans:get'),
  scansConfirm: makeFunctionReference<'mutation', InCloset<ScanConfirmArgs>, ScanConfirmResult>('scans:confirm'),
  closetList: makeFunctionReference<'query', InCloset<ClosetListArgs>, ClosetListResult>('closet:list'),
  closetSetStatus: makeFunctionReference<'mutation', InCloset<ClosetSetStatusArgs>, ClosetSetStatusResult>('closet:setStatus'),
  closetMarkWashed: makeFunctionReference<'mutation', InCloset<ClosetMarkWashedArgs>, ClosetMarkWashedResult>('closet:markWashed'),
  stylistSuggest: makeFunctionReference<'action', InCloset<StylistSuggestArgs>, StylistSuggestResult>('stylist:suggest'),
  outfitsConfirmWear: makeFunctionReference<'mutation', InCloset<ConfirmWearArgs>, ConfirmWearResult>('outfits:confirmWear'),
};
