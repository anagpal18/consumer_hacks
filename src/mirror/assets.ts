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

export type BodyGender = 'male' | 'female';
export type BodyType = { key: string; gender: BodyGender; label: string; asset: number; shoulders: number; waist: number; hips: number };

/** Onboarding body types: one rigged mannequin GLB each (assets/mirror/bodies). */
export const BODY_TYPES: BodyType[] = [
  { key: 'body/male-1', gender: 'male', label: 'Slim', asset: require('../../assets/mirror/bodies/male_1_slim.glb'), shoulders: 36, waist: 26, hips: 30 },
  { key: 'body/male-2', gender: 'male', label: 'Lean', asset: require('../../assets/mirror/bodies/male_2_lean.glb'), shoulders: 40, waist: 30, hips: 32 },
  { key: 'body/male-3', gender: 'male', label: 'Athletic', asset: require('../../assets/mirror/bodies/male_3_athletic.glb'), shoulders: 50, waist: 32, hips: 34 },
  { key: 'body/male-4', gender: 'male', label: 'Average', asset: require('../../assets/mirror/bodies/male_4_average.glb'), shoulders: 44, waist: 40, hips: 38 },
  { key: 'body/male-5', gender: 'male', label: 'Heavy', asset: require('../../assets/mirror/bodies/male_5_heavy.glb'), shoulders: 48, waist: 52, hips: 46 },
  { key: 'body/female-1', gender: 'female', label: 'Slim', asset: require('../../assets/mirror/bodies/female_1_slim.glb'), shoulders: 32, waist: 24, hips: 32 },
  { key: 'body/female-2', gender: 'female', label: 'Lean', asset: require('../../assets/mirror/bodies/female_2_lean.glb'), shoulders: 34, waist: 26, hips: 36 },
  { key: 'body/female-3', gender: 'female', label: 'Average', asset: require('../../assets/mirror/bodies/female_3_average.glb'), shoulders: 38, waist: 32, hips: 42 },
  { key: 'body/female-4', gender: 'female', label: 'Curvy', asset: require('../../assets/mirror/bodies/female_4_curvy.glb'), shoulders: 38, waist: 30, hips: 50 },
  { key: 'body/female-5', gender: 'female', label: 'Plus', asset: require('../../assets/mirror/bodies/female_5_plus.glb'), shoulders: 44, waist: 46, hips: 54 },
];

/** The onboarding mannequins. Garment meshes are fitted to avatar-a, so on these the pieces show as photos. */
export const isMannequin = (key: string | undefined) => !!key && key.startsWith('body/');

export const DEFAULT_AVATAR_KEY = 'demo/avatar-a';

/** Avaturn export that arrives already dressed (body, hair, shoes and one outfit mesh). */
export const DRESSED_AVATAR_KEY = 'demo/avatar-b';

export const AVATAR_ASSETS: Record<string, number> = {
  [DEFAULT_AVATAR_KEY]: require('../../assets/mirror/avatar-a.glb'),
  [DRESSED_AVATAR_KEY]: require('../../assets/mirror/avatar-b.glb'),
  ...Object.fromEntries(BODY_TYPES.map((b) => [b.key, b.asset])),
};


/**
 * Avatars whose clothes are part of the model. The garment GLBs were baked on avatar-a's
 * body and pose, so they are not drawn over these; the outfit's pieces show as photos instead.
 */
export const DRESSED_AVATARS = new Set<string>([DRESSED_AVATAR_KEY, ...BODY_TYPES.map((b) => b.key)]);

/** EXPO_PUBLIC_MIRROR_AVATAR=b opts in to the Avaturn avatar; the default keeps the swappable-garment body. */
export const PREFERRED_AVATAR_KEY = process.env.EXPO_PUBLIC_MIRROR_AVATAR === 'b' ? DRESSED_AVATAR_KEY : DEFAULT_AVATAR_KEY;
