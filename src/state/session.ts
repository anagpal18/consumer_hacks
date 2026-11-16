import { useSyncExternalStore } from 'react';

import type { GarmentCategory, Id } from '@shared/contract';

/** Local UI state that outlives a screen: cross-screen handoffs and scan review drafts. */

export type ScanDraft = {
  /** candidateId -> kept. Missing means kept. */
  rejected: Record<Id, boolean>;
  category: Record<Id, GarmentCategory>;
  color: Record<Id, string>;
  /** candidateId -> candidate it is merged into. */
  mergedInto: Record<Id, Id>;
  /** Uncertain candidates the user explicitly chose to keep. */
  keptBoth: Record<Id, boolean>;
};

type Session = {
  /** One-line notice Home shows once, for example after a scan is confirmed. */
  homeNotice: string | null;
  /** Styling request another screen sends to Home (Feed remake, Shop preview). */
  pendingPrompt: string | null;
  activeScanId: Id | null;
  scanDrafts: Record<Id, ScanDraft>;
};

let session: Session = { homeNotice: null, pendingPrompt: null, activeScanId: null, scanDrafts: {} };
const listeners = new Set<() => void>();

export function setSession(patch: Partial<Session>) {
  session = { ...session, ...patch };
  listeners.forEach((listener) => listener());
}

export function useSession(): Session {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
    () => session,
  );
}

export const emptyScanDraft: ScanDraft = { rejected: {}, category: {}, color: {}, mergedInto: {}, keptBoth: {} };
