import { Asset } from 'expo-asset';

import type { AssetSource } from './protocol';

export async function loadAssetSource(moduleId: number): Promise<AssetSource> {
  return { url: Asset.fromModule(moduleId).uri };
}
