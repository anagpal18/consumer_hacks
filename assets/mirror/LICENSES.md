# Mirror assets: sources and licenses

All meshes were fitted to MakeHuman bodies (hm08 base mesh, default rig) with
MPFB 2 in Blender, posed once, and baked into static GLBs in that pose; every body
preset and proportion extreme is a morph target on the body and on each garment,
so garments keep fitting. Packed with gltfpack (MIT). See README.md.

| File | Content | Author | License | Source |
| --- | --- | --- | --- | --- |
| avatar-a.glb | Body (MakeHuman hm08 base mesh) with 6 body presets and 12 proportion extremes as morph targets, skins `young_caucasian_male` and `young_caucasian_female`, hair `short02` (male) and `ponytail01` (female), eyebrows `eyebrow001`, eyelashes `eyelashes01`, eye texture `brownlight` | MakeHuman team (Data Collection AB, Joel Palmius, Jonas Hauquier) | CC0 1.0 | MakeHuman system assets, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html ; license statement https://static.makehumancommunity.org/about/license.html ; files taken from the mirror of the system asset repo at https://github.com/dmaugis/makehuman-py3-assets |
| jacket-denim.glb | "Denim Jacket" | punkduck | CC BY 3.0 (attribution required) | MakeHuman community asset repository (2017-10-01); mhclo header `author punkduck / license CC BY 3.0`; files from https://github.com/k3yg4n/glamcam-makehuman-clothing-assets (finalized_clothes/Denim_Jacket) |
| shirt-white.glb | Shirt part of `male_casualsuit01` (jeans part removed), texture re-colored to white #F1EEE8 | MakeHuman team | CC0 1.0 | MakeHuman system assets (as above) |
| tee-black.glb | "T-shirt Basic Tucked" (`toigo_basic_tucked_t-shirt`), texture re-colored to #1E1E1E | Margaret Toigo (MRT) | CC0 1.0 | MakeHuman community asset pack shirts01, https://static.makehumancommunity.org/assets/assetpacks/shirts01.html ; files from the glamcam repo above (finalized_clothes/T-shirt_Basic_Tucked) |
| trousers-charcoal.glb | "M Trousers 02", texture re-colored to charcoal #3B3B40 | Mindfront (Sweden) | CC BY 4.0 (attribution required) | http://www.makehumancommunity.org/clothes/m_trousers_02.html ; files from the glamcam repo above (finalized_clothes/M_Trousers_02) |
| sneakers-white.glb | `shoes05` (white sneakers) | MakeHuman team | CC0 1.0 | MakeHuman system assets (as above) |
| boots-brown.glb | `shoes01` (brown leather lace-up shoes). Approximation: no CC0/CC-BY brown boot mesh was reachable, so the app labels it approximate | MakeHuman team | CC0 1.0 | MakeHuman system assets (as above) |

## kenil/ (Kenil's own avatar)

Kenil's personal likeness, made with Avaturn (avaturn.me) and shared by him for this
app only. Not open-licensed: do not reuse, publish or copy these files outside this repo.

| File | Content |
| --- | --- |
| kenil/avatar.glb | Avaturn body and hair (`avaturn_body`, `avaturn_hair_0`), arms posed down from the T-pose to the demo body's arm angle, baked static; hair texture darkened (Avaturn ships it grey for tinting) |
| kenil/sneakers-blue.glb | Avaturn's `avaturn_shoes_0`, same pose |
| kenil/sneakers-white.glb, kenil/boots-brown.glb | The demo `shoes05` and `shoes01` meshes above (CC0), refitted to his feet |

three.js (MIT, https://github.com/mrdoob/three.js) is bundled into
src/mirror/viewerHtml.generated.ts by mirror-viewer/build.js.

## Attribution text for the app's credits

- "Denim Jacket" by punkduck, CC BY 3.0, via the MakeHuman community asset repository.
- "M Trousers 02" by Mindfront, CC BY 4.0, via the MakeHuman community asset repository. Re-colored.
