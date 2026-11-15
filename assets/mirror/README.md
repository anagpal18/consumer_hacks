# Mirror assets

Static GLBs for the 3D mirror (src/components/Mirror.tsx). Licenses: LICENSES.md.

## How they fit together

- One avatar (`avatar-a.glb`) and one GLB per garment key, all baked from MakeHuman
  bodies in the same relaxed pose, in meters, Y up, so a garment is placed by adding
  its scene as-is. No skinning at runtime.
- Body shape is morph targets on every mesh (body, hair, eyes and each garment):
  `preset:<sex>-<preset>` for the five presets other than the base `male-average`,
  and `<proportion>:+` / `<proportion>:-` for head, chest, arms, waist, hips and
  shoulders. Each was a full MakeHuman rebuild with the garments refitted, so
  clothes follow the body. The viewer sets weights from `AvatarRef.body`; height is
  a uniform scale. Female bodies swap to the female skin texture (carried on a hidden
  `skin_female` swatch mesh) and the female hair mesh.
- Each mesh carries a hide mask in COLOR_0.r (bits / 255): the garments covering
  that vertex (bit = `MirrorAsset.bit` in src/mirror/assets.ts). The viewer drops
  triangles whose three vertices are all covered by worn garments. Layer order:
  body, shoes, top, bottom (tucked), outerwear.
- Files are meshopt-compressed with gltfpack; the viewer decodes them with three's
  MeshoptDecoder. Total about 6 MB.

## Key format (for convex/)

`<namespace>/<garment>-<color>`, lowercase kebab-case, like `demo/sneakers-white`.
The list of keys with slot, category, subtypes and color family is
shared/renderAssets.ts. Set `ClosetItem.renderAssetKey` only when an item
defensibly matches an entry; otherwise leave it unset and pass the item through
`MirrorProps.garments` with its slot and colorHex to get the labeled tint fallback.

## Adding a garment

1. Find a MakeHuman clothes asset (.mhclo + .obj + .mhmat) whose header license is CC0 or CC BY.
2. Add it to `GARMENTS` in pipeline/build_avatar.py with a new key, slot and rank. Bits are assigned in list order, so append; do not reorder.
3. Rebuild (Blender 5.2 with the MPFB 2 extension installed):

   ```sh
   MH_ASSETS=/path/to/makehuman-assets/base \
   MH_COMMUNITY=/path/to/glamcam-makehuman-clothing-assets/finalized_clothes \
   GLB_OUT=$PWD/assets/mirror/out \
   blender -b --python assets/mirror/pipeline/build_avatar.py
   ```

   then pack each GLB (`npx gltfpack -i in.glb -o out.glb -cc -kn -km -ke -vp 14`), copy them here, add the key to shared/renderAssets.ts and its file and
   bit (from out/meta.json) to src/mirror/assets.ts, and record the license in LICENSES.md.

The viewer page itself lives in mirror-viewer/ and is bundled with
`npm run build:mirror-viewer` into src/mirror/viewerHtml.generated.ts.
