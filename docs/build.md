# Dripp — Master build plan

## Product

Record a video of your clothes, confirm what the app found, and get dressed using what you own. The first screen is a realistic interactive mirror. Tell the stylist where you're going, see a complete look on your avatar, and change one piece without rebuilding the outfit. Confirm what you wore so tomorrow's suggestion reflects what's available.

**Demo promise:** One real closet clip becomes inventory. One outfit appears on a realistic, rotatable avatar. One live constraint changes an actual garment on the avatar. Confirming the result logs one wear.

## Owners

| Owner | Deliverable | Files to own |
|---|---|---|
| [Shresth](shresth.md) | Convex backend, **video-to-inventory garment detection**, styling agent, wear and laundry state | `convex/`, server-side vision integration, extraction worker if used |
| [Kenil](kenil.md) | End-to-end integration, video handoff wiring, **avatar and garment-rendering integration**, device builds, Revyl and submission | App data adapters, renderer and assets, build configuration |
| [Aditya](aditya.md) | **UI and frontend** from onboarding through Home, Feed, Closet and Shop | Screens, navigation, design tokens and UI components |

Use Capy for implementation with one task and branch per owner. Merge shared interfaces first. Kenil wires screens to real services and owns the integrated demo. Start implementation after the official start. Ship a working iOS or Android device build and submit by 6 p.m.

## User flow and navigation

1. **Onboard.** Optional full-body photo, height, and illustrated, editable body-proportion choices. Offer a preset to enter immediately. Measurements are user-entered or approximate. Keep photos private.
2. **Scan.** Record or upload a short guided closet video. Show a review grid with garment crops, counts and editable tags. Confirm detected items before adding them. Socks and underwear can be tracked privately for laundry.
3. **Style.** Home opens on the avatar and today's look. Type a plan or use a mic if feasible. The stylist checks occasion, comfort, availability, locked garments and optional weather. Suggest two looks if both are valid. Change one piece in place.
4. **Wear.** Confirm the exact outfit. Update wear counts once. Worn pieces can still be available. Laundry and retired pieces are excluded. A wash reminder invites the user to decide. A bulk **Laundry done** action resets the wash cycle.
5. **Return.** The next suggestion reflects actual wears, preferences and availability. **One Piece, Three Ways** progresses when the user confirms three distinct outfits featuring the same garment. A private outfit photo can extend a streak. Partner points and store redemption require real offers in a later phase.

| Tab | Purpose |
|---|---|
| Home | Large interactive mirror, Today's Look, styling input, one-tap edits, wear confirmation |
| Feed | Friends and creators, likes and follows, **Make it with my closet** |
| Closet | Scan/import, detected-item review, availability, laundry and wear history |
| Shop | **Why this fits your closet**, preview compatible looks, partner catalog and checkout when integrated |

Put streaks and rewards in the profile. Mark verified orders **On the way**, add them to styling availability on delivery or confirmation. Use demo catalog labels until actual integrations exist.

## Rendering and detection quality bar

**Target:** High-quality realistic likeness and clothes in a 3D view the user can rotate and zoom. Real garment color, material, silhouette and recognizable details take priority over gimmicks. A photo-based avatar provider and a clothing rendering pipeline solve different jobs.

- **Live 3D:** Use an avatar preset or photo-derived mesh with editable proportions. Use compatible, textured garment assets with a shared rig or a pre-fitted outfit mesh per supported combination. Test garment layering, zoom and angles on the physical demo phone. From a scan, link an item to the right supported asset only when the match is defensible. Keep its actual crop visible.
- **Photoreal stills, optional:** A virtual try-on image can show a resemblance to the user wearing a photographed item. Label it **Photo preview**. It supplies a still image, while the live mirror uses 3D assets. Exact fit and arbitrary photo-to-3D garment reconstruction are separate engineering work.
- **Video detection:** Preserve the video input experience. Sample clear frames across the clip, identify distinct visible pieces, attach evidence crops, and offer corrections. Similar or hidden pieces need review. Use a short, guided clip for stage reliability.
- **Honest fallback:** If custom avatar generation is slow or unavailable, keep a prepared realistic avatar with compatible garments and label it **Demo avatar**. If the 3D renderer fails device testing, show prepared front/side/back views or one Photo preview with truthful labels.

Reference docs: [OpenAI GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) for image analysis and structured output, [Avaturn](https://docs.avaturn.me/) for customizable 3D avatars, [Virtual Try-On](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/vto/virtual-try-on-001) for try-on images, [Convex file storage](https://docs.convex.dev/file-storage/overview) for media uploads.

## Shared interface

Agree these shapes at kickoff. Backend derives ownership from the session. Use a shared dev deployment across the demo devices.

| Interface | Minimum contract |
|---|---|
| `scans:start`, `scans:get`, `scans:confirm` | Job ID, status `queued / processing / review / failed / confirmed`, candidate IDs, category, color, image/crop reference, uncertainty, edits and accepted IDs |
| `closet:list`, `closet:setStatus`, `closet:markWashed` | Stable item IDs, category, color, media reference, optional `renderAssetKey`, availability, wear count |
| `stylist:suggest` | Occasion or prompt, locked item IDs, optional weather, ranked outfits with item IDs and short reason |
| `outfits:confirmWear` | Item IDs and stable request ID, returns saved wear and updated challenge progress |
| Mirror adapter | Avatar reference and garment asset keys in, ready/error state and viewer controls out |

## Build order and scope

1. **First hour.** Capy tasks started, Expo opens on a real phone, Convex connected, one avatar asset renders, and the vision provider analyzes real frames. Settle asset formats and scan handoff at this checkpoint.
2. **By lunch.** Real video returns editable candidates, the prepared avatar swaps a garment on-device, and real closet results can drive one outfit.
3. **Next.** Connect a live swap, confirm a wear and persist it, then run Revyl. Add voice or a small Feed/Shop preview once the main flow works.
4. **Final hour.** Freeze the demo path early enough to test on physical phones. Capture a backup recording and submit before the deadline.

**Required for demo:** One genuine scan, reviewed inventory, a realistic rotatable avatar with supported assets, one occasion-based outfit, a visible isolated swap, and saved wear/laundry state. **Stretch:** One reusable Feed look, one sample Shop recommendation, or voice. Full social graph, marketplace checkout, partner redemption and arbitrary 3D cloth reconstruction belong in the product roadmap.

## 60-second stage flow

Record or pick an actual closet clip. Review the detected items. Ask for a dinner outfit. Rotate the avatar. Mark the shoes in laundry from a second device signed into the same demo closet. Watch just the shoes change while the locked jacket stays. Confirm **Wearing this** and show the saved wear or challenge progress. Show the real jacket and show Revyl evidence for the tested flow.
