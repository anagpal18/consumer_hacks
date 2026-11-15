import { ConvexProvider } from 'convex/react';
import type { ReactNode } from 'react';

import { convex } from './client';

export function DataProvider({ children }: { children: ReactNode }) {
  if (!convex) return children;
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
