import { mockApi } from './mockApi';
import type { WearAgainApi } from './types';

/**
 * The one data-access seam. Kenil: write convexApi.ts implementing WearAgainApi
 * and export it here instead of mockApi. No screen imports mockApi directly.
 */
export const api: WearAgainApi = mockApi;

export type { AvatarProfile, ProportionPreset, WearAgainApi, WearProgress } from './types';
