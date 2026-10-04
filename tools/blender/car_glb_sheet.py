"""Contact sheet of built car GLBs (cars pass 4 review): per car a front 3/4 and a rear 3/4 workbench render of the top
level (H, else L0), with the driver door swung open 45 deg (hinge from cars.json) so the door split shows too.
Run: tools/.venv-blender/Scripts/python tools/blender/car_glb_sheet.py -- <dir with glbs + cars.json> <out.jpg> [ids...]
"""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw

a = sys.argv[sys.argv.index('--') + 1:]
D, out = a[0], os.path.abspath(a[1])
J = json.load(open(os.path.join(D, 'cars.json')))['cars']
ids = a[2:] or sorted(J)
TW, TH = 360, 220
tiles = []
for cid in ids:
    p = os.path.join(D, cid + '.glb')
    if not os.path.exists(p): continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=p)
    sc = bpy.context.scene
    obs = [o for o in sc.objects if o.type == 'MESH']
    lv = 'H' if any(o.name.startswith('H_') for o in obs) else 'L0'
    for o in obs:
        if not (o.name.startswith(lv + '_') or o.name.startswith('caliper')): o.hide_render = True
    h = (J.get(cid, {}).get('doors') or {}).get('L')
    if h:
        px, py, pz = h['p']; piv = Vector((px, -pz, py))
        R = Matrix.Translation(piv) @ Matrix.Rotation(-math.radians(45), 4, 'Z') @ Matrix.Translation(-piv)
        for o in obs:
            if o.name.startswith(lv + '_') and o.name.split('.')[0].endswith('__dl'): o.matrix_world = R @ o.matrix_world
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX'; sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = TW, TH
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    vis = [o for o in obs if not o.hide_render]
    mn = Vector((min(min((o.matrix_world @ Vector(c)).x for c in o.bound_box) for o in vis), min(min((o.matrix_world @ Vector(c)).y for c in o.bound_box) for o in vis), 0))
    mx = Vector((max(max((o.matrix_world @ Vector(c)).x for c in o.bound_box) for o in vis), max(max((o.matrix_world @ Vector(c)).y for c in o.bound_box) for o in vis), max(max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in vis)))
    L = max(mx.y - mn.y, 3.0)
    ims = []
    for k, (dx, dy) in enumerate(((-1.0, 0.95), (1.0, -1.05))):
        cam.location = Vector((dx * L * 0.75, dy * L * 0.85, mx.z * 0.9 + 0.6))
        cam.data.lens = 35
        d = Vector((0, 0, mx.z * 0.4)) - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        f = os.path.join(os.path.dirname(out), '_g%d.png' % k); sc.render.filepath = f
        bpy.ops.render.render(write_still=True); ims.append(Image.open(f).convert('RGB'))
    t = Image.new('RGB', (TW * 2, TH + 18), (20, 20, 22)); t.paste(ims[0], (0, 18)); t.paste(ims[1], (TW, 18))
    ImageDraw.Draw(t).text((4, 2), '%s  %s  doors:%s' % (cid, lv, 'yes' if h else 'no'), fill=(230, 230, 230))
    tiles.append(t)
cols = 3; rows = (len(tiles) + cols - 1) // cols
S = Image.new('RGB', (TW * 2 * cols, (TH + 18) * rows), (0, 0, 0))
for i, t in enumerate(tiles): S.paste(t, ((i % cols) * TW * 2, (i // cols) * (TH + 18)))
S.save(out, quality=86)
print('wrote', out, len(tiles))
