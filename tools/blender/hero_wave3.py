"""HILLBOMB hero landmarks, wave 3 (Civic Center + Embarcadero / waterfront + Telegraph Hill).

Run:  tools/.venv-blender/Scripts/python.exe tools/blender/hero_wave3.py -- cityHall opera ...
Same pipeline as waves 1-2 (hero_lib.run_building: LOD0/LOD1, Cycles vertex AO, Draco GLB, _cache/hero/<id>.json).
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_lib import *   # noqa
from hero_wave1 import (ring_edges, neighbour_top, sidewalk, floor_levels, origin_for, edge_facing, tfacade, fpt, star, ROOF, GOLD, BRONZE,
                        palm, clip_rect)   # noqa
from hero_wave2 import (classic_block, Loc, hull, deck_seg, rect_decks, ext_stairs, broadleaf, conifer, outline, ring_scale)   # noqa

STONE3 = C('#dcd6c8'); STONE3D = C('#c3bcac'); GRAN3 = C('#b9b3a7'); COPPER = C('#6f8a7d'); LEAD = C('#77807b')
BRICK3 = C('#8f4535'); WOODB = C('#8a6a4a'); CREAM3 = C('#ece4d0')


# ================================================================================== classical kit
def column(g, x, z, y0, y1, r, col, slot='stone', order='doric', n=14):
    """free-standing classical column (base, tapering shaft, capital) at world (x, z)"""
    n = n if not g.lod else 6
    g.lathe(slot, x, z, [(r * 1.38, y0), (r * 1.38, y0 + 0.28 * r), (r * 1.18, y0 + 0.42 * r), (r * 1.25, y0 + 0.55 * r), (r * 1.02, y0 + 0.7 * r)], col, n=n)
    ys = y1 - (0.95 if order != 'corinthian' else 1.6) * r * 1.0
    g.lathe(slot, x, z, [(r, y0 + 0.7 * r), (r * 0.98, y0 + (ys - y0) * 0.35), (r * 0.86, ys)], col, n=n)
    if order == 'corinthian':
        g.lathe(slot, x, z, [(r * 0.86, ys), (r * 0.95, ys + 0.5 * r), (r * 1.25, y1 - 0.3 * r)], col, n=n)
        if not g.lod:
            for i in range(8):
                a = 2 * math.pi * (i + 0.5) / 8
                cx, cz = x + math.cos(a) * r * 0.95, z + math.sin(a) * r * 0.95
                g.poly(slot, [(cx - math.sin(a) * 0.3 * r, ys + 0.05, cz + math.cos(a) * 0.3 * r), (cx + math.sin(a) * 0.3 * r, ys + 0.05, cz - math.cos(a) * 0.3 * r),
                              (cx + math.cos(a) * 0.35 * r, ys + 0.9 * r, cz + math.sin(a) * 0.35 * r)], col, (math.cos(a), 0.3, math.sin(a)))
    else:
        g.lathe(slot, x, z, [(r * 0.86, ys), (r * 0.9, ys + 0.2 * r), (r * 1.22, y1 - 0.32 * r)], col, n=n)
        if order == 'ionic' and not g.lod:
            for s_ in (-1, 1):
                g.lathe(slot, x + s_ * r * 1.1, z, [(0.0, y1 - 0.75 * r), (0.32 * r, y1 - 0.55 * r), (0.32 * r, y1 - 0.4 * r), (0.0, y1 - 0.25 * r)], col, n=8)
    g.box(slot, x - r * 1.35, x + r * 1.35, y1 - 0.32 * r, y1, z - r * 1.35, z + r * 1.35, col)
    return {'x': round(x, 2), 'z': round(z, 2), 'hx': round(r * 1.2, 2), 'hz': round(r * 1.2, 2), 'yaw': 0, 'yMin': round(y0 - 1, 2), 'yMax': round(y1, 2)}


def colonnade(g, F, u0, u1, y0, y1, w, r, col, spacing, slot='stone', order='doric', pair=False, cols=None):
    """a row of columns standing at distance w in front of a wall frame"""
    L = u1 - u0; n = max(1, int(round(L / spacing)))
    for i in range(n + 1):
        u = u0 + L * i / n
        for d in ((-r * 1.4, r * 1.4) if pair else (0.0,)):
            p = Geo.fp(F, u + d, 0, w)
            c = column(g, p[0], p[2], y0, y1, r, col, slot=slot, order=order)
            if cols is not None: cols.append(c)


def entablature(g, ring, y, h, col, slot='stone', depth=0.9):
    """architrave + frieze + cornice around a ring (top at y)"""
    g.sweep(slot, ring, [(0.0, y - h), (0.25, y - h), (0.25, y - h * 0.62), (0.35, y - h * 0.6), (0.35, y - h * 0.3), (depth, y - h * 0.18), (depth, y), (0.0, y)], col)


def pediment(g, F, u0, u1, y, h, depth, col, slot='stone', tym=None):
    """triangular pediment on a wall frame: tympanum + raking cornices + bed cornice"""
    um = (u0 + u1) / 2; N = (F[2][0], 0, F[2][1])
    P = lambda u, yy, w: Geo.fp(F, u, yy, w)
    g.poly(slot, [P(u0 + 0.6, y + 0.4, depth * 0.35), P(u1 - 0.6, y + 0.4, depth * 0.35), P(um, y + h - 0.5, depth * 0.35)], tym or shade(col, 0.93), N)
    g.fbox(slot, F, u0 - 0.3, u1 + 0.3, y - 0.2, y + 0.4, 0, depth, col, top=True, bottom=True)
    t = 0.75
    for s0, s1 in ((u0 - 0.3, um), (u1 + 0.3, um)):
        A0, A1 = P(s0, y + 0.4, 0), P(s1, y + h, 0)
        B0, B1 = P(s0, y + 0.4, depth + 0.2), P(s1, y + h, depth + 0.2)
        up = (0, t, 0)
        add = lambda p: (p[0] + up[0], p[1] + up[1], p[2] + up[2])
        g.poly(slot, [B0, B1, add(B1), add(B0)], col, N)
        g.poly(slot, [add(A0), add(A1), add(B1), add(B0)], shade(col, 1.04), (0, 1, 0))
        g.poly(slot, [A0, A1, B1, B0], shade(col, 0.85), (0, -1, 0))
        g.poly(slot, [A0, A1, add(A1), add(A0)], shade(col, 0.8), (-N[0], 0, -N[2]))


def balustrade(g, a, b, y, h, col, slot='stone', step=0.45, w=0.0):
    """rail + balusters along a->b (outer face at w)"""
    F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    g.fbox(slot, F, 0, L, y, y + 0.18, w - 0.45, w, col, top=True, bottom=False)
    g.fbox(slot, F, 0, L, y + h - 0.16, y + h, w - 0.5, w + 0.05, col, top=True, bottom=True)
    if g.lod:
        g.fbox(slot, F, 0, L, y + 0.18, y + h - 0.16, w - 0.35, w - 0.1, shade(col, 0.8), top=False)
        return
    n = int(L / step)
    for k in range(n):
        u = (k + 0.5) * L / n; p = Geo.fp(F, u, 0, w - 0.22)
        g.lathe(slot, p[0], p[2], [(0.1, y + 0.18), (0.14, y + 0.3), (0.07, y + h * 0.55), (0.12, y + h - 0.3), (0.08, y + h - 0.16)], col, n=6)


def arcade_wall(g, F, u0, u1, y0, y1, bay, spring, col, slot='stone', glass='shop', lit=0.8, depth=0.5, open_=False, glass_col=None):
    """wall with round-arched openings (bays of width `bay`, arch springing at `spring` above y0)"""
    L = u1 - u0; n = max(1, int(L / bay)); bw = L / n
    for i in range(n):
        uc = u0 + (i + 0.5) * bw; w = bw * 0.62
        hole = opening_poly(uc, w, y0 + 0.02, y0 + spring + w / 2, 1, 12 if not g.lod else 5)
        radial_panel(g, slot, F, u0 + i * bw, u0 + (i + 1) * bw, y0, y1, hole, col)
        if open_:
            m = len(hole); cu = sum(p[0] for p in hole) / m; cv = sum(p[1] for p in hole) / m
            for k in range(m):
                p, q = hole[k], hole[(k + 1) % m]
                mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
                if p[1] < y0 + 0.05 and q[1] < y0 + 0.05: continue
                g.poly(slot, [Geo.fp(F, p[0], p[1], 0), Geo.fp(F, q[0], q[1], 0), Geo.fp(F, q[0], q[1], -depth), Geo.fp(F, p[0], p[1], -depth)], shade(col, 0.88),
                       (-(F[1][0] * mu), -mv, -(F[1][1] * mu)))
        else:
            recess(g, F, hole, depth, slot, shade(col, 0.9), glass, glass_col or ((1.0, 0.86, 0.66, 1.0) if rnd() < lit else (0.2, 0.18, 0.15, 1.0)))


def dome(g, cx, cz, y0, r0, h, col, slot='paint', ribs=16, rib_col=GOLD, n=40, shape=0.55):
    """ribbed dome from radius r0 at y0 up h (profile: superellipse), gilt ribs"""
    n = n if not g.lod else 16
    K = 10 if not g.lod else 5
    prof = []
    for k in range(K + 1):
        t = k / K; a = t * math.pi / 2
        prof.append((r0 * math.cos(a) ** shape if k < K else 0.0, y0 + h * math.sin(a)))
    g.lathe(slot, cx, cz, prof, col, n=n)
    if not g.lod and ribs:
        for i in range(ribs):
            a = 2 * math.pi * i / ribs
            pts = [(cx + math.cos(a) * (p[0] + 0.12), p[1] + 0.05, cz + math.sin(a) * (p[0] + 0.12)) for p in prof]
            for k in range(len(pts) - 2):
                g.rod('gold', pts[k], pts[k + 1], 0.16, rib_col, n=4)
    return prof


def ring_facets(cx, cz, r, n, a0=0.0):
    return [(cx + math.cos(a0 + 2 * math.pi * i / n) * r, cz + math.sin(a0 + 2 * math.pi * i / n) * r) for i in range(n)]


def street_pts(site, names):
    return [st['pts'] for st in sites()[site]['streets'] if st['name'] in names]


# ================================================================================== City Hall (1915, Bakewell & Brown)
CH_HIDE = [39084, 39062, 39082, 39083, 39058, 39059, 39060, 39061, 39063, 39064, 39065, 39066, 38955, 39079, 39080, 39081, 38953, 38954]
CH_D = (14.5, -485.4)
CH_U = (0.98715, -0.15979)


def city_hall(g):
    main = ring_simplify(ring_of(39084), 0.3)
    L = Loc(CH_D, CH_U)
    yG = min(sidewalk(*p) for p in ring_out(main)) + 0.1
    lv = floor_levels(yG, [1.6, 6.0, 0.7, 7.3, 7.0, 2.8, 4.6, 1.4])   # plinth, ground, band, piano nobile, 3rd, entablature, attic, balustrade
    y_base, y_g, y_band, y_pn, y_3, y_ent, y_att, y_bal = lv[1:9]
    ST = STONE3; STD = STONE3D
    cols = []
    # granite plinth (the building sits on a raised base) + rusticated ground floor with arched windows
    g.sweep('granite', main, [(0.6, yG - 3), (0.6, y_base - 0.2), (0.3, y_base), (0.0, y_base)], GRAN3)
    for a, b in ring_edges(main):
        F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
        if Le < 2.5:
            radial_panel(g, 'granite', F, 0, Le, y_base, y_ent, None, STD); continue
        facade(g, a, b, y_base, y_g, 6.0, 4.3, Win(w=1.9, sill=1.2, head=4.9, depth=0.45, arch=1, lit=0.4, keystone=True), 'granite', GRAN3, margin=1.0)
        if not g.lod:
            for yy in [y_base + 1.0 + k * 1.0 for k in range(5)]:
                g.fbox('granite', F, 0, Le, yy - 0.05, yy + 0.02, 0, 0.04, shade(GRAN3, 0.8), top=True, bottom=True, sides=False)
        g.fbox('stone', F, 0, Le, y_g, y_band, 0, 0.4, ST, top=True, bottom=True)
        # piano nobile + 3rd floor behind engaged Doric columns
        facade(g, a, b, y_band, y_3, 7.2, 4.3, lambda k, i: Win(w=1.8, sill=1.0, head=5.2, depth=0.4, arch=1 if k == 0 else 0, lit=0.4, hood=0.15 if k == 0 else 0, keystone=k == 0)
               if True else None, 'stone', ST, margin=1.0)
        if Le > 8 and not g.lod:
            nb = max(1, int((Le - 2.0) / 4.3))
            for i in range(nb + 1):
                u = 1.0 + (Le - 2.0) * i / nb
                p = Geo.fp(F, u, 0, 0.55)
                column(g, p[0], p[2], y_band, y_3, 0.62, ST, order='doric', n=10)
        radial_panel(g, 'stone', F, 0, Le, y_3, y_ent, None, ST)
        facade(g, a, b, y_ent, y_att, 4.6, 4.3, Win(w=1.2, sill=1.4, head=3.2, depth=0.3, lit=0.3), 'stone', ST, margin=1.0)
    entablature(g, main, y_ent, 2.8, ST, depth=1.3)
    g.sweep('stone', main, [(0.0, y_att), (0.5, y_att + 0.1), (0.5, y_att + 0.35), (0.0, y_att + 0.35)], STD)
    for a, b in ring_edges(main):
        if v2len(v2sub(b, a)) > 3: balustrade(g, a, b, y_att + 0.35, 1.25, ST, w=0.0)
    g.prism('roof', ring_offset(ring_out(main), -0.6), y_att - 0.2, y_att + 0.3, ROOF, top=True, walls=False)
    # cross wing (E-W): higher attic with pediments on the Polk + Van Ness pavilions
    cw = ring_simplify(ring_of(39062), 0.3)
    yc = y_att + 5.0
    for a, b in ring_edges(cw):
        F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
        radial_panel(g, 'stone', F, 0, Le, y_att - 0.5, yc, None, ST)
    entablature(g, cw, yc, 1.6, ST, depth=0.9)
    g.prism('roof', cw, yc - 0.1, yc, ROOF, top=True, walls=False)
    for dx in (1, -1):
        a, b = edge_facing(cw, dx * CH_U[0], dx * CH_U[1]); F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
        pediment(g, F, 0.3, Le - 0.3, yc, 6.5, 1.3, ST)
        # portico: 6 free-standing columns on the pavilion, a broad flight of steps in front
        am, bm = edge_facing(main, dx * CH_U[0], dx * CH_U[1])
        Fm = Geo.frame(am, bm); Lm = v2len(v2sub(bm, am))
        um = Lm / 2
        for k in range(6):
            u = um + (k - 2.5) * 4.6; p = Geo.fp(Fm, u, 0, 2.4)
            cols.append(column(g, p[0], p[2], y_band, y_3, 0.78, ST, order='doric'))
        g.fbox('stone', Fm, um - 13.5, um + 13.5, y_3, y_ent, 0.6, 3.4, ST, top=True, bottom=True)
        for s in range(8):
            yy = y_base - s * 0.2
            g.fbox('granite', Fm, um - 13 - s * 0.3, um + 13 + s * 0.3, yy - 3, yy, 0, 1.2 + s * 0.45, GRAN3 if s % 2 else shade(GRAN3, 0.95), top=True)
        if not g.lod:
            for sg in (-1, 1):   # lamp standards flanking the stair
                p = Geo.fp(Fm, um + sg * 14.5, 0, 4.5); yy = H(p[0], p[2])
                g.lathe('metal', p[0], p[2], [(0.45, yy), (0.3, yy + 0.8), (0.15, yy + 1.2), (0.12, yy + 5.5)], C('#2a2a28'), n=10)
                g.lathe('lamp', p[0], p[2], [(0.0, yy + 5.4), (0.4, yy + 5.7), (0.45, yy + 6.3), (0.0, yy + 6.8)], (1.0, 0.86, 0.62, 1.0), n=10)
            g.text('stone', Fm, um, y_ent - 2.1, 3.45, 'CITY HALL', 0.9, shade(ST, 0.75), depth=0.06)
    # drum base (square) + octagon
    for i, top in ((39082, yG + 32.0), (39083, yG + 40.0)):
        r = ring_simplify(ring_of(i), 0.3)
        for a, b in ring_edges(r):
            F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
            facade(g, a, b, yc - 1, top, 4.0, 3.0, Win(w=1.2, sill=1.0, head=2.8, lit=0.2), 'stone', ST, margin=0.8) if Le > 3 else radial_panel(g, 'stone', F, 0, Le, yc - 1, top, None, ST)
        entablature(g, r, top, 1.2, ST, depth=0.7)
        g.prism('roof', r, top - 0.1, top, ROOF, top=True, walls=False)
    # dome: podium ring, Doric colonnade drum, attic, ribbed copper dome with gilt ribs, lantern, finial
    cx, cz = CH_D
    y1 = yG + 40.0
    nd = 48 if not g.lod else 16
    g.lathe('stone', cx, cz, [(17.4, y1), (17.4, y1 + 5.2), (17.9, y1 + 5.5), (17.9, y1 + 6.0), (16.2, y1 + 6.0)], ST, n=nd)
    yd0, yd1 = y1 + 6.0, y1 + 19.0
    fac = ring_facets(cx, cz, 15.2, 32)
    for i in range(32):
        a, b = fac[i], fac[(i + 1) % 32]
        F = Geo.frame(b, a) if False else Geo.frame(a, b)
        n = edge_n(a, b)
        if (n[0] * ((a[0] + b[0]) / 2 - cx) + n[1] * ((a[1] + b[1]) / 2 - cz)) < 0: F = Geo.frame(b, a)
        Le = v2len(v2sub(b, a))
        hole = opening_poly(Le / 2, 1.5, yd0 + 2.0, yd0 + 8.5, 1, 8 if not g.lod else 3)
        radial_panel(g, 'stone', F, 0, Le, yd0, yd1, hole if i % 2 == 0 else None, ST)
        if i % 2 == 0: recess(g, F, hole, 0.5, 'stone', STD, 'win', glass_col(0.5))
    for i in range(40 if not g.lod else 16):
        t = 2 * math.pi * (i + 0.5) / (40 if not g.lod else 16)
        column(g, cx + math.cos(t) * 17.0, cz + math.sin(t) * 17.0, yd0, yd1 - 0.2, 0.6, ST, order='corinthian', n=10)
    g.lathe('stone', cx, cz, [(16.4, yd1 - 0.3), (18.0, yd1 + 0.4), (18.2, yd1 + 1.8), (18.7, yd1 + 2.4), (15.0, yd1 + 2.4)], ST, n=nd)
    ya0 = yd1 + 2.4
    g.lathe('stone', cx, cz, [(15.0, ya0), (15.0, ya0 + 4.4), (15.5, ya0 + 4.8), (14.4, ya0 + 5.0)], ST, n=nd)
    if not g.lod:
        for i in range(24):
            t = 2 * math.pi * (i + 0.5) / 24
            p = (cx + math.cos(t) * 15.02, cz + math.sin(t) * 15.02)
            Fp = (p, (-math.sin(t), math.cos(t)), (math.cos(t), math.sin(t)))
            g.fbox('win', Fp, -0.5, 0.5, ya0 + 1.2, ya0 + 3.2, -0.05, 0.02, glass_col(0.3), top=False, sides=False)
    ydm = ya0 + 5.0
    prof = dome(g, cx, cz, ydm, 14.4, 16.5, COPPER, ribs=24, shape=0.62)
    ylan = ydm + 15.2
    g.lathe('stone', cx, cz, [(4.4, ylan), (4.4, ylan + 1.0), (3.6, ylan + 1.0)], ST, n=24)
    for i in range(12 if not g.lod else 6):
        t = 2 * math.pi * (i + 0.5) / (12 if not g.lod else 6)
        column(g, cx + math.cos(t) * 3.9, cz + math.sin(t) * 3.9, ylan + 1.0, ylan + 6.5, 0.28, ST, order='corinthian', n=8)
    g.lathe('win', cx, cz, [(3.1, ylan + 1.0), (3.1, ylan + 6.4)], (1.0, 0.85, 0.6, 1.0), n=16)
    g.lathe('stone', cx, cz, [(4.3, ylan + 6.4), (4.5, ylan + 7.2), (3.2, ylan + 7.4)], ST, n=24)
    g.lathe('paint', cx, cz, [(3.2, ylan + 7.4), (2.6, ylan + 8.8), (1.2, ylan + 9.8), (0.3, ylan + 10.2)], COPPER, n=24)
    top = yG + 93.6
    g.lathe('gold', cx, cz, [(0.35, ylan + 10.1), (0.55, ylan + 10.6), (0.25, ylan + 11.2), (0.12, top - 1.2), (0.3, top - 0.9), (0.0, top)], GOLD, n=10)
    # the dome is floodlit at night: warm lamps around the podium ring
    if not g.lod:
        for i in range(16):
            t = 2 * math.pi * i / 16
            p = (cx + math.cos(t) * 17.6, cz + math.sin(t) * 17.6)
            g.box('lamp', p[0] - 0.3, p[0] + 0.3, y1 + 6.0, y1 + 6.25, p[1] - 0.3, p[1] + 0.3, (1.0, 0.82, 0.55, 1.0))
    cols += wall_colliders(main, yG - 6, y_bal)
    return {'colliders': cols, 'name': 'San Francisco City Hall', 'replaces': 'cityHall', 'yG': round(yG, 2), 'top': round(top, 1)}


# ================================================================================== War Memorial Opera House (1932, Arthur Brown Jr.)
def opera(g):
    r = ring_simplify(ring_of(38733), 0.5); own = {38733}
    a, b = edge_facing(r, CH_U[0], CH_U[1])                            # Van Ness front (east)
    yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    ST = C('#dfd9cc'); STD = C('#c9c1b1')
    lv = floor_levels(yG, [7.2, 0.6, 12.2, 3.0, 3.6, 1.3])
    y_g, y_b, y_col, y_ent, y_att, y_bal = lv[1:7]
    cols = []
    for ea, eb in ring_edges(r):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if Le < 3:
            radial_panel(g, 'stone', F, 0, Le, yG - 3, y_att, None, STD); continue
        front = (ea, eb) == (a, b)
        if front:
            arcade_wall(g, F, 0, Le, yG - 0.2, y_g, 6.4, 3.6, ST, slot='stone', lit=0.95, depth=0.8)
        else:
            facade(g, ea, eb, yG - 3, y_g, 7.2, 4.8, Win(w=2.0, sill=1.2, head=5.6, depth=0.4, arch=1, lit=0.35), 'stone', STD, margin=1.2)
        g.fbox('stone', F, 0, Le, y_g, y_b, 0, 0.45, ST, top=True, bottom=True)
        facade(g, ea, eb, y_b, y_col, 6.1, 4.8, Win(w=2.3, sill=0.6, head=5.4, depth=0.5 if front else 0.35, lit=0.55 if front else 0.3), 'stone', ST, margin=1.0)
        radial_panel(g, 'stone', F, 0, Le, y_col, y_ent, None, ST)
        facade(g, ea, eb, y_ent, y_att, 3.6, 4.8, Win(w=1.1, sill=0.9, head=2.7, depth=0.25, lit=0.25), 'stone', ST, margin=1.0)
        if front:
            # paired giant Doric columns in front of the loggia, name on the frieze
            nb = int(Le / 9.6)
            for i in range(nb + 1):
                u = 2.4 + (Le - 4.8) * i / nb
                for d in (-1.0, 1.0):
                    p = Geo.fp(F, u + d, 0, 1.9)
                    cols.append(column(g, p[0], p[2], y_b, y_col, 0.72, ST, order='doric', n=12))
            g.fbox('stone', F, 0.5, Le - 0.5, y_col, y_ent, 0.3, 3.0, ST, top=True, bottom=True)
            if not g.lod:
                g.text('stone', F, Le / 2, y_col + 0.9, 3.05, 'WAR MEMORIAL OPERA HOUSE', 1.0, shade(ST, 0.72), depth=0.05)
                for i in range(int(Le / 6.4)):
                    u = (i + 0.5) * Le / int(Le / 6.4)
                    g.fbox('lamp', F, u - 0.35, u + 0.35, y_g - 0.9, y_g - 0.2, 0.05, 0.6, (1.0, 0.85, 0.6, 1.0))
    entablature(g, r, y_att, 1.2, ST, depth=0.9)
    for ea, eb in ring_edges(r):
        if v2len(v2sub(eb, ea)) > 3: balustrade(g, ea, eb, y_att, 1.3, ST)
    # copper-grey mansard, then the fly tower over the stage (west half)
    g.sweep('paint', r, [(-0.6, y_att), (-0.6, y_att + 0.3), (-3.8, y_att + 5.2), (-4.4, y_att + 5.2)], LEAD)
    g.poly('roof', [(p[0], y_att + 5.2, p[1]) for p in ring_offset(ring_out(r), -4.4)], ROOF, (0, 1, 0))
    F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
    c = centroid(ring_out(r))
    Lf = Loc(c, (-F[2][0], -F[2][1]))          # a = into the building (west), b along the front
    aa, bb = Lf.loc(*a)[0], 0.0
    fly = Lf.ring([(aa + 42, -19), (aa + 72, -19), (aa + 72, 19), (aa + 42, 19)])
    yfly = yG + 44.0
    for ea, eb in ring_edges(fly):
        facade(g, ea, eb, y_att + 5.0, yfly - 1.5, 5.0, 6.0, Win(w=1.0, sill=2.0, head=3.2, lit=0.1), 'stone', STD, margin=2.0)
    g.sweep('stone', fly, [(0, yfly - 1.5), (0.5, yfly - 1.0), (0.5, yfly), (0, yfly)], ST)
    g.prism('roof', fly, yfly - 0.1, yfly, ROOF, top=True, walls=False)
    # lamp posts + planters along the Van Ness forecourt
    if not g.lod:
        for k in range(5):
            p = Geo.fp(F, Le * (k + 0.5) / 5, 0, 7.5); yy = H(p[0], p[2])
            g.lathe('metal', p[0], p[2], [(0.35, yy), (0.18, yy + 1.0), (0.1, yy + 4.6)], C('#232323'), n=8)
            g.lathe('lamp', p[0], p[2], [(0.0, yy + 4.5), (0.35, yy + 4.8), (0.3, yy + 5.4), (0.0, yy + 5.6)], (1.0, 0.86, 0.62, 1.0), n=8)
    cols += wall_colliders(r, yG - 6, y_att + 5)
    return {'colliders': cols, 'name': 'War Memorial Opera House', 'yG': round(yG, 2), 'top': round(yfly + 1, 1)}


# ================================================================================== Davies Symphony Hall (1980, curved glass front)
def davies(g):
    base, main = ring_simplify(ring_of(38948), 0.3), ring_simplify(ring_of(38949), 0.3)
    yG = min(sidewalk(*p) for p in ring_out(base)) + 0.1
    WC = C('#e6e3dc'); CON = C('#cfcac0')
    yb = yG + 7.6; top = yG + 27.5
    cx, cz = centroid(ring_out(main))
    cols = []
    for ea, eb in ring_edges(base):
        n = edge_n(ea, eb); m = v2lerp(ea, eb, 0.5)
        if point_in(main, m[0] - n[0] * 1.5, m[1] - n[1] * 1.5) and False: continue
        storefront(g, ea, eb, sidewalk, yb - 1.0, 3.6, 'concrete', CON, glass_slot='shop', lit=0.9, frame_col=C('#2b2b2b'))
        radial_panel(g, 'concrete', Geo.frame(ea, eb), 0, v2len(v2sub(eb, ea)), yb - 1.0, yb, None, WC)
    parapet(g, base, yb, 1.1, 0.25, WC, slot='concrete', roof_col=C('#9a958c'))
    # main hall: glazed where it faces Van Ness / Grove (NE), concrete elsewhere; stacked white balcony bands
    for ea, eb in ring_edges(main):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea)); n = edge_n(ea, eb)
        glazed = n[0] * 0.75 + n[1] * -0.66 > 0.1
        if glazed:
            g.quad_sub('win', Geo.fp(F, 0, yb, -1.2), Geo.fp(F, Le, yb, -1.2), Geo.fp(F, Le, top - 2, -1.2), Geo.fp(F, 0, top - 2, -1.2), (0.9, 0.8, 0.65, 1.0), (n[0], 0, n[1]), maxe=4)
            for k in range(4):
                y = yb + 1.2 + k * 4.6
                g.fbox('concrete', F, -0.05, Le + 0.05, y - 0.35, y + 0.15, -1.3, 1.6, WC, top=True, bottom=True)
                if not g.lod: g.fbox('metal', F, -0.05, Le + 0.05, y + 0.15, y + 1.2, 1.5, 1.56, C('#8b9093'), top=True, sides=False)
            if not g.lod:
                for k in range(int(Le / 2.0) + 1):
                    g.fbox('metal', F, k * 2.0 - 0.05, k * 2.0 + 0.05, yb, top - 2, -1.2, -1.1, C('#3a3d40'), top=False)
            radial_panel(g, 'concrete', F, 0, Le, top - 2, top, None, WC)
        else:
            facade(g, ea, eb, yb, top, 5.0, 5.0, Win(w=1.0, sill=2.0, head=3.6, lit=0.15), 'concrete', CON, margin=2.0, band=(0.4, 0.08, WC))
    g.sweep('concrete', main, [(0.0, top), (0.4, top + 0.1), (0.4, top + 0.8), (0.0, top + 0.8)], WC)
    g.prism('roof', ring_offset(ring_out(main), -0.4), top - 0.2, top + 0.2, ROOF, top=True, walls=False)
    g.prism('concrete', ring_scale(ring_out(main), (cx, cz), 0.55), top, top + 5.0, CON, top=True)
    # reclining bronze figure on the Van Ness plaza
    p = v2add((cx, cz), (32.0, -26.0)); yy = H(*p)
    if not point_in(base, *p):
        g.box('granite', p[0] - 2.5, p[0] + 2.5, yy - 0.5, yy + 0.6, p[1] - 1.4, p[1] + 1.4, C('#8e8a83'))
        for k, (dx, dy, rr) in enumerate(((-1.4, 1.2, 0.9), (0.2, 1.0, 1.0), (1.5, 1.5, 0.8), (1.9, 2.4, 0.55))):
            g.lathe('metal', p[0] + dx, p[1], [(0.0, yy + dy - rr), (rr, yy + dy), (0.0, yy + dy + rr * 0.9)], C('#3d3326'), n=10 if not g.lod else 5)
        cols.append({'x': round(p[0], 2), 'z': round(p[1], 2), 'hx': 2.5, 'hz': 1.4, 'yaw': 0, 'yMin': yy - 1, 'yMax': yy + 3})
    cols += wall_colliders(base, yG - 6, yb + 1.1)
    return {'colliders': cols, 'name': 'Davies Symphony Hall', 'yG': round(yG, 2), 'top': round(top + 6, 1)}


# ================================================================================== Asian Art Museum (1917 former Main Library)
def asian_art(g):
    r = ring_simplify(ring_of(29848), 0.4); own = {29848}
    yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    ST = C('#d9d2c2'); STD = C('#c0b8a6')
    top = yG + 26.0
    lv = floor_levels(yG, [6.2, 0.6, 14.0, 2.4])
    a, b = edge_facing(r, -CH_U[0], -CH_U[1])         # Larkin front (faces the plaza, west)
    cols = []
    for ea, eb in ring_edges(r):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if Le < 3: radial_panel(g, 'granite', F, 0, Le, yG - 3, top, None, STD); continue
        front = (ea, eb) == (a, b)
        facade(g, ea, eb, yG - 3, lv[1], 6.2 + 3, 5.2, Win(w=1.6, sill=4.0, head=8.0, depth=0.4, lit=0.35), 'granite', STD, margin=1.5)
        g.fbox('granite', F, 0, Le, lv[1], lv[2], 0, 0.45, ST, top=True, bottom=True)
        facade(g, ea, eb, lv[2], lv[3], 14.0, 5.2, Win(w=2.6, sill=1.2, head=11.5, depth=0.5, arch=1, lit=0.45, keystone=True), 'granite', ST, margin=1.5)
        if front and not g.lod:
            nb = int((Le - 3.0) / 5.2)
            for i in range(nb + 1):
                p = Geo.fp(F, 1.5 + (Le - 3.0) * i / nb, 0, 0.5)
                column(g, p[0], p[2], lv[2], lv[3], 0.7, ST, slot='granite', order='ionic', n=12)
            g.text('granite', F, Le / 2, lv[3] + 0.5, 0.52, 'ASIAN ART MUSEUM', 1.05, shade(ST, 0.7), depth=0.05)
        radial_panel(g, 'granite', F, 0, Le, lv[3], top, None, ST)
    entablature(g, r, top, 2.4, ST, slot='granite', depth=1.2)
    parapet(g, r, top, 1.0, 0.35, ST, slot='granite', roof_col=ROOF)
    # entrance: three arched bronze doorways + a broad flight of steps to Larkin
    F = Geo.frame(a, b); Le = v2len(v2sub(b, a)); um = Le / 2
    for k in (-1, 0, 1):
        hole = opening_poly(um + k * 5.0, 3.2, yG + 0.3, yG + 5.8, 1, 10 if not g.lod else 4)
        g.fbox('granite', F, um + k * 5.0 - 2.4, um + k * 5.0 + 2.4, yG - 1, yG + 6.6, 0, 0.35, STD, top=True)
        recess(g, (F[0], F[1], F[2]), hole, 0.9, 'granite', STD, 'shop', (1.0, 0.85, 0.62, 1.0)) if not g.lod else None
    cols += wall_colliders(r, yG - 6, top)
    return {'colliders': cols, 'name': 'Asian Art Museum', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ================================================================================== SF Main Library (1996, Pei Cobb Freed) - no OSM footprint: built on its block
LIB_U = (0.98715, -0.15979)


def library_rect():
    L0 = Loc((310.0, -490.0), LIB_U)
    def line_a(name, site='asianArt'):
        vals = []
        for P in street_pts(site, (name,)):
            for k in range(len(P) - 1):
                p0, p1 = L0.loc(*P[k][:2]), L0.loc(*P[k + 1][:2])
                if (p0[1] < 0) != (p1[1] < 0): vals.append(p0[0] + (p1[0] - p0[0]) * (-p0[1]) / (p1[1] - p0[1]))
        return vals
    def line_b(name, site='library'):
        vals = []
        for P in street_pts(site, (name,)):
            for k in range(len(P) - 1):
                p0, p1 = L0.loc(*P[k][:2]), L0.loc(*P[k + 1][:2])
                if (p0[0] < 0) != (p1[0] < 0): vals.append(p0[1] + (p1[1] - p0[1]) * (-p0[0]) / (p1[0] - p0[0]))
        return vals
    aL = max(line_a('Larkin Street')); aH = min(line_a('Hyde Street'))
    bG = min(line_b('Grove Street'))
    art = [L0.loc(*p) for p in ring_of(29848)]
    bA = max(q[1] for q in art if abs(q[0]) < 40)
    return L0, aL + 11.0, aH - 11.0, bA + 22.0, bG - 11.5


def library(g):
    L, a0, a1, b0, b1 = library_rect()
    ring = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
    yG = min(sidewalk(*p) for p in ring) + 0.1
    GR = C('#d6d0c4'); GRD = C('#bdb6a8'); MOD = C('#e4e2dd')
    top = yG + 33.0
    cols = []
    for k, (ea, eb) in enumerate(ring_edges(ring)):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea)); n = edge_n(ea, eb)
        classical = (n[0] * -CH_U[0] + n[1] * -CH_U[1] > 0.7) or (n[0] * -LIB_U[1] * -1 + n[1] * LIB_U[0] * -1 > 0.7)   # Larkin (west) + Fulton (north) faces
        storefront(g, ea, eb, sidewalk, yG + 6.0, 5.0, 'granite', GRD, glass_slot='shop', lit=0.85, frame_col=C('#2b2b2b'), pier=(1.0, 0.3, GR))
        if classical:
            facade(g, ea, eb, yG + 6.0, top - 4.5, 4.4, 4.2, Win(w=1.6, sill=0.9, head=3.4, depth=0.45, lit=0.5), 'granite', GR, margin=1.5)
            if not g.lod:
                nb = int((Le - 3) / 8.4)
                for i in range(nb + 1):
                    p = Geo.fp(F, 1.5 + (Le - 3) * i / nb, 0, 0.3)
                    g.fbox('granite', F, 1.5 + (Le - 3) * i / nb - 0.7, 1.5 + (Le - 3) * i / nb + 0.7, yG + 6.0, top - 4.5, 0, 0.6, GR, top=True)
            radial_panel(g, 'granite', F, 0, Le, top - 4.5, top, None, GR)
            if not g.lod and n[0] * -CH_U[0] + n[1] * -CH_U[1] > 0.7:
                g.text('granite', F, Le / 2, top - 3.4, 0.05, 'SAN FRANCISCO PUBLIC LIBRARY', 1.1, shade(GR, 0.7), depth=0.05)
        else:
            # modern faces: white panel grid, a tall glazed cut toward the atrium
            facade(g, ea, eb, yG + 6.0, top - 1.5, 4.4, 3.0, Win(w=2.2, sill=0.6, head=3.9, depth=0.25, lit=0.5, mull=False), 'concrete', MOD, margin=1.0,
                   band=(0.35, 0.1, C('#f2f1ee')))
            radial_panel(g, 'concrete', F, 0, Le, top - 1.5, top, None, MOD)
            if not g.lod:
                g.quad_sub('glassc', Geo.fp(F, Le * 0.4, yG + 6, 0.4), Geo.fp(F, Le * 0.6, yG + 6, 0.4), Geo.fp(F, Le * 0.6, top + 2, 0.4), Geo.fp(F, Le * 0.4, top + 2, 0.4),
                           C('#aec0c8'), (n[0], 0, n[1]), maxe=10)
    g.sweep('granite', ring, [(0, top), (0.8, top + 0.3), (0.8, top + 0.9), (0, top + 0.9)], GR)
    g.prism('roof', ring, top - 0.2, top, ROOF, top=True, walls=False)
    c = L.xz((a0 + a1) / 2, (b0 + b1) / 2)
    g.lathe('glassc', c[0], c[1], [(13.0, top), (11.5, top + 3.5), (7.0, top + 6.0), (0.0, top + 7.0)], C('#c6d4da'), n=32 if not g.lod else 12)
    g.lathe('metal', c[0], c[1], [(13.3, top - 0.3), (13.3, top + 0.4), (13.0, top + 0.4)], C('#9aa1a6'), n=32 if not g.lod else 12)
    cols += wall_colliders(ring, yG - 6, top)
    return {'colliders': cols, 'name': 'San Francisco Public Library', 'yG': round(yG, 2), 'top': round(top + 8, 1)}


def _lib_origin():
    L, a0, a1, b0, b1 = library_rect()
    c = L.xz((a0 + a1) / 2, (b0 + b1) / 2)
    ring = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
    return (round(c[0], 1), round(min(H(*p) for p in ring) - 3.0, 2), round(c[1], 1))


# ================================================================================== Ferry Building (1898, A. Page Brown) + clock tower
FB_HIDE = [13853, 13855, 13856, 13857, 13858, 13859, 13860, 13850, 17588]


def fb_frame():
    r = ring_out(ring_of(13853))
    e = max(ring_edges(r), key=lambda e: v2len(v2sub(e[1], e[0])))
    u = v2norm(v2sub(e[1], e[0]))
    if u[1] > 0: u = (-u[0], -u[1])          # u runs north-west along the building
    tw = centroid(ring_of(13855))
    L = Loc(tw, u)
    loc = [L.loc(*p) for p in r]
    return L, min(q[0] for q in loc), max(q[0] for q in loc), min(q[1] for q in loc), max(q[1] for q in loc)


def ferry(g):
    L, a0, a1, b0, b1 = fb_frame()
    # front (Embarcadero, city side) is at whichever b-extreme is nearer the tower
    front_b = b0 if abs(b0) < abs(b1) else b1
    fs = -1 if front_b == b0 else 1                  # sign of b pointing out of the front
    back_b = b1 if fs < 0 else b0
    yG = min(sidewalk(*L.xz(a, b)) for a in (a0, 0, a1) for b in (b0, b1)) + 0.1
    ST = C('#e2dccd'); STD = C('#cbc3b1'); TR = C('#b9a88c')
    y_g, y_2, y_c = yG + 7.8, yG + 14.6, yG + 16.4
    cols = []
    ring = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
    for ea, eb in ring_edges(ring):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        arcade_wall(g, F, 0, Le, yG - 0.3, y_g, 5.6, 3.8, ST, lit=0.9, depth=0.8)
        g.fbox('stone', F, 0, Le, y_g, y_g + 0.6, 0, 0.4, STD, top=True, bottom=True)
        facade(g, ea, eb, y_g + 0.6, y_2, 6.0, 5.6, Win(w=2.2, sill=1.0, head=5.2, depth=0.4, arch=1, lit=0.5, keystone=True), 'stone', ST, margin=0.8)
        radial_panel(g, 'stone', F, 0, Le, y_2, y_c, None, ST)
    entablature(g, ring, y_c, 1.8, ST, depth=1.0)
    for ea, eb in ring_edges(ring): balustrade(g, ea, eb, y_c, 1.1, ST)
    # end pavilions (slightly higher, with hipped roofs) + the nave clerestory running the length of the roof
    for aa, sgn in ((a0, 1), (a1, -1)):
        pr = L.ring([(aa, b0), (aa + sgn * 16, b0), (aa + sgn * 16, b1), (aa, b1)])
        g.prism('stone', pr, y_c, y_c + 3.0, ST, top=False)
        g.sweep('roof', pr, [(0.2, y_c + 3.0), (-6.0, y_c + 7.0)], C('#7a7a74'))
        g.poly('roof', [(p[0], y_c + 7.0, p[1]) for p in ring_offset(ring_out(pr), -6.0)], C('#7a7a74'), (0, 1, 0))
    g.poly('roof', [(p[0], y_c - 0.2, p[1]) for p in ring_offset(ring_out(ring), -0.8)], ROOF, (0, 1, 0))
    bm = (b0 + b1) / 2
    ca0, ca1 = a0 + 16, a1 - 16
    for sg in (-1, 1):
        g.poly('glassc', [L.P(ca0, bm + sg * 7.5, y_c + 0.2), L.P(ca1, bm + sg * 7.5, y_c + 0.2), L.P(ca1, bm + sg * 1.2, y_c + 4.2), L.P(ca0, bm + sg * 1.2, y_c + 4.2)],
               C('#b8c7cc'), (0, 1, 0))
    L.box(g, 'metal', ca0, ca1, bm - 1.2, bm + 1.2, y_c + 4.1, y_c + 4.5, C('#6e7270'))
    if not g.lod:
        for k in range(int((ca1 - ca0) / 6) + 1):
            a = ca0 + k * 6
            for sg in (-1, 1):
                g.rod('metal', L.P(a, bm + sg * 7.5, y_c + 0.3), L.P(a, bm + sg * 1.2, y_c + 4.3), 0.07, C('#4a4e4c'), n=4)
    # clock tower (Giralda-inspired): shaft, clock stage, belfry, lantern stages, cupola
    T = 5.9
    tb = front_b + fs * 0.0
    TL = Loc(L.xz(0, 0), L.u)
    def sq(h): return TL.ring([(-h, -h), (h, -h), (h, h), (-h, h)])
    yt1 = yG + 43.5
    for ea, eb in ring_edges(sq(T)):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        radial_panel(g, 'stone', F, 0, Le, y_c - 1, yt1, None, ST)
        if not g.lod:
            for i in range(3):
                u = Le * (i + 1) / 4
                for yy in range(int(y_c + 3), int(yt1 - 12), 5):
                    g.fbox('win', F, u - 0.35, u + 0.35, yy, yy + 2.6, -0.1, 0.02, glass_col(0.3), top=False, sides=False)
            g.fbox('stone', F, -0.3, Le + 0.3, y_c - 1, y_c + 1.5, 0, 0.3, STD, top=True)
        # clock dial
        cyc = yt1 - 6.0
        n = 32 if not g.lod else 12
        pts = [(Le / 2 + math.cos(2 * math.pi * i / n) * 3.3, cyc + math.sin(2 * math.pi * i / n) * 3.3) for i in range(n)]
        g.poly('lamp', [Geo.fp(F, u, v, 0.12) for u, v in pts], (1.0, 0.95, 0.82, 1.0), (F[2][0], 0, F[2][1]))
        if not g.lod:
            ring_ = [(Le / 2 + math.cos(2 * math.pi * i / n) * 3.6, cyc + math.sin(2 * math.pi * i / n) * 3.6) for i in range(n)]
            for i in range(n):
                g.poly('metal', [Geo.fp(F, *pts[i], 0.13), Geo.fp(F, *pts[(i + 1) % n], 0.13), Geo.fp(F, *ring_[(i + 1) % n], 0.2), Geo.fp(F, *ring_[i], 0.2)], C('#2a2a2a'), (F[2][0], 0, F[2][1]))
            for hh in range(12):
                aa = 2 * math.pi * hh / 12
                p0 = Geo.fp(F, Le / 2 + math.cos(aa) * 2.8, cyc + math.sin(aa) * 2.8, 0.16); p1 = Geo.fp(F, Le / 2 + math.cos(aa) * 3.15, cyc + math.sin(aa) * 3.15, 0.16)
                g.rod('metal', p0, p1, 0.07, C('#1a1a1a'), n=3)
            g.rod('metal', Geo.fp(F, Le / 2, cyc, 0.2), Geo.fp(F, Le / 2 + 1.2, cyc + 1.4, 0.2), 0.09, C('#1a1a1a'), n=3)
            g.rod('metal', Geo.fp(F, Le / 2, cyc, 0.22), Geo.fp(F, Le / 2 - 0.4, cyc + 2.5, 0.22), 0.06, C('#1a1a1a'), n=3)
    entablature(g, sq(T), yt1, 1.2, ST, depth=0.7)
    # belfry: arched openings on each face
    yb0, yb1 = yt1, yG + 50.5
    for ea, eb in ring_edges(sq(T - 0.3)):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        arcade_wall(g, F, 0, Le, yb0, yb1, Le / 3, 3.2, ST, open_=True, depth=0.8)
    g.prism('stone', sq(T - 2.0), yb0, yb1, STD, top=False)
    for ea, eb in ring_edges(sq(T)): balustrade(g, ea, eb, yb1, 1.0, ST)
    g.prism('stone', sq(T - 0.3), yb1 - 0.2, yb1 + 0.1, ST, top=True, walls=False)
    ys = yG + 54.2
    for ea, eb in ring_edges(sq(T - 1.5)):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        arcade_wall(g, F, 0, Le, yb1, ys, Le / 2, 1.8, ST, open_=True, depth=0.6)
    g.prism('stone', sq(T - 3.0), yb1, ys, STD, top=False)
    entablature(g, sq(T - 1.5), ys + 0.6, 0.8, ST, depth=0.5)
    # octagonal lantern stages + cupola + finial
    o1 = ring_facets(*L.xz(0, 0), T - 1.9, 8, math.pi / 8 - L.yaw() * 0)
    for ea, eb in ring_edges(o1):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        arcade_wall(g, F, 0, Le, ys + 0.6, yG + 60.5, Le, 2.8, ST, open_=True, depth=0.5)
    g.prism('stone', ring_scale(o1, L.xz(0, 0), 0.55), ys + 0.6, yG + 60.5, STD, top=False)
    x0, z0 = L.xz(0, 0)
    g.lathe('stone', x0, z0, [(T - 1.4, yG + 60.5), (T - 1.4, yG + 61.2), (T - 2.4, yG + 61.2), (T - 2.4, yG + 64.5), (T - 1.9, yG + 64.9), (T - 2.8, yG + 65.1)], ST, n=8)
    g.lathe('stone', x0, z0, [(T - 2.8, yG + 65.1), (T - 3.2, yG + 67.8), (1.5, yG + 69.8), (0.4, yG + 70.8)], ST, n=16 if not g.lod else 8)
    g.lathe('gold', x0, z0, [(0.4, yG + 70.6), (0.7, yG + 71.3), (0.2, yG + 72.3), (0.12, yG + 74.2), (0.0, yG + 75.0)], GOLD, n=8)
    if not g.lod:   # floodlights
        for ea, eb in ring_edges(sq(T + 1.5)):
            F = Geo.frame(ea, eb)
            g.fbox('lamp', F, 1.5, 3.0, y_c + 0.1, y_c + 0.5, 0, 0.4, (1.0, 0.86, 0.6, 1.0), top=True)
    # PORT OF SAN FRANCISCO on the bay face of the tower belfry base + flags on the front
    if not g.lod:
        bay = TL.F(-T, T, 0) if fs < 0 else TL.F(T, -T, 2)
        g.text('neon', bay, T, y_c + 6.0, 0.15, 'PORT OF SAN FRANCISCO', 0.85, (1.0, 0.97, 0.9, 1.0), depth=0.1)
    cols += wall_colliders(ring, yG - 6, y_c + 2)
    noT = [[list(p) for p in L.ring([(a0 - 8, b0 - 8), (a1 + 8, b0 - 8), (a1 + 8, b1 + 8), (a0 - 8, b1 + 8)])]]
    return {'colliders': cols, 'name': 'Ferry Building', 'replaces': 'ferry', 'yG': round(yG, 2), 'top': round(yG + 75, 1), 'noTrees': noT}


# ================================================================================== Coit Tower (1933) on Telegraph Hill
COIT_HIDE = [9290, 9291, 9292, 9293, 9294, 9297]
COIT = dict(R=5.7, RIN=5.05, H=64.0, DECK=51.2)


def coit_frame():
    c = centroid(ring_out(ring_of(9297)))
    ent = ring_out(ring_of(9293))
    e = max(ring_edges(ent), key=lambda e: v2len(v2sub(e[1], e[0])))
    return c, Loc(c, v2norm(v2sub(e[1], e[0])))


def coit(g):
    c, L = coit_frame()
    base = ring_simplify(ring_of(9291), 0.35)
    yG = min(H(*p) for p in ring_out(base)) + 0.15
    CR = C('#e7e0cc'); CRD = C('#d2c9b1')
    R, Hh, DK = COIT['R'], COIT['H'], COIT['DECK']
    cx, cz = c
    cols = []
    # lobby ring building: plain concrete walls, small square windows, parapet
    yb = yG + 5.2
    for ea, eb in ring_edges(base):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        if (ea, eb) == edge_facing(base, -1, 0): continue
        if Le > 2.5:
            facade(g, ea, eb, yG - 2.5, yb, 7.7, 3.2, Win(w=0.9, sill=4.8, head=6.6, depth=0.3, lit=0.4), 'concrete', CR, margin=0.6)
        else:
            radial_panel(g, 'concrete', F, 0, Le, yG - 2.5, yb, None, CR)
    parapet(g, base, yb, 1.0, 0.3, CRD, slot='concrete', roof_col=C('#b3ab98'))
    # arched entrance portal on the west side of the lobby ring
    pa_, pb_ = edge_facing(base, -1, 0)
    F = Geo.frame(pa_, pb_); Le = v2len(v2sub(pb_, pa_))
    hole = opening_poly(Le / 2, 3.0, yG + 0.05, yG + 4.3, 1, 12 if not g.lod else 4)
    radial_panel(g, 'concrete', F, 0, Le, yG - 2.5, yb, hole, CR)
    recess(g, F, hole, 0.9, 'concrete', CRD, 'shop', (1.0, 0.84, 0.6, 1.0))
    g.fbox('concrete', F, Le / 2 - 2.4, Le / 2 + 2.4, yb, yb + 1.6, 0, 0.3, CRD, top=True)
    if not g.lod: g.text('concrete', F, Le / 2, yb + 0.35, 0.32, 'COIT TOWER', 0.55, shade(CR, 0.7), depth=0.05)
    ent = base
    # fluted shaft
    NF = 32 if not g.lod else 16
    ys0, ys1 = yb - 0.05, yG + DK - 1.0
    for i in range(NF):
        a0, a1 = 2 * math.pi * i / NF, 2 * math.pi * (i + 1) / NF
        rr = R if i % 2 == 0 else R - 0.28
        P = lambda aa, yy: (cx + math.cos(aa) * rr, yy, cz + math.sin(aa) * rr)
        g.quad_sub('concrete', P(a0, ys0), P(a1, ys0), P(a1, ys1), P(a0, ys1), CR, (math.cos((a0 + a1) / 2), 0, math.sin((a0 + a1) / 2)), maxe=4 if not g.lod else 20)
        if i % 2 == 1:
            for aa in (a0, a1):
                q0 = (cx + math.cos(aa) * R, ys0, cz + math.sin(aa) * R); q1 = (cx + math.cos(aa) * (R - 0.28), ys0, cz + math.sin(aa) * (R - 0.28))
                g.poly('concrete', [q0, q1, (q1[0], ys1, q1[2]), (q0[0], ys1, q0[2])], shade(CR, 0.9), None)
    # narrow vertical window slots on the stair side
    if not g.lod:
        for k in range(8):
            aa = 2 * math.pi * (k * 4 + 1.5) / NF
            for yy in range(int(yb + 3), int(ys1 - 4), 6):
                p = (cx + math.cos(aa) * (R - 0.27), cz + math.sin(aa) * (R - 0.27))
                Fp = (p, (-math.sin(aa), math.cos(aa)), (math.cos(aa), math.sin(aa)))
                g.fbox('win', Fp, -0.25, 0.25, yy, yy + 2.2, -0.05, 0.02, glass_col(0.3), top=False, sides=False)
    # observation arcade: 12 open round arches (walk-up deck inside)
    NA = 12
    y_a0, y_a1 = yG + DK - 1.0, yG + DK + 6.2
    fac = ring_facets(cx, cz, R, NA)
    for i in range(NA):
        a, b = fac[i], fac[(i + 1) % NA]
        F = Geo.frame(a, b); n = edge_n(a, b)
        if n[0] * ((a[0] + b[0]) / 2 - cx) + n[1] * ((a[1] + b[1]) / 2 - cz) < 0: F = Geo.frame(b, a)
        Le = v2len(v2sub(b, a))
        hole = opening_poly(Le / 2, 1.75, y_a0 + 2.2, y_a0 + 5.6, 1, 10 if not g.lod else 4)
        radial_panel(g, 'concrete', F, 0, Le, y_a0, y_a1, hole, CR)
        m = len(hole); cu = sum(p[0] for p in hole) / m; cv = sum(p[1] for p in hole) / m
        for k in range(m):
            p, q = hole[k], hole[(k + 1) % m]
            mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
            g.poly('concrete', [Geo.fp(F, p[0], p[1], 0), Geo.fp(F, q[0], q[1], 0), Geo.fp(F, q[0], q[1], -0.65), Geo.fp(F, p[0], p[1], -0.65)], CRD,
                   (-(F[1][0] * mu), -mv, -(F[1][1] * mu)))
    g.lathe('concrete', cx, cz, [(R, y_a0 - 0.1), (R + 0.35, y_a0 + 0.1), (R + 0.35, y_a0 + 0.5), (R, y_a0 + 0.6)], CRD, n=NF)
    # crown: cornice, attic with small openings, flat roof
    yc = yG + Hh
    g.lathe('concrete', cx, cz, [(R, y_a1), (R + 0.45, y_a1 + 0.4), (R + 0.45, y_a1 + 1.0), (R - 0.1, y_a1 + 1.2), (R - 0.1, yc - 0.8), (R + 0.2, yc - 0.5),
                                 (R + 0.2, yc), (0.0, yc)], CR, n=NF)
    if not g.lod:
        for i in range(24):
            aa = 2 * math.pi * (i + 0.5) / 24
            p = (cx + math.cos(aa) * (R - 0.08), cz + math.sin(aa) * (R - 0.08))
            Fp = (p, (-math.sin(aa), math.cos(aa)), (math.cos(aa), math.sin(aa)))
            g.fbox('win', Fp, -0.3, 0.3, y_a1 + 2.0, y_a1 + 3.6, -0.05, 0.03, (0.0, 0.0, 0.0, 1.0), top=False, sides=False)
        for i in range(8):   # floodlights on the parapet ring (the tower glows at night)
            aa = 2 * math.pi * i / 8
            p = (cx + math.cos(aa) * (R + 1.1), cz + math.sin(aa) * (R + 1.1))
            g.box('lamp', p[0] - 0.25, p[0] + 0.25, yb + 1.0, yb + 1.3, p[1] - 0.25, p[1] + 0.25, (1.0, 0.9, 0.7, 1.0))
    cols += wall_colliders(base, yG - 4, yb + 1)
    return {'colliders': cols, 'name': 'Coit Tower', 'replaces': 'coit', 'yG': round(yG, 2), 'top': round(yc + 1, 1)}


# ================================================================================== Ghirardelli Square (fictionalised signage)
GH_HIDE = [3520, 3549, 3542, 3521, 3523, 3550, 3524, 3544, 3545, 3522, 3547, 3548, 3546, 3551]


def ghirardelli(g):
    RB = C('#f2d2c2'); RBD = C('#d2ab9a'); TRIM = C('#e8dcc4'); SLATE = C('#4b4f55')
    cols = []
    fronts = {}
    for i in GH_HIDE:
        if i in (3548, 3551, 3546): continue
        r = ring_simplify(ring_of(i), 0.35)
        yG = min(sidewalk(*p) for p in ring_out(r))
        h = max(bld(i)['h'], 7.5)
        top = yG + h + (2.0 if i in (3520, 3549) else 0.0)
        for ea, eb in ring_edges(r):
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            nt = neighbour_top(ea, eb, {i})
            if nt and nt > top - 1 and Le > 0:
                radial_panel(g, 'brickred', F, 0, Le, yG - 3, top, None, RBD); continue
            if Le < 3:
                radial_panel(g, 'brickred', F, 0, Le, yG - 3, top, None, RB); continue
            storefront(g, ea, eb, sidewalk, yG + 4.2, 3.6, 'brickred', RB, glass_slot='shop', arch=1, lit=0.9, frame_col=C('#2f2a24'), depth=0.35)
            if top - yG - 4.2 > 2.5:
                facade(g, ea, eb, yG + 4.2, top - 1.0, 3.9, 2.8, Win(w=1.2, sill=0.8, head=2.9, depth=0.3, arch=2, lit=0.45, frame_col=TRIM), 'brickred', RB, margin=0.6,
                       band=(0.2, 0.05, TRIM))
            radial_panel(g, 'brickred', F, 0, Le, max(yG + 4.2, top - 1.0), top, None, RB)
        # crenellated parapet (castellated mill buildings) or plain cornice
        if i in (3520, 3549, 3523, 3550):
            rr = ring_out(r)
            g.sweep('brickred', rr, [(0, top), (0.25, top + 0.2), (0.25, top + 0.5), (0, top + 0.5)], RBD)
            if not g.lod:
                for ea, eb in ring_edges(rr):
                    F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
                    for k in range(int(Le / 1.6)):
                        u = 0.4 + k * 1.6
                        g.fbox('brickred', F, u, u + 0.8, top + 0.5, top + 1.4, -0.35, 0.0, RB, top=True)
            g.poly('roof', [(p[0], top + 0.05, p[1]) for p in ring_offset(rr, -0.3)], ROOF, (0, 1, 0))
        else:
            parapet(g, r, top, 0.7, 0.3, RB, slot='brickred', roof_col=ROOF)
        cols += wall_colliders(r, yG - 5, top)
        fronts[i] = (r, yG, top)
    # the Clock Tower at the Larkin / North Point corner (east end of the clock-tower building)
    r, yG, top = fronts[3542]
    rr = ring_out(r)
    e = max(ring_edges(rr), key=lambda e: v2len(v2sub(e[1], e[0])))
    u = v2norm(v2sub(e[1], e[0]))
    if u[0] < 0: u = (-u[0], -u[1])
    loc = [Loc(centroid(rr), u).loc(*p) for p in rr]
    L = Loc(centroid(rr), u)
    amax = max(q[0] for q in loc); bmid = (min(q[1] for q in loc) + max(q[1] for q in loc)) / 2
    tc = L.xz(amax - 4.5, bmid)
    TL = Loc(tc, u)
    t = 4.0; yt = yG + 25.0
    sq = TL.ring([(-t, -t), (t, -t), (t, t), (-t, t)])
    for ea, eb in ring_edges(sq):
        F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        facade(g, ea, eb, top, yt, 4.0, Le, Win(w=1.1, sill=1.0, head=3.0, depth=0.3, arch=1, lit=0.4), 'brickred', RB, margin=0.3)
        n = 24 if not g.lod else 10
        pts = [(Le / 2 + math.cos(2 * math.pi * k / n) * 1.6, yt - 2.4 + math.sin(2 * math.pi * k / n) * 1.6) for k in range(n)]
        g.poly('lamp', [Geo.fp(F, uu, v, 0.08) for uu, v in pts], (1.0, 0.96, 0.85, 1.0), (F[2][0], 0, F[2][1]))
        if not g.lod:
            g.rod('metal', Geo.fp(F, Le / 2, yt - 2.4, 0.12), Geo.fp(F, Le / 2 + 0.7, yt - 1.8, 0.12), 0.05, C('#1a1a1a'), n=3)
            g.rod('metal', Geo.fp(F, Le / 2, yt - 2.4, 0.14), Geo.fp(F, Le / 2 - 0.2, yt - 1.2, 0.14), 0.04, C('#1a1a1a'), n=3)
    g.sweep('stone', sq, [(0, yt), (0.4, yt + 0.3), (0.4, yt + 0.8), (0, yt + 0.8)], TRIM)
    g.lathe('metal', *tc, [(t * 1.2, yt + 0.8), (t * 0.9, yt + 3.0), (0.3, yt + 9.5), (0.0, yt + 10.5)], SLATE, n=4, a0=math.pi / 4 + math.atan2(u[1], u[0]))
    g.lathe('gold', *tc, [(0.12, yt + 10.3), (0.0, yt + 12.0)], GOLD, n=6)
    cols.append(TL.col(-t, t, -t, t, yG, yt))
    # the big roof sign on the north (Beach St) building, facing the bay
    r, yG2, top2 = fronts[3521]
    a, b = edge_facing(r, 0.16, -0.99)
    F = Geo.frame(a, b); Le = v2len(v2sub(b, a))
    if not g.lod:
        for k in range(7):
            uu = Le * (k + 0.5) / 7
            g.fbox('metal', F, uu - 0.08, uu + 0.08, top2, top2 + 6.5, -3.0, -2.8, C('#2c2c2c'), top=True)
            g.rod('metal', Geo.fp(F, uu, top2, -6.0), Geo.fp(F, uu, top2 + 5.5, -2.9), 0.06, C('#2c2c2c'), n=4)
        g.fbox('metal', F, Le * 0.05, Le * 0.95, top2 + 6.3, top2 + 6.5, -3.0, -2.8, C('#2c2c2c'), top=True)
    g.text('neon', F, Le / 2, top2 + 1.6, -2.75, 'GIRARDI', 4.2, (1.0, 0.95, 0.88, 1.0), depth=0.3, spacing=1.15)
    g.text('neon', F, Le / 2, top2 + 0.3, -2.75, 'SQUARE', 1.2, (1.0, 0.22, 0.16, 1.0), depth=0.2, spacing=1.3)
    # mermaid fountain (octagonal pool) on the fountain plaza
    fx, fz = centroid(ring_of(3551)); fy = H(fx, fz) + 0.05
    n = 8
    g.lathe('granite', fx, fz, [(4.2, fy - 0.3), (4.2, fy + 0.55), (3.8, fy + 0.55), (3.8, fy + 0.2)], C('#a39e93'), n=n)
    g.lathe('water', fx, fz, [(3.8, fy + 0.35), (0.0, fy + 0.35)], C('#ffffff'), n=n)
    g.lathe('metal', fx, fz, [(0.9, fy + 0.3), (0.6, fy + 1.0), (0.35, fy + 1.9), (0.5, fy + 2.3), (0.2, fy + 2.9), (0.0, fy + 3.0)], C('#5b4a32'), n=10)
    cols.append({'x': round(fx, 2), 'z': round(fz, 2), 'hx': 4.0, 'hz': 4.0, 'yaw': 0, 'yMin': fy - 1, 'yMax': fy + 0.6})
    # palms + olive trees on the terraces, strings of lights
    for k, (dx, dz) in enumerate(((-9, -4), (8, -6), (-6, 7), (7, 6))):
        x, z = fx + dx, fz + dz; y = H(x, z)
        if not any(point_in(ring_of(i), x, z) for i in GH_HIDE if i not in (3546, 3551)):
            cols.append(palm(g, x, z, y, 7 + k % 2 * 2.0, 300 + k))
    return {'colliders': cols, 'name': 'Girardi Square', 'yG': 8.0, 'top': 40}


# ================================================================================== Pier 39: entrance gateway + carousel + the timber shop buildings
P39_HIDE = [1895, 1894]
P39_CAROUSEL = (811.0, -3727.5)


def pier39(g):
    WB = C('#8b7157'); WBD = C('#6b5440'); WRF = C('#5a5550'); CR = C('#eee6d2')
    cols = []
    for i in P39_HIDE:
        r = ring_simplify(ring_of(i), 0.5)
        yG = min(sidewalk(*p) for p in ring_out(r))
        y1 = yG + 4.2; y2 = yG + 8.6
        for ea, eb in ring_edges(r):
            F = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            if Le < 2.5: radial_panel(g, 'wood', F, 0, Le, yG - 3, y2, None, WBD); continue
            storefront(g, ea, eb, sidewalk, y1, 3.4, 'wood', WB, glass_slot='shop', lit=0.95, frame_col=C('#3a2c20'), awning=C('#2f5f7a') if Le > 8 else None)
            g.fbox('wood', F, 0, Le, y1, y1 + 0.3, 0, 1.8, WBD, top=True, bottom=True)                   # upper-level boardwalk balcony
            if not g.lod:
                for k in range(int(Le / 2.4) + 1):
                    g.fbox('wood', F, k * 2.4 - 0.08, k * 2.4 + 0.08, y1 + 0.3, y1 + 1.3, 1.6, 1.8, WBD, top=True)
                g.fbox('wood', F, 0, Le, y1 + 1.25, y1 + 1.4, 1.55, 1.85, WB, top=True, bottom=True)
            storefront(g, ea, eb, lambda x, z: y1 + 0.3, y2 - 0.6, 3.4, 'wood', WB, glass_slot='shop', lit=0.8, frame_col=C('#3a2c20'), y_under=y1)
            radial_panel(g, 'wood', F, 0, Le, y2 - 0.6, y2, None, WBD)
        g.sweep('roof', r, [(0.9, y2), (-3.5, y2 + 3.2)], WRF)
        g.poly('roof', [(p[0], y2 + 3.2, p[1]) for p in ring_offset(ring_out(r), -3.5)], WRF, (0, 1, 0))
        cols += wall_colliders(r, yG - 4, y2)
    # entrance gateway between the two buildings, facing the Embarcadero
    ga = ring_out(ring_of(1895)); gb = ring_out(ring_of(1894))
    pa = max(ga, key=lambda p: p[0] * 0.5 + p[1]); pb = max(gb, key=lambda p: -p[0] * 0.5 + p[1])
    A = (pa[0] + 1.5, pa[1] + 6.0); B = (pb[0] - 1.5, pb[1] + 6.0)
    y0 = min(H(*A), H(*B)) + 0.05
    t = v2norm(v2sub(B, A)); n = (-t[1], t[0])
    if n[1] < 0: n = (-n[0], -n[1])                       # face the Embarcadero (south)
    for P in (A, B):
        Ft = (v2sub(P, v2mul(t, 1.6)), t, n)
        g.fbox('wood', Ft, 0, 3.2, y0 - 1, y0 + 12.0, -1.6, 1.6, WB, top=True, back=True)
        g.sweep('roof', [v2add(v2add(P, v2mul(t, s1 * 2.1)), v2mul(n, s2 * 2.1)) for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1))],
                [(0.0, y0 + 12.0), (-2.1, y0 + 14.2)], WRF)
        cols.append({'x': round(P[0], 2), 'z': round(P[1], 2), 'hx': 1.7, 'hz': 1.7, 'yaw': round(math.atan2(-t[1], t[0]), 4), 'yMin': y0 - 1, 'yMax': y0 + 12})
    Fg = (A, t, n); Lg = v2len(v2sub(B, A))
    g.fbox('wood', Fg, 0, Lg, y0 + 7.4, y0 + 10.6, -0.4, 0.4, WBD, top=True, bottom=True, back=True)
    g.text('neon', Fg, Lg / 2, y0 + 8.0, 0.42, 'PIER 39', 2.1, (1.0, 0.93, 0.8, 1.0), depth=0.2, spacing=1.1)
    g.text('stone', Fg, Lg / 2, y0 + 7.55, 0.42, 'SAN FRANCISCO', 0.42, CR, depth=0.05, spacing=1.2)
    if not g.lod:
        for k in range(int(Lg / 1.2)):
            u = 0.6 + k * 1.2
            g.fbox('lamp', Fg, u - 0.12, u + 0.12, y0 + 10.6, y0 + 10.84, 0.3, 0.55, (1.0, 0.85, 0.55, 1.0))
        for P in (A, B):   # flag poles
            q = v2add(P, v2mul(n, 2.5))
            g.cyl('metal', q[0], q[1], 0.09, y0, y0 + 16.0, C('#dcdcdc'), n=6)
            Ff = (q, t, n)
            g.fbox('fabric', Ff, 0.1, 2.6, y0 + 14.2, y0 + 15.8, -0.02, 0.02, C('#1f4b8f'), top=False, back=True)
    # timber boardwalk plaza between the Embarcadero sidewalk and the pier buildings
    blds = [ring_of(i) for i in (1895, 1894, 1893, 1901, 1902)]
    st = 3.0 if not g.lod else 9.0
    # (wave 5: the whole pier top, not just the plaza, is decked; steep terrain edges stay as they are)
    blds += [bb['ring'] for bb in buildings_near(820, -3800, 110) if len(bb['ring']) >= 3]
    for i in range(int(175 / st)):
        for j in range(int(165 / st)):
            x0_, z0_ = 760 + i * st, -3876 + j * st
            q = [(x0_, z0_), (x0_ + st, z0_), (x0_ + st, z0_ + st), (x0_, z0_ + st)]
            m = (x0_ + st / 2, z0_ + st / 2)
            hs_ = [H(*p) for p in q]
            if any(point_in(r_, *m) for r_ in blds) or H(*m) < 1.0 or min(hs_) < 0.6 or max(hs_) - min(hs_) > 0.9: continue
            g.poly('wood', [(p[0], H(*p) + 0.04, p[1]) for p in q], shade(C('#9a8266'), 0.9 + 0.2 * ((i * 7 + j * 3) % 5) / 5), (0, 1, 0))
    # the double-decker Venetian carousel
    cx, cz = P39_CAROUSEL; yc = H(cx, cz) + 0.05
    R = 8.2
    nn = 32 if not g.lod else 12
    g.lathe('wood', cx, cz, [(R + 0.4, yc), (R + 0.4, yc + 0.45), (0.0, yc + 0.45)], C('#6d3f2a'), n=nn)
    g.cyl('paint', cx, cz, 1.4, yc + 0.45, yc + 7.2, C('#e8c46a'), n=16)
    for lv_, yy in enumerate((yc + 0.45, yc + 3.9)):
        rr = R - 0.3 - lv_ * 1.0
        if lv_: g.lathe('wood', cx, cz, [(rr + 0.3, yy - 0.3), (rr + 0.3, yy), (1.4, yy)], C('#7b4a33'), n=nn)
        for k in range(18 if not g.lod else 6):
            a = 2 * math.pi * (k + 0.5 * lv_) / (18 if not g.lod else 6)
            for ring_r in (rr - 1.0, rr - 2.6):
                px, pz = cx + math.cos(a) * ring_r, cz + math.sin(a) * ring_r
                g.cyl('gold', px, pz, 0.05, yy, yy + 3.3, GOLD, n=5)
                if not g.lod:
                    hy = yy + 1.1 + 0.35 * math.sin(k * 1.7 + lv_)
                    tx, tz = -math.sin(a), math.cos(a)
                    g.box('paint', px - 0.2, px + 0.2, hy, hy + 0.55, pz - 0.2, pz + 0.2, [C('#f2efe6'), C('#6b4630'), C('#c9a55a'), C('#303030')][k % 4])
                    g.rod('paint', (px - tx * 0.7, hy + 0.35, pz - tz * 0.7), (px + tx * 0.7, hy + 0.35, pz + tz * 0.7), 0.26, [C('#f2efe6'), C('#6b4630'), C('#c9a55a'), C('#303030')][k % 4], n=6)
                    g.rod('paint', (px + tx * 0.6, hy + 0.45, pz + tz * 0.6), (px + tx * 0.95, hy + 1.0, pz + tz * 0.95), 0.12, [C('#f2efe6'), C('#6b4630'), C('#c9a55a'), C('#303030')][k % 4], n=5)
    # canopies: scalloped rims with bulbs, a striped cone roof, a flag on top
    for lv_, (rr, yy) in enumerate(((R, yc + 3.75), (R - 1.0, yc + 7.2))):
        g.lathe('paint', cx, cz, [(rr, yy - 0.6), (rr, yy + 0.1)], C('#e9dcc0'), n=nn)
        if not g.lod:
            for k in range(nn * 2):
                a = 2 * math.pi * k / (nn * 2)
                g.box('lamp', cx + math.cos(a) * (rr + 0.03) - 0.07, cx + math.cos(a) * (rr + 0.03) + 0.07, yy - 0.35, yy - 0.2, cz + math.sin(a) * (rr + 0.03) - 0.07,
                      cz + math.sin(a) * (rr + 0.03) + 0.07, (1.0, 0.85, 0.55, 1.0))
        g.lathe('paint', cx, cz, [(rr, yy + 0.1), (rr * 0.25 if lv_ else rr - 1.0, yy + (2.2 if lv_ else 0.4))], C('#b43a3a') if lv_ else C('#d9c9a8'), n=nn)
    for k in range(nn):
        if k % 2: continue
        a0, a1 = 2 * math.pi * k / nn, 2 * math.pi * (k + 1) / nn
        rr = R - 1.0; y0_ = yc + 7.3; y1_ = yc + 9.4
        g.poly('paint', [(cx + math.cos(a0) * rr, y0_, cz + math.sin(a0) * rr), (cx + math.cos(a1) * rr, y0_, cz + math.sin(a1) * rr), (cx, y1_ + 0.02, cz)],
               C('#f1ead8'), (math.cos((a0 + a1) / 2), 0.8, math.sin((a0 + a1) / 2)))
    g.cyl('metal', cx, cz, 0.06, yc + 9.4, yc + 11.5, C('#dcdcdc'), n=5)
    g.poly('fabric', [(cx, yc + 11.4, cz), (cx + 1.4, yc + 11.0, cz), (cx, yc + 10.6, cz)], C('#b43a3a'), None)
    cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': R * 0.72, 'hz': R * 0.72, 'yaw': 0.3927, 'yMin': yc - 1, 'yMax': yc + 9})
    cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': R * 0.72, 'hz': R * 0.72, 'yaw': 0.0, 'yMin': yc - 1, 'yMax': yc + 9})
    noT = [[[768, -3741], [918, -3741], [918, -3711], [768, -3711]], [[770, -3870], [880, -3870], [880, -3741], [770, -3741]]]
    return {'colliders': cols, 'name': 'Pier 39', 'replaces': 'pier39', 'yG': round(y0, 2), 'top': 20, 'noTrees': noT}


BUILDERS = {
    'cityHall': (city_hall, CH_HIDE),
    'opera': (opera, [38733]),
    'davies': (davies, [38949, 38948]),
    'asianArt': (asian_art, [29848]),
    'library': (library, [39078, 39033]),
    'ferry': (ferry, FB_HIDE),
    'coit': (coit, COIT_HIDE),
    'ghirardelli': (ghirardelli, GH_HIDE),
    'pier39': (pier39, P39_HIDE),
}
ORIGINS = {'library': _lib_origin, 'ferry': lambda: origin_for([ring_of(13853)])}


def main():
    ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = ORIGINS[bid]() if bid in ORIGINS else origin_for([ring_of(i) for i in hide])
        run_building(bid, fn, hide, O)


if __name__ == '__main__':
    main()
