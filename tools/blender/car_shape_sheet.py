"""Body-shape review sheet (car body pass 3): one row per car, columns = side (ortho), front 3/4, rear 3/4, front (ortho).
Workbench matcap by default (fast, shows the form), --cycles for a lit render.
Run: tools/.venv-blender/Scripts/python tools/blender/car_shape_sheet.py -- sedan hatch [--raw] [--old] [--cycles] [--name x]
  --raw  : JS loft only (no car_hero detail pass)
  --old  : no aero add-ons (car_body.py); the body sculpt itself comes from the JS export
Writes shots/car3_sheet_<name>.jpg
"""
import bpy, sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector, Matrix
import cars as C
import car_hero as H
import car_body as Bd
from PIL import Image

a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {k: (k in a) for k in ('--raw', '--old', '--cycles')}
name = a[a.index('--name') + 1] if '--name' in a else 'review'
ids = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or a[i - 1] != '--name')]
opt['--big'] = '--big' in a
BIG = '--big' in a
TW, TH = (960, 440) if BIG else (520, 260)
out = os.path.join(C.ROOT, 'shots')


def setup_scene(meta):
    sc = bpy.context.scene
    if opt['--cycles']:
        sc.render.engine = 'CYCLES'; sc.cycles.device = C.devices(); sc.cycles.samples = 40; sc.cycles.use_denoising = True
        w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
        bg = w.node_tree.nodes['Background']; sky = w.node_tree.nodes.new('ShaderNodeTexSky')
        w.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.8
        L = bpy.data.lights.new('sun', 'SUN'); L.energy = 3.0; lo = bpy.data.objects.new('sun', L); sc.collection.objects.link(lo)
        lo.rotation_euler = Vector((0.5, 0.75, -0.45)).to_track_quat('Z', 'Y').to_euler()
    else:
        sc.render.engine = 'BLENDER_WORKBENCH'
        sh = sc.display.shading
        sh.light = 'STUDIO'
        sh.color_type = 'OBJECT'; sh.show_cavity = True; sh.cavity_type = 'WORLD'
        sh.show_specular_highlight = True
        sc.display.render_aa = '8'
    sc.render.resolution_x = TW; sc.render.resolution_y = TH
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, -0.002, 0), rotation=(-math.pi / 2, 0, 0))
    g = bpy.context.active_object; g.color = (0.25, 0.25, 0.26, 1)
    gm = bpy.data.materials.new('g'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.08, 0.085, 1); g.data.materials.append(gm)


def paint_mats(parts):
    cols = {'paint': (0.78, 0.79, 0.8, 1), 'paint2': (0.7, 0.7, 0.72, 1), 'glass': (0.05, 0.07, 0.09, 1), 'details': (0.12, 0.12, 0.13, 1),
            'lamps': (0.95, 0.9, 0.85, 1), 'lens': (0.6, 0.65, 0.7, 1), 'wheel': (0.15, 0.15, 0.16, 1)}
    for k, o in parts.items():
        o.color = cols.get(k, (0.3, 0.3, 0.3, 1))
        if opt['--cycles']:
            m = bpy.data.materials.new(k); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
            bs.inputs['Base Color'].default_value = o.color
            if k in ('paint', 'paint2'):
                bs.inputs['Metallic'].default_value = 0.4; bs.inputs['Roughness'].default_value = 0.3; bs.inputs['Coat Weight'].default_value = 1.0
            elif k == 'glass': bs.inputs['Roughness'].default_value = 0.03
            else: bs.inputs['Roughness'].default_value = 0.5
            o.data.materials.clear(); o.data.materials.append(m)


def cam_to(co, cam, p, t, fov=None, ortho=None):
    co.location = Vector(p)
    f = (Vector(t) - Vector(p)).normalized(); rt = f.cross(Vector((0, 1, 0))).normalized(); up = rt.cross(f)
    co.rotation_euler = Matrix((rt, up, -f)).transposed().to_euler()
    if ortho: cam.type = 'ORTHO'; cam.ortho_scale = ortho
    else: cam.type = 'PERSP'; cam.angle = math.radians(fov)


rows = []
for cid in ids:
    with open(os.path.join(C.SRC, cid + '.hero.json')) as f: D = json.load(f)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    meta = D['meta']
    parts = {k: C.soup_mesh('L0_' + k, D['buckets'][k]) for k in ('paint', 'paint2', 'details', 'lamps', 'glass') if k in D['buckets']}
    if not opt['--raw']: H.detail(parts, D, log=lambda *x: None)
    if not opt['--old'] and not opt['--raw']: Bd.aero(cid, parts, D, log=print)
    wheel = C.soup_mesh('wheel', D['buckets']['wheel'])
    for (x, z) in ((-meta['tf'] / 2, meta['axleFZ']), (meta['tf'] / 2, meta['axleFZ']), (-meta['tr'] / 2, meta['axleRZ']), (meta['tr'] / 2, meta['axleRZ'])):
        o = wheel.copy(); o.location = (x, meta['R'], z); o.scale = ((-1 if x < 0 else 1), 1, 1); bpy.context.scene.collection.objects.link(o)
        o.color = (0.12, 0.12, 0.13, 1)
    wheel.hide_render = True
    paint_mats(parts)
    setup_scene(meta)
    sc = bpy.context.scene
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    cam.clip_start = 0.05
    L = meta['zR'] - meta['zF']; zc = (meta['zR'] + meta['zF']) / 2
    V = [((-9, 0.75, zc), (0, 0.75, zc), None, L + 0.5),
         ((-3.3, 1.25, meta['zF'] - 3.6), (0, 0.6, zc - 0.5), 36, None),
         ((3.3, 1.35, meta['zR'] + 3.6), (0, 0.65, zc + 0.5), 36, None),
         ((0, 0.8, -12), (0, 0.8, 0), None, 2.9)]
    if BIG: V = V[:2]
    tiles = []
    for i, (p, t, fov, orth) in enumerate(V):
        cam_to(co, cam, p, t, fov, orth)
        fn = os.path.join(out, '_sh_%d.png' % i); sc.render.filepath = fn
        bpy.ops.render.render(write_still=True); tiles.append(Image.open(fn).convert('RGB')); os.remove(fn)
    row = Image.new('RGB', (TW * len(tiles), TH))
    for i, im in enumerate(tiles): row.paste(im, (i * TW, 0))
    rows.append(row)
S = Image.new('RGB', (rows[0].size[0], TH * len(rows)))
for i, r in enumerate(rows): S.paste(r, (0, i * TH))
fn = os.path.join(out, 'car3_sheet_%s.jpg' % name); S.save(fn, quality=86)
print('wrote', fn)
