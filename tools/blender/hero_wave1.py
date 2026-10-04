"""HILLBOMB hero landmarks, wave 1 (Union Square) + shared architecture helpers.

Run one building:  tools/.venv-blender/Scripts/python.exe tools/blender/hero_wave1.py -- stFrancis
Every builder takes a Geo (LOD 0 or 1) and returns meta (colliders, interior hooks); run_building bakes + exports.
"""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_lib import *   # noqa

# ------------------------------------------------------------------------------------------ palette
STONE = C('#d8cfbd'); STONE_D = C('#c4baa6'); GRANITE = C('#a9a193'); BRONZE = C('#4a3a26'); CREAM = C('#e6ddca')
WHITE = C('#e9e7e0'); GLASS_BR = C('#2e2a26'); GOLD = C('#c9a24a'); RED = C('#b3162a'); ROOF = C('#8a857c')


def ring_edges(r):
    r = ring_out(r)
    return [(r[i], r[(i + 1) % len(r)]) for i in range(len(r))]


def neighbour_top(a, b, own, probe=2.5):
    """absolute top of the tallest other footprint just outside the middle of edge a->b (None if street)"""
    n = edge_n(a, b); best = None
    for s in (0.25, 0.5, 0.75):
        m = v2lerp(a, b, s); p = (m[0] + n[0] * probe, m[1] + n[1] * probe)
        for bb in buildings_near(p[0], p[1], 80):
            if bb['i'] in own or len(bb['ring']) < 3: continue
            if point_in(bb['ring'], p[0], p[1]):
                t = bb['base'] + bb['h']
                best = t if best is None else max(best, t)
    return best


def ground_min(ring):
    r = ring_out(ring); hs = []
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        for s in range(6): hs.append(H(*v2lerp(a, b, s / 5)))
    return min(hs), max(hs)


def sidewalk(x, z):
    return H(x, z) + 0.15


def floor_levels(y0, heights):
    ys = [y0]
    for h in heights: ys.append(ys[-1] + h)
    return ys


def origin_for(rings):
    pts = [p for r in rings for p in r]
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    lo = min(ground_min(r)[0] for r in rings)
    return (round(cx, 1), round(lo - 3.0, 2), round(cz, 1))


def tfacade(g, a, b, y0, y1, fh, bay, win, slot, col, flat_h=26.0, **kw):
    """tower facade: full recessed windows for the lowest flat_h metres, flat window quads above (LOD0 budget)"""
    if g.lod: return facade(g, a, b, y0, y1, fh, bay, win, slot, col, **kw)
    k = max(1, int(flat_h / fh)); ym = y0 + k * fh
    if ym >= y1 - fh: return facade(g, a, b, y0, y1, fh, bay, win, slot, col, **kw)
    facade(g, a, b, y0, ym, fh, bay, win, slot, col, **kw)
    facade(g, a, b, ym, y1, fh, bay, win, slot, col, lod=1, **kw)


def rustication(g, a, b, y0, y1, step, col, depth=0.05):
    return   # disabled: the courses ran across the arched openings (needs per-pier strips)
    if g.lod: return
    F = Geo.frame(a, b); L = v2len(v2sub(b, a)); y = y0 + step
    while y < y1 - 0.1:
        g.fbox('stone', F, 0, L, y - 0.06, y + 0.02, 0, depth, shade(col, 0.8), top=True, bottom=True, sides=False)
        y += step


# ------------------------------------------------------------------------------------------ Westin St. Francis
def st_francis(g):
    main, low, tower = ring_of(23428), ring_of(23431), ring_of(23423)
    fillA, fillB = ring_of(23429), ring_of(23430)
    own = {23428, 23431, 23423, 23429, 23430}
    yG = sidewalk(975, -1430)
    top = bld(23428)['base'] + 60.0
    # floors: ground 6.2 (arches), mezzanine 4.3, 9 typical, attic 4.2, cornice
    lv = floor_levels(yG, [6.2, 4.3] + [3.72] * 9 + [4.2])
    y_base, y_attic, y_corn = lv[2], lv[11], lv[12]
    roof = y_corn + 1.9
    shaft_w = Win(w=1.25, sill=0.85, head=2.55, depth=0.24, lit=0.45, hood=0.14)
    attic_w = Win(w=1.5, sill=0.7, head=3.3, depth=0.3, arch=1, lit=0.4, keystone=True)
    mezz_w = Win(w=1.6, sill=0.9, head=3.4, depth=0.3, lit=0.4, keystone=True)
    fill_top = lv[1] + 1.0; lt = bld(23431)['base'] + 10.8
    def cover(a, b, rings):
        n = edge_n(a, b); m = v2lerp(a, b, 0.5); p = (m[0] + n[0] * 1.0, m[1] + n[1] * 1.0)
        for r_, top_ in rings:
            if point_in(r_, *p): return top_
        return None
    for a, b in ring_edges(main):
        L = v2len(v2sub(b, a))
        cv = cover(a, b, ((fillA, fill_top), (fillB, fill_top), (low, lt)))
        if cv:   # this wall is inside the lobby / ballroom at ground level: build it only above the low roof
            radial_panel(g, 'stone', Geo.frame(a, b), 0, L, cv, lv[2], None, STONE_D)
        else:
            storefront(g, a, b, sidewalk, lv[1], 3.9, 'stone', STONE_D, glass_slot='shop', arch=1, depth=0.45, lit=0.9,
                       pier=(0.9, 0.18, STONE_D), transom=1.6)
            rustication(g, a, b, lv[0] - 3, lv[2], 0.75, STONE_D)
            facade(g, a, b, lv[1], lv[2], 4.3, 3.9, mezz_w, 'stone', STONE_D, margin=0.9)
        # string course + shaft
        g.fbox('stone', Geo.frame(a, b), 0, L, lv[2] - 0.1, lv[2] + 0.55, 0, 0.35, STONE, top=True, bottom=True)
        facade(g, a, b, lv[2] + 0.55, y_attic, 3.72, 2.6, shaft_w, 'stone', STONE, margin=1.0,
               floors=None) if (y_attic - lv[2] - 0.55) > 3 else None
        g.fbox('stone', Geo.frame(a, b), 0, L, y_attic - 0.15, y_attic + 0.35, 0, 0.3, STONE_D, top=True, bottom=True)
        facade(g, a, b, y_attic + 0.35, y_corn, 3.85, 2.6, attic_w, 'stone', STONE, margin=1.0,
               pier=(0.55, 0.22, STONE_D))
        radial_panel(g, 'stone', Geo.frame(a, b), 0, L, y_corn, roof - 1.2, None, STONE)
    cornice(g, main, roof - 1.2, 1.6, STONE, height=2.4)
    parapet(g, main, roof - 1.2, 1.3, 0.35, STONE_D, roof_col=ROOF)
    if not g.lod:
        roof_clutter(g, main, roof - 1.2, seed=3, n=5)
    # east courtyard fills on Powell: two-storey arcaded pavilions with a balustraded terrace
    for f in (fillA, fillB):
        ft = lv[1] + 1.0
        for a, b in ring_edges(f):
            if cover(a, b, ((main, 0), (low, 0))) is not None: continue
            storefront(g, a, b, sidewalk, lv[1], 3.4, 'stone', STONE_D, glass_slot='shop', arch=1, depth=0.4, lit=0.95, pier=(0.8, 0.15, STONE_D))
            radial_panel(g, 'stone', Geo.frame(a, b), 0, v2len(v2sub(b, a)), lv[1], ft, None, STONE_D)
        parapet(g, f, ft, 1.0, 0.3, STONE, roof_col=C('#7d766b'))
    # low west wing (ballroom block) between the main building and the tower
    for a, b in ring_edges(low):
        if cover(a, b, ((main, 0),)) is not None: continue
        nt = neighbour_top(a, b, own)
        if nt and nt > lt - 1: radial_panel(g, 'stone', Geo.frame(a, b), 0, v2len(v2sub(b, a)), lv[0] - 3, lt, None, STONE_D); continue
        storefront(g, a, b, sidewalk, lv[1] - 0.5, 3.6, 'stone', STONE_D, glass_slot='shop', arch=1, depth=0.4, lit=0.6, pier=(0.8, 0.15, STONE_D))
        facade(g, a, b, lv[1] - 0.5, lt, 4.0, 3.6, Win(w=1.8, sill=1.0, head=3.1, arch=2, lit=0.3), 'stone', STONE_D)
    parapet(g, low, lt, 1.1, 0.35, STONE, roof_col=C('#6d6a64'))
    # the 1972 tower: white vertical fins, bronze glass, glass elevators on the Union Square face
    tt = bld(23423)['base'] + 120.0
    tw = Win(w=0.98, sill=0.35, head=3.05, depth=0.12, lit=0.45, mull=False, sill_out=0)
    t0 = lt
    for a, b in ring_edges(tower):
        nt = neighbour_top(a, b, own)
        y0 = max(lv[0] - 3, (nt or 0))
        L = v2len(v2sub(b, a))
        if nt is None or nt < lt:
            storefront(g, a, b, sidewalk, lv[1] - 0.5, 3.6, 'stone', STONE_D, glass_slot='shop', depth=0.4, lit=0.7)
            y0 = lv[1] - 0.5
        tfacade(g, a, b, max(y0, lv[1] - 0.5), tt - 5, 3.4, 1.62, tw, 'concrete', WHITE, margin=0.6, pier=(0.62, 0.55, WHITE),
                band=(0.25, 0.08, C('#d9d6cf')), flat_h=24)
        radial_panel(g, 'concrete', Geo.frame(a, b), 0, L, tt - 5, tt, None, WHITE)
    parapet(g, tower, tt, 0.6, 0.4, WHITE, slot='concrete', roof_col=ROOF)
    if not g.lod: roof_clutter(g, tower, tt, seed=5, n=3)
    # glass elevators: 5 shafts on the east face, emerging above the old building
    ea, eb = (891.0, -1464.0), (906.0, -1382.0)
    F = Geo.frame(ea, eb); L = v2len(v2sub(eb, ea))
    for k in range(5):
        uc = L * 0.5 + (k - 2) * 4.2
        g.fbox('metal', F, uc - 1.6, uc + 1.6, roof - 4, tt - 2, 0.55, 0.75, C('#3b3d40'), top=True)
        g.fbox('glassc', F, uc - 1.5, uc + 1.5, roof - 4, tt - 2, 0.75, 2.6, C('#8fa4ae'), top=True)
        if not g.lod:
            for yy in (roof + 18 + k * 9, tt - 20 - k * 6):
                g.fbox('lamp', F, uc - 1.2, uc + 1.2, yy, yy + 2.6, 0.95, 2.4, (1.0, 0.85, 0.6, 1.0), top=True, bottom=True)
    # Powell St entrance: bronze marquee + flags on the centre wing
    ma, mb = (966.0, -1419.0), (964.0, -1435.0)
    F = Geo.frame(mb, ma)
    Lm = v2len(v2sub(ma, mb))
    mx, mz = v2lerp(mb, ma, 0.5)
    ye = sidewalk(mx + 3, mz)
    g.fbox('metal', F, 1.0, Lm - 1.0, lv[1] - 1.9, lv[1] - 1.2, 0, 4.2, BRONZE, top=True, bottom=True, back=False)
    g.fbox('glassc', F, 1.2, Lm - 1.2, lv[1] - 1.2, lv[1] - 1.1, 0.2, 4.0, C('#c9d6da'), top=True)
    if not g.lod:
        for k in range(8):
            u = 1.5 + (Lm - 3) * k / 7
            g.fbox('lamp', F, u - 0.25, u + 0.25, lv[1] - 2.0, lv[1] - 1.9, 3.5, 3.9, (1.0, 0.82, 0.55, 1.0), bottom=True)
        g.text('gold', F, Lm / 2, lv[1] - 1.15, 3.1, 'THE ST. FRANCIS', 0.62, GOLD, depth=0.08)
        for k, fc in enumerate((C('#1d3f8a'), C('#e9e6dc'), C('#b3162a'), C('#e9e6dc'), C('#1d3f8a'))):
            u = Lm / 2 + (k - 2) * 3.0
            p = Geo.fp(F, u, lv[2] + 1.0, 0.3); q = Geo.fp(F, u, lv[2] + 1.0 - 1.9, 3.6)
            g.rod('metal', p, (q[0], p[1] + 1.2, q[2]), 0.05, BRONZE)
            pole_end = (q[0], p[1] + 1.2, q[2])
            f0 = Geo.fp(F, u, pole_end[1] - 0.1, 3.3); f1 = Geo.fp(F, u, pole_end[1] - 2.3, 3.3)
            g.poly('fabric', [f0, (pole_end[0], pole_end[1] - 0.1, pole_end[2]), (pole_end[0], pole_end[1] - 2.3, pole_end[2]), f1], fc, None)
    # colliders: perimeter walls of every part (the lobby interior lives inside)
    cols = []
    for r, t in ((main, roof), (low, lt), (tower, tt), (fillA, lv[1] + 2), (fillB, lv[1] + 2)):
        cols += wall_colliders(r, lv[0] - 6, t)
    return {'colliders': cols, 'name': 'The St. Francis', 'yG': round(yG, 2), 'top': round(tt, 1)}


def clip_rect(poly, u0, u1, v0, v1):
    """Sutherland-Hodgman clip of a (u, v) polygon to a rectangle"""
    def clip(P, inside, inter):
        out = []
        for i in range(len(P)):
            a, b = P[i - 1], P[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia: out.append(inter(a, b))
                out.append(b)
            elif ia: out.append(inter(a, b))
        return out

    def ix(c, k):
        def f(a, b):
            t = (c - a[k]) / ((b[k] - a[k]) or 1e-9)
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        return f
    P = poly
    for inside, inter in ((lambda p: p[0] >= u0, ix(u0, 0)), (lambda p: p[0] <= u1, ix(u1, 0)),
                          (lambda p: p[1] >= v0, ix(v0, 1)), (lambda p: p[1] <= v1, ix(v1, 1))):
        P = clip(P, inside, inter)
        if not P: return []
    return P


def harlequin(g, F, u0, u1, v0, v1, size, ca, cb, slot='granite', w=0.0):
    """diamond checkerboard on a wall rectangle; LOD1: plain average"""
    N = (F[2][0], 0, F[2][1])
    if g.lod:
        m = tuple((ca[k] + cb[k]) / 2 for k in range(4))
        return g.quad_sub(slot, Geo.fp(F, u0, v0, w), Geo.fp(F, u1, v0, w), Geo.fp(F, u1, v1, w), Geo.fp(F, u0, v1, w), m, N, maxe=12)
    h = size / 2
    for i in range(int(math.floor((u0 - v1) / size)) - 1, int(math.ceil((u1 - v0) / size)) + 2):
        for j in range(int(math.floor((u0 + v0) / size)) - 1, int(math.ceil((u1 + v1) / size)) + 2):
            p, q = (i + 0.5) * size, (j + 0.5) * size
            cu, cv = (p + q) / 2, (q - p) / 2
            if cu < u0 - size or cu > u1 + size or cv < v0 - size or cv > v1 + size: continue
            c = clip_rect([(cu, cv - h), (cu + h, cv), (cu, cv + h), (cu - h, cv)], u0, u1, v0, v1)
            if len(c) >= 3:
                g.poly(slot, [Geo.fp(F, x, y, w) for x, y in c], ca if (i + j) % 2 == 0 else cb, N)


def fpt(F, u, w=0.0):
    p = Geo.fp(F, u, 0.0, w); return (p[0], p[2])


def vbay(g, F, uc, wid, y0, y1, fh, out, col, glass_lit=0.4, slot='concrete'):
    """projecting glazed bay (vertical strip of windows) on a wall frame"""
    g.fbox(slot, F, uc - wid / 2, uc + wid / 2, y0, y1, 0, out, col, top=True, bottom=True)
    a = fpt(F, uc - wid / 2, out + 0.001); b = fpt(F, uc + wid / 2, out + 0.001)
    facade(g, a, b, y0 + 0.4, y1 - 0.4, fh, wid / 2.05,
           Win(w=wid / 2.05 - 0.3, sill=0.6, head=fh - 0.35, depth=0.12, lit=glass_lit, sill_out=0, mull=False), slot, col, margin=0.2)


def star(g, F, u, v, w, R, col, slot='neon'):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; rr = R if i % 2 == 0 else R * 0.4
        pts.append((u + math.cos(a) * rr, v + math.sin(a) * rr))
    N = (F[2][0], 0, F[2][1])
    for i in range(10):
        p, q = pts[i], pts[(i + 1) % 10]
        g.poly(slot, [Geo.fp(F, u, v, w + 0.12), Geo.fp(F, p[0], p[1], w + 0.12), Geo.fp(F, q[0], q[1], w + 0.12)], col, N)


def _exit_u(a, b, c, R):
    """distance along a->b where the segment leaves the circle (c, R), starting inside"""
    d = v2norm(v2sub(b, a)); f = v2sub(a, c)
    B = 2 * (f[0] * d[0] + f[1] * d[1]); Cc = f[0] ** 2 + f[1] ** 2 - R * R
    disc = B * B - 4 * Cc
    if disc < 0: return 0.0
    return max(0.0, (-B + math.sqrt(disc)) / 2)


def edge_facing(r, dx, dz):
    """the out-ring edge whose normal best matches (dx, dz)"""
    return max(ring_edges(r), key=lambda e: (edge_n(*e)[0] * dx + edge_n(*e)[1] * dz) * min(1.0, v2len(v2sub(e[1], e[0])) / 8))


# ------------------------------------------------------------------------------------------ JW Marriott Union Square (500 Post / 515 Mason)
def marriott(g):
    r, low = ring_of(23241), ring_of(23427)
    yG = sidewalk(812, -1490)
    top = bld(23241)['base'] + 73.0
    GR = C('#bba58f'); PC = C('#d9cbb6'); PCD = C('#c2b39d')
    lv = floor_levels(yG, [5.2, 4.4, 4.4] + [3.25] * 16)
    yb, yt = lv[3], lv[19]
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        storefront(g, a, b, sidewalk, lv[1], 4.2, 'granite', GR, glass_slot='shop', pier=(1.0, 0.25, GR), lit=0.8, transom=1.4)
        facade(g, a, b, lv[1], yb, 4.4, 4.2, Win(w=3.2, sill=0.4, head=4.1, depth=0.35, lit=0.6), 'granite', GR, margin=1.2)
        g.fbox('granite', F, 0, L, yb - 0.2, yb + 0.5, 0, 0.45, shade(GR, 1.05), top=True, bottom=True)
        tfacade(g, a, b, yb + 0.5, yt, 3.25, 3.1, Win(w=1.15, sill=0.8, head=2.65, depth=0.28, lit=0.5, pair=2, sill_out=0.05), 'concrete', PC, margin=2.2, flat_h=20)
        if L > 20:
            vbay(g, F, L / 2, 6.5, yb + 0.5, yt + 1.2, 3.25, 0.9, PCD, 0.55)
        if not g.lod:
            for uc in (1.1, L - 1.1):
                g.fbox('win', F, uc - 0.5, uc + 0.5, yb + 1.0, yt - 0.5, -0.02, 0.02, (0, 0, 0, 1), top=False)
    c1 = ring_offset(ring_out(r), -2.2)
    cornice(g, r, yt + 1.3, 0.9, PCD, slot='concrete', height=1.2)
    parapet(g, r, yt + 1.3, 1.1, 0.3, PC, slot='concrete', roof_col=ROOF)
    for a, b in ring_edges(c1):
        facade(g, a, b, yt + 1.3, top - 3.5, 3.4, 2.8, Win(w=2.0, sill=0.5, head=2.9, depth=0.2, lit=0.45), 'concrete', PC, margin=0.8)
    g.prism('concrete', c1, top - 3.5, top - 3.2, PCD, top=False)
    parapet(g, c1, top - 3.2, 0.9, 0.25, PC, slot='concrete', roof_col=ROOF)
    cx, cz = centroid(ring_out(r))
    pyr = ring_offset(ring_out(r), -9.5)
    apex = (cx, top + 6.0, cz)
    for i in range(len(pyr)):
        A, B = pyr[i], pyr[(i + 1) % len(pyr)]
        n = edge_n(A, B)
        g.poly('glassc', [(A[0], top - 2.3, A[1]), (B[0], top - 2.3, B[1]), apex], C('#9fb6c2'), (n[0], 0.6, n[1]))
        if not g.lod:
            for k in range(1, 6):
                P = v2lerp(A, B, k / 6)
                g.rod('metal', (P[0], top - 2.3, P[1]), apex, 0.06, C('#dcdcdc'), n=4)
    lt = bld(23427)['base'] + 7.6
    for a, b in ring_edges(low):
        storefront(g, a, b, sidewalk, lt - 0.8, 3.8, 'granite', GR, glass_slot='shop', lit=0.7)
    parapet(g, low, lt - 0.8, 0.8, 0.3, GR, slot='granite', roof_col=ROOF)
    a, b = edge_facing(r, 1, 0); F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    g.fbox('metal', F, L / 2 - 7, L / 2 + 7, lv[1] - 1.2, lv[1] - 0.6, 0, 5.0, C('#2a2a2c'), top=True, bottom=True)
    if not g.lod:
        g.text('gold', F, L / 2, lv[1] - 0.58, 4.2, 'UNION SQUARE MARRIOTT', 0.5, GOLD, depth=0.07)
        for k in range(6):
            u = L / 2 - 6 + k * 2.4
            g.fbox('lamp', F, u - 0.3, u + 0.3, lv[1] - 1.25, lv[1] - 1.2, 3.8, 4.4, (1.0, 0.85, 0.6, 1.0), bottom=True)
    cols = wall_colliders(r, lv[0] - 6, top) + wall_colliders(low, lv[0] - 6, lt)
    return {'colliders': cols, 'name': 'Union Square Marriott', 'yG': round(yG, 2), 'top': round(top + 6, 1)}


# ------------------------------------------------------------------------------------------ Macy's (Geary frontage on Union Square)
def macys(g):
    r = ring_of(23440); own = {23440}
    yG = sidewalk(1070, -1392)
    top = bld(23440)['base'] + 45.0
    LS = C('#e8e1d2'); LSD = C('#d2c8b5')
    lv = floor_levels(yG, [6.0] + [4.35] * 8)
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        nt = neighbour_top(a, b, own)
        if nt and nt > top - 2:
            radial_panel(g, 'stone', F, 0, L, lv[0] - 4, top, None, LSD); continue
        storefront(g, a, b, sidewalk, lv[1], 5.2, 'stone', LSD, glass_slot='shop', pier=(1.1, 0.25, LSD), lit=1.0, transom=1.8, frame_col=C('#6b5230'))
        g.fbox('stone', F, 0, L, lv[1] - 0.3, lv[1] + 0.6, 0, 0.5, LS, top=True, bottom=True)
        facade(g, a, b, lv[1] + 0.6, top - 1.5, 4.35, 5.2, Win(w=1.5, sill=0.9, head=3.4, depth=0.22, lit=0.25, pair=2), 'stone', LS,
               margin=1.6, pier=(0.7, 0.12, LSD))
    cornice(g, r, top - 0.6, 0.8, LS, height=1.3)
    parapet(g, r, top - 0.6, 1.0, 0.3, LSD, roof_col=ROOF)
    if not g.lod: roof_clutter(g, r, top - 0.6, seed=7, n=6)
    a, b = edge_facing(r, 0, -1); F = Geo.frame(a, b); L = v2len(v2sub(b, a))
    for uc in (L * 0.28, L * 0.72):
        if not g.lod:
            g.text('neon', F, uc + 1.8, lv[6] + 0.4, 0.3, "Mayfield's", 3.2, RED, depth=0.25)
        star(g, F, uc - 8.4, lv[6] + 2.0, 0.3, 1.8, RED)
    if not g.lod:
        a, b = edge_facing(r, 1, 0); F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        g.fbox('paint', F, L - 3.0, L - 2.2, lv[1] + 2, lv[1] + 22, 0.3, 3.4, C('#f2efe8'), top=True, bottom=True)
        for side in (1, -1):
            FF = (fpt(F, L - 2.6 + 0.45 * side, 1.85), (-F[2][0] * side, -F[2][1] * side), (F[1][0] * side, F[1][1] * side))
            for k, ch in enumerate("MAYFIELD'S"):
                g.text('neon', FF, 0, lv[1] + 20.0 - k * 1.95, 0.0, ch, 1.6, RED, depth=0.12)
    return {'colliders': wall_colliders(r, lv[0] - 6, top), 'name': "Mayfield's", 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ Saks (Post & Powell, rounded corner)
def saks(g):
    r = ring_of(23194); own = {23194}
    yG = sidewalk(995, -1497)
    top = bld(23194)['base'] + 27.0
    GRS = C('#cdb9a6'); GRD = C('#a8927e')
    lv = floor_levels(yG, [6.5] + [4.6] * 4)
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        nt = neighbour_top(a, b, own)
        if nt and nt > top - 2:
            radial_panel(g, 'granite', F, 0, L, lv[0] - 4, top, None, GRD); continue
        storefront(g, a, b, sidewalk, lv[1], 4.6, 'granite', GRD, glass_slot='shop', pier=(0.8, 0.2, GRD), lit=1.0, transom=1.2, frame_col=C('#1c1c1c'))
        g.fbox('granite', F, 0, L, lv[1] - 0.2, lv[1] + 0.45, 0, 0.35, GRD, top=True, bottom=True)
        facade(g, a, b, lv[1] + 0.45, top - 2.2, 4.6, 4.6, Win(w=1.7, sill=1.2, head=3.1, depth=0.35, lit=0.2, sill_out=0), 'granite', GRS, margin=0.9)
        radial_panel(g, 'granite', F, 0, L, top - 2.2, top, None, GRS)
        if L > 30 and not g.lod:
            g.text('gold', F, L / 2, lv[1] + 0.5, 0.4, 'SAXTON  FIFTH  AVENUE', 0.95, C('#161616'), depth=0.08)
    g.sweep('granite', r, [(0, top), (0.35, top), (0.35, top + 0.4), (0, top + 0.4)], GRD)
    parapet(g, r, top + 0.4, 0.7, 0.25, GRS, slot='granite', roof_col=ROOF)
    return {'colliders': wall_colliders(r, lv[0] - 6, top), 'name': 'Saxton Fifth Avenue', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ Neiman Marcus (Stockton & Geary): harlequin granite + glass rotunda
NEIMAN_ROT = (1149.65, -1389.55, 11.0)   # rotunda centre x, z, radius (bulges 0.8 m past both faces)


def neiman(g):
    r = ring_of(23528); own = {23528}
    yG = sidewalk(1140, -1400)
    top = bld(23528)['base'] + 28.0
    PK = C('#e3bdb3'); WH = C('#f5f1ea'); GRD = C('#a8958b')
    rx, rz, rr = NEIMAN_ROT
    lv = floor_levels(yG, [6.2] + [5.0] * 4)
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        nt = neighbour_top(a, b, own)
        if nt and nt > top - 2:
            radial_panel(g, 'granite', F, 0, L, lv[0] - 4, top, None, C('#cfc3bb')); continue
        u0, u1 = 0.0, L
        if v2len(v2sub(a, (rx, rz))) < rr + 2: u0 = _exit_u(a, b, (rx, rz), rr + 0.5)
        if v2len(v2sub(b, (rx, rz))) < rr + 2: u1 = L - _exit_u(b, a, (rx, rz), rr + 0.5)
        if u1 - u0 < 1: continue
        aa, bb = fpt(F, u0), fpt(F, u1)
        storefront(g, aa, bb, sidewalk, lv[1], 5.0, 'granite', GRD, glass_slot='shop', pier=(1.2, 0.3, GRD), lit=1.0, transom=1.6, arch=1, depth=0.5)
        FF = Geo.frame(aa, bb); LL = u1 - u0
        g.fbox('granite', FF, 0, LL, lv[1] - 0.2, lv[1] + 0.5, 0, 0.3, GRD, top=True, bottom=True)
        harlequin(g, FF, 0, LL, lv[1] + 0.5, top - 1.0, 1.9, PK, WH)
        g.fbox('granite', FF, 0, LL, top - 1.0, top, 0, 0.25, GRD, top=True, bottom=True)
    parapet(g, r, top, 0.6, 0.3, C('#cfc3bb'), slot='granite', roof_col=ROOF)
    n = 40 if not g.lod else 16
    g.lathe('clear', rx, rz, [(rr, lv[0] - 2), (rr, top + 3.0)], C('#b8c8cc'), n=n)
    g.lathe('granite', rx, rz, [(rr + 0.6, top + 3.0), (rr + 0.6, top + 4.2), (rr - 1.0, top + 4.2)], GRD, n=n)
    g.lathe('granite', rx, rz, [(rr + 0.5, lv[0] - 2), (rr + 0.5, lv[0] + 0.6), (rr - 0.2, lv[0] + 0.6)], GRD, n=n)
    if not g.lod:
        for k in range(n):
            t = 2 * math.pi * k / n
            FR = ((rx + math.cos(t) * rr, rz + math.sin(t) * rr), (-math.sin(t), math.cos(t)), (math.cos(t), math.sin(t)))
            g.fbox('metal', FR, -0.07, 0.07, lv[0] + 0.6, top + 3.0, 0, 0.35, C('#2b2b2d'), top=False)
        for yy in lv[1:] + [top]:
            g.lathe('metal', rx, rz, [(rr + 0.02, yy - 0.2), (rr + 0.3, yy - 0.2), (rr + 0.3, yy + 0.15), (rr + 0.02, yy + 0.15)], C('#2b2b2d'), n=n)
    g.lathe('win', rx, rz, [(rr - 1.0, top + 4.2), (0.0, top + 7.5)], (0.9, 0.7, 0.4, 1.0), n=n)
    if not g.lod:
        a, b = edge_facing(r, -1, 0); F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        g.text('gold', F, L * 0.62, lv[1] + 0.6, 0.3, 'CITY OF PARIS', 1.1, C('#1a1a1a'), depth=0.08)
    return {'colliders': wall_colliders(r, lv[0] - 6, top), 'name': 'City of Paris', 'yG': round(yG, 2), 'top': round(top + 7, 1)}


# ------------------------------------------------------------------------------------------ Grand Hyatt (345 Stockton) + Ruth Asawa's fountain
def hyatt(g):
    r = ring_of(17166)
    yG = sidewalk(1092, -1580)
    top = bld(17166)['base'] + 94.0
    WC = C('#e3e0d8'); WCD = C('#bdb8ae'); BR = C('#3a3029')
    lv = floor_levels(yG, [6.0, 5.0])
    nfl = int((top - 4 - lv[2]) / 2.95)
    ys, ye = lv[2], lv[2] + nfl * 2.95
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        storefront(g, a, b, sidewalk, lv[1], 4.0, 'concrete', WCD, glass_slot='shop', pier=(0.9, 0.3, WC), lit=0.9, transom=1.5, frame_col=BR)
        facade(g, a, b, lv[1], lv[2], 5.0, 4.0, Win(w=3.4, sill=0.5, head=4.5, depth=0.3, lit=0.6, frame_col=BR), 'concrete', WCD, margin=0.6)
        tfacade(g, a, b, ys, ye, 2.95, 1.5, Win(w=1.2, sill=0.3, head=2.75, depth=0.1, lit=0.5, mull=False, sill_out=0), 'concrete', WC,
                margin=1.2, pier=(0.3, 0.65, WC), flat_h=20)
        radial_panel(g, 'concrete', F, 0, L, ye, top, None, WC)
        if L < 32 and not g.lod:
            g.text('neon', F, L / 2, top - 3.2, 0.1, 'GRAND UNION', 1.8, C('#e8e2d0'), depth=0.15)
    parapet(g, r, top, 0.8, 0.35, WC, slot='concrete', roof_col=ROOF)
    if not g.lod: roof_clutter(g, r, top, seed=11, n=3)
    fx, fz = 1095.5, -1590.0; fy = H(fx, fz) + 0.1
    n = 32 if not g.lod else 12
    g.lathe('granite', fx, fz, [(3.4, fy - 0.5), (3.4, fy + 0.45), (3.0, fy + 0.45), (3.0, fy + 0.1)], C('#8e8a84'), n=n)
    g.lathe('water', fx, fz, [(3.0, fy + 0.3), (0.0, fy + 0.3)], C('#ffffff'), n=n)
    prof = [(2.1, fy + 0.2), (2.25, fy + 0.5), (2.2, fy + 1.2), (2.3, fy + 1.9), (2.1, fy + 2.0), (1.6, fy + 2.05)]
    g.lathe('metal', fx, fz, prof, C('#6a4d2b'), n=n * 2 if not g.lod else n, cap_top=True)
    if not g.lod:
        import random
        R = random.Random(4)
        for k in range(90):
            t = R.random() * 2 * math.pi; y = fy + 0.5 + R.random() * 1.3
            px, pz = fx + math.cos(t) * 2.3, fz + math.sin(t) * 2.3
            s = 0.08 + R.random() * 0.12
            g.box('metal', px - s, px + s, y - s, y + s, pz - s, pz + s, C('#7b5a33'))
    cols = wall_colliders(r, lv[0] - 6, top) + [{'x': fx, 'z': fz, 'hx': 3.2, 'hz': 3.2, 'yaw': 0, 'yMin': fy - 1, 'yMax': fy + 2.1}]
    return {'colliders': cols, 'name': 'Grand Union Hotel', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ Apple Union Square (glass pavilion on Post)
APPLE_H = 13.2


def apple(g):
    r = ring_of(23524)
    ring = ring_out(r)
    yG = sidewalk(1080, -1515)
    top = yG + APPLE_H
    ST = C('#d9d4ca'); WHT = C('#f1f0ec')
    post = edge_facing(r, 0, 1)
    for a, b in ring_edges(r):
        F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        if (a, b) == post:
            g.quad_sub('clear', Geo.fp(F, 0.6, yG - 0.3, -0.25), Geo.fp(F, L - 0.6, yG - 0.3, -0.25), Geo.fp(F, L - 0.6, top - 0.6, -0.25),
                       Geo.fp(F, 0.6, top - 0.6, -0.25), C('#c8d6da'), (F[2][0], 0, F[2][1]), maxe=40)
            g.fbox('stone', F, 0, 0.6, yG - 3, top, -0.6, 0.0, ST, top=True)
            g.fbox('stone', F, L - 0.6, L, yG - 3, top, -0.6, 0.0, ST, top=True)
            for k in range(1, 6):
                u = L * k / 6
                g.fbox('metal', F, u - 0.04, u + 0.04, yG - 0.3, top - 0.6, -0.3, -0.22, C('#8a8c8e'), top=False)
            g.fbox('metal', F, 0.6, L - 0.6, yG - 0.3, yG + 0.05, -0.3, -0.18, C('#8a8c8e'), top=True)
            continue
        if abs(edge_n(a, b)[0]) > 0.9:
            storefront(g, a, b, sidewalk, yG + 5.0, 6.0, 'stone', ST, glass_slot='shop', pier=(1.0, 0.1, ST), lit=0.9, transom=0.6, frame_col=C('#8a8c8e'))
        else:
            radial_panel(g, 'stone', F, 0, L, yG - 3, yG + 5.0, None, ST)
        radial_panel(g, 'stone', F, 0, L, yG + 5.0, top, None, ST)
    rs = ring_offset(ring, 1.2)
    g.prism('paint', rs, top, top + 0.45, WHT, top=True, bottom=True, sub=False)
    g.poly('roof', [(p[0], top + 0.47, p[1]) for p in ring_offset(ring, -0.6)], C('#8d8b86'), (0, 1, 0))
    if not g.lod:
        a, b = post; F = Geo.frame(a, b); L = v2len(v2sub(b, a))
        pts = [(L / 2 + math.cos(2 * math.pi * i / 24) * 0.9, top - 2.6 + math.sin(2 * math.pi * i / 24) * 0.9) for i in range(24)]
        g.poly('lamp', [Geo.fp(F, u, v, -0.05) for u, v in pts], (1.0, 1.0, 1.0, 1.0), (F[2][0], 0, F[2][1]))
    return {'colliders': wall_colliders(r, yG - 4, top + 0.5), 'name': 'Apple Union Square', 'yG': round(yG, 2), 'top': round(top + 1, 1)}


# ------------------------------------------------------------------------------------------ Union Square plaza
def _line_off(name, near, side_pt, off):
    """street centreline near a point, offset toward side_pt by off -> (point, dir)"""
    best = None
    for s in sites()['unionSquare']['streets']:
        if s['name'] != name: continue
        P = s['pts']
        for k in range(len(P) - 1):
            a, b = P[k][:2], P[k + 1][:2]
            m = v2lerp(a, b, 0.5); d = v2len(v2sub(m, near))
            if v2len(v2sub(b, a)) > 3 and (best is None or d < best[0]): best = (d, a, b)
    _, a, b = best
    t = v2norm(v2sub(b, a)); n = (-t[1], t[0])
    if (side_pt[0] - a[0]) * n[0] + (side_pt[1] - a[1]) * n[1] < 0: n = (-n[0], -n[1])
    return (a[0] + n[0] * off, a[1] + n[1] * off), t


def _isect(p, d, q, e):
    den = d[0] * e[1] - d[1] * e[0]
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + d[0] * t, p[1] + d[1] * t)


def plaza_rect():
    c = (1048.0, -1453.0)
    L = {}
    for nm, near in (('Post Street', (1045, -1499)), ('Geary Street', (1048, -1395)), ('Powell Street', (976, -1440)), ('Stockton Street', (1120, -1455))):
        w = {'Post Street': 17.6, 'Geary Street': 14.35, 'Powell Street': 14.35, 'Stockton Street': 9.75}[nm]
        L[nm] = _line_off(nm, near, c, w / 2 + 3.3)
    NW = _isect(*L['Post Street'], *L['Powell Street']); NE = _isect(*L['Post Street'], *L['Stockton Street'])
    SW = _isect(*L['Geary Street'], *L['Powell Street']); SE = _isect(*L['Geary Street'], *L['Stockton Street'])
    return NW, NE, SE, SW


def palm(g, x, z, y, h, seed, lean=(0.0, 0.0)):
    import random
    R = random.Random(seed)
    lod = g.lod
    n = 12 if not lod else 6
    top = (x + lean[0] * h, y + h, z + lean[1] * h)
    # trunk: thick canary palm with leaf-base rings
    rings = 10 if not lod else 3
    for k in range(rings):
        t0, t1 = k / rings, (k + 1) / rings
        r0 = 0.55 - 0.1 * t0 + (0.06 if k % 2 == 0 and not lod else 0); r1 = 0.55 - 0.1 * t1
        cx0, cz0 = x + lean[0] * h * t0, z + lean[1] * h * t0; cx1, cz1 = x + lean[0] * h * t1, z + lean[1] * h * t1
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            P = lambda cx, cz, r, yy, a: (cx + math.cos(a) * r, yy, cz + math.sin(a) * r)
            g.poly('bark', [P(cx0, cz0, r0, y + h * t0, a0), P(cx0, cz0, r0, y + h * t0, a1), P(cx1, cz1, r1, y + h * t1, a1), P(cx1, cz1, r1, y + h * t1, a0)],
                   C('#7b6a52') if k % 2 else C('#6d5c46'), (math.cos((a0 + a1) / 2), 0, math.sin((a0 + a1) / 2)))
    # crown knob
    g.lathe('bark', top[0], top[2], [(0.46, top[1]), (0.62, top[1] + 0.5), (0.4, top[1] + 1.1), (0.0, top[1] + 1.4)], C('#6f6a3a'), n=n)
    nf = 44 if not lod else 12
    segs = 8 if not lod else 3
    for f in range(nf):
        az = f * 2.39996 + R.random() * 0.3
        tier = f / nf
        elev = math.radians(70 - 95 * tier + R.random() * 12)    # upright young fronds on top, drooping old ones below
        Lf = 4.6 + R.random() * 1.2
        base = (top[0], top[1] + 0.9 - tier * 0.6, top[2])
        d = (math.cos(az), math.sin(az))
        pts = []
        for s in range(segs + 1):
            u = s / segs
            e = elev - u * 1.1 * (0.6 + tier)        # arch downward along the frond
            dist = Lf * u
            # integrate a simple arc
            pts.append((base[0] + d[0] * dist * math.cos((elev + e) / 2), base[1] + dist * math.sin((elev + e) / 2), base[2] + d[1] * dist * math.cos((elev + e) / 2)))
        side = (-d[1], d[0])
        col = C('#4d6a2a') if R.random() < 0.7 else C('#5f7a30')
        if tier > 0.85: col = C('#8a7a45')
        for s in range(segs):
            u0, u1 = s / segs, (s + 1) / segs
            w0 = 0.75 * math.sin(math.pi * min(0.98, u0 + 0.06)) ** 0.7; w1 = 0.75 * math.sin(math.pi * min(0.98, u1 + 0.06)) ** 0.7
            A, B = pts[s], pts[s + 1]
            for sg in (-1, 1):
                A2 = (A[0] + side[0] * w0 * sg, A[1] + 0.22 * w0, A[2] + side[1] * w0 * sg)
                B2 = (B[0] + side[0] * w1 * sg, B[1] + 0.22 * w1, B[2] + side[1] * w1 * sg)
                g.poly('leaf', [A, B, B2, A2], col, (0, 1, 0))
    return {'x': round(x, 2), 'z': round(z, 2), 'hx': 0.6, 'hz': 0.6, 'yaw': 0, 'yMin': round(y - 1, 2), 'yMax': round(y + h, 2)}


def dewey(g, x, z, y):
    GR = C('#d2ccc0'); GRD = C('#b3ad a1'.replace(' ', '')); BZ = C('#4f4a3c'); VIC = C('#6b6a4e')
    lod = g.lod
    for s, (hw, h0, h1) in enumerate(((5.2, y - 0.6, y + 0.35), (4.3, y + 0.35, y + 0.75), (3.5, y + 0.75, y + 1.15))):
        g.box('granite', x - hw, x + hw, h0, h1, z - hw, z + hw, GRD if s == 0 else GR)
    g.box('granite', x - 2.6, x + 2.6, y + 1.15, y + 1.7, z - 2.6, z + 2.6, GRD)
    g.box('granite', x - 2.3, x + 2.3, y + 1.7, y + 5.8, z - 2.3, z + 2.3, GR)
    if not lod:
        for ax in range(4):
            a = ax * math.pi / 2; F = ((x + math.cos(a) * 2.3 - math.sin(a) * 1.3, z + math.sin(a) * 2.3 + math.cos(a) * 1.3), (math.sin(a), -math.cos(a)), (math.cos(a), math.sin(a)))
            g.fbox('metal', F, 0.0, 2.6, y + 2.6, y + 4.6, 0, 0.06, BZ, top=True, bottom=True)
    g.box('granite', x - 2.6, x + 2.6, y + 5.8, y + 6.5, z - 2.6, z + 2.6, GRD)
    g.box('granite', x - 1.9, x + 1.9, y + 6.5, y + 7.4, z - 1.9, z + 1.9, GR)
    y0 = y + 7.4
    g.lathe('granite', x, z, [(1.55, y0), (1.55, y0 + 0.25), (1.35, y0 + 0.45), (1.42, y0 + 0.6), (1.2, y0 + 0.8)], GR, n=32 if not lod else 12)
    # fluted shaft
    ys, ye = y0 + 0.8, y0 + 18.6
    nfl = 24 if not lod else 0
    if nfl:
        for i in range(nfl * 2):
            a0, a1 = math.pi * i / nfl, math.pi * (i + 1) / nfl
            for k in range(6):
                t0, t1 = k / 6, (k + 1) / 6
                r0 = 1.12 - 0.16 * t0; r1 = 1.12 - 0.16 * t1
                d = 0.94 if i % 2 else 1.0
                P = lambda r, yy, a: (x + math.cos(a) * r, yy, z + math.sin(a) * r)
                g.poly('granite', [P(r0 * d, ys + (ye - ys) * t0, a0), P(r0 * d, ys + (ye - ys) * t0, a1), P(r1 * d, ys + (ye - ys) * t1, a1), P(r1 * d, ys + (ye - ys) * t1, a0)], GR,
                       (math.cos((a0 + a1) / 2), 0, math.sin((a0 + a1) / 2)))
    else:
        g.cyl('granite', x, z, 1.12, ys, ye, GR, n=12, r1=0.96)
    # Corinthian capital: bell + two rows of leaf lobes + abacus
    g.lathe('granite', x, z, [(0.98, ye), (1.05, ye + 0.3), (1.25, ye + 1.2), (1.55, ye + 1.8)], GR, n=32 if not lod else 12)
    if not lod:
        for row, (yy, rr) in enumerate(((ye + 0.25, 1.1), (ye + 0.8, 1.3))):
            for i in range(8):
                a = 2 * math.pi * (i + 0.5 * row) / 8
                cx, cz = x + math.cos(a) * rr, z + math.sin(a) * rr
                g.poly('granite', [(cx - math.sin(a) * 0.3, yy, cz + math.cos(a) * 0.3), (cx + math.sin(a) * 0.3, yy, cz - math.cos(a) * 0.3),
                                   (cx + math.cos(a) * 0.35, yy + 0.8, cz + math.sin(a) * 0.35)], GR, (math.cos(a), 0.3, math.sin(a)))
    g.box('granite', x - 1.75, x + 1.75, ye + 1.8, ye + 2.25, z - 1.75, z + 1.75, GR)
    g.lathe('granite', x, z, [(0.9, ye + 2.25), (0.9, ye + 3.0), (1.05, ye + 3.15), (0.0, ye + 3.15)], GR, n=24 if not lod else 8)
    # Victory: gown, torso, head, wings, wreath held high, trident
    vy = ye + 3.15
    g.lathe('metal', x, z, [(0.7, vy), (0.62, vy + 1.2), (0.42, vy + 2.2), (0.3, vy + 2.9), (0.22, vy + 3.1), (0.0, vy + 3.12)], VIC, n=16 if not lod else 8)
    g.lathe('metal', x, z, [(0.0, vy + 3.1), (0.18, vy + 3.2), (0.2, vy + 3.4), (0.14, vy + 3.58), (0.0, vy + 3.64)], VIC, n=12 if not lod else 6)
    for sg in (-1, 1):
        w0 = (x + sg * 0.15, vy + 2.7, z + 0.2); w1 = (x + sg * 1.5, vy + 3.9, z + 0.55); w2 = (x + sg * 1.9, vy + 2.9, z + 0.7); w3 = (x + sg * 0.5, vy + 1.8, z + 0.35)
        g.poly('metal', [w0, w1, w2, w3], VIC, (0, 0, 1)); g.poly('metal', [w0, w1, w2, w3], VIC, (0, 0, -1))
    g.rod('metal', (x + 0.25, vy + 2.8, z - 0.1), (x + 0.45, vy + 4.5, z - 0.2), 0.07, VIC)
    g.lathe('metal', x + 0.47, z - 0.2, [(0.32, vy + 4.55), (0.38, vy + 4.62), (0.32, vy + 4.69), (0.26, vy + 4.62), (0.32, vy + 4.55)], VIC, n=12)
    g.rod('metal', (x - 0.3, vy + 0.4, z - 0.25), (x - 0.35, vy + 4.3, z - 0.25), 0.04, VIC)
    for k in (-1, 0, 1):
        g.rod('metal', (x - 0.35 + k * 0.12, vy + 4.2, z - 0.25), (x - 0.35 + k * 0.14, vy + 4.65, z - 0.25), 0.025, VIC, n=4)
    return [{'x': x, 'z': z, 'hx': 5.2, 'hz': 5.2, 'yaw': 0, 'yMin': y - 1, 'yMax': y + 1.15}, {'x': x, 'z': z, 'hx': 2.6, 'hz': 2.6, 'yaw': 0, 'yMin': y, 'yMax': ye + 3}]


def heart(g, x, z, y, yaw, col, size=2.0):
    pts = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        hx = 16 * math.sin(t) ** 3; hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((hx / 17 * size / 2, (hy + 17) / 30 * size))
    t = (math.cos(yaw), -math.sin(yaw)); n = (-t[1], t[0])
    F = ((x, z), t, n)
    g.box('granite', x - 0.8, x + 0.8, y - 0.3, y + 0.5, z - 0.8, z + 0.8, C('#9a958d'), yaw=yaw)
    for w, sgn in ((0.35, 1), (-0.35, -1)):
        g.poly('paint', [Geo.fp(F, u, y + 0.5 + v, w) for u, v in pts], col, (n[0] * sgn, 0, n[1] * sgn))
    for i in range(40):
        (u0, v0), (u1, v1) = pts[i], pts[(i + 1) % 40]
        mu, mv = (u0 + u1) / 2, (v0 + v1) / 2 - size * 0.5
        g.poly('paint', [Geo.fp(F, u0, y + 0.5 + v0, 0.35), Geo.fp(F, u1, y + 0.5 + v1, 0.35), Geo.fp(F, u1, y + 0.5 + v1, -0.35), Geo.fp(F, u0, y + 0.5 + v0, -0.35)],
               shade(col, 0.85), (t[0] * mu, mv, t[1] * mu))


def canopy(g, ring, y, h, col=None):
    """glass-and-steel pavilion canopy over an OSM 'roof' footprint"""
    r = ring_out(ring_simplify(ring, 0.25))
    c = centroid(r)
    for p in r[::max(1, len(r) // 4)]:
        q = v2lerp(p, c, 0.12)
        g.cyl('metal', q[0], q[1], 0.09, H(*q) - 0.3, y + h, C('#3c3f42'), n=8)
    g.prism('metal', ring_offset(r, 0.4), y + h, y + h + 0.25, C('#3c3f42'), top=False, bottom=True, sub=False)
    g.poly('glassc', [(p[0], y + h + 0.3, p[1]) for p in ring_offset(r, 0.4)], C('#b9c7cc'), (0, 1, 0))
    # small kiosk under it
    k = ring_offset(r, -1.2)
    if abs(ring_area(k)) > 6:
        g.prism('shop', k, y - 0.2, y + 2.6, (1.0, 0.85, 0.65, 1.0), top=False, sub=False)
        g.prism('metal', k, y + 2.6, y + 2.8, C('#3c3f42'), top=True, sub=False)


def union_square(g):
    NW, NE, SE, SW = plaza_rect()
    yp = 23.55
    # local frame: u west->east (0..1), v north->south (0..1)
    def P(u, v):
        top, bot = v2lerp(NW, NE, u), v2lerp(SW, SE, u); return v2lerp(top, bot, v)
    UP, VP = 0.83, 0.70       # plateau extent
    def design(u, v):
        """designed walking height: plateau, then linear steps down to the Geary / Stockton sidewalks"""
        yy = yp
        if v > VP:
            x, z = P(u, 1.0); yb = H(x, z) + 0.15
            yy = min(yy, yp + (yb - yp) * (v - VP) / (1 - VP))
        if u > UP:
            x, z = P(1.0, v); yb = H(x, z) + 0.15
            yy = min(yy, yp + (yb - yp) * (u - UP) / (1 - UP))
        return yy
    Lu, Lv = v2len(v2sub(NE, NW)), v2len(v2sub(SW, NW))
    nu, nv = int(Lu / (1.5 if not g.lod else 4)), int(Lv / (1.5 if not g.lod else 4))
    PAV = C('#c2bdb3'); PAVD = C('#8f8a82'); STEP = C('#b0aba1')
    mc = P(0.42, 0.36)
    for j in range(nv):
        for i in range(nu):
            u0, u1, v0, v1 = i / nu, (i + 1) / nu, j / nv, (j + 1) / nv
            pts = []
            for (u, v) in ((u0, v0), (u1, v0), (u1, v1), (u0, v1)):
                x, z = P(u, v); pts.append((x, max(H(x, z) + 0.05, design(u, v) + 0.02), z))
            cx, cz = P((u0 + u1) / 2, (v0 + v1) / 2)
            du, dv = ((u0 + u1) / 2) * Lu, ((v0 + v1) / 2) * Lv
            band = (du % 9.0) < 1.6 or (dv % 9.0) < 1.6
            ring = abs(math.hypot(cx - mc[0], cz - mc[1]) - 11.0) < 0.9
            onstep = (v0 >= VP or u0 >= UP)
            col = STEP if onstep else (PAVD if (band or ring) else PAV)
            g.poly('paving', pts, col, (0, 1, 0))
    # step risers (visual) across the Geary + Stockton terraces
    if not g.lod:
        for (a0, b0, fixed, axis) in ((0.0, UP, None, 'v'), (0.0, VP, None, 'u')):
            pass
        ns = 22
        for k in range(ns):
            v = VP + (1 - VP) * k / ns
            for i in range(nu):
                u0, u1 = i / nu, (i + 1) / nu
                if u0 >= UP: continue
                (x0, z0), (x1, z1) = P(u0, v), P(u1, v)
                y0 = design(u0, v); y1 = design(u0, v + (1 - VP) / ns)
                if y0 - y1 < 0.05 or H(x0, z0) > y0 - 0.1: continue
                g.poly('granite', [(x0, y1, z0), (x1, y1, z1), (x1, y0 + 0.02, z1), (x0, y0 + 0.02, z0)], STEP, (0, 0, 1))
        for k in range(ns):
            u = UP + (1 - UP) * k / ns
            for j in range(nv):
                v0, v1 = j / nv, (j + 1) / nv
                (x0, z0), (x1, z1) = P(u, v0), P(u, v1)
                y0 = design(u, v0); y1 = design(u + (1 - UP) / ns, v0)
                if y0 - y1 < 0.05 or H(x0, z0) > y0 - 0.1: continue
                g.poly('granite', [(x0, y1, z0), (x1, y1, z1), (x1, y0 + 0.02, z1), (x0, y0 + 0.02, z0)], STEP, (1, 0, 0))
    cols = []
    # Dewey monument at the centre of the plaza
    cols += dewey(g, mc[0], mc[1], yp + 0.02)
    # palms: Post St row, Powell row, Stockton row, Geary terrace row
    pos = [(u, 0.07) for u in (0.08, 0.2, 0.32, 0.58, 0.7, 0.82)] + [(0.05, v) for v in (0.22, 0.38, 0.54)] + \
          [(0.8, v) for v in (0.18, 0.34, 0.5)] + [(u, 0.66) for u in (0.12, 0.26, 0.58, 0.72)]
    import random
    R = random.Random(21)
    for k, (u, v) in enumerate(pos):
        x, z = P(u, v); y = max(H(x, z), design(u, v))
        cols.append(palm(g, x, z, y, 10.5 + R.random() * 3.5, 100 + k, (R.uniform(-0.02, 0.02), R.uniform(-0.02, 0.02))))
        g.box('granite', x - 1.1, x + 1.1, y - 0.2, y + 0.12, z - 1.1, z + 1.1, PAVD)
    # lamp posts around the plateau
    for k in range(14):
        t = k / 14
        u, v = (t * 4 * UP, 0.03) if t < 0.25 else (UP - 0.03, (t - 0.25) * 4 * VP) if t < 0.5 else (UP - (t - 0.5) * 4 * UP, VP - 0.03) if t < 0.75 else (0.03, VP - (t - 0.75) * 4 * VP)
        x, z = P(u, v); y = design(u, v)
        g.cyl('metal', x, z, 0.09, y, y + 4.2, C('#2c2e30'), n=8)
        g.lathe('lamp', x, z, [(0.0, y + 4.2), (0.28, y + 4.35), (0.3, y + 4.6), (0.2, y + 4.85), (0.0, y + 4.9)], (1.0, 0.86, 0.62, 1.0), n=10 if not g.lod else 5)
        cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 0.15, 'hz': 0.15, 'yaw': 0, 'yMin': y, 'yMax': y + 4.5})
    # benches (granite blocks) facing the monument
    if not g.lod:
        for k in range(8):
            a = 2 * math.pi * k / 8 + 0.39
            x, z = mc[0] + math.cos(a) * 15.5, mc[1] + math.sin(a) * 15.5
            g.box('granite', x - 1.6, x + 1.6, yp, yp + 0.45, z - 0.35, z + 0.35, C('#a8a399'), yaw=-a + math.pi / 2)
    # hearts (Powell / Geary corner) + pavilions + the garage head-house
    for (u, v, cc, yw) in ((0.07, 0.86, C('#c8202e'), 0.9), (0.9, 0.9, C('#e0467a'), -0.6)):
        x, z = P(u, v); heart(g, x, z, max(H(x, z), design(u, v)), yw, cc)
    for i in (23533, 23531, 23532, 23391, 23392):
        r = ring_of(i); c = centroid(r); y = max(H(*c), yp if point_in([NW, NE, SE, SW], *c) else H(*c))
        canopy(g, r, y, 3.3)
    hh = ring_of(23534); c = centroid(hh)
    g.prism('clear', hh, H(*c) - 0.5, H(*c) + 3.2, C('#c0ccd0'), top=False, sub=False)
    g.prism('metal', hh, H(*c) + 3.2, H(*c) + 3.5, C('#3c3f42'), top=True, sub=False)
    decks = []
    # physics: plateau deck + terrace ramps (terrain2 decks: segment + width)
    a = P(0.0, VP / 2); b = P(UP, VP / 2)
    decks.append({'pts': [[a[0], a[1], yp], [b[0], b[1], yp]], 'width': round(Lv * VP, 2)})
    for i in range(4):
        u = (i + 0.5) / 4 * UP; top_ = P(u, VP); bot = P(u, 1.0)
        decks.append({'pts': [[top_[0], top_[1], yp], [bot[0], bot[1], design(u, 1.0)]], 'width': round(Lu * UP / 4, 2)})
    for i in range(3):
        v = (i + 0.5) / 3 * VP; l = P(UP, v); r_ = P(1.0, v)
        decks.append({'pts': [[l[0], l[1], yp], [r_[0], r_[1], design(1.0, v)]], 'width': round(Lv * VP / 3, 2)})
    hide = [23533, 23531, 23532, 23391, 23392, 23534, 23459, 23460]
    return {'colliders': cols, 'decks': decks, 'name': 'Union Square', 'replaces': 'unionSquare', 'top': 40}


# ------------------------------------------------------------------------------------------ registry
BUILDERS = {
    'stFrancis': (st_francis, [23428, 23431, 23423, 23429, 23430]),
    'jwMarriott': (marriott, [23241, 23427]),
    'macys': (macys, [23440]),
    'saks': (saks, [23194]),
    'neiman': (neiman, [23528]),
    'grandHyatt': (hyatt, [17166]),
    'apple': (apple, [23524]),
    'unionSquare': (union_square, [23533, 23531, 23532, 23391, 23392, 23534, 23459, 23460]),
}


def main():
    ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = origin_for([ring_of(i) for i in hide])
        run_building(bid, fn, hide, O)


if __name__ == '__main__':
    main()
