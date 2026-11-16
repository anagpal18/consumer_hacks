
"""Fits the demo garments (baked on the MakeHuman base body) to Kenil's Avaturn body.

Kenil's T-pose is posed down to the MakeHuman arm and leg angles, the MakeHuman body is
mapped onto his surface with a smoothed nearest-point displacement field, each garment
vertex takes the displacement of its closest MakeHuman surface point, and anything left
inside his body is pushed out. Hide masks go in COLOR_0.r as before.
Run: KENIL=<dir with model-body.glb, model-look.glb> MH_GLB=<unpacked demo GLBs> OUT=<dir> blender -b --python fit_kenil.py
"""
import bpy, os, math, json
import bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

K = os.environ['KENIL']; MH = os.environ['MH_GLB']; OUT = os.environ['OUT']
os.makedirs(OUT, exist_ok=True)
GARMENTS = [
    dict(key='demo/jacket-denim', file='jacket-denim', rank=4, bit=1, off=0.012),
    dict(key='demo/shirt-white', file='shirt-white', rank=2, bit=2, off=0.004),
    dict(key='demo/tee-black', file='tee-black', rank=2, bit=4, off=0.004),
    dict(key='demo/trousers-charcoal', file='trousers-charcoal', rank=3, bit=8, off=0.006),
    dict(key='demo/sneakers-white', file='sneakers-white', rank=1, bit=16, off=0.003),
    dict(key='demo/boots-brown', file='boots-brown', rank=1, bit=32, off=0.003),
]
AVATURN_SHOES = dict(key='avaturn/sneakers-grey', file='shoes-avaturn', rank=1, bit=64)

def V(obj):
    a = np.empty(len(obj.data.vertices) * 3); obj.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)
def setV(obj, a):
    obj.data.vertices.foreach_set('co', a.reshape(-1)); obj.data.update()

def imported(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def bake(obj, name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(obj.matrix_world)
    new = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(new)
    return new

def angles(pts):
    """Angle of the left arm below horizontal and the leg stance angle, from slice centroids."""
    def c(m): return pts[m].mean(0)
    a1 = c((pts[:, 0] > 0.22) & (np.abs(pts[:, 2] - 1.25) < 0.02))
    a2 = c((pts[:, 0] > 0.22) & (np.abs(pts[:, 2] - 1.00) < 0.02))
    l1 = c((pts[:, 0] > 0.02) & (pts[:, 2] > 0.65) & (pts[:, 2] < 0.70))
    l2 = c((pts[:, 0] > 0.02) & (pts[:, 2] > 0.25) & (pts[:, 2] < 0.30))
    return math.atan2(a1[2] - a2[2], a2[0] - a1[0]), math.atan2(l1[0] - l2[0], l1[2] - l2[2])

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. MakeHuman base body and garments, shape keys dropped (base preset only).
mh = {}
for name in ['avatar-a'] + [g['file'] for g in GARMENTS]:
    for o in imported(MH + '/' + name + '.glb'):
        if o.type != 'MESH': continue
        if o.data.shape_keys: o.shape_key_clear()
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        bpy.context.view_layer.update()
        o.data.transform(o.matrix_world); o.matrix_world = Matrix()
        mh[o.name if name == 'avatar-a' else name] = o
mbody = mh['body']
for n in list(mh):
    if n not in ['body'] + [g['file'] for g in GARMENTS]:
        bpy.data.objects.remove(mh.pop(n), do_unlink=True)
mbv = V(mbody)
mh_arm, mh_leg = angles(mbv)
print('MH angles', math.degrees(mh_arm), math.degrees(mh_leg), 'height', mbv[:, 2].max(), flush=True)

# 2. Kenil: body from model-body, hair and Avaturn shoes from model-look, posed to the MH angles.
def pose(arm, da, dl):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    for bone, ang in (('LeftArm', da), ('RightArm', -da), ('LeftUpLeg', -dl), ('RightUpLeg', dl)):
        pb = arm.pose.bones[bone]
        M = pb.matrix.copy(); h = M.translation.copy()
        pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, 'Y') @ Matrix.Translation(-h) @ M
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')

kb = imported(K + '/model-body.glb')
kl = imported(K + '/model-look.glb')
kbody = next(o for o in kb if o.name.startswith('avaturn_body'))
arms = [next(o for o in objs if o.type == 'ARMATURE') for objs in (kb, kl)]
da, dl = math.radians(80), 0.0  # legs stay as modeled: his stance is close and posing them crosses the thighs
for it in range(3):
    for a in arms: pose(a, da, dl)
    tmp = bake(kbody, 'tmp'); ka, kleg = angles(V(tmp)); bpy.data.objects.remove(tmp, do_unlink=True)
    print('K angles after pass', it, math.degrees(ka), math.degrees(kleg), flush=True)
    da, dl = mh_arm - ka, 0.0
k = {'body': bake(kbody, 'kenil_body')}
for o in kl:
    if o.name.startswith('avaturn_hair'): k['hair'] = bake(o, 'kenil_hair')
    if o.name.startswith('avaturn_shoes'): k['shoes'] = bake(o, 'shoes_avaturn')
    if o.name.startswith('avaturn_look'): k['look'] = bake(o, 'look_avaturn')
for o in kb + kl:
    bpy.data.objects.remove(o, do_unlink=True)
HAIR = np.array([0.16, 0.11, 0.08])
for n in k['hair'].data.materials[0].node_tree.nodes:
    if n.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links):
        img = n.image; px = np.array(img.pixels[:]).reshape(-1, 4)
        px[:, :3] = px[:, :3] * HAIR / max(px[:, :3].mean(), 1e-3) * 0.5
        img.pixels[:] = px.ravel(); img.update(); img.file_format = 'JPEG'

kv = V(k['body'])
print('K posed angles', [math.degrees(x) for x in angles(kv)], 'height', kv[:, 2].max(), flush=True)

# 3. Scale MakeHuman to Kenil's height (feet on the ground) and map its surface onto his.
s = (kv[:, 2].max() - kv[:, 2].min()) / (mbv[:, 2].max() - mbv[:, 2].min())
for o in mh.values():
    setV(o, V(o) * s)
mbv = V(mbody)

def bvh(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update(); t = BVHTree.FromBMesh(bm); bm.free(); return t
ktree = bvh(k['body'])
disp = np.zeros_like(mbv)
mbody.data.update()
mnorm = np.empty(len(mbv) * 3); mbody.data.vertices.foreach_get('normal', mnorm); mnorm = mnorm.reshape(-1, 3)
for i, p in enumerate(mbv):
    P, N = Vector(p), Vector(mnorm[i])
    best = None
    for d in (N, -N):
        hit = ktree.ray_cast(P, d, 0.1)
        if hit[0] is not None and (best is None or hit[3] < best[1]): best = (hit[0], hit[3])
    loc = best[0] if best else ktree.find_nearest(P)[0]
    disp[i] = np.array(loc) - p
edges = np.array([e.vertices[:] for e in mbody.data.edges])
deg = np.bincount(edges.ravel(), minlength=len(mbv)).astype(float)
for _ in range(int(os.environ.get('SMOOTH', '25'))):
    acc = np.zeros_like(disp)
    np.add.at(acc, edges[:, 0], disp[edges[:, 1]]); np.add.at(acc, edges[:, 1], disp[edges[:, 0]])
    disp = 0.5 * disp + 0.5 * acc / np.maximum(deg, 1)[:, None]
mtree = bvh(mbody)
tris = [tuple(p.vertices) for p in mbody.data.polygons]
from mathutils.geometry import barycentric_transform
def moved(o, off):
    gv = V(o); out = np.empty_like(gv)
    for i, p in enumerate(gv):
        loc, _, fi, _ = mtree.find_nearest(Vector(p))
        f = tris[fi]
        if len(f) == 3:
            a, b, c = (mbv[j] for j in f)
            w = np.array(barycentric_weights(loc, a, b, c))
            d = w @ disp[list(f)]
        else:
            ps = mbv[list(f)]; w = 1 / (np.linalg.norm(ps - np.array(loc), axis=1) + 1e-5); d = (w / w.sum()) @ disp[list(f)]
        q = p + d
        kl_, kn, _, _ = ktree.find_nearest(Vector(q))
        kn = Vector(kn); sd = (Vector(q) - kl_).dot(kn)
        if sd < off:
            q = np.array(kl_ + kn * off)
        out[i] = q
    setV(o, out)

def barycentric_weights(p, a, b, c):
    p = np.array(p); v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01 or 1e-12
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return (1 - v - w, v, w)

FOOT_Z = 0.13
def foot_box(pts, side):
    m = (pts[:, 2] < FOOT_Z) & ((pts[:, 0] > 0) if side > 0 else (pts[:, 0] < 0))
    return pts[m].min(0), pts[m].max(0)
def fit_shoes(o):
    """Per foot: uniform scale by foot length, foot boxes centered in x/y, soles on the same height."""
    gv = V(o)
    for side in (1, -1):
        (a0, a1), (b0, b1) = foot_box(mbv, side), foot_box(kv, side)
        m = (gv[:, 0] > 0) if side > 0 else (gv[:, 0] < 0)
        sc = (b1[1] - b0[1]) / (a1[1] - a0[1])
        ca, cb = (a0 + a1) / 2, (b0 + b1) / 2
        ca[2], cb[2] = a0[2], b0[2]
        gv[m] = cb + (gv[m] - ca) * sc
    setV(o, gv)
for g in GARMENTS:
    if g['rank'] == 1:
        fit_shoes(mh[g['file']]); continue
    moved(mh[g['file']], g['off'])
    print('FIT', g['file'], flush=True)

def push_out(o, under, gap):
    t = bvh(under); gv = V(o)
    for i, p in enumerate(gv):
        loc, n, _, dist = t.find_nearest(Vector(p))
        if dist is None or dist > 0.1: continue
        sd = (Vector(p) - loc).dot(n)
        if sd < gap: gv[i] = np.array(loc + n * gap)
    setV(o, gv)
for top, unders in (('trousers-charcoal', ['shirt-white', 'tee-black']),
                    ('jacket-denim', ['shirt-white', 'tee-black', 'trousers-charcoal'])):
    for u in unders:
        push_out(mh[top], mh[u], 0.008)
    print('LAYERED', top, flush=True)

# 4. Hide masks, as in build_avatar.py: a vertex is covered by a garment when a short ray
# along its normal (or against it) hits the garment.
ALL = GARMENTS + [AVATURN_SHOES]
objs = {g['file']: mh[g['file']] for g in GARMENTS}; objs['shoes-avaturn'] = k['shoes']
trees = {g['key']: bvh(objs[g['file']]) for g in ALL}
def compute_mask(obj, rank):
    me = obj.data; me.calc_loop_triangles() if hasattr(me, 'calc_loop_triangles') else None
    vals = []
    for v in me.vertices:
        m = 0
        for g in ALL:
            if g['rank'] <= rank: continue
            t = trees[g['key']]
            if t.ray_cast(v.co + v.normal * 0.0005, v.normal, 0.06)[0] is not None or \
               t.ray_cast(v.co + v.normal * 0.0005, -v.normal, 0.02 if rank == 0 else 0.05)[0] is not None:
                m |= g['bit']
        vals.append(m)
    for a in list(me.color_attributes): me.color_attributes.remove(a)
    col = me.color_attributes.new('hide_mask', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', [c for m in vals for c in (m / 255.0, 0.0, 0.0, 1.0)])
    me.color_attributes.active_color = col
    return vals
bm = compute_mask(k['body'], 0)
print('body covered', {g['file']: sum(1 for m in bm if m & g['bit']) for g in ALL}, flush=True)
for g in ALL:
    compute_mask(objs[g['file']], g['rank'])
compute_mask(k['hair'], 99)

def export(objs_, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs_: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_attributes=True,
                              export_image_format='AUTO', export_jpeg_quality=82, export_apply=False, export_yup=True,
                              export_skins=False, export_animations=False, export_vertex_color='ACTIVE',
                              export_morph=False, export_materials='EXPORT')
for o in list(k.values()) + list(mh.values()): o.data.name = o.name
export([k['body'], k['hair']], OUT + '/kenil-avatar.glb')
export([k['shoes']], OUT + '/kenil-shoes-avaturn.glb')
for g in GARMENTS:
    mh[g['file']].name = g['file']
    export([mh[g['file']]], OUT + '/kenil-' + g['file'] + '.glb')
bpy.ops.wm.save_as_mainfile(filepath=OUT + '/fit.blend')
print('DONE', flush=True)
