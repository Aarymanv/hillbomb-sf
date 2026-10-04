"""Interior dressing kit (round 2): the clutter that makes a hall read as a real place. All small parts go into 'd_*' detail slots
(probe-lit, no lightmap islands); bigger furniture are Poly Haven props (hero_props.prop). Frame coords (u, w) of the IGeo.

free(g, u, w, r, y)            : no collider within r of (u, w) at floor y (placement test against the builder's colliders)
clothing_rack / round_rack     : chrome rails with hanging garments          folded_table : display table with folded stacks
mannequin                      : dressed form on a base                        shelf_wall   : shelving run with boxed goods / shoes / bags
luggage_cart                   : brass bellman's cart with suitcases          flowers      : vase arrangement (stems + blooms)
votive_rack / altar_candles    : banks of lit votives, candlesticks           pedestal     : museum plinth with an object
turnstiles / reception         : office security gates, a reception desk      wall_art     : framed pictures along a wall
"""
import math, random
from hero_interior import C, shade
from hero_props import prop

GARMENTS = [C('#1f2633'), C('#3b3f47'), C('#7a1f2a'), C('#e8e2d6'), C('#2e4a6b'), C('#9a7b5a'), C('#c9c2b4'), C('#4a5a3a'), C('#d1a7a0'), C('#111214')]
LUX = [C('#151515'), C('#3a2a20'), C('#8a6e4e'), C('#e9e1d2'), C('#5a1c22'), C('#2b2f38')]


def _frame_rot(g, along_u):
    a, t, n = g.F
    return (t, n) if along_u else (n, (-t[0], -t[1]))


def free(g, u, w, r, y=None):
    """True when no collider box (with its yaw) is within r of the frame point (u, w) (and overlapping floor height y)"""
    x, z = g.xz(u, w)
    for p in getattr(g, 'props', []):      # furniture already placed by the builder (its colliders come later)
        if math.hypot(x - p['x'], z - p['z']) < r + 0.8 and (y is None or abs(p['y'] - y) < 1.5): return False
    for c in g.cols:
        if y is not None and (c['yMax'] < y + 0.2 or c['yMin'] > y + 1.8): continue
        dx, dz = x - c['x'], z - c['z']; cs, sn = math.cos(c['yaw']), math.sin(c['yaw'])
        lx, lz = cs * dx - sn * dz, sn * dx + cs * dz
        if abs(lx) < c['hx'] + r and abs(lz) < c['hz'] + r: return False
    return True


def clothing_rack(g, u, w, y, along_u=True, L=1.6, pal=GARMENTS, seed=1, h=1.55):
    R = random.Random(seed)
    du = L / 2 if along_u else 0.0; dw = 0.0 if along_u else L / 2
    # base feet + posts + rail
    for s in (-1, 1):
        pu, pw = u + s * du, w + s * dw
        g.llathe('d_metal', pu, pw, [(0.012, y), (0.012, y + h)], C('#c9ccd0'), n=5)
        g.lbox('d_metal', pu - (0.02 if along_u else 0.25), pu + (0.02 if along_u else 0.25), y, y + 0.03, pw - (0.25 if along_u else 0.02), pw + (0.25 if along_u else 0.02), C('#c9ccd0'))
    x0, z0 = g.xz(u - du, w - dw); x1, z1 = g.xz(u + du, w + dw)
    g.rod('d_metal', (x0, y + h, z0), (x1, y + h, z1), 0.012, C('#d8dbdf'), n=5)
    n = int(L / 0.07)
    for k in range(n):
        t = (k + 0.5) / n - 0.5
        cu, cw = u + 2 * du * t, w + 2 * dw * t
        col = shade(pal[R.randint(0, len(pal) - 1)], 0.85 + 0.3 * R.random())
        ln = 0.7 + R.random() * 0.45
        if along_u: g.lbox('d_fabric', cu - 0.015, cu + 0.015, y + h - 0.08 - ln, y + h - 0.08, cw - 0.24, cw + 0.24, col, top=True, bottom=True)
        else: g.lbox('d_fabric', cu - 0.24, cu + 0.24, y + h - 0.08 - ln, y + h - 0.08, cw - 0.015, cw + 0.015, col, top=True, bottom=True)
    g.collider(u - du - 0.3 * (not along_u) - 0.05, u + du + 0.3 * (not along_u) + 0.05, w - dw - 0.3 * along_u - 0.05, w + dw + 0.3 * along_u + 0.05, y, y + h)


def round_rack(g, u, w, y, r=0.6, pal=GARMENTS, seed=1, h=1.3):
    R = random.Random(seed)
    g.llathe('d_metal', u, w, [(0.25, y), (0.03, y + 0.05), (0.03, y + h), (r, y + h), (r, y + h + 0.02), (0.0, y + h + 0.02)], C('#c9ccd0'), n=16)
    n = int(2 * math.pi * r / 0.06)
    x, z = g.xz(u, w)
    for k in range(n):
        a = 2 * math.pi * k / n; col = shade(pal[R.randint(0, len(pal) - 1)], 0.85 + 0.3 * R.random())
        px, pz = x + math.cos(a) * r, z + math.sin(a) * r; ln = 0.6 + 0.3 * R.random()
        g.box('d_fabric', px - 0.25, px + 0.25, y + h - ln, y + h - 0.05, pz - 0.015, pz + 0.015, col, yaw=-a + math.pi / 2)
    g.collider(u - r - 0.2, u + r + 0.2, w - r - 0.2, w + r + 0.2, y, y + h)


def folded_table(g, u, w, y, L=1.6, D=0.8, pal=GARMENTS, seed=1):
    R = random.Random(seed)
    g.lbox('d_x_veneer', u - L / 2, u + L / 2, y + 0.78, y + 0.82, w - D / 2, w + D / 2, C('#8a6a4a'), top=True, bottom=True)
    for (su, sw) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        g.lbox('d_x_veneer', u + su * (L / 2 - 0.08) - 0.03, u + su * (L / 2 - 0.08) + 0.03, y, y + 0.78, w + sw * (D / 2 - 0.08) - 0.03, w + sw * (D / 2 - 0.08) + 0.03, C('#6b4a32'), top=False)
    for i in range(int(L / 0.4)):
        for j in range(int(D / 0.35)):
            cu, cw = u - L / 2 + 0.22 + i * 0.4, w - D / 2 + 0.2 + j * 0.35
            col = pal[R.randint(0, len(pal) - 1)]; hh = 0.04 * R.randint(2, 6)
            g.lbox('d_fabric', cu - 0.16, cu + 0.16, y + 0.82, y + 0.82 + hh, cw - 0.13, cw + 0.13, col, top=True)
    g.collider(u - L / 2, u + L / 2, w - D / 2, w + D / 2, y, y + 1.0)


def mannequin(g, u, w, y, col=C('#2b2f38'), skin=C('#e9e6e0')):
    g.llathe('d_metal', u, w, [(0.22, y), (0.22, y + 0.02), (0.015, y + 0.03), (0.015, y + 0.85)], C('#c9ccd0'), n=10)
    g.llathe('d_fabric', u, w, [(0.12, y + 0.85), (0.17, y + 0.95), (0.15, y + 1.2), (0.2, y + 1.45), (0.12, y + 1.5)], col, n=12, cap_bot=True)
    g.llathe('d_paint', u, w, [(0.04, y + 1.5), (0.04, y + 1.58), (0.1, y + 1.62), (0.1, y + 1.78), (0.0, y + 1.82)], skin, n=10)
    g.collider(u - 0.25, u + 0.25, w - 0.25, w + 0.25, y, y + 1.8)


def shelf_wall(g, u0, u1, w, face, y, rows=5, depth=0.4, kind='boxes', pal=GARMENTS, seed=1, h=2.3):
    """shelving along a wall at w (shelves stick out toward face = +1 / -1 in w) with goods"""
    R = random.Random(seed)
    w0, w1 = (w, w + face * depth)
    lo, hi = min(w0, w1), max(w0, w1)
    g.lbox('d_x_veneer', u0, u1, y, y + h, min(w, w - face * 0.03), max(w, w - face * 0.03), C('#5e4634'))
    for r in range(rows):
        yy = y + 0.3 + r * (h - 0.4) / rows
        g.lbox('d_x_veneer', u0, u1, yy, yy + 0.03, lo, hi, C('#6b4a32'), top=True, bottom=True)
        u = u0 + 0.08
        while u < u1 - 0.2:
            if kind == 'shoes':
                wd = 0.28; g.lbox('d_paint', u, u + wd, yy + 0.03, yy + 0.12, lo + 0.05, hi - 0.06, shade(pal[R.randint(0, len(pal) - 1)], 0.9))
            elif kind == 'bags':
                wd = 0.34; g.lbox('d_x_leather', u, u + wd, yy + 0.03, yy + 0.26, lo + 0.08, hi - 0.1, LUX[R.randint(0, len(LUX) - 1)])
                g.llathe('d_metal', u + wd / 2, (lo + hi) / 2, [(0.08, yy + 0.27), (0.08, yy + 0.33)], C('#c9a24a'), n=6)
            elif kind == 'books':
                wd = 0.035 + R.random() * 0.03; g.lbox('d_paint', u, u + wd, yy + 0.03, yy + 0.22 + R.random() * 0.08, lo + 0.04, hi - 0.06, shade(pal[R.randint(0, len(pal) - 1)], 0.8))
            else:
                wd = 0.2 + R.random() * 0.15; g.lbox('d_paint', u, u + wd, yy + 0.03, yy + 0.12 + R.random() * 0.2, lo + 0.05, hi - 0.05, pal[R.randint(0, len(pal) - 1)])
            u += wd + 0.03 + (0.08 if kind in ('shoes', 'bags') else 0.0)
        g.lbox('lampI', u0 + 0.05, u1 - 0.05, yy - 0.025, yy - 0.01, lo + 0.02, lo + 0.05, (1.0, 0.95, 0.88, 1.0), top=False, bottom=True)
    g.collider(u0, u1, lo, hi, y, y + h)


def luggage_cart(g, u, w, y, yaw=0.0, seed=1):
    R = random.Random(seed)
    x, z = g.xz(u, w)
    g.box('d_x_brass', x - 0.55, x + 0.55, y + 0.25, y + 0.29, z - 0.3, z + 0.3, C('#c9a24a'), yaw=yaw)
    for s in (-1, 1):
        a = g.xz(u + s * 0.5, w)
        g.cyl('d_x_brass', a[0], a[1], 0.02, y + 0.25, y + 1.9, C('#c9a24a'), n=6)
    p0, p1 = g.xz(u - 0.5, w), g.xz(u + 0.5, w)
    g.rod('d_x_brass', (p0[0], y + 1.9, p0[1]), (p1[0], y + 1.9, p1[1]), 0.025, C('#c9a24a'), n=6)
    for (su, sw) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        q = g.xz(u + su * 0.45, w + sw * 0.25)
        g.lathe('d_metal', q[0], q[1], [(0.0, y), (0.08, y + 0.04), (0.08, y + 0.2), (0.0, y + 0.24)], C('#1a1a1a'), n=8)
    for k in range(R.randint(2, 3)):
        prop(g, 'vintage_suitcase', u - 0.15 + k * 0.05, y + 0.29 + k * 0.32, w + (k % 2) * 0.05, yaw=R.random() * 0.4, fit=(0.7, None, None), collide=False)
    g.collider(u - 0.6, u + 0.6, w - 0.35, w + 0.35, y, y + 1.9)


def flowers(g, u, w, y, s=1.0, seed=1, pal=(C('#e9e2d6'), C('#d8586a'), C('#f2c9d4'), C('#f0d36a'), C('#b6435a'))):
    R = random.Random(seed)
    prop(g, ['ceramic_vase_02', 'ceramic_vase_03', 'antique_ceramic_vase_01', 'brass_vase_02'][seed % 4], u, y, w, fit=(None, 0.45 * s, None), collide=False)
    x, z = g.xz(u, w)
    top = y + 0.42 * s
    for k in range(int(26 * s)):
        a = R.random() * 2 * math.pi; r = R.random() ** 0.6 * 0.45 * s; hh = top + 0.25 * s + R.random() * 0.45 * s
        px, pz = x + math.cos(a) * r, z + math.sin(a) * r
        g.rod('d_paint', (x, top, z), (px, hh, pz), 0.006, C('#3d5a2a'), n=3)
        b = 0.05 * s + R.random() * 0.04 * s
        g.lathe('d_paint', px, pz, [(0.0, hh - b), (b, hh), (b * 0.7, hh + b * 0.6), (0.0, hh + b * 0.8)], pal[R.randint(0, len(pal) - 1)], n=6)
        if k % 3 == 0:
            g.poly('d_paint', [(px, hh - 0.05, pz), (px + math.cos(a + 1) * 0.12 * s, hh - 0.1, pz + math.sin(a + 1) * 0.12 * s), (px + math.cos(a) * 0.05, hh - 0.18, pz + math.sin(a) * 0.05)], C('#4a6b32'), (0, 1, 0))


def votive_rack(g, u, w, y, along_u=True, n=24, lit=0.6, seed=1):
    """tiered stand of votive candles (glass cups, a few lit)"""
    R = random.Random(seed)
    L = n / 3 * 0.1
    for tier in range(3):
        yy = y + 0.7 + tier * 0.12; off = (1 - tier) * 0.12
        if along_u: g.lbox('d_x_brass', u - L / 2, u + L / 2, yy - 0.02, yy, w + off - 0.06, w + off + 0.06, C('#8a6a3a'), top=True)
        else: g.lbox('d_x_brass', u + off - 0.06, u + off + 0.06, yy - 0.02, yy, w - L / 2, w + L / 2, C('#8a6a3a'), top=True)
        for k in range(n // 3):
            t = -L / 2 + (k + 0.5) * L / (n // 3)
            cu, cw = (u + t, w + off) if along_u else (u + off, w + t)
            x, z = g.xz(cu, cw)
            g.lathe('d_paint', x, z, [(0.03, yy), (0.03, yy + 0.06), (0.0, yy + 0.06)], C('#b8322a') if (k + tier) % 3 else C('#e8e2d6'), n=6)
            if R.random() < lit:
                g.lathe('lampI', x, z, [(0.0, yy + 0.06), (0.008, yy + 0.075), (0.0, yy + 0.095)], (1.0, 0.75, 0.4, 1.0), n=4)
    g.lbox('d_x_wood_dark', u - (L / 2 if along_u else 0.25), u + (L / 2 if along_u else 0.25), y, y + 0.68, w - (0.25 if along_u else L / 2), w + (0.25 if along_u else L / 2), C('#3a2618'))
    g.light('POINT', u, y + 1.1, w, 25, (1.0, 0.7, 0.4), radius=0.2, day=False)
    g.collider(u - (L / 2 if along_u else 0.3), u + (L / 2 if along_u else 0.3), w - (0.3 if along_u else L / 2), w + (0.3 if along_u else L / 2), y, y + 1.0)


def altar_candles(g, u0, u1, w, y):
    """a row of tall candlesticks with lit tapers on an altar top at y"""
    n = 6
    for k in range(n):
        u = u0 + (k + 0.5) * (u1 - u0) / n
        prop(g, 'wooden_candlestick', u, y, w, fit=(None, 0.45, None), collide=False)
        x, z = g.xz(u, w)
        g.lathe('d_paint', x, z, [(0.018, y + 0.42), (0.018, y + 0.7), (0.0, y + 0.7)], C('#efe9dc'), n=6)
        g.lathe('lampI', x, z, [(0.0, y + 0.7), (0.012, y + 0.72), (0.0, y + 0.76)], (1.0, 0.78, 0.45, 1.0), n=4)
    g.light('POINT', (u0 + u1) / 2, y + 0.9, w, 40, (1.0, 0.72, 0.42), radius=0.3, day=False)


def pedestal(g, asset, u, w, y, fit_h=0.6, h=1.0, top=0.6, col=C('#ece7de')):
    g.lbox('d_x_plaster', u - top / 2, u + top / 2, y, y + h, w - top / 2, w + top / 2, col, top=True)
    prop(g, asset, u, y + h, w, fit=(None, fit_h, None), collide=False)
    g.collider(u - top / 2 - 0.05, u + top / 2 + 0.05, w - top / 2 - 0.05, w + top / 2 + 0.05, y, y + h + fit_h)


def wall_art(g, u0, u1, w, face, y, n=3, seed=0, asset_cycle=('hanging_picture_frame_01', 'hanging_picture_frame_02', 'hanging_picture_frame_03', 'fancy_picture_frame_01')):
    for k in range(n):
        u = u0 + (k + 0.5) * (u1 - u0) / n
        prop(g, asset_cycle[(k + seed) % len(asset_cycle)], u, y, w + face * 0.04, face=(u, w + face * 5), fit=(1.1, None, None), collide=False)
        g.light('POINT', u, y + 1.4, w + face * 0.5, 20, (1.0, 0.86, 0.66), radius=0.1)


def turnstiles(g, u0, u1, w, y, n=4):
    """office security gates across a lobby at w: steel pedestals with glass flaps, a card reader light"""
    step = (u1 - u0) / n
    for k in range(n + 1):
        u = u0 + k * step
        g.lbox('d_metal', u - 0.1, u + 0.1, y, y + 1.0, w - 0.6, w + 0.6, C('#b9bec2'), top=True)
        g.lbox('lampI', u - 0.06, u + 0.06, y + 1.0, y + 1.01, w - 0.2, w - 0.1, (0.3, 0.9, 0.5, 1.0))
        if k < n:
            for s in (-1, 1):
                g.lbox('glassI', u + 0.1 if s < 0 else u + step - 0.45, u + 0.45 if s < 0 else u + step - 0.1, y + 0.3, y + 1.15, w - 0.02, w + 0.02, C('#d4dde0'))
        g.collider(u - 0.12, u + 0.12, w - 0.6, w + 0.6, y, y + 1.1)


def reception(g, u, w, y, L=3.6, face_w=-1, slot='x_veneer', top='x_marble_black', col=C('#4a2c1a')):
    g.lbox(slot, u - L / 2, u + L / 2, y, y + 1.08, w - 0.4, w + 0.4, col, top=True)
    g.lbox(top, u - L / 2 - 0.05, u + L / 2 + 0.05, y + 1.08, y + 1.13, w - 0.45, w + 0.45, C('#26262a'), top=True, bottom=True)
    prop(g, 'classic_laptop', u - L / 4, y + 1.13, w + face_w * -0.1, face=(u - L / 4, w + face_w * -3), fit=(0.33, None, None), collide=False)
    prop(g, 'desk_lamp_arm_01', u + L / 3, y + 1.13, w, fit=(None, 0.45, None), collide=False)
    flowers(g, u + L / 8, w, y + 1.13, s=0.6, seed=int(u * 3) % 4)
    g.collider(u - L / 2, u + L / 2, w - 0.45, w + 0.45, y, y + 1.2)


# ================================================================================== whole-room dressing by kind (run_interior)
def room_frame(g, r):
    """frame-coord bounds (u0, u1, w0, w1, y0, y1) of a room record (rooms are built along the frame axes)"""
    a, t, n = g.F
    dx, dz = r['x'] - a[0], r['z'] - a[1]
    cu, cw = dx * t[0] + dz * t[1], dx * n[0] + dz * n[1]
    return cu - r['hx'], cu + r['hx'], cw - r['hz'], cw + r['hz'], r['y0'], r['y1']


def _door_lane(g):
    """frame segments from each door's inside point toward the room centre (kept clear)"""
    a, t, n = g.F
    out = []
    r0 = g.rooms[0]; cu = (r0['x'] - a[0]) * t[0] + (r0['z'] - a[1]) * t[1]; cw = (r0['x'] - a[0]) * n[0] + (r0['z'] - a[1]) * n[1]
    for d in g.doors:
        x, z = d['in'][0], d['in'][2]
        out.append(((x - a[0]) * t[0] + (z - a[1]) * t[1], (x - a[0]) * n[0] + (z - a[1]) * n[1], cu, cw))
    return out


def _clear(lanes, u, w, r):
    for (u0, w0, u1, w1) in lanes:
        du, dw = u1 - u0, w1 - w0; L2 = du * du + dw * dw or 1
        tt = max(0.0, min(1.0, ((u - u0) * du + (w - w0) * dw) / L2))
        if math.hypot(u - u0 - du * tt, w - w0 - dw * tt) < r + 1.6: return False
    return True


def dress_room(g, ri, kind, seed=1, density=1.0):
    """fill the free floor of room ri with kind-specific clutter (store / lux / hotel / church / museum / office / market / apple)"""
    R = random.Random(seed)
    u0, u1, w0, w1, y0, y1 = room_frame(g, g.rooms[ri])
    lanes = _door_lane(g)
    um, wm = (u0 + u1) / 2, (w0 + w1) / 2
    step = {'store': 3.6, 'lux': 4.6, 'hotel': 6.5, 'church': 7.0, 'museum': 5.0, 'office': 6.0, 'market': 3.0, 'apple': 5.5}[kind] / max(0.4, density)
    placed = 0

    def ok(u, w, r):
        return free(g, u, w, r, y0) and _clear(lanes, u, w, r) and u0 + r + 0.6 < u < u1 - r - 0.6 and w0 + r + 0.6 < w < w1 - r - 0.6
    nu, nw = max(1, int((u1 - u0) / step)), max(1, int((w1 - w0) / step))
    for i in range(nu):
        for j in range(nw):
            u = u0 + (i + 0.5) * (u1 - u0) / nu + R.uniform(-0.4, 0.4); w = w0 + (j + 0.5) * (w1 - w0) / nw + R.uniform(-0.4, 0.4)
            if kind in ('store', 'lux'):
                if abs(u - um) < 1.8: continue                                  # main aisle
                pick = R.random()
                if not ok(u, w, 1.1): continue
                pal = LUX if kind == 'lux' else GARMENTS
                if pick < 0.32: clothing_rack(g, u, w, y0, along_u=R.random() < 0.5, L=1.5, pal=pal, seed=R.randint(0, 999))
                elif pick < 0.55: round_rack(g, u, w, y0, pal=pal, seed=R.randint(0, 999))
                elif pick < 0.8: folded_table(g, u, w, y0, pal=pal, seed=R.randint(0, 999))
                else:
                    for q in range(3): mannequin(g, u - 0.6 + q * 0.6, w + (q % 2) * 0.3, y0, col=pal[R.randint(0, len(pal) - 1)])
                if R.random() < 0.4: g.spot(u + 1.3, y0, w + 0.4, u, w, 'stand')
                placed += 1
            elif kind == 'apple':
                if ok(u, w, 1.0) and R.random() < 0.6: g.spot(u, y0, w, None, None, 'stand')
            elif kind == 'hotel':
                if not ok(u, w, 1.4): continue
                pick = R.random()
                if pick < 0.35:
                    prop(g, 'side_table_tall_01', u, y0, w, fit=(None, 0.8, None)); flowers(g, u, w, y0 + 0.8, s=0.9, seed=R.randint(0, 99))
                elif pick < 0.6: luggage_cart(g, u, w, y0, seed=R.randint(0, 99))
                elif pick < 0.85:
                    g.lbox('x_carpet_red', u - 1.6, u + 1.6, y0, y0 + 0.015, w - 1.2, w + 1.2, C('#6a3a2e'))
                    for s_ in (-1, 1): prop(g, ['ArmChair_01', 'GreenChair_01'][R.randint(0, 1)], u + s_ * 0.9, y0 + 0.015, w, face=(u, w), fit=(None, 1.0, None))
                    prop(g, 'side_table_01', u, y0 + 0.015, w, fit=(None, 0.55, None))
                else: prop(g, 'potted_plant_02', u, y0, w, yaw=u, fit=(None, 1.7, None), collide=False)
                g.spot(u + 1.2, y0, w + 0.8, u, w, 'stand'); placed += 1
            elif kind == 'church':
                if not ok(u, w, 0.9) or placed >= 4: continue
                votive_rack(g, u, w, y0, along_u=abs(u1 - u0) < abs(w1 - w0), seed=R.randint(0, 99)); placed += 1
            elif kind == 'museum':
                if not ok(u, w, 1.0): continue
                if R.random() < 0.7: pedestal(g, ['antique_ceramic_vase_01', 'ceramic_vase_04', 'brass_vase_03', 'marble_bust_01', 'horse_statue_01', 'bronze_ray_statue', 'chess_set'][R.randint(0, 6)], u, w, y0, fit_h=R.uniform(0.35, 0.7))
                else: prop(g, 'painted_wooden_bench', u, y0, w, yaw=R.random() * math.pi, fit=(1.6, None, None))
                g.spot(u + 1.1, y0, w, u, w, 'stand'); placed += 1
            elif kind == 'office':
                if not ok(u, w, 1.0) or placed >= 3: continue
                prop(g, ['potted_plant_02', 'pachira_aquatica_01', 'horse_statue_01'][placed % 3], u, y0, w, fit=(None, 1.8 if placed % 3 < 2 else 0.9, None)); placed += 1
            elif kind == 'market':
                if not ok(u, w, 0.8): continue
                for q in range(R.randint(1, 3)):
                    prop(g, ['wooden_crate_01', 'wicker_basket_01', 'wicker_basket_02', 'cardboard_box_01'][R.randint(0, 3)], u + q * 0.6 - 0.6, y0, w, yaw=R.random(), fit=(0.55, None, None))
                    prop(g, ['food_apple_01', 'lemon', 'food_pears_asian_01', 'food_lime_01', 'bananas'][R.randint(0, 4)], u + q * 0.6 - 0.6, y0 + 0.32, w, fit=(0.35, None, None), collide=False)
                g.spot(u + 0.9, y0, w + 0.9, u, w, 'stand'); placed += 1
    # walls: shelving runs in stores (shoes / bags / boxes), reception + gates in office lobbies, art in hotels and offices
    if kind in ('store', 'lux', 'apple'):
        kinds = {'store': ('shoes', 'boxes'), 'lux': ('bags', 'shoes'), 'apple': ('boxes', 'boxes')}[kind]
        for (wv, face, kk) in ((w0 + 0.05, 1, kinds[0]), (w1 - 0.05, -1, kinds[1])):
            for q in range(int((u1 - u0 - 4) / 3.2)):
                uq = u0 + 2 + q * 3.2
                if free(g, uq + 1.3, wv + face * 0.5, 0.3, y0) and _clear(lanes, uq + 1.3, wv + face * 0.5, 0.3):
                    shelf_wall(g, uq, uq + 2.8, wv, face, y0, kind=kk, pal=LUX if kind == 'lux' else GARMENTS, seed=q + 7)
    if kind == 'office':
        if free(g, um, w0 + 2.0, 1.2, y0): reception(g, um, w0 + 2.0, y0, L=3.2, face_w=1)
        wt = w0 + (w1 - w0) * 0.45
        if free(g, um, wt, 1.5, y0): turnstiles(g, um - 2.0, um + 2.0, wt, y0, n=4)
    if kind in ('hotel', 'office'):
        for (wv, face) in ((w0 + 0.05, 1), (w1 - 0.05, -1)):
            if free(g, um, wv + face * 0.3, 0.2, y0 + 1.6): wall_art(g, um - min(6.0, (u1 - u0) / 3), um + min(6.0, (u1 - u0) / 3), wv, face, y0 + 1.7, n=2, seed=int(wv) % 3)
    return placed


# per-interior dressing plan: (room index, kind, density); applied by run_interior after the builder
DRESS = {
    'macys': [(0, 'store', 1.0)], 'saks': [(0, 'lux', 1.0)], 'apple': [(0, 'apple', 1.0)],
    'stFrancis': [(0, 'hotel', 1.0)], 'grandHyatt': [(0, 'hotel', 1.2)], 'fairmont': [(0, 'hotel', 1.0)], 'jwMarriott': [(0, 'hotel', 0.8)],
    'markHopkins': [(0, 'hotel', 0.7)], 'palace': [(0, 'hotel', 0.4)],
    'grace': [(0, 'church', 1.0)], 'ssPeterPaul': [(0, 'church', 1.0)], 'missionDolores': [(0, 'church', 1.0)],
    'asianArt': [(0, 'museum', 1.0)], 'legion': [(i, 'museum', 0.8) for i in range(5)],
    'library': [(0, 'museum', 0.6)], 'deYoung': [(0, 'museum', 0.7)],
    'hobart': [(0, 'office', 1.0)], 'mills': [(0, 'office', 1.0)], 'phelan': [(0, 'office', 1.0)], 'transamerica': [(0, 'office', 1.0)], 'salesforce': [(0, 'office', 1.0)],
    'pier39': [(0, 'market', 0.7)], 'ferry': [(0, 'market', 0.5)], 'embCenter': [(0, 'market', 0.4)],
}
