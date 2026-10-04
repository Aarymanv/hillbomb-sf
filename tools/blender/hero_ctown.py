"""HILLBOMB Chinatown hero set: Grant Avenue (Bush .. Broadway) + Washington / Clay / Sacramento / Jackson (one block each
side of Grant) + Waverly Place, hand-built per OSM footprint and baked per city block.

Run (Blender python):  tools/.venv-blender/Scripts/python.exe tools/blender/hero_ctown.py -- [ct_w3 ct_e4 ...|all] [--nobake]
                       [--res 2048] [--spp 256]
  1. python tools/blender/ct_plan.py   (footprints -> blocks, tools/blender/_cache/hero/ct_plan.json)
  2. python tools/blender/ct_signs.py  (sign + shop-interior atlases, public/assets/landmarks/ct/)
  3. this script: per block site ct_<w|e><seg>: LOD0 / LOD1 GLBs (vertex AO), lightmaps (day sky visibility + night
     emitters, OIDN denoised), _cache/hero/<id>.json; then python tools/blender/hero_int_pack.py-style BC1 packing
     (ct_pack.py) and hero_index.py.
Blocks: side w/e of Grant x segment between two cross streets (Bush, Pine, California, Sacramento, Clay, Washington,
Jackson, Pacific, Broadway). Lantern strings across the hero streets belong to the block west / south of them.
Slots (src/world/landmarks/v2/hero_mats.js + ctown_mats.js): lightmapped walls = LM_SLOTS; emissive = sign (atlas),
shopint (atlas), lantern, win, curtain, neon; details 'd_<slot>' (no lightmap texels: lit at night from the zone
ground light map in the shader). All names / signs fictional.
"""
import sys, os, math, json, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_lib import *   # noqa
import hero_lib
from hero_wave1 import ring_edges, neighbour_top, sidewalk, ground_min, ROOF   # noqa

PLAN = json.load(open(os.path.join(CACHE, 'ct_plan.json')))
PB = {int(k): v for k, v in PLAN['buildings'].items()}
SEGS = PLAN['segs']
PLAN_CROSS = ['Bush Street', 'Pine Street', 'California Street', 'Sacramento Street', 'Clay Street', 'Washington Street',
              'Jackson Street', 'Pacific Avenue', 'Broadway']
ALLIDS = set(PB.keys())

LM_SLOTS = {'brickred', 'brick', 'stucco', 'stone', 'roof', 'rooftile', 'metal', 'concrete', 'paint', 'ground'}
EMIT = {'cwin': 1.2, 'sign': 7.0, 'shopint': 4.0, 'lantern': 14.0, 'win': 1.6, 'curtain': 1.1, 'neon': 10.0, 'lamp': 150.0}

# ---------------------------------------------------------------------------------------------- palette
C_ = C
BRICK_T = [C_('#9a5440'), C_('#88463a'), C_('#94604a'), C_('#7c4236'), C_('#a0644c'), C_('#704034')]       # tints on the brick_red texture
TAN_T = [C_('#d8c2a0'), C_('#cdb08a'), C_('#e0cfb0')]
PAINTS = [C_('#d8ccb0'), C_('#a9c2ab'), C_('#d6c483'), C_('#cf9a82'), C_('#dcd8cc'), C_('#9fb0bc'), C_('#97a882'),
          C_('#d4b4ae'), C_('#c4a676'), C_('#bfc9bb'), C_('#d9bf96')]
JADE = C_('#2e6e4c'); JADE_L = C_('#3f8a62'); CRED = C_('#a8282a'); CGOLD = C_('#d0a23e'); DARK = C_('#1d1b1a')
TRIMS = [JADE, CRED, C_('#2a2a2c'), C_('#f0ece2'), C_('#7a2b22'), CGOLD]
AWN = [(CRED, C_('#f2ede4')), (JADE, C_('#f2ede4')), (C_('#c8352e'), None), (JADE, None), (C_('#e8b830'), CRED),
       (C_('#1f3f7a'), C_('#f2ede4')), (C_('#7d1e25'), None), (C_('#d26a26'), C_('#f2ede4'))]
CURT = [C_('#e8d8b0'), C_('#d06a5a'), C_('#9cc0a8'), C_('#f0e6d0'), C_('#c8a0d8'), C_('#e8c070'), C_('#a8b8e0')]
LANT = (1.0, 0.075, 0.03, 1.0)      # lantern emission tint (saturated red; runtime keeps it below the ACES white point)

SIGN_KIND = [4, 4, 0, 2, 1, 2, 4, 7, 3, 0, 5, 4, 6, 0, 2, 3, 4, 4, 3, 0, 4, 6, 2, 4]   # sign k -> shop atlas cell


def rr(*keys):
    h = 2166136261
    for k in keys:
        for ch in str(k): h = ((h ^ ord(ch)) * 16777619) & 0xffffffff
    return random.Random(h)


def sign_uv(k, u0=0.0, u1=1.0):
    c, r = k % 2, k // 2
    a0, a1 = c * 0.5 + 0.002, (c + 1) * 0.5 - 0.002
    ua, ub = a0 + (a1 - a0) * u0, a0 + (a1 - a0) * u1
    v1 = 1.0 - r * 128 / 2048 - 0.001; v0 = 1.0 - (r + 1) * 128 / 2048 + 0.001
    return [(ua, v0), (ub, v0), (ub, v1), (ua, v1)]


def blade_uv(k):
    a0, a1 = k * 128 / 2048 + 0.001, (k + 1) * 128 / 2048 - 0.001
    v1 = 1.0 - 1536 / 2048 - 0.001; v0 = 0.001
    return [(a0, v0), (a1, v0), (a1, v1), (a0, v1)]


def shop_uv(k, x0=0.0, x1=1.0, y0=0.0, y1=1.0):
    """shop atlas cell k (4 x 2 of 512 px), sub-rect x0..x1 (left->right), y0..y1 (bottom->top of the cell)"""
    c, r = k % 4, k // 4
    ua, ub = (c + 0.01 + 0.98 * x0) / 4, (c + 0.01 + 0.98 * x1) / 4
    vb = 1.0 - (r + 1) / 2 + 0.005; vt = 1.0 - r / 2 - 0.005
    va, vc = vb + (vt - vb) * y0, vb + (vt - vb) * y1
    return [(ua, va), (ub, va), (ub, vc), (ua, vc)]


# ---------------------------------------------------------------------------------------------- street lookup
def seg_dist(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1e-9
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2))
    q = (a[0] + dx * t, a[1] + dz * t); L = math.sqrt(L2)
    return math.hypot(p[0] - q[0], p[1] - q[1]), q, (dx / L, dz / L)


def front_of(a, b):
    """hero street faced by the out-ring edge a->b (dict of the segment) or None"""
    L = v2len(v2sub(b, a))
    if L < 1.2: return None
    t = v2norm(v2sub(b, a)); n = (-t[1], t[0]); m = v2lerp(a, b, 0.5)
    best = None
    for s in SEGS:
        d, q, sd = seg_dist(m, s['a'], s['b'])
        if d > s['w'] / 2 + s['sw'] + 2.5: continue
        if abs(t[0] * sd[0] + t[1] * sd[1]) < 0.86: continue
        if (q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1] <= 0: continue
        if best is None or d < best[0]: best = (d, s)
    return best[1] if best else None


# ---------------------------------------------------------------------------------------------- building style
def style_of(i, fronts):
    R = rr('style', i)
    streets = {f['name'] for f in fronts}
    grant = 'Grant Avenue' in streets; waverly = 'Waverly Place' in streets
    k = R.random()
    kind = ('brick' if k < (0.6 if grant else 0.68) else 'tan' if k < (0.78 if grant else 0.84) else 'paint')     # (round 2: the concept is brick)
    if waverly: kind = 'paint' if R.random() < 0.5 else 'brick'
    s = {'kind': kind, 'grant': grant, 'waverly': waverly}
    if kind == 'brick': s['slot'], s['col'] = 'brickred', R.choice(BRICK_T)
    elif kind == 'tan': s['slot'], s['col'] = 'brick', R.choice(TAN_T)
    else: s['slot'], s['col'] = 'stucco', R.choice(PAINTS)
    s['trim'] = R.choice(TRIMS) if kind == 'paint' else R.choice([C_('#e6dcc6'), C_('#5a4a40'), DARK, JADE])
    s['shop_col'] = R.choice([C_('#3a1f18'), JADE, CRED, DARK, C_('#e2d6bc'), C_('#6a1a1a')])
    s['arch'] = 2 if kind != 'paint' and R.random() < 0.45 else 0
    s['ww'] = R.choice([1.05, 1.15, 1.25, 1.35])
    s['pair'] = R.random() < 0.35
    s['bay'] = R.choice([2.6, 2.9, 3.2])
    s['baywin'] = kind == 'paint' and R.random() < (0.45 if not grant else 0.3)
    s['fire'] = (kind != 'paint' and R.random() < 0.7) or R.random() < 0.18
    s['balcony'] = 'ornate' if waverly and R.random() < 0.85 else ('plain' if (grant and R.random() < 0.3) else None)
    s['bal_col'] = R.choice([JADE, CRED, CGOLD, C_('#1f5a8a'), DARK])
    s['cornice'] = 'pagoda' if (grant or waverly) and R.random() < 0.24 else ('metal' if R.random() < 0.6 else 'plain')
    s['frame'] = R.choice([C_('#f0ece2'), DARK, JADE, C_('#7a2b22'), C_('#c8c0b0')])
    s['lit'] = 0.42 + R.random() * 0.25
    s['awn'] = R.random()
    s['awn_c'] = R.choice(AWN)
    s['blade'] = R.random() < (0.85 if grant else 0.55)
    s['lrow'] = R.random() < (0.8 if grant else 0.55)
    s['urow'] = R.random() < (0.92 if grant else 0.6)
    s['urow3'] = R.random() < 0.75
    s['bands'] = kind == 'paint' and R.random() < 0.5
    s['laundry'] = (not grant) and R.random() < 0.35
    return s


# ---------------------------------------------------------------------------------------------- elements
GLOW = []     # lantern centres of the LOD0 build (runtime rain-haze halos, hero_lm.js)


def lantern(g, x, y, z, r=0.24, h=0.44, n=None):
    """red paper lantern hanging with its top at y (emissive 'lantern' + gold caps)"""
    yc = y - 0.05 - h / 2
    if not g.lod and r > 0.15: GLOW.append((round(x, 2), round(yc, 2), round(z, 2)))
    if g.lod:
        g.lathe('lantern', x, z, [(0.0, yc - h / 2), (r, yc), (0.0, yc + h / 2)], LANT, n=4)
        return
    n = n or 10
    prof = [(r * 0.38, yc - h / 2), (r * 0.82, yc - h * 0.36), (r, yc - h * 0.1), (r, yc + h * 0.1), (r * 0.82, yc + h * 0.36), (r * 0.38, yc + h / 2)]
    g.lathe('lantern', x, z, prof, LANT, n=n)
    g.lathe('d_gold', x, z, [(r * 0.42, yc + h / 2 - 0.01), (r * 0.42, yc + h / 2 + 0.05), (0.0, yc + h / 2 + 0.05)], CGOLD, n=6)
    g.lathe('d_gold', x, z, [(0.0, yc - h / 2 - 0.05), (r * 0.42, yc - h / 2 - 0.05), (r * 0.42, yc - h / 2 + 0.01)], CGOLD, n=6)
    g.lathe('d_fabric', x, z, [(0.035, yc - h / 2 - 0.05), (0.05, yc - h / 2 - 0.32), (0.0, yc - h / 2 - 0.33)], C_('#c81e1e'), n=4)


def catenary(p, q, sag, n=12):
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + (q[2] - p[2]) * t))
    return pts


def lantern_string(g, p, q, sag, gap=1.1, r=0.24, seed=0):
    pts = catenary(p, q, sag, 12 if not g.lod else 4)
    if not g.lod:
        for a, b in zip(pts[:-1], pts[1:]): g.rod('d_metal', a, b, 0.012, DARK, n=3)
    L = math.dist(p, q); nl = max(1, int(L / gap) - 1)
    R = rr('ls', seed)
    for k in range(1, nl + 1):
        t = k / (nl + 1)
        x = p[0] + (q[0] - p[0]) * t; z = p[2] + (q[2] - p[2]) * t; y = p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t)
        rk = r * (0.85 + 0.3 * R.random())
        lantern(g, x, y - 0.06, z, rk, rk * 1.8)


def shop_bay(g, F, u0, u1, ybot, yhead, ytop, s, R, kind, wall_slot, wall_col, ylow):
    """one recessed shop bay: opening u0..u1 from the sidewalk to yhead, lit interior box behind clear glass"""
    w = u1 - u0; uc = (u0 + u1) / 2; D0 = 0.28
    hole = [(u0, ybot), (u1, ybot), (u1, yhead), (u0, yhead)]
    if g.lod:
        g.poly('shopint', [Geo.fp(F, u, v, -0.05) for u, v in hole], (1, 1, 1, 1), (F[2][0], 0, F[2][1]), uv=shop_uv(kind, 0.1, 0.9, 0.05, 0.85))
        return
    fc = s['shop_col']
    # reveals (frame colour) + clear glass
    recess(g, F, hole, D0, 'd_metal', fc, 'clear', (1, 1, 1, 1))
    # interior box (atlas): back wall, side walls, floor, ceiling
    D = 2.6 + R.random() * 0.8; wb = -(D0 + D)
    P = lambda u, y, ww: Geo.fp(F, u, y, ww)
    N = (F[2][0], 0, F[2][1]); T = (F[1][0], 0, F[1][1])
    yc = yhead + 0.35
    g.poly('shopint', [P(u0, ybot, wb), P(u1, ybot, wb), P(u1, yc, wb), P(u0, yc, wb)], (1, 1, 1, 1), N, uv=shop_uv(kind, 0.0, 1.0, 0.0, 0.92))
    g.poly('shopint', [P(u0, ybot, -D0), P(u0, ybot, wb), P(u0, yc, wb), P(u0, yc, -D0)], (0.85, 0.85, 0.85, 1), T, uv=shop_uv(kind, 0.0, 0.3, 0.0, 0.92))
    g.poly('shopint', [P(u1, ybot, wb), P(u1, ybot, -D0), P(u1, yc, -D0), P(u1, yc, wb)], (0.85, 0.85, 0.85, 1), (-T[0], 0, -T[2]), uv=shop_uv(kind, 0.7, 1.0, 0.0, 0.92))
    g.poly('shopint', [P(u0, ybot + 0.01, -D0), P(u1, ybot + 0.01, -D0), P(u1, ybot + 0.01, wb), P(u0, ybot + 0.01, wb)], (0.7, 0.7, 0.7, 1), (0, 1, 0), uv=shop_uv(kind, 0.1, 0.9, 0.0, 0.1))
    g.poly('shopint', [P(u0, yc, -D0), P(u1, yc, -D0), P(u1, yc, wb), P(u0, yc, wb)], (1, 1, 1, 1), (0, -1, 0), uv=shop_uv(kind, 0.0, 1.0, 0.93, 1.0))
    # mullions, transom, kick plate, door
    ytr = yhead - 0.75
    g.fbox('d_metal', F, u0, u1, ytr - 0.05, ytr + 0.05, -D0, -D0 + 0.07, fc, top=True, bottom=True)
    g.fbox('d_metal', F, u0, u1, ybot, ybot + 0.4, -D0, -D0 + 0.06, fc, top=True)
    nm = max(1, int(w / 1.6))
    for m in range(1, nm + 1):
        um = u0 + w * m / (nm + 1)
        g.fbox('d_metal', F, um - 0.035, um + 0.035, ybot, ytr, -D0, -D0 + 0.06, fc, top=False)
    # roll-up grille housing; some grilles half down, a few shops shut
    g.fbox('d_metal', F, u0 - 0.06, u1 + 0.06, yhead + 0.02, yhead + 0.36, 0, 0.26, shade(C_('#8a8c88'), 0.9), top=True, bottom=True)
    rg = R.random()
    if rg < 0.2:
        yb = yhead - (0.35 + R.random() * 1.2) if rg < 0.15 else ybot
        g.poly('grille', [P(u0, yb, 0.08), P(u1, yb, 0.08), P(u1, yhead + 0.02, 0.08), P(u0, yhead + 0.02, 0.08)], (0.75, 0.76, 0.74, 1), N,
               uv=[(0, yb), (w, yb), (w, yhead), (0, yhead)])
        g.fbox('d_metal', F, u0, u1, yb - 0.05, yb, 0.02, 0.12, DARK, top=True, bottom=True)


def goods(g, F, u0, u1, ybot, kind, R):
    """sidewalk displays: produce crates on tables (grocery), souvenir racks (gifts)"""
    if g.lod: return
    if kind == 0:
        w0, w1 = 0.25, 1.35
        g.fbox('d_wood', F, u0, u1, ybot + 0.62, ybot + 0.72, w0, w1, C_('#6e5136'), top=True, bottom=True)
        for uu in (u0 + 0.1, u1 - 0.1):
            for ww in (w0 + 0.1, w1 - 0.1): g.fbox('d_wood', F, uu - 0.04, uu + 0.04, ybot, ybot + 0.62, ww - 0.04, ww + 0.04, C_('#5a422c'), top=False)
        PROD = [C_('#e8742a'), C_('#4f9a2e'), C_('#d8282a'), C_('#f2c83a'), C_('#7aa83a'), C_('#9a3a6a'), C_('#e8e0c8')]
        u = u0 + 0.05
        while u < u1 - 0.4:
            cw = 0.4 + R.random() * 0.15
            for ww0, ww1 in ((w0 + 0.05, w0 + 0.5), (w0 + 0.55, w1 - 0.05)):
                g.fbox('d_wood', F, u, u + cw - 0.04, ybot + 0.72, ybot + 0.92 + (0.12 if ww0 > w0 + 0.3 else 0), ww0, ww1, C_('#b8925e'), top=False)
                yt = ybot + 0.9 + (0.12 if ww0 > w0 + 0.3 else 0)
                g.fbox('d_paint', F, u + 0.03, u + cw - 0.07, yt - 0.06, yt + 0.02, ww0 + 0.03, ww1 - 0.03, R.choice(PROD), top=True, sides=False)
            u += cw
    elif kind == 3:
        for k in range(max(1, int((u1 - u0) / 1.4))):
            uc = u0 + 0.7 + k * 1.4
            if uc > u1 - 0.3: break
            g.fbox('d_metal', F, uc - 0.5, uc + 0.5, ybot + 1.75, ybot + 1.8, 0.4, 0.45, DARK)
            for uu in (uc - 0.5, uc + 0.48): g.fbox('d_metal', F, uu, uu + 0.03, ybot, ybot + 1.8, 0.4, 0.45, DARK, top=False)
            for j in range(6):
                c = R.choice([CRED, CGOLD, C_('#2a6ab0'), C_('#e8e0d0'), JADE, C_('#d04a8a')])
                ua = uc - 0.45 + j * 0.16
                g.fbox('d_paint', F, ua, ua + 0.13, ybot + 0.9 + R.random() * 0.3, ybot + 1.7, 0.36, 0.42, c, top=True)


def awning(g, F, u0, u1, ytop, s, R, depth=1.35, drop=0.62):
    c1, c2 = s['awn_c']
    n = max(1, int((u1 - u0) / 0.34)) if c2 else 1
    sw = (u1 - u0) / n
    for k in range(n):
        c = c1 if (k % 2 == 0 or not c2) else c2
        a, b = u0 + k * sw, u0 + (k + 1) * sw
        P = lambda u, y, w: Geo.fp(F, u, y, w)
        sl = 'd_fabric'
        g.poly(sl, [P(a, ytop, 0.03), P(b, ytop, 0.03), P(b, ytop - drop, depth), P(a, ytop - drop, depth)], c, (F[2][0], 1, F[2][1]))
        g.poly(sl, [P(a, ytop - drop, depth), P(b, ytop - drop, depth), P(b, ytop - drop - 0.26, depth), P(a, ytop - drop - 0.26, depth)], c, (F[2][0], 0, F[2][1]))
    if not g.lod:   # end gussets
        for u in (u0, u1):
            g.poly('d_fabric', [Geo.fp(F, u, ytop, 0.03), Geo.fp(F, u, ytop - drop, depth), Geo.fp(F, u, ytop - drop - 0.26, depth), Geo.fp(F, u, ytop - 0.3, 0.03)], c1, (F[1][0], 0, F[1][1]))


NEONC = {'red': (1.0, 0.1, 0.06, 1), 'green': (0.12, 1.0, 0.35, 1), 'black': (1.0, 0.16, 0.5, 1), 'white': (1.0, 0.85, 0.3, 1), 'yellow': (1.0, 0.72, 0.08, 1),
         'jade': (0.1, 1.0, 0.75, 1), 'maroon': (1.0, 0.55, 0.1, 1), 'blue': (0.2, 0.5, 1.0, 1)}
SIGN_STYLE = ['red', 'black', 'green', 'yellow', 'jade', 'red', 'black', 'white', 'maroon', 'green', 'blue', 'red', 'black', 'yellow', 'white', 'maroon',
              'green', 'red', 'black', 'blue', 'jade', 'yellow', 'red', 'black']


def sign_board(g, F, u0, u1, y0, y1, k, s, w=0.0):
    if not g.lod:
        g.fbox('d_metal', F, u0 - 0.05, u1 + 0.05, y0 - 0.05, y1 + 0.05, w, w + 0.14, DARK, top=True, bottom=True)
        nc = NEONC[SIGN_STYLE[k % len(SIGN_STYLE)]]     # saturated neon tube around the box sign
        P = lambda u, y: Geo.fp(F, u, y, w + 0.2)
        e = 0.1
        for a_, b_ in ((P(u0 - e, y0 - e), P(u1 + e, y0 - e)), (P(u1 + e, y0 - e), P(u1 + e, y1 + e)), (P(u1 + e, y1 + e), P(u0 - e, y1 + e)), (P(u0 - e, y1 + e), P(u0 - e, y0 - e))):
            g.rod('neon', a_, b_, 0.028, nc, n=4)
    P = lambda u, y: Geo.fp(F, u, y, w + 0.145)
    g.poly('sign', [P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1)], (1, 1, 1, 1), (F[2][0], 0, F[2][1]), uv=sign_uv(k))


def blade_sign(g, F, u, y0, k):
    """vertical blade sign sticking out of the wall at u (both faces lit)"""
    H_, W_, th = 3.2, 0.75, 0.16
    w0, w1 = 0.35, 0.35 + W_
    t = (F[1][0], 0, F[1][1])
    if not g.lod:
        g.fbox('d_metal', F, u - th / 2, u + th / 2, y0, y0 + H_, w0, w1, DARK, top=True, bottom=True)
        for yy in (y0 + 0.3, y0 + H_ - 0.3):
            g.fbox('d_metal', F, u - 0.03, u + 0.03, yy - 0.03, yy + 0.03, 0, w0, DARK, top=True, bottom=True)
    for sg in (1, -1):
        uu = u + sg * (th / 2 + 0.004)
        pts = [Geo.fp(F, uu, y0 + 0.06, w0 + 0.05), Geo.fp(F, uu, y0 + 0.06, w1 - 0.05), Geo.fp(F, uu, y0 + H_ - 0.06, w1 - 0.05), Geo.fp(F, uu, y0 + H_ - 0.06, w0 + 0.05)]
        uv = blade_uv(k)
        if sg < 0: uv = [uv[1], uv[0], uv[3], uv[2]]
        g.poly('sign', pts if sg > 0 else [pts[1], pts[0], pts[3], pts[2]], (1, 1, 1, 1), (t[0] * sg, 0, t[2] * sg), uv=uv)


def cwin_glass(g, F, hole, depth, col):
    """interior-mapped window glass (slot 'cwin', hero_mats.js): uv 0..1 over the opening, colour = (lit 0..1, room seed,
    light tone, 1) -> a parallax room from the facade system's room atlas with curtains, dim warm at night"""
    us = [p[0] for p in hole]; vs = [p[1] for p in hole]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    uv = [((u - u0) / max(1e-3, u1 - u0), (v - v0) / max(1e-3, v1 - v0)) for u, v in hole]
    g.poly('cwin', [Geo.fp(F, u, v, -depth) for u, v in hole], col, (F[2][0], 0, F[2][1]), uv=uv)


def upper_window(g, F, uc, yk, w, s, R, wall_slot, wall_col, lit_p, fh, curtains=True):
    sill, head = 0.82, min(2.55, fh - 0.55)
    hole = opening_poly(uc, w, yk + sill, yk + head, s['arch'], 6 if not g.lod else 3)
    lit = R.random() < lit_p
    k = 0.55 + 0.8 * R.random(); tone = R.random()
    gcol = ((1.0, 0.76, 0.48) if tone < 0.6 else (1.0, 0.88, 0.7) if tone < 0.85 else (0.78, 0.86, 1.0))
    gc = (gcol[0] * k, gcol[1] * k, gcol[2] * k, 1.0) if lit else (0, 0, 0, 1)
    cw = (min(1.0, k * 0.75) if lit else 0.0, R.random(), tone, 1.0)
    if g.lod:
        g.poly('win', [Geo.fp(F, u, v, 0.03) for u, v in hole], (gc[0] * 0.4, gc[1] * 0.4, gc[2] * 0.4, 1), (F[2][0], 0, F[2][1]))
        return hole
    dep = 0.2
    recess(g, F, hole, dep, 'd_' + wall_slot, shade(wall_col, 0.88), 'zz', gc, mull=('d_metal', s['frame'], 0.05))
    cwin_glass(g, F, hole, dep, cw)
    g.fbox('d_' + wall_slot if wall_slot != 'stucco' else 'd_stone', F, uc - w / 2 - 0.1, uc + w / 2 + 0.1, yk + sill - 0.1, yk + sill, 0, 0.09, shade(s['trim'] if s['kind'] == 'paint' else wall_col, 1.05), top=True, bottom=True)
    if s['kind'] != 'paint' and not s['arch']:
        g.fbox('d_stone', F, uc - w / 2 - 0.08, uc + w / 2 + 0.08, yk + head, yk + head + 0.18, 0, 0.04, C_('#cfc6b4'), top=True, bottom=True)
    if False:     # (round 2: curtains + room silhouettes come from the interior-mapped glass)
        cc = R.choice(CURT); ww = -dep + 0.02
        f1 = 0.25 + 0.2 * R.random(); f2 = 0.25 + 0.2 * R.random()
        sl = 'curtain' if lit else 'd_fabric'
        col = (cc[0] * gc[0] * 0.9, cc[1] * gc[1] * 0.9, cc[2] * gc[2] * 0.9, 1) if lit else shade(cc, 0.7)
        ya, yb = yk + sill + 0.02, yk + head - 0.02
        g.poly(sl, [Geo.fp(F, uc - w / 2, ya, ww), Geo.fp(F, uc - w / 2 + w * f1, ya, ww), Geo.fp(F, uc - w / 2 + w * f1, yb, ww), Geo.fp(F, uc - w / 2, yb, ww)], col, (F[2][0], 0, F[2][1]))
        if R.random() < 0.7:
            g.poly(sl, [Geo.fp(F, uc + w / 2 - w * f2, ya, ww), Geo.fp(F, uc + w / 2, ya, ww), Geo.fp(F, uc + w / 2, yb, ww), Geo.fp(F, uc + w / 2 - w * f2, yb, ww)], col, (F[2][0], 0, F[2][1]))
    rk = R.random()
    if rk < 0.11:      # window AC unit
        g.fbox('d_metal', F, uc - 0.32, uc + 0.32, yk + sill + 0.02, yk + sill + 0.44, -0.12, 0.42, C_('#cfd0cc'), top=True, bottom=True)
        g.fbox('d_metal', F, uc - 0.28, uc + 0.28, yk + sill + 0.06, yk + sill + 0.4, 0.42, 0.43, C_('#7a7c78'), top=False, sides=False)
    elif rk < 0.19:    # flower box
        g.fbox('d_paint', F, uc - w / 2, uc + w / 2, yk + sill, yk + sill + 0.22, 0.05, 0.3, C_('#6a4a32'), top=True)
        for j in range(3):
            g.lathe('d_leaf', *(lambda p: (p[0], p[2]))(Geo.fp(F, uc - w / 3 + j * w / 3, 0, 0.18)), [(0.12, yk + sill + 0.2), (0.2, yk + sill + 0.32), (0.0, yk + sill + 0.48)], C_('#3e7a34'), n=5)
    return hole


def bay_window(g, F, uc, y0, nf, fh, s, R, wall_col, lit_p):
    """canted bay (1.6 m front, 0.7 m out) over every upper floor"""
    hw0, hw1, dep = 1.35, 0.8, 0.72
    pts = [Geo.fp(F, uc - hw0, 0, 0), Geo.fp(F, uc - hw1, 0, dep), Geo.fp(F, uc + hw1, 0, dep), Geo.fp(F, uc + hw0, 0, 0)]
    pts = [(p[0], p[2]) for p in pts]
    y1 = y0 + nf * fh
    slot = 'stucco'; col = shade(wall_col, 1.03)
    for a, b in zip(pts[:-1], pts[1:]):
        F2 = Geo.frame(a, b); L2 = v2len(v2sub(b, a))
        for k in range(nf):
            yk = y0 + k * fh
            ww = min(L2 - 0.3, 1.2)
            hole = opening_poly(L2 / 2, ww, yk + 0.8, yk + min(2.55, fh - 0.5), 0, 3)
            radial_panel(g, slot, F2, 0, L2, yk, yk + fh, hole, col)
            lit = R.random() < lit_p; kk = 0.55 + 0.8 * R.random()
            gc = (kk, kk * 0.78, kk * 0.5, 1) if lit else (0, 0, 0, 1)
            if g.lod: g.poly('win', [Geo.fp(F2, u, v, -0.02) for u, v in hole], (gc[0] * 0.4, gc[1] * 0.4, gc[2] * 0.4, 1), (F2[2][0], 0, F2[2][1]))
            else:
                recess(g, F2, hole, 0.1, 'd_' + slot, shade(col, 0.9), 'zz', gc, mull=('d_metal', s['frame'], 0.045))
                cwin_glass(g, F2, hole, 0.1, (min(1.0, kk * 0.75) if lit else 0.0, R.random(), R.random(), 1.0))
                if False and R.random() < 0.5 and lit:
                    cc = R.choice(CURT)
                    g.poly('curtain', [Geo.fp(F2, L2 / 2 - ww / 2, yk + 0.82, -0.08), Geo.fp(F2, L2 / 2 - ww / 2 + ww * 0.35, yk + 0.82, -0.08),
                                       Geo.fp(F2, L2 / 2 - ww / 2 + ww * 0.35, yk + 2.4, -0.08), Geo.fp(F2, L2 / 2 - ww / 2, yk + 2.4, -0.08)],
                           (cc[0] * gc[0], cc[1] * gc[1], cc[2] * gc[2], 1), (F2[2][0], 0, F2[2][1]))
            if not g.lod:
                g.fbox('d_stone', F2, 0, L2, yk - 0.06, yk + 0.06, 0, 0.06, s['trim'], top=True, bottom=True)
    top_pts = [(p[0], y1 + 0.25, p[1]) for p in pts]
    bot_pts = [(p[0], y0, p[1]) for p in pts]
    g.poly('stone', top_pts, s['trim'], (0, 1, 0))
    g.poly('stone', bot_pts, shade(s['trim'], 0.8), (0, -1, 0))
    for a, b in zip(pts[:-1], pts[1:]):
        F2 = Geo.frame(a, b); L2 = v2len(v2sub(b, a))
        g.fbox('stone', F2, -0.05, L2 + 0.05, y1, y1 + 0.25, 0, 0.12, s['trim'], top=True, bottom=True)
        if not g.lod:
            g.fbox('d_stone', F2, 0.1, L2 - 0.1, y0 - 0.5, y0, 0, 0.06, shade(s['trim'], 0.9), top=False, bottom=True)


def fire_escape(g, F, u0, u1, ys, fh, s, R):
    col = C_('#1c1c1e'); D = 0.95
    lod = g.lod
    for k, y in enumerate(ys):
        g.fbox('d_metal', F, u0, u1, y - 0.07, y, 0.02, D, col, top=True, bottom=True)
        if lod:
            g.fbox('d_metal', F, u0, u1, y + 0.9, y + 1.0, D - 0.05, D, col, top=True, bottom=True)
            continue
        for yy in (y + 0.97, y + 0.5):
            g.fbox('d_metal', F, u0, u1, yy, yy + 0.04, D - 0.04, D, col, top=True, bottom=True)
            for uu in (u0, u1 - 0.04): g.fbox('d_metal', F, uu, uu + 0.04, yy, yy + 0.04, 0.02, D, col, top=True, bottom=True)
        u = u0
        while u < u1 - 0.02:
            g.fbox('d_metal', F, u, u + 0.018, y, y + 0.97, D - 0.03, D - 0.012, col, top=False, sides=False)
            u += 0.13
        for uu in (u0, u1 - 0.05):
            g.fbox('d_metal', F, uu, uu + 0.05, y, y + 1.01, D - 0.05, D, col, top=True)
            g.rod('d_metal', Geo.fp(F, uu + 0.025, y - 0.85, 0.02), Geo.fp(F, uu + 0.025, y - 0.07, D - 0.08), 0.022, col, n=3)
        # stair up to the next platform (alternating direction)
        if k + 1 < len(ys):
            y2 = ys[k + 1]; run = min(u1 - u0 - 0.6, (y2 - y) / math.tan(math.radians(52)))
            if k % 2 == 0: ua, ub = u1 - 0.25, u1 - 0.25 - run
            else: ua, ub = u0 + 0.25, u0 + 0.25 + run
            for ww in (0.25, 0.8):
                g.rod('d_metal', Geo.fp(F, ua, y, ww), Geo.fp(F, ub, y2 - 0.05, ww), 0.03, col, n=3)
            nt = int((y2 - y) / 0.22)
            for j in range(1, nt):
                t = j / nt; uu = ua + (ub - ua) * t; yy = y + (y2 - y) * t
                g.fbox('d_metal', F, min(uu, uu + 0.12 * (1 if ub > ua else -1)), max(uu, uu + 0.12 * (1 if ub > ua else -1)), yy - 0.03, yy, 0.25, 0.8, col, top=True, bottom=True)
    if not lod and ys:   # drop ladder under the first platform
        y = ys[0]; ul = u0 + 0.35 if len(ys) % 2 else u1 - 0.75
        for uu in (ul, ul + 0.4): g.fbox('d_metal', F, uu, uu + 0.03, y - 2.2, y, D - 0.2, D - 0.17, col, top=True, bottom=True)
        for j in range(8): g.fbox('d_metal', F, ul, ul + 0.43, y - 2.1 + j * 0.27, y - 2.08 + j * 0.27, D - 0.2, D - 0.17, col, top=True)


def balcony(g, F, u0, u1, y, s, R, ornate=False):
    col = s['bal_col']; D = 0.85 if ornate else 0.7
    g.fbox('stone' if ornate else 'd_paint', F, u0, u1, y - 0.16, y, 0, D, shade(col, 0.9) if ornate else C_('#bdb6a8'), top=True, bottom=True)
    if g.lod:
        g.fbox('d_paint', F, u0, u1, y, y + 1.0, D - 0.04, D, col, top=True)
        return
    g.fbox('d_paint', F, u0, u1, y + 0.95, y + 1.05, D - 0.06, D, col, top=True, bottom=True)
    for uu in (u0, u1 - 0.05): g.fbox('d_paint', F, uu, uu + 0.05, y + 0.95, y + 1.05, 0, D, col, top=True, bottom=True)
    if ornate:
        g.fbox('d_paint', F, u0, u1, y, y + 0.2, D - 0.05, D, shade(col, 0.8), top=True)
        g.fbox('d_paint', F, u0, u1, y + 0.75, y + 0.82, D - 0.05, D, CGOLD, top=True, bottom=True)
        u = u0 + 0.12
        while u < u1 - 0.1:
            g.fbox('d_paint', F, u, u + 0.05, y + 0.2, y + 0.75, D - 0.045, D - 0.005, col if int((u - u0) / 0.3) % 2 else CGOLD, top=False, sides=False)
            u += 0.3
        for uu in (u0 + 0.02, u1 - 0.1): g.fbox('d_paint', F, uu, uu + 0.08, y, y + 1.05, D - 0.08, D, CGOLD, top=True)
    else:
        u = u0
        while u < u1 - 0.02:
            g.fbox('d_paint', F, u, u + 0.025, y, y + 0.95, D - 0.03, D - 0.01, col, top=False, sides=False)
            u += 0.12
    if R.random() < 0.6:     # potted plants
        for j in range(R.randint(1, 3)):
            uu = u0 + 0.4 + R.random() * (u1 - u0 - 0.8)
            c = Geo.fp(F, uu, 0, D * 0.5)
            g.cyl('d_paint', c[0], c[2], 0.16, y, y + 0.3, C_('#8a4a2a'), n=6)
            g.lathe('d_leaf', c[0], c[2], [(0.14, y + 0.28), (0.3, y + 0.5), (0.18, y + 0.8), (0.0, y + 0.9)], C_('#3e7a34'), n=6)


def laundry(g, F, u0, u1, y, R):
    if g.lod: return
    p = Geo.fp(F, u0, y, 0.9); q = Geo.fp(F, u1, y, 0.9)
    g.rod('d_metal', p, q, 0.008, C_('#d8d8d0'), n=3)
    u = u0 + 0.2
    while u < u1 - 0.4:
        w = 0.3 + R.random() * 0.4; h = 0.4 + R.random() * 0.5
        c = R.choice([C_('#f0f0ec'), C_('#d84a3a'), C_('#3a6ab0'), C_('#e8c848'), C_('#58a868'), C_('#e0a0c0'), C_('#383838')])
        g.poly('d_fabric', [Geo.fp(F, u, y - h, 0.9), Geo.fp(F, u + w, y - h, 0.9), Geo.fp(F, u + w, y - 0.01, 0.9), Geo.fp(F, u, y - 0.01, 0.9)], c, (F[2][0], 0, F[2][1]))
        u += w + 0.15 + R.random() * 0.3


def metal_cornice(g, F, L, y, s):
    col = s['trim'] if s['kind'] == 'paint' else C_('#d8d0c0') if s['kind'] == 'brick' else C_('#bfb5a2')
    g.fbox('d_stone', F, -0.12, L + 0.12, y - 0.6, y - 0.45, 0, 0.16, col, top=True, bottom=True)
    g.fbox('stone', F, -0.18, L + 0.18, y - 0.45, y - 0.14, 0, 0.36, col, top=True, bottom=True)
    g.fbox('stone', F, -0.24, L + 0.24, y - 0.14, y + 0.02, 0, 0.55, shade(col, 1.05), top=True, bottom=True)
    if not g.lod:
        n = max(2, int(L / 1.1))
        for k in range(n + 1):
            u = 0.1 + (L - 0.2) * k / n
            g.fbox('d_paint', F, u - 0.07, u + 0.07, y - 0.8, y - 0.45, 0, 0.32, shade(col, 0.95), top=False, bottom=True)


def pagoda_eave(g, F, L, y, s, out=1.35, rise=0.85):
    """green glazed-tile eave across the front with kicked-up corners, red fascia, gold ridge"""
    n = max(4, int(L / 0.6)) if not g.lod else 4
    Lx = L + 1.0
    def lift(u):
        e = max(0.0, abs(u - L / 2) - (L / 2 - 0.9)) / 1.4
        return 0.55 * e * e
    us = [-0.5 + Lx * k / n for k in range(n + 1)]
    for a, b in zip(us[:-1], us[1:]):
        la, lb = lift(a), lift(b)
        P0, P1 = Geo.fp(F, a, y + rise, 0.0), Geo.fp(F, b, y + rise, 0.0)
        Q0, Q1 = Geo.fp(F, a, y + la, out + la * 0.3), Geo.fp(F, b, y + lb, out + lb * 0.3)
        sl = math.hypot(out, rise)
        g.poly('rooftile', [Q0, Q1, P1, P0], JADE_L, (F[2][0], 1, F[2][1]), uv=[(a, sl), (b, sl), (b, 0), (a, 0)])
        g.poly('d_paint', [Q0, Q1, (Q1[0], Q1[1] - 0.22, Q1[2]), (Q0[0], Q0[1] - 0.22, Q0[2])], CRED, (F[2][0], 0, F[2][1]))
        g.poly('d_paint', [(Q0[0], Q0[1] - 0.22, Q0[2]), (Q1[0], Q1[1] - 0.22, Q1[2]), Geo.fp(F, b, y + rise - 0.3, 0.0), Geo.fp(F, a, y + rise - 0.3, 0.0)], shade(CRED, 0.55), (0, -1, 0))
    g.fbox('d_paint', F, -0.5, L + 0.5, y + rise, y + rise + 0.2, 0, 0.3, CGOLD, top=True, bottom=True)
    if not g.lod:
        for k in range(max(2, int(L / 1.5)) + 1):    # bracket sets
            u = 0.2 + (L - 0.4) * k / max(2, int(L / 1.5))
            g.fbox('d_paint', F, u - 0.1, u + 0.1, y + rise - 0.75, y + rise - 0.25, 0, 0.5, CRED, top=True, bottom=True)
            g.fbox('d_paint', F, u - 0.16, u + 0.16, y + rise - 0.3, y + rise - 0.18, 0, 0.6, CGOLD, top=True, bottom=True)
        for u in (-0.5, L + 0.5):     # ridge-end finials
            p = Geo.fp(F, u, y + rise + 0.2, 0.15)
            g.lathe('d_gold', p[0], p[2], [(0.12, y + rise + 0.2), (0.08, y + rise + 0.5), (0.0, y + rise + 0.75)], CGOLD, n=6)


def ground_strip(g, a, c, f, step=1.6, wstep=0.8):
    """light receiver over the sidewalk + half the street in front of a facade (slot 'ground': baked into the night
    lightmap, drawn additively at night as the lantern / sign / shop light pools on the pavement)"""
    F = Geo.frame(a, c); L = v2len(v2sub(c, a))
    d, q, sd = seg_dist(v2lerp(a, c, 0.5), f['a'], f['b'])
    W = min(d, f['w'] / 2 + f['sw'] + 3.0)
    nu = max(1, int(math.ceil(L / step))); nw = max(1, int(math.ceil(W / wstep)))
    ws = [0.05 + (W - 0.05) * j / nw for j in range(nw + 1)]
    # (round 2) the strips floated 0.18 m over the carriageway (sidewalk height everywhere): the light pools sat in the air
    # under the parked cars. Split at the kerb: road quads at the road surface, sidewalk quads on the sidewalk.
    wc = d - f['w'] / 2
    if 0.1 < wc < W - 0.1: ws = sorted(set([round(v, 4) for v in ws] + [round(wc, 4)]))
    us = [L * k / nu for k in range(nu + 1)]
    P = lambda u, w, dy: (lambda p: (p[0], H(p[0], p[2]) + dy, p[2]))(Geo.fp(F, u, 0, w))
    for j in range(len(ws) - 1):
        dy = 0.06 if (ws[j] + ws[j + 1]) / 2 > wc else 0.22
        for k in range(nu):
            fa = (1.0 - (ws[j] + ws[j + 1]) / 2 / W) ** 1.5    # light pool fades toward the street centre (runtime: colour.r)
            g.poly('ground', [P(us[k], ws[j], dy), P(us[k + 1], ws[j], dy), P(us[k + 1], ws[j + 1], dy), P(us[k], ws[j + 1], dy)], (fa, fa, fa, 1), (0, 1, 0))


# ---------------------------------------------------------------------------------------------- one building
def ct_building(g, i, ctx):
    b = bld(i)
    r = ring_out(ring_simplify(ring_of(i), 0.3))
    if len(r) < 3: return []
    edges = [(r[k], r[(k + 1) % len(r)]) for k in range(len(r))]
    fr = [front_of(a, c) for a, c in edges]
    fronts = [f for f in fr if f]
    s = style_of(i, fronts)
    ylo = ground_min(r)[0] - 2.5
    if fronts:
        yG = min(sidewalk(*v2lerp(a, c, t)) for (a, c), f in zip(edges, fr) if f for t in (0.0, 0.5, 1.0))
    else:
        yG = ground_min(r)[0] + 0.15
    # storeys from the OSM height (Chinatown: 2-6 storeys over a tall shop floor)
    h = b['h'] if b['h'] > 3 else 12.0
    gf = 4.5; fh = 3.25
    nf = int(max(1, min(6, round((h - gf - 0.8) / fh))))
    if h < 7.5: nf = 1
    yU = yG + gf; top = yU + nf * fh
    parapet_h = 0.9
    own = ALLIDS
    for k, ((a, c), f) in enumerate(zip(edges, fr)):
        F = Geo.frame(a, c); L = v2len(v2sub(c, a))
        R = rr('e', i, k)
        if f is None:
            nt = neighbour_top(a, c, {i})
            if nt is not None and nt > top - 1.0:
                radial_panel(g, 'd_' + s['slot'], F, 0, L, ylo, top + parapet_h, None, shade(s['col'], 0.9))
            elif L > 4.5:
                y0 = max(yG, nt) if nt is not None else yG
                radial_panel(g, s['slot'], F, 0, L, ylo, y0 + 0.01, None, shade(s['col'], 0.9))
                facade(g, a, c, y0, top + parapet_h, fh, 3.2, Win(w=1.0, sill=0.9, head=2.4, depth=0.18, lit=s['lit'] * 0.6, frame_col=s['frame']),
                       s['slot'], shade(s['col'], 0.92), margin=1.2, skip=lambda kk, ii, R=R: R.random() < 0.45)
            else:
                radial_panel(g, s['slot'], F, 0, L, ylo, top + parapet_h, None, shade(s['col'], 0.9))
            continue
        # ------------------------------------------------ street front
        street = f['name']
        if not g.lod: ground_strip(g, a, c, f)
        # ground floor: piers + shop bays
        pier = 0.45
        nb = max(1, int(round((L - pier) / 4.8)))
        bw = (L - pier) / nb
        signs = []
        kinds = []
        for j in range(nb):
            Rb = rr('bay', i, k, j)
            u0, u1 = pier + j * bw, pier + (j + 1) * bw - pier
            uc = (u0 + u1) / 2; px, pz = v2lerp(a, c, uc / L)
            ybot = sidewalk(px, pz) + 0.02
            yhead = max(ybot + 2.9, yG + 3.15)
            sk = rr('sk', i, k, j).randrange(len(SIGN_KIND)); kind = SIGN_KIND[sk]
            kinds.append(kind)
            hole = [(u0, ybot), (u1, ybot), (u1, yhead), (u0, yhead)]
            radial_panel(g, s['slot'], F, u0 - pier, u1 + (pier if j == nb - 1 else 0), ylo, yU, hole, s['col'] if s['kind'] != 'paint' else shade(s['col'], 0.97))
            shop_bay(g, F, u0, u1, ybot, yhead, yU, s, Rb, kind, s['slot'], s['col'], ylo)
            if s['awn'] < 0.86:
                awning(g, F, u0 - 0.15, u1 + 0.15, yhead + 0.4 if s['awn'] < 0.5 else yhead + 0.3, s, Rb)
            if Rb.random() < 0.45 and kind in (0, 3): goods(g, F, u0 + 0.2, u1 - 0.2, ybot, kind, Rb)
        if nb == 0: continue
        # pier dressing (paint shopfronts get coloured pilasters)
        if not g.lod:
            for j in range(nb + 1):
                u = j * bw
                g.fbox('d_stone', F, max(0, u), min(L, u + pier), ylo, yU - 0.3, 0, 0.12, s['shop_col'] if s['kind'] == 'paint' else shade(s['col'], 0.95), top=True)
        # fascia signs (8:1 atlas cells; round 2: one per shop bay, as big as the fascia allows)
        ys0, ys1 = yG + 3.6, yU - 0.18
        if ys1 - ys0 > 0.45:
            ns = nb
            sw_ = bw
            for q in range(ns):
                Rq = rr('sg', i, k, q)
                hs = min(ys1 - ys0, 1.25); wsg = min(sw_ - 0.35, hs * 8.0)
                if wsg < hs * 4.0: hs = max(0.5, wsg / 4.5)
                ucq = pier + (q + 0.5) * sw_ - pier / 2
                sk = rr('sk', i, k, q).randrange(len(SIGN_KIND))
                yc = (ys0 + ys1) / 2 + (Rq.random() - 0.5) * 0.1
                sign_board(g, F, ucq - wsg / 2, ucq + wsg / 2, yc - hs / 2, yc + hs / 2, sk, s, w=0.04 if s['awn'] < 0.5 else 0.02)
        # belt cornice over the shops
        g.fbox('stone', F, -0.05, L + 0.05, yU - 0.25, yU + 0.05, 0, 0.3, s['trim'] if s['kind'] == 'paint' else C_('#cdbfa6'), top=True, bottom=True)
        # lantern row under the awning line
        if s['lrow'] and not g.lod:
            n_ = max(2, int(L / 1.05))
            for q in range(n_):
                p = Geo.fp(F, 0.5 + (L - 1.0) * q / max(1, n_ - 1), yG + 3.7, 1.55)
                lantern(g, p[0], p[1], p[2], 0.17, 0.3, n=8)
            g.rod('d_metal', Geo.fp(F, 0.3, yG + 3.75, 1.55), Geo.fp(F, L - 0.3, yG + 3.75, 1.55), 0.01, DARK, n=3)
        # festoon of small lanterns along the facade under the second-floor windows (Grant: the concept's lit rows)
        for yr in ([yU + fh + 0.55] + ([yU + 2 * fh + 0.55] if s['urow3'] and nf >= 3 else [])) if (s['urow'] and not g.lod and nf >= 2 and L > 5) else []:
            n_ = max(2, int((L - 0.6) / 0.95))
            pts = [Geo.fp(F, 0.3 + (L - 0.6) * q / (n_ - 1), yr - 0.3 * math.sin(math.pi * q / (n_ - 1)), 0.75) for q in range(n_)]
            for q, p in enumerate(pts):
                lantern(g, p[0], p[1], p[2], 0.16, 0.28, n=8)
            for p0, p1 in zip(pts[:-1], pts[1:]): g.rod('d_metal', p0, p1, 0.01, DARK, n=3)
        # upper floors
        bayw = s['baywin'] and L > 6.0 and nf >= 2
        bay_u = []
        if bayw:
            nbw = max(1, int((L - 1.2) / 5.5)); bay_u = [0.6 + (L - 1.2) * (q + 0.5) / nbw for q in range(nbw)]
        margin = 0.55
        bayu = s['bay'] * (2 if s['pair'] else 1)
        nbu = max(1, int((L - 2 * margin) / bayu))
        bwu = (L - 2 * margin) / nbu
        radial_panel(g, s['slot'], F, 0, margin, yU, top + parapet_h, None, s['col'])
        radial_panel(g, s['slot'], F, L - margin, L, yU, top + parapet_h, None, s['col'])
        radial_panel(g, s['slot'], F, margin, L - margin, top, top + parapet_h, None, s['col'])
        for fk in range(nf):
            yk = yU + fk * fh
            for q in range(nbu):
                u0 = margin + q * bwu; u1 = u0 + bwu; uc = (u0 + u1) / 2
                Rw = rr('w', i, k, fk, q)
                if any(abs(uc - bu) < 1.4 + bwu / 2 - 0.05 and (u0 < bu + 1.35 and u1 > bu - 1.35) for bu in bay_u):
                    # wall behind / beside a bay window: plain except outside the bay span
                    radial_panel(g, s['slot'], F, u0, u1, yk, yk + fh, None, s['col']); continue
                if s['pair']:
                    holes = []
                    for m in range(2):
                        ucm = u0 + bwu * (m + 0.5) / 2
                        holes.append((ucm, min(s['ww'], bwu / 2 - 0.35)))
                    for m, (ucm, w_) in enumerate(holes):
                        a0, a1 = u0 + bwu * m / 2, u0 + bwu * (m + 1) / 2
                        hole = opening_poly(ucm, w_, yk + 0.82, yk + min(2.55, fh - 0.55), s['arch'], 6 if not g.lod else 3)
                        radial_panel(g, s['slot'], F, a0, a1, yk, yk + fh, hole, s['col'])
                        upper_window(g, F, ucm, yk, w_, s, Rw, s['slot'], s['col'], s['lit'], fh)
                else:
                    w_ = min(s['ww'], bwu - 0.5)
                    hole = opening_poly(uc, w_, yk + 0.82, yk + min(2.55, fh - 0.55), s['arch'], 6 if not g.lod else 3)
                    radial_panel(g, s['slot'], F, u0, u1, yk, yk + fh, hole, s['col'])
                    upper_window(g, F, uc, yk, w_, s, Rw, s['slot'], s['col'], s['lit'], fh)
            if s['bands'] and fk > 0:
                g.fbox('d_stone', F, 0, L, yk - 0.08, yk + 0.06, 0, 0.07, s['trim'], top=True, bottom=True)
        for bu in bay_u: bay_window(g, F, bu, yU + 0.5, nf, fh, s, rr('bw', i, k, bu), s['col'], s['lit'])
        # fire escape / balconies / blade sign / laundry
        Rf = rr('fe', i, k)
        if s['fire'] and nf >= 2 and L > 5.0 and not bay_u:
            fw = min(L - 1.0, 4.6 + Rf.random() * 1.6); fu = 0.5 + Rf.random() * (L - 1.0 - fw)
            fire_escape(g, F, fu, fu + fw, [yU + fk * fh + 0.05 for fk in range(nf)], fh, s, Rf)
            if s['laundry'] and nf >= 3: laundry(g, F, fu + 0.1, fu + fw - 0.1, yU + 2 * fh - 0.3, Rf)
        elif s['balcony'] and nf >= 1:
            for fk in range(nf):
                if s['balcony'] == 'plain' and fk > 0 and Rf.random() < 0.5: continue
                balcony(g, F, 0.4, L - 0.4, yU + fk * fh + 0.05, s, rr('bal', i, k, fk), ornate=s['balcony'] == 'ornate')
        if s['laundry'] and not s['fire'] and nf >= 2 and L > 4: laundry(g, F, 0.6, L - 0.6, yU + fh * 1.9, Rf)
        if s['blade'] and L > 4.0:
            left = Rf.random() < 0.5; bu = 0.45 if left else L - 0.45
            blade_sign(g, F, bu, yU + 0.4 + Rf.random() * 0.6, Rf.randrange(16))
            if L > 9.0 and (s['grant'] or Rf.random() < 0.5):
                blade_sign(g, F, L - 0.45 if left else 0.45, yU + 0.3 + Rf.random() * 1.2, Rf.randrange(16))
        # roofline
        if s['cornice'] == 'metal': metal_cornice(g, F, L, top + parapet_h, s)
        elif s['cornice'] == 'pagoda': pagoda_eave(g, F, L, top + parapet_h - 0.2, s)
        else: g.fbox('stone', F, -0.05, L + 0.05, top + parapet_h - 0.12, top + parapet_h + 0.05, 0, 0.18, shade(s['col'], 1.1), top=True, bottom=True)
    # roof: slab just under the parapet line, parapet inner faces
    inner = ring_offset(r, -0.25)
    g.poly('roof', [(p[0], top + 0.05, p[1]) for p in inner], C_('#77736c'), (0, 1, 0))
    if not g.lod:
        for q in range(len(inner)):
            A, B = inner[q], inner[(q + 1) % len(inner)]; n_ = edge_n(A, B)
            g.poly('roof', [(A[0], top + 0.05, A[1]), (B[0], top + 0.05, B[1]), (B[0], top + parapet_h, B[1]), (A[0], top + parapet_h, A[1])], C_('#8a8478'), (-n_[0], 0, -n_[1]))
        g.sweep('stone', r, [(0.0, top + parapet_h), (-0.25, top + parapet_h)], shade(s['col'], 1.05))
        Rr = rr('roof', i)
        cx, cz = centroid(r)
        if Rr.random() < 0.5 and point_in(r, cx, cz):     # roof box / water tank / AC
            sx = 1.2 + Rr.random() * 1.5
            if all(point_in(r, cx + dx, cz + dz) for dx in (-sx, sx) for dz in (-sx, sx)):
                if Rr.random() < 0.3:
                    g.cyl('d_wood', cx, cz, sx * 0.7, top + 2.2, top + 4.0, C_('#6a5038'), n=10, top=True)
                    for dx in (-0.6, 0.6):
                        for dz in (-0.6, 0.6): g.box('d_metal', cx + dx - 0.06, cx + dx + 0.06, top, top + 2.2, cz + dz - 0.06, cz + dz + 0.06, DARK)
                else:
                    g.box('d_metal', cx - sx / 2, cx + sx / 2, top, top + 1.1, cz - sx / 3, cz + sx / 3, C_('#9a9890'))
    ctx['cols'] += wall_colliders(r, ylo, top + parapet_h)
    ctx['top'] = max(ctx.get('top', 0), top + parapet_h + 4)
    return r


# ---------------------------------------------------------------------------------------------- lantern strings
def street_strings(block):
    """lantern strings across the hero streets owned by this block: [(p, q, sag, r)]"""
    out = []
    key = block
    side, seg = key[3], int(key[4:])
    cuts = PLAN['cuts']; ax = PLAN['axis']; O = PLAN['origin']
    along = lambda p: (p[0] - O[0]) * ax[0] + (p[1] - O[1]) * ax[1]
    sidef = lambda p: 'w' if ((p[0] - O[0]) * ax[1] - (p[1] - O[1]) * ax[0]) > 0 else 'e'
    for s in SEGS:
        a, b = s['a'], s['b']; L = v2len(v2sub(b, a))
        if L < 2: continue
        t = v2norm(v2sub(b, a)); n = (-t[1], t[0])
        half = s['w'] / 2 + s['sw'] - 0.35
        name = s['name']
        if name == 'Grant Avenue':
            if side != 'w': continue
            gap, hs = 7.8, (6.6, 8.2, 9.8)
        elif name == 'Waverly Place':
            if side != 'w': continue
            gap, hs = 6.0, (5.4, 6.4)
        else:
            gap, hs = 12.0, (6.8, 8.6)
        # global stationing so strings stay evenly spaced across segment joints
        d0 = (a[0] * t[0] + a[1] * t[1])
        k0 = math.ceil(d0 / gap)
        dd = k0 * gap - d0
        while dd < L:
            m = v2add(a, v2mul(t, dd))
            # owner block of this station
            al = along(m); sg = sum(1 for x in cuts if al > x) - 1
            if name == 'Grant Avenue':
                own_seg = max(0, min(len(cuts) - 2, sg))
                ok = own_seg == seg and cuts[0] + 6 < al < cuts[-1] - 3
                near_x = min(abs(al - x) for x in cuts) < 6.5
                ok = ok and not near_x
            elif name == 'Waverly Place':
                ok = sg == seg
            else:
                # side street at cut ci (between blocks ci-1 and ci): owned by the block south of it; clear of Grant
                ci = PLAN_CROSS.index(name) if name in PLAN_CROSS else -9
                ok = sidef(m) == side and seg == ci - 1 and abs((m[0] - O[0]) * ax[1] - (m[1] - O[1]) * ax[0]) > 9.0
            if ok:
                R = rr('str', name, round(dd + d0, 1))
                h1 = R.choice(hs); h2 = h1 + (R.random() - 0.5) * 1.0
                diag = R.random() < 0.4
                off = (R.random() - 0.5) * gap * 0.9 if diag else 0.0
                pa = v2add(m, v2mul(n, half)); pb = v2add(v2add(m, v2mul(t, off)), v2mul(n, -half))
                p = (pa[0], sidewalk(*pa) + h1, pa[1]); q = (pb[0], sidewalk(*pb) + h2, pb[1])
                out.append((p, q, 0.6 + R.random() * 0.8, 0.22 + R.random() * 0.06 if name == 'Grant Avenue' else 0.2, round(dd + d0, 1)))
            dd += gap
    return out


def ct_block(g, block, ctx):
    ctx.setdefault('cols', [])
    rings = []
    for i in PLAN['blocks'][block]:
        try:
            r = ct_building(g, i, ctx)
            if r: rings.append(r)
        except Exception as e:
            print('[ct] building', i, 'failed', e, flush=True)
    for p, q, sag, r, sd in street_strings(block):
        lantern_string(g, p, q, sag, gap=1.05 if r > 0.21 else 1.25, r=r, seed=sd)
    return rings


# ---------------------------------------------------------------------------------------------- Dragon Gate (1970)
def gate_frame():
    """centre (x, z), along-Grant unit vector (toward Broadway), lateral unit vector (east)"""
    X = PLAN['cross']['Bush Street']; ax = PLAN['axis']
    c = (X[0] - ax[0] * 13.0, X[1] - ax[1] * 13.0)
    lat = (-ax[1], ax[0])
    if lat[0] < 0: lat = (-lat[0], -lat[1])
    return c, tuple(ax), lat


def kicked_roof(g, P, u0, u1, d, y_e, rise, col=JADE_L, kick=0.7):
    """hipped glazed-tile roof over u0..u1 (local lateral), depth +-d (local along), eave y_e, swept-up corners"""
    n = 10 if not g.lod else 3
    um = (u0 + u1) / 2; hu = (u1 - u0) / 2
    lift = lambda t: kick * t ** 2.2          # t = 0 (mid) .. 1 (corner)
    for sgn in (1, -1):                        # front / back slopes
        for k in range(n):
            a = u0 + (u1 - u0) * k / n; b = u0 + (u1 - u0) * (k + 1) / n
            ta, tb = abs(a - um) / hu, abs(b - um) / hu
            ra, rb = max(u0 + d * 0.7, min(u1 - d * 0.7, a)), max(u0 + d * 0.7, min(u1 - d * 0.7, b))
            Q = [P(a, sgn * (d + 0.3 * lift(ta)), y_e + lift(ta)), P(b, sgn * (d + 0.3 * lift(tb)), y_e + lift(tb)), P(rb, 0, y_e + rise), P(ra, 0, y_e + rise)]
            g.poly('rooftile', Q, col, (0, 1, 0), uv=[(a, d), (b, d), (b, 0), (a, 0)])
            g.poly('d_paint', [Q[0], Q[1], (Q[1][0], Q[1][1] - 0.25, Q[1][2]), (Q[0][0], Q[0][1] - 0.25, Q[0][2])], CRED, None)
            g.poly('d_paint', [(Q[0][0], Q[0][1] - 0.25, Q[0][2]), (Q[1][0], Q[1][1] - 0.25, Q[1][2]), P(rb, 0, y_e + rise - 0.5), P(ra, 0, y_e + rise - 0.5)], shade(CRED, 0.5), (0, -1, 0))
    for su in (-1, 1):                         # hip ends
        ue = u0 if su < 0 else u1; ur = u0 + d * 0.7 if su < 0 else u1 - d * 0.7
        Q = [P(ue, -(d + 0.3 * kick), y_e + kick), P(ue, d + 0.3 * kick, y_e + kick), P(ur, 0, y_e + rise)]
        g.poly('rooftile', Q, col, (0, 1, 0))
    # ridge + gold trim
    pa, pb = P(u0 + d * 0.7, 0, y_e + rise + 0.15), P(u1 - d * 0.7, 0, y_e + rise + 0.15)
    g.rod('d_gold', pa, pb, 0.16, CGOLD, n=6)
    return pa, pb


def ct_gate(g, ctx):
    c, ax, lat = gate_frame()
    y0 = min(H(c[0] + lat[0] * s, c[1] + lat[1] * s) for s in (-9, 0, 9)) + 0.15
    P = lambda u, w, y: (c[0] + lat[0] * u + ax[0] * w, y, c[1] + lat[1] * u + ax[1] * w)
    F = lambda u: ((c[0] + lat[0] * u, c[1] + lat[1] * u), lat, (ax[0], ax[1]))   # frame: t = lat, n = along
    STONE = C_('#cfc7b8'); BLUE = C_('#1f4a7a')
    def box(slot, u0, u1, w0, w1, ya, yb, col):
        g.fbox(slot, ((c[0] + lat[0] * u0 + ax[0] * w0, c[1] + lat[1] * u0 + ax[1] * w0), lat, ax), 0, u1 - u0, ya, yb, 0, w1 - w0, col, top=True, bottom=True)
    pillars = [(-5.5, -4.5, 9.0), (4.5, 5.5, 9.0), (-9.2, -8.3, 6.2), (8.3, 9.2, 6.2)]
    for u0, u1, top in pillars:
        box('stone', u0, u1, -0.55, 0.55, y0 - 1.0, y0 + top, STONE)
        box('stone', u0 - 0.15, u1 + 0.15, -0.7, 0.7, y0 - 1.0, y0 + 0.9, shade(STONE, 0.9))
        ctx['cols'].append({'x': round(P((u0 + u1) / 2, 0, 0)[0], 2), 'z': round(P((u0 + u1) / 2, 0, 0)[2], 2), 'hx': round((u1 - u0) / 2 + 0.15, 2), 'hz': 0.7,
                            'yaw': round(math.atan2(-lat[1], lat[0]), 4), 'yMin': round(y0 - 1, 2), 'yMax': round(y0 + top, 2)})
    # beams: central (red + green + gold bands, plaque), side spans
    box('paint', -4.5, 4.5, -0.45, 0.45, y0 + 6.2, y0 + 6.7, CRED)
    box('paint', -5.6, 5.6, -0.5, 0.5, y0 + 7.9, y0 + 8.4, JADE)
    box('d_paint', -5.6, 5.6, -0.52, 0.52, y0 + 8.4, y0 + 8.55, CGOLD)
    box('paint', -4.5, 4.5, -0.3, 0.3, y0 + 6.7, y0 + 7.9, C_('#2a6a52'))
    box('paint', -1.6, 1.6, -0.42, 0.42, y0 + 6.75, y0 + 7.85, CGOLD)
    box('d_paint', -1.45, 1.45, -0.44, 0.44, y0 + 6.88, y0 + 7.72, BLUE)
    if not g.lod:
        for sg in (1, -1):
            g.text('d_gold', ((c[0] + lat[0] * 0.0 + ax[0] * 0.44 * sg, c[1] + lat[1] * 0.0 + ax[1] * 0.44 * sg), (lat[0] * sg, lat[1] * sg), (ax[0] * sg, ax[1] * sg)),
                   0.0, y0 + 6.98, 0.0, '天下為公', 0.62, CGOLD, depth=0.04, font=gate_font())
    for su in (-1, 1):
        u0, u1 = sorted((su * 5.5, su * 8.3))
        box('paint', u0, u1, -0.4, 0.4, y0 + 4.6, y0 + 5.0, CRED)
        box('paint', u0, u1, -0.45, 0.45, y0 + 5.6, y0 + 6.0, JADE)
        box('paint', u0, u1, -0.25, 0.25, y0 + 5.0, y0 + 5.6, C_('#2a6a52'))
        # bracket clusters under the eaves
        if not g.lod:
            for uu in (u0 + 0.6, (u0 + u1) / 2, u1 - 0.6):
                box('d_paint', uu - 0.2, uu + 0.2, -0.75, 0.75, y0 + 6.0, y0 + 6.25, CRED)
                box('d_paint', uu - 0.28, uu + 0.28, -0.95, 0.95, y0 + 6.25, y0 + 6.4, CGOLD)
        kicked_roof(g, P, min(su * 4.9, su * 9.8), max(su * 4.9, su * 9.8), 1.5, y0 + 6.4, 1.1, kick=0.55)
    if not g.lod:
        for uu in (-4.8, -2.4, 0.0, 2.4, 4.8):
            box('d_paint', uu - 0.22, uu + 0.22, -0.8, 0.8, y0 + 8.55, y0 + 8.85, CRED)
            box('d_paint', uu - 0.3, uu + 0.3, -1.05, 1.05, y0 + 8.85, y0 + 9.0, CGOLD)
    pa, pb = kicked_roof(g, P, -6.6, 6.6, 1.9, y0 + 9.0, 1.6, kick=0.8)
    # ridge ornaments: two dragons facing the pearl, carp at the ridge ends
    if not g.lod:
        yr = y0 + 10.75
        for sg in (-1, 1):
            pts = []
            for k in range(14):
                t = k / 13; u = sg * (0.6 + 3.2 * t)
                pts.append(P(u, 0.12 * math.sin(t * 9), yr + 0.35 + 0.35 * math.sin(t * 10.5) * (1 - 0.4 * t)))
            for a_, b_ in zip(pts[:-1], pts[1:]): g.rod('d_paint', a_, b_, 0.13, JADE_L, n=6)
            hp = pts[0]; g.lathe('d_gold', hp[0], hp[2], [(0.0, hp[1] - 0.2), (0.22, hp[1]), (0.0, hp[1] + 0.25)], CGOLD, n=6)
            fp = P(sg * 5.0, 0, yr); g.lathe('d_gold', fp[0], fp[2], [(0.0, yr), (0.25, yr + 0.3), (0.12, yr + 0.9), (0.3, yr + 1.2), (0.0, yr + 1.3)], CGOLD, n=6)
        pp = P(0, 0, yr + 0.5); g.lathe('d_gold', pp[0], pp[2], [(0.0, yr + 0.2), (0.3, yr + 0.5), (0.0, yr + 0.8)], C_('#e8c050'), n=8)
        # guardian lions on the outer plinths (stylised)
        for su in (-1, 1):
            q = P(su * 8.75, -0.9, 0)
            g.box('stone', q[0] - 0.5, q[0] + 0.5, y0 - 0.2, y0 + 0.6, q[2] - 0.5, q[2] + 0.5, shade(STONE, 0.85))
            g.lathe('d_stone', q[0], q[2], [(0.4, y0 + 0.6), (0.38, y0 + 1.1), (0.3, y0 + 1.4), (0.34, y0 + 1.7), (0.0, y0 + 1.95)], C_('#b8b0a2'), n=8)
    for u0, u1, top in pillars:      # up-light fixtures on both faces of every pillar
        for sw in (-1, 1):
            uc = (u0 + u1) / 2
            box('d_metal', uc - 0.18, uc + 0.18, sw * 0.62 - 0.1, sw * 0.62 + 0.1, y0 + 0.9, y0 + 1.05, C_('#2a2a2a'))
            q = [P(uc - 0.14, sw * 0.62 - 0.07, y0 + 1.06), P(uc + 0.14, sw * 0.62 - 0.07, y0 + 1.06), P(uc + 0.14, sw * 0.62 + 0.07, y0 + 1.06), P(uc - 0.14, sw * 0.62 + 0.07, y0 + 1.06)]
            g.poly('lamp', q, (1.0, 0.86, 0.62, 1), (0, 1, 0))
    ctx['top'] = y0 + 13


_GF = [None]


def gate_font():
    if _GF[0] is None:
        try: _GF[0] = bpy.data.fonts.load(os.path.join(HERE, '_cache', 'fonts', 'NotoSerifTC.ttf'))
        except Exception as e: print('[ct] font', e); _GF[0] = False
    return _GF[0] or None


def block_origin(block):
    rings = [ring_of(i) for i in PLAN['blocks'][block]]
    pts = [p for r in rings for p in r]
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    lo = min(ground_min(r)[0] for r in rings)
    rad = max(math.hypot(p[0] - cx, p[1] - cz) for p in pts)
    return (round(cx, 1), round(lo - 3.0, 2), round(cz, 1)), rad


NAMES = {'w': 'west', 'e': 'east'}
SEGN = ['Bush-Pine', 'Pine-California', 'California-Sacramento', 'Sacramento-Clay', 'Clay-Washington', 'Washington-Jackson', 'Jackson-Pacific', 'Pacific-Broadway']


# ================================================================================================ bake + export
import bpy
import numpy as np
from hero_interior import lm_unwrap, denoise, OIDN   # noqa

ALB = {'brickred': 0.32, 'brick': 0.45, 'stucco': 0.7, 'stone': 0.65, 'roof': 0.25, 'rooftile': 0.4, 'metal': 0.3, 'concrete': 0.5,
       'paint': 0.55, 'ground': 0.2, 'fabric': 0.6, 'wood': 0.4, 'gold': 0.6, 'leaf': 0.3, 'grille': 0.45, 'tiles': 0.6}
CTDIR = os.path.join(OUT, 'ct')
_IMG = {}


def atlas_img(name):
    if name not in _IMG:
        _IMG[name] = bpy.data.images.load(os.path.join(CTDIR, name), check_existing=True)
    return _IMG[name]


def bake_mat(slot, night, bake_img=None):
    """Cycles material for the bake: albedo = vertex colour x slot albedo, emitters (night only), optional bake target"""
    base = slot[2:] if slot.startswith('d_') else slot
    m = bpy.data.materials.new('bk_' + slot); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; bsdf = N.get('Principled BSDF')
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'Col'; at.attribute_type = 'GEOMETRY'
    bsdf.inputs['Roughness'].default_value = 0.8
    if base in ('sign', 'shopint'):
        uvn = N.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
        tx = N.new('ShaderNodeTexImage'); tx.image = atlas_img('ct_signs.png' if base == 'sign' else 'ct_shops.jpg')
        nt.links.new(uvn.outputs['UV'], tx.inputs['Vector'])
        nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(tx.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = EMIT[base] if night else 0.0
    elif base == 'cwin':      # colour = (lit, seed, tone): warm room light x lit
        sep = N.new('ShaderNodeSeparateColor'); nt.links.new(at.outputs['Color'], sep.inputs['Color'])
        bsdf.inputs['Base Color'].default_value = (0.03, 0.03, 0.035, 1)
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.72, 0.45, 1)
        mth = N.new('ShaderNodeMath'); mth.operation = 'MULTIPLY'; mth.inputs[1].default_value = EMIT['cwin'] if night else 0.0
        nt.links.new(sep.outputs['Red'], mth.inputs[0]); nt.links.new(mth.outputs[0], bsdf.inputs['Emission Strength'])
    elif base in EMIT:
        nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(at.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = EMIT[base] if night else 0.0
        if base == 'win': bsdf.inputs['Base Color'].default_value = (0.04, 0.04, 0.05, 1)
    else:
        mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
        k = ALB.get(base, 0.5)
        nt.links.new(at.outputs['Color'], mul.inputs[6]); mul.inputs[7].default_value = (k, k, k, 1)
        nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
    if bake_img is not None:
        tn = N.new('ShaderNodeTexImage'); tn.image = bake_img
        for nd in N: nd.select = False
        tn.select = True; N.active = tn
    return m


def set_world(strength, col=(1, 1, 1)):
    sc = bpy.context.scene
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    bg.inputs['Strength'].default_value = strength; bg.inputs['Color'].default_value = tuple(col) + (1,)


def slot_of(ob):
    n = ob.name.split('.')[0]
    return n.split('_', 1)[1] if (n[:1] in 'LC' and '_' in n and n[1:2].isdigit()) else n


def assign(objs, night, targets=(), img=None):
    tg = set(o.name for o in targets)
    for ob in objs:
        ob.data.materials.clear(); ob.data.materials.append(bake_mat(slot_of(ob), night, img if ob.name in tg else None))


def bake_pass(targets, res, spp, aux=None, label=''):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU' if os.environ.get('HB_CPU') else devices(); sc.cycles.samples = spp
    sc.cycles.use_denoising = False
    try: sc.cycles.use_auto_tile = False
    except Exception: pass
    sc.cycles.max_bounces = 5; sc.cycles.diffuse_bounces = 3; sc.cycles.sample_clamp_indirect = 6.0
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in targets: ob.select_set(True); ob.data.uv_layers.active = ob.data.uv_layers['lm']
    bpy.context.view_layer.objects.active = targets[0]
    bk = sc.render.bake
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
    bk.margin = 6; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'; bk.use_clear = True
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=6)
    img = targets[0].data.materials[0].node_tree.nodes.active.image
    px = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[:, :, :3]
    print('[ct] bake %s %dpx %dspp %.1f s mean %.4f' % (label, res, spp, time.time() - t, float(px.mean())), flush=True)
    return np.maximum(denoise(px, res, aux), 0.0)


def aux_maps(targets, res):
    """OIDN guides in lightmap space: albedo + normals (also used for the sky-visibility normalisation)"""
    out = []
    for kind in ('albedo', 'normal'):
        img = bpy.data.images.new('aux_' + kind, res, res, alpha=False, float_buffer=True)
        for ob in targets:
            ob.data.materials.clear(); ob.data.materials.append(bake_mat(slot_of(ob), False, img))
            ob.data.uv_layers.active = ob.data.uv_layers['lm']
        for o in bpy.context.selected_objects: o.select_set(False)
        for ob in targets: ob.select_set(True)
        bpy.context.view_layer.objects.active = targets[0]
        sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = devices(); sc.cycles.samples = 4
        sc.render.bake.target = 'IMAGE_TEXTURES'
        if kind == 'albedo': bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=6)
        else:
            sc.render.bake.normal_space = 'OBJECT'; bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=6)
        a = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[:, :, :3]
        if kind == 'normal': a = a * 2.0 - 1.0
        out.append(a); bpy.data.images.remove(img)
    return out


def save_lm(px, path, scale=None, gamma=2.2):
    res_y, res_x = px.shape[:2]
    if scale is None:
        lum = px.mean(axis=2); nz = lum[lum > 1e-4]
        scale = float(np.percentile(nz, 99.5)) if nz.size else 1.0
    enc = np.clip(px / scale, 0, 1) ** (1 / gamma)
    out = bpy.data.images.new('lm8', res_x, res_y, alpha=False, float_buffer=False)
    out.colorspace_settings.name = 'sRGB'
    rgba = np.ones((res_y, res_x, 4), dtype=np.float32); rgba[:, :, :3] = enc
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = path; out.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = 92
    out.save(); bpy.data.images.remove(out)
    return scale


LM_WEIGHT = {'roof': 0.3, 'rooftile': 0.6, 'ground': 0.8, 'metal': 0.7}    # relative texel density per slot


def ct_unwrap(objs, res):
    """smart-project every lightmapped object, scale islands by slot weight (roofs get few texels), pack into one atlas"""
    for ob in objs:
        if 'lm' not in ob.data.uv_layers: ob.data.uv_layers.new(name='lm')
        ob.data.uv_layers.active = ob.data.uv_layers['lm']
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob in objs:
        w = LM_WEIGHT.get(slot_of(ob), 1.0)
        if w == 1.0: continue
        uv = np.empty(len(ob.data.loops) * 2, dtype=np.float32); ob.data.uv_layers['lm'].data.foreach_get('uv', uv)
        ob.data.uv_layers['lm'].data.foreach_set('uv', uv * math.sqrt(w))
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    try: bpy.ops.uv.select_all(action='SELECT')
    except Exception: pass
    bpy.ops.uv.pack_islands(margin=5.0 / res, rotate=True, shape_method='CONCAVE', margin_method='FRACTION', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    uvs = []
    for ob in objs:
        uv = np.empty(len(ob.data.loops) * 2, dtype=np.float32); ob.data.uv_layers['lm'].data.foreach_get('uv', uv); uvs.append(uv)
    allv = np.concatenate([u for u in uvs if u.size]).reshape(-1, 2)
    lo, hi = allv.min(0), allv.max(0); ext = float(max(hi - lo)); m = 2.0 / res
    if ext > 1e-6 and (lo.min() < 0 or hi.max() > 1):
        k = (1 - 2 * m) / ext
        for ob, uv in zip(objs, uvs):
            uv = uv.reshape(-1, 2); uv[:] = (uv - lo) * k + m; ob.data.uv_layers['lm'].data.foreach_set('uv', uv.ravel())
    print('[ct] unwrap: uv extent %.3f..%.3f' % (float(lo.min()), float(hi.max())), flush=True)
    for ob in objs: ob.data.uv_layers.active = ob.data.uv_layers['UVMap']


def objs_of(g, prefix, O):
    return [o for o in (to_object('%s_%s' % (prefix, s), d, O) for s, d in g.S.items()) if o]


def neighbours(block):
    if block == 'ct_gate': return ['ct_w0', 'ct_e0']
    side, seg = block[3], int(block[4:])
    other = 'e' if side == 'w' else 'w'
    out = []
    for sd in (side, other):
        for sg in (seg - 1, seg, seg + 1):
            b = 'ct_%s%d' % (sd, sg)
            if b != block and b in PLAN['blocks']: out.append(b)
    return out


def run_block(block, res=2048, spp=256, bake=True):
    t0 = time.time()
    reset(); _IMG.clear(); _GF[0] = None
    gate = block == 'ct_gate'
    if gate:
        c, _, _ = gate_frame(); O, rad = (round(c[0], 1), round(H(*c) - 4.0, 2), round(c[1], 1)), 12.0; hide = []
    else:
        O, rad = block_origin(block)
        hide = list(PLAN['blocks'][block])
    os.makedirs(os.path.join(OUT, block), exist_ok=True)
    info = {'id': block, 'origin': list(O), 'hide': hide, 'lods': [None, None], 'ct': 1,
            'name': 'Chinatown Gate' if gate else 'Chinatown: %s side of Grant, %s' % (NAMES[block[3]], SEGN[int(block[4:])]),
            'near': int(150 + rad)}
    occ_r = int(rad + 60)
    lm_meta = None
    for lod in (1, 0):
        hero_lib._WINRNG[0] = 4242
        g = Geo(O, lod); ctx = {'cols': []}; GLOW.clear()
        ct_gate(g, ctx) if gate else ct_block(g, block, ctx)
        g.S.pop('zz', None)
        objs = objs_of(g, 'L%d' % lod, O)
        occ = [terrain_occluder(O[0], O[2], occ_r, O[1], O), neighbour_occluders(ALLIDS, O[0], O[2], occ_r, O)]
        occ = [o for o in occ if o]
        bake_vertex_ao(objs, occ, samples=48 if lod == 0 else 16, distance=4.0)
        if lod == 0 and bake:
            lm_objs = [o for o in objs if slot_of(o) in LM_SLOTS]
            # context: neighbouring blocks (LOD1: emitters + occluders), glass hidden from the bake
            cg = Geo(O, 1)
            for nb in neighbours(block): ct_block(cg, nb, {'cols': []})
            cg.S.pop('zz', None)
            cobjs = objs_of(cg, 'C1', O)
            for o in objs + cobjs:
                if slot_of(o) == 'clear': o.hide_render = True
            ct_unwrap(lm_objs, res)
            aux = None if os.environ.get('HB_NOAUX') else aux_maps(lm_objs, res)
            everything = objs + cobjs + occ
            # day: uniform white sky, no emitters -> sky visibility relative to an open surface of the same normal
            dres = res // 2
            set_world(1.0)
            img = bpy.data.images.new('lmday', dres, dres, alpha=False, float_buffer=True)
            assign(everything, False, lm_objs, img)
            auxd = None if aux is None else (aux[0][::2, ::2], aux[1][::2, ::2])
            day = bake_pass(lm_objs, dres, max(64, spp // 2), auxd, 'day')
            if auxd is not None:
                nz = auxd[1][:, :, 2]
                e0 = 0.5 + 0.5 * nz + 0.12 * (0.5 - 0.5 * nz)
                day = day / np.maximum(e0, 0.08)[:, :, None]
            bpy.data.images.remove(img)
            save_lm(np.clip(day, 0, 1.25), os.path.join(OUT, block, '%s_lm.jpg' % block), scale=1.25)
            # night: emitters only (+ a faint sodium skyglow)
            set_world(0.004, (1.0, 0.75, 0.55))
            img = bpy.data.images.new('lmnight', res, res, alpha=False, float_buffer=True)
            assign(everything, True, lm_objs, img)
            night = bake_pass(lm_objs, res, spp, aux, 'night')
            bpy.data.images.remove(img)
            nscale = save_lm(night, os.path.join(OUT, block, '%s_lmn.jpg' % block))
            lm_meta = {'day': '%s_lm.jpg' % block, 'dayScale': 1.25, 'night': '%s_lmn.jpg' % block, 'nightScale': round(nscale, 5), 'res': res}
            for o in cobjs: bpy.data.objects.remove(o, do_unlink=True)
            for o in objs:
                o.hide_render = False; o.data.materials.clear()
                if 'lm' in o.data.uv_layers: o.data.uv_layers.active = o.data.uv_layers['UVMap']
        for o in occ: bpy.data.objects.remove(o, do_unlink=True)
        path = os.path.join(OUT, block, '%s_lod%d.glb' % (block, lod))
        kb = export_glb(objs, path) // 1024
        info['lods'][lod] = {'file': '%s_lod%d.glb' % (block, lod), 'tris': g.tris(), 'kb': kb, 'slots': sorted(g.S.keys())}
        for o in objs: bpy.data.objects.remove(o, do_unlink=True)
        if lod == 0:
            info['colliders'] = ctx['cols']; info['top'] = round(ctx.get('top', O[1] + 30), 1)
            info['glow'] = [round(v - o, 2) for p in GLOW for v, o in zip(p, O)]     # relative to the site origin
        print('[ct] %s lod%d: %d tris, %d KB' % (block, lod, g.tris(), kb), flush=True)
    jp = os.path.join(CACHE, block + '.json')
    if lm_meta is None and os.path.exists(jp):
        try: lm_meta = json.load(open(jp)).get('lm')
        except Exception: pass
    if lm_meta: info['lm'] = lm_meta
    if gate: info['replaces'] = 'dragonGate'; info.pop('ct', None)
    info['sec'] = round(time.time() - t0, 1)
    with open(jp, 'w') as f: json.dump(info, f)
    print('[ct] done', block, info['sec'], 's', flush=True)
    return info


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    vals = {}
    for k in ('--res', '--spp'):
        if k in argv: vals[k] = int(argv[argv.index(k) + 1])
    ids = [a for j, a in enumerate(argv) if not a.startswith('--') and (j == 0 or argv[j - 1] not in vals)]
    if not ids or ids == ['all']: ids = sorted(PLAN['blocks'].keys())
    for b in ids:
        if '--glowonly' in argv:      # refresh the halo list in the cache json without rebuilding / rebaking
            O, _ = block_origin(b); GLOW.clear(); ct_block(Geo(O, 0), b, {'cols': []})
            jp = os.path.join(CACHE, b + '.json'); d = json.load(open(jp))
            d['glow'] = [round(v - o, 2) for p in GLOW for v, o in zip(p, d['origin'])]
            json.dump(d, open(jp, 'w')); print('[ct] glow', b, len(GLOW), flush=True); continue
        run_block(b, res=vals.get('--res', 2048), spp=vals.get('--spp', 256), bake='--nobake' not in argv)
