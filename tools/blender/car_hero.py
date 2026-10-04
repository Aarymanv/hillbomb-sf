"""HILLBOMB hero car detail pass (called by cars.py for the hero / top-traffic ids, input <id>.hero.json).

The JS export (--hero) is the dense loft (_hq2) plus a record for every detail call (patch, seam, head/tail lamps, grille,
mirror, wipers, exhaust, interior, badge ...) and a per-vertex record id ('tag'). This pass replaces the flat decal
versions with modelled geometry, in the three.js car frame (+X right, +Y up, -Z forward, metres):
  * seams (door / hood / tailgate gaps) -> real U-grooves knifed into the paint shell (plus a fuel flap),
  * head / tail lamps -> hole in the paint, recessed housing (bezel, walls, back plate), reflector bowls + projector
    lens + light-guide DRL (head) / light-pipe ring + LED bars (tail), the lens itself -> 'lens' bucket (clear),
  * textured grilles / intakes -> recess + a real honeycomb / slat / bar lattice,
  * window rubber seals along every glass edge, modelled mirrors, wipers, exhaust tips, 3D badges,
  * interior: cabin tub (floor, door cards, firewall), sculpted dash with binnacle + lit gauges + centre screen,
    steering wheel, bucket seats with stitched inserts, rear bench, centre console + shifter, light headliner.
Buckets keep the cars.py layout (uv0 atlas, surf = metal/rough, lamp = lamp group, col = linear vertex colour);
corner normals are carried in a float 'onrm' corner attribute through all edits and written back at the end.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, geometry
from mathutils.bvhtree import BVHTree

WUV = (32 / 1024, 1 - 32 / 1024)
AXI = {'x': 0, 'y': 1, 'z': 2}
AB = {'z': (0, 1), 'x': (2, 1), 'y': (0, 2)}


def srgb(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def F(hexc, m, r, b='details', lamp=0):
    return {'b': b, 'col': srgb(hexc), 'm': m, 'r': r, 'lamp': lamp}


FIN = {
    'blackGloss': F(0x060607, 0.25, 0.14), 'black': F(0x0e0e0f, 0.0, 0.62), 'rubber': F(0x101011, 0.0, 0.82),
    'chrome': F(0xf2f3f6, 1.0, 0.07), 'darkChrome': F(0x585c63, 1.0, 0.16), 'mirror': F(0xb8c2cc, 1.0, 0.03),
    'graphite': F(0x2a2c30, 0.85, 0.35), 'reflector': F(0xe8ebef, 1.0, 0.05), 'housing': F(0x1a1b1e, 0.6, 0.3),
    'grilleBack': F(0x050505, 0.0, 0.9), 'grille': F(0x0c0c0d, 0.3, 0.4), 'ti': F(0xb9b3ab, 1.0, 0.18),
    'soot': F(0x0a0a0a, 0.0, 0.95), 'paint': {'b': 'paint', 'col': (1, 1, 1), 'm': 0, 'r': 0.5, 'lamp': 0},
    # interior (cars pass 4): metalness >= 2 marks an interior material class for the runtime details shader
    # (models.js INTERIOR_GLSL: 3 soft-touch, 4 leather, 5 brushed metal, 6 piano black, 7 fabric / alcantara, 8 carpet);
    # roughness stays the base roughness. Albedos are real-world dark trims (soft-touch grey ~0.05 linear, not 0.025).
    'dash': F(0x3a3c41, 3.0, 0.56), 'dashTop': F(0x2f3034, 3.0, 0.66), 'trimAlu': F(0xb7bbc2, 5.0, 0.28),
    'leather': F(0x37363a, 4.0, 0.46), 'insert': F(0x4a4b52, 7.0, 0.92), 'stitch': F(0xc23a2c, 0.0, 0.6),
    'carpet': F(0x26272a, 8.0, 0.97), 'door': F(0x3d3f45, 3.0, 0.58), 'headliner': F(0x55565c, 0.0, 0.93),
    'wheelRim': F(0x232325, 4.0, 0.5), 'gaugeFace': F(0x07080a, 0.1, 0.35), 'screen': F(0x050608, 0.3, 0.08),
    'piano': F(0x050506, 6.0, 0.05),
}
LAMPF = {
    'head': {'b': 'lamps', 'col': (1.0, 1.0, 1.0), 'm': 0, 'r': 0.2, 'lamp': 1},
    'drl': {'b': 'lamps', 'col': (1.0, 1.0, 1.0), 'm': 0, 'r': 0.2, 'lamp': 8},
    'tail': {'b': 'lamps', 'col': (1.0, 0.03, 0.02), 'm': 0, 'r': 0.25, 'lamp': 2},
    'tailDim': {'b': 'lamps', 'col': (0.16, 0.006, 0.005), 'm': 0.2, 'r': 0.3, 'lamp': 2},
    'brake': {'b': 'lamps', 'col': (1.0, 0.02, 0.015), 'm': 0, 'r': 0.25, 'lamp': 3},
    'gauge': {'b': 'lamps', 'col': (0.55, 0.58, 0.62), 'm': 0, 'r': 0.3, 'lamp': 7},
    'needle': {'b': 'lamps', 'col': (1.0, 0.18, 0.02), 'm': 0, 'r': 0.3, 'lamp': 7},
    'screenLit': {'b': 'lamps', 'col': (0.035, 0.05, 0.075), 'm': 0.2, 'r': 0.1, 'lamp': 9},
}
GRILLE_TEX = {'HONEY', 'SLATS', 'EGG', 'VBARS', 'LOUVER'}


def dvec(d):
    v = [0.0, 0.0, 0.0]; v[AXI[d[1]]] = 1.0 if d[0] == '+' else -1.0
    return Vector(v)


def to2(d, p):
    ia, ib = AB[d[1]]
    return (p[ia], p[ib])


def to3(d, a, b, depth=0.0):
    ia, ib = AB[d[1]]
    v = [0.0, 0.0, 0.0]; v[ia] = a; v[ib] = b; v[AXI[d[1]]] = depth
    return Vector(v)


def pip(pt, poly):
    x, y = pt; ins = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: ins = not ins
    return ins


def area2(poly):
    s = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]; s += x1 * y2 - x2 * y1
    return s / 2


def densify(pts, step, closed):
    out = []; n = len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        k = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step)))
        for j in range(k): out.append((a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k))
    if not closed: out.append(tuple(pts[-1]))
    return out


def seg_dist(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]; L2 = ax * ax + ay * ay or 1e-12
    t = max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / L2))
    return math.hypot(p[0] - a[0] - ax * t, p[1] - a[1] - ay * t)


def line_dist(p, line):
    return min(seg_dist(p, line[i], line[i + 1]) for i in range(len(line) - 1))


def shrink(poly, k):
    cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly)
    return [(cx + (p[0] - cx) * k, cy + (p[1] - cy) * k) for p in poly]


def pca2(poly):
    P = np.array(poly, float); c = P.mean(0); C = np.cov((P - c).T)
    w, V = np.linalg.eigh(C); e = V[:, 1]
    if e[0] < 0: e = -e
    return c, e, np.array([-e[1], e[0]])


# ---------------------------------------------------------------------------------------------------- surface query
class Surf:
    """ray queries against the ORIGINAL outer shell (paint + paint2 + glass), like the JS Projector"""
    def __init__(self, obs):
        V, P = [], []
        for ob in obs:
            if ob is None: continue
            me = ob.data; off = len(V)
            V += [v.co.copy() for v in me.vertices]
            P += [[off + i for i in p.vertices] for p in me.polygons]
        self.t = BVHTree.FromPolygons(V, P)

    def hit(self, d, a, b):
        o = dvec(d)
        org = to3(d, a, b, 0.0) + o * 40.0
        loc, nor, idx, dist = self.t.ray_cast(org, -o, 80.0)
        if loc is None: return None
        if nor.dot(o) < 0: nor = -nor
        return loc, nor

    def ray(self, org, dirv, dist=5.0):
        loc, nor, idx, d = self.t.ray_cast(Vector(org), Vector(dirv).normalized(), dist)
        return loc


# ---------------------------------------------------------------------------------------------------- mesh builder
class Build:
    """accumulates faces per bucket with per-face finish; flush() -> one object per bucket"""
    def __init__(self):
        self.B = {}

    def _b(self, fin):
        k = fin['b']
        if k not in self.B: self.B[k] = {'V': [], 'F': [], 'fin': [], 'uv': [], 'smooth': []}
        return self.B[k]

    def face(self, pts, fin, smooth=True, uvs=None):
        b = self._b(fin); o = len(b['V'])
        b['V'] += [tuple(p) for p in pts]
        b['F'].append(tuple(range(o, o + len(pts)))); b['fin'].append(fin); b['uv'].append(uvs); b['smooth'].append(smooth)

    def grid(self, rows, fin, closed_u=False, flip=False, smooth=True):
        """rows: list of point lists (same length); quads between consecutive rows"""
        b = self._b(fin); o = len(b['V']); n = len(rows[0])
        for r in rows: b['V'] += [tuple(p) for p in r]
        for i in range(len(rows) - 1):
            for j in range(n if closed_u else n - 1):
                j1 = (j + 1) % n
                q = (o + i * n + j, o + i * n + j1, o + (i + 1) * n + j1, o + (i + 1) * n + j)
                b['F'].append(q[::-1] if flip else q); b['fin'].append(fin); b['uv'].append(None); b['smooth'].append(smooth)

    def fan(self, ring, center, fin, flip=False, smooth=False):
        n = len(ring)
        for i in range(n):
            t = (center, ring[i], ring[(i + 1) % n])
            self.face(t[::-1] if flip else t, fin, smooth)

    def flush(self, prefix='hx'):
        out = {}
        for k, b in self.B.items():
            if not b['F']: continue
            me = bpy.data.meshes.new(prefix + '_' + k)
            me.from_pydata(b['V'], [], b['F'])
            me.update(calc_edges=True)
            nl = len(me.loops)
            uv0 = np.zeros((nl, 2), np.float32); uv0[:] = WUV
            surf = np.zeros((nl, 2), np.float32); lamp = np.zeros((nl, 2), np.float32); col = np.ones((nl, 4), np.float32)
            for p in me.polygons:
                f = b['fin'][p.index]; ls = p.loop_start
                for j in range(p.loop_total):
                    surf[ls + j] = (f['m'], f['r']); lamp[ls + j, 0] = f['lamp']; col[ls + j, :3] = f['col']
                    if b['uv'][p.index]: uv0[ls + j] = b['uv'][p.index][j]
                p.use_smooth = b['smooth'][p.index]
            for nm, data in (('uv0', uv0), ('surf', surf), ('lamp', lamp)):
                L = me.uv_layers.new(name=nm); L.data.foreach_set('uv', data.ravel())
            ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', col.ravel())
            me.color_attributes.active_color = ca
            me.set_sharp_from_angle(angle=math.radians(38))
            ob = bpy.data.objects.new(prefix + '_' + k, me)
            bpy.context.scene.collection.objects.link(ob)
            store_normals(ob)
            out[k] = ob
        self.B = {}
        return out


def store_normals(ob):
    """corner normals -> float 'onrm' corner attribute (survives bmesh edits / joins), custom normals cleared"""
    me = ob.data
    n = np.zeros(len(me.loops) * 3, np.float32)
    me.corner_normals.foreach_get('vector', n)
    if 'onrm' in me.attributes: me.attributes.remove(me.attributes['onrm'])
    a = me.attributes.new('onrm', 'FLOAT_VECTOR', 'CORNER'); a.data.foreach_set('vector', n)
    if me.has_custom_normals:
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()


def restore_normals(ob):
    me = ob.data
    if 'onrm' not in me.attributes: return
    n = np.zeros(len(me.loops) * 3, np.float32)
    me.attributes['onrm'].data.foreach_get('vector', n); n = n.reshape(-1, 3)
    # faces flagged 'flat' (grooves, cut edges) use their face normal
    if 'flat' in me.attributes:
        fl = np.zeros(len(me.polygons), np.int8)
        me.attributes['flat'].data.foreach_get('value', fl)
        fn = np.zeros(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('normal', fn); fn = fn.reshape(-1, 3)
        ls = np.zeros(len(me.polygons), np.int32); lt = np.zeros(len(me.polygons), np.int32)
        me.polygons.foreach_get('loop_start', ls); me.polygons.foreach_get('loop_total', lt)
        for i in np.nonzero(fl)[0]: n[ls[i]:ls[i] + lt[i]] = fn[i]
    L = np.linalg.norm(n, axis=1); bad = L < 1e-6
    if bad.any():
        fn = np.zeros(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('normal', fn); fn = fn.reshape(-1, 3)
        lp = np.zeros(len(me.loops), np.int32)
        for p in me.polygons: lp[p.loop_start:p.loop_start + p.loop_total] = p.index
        n[bad] = fn[lp[bad]]; L = np.linalg.norm(n, axis=1)
    z = L < 1e-6; n[z] = (0.0, 1.0, 0.0); L[z] = 1.0
    n /= L[:, None]
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set(n.tolist())
    me.attributes.remove(me.attributes['onrm'])
    if 'flat' in me.attributes: me.attributes.remove(me.attributes['flat'])


def join_into(target, obs):
    obs = [o for o in obs if o is not None]
    if not obs: return target
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in obs: o.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


# ---------------------------------------------------------------------------------------------------- primitives
def frame_from(n, hint=(0, 1, 0)):
    n = Vector(n).normalized(); h = Vector(hint)
    if abs(n.dot(h)) > 0.95: h = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 0, 1))
    u = h.cross(n).normalized(); v = n.cross(u).normalized()
    return u, v, n


def revolve(Bd, c, axis, prof, segs, fin, u=None, v=None, flip=False, smooth=True, phase=0.0, sx=1.0):
    """prof: [(r, h)] around axis through c (h along axis). returns rings"""
    axis = Vector(axis).normalized()
    if u is None: u, v, _ = frame_from(axis)
    rings = []
    for (r, h) in prof:
        ring = []
        for i in range(segs):
            t = phase + 2 * math.pi * i / segs
            ring.append(Vector(c) + axis * h + u * (r * math.cos(t) * sx) + v * (r * math.sin(t)))
        rings.append(ring)
    Bd.grid(rings, fin, closed_u=True, flip=flip, smooth=smooth)
    return rings


def sbox(Bd, c, hx, hy, hz, fin, R=None, e=0.3, nu=24, nv=14, taper=None):
    """superquadric rounded box (exponent e: 0.1 boxy .. 1 ellipsoid); R = 3x3 Matrix; taper(y01) -> (sx, sz)"""
    R = R or Matrix.Identity(3); c = Vector(c)
    def sp(w, m): return math.copysign(abs(w) ** m, w)
    rows = []
    for i in range(nv + 1):
        th = -math.pi / 2 + math.pi * i / nv
        row = []
        for j in range(nu):
            ph = -math.pi + 2 * math.pi * j / nu
            x = sp(math.cos(th), e) * sp(math.cos(ph), e); z = sp(math.cos(th), e) * sp(math.sin(ph), e); y = sp(math.sin(th), e)
            sx = sz = 1.0
            if taper: sx, sz = taper((y + 1) / 2)
            row.append(c + R @ Vector((x * hx * sx, y * hy, z * hz * sz)))
        rows.append(row)
    Bd.grid(rows, fin, closed_u=True, flip=True)
    return rows


def tube(Bd, path, prof, fin, up=None, closed=False, caps=True, smooth=True):
    """sweep closed 2D profile [(u, v)] along 3D path; up(i) gives the v reference"""
    n = len(path); rows = []
    for i in range(n):
        a = path[(i - 1) % n] if closed else path[max(0, i - 1)]; b = path[(i + 1) % n] if closed else path[min(n - 1, i + 1)]
        T = (Vector(b) - Vector(a)).normalized()
        V = Vector(up(i) if up else (0, 1, 0)); V = (V - T * V.dot(T)).normalized()
        U = T.cross(V).normalized()
        rows.append([Vector(path[i]) + U * q[0] + V * q[1] for q in prof])
    if closed: rows.append(rows[0])
    Bd.grid(rows, fin, closed_u=True, flip=False, smooth=smooth)
    if caps and not closed:
        for rw, fl in ((rows[0], True), (rows[-1], False)):
            c = sum(rw, Vector()) / len(rw); Bd.fan(rw, c, fin, flip=fl)
    return rows


def disc(Bd, c, n, r, fin, segs=24, u=None, v=None, sx=1.0):
    u2, v2, _ = frame_from(n)
    u = u or u2; v = v or v2
    ring = [Vector(c) + u * (r * math.cos(2 * math.pi * i / segs) * sx) + v * (r * math.sin(2 * math.pi * i / segs)) for i in range(segs)]
    Bd.fan(ring, Vector(c), fin, flip=True)


# ---------------------------------------------------------------------------------------------------- bmesh utils
def face_tags(ob):
    me = ob.data
    if 'tag' not in me.attributes: return np.zeros(len(me.polygons), np.int32)
    t = np.zeros(len(me.polygons), np.int32); me.attributes['tag'].data.foreach_get('value', t)
    return t


def delete_faces(ob, mask):
    idx = np.nonzero(mask)[0]
    if not len(idx): return 0
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in idx], context='FACES')
    bm.to_mesh(ob.data); bm.free()
    return len(idx)


def split_faces_to(ob, mask, name):
    """move masked faces of ob into a new object (duplicate + delete complementary)"""
    if not mask.any(): return None
    o2 = ob.copy(); o2.data = ob.data.copy(); o2.name = name; o2.data.name = name
    bpy.context.scene.collection.objects.link(o2)
    delete_faces(o2, ~mask); delete_faces(ob, mask)
    return o2


def ensure_flat_attr(bm):
    lay = bm.faces.layers.int.get('flat')
    return lay or bm.faces.layers.int.new('flat')


class Shell:
    """bmesh session over the paint / paint2 objects for knife cuts, holes and grooves"""
    def __init__(self, ob, surf):
        self.ob = ob; self.surf = surf
        self.bm = bmesh.new(); self.bm.from_mesh(ob.data)
        self.flat = ensure_flat_attr(self.bm)
        self.onrm = self.bm.loops.layers.float_vector.get('onrm')

    def layer_faces(self, d, box, tol=0.015):
        """faces on the outer (projected) layer for dir d whose 2D centroid is in box (a0, b0, a1, b1)"""
        o = dvec(d); ax = AXI[d[1]]; out = []
        cache = {}
        for f in self.bm.faces:
            c = f.calc_center_median(); a, b = to2(d, c)
            if a < box[0] or a > box[2] or b < box[1] or b > box[3]: continue
            if f.normal.dot(o) < 0.05: continue
            k = (round(a, 3), round(b, 3))
            h = cache.get(k)
            if h is None: h = cache[k] = self.surf.hit(d, a, b) or False
            if not h: continue
            if abs(c[ax] - h[0][ax]) < tol: out.append(f)
        return out

    def knife(self, d, faces, a, b, off=0.0):
        """bisect faces with the plane through the 2D line a->b (offset along its left normal), extruded along d"""
        ta, tb = b[0] - a[0], b[1] - a[1]; L = math.hypot(ta, tb) or 1e-9
        na, nb = -tb / L, ta / L
        co = to3(d, a[0] + na * off, a[1] + nb * off, 0.0); no = to3(d, na, nb, 0.0)
        fs = [f for f in faces if f.is_valid]
        if not fs: return faces
        es = list({e for f in fs for e in f.edges}); vs = list({v for f in fs for v in f.verts})
        r = bmesh.ops.bisect_plane(self.bm, geom=fs + es + vs, dist=1e-6, plane_co=co, plane_no=no)
        return [g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)]

    def cut_poly(self, d, poly, step=0.03, margin=0.02):
        """knife the polygon outline into the outer layer, delete the faces inside; returns #deleted"""
        a0 = min(p[0] for p in poly) - margin; a1 = max(p[0] for p in poly) + margin
        b0 = min(p[1] for p in poly) - margin; b1 = max(p[1] for p in poly) + margin
        faces = self.layer_faces(d, (a0, b0, a1, b1))
        if not faces: return 0
        ring = densify(poly, step, True)
        for i in range(len(ring)):
            p, q = ring[i], ring[(i + 1) % len(ring)]
            sa0, sa1 = min(p[0], q[0]) - 0.01, max(p[0], q[0]) + 0.01; sb0, sb1 = min(p[1], q[1]) - 0.01, max(p[1], q[1]) + 0.01
            near = []
            for f in faces:
                if not f.is_valid: continue
                cs = [to2(d, v.co) for v in f.verts]
                if max(c[0] for c in cs) < sa0 or min(c[0] for c in cs) > sa1 or max(c[1] for c in cs) < sb0 or min(c[1] for c in cs) > sb1: continue
                near.append(f)
            if near:
                new = self.knife(d, near, p, q)
                faces = [f for f in faces if f.is_valid] + [f for f in new if f not in near]
        faces = list({f for f in faces if f.is_valid})
        dead = [f for f in faces if pip(to2(d, f.calc_center_median()), poly)]
        # faces along the new boundary: flat normals would crease the lip; keep them smooth
        bmesh.ops.delete(self.bm, geom=dead, context='FACES')
        return len(dead)

    def groove(self, d, line, w=0.0065, depth=0.0038, step=0.03):
        pts = densify(line, step, False)
        a0 = min(p[0] for p in pts) - 0.03; a1 = max(p[0] for p in pts) + 0.03
        b0 = min(p[1] for p in pts) - 0.03; b1 = max(p[1] for p in pts) + 0.03
        faces = self.layer_faces(d, (a0, b0, a1, b1), tol=0.02)
        if not faces: return 0
        for i in range(len(pts) - 1):
            p, q = pts[i], pts[i + 1]
            ext = w
            sa0, sa1 = min(p[0], q[0]) - ext, max(p[0], q[0]) + ext; sb0, sb1 = min(p[1], q[1]) - ext, max(p[1], q[1]) + ext
            for off in (-w / 2, -w / 4, 0.0, w / 4, w / 2):
                near = []
                for f in faces:
                    if not f.is_valid: continue
                    cs = [to2(d, v.co) for v in f.verts]
                    if max(c[0] for c in cs) < sa0 or min(c[0] for c in cs) > sa1 or max(c[1] for c in cs) < sb0 or min(c[1] for c in cs) > sb1: continue
                    near.append(f)
                if near:
                    new = self.knife(d, near, p, q, off)
                    faces = [f for f in faces if f.is_valid] + [f for f in new if f not in near]
        faces = list({f for f in faces if f.is_valid})
        self.bm.normal_update()
        vs = {v for f in faces for v in f.verts}
        moved = set()
        for v in vs:
            dd = line_dist(to2(d, v.co), pts)
            if dd <= w / 4 + 2e-4: k = 1.0
            elif dd < w / 2 - 2e-4: k = (w / 2 - dd) / (w / 4)
            else: continue
            n = v.normal if v.normal.length > 0.5 else dvec(d)
            v.co -= n * depth * k; moved.add(v)
        nf = 0
        for f in faces:
            if any(v in moved for v in f.verts): f[self.flat] = 1; nf += 1
        return nf

    def done(self):
        self.bm.to_mesh(self.ob.data); self.bm.free()


# ---------------------------------------------------------------------------------------------------- units
def ring3(surf, d, poly, step=0.01, inset=0.0):
    pts = densify(poly, step, True); out = []
    for (a, b) in pts:
        h = surf.hit(d, a, b)
        if h: out.append((Vector(h[0]), Vector(h[1]), (a, b)))
    return out


def lamp_unit(Bd, surf, d, poly, kind, subs):
    """recessed lamp: bezel, walls, back plate + optics. kind 'head' | 'tail'"""
    R = ring3(surf, d, poly, 0.012)
    if len(R) < 6: return False
    o = dvec(d)
    nav = sum((r[1] for r in R), Vector()).normalized()
    out = (nav + o).normalized()
    c2, e2, m2 = pca2(poly)
    ext = [float(np.dot(np.array(p) - c2, e2)) for p in poly]; exm = [float(np.dot(np.array(p) - c2, m2)) for p in poly]
    W = max(ext) - min(ext); H = max(exm) - min(exm)
    D = max(0.035, min(0.085, 0.45 * min(W, H) + 0.02))
    cen3 = sum((r[0] for r in R), Vector()) / len(R)
    # bezel (gasket) + walls + back plate
    wallF = FIN['housing'] if kind == 'head' else FIN['blackGloss']
    prof = [(-0.003, -0.002), (0.004, -0.002), (0.004, 0.0025), (-0.003, 0.0025)]
    path = [r[0] + r[1] * 0.0012 for r in R]
    tube(Bd, path, prof, FIN['blackGloss'], up=lambda i: R[i][1], closed=True, caps=False)
    rows = [[cen3 + (r[0] - cen3) * k - out * t for r in R] for (t, k) in ((0.0, 1.0), (0.008, 0.99), (D * 0.5, 0.95), (D, 0.86))]
    Bd.grid(rows, wallF, closed_u=True, flip=True)
    back = rows[-1]
    bc = sum(back, Vector()) / len(back)
    tri = geometry.tessellate_polygon([[Vector((q[2][0], q[2][1], 0)) for q in R]])
    bf = FIN['housing'] if kind == 'head' else LAMPF['tailDim']
    for t in tri: Bd.face([back[t[2]], back[t[1]], back[t[0]]], bf, smooth=False)
    u3 = to3(d, e2[0], e2[1], 0).normalized(); u3 = (u3 - out * u3.dot(out)).normalized(); v3 = out.cross(u3).normalized()
    def at2(p2, depth):
        h = surf.hit(d, p2[0], p2[1])
        base = Vector(h[0]) if h else cen3
        return base - out * depth
    if kind == 'head':
        n = max(1, min(3, int(round(W / max(0.075, 1.6 * min(H, 0.12))))))
        ts = [min(ext) + (i + 0.5) * W / n for i in range(n)]
        placed = 0
        for i, t in enumerate(ts):
            p2 = c2 + e2 * t
            if not pip(tuple(p2), poly): continue
            r = max(0.012, min(0.42 * H, 0.45 * W / n, 0.05, D * 0.62))
            cc = at2(p2, D * 0.3)
            # concave reflector bowl (open towards out)
            prof = [(r * math.sin(th), -r * math.cos(th) * 0.85) for th in np.linspace(0.02, 1.45, 8)]
            revolve(Bd, cc, out, prof, 28, FIN['reflector'], flip=False)
            if i == (n - 1) // 2 or placed == 0:
                # projector: chrome can + convex lens (lit)
                rp = r * 0.55
                revolve(Bd, cc, out, [(rp * 1.15, -r * 0.2), (rp * 1.2, 0.004), (rp * 1.02, 0.006)], 28, FIN['chrome'])
                lp = [(rp * math.cos(th), 0.004 + rp * 0.45 * math.sin(th)) for th in np.linspace(0, math.pi / 2, 6)]
                revolve(Bd, cc, out, lp, 28, LAMPF['head'])
            else:
                revolve(Bd, cc, out, [(r * 0.28, -r * 0.3), (r * 0.26, 0.0), (0.0005, 0.002)], 16, LAMPF['head'])
            placed += 1
        # light guide DRL along the upper inside edge (unless the car has its own DRL strip: that one is pushed in)
        if not subs.get('drl'):
            top = [q for q in R if float(np.dot(np.array(q[2]) - c2, m2)) > H * 0.12]
            if len(top) > 4:
                top.sort(key=lambda q: float(np.dot(np.array(q[2]) - c2, e2)))
                pth = [cen3 + (q[0] - cen3) * 0.86 - out * 0.012 for q in top]
                pr = [(0.0035 * math.cos(a), 0.0035 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
                tube(Bd, pth, pr, LAMPF['drl'], up=lambda i: out)
    else:
        # light pipe ring + LED bars
        pth = [cen3 + (q[0] - cen3) * 0.84 - out * 0.013 for q in R[::2]]
        pr = [(0.0042 * math.cos(a), 0.0042 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
        if len(pth) > 5: tube(Bd, pth, pr, LAMPF['tail'], up=lambda i: out, closed=True, caps=False)
        if H > 0.035:
            for off in (-0.22, 0.22) if H > 0.06 else (0.0,):
                seg = []
                for t in np.linspace(min(ext) * 0.7, max(ext) * 0.7, 12):
                    p2 = c2 + e2 * t + m2 * off * H
                    if pip(tuple(p2), poly): seg.append(at2(p2, D * 0.45))
                if len(seg) > 2:
                    pr2 = [(0.006, 0.003), (-0.006, 0.003), (-0.006, -0.003), (0.006, -0.003)]
                    tube(Bd, seg, pr2, LAMPF['brake'], up=lambda i: out)
    return True


def grille_unit(Bd, surf, d, poly, tex, D=0.032):
    R = ring3(surf, d, poly, 0.015)
    if len(R) < 6: return False
    o = dvec(d); nav = sum((r[1] for r in R), Vector()).normalized(); out = (nav + o).normalized()
    cen3 = sum((r[0] for r in R), Vector()) / len(R)
    rows = [[r[0] - out * t for r in R] for t in (0.0, 0.01, D)]
    Bd.grid(rows, FIN['black'], closed_u=True, flip=True)
    back = rows[-1]
    tri = geometry.tessellate_polygon([[Vector((q[2][0], q[2][1], 0)) for q in R]])
    for t in tri: Bd.face([back[t[2]], back[t[1]], back[t[0]]], FIN['grilleBack'], smooth=False)
    a0 = min(p[0] for p in poly); a1 = max(p[0] for p in poly); b0 = min(p[1] for p in poly); b1 = max(p[1] for p in poly)
    inner = shrink(poly, 0.97)
    def P3(a, b, dep):
        h = surf.hit(d, a, b)
        if not h: return None
        return Vector(h[0]) - out * dep
    t2 = [Vector((0, 0, 0))]
    if tex in ('HONEY', 'EGG'):
        cs = 0.026 if tex == 'HONEY' else 0.03
        hexr = cs * 0.5; dy = cs * 0.87
        j = 0; b = b0 + dy * 0.5
        while b < b1:
            a = a0 + (cs * 0.5 if j % 2 else 0.0)
            while a < a1:
                if pip((a, b), inner):
                    c = P3(a, b, 0.012)
                    if c is not None:
                        n6 = 6 if tex == 'HONEY' else 4
                        ringO = []; ringI = []
                        for k in range(n6):
                            th = math.pi / 6 + 2 * math.pi * k / n6 if n6 == 6 else math.pi / 4 + 2 * math.pi * k / 4
                            ca, sb = math.cos(th), math.sin(th)
                            ringO.append(c + to3(d, ca * hexr, sb * hexr, 0))
                            ringI.append(c + to3(d, ca * hexr * 0.72, sb * hexr * 0.72, 0))
                        # frame: front face ring + inner wall
                        Bd.grid([ringO, ringI], FIN['grille'], closed_u=True, flip=d[0] == '+')
                        Bd.grid([ringI, [p - out * 0.012 for p in ringI]], FIN['grille'], closed_u=True, flip=d[0] == '+')
                a += cs
            b += dy; j += 1
    else:
        vertical = tex == 'VBARS'
        span = (a0, a1) if vertical else (b0, b1)
        pitch = 0.03 if vertical else 0.024
        t = span[0] + pitch * 0.5
        while t < span[1]:
            seg = []
            for s in np.linspace(0, 1, 16):
                a, b = (t, b0 + (b1 - b0) * s) if vertical else (a0 + (a1 - a0) * s, t)
                if pip((a, b), inner):
                    c = P3(a, b, 0.01)
                    if c is not None: seg.append(c)
            if len(seg) > 1:
                pr = [(0.004, 0.0), (0.0, 0.009), (-0.004, 0.0), (0.0, -0.009)] if not vertical else [(0.0, 0.004), (0.009, 0.0), (0.0, -0.004), (-0.009, 0.0)]
                tube(Bd, seg, pr, FIN['grille'], up=lambda i: out)
            t += pitch
    return True


def seal_glass(Bd, glass):
    """black rubber gasket along every boundary loop of the glass"""
    bm = bmesh.new(); bm.from_mesh(glass.data); bm.normal_update()
    bnd = [e for e in bm.edges if e.is_boundary]
    seen = set(); loops = []
    adj = {}
    for e in bnd:
        for v in e.verts: adj.setdefault(v, []).append(e)
    for e0 in bnd:
        if e0 in seen: continue
        loop = [e0.verts[0], e0.verts[1]]; seen.add(e0)
        while True:
            v = loop[-1]; nxt = None
            for e in adj.get(v, []):
                if e not in seen: nxt = e; break
            if nxt is None: break
            seen.add(nxt); w = nxt.other_vert(v)
            if w == loop[0]: break
            loop.append(w)
        if len(loop) >= 6: loops.append(loop)
    n = 0
    for loop in loops:
        pts = [v.co.copy() for v in loop]; nrm = [v.normal.copy() for v in loop]
        L = sum((pts[i] - pts[i - 1]).length for i in range(len(pts)))
        if L < 0.25: continue
        prof = [(-0.005, -0.0015), (0.0055, -0.0015), (0.0065, 0.0012), (0.004, 0.0032), (-0.003, 0.0032), (-0.006, 0.0012)]
        tube(Bd, pts, prof, FIN['rubber'], up=lambda i: nrm[i], closed=True, caps=False)
        n += 1
    bm.free()
    return n


def mirror_unit(Bd, r, s, x0):
    L, Hh, Dd = r['len'], r['h'], r['d']
    cx = x0 + s * (0.05 + L * 0.5); cy = r['y'] + 0.03; cz = r['z']
    Rm = (Matrix.Rotation(s * 0.05, 3, 'Z') @ Matrix.Rotation(s * 0.1, 3, 'Y'))
    fin = FIN['paint'] if r['paint'] else FIN['blackGloss']
    # housing: rounded front, flatter back (mirror face towards +z = rear), tapered towards the door
    sbox(Bd, (cx, cy, cz - 0.004), L * 0.5, Hh * 0.5, Dd * 0.5, fin, R=Rm, e=0.42, nu=28, nv=16,
         taper=lambda y: (1.0, 1.0))
    # mirror glass recessed in the rear face
    c = Vector((cx, cy, cz)) + Rm @ Vector((0, 0, Dd * 0.5 - 0.004))
    u = Rm @ Vector((1, 0, 0)); v = Rm @ Vector((0, 1, 0)); n = Rm @ Vector((0, 0, 1))
    ring = []
    for k in range(32):
        t = 2 * math.pi * k / 32; ct, st = math.cos(t), math.sin(t)
        ex = math.copysign(abs(ct) ** 0.4, ct) * L * 0.43; ey = math.copysign(abs(st) ** 0.4, st) * Hh * 0.38
        ring.append(c + u * ex + v * ey + n * 0.002)
    Bd.fan(ring, c + n * 0.002, FIN['mirror'], flip=False)
    Bd.grid([ring, [c + (p - c) * 1.06 + n * 0.004 for p in ring]], FIN['blackGloss'], closed_u=True)
    # stalk (tapered, from the door skin to the housing)
    a = Vector((x0 - s * 0.005, r['y'] - 0.005, cz - 0.01)); b = Vector((cx - s * L * 0.35, cy - 0.01, cz - 0.004))
    path = [a.lerp(b, t) for t in np.linspace(0, 1, 5)]
    tube(Bd, path, [(0.012, 0.018), (-0.012, 0.018), (-0.014, -0.012), (0.014, -0.012)], FIN['blackGloss'], up=lambda i: (0, 0, 1))


def wiper_unit(Bd, w):
    p = Vector(w['p']); n = Vector(w['n']).normalized()
    # arm direction: x axis rotated by ang about the glass normal, kept in the glass plane
    dx = Matrix.Rotation(w['ang'], 3, n) @ Vector((1, 0, 0)); dx = (dx - n * dx.dot(n)).normalized()
    side = n.cross(dx).normalized()
    L = w['len']
    # pivot cap
    revolve(Bd, p + n * 0.004, n, [(0.013, 0.0), (0.014, 0.012), (0.009, 0.018), (0.0005, 0.019)], 16, FIN['black'])
    # arm: tapered, arched slightly above the glass
    arm = [p + dx * (L * t) + n * (0.016 + 0.012 * math.sin(math.pi * min(1, t * 1.4))) for t in np.linspace(0, 0.92, 10)]
    tube(Bd, arm, [(0.006, 0.003), (-0.006, 0.003), (-0.006, -0.003), (0.006, -0.003)], FIN['black'], up=lambda i: n)
    # blade: spine + rubber, parallel to the glass
    b0 = p + dx * (L * 0.08) + side * 0.012
    blade = [b0 + dx * (L * t) + n * 0.007 for t in np.linspace(0, 0.9, 12)]
    tube(Bd, blade, [(0.004, 0.006), (-0.004, 0.006), (-0.0012, -0.004), (0.0012, -0.004)], FIN['rubber'], up=lambda i: n)
    # clip joining arm tip and blade
    mid = blade[6]; tip = arm[-1]
    tube(Bd, [tip, mid], [(0.005, 0.004), (-0.005, 0.004), (-0.005, -0.004), (0.005, -0.004)], FIN['black'], up=lambda i: n)


def exhaust_unit(Bd, e):
    r = e['r']; z1 = e['z1']; c = Vector((e['x'], e['y'], z1)); ax = Vector((0, 0, 1))
    sx = 1.5 if e['oval'] else 1.0
    L = min(0.12, e['z1'] - e['z0'])
    wall = 0.0026
    prof = [(r * 0.92, -L), (r, -L * 0.6), (r, -0.006), (r - 0.0005, -0.001), (r - wall * 0.5, 0.0015), (r - wall, -0.001), (r - wall, -0.012)]
    revolve(Bd, c, ax, prof, 32, FIN['ti'], sx=sx)
    revolve(Bd, c, ax, [(r - wall, -0.012), (r - wall, -0.05), (0.0005, -0.052)], 24, FIN['soot'], sx=sx)
    # inner perforated baffle ring
    revolve(Bd, c, ax, [(r * 0.55, -0.03), (r * 0.55, -0.034), (0.0005, -0.036)], 20, FIN['graphite'], sx=sx)


def badge_unit(Bd, surf, r):
    h = surf.hit(r['dir'], r['x'], r['y'])
    if not h: return
    p, n = Vector(h[0]), Vector(h[1])
    u, v, n = frame_from(n)
    R = r['r']
    c = p + n * 0.002
    # ring (torus-ish) + chevron (fictional HILLBOMB hill mark), polished chrome
    ring = []
    for k in range(40):
        t = 2 * math.pi * k / 40; ring.append(c + (u * math.cos(t) + v * math.sin(t)) * R * 0.8)
    tube(Bd, ring, [(0.0, R * 0.09), (R * 0.07, 0.0), (0.0, -R * 0.02), (-R * 0.07, 0.0)], FIN['chrome'], up=lambda i: n, closed=True, caps=False)
    chev = [(-0.6, -0.3), (0.0, 0.42), (0.6, -0.3), (0.38, -0.3), (0.0, 0.12), (-0.38, -0.3)]
    f = [c + u * (a * R) + v * (b * R) + n * (R * 0.08) for a, b in chev]
    bk = [c + u * (a * R) + v * (b * R) for a, b in chev]
    for t in geometry.tessellate_polygon([[Vector((a, b, 0)) for a, b in chev]]):
        Bd.face([f[t[0]], f[t[1]], f[t[2]]], FIN['chrome'], smooth=False)
    Bd.grid([bk + [bk[0]], f + [f[0]]], FIN['chrome'], smooth=False)
    disc(Bd, c - n * 0.0005, n, R * 0.8, FIN['blackGloss'], 32, u, v)


# ---------------------------------------------------------------------------------------------------- interior
def interior_unit(Bd, surf, IR, meta, parts, Bt):
    eye = IR['eye']; ex, ey, ez = eye
    dashZ, dz1, dwh, dTop, dBot = IR['dashZ'], IR['dz1'], IR['dwh'], IR['dTop'], IR['dBot']
    seats = IR.get('seats') or []; rear = IR.get('rear')
    belt = dTop + 0.02
    zA = dashZ - 0.02
    zB = (rear['z'] + 0.2) if rear else ((max(s['z'] for s in seats) + 0.42) if seats else ez + 0.5)
    zB = min(zB, meta['gh']['zE1'] - 0.05)
    bot = min(s['bot'] for s in seats) if seats else belt - 0.5
    # floor height from the body floor (ray down from inside)
    fl = surf.ray((0.0, belt - 0.05, (zA + zB) / 2), (0, -1, 0), 2.0)
    yF = max((fl.y + 0.06) if fl is not None else bot - 0.12, bot - 0.14)
    # --- remove the flat cabin tray (topIn) between zA..zB, recolour the headliner
    det = parts['details']; me = det.data
    fn = np.zeros(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('normal', fn); fn = fn.reshape(-1, 3)
    fc = np.zeros(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('center', fc); fc = fc.reshape(-1, 3)
    col = np.zeros(len(me.loops) * 4, np.float32); me.color_attributes['col'].data.foreach_get('color', col); col = col.reshape(-1, 4)
    ls = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', ls)
    fcol = col[ls, :3]
    icol = np.array(srgb(0x1c1c1e))
    isint = np.abs(fcol - icol).sum(1) < 0.004
    tray = isint & (fn[:, 1] > 0.6) & (fc[:, 2] > zA - 0.03) & (fc[:, 2] < zB) & (fc[:, 1] < belt + 0.08) & (fc[:, 1] > belt - 0.25)
    liner = isint & (fc[:, 1] > belt + 0.05)
    hl = np.array(FIN['headliner']['col'])
    if liner.any():
        lt = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_total', lt)
        for i in np.nonzero(liner)[0]: col[ls[i]:ls[i] + lt[i], :3] = hl
        me.color_attributes['col'].data.foreach_set('color', col.ravel())
    delete_faces(det, tray)
    # --- tub: door cards (inner walls), floor, firewall, rear bulkhead
    zs = list(np.arange(zA, zB + 1e-4, 0.04)); ys = list(np.linspace(yF, belt + 0.012, 9))
    xw = []
    for z in zs:
        row = []
        for y in ys:
            h = surf.ray((0.0, y, z), (1, 0, 0), 2.0)
            row.append((h.x - 0.028) if h is not None else (row[-1] if row else dwh))
        xw.append(row)
    for s in (1, -1):
        rows = [[Vector((s * xw[i][j], ys[j], zs[i])) for j in range(len(ys))] for i in range(len(zs))]
        # colour: carpet low, door trim above
        lower = [[p for p in r[:4]] for r in rows]; upper = [[p for p in r[3:]] for r in rows]
        Bt.grid(lower, FIN['carpet'], flip=s < 0)
        Bt.grid(upper, FIN['door'], flip=s < 0)
        # armrest + pull handle on the front door
        if seats:
            sz = seats[0]['z']
            j = 6; i = min(len(zs) - 1, max(0, int((sz - 0.15 - zA) / 0.04)))
            xa = s * (xw[i][j] - 0.035)
            sbox(Bd, (xa, ys[j] - 0.02, sz - 0.12), 0.035, 0.025, 0.22, FIN['leather'], e=0.35, nu=16, nv=8)
            sbox(Bd, (s * (xw[i][j + 1] - 0.012), ys[j + 1] + 0.005, sz - 0.38), 0.008, 0.012, 0.05, FIN['trimAlu'], e=0.4, nu=12, nv=6)
            # speaker grille low on the door
            i2 = min(len(zs) - 1, max(0, int((sz - 0.55 - zA) / 0.04)))
            disc(Bd, (s * (xw[i2][2] - 0.004), ys[2], zs[i2]), (-s, 0, 0), 0.065, FIN['grilleBack'], 24)
    # floor
    rows = [[Vector((xw[i][0] * (-1 + 2 * k / 8), yF, zs[i])) for k in range(9)] for i in range(len(zs))]
    Bt.grid(rows, FIN['carpet'], flip=True)
    # firewall (below the dash) and rear bulkhead
    for z, fl2, yt in ((zA, False, dBot + 0.02), (zB, True, belt + 0.012)):
        i = 0 if z == zA else len(zs) - 1
        rows = [[Vector((xw[i][min(j, len(ys) - 1)] * (-1 + 2 * k / 8), y, z)) for k in range(9)] for j, y in enumerate(np.linspace(yF, yt, 5))]
        Bt.grid(rows, FIN['carpet'] if z == zA else FIN['door'], flip=fl2)
    # --- dashboard: lofted section across x
    prof = []
    for (zz, yy) in ((dashZ - 0.01, dBot - 0.06), (dashZ, dTop - 0.03), (dashZ + 0.03, dTop), (dashZ + (dz1 - dashZ) * 0.5, dTop + 0.004),
                     (dz1 - 0.07, dTop - 0.004), (dz1 - 0.025, dTop - 0.02), (dz1, dTop - 0.055), (dz1 + 0.005, dTop - 0.1),
                     (dz1 - 0.03, dBot + 0.01), (dz1 - 0.09, dBot - 0.1)):
        prof.append((zz, yy))
    rows = []
    for k in range(41):
        x = -dwh + 2 * dwh * k / 40; ed = min(1.0, (dwh - abs(x)) / 0.08)
        sq = 0.35 + 0.65 * math.sqrt(max(0.0, ed))
        zc = (dashZ + dz1) / 2; yc = (dTop + dBot) / 2
        rows.append([Vector((x, yc + (yy - yc) * sq, zc + (zz - zc) * (0.6 + 0.4 * sq))) for (zz, yy) in prof])
    Bd.grid(rows, FIN['dash'], flip=False)
    for rw, fl2 in ((rows[0], True), (rows[-1], False)):
        c = sum(rw, Vector()) / len(rw); Bd.fan(rw, c, FIN['dash'], flip=fl2)
    # trim strip across the dash face
    strip = [Vector((-dwh * 0.96 + 2 * dwh * 0.96 * k / 30, dTop - 0.075, dz1 + 0.004)) for k in range(31)]
    tube(Bd, strip, [(0.0, 0.006), (0.004, 0.0), (0.0, -0.006), (-0.002, 0.0)], FIN['trimAlu'], up=lambda i: (0, 1, 0))
    # --- instrument binnacle + gauges (driver side), facing the eye
    wx, wy, wz = IR.get('wheel') or (ex, dTop - 0.1, dz1 + 0.35)
    wy = min(wy, ey - 0.36)   # driver's wheel sits well below the eye line (the JS one blocked the road)
    gc = Vector((ex, dTop - 0.04, dz1 - 0.035))
    toE = (Vector(eye) - gc).normalized()
    u, v, n = frame_from(toE)
    hood = []
    for k in range(17):
        t = math.pi * k / 16
        hood.append([gc + u * (0.19 * math.cos(t)) + v * (0.075 * math.sin(t) + 0.005) + n * dd for dd in (-0.06, 0.035)])
    Bd.grid([[h[0] for h in hood], [h[1] for h in hood]], FIN['dashTop'], flip=True)
    for gx, gr in ((-0.085, 0.056), (0.085, 0.056)):
        c = gc + u * gx - v * 0.01
        disc(Bd, c, n, gr, FIN['gaugeFace'], 36, u, v)
        revolve(Bd, c, n, [(gr, -0.002), (gr * 1.06, 0.004), (gr * 1.1, 0.0)], 36, FIN['trimAlu'])
        for k in range(31):
            t = math.radians(225 - 270 * k / 30)
            big = k % 5 == 0
            r0, r1 = gr * (0.78 if big else 0.84), gr * 0.93
            w2 = 0.0016 if big else 0.001
            d0 = u * math.cos(t) + v * math.sin(t); dp = u * -math.sin(t) + v * math.cos(t)
            q = [c + d0 * r0 - dp * w2 + n * 0.0006, c + d0 * r1 - dp * w2 + n * 0.0006, c + d0 * r1 + dp * w2 + n * 0.0006, c + d0 * r0 + dp * w2 + n * 0.0006]
            Bd.face(q, LAMPF['gauge'] if not (gx > 0 and k > 24) else LAMPF['needle'], smooth=False)
        t = math.radians(200); d0 = u * math.cos(t) + v * math.sin(t); dp = u * -math.sin(t) + v * math.cos(t)
        Bd.face([c - dp * 0.0015 + n * 0.0015, c + d0 * gr * 0.85 + n * 0.0015, c + dp * 0.0015 + n * 0.0015], LAMPF['needle'], smooth=False)
        disc(Bd, c + n * 0.002, n, 0.007, FIN['black'], 12, u, v)
    # centre screen + vents
    sc = Vector((0.0, dTop - 0.07, dz1 + 0.012)); sn = (Vector((0, 0.25, 1))).normalized()
    su, sv, sn = frame_from(sn)
    q = [sc + su * a + sv * b for a, b in ((-0.12, -0.065), (0.12, -0.065), (0.12, 0.065), (-0.12, 0.065))]
    Bd.face(q, LAMPF['screenLit'], smooth=False)
    Bd.grid([q + [q[0]], [p + sn * -0.012 + (p - sc) * 0.06 for p in q + [q[0]]]], FIN['piano'], smooth=False)
    for vx in (-0.3, 0.3, -dwh + 0.12, dwh - 0.12):
        vc = Vector((vx, dTop - 0.05, dz1 + 0.006))
        for k in range(4):
            yy = -0.018 + 0.012 * k
            Bd.face([vc + Vector((-0.05, yy - 0.003, 0.002)), vc + Vector((0.05, yy - 0.003, 0.002)), vc + Vector((0.05, yy + 0.003, 0.0)), vc + Vector((-0.05, yy + 0.003, 0.0))], FIN['graphite'], smooth=False)
        Bd.face([vc + Vector((-0.055, -0.026, -0.001)), vc + Vector((0.055, -0.026, -0.001)), vc + Vector((0.055, 0.026, -0.001)), vc + Vector((-0.055, 0.026, -0.001))], FIN['grilleBack'], smooth=False)
    # --- steering wheel (tilted like the JS one: -0.45 rad about X)
    wc = Vector((wx, wy, wz)); Rw = Matrix.Rotation(-0.45, 3, 'X')
    ax = Rw @ Vector((0, 0, 1)); wu = Rw @ Vector((1, 0, 0)); wv = Rw @ Vector((0, 1, 0))
    rim = [wc + (wu * math.cos(2 * math.pi * k / 48) + wv * math.sin(2 * math.pi * k / 48)) * 0.178 for k in range(48)]
    pr = [(0.017 * math.cos(a) * (1.0 if math.cos(a) > 0 else 0.8), 0.013 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)]
    tube(Bd, rim, pr, FIN['wheelRim'], up=lambda i: ax, closed=True, caps=False)
    for ang, wdt in ((0.0, 0.03), (math.pi, 0.03), (-math.pi / 2, 0.036)):
        d0 = wu * math.cos(ang) + wv * math.sin(ang)
        path = [wc + d0 * t - ax * 0.012 * (1 - t / 0.17) for t in np.linspace(0.05, 0.168, 4)]
        tube(Bd, path, [(wdt / 2, 0.006), (-wdt / 2, 0.006), (-wdt / 2, -0.008), (wdt / 2, -0.008)], FIN['dash'], up=lambda i: ax)
    revolve(Bd, wc - ax * 0.03, ax, [(0.058, 0.0), (0.066, 0.016), (0.062, 0.03), (0.045, 0.036), (0.0005, 0.038)], 24, FIN['wheelRim'])
    revolve(Bd, wc - ax * 0.03, ax, [(0.012, 0.038), (0.012, 0.039), (0.0005, 0.0395)], 12, FIN['trimAlu'])
    col0 = wc - ax * 0.03; col1 = wc - ax * 0.28 - Vector((0, 0.02, 0))
    tube(Bd, [col0, col1], [(0.03 * math.cos(a), 0.03 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)], FIN['dashTop'], up=lambda i: (0, 1, 0))
    for s in (-1, 1):   # shift paddles
        pc = wc + wu * (s * 0.12) + wv * 0.03 - ax * 0.045
        sbox(Bd, pc, 0.035, 0.05, 0.004, FIN['trimAlu'], R=Rw, e=0.3, nu=12, nv=6)
    # --- seats
    for st in seats:
        seat_unit(Bd, st, yF)
    if rear: bench_unit(Bd, rear, yF)
    # --- centre console + shifter
    if seats:
        zc0, zc1 = dz1 - 0.05, max(s['z'] for s in seats) + 0.05
        ytop = max(yF + 0.2, (seats[0]['bot'] + 0.12))
        sbox(Bd, (0.0, (yF + ytop) / 2, (zc0 + zc1) / 2), 0.1, (ytop - yF) / 2, (zc1 - zc0) / 2, FIN['dash'], e=0.2, nu=20, nv=10)
        sbox(Bd, (0.0, ytop + 0.012, zc1 - 0.18), 0.085, 0.015, 0.14, FIN['leather'], e=0.3, nu=16, nv=8)
        sp = Vector((0.0, ytop + 0.01, (zc0 + zc1) / 2 - 0.08))
        sbox(Bd, (0.0, ytop + 0.004, sp.z + 0.03), 0.075, 0.006, 0.1, FIN['piano'], e=0.15, nu=16, nv=6)   # piano-black shifter panel
        revolve(Bd, sp, (0, 1, 0), [(0.045, 0.0), (0.04, 0.02), (0.02, 0.05), (0.012, 0.09)], 16, FIN['rubber'])
        sbox(Bd, sp + Vector((0, 0.11, 0)), 0.024, 0.028, 0.024, FIN['trimAlu'], e=0.6, nu=16, nv=10)
        for cz in (sp.z - 0.12, sp.z - 0.2):
            disc(Bd, (0.0, ytop + 0.0005, cz), (0, 1, 0), 0.036, FIN['grilleBack'], 20)


def seat_unit(Bd, st, yF):
    x, z, w, top, bot = st['x'], st['z'], st['w'], st['top'], st['bot']
    hTop = st.get('hTop', top + 0.15)
    tilt = Matrix.Rotation(0.2, 3, 'X')
    cyB = (top + bot) / 2 + 0.02; hB = (top - bot) / 2
    # backrest centre (insert) + shell + bolsters
    sbox(Bd, (x, cyB, z + 0.01), w * 0.33, hB * 0.92, 0.055, FIN['leather'], R=tilt, e=0.28, nu=24, nv=16)
    ins = Vector((x, cyB, z - 0.047))
    sbox(Bd, ins, w * 0.2, hB * 0.78, 0.012, FIN['insert'], R=tilt, e=0.18, nu=20, nv=16)
    for s in (-1, 1):
        sbox(Bd, (x + s * w * 0.36, cyB - 0.02, z - 0.035), w * 0.09, hB * 0.84, 0.075, FIN['leather'], R=tilt @ Matrix.Rotation(-s * 0.22, 3, 'Y'), e=0.4, nu=18, nv=14)
        # stitch lines along the insert edges (contrast thread)
        a = Vector((x + s * w * 0.205, cyB - hB * 0.72, z - 0.061)); b = Vector((x + s * w * 0.205, cyB + hB * 0.72, z - 0.061))
        a = Vector((x, cyB, z)) + tilt @ (a - Vector((x, cyB, z))); b = Vector((x, cyB, z)) + tilt @ (b - Vector((x, cyB, z)))
        for k in range(22):
            p0 = a.lerp(b, (k + 0.1) / 22); p1 = a.lerp(b, (k + 0.6) / 22)
            dx = Vector((0.0012, 0, 0))
            Bd.face([p0 - dx, p0 + dx, p1 + dx, p1 - dx], FIN['stitch'], smooth=False)
    # horizontal channels on the insert
    for k in range(1, 5):
        yy = cyB - hB * 0.7 + hB * 1.4 * k / 5
        p = Vector((x, yy, z - 0.061)); p = Vector((x, cyB, z)) + tilt @ (p - Vector((x, cyB, z)))
        Bd.face([p + Vector((-w * 0.19, -0.002, 0)), p + Vector((w * 0.19, -0.002, 0)), p + Vector((w * 0.19, 0.002, 0)), p + Vector((-w * 0.19, 0.002, 0))], FIN['black'], smooth=False)
    # headrest
    if hTop > top + 0.05:
        sbox(Bd, (x, (top + hTop) / 2 + 0.01, z + 0.05), w * 0.26, (hTop - top) / 2, 0.05, FIN['leather'], R=tilt, e=0.45, nu=20, nv=12)
    # cushion + side bolsters
    cy = bot + 0.06; cz = z - 0.28
    sbox(Bd, (x, cy, cz), w * 0.3, 0.06, 0.24, FIN['leather'], e=0.3, nu=24, nv=12)
    sbox(Bd, (x, cy + 0.045, cz), w * 0.19, 0.02, 0.2, FIN['insert'], e=0.2, nu=20, nv=8)
    for s in (-1, 1):
        sbox(Bd, (x + s * w * 0.38, cy + 0.02, cz + 0.01), w * 0.09, 0.075, 0.23, FIN['leather'], R=Matrix.Rotation(s * 0.18, 3, 'Z'), e=0.45, nu=16, nv=10)
    # base / runners down to the floor
    sbox(Bd, (x, (yF + cy - 0.05) / 2, cz), w * 0.3, max(0.02, (cy - 0.05 - yF) / 2), 0.2, FIN['black'], e=0.2, nu=12, nv=6)


def bench_unit(Bd, r, yF):
    z, w, top, bot = r['z'], r['w'], r['top'], r['bot']
    tilt = Matrix.Rotation(0.25, 3, 'X')
    cyB = (top + bot) / 2 + 0.02; hB = (top - bot) / 2
    for s in (-1, 1):
        sbox(Bd, (s * w * 0.25, cyB, z), w * 0.23, hB * 0.92, 0.06, FIN['leather'], R=tilt, e=0.3, nu=22, nv=14)
        sbox(Bd, (s * w * 0.25, cyB, z - 0.058), w * 0.15, hB * 0.72, 0.012, FIN['insert'], R=tilt, e=0.2, nu=18, nv=12)
        sbox(Bd, (s * w * 0.25, bot + 0.06, z - 0.27), w * 0.23, 0.065, 0.23, FIN['leather'], e=0.3, nu=22, nv=12)
    if r.get('hTop', 0) > top + 0.05:
        for x in (-0.42, 0.42):
            sbox(Bd, (x, (top + r['hTop']) / 2 + 0.01, z + 0.06), 0.12, (r['hTop'] - top) / 2, 0.045, FIN['leather'], R=tilt, e=0.45, nu=16, nv=10)


# ---------------------------------------------------------------------------------------------------- driver
def detail(parts, D, log=print):
    recs = {r['id']: r for r in (D.get('rec') or [])}
    meta = D['meta']
    def chain(t):
        out = []; seen = 0
        while t and t in recs and seen < 20: out.append(recs[t]); t = recs[t].get('parent', 0); seen += 1
        return out
    for k, ob in parts.items(): store_normals(ob)
    surf = Surf([parts.get('paint'), parts.get('paint2'), parts.get('glass')])
    Bd = Build(); extra = []
    st = {'grooves': 0, 'lamps': 0, 'grilles': 0, 'seals': 0}
    # ---- classify patch records
    patches = [r for r in recs.values() if r['k'] == 'patch' and r.get('fin')]
    units = []
    for r in patches:
        f = r['fin']
        if f['b'] == 'lamps' and f['lamp'] in (1, 2) and r['dir'] in ('-z', '+z') and not r.get('strip') and abs(area2(r['poly'])) > 0.0012:
            units.append({'rec': r, 'kind': 'head' if f['lamp'] == 1 else 'tail', 'subs': {}})
    subs = set()
    for r in patches:
        f = r['fin']
        if f['b'] != 'lamps' or any(u['rec'] is r for u in units): continue
        c = (sum(p[0] for p in r['poly']) / len(r['poly']), sum(p[1] for p in r['poly']) / len(r['poly']))
        for u in units:
            if u['rec']['dir'] == r['dir'] and pip(c, u['rec']['poly']):
                subs.add(r['id']); u['subs'].setdefault('drl' if f['lamp'] == 8 else 'other', []).append(r); break
    grilles = [r for r in patches if r['fin']['b'] == 'details' and r['fin'].get('tex') in GRILLE_TEX and not r.get('strip') and r['dir'] in ('-z', '+z')]
    surrounds = set()
    for r in recs.values():
        if r['k'] == 'grille':
            for c in patches:
                if c.get('parent') == r['id'] and not c['fin'].get('tex'): surrounds.add(c['id'])
    # ---- paint shell: holes (lamps, grilles) + grooves
    unit_ok = []; grille_ok = []
    for key in ('paint', 'paint2'):
        ob = parts.get(key)
        if ob is None: continue
        sh = Shell(ob, surf)
        for u in units:
            n = sh.cut_poly(u['rec']['dir'], u['rec']['poly'])
            if n: u['cut'] = True
        for g in grilles:
            n = sh.cut_poly(g['dir'], g['poly'])
            if n: g['_cut'] = True
        for r in recs.values():
            if r['k'] == 'seam' and r.get('gap'):
                st['grooves'] += sh.groove(r['dir'], r['line'], w=max(0.005, r['w']))
        if key == 'paint' and meta.get('gh'):
            # fuel flap on the right rear quarter (skipped when a groove is already there)
            zf = meta['axleRZ'] - 0.62; hh = surf.hit('+x', zf, 0.0)
            yb = None
            for yy in np.linspace(1.2, 0.3, 40):
                h = surf.hit('+x', zf, float(yy))
                if h and h[1].x > 0.75: yb = float(yy); break
            if yb:
                yc = yb - 0.1
                circ = [(zf + 0.068 * math.cos(t), yc + 0.068 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 25)]
                st['grooves'] += sh.groove('+x', circ, w=0.005, depth=0.003, step=0.02)
        sh.done()
    # ---- decals to drop (details / lamps faces by record)
    drop_kinds = {'mirror', 'wipers', 'exhaust', 'interior', 'badge'}
    grille_ids = {g['id'] for g in grilles if g.get('_cut')} | {s for s in surrounds}
    unit_main = {u['rec']['id'] for u in units if u.get('cut')}
    for key in ('details', 'lamps', 'paint', 'paint2'):
        ob = parts.get(key)
        if ob is None: continue
        t = face_tags(ob); mask = np.zeros(len(t), bool)
        cache = {}
        for i, tg in enumerate(t):
            if not tg: continue
            if tg not in cache:
                ch = chain(int(tg)); kinds = {c['k'] for c in ch}
                dead = bool(kinds & drop_kinds) or any(c['k'] == 'seam' and c.get('gap') for c in ch) or int(tg) in grille_ids
                # housing decals of converted lamp units (head / tail wrappers): the details patches
                if key == 'details' and ({'head', 'tail'} & kinds) and any(u.get('cut') for u in units): dead = True
                cache[tg] = dead
            mask[i] = cache[tg]
        if key in ('paint', 'paint2'):
            # mirror housings in paint: only the mirror records
            mask &= np.array([bool({c['k'] for c in chain(int(tg))} & {'mirror'}) if tg else False for tg in t])
        delete_faces(ob, mask)
    # ---- lamps: main lens -> lens bucket, sub patches pushed into the housing
    lamps = parts.get('lamps'); lens = None
    if lamps is not None:
        t = face_tags(lamps)
        lens = split_faces_to(lamps, np.isin(t, list(unit_main)), 'L0_lens')
        if lens is not None: _push(lens, -0.0055)
        sub_mask = np.isin(face_tags(lamps), list(subs))
        _push(lamps, -0.012, sub_mask)
    for u in units:
        if u.get('cut') and lamp_unit(Bd, surf, u['rec']['dir'], u['rec']['poly'], u['kind'], u['subs']): st['lamps'] += 1
    for g in grilles:
        if g.get('_cut') and grille_unit(Bd, surf, g['dir'], g['poly'], g['fin']['tex']): st['grilles'] += 1
    for r in recs.values():
        if r['k'] == 'grille':
            for c in patches:
                if c['id'] in surrounds and c.get('parent') == r['id']:
                    R = ring3(surf, r['dir'], shrink(r['poly'], 1.0), 0.015)
                    if len(R) > 5:
                        f = dict(FIN['chrome'] if c['fin']['m'] > 0.5 else FIN['blackGloss'])
                        f['col'] = tuple(c['fin']['col']) if c['fin'].get('col') else f['col']
                        tube(Bd, [q[0] + q[1] * 0.002 for q in R], [(-0.004, -0.002), (0.008, -0.002), (0.008, 0.004), (-0.004, 0.005)], f, up=lambda i, R=R: R[i][1], closed=True, caps=False)
    # ---- replaced details
    for r in recs.values():
        k = r['k']
        if k == 'mirror':
            for s, x0 in r['sides']:
                if r['driverOnly'] and s > 0: continue
                mirror_unit(Bd, r, s, x0)
        elif k == 'wipers':
            for w in r['list']: wiper_unit(Bd, w)
        elif k == 'exhaust':
            for e in r['list']: exhaust_unit(Bd, e)
        elif k == 'badge':
            badge_unit(Bd, surf, r)
        elif k == 'interior' and r.get('eye') and meta.get('gh'):
            BdI, BdT = Build(), Build()
            interior_unit(BdI, surf, r, meta, parts, BdT)
            for code, bb in ((1, BdI), (2, BdT)):
                for kk, ob in bb.flush('hi%d' % code).items():
                    a = ob.data.attributes.new('int', 'INT', 'FACE'); a.data.foreach_set('value', np.full(len(ob.data.polygons), code, np.int32))
                    extra.append((kk, ob))
    if parts.get('glass') is not None: st['seals'] = seal_glass(Bd, parts['glass'])
    new = list(Bd.flush('hx').items()) + extra
    if lens is not None: parts['lens'] = lens
    for k, ob in new:
        if k in parts: join_into(parts[k], [ob])
        else: ob.name = 'L0_' + k; ob.data.name = ob.name; parts[k] = ob
    for k, ob in parts.items():
        _clean(ob); restore_normals(ob)
    log('[hero] %s' % st)
    return parts


def _push(ob, d, mask=None):
    """move faces (mask) along their corner normals by d (shared verts: averaged)"""
    me = ob.data
    if 'onrm' not in me.attributes: return
    n = np.zeros(len(me.loops) * 3, np.float32); me.attributes['onrm'].data.foreach_get('vector', n); n = n.reshape(-1, 3)
    lv = np.zeros(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    use = np.ones(len(me.loops), bool)
    if mask is not None:
        lp = np.zeros(len(me.loops), np.int32)
        for p in me.polygons: lp[p.loop_start:p.loop_start + p.loop_total] = p.index
        use = mask[lp]
    acc = np.zeros((len(me.vertices), 3)); cnt = np.zeros(len(me.vertices))
    np.add.at(acc, lv[use], n[use]); np.add.at(cnt, lv[use], 1)
    co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    m = cnt > 0
    nn = acc[m] / np.maximum(np.linalg.norm(acc[m], axis=1), 1e-9)[:, None]
    co[m] += nn * d
    me.vertices.foreach_set('co', co.ravel()); me.update()


def _clean(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=2e-5)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_area() < 1e-10], context='FACES')
    bm.to_mesh(ob.data); bm.free()
