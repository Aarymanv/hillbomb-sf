"""HILLBOMB hero interiors, wave 1 (Union Square). Run:  python hero_int_w1.py -- stFrancis [--res 2048 --spp 384]"""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_interior import *   # noqa
from hero_props import prop   # noqa
from hero_wave1 import origin_for, BUILDERS, sidewalk, ring_edges, NEIMAN_ROT, APPLE_H   # noqa

CREAM = C('#ece2cc'); CREAM_D = C('#d6c8a8'); GOLDC = C('#c09a45'); WOOD = C('#5a3822'); WOOD_L = C('#8a5a34')
MARB_W = C('#ebe6dc'); MARB_G = C('#9c978d'); GREEN_M = C('#243328'); BURG = C('#6c1f25'); SKY = (0.75, 0.85, 1.0, 1.0)


def floor_over(g, u0, u1, w0, w1, pad=0.2):
    hs = []
    for i in range(7):
        for j in range(7):
            hs.append(H(*g.xz(u0 + (u1 - u0) * i / 6, w0 + (w1 - w0) * j / 6)))
    return max(hs) + pad


def checker(g, slot, u0, u1, w0, w1, y, s, ca, cb, diag=True):
    """checkerboard floor of s-metre tiles (diagonal) clipped to the rectangle"""
    from hero_wave1 import clip_rect
    a, t, n = g.F
    if diag:
        h = s / math.sqrt(2)
        for i in range(int((u0 - w1) / h) - 2, int((u1 - w0) / h) + 3):
            for j in range(int((u0 + w0) / h) - 2, int((u1 + w1) / h) + 3):
                p, q = (i + 0.5) * h, (j + 0.5) * h
                cu, cw = (p + q) / 2, (q - p) / 2
                if cu < u0 - s or cu > u1 + s or cw < w0 - s or cw > w1 + s: continue
                d = [(cu, cw - h / 1.0 / 2 * 1), (cu + h / 2, cw), (cu, cw + h / 2), (cu - h / 2, cw)]
                d = [(cu, cw - h / 2), (cu + h / 2, cw), (cu, cw + h / 2), (cu - h / 2, cw)]
                c = clip_rect(d, u0, u1, w0, w1)
                if len(c) >= 3: g.poly(slot, [g.P(x, y, z) for x, z in c], ca if (i + j) % 2 else cb, (0, 1, 0))
    else:
        nu, nw = int((u1 - u0) / s + 0.5), int((w1 - w0) / s + 0.5)
        for i in range(nu):
            for j in range(nw):
                uu0, uu1 = u0 + (u1 - u0) * i / nu, u0 + (u1 - u0) * (i + 1) / nu
                ww0, ww1 = w0 + (w1 - w0) * j / nw, w0 + (w1 - w0) * (j + 1) / nw
                g.poly(slot, [g.P(uu0, y, ww0), g.P(uu1, y, ww0), g.P(uu1, y, ww1), g.P(uu0, y, ww1)], ca if (i + j) % 2 else cb, (0, 1, 0))


def coffers(g, u0, u1, w0, w1, y, step, beam=0.45, depth=0.5, col=CREAM, trim=GOLDC):
    """coffered ceiling: beams hanging below the ceiling plane at y (ceiling itself at y + depth)"""
    nu, nw = max(1, int((u1 - u0) / step + 0.5)), max(1, int((w1 - w0) / step + 0.5))
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * i / nu
        g.lbox('plaster', u - beam / 2, u + beam / 2, y, y + depth, w0, w1, col, top=False, bottom=True, back=True)
        g.lbox('gold', u - beam / 2 - 0.02, u + beam / 2 + 0.02, y - 0.03, y, w0, w1, trim, top=False, bottom=True)
    for j in range(nw + 1):
        w = w0 + (w1 - w0) * j / nw
        g.lbox('plaster', u0, u1, y, y + depth, w - beam / 2, w + beam / 2, col, top=False, bottom=True, back=True)
    g.shell(u0, u1, w0, w1, y, y + depth, None, None, None, None, 'plaster', shade(col, 1.03), walls=(False,) * 4)
    g.cols = g.cols[:-4]


def pilaster(g, u, w_face, face, y0, y1, width=0.7, depth=0.18, col=CREAM_D, cap=GOLDC):
    """pilaster on a wall plane w = w_face protruding toward the room (face = +1: room at larger w)"""
    w0, w1 = (w_face, w_face + depth * face) if face > 0 else (w_face + depth * face, w_face)
    g.lbox('plaster', u - width / 2, u + width / 2, y0, y1 - 0.5, w0, w1, col, top=False)
    g.lbox('gold', u - width / 2 - 0.06, u + width / 2 + 0.06, y1 - 0.5, y1, min(w0, w1) - 0.06 * (face < 0), max(w0, w1) + 0.06 * (face > 0), cap)
    g.lbox('gold', u - width / 2 - 0.05, u + width / 2 + 0.05, y0, y0 + 0.3, min(w0, w1), max(w0, w1) + 0.04, cap)


def magneta_clock(g, u, w, y):
    """the St. Francis Magneta master clock: carved dark-wood case, gilt mounts, four dials"""
    D = C('#3a2416'); G = GOLDC
    g.llathe('wood', u, w, [(0.75, y), (0.75, y + 0.18), (0.62, y + 0.28), (0.62, y + 0.62), (0.7, y + 0.72), (0.5, y + 0.8)], D, n=8, cap_top=True)
    g.llathe('gold', u, w, [(0.64, y + 0.62), (0.72, y + 0.68), (0.64, y + 0.74)], G, n=8)
    g.llathe('wood', u, w, [(0.42, y + 0.8), (0.36, y + 1.2), (0.34, y + 2.1), (0.44, y + 2.25)], D, n=8)
    g.llathe('gold', u, w, [(0.36, y + 1.5), (0.4, y + 1.56), (0.36, y + 1.62)], G, n=8)
    hy = y + 2.25
    g.lbox('wood', u - 0.55, u + 0.55, hy, hy + 1.1, w - 0.55, w + 0.55, D)
    a, t, n = g.F
    for k in range(4):
        ang = k * math.pi / 2
        du, dw = math.cos(ang), math.sin(ang)
        cu, cw = u + du * 0.56, w + dw * 0.56
        x, z = g.xz(cu, cw)
        nx, nz = t[0] * du + n[0] * dw, t[1] * du + n[1] * dw
        tx, tz = -nz, nx
        for i in range(24):
            a0, a1 = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
            P = lambda r, aa, o=0.0: (x + tx * math.cos(aa) * r + nx * o, hy + 0.55 + math.sin(aa) * r, z + tz * math.cos(aa) * r + nz * o)
            g.poly('plaster', [P(0, 0, 0.01), P(0.36, a0, 0.01), P(0.36, a1, 0.01)], C('#f4efe2'), (nx, 0, nz))
            g.poly('gold', [P(0.36, a0, 0.01), P(0.43, a0, 0.03), P(0.43, a1, 0.03), P(0.36, a1, 0.01)], G, (nx, 0, nz))
        for hh in range(12):
            aa = 2 * math.pi * hh / 12
            p0 = (x + tx * math.cos(aa) * 0.28 + nx * 0.015, hy + 0.55 + math.sin(aa) * 0.28, z + tz * math.cos(aa) * 0.28 + nz * 0.015)
            p1 = (x + tx * math.cos(aa) * 0.33 + nx * 0.015, hy + 0.55 + math.sin(aa) * 0.33, z + tz * math.cos(aa) * 0.33 + nz * 0.015)
            g.rod('metal', p0, p1, 0.012, C('#151515'), n=3)
        g.rod('metal', (x + nx * 0.03, hy + 0.55, z + nz * 0.03), (x + tx * 0.12 + nx * 0.03, hy + 0.55 + 0.12, z + tz * 0.12 + nz * 0.03), 0.015, C('#151515'), n=3)
        g.rod('metal', (x + nx * 0.035, hy + 0.55, z + nz * 0.035), (x - tx * 0.05 + nx * 0.035, hy + 0.55 + 0.26, z - tz * 0.05 + nz * 0.035), 0.01, C('#151515'), n=3)
    ty = hy + 1.1
    g.lbox('gold', u - 0.62, u + 0.62, ty, ty + 0.12, w - 0.62, w + 0.62, G)
    g.llathe('gold', u, w, [(0.5, ty + 0.12), (0.48, ty + 0.35), (0.3, ty + 0.62), (0.08, ty + 0.8), (0.0, ty + 0.82)], G, n=16)
    g.llathe('gold', u, w, [(0.0, ty + 0.82), (0.07, ty + 0.9), (0.0, ty + 1.15)], G, n=8)
    for du in (-0.5, 0.5):
        for dw in (-0.5, 0.5):
            g.llathe('gold', u + du, w + dw, [(0.05, ty + 0.12), (0.07, ty + 0.3), (0.0, ty + 0.45)], G, n=6)
    g.collider(u - 0.8, u + 0.8, w - 0.8, w + 0.8, y, ty + 1)


# ------------------------------------------------------------------------------------------ The St. Francis lobby
def st_francis_int(O):
    F = Geo.frame((971.0, -1392.0), (957.0, -1475.0))   # u north along Powell, w + = east (street)
    g = IGeo(O, F); g.name = 'The St. Francis'
    U0, U1, W0, W1 = 22.0, 62.0, -30.0, -4.5
    y0 = floor_over(g, U0, U1, W0, W1); Hh = 7.2; y1 = y0 + Hh
    g.room('lobby', U0, U1, W0, W1, y0, y1)
    checker(g, 'marble', U0 + 1.2, U1 - 1.2, W0 + 1.2, W1 - 1.2, y0, 1.1, MARB_W, MARB_G)
    for (a0, a1, b0, b1) in ((U0, U1, W0, W0 + 1.2), (U0, U1, W1 - 1.2, W1), (U0, U0 + 1.2, W0 + 1.2, W1 - 1.2), (U1 - 1.2, U1, W0 + 1.2, W1 - 1.2)):
        g.poly('marble', [g.P(a0, y0, b0), g.P(a1, y0, b0), g.P(a1, y0, b1), g.P(a0, y0, b1)], GREEN_M, (0, 1, 0))
    g.shell(U0, U1, W0, W1, y0, y1 + 0.5, None, None, 'plaster', C('#e6dcc4'), None, None, ceiling=False)
    # dado + crown moulding
    for (u0, u1, w0, w1) in ((U0, U1, W0, W0 + 0.08), (U0, U1, W1 - 0.08, W1), (U0, U0 + 0.08, W0, W1), (U1 - 0.08, U1, W0, W1)):
        g.lbox('wood', u0, u1, y0, y0 + 1.15, w0, w1, WOOD)
        g.lbox('gold', u0, u1, y0 + 1.15, y0 + 1.22, w0, w1, GOLDC)
        g.lbox('plaster', u0 - 0.1 * (u0 == U0) + 0, u1, y1 - 0.45, y1 - 0.05, w0, w1, CREAM_D)
    coffers(g, U0, U1, W0, W1, y1, 3.3, col=CREAM, trim=GOLDC)
    # pilasters on the long walls, arched windows (daylight from the Powell courts) on the street wall
    for k in range(11):
        u = U0 + 1.6 + k * (U1 - U0 - 3.2) / 10
        pilaster(g, u, W0, 1, y0, y1 - 0.45)
        pilaster(g, u, W1, -1, y0, y1 - 0.45)
    for k in range(10):
        u = U0 + 1.6 + (k + 0.5) * (U1 - U0 - 3.2) / 10
        if abs(u - 42) < 3: continue
        pts = [(u - 1.1, y0 + 1.5), (u + 1.1, y0 + 1.5)] + [(u + 1.1 * math.cos(a), y0 + 4.8 + 1.1 * math.sin(a)) for a in [math.pi * i / 10 for i in range(11)]]
        g.poly('sky', [g.P(x, y, W1 - 0.1) for x, y in pts], SKY, (-F[2][0], 0, -F[2][1]))
        g.lbox('gold', u - 1.2, u + 1.2, y0 + 1.4, y0 + 1.5, W1 - 0.25, W1 - 0.1, GOLDC)
        g.light('AREA', u, y0 + 3.8, W1 - 0.6, 90, (0.8, 0.88, 1.0), size=(2.0, 3.0), rot=None)
        # sconces on the back wall
        g.lbox('lampI', u - 0.12, u + 0.12, y0 + 2.6, y0 + 3.0, W0 + 0.1, W0 + 0.3, (1.0, 0.8, 0.55, 1.0))
        g.light('POINT', u, y0 + 2.8, W0 + 0.5, 60, (1.0, 0.75, 0.5), radius=0.15)
    # entrance: revolving door in the centre of the street wall
    g.lcyl('glassI', 42, W1 - 1.3, 1.25, y0, y0 + 2.8, C('#c9d4d8'), n=20)
    g.llathe('gold', 42, W1 - 1.3, [(1.3, y0 + 2.8), (1.3, y0 + 3.1), (0.0, y0 + 3.1)], GOLDC, n=20)
    g.lbox('gold', 40.0, 44.0, y0 + 3.1, y0 + 3.9, W1 - 0.2, W1 - 0.05, GOLDC)
    g.text('gold', (g.xz(42, W1 - 0.2), (-F[1][0], -F[1][1]), (-F[2][0], -F[2][1])), 0, y0 + 3.25, 0, 'ENTRANCE', 0.35, GOLDC, depth=0.03)
    # two rows of black-green marble columns with gilt capitals
    for w in (W0 + 9.0, W1 - 7.5):
        for k in range(6):
            u = U0 + 4.0 + k * (U1 - U0 - 8.0) / 5
            g.lbox('granite', u - 0.6, u + 0.6, y0, y0 + 0.35, w - 0.6, w + 0.6, C('#1d2620'))
            g.lbox('granite', u - 0.5, u + 0.5, y0 + 0.35, y1 - 0.8, w - 0.5, w + 0.5, GREEN_M)
            g.lbox('gold', u - 0.58, u + 0.58, y1 - 0.8, y1 - 0.55, w - 0.58, w + 0.58, GOLDC)
            g.lbox('gold', u - 0.72, u + 0.72, y1 - 0.55, y1, w - 0.72, w + 0.72, GOLDC)
            g.collider(u - 0.6, u + 0.6, w - 0.6, w + 0.6, y0, y1)
    # the Magneta clock in the middle of the lobby, chandeliers along the axis
    cw = (W0 + W1) / 2 + 0.5
    magneta_clock(g, 42.0, cw, y0)
    for u in (28.0, 42.0, 56.0):
        prop(g, 'Chandelier_01', u, y1 + 0.3 - (0.0 if u != 42 else 0.6), cw, fit=(2.6, None, None), hang=True)
        g.llathe('gold', u, cw, [(0.05, y1 + 0.5), (0.05, y1 - 0.4)], GOLD_I, n=6)
        g.light('POINT', u, y1 - 1.6 - (0.0 if u != 42 else 0.6), cw, 1500, (1.0, 0.8, 0.58), radius=0.7)
    # reception desk along the back wall
    g.lbox('wood', 30.0, 54.0, y0, y0 + 1.08, W0 + 3.0, W0 + 3.8, WOOD_L, collide=True)
    g.lbox('marble', 29.9, 54.1, y0 + 1.08, y0 + 1.16, W0 + 2.9, W0 + 3.95, C('#d8d0c0'))
    for k in range(6):
        g.lbox('gold', 31.0 + k * 4.2, 31.4 + k * 4.2, y0 + 0.2, y0 + 0.95, W0 + 3.8, W0 + 3.84, GOLDC)
    g.lbox('wood', 30.0, 54.0, y0, y0 + 3.4, W0 + 0.1, W0 + 0.45, WOOD)
    g.text('gold', (g.xz(42, W0 + 0.45), F[1], F[2]), 0, y0 + 2.5, 0, 'THE ST. FRANCIS', 0.42, GOLDC, depth=0.03)
    for k in range(5):
        g.lbox('lampI', 32.5 + k * 4.8, 33.0 + k * 4.8, y0 + 1.16, y0 + 1.6, W0 + 3.2, W0 + 3.6, (1.0, 0.82, 0.6, 1.0))
    # seating groups on rugs
    for k, (u, w) in enumerate(((28.5, W1 - 3.5), (55.5, W1 - 3.5), (27.0, cw), (57.0, cw))):
        g.lbox('carpet', u - 3.0, u + 3.0, y0, y0 + 0.02, w - 2.2, w + 2.2, C('#7a2a2c'))
        g.lbox('carpet', u - 2.7, u + 2.7, y0 + 0.02, y0 + 0.025, w - 1.9, w + 1.9, C('#a8813e'))
        prop(g, 'Sofa_01', u, y0 + 0.025, w - 1.45, face=(u, w), fit=(2.3, None, None))
        prop(g, 'Sofa_01', u, y0 + 0.025, w + 1.45, face=(u, w), fit=(2.3, None, None))
        for su in (-1, 1): prop(g, 'ArmChair_01', u + su * 2.0, y0 + 0.025, w, face=(u, w), fit=(None, 1.0, None))
        prop(g, 'CoffeeTable_01', u, y0 + 0.025, w, yaw=math.pi / 2, fit=(1.3, None, None))
        prop(g, 'brass_vase_01', u, y0 + 0.47, w, fit=(None, 0.4, None), collide=False)
        g.spot(u + 1.2, y0, w - 1.45, u, w, 'stand'); g.spot(u - 2.6, y0, w + 1.0, u, w, 'stand')
    for (u, w) in ((U0 + 1.5, W0 + 1.5), (U1 - 1.5, W0 + 1.5), (U0 + 1.5, W1 - 1.5), (U1 - 1.5, W1 - 1.5), (36.0, W0 + 5.5), (48.0, W0 + 5.5)):
        prop(g, 'pachira_aquatica_01', u, y0, w, yaw=u, fit=(None, 2.3, None))
    for u in (34.0, 38.5, 45.5, 50.0): g.spot(u, y0, W0 + 4.6, u, W0 + 3.0, 'stand')   # guests at the front desk
    # soft fill from the coffers (cove light)
    for u in (30.0, 42.0, 54.0):
        g.light('AREA', u, y1 - 0.2, cw, 120, (1.0, 0.86, 0.7), size=(6.0, 10.0))
    # exterior door: marquee on the centre wing (street side, w > 0)
    g.shot_at(U0 + 3.0, y0 + 1.7, W1 - 2.0, U1 - 8.0, y0 + 2.6, W0 + 4.0)
    g.door('The St. Francis', 42.0, 2.2, sidewalk(*g.xz(42.0, 2.2)), 42.0, W1 - 3.3, y0)
    return g


def street_frame(ring_id, dx, dz):
    """frame on the building edge facing (dx, dz): u along the facade, w + = street"""
    from hero_wave1 import edge_facing
    a, b = edge_facing(ring_of(ring_id), dx, dz)
    return Geo.frame(a, b), v2len(v2sub(b, a))


def rail(g, pts, y, h, col=GOLDC, post=1.2, glass=False):
    """balustrade along a polyline of (u, w) points at floor y"""
    for k in range(len(pts) - 1):
        (u0, w0), (u1, w1) = pts[k], pts[k + 1]
        A, B = g.P(u0, y + h, w0), g.P(u1, y + h, w1)
        g.rod('gold' if col == GOLDC else 'metal', A, B, 0.04, col, n=6)
        L = math.hypot(u1 - u0, w1 - w0); n = max(1, int(L / post))
        for i in range(n + 1):
            t = i / n; u, w = u0 + (u1 - u0) * t, w0 + (w1 - w0) * t
            g.rod('gold' if col == GOLDC else 'metal', g.P(u, y, w), g.P(u, y + h, w), 0.025, col, n=4)
        if glass:
            g.poly('glassI', [g.P(u0, y + 0.05, w0), g.P(u1, y + 0.05, w1), g.P(u1, y + h - 0.05, w1), g.P(u0, y + h - 0.05, w0)], C('#d0dadc'), None)


def stairs(g, u0, w0, u1, w1, y0, y1, width, col, slot='marble', rail_col=None):
    """straight stair from (u0, w0, y0) to (u1, w1, y1) (steps along the segment) + walkable ramp deck"""
    L = math.hypot(u1 - u0, w1 - w0); nstep = max(2, int((y1 - y0) / 0.17))
    du, dw = (u1 - u0) / L, (w1 - w0) / L; pu, pw = -dw, du
    for k in range(nstep):
        t0, t1 = k / nstep, (k + 1) / nstep
        ya = y0 + (y1 - y0) * (k + 1) / nstep
        ca = (u0 + (u1 - u0) * t0, w0 + (w1 - w0) * t0); cb = (u0 + (u1 - u0) * t1, w0 + (w1 - w0) * t1)
        q = lambda c, s: (c[0] + pu * width / 2 * s, c[1] + pw * width / 2 * s)
        (a1, a2), (b1, b2) = (q(ca, -1), q(ca, 1)), (q(cb, -1), q(cb, 1))
        g.poly(slot, [g.P(a1[0], ya, a1[1]), g.P(a2[0], ya, a2[1]), g.P(b2[0], ya, b2[1]), g.P(b1[0], ya, b1[1])], col, (0, 1, 0))
        _t, _n = g.F[1], g.F[2]
        g.poly(slot, [g.P(a1[0], ya - (y1 - y0) / nstep, a1[1]), g.P(a2[0], ya - (y1 - y0) / nstep, a2[1]), g.P(a2[0], ya, a2[1]), g.P(a1[0], ya, a1[1])], shade(col, 0.92),
               (-(_t[0] * du + _n[0] * dw), 0, -(_t[1] * du + _n[1] * dw)))
    for s in (-1, 1):
        A = (u0 + pu * width / 2 * s, w0 + pw * width / 2 * s); B = (u1 + pu * width / 2 * s, w1 + pw * width / 2 * s)
        g.poly(slot, [g.P(A[0], y0 - 0.3, A[1]), g.P(B[0], y1 - 0.3, B[1]), g.P(B[0], y1, B[1]), g.P(A[0], y0, A[1])], shade(col, 0.85), None)
        if rail_col: rail(g, [A, B], 0, 0, rail_col) if False else g.rod('metal', g.P(A[0], y0 + 0.95, A[1]), g.P(B[0], y1 + 0.95, B[1]), 0.035, rail_col, n=6)
    a, b = g.xz(u0, w0), g.xz(u1, w1)
    g.decks.append({'pts': [[round(a[0], 2), round(a[1], 2), round(y0, 3)], [round(b[0], 2), round(b[1], 2), round(y1, 3)]], 'width': round(width, 2), 'tunnel': True})


def tree_in_planter(g, u, w, y, h=4.5, seed=3, R=1.9):
    import random
    Rr = random.Random(seed)
    g.llathe('stone', u, w, [(0.9, y), (0.9, y + 0.45), (0.8, y + 0.45), (0.0, y + 0.42)], C('#cfc8bb'), n=18)
    x, z = g.xz(u, w)
    g.rod('bark', (x, y + 0.4, z), (x + 0.1, y + h * 0.65, z), 0.12, C('#6d5a44'), n=7)
    for k in range(260):
        a = Rr.random() * 2 * math.pi; e = Rr.uniform(-0.4, 1.2); rr = R * Rr.uniform(0.3, 1.05)
        c = (x + math.cos(a) * math.cos(e) * rr, y + h * 0.72 + math.sin(e) * rr * 0.65, z + math.sin(a) * math.cos(e) * rr)
        s = 0.3 + Rr.random() * 0.2
        g.poly('leaf', [(c[0] - s, c[1], c[2]), (c[0], c[1] + s * 0.4, c[2] - s), (c[0] + s, c[1], c[2]), (c[0], c[1] - s * 0.3, c[2] + s)], C('#3f6b2e') if k % 3 else C('#557f35'), (0, 1, 0))


def dept_store(g, U0, U1, W0, W1, y0, Hh, pal, brand, seed=1):
    """department-store ground floor: gloss tiles, mirrored column grid, lit counters, escalators, light panels"""
    import random
    R = random.Random(seed)
    y1 = y0 + Hh
    checker(g, pal['floor_slot'], U0, U1, W0, W1, y0, 1.2, pal['floor'], shade(pal['floor'], 0.93), diag=False)
    g.shell(U0, U1, W0, W1, y0, y1, None, None, 'plaster', pal['wall'], 'plaster', pal['ceil'])
    # darker ceiling plane with recessed warm downlights (spot pools on the fixtures) instead of a wall of glowing panels
    g.lbox('plaster', U0, U1, y1 - 0.06, y1 - 0.05, W0, W1, pal.get('ceil_dark', C('#6b655c')), top=False, bottom=True, sides=False, back=False)
    nu, nw = int((U1 - U0) / 3.0), int((W1 - W0) / 3.0)
    for i in range(nu):
        for j in range(nw):
            u = U0 + (i + 0.5) * (U1 - U0) / nu; w = W0 + (j + 0.5) * (W1 - W0) / nw
            x_, z_ = g.xz(u, w)
            g.lathe('lampI', x_, z_, [(0.0, y1 - 0.07), (0.11, y1 - 0.07), (0.0, y1 - 0.065)], (1.0, 0.86, 0.66, 1.0), n=10)
            if (i + j) % 2 == 0: g.light('SPOT', u, y1 - 0.12, w, 260, (1.0, 0.84, 0.62), radius=0.05)
    # column grid
    for i in range(1, int((U1 - U0) / 9.0) + 1):
        u = U0 + i * (U1 - U0) / (int((U1 - U0) / 9.0) + 1)
        for j in range(1, int((W1 - W0) / 9.0) + 1):
            w = W0 + j * (W1 - W0) / (int((W1 - W0) / 9.0) + 1)
            g.lbox('paint', u - 0.45, u + 0.45, y0, y1, w - 0.45, w + 0.45, pal['col'], top=False)
            g.lbox('chrome', u - 0.47, u + 0.47, y0 + 0.9, y0 + 2.6, w - 0.47, w + 0.47, C('#d8dde0'), top=True, bottom=True)
            g.collider(u - 0.5, u + 0.5, w - 0.5, w + 0.5, y0, y1)
    # counters: rectangular islands of lit glass cases + back fixtures with brand names
    cu0, cu1 = U0 + 5, U1 - 5
    for i in range(4):
        for j in range(2):
            uc = cu0 + (i + 0.5) * (cu1 - cu0) / 4; wc = W1 - 14.0 - j * 9.0
            if abs(uc - (U0 + U1) / 2) < 5 and j == 1: continue
            for (a0, a1, b0, b1) in ((uc - 3, uc + 3, wc - 1.3, wc - 0.7), (uc - 3, uc + 3, wc + 0.7, wc + 1.3), (uc - 3, uc - 2.4, wc - 0.7, wc + 0.7), (uc + 2.4, uc + 3, wc - 0.7, wc + 0.7)):
                g.lbox('paint', a0, a1, y0, y0 + 0.75, b0, b1, pal['counter'])
                g.lbox('lampI', a0 + 0.05, a1 - 0.05, y0 + 0.75, y0 + 0.8, b0 + 0.05, b1 - 0.05, (1.0, 0.95, 0.88, 1.0))
                g.lbox('glassI', a0, a1, y0 + 0.8, y0 + 1.0, b0, b1, C('#d6e0e2'), top=True)
                for k in range(3):
                    pu = a0 + (a1 - a0) * (k + 0.5) / 3; pw = (b0 + b1) / 2
                    g.llathe('glassI' if k % 2 else 'gold', pu, pw, [(0.05, y0 + 0.8), (0.06, y0 + 0.9), (0.03, y0 + 0.93), (0.0, y0 + 0.95)], pal['accent'], n=8)
            g.lbox('paint', uc - 1.8, uc + 1.8, y0, y0 + 2.4, wc - 0.2, wc + 0.2, pal['fixture'])
            for sgn in (-1, 1):
                g.lbox('lampI', uc - 1.5, uc + 1.5, y0 + 1.9, y0 + 2.2, wc + 0.2 * sgn, wc + 0.23 * sgn, (1.0, 0.97, 0.92, 1.0))
            g.collider(uc - 3, uc + 3, wc - 1.3, wc + 1.3, y0, y0 + 2.4)
    # escalator pair in the middle of the back half
    um = (U0 + U1) / 2; wb = W0 + 8
    for sgn in (-1, 1):
        u = um + sgn * 1.2
        g.lbox('metal', u - 0.55, u + 0.55, y0, y0 + 0.9, wb - 6, wb + 1, C('#8e9296'))
        for k in range(18):
            t = k / 18
            g.lbox('metal', u - 0.5, u + 0.5, y0 + 0.9 + t * (Hh - 1.2) - 0.05, y0 + 0.9 + t * (Hh - 1.2), wb + 1 - t * 7 - 0.4, wb + 1 - t * 7, C('#5a5e62'))
        g.poly('glassI', [g.P(u - 0.55, y0 + 1.0, wb + 1), g.P(u - 0.55, y1, wb - 6), g.P(u - 0.55, y1 + 0.2, wb - 6), g.P(u - 0.55, y0 + 2.0, wb + 1)], C('#d6e0e2'), None)
    g.collider(um - 2.0, um + 2.0, wb - 6, wb + 1, y0, y1)
    # brand wall
    g.text('neonI', (g.xz((U0 + U1) / 2, W0 + 0.05), g.F[1], g.F[2]), 0, y0 + 3.2, 0, brand, 1.1, pal['brand'], depth=0.06)
    # cosmetics hall at the street doors: lit glass counters in rows, backlit brand towers, bottles on mirrored risers
    BR = ['AURELLE', 'MAISON VERE', 'LUMIERE', 'NOVA SKIN', 'CASSIS', 'ORCHID & OAK', 'SOLENNE', 'BLANC PARIS']
    import random as _r
    Rc = _r.Random(seed + 40)
    um = (U0 + U1) / 2
    for i in range(4):
        for side in (-1, 1):
            uc = um + side * (4.0 + i * 5.2); wc = W1 - 5.5
            if uc < U0 + 3 or uc > U1 - 3: continue
            # counter U: front + two returns (glass top cases lit from inside), tower behind with the brand
            for (a0, a1, b0, b1) in ((uc - 1.8, uc + 1.8, wc + 0.7, wc + 1.2), (uc - 1.8, uc - 1.3, wc - 0.6, wc + 0.7), (uc + 1.3, uc + 1.8, wc - 0.6, wc + 0.7)):
                g.lbox('wood', a0, a1, y0, y0 + 0.85, b0, b1, pal.get('cosm', C('#1d1b1a')))
                g.lbox('lampI', a0 + 0.04, a1 - 0.04, y0 + 0.85, y0 + 0.88, b0 + 0.04, b1 - 0.04, (1.0, 0.93, 0.82, 1.0))
                g.lbox('glassI', a0, a1, y0 + 0.88, y0 + 1.12, b0, b1, C('#d6e0e2'), top=True)
                for k in range(int((a1 - a0) / 0.14)):
                    pu = a0 + 0.07 + k * 0.14; pw = (b0 + b1) / 2
                    x_, z_ = g.xz(pu, pw)
                    hh = 0.06 + Rc.random() * 0.1
                    g.lathe('d_paint', x_, z_, [(0.025, y0 + 0.88), (0.03, y0 + 0.88 + hh), (0.012, y0 + 0.9 + hh), (0.012, y0 + 0.93 + hh), (0.0, y0 + 0.93 + hh)],
                            [C('#e8d2b0'), C('#c94a5a'), C('#2a2a2e'), C('#d9c8e8'), C('#f2efe8'), C('#c9a24a')][Rc.randint(0, 5)], n=6)
            g.lbox('wood', uc - 1.6, uc + 1.6, y0, y0 + 2.6, wc - 1.1, wc - 0.8, pal.get('cosm', C('#1d1b1a')))
            g.lbox('ceilglow', uc - 1.45, uc + 1.45, y0 + 1.0, y0 + 2.3, wc - 0.81, wc - 0.79, (1.0, 0.95, 0.88, 1.0))
            for r_ in range(3):
                yy = y0 + 1.15 + r_ * 0.4
                g.lbox('chrome', uc - 1.4, uc + 1.4, yy, yy + 0.02, wc - 0.8, wc - 0.55, C('#d8dde0'), top=True, bottom=True)
                for k in range(16):
                    x_, z_ = g.xz(uc - 1.3 + k * 0.17, wc - 0.68)
                    g.lathe('d_paint', x_, z_, [(0.03, yy + 0.02), (0.03, yy + 0.16), (0.0, yy + 0.18)], [C('#f2efe8'), C('#c94a5a'), C('#1d1b1a'), C('#c9a24a')][(k + r_) % 4], n=6)
            Ft = (g.xz(uc, wc - 0.79), (g.F[1][0], g.F[1][1]), (-g.F[2][0], -g.F[2][1]))
            g.text('d_x_gold', Ft, 0, y0 + 2.36, 0.0, BR[(i * 2 + (side > 0)) % len(BR)], 0.2, C('#e9d8b0'), depth=0.02)
            g.light('SPOT', uc, y1 - 0.2, wc, 420, (1.0, 0.86, 0.66), radius=0.05)
            g.collider(uc - 1.8, uc + 1.8, wc - 1.1, wc + 1.2, y0, y0 + 2.6)
            g.spot(uc, y0, wc + 1.9, uc, wc, 'stand'); g.spot(uc + 0.9, y0, wc + 0.1, uc, wc + 1.0, 'stand')
    # review camera: from the entrance corner, diagonally across the cosmetics hall into the racks
    g.shot_at(U0 + 3.0, y0 + 1.7, W1 - 2.0, um + 6.0, y0 + 1.2, W0 + (W1 - W0) * 0.45)
    for u in (U0 + 3, U1 - 3):
        potted_plant(g, u, W1 - 2.5, y0, seed=int(u))


# ------------------------------------------------------------------------------------------ Neiman Marcus / City of Paris rotunda
def neiman_int(O):
    rx, rz, rr = NEIMAN_ROT
    F = Geo.frame((1145.0, -1356.0), (1138.0, -1398.0))    # Stockton face, u north, w + = west (street)
    F = (F[0], F[1], F[2])
    g = IGeo(O, F); g.name = 'City of Paris Rotunda'; g.sky_k = 2.5
    # local coords of the rotunda centre
    a, t, n = F
    cu = (rx - a[0]) * t[0] + (rz - a[1]) * t[1]; cw = (rx - a[0]) * n[0] + (rz - a[1]) * n[1]
    R = rr - 0.35
    hs = [H(rx + math.cos(k) * R, rz + math.sin(k) * R) for k in range(0, 628, 40)]
    y0 = max(hs + [H(rx, rz)]) + 0.2
    levels = [y0, y0 + 6.2, y0 + 11.2, y0 + 16.2]
    ytop = y0 + 21.5
    g.room('rotunda', cu - R, cu + R, cw - R, cw + R, y0, ytop + 3.5)
    N = 48
    # floor: concentric marble rings + star inlay
    rings = [(0.0, 1.6, C('#b89a5a')), (1.6, 2.2, C('#2c2c2c')), (2.2, 5.5, C('#eee8de')), (5.5, 5.9, C('#9d8b6e')), (5.9, R, C('#e2dbcf'))]
    for (r0, r1, cc) in rings:
        for i in range(N):
            a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
            col = cc if not (r0 == 2.2 and i % 4 in (0, 1)) else C('#cbbfa9')
            pts = [(rx + math.cos(a0) * r0, y0, rz + math.sin(a0) * r0), (rx + math.cos(a1) * r0, y0, rz + math.sin(a1) * r0), (rx + math.cos(a1) * r1, y0, rz + math.sin(a1) * r1), (rx + math.cos(a0) * r1, y0, rz + math.sin(a0) * r1)]
            if r0 == 0: pts = pts[1:]
            g.poly('marble', pts, col, (0, 1, 0))
    # outer wall: glass drum on the street half, plaster with arched store openings on the building half
    cxz = (rx, rz)
    corner = (1138.0, -1398.0)
    out_dir = v2norm(v2sub(corner, cxz))
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N; am = (a0 + a1) / 2
        dmid = (math.cos(am), math.sin(am))
        street = dmid[0] * out_dir[0] + dmid[1] * out_dir[1] > -0.05
        for li, yl in enumerate(levels + [ytop]):
            if li == len(levels): break
            yb, yt = yl, (levels[li + 1] if li + 1 < len(levels) else ytop)
            P = lambda a, y, r=R: (rx + math.cos(a) * r, y, rz + math.sin(a) * r)
            if street:
                g.poly('glassI', [P(a0, yb), P(a1, yb), P(a1, yt), P(a0, yt)], C('#d0dadc'), (-dmid[0], 0, -dmid[1]))
                g.poly('bakesky', [P(a0, yb, rr + 1.5), P(a1, yb, rr + 1.5), P(a1, yt, rr + 1.5), P(a0, yt, rr + 1.5)], SKY, (-dmid[0], 0, -dmid[1]))
            else:
                g.poly('plaster', [P(a0, yb), P(a1, yb), P(a1, yt), P(a0, yt)], C('#efe7d8'), (-dmid[0], 0, -dmid[1]))
                if li == 0 and i % 3 == 1:
                    g.poly('lampI', [P(a0 + 0.02, yb + 0.2, R - 0.05), P(a1 - 0.02, yb + 0.2, R - 0.05), P(a1 - 0.02, yb + 3.6, R - 0.05), P(a0 + 0.02, yb + 3.6, R - 0.05)], (0.9, 0.75, 0.55, 1.0), (-dmid[0], 0, -dmid[1]))
    # balconies (annular floor plates) with white-and-gold balustrades, soffit downlights, columns
    for li, yl in enumerate(levels[1:]):
        ri = 7.2 - li * 0.2
        for i in range(N):
            a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
            P = lambda a, y, r: (rx + math.cos(a) * r, y, rz + math.sin(a) * r)
            g.poly('marble', [P(a0, yl, ri), P(a1, yl, ri), P(a1, yl, R), P(a0, yl, R)], C('#e6e0d4'), (0, 1, 0))
            g.poly('plaster', [P(a0, yl - 0.6, ri), P(a1, yl - 0.6, ri), P(a1, yl - 0.6, R), P(a0, yl - 0.6, R)], C('#f1ebe0'), (0, -1, 0))
            g.poly('plaster', [P(a0, yl - 0.6, ri), P(a1, yl - 0.6, ri), P(a1, yl, ri), P(a0, yl, ri)], C('#f1ebe0'), (-math.cos(a0), 0, -math.sin(a0)))
            g.poly('gold', [P(a0, yl - 0.35, ri - 0.02), P(a1, yl - 0.35, ri - 0.02), P(a1, yl - 0.25, ri - 0.02), P(a0, yl - 0.25, ri - 0.02)], GOLDC, (-math.cos(a0), 0, -math.sin(a0)))
            # balustrade: rail + balusters
            g.poly('plaster', [P(a0, yl + 0.95, ri + 0.02), P(a1, yl + 0.95, ri + 0.02), P(a1, yl + 1.05, ri + 0.02), P(a0, yl + 1.05, ri + 0.02)], C('#f6f1e6'), (-math.cos(a0), 0, -math.sin(a0)))
            for k in range(3):
                ab = a0 + (a1 - a0) * (k + 0.5) / 3
                x, z = rx + math.cos(ab) * (ri + 0.12), rz + math.sin(ab) * (ri + 0.12)
                g.lathe('plaster', x, z, [(0.05, yl), (0.08, yl + 0.3), (0.045, yl + 0.6), (0.07, yl + 0.85), (0.05, yl + 0.95)], C('#f6f1e6'), n=6)
            if i % 6 == 0:
                g.light('POINT', 0, 0, 0, 0)
                g.lights.pop()
                lp = P((a0 + a1) / 2, yl - 0.75, (ri + R) / 2)
                g.lights.append(('POINT', lp, 55, (1.0, 0.82, 0.62), 0.1, None, None))
                g.lathe('lampI', lp[0], lp[2], [(0.0, yl - 0.62), (0.14, yl - 0.62), (0.0, yl - 0.6)], (1.0, 0.85, 0.6, 1.0), n=8)
        for k in range(8):
            ac = 2 * math.pi * (k + 0.5) / 8
            x, z = rx + math.cos(ac) * (ri - 0.35), rz + math.sin(ac) * (ri - 0.35)
            yb = levels[li]
            g.lathe('plaster', x, z, [(0.3, yb), (0.3, yb + 0.3), (0.24, yb + 0.4), (0.22, yl - 1.3), (0.3, yl - 0.9), (0.36, yl - 0.6)], C('#f4efe4'), n=12)
            g.lathe('gold', x, z, [(0.23, yl - 1.3), (0.31, yl - 1.0), (0.25, yl - 0.95)], GOLDC, n=12)
            g.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 0.32, 'hz': 0.32, 'yaw': 0, 'yMin': round(yb, 2), 'yMax': round(yl, 2)})
        # walkable balcony (annulus deck) + balustrade collider at its inner edge
        g.ring_deck(rx, rz, ri, R - 0.2, yl, n=32)
        g.ring_rail(rx, rz, ri + 0.1, yl - 0.2, yl + 1.1, n=40)
    # ceiling ring + the stained-glass dome (ship of the City of Paris in the centre)
    Rd = 7.0; yd = ytop
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
        P = lambda a, y, r: (rx + math.cos(a) * r, y, rz + math.sin(a) * r)
        g.poly('plaster', [P(a0, yd, Rd), P(a1, yd, Rd), P(a1, yd, R), P(a0, yd, R)], C('#efe6d4'), (0, -1, 0))
        g.poly('gold', [P(a0, yd - 0.05, Rd), P(a1, yd - 0.05, Rd), P(a1, yd - 0.05, Rd + 0.4), P(a0, yd - 0.05, Rd + 0.4)], GOLDC, (0, -1, 0))
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
        for k in range(6):
            r0, r1 = Rd * (1 - k / 6), Rd * (1 - (k + 1) / 6)
            h0, h1 = yd + 3.6 * (1 - (r0 / Rd) ** 2), yd + 3.6 * (1 - (r1 / Rd) ** 2)
            P = lambda a, y, r: (rx + math.cos(a) * r, y, rz + math.sin(a) * r)
            sector = (i // 3) % 2
            pal = [C('#e9b44c'), C('#f2d58a'), C('#d7913a'), C('#f6e7b7'), C('#7aa6b8'), C('#efc66e')]
            col = pal[(k + sector * 3) % 6] if k != 3 else (C('#6f9fb5') if i % 2 else C('#e0a94a'))
            if k == 5: col = C('#f8ecc4')
            pts = [P(a0, h0, r0), P(a1, h0, r0), P(a1, h1, r1), P(a0, h1, r1)]
            if r1 < 1e-3: pts = pts[:3]
            g.poly('stained', pts, col, (0, -1, 0))
            if i % 4 == 0:
                g.rod('metal', P(a0, h0 - 0.02, r0), P(a0, h1 - 0.02, r1), 0.025, C('#1c1c1c'), n=3)
    # the ship medallion (hull + two sails), hung just below the dome's crown
    sy = yd + 3.25
    hull = [(-1.1, 0.0), (1.1, 0.0), (0.8, -0.35), (-0.8, -0.35)]
    for pts, col in ((hull, C('#3b2a1a')), ([(-0.6, 0.05), (0.0, 0.05), (-0.3, 1.1)], C('#f4f0e2')), ([(0.05, 0.05), (0.7, 0.05), (0.35, 0.95)], C('#e9e3cf'))):
        g.poly('stained', [(rx + p[0], sy - 0.05, rz + p[1] * 0.9) for p in pts], col, (0, -1, 0))
    g.poly('bakesky', [(rx + math.cos(2 * math.pi * i / 16) * Rd, yd + 5.0, rz + math.sin(2 * math.pi * i / 16) * Rd) for i in range(16)], SKY, (0, -1, 0))
    # ground floor: cosmetic counters in a ring + a central round display
    for k in range(6):
        ac = 2 * math.pi * (k + 0.25) / 6
        for s_ in range(3):
            aa = ac + (s_ - 1) * 0.16
            x, z = rx + math.cos(aa) * 4.4, rz + math.sin(aa) * 4.4
            g.box('paint', x - 0.45, x + 0.45, y0, y0 + 0.9, z - 0.45, z + 0.45, C('#f2efe9'), yaw=-aa)
            g.box('lampI', x - 0.4, x + 0.4, y0 + 0.9, y0 + 0.93, z - 0.4, z + 0.4, (1.0, 0.95, 0.88, 1.0), yaw=-aa)
            g.box('glassI', x - 0.45, x + 0.45, y0 + 0.93, y0 + 1.15, z - 0.45, z + 0.45, C('#d8e2e4'), yaw=-aa)
        x, z = rx + math.cos(ac) * 4.4, rz + math.sin(ac) * 4.4
        g.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 1.3, 'hz': 0.5, 'yaw': round(-ac, 3), 'yMin': y0, 'yMax': y0 + 1.2})
    g.lathe('marble', rx, rz, [(1.5, y0), (1.5, y0 + 0.8), (1.6, y0 + 0.85), (0.0, y0 + 0.85)], C('#d9d2c5'), n=32)
    g.lathe('gold', rx, rz, [(1.2, y0 + 0.85), (0.5, y0 + 1.4), (0.3, y0 + 1.9), (0.0, y0 + 2.0)], GOLDC, n=16)
    for k in range(10):
        aa = 2 * math.pi * k / 10
        g.lathe('glassI', rx + math.cos(aa) * 1.1, rz + math.sin(aa) * 1.1, [(0.07, y0 + 0.85), (0.08, y0 + 1.0), (0.03, y0 + 1.05), (0.0, y0 + 1.1)], C('#e6d9b8'), n=8)
    g.cols.append({'x': round(rx, 2), 'z': round(rz, 2), 'hx': 1.6, 'hz': 1.6, 'yaw': 0, 'yMin': y0, 'yMax': y0 + 2})
    g.light('POINT', cu, y0 + 12, cw, 800, (1.0, 0.9, 0.75), radius=1.5)
    # circular wall colliders (polygon of short boxes)
    for i in range(24):
        a0 = 2 * math.pi * i / 24; am = a0 + math.pi / 24
        x, z = rx + math.cos(am) * (R + 0.3), rz + math.sin(am) * (R + 0.3)
        g.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': round(R * math.pi / 24 + 0.3, 2), 'hz': 0.3, 'yaw': round(math.atan2(-math.cos(am), -math.sin(am)) * 0 + (-(am + math.pi / 2)) * -1 * -1, 4), 'yMin': y0 - 1, 'yMax': ytop})
    # fix yaw of the ring colliders: local +X tangent (cos yaw, -sin yaw) = (-sin am, cos am)
    for c in g.cols[-24:]:
        am = math.atan2(c['z'] - rz, c['x'] - rx)
        c['yaw'] = round(math.atan2(-math.cos(am), -math.sin(am)), 4)
    # escalators on the building side: ground <-> level 2 <-> 3 <-> the Rotunda restaurant on top
    back = math.atan2(-out_dir[1], -out_dir[0])
    for li in range(3):
        ya, yb_ = levels[li], levels[li + 1]
        ra = (R - 1.6) if li == 0 else ((7.2 - (li - 1) * 0.2) + R) / 2
        rb = ((7.2 - li * 0.2) + R) / 2
        aa, ab = back + 0.35 - li * 0.22, back - 0.35 - li * 0.22
        pa = (rx + math.cos(aa) * ra, rz + math.sin(aa) * ra); pb = (rx + math.cos(ab) * rb, rz + math.sin(ab) * rb)
        la = ['Escalator up · Level 2', 'Escalator up · Level 3', 'Escalator up · The Rotunda'][li]
        lb = ['Escalator down · Street level', 'Escalator down · Level 2', 'Escalator down · Level 3'][li]
        if not hasattr(g, 'links'): g.links = []
        g.links.append({'a': [round(pa[0], 2), round(ya, 2), round(pa[1], 2), round(math.atan2(-(rx - pa[0]), -(rz - pa[1])), 3)],
                        'b': [round(pb[0], 2), round(yb_, 2), round(pb[1], 2), round(math.atan2(-(rx - pb[0]), -(rz - pb[1])), 3)], 'la': la, 'lb': lb, 'verb': 'ride'})
        # the escalator itself: a brass-sided ramp along the wall between the two landings
        for s_ in range(14):
            t0 = s_ / 14
            am_ = aa + (ab - aa) * t0; rm_ = ra + (rb - ra) * t0; ym_ = ya + (yb_ - ya) * t0
            x_, z_ = rx + math.cos(am_) * (R - 0.9), rz + math.sin(am_) * (R - 0.9)
            g.box('metal', x_ - 0.55, x_ + 0.55, ym_ - 0.25, ym_ + 0.05, z_ - 0.35, z_ + 0.35, C('#8f8a80'), yaw=-am_)
            g.box('gold', x_ - 0.6, x_ + 0.6, ym_ + 0.05, ym_ + 0.95, z_ - 0.05, z_ + 0.05, GOLDC, yaw=-am_ + math.pi / 2)
    # the Rotunda restaurant on the top balcony: clothed tables for two, a few diners and waiters
    from hero_props import prop
    ytopL = levels[3]; rt = ((7.2 - 2 * 0.2) + R) / 2
    for k in range(16):
        at = back + math.pi * 0.35 + 2 * math.pi * k / 20
        if k >= 14: break
        x_, z_ = rx + math.cos(at) * rt, rz + math.sin(at) * rt
        g.lathe('fabric', x_, z_, [(0.48, ytopL), (0.5, ytopL + 0.74), (0.46, ytopL + 0.76), (0.0, ytopL + 0.77)], C('#f6f2ea'), n=16)
        tng = (-math.sin(at), math.cos(at))
        for sgn in (-1, 1):
            cx_, cz_ = x_ + tng[0] * 0.85 * sgn, z_ + tng[1] * 0.85 * sgn
            g.props = getattr(g, 'props', [])
            g.props.append({'variant': None, 'asset': 'dining_chair_02', 'x': cx_, 'y': ytopL, 'z': cz_, 'dx': x_ - cx_, 'dz': z_ - cz_, 's': 1.0, 'fit': (None, 1.05, None), 'tris': None, 'collide': False, 'hang': False})
            if k % 3 == sgn + 1: g.spots.append([round(cx_, 2), round(ytopL, 2), round(cz_, 2), round(math.atan2(-(x_ - cx_), -(z_ - cz_)), 3), 'sit'])
        g.cols.append({'x': round(x_, 2), 'z': round(z_, 2), 'hx': 0.55, 'hz': 0.55, 'yaw': 0, 'yMin': ytopL, 'yMax': ytopL + 0.8})
    for k in range(6):
        aw = back + 2 * math.pi * k / 6 + 0.2
        for li in (0, 1, 2):
            yl_ = levels[li]; rw = (R - 2.2) if li == 0 else ((7.2 - (li - 1) * 0.2) + R) / 2
            if (k + li) % 2: g.spots.append([round(rx + math.cos(aw + li) * rw, 2), round(yl_, 2), round(rz + math.sin(aw + li) * rw, 2), None, 'stand'])
    # review camera: from the level-3 balcony across the rotunda
    sx, sz = rx + out_dir[0] * (R - 1.5), rz + out_dir[1] * (R - 1.5)
    g.shot = [rx + out_dir[0] * (R - 2.0), y0 + 1.7, rz + out_dir[1] * (R - 2.0), rx - out_dir[0] * R * 0.5, y0 + 12.0, rz - out_dir[1] * R * 0.5]
    # door at the corner
    ox, oz = rx + out_dir[0] * (rr + 2.2), rz + out_dir[1] * (rr + 2.2)
    ix, iz = rx + out_dir[0] * (R - 2.5), rz + out_dir[1] * (R - 2.5)
    yaw_in = math.atan2(out_dir[0], out_dir[1])      # faces -out_dir: into the rotunda
    g.doors.append({'label': 'City of Paris Rotunda', 'v': 2, 'out': [round(ox, 2), round(sidewalk(ox, oz), 2), round(oz, 2), round(yaw_in + math.pi, 3)],
                    'in': [round(ix, 2), round(y0, 2), round(iz, 2), round(yaw_in, 3)]})
    return g


# ------------------------------------------------------------------------------------------ Apple Union Square hall
def apple_int(O):
    F, L = street_frame(23524, 0, 1)
    g = IGeo(O, F); g.name = 'Apple Union Square'; g.sky_k = 3.5; g.style = 'modern'
    r = ring_out(ring_of(23524))
    D = 24.0
    U0, U1, W0, W1 = 0.7, L - 0.7, -D + 0.8, -0.35
    y0 = floor_over(g, U0, U1, W0, W1, pad=0.12)
    yT = y0 + APPLE_H - 1.0
    ym = y0 + 6.0; wm = W0 + 10.5          # mezzanine over the back 10 m
    g.room('hall', U0, U1, W0, W1, y0, yT)
    checker(g, 'stone', U0, U1, W0, W1, y0, 1.2, C('#dcd8cf'), C('#d4d0c6'), diag=False)
    g.shell(U0, U1, W0, W1, y0, yT, None, None, 'stone', C('#d7d1c4'), None, None, walls=(True, True, False, True))
    g.lbox('ceilglow', U0, U1, yT - 0.02, yT, W0, W1, (0.95, 0.96, 1.0, 1.0), top=False, bottom=True, sides=False, back=False)
    for i in range(4):
        for j in range(3):
            g.light('AREA', U0 + (i + 0.5) * (U1 - U0) / 4, yT - 0.15, W0 + (j + 0.5) * (W1 - W0) / 3, 160, (0.95, 0.97, 1.0), size=(6, 6), rot=(math.pi, 0, 0))
    g.poly('bakesky', [g.P(U0, y0, W1 + 1.5), g.P(U1, y0, W1 + 1.5), g.P(U1, yT, W1 + 1.5), g.P(U0, yT, W1 + 1.5)], SKY, (-F[2][0], 0, -F[2][1]))
    # mezzanine slab with glass balustrade, 'Forum' screen on the back wall above it
    g.lbox('wood', U0, U1, ym - 0.4, ym, W0, wm, C('#c9b28e'), top=True, bottom=True)
    g.lbox('plaster', U0, U1, ym - 0.55, ym - 0.4, W0, wm, C('#eceae4'), top=False, bottom=True)
    rail(g, [(U0 + 0.3, wm - 0.05), (U1 - 0.3, wm - 0.05)], ym, 1.05, C('#b9bec2'), post=3.0, glass=True)
    g.lbox('screen', (U0 + U1) / 2 - 5.5, (U0 + U1) / 2 + 5.5, ym + 0.8, ym + 5.0, W0 + 0.05, W0 + 0.12, (0.35, 0.55, 0.9, 1.0))
    g.room('forum', U0, U1, W0, wm, ym, yT)
    # stair along the east wall up to the mezzanine
    stairs(g, U1 - 1.6, W1 - 4.0, U1 - 1.6, wm + 0.2, y0, ym, 2.4, C('#d8d2c6'), slot='stone', rail_col=C('#b9bec2'))
    g.collider(U1 - 3.0, U1 - 0.2, wm, W1 - 4.0, y0, ym - 0.6) if False else None
    # tables: long oak tables with devices; trees in round planters; wall 'avenues' of lit shelves
    for i in range(3):
        for j in range(2):
            u = U0 + 5 + i * (U1 - U0 - 12) / 2; w = -4.0 - j * 5.0
            g.lbox('wood', u - 2.6, u + 2.6, y0 + 0.86, y0 + 0.92, w - 0.7, w + 0.7, C('#c2a37a'))
            for sgn in (-1, 1):
                g.lbox('wood', u + sgn * 2.2 - 0.06, u + sgn * 2.2 + 0.06, y0, y0 + 0.86, w - 0.6, w + 0.6, C('#b39468'))
            for k in range(6):
                pu = u - 2.2 + k * 0.88
                g.lbox('metal', pu - 0.18, pu + 0.18, y0 + 0.92, y0 + 0.935, w - 0.09, w + 0.09, C('#1d1f22'))
                g.lbox('screen', pu - 0.16, pu + 0.16, y0 + 0.935, y0 + 0.937, w - 0.075, w + 0.075, (0.25, 0.45, 0.7, 1.0))
            g.collider(u - 2.6, u + 2.6, w - 0.7, w + 0.7, y0, y0 + 0.92)
    for k, (u, w) in enumerate(((U0 + 2.5, -6.5), (U1 - 5.0, -6.5), ((U0 + U1) / 2, -12.0), (U0 + 2.5, -12.5))):
        tree_in_planter(g, u, w, y0, h=5.0, seed=k + 4)
        g.collider(u - 0.9, u + 0.9, w - 0.9, w + 0.9, y0, y0 + 4)
    for (ww0, ww1) in ((W0 + 11, W1 - 1.5),):
        for side, uu in ((1, U0 + 0.05), (-1, U1 - 0.05)):
            for k in range(4):
                yy = y0 + 0.9 + k * 0.55
                g.lbox('wood', min(uu, uu + side * 0.4), max(uu, uu + side * 0.4), yy, yy + 0.04, ww0, ww1, C('#c7ab83'))
                g.lbox('lampI', min(uu, uu + side * 0.02), max(uu, uu + side * 0.02), yy + 0.3, yy + 0.33, ww0, ww1, (1.0, 1.0, 0.98, 1.0))
    g.door('Apple Union Square', (U0 + U1) / 2, 2.0, sidewalk(*g.xz((U0 + U1) / 2, 2.0)), (U0 + U1) / 2, W1 - 2.5, y0)
    return g


# ------------------------------------------------------------------------------------------ Macy's + Saks ground floors
def macys_int(O):
    F, L = street_frame(23440, 0, -1)
    g = IGeo(O, F); g.name = "Mayfield's"
    U0, U1, W0, W1 = L / 2 - 30, L / 2 + 30, -44.0, -2.2
    y0 = floor_over(g, U0, U1, W0, W1); Hh = 5.6
    g.room('floor1', U0, U1, W0, W1, y0, y0 + Hh)
    pal = {'floor_slot': 'marble', 'floor': C('#a39c90'), 'wall': C('#d9d2c6'), 'ceil': C('#cfc8bc'), 'col': C('#d6cfc2'), 'counter': C('#e9e3da'),
           'fixture': C('#5e4634'), 'accent': C('#d8b25e'), 'brand': (1.0, 0.1, 0.12, 1.0), 'ceil_dark': C('#5e5850'), 'cosm': C('#e6e0d6')}
    dept_store(g, U0, U1, W0, W1, y0, Hh, pal, "Mayfield's", seed=3)
    g.poly('sky', [g.P(U0 + 2, y0 + 0.6, W1 - 0.05), g.P(U1 - 2, y0 + 0.6, W1 - 0.05), g.P(U1 - 2, y0 + 4.6, W1 - 0.05), g.P(U0 + 2, y0 + 4.6, W1 - 0.05)], SKY, (-F[2][0], 0, -F[2][1]))
    g.door("Mayfield's", L / 2, 2.4, sidewalk(*g.xz(L / 2, 2.4)), L / 2, W1 - 2.6, y0)
    return g


def saks_int(O):
    F, L = street_frame(23194, 0, 1)
    g = IGeo(O, F); g.name = 'Saxton Fifth Avenue'
    U0, U1, W0, W1 = 3.0, L - 3.0, -40.0, -2.0
    y0 = floor_over(g, U0, U1, W0, W1); Hh = 6.0
    g.room('floor1', U0, U1, W0, W1, y0, y0 + Hh)
    pal = {'floor_slot': 'granite', 'floor': C('#4a4540'), 'wall': C('#cbbfae'), 'ceil': C('#bfb4a4'), 'col': C('#b8ab98'), 'counter': C('#2b2622'),
           'fixture': C('#3e3024'), 'accent': C('#c9a24a'), 'brand': (0.95, 0.9, 0.8, 1.0), 'ceil_dark': C('#3e3a35'), 'cosm': C('#1d1b1a')}
    dept_store(g, U0, U1, W0, W1, y0, Hh, pal, 'SAXTON FIFTH AVENUE', seed=5)
    chandelier(g, (U0 + U1) / 2, (W0 + W1) / 2 + 4, y0 + Hh, drop=1.6, R=1.8, tiers=3, power=900)
    g.poly('sky', [g.P(U0 + 1, y0 + 0.6, W1 - 0.05), g.P(U1 - 1, y0 + 0.6, W1 - 0.05), g.P(U1 - 1, y0 + 5.0, W1 - 0.05), g.P(U0 + 1, y0 + 5.0, W1 - 0.05)], SKY, (-F[2][0], 0, -F[2][1]))
    g.door('Saxton Fifth Avenue', L / 2, 2.4, sidewalk(*g.xz(L / 2, 2.4)), L / 2, W1 - 2.6, y0)
    return g


# ------------------------------------------------------------------------------------------ Grand Hyatt lobby
def hyatt_int(O):
    F, L = street_frame(17166, 1, 0)
    g = IGeo(O, F); g.name = 'Grand Union Hotel'; g.style = 'modern'
    U0, U1, W0, W1 = 2.0, L - 2.0, -24.0, -1.8
    y0 = floor_over(g, U0, U1, W0, W1); Hh = 9.5; y1 = y0 + Hh
    g.room('lobby', U0, U1, W0, W1, y0, y1)
    checker(g, 'marble', U0, U1, W0, W1, y0, 1.5, C('#3b3a38'), C('#474542'), diag=False)
    g.shell(U0, U1, W0, W1, y0, y1, None, None, 'wood', C('#6e4e33'), 'plaster', C('#e9e6df'))
    # tall windows to the Stockton plaza (daylight), back wall of warm wood slats, stone reception desk
    for k in range(7):
        u = U0 + 1.5 + k * (U1 - U0 - 3) / 6
        g.poly('sky', [g.P(u - 1.8, y0 + 0.3, W1 - 0.05), g.P(u + 1.8, y0 + 0.3, W1 - 0.05), g.P(u + 1.8, y1 - 0.8, W1 - 0.05), g.P(u - 1.8, y1 - 0.8, W1 - 0.05)], SKY, (-F[2][0], 0, -F[2][1]))
        g.light('AREA', u, y0 + 4, W1 - 0.8, 120, (0.85, 0.9, 1.0), size=(3.5, 7))
    for k in range(int((U1 - U0) / 0.3)):
        u = U0 + 0.15 + k * 0.3
        g.lbox('wood', u - 0.06, u + 0.06, y0, y1, W0 + 0.02, W0 + 0.12, C('#8a6440'), top=False)
    g.lbox('granite', U0 + 8, U1 - 8, y0, y0 + 1.1, W0 + 3.0, W0 + 4.0, C('#d9d4ca'), collide=True)
    g.lbox('lampI', U0 + 8, U1 - 8, y0 + 0.05, y0 + 0.1, W0 + 4.0, W0 + 4.05, (1.0, 0.85, 0.6, 1.0))
    g.text('gold', (g.xz((U0 + U1) / 2, W0 + 0.15), F[1], F[2]), 0, y0 + 4.2, 0, 'GRAND UNION', 0.7, GOLDC, depth=0.05)
    # hanging sculpture: a cloud of glowing discs
    import random
    R = random.Random(9)
    cu, cw = (U0 + U1) / 2, (W0 + W1) / 2 + 2
    for k in range(60):
        u = cu + R.uniform(-5, 5); w = cw + R.uniform(-4, 4); yy = y1 - 1.5 - R.uniform(0, 3.5)
        x, z = g.xz(u, w)
        g.lathe('crystal', x, z, [(0.0, yy), (0.22, yy + 0.01), (0.0, yy + 0.02)], (1.0, 0.86, 0.62, 1.0), n=10)
        g.rod('metal', (x, yy + 0.02, z), (x, y1, z), 0.004, C('#888888'), n=3)
    g.light('POINT', cu, y1 - 3.5, cw, 900, (1.0, 0.82, 0.6), radius=2.0)
    for (u, w) in ((U0 + 5, W1 - 6), (U1 - 5, W1 - 6), (cu - 5, cw - 3), (cu + 5, cw - 3)):
        g.lbox('carpet', u - 2.6, u + 2.6, y0, y0 + 0.02, w - 2.0, w + 2.0, C('#5d4a3a'))
        sofa(g, u, w - 1.2, y0 + 0.02, 0.0, C('#c9b69a'))
        sofa(g, u, w + 1.2, y0 + 0.02, math.pi, C('#8c4a2f'))
        table(g, u, w, y0 + 0.02, 0.5, 0.42, C('#2a2724'), slot='granite')
        g.collider(u - 1.2, u + 1.2, w - 1.7, w + 1.7, y0, y0 + 0.8)
    for u in (U0 + 1.5, U1 - 1.5):
        potted_plant(g, u, W0 + 6, y0, seed=int(u))
    g.door('Grand Union Hotel', L / 2, 2.4, sidewalk(*g.xz(L / 2, 2.4)), L / 2, W1 - 2.6, y0)
    return g


# ------------------------------------------------------------------------------------------ Union Square Marriott atrium
def marriott_int(O):
    F, L = street_frame(23241, 1, 0)
    g = IGeo(O, F); g.name = 'Union Square Marriott'; g.sky_k = 4.0
    U0, U1, W0, W1 = 5.0, L - 5.0, -37.0, -5.0     # 32 x 32 lobby
    A0, A1, B0, B1 = 12.0, L - 12.0, -30.0, -12.0  # atrium void
    y0 = floor_over(g, U0, U1, W0, W1)
    yl = [y0 + 14.0 + k * 3.25 for k in range(17)]     # upper corridors (floors 4..20)
    ysky = yl[-1] + 3.0
    g.room('lobby', U0, U1, W0, W1, y0, y0 + 13.6)
    g.room('atrium', A0, A1, B0, B1, y0, ysky)
    g.room('corridors', A0 - 4.0, A1 + 4.0, B0 - 4.0, B1 + 4.0, y0 + 13.6, ysky, floor=False)
    g.style = 'modern'
    checker(g, 'marble', U0, U1, W0, W1, y0, 1.4, C('#e3dcd0'), C('#cbbfa9'), diag=True)
    g.shell(U0, U1, W0, W1, y0, y0 + 14.0, None, None, 'plaster', C('#e8dfcf'), None, None)
    # lobby ceiling around the void
    for (a0, a1, b0, b1) in ((U0, U1, W0, B0), (U0, U1, B1, W1), (U0, A0, B0, B1), (A1, U1, B0, B1)):
        g.lbox('plaster', a0, a1, y0 + 13.6, y0 + 14.0, b0, b1, C('#efe8dc'), top=False, bottom=True, sides=False, back=False)
    # atrium walls: stacked corridor balconies (slab edge + parapet + trailing plants), 4 sides
    for yk in yl:
        for (p0, p1) in (((A0, B0), (A1, B0)), ((A1, B0), (A1, B1)), ((A1, B1), (A0, B1)), ((A0, B1), (A0, B0))):
            (u0, w0), (u1, w1) = p0, p1
            du, dw = u1 - u0, w1 - w0; Ln = math.hypot(du, dw); nu_, nw_ = -dw / Ln, du / Ln   # normal into the void
            ins = ((A0 + A1) / 2 - u0) * nu_ + ((B0 + B1) / 2 - w0) * nw_
            if ins < 0: nu_, nw_ = -nu_, -nw_
            P = lambda u, w, y, o=0.0: g.P(u + nu_ * o, y, w + nw_ * o)
            hint = (F[1][0] * nu_ + F[2][0] * nw_, 0, F[1][1] * nu_ + F[2][1] * nw_)
            g.poly('plaster', [P(u0, w0, yk - 0.45), P(u1, w1, yk - 0.45), P(u1, w1, yk + 1.1), P(u0, w0, yk + 1.1)], C('#ece4d6'), hint)
            g.poly('plaster', [P(u0, w0, yk + 1.1), P(u1, w1, yk + 1.1), P(u1, w1, yk + 1.1, -0.25), P(u0, w0, yk + 1.1, -0.25)], C('#f2ebdf'), (0, 1, 0))
            g.poly('plaster', [P(u0, w0, yk - 0.45), P(u1, w1, yk - 0.45), P(u1, w1, yk - 0.45, -4.0), P(u0, w0, yk - 0.45, -4.0)], C('#e9e1d3'), (0, -1, 0))
            g.poly('plaster', [P(u0, w0, yk + 1.1, -4.0), P(u1, w1, yk + 1.1, -4.0), P(u1, w1, yk + 2.8, -4.0), P(u0, w0, yk + 2.8, -4.0)], C('#d9cdb8'), hint)
            g.poly('lampI', [P(u0, w0, yk + 2.5, -3.95), P(u1, w1, yk + 2.5, -3.95), P(u1, w1, yk + 2.6, -3.95), P(u0, w0, yk + 2.6, -3.95)], (1.0, 0.8, 0.55, 1.0), hint)
            # corridor floor (carpet) + its back wall with room doors
            g.poly('carpet', [P(u0, w0, yk, -0.25), P(u1, w1, yk, -0.25), P(u1, w1, yk, -4.0), P(u0, w0, yk, -4.0)], C('#5a2f3a'), (0, 1, 0))
            g.poly('plaster', [P(u0, w0, yk, -4.0), P(u1, w1, yk, -4.0), P(u1, w1, yk + 1.1, -4.0), P(u0, w0, yk + 1.1, -4.0)], C('#d9cdb8'), hint)
            for q in range(int(Ln / 4.2)):
                tq = (q + 0.5) / int(Ln / 4.2); uq, wq = u0 + du * tq, w0 + dw * tq
                g.poly('wood', [P(uq - du / Ln * 0.5, wq - dw / Ln * 0.5, yk, -3.97), P(uq + du / Ln * 0.5, wq + dw / Ln * 0.5, yk, -3.97),
                                P(uq + du / Ln * 0.5, wq + dw / Ln * 0.5, yk + 2.2, -3.97), P(uq - du / Ln * 0.5, wq - dw / Ln * 0.5, yk + 2.2, -3.97)], C('#6b4a2e'), hint)
            nseg = int(Ln / 1.6)
            for k in range(nseg):
                t = (k + 0.5) / nseg; u, w = u0 + du * t, w0 + dw * t
                hang = 0.5 + ((k * 7 + int(yk)) % 5) * 0.25
                g.poly('leaf', [P(u - 0.5, w, yk + 1.1, 0.05), P(u + 0.5, w, yk + 1.1, 0.05), P(u + 0.3, w, yk + 1.1 - hang, 0.12), P(u - 0.3, w, yk + 1.1 - hang, 0.12)], C('#3f6a2d'), hint)
    # two walkable corridor levels (4th and 20th floors): decks + parapet colliders on the void edge + the outer wall
    for yk in (yl[3], yl[16]):
        g.deck_rect(A0 - 4.0, A1 + 4.0, B0 - 4.0, B0, yk); g.deck_rect(A0 - 4.0, A1 + 4.0, B1, B1 + 4.0, yk)
        g.deck_rect(A0 - 4.0, A0, B0, B1, yk); g.deck_rect(A1, A1 + 4.0, B0, B1, yk)
        for (u0_, u1_, w0_, w1_) in ((A0, A1, B0 - 0.1, B0 + 0.15), (A0, A1, B1 - 0.15, B1 + 0.1), (A0 - 0.1, A0 + 0.15, B0, B1), (A1 - 0.15, A1 + 0.1, B0, B1)):
            g.collider(u0_, u1_, w0_, w1_, yk - 0.3, yk + 1.15)
        for (u0_, u1_, w0_, w1_) in ((A0 - 4.4, A1 + 4.4, B0 - 4.4, B0 - 4.0), (A0 - 4.4, A1 + 4.4, B1 + 4.0, B1 + 4.4), (A0 - 4.4, A0 - 4.0, B0 - 4.0, B1 + 4.0), (A1 + 4.0, A1 + 4.4, B0 - 4.0, B1 + 4.0)):
            g.collider(u0_, u1_, w0_, w1_, yk - 0.3, yk + 3.0)
        for q in range(3): g.spot(A0 - 2.0, yk, B0 + 3 + q * 5, A0, B0 + 3 + q * 5, 'stand')
    # glass elevators: left = lobby <-> 4th floor, right = lobby <-> 20th floor (doors on the corridor behind the shaft)
    mid = (A0 + A1) / 2
    g.link((mid - 2.4, y0, B0 + 3.0, mid - 2.4, B0 + 6.0), (mid - 2.4, yl[3], B0 - 2.0, mid - 2.4, B0 - 4.0), 'Glass elevator · 4th floor', 'Glass elevator · Lobby')
    g.link((mid + 2.4, y0, B0 + 3.0, mid + 2.4, B0 + 6.0), (mid + 2.4, yl[16], B0 - 2.0, mid + 2.4, B0 - 4.0), 'Glass elevator · 20th floor', 'Glass elevator · Lobby')
    # skylight: glass pyramid (transparent: the real sky) + bake emitter above it
    c = ((A0 + A1) / 2, (B0 + B1) / 2)
    for (p0, p1) in (((A0, B0), (A1, B0)), ((A1, B0), (A1, B1)), ((A1, B1), (A0, B1)), ((A0, B1), (A0, B0))):
        g.poly('glassI', [g.P(p0[0], ysky, p0[1]), g.P(p1[0], ysky, p1[1]), g.P(c[0], ysky + 5.0, c[1])], C('#d4e0e4'), (0, -1, 0))
        g.rod('metal', g.P(p0[0], ysky, p0[1]), g.P(c[0], ysky + 5.0, c[1]), 0.08, C('#e2e2e2'), n=4)
        g.rod('metal', g.P(p0[0], ysky, p0[1]), g.P(p1[0], ysky, p1[1]), 0.1, C('#e2e2e2'), n=4)
    g.poly('bakesky', [g.P(A0, ysky + 6, B0), g.P(A1, ysky + 6, B0), g.P(A1, ysky + 6, B1), g.P(A0, ysky + 6, B1)], SKY, (0, -1, 0))
    for yk in yl[::3]:
        g.light('POINT', c[0], yk + 1.5, c[1], 250, (1.0, 0.85, 0.65), radius=1.0)
    # glass elevators on the back wall of the void
    for k in (-1, 1):
        u = (A0 + A1) / 2 + k * 2.4
        g.lbox('metal', u - 0.2, u + 0.2, y0, ysky, B0 - 0.2, B0 + 0.1, C('#3a3a3c'))
        yy = y0 + (20 if k < 0 else 38)
        g.lbox('glassI', u - 1.1, u + 1.1, yy, yy + 2.6, B0 + 0.1, B0 + 1.9, C('#cfd9dc'), bottom=True)
        g.lbox('gold', u - 1.15, u + 1.15, yy - 0.3, yy, B0 + 0.1, B0 + 1.95, GOLDC, bottom=True)
        g.lbox('lampI', u - 1.0, u + 1.0, yy + 2.55, yy + 2.6, B0 + 0.2, B0 + 1.8, (1.0, 0.9, 0.7, 1.0), bottom=True)
    # lobby: fountain with the dancers sculpture, reception, fireplace lounge
    fu, fw = c
    fx, fz = g.xz(fu, fw)
    g.lathe('granite', fx, fz, [(3.6, y0), (3.6, y0 + 0.5), (3.3, y0 + 0.5), (3.3, y0 + 0.2)], C('#7c7266'), n=40)
    g.lathe('water', fx, fz, [(3.3, y0 + 0.4), (0.0, y0 + 0.4)], C('#ffffff'), n=40)
    for k in range(4):
        aa = 2 * math.pi * k / 4 + 0.4
        bx, bz = fx + math.cos(aa) * 0.7, fz + math.sin(aa) * 0.7
        g.lathe('metal', bx, bz, [(0.16, y0 + 0.4), (0.12, y0 + 1.2), (0.2, y0 + 1.9), (0.14, y0 + 2.5), (0.1, y0 + 2.7), (0.0, y0 + 2.8)], C('#5b4630'), n=8)
        g.rod('metal', (bx, y0 + 2.3, bz), (fx + math.cos(aa + 0.6) * 1.4, y0 + 3.2, fz + math.sin(aa + 0.6) * 1.4), 0.05, C('#5b4630'))
    g.cols.append({'x': round(fx, 2), 'z': round(fz, 2), 'hx': 3.5, 'hz': 3.5, 'yaw': 0, 'yMin': y0, 'yMax': y0 + 1})
    g.lbox('wood', U0 + 10, U1 - 10, y0, y0 + 1.1, W0 + 2.0, W0 + 2.9, WOOD_L, collide=True)
    g.lbox('marble', U0 + 9.9, U1 - 9.9, y0 + 1.1, y0 + 1.18, W0 + 1.9, W0 + 3.0, C('#e2dccf'))
    g.lbox('granite', U0 + 0.1, U0 + 0.6, y0, y0 + 4.5, (W0 + W1) / 2 - 2.5, (W0 + W1) / 2 + 2.5, C('#8a7c6a'))
    g.lbox('lampI', U0 + 0.6, U0 + 0.65, y0 + 0.4, y0 + 1.2, (W0 + W1) / 2 - 1.2, (W0 + W1) / 2 + 1.2, (1.0, 0.55, 0.2, 1.0))
    g.light('POINT', U0 + 1.2, y0 + 0.8, (W0 + W1) / 2, 150, (1.0, 0.55, 0.25), radius=0.3)
    for (u, w) in ((U0 + 4.5, (W0 + W1) / 2 - 2), (U0 + 4.5, (W0 + W1) / 2 + 2.5), (U1 - 5, W1 - 4), (U1 - 5, W0 + 5)):
        sofa(g, u, w, y0, math.pi / 2, C('#b8a27e'))
        g.collider(u - 0.6, u + 0.6, w - 1.2, w + 1.2, y0, y0 + 0.85)
    for u in (U0 + 1.5, U1 - 1.5):
        for w in (W0 + 1.5, W1 - 1.5):
            potted_plant(g, u, w, y0, seed=int(u * 3 + w))
    for u in (U0 + 8, (U0 + U1) / 2, U1 - 8):
        chandelier(g, u, W1 - 4.0, y0 + 13.6, drop=3.0, R=1.2, tiers=2, power=700)
    # lounge: club chairs + low tables around the fountain, guests
    from hero_props import prop
    for k in range(6):
        aa = 2 * math.pi * k / 6 + 0.3
        cu_, cw_ = fu + math.cos(aa) * 6.2, fw + math.sin(aa) * 6.2
        prop(g, 'modern_arm_chair_01', cu_, y0, cw_, face=(fu, fw), fit=(None, 0.95, None))
        if k % 2 == 0: prop(g, 'side_table_01', fu + math.cos(aa + 0.32) * 6.4, y0, fw + math.sin(aa + 0.32) * 6.4, fit=(None, 0.55, None))
        g.spot(fu + math.cos(aa + 0.6) * 4.6, y0, fw + math.sin(aa + 0.6) * 4.6, fu, fw, 'stand')
    for q in range(4): g.spot(U0 + 12 + q * 3.0, y0, W0 + 4.2, U0 + 12 + q * 3.0, W0 + 2.0, 'stand')
    g.shot_at(U0 + 3.0, y0 + 1.7, W1 - 3.0, (A0 + A1) / 2, y0 + 9.0, (B0 + B1) / 2)
    g.door('Union Square Marriott', L / 2, 2.6, sidewalk(*g.xz(L / 2, 2.6)), L / 2, W1 - 2.6, y0)
    return g


INTERIORS = {'stFrancis': st_francis_int, 'neiman': neiman_int, 'apple': apple_int, 'macys': macys_int, 'saks': saks_int,
             'grandHyatt': hyatt_int, 'jwMarriott': marriott_int}


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = int(a[a.index('--res') + 1]) if '--res' in a else 2048
    spp = int(a[a.index('--spp') + 1]) if '--spp' in a else 384
    ids = [x for x in a if not x.startswith('--') and not x.isdigit()]
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = origin_for([ring_of(i) for i in hide])
        run_interior(bid, INTERIORS[bid], O, res=res, samples=spp)


if __name__ == '__main__':
    main()
