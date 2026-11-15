import type {
  AvatarRef,
  ChallengeProgress,
  ClosetListArgs,
  ClosetListResult,
  ClosetMarkWashedArgs,
  ClosetMarkWashedResult,
  ClosetSetStatusArgs,
  ClosetSetStatusResult,
  ConfirmWearArgs,
  ConfirmWearResult,
  DeleteScanArgs,
  DeleteScanResult,
  ScanConfirmArgs,
  ScanConfirmResult,
  ScanGetArgs,
  ScanJob,
  ScanStartArgs,
  ScanStartResult,
  StylistSuggestArgs,
  StylistSuggestResult,
} from '@shared/contract';

export type ProportionPreset = 'straight' | 'athletic' | 'curvy';

/** UI-only shape for avatar onboarding. Not in shared/contract.ts yet. */
export type AvatarProfile = {
  onboarded: boolean;
  photoUri: string | null;
  heightCm: number;
  proportion: ProportionPreset;
  /** Each from -2 to 2, 0 is the preset's default. */
  adjust: { shoulders: number; waist: number; hips: number; legs: number };
  avatar: AvatarRef;
  avatarStatus: 'none' | 'preparing' | 'ready';
};

/** UI-only summary for Profile. Not in shared/contract.ts yet. */
export type WearProgress = {
  wearsLogged: number;
  streakDays: number;
  challenge: ChallengeProgress[];
};

/**
 * Everything the screens need from the backend. Screens import `api` from '@/data/api'
 * and nothing else, so swapping the mock for Convex is one file.
 */
export type WearAgainApi = {
  /** True shows "Sample data" labels across the UI. */
  usingMockData: boolean;
  /** The closet's only credential. The real adapter reads EXPO_PUBLIC_CLOSET_CODE; never commit a real one. */
  closetCode: string;
  privacy: {
    /** privacy:deleteScan. Removes the scan, its candidates and its media; confirmed item photos are kept. */
    deleteScan: (args: DeleteScanArgs) => Promise<DeleteScanResult>;
  };
  media: {
    /** Extract frames from the local clip, upload them, and return scans:start args. */
    prepareScan: (clipUri: string | null) => Promise<ScanStartArgs>;
  };
  scans: {
    start: (args: ScanStartArgs) => Promise<ScanStartResult>;
    get: (args: ScanGetArgs) => Promise<ScanJob>;
    confirm: (args: ScanConfirmArgs) => Promise<ScanConfirmResult>;
  };
  closet: {
    list: (args: ClosetListArgs) => Promise<ClosetListResult>;
    setStatus: (args: ClosetSetStatusArgs) => Promise<ClosetSetStatusResult>;
    markWashed: (args: ClosetMarkWashedArgs) => Promise<ClosetMarkWashedResult>;
  };
  stylist: {
    suggest: (args: StylistSuggestArgs) => Promise<StylistSuggestResult>;
  };
  outfits: {
    confirmWear: (args: ConfirmWearArgs) => Promise<ConfirmWearResult>;
    progress: () => Promise<WearProgress>;
  };
  profile: {
    get: () => Promise<AvatarProfile>;
    save: (patch: Partial<AvatarProfile>) => Promise<AvatarProfile>;
  };
  /** Called whenever closet, wear or profile data changes, so hooks can refetch. */
  subscribe: (listener: () => void) => () => void;
  /** Mock-only helpers. Absent on the real adapter. */
  dev?: {
    loadSampleCloset: () => void;
  };
};
