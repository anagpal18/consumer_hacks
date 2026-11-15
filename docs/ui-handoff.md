# UI handoff for Kenil

The UI runs entirely on sample data today. Two files are the integration seams; nothing else needs to change to go live.

## 1. Data: `src/data/api.ts`

Every screen calls `api` from `@/data/api` and nothing else. `api` is typed as `WearAgainApi` (`src/data/types.ts`) and is currently `mockApi` (`src/data/mockApi.ts`, in-memory, resets on reload). To go live, write `src/data/convexApi.ts` implementing `WearAgainApi` and export it from `api.ts`.

| Method | Contract type (`shared/contract.ts`) | Used by |
|---|---|---|
| `api.media.prepareScan(clipUri)` | returns `ScanStartArgs` | Scan. Extract about 10 frames from the local clip, upload to Convex storage, return `{ frames: [{ frameId, storageId, timestampMs }], videoStorageId? }`. `clipUri` is null only for the mock's sample clip. |
| `api.scans.start(args)` | `ScanStartArgs -> ScanStartResult` | Scan |
| `api.scans.get({ scanId })` | `ScanJob` | Scan polls every 700 ms until `review`, `failed` or `confirmed`; Review reads it once |
| `api.scans.confirm(args)` | `ScanConfirmArgs -> ScanConfirmResult` | Review, **Add N to closet** |
| `api.closet.list({})` | `ClosetItem[]` | Home, Closet, Shop, Profile through `useCloset()` |
| `api.closet.setStatus(args)` | `ClosetSetStatusArgs` | Closet **Move to laundry**, Home **In laundry** |
| `api.closet.markWashed({ itemIds? })` | `ClosetMarkWashedArgs` | Closet **Washed, put back** and bulk **Laundry done** (no ids) |
| `api.stylist.suggest(args)` | `StylistSuggestArgs -> StylistSuggestResult` | Home |
| `api.outfits.confirmWear(args)` | `ConfirmWearArgs -> ConfirmWearResult` | Home **Wearing this** |
| `api.outfits.progress()` | `WearProgress` (UI-only type) | Profile |
| `api.profile.get()`, `api.profile.save(patch)` | `AvatarProfile` (UI-only type) | Onboarding, Home, Profile |
| `api.subscribe(listener)` | | `src/data/hooks.ts` refetches on every call of the listener |
| `api.privacy.deleteScan({ closetCode, scanId })` | `DeleteScanArgs -> DeleteScanResult` (`{ deleted, scanId, deletedCandidates, deletedFiles, keptItemPhotos }`), backed by `privacy:deleteScan` | Review, **Delete this scan** (asks once, then returns to `/scan`) |
| `api.closetCode` | string | The real adapter sets it from `process.env.EXPO_PUBLIC_CLOSET_CODE` and adds it to every Convex call. The mock uses an obviously fake value. No code is committed. |
| `api.usingMockData` | boolean | Set false to hide every "Sample" badge |
| `api.dev.loadSampleCloset` | optional | Leave undefined on the real adapter; the buttons disappear |

Things to know when wiring:

- **Live updates.** `useCloset`, `useProfile` and `useWearProgress` refetch whenever `subscribe` listeners fire. With Convex, either call the listeners from a `client.onUpdate` / watch on the closet query, or replace the three hooks with `useQuery` and keep their return shape (`null` while loading).
- **Isolated swap.** When any piece of the current outfit stops being `available` (including from a second phone), Home calls `stylist.suggest` with every other piece in `lockedItemIds` and the removed piece in `excludeItemIds`, then swaps only the piece of the same category from `outfits[0]`. **Change** uses the same call. `excludeItemIds` is an addition to the plan's minimum contract; Shresth needs to honor it.
- **Locked piece unavailable.** If `lockedUnavailableItemIds` is non-empty, Home unlocks those pieces and asks the user to try again.
- **Optional backend fields.** Home sends `currentItemIds` (the whole current look) on every re-suggest of the look on screen: a manual Change, the automatic swap when a worn piece becomes unavailable, and asking again with the same occasion. Only the first suggestion and a new occasion omit it, because there is no look to keep. On single-piece changes it and prefers the returned `swaps` entry for the changed piece, falling back to a same-category match. `confirmWear` sends `tzOffsetMinutes` as minutes east of UTC (`-new Date().getTimezoneOffset()`, so Pacific standard time is -480); flip the sign in Home if the backend expects the other convention. The saved card shows `streakDays` when returned.
- **Wear idempotency.** Home sends one `requestId` per distinct outfit and reuses it on retry.
- **Onboarding fields** (`heightCm`, `proportion`, `adjust`, `photoUri`) and `WearProgress` are not in `shared/contract.ts`. Add them there if the backend stores them.
- **Crops.** `GarmentThumb` shows `media.url` when present, otherwise a labeled color swatch from `colorHex`.

## 2. Mirror: `src/components/Mirror.tsx`

Replace the body with the real viewer. Keep the props, which are `MirrorProps` from the contract:

| Prop | Direction | Meaning |
|---|---|---|
| `avatar: AvatarRef` | in | `{ kind, key, demo? }` |
| `garmentAssetKeys: string[]` | in | `renderAssetKey` of each worn piece that has one |
| `onStateChange(state)` | out | `loading`, `ready` or `{ status: 'error', message }`. Home shows the message and a Retry button inside the viewer and keeps the garment controls usable. |
| `onControlsReady(controls)` | out | `{ resetView, rotateTo(yawDeg), setZoom(scale), retry }`. Home's three round buttons call these as the tap alternative to gestures. |

The component must fill its parent (`flex: 1`). Home overlays the title, profile button, viewer buttons and banners on top with `position: absolute`, so keep the center free for rotate and pinch. Pieces without a `renderAssetKey` are shown by Home in a "Shown as photo" stack; the Mirror never receives them. The placeholder maps the six `demo/*` keys used in `SAMPLE_CLOSET` to flat colors; real keys are yours and Shresth's to settle.

## Routes

| Route | File | Notes |
|---|---|---|
| `/` | `src/app/(tabs)/index.tsx` | Home mirror. Redirects to `/onboarding` until `profile.onboarded`. |
| `/feed` | `src/app/(tabs)/feed.tsx` | Sample posts. **Make it with my closet** sets `pendingPrompt` and goes Home. |
| `/closet` | `src/app/(tabs)/closet.tsx` | Grid, filters, laundry |
| `/shop` | `src/app/(tabs)/shop.tsx` | One sample recommendation |
| `/onboarding` | `src/app/onboarding.tsx` | Avatar setup, also reached from Profile |
| `/scan` | `src/app/scan/index.tsx` | Record or choose a video, progress |
| `/scan/review?scanId=` | `src/app/scan/review.tsx` | Review, then back to Home with a notice |
| `/profile` | `src/app/profile.tsx` | Modal from the top-right button on every tab |

Cross-screen state lives in `src/state/session.ts`: `homeNotice`, `pendingPrompt` (any screen can send Home a styling request with `setSession({ pendingPrompt })` then `router.navigate('/')`), `activeScanId` and `scanDrafts` (review edits survive leaving the screen; in memory only).

## Test IDs for Revyl

`onboarding-preset`, `onboarding-create`, `scan-cta`, `closet-scan`, `scan-record`, `scan-choose`, `scan-sample` (mock only), `candidate-<id>`, `merge-<id>`, `keep-<id>`, `add-to-closet`, `delete-scan`, `delete-scan-confirm`, `plans-input`, `plans-send`, `chip-<category>`, `action-lock`, `action-change`, `action-laundry`, `change-banner`, `wearing-this`, `wear-saved`, `laundry-done`, `closet-<itemId>`.

## What is mocked

Everything behind `api`: detection (always the same seven sample candidates, whatever video is picked), the stylist (rule-based), wear log, challenge progress, profile. The mirror is a flat placeholder figure. Feed posts and the Shop item are hard-coded samples. Voice input shows a notice only. Onboarding always yields the demo avatar.

## Dependencies

Only packages that ship in Expo Go for SDK 58: `expo-image-picker` (video and photo pick or record), `expo-image`, `@expo/vector-icons`, `react-native-safe-area-context`, `expo-router`. No custom native modules.
