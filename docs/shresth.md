# Shresth — Convex backend and closet video detection

**Your main deliverable:** Turn a real closet video into confirmed inventory items. Own the detection pipeline and the data the stylist and renderer consume. Use [build.md](build.md) for shared endpoint names.

## P0 — Video to inventory

1. **Accept media.** Define the upload contract with Kenil. Accept a supported short closet clip, or the clear frames Kenil extracts from the user's uploaded clip. If a worker is available, let it extract frames after upload. Keep client and worker extraction behind the same job contract. Store uploads by owner and validate types and limits.
2. **Select frames.** Guide users to hold briefly on each piece. Start with roughly 8–12 clear frames for a short clip as a tuning point. Preserve timestamps and favor sharp, varied frames. Repeated views of the same piece should produce one review card. A new item appearing between frames may need a rescan.
3. **Detect using vision.** Start with GPT-5 mini and send sampled images with labeled frame IDs. Request structured candidates with category, subtype, color, frame ID, approximate crop, and a review flag. Use a validated schema. Crop from the actual frame and display the crop for review. Avoid inventing brand, fabric or items hidden behind others. Keep the API key server-side.
4. **Review duplicates.** Merge likely repeats across nearby frames. When two black shirts could be distinct items, present the evidence and let the user keep both or merge them. Keep basic colors/categories editable. Unknown garment asset matches stay unset.
5. **Commit only confirmed items.** Store stable candidate IDs and make confirmation transactional and safe to retry. Keep one item per accepted candidate even if the button is double-tapped. Return a readable status and support failure, retry and adding a missed item.
6. **Check with a real clip.** Test with tops, pants, a jacket, shoes, socks and underwear. Include two similar pieces and one repeat view. Record expected vs detected counts and elapsed time so the team knows exactly what works for the demo.

## P1 — Convex, stylist and wear state

- Define owner-scoped `scans`, candidate records, `items`, `profiles`, `outfits` and `wearLogs`. Use Convex file storage for source media and crops where appropriate. Keep raw body/closet media private and allow deletion. Keep underwear and socks private by default.
- Expose the scan, closet, stylist and wear interfaces in [build.md](build.md). Give Aditya and Kenil stable sample responses before the AI pipeline is ready. Provide owner checks on media, records and mutated item IDs.
- Filter out laundry, retired and unavailable pieces. Filter style candidates by valid slots and locked pieces, then use the model to rank or explain valid combinations. Accept only real owned item IDs returned by the model. Return a deterministic valid look if the model is unavailable. If a locked item has itself become unavailable, ask the user to replace or unlock it.
- Keep **worn** distinct from **in laundry**. A confirmed wear increments counts once via a request ID. Wash actions reset the since-wash counter. Add reminders and challenge progress after the main flow works.
- Document key names and the shared deployment connection for Kenil. Keep secrets out of source, fixtures and logs.

## Handoff and completion

- **To Kenil:** Upload/job contract, working shared deployment, demo item IDs and asset-key mappings, status errors and recovery instructions.
- **To Aditya:** Example responses for processing, uncertain candidates, review, failure, confirmed inventory and unavailable-item styling.
- **Done when:** A real clip yields editable visual candidates, duplicate confirmation creates no duplicate rows, an item marked in laundry is excluded, and confirming the same wear twice increments once.

References: [OpenAI GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) accepts images and structured outputs. Send frames from the closet video. [Convex file storage](https://docs.convex.dev/file-storage/overview).
