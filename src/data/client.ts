import { ConvexReactClient } from 'convex/react';

import { CLOSET_CODE, CONVEX_URL, DATA_MODE } from './mode';

function createClient() {
  if (DATA_MODE !== 'live') return null;
  if (!CONVEX_URL) {
    throw new Error('EXPO_PUBLIC_DATA_MODE=live needs EXPO_PUBLIC_CONVEX_URL. Copy .env.example to .env.local.');
  }
  if (!CLOSET_CODE) {
    throw new Error('EXPO_PUBLIC_DATA_MODE=live needs EXPO_PUBLIC_CLOSET_CODE in .env.local (see docs/backend-handoff.md).');
  }
  return new ConvexReactClient(CONVEX_URL);
}

/** Null in fixture mode. */
export const convex = createClient();

export function liveClient(): ConvexReactClient {
  if (!convex) throw new Error('The Convex client only exists in live mode.');
  return convex;
}
