import type {
  ConfirmWearArgs,
  ConfirmWearResult,
  Id,
  StylistSuggestArgs,
  StylistSuggestResult,
  SuggestedOutfit,
} from '@shared/contract';

/**
 * Optional fields the backend added in PR #2 (branch shresth) that shared/contract.ts
 * does not have yet. Aditya mirrors them into the contract; switch to those types then.
 */
export type OutfitSwap = { from: Id; to: Id | null };

export type SuggestArgs = StylistSuggestArgs & {
  /** The look currently on the avatar. The server keeps each piece still available and refills only changed slots. */
  currentItemIds?: Id[];
};

export type Outfit = SuggestedOutfit & { swaps?: OutfitSwap[] };

export type SuggestResult = Omit<StylistSuggestResult, 'outfits'> & { outfits: Outfit[] };

export type WearArgs = ConfirmWearArgs & { tzOffsetMinutes?: number };

export type WearResult = ConfirmWearResult & { streakDays?: number };
