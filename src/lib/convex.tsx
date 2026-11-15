import { ConvexProvider, ConvexReactClient, useMutation } from 'convex/react';
import { useEffect, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';

export { api };
export type { Id } from '../../convex/_generated/dataModel';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

/** Shared demo closet. Every phone with the same code sees and edits the same closet. */
export const CLOSET_CODE = process.env.EXPO_PUBLIC_CLOSET_CODE || 'demo-closet';

export const convex = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;

function JoinCloset() {
  const join = useMutation(api.profiles.join);
  useEffect(() => {
    join({ closetCode: CLOSET_CODE }).catch((e) => console.warn('Could not join closet', e));
  }, [join]);
  return null;
}

/** Wrap the root layout with this. Without EXPO_PUBLIC_CONVEX_URL it renders children with no backend. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    console.warn('EXPO_PUBLIC_CONVEX_URL is not set; Convex is disabled.');
    return <>{children}</>;
  }
  return (
    <ConvexProvider client={convex}>
      <JoinCloset />
      {children}
    </ConvexProvider>
  );
}

/** Upload one local file (for example a frame from expo-video-thumbnails) and return its storage id. */
export async function uploadFile(uri: string, contentType = 'image/jpeg') {
  if (!convex) throw new Error('Convex is not configured');
  const uploadUrl = await convex.mutation(api.media.generateUploadUrl, { closetCode: CLOSET_CODE });
  const body = await (await fetch(uri)).blob();
  const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}
