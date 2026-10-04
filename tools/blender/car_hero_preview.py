"""Review renders of the hero detail pass (no bake, no export): shots/car2_blend_<id>.jpg (4 views, 2x2).
Run: tools/.venv-blender/Scripts/python tools/blender/car_hero_preview.py -- tora [--views f,r,s,i] [--size 640]
"""
import bpy, sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import cars as C
import car_hero as H
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
cid = a[0] if a else 'tora'
views = (a[a.index('--views') + 1] if '--views' in a else 'f,r,s,i').split(',')
size = int(a[a.index('--size') + 1]) if '--size' in a else 640
raw = '--raw' in a

with open(os.path.join(C.SRC, cid + '.hero.json')) as f: D = json.load(f)
bpy.ops.wm.read_factory_settings(use_empty=True)
parts = {k: C.soup_mesh('L0_' + k, D['buckets'][k]) for k in ('paint', 'paint2', 'details', 'lamps', 'glass') if k in D['buckets']}
if not raw: H.detail(parts, D)
print('tris', {k: len(o.data.polygons) for k, o in parts.items()}, sum(len(o.data.polygons) for o in parts.values()))
meta = D['meta']
wheel = C.soup_mesh('wheel', D['buckets']['wheel'])
for (x, z) in ((-meta['tf'] / 2, meta['axleFZ']), (meta['tf'] / 2, meta['axleFZ']), (-meta['tr'] / 2, meta['axleRZ']), (meta['tr'] / 2, meta['axleRZ'])):
    o = wheel.copy(); o.location = (x, meta['R'], z); o.scale = ((-1 if x < 0 else 1), 1, 1); bpy.context.scene.collection.objects.link(o)
wheel.hide_render = True


def mat(name, kind):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'col'
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'surf'
    sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(uv.outputs[0], sp.inputs[0])
    if kind == 'paint':
        bs.inputs['Base Color'].default_value = (0.75, 0.75, 0.73, 1); bs.inputs['Metallic'].default_value = 0.3; bs.inputs['Roughness'].default_value = 0.3
        bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.03
    elif kind == 'glass':
        bs.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1); bs.inputs['Roughness'].default_value = 0.02; bs.inputs['Alpha'].default_value = 0.55
    elif kind == 'lens':
        bs.inputs['Base Color'].default_value = (1, 1, 1, 1); bs.inputs['Roughness'].default_value = 0.0; bs.inputs['Transmission Weight'].default_value = 1.0
    else:
        nt.links.new(at.outputs['Color'], bs.inputs['Base Color'])
        nt.links.new(sp.outputs['X'], bs.inputs['Metallic']); nt.links.new(sp.outputs['Y'], bs.inputs['Roughness'])
        if kind == 'lamps':
            nt.links.new(at.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 0.6
    return m


for k, o in parts.items():
    o.data.materials.clear(); o.data.materials.append(mat(k, k if k in ('paint', 'glass', 'lens', 'lamps') else 'det'))
    if k == 'paint2': o.data.materials[0] = mat('p2', 'det')
for o in bpy.context.scene.objects:
    if o.name.startswith('wheel'): o.data.materials.clear(); o.data.materials.append(mat('w', 'det'))
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = C.devices(); sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x = size; sc.render.resolution_y = size * 9 // 16
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
sky = w.node_tree.nodes.new('ShaderNodeTexSky')
try: sky.sky_type = 'HOSEK_WILKIE'
except Exception: pass
w.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.9
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0), rotation=(-math.pi / 2, 0, 0))
g = bpy.context.active_object; gm = bpy.data.materials.new('g'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.08, 0.085, 1); g.data.materials.append(gm)
L = bpy.data.lights.new('sun', 'SUN'); L.energy = 3.5; lo = bpy.data.objects.new('sun', L); sc.collection.objects.link(lo)
lo.rotation_euler = Vector((0.5, 0.75, -0.45)).to_track_quat('Z', 'Y').to_euler()
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
eye = meta.get('eye') or [-0.37, 1.1, 0]
V = {
    'f': ((-2.6, 1.0, -4.0), (0, 0.55, -1.0), 35),
    'r': ((2.6, 1.1, 4.2), (0, 0.6, 1.0), 35),
    's': ((-5.5, 0.9, 0.2), (0, 0.6, 0.2), 38),
    'i': ((eye[0], eye[1], eye[2] + 0.02), (eye[0] * 0.6, eye[1] - 0.45, eye[2] - 3.0), 70),
    'hl': ((-1.3, 0.75, meta['zF'] - 1.2), (-0.62, 0.6, meta['zF'] + 0.2), 30),
    'tl': ((1.3, 0.95, meta['zR'] + 1.2), (0.6, 0.8, meta['zR'] - 0.2), 30),
    'si': ((-2.2, 1.25, 0.1), (0.2, 0.75, 0.1), 45),
}
tiles = []
out = os.path.join(C.ROOT, 'shots')
for vk in views:
    p, t, fov = V[vk]
    co.location = Vector(p); cam.angle = math.radians(fov); cam.clip_start = 0.02
    f = (Vector(t) - Vector(p)).normalized(); rt = f.cross(Vector((0, 1, 0))).normalized(); up = rt.cross(f)
    from mathutils import Matrix
    co.rotation_euler = Matrix((rt, up, -f)).transposed().to_euler()
    fn = os.path.join(out, '_tmp_%s.png' % vk); sc.render.filepath = fn
    bpy.ops.render.render(write_still=True); tiles.append(fn)
import subprocess
subprocess.run(['python', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_compose.py'), os.path.join(out, 'car2_blend_%s.jpg' % cid)] + tiles, check=False)
for f in tiles: os.remove(f)
print('wrote', os.path.join(out, 'car2_blend_%s.jpg' % cid))
