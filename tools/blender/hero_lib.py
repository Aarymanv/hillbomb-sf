"""HILLBOMB hero landmarks: geometry kit + bake/export pipeline (Blender 5.x, bpy).

Frames: every builder works in WORLD metres (+X east, +Y up, +Z south, absolute Y = terrain elevation). A Geo
accumulates faces per material SLOT; at export, positions become relative to the building origin O = (x, yBase, z)
and are converted to Blender (x, -z, y) so the glTF (+Y up) export lands back in the game frame.
Faces are oriented with a normal HINT (Newell normal flipped to agree with it), so builders never think about winding.
Per-face attributes: colour (linear RGB, alpha = baked AO later), auto metric UV (walls: u along the wall, v = y;
floors/roofs: u = x, v = z) unless a face gives explicit UVs.

Outputs (per building id): public/assets/landmarks/<id>/<id>_lod0.glb, _lod1.glb (Draco, nodes named by slot),
optional interior <id>_int.glb + <id>_int_lm.jpg (lightmap), and _cache/hero/<id>.json (colliders, doors, meta).
"""
import bpy, bmesh, math, os, json, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, '_cache', 'hero')
OUT = os.path.join(ROOT, 'public', 'assets', 'landmarks')
TEX = os.path.join(ROOT, 'public', 'assets', 'tex')

# ============================================================================ site data
_D = {}


def sites():
    if 'sites' not in _D:
        with open(os.path.join(CACHE, 'sites.json')) as f: _D['sites'] = json.load(f)
        B = {}
        for s in _D['sites'].values():
            for b in s['buildings']: B[b['i']] = b
        _D['B'] = B
        _D['grids'] = [s['hgrid'] for s in _D['sites'].values()]
        _D['grids'].sort(key=lambda g: g['n'])
    return _D['sites']


def bld(i):
    sites(); return _D['B'][i]


def ring_of(i):
    return [tuple(p) for p in bld(i)['ring']]


def H(x, z):
    """terrain height (m) from the extracted 2 m grids (smallest grid containing the point)"""
    sites()
    for g in _D['grids']:
        fx, fz = (x - g['x0']) / g['step'], (z - g['z0']) / g['step']
        n = g['n']
        if 0 <= fx < n - 1 and 0 <= fz < n - 1:
            i, j = int(fx), int(fz); tx, tz = fx - i, fz - j; h = g['h']
            a, b, c, d = h[j * n + i], h[j * n + i + 1], h[(j + 1) * n + i], h[(j + 1) * n + i + 1]
            return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
    return 0.0


def buildings_near(x, z, r):
    sites()
    return [b for b in _D['B'].values() if math.hypot(b['c'][0] - x, b['c'][1] - z) < r]


# ============================================================================ colours
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def C(h, a=1.0):
    """'#rrggbb' (sRGB) -> linear RGBA tuple"""
    h = h.lstrip('#')
    return (lin(int(h[0:2], 16) / 255), lin(int(h[2:4], 16) / 255), lin(int(h[4:6], 16) / 255), a)


def shade(c, k):
    return (c[0] * k, c[1] * k, c[2] * k, c[3])


# ============================================================================ 2D helpers (x, z)
def v2sub(a, b): return (a[0] - b[0], a[1] - b[1])
def v2add(a, b): return (a[0] + b[0], a[1] + b[1])
def v2mul(a, k): return (a[0] * k, a[1] * k)
def v2len(a): return math.hypot(a[0], a[1])
def v2norm(a):
    l = v2len(a) or 1.0; return (a[0] / l, a[1] / l)
def v2lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def ring_area(r):
    return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2


def ring_out(r):
    """ring ordered so that the edge normal (-t.z, t.x) points OUT of the polygon"""
    r = [tuple(p) for p in r]
    if len(r) > 2 and r[0] == r[-1]: r = r[:-1]
    return r[::-1] if ring_area(r) > 0 else r


def edge_n(a, b):
    t = v2norm(v2sub(b, a)); return (-t[1], t[0])


def ring_offset(r, d, limit=3.0):
    """miter offset of an out-ring by d (positive = outward)"""
    n = len(r); out = []
    for i in range(n):
        p0, p1, p2 = r[i - 1], r[i], r[(i + 1) % n]
        n1, n2 = edge_n(p0, p1), edge_n(p1, p2)
        k = 1.0 + n1[0] * n2[0] + n1[1] * n2[1]
        m = ((n1[0] + n2[0]) / max(k, 1e-3), (n1[1] + n2[1]) / max(k, 1e-3))
        l = v2len(m)
        if l > limit: m = v2mul(m, limit / l)
        out.append((p1[0] + m[0] * d, p1[1] + m[1] * d))
    return out


def ring_simplify(r, tol=0.35):
    """drop near-collinear / tiny vertices (OSM noise)"""
    r = list(r); changed = True
    while changed and len(r) > 3:
        changed = False
        for i in range(len(r)):
            a, b, c = r[i - 1], r[i], r[(i + 1) % len(r)]
            ab, bc = v2sub(b, a), v2sub(c, b)
            cr = abs(ab[0] * bc[1] - ab[1] * bc[0]) / (v2len(v2sub(c, a)) or 1)
            if cr < tol or v2len(ab) < 0.3:
                r.pop(i); changed = True; break
    return r


def centroid(r):
    return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))


def point_in(r, x, z):
    ins = False; n = len(r)
    for i in range(n):
        (x1, z1), (x2, z2) = r[i], r[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: ins = not ins
    return ins


# ============================================================================ geometry accumulator
def newell(pts):
    nx = ny = nz = 0.0; n = len(pts)
    for i in range(n):
        x1, y1, z1 = pts[i]; x2, y2, z2 = pts[(i + 1) % n]
        nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2)
    l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / l, ny / l, nz / l)


class Geo:
    def __init__(self, O, lod=0):
        self.O = O; self.lod = lod; self.S = {}; self.maxedge = 3.0 if lod == 0 else 12.0

    def _s(self, slot):
        d = self.S.get(slot)
        if d is None: d = self.S[slot] = {'v': [], 'f': [], 'c': [], 'uv': []}
        return d

    def poly(self, slot, pts, col, n=None, uv=None):
        """one planar polygon (3D points, world). n = outward hint (flip to agree)."""
        if len(pts) < 3: return
        if n is not None:
            fn = newell(pts)
            if fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] < 0:
                pts = pts[::-1]
                if uv: uv = uv[::-1]
        d = self._s(slot); b = len(d['v'])
        d['v'].extend(pts); d['f'].append(tuple(range(b, b + len(pts)))); d['c'].append(col); d['uv'].append(uv)

    def quad_sub(self, slot, p0, p1, p2, p3, col, n=None, maxe=None):
        """quad split into a grid so vertex AO has resolution (p0 p1 = bottom edge, p3 p2 = top edge)"""
        maxe = maxe or self.maxedge
        L1 = math.dist(p0, p1); L2 = math.dist(p0, p3)
        nu = max(1, min(40, int(math.ceil(L1 / maxe)))); nv = max(1, min(60, int(math.ceil(L2 / maxe))))
        if nu == 1 and nv == 1: return self.poly(slot, [p0, p1, p2, p3], col, n)
        def P(u, v):
            a = [p0[k] + (p1[k] - p0[k]) * u for k in range(3)]; b = [p3[k] + (p2[k] - p3[k]) * u for k in range(3)]
            return tuple(a[k] + (b[k] - a[k]) * v for k in range(3))
        for j in range(nv):
            for i in range(nu):
                self.poly(slot, [P(i / nu, j / nv), P((i + 1) / nu, j / nv), P((i + 1) / nu, (j + 1) / nv), P(i / nu, (j + 1) / nv)], col, n)

    # ---------------------------------------------------------------- frames: wall frame F = (a(x,z), t(x,z)); n = (-t.z, t.x)
    @staticmethod
    def frame(a, b):
        t = v2norm(v2sub(b, a)); return (a, t, (-t[1], t[0]))

    @staticmethod
    def fp(F, u, y, w=0.0):
        a, t, n = F
        return (a[0] + t[0] * u + n[0] * w, y, a[1] + t[1] * u + n[1] * w)

    def fbox(self, slot, F, u0, u1, y0, y1, w0, w1, col, top=True, bottom=False, sides=True, back=False):
        """box in a wall frame: u along the wall, y up, w outward"""
        a, t, n = F; P = lambda u, y, w: self.fp(F, u, y, w)
        up, dn, N, B, T, mT = (0, 1, 0), (0, -1, 0), (n[0], 0, n[1]), (-n[0], 0, -n[1]), (t[0], 0, t[1]), (-t[0], 0, -t[1])
        self.poly(slot, [P(u0, y0, w1), P(u1, y0, w1), P(u1, y1, w1), P(u0, y1, w1)], col, N)
        if back: self.poly(slot, [P(u0, y0, w0), P(u1, y0, w0), P(u1, y1, w0), P(u0, y1, w0)], col, B)
        if sides:
            self.poly(slot, [P(u1, y0, w0), P(u1, y0, w1), P(u1, y1, w1), P(u1, y1, w0)], col, T)
            self.poly(slot, [P(u0, y0, w0), P(u0, y0, w1), P(u0, y1, w1), P(u0, y1, w0)], col, mT)
        if top: self.poly(slot, [P(u0, y1, w0), P(u1, y1, w0), P(u1, y1, w1), P(u0, y1, w1)], col, up)
        if bottom: self.poly(slot, [P(u0, y0, w0), P(u1, y0, w0), P(u1, y0, w1), P(u0, y0, w1)], col, dn)

    def box(self, slot, x0, x1, y0, y1, z0, z1, col, bottom=False, yaw=0.0, c=None):
        """axis-aligned (or yawed about its centre) world box"""
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; hx, hz = (x1 - x0) / 2, (z1 - z0) / 2
        cy, sy = math.cos(yaw), math.sin(yaw)
        t = (cy, -sy)                       # local +X in world (CONVENTIONS yaw); n = (-t.z, t.x) = local +Z
        n = (-t[1], t[0])
        a = (cx - t[0] * hx - n[0] * hz, cz - t[1] * hx - n[1] * hz)
        self.fbox(slot, (a, t, n), 0, 2 * hx, y0, y1, 0, 2 * hz, col, bottom=bottom, back=True)

    def prism(self, slot, ring, y0, y1, col, top=True, bottom=False, walls=True, wallslot=None, sub=True):
        r = ring_out(ring)
        if walls:
            for i in range(len(r)):
                a, b = r[i], r[(i + 1) % len(r)]
                if v2len(v2sub(b, a)) < 1e-3: continue
                n = edge_n(a, b)
                p = [(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])]
                if sub: self.quad_sub(wallslot or slot, *p, col, (n[0], 0, n[1]))
                else: self.poly(wallslot or slot, p, col, (n[0], 0, n[1]))
        if top: self.poly(slot, [(p[0], y1, p[1]) for p in r], col, (0, 1, 0))
        if bottom: self.poly(slot, [(p[0], y0, p[1]) for p in r], col, (0, -1, 0))

    def sweep(self, slot, ring, prof, col, closed=True, cols=None):
        """profile [(offset_out, y_abs)] bottom->top swept along an out-ring (miter corners)"""
        r = ring_out(ring) if closed else ring
        loops = [ring_offset(r, o) if closed else r for o, y in prof]
        n = len(r); E = n if closed else n - 1
        for k in range(len(prof) - 1):
            (o0, y0), (o1, y1) = prof[k], prof[k + 1]
            do, dy = o1 - o0, y1 - y0
            c = cols[k] if cols else col
            for i in range(E):
                j = (i + 1) % n
                en = edge_n(r[i], r[j])
                hint = (en[0] * dy, -do, en[1] * dy)
                if abs(dy) < 1e-6 and abs(do) < 1e-6: continue
                A, B = loops[k][i], loops[k][j]; A2, B2 = loops[k + 1][i], loops[k + 1][j]
                self.poly(slot, [(A[0], y0, A[1]), (B[0], y0, B[1]), (B2[0], y1, B2[1]), (A2[0], y1, A2[1])], c, hint)

    def lathe(self, slot, cx, cz, prof, col, n=24, a0=0.0, a1=2 * math.pi, cap_top=False, cap_bot=False):
        """profile [(r, y_abs)] bottom->top revolved around (cx, cz)"""
        full = abs(a1 - a0 - 2 * math.pi) < 1e-6
        segs = n
        angs = [a0 + (a1 - a0) * i / segs for i in range(segs + 1)]
        for k in range(len(prof) - 1):
            (r0, y0), (r1, y1) = prof[k], prof[k + 1]
            dr, dy = r1 - r0, y1 - y0
            for i in range(segs):
                t0, t1 = angs[i], angs[i + 1]; tm = (t0 + t1) / 2
                hint = (math.cos(tm) * dy, -dr, math.sin(tm) * dy)
                if abs(dr) < 1e-9 and abs(dy) < 1e-9: continue
                P = lambda r, y, t: (cx + math.cos(t) * r, y, cz + math.sin(t) * r)
                pts = [P(r0, y0, t0), P(r0, y0, t1), P(r1, y1, t1), P(r1, y1, t0)]
                if r0 < 1e-6: pts = [pts[0], pts[2], pts[3]]
                elif r1 < 1e-6: pts = pts[:3]
                self.poly(slot, pts, col, hint)
        if cap_top and prof[-1][0] > 1e-6:
            r, y = prof[-1]; self.poly(slot, [(cx + math.cos(t) * r, y, cz + math.sin(t) * r) for t in angs[:-1 if full else None]], col, (0, 1, 0))
        if cap_bot and prof[0][0] > 1e-6:
            r, y = prof[0]; self.poly(slot, [(cx + math.cos(t) * r, y, cz + math.sin(t) * r) for t in angs[:-1 if full else None]], col, (0, -1, 0))

    def cyl(self, slot, cx, cz, r, y0, y1, col, n=16, top=True, bottom=False, r1=None):
        self.lathe(slot, cx, cz, [(r, y0), (r if r1 is None else r1, y1)], col, n=n, cap_top=top, cap_bot=bottom)

    def seg_box(self, slot, a, b, y0, y1, th, col, top=True):
        """wall-like box centred on segment a->b (x,z), thickness th"""
        F = self.frame(a, b); L = v2len(v2sub(b, a))
        self.fbox(slot, F, 0, L, y0, y1, -th / 2, th / 2, col, top=top, back=True)

    def rod(self, slot, p, q, r, col, n=6):
        """cylinder between 3D points"""
        import mathutils
        P, Q = mathutils.Vector(p), mathutils.Vector(q); d = Q - P; L = d.length
        if L < 1e-6: return
        z = d / L; x = z.orthogonal().normalized(); y = z.cross(x)
        ring = lambda c: [c + (x * math.cos(2 * math.pi * i / n) + y * math.sin(2 * math.pi * i / n)) * r for i in range(n)]
        A, B = ring(P), ring(Q)
        for i in range(n):
            j = (i + 1) % n; m = (A[i] + A[j]) / 2 - P
            self.poly(slot, [tuple(A[i]), tuple(A[j]), tuple(B[j]), tuple(B[i])], col, tuple(m))

    def mesh_in(self, slot, verts, faces, col, xf):
        """add an external mesh (list of 3D verts, faces) through xf(v)->world point"""
        W = [xf(v) for v in verts]
        for f in faces:
            pts = [W[i] for i in f]
            self.poly(slot, pts, col, None)

    # ---------------------------------------------------------------- text (Blender font -> mesh), laid on a wall frame
    def text(self, slot, F, u, y, w, s, size, col, depth=0.06, align='CENTER', font=None, spacing=1.0):
        cu = bpy.data.curves.new('t', 'FONT'); cu.body = s; cu.size = size; cu.extrude = depth / 2
        cu.align_x = align; cu.align_y = 'BOTTOM'; cu.space_character = spacing
        if font: cu.font = font
        ob = bpy.data.objects.new('t', cu); bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get(); me = ob.evaluated_get(dg).to_mesh()
        vs = [(v.co.x, v.co.y, v.co.z) for v in me.vertices]; fs = [tuple(p.vertices) for p in me.polygons]
        ob.evaluated_get(dg).to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
        a, t, n = F
        def xf(v):   # font: x along text, y up, z out of the page
            uu, yy, ww = u + v[0], y + v[1], w + v[2] + depth / 2
            return (a[0] + t[0] * uu + n[0] * ww, yy, a[1] + t[1] * uu + n[1] * ww)
        W = [xf(v) for v in vs]
        # font meshes are consistently wound; (t, up, n) is right-handed like the font's (x, y, z) -> keep winding
        for f in fs: self.poly(slot, [W[i] for i in f], col, None)

    # ---------------------------------------------------------------- stats
    def tris(self):
        return sum(sum(len(f) - 2 for f in d['f']) for d in self.S.values())


# ============================================================================ facades
def radial_panel(g, slot, F, u0, u1, v0, v1, hole, col, w=0.0):
    """wall rectangle [u0,u1]x[v0,v1] (in frame F at depth w) minus a convex opening polygon hole [(u, v)] (CCW)"""
    a, t, n = F; N = (n[0], 0, n[1])
    P = lambda u, v: Geo.fp(F, u, v, w)
    if not hole:
        return g.quad_sub(slot, P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), col, N)
    cu = sum(p[0] for p in hole) / len(hole); cv = sum(p[1] for p in hole) / len(hole)
    def hit(p):
        du, dv = p[0] - cu, p[1] - cv; best = 1e9
        if du > 1e-9: best = min(best, (u1 - cu) / du)
        if du < -1e-9: best = min(best, (u0 - cu) / du)
        if dv > 1e-9: best = min(best, (v1 - cv) / dv)
        if dv < -1e-9: best = min(best, (v0 - cv) / dv)
        q = (cu + du * best, cv + dv * best)
        # (10/1) a hole vertex at / next to the hole centre gave best ~1e9: a vertex hundreds of metres away (a stray
        # brick sliver across Grant & Sacramento from Old St. Mary's tower). Keep the hit on the panel rectangle.
        q = (min(max(q[0], u0), u1), min(max(q[1], v0), v1))
        side = 0 if abs(q[1] - v0) < 1e-6 else 1 if abs(q[0] - u1) < 1e-6 else 2 if abs(q[1] - v1) < 1e-6 else 3
        return q, side
    corners = [(u1, v0), (u1, v1), (u0, v1), (u0, v0)]   # corner after side s (CCW: bottom->right->top->left)
    m = len(hole)
    for i in range(m):
        p, q = hole[i], hole[(i + 1) % m]
        (hp, sp), (hq, sq) = hit(p), hit(q)
        extra = []; s = sp
        k = 0
        while s != sq and k < 4:
            extra.append(corners[s]); s = (s + 1) % 4; k += 1
        pts = [p, q, hq] + extra[::-1] + [hp]      # outer boundary runs CCW hp -> corners -> hq
        g.poly(slot, [P(*x) for x in pts], col, N)


def opening_poly(uc, w, vb, vt, arch=0, seg=8):
    """opening centred at uc, width w, bottom vb, top vt; arch: 0 flat, 1 semicircular, 2 segmental (low)"""
    if not arch:
        return [(uc - w / 2, vb), (uc + w / 2, vb), (uc + w / 2, vt), (uc - w / 2, vt)]
    r = w / 2
    rise = r if arch == 1 else r * 0.35
    spring = vt - rise
    pts = [(uc - r, vb), (uc + r, vb)]
    for i in range(seg + 1):
        a = math.pi * i / seg
        pts.append((uc + r * math.cos(a), spring + rise * math.sin(a)))
    return pts[:2] + pts[2:]


def recess(g, F, hole, depth, wall_slot, wall_col, glass_slot, glass_col, frame=None, mull=None):
    """reveal faces of an opening polygon pushed into the wall by depth, glass at the back"""
    a, t, n = F
    m = len(hole); P = lambda u, v, w: Geo.fp(F, u, v, w)
    cu = sum(p[0] for p in hole) / m; cv = sum(p[1] for p in hole) / m
    for i in range(m):
        p, q = hole[i], hole[(i + 1) % m]
        # inward normal of the reveal = toward the opening centre
        mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
        hint = (-(t[0] * mu), -mv, -(t[1] * mu))
        g.poly(wall_slot, [P(p[0], p[1], 0), P(q[0], q[1], 0), P(q[0], q[1], -depth), P(p[0], p[1], -depth)], wall_col, hint)
    g.poly(glass_slot, [P(u, v, -depth) for u, v in hole], glass_col, (n[0], 0, n[1]))
    if mull and g.lod == 0:
        slot, col, th = mull
        umin = min(p[0] for p in hole); umax = max(p[0] for p in hole); vmin = min(p[1] for p in hole); vmax = max(p[1] for p in hole)
        # vertical centre mullion + transom at 70 %
        g.fbox(slot, F, cu - th / 2, cu + th / 2, vmin, vmax, -depth, -depth + 0.05, col, top=False)
        vt = vmin + (vmax - vmin) * 0.72
        g.fbox(slot, F, umin, umax, vt - th / 2, vt + th / 2, -depth, -depth + 0.05, col, top=True)


class Win:
    """window style"""
    def __init__(self, w=1.2, sill=0.85, head=2.45, depth=0.22, arch=0, slot='win', lit=0.35, sill_out=0.08,
                 mull=True, frame_col=None, pair=1, gap=0.3, hood=0.0, keystone=False, glass='win'):
        self.__dict__.update(locals()); del self.__dict__['self']


_WINRNG = [12345]


def rnd():
    _WINRNG[0] = (_WINRNG[0] * 1103515245 + 12345) & 0x7fffffff
    return _WINRNG[0] / 0x7fffffff


def glass_col(lit_p):
    """window vertex colour: rgb = night emission (warm/cool/off), alpha 1"""
    r = rnd()
    if r < lit_p:
        k = 0.55 + 0.9 * rnd()
        tone = rnd()
        c = (1.0, 0.78, 0.5) if tone < 0.6 else (1.0, 0.9, 0.75) if tone < 0.85 else (0.8, 0.88, 1.0)
        return (c[0] * k, c[1] * k, c[2] * k, 1.0)
    return (0.0, 0.0, 0.0, 1.0)


def facade(g, a, b, y0, y1, fh, bay, win, wall_slot, wall_col, margin=1.2, floors=None, skip=None, pier=None,
           band=None, lod=None, blank=False, bays=None):
    """punched-window wall on segment a->b (out-ring order: outward = (-t.z, t.x)) between absolute y0..y1.
    fh floor height; bay target bay width; win = Win or callable(k, i) -> Win|None; pier = (width, depth, col) pilasters
    at bay edges; band = (height, depth, col) string course at every floor line."""
    lod = g.lod if lod is None else lod
    F = Geo.frame(a, b); L = v2len(v2sub(b, a)); N = (F[2][0], 0, F[2][1])
    if L < 0.05: return
    margin = min(margin, L * 0.12)
    nb = bays if bays else int((L - 2 * margin) / bay) if L - 2 * margin > bay * 0.75 else 0
    if bays is None and nb == 0 and L - 2 * margin > bay * 0.55: nb = 1
    nf = int((y1 - y0) / fh + 0.3) if fh else 0
    if fh and y0 + nf * fh > y1 + 0.01: nf -= 1
    if blank or nb == 0 or nf == 0 or win is None:
        return radial_panel(g, wall_slot, F, 0, L, y0, y1, None, wall_col)
    bw = (L - 2 * margin) / nb
    if lod:
        radial_panel(g, wall_slot, F, 0, L, y0, y1, None, wall_col)
        for k in range(nf):
            yk = y0 + k * fh
            for i in range(nb):
                W = win(k, i) if callable(win) else win
                if W is None or (skip and skip(k, i)): continue
                u0 = margin + i * bw
                subs = [(u0 + (s + 0.5) * bw / W.pair) for s in range(W.pair)]
                for uc in subs:
                    w = min(W.w, bw / W.pair - 0.25)
                    hole = opening_poly(uc, w, yk + W.sill, yk + W.head, W.arch, 3)
                    g.poly(W.glass, [Geo.fp(F, u, v, 0.03) for u, v in hole], glass_col(W.lit), N)
        ytop = y0 + nf * fh
    else:
      if margin > 0.01:
        radial_panel(g, wall_slot, F, 0, margin, y0, y1, None, wall_col)
        radial_panel(g, wall_slot, F, L - margin, L, y0, y1, None, wall_col)
      ytop = y0 + nf * fh
      if y1 - ytop > 0.01: radial_panel(g, wall_slot, F, margin, L - margin, ytop, y1, None, wall_col)
      _cells(g, F, nf, nb, y0, fh, margin, bw, win, skip, wall_slot, wall_col, lod)
    _piers_bands(g, F, L, nb, nf, y0, fh, margin, bw, ytop, pier, band, wall_slot)


def _cells(g, F, nf, nb, y0, fh, margin, bw, win, skip, wall_slot, wall_col, lod):
    for k in range(nf):
        yk = y0 + k * fh
        for i in range(nb):
            u0 = margin + i * bw; u1 = u0 + bw; uc = (u0 + u1) / 2
            W = win(k, i) if callable(win) else win
            if W is None or (skip and skip(k, i)):
                radial_panel(g, wall_slot, F, u0, u1, yk, yk + fh, None, wall_col); continue
            if W.pair > 1:
                # several openings per bay: split the bay into sub-cells
                sw = bw / W.pair
                for s in range(W.pair):
                    _cell(g, F, u0 + s * sw, u0 + (s + 1) * sw, yk, fh, W, wall_slot, wall_col, lod)
            else:
                _cell(g, F, u0, u1, yk, fh, W, wall_slot, wall_col, lod)


def _piers_bands(g, F, L, nb, nf, y0, fh, margin, bw, ytop, pier, band, wall_slot):
    if pier and g.lod == 0:
        pw, pd, pc = pier
        for i in range(nb + 1):
            u = margin + i * bw
            g.fbox(wall_slot, F, max(0, u - pw / 2), min(L, u + pw / 2), y0, ytop, 0, pd, pc, top=True)
    if band:
        bh, bd, bc = band
        for k in range(1, nf + 1):
            yk = y0 + k * fh
            if g.lod == 0 or k % 3 == 0:
                g.fbox(wall_slot, F, 0, L, yk - bh, yk, 0, bd, bc, top=True, bottom=True)


def _cell(g, F, u0, u1, yk, fh, W, wall_slot, wall_col, lod):
    uc = (u0 + u1) / 2
    w = min(W.w, (u1 - u0) - 0.25)
    hole = opening_poly(uc, w, yk + W.sill, yk + W.head, W.arch, 8 if lod == 0 else 4)
    radial_panel(g, wall_slot, F, u0, u1, yk, yk + fh, hole, wall_col)
    gc = glass_col(W.lit)
    if lod == 0:
        recess(g, F, hole, W.depth, wall_slot, shade(wall_col, 0.92), W.glass, gc, mull=('metal', W.frame_col or C('#3a3a38'), 0.06) if W.mull else None)
        if W.sill_out > 0:
            g.fbox(wall_slot, F, uc - w / 2 - 0.08, uc + w / 2 + 0.08, yk + W.sill - 0.1, yk + W.sill, 0, W.sill_out, shade(wall_col, 1.05), top=True, bottom=True)
        if W.hood > 0:
            g.fbox(wall_slot, F, uc - w / 2 - 0.15, uc + w / 2 + 0.15, yk + W.head + 0.05, yk + W.head + 0.05 + W.hood, 0, 0.12, shade(wall_col, 1.05), top=True, bottom=True)
        if W.keystone:
            g.fbox(wall_slot, F, uc - 0.16, uc + 0.16, yk + W.head - 0.25, yk + W.head + 0.12, 0, 0.1, shade(wall_col, 1.08), top=True, bottom=True)
    else:
        recess(g, F, hole, 0.12, wall_slot, shade(wall_col, 0.9), W.glass, gc)


def storefront(g, a, b, ybot_fn, ytop, bay, wall_slot, wall_col, glass_slot='shop', frame_col=None, margin=0.8,
               transom=0.9, depth=0.3, lit=0.95, sign=None, awning=None, doors=None, pier=None, y_under=None, arch=0):
    """ground-floor shop windows on a->b: each bay's bottom follows the sidewalk (ybot_fn(x, z)), tops at ytop"""
    F = Geo.frame(a, b); L = v2len(v2sub(b, a)); N = (F[2][0], 0, F[2][1])
    if L < 0.5: return
    margin = min(margin, L * 0.15)
    nb = max(1, int((L - 2 * margin) / bay)) if L - 2 * margin > bay * 0.5 else 0
    ylow = min(ybot_fn(*v2lerp(a, b, s / 8)) for s in range(9)) - 3.0 if y_under is None else y_under
    if nb == 0:
        return radial_panel(g, wall_slot, F, 0, L, ylow, ytop, None, wall_col)
    bw = (L - 2 * margin) / nb
    fc = frame_col or C('#2b2620')
    if g.lod:
        radial_panel(g, wall_slot, F, 0, L, ylow, ytop, None, wall_col)
        for i in range(nb):
            uc = margin + (i + 0.5) * bw; px, pz = v2lerp(a, b, uc / L)
            yb = ybot_fn(px, pz) + 0.25; yt = ytop - 0.35; w = bw - (pier[0] if pier else 0.7)
            if arch: yb = min(yb, yt - w / 2 - 0.6)
            hole = opening_poly(uc, w, yb, yt, arch, 3)
            g.poly(glass_slot, [Geo.fp(F, u, v, 0.03) for u, v in hole], (1.0, 0.86, 0.66, 1.0) if rnd() < lit else (0.2, 0.18, 0.15, 1.0), N)
        return
    radial_panel(g, wall_slot, F, 0, margin, ylow, ytop, None, wall_col)
    radial_panel(g, wall_slot, F, L - margin, L, ylow, ytop, None, wall_col)
    for i in range(nb):
        u0 = margin + i * bw; u1 = u0 + bw; uc = (u0 + u1) / 2
        px, pz = v2lerp(a, b, uc / L)
        yb = ybot_fn(px, pz) + 0.25
        yt = ytop - 0.35
        w = bw - (pier[0] if pier else 0.7)
        if arch:
            yb = min(yb, yt - w / 2 - 0.6)
            hole = opening_poly(uc, w, yb, yt, arch, 10 if g.lod == 0 else 4)
        else:
            hole = [(uc - w / 2, yb), (uc + w / 2, yb), (uc + w / 2, yt), (uc - w / 2, yt)]
        radial_panel(g, wall_slot, F, u0, u1, ylow, ytop, hole, wall_col)
        is_door = doors and doors(i)
        gcol = (1.0, 0.86, 0.66, 1.0) if rnd() < lit else (0.2, 0.18, 0.15, 1.0)
        recess(g, F, hole, depth, 'metal', fc, glass_slot, gcol)
        if g.lod == 0:
            # frame: transom bar, mullions, kick plate
            ytr = yt - transom if not arch else yt - w / 2
            g.fbox('metal', F, uc - w / 2, uc + w / 2, ytr - 0.06, ytr + 0.06, -depth, -depth + 0.08, fc, top=True, bottom=True)
            g.fbox('metal', F, uc - w / 2, uc + w / 2, yb, yb + 0.35, -depth, -depth + 0.06, fc, top=True)
            nm = 1 if is_door else max(1, int(w / 2.2))
            for m in range(1, nm + 1 if not is_door else 2):
                um = uc - w / 2 + w * m / (nm + 1)
                g.fbox('metal', F, um - 0.04, um + 0.04, yb, ytr, -depth, -depth + 0.06, fc, top=False)
        if pier and g.lod == 0:
            pw, pd, pc = pier
            g.fbox(wall_slot, F, u0 - pw / 2 if i else u0, u0 + pw / 2, ylow, ytop, 0, pd, pc, top=True)
        if awning and g.lod == 0:
            ac = awning
            A0, A1 = Geo.fp(F, uc - w / 2 - 0.1, yt + 0.25, 0.02), Geo.fp(F, uc + w / 2 + 0.1, yt + 0.25, 0.02)
            B0, B1 = Geo.fp(F, uc - w / 2 - 0.1, yt - 0.55, 1.3), Geo.fp(F, uc + w / 2 + 0.1, yt - 0.55, 1.3)
            g.poly('fabric', [A0, A1, B1, B0], ac, (N[0], 1, N[2]))
            g.poly('fabric', [A0, A1, B1, B0], shade(ac, 0.7), (-N[0], -1, -N[2]))
            V0 = Geo.fp(F, uc - w / 2 - 0.1, yt - 0.85, 1.3); V1 = Geo.fp(F, uc + w / 2 + 0.1, yt - 0.85, 1.3)
            g.poly('fabric', [V0, V1, B1, B0], ac, N)
            g.poly('fabric', [V0, V1, B1, B0], shade(ac, 0.7), (-N[0], 0, -N[2]))


def cornice(g, ring, y, depth, col, slot='stone', height=None, lod=None):
    """classical cornice around an out-ring at absolute y (bed moulding, corona, cymatium)"""
    lod = g.lod if lod is None else lod
    hgt = height or depth * 1.6
    if lod == 0:
        prof = [(0, y - hgt), (0.12 * depth, y - hgt), (0.12 * depth, y - hgt * 0.75), (0.35 * depth, y - hgt * 0.6),
                (0.45 * depth, y - hgt * 0.45), (depth, y - hgt * 0.4), (depth, y - hgt * 0.15), (depth * 1.05, y - hgt * 0.1),
                (depth * 1.05, y), (0, y)]
    else:
        prof = [(0, y - hgt), (depth, y - hgt * 0.4), (depth, y), (0, y)]
    g.sweep(slot, ring, prof, col)


def parapet(g, ring, y0, h, th, col, slot='stone', roof_slot='roof', roof_col=None):
    r = ring_out(ring)
    inner = ring_offset(r, -th)
    g.prism(slot, r, y0, y0 + h, col, top=False)
    # cap + inner face
    g.sweep(slot, r, [(0, y0 + h), (-th, y0 + h)], shade(col, 1.05))
    for i in range(len(inner)):
        A, B = inner[i], inner[(i + 1) % len(inner)]
        n = edge_n(A, B)
        g.poly(slot, [(A[0], y0, A[1]), (B[0], y0, B[1]), (B[0], y0 + h, B[1]), (A[0], y0 + h, A[1])], shade(col, 0.85), (-n[0], 0, -n[1]))
    g.poly(roof_slot, [(p[0], y0 + 0.02, p[1]) for p in inner], roof_col or C('#6b6862'), (0, 1, 0))


def roof_clutter(g, ring, y, seed=1, n=4, col=None):
    """HVAC boxes, a penthouse, a water tank"""
    import random
    R = random.Random(seed)
    r = ring_out(ring); cx, cz = centroid(r)
    c = col or C('#8d8a84')
    for k in range(n):
        for _ in range(20):
            x = cx + (R.random() - 0.5) * 30; z = cz + (R.random() - 0.5) * 30
            sx, sz = 2 + R.random() * 5, 2 + R.random() * 4
            if all(point_in(r, x + dx, z + dz) for dx in (-sx, sx) for dz in (-sz, sz)): break
        else: continue
        hh = 1.2 + R.random() * 2.5
        g.box('roof', x - sx / 2, x + sx / 2, y, y + hh, z - sz / 2, z + sz / 2, shade(c, 0.9 + R.random() * 0.2))


# ============================================================================ blender: meshes, AO bake, export
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def to_object(name, d, O, weld=True, angle=35):
    """slot dict -> Blender mesh object (positions relative to O, converted to Blender axes)"""
    V = np.asarray(d['v'], dtype=np.float64)
    if len(V) == 0: return None
    ox, oy, oz = O
    Vb = np.empty_like(V); Vb[:, 0] = V[:, 0] - ox; Vb[:, 1] = -(V[:, 2] - oz); Vb[:, 2] = V[:, 1] - oy
    faces = d['f']
    loop_v = np.fromiter((i for f in faces for i in f), dtype=np.int32)
    loop_tot = np.fromiter((len(f) for f in faces), dtype=np.int32)
    loop_start = np.concatenate([[0], np.cumsum(loop_tot)[:-1]]).astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(Vb)); me.vertices.foreach_set('co', Vb.astype(np.float32).ravel())
    me.loops.add(len(loop_v)); me.loops.foreach_set('vertex_index', loop_v)
    me.polygons.add(len(faces)); me.polygons.foreach_set('loop_start', loop_start); me.polygons.foreach_set('loop_total', loop_tot)
    me.update(calc_edges=True)
    # uv: explicit per face or metric from the (game-frame) Newell normal
    UV = np.zeros((len(loop_v), 2), dtype=np.float32)
    k = 0
    for fi, f in enumerate(faces):
        uv = d['uv'][fi]
        if uv:
            for j in range(len(f)): UV[k + j] = uv[j]
        else:
            pts = [d['v'][i] for i in f]
            n = newell(pts)
            if abs(n[1]) > 0.75:
                for j, p in enumerate(pts): UV[k + j] = (p[0] - ox, -(p[2] - oz))
            else:
                tx, tz = n[2], -n[0]; l = math.hypot(tx, tz) or 1; tx /= l; tz /= l
                for j, p in enumerate(pts): UV[k + j] = ((p[0] - ox) * tx + (p[2] - oz) * tz, p[1] - oy)
        k += len(f)
    uvl = me.uv_layers.new(name='UVMap'); uvl.data.foreach_set('uv', UV.ravel())
    col = np.repeat(np.asarray(d['c'], dtype=np.float32), loop_tot, axis=0)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', col.ravel())
    me.color_attributes.active_color = ca
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if weld:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.003)
        bm.to_mesh(me); bm.free()
    me.set_sharp_from_angle(angle=math.radians(angle))
    return ob


def devices():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type in ('OPTIX', 'CPU')
        return 'GPU'
    except Exception:
        return 'CPU'


def bake_vertex_ao(targets, occluders, samples=96, distance=8.0):
    """Cycles AO -> alpha of the 'Col' corner colours"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = devices(); sc.cycles.samples = samples
    sc.render.bake.target = 'VERTEX_COLORS'
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = distance
    mat = bpy.data.materials.new('bake')
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in targets:
        ob.data.materials.clear(); ob.data.materials.append(mat)
        ao = ob.data.color_attributes.new('ao', 'FLOAT_COLOR', 'CORNER')
        ob.data.color_attributes.active_color = ao
        ob.select_set(True)
    for ob in occluders:
        if not ob.data.materials: ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = targets[0]
    t = time.time()
    for attempt in range(2):
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        tot, cnt = 0.0, 0
        for ob in targets:
            me = ob.data; a = np.empty(len(me.loops) * 4, dtype=np.float32); me.color_attributes['ao'].data.foreach_get('color', a)
            tot += float(a[0::4].sum()); cnt += len(me.loops)
        mean = tot / max(1, cnt)
        if mean > 0.25: break
        print('[hero] WARNING AO bake looks broken (mean %.3f), retrying' % mean, flush=True)
    print('[hero] AO bake', len(targets), 'objects', round(time.time() - t, 1), 's, mean AO %.2f' % mean, flush=True)
    for ob in targets:
        me = ob.data; n = len(me.loops)
        a = np.empty(n * 4, dtype=np.float32); me.color_attributes['ao'].data.foreach_get('color', a)
        c = np.empty(n * 4, dtype=np.float32); me.color_attributes['Col'].data.foreach_get('color', c)
        c[3::4] = np.clip(a[0::4], 0.0, 1.0)
        me.color_attributes['Col'].data.foreach_set('color', c)
        me.color_attributes.remove(me.color_attributes['ao'])
        me.color_attributes.active_color = me.color_attributes['Col']
        me.materials.clear()


def export_glb(objs, path, draco=True):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='NONE', export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
                              export_all_vertex_colors=False, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_draco_mesh_compression_enable=draco, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=16, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=16, export_draco_color_quantization=10,
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
    return os.path.getsize(path)


def terrain_occluder(cx, cz, r, oy, O):
    """ground mesh from the extracted grid (AO occluder, not exported)"""
    g = Geo(O, 1); st = 4.0; n = int(2 * r / st)
    for j in range(n):
        for i in range(n):
            x0, z0 = cx - r + i * st, cz - r + j * st
            p = [(x0, H(x0, z0), z0), (x0 + st, H(x0 + st, z0), z0), (x0 + st, H(x0 + st, z0 + st), z0 + st), (x0, H(x0, z0 + st), z0 + st)]
            g.poly('t', p, (1, 1, 1, 1), (0, 1, 0))
    return to_object('occ_ground', g.S['t'], O, weld=True)


def neighbour_occluders(skip, cx, cz, r, O):
    g = Geo(O, 1)
    for b in buildings_near(cx, cz, r):
        if b['i'] in skip or len(b['ring']) < 3: continue
        g.prism('n', b['ring'], b['base'] - 2 + b.get('minH', 0), b['base'] + b['h'], (1, 1, 1, 1), sub=False)
    return to_object('occ_nb', g.S['n'], O, weld=False) if 'n' in g.S else None


def wall_colliders(ring, y0, y1, th=1.6):
    """thin inset boxes along an out-ring (CONVENTIONS collider format), absolute y"""
    r = ring_out(ring); out = []
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        L = v2len(v2sub(b, a))
        if L < 0.4: continue
        t = v2norm(v2sub(b, a)); n = (-t[1], t[0])
        mx, mz = (a[0] + b[0]) / 2 - n[0] * th / 2, (a[1] + b[1]) / 2 - n[1] * th / 2
        # collider yaw: local +X along t -> yaw with (cos yaw, -sin yaw) = t
        yaw = math.atan2(-t[1], t[0])
        out.append({'x': round(mx, 2), 'z': round(mz, 2), 'hx': round(L / 2 + 0.3, 2), 'hz': round(th / 2, 2), 'yaw': round(yaw, 4), 'yMin': round(y0, 2), 'yMax': round(y1, 2)})
    return out


def run_building(bid, build_fn, hide, O, extra=None, ao_samples=64, occ_r=90):
    """build LOD0 + LOD1 with build_fn(g) -> meta, bake AO, export, write the cache json"""
    t0 = time.time()
    reset()
    os.makedirs(os.path.join(OUT, bid), exist_ok=True)
    meta = {}
    info = {'id': bid, 'origin': [round(O[0], 2), round(O[1], 2), round(O[2], 2)], 'hide': hide, 'lods': []}
    for lod in (0, 1):
        _WINRNG[0] = 12345
        g = Geo(O, lod)
        m = build_fn(g) or {}
        if lod == 0: meta = m
        objs = [to_object('L%d_%s' % (lod, s), d, O) for s, d in g.S.items()]
        objs = [o for o in objs if o]
        occ = [terrain_occluder(O[0], O[2], occ_r, O[1], O), neighbour_occluders(set(hide), O[0], O[2], occ_r, O)]
        occ = [o for o in occ if o]
        bake_vertex_ao(objs, occ, samples=ao_samples if lod == 0 else 24, distance=5.0)
        for o in occ: bpy.data.objects.remove(o, do_unlink=True)
        path = os.path.join(OUT, bid, '%s_lod%d.glb' % (bid, lod))
        kb = export_glb(objs, path) // 1024
        info['lods'].append({'file': '%s_lod%d.glb' % (bid, lod), 'tris': g.tris(), 'kb': kb, 'slots': sorted(g.S.keys())})
        for o in objs: bpy.data.objects.remove(o, do_unlink=True)
        print('[hero] %s lod%d: %d tris, %d KB' % (bid, lod, g.tris(), kb), flush=True)
    info.update(meta)
    if extra: info.update(extra)
    info['sec'] = round(time.time() - t0, 1)
    jp = os.path.join(CACHE, bid + '.json')
    if os.path.exists(jp):
        try:
            prev = json.load(open(jp))
            if 'interior' in prev and 'interior' not in info: info['interior'] = prev['interior']
        except Exception: pass
    with open(jp, 'w') as f: json.dump(info, f)
    print('[hero] done', bid, info['sec'], 's', flush=True)
    return info
