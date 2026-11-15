# Kenil — Integration, realistic mirror and mobile delivery

**Your main deliverable:** Make Shresth's backend and Aditya's screens work together on a real phone. Own the avatar and garment-rendering integration, device builds and Revyl evidence. Shresth owns garment detection from the video.

## 1. Establish the integration path

- Open Expo on the actual demo phone early. Pick one platform for the first working build. Check the renderer and media dependencies on that route. If they require native modules outside Expo Go, start a device build early.
- Wire the frontend to the shared Convex deployment and set up demo sessions for both phones using the same closet. Share typed data adapters and a small fixture for UI work. Label fixtures clearly and exercise the real data path before judging.
- Agree the clip-to-frame boundary with Shresth. If the phone does extraction, wire that library and hand him timestamped frames. If Shresth's worker does extraction, wire the original video upload and status subscription. Aditya owns the capture and review screens.
- Connect occasion input, suggestions, statuses and wear confirmation. Recompute one slot after **In laundry** changes while keeping valid locked pieces. Keep secrets server-side and cache the selected outfit during loading so the mirror stays stable.

## 2. Get the realistic mirror working on-device

- Prove an orbiting, pinch-to-zoom 3D viewer with a realistic avatar in the first hour. Choose a tested GLB-compatible viewer path. Use a realistic preconfigured model immediately, then integrate a photo-based avatar if you have provider access and its outfit assets are compatible.
- Pick one compatible avatar rig and two complete supported outfits. Prioritize recognizable garment shape, texture and color. Test a jacket, pants and two pairs of shoes with a controlled background and consistent lighting. Check front, side and rear views for clipping or floating garments.
- Agree a stable `renderAssetKey` mapping with Shresth. Only swap the mesh for the affected slot. If separate meshes can't be made to fit quickly, use two pre-fitted outfit variants that differ by the one garment. If a scanned item has no suitable model, show its photo and label the approximation.
- If time allows, wire a photo try-on result as a separate **Photo preview**. Keep the rotating 3D viewer independent of the still image. If the renderer blocks the device release, use labeled front/side/back previews for the fallback and keep the inventory and styling flows live.

## 3. Verify, rehearse and submit

- Run a Revyl mobile build early. Test **upload or select clip → review detected pieces → outfit → laundry exclusion → saved wear** as far as the environment supports. If the simulator can't use the live camera, give it a real captured fixture and test live capture separately on the physical phone.
- Test rotation and pinch on the device, same-closet sync on two phones, poor connection and app reopening. Verify the wrong closet can't see private media and a failed render gives a visible recoverable state.
- Freeze a known-good build, stage a spare clip, and capture a backup recording. Keep proof of Capy changes, Convex state and Revyl results handy for submission.
- **Done when:** A real mobile build can display Shresth's confirmed inventory, show a realistic rotating avatar, replace one garment when its state changes, and persist a wear. A passing Revyl run covers the main observable behavior.
