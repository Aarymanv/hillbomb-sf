# Hand-held pedestrian props -> public/assets/peds/props.glb (original models, no third-party content).
# Objects (game space: +X right, +Y up, -Z forward; origin = the hand's grip point):
#   phone + phone_screen (screen faces +Z, UV 0..1 for the runtime screen texture), umb_canopy + umb_frame (open umbrella,
#   grip at the handle, shaft up +Y), umb_closed (furled, hanging tip-down from the hooked handle), cup (paper coffee cup
#   with lid + sleeve, origin mid-height), bag (paper shopping bag hanging from its rope handles), case (briefcase hanging
#   from its handle). Vertex colours carry the part colours (one material per object; the runtime tints canopy / bag).
# usage: tools/.venv-blender/Scripts/python.exe tools/blender/peds/build_props.py
import os, math, sys
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public', 'assets', 'peds', 'props.glb')
TAU = math.pi * 2


def g2b(v): return (v[0], -v[2], v[1])          # game (x, y, z) -> Blender (x, -z, y)


class M:
    """tiny mesh builder in game space with per-face colours"""
    def __init__(self): self.v = []; self.f = []; self.c = []; self.uv = []
    def vert(self, p): self.v.append(tuple(p)); return len(self.v) - 1
    def face(self, idx, col, uv=None): self.f.append(list(idx)); self.c.append(col); self.uv.append(uv)

    def lathe(self, prof, col, segs=24, cap0=False, cap1=False, colf=None):
        base = len(self.v)
        for (r, y) in prof:
            for k in range(segs):
                a = TAU * k / segs
                self.vert((r * math.cos(a), y, r * math.sin(a)))
        n = len(prof)
        for i in range(n - 1):
            c = colf(i) if colf else col
            for k in range(segs):
                a = base + i * segs + k; b = base + i * segs + (k + 1) % segs
                self.face([a, b, b + segs, a + segs], c)
        if cap0: self.face([base + k for k in range(segs)], col)
        if cap1: self.face([base + (n - 1) * segs + k for k in range(segs)][::-1], col)

    def box(self, c, h, col, rot=None):
        idx = []
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    p = Vector((sx * h[0], sy * h[1], sz * h[2]))
                    if rot: p = rot @ p
                    idx.append(self.vert(Vector(c) + p))
        F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        for q in F: self.face([idx[i] for i in q], col)

    def tube(self, pts, r, col, segs=8):
        """tube along a polyline (game space)"""
        rings = []
        for i, p in enumerate(pts):
            p = Vector(p)
            t = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
            a = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
            u = t.cross(a).normalized(); w = t.cross(u)
            rings.append([self.vert(p + (u * math.cos(TAU * k / segs) + w * math.sin(TAU * k / segs)) * r) for k in range(segs)])
        for i in range(len(rings) - 1):
            for k in range(segs):
                self.face([rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]], col)

    def obj(self, name, smooth=True, bevel=0.0, mat=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata([g2b(p) for p in self.v], [], [f for f in self.f])
        me.update()
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)       # outward normals (the builder's winding is not consistent)
        bm.to_mesh(me); bm.free(); me.update()
        ca = me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
        uvl = me.uv_layers.new(name='UVMap') if any(self.uv) else None
        for poly, col, uv in zip(me.polygons, self.c, self.uv):
            for j, li in enumerate(poly.loop_indices):
                ca.data[li].color = (*col, 1.0)
                if uvl and uv: uvl.data[li].uv = uv[j]
        for p in me.polygons: p.use_smooth = smooth
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        if bevel:
            m = o.modifiers.new('bev', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
        if smooth:
            try: me.set_sharp_from_angle(angle=math.radians(40))
            except Exception: pass
        if mat: me.materials.append(mat)
        return o


def mat(name, double=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get('Principled BSDF')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Color'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_backface_culling = not double
    return m


def lin(c): return tuple(((x / 255) ** 2.2) for x in c)


def phone():
    W, H, D, R = 0.0715, 0.1468, 0.0079, 0.0095
    body = M(); scr = M()
    def outline(w, h, r, n=6):
        pts = []
        for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n); pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts
    frame = lin((52, 54, 58)); back = lin((28, 30, 34)); glass = lin((8, 8, 10))
    o = outline(W, H, R)
    layers = [(0.92, -D / 2), (1.0, -D / 2 + 0.0012), (1.0, D / 2 - 0.0012), (0.965, D / 2)]   # chamfered rim
    rings = []
    for s, z in layers:
        rings.append([body.vert((x * s, y * s, z)) for x, y in o])
    n = len(o)
    for i in range(len(rings) - 1):
        col = frame if i == 1 else back if i == 0 else glass
        for k in range(n): body.face([rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]], col)
    body.face(rings[0][::-1], back); body.face(rings[-1], glass)
    # camera bump (back, top-left seen from the back) + lenses, side buttons
    body.box((0.017, 0.054, -D / 2 - 0.0009), (0.0135, 0.0135, 0.0009), lin((40, 42, 46)))
    for dx, dy in ((0.011, 0.060), (0.011, 0.048), (0.023, 0.054)):
        body.lathe([(0.0042, 0), (0.0042, 0.0012), (0.0028, 0.0013)], lin((12, 12, 14)), segs=12, cap1=True)
        # lathe builds around +Y: rotate the last ring set to face -Z at (dx, dy)
        cnt = 3 * 12
        for i in range(len(body.v) - cnt, len(body.v)):
            x, y, z = body.v[i]; body.v[i] = (dx + x, dy + z, -D / 2 - 0.0018 - y)
    body.box((W / 2 + 0.0004, 0.03, 0), (0.0006, 0.009, 0.0018), frame)
    body.box((-W / 2 - 0.0004, 0.038, 0), (0.0006, 0.006, 0.0018), frame)
    body.box((-W / 2 - 0.0004, 0.022, 0), (0.0006, 0.006, 0.0018), frame)
    # screen: inset rounded rect just above the glass, UV 0..1 (u right, v up)
    so = outline(W - 0.005, H - 0.006, R - 0.003)
    c = scr.vert((0, 0, D / 2 + 0.0002))
    ring = [scr.vert((x, y, D / 2 + 0.0002)) for x, y in so]
    def uvof(p): return (p[0] / (W - 0.005) + 0.5, p[1] / (H - 0.006) + 0.5)
    for k in range(len(so)):
        a, b = ring[k], ring[(k + 1) % len(so)]
        scr.face([c, a, b], (1, 1, 1), [uvof(scr.v[c]), uvof(scr.v[a]), uvof(scr.v[b])])
    return body, scr


def umbrella():
    can = M(); fr = M()
    N, R, apex, drop = 8, 0.53, 0.80, 0.27
    rib = lambda i, r: (R * r * math.cos(TAU * i / N), apex - drop * (r ** 1.5) + 0.0, R * r * math.sin(TAU * i / N))
    RS = [0.0, 0.18, 0.36, 0.54, 0.72, 0.86, 1.0]
    FS = [0.0, 0.25, 0.5, 0.75, 1.0]
    for i in range(N):
        grid = []
        for r in RS:
            a, b = Vector(rib(i, r)), Vector(rib(i + 1, r))
            row = []
            for f in FS:
                p = a.lerp(b, f)
                p.y += 0.012 * math.sin(math.pi * f) * r          # fabric bellies a little between the ribs
                if r == 1.0: p.y -= 0.006 * math.sin(math.pi * f)  # scalloped hem
                row.append(can.vert(p))
            grid.append(row)
        for a in range(len(RS) - 1):
            for b in range(len(FS) - 1):
                can.face([grid[a][b], grid[a + 1][b], grid[a + 1][b + 1], grid[a][b + 1]], (1, 1, 1))
    metal = lin((70, 72, 76)); dark = lin((24, 22, 20))
    for i in range(N):
        pts = [Vector(rib(i, r)) - Vector((0, 0.008, 0)) for r in (0.06, 0.4, 0.75, 1.0)]
        fr.tube(pts, 0.0022, metal, segs=4)
        tip = Vector(rib(i, 1.0)); fr.tube([tip, tip + Vector((0, -0.012, 0)) + tip.normalized() * 0.006], 0.0035, dark, segs=5)
        # stretchers from the runner to mid-rib
        fr.tube([Vector((0, apex - 0.22, 0)), Vector(rib(i, 0.42)) - Vector((0, 0.01, 0))], 0.0016, metal, segs=4)
    fr.tube([(0, -0.02, 0), (0, apex + 0.07, 0)], 0.0065, metal, segs=8)
    fr.lathe([(0.012, apex - 0.24), (0.013, apex - 0.22), (0.012, apex - 0.2)], metal, segs=8)          # runner
    fr.lathe([(0.009, apex + 0.005), (0.006, apex + 0.05), (0.002, apex + 0.085)], dark, segs=8, cap1=True)   # top ferrule
    # J handle below the grip
    hook = [(0, 0.0, 0), (0, -0.07, 0)] + [(0.045 - 0.045 * math.cos(a), -0.07 - 0.045 * math.sin(a), 0) for a in [k * math.pi / 8 for k in range(1, 9)]]
    fr.tube(hook, 0.0125, dark, segs=8)
    return can, fr


def umbrella_closed(colr=(1, 1, 1)):
    m = M()
    dark = lin((24, 22, 20)); metal = lin((70, 72, 76))
    # hooked handle up top (the grip), shaft + furled fabric hanging down, tip at the bottom
    hook = [(0.045 - 0.045 * math.cos(a), 0.045 * math.sin(a) - 0.0, 0) for a in [k * math.pi / 8 for k in range(8, -1, -1)]] + [(0, -0.06, 0)]
    m.tube(hook, 0.012, dark, segs=8)
    prof = [(0.008, -0.06), (0.03, -0.12), (0.036, -0.30), (0.03, -0.55), (0.016, -0.75), (0.006, -0.82)]
    m.lathe(prof, colr, segs=10)
    m.box((0.034, -0.36, 0), (0.004, 0.012, 0.012), lin((40, 40, 40)))          # strap
    m.lathe([(0.004, -0.82), (0.003, -0.88), (0.0, -0.885)], metal, segs=6)
    return m


def cup():
    m = M()
    white = lin((236, 232, 224)); sleeve = lin((150, 104, 62)); lid = lin((245, 245, 242))
    prof = [(0.0, -0.065), (0.029, -0.065), (0.031, -0.05), (0.0355, -0.025), (0.0362, 0.0), (0.0405, 0.035), (0.043, 0.06), (0.0445, 0.066)]
    def cf(i): return sleeve if 2 <= i <= 4 else white
    m.lathe(prof, white, segs=24, cap0=False, colf=cf)
    m.lathe([(0.0, -0.065), (0.029, -0.065)][::-1], white, segs=24)
    # sleeve proud of the cup
    m.lathe([(0.0322, -0.042), (0.0345, -0.04), (0.0392, 0.012), (0.0372, 0.014)], sleeve, segs=24)
    # lid: rim, recessed top, sip spout
    m.lathe([(0.0445, 0.064), (0.0475, 0.068), (0.047, 0.076), (0.042, 0.078), (0.04, 0.074), (0.0, 0.074)], lid, segs=24)
    m.box((0.0, 0.079, -0.03), (0.009, 0.004, 0.006), lid)
    return m


def bag():
    m = M()
    body = (1, 1, 1); band = lin((60, 60, 60)); rope = lin((40, 34, 30))
    w, h, d, top = 0.16, 0.18, 0.06, -0.10
    cy = top - h
    m.box((0, cy, 0), (w, h, d), body)
    # folded top band (darker print stripe) + bottom shade
    m.box((0, top - 0.025, 0), (w + 0.002, 0.012, d + 0.002), band)
    # rope handles (front and back)
    for z in (d - 0.004, -d + 0.004):
        pts = [(-0.06, top, z)] + [(-0.06 * math.cos(a), top + 0.095 * math.sin(a), z) for a in [k * math.pi / 8 for k in range(1, 8)]] + [(0.06, top, z)]
        m.tube(pts, 0.004, rope, segs=5)
    return m


def case():
    m = M()
    leather = lin((34, 26, 22)); metal = lin((150, 140, 110)); dark = lin((18, 14, 12))
    w, h, d, top = 0.21, 0.155, 0.045, -0.045
    m.box((0, top - h, 0), (w, h, d), leather)
    m.box((0, top - h, 0), (w + 0.002, 0.004, d + 0.002), dark)                     # seam
    for sx in (-1, 1):
        m.box((sx * 0.11, top - 0.012, d - 0.004), (0.014, 0.01, 0.006), metal)     # latches
        m.box((sx * 0.06, top + 0.004, 0), (0.008, 0.006, 0.012), dark)             # handle lugs
    hdl = [(-0.06, top + 0.008, 0)] + [(-0.055 * math.cos(a), top + 0.008 + 0.04 * math.sin(a), 0) for a in [k * math.pi / 8 for k in range(1, 8)]] + [(0.06, top + 0.008, 0)]
    m.tube(hdl, 0.008, dark, segs=8)
    return m


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {k: mat(k, double=(k == 'umb_canopy')) for k in ('phone', 'phone_screen', 'umb_canopy', 'umb_frame', 'umb_closed', 'cup', 'bag', 'case')}
    pb, ps = phone()
    pb.obj('phone', bevel=0.0, mat=mats['phone']); ps.obj('phone_screen', smooth=False, mat=mats['phone_screen'])
    c, f = umbrella()
    c.obj('umb_canopy', mat=mats['umb_canopy']); f.obj('umb_frame', mat=mats['umb_frame'])
    umbrella_closed().obj('umb_closed', mat=mats['umb_closed'])
    cup().obj('cup', mat=mats['cup'])
    bag().obj('bag', bevel=0.003, mat=mats['bag'])
    case().obj('case', bevel=0.006, mat=mats['case'])
    # apply modifiers so the bevels are exported
    for o in bpy.data.objects:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            with bpy.context.temp_override(object=o): bpy.ops.object.modifier_apply(modifier=md.name)
        print(o.name, len(o.data.polygons), 'faces')
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=True)
    print('wrote', OUT, os.path.getsize(OUT))


if __name__ == '__main__':
    build()
