# Mirror assets

Static GLBs for the 3D mirror (src/components/Mirror.tsx). Licenses: LICENSES.md.

## How they fit together

- One avatar (`avatar-a.glb`) and one GLB per garment key. Every file was baked
  from the same MakeHuman body in the same relaxed pose, in meters, Y up, so a
  garment is placed by adding its scene as-is. No skinning is needed at runtime.
- Each mesh carries a `_HIDE` vertex attribute: a bit field of the garments that
  cover that vertex (bit = `MirrorAsset.bit` in src/mirror/assets.ts). The viewer
  drops triangles whose three vertices are all covered by worn garments, so skin
  and inner layers do not poke through outer layers. Layer order: body, shoes,
  top, bottom (tucked), outerwear.
- Total size is about 5 MB (textures 1024 px JPEG inside the GLBs).

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

   then copy the GLBs here, add the key to shared/renderAssets.ts and its file and
   bit (from out/meta.json) to src/mirror/assets.ts, and record the license in LICENSES.md.

The viewer page itself lives in mirror-viewer/ and is bundled with
`npm run build:mirror-viewer` into src/mirror/viewerHtml.generated.ts.
