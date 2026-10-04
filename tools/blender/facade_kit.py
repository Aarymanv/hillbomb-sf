"""HILLBOMB facade kit: high-detail San Francisco facade units modelled in Blender and baked
orthographically with Cycles into one atlas set (the way AAA trim sheets / window kits are made).

Outputs (public/assets/baked/):
  facade_alb.jpg   RES x RES   sRGB albedo (unlit, weathered: crevice dirt, paint chips, streaks under ledges)
  facade_nrm.png   RES x RES   R,G = tangent-space normal xy (x right, y up), B = height (H_MIN..H_MAX m)
  facade_ma.png    RES x RES/2 left half = (glass, trim-paint, wall) masks, right half = (AO, roughness, accent-paint)
  facade_kit.json  per unit: atlas rect (px) + uv, physical size (m), opening rect (m), pivot, tiling axis,
                   sill / crown boxes (m) for real near-LOD geometry

Frame: facade plane Y = 0, +X right, +Z up, relief toward -Y (the camera). Unit-local (x, z) from the unit's
bottom-left corner. Tinting contract (material.js): trim-paint pixels are baked on a 0.8 grey paint and get
multiplied by the building's trim colour / 0.8; accent pixels by the accent colour; wall pixels are baked on a
0.5 grey wall and multiply the building's own wall texture by albedo / 0.5 (carries AO, dirt and streaks).

Usage: tools/.venv-blender/Scripts/python tools/blender/facade_kit.py [--res 4096] [--samples 64] [--only-post]
"""
import os, sys, json, math, time, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import numpy as np
from mathutils import Matrix, Vector
import hb_lib as L
from hb_lib import MB, TR

H_MIN, H_MAX = -0.40, 0.50            # encoded height range (m); relief toward the camera is positive
PAINT_REF, WALL_REF = 0.8, 0.5        # grey the tintable paint / wall are baked on
CACHE = os.path.join(L.CACHE, 'facade')
PI = math.pi

# ----------------------------------------------------------------------------------------------------------
# materials: every material exposes 5 pass sockets; one emission render per pass
# ----------------------------------------------------------------------------------------------------------
MATS = {}
MLIST = []


def _n(nt, typ, **kw):
    n = nt.nodes.new(typ)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def _link(nt, a, b):
    if isinstance(a, bpy.types.NodeSocket):
        nt.links.new(a, b)
    elif isinstance(a, (int, float)):
        b.default_value = a
    else:
        b.default_value = tuple(a) + ((1.0,) if len(a) == 3 and len(b.default_value) == 4 else ())


def _math(nt, op, a, b=None, c=None, clamp=False):
    n = _n(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, v in enumerate((a, b, c)):
        if v is not None:
            _link(nt, v, n.inputs[i])
    return n.outputs[0]


def _mix(nt, fac, a, b, blend='MIX'):
    return L.mix_rgb(nt, fac, a, b, blend)


def _noise(nt, P, scale, detail=4.0, rough=0.55, lo=0.0, hi=1.0, f0=0.3, f1=0.7, stretch=None):
    v = P
    if stretch is not None:
        v = L.vmul(nt, P, stretch)
    n = _n(nt, 'ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(v, n.inputs['Vector'])
    mr = _n(nt, 'ShaderNodeMapRange', clamp=True)
    mr.inputs['From Min'].default_value = f0
    mr.inputs['From Max'].default_value = f1
    mr.inputs['To Min'].default_value = lo
    mr.inputs['To Max'].default_value = hi
    nt.links.new(n.outputs['Fac'], mr.inputs['Value'])
    return mr.outputs['Result']


def fmat(name, col, rough=0.5, tex=None, tex_scale=1.0, detail=1.0, glass=0.0, trim=0.0, wall=0.0, acc=0.0,
         chip=0.0, chip_col=(0.20, 0.17, 0.13), dirt=1.0, grain=0.4, plain=False, nstr=1.0, stripes=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = _n(nt, 'ShaderNodeOutputMaterial')
    em = _n(nt, 'ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    geo = _n(nt, 'ShaderNodeNewGeometry')
    P = geo.outputs['Position']
    nrm = geo.outputs['Normal']
    # ---------------------------------------------------------------- base colour
    if tex:
        uv = _n(nt, 'ShaderNodeUVMap', uv_map='UVMap')
        mp = _n(nt, 'ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1.0 / tex_scale, 1.0 / tex_scale, 1.0)
        nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
        ti = _n(nt, 'ShaderNodeTexImage', interpolation='Cubic')
        ti.image = L.tex_image(tex, 'color')
        nt.links.new(mp.outputs['Vector'], ti.inputs['Vector'])
        mean = L.tex_mean(tex)
        base = L.vmul(nt, ti.outputs['Color'], tuple(col[i] / max(1e-4, mean[i]) for i in range(3)))
        if detail < 1:
            base = _mix(nt, 1 - detail, base, col)
        nim = L.tex_image(tex, 'normal')
        if nim is not None and nstr > 0:
            tn = _n(nt, 'ShaderNodeTexImage', interpolation='Linear')
            tn.image = nim
            nt.links.new(mp.outputs['Vector'], tn.inputs['Vector'])
            nm = _n(nt, 'ShaderNodeNormalMap', uv_map='UVMap')
            nm.inputs['Strength'].default_value = nstr
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nrm = nm.outputs['Normal']
    else:
        rgb = _n(nt, 'ShaderNodeRGB')
        rgb.outputs[0].default_value = tuple(col) + (1.0,)
        base = rgb.outputs[0]
    if stripes is not None:   # awning stripes along x: (period, colour B)
        per, colB = stripes
        sx = _n(nt, 'ShaderNodeSeparateXYZ')
        nt.links.new(P, sx.inputs[0])
        f = _math(nt, 'FRACT', _math(nt, 'DIVIDE', sx.outputs[0], per))
        st = _math(nt, 'GREATER_THAN', f, 0.5)
        base = _mix(nt, st, base, colB)
    grime = None
    if not plain:
        fine = _noise(nt, P, 38.0, 6.0, 0.6, 0.9, 1.06)
        base = L.vmul(nt, base, fine)
        grime = _noise(nt, P, 2.4, 5.0, 0.6, 0.0, 1.0, 0.38, 0.72)
    # ---------------------------------------------------------------- crevice dirt (AO driven)
    ao = _n(nt, 'ShaderNodeAmbientOcclusion', samples=12, only_local=False)
    ao.inputs['Distance'].default_value = 0.07
    cav = _math(nt, 'SUBTRACT', 1.0, ao.outputs['AO'])
    dk = _math(nt, 'MULTIPLY', cav, 1.5)
    if grime is not None:
        dk = _math(nt, 'MULTIPLY_ADD', grime, 0.28, dk)
    dk = _math(nt, 'MULTIPLY', dk, dirt, clamp=True)
    base = _mix(nt, dk, base, L.vmul(nt, base, (0.42, 0.37, 0.31)))
    chipM = None
    if chip > 0:
        c1 = _noise(nt, P, 9.0, 12.0, 0.68, 0.0, 1.0, 0.63, 0.665)
        c2 = _noise(nt, P, 1.3, 3.0, 0.5, 0.0, 1.0, 0.35, 0.75)        # chips cluster in weathered zones
        chipM = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', c1, c2), chip, clamp=True)
        base = _mix(nt, chipM, base, chip_col)
    r = _math(nt, 'MULTIPLY_ADD', dk, 0.12, rough)
    if chipM is not None:
        r = _math(nt, 'MULTIPLY_ADD', chipM, 0.2, r, clamp=True)
    # ---------------------------------------------------------------- normal (bump for paint grain and chips)
    if not tex and (grain > 0 or chipM is not None) and not plain:
        h = _noise(nt, P, 55.0, 8.0, 0.65, 0.0, grain, 0.3, 0.7, stretch=(1.0, 1.0, 0.35))
        if chipM is not None:
            h = _math(nt, 'MULTIPLY_ADD', chipM, -0.6, h)
        bp = _n(nt, 'ShaderNodeBump')
        bp.inputs['Strength'].default_value = 0.35
        bp.inputs['Distance'].default_value = 0.0012
        nt.links.new(h, bp.inputs['Height'])
        nrm = bp.outputs['Normal']
    nenc = _n(nt, 'ShaderNodeVectorMath', operation='MULTIPLY_ADD')
    nt.links.new(nrm, nenc.inputs[0])
    nenc.inputs[1].default_value = (0.5, 0.5, 0.5)
    nenc.inputs[2].default_value = (0.5, 0.5, 0.5)
    sp = _n(nt, 'ShaderNodeSeparateXYZ')
    nt.links.new(P, sp.inputs[0])
    hg = _n(nt, 'ShaderNodeMapRange', clamp=True)
    hg.inputs['From Min'].default_value = -H_MIN
    hg.inputs['From Max'].default_value = -H_MAX
    nt.links.new(sp.outputs[1], hg.inputs['Value'])
    msk = _n(nt, 'ShaderNodeCombineColor')
    msk.inputs[0].default_value = glass
    msk.inputs[1].default_value = trim
    msk.inputs[2].default_value = wall
    ao2 = _n(nt, 'ShaderNodeAmbientOcclusion', samples=16, only_local=False)
    ao2.inputs['Distance'].default_value = 0.4
    aux = _n(nt, 'ShaderNodeCombineColor')
    nt.links.new(ao2.outputs['AO'], aux.inputs[0])
    _link(nt, r, aux.inputs[1])
    aux.inputs[2].default_value = acc
    socks = {'alb': base, 'nrm': nenc.outputs[0], 'hgt': hg.outputs['Result'], 'msk': msk.outputs[0], 'aux': aux.outputs[0]}
    MATS[name] = (m, em, socks)
    MLIST.append(m)
    return len(MLIST) - 1


def set_pass(p):
    for m, em, socks in MATS.values():
        m.node_tree.links.new(socks[p], em.inputs['Color'])


def make_materials():
    K = {}
    K['PAINT'] = fmat('paint', (PAINT_REF,) * 3, 0.5, trim=1.0, chip=0.55, grain=0.5)
    K['ACC'] = fmat('accent', (PAINT_REF,) * 3, 0.42, acc=1.0, chip=0.35, grain=0.35)
    K['GLASS'] = fmat('glass', (0.03, 0.035, 0.04), 0.05, glass=1.0, dirt=0.3, plain=True)
    K['STONE'] = fmat('stone', (0.50, 0.46, 0.40), 0.85, tex='concrete', tex_scale=1.2, detail=0.8, dirt=1.2)
    K['BRONZE'] = fmat('bronze', (0.055, 0.047, 0.04), 0.35, dirt=0.6, grain=0.1)
    K['ALU'] = fmat('alu', (0.42, 0.43, 0.44), 0.32, dirt=0.8, grain=0.1)
    K['IRON'] = fmat('iron', (0.035, 0.035, 0.037), 0.55, chip=0.6, chip_col=(0.16, 0.07, 0.03), grain=0.5, dirt=0.8)
    K['CONC'] = fmat('conc', (0.46, 0.45, 0.42), 0.85, tex='concrete', tex_scale=1.5, detail=0.9)
    K['TILE'] = fmat('tile', (0.36, 0.12, 0.07), 0.45, tex='tiles', tex_scale=0.6, detail=0.85)
    K['KICK'] = fmat('kick', (0.10, 0.10, 0.11), 0.3, tex='tiles', tex_scale=0.5, detail=0.8)
    K['DARK'] = fmat('dark', (0.02, 0.02, 0.02), 0.7, plain=True)
    K['METAL'] = fmat('acmetal', (0.52, 0.50, 0.45), 0.5, tex='metal', tex_scale=0.8, detail=0.5)
    K['GALV'] = fmat('galv', (0.38, 0.39, 0.40), 0.55, chip=0.25, chip_col=(0.2, 0.1, 0.05), grain=0.2)
    K['BRASS'] = fmat('brass', (0.45, 0.33, 0.14), 0.35, dirt=0.6, grain=0.05)
    K['WALLR'] = fmat('wallrelief', (WALL_REF,) * 3, 0.85, wall=1.0, plain=True)
    K['CANVAS'] = fmat('canvas', (0.74, 0.71, 0.64), 0.9, acc=1.0, stripes=(0.5, (0.8, 0.79, 0.76)), grain=0.25)
    K['WALL'] = fmat('wall', (WALL_REF,) * 3, 0.85, wall=1.0, plain=True, dirt=1.0)
    return K


# ----------------------------------------------------------------------------------------------------------
# geometry helpers (d = relief toward the camera, i.e. y = -d)
# ----------------------------------------------------------------------------------------------------------
class G:
    def __init__(self, ox, oz):
        self.b = MB(TR(ox, 0, oz))

    def bx(self, x0, x1, z0, z1, d0, d1, m):
        if x1 - x0 < 1e-4 or z1 - z0 < 1e-4 or d1 - d0 < 1e-5:
            return
        self.b.box(x0, x1, -d1, -d0, z0, z1, m=m)

    def bxM(self, M, x0, x1, z0, z1, d0, d1, m):
        self.b.box(x0, x1, -d1, -d0, z0, z1, m=m, M=M)

    def _face(self, vs, m):
        try:
            f = self.b.bm.faces.new(vs)
        except ValueError:
            return
        self.b._fin([f], (1, 1, 1), m)

    def hm(self, x0, x1, z0, prof, m, caps=True):
        """horizontal moulding: prof [(z, d)] bottom -> top, swept along x."""
        A = self.b.verts([(x0, -d, z0 + z) for z, d in prof])
        B = self.b.verts([(x1, -d, z0 + z) for z, d in prof])
        for i in range(len(prof) - 1):
            self._face([A[i], B[i], B[i + 1], A[i + 1]], m)
        if caps:
            for x, V in ((x0, A), (x1, B)):
                pts = [(x, -d, z0 + z) for z, d in prof]
                if prof[-1][1] > 1e-5:
                    pts.append((x, 0.0, z0 + prof[-1][0]))
                if prof[0][1] > 1e-5:
                    pts.append((x, 0.0, z0 + prof[0][0]))
                pts = _dedupe(pts)
                if len(pts) >= 3:
                    self._face(self.b.verts(pts), m)

    def vm(self, z0, z1, x0, prof, m):
        """vertical moulding: prof [(x, d)] left -> right, swept along z."""
        A = self.b.verts([(x0 + x, -d, z0) for x, d in prof])
        B = self.b.verts([(x0 + x, -d, z1) for x, d in prof])
        for i in range(len(prof) - 1):
            self._face([A[i], A[i + 1], B[i + 1], B[i]], m)
        for z, V in ((z0, A), (z1, B)):
            pts = [(x0 + x, -d, z) for x, d in prof]
            if len(_dedupe(pts)) >= 3:
                self._face(self.b.verts(_dedupe(pts)), m)

    def fr(self, pts, prof, m, closed=False, caps=True):
        """frame sweep along a path in XZ; prof [(w, d)], w = offset to the right of travel (outside for CCW)."""
        n = len(pts)
        P = [Vector(p) for p in pts]
        segs = n if closed else n - 1
        rn = []
        for i in range(segs):
            t = (P[(i + 1) % n] - P[i]).normalized()
            rn.append(Vector((t.y, -t.x)))
        mit = []
        for i in range(n):
            if not closed and i == 0:
                mit.append(rn[0])
            elif not closed and i == n - 1:
                mit.append(rn[-1])
            else:
                a, b = rn[(i - 1) % segs], rn[i % segs]
                mm = a + b
                mit.append(mm / max(0.2, 1.0 + a.dot(b)))
        rings = []
        for w, d in prof:
            rings.append(self.b.verts([(P[i].x + mit[i].x * w, -d, P[i].y + mit[i].y * w) for i in range(n)]))
        for k in range(len(prof) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(segs):
                j = (i + 1) % n
                self._face([A[i], A[j], B[j], B[i]], m)
        if caps and not closed:
            for i in (0, n - 1):
                pts3 = _dedupe([(P[i].x + mit[i].x * w, -d, P[i].y + mit[i].y * w) for w, d in prof])
                if len(pts3) >= 3:
                    self._face(self.b.verts(pts3), m)

    def yp(self, poly, d0, d1, m):
        """polygon in XZ (CCW) extruded in depth from d0 to d1 (front face + sides)."""
        F = self.b.verts([(x, -d1, z) for x, z in poly])
        Bk = self.b.verts([(x, -d0, z) for x, z in poly])
        self._face(F, m)
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            self._face([Bk[i], Bk[j], F[j], F[i]], m)

    def xp(self, poly, x0, x1, m):
        """polygon in (d, z) (side profile) extruded along x from x0 to x1 (brackets, corbels, keystones)."""
        A = self.b.verts([(x0, -d, z) for d, z in poly])
        B = self.b.verts([(x1, -d, z) for d, z in poly])
        self._face(A, m)
        self._face(list(reversed(B)), m)
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            self._face([A[i], A[j], B[j], B[i]], m)

    def rosette(self, x, z, d0, r, m):
        prof = [(r, 0.0), (r, 0.012), (r * 0.8, 0.02), (r * 0.55, 0.03), (r * 0.35, 0.03), (r * 0.25, 0.038), (0.0, 0.042)]
        M = TR(x, -d0, z) @ Matrix.Rotation(PI / 2, 4, 'X')
        self.b.lathe(prof, 20, m=m, M=M, close_bot=False)

    def knob(self, x, z, d0, m):
        prof = [(0.03, 0.0), (0.03, 0.005), (0.012, 0.01), (0.01, 0.045), (0.026, 0.055), (0.03, 0.07), (0.02, 0.08), (0.0, 0.082)]
        M = TR(x, -d0, z) @ Matrix.Rotation(PI / 2, 4, 'X')
        self.b.lathe(prof, 20, m=m, M=M)

    def glass(self, x0, x1, z0, z1, d, m):
        self.b.quad((x0, -d, z0), (x1, -d, z0), (x1, -d, z1), (x0, -d, z1), m=m)

    def obj(self, name, mats, bevel=0.004):
        return self.b.obj(name, mats, bevel=bevel, seg=2, bevel_angle=40.0)


def _dedupe(pts):
    out = []
    for p in pts:
        if not out or (Vector(p) - Vector(out[-1])).length > 1e-6:
            out.append(p)
    if len(out) > 1 and (Vector(out[0]) - Vector(out[-1])).length < 1e-6:
        out.pop()
    return out


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# ----------------------------------------------------------------------------------------------------------
# window / door parts
# ----------------------------------------------------------------------------------------------------------
def sash(g, K, x0, x1, z0, z1, d, lites=(1, 1), fw=0.055, top=0.06, bot=0.08, th=0.04, mw=0.022, m=None, horns=False):
    """one sash (frame ring + muntins + glass) with its front face at depth d."""
    m = K['PAINT'] if m is None else m
    g.bx(x0, x0 + fw, z0, z1, d - th, d, m)
    g.bx(x1 - fw, x1, z0, z1, d - th, d, m)
    g.bx(x0 + fw, x1 - fw, z0, z0 + bot, d - th, d, m)
    g.bx(x0 + fw, x1 - fw, z1 - top, z1, d - th, d, m)
    nx, nz = lites
    ix0, ix1, iz0, iz1 = x0 + fw, x1 - fw, z0 + bot, z1 - top
    for i in range(1, nx):
        x = ix0 + (ix1 - ix0) * i / nx
        g.bx(x - mw / 2, x + mw / 2, iz0, iz1, d - th * 0.8, d - 0.004, m)
    for j in range(1, nz):
        z = iz0 + (iz1 - iz0) * j / nz
        g.bx(ix0, ix1, z - mw / 2, z + mw / 2, d - th * 0.8, d - 0.004, m)
    g.glass(ix0, ix1, iz0, iz1, d - th * 0.55, K['GLASS'])
    if horns:
        g.bx(x0, x0 + fw, z0 - 0.07, z0, d - th, d - 0.004, m)
        g.bx(x1 - fw, x1, z0 - 0.07, z0, d - th, d - 0.004, m)


def double_hung(g, K, x0, x1, z0, z1, rec, up=(1, 1), lo=(1, 1), m=None, meet=None):
    zm = meet if meet is not None else (z0 + z1) / 2
    # frame lining at the back of the opening (visible around the sashes)
    mm = K['PAINT'] if m is None else m
    g.bx(x0, x1, z0, z1, -rec - 0.02, -rec + 0.005, mm)
    sash(g, K, x0 + 0.01, x1 - 0.01, zm - 0.02, z1 - 0.005, -rec + 0.06, up, m=m, bot=0.04, horns=True)
    sash(g, K, x0 + 0.01, x1 - 0.01, z0 + 0.005, zm + 0.02, -rec + 0.105, lo, m=m, top=0.04, bot=0.09)
    # blind stops / parting bead
    g.bx(x0, x0 + 0.018, z0, z1, -0.03, -0.0, mm)
    g.bx(x1 - 0.018, x1, z0, z1, -0.03, -0.0, mm)
    g.bx(x0, x1, z1 - 0.018, z1, -0.03, 0.0, mm)


def sill(g, K, x0, x1, z_top, proj=0.11, th=0.07, m=None):
    m = K['PAINT'] if m is None else m
    prof = [(0.0, 0.0), (0.0, proj - 0.015), (0.012, proj), (th - 0.012, proj), (th, proj - 0.02), (th + 0.004, 0.0)]
    g.hm(x0, x1, z_top - th, prof, m)
    return {'x0': x0, 'x1': x1, 'z0': z_top - th, 'z1': z_top, 'd': proj}


def crown(g, K, x0, x1, z0, h=0.24, proj=0.2, m=None, dentils=True):
    m = K['PAINT'] if m is None else m
    prof = [(0.0, 0.0), (0.0, 0.045), (0.035, 0.075), (0.05, proj - 0.03), (h * 0.45, proj - 0.03), (h * 0.5, proj),
            (h * 0.66, proj + 0.005), (h * 0.8, proj - 0.02), (h * 0.9, proj - 0.03), (h, 0.02), (h, 0.0)]
    g.hm(x0, x1, z0, prof, m)
    if dentils:
        x = x0 + 0.05
        while x + 0.035 < x1 - 0.04:
            g.bx(x, x + 0.035, z0 + 0.0, z0 + 0.045, 0.0, 0.075, m)
            x += 0.065
    return {'x0': x0, 'x1': x1, 'z0': z0, 'z1': z0 + h, 'd': proj + 0.005}


def reeds(g, m, x0, x1, z0, z1, d, n=3):
    w = (x1 - x0) / (2 * n + 1)
    for i in range(n):
        a = x0 + w * (2 * i + 1)
        g.bx(a, a + w, z0, z1, d, d + 0.009, m)


def scroll_bracket(g, m, xc, w, z0, h, proj):
    k = h / 0.65
    poly = [(0.0, 0.0), (0.028, 0.0), (0.045, 0.04 * k), (0.038, 0.1 * k), (0.05, 0.18 * k), (0.08 * proj / 0.16, 0.26 * k),
            (0.12 * proj / 0.16, 0.31 * k), (proj, 0.37 * k), (proj, 0.65 * k), (0.0, 0.65 * k)]
    g.xp([(d, z0 + z) for d, z in poly], xc - w / 2, xc + w / 2, m)


def corbel(g, m, xc, w, ztop, h=0.2, proj=0.1):
    poly = [(0.0, ztop - h), (0.02, ztop - h), (0.05, ztop - h + 0.07), (proj, ztop - h * 0.35), (proj, ztop), (0.0, ztop)]
    g.xp(poly, xc - w / 2, xc + w / 2, m)


def keystone(g, m, xc, z0, h, wb, wt, d):
    g.yp([(xc - wb / 2, z0), (xc + wb / 2, z0), (xc + wt / 2, z0 + h), (xc - wt / 2, z0 + h)], 0.0, d, m)


# ----------------------------------------------------------------------------------------------------------
# units (each returns meta: opening + near-LOD geometry hints). w, h in metres.
# ----------------------------------------------------------------------------------------------------------
def u_vic(g, K):
    P = K['PAINT']
    ox0, ox1, oz0, oz1, rec = 0.425, 1.375, 0.62, 2.82, 0.14
    double_hung(g, K, ox0, ox1, oz0, oz1, rec, (2, 1), (2, 1))
    cw = 0.15
    for a in (ox0 - cw, ox1):
        g.bx(a, a + cw, oz0, oz1, 0.0, 0.03, P)
        reeds(g, P, a + 0.01, a + cw - 0.01, oz0 + 0.02, oz1 - 0.01, 0.03)
        g.bx(a - 0.01, a + cw + 0.01, oz1, oz1 + 0.17, 0.0, 0.042, P)
        g.rosette(a + cw / 2, oz1 + 0.085, 0.042, 0.052, P)
    g.bx(ox0, ox1, oz1, oz1 + 0.17, 0.0, 0.028, P)
    cx = (ox0 + ox1) / 2
    g.yp([(cx - 0.16, oz1 + 0.085), (cx, oz1 + 0.035), (cx + 0.16, oz1 + 0.085), (cx, oz1 + 0.135)], 0.028, 0.042, K['ACC'])
    for s in (-1, 1):
        g.rosette(cx + s * 0.27, oz1 + 0.085, 0.028, 0.03, P)
    g.bx(ox0 - cw - 0.02, ox1 + cw + 0.02, oz1 + 0.17, oz1 + 0.2, 0.0, 0.05, P)
    for xc in (ox0 - cw - 0.075, ox1 + cw + 0.075):
        scroll_bracket(g, P, xc, 0.085, oz1 - 0.33, 0.83, 0.17)
    cr = crown(g, K, ox0 - cw - 0.16, ox1 + cw + 0.16, oz1 + 0.2, 0.25, 0.2, K['ACC'])
    sl = sill(g, K, ox0 - cw - 0.07, ox1 + cw + 0.07, oz0 + 0.005, 0.115, 0.075)
    g.bx(ox0 - 0.1, ox1 + 0.1, oz0 - 0.29, oz0 - 0.07, 0.0, 0.022, P)
    g.hm(ox0 - 0.1, ox1 + 0.1, oz0 - 0.3, [(0, 0), (0, 0.03), (0.02, 0.035), (0.03, 0.0)], P)
    for xc in (ox0 - cw + 0.02, ox1 + cw - 0.02):
        corbel(g, P, xc, 0.07, oz0 - 0.07, 0.24, 0.1)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=cr)


def u_edw(g, K):
    P = K['PAINT']
    ox0, ox1, oz0, oz1, rec = 0.35, 1.35, 0.55, 2.55, 0.14
    double_hung(g, K, ox0, ox1, oz0, oz1, rec, (3, 1), (1, 1), meet=oz0 + (oz1 - oz0) * 0.56)
    path = [(ox1, oz0), (ox1, oz1), (ox0, oz1), (ox0, oz0)]
    g.fr(path, [(0.0, 0.0), (0.0, 0.024), (0.1, 0.024), (0.1, 0.034), (0.118, 0.046), (0.135, 0.03), (0.135, 0.0)], P)
    g.bx(ox0 - 0.15, ox1 + 0.15, oz1 + 0.135, oz1 + 0.31, 0.0, 0.03, P)
    keystone(g, P, (ox0 + ox1) / 2, oz1 - 0.04, 0.36, 0.15, 0.2, 0.06)
    cr = crown(g, K, ox0 - 0.21, ox1 + 0.21, oz1 + 0.31, 0.12, 0.09, P, dentils=False)
    sl = sill(g, K, ox0 - 0.19, ox1 + 0.19, oz0 + 0.004, 0.09, 0.06)
    g.hm(ox0 - 0.14, ox1 + 0.14, oz0 - 0.1, [(0, 0), (0, 0.03), (0.04, 0.0)], P)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=cr)


def u_ital(g, K):
    P = K['PAINT']
    ox0, ox1, oz0, oz1, rec = 0.425, 1.375, 0.6, 2.9, 0.15
    r = (ox1 - ox0) / 2
    cx, sz = (ox0 + ox1) / 2, oz1 - r
    # sashes: lower rectangle + upper with arched head (frame ring swept along the arch)
    g.bx(ox0, ox1, oz0, sz, -rec - 0.02, -rec + 0.005, P)
    sash(g, K, ox0 + 0.01, ox1 - 0.01, oz0 + 0.005, 1.8, -rec + 0.105, (1, 1), top=0.04, bot=0.09)
    sash(g, K, ox0 + 0.01, ox1 - 0.01, 1.76, sz, -rec + 0.06, (2, 1), top=0.0, bot=0.04, horns=True)
    ap = arc(cx, sz, r - 0.01, PI, 0.0, 16)
    g.fr(ap, [(0.0, -rec + 0.06), (0.055, -rec + 0.06), (0.055, -rec + 0.02)], P, caps=False)
    head = [(cx, sz)] + arc(cx, sz, r - 0.065, 0.0, PI, 16)
    g._face(g.b.verts([(x, rec - 0.08, z) for x, z in reversed(head)]), K['GLASS'])
    g.bx(cx - 0.011, cx + 0.011, sz, sz + r - 0.06, -rec + 0.025, -rec + 0.055, P)
    g.bx(ox0, ox1, sz - 0.01, sz + 0.01, -rec + 0.025, -rec + 0.055, P)
    # casing around the arched opening + hood moulding with keystone and label stops
    cp = [(ox1, oz0)] + arc(cx, sz, r, 0.0, PI, 20) + [(ox0, oz0)]
    g.fr(cp, [(0.0, 0.0), (0.0, 0.028), (0.09, 0.028), (0.09, 0.04), (0.105, 0.04), (0.105, 0.0)], P)
    hp = [(ox1 + 0.105, sz - 0.24)] + arc(cx, sz, r + 0.105, 0.0, PI, 22) + [(ox0 - 0.105, sz - 0.24)]
    g.fr(hp, [(0.0, 0.0), (0.0, 0.03), (0.035, 0.07), (0.075, 0.08), (0.11, 0.06), (0.13, 0.0)], K['ACC'])
    for xs in (ox0 - 0.17, ox1 + 0.17):
        g.bx(xs - 0.07, xs + 0.07, sz - 0.36, sz - 0.22, 0.0, 0.07, K['ACC'])
    keystone(g, K['ACC'], cx, oz1 - 0.06, 0.36, 0.13, 0.19, 0.095)
    sl = sill(g, K, ox0 - 0.2, ox1 + 0.2, oz0 + 0.005, 0.11, 0.07)
    for xc in (ox0 - 0.08, ox1 + 0.08):
        corbel(g, P, xc, 0.08, oz0 - 0.07, 0.24, 0.1)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=None, arch=r)


def u_brick(g, K):
    S = K['STONE']
    ox0, ox1, oz0, oz1, rec = 0.35, 1.35, 0.45, 2.25, 0.2
    double_hung(g, K, ox0, ox1, oz0, oz1, rec, (1, 1), (1, 1))
    # splayed jack-arch lintel of voussoirs + keystone
    n, gap, lh = 9, 0.006, 0.3
    xa0, xa1 = ox0 - 0.16, ox1 + 0.16
    for i in range(n):
        if i == n // 2:
            continue
        t0, t1 = i / n, (i + 1) / n
        b0, b1 = ox0 + (ox1 - ox0) * t0, ox0 + (ox1 - ox0) * t1
        a0, a1 = xa0 + (xa1 - xa0) * t0, xa0 + (xa1 - xa0) * t1
        g.yp([(b0 + gap, oz1), (b1 - gap, oz1), (a1 - gap, oz1 + lh), (a0 + gap, oz1 + lh)], 0.0, 0.025, S)
    kc = (ox0 + ox1) / 2
    keystone(g, S, kc, oz1 - 0.04, 0.4, 0.15, 0.22, 0.055)
    sl = sill(g, K, ox0 - 0.13, ox1 + 0.13, oz0 + 0.005, 0.085, 0.1, m=S)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=None)


def u_stucco(g, K):
    P = K['PAINT']
    ox0, ox1, oz0, oz1, rec = 0.25, 2.25, 0.4, 2.0, 0.12
    g.bx(ox0, ox1, oz0, oz1, -rec - 0.02, -rec + 0.005, P)
    fw = 0.06
    # flanking casements with horizontal muntins, fixed centre picture pane
    cwid = 0.46
    sash(g, K, ox0 + 0.01, ox0 + cwid, oz0 + 0.01, oz1 - 0.01, -rec + 0.08, (1, 4), fw=fw, top=fw, bot=fw)
    sash(g, K, ox1 - cwid, ox1 - 0.01, oz0 + 0.01, oz1 - 0.01, -rec + 0.08, (1, 4), fw=fw, top=fw, bot=fw)
    sash(g, K, ox0 + cwid, ox1 - cwid, oz0 + 0.01, oz1 - 0.01, -rec + 0.06, (1, 1), fw=0.07, top=0.07, bot=0.07)
    path = [(ox1, oz0), (ox1, oz1), (ox0, oz1), (ox0, oz0)]
    g.fr(path + [], [(0.0, 0.0), (0.0, 0.018), (0.07, 0.024), (0.11, 0.0)], K['WALLR'], closed=True)
    sl = sill(g, K, ox0 - 0.12, ox1 + 0.12, oz0 + 0.002, 0.07, 0.055, m=K['TILE'])
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=None)


def u_modern(g, K):
    A = K['ALU']
    ox0, ox1, oz0, oz1, rec = 0.1, 1.5, 0.35, 1.95, 0.1
    g.bx(ox0, ox1, oz0, oz1, -rec - 0.02, -rec + 0.01, A)
    fw = 0.045
    g.bx(ox0, ox0 + fw, oz0, oz1, -rec, -0.02, A)
    g.bx(ox1 - fw, ox1, oz0, oz1, -rec, -0.02, A)
    g.bx(ox0, ox1, oz0, oz0 + fw, -rec, -0.02, A)
    g.bx(ox0, ox1, oz1 - fw, oz1, -rec, -0.02, A)
    zt = oz1 - 0.42
    g.bx(ox0 + fw, ox1 - fw, zt - 0.025, zt + 0.025, -rec, -0.025, A)
    xm = (ox0 + ox1) / 2
    sash(g, K, ox0 + fw, xm + 0.02, oz0 + fw, zt - 0.025, -0.04, (1, 1), fw=0.035, top=0.035, bot=0.035, th=0.03, m=A)
    sash(g, K, xm - 0.02, ox1 - fw, oz0 + fw, zt - 0.025, -0.07, (1, 1), fw=0.035, top=0.035, bot=0.035, th=0.03, m=A)
    g.glass(ox0 + fw, ox1 - fw, zt + 0.025, oz1 - fw, -rec + 0.055, K['GLASS'])
    g.bx(ox0 + fw, ox1 - fw, oz0 + fw - 0.006, oz0 + fw + 0.008, -0.03, -0.02, K['DARK'])
    sl = sill(g, K, ox0 - 0.04, ox1 + 0.04, oz0 + 0.002, 0.06, 0.05, m=K['CONC'])
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=None)


def u_loft(g, K):
    I = K['IRON']
    ox0, ox1, oz0, oz1, rec = 0.15, 2.15, 0.3, 2.8, 0.3
    g.bx(ox0, ox1, oz0, oz1, -rec - 0.02, -rec + 0.005, I)
    fw, mw = 0.05, 0.026
    d0, d1 = -rec + 0.04, -rec + 0.1
    g.bx(ox0, ox0 + fw, oz0, oz1, d0, d1, I); g.bx(ox1 - fw, ox1, oz0, oz1, d0, d1, I)
    g.bx(ox0, ox1, oz0, oz0 + fw, d0, d1, I); g.bx(ox0, ox1, oz1 - fw, oz1, d0, d1, I)
    nx, nz = 4, 5
    for i in range(1, nx):
        x = ox0 + (ox1 - ox0) * i / nx
        g.bx(x - mw / 2, x + mw / 2, oz0 + fw, oz1 - fw, d0, d1 - 0.01, I)
    for j in range(1, nz):
        z = oz0 + (oz1 - oz0) * j / nz
        g.bx(ox0 + fw, ox1 - fw, z - mw / 2, z + mw / 2, d0, d1 - 0.01, I)
    g.glass(ox0 + fw, ox1 - fw, oz0 + fw, oz1 - fw, d0 + 0.02, K['GLASS'])
    # tilted hopper in the middle
    zh0, zh1 = oz0 + (oz1 - oz0) * 2 / nz, oz0 + (oz1 - oz0) * 3 / nz
    xh0, xh1 = ox0 + (ox1 - ox0) / nx, ox1 - (ox1 - ox0) / nx
    M = TR(0, -(d1 + 0.02), zh0) @ Matrix.Rotation(-0.18, 4, 'X') @ TR(0, (d1 + 0.02), -zh0)
    g.bxM(M, xh0 + 0.01, xh1 - 0.01, zh0 + 0.01, zh1 - 0.01, d1 - 0.005, d1 + 0.02, I)
    g.bx(ox0 - 0.12, ox1 + 0.12, oz1, oz1 + 0.09, 0.0, 0.012, I)
    sl = sill(g, K, ox0 - 0.08, ox1 + 0.08, oz0 + 0.004, 0.07, 0.09, m=K['CONC'])
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=sl, crown=None)


def panel(g, m, x0, x1, z0, z1, d, raise_=0.014):
    """raised panel with a bevelled field and a small bolection moulding."""
    g.fr([(x1, z0), (x1, z1), (x0, z1), (x0, z0)], [(0.0, d), (0.0, d + 0.012), (0.02, d + 0.012), (0.024, d)], m, closed=True)
    b = 0.05
    g.yp([(x0 - 0.0, z0), (x1, z0), (x1, z1), (x0, z1)], d - 0.004, d + 0.002, m)
    g.yp([(x0 + b, z0 + b), (x1 - b, z0 + b), (x1 - b, z1 - b), (x0 + b, z1 - b)], d, d + raise_, m)


def door_leaf(g, K, x0, x1, z0, z1, d, kind):
    A = K['ACC']
    st, tr, lr, br = 0.13, 0.13, 0.2, 0.26
    g.bx(x0, x1, z0, z1, d - 0.06, d - 0.045, A)         # back board (behind panels)
    g.bx(x0, x0 + st, z0, z1, d - 0.04, d, A)
    g.bx(x1 - st, x1, z0, z1, d - 0.04, d, A)
    g.bx(x0 + st, x1 - st, z1 - tr, z1, d - 0.04, d, A)
    g.bx(x0 + st, x1 - st, z0, z0 + br, d - 0.04, d, A)
    zl = z0 + 1.0
    g.bx(x0 + st, x1 - st, zl - lr / 2, zl + lr / 2, d - 0.04, d, A)
    ix0, ix1 = x0 + st, x1 - st
    if kind == 'vic':
        xm = (ix0 + ix1) / 2
        g.bx(xm - 0.05, xm + 0.05, z0 + br, z1 - tr, d - 0.04, d, A)
        for a, b in ((ix0, xm - 0.05), (xm + 0.05, ix1)):
            panel(g, A, a, b, z0 + br, zl - lr / 2, d - 0.035)
            g.glass(a, b, zl + lr / 2, z1 - tr, d - 0.025, K['GLASS'])
            g.fr([(b, zl + lr / 2), (b, z1 - tr), (a, z1 - tr), (a, zl + lr / 2)], [(0.0, d), (0.0, d + 0.01), (0.018, d + 0.01), (0.02, d)], A, closed=True)
    else:
        panel(g, A, ix0, ix1, z0 + br, zl - lr / 2, d - 0.035)
        g.glass(ix0, ix1, zl + lr / 2, z1 - tr, d - 0.025, K['GLASS'])
        g.fr([(ix1, zl + lr / 2), (ix1, z1 - tr), (ix0, z1 - tr), (ix0, zl + lr / 2)], [(0.0, d), (0.0, d + 0.012), (0.02, d + 0.012), (0.024, d)], A, closed=True)
    g.knob(x1 - st + 0.06, z0 + 1.0, d, K['BRASS'])
    g.bx(x1 - st + 0.035, x1 - st + 0.085, z0 + 1.06, z0 + 1.2, d, d + 0.006, K['BRASS'])
    g.bx((x0 + x1) / 2 - 0.15, (x0 + x1) / 2 + 0.15, zl - 0.03, zl + 0.03, d, d + 0.008, K['BRASS'])


def u_vicdoor(g, K):
    P = K['PAINT']
    ox0, ox1, oz0, oz1, rec = 0.47, 1.53, 0.02, 2.78, 0.16
    zd = oz0 + 2.2
    g.bx(ox0, ox1, oz0, oz1, -rec - 0.08, -rec - 0.05, P)
    door_leaf(g, K, ox0 + 0.02, ox1 - 0.02, oz0, zd, -rec + 0.05, 'vic')
    g.bx(ox0, ox1, zd, zd + 0.07, -rec, -0.02, P)
    g.glass(ox0, ox1, zd + 0.07, oz1, -rec + 0.03, K['GLASS'])
    g.bx((ox0 + ox1) / 2 - 0.015, (ox0 + ox1) / 2 + 0.015, zd + 0.07, oz1, -rec + 0.02, -rec + 0.05, P)
    for a in (ox0 - 0.24, ox1 + 0.02):
        g.bx(a, a + 0.22, oz0, oz1, 0.0, 0.055, P)
        reeds(g, P, a + 0.02, a + 0.2, oz0 + 0.3, oz1 - 0.2, 0.055, 4)
        g.bx(a - 0.02, a + 0.24, oz0, oz0 + 0.28, 0.0, 0.07, P)
        g.hm(a - 0.02, a + 0.24, oz1 - 0.16, [(0, 0.055), (0.03, 0.07), (0.06, 0.07), (0.1, 0.09), (0.16, 0.09)], P, caps=True)
    g.bx(ox0 - 0.26, ox1 + 0.26, oz1, oz1 + 0.26, 0.0, 0.06, P)
    cx = (ox0 + ox1) / 2
    g.yp([(cx - 0.3, oz1 + 0.13), (cx, oz1 + 0.05), (cx + 0.3, oz1 + 0.13), (cx, oz1 + 0.21)], 0.06, 0.075, K['ACC'])
    cr = crown(g, K, ox0 - 0.34, ox1 + 0.34, oz1 + 0.26, 0.24, 0.2, P)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=None, crown=cr, door=[ox0, oz0, ox1, zd])


def u_edwdoor(g, K):
    P = K['PAINT']
    ox0, ox1, oz0, oz1, rec = 0.35, 1.35, 0.02, 2.6, 0.14
    zd = oz0 + 2.12
    g.bx(ox0, ox1, oz0, oz1, -rec - 0.08, -rec - 0.05, P)
    door_leaf(g, K, ox0 + 0.02, ox1 - 0.02, oz0, zd, -rec + 0.05, 'edw')
    g.bx(ox0, ox1, zd, zd + 0.06, -rec, -0.02, P)
    g.glass(ox0, ox1, zd + 0.06, oz1, -rec + 0.03, K['GLASS'])
    for k in (1, 2):
        x = ox0 + (ox1 - ox0) * k / 3
        g.bx(x - 0.012, x + 0.012, zd + 0.06, oz1, -rec + 0.02, -rec + 0.05, P)
    path = [(ox1, oz0), (ox1, oz1), (ox0, oz1), (ox0, oz0)]
    g.fr(path, [(0.0, 0.0), (0.0, 0.026), (0.11, 0.026), (0.11, 0.036), (0.128, 0.048), (0.145, 0.03), (0.145, 0.0)], P)
    g.bx(ox0 - 0.16, ox1 + 0.16, oz1 + 0.145, oz1 + 0.3, 0.0, 0.03, P)
    cr = crown(g, K, ox0 - 0.22, ox1 + 0.22, oz1 + 0.3, 0.12, 0.1, P, dentils=False)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=None, crown=cr, door=[ox0, oz0, ox1, zd])


def u_garage(g, K):
    P, A = K['PAINT'], K['ACC']
    ox0, ox1, oz0, oz1, rec = 0.18, 2.82, 0.02, 2.32, 0.2
    d = -rec + 0.06
    nsec = 4
    hs = (oz1 - oz0) / nsec
    for s in range(nsec):
        z0, z1 = oz0 + s * hs + 0.004, oz0 + (s + 1) * hs - 0.004
        g.bx(ox0, ox1, z0, z1, d - 0.04, d, A)
        npn = 4
        pw = (ox1 - ox0 - 0.1 * (npn + 1)) / npn
        for i in range(npn):
            a = ox0 + 0.1 + i * (pw + 0.1)
            if s == nsec - 1:
                g.fr([(a + pw, z0 + 0.12), (a + pw, z1 - 0.12), (a, z1 - 0.12), (a, z0 + 0.12)], [(0.0, d), (0.0, d + 0.01), (0.02, d + 0.01), (0.022, d)], A, closed=True)
                g.glass(a, a + pw, z0 + 0.12, z1 - 0.12, d - 0.02, K['GLASS'])
            else:
                g.yp([(a, z0 + 0.1), (a + pw, z0 + 0.1), (a + pw, z1 - 0.1), (a, z1 - 0.1)], d, d + 0.008, A)
                g.yp([(a + 0.06, z0 + 0.16), (a + pw - 0.06, z0 + 0.16), (a + pw - 0.06, z1 - 0.16), (a + 0.06, z1 - 0.16)], d + 0.008, d + 0.016, A)
    g.bx(ox0 + 1.2, ox0 + 1.44, oz0 + 0.9, oz0 + 0.96, d, d + 0.02, K['IRON'])
    g.bx(ox0, ox1, oz0, oz0 + 0.03, d - 0.04, d + 0.01, K['DARK'])
    path = [(ox1, oz0), (ox1, oz1), (ox0, oz1), (ox0, oz0)]
    g.fr(path, [(0.0, 0.0), (0.0, 0.03), (0.12, 0.03), (0.12, 0.04), (0.14, 0.04), (0.15, 0.0)], P)
    return dict(open=[ox0, oz0, ox1, oz1], rec=rec, sill=None, crown=None)


def u_store(g, K, door=False):
    B = K['BRONZE']
    ox0, ox1, oz0, oz1, rec = 0.08, 3.22, 0.0, 3.32, 0.12
    fw = 0.065
    zk, zt = 0.5, 2.55
    d = -rec
    g.bx(ox0, ox1, oz0, oz1, d - 0.03, d - 0.01, K['DARK'])
    xm = (ox0 + ox1) / 2
    dx0, dx1 = xm - 0.52, xm + 0.52
    # kick plate + display glass + transom
    for a, b in (((ox0, dx0), (dx1, ox1)) if door else ((ox0, ox1),)):
        g.bx(a, b, oz0, zk, d, d + 0.02, K['KICK'])
        g.hm(a, b, zk - 0.02, [(0, d + 0.02), (0.0, d + 0.05), (0.04, d + 0.05), (0.05, d)], B)
        g.glass(a, b, zk + 0.03, zt, d + 0.02, K['GLASS'])
    g.glass(ox0, ox1, zt, oz1, d + 0.02, K['GLASS'])
    for a in (ox0, ox1 - fw):
        g.bx(a, a + fw, oz0, oz1, d, d + 0.07, B)
    g.bx(ox0, ox1, zt - 0.04, zt + 0.06, d, d + 0.07, B)
    g.bx(ox0, ox1, oz1 - fw, oz1, d, d + 0.07, B)
    for k in (1, 2):
        x = ox0 + (ox1 - ox0) * k / 3
        g.bx(x - 0.025, x + 0.025, zt + 0.06, oz1 - fw, d, d + 0.06, B)
    if door:
        for a in (dx0 - fw, dx1):
            g.bx(a, a + fw, oz0, zt, d, d + 0.07, B)
        g.bx(dx0, dx1, oz0, oz0 + 0.24, d - 0.02, d + 0.03, B)
        g.bx(dx0, dx0 + 0.1, oz0, zt - 0.04, d - 0.02, d + 0.03, B)
        g.bx(dx1 - 0.1, dx1, oz0, zt - 0.04, d - 0.02, d + 0.03, B)
        g.bx(dx0, dx1, zt - 0.14, zt - 0.04, d - 0.02, d + 0.03, B)
        g.glass(dx0 + 0.1, dx1 - 0.1, oz0 + 0.24, zt - 0.14, d + 0.005, K['GLASS'])
        g.bx(dx0 + 0.12, dx1 - 0.12, oz0 + 1.0, oz0 + 1.05, d + 0.03, d + 0.07, K['ALU'])
    else:
        g.bx(xm - 0.03, xm + 0.03, zk, zt, d, d + 0.06, B)
    return dict(open=[ox0, zk if not door else oz0, ox1, oz1], hole=[ox0, oz0, ox1, oz1], rec=rec, sill=None, crown=None)


def u_awning(g, K):
    C = K['CANVAS']
    w, top, bot, proj = 3.2, 1.25, 0.42, 1.0
    x0, x1 = 0.0, w
    g._face(g.b.verts([(x0, 0.0, top), (x1, 0.0, top), (x1, -proj, bot), (x0, -proj, bot)]), C)
    g.bx(x0, x1, bot - 0.02, bot + 0.02, proj - 0.02, proj + 0.01, K['IRON'])
    # scalloped valance
    n = 16
    for i in range(n):
        a, b = x0 + w * i / n, x0 + w * (i + 1) / n
        poly = [(a, bot), (b, bot), (b, 0.12)] + [(b - (b - a) * t / 6, 0.12 - 0.05 * math.sin(PI * t / 6)) for t in range(1, 6)] + [(a, 0.12)]
        g._face(g.b.verts([(x, -proj - 0.01, z) for x, z in poly]), C)
    return dict(open=[0.0, 0.0, w, top], rec=0.0, sill=None, crown=None)


def u_cornice(g, K, W=2.4):
    P = K['PAINT']
    x0, x1 = -0.6, W + 0.6
    g.bx(x0, x1, 0.0, 0.5, 0.0, 0.03, P)
    g.hm(x0, x1, 0.0, [(0.0, 0.0), (0.0, 0.05), (0.03, 0.065), (0.06, 0.035), (0.07, 0.03)], P, caps=False)
    g.hm(x0, x1, 0.5, [(0.0, 0.03), (0.02, 0.06), (0.05, 0.075), (0.07, 0.075)], P, caps=False)
    x = x0 + 0.0125
    while x < x1:
        g.bx(x, x + 0.05, 0.57, 0.66, 0.0, 0.085, P)
        x += 0.1
    per = 0.6
    for k in range(-1, int(W / per) + 2):
        xc = 0.3 + k * per
        scroll_bracket(g, P, xc, 0.11, 0.12, 0.9, 0.33)
        g.bx(xc - 0.045, xc + 0.045, 0.06, 0.13, 0.0, 0.05, P)
        if k < int(W / per) + 1:
            a, b = xc + 0.1, xc + per - 0.1
            g.fr([(b, 0.14), (b, 0.44), (a, 0.44), (a, 0.14)], [(0.0, 0.03), (0.0, 0.042), (0.02, 0.042), (0.024, 0.03)], P, closed=True)
    prof = [(0.0, 0.0), (0.0, 0.34), (0.03, 0.35), (0.08, 0.35), (0.1, 0.38), (0.16, 0.4), (0.22, 0.41), (0.27, 0.39), (0.3, 0.37), (0.31, 0.0)]
    g.hm(x0, x1, 1.02, prof, P, caps=False)
    return dict(open=[0.0, 0.0, W, 0.0], rec=0.0, sill=None, crown={'x0': 0.0, 'x1': W, 'z0': 1.02, 'z1': 1.33, 'd': 0.41})


def u_belt(g, K, W=2.4):
    P = K['PAINT']
    prof = [(0.0, 0.0), (0.0, 0.03), (0.03, 0.06), (0.1, 0.07), (0.14, 0.06), (0.2, 0.085), (0.24, 0.085), (0.27, 0.045), (0.3, 0.0)]
    g.hm(-0.6, W + 0.6, 0.05, prof, P, caps=False)
    return dict(open=[0.0, 0.05, W, 0.35], rec=0.0, sill=None, crown=None)


def u_ac(g, K):
    Mt = K['METAL']
    x0, x1, z0, z1, dp = 0.12, 0.78, 0.26, 0.7, 0.42
    g.bx(x0, x1, z0, z1, 0.0, dp, Mt)
    n = 11
    for i in range(n):
        z = z0 + 0.05 + (z1 - z0 - 0.1) * i / (n - 1)
        M = TR(0, -dp, z) @ Matrix.Rotation(0.5, 4, 'X') @ TR(0, dp, -z)
        g.bxM(M, x0 + 0.05, x0 + 0.42, z - 0.006, z + 0.006, dp - 0.004, dp + 0.012, Mt)
    g.bx(x0 + 0.46, x1 - 0.04, z0 + 0.05, z1 - 0.05, dp, dp + 0.004, K['DARK'])
    for i in range(6):
        x = x0 + 0.48 + i * 0.03
        g.bx(x, x + 0.012, z0 + 0.06, z1 - 0.06, dp, dp + 0.01, Mt)
    g.bx(x0 + 0.47, x0 + 0.53, z1 - 0.12, z1 - 0.07, dp + 0.004, dp + 0.02, K['DARK'])
    for x in (x0 + 0.06, x1 - 0.1):
        g.bx(x, x + 0.03, z0 - 0.22, z0, 0.0, 0.03, K['IRON'])
        g.xp([(0.0, z0 - 0.2), (0.03, z0 - 0.2), (dp * 0.8, z0 - 0.01), (dp * 0.8, z0), (dp * 0.7, z0)], x, x + 0.025, K['IRON'])
    return dict(open=[x0, z0, x1, z1], rec=0.0, sill=None, crown=None, depth=dp)


def u_drain(g, K, H=2.4):
    Gv = K['GALV']
    g.b.cyl(0.15, -0.075, -0.6, H + 0.6, 0.045, n=20, m=Gv)
    for z in (0.6, 1.8):
        g.bx(0.09, 0.21, z - 0.025, z + 0.025, 0.0, 0.125, Gv)
        g.b.cyl(0.15, -0.075, z - 0.035, z + 0.035, 0.052, n=20, m=Gv)
    for z in (0.0, 1.2):
        g.b.cyl(0.15, -0.075, z - 0.02, z + 0.02, 0.05, n=20, m=Gv)
    return dict(open=[0.1, 0.0, 0.2, H], rec=0.0, sill=None, crown=None)


def u_fire(g, K):
    I = K['IRON']
    W, d = 3.2, 0.9
    g.bx(0.0, W, 0.0, 0.12, d - 0.06, d, I)
    g.bx(0.0, W, 0.13, 0.15, d - 0.8, d - 0.05, I)
    g.bx(0.0, W, 0.97, 1.02, d - 0.03, d, I)
    g.bx(0.0, W, 0.52, 0.545, d - 0.02, d, I)
    x = 0.04
    while x < W:
        g.bx(x, x + 0.016, 0.12, 0.97, d - 0.02, d - 0.004, I)
        x += 0.115
    for xp in (0.02, W - 0.05):
        g.bx(xp, xp + 0.035, 0.0, 1.02, d - 0.04, d + 0.005, I)
    # stair to the landing above (stringers + treads), drop ladder
    ang = math.atan2(2.95, 1.7)
    for dd in (d - 0.62, d - 0.08):
        M = TR(0.35, -dd, 0.12) @ Matrix.Rotation(PI / 2 - ang, 4, 'Y')
        g.bxM(M, -0.06, 0.06, 0.0, 3.4, -0.01, 0.01, I)
    for k in range(12):
        t = (k + 0.5) / 12
        xx, zz = 0.35 + 1.7 * t, 0.12 + 2.95 * t
        g.bx(xx - 0.12, xx + 0.12, zz - 0.012, zz + 0.012, d - 0.62, d - 0.08, I)
    for xr in (2.55, 2.9):
        g.bx(xr, xr + 0.025, 0.15, 2.9, d + 0.02, d + 0.045, I)
    z = 0.4
    while z < 2.9:
        g.b.cyl(0, 0, 0, 1, 0.01, n=8, m=I, M=TR(2.55, -(d + 0.032), z) @ Matrix.Rotation(PI / 2, 4, 'Y') @ Matrix.Diagonal((1, 1, 0.375, 1)))
        z += 0.3
    for xb in (0.5, W - 0.5):
        g.xp([(0.0, -0.35), (0.04, -0.35), (d - 0.05, 0.0), (d - 0.05, 0.02), (0.0, 0.02)], xb - 0.015, xb + 0.015, I)
    return dict(open=[0.0, 0.0, W, 3.0], rec=0.0, sill=None, crown=None, depth=d)


# key: (w, h, builder, tile axis, extra geometry margin beyond the rect for packing)
NOHOLE = ('awning', 'cornice', 'belt', 'ac', 'drain', 'fire')
UNITS = [
    ('vic_win', 1.80, 3.40, u_vic, None, 0.0),
    ('edw_win', 1.70, 3.05, u_edw, None, 0.0),
    ('ital_win', 1.80, 3.45, u_ital, None, 0.0),
    ('brick_win', 1.70, 2.80, u_brick, None, 0.0),
    ('stucco_win', 2.50, 2.25, u_stucco, None, 0.0),
    ('modern_win', 1.60, 2.15, u_modern, None, 0.0),
    ('loft_win', 2.30, 3.05, u_loft, None, 0.0),
    ('vic_door', 2.00, 3.40, u_vicdoor, None, 0.0),
    ('edw_door', 1.70, 3.10, u_edwdoor, None, 0.0),
    ('garage', 3.00, 2.55, u_garage, None, 0.0),
    ('store', 3.30, 3.40, lambda g, K: u_store(g, K, False), None, 0.0),
    ('store_door', 3.30, 3.40, lambda g, K: u_store(g, K, True), None, 0.0),
    ('awning', 3.20, 1.35, u_awning, None, 0.0),
    ('cornice', 2.40, 1.40, u_cornice, 'x', 0.65),
    ('belt', 2.40, 0.40, u_belt, 'x', 0.65),
    ('ac', 0.90, 0.80, u_ac, None, 0.0),
    ('drain', 0.30, 2.40, u_drain, 'z', 0.65),
    ('fire', 3.20, 3.10, u_fire, None, 0.0),
]


def pack(S, gap=0.1):
    """shelf-pack units into an S x S metre square; returns {key: (x, z)} bottom-left, or None."""
    order = sorted(UNITS, key=lambda u: -(u[2] + (2 * u[5] if u[4] == 'z' else 0)))
    pos = {}
    x, z, rowh = gap, gap, 0.0
    for key, w, h, fn, tile, mg in order:
        mx = mg if tile == 'x' else 0.0
        mz = mg if tile == 'z' else 0.0
        fw, fh = w + 2 * mx, h + 2 * mz
        if x + fw + gap > S:
            x, z, rowh = gap, z + rowh + gap, 0.0
        if z + fh + gap > S:
            return None
        pos[key] = (x + mx, z + mz)
        x += fw + gap
        rowh = max(rowh, fh)
    return pos


# ----------------------------------------------------------------------------------------------------------
# bake
# ----------------------------------------------------------------------------------------------------------
def build_scene(S):
    L.reset_factory()
    K = make_materials()
    pos = None
    while pos is None:
        pos = pack(S)
        if pos is None:
            S += 0.25
    meta = {}
    for key, w, h, fn, tile, mg in UNITS:
        ox, oz = pos[key]
        g = G(ox, oz)
        info = fn(g, K)
        g.obj('u_' + key, MLIST)
        info.update(dict(x=ox, z=oz, w=w, h=h, tile=tile))
        meta[key] = info
    # the wall every unit sits on, with holes at the openings (+ reveals for AO, arch spandrels)
    holes = []
    wb = MB()
    for key, u in meta.items():
        if key in NOHOLE:
            continue
        hx0, hz0, hx1, hz1 = u.get('hole', u['open'])
        X0, Z0, X1, Z1 = u['x'] + hx0, u['z'] + hz0, u['x'] + hx1, u['z'] + hz1
        holes.append((X0, Z0, X1, Z1))
        r = u['rec'] + 0.03
        wb.quad((X0, 0, Z0), (X0, r, Z0), (X0, r, Z1), (X0, 0, Z1), m=0)
        wb.quad((X1, r, Z0), (X1, 0, Z0), (X1, 0, Z1), (X1, r, Z1), m=0)
        wb.quad((X0, r, Z0), (X1, r, Z0), (X1, 0, Z0), (X0, 0, Z0), m=0)
        if u.get('arch'):
            ra = u['arch']
            cx, sz = (X0 + X1) / 2, Z1 - ra
            pts = arc(cx, sz, ra, 0.0, PI, 16)
            for i in range(16):
                (ax, az), (bx, bz) = pts[i], pts[i + 1]
                c = (X1, Z1) if i < 8 else (X0, Z1)
                vs = wb.verts([(ax, 0.0005, az), (c[0], 0.0005, c[1]), (bx, 0.0005, bz)])
                wb._fin([wb.bm.faces.new(vs)], (1, 1, 1), 0)
    lo, hi = -1.0, S + 1.0
    zs = sorted(set([lo, hi] + [h[1] for h in holes] + [h[3] for h in holes]))
    for a, b in zip(zs[:-1], zs[1:]):
        act = sorted([h for h in holes if h[1] <= a + 1e-6 and h[3] >= b - 1e-6])
        cur = lo
        for h in act + [(hi, 0, hi, 0)]:
            if h[0] > cur + 1e-5:
                wb.quad((cur, 0.0005, a), (h[0], 0.0005, a), (h[0], 0.0005, b), (cur, 0.0005, b), m=0)
            cur = max(cur, h[2])
    wb.obj('wall', [MLIST[K['WALL']]], smooth=False)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = S
    cam.data.clip_start = 0.5
    cam.data.clip_end = 40.0
    cam.location = (S / 2, -10.0, S / 2)
    cam.rotation_euler = (PI / 2, 0.0, 0.0)
    bpy.context.scene.camera = cam
    w = bpy.data.worlds.new('w')
    bpy.context.scene.world = w
    try:
        w.use_nodes = True
        w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    except Exception:
        w.color = (0, 0, 0)
    w.light_settings.distance = 0.4
    return S, meta


def render_passes(res, samples, only=None):
    sc = L.setup_render(res, res, samples, look='None')
    # max utilisation: OptiX GPU + the CPU as a second Cycles device, all 24 threads for CPU-side work
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type in ('OPTIX', 'CPU')
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('[facade_kit] device setup:', e)
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 24
    sc.render.use_persistent_data = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.01
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.view_settings.view_transform = 'Standard'
    sc.render.filter_size = 1.2
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '16'
    sc.render.image_settings.color_mode = 'RGB'
    out = {}
    for p, spp in (('alb', samples), ('nrm', 16), ('hgt', 16), ('msk', 16), ('aux', samples * 2)):
        if only and p not in only:
            continue
        set_pass(p)
        sc.cycles.samples = spp
        # OIDN (GPU) only on the AO / roughness pass: albedo and data passes must stay crisp and exact
        sc.cycles.use_denoising = p == 'aux'
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_use_gpu = True
        path = os.path.join(CACHE, p + '.exr')
        dt = L.render_to(path)
        print('[facade_kit] pass %-4s %4d spp  %.1fs' % (p, spp, dt), flush=True)
        out[p] = path
    return out


def load_exr(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return np.flipud(px.reshape(h, w, 4))[:, :, :3].copy()


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smooth1d(x, r):
    k = np.ones(2 * r + 1, np.float32) / (2 * r + 1)
    return np.convolve(np.pad(x, r, mode='wrap'), k, mode='valid')


def post(S, meta, res):
    alb = load_exr(os.path.join(CACHE, 'alb.exr'))
    nrm = load_exr(os.path.join(CACHE, 'nrm.exr'))
    hgt = load_exr(os.path.join(CACHE, 'hgt.exr'))[:, :, 0]
    msk = load_exr(os.path.join(CACHE, 'msk.exr'))
    aux = load_exr(os.path.join(CACHE, 'aux.exr'))
    H, W = hgt.shape
    ppm = W / S
    rng = np.random.default_rng(7)
    # ---------------------------------------------------------------- streaks below every ledge (rain + soot run-off)
    hm = hgt * (H_MAX - H_MIN) + H_MIN
    drop = np.zeros_like(hm)
    drop[1:] = np.clip((hm[:-1] - hm[1:] - 0.02) / 0.04, 0, 1)          # row r is just below a ledge edge
    dec = math.exp(-1.0 / (0.5 * ppm))
    s = np.zeros_like(hm)
    acc = np.zeros(W, np.float32)
    for r in range(H):
        acc = np.maximum(acc * dec, drop[r])
        acc[hm[r] < -0.03] = 0.0                                        # the run-off stops at openings
        s[r] = acc
    cols = rng.random(W).astype(np.float32)
    n1 = smooth1d(cols, max(1, int(0.012 * ppm)))
    n2 = smooth1d(rng.random(W).astype(np.float32), max(1, int(0.05 * ppm)))
    nx = np.clip((n1 - 0.45) * 3.0, 0, 1) * (0.35 + 0.65 * n2)
    vy = np.linspace(0, 40, H).astype(np.float32)
    vn = 0.75 + 0.25 * np.sin(vy[:, None] * 3.1 + n2[None, :] * 20.0)
    st = s * nx[None, :] * vn * (1.0 - msk[:, :, 0])
    # fade weathering of the wall to neutral near the unit borders (units are inset into arbitrary walls)
    fade = np.zeros((H, W), np.float32)
    for key, u in meta.items():
        x0, x1 = int(u['x'] * ppm), int((u['x'] + u['w']) * ppm)
        z0, z1 = int(u['z'] * ppm), int((u['z'] + u['h']) * ppm)
        r0, r1 = H - z1, H - z0
        yy = np.arange(r0, r1)[:, None].astype(np.float32)
        xx = np.arange(x0, x1)[None, :].astype(np.float32)
        e = 0.06 * ppm
        fx = np.ones_like(xx) if u['tile'] == 'x' else np.clip(np.minimum(xx - x0, x1 - 1 - xx) / e, 0, 1)
        fz = np.ones_like(yy) if u['tile'] == 'z' else np.clip(np.minimum(yy - r0, r1 - 1 - yy) / e, 0, 1)
        fade[r0:r1, x0:x1] = np.maximum(fade[r0:r1, x0:x1], fx * fz)
    wall = msk[:, :, 2]
    st *= np.where(wall > 0.5, fade, 1.0)
    alb = alb * (1.0 - 0.38 * st[:, :, None] * np.array([1.0, 1.02, 1.06], np.float32))
    aux[:, :, 1] = np.clip(aux[:, :, 1] + 0.12 * st, 0, 1)
    # wall pixels: blend to the neutral reference at unit borders so they merge with any wall
    wk = (wall > 0.5)[:, :, None] * (1.0 - fade[:, :, None])
    alb = alb * (1 - wk) + WALL_REF * wk
    aux[:, :, 0] = aux[:, :, 0] * (1 - wk[:, :, 0]) + wk[:, :, 0] * np.maximum(aux[:, :, 0], 0.97)
    # ---------------------------------------------------------------- normals: world -> tangent (x right, y up, z out)
    nw = nrm * 2.0 - 1.0
    nt = np.stack([nw[:, :, 0], nw[:, :, 2], -nw[:, :, 1]], axis=2)
    nt /= np.maximum(np.linalg.norm(nt, axis=2, keepdims=True), 1e-5)
    nt[:, :, 2] = np.abs(nt[:, :, 2])
    # ---------------------------------------------------------------- write
    L.save_image(os.path.join(L.BAKED, 'facade_alb.jpg'), lin2srgb(alb), 'JPEG', 92)
    nh = np.stack([nt[:, :, 0] * 0.5 + 0.5, nt[:, :, 1] * 0.5 + 0.5, hgt], axis=2)
    L.save_image(os.path.join(L.BAKED, 'facade_nrm.png'), nh, 'PNG')
    half = lambda a: a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, a.shape[2]).mean(axis=(1, 3))
    ma = np.concatenate([half(msk), half(aux)], axis=1)
    L.save_image(os.path.join(L.BAKED, 'facade_ma.png'), ma, 'PNG')
    # preview sheet
    L.save_image(os.path.join(CACHE, 'preview_alb.jpg'), lin2srgb(alb[::max(1, W // 1024), ::max(1, W // 1024)]), 'JPEG', 85)
    # ---------------------------------------------------------------- json
    units = {}
    for key, u in meta.items():
        px0, pz0 = u['x'] * ppm, u['z'] * ppm
        pw, ph = u['w'] * ppm, u['h'] * ppm
        rec = {
            'rect': [round(px0), round(H - pz0 - ph), round(pw), round(ph)],
            'uv': [round(u['x'] / S, 6), round(u['z'] / S, 6), round((u['x'] + u['w']) / S, 6), round((u['z'] + u['h']) / S, 6)],
            'size': [u['w'], u['h']], 'open': [round(v, 4) for v in u['open']], 'rec': u['rec'],
            'pivot': [round((u['open'][0] + u['open'][2]) / 2, 4), round(u['open'][1], 4)], 'tile': u['tile'],
        }
        for k in ('sill', 'crown'):
            if u.get(k):
                rec[k] = {kk: round(vv, 4) for kk, vv in u[k].items()}
        for k in ('door', 'arch', 'depth'):
            if u.get(k) is not None:
                rec[k] = u[k] if not isinstance(u[k], list) else [round(v, 4) for v in u[k]]
        units[key] = rec
    doc = {'res': [W, H], 'maRes': [W, H // 2], 'metres': S, 'pxPerM': round(ppm, 3), 'hMin': H_MIN, 'hMax': H_MAX,
           'paintRef': PAINT_REF, 'wallRef': WALL_REF, 'units': units}
    with open(os.path.join(L.BAKED, 'facade_kit.json'), 'w') as f:
        json.dump(doc, f, indent=1)
    print('[facade_kit] wrote facade_alb.jpg facade_nrm.png facade_ma.png facade_kit.json (%.2f m, %.0f px/m)' % (S, ppm))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', type=int, default=4096)
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--metres', type=float, default=12.0)
    ap.add_argument('--only-post', action='store_true')
    ap.add_argument('--passes', default='')
    ap.add_argument('--no-post', action='store_true')
    a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(CACHE, exist_ok=True)
    t0 = time.time()
    S, meta = build_scene(a.metres)
    print('[facade_kit] scene built: %d units, atlas %.2f m, %.1fs' % (len(meta), S, time.time() - t0), flush=True)
    if not a.only_post:
        render_passes(a.res, a.samples, [p for p in a.passes.split(',') if p])
    if not a.no_post:
        post(S, meta, a.res)
    print('[facade_kit] total %.0fs' % (time.time() - t0))


if __name__ == '__main__':
    main()
