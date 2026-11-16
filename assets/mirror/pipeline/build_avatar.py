
import bpy, os, sys, json, math, importlib
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

PKG = 'bl_ext.user_default.mpfb'
HS = importlib.import_module(PKG + '.services.humanservice').HumanService
# MH_ASSETS: MakeHuman system assets ("base" folder); MH_COMMUNITY: community clothes folder.
# See assets/mirror/README.md for where each comes from.
A = os.environ['MH_ASSETS']
G = os.environ['MH_COMMUNITY']
W = os.environ.get('MIRROR_WORK', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work'))
TEX = W + '/tex'
OUT = os.environ.get('GLB_OUT', W + '/glb')
os.makedirs(TEX, exist_ok=True); os.makedirs(OUT, exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAVE_BLEND = 'blend' in args

GARMENTS = [
    dict(key='demo/jacket-denim', file='jacket-denim', slot='outerwear', rank=4, mhclo=G + '/Denim_Jacket/denim_jacket.mhclo'),
    dict(key='demo/shirt-white', file='shirt-white', slot='top', rank=2, mhclo=A + '/clothes/male_casualsuit01/male_casualsuit01.mhclo', recolor='#F1EEE8', cut_below='waist'),
    dict(key='demo/tee-black', file='tee-black', slot='top', rank=2, mhclo=G + '/T-shirt_Basic_Tucked/t_shirt_basic_tucked.mhclo', recolor='#1E1E1E'),
    dict(key='demo/trousers-charcoal', file='trousers-charcoal', slot='bottom', rank=3, mhclo=G + '/M_Trousers_02/m_trousers_02.mhclo', recolor='#3B3B40'),
    dict(key='demo/sneakers-white', file='sneakers-white', slot='shoes', rank=1, mhclo=A + '/clothes/shoes05/shoes05.mhclo'),
    dict(key='demo/boots-brown', file='boots-brown', slot='shoes', rank=1, mhclo=A + '/clothes/shoes01/shoes01.mhclo'),
]
for i, g in enumerate(GARMENTS):
    g['bit'] = 1 << i

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
    subprocess.check_call(['python3', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'recolor.py'), src, hexcol, dst])
    return dst

def load_img(path, size=1024):
    img = bpy.data.images.load(path, check_existing=True)
    if max(img.size) > size:
        img.scale(size, size)
    return img

def make_material(name, diffuse, normal=None, rough=0.85, alpha=False, color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = 0.3
    if color:
        bsdf.inputs['Base Color'].default_value = color
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

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
macro = {"gender": 1.0, "age": 0.5, "muscle": 0.62, "weight": 0.48, "proportions": 0.8, "height": 0.6,
         "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 0.05, "caucasian": 0.9, "african": 0.05}}
human = HS.create_human(macro_detail_dict=macro, feet_on_ground=True, scale=0.1)
human.name = 'body'
HS.add_builtin_rig(human, 'default')
rig = human.parent

parts = {}
for kind, path in [('Eyebrows', A + '/eyebrows/eyebrow001/eyebrow001.mhclo'),
                   ('Eyelashes', A + '/eyelashes/eyelashes01/eyelashes01.mhclo'),
                   ('Hair', A + '/hair/short02/short02.mhclo')]:
    o = HS.add_mhclo_asset(path, human, asset_type=kind, subdiv_levels=0)
    o.name = kind.lower(); parts[kind] = (o, path)
for g in GARMENTS:
    o = HS.add_mhclo_asset(g['mhclo'], human, asset_type='Clothes', subdiv_levels=0)
    o.name = g['file']; g['obj'] = o

# eye centres from helper groups, in rest pose
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
    r = max((p - c).length for p in pts)
    return c, r
eyes = []
for side in ('l', 'r'):
    c, r = group_center(human, 'helper-%s-eye' % side)
    eyes.append((side, c, r))

# relaxed pose: arms down
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
def rot(name, axis, deg):
    b = pb[name]; b.rotation_mode = 'XYZ'
    e = list(b.rotation_euler); e['XYZ'.index(axis)] += math.radians(deg); b.rotation_euler = e
POSE = json.loads(os.environ.get('POSE', '{"upperarm01.L": ["Z", -30], "upperarm01.R": ["Z", 30]}'))
for name, (axis, deg) in POSE.items():
    rot(name, axis, deg)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()

# bake every mesh to a static evaluated copy
def bake(obj, name):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    me.transform(obj.matrix_world)
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    return new

for m in list(human.modifiers):
    if m.type == 'MASK' and m.name != 'Hide helpers':
        human.modifiers.remove(m)
baked = {}
baked['body'] = bake(human, 'body_baked')
for kind, (o, p) in parts.items():
    baked[kind] = bake(o, kind.lower() + '_baked')
for g in GARMENTS:
    g['baked'] = bake(g['obj'], g['file'] + '_baked')

# cut trousers part off the casual suit to keep only the shirt
def body_z(frac):
    zs = [v.co.z for v in baked['body'].data.vertices]
    return min(zs) + (max(zs) - min(zs)) * frac
LEG_BONES = ('upperleg', 'lowerleg', 'foot', 'toe', 'pelvis')
def leg_verts(src):
    names = {vg.index: vg.name for vg in src.vertex_groups}
    out = set()
    for v in src.data.vertices:
        if not v.groups:
            continue
        top = max(v.groups, key=lambda e: e.weight)
        if names[top.group].startswith(LEG_BONES):
            out.add(v.index)
    return out
for g in GARMENTS:
    if g.get('cut_below'):
        legs = leg_verts(g['obj'])
        o = g['baked']
        bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in legs for v in f.verts)], context='FACES')
        bm.to_mesh(o.data); bm.free()

# hide masks: a vertex is hidden by an outer garment whose surface lies just outside it
def bvh_of(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    t = BVHTree.FromBMesh(bm); bm.free(); return t
trees = {g['key']: bvh_of(g['baked']) for g in GARMENTS}
def compute_mask(obj, rank):
    me = obj.data
    vals = [0.0] * len(me.vertices)
    for i, v in enumerate(me.vertices):
        m = 0
        for g in GARMENTS:
            if g['rank'] <= rank:
                continue
            t = trees[g['key']]
            out_hit = t.ray_cast(v.co + v.normal * 0.0005, v.normal, 0.06)[0]
            in_hit = t.ray_cast(v.co + v.normal * 0.0005, -v.normal, 0.02 if rank == 0 else 0.05)[0]
            if out_hit is not None or in_hit is not None:
                m |= g['bit']
        vals[i] = float(m)
    a = me.attributes.new('_HIDE', 'FLOAT', 'POINT')
    a.data.foreach_set('value', vals)
compute_mask(baked['body'], 0)
for g in GARMENTS:
    compute_mask(g['baked'], g['rank'])

# materials
skin = parse_mhmat(A + '/skins/young_caucasian_male/young_caucasian_male.mhmat')
skin_mat = make_material('skin', skin['diffuseTexture'], rough=0.55)
baked['body'].data.materials.clear(); baked['body'].data.materials.append(skin_mat)
for kind, (o, p) in parts.items():
    mm = parse_mhmat(p.replace('.mhclo', '.mhmat'))
    mat = make_material(kind.lower(), mm.get('diffuseTexture'), mm.get('normalmapTexture'), rough=0.6, alpha=True)
    baked[kind].data.materials.clear(); baked[kind].data.materials.append(mat)
for g in GARMENTS:
    mm = parse_mhmat(g['mhclo'].replace('.mhclo', '.mhmat'))
    d = mm.get('diffuseTexture')
    if g.get('recolor'):
        d = recolor(d, g['recolor'], g['file'])
    rough = 0.45 if g['slot'] == 'shoes' else 0.9
    mat = make_material(g['file'], d, mm.get('normalmapTexture'), rough=rough)
    g['baked'].data.materials.clear(); g['baked'].data.materials.append(mat)

# eyes: small spheres with the iris texture projected from the front
eye_mat = make_material('eyes', A + '/eyes/materials/brownlight_eye.png', rough=0.15)
eye_objs = []
for side, c, r in eyes:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=r * 0.92, location=c)
    e = bpy.context.active_object; e.name = 'eye_' + side
    me = e.data
    uv = me.uv_layers.active
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (0.293 + co.x / r * 0.25, 0.297 + co.z / r * 0.25) if co.y < 0 else (0.05, 0.5)
    me.materials.append(eye_mat)
    bpy.ops.object.transform_apply(location=True)
    eye_objs.append(e)

# assemble avatar object
avatar_objs = [baked['body'], baked['Eyebrows'], baked['Eyelashes'], baked['Hair']] + eye_objs
for o in list(bpy.data.objects):
    if o not in avatar_objs and o not in [g['baked'] for g in GARMENTS]:
        bpy.data.objects.remove(o, do_unlink=True)
for o, n in zip(avatar_objs, ['body', 'eyebrows', 'eyelashes', 'hair', 'eye_l', 'eye_r']):
    o.name = n; o.data.name = n
for g in GARMENTS:
    g['baked'].name = g['file']; g['baked'].data.name = g['file']

def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_attributes=True,
                              export_image_format='JPEG', export_jpeg_quality=82, export_apply=True,
                              export_yup=True, export_draco_mesh_compression_enable=False, export_skins=False,
                              export_animations=False, export_morph=False, export_materials='EXPORT')
export(avatar_objs, OUT + '/avatar-a.glb')
for g in GARMENTS:
    export([g['baked']], OUT + '/' + g['file'] + '.glb')
meta = {g['key']: dict(file=g['file'] + '.glb', slot=g['slot'], bit=g['bit']) for g in GARMENTS}
json.dump(meta, open(OUT + '/meta.json', 'w'), indent=1)
if SAVE_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=W + '/scene.blend')
print('DONE', meta)
