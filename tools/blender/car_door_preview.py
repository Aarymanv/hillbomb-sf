"""Door split review (cars pass 4): import a built car GLB, swing both front doors open on their hinges, workbench renders.
Run: tools/.venv-blender/Scripts/python tools/blender/car_door_preview.py -- <glb> <cars.json or done.json> <out.jpg> [angle_deg] [level]
"""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
glb, info, out = a[0], a[1], a[2]
ang = math.radians(float(a[3]) if len(a) > 3 else 60)
lv = a[4] if len(a) > 4 else 'H'
cid = os.path.basename(glb).split('.')[0]
J = json.load(open(info))
doors = J.get('doors') or J.get('cars', {}).get(cid, {}).get('doors') or {}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
obs = [o for o in sc.objects if o.type == 'MESH']
names = sorted({o.name.split('_')[0] for o in obs})
if lv not in names: lv = 'L0'
for o in obs:
    if not o.name.startswith(lv + '_') and not o.name.startswith('caliper'): o.hide_render = True
# glTF import: +Y up already converted to Blender Z up (x, -z, y)
for side, s in (('L', -1), ('R', 1)):
    h = doors.get(side)
    if not h: continue
    px, py, pz = h['p']
    piv = Vector((px, -pz, py))
    R = Matrix.Translation(piv) @ Matrix.Rotation(-s * ang * -1, 4, 'Z') @ Matrix.Translation(-piv)
    for o in obs:
        if o.name.startswith(lv + '_') and o.name.split('.')[0].endswith('__d' + side.lower()):
            o.matrix_world = R @ o.matrix_world
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX'
sc.display.shading.show_cavity = True; sc.display.shading.show_shadows = True
sc.render.resolution_x, sc.render.resolution_y = 900, 600
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 32
from PIL import Image
tiles = []
for i, (pos, tgt) in enumerate((((-4.2, -4.6, 1.7), (0, 0.4, 0.6)), ((-3.0, 2.6, 1.3), (-0.6, 0.0, 0.7)), ((-1.6, -0.4, 1.4), (-0.6, -0.2, 0.7)))):
    cam.location = Vector(pos)
    d = Vector(tgt) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    p = out.replace('.jpg', '_%d.png' % i)
    sc.render.filepath = p; bpy.ops.render.render(write_still=True); tiles.append(p)
ims = [Image.open(p) for p in tiles]
W = sum(i.size[0] for i in ims); Hh = ims[0].size[1]
sheet = Image.new('RGB', (W, Hh))
x = 0
for im in ims: sheet.paste(im.convert('RGB'), (x, 0)); x += im.size[0]
sheet.save(out, quality=88)
for p in tiles: os.remove(p)
print('wrote', out, 'doors', doors)
