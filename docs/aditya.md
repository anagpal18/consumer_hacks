# Aditya — Mobile UI and frontend

**Your main deliverable:** Make Dripp feel like an intuitive dressing mirror. Own the app screens, navigation and component design. Kenil plugs in the live data and rendering adapter. Shresth owns Convex and garment detection from video.

## Visual direction

Build a warm editorial dressing room with neutral surfaces and enough contrast to show dark and light clothing. Home opens on the avatar, large and centered. Keep instructions short and put the main actions within thumb reach. Reserve motion for understandable changes such as one garment being replaced or a scan card entering the closet.

## Build in this order

| Priority | Screen | Interaction |
|---|---|---|
| P0 | **Home mirror** | Avatar viewport with rotate/zoom gesture space. Today's Look and one reason it fits. **Tell me your plans**, item chips with lock/swipe, **In laundry**, and **Wearing this**. Add the mic beside the input if available. |
| P0 | **Scan and review** | Record/select a video. Prompt to show one item at a time. Progress screen, editable detected cards with actual garment crops, uncertain matches, merge/keep/reject, and **Add to closet**. |
| P0 | **Closet** | Grid and clothing filters, availability chips, wash status and wear count. Support marking one piece in laundry and a clear path back after washing. |
| P0 | **Avatar onboarding** | Optional full-body photo, height and simple illustrated proportion options. Offer preset and adjustment controls. Keep progress moving while an avatar is prepared. |
| P1 | **Feed** | Sample outfit cards and **Make it with my closet**. Include familiar follow/like controls when wired. A remake sends the user back to Home with a styling request. |
| P1 | **Shop** | One sample recommendation with which real owned pieces it matches. Tap to preview outfits. Label sample or partner status clearly. |
| P1 | **Profile and challenge** | **One Piece, Three Ways** progress, optional private outfit photo and streak. Points and partner offers can be previewed as sample states. |

## Interaction details

- **Four bottom tabs:** Home, Feed, Closet, Shop. Open the profile from the top corner. Keep photo verification private until someone chooses to share.
- **One clear next step per screen.** After scan, review. After review, suggest an outfit. After suggestion, change a piece or confirm wearing. Put the camera after confirmation.
- On Home, place asset-loading and retry states in the viewer while leaving the available garment controls usable. Show the actual garment thumbnail for an approximate render. Provide a tap alternative for lock and swap gestures.
- On scan review, show what changed after a correction and keep drafts if the user returns. Confirm only selected candidates. Distinguish **Worn** from **In laundry** visually.
- While waiting for integration, build against the sample payloads in the [shared contract](build.md#shared-interface). Give Kenil component inputs, callback names and screen routes. Keep mock data visibly labeled in any build that still uses it.

## Demo acceptance

On a physical phone a new user can find **Scan**, confirm detected pieces, return Home, enter an occasion, lock one piece, change another and confirm **Wearing this** without explanation. The mirror occupies most of the screen. When shoes change, show what changed while leaving the jacket recognizably in place. The next screen or toast confirms that the wear was saved.
