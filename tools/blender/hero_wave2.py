"""HILLBOMB hero landmarks, wave 2 (Market St / Financial District).

Run:  tools/.venv-blender/Scripts/python.exe tools/blender/hero_wave2.py -- palace phelan ...
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_lib import *   # noqa
from hero_wave1 import (ring_edges, neighbour_top, ground_min, sidewalk, floor_levels, origin_for, rustication, edge_facing, tfacade,
                        fpt, star, ROOF, GOLD, BRONZE, clip_rect)   # noqa

BUFF = C('#dcc9a6'); BUFF_D = C('#c7b28b'); TERRA = C('#eeeadf'); TERRA_D = C('#d8d2c3')


def classic_block(g, ring, own, yG, top, base_h, fh, bay, pal, win, attic=None, arch_base=True, cornice_d=1.4, blank_party=True,
                  shop_lit=0.9, extra_cover=None):
    """generic Beaux-Arts block: arched/rect storefront base, string course, punched shaft, optional attic, cornice, parapet"""
    wall, wall_d = pal
    lv0 = yG + base_h
    nf = max(1, int((top - 1.8 - lv0 - (attic[0] if attic else 0)) / fh))
    y_sh1 = lv0 + nf * fh
    for a, b in ring_edges(ring):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        nt = neighbour_top(a, b, own)
        if blank_party and nt and nt > top - 3:
            radial_panel(g, 'stone', F, 0, L, yG - 4, top, None, wall_d); continue
        cv = extra_cover(a, b) if extra_cover else None
        if cv:
            radial_panel(g, 'stone', F, 0, L, cv, lv0, None, wall_d)
        else:
            storefront(g, a, b, sidewalk, lv0, bay * (1.0 if not arch_base else 1.0), 'stone', wall_d, glass_slot='shop', arch=1 if arch_base else 0,
                       depth=0.4, lit=shop_lit, pier=(0.8, 0.15, wall_d), transom=1.4)
            rustication(g, a, b, yG - 3, lv0, 0.7, wall_d)
        g.fbox('stone', F, 0, L, lv0 - 0.1, lv0 + 0.5, 0, 0.3, wall, top=True, bottom=True)
        facade(g, a, b, lv0 + 0.5, y_sh1, fh, bay, win, 'stone', wall, margin=1.0)
        if attic:
            ah, aw = attic
            facade(g, a, b, y_sh1, y_sh1 + ah, ah, bay, aw, 'stone', wall, margin=1.0, pier=(0.5, 0.18, wall_d))
            radial_panel(g, 'stone', F, 0, L, y_sh1 + ah, top, None, wall)
        else:
            radial_panel(g, 'stone', F, 0, L, y_sh1, top, None, wall)
    cornice(g, ring, top, cornice_d, wall, height=cornice_d * 1.5)
    parapet(g, ring, top, 1.0, 0.3, wall_d, roof_col=ROOF)
    return lv0


# ------------------------------------------------------------------------------------------ Palace Hotel (2 New Montgomery)
PALACE = [23753, 23738, 23737]


def palace(g):
    main, lobby, court = ring_of(23753), ring_of(23738), ring_of(23737)
    own = set(PALACE)
    yG = sidewalk(1530, -1508)
    top = bld(23753)['base'] + 37.0
    def cov(a, b):
        n = edge_n(a, b); m = v2lerp(a, b, 0.5); p = (m[0] + n[0], m[1] + n[1])
        for r_, t_ in ((lobby, yG + 15.5), (court, yG + 15.5)):
            if point_in(r_, *p): return t_
        return None
    lv0 = classic_block(g, main, own, yG, top, 9.0, 3.55, 3.2, (BUFF, BUFF_D),
                        Win(w=1.25, sill=0.9, head=2.6, depth=0.24, lit=0.45, pair=2, hood=0.12),
                        attic=(3.6, Win(w=1.5, sill=0.6, head=3.0, depth=0.26, arch=1, lit=0.4, keystone=True)),
                        extra_cover=cov)
    # court + lobby blocks behind the wings: flat roofs with the Garden Court's glazed laylight
    yc = yG + 15.5
    for r_ in (lobby, court):
        for a, b in ring_edges(r_):
            n = edge_n(a, b); m = v2lerp(a, b, 0.5); p = (m[0] + n[0], m[1] + n[1])
            if point_in(main, *p) or point_in(lobby if r_ is court else court, *p): continue
            F = Geo.frame(a, b); L = v2len(v2sub(b, a))
            storefront(g, a, b, sidewalk, yG + 5.5, 3.6, 'stone', BUFF_D, glass_slot='shop', arch=1, lit=0.6)
            radial_panel(g, 'stone', F, 0, L, yG + 5.5, yc, None, BUFF)
        g.prism('roof', r_, yc - 0.3, yc, ROOF, top=True, walls=False)
    rc = ring_out(court); cc = centroid(rc)
    lay = ring_offset(rc, -3.0)
    apex_h = 3.2
    for i in range(len(lay)):
        A, B = lay[i], lay[(i + 1) % len(lay)]
        n = edge_n(A, B)
        g.poly('glassc', [(A[0], yc + 0.1, A[1]), (B[0], yc + 0.1, B[1]), (cc[0], yc + apex_h, cc[1])], C('#b7c9cf'), (n[0], 0.7, n[1]))
    # the rooftop neon sign at the Market / New Montgomery corner
    corner = min(ring_out(main), key=lambda p: math.hypot(p[0] - 1529, p[1] + 1514))
    a, b = edge_facing(main, -0.7, -0.7)
    F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    if not g.lod:
        for k in range(5):
            u = L - 3 - k * 3.4
            g.fbox('metal', F, u - 0.06, u + 0.06, top + 1.0, top + 7.5, -2.0, -1.9, C('#2a2a2a'), top=True)
        g.fbox('metal', F, L - 17.5, L - 2.5, top + 7.3, top + 7.5, -2.0, -1.9, C('#2a2a2a'), top=True)
        g.text('neon', F, L - 10, top + 3.0, -1.85, 'PALACE HOTEL', 2.7, (1.0, 0.12, 0.1, 1.0), depth=0.18)
    # New Montgomery entrance marquee
    a, b = edge_facing(main, 0.7, -0.7); F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    g.fbox('metal', F, 5.0, 16.0, lv0 - 3.2, lv0 - 2.5, 0, 3.6, C('#2d2a26'), top=True, bottom=True)
    if not g.lod:
        g.text('gold', F, 10.5, lv0 - 2.48, 3.0, 'THE PALACE', 0.55, GOLD, depth=0.06)
        for k in range(6):
            u = 5.8 + k * 1.9
            g.fbox('lamp', F, u - 0.2, u + 0.2, lv0 - 3.25, lv0 - 3.2, 3.0, 3.4, (1.0, 0.85, 0.6, 1.0), bottom=True)
    cols = wall_colliders(main, yG - 6, top) + wall_colliders(lobby, yG - 6, yc) + wall_colliders(court, yG - 6, yc)
    return {'colliders': cols, 'name': 'Palace Hotel', 'yG': round(yG, 2), 'top': round(top + 8, 1)}


# ------------------------------------------------------------------------------------------ Phelan Building (flatiron, 760 Market)
def phelan(g):
    r = ring_of(23557); own = {23557}
    yG = sidewalk(1255, -1300)
    top = bld(23557)['base'] + 42.0
    classic_block(g, r, own, yG, top, 7.5, 3.3, 2.9, (TERRA, TERRA_D),
                  Win(w=1.2, sill=0.85, head=2.5, depth=0.2, lit=0.4, hood=0.1), attic=(3.4, Win(w=1.2, sill=0.6, head=2.8, depth=0.22, arch=1, lit=0.35)),
                  arch_base=False, cornice_d=1.3)
    return {'colliders': wall_colliders(r, yG - 6, top), 'name': 'Phelan Building', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ Hallidie Building (130 Sutter): the 1918 glass curtain wall
def hallidie(g):
    r = ring_of(17220); own = {17220}
    yG = sidewalk(1410, -1668)
    top = bld(17220)['base'] + 26.0
    BLUE = C('#2c4a8a'); GLD = C('#c9a44a'); BR = C('#a37a5e')
    front = edge_facing(r, 0, 1)
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        if (a, b) != front:
            nt = neighbour_top(a, b, own)
            radial_panel(g, 'brickred', F, 0, L, yG - 4, top, None, BR); continue
        storefront(g, a, b, sidewalk, yG + 4.5, 4.0, 'metal', BLUE, glass_slot='shop', lit=0.9, frame_col=GLD)
        # glass curtain hung 1 m in front of the frame: small panes, blue iron mullions, fire-escape balconies, gold cornices
        y0, y1 = yG + 4.5, top - 3.2
        nfl = int((y1 - y0) / 3.3)
        g.quad_sub('win', Geo.fp(F, 0.3, y0, 1.0), Geo.fp(F, L - 0.3, y0, 1.0), Geo.fp(F, L - 0.3, y1, 1.0), Geo.fp(F, 0.3, y1, 1.0), (0.9, 0.75, 0.5, 1.0), (F[2][0], 0, F[2][1]), maxe=1.2)
        if not g.lod:
            npane = int(L / 0.9)
            for k in range(npane + 1):
                u = 0.3 + (L - 0.6) * k / npane
                g.fbox('paint', F, u - 0.03, u + 0.03, y0, y1, 1.0, 1.06, BLUE, top=False)
            for f in range(nfl * 3 + 1):
                y = y0 + (y1 - y0) * f / (nfl * 3)
                g.fbox('paint', F, 0.3, L - 0.3, y - 0.03, y + 0.03, 1.0, 1.06, BLUE, top=True, bottom=True)
            for f in range(1, nfl + 1):
                y = y0 + (y1 - y0) * f / nfl - 0.05
                g.fbox('paint', F, 0.5, L - 0.5, y - 1.1, y - 1.05, 1.06, 1.9, BLUE, top=True, bottom=True)
                g.fbox('paint', F, 0.5, L - 0.5, y - 0.1, y - 0.05, 1.8, 1.9, BLUE, top=True, bottom=True)
                for k in range(int(L / 1.2) + 1):
                    u = 0.5 + (L - 1.0) * k / int(L / 1.2)
                    g.fbox('paint', F, u - 0.015, u + 0.015, y - 1.05, y - 0.1, 1.85, 1.88, BLUE, top=False)
        for yy, hh in ((y1, 1.6), (y1 + 1.9, 1.3)):
            g.fbox('paint', F, 0, L, yy, yy + hh, 0, 1.3, BLUE, top=True, bottom=True)
            g.fbox('gold', F, 0, L, yy + hh * 0.35, yy + hh * 0.55, 1.3, 1.36, GLD, top=True, bottom=True)
            if not g.lod:
                for k in range(int(L / 1.5)):
                    u = 0.75 + k * 1.5
                    g.fbox('gold', F, u - 0.25, u + 0.25, yy + 0.1, yy + hh - 0.1, 1.3, 1.4, GLD, top=True, bottom=True)
        for s_ in (0, 1):   # side cast-iron pilasters
            u0 = 0.0 if s_ == 0 else L - 0.3
            g.fbox('paint', F, u0, u0 + 0.3, yG - 2, top, 0, 1.3, BLUE, top=True)
    parapet(g, r, top, 0.8, 0.3, BR, slot='brickred', roof_col=ROOF)
    return {'colliders': wall_colliders(r, yG - 6, top), 'name': 'Hallidie Building', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ Mills Building (220 Montgomery)
def mills(g):
    r = ring_of(17596); own = {17596}
    yG = sidewalk(1497, -1820)
    top = bld(17596)['base'] + 47.0
    MB = C('#e0d4bc'); MBD = C('#c9b99b')
    lv0 = classic_block(g, r, own, yG, top, 8.0, 3.6, 2.7, (MB, MBD),
                        Win(w=1.1, sill=0.9, head=2.6, depth=0.25, lit=0.4, pair=2),
                        attic=(4.2, Win(w=1.9, sill=0.7, head=3.6, depth=0.3, arch=1, lit=0.35)), cornice_d=1.2)
    # the great Romanesque entrance arch on Montgomery
    a, b = edge_facing(r, -1, 0); F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    uc = L / 2
    hole = opening_poly(uc, 6.0, yG + 0.1, yG + 11.0, 1, 16 if not g.lod else 6)
    g.fbox('granite', F, uc - 4.4, uc + 4.4, yG - 2, yG + 12.5, 0, 0.6, C('#efe9dc'), top=True)
    radial_panel(g, 'granite', (F[0], F[1], F[2]), uc - 4.4, uc + 4.4, yG - 2, yG + 12.5, hole, C('#efe9dc'), w=0.61)
    recess(g, (F[0], F[1], F[2]), hole, 1.2, 'granite', C('#d9d0bf'), 'shop', (1.0, 0.85, 0.62, 1.0)) if not g.lod else None
    return {'colliders': wall_colliders(r, yG - 6, top), 'name': 'Mills Building', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ strip towers: 101 California, 555 California
def strip_tower(g, ring, own, y0, y1, fh, fin_col, glass_lit, fin_slot='granite', fin_w=0.5, fin_d=0.35, glass_frac=0.6, base_top=None):
    for a, b in ring_edges(ring):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        if L < 0.3: continue
        nt = neighbour_top(a, b, own)
        ys = max(y0, nt or -1e9) if nt else y0
        if L < 5.0:
            W = Win(w=max(0.3, L * glass_frac), sill=0.25, head=fh - 0.25, depth=0.12, lit=glass_lit, mull=False, sill_out=0)
            tfacade(g, a, b, ys, y1, fh, L, W, fin_slot, fin_col, margin=0.0, bays=1, flat_h=22)
        else:
            W = Win(w=1.6 * glass_frac * 1.6, sill=0.25, head=fh - 0.25, depth=0.12, lit=glass_lit, mull=False, sill_out=0)
            tfacade(g, a, b, ys, y1, fh, 2.6, W, fin_slot, fin_col, margin=0.3, pier=(fin_w, fin_d, fin_col), flat_h=22)


def ca101(g):
    r = ring_of(17611); lob = ring_of(17610); own = {17611, 17610}
    yG = sidewalk(1880, -1985)
    top = bld(17611)['base'] + 183.0
    GRN = C('#b9ada3')
    rr = ring_simplify(r, 0.12)
    # sawtooth cylinder: alternating glass / granite strips on the faceted edges
    strip_tower(g, rr, own, yG + 6.0, top - 4.0, 3.9, GRN, 0.45, glass_frac=0.55)
    for a, b in ring_edges(rr):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        radial_panel(g, 'granite', F, 0, L, yG - 3, yG + 6.0, None, shade(GRN, 0.9))
        radial_panel(g, 'granite', F, 0, L, top - 4.0, top, None, GRN)
    parapet(g, rr, top, 1.0, 0.4, GRN, slot='granite', roof_col=ROOF)
    # the stepped glass lobby wedge
    lh = bld(17610)['base'] + 14.0
    rl = ring_simplify(lob, 0.3)
    for a, b in ring_edges(rl):
        n = edge_n(a, b); m = v2lerp(a, b, 0.5)
        if point_in(r, m[0] + n[0], m[1] + n[1]): continue
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        g.quad_sub('glassc', Geo.fp(F, 0, yG - 1, 0), Geo.fp(F, L, yG - 1, 0), Geo.fp(F, L, lh, 0), Geo.fp(F, 0, lh, 0), C('#aebfc6'), (n[0], 0, n[1]), maxe=30)
        if not g.lod:
            for k in range(int(L / 1.5) + 1):
                u = L * k / max(1, int(L / 1.5))
                g.fbox('metal', F, u - 0.05, u + 0.05, yG - 1, lh, 0, 0.12, C('#d8d8d8'), top=False)
    g.prism('glassc', rl, lh, lh + 0.1, C('#aebfc6'), top=True, walls=False)
    g.prism('win', ring_offset(ring_out(rl), -1.0), yG - 0.5, lh - 0.3, (0.9, 0.8, 0.6, 1.0), top=True, sub=False)
    return {'colliders': wall_colliders(rr, yG - 6, top) + wall_colliders(rl, yG - 6, lh), 'name': '101 California', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


CA555 = [17486, 17495, 17493, 17494, 17492, 17491]


def ca555(g):
    own = set(CA555) | {17490}
    yG = sidewalk(1400, -1880)
    CARN = C('#4c2f2b'); CARN_D = C('#3a2421')
    for i in CA555:
        r = ring_simplify(ring_of(i), 0.1)
        top = bld(i)['base'] + bld(i)['h']
        strip_tower(g, r, own - {i}, yG + 7.0, top - 3.0, 3.8, CARN, 0.35, fin_d=0.25, glass_frac=0.45)
        for a, b in ring_edges(r):
            F = Geo.frame(a, b); L = v2len(v2sub(b, a))
            nt = neighbour_top(a, b, own - {i})
            if nt and nt > top - 3: continue
            radial_panel(g, 'granite', F, 0, L, top - 3.0, top, None, CARN)
            if not nt or nt < yG + 7:
                storefront(g, a, b, sidewalk, yG + 7.0, 3.0, 'granite', CARN_D, glass_slot='shop', lit=0.8, frame_col=C('#1d1a18'))
        g.prism('roof', r, top - 0.2, top, ROOF, top=True, walls=False)
    # Banker's Heart: polished black granite sculpture on the plaza
    hx, hz = 1395.0, -1872.0; hy = H(hx, hz)
    prof = [(0.0, hy), (1.6, hy + 0.2), (2.1, hy + 0.9), (1.9, hy + 1.8), (1.2, hy + 2.4), (0.0, hy + 2.6)]
    g.lathe('granite', hx, hz, prof, C('#151515'), n=24 if not g.lod else 8)
    cols = []
    for i in CA555:
        cols += wall_colliders(ring_simplify(ring_of(i), 0.1), yG - 6, bld(i)['base'] + bld(i)['h'])
    cols.append({'x': hx, 'z': hz, 'hx': 2.0, 'hz': 2.0, 'yaw': 0, 'yMin': hy - 1, 'yMax': hy + 2.6})
    return {'colliders': cols, 'name': '555 California', 'yG': round(yG, 2), 'top': 250}


# ================================================================================== shared helpers (wave 2b / wave 3)
def hull(pts):
    """convex hull (x, z), monotone chain"""
    P = sorted(set((round(p[0], 3), round(p[1], 3)) for p in pts))
    if len(P) < 3: return P
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(hi) >= 2 and cr(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


class Loc:
    """local plan frame: origin c (x, z), a along u, b along v = (-u.z, u.x)"""
    def __init__(s, c, u):
        s.c = tuple(c); s.u = v2norm(u); s.v = (-s.u[1], s.u[0])

    def xz(s, a, b): return (s.c[0] + s.u[0] * a + s.v[0] * b, s.c[1] + s.u[1] * a + s.v[1] * b)
    def P(s, a, b, y): x, z = s.xz(a, b); return (x, y, z)
    def d(s, a, b): return (s.u[0] * a + s.v[0] * b, 0.0, s.u[1] * a + s.v[1] * b)
    def ring(s, pts): return [s.xz(a, b) for a, b in pts]
    def loc(s, x, z): dx, dz = x - s.c[0], z - s.c[1]; return (dx * s.u[0] + dz * s.u[1], dx * s.v[0] + dz * s.v[1])
    def yaw(s): return math.atan2(-s.u[1], s.u[0])
    def F(s, a, b, rot=0):
        """wall frame at local (a, b) whose t = local direction rot (0: +a, 1: +b, 2: -a, 3: -b)"""
        t = [s.u, s.v, (-s.u[0], -s.u[1]), (-s.v[0], -s.v[1])][rot % 4]
        return (s.xz(a, b), t, (-t[1], t[0]))

    def box(s, g, slot, a0, a1, b0, b1, y0, y1, col, **kw):
        kw.setdefault('back', True)
        g.fbox(slot, (s.xz(a0, b0), s.u, s.v), 0, a1 - a0, y0, y1, 0, b1 - b0, col, **kw)

    def col(s, a0, a1, b0, b1, y0, y1):
        x, z = s.xz((a0 + a1) / 2, (b0 + b1) / 2)
        return {'x': round(x, 2), 'z': round(z, 2), 'hx': round(abs(a1 - a0) / 2, 2), 'hz': round(abs(b1 - b0) / 2, 2), 'yaw': round(s.yaw(), 4),
                'yMin': round(y0, 2), 'yMax': round(y1, 2)}


def deck_seg(A, B, ya, yb, width):
    return {'pts': [[round(A[0], 2), round(A[1], 2), round(ya, 3)], [round(B[0], 2), round(B[1], 2), round(yb, 3)]], 'width': round(width, 2)}


def rect_decks(L, a0, a1, b0, b1, y, strip=8.0):
    """walkable rectangle as parallel capsule decks (ends pulled in so they don't overhang)"""
    out = []
    n = max(1, int(math.ceil((b1 - b0) / strip))); w = (b1 - b0) / n
    for i in range(n):
        b = b0 + (i + 0.5) * w
        e = min(w / 2, (a1 - a0) / 2 - 0.1)
        out.append(deck_seg(L.xz(a0 + e, b), L.xz(a1 - e, b), y, y, w))
    return out


def ext_stairs(g, A, B, y0, y1, width, col, slot='granite', rail=C('#3a3a3a'), cheeks=True):
    """straight exterior stair from A (x, z) at y0 to B at y1 (world), treads + risers + cheek walls; returns the ramp deck"""
    L = v2len(v2sub(B, A)); t = v2norm(v2sub(B, A)); n = (-t[1], t[0])
    ns = max(2, int(abs(y1 - y0) / 0.165))
    P = lambda s, w, y: (A[0] + t[0] * s + n[0] * w, y, A[1] + t[1] * s + n[1] * w)
    hw = width / 2
    for k in range(ns):
        s0, s1 = L * k / ns, L * (k + 1) / ns
        y = y0 + (y1 - y0) * (k + 1) / ns; yp = y0 + (y1 - y0) * k / ns
        g.poly(slot, [P(s0, -hw, y), P(s1, -hw, y), P(s1, hw, y), P(s0, hw, y)], col, (0, 1, 0))
        g.poly(slot, [P(s0, -hw, yp), P(s0, hw, yp), P(s0, hw, y), P(s0, -hw, y)], shade(col, 0.9), (-t[0], 0, -t[1]))
    if cheeks:
        for sg in (-1, 1):
            w0, w1 = hw * sg, (hw + 0.35) * sg
            g.poly(slot, [P(0, w1, min(y0, y1) - 3), P(L, w1, min(y0, y1) - 3), P(L, w1, y1 + 0.9), P(0, w1, y0 + 0.9)], shade(col, 0.85), (n[0] * sg, 0, n[1] * sg))
            g.poly(slot, [P(0, w0, y0 + 0.9), P(L, w0, y1 + 0.9), P(L, w1, y1 + 0.9), P(0, w1, y0 + 0.9)], col, (0, 1, 0))
            g.poly(slot, [P(0, w0, min(y0, y1) - 1), P(L, w0, min(y0, y1) - 1), P(L, w0, y1 + 0.9), P(0, w0, y0 + 0.9)], shade(col, 0.8), (-n[0] * sg, 0, -n[1] * sg))
    if rail and not g.lod:
        for sg in (-1, 1):
            g.rod('metal', P(0, (hw - 0.15) * sg, y0 + 0.95), P(L, (hw - 0.15) * sg, y1 + 0.95), 0.03, rail, n=5)
    return deck_seg(A, B, y0, y1, width)


def broadleaf(g, x, z, y, h=7.0, R=2.6, seed=1, col=None, n=None):
    """trunk + a lumpy canopy of overlapping leaf blobs (park trees on hero plazas / roofs)"""
    import random
    Rr = random.Random(seed)
    tx, tz = x + Rr.uniform(-0.3, 0.3), z + Rr.uniform(-0.3, 0.3)
    g.rod('bark', (x, y - 0.2, z), (tx, y + h * 0.66, tz), 0.1 + h * 0.012, C('#5e4c3a'), n=6 if not g.lod else 4)
    base = col or C('#4a7a32')
    nb = 7 if not g.lod else 3
    for k in range(nb):
        a = Rr.random() * 2 * math.pi; d = R * 0.5 * Rr.random() if k else 0.0
        cx, cz = tx + math.cos(a) * d, tz + math.sin(a) * d
        r = R * Rr.uniform(0.5, 0.72) if k else R * 0.75
        cy = y + h * 0.7 + (Rr.uniform(-0.25, 0.45) * R if k else 0.0)
        prof = [(0.0, cy - r * 0.75), (r * 0.72, cy - r * 0.55), (r, cy - r * 0.05), (r * 0.8, cy + r * 0.5), (r * 0.35, cy + r * 0.8), (0.0, cy + r * 0.86)]
        g.lathe('leaf', cx, cz, prof, shade(base, 0.8 + Rr.random() * 0.45), n=10 if not g.lod else 6, a0=Rr.random())
    return {'x': round(x, 2), 'z': round(z, 2), 'hx': 0.3, 'hz': 0.3, 'yaw': 0, 'yMin': round(y - 1, 2), 'yMax': round(y + h * 0.6, 2)}


def conifer(g, x, z, y, h=28.0, R=3.4, seed=1, col=C('#2f4d2a')):
    """redwood / cypress: tapering trunk + stacked drooping leaf cones"""
    import random
    Rr = random.Random(seed)
    g.cyl('bark', x, z, 0.55 + h * 0.01, y - 0.3, y + h * 0.95, C('#6b4232'), n=8 if not g.lod else 5, r1=0.12)
    tiers = 13 if not g.lod else 5
    nseg = 10 if not g.lod else 6
    for k in range(tiers):
        t = k / tiers
        yy = y + h * (0.3 + 0.68 * t); rr = R * (1.0 - 0.8 * t) * Rr.uniform(0.8, 1.15)
        g.lathe('leaf', x, z, [(rr, yy - 0.9 - rr * 0.35), (rr * 0.6, yy - 0.5), (0.0, yy + 0.9)], shade(col, 0.8 + Rr.random() * 0.4), n=nseg, a0=Rr.random())
    return {'x': round(x, 2), 'z': round(z, 2), 'hx': 0.6, 'hz': 0.6, 'yaw': 0, 'yMin': round(y - 1, 2), 'yMax': round(y + h, 2)}


def outline(g, ring, y0, y1, col=(1.0, 0.93, 0.78, 1.0), r=0.09, top=True):
    """Embarcadero-style bulb outline: vertical strings on every corner + the roof edge"""
    rr = ring_out(ring)
    for i, p in enumerate(rr):
        g.rod('lamp', (p[0], y0, p[1]), (p[0], y1, p[1]), r, col, n=4)
    if top:
        for i in range(len(rr)):
            a, b = rr[i], rr[(i + 1) % len(rr)]
            g.rod('lamp', (a[0], y1, a[1]), (b[0], y1, b[1]), r, col, n=4)


def ring_scale(r, c, s):
    return [(c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s) for p in r]


# ------------------------------------------------------------------------------------------ Hobart Building (582 Market, Willis Polk 1914)
def hobart(g):
    r = ring_of(17508); own = {17508}
    mk = edge_facing(r, 0.7, 0.7)          # the Market St frontage (faces down 2nd St)
    a, b = mk; F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    yG = sidewalk(*v2lerp(a, b, 0.5))
    WH = C('#e6dfcf'); WHD = C('#cdbfa4'); GRN = C('#5d7a68'); GRB = C('#b9ad96')
    yb = yG + 30.0                         # 7-storey base block (neighbours are ~25 m)
    yt = yG + 74.0                         # tower shaft top
    top = yG + 86.0
    classic_block(g, r, own, yG, yb, 8.2, 3.45, 2.9, (WH, WHD),
                  Win(w=1.2, sill=0.9, head=2.5, depth=0.22, lit=0.45, hood=0.1), attic=None, arch_base=True, cornice_d=1.1)
    # tower: stadium plan on the Market frontage (rounded ends), 16 m deep
    D, R = 16.0, 5.0
    pts = [(0.0, -D)]
    for i in range(7): t = math.pi + (math.pi / 2) * i / 6; pts.append((R + math.cos(t) * R, -R - math.sin(t) * R))
    for i in range(7): t = math.pi / 2 - (math.pi / 2) * i / 6; pts.append((L - R + math.cos(t) * R, -R + math.sin(t) * R))
    pts.append((L, -D))
    tw = [fpt(F, u, w) for u, w in pts]
    wT = Win(w=1.15, sill=0.85, head=2.55, depth=0.22, lit=0.5, pair=1, hood=0.08)
    for ea, eb in ring_edges(tw):
        Le = v2len(v2sub(eb, ea))
        facade(g, ea, eb, yb + 0.6, yt - 0.3, 3.45, 2.2 if Le > 3 else max(0.9, Le), wT, 'stone', WH, margin=0.25 if Le < 3 else 0.8)
        Fe = Geo.frame(ea, eb)
        g.fbox('stone', Fe, 0, Le, yb, yb + 0.6, 0, 0.12, WHD, top=True, bottom=True, sides=False)
    cornice(g, tw, yt + 0.9, 1.2, WH, height=1.5)
    # attic: arched windows + bands, then the green mansard cap with oculi and a lantern
    for ea, eb in ring_edges(tw):
        Le = v2len(v2sub(eb, ea))
        facade(g, ea, eb, yt + 0.9, yt + 5.4, 4.5, 2.4 if Le > 3 else max(0.9, Le), Win(w=1.2, sill=0.6, head=3.6, depth=0.25, arch=1, lit=0.35, keystone=True),
               'stone', WH, margin=0.3 if Le < 3 else 0.8)
    cornice(g, tw, yt + 6.2, 0.9, WHD, height=0.8)
    c = centroid(tw)
    rin = ring_scale(ring_out(tw), c, 0.82)
    prof = [(0.0, yt + 6.2), (-0.3, yt + 6.5), (-1.6, top - 3.0), (-2.6, top - 1.2), (-3.2, top - 1.0)]
    g.sweep('paint', tw, prof, GRN)
    g.poly('paint', [(p[0], top - 1.0, p[1]) for p in ring_offset(ring_out(tw), -3.2)], GRN, (0, 1, 0))
    if not g.lod:
        for ea, eb in ring_edges(tw):
            Le = v2len(v2sub(eb, ea))
            if Le < 3: continue
            Fe = Geo.frame(ea, eb)
            for k in range(max(1, int(Le / 4.5))):
                u = Le * (k + 0.5) / max(1, int(Le / 4.5))
                g.fbox('stone', Fe, u - 0.7, u + 0.7, yt + 7.6, yt + 9.4, -1.4, -0.9, WH, top=True)
                g.fbox('win', Fe, u - 0.45, u + 0.45, yt + 7.9, yt + 9.0, -0.88, -0.86, glass_col(0.5), top=False, sides=False)
    g.lathe('metal', c[0], c[1], [(2.6, top - 1.0), (2.6, top + 1.6), (2.9, top + 1.8), (1.6, top + 3.6), (0.2, top + 5.0), (0.0, top + 6.8)], GRN, n=16 if not g.lod else 8)
    g.lathe('gold', c[0], c[1], [(0.0, top + 6.6), (0.18, top + 7.0), (0.0, top + 7.8)], C('#c9a24a'), n=8)
    cols = wall_colliders(r, yG - 6, yb) + wall_colliders(tw, yb, top)
    return {'colliders': cols, 'name': 'Hobart Building', 'yG': round(yG, 2), 'top': round(top + 8, 1)}


# ------------------------------------------------------------------------------------------ Embarcadero Center (4 slab towers, podiums, sky bridges)
EC_T = {'ec1': [13813, 13814, 13815, 13816, 13817], 'ec2': [13810, 13811, 13812], 'ec3': [13807, 13808, 13809], 'ec4': [13796, 13797, 13798, 13799, 13800]}
EC_POD = [13672, 13673, 13674, 13675]
EC_HIDE = sum(EC_T.values(), []) + EC_POD
EC_U = (0.98877, -0.14944)


def emb_center(g):
    ECW = C('#e1dbcf'); ECD = C('#c9c1b2'); GL = C('#2d3033')
    L = Loc((1890.0, -2220.0), EC_U)
    decks = []; cols = []
    pods = []
    ypod = None
    for tid, ids in EC_T.items():
        pts = [p for i in ids for p in ring_of(i)]
        loc = [L.loc(*p) for p in pts]
        a0, a1 = min(p[0] for p in loc), max(p[0] for p in loc); b0, b1 = min(p[1] for p in loc), max(p[1] for p in loc)
        yG = min(sidewalk(*L.xz(a, b)) for a in (a0, a1) for b in (b0, b1))
        yP = yG + 13.0
        inner = -1 if tid == 'ec1' else 1                         # EC1 sits on Sacramento, EC2-4 on Clay: podium grows into the block
        pod = (a0 - 2.0, a1 + 2.0, b0 - (6.0 if inner < 0 else 0.3), b1 + (6.0 if inner > 0 else 0.3), yG, yP)
        pods.append((tid, pod))
        k = 173.0 / 145.2 if tid == 'ec4' else 1.0
        own = set(ids)
        for i in ids:
            rr = ring_simplify(ring_of(i), 0.12)
            top = yG + bld(i)['h'] * k
            for ea, eb in ring_edges(rr):
                Le = v2len(v2sub(eb, ea))
                if Le < 0.3: continue
                j = next((jj for jj in ids if jj != i and any(point_in(ring_of(jj), *v2add(v2lerp(ea, eb, s_), v2mul(edge_n(ea, eb), 1.5))) for s_ in (0.3, 0.5, 0.7))), None)
                nt = yG + bld(j)['h'] * k if j is not None else None
                ys = max(yP, nt) if nt else yP
                if ys >= top - 1: continue
                if Le < 4.5:
                    W = Win(w=max(0.4, Le * 0.5), sill=0.35, head=3.3, depth=0.3, lit=0.45, mull=False, sill_out=0)
                    tfacade(g, ea, eb, ys, top - 2.5, 3.72, Le, W, 'concrete', ECW, margin=0.0, bays=1, flat_h=14)
                else:
                    W = Win(w=0.95, sill=0.35, head=3.3, depth=0.32, lit=0.45, mull=False, sill_out=0)
                    tfacade(g, ea, eb, ys, top - 2.5, 3.72, 1.6, W, 'concrete', ECW, margin=0.4, pier=(0.42, 0.4, ECW), flat_h=14)
                radial_panel(g, 'concrete', Geo.frame(ea, eb), 0, Le, top - 2.5, top, None, ECW)
            g.prism('roof', rr, top - 0.2, top, ROOF, top=True, walls=False)
            if not g.lod:
                outline(g, rr, yP, top)
            cols += wall_colliders(rr, yP - 1, top)
        # podium: three shopping levels (storefronts, two recessed balcony bands), walkable roof terrace
        ring = L.ring([(pod[0], pod[2]), (pod[1], pod[2]), (pod[1], pod[3]), (pod[0], pod[3])])
        for ea, eb in ring_edges(ring):
            Fe = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            storefront(g, ea, eb, sidewalk, yG + 4.8, 4.2, 'concrete', ECD, glass_slot='shop', lit=0.85, frame_col=C('#262626'), pier=(0.8, 0.25, ECW))
            for lv in (0, 1):
                y0 = yG + 4.8 + lv * 4.1
                g.fbox('concrete', Fe, 0, Le, y0, y0 + 1.1, 0, 0.6, ECW, top=True, bottom=True)
                g.quad_sub('shop', Geo.fp(Fe, 0.3, y0 + 1.1, -1.2), Geo.fp(Fe, Le - 0.3, y0 + 1.1, -1.2), Geo.fp(Fe, Le - 0.3, y0 + 4.1, -1.2), Geo.fp(Fe, 0.3, y0 + 4.1, -1.2),
                           (1.0, 0.86, 0.66, 1.0) if lv == 0 else (0.85, 0.8, 0.7, 1.0), (Fe[2][0], 0, Fe[2][1]), maxe=12)
                g.poly('concrete', [Geo.fp(Fe, 0, y0 + 4.1, 0.6), Geo.fp(Fe, Le, y0 + 4.1, 0.6), Geo.fp(Fe, Le, y0 + 4.1, -1.2), Geo.fp(Fe, 0, y0 + 4.1, -1.2)], ECD, (0, -1, 0))
                if not g.lod:
                    for kk in range(int(Le / 6.0) + 1):
                        u = min(Le - 0.3, 0.3 + kk * 6.0)
                        g.fbox('concrete', Fe, u - 0.3, u + 0.3, y0 + 1.1, y0 + 4.1, -1.2, 0.0, ECW, top=False)
            g.fbox('concrete', Fe, 0, Le, yP - 0.9, yP + 1.1, 0, 0.6, ECW, top=True, bottom=True)
            if not g.lod: g.rod('metal', Geo.fp(Fe, 0, yP + 1.15, 0.3), Geo.fp(Fe, Le, yP + 1.15, 0.3), 0.04, C('#3a3a3a'), n=5)
        g.prism('paving', ring, yP - 0.3, yP, C('#b9b2a6'), top=True, walls=False)
        if not g.lod:   # roof terrace planters + trees
            import random
            Rr = random.Random(len(ids) * 31)
            for kk in range(5):
                a = pod[0] + 4 + Rr.random() * (pod[1] - pod[0] - 8); b = pod[3] - 3.2 if kk % 2 else pod[2] + 3.2
                x, z = L.xz(a, b)
                g.cyl('concrete', x, z, 1.3, yP, yP + 0.7, ECD, n=12)
                broadleaf(g, x, z, yP + 0.6, h=5.0, R=2.0, seed=kk + len(ids) * 7)
        cols += wall_colliders(ring, yG - 6, yP + 1.1)
        decks += rect_decks(L, pod[0] + 0.5, pod[1] - 0.5, pod[2] + 0.5, pod[3] - 0.5, yP)
        # stair from the plaza up to the terrace, along the plaza-side face, at whichever end is clear of the pavilions
        bs = (pod[3] + 2.0) if inner > 0 else (pod[2] - 2.0)
        for (sa, sb) in ((pod[0] + 2.0, pod[0] + 29.0), (pod[1] - 2.0, pod[1] - 29.0)):
            probe = [L.xz(sa + (sb - sa) * q / 8, bs + dd) for q in range(9) for dd in (-2.0, 0.0, 2.0)]
            if not any(point_in(bb['ring'], *p_) for p_ in probe for bb in buildings_near(p_[0], p_[1], 60) if bb['i'] not in EC_HIDE):
                A = L.xz(sb, bs); B = L.xz(sa, bs)
                decks.append(ext_stairs(g, A, B, sidewalk(*A), yP, 3.0, C('#bdb6aa'), slot='concrete'))
                break
        ypod = yP
    # podium pavilions (EC shops on the plazas)
    for i in EC_POD:
        rr = ring_of(i); yG = min(sidewalk(*p) for p in ring_out(rr)); t = yG + 9.0
        for ea, eb in ring_edges(rr):
            storefront(g, ea, eb, sidewalk, yG + 4.6, 4.0, 'concrete', ECD, glass_slot='shop', lit=0.85, frame_col=C('#262626'))
            facade(g, ea, eb, yG + 4.6, t, 4.4, 3.2, Win(w=2.6, sill=0.8, head=3.6, depth=0.5, lit=0.6, mull=False), 'concrete', ECW, margin=0.8)
        parapet(g, rr, t, 1.0, 0.3, ECW, slot='concrete', roof_col=ROOF)
        cols += wall_colliders(rr, yG - 6, t + 1)
    # sky bridges over Front, Davis and Drumm (terrace to terrace)
    for (t0, p0), (t1, p1) in zip(pods[:-1], pods[1:]):
        bm = (max(p0[2], p1[2]) + min(p0[3], p1[3])) / 2
        A = L.xz(p0[1] - 1.0, min(max(bm, p0[2] + 3.0), p0[3] - 3.0)); B = L.xz(p1[0] + 1.0, min(max(bm, p1[2] + 3.0), p1[3] - 3.0))
        y = max(p0[5], p1[5])
        Fb = Geo.frame(A, B); Lb = v2len(v2sub(B, A))
        g.fbox('concrete', Fb, 0, Lb, y - 1.4, y, -2.6, 2.6, ECW, top=True, bottom=True, back=True)
        for sg in (-1, 1):
            w0, w1 = (2.3, 2.6) if sg > 0 else (-2.6, -2.3)
            g.fbox('concrete', Fb, 0, Lb, y, y + 1.1, w0, w1, ECW, top=True, back=True)
            if not g.lod: g.rod('metal', Geo.fp(Fb, 0, y + 1.15, w0 + 0.15 * sg), Geo.fp(Fb, Lb, y + 1.15, w0 + 0.15 * sg), 0.04, C('#3a3a3a'), n=5)
        if not g.lod:
            for k in range(int(Lb / 3)):
                u = 1.5 + k * 3
                g.fbox('lamp', Fb, u - 0.2, u + 0.2, y - 1.45, y - 1.4, -0.3, 0.3, (1.0, 0.9, 0.75, 1.0), bottom=True)
        decks.append(deck_seg(A, B, y, y, 4.6))
        for sg in (-1, 1):
            m = v2add(v2lerp(A, B, 0.5), v2mul(Fb[2], 2.45 * sg))
            cols.append({'x': round(m[0], 2), 'z': round(m[1], 2), 'hx': round(Lb / 2, 2), 'hz': 0.15, 'yaw': round(math.atan2(-Fb[1][1], Fb[1][0]), 4), 'yMin': round(y, 2), 'yMax': round(y + 1.1, 2)})
    return {'colliders': cols, 'decks': decks, 'name': 'Embarcadero Center', 'replaces': 'embarcaderoCenter', 'top': 200}


# ------------------------------------------------------------------------------------------ Powell & Market cable-car turntable
def turntable(g):
    E = (1016.0, -1176.5); d = v2norm((16.6, 103.7))            # Powell St runs south from Ellis to Market
    ctr = v2add(E, v2mul(d, 99.0))
    L = Loc(ctr, (d[1], -d[0]))                                  # a across Powell (east), b = south
    y = H(*ctr) + 0.03
    WOOD = C('#7a5a3c'); IRON = C('#2c2c2c'); BRK = C('#8e4b3a'); GRN_ = C('#8f8a82')
    Rt = 4.7
    n = 48 if not g.lod else 16
    cols = []
    # brick plaza + granite ring around the turntable pit
    g.lathe('paving', ctr[0], ctr[1], [(10.5, y - 0.02), (Rt + 0.6, y - 0.02)], C('#a4574a'), n=n)
    g.lathe('granite', ctr[0], ctr[1], [(Rt + 0.6, y - 0.02), (Rt + 0.6, y + 0.03), (Rt, y + 0.03), (Rt, y - 0.3)], C('#9d9890'), n=n)
    # wooden disc: radial planks + an iron rim + two rails across
    NP = 36 if not g.lod else 12
    for k in range(NP):
        a0, a1 = 2 * math.pi * k / NP, 2 * math.pi * (k + 1) / NP
        col = shade(WOOD, 0.85 + 0.3 * ((k * 7919) % 11) / 11)
        g.poly('wood', [(ctr[0], y + 0.01, ctr[1]), (ctr[0] + math.cos(a0) * (Rt - 0.05), y + 0.01, ctr[1] + math.sin(a0) * (Rt - 0.05)),
                        (ctr[0] + math.cos(a1) * (Rt - 0.05), y + 0.01, ctr[1] + math.sin(a1) * (Rt - 0.05))], col, (0, 1, 0))
    g.lathe('metal', ctr[0], ctr[1], [(Rt - 0.05, y + 0.0), (Rt - 0.05, y + 0.05), (Rt - 0.3, y + 0.05)], IRON, n=n)
    for s in (-0.534, 0.534):
        L.box(g, 'metal', s - 0.05, s + 0.05, -Rt + 0.2, Rt - 0.2, y, y + 0.06, IRON, top=True)
    # single track north up Powell to Ellis (rails + a brick trackway), grooved slot between
    Lr = 96.0
    for s in (-0.534, 0.534):
        for k in range(int(Lr / 4)):
            b0, b1 = -Rt - 0.6 - k * 4.0, -Rt - 0.6 - (k + 1) * 4.0
            p0, p1 = L.xz(s, b0), L.xz(s, b1)
            g.rod('metal', (p0[0], H(*p0) + 0.03, p0[1]), (p1[0], H(*p1) + 0.03, p1[1]), 0.045, IRON, n=4)
    for k in range(int(Lr / 4)):
        b0, b1 = -Rt - 0.6 - k * 4.0, -Rt - 0.6 - (k + 1) * 4.0
        q = [L.xz(-1.4, b0), L.xz(1.4, b0), L.xz(1.4, b1), L.xz(-1.4, b1)]
        g.poly('paving', [(p[0], H(*p) + 0.015, p[1]) for p in q], BRK, (0, 1, 0))
    # pave the pedestrian block of Powell between the turntable and Ellis (the surface raster calls it lawn)
    st = 3.0 if not g.lod else 9.0
    nb_ = [bb['ring'] for bb in buildings_near(ctr[0], ctr[1] - 40, 140)]
    for i in range(int(66 / st)):
        for j in range(int(118 / st)):
            a0_, a1_ = -33 + i * st, -33 + (i + 1) * st; b0_, b1_ = 12 - j * st, 12 - (j + 1) * st
            if math.hypot((a0_ + a1_) / 2, (b0_ + b1_) / 2) < 10.3: continue
            m_ = L.xz((a0_ + a1_) / 2, (b0_ + b1_) / 2)
            if any(point_in(r_, *m_) for r_ in nb_): continue
            q = [L.xz(a0_, b0_), L.xz(a1_, b0_), L.xz(a1_, b1_), L.xz(a0_, b1_)]
            g.poly('paving', [(p[0], H(*p) + 0.07, p[1]) for p in q], C('#b3aea5') if (i + j) % 7 else C('#a9a49b'), (0, 1, 0))
    # operator's booth + queue rails on the west side, bollards around the plaza
    bx = -8.2; bz = -4.0
    L.box(g, 'paint', bx - 1.1, bx + 1.1, bz - 1.4, bz + 1.4, y, y + 2.5, C('#2e4b3e'))
    L.box(g, 'shop', bx - 1.12, bx + 1.12, bz - 1.2, bz + 1.2, y + 1.0, y + 2.1, (1.0, 0.86, 0.62, 1.0), top=False)
    L.box(g, 'metal', bx - 1.35, bx + 1.35, bz - 1.65, bz + 1.65, y + 2.5, y + 2.75, IRON)
    cols.append(L.col(bx - 1.2, bx + 1.2, bz - 1.5, bz + 1.5, y, y + 2.7))
    if not g.lod:
        F = L.F(bx + 1.12, bz, 3)
        g.text('gold', F, 0, y + 2.52, 0.02, 'CABLE CAR', 0.3, C('#e7d9a8'), depth=0.03)
        for k in range(10):
            b = -8 - k * 3.0
            for s in (-7.2, -8.4):
                p = L.xz(s, b); hy = H(*p)
                g.cyl('metal', p[0], p[1], 0.04, hy, hy + 1.0, IRON, n=5)
            p0, p1 = L.xz(-7.2, b), L.xz(-7.2, b - 3.0)
            g.rod('metal', (p0[0], H(*p0) + 0.95, p0[1]), (p1[0], H(*p1) + 0.95, p1[1]), 0.03, IRON, n=4)
            p0, p1 = L.xz(-8.4, b), L.xz(-8.4, b - 3.0)
            g.rod('metal', (p0[0], H(*p0) + 0.95, p0[1]), (p1[0], H(*p1) + 0.95, p1[1]), 0.03, IRON, n=4)
        for k in range(14):
            t = 2 * math.pi * (k + 0.5) / 14
            if abs(math.sin(t)) > 0.8 and math.sin(t) < 0: continue           # gap for the track (north) and Market (south)
            if math.sin(t) > 0.8: continue
            p = (ctr[0] + math.cos(t) * 10.0, ctr[1] + math.sin(t) * 10.0); hy = H(*p)
            g.lathe('metal', p[0], p[1], [(0.14, hy), (0.12, hy + 0.9), (0.0, hy + 1.0)], IRON, n=8)
        # the historic sign post
        p = L.xz(8.0, -5.0); hy = H(*p)
        g.cyl('metal', p[0], p[1], 0.07, hy, hy + 3.6, IRON, n=8)
        Fs = L.F(8.0 - 1.0, -5.0, 0)
        g.fbox('paint', Fs, 0.0, 2.0, hy + 2.7, hy + 3.4, -0.05, 0.05, C('#1f3b2e'), top=True, bottom=True, back=True)
        g.text('gold', Fs, 1.0, hy + 2.85, 0.06, 'POWELL & MARKET', 0.22, C('#e8dcb0'), depth=0.02)
    noT = [list(p) for p in L.ring([(-33, -106), (33, -106), (33, 12), (-33, 12)])]
    return {'colliders': cols, 'name': 'Powell & Market Turntable', 'yG': round(y, 2), 'top': 6, 'noTrees': [noT]}


# ------------------------------------------------------------------------------------------ Transamerica Pyramid (600 Montgomery, 260 m)
TA_HIDE = [13643, 13634, 13639, 13640, 13641, 13642, 13619]


def ta_frame():
    w = ring_of(13634)
    e = max(ring_edges(w), key=lambda e: v2len(v2sub(e[1], e[0])))
    u = v2norm(v2sub(e[1], e[0]))
    if u[0] < 0: u = (-u[0], -u[1])
    return Loc(centroid(ring_out(ring_of(13643))), u)


TA = dict(HW0=26.5, HWT=6.9, HT=212.0, HA=260.0, YA=15.0, HWL=19.5)


def transamerica(g):
    L = ta_frame()
    WH = C('#e9e7e1'); WHD = C('#cfccc4'); AL = C('#d6d9da')
    yG = min(sidewalk(*L.xz(a, b)) for a in (-27, 0, 27) for b in (-27, 0, 27))
    HW0, HWT, HT, HA, YA, HWL = TA['HW0'], TA['HWT'], TA['HT'], TA['HA'], TA['YA'], TA['HWL']
    kk = (HWT - HW0) / HT
    hw = lambda y: HW0 + kk * (y - yG)
    yT = yG + HT
    SIDES = [((1, 0), (0, 1)), ((0, 1), (-1, 0)), ((-1, 0), (0, -1)), ((0, -1), (1, 0))]   # outward d, tangent t (local)
    def FP(side, s, y, off=0.0):
        (da, db), (ta, tb) = SIDES[side]; h = hw(y) + off
        return L.P(da * h + ta * s, db * h + tb * s, y)
    def FN(side):
        (da, db), _ = SIDES[side]; d = L.d(da, db); n = (d[0], -kk, d[2]); l = math.sqrt(sum(q * q for q in n)); return (n[0] / l, n[1] / l, n[2] / l)
    cols = []
    ya = yG + YA
    # plaza slab under the arcade
    g.prism('paving', L.ring([(-HW0 - 1.5, -HW0 - 1.5), (HW0 + 1.5, -HW0 - 1.5), (HW0 + 1.5, HW0 + 1.5), (-HW0 - 1.5, HW0 + 1.5)]), yG - 3, yG, C('#b8b2a8'), top=True)
    for side in range(4):
        N = FN(side)
        # pyramid face above the base
        g.quad_sub('concrete', FP(side, -hw(ya), ya), FP(side, hw(ya), ya), FP(side, HWT, yT), FP(side, -HWT, yT), WH, N, maxe=4.0 if not g.lod else 30)
        # windows: 48 floors of narrow pivot windows (flat quads 4 cm proud of the face)
        fh = 3.95; nf = int((HT - YA - 5) / fh)
        for f in range(nf):
            y0 = ya + 1.2 + f * fh; y1w, y0w = y0 + 2.6, y0 + 0.75
            hm = hw((y0w + y1w) / 2) - 1.4
            nw = max(1, int(2 * hm / 1.52))
            if g.lod:
                for q in range(0, nw, 6):
                    s0 = -hm + 2 * hm * q / nw; s1 = -hm + 2 * hm * min(nw, q + 6) / nw
                    g.poly('win', [FP(side, s0, y0w, 0.04), FP(side, s1, y0w, 0.04), FP(side, s1, y1w, 0.04), FP(side, s0, y1w, 0.04)], glass_col(0.45), N)
                continue
            for q in range(nw):
                sc = -hm + 2 * hm * (q + 0.5) / nw
                g.poly('win', [FP(side, sc - 0.46, y0w, 0.04), FP(side, sc + 0.46, y0w, 0.04), FP(side, sc + 0.46, y1w, 0.04), FP(side, sc - 0.46, y1w, 0.04)], glass_col(0.45), N)
        # hip trims
        (da, db), (ta, tb) = SIDES[side]
        if not g.lod:
            p0 = L.P((da + ta) * hw(ya), (db + tb) * hw(ya), ya); p1 = L.P((da + ta) * HWT, (db + tb) * HWT, yT)
            g.rod('concrete', p0, p1, 0.45, WHD, n=6)
        # spire face (aluminium)
        g.poly('metal', [FP(side, -HWT, yT), FP(side, HWT, yT), L.P(0, 0, yG + HA)], AL, N)
        # base: truss legs in the face plane, belt beam, arcade soffit, recessed lobby glass
        ncol = 9
        for q in range(ncol):
            s = -hw(yG) + 1.6 + (2 * hw(yG) - 3.2) * q / (ncol - 1)
            sy = s * hw(ya) / hw(yG)
            pts_b = [FP(side, s - 0.65, yG - 0.5, 0), FP(side, s + 0.65, yG - 0.5, 0), FP(side, s + 0.65, yG - 0.5, -1.3), FP(side, s - 0.65, yG - 0.5, -1.3)]
            pts_t = [FP(side, sy - 0.65, ya, 0), FP(side, sy + 0.65, ya, 0), FP(side, sy + 0.65, ya, -1.3), FP(side, sy - 0.65, ya, -1.3)]
            for i in range(4):
                j = (i + 1) % 4
                m = [(pts_b[i][k] + pts_b[j][k] + pts_t[i][k] + pts_t[j][k]) / 4 for k in range(3)]
                cc = [(sum(p[k] for p in pts_b) + sum(p[k] for p in pts_t)) / 8 for k in range(3)]
                g.poly('concrete', [pts_b[i], pts_b[j], pts_t[j], pts_t[i]], WH, (m[0] - cc[0], m[1] - cc[1], m[2] - cc[2]))
            cx, cz = L.xz(da * (hw(yG) - 0.65) + ta * s, db * (hw(yG) - 0.65) + tb * s)
            cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': 0.7, 'hz': 0.7, 'yaw': round(L.yaw(), 4), 'yMin': round(yG - 1, 2), 'yMax': round(ya, 2)})
            if q < ncol - 1 and not g.lod:
                s2 = -hw(yG) + 1.6 + (2 * hw(yG) - 3.2) * (q + 1) / (ncol - 1)
                sm = (s + s2) / 2 * hw(ya - 6) / hw(yG)
                g.rod('concrete', FP(side, s, yG + 0.5, -0.6), FP(side, sm, ya - 5.5, -0.6), 0.32, WHD, n=6)
                g.rod('concrete', FP(side, s2, yG + 0.5, -0.6), FP(side, sm, ya - 5.5, -0.6), 0.32, WHD, n=6)
        g.poly('concrete', [FP(side, -hw(ya) - 0.1, ya - 1.6, 0.35), FP(side, hw(ya) + 0.1, ya - 1.6, 0.35), FP(side, hw(ya) + 0.1, ya + 0.3, 0.35), FP(side, -hw(ya) - 0.1, ya + 0.3, 0.35)], WHD, N)
        g.poly('concrete', [L.P(da * HWL + ta * -HWL, db * HWL + tb * -HWL, ya - 1.6), L.P(da * HWL + ta * HWL, db * HWL + tb * HWL, ya - 1.6),
                            FP(side, hw(ya), ya - 1.6, 0.35), FP(side, -hw(ya), ya - 1.6, 0.35)], WHD, (0, -1, 0))
        a_ = L.xz(da * HWL + ta * HWL, db * HWL + tb * HWL); b_ = L.xz(da * HWL - ta * HWL, db * HWL - tb * HWL)   # frame normal = outward
        storefront(g, a_, b_, lambda x, z: yG, ya - 1.6, 4.8, 'granite', C('#b6b0a6'), glass_slot='shop', lit=0.9, frame_col=C('#2a2a2a'), margin=0.6, transom=1.8, y_under=yG - 1)
        if da: cols.append(L.col(da * HWL - 0.5, da * HWL + 0.5, -HWL, HWL, yG - 6, ya))
        else: cols.append(L.col(-HWL, HWL, db * HWL - 0.5, db * HWL + 0.5, yG - 6, ya))
    # wings: elevators (east) and stairs + smoke tower (west), vertical, from floor 29 to above the top floor
    for sg in (1, -1):
        a0, a1 = (3.0, 14.2) if sg > 0 else (-14.2, -3.0)
        y0w, y1w = yG + 100.0, yT + 7.0
        L.box(g, 'concrete', a0, a1, -3.6, 3.6, y0w, y1w, WH, top=True)
        if not g.lod and sg < 0:
            Fw = L.F(-14.2, -3.6, 1)
            for k in range(int((y1w - y0w - 4) / 3.95)):
                yy = y0w + 2 + k * 3.95
                g.fbox('win', Fw, 3.0, 4.2, yy, yy + 1.6, -0.02, 0.02, glass_col(0.3), top=False)
    # the aircraft beacon ("Crown Jewel") + spire lights
    ytop = yG + HA
    g.lathe('lamp', *L.xz(0, 0), [(0.0, ytop - 3.2), (0.45, ytop - 2.9), (0.45, ytop - 2.0), (0.0, ytop - 1.7)], (1.0, 0.08, 0.04, 1.0), n=8)
    # Redwood Park (east): coast redwoods, lawn beds, benches
    rng = __import__('random').Random(7)
    trees = [(32.5, -16), (38, -9), (44.5, -15), (35, 1), (42, 5), (48, -2), (33.5, 13), (41, 17), (47.5, 11)]
    for k, (a, b) in enumerate(trees):
        x, z = L.xz(a + rng.uniform(-1, 1), b + rng.uniform(-1, 1)); yy = H(x, z)
        cols.append(conifer(g, x, z, yy, h=26 + rng.random() * 8, R=3.2, seed=40 + k))
        g.lathe('grass', x, z, [(3.2, yy + 0.05), (0.0, yy + 0.12)], C('#4c6b35'), n=12 if not g.lod else 6)
    if not g.lod:
        for k in range(6):
            a, b = 30.0 + (k % 3) * 8.0, -3.0 + (k // 3) * 8.0
            x, z = L.xz(a, b); yy = H(x, z)
            g.box('wood', x - 1.0, x + 1.0, yy + 0.42, yy + 0.5, z - 0.3, z + 0.3, C('#7a5b3a'), yaw=L.yaw())
            for e in (-0.85, 0.85):
                g.box('metal', x + L.u[0] * e - 0.05, x + L.u[0] * e + 0.05, yy, yy + 0.42, z + L.u[1] * e - 0.25, z + L.u[1] * e + 0.25, C('#2a2a2a'), yaw=L.yaw())
    noT = [[list(p) for p in L.ring([(27.5, -24), (52, -24), (52, 24), (27.5, 24)])], [list(p) for p in L.ring([(-28, -28), (28, -28), (28, 28), (-28, 28)])]]
    return {'colliders': cols, 'name': 'Transamerica Pyramid', 'replaces': 'transamerica', 'yG': round(yG, 2), 'top': round(ytop, 1), 'noTrees': noT, 'near': 300}


# ------------------------------------------------------------------------------------------ Salesforce Tower (415 Mission, 326 m)
SF_IDS = [17644, 17645, 17646, 17647, 17648, 17649, 17650, 17651, 17652, 17653]


def sf_shape():
    ids = [i for i in SF_IDS if bld(i)['h'] > 300]
    hl = ring_simplify(hull([p for i in ids for p in ring_of(i)]), 0.08)
    return ring_out(hl), centroid(hl), ids


SF = dict(HT=326.0, HO=268.0, LOB=17.0, TAPER=0.085)


def salesforce(g):
    hl, c, ids = sf_shape()
    yG = min(sidewalk(*p) for p in hl)
    HT, HO, LOB, TP = SF['HT'], SF['HO'], SF['LOB'], SF['TAPER']
    sc = lambda y: 1.0 - TP * max(0.0, (y - yG)) / HT
    WHT = C('#e8ebec'); SIL = C('#c7ccd0'); GLS = C('#6f7c86')
    cols = wall_colliders(hl, yG - 6, yG + HO)
    # lobby: 17 m glass hall, fins every 3 m, a white soffit band
    r0 = ring_scale(hl, c, sc(yG + LOB))
    for ea, eb in ring_edges(r0):
        Fe = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
        g.quad_sub('shop', Geo.fp(Fe, 0, yG - 1, -0.6), Geo.fp(Fe, Le, yG - 1, -0.6), Geo.fp(Fe, Le, yG + LOB - 1.2, -0.6), Geo.fp(Fe, 0, yG + LOB - 1.2, -0.6),
                   (0.95, 0.9, 0.82, 1.0), (Fe[2][0], 0, Fe[2][1]), maxe=6 if not g.lod else 40)
        if not g.lod:
            for k in range(int(Le / 3.0) + 1):
                u = min(Le, k * 3.0)
                g.fbox('metal', Fe, u - 0.06, u + 0.06, yG - 1, yG + LOB - 1.2, -0.6, -0.1, SIL, top=False)
            g.fbox('metal', Fe, 0, Le, yG + 5.4, yG + 5.55, -0.6, -0.2, SIL, top=True, bottom=True)
        g.fbox('paint', Fe, 0, Le, yG + LOB - 1.2, yG + LOB, -0.6, 0.15, WHT, top=True, bottom=True, sides=False)
    # office shaft: one ring per floor (continuous taper), glass bays between white vertical fins + horizontal sunshades
    fh = 4.15
    nf = int((HO - LOB) / fh)
    for f in range(nf):
        y0 = yG + LOB + f * fh; y1 = y0 + fh
        rr = ring_scale(hl, c, sc((y0 + y1) / 2))
        for ea, eb in ring_edges(rr):
            Fe = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea)); N = (Fe[2][0], 0, Fe[2][1])
            nb = max(1, int(round(Le / 1.52)))
            if g.lod:
                if f % 2 == 0:
                    g.poly('win', [Geo.fp(Fe, 0, y0, 0), Geo.fp(Fe, Le, y0, 0), Geo.fp(Fe, Le, y1 + fh, 0), Geo.fp(Fe, 0, y1 + fh, 0)], glass_col(0.4), N)
                continue
            g.poly('paint', [Geo.fp(Fe, 0, y0, 0.02), Geo.fp(Fe, Le, y0, 0.02), Geo.fp(Fe, Le, y0 + 0.55, 0.02), Geo.fp(Fe, 0, y0 + 0.55, 0.02)], WHT, N)
            for k in range(nb):
                u0, u1 = Le * k / nb, Le * (k + 1) / nb
                g.poly('win', [Geo.fp(Fe, u0, y0 + 0.55, 0), Geo.fp(Fe, u1, y0 + 0.55, 0), Geo.fp(Fe, u1, y1, 0), Geo.fp(Fe, u0, y1, 0)], glass_col(0.42), N)
                g.fbox('paint', Fe, u0 - 0.07, u0 + 0.07, y0 + 0.55, y1, 0, 0.35 if f * fh < 40 else 0.03, WHT, top=False, sides=f * fh < 40)
            if f * fh < 40:
                g.fbox('paint', Fe, 0, Le, y0 + 0.5, y0 + 0.62, 0, 0.7, WHT, top=True, bottom=True, sides=False)
    # crown: open lattice of white fins + rings, LED screen inside, nothing on top
    yc0 = yG + LOB + nf * fh; yc1 = yG + HT
    rc = ring_scale(hl, c, sc(yc0))
    per = sum(v2len(v2sub(b, a)) for a, b in ring_edges(rc))
    nfin = int(per / (1.25 if not g.lod else 3.0))
    ring_pts = []
    acc = 0.0; segs = ring_edges(rc)
    for k in range(nfin):
        s = per * k / nfin
        for a, b in segs:
            Le = v2len(v2sub(b, a))
            if s <= Le: ring_pts.append((v2lerp(a, b, s / Le), edge_n(a, b), v2norm(v2sub(b, a)))); break
            s -= Le
    for p, n, t in ring_pts:
        # fins follow the taper: bottom at the crown base ring, top pulled in
        top_s = sc(yc1) / sc(yc0)
        q = (c[0] + (p[0] - c[0]) * top_s, c[1] + (p[1] - c[1]) * top_s)
        A0 = (p[0] - n[0] * 0.25, yc0, p[1] - n[1] * 0.25); A1 = (p[0] + n[0] * 0.55, yc0, p[1] + n[1] * 0.55)
        B0 = (q[0] - n[0] * 0.25, yc1, q[1] - n[1] * 0.25); B1 = (q[0] + n[0] * 0.55, yc1, q[1] + n[1] * 0.55)
        g.poly('paint', [A0, A1, B1, B0], WHT, (t[0], 0, t[1]))
        g.poly('paint', [A0, A1, B1, B0], shade(WHT, 0.85), (-t[0], 0, -t[1]))
    for k in range(0, int((yc1 - yc0) / 4.2) + 1, 1 if not g.lod else 3):
        y = yc0 + k * 4.2
        rk = ring_scale(hl, c, sc(y))
        g.sweep('paint', rk, [(0.05, y - 0.18), (0.05, y + 0.18), (-0.5, y + 0.18)], WHT)
    g.prism('paint', ring_scale(hl, c, sc(yc0) * 0.86), yc0 + 2, yc0 + 44, C('#dfe3e5'), top=False, sub=not g.lod)
    if not g.lod:   # 'Day for Night' LED field: a lamp grid on the inner screen
        rin = ring_scale(hl, c, sc(yc0) * 0.86 + 0.004)
        for ea, eb in ring_edges(rin):
            Fe = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
            for k in range(0, int(Le / 3.0) + 1):
                for yy in range(4, 42, 5):
                    g.fbox('lamp', Fe, k * 3.0, k * 3.0 + 0.5, yc0 + yy, yc0 + yy + 0.5, 0, 0.05, (0.75, 0.82, 1.0, 1.0), top=False, sides=False)
    g.prism('roof', ring_scale(hl, c, sc(yc0) * 0.9), yc0 - 0.5, yc0 + 2.0, ROOF, top=True)
    # entrance canopy on the Mission St side
    a, b = edge_facing(hl, -0.7, -0.7)
    Fe = Geo.frame(a, b); Le = v2len(v2sub(b, a))
    g.fbox('metal', Fe, -4, Le + 4, yG + 5.6, yG + 6.0, 0, 5.0, SIL, top=True, bottom=True, back=True)
    return {'colliders': cols, 'name': 'Salesforce Tower', 'replaces': 'salesforce', 'yG': round(yG, 2), 'top': round(yG + HT, 1), 'near': 320}


# ------------------------------------------------------------------------------------------ Salesforce Transit Center + rooftop park
TC_IDS = [23723, 23729, 23728, 23726, 23730, 23722, 23727, 23731, 23721, 17632, 17676, 17633, 17616, 17617, 17615, 17665, 17634, 17614,
          17760, 17750, 17749, 17733, 17752, 17759, 17751]


def tc_frame():
    """fit the band axis to the footprint points: line through the per-bin mid-widths"""
    pts = [p for i in TC_IDS for p in ring_of(i)]
    P0, P1 = (1845.0, -1395.0), (2125.0, -1725.0)
    u = v2norm(v2sub(P1, P0)); L0 = Loc(P0, u)
    loc = [L0.loc(*p) for p in pts]
    xs, ys = [], []
    for k in range(0, 440, 20):
        ws = [q[1] for q in loc if k <= q[0] < k + 20]
        if len(ws) > 3: xs.append(k + 10); ys.append((min(ws) + max(ws)) / 2)
    n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    sl = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    c = L0.xz(mx, my); d = v2norm(L0.d(1.0, sl)[::2])
    L = Loc(c, d)
    loc = [L.loc(*p) for p in pts]
    a0, a1 = min(q[0] for q in loc), max(q[0] for q in loc)
    return L, a0 + 1.0, a1 - 1.0, 23.5


def transit(g):
    L, a0, a1, hw = tc_frame()
    WHT = C('#eef0ef'); CON = C('#bdb9b1'); GL = C('#8a969c')
    gy = [sidewalk(*L.xz(a, b)) for a in range(int(a0), int(a1) + 1, 10) for b in (-hw, 0, hw)]
    yP = max(gy) + 20.0
    # street openings under the structure (1st St, Fremont St): clearance 10 m
    S = sites()['transit']['streets']
    gaps = []
    for st in S:
        if st['name'] not in ('1st Street', 'First Street', 'Fremont Street', 'Beale Street', '2nd Street'): continue
        P = st['pts']
        for k in range(len(P) - 1):
            p0, p1 = L.loc(*P[k][:2]), L.loc(*P[k + 1][:2])
            if (p0[1] < 0) != (p1[1] < 0):
                a = p0[0] + (p1[0] - p0[0]) * (-p0[1]) / (p1[1] - p0[1])
                if a0 + 8 < a < a1 - 8: gaps.append((a - st['width'] / 2 - 3.5, a + st['width'] / 2 + 3.5))
    gaps.sort()
    def in_gap(a): return any(g0 <= a <= g1 for g0, g1 in gaps)
    cols = []
    # structure: long walls with the undulating white skin, ends glazed
    step = 1.6 if not g.lod else 6.0
    na = int((a1 - a0) / step)
    for side in (1, -1):
        b = hw * side
        N = L.d(0, side)
        for i in range(na):
            aa, ab = a0 + (a1 - a0) * i / na, a0 + (a1 - a0) * (i + 1) / na
            am = (aa + ab) / 2
            yb0 = sidewalk(*L.xz(aa, b)) - 1.0; yb1 = sidewalk(*L.xz(ab, b)) - 1.0
            if in_gap(am): yb0 = yb1 = min(gy) + 10.0
            # glass wall behind (lit concourse)
            g.poly('shop', [L.P(aa, b - side * 1.8, yb0), L.P(ab, b - side * 1.8, yb1), L.P(ab, b - side * 1.8, yP - 3), L.P(aa, b - side * 1.8, yP - 3)],
                   (0.95, 0.9, 0.8, 1.0) if not in_gap(am) else (0.2, 0.2, 0.2, 1.0), N)
            # perforated skin: vertical strips whose depth undulates (Penrose-like waves)
            nv = 12 if not g.lod else 3
            ys = [yb0 + (yP + 1.4 - yb0) * j / nv for j in range(nv + 1)]
            off = lambda a, y: 0.35 + 0.55 * (0.5 + 0.5 * math.sin(a / 7.5 + y / 4.0) * math.cos(a / 23.0 - y / 9.0))
            for j in range(nv):
                y0, y1 = ys[j], ys[j + 1]
                q = [L.P(aa, b + side * off(aa, y0), y0), L.P(ab, b + side * off(ab, y0), y0), L.P(ab, b + side * off(ab, y1), y1), L.P(aa, b + side * off(aa, y1), y1)]
                g.poly('paint', q, WHT, N)
                g.poly('paint', q, shade(WHT, 0.75), (-N[0], 0, -N[2]))
            if in_gap(am) and side > 0:
                g.poly('concrete', [L.P(aa, b, yb0), L.P(ab, b, yb1), L.P(ab, -b, yb1), L.P(aa, -b, yb0)], CON, (0, -1, 0))
        edges_ = [a0] + [q for gp in gaps for q in gp] + [a1]
        for q in range(0, len(edges_), 2):
            cols.append(L.col(edges_[q], edges_[q + 1], b - 0.8 if side > 0 else b, b if side > 0 else b + 0.8, min(gy) - 6, yP + 1.4))
    for a, sgn in ((a0, -1), (a1, 1)):
        Fe = L.F(a, hw * sgn, 1 if sgn < 0 else 3)
        yb = min(sidewalk(*L.xz(a, b)) for b in (-hw, 0, hw)) - 1
        g.quad_sub('shop', Geo.fp(Fe, 0, yb, 0), Geo.fp(Fe, 2 * hw, yb, 0), Geo.fp(Fe, 2 * hw, yP - 1, 0), Geo.fp(Fe, 0, yP - 1, 0), (0.9, 0.85, 0.75, 1.0), (Fe[2][0], 0, Fe[2][1]), maxe=8)
        g.fbox('paint', Fe, -0.5, 2 * hw + 0.5, yP - 1.0, yP + 1.4, 0, 0.6, WHT, top=True, bottom=True)
        if not g.lod:
            for k in range(int(2 * hw / 3.0) + 1):
                g.fbox('metal', Fe, k * 3.0 - 0.06, k * 3.0 + 0.06, yb, yP - 1, 0, 0.3, C('#9ea4a8'), top=False)
        cols.append(L.col(a - 0.5, a + 0.5, -hw, hw, yb, yP + 1.4))
    # the park: paths, lawns, beds, trees, the bus fountain, the Grand Hall light-column skylight, glass balustrades
    Lp = a1 - a0
    path_w = lambda a: 6.0 * math.sin((a - a0) / 31.0) + 2.5 * math.sin((a - a0) / 11.0)
    ca = (a0 + a1) / 2 + 30.0
    grid = 2.0 if not g.lod else 8.0
    nu, nw_ = int(Lp / grid), int(2 * hw / grid)
    for i in range(nu):
        for j in range(nw_):
            u0, u1 = a0 + Lp * i / nu, a0 + Lp * (i + 1) / nu; w0, w1 = -hw + 2 * hw * j / nw_, -hw + 2 * hw * (j + 1) / nw_
            um, wm = (u0 + u1) / 2, (w0 + w1) / 2
            path = abs(wm - path_w(um)) < 2.6 or abs(wm) > hw - 3.2 or (i % 40 in (0, 1)) or math.hypot(um - ca, wm) < 10.5
            fountain = abs(wm - (hw - 5.2)) < 0.8 and a0 + 60 < um < a1 - 60
            slot, col = ('water', C('#ffffff')) if fountain else ('paving', C('#d3cdc1')) if path else ('grass', C('#9cc062'))
            g.poly(slot, [L.P(u0, w0, yP), L.P(u1, w0, yP), L.P(u1, w1, yP), L.P(u0, w1, yP)], col, (0, 1, 0))
    # soffit under the deck at the ends (seen from the street)
    g.poly('concrete', [L.P(a0, -hw, yP - 1.0), L.P(a1, -hw, yP - 1.0), L.P(a1, hw, yP - 1.0), L.P(a0, hw, yP - 1.0)], CON, (0, -1, 0))
    import random
    R = random.Random(5)
    _hl, _c, _ = sf_shape(); _at, _bt = L.loc(*_c); kiosk = (_at - 1.5, max(-hw + 5, min(hw - 5, _bt)))
    nt = 70 if not g.lod else 40
    k = 0; tries = 0
    while k < nt and tries < 2000:
        tries += 1
        a = a0 + 4 + R.random() * (Lp - 8); b = -hw + 4 + R.random() * (2 * hw - 8)
        if abs(b - path_w(a)) < 4.5 or abs(b - (hw - 5.2)) < 2.0 or math.hypot(a - ca, b) < 13: continue
        if math.hypot(a - kiosk[0], b - kiosk[1]) < 8.0: continue
        x, z = L.xz(a, b)
        conifer(g, x, z, yP, h=9 + R.random() * 5, R=2.0, seed=k) if R.random() < 0.25 else broadleaf(g, x, z, yP, h=6 + R.random() * 4, R=2.4 + R.random(), seed=k,
                                                                                                         n=90 if not g.lod else 18, col=C('#4f7a36') if k % 3 else C('#6b8a3a'))
        k += 1
    # fountain jets (bus fountain) as glowing spouts
    if not g.lod:
        for kk in range(int((Lp - 120) / 3.0)):
            a = a0 + 60 + kk * 3.0; x, z = L.xz(a, hw - 5.2)
            g.lathe('water', x, z, [(0.08, yP), (0.03, yP + 0.9 + 0.6 * math.sin(kk * 0.7)), (0.0, yP + 1.0 + 0.6 * math.sin(kk * 0.7))], C('#ffffff'), n=5)
    # Grand Hall light column: a glass dome skylight over the oculus
    x, z = L.xz(ca, 0.0)
    g.lathe('glassc', x, z, [(9.0, yP), (8.4, yP + 1.6), (6.0, yP + 3.4), (2.5, yP + 4.4), (0.0, yP + 4.6)], C('#cbd9de'), n=36 if not g.lod else 12)
    g.lathe('metal', x, z, [(9.3, yP), (9.3, yP + 0.5), (9.0, yP + 0.5)], C('#9ea4a8'), n=36 if not g.lod else 12)
    cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 7.5, 'hz': 7.5, 'yaw': round(L.yaw(), 4), 'yMin': yP - 1, 'yMax': yP + 4})
    # amphitheatre: grass steps down toward the west
    if not g.lod:
        aa = a0 + Lp * 0.25
        for s in range(5):
            r0 = 7.0 + s * 1.3
            g.lathe('granite', *L.xz(aa, -3.0), [(r0, yP + 0.02 + s * 0.35), (r0 + 1.3, yP + 0.02 + s * 0.35)], C('#b0aaa0'), n=24, a0=math.pi * 0.2 + L.yaw() * 0, a1=math.pi * 0.8)
    # glass balustrades + handrail along both edges
    for side in (1, -1):
        b = (hw - 0.25) * side
        g.quad_sub('glassc', L.P(a0, b, yP), L.P(a1, b, yP), L.P(a1, b, yP + 1.2), L.P(a0, b, yP + 1.2), C('#cfdadc'), L.d(0, side), maxe=40)
        g.rod('metal', L.P(a0, b, yP + 1.25), L.P(a1, b, yP + 1.25), 0.05, C('#9ea4a8'), n=5)
        cols.append(L.col(a0, a1, b - 0.1, b + 0.1, yP, yP + 1.3))
    for a in (a0, a1):
        g.quad_sub('glassc', L.P(a, -hw, yP), L.P(a, hw, yP), L.P(a, hw, yP + 1.2), L.P(a, -hw, yP + 1.2), C('#cfdadc'), L.d(1 if a == a1 else -1, 0), maxe=40)
        cols.append(L.col(a - 0.15, a + 0.15, -hw, hw, yP, yP + 1.3))
    # lamps along the path
    if not g.lod:
        for kk in range(int(Lp / 18)):
            a = a0 + 9 + kk * 18; b = path_w(a) + 3.0; x, z = L.xz(a, b)
            g.cyl('metal', x, z, 0.06, yP, yP + 3.6, C('#3a3d40'), n=6)
            g.lathe('lamp', x, z, [(0.0, yP + 3.5), (0.25, yP + 3.6), (0.0, yP + 3.9)], (1.0, 0.9, 0.72, 1.0), n=6)
    # glass elevator kiosk down to the Salesforce Tower lobby (door pair lives in the salesforce interior)
    hl_, c_, _ = sf_shape()
    at, bt = L.loc(*c_); bp = max(-hw + 5, min(hw - 5, bt)); ka = at - 3.4
    L.box(g, 'metal', ka - 1.6, ka + 1.6, bp - 1.6, bp + 1.6, yP + 3.4, yP + 3.7, C('#9ea4a8'))
    L.box(g, 'shop', ka - 1.45, ka + 1.45, bp - 1.45, bp + 1.45, yP, yP + 3.4, (0.95, 0.92, 0.85, 1.0), top=False)
    if not g.lod:
        for sa in (-1, 1):
            for sb in (-1, 1):
                L.box(g, 'metal', ka + sa * 1.5 - 0.08, ka + sa * 1.5 + 0.08, bp + sb * 1.5 - 0.08, bp + sb * 1.5 + 0.08, yP, yP + 3.4, C('#9ea4a8'))
        g.text('neon', L.F(ka + 1.46, bp + 1.2, 3), 1.2, yP + 2.7, 0.02, 'ELEVATOR', 0.28, (0.9, 0.95, 1.0, 1.0), depth=0.02)
    cols.append(L.col(ka - 1.5, ka + 1.5, bp - 1.5, bp + 1.5, yP, yP + 3.5))
    decks = rect_decks(L, a0 + 0.3, a1 - 0.3, -hw + 0.3, hw - 0.3, yP, strip=9.0)
    noT = [[list(p) for p in L.ring([(a0 - 2, -hw - 2), (a1 + 2, -hw - 2), (a1 + 2, hw + 2), (a0 - 2, hw + 2)])]]
    return {'colliders': cols, 'decks': decks, 'name': 'Salesforce Transit Center', 'yG': round(min(gy), 2), 'top': round(yP + 14, 1), 'park': round(yP, 2), 'noTrees': noT}


BUILDERS = {
    'hobart': (hobart, [17508, 17605, 17612, 17613]),
    'embCenter': (emb_center, EC_HIDE),
    'turntable': (turntable, [23507]),
    'transamerica': (transamerica, TA_HIDE),
    'salesforce': (salesforce, SF_IDS),
    'transit': (transit, TC_IDS),
    'palace': (palace, PALACE),
    'phelan': (phelan, [23557]),
    'hallidie': (hallidie, [17220]),
    'mills': (mills, [17596]),
    'ca101': (ca101, [17611, 17610]),
    'ca555': (ca555, CA555),
}


def _tt_origin():
    E = (1016.0, -1176.5); d = v2norm((16.6, 103.7)); c = v2add(E, v2mul(d, 99.0))
    return (round(c[0], 1), round(H(*c) - 3.0, 2), round(c[1], 1))


ORIGINS = {'turntable': _tt_origin}


def main():
    ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = ORIGINS[bid]() if bid in ORIGINS else origin_for([ring_of(i) for i in hide])
        run_building(bid, fn, hide, O)


if __name__ == '__main__':
    main()
