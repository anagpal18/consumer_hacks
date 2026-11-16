/**
 * Supported 3D garment assets for the mirror, as plain data.
 *
 * convex/ imports this to map a scanned closet item to a renderAssetKey: set
 * ClosetItem.renderAssetKey only when the item defensibly matches an entry here
 * (same category and slot, a listed subtype, the same color family). Otherwise
 * leave it unset; the mirror then draws a tinted stand-in for the slot from the
 * item's colorHex and labels it approximate.
 *
 * Key format: "<namespace>/<garment>-<color>", lowercase kebab-case, for example
 * "demo/sneakers-white". "demo/" is the bundled demo set. Keys are stable ids:
 * never reuse a key for a different mesh. The app side (src/mirror/assets.ts)
 * adds the GLB file for each key.
 */
import type { GarmentCategory } from './contract';

/** One mesh per slot is worn at a time; changing a slot's key swaps only that mesh. */
export type RenderSlot = 'outerwear' | 'top' | 'bottom' | 'shoes';

export const RENDER_SLOTS: readonly RenderSlot[] = ['outerwear', 'top', 'bottom', 'shoes'];

export type ColorFamily = 'white' | 'black' | 'grey' | 'blue' | 'brown' | 'beige' | 'green' | 'red';

export type RenderAssetMeta = {
  key: string;
  slot: RenderSlot;
  category: GarmentCategory;
  /** Subtypes this mesh can stand for, matched against ClosetItem.subtype. */
  subtypes: string[];
  colorFamily: ColorFamily;
};

export const RENDER_ASSETS: readonly RenderAssetMeta[] = [
  { key: 'demo/jacket-denim', slot: 'outerwear', category: 'outerwear', subtypes: ['denim jacket', 'jean jacket', 'trucker jacket'], colorFamily: 'blue' },
  { key: 'demo/shirt-white', slot: 'top', category: 'top', subtypes: ['oxford shirt', 'button-down shirt', 'dress shirt', 'shirt'], colorFamily: 'white' },
  { key: 'demo/tee-black', slot: 'top', category: 'top', subtypes: ['t-shirt', 'tee', 'crew neck t-shirt'], colorFamily: 'black' },
  { key: 'demo/trousers-charcoal', slot: 'bottom', category: 'bottom', subtypes: ['trousers', 'suit trousers', 'dress pants', 'slacks'], colorFamily: 'grey' },
  { key: 'demo/sneakers-white', slot: 'shoes', category: 'shoes', subtypes: ['sneakers', 'trainers', 'running shoes'], colorFamily: 'white' },
  { key: 'demo/boots-brown', slot: 'shoes', category: 'shoes', subtypes: ['boots', 'leather boots', 'chelsea boots', 'derby shoes', 'leather shoes'], colorFamily: 'brown' },
];
