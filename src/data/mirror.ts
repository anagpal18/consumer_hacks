import { PRIVATE_CATEGORIES, type AvatarRef, type ClosetItem, type GarmentCategory, type MirrorProps } from '@shared/contract';

/**
 * Local copy of the shape HEHE-13 is adding to shared/contract.ts (MirrorProps.garments)
 * and shared/renderAssets.ts (category to slot). Replace these with the shared imports
 * once that PR lands.
 */
export type GarmentSlot = 'outerwear' | 'top' | 'bottom' | 'dress' | 'shoes' | 'accessory';

export type MirrorGarment = {
  slot: GarmentSlot;
  renderAssetKey?: string;
  colorHex?: string;
  label: string;
};

const SLOT_BY_CATEGORY: Partial<Record<GarmentCategory, GarmentSlot>> = {
  outerwear: 'outerwear',
  top: 'top',
  bottom: 'bottom',
  dress: 'dress',
  shoes: 'shoes',
  accessory: 'accessory',
};

export type OutfitMirrorProps = Pick<MirrorProps, 'avatar' | 'garmentAssetKeys'> & { garments: MirrorGarment[] };

/** An outfit's closet items as Mirror props. Socks and underwear never reach the avatar. */
export function outfitToMirrorProps(avatar: AvatarRef, items: ClosetItem[]): OutfitMirrorProps {
  const garments = items.flatMap((item): MirrorGarment[] => {
    const slot = SLOT_BY_CATEGORY[item.category];
    if (!slot || PRIVATE_CATEGORIES.includes(item.category)) return [];
    return [{ slot, renderAssetKey: item.renderAssetKey, colorHex: item.colorHex, label: item.name }];
  });
  return {
    avatar,
    garments,
    garmentAssetKeys: garments.flatMap((garment) => (garment.renderAssetKey ? [garment.renderAssetKey] : [])),
  };
}
