import { ConvexProvider, useMutation } from 'convex/react';
import { useEffect, type ReactNode } from 'react';

import { convex } from './client';
import { CLOSET_CODE } from './mode';
import { refs } from './refs';

function JoinCloset() {
  const join = useMutation(refs.profilesJoin);
  useEffect(() => {
    join({ closetCode: CLOSET_CODE }).catch((error) => console.warn('Could not join closet', error));
  }, [join]);
  return null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  if (!convex) return children;
  return (
    <ConvexProvider client={convex}>
      <JoinCloset />
      {children}
    </ConvexProvider>
  );
}
