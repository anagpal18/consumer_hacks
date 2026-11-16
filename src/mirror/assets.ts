/**
 * App-side registry: avatars, and per avatar the garment GLB for each renderAssetKey.
 * The keys, slots and matching metadata live in shared/renderAssets.ts; this file
 * only adds what the renderer needs. Every garment GLB of an avatar was baked in that
 * avatar's pose on that avatar's body (assets/mirror/README.md), so a garment mesh can
 * be swapped on its own, and the same renderAssetKey resolves to a different GLB per body.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { RENDER_ASSETS, type RenderAssetMeta, type RenderSlot } from '@shared/renderAssets';

export type MirrorAsset = RenderAssetMeta & {
  /** Bit of this garment in the hide masks baked into the GLBs (COLOR_0.r). */
  bit: number;
  label: string;
  /** Set when the mesh only approximates the item; shown in the viewer. */
  approximate?: string;
};

const GARMENTS: Record<string, { bit: number; label: string; approximate?: string }> = {
  'demo/jacket-denim': { bit: 1, label: 'Denim jacket' },
  'demo/shirt-white': { bit: 2, label: 'White oxford shirt' },
  'demo/tee-black': { bit: 4, label: 'Black t-shirt' },
  'demo/trousers-charcoal': { bit: 8, label: 'Charcoal trousers' },
  'demo/sneakers-white': { bit: 16, label: 'White sneakers' },
  'demo/boots-brown': { bit: 32, label: 'Brown leather boots', approximate: 'Brown leather boots shown as low leather shoes' },
  'avaturn/sneakers-blue': { bit: 64, label: 'Blue canvas sneakers' },
};

export const MIRROR_ASSETS: Record<string, MirrorAsset> = {
  ...Object.fromEntries(RENDER_ASSETS.map((meta) => [meta.key, { ...meta, ...GARMENTS[meta.key] }])),
  // Avaturn ships its outfit as one fused mesh, so it is worn whole in the top slot and is not
  // a closet match (not in shared/renderAssets.ts). Wear it without a bottom.
  'avaturn/look': {
    key: 'avaturn/look',
    slot: 'top',
    category: 'top',
    subtypes: [],
    colorFamily: 'brown',
    bit: 128,
    label: 'Avaturn outfit: leather jacket, white tee and black joggers (one piece)',
  },
};

/** Mesh drawn with a flat item color when a slot's garment has no asset on this avatar. */
export const TINT_TEMPLATES: Record<RenderSlot, string> = {
  outerwear: 'demo/jacket-denim',
  top: 'demo/tee-black',
  bottom: 'demo/trousers-charcoal',
  shoes: 'demo/sneakers-white',
};

export type MirrorAvatar = {
  /** Metro asset module id of the avatar GLB. */
  asset: number;
  /** Shown on the viewer. */
  label: string;
  /** Built with the body preset and proportion morph targets (AvatarRef.body applies). */
  morphs: boolean;
  /** Metro asset module id of each garment GLB fitted to this avatar. */
  garments: Record<string, number>;
};

export const DEFAULT_AVATAR_KEY = 'demo/avatar-a';

/** Avaturn export that arrives already dressed (body, hair, shoes and one outfit mesh). */
export const DRESSED_AVATAR_KEY = 'demo/avatar-b';

export const AVATARS: Record<string, MirrorAvatar> = {
  [DEFAULT_AVATAR_KEY]: {
    asset: require('../../assets/mirror/avatar-a.glb'),
    label: 'Demo avatar',
    morphs: true,
    garments: {
      'demo/jacket-denim': require('../../assets/mirror/jacket-denim.glb'),
      'demo/shirt-white': require('../../assets/mirror/shirt-white.glb'),
      'demo/tee-black': require('../../assets/mirror/tee-black.glb'),
      'demo/trousers-charcoal': require('../../assets/mirror/trousers-charcoal.glb'),
      'demo/sneakers-white': require('../../assets/mirror/sneakers-white.glb'),
      'demo/boots-brown': require('../../assets/mirror/boots-brown.glb'),
    },
  },
  kenil: {
    asset: require('../../assets/mirror/kenil/avatar.glb'),
    label: 'My avatar',
    morphs: false,
    garments: {
      'demo/jacket-denim': require('../../assets/mirror/kenil/jacket-denim.glb'),
      'demo/shirt-white': require('../../assets/mirror/kenil/shirt-white.glb'),
      'demo/tee-black': require('../../assets/mirror/kenil/tee-black.glb'),
      'demo/trousers-charcoal': require('../../assets/mirror/kenil/trousers-charcoal.glb'),
      'avaturn/look': require('../../assets/mirror/kenil/look.glb'),
      'avaturn/sneakers-blue': require('../../assets/mirror/kenil/sneakers-blue.glb'),
      'demo/sneakers-white': require('../../assets/mirror/kenil/sneakers-white.glb'),
      'demo/boots-brown': require('../../assets/mirror/kenil/boots-brown.glb'),
    },
  },
  [DRESSED_AVATAR_KEY]: {
    asset: require('../../assets/mirror/avatar-b.glb'),
    label: 'Demo avatar',
    morphs: false,
    garments: {},
  },
};

/**
 * Avatars whose clothes are part of the model. The garment GLBs were baked on avatar-a's
 * body and pose, so they are not drawn over these; the outfit's pieces show as photos instead.
 */
export const DRESSED_AVATARS = new Set<string>([DRESSED_AVATAR_KEY]);

/** EXPO_PUBLIC_MIRROR_AVATAR=b opts in to the Avaturn avatar; the default keeps the swappable-garment body. */
export const PREFERRED_AVATAR_KEY = process.env.EXPO_PUBLIC_MIRROR_AVATAR === 'b' ? DRESSED_AVATAR_KEY : DEFAULT_AVATAR_KEY;
