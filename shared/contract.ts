/**
 * Wear Again V2 shared contract.
 *
 * One type per row of the "Shared interface" table in docs/build.md.
 * Function names match the Convex paths (scans:start -> api.scans.start).
 * The backend derives ownership from the session, so no call takes a user id.
 *
 * Owners: Shresth implements these in convex/, Kenil wires them in the app
 * data adapter, Aditya builds UI against the SAMPLE_* payloads at the bottom.
 * Change a shape here first, in its own small commit, and tell the others.
 */

export type Id = string;

/** A stored image or video. `url` is null while only a storage id exists, or for sample data. */
export type MediaRef = {
  url: string | null;
  storageId?: string;
};

export type GarmentCategory =
  | 'top'
  | 'bottom'
  | 'outerwear'
  | 'dress'
  | 'shoes'
  | 'accessory'
  | 'socks'
  | 'underwear';

/** Socks and underwear are tracked privately for laundry and never styled on the avatar. */
export const PRIVATE_CATEGORIES: readonly GarmentCategory[] = ['socks', 'underwear'];

// ---------------------------------------------------------------------------
// scans:start, scans:get, scans:confirm
// ---------------------------------------------------------------------------

export type ScanStatus = 'queued' | 'processing' | 'review' | 'failed' | 'confirmed';

/** A frame the client extracted from the clip and uploaded to Convex storage. */
export type ScanFrame = {
  frameId: string;
  storageId: string;
  timestampMs: number;
};

/**
 * The client extracts about 10 timestamped frames, uploads them to Convex storage,
 * and passes their storage ids. The original clip is optional.
 */
export type ScanStartArgs = {
  frames: ScanFrame[];
  videoStorageId?: string;
};

export type ScanStartResult = {
  scanId: Id;
  status: ScanStatus;
};

/**
 * scans:generateUploadUrl (mutation, no args) returns a short-lived Convex storage
 * upload URL. The client POSTs one frame per URL and reads `{ storageId }` from the
 * response, then passes the storage ids to scans:start.
 */
export type ScanGenerateUploadUrlArgs = Record<string, never>;
export type ScanGenerateUploadUrlResult = string;

/** Body of the storage upload response. */
export type StorageUploadResponse = { storageId: string };

export type ScanCandidate = {
  candidateId: Id;
  category: GarmentCategory;
  subtype?: string;
  color: string;
  colorHex?: string;
  /** Crop of the actual frame, shown on the review card. */
  crop: MediaRef;
  frameId?: string;
  /** True when the detector wants a human look: similar pieces, partly hidden, low confidence. */
  uncertain: boolean;
  uncertainReason?: string;
  /** Set when this might be a repeat view of another candidate; the user merges or keeps both. */
  possibleDuplicateOf?: Id;
};

export type ScanJob = {
  scanId: Id;
  status: ScanStatus;
  progress?: { framesDone: number; framesTotal: number };
  candidates: ScanCandidate[];
  /** Readable message when status is 'failed'. */
  error?: string;
  /** Closet item ids created by scans:confirm, present when status is 'confirmed'. */
  confirmedItemIds?: Id[];
};

export type ScanGetArgs = { scanId: Id };

export type ScanCandidateEdit = {
  candidateId: Id;
  category?: GarmentCategory;
  subtype?: string;
  color?: string;
  /** Merge this candidate into another one; it then creates no item of its own. */
  mergeInto?: Id;
};

/** Only accepted candidates become items. Safe to retry: one item per accepted candidate. */
export type ScanConfirmArgs = {
  scanId: Id;
  acceptedCandidateIds: Id[];
  edits: ScanCandidateEdit[];
};

export type ScanConfirmResult = {
  scanId: Id;
  status: 'confirmed';
  itemIds: Id[];
};

// ---------------------------------------------------------------------------
// privacy:deleteScan
// ---------------------------------------------------------------------------

/** Deletes a scan, its candidates and its uploaded media. Confirmed closet items are kept. */
export type DeleteScanArgs = { closetCode: string; scanId: Id };
export type DeleteScanResult = {
  deleted: boolean;
  scanId: Id;
  deletedCandidates: number;
  deletedFiles: number;
  /** Photos of already confirmed items, which are kept. */
  keptItemPhotos: number;
};

// ---------------------------------------------------------------------------
// closet:list, closet:setStatus, closet:markWashed
// ---------------------------------------------------------------------------

/**
 * Availability is separate from wear. A worn piece can still be 'available'.
 * 'laundry' and 'retired' are excluded from styling. 'on_the_way' is a verified
 * order that is not styled until delivered or confirmed.
 */
export type Availability = 'available' | 'laundry' | 'retired' | 'on_the_way';

export type ClosetItem = {
  itemId: Id;
  category: GarmentCategory;
  subtype?: string;
  name: string;
  color: string;
  colorHex?: string;
  /** The real crop or photo of the garment. */
  media: MediaRef;
  /** Key of a supported 3D garment asset. Unset when no defensible match exists. */
  renderAssetKey?: string;
  availability: Availability;
  /** Lifetime confirmed wears. */
  wearCount: number;
  /** Wears since the last wash; reset by closet:markWashed. */
  wearsSinceWash: number;
  lastWornAt?: number;
};

export type ClosetListArgs = { category?: GarmentCategory };
export type ClosetListResult = ClosetItem[];

export type ClosetSetStatusArgs = { itemId: Id; availability: Availability };
export type ClosetSetStatusResult = ClosetItem;

/** Omit itemIds for the bulk "Laundry done" action: everything in laundry becomes available. */
export type ClosetMarkWashedArgs = { itemIds?: Id[] };
export type ClosetMarkWashedResult = { items: ClosetItem[] };

// ---------------------------------------------------------------------------
// stylist:suggest
// ---------------------------------------------------------------------------

export type Weather = { tempC: number; condition: string };

export type StylistSuggestArgs = {
  /** Occasion or free text, for example "dinner with friends". */
  prompt: string;
  /** Items that must stay in every returned outfit. */
  lockedItemIds: Id[];
  /** Items to avoid, used for "change this piece" without rebuilding the outfit. */
  excludeItemIds?: Id[];
  /** The look currently on the avatar. Pieces still available are kept; only changed slots are refilled. */
  currentItemIds?: Id[];
  weather?: Weather;
};

export type SuggestedOutfit = {
  outfitId: Id;
  /** 1 is best. */
  rank: number;
  itemIds: Id[];
  /** One short reason the look fits. */
  reason: string;
  /** What changed against currentItemIds. `to` is null when a slot could not be refilled. */
  swaps?: { from: Id; to: Id | null }[];
};

export type StylistSuggestResult = {
  outfits: SuggestedOutfit[];
  /** Locked items that have become unavailable; the user must replace or unlock them. */
  lockedUnavailableItemIds?: Id[];
};

// ---------------------------------------------------------------------------
// outfits:confirmWear
// ---------------------------------------------------------------------------

export type ConfirmWearArgs = {
  itemIds: Id[];
  /** Stable per tap. Sending the same requestId twice increments wear counts once. */
  requestId: string;
  outfitId?: Id;
  occasion?: string;
  tzOffsetMinutes?: number;
};

export type SavedWear = {
  wearId: Id;
  itemIds: Id[];
  wornAt: number;
  requestId: string;
};

/** One Piece, Three Ways: three distinct confirmed outfits featuring the same garment. */
export type ChallengeProgress = {
  itemId: Id;
  distinctOutfits: number;
  target: number;
  completed: boolean;
};

export type ConfirmWearResult = {
  wear: SavedWear;
  challenge: ChallengeProgress[];
  /** True when this requestId was already saved and nothing was incremented. */
  duplicate: boolean;
  streakDays?: number;
};

// ---------------------------------------------------------------------------
// Mirror adapter: avatar reference and garment asset keys in,
// ready/error state and viewer controls out.
// ---------------------------------------------------------------------------

/** 'unspecified' renders the male body (the demo garments are menswear). */
export type AvatarSex = 'female' | 'male' | 'unspecified';

/** Resolved client-side to the mesh preset `${sex}-${preset}`, see AVATAR_PRESETS in shared/renderAssets.ts. */
export type AvatarPreset = 'slim' | 'average' | 'broad';

/** Each value is -1..1; 0 is the preset's own shape. The mirror clamps to what keeps garments clean. */
export type AvatarProportions = {
  head: number;
  chest: number;
  arms: number;
  waist: number;
  hips: number;
  shoulders: number;
};

/** Body of the base mannequin. Matches the result of avatar:estimateBody. */
export type AvatarBody = {
  sex: AvatarSex;
  preset: AvatarPreset;
  /** #rrggbb skin color; null keeps the preset's default skin. */
  skinTone: string | null;
  /** Standing height; omitted keeps the preset's own height. */
  heightCm?: number;
  proportions: AvatarProportions;
};

export type AvatarRef = {
  kind: 'preset' | 'photo';
  /** Preset key or provider avatar id. */
  key: string;
  /** Shown as "Demo avatar" in the viewer when true. */
  demo?: boolean;
  /** Body shape for the mannequin. Omitted renders the default male-average body. */
  body?: AvatarBody;
};

// ---------------------------------------------------------------------------
// avatar:estimateBody (Convex action; reads the onboarding photo server-side)
// ---------------------------------------------------------------------------

export type AvatarEstimateArgs = {
  closetCode: string;
  /** Convex storage id of the private full-body photo (uploaded through scans:generateUploadUrl). */
  photoStorageId: string;
  heightCm?: number;
  /** When the user picked one; otherwise the model estimates it. */
  sex?: AvatarSex;
};

export type AvatarEstimateResult = {
  body: AvatarBody;
  /** 0..1. 0.1 when the photo was unusable and an average body with all proportions 0 came back. */
  confidence: number;
  /** One short human-readable note, shown next to the estimate. */
  notes: string;
};

export type MirrorState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type MirrorViewerControls = {
  resetView: () => void;
  /** Yaw in degrees, 0 faces the camera. */
  rotateTo: (yawDeg: number) => void;
  /** 1 is the default framing. */
  setZoom: (scale: number) => void;
  /** Reload assets after an error. */
  retry: () => void;
};

/**
 * One worn garment. slot is a RenderSlot from shared/renderAssets.ts. Without a
 * known renderAssetKey the mirror draws a stand-in for the slot tinted with
 * colorHex and labels it approximate with `label`.
 */
export type MirrorGarment = {
  slot: string;
  renderAssetKey?: string;
  colorHex?: string;
  label: string;
};

export type MirrorProps = {
  avatar: AvatarRef;
  /** renderAssetKey of each garment currently worn. Items without a key are not passed. Ignored when `garments` is set. */
  garmentAssetKeys: string[];
  /** Worn garments with their slot and color, so items without a supported asset still show approximately. */
  garments?: MirrorGarment[];
  onStateChange?: (state: MirrorState) => void;
  /** Called once the viewer can be driven from outside. */
  onControlsReady?: (controls: MirrorViewerControls) => void;
};

// ---------------------------------------------------------------------------
// SAMPLE PAYLOADS. Fixtures for UI work only, never real user data.
// Asset keys and ids are placeholders until Kenil and Shresth settle the mapping.
// ---------------------------------------------------------------------------

const noMedia: MediaRef = { url: null };

export const SAMPLE_AVATAR_BODY: AvatarBody = {
  sex: 'male',
  preset: 'average',
  skinTone: null,
  heightCm: 178,
  proportions: { head: 0, chest: 0, arms: 0, waist: 0, hips: 0, shoulders: 0 },
};

export const SAMPLE_AVATAR: AvatarRef = { kind: 'preset', key: 'demo/avatar-a', demo: true, body: SAMPLE_AVATAR_BODY };

export const SAMPLE_AVATAR_ESTIMATE_ARGS: AvatarEstimateArgs = {
  closetCode: 'sample-closet',
  photoStorageId: 'storage_sample_body_photo',
  heightCm: 183,
  sex: 'male',
};

/** Shape of a real avatar:estimateBody response, values copied from one test call. */
export const SAMPLE_AVATAR_ESTIMATE_RESULT: AvatarEstimateResult = {
  body: {
    sex: 'male',
    preset: 'average',
    skinTone: '#d8a38c',
    heightCm: 183,
    proportions: { head: 0, chest: 0.2, arms: 0.1, waist: -0.2, hips: -0.1, shoulders: 0.3 },
  },
  confidence: 0.75,
  notes: 'Sample estimate for UI work.',
};

/** What avatar:estimateBody returns when the photo is unusable. */
export const SAMPLE_AVATAR_ESTIMATE_FALLBACK: AvatarEstimateResult = {
  body: { sex: 'unspecified', preset: 'average', skinTone: null, proportions: { head: 0, chest: 0, arms: 0, waist: 0, hips: 0, shoulders: 0 } },
  confidence: 0.1,
  notes: 'Sample fallback: the photo was not usable.',
};

export const SAMPLE_SCAN_START_ARGS: ScanStartArgs = {
  frames: [
    { frameId: 'f1', storageId: 'storage_sample_f1', timestampMs: 800 },
    { frameId: 'f2', storageId: 'storage_sample_f2', timestampMs: 2400 },
    { frameId: 'f3', storageId: 'storage_sample_f3', timestampMs: 4100 },
  ],
};

export const SAMPLE_SCAN_START_RESULT: ScanStartResult = { scanId: 'scan_sample_1', status: 'queued' };

export const SAMPLE_SCAN_PROCESSING: ScanJob = {
  scanId: 'scan_sample_1',
  status: 'processing',
  progress: { framesDone: 4, framesTotal: 10 },
  candidates: [],
};

export const SAMPLE_SCAN_FAILED: ScanJob = {
  scanId: 'scan_sample_1',
  status: 'failed',
  candidates: [],
  error: 'The clip was too dark to read. Try again near a window.',
};

export const SAMPLE_SCAN_REVIEW: ScanJob = {
  scanId: 'scan_sample_1',
  status: 'review',
  progress: { framesDone: 10, framesTotal: 10 },
  candidates: [
    { candidateId: 'cand_1', category: 'outerwear', subtype: 'denim jacket', color: 'indigo', colorHex: '#3F5878', crop: noMedia, frameId: 'f1', uncertain: false },
    { candidateId: 'cand_2', category: 'top', subtype: 't-shirt', color: 'black', colorHex: '#1E1E1E', crop: noMedia, frameId: 'f2', uncertain: false },
    { candidateId: 'cand_3', category: 'top', subtype: 't-shirt', color: 'black', colorHex: '#242424', crop: noMedia, frameId: 'f3', uncertain: true, uncertainReason: 'Looks like the black t-shirt from an earlier frame', possibleDuplicateOf: 'cand_2' },
    { candidateId: 'cand_4', category: 'bottom', subtype: 'chinos', color: 'khaki', colorHex: '#B49A72', crop: noMedia, frameId: 'f5', uncertain: false },
    { candidateId: 'cand_5', category: 'shoes', subtype: 'sneakers', color: 'white', colorHex: '#EDEAE4', crop: noMedia, frameId: 'f7', uncertain: false },
    { candidateId: 'cand_6', category: 'shoes', subtype: 'boots', color: 'brown', colorHex: '#6B4630', crop: noMedia, frameId: 'f8', uncertain: true, uncertainReason: 'Partly hidden behind another item' },
    { candidateId: 'cand_7', category: 'socks', subtype: 'crew socks', color: 'grey', colorHex: '#9A9A9A', crop: noMedia, frameId: 'f9', uncertain: false },
  ],
};

export const SAMPLE_SCAN_CONFIRM_RESULT: ScanConfirmResult = {
  scanId: 'scan_sample_1',
  status: 'confirmed',
  itemIds: ['item_scan_1', 'item_scan_2', 'item_scan_4', 'item_scan_5', 'item_scan_6', 'item_scan_7'],
};

export const SAMPLE_CLOSET: ClosetListResult = [
  { itemId: 'item_jacket_denim', category: 'outerwear', subtype: 'denim jacket', name: 'Denim jacket', color: 'indigo', colorHex: '#3F5878', media: noMedia, renderAssetKey: 'demo/jacket-denim', availability: 'available', wearCount: 6, wearsSinceWash: 2 },
  { itemId: 'item_shirt_white', category: 'top', subtype: 'oxford shirt', name: 'White oxford shirt', color: 'white', colorHex: '#F1EEE8', media: noMedia, renderAssetKey: 'demo/shirt-white', availability: 'available', wearCount: 4, wearsSinceWash: 1 },
  { itemId: 'item_tee_black', category: 'top', subtype: 't-shirt', name: 'Black t-shirt', color: 'black', colorHex: '#1E1E1E', media: noMedia, renderAssetKey: 'demo/tee-black', availability: 'laundry', wearCount: 9, wearsSinceWash: 3 },
  { itemId: 'item_trousers_charcoal', category: 'bottom', subtype: 'trousers', name: 'Charcoal trousers', color: 'charcoal', colorHex: '#3B3B40', media: noMedia, renderAssetKey: 'demo/trousers-charcoal', availability: 'available', wearCount: 5, wearsSinceWash: 2 },
  { itemId: 'item_chinos_khaki', category: 'bottom', subtype: 'chinos', name: 'Khaki chinos', color: 'khaki', colorHex: '#B49A72', media: noMedia, availability: 'available', wearCount: 2, wearsSinceWash: 0 },
  { itemId: 'item_sneakers_white', category: 'shoes', subtype: 'sneakers', name: 'White sneakers', color: 'white', colorHex: '#EDEAE4', media: noMedia, renderAssetKey: 'demo/sneakers-white', availability: 'available', wearCount: 12, wearsSinceWash: 4 },
  { itemId: 'item_boots_brown', category: 'shoes', subtype: 'boots', name: 'Brown leather boots', color: 'brown', colorHex: '#6B4630', media: noMedia, renderAssetKey: 'demo/boots-brown', availability: 'available', wearCount: 3, wearsSinceWash: 3 },
  { itemId: 'item_socks_grey', category: 'socks', subtype: 'crew socks', name: 'Grey crew socks', color: 'grey', colorHex: '#9A9A9A', media: noMedia, availability: 'available', wearCount: 7, wearsSinceWash: 1 },
];

export const SAMPLE_SUGGEST_ARGS: StylistSuggestArgs = {
  prompt: 'dinner with friends',
  lockedItemIds: ['item_jacket_denim'],
  weather: { tempC: 14, condition: 'clear' },
};

export const SAMPLE_SUGGEST_RESULT: StylistSuggestResult = {
  outfits: [
    { outfitId: 'outfit_sample_1', rank: 1, itemIds: ['item_jacket_denim', 'item_shirt_white', 'item_trousers_charcoal', 'item_boots_brown'], reason: 'Smart enough for dinner, and the jacket keeps it relaxed.' },
    { outfitId: 'outfit_sample_2', rank: 2, itemIds: ['item_jacket_denim', 'item_shirt_white', 'item_chinos_khaki', 'item_sneakers_white'], reason: 'A lighter take if the place is casual.' },
  ],
};

export const SAMPLE_SUGGEST_LOCKED_UNAVAILABLE: StylistSuggestResult = {
  outfits: [],
  lockedUnavailableItemIds: ['item_tee_black'],
};

export const SAMPLE_CONFIRM_WEAR_ARGS: ConfirmWearArgs = {
  itemIds: ['item_jacket_denim', 'item_shirt_white', 'item_trousers_charcoal', 'item_sneakers_white'],
  requestId: 'req_sample_1',
  outfitId: 'outfit_sample_1',
  occasion: 'dinner with friends',
  tzOffsetMinutes: -480,
};

export const SAMPLE_CONFIRM_WEAR_RESULT: ConfirmWearResult = {
  wear: { wearId: 'wear_sample_1', itemIds: SAMPLE_CONFIRM_WEAR_ARGS.itemIds, wornAt: 1794787200000, requestId: 'req_sample_1' },
  challenge: [{ itemId: 'item_jacket_denim', distinctOutfits: 2, target: 3, completed: false }],
  duplicate: false,
  streakDays: 1,
};

export const SAMPLE_MIRROR_PROPS: Pick<MirrorProps, 'avatar' | 'garmentAssetKeys'> = {
  avatar: SAMPLE_AVATAR,
  garmentAssetKeys: ['demo/jacket-denim', 'demo/shirt-white', 'demo/trousers-charcoal', 'demo/boots-brown'],
};
