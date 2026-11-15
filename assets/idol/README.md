# IDOL avatar asset (dev route `/dev/idol`)

`idol_avatar.splat` is a **real IDOL output**, not a stand-in. It is the 3D Gaussian avatar that the released IDOL checkpoint predicts from `idol_input.jpg`, exported in IDOL's canonical SMPL-X space (T-pose).

| | |
|---|---|
| Model | IDOL: Instant Photorealistic 3D Human Creation from a Single Image (Zhuang et al., CVPR 2025), https://github.com/yiyuzhuang/IDOL |
| Weights | `model.ckpt` (8.8 GB) and `sapiens_1b_epoch_173_torchscript.pt2` (4.7 GB) from https://huggingface.co/yiyuzhuang/IDOL, plus `cache_sub2.zip` (SMPL-X-derived UV templates) |
| Input | `idol_input.jpg`: a **synthetic sample photo of a fictional person**, generated for this test (Nano Banana 2 via Capy image generation). Not a real user, not from HuGe100K or DeepFashion. Labeled as sample data. |
| Output | 200,800 Gaussians, 6.4 MB in the antimatter15 `.splat` layout (32 bytes each). Bounding box about 1.75 m tall. |

## How it was produced

No GPU was available on the cloud machine, so inference ran on CPU (4 cores, 16 GB) with `tools/export_splat_cpu.py`. That script runs the same path as `run_demo.py`: Sapiens-1B encoder (40 layers) → UV-alignment transformer (neck) → VitHead upsampler → UV Gaussian decoder → `_sample_feature`. Then, instead of rasterizing a video, it writes the canonical Gaussians:

- position = SMPL-X template point + predicted offset
- rotation = template rotation × predicted delta (Rodrigues)
- scale = (radius + 1) × sqrt(mean squared distance to the 3 nearest neighbours). This is IDOL's `distCUDA2` rule, recomputed with a scipy KD-tree.
- color = predicted RGB. Opacity = 1, because the config sets `fix_sigma: true`.

CUDA-only modules that are not on this path (pytorch3d, simple-knn, diff-gaussian-rasterization and the SMPL-X LBS deformer) are stubbed. Every IDOL weight tensor loaded with no missing keys. The encoder weights come from `model.ckpt`, not from the raw Sapiens TorchScript (they differ by up to 0.22).

Steps:
1. `rembg_input.py` cuts out the background (IDOL's `load_image` does the same).
2. `split_ckpt.py` and `split_enc.py` split the 8.8 GB checkpoint into neck/decoder and encoder parts, so the run fits in about 12.7 GB of RAM.
3. `export_splat_cpu.py` runs the model. On CPU it took 228 s: about 55 s for the encoder and 190 s up to the UV code.
4. `npz_to_splat.py` rotates 180° about X to fit the viewer's −Y-up convention, encodes the quaternions, sorts largest first and writes the `.splat` file.

On a CUDA GPU with 24 GB (the README's requirement), the same forward pass takes about a second.

## License

- **IDOL code:** the README badge says MIT. The repository has **no LICENSE file**, so the code license is asserted, not formally granted.
- **IDOL weights (Hugging Face):** no license is stated.
- **SMPL-X:** IDOL's body model and templates (the `cache_sub2` files are derived from SMPL-X) fall under the SMPL-X license, which is **non-commercial research only**. Commercial use needs a license from Meshcapade/MPI.
- **HuGe100K:** the training data is for non-commercial research. The DeepFashion-derived parts cannot be redistributed.
- **Sapiens-1B (Meta):** CC BY-NC 4.0, non-commercial.

So this asset is fine for a hackathon demo or research. **Shipping IDOL in a commercial product needs licenses** for SMPL-X and Sapiens, and the authors need to clarify the weights license.
