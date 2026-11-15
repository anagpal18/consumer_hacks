/**
 * Messages between the React Native host (src/components/Mirror.tsx) and the
 * three.js viewer page (mirror-viewer/viewer.ts). Both sides import this file.
 */

/** A GLB either fetched by URL (web) or passed inline as base64 (native WebView). */
export type AssetSource = { url: string } | { base64: string };

export type ViewerGarment = {
  /** Identity of what is worn in the slot; a change swaps that slot's mesh. */
  id: string;
  slot: string;
  /** GLB to load, the registry key of the garment or of the slot's tint template. */
  asset: string;
  /** Bit used by the _HIDE vertex masks baked into the GLBs. */
  bit: number;
  /** Omitted when the viewer already holds this asset. */
  src?: AssetSource;
  /** Hex color: replace the asset's color texture with this flat color (approximate fallback). */
  tint?: string;
};

/** Resolved body: every field maps directly onto morph weights, a texture and a scale. */
export type ViewerBody = {
  /** Key of AVATAR_PRESETS; the base mesh is male-average. */
  meshPreset: string;
  female: boolean;
  /** Hex skin color, or null for the texture's own color. */
  skinTone: string | null;
  heightScale: number;
  /** Already clamped, -1..1 per proportion key. */
  proportions: Record<string, number>;
};

export type HostMessage =
  | { type: 'scene'; avatarId: string; avatarSrc: AssetSource | null; garments: ViewerGarment[] }
  | { type: 'body'; body: ViewerBody }
  | { type: 'reset' }
  | { type: 'rotateTo'; yawDeg: number }
  | { type: 'zoom'; scale: number };

export type ViewerMessage =
  | { type: 'booted' }
  | { type: 'state'; status: 'loading' }
  | { type: 'state'; status: 'ready'; slots: Record<string, string> }
  | { type: 'state'; status: 'error'; message: string };
