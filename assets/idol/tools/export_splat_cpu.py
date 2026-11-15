"""CPU-only IDOL inference that exports the canonical-space Gaussians.

Runs the released IDOL checkpoint (Sapiens-1B encoder -> UV-alignment transformer ->
UV Gaussian decoder) exactly as run_demo.py does up to model.decoder._sample_feature,
then writes the Gaussians in IDOL's canonical SMPL-X space instead of rasterising a
video. CUDA-only modules that are not on that path (pytorch3d, simple_knn,
diff_gaussian_rasterization, the SMPL-X LBS deformer) are stubbed; distCUDA2 is
replaced by an exact scipy KD-tree equivalent (mean squared distance to 3 NN).
"""
import sys, types, json, time, argparse
import numpy as np
import torch
import resource
def mem(tag):
    print(tag, 'peak RSS GB', round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 2), flush=True)

def stub(name, **attrs):
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m

stub('pytorch3d'); stub('pytorch3d.ops'); sys.modules['pytorch3d'].ops = sys.modules['pytorch3d.ops']
stub('pytorch3d.transforms', quaternion_to_matrix=None, matrix_to_quaternion=None, axis_angle_to_matrix=None, matrix_to_axis_angle=None)
stub('simple_knn'); stub('simple_knn._C', distCUDA2=None)
stub('diff_gaussian_rasterization', GaussianRasterizationSettings=None, GaussianRasterizer=None)
class _NoDeformer(torch.nn.Module):
    def __init__(self, *a, **k):
        super().__init__()
stub('lib.models.deformers', SMPLXDeformer_gender=_NoDeformer)

from omegaconf import OmegaConf
from lib.utils.train_util import instantiate_from_config
from lib.models.renderers.gau_renderer import batch_rodrigues
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument('--image', default='work_dirs/demo_data/4.jpg')
ap.add_argument('--out', default='out/idol_4')
args = ap.parse_args()

cfg = OmegaConf.load('configs/idol_v0.yaml').model.params
t0 = time.time()
neck = instantiate_from_config(cfg.neck).eval()
decoder = instantiate_from_config(cfg.decoder).eval()
sd = torch.load('work_dirs/ckpt/idol_neck_decoder.pt', map_location='cpu', mmap=True)
for mod, prefix in ((neck, 'neck.'), (decoder, 'decoder.')):
    sub = {k[len(prefix):]: v for k, v in sd.items() if k.startswith(prefix)}
    missing, unexpected = mod.load_state_dict(sub, strict=False)
    print(prefix, 'loaded', len(sub), 'missing', missing, 'unexpected', unexpected[:5])
encoder = instantiate_from_config(cfg.encoder).eval()
enc_sd = torch.load('work_dirs/ckpt/idol_encoder_bf16.pt', map_location='cpu', mmap=True)
missing, unexpected = encoder.load_state_dict(enc_sd, strict=False)
print('encoder. loaded', len(enc_sd), 'missing', len(missing), 'unexpected', len(unexpected))
encoder.model = encoder.model.float()
del sd, enc_sd, sub
import gc; gc.collect()
print('models ready', round(time.time() - t0, 1), 's'); mem('models')
import timm.layers
print('timm fused attn', timm.layers.use_fused_attn(), flush=True)

import os
import ast, cv2
from pathlib import Path
from PIL import Image
from torchvision.transforms import ToTensor
from rembg import remove
_src = open('lib/utils/infer_util.py').read()
_fn = next(n for n in ast.parse(_src).body if isinstance(n, ast.FunctionDef) and n.name == 'load_image')
exec(ast.get_source_segment(_src, _fn))
os.makedirs(os.path.dirname(args.out), exist_ok=True)
image = load_image(args.image, os.path.dirname(args.out)).unsqueeze(0)
import torchvision
torchvision.utils.save_image(image[0], args.out + '_ref.jpg')
print('input tensor', tuple(image.shape))

with torch.no_grad():
    t1 = time.time()
    feats = encoder(image, use_my_proces=True, output_hidden_states=True)
    print('encoder', tuple(feats.shape), round(time.time() - t1, 1), 's')
    del encoder; gc.collect(); mem('after encoder')
    n_axis = cfg.code_reshape[-1] // cfg.patch_size
    ids_restore = torch.arange(0, n_axis ** 2).unsqueeze(0)
    uv_code = neck(feats, ids_restore); mem('neck'); del feats
    b, _, dims = uv_code.shape
    fmap = uv_code.reshape(b, n_axis, n_axis, dims).permute(0, 3, 1, 2)
    print('fmap', tuple(fmap.shape), flush=True)
    code = torch.tanh(decoder.upsample_conv(fmap)); mem('upsample')
    print('uv code', tuple(code.shape), round(time.time() - t1, 1), 's')
    sigma, rgbs, radius, rot, offset = decoder._sample_feature(decoder._decode_feature(code))
    xyz = (decoder.init_pcd + offset)[0]
    R = torch.bmm(decoder.init_rot.float(), batch_rodrigues(rot.reshape(-1, 3)))
    sigma, rgbs, radius = sigma[0], rgbs[0], radius[0]
    if decoder.fix_sigma:
        sigma = torch.ones_like(sigma)

xyz_np = xyz.numpy().astype(np.float32)
d, _ = cKDTree(xyz_np).query(xyz_np, k=4)
dist2 = np.clip((d[:, 1:] ** 2).mean(1), 1e-7, None)
scale = (radius.numpy() + 1) * np.sqrt(dist2)[:, None]
Rn = R.numpy()
rgb = np.clip(rgbs.numpy(), 0, 1)
op = np.clip(sigma.numpy()[:, 0], 0, 1)
np.savez_compressed(args.out + '.npz', xyz=xyz_np, scale=scale.astype(np.float32), R=Rn.astype(np.float32), rgb=rgb.astype(np.float32), opacity=op.astype(np.float32), offset=offset[0].numpy())
print('gaussians', xyz_np.shape[0], 'bbox', xyz_np.min(0), xyz_np.max(0), 'scale med', np.median(scale), 'total', round(time.time() - t0, 1), 's')
