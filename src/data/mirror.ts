import { PRIVATE_CATEGORIES, type AvatarRef, type ClosetItem, type GarmentCategory, type MirrorProps } from '@shared/contract';

/**
 * Local copies of MirrorGarment (shared/contract.ts) and RenderSlot (shared/renderAssets.ts)
 * from PR #4 (kenil/mirror-3d). Import those instead once it merges.
 */
export type RenderSlot = 'outerwear' | 'top' | 'bottom' | 'shoes';

export type MirrorGarment = {
  slot: string;
  renderAssetKey?: string;
  colorHex?: string;
  label: string;
};

const SLOT_BY_CATEGORY: Partial<Record<GarmentCategory, RenderSlot>> = {
  outerwear: 'outerwear',
  top: 'top',
  bottom: 'bottom',
  shoes: 'shoes',
};

export type OutfitMirrorProps = Pick<MirrorProps, 'avatar' | 'garmentAssetKeys'> & { garments: MirrorGarment[] };

/**
 * An outfit's closet items as Mirror props. Socks and underwear never reach the avatar,
 * and categories without a render slot (dress, accessory) are left off until one exists.
 */
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
