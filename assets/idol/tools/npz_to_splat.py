"""Convert export_splat_cpu.py output (.npz) to the antimatter15 .splat layout.

32 bytes per Gaussian: xyz f32, scale f32 (linear sigma), RGBA u8, quaternion u8 (w,x,y,z)*128+128.
IDOL's canonical SMPL-X space is +Y up / +Z forward; it is rotated 180 deg about X
(y->-y, z->-z, a proper rotation) so it matches the viewer's COLMAP-style -Y up convention.
Gaussians are sorted largest-first (scale * opacity) like antimatter15's convert.py.
"""
import sys
import numpy as np
from scipy.spatial.transform import Rotation

src, dst = sys.argv[1], sys.argv[2]
d = np.load(src)
F = np.diag([1.0, -1.0, -1.0]).astype(np.float32)
xyz = d['xyz'] @ F.T
R = F[None] @ d['R'] @ F[None]
R[np.linalg.det(R) < 0, :, 2] *= -1
q = Rotation.from_matrix(R.astype(np.float64)).as_quat()[:, [3, 0, 1, 2]]
q /= np.linalg.norm(q, axis=1, keepdims=True)
scale = d['scale']
rgba = np.concatenate([d['rgb'], d['opacity'][:, None]], 1)
order = np.argsort(-np.prod(scale, 1) * rgba[:, 3])
rec = np.zeros(len(xyz), dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('q', 'u1', 4)])
rec['p'] = xyz[order]
rec['s'] = scale[order]
rec['c'] = np.clip(rgba[order] * 255, 0, 255).round().astype(np.uint8)
rec['q'] = np.clip(q[order] * 128 + 128, 0, 255).astype(np.uint8)
rec.tofile(dst)
print('wrote', dst, len(rec), 'gaussians', rec.nbytes, 'bytes', 'bbox', xyz.min(0), xyz.max(0))
