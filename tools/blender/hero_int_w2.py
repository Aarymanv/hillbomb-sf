"""HILLBOMB hero interiors, wave 2. Run:  python hero_int_w2.py -- palace [--res 2048 --spp 256]"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_interior import *   # noqa
from hero_int_w1 import (checker, floor_over, chandelier, potted_plant, CREAM, CREAM_D, GOLDC, SKY, MARB_W, MARB_G, rail)   # noqa
from hero_wave1 import origin_for, sidewalk, edge_facing   # noqa
from hero_wave2 import BUILDERS   # noqa


def round_table(g, u, w, y, seed):
    g.llathe('fabric', u, w, [(0.95, y), (0.97, y + 0.72), (0.9, y + 0.76), (0.0, y + 0.77)], C('#f4f1ea'), n=18)
    from hero_interior import PROCFURN
    if not PROCFURN:
        from hero_props import prop
        for k in range(4):
            a = k * math.pi / 2 + 0.4 + seed * 0.3
            cu, cw = u + math.cos(a) * 1.25, w + math.sin(a) * 1.25
            prop(g, 'dining_chair_02', cu, y, cw, face=(u, w), fit=(None, 1.05, None), collide=False)
        g.llathe('glassI', u + 0.2, w, [(0.03, y + 0.77), (0.04, y + 0.9), (0.0, y + 0.95)], C('#e8eef0'), n=6)
        if seed % 3 == 0:
            from hero_props import prop as _p
            _p(g, 'tea_set_01', u - 0.15, y + 0.77, w + 0.1, fit=(0.5, None, None), collide=False)
        g.collider(u - 1.0, u + 1.0, w - 1.0, w + 1.0, y, y + 0.8)
        return
    for k in range(4):
        a = k * math.pi / 2 + 0.4 + seed * 0.3
        cu, cw = u + math.cos(a) * 1.35, w + math.sin(a) * 1.35
        g.lbox('wood', cu - 0.24, cu + 0.24, y + 0.44, y + 0.5, cw - 0.24, cw + 0.24, C('#6b4428'))
        g.lbox('fabric', cu - 0.22, cu + 0.22, y + 0.5, y + 0.56, cw - 0.22, cw + 0.22, C('#a3312f'))
        du, dw = math.cos(a), math.sin(a)
        bu, bw = cu + du * 0.24, cw + dw * 0.24
        g.lbox('wood', bu - 0.22 * abs(dw) - 0.03, bu + 0.22 * abs(dw) + 0.03, y + 0.5, y + 1.05, bw - 0.22 * abs(du) - 0.03, bw + 0.22 * abs(du) + 0.03, C('#6b4428'))
        for (su, sw) in ((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)):
            g.lbox('wood', cu + su - 0.02, cu + su + 0.02, y, y + 0.44, cw + sw - 0.02, cw + sw + 0.02, C('#5a3822'))
    g.llathe('glassI', u + 0.2, w, [(0.03, y + 0.77), (0.04, y + 0.9), (0.0, y + 0.95)], C('#e8eef0'), n=6)
    g.collider(u - 1.0, u + 1.0, w - 1.0, w + 1.0, y, y + 0.8)


# ------------------------------------------------------------------------------------------ Palace Hotel: the Garden Court
def palace_int(O):
    court = ring_out(ring_of(23737))
    # frame on the court edge shared with the lobby block (u along it, w + toward the lobby / New Montgomery side)
    a, b = (1564.0, -1458.0), (1531.0, -1425.0)
    F = Geo.frame(a, b)
    if (centroid(court)[0] - a[0]) * F[2][0] + (centroid(court)[1] - a[1]) * F[2][1] > 0: F = Geo.frame(b, a)
    g = IGeo(O, F); g.name = 'Palace Hotel - Garden Court'; g.sky_k = 3.5
    Lc = v2len(v2sub(b, a))
    U0, U1 = Lc / 2 - 17.0, Lc / 2 + 17.0
    W0, W1 = -32.5, -6.0
    y0 = floor_over(g, U0, U1, W0, W1)
    ye = y0 + 9.2        # entablature
    yv = y0 + 13.8       # laylight crown
    g.room('court', U0, U1, W0, W1, y0, yv)
    # floor: cream marble with a dark border + inlaid bands
    checker(g, 'marble', U0 + 1.5, U1 - 1.5, W0 + 1.5, W1 - 1.5, y0, 1.0, C('#efe8da'), C('#e2d8c6'), diag=True)
    for (a0, a1, b0, b1) in ((U0, U1, W0, W0 + 1.5), (U0, U1, W1 - 1.5, W1), (U0, U0 + 1.5, W0 + 1.5, W1 - 1.5), (U1 - 1.5, U1, W0 + 1.5, W1 - 1.5)):
        g.poly('marble', [g.P(a0, y0, b0), g.P(a1, y0, b0), g.P(a1, y0, b1), g.P(a0, y0, b1)], C('#7d6a55'), (0, 1, 0))
    g.shell(U0, U1, W0, W1, y0, ye + 1.2, None, None, 'plaster', C('#efe6d3'), None, None)
    # paired Ionic marble columns around the perimeter, arched mirror bays between them
    def ionic(u, w):
        g.llathe('marble', u, w, [(0.42, y0), (0.42, y0 + 0.3), (0.36, y0 + 0.42), (0.33, y0 + 0.55)], C('#e9e2d4'), n=16)
        g.llathe('marble', u, w, [(0.33, y0 + 0.55), (0.27, ye - 0.9)], C('#ece6da'), n=16)
        g.llathe('gold', u, w, [(0.28, ye - 0.9), (0.33, ye - 0.8), (0.3, ye - 0.72)], GOLDC, n=16)
        g.lbox('marble', u - 0.48, u + 0.48, ye - 0.72, ye - 0.45, w - 0.3, w + 0.3, C('#ece6da'))
        for s_ in (-1, 1):   # volutes
            x, z = g.xz(u + s_ * 0.45, w)
            g.lathe('gold', x, z, [(0.0, ye - 0.72), (0.14, ye - 0.65), (0.15, ye - 0.58), (0.0, ye - 0.5)], GOLDC, n=8)
        g.lbox('marble', u - 0.5, u + 0.5, ye - 0.45, ye - 0.3, w - 0.5, w + 0.5, C('#e2dac9'))
        g.collider(u - 0.45, u + 0.45, w - 0.45, w + 0.45, y0, ye)
    nb_u, nb_w = 8, 6
    for k in range(nb_u + 1):
        u = U0 + 1.4 + k * (U1 - U0 - 2.8) / nb_u
        for w in (W0 + 1.4, W1 - 1.4):
            for d in (-0.55, 0.55): ionic(u + d, w)
    for k in range(1, nb_w):
        w = W0 + 1.4 + k * (W1 - W0 - 2.8) / nb_w
        for u in (U0 + 1.4, U1 - 1.4):
            for d in (-0.55, 0.55): ionic(u, w + d)
    for k in range(nb_u):
        u = U0 + 1.4 + (k + 0.5) * (U1 - U0 - 2.8) / nb_u
        for w, face in ((W0 + 0.05, 1), (W1 - 0.05, -1)):
            pts = [(u - 1.2, y0 + 1.0), (u + 1.2, y0 + 1.0)] + [(u + 1.2 * math.cos(t), y0 + 5.8 + 1.2 * math.sin(t)) for t in [math.pi * i / 10 for i in range(11)]]
            g.poly('chrome', [g.P(x, y, w) for x, y in pts], C('#c8c3b8'), (F[2][0] * face, 0, F[2][1] * face))
            g.lbox('gold', u - 1.3, u + 1.3, y0 + 0.9, y0 + 1.0, min(w, w + face * 0.12), max(w, w + face * 0.12), GOLDC)
    # entablature + gilded frieze around the room
    for (a0, a1, b0, b1) in ((U0, U1, W0, W0 + 2.0), (U0, U1, W1 - 2.0, W1), (U0, U0 + 2.0, W0, W1), (U1 - 2.0, U1, W0, W1)):
        g.lbox('plaster', a0, a1, ye - 0.3, ye + 1.2, b0, b1, C('#f1e9d8'), top=True, bottom=True)
        g.lbox('gold', a0, a1, ye + 0.3, ye + 0.5, b0 - 0.02, b1 + 0.02, GOLDC, top=False, bottom=False)
    # the leaded-glass laylight: a shallow barrel vault of pale amber panes with steel ribs
    Wc = (W0 + W1) / 2
    nv, nu = 14, 26
    Wv0, Wv1 = W0 + 2.0, W1 - 2.0
    for i in range(nu):
        for j in range(nv):
            u0, u1 = U0 + 2.0 + (U1 - U0 - 4.0) * i / nu, U0 + 2.0 + (U1 - U0 - 4.0) * (i + 1) / nu
            t0, t1 = j / nv, (j + 1) / nv
            w0, w1 = Wv0 + (Wv1 - Wv0) * t0, Wv0 + (Wv1 - Wv0) * t1
            h0, h1 = ye + 1.2 + (yv - ye - 1.2) * math.sin(math.pi * t0), ye + 1.2 + (yv - ye - 1.2) * math.sin(math.pi * t1)
            edge = i in (0, nu - 1) or j in (0, nv - 1)
            motif = abs((i + 0.5) - nu / 2) < 3 and abs((j + 0.5) - nv / 2) < 2
            col = C('#d9a64a') if edge else C('#c7d6c0') if motif else (C('#f3e7c6') if (i + j) % 2 else C('#efe0b8'))
            g.poly('stained', [g.P(u0, h0, w0), g.P(u1, h0, w0), g.P(u1, h1, w1), g.P(u0, h1, w1)], col, (0, -1, 0))
    for i in range(0, nu + 1, 2):
        u = U0 + 2.0 + (U1 - U0 - 4.0) * i / nu
        pts = [g.P(u, ye + 1.2 + (yv - ye - 1.2) * math.sin(math.pi * j / 12) - 0.05, Wv0 + (Wv1 - Wv0) * j / 12) for j in range(13)]
        for k in range(12): g.rod('metal', pts[k], pts[k + 1], 0.05, C('#39352f'), n=4)
    g.poly('bakesky', [g.P(U0, yv + 3, W0), g.P(U1, yv + 3, W0), g.P(U1, yv + 3, W1), g.P(U0, yv + 3, W1)], SKY, (0, -1, 0))
    # ten crystal chandeliers in two rows
    for k in range(5):
        u = U0 + (U1 - U0) * (k + 0.5) / 5
        for w in (Wc - 5.5, Wc + 5.5):
            chandelier(g, u, w, ye + 1.2, drop=3.0, R=1.5, tiers=3, power=700)
    # dining: round tables with white cloths, palms in the corners
    for i in range(6):
        for j in range(4):
            u = U0 + 4.0 + i * (U1 - U0 - 8.0) / 5; w = W0 + 5.0 + j * (W1 - W0 - 10.0) / 3
            round_table(g, u, w, y0, i * 4 + j)
    for (u, w) in ((U0 + 3, W0 + 3), (U1 - 3, W0 + 3), (U0 + 3, W1 - 3), (U1 - 3, W1 - 3)):
        potted_plant(g, u, w, y0, h=2.4, seed=int(u + w * 3))
    x_out = edge_facing(ring_of(23753), 0.7, -0.7)
    a2, b2 = x_out; Fo = Geo.frame(a2, b2)
    po = fpt_(Fo, 10.5, 2.2)
    ip = g.xz((U0 + U1) / 2, W1 - 3.0)
    yaw_in = math.atan2(F[2][0], F[2][1])             # faces -n: into the court
    yaw_o = math.atan2(-Fo[2][0], -Fo[2][1])          # faces the street
    g.doors.append({'label': 'Palace Hotel - Garden Court', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(yaw_o, 3)],
                    'in': [round(ip[0], 2), round(y0, 2), round(ip[1], 2), round(yaw_in, 3)]})
    return g


def fpt_(F, u, w):
    p = Geo.fp(F, u, 0.0, w); return (p[0], p[2])


# ------------------------------------------------------------------------------------------ shared lobby kit (wave 2b / 3)
from hero_wave2 import ta_frame, TA, sf_shape, SF, tc_frame, Loc, hull, ring_scale   # noqa
from hero_int_w1 import tree_in_planter, stairs, coffers, pilaster   # noqa


def glass_walls(g, U0, U1, W0, W1, y0, y1, walls=(1, 1, 1, 1), step=3.0, mull=C('#2a2c2e'), sky_off=3.0, sky=True):
    """glazed room sides (transparent) with mullions + transoms; a bake-only sky plane outside each glazed side"""
    P = g.P
    sides = [((U0, W0), (U1, W0), (0, 1)), ((U1, W0), (U1, W1), (-1, 0)), ((U1, W1), (U0, W1), (0, -1)), ((U0, W1), (U0, W0), (1, 0))]
    for k, ((ua, wa), (ub, wb), (iu, iw)) in enumerate(sides):
        if not walls[k]: continue
        L = math.hypot(ub - ua, wb - wa); n = max(1, int(L / step))
        g.poly('glassI', [P(ua, y0, wa), P(ub, y0, wb), P(ub, y1, wb), P(ua, y1, wa)], C('#d0dadc'), None)
        for i in range(n + 1):
            t = i / n; u, w = ua + (ub - ua) * t, wa + (wb - wa) * t
            g.lbox('metal', u - 0.06, u + 0.06, y0, y1, w - 0.06, w + 0.06, mull, top=False)
        for yy in (y0 + 3.2, y0 + 6.6, y1 - 0.1):
            g.lbox('metal', min(ua, ub) - 0.05, max(ua, ub) + 0.05, yy - 0.06, yy + 0.06, min(wa, wb) - 0.05, max(wa, wb) + 0.05, mull)
        if sky:
            ou, ow = -iu * sky_off, -iw * sky_off
            g.poly('bakesky', [P(ua + ou, y0 - 2, wa + ow), P(ub + ou, y0 - 2, wb + ow), P(ub + ou, y1 + 4, wb + ow), P(ua + ou, y1 + 4, wa + ow)], SKY, None)
        g.collider(min(ua, ub) - (0.3 if iw == 0 and iu > 0 else 0), max(ua, ub) + (0.3 if iw == 0 and iu < 0 else 0),
                   min(wa, wb) - (0.3 if iu == 0 and iw > 0 else 0), max(wa, wb) + (0.3 if iu == 0 and iw < 0 else 0), y0 - 1, y1)


def light_grid(g, U0, U1, W0, W1, y, step=4.5, power=60, col=(1.0, 0.93, 0.84), panel=0.7, skip=None):
    nu, nw = max(1, int((U1 - U0) / step)), max(1, int((W1 - W0) / step))
    for i in range(nu):
        for j in range(nw):
            u = U0 + (i + 0.5) * (U1 - U0) / nu; w = W0 + (j + 0.5) * (W1 - W0) / nw
            if skip and skip(u, w): continue
            g.lbox('ceilglow', u - panel, u + panel, y - 0.04, y - 0.01, w - panel, w + panel, (1.0, 0.97, 0.92, 1.0), top=False, bottom=True, sides=False, back=False)
            if (i + j) % 2 == 0: g.light('AREA', u, y - 0.15, w, power, col, size=(1.6, 1.6))


def bench(g, u, w, y, along_u=True, L=2.4, col=C('#6b4a2e')):
    if along_u:
        g.lbox('wood', u - L / 2, u + L / 2, y + 0.42, y + 0.5, w - 0.3, w + 0.3, col)
        for e in (-L / 2 + 0.2, L / 2 - 0.2): g.lbox('metal', u + e - 0.04, u + e + 0.04, y, y + 0.42, w - 0.25, w + 0.25, C('#2a2a2a'))
        g.collider(u - L / 2, u + L / 2, w - 0.35, w + 0.35, y, y + 0.55)
    else:
        g.lbox('wood', u - 0.3, u + 0.3, y + 0.42, y + 0.5, w - L / 2, w + L / 2, col)
        for e in (-L / 2 + 0.2, L / 2 - 0.2): g.lbox('metal', u - 0.25, u + 0.25, y, y + 0.42, w + e - 0.04, w + e + 0.04, C('#2a2a2a'))
        g.collider(u - 0.35, u + 0.35, w - L / 2, w + L / 2, y, y + 0.55)


def elevator_bank(g, u0, u1, w, face, y0, n, col=C('#8a6a3a'), frame=C('#2b2521'), h=3.0):
    """n elevator doors on the plane w (face +1: doors face +w)"""
    for k in range(n):
        u = u0 + (u1 - u0) * (k + 0.5) / n
        g.lbox('gold', u - 0.75, u + 0.75, y0, y0 + h, min(w, w + 0.03 * face), max(w, w + 0.03 * face), col)
        g.lbox('metal', u - 0.03, u + 0.03, y0, y0 + h, min(w, w + 0.045 * face), max(w, w + 0.045 * face), frame)
        g.lbox('metal', u - 0.95, u + 0.95, y0 + h, y0 + h + 0.25, min(w, w + 0.06 * face), max(w, w + 0.06 * face), frame)
        g.lbox('lampI', u - 0.2, u + 0.2, y0 + h + 0.06, y0 + h + 0.18, min(w, w + 0.08 * face), max(w, w + 0.08 * face), (1.0, 0.85, 0.5, 1.0))


def face_yaw(dx, dz):
    """game yaw that looks along the world direction (dx, dz)"""
    return math.atan2(-dx, -dz)


# ------------------------------------------------------------------------------------------ Transamerica Pyramid lobby
def transamerica_int(O):
    L = ta_frame()
    F = (L.xz(0, 0), L.u, L.v)                    # u = local a (east), w = local b (south)
    g = IGeo(O, F); g.name = 'Transamerica Pyramid'; g.sky_k = 3.2; g.style = 'modern'
    yG = min(sidewalk(*L.xz(a, b)) for a in (-27, 0, 27) for b in (-27, 0, 27))
    H0 = TA['HWL'] - 0.35
    y0 = max(yG + 0.03, floor_over(g, -H0, H0, -H0, H0, pad=0.08)); y1 = y0 + 12.6
    g.room('lobby', -H0, H0, -H0, H0, y0, y1)
    checker(g, 'granite', -H0, H0, -H0, H0, y0, 1.5, C('#d9d6cf'), C('#a8a49c'), diag=False)
    glass_walls(g, -H0, H0, -H0, H0, y0, y1)
    g.shell(-H0, H0, -H0, H0, y0, y1, None, None, None, None, 'plaster', C('#f2f0ea'), walls=(False,) * 4)
    light_grid(g, -H0, H0, -H0, H0, y1, step=4.4, power=70, skip=lambda u, w: abs(u) < 7.5 and abs(w) < 7.5)
    # core: warm wood panelling, bronze elevator banks on the north + south faces, stone base
    C0 = 6.8
    g.lbox('wood', -C0, C0, y0, y1, -C0, C0, C('#5a3c26'), top=False, back=True, collide=True)
    for k in range(-6, 7):
        for (w_, f_) in ((-C0, -1), (C0, 1)):
            g.lbox('wood', k - 0.04, k + 0.04, y0 + 3.6, y1, min(w_, w_ + 0.12 * f_), max(w_, w_ + 0.12 * f_), C('#5d3f25'), top=False)
    g.lbox('granite', -C0 - 0.05, C0 + 0.05, y0, y0 + 0.25, -C0 - 0.05, C0 + 0.05, C('#3a3733'))
    elevator_bank(g, -5.5, 5.5, -C0, -1, y0, 4)
    elevator_bank(g, -5.5, 5.5, C0, 1, y0, 4)
    # 'virtual observation deck': screens on the west + east faces of the core showing the view from the top
    for (u_, f_) in ((-C0, -1), (C0, 1)):
        for k in range(2):
            w0_, w1_ = -5.6 + k * 5.8, -0.4 + k * 5.8
            uu = u_ + 0.03 * f_
            g.lbox('metal', min(u_, uu + 0.05 * f_), max(u_, uu + 0.05 * f_), y0 + 1.6, y0 + 5.0, w0_ - 0.1, w1_ + 0.1, C('#1c1c1c'))
            for j in range(6):
                t0, t1 = j / 6, (j + 1) / 6
                col = (0.12 + 0.2 * t1, 0.22 + 0.2 * t1, 0.42 + 0.12 * t1, 1.0) if j > 1 else ((0.16, 0.15, 0.14, 1.0) if j == 0 else (0.22, 0.2, 0.17, 1.0))
                g.panel_u('screen', w0_, w1_, y0 + 1.7 + 3.2 * t0, y0 + 1.7 + 3.2 * t1, uu + 0.06 * f_, col, f_)
    # reception desk facing the Montgomery St doors (west), benches, planters, a model of the pyramid
    g.lbox('marble', -12.5, -11.5, y0, y0 + 1.1, -15.5, -9.5, C('#e7e3da'), collide=True)
    g.lbox('granite', -12.6, -11.4, y0 + 1.1, y0 + 1.18, -15.6, -9.4, C('#2d2b28'))
    g.lbox('lampI', -11.5, -11.44, y0 + 0.2, y0 + 0.3, -15.3, -9.7, (1.0, 0.9, 0.7, 1.0))
    g.text('gold', (g.xz(-11.44, -12.5), (-F[2][0], -F[2][1]), (F[1][0], F[1][1])), 0, y0 + 0.5, 0, '600 MONTGOMERY', 0.26, GOLDC, depth=0.02)
    for (u_, w_) in ((-11, -13), (-11, 13), (11, -13), (11, 13)):
        bench(g, u_, w_, y0, along_u=True, L=3.0)
    for (u_, w_) in ((-16.5, -16.5), (16.5, -16.5), (-16.5, 16.5), (16.5, 16.5)):
        potted_plant(g, u_, w_, y0, h=2.2, seed=int(u_ * 3 + w_))
        g.collider(u_ - 0.5, u_ + 0.5, w_ - 0.5, w_ + 0.5, y0, y0 + 1.5)
    g.lbox('granite', 10.5, 13.5, y0, y0 + 1.0, -1.5, 1.5, C('#2d2b28'), collide=True)
    x_, z_ = g.xz(12.0, 0.0)
    g.lathe('plaster', x_, z_, [(1.2, y0 + 1.0), (0.0, y0 + 3.4)], C('#f4f2ee'), n=4, a0=math.pi / 4 - L.yaw())
    g.lathe('metal', x_, z_, [(0.3, y0 + 3.4), (0.0, y0 + 4.1)], C('#d7dada'), n=4, a0=math.pi / 4 - L.yaw())
    g.door('Transamerica Pyramid', -H0 - 2.6, 0.0, sidewalk(*g.xz(-H0 - 2.6, 0.0)), -H0 + 2.4, 0.0, y0)
    d = g.doors[-1]; y_ = round(face_yaw(L.u[0], L.u[1]), 3); d['in'][3] = y_; d['out'][3] = y_
    return g


# ------------------------------------------------------------------------------------------ Salesforce Tower lobby (+ elevator to the rooftop park)
def salesforce_int(O):
    hl, c, ids = sf_shape()
    a, b = edge_facing(hl, -0.7, -0.7)                           # Mission St side
    u = v2norm(v2sub(b, a)); L = Loc(c, u)
    if L.loc(*v2lerp(a, b, 0.5))[1] > 0: L = Loc(c, (-u[0], -u[1]))   # street (Mission) on the -w side
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Salesforce Tower'; g.sky_k = 3.0; g.style = 'modern'
    yG = min(sidewalk(*p) for p in hl)
    inner = ring_scale(hl, c, 1.0 - SF['TAPER'] * SF['LOB'] / SF['HT'])
    lo = hull([L.loc(*p) for p in ring_offset(ring_out(inner), -1.4)])
    s = 5.0
    while s < 40 and all(point_in(lo, sa * s, sb * s) for sa in (-1, 1) for sb in (-1, 1)): s += 0.25
    H0 = s - 0.5
    y0 = max(yG + 0.03, floor_over(g, -H0, H0, -H0, H0, pad=0.08)); y1 = y0 + SF['LOB'] - 1.5
    g.room('lobby', -H0, H0, -H0, H0, y0, y1)
    checker(g, 'marble', -H0, H0, -H0, H0, y0, 1.2, C('#f1efea'), C('#e4e1da'), diag=False)
    glass_walls(g, -H0, H0, -H0, H0, y0, y1, step=3.0, mull=C('#c9cdd0'))
    g.shell(-H0, H0, -H0, H0, y0, y1, None, None, None, None, 'plaster', C('#f6f6f4'), walls=(False,) * 4)
    cu0, cu1, cw0, cw1 = -min(9.5, H0 - 5), min(9.5, H0 - 5), 0.0, min(11.0, H0 - 3)
    light_grid(g, -H0, H0, -H0, H0, y1, step=4.0, power=65, col=(1.0, 0.97, 0.92), skip=lambda uu, ww: cu0 - 1 < uu < cu1 + 1 and ww > cw0 - 1)
    # core: pale oak slats, elevator banks on its sides, media wall on the street face
    g.lbox('wood', cu0, cu1, y0, y1, cw0, cw1, C('#9a7a58'), top=False, collide=True)
    for k in range(int((cu1 - cu0) / 0.35)):
        uu = cu0 + 0.175 + k * 0.35
        g.lbox('wood', uu - 0.06, uu + 0.06, y0 + 4.2, y1, cw0 - 0.12, cw0, C('#8c6c4a'), top=False)
    for (uu, f_) in ((cu0, -1), (cu1, 1)):
        for k in range(3):
            w_ = cw0 + 1.5 + k * (cw1 - cw0 - 3) / 2
            g.lbox('gold', min(uu, uu + 0.03 * f_), max(uu, uu + 0.03 * f_), y0, y0 + 3.0, w_ - 0.75, w_ + 0.75, C('#bfc3c6'))
            g.lbox('lampI', min(uu, uu + 0.08 * f_), max(uu, uu + 0.08 * f_), y0 + 3.1, y0 + 3.22, w_ - 0.2, w_ + 0.2, (0.9, 0.95, 1.0, 1.0))
    nI = int((cu1 - cu0 - 2) / 1.0)
    for i in range(nI):
        for j in range(8):
            t = i / max(1, nI - 1); v = j / 7
            col = (0.08 + 0.35 * t * (1 - v), 0.12 + 0.2 * (0.5 + 0.5 * math.sin(4 * t + 2 * v)), 0.45 - 0.2 * v, 1.0)
            u0_ = cu0 + 1 + i * 1.0; y_ = y0 + 1.0 + j * 0.42
            g.panel_in('screen', u0_ + 0.03, u0_ + 0.97, y_ + 0.02, y_ + 0.4, cw0 - 0.14, col, -1)
    # turnstiles in front of the elevator lobbies, reception desk, planters, benches
    for sgn, uu in ((-1, cu0 - 1.3), (1, cu1 + 1.3)):
        for k in range(4):
            ww = cw0 + 0.6 + k * 1.6
            g.lbox('metal', uu - 0.12, uu + 0.12, y0, y0 + 1.0, ww - 0.5, ww + 0.5, C('#b8bcc0'), collide=True)
            g.lbox('glassI', uu - 0.5, uu + 0.5, y0 + 0.5, y0 + 1.1, ww + 0.55, ww + 0.6, C('#d6e0e2'))
    g.lbox('marble', -4.5, 4.5, y0, y0 + 1.1, -H0 * 0.55 - 0.5, -H0 * 0.55 + 0.5, C('#f4f2ee'), collide=True)
    g.lbox('lampI', -4.4, 4.4, y0 + 1.1, y0 + 1.14, -H0 * 0.55 - 0.5, -H0 * 0.55 - 0.4, (1.0, 0.95, 0.85, 1.0))
    for (uu, ww) in ((-H0 + 3.0, -H0 + 3.0), (H0 - 3.0, -H0 + 3.0), (-H0 + 3.0, H0 - 3.0), (H0 - 3.0, H0 - 3.0)):
        tree_in_planter(g, uu, ww, y0, h=6.5, seed=int(uu * 5 + ww), R=2.2)
        g.collider(uu - 1.0, uu + 1.0, ww - 1.0, ww + 1.0, y0, y0 + 2)
    for k in (-1, 1):
        bench(g, k * 7.0, -H0 + 5.0, y0, along_u=True, L=3.2)
    # hanging light sculpture: tilted rings of lamps over the entrance hall
    x_, z_ = g.xz(0.0, -H0 * 0.5)
    for k in range(5):
        r_ = 1.6 + k * 0.8; yy = y1 - 2.5 - k * 0.7
        for i in range(24):
            a0_, a1_ = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
            p0 = (x_ + math.cos(a0_) * r_, yy + math.sin(a0_ + k) * 0.4, z_ + math.sin(a0_) * r_)
            p1 = (x_ + math.cos(a1_) * r_, yy + math.sin(a1_ + k) * 0.4, z_ + math.sin(a1_) * r_)
            g.rod('lampI', p0, p1, 0.05, (1.0, 0.95, 0.85, 1.0), n=4)
    g.light('POINT', 0.0, y1 - 4.5, -H0 * 0.5, 600, (1.0, 0.93, 0.8), radius=1.5)
    # doors: Mission St entrance, and the elevator to the rooftop park on the Transit Center
    g.door('Salesforce Tower', 0.0, -H0 - 2.5, sidewalk(*g.xz(0.0, -H0 - 2.5)), 0.0, -H0 + 2.5, y0)
    d = g.doors[-1]; d['in'][3] = round(face_yaw(L.v[0], L.v[1]), 3); d['out'][3] = d['in'][3]
    Lt, a0t, a1t, hwt = tc_frame()
    gy = [sidewalk(*Lt.xz(aa, bb)) for aa in range(int(a0t), int(a1t) + 1, 10) for bb in (-hwt, 0, hwt)]
    yP = max(gy) + 20.0
    at, bt = Lt.loc(*c)
    bp = max(-hwt + 5, min(hwt - 5, bt)); pp = Lt.xz(at, bp)
    ein = g.xz(cu0 - 3.2, cw0 + 3.0)
    g.doors.append({'label': 'Elevator - Salesforce Park', 'v': 2, 'out': [round(pp[0], 2), round(yP, 2), round(pp[1], 2), round(face_yaw(Lt.u[0], Lt.u[1]), 3)],
                    'in': [round(ein[0], 2), round(y0, 2), round(ein[1], 2), round(face_yaw(-L.u[0], -L.u[1]), 3)]})
    return g


INTERIORS = {'palace': palace_int, 'transamerica': transamerica_int, 'salesforce': salesforce_int}


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = int(a[a.index('--res') + 1]) if '--res' in a else 2048
    spp = int(a[a.index('--spp') + 1]) if '--spp' in a else 256
    ids = [x for x in a if not x.startswith('--') and not x.isdigit()]
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = origin_for([ring_of(i) for i in hide])
        run_interior(bid, INTERIORS[bid], O, res=res, samples=spp)


if __name__ == '__main__':
    main()
