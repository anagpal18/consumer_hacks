import { convexApi } from './convexApi';
import { mockApi } from './mockApi';
import { IS_FIXTURE_MODE } from './mode';
import type { WearAgainApi } from './types';

/**
 * The one data-access seam. EXPO_PUBLIC_DATA_MODE=live uses the Convex backend,
 * anything else the in-memory mock. No screen imports either directly.
 */
export const api: WearAgainApi = IS_FIXTURE_MODE ? mockApi : convexApi;

export type { AvatarProfile, ProportionPreset, WearAgainApi, WearProgress } from './types';
