"""HILLBOMB hero landmarks, wave 5 (waterfront + icons).

Run:  tools/.venv-blender/Scripts/python.exe tools/blender/hero_wave5.py -- fortPoint ggPlaza alcatraz ...
Same pipeline as waves 1-4 (hero_lib.run_building: LOD0/LOD1, Cycles vertex AO, Draco GLB, _cache/hero/<id>.json).
Sites without OSM footprints (Fort Point, ships, piers) pass hide=[] and a custom origin (ORIGINS).
Golden Gate frame: same axis as src/world/v2/anchors2.js GG2 (s = metres north of the south tower, l = lateral east).
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_lib import *   # noqa
from hero_wave1 import (ring_edges, sidewalk, origin_for, palm, vbay, GOLD, BRONZE)   # noqa
from hero_wave2 import (Loc, hull, deck_seg, rect_decks, ext_stairs, broadleaf, conifer, outline)   # noqa
from hero_wave3 import (column, balustrade, arcade_wall, dome)   # noqa
from hero_wave4 import (TILE, gable, hip, slab_profile, window_holes, pinnacle, no_trees_wrap)   # noqa

GG_O = (-5153.8, -4346.0); GG_D = v2norm((-0.0918, -0.9958))
BRICK5 = C('#9a5a44'); BRICK5_D = C('#7b4535'); GRAN5 = C('#b9b3a6'); GRAN5_D = C('#9e978b'); IRON = C('#2c2f31')
CREAM5 = C('#ece3cf'); CREAM5_D = C('#d6cab1'); ORANGE5 = C('#c0432c'); WHITE5 = C('#f1efe9'); WOOD5 = C('#6b4a33')


def gp(s, l):
    """Golden Gate axis point (s north of the south tower, l lateral east) -> world (x, z)"""
    return (GG_O[0] + GG_D[0] * s - GG_D[1] * l, GG_O[1] + GG_D[1] * s + GG_D[0] * l)


def edges_of(r):
    r = ring_out(r)
    return [(r[i], r[(i + 1) % len(r)]) for i in range(len(r))]


def ring_quads(g, slot, A, B, y, col, n=(0, 1, 0)):
    """band between two rings with matching vertices (outer A, inner B) at height y (or per-ring (ya, yb))"""
    ya, yb = (y, y) if not isinstance(y, tuple) else y
    for i in range(len(A)):
        j = (i + 1) % len(A)
        g.poly(slot, [(A[i][0], ya, A[i][1]), (A[j][0], ya, A[j][1]), (B[j][0], yb, B[j][1]), (B[i][0], yb, B[i][1])], col, n)


def rail_line(g, a, b, y, h=1.05, col=IRON, post=1.6, slot='metal', r=0.035):
    """iron railing a->b (x, z) at base y: posts + top rail + mid rail"""
    L = v2len(v2sub(b, a))
    if L < 0.2: return
    n = max(1, int(L / post))
    for k in range(n + 1):
        p = v2lerp(a, b, k / n)
        g.box(slot, p[0] - r, p[0] + r, y, y + h, p[1] - r, p[1] + r, col)
    g.rod(slot, (a[0], y + h, a[1]), (b[0], y + h, b[1]), r * 1.3, col, n=4)
    if not g.lod: g.rod(slot, (a[0], y + h * 0.5, a[1]), (b[0], y + h * 0.5, b[1]), r, col, n=4)


def flag(g, x, z, y, h, col=C('#23407a'), stripe=C('#b3202e'), yaw_t=(1.0, 0.0)):
    g.cyl('metal', x, z, 0.08, y, y + h, C('#dcdcdc'), n=6)
    g.cyl('gold', x, z, 0.14, y + h, y + h + 0.25, GOLD, n=6)
    F = ((x, z), yaw_t, (-yaw_t[1], yaw_t[0]))
    for k in range(5):
        g.fbox('fabric', F, 0.12, 2.9, y + h - 1.9 + k * 0.34, y + h - 1.9 + (k + 1) * 0.34, -0.02, 0.02, stripe if k % 2 == 0 else WHITE5, top=False, back=True)
    g.fbox('fabric', F, 0.12, 1.3, y + h - 1.9 + 0.85, y + h - 0.2, -0.03, 0.03, col, top=False, back=True)


def cannon(g, x, z, y, yaw_t, L=3.6, r=0.3):
    """muzzle-loading gun on a wooden carriage, barrel pointing along yaw_t"""
    t = yaw_t; n = (-t[1], t[0])
    F = ((x - t[0] * 1.2 - n[0] * 0.55, z - t[1] * 1.2 - n[1] * 0.55), t, n)
    g.fbox('wood', F, 0, 2.6, y, y + 0.55, 0, 1.1, WOOD5, top=True, back=True)
    for s in (0.08, 0.92):
        g.fbox('wood', F, 0.2, 2.2, y + 0.55, y + 0.95, s * 1.1 - 0.1, s * 1.1 + 0.1, shade(WOOD5, 0.9), top=True, back=True)
    b0 = (x - t[0] * 1.0, y + 1.05, z - t[1] * 1.0); b1 = (x + t[0] * (L - 1.0), y + 1.05, z + t[1] * (L - 1.0))
    g.rod('metal', b0, b1, r, IRON, n=10 if not g.lod else 5)
    g.rod('metal', (b0[0] - t[0] * 0.35, b0[1], b0[2] - t[1] * 0.35), b0, r * 1.35, IRON, n=10 if not g.lod else 5)


# ================================================================================== Fort Point (1861) under the arch
FP_PLAN = [(-31.0, 25.0), (31.0, 25.0), (31.0, -6.0), (17.0, -29.0), (-17.0, -29.0), (-31.0, -6.0)]   # (a east, b south)
FP_COURT = 10.5


def fp_frame():
    return Loc(gp(-413.0, 14.0), (-GG_D[1], GG_D[0]))      # a = lateral east, b = south


def fp_geom():
    L = fp_frame()
    outer = ring_out(L.ring(FP_PLAN))
    court = ring_offset(outer, -FP_COURT)
    yG = min(H(*v2lerp(a, b, s / 6)) for a, b in edges_of(outer) for s in range(7))
    xs = [p[0] for p in court]; zs = [p[1] for p in court]
    hs = [H(*p) for p in court]
    for i in range(12):
        for j in range(12):
            p = (min(xs) + (max(xs) - min(xs)) * i / 11, min(zs) + (max(zs) - min(zs)) * j / 11)
            if point_in(court, *p): hs.append(H(*p))
    y0 = max(max(hs) + 0.15, 4.2)
    ys = [y0, y0 + 4.6, y0 + 9.0, y0 + 13.2]            # casemate tiers 1-3 + barbette floor
    return L, outer, court, yG, ys


def fp_gorge(edges, L):
    """index of the gorge (landward, south) edge"""
    return max(range(len(edges)), key=lambda i: L.loc(*v2lerp(edges[i][0], edges[i][1], 0.5))[1])


def fort_point(g):
    L, outer, court, yG, ys = fp_geom()
    y0, y1, y2, y3 = ys; ytop = y3 + 1.6
    lod = g.lod
    E = edges_of(outer); gi = fp_gorge(E, L)
    emb = Win(w=0.75, sill=1.5, head=2.5, depth=1.3, glass='plain', lit=0.0, mull=False, hood=0.22, sill_out=0.1)
    bar = Win(w=1.05, sill=0.95, head=2.45, depth=0.35, arch=2, glass='win', lit=0.2, mull=True, hood=0.0, sill_out=0.08, keystone=True)
    for i, (a, b) in enumerate(E):
        F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
        # granite footing + battered sea wall
        g.fbox('granite', F, -0.6, Le + 0.6, yG - 3.0, y0 + 0.8, -0.2, 0.55, GRAN5_D, top=True)
        if i != gi and not lod:
            g.fbox('granite', F, -1.2, Le + 1.2, yG - 3.0, yG + 0.35, 0.55, 2.6, shade(GRAN5_D, 0.92), top=True)
        if i == gi:
            um = Le / 2
            facade(g, a, v2lerp(a, b, (um - 3.4) / Le), y0, y3, 3.3, 3.5, bar, 'brickred', BRICK5, margin=1.4, band=(0.18, 0.08, GRAN5))
            facade(g, v2lerp(a, b, (um + 3.4) / Le), b, y0, y3, 3.3, 3.5, bar, 'brickred', BRICK5, margin=1.4, band=(0.18, 0.08, GRAN5))
            # sally port: granite frame, round arch, heavy timber doors (the interior door is here)
            hole = opening_poly(um, 3.2, y0 - 0.2, y0 + 4.4, 1, 12 if not lod else 5)
            radial_panel(g, 'granite', F, um - 3.4, um + 3.4, y0 - 0.2, y3, hole, GRAN5)
            recess(g, F, hole, 2.2, 'granite', GRAN5_D, 'wood', C('#4a3322'))
            g.fbox('granite', F, um - 3.1, um + 3.1, y0 + 4.9, y0 + 5.5, 0, 0.3, GRAN5, top=True, bottom=True)
            if not lod:
                for k in range(9):   # voussoirs
                    a_ = math.pi * (k + 0.5) / 9
                    cu, cv = um + math.cos(a_) * 2.05, y0 + 2.8 + math.sin(a_) * 2.05
                    g.fbox('granite', F, cu - 0.2, cu + 0.2, cv - 0.25, cv + 0.25, 0, 0.12, shade(GRAN5, 1.04), top=True, bottom=True)
                g.text('stone', F, um, y0 + 5.0, 0.3, 'FORT POINT', 0.42, C('#3b3630'), depth=0.04, spacing=1.25)
        else:
            facade(g, a, b, y0, y3, 4.4, 4.9, emb, 'brickred', BRICK5, margin=2.0)
        # string course, parapet brick, granite coping
        g.fbox('granite', F, 0, Le, y3 - 0.35, y3 + 0.05, 0, 0.22, GRAN5, top=True, bottom=True)
        radial_panel(g, 'brickred', F, 0, Le, y3, ytop, None, BRICK5_D)
        g.fbox('granite', F, -0.15, Le + 0.15, ytop, ytop + 0.3, -1.3, 0.12, GRAN5, top=True, bottom=True)
        # granite quoins at the corners
        if not lod:
            for k in range(int((y3 - y0) / 0.7)):
                w_ = 0.9 if k % 2 else 0.55
                g.fbox('granite', F, 0, w_, y0 + k * 0.7, y0 + (k + 1) * 0.7 - 0.04, 0, 0.06, GRAN5, top=True, bottom=True)
    # barbette terrace + inner parapet face
    inner = ring_offset(outer, -1.15)
    ring_quads(g, 'paving', inner, court, y3 + 0.02, C('#a09a8e'))
    for a, b in edges_of(inner):
        n = edge_n(a, b)
        g.poly('brickred', [(a[0], y3, a[1]), (b[0], y3, b[1]), (b[0], ytop, b[1]), (a[0], ytop, a[1])], shade(BRICK5_D, 0.9), (-n[0], 0, -n[1]))
    # ---------------------------------------------------------------- courtyard (seen from the deck; the walk-in is the interior)
    CE = edges_of(court)
    cgi = fp_gorge(CE, L)
    for i, (a, b) in enumerate(CE):
        F = Geo.frame(b, a); Le = v2len(v2sub(b, a))          # reversed: faces into the court
        if i == cgi:
            facade(g, b, a, y0, y3, 3.3, 3.5, bar, 'brickred', BRICK5, margin=1.0)
            if not lod:
                for yk in (y0 + 3.3, y0 + 6.6, y0 + 9.9):   # iron galleries on the barracks
                    g.fbox('metal', F, 0.5, Le - 0.5, yk - 0.12, yk + 0.06, 0, 1.5, IRON, top=True, bottom=True)
                    g.fbox('metal', F, 0.5, Le - 0.5, yk + 1.0, yk + 1.06, 1.45, 1.5, IRON, top=True, bottom=True)
                    for k in range(int(Le / 1.6)):
                        g.fbox('metal', F, 0.5 + k * 1.6, 0.54 + k * 1.6, yk, yk + 1.0, 1.45, 1.5, IRON, top=False)
        else:
            nb = max(1, int(Le / 4.9)); bw = Le / nb
            for k, (ya_, yb_) in enumerate(((y0, y1), (y1, y2), (y2, y3))):
                for j in range(nb):
                    uc = (j + 0.5) * bw; w = min(3.1, bw - 1.2)
                    hole = opening_poly(uc, w, ya_ + (0.0 if k == 0 else 0.9), yb_ - 0.55, 1, 10 if not lod else 4)
                    radial_panel(g, 'brickred', F, j * bw, (j + 1) * bw, ya_, yb_, hole, BRICK5)
                    if lod: g.poly('plain', [Geo.fp(F, u, v, -0.05) for u, v in hole], C('#1d1714'), (F[2][0], 0, F[2][1]))
                    else: recess(g, F, hole, 2.4, 'brickred', BRICK5_D, 'plain', C('#241b16'))
                g.fbox('granite', F, 0, Le, yb_ - 0.28, yb_, 0, 0.12, GRAN5, top=True, bottom=True)
        g.fbox('brickred', F, 0, Le, y3, y3 + 1.0, -0.4, 0.0, BRICK5_D, top=True, back=True)   # court parapet
    g.poly('concrete', [(p[0], y0, p[1]) for p in court], C('#b3aa9b'), (0, 1, 0))
    # stair towers at the gorge corners of the court (granite spiral stairs), rising above the terrace
    ga, gb = CE[cgi]
    for p, q in ((ga, gb), (gb, ga)):
        t = v2norm(v2sub(q, p)); nrm = edge_n(ga, gb)
        c = v2add(v2add(p, v2mul(t, 2.2)), v2mul(nrm, 2.4))
        g.box('granite', c[0] - 2.2, c[0] + 2.2, y3, y3 + 3.4, c[1] - 2.2, c[1] + 2.2, GRAN5, yaw=L.yaw())
        g.box('granite', c[0] - 2.5, c[0] + 2.5, y3 + 3.4, y3 + 3.75, c[1] - 2.5, c[1] + 2.5, GRAN5_D, yaw=L.yaw())
    # lighthouse (1864 iron tower) on the NW barbette
    nw = min(outer, key=lambda p: L.loc(*p)[0] + L.loc(*p)[1] * 1.2)
    lc = v2lerp(nw, min(court, key=lambda p: L.loc(*p)[0] + L.loc(*p)[1] * 1.2), 0.45)
    yl = y3 + 0.02
    g.lathe('paint', lc[0], lc[1], [(1.7, yl), (1.35, yl + 6.2)], WHITE5, n=6, cap_top=True)
    g.lathe('metal', lc[0], lc[1], [(1.9, yl + 6.2), (1.9, yl + 6.4), (0.0, yl + 6.4)], IRON, n=12)
    for k in range(12 if not lod else 0):
        a_ = 2 * math.pi * k / 12
        g.box('metal', lc[0] + math.cos(a_) * 1.85 - 0.03, lc[0] + math.cos(a_) * 1.85 + 0.03, yl + 6.4, yl + 7.3, lc[1] + math.sin(a_) * 1.85 - 0.03, lc[1] + math.sin(a_) * 1.85 + 0.03, IRON)
    g.lathe('glassc', lc[0], lc[1], [(0.95, yl + 6.4), (0.95, yl + 7.9)], C('#9fb3b8'), n=8)
    g.lathe('lamp', lc[0], lc[1], [(0.35, yl + 6.7), (0.35, yl + 7.5), (0.0, yl + 7.5)], (1.0, 0.92, 0.7, 1.0), n=8)
    g.lathe('metal', lc[0], lc[1], [(1.05, yl + 7.9), (0.6, yl + 8.6), (0.12, yl + 8.9), (0.0, yl + 9.3)], IRON, n=8)
    # barbette guns on the seaward faces, flag over the gorge
    if not lod:
        for i, (a, b) in enumerate(edges_of(ring_offset(outer, -4.5))):
            if i == gi: continue
            Le = v2len(v2sub(b, a)); n = edge_n(a, b)
            for k in range(max(1, int(Le / 11))):
                p = v2lerp(a, b, (k + 0.5) / max(1, int(Le / 11)))
                if v2len(v2sub(p, lc)) < 5: continue
                cannon(g, p[0], p[1], y3 + 0.02, n)
    ga_, gb_ = E[gi]
    fpnt = v2add(v2lerp(ga_, gb_, 0.5), v2mul(edge_n(ga_, gb_), -0.6))
    flag(g, fpnt[0], fpnt[1], ytop + 0.3, 12.0, yaw_t=v2norm(v2sub(gb_, ga_)))
    cols = wall_colliders(outer, yG - 3, ytop + 0.3)
    zone = [[round(p[0], 1), round(p[1], 1)] for p in ring_offset(outer, 22.0)]
    return {'colliders': cols, 'name': 'Fort Point', 'yG': round(y0, 2), 'top': round(ytop + 12, 1), 'noTrees': [zone]}


# ================================================================================== Golden Gate toll plaza, Round House, welcome pavilion
GGP_HIDE = [1741, 1742, 2062, 1760, 1761, 1771, 2051, 2052, 2053, 2061]
GGP_BOOTHS = [1760, 1761, 1771, 2051, 2052, 2053, 2061]


def gg_plaza(g):
    lod = g.lod
    cols = []
    # ---------------------------------------------------------------- toll canopy + booths
    cr = ring_out(ring_of(2062))
    cr = ring_simplify(cr, 0.8)
    yb = min(H(*p) for p in cr) + 0.05
    ytop = max(H(*p) for p in cr) + 5.4
    # canopy: long flat slab with a stepped fascia (Art Deco), lit soffit
    slab = ring_offset(cr, 0.6)
    g.prism('stucco', slab, ytop, ytop + 0.55, CREAM5, top=True, bottom=True)
    g.sweep('paint', slab, [(0.02, ytop + 0.55), (0.02, ytop + 1.0), (0.02, ytop + 1.12), (0.02, ytop + 1.25), (-0.25, ytop + 1.25)], CREAM5,
            cols=[CREAM5, ORANGE5, CREAM5, CREAM5_D])
    g.sweep('stucco', slab, [(0.02, ytop - 0.25), (0.02, ytop)], CREAM5_D)
    if not lod:
        c0 = centroid(slab)
        for a, b in edges_of(ring_offset(slab, -1.4)):
            Le = v2len(v2sub(b, a))
            for k in range(int(Le / 2.6)):
                p = v2lerp(a, b, (k + 0.5) / int(Le / 2.6))
                g.box('lamp', p[0] - 0.5, p[0] + 0.5, ytop - 0.06, ytop, p[1] - 0.2, p[1] + 0.2, (1.0, 0.93, 0.8, 1.0))
    long_e = max(edges_of(cr), key=lambda e: v2len(v2sub(e[1], e[0])))
    for a, b in sorted(edges_of(cr), key=lambda e: -v2len(v2sub(e[1], e[0])))[:2]:     # fascia signs, both long faces
        F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
        if lod: continue
        g.text('neon', F, Le / 2, ytop + 0.62, 0.64, 'GOLDEN GATE BRIDGE', 0.46, (1.0, 0.88, 0.62, 1.0), depth=0.05, spacing=1.2)
    for i in GGP_BOOTHS:
        r = ring_out(ring_of(i))
        c = centroid(r)
        e = max(edges_of(r), key=lambda e: v2len(v2sub(e[1], e[0])))
        t = v2norm(v2sub(e[1], e[0])); Lb = max(abs((p[0] - c[0]) * t[0] + (p[1] - c[1]) * t[1]) for p in r) * 2
        Lb = min(max(Lb, 4.0), 7.0)
        Lo = Loc(c, t)
        yk = H(*c) + 0.05
        Lo.box(g, 'concrete', -Lb / 2 - 0.8, Lb / 2 + 0.8, -0.85, 0.85, yk - 0.4, yk + 0.25, C('#c9c4b8'))        # island curb
        Lo.box(g, 'paint', -Lb / 2 - 0.9, -Lb / 2 - 0.5, -0.4, 0.4, yk + 0.25, yk + 1.0, C('#e2b233'))          # bollard nose
        Lo.box(g, 'stucco', -1.35, 1.35, -0.7, 0.7, yk + 0.25, yk + 1.15, CREAM5)
        if lod:
            Lo.box(g, 'shop', -1.3, 1.3, -0.66, 0.66, yk + 1.15, yk + 2.5, (1.0, 0.9, 0.7, 1.0))
        else:
            for s in (-1, 1):
                F = Lo.F(0, s * 0.7, 0 if s < 0 else 2)
                g.fbox('shop', F, -1.3, 1.3, yk + 1.15, yk + 2.5, -0.02, 0.0, (1.0, 0.9, 0.7, 1.0), top=False)
            for s in (-1, 1):
                F = Lo.F(s * 1.35, 0, 1 if s > 0 else 3)
                g.fbox('shop', F, -0.66, 0.66, yk + 1.15, yk + 2.5, -0.02, 0.0, (1.0, 0.9, 0.7, 1.0), top=False)
            for ua in (-1.33, 1.33):
                for wb in (-0.68, 0.68):
                    x, z = Lo.xz(ua, wb); g.box('metal', x - 0.05, x + 0.05, yk + 1.15, yk + 2.5, z - 0.05, z + 0.05, C('#7a7d80'))
        Lo.box(g, 'paint', -1.6, 1.6, -0.95, 0.95, yk + 2.5, yk + 2.8, ORANGE5)
        Lo.box(g, 'stucco', -1.2, 1.2, -0.6, 0.6, yk + 2.8, yk + 3.1, CREAM5_D)
        # canopy column on the island
        x, z = Lo.xz(Lb / 2 - 0.2, 0)
        g.box('paint', x - 0.25, x + 0.25, yk + 0.25, ytop, z - 0.25, z + 0.25, CREAM5_D, yaw=Lo.yaw())
        if not lod:   # lane signal (steady green, no flashing)
            px, pz = Lo.xz(Lb / 2 - 0.2, 0.3)
            g.box('lamp', px - 0.12, px + 0.12, ytop - 0.9, ytop - 0.5, pz - 0.12, pz + 0.12, (0.25, 1.0, 0.45, 1.0))
        cols.append(Lo.col(-Lb / 2 - 0.9, Lb / 2 + 0.8, -0.85, 0.85, yk - 1, yk + 3.1))
    # ---------------------------------------------------------------- Round House (1938 Art Deco rotunda)
    rr = ring_out(ring_of(1741)); rc = centroid(rr)
    R = sum(v2len(v2sub(p, rc)) for p in rr) / len(rr)
    yR = min(H(*p) for p in rr) + 0.1
    N = 40 if not lod else 16
    g.lathe('granite', rc[0], rc[1], [(R + 0.3, yR - 2.0), (R + 0.3, yR + 0.5), (R, yR + 0.5)], GRAN5, n=N)
    g.lathe('stucco', rc[0], rc[1], [(R, yR + 0.5), (R, yR + 1.1)], CREAM5, n=N)
    if lod:
        g.lathe('shop', rc[0], rc[1], [(R - 0.1, yR + 1.1), (R - 0.1, yR + 3.6)], (1.0, 0.86, 0.62, 1.0), n=N)
    else:
        g.lathe('shop', rc[0], rc[1], [(R - 0.25, yR + 1.1), (R - 0.25, yR + 3.6)], (1.0, 0.86, 0.62, 1.0), n=N)
        for k in range(32):
            a_ = 2 * math.pi * k / 32
            x, z = rc[0] + math.cos(a_) * (R - 0.1), rc[1] + math.sin(a_) * (R - 0.1)
            g.box('metal', x - 0.07, x + 0.07, yR + 1.1, yR + 3.6, z - 0.07, z + 0.07, C('#39403f'))
        g.lathe('metal', rc[0], rc[1], [(R - 0.05, yR + 2.9), (R - 0.05, yR + 2.98)], C('#39403f'), n=N)
    g.lathe('stucco', rc[0], rc[1], [(R, yR + 3.6), (R, yR + 5.0), (R + 0.7, yR + 5.0), (R + 0.7, yR + 5.35), (0.0, yR + 5.35)], CREAM5, n=N)
    if not lod:
        for yy in (yR + 3.95, yR + 4.35, yR + 4.75):
            g.lathe('stucco', rc[0], rc[1], [(R + 0.06, yy), (R + 0.06, yy + 0.12)], CREAM5_D, n=N)
    g.lathe('stucco', rc[0], rc[1], [(R * 0.45, yR + 5.35), (R * 0.45, yR + 6.3), (R * 0.45 + 0.3, yR + 6.3), (R * 0.45 + 0.3, yR + 6.5), (0.0, yR + 6.5)], CREAM5_D, n=N // 2)
    # entrance canopy + sign facing the plaza (south-east)
    to_pl = v2norm(v2sub(centroid(cr), rc)); tt = (-to_pl[1], to_pl[0])
    ec = v2add(rc, v2mul(to_pl, R))
    Fe = (v2sub(ec, v2mul(tt, 2.2)), tt, (-tt[1], tt[0]))
    if Fe[2][0] * to_pl[0] + Fe[2][1] * to_pl[1] < 0: Fe = (v2add(ec, v2mul(tt, 2.2)), (-tt[0], -tt[1]), to_pl)
    g.fbox('stucco', Fe, 0, 4.4, yR + 3.6, yR + 3.85, -0.2, 2.2, CREAM5, top=True, bottom=True)
    g.fbox('paint', Fe, 0, 4.4, yR + 3.85, yR + 4.1, 1.9, 2.25, ORANGE5, top=True, bottom=True)
    if not lod: g.text('neon', Fe, 2.2, yR + 4.25, 1.0, 'ROUND HOUSE', 0.42, (1.0, 0.86, 0.6, 1.0), depth=0.05)
    cols += wall_colliders(rr, yR - 2, yR + 5.4)
    # plaza: paving ring, the bridge-cable cross-section, the engineer's statue, benches, lamps
    ring_p = [(rc[0] + math.cos(2 * math.pi * k / N) * (R + 7.5), rc[1] + math.sin(2 * math.pi * k / N) * (R + 7.5)) for k in range(N)]
    ring_i = [(rc[0] + math.cos(2 * math.pi * k / N) * (R + 0.35), rc[1] + math.sin(2 * math.pi * k / N) * (R + 0.35)) for k in range(N)]
    for i in range(N):
        j = (i + 1) % N
        pts = [ring_i[i], ring_i[j], ring_p[j], ring_p[i]]
        g.poly('paving', [(p[0], max(H(*p), yR - 0.4) + 0.06, p[1]) for p in pts], C('#b9b1a2'), (0, 1, 0))
    cs = v2add(rc, v2mul(to_pl, R + 5.0)); cs = v2add(cs, v2mul(tt, 4.5))
    yc = H(*cs) + 0.06
    g.box('granite', cs[0] - 0.9, cs[0] + 0.9, yc, yc + 0.7, cs[1] - 0.5, cs[1] + 0.5, GRAN5_D)
    g.rod('metal', (cs[0] - tt[0] * 0.25, yc + 1.26, cs[1] - tt[1] * 0.25), (cs[0] + tt[0] * 0.25, yc + 1.26, cs[1] + tt[1] * 0.25), 0.46, C('#8e9396'), n=20 if not lod else 8)
    g.rod('paint', (cs[0] - tt[0] * 0.27, yc + 1.26, cs[1] - tt[1] * 0.27), (cs[0] + tt[0] * 0.27, yc + 1.26, cs[1] + tt[1] * 0.27), 0.4, ORANGE5, n=20 if not lod else 8)
    st = v2add(rc, v2mul(to_pl, R + 5.0)); st = v2sub(st, v2mul(tt, 4.5))
    ys_ = H(*st) + 0.06
    g.box('granite', st[0] - 0.7, st[0] + 0.7, ys_, ys_ + 1.6, st[1] - 0.7, st[1] + 0.7, GRAN5, yaw=math.atan2(-tt[1], tt[0]))
    if not lod:
        g.lathe('metal', st[0], st[1], [(0.28, ys_ + 1.6), (0.3, ys_ + 2.4), (0.22, ys_ + 2.9), (0.26, ys_ + 3.2), (0.12, ys_ + 3.35), (0.13, ys_ + 3.6), (0.0, ys_ + 3.7)], BRONZE, n=10)
    cols.append({'x': round(st[0], 2), 'z': round(st[1], 2), 'hx': 0.8, 'hz': 0.8, 'yaw': 0.0, 'yMin': ys_ - 1, 'yMax': ys_ + 3.6})
    if not lod:
        for k in range(6):
            a_ = math.atan2(to_pl[1], to_pl[0]) + math.pi * (0.35 + 0.26 * k)
            p = (rc[0] + math.cos(a_) * (R + 6.2), rc[1] + math.sin(a_) * (R + 6.2))
            yy = H(*p) + 0.06
            tq = (-math.sin(a_), math.cos(a_))
            Fb = (v2sub(p, v2mul(tq, 0.9)), tq, (math.cos(a_), math.sin(a_)))
            g.fbox('wood', Fb, 0, 1.8, yy + 0.42, yy + 0.48, -0.25, 0.25, WOOD5, top=True, back=True)
            g.fbox('metal', Fb, 0.1, 0.2, yy, yy + 0.45, -0.2, 0.2, IRON, top=True, back=True)
            g.fbox('metal', Fb, 1.6, 1.7, yy, yy + 0.45, -0.2, 0.2, IRON, top=True, back=True)
            if k % 2 == 0:
                q = (rc[0] + math.cos(a_ + 0.13) * (R + 7.2), rc[1] + math.sin(a_ + 0.13) * (R + 7.2))
                yq = H(*q)
                g.cyl('metal', q[0], q[1], 0.07, yq, yq + 3.6, IRON, n=6)
                g.lathe('lamp', q[0], q[1], [(0.16, yq + 3.6), (0.2, yq + 3.95), (0.0, yq + 4.1)], (1.0, 0.86, 0.6, 1.0), n=8)
    # ---------------------------------------------------------------- toll plaza administration building (Art Deco, 2 storeys)
    ar = ring_simplify(ring_out(ring_of(1742)), 0.8)
    yA = min(H(*p) for p in ar) + 0.1
    yT = yA + 7.8
    ww = Win(w=1.6, sill=0.8, head=2.6, depth=0.25, glass='win', lit=0.4, mull=True, sill_out=0.06)
    for a, b in edges_of(ar):
        Le = v2len(v2sub(b, a))
        if Le < 3.0: radial_panel(g, 'stucco', Geo.frame(a, b), 0, Le, yA - 2, yT, None, CREAM5); continue
        facade(g, a, b, yA, yT - 1.2, 3.3, 3.2, ww, 'stucco', CREAM5, margin=1.0, pier=(0.45, 0.18, CREAM5_D))
        F = Geo.frame(a, b)
        radial_panel(g, 'stucco', F, 0, Le, yA - 2, yA, None, CREAM5_D)
        radial_panel(g, 'stucco', F, 0, Le, yT - 1.2, yT, None, CREAM5)
        g.fbox('paint', F, 0, Le, yT - 1.0, yT - 0.8, 0, 0.1, ORANGE5, top=True, bottom=True)
    g.sweep('stucco', ar, [(0.0, yT), (0.15, yT), (0.15, yT + 0.35), (-0.3, yT + 0.35)], CREAM5_D)
    g.poly('roof', [(p[0], yT + 0.05, p[1]) for p in ring_offset(ar, -0.3)], C('#77736b'), (0, 1, 0))
    if not lod:
        c = centroid(ar)
        g.box('stucco', c[0] - 3, c[0] + 3, yT, yT + 2.8, c[1] - 3, c[1] + 3, CREAM5, yaw=math.atan2(-(long_e[1][1] - long_e[0][1]), long_e[1][0] - long_e[0][0]))
    cols += wall_colliders(ar, yA - 2, yT)
    # ---------------------------------------------------------------- welcome pavilion (glass box beside the Round House)
    pv = v2add(rc, v2mul(tt, -(R + 16.0)))
    if not any(point_in(b['ring'], *pv) for b in buildings_near(pv[0], pv[1], 30) if b['i'] not in GGP_HIDE):
        Lp = Loc(pv, to_pl)
        yp = min(H(*Lp.xz(a, b)) for a in (-6, 6) for b in (-4, 4)) + 0.1
        Lp.box(g, 'concrete', -6.5, 6.5, -4.5, 4.5, yp - 1.5, yp + 0.2, C('#c7c2b8'))
        glass_walls = [((-6, -4), (6, -4)), ((6, -4), (6, 4)), ((6, 4), (-6, 4)), ((-6, 4), (-6, -4))]
        for (a0, b0), (a1, b1) in glass_walls:
            A, B = Lp.xz(a0, b0), Lp.xz(a1, b1)
            F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
            if v2len(v2sub(v2lerp(A, B, 0.5), pv)) and (F[2][0] * (v2lerp(A, B, 0.5)[0] - pv[0]) + F[2][1] * (v2lerp(A, B, 0.5)[1] - pv[1])) < 0:
                F = Geo.frame(B, A)
            g.fbox('shop', F, 0.1, Le - 0.1, yp + 0.2, yp + 3.6, -0.05, 0.0, (1.0, 0.9, 0.72, 1.0), top=False)
            if not lod:
                for k in range(int(Le / 1.5) + 1):
                    g.fbox('metal', F, k * Le / int(Le / 1.5) - 0.04, k * Le / int(Le / 1.5) + 0.04, yp + 0.2, yp + 3.6, -0.02, 0.06, C('#34383a'), top=False)
        Lp.box(g, 'stucco', -7.5, 7.5, -5.5, 5.5, yp + 3.6, yp + 4.1, WHITE5, bottom=True)
        Fs = Lp.F(-4.0, -5.5, 0)
        if Fs[2][0] * to_pl[0] + Fs[2][1] * to_pl[1] < 0: Fs = Lp.F(4.0, 5.5, 2)
        if not lod: g.text('paint', Fs, 4.0, yp + 3.66, 0.03, 'WELCOME CENTER', 0.34, ORANGE5, depth=0.03)
        cols.append(Lp.col(-6.1, 6.1, -4.1, 4.1, yp - 1, yp + 4))
    zone = [[round(rc[0] + math.cos(2 * math.pi * k / 16) * (R + 24), 1), round(rc[1] + math.sin(2 * math.pi * k / 16) * (R + 24), 1)] for k in range(16)]
    return {'colliders': cols, 'name': 'Golden Gate Bridge Plaza', 'yG': round(yb, 2), 'top': round(ytop + 2, 1), 'noTrees': [zone]}


# ================================================================================== ships: generic hull + the bay ferry
def ship_hull(g, L, a0, a1, W, y_keel, y_deck, sheer=0.0, bow=0.28, stern=0.1, boot=None, col_top=WHITE5, col_bot=C('#2d3136'),
              col_boot=None, n=None, stern_w=0.75, deck_col=C('#9c8a70')):
    """hull along a (a0 stern -> a1 bow) of a Loc; sections: half-width tapers to a point at the bow, rounded stern.
    boot: y of the waterline stripe (hull below it = col_bot). Returns (deck_pt(s, t), hw(s), yd(s)), s in [0, 1] stern->bow"""
    n = n or (26 if not g.lod else 10)
    Ln = a1 - a0
    def hw(t):
        if t > 1 - bow: u = (t - (1 - bow)) / bow; return W / 2 * max(0.0, 1 - u ** 1.8) ** 0.6
        if t < stern: u = t / stern; return W / 2 * (stern_w + (1 - stern_w) * math.sin(u * math.pi / 2))
        return W / 2
    def yd(t): return y_deck + sheer * ((2 * t - 1) ** 2)
    prof = [(1.0, 1.0), (0.99, 0.55), (0.9, 0.2), (0.62, 0.05), (0.0, 0.0)]      # (width frac, height frac above keel)
    secs = []
    for i in range(n + 1):
        t = i / n; a = a0 + Ln * t; h = hw(t); ytop = yd(t); kl = y_keel + (ytop - y_keel) * (0.35 * max(0, (t - 0.85) / 0.15) ** 2)
        secs.append([(a, h * fw, (kl + (ytop - kl) * fh) if fh < 1 else ytop) for fw, fh in prof])
    for i in range(n):
        A, B = secs[i], secs[i + 1]
        for k in range(len(prof) - 1):
            ym = (A[k][2] + A[k + 1][2]) / 2
            col = col_top if (boot is None or ym > boot) else col_bot
            if boot is not None and col_boot and k == 1: col = col_boot if abs(A[k][2] - boot) < 0.6 else col
            for sgn in (1, -1):
                p = [L.P(A[k][0], sgn * A[k][1], A[k][2]), L.P(B[k][0], sgn * B[k][1], B[k][2]), L.P(B[k + 1][0], sgn * B[k + 1][1], B[k + 1][2]), L.P(A[k + 1][0], sgn * A[k + 1][1], A[k + 1][2])]
                g.poly('paint', p, col, L.d(0, sgn))
    s0 = secs[0]
    g.poly('paint', [L.P(s0[k][0], s0[k][1], s0[k][2]) for k in range(len(prof))] + [L.P(s0[k][0], -s0[k][1], s0[k][2]) for k in range(len(prof) - 2, -1, -1)], col_top, L.d(-1, 0))
    deck = [L.P(r[0][0], r[0][1], r[0][2]) for r in secs] + [L.P(r[0][0], -r[0][1], r[0][2]) for r in secs[::-1]]
    g.poly('wood', deck, deck_col, (0, 1, 0))
    return (lambda s, t: L.P(a0 + Ln * s, hw(s) * t, yd(s))), hw, yd


def ferry(g, c, u, y_wl=0.0, name='ISLAND FERRY'):
    """40 m two-deck bay ferry (monohull), bow toward +u; returns its collider"""
    L = Loc(c, u)
    lod = g.lod
    D, hw, yd = ship_hull(g, L, -20, 20, 10.5, y_wl - 1.8, y_wl + 2.2, sheer=0.25, bow=0.22, stern=0.08, boot=y_wl + 0.25,
                          col_top=WHITE5, col_bot=C('#23384f'), col_boot=C('#b3202e'))
    blue = C('#27507a')
    for s in (-1, 1):   # rub rail + name on both sides
        F = L.F(-19, 5.28, 0) if s > 0 else L.F(19, -5.28, 2)
        g.fbox('paint', F, 0, 36, y_wl + 1.25, y_wl + 1.6, 0, 0.12, blue, top=True, bottom=True)
        if not lod: g.text('paint', L.F(-8, 5.36, 0) if s > 0 else L.F(8, -5.36, 2), 8, y_wl + 0.55, 0.02, name, 0.62, blue, depth=0.03)
    for (a0, a1, b, y0, y1) in ((-16, 12, 4.4, y_wl + 2.2, y_wl + 4.8), (-12, 8, 3.8, y_wl + 4.8, y_wl + 7.3)):   # cabins
        L.box(g, 'paint', a0, a1, -b, b, y0, y1, WHITE5, top=True)
        for s in (-1, 1):
            F = L.F(a0 + 0.8, b + 0.02, 0) if s > 0 else L.F(a1 - 0.8, -(b + 0.02), 2)
            g.fbox('shop', F, 0, a1 - a0 - 1.6, y0 + 0.9, y1 - 0.5, 0, 0.03, (1.0, 0.9, 0.72, 1.0), top=False)
        L.box(g, 'paint', a0 - 0.3, a1 + 0.3, -b - 0.3, b + 0.3, y1 - 0.12, y1, blue, top=True, bottom=True)
    L.box(g, 'paint', 3, 7.5, -2.4, 2.4, y_wl + 7.3, y_wl + 9.4, WHITE5, top=True)            # wheelhouse
    g.fbox('glassc', L.F(7.52, -2.2, 1), 0, 4.4, y_wl + 8.0, y_wl + 9.1, 0, 0.03, C('#6c8796'), top=False)
    L.box(g, 'paint', 2.7, 7.8, -2.7, 2.7, y_wl + 9.4, y_wl + 9.55, blue, top=True, bottom=True)
    x, z = L.xz(5.0, 0); g.cyl('metal', x, z, 0.08, y_wl + 9.5, y_wl + 12.5, C('#dcdcdc'), n=5)
    x, z = L.xz(-13.5, 0); g.cyl('paint', x, z, 0.7, y_wl + 7.3, y_wl + 9.8, blue, n=10)      # funnel
    if not lod:   # railings on the open decks
        for a0, a1, yy in ((-19, -16, y_wl + 2.2), (-16, -12, y_wl + 4.8), (8, 12, y_wl + 4.8), (12, 17, y_wl + 2.2)):
            for s in (-1, 1):
                rail_line(g, L.xz(a0, s * (hw((a0 + 20) / 40) - 0.2)), L.xz(a1, s * (hw((a1 + 20) / 40) - 0.2)), yy, h=1.05, col=WHITE5, slot='paint')
    return {'x': round(c[0], 2), 'z': round(c[1], 2), 'hx': 20.0, 'hz': 5.2, 'yaw': round(L.yaw(), 4), 'yMin': y_wl - 2, 'yMax': y_wl + 9.5}


def face_yaw5(dx, dz):
    return math.atan2(-dx, -dz)


# ================================================================================== Alcatraz
ALC_CELL = [1433, 1432, 1421]
ALC_HIDE = [1433, 1432, 1421, 1431, 1443, 1436, 1422, 1445, 1446, 1447, 1448, 1449, 1450]
CONC5 = C('#dcd3c0'); CONC5_D = C('#c2b8a3'); RUIN = C('#b9ad98')


def alc_frame():
    """cellhouse frame: a along the long axis (NW -> SE), b across"""
    return Loc(centroid(ring_of(1433)), v2norm(v2sub((-270.75, -5735.31), (-304.19, -5769.69))))


def alc_dock():
    """dock frame on the NE shore beside Building 64: a runs out from the shore into the water, b along the shore (+ = SE)"""
    u = v2norm((0.62, -0.78))
    p = (-156.0, -5756.0)
    k = 0
    while k < 80 and H(*p) > 0.3: p = v2add(p, u); k += 1
    return Loc(v2sub(p, v2mul(u, 5.0)), u)


def alc_cell_y():
    hs = []
    for i in ALC_CELL:
        r = ring_of(i)
        xs = [p[0] for p in r]; zs = [p[1] for p in r]
        for a in range(10):
            for b in range(10):
                p = (min(xs) + (max(xs) - min(xs)) * a / 9, min(zs) + (max(zs) - min(zs)) * b / 9)
                if point_in(r, *p): hs.append(H(*p))
    return max(hs) + 0.3


def alcatraz(g):
    lod = g.lod
    cols = []
    L = alc_frame()
    yF = alc_cell_y()
    top = yF + 14.0
    # ---------------------------------------------------------------- cellhouse + mess-hall wing: buff concrete, tall barred windows
    tall = Win(w=2.0, sill=1.2, head=10.2, depth=0.45, glass='win', lit=0.25, mull=True, sill_out=0.12, frame_col=C('#3a3c3a'))
    for i in (1433, 1421):
        r = ring_simplify(ring_out(ring_of(i)), 0.4)
        yG = min(H(*p) for p in r) - 0.5
        for a, b in edges_of(r):
            Le = v2len(v2sub(b, a)); F = Geo.frame(a, b)
            if Le < 5: radial_panel(g, 'concrete', F, 0, Le, yG, top, None, CONC5); continue
            facade(g, a, b, yF, yF + 12.0, 12.0, 4.4, tall, 'concrete', CONC5, margin=1.6, pier=(0.7, 0.25, CONC5_D))
            radial_panel(g, 'concrete', F, 0, Le, yG, yF, None, CONC5_D)
            radial_panel(g, 'concrete', F, 0, Le, yF + 12.0, top, None, CONC5)
            if not lod:   # window bars
                nb = int((Le - 3.2) / 4.4)
                for k in range(nb):
                    uc = 1.6 + (k + 0.5) * (Le - 3.2) / nb
                    for q in range(5):
                        uu = uc - 0.8 + q * 0.4
                        g.fbox('metal', F, uu - 0.03, uu + 0.03, yF + 1.2, yF + 10.2, -0.05, 0.0, IRON, top=False)
        g.sweep('concrete', r, [(0.0, top), (0.3, top), (0.3, top + 0.5), (-0.4, top + 0.5), (-0.4, top + 1.1), (-0.8, top + 1.1)], CONC5_D)
        g.poly('roof', [(p[0], top + 0.3, p[1]) for p in ring_offset(r, -0.8)], C('#8c887f'), (0, 1, 0))
        cols += wall_colliders(r, yG - 2, top + 1)
    for b in (-11.2, 0.0, 11.2):   # roof monitors (skylights over Broadway, Michigan Avenue and Seedy Street)
        L.box(g, 'concrete', -24, 27, b - 2.2, b + 2.2, top + 0.3, top + 1.3, CONC5_D)
        for s in (-1, 1):
            A0, A1 = L.P(-24, b + s * 2.2, top + 1.3), L.P(27, b + s * 2.2, top + 1.3)
            B0, B1 = L.P(-24, b, top + 2.6), L.P(27, b, top + 2.6)
            g.poly('glassc', [A0, A1, B1, B0], C('#8fa3ab'), (L.v[0] * s, 1.0, L.v[1] * s))
    # ---------------------------------------------------------------- admin block (1432): 3 floors + the entrance portico
    ar = ring_out(ring_of(1432))
    yA = min(H(*p) for p in ar)
    aw = Win(w=1.3, sill=0.9, head=2.5, depth=0.3, glass='win', lit=0.3, mull=True, sill_out=0.08)
    ent = max(edges_of(ar), key=lambda e: L.loc(*v2lerp(e[0], e[1], 0.5))[0])       # SE face (toward the lighthouse)
    for a, b in edges_of(ar):
        Le = v2len(v2sub(b, a)); F = Geo.frame(a, b)
        facade(g, a, b, yF, yF + 10.5, 3.5, 3.4, aw, 'concrete', CONC5, margin=1.2, skip=(lambda k, i, e=(a, b): e == ent and k == 0 and i in (2, 3)))
        radial_panel(g, 'concrete', F, 0, Le, yA - 1, yF, None, CONC5_D)
        radial_panel(g, 'concrete', F, 0, Le, yF + 10.5, top - 1.5, None, CONC5)
    g.sweep('concrete', ar, [(0.0, top - 1.5), (0.3, top - 1.5), (0.3, top - 1.0), (-0.5, top - 1.0)], CONC5_D)
    g.poly('roof', [(p[0], top - 1.05, p[1]) for p in ring_offset(ar, -0.5)], C('#8c887f'), (0, 1, 0))
    a, b = ent; F = Geo.frame(a, b); Le = v2len(v2sub(b, a)); um = Le / 2
    g.fbox('concrete', F, um - 3.2, um + 3.2, yF, yF + 7.2, 0, 1.2, CONC5, top=True)
    g.fbox('wood', F, um - 1.1, um + 1.1, yF, yF + 2.9, 1.2, 1.23, C('#3b3a36'), top=False)
    g.fbox('concrete', F, um - 1.35, um + 1.35, yF + 2.9, yF + 3.15, 1.2, 1.32, CONC5_D, top=True, bottom=True)
    if not lod:
        g.text('stone', F, um, yF + 4.0, 1.24, 'UNITED STATES PENITENTIARY', 0.36, C('#2c2b28'), depth=0.03)
        g.poly('paint', [Geo.fp(F, um + math.cos(2 * math.pi * k / 16) * 0.55, yF + 5.9 + math.sin(2 * math.pi * k / 16) * 0.55, 1.25) for k in range(16)], WHITE5, (F[2][0], 0, F[2][1]))
        g.fbox('metal', F, um - 0.03, um + 0.03, yF + 5.9, yF + 6.35, 1.25, 1.27, IRON, top=False)
        g.fbox('metal', F, um, um + 0.32, yF + 5.87, yF + 5.93, 1.25, 1.27, IRON, top=False)
        for s in (-1, 1):   # the eagle shield: gilt chevrons either side of the clock
            for k in range(3):
                g.fbox('gold', F, um + s * (0.8 + k * 0.45) - 0.17, um + s * (0.8 + k * 0.45) + 0.17, yF + 5.6 + k * 0.18, yF + 5.75 + k * 0.18, 1.2, 1.28, GOLD, top=True, bottom=True)
        fp_ = Geo.fp(F, um + 4.5, 0, 2.5)
        flag(g, fp_[0], fp_[2], yF, 12.0, yaw_t=F[1])
    cols += wall_colliders(ar, yA - 1, top)
    # ---------------------------------------------------------------- lighthouse (1909, octagonal concrete tower)
    lc = centroid(ring_of(1431)); yl = H(*lc)
    g.lathe('concrete', lc[0], lc[1], [(2.3, yl - 1), (2.3, yl + 0.8), (2.0, yl + 1.0), (1.55, yl + 21.0), (2.05, yl + 21.4), (2.05, yl + 21.9)], WHITE5, n=8, cap_top=True)
    for k in range(3 if not lod else 0):
        a_ = 2 * math.pi * k / 3 + 0.4
        x, z = lc[0] + math.cos(a_) * 1.85, lc[1] + math.sin(a_) * 1.85
        g.box('win', x - 0.25, x + 0.25, yl + 6 + k * 5, yl + 7.3 + k * 5, z - 0.25, z + 0.25, (0, 0, 0, 1))
    for k in range(16 if not lod else 0):
        a_ = 2 * math.pi * k / 16
        g.box('metal', lc[0] + math.cos(a_) * 1.95 - 0.03, lc[0] + math.cos(a_) * 1.95 + 0.03, yl + 21.9, yl + 22.9, lc[1] + math.sin(a_) * 1.95 - 0.03, lc[1] + math.sin(a_) * 1.95 + 0.03, IRON)
    g.lathe('glassc', lc[0], lc[1], [(1.15, yl + 21.9), (1.15, yl + 23.8)], C('#9fb3b8'), n=8)
    g.lathe('lamp', lc[0], lc[1], [(0.45, yl + 22.3), (0.45, yl + 23.4), (0.0, yl + 23.4)], (1.0, 0.95, 0.8, 1.0), n=8)
    g.lathe('metal', lc[0], lc[1], [(1.3, yl + 23.8), (0.7, yl + 24.6), (0.15, yl + 25.0), (0.0, yl + 25.6)], IRON, n=8)
    cols.append({'x': round(lc[0], 2), 'z': round(lc[1], 2), 'hx': 2.1, 'hz': 2.1, 'yaw': 0.0, 'yMin': yl - 1, 'yMax': yl + 22})
    # ---------------------------------------------------------------- warden's house ruin (1443): roofless shell
    wr = ring_out(ring_of(1443)); yw = min(H(*p) for p in wr)
    for a, b in edges_of(wr):
        Le = v2len(v2sub(b, a)); F = Geo.frame(a, b)
        nb = max(1, int(Le / 3.2))
        for k in range(3):
            yk = yw + k * 3.4
            holes = [opening_poly((j + 0.5) * Le / nb, 1.1, yk + 0.9, yk + 2.6, 2 if k == 2 else 0, 6) for j in range(nb)]
            window_holes(g, F, 0, Le, yk, yk + 3.4, holes, shade(RUIN, 0.95 + 0.05 * k), 'stucco', glass_slot='plain', gcol=C('#39342c'), depth=0.35)
        g.fbox('stucco', F, 0, Le, yw + 10.2, yw + 10.6 - (0.6 if Le > 10 else 0.0), -0.35, 0.05, RUIN, top=True, back=True)
    for a, b in edges_of(ring_offset(wr, -0.35)):
        n = edge_n(a, b)
        g.poly('stucco', [(a[0], yw, a[1]), (b[0], yw, b[1]), (b[0], yw + 10.2, b[1]), (a[0], yw + 10.2, a[1])], shade(RUIN, 0.8), (-n[0], 0, -n[1]))
    cols += wall_colliders(wr, yw - 1, yw + 10)
    # ---------------------------------------------------------------- water tower (1436) with the 1969 occupation graffiti
    wc = centroid(ring_of(1436)); ywt = H(*wc)
    Rt = 6.2; y1 = ywt + 21.0; y2 = y1 + 8.5
    LEG = C('#8a7d6c')
    for k in range(6):
        a_ = 2 * math.pi * k / 6; b_ = 2 * math.pi * (k + 1) / 6
        p = (wc[0] + math.cos(a_) * (Rt - 0.4), wc[1] + math.sin(a_) * (Rt - 0.4))
        g.box('concrete', p[0] - 0.6, p[0] + 0.6, ywt - 1.5, ywt + 0.4, p[1] - 0.6, p[1] + 0.6, CONC5_D)
        g.rod('metal', (p[0], ywt + 0.4, p[1]), (wc[0] + math.cos(a_) * (Rt - 1.2), y1, wc[1] + math.sin(a_) * (Rt - 1.2)), 0.28, LEG, n=6)
        if not lod:
            for j in range(3):
                t0, t1 = j / 3, (j + 1) / 3
                ya, yb = ywt + 0.4 + (y1 - ywt - 0.4) * t0, ywt + 0.4 + (y1 - ywt - 0.4) * t1
                ra, rb = Rt - 0.4 - 0.8 * t0, Rt - 0.4 - 0.8 * t1
                A = (wc[0] + math.cos(a_) * ra, ya, wc[1] + math.sin(a_) * ra); B = (wc[0] + math.cos(b_) * rb, yb, wc[1] + math.sin(b_) * rb)
                A2 = (wc[0] + math.cos(b_) * ra, ya, wc[1] + math.sin(b_) * ra); B2 = (wc[0] + math.cos(a_) * rb, yb, wc[1] + math.sin(a_) * rb)
                g.rod('metal', A, B, 0.06, LEG, n=4); g.rod('metal', A2, B2, 0.06, LEG, n=4)
                g.rod('metal', B, B2, 0.1, LEG, n=4)
        cols.append({'x': round(p[0], 2), 'z': round(p[1], 2), 'hx': 0.6, 'hz': 0.6, 'yaw': 0.0, 'yMin': ywt - 1, 'yMax': y1})
    g.lathe('paint', wc[0], wc[1], [(0.0, y1 - 1.6), (Rt * 0.7, y1 - 0.9), (Rt, y1), (Rt, y2), (Rt * 0.25, y2 + 2.6), (0.0, y2 + 2.8)], C('#d8d0c2'), n=28 if not lod else 12)
    g.lathe('metal', wc[0], wc[1], [(Rt + 1.1, y1 - 0.05), (Rt + 1.1, y1 + 0.08), (Rt, y1 + 0.08)], C('#6c6256'), n=28 if not lod else 12)
    if not lod:
        words = [('PEACE AND', 0.0, y1 + 5.6), ('FREEDOM', 0.0, y1 + 4.4), ('WELCOME', 1.05, y1 + 5.2), ('HOME OF THE', -1.05, y1 + 6.4),
                 ('FREE', -1.05, y1 + 5.2), ('INDIAN LAND', -1.05, y1 + 2.4)]
        to_sf = v2norm(v2sub((1286.0, -3663.0), wc)); a_sf = math.atan2(to_sf[1], to_sf[0])
        for w_, da, yy in words:
            a_ = a_sf + da
            n_ = (math.cos(a_), math.sin(a_)); t_ = (-n_[1], n_[0])      # frame normal (-t.z, t.x) must be n_ -> t = (n.z, -n.x)
            t_ = (n_[1], -n_[0])
            F = ((wc[0] + n_[0] * Rt, wc[1] + n_[1] * Rt), t_, n_)
            g.text('paint', F, 0, yy, 0.03, w_, 0.62, C('#a3231f'), depth=0.02)
    # ---------------------------------------------------------------- Building 64 (barracks at the dock) + the famous sign
    br = ring_out(ring_of(1422)); yb = min(H(*p) for p in br) + 0.1
    bt = yb + 13.6
    bw = Win(w=1.2, sill=0.9, head=2.4, depth=0.3, glass='win', lit=0.15, mull=True, sill_out=0.06)
    for a, b in edges_of(br):
        Le = v2len(v2sub(b, a))
        facade(g, a, b, yb, bt - 0.8, 3.2, 3.3, bw, 'concrete', CONC5, margin=1.0, band=(0.2, 0.08, CONC5_D))
        radial_panel(g, 'concrete', Geo.frame(a, b), 0, Le, yb - 3, yb, None, CONC5_D)
        radial_panel(g, 'concrete', Geo.frame(a, b), 0, Le, bt - 0.8, bt, None, CONC5)
    g.sweep('concrete', br, [(0.0, bt), (0.25, bt), (0.25, bt + 0.4), (-0.4, bt + 0.4)], CONC5_D)
    g.poly('roof', [(p[0], bt + 0.05, p[1]) for p in ring_offset(br, -0.4)], C('#7e7a72'), (0, 1, 0))
    se = max(edges_of(br), key=lambda e: v2lerp(e[0], e[1], 0.5)[0])
    F = Geo.frame(*se); Le = v2len(v2sub(se[1], se[0]))
    if not lod:
        g.fbox('paint', F, 0.6, Le - 0.6, bt - 3.4, bt - 0.9, 0, 0.06, C('#2c2b28'), top=True, bottom=True)
        g.text('paint', F, Le / 2, bt - 2.35, 0.09, 'UNITED STATES PENITENTIARY', 0.62, WHITE5, depth=0.02)
        g.text('paint', F, Le / 2, bt - 3.25, 0.09, 'INDIANS WELCOME', 0.55, C('#b3261e'), depth=0.02)
    cols += wall_colliders(br, yb - 3, bt)
    # ---------------------------------------------------------------- power house (1445) + smokestack
    pr = ring_out(ring_of(1445)); yp = min(H(*p) for p in pr)
    for a, b in edges_of(pr):
        facade(g, a, b, yp + 0.1, yp + 8.6, 4.2, 3.6, Win(w=1.8, sill=1.5, head=3.6, arch=2, glass='win', lit=0.1), 'brickred', C('#8e6a55'), margin=1.0)
        radial_panel(g, 'brickred', Geo.frame(a, b), 0, v2len(v2sub(b, a)), yp - 2, yp + 0.1, None, C('#7a5a47'))
    g.sweep('concrete', pr, [(0.0, yp + 8.6), (0.2, yp + 8.6), (0.2, yp + 9.0), (-0.3, yp + 9.0)], CONC5_D)
    g.poly('roof', [(p[0], yp + 8.65, p[1]) for p in ring_offset(pr, -0.3)], C('#6e6a63'), (0, 1, 0))
    cols += wall_colliders(pr, yp - 2, yp + 9)
    sc = centroid(ring_of(1446)); ys_ = H(*sc)
    g.lathe('brickred', sc[0], sc[1], [(2.1, ys_ - 1), (2.1, ys_ + 2.5), (1.7, ys_ + 3.0), (1.15, ys_ + 33.0), (1.4, ys_ + 33.5), (1.4, ys_ + 34.3), (0.95, ys_ + 34.3), (0.95, ys_ + 33.0)],
            C('#9a6a52'), n=16 if not lod else 8)
    cols.append({'x': round(sc[0], 2), 'z': round(sc[1], 2), 'hx': 1.9, 'hz': 1.9, 'yaw': 0.0, 'yMin': ys_ - 1, 'yMax': ys_ + 33})
    # ---------------------------------------------------------------- the dock, the guard tower, the ferry
    Ld = alc_dock()
    yd = max(2.3, H(*Ld.xz(-2, 0)) + 0.1)
    Ld.box(g, 'wood', -4, 44, -7, 7, yd - 0.4, yd, C('#8c7a62'), bottom=True)
    if not lod:
        for a in range(-2, 44, 5):
            for b in (-6.5, 6.5):
                x, z = Ld.xz(a, b); g.cyl('wood', x, z, 0.28, -4, yd - 0.4, C('#5e4a36'), n=6)
        for a in range(0, 44, 8):
            x, z = Ld.xz(a, 6.6); g.cyl('metal', x, z, 0.22, yd, yd + 0.6, IRON, n=8)
        rail_line(g, Ld.xz(-4, -7), Ld.xz(44, -7), yd, h=1.05, col=C('#4d4f50'))
    x, z = Ld.xz(40, -4.5)
    for s1 in (-1, 1):
        for s2 in (-1, 1):
            p = Ld.xz(40 + s1 * 1.6, -4.5 + s2 * 1.6)
            g.box('metal', p[0] - 0.12, p[0] + 0.12, yd, yd + 9.0, p[1] - 0.12, p[1] + 0.12, C('#6d6a62'))
    g.lathe('concrete', x, z, [(2.6, yd + 9.0), (2.6, yd + 9.3), (2.2, yd + 9.3)], CONC5_D, n=8, cap_bot=True)
    g.lathe('win', x, z, [(2.2, yd + 9.3), (2.2, yd + 11.2)], (0.9, 0.8, 0.55, 1.0), n=8)
    g.lathe('concrete', x, z, [(2.25, yd + 11.2), (2.7, yd + 11.4), (0.0, yd + 12.6)], CONC5_D, n=8)
    cols.append(Ld.col(38.2, 41.8, -6.1, -2.9, yd, yd + 12))
    cols.append(ferry(g, Ld.xz(28.0, 12.5), Ld.u))
    decks = [deck_seg(Ld.xz(-3, 0), Ld.xz(43, 0), yd, yd, 13.6)]
    # the island keeps its own sparse planting (cypress windbreaks + a few eucalyptus), no generic park trees
    isle = [(-548, -5905), (-470, -5935), (-415, -5928), (-330, -5875), (-240, -5805), (-160, -5785), (-118, -5748), (-80, -5680), (-95, -5615),
            (-150, -5585), (-235, -5595), (-305, -5638), (-385, -5700), (-465, -5780), (-530, -5840)]
    Rr = random.Random(5)
    placed = 0
    for _ in range(400):
        if placed >= (16 if not lod else 8): break
        x, z = Rr.uniform(-520, -100), Rr.uniform(-5920, -5600)
        if not point_in(isle, x, z) or H(x, z) < 6 or H(x, z) > 36: continue
        if any(point_in(bb['ring'], x, z) or v2len(v2sub(centroid(bb['ring']), (x, z))) < 16 for bb in buildings_near(x, z, 40)): continue
        if Rr.random() < 0.6: cols.append(conifer(g, x, z, H(x, z), h=Rr.uniform(9, 14), R=Rr.uniform(2.2, 3.0), seed=placed, col=C('#34502e')))
        else: cols.append(broadleaf(g, x, z, H(x, z), h=Rr.uniform(9, 13), R=Rr.uniform(2.6, 3.4), seed=placed, col=C('#5f7a4a')))
        placed += 1
    info = {'colliders': cols, 'name': 'Alcatraz Island', 'replaces': 'alcatraz', 'noTrees': [[[x, z] for x, z in isle]], 'yG': round(yF, 2), 'top': round(ywt + 32, 1), 'decks': decks, 'far': 4500}
    # ferry link: Pier 33 landing <-> the island dock (hero_int.js handles 'links' like doors)
    pa = Ld.xz(24.0, 5.0)
    Lp = p33_frame(); pp = Lp.xz(152.0, 22.0)
    info['links'] = [{'a': [round(pp[0], 2), round(H(*pp) + 0.2, 2), round(pp[1], 2), round(face_yaw5(Lp.v[0], Lp.v[1]), 3)], 'la': 'Ferry to Alcatraz Island',
                      'b': [round(pa[0], 2), round(yd + 0.05, 2), round(pa[1], 2), round(face_yaw5(-Ld.u[0], -Ld.u[1]), 3)], 'lb': 'Ferry to Pier 33'}]
    return info


# ================================================================================== Pier 33: the ferry landing shed
def p33_frame():
    """pier axis from the Embarcadero bulkhead (a = 0) out to the pier head (a ~ 175), b across (+ = east)"""
    a = (1276.0, -3590.0); b = (1330.0, -3752.0)
    u = v2norm(v2sub(b, a))
    L = Loc(a, u)
    return L if L.v[0] > 0 else Loc(a, u)


def pier33(g):
    lod = g.lod
    L = p33_frame()
    cols = []
    yg = max(H(*L.xz(a, 0)) for a in range(10, 170, 10)) + 0.05
    SH = C('#d9d2bf'); SH_D = C('#b8af98'); GRN = C('#3f6b58')
    a0, a1, b0, b1 = 12.0, 140.0, -9.0, 19.0
    ys = yg + 9.0
    for (A, B) in ((L.xz(a0, b0), L.xz(a1, b0)), (L.xz(a1, b1), L.xz(a0, b1)), (L.xz(a1, b0), L.xz(a1, b1))):
        F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
        c_ = L.xz((a0 + a1) / 2, 0)
        if F[2][0] * (A[0] - c_[0]) + F[2][1] * (A[1] - c_[1]) < 0: F = Geo.frame(B, A)
        if Le > 30:   # side walls: roll-up doors between pilasters, clerestory band
            nb = int(Le / 8.0)
            for k in range(nb):
                u0 = k * Le / nb; u1 = u0 + Le / nb
                hole = opening_poly((u0 + u1) / 2, 4.2, yg, yg + 4.6, 0)
                radial_panel(g, 'stucco', F, u0, u1, yg - 0.5, yg + 6.2, hole, SH)
                recess(g, F, hole, 0.3, 'stucco', SH_D, 'metal', C('#6e706c'))
                if lod:
                    radial_panel(g, 'stucco', F, u0, u1, yg + 6.2, ys, None, SH)
                else:
                    radial_panel(g, 'stucco', F, u0, u0 + 0.8, yg + 6.2, ys, None, SH); radial_panel(g, 'stucco', F, u1 - 0.8, u1, yg + 6.2, ys, None, SH)
                    radial_panel(g, 'stucco', F, u0 + 0.8, u1 - 0.8, yg + 6.2, yg + 6.6, None, SH); radial_panel(g, 'stucco', F, u0 + 0.8, u1 - 0.8, yg + 7.9, ys, None, SH)
                    g.fbox('win', F, u0 + 0.8, u1 - 0.8, yg + 6.6, yg + 7.9, -0.1, -0.05, glass_col(0.2), top=False)
                    g.fbox('stucco', F, u0 - 0.35, u0 + 0.35, yg - 0.5, ys + 0.3, 0, 0.35, SH_D, top=True)
        else:
            radial_panel(g, 'stucco', F, 0, Le, yg - 0.5, ys, None, SH)
    # the bulkhead facade at the Embarcadero end: arched portal, pilasters, the pier number
    A, B = L.xz(a0, b1), L.xz(a0, b0)
    F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
    if F[2][0] * L.u[0] + F[2][1] * L.u[1] > 0: F = Geo.frame(B, A)
    hole = opening_poly(Le / 2, 7.0, yg, yg + 7.4, 2)
    radial_panel(g, 'stucco', F, 0, Le, yg - 0.5, ys + 3.0, hole, SH)
    recess(g, F, hole, 0.5, 'stucco', SH_D, 'shop', (1.0, 0.86, 0.62, 1.0))
    for s in (0.6, Le - 2.0):
        g.fbox('stucco', F, s, s + 1.4, yg - 0.5, ys + 3.6, 0, 0.5, SH_D, top=True)
    g.fbox('stucco', F, 0, Le, ys + 3.0, ys + 3.5, -0.2, 0.4, SH_D, top=True, bottom=True)
    if not lod:
        g.text('paint', F, Le / 2, ys + 0.6, 0.02, 'PIER 33', 1.4, GRN, depth=0.04)
        g.text('neon', F, Le / 2, yg + 7.9, 0.1, 'ISLAND FERRY - ALCATRAZ LANDING', 0.52, (1.0, 0.85, 0.6, 1.0), depth=0.05)
    for s in (-1, 1):   # shallow gable roof, corrugated metal
        bm = (b0 + b1) / 2; e = b1 + 0.6 if s > 0 else b0 - 0.6
        g.poly('roof', [L.P(a0 - 0.5, e, ys), L.P(a1 + 0.5, e, ys), L.P(a1 + 0.5, bm, ys + 3.0), L.P(a0 - 0.5, bm, ys + 3.0)], C('#7f8583'), (L.v[0] * s, 1, L.v[1] * s))
    for aa, d_ in ((a0, -1), (a1, 1)):
        g.poly('stucco', [L.P(aa, b0, ys), L.P(aa, b1, ys), L.P(aa, (b0 + b1) / 2, ys + 3.0)], SH, L.d(d_, 0))
    cols.append(L.col(a0, a1, b0, b1, yg - 1, ys + 3))
    # pier-head apron: ticket kiosk, queue rails, the moored ferry on the east side
    Lk = Loc(L.xz(146.0, 4.0), L.u)
    Lk.box(g, 'paint', -2.2, 2.2, -1.6, 1.6, yg, yg + 2.7, GRN)
    Lk.box(g, 'shop', -2.0, 2.0, -1.62, 1.62, yg + 1.0, yg + 2.2, (1.0, 0.9, 0.7, 1.0), top=False)
    Lk.box(g, 'paint', -2.6, 2.6, -2.0, 2.0, yg + 2.7, yg + 3.0, SH, bottom=True)
    cols.append(Lk.col(-2.2, 2.2, -1.6, 1.6, yg - 1, yg + 3))
    if not lod:
        for k in range(4):
            rail_line(g, L.xz(144.0 + k * 1.6, 11.0), L.xz(144.0 + k * 1.6, 18.0), yg, h=1.0, col=C('#9a9da0'))
        g.text('paint', Lk.F(-2.0, -1.65, 0), 2.0, yg + 2.25, 0.02, 'TICKETS', 0.32, SH, depth=0.02)
    cols.append(ferry(g, L.xz(152.0, 30.0), (-L.u[0], -L.u[1])))
    zone = [[round(x, 1), round(z, 1)] for x, z in (L.xz(0, -18), L.xz(178, -18), L.xz(178, 27), L.xz(0, 27))]
    return {'colliders': cols, 'name': 'Pier 33 - Alcatraz Landing', 'yG': round(yg, 2), 'top': round(ys + 4, 1), 'noTrees': [zone]}


# ================================================================================== Fisherman's Wharf: the crab wheel sign
CRAB_AT = (322.0, -3713.5)


def crab(g, F, uc, yc, w, s, col=C('#d2452b'), col_d=C('#9d2c1c')):
    """stylised crab on a wall frame F (u, y plane at depth w, facing +n), size s (carapace width)"""
    N = F[2]
    x0, _, z0 = Geo.fp(F, uc, yc, w)
    # carapace: flattened dome in the frame plane (lathe around the frame normal via a local mesh)
    n_seg = 18 if not g.lod else 8
    ring = [(math.cos(2 * math.pi * k / n_seg) * s * 0.5, math.sin(2 * math.pi * k / n_seg) * s * 0.36) for k in range(n_seg)]
    back = [Geo.fp(F, uc + a, yc + b, w) for a, b in ring]
    front = [Geo.fp(F, uc + a * 0.72, yc + b * 0.7, w + s * 0.16) for a, b in ring]
    top = Geo.fp(F, uc, yc + s * 0.02, w + s * 0.22)
    for k in range(n_seg):
        j = (k + 1) % n_seg
        g.poly('paint', [back[k], back[j], front[j], front[k]], col, None)
        g.poly('paint', [front[k], front[j], top], col, (N[0], 0.3, N[1]))
    # eyes, legs (4 per side), claws
    for sg in (-1, 1):
        for q in range(4):
            a0 = sg * s * 0.42; b0 = yc - s * 0.08 - q * s * 0.07
            p0 = Geo.fp(F, uc + a0, b0, w + s * 0.05); p1 = Geo.fp(F, uc + sg * s * (0.72 + 0.03 * q), b0 - s * 0.12 + q * 0.0, w + s * 0.05)
            p2 = Geo.fp(F, uc + sg * s * (0.86 + 0.02 * q), b0 - s * (0.36 + 0.05 * q), w + s * 0.05)
            g.rod('paint', p0, p1, s * 0.035, col_d, n=5); g.rod('paint', p1, p2, s * 0.028, col_d, n=5)
        e0 = Geo.fp(F, uc + sg * s * 0.36, yc + s * 0.2, w + s * 0.05); e1 = Geo.fp(F, uc + sg * s * 0.62, yc + s * 0.45, w + s * 0.05)
        g.rod('paint', e0, e1, s * 0.05, col, n=6)
        c0 = Geo.fp(F, uc + sg * s * 0.62, yc + s * 0.45, w + s * 0.05)
        c1 = Geo.fp(F, uc + sg * s * 0.52, yc + s * 0.78, w + s * 0.05); c2 = Geo.fp(F, uc + sg * s * 0.78, yc + s * 0.72, w + s * 0.05)
        g.rod('paint', c0, c1, s * 0.07, col, n=6); g.rod('paint', c0, c2, s * 0.06, col, n=6)
        ey = Geo.fp(F, uc + sg * s * 0.1, yc + s * 0.3, w + s * 0.12)
        g.cyl('paint', ey[0], ey[2], s * 0.03, ey[1] - s * 0.05, ey[1] + s * 0.06, C('#1c1c1c'), n=5)


def wharf_crab(g):
    lod = g.lod
    x, z = CRAB_AT
    y0 = H(x, z)
    to_st = v2norm(v2sub((318.0, -3700.0), (x, z)))          # face down Taylor Street / Jefferson corner
    t = (-to_st[1], to_st[0])
    cy = y0 + 8.2; R = 2.9
    NAVY = C('#1f3f6a'); WOODS = C('#7a4f2c'); CREAMS = C('#f3ead3')
    g.lathe('granite', x, z, [(1.1, y0 - 1), (1.1, y0 + 0.5), (0.8, y0 + 0.65), (0.0, y0 + 0.65)], GRAN5_D, n=12)
    g.cyl('metal', x, z, 0.22, y0 + 0.65, cy - R - 0.4, NAVY, n=10)
    for side in (1, -1):
        n = (to_st[0] * side, to_st[1] * side); tt = (t[0] * side, t[1] * side)
        F = ((x - tt[0] * 0.0, z - tt[1] * 0.0), tt, (-tt[1], tt[0]))
        if F[2][0] * n[0] + F[2][1] * n[1] < 0: F = (F[0], (-tt[0], -tt[1]), n)
        seg = 40 if not lod else 16
        # blue disc face + cream inner field
        g.poly('paint', [Geo.fp(F, math.cos(2 * math.pi * k / seg) * R, cy + math.sin(2 * math.pi * k / seg) * R, 0.2) for k in range(seg)], NAVY, (F[2][0], 0, F[2][1]))
        g.poly('paint', [Geo.fp(F, math.cos(2 * math.pi * k / seg) * R * 0.62, cy + math.sin(2 * math.pi * k / seg) * R * 0.62, 0.23) for k in range(seg)], CREAMS, (F[2][0], 0, F[2][1]))
        if not lod:
            crab(g, F, 0.0, cy - 0.05, 0.24, 2.0)
            g.text('neon', F, 0.0, cy + R * 0.66, 0.24, "FISHERMEN'S", 0.42, (1.0, 0.9, 0.7, 1.0), depth=0.04)
            g.text('neon', F, 0.0, cy - R * 0.9, 0.24, 'LANDING', 0.42, (1.0, 0.9, 0.7, 1.0), depth=0.04)
    # the ship's-wheel rim + spokes with turned handles
    ax = to_st
    nr = 40 if not lod else 16
    for k in range(nr):
        a0, a1 = 2 * math.pi * k / nr, 2 * math.pi * (k + 1) / nr
        p0 = (x + t[0] * math.cos(a0) * (R + 0.15), cy + math.sin(a0) * (R + 0.15), z + t[1] * math.cos(a0) * (R + 0.15))
        p1 = (x + t[0] * math.cos(a1) * (R + 0.15), cy + math.sin(a1) * (R + 0.15), z + t[1] * math.cos(a1) * (R + 0.15))
        g.rod('wood', p0, p1, 0.24, WOODS, n=6 if not lod else 4)
    g.rod('paint', (x - ax[0] * 0.21, cy, z - ax[1] * 0.21), (x + ax[0] * 0.21, cy, z + ax[1] * 0.21), R + 0.02, NAVY, n=nr)
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        c, s_ = math.cos(a), math.sin(a)
        p0 = (x + t[0] * c * (R + 0.3), cy + s_ * (R + 0.3), z + t[1] * c * (R + 0.3)); p1 = (x + t[0] * c * (R + 1.1), cy + s_ * (R + 1.1), z + t[1] * c * (R + 1.1))
        g.rod('wood', p0, p1, 0.14, WOODS, n=6)
        if not lod: g.lathe('wood', p1[0], p1[2], [(0.0, p1[1] - 0.25), (0.2, p1[1] - 0.1), (0.16, p1[1] + 0.12), (0.0, p1[1] + 0.25)], WOODS, n=8)
    return {'colliders': [{'x': round(x, 2), 'z': round(z, 2), 'hx': 1.0, 'hz': 1.0, 'yaw': 0.0, 'yMin': y0 - 1, 'yMax': cy + R + 1.2}],
            'name': "Fisherman's Wharf sign", 'replaces': 'wharfSign', 'yG': round(y0, 2), 'top': round(cy + R + 1.2, 1)}


# ================================================================================== Pier 45: the shed, the museum hall, the submarine
P45_HIDE = [1822]


def p45_frame():
    """pier 45 shed frame: a from the Embarcadero bulkhead (a = 0, SE) out along the pier (NW), b across (+ = NE, the water side)"""
    A = (304.0, -3809.6); B = (169.0, -3922.0)
    u = v2norm(v2sub(B, A)); L = Loc(A, u)
    if L.v[1] > 0: L.v = (-L.v[0], -L.v[1])
    return L


def p45_box():
    L = p45_frame()
    q = [L.loc(*p) for p in ring_of(1822)]
    return L, min(p[0] for p in q) + 0.5, max(p[0] for p in q) - 0.5, min(p[1] for p in q) + 0.5, max(p[1] for p in q) - 0.5


def submarine(g, c, u, y_wl=0.0, Ln=95.0):
    """WWII fleet boat, bow toward +u"""
    L = Loc(c, u); lod = g.lod
    GREY = C('#5d6468'); GREY_D = C('#3c4144')
    n = 24 if not lod else 8
    prof = []
    for i in range(n + 1):
        t = i / n; a = -Ln / 2 + Ln * t
        r = 4.1 * (1 - abs(2 * t - 1) ** 3) ** 0.5 + 0.15
        prof.append((a, r))
    m = 12 if not lod else 6
    for i in range(n):
        (a0, r0), (a1, r1) = prof[i], prof[i + 1]
        for k in range(m):
            t0, t1 = math.pi * k / m, math.pi * (k + 1) / m          # upper half only above the waterline, flattened
            P = lambda a, r, t: L.P(a, math.cos(t) * r, y_wl - 1.8 + math.sin(t) * r * 0.62)
            g.poly('paint', [P(a0, r0, t0), P(a1, r1, t0), P(a1, r1, t1), P(a0, r0, t1)], GREY, (0, 1, 0) if k == m // 2 else L.d(0, math.cos((t0 + t1) / 2)))
    L.box(g, 'wood', -40, 36, -1.3, 1.3, y_wl + 0.6, y_wl + 0.85, C('#6d6152'))                 # deck casing
    L.box(g, 'paint', -6, 8, -1.6, 1.6, y_wl + 0.85, y_wl + 5.6, GREY)                         # conning tower (sail)
    L.box(g, 'paint', -3, 5, -1.3, 1.3, y_wl + 5.6, y_wl + 6.4, GREY_D)
    for a, h in ((0.0, 5.0), (2.5, 7.0)):
        x, z = L.xz(a, 0); g.cyl('metal', x, z, 0.14, y_wl + 6.4, y_wl + 6.4 + h, GREY_D, n=6)
    x, z = L.xz(14, 0); g.cyl('metal', x, z, 0.5, y_wl + 0.85, y_wl + 1.6, GREY_D, n=8)
    g.rod('metal', L.P(14, 0, y_wl + 1.8), L.P(18.5, 0, y_wl + 2.1), 0.12, GREY_D, n=6)
    return {'x': round(c[0], 2), 'z': round(c[1], 2), 'hx': Ln / 2, 'hz': 4.2, 'yaw': round(L.yaw(), 4), 'yMin': y_wl - 3, 'yMax': y_wl + 6.4}


def pier45(g):
    lod = g.lod
    L, a0, a1, b0, b1 = p45_box()
    cols = []
    yg = max(H(*L.xz(a, b)) for a in (a0 + 5, (a0 + a1) / 2, a1 - 5) for b in (b0 + 3, 0, b1 - 3)) + 0.05
    SH = C('#cfc6b2'); SH_D = C('#aba28d'); TRIM = C('#46705f')
    ring = ring_out(ring_of(1822))
    # long shed walls: pilasters, roll-up doors, clerestory windows; four gabled sheds along the pier
    ys = yg + 8.6
    for A, B in edges_of(ring):
        F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
        nb = max(1, int(Le / 7.5))
        for k in range(nb):
            u0 = k * Le / nb; u1 = u0 + Le / nb
            door = Le > 60 and k % 3 == 1
            hole = opening_poly((u0 + u1) / 2, 4.4 if door else 3.2, yg + (0.0 if door else 1.4), yg + (4.8 if door else 4.2), 0)
            radial_panel(g, 'stucco', F, u0, u1, yg - 2.5, yg + 5.8, hole, SH)
            recess(g, F, hole, 0.3, 'stucco', SH_D, 'metal' if door else 'win', C('#707570') if door else glass_col(0.3))
            if lod:
                radial_panel(g, 'stucco', F, u0, u1, yg + 5.8, ys, None, SH)
            else:
                hole2 = opening_poly((u0 + u1) / 2, (u1 - u0) - 1.6, yg + 6.3, yg + 7.8, 0)
                radial_panel(g, 'stucco', F, u0, u1, yg + 5.8, ys, hole2, SH)
                recess(g, F, hole2, 0.15, 'stucco', SH_D, 'win', glass_col(0.35))
                g.fbox('stucco', F, u0 - 0.4, u0 + 0.4, yg - 2.5, ys + 0.2, 0, 0.35, SH_D, top=True)
        g.fbox('paint', F, 0, Le, ys - 0.2, ys + 0.3, 0, 0.3, TRIM, top=True, bottom=True)
    cols += wall_colliders(ring, yg - 3, ys)
    # roofs: four shallow gables across the width
    NS = 4
    for k in range(NS):
        s0 = a0 + (a1 - a0) * k / NS; s1 = a0 + (a1 - a0) * (k + 1) / NS
        def bw(a):   # width limits of the (trapezoid) footprint at a
            pts = [L.loc(*p) for p in ring]
            return min(p[1] for p in pts), max(p[1] for p in pts)
        lo, hi = bw(s0)
        ym = ys + 3.4
        for sg in (-1, 1):
            e = hi if sg > 0 else lo
            g.poly('roof', [L.P(s0, e + 0.4 * sg, ys), L.P(s1, e + 0.4 * sg, ys), L.P(s1, (lo + hi) / 2, ym), L.P(s0, (lo + hi) / 2, ym)], C('#818684'), (L.v[0] * sg, 1, L.v[1] * sg))
        for aa in (s0, s1):
            g.poly('stucco', [L.P(aa, lo, ys), L.P(aa, hi, ys), L.P(aa, (lo + hi) / 2, ym)], SH_D, L.d(1 if aa == s1 else -1, 0))
    # bulkhead face on the Embarcadero: the museum entrance, a big name board, the pier number
    A, B = min(edges_of(ring), key=lambda e: L.loc(*v2lerp(e[0], e[1], 0.5))[0])
    F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
    if not lod:
        g.fbox('paint', F, Le * 0.5 - 12, Le * 0.5 + 12, yg + 5.9, yg + 7.6, 0, 0.2, C('#233a2f'), top=True, bottom=True)
        g.text('neon', F, Le * 0.5, yg + 6.2, 0.22, 'MUSEE DES MACHINES', 1.0, (1.0, 0.86, 0.55, 1.0), depth=0.05)
        g.text('paint', F, Le * 0.85, yg + 8.9, 0.02, 'PIER 45', 1.1, TRIM, depth=0.04)
    # USS-type fleet submarine moored along the NE side
    sc = L.xz((a0 + a1) / 2 + 20, b1 + 9.0)
    if H(*sc) < -2: cols.append(submarine(g, sc, (-L.u[0], -L.u[1])))
    return {'colliders': cols, 'name': 'Pier 45', 'yG': round(yg, 2), 'top': round(ys + 4, 1)}


# ================================================================================== Hyde Street Pier: the pier head + historic ships
def hyde_frame():
    """pier axis from the foot of Hyde Street (a = 0) north, b across (+ = east)"""
    A = (-126.0, -3700.0); B = (-118.0, -3808.0)
    u = v2norm(v2sub(B, A)); L = Loc(A, u)
    if L.v[0] < 0: L.v = (-L.v[0], -L.v[1])
    return L


def mast(g, L, a, y0, h, r, yards, col=C('#b89a6c'), yard_col=C('#1f1f1f'), gaff=None, lod=0):
    """square-rigger mast: lower mast + top mast + topgallant (tapering), tops, yards [(height frac, half length)]"""
    x, z = L.xz(a, 0)
    g.cyl('wood', x, z, r, y0, y0 + h * 0.45, col, n=10 if not lod else 5, r1=r * 0.85)
    g.cyl('wood', x, z, r * 0.7, y0 + h * 0.42, y0 + h * 0.75, col, n=8 if not lod else 5, r1=r * 0.55)
    g.cyl('wood', x, z, r * 0.45, y0 + h * 0.72, y0 + h, col, n=6 if not lod else 4, r1=r * 0.25)
    for fr, w in ((0.44, 2.8), (0.74, 1.8)):
        L.box(g, 'wood', a - 1.2, a + 1.2, -w / 2 - 0.4, w / 2 + 0.4, y0 + h * fr, y0 + h * fr + 0.25, C('#3a2c22'))
    for fr, hl in yards:
        yy = y0 + h * fr
        g.rod('wood', L.P(a + 0.5, -hl, yy), L.P(a + 0.5, hl, yy), 0.16 * (1.2 - fr * 0.6), yard_col, n=6 if not lod else 4)
    if gaff:
        gl, bl = gaff
        g.rod('wood', L.P(a - 0.3, 0, y0 + h * 0.4), L.P(a - gl, 0, y0 + h * 0.46), 0.14, yard_col, n=5)
        g.rod('wood', L.P(a - 0.3, 0, y0 + 2.5), L.P(a - bl, 0, y0 + 2.3), 0.16, yard_col, n=5)


def balclutha(g, c, u, y_wl=0.0):
    """1886 steel full-rigged ship (hull 77 m, beam 11.9 m), bow toward +u"""
    L = Loc(c, u); lod = g.lod
    Ln = 78.0
    D, hw, yd = ship_hull(g, L, -Ln / 2, Ln / 2, 11.9, y_wl - 5.8, y_wl + 3.6, sheer=0.9, bow=0.2, stern=0.12, boot=y_wl + 0.1,
                          col_top=C('#1b1c1d'), col_bot=C('#8a2a1c'), col_boot=C('#e9e2cf'), stern_w=0.6, deck_col=C('#a8916e'))
    # bulwark rail (white line), poop + deckhouse, the ship's name on the stern
    for s in (-1, 1):
        pts = [D(i / 30, s * 0.99) for i in range(31)]
        for i in range(30):
            p, q = pts[i], pts[i + 1]
            g.poly('paint', [p, q, (q[0], q[1] + 1.1, q[2]), (p[0], p[1] + 1.1, p[2])], C('#1b1c1d'), L.d(0, s))
            g.poly('paint', [(p[0], p[1] + 1.0, p[2]), (q[0], q[1] + 1.0, q[2]), (q[0], q[1] + 1.15, q[2]), (p[0], p[1] + 1.15, p[2])], C('#e9e2cf'), L.d(0, s))
    ydk = yd(0.5)
    L.box(g, 'paint', -Ln / 2 + 3, -Ln / 2 + 16, -5.0, 5.0, yd(0.1), yd(0.1) + 2.4, C('#e8e0c8'))
    L.box(g, 'wood', -Ln / 2 + 2.5, -Ln / 2 + 16.5, -5.3, 5.3, yd(0.1) + 2.4, yd(0.1) + 2.6, C('#8d7556'))
    L.box(g, 'paint', -6, 6, -2.8, 2.8, ydk, ydk + 2.4, C('#e8e0c8'))
    L.box(g, 'wood', -6.3, 6.3, -3.1, 3.1, ydk + 2.4, ydk + 2.6, C('#8d7556'))
    if not lod:
        for k in range(5):
            g.fbox('win', L.F(-5 + k * 2.4, 2.81, 0), 0, 0.8, ydk + 1.0, ydk + 1.8, 0, 0.02, glass_col(0.4), top=False)
        g.text('paint', L.F(-Ln / 2 + 0.2, 2.4, 3), 2.4, yd(0.0) - 1.4, 0.05, 'BALCLUTHA', 0.62, C('#d9b45a'), depth=0.03)
    # bowsprit + jib boom
    bow = D(1.0, 0.0)
    tip = L.P(Ln / 2 + 16, 0, yd(1.0) + 4.5)
    g.rod('wood', (bow[0], bow[1] + 0.6, bow[2]), tip, 0.35, C('#b89a6c'), n=8 if not lod else 4)
    # masts: fore, main, mizzen (square yards), spanker gaff on the mizzen
    masts = [(Ln * 0.26, 46.0, 0.55), (Ln * 0.02, 50.0, 0.6), (-Ln * 0.24, 42.0, 0.5)]
    for i, (a, h, r) in enumerate(masts):
        yds = [(0.2, 12.5), (0.36, 11.0), (0.52, 9.6), (0.66, 8.2), (0.8, 6.8), (0.92, 5.2)] if i < 2 else [(0.22, 10.0), (0.4, 9.0), (0.58, 7.8), (0.74, 6.4), (0.88, 5.0)]
        mast(g, L, a, yd(0.5 + a / Ln) - 0.1, h, r, yds, gaff=(10.0, 13.0) if i == 2 else None, lod=lod)
    if not lod:
        # standing rigging: shrouds to the channels, fore-and-aft stays
        RIG = C('#2a2622')
        for i, (a, h, r) in enumerate(masts):
            yb = yd(0.5 + a / Ln)
            for s in (-1, 1):
                for k in range(-2, 3):
                    g.rod('metal', L.P(a + k * 0.9, s * (hw(0.5 + a / Ln) + 0.3), yb + 1.0), L.P(a, s * 1.2, yb + h * 0.44), 0.04, RIG, n=3)
                for k in range(-1, 2):
                    g.rod('metal', L.P(a + k * 0.7 - 1.5, s * (hw(0.5 + a / Ln) + 0.3), yb + 1.0), L.P(a, s * 0.8, yb + h * 0.74), 0.03, RIG, n=3)
        tops = [(a, yd(0.5 + a / Ln) + h) for a, h, r in masts]
        g.rod('metal', L.P(tops[0][0], 0, tops[0][1] - 1), tip, 0.04, RIG, n=3)
        g.rod('metal', L.P(masts[0][0], 0, yd(0.5 + masts[0][0] / Ln) + masts[0][1] * 0.44), (bow[0], bow[1] + 1.0, bow[2]), 0.05, RIG, n=3)
        for i in range(2):
            g.rod('metal', L.P(tops[i + 1][0], 0, tops[i + 1][1] - 1), L.P(masts[i][0], 0, yd(0.5 + masts[i][0] / Ln) + masts[i][1] * 0.72), 0.04, RIG, n=3)
            g.rod('metal', L.P(masts[i + 1][0], 0, yd(0.5 + masts[i + 1][0] / Ln) + masts[i + 1][1] * 0.44), L.P(masts[i][0], 0, yd(0.5 + masts[i][0] / Ln) + 2.0), 0.05, RIG, n=3)
    return {'x': round(c[0], 2), 'z': round(c[1], 2), 'hx': Ln / 2, 'hz': 6.0, 'yaw': round(L.yaw(), 4), 'yMin': y_wl - 6, 'yMax': y_wl + 8}


def eureka(g, c, u, y_wl=0.0):
    """1890 side-wheel ferry: long two-deck house over wide guards, paddle boxes, walking beam, one tall stack"""
    L = Loc(c, u); lod = g.lod
    Ln = 84.0
    ship_hull(g, L, -Ln / 2, Ln / 2, 13.0, y_wl - 3.0, y_wl + 1.6, sheer=0.2, bow=0.12, stern=0.12, boot=y_wl + 0.1,
              col_top=C('#f0ede4'), col_bot=C('#2f3a30'), stern_w=0.85, deck_col=C('#9a8c74'))
    WH = C('#f0ede4'); GRN = C('#355a45')
    L.box(g, 'paint', -Ln / 2 + 3, Ln / 2 - 3, -11.5, 11.5, y_wl + 1.6, y_wl + 2.0, WH, bottom=True)        # guards
    L.box(g, 'paint', -Ln / 2 + 6, Ln / 2 - 6, -9.5, 9.5, y_wl + 2.0, y_wl + 5.2, WH)
    L.box(g, 'paint', -Ln / 2 + 8, Ln / 2 - 8, -8.0, 8.0, y_wl + 5.2, y_wl + 8.2, WH)
    L.box(g, 'paint', -Ln / 2 + 5.5, Ln / 2 - 5.5, -10.0, 10.0, y_wl + 5.1, y_wl + 5.35, GRN, top=True, bottom=True)
    L.box(g, 'paint', -Ln / 2 + 7.5, Ln / 2 - 7.5, -8.5, 8.5, y_wl + 8.1, y_wl + 8.35, GRN, top=True, bottom=True)
    for s in (-1, 1):
        for (y0, y1, b) in ((y_wl + 2.8, y_wl + 4.4, 9.52), (y_wl + 6.0, y_wl + 7.6, 8.02)):
            F = L.F(-Ln / 2 + 9, b, 0) if s > 0 else L.F(Ln / 2 - 9, -b, 2)
            g.fbox('shop', F, 0, Ln - 18, y0, y1, 0, 0.02, (1.0, 0.88, 0.66, 1.0), top=False)
        # paddle box: half drum with radial vanes pattern
        cx, cz = L.xz(0, s * 11.0)
        n_ = 16 if not lod else 8
        for k in range(n_):
            t0, t1 = math.pi * k / n_, math.pi * (k + 1) / n_
            P = lambda t, bb: L.P(math.cos(t) * 6.2, s * bb, y_wl + 1.4 + math.sin(t) * 6.2)
            g.poly('paint', [P(t0, 9.6), P(t1, 9.6), P(t1, 12.4), P(t0, 12.4)], WH, (L.d(math.cos((t0 + t1) / 2), 0)[0], math.sin((t0 + t1) / 2), L.d(math.cos((t0 + t1) / 2), 0)[2]))
        g.poly('paint', [L.P(math.cos(math.pi * k / n_) * 6.2, s * 12.4, y_wl + 1.4 + math.sin(math.pi * k / n_) * 6.2) for k in range(n_ + 1)], GRN, L.d(0, s))
    for a in (-Ln / 2 + 9, Ln / 2 - 9):   # pilot houses at both ends
        L.box(g, 'paint', a - 2.2, a + 2.2, -2.2, 2.2, y_wl + 8.35, y_wl + 10.6, WH)
        L.box(g, 'paint', a - 2.5, a + 2.5, -2.5, 2.5, y_wl + 10.6, y_wl + 10.85, GRN, top=True, bottom=True)
    x, z = L.xz(-4, 0); g.cyl('paint', x, z, 1.1, y_wl + 8.35, y_wl + 22.0, C('#1d1d1d'), n=12 if not lod else 6)
    # walking beam on its A-frame
    for s in (-1, 1):
        g.rod('wood', L.P(-4, s * 3.0, y_wl + 8.35), L.P(3, 0, y_wl + 17.5), 0.3, C('#5b4630'), n=6)
        g.rod('wood', L.P(10, s * 3.0, y_wl + 8.35), L.P(3, 0, y_wl + 17.5), 0.3, C('#5b4630'), n=6)
    g.rod('metal', L.P(-4.5, 0, y_wl + 16.6), L.P(10.5, 0, y_wl + 18.4), 0.35, C('#2b2b2b'), n=8)
    return {'x': round(c[0], 2), 'z': round(c[1], 2), 'hx': Ln / 2, 'hz': 11.5, 'yaw': round(L.yaw(), 4), 'yMin': y_wl - 3, 'yMax': y_wl + 10}


def schooner(g, c, u, y_wl=0.0):
    """three-masted lumber schooner (C.A. Thayer type), fore-and-aft rig, bow toward +u"""
    L = Loc(c, u); lod = g.lod
    Ln = 48.0
    D, hw, yd = ship_hull(g, L, -Ln / 2, Ln / 2, 11.0, y_wl - 3.5, y_wl + 2.6, sheer=0.7, bow=0.22, stern=0.14, boot=y_wl + 0.1,
                          col_top=C('#eeeae0'), col_bot=C('#6b2a1f'), stern_w=0.7, deck_col=C('#a9936f'))
    L.box(g, 'paint', -Ln / 2 + 3, -Ln / 2 + 11, -3.5, 3.5, yd(0.12), yd(0.12) + 2.2, C('#e4dccb'))
    bow = D(1.0, 0.0)
    g.rod('wood', (bow[0], bow[1] + 0.5, bow[2]), L.P(Ln / 2 + 11, 0, yd(1.0) + 3.0), 0.28, C('#b89a6c'), n=6)
    for a in (Ln * 0.24, Ln * 0.02, -Ln * 0.2):
        yb = yd(0.5 + a / Ln)
        x, z = L.xz(a, 0)
        g.cyl('wood', x, z, 0.35, yb, yb + 30.0, C('#b89a6c'), n=8 if not lod else 4, r1=0.2)
        g.rod('wood', L.P(a - 0.3, 0, yb + 17), L.P(a - 8.0, 0, yb + 19.5), 0.13, C('#3a2c22'), n=5)
        g.rod('wood', L.P(a - 0.3, 0, yb + 2.2), L.P(a - 9.5, 0, yb + 2.0), 0.15, C('#3a2c22'), n=5)
        if not lod:
            for s in (-1, 1):
                for k in (-1, 0, 1):
                    g.rod('metal', L.P(a + k * 0.8, s * (hw(0.5 + a / Ln) + 0.2), yb + 0.8), L.P(a, s * 0.4, yb + 20.0), 0.03, C('#2a2622'), n=3)
    return {'x': round(c[0], 2), 'z': round(c[1], 2), 'hx': Ln / 2, 'hz': 5.6, 'yaw': round(L.yaw(), 4), 'yMin': y_wl - 4, 'yMax': y_wl + 5}


def hyde_pier(g):
    lod = g.lod
    L = hyde_frame()
    cols = []
    yp = max(H(*L.xz(a, 0)) for a in (20, 50, 90)) + 0.05
    # timber pier head beyond the filled part: a = 100 .. 230, 24 m wide, piles, rails, lamp posts, the hay barge sheds
    a_s, a_e, hb = 100.0, 230.0, 12.0
    L.box(g, 'wood', a_s, a_e, -hb, hb, yp - 0.5, yp, C('#8e7b62'), bottom=True)
    if not lod:
        for a in range(int(a_s), int(a_e) + 1, 6):
            for b in (-hb + 0.5, -hb / 3, hb / 3, hb - 0.5):
                x, z = L.xz(a, b); g.cyl('wood', x, z, 0.3, -5.0, yp - 0.5, C('#5a4836'), n=6)
        for s in (-1, 1):
            for a in range(int(a_s), int(a_e), 8):
                x, z = L.xz(a + 4, s * (hb - 0.6)); g.cyl('metal', x, z, 0.2, yp, yp + 0.55, IRON, n=8)
            for a in range(int(a_s) + 10, int(a_e), 30):
                x, z = L.xz(a, s * (hb - 1.5))
                g.cyl('metal', x, z, 0.07, yp, yp + 4.2, C('#2c3a33'), n=6)
                g.lathe('lamp', x, z, [(0.12, yp + 4.2), (0.2, yp + 4.55), (0.0, yp + 4.75)], (1.0, 0.86, 0.6, 1.0), n=8)
    decks = [deck_seg(L.xz(a_s - 2, 0), L.xz(a_e - 0.5, 0), yp, yp, 2 * hb)]
    # ships: Balclutha on the east side, the paddle ferry on the west, the schooner further in on the west
    placed = []
    for fn, a, b in ((balclutha, 170.0, hb + 8.5), (eureka, 175.0, -(hb + 14.5)), (schooner, 125.0, -(hb + 8.0))):
        c = L.xz(a, b)
        if H(*c) < -1.5:
            cols.append(fn(g, c, L.u)); placed.append(fn.__name__)
    print('[hyde] ships', placed, 'pier y', round(yp, 2))
    zone = [[round(x, 1), round(z, 1)] for x, z in (L.xz(95, -40), L.xz(240, -40), L.xz(240, 40), L.xz(95, 40))]
    return {'colliders': cols, 'name': 'Hyde Street Pier', 'yG': round(yp, 2), 'top': 55.0, 'decks': decks, 'noTrees': [zone]}


# ================================================================================== Pier 39: the sea lion floats (K-Dock)
def tube(g, slot, pts, rads, col, n=8, flat=1.0, cap=True):
    """generalised cylinder through 3D centres with per-point radii (vertical radius scaled by `flat`)"""
    import mathutils
    V = [mathutils.Vector(p) for p in pts]
    rings = []
    for i, c in enumerate(V):
        d = (V[min(i + 1, len(V) - 1)] - V[max(i - 1, 0)]).normalized()
        side = d.cross(mathutils.Vector((0, 1, 0)))
        if side.length < 1e-4: side = mathutils.Vector((1, 0, 0))
        side.normalize(); up = side.cross(d).normalized()
        r = rads[i]
        rings.append([c + side * math.cos(2 * math.pi * k / n) * r + up * math.sin(2 * math.pi * k / n) * r * flat for k in range(n)])
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(n):
            j = (k + 1) % n
            m = (A[k] + A[j]) * 0.5 - V[i]
            g.poly(slot, [tuple(A[k]), tuple(A[j]), tuple(B[j]), tuple(B[k])], col, tuple(m))
    if cap:
        g.poly(slot, [tuple(p) for p in rings[-1]], col, tuple(V[-1] - V[-2]))


def sea_lion(g, x, z, y, yaw, pose, s, seed):
    """California sea lion (~2 m): pose 0 flat asleep, 1 head up, 2 sitting up on the fore flippers"""
    R = random.Random(seed)
    col = shade(C('#6d5440'), 0.75 + 0.45 * R.random())
    col_d = shade(col, 0.7)
    t = (math.cos(yaw), math.sin(yaw)); nn = (-t[1], t[0])
    P = lambda a, b, h: (x + t[0] * a * s + nn[0] * b * s, y + h * s, z + t[1] * a * s + nn[1] * b * s)
    bend = R.uniform(-0.25, 0.25)
    if pose == 0: prof = [(-1.0, 0.1), (-0.7, 0.2), (-0.3, 0.27), (0.1, 0.28), (0.45, 0.24), (0.7, 0.2), (0.95, 0.18)]
    elif pose == 1: prof = [(-1.0, 0.1), (-0.7, 0.2), (-0.3, 0.27), (0.1, 0.3), (0.45, 0.45), (0.62, 0.7), (0.82, 0.78)]
    else: prof = [(-0.9, 0.1), (-0.6, 0.22), (-0.3, 0.32), (0.0, 0.55), (0.15, 0.85), (0.2, 1.1), (0.35, 1.22)]
    rads = [0.07, 0.17, 0.25, 0.27, 0.2, 0.14, 0.1]
    pts = [P(a, bend * (a + 1) ** 2 * 0.3, h) for a, h in prof]
    lod = g.lod
    tube(g, 'paint', pts, [r * s for r in rads], col, n=8 if not lod else 5, flat=0.85)
    hx, hy, hz = pts[-1]; d = v2norm((pts[-1][0] - pts[-2][0], pts[-1][2] - pts[-2][2]))
    snout = (hx + d[0] * 0.2 * s, hy - 0.02 * s, hz + d[1] * 0.2 * s)
    tube(g, 'paint', [pts[-1], snout], [0.1 * s, 0.05 * s], col_d, n=6 if not lod else 4)
    if lod: return
    for sg in (-1, 1):
        # fore flippers splayed from the chest, hind flippers fanned at the tail
        c0 = pts[3] if pose < 2 else pts[3]
        tip = (c0[0] + nn[0] * sg * 0.55 * s + t[0] * 0.1 * s, (y + 0.05 * s) if pose < 2 else y + 0.02, c0[2] + nn[1] * sg * 0.55 * s + t[1] * 0.1 * s)
        g.poly('paint', [(c0[0] - t[0] * 0.12 * s, c0[1] - 0.05 * s, c0[2] - t[1] * 0.12 * s), (c0[0] + t[0] * 0.12 * s, c0[1] - 0.05 * s, c0[2] + t[1] * 0.12 * s), tip], col_d, (0, 1, 0))
        e = pts[0]
        g.poly('paint', [e, (e[0] - t[0] * 0.35 * s + nn[0] * sg * 0.22 * s, y + 0.03, e[2] - t[1] * 0.35 * s + nn[1] * sg * 0.22 * s),
                         (e[0] - t[0] * 0.3 * s + nn[0] * sg * 0.02 * s, y + 0.03, e[2] - t[1] * 0.3 * s + nn[1] * sg * 0.02 * s)], col_d, (0, 1, 0))


SL_ZONE = (700.0, 778.0, -3912.0, -3792.0)


def sea_lions(g):
    lod = g.lod
    cols = []
    x0, x1, z0, z1 = SL_ZONE
    R = random.Random(390)
    FLOAT = C('#7d6c58')
    floats = []
    for i in range(5):
        for j in range(6):
            cx, cz = x0 + 8 + i * 15.5 + R.uniform(-1.5, 1.5), z0 + 10 + j * 18.5 + R.uniform(-2, 2)
            if any(H(cx + dx, cz + dz) > -0.8 for dx in (-3, 0, 3) for dz in (-5, 0, 5)): continue
            if len(floats) >= 16: break
            floats.append((cx, cz))
    for k, (cx, cz) in enumerate(floats):
        yaw = R.uniform(-0.12, 0.12) - math.pi / 2
        Lf = Loc((cx, cz), (math.cos(yaw), math.sin(yaw)))
        Lf.box(g, 'wood', -4.2, 4.2, -1.9, 1.9, -0.2, 0.32, FLOAT)
        if not lod:
            for a in (-3.5, 0.0, 3.5):
                Lf.box(g, 'plain', a - 0.5, a + 0.5, -1.95, 1.95, -0.35, -0.2, C('#2e3134'), bottom=True)
            for q in range(7):
                a = -3.6 + q * 1.2
                Lf.box(g, 'wood', a - 0.03, a + 0.03, -1.9, 1.9, 0.32, 0.34, shade(FLOAT, 0.75))
        n_ = R.randint(3, 6)
        for m in range(n_):
            a = -3.2 + 6.4 * (m + 0.5) / n_ + R.uniform(-0.3, 0.3); b = R.uniform(-0.9, 0.9)
            px, pz = Lf.xz(a, b)
            pose = 0 if R.random() < 0.55 else (1 if R.random() < 0.7 else 2)
            sea_lion(g, px, pz, 0.34, yaw + math.pi / 2 + R.uniform(-0.6, 0.6) + (math.pi if R.random() < 0.5 else 0), pose, R.uniform(0.8, 1.1), k * 10 + m)
        cols.append(Lf.col(-4.2, 4.2, -1.9, 1.9, -1, 0.6))
    # a couple in the water, heads up
    if not lod:
        for m in range(4):
            px, pz = R.uniform(x0 + 5, x1 - 5), R.uniform(z0 + 5, z1 - 5)
            if H(px, pz) > -1: continue
            g.lathe('paint', px, pz, [(0.0, -0.1), (0.22, 0.0), (0.16, 0.3), (0.11, 0.45), (0.0, 0.5)], C('#4f3d2f'), n=8)
    print('[sealions] floats', len(floats))
    return {'colliders': cols, 'name': 'Sea lion floats', 'yG': 0.3, 'top': 3.0}


# ================================================================================== Lombard Street: the crooked block
SF_PAL = [('#f1ece0', '#c9b79a', '#3f5d6e'), ('#efe3c2', '#b89968', '#6b3a2a'), ('#dfe8e3', '#8fa89c', '#2f4a3f'), ('#f3d9c6', '#c58f6a', '#5b3a2a'),
          ('#e3e7ef', '#8f9bb3', '#34405a'), ('#f4ecd0', '#c2a770', '#4a4a3a'), ('#e9dccb', '#b08a6a', '#3d2f28'), ('#f6f3ec', '#a9a49a', '#28323a')]


def lombard_lane():
    """the crooked block's centreline from Hyde (west, top) to Leavenworth (east, bottom): [(x, z, y)]"""
    S = sites()['lombard']['streets']
    segs = [st['pts'] for st in S if st['name'] == 'Lombard Street' and st['width'] < 4.0]
    segs.sort(key=lambda p: min(q[0] for q in p))
    out = []
    for p in segs:
        p = p if p[0][0] < p[-1][0] else p[::-1]
        for q in p:
            if not out or math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > 0.3: out.append(tuple(q))
    return out


def lane_dist(lane, x, z):
    best = (1e9, 0.0)
    for k in range(len(lane) - 1):
        ax, az, ay = lane[k]; bx, bz, by = lane[k + 1]
        ex, ez = bx - ax, bz - az; l2 = ex * ex + ez * ez or 1
        t = max(0.0, min(1.0, ((x - ax) * ex + (z - az) * ez) / l2))
        d = math.hypot(x - ax - ex * t, z - az - ez * t)
        if d < best[0]: best = (d, ay + (by - ay) * t)
    return best


def lombard_houses():
    lane = lombard_lane()
    out = []
    for b in sites()['lombard']['buildings']:
        if len(b['ring']) < 3 or b['area'] < 25: continue
        c = b['c']
        if not (-14 < c[0] < 132): continue
        d, _ = lane_dist(lane, *c)
        if d < 26 and b['h'] > 4: out.append(b['i'])
    return out


def sf_house(g, i, lane, seed):
    """SF row house on OSM footprint i: bay-windowed front toward the crooked lane, plain party/rear walls, cornice + parapet"""
    R = random.Random(seed)
    r = ring_simplify(ring_out(ring_of(i)), 0.3)
    b = bld(i)
    c = centroid(r)
    _, ylane = lane_dist(lane, *c)
    # the front: the longest edge whose outward normal points at the lane
    best = None
    for a, e in edges_of(r):
        n = edge_n(a, e); m = v2lerp(a, e, 0.5)
        d0, _ = lane_dist(lane, *m); d1, _ = lane_dist(lane, m[0] + n[0] * 3, m[1] + n[1] * 3)
        L_ = v2len(v2sub(e, a))
        if d1 < d0 - 1.0 and L_ > 3.0 and (best is None or L_ > best[2]): best = (a, e, L_)
    base, trim, dark = [C(h) for h in SF_PAL[seed % len(SF_PAL)]]
    yG = min(H(*p) for p in r)
    top = yG + max(7.5, min(b['h'], 14.0)) + 0.5
    fh = 3.1
    win = Win(w=1.1, sill=0.9, head=2.4, depth=0.18, lit=0.35, sill_out=0.06, hood=0.12, frame_col=trim)
    for a, e in edges_of(r):
        F = Geo.frame(a, e); Le = v2len(v2sub(e, a))
        ya = min(H(*a), H(*e))
        if best and (a, e) == (best[0], best[1]):
            y0 = max(H(*a), H(*e)) + 0.1
            radial_panel(g, 'stucco', F, 0, Le, ya - 2.5, y0 + 0.2, None, shade(base, 0.85))
            # street level: garage door + entry, then bays on the floors above
            gw = min(3.0, Le * 0.45)
            g.fbox('wood', F, 0.4, 0.4 + gw, y0, y0 + 2.4, 0.0, 0.05, shade(dark, 1.1), top=False)
            g.fbox('paint', F, Le - 1.6, Le - 0.5, y0, y0 + 2.3, 0.0, 0.04, dark, top=False)
            radial_panel(g, 'stucco', F, 0, Le, y0 + 0.2, y0 + 2.9, None, base)
            nb = max(1, int(Le / 5.0)); bw = Le / nb
            facade(g, a, e, y0 + 2.9, top - 0.9, fh, 1.5, win, 'stucco', base, margin=0.6)
            if not g.lod:
                for k in range(nb):
                    vbay(g, F, (k + 0.5) * bw, min(3.4, bw - 0.8), y0 + 2.9, top - 1.0, fh, 0.75, base, glass_lit=0.45, slot='stucco')
            g.fbox('stucco', F, -0.1, Le + 0.1, top - 0.9, top - 0.35, 0.0, 0.55, trim, top=True, bottom=True)
            radial_panel(g, 'stucco', F, 0, Le, top - 0.9, top + 0.6, None, base)
            if R.random() < 0.4 and not g.lod:     # Mediterranean: clay tile coping over the front
                g.poly('rooftile', [Geo.fp(F, -0.2, top + 0.6, 0.6), Geo.fp(F, Le + 0.2, top + 0.6, 0.6), Geo.fp(F, Le + 0.2, top + 1.1, 0.0), Geo.fp(F, -0.2, top + 1.1, 0.0)],
                       TILE, (F[2][0], 1, F[2][1]), uv=[(-0.2, 0.7), (Le + 0.2, 0.7), (Le + 0.2, 0.0), (-0.2, 0.0)])
        else:
            facade(g, a, e, ya - 2.5, top + 0.6, fh, 3.0, Win(w=1.0, sill=1.0, head=2.3, depth=0.15, lit=0.25, sill_out=0.05) if Le > 4 else None,
                   'stucco', shade(base, 0.93), margin=1.0, blank=Le < 4)
    g.poly('roof', [(p[0], top + 0.25, p[1]) for p in ring_offset(r, -0.3)], C('#6f6c66'), (0, 1, 0))
    g.sweep('stucco', r, [(0.0, top + 0.6), (-0.3, top + 0.6)], trim)
    return wall_colliders(r, yG - 2.5, top)


def hydrangea(g, x, z, y, s, seed):
    R = random.Random(seed)
    g.lathe('leaf', x, z, [(0.0, y), (0.45 * s, y + 0.1), (0.62 * s, y + 0.45 * s), (0.5 * s, y + 0.8 * s), (0.0, y + 0.95 * s)], shade(C('#3f6a2e'), 0.85 + 0.3 * R.random()), n=8 if not g.lod else 5)
    if g.lod: return
    pal = [C('#d98cc4'), C('#8fa4e8'), C('#b48fe0'), C('#f0eef5'), C('#e59ab0'), C('#6f86d8')]
    col = pal[R.randrange(len(pal))]
    for k in range(5):
        a = 2 * math.pi * k / 5 + R.random()
        rr = 0.38 * s * R.uniform(0.6, 1.0)
        px, pz = x + math.cos(a) * rr, z + math.sin(a) * rr
        py = y + (0.72 + 0.2 * R.random()) * s
        g.lathe('paint', px, pz, [(0.0, py - 0.12), (0.17, py - 0.02), (0.14, py + 0.1), (0.0, py + 0.15)], shade(col, 0.85 + 0.3 * R.random()), n=5)


def lombard(g):
    lod = g.lod
    lane = lombard_lane()
    cols = []
    # red brick paving on the lane (4.4 m), laid along the curves; brick kerbs either side
    BR = C('#7e3326')
    Lw = 2.2
    acc = 0.0
    for k in range(len(lane) - 1):
        (ax, az, ay), (bx, bz, by) = lane[k], lane[k + 1]
        d = v2norm((bx - ax, bz - az)); n = (-d[1], d[0])
        if k > 0: dp = v2norm((ax - lane[k - 1][0], az - lane[k - 1][1])); na = v2norm((n[0] + (-dp[1]), n[1] + dp[0]))
        else: na = n
        if k < len(lane) - 2: dn = v2norm((lane[k + 2][0] - bx, lane[k + 2][1] - bz)); nb_ = v2norm((n[0] + (-dn[1]), n[1] + dn[0]))
        else: nb_ = n
        L_ = math.hypot(bx - ax, bz - az)
        A0, A1 = (ax - na[0] * Lw, ay + 0.06, az - na[1] * Lw), (ax + na[0] * Lw, ay + 0.06, az + na[1] * Lw)
        B0, B1 = (bx - nb_[0] * Lw, by + 0.06, bz - nb_[1] * Lw), (bx + nb_[0] * Lw, by + 0.06, bz + nb_[1] * Lw)
        g.poly('brickred', [A0, B0, B1, A1], BR, (0, 1, 0), uv=[(acc, -Lw), (acc + L_, -Lw), (acc + L_, Lw), (acc, Lw)])
        for s, P0, P1 in ((-1, A0, B0), (1, A1, B1)):
            g.poly('granite', [P0, P1, (P1[0], P1[1] + 0.16, P1[2]), (P0[0], P0[1] + 0.16, P0[2])], C('#9c958a'), (n[0] * -s, 0, n[1] * -s))
        acc += L_
    # planting: boxwood hedges along the lane, hydrangea beds between the switchbacks
    xs = [p[0] for p in lane]; zs = [p[1] for p in lane]
    houses = lombard_houses()
    hrings = [ring_of(i) for i in houses]
    R = random.Random(11)
    step = 1.5 if not lod else 3.0
    zmin, zmax = min(zs) - 7.5, max(zs) + 7.5
    nb = 0
    for i in range(int((max(xs) - min(xs) - 4) / step)):
        for j in range(int((zmax - zmin) / step)):
            x = min(xs) + 2 + (i + 0.5) * step; z = zmin + (j + 0.5) * step
            d, yl = lane_dist(lane, x, z)
            if d < Lw + 0.25 or d > 11.0: continue
            if any(point_in(ring_offset(ring_out(r_), 1.7), x, z) for r_ in hrings): continue
            yb = max(H(x, z), yl + 0.12)
            # raised planter cell above the paving (soil sides, lawn top), hedge next to the lane, hydrangeas in the beds
            e = step / 2 + 0.06                     # slight overlap: no seams between planter cells
            g.box('grass', x - e, x + e, yb - 0.7, yb + 0.3, z - e, z + e, C('#4c6b34'))
            if d < Lw + 1.3:
                g.box('leaf', x - e, x + e, yb + 0.3, yb + 0.85 + 0.1 * R.random(), z - e, z + e, shade(C('#2f5424'), 0.85 + 0.2 * R.random()))
            elif R.random() < (0.42 if not lod else 0.3):
                hydrangea(g, x + R.uniform(-0.3, 0.3), z + R.uniform(-0.3, 0.3), yb + 0.3, R.uniform(0.9, 1.3), nb); nb += 1
    print('[lombard] lane pts', len(lane), 'houses', len(houses), 'bushes', nb)
    for k, i in enumerate(houses):
        cols += sf_house(g, i, lane, k * 3 + 1)
    # lamps at the top and the bottom of the block
    for (x, z) in ((lane[0][0] + 3, lane[0][1] + 5), (lane[-1][0] - 3, lane[-1][1] - 5)):
        y = H(x, z)
        g.cyl('metal', x, z, 0.09, y, y + 4.2, C('#26302b'), n=8)
        g.lathe('lamp', x, z, [(0.1, y + 4.2), (0.22, y + 4.5), (0.18, y + 4.9), (0.0, y + 5.0)], (1.0, 0.86, 0.6, 1.0), n=8)
    zone = [[round(x, 1), round(z, 1)] for x, z in ((min(xs) - 2, zmin - 1), (max(xs) + 2, zmin - 1), (max(xs) + 2, zmax + 1), (min(xs) - 2, zmax + 1))]
    return {'colliders': cols, 'name': 'Lombard Street', 'yG': round(lane[-1][2], 2), 'top': round(lane[0][2] + 16, 1), 'noTrees': [zone], 'near': 420}


# ================================================================================== Sutro Tower: lattice legs, platforms, antenna masts
SUTRO_HIDE = [76640, 76658, 76659, 76660, 76661, 76662]
SUTRO_C = (-2947.2, 2182.0)
SU_RED = C('#c23a2b'); SU_WHITE = C('#eeeae2')


def sutro(g):
    lod = g.lod
    cx, cz = SUTRO_C
    y0 = H(cx, cz)
    LV = [(0.0, 28.0), (55.0, 23.5), (114.0, 16.8), (168.0, 11.8), (198.0, 10.6), (230.0, 10.0), (298.0, 9.6)]
    angs = [math.pi, -math.pi / 3, math.pi / 3]
    def rad(h):
        for (h0, r0), (h1, r1) in zip(LV, LV[1:]):
            if h <= h1: return r0 + (r1 - r0) * (h - h0) / (h1 - h0)
        return LV[-1][1]
    band = lambda h: SU_RED if int(h / 18.5) % 2 == 0 else SU_WHITE
    cols = []
    for a in angs:
        d = (math.cos(a), math.sin(a)); t = (-d[1], d[0])
        P = lambda h, o=(0.0, 0.0): (cx + d[0] * (rad(h) + o[0]) + t[0] * o[1], y0 + h, cz + d[1] * (rad(h) + o[0]) + t[1] * o[1])
        gx, gz = cx + d[0] * rad(0), cz + d[1] * rad(0)
        gy = H(gx, gz)
        g.box('concrete', gx - 3, gx + 3, min(gy, y0) - 2, y0 + 1.5, gz - 3, gz + 3, C('#a09c93'))
        cols.append({'x': round(gx, 2), 'z': round(gz, 2), 'hx': 3.0, 'hz': 3.0, 'yaw': 0.0, 'yMin': round(min(gy, y0) - 2, 2), 'yMax': round(y0 + 60, 2)})
        top = 298.0
        if lod:
            # one tapered prism per band (reads as the solid leg from afar)
            h = 1.5
            while h < top:
                h1 = min(top, h + 18.5 - (h % 18.5)) if h % 18.5 else min(top, h + 18.5)
                w0 = 4.4 - 2.4 * h / top; w1 = 4.4 - 2.4 * h1 / top
                g.rod('paint', P(h), P(h1), w0 * 0.55, band(h + 0.5), n=3)
                h = h1
        else:
            # triangular lattice leg: three chords + zig-zag lacing on each face
            k = 0; h = 1.5
            while h < top - 0.1:
                h1 = min(top, h + 4.6)
                w0 = 4.4 - 2.4 * h / top; w1 = 4.4 - 2.4 * h1 / top
                cs0 = [(w0 * 0.58 * math.cos(q), w0 * 0.58 * math.sin(q)) for q in (0.0, 2.094, 4.189)]
                cs1 = [(w1 * 0.58 * math.cos(q), w1 * 0.58 * math.sin(q)) for q in (0.0, 2.094, 4.189)]
                col = band((h + h1) / 2)
                for j in range(3):
                    g.rod('paint', P(h, cs0[j]), P(h1, cs1[j]), 0.28 - 0.12 * h / top, col, n=5)
                    jn = (j + 1) % 3
                    g.rod('paint', P(h, cs0[j] if k % 2 else cs0[jn]), P(h1, cs1[jn] if k % 2 else cs1[j]), 0.1, col, n=4)
                    if k % 3 == 0: g.rod('paint', P(h, cs0[j]), P(h, cs0[jn]), 0.09, col, n=4)
                h = h1; k += 1
        # antenna panels + radomes up the mast, obstruction light on top
        for hh in range(238, 292, 7):
            px, py, pz = P(hh, (1.4, 0.0))
            g.cyl('paint', px, pz, 0.75, py - 2.4, py + 2.4, C('#dcdcd6'), n=8 if not lod else 5)
        px, py, pz = P(top)
        g.cyl('metal', px, pz, 0.25, py, py + 4.5, C('#b9b9b3'), n=6)
        g.lathe('lamp', px, pz, [(0.0, py + 4.5), (0.35, py + 4.7), (0.0, py + 5.1)], (1.0, 0.18, 0.1, 1.0), n=6)
    # platforms: triangular trusses between the legs, outriggers at 198 m and the big crossarms at 230 m
    for h, dep, arm in ((55.0, 4.0, 0.0), (114.0, 3.6, 0.0), (168.0, 3.2, 0.0), (198.0, 3.0, 5.2), (230.0, 3.4, 21.0)):
        for i in range(3):
            a, b = angs[i], angs[(i + 1) % 3]
            A = (cx + math.cos(a) * rad(h), cz + math.sin(a) * rad(h)); B = (cx + math.cos(b) * rad(h), cz + math.sin(b) * rad(h))
            for yy in (h - dep / 2, h + dep / 2):
                g.rod('paint', (A[0], y0 + yy, A[1]), (B[0], y0 + yy, B[1]), 0.35, SU_WHITE if h < 200 else SU_RED, n=5 if not lod else 3)
            if not lod:
                n_ = int(v2len(v2sub(B, A)) / 4.0)
                for q in range(n_):
                    p0 = v2lerp(A, B, q / n_); p1 = v2lerp(A, B, (q + 1) / n_)
                    g.rod('paint', (p0[0], y0 + h - dep / 2, p0[1]), (p1[0], y0 + h + dep / 2, p1[1]), 0.12, SU_WHITE, n=4)
            else:
                g.poly('paint', [(A[0], y0 + h - dep / 2, A[1]), (B[0], y0 + h - dep / 2, B[1]), (B[0], y0 + h + dep / 2, B[1]), (A[0], y0 + h + dep / 2, A[1])], SU_WHITE, None)
            if arm:
                d = (math.cos(a), math.sin(a))
                A2 = (cx + d[0] * (rad(h) + arm), cz + d[1] * (rad(h) + arm))
                for yy in (h - dep / 2, h + dep / 2):
                    g.rod('paint', (A[0], y0 + yy, A[1]), (A2[0], y0 + h + dep / 2, A2[1]), 0.3, SU_RED, n=5 if not lod else 3)
                if not lod:
                    for q in range(int(arm / 3.5)):
                        p = v2lerp(A, A2, (q + 0.5) / int(arm / 3.5))
                        g.cyl('paint', p[0], p[1], 0.45, y0 + h + dep / 2, y0 + h + dep / 2 + 3.2, C('#e4e4de'), n=6)
                g.lathe('lamp', A2[0], A2[1], [(0.0, y0 + h + dep / 2), (0.3, y0 + h + dep / 2 + 0.2), (0.0, y0 + h + dep / 2 + 0.6)], (1.0, 0.18, 0.1, 1.0), n=6)
    # transmitter building at the foot
    br = ring_simplify(ring_out(ring_of(76640)), 1.0)
    yb = min(H(*p) for p in br)
    for a, b in edges_of(br):
        Le = v2len(v2sub(b, a))
        facade(g, a, b, yb - 1.5, yb + 7.5, 3.5, 4.0, Win(w=1.2, sill=1.2, head=2.4, depth=0.2, lit=0.3) if Le > 5 else None, 'concrete', C('#c9c4b8'), margin=1.2, blank=Le < 5)
    g.sweep('concrete', br, [(0.0, yb + 7.5), (0.2, yb + 7.5), (0.2, yb + 8.0), (-0.3, yb + 8.0)], C('#b2ada1'))
    g.poly('roof', [(p[0], yb + 7.55, p[1]) for p in ring_offset(br, -0.3)], C('#7b7872'), (0, 1, 0))
    cols += wall_colliders(br, yb - 1.5, yb + 8)
    return {'colliders': cols, 'name': 'Sutro Tower', 'replaces': 'sutroTower', 'yG': round(y0, 2), 'top': round(y0 + 303, 1), 'far': 7000, 'near': 700}


# ================================================================================== Twin Peaks: the Christmas Tree Point overlook
TP_HIDE = [76804]


def tp_frame():
    """overlook terrace: a runs north-south (+ = south), b > 0 west (uphill); the parapet is on the east edge (b = -B)"""
    return Loc((-2366.5, 2257.0), (0.0, 1.0))


def twin_peaks(g):
    lod = g.lod
    L = tp_frame()
    A, B = 14.0, 5.0
    cols = []
    yT = max(H(*L.xz(a, B + 1.0)) for a in (-A, -A / 2, 0, A / 2, A)) + 0.1
    STONE = C('#9d9384'); STONE_D = C('#83796b'); PAVE = C('#b5ab9a')
    # terrace floor + a stone retaining wall that follows the ground piece by piece + parapet with a coping
    L.box(g, 'paving', -A, A, -B, B, yT - 0.4, yT, PAVE)
    ylow = min(H(*L.xz(a, b)) for a in (-A, 0, A) for b in (-B, B)) - 0.6
    for (a0, b0, a1, b1) in ((-A, -B, A, -B), (-A, -B, -A, B), (A, -B, A, B)):
        P0, P1 = L.xz(a0, b0), L.xz(a1, b1)
        F = Geo.frame(P0, P1); Le = v2len(v2sub(P1, P0))
        c_ = L.xz(0, 0)
        if F[2][0] * (P0[0] - c_[0]) + F[2][1] * (P0[1] - c_[1]) < 0: F = Geo.frame(P1, P0)
        n_ = max(1, int(Le / 3.0))
        for q in range(n_):
            u0, u1 = Le * q / n_, Le * (q + 1) / n_
            pa, pb = Geo.fp(F, u0, 0, 0.3), Geo.fp(F, u1, 0, 0.3)
            yl = min(H(pa[0], pa[2]), H(pb[0], pb[2])) - 0.6
            if yl < yT - 0.05: radial_panel(g, 'stone', F, u0, u1, yl, yT, None, STONE_D)
        g.fbox('stone', F, -0.3, Le + 0.3, yT, yT + 0.95, -0.55, 0.0, STONE, top=True, back=True)
        g.fbox('granite', F, -0.4, Le + 0.4, yT + 0.95, yT + 1.12, -0.65, 0.1, C('#b9b1a3'), top=True, bottom=True)
    cols.append(L.col(-A - 0.6, A + 0.6, -B - 0.7, -B + 0.1, ylow, yT + 1.1))
    for s in (-1, 1): cols.append(L.col(s * A - 0.4, s * A + 0.4, -B, B - 4.0, ylow, yT + 1.1))
    # coin binoculars along the parapet, benches, interpretive boards, lamps
    if not lod:
        for k in range(6):
            a = -A + 5 + k * (2 * A - 10) / 5
            x, z = L.xz(a, -B + 1.1)
            g.cyl('metal', x, z, 0.08, yT, yT + 1.15, C('#3e4a52'), n=8)
            g.box('metal', x - 0.22, x + 0.22, yT + 1.15, yT + 1.45, z - 0.12, z + 0.12, C('#3e4a52'))
            for s in (-0.1, 0.1):
                q = L.xz(a + s, -B + 0.88)
                g.rod('metal', (q[0], yT + 1.32, q[1]), (q[0] - L.v[0] * 0.25, yT + 1.32, q[1] - L.v[1] * 0.25), 0.07, C('#27313a'), n=6)
            if k in (1, 4):
                Fb = L.F(a - 1.0, -B + 2.2, 0)
                g.fbox('granite', Fb, 0, 2.0, yT + 0.3, yT + 0.45, -0.3, 0.3, C('#b9b1a3'), top=True, back=True)
                g.fbox('granite', Fb, 0.2, 1.8, yT, yT + 0.3, -0.2, 0.2, STONE, top=True, back=True)
        for a in (-A + 2.5, A - 2.5):
            Fi = L.F(a, 0.0, 1)
            g.fbox('metal', Fi, -1.0, 1.0, yT + 0.6, yT + 1.6, -0.05, 0.05, C('#4a3b2c'), top=True, back=True)
            g.fbox('paint', Fi, -0.9, 0.9, yT + 0.7, yT + 1.5, 0.05, 0.06, C('#e8e0c8'), top=False)
            g.text('paint', Fi, 0.0, yT + 1.25, 0.07, 'TWIN PEAKS', 0.18, C('#3a2c20'), depth=0.01)
        for a in (-A + 8, 0.0, A - 8):
            x, z = L.xz(a, B - 1.0)
            g.cyl('metal', x, z, 0.07, yT, yT + 4.0, C('#27313a'), n=6)
            g.lathe('lamp', x, z, [(0.12, yT + 4.0), (0.2, yT + 4.35), (0.0, yT + 4.5)], (1.0, 0.86, 0.6, 1.0), n=8)
    decks = rect_decks(L, -A + 0.6, A - 0.6, -B + 0.6, B - 0.6, yT, strip=6.0)
    summit = [[-2540.0, 2120.0], [-2330.0, 2120.0], [-2330.0, 2420.0], [-2540.0, 2420.0]]
    return {'colliders': cols, 'name': 'Twin Peaks Overlook', 'yG': round(yT, 2), 'top': round(yT + 5, 1), 'decks': decks, 'noTrees': [summit]}


# ================================================================================== Lands End: Cliff House, Sutro Baths ruins, the giant camera
CLIFF_HIDE = [30813, 30812]


def cliff_house(g):
    lod = g.lod
    cols = []
    r = ring_simplify(ring_out(ring_of(30813)), 0.6)
    yG = min(H(*p) for p in r)
    yF = max(H(*p) for p in r) + 0.1
    WH = C('#f0ede4'); WH_D = C('#d9d4c8'); GLS = C('#3f5561')
    # the 1909 neoclassical block: two tall storeys over a cliff-side basement, big ocean windows, flat roof + parapet
    top = yF + 8.2
    ww = Win(w=2.6, sill=0.6, head=3.2, depth=0.25, glass='win', lit=0.55, mull=True, sill_out=0.08, frame_col=C('#50575a'))
    for a, b in edges_of(r):
        Le = v2len(v2sub(b, a)); F = Geo.frame(a, b)
        radial_panel(g, 'concrete', F, 0, Le, yG - 2.0, yF, None, WH_D)
        if Le > 4: facade(g, a, b, yF, top - 0.8, 3.7, 3.4, ww, 'concrete', WH, margin=0.8, band=(0.25, 0.1, WH_D))
        else: radial_panel(g, 'concrete', F, 0, Le, yF, top - 0.8, None, WH)
        radial_panel(g, 'concrete', F, 0, Le, top - 0.8, top + 0.7, None, WH)
    cornice(g, r, top - 0.5, 0.5, WH_D, slot='concrete')
    g.poly('roof', [(p[0], top + 0.1, p[1]) for p in ring_offset(r, -0.4)], C('#8e8b85'), (0, 1, 0))
    g.sweep('concrete', r, [(0.0, top + 0.7), (-0.4, top + 0.7)], WH_D)
    # rooftop sign facing the ocean + the glass north wing (the modern addition)
    west = min(edges_of(r), key=lambda e: v2lerp(e[0], e[1], 0.5)[0])
    F = Geo.frame(*west); Le = v2len(v2sub(west[1], west[0]))
    if not lod:
        for uu in (Le * 0.2, Le * 0.8):
            g.fbox('metal', F, uu - 0.06, uu + 0.06, top + 0.7, top + 2.6, -0.6, -0.5, C('#3a3f42'), top=True)
        g.text('neon', F, Le / 2, top + 1.0, -0.45, 'CLIFFSIDE HOUSE', 1.1, (1.0, 0.9, 0.7, 1.0), depth=0.08)
    north = min(r, key=lambda p: p[1])
    Lw = Loc((north[0] + 4.0, north[1] + 2.0), (0.0, 1.0))
    yw = H(*Lw.xz(0, 0))
    if yw < yF + 3:
        Lw.box(g, 'concrete', -5, 5, -7, 7, min(yw, yF) - 2.0, yF, WH_D)
        Lw.box(g, 'glassc', -4.8, 4.8, -6.8, 6.8, yF, yF + 6.2, GLS, top=False)
        Lw.box(g, 'concrete', -5.4, 5.4, -7.4, 7.4, yF + 6.2, yF + 6.7, WH, bottom=True)
        cols.append(Lw.col(-5, 5, -7, 7, yF - 2, yF + 6.7))
    cols += wall_colliders(r, yG - 2, top + 0.7)
    # seaward viewing terrace (railed) on the cliff edge
    Lt = Loc(v2add(v2lerp(*west, 0.5), v2mul(edge_n(*west), 4.0)), v2norm(v2sub(west[1], west[0])))
    yt = yF - 0.1
    Lt.box(g, 'concrete', -Le / 2, Le / 2, -3.6, 3.6, yt - 3.0, yt, C('#cfc9bd'))
    if not lod:
        rail_line(g, Lt.xz(-Le / 2, 3.5), Lt.xz(Le / 2, 3.5), yt, h=1.05, col=C('#e6e2d8'), slot='paint')
    decks = [deck_seg(Lt.xz(-Le / 2 + 0.5, 0), Lt.xz(Le / 2 - 0.5, 0), yt, yt, 7.0)]
    # the giant camera (camera obscura) on the terrace below, a little camera-shaped building
    cc = centroid(ring_of(30812)); yc = H(*cc)
    Lc = Loc(cc, (0.0, 1.0))
    Lc.box(g, 'stucco', -2.6, 2.6, -2.6, 2.6, yc - 1.0, yc + 3.0, C('#f0e2b8'))
    Lc.box(g, 'paint', -2.9, 2.9, -2.9, 2.9, yc + 3.0, yc + 3.3, C('#2c3e50'), bottom=True)
    Lc.box(g, 'paint', -1.9, 1.9, -1.4, 1.4, yc + 3.3, yc + 5.3, C('#1f1f1f'))
    Lc.box(g, 'paint', -1.8, -1.0, -1.45, 1.45, yc + 5.3, yc + 5.8, C('#c9c9c9'))
    x, z = Lc.xz(0.6, 0.0)
    g.rod('paint', (x, yc + 4.3, z), (x - 1.9, yc + 4.3, z), 0.9, C('#2f2f2f'), n=12 if not lod else 6)
    g.rod('glassc', (x - 1.9, yc + 4.3, z), (x - 2.0, yc + 4.3, z), 0.72, C('#8fb0c0'), n=12 if not lod else 6)
    if not lod:
        g.text('paint', Lc.F(-2.6, -2.62, 0), 2.6, yc + 2.2, 0.02, 'GIANT CAMERA', 0.36, C('#b3261e'), depth=0.02)
    cols.append(Lc.col(-2.6, 2.6, -2.6, 2.6, yc - 1, yc + 5.3))
    return {'colliders': cols, 'name': 'Cliff House + the giant camera', 'replaces': 'cliffHouse', 'yG': round(yF, 2), 'top': round(top + 3, 1), 'decks': decks}


SB_FRAME = ((-8316.0, -575.0), (0.0, -1.0))           # a north along the cove, b > 0 east (toward the cliff)
SB_BOX = (-20.0, 12.0, -12.0, 14.0)


def sutro_baths(g):
    """ruined concrete pool walls in the cove north of the Cliff House, the basins still holding sea water"""
    lod = g.lod
    L = Loc(*SB_FRAME)
    A0, A1, B0, B1 = SB_BOX
    R = random.Random(1896)
    CONC = C('#9a958b'); CONC_D = C('#77736b')
    yw = 3.0
    cols = []
    g.poly('water', [L.P(A0, B0, yw), L.P(A1, B0, yw), L.P(A1, B1, yw), L.P(A0, B1, yw)], C('#28413f'), (0, 1, 0))
    walls = [((A0, B0), (A1, B0)), ((A0, B1), (A1, B1)), ((A0, B0), (A0, B1)), ((A1, B0), (A1, B1)), ((-4, B0), (-4, B1)), ((-4, 1), (A1, 1))]
    for k in range(4):
        walls.append(((A0 + 3 + k * 4.0, B0), (A0 + 3 + k * 4.0, B0 + 8.0)))
    for (pa, pb) in walls:
        L_ = v2len(v2sub(pb, pa)); n = max(1, int(L_ / 2.6))
        for q in range(n):
            if R.random() < 0.2: continue
            t0, t1 = q / n, (q + 1) / n - 0.04
            A_ = (pa[0] + (pb[0] - pa[0]) * t0, pa[1] + (pb[1] - pa[1]) * t0); B_ = (pa[0] + (pb[0] - pa[0]) * t1, pa[1] + (pb[1] - pa[1]) * t1)
            outer = pa[1] == B0 and pb[1] == B0
            hh = (R.uniform(1.4, 3.2) if outer else R.uniform(0.3, 1.6)) if R.random() < 0.85 else R.uniform(2.5, 4.5)
            P0, P1 = L.xz(*A_), L.xz(*B_)
            yy = min(H(*P0), H(*P1)) - 0.8
            g.seg_box('concrete', P0, P1, yy, yw + hh, 0.8 if outer else 0.6, shade(CONC, 0.8 + 0.3 * R.random()))
            if yw + hh - max(H(*P0), H(*P1)) > 1.1:
                t = v2norm(v2sub(P1, P0)); Lq = v2len(v2sub(P1, P0))
                cols.append({'x': round((P0[0] + P1[0]) / 2, 2), 'z': round((P0[1] + P1[1]) / 2, 2), 'hx': round(Lq / 2, 2), 'hz': 0.35, 'yaw': round(math.atan2(-t[1], t[0]), 4),
                             'yMin': round(yy, 2), 'yMax': round(yw + hh, 2)})
    # the stair down from the cliff path on the east side + column stumps standing in the water
    for k in range(12):
        a0 = A1 - 8.0
        y_ = yw + 0.4 + k * 0.32
        L.box(g, 'concrete', a0, a0 + 3.0, B1 + 0.4 + k * 0.55, B1 + 0.95 + k * 0.55, min(H(*L.xz(a0, B1 + k * 0.55)), y_) - 1.0, y_, CONC)
    if not lod:
        for k in range(10):
            x, z = L.xz(R.uniform(A0 + 2, A1 - 2), R.uniform(B0 + 2, B1 - 2))
            g.cyl('concrete', x, z, 0.35, min(H(x, z), yw) - 0.5, yw + R.uniform(0.3, 1.8), CONC_D, n=8)
    # walkable ruins: the stair is a ramp deck; level concrete promenades on the old pool walls (the paths visitors walk:
    # the east wall below the cliff, the dividing wall across the basins, the tank row along the north basin)
    decks = []
    ys = yw + 0.4 + 11 * 0.32
    decks.append(deck_seg(L.xz(A1 - 6.5, B1 + 0.6 + 11 * 0.55), L.xz(A1 - 6.5, B1 + 0.4), ys, yw + 0.4, 2.8))
    yp = yw + 1.3
    for (pa, pb, wd) in (((A0 + 1.0, B1 - 0.9), (A1 - 1.0, B1 - 0.9), 1.8), ((-4.0, B0 + 1.0), (-4.0, B1 - 1.8), 1.4), ((-3.2, 1.0), (A1 - 1.0, 1.0), 1.4),
                         ((A0 + 1.0, B0 + 9.0), (-4.8, B0 + 9.0), 1.4)):
        P0, P1 = L.xz(*pa), L.xz(*pb)
        g.seg_box('concrete', P0, P1, min(H(*P0), H(*P1), yw) - 0.8, yp, wd, shade(CONC, 0.95))
        decks.append(deck_seg(P0, P1, yp, yp, wd - 0.2))
    L.box(g, 'concrete', A1 - 8.0, A1 - 5.0, B1 - 1.8, B1 + 0.4, yw - 0.5, yw + 0.4, CONC)
    decks.append(deck_seg(L.xz(A1 - 6.5, B1 + 0.3), L.xz(A1 - 6.5, B1 - 0.9), yw + 0.4, yp, 2.6))
    zone = [[round(x, 1), round(z, 1)] for x, z in (L.xz(A0 - 4, B0 - 4), L.xz(A1 + 4, B0 - 4), L.xz(A1 + 4, B1 + 10), L.xz(A0 - 4, B1 + 10))]
    return {'colliders': cols, 'name': 'Sutro Baths ruins', 'yG': yw, 'top': yw + 5, 'noTrees': [zone], 'decks': decks}


# ================================================================================== Pier 15: the science museum shed + the bay observatory
EXP_HIDE = [9299, 9346]


def exp_frame():
    """pier 15 frame: a from the Embarcadero bulkhead (a = 0, SW) out along the pier (NE), b across (+ = SE)"""
    A = (1832.0, -2878.0); B = (2023.0, -3021.0)
    u = v2norm(v2sub(B, A))
    return Loc(A, u)


def exp_box():
    L = exp_frame()
    q = [L.loc(*p) for p in ring_of(9299)]
    return L, max(2.0, min(p[0] for p in q)), max(p[0] for p in q), min(p[1] for p in q), max(p[1] for p in q)


def exploratorium(g):
    lod = g.lod
    L, a0, a1, b0, b1 = exp_box()
    cols = []
    r = ring_simplify(ring_out(ring_of(9299)), 1.0)
    yg = max(H(*L.xz(a, 0)) for a in (20, 80, 140, 200)) + 0.05
    ys = yg + 9.0
    SH = C('#d8d2c3'); SH_D = C('#b3ab98'); STL = C('#5d6a6f'); RED = C('#b9412f')
    # long shed walls: steel-framed glazing bands above concrete, roll-up doors every few bays
    for A, B in edges_of(r):
        F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
        if Le < 6:
            radial_panel(g, 'stucco', F, 0, Le, yg - 2.5, ys, None, SH); continue
        nb = max(1, int(Le / 7.6))
        for k in range(nb):
            u0 = k * Le / nb; u1 = u0 + Le / nb
            door = k % 4 == 2 and Le > 40
            hole = opening_poly((u0 + u1) / 2, 5.0 if door else (u1 - u0) - 1.4, yg + (0.0 if door else 3.2), yg + (5.2 if door else 7.4), 0)
            radial_panel(g, 'stucco', F, u0, u1, yg - 2.5, ys, hole, SH)
            if door: recess(g, F, hole, 0.3, 'stucco', SH_D, 'metal', C('#7c7f7a'))
            else:
                recess(g, F, hole, 0.25, 'stucco', SH_D, 'win', glass_col(0.5), mull=('metal', STL, 0.08))
                if not lod:
                    for q in range(1, 4):
                        uu = u0 + 0.7 + q * ((u1 - u0) - 1.4) / 4
                        g.fbox('metal', F, uu - 0.05, uu + 0.05, yg + 3.2, yg + 7.4, -0.25, -0.18, STL, top=False)
            if not lod: g.fbox('stucco', F, u0 - 0.35, u0 + 0.35, yg - 2.5, ys + 0.2, 0, 0.3, SH_D, top=True)
        g.fbox('paint', F, 0, Le, ys - 0.3, ys + 0.2, 0, 0.25, STL, top=True, bottom=True)
    cols += wall_colliders(r, yg - 3, ys)
    # roof: two shallow pitches + the raised clerestory monitor along the ridge, solar panels on the pitches
    ym = ys + 2.2
    for s in (-1, 1):
        e = b1 if s > 0 else b0
        g.poly('roof', [L.P(a0, e + 0.4 * s, ys), L.P(a1, e + 0.4 * s, ys), L.P(a1, s * 5.0, ym), L.P(a0, s * 5.0, ym)], C('#7d8280'), (L.v[0] * s, 1, L.v[1] * s))
        g.fbox('glassc', L.F(a0 + 1, s * 5.0, 0) if s > 0 else L.F(a1 - 1, -5.0, 2), 0, a1 - a0 - 2, ym, ym + 1.6, -0.05, 0.0, C('#8aa0a8'), top=False)
        if not lod:
            for k in range(int((a1 - a0 - 10) / 6.0)):
                a = a0 + 5 + k * 6.0
                bm = s * (5.0 + (abs(e) - 5.0) * 0.5)
                pts = [L.P(a, bm - s * 5.5, ys + 1.8 - 0.1), L.P(a + 5.2, bm - s * 5.5, ys + 1.8 - 0.1), L.P(a + 5.2, bm + s * 5.5, ys + 0.5), L.P(a, bm + s * 5.5, ys + 0.5)]
                pts = [(p[0], p[1] + 0.35, p[2]) for p in pts]
                g.poly('glassc', pts, C('#1f2f4a'), (0, 1, 0))
    L.box(g, 'roof', a0, a1, -5.0, 5.0, ym + 1.6, ym + 1.9, C('#6f7472'))
    for aa, d_ in ((a0, -1), (a1, 1)):
        g.poly('stucco', [L.P(aa, b0, ys), L.P(aa, b1, ys), L.P(aa, 5.0, ym), L.P(aa, -5.0, ym)], SH_D, L.d(d_, 0))
    # bulkhead on the Embarcadero: classical front with a big arched portal
    Fb = (L.xz(a0 - 0.2, b0), L.v, (-L.u[0], -L.u[1]))      # runs along the bulkhead (b0 -> b1), faces the street (-u)
    Wb = b1 - b0
    hole = opening_poly(Wb / 2, 9.0, yg, yg + 8.5, 1, 14 if not lod else 6)
    radial_panel(g, 'stucco', Fb, 0, Wb, yg - 1.0, ys + 3.5, hole, SH)
    recess(g, Fb, hole, 0.8, 'stucco', SH_D, 'shop', (1.0, 0.88, 0.66, 1.0), mull=('metal', STL, 0.1))
    for uu in (1.5, Wb / 2 - 7.0, Wb / 2 + 6.0, Wb - 2.5):
        g.fbox('stucco', Fb, uu, uu + 1.0, yg - 1.0, ys + 3.5, 0, 0.6, SH_D, top=True)
    g.fbox('stucco', Fb, -0.3, Wb + 0.3, ys + 3.5, ys + 4.1, -0.2, 0.8, SH_D, top=True, bottom=True)
    if not lod:
        g.text('paint', Fb, Wb / 2, ys + 1.3, 0.02, 'PIER 15', 1.3, C('#39564a'), depth=0.04)
        g.fbox('paint', Fb, Wb / 2 - 9, Wb / 2 + 9, yg + 9.0, yg + 10.4, 0.0, 0.15, RED, top=True, bottom=True)
        g.text('neon', Fb, Wb / 2, yg + 9.25, 0.17, 'THE SCIENCE PIER', 0.9, (1.0, 0.95, 0.85, 1.0), depth=0.04)
    # the bay observatory: two-storey glass box at the pier's far end (north side)
    orr = ring_out(ring_of(9346))
    yo = min(H(*p) for p in orr) + 0.05
    g.prism('concrete', orr, yo - 2.0, yo + 0.4, C('#c9c4b8'), top=True)
    for A, B in edges_of(orr):
        F = Geo.frame(A, B); Le = v2len(v2sub(B, A))
        g.fbox('glassc', F, 0.1, Le - 0.1, yo + 0.4, yo + 9.4, -0.05, 0.0, C('#6f8c99'), top=False)
        g.fbox('shop', F, 0.2, Le - 0.2, yo + 0.4, yo + 9.4, -0.3, -0.25, (1.0, 0.92, 0.78, 1.0) if not lod else (0.9, 0.85, 0.75, 1.0), top=False)
        if not lod:
            nm = max(1, int(Le / 2.0))
            for k in range(nm + 1):
                g.fbox('metal', F, k * Le / nm - 0.05, k * Le / nm + 0.05, yo + 0.4, yo + 9.4, -0.02, 0.08, C('#3c4447'), top=False)
            g.fbox('metal', F, 0, Le, yo + 4.8, yo + 5.1, -0.1, 0.15, C('#3c4447'), top=True, bottom=True)
    g.prism('roof', ring_offset(orr, 0.8), yo + 9.4, yo + 9.9, C('#e9e7e1'), top=True, bottom=True)
    cols += wall_colliders(orr, yo - 2, yo + 9.9)
    return {'colliders': cols, 'name': 'Pier 15 - The Science Pier', 'yG': round(yg, 2), 'top': round(ym + 2, 1)}


# ================================================================================== Balmy Alley: murals on the fences, garage doors and walls
def mural_uv(k, u0=0.0, u1=1.0, cols=2, rows=4):
    """Blender-space UVs (v up) of mural atlas cell k (quad: bottom-left, bottom-right, top-right, top-left); u0..u1 = sub-span"""
    c, r = k % cols, k // cols
    a0, a1 = c / cols + 0.003, (c + 1) / cols - 0.003
    ua, ub = a0 + (a1 - a0) * u0, a0 + (a1 - a0) * u1
    v1 = 1.0 - r / rows - 0.003; v0 = 1.0 - (r + 1) / rows + 0.003
    return [(ua, v0), (ub, v0), (ub, v1), (ua, v1)]


def balmy_line():
    S = sites()['balmy']['streets']
    segs = [st['pts'] for st in S if st['name'] == 'Balmy Street']
    pts = sorted([tuple(q) for p in segs for q in p], key=lambda q: q[1])
    out = []
    for q in pts:
        if not out or math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > 0.5: out.append(q)
    return out


def balmy(g):
    lod = g.lod
    line = balmy_line()
    A, B = (line[0][0], line[0][1]), (line[-1][0], line[-1][1])
    u = v2norm(v2sub(B, A)); Lg = v2len(v2sub(B, A))
    L = Loc(A, u)
    R = random.Random(24)
    cols = []
    rings = [bb['ring'] for bb in buildings_near((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 120) if len(bb['ring']) >= 3]
    def hit(p):
        return any(point_in(r_, *p) for r_ in rings)
    k = 0
    for s in (-1, 1):
        a = 14.0
        while a < Lg - 14.0:
            seg = R.uniform(4.0, 6.5)
            a1 = min(Lg - 14.0, a + seg)
            am = (a + a1) / 2
            # distance to the first building face on this side (else a fence on the lot line)
            d = None
            for q in range(10):
                dd = 2.6 + q * 0.3
                if hit(L.xz(am, s * dd)): d = dd; break
            off = (d - 0.07) if d else 3.3
            wall = d is not None
            hgt = R.uniform(3.2, 4.6) if wall else R.uniform(2.1, 2.6)
            P0, P1 = L.xz(a, s * off), L.xz(a1, s * off)
            y0 = min(H(*P0), H(*P1)) - 0.3
            F = Geo.frame(P0, P1) if s > 0 else Geo.frame(P0, P1)
            # the painted face looks into the alley (toward b = 0)
            if (F[2][0] * L.v[0] + F[2][1] * L.v[1]) * s > 0: F = Geo.frame(P1, P0)
            Le = v2len(v2sub(P1, P0))
            if not wall:   # plank fence: posts, cap rail, back face plain wood
                g.fbox('wood', F, 0, Le, y0, y0 + hgt, -0.08, 0.0, C('#7b6247'), top=True, back=True)
                if not lod:
                    for q in range(int(Le / 2.0) + 1):
                        g.fbox('wood', F, q * Le / max(1, int(Le / 2.0)) - 0.06, q * Le / max(1, int(Le / 2.0)) + 0.06, y0, y0 + hgt + 0.15, -0.14, 0.02, C('#5d4a36'), top=True)
            garage = wall and R.random() < 0.35 and Le > 3.6
            m = R.randrange(8)
            yb = y0 + 0.3
            face = [Geo.fp(F, 0.02, yb, 0.02), Geo.fp(F, Le - 0.02, yb, 0.02), Geo.fp(F, Le - 0.02, y0 + hgt - 0.05, 0.02), Geo.fp(F, 0.02, y0 + hgt - 0.05, 0.02)]
            uvs = mural_uv(m, R.uniform(0.0, 0.25), R.uniform(0.75, 1.0))
            g.poly('mural', face, (1.0, 1.0, 1.0, 1.0), (F[2][0], 0, F[2][1]), uv=uvs)
            if garage and not lod:   # roll-up door ribs over the mural + a frame
                for q in range(int((hgt - 0.6) / 0.25)):
                    yy = yb + 0.2 + q * 0.25
                    g.fbox('metal', F, 0.3, Le - 0.3, yy, yy + 0.03, 0.02, 0.05, C('#3a3a3a'), top=True)
            cols.append({'x': round((P0[0] + P1[0]) / 2, 2), 'z': round((P0[1] + P1[1]) / 2, 2), 'hx': round(Le / 2, 2), 'hz': 0.1,
                         'yaw': round(math.atan2(-F[1][1], F[1][0]), 4), 'yMin': round(y0, 2), 'yMax': round(y0 + hgt, 2)})
            k += 1
            a = a1 + R.uniform(0.2, 1.2)
    # alley lamps
    for a in (30.0, 80.0, 130.0):
        if a > Lg - 10: continue
        x, z = L.xz(a, 3.0); y = H(x, z)
        g.cyl('metal', x, z, 0.08, y, y + 4.5, C('#2e3434'), n=6)
        g.rod('metal', (x, y + 4.4, z), (x - L.v[0] * 1.0, y + 4.6, z - L.v[1] * 1.0), 0.05, C('#2e3434'), n=4)
        g.box('lamp', x - L.v[0] * 1.1 - 0.2, x - L.v[0] * 1.1 + 0.2, y + 4.4, y + 4.55, z - L.v[1] * 1.1 - 0.2, z - L.v[1] * 1.1 + 0.2, (1.0, 0.86, 0.6, 1.0))
    print('[balmy] mural panels', k, 'alley', round(Lg, 1))
    return {'colliders': cols, 'name': 'Balmy Alley', 'yG': round(H(*A), 2), 'top': 20.0}


# ================================================================================== Dolores Park: palms, the playground, the J line, courts
def dolores(g):
    lod = g.lod
    cols = []
    R = random.Random(1776)
    CONC = C('#c9c3b6')
    # palms along the Dolores Street edge of the park
    for k in range(14):
        z = 1560 + k * 21.0
        x = -580.0 + R.uniform(-1.0, 1.0)
        if not (1550 < z < 1850): continue
        palm(g, x, z, H(x, z), R.uniform(11.0, 15.0), 100 + k)
        cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 0.6, 'hz': 0.6, 'yaw': 0.0, 'yMin': round(H(x, z) - 1, 2), 'yMax': round(H(x, z) + 8, 2)})
    # the playground (north-east): soft-surface pad, a big climbing tower + slides, swings, a sand pit, fence
    Lp = Loc((-625.0, 1600.0), (1.0, 0.0))
    yp = max(H(*Lp.xz(a, b)) for a in (-18, 0, 18) for b in (-14, 0, 14)) + 0.05
    Lp.box(g, 'concrete', -19, 19, -15, 15, yp - 1.2, yp, C('#5f7fa6'))
    Lp.box(g, 'concrete', -8, 2, -6, 6, yp, yp + 0.03, C('#d9b36a'))
    for (a, b, h) in ((-4.0, 0.0, 6.5), (6.0, -7.0, 4.0)):
        for s1 in (-1, 1):
            for s2 in (-1, 1):
                x, z = Lp.xz(a + s1 * 1.6, b + s2 * 1.6); g.cyl('metal', x, z, 0.09, yp, yp + h, C('#e8b83a'), n=6)
        for yy in (h * 0.4, h * 0.75):
            Lp.box(g, 'wood', a - 1.8, a + 1.8, b - 1.8, b + 1.8, yp + yy, yp + yy + 0.15, C('#8a6a48'), bottom=True)
        Lp.box(g, 'paint', a - 1.9, a + 1.9, b - 1.9, b + 1.9, yp + h, yp + h + 0.1, C('#d6453a'), bottom=True)
        g.poly('paint', [Lp.P(a - 1.9, b - 1.9, yp + h + 0.1), Lp.P(a + 1.9, b - 1.9, yp + h + 0.1), Lp.P(a, b, yp + h + 1.8)], C('#d6453a'), None)
        g.poly('paint', [Lp.P(a + 1.9, b + 1.9, yp + h + 0.1), Lp.P(a - 1.9, b + 1.9, yp + h + 0.1), Lp.P(a, b, yp + h + 1.8)], C('#c23c32'), None)
        # slide: a curved chute down to the pad
        prev = None
        for q in range(9):
            t = q / 8
            p = Lp.P(a + 1.8 + t * 6.0, b + 0.6 * math.sin(t * 3.0), yp + h * 0.75 * (1 - t) ** 1.3 + 0.35)
            if prev: g.rod('paint', prev, p, 0.42, C('#37a0c8'), n=8 if not lod else 4)
            prev = p
        cols.append(Lp.col(a - 1.9, a + 1.9, b - 1.9, b + 1.9, yp - 1, yp + h))
    # swing set: A-frame legs at both ends, the top bar, two swings
    for a in (10.0, 14.0):
        for sg in (-1, 1):
            g.rod('metal', Lp.P(a, 8.0 + sg * 1.4, yp), Lp.P(a, 8.0, yp + 3.0), 0.06, C('#2f6b57'), n=5)
    g.rod('metal', Lp.P(9.8, 8.0, yp + 3.0), Lp.P(14.2, 8.0, yp + 3.0), 0.07, C('#2f6b57'), n=6)
    for q in range(2):
        for sg in (-0.25, 0.25):
            g.rod('metal', Lp.P(11.0 + q * 2.0 + sg, 8.0, yp + 3.0), Lp.P(11.0 + q * 2.0 + sg, 8.0, yp + 0.6), 0.015, C('#555555'), n=3)
        Lp.box(g, 'paint', 10.7 + q * 2.0, 11.3 + q * 2.0, 7.85, 8.15, yp + 0.55, yp + 0.62, C('#2b2b2b'))
    if not lod:
        for (p0, p1) in (((-19, -15), (19, -15)), ((19, -15), (19, 15)), ((19, 15), (-19, 15)), ((-19, 15), (-19, -15))):
            rail_line(g, Lp.xz(*p0), Lp.xz(*p1), yp, h=1.1, col=C('#2f3a36'), post=2.5)
    # tennis courts (north-west), fenced
    Lt = Loc((-712.0, 1572.0), (1.0, 0.0))
    yt = max(H(*Lt.xz(a, b)) for a in (-17, 0, 17) for b in (-17, 0, 17)) + 0.05
    Lt.box(g, 'concrete', -18, 18, -18, 18, yt - 1.5, yt, C('#3f7a5a'))
    for s in (-1, 1):
        Lt.box(g, 'concrete', -12, 12, s * 9.0 - 5.5, s * 9.0 + 5.5, yt, yt + 0.01, C('#4a6fa0'))
        Lt.box(g, 'paint', -0.05, 0.05, s * 9.0 - 5.8, s * 9.0 + 5.8, yt, yt + 0.95, C('#1c1c1c'))
    if not lod:
        for (p0, p1) in (((-18, -18), (18, -18)), ((18, -18), (18, 18)), ((18, 18), (-18, 18)), ((-18, 18), (-18, -18))):
            A_, B_ = Lt.xz(*p0), Lt.xz(*p1)
            F = Geo.frame(A_, B_); Le = v2len(v2sub(B_, A_))
            for q in range(int(Le / 3.0) + 1):
                g.fbox('metal', F, q * Le / int(Le / 3.0) - 0.04, q * Le / int(Le / 3.0) + 0.04, yt, yt + 3.2, -0.04, 0.04, C('#3e4a44'), top=True)
            g.fbox('metal', F, 0, Le, yt + 3.15, yt + 3.2, -0.04, 0.04, C('#3e4a44'), top=True, bottom=True)
    for (p0, p1) in (((-18, -18), (18, -18)), ((18, -18), (18, 18)), ((18, 18), (-18, 18)), ((-18, 18), (-18, -18))):
        A_, B_ = Lt.xz(*p0), Lt.xz(*p1); t = v2norm(v2sub(B_, A_))
        cols.append({'x': round((A_[0] + B_[0]) / 2, 2), 'z': round((A_[1] + B_[1]) / 2, 2), 'hx': 18.0, 'hz': 0.1, 'yaw': round(math.atan2(-t[1], t[0]), 4), 'yMin': yt - 1, 'yMax': yt + 3.2})
    # the J line: ballasted double track along the park's west edge + trolley poles and the overhead wires
    xj = -752.0
    zs = list(range(1612, 1861, 4))
    prev = None
    for z in zs:
        y = H(xj, z) + 0.05
        if prev:
            (pz, py) = prev
            g.poly('concrete', [(xj - 3.6, py, pz), (xj + 3.6, py, pz), (xj + 3.6, y, z), (xj - 3.6, y, z)], C('#7d766b'), (0, 1, 0))
            for x0 in (-2.2, 2.2):
                for rr in (-0.72, 0.72):
                    g.box('metal', xj + x0 + rr - 0.04, xj + x0 + rr + 0.04, min(py, y) + 0.05, max(py, y) + 0.2, pz, z, C('#6a6560'))
            if not lod:
                for x0 in (-2.2, 2.2):
                    g.box('wood', xj + x0 - 1.2, xj + x0 + 1.2, y + 0.02, y + 0.12, z - 0.12, z + 0.12, C('#5a4a3a'))
        prev = (z, y)
    for z in range(1616, 1861, 32):
        y = H(xj + 4.2, z)
        g.cyl('metal', xj + 4.2, z, 0.14, y, y + 7.2, C('#3a3d3a'), n=6)
        g.rod('metal', (xj + 4.2, y + 6.8, z), (xj - 3.0, y + 6.8, z), 0.06, C('#3a3d3a'), n=4)
        cols.append({'x': xj + 4.2, 'z': z, 'hx': 0.2, 'hz': 0.2, 'yaw': 0.0, 'yMin': y - 1, 'yMax': y + 7})
    for x0 in (-2.2, 2.2):
        for k in range(len(zs) - 8):
            if k % 8: continue
            z0, z1 = zs[k], zs[min(len(zs) - 1, k + 8)]
            g.rod('metal', (xj + x0, H(xj, z0) + 6.6, z0), (xj + x0, H(xj, z1) + 6.6, z1), 0.012, C('#2a2a2a'), n=3)
    # the Mexican liberty bell on its little stone tower (north-east corner) + benches along the palm walk
    bx, bz = -590.0, 1560.0; yb = H(bx, bz)
    g.box('stone', bx - 1.4, bx + 1.4, yb - 0.5, yb + 3.6, bz - 1.0, bz + 1.0, C('#b7ab96'))
    g.box('stone', bx - 1.6, bx + 1.6, yb + 3.6, yb + 3.9, bz - 1.2, bz + 1.2, C('#9d917c'))
    g.lathe('gold', bx, bz, [(0.0, yb + 2.2), (0.45, yb + 2.3), (0.38, yb + 2.8), (0.22, yb + 3.2), (0.0, yb + 3.3)], C('#6b5a3a'), n=12)
    cols.append({'x': bx, 'z': bz, 'hx': 1.4, 'hz': 1.0, 'yaw': 0.0, 'yMin': yb - 1, 'yMax': yb + 3.9})
    if not lod:
        for k in range(10):
            z = 1575 + k * 26.0; x = -588.0; y = H(x, z)
            Fb = ((x, z - 0.9), (0.0, 1.0), (-1.0, 0.0))
            g.fbox('wood', Fb, 0, 1.8, y + 0.42, y + 0.48, -0.25, 0.25, C('#6b4a33'), top=True, back=True)
            for e in (0.1, 1.6): g.fbox('metal', Fb, e, e + 0.1, y, y + 0.42, -0.2, 0.2, IRON, top=True, back=True)
    zones = [[[round(x, 1), round(z, 1)] for x, z in (Lp.xz(-21, -17), Lp.xz(21, -17), Lp.xz(21, 17), Lp.xz(-21, 17))],
             [[round(x, 1), round(z, 1)] for x, z in (Lt.xz(-20, -20), Lt.xz(20, -20), Lt.xz(20, 20), Lt.xz(-20, 20))],
             [[xj - 6, 1605], [xj + 6, 1605], [xj + 6, 1865], [xj - 6, 1865]]]
    return {'colliders': cols, 'name': 'Dolores Park', 'yG': round(yp, 2), 'top': 20.0, 'noTrees': zones}


BUILDERS = {
    'fortPoint': (fort_point, [1770]),
    'ggPlaza': (gg_plaza, GGP_HIDE),
    'alcatraz': (alcatraz, ALC_HIDE),
    'pier33': (pier33, []),
    'wharfCrab': (wharf_crab, []),
    'pier45': (pier45, P45_HIDE),
    'hydePier': (hyde_pier, []),
    'seaLions': (sea_lions, []),
    'lombard': (lombard, lombard_houses()),
    'sutro': (sutro, SUTRO_HIDE),
    'twinPeaks': (twin_peaks, TP_HIDE),
    'cliffHouse': (cliff_house, CLIFF_HIDE),
    'sutroBaths': (sutro_baths, []),
    'exploratorium': (exploratorium, EXP_HIDE),
    'balmy': (balmy, []),
    'doloresPark': (dolores, []),
}
ORIGINS = {'fortPoint': lambda: origin_for([fp_geom()[1]]),
           'alcatraz': lambda: origin_for([ring_of(1433)]),
           'wharfCrab': lambda: origin_for([[(CRAB_AT[0] + dx, CRAB_AT[1] + dz) for dx, dz in ((-2, -2), (2, -2), (2, 2), (-2, 2))]]),
           'hydePier': lambda: origin_for([hyde_frame().ring([(100, -40), (230, -40), (230, 40), (100, 40)])]),
           'seaLions': lambda: (sum(SL_ZONE[:2]) / 2, -3.0, sum(SL_ZONE[2:]) / 2),
           'sutroBaths': lambda: origin_for([Loc(*SB_FRAME).ring([(SB_BOX[0], SB_BOX[2]), (SB_BOX[1], SB_BOX[2]), (SB_BOX[1], SB_BOX[3]), (SB_BOX[0], SB_BOX[3])])]),
           'balmy': lambda: (lambda l: origin_for([[(l[0][0] - 5, l[0][1]), (l[0][0] + 5, l[0][1]), (l[-1][0] + 5, l[-1][1]), (l[-1][0] - 5, l[-1][1])]]))(balmy_line()),
           'doloresPark': lambda: origin_for([[(-770.0, 1545.0), (-565.0, 1545.0), (-565.0, 1865.0), (-770.0, 1865.0)]]),
           'pier33': lambda: origin_for([p33_frame().ring([(10, -14), (170, -14), (170, 14), (10, 14)])])}


def main():
    ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = ORIGINS[bid]() if bid in ORIGINS else origin_for([ring_of(i) for i in hide])
        run_building(bid, no_trees_wrap(fn, hide) if hide else fn, hide, O)


if __name__ == '__main__':
    main()
