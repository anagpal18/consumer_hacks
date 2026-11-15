# Backend handoff (Convex)

Owner: Shresth. Deployment: shared **dev** deployment `little-shrimp-172`.

## Connect the app

1. `cp .env.example .env.local`. It sets `EXPO_PUBLIC_CONVEX_URL=https://little-shrimp-172.convex.cloud`. Replace the `EXPO_PUBLIC_CLOSET_CODE` placeholder with the real closet code, which is long and random and shared out of band. It never goes in the repo.
2. Wrap the root layout in `src/app/_layout.tsx`:
   ```tsx
   import { ConvexClientProvider } from '@/lib/convex';
   // ...
   return <ConvexClientProvider>{/* existing StatusBar + Stack */}</ConvexClientProvider>;
   ```
3. In screens: `import { api, CLOSET_CODE } from '@/lib/convex'`, then `useQuery(api.closet.list, { closetCode: CLOSET_CODE })`, `useMutation(...)`, `useAction(api.stylist.suggest)`. Convex queries are live, so a laundry change on phone B re-renders phone A without polling.

`src/lib/convex.tsx` also exports `uploadFile(uri, contentType)`, which returns a storage id.

## Session and ownership (demo identity)

There is no login. Every function takes `closetCode: string` (4 to 64 characters from `[A-Za-z0-9_-]`), which the app reads from `EXPO_PUBLIC_CLOSET_CODE`. The code acts as the closet's password, so keep it long and random. The server maps it to a `profiles` row and derives ownership from that row. Every scan, candidate, item, wear and uploaded file is checked against it. Two phones that use the same code share one closet. This is the only deviation from `shared/contract.ts`, which has no session argument: add `closetCode` to every call.

- `profiles:join({ closetCode })` creates the closet if needed. The provider calls it on mount.
- Storage ids are claimed by the first closet that uses them in `scans:start` or `closet:addItem`. Any other closet that uses them gets `FORBIDDEN`.
- Socks and underwear are `isPrivate: true`. They are never styled and never count toward the challenge.

## Upload and job contract

1. The client extracts about 8 to 12 frames (JPEG, PNG or WebP, at most 10 MB each, at most 16 frames).
2. For each frame, `scans:generateUploadUrl({})` returns a URL. `POST` the bytes to it with `Content-Type: image/jpeg`, and the response is `{ storageId }`. (`media:generateUploadUrl` is the same function under another name.)
3. `scans:start({ closetCode, frames: [{ frameId?, storageId, timestampMs }], videoStorageId? })` returns `{ scanId, status: "queued" }`. If you omit `frameId`, the server assigns `f1`, `f2` and so on in timestamp order.
   - **Server-side extraction:** you can instead upload the clip itself (mp4 or mov, at most 50 MB and 60 s) and call `scans:start({ closetCode, frames: [], videoStorageId })`. The backend picks about 10 sharp, still frames with ffmpeg (about 1 s of work) and then detects as usual. `progress.framesTotal` reads 0 until extraction finishes.
4. Subscribe with `useQuery(api.scans.get, { closetCode, scanId })`. Status moves from `queued` to `processing`, then to `review` or `failed`. In my measurements `processing` took 70 s for 11 frames (see below).
5. Review cards: `candidates[]` with `candidateId, category, subtype, color, colorHex, crop.url` (a crop of the real frame), `frameId, evidenceFrameIds, uncertain, uncertainReason, possibleDuplicateOf, similarTo[], suggestedName, isPrivate`.
6. `scans:confirm({ closetCode, scanId, acceptedCandidateIds, edits: [{ candidateId, category?, subtype?, color?, name?, isPrivate?, mergeInto? }] })` returns `{ scanId, status: "confirmed", itemIds, createdCount }`. The confirm runs in one transaction and is idempotent: a double tap or a retry returns the same `itemIds` and creates nothing new. A candidate with `mergeInto` creates no item of its own. You can call confirm again later on the same scan to add a candidate you skipped.
7. A piece the scan missed: `closet:addItem({ closetCode, category, color, subtype?, name?, photoStorageId? })`.

### Errors and recovery

User-facing errors are `ConvexError` with `data = { code, message }`. Show `message`. For failed scans, `scans:get` returns `error` (readable text), `errorCode` and `retryable`.

| code | meaning | recovery |
|---|---|---|
| `NO_ITEMS` | no clothing found | rescan, holding each piece in view |
| `TIMEOUT`, `MODEL_ERROR`, `MODEL_UNREACHABLE`, `INTERNAL` | vision service problem | `scans:retry({ closetCode, scanId })` |
| `BAD_FRAME` | a frame is unreadable or missing | upload the frames again and start a new scan |
| `BAD_VIDEO`, `VIDEO_TOO_LARGE`, `VIDEO_TOO_LONG` | the clip is not mp4/mov, is over 50 MB, or is over 60 s | record a shorter clip |
| `TOO_DARK` | the clip is too dark to read | rescan in better light, then retry |
| `BAD_MEDIA`, `TOO_MANY_FRAMES`, `NEEDS_FRAMES`, `BAD_FRAMES` | thrown by `scans:start` | fix the input |
| `NOT_FOUND`, `FORBIDDEN` | wrong closet or id | check `closetCode` |
| `NOT_READY` | confirm called before `review` | wait for review |
| `ITEM_UNAVAILABLE` | confirmWear included a laundry, retired or on_the_way item | swap the item |

`scans:retry` also works on a scan stuck in queued or processing for more than 5 minutes, and on a `review` scan (it detects again and replaces the candidates).

## Functions

| Function | Args (all also take `closetCode`) | Returns |
|---|---|---|
| `scans:generateUploadUrl` (mutation) | `{}` | upload URL |
| `scans:start` | `frames, videoStorageId?` | `{ scanId, status }` |
| `scans:get` (query) | `scanId` | `ScanJob` plus `errorCode, retryable, frames[{frameId,timestampMs,url}], elapsedMs, model, attempts` |
| `scans:list` (query) | | recent scans |
| `scans:retry` | `scanId` | `{ scanId, status: "queued", attempt }` |
| `scans:confirm` | `scanId, acceptedCandidateIds, edits?` | `{ scanId, status, itemIds, createdCount }` |
| `closet:list` (query) | `category?` | `ClosetItem[]` plus `isPrivate, washReminder` |
| `closet:get` (query) | `itemId` | `ClosetItem` |
| `closet:setStatus` | `itemId, availability` (`available, laundry, retired, on_the_way`) | `ClosetItem` |
| `closet:markWashed` | `itemIds?` (omit for the bulk **Laundry done** action) | `{ items }` |
| `closet:setRenderAssetKey` | `itemId, renderAssetKey: string \| null` | `ClosetItem` |
| `closet:updateItem` | `itemId, name?, category?, subtype?, color?, colorHex?, isPrivate?` | `ClosetItem` |
| `closet:addItem` / `closet:deleteItem` | see above / `itemId` | `ClosetItem` / `null` (also deletes the photo) |
| `stylist:suggest` (action) | `prompt, lockedItemIds, excludeItemIds?, currentItemIds?, weather?{tempC, condition}` | `{ outfits[{outfitId, rank, itemIds, reason, swaps?[{from, to\|null}]}], lockedUnavailableItemIds?, source: "model" \| "fallback" \| "rules", message? }` |
| `outfits:confirmWear` | `itemIds, requestId, outfitId?, occasion?, tzOffsetMinutes?` | `{ wear{wearId, itemIds, wornAt, requestId, outfitId}, challenge[{itemId, distinctOutfits, target: 3, completed}], washReminderItemIds, streakDays, duplicate }` |
| `outfits:streak` (query) | `tzOffsetMinutes?` | `{ streakDays }` |
| `outfits:challenge` / `outfits:recentWears` (queries) | | challenge progress / last 20 wears |
| `privacy:deleteScan` | `scanId` | `{ deleted: true, scanId, deletedCandidates, deletedFiles, keptItemPhotos }`: deletes the scan's frames, clip, unused crops and candidates, and keeps the photos of items already confirmed |
| `demo:seed` | | the 8 demo items (idempotent) |
| `demo:reset` | code must start with `demo` | deletes items, wears, outfits, scans, candidates and uploaded files |

**Stylist rules:** looks are built only from available, non-private items you own: top + bottom or a dress, plus shoes, with optional outerwear. Locked items stay in every look. You get two ranked looks whenever two valid looks exist. The model only ranks valid combinations, and every look it returns is checked against them, so it can't invent an ID. `source` is `model`, `fallback` (the model was needed but failed or timed out, so a deterministic look was returned) or `rules` (no model was needed: a single look, a swap, or the replace-or-unlock state). If a locked item is not available, you get `outfits: []`, `lockedUnavailableItemIds` and a `message`, and the UI should offer **Replace** or **Unlock**.

**Stage flow (single-slot swap):** keep the current look's ids on the client. `closet:list` is live, so when the shoes go to laundry from the second phone, call `suggest({ prompt, lockedItemIds: [jacket], currentItemIds: currentLook })` and show `outfits[0]`. Only the shoes change, and `swaps` says which piece replaced which, so the mirror can animate just that slot (about 1 s, with no model call). To change one piece on demand, add `excludeItemIds: [thatPiece]`.

**Wear:** `requestId` must be stable per tap (for example a UUID created when the button renders). Sending it twice returns `duplicate: true` and increments nothing. Worn items stay `available`; `wearsSinceWash` grows and `washReminder` turns true at the threshold for that category. `tzOffsetMinutes` is **minutes east of UTC**, so Pacific standard time is `-480`. That is the opposite sign of JavaScript's `getTimezoneOffset()`, so send `-new Date().getTimezoneOffset()`. `streakDays` counts consecutive local days with a confirmed wear. Socks and underwear don't make an outfit distinct for the challenge.

**Color and render assets:** `colorHex` is measured from the real crop's pixels (the dominant garment color, ignoring the background along the edges), never guessed by the model. At confirm time, `renderAssetKey` is set only when category, subtype and color family all match an entry in `convex/renderAssets.ts`, which holds the six `demo/*` keys; that table will be replaced by `shared/renderAssets.ts` from Kenil's side when it lands. Otherwise the key stays unset and the renderer should tint a base mesh with `colorHex` and show the crop.

## Demo closet

`demo:seed({ closetCode })` has already been run on `little-shrimp-172` for the shared demo closet (code shared out of band). These are its item IDs:

| demoKey | itemId | renderAssetKey |
|---|---|---|
| jacket_denim | j97ccb2e3tbree73a7wq64754n8j9gty | demo/jacket-denim |
| shirt_white | j97a4ab3ejfhyp8qxymj63spdh8j94bf | demo/shirt-white |
| tee_black | j976wkg6q3bnj7wnqeter0a57d8j93y6 | demo/tee-black |
| trousers_charcoal | j9774g76a5bbpa4f2j7m0469jd8j8nd7 | demo/trousers-charcoal |
| chinos_khaki | j974nga6dzcygxr6w4zjwr42zh8j8ztf | (none) |
| sneakers_white | j973aac5bf0pkn8rw2s1abr3ax8j9pq5 | demo/sneakers-white |
| boots_brown | j973m0g63gbjs4rg503vtmaqbs8j92z6 | demo/boots-brown |
| socks_grey | j97d3rq68e286vdb4ztrj334nx8j854h | (private, none) |

**renderAssetKey:** the keys reuse the `demo/*` placeholders from `shared/contract.ts`. Kenil owns the real asset list. Detection never sets a key, so unknown matches stay unset as the spec requires. After a scan, map a real item to a supported asset with `closet:setRenderAssetKey`. Items without a key should show their `media.url` crop.

## Sample responses

`docs/backend-samples.json` holds real responses captured from the deployment: `scanQueuedOrProcessing`, `scanReview` (real detection with uncertain and possible-duplicate cards), `scanFailed`, `scanConfirmed`, `closetList`, `suggest`, `suggestLockedUnavailable`, `suggestOneSlotRecompute` and `markWashedAll`.

## Backend dev

- `npm run convex:deploy` pushes to the deployment. It needs `CONVEX_DEPLOY_KEY` (a dev key), or run `npx convex dev` while logged in.
- `npm run test:convex` runs vitest with convex-test. `npm run typecheck:convex` typechecks the backend.
- Secrets live only in the Convex env: `OPENAI_API_KEY` is required. Optional, read at run time so they change without a redeploy: `DETECT_MODEL` (vision model), `DETECT_EFFORT` (default `low`), `DETECT_DETAIL` (default `high`), `OPENAI_STYLIST_MODEL` (stylist model, default `gpt-5-mini`). The root `convex.json` marks `@ffmpeg-installer/ffmpeg` as an external package for `convex/video.ts`; keep it.
