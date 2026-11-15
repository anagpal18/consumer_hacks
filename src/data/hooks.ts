import { useEffect, useState } from 'react';

import type { ClosetItem } from '@shared/contract';

import { api } from './api';
import type { AvatarProfile, WearProgress } from './types';

function useLive<T>(load: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      load().then((next) => {
        if (live) setValue(next);
      });
    };
    refresh();
    const unsubscribe = api.subscribe(refresh);
    return () => {
      live = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** null while loading. Refreshes whenever the data layer reports a change. */
export const useCloset = (): ClosetItem[] | null => useLive(() => api.closet.list({}));
export const useProfile = (): AvatarProfile | null => useLive(() => api.profile.get());
export const useWearProgress = (): WearProgress | null => useLive(() => api.outfits.progress());
