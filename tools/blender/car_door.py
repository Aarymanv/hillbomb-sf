"""HILLBOMB cars pass 4: hinged front doors (called by cars.py after car_hero.detail + car_body.aero, before the AO bake).

The driver (-x) and passenger (+x) front doors become separate parts `<kind>__dl` / `<kind>__dr` (paint, paint2, details,
lamps, lens, glass) that the runtime hangs on a hinge pivot (models.js openDoor). The door outline comes from the JS
door-seam records (the same polylines car_hero.py grooved into the shell):
  * front edge = first vertical side seam behind the front axle, rear edge = the next one >= 0.55 m behind it (else a
    line ~1.05 m behind, clear of the rear arch); both run from the sill (bottom of the seam) to the belt and continue
    vertically up to the roof for the door glass; bottom = the seam bottom (where the side tucks under),
  * everything on that side inside the outline is knifed along the edges (bmesh bisect, corner normals carried in 'onrm')
    and moved to the door: the paint skin below the side glass, door glass (side-facing faces above the belt), outer trim
    (handles, belt chrome, mirror islands on the door), the cabin tub's door card (int == 2, side-facing) and small cabin
    islands on it (armrest, pull handle, speaker),
  * shut faces close the cut: door front / rear / bottom faces + a top cap, body-side aperture faces (hinge pillar, B-pillar
    shut face, sill), in body colour, so an open door shows a solid panel and a solid opening.
Returns the hinge per side: { 'L': {'p': [x, y, z], 'max': rad}, 'R': ... } (pivot on the outer skin at the most forward
point of the front edge, vertical axis).
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
import car_hero as H

OPEN_MAX = 1.15          # rad (~66 deg)
KINDS = ('paint', 'paint2', 'details', 'lamps', 'lens', 'glass')
SKIP = {'bus', 'cablecar', 'picknick'}   # picknick: the cab door outline runs over the front wheel arch


def zat(line, y):
    """z of a (z, y) polyline sorted by y, clamped at the ends"""
    if y <= line[0][1]: return line[0][0]
    for a, b in zip(line[:-1], line[1:]):
        if y <= b[1]:
            t = (y - a[1]) / max(1e-9, b[1] - a[1]); return a[0] + (b[0] - a[0]) * t
    return line[-1][0]


def door_lines(D):
    out = {'-x': [], '+x': []}
    for r in D.get('rec') or []:
        if r.get('k') != 'seam' or not r.get('gap') or r.get('dir') not in out: continue
        L = sorted([(float(p[0]), float(p[1])) for p in r['line']], key=lambda p: p[1])
        zs = [p[0] for p in L]; ys = [p[1] for p in L]
        if max(ys) - min(ys) < 0.25 or max(zs) - min(zs) > 0.45: continue
        out[r['dir']].append(L)
    return out


def outline(lines, meta):
    mz = lambda L: sum(p[0] for p in L) / len(L)
    ls = sorted(lines, key=mz)
    fr = [L for L in ls if mz(L) > meta['axleFZ'] - 0.15]
    if not fr: return None
    F = fr[0]
    rr = [L for L in fr[1:] if mz(L) > mz(F) + 0.55]
    if rr: R = rr[0]
    else:
        zr = min(mz(F) + 1.05, meta['axleRZ'] - meta['R'] - 0.12)
        R = [(zr, F[0][1]), (zr, F[-1][1])]
    yb = min(F[0][1], R[0][1]); yt = max(F[-1][1], R[-1][1])
    ln = zat(R, (yb + yt) / 2) - zat(F, (yb + yt) / 2)
    if ln < 0.6 or ln > 1.85: return None
    return {'F': F, 'R': R, 'yb': yb, 'yt': yt}


class Skin:
    """outer skin |x| at (y, z) on one side (ray from outside), cached on a 1 cm grid"""
    def __init__(self, surf, s):
        self.surf, self.s, self.c = surf, s, {}

    def x(self, y, z):
        k = (round(y, 2), round(z, 2))
        if k not in self.c:
            h = self.surf.hit('+x' if self.s > 0 else '-x', k[1], k[0])
            self.c[k] = abs(h[0].x) if h else None
        return self.c[k]

    def xn(self, y, z):
        """nearest valid skin x (scan up a little: the sill tucks under)"""
        for dy in (0.0, 0.01, 0.02, 0.04, 0.07, 0.1):
            v = self.x(y + dy, z)
            if v is not None: return v
        return None


def face_arrays(me):
    n = len(me.polygons)
    c = np.zeros(n * 3, np.float32); me.polygons.foreach_get('center', c)
    nr = np.zeros(n * 3, np.float32); me.polygons.foreach_get('normal', nr)
    return c.reshape(-1, 3), nr.reshape(-1, 3)


def islands(me):
    """face -> island id (shared vertices), island count"""
    nv = len(me.vertices); par = np.arange(nv)
    def find(a):
        r = a
        while par[r] != r: r = par[r]
        while par[a] != r: par[a], a = r, par[a]
        return r
    lv = np.zeros(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    ls = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', ls)
    lt = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_total', lt)
    for f in range(len(me.polygons)):
        a = find(lv[ls[f]])
        for j in range(1, lt[f]):
            b = find(lv[ls[f] + j])
            if a != b: par[b] = a
    root = np.array([find(lv[ls[f]]) for f in range(len(me.polygons))], np.int64)
    _, isl = np.unique(root, return_inverse=True)
    return isl.reshape(-1)


def knife(ob, s, segs, box):
    """bisect the faces of ob on side s inside box (z0, y0, z1, y1) along each 2D segment ((z, y), (z, y))"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    z0, y0, z1, y1 = box
    faces = []
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        if min(v.x * s for v in vs) < 0.12: continue
        if max(v.z for v in vs) < z0 or min(v.z for v in vs) > z1 or max(v.y for v in vs) < y0 or min(v.y for v in vs) > y1: continue
        faces.append(f)
    for p, q in segs:
        sa0, sa1 = min(p[0], q[0]) - 0.012, max(p[0], q[0]) + 0.012
        sb0, sb1 = min(p[1], q[1]) - 0.012, max(p[1], q[1]) + 0.012
        near = []
        for f in faces:
            if not f.is_valid: continue
            zs = [v.co.z for v in f.verts]; ys = [v.co.y for v in f.verts]
            if max(zs) < sa0 or min(zs) > sa1 or max(ys) < sb0 or min(ys) > sb1: continue
            near.append(f)
        if not near: continue
        tz, ty = q[0] - p[0], q[1] - p[1]; L = math.hypot(tz, ty) or 1e-9
        no = Vector((0.0, tz / L, -ty / L))
        co = Vector((0.0, p[1], p[0]))
        es = list({e for f in near for e in f.edges}); vs = list({v for f in near for v in f.verts})
        r = bmesh.ops.bisect_plane(bm, geom=near + es + vs, dist=1e-6, plane_co=co, plane_no=no)
        new = [g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)]
        faces = [f for f in faces if f.is_valid] + [f for f in new if f not in near]
    bm.to_mesh(ob.data); bm.free(); ob.data.update()


def quad(Bd, pts, fin, want):
    a, b, c = pts[0], pts[1], pts[2]
    n = (b - a).cross(c - a)
    if n.dot(want) < 0: pts = pts[::-1]
    Bd.face(pts, fin, smooth=False)


def split(cid, parts, D, log=print):
    meta = D['meta']
    if cid in SKIP or meta.get('custom'): return {}
    lines = door_lines(D)
    surf = H.Surf([parts.get('paint'), parts.get('paint2'), parts.get('glass')])
    roof = 3.0
    hinges = {}
    for k in KINDS:
        if parts.get(k) is not None: H.store_normals(parts[k])
    for side, d, s in (('L', '-x', -1), ('R', '+x', 1)):
        O = outline(lines[d], meta)
        if not O: log('[door] %s %s: no outline' % (cid, side)); continue
        F, R, yb, yt = O['F'], O['R'], O['yb'], O['yt']
        sk = Skin(surf, s)
        zfTop, zrTop = F[-1][0], R[-1][0]
        zf = lambda y: zat(F, y) if y <= yt else zfTop
        zr = lambda y: zat(R, y) if y <= yt else zrTop
        # side glass bottom (belt) per 2 cm of z, from side-facing glass faces on this side
        ycut = {}
        g = parts.get('glass')
        if g is not None:
            gc, gn = face_arrays(g.data)
            m = (gc[:, 0] * s > 0.2) & (np.abs(gn[:, 0]) > 0.5) & (gc[:, 2] > zfTop - 0.1) & (gc[:, 2] < zrTop + 0.1) & (gc[:, 1] > yb + 0.15)
            for z, y in zip(gc[m, 2], gc[m, 1]):
                b = int(round(z / 0.02)); ycut[b] = min(ycut.get(b, 9.0), y)
        # belt = a straight line fitted through the per-bin glass bottoms (bin minima are noisy), clamped near the seam top
        if len(ycut) >= 3:
            bz = np.array(sorted(ycut)) * 0.02; by = np.array([ycut[b] for b in sorted(ycut)])
            A = np.polyfit(bz, by, 1)
        else: A = (0.0, yt + 0.03 + 0.004)
        def yc(z): return max(min(float(A[0] * z + A[1]) - 0.004, yt + 0.12), yt - 0.12)
        # knife lines: front + rear seam (densified like the grooves) extended up to the roof, bottom line
        Fd = H.densify(F, 0.03, False) + [(zfTop, roof)]
        Rd = H.densify(R, 0.03, False) + [(zrTop, roof)]
        segs = list(zip(Fd[:-1], Fd[1:])) + list(zip(Rd[:-1], Rd[1:]))
        zb0, zb1 = zf(yb) - 0.02, zr(yb) + 0.02
        bl = [(zb0 + (zb1 - zb0) * i / 20, yb) for i in range(21)]
        segs += list(zip(bl[:-1], bl[1:]))
        zt0, zt1 = zfTop - 0.04, zrTop + 0.04
        tl = [(zt0 + (zt1 - zt0) * i / 30, yc(zt0 + (zt1 - zt0) * i / 30) + 0.004) for i in range(31)]
        segs_glass = list(segs[:len(Fd) - 1 + len(Rd) - 1])   # glass: front / rear edges only (the belt line left slivers)
        segs += list(zip(tl[:-1], tl[1:]))
        z0 = min(p[0] for p in F) - 0.05; z1 = max(max(p[0] for p in R), zrTop) + 0.05
        box = (z0, yb - 0.05, z1, roof)
        def inz(z, y): return zf(y) < z < zr(y)
        nd = {}
        for k in KINDS:
            ob = parts.get(k)
            if ob is None or not len(ob.data.polygons): continue
            knife(ob, s, segs_glass if k == 'glass' else segs, box)
            me = ob.data
            c, n = face_arrays(me)
            ax = c[:, 0] * s
            mask = np.zeros(len(c), bool)
            cand = np.nonzero((ax > 0.12) & (c[:, 2] > z0) & (c[:, 2] < z1) & (c[:, 1] > yb - 0.03))[0]
            ia = None
            if k == 'details':
                ia = np.zeros(len(c), np.int32)
                if 'int' in me.attributes: me.attributes['int'].data.foreach_get('value', ia)
                isl = islands(me)
                nI = isl.max() + 1 if len(isl) else 0
                lo = np.full((nI, 3), 9.0); hi = np.full((nI, 3), -9.0)
                np.minimum.at(lo, isl, c); np.maximum.at(hi, isl, c)
                cen = np.zeros((nI, 3)); cnt = np.zeros(nI)
                np.add.at(cen, isl, c); np.add.at(cnt, isl, 1); cen /= np.maximum(cnt, 1)[:, None]
                diag = np.linalg.norm(hi - lo, axis=1)
                take = {}
                for i in np.unique(isl[cand]):
                    if diag[i] >= 0.5: continue
                    x, y, z = cen[i]; a = x * s
                    if a < 0.15: continue
                    skx = sk.xn(min(y, yc(z) - 0.01), z)
                    if skx is None: continue
                    small_int = ia[isl == i].max() > 0
                    on_door = yb - 0.02 < y < yc(z) + 0.02 and inz(z, y) and a > skx - (0.14 if small_int else 0.05)
                    # door mirror: outside the skin at the front top corner of the door
                    mirror = (not small_int) and a > skx - 0.01 and yc(z) - 0.12 < y < yc(z) + 0.35 and zfTop - 0.35 < z < zfTop + 0.35
                    take[i] = bool(on_door or mirror)
            for i in cand:
                x, y, z = c[i]; a = ax[i]
                if k == 'details' and diag_of(isl, diag, i) < 0.5:
                    mask[i] = take.get(isl[i], False); continue
                if k == 'glass':
                    # side-facing only: the glass wrapped round a slim A-pillar bends forward and stays on the body
                    mask[i] = abs(n[i, 0]) > 0.72 and abs(n[i, 2]) < 0.32 and y > yb + 0.15 and zfTop < z < zr(y)
                    continue
                tub = k == 'details' and ia[i] == 2
                if y > yc(z) + (0.08 if tub else 0.004) or y < yb - 0.002 or not inz(z, y): continue
                skx = sk.xn(y, z)
                if skx is None: continue
                if k == 'details' and ia[i] == 2:
                    mask[i] = abs(n[i, 0]) > 0.6 and a > skx - 0.12
                elif k == 'details' and ia[i] == 1:
                    mask[i] = False
                else:
                    # paint: the whole side inside the outline (incl. the inner belt flange: an x threshold left teeth)
                    mask[i] = a > 0.3 if k in ('paint', 'paint2') else a > skx - 0.05
            if mask.any():
                o2 = H.split_faces_to(ob, mask, '%s__d%s' % (k, side.lower()))
                if o2 is not None: nd[k] = o2
        if 'paint' not in nd and 'paint2' not in nd:
            log('[door] %s %s: nothing selected' % (cid, side)); continue
        # ---- shut faces
        Bdoor, Bbody = H.Build(), H.Build()
        pf = H.FIN['paint']; trim = H.FIN['door']
        eps = 0.0035
        def edge(fz, y0, y1, zsgn):
            ys = list(np.linspace(y0, y1, max(3, int((y1 - y0) / 0.025) + 1)))
            for y_a, y_b in zip(ys[:-1], ys[1:]):
                for B, off, dep, want in ((Bdoor, zsgn * eps, 0.035, -zsgn), (Bbody, -zsgn * eps, 0.06, zsgn)):
                    pa = []
                    xa, xb = sk.xn(y_a, fz(y_a)), sk.xn(y_b, fz(y_b))
                    if xa is None or xb is None: continue
                    za, zb = fz(y_a) + off, fz(y_b) + off
                    P = [Vector((s * (xa - 0.002), y_a, za)), Vector((s * (xb - 0.002), y_b, zb)), Vector((s * (xb - dep), y_b, zb)), Vector((s * (xa - dep), y_a, za))]
                    quad(B, P, pf, Vector((0, 0, want)))
        # front edge (door faces forward, body faces back), rear edge (door faces back)
        edge(zf, yb, min(yt, yc(zf(yt))), 1)
        edge(zr, yb, min(yt, yc(zr(yt))), -1)
        # bottom: door underside (faces down), body sill top (faces up)
        zs = list(np.linspace(zf(yb) + 0.004, zr(yb) - 0.004, 24))
        for za, zb in zip(zs[:-1], zs[1:]):
            xa, xb = sk.xn(yb + 0.01, za), sk.xn(yb + 0.01, zb)
            if xa is None or xb is None: continue
            for B, yy, dep, want in ((Bdoor, yb + eps, 0.035, -1), (Bbody, yb - eps, 0.06, 1)):
                P = [Vector((s * (xa - 0.002), yy, za)), Vector((s * (xb - 0.002), yy, zb)), Vector((s * (xb - dep), yy, zb)), Vector((s * (xa - dep), yy, za))]
                quad(B, P, pf, Vector((0, want, 0)))
        # door top cap under the glass (interior trim colour)
        zs = list(np.linspace(zf(yt) + 0.01, zr(yt) - 0.01, 24))
        for za, zb in zip(zs[:-1], zs[1:]):
            ya, yb2 = yc(za) - 0.003, yc(zb) - 0.003
            xa, xb = sk.xn(ya, za), sk.xn(yb2, zb)
            if xa is None or xb is None: continue
            P = [Vector((s * (xa - 0.006), ya, za)), Vector((s * (xb - 0.006), yb2, zb)), Vector((s * (xb - 0.045), yb2, zb)), Vector((s * (xa - 0.045), ya, za))]
            quad(Bdoor, P, trim, Vector((0, 1, 0)))
        for B, tgt in ((Bdoor, nd), (Bbody, parts)):
            for kk, ob in B.flush('sh' + side).items():
                key = kk if tgt is parts else kk
                if key in tgt and tgt[key] is not None: H.join_into(tgt[key], [ob])
                elif tgt is nd: ob.name = '%s__d%s' % (kk, side.lower()); ob.data.name = ob.name; nd[kk] = ob
                else: ob.name = 'L0_' + kk; ob.data.name = ob.name; parts[kk] = ob
        for k, ob in nd.items(): parts['%s__d%s' % (k, side.lower())] = ob
        # hinge: on the skin at the most forward point of the front edge, mid height
        ym = (yb + yt) / 2
        zi = min(range(len(F)), key=lambda i: F[i][0])
        zh = min(p[0] for p in F)
        xh = sk.xn(ym, zh + 0.01) or sk.xn(F[zi][1], zh + 0.01) or 0.9
        hinges[side] = {'p': [round(s * xh, 4), round(ym, 4), round(zh, 4)], 'max': OPEN_MAX}
        log('[door] %s %s: %s  z %.2f..%.2f y %.2f..%.2f' % (cid, side, sorted(nd), zat(F, ym), zat(R, ym), yb, yt))
    for k, ob in list(parts.items()):
        if ob is not None and 'onrm' in ob.data.attributes: H.restore_normals(ob)
    return hinges


def diag_of(isl, diag, i):
    return diag[isl[i]] if isl is not None else 9.0
