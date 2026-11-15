# Test fixtures

## closet-demo.mp4

A 12.4 s, 720x1280 (portrait), 30 fps H.264 clip (736 KB) that imitates a guided closet scan: the camera holds about 1.1-1.5 s on each piece, then whip-pans (motion-blurred slide) to the next one. Use it as a stand-in for a phone recording, for example as the Revyl simulator video or to exercise `video:extractFrames` and `scans:start` with a `videoStorageId`.

| Hold (s) | Piece | Why it is there |
|---|---|---|
| 0.0-1.5 | Red t-shirt | top |
| 1.9-3.0 | Blue jeans | bottom |
| 3.4-4.5 | Light denim jacket | outerwear |
| 4.9-6.0 | White sneakers | shoes |
| 6.4-7.5 | Red split-toe socks | socks (private category) |
| 7.9-9.0 | Black t-shirt on a hanger | first of two similar dark shirts |
| 9.4-10.5 | Black t-shirt with a print | second similar dark shirt |
| 10.9-12.4 | Red t-shirt again, closer and tilted | repeated view; should merge with the first card |

Expected inventory: 7 distinct pieces. In a local end-to-end run (server-side extraction plus GPT-5 mini detection) it produced exactly these 7 candidates, with the repeated red t-shirt folded into one card.

The clip was built from the photos below with Pillow and ffmpeg (`xfade=slideleft` plus `tmix` for the motion blur between pieces). It is an adaptation of these works; the share-alike terms of each source apply to it.

| Piece | Source | Author | License |
|---|---|---|---|
| Red t-shirt | [File:Red-t-shirt-.jpg](https://commons.wikimedia.org/wiki/File:Red-t-shirt-.jpg) | 66saeedz | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| Jeans | [File:Jeans for men.jpg](https://commons.wikimedia.org/wiki/File:Jeans_for_men.jpg) | Honeyhuyue | Public domain |
| Denim jacket | [File:Jean jacket.jpg](https://commons.wikimedia.org/wiki/File:Jean_jacket.jpg) | NikosLikomitros | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Sneakers | [File:Paar witte sneakers, merk G-Unit, maat 40, objectnr 87415-7.A-B.JPG](https://commons.wikimedia.org/wiki/File:Paar_witte_sneakers,_merk_G-Unit,_maat_40,_objectnr_87415-7.A-B.JPG) | as credited on the source page | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| Socks | [File:BLW Pair of socks.jpg](https://commons.wikimedia.org/wiki/File:BLW_Pair_of_socks.jpg) | David Jackson | [CC BY-SA 2.0 UK](https://creativecommons.org/licenses/by-sa/2.0/uk/deed.en) |
| Black t-shirt (hanger) | [File:Ironed black T-shirt (001).JPG](https://commons.wikimedia.org/wiki/File:Ironed_black_T-shirt_(001).JPG) | Juan de Vojníkov | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| Black t-shirt (print) | [File:Wiki Loves Bangla T-Shirt Black.jpg](https://commons.wikimedia.org/wiki/File:Wiki_Loves_Bangla_T-Shirt_Black.jpg) | Moheen Reeyad | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |

## too-long.mp4

A 61 s, 64x64 flat grey clip (3 KB) generated with ffmpeg's `lavfi` color source. `convex/video.test.ts` uses it to check the 60 s limit.
