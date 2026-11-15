/**
 * App-side registry: renderAssetKey -> slot, GLB asset and display label.
 * The keys, slots and matching metadata live in shared/renderAssets.ts; this file
 * only adds what the renderer needs. Every garment GLB was baked in the same pose
 * on the same body (assets/mirror/LICENSES.md, scripts in assets/mirror/README.md),
 * so a garment mesh can be swapped on its own.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { RENDER_ASSETS, type RenderAssetMeta, type RenderSlot } from '@shared/renderAssets';

export type MirrorAsset = RenderAssetMeta & {
  /** Metro asset module id of the GLB. */
  asset: number;
  /** Bit of this garment in the _HIDE vertex masks baked into the GLBs. */
  bit: number;
  label: string;
  /** Set when the mesh only approximates the item; shown in the viewer. */
  approximate?: string;
};

const FILES: Record<string, { asset: number; bit: number; label: string; approximate?: string }> = {
  'demo/jacket-denim': { asset: require('../../assets/mirror/jacket-denim.glb'), bit: 1, label: 'Denim jacket' },
  'demo/shirt-white': { asset: require('../../assets/mirror/shirt-white.glb'), bit: 2, label: 'White oxford shirt' },
  'demo/tee-black': { asset: require('../../assets/mirror/tee-black.glb'), bit: 4, label: 'Black t-shirt' },
  'demo/trousers-charcoal': { asset: require('../../assets/mirror/trousers-charcoal.glb'), bit: 8, label: 'Charcoal trousers' },
  'demo/sneakers-white': { asset: require('../../assets/mirror/sneakers-white.glb'), bit: 16, label: 'White sneakers' },
  'demo/boots-brown': {
    asset: require('../../assets/mirror/boots-brown.glb'),
    bit: 32,
    label: 'Brown leather boots',
    approximate: 'Brown leather boots shown as low leather shoes',
  },
};

export const MIRROR_ASSETS: Record<string, MirrorAsset> = Object.fromEntries(
  RENDER_ASSETS.map((meta) => [meta.key, { ...meta, ...FILES[meta.key] }]),
);

/** Mesh drawn with a flat item color when a slot's garment has no supported asset. */
export const TINT_TEMPLATES: Record<RenderSlot, string> = {
  outerwear: 'demo/jacket-denim',
  top: 'demo/tee-black',
  bottom: 'demo/trousers-charcoal',
  shoes: 'demo/sneakers-white',
};

export const DEFAULT_AVATAR_KEY = 'demo/avatar-a';

export const AVATAR_ASSETS: Record<string, number> = {
  [DEFAULT_AVATAR_KEY]: require('../../assets/mirror/avatar-a.glb'),
};
