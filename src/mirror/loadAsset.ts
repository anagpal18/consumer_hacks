import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import type { AssetSource } from './protocol';

/** WKWebView cannot fetch file:// URLs from an inline page, so native passes GLBs as base64. */
export async function loadAssetSource(moduleId: number): Promise<AssetSource> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Could not open ' + asset.name);
  return { base64: await new File(asset.localUri).base64() };
}
