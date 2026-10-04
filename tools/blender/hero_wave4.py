"""HILLBOMB hero landmarks, wave 4 (neighbourhoods + parks).

Run:  tools/.venv-blender/Scripts/python.exe tools/blender/hero_wave4.py -- castro missionDolores ...
Same pipeline as waves 1-3 (hero_lib.run_building: LOD0/LOD1, Cycles vertex AO, Draco GLB, _cache/hero/<id>.json).
New slots: 'rooftile' (procedural barrel clay tiles, explicit uv: u along the ridge, v down the slope) and 'clap'
(procedural lap siding, v = height) - see src/world/landmarks/v2/hero_mats.js.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_lib import *   # noqa
from hero_wave1 import (ring_edges, neighbour_top, sidewalk, floor_levels, origin_for, edge_facing, tfacade, ROOF, GOLD, BRONZE, palm, clip_rect)   # noqa
from hero_wave2 import (Loc, hull, deck_seg, rect_decks, ext_stairs, broadleaf, conifer, outline, ring_scale)   # noqa
from hero_wave3 import (column, colonnade, entablature, pediment, balustrade, arcade_wall, dome, ring_facets, street_pts)   # noqa

TILE = C('#b0553a'); TILE_D = C('#94442e'); WASH = C('#f1ece0'); WASH_D = C('#ddd5c4'); WOODD = C('#4e3524')
CREAMW = C('#ece2cc'); CREAMW_D = C('#d4c6a8'); VERD = C('#5e8f7c'); VERD_D = C('#4b7666'); BRONZE4 = C('#6b5230')
WHITE4 = C('#f2efe8'); WHITE4_D = C('#dcd7cc')


# ================================================================================== roof / ornament kit
def _rp(L, ridge_a):
    return (lambda s, t, y: L.P(s, t, y)) if ridge_a else (lambda s, t, y: L.P(t, s, y))


def gable(g, L, a0, a1, b0, b1, y0, rise, col=TILE, slot='rooftile', over=0.5, ridge_a=True, ends=True, end_col=None, end_slot='stucco',
          th=0.22, fascia=C('#6a4a34')):
    """gable roof on the local rect: ridge along a (ridge_a) at mid-b, eaves at y0 on the wall line, overhang `over`"""
    P = _rp(L, ridge_a)
    s0, s1, t0, t1 = (a0, a1, b0, b1) if ridge_a else (b0, b1, a0, a1)
    tm = (t0 + t1) / 2; hw = (t1 - t0) / 2; k = rise / hw; yr = y0 + rise
    ye = y0 - over * k; sl = math.hypot(hw + over, rise + over * k)
    for te in (t0 - over, t1 + over):
        A, B, Cc, D = P(s0 - over, te, ye), P(s1 + over, te, ye), P(s1 + over, tm, yr), P(s0 - over, tm, yr)
        uv = [(s0 - over, sl), (s1 + over, sl), (s1 + over, 0.0), (s0 - over, 0.0)]
        g.poly(slot, [A, B, Cc, D], col, (0, 1, 0), uv=uv)
        dn = lambda p: (p[0], p[1] - th, p[2])
        g.poly(slot, [dn(A), dn(B), dn(Cc), dn(D)], shade(col, 0.55), (0, -1, 0))
        g.poly('wood', [A, B, dn(B), dn(A)], fascia, None)
        for ss in (s0 - over, s1 + over):
            g.poly('wood', [P(ss, te, ye), P(ss, tm, yr), P(ss, tm, yr - th), P(ss, te, ye - th)], fascia, None)
    if ends:
        for ss, sg in ((s0, -1), (s1, 1)):
            d = L.d(sg, 0) if ridge_a else L.d(0, sg)
            g.poly(end_slot, [P(ss, t0, y0), P(ss, t1, y0), P(ss, tm, yr)], end_col or WASH, d)
    return yr


def hip(g, L, a0, a1, b0, b1, y0, rise, col=TILE, slot='rooftile', over=0.5, th=0.2, fascia=C('#6a4a34')):
    """hip roof on the local rect (ridge along the longer side)"""
    ridge_a = (a1 - a0) >= (b1 - b0)
    P = _rp(L, ridge_a)
    s0, s1, t0, t1 = (a0, a1, b0, b1) if ridge_a else (b0, b1, a0, a1)
    tm = (t0 + t1) / 2; hw = (t1 - t0) / 2; k = rise / hw; yr = y0 + rise; ye = y0 - over * k
    r0, r1 = s0 + hw, s1 - hw
    E = [P(s0 - over, t0 - over, ye), P(s1 + over, t0 - over, ye), P(s1 + over, t1 + over, ye), P(s0 - over, t1 + over, ye)]
    R0, R1 = P(r0, tm, yr), P(r1, tm, yr)
    sl = math.hypot(hw + over, rise + over * k)
    faces = [([E[0], E[1], R1, R0], [(s0 - over, sl), (s1 + over, sl), (r1, 0), (r0, 0)]), ([E[2], E[3], R0, R1], [(s1 + over, sl), (s0 - over, sl), (r0, 0), (r1, 0)]),
             ([E[1], E[2], R1], [(t0 - over, sl), (t1 + over, sl), (tm, 0)]), ([E[3], E[0], R0], [(t1 + over, sl), (t0 - over, sl), (tm, 0)])]
    for pts, uv in faces:
        g.poly(slot, pts, col, (0, 1, 0), uv=uv)
    dn = lambda p: (p[0], p[1] - th, p[2])
    g.poly(slot, [dn(p) for p in E], shade(col, 0.5), (0, -1, 0))
    for i in range(4):
        g.poly('wood', [E[i], E[(i + 1) % 4], dn(E[(i + 1) % 4]), dn(E[i])], fascia, None)
    return yr


def slab_profile(g, slot, F, pts, w0, w1, col, side_col=None):
    """extrude a (u, y) outline (may be concave) between depths w0 < w1 of wall frame F"""
    N = (F[2][0], 0, F[2][1])
    g.poly(slot, [Geo.fp(F, u, y, w1) for u, y in pts], col, N)
    g.poly(slot, [Geo.fp(F, u, y, w0) for u, y in pts], shade(col, 0.9), (-N[0], 0, -N[2]))
    m = len(pts); cu = sum(p[0] for p in pts) / m; cy = sum(p[1] for p in pts) / m
    for i in range(m):
        p, q = pts[i], pts[(i + 1) % m]
        mu, my = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cy
        g.poly(slot, [Geo.fp(F, p[0], p[1], w0), Geo.fp(F, q[0], q[1], w0), Geo.fp(F, q[0], q[1], w1), Geo.fp(F, p[0], p[1], w1)], side_col or shade(col, 0.95),
               (F[1][0] * mu, my, F[1][1] * mu))


def urn(g, x, z, y, s, col, slot='stone'):
    g.lathe(slot, x, z, [(0.35 * s, y), (0.25 * s, y + 0.15 * s), (0.42 * s, y + 0.45 * s), (0.3 * s, y + 0.8 * s), (0.12 * s, y + 0.95 * s), (0.0, y + 1.1 * s)], col, n=10 if not g.lod else 5)


def cross(g, x, z, y, h, col, slot='gold', yaw_t=(1.0, 0.0), r=0.09):
    g.rod(slot, (x, y, z), (x, y + h, z), r, col, n=4)
    g.rod(slot, (x - yaw_t[0] * h * 0.3, y + h * 0.68, z - yaw_t[1] * h * 0.3), (x + yaw_t[0] * h * 0.3, y + h * 0.68, z + yaw_t[1] * h * 0.3), r, col, n=4)


def bulbs(g, pts, step, col=(1.0, 0.86, 0.55, 1.0), s=0.07):
    """chaser bulbs along a 3D polyline"""
    if g.lod: return
    for k in range(len(pts) - 1):
        p, q = pts[k], pts[k + 1]; L_ = math.dist(p, q); n = max(1, int(L_ / step))
        for i in range(n):
            t = (i + 0.5) / n; c = tuple(p[j] + (q[j] - p[j]) * t for j in range(3))
            g.box('lamp', c[0] - s, c[0] + s, c[1] - s, c[1] + s, c[2] - s, c[2] + s, col)


def arch_pts(uc, w, yb, spring, n=12, pointed=False):
    """outline of an arched opening (CCW) - round or pointed (two-centred)"""
    r = w / 2
    if not pointed: return opening_poly(uc, w, yb, spring + r, 1, n)
    R = w * 0.85
    # right arc (centre uc+r-R) from the springing up to the apex, then the left arc (centre uc-r+R) back down
    out = [(uc - r, yb), (uc + r, yb)]
    cxr, cxl = uc + r - R, uc - r + R
    th1 = math.acos((uc - cxr) / R)
    for i in range(n + 1):
        t = th1 * i / n
        out.append((cxr + R * math.cos(t), spring + R * math.sin(t)))
    for i in range(1, n + 1):
        t = th1 - th1 * i / n
        out.append((cxl - R * math.cos(t), spring + R * math.sin(t)))
    return out


def window_holes(g, F, u0, u1, y0, y1, holes, col, slot, glass_slot='win', gcol=None, depth=0.4, lit=0.35, sky=False):
    """wall rect with several openings (strips per opening), recessed glass behind each"""
    from hero_int_w3 import wall_with_holes
    wall_with_holes(g, F, u0, u1, y0, y1, holes, col, slot=slot)
    for h in holes:
        recess(g, F, h, depth, slot, shade(col, 0.88), glass_slot, gcol or glass_col(lit))


def street_line(L, name, site, axis=0):
    """local-coordinate crossings of a street centreline with the L frame axis (axis 0: b = 0 line -> a values)"""
    vals = []
    for P in street_pts(site, (name,)):
        for k in range(len(P) - 1):
            p0, p1 = L.loc(*P[k][:2]), L.loc(*P[k + 1][:2])
            i = 1 - axis
            if (p0[i] < 0) != (p1[i] < 0):
                vals.append(p0[axis] + (p1[axis] - p0[axis]) * (-p0[i]) / (p1[i] - p0[i]))
    return vals


def west_front(ring, ax=0, sign=-1, tol=4.0):
    """two extreme points of the ring face that looks along (sign) axis ax: returns (p0, p1) sorted by the other axis"""
    r = ring_out(ring)
    ext = min(p[ax] for p in r) if sign < 0 else max(p[ax] for p in r)
    face = [p for p in r if abs(p[ax] - ext) < tol]
    face.sort(key=lambda p: p[1 - ax])
    return face[0], face[-1]


# ================================================================================== Castro Theatre (1922, Timothy Pflueger)
CASTRO_HIDE = [57516, 57517]


def castro_frame():
    p0, p1 = west_front(ring_of(57516), 0, -1, 3.0)
    u = v2norm(v2sub(p1, p0))                            # along Castro St (south)
    c = v2lerp(p0, p1, 0.5)
    return Loc(c, u), v2len(v2sub(p1, p0))                  # b > 0 = out to the street (west)


def castro(g):
    L, W = castro_frame()
    hw = W / 2
    yG = min(sidewalk(*L.xz(a, 1.0)) for a in (-hw, 0, hw)) + 0.05
    ST = C('#eadcc0'); STD = C('#d6c29c'); ORN = C('#e3cfa6'); PINK = C('#d9b9a0')
    cols = []
    F = L.F(-hw, 0, 0)      # facade frame: t = +a (south), n = +b (west, out)
    P = lambda a, y, b=0.0: L.P(a, b, y)
    # ---- flanking shop bays (a in [-hw,-10.5] and [10.5, hw]): two storeys
    for (u0, u1) in ((0.0, hw - 10.5), (hw + 10.5, W)):
        Fs = (Geo.fp(F, u0, 0, 0)[0::2], F[1], F[2])
        Ls = u1 - u0
        a0_, b0_ = L.loc(*Fs[0])
        storefront(g, L.xz(u0 - hw, 0), L.xz(u1 - hw, 0), sidewalk, yG + 4.0, 3.4, 'stucco', ST, glass_slot='shop', lit=0.9, frame_col=C('#2a2622'),
                   awning=C('#6b1f24'))
        facade(g, L.xz(u0 - hw, 0), L.xz(u1 - hw, 0), yG + 4.0, yG + 9.2, 4.2, 2.6, Win(w=1.3, sill=0.9, head=3.1, depth=0.3, lit=0.4, arch=1), 'stucco', ST, margin=0.5)
        g.fbox('stucco', F, u0, u1, yG + 9.2, yG + 9.8, 0, 0.35, STD, top=True, bottom=True)
    # ---- theatre front a in [-10.5, 10.5]: side towers to +15, centre to +18.5 + Churrigueresque crest
    y_s, y_c, y_cr = yG + 15.0, yG + 18.6, yG + 22.4
    # ground storey: deep entrance recess a in [-6, 6], poster cases on the piers
    hole = [(hw - 6.0, yG - 0.5), (hw + 6.0, yG - 0.5), (hw + 6.0, yG + 4.2), (hw - 6.0, yG + 4.2)]
    radial_panel(g, 'stucco', F, hw - 10.5, hw + 10.5, yG - 3.0, yG + 4.2, hole, PINK)
    for i in range(4):
        p, q = hole[i], hole[(i + 1) % 4]
        if i == 0: continue
        mu = (p[0] + q[0]) / 2 - hw; mv = (p[1] + q[1]) / 2 - (yG + 1.8)
        g.poly('stucco', [Geo.fp(F, p[0], p[1], 0), Geo.fp(F, q[0], q[1], 0), Geo.fp(F, q[0], q[1], -3.2), Geo.fp(F, p[0], p[1], -3.2)], STD,
               (-(F[1][0] * mu), -mv, -(F[1][1] * mu)))
    g.quad_sub('terracotta', Geo.fp(F, hw - 6, yG + 0.02, 0.8), Geo.fp(F, hw + 6, yG + 0.02, 0.8), Geo.fp(F, hw + 6, yG + 0.02, -3.2), Geo.fp(F, hw - 6, yG + 0.02, -3.2),
               C('#8a3b2e'), (0, 1, 0))
    g.poly('stucco', [Geo.fp(F, hw - 6, yG + 4.2, 0), Geo.fp(F, hw + 6, yG + 4.2, 0), Geo.fp(F, hw + 6, yG + 4.2, -3.2), Geo.fp(F, hw - 6, yG + 4.2, -3.2)], C('#c9a86c'), (0, -1, 0))
    # doors at the back of the recess + ticket booth in the middle
    for k in range(6):
        uc = hw - 5.0 + k * 2.0 + (0.0 if k < 3 else 0.0)
        if abs(uc - hw) < 1.2: continue
        g.fbox('shop', F, uc - 0.8, uc + 0.8, yG + 0.05, yG + 2.9, -3.2, -3.12, (1.0, 0.82, 0.55, 1.0), top=False, sides=False)
        g.fbox('metal', F, uc - 0.85, uc + 0.85, yG + 2.9, yG + 3.05, -3.2, -3.05, C('#6b5a3a'), top=True, bottom=True)
        g.fbox('lamp', F, uc - 0.75, uc + 0.75, yG + 3.1, yG + 3.9, -3.2, -3.1, (1.0, 0.9, 0.7, 1.0), top=False, sides=False)
    tb = Geo.fp(F, hw, 0, -0.9)
    g.lathe('metal', tb[0], tb[2], [(1.05, yG), (1.05, yG + 1.0), (0.95, yG + 1.05)], C('#5a3d24'), n=8 if not g.lod else 6)
    g.lathe('shop', tb[0], tb[2], [(0.95, yG + 1.05), (0.95, yG + 2.3)], (1.0, 0.85, 0.6, 1.0), n=8 if not g.lod else 6)
    g.lathe('gold', tb[0], tb[2], [(1.1, yG + 2.3), (1.1, yG + 2.5), (0.7, yG + 3.0), (0.0, yG + 3.3)], C('#b8923e'), n=8 if not g.lod else 6)
    cols.append({'x': round(tb[0], 2), 'z': round(tb[2], 2), 'hx': 1.0, 'hz': 1.0, 'yaw': 0, 'yMin': yG - 1, 'yMax': yG + 3})
    for uc in (hw - 8.3, hw + 8.3):   # poster cases
        g.fbox('stucco', F, uc - 1.1, uc + 1.1, yG + 0.5, yG + 3.3, 0, 0.18, C('#8a6a3a'), top=True)
        g.fbox('lamp', F, uc - 0.9, uc + 0.9, yG + 0.7, yG + 3.1, 0.18, 0.2, (0.9, 0.8, 0.6, 1.0), top=False, sides=False)
    # upper theatre front
    win_side = [arch_pts(hw + s * 8.0, 1.4, yG + 6.0, yG + 9.2, 8) for s in (-1, 1)] + [arch_pts(hw + s * 8.0, 1.1, yG + 11.0, yG + 12.6, 8) for s in (-1, 1)]
    for s in (-1, 1):
        u0, u1 = (hw - 10.5, hw - 4.9) if s < 0 else (hw + 4.9, hw + 10.5)
        hs = [h for h in win_side if u0 < h[0][0] < u1]
        hs.sort(key=lambda h: h[0][1])
        radial_panel(g, 'stucco', F, u0, u1, yG + 4.2, yG + 10.3, hs[0], ST)
        recess(g, F, hs[0], 0.35, 'stucco', STD, 'win', glass_col(0.5))
        radial_panel(g, 'stucco', F, u0, u1, yG + 10.3, y_s, hs[1], ST)
        recess(g, F, hs[1], 0.3, 'stucco', STD, 'win', glass_col(0.4))
        # corner pilasters + scrolled parapet with an urn
        for uu in (u0 + 0.5, u1 - 0.5):
            g.fbox('stucco', F, uu - 0.45, uu + 0.45, yG + 4.2, y_s + 0.6, 0, 0.35, ORN, top=True)
        g.fbox('stucco', F, u0, u1, y_s - 0.5, y_s, 0, 0.5, STD, top=True, bottom=True)
        slab_profile(g, 'stucco', F, [(u0, y_s), (u1, y_s), (u1, y_s + 1.2), ((u0 + u1) / 2 + 0.8, y_s + 1.2), ((u0 + u1) / 2, y_s + 2.1), ((u0 + u1) / 2 - 0.8, y_s + 1.2), (u0, y_s + 1.2)],
                     -0.3, 0.2, ST)
        pu = Geo.fp(F, (u0 + u1) / 2, 0, 0.0); urn(g, pu[0], pu[2], y_s + 2.1, 0.9, ORN, slot='stucco')
    # centre: the great arched window over the marquee, framed by Churrigueresque estipites
    uc = hw
    big = arch_pts(uc, 6.2, yG + 7.0, yG + 12.4, 16)
    radial_panel(g, 'stucco', F, hw - 4.9, hw + 4.9, yG + 4.2, y_c, big, ST)
    recess(g, F, big, 0.6, 'stucco', STD, 'win', (1.0, 0.8, 0.52, 1.0))
    if not g.lod:
        for k in range(1, 5):      # mullions + transoms of the great window
            uu = uc - 3.1 + k * 6.2 / 5
            g.fbox('metal', F, uu - 0.05, uu + 0.05, yG + 7.0, yG + 12.4 + math.sqrt(max(0, 3.1 ** 2 - (uu - uc) ** 2)) - 0.1, -0.6, -0.52, C('#3a2e22'), top=False)
        for yy in (yG + 9.2, yG + 11.6):
            g.fbox('metal', F, uc - 3.1, uc + 3.1, yy - 0.05, yy + 0.05, -0.6, -0.52, C('#3a2e22'), top=True, bottom=True)
        for s in (-1, 1):   # estipites (stacked tapering pilasters) + scroll brackets
            uu = uc + s * 4.0
            for k, (y0, y1, w) in enumerate(((yG + 4.2, yG + 7.0, 0.9), (yG + 7.0, yG + 9.6, 0.7), (yG + 9.6, yG + 12.6, 0.8), (yG + 12.6, yG + 15.4, 0.6))):
                g.fbox('stucco', F, uu - w / 2, uu + w / 2, y0, y1 - 0.25, 0, 0.45 + 0.05 * k, ORN, top=True)
                g.fbox('stucco', F, uu - w / 2 - 0.15, uu + w / 2 + 0.15, y1 - 0.25, y1, 0, 0.6, STD, top=True, bottom=True)
        # relief shield + scrolls over the arch
        pts = [(uc - 1.4, yG + 15.6), (uc + 1.4, yG + 15.6), (uc + 1.2, yG + 17.0), (uc, yG + 17.8), (uc - 1.2, yG + 17.0)]
        slab_profile(g, 'stucco', F, pts, 0.0, 0.35, ORN)
    g.fbox('stucco', F, hw - 4.9, hw + 4.9, y_c - 0.5, y_c, 0, 0.6, STD, top=True, bottom=True)
    # crest: curved Spanish-baroque gable with volutes and a finial
    crest = [(hw - 5.0, y_c), (hw + 5.0, y_c), (hw + 5.0, y_c + 0.8)]
    for i in range(13):
        t = i / 12
        u = hw + 5.0 - 10.0 * t
        yy = y_c + 0.8 + (y_cr - y_c - 0.8) * (math.sin(math.pi * t) ** 0.7) + 0.35 * math.sin(3 * math.pi * t) * (1 - abs(2 * t - 1))
        crest.append((u, yy))
    crest.append((hw - 5.0, y_c + 0.8))
    slab_profile(g, 'stucco', F, crest[:3] + crest[3:-1] + [crest[-1]], -0.4, 0.3, ST)
    pc = Geo.fp(F, hw, 0, 0.0); urn(g, pc[0], pc[2], y_cr - 0.1, 1.2, ORN, slot='stucco')
    for s in (-1, 1):
        pv = Geo.fp(F, hw + s * 5.0, 0, 0.0); urn(g, pv[0], pv[2], y_c + 0.8, 0.8, ORN, slot='stucco')
    # ---- marquee: V-shaped prow projecting over the sidewalk, letter boards, chaser bulbs
    ym0, ym1 = yG + 4.4, yG + 6.1
    A0, Ap, A1 = (hw - 6.8, 0.1), (hw, 4.6), (hw + 6.8, 0.1)
    Q = lambda u, w, y: Geo.fp(F, u, y, w)
    g.poly('metal', [Q(*A0, ym0), Q(*A1, ym0), Q(*Ap, ym0)], C('#3a2a1e'), (0, -1, 0))
    g.poly('metal', [Q(*A0, ym1), Q(*A1, ym1), Q(*Ap, ym1)], C('#5b4630'), (0, 1, 0))
    boards = []
    for (p, q) in ((A0, Ap), (Ap, A1)):
        g.poly('neon', [Q(*p, ym0 + 0.12), Q(*q, ym0 + 0.12), Q(*q, ym1 - 0.12), Q(*p, ym1 - 0.12)], (0.26, 0.25, 0.23, 1.0), None)
        boards.append((p, q))
        bulbs(g, [Q(*p, ym1 - 0.06), Q(*q, ym1 - 0.06)], 0.35)
        bulbs(g, [Q(*p, ym0 + 0.06), Q(*q, ym0 + 0.06)], 0.35)
    g.poly('neon', [Q(A0[0], A0[1], ym1), Q(A1[0], A1[1], ym1), Q(Ap[0], Ap[1] - 0.6, ym1 + 1.2)], (0.45, 0.06, 0.04, 1.0), None) if False else None
    if not g.lod:
        titles = [('VERTIGO', 'SING-ALONG'), ('HAROLD AND MAUDE', 'ORGAN 7PM')]
        for (p, q), (l1, l2) in zip(boards, titles):
            pa, pb = Q(*p, 0), Q(*q, 0)
            t = v2norm((pb[0] - pa[0], pb[2] - pa[2])); n = (-t[1], t[0])
            mid = ((pa[0] + pb[0]) / 2, (pa[2] + pb[2]) / 2)
            if n[0] * (mid[0] - Q(hw, 0, 0)[0]) + n[1] * (mid[1] - Q(hw, 0, 0)[2]) < 0: t, n = (-t[0], -t[1]), (-n[0], -n[1])
            Fb = (mid, t, n)
            g.text('metal', Fb, 0, ym0 + 0.95, 0.0, l1, 0.45, C('#151515'), depth=0.04)
            g.text('metal', Fb, 0, ym0 + 0.3, 0.0, l2, 0.45, C('#151515'), depth=0.04)
        for k in range(40):            # soffit bulbs
            t = (k + 0.5) / 40
            u = A0[0] + (A1[0] - A0[0]) * t; w = 0.1 + 4.2 * (1 - abs(2 * t - 1)) * 0.85
            for ww in [w * f for f in (0.35, 0.7)]:
                p = Q(u, ww, ym0 - 0.05)
                g.box('lamp', p[0] - 0.06, p[0] + 0.06, p[1] - 0.06, p[1] + 0.02, p[2] - 0.06, p[2] + 0.06, (1.0, 0.88, 0.62, 1.0))
    # ---- the blade sign: CASTRO stacked, red neon on cream, framed in bulbs, crown on top
    yb0, yb1 = ym1 + 0.2, yG + 25.8
    w0b, w1b = 0.5, 3.0
    Fb = (L.xz(0.0, 0.0), L.u, L.v)                     # u = a (south), w = b (out)
    g.fbox('paint', Fb, -0.32, 0.32, yb0, yb1, w0b, w1b, C('#efe4cc'), top=True, bottom=True, back=True)
    g.fbox('paint', Fb, -0.36, 0.36, yb0, yb1, w1b - 0.12, w1b + 0.02, C('#b8923e'), top=True, bottom=True, back=True)
    crown = [(w0b, yb1), (w1b + 0.02, yb1), (w1b - 0.3, yb1 + 1.3), ((w0b + w1b) / 2, yb1 + 2.3), (w0b + 0.3, yb1 + 1.3)]
    Fc = (L.xz(-0.3, 0.0), L.u, L.v)
    for w_, s_ in ((-0.3, 1),):
        pts3 = lambda aa: [L.P(aa, bb, yy) for bb, yy in crown]
        g.poly('paint', pts3(0.3), C('#c9302a'), L.d(1, 0)); g.poly('paint', pts3(-0.3), C('#c9302a'), L.d(-1, 0))
        for i in range(len(crown)):
            p, q = crown[i], crown[(i + 1) % len(crown)]
            g.poly('paint', [L.P(-0.3, p[0], p[1]), L.P(-0.3, q[0], q[1]), L.P(0.3, q[0], q[1]), L.P(0.3, p[0], p[1])], C('#a52622'), None)
    if not g.lod:
        for s in (-1, 1):                              # letters on both faces (read along the street)
            nrm = (L.u[0] * s, L.u[1] * s); tt = (nrm[1], -nrm[0])
            Fs = (L.xz(s * 0.33, (w0b + w1b) / 2), tt, nrm)
            for k, ch in enumerate('CASTRO'):
                yy = yb1 - 1.1 - k * ((yb1 - yb0 - 1.4) / 6)
                g.text('neon', Fs, 0, yy - 2.0, 0.0, ch, 2.0, (1.0, 0.1, 0.06, 1.0), depth=0.08)
            ed = [L.P(s * 0.37, w0b + 0.05, yb0 + 0.1), L.P(s * 0.37, w1b - 0.05, yb0 + 0.1), L.P(s * 0.37, w1b - 0.05, yb1 - 0.1), L.P(s * 0.37, w0b + 0.05, yb1 - 0.1),
                  L.P(s * 0.37, w0b + 0.05, yb0 + 0.1)]
            bulbs(g, ed, 0.3)
        g.rod('metal', L.P(0, w1b, yb1 - 2.0), L.P(0, 0.0, yb1 - 5.0), 0.05, C('#333333'), n=4)
    # ---- auditorium + stage house (plain stucco), low tile-less roofs
    aud = ring_simplify(ring_of(57517), 0.4); lob = ring_simplify(ring_of(57516), 0.4)
    ya = yG + 17.0
    for r_, top in ((lob, y_s - 0.2), (aud, ya)):
        for ea, eb in ring_edges(r_):
            n = edge_n(ea, eb)
            if n[0] * L.v[0] + n[1] * L.v[1] > 0.9 and r_ is lob: continue
            if n[0] * L.v[0] + n[1] * L.v[1] < -0.9 and r_ is lob: continue          # party wall with the auditorium (open inside)
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            y0w = (y_s - 0.2) if (r_ is aud and n[0] * L.v[0] + n[1] * L.v[1] > 0.9) else yG - 4.0
            radial_panel(g, 'stucco', Fw, 0, Le, y0w, top, None, shade(ST, 0.93))
        g.sweep('stucco', r_, [(0, top), (0.25, top + 0.15), (0.25, top + 0.6), (0, top + 0.6)], STD)
        g.poly('roof', [(p[0], top + 0.05, p[1]) for p in ring_offset(ring_out(r_), -0.25)], ROOF, (0, 1, 0))
    cs = centroid(ring_out(aud))
    lc = L.loc(*cs)
    L.box(g, 'stucco', lc[0] - 13.0, lc[0] + 13.0, -46.0, -40.0, ya, yG + 22.0, shade(ST, 0.9), top=True)
    cols += wall_colliders(lob, yG - 4, y_s) + wall_colliders(aud, yG - 4, ya)
    return {'colliders': cols, 'name': 'Castro Theatre', 'replaces': 'castroTheatre', 'yG': round(yG, 2), 'top': round(yb1 + 2.5, 1)}


# ================================================================================== Mission Dolores (1791) + Basilica (1918/1926)
MD_HIDE = [57521, 57522]


def md_frames():
    r = ring_out(ring_of(57522))
    e = max(ring_edges(r), key=lambda e: e[0][0] + e[1][0])        # the east edge (largest x)
    n = edge_n(*e)
    m = v2lerp(e[0], e[1], 0.5)
    Lm = Loc(m, (-n[0], -n[1]))
    rb = ring_out(ring_of(57521))
    eb = max(ring_edges(rb), key=lambda e: (e[0][0] + e[1][0]) + v2len(v2sub(e[1], e[0])) * 0.2)
    nb = edge_n(*eb)
    Lb = Loc(v2lerp(eb[0], eb[1], 0.5), (-nb[0], -nb[1]))
    return Lm, v2len(v2sub(e[1], e[0])), Lb, v2len(v2sub(eb[1], eb[0]))


MD = dict(CB0=-3.4, CB1=6.1, CLEN=35.0, WALL=7.4)


def mission_dolores(g):
    Lm, Wm, Lb, Wb = md_frames()
    cols = []
    yG = min(H(*Lm.xz(0.8, b)) for b in (-6, 0, 6)) + 0.1
    b0, b1, CL, WH = MD['CB0'], MD['CB1'], MD['CLEN'], MD['WALL']
    bm = (b0 + b1) / 2
    # ---- chapel: thick whitewashed adobe, tile roof, buttresses + small high windows on the south wall
    Lm.box(g, 'stucco', 0.0, CL, b0, b1, yG - 2.0, yG + WH, WASH, top=False)
    ridge = gable(g, Lm, 0.0, CL + 0.3, b0, b1, yG + WH, 3.3, over=0.7, ends=False)
    gable(g, Lm, CL, 45.0, b0 + 0.5, b1 - 0.5, yG + 5.2, 2.4, over=0.5, end_col=WASH)
    Lm.box(g, 'stucco', CL, 45.0, b0 + 0.5, b1 - 0.5, yG - 2.0, yG + 5.2, WASH_D, top=False)
    # rear gable wall of the chapel above the sacristy roof
    g.poly('stucco', [Lm.P(CL + 0.3, b0, yG + WH), Lm.P(CL + 0.3, b1, yG + WH), Lm.P(CL + 0.3, bm, ridge)], WASH, Lm.d(1, 0))
    if not g.lod:
        for k in range(5):
            a = 6.0 + k * 6.2
            Lm.box(g, 'stucco', a - 0.7, a + 0.7, b0 - 1.1, b0, yG - 1.0, yG + WH - 1.2 - k * 0.0, WASH_D, top=True)
            g.poly('stucco', [Lm.P(a - 0.7, b0 - 1.1, yG + WH - 1.2), Lm.P(a + 0.7, b0 - 1.1, yG + WH - 1.2), Lm.P(a + 0.7, b0, yG + WH - 0.3), Lm.P(a - 0.7, b0, yG + WH - 0.3)],
                   WASH, (0, 1, 0))
            if k < 4:
                Fw = Lm.F(a + 3.1 - 0.6, b0, 0)
                Fw = (Fw[0], Fw[1], (-Fw[2][0], -Fw[2][1])) if (Fw[2][0] * Lm.v[0] + Fw[2][1] * Lm.v[1]) > 0 else Fw
                pc = Lm.P(a + 3.1, b0 - 0.01, yG + 5.3)
                F2 = ((pc[0], pc[2]), (-Lm.u[0], -Lm.u[1]), (-Lm.v[0], -Lm.v[1]))
                g.fbox('win', F2, -0.4, 0.4, yG + 4.6, yG + 6.0, -0.02, 0.0, glass_col(0.5), top=False, sides=False)
    # ---- south wing (museum / cemetery walk): low stucco, lean-to tile roof
    Lm.box(g, 'stucco', 2.5, 45.0, -Wm / 2, b0, yG - 2.0, yG + 3.6, WASH_D, top=False)
    gable(g, Lm, 2.5, 45.0, -Wm / 2 - 0.1, b0 + 0.1, yG + 3.6, 0.9, over=0.4, ends=False) if False else None
    g.poly('rooftile', [Lm.P(2.2, -Wm / 2 - 0.5, yG + 3.4), Lm.P(45.2, -Wm / 2 - 0.5, yG + 3.4), Lm.P(45.2, b0, yG + 4.6), Lm.P(2.2, b0, yG + 4.6)], TILE, (0, 1, 0),
           uv=[(2.2, 3.4), (45.2, 3.4), (45.2, 0), (2.2, 0)])
    # ---- facade (faces east, at a = -0.6): two-storey column order, balcony, three bells, gable
    F = Lm.F(-0.6, b0 - 0.3, 1)
    FW = b1 - b0 + 0.6; uc = FW / 2
    door = [(uc - 1.25, yG + 0.35), (uc + 1.25, yG + 0.35), (uc + 1.25, yG + 3.9), (uc - 1.25, yG + 3.9)]
    radial_panel(g, 'stucco', F, 0, FW, yG - 2.0, yG + 5.0, door, WASH)
    recess(g, F, door, 1.0, 'stucco', WASH_D, 'wood', WOODD)
    g.fbox('stucco', F, -0.2, FW + 0.2, yG - 1.0, yG + 0.35, 0.0, 0.6, WASH_D, top=True)           # plinth / step
    for u in (0.55, 2.2, FW - 2.2, FW - 0.55):
        p = Geo.fp(F, u, 0, 0.35)
        cols.append(column(g, p[0], p[2], yG + 0.35, yG + 4.6, 0.36, WASH, slot='stucco', order='doric', n=10))
    g.fbox('stucco', F, -0.3, FW + 0.3, yG + 4.6, yG + 5.3, 0.0, 0.95, WASH_D, top=True, bottom=True)
    # balcony: timber deck + turned-baluster railing
    g.fbox('wood', F, 1.4, FW - 1.4, yG + 5.3, yG + 5.45, 0.0, 1.15, WOODD, top=True, bottom=True)
    if not g.lod:
        for k in range(int((FW - 2.8) / 0.32)):
            uu = 1.55 + k * 0.32; p = Geo.fp(F, uu, 0, 1.05)
            g.lathe('wood', p[0], p[2], [(0.05, yG + 5.45), (0.07, yG + 5.7), (0.04, yG + 6.0), (0.06, yG + 6.3)], WOODD, n=5)
        g.fbox('wood', F, 1.4, FW - 1.4, yG + 6.3, yG + 6.42, 0.95, 1.15, WOODD, top=True, bottom=True)
    # upper storey: wall with three bell niches between four columns
    niches = [opening_poly(u, 1.05, yG + 6.2, yG + 8.3, 1, 8 if not g.lod else 3) for u in (uc - 2.35, uc, uc + 2.35)]
    from hero_int_w3 import wall_with_holes
    wall_with_holes(g, F, 0, FW, yG + 5.3, yG + 9.3, niches, WASH, slot='stucco')
    for h in niches:
        recess(g, F, h, 0.9, 'stucco', WASH_D, 'stucco', C('#3a342c'))
        m = len(h); cu = sum(p[0] for p in h) / m
        p = Geo.fp(F, cu, 0, -0.45)
        g.lathe('metal', p[0], p[2], [(0.0, yG + 6.75), (0.36, yG + 6.8), (0.3, yG + 7.1), (0.22, yG + 7.6), (0.1, yG + 7.75), (0.0, yG + 7.8)], BRONZE4, n=10 if not g.lod else 5)
        g.rod('wood', Geo.fp(F, cu - 0.5, yG + 7.9, -0.45), Geo.fp(F, cu + 0.5, yG + 7.9, -0.45), 0.06, WOODD, n=4)
    for u in (0.9, uc - 1.18, uc + 1.18, FW - 0.9):
        p = Geo.fp(F, u, 0, 0.3)
        cols.append(column(g, p[0], p[2], yG + 5.3, yG + 9.3, 0.28, WASH, slot='stucco', order='doric', n=8))
    g.fbox('stucco', F, -0.3, FW + 0.3, yG + 9.3, yG + 9.9, 0.0, 0.8, WASH_D, top=True, bottom=True)
    if not g.lod:
        for k in range(9):   # projecting viga ends under the cornice
            uu = 0.4 + k * (FW - 0.8) / 8
            g.fbox('wood', F, uu - 0.12, uu + 0.12, yG + 9.9, yG + 10.15, 0.0, 0.9, WOODD, top=True, bottom=True)
    # gable (tile roof sails out over the facade)
    g.poly('stucco', [Geo.fp(F, -0.2, yG + 9.9, 0.2), Geo.fp(F, FW + 0.2, yG + 9.9, 0.2), Geo.fp(F, uc, yG + 9.9 + 2.7, 0.2)], WASH, (F[2][0], 0, F[2][1]))
    gable(g, Lm, -1.8, 0.2, b0 - 0.4, b1 + 0.4, yG + 9.9, 2.9, over=0.35, ends=False)
    Lm.box(g, 'stucco', -0.6, 0.0, b0 - 0.3, b1 + 0.3, yG + WH, yG + 9.9, WASH, top=False)
    p = Geo.fp(F, uc, 0, 0.3); cross(g, p[0], p[2], yG + 12.6, 1.6, C('#3a2a1c'), slot='wood', yaw_t=F[1], r=0.07)
    cols += [Lm.col(0.0, CL, b0, b1, yG - 2, yG + WH), Lm.col(CL, 45.0, b0 + 0.5, b1 - 0.5, yG - 2, yG + 5), Lm.col(2.5, 45.0, -Wm / 2, b0, yG - 2, yG + 3.6)]

    # ---- Basilica (Churrigueresque 1926 front): twin towers with tiled cupolas, rose window, portal
    rb = ring_simplify(ring_of(57521), 0.35)
    ygb = min(sidewalk(*Lb.xz(-1.0, b)) for b in (-Wb / 2, 0, Wb / 2)) + 0.1
    BS = C('#f0e6d0'); BSD = C('#dac9a8'); BORN = C('#e6d4b0'); DOME = C('#c26a3e')
    y_n = ygb + 15.0
    for ea, eb in ring_edges(rb):
        n = edge_n(ea, eb); Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if n[0] * -Lb.u[0] + n[1] * -Lb.u[1] > 0.95 and Le > 15: continue            # the front is built below
        nt = neighbour_top(ea, eb, set(MD_HIDE))
        if Le > 9 and nt is None:
            facade(g, ea, eb, ygb - 3.0, y_n, 15.0, 6.2, Win(w=2.0, sill=4.5, head=11.5, depth=0.5, arch=1, lit=0.5), 'stucco', BS, margin=1.5,
                   pier=(0.9, 0.35, BSD) if not g.lod else None)
        else:
            radial_panel(g, 'stucco', Fw, 0, Le, ygb - 3.0, y_n, None, BS)
    g.sweep('stucco', rb, [(0, y_n), (0.5, y_n + 0.3), (0.5, y_n + 0.8), (0, y_n + 0.8)], BSD)
    g.poly('roof', [(p[0], y_n + 0.3, p[1]) for p in ring_offset(ring_out(rb), -0.3)], ROOF, (0, 1, 0))
    loc = [Lb.loc(*p) for p in ring_out(rb)]
    amax = max(q[0] for q in loc)
    gable(g, Lb, 8.0, amax - 6.0, -9.5, 9.5, y_n + 0.4, 5.0, over=0.6, end_col=BS)
    hwb = Wb / 2; T = 6.4
    Fb = Lb.F(0.0, -hwb, 1)
    # central front
    uc = hwb
    portal = arch_pts(uc, 3.6, ygb + 0.2, ygb + 5.4, 14)
    radial_panel(g, 'stucco', Fb, T, Wb - T, ygb - 3.0, ygb + 8.2, portal, BS)
    recess(g, Fb, portal, 1.2, 'stucco', BSD, 'wood', C('#4a2e1c'))
    rose = [(uc + math.cos(2 * math.pi * i / 24) * 2.5, ygb + 11.6 + math.sin(2 * math.pi * i / 24) * 2.5) for i in range(24)]
    radial_panel(g, 'stucco', Fb, T, Wb - T, ygb + 8.2, ygb + 17.0, rose, BS)
    recess(g, Fb, rose, 0.5, 'stucco', BSD, 'win', (0.9, 0.55, 0.3, 1.0))
    if not g.lod:
        for i in range(12):
            a = 2 * math.pi * i / 12
            g.rod('stucco', Geo.fp(Fb, uc, ygb + 11.6, -0.45), Geo.fp(Fb, uc + math.cos(a) * 2.45, ygb + 11.6 + math.sin(a) * 2.45, -0.45), 0.07, BSD, n=4)
        g.lathe('stucco', *Geo.fp(Fb, uc, 0, 0.1)[0::2], [(2.9, ygb + 11.6)], BSD) if False else None
        # ornate portal surround: stacked pilasters, entablature, niche with a statue
        for s in (-1, 1):
            for k in range(3):
                uu = uc + s * (2.4 + k * 0.6)
                g.fbox('stucco', Fb, uu - 0.25, uu + 0.25, ygb, ygb + 7.6 - k * 0.6, 0, 0.35 + 0.1 * k, BORN, top=True)
        g.fbox('stucco', Fb, uc - 4.2, uc + 4.2, ygb + 7.6, ygb + 8.4, 0, 0.7, BSD, top=True, bottom=True)
        slab_profile(g, 'stucco', Fb, [(uc - 1.0, ygb + 8.4), (uc + 1.0, ygb + 8.4), (uc + 1.0, ygb + 9.2), (uc, ygb + 9.8), (uc - 1.0, ygb + 9.2)], 0.0, 0.4, BORN)
        for s in (-1, 1):
            for k in range(3):
                uu = uc + s * (3.3 + k * 0.4)
                g.fbox('stucco', Fb, uu - 0.2, uu + 0.2, ygb + 9.0, ygb + 15.8, 0, 0.3, BORN, top=True)
    y_g = ygb + 17.0
    g.fbox('stucco', Fb, T - 0.2, Wb - T + 0.2, y_g - 0.6, y_g, 0, 0.8, BSD, top=True, bottom=True)
    crest = [(T, y_g), (Wb - T, y_g)]
    for i in range(15):
        t = i / 14; u = Wb - T - (Wb - 2 * T) * t
        crest.append((u, y_g + 0.6 + 3.6 * math.sin(math.pi * t) ** 0.8 + 0.4 * math.sin(4 * math.pi * t) * math.sin(math.pi * t)))
    slab_profile(g, 'stucco', Fb, crest, -0.6, 0.3, BS)
    pc = Geo.fp(Fb, uc, 0, 0.0); cross(g, pc[0], pc[2], y_g + 4.2, 2.2, GOLD, yaw_t=Fb[1], r=0.09)
    # towers
    for s in (0, 1):
        bb0, bb1 = (-hwb, -hwb + T) if s == 0 else (hwb - T, hwb)
        sq = Lb.ring([(0.0, bb0), (T, bb0), (T, bb1), (0.0, bb1)])
        yt1, yt2, yt3 = ygb + 21.0, ygb + 26.5, ygb + 28.2
        for ea, eb in ring_edges(sq):
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            hole = arch_pts(Le / 2, 1.1, ygb + 12.0, ygb + 14.2, 8 if not g.lod else 3)
            radial_panel(g, 'stucco', Fw, 0, Le, ygb - 3.0, yt1, hole, BS)
            recess(g, Fw, hole, 0.4, 'stucco', BSD, 'win', glass_col(0.4))
            if not g.lod:
                for uu in (0.3, Le - 0.3): g.fbox('stucco', Fw, uu - 0.3, uu + 0.3, ygb - 1.0, yt1, 0, 0.25, BORN, top=True)
        g.sweep('stucco', sq, [(0, yt1 - 0.5), (0.6, yt1 - 0.2), (0.6, yt1 + 0.4), (0, yt1 + 0.4)], BSD)
        sq2 = Lb.ring([(0.6, bb0 + 0.6), (T - 0.6, bb0 + 0.6), (T - 0.6, bb1 - 0.6), (0.6, bb1 - 0.6)])
        for ea, eb in ring_edges(sq2):
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            arcade_wall(g, Fw, 0, Le, yt1 + 0.4, yt2, Le, 3.0, BS, slot='stucco', open_=True, depth=0.6)
        g.prism('stucco', ring_scale(sq2, centroid(sq2), 0.45), yt1 + 0.4, yt2, BSD, top=False)
        g.sweep('stucco', sq2, [(0, yt2), (0.5, yt2 + 0.3), (0.5, yt2 + 0.9), (0, yt2 + 0.9)], BSD)
        cx, cz = centroid(sq2)
        g.lathe('stucco', cx, cz, [(2.3, yt2 + 0.9), (2.3, yt3), (2.5, yt3 + 0.3)], BS, n=8)
        prof = dome(g, cx, cz, yt3 + 0.3, 2.5, 3.2, DOME, slot='paint', ribs=8, rib_col=C('#f0e6d0'), shape=0.6)
        g.lathe('stucco', cx, cz, [(0.6, yt3 + 3.4), (0.6, yt3 + 4.4), (0.8, yt3 + 4.6), (0.0, yt3 + 4.8)], BS, n=8)
        cross(g, cx, cz, yt3 + 4.8, 1.5, GOLD, yaw_t=Fb[1], r=0.07)
        for (a_, b_) in ((0.0, bb0), (T, bb0), (T, bb1), (0.0, bb1)):
            p = Lb.xz(a_, b_); urn(g, p[0], p[1], yt1 + 0.4, 0.8, BORN, slot='stucco')
    cols += wall_colliders(rb, ygb - 4, y_n)
    return {'colliders': cols, 'name': 'Mission Dolores', 'replaces': 'missionDolores', 'yG': round(yG, 2), 'top': round(ygb + 36, 1)}


# ================================================================================== Saints Peter and Paul Church (1924) on Washington Square
SSPP_HIDE = [7990]


def sspp_frame():
    r = ring_out(ring_of(7990))
    e = max(ring_edges(r), key=lambda e: (e[0][1] + e[1][1]) - abs(v2len(v2sub(e[1], e[0])) - 33) * 0.1)   # south edge (largest z)
    n = edge_n(*e)
    return Loc(v2lerp(e[0], e[1], 0.5), (-n[0], -n[1])), v2len(v2sub(e[1], e[0]))


SSPP = dict(T=8.6, TOP=58.5, NAVE=22.0)


def sspp(g):
    L, W = sspp_frame()
    hw = W / 2
    yG = min(sidewalk(*L.xz(-1.0, b)) for b in (-hw, 0, hw)) + 0.1
    ST = C('#efebe2'); STD = C('#d9d3c6'); ORN = C('#e5dfd2')
    T, TOP, NAVE = SSPP['T'], SSPP['TOP'], SSPP['NAVE']
    cols = []
    r = ring_simplify(ring_of(7990), 0.4)
    y_n = yG + NAVE
    for ea, eb in ring_edges(r):
        n = edge_n(ea, eb); Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if n[0] * -L.u[0] + n[1] * -L.u[1] > 0.95: continue
        if Le > 12 and neighbour_top(ea, eb, set(SSPP_HIDE)) is None:
            facade(g, ea, eb, yG - 3.0, y_n - 1.5, NAVE + 1.5, 5.6, Win(w=2.2, sill=6.0, head=17.0, depth=0.5, arch=1, lit=0.45, mull=True), 'stucco', ST, margin=2.5,
                   pier=(1.2, 0.6, STD) if not g.lod else None)
            radial_panel(g, 'stucco', Fw, 0, Le, y_n - 1.5, y_n, None, ST)
        else:
            radial_panel(g, 'stucco', Fw, 0, Le, yG - 3.0, y_n, None, ST)
    g.sweep('stucco', r, [(0, y_n - 0.6), (0.6, y_n - 0.3), (0.6, y_n + 0.3), (0, y_n + 0.3)], STD)
    g.poly('roof', [(p[0], y_n, p[1]) for p in ring_offset(ring_out(r), -0.4)], ROOF, (0, 1, 0))
    loc = [L.loc(*p) for p in ring_out(r)]
    amax = max(q[0] for q in loc)
    gable(g, L, T, amax - 1.0, -hw + 1.0, hw - 1.0, y_n + 0.2, 7.5, col=C('#8c8f8a'), slot='metal', over=0.5, end_col=ST)
    # ---- front (faces south onto Filbert / Washington Square)
    F = L.F(0.0, -hw, 1)
    uc = hw
    yf = yG + 27.0
    portals = [arch_pts(uc, 3.6, yG + 0.9, yG + 5.6, 14, pointed=True), arch_pts(uc - 5.2, 2.4, yG + 0.9, yG + 4.4, 12, pointed=True),
               arch_pts(uc + 5.2, 2.4, yG + 0.9, yG + 4.4, 12, pointed=True)]
    portals.sort(key=lambda h: h[0][0])
    window_holes(g, F, T, W - T, yG - 3.0, yG + 9.5, portals, ST, 'stucco', glass_slot='wood', gcol=C('#3e2a1c'), depth=1.4)
    for h in portals:      # gilded mosaic tympanum above each door
        m = len(h); cu = sum(p[0] for p in h) / m; top_ = max(p[1] for p in h); wd = max(p[0] for p in h) - min(p[0] for p in h)
        if not g.lod:
            g.fbox('gold', F, cu - wd / 2 + 0.15, cu + wd / 2 - 0.15, top_ - wd * 0.65, top_ - wd * 0.62, -1.38, -1.3, C('#c9a24a'), top=True, bottom=True)
        for s in (-1, 1):
            for k in range(3):
                uu = cu + s * (wd / 2 + 0.25 + k * 0.35)
                p = Geo.fp(F, uu, 0, 0.15 + 0.12 * k)
                g.lathe('stucco', p[0], p[2], [(0.16, yG + 0.9), (0.14, top_ - wd * 0.7)], ORN, n=6 if not g.lod else 4)
    g.fbox('stucco', F, T - 0.3, W - T + 0.3, yG - 1.0, yG + 0.9, 0.0, 3.5, STD, top=True)          # entrance terrace
    for s in range(5):
        g.fbox('stucco', F, T + 1.0 - s * 0.2, W - T - 1.0 + s * 0.2, yG - 1.0 - s * 0.18, yG + 0.9 - (s + 1) * 0.18, 3.5 + s * 0.35, 3.85 + s * 0.35, STD, top=True)
    # inscription band (Dante, Paradiso I)
    g.fbox('stucco', F, T, W - T, yG + 9.5, yG + 10.4, 0, 0.35, STD, top=True, bottom=True)
    if not g.lod:
        g.text('stucco', F, uc, yG + 9.72, 0.36, "LA GLORIA DI COLUI CHE TUTTO MOVE", 0.42, shade(ST, 0.55), depth=0.04)
    rose = [(uc + math.cos(2 * math.pi * i / 32) * 3.6, yG + 15.6 + math.sin(2 * math.pi * i / 32) * 3.6) for i in range(32)]
    radial_panel(g, 'stucco', F, T, W - T, yG + 10.4, yf, rose, ST)
    recess(g, F, rose, 0.7, 'stucco', STD, 'win', (0.55, 0.62, 0.95, 1.0))
    if not g.lod:
        g.lathe('stucco', *Geo.fp(F, uc, 0, 0.0)[0::2], [(0.0, 0.0)], ST) if False else None
        for i in range(16):
            a = 2 * math.pi * i / 16
            g.rod('stucco', Geo.fp(F, uc + math.cos(a) * 0.8, yG + 15.6 + math.sin(a) * 0.8, -0.6), Geo.fp(F, uc + math.cos(a) * 3.55, yG + 15.6 + math.sin(a) * 3.55, -0.6), 0.08, STD, n=4)
        n_ = 32
        ring_ = [(uc + math.cos(2 * math.pi * i / n_) * 4.1, yG + 15.6 + math.sin(2 * math.pi * i / n_) * 4.1) for i in range(n_)]
        for i in range(n_):
            p, q = rose[i], rose[(i + 1) % n_]; p2, q2 = ring_[i], ring_[(i + 1) % n_]
            g.poly('stucco', [Geo.fp(F, *p, 0.02), Geo.fp(F, *q, 0.02), Geo.fp(F, *q2, 0.3), Geo.fp(F, *p2, 0.3)], ORN, (F[2][0], 0, F[2][1]))
        # arcade of niche statues over the portals
        for k in range(7):
            uu = uc - 6.0 + k * 2.0
            if abs(uu - uc) < 4.3: continue
            g.fbox('stucco', F, uu - 0.6, uu + 0.6, yG + 11.0, yG + 13.8, -0.3, 0.0, STD, top=False)
            p = Geo.fp(F, uu, 0, -0.15)
            g.lathe('stucco', p[0], p[2], [(0.3, yG + 11.0), (0.28, yG + 12.4), (0.18, yG + 12.8), (0.2, yG + 13.1), (0.0, yG + 13.35)], WHITE4, n=6)
    g.poly('stucco', [Geo.fp(F, T, yf, 0.0), Geo.fp(F, W - T, yf, 0.0), Geo.fp(F, uc, yf + 5.5, 0.0)], ST, (F[2][0], 0, F[2][1]))
    g.sweep('stucco', [Geo.fp(F, T, yf, 0.0)[0::2], Geo.fp(F, uc, yf, 0.0)[0::2]], [(0, yf - 0.3), (0, yf)], STD, closed=False) if False else None
    for s in (-1, 1):
        A_, B_ = Geo.fp(F, uc + s * (hw - T), yf, 0.0), Geo.fp(F, uc, yf + 5.5, 0.0)
        g.rod('stucco', A_, B_, 0.35, STD, n=6)
    pc = Geo.fp(F, uc, 0, 0.0); cross(g, pc[0], pc[2], yf + 5.4, 2.6, WHITE4, slot='stucco', yaw_t=F[1], r=0.14)
    # ---- twin spires: square shafts with lancet belfries, octagonal lanterns, openwork spires
    for s in (0, 1):
        bb0, bb1 = (-hw, -hw + T) if s == 0 else (hw - T, hw)
        sq = L.ring([(0.0, bb0), (T, bb0), (T, bb1), (0.0, bb1)])
        y1, y2, y3, y4 = yG + 30.0, yG + 38.0, yG + 44.5, yG + TOP
        for ea, eb in ring_edges(sq):
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            hs = [arch_pts(Le / 2, 1.3, yG + 12.0, yG + 15.0, 8, pointed=True), arch_pts(Le / 2, 1.5, yG + 20.0, yG + 24.5, 8, pointed=True)]
            window_holes(g, Fw, 0, Le, yG - 3.0, y1, hs, ST, 'stucco', depth=0.45, lit=0.3)
            if not g.lod:
                for uu in (0.35, Le - 0.35): g.fbox('stucco', Fw, uu - 0.35, uu + 0.35, yG - 1.0, y1 - 0.5, 0, 0.45, STD, top=True)
                for yy in (yG + 10.4, yG + 18.4, yG + 26.5):
                    g.fbox('stucco', Fw, -0.1, Le + 0.1, yy - 0.3, yy, 0, 0.5, STD, top=True, bottom=True)
        g.sweep('stucco', sq, [(0, y1 - 0.4), (0.7, y1), (0.7, y1 + 0.6), (0, y1 + 0.6)], STD)
        sq2 = L.ring([(0.9, bb0 + 0.9), (T - 0.9, bb0 + 0.9), (T - 0.9, bb1 - 0.9), (0.9, bb1 - 0.9)])
        for ea, eb in ring_edges(sq2):
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            h2 = [arch_pts(Le / 2, 2.6, y1 + 1.5, y2 - 2.8, 10 if not g.lod else 4, pointed=True)]
            from hero_int_w3 import wall_with_holes
            wall_with_holes(g, Fw, 0, Le, y1 + 0.6, y2, h2, ST, slot='stucco')
            m = len(h2[0]); cu = sum(p[0] for p in h2[0]) / m; cv = sum(p[1] for p in h2[0]) / m
            for k in range(m):
                p, q = h2[0][k], h2[0][(k + 1) % m]
                if p[1] < y1 + 1.6 and q[1] < y1 + 1.6: continue
                mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
                g.poly('stucco', [Geo.fp(Fw, p[0], p[1], 0), Geo.fp(Fw, q[0], q[1], 0), Geo.fp(Fw, q[0], q[1], -0.8), Geo.fp(Fw, p[0], p[1], -0.8)], STD,
                       (-(Fw[1][0] * mu), -mv, -(Fw[1][1] * mu)))
            pg = [Geo.fp(Fw, 0.2, y2, 0.2), Geo.fp(Fw, Le - 0.2, y2, 0.2), Geo.fp(Fw, Le / 2, y2 + 3.2, 0.2)]
            g.poly('stucco', pg, ST, (Fw[2][0], 0, Fw[2][1]))
        g.prism('stucco', ring_scale(sq2, centroid(sq2), 0.5), y1 + 0.6, y2, STD, top=False)
        for (a_, b_) in ((0.9, bb0 + 0.9), (T - 0.9, bb0 + 0.9), (T - 0.9, bb1 - 0.9), (0.9, bb1 - 0.9)):     # corner pinnacles
            p = L.xz(a_, b_)
            g.lathe('stucco', p[0], p[1], [(0.55, y1 + 0.6), (0.55, y2 + 1.0), (0.4, y2 + 1.2), (0.0, y2 + 5.0)], ST, n=8 if not g.lod else 4)
        cx, cz = L.xz(T / 2, (bb0 + bb1) / 2)
        oc = ring_facets(cx, cz, (T - 1.8) / 2 / math.cos(math.pi / 8), 8, math.pi / 8)
        for ea, eb in ring_edges(oc):
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            arcade_wall(g, Fw, 0, Le, y2, y3, Le, 3.2, ST, slot='stucco', open_=True, depth=0.4)
        g.lathe('stucco', cx, cz, [((T - 1.8) / 2 + 0.5, y3), ((T - 1.8) / 2 + 0.5, y3 + 0.6), ((T - 1.8) / 2, y3 + 0.8)], STD, n=8)
        rs = (T - 1.8) / 2
        g.lathe('stucco', cx, cz, [(rs, y3 + 0.8), (rs * 0.12, y4 - 2.2), (0.0, y4 - 1.9)], ST, n=8)
        if not g.lod:
            for i in range(8):     # crockets on the spire edges
                a = 2 * math.pi * i / 8 + math.pi / 8
                for k in range(6):
                    t = (k + 0.5) / 6; rr = rs * (1 - t * 0.88) / math.cos(math.pi / 8); yy = y3 + 0.8 + (y4 - 3.0 - y3) * t
                    g.box('stucco', cx + math.cos(a) * rr - 0.14, cx + math.cos(a) * rr + 0.14, yy - 0.14, yy + 0.14, cz + math.sin(a) * rr - 0.14, cz + math.sin(a) * rr + 0.14, STD)
        cross(g, cx, cz, y4 - 2.0, 2.2, GOLD, yaw_t=F[1], r=0.08)
        if not g.lod:   # floodlight
            p = L.xz(-2.0, (bb0 + bb1) / 2)
            g.box('lamp', p[0] - 0.3, p[0] + 0.3, yG + 0.9, yG + 1.2, p[1] - 0.3, p[1] + 0.3, (1.0, 0.92, 0.75, 1.0))
    cols += wall_colliders(r, yG - 4, y_n)
    return {'colliders': cols, 'name': 'Saints Peter and Paul Church', 'yG': round(yG, 2), 'top': round(yG + TOP + 1, 1)}


# ================================================================================== Columbus Tower / Sentinel Building (1907)
CT_HIDE = [13577, 13646]


def ct_ring():
    pts = ring_of(13577) + ring_of(13646)
    return ring_simplify(hull(pts), 0.6)


def columbus_tower(g):
    r = ring_out(ct_ring())
    tip = centroid(ring_of(13646))
    yG = min(sidewalk(*p) for p in r) + 0.05
    GRN = C('#5f8e7a'); GRN_D = C('#4c7564'); TRIM = C('#e7e1cf'); BASE = C('#cfc6b2')
    lv = floor_levels(yG, [5.2] + [3.75] * 7)
    top = lv[-1]
    cols = []
    RT = 3.4                                             # prow turret radius
    for ea, eb in ring_edges(r):
        Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        d = min(v2len(v2sub(ea, tip)), v2len(v2sub(eb, tip)))
        nt = neighbour_top(ea, eb, set(CT_HIDE))
        if Le < 1.0: continue
        if nt is not None and nt > yG + 4:
            radial_panel(g, 'stucco', Fw, 0, Le, yG - 3.0, top + 1.0, None, C('#bdb3a0')); continue
        # trim the ends near the prow (the turret takes the corner)
        u0 = RT + 0.3 if v2len(v2sub(ea, tip)) < RT + 3 else 0.0
        u1 = Le - (RT + 0.3) if v2len(v2sub(eb, tip)) < RT + 3 else Le
        if u0 > 0: radial_panel(g, 'stucco', Fw, 0, u0, yG - 3.0, top, None, GRN_D)
        if u1 < Le: radial_panel(g, 'stucco', Fw, u1, Le, yG - 3.0, top, None, GRN_D)
        a2, b2 = v2lerp(ea, eb, u0 / Le), v2lerp(ea, eb, u1 / Le)
        storefront(g, a2, b2, sidewalk, lv[1], 3.2, 'stucco', BASE, glass_slot='shop', lit=0.95, frame_col=C('#2a2a26'), awning=C('#2d4a3a') if Le > 10 else None)
        facade(g, a2, b2, lv[1], top, 3.75, 2.6, Win(w=1.5, sill=0.8, head=3.0, depth=0.25, lit=0.45, frame_col=TRIM), 'paint', GRN, margin=0.6,
               band=(0.3, 0.12, TRIM))
        # projecting oriel bays on the long faces
        if (u1 - u0) > 12 and not g.lod:
            for uu in (u0 + (u1 - u0) * 0.3, u0 + (u1 - u0) * 0.7):
                g.fbox('paint', Fw, uu - 1.6, uu + 1.6, lv[1] + 0.5, lv[-2], 0.0, 0.9, GRN, top=True, bottom=True)
                for k in range(1, 7):
                    yk = lv[k] + 0.8
                    g.fbox('win', Fw, uu - 1.2, uu + 1.2, yk, yk + 2.2, 0.9, 0.92, glass_col(0.4), top=False, sides=False)
    g.sweep('stucco', r, [(0, top - 0.4), (0.8, top), (0.8, top + 0.6), (0, top + 0.9)], TRIM)
    g.poly('roof', [(p[0], top + 0.3, p[1]) for p in ring_offset(r, -0.4)], ROOF, (0, 1, 0))
    # prow turret: cylinder bay with a window band on every floor, cupola on top
    cx, cz = tip
    nt_ = 20 if not g.lod else 10
    for k in range(len(lv) - 1):
        y0, y1 = lv[k], lv[k + 1]
        g.lathe('paint' if k else 'stucco', cx, cz, [(RT, y0), (RT, y1)], GRN if k else BASE, n=nt_)
        if k:
            for i in range(nt_):
                if i % 2: continue
                a = 2 * math.pi * (i + 0.5) / nt_
                p = (cx + math.cos(a) * (RT + 0.02), cz + math.sin(a) * (RT + 0.02))
                Fp = (p, (-math.sin(a), math.cos(a)), (math.cos(a), math.sin(a)))
                g.fbox('win', Fp, -0.45, 0.45, y0 + 0.8, y1 - 0.7, -0.02, 0.0, glass_col(0.45), top=False, sides=False)
            g.lathe('stucco', cx, cz, [(RT, y1 - 0.2), (RT + 0.12, y1 - 0.15), (RT + 0.12, y1 + 0.05), (RT, y1 + 0.1)], TRIM, n=nt_)
        else:
            for i in range(nt_):
                if i % 3: continue
                a = 2 * math.pi * (i + 0.5) / nt_
                p = (cx + math.cos(a) * (RT + 0.02), cz + math.sin(a) * (RT + 0.02))
                Fp = (p, (-math.sin(a), math.cos(a)), (math.cos(a), math.sin(a)))
                g.fbox('shop', Fp, -0.8, 0.8, y0 + 0.4, y1 - 1.0, -0.02, 0.0, (1.0, 0.86, 0.62, 1.0), top=False, sides=False)
    g.lathe('stucco', cx, cz, [(RT, top - 0.3), (RT + 0.7, top + 0.2), (RT + 0.7, top + 0.8), (RT - 0.2, top + 1.0)], TRIM, n=nt_)
    g.lathe('paint', cx, cz, [(RT - 0.2, top + 1.0), (RT - 0.2, top + 3.2)], GRN, n=nt_)
    for i in range(8 if not g.lod else 0):
        a = 2 * math.pi * (i + 0.5) / 8
        p = (cx + math.cos(a) * (RT - 0.18), cz + math.sin(a) * (RT - 0.18))
        Fp = (p, (-math.sin(a), math.cos(a)), (math.cos(a), math.sin(a)))
        g.fbox('win', Fp, -0.4, 0.4, top + 1.5, top + 2.8, -0.02, 0.0, glass_col(0.5), top=False, sides=False)
    g.lathe('stucco', cx, cz, [(RT - 0.2, top + 3.2), (RT + 0.1, top + 3.5), (RT - 0.4, top + 3.7)], TRIM, n=nt_)
    dome(g, cx, cz, top + 3.7, RT - 0.4, 3.4, VERD, slot='paint', ribs=8, rib_col=VERD_D, shape=0.7)
    g.lathe('paint', cx, cz, [(0.35, top + 7.0), (0.5, top + 7.6), (0.15, top + 8.4), (0.0, top + 9.2)], VERD_D, n=8)
    cols += wall_colliders(r, yG - 3, top)
    cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': RT, 'hz': RT, 'yaw': 0.39, 'yMin': yG - 3, 'yMax': top})
    return {'colliders': cols, 'name': 'Columbus Tower', 'yG': round(yG, 2), 'top': round(top + 9.5, 1)}


# ================================================================================== gothic kit
def gothic_bays(g, F, u0, u1, y0, y1, bay, ww, sill, spring, col, slot='stone', pier_d=0.9, pier_w=1.1, lit=0.5, glass=(0.45, 0.4, 0.75, 1.0), tracery=True,
                buttress_top=None):
    """wall with a pointed lancet window per bay and a stepped buttress between bays (u along F)"""
    L_ = u1 - u0; n = max(1, int(round(L_ / bay))); bw = L_ / n
    holes = [arch_pts(u0 + (i + 0.5) * bw, min(ww, bw - pier_w - 0.4), y0 + sill, y0 + spring, 10 if not g.lod else 3, pointed=True) for i in range(n)]
    window_holes(g, F, u0, u1, y0, y1, holes, col, slot, glass_slot='win', gcol=glass, depth=0.5)
    if not g.lod:
        for i in range(n + 1):
            u = u0 + i * bw
            bt = buttress_top or (y1 - 1.0)
            g.fbox(slot, F, u - pier_w / 2, u + pier_w / 2, y0 - 1.0, bt - 2.0, 0, pier_d, shade(col, 0.95), top=True)
            g.poly(slot, [Geo.fp(F, u - pier_w / 2, bt - 2.0, pier_d), Geo.fp(F, u + pier_w / 2, bt - 2.0, pier_d), Geo.fp(F, u + pier_w / 2, bt, 0.0), Geo.fp(F, u - pier_w / 2, bt, 0.0)],
                   col, (F[2][0], 1, F[2][1]))
            for s in (-1, 1):
                g.poly(slot, [Geo.fp(F, u + s * pier_w / 2, bt - 2.0, pier_d), Geo.fp(F, u + s * pier_w / 2, bt, 0.0), Geo.fp(F, u + s * pier_w / 2, bt - 2.0, 0.0)], col, None)
        if tracery:
            for h in holes:
                m = len(h); cu = sum(p[0] for p in h) / m; wd = max(p[0] for p in h) - min(p[0] for p in h)
                g.fbox('metal', F, cu - 0.05, cu + 0.05, y0 + sill, y0 + spring + wd * 0.3, -0.5, -0.45, C('#3a3834'), top=False)
    return holes


def rose(g, F, uc, yc, R, col, slot='stone', glass=(0.55, 0.45, 0.9, 1.0), spokes=16, depth=0.6):
    pts = [(uc + math.cos(2 * math.pi * i / 32) * R, yc + math.sin(2 * math.pi * i / 32) * R) for i in range(32)]
    recess(g, F, pts, depth, slot, shade(col, 0.9), 'win', glass)
    if not g.lod:
        for i in range(spokes):
            a = 2 * math.pi * i / spokes
            g.rod(slot, Geo.fp(F, uc + math.cos(a) * R * 0.22, yc + math.sin(a) * R * 0.22, -depth + 0.05), Geo.fp(F, uc + math.cos(a) * R * 0.98, yc + math.sin(a) * R * 0.98, -depth + 0.05),
                  0.07, col, n=4)
        ring_ = [(uc + math.cos(2 * math.pi * i / 32) * R * 0.22, yc + math.sin(2 * math.pi * i / 32) * R * 0.22) for i in range(32)]
        for i in range(32):
            p, q = ring_[i], ring_[(i + 1) % 32]
            g.poly(slot, [Geo.fp(F, *p, -depth + 0.05), Geo.fp(F, *q, -depth + 0.05), Geo.fp(F, uc, yc, -depth + 0.05)], col, (F[2][0], 0, F[2][1]))
        outer = [(uc + math.cos(2 * math.pi * i / 32) * (R + 0.6), yc + math.sin(2 * math.pi * i / 32) * (R + 0.6)) for i in range(32)]
        for i in range(32):
            p, q = pts[i], pts[(i + 1) % 32]; p2, q2 = outer[i], outer[(i + 1) % 32]
            g.poly(slot, [Geo.fp(F, *p, 0.02), Geo.fp(F, *q, 0.02), Geo.fp(F, *q2, 0.25), Geo.fp(F, *p2, 0.25)], shade(col, 1.03), (F[2][0], 0, F[2][1]))
    return pts


def pinnacle(g, x, z, y, h, r, col, slot='stone'):
    g.lathe(slot, x, z, [(r, y), (r, y + h * 0.35), (r * 1.15, y + h * 0.4), (r * 0.9, y + h * 0.42), (0.0, y + h)], col, n=4 if g.lod else 8)


# ================================================================================== Grace Cathedral (1928-64, Lewis Hobart)
GRACE_HIDE = [16833, 17137, 17138, 16834]


def grace_frame():
    t1, t2 = centroid(ring_of(17137)), centroid(ring_of(17138))
    fr = max(max(p[0] for p in ring_of(17137)), max(p[0] for p in ring_of(17138)))
    e = max(ring_edges(ring_of(16833)), key=lambda e: e[0][0] + e[1][0] - abs(edge_n(*e)[1]) * 50)
    n = edge_n(*e)
    u = (-n[0], -n[1])
    m = v2lerp(t1, t2, 0.5)
    L0 = Loc(m, u)
    af = min(L0.loc(*p)[0] for i in (17137, 17138) for p in ring_of(i))
    return Loc(L0.xz(af, 0.0), u)


GR = dict(NB=7.2, AB=13.8, YA=14.0, YN=30.0, TW=53.0)


def grace(g):
    L = grace_frame()
    r = ring_simplify(ring_of(16833), 0.35)
    yG = min(sidewalk(*L.xz(-2.0, b)) for b in (-14, 0, 14)) + 0.1
    ST = C('#cdc6b8'); STD = C('#b8b0a1'); ROOFC = C('#6f7f79')
    NB, AB, YA, YN, TW = GR['NB'], GR['AB'], yG + GR['YA'], yG + GR['YN'], yG + GR['TW']
    cols = []
    loc = [L.loc(*p) for p in ring_out(r)]
    amax = max(q[0] for q in loc)
    # transept arms: the ring points with |b| > AB + 2
    tr = [q for q in loc if abs(q[1]) > AB + 3]
    ta0, ta1 = (min(q[0] for q in tr), max(q[0] for q in tr)) if tr else (55.0, 68.0)
    tb = max(abs(q[1]) for q in loc)
    # ---- aisle / outer walls (ring) with lancets + buttresses
    for ea, eb in ring_edges(r):
        Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea)); n = edge_n(ea, eb)
        if n[0] * -L.u[0] + n[1] * -L.u[1] > 0.9:
            radial_panel(g, 'stone', Fw, 0, Le, yG - 3.0, YA, None, ST); continue
        if Le > 9:
            gothic_bays(g, Fw, 0, Le, yG - 3.0, YA, 6.2, 2.4, 5.5, 11.0, ST, glass=(0.4, 0.35, 0.8, 1.0))
        else:
            radial_panel(g, 'stone', Fw, 0, Le, yG - 3.0, YA, None, ST)
    g.sweep('stone', r, [(0, YA - 0.4), (0.5, YA - 0.1), (0.5, YA + 0.5), (0, YA + 0.7)], STD)
    g.poly('roof', [(p[0], YA + 0.3, p[1]) for p in ring_offset(ring_out(r), -0.4)], ROOFC, (0, 1, 0))
    # ---- clerestory: nave (a 8..ta0, apse beyond) + transept arms, flying buttresses
    for (a0, a1, b0, b1) in ((8.0, amax - 12.0, -NB, NB), (ta0 + 1.0, ta1 - 1.0, -tb + 1.0, tb - 1.0)):
        rr = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
        for ea, eb in ring_edges(rr):
            if b1 > NB + 1:          # transept: only the arm walls (the crossing is open to the nave inside)
                la, lb = L.loc(*ea), L.loc(*eb)
                if abs(la[1] - lb[1]) > 1.0:
                    for (s0, s1) in ((-tb + 1.0, -NB), (NB, tb - 1.0)):
                        pa_, pb_ = L.xz(la[0], s0 if la[1] < lb[1] else s1), L.xz(la[0], s1 if la[1] < lb[1] else s0)
                        Fw2 = Geo.frame(pa_, pb_); radial_panel(g, 'stone', Fw2, 0, v2len(v2sub(pb_, pa_)), YA, YN, None, ST)
                    continue
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            if Le > 12: gothic_bays(g, Fw, 0, Le, YA, YN, 6.2, 3.0, 2.2, 10.0, ST, pier_d=0.6, glass=(0.5, 0.35, 0.75, 1.0), buttress_top=YN - 1.0)
            else: radial_panel(g, 'stone', Fw, 0, Le, YA, YN, None, ST)
        g.sweep('stone', rr, [(0, YN - 0.3), (0.4, YN), (0.4, YN + 0.5), (0, YN + 0.5)], STD)
        ridge_a = (a1 - a0) > (b1 - b0)
        gable(g, L, a0, a1, b0, b1, YN + 0.4, 9.0 if ridge_a else 9.0, col=ROOFC, slot='metal', over=0.4, ridge_a=ridge_a, end_col=ST, end_slot='stone')
    if not g.lod:     # flying buttresses along the nave
        for k in range(int((ta0 - 12) / 6.2) + 1):
            a = 12.0 + k * 6.2
            for s in (-1, 1):
                g.rod('stone', L.P(a, s * (AB + 0.3), YA + 1.5), L.P(a, s * (NB + 0.2), YN - 3.0), 0.4, STD, n=4)
                pinnacle(g, *L.xz(a, s * (AB + 0.3)), YA + 0.5, 4.5, 0.6, ST)
    # ---- apse: polygonal clerestory at the west end
    ac = L.xz(amax - 12.0, 0.0)
    fac = [L.xz(amax - 12.0 + math.sin(t) * (NB) * 1.0, math.cos(t) * NB) for t in [math.pi * i / 6 for i in range(7)]]
    for i in range(6):
        a_, b_ = fac[i], fac[i + 1]
        Fw = Geo.frame(a_, b_)
        if Fw[2][0] * (a_[0] - ac[0]) + Fw[2][1] * (a_[1] - ac[1]) < 0: Fw = Geo.frame(b_, a_)
        Le = v2len(v2sub(b_, a_))
        gothic_bays(g, Fw, 0, Le, YA, YN, Le, 2.2, 2.2, 10.0, ST, pier_d=0.5, tracery=False)
    for i in range(6):
        g.poly('metal', [(fac[i][0], YN + 0.4, fac[i][1]), (fac[i + 1][0], YN + 0.4, fac[i + 1][1]), (ac[0], YN + 8.0, ac[1])], ROOFC, (0, 1, 0))
    # ---- fleche over the crossing
    fx, fz = centroid(ring_of(16834))
    ytop = min(yG + 75.0, bld(16834)['base'] + bld(16834)['h'])
    g.lathe('metal', fx, fz, [(2.2, YN + 7.0), (2.2, YN + 12.0), (1.9, YN + 12.4), (1.9, YN + 16.0), (0.25, ytop - 1.5), (0.0, ytop)], C('#5f706b'), n=8 if not g.lod else 6)
    if not g.lod:
        for i in range(8):
            a = 2 * math.pi * (i + 0.5) / 8
            p = (fx + math.cos(a) * 2.21, fz + math.sin(a) * 2.21)
            Fp = (p, (-math.sin(a), math.cos(a)), (math.cos(a), math.sin(a)))
            g.fbox('win', Fp, -0.4, 0.4, YN + 8.0, YN + 11.2, -0.02, 0.0, glass_col(0.4), top=False, sides=False)
    cross(g, fx, fz, ytop, 2.0, GOLD, yaw_t=L.v, r=0.08)
    # ---- west front (faces Taylor St, east): towers + central gable with the rose window + portal
    F = L.F(0.0, -AB, 1)
    W = 2 * AB
    uc = AB
    tw = [ring_simplify(ring_of(i), 0.3) for i in (17137, 17138)]
    tb_ = sorted([(min(L.loc(*p)[1] for p in t_), max(L.loc(*p)[1] for p in t_)) for t_ in tw])
    ci0, ci1 = tb_[0][1], tb_[1][0]                 # central front between the towers
    portal = arch_pts(uc + (ci0 + ci1) / 2, 4.2, yG + 0.3, yG + 7.0, 16, pointed=True)
    radial_panel(g, 'stone', F, AB + ci0, AB + ci1, yG - 3.0, yG + 13.0, portal, ST)
    recess(g, F, portal, 1.8, 'stone', STD, 'gold', C('#b58f3e'))            # the gilded bronze doors
    if not g.lod:
        for k in range(4):              # stepped archivolts
            pk = arch_pts(uc + (ci0 + ci1) / 2, 4.2 + 0.7 * (k + 1), yG + 0.3, yG + 7.0, 16, pointed=True)
            for i in range(2, len(pk) - 1):
                p, q = pk[i], pk[i + 1]
                g.poly('stone', [Geo.fp(F, *p, 0.05 * k), Geo.fp(F, *q, 0.05 * k), Geo.fp(F, *q, 0.25 + 0.05 * k), Geo.fp(F, *p, 0.25 + 0.05 * k)], STD, (0, 1, 0))
    ucc = AB + (ci0 + ci1) / 2
    rp = rose(g, F, ucc, yG + 21.0, 4.3, ST)
    radial_panel(g, 'stone', F, AB + ci0, AB + ci1, yG + 13.0, YN, rp, ST)
    g.poly('stone', [Geo.fp(F, AB + ci0, YN, 0), Geo.fp(F, AB + ci1, YN, 0), Geo.fp(F, ucc, YN + 9.0, 0)], ST, (F[2][0], 0, F[2][1]))
    pc = Geo.fp(F, ucc, 0, 0); cross(g, pc[0], pc[2], YN + 9.0, 2.2, ST, slot='stone', yaw_t=F[1], r=0.18)
    # outer front walls (aisles) beside the towers
    for (u0, u1) in ((0.0, AB + tb_[0][0]), (AB + tb_[1][1], W)):
        if u1 - u0 > 0.3: radial_panel(g, 'stone', F, u0, u1, yG - 3.0, YA, None, ST)
    for t_, (b0, b1) in zip(sorted(tw, key=lambda t_: min(L.loc(*p)[1] for p in t_)), tb_):
        for ea, eb in ring_edges(t_):
            Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            hs = [arch_pts(Le / 2, 1.6, yG + 16.0, yG + 20.0, 8, pointed=True), arch_pts(Le / 2, 2.4, yG + 31.0, yG + 44.0, 10 if not g.lod else 4, pointed=True)]
            window_holes(g, Fw, 0, Le, yG - 3.0, TW - 2.0, hs, ST, 'stone', depth=0.8, lit=0.25, gcol=(0.08, 0.08, 0.1, 1.0))
            if not g.lod:
                for uu in (0.4, Le - 0.4): g.fbox('stone', Fw, uu - 0.45, uu + 0.45, yG - 1.0, TW - 2.5, 0, 0.6, STD, top=True)
                for yy in (yG + 14.0, yG + 28.5): g.fbox('stone', Fw, -0.2, Le + 0.2, yy - 0.4, yy, 0, 0.7, STD, top=True, bottom=True)
        g.sweep('stone', t_, [(0, TW - 2.0), (0.5, TW - 1.6), (0.5, TW), (0, TW)], STD)
        g.poly('roof', [(p[0], TW - 0.3, p[1]) for p in ring_offset(ring_out(t_), -0.3)], ROOF, (0, 1, 0))
        for p in ring_out(t_):
            pinnacle(g, p[0], p[1], TW, 5.0, 0.8, ST)
        cols += wall_colliders(t_, yG - 3, TW)
    if not g.lod:
        # blind lancet gallery under the rose, niche figures, gable tracery
        n_ = 7; gw = (ci1 - ci0 - 1.0) / n_
        for k in range(n_):
            uu = AB + ci0 + 0.5 + (k + 0.5) * gw
            h = arch_pts(uu, gw * 0.7, yG + 13.6, yG + 15.6, 6, pointed=True)
            g.poly('stone', [Geo.fp(F, *p, 0.02) for p in h], shade(ST, 0.78), (F[2][0], 0, F[2][1]))
            g.fbox('stone', F, uu - gw / 2 - 0.1, uu - gw / 2 + 0.1, yG + 13.2, yG + 16.6, 0, 0.25, STD, top=True)
        g.fbox('stone', F, AB + ci0, AB + ci1, yG + 12.8, yG + 13.3, 0, 0.5, STD, top=True, bottom=True)
        g.fbox('stone', F, AB + ci0, AB + ci1, yG + 16.6, yG + 17.0, 0, 0.5, STD, top=True, bottom=True)
        for k in range(3):
            h = arch_pts(ucc + (k - 1) * 1.7, 1.1, YN + 1.0 + (1 - abs(k - 1)) * 1.2, YN + 3.0 + (1 - abs(k - 1)) * 1.2, 6, pointed=True)
            g.poly('win', [Geo.fp(F, *p, 0.02) for p in h], glass_col(0.3), (F[2][0], 0, F[2][1]))
        for s in (-1, 1):
            g.rod('stone', Geo.fp(F, ucc + s * ((ci1 - ci0) / 2 + 0.3), YN - 0.2, 0.4), Geo.fp(F, ucc, YN + 9.1, 0.4), 0.3, STD, n=4)
    # forecourt terrace + the broad stair down to Taylor St (walkable)
    decks = []
    at = street_line(L, 'Taylor Street', 'grace', axis=0)
    a_st = max([a for a in at if a < 0], default=-24.0) + 7.5
    y_st = sidewalk(*L.xz(a_st, 0.0))
    ucs = (ci0 + ci1) / 2
    L.box(g, 'paving', -6.0, 0.4, -AB, AB, yG - 4.0, yG, C('#c9c2b4'), top=True)
    decks += rect_decks(L, -6.0, 0.0, -AB, AB, yG, strip=9.0)
    if a_st < -7.0 and yG - y_st > 0.4:
        A_, B_ = L.xz(a_st, ucs), L.xz(-6.0, ucs)
        decks.append(ext_stairs(g, A_, B_, y_st, yG, 18.0, C('#c9c2b4'), slot='granite'))
        cols.append(L.col(a_st, -6.0, ucs - 9.6, ucs - 9.1, y_st - 1, yG + 0.9)); cols.append(L.col(a_st, -6.0, ucs + 9.1, ucs + 9.6, y_st - 1, yG + 0.9))
    cols += wall_colliders(r, yG - 4, YA)
    return {'colliders': cols, 'name': 'Grace Cathedral', 'replaces': 'graceCathedral', 'yG': round(yG, 2), 'top': round(ytop + 2, 1), 'decks': decks,
            'noTrees': [[list(p) for p in L.ring([(a_st - 2, -AB - 3), (4, -AB - 3), (4, AB + 3), (a_st - 2, AB + 3)])]]}


# ================================================================================== Fairmont (1907, Reid Bros / Julia Morgan) + tower
FAIR_HIDE = [17164, 17136]


def fairmont(g):
    r = ring_simplify(ring_of(17164), 0.3)
    yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    WAL = C('#ebe4d4'); WAL_D = C('#d4cab4')
    top = yG + 35.0
    lv0 = classic_block_w4(g, r, set(FAIR_HIDE), yG, top, 6.0, 3.6, 3.2, (WAL, WAL_D),
                           lambda k, i: Win(w=1.3, sill=0.8, head=2.8, depth=0.35, lit=0.5, hood=0.12 if k % 3 == 0 else 0), attic=(3.8, Win(w=1.1, sill=0.6, head=2.5, lit=0.4)))
    cols = []
    # Mason St front: central pavilion with the porte-cochere portico, flags on the roofline
    ea, eb = fair_front(r)
    F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea)); um = Le / 2
    for k in range(6):
        u = um + (k - 2.5) * 3.4
        p = Geo.fp(F, u, 0, 6.5)
        cols.append(column(g, p[0], p[2], H(p[0], p[2]) + 0.05, lv0 + 0.5, 0.45, WAL, order='ionic'))
    g.fbox('stone', F, um - 10.0, um + 10.0, lv0 + 0.3, lv0 + 1.6, 0.0, 7.2, WAL_D, top=True, bottom=True)
    balustrade(g, Geo.fp(F, um - 10.0, 0, 7.2)[0::2], Geo.fp(F, um + 10.0, 0, 7.2)[0::2], lv0 + 1.6, 1.1, WAL)
    if not g.lod:
        g.text('stone', F, um, lv0 + 0.55, 7.25, 'THE FAIRHAVEN', 0.75, shade(WAL, 0.55), depth=0.05)
        for k in range(9):
            u = um + (k - 4) * 5.0
            q = Geo.fp(F, u, 0, 0.6)
            g.cyl('metal', q[0], q[2], 0.07, top + 1.0, top + 8.5, C('#e0e0e0'), n=5)
            Ff = ((q[0], q[2]), F[1], F[2])
            g.fbox('fabric', Ff, 0.1, 2.2, top + 6.8, top + 8.2, -0.02, 0.02, [C('#1f3b7a'), C('#b3162a'), C('#e8e8e8')][k % 3], top=False, back=True)
        for k in range(12):
            q = Geo.fp(F, um + (k - 5.5) * 1.6, lv0 - 0.4, 0.3)
            g.box('lamp', q[0] - 0.12, q[0] + 0.12, q[1] - 0.3, q[1] + 0.3, q[2] - 0.12, q[2] + 0.12, (1.0, 0.85, 0.6, 1.0))
    # the 1961 tower on the Powell side: slab with vertical white fins
    t = ring_simplify(ring_of(17136), 0.5)
    ty0 = min(sidewalk(*p) for p in ring_out(t)) + 0.1
    ty1 = bld(17136)['base'] + bld(17136)['h']
    for ea_, eb_ in ring_edges(t):
        Fw = Geo.frame(ea_, eb_); Lw = v2len(v2sub(eb_, ea_))
        nt = neighbour_top(ea_, eb_, set(FAIR_HIDE))
        if nt and nt > ty0 + 20:
            radial_panel(g, 'concrete', Fw, 0, Lw, ty0 - 3, ty1, None, C('#d9d6cf')); continue
        tfacade(g, ea_, eb_, ty0 - 3, ty1 - 3.0, 3.1, 1.8, Win(w=1.4, sill=0.6, head=2.7, depth=0.2, lit=0.5, mull=False), 'concrete', C('#e4e1da'), margin=0.6)
        if not g.lod:
            for k in range(int(Lw / 1.8) + 1):
                g.fbox('concrete', Fw, k * 1.8 - 0.12, k * 1.8 + 0.12, ty0 + 6, ty1 - 3.0, 0, 0.5, C('#f0eee8'), top=True)
    parapet(g, t, ty1 - 3.0, 3.0, 0.3, C('#e4e1da'), slot='concrete', roof_col=ROOF)
    cols += wall_colliders(r, yG - 4, top) + wall_colliders(t, ty0 - 3, ty1)
    return {'colliders': cols, 'name': 'The Fairhaven (Nob Hill hotel)', 'yG': round(yG, 2), 'top': round(ty1 + 1, 1)}


def fair_front(r):
    return min([e for e in ring_edges(r) if edge_n(*e)[0] < -0.9], key=lambda e: e[0][0] + e[1][0])


def classic_block_w4(g, ring, own, yG, top, base_h, fh, bay, pal, win, attic=None):
    from hero_wave2 import classic_block
    return classic_block(g, ring, own, yG, top, base_h, fh, bay, pal, win, attic=attic)


# ================================================================================== Mark Hopkins (1926, Weeks & Day) + Top of the Mark
MH_HIDE = [17153, 17155, 17154, 17157, 17158]
MH = dict(TOWER=66.0, TOM=5.2)


def mark_hopkins(g):
    BR = C('#d9c7a6'); BRD = C('#c2ab86'); TC = C('#e6d8bc'); CU = C('#6f9481')
    cols = []
    yG = min(sidewalk(*p) for i in MH_HIDE[:3] for p in ring_out(ring_of(i))) + 0.1
    yT = yG + MH['TOWER']; yTop = yT + MH['TOM']
    for i, top in ((17155, yG + 58.0), (17154, yG + 58.0), (17157, yG + 16.0), (17158, yG + 8.5)):
        r = ring_simplify(ring_of(i), 0.3)
        y0 = min(sidewalk(*p) for p in ring_out(r)) + 0.1
        if top > y0 + 20:
            classic_block_w4(g, r, set(MH_HIDE), y0, top, 6.5, 3.35, 3.0, (BR, BRD),
                             lambda k, i_: Win(w=1.25, sill=0.8, head=2.7, depth=0.3, lit=0.5, hood=0.1 if k > 13 else 0), attic=(3.6, Win(w=1.1, sill=0.7, head=2.6, arch=1, lit=0.45)))
            # steep copper hip on each wing end
            loc = Loc(centroid(ring_out(r)), v2norm(v2sub(*max(ring_edges(r), key=lambda e: v2len(v2sub(e[1], e[0])))[::-1])))
            q = [loc.loc(*p) for p in ring_out(r)]
            a0, a1, b0, b1 = min(x[0] for x in q) + 1.0, max(x[0] for x in q) - 1.0, min(x[1] for x in q) + 1.0, max(x[1] for x in q) - 1.0
            hip(g, loc, a0, a1, b0, b1, top + 1.0, 4.0, col=CU, slot='paint', over=0.0)
        else:
            classic_block_w4(g, r, set(MH_HIDE), y0, top, min(5.0, top - y0 - 2.0), 3.5, 3.2, (BR, BRD), Win(w=1.4, sill=0.8, head=2.8, lit=0.5))
        cols += wall_colliders(r, y0 - 4, top)
    # central diagonal tower (faces the California / Mason corner) with the Top of the Mark glass lounge
    r = ring_simplify(ring_of(17153), 0.4)
    y0 = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    for ea, eb in ring_edges(r):
        Fw = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        nt = neighbour_top(ea, eb, {17153})
        if Le < 4: radial_panel(g, 'stone', Fw, 0, Le, y0 - 3, yTop + 0.8, None, BR); continue
        storefront(g, ea, eb, sidewalk, y0 + 6.5, 3.4, 'stone', BRD, glass_slot='shop', arch=1, lit=0.9, frame_col=C('#2e2a24'))
        g.fbox('stone', Fw, 0, Le, y0 + 6.2, y0 + 6.9, 0, 0.35, TC, top=True, bottom=True)
        tfacade(g, ea, eb, y0 + 6.9, yT - 4.0, 3.35, 3.0, Win(w=1.3, sill=0.8, head=2.7, depth=0.3, lit=0.5), 'stone', BR, margin=0.8, flat_h=20.0)
        facade(g, ea, eb, yT - 4.0, yT, 4.0, 3.0, Win(w=1.4, sill=0.6, head=3.3, arch=1, depth=0.4, lit=0.55, keystone=True), 'stone', TC, margin=0.8)
        # Top of the Mark: floor-to-ceiling glazing between slim piers
        g.quad_sub('win', Geo.fp(Fw, 0.3, yT + 0.2, -0.4), Geo.fp(Fw, Le - 0.3, yT + 0.2, -0.4), Geo.fp(Fw, Le - 0.3, yTop - 0.3, -0.4), Geo.fp(Fw, 0.3, yTop - 0.3, -0.4),
                   (1.0, 0.8, 0.55, 1.0), (Fw[2][0], 0, Fw[2][1]), maxe=4)
        for k in range(int(Le / 2.6) + 1):
            u = min(Le - 0.3, 0.3 + k * 2.6)
            g.fbox('stone', Fw, u - 0.25, u + 0.25, yT, yTop, -0.4, 0.1, TC, top=False)
        g.fbox('stone', Fw, 0, Le, yT - 0.3, yT + 0.25, 0, 0.6, TC, top=True, bottom=True)
        radial_panel(g, 'stone', Fw, 0, Le, yTop - 0.3, yTop + 0.8, None, TC)
    g.poly('stone', [(p[0], yT + 0.2, p[1]) for p in ring_offset(ring_out(r), -0.4)], TC, (0, -1, 0))
    cornice(g, r, yTop + 1.4, 0.9, TC, slot='stone')
    rr = ring_out(r)
    cxy = centroid(rr)
    el = max(ring_edges(r), key=lambda e: v2len(v2sub(e[1], e[0])))
    loc = Loc(cxy, v2norm(v2sub(el[1], el[0])))
    q = [loc.loc(*p) for p in rr]
    hip(g, loc, min(x[0] for x in q) + 0.4, max(x[0] for x in q) - 0.4, min(x[1] for x in q) + 0.4, max(x[1] for x in q) - 0.4, yTop + 1.4, 6.5, col=CU, slot='paint', over=0.0)
    g.cyl('metal', cxy[0], cxy[1], 0.12, yTop + 7.5, yTop + 16.0, C('#dcdcdc'), n=6)
    if not g.lod:
        Ff = (cxy, loc.u, loc.v)
        g.fbox('fabric', Ff, 0.15, 3.0, yTop + 13.8, yTop + 15.8, -0.02, 0.02, C('#1f3b7a'), top=False, back=True)
        a, b = edge_facing(r, -0.81, -0.58)
        Fw = Geo.frame(a, b); Le = v2len(v2sub(b, a))
        g.text('neon', Fw, Le / 2, yTop + 0.02, 0.12, 'TOP OF THE HILL', 0.62, (1.0, 0.9, 0.7, 1.0), depth=0.06)
        g.text('stone', Fw, Le / 2, y0 + 6.25, 0.4, 'MARK HOLLIS', 0.55, shade(TC, 0.55), depth=0.05)
    cols += wall_colliders(r, y0 - 4, yTop)
    return {'colliders': cols, 'name': 'Mark Hollis Hotel', 'yG': round(yG, 2), 'top': round(yTop + 16, 1)}


# ================================================================================== Painted Ladies (Postcard Row, 710-720 Steiner, 1892-96)
PL_HIDE = [38253, 38265, 38245, 38260, 38266, 38261, 38262]
PL_PAL = [('#efe0b4', '#4f7a55', '#f6f1e4', '#b6453a'), ('#b7c9dc', '#2e4d6f', '#f5f1e7', '#c9a24a'), ('#d8c4e0', '#5e4274', '#f4eee4', '#3d6b58'),
          ('#c9dcbf', '#45663f', '#f6f2e6', '#a2463a'), ('#f0cdb4', '#7a3f30', '#f5eee2', '#2f5a6b'), ('#bcd6de', '#335a70', '#f4f1e8', '#b8742a'),
          ('#ecd9ab', '#6d4f28', '#f6f1e4', '#2e5a44')]


def painted_ladies(g):
    cols = []
    for k, i in enumerate(PL_HIDE):
        r = ring_out(ring_of(i))
        p0, p1 = west_front(r, 0, -1, 1.8)
        if v2len(v2sub(p1, p0)) < 4.5:
            e = max([e for e in ring_edges(r) if edge_n(*e)[0] < -0.9], key=lambda e: v2len(v2sub(e[1], e[0])))
            p0, p1 = (e[0], e[1]) if e[0][1] < e[1][1] else (e[1], e[0])
        u = v2norm(v2sub(p1, p0))
        L = Loc(p0, u)                                   # a along the street (south), b > 0 out to Steiner (west)
        Wf = v2len(v2sub(p1, p0))
        q = [L.loc(*p) for p in r]
        D = -min(x[1] for x in q)
        base, acc, trim, door = [C(h) for h in PL_PAL[k % len(PL_PAL)]]
        yG = min(sidewalk(*L.xz(a, 1.5)) for a in (0.2, Wf - 0.2)) + 0.05
        y1, y2, ye = yG + 2.0, yG + 5.4, yG + 8.9
        # body: party walls plain, rear stucco, front built piece by piece
        L.box(g, 'stucco', 0.0, Wf, -D, -0.6, yG - 3.0, ye, shade(base, 0.9), top=False)
        Fr = L.F(0.0, 0.0, 0)
        # raised basement with the garage door (left) and the stoop (right)
        g.fbox('clap', Fr, 0.0, Wf, yG - 2.0, y1, -0.6, 0.0, shade(trim, 0.92), top=False)
        g.fbox('wood', Fr, 0.35, 3.1, yG + 0.02, yG + 1.9, 0.0, 0.03, shade(acc, 0.8), top=False, sides=False)
        # angled bay window (floors 1-2) on the left half
        bw, bd = 3.3, 0.95
        bl = [(0.5, 0.0), (0.5 + bd * 0.7, bd), (0.5 + bw - bd * 0.7, bd), (0.5 + bw, 0.0)]
        for j in range(3):
            (ua, wa), (ub, wb) = bl[j], bl[j + 1]
            A_, B_ = L.xz(ua, wa), L.xz(ub, wb)
            Fb_ = Geo.frame(A_, B_)
            if Fb_[2][0] * L.v[0] + Fb_[2][1] * L.v[1] < 0: Fb_ = Geo.frame(B_, A_)
            Lb_ = v2len(v2sub(B_, A_))
            for (ya, yb_) in ((y1, y2), (y2, ye)):
                hole = [(0.25, ya + 0.9), (Lb_ - 0.25, ya + 0.9), (Lb_ - 0.25, yb_ - 0.45), (0.25, yb_ - 0.45)]
                radial_panel(g, 'clap', Fb_, 0, Lb_, ya, yb_, hole, base)
                recess(g, Fb_, hole, 0.12, 'paint', trim, 'win', glass_col(0.45), mull=('paint', trim, 0.06) if j == 1 else None)
                if not g.lod:
                    g.fbox('paint', Fb_, 0.1, Lb_ - 0.1, yb_ - 0.45, yb_ - 0.05, 0.0, 0.12, acc, top=True, bottom=True)
                    g.fbox('paint', Fb_, 0.15, Lb_ - 0.15, ya + 0.75, ya + 0.9, 0.0, 0.14, trim, top=True, bottom=True)
        g.poly('paint', [L.P(ua, wa, y2) for ua, wa in bl], trim, (0, -1, 0)) if False else None
        g.poly('paint', [L.P(ua, wa, ye + 0.02) for ua, wa in bl][::-1], shade(acc, 0.9), (0, 1, 0))
        g.poly('paint', [L.P(ua, wa, y1) for ua, wa in bl], shade(trim, 0.8), (0, -1, 0))
        # flat front wall on the right half: door + transom on floor 1, window on floor 2
        uR0 = 0.5 + bw + 0.1
        dh = [(uR0 + 0.6, y1 + 0.05), (Wf - 0.5, y1 + 0.05), (Wf - 0.5, y1 + 2.8), (uR0 + 0.6, y1 + 2.8)]
        radial_panel(g, 'clap', Fr, 0.0, Wf, y1, y2, None, base) if False else None
        radial_panel(g, 'clap', Fr, uR0 - 0.1, Wf, y1, y2, dh, base)
        recess(g, Fr, dh, 1.0, 'paint', trim, 'wood', door)
        radial_panel(g, 'clap', Fr, 0.0, 0.5, y1, ye, None, base)
        wh = [(uR0 + 0.35, y2 + 0.9), (Wf - 0.35, y2 + 0.9), (Wf - 0.35, ye - 0.45), (uR0 + 0.35, ye - 0.45)]
        radial_panel(g, 'clap', Fr, uR0 - 0.1, Wf, y2, ye, wh, base)
        recess(g, Fr, wh, 0.12, 'paint', trim, 'win', glass_col(0.4), mull=('paint', trim, 0.06))
        radial_panel(g, 'clap', Fr, 0.5, uR0 - 0.1, y1, ye, None, base)
        # porch: stairs up the stoop, turned posts, a pediment hood over the door
        if not g.lod:
            for s in range(11):
                yy = y1 - s * 0.18
                g.fbox('wood', Fr, uR0 + 0.4, Wf - 0.3, yy - 0.18, yy, 1.1 + s * 0.28, 1.38 + s * 0.28, shade(trim, 0.9), top=True)
            g.fbox('wood', Fr, uR0 + 0.4, Wf - 0.3, y1 - 0.2, y1, 0.0, 1.1, shade(trim, 0.9), top=True, bottom=True)
            for uu in (uR0 + 0.45, Wf - 0.35):
                p = Geo.fp(Fr, uu, 0, 1.0)
                g.lathe('paint', p[0], p[2], [(0.1, y1), (0.07, y1 + 0.3), (0.09, y1 + 1.5), (0.06, y1 + 2.7), (0.11, y1 + 3.0)], trim, n=6)
            g.fbox('paint', Fr, uR0 + 0.3, Wf - 0.2, y1 + 3.0, y1 + 3.3, 0.0, 1.2, acc, top=True, bottom=True)
            pc = [Geo.fp(Fr, uR0 + 0.3, y1 + 3.3, 1.2), Geo.fp(Fr, Wf - 0.2, y1 + 3.3, 1.2), Geo.fp(Fr, (uR0 + Wf) / 2, y1 + 4.0, 1.2)]
            g.poly('paint', pc, trim, (Fr[2][0], 0, Fr[2][1]))
            cols.append(L.col(uR0 + 0.4, Wf - 0.3, 1.1, 4.2, yG - 1, y1 - 1.0))
        # frieze + cornice with brackets at the eave line
        g.fbox('paint', Fr, -0.05, Wf + 0.05, ye, ye + 0.55, 0.0, 0.25, acc, top=True, bottom=True)
        g.fbox('paint', Fr, -0.1, Wf + 0.1, ye + 0.55, ye + 0.8, 0.0, 0.55, trim, top=True, bottom=True)
        if not g.lod:
            for kk in range(int(Wf / 0.7) + 1):
                g.fbox('paint', Fr, kk * 0.7 - 0.06, kk * 0.7 + 0.06, ye + 0.1, ye + 0.55, 0.25, 0.5, trim, top=True, bottom=True)
        # front gable (fish-scale shingle field), attic window, bargeboards, finial
        yr = ye + 0.8 + Wf * 0.62
        gp = [(0.0, ye + 0.8), (Wf, ye + 0.8), (Wf / 2, yr)]
        g.poly('clap', [Geo.fp(Fr, u_, y_, 0.0) for u_, y_ in gp], acc, (Fr[2][0], 0, Fr[2][1]))
        aw = [(Wf / 2 + 0.6 * math.cos(math.pi * t / 8), ye + 2.3 + 0.6 * math.sin(math.pi * t / 8)) for t in range(9)] + [(Wf / 2 - 0.6, ye + 1.4), (Wf / 2 + 0.6, ye + 1.4)]
        aw = [(Wf / 2 - 0.6, ye + 1.4), (Wf / 2 + 0.6, ye + 1.4)] + [(Wf / 2 + 0.6 * math.cos(math.pi * t / 8), ye + 2.3 + 0.6 * math.sin(math.pi * t / 8)) for t in range(9)]
        g.poly('win', [Geo.fp(Fr, u_, y_, 0.04) for u_, y_ in aw], glass_col(0.35), (Fr[2][0], 0, Fr[2][1]))
        gable(g, L, 0.0, Wf, -D + 0.6, 0.35, ye + 0.8, Wf * 0.62, col=C('#4e4f55'), slot='roof', over=0.25, ridge_a=False, ends=False)
        if not g.lod:
            for s in (-1, 1):
                A_ = Geo.fp(Fr, Wf / 2 + s * (Wf / 2 + 0.25), ye + 0.8 - 0.15, 0.4); B_ = Geo.fp(Fr, Wf / 2, yr + 0.05, 0.4)
                g.rod('paint', A_, B_, 0.1, trim, n=4)
            pc = Geo.fp(Fr, Wf / 2, 0, 0.4)
            g.lathe('paint', pc[0], pc[2], [(0.12, yr), (0.08, yr + 0.5), (0.14, yr + 0.7), (0.0, yr + 1.3)], trim, n=6)
            # sunburst panel in the gable apex
            for t in range(7):
                a = math.pi * (t + 0.5) / 7
                g.poly('paint', [Geo.fp(Fr, Wf / 2, ye + 3.2, 0.03), Geo.fp(Fr, Wf / 2 + math.cos(a - 0.1) * 0.9, ye + 3.2 + math.sin(a - 0.1) * 0.9, 0.03),
                                 Geo.fp(Fr, Wf / 2 + math.cos(a + 0.1) * 0.9, ye + 3.2 + math.sin(a + 0.1) * 0.9, 0.03)], trim if t % 2 else door, (Fr[2][0], 0, Fr[2][1]))
        cols.append(L.col(0.0, Wf, -D, 0.0, yG - 3, ye + 2))
    return {'colliders': cols, 'name': 'Painted Ladies', 'replaces': 'paintedLadies', 'yG': 60.0, 'top': 80.0}


# ================================================================================== Palace of Fine Arts (1915, Bernard Maybeck)
POFA_PIERS = [2129, 2126, 2405, 2125, 2408, 2123, 2407, 2403]
POFA_BASES = [2130, 2128, 2406, 2127, 2409, 2124, 2410, 2404]
POFA_HIDE = [2401, 2402, 2411] + POFA_PIERS + POFA_BASES + [5188, 2111, 5189, 2397, 2132, 2131]
PO_ST = C('#d9c2a3'); PO_STD = C('#c4a988'); PO_DOME = C('#c98f5c'); PO_COL = C('#cfbc9f')


def band_medial(ring, n=64):
    """centre line of a long thin polygon: split at the two farthest vertices, resample both chains, average"""
    r = [tuple(p) for p in ring]
    best = (0, 0, 0)
    for i in range(len(r)):
        for j in range(i + 1, len(r)):
            d = v2len(v2sub(r[i], r[j]))
            if d > best[0]: best = (d, i, j)
    _, i, j = best
    A = r[i:j + 1]; B = (r[j:] + r[:i + 1])[::-1]
    def res(ch):
        L_ = [0.0]
        for k in range(1, len(ch)): L_.append(L_[-1] + v2len(v2sub(ch[k], ch[k - 1])))
        out = []
        for s in range(n):
            t = L_[-1] * s / (n - 1); k = 1
            while k < len(ch) - 1 and L_[k] < t: k += 1
            f = (t - L_[k - 1]) / max(1e-6, L_[k] - L_[k - 1])
            out.append(v2lerp(ch[k - 1], ch[k], min(1.0, max(0.0, f))))
        return out
    a, b = res(A), res(B)
    return [v2lerp(a[k], b[k], 0.5) for k in range(n)], [v2len(v2sub(a[k], b[k])) for k in range(n)]


def pofa(g):
    cx, cz = centroid(ring_of(2401))
    yG = min(H(cx + math.cos(t) * 30, cz + math.sin(t) * 30) for t in [k * math.pi / 8 for k in range(16)]) + 0.1
    cols = []; decks = []
    RP, y_sp, y_ar, y_at, y_dr, y_dm = 24.3, yG + 17.0, yG + 22.5, yG + 32.5, yG + 37.5, yG + 38.8
    # platform
    g.lathe('paving', cx, cz, [(29.0, yG - 1.5), (29.0, yG + 0.15), (27.5, yG + 0.3), (0.0, yG + 0.3)], C('#b9a88f'), n=48 if not g.lod else 16)
    Lr = Loc((cx, cz), (1.0, 0.0))
    decks += rect_decks(Lr, -26.0, 26.0, -26.0, 26.0, yG + 0.3, strip=13.0)
    # piers (from the OSM pier footprints), paired Corinthian columns on the outer face
    angs = sorted([math.atan2(centroid(ring_of(i))[1] - cz, centroid(ring_of(i))[0] - cx) for i in POFA_PIERS])
    for t in angs:
        px, pz = cx + math.cos(t) * RP, cz + math.sin(t) * RP
        tt = (-math.sin(t), math.cos(t)); nn = (math.cos(t), math.sin(t))
        Fp = ((px - tt[0] * 3.2 - nn[0] * 3.2, pz - tt[1] * 3.2 - nn[1] * 3.2), tt, nn)
        g.fbox('stone', Fp, 0, 6.4, yG + 0.3, y_at + 3.5, 0, 6.4, PO_ST, top=True, back=True)
        cols.append({'x': round(px, 2), 'z': round(pz, 2), 'hx': 3.2, 'hz': 3.2, 'yaw': round(math.atan2(-tt[1], tt[0]), 4), 'yMin': yG - 1, 'yMax': y_at + 3})
        for d in (-2.0, 2.0):
            q = (px + nn[0] * 4.2 + tt[0] * d, pz + nn[1] * 4.2 + tt[1] * d)
            column(g, q[0], q[1], yG + 0.3, y_ar - 0.4, 0.95, PO_COL, order='corinthian', n=14)
        Fe = ((px - tt[0] * 3.6 + nn[0] * 3.2, pz - tt[1] * 3.6 + nn[1] * 3.2), tt, nn)
        g.fbox('stone', Fe, 0, 7.2, y_ar - 0.4, y_ar + 2.2, 0, 2.4, PO_STD, top=True, bottom=True)
        # attic figure group on the pier top: four figures leaning on an urn-topped box
        Ft = ((px - tt[0] * 2.4 + nn[0] * 1.0, pz - tt[1] * 2.4 + nn[1] * 1.0), tt, nn)
        g.fbox('stone', Ft, 0, 4.8, y_at + 3.5, y_at + 6.0, -2.4, 2.4, PO_STD, top=True, back=True)
        if not g.lod:
            for (du, dw) in ((-2.0, 2.2), (2.0, 2.2), (-2.0, -2.2), (2.0, -2.2)):
                q = (px + tt[0] * du + nn[0] * (1.0 + dw), pz + tt[1] * du + nn[1] * (1.0 + dw))
                g.lathe('stone', q[0], q[1], [(0.5, y_at + 3.5), (0.45, y_at + 5.0), (0.3, y_at + 5.6), (0.34, y_at + 5.9), (0.0, y_at + 6.3)], PO_COL, n=8)
            urn(g, px + nn[0] * 1.0, pz + nn[1] * 1.0, y_at + 6.0, 1.6, PO_COL)
    # arches between the piers (octagon faces): open arcade, attic above
    for k in range(8):
        t0, t1 = angs[k], angs[(k + 1) % 8] + (2 * math.pi if k == 7 else 0)
        pa = (cx + math.cos(t0) * RP, cz + math.sin(t0) * RP); pb = (cx + math.cos(t1) * RP, cz + math.sin(t1) * RP)
        F = Geo.frame(pa, pb)
        if F[2][0] * (pa[0] - cx) + F[2][1] * (pa[1] - cz) < 0: F = Geo.frame(pb, pa)
        Le = v2len(v2sub(pb, pa))
        hole = arch_pts(Le / 2, Le - 6.8, yG + 0.3, y_sp, 16 if not g.lod else 6)
        radial_panel(g, 'stone', F, 3.2, Le - 3.2, yG + 0.3, y_at, [(p[0], p[1]) for p in hole], PO_ST, w=1.2)
        # inner face + soffit
        Fi = (Geo.fp(F, Le, 0, -1.2)[0::2], (-F[1][0], -F[1][1]), (-F[2][0], -F[2][1]))
        radial_panel(g, 'stone', Fi, 3.2, Le - 3.2, yG + 0.3, y_at, [(Le - p[0], p[1]) for p in hole][::-1], PO_STD)
        m = len(hole); cu = sum(p[0] for p in hole) / m; cv = sum(p[1] for p in hole) / m
        for i in range(m):
            p, q = hole[i], hole[(i + 1) % m]
            if p[1] < yG + 0.4 and q[1] < yG + 0.4: continue
            mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
            g.poly('stone', [Geo.fp(F, p[0], p[1], 1.2), Geo.fp(F, q[0], q[1], 1.2), Geo.fp(F, q[0], q[1], -1.2), Geo.fp(F, p[0], p[1], -1.2)], PO_STD,
                   (-(F[1][0] * mu), -mv, -(F[1][1] * mu)))
        g.fbox('stone', F, 3.2, Le - 3.2, y_ar - 0.4, y_ar + 1.4, 1.2, 2.2, PO_STD, top=True, bottom=True)
        if not g.lod:   # relief panels on the attic
            for j in range(3):
                uu = 3.2 + (Le - 6.4) * (j + 0.5) / 3
                g.fbox('stone', F, uu - 1.6, uu + 1.6, y_ar + 3.0, y_at - 2.0, 1.2, 1.45, PO_COL, top=True, bottom=True)
                for f in range(3):
                    q = Geo.fp(F, uu - 1.0 + f, 0, 1.55)
                    g.lathe('stone', q[0], q[2], [(0.3, y_ar + 3.3), (0.25, y_at - 3.2), (0.18, y_at - 2.8), (0.0, y_at - 2.4)], PO_ST, n=6)
    # drum + dome (ochre, ribbed) + lantern; the coffered dome soffit is visible from the floor
    g.lathe('stone', cx, cz, [(RP + 1.4, y_at), (RP + 1.8, y_at + 0.8), (18.4, y_at + 1.2), (18.4, y_dr), (19.0, y_dr + 0.4), (17.6, y_dm)], PO_STD, n=40 if not g.lod else 16)
    if not g.lod:
        for i in range(24):
            t = 2 * math.pi * (i + 0.5) / 24
            p = (cx + math.cos(t) * 18.42, cz + math.sin(t) * 18.42)
            Fp = (p, (-math.sin(t), math.cos(t)), (math.cos(t), math.sin(t)))
            g.fbox('stone', Fp, -0.9, 0.9, y_at + 1.8, y_dr - 0.6, 0.0, 0.1, PO_COL, top=True, bottom=True)
    dome(g, cx, cz, y_dm, 17.6, 12.4, PO_DOME, slot='paint', ribs=16, rib_col=C('#b8814f'), shape=0.55)
    g.lathe('stone', cx, cz, [(2.4, y_dm + 12.0), (2.4, y_dm + 13.6), (2.8, y_dm + 13.9), (0.0, y_dm + 14.4)], PO_STD, n=12)
    # underside: coffered soffit from the arch crowns up into the dome
    NI = 12 if not g.lod else 5
    for j in range(NI):
        a0_, a1_ = (math.pi / 2) * j / NI, (math.pi / 2) * (j + 1) / NI
        r0_, r1_ = (RP - 2.0) * math.cos(a0_), (RP - 2.0) * math.cos(a1_)
        h0_, h1_ = y_ar + 1.4 + 14.0 * math.sin(a0_), y_ar + 1.4 + 14.0 * math.sin(a1_)
        g.lathe('plaster' if False else 'stone', cx, cz, [(r1_, h1_), (r0_, h0_)], C('#e2cda8') if j % 2 else C('#caa97e'), n=32 if not g.lod else 12)
    g.lathe('stone', cx, cz, [(RP - 1.2, y_ar + 1.4), (RP - 2.0, y_ar + 1.4)], PO_STD, n=32 if not g.lod else 12)
    # ---- the two colonnade arms (Corinthian pairs, entablature, planter boxes with weeping-women figures)
    for i in (5188, 2111):
        med, wid = band_medial(ring_of(i), 70 if not g.lod else 30)
        wmed = sorted(wid)[len(wid) // 2]
        yc0 = yG + 0.2
        ye0, ye1 = yG + 16.4, yG + 18.6
        # entablature: sweep a box along the medial polyline
        for k in range(len(med) - 1):
            A_, B_ = med[k], med[k + 1]
            if v2len(v2sub(B_, A_)) < 0.05: continue
            F = Geo.frame(A_, B_); Le = v2len(v2sub(B_, A_))
            g.fbox('stone', F, -0.05, Le + 0.05, ye0, ye1, -2.6, 2.6, PO_STD, top=True, bottom=True, back=True)
            if not g.lod:
                g.fbox('stone', F, -0.05, Le + 0.05, ye1, ye1 + 0.5, -2.9, 2.9, PO_ST, top=True, bottom=True, back=True)
        # columns every ~4.6 m along the arc (two rows), clusters + planter boxes where the band widens
        Ltot = [0.0]
        for k in range(1, len(med)): Ltot.append(Ltot[-1] + v2len(v2sub(med[k], med[k - 1])))
        ncol = int(Ltot[-1] / 4.6)
        for c_ in range(ncol + 1):
            s = Ltot[-1] * c_ / ncol
            k = 1
            while k < len(med) - 1 and Ltot[k] < s: k += 1
            f = (s - Ltot[k - 1]) / max(1e-6, Ltot[k] - Ltot[k - 1])
            p = v2lerp(med[k - 1], med[k], f); t = v2norm(v2sub(med[k], med[k - 1])); n_ = (-t[1], t[0])
            cluster = (c_ % 3 == 0)
            for side in (-1, 1):
                q = (p[0] + n_[0] * side * 1.9, p[1] + n_[1] * side * 1.9)
                y_ = H(*q) + 0.1
                cc = column(g, q[0], q[1], y_, ye0, 0.62, PO_COL, order='corinthian', n=10)
                cols.append(cc)
            if cluster:
                Fb = ((p[0] - t[0] * 2.2 - n_[0] * 2.8, p[1] - t[1] * 2.2 - n_[1] * 2.8), t, n_)
                g.fbox('stone', Fb, 0, 4.4, ye1 + 0.5, ye1 + 4.2, 0, 5.6, PO_ST, top=True, back=True)
                g.fbox('stone', Fb, -0.2, 4.6, ye1 + 4.2, ye1 + 4.6, -0.2, 5.8, PO_STD, top=True, bottom=True, back=True)
                if not g.lod:
                    for (du, dw) in ((0.0, 0.0), (4.4, 0.0), (0.0, 5.6), (4.4, 5.6)):     # the weeping women at the corners
                        q = Geo.fp(Fb, du, 0, dw)
                        g.lathe('stone', q[0], q[2], [(0.45, ye1 + 0.5), (0.4, ye1 + 2.8), (0.28, ye1 + 3.2), (0.3, ye1 + 3.6), (0.0, ye1 + 3.9)], PO_COL, n=8)
                    q = Geo.fp(Fb, 2.2, 0, 2.8)
                    g.lathe('leaf', q[0], q[2], [(1.6, ye1 + 4.4), (1.8, ye1 + 5.0), (1.0, ye1 + 5.6), (0.0, ye1 + 5.8)], C('#4c6b3a'), n=8)
    # ---- the exhibition hall behind (Palace of Fine Arts theatre): arc building, ochre stucco, clerestory
    for i, top in ((2132, yG + 15.0), (2131, yG + 17.5)):
        r = ring_simplify(ring_of(i), 0.5)
        for ea, eb in ring_edges(r):
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            if i == 2131:
                radial_panel(g, 'stucco', F, 0, Le, top - 2.5, top, None, PO_STD); continue
            if Le > 6: facade(g, ea, eb, yG - 2.0, top, top - yG + 2.0, 5.5, Win(w=2.2, sill=10.0, head=13.2, depth=0.4, arch=1, lit=0.3), 'stucco', PO_ST, margin=1.0,
                              pier=(1.0, 0.4, PO_STD) if not g.lod else None)
            else: radial_panel(g, 'stucco', F, 0, Le, yG - 2.0, top, None, PO_ST)
        g.sweep('stucco', r, [(0, top - 0.3), (0.4, top), (0.4, top + 0.5), (0, top + 0.6)], PO_STD)
        g.poly('roof', [(p[0], top + 0.2, p[1]) for p in ring_offset(ring_out(r), -0.4)], ROOF, (0, 1, 0))
        if i == 2132: cols += wall_colliders(r, yG - 2, top)
    # the lagoon: a calm water sheet just above the sea-level water (hides the surf foam the ocean shader draws on its shallow banks)
    WL = 0.35; st = 3.0 if not g.lod else 6.0
    for i in range(int(170 / st)):
        for j in range(int(240 / st)):
            x0_, z0_ = -2582.0 + i * st, -3220.0 + j * st
            if math.hypot(x0_ + st / 2 - cx, z0_ + st / 2 - cz) < 29.5: continue
            hs = [H(x0_, z0_), H(x0_ + st, z0_), H(x0_ + st, z0_ + st), H(x0_, z0_ + st), H(x0_ + st / 2, z0_ + st / 2)]
            if min(hs) > WL + 0.25 or max(hs) > 8.0: continue      # bank cells too (terrain covers the sheet where it rises)
            g.poly('water', [(x0_, WL, z0_), (x0_ + st, WL, z0_), (x0_ + st, WL, z0_ + st), (x0_, WL, z0_ + st)], (1.0, 1.0, 1.0, 1.0), (0, 1, 0))
    noT = [[[round(cx - 34, 1), round(cz - 34, 1)], [round(cx + 34, 1), round(cz - 34, 1)], [round(cx + 34, 1), round(cz + 34, 1)], [round(cx - 34, 1), round(cz + 34, 1)]]]
    for i in (5188, 2111):
        med, _ = band_medial(ring_of(i), 12)
        for k in range(len(med) - 1):
            A_, B_ = med[k], med[k + 1]
            t = v2norm(v2sub(B_, A_)); n_ = (-t[1], t[0])
            noT.append([[round(A_[0] + n_[0] * 5, 1), round(A_[1] + n_[1] * 5, 1)], [round(B_[0] + n_[0] * 5, 1), round(B_[1] + n_[1] * 5, 1)],
                        [round(B_[0] - n_[0] * 5, 1), round(B_[1] - n_[1] * 5, 1)], [round(A_[0] - n_[0] * 5, 1), round(A_[1] - n_[1] * 5, 1)]])
    return {'colliders': cols, 'name': 'Palace of Fine Arts', 'replaces': 'palaceFineArts', 'yG': round(yG, 2), 'top': round(y_dm + 15, 1), 'decks': decks, 'noTrees': noT,
            'near': 700}


# ================================================================================== de Young Museum (2005, Herzog & de Meuron) + Hamon tower
DY_HIDE = [42775, 42776, 42777, 42778, 42779, 42780, 42781, 42782]
DY_U = (0.771, -0.637)
COPPER = C('#a4744f'); COPPER_D = C('#7e5a3e')


def dy_frame():
    T = centroid(ring_of(42775))
    return Loc(T, DY_U)            # a: NE (+) / SW, b: SE (+, the Music Concourse) / NW


def dy_quad(i):
    r = ring_out(ring_simplify(ring_of(i), 1.5))
    if len(r) > 4:
        h_ = hull(r)
        # keep the 4 hull points that span the largest area
        best = None
        import itertools
        for q in itertools.combinations(range(len(h_)), 4):
            pts = [h_[k] for k in q]; a = abs(ring_area(pts))
            if best is None or a > best[0]: best = (a, pts)
        r = ring_out(best[1])
    return r


def de_young(g):
    L = dy_frame()
    T = L.c
    yG = min(H(*L.xz(a, b)) for a in (-120, -60, 0) for b in (-8, 30, 68)) + 0.1
    yB = yG + 13.5
    cols = []
    # body: two long copper bars, glass-walled courtyards between, the entrance court under the cantilever
    bars = [(-138.0, 12.0, -10.0, 24.0), (-138.0, 4.0, 38.0, 70.0), (-58.0, -40.0, 24.0, 38.0), (-8.0, 12.0, 24.0, 38.0), (-112.0, -96.0, 24.0, 38.0)]
    for (a0, a1, b0, b1) in bars:
        rr = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
        for ea, eb in ring_edges(rr):
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            # glazed ground-floor band (recessed), copper above with slot windows
            g.quad_sub('shop', Geo.fp(F, 0, yG - 1.0, -0.9), Geo.fp(F, Le, yG - 1.0, -0.9), Geo.fp(F, Le, yG + 4.2, -0.9), Geo.fp(F, 0, yG + 4.2, -0.9), (0.95, 0.85, 0.7, 1.0),
                       (F[2][0], 0, F[2][1]), maxe=5)
            g.fbox('copper', F, 0, Le, yG + 4.2, yB, -0.2, 0.0, COPPER, top=False, sides=False)
            g.poly('metal', [Geo.fp(F, 0, yG + 4.2, -0.9), Geo.fp(F, Le, yG + 4.2, -0.9), Geo.fp(F, Le, yG + 4.2, 0.0), Geo.fp(F, 0, yG + 4.2, 0.0)], COPPER_D, (0, -1, 0))
            if not g.lod:
                for k in range(int(Le / 5.0)):
                    u = 2.5 + k * 5.0
                    g.fbox('metal', F, u - 0.08, u + 0.08, yG - 1.0, yG + 4.2, -0.9, -0.75, C('#2a2826'), top=False)
                R = random.Random(int(Le * 10))
                for k in range(int(Le / 9.0)):
                    u = 3.0 + k * 9.0 + R.uniform(-1.5, 1.5); yy = yG + R.uniform(6.0, 10.0)
                    g.fbox('win', F, u, u + R.uniform(2.0, 6.0), yy, yy + 0.7, 0.0, 0.03, glass_col(0.5), top=False, sides=False)
            radial_panel(g, 'metal', F, 0, Le, yB - 0.01, yB + 0.4, None, COPPER_D)
        g.poly('roof', [(p[0], yB + 0.2, p[1]) for p in ring_offset(ring_out(rr), -0.3)], C('#6b6560'), (0, 1, 0))
        cols += wall_colliders(rr, yG - 3, yB)
    # courtyard gardens (ferns + eucalyptus) between the bars
    for (a0, a1) in ((-96.0, -58.0), (-40.0, -8.0), (-138.0, -112.0)):
        rr = L.ring([(a0, 24.0), (a1, 24.0), (a1, 38.0), (a0, 38.0)])
        g.poly('grass', [(p[0], H(*p) + 0.15, p[1]) for p in rr], C('#5f7f45'), (0, 1, 0))
        if not g.lod:
            for k in range(int((a1 - a0) / 9.0)):
                x, z = L.xz(a0 + 4.5 + k * 9.0, 31.0)
                cols.append(broadleaf(g, x, z, H(x, z), h=9.0, R=2.8, seed=k + int(a0), col=C('#6b8a4a')))
    # the entrance canopy: a huge copper cantilever over the concourse-side court
    ca0, ca1 = -92.0, -64.0
    L.box(g, 'metal', ca0 - 6.0, ca1 + 6.0, 70.0, 84.0, yB - 1.2, yB - 0.2, COPPER, top=True, bottom=True)
    for (a_, b_) in ((ca0 + 2.0, 82.0), (ca1 - 2.0, 82.0)):
        x, z = L.xz(a_, b_); g.cyl('metal', x, z, 0.25, yG - 0.5, yB - 1.2, C('#3a3632'), n=8)
        cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 0.3, 'hz': 0.3, 'yaw': 0, 'yMin': yG - 1, 'yMax': yB})
    if not g.lod:
        F = L.F(-40.0, 70.0, 0)
        F = (L.xz(-20.0, 70.0), (-L.u[0], -L.u[1]), (-L.v[0], -L.v[1]))
        F = (L.xz(-30.0, 70.05), L.u, L.v)
        g.text('metal', F, -48.0 + 30.0 - 30.0 + 0.0, yG + 5.0, 0.05, 'DE YOUNG', 1.6, C('#2a211a'), depth=0.08)
    # Hamon tower: ruled twist from the base parallelogram (museum grid) to the top rectangle (city grid)
    qb = dy_quad(42775); qt = dy_quad(42782)
    cb = centroid(qb); ct = centroid(qt)
    ab = lambda p, c: math.atan2(p[1] - c[1], p[0] - c[0])
    qb = sorted(qb, key=lambda p: ab(p, cb)); qt = sorted(qt, key=lambda p: ab(p, ct))
    # rotate the top list so corner k pairs with the nearest-angle base corner
    best = min(range(4), key=lambda s: sum(abs(((ab(qt[(k + s) % 4], ct) - ab(qb[k], cb)) + math.pi) % (2 * math.pi) - math.pi) for k in range(4)))
    qt = [qt[(k + best) % 4] for k in range(4)]
    yT0 = yG - 1.0; yT1 = bld(42782)['base'] + bld(42782)['h']
    NS = 14 if not g.lod else 5
    ring_at = lambda t: [v2lerp(qb[k], qt[k], t) for k in range(4)]
    yo = yT1 - 4.2
    for s in range(NS):
        t0, t1 = s / NS, (s + 1) / NS
        y0_, y1_ = yT0 + (yo - yT0) * t0, yT0 + (yo - yT0) * t1
        r0, r1 = ring_at(t0), ring_at(t1)
        for k in range(4):
            p0, p1, q0, q1 = r0[k], r0[(k + 1) % 4], r1[k], r1[(k + 1) % 4]
            m = v2lerp(v2lerp(p0, p1, 0.5), v2lerp(q0, q1, 0.5), 0.5); c_ = v2lerp(cb, ct, (t0 + t1) / 2)
            nh = (m[0] - c_[0], 0, m[1] - c_[1])
            g.poly('copper', [(p0[0], y0_, p0[1]), (p1[0], y0_, p1[1]), (q1[0], y1_, q1[1]), (q0[0], y1_, q0[1])], shade(COPPER, 0.92 + 0.08 * (s % 2)), nh)
            if not g.lod and s % 2 == 1:
                a_, b_ = v2lerp(p0, p1, 0.2), v2lerp(p0, p1, 0.8)
                ym = (y0_ + y1_) / 2
                g.poly('win', [(a_[0], ym - 0.35, a_[1]), (b_[0], ym - 0.35, b_[1]), (b_[0], ym + 0.35, b_[1]), (a_[0], ym + 0.35, a_[1])], glass_col(0.4), nh)
    # observation floor: glass band all round the top rectangle, copper roof lid
    for k in range(4):
        p0, p1 = qt[k], qt[(k + 1) % 4]
        nh = (v2lerp(p0, p1, 0.5)[0] - ct[0], 0, v2lerp(p0, p1, 0.5)[1] - ct[1])
        g.poly('win', [(p0[0], yo, p0[1]), (p1[0], yo, p1[1]), (p1[0], yT1 - 0.6, p1[1]), (p0[0], yT1 - 0.6, p0[1])], (0.9, 0.8, 0.6, 1.0), nh)
        g.poly('metal', [(p0[0], yT1 - 0.6, p0[1]), (p1[0], yT1 - 0.6, p1[1]), (p1[0], yT1, p1[1]), (p0[0], yT1, p0[1])], COPPER_D, nh)
        if not g.lod:
            for j in range(1, int(v2len(v2sub(p1, p0)) / 2.4)):
                q = v2lerp(p0, p1, j * 2.4 / v2len(v2sub(p1, p0)))
                g.rod('metal', (q[0], yo, q[1]), (q[0], yT1 - 0.6, q[1]), 0.06, C('#2a2826'), n=4)
    g.poly('metal', [(p[0], yT1, p[1]) for p in qt], COPPER_D, (0, 1, 0))
    g.poly('metal', [(p[0], yo, p[1]) for p in qt], COPPER_D, (0, -1, 0))
    cols.append({'x': round(cb[0], 2), 'z': round(cb[1], 2), 'hx': 8.0, 'hz': 8.0, 'yaw': round(L.yaw(), 4), 'yMin': yG - 2, 'yMax': yT1})
    noT = [[list(p) for p in L.ring([(-145, -16), (18, -16), (18, 88), (-145, 88)])]]
    return {'colliders': cols, 'name': 'de Young Museum', 'replaces': 'deYoung', 'yG': round(yG, 2), 'top': round(yT1 + 1, 1), 'noTrees': noT, 'near': 650}


# ================================================================================== California Academy of Sciences (2008, Renzo Piano): living roof
AC_HIDE = [46602]


def ac_frame():
    r = ring_out(ring_of(46602))
    e = max(ring_edges(r), key=lambda e: v2len(v2sub(e[1], e[0])))
    u = v2norm(v2sub(e[1], e[0]))
    if u[0] < 0: u = (-u[0], -u[1])
    L = Loc(centroid(r), u)
    q = [L.loc(*p) for p in r]
    return L, min(x[0] for x in q), max(x[0] for x in q), min(x[1] for x in q), max(x[1] for x in q)


AC_HILLS = [(-40.0, 2.0, 11.5, 13.5), (40.0, 2.0, 11.0, 13.0), (-66.0, -30.0, 4.0, 9.0), (-64.0, 31.0, 4.5, 9.5), (66.0, -31.0, 4.0, 9.0), (64.0, 32.0, 4.5, 9.0), (0.0, 36.0, 3.5, 8.0)]
AC = dict(WALL=10.6, ROOF=11.2)


def ac_roof_h(a, b):
    h = 0.0
    for (ha, hb, hh, hr) in AC_HILLS:
        d2 = ((a - ha) ** 2 + (b - hb) ** 2) / (hr * hr)
        h += hh * math.exp(-d2)
    if abs(a) < 13 and abs(b) < 13: h = -0.5     # the piazza opening
    return h


def academy(g):
    L, a0, a1, b0, b1 = ac_frame()
    yG = min(H(*L.xz(a, b)) for a in (a0, 0, a1) for b in (b0, b1)) + 0.1
    yW, yR = yG + AC['WALL'], yG + AC['ROOF']
    cols = []
    # glass curtain walls inset 1 m, slim steel mullions, entrance canopy columns
    rr = L.ring([(a0 + 1, b0 + 1), (a1 - 1, b0 + 1), (a1 - 1, b1 - 1), (a0 + 1, b1 - 1)])
    for ea, eb in ring_edges(rr):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        g.quad_sub('win', Geo.fp(F, 0, yG - 1.0, 0), Geo.fp(F, Le, yG - 1.0, 0), Geo.fp(F, Le, yW, 0), Geo.fp(F, 0, yW, 0), (0.9, 0.85, 0.72, 1.0), (F[2][0], 0, F[2][1]), maxe=6)
        if not g.lod:
            for k in range(int(Le / 3.0) + 1):
                g.fbox('metal', F, k * 3.0 - 0.06, k * 3.0 + 0.06, yG - 1.0, yW, 0, 0.12, C('#d8dcdc'), top=False)
            for yy in (yG + 4.2, yG + 7.6):
                g.fbox('metal', F, 0, Le, yy - 0.05, yy + 0.05, 0, 0.1, C('#d8dcdc'), top=True, bottom=True)
    cols += wall_colliders(rr, yG - 3, yW)
    # roof slab + the photovoltaic canopy overhang (4 m) all round
    ov = 4.5
    ro = L.ring([(a0 - ov, b0 - ov), (a1 + ov, b0 - ov), (a1 + ov, b1 + ov), (a0 - ov, b1 + ov)])
    ri = L.ring([(a0 + 1.5, b0 + 1.5), (a1 - 1.5, b1 * 0 + b0 + 1.5), (a1 - 1.5, b1 - 1.5), (a0 + 1.5, b1 - 1.5)])
    for k in range(4):
        A_, B_ = ro[k], ro[(k + 1) % 4]; A2, B2 = ri[k], ri[(k + 1) % 4]
        g.poly('glassc', [(A_[0], yR + 0.05, A_[1]), (B_[0], yR + 0.05, B_[1]), (B2[0], yR + 0.05, B2[1]), (A2[0], yR + 0.05, A2[1])], C('#27313d'), (0, 1, 0))
        g.poly('metal', [(A_[0], yW, A_[1]), (B_[0], yW, B_[1]), (B2[0], yW, B2[1]), (A2[0], yW, A2[1])], C('#e9eceb'), (0, -1, 0))
        g.poly('metal', [(A_[0], yW, A_[1]), (B_[0], yW, B_[1]), (B_[0], yR, B_[1]), (A_[0], yR, A_[1])], C('#dfe3e2'), None)
        if not g.lod:
            n = int(v2len(v2sub(B_, A_)) / 3.0)
            for j in range(n + 1):
                p, q = v2lerp(A_, B_, j / n), v2lerp(A2, B2, j / n)
                g.rod('metal', (p[0], yR + 0.1, p[1]), (q[0], yR + 0.1, q[1]), 0.05, C('#9aa3a8'), n=3)
    # living roof: heightfield with seven hills, porthole skylights, the glass-roofed piazza
    st = 3.0 if not g.lod else 9.0
    na, nb = int((a1 - a0 - 3.0) / st), int((b1 - b0 - 3.0) / st)
    A0_, B0_ = a0 + 1.5, b0 + 1.5; sa, sb = (a1 - a0 - 3.0) / na, (b1 - b0 - 3.0) / nb
    Rr = random.Random(3)
    for i in range(na):
        for j in range(nb):
            aa, bb = A0_ + i * sa, B0_ + j * sb
            if abs(aa + sa / 2) < 13 and abs(bb + sb / 2) < 13: continue
            pts = [(aa, bb), (aa + sa, bb), (aa + sa, bb + sb), (aa, bb + sb)]
            P3 = [L.P(p[0], p[1], yR + 0.3 + max(0.0, ac_roof_h(*p))) for p in pts]
            g.poly('grass', P3, shade(C('#6d8a45'), 0.85 + 0.25 * Rr.random()), (0, 1, 0))
    rp = L.ring([(-13, -13), (13, -13), (13, 13), (-13, 13)])
    for k in range(4):
        A_, B_ = rp[k], rp[(k + 1) % 4]
        g.poly('concrete', [(A_[0], yR + 0.3, A_[1]), (B_[0], yR + 0.3, B_[1]), (B_[0], yG - 0.5, B_[1]), (A_[0], yG - 0.5, A_[1])], C('#dcdcd6'), None)
    g.poly('glassc', [(p[0], yR + 0.1, p[1]) for p in rp], C('#c9d6da'), (0, 1, 0))
    if not g.lod:
        for k in range(9):
            g.rod('metal', L.P(-13 + k * 3.25, -13, yR + 0.12), L.P(-13 + k * 3.25, 13, yR + 0.12), 0.05, C('#8f979a'), n=3)
        for (ha, hb, hh, hr) in AC_HILLS[:2]:
            for ring_i, (rad, nn) in enumerate(((hr * 0.35, 6), (hr * 0.7, 12))):
                for k in range(nn):
                    t = 2 * math.pi * (k + 0.5 * ring_i) / nn
                    pa, pb = ha + math.cos(t) * rad, hb + math.sin(t) * rad
                    y_ = yR + 0.35 + ac_roof_h(pa, pb)
                    x, z = L.xz(pa, pb)
                    g.lathe('metal', x, z, [(0.9, y_ + 0.05), (0.9, y_ + 0.35), (0.75, y_ + 0.4)], C('#b9c0c2'), n=10)
                    g.lathe('win', x, z, [(0.75, y_ + 0.38), (0.0, y_ + 0.5)], (0.9, 0.85, 0.7, 1.0), n=10)
    cols.append(L.col(a0 - 1, a1 + 1, b0 - 1, b1 + 1, yG - 3, yR))
    noT = [[list(p) for p in L.ring([(a0 - 8, b0 - 8), (a1 + 8, b0 - 8), (a1 + 8, b1 + 8), (a0 - 8, b1 + 8)])]]
    return {'colliders': cols, 'name': 'California Academy of Sciences', 'yG': round(yG, 2), 'top': round(yR + 12, 1), 'near': 650, 'noTrees': noT}


# ================================================================================== Conservatory of Flowers (1879): white glasshouse
CF_HIDE = [42784]
CF_C = (-3596.5, 250.0)
CF_U = (0.995, -0.1)
WFR = C('#f4f4ef'); PANE = C('#dfe8e2')


def glass_box(g, L, a0, a1, b0, b1, y0, y1, step=1.3, open_dir=None):
    """white-framed glass walls on a local rect; open_dir = local (da, db) of a side left open (joins another room)"""
    rr = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
    for k, (ea, eb) in enumerate(ring_edges(rr)):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if open_dir is not None:
            d = L.d(*open_dir)
            if F[2][0] * d[0] + F[2][1] * d[2] > 0.9: continue
        g.fbox('paint', F, 0, Le, y0 - 1.2, y0 + 0.9, 0, 0.2, C('#e9e6dc'), top=True)
        g.quad_sub('paint', Geo.fp(F, 0, y0 + 0.9, 0), Geo.fp(F, Le, y0 + 0.9, 0), Geo.fp(F, Le, y1, 0), Geo.fp(F, 0, y1, 0), PANE, (F[2][0], 0, F[2][1]), maxe=4)
        if not g.lod:
            for j in range(int(Le / step) + 1):
                g.fbox('paint', F, j * step - 0.05, j * step + 0.05, y0 + 0.9, y1, 0, 0.1, WFR, top=False)
            for yy in [y0 + 0.9 + (y1 - y0 - 0.9) * f for f in (0.33, 0.66, 1.0)]:
                g.fbox('paint', F, 0, Le, yy - 0.05, yy + 0.05, 0, 0.1, WFR, top=True, bottom=True)
    return rr


def glass_vault(g, L, a0, a1, b0, b1, y0, rise, ridge_a=True, step=1.3, ends=(True, True)):
    """semicircular-ish glass vault (white ribs) over the local rect"""
    P = _rp(L, ridge_a)
    s0, s1, t0, t1 = (a0, a1, b0, b1) if ridge_a else (b0, b1, a0, a1)
    tm, hw = (t0 + t1) / 2, (t1 - t0) / 2
    NS = 8 if not g.lod else 4
    for k in range(NS):
        th0, th1 = math.pi * k / NS, math.pi * (k + 1) / NS
        V = lambda s, th: P(s, tm - hw * math.cos(th), y0 + rise * math.sin(th))
        g.poly('paint', [V(s0, th0), V(s1, th0), V(s1, th1), V(s0, th1)], PANE, (0, 1, 0))
    for ss, e in ((s0, ends[0]), (s1, ends[1])):
        if e: g.poly('paint', [P(ss, tm - hw * math.cos(math.pi * k / 12), y0 + rise * math.sin(math.pi * k / 12)) for k in range(13)], PANE, None)
    if not g.lod:
        for j in range(int((s1 - s0) / step) + 1):
            s = s0 + j * step
            pts = [P(s, tm - hw * math.cos(math.pi * k / 10), y0 + rise * math.sin(math.pi * k / 10) + 0.04) for k in range(11)]
            for k in range(10): g.rod('paint', pts[k], pts[k + 1], 0.05, WFR, n=3)
        g.rod('paint', P(s0, tm, y0 + rise + 0.05), P(s1, tm, y0 + rise + 0.05), 0.09, WFR, n=4)


def conservatory(g):
    L = Loc(CF_C, CF_U)                 # a: east, b: south (front)
    yG = min(H(*L.xz(a, b)) for a in (-36, 0, 36) for b in (-12, 18)) + 0.1
    cols = []
    y0 = yG + 0.8
    # wings (barrel vaults), end pavilions (projecting south, hipped glass roofs), entrance porch
    for s in (-1, 1):
        a0, a1 = sorted((s * 9.5, s * 27.0))
        glass_box(g, L, a0, a1, -12.5, -1.5, y0, y0 + 5.8, open_dir=(-s, 0))
        glass_vault(g, L, a0, a1, -12.5, -1.5, y0 + 5.8, 3.6, ends=(s > 0, s < 0) if False else ((True, False) if s < 0 else (False, True)))
        cols.append(L.col(a0, a1, -12.5, -1.5, yG - 2, y0 + 6))
        p0, p1 = sorted((s * 27.0, s * 37.5))
        glass_box(g, L, p0, p1, -13.0, 19.0, y0, y0 + 6.4)
        glass_vault(g, L, p0, p1, -13.0, 19.0, y0 + 6.4, 4.0, ridge_a=False)
        pc = L.xz((p0 + p1) / 2, 3.0)
        g.lathe('paint', pc[0], pc[1], [(2.2, y0 + 10.2), (2.2, y0 + 11.6), (1.6, y0 + 12.6), (0.0, y0 + 13.4)], PANE, n=8)
        g.lathe('gold', pc[0], pc[1], [(0.12, y0 + 13.3), (0.0, y0 + 14.6)], C('#e8e2c8'), n=4)
        cols.append(L.col(p0, p1, -13.0, 19.0, yG - 2, y0 + 6))
    glass_box(g, L, -2.5, 2.5, 8.5, 19.0, y0, y0 + 4.6, open_dir=(0, -1))
    glass_vault(g, L, -2.5, 2.5, 8.5, 19.0, y0 + 4.6, 2.2, ridge_a=False, ends=(False, True))
    cols.append(L.col(-2.5, 2.5, 8.5, 19.0, yG - 2, y0 + 4.6))
    # central pavilion: octagonal glass drum, clerestory, the great white dome, cupola + finial
    cx, cz = L.xz(0.0, -2.5)
    R0 = 10.0
    oc = ring_facets(cx, cz, R0 / math.cos(math.pi / 8), 8, math.pi / 8 + math.atan2(CF_U[1], CF_U[0]))
    for ea, eb in ring_edges(oc):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        nn = (F[2][0], F[2][1])
        if abs(nn[0] * CF_U[0] + nn[1] * CF_U[1]) > 0.9 or (nn[0] * L.v[0] + nn[1] * L.v[1]) > 0.9:
            g.quad_sub('paint', Geo.fp(F, 0, y0 + 5.9, 0), Geo.fp(F, Le, y0 + 5.9, 0), Geo.fp(F, Le, y0 + 7.2, 0), Geo.fp(F, 0, y0 + 7.2, 0), PANE, (F[2][0], 0, F[2][1]), maxe=4)
            continue     # open to the wings + porch
        g.fbox('paint', F, 0, Le, yG - 1.0, y0 + 0.9, 0, 0.2, C('#e9e6dc'), top=True)
        g.quad_sub('paint', Geo.fp(F, 0, y0 + 0.9, 0), Geo.fp(F, Le, y0 + 0.9, 0), Geo.fp(F, Le, y0 + 7.2, 0), Geo.fp(F, 0, y0 + 7.2, 0), PANE, (F[2][0], 0, F[2][1]), maxe=4)
        if not g.lod:
            for j in range(6): g.fbox('paint', F, Le * j / 5 - 0.06, Le * j / 5 + 0.06, y0 + 0.9, y0 + 7.2, 0, 0.12, WFR, top=False)
    g.lathe('paint', cx, cz, [(R0 + 0.8, y0 + 7.2), (R0 + 0.8, y0 + 7.6), (R0 - 1.0, y0 + 7.8)], WFR, n=8, a0=math.pi / 8 + math.atan2(CF_U[1], CF_U[0]),
            a1=math.pi / 8 + math.atan2(CF_U[1], CF_U[0]) + 2 * math.pi)
    g.lathe('paint', cx, cz, [(R0 - 1.0, y0 + 7.8), (R0 - 1.0, y0 + 10.2)], PANE, n=16)
    if not g.lod:
        for k in range(16):
            t = 2 * math.pi * k / 16
            g.rod('paint', (cx + math.cos(t) * (R0 - 0.95), y0 + 7.8, cz + math.sin(t) * (R0 - 0.95)), (cx + math.cos(t) * (R0 - 0.95), y0 + 10.2, cz + math.sin(t) * (R0 - 0.95)), 0.06, WFR, n=3)
    g.lathe('paint', cx, cz, [(R0 - 0.4, y0 + 10.2), (R0 - 0.4, y0 + 10.5), (R0 - 1.2, y0 + 10.6)], WFR, n=16)
    dome(g, cx, cz, y0 + 10.6, R0 - 1.2, 6.8, PANE, slot='paint', ribs=16, rib_col=WFR, shape=0.75)
    g.lathe('paint', cx, cz, [(1.8, y0 + 17.0), (1.8, y0 + 18.6), (2.2, y0 + 18.8), (1.2, y0 + 19.6), (0.0, y0 + 20.2)], WFR, n=8)
    g.lathe('gold', cx, cz, [(0.15, y0 + 20.1), (0.25, y0 + 20.6), (0.0, y0 + 21.8)], C('#e8e2c8'), n=6)
    cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': R0, 'hz': R0, 'yaw': 0.39, 'yMin': yG - 2, 'yMax': y0 + 7})
    cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': R0, 'hz': R0, 'yaw': 0.0, 'yMin': yG - 2, 'yMax': y0 + 7})
    # a stepped plinth + the formal flower beds on the lawn in front
    L.box(g, 'paving', -38.0, 38.0, -14.0, 20.0, yG - 2.0, y0, C('#d8d2c2'), top=True)
    if not g.lod:
        R = random.Random(9)
        for k in range(10):
            a = -34.0 + k * 7.5
            if abs(a) < 4: continue
            x, z = L.xz(a, 30.0); y = H(x, z) + 0.12
            for i in range(10):
                t = 2 * math.pi * i / 10
                g.lathe('leaf', x + math.cos(t) * 1.4, z + math.sin(t) * 1.4, [(0.45, y), (0.5, y + 0.25), (0.0, y + 0.45)], [C('#c9383a'), C('#e8c33a'), C('#8e4bb0'), C('#f2f0ea')][(k + i) % 4], n=6)
    noT = [[list(p) for p in L.ring([(-42.0, -18.0), (42.0, -18.0), (42.0, 62.0), (-42.0, 62.0)])]]
    return {'colliders': cols, 'name': 'Conservatory of Flowers', 'replaces': 'conservatory', 'yG': round(yG, 2), 'top': round(y0 + 22, 1), 'near': 600, 'noTrees': noT}


# ================================================================================== California Palace of the Legion of Honor (1924, George Applegarth)
LEG_HIDE = [17803, 17811, 17804, 17807, 17808, 17812, 17802, 17805, 17806, 17809, 17810]
LG_ST = C('#ece6d8'); LG_STD = C('#d6cebd')


def leg_frame():
    c = v2lerp(centroid(ring_of(17807)), centroid(ring_of(17808)), 0.5)
    e = max(ring_edges(ring_of(17803)), key=lambda e: v2len(v2sub(e[1], e[0])))
    u = v2norm(v2sub(e[1], e[0]))
    if u[0] < 0: u = (-u[0], -u[1])                      # NE
    return Loc(c, u)


def legion(g):
    L = leg_frame()
    cols = []
    court = [L.loc(*p) for i in (17807, 17808) for p in ring_of(i)]
    ca0, ca1 = min(q[0] for q in court), max(q[0] for q in court)
    cb0, cb1 = min(q[1] for q in court), max(q[1] for q in court)
    # the court is paved level at the highest ground inside it (the hilltop would otherwise poke through the paving)
    yG = max(H(*L.xz(ca0 + (ca1 - ca0) * i / 8, cb0 + (cb1 - cb0) * j / 8)) for i in range(9) for j in range(9)) + 0.08
    # wings + central gallery block + rotunda: blind neoclassical walls, pilasters, cornice, balustrade
    for i in (17803, 17811, 17804):
        r = ring_simplify(ring_of(i), 0.4)
        top = yG + 14.5
        for ea, eb in ring_edges(r):
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            nt = neighbour_top(ea, eb, set(LEG_HIDE))
            g.fbox('stone', F, 0, Le, yG - 3.0, yG + 1.2, 0, 0.4, LG_STD, top=True)
            if Le > 8 and nt is None:
                facade(g, ea, eb, yG + 1.2, top - 2.0, top - 3.2 - yG, 5.0, Win(w=1.6, sill=4.5, head=8.6, depth=0.5, arch=1, lit=0.15, glass='stone', mull=False), 'stone', LG_ST,
                       margin=1.0, pier=(1.0, 0.35, LG_STD) if not g.lod else None)
            else:
                radial_panel(g, 'stone', F, 0, Le, yG + 1.2, top - 2.0, None, LG_ST)
            radial_panel(g, 'stone', F, 0, Le, top - 2.0, top, None, LG_ST)
        entablature(g, r, top, 1.6, LG_ST, depth=0.8)
        for ea, eb in ring_edges(r):
            if v2len(v2sub(eb, ea)) > 3: balustrade(g, ea, eb, top, 1.1, LG_ST)
        g.poly('roof', [(p[0], top - 0.1, p[1]) for p in ring_offset(ring_out(r), -0.6)], ROOF, (0, 1, 0))
        cols += wall_colliders(r, yG - 3, top)
    rc = centroid(ring_of(17802))
    g.lathe('stone', rc[0], rc[1], [(6.6, yG - 3), (6.6, yG + 16.0), (7.0, yG + 16.4), (7.0, yG + 17.0), (6.2, yG + 17.2)], LG_ST, n=24 if not g.lod else 12)
    dome(g, rc[0], rc[1], yG + 17.2, 6.2, 4.2, C('#8f9c95'), slot='metal', ribs=12, rib_col=LG_STD, shape=0.6)
    cols.append({'x': round(rc[0], 2), 'z': round(rc[1], 2), 'hx': 6.4, 'hz': 6.4, 'yaw': 0.39, 'yMin': yG - 3, 'yMax': yG + 17})
    # the Court of Honor: paving, Ionic colonnades (NW, SE), the triumphal arch at the NE end, portico at the SW end
    L.box(g, 'paving', ca0, ca1, cb0 + 3.2, cb1 - 3.2, yG - 1.0, yG + 0.05, C('#d9d2c2'), top=True)
    yc = yG + 10.5
    for (b_in, b_out) in ((cb0 + 3.2, cb0), (cb1 - 3.2, cb1)):
        s = 1 if b_out > b_in else -1
        # rear wall (outer) + roof
        L.box(g, 'stone', ca0 + 2.0, ca1 - 2.0, min(b_out, b_out - s * 0.6), max(b_out, b_out - s * 0.6), yG - 1.0, yc, LG_ST, top=False)
        L.box(g, 'stone', ca0 + 2.0, ca1 - 2.0, min(b_in, b_out) - 0.3, max(b_in, b_out) + 0.3, yc - 0.3, yc + 1.4, LG_STD, top=True, bottom=True)
        n = int((ca1 - ca0 - 4.0) / 3.6)
        for k in range(n + 1):
            a = ca0 + 2.0 + (ca1 - ca0 - 4.0) * k / n
            x, z = L.xz(a, b_in)
            cols.append(column(g, x, z, yG + 0.05, yc - 0.3, 0.42, LG_ST, order='ionic', n=12))
        for kk in range(int((ca1 - ca0 - 4.0) / 1.0)):
            if g.lod: break
            pass
        balustrade(g, L.xz(ca0 + 2.0, b_in), L.xz(ca1 - 2.0, b_in), yc + 1.4, 1.0, LG_ST) if s > 0 else balustrade(g, L.xz(ca1 - 2.0, b_in), L.xz(ca0 + 2.0, b_in), yc + 1.4, 1.0, LG_ST)
        cols.append(L.col(ca0 + 2.0, ca1 - 2.0, min(b_out, b_out - s * 0.6), max(b_out, b_out - s * 0.6), yG - 1, yc))
    # NE end: colonnade screen with the triumphal arch in the middle ("HONNEUR ET PATRIE")
    F = L.F(ca1, cb0, 1)
    Wc = cb1 - cb0; uc = Wc / 2
    arch = arch_pts(uc, 6.4, yG + 0.05, yG + 7.6, 16 if not g.lod else 6)
    radial_panel(g, 'stone', F, uc - 5.6, uc + 5.6, yG - 1.0, yG + 15.5, arch, LG_ST, w=1.2)
    Fi = (Geo.fp(F, uc + 5.6, 0, -1.2)[0::2], (-F[1][0], -F[1][1]), (-F[2][0], -F[2][1]))
    radial_panel(g, 'stone', Fi, 0, 11.2, yG - 1.0, yG + 15.5, [(11.2 - (p[0] - (uc - 5.6)), p[1]) for p in arch][::-1], LG_STD)
    for i in range(len(arch)):
        p, q = arch[i], arch[(i + 1) % len(arch)]
        if p[1] < yG + 0.1 and q[1] < yG + 0.1: continue
        g.poly('stone', [Geo.fp(F, p[0], p[1], 1.2), Geo.fp(F, q[0], q[1], 1.2), Geo.fp(F, q[0], q[1], -1.2), Geo.fp(F, p[0], p[1], -1.2)], LG_STD, None)
    for s in (-1, 1):
        g.fbox('stone', F, uc + s * 5.6 - (1.2 if s > 0 else -1.2) * 0 - 0.0, uc + s * 5.6, yG - 1.0, yG + 15.5, -1.2, 1.2, LG_ST, top=True) if False else None
        for d in (4.2, 2.6):
            q = Geo.fp(F, uc + s * d, 0, 1.9)
            cols.append(column(g, q[0], q[2], yG + 0.05, yG + 11.8, 0.5, LG_ST, order='corinthian', n=12))
    g.fbox('stone', F, uc - 5.8, uc + 5.8, yG + 11.8, yG + 13.4, -1.2, 2.5, LG_STD, top=True, bottom=True)
    g.fbox('stone', F, uc - 5.6, uc + 5.6, yG + 13.4, yG + 15.5, -1.2, 1.3, LG_ST, top=True, bottom=True)
    if not g.lod:
        g.text('stone', F, uc, yG + 13.9, 1.32, 'HONNEUR ET PATRIE', 0.62, shade(LG_ST, 0.55), depth=0.05)
    for (u0, u1) in ((0.0, uc - 5.6), (uc + 5.6, Wc)):
        n = int((u1 - u0) / 3.6)
        for k in range(n + 1):
            q = Geo.fp(F, u0 + 1.0 + (u1 - u0 - 2.0) * k / max(1, n), 0, -0.2)
            cols.append(column(g, q[0], q[2], yG + 0.05, yc - 0.3, 0.42, LG_ST, order='ionic', n=12))
        g.fbox('stone', F, u0, u1, yc - 0.3, yc + 1.4, -1.0, 0.6, LG_STD, top=True, bottom=True)
    cols.append(L.col(ca1 - 1.2, ca1 + 1.2, -Wc / 2 + uc - 5.6 - uc + cb0 * 0 + (cb0 - cb0), -Wc / 2 + uc - 5.6 - uc + (uc - 5.6) * 0 + 0.0, yG - 1, yG + 15)) if False else None
    for s in (-1, 1):
        b0_, b1_ = (cb0, cb0 + uc - 3.2) if s < 0 else (cb0 + uc + 3.2, cb1)
        cols.append(L.col(ca1 - 1.2, ca1 + 1.2, b0_, b1_, yG - 1, yG + 15))
    # SW: hexastyle Corinthian portico + pediment on the main block
    Fp = L.F(ca0 - 1.0, cb1, 3)
    Fp = (L.xz(ca0 + 0.5, cb1), (-L.v[0], -L.v[1]), L.u)
    n_ = (-Fp[1][1], Fp[1][0])
    if n_[0] * L.u[0] + n_[1] * L.u[1] < 0: Fp = (L.xz(ca0 + 0.5, cb0), L.v, (-L.v[1] * -1, L.v[0] * -1))
    Fp = (Fp[0], Fp[1], (-Fp[1][1], Fp[1][0]))
    um = Wc / 2
    for k in range(6):
        q = Geo.fp(Fp, um + (k - 2.5) * 2.4, 0, 2.6)
        cols.append(column(g, q[0], q[2], yG + 0.05, yG + 11.4, 0.55, LG_ST, order='corinthian', n=14))
    g.fbox('stone', Fp, um - 7.4, um + 7.4, yG + 11.4, yG + 13.2, -0.5, 3.4, LG_STD, top=True, bottom=True)
    pediment(g, Fp, um - 7.4, um + 7.4, yG + 13.2, 3.0, 3.4, LG_ST)
    door = arch_pts(um, 2.6, yG + 0.05, yG + 3.8, 10)
    g.poly('wood', [Geo.fp(Fp, u_, v_, 0.02) for u_, v_ in door], C('#3a2a1c'), (Fp[2][0], 0, Fp[2][1]))
    # The Thinker on its pedestal + the glass pyramid skylight
    tx, tz = L.xz(ca1 - 9.0, (cb0 + cb1) / 2)
    g.box('stone', tx - 1.1, tx + 1.1, yG, yG + 2.6, tz - 0.8, tz + 0.8, C('#cfc7b6'))
    BZ = C('#2f2a22')
    g.lathe('metal', tx, tz, [(0.55, yG + 2.6), (0.6, yG + 3.1), (0.45, yG + 3.3)], BZ, n=10)
    g.rod('metal', (tx, yG + 3.2, tz), (tx + 0.25, yG + 4.2, tz - 0.25), 0.36, BZ, n=8)
    g.lathe('metal', tx + 0.35, tz - 0.4, [(0.0, yG + 4.2), (0.24, yG + 4.35), (0.2, yG + 4.6), (0.0, yG + 4.7)], BZ, n=8)
    g.rod('metal', (tx - 0.15, yG + 3.2, tz + 0.2), (tx - 0.15, yG + 2.7, tz - 0.6), 0.14, BZ, n=6)
    g.rod('metal', (tx + 0.2, yG + 3.2, tz + 0.2), (tx + 0.25, yG + 2.7, tz - 0.6), 0.14, BZ, n=6)
    g.rod('metal', (tx + 0.35, yG + 3.9, tz - 0.1), (tx + 0.3, yG + 3.3, tz - 0.55), 0.1, BZ, n=5)
    cols.append({'x': round(tx, 2), 'z': round(tz, 2), 'hx': 1.1, 'hz': 0.8, 'yaw': round(L.yaw(), 4), 'yMin': yG - 1, 'yMax': yG + 4.6})
    px, pz = L.xz(ca0 + 12.0, (cb0 + cb1) / 2)
    for k in range(4):
        t0, t1 = math.pi / 4 + k * math.pi / 2 + math.atan2(L.u[1], L.u[0]), math.pi / 4 + (k + 1) * math.pi / 2 + math.atan2(L.u[1], L.u[0])
        g.poly('glassc', [(px + math.cos(t0) * 3.5, yG + 0.05, pz + math.sin(t0) * 3.5), (px + math.cos(t1) * 3.5, yG + 0.05, pz + math.sin(t1) * 3.5), (px, yG + 3.2, pz)],
               C('#cfdde2'), (math.cos((t0 + t1) / 2), 0.7, math.sin((t0 + t1) / 2)))
        g.rod('metal', (px + math.cos(t0) * 3.5, yG + 0.05, pz + math.sin(t0) * 3.5), (px, yG + 3.2, pz), 0.05, C('#8f979a'), n=3)
    cols.append({'x': round(px, 2), 'z': round(pz, 2), 'hx': 2.4, 'hz': 2.4, 'yaw': round(L.yaw() + 0.785, 4), 'yMin': yG - 1, 'yMax': yG + 3})
    decks = rect_decks(L, ca0 + 0.5, ca1, cb0 + 3.2, cb1 - 3.2, yG + 0.05, strip=10.0)
    allp = [p for i in LEG_HIDE for p in ring_of(i)]
    hl = hull(allp); cc = centroid(hl)
    noT = [[[round(cc[0] + (p[0] - cc[0]) * 1.25, 1), round(cc[1] + (p[1] - cc[1]) * 1.25, 1)] for p in hl]]
    return {'colliders': cols, 'name': 'Legion of Honor', 'replaces': 'legion', 'yG': round(yG, 2), 'top': round(yG + 22, 1), 'decks': decks, 'noTrees': noT}


# ================================================================================== Oracle Park (2000, HOK): brick ballpark on China Basin
OP_HIDE = [39956, 39929, 39955, 39957, 39958, 39959, 39928, 39960, 39961, 39953, 39954]
OP_HP = (2572.0, -388.0)
BRK = C('#9a4b36'); BRK_D = C('#7e3c2c'); STEEL = C('#2f4a3f'); SEAT = C('#264b3c')


def op_geom():
    med, wid = band_medial(ring_of(39956), 90)
    wid = [max(13.0, min(26.0, w)) for w in wid]
    out = []
    for k in range(len(med)):
        a, b = med[max(0, k - 1)], med[min(len(med) - 1, k + 1)]
        t = v2norm(v2sub(b, a)); n = (-t[1], t[0])
        if n[0] * (OP_HP[0] - med[k][0]) + n[1] * (OP_HP[1] - med[k][1]) < 0: n = (-n[0], -n[1])
        pin = v2add(med[k], v2mul(n, wid[k] / 2))
        out.append((pin, n, wid[k]))
    return out


def op_levels():
    yF = H(*OP_HP) + 0.05
    return yF, yF + 5.0


def oracle(g):
    G = op_geom()
    yF, yC = op_levels()
    yTop = yF + 26.0
    cols = []; decks = []
    fin = lambda k, d: v2sub(G[k][0], v2mul(G[k][1], d))            # point at depth d outward from the field edge
    # profile (fraction of width f, absolute y)
    NL, NU = 10, 16
    lower = [(0.0, yF + 1.3)]
    for i in range(NL):
        f0 = 0.42 * i / NL; f1 = 0.42 * (i + 1) / NL; y = yF + 1.3 + (yC - yF - 1.3) * (i + 1) / NL
        lower += [(f0, y), (f1, y)]
    upper = []
    for i in range(NU):
        f0 = 0.5 + 0.5 * i / NU; f1 = 0.5 + 0.5 * (i + 1) / NU; y = yC + 6.6 + (yTop - yC - 6.6) * (i + 1) / NU
        upper += [(f0, y), (f1, y)]
    step = 1 if not g.lod else 3
    for k in range(0, len(G) - step, step):
        k2 = k + step
        P = lambda kk, f, y: (fin(kk, f * G[kk][2])[0], y, fin(kk, f * G[kk][2])[1])
        # field wall (padded)
        g.poly('paint', [P(k, 0.0, yF - 0.5), P(k2, 0.0, yF - 0.5), P(k2, 0.0, yF + 1.3), P(k, 0.0, yF + 1.3)], C('#1d3a2e'), (G[k][1][0], 0, G[k][1][1]))
        for prof, col_ in ((lower, SEAT), (upper, SEAT)):
            for i in range(len(prof) - 1):
                (f0, y0_), (f1, y1_) = prof[i], prof[i + 1]
                horiz = abs(y1_ - y0_) < 1e-6
                c_ = col_ if horiz else shade(col_, 0.7)
                g.poly('paint', [P(k, f0, y0_), P(k2, f0, y0_), P(k2, f1, y1_), P(k, f1, y1_)], c_, (0, 1, 0) if horiz else (G[k][1][0], 0, G[k][1][1]))
                if horiz and not g.lod and k % 9 != 4 and f1 > f0:
                    # a row of seats on each tread: pan + back (dark green), read as rows from the concourse and the field
                    fs = f0 + (f1 - f0) * 0.25; fb = f0 + (f1 - f0) * 0.75
                    g.poly('paint', [P(k, fs, y0_ + 0.42), P(k2, fs, y0_ + 0.42), P(k2, fb, y0_ + 0.42), P(k, fb, y0_ + 0.42)], C('#1f3d2c'), (0, 1, 0))
                    g.poly('paint', [P(k, fb, y0_ + 0.42), P(k2, fb, y0_ + 0.42), P(k2, fb, y0_ + 0.95), P(k, fb, y0_ + 0.95)], C('#18321f'), (G[k][1][0], 0, G[k][1][1]))
        # concourse floor (covered), upper deck front fascia + underside
        g.poly('paving', [P(k, 0.42, yC), P(k2, 0.42, yC), P(k2, 1.0, yC), P(k, 1.0, yC)], C('#b9b3a6'), (0, 1, 0))
        g.poly('paint', [P(k, 0.5, yC + 5.6), P(k2, 0.5, yC + 5.6), P(k2, 0.5, yC + 6.8), P(k, 0.5, yC + 6.8)], C('#e8e6de'), (G[k][1][0], 0, G[k][1][1]))
        g.poly('paint', [P(k, 0.5, yC + 5.6), P(k2, 0.5, yC + 5.6), P(k2, 1.0, yTop - 7.0), P(k, 1.0, yTop - 7.0)], C('#cfcac0'), (0, -1, 0))
        if not g.lod:
            g.poly('neon', [P(k, 0.5, yC + 6.0), P(k2, 0.5, yC + 6.0), P(k2, 0.5, yC + 6.4), P(k, 0.5, yC + 6.4)], (0.3, 0.12, 0.05, 1.0), (G[k][1][0] * 1.01, 0, G[k][1][1] * 1.01)) if False else None
            if k % 6 == 0:     # concourse columns carrying the upper deck
                q = fin(k, 0.52 * G[k][2]); g.cyl('metal', q[0], q[1], 0.35, yC, yC + 5.6, STEEL, n=8)
                cols.append({'x': round(q[0], 2), 'z': round(q[1], 2), 'hx': 0.4, 'hz': 0.4, 'yaw': 0, 'yMin': yC - 1, 'yMax': yC + 5.6})
        # the bowl's rail + light rail on top
        g.poly('metal', [P(k, 1.0, yTop), P(k2, 1.0, yTop), P(k2, 1.0, yTop + 1.2), P(k, 1.0, yTop + 1.2)], STEEL, (G[k][1][0], 0, G[k][1][1]))
        a_, b_ = fin(k, 0.52 * G[k][2]), fin(k2, 0.52 * G[k2][2])
        decks.append(deck_seg(a_, b_, yC, yC, round(0.18 * (G[k][2] + G[k2][2]) / 2 + 0.5, 2)))
        cols.append({'x': round((fin(k, 0.2 * G[k][2])[0] + fin(k2, 0.2 * G[k2][2])[0]) / 2, 2), 'z': round((fin(k, 0.2 * G[k][2])[1] + fin(k2, 0.2 * G[k2][2])[1]) / 2, 2),
                     'hx': round(v2len(v2sub(fin(k2, 0.2 * G[k2][2]), fin(k, 0.2 * G[k][2]))) / 2 + 0.3, 2), 'hz': round(0.2 * G[k][2], 2),
                     'yaw': round(math.atan2(-(fin(k2, 0) [1] - fin(k, 0)[1]), fin(k2, 0)[0] - fin(k, 0)[0]), 4), 'yMin': yF - 1, 'yMax': yC - 0.2})
    # brick outer facade on the outward-facing edges of the stands (+ the 3rd St block), gate gap at Willie Mays Plaza
    gate = min((p for i in (39929,) for p in ring_out(ring_of(i))), key=lambda p: v2len(v2sub(p, (2505.0, -385.0))))
    for i in (39956, 39929, 39955):
        r = ring_simplify(ring_of(i), 0.6)
        for ea, eb in ring_edges(r):
            n = edge_n(ea, eb); m = v2lerp(ea, eb, 0.5)
            if i == 39956 and n[0] * (OP_HP[0] - m[0]) + n[1] * (OP_HP[1] - m[1]) > 0: continue       # field side: the bowl
            if i != 39956 and neighbour_top(ea, eb, set(OP_HIDE)) is not None: continue
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            top = yTop + 1.2 if i == 39956 else yF + (21.0 if i == 39929 else 18.0)
            spans = [(0.0, Le)]
            dg = v2len(v2sub(v2lerp(ea, eb, max(0.0, min(1.0, ((gate[0] - ea[0]) * F[1][0] + (gate[1] - ea[1]) * F[1][1]) / Le))), gate))
            if dg < 3.0 and Le > 20:
                ug = (gate[0] - ea[0]) * F[1][0] + (gate[1] - ea[1]) * F[1][1]
                spans = [(0.0, max(0.0, ug - 7.0)), (min(Le, ug + 7.0), Le)]
            for (u0, u1) in spans:
                if u1 - u0 < 1.0: continue
                a2, b2 = v2lerp(ea, eb, u0 / Le), v2lerp(ea, eb, u1 / Le)
                facade(g, a2, b2, yG_(a2, b2) - 1.5, yF + 7.5, 7.5 + 1.5, 6.2, Win(w=4.2, sill=1.2, head=7.2, arch=1, depth=0.7, lit=0.8, glass='shop', mull=False), 'brickred', BRK, margin=0.8,
                       pier=(1.2, 0.5, BRK_D) if not g.lod else None)
                g.fbox('stone', Geo.frame(a2, b2), 0, u1 - u0, yF + 7.5, yF + 8.3, 0, 0.6, C('#d9d2c2'), top=True, bottom=True)
                if top > yF + 9.0:
                    facade(g, a2, b2, yF + 8.3, top - 1.0, 5.5, 6.2, Win(w=4.6, sill=0.8, head=4.8, depth=0.5, lit=0.2, glass='metal', mull=False), 'brickred', BRK, margin=0.8,
                           pier=(1.2, 0.5, BRK_D) if not g.lod else None)
                    g.fbox('metal', Geo.frame(a2, b2), 0, u1 - u0, top - 1.0, top, -0.2, 0.3, STEEL, top=True, bottom=True)
            if i != 39956:
                g.poly('roof', [(p[0], top, p[1]) for p in ring_offset(ring_out(r), -0.3)], ROOF, (0, 1, 0))
        cols += wall_colliders(r, yF - 2, yC) if i != 39956 else []
    # Willie Mays gate: brick clock tower, steel arch sign, the stair up to the concourse
    gc = gate
    dirv = v2norm(v2sub(OP_HP, gc)); t_ = (-dirv[1], dirv[0])
    for s in (-1, 1):
        base = v2add(gc, v2mul(t_, s * 8.5))
        Fb = (v2sub(base, v2add(v2mul(t_, 3.5), v2mul(dirv, 3.5))), t_, (dirv[0], dirv[1]))
        Fb = (v2sub(v2sub(base, v2mul(t_, 3.5)), v2mul(dirv, 3.5)), t_, (-t_[1], t_[0]))
        yt = yF + (36.0 if s < 0 else 24.0)
        g.fbox('brickred', Fb, 0, 7.0, yF - 1.5, yt, 0, 7.0, BRK, top=True, back=True)
        g.fbox('stone', Fb, -0.3, 7.3, yt, yt + 0.8, -0.3, 7.3, C('#d9d2c2'), top=True, bottom=True, back=True)
        cols.append({'x': round(base[0], 2), 'z': round(base[1], 2), 'hx': 3.6, 'hz': 3.6, 'yaw': round(math.atan2(-t_[1], t_[0]), 4), 'yMin': yF - 2, 'yMax': yt})
        if s < 0:
            for rot in range(4):
                tt = [t_, (-t_[1], t_[0]), (-t_[0], -t_[1]), (t_[1], -t_[0])][rot]
                nn = (-tt[1], tt[0])
                ctr = v2add(base, v2mul(nn, 3.55))
                pts = [(ctr[0] + tt[0] * math.cos(2 * math.pi * j / 24) * 2.2, yt - 4.0 + math.sin(2 * math.pi * j / 24) * 2.2, ctr[1] + tt[1] * math.cos(2 * math.pi * j / 24) * 2.2) for j in range(24)]
                g.poly('lamp', pts, (1.0, 0.95, 0.82, 1.0), (nn[0], 0, nn[1]))
                if not g.lod:
                    g.rod('metal', (ctr[0] + nn[0] * 0.1, yt - 4.0, ctr[1] + nn[1] * 0.1), (ctr[0] + nn[0] * 0.1 + tt[0] * 0.9, yt - 3.0, ctr[1] + nn[1] * 0.1 + tt[1] * 0.9), 0.06, C('#1a1a1a'), n=3)
                    g.rod('metal', (ctr[0] + nn[0] * 0.12, yt - 4.0, ctr[1] + nn[1] * 0.12), (ctr[0] + nn[0] * 0.12, yt - 2.3, ctr[1] + nn[1] * 0.12), 0.05, C('#1a1a1a'), n=3)
            g.lathe('metal', base[0], base[1], [(4.2, yt + 0.8), (0.3, yt + 6.0), (0.0, yt + 6.4)], STEEL, n=4, a0=math.atan2(t_[1], t_[0]) + math.pi / 4)
            g.cyl('metal', base[0], base[1], 0.1, yt + 6.0, yt + 14.0, C('#e0e0e0'), n=5)
            g.fbox('fabric', (base, t_, (-t_[1], t_[0])), 0.1, 3.4, yt + 11.6, yt + 13.8, -0.02, 0.02, C('#e27b2a'), top=False, back=True)
    Fa = (v2sub(gc, v2mul(t_, 5.5)), t_, (-t_[1], t_[0]))
    if (-t_[1]) * dirv[0] + t_[0] * dirv[1] > 0: Fa = (v2add(gc, v2mul(t_, 5.5)), (-t_[0], -t_[1]), (t_[1], -t_[0]))
    g.fbox('metal', Fa, 0, 11.0, yF + 10.5, yF + 12.3, -0.3, 0.3, STEEL, top=True, bottom=True, back=True)
    if not g.lod:
        g.text('neon', Fa, 5.5, yF + 10.75, 0.32, 'CHINA BASIN BALLPARK', 0.95, (1.0, 0.93, 0.8, 1.0), depth=0.08)
    ya_ = sidewalk(*v2add(gc, v2mul(dirv, -8.0)))
    A_, B_ = v2add(gc, v2mul(dirv, -6.0)), v2add(gc, v2mul(dirv, 22.0))
    decks.append(ext_stairs(g, A_, B_, ya_, yC, 9.0, C('#b9b3a6'), slot='paving'))
    decks.append(deck_seg(B_, v2add(gc, v2mul(dirv, 30.0)), yC, yC, 9.0))
    # palms + the bronze statue on the plaza
    for k in range(6):
        q = v2add(v2add(gc, v2mul(dirv, -14.0)), v2mul(t_, (k - 2.5) * 5.0)); cols.append(palm(g, q[0], q[1], sidewalk(*q), 8.0 + (k % 2) * 1.5, 700 + k))
    q = v2add(gc, v2mul(dirv, -10.0)); ys_ = sidewalk(*q)
    g.box('stone', q[0] - 1.0, q[0] + 1.0, ys_, ys_ + 1.4, q[1] - 1.0, q[1] + 1.0, C('#8f8a80'))
    g.lathe('metal', q[0], q[1], [(0.35, ys_ + 1.4), (0.3, ys_ + 2.4), (0.42, ys_ + 3.0), (0.3, ys_ + 3.3), (0.2, ys_ + 3.45), (0.24, ys_ + 3.7), (0.0, ys_ + 3.9)], C('#3d3326'), n=10)
    cols.append({'x': round(q[0], 2), 'z': round(q[1], 2), 'hx': 1.0, 'hz': 1.0, 'yaw': 0, 'yMin': ys_ - 1, 'yMax': ys_ + 3.9})
    # ---- the field: fan from home plate to (the bowl's field edge + the outfield wall arc)
    edge = [G[k][0] for k in range(len(G))]
    lf, rf = edge[0], edge[-1]
    if v2len(v2sub(lf, (2680.0, -495.0))) > v2len(v2sub(rf, (2680.0, -495.0))): lf, rf = rf, lf; edge = edge[::-1]
    HP = OP_HP
    ang = lambda p: math.atan2(p[1] - HP[1], p[0] - HP[0])
    aL, aR = ang(lf), ang(rf)
    if aR < aL: aR += 2 * math.pi
    rL, rR = v2len(v2sub(lf, HP)), v2len(v2sub(rf, HP))
    NA = 36 if not g.lod else 12
    arc = []
    for i in range(NA + 1):
        t = i / NA; a = aL + (aR - aL) * t
        r_ = rL + (rR - rL) * t + 24.0 * math.sin(math.pi * t) ** 1.3
        arc.append((HP[0] + math.cos(a) * r_, HP[1] + math.sin(a) * r_))
    poly_ = edge[::-1] + arc[1:-1]        # rf -> around the plate -> lf, then the outfield arc lf -> rf
    poly_ = arc + edge[::-1][1:-1]
    Rr = random.Random(5)
    for i in range(len(poly_)):
        p, q = poly_[i], poly_[(i + 1) % len(poly_)]
        c_ = C('#4f8a3a') if (int(ang(v2lerp(p, q, 0.5)) * 18) % 2) else C('#5b9a43')
        g.poly('grass', [(HP[0], yF + 0.02, HP[1]), (p[0], yF + 0.02, p[1]), (q[0], yF + 0.02, q[1])], c_, (0, 1, 0))
    cfd = v2norm(v2sub(arc[NA // 2], HP)); M = v2add(HP, v2mul(cfd, 18.4))
    rot = lambda v, a: (v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a))
    b1 = v2add(HP, v2mul(rot(cfd, -math.pi / 4), 27.4)); b3 = v2add(HP, v2mul(rot(cfd, math.pi / 4), 27.4)); b2 = v2add(HP, v2mul(cfd, 38.8))
    dirt = [HP, v2add(HP, v2mul(rot(cfd, -math.pi / 4), 36.0))]
    for i in range(17):
        a = math.atan2(cfd[1], cfd[0]) - 0.95 + 1.9 * i / 16
        dirt.append((M[0] + math.cos(a) * 29.0, M[1] + math.sin(a) * 29.0))
    dirt.append(v2add(HP, v2mul(rot(cfd, math.pi / 4), 36.0)))
    for i in range(1, len(dirt) - 1):
        g.poly('paving', [(HP[0], yF + 0.04, HP[1]), (dirt[i][0], yF + 0.04, dirt[i][1]), (dirt[i + 1][0], yF + 0.04, dirt[i + 1][1])], C('#b0764a'), (0, 1, 0))
    ins = [v2add(HP, v2mul(v2norm(v2sub(p, M)), 0.0)) for p in (HP, b1, b2, b3)]
    dia = [v2add(p, v2mul(v2norm(v2sub(M, p)), 1.9)) for p in (HP, b1, b2, b3)]
    g.poly('grass', [(p[0], yF + 0.06, p[1]) for p in dia], C('#5b9a43'), (0, 1, 0))
    g.lathe('paving', M[0], M[1], [(2.8, yF + 0.07), (1.2, yF + 0.3), (0.0, yF + 0.32)], C('#b0764a'), n=16)
    g.lathe('paving', HP[0], HP[1], [(4.0, yF + 0.07), (0.0, yF + 0.07)], C('#b0764a'), n=16)
    for p in (b1, b2, b3):
        g.box('paint', p[0] - 0.22, p[0] + 0.22, yF + 0.07, yF + 0.16, p[1] - 0.22, p[1] + 0.22, C('#f4f4f0'))
    g.poly('paint', [(HP[0] - 0.22, yF + 0.09, HP[1] - 0.22), (HP[0] + 0.22, yF + 0.09, HP[1] - 0.22), (HP[0] + 0.22, yF + 0.09, HP[1] + 0.22), (HP[0] - 0.22, yF + 0.09, HP[1] + 0.22)],
           C('#f4f4f0'), (0, 1, 0))
    for fl in (lf, rf):     # foul lines
        d = v2norm(v2sub(fl, HP)); n_ = (-d[1] * 0.06, d[0] * 0.06); L_ = v2len(v2sub(fl, HP))
        g.poly('paint', [(HP[0] + n_[0], yF + 0.08, HP[1] + n_[1]), (HP[0] - n_[0], yF + 0.08, HP[1] - n_[1]), (fl[0] - n_[0], yF + 0.08, fl[1] - n_[1]), (fl[0] + n_[0], yF + 0.08, fl[1] + n_[1])],
               C('#f4f4f0'), (0, 1, 0))
    # outfield wall: padded green in left/centre, the brick arcade (7.6 m) in right field along the cove
    for i in range(NA):
        p, q = arc[i], arc[i + 1]
        right = i > NA * 0.55
        F = Geo.frame(p, q)
        if F[2][0] * (HP[0] - p[0]) + F[2][1] * (HP[1] - p[1]) < 0: F = Geo.frame(q, p)
        Le = v2len(v2sub(q, p))
        if right:
            hole = arch_pts(Le / 2, min(3.2, Le - 1.2), yF + 1.2, yF + 4.4, 8 if not g.lod else 3)
            radial_panel(g, 'brickred', F, 0, Le, yF - 1.0, yF + 7.6, hole, BRK)
            g.poly('metal', [Geo.fp(F, u, v, -0.05) for u, v in hole], STEEL, (F[2][0], 0, F[2][1]))
            g.fbox('stone', F, -0.05, Le + 0.05, yF + 7.6, yF + 8.0, -0.6, 0.2, C('#d9d2c2'), top=True, bottom=True)
            g.fbox('brickred', F, 0, Le, yF - 1.0, yF + 7.6, -0.6, 0.0, BRK_D, top=False) if False else None
        else:
            g.fbox('paint', F, -0.02, Le + 0.02, yF - 0.5, yF + 2.5, -0.5, 0.0, C('#1d3a2e'), top=True, back=True)
            if not g.lod and i % 4 == 0:
                g.text('paint', F, Le / 2, yF + 1.2, 0.02, str(int(round((v2len(v2sub(v2lerp(p, q, 0.5), HP))) * 3.281))), 0.7, C('#f0e8d0'), depth=0.02)
        m = v2lerp(p, q, 0.5)
        cols.append({'x': round(m[0] - F[2][0] * 0.3, 2), 'z': round(m[1] - F[2][1] * 0.3, 2), 'hx': round(Le / 2 + 0.2, 2), 'hz': 0.3, 'yaw': round(math.atan2(-F[1][1], F[1][0]), 4),
                     'yMin': yF - 1, 'yMax': yF + (7.6 if right else 2.5)})
    # the scoreboard (right-centre), light standards, the soda bottle + giant mitt behind left field
    sb = centroid(ring_of(39960)); sr = ring_out(ring_of(39960))
    e = max(ring_edges(sr), key=lambda e: v2len(v2sub(e[1], e[0]))); tt = v2norm(v2sub(e[1], e[0]))
    Fs = (v2sub(sb, v2mul(tt, 16.0)), tt, (-tt[1], tt[0]))
    if Fs[2][0] * (HP[0] - sb[0]) + Fs[2][1] * (HP[1] - sb[1]) < 0: Fs = (v2add(sb, v2mul(tt, 16.0)), (-tt[0], -tt[1]), (tt[1], -tt[0]))
    for uu in (4.0, 28.0):
        q = Geo.fp(Fs, uu, 0, -1.0); g.cyl('metal', q[0], q[2], 0.8, yF - 1.0, yF + 16.0, STEEL, n=8)
        cols.append({'x': round(q[0], 2), 'z': round(q[2], 2), 'hx': 0.9, 'hz': 0.9, 'yaw': 0, 'yMin': yF - 1, 'yMax': yF + 16})
    g.fbox('metal', Fs, -0.5, 32.5, yF + 14.0, yF + 29.5, -1.6, 0.0, STEEL, top=True, bottom=True, back=True)
    g.fbox('neon', Fs, 0.6, 31.4, yF + 15.0, yF + 26.2, 0.0, 0.05, (0.1, 0.13, 0.16, 1.0), top=False, sides=False)
    if not g.lod:
        Rr = random.Random(8)
        for k in range(10):
            u0 = 1.0 + k * 3.0
            for j in range(3):
                g.fbox('neon', Fs, u0, u0 + 2.6, yF + 15.4 + j * 3.5, yF + 18.4 + j * 3.5, 0.05, 0.08, (Rr.uniform(0.2, 0.9), Rr.uniform(0.2, 0.8), Rr.uniform(0.3, 0.9), 1.0), top=False, sides=False)
        g.text('neon', Fs, 16.0, yF + 26.9, 0.05, 'SAN FRANCISCO', 1.6, (1.0, 0.55, 0.15, 1.0), depth=0.08)
    for i in (39957, 39958, 39959, 39928):
        c_ = centroid(ring_of(i)); top_ = bld(i)['base'] + min(bld(i)['h'], 58.0)
        g.cyl('metal', c_[0], c_[1], 0.9, yF - 1.0, top_ - 6.0, C('#dfe2df'), n=8, r1=0.55)
        d = v2norm(v2sub(HP, c_)); tt = (-d[1], d[0])
        Fl = (v2sub(c_, v2mul(tt, 5.0)), tt, (d[0] * 1.0, d[1] * 1.0))
        Fl = (v2sub(c_, v2mul(tt, 5.0)), tt, (-tt[1], tt[0]))
        g.fbox('metal', Fl, 0, 10.0, top_ - 7.0, top_, -0.6, 0.0, C('#dfe2df'), top=True, back=True)
        if not g.lod:
            for jj in range(5):
                for ii in range(8):
                    g.fbox('lamp', Fl, 0.4 + ii * 1.2, 1.3 + ii * 1.2, top_ - 6.4 + jj * 1.25, top_ - 5.5 + jj * 1.25, 0.0, 0.1, (1.0, 0.98, 0.9, 1.0), top=False, sides=False)
        cols.append({'x': round(c_[0], 2), 'z': round(c_[1], 2), 'hx': 1.0, 'hz': 1.0, 'yaw': 0, 'yMin': yF - 1, 'yMax': top_})
    bc = centroid(ring_of(39961))
    yb = yF + 6.0
    g.box('stone', bc[0] - 9.0, bc[0] + 9.0, yF - 1.0, yb, bc[1] - 7.0, bc[1] + 7.0, C('#bdb6a8'))
    decks.append(deck_seg((bc[0] - 8.5, bc[1]), (bc[0] + 8.5, bc[1]), yb, yb, 13.5))
    bx, bz = bc[0] + 3.0, bc[1] - 1.0
    prof = [(1.8, yb), (2.1, yb + 1.0), (2.2, yb + 3.0), (1.6, yb + 6.0), (2.0, yb + 8.5), (2.1, yb + 10.5), (1.7, yb + 12.5), (0.9, yb + 15.0), (0.75, yb + 18.5), (0.85, yb + 19.2), (0.0, yb + 19.4)]
    g.lathe('glassc', bx, bz, prof, C('#3c6b4a'), n=24 if not g.lod else 10)
    g.lathe('paint', bx, bz, [(2.05, yb + 6.8), (2.12, yb + 8.8)], C('#e7e2d2'), n=24 if not g.lod else 10)
    g.lathe('paint', bx, bz, [(0.9, yb + 19.2), (0.95, yb + 19.5), (0.0, yb + 19.6)], C('#c9302a'), n=16)
    if not g.lod:
        d = v2norm(v2sub(HP, (bx, bz))); tt = (-d[1], d[0])
        Ft = ((bx + d[0] * 2.14, bz + d[1] * 2.14), (d[1], -d[0]), d) if False else ((bx + d[0] * 2.14, bz + d[1] * 2.14), (-d[1] * -1, d[0] * -1), d)
        Ft = ((bx + d[0] * 2.14, bz + d[1] * 2.14), (d[1], -d[0]), (d[0], d[1]))
        g.text('paint', Ft, 0, yb + 7.2, 0.0, 'FIZZ', 1.1, C('#c9302a'), depth=0.06)
        for k in range(8):   # slides spiralling round the bottle
            a0_, a1_ = k * 0.8, (k + 1) * 0.8
            g.rod('paint', (bx + math.cos(a0_) * 2.6, yb + 12.0 - k * 1.4, bz + math.sin(a0_) * 2.6), (bx + math.cos(a1_) * 2.6, yb + 12.0 - (k + 1) * 1.4, bz + math.sin(a1_) * 2.6), 0.45,
                  C('#e2b33a'), n=6)
    cols.append({'x': round(bx, 2), 'z': round(bz, 2), 'hx': 2.2, 'hz': 2.2, 'yaw': 0, 'yMin': yF - 1, 'yMax': yb + 19})
    gx, gz = bc[0] - 4.0, bc[1] + 2.0
    g.lathe('leather' if False else 'paint', gx, gz, [(0.0, yb), (3.4, yb + 0.6), (4.0, yb + 2.6), (3.6, yb + 5.2), (2.2, yb + 7.0), (0.0, yb + 7.6)], C('#8a5a2c'), n=16 if not g.lod else 8)
    if not g.lod:
        for k in range(4):
            a = -0.9 + k * 0.55
            g.rod('paint', (gx + math.cos(a) * 1.5, yb + 5.5, gz + math.sin(a) * 1.5), (gx + math.cos(a) * 2.2, yb + 8.4, gz + math.sin(a) * 2.2), 0.75, C('#8a5a2c'), n=8)
        for k in range(12):
            a = 2 * math.pi * k / 12
            g.rod('paint', (gx + math.cos(a) * 3.9, yb + 2.6, gz + math.sin(a) * 3.9), (gx + math.cos(a + 0.5) * 3.9, yb + 2.6, gz + math.sin(a + 0.5) * 3.9), 0.06, C('#3a2a1a'), n=3)
    cols.append({'x': round(gx, 2), 'z': round(gz, 2), 'hx': 3.6, 'hz': 3.6, 'yaw': 0, 'yMin': yF - 1, 'yMax': yb + 8})
    cols.append({'x': round(bc[0], 2), 'z': round(bc[1], 2), 'hx': 9.0, 'hz': 7.0, 'yaw': 0, 'yMin': yF - 2, 'yMax': yb - 0.3})
    noT = [[[round(p[0], 1), round(p[1], 1)] for p in hull(poly_ + [p for i in (39956, 39929) for p in ring_of(i)])]]
    return {'colliders': cols, 'name': 'China Basin Ballpark', 'replaces': 'oraclePark', 'yG': round(yF, 2), 'top': round(yTop + 30, 1), 'decks': decks, 'noTrees': noT, 'near': 700}


def yG_(a, b):
    return min(sidewalk(*a), sidewalk(*b))


# ================================================================================== Chase Center (2019): white ribbon-wrapped arena
CH_HIDE = [49968]


def chase(g):
    r = ring_out(ring_simplify(ring_of(49968), 1.0))
    yG = min(sidewalk(*p) for p in r) + 0.1
    WH = C('#f1f0ec'); GL = C('#2d3a44')
    cols = []
    top = yG + 38.0
    c_ = centroid(r)
    # glazed base
    for ea, eb in ring_edges(r):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        storefront(g, ea, eb, sidewalk, yG + 7.0, 4.0, 'concrete', C('#dcdad4'), glass_slot='shop', lit=0.95, frame_col=C('#2a2a2a'), depth=0.6)
    # stacked white ribbons that flare out as they rise, dark glass between
    NB = 8
    for k in range(NB):
        y0 = yG + 7.0 + k * (top - yG - 9.0) / NB; y1 = y0 + (top - yG - 9.0) / NB
        off0, off1 = 0.3 + 0.55 * k, 0.3 + 0.55 * (k + 1)
        rr0, rr1 = ring_offset(r, off0), ring_offset(r, off1)
        n = len(r)
        for i in range(n):
            j = (i + 1) % n
            A0, B0, A1, B1 = rr0[i], rr0[j], rr1[i], rr1[j]
            en = edge_n(r[i], r[j])
            ym = y0 + (y1 - y0) * 0.55
            g.poly('win', [(A0[0] - en[0] * 0.8, y0, A0[1] - en[1] * 0.8), (B0[0] - en[0] * 0.8, y0, B0[1] - en[1] * 0.8), (B0[0] - en[0] * 0.8, ym, B0[1] - en[1] * 0.8),
                           (A0[0] - en[0] * 0.8, ym, A0[1] - en[1] * 0.8)], glass_col(0.45), (en[0], 0, en[1]))
            Am, Bm = v2lerp(A0, A1, 0.5), v2lerp(B0, B1, 0.5)
            g.poly('paint', [(A0[0], ym, A0[1]), (B0[0], ym, B0[1]), (B1[0], y1, B1[1]), (A1[0], y1, A1[1])], WH, (en[0], 0.3, en[1]))
            g.poly('paint', [(A0[0] - en[0] * 0.8, ym, A0[1] - en[1] * 0.8), (B0[0] - en[0] * 0.8, ym, B0[1] - en[1] * 0.8), (B0[0], ym, B0[1]), (A0[0], ym, A0[1])], shade(WH, 0.8), (0, -1, 0))
            g.poly('paint', [(A1[0], y1, A1[1]), (B1[0], y1, B1[1]), (B1[0] - en[0] * 0.8, y1, B1[1] - en[1] * 0.8), (A1[0] - en[0] * 0.8, y1, A1[1] - en[1] * 0.8)], shade(WH, 0.95), (0, 1, 0))
    rt = ring_offset(r, 0.3 + 0.55 * NB)
    g.lathe('roof', c_[0], c_[1], [(0.0, 0.0)], ROOF) if False else None
    g.poly('roof', [(p[0], top - 1.8, p[1]) for p in ring_offset(r, -0.5)], C('#c9c7c0'), (0, 1, 0))
    g.sweep('paint', rt, [(-0.8, top - 2.0), (0.0, top - 2.0), (0.0, top - 1.6), (-0.8, top - 1.6)], WH) if False else None
    # plaza-facing video screen + name
    e = max(ring_edges(r), key=lambda e: -((v2lerp(*e, 0.5)[0] - c_[0]) * 1.0))
    F = Geo.frame(*edge_facing(r, -0.9, -0.4))
    Le = v2len(v2sub(*edge_facing(r, -0.9, -0.4)))
    g.fbox('neon', F, Le / 2 - 8.0, Le / 2 + 8.0, yG + 9.0, yG + 18.0, 4.0, 4.3, (0.25, 0.35, 0.55, 1.0), top=True, back=True)
    if not g.lod:
        g.text('neon', F, Le / 2, yG + 7.6, 0.8, 'MISSION BAY ARENA', 1.2, (0.95, 0.95, 1.0, 1.0), depth=0.08)
    cols += wall_colliders(r, yG - 3, top)
    return {'colliders': cols, 'name': 'Mission Bay Arena', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ================================================================================== Chinatown: Sing Chong + Sing Fat pagoda towers, Old St. Mary's (1854)
CT2_HIDE = [17331, 17303, 17344]
JADE = C('#3f7d5a'); CRED = C('#a8322a'); CGOLD = C('#d4a53c'); CCREAM = C('#ece2c8')


def pagoda_roof(g, x, z, y, half, over, rise, col, yaw, slot='rooftile'):
    """square roof with sweeping eaves: corners kick up, ridge finial"""
    c, s = math.cos(yaw), math.sin(yaw)
    P = lambda a, b, yy: (x + c * a - s * b, yy, z + s * a + c * b)
    e = half + over
    corners = [(-e, -e), (e, -e), (e, e), (-e, e)]
    for k in range(4):
        (a0, b0), (a1, b1) = corners[k], corners[(k + 1) % 4]
        mid = ((a0 + a1) / 2 * 0.86, (b0 + b1) / 2 * 0.86)
        pts = [P(a0, b0, y + 0.55), P(mid[0], mid[1], y - 0.05), P(a1, b1, y + 0.55), P(0, 0, y + rise)]
        g.poly(slot, [pts[0], pts[1], pts[3]], col, (0, 1, 0), uv=[(0, 2), (2, 2.5), (1, 0)])
        g.poly(slot, [pts[1], pts[2], pts[3]], col, (0, 1, 0), uv=[(2, 2.5), (4, 2), (3, 0)])
        g.poly('paint', [pts[0], pts[1], (pts[1][0], pts[1][1] - 0.25, pts[1][2]), (pts[0][0], pts[0][1] - 0.25, pts[0][2])], CGOLD, None)
        g.poly('paint', [pts[1], pts[2], (pts[2][0], pts[2][1] - 0.25, pts[2][2]), (pts[1][0], pts[1][1] - 0.25, pts[1][2])], CGOLD, None)
        g.poly('paint', [(p[0], p[1] - 0.25, p[2]) for p in (pts[0], pts[1], pts[2])] + [(x, y + 0.1, z)], shade(CRED, 0.6), (0, -1, 0))
    g.lathe('gold', x, z, [(0.35, y + rise - 0.1), (0.25, y + rise + 0.6), (0.4, y + rise + 0.9), (0.0, y + rise + 2.2)], CGOLD, n=8)


def pagoda_tower(g, x, z, y0, tiers, half, yaw, wall=CRED):
    c, s = math.cos(yaw), math.sin(yaw)
    y = y0
    for k in range(tiers):
        h = 3.4 - 0.3 * k; hf = half * (1 - 0.1 * k)
        Fs = []
        for r_ in range(4):
            ang = yaw + r_ * math.pi / 2
            t = (math.cos(ang), math.sin(ang)); n = (-t[1], t[0])
            o = (x - t[0] * hf + n[0] * -hf * -1, z - t[1] * hf + n[1] * hf)
            o = (x - t[0] * hf - n[0] * -hf, z - t[1] * hf - n[1] * -hf)
            o = (x + (-t[0] + n[0]) * hf, z + (-t[1] + n[1]) * hf)
            F = (o, t, n)
            hole = arch_pts(hf, hf * 0.9, y + 0.6, y + h - 1.0 - hf * 0.45, 8 if not g.lod else 3)
            radial_panel(g, 'paint', F, 0, 2 * hf, y, y + h, hole, wall)
            recess(g, F, hole, 0.25, 'paint', shade(wall, 0.8), 'win', glass_col(0.6))
            if not g.lod:
                for uu in (0.15, 2 * hf - 0.15): g.fbox('paint', F, uu - 0.15, uu + 0.15, y, y + h, 0, 0.18, CGOLD, top=False)
                g.fbox('paint', F, 0, 2 * hf, y + 0.5, y + 0.62, 0, 0.7, JADE, top=True, bottom=True)
                for k2 in range(int(2 * hf / 0.3)):
                    g.fbox('paint', F, k2 * 0.3 + 0.05, k2 * 0.3 + 0.1, y + 0.62, y + 1.4, 0.6, 0.66, JADE, top=True)
        y += h
        pagoda_roof(g, x, z, y, hf, 1.6 - 0.15 * k, 1.4 if k < tiers - 1 else 3.2, JADE, yaw)
        y += 1.0
    return y


def chinatown(g):
    cols = []
    # Sing Chong (NW corner) + Sing Fat (SW corner): 3-storey red + cream blocks, green balconies, corner pagodas
    corner = (1183.0, -1947.0)
    for i, (tiers, wall) in ((17331, (3, CRED)), (17303, (2, CRED))):
        r = ring_simplify(ring_of(i), 0.4)
        yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
        top = yG + 13.0
        for ea, eb in ring_edges(r):
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            nt = neighbour_top(ea, eb, set(CT2_HIDE))
            if nt is not None and nt > yG + 4:
                radial_panel(g, 'stucco', F, 0, Le, yG - 3, top, None, C('#b8ab94')); continue
            storefront(g, ea, eb, sidewalk, yG + 4.2, 3.2, 'paint', shade(CRED, 0.9), glass_slot='shop', lit=0.95, frame_col=C('#1e1a16'), awning=JADE if Le > 8 else None)
            facade(g, ea, eb, yG + 4.2, top, 4.3, 2.9, Win(w=1.4, sill=0.8, head=3.0, depth=0.3, lit=0.55, frame_col=JADE), 'stucco', CCREAM, margin=0.6,
                   band=(0.25, 0.1, CRED))
            if not g.lod:
                for yy in (yG + 4.4, yG + 8.7):     # green balconies
                    g.fbox('paint', F, 0.4, Le - 0.4, yy, yy + 0.15, 0, 1.0, JADE, top=True, bottom=True)
                    g.fbox('paint', F, 0.4, Le - 0.4, yy + 0.95, yy + 1.05, 0.9, 1.0, JADE, top=True, bottom=True)
                    for k in range(int((Le - 0.8) / 0.35)):
                        uu = 0.5 + k * 0.35
                        g.fbox('paint', F, uu - 0.03, uu + 0.03, yy + 0.15, yy + 0.95, 0.92, 0.98, JADE, top=False)
        g.sweep('paint', r, [(0, top), (1.0, top + 0.3), (1.0, top + 0.7), (0, top + 0.8)], JADE)
        g.poly('roof', [(p[0], top + 0.4, p[1]) for p in ring_offset(ring_out(r), -0.3)], ROOF, (0, 1, 0))
        # the pagoda tower over the corner nearest Grant & California
        rr = ring_out(r)
        pc = min(rr, key=lambda p: v2len(v2sub(p, corner)))
        e = max(ring_edges(r), key=lambda e: v2len(v2sub(e[1], e[0])))
        yaw = math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0])
        inward = v2norm(v2sub(centroid(rr), pc))
        tc = v2add(pc, v2mul(inward, 3.6))
        ytop = pagoda_tower(g, tc[0], tc[1], top + 0.4, tiers, 2.8, yaw)
        cols += wall_colliders(r, yG - 3, top)
    # Old St. Mary's: red-brick Gothic nave along Grant, the square clock tower on the California / Grant corner
    r = ring_simplify(ring_of(17344), 0.5)
    rr = ring_out(r)
    yG = min(sidewalk(*p) for p in rr) + 0.1
    sw = min(rr, key=lambda p: v2len(v2sub(p, (1185.0, -1962.0))))
    u = v2norm((0.16, -0.99))                      # north along Grant
    L = Loc(sw, u); v = L.v                          # b > 0 = east (into the block)? v = (-u.z, u.x)
    sgn = 1 if (centroid(rr)[0] - sw[0]) * L.v[0] + (centroid(rr)[1] - sw[1]) * L.v[1] > 0 else -1
    q = [L.loc(*p) for p in rr]
    amax = max(x[0] for x in q)
    NW_ = 19.0
    b0, b1 = (0.0, NW_) if sgn > 0 else (-NW_, 0.0)
    BR = C('#8e3f30'); GRN = C('#b9b2a4')
    nave = L.ring([(0.0, b0), (amax - 2.0, b0), (amax - 2.0, b1), (0.0, b1)])
    for ea, eb in ring_edges(nave):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        nt = neighbour_top(ea, eb, set(CT2_HIDE))
        g.fbox('granite', F, 0, Le, yG - 3, yG + 1.2, 0, 0.3, GRN, top=True)
        if Le > 12 and nt is None:
            gothic_bays(g, F, 0, Le, yG + 1.2, yG + 13.0, 5.5, 2.0, 2.0, 7.5, BR, slot='brickred', pier_d=0.7, pier_w=0.9)
        else:
            radial_panel(g, 'brickred', F, 0, Le, yG + 1.2, yG + 13.0, None, BR)
    gable(g, L, 6.0, amax - 2.0, b0, b1, yG + 13.0, 7.0, col=C('#4e4f55'), slot='roof', over=0.4, end_col=BR, end_slot='brickred')
    # the rest of the footprint: parish hall (plain brick, 2 storeys)
    rest = [p for p in rr]
    for ea, eb in ring_edges(r):
        n = edge_n(ea, eb); m = v2lerp(ea, eb, 0.5); lm = L.loc(*m)
        if (b0 - 0.5) < lm[1] < (b1 + 0.5): continue
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if neighbour_top(ea, eb, set(CT2_HIDE)) is not None: radial_panel(g, 'brickred', F, 0, Le, yG - 3, yG + 9.0, None, BR); continue
        facade(g, ea, eb, yG - 3, yG + 9.0, 4.5, 3.2, Win(w=1.3, sill=4.0, head=6.3, arch=1, depth=0.3, lit=0.4), 'brickred', BR, margin=0.8)
    g.poly('roof', [(p[0], yG + 9.0, p[1]) for p in ring_offset(rr, -0.3)], ROOF, (0, 1, 0))
    # tower: square brick shaft, granite base, clock stage with the four dials + the motto, pyramidal cap
    T = 7.2
    tb0, tb1 = (b0, b0 + T) if sgn > 0 else (b1 - T, b1)
    sq = L.ring([(0.0, tb0), (T, tb0), (T, tb1), (0.0, tb1)])
    yt = yG + 27.0
    for ea, eb in ring_edges(sq):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        g.fbox('granite', F, 0, Le, yG - 3, yG + 2.0, 0, 0.35, GRN, top=True)
        hs = [arch_pts(Le / 2, 1.3, yG + 9.0, yG + 12.0, 8, pointed=True), arch_pts(Le / 2, 1.8, yG + 20.5, yG + 24.0, 8, pointed=True)]
        window_holes(g, F, 0, Le, yG + 2.0, yt, hs, BR, 'brickred', depth=0.5, lit=0.3)
        n_ = 24
        cyc = yG + 16.5
        g.poly('lamp', [Geo.fp(F, Le / 2 + math.cos(2 * math.pi * k / n_) * 1.6, cyc + math.sin(2 * math.pi * k / n_) * 1.6, 0.1) for k in range(n_)], (1.0, 0.96, 0.85, 1.0),
               (F[2][0], 0, F[2][1]))
        if not g.lod:
            g.rod('metal', Geo.fp(F, Le / 2, cyc, 0.14), Geo.fp(F, Le / 2 + 0.8, cyc + 0.6, 0.14), 0.05, C('#1a1a1a'), n=3)
            g.rod('metal', Geo.fp(F, Le / 2, cyc, 0.16), Geo.fp(F, Le / 2 - 0.2, cyc + 1.3, 0.16), 0.04, C('#1a1a1a'), n=3)
            for uu in (0.35, Le - 0.35): g.fbox('brickred', F, uu - 0.35, uu + 0.35, yG + 2.0, yt, 0, 0.45, shade(BR, 1.05), top=True)
    Ftx = Geo.frame(*edge_facing(sq, -L.u[0], -L.u[1]))
    if not g.lod:
        g.text('granite', Ftx, v2len(v2sub(*edge_facing(sq, -L.u[0], -L.u[1]))) / 2, yG + 13.8, 0.06, 'SON OBSERVE THE TIME', 0.34, C('#e9e2d0'), depth=0.03)
        g.text('granite', Ftx, v2len(v2sub(*edge_facing(sq, -L.u[0], -L.u[1]))) / 2, yG + 13.3, 0.06, 'AND FLY FROM EVIL', 0.34, C('#e9e2d0'), depth=0.03)
    g.sweep('granite', sq, [(0, yt), (0.4, yt + 0.3), (0.4, yt + 0.8), (0, yt + 0.9)], GRN)
    tcx, tcz = centroid(sq)
    g.lathe('roof', tcx, tcz, [(T * 0.7, yt + 0.9), (0.2, yt + 7.5), (0.0, yt + 7.8)], C('#4e4f55'), n=4, a0=math.atan2(L.u[1], L.u[0]) + math.pi / 4)
    for p in sq:
        pinnacle(g, p[0], p[1], yt + 0.9, 3.0, 0.4, BR, slot='brickred')
    cross(g, tcx, tcz, yt + 7.8, 1.6, GOLD, yaw_t=L.u, r=0.07)
    cols += wall_colliders(r, yG - 3, yG + 13)
    return {'colliders': cols, 'name': 'Chinatown: Sing Chong, Sing Fat, Old St. Mary\'s', 'yG': round(yG, 2), 'top': round(yt + 10, 1)}


BUILDERS = {
    'castro': (castro, CASTRO_HIDE),
    'missionDolores': (mission_dolores, MD_HIDE),
    'ssPeterPaul': (sspp, SSPP_HIDE),
    'columbusTower': (columbus_tower, CT_HIDE),
    'grace': (grace, GRACE_HIDE),
    'fairmont': (fairmont, FAIR_HIDE),
    'markHopkins': (mark_hopkins, MH_HIDE),
    'paintedLadies': (painted_ladies, PL_HIDE),
    'pofa': (pofa, POFA_HIDE),
    'deYoung': (de_young, DY_HIDE),
    'academy': (academy, AC_HIDE),
    'conservatory': (conservatory, CF_HIDE),
    'legion': (legion, LEG_HIDE),
    'oracle': (oracle, OP_HIDE),
    'chase': (chase, CH_HIDE),
    'chinatown': (chinatown, CT2_HIDE),
}
ORIGINS = {'columbusTower': lambda: origin_for([ct_ring()]), 'deYoung': lambda: _dy_origin()}


def _dy_origin():
    L = dy_frame()
    return origin_for([L.ring([(-138.0, -10.0), (12.0, -10.0), (12.0, 70.0), (-138.0, 70.0)])])


def no_trees_wrap(fn, hide):
    """every wave-4 site keeps generic street trees off its own (hidden) footprints, on top of any plaza zones"""
    def w(g):
        m = fn(g) or {}
        pts = [p for i in hide for p in ring_of(i)]
        if len(pts) >= 3:
            h_ = ring_out(hull(pts))
            zone = [[round(p[0], 1), round(p[1], 1)] for p in ring_offset(h_, 2.5)]
            m['noTrees'] = (m.get('noTrees') or []) + [zone]
        return m
    return w


def main():
    ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = ORIGINS[bid]() if bid in ORIGINS else origin_for([ring_of(i) for i in hide])
        run_building(bid, no_trees_wrap(fn, hide), hide, O)


if __name__ == '__main__':
    main()
