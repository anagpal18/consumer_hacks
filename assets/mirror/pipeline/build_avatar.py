"""
Builds the mirror's avatar and garment GLBs with MPFB 2 (MakeHuman) in Blender.

One MakeHuman body is built per body preset and per slider extreme, all with the
same assets, pose and topology. The base build (male-average) is exported, and
every other build becomes a morph target on it, on the body and on each garment
alike, so the viewer changes preset and proportions live by setting morph weights
and garments keep fitting.

Run: MH_ASSETS=... MH_COMMUNITY=... GLB_OUT=... blender -b --python build_avatar.py
then compress for the app: npx gltfpack -i in.glb -o out.glb -cc -kn -km -ke -vp 14
(meshopt + quantization; the viewer decodes it with three's MeshoptDecoder).
"""
import bpy, os, sys, json, math, importlib
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PKG = 'bl_ext.user_default.mpfb'
HS = importlib.import_module(PKG + '.services.humanservice').HumanService
TS = importlib.import_module(PKG + '.services.targetservice').TargetService
LS = importlib.import_module(PKG + '.services.locationservice').LocationService
# MH_ASSETS: MakeHuman system assets ("base" folder); MH_COMMUNITY: community clothes folder.
# See assets/mirror/README.md for where each comes from.
A = os.environ['MH_ASSETS']
G = os.environ['MH_COMMUNITY']
HERE = os.path.dirname(os.path.abspath(__file__))
W = os.environ.get('MIRROR_WORK', os.path.join(HERE, 'work'))
TEX = W + '/tex'
OUT = os.environ.get('GLB_OUT', W + '/glb')
os.makedirs(TEX, exist_ok=True); os.makedirs(OUT, exist_ok=True)

GARMENTS = [
    dict(key='demo/jacket-denim', file='jacket-denim', slot='outerwear', rank=4, mhclo=G + '/Denim_Jacket/denim_jacket.mhclo'),
    dict(key='demo/shirt-white', file='shirt-white', slot='top', rank=2, mhclo=A + '/clothes/male_casualsuit01/male_casualsuit01.mhclo', recolor='#F1EEE8', cut_legs=True),
    dict(key='demo/tee-black', file='tee-black', slot='top', rank=2, mhclo=G + '/T-shirt_Basic_Tucked/t_shirt_basic_tucked.mhclo', recolor='#1E1E1E'),
    dict(key='demo/trousers-charcoal', file='trousers-charcoal', slot='bottom', rank=3, mhclo=G + '/M_Trousers_02/m_trousers_02.mhclo', recolor='#3B3B40'),
    dict(key='demo/sneakers-white', file='sneakers-white', slot='shoes', rank=1, mhclo=A + '/clothes/shoes05/shoes05.mhclo'),
    dict(key='demo/boots-brown', file='boots-brown', slot='shoes', rank=1, mhclo=A + '/clothes/shoes01/shoes01.mhclo'),
]
for i, g in enumerate(GARMENTS):
    g['bit'] = 1 << i

PARTS = [('eyebrows', 'Eyebrows', A + '/eyebrows/eyebrow001/eyebrow001.mhclo'),
         ('eyelashes', 'Eyelashes', A + '/eyelashes/eyelashes01/eyelashes01.mhclo'),
         ('hair_male', 'Hair', A + '/hair/short02/short02.mhclo'),
         ('hair_female', 'Hair', A + '/hair/ponytail01/ponytail01.mhclo')]

def macro(gender, weight, muscle, height, cupsize=0.5, proportions=0.8):
    return {"gender": gender, "age": 0.5, "muscle": muscle, "weight": weight, "proportions": proportions, "height": height,
            "cupsize": cupsize, "firmness": 0.5, "race": {"asian": 0.05, "caucasian": 0.9, "african": 0.05}}

BASE_PRESET = 'male-average'
PRESETS = {
    'male-slim': macro(1.0, 0.30, 0.45, 0.6),
    'male-average': macro(1.0, 0.48, 0.62, 0.6),
    'male-broad': macro(1.0, 0.68, 0.85, 0.6),
    'female-slim': macro(0.0, 0.30, 0.40, 0.45, cupsize=0.45),
    'female-average': macro(0.0, 0.48, 0.50, 0.45),
    'female-broad': macro(0.0, 0.72, 0.50, 0.45, cupsize=0.7),
}
# Slider extremes, built on the base preset. Weights are clamped where garments still fit cleanly.
SLIDER_WEIGHT = 0.9
SLIDERS = {
    'head': ['head/head-scale-vert-%s', 'head/head-scale-horiz-%s', 'head/head-scale-depth-%s'],
    'chest': ['torso/measure-bust-circ-%s'],
    'shoulders': ['torso/measure-shoulder-dist-%s'],
    'arms': ['arms/measure-upperarm-circ-%s', 'arms/l-lowerarm-fat-%s', 'arms/r-lowerarm-fat-%s'],
    'waist': ['torso/measure-waist-circ-%s'],
    'hips': ['torso/measure-hips-circ-%s'],
}
POSE = json.loads(os.environ.get('POSE', '{"upperarm01.L": ["Z", -30], "upperarm01.R": ["Z", 30]}'))
TARGETS_DIR = os.path.join(os.path.dirname(importlib.import_module(PKG).__file__), 'data', 'targets')

def parse_mhmat(path):
    d = {}
    for line in open(path, encoding='utf-8', errors='ignore'):
        p = line.strip().split(None, 1)
        if len(p) == 2 and p[0] in ('diffuseTexture', 'normalmapTexture'):
            d[p[0]] = os.path.normpath(os.path.join(os.path.dirname(path), p[1].strip()))
    return d

def recolor(src, hexcol, name):
    import subprocess
    dst = TEX + '/' + name + '.png'
    subprocess.check_call(['python3', os.path.join(HERE, 'recolor.py'), src, hexcol, dst])
    return dst

def load_img(path, size=1024):
    img = bpy.data.images.load(path, check_existing=True)
    if max(img.size) > size:
        img.scale(size, size)
    return img

def make_material(name, diffuse, normal=None, rough=0.85, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = 0.3
    if diffuse:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = load_img(diffuse)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    if normal and os.path.exists(normal):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = load_img(normal); t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m

LEG_BONES = ('upperleg', 'lowerleg', 'foot', 'toe', 'pelvis')
def leg_verts(src):
    names = {vg.index: vg.name for vg in src.vertex_groups}
    out = set()
    for v in src.data.vertices:
        if v.groups:
            top = max(v.groups, key=lambda e: e.weight)
            if names[top.group].startswith(LEG_BONES):
                out.add(v.index)
    return out

def group_center(obj, gname):
    gi = obj.vertex_groups[gname].index
    idx = [v.index for v in obj.data.vertices if any(e.group == gi and e.weight > 0.5 for e in v.groups)]
    states = [(m, m.show_viewport) for m in obj.modifiers]
    for m, _ in states:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg).to_mesh()
    pts = [obj.matrix_world @ ev.vertices[i].co for i in idx]
    obj.evaluated_get(dg).to_mesh_clear()
    for m, s in states:
        m.show_viewport = s
    c = sum(pts, Vector()) / len(pts)
    return c, max((p - c).length for p in pts)

def bake(obj, name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    me.transform(obj.matrix_world)
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    return new

def build(macro_dict, targets):
    """Builds one dressed, posed human and returns {mesh name: baked object}."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    human = HS.create_human(macro_detail_dict=macro_dict, feet_on_ground=True, scale=0.1)
    for path, weight in targets:
        TS.load_target(human, os.path.join(TARGETS_DIR, path + '.target.gz'), weight=weight)
    HS.add_builtin_rig(human, 'default')
    rig = human.parent
    src = {}
    for name, kind, path in PARTS:
        src[name] = HS.add_mhclo_asset(path, human, asset_type=kind, subdiv_levels=0)
    for g in GARMENTS:
        src[g['file']] = HS.add_mhclo_asset(g['mhclo'], human, asset_type='Clothes', subdiv_levels=0)
    eyes = [(side,) + group_center(human, 'helper-%s-eye' % side) for side in ('l', 'r')]
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for bone, (axis, deg) in POSE.items():
        b = rig.pose.bones[bone]; b.rotation_mode = 'XYZ'
        e = list(b.rotation_euler); e['XYZ'.index(axis)] += math.radians(deg); b.rotation_euler = e
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    for m in list(human.modifiers):
        if m.type == 'MASK' and m.name != 'Hide helpers':
            human.modifiers.remove(m)
    out = {'body': bake(human, 'body')}
    for name, _, _ in PARTS:
        out[name] = bake(src[name], name)
    for g in GARMENTS:
        o = bake(src[g['file']], g['file'])
        if g.get('cut_legs'):
            legs = leg_verts(src[g['file']])
            bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in legs for v in f.verts)], context='FACES')
            bm.to_mesh(o.data); bm.free()
        out[g['file']] = o
    for side, c, r in eyes:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=r * 0.92, location=c)
        e = bpy.context.active_object; e.name = 'eye_' + side
        bpy.ops.object.transform_apply(location=True)
        out['eye_' + side] = e
    return out

def coords(obj):
    a = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get('co', a)
    return a

# 1. Every variant except the base: keep only vertex positions.
variants = {}
for preset, m in PRESETS.items():
    if preset != BASE_PRESET:
        variants['preset:' + preset] = [m, []]
for slider, paths in SLIDERS.items():
    for sign, word in ((1, 'incr'), (-1, 'decr')):
        variants['%s:%s' % (slider, '+' if sign > 0 else '-')] = [PRESETS[BASE_PRESET], [(p % word, SLIDER_WEIGHT) for p in paths]]
shapes = {}
heights = {}
for name, (m, targets) in variants.items():
    objs = build(m, targets)
    shapes[name] = {k: coords(o) for k, o in objs.items()}
    if name.startswith('preset:'):
        heights[name[7:]] = float(shapes[name]['body'].reshape(-1, 3)[:, 2].max())
    print('BUILT', name, flush=True)

# 2. The base build, exported with every variant as a morph target.
base = build(PRESETS[BASE_PRESET], [])
heights[BASE_PRESET] = float(coords(base['body']).reshape(-1, 3)[:, 2].max())

def bvh_of(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    t = BVHTree.FromBMesh(bm); bm.free(); return t
trees = {g['key']: bvh_of(base[g['file']]) for g in GARMENTS}
def compute_mask(obj, rank):
    me = obj.data
    vals = [0.0] * len(me.vertices)
    for i, v in enumerate(me.vertices):
        m = 0
        for g in GARMENTS:
            if g['rank'] <= rank:
                continue
            t = trees[g['key']]
            hit_out = t.ray_cast(v.co + v.normal * 0.0005, v.normal, 0.06)[0]
            hit_in = t.ray_cast(v.co + v.normal * 0.0005, -v.normal, 0.02 if rank == 0 else 0.05)[0]
            if hit_out is not None or hit_in is not None:
                m |= g['bit']
        vals[i] = float(m)
    # The mask rides in COLOR_0.r as bits / 255, because gltfpack drops custom attributes.
    col = me.color_attributes.new('hide_mask', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', [c for v in vals for c in (v / 255.0, 0.0, 0.0, 1.0)])
    me.color_attributes.active_color = col
compute_mask(base['body'], 0)
for g in GARMENTS:
    compute_mask(base[g['file']], g['rank'])
for name, obj in base.items():
    if not obj.data.color_attributes:
        compute_mask(obj, 99)

for name, obj in base.items():
    obj.shape_key_add(name='Basis')
    for vname, per_mesh in shapes.items():
        co = per_mesh[name]
        assert len(co) == len(obj.data.vertices) * 3, (name, vname)
        obj.shape_key_add(name=vname, from_mix=False).data.foreach_set('co', co)

skin_m = parse_mhmat(A + '/skins/young_caucasian_male/young_caucasian_male.mhmat')
skin_f = parse_mhmat(A + '/skins/young_caucasian_female/young_caucasian_female.mhmat')
base['body'].data.materials.append(make_material('skin', skin_m['diffuseTexture'], rough=0.55))
for name, kind, path in PARTS:
    mm = parse_mhmat(path.replace('.mhclo', '.mhmat'))
    base[name].data.materials.clear()
    base[name].data.materials.append(make_material(name, mm.get('diffuseTexture'), mm.get('normalmapTexture'), rough=0.6, alpha=True))
for g in GARMENTS:
    mm = parse_mhmat(g['mhclo'].replace('.mhclo', '.mhmat'))
    d = mm.get('diffuseTexture')
    if g.get('recolor'):
        d = recolor(d, g['recolor'], g['file'])
    o = base[g['file']]
    o.data.materials.clear()
    o.data.materials.append(make_material(g['file'], d, mm.get('normalmapTexture'), rough=0.45 if g['slot'] == 'shoes' else 0.9))
eye_mat = make_material('eyes', A + '/eyes/materials/brownlight_eye.png', rough=0.15)
for side in ('l', 'r'):
    e = base['eye_' + side]
    me = e.data
    uv = me.uv_layers.active
    c = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    r = max((v.co - c).length for v in me.vertices)
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co - c
            uv.data[li].uv = (0.293 + co.x / r * 0.25, 0.297 + co.z / r * 0.25) if co.y < 0 else (0.05, 0.5)
    me.materials.append(eye_mat)
# The female skin texture rides along on a tiny hidden swatch; the viewer moves it onto the body.
bpy.ops.mesh.primitive_plane_add(size=0.01, location=(0, 0, -1))
swatch = bpy.context.active_object; swatch.name = 'skin_female_swatch'
swatch.data.materials.append(make_material('skin_female', skin_f['diffuseTexture'], rough=0.55))

def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_attributes=True,
                              export_image_format='JPEG', export_jpeg_quality=82, export_apply=False,
                              export_yup=True, export_skins=False, export_animations=False, export_vertex_color='ACTIVE',
                              export_morph=True, export_morph_normal=True, export_materials='EXPORT')
for o in base.values():
    o.data.name = o.name
avatar = ['body', 'eyebrows', 'eyelashes', 'hair_male', 'hair_female', 'eye_l', 'eye_r']
export([base[n] for n in avatar] + [swatch], OUT + '/avatar-a.glb')
for g in GARMENTS:
    export([base[g['file']]], OUT + '/' + g['file'] + '.glb')
meta = {
    'garments': {g['key']: dict(file=g['file'] + '.glb', slot=g['slot'], bit=g['bit']) for g in GARMENTS},
    'basePreset': BASE_PRESET,
    'presetHeightsM': heights,
    'morphs': list(shapes.keys()),
}
json.dump(meta, open(OUT + '/meta.json', 'w'), indent=1)
print('DONE', json.dumps(meta))
