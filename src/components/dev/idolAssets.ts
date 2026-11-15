import idolSplat from '../../../assets/idol/idol_avatar.splat';
import type { SplatUpAxis } from './splatViewerHtml';

export type IdolAsset = {
  label: string;
  source: string;
  module: number;
  up: SplatUpAxis;
  yaw?: number;
};

export const IDOL_ASSETS: Record<string, IdolAsset> = {
  idol: {
    label: 'IDOL avatar (sample photo, canonical T-pose)',
    source: 'IDOL CVPR 2025 checkpoint, run on CPU (see assets/idol/README.md)',
    module: idolSplat,
    up: '-y',
  },
};

export const DEFAULT_IDOL_ASSET = 'idol';
