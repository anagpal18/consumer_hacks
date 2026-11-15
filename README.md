# Wear Again V2

Record a video of your clothes, confirm what the app found, and get dressed using what you own. Hackathon build; the plan lives in [docs/build.md](docs/build.md).

## Run

Requires Node 20 or newer.

```bash
npm install
npx expo start          # scan the QR code with Expo Go, or press w for web
npm run web             # web only
npm run typecheck
npm run lint
npx expo export --platform web   # bundle check
```

Add packages with `npx expo install <package>` so versions match the Expo SDK.

## Closet code

The closet code is the only credential for a closet, so it never goes in source. When the app is wired to Convex, put it in `.env.local` (git-ignored):

```bash
EXPO_PUBLIC_CLOSET_CODE=<long random code from docs/backend-handoff.md>
```

The sample-data build needs no code; its mock adapter uses a fake value.

## Layout

| Path | Owner | What |
|---|---|---|
| `src/app/` | Aditya | expo-router screens. Tabs: Home, Feed, Closet, Shop. Profile opens from the top corner. |
| `src/components/`, `src/constants/theme.ts` | Aditya | UI components and design tokens |
| `src/components/Mirror.tsx` | Kenil | Mirror slot. Takes the Mirror adapter props and renders a labeled placeholder until the real 3D viewer lands. |
| `shared/contract.ts` | all | Types and sample payloads for every row of the shared interface table. Import as `@shared/contract`. |
| `src/data/` | Aditya, then Kenil | One data-access seam (`api.ts`). Mock today; see docs/ui-handoff.md. |
| `convex/` | Shresth | Convex backend. Not created yet; excluded from the app's tsconfig. |
| `docs/` | all | Copies of the plan files |

## Rules

- No secrets in the repo. Keys stay in Convex or local `.env*.local` files, which are git-ignored.
- Change `shared/contract.ts` in its own small commit and tell the other owners.
- Sample data must be visibly labeled in the UI.

## Data layer (`src/data/`)

Everything screens need from the backend goes through `@/data`, typed by `shared/contract.ts`. Convex functions are called by string path (`refs.ts`), so the app compiles before `convex/` exists.

**One switch.** `EXPO_PUBLIC_DATA_MODE` in `.env.local` picks the backend. `fixture` (the default) runs an in-memory store seeded from the `SAMPLE_*` payloads: laundry, wash, wear and scan changes stick until the app reloads, so flows can be demoed end to end. `live` talks to `EXPO_PUBLIC_CONVEX_URL` and adds `closetCode` (`EXPO_PUBLIC_CLOSET_CODE`, required in live mode, put only in `.env.local`: it is the closet's only credential) to every call; `DataProvider` calls `profiles:join` on mount. Phones with the same code share one closet. While `IS_FIXTURE_MODE` is true, screens must show `FIXTURE_LABEL` ("Sample data").

```bash
cp .env.example .env.local   # then restart npx expo start; set EXPO_PUBLIC_DATA_MODE=live once convex/ is deployed
```

| Export | Shape | Notes |
|---|---|---|
| `useCloset(args?)` | `ClosetItem[] \| undefined` | Reactive `closet:list`; undefined while loading. Updates from any device in live mode. |
| `useScan(scanId)` | `ScanJob \| null \| undefined` | Reactive `scans:get`; skipped while `scanId` is empty. |
| `useStylistSuggest()` | `{ suggest(args), result, isLoading, error }` | `stylist:suggest` (action). Keeps the previous `result` while loading so the mirror stays stable, always sends the outfit on screen as `currentItemIds`, and applies returned `swaps` in place so only the changed slot moves. |
| `useTodaysLook(prompt?, lockedItemIds?)` | `{ outfit, items, garmentAssetKeys, lockedUnavailableItemIds, isLoading, error }` | Re-asks the stylist whenever an item's availability changes, keeping locked items. Home uses it to feed the Mirror. |
| `useConfirmWear()` | `{ confirmWear(args), isSaving, error, lastResult }` | `outfits:confirmWear`. Mints one `requestId` per tap; overlapping taps and retries after a failure reuse it. Disable the button while `isSaving`. |
| `setStatus(args)`, `markWashed(args?)` | `Promise` | `closet:setStatus`, `closet:markWashed` (omit args for bulk Laundry done). |
| `startScan(args)`, `confirmScan(args)`, `deleteScan(scanId)` | `Promise` | `scans:start`, `scans:confirm`, `privacy:deleteScan`. |
| `outfitToMirrorProps(avatar, items)` | `{ avatar, garments, garmentAssetKeys }` | Outfit items to Mirror props, socks and underwear skipped. `useTodaysLook().mirrorProps` returns it. |
| `pickClip(source)`, `scanClip(clip, onProgress?)` | `Promise` | Pick or record a video, extract 10 evenly spaced frames (`expo-video` `generateThumbnailsAsync`), upload each via `scans:generateUploadUrl`, then call `scans:start`. Falls back to uploading the whole clip (`scans:start` with `videoStorageId`, no frames) when extraction fails or yields under 3 frames. Watch the result with `useScan`. Native only. |

Function kinds assumed for Shresth: `stylist:suggest` is an action; `scans:get` and `closet:list` are queries; everything else is a mutation. `wearagain://scan-check` opens an integration screen that runs the clip-to-frames path on a device.

## iOS builds (EAS)

The app uses a development build (`expo-dev-client`) because `expo-video` thumbnails and the coming 3D renderer need native code. Bundle id: `com.wearagain.app`. Kenil runs, from the repo root:

```bash
npx eas-cli@latest login
npx eas-cli@latest init                                   # once: links the project and writes extra.eas.projectId to app.json
npx eas-cli@latest device:create                          # once per physical iPhone (ad hoc provisioning)
npx eas-cli@latest build --profile development --platform ios            # dev client for physical iPhones
npx eas-cli@latest build --profile development-simulator --platform ios  # dev client for the iOS Simulator
npx expo start --dev-client                               # then open the installed app and pick this server
npx eas-cli@latest build --profile preview --platform ios                # standalone internal build for the demo
```

EAS builds do not read `.env.local`. Add `EXPO_PUBLIC_DATA_MODE`, `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CLOSET_CODE` to the EAS `development` and `preview` environments (`npx eas-cli@latest env:create`) or the build falls back to fixture mode.
