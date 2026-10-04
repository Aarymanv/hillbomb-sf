"""HILLBOMB hero interiors, wave 3. Run:  python hero_int_w3.py -- cityHall opera ferry coit [--res 2048 --spp 256]"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_interior import *   # noqa
from hero_int_w1 import (checker, floor_over, chandelier, potted_plant, CREAM, CREAM_D, GOLDC, SKY, MARB_W, MARB_G, rail, stairs, coffers, pilaster)   # noqa
from hero_int_w2 import glass_walls, light_grid, bench, elevator_bank, face_yaw   # noqa
from hero_wave1 import origin_for, sidewalk, edge_facing, ring_edges   # noqa
from hero_wave2 import Loc, ring_scale   # noqa
from hero_wave3 import BUILDERS, ORIGINS, CH_D, CH_U, fb_frame, coit_frame, COIT, ring_facets   # noqa

LIME = C('#e4dac6'); LIME_D = C('#cfc3aa'); PINK_M = C('#d8b4a2'); BRONZE_I = C('#6b5232')


def dirw(g, du, dw, dy=0.0):
    a, t, n = g.F
    return (t[0] * du + n[0] * dw, dy, t[1] * du + n[1] * dw)


def arch_hole(uc, w, yb, spring, n=14):
    return opening_poly(uc, w, yb, spring + w / 2, 1, n)


def wall_with_holes(g, F, u0, u1, y0, y1, holes, col, slot='plaster'):
    """wall rectangle in a frame (faces +n) with several convex openings: split into vertical strips per hole"""
    edges = [u0]
    for h in holes:
        mn = min(p[0] for p in h); mx = max(p[0] for p in h)
        edges += [mn - 0.3, mx + 0.3]
    edges.append(u1)
    k = 0
    for i in range(0, len(edges), 2):
        a, b = edges[i], edges[i + 1]
        if b - a > 0.01: radial_panel(g, slot, F, a, b, y0, y1, None, col)
        if i // 2 < len(holes):
            h = holes[i // 2]
            radial_panel(g, slot, F, edges[i + 1], edges[i + 2], y0, y1, h, col)


def solid_stair(g, u0, w0, u1, w1, y0, y1, width, col, slot='marble', cheek=C('#c9b7a4'), bal=True):
    """monumental stair: treads/risers + solid marble cheeks down to the floor + balustrade walls; deck + side colliders"""
    stairs(g, u0, w0, u1, w1, y0, y1, width, col, slot=slot)
    L = math.hypot(u1 - u0, w1 - w0); du, dw = (u1 - u0) / L, (w1 - w0) / L; pu, pw = -dw, du
    ybase = g.floor_y
    for s in (-1, 1):
        o = (width / 2 + 0.2) * s
        A = (u0 + pu * o, w0 + pw * o); B = (u1 + pu * o, w1 + pw * o)
        for off in (-0.2, 0.2):
            Aa = (A[0] + pu * off * s, A[1] + pw * off * s); Bb = (B[0] + pu * off * s, B[1] + pw * off * s)
            sg = 1 if off > 0 else -1
            g.poly(slot, [g.P(Aa[0], ybase, Aa[1]), g.P(Bb[0], ybase, Bb[1]), g.P(Bb[0], y1 + (1.0 if bal else 0), Bb[1]), g.P(Aa[0], y0 + (1.0 if bal else 0), Aa[1])], cheek,
                   dirw(g, pu * s * sg, pw * s * sg))
        top0, top1 = y0 + (1.0 if bal else 0), y1 + (1.0 if bal else 0)
        Ai = (A[0] - pu * 0.2 * s, A[1] - pw * 0.2 * s); Ao = (A[0] + pu * 0.2 * s, A[1] + pw * 0.2 * s)
        Bi = (B[0] - pu * 0.2 * s, B[1] - pw * 0.2 * s); Bo = (B[0] + pu * 0.2 * s, B[1] + pw * 0.2 * s)
        g.poly(slot, [g.P(Ai[0], top0, Ai[1]), g.P(Bi[0], top1, Bi[1]), g.P(Bo[0], top1, Bo[1]), g.P(Ao[0], top0, Ao[1])], shade(cheek, 1.08), (0, 1, 0))
        g.poly(slot, [g.P(Ai[0], ybase, Ai[1]), g.P(Ao[0], ybase, Ao[1]), g.P(Ao[0], top0, Ao[1]), g.P(Ai[0], top0, Ai[1])], cheek, None)
        g.collider(min(A[0], B[0]) - 0.25, max(A[0], B[0]) + 0.25, min(A[1], B[1]) - 0.25, max(A[1], B[1]) + 0.25, ybase, max(y0, y1) + 1.0) if abs(du) < 0.01 or abs(dw) < 0.01 else None
    # front face under the first tread
    g.poly(slot, [g.P(u0 - pu * width / 2, ybase, w0 - pw * width / 2), g.P(u0 + pu * width / 2, ybase, w0 + pw * width / 2),
                  g.P(u0 + pu * width / 2, y0, w0 + pw * width / 2), g.P(u0 - pu * width / 2, y0, w0 - pw * width / 2)], shade(col, 0.9), None)


# ================================================================================== City Hall: rotunda + grand staircase
def cityhall_int(O):
    L = Loc(CH_D, CH_U)
    F = (L.xz(0, 0), L.u, L.v)                         # u = east, w = south
    g = IGeo(O, F); g.name = 'City Hall - Rotunda'; g.sky_k = 2.5
    main = ring_of(39084)
    yG = min(sidewalk(*p) for p in ring_out(main)) + 0.1
    S, A, AW = 15.0, 23.0, 8.0                          # half square, arm reach, arm half-width
    y0 = max(yG + 1.62, floor_over(g, -A, A, -A, A, pad=0.1)); g.floor_y = y0
    ySp, yCr, yRing, yDr, yApex = y0 + 16.0, y0 + 24.0, y0 + 30.0, y0 + 42.0, y0 + 57.0
    g.room('rotunda', -S, S, -S, S, y0, yApex)
    g.room('east', S, A, -AW, AW, y0, yCr, floor=True)
    g.room('west', -A, -S, -AW, AW, y0 + 7.5, yCr, floor=False)
    g.room('north', -AW, AW, -A + 2, -S, y0, yCr); g.room('south', -AW, AW, S, A - 2, y0, yCr)
    # floor: diagonal marble + border + the central medallion
    checker(g, 'marble', -A, A, -S, S, y0, 1.4, C('#efe9dc'), C('#d9ccb8'), diag=True)
    for (u0, u1, w0, w1) in ((-AW, AW, -A + 2, -S), (-AW, AW, S, A - 2)):
        checker(g, 'marble', u0, u1, w0, w1, y0, 1.4, C('#efe9dc'), C('#d9ccb8'), diag=True)
    x, z = g.xz(0, 0)
    for k, (r0, r1, cc) in enumerate(((6.5, 6.0, C('#8b6b52')), (6.0, 4.6, C('#f1ebe0')), (4.6, 4.2, C('#8b6b52')), (4.2, 1.2, C('#e3d3be')), (1.2, 0.0, C('#8b6b52')))):
        g.lathe('marble', x, z, [(r0, y0 + 0.004 * (k + 1)), (r1, y0 + 0.004 * (k + 1))], cc, n=48)
    for i in range(16):
        a = 2 * math.pi * i / 16
        g.poly('marble', [(x + math.cos(a) * 1.3, y0 + 0.03, z + math.sin(a) * 1.3), (x + math.cos(a + 0.2) * 4.1, y0 + 0.03, z + math.sin(a + 0.2) * 4.1),
                          (x + math.cos(a) * 4.4, y0 + 0.03, z + math.sin(a) * 4.4)], C('#b89274'), (0, 1, 0))
    # square walls with the four great arches (pier faces between them), spandrels up to the ring
    sides = [((S, S), (S, -S), 'east'), ((-S, -S), (-S, S), 'west'), ((S, -S), (-S, -S), 'north'), ((-S, S), (S, S), 'south')]
    for (pa, pb, nm) in sides:
        A_, B_ = g.xz(*pa), g.xz(*pb)
        Fw = Geo.frame(A_, B_)
        if (Fw[2][0] * (x - A_[0]) + Fw[2][1] * (z - A_[1])) < 0: Fw = Geo.frame(B_, A_)
        hole = arch_hole(S, 2 * AW, y0, ySp, 18)
        radial_panel(g, 'plaster', Fw, 0, 2 * S, y0, yRing, hole, LIME)
        m = len(hole); cu = sum(p[0] for p in hole) / m; cv = sum(p[1] for p in hole) / m
        for k in range(m):
            p, q = hole[k], hole[(k + 1) % m]
            if p[1] < y0 + 0.05 and q[1] < y0 + 0.05: continue
            mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
            g.poly('plaster', [Geo.fp(Fw, p[0], p[1], 0), Geo.fp(Fw, q[0], q[1], 0), Geo.fp(Fw, q[0], q[1], -1.6), Geo.fp(Fw, p[0], p[1], -1.6)], LIME_D,
                   (-(Fw[1][0] * mu), -mv, -(Fw[1][1] * mu)))
        # archivolt (gilt) + keystone, giant pilasters on the pier faces, dado
        for k in range(len(hole) - 3):
            p, q = hole[k + 2], hole[k + 3]
            g.poly('gold', [Geo.fp(Fw, p[0], p[1], 0.02), Geo.fp(Fw, q[0], q[1], 0.02), Geo.fp(Fw, q[0] + (q[0] - S) * 0.08, q[1] + (q[1] - ySp) * 0.08, 0.05),
                            Geo.fp(Fw, p[0] + (p[0] - S) * 0.08, p[1] + (p[1] - ySp) * 0.08, 0.05)], GOLDC, (Fw[2][0], 0, Fw[2][1]))
        g.fbox('plaster', Fw, S - 0.7, S + 0.7, yCr - 0.3, yCr + 1.6, 0, 0.35, LIME_D, top=True, bottom=True)
        for uc in (2.2, 2 * S - 2.2):
            g.fbox('plaster', Fw, uc - 1.0, uc + 1.0, y0, ySp + 3.5, 0, 0.3, LIME_D, top=False)
            g.fbox('gold', Fw, uc - 1.25, uc + 1.25, ySp + 3.5, ySp + 4.6, 0, 0.45, GOLDC, top=True, bottom=True)
            g.fbox('plaster', Fw, uc - 1.25, uc + 1.25, y0, y0 + 0.6, 0, 0.42, C('#b9a78f'), top=True)
        g.fbox('plaster', Fw, 0, 2 * S, ySp + 4.6, ySp + 5.3, 0, 0.5, LIME_D, top=True, bottom=True)
        for uc in (2 * S * 0.25 - 1.2, 2 * S * 0.75 + 1.2):   # sconces
            g.fbox('lampI', Fw, uc - 0.25, uc + 0.25, y0 + 4.2, y0 + 4.9, 0.3, 0.55, (1.0, 0.82, 0.55, 1.0))
            p = Geo.fp(Fw, uc, y0 + 4.5, 1.0)
            g.lights.append(('POINT', p, 90, (1.0, 0.8, 0.55), 0.2, None, None))
        # colliders on the pier faces (not across the arch)
        for (c0, c1) in ((0.0, S - AW), (S + AW, 2 * S)):
            pa_, pb_ = Geo.fp(Fw, c0, 0, -0.3), Geo.fp(Fw, c1, 0, -0.3)
            cx_, cz_ = (pa_[0] + pb_[0]) / 2, (pa_[2] + pb_[2]) / 2
            g.cols.append({'x': round(cx_, 2), 'z': round(cz_, 2), 'hx': round((c1 - c0) / 2, 2), 'hz': 0.3, 'yaw': round(math.atan2(-Fw[1][1], Fw[1][0]), 4), 'yMin': y0 - 1, 'yMax': yRing})
    # arms: side walls, barrel vaults, end walls with bronze doors
    for (nm, u0, u1, w0, w1, axis) in (('east', S, A, -AW, AW, 'u'), ('west', -A, -S, -AW, AW, 'u'), ('north', -AW, AW, -A + 2, -S, 'w'), ('south', -AW, AW, S, A - 2, 'w')):
        open_side = {'east': 3, 'west': 1, 'north': 2, 'south': 0}[nm]
        wl = tuple(k != open_side for k in range(4))
        g.shell(u0, u1, w0, w1, y0, ySp, None, None, 'plaster', LIME, None, None, walls=wl, ceiling=False)
        cs = g.cols[-4:]; g.cols = g.cols[:-4]
        # shell collider order: u0 side, u1 side, w-min side, w-max side  ->  sides 3, 1, 0, 2
        for k, side in zip(range(4), (3, 1, 0, 2)):
            if side != open_side: g.cols.append(cs[k])
        n = 16
        for i in range(n):
            t0, t1 = math.pi * i / n, math.pi * (i + 1) / n
            tm = (t0 + t1) / 2
            if axis == 'u':
                P = lambda uu, t: g.P(uu, ySp + math.sin(t) * AW, math.cos(t) * AW)
                g.poly('plaster', [P(u0, t0), P(u1, t0), P(u1, t1), P(u0, t1)], LIME if i % 2 else LIME_D, dirw(g, 0, -math.cos(tm), -math.sin(tm)))
            else:
                P = lambda ww, t: g.P(math.cos(t) * AW, ySp + math.sin(t) * AW, ww)
                g.poly('plaster', [P(w0, t0), P(w1, t0), P(w1, t1), P(w0, t1)], LIME if i % 2 else LIME_D, dirw(g, -math.cos(tm), 0, -math.sin(tm)))
        # lunette closing the barrel at the arm's end wall
        if axis == 'u':
            ue = u1 if nm == 'east' else u0; inward = -1 if nm == 'east' else 1
            g.poly('plaster', [g.P(ue, ySp + math.sin(math.pi * k / 16) * AW, math.cos(math.pi * k / 16) * AW) for k in range(17)], LIME, dirw(g, inward, 0))
        else:
            we = w1 if nm == 'south' else w0; inward = -1 if nm == 'south' else 1
            g.poly('plaster', [g.P(math.cos(math.pi * k / 16) * AW, ySp + math.sin(math.pi * k / 16) * AW, we) for k in range(17)], LIME, dirw(g, 0, inward))
        # lantern hanging in each arch
        uc, wc = (u0 + u1) / 2, (w0 + w1) / 2
        g.llathe('gold', uc, wc, [(0.04, yCr), (0.04, yCr - 5.0)], GOLDC, n=5)
        g.llathe('lampI', uc, wc, [(0.0, yCr - 7.2), (0.5, yCr - 6.6), (0.55, yCr - 5.6), (0.3, yCr - 5.0), (0.0, yCr - 4.9)], (1.0, 0.84, 0.58, 1.0), n=8)
        g.light('POINT', uc, yCr - 6.2, wc, 700, (1.0, 0.82, 0.58), radius=0.5)
    # end-wall doors
    for (u_, w_, du, dw) in ((A - 0.05, 0.0, -1, 0), (-A + 0.05, 0.0, 1, 0), (0.0, -A + 2.05, 0, 1), (0.0, A - 2.05, 0, -1)):
        yb = y0 + (7.5 if du > 0 else 0.0)
        if du:
            g.lbox('wood', u_ - 0.02 * du, u_ + 0.12 * du, yb, yb + 5.5, -1.8, 1.8, BRONZE_I)
            g.lbox('gold', u_ - 0.02 * du, u_ + 0.2 * du, yb + 5.5, yb + 6.2, -2.2, 2.2, GOLDC)
        else:
            g.lbox('wood', -1.8, 1.8, yb, yb + 5.0, w_ - 0.02 * dw, w_ + 0.12 * dw, BRONZE_I)
            g.lbox('gold', -2.2, 2.2, yb + 5.0, yb + 5.7, w_ - 0.02 * dw, w_ + 0.2 * dw, GOLDC)
    # pendentives: square corners -> circle
    x0, z0 = g.xz(0, 0)
    for (su, sw) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        corner = g.P(su * S, yCr - 2.0, sw * S)
        a0 = math.atan2(sw, 0) if False else None
        # arc between the two side midpoints nearest this corner (local angles)
        angs = [math.atan2(0, su), math.atan2(sw, 0)]
        angs.sort()
        if angs[1] - angs[0] > math.pi: angs = [angs[1], angs[0] + 2 * math.pi]
        pts = []
        for k in range(9):
            t = angs[0] + (angs[1] - angs[0]) * k / 8
            pts.append(g.P(math.cos(t) * S, yRing, math.sin(t) * S))
        for k in range(8):
            g.poly('plaster', [corner, pts[k], pts[k + 1]], LIME_D, dirw(g, -su, -sw, -1.2))
    # ring cornice + balustrade, drum with 16 arched windows, coffered inner dome, oculus
    g.llathe('plaster', 0, 0, [(S + 0.05, yRing - 0.9), (S - 0.6, yRing - 0.5), (S - 1.1, yRing), (S - 1.1, yRing + 0.2), (S + 0.05, yRing + 0.2)], LIME_D, n=64)
    g.llathe('gold', 0, 0, [(S - 1.12, yRing - 0.1), (S - 1.12, yRing + 0.1)], GOLDC, n=64)
    fac_n = 32
    for i in range(fac_n):
        t0, t1 = 2 * math.pi * i / fac_n, 2 * math.pi * (i + 1) / fac_n
        pa, pb = g.xz(math.cos(t0) * S, math.sin(t0) * S), g.xz(math.cos(t1) * S, math.sin(t1) * S)
        Fw = Geo.frame(pa, pb)
        if (Fw[2][0] * (x0 - pa[0]) + Fw[2][1] * (z0 - pa[1])) < 0: Fw = Geo.frame(pb, pa)
        Le = v2len(v2sub(pb, pa))
        if i % 2 == 0:
            hole = arch_hole(Le / 2, 1.9, yRing + 2.5, yRing + 8.0, 10)
            radial_panel(g, 'plaster', Fw, 0, Le, yRing + 0.2, yDr, hole, LIME)
            recess(g, Fw, hole, 0.6, 'plaster', LIME_D, 'sky', SKY)
            g.light('AREA', 0, 0, 0, 0) if False else None
        else:
            radial_panel(g, 'plaster', Fw, 0, Le, yRing + 0.2, yDr, None, LIME)
            g.fbox('plaster', Fw, Le / 2 - 0.35, Le / 2 + 0.35, yRing + 0.2, yDr - 1.0, 0, 0.3, LIME_D, top=True)
            g.fbox('gold', Fw, Le / 2 - 0.5, Le / 2 + 0.5, yDr - 1.4, yDr - 0.9, 0, 0.4, GOLDC, top=True, bottom=True)
    for i in range(16):
        t = 2 * math.pi * (i + 0.5) / 16
        p = g.P(math.cos(t) * (S + 3.0), yRing + 5.0, math.sin(t) * (S + 3.0))
        g.lights.append(('POINT', p, 900, (0.85, 0.9, 1.0), 1.0, None, None))
    g.llathe('plaster', 0, 0, [(S + 0.05, yDr - 0.2), (S - 0.8, yDr + 0.4), (S - 0.8, yDr + 0.8), (S, yDr + 0.8)], LIME_D, n=64)
    # coffered inner dome: rings of sunk panels with gilt rosettes
    NR, NS = 7, 24
    Rd, Hd = S, yApex - yDr - 0.8
    for j in range(NR):
        a0, a1 = (math.pi / 2) * j / NR * 0.92, (math.pi / 2) * (j + 1) / NR * 0.92
        r0, r1 = Rd * math.cos(a0), Rd * math.cos(a1); h0, h1 = yDr + 0.8 + Hd * math.sin(a0), yDr + 0.8 + Hd * math.sin(a1)
        for i in range(NS):
            t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
            P = lambda r, h, t, k=1.0: (x0 + math.cos(t) * r * k, h, z0 + math.sin(t) * r * k)
            g.poly('plaster', [P(r0, h0, t0), P(r0, h0, t1), P(r1, h1, t1), P(r1, h1, t0)], LIME if (i + j) % 2 else C('#ece3d1'),
                   (-math.cos((t0 + t1) / 2) * math.cos(a0), -math.sin(a0) - 0.05, -math.sin((t0 + t1) / 2) * math.cos(a0)))
            tm, rm, hm = (t0 + t1) / 2, (r0 + r1) / 2, (h0 + h1) / 2
            g.lathe('gold', x0 + math.cos(tm) * rm * 0.98, z0 + math.sin(tm) * rm * 0.98, [(0.0, hm - 0.25), (0.28, hm), (0.0, hm + 0.25)], GOLDC, n=6)
    ro = Rd * math.cos(math.pi / 2 * 0.92); ho = yDr + 0.8 + Hd * math.sin(math.pi / 2 * 0.92)
    g.lathe('gold', x0, z0, [(ro + 0.4, ho - 0.2), (ro, ho), (ro, ho + 0.6)], GOLDC, n=32)
    g.lathe('sky', x0, z0, [(ro, ho + 3.0), (0.0, ho + 3.2)], SKY, n=24)
    g.lights.append(('AREA', (x0, ho + 2.5, z0), 6000, (0.9, 0.93, 1.0), 0.1, (2 * ro, 2 * ro), None))
    # grand staircase (west): two flights of pink marble with a mid landing, the upper landing in the west arm
    W1, W2 = 11.0, 9.0
    solid_stair(g, -1.5, 0.0, -8.5, 0.0, y0, y0 + 3.75, W1, PINK_M)
    g.lbox('marble', -11.5, -8.5, y0, y0 + 3.75, -W1 / 2 - 0.4, W1 / 2 + 0.4, PINK_M, top=True, back=True)
    a, b = g.xz(-8.5, 0), g.xz(-11.5, 0)
    g.decks.append({'pts': [[round(a[0], 2), round(a[1], 2), round(y0 + 3.75, 3)], [round(b[0], 2), round(b[1], 2), round(y0 + 3.75, 3)]], 'width': W1, 'tunnel': True})
    solid_stair(g, -11.5, 0.0, -17.0, 0.0, y0 + 3.75, y0 + 7.5, W2, PINK_M)
    g.lbox('marble', -A + 0.05, -17.0, y0, y0 + 7.5, -AW + 0.05, AW - 0.05, C('#e7dccd'), top=True, back=True)
    a, b = g.xz(-17.0, 0), g.xz(-A + 0.6, 0)
    g.decks.append({'pts': [[round(a[0], 2), round(a[1], 2), round(y0 + 7.5, 3)], [round(b[0], 2), round(b[1], 2), round(y0 + 7.5, 3)]], 'width': 2 * AW - 1.0, 'tunnel': True})
    for sw in (-1, 1):   # balustrades on the landing edge beside the stair
        g.lbox('marble', -17.3, -17.0, y0 + 7.5, y0 + 8.5, sw * (W2 / 2 + 0.4), sw * AW, PINK_M) if sw > 0 else g.lbox('marble', -17.3, -17.0, y0 + 7.5, y0 + 8.5, -AW, -(W2 / 2 + 0.4), PINK_M)
        g.collider(-17.35, -16.95, min(sw * (W2 / 2 + 0.4), sw * AW), max(sw * (W2 / 2 + 0.4), sw * AW), y0, y0 + 8.5)
    g.collider(-11.6, -8.4, -W1 / 2 - 0.5, -W2 / 2 - 0.3, y0, y0 + 4.8); g.collider(-11.6, -8.4, W2 / 2 + 0.3, W1 / 2 + 0.5, y0, y0 + 4.8)
    for sw in (-1, 1):
        g.collider(-8.5, -1.5, sw * (W1 / 2) - 0.3, sw * (W1 / 2) + 0.3, y0, y0 + 4.8)
        g.collider(-17.0, -11.5, sw * (W2 / 2) - 0.3, sw * (W2 / 2) + 0.3, y0, y0 + 8.6)
    # bronze bust on a pedestal at the top of the stairs, flanking torchieres, benches in the side arms
    g.llathe('marble', -20.5, 0.0, [(0.55, y0 + 7.5), (0.45, y0 + 7.8), (0.4, y0 + 8.9), (0.55, y0 + 9.1)], C('#2b2622'), n=12, cap_top=True)
    g.llathe('metal', -20.5, 0.0, [(0.38, y0 + 9.1), (0.42, y0 + 9.4), (0.18, y0 + 9.7), (0.16, y0 + 9.85), (0.2, y0 + 10.1), (0.17, y0 + 10.3), (0.0, y0 + 10.35)], C('#4e3b24'), n=12)
    g.collider(-21.1, -19.9, -0.6, 0.6, y0 + 7.5, y0 + 10.4)
    for sw in (-1, 1):
        g.llathe('gold', -13.0, sw * (W1 / 2 + 1.4), [(0.35, y0), (0.12, y0 + 0.4), (0.08, y0 + 3.2)], GOLDC, n=8)
        g.llathe('lampI', -13.0, sw * (W1 / 2 + 1.4), [(0.0, y0 + 3.2), (0.45, y0 + 3.5), (0.35, y0 + 3.9), (0.0, y0 + 4.0)], (1.0, 0.85, 0.6, 1.0), n=8)
        g.light('POINT', -13.0, y0 + 3.6, sw * (W1 / 2 + 1.4), 150, (1.0, 0.82, 0.55), radius=0.3)
        bench(g, 0.0, sw * (S + 3.5), y0, along_u=True, L=3.6)
    # second-floor galleries in the north and south arms (mezzanine balconies overlooking the arms and the rotunda):
    # marble slabs on brackets along both side walls, balustrades, walkable decks, reached from the stair's upper landing
    ym = y0 + 7.5; gd = 2.6
    for (w0_, w1_, sgn) in ((-A + 2.2, -S - 0.2, -1), (S + 0.2, A - 2.2, 1)):
        for su in (-1, 1):
            ue, ui = su * (AW - 0.05), su * (AW - gd)
            u0_, u1_ = min(ue, ui), max(ue, ui)
            g.lbox('marble', u0_, u1_, ym - 0.45, ym, w0_, w1_, C('#e9e0d0'), top=True, bottom=True)
            g.lbox('gold', min(ui, ui - su * 0.04), max(ui, ui - su * 0.04), ym - 0.32, ym - 0.22, w0_, w1_, GOLDC)
            for k in range(int((w1_ - w0_) / 1.6) + 1):
                wk = w0_ + 0.3 + k * 1.6
                if wk > w1_ - 0.2: break
                g.lbox('plaster', u0_ + (0.0 if su < 0 else gd - 0.9), u1_ - (gd - 0.9 if su < 0 else 0.0), ym - 1.2, ym - 0.45, wk - 0.18, wk + 0.18, LIME_D, top=False, bottom=True)
                g.llathe('marble', ui + su * 0.15, wk, [(0.07, ym), (0.11, ym + 0.25), (0.06, ym + 0.55), (0.1, ym + 0.85), (0.07, ym + 0.95)], C('#f1ebe0'), n=8)
                g.llathe('marble', ui + su * 0.15, wk + 0.8, [(0.07, ym), (0.11, ym + 0.25), (0.06, ym + 0.55), (0.1, ym + 0.85), (0.07, ym + 0.95)], C('#f1ebe0'), n=8)
            g.lbox('marble', min(ui, ui + su * 0.3), max(ui, ui + su * 0.3), ym + 0.95, ym + 1.08, w0_, w1_, C('#f4eee3'), top=True, bottom=True)
            g.deck_rect(u0_ + 0.1, u1_ - 0.1, w0_ + 0.1, w1_ - 0.1, ym)
            g.collider(min(ui, ui + su * 0.3), max(ui, ui + su * 0.3), w0_, w1_, ym - 0.3, ym + 1.1)
            g.collider(u0_, u1_, w0_ - 0.3, w0_, ym - 0.3, ym + 3.0); g.collider(u0_, u1_, w1_, w1_ + 0.3, ym - 0.3, ym + 3.0)
            g.spot((u0_ + u1_) / 2, ym, (w0_ + w1_) / 2 + su * 1.5, 0.0, (w0_ + w1_) / 2, 'stand')
            # wall sconce pair per gallery
            g.lbox('lampI', ue - su * 0.12, ue - su * 0.02, ym + 1.8, ym + 2.3, (w0_ + w1_) / 2 - 0.15, (w0_ + w1_) / 2 + 0.15, (1.0, 0.82, 0.55, 1.0))
            g.light('POINT', ue - su * 0.6, ym + 2.0, (w0_ + w1_) / 2, 80, (1.0, 0.8, 0.55), radius=0.15)
        # the gallery is reached from the upper landing of the grand stair (the second floor corridor behind the arch)
        wg = w0_ + 1.5 if sgn < 0 else w1_ - 1.5
        g.link((-A + 3.0, ym, sgn * (AW - 1.0), -A + 6.0, sgn * (AW - 1.0)), (-(AW - 1.3), ym, wg, 0.0, wg), 'Second-floor gallery ' + ('north' if sgn < 0 else 'south'), 'Grand stair landing', verb='walk to')
    # visitors: a few on the floor, on the stairs' landing, in the arms
    for (u_, w_) in ((3.0, 4.0), (-4.0, -6.0), (6.0, -3.0), (18.0, 2.0), (0.0, 19.0), (0.0, -18.0)): g.spot(u_, y0, w_, 0.0, 0.0, 'stand')
    g.spot(-10.0, y0 + 3.75, 3.5, 0.0, 0.0, 'stand'); g.spot(-19.0, y0 + 7.5, -3.0, 0.0, 0.0, 'stand')
    g.shot_at(S + 3.0, y0 + 1.7, 3.0, -20.0, y0 + 6.5, 0.0)
    # doors: Polk St (east) portico -> the east arm
    ring = [L.loc(*p) for p in ring_out(main)]
    ae = max(q[0] for q in ring if abs(q[1]) < 20)
    po = L.xz(ae + 7.5, 0.0)
    pin = g.xz(A - 3.0, 0.0)
    g.doors.append({'label': 'San Francisco City Hall', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-L.u[0], -L.u[1]), 3)]})
    g.extra = {}
    return g


# ================================================================================== War Memorial Opera House: grand foyer
def opera_int(O):
    r = ring_simplify(ring_of(38733), 0.5)
    a, b = edge_facing(r, CH_U[0], CH_U[1])
    F = Geo.frame(a, b); Le = v2len(v2sub(b, a))              # u along Van Ness, w < 0 inside
    g = IGeo(O, F); g.name = 'War Memorial Opera House'; g.sky_k = 2.0
    U0, U1, W0, W1 = 5.0, Le - 5.0, -17.0, -2.5
    yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    y0 = max(yG + 0.3, floor_over(g, U0, U1, W0, W1, pad=0.1)); g.floor_y = y0
    ysp = y0 + 8.4; rv = (W1 - W0) / 2; yv = ysp + rv
    g.room('foyer', U0, U1, W0, W1, y0, yv)
    checker(g, 'marble', U0, U1, W0, W1, y0, 1.2, C('#efe9dd'), C('#cfc1aa'), diag=True)
    g.lbox('carpet', U0 + 3, U1 - 3, y0, y0 + 0.02, -10.8, -8.7, C('#8e1d22'))
    g.lbox('gold', U0 + 3, U1 - 3, y0 + 0.02, y0 + 0.024, -10.9, -10.75, GOLDC); g.lbox('gold', U0 + 3, U1 - 3, y0 + 0.02, y0 + 0.024, -8.75, -8.6, GOLDC)
    g.shell(U0, U1, W0, W1, y0, ysp, None, None, 'plaster', C('#efe6d4'), None, None)
    # coffered barrel vault
    wc = (W0 + W1) / 2
    n = 18; nu = int((U1 - U0) / 2.2)
    for i in range(n):
        t0, t1 = math.pi * i / n, math.pi * (i + 1) / n
        for k in range(nu):
            u0, u1 = U0 + (U1 - U0) * k / nu, U0 + (U1 - U0) * (k + 1) / nu
            P = lambda uu, t: g.P(uu, ysp + math.sin(t) * rv, wc + math.cos(t) * rv)
            tm = (t0 + t1) / 2
            g.poly('plaster', [P(u0, t0), P(u1, t0), P(u1, t1), P(u0, t1)], C('#f3ead8') if (i + k) % 2 else C('#e9dcc2'), dirw(g, 0, -math.cos(tm), -math.sin(tm)))
        if i % 3 == 0:
            P = lambda uu, t, d=0.0: g.P(uu, ysp + math.sin(t) * (rv - d), wc + math.cos(t) * (rv - d))
            g.poly('gold', [P(U0, t0, 0.15), P(U1, t0, 0.15), P(U1, t0 + 0.03, 0.15), P(U0, t0 + 0.03, 0.15)], GOLDC, dirw(g, 0, -math.cos(t0), -math.sin(t0)))
    for ue, inward in ((U0, 1), (U1, -1)):
        g.poly('plaster', [g.P(ue, ysp + math.sin(math.pi * j / 18) * rv, wc + math.cos(math.pi * j / 18) * rv) for j in range(19)], C('#efe6d4'), dirw(g, inward, 0))
    for k in range(nu + 1):
        u = U0 + (U1 - U0) * k / nu
        pts = [g.P(u, ysp + math.sin(math.pi * j / 16) * (rv - 0.25), wc + math.cos(math.pi * j / 16) * (rv - 0.25)) for j in range(17)]
        for j in range(16): g.rod('gold', pts[j], pts[j + 1], 0.12, GOLDC, n=4)
    # street side: tall arched windows (daylight); back side: paired marble columns + auditorium doors + mirrors
    for k in range(int((U1 - U0) / 6.4)):
        u = U0 + 3.2 + k * 6.4
        pts = [(u - 1.6, y0 + 1.0), (u + 1.6, y0 + 1.0)] + [(u + 1.6 * math.cos(t), y0 + 5.6 + 1.6 * math.sin(t)) for t in [math.pi * i / 10 for i in range(11)]]
        g.poly('sky', [g.P(x_, y_, W1 - 0.06) for x_, y_ in pts], SKY, (-F[2][0], 0, -F[2][1]))
        g.lbox('gold', u - 1.7, u + 1.7, y0 + 0.9, y0 + 1.0, W1 - 0.25, W1 - 0.06, GOLDC)
        g.light('AREA', u, y0 + 4.0, W1 - 0.8, 110, (0.85, 0.9, 1.0), size=(3.0, 4.5), rot=(math.pi / 2, 0, math.atan2(F[2][0], -F[2][1]) * 0))
        for d in (-0.75, 0.75):
            uu = u + 3.2 + d
            if uu > U1 - 1: continue
            g.llathe('marble', uu, W0 + 1.6, [(0.55, y0), (0.55, y0 + 0.4), (0.45, y0 + 0.6), (0.4, ysp - 1.2), (0.55, ysp - 0.6), (0.55, ysp)], C('#e2d6c2'), n=14)
            g.lbox('gold', uu - 0.6, uu + 0.6, ysp - 0.9, ysp - 0.6, W0 + 1.0, W0 + 2.2, GOLDC)
            g.collider(uu - 0.5, uu + 0.5, W0 + 1.1, W0 + 2.1, y0, ysp)
        if k % 2 == 0:
            g.lbox('wood', u - 1.1, u + 1.1, y0, y0 + 3.6, W0 + 0.02, W0 + 0.14, C('#6a1f1f'))
            g.lbox('gold', u - 1.3, u + 1.3, y0 + 3.6, y0 + 4.0, W0 + 0.02, W0 + 0.2, GOLDC)
        else:
            g.lbox('chrome', u - 1.0, u + 1.0, y0 + 1.0, y0 + 5.0, W0 + 0.02, W0 + 0.06, C('#c8c3b8'))
    # chandeliers along the axis
    nch = max(3, int((U1 - U0) / 16))
    for k in range(nch):
        u = U0 + (U1 - U0) * (k + 0.5) / nch
        chandelier(g, u, wc, yv - 0.3, drop=4.6, R=1.5, tiers=3, power=1100)
    # grand stairs at both ends up to landings with doors to the boxes
    for (u_s0, u_s1) in ((U0 + 10.5, U0 + 1.5), (U1 - 10.5, U1 - 1.5)):
        solid_stair(g, u_s0, W0 + 3.0, u_s1, W0 + 3.0, y0, y0 + 4.5, 3.2, C('#e6dccb'))
        uu0, uu1 = min(u_s1, u_s1 + (1.5 if u_s1 < u_s0 else -1.5) * 0), u_s1
        lu0, lu1 = (U0, U0 + 1.5) if u_s1 < u_s0 else (U1 - 1.5, U1)
        g.lbox('marble', lu0, lu1, y0, y0 + 4.5, W0, W0 + 5.0, C('#e6dccb'), top=True)
        a_, b_ = g.xz((lu0 + lu1) / 2, W0 + 0.4), g.xz((lu0 + lu1) / 2, W0 + 4.8)
        g.decks.append({'pts': [[round(a_[0], 2), round(a_[1], 2), round(y0 + 4.5, 3)], [round(b_[0], 2), round(b_[1], 2), round(y0 + 4.5, 3)]], 'width': 1.4, 'tunnel': True})
    for u in (U0 + 1.5, U1 - 1.5):
        potted_plant(g, u, W1 - 1.6, y0, h=2.4, seed=int(u))
        g.collider(u - 0.5, u + 0.5, W1 - 2.1, W1 - 1.1, y0, y0 + 1.5)
    g.door('War Memorial Opera House', (U0 + U1) / 2, 4.0, sidewalk(*g.xz((U0 + U1) / 2, 4.0)), (U0 + U1) / 2, W1 - 2.5, y0)
    return g


# ================================================================================== Ferry Building: the nave marketplace
SHOPS = ['TIDEWATER OYSTERS', 'MISSION LOAF', 'GOLDEN WHEEL CHEESE', 'EMBARCADERO ROASTERS', 'SEA SALT CHOCOLATE', 'PIER MUSHROOMS', 'FOGHORN BOOKS',
         'SONOMA OLIVE MILL', 'DOCKSIDE FISH CO', 'NOB HILL NOODLES', 'MARIN FARMSTAND', 'BAYSIDE CREAMERY', 'HARBOR WINE BAR', 'CABLE CAR TEA',
         'FERRY FLOWERS', 'PACIFIC PASTA', 'SUNSET SPICES', 'BAY BUTCHER', 'NAPA HONEY', 'LANDING TAQUERIA']


def sign_uv(k, cols=2, rows=16):
    """Blender-space UVs (v up) of atlas cell k for a quad ordered bottom-left, bottom-right, top-right, top-left"""
    c, r = k % cols, k // cols
    u0, u1 = c / cols + 0.004, (c + 1) / cols - 0.004
    v1 = 1.0 - r / rows - 0.002; v0 = 1.0 - (r + 1) / rows + 0.002
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def ferry_int(O):
    L, a0, a1, b0, b1 = fb_frame()
    front_b = b0 if abs(b0) < abs(b1) else b1
    bm = (b0 + b1) / 2
    F = (L.xz(0, bm), L.u, L.v)                      # u along the nave, w across (0 = nave axis)
    g = IGeo(O, F); g.name = 'Ferry Building Marketplace'; g.sky_k = 3.0
    g.extra = {'signs': 'ferry_int_signs.png'}
    U0, U1 = a0 + 17.5, a1 - 17.5
    NW, AR = 6.5, 10.8                               # nave half width, arcade/shop line
    yG = min(sidewalk(*L.xz(a, b)) for a in (a0, 0, a1) for b in (b0, b1)) + 0.1
    y0 = max(yG + 0.25, floor_over(g, U0, U1, -AR, AR, pad=0.1)); g.floor_y = y0
    yb, yw, yt = y0 + 6.4, y0 + 13.2, y0 + 17.2
    g.room('nave', U0, U1, -AR, AR, y0, yt)
    # mosaic floor + the Great Seal at the centre
    checker(g, 'tiles', U0, U1, -NW, NW, y0, 0.9, C('#d9cdb5'), C('#b9a27f'), diag=True)
    for w0, w1 in ((-AR, -NW), (NW, AR)):
        checker(g, 'tiles', U0, U1, w0, w1, y0, 0.9, C('#cfc2a8'), C('#cfc2a8'), diag=False)
    x, z = g.xz(0, 0)
    for k, (r0, r1, cc) in enumerate(((4.6, 4.2, C('#6e5a3e')), (4.2, 3.2, C('#e8dcc2')), (3.2, 2.9, C('#6e5a3e')), (2.9, 0.0, C('#c9a35c')))):
        g.lathe('tiles', x, z, [(r0, y0 + 0.004 * (k + 1)), (r1, y0 + 0.004 * (k + 1))], cc, n=40)
    for i in range(24):
        t = 2 * math.pi * i / 24
        g.poly('tiles', [(x + math.cos(t) * 0.4, y0 + 0.03, z + math.sin(t) * 0.4), (x + math.cos(t + 0.1) * 2.7, y0 + 0.03, z + math.sin(t + 0.1) * 2.7),
                         (x + math.cos(t - 0.1) * 2.7, y0 + 0.03, z + math.sin(t - 0.1) * 2.7)], C('#2f4a6b') if i % 2 else C('#8a2c2c'), (0, 1, 0))
    # side arcades: cast-iron columns on the nave line, balcony above, shop fronts on the arcade line
    g.shell(U0, U1, -AR, AR, y0, yt, None, None, 'plaster', C('#efe7d6'), None, None, ceiling=False)
    col_step = 6.0
    ncol = int((U1 - U0) / col_step)
    rng = random.Random(4)
    for side in (-1, 1):
        wn, wa = side * NW, side * AR
        for k in range(ncol + 1):
            u = U0 + (U1 - U0) * k / ncol
            g.llathe('paint', u, wn, [(0.32, y0), (0.32, y0 + 0.5), (0.2, y0 + 0.7), (0.18, yb - 0.6), (0.4, yb - 0.1)], C('#e9e2cf'), n=10)
            g.llathe('paint', u, wn, [(0.18, yb + 0.3), (0.16, yw - 0.6), (0.35, yw)], C('#e9e2cf'), n=10)
            g.collider(u - 0.3, u + 0.3, wn - 0.3, wn + 0.3, y0, yb)
        # balcony slab + railing, gallery floor deck
        g.lbox('plaster', U0, U1, yb - 0.35, yb, min(wn, wa), max(wn, wa), C('#eee6d4'), top=True, bottom=True)
        g.lbox('wood', U0, U1, yb, yb + 0.02, min(wn, wa), max(wn, wa), C('#8a6a48'))
        rail(g, [(U0, wn), (U1, wn)], yb, 1.05, col=C('#3e4240'), post=1.0)
        g.collider(U0, U1, min(wn, wn + side * 0.25), max(wn, wn + side * 0.25), yb - 0.2, yb + 1.1)     # gallery railing
        # shop bays (ground) + gallery office windows (upper)
        nb = int((U1 - U0) / 6.0)
        for k in range(nb):
            u0, u1 = U0 + (U1 - U0) * k / nb, U0 + (U1 - U0) * (k + 1) / nb
            um = (u0 + u1) / 2
            wf = wa - side * 0.05
            g.panel_in('screen', u0 + 0.4, u1 - 0.4, y0 + 0.9, y0 + 3.6, wf, (0.3 + 0.25 * rng.random(), 0.2 + 0.2 * rng.random(), 0.1 + 0.15 * rng.random(), 1.0), -side)
            g.lbox('wood', u0 + 0.35, u1 - 0.35, y0, y0 + 0.9, min(wf, wf - side * 0.8), max(wf, wf - side * 0.8), C('#6b4b31') if k % 2 else C('#8a6a48'), collide=True)
            g.lbox('paint', u0 + 0.1, u1 - 0.1, y0 + 3.9, y0 + 4.9, min(wf, wf - side * 0.12), max(wf, wf - side * 0.12), [C('#1f3a2e'), C('#2e2a4a'), C('#5a2222'), C('#20303f')][k % 4])
            name = SHOPS[(k * 2 + (0 if side < 0 else 1)) % len(SHOPS)]
            Ft = (g.xz(um, wf - side * 0.13), (-side * F[1][0], -side * F[1][1]), (-side * F[2][0], -side * F[2][1]))
            # shop name: one quad mapped onto its cell of the sign atlas (tools/blender/hero_signs.py), was ~2.5k tris of text
            hwid = min(2.6, (u1 - u0) / 2 - 0.35)
            g.poly('signI', [Geo.fp(Ft, -hwid, y0 + 4.02, 0.01), Geo.fp(Ft, hwid, y0 + 4.02, 0.01), Geo.fp(Ft, hwid, y0 + 4.78, 0.01), Geo.fp(Ft, -hwid, y0 + 4.78, 0.01)],
                   (1.0, 0.92, 0.75, 1.0), (Ft[2][0], 0, Ft[2][1]), uv=sign_uv(SHOPS.index(name)))
            if k % 2 == 0: g.light('POINT', um, y0 + 3.0, wa - side * 2.0, 110, (1.0, 0.85, 0.62), radius=0.4)
            for kk in range(2):
                uu = u0 + (u1 - u0) * (kk + 0.5) / 2
                g.panel_in('sky' if (k + kk) % 3 else 'lampI', uu - 0.9, uu + 0.9, yb + 1.2, yw - 1.6, wf, SKY if (k + kk) % 3 else (1.0, 0.9, 0.72, 1.0), -side)
        # the gallery stairs (one per side, near the centre)
        us0, us1 = (2.0, 14.0) if side < 0 else (-2.0, -14.0)
        solid_stair(g, us0, side * (NW + 2.2), us1, side * (NW + 2.2), y0, yb, 2.6, C('#d8cbb3'), bal=False)
        a_, b_ = g.xz(U0 + 0.5, side * (NW + AR) / 2), g.xz(U1 - 0.5, side * (NW + AR) / 2)
        g.decks.append({'pts': [[round(a_[0], 2), round(a_[1], 2), round(yb, 3)], [round(b_[0], 2), round(b_[1], 2), round(yb, 3)]], 'width': AR - NW - 0.4, 'tunnel': True})
    # clerestory: glazed gable roof on bowstring trusses; bake-only sky above
    for side in (-1, 1):
        g.poly('glassI', [g.P(U0, yw, side * NW), g.P(U1, yw, side * NW), g.P(U1, yt, side * 1.2), g.P(U0, yt, side * 1.2)], C('#d8e2e4'), dirw(g, 0, -side, -1))
        g.lbox('plaster', U0, U1, yw - 1.0, yw, min(side * NW, side * AR), max(side * NW, side * AR), C('#e8dfcc'), top=True, bottom=True)
    g.lbox('metal', U0, U1, yt - 0.1, yt + 0.3, -1.3, 1.3, C('#46504c'))
    for k in range(int((U1 - U0) / 6.0) + 1):
        u = U0 + k * 6.0
        pts = [g.P(u, yw - 0.3 + math.sin(math.pi * j / 12) * (yt - yw + 0.2), -NW + 2 * NW * j / 12) for j in range(13)]
        for j in range(12): g.rod('metal', pts[j], pts[j + 1], 0.09, C('#46504c'), n=4)
        g.rod('metal', g.P(u, yw - 0.3, -NW), g.P(u, yw - 0.3, NW), 0.06, C('#46504c'), n=4)
        for j in range(1, 12, 2): g.rod('metal', pts[j], g.P(u, yw - 0.3, -NW + 2 * NW * j / 12), 0.04, C('#46504c'), n=3)
    g.poly('bakesky', [g.P(U0, yt + 6, -AR), g.P(U1, yt + 6, -AR), g.P(U1, yt + 6, AR), g.P(U0, yt + 6, AR)], SKY, (0, -1, 0))
    # pendant globes down the nave
    for k in range(int((U1 - U0) / 12.0)):
        u = U0 + 6 + k * 12.0
        g.llathe('metal', u, 0, [(0.02, yw), (0.02, y0 + 8.0)], C('#2a2a2a'), n=4)
        g.llathe('lampI', u, 0, [(0.0, y0 + 7.2), (0.45, y0 + 7.6), (0.4, y0 + 8.0), (0.0, y0 + 8.1)], (1.0, 0.9, 0.7, 1.0), n=10)
        g.light('POINT', u, y0 + 7.6, 0, 450, (1.0, 0.86, 0.62), radius=0.4)
    # market tables + planters in the nave
    for k in range(6):
        u = U0 + 20 + k * (U1 - U0 - 40) / 5
        if abs(u) < 8: continue
        g.lbox('wood', u - 2.0, u + 2.0, y0, y0 + 0.9, -1.0, 1.0, C('#7a5a3a'), collide=True)
        # produce / bakery stall: baskets, crates, bread, cheese (Poly Haven)
        from hero_props import prop
        kind = k % 3
        for kk in range(4):
            uu = u - 1.5 + kk * 1.0
            if kind == 0:
                prop(g, 'wicker_basket_01', uu, y0 + 0.9, -0.35, fit=(0.55, None, None), collide=False)
                prop(g, 'lemon' if kk % 2 else 'bananas', uu, y0 + 1.02, -0.35, fit=(0.3, None, None), collide=False)
                prop(g, 'wooden_crate_01', uu, y0 + 0.9, 0.45, fit=(0.6, None, None), collide=False)
            elif kind == 1:
                prop(g, 'croissant', uu, y0 + 0.9, -0.3, fit=(0.16, None, None), collide=False)
                prop(g, 'croissant', uu + 0.25, y0 + 0.9, -0.1, yaw=1.1, fit=(0.16, None, None), collide=False)
                prop(g, 'strawberry_chocolate_cake', uu, y0 + 0.9, 0.4, fit=(0.3, None, None), collide=False)
            else:
                prop(g, 'CheeseBox_01', uu, y0 + 0.9, -0.3, fit=(0.45, None, None), collide=False)
                prop(g, 'wine_bottles_01', uu, y0 + 0.9, 0.45, fit=(0.35, None, None), collide=False)
        for sw in (-1, 1): g.spot(u + sw * 1.2, y0, sw * 1.9, u, 0.0, 'stand')
    # cafe corner at both nave ends: pedestal tables + chairs, people
    from hero_props import prop
    for ue in (U0 + 6.0, U1 - 6.0):
        for q in range(4):
            uq, wq = ue + (q % 2) * 3.0 - 1.5, (q // 2) * 4.0 - 2.0
            prop(g, 'round_wooden_table_01', uq, y0, wq, fit=(0.8, None, None))
            for aq in (0.0, math.pi):
                prop(g, 'bar_chair_round_01', uq + math.cos(aq) * 0.75, y0, wq + math.sin(aq) * 0.75, fit=(None, 0.75, None), collide=False)
            if q % 2 == 0: g.spot(uq + 0.75, y0, wq, uq, wq, 'stand')
    for k in range(8): g.spot(U0 + 12 + k * (U1 - U0 - 24) / 7, yb, (-1 if k % 2 else 1) * (NW + 1.4), 0.0, 0.0, 'stand')
    g.shot_at(U0 + 10.0, yb + 1.7, NW + 1.2, U1 - 10.0, y0 + 1.5, -NW)
    # doors: the Embarcadero entrance under the tower
    fs = -1 if front_b == b0 else 1
    po = L.xz(0.0, front_b + fs * 6.0)
    pin = g.xz(3.5, fs * 2.5)
    g.doors.append({'label': 'Ferry Building Marketplace', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(face_yaw(L.v[0] * fs, L.v[1] * fs), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


# ================================================================================== Coit Tower: mural lobby, spiral stair up the shaft, observation deck
def mural(g, F, u0, u1, y0, y1, w, face, seed):
    """a WPA-style fresco band: sky, hills, a city row, fields, and working figures (vertex-coloured panels)"""
    R = random.Random(seed)
    P = lambda u, y, d=0.0: Geo.fp(F, u, y, w + face * d)
    N = (F[2][0] * face, 0, F[2][1] * face)
    H_ = y1 - y0
    bands = [(0.62, 1.0, (0.62, 0.72, 0.78)), (0.48, 0.62, (0.55, 0.6, 0.42)), (0.0, 0.48, (0.62, 0.52, 0.36))]
    for (t0, t1, c) in bands:
        g.poly('plaster', [P(u0, y0 + H_ * t0, 0.002), P(u1, y0 + H_ * t0, 0.002), P(u1, y0 + H_ * t1, 0.002), P(u0, y0 + H_ * t1, 0.002)], (*c, 1.0), N)
    u = u0
    while u < u1 - 0.5:    # hills + city silhouettes
        wdt = R.uniform(0.6, 1.6); hh = R.uniform(0.05, 0.16) * H_
        c = (0.42 + R.random() * 0.2, 0.46 + R.random() * 0.15, 0.36 + R.random() * 0.12, 1.0) if R.random() < 0.6 else (0.55, 0.5, 0.48, 1.0)
        g.poly('plaster', [P(u, y0 + H_ * 0.62, 0.004), P(min(u1, u + wdt), y0 + H_ * 0.62, 0.004), P(min(u1, u + wdt), y0 + H_ * 0.62 + hh, 0.004), P(u, y0 + H_ * 0.62 + hh, 0.004)], c, N)
        u += wdt
    for k in range(int((u1 - u0) / 0.45)):   # figures
        uc = u0 + 0.3 + k * 0.45 + R.uniform(-0.1, 0.1)
        if uc > u1 - 0.3: break
        hh = H_ * R.uniform(0.3, 0.46); wd = R.uniform(0.14, 0.24); yb = y0 + H_ * R.uniform(0.04, 0.12)
        cloth = [(0.25, 0.3, 0.45), (0.55, 0.28, 0.2), (0.35, 0.42, 0.28), (0.72, 0.62, 0.42), (0.3, 0.26, 0.24)][R.randrange(5)]
        g.poly('plaster', [P(uc - wd, yb, 0.006), P(uc + wd, yb, 0.006), P(uc + wd * 0.9, yb + hh * 0.82, 0.006), P(uc - wd * 0.9, yb + hh * 0.82, 0.006)], (*cloth, 1.0), N)
        sk = (0.72, 0.55, 0.42, 1.0) if R.random() < 0.7 else (0.45, 0.32, 0.24, 1.0)
        n = 8; hr = wd * 0.55
        g.poly('plaster', [P(uc + math.cos(2 * math.pi * i / n) * hr, yb + hh * 0.82 + hr + math.sin(2 * math.pi * i / n) * hr, 0.008) for i in range(n)], sk, N)
        if R.random() < 0.4:   # a tool / sheaf
            g.poly('plaster', [P(uc + wd, yb + hh * 0.2, 0.009), P(uc + wd + 0.05, yb + hh * 0.2, 0.009), P(uc + wd + 0.25, yb + hh * 0.95, 0.009), P(uc + wd + 0.2, yb + hh * 0.95, 0.009)], (0.35, 0.25, 0.15, 1.0), N)
    g.fbox('wood', F, u0, u1, y0 - 0.05, y0 + 0.05, w + face * 0.0 if face > 0 else w - 0.06, w + 0.06 if face > 0 else w, C('#6b4a2e'), top=True) if False else None


def coit_int(O):
    c, L = coit_frame()
    F = (c, L.u, L.v)
    g = IGeo(O, F); g.name = 'Coit Tower'; g.sky_k = 3.0
    base = ring_of(9291)
    yG = min(H(*p) for p in ring_out(base)) + 0.15
    R, RIN, DK = COIT['R'], COIT['RIN'], COIT['DECK']
    RO = 8.9                                          # lobby outer wall (octagon)
    y0 = max(yG + 0.12, floor_over(g, -RO, RO, -RO, RO, pad=0.1)); g.floor_y = y0
    yl = min(y0 + 4.4, yG + 5.0)
    y_a0 = yG + DK - 1.0
    yd = y_a0 + 1.2                                   # deck floor (sills at +1.0)
    ytop = yd + 5.0
    cx, cz = c
    # ---- rooms: shaft first (camera clamp), then deck floor, lobby
    g.room('shaft', -RIN, RIN, -RIN, RIN, y0, ytop)
    g.room('deck', -RIN + 0.3, RIN - 0.3, -RIN + 0.3, RIN - 0.3, yd, ytop)
    g.room('lobby', -RO, RO, -RO, RO, y0, yl)
    # ---- lobby: floor, octagonal mural walls, ceiling, the shaft's outer face with the doorway
    NO = 8
    oc = ring_facets(cx, cz, RO / math.cos(math.pi / NO), NO, math.pi / NO)
    x0, z0 = cx, cz
    g.lathe('tiles', cx, cz, [(RO / math.cos(math.pi / NO), y0), (R, y0)], C('#b99a76'), n=NO, a0=math.pi / NO, a1=math.pi / NO + 2 * math.pi)
    g.lathe('tiles', cx, cz, [(RIN, y0 + 0.01), (0.0, y0 + 0.01)], C('#c2a582'), n=24)
    for i in range(NO):
        a, b = oc[i], oc[(i + 1) % NO]
        Fw = Geo.frame(a, b)
        if Fw[2][0] * (cx - a[0]) + Fw[2][1] * (cz - a[1]) < 0: Fw = Geo.frame(b, a)
        Le = v2len(v2sub(b, a))
        radial_panel(g, 'plaster', Fw, 0, Le, y0, yl, None, C('#e9dfca'))
        mural(g, Fw, 0.4, Le - 0.4, y0 + 0.9, yl - 0.35, 0.0, 1, 11 + i)
        g.fbox('wood', Fw, 0, Le, y0, y0 + 0.9, 0, 0.05, C('#6b4a2e'), top=True)
        g.fbox('plaster', Fw, 0, Le, yl - 0.3, yl, 0, 0.15, C('#d8cbb0'), top=False, bottom=True)
        mid = v2lerp(a, b, 0.5)
        g.lights.append(('POINT', (mid[0] + (cx - mid[0]) * 0.25, yl - 0.6, mid[1] + (cz - mid[1]) * 0.25), 55, (1.0, 0.86, 0.66), 0.2, None, None))
        g.cols.append({'x': round(mid[0] - Fw[2][0] * 0.3, 2), 'z': round(mid[1] - Fw[2][1] * 0.3, 2), 'hx': round(Le / 2 + 0.3, 2), 'hz': 0.3,
                       'yaw': round(math.atan2(-Fw[1][1], Fw[1][0]), 4), 'yMin': y0 - 1, 'yMax': yl})
    g.lathe('plaster', cx, cz, [(R, yl), (RO / math.cos(math.pi / NO), yl)], C('#efe7d6'), n=NO, a0=math.pi / NO, a1=math.pi / NO + 2 * math.pi)
    # shaft outer face (lobby side) with a doorway on the entrance side
    pa_, pb_ = edge_facing(ring_simplify(base, 0.35), -1, 0); ec = v2lerp(pa_, pb_, 0.5)
    th_door = math.atan2(ec[1] - cz, ec[0] - cx)
    NS = 32
    for i in range(NS):
        t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
        dd = abs((((t0 + t1) / 2 - th_door) + math.pi) % (2 * math.pi) - math.pi)
        yb_ = y0 + 3.0 if dd < 0.2 else y0
        for (rr, face, col) in ((R, 1, C('#e3dac6')), (RIN, -1, C('#d9d0bb'))):
            P = lambda t, y: (cx + math.cos(t) * rr, y, cz + math.sin(t) * rr)
            ytop_ = yl if face > 0 else yd - 0.3
            g.quad_sub('plaster', P(t0, yb_), P(t1, yb_), P(t1, ytop_), P(t0, ytop_), col, (math.cos((t0 + t1) / 2) * face, 0, math.sin((t0 + t1) / 2) * face), maxe=3.0)
        if dd < 0.2:
            g.poly('plaster', [(cx + math.cos(t0) * RIN, y0 + 3.0, cz + math.sin(t0) * RIN), (cx + math.cos(t1) * RIN, y0 + 3.0, cz + math.sin(t1) * RIN),
                               (cx + math.cos(t1) * R, y0 + 3.0, cz + math.sin(t1) * R), (cx + math.cos(t0) * R, y0 + 3.0, cz + math.sin(t0) * R)], C('#cfc5ae'), (0, -1, 0))
        elif i % 2 == 0:
            tm = (t0 + t1) / 2
            g.cols.append({'x': round(cx + math.cos(tm) * (RIN + 0.3), 2), 'z': round(cz + math.sin(tm) * (RIN + 0.3), 2), 'hx': round(RIN * 2 * math.pi / NS + 0.2, 2), 'hz': 0.35,
                           'yaw': round(math.atan2(-math.cos(tm), -math.sin(tm)), 4),
                           'yMin': y0 - 1, 'yMax': yd})
    # ---- spiral stair: helix around a central column from the lobby floor to the deck
    RC, RS0, RS1 = 1.1, 1.3, RIN - 0.15
    rm = (RS0 + RS1) / 2
    rise = yd - y0
    slope = 0.6
    turns = rise / (2 * math.pi * rm * slope)
    nseg = int(turns * 18) + 1
    th0 = th_door + math.pi * 0.62                   # start beside the doorway, climbing counter-clockwise
    g.lathe('concrete', cx, cz, [(RC, y0), (RC, yd)], C('#d7cfbd'), n=16)
    g.cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': RC, 'hz': RC, 'yaw': 0, 'yMin': y0 - 1, 'yMax': yd})
    g.cols.append({'x': round(cx, 2), 'z': round(cz, 2), 'hx': RC, 'hz': RC, 'yaw': 0.785, 'yMin': y0 - 1, 'yMax': yd})
    nsteps = int(rise / 0.17)
    tot = 2 * math.pi * turns
    for k in range(nsteps):
        ta, tb = th0 + tot * k / nsteps, th0 + tot * (k + 1) / nsteps
        ya = y0 + rise * (k + 1) / nsteps; yp = y0 + rise * k / nsteps
        Pt = lambda t, r, y: (cx + math.cos(t) * r, y, cz + math.sin(t) * r)
        g.poly('concrete', [Pt(ta, RS0, ya), Pt(ta, RS1, ya), Pt(tb, RS1, ya), Pt(tb, RS0, ya)], C('#cbbfa6') if k % 2 else C('#c2b69c'), (0, 1, 0))
        g.poly('concrete', [Pt(ta, RS0, yp), Pt(ta, RS1, yp), Pt(ta, RS1, ya), Pt(ta, RS0, ya)], C('#b3a78e'), (-math.sin(ta), 0, math.cos(ta)))
        g.poly('concrete', [Pt(ta, RS0, yp - 0.35), Pt(tb, RS0, ya - 0.35), Pt(tb, RS1, ya - 0.35), Pt(ta, RS1, yp - 0.35)], C('#bfb49c'), (0, -1, 0))
        if k % 3 == 0:
            g.rod('metal', Pt(ta, RS1 - 0.1, ya + 0.95), Pt(th0 + tot * min(nsteps, k + 3) / nsteps, RS1 - 0.1, y0 + rise * min(nsteps, k + 3) / nsteps + 0.95), 0.03, C('#3a3a3a'), n=4)
            g.rod('metal', Pt(ta, RS0 + 0.08, ya + 0.95), Pt(th0 + tot * min(nsteps, k + 3) / nsteps, RS0 + 0.08, y0 + rise * min(nsteps, k + 3) / nsteps + 0.95), 0.03, C('#3a3a3a'), n=4)
        if k % 12 == 0:
            p = Pt(ta, RIN - 0.08, ya + 2.2)
            g.lathe('lampI', p[0], p[2], [(0.0, ya + 2.0), (0.14, ya + 2.1), (0.12, ya + 2.35), (0.0, ya + 2.4)], (1.0, 0.85, 0.6, 1.0), n=6)
            if k % 24 == 0: g.lights.append(('POINT', Pt(ta, RIN - 0.6, ya + 2.2), 70, (1.0, 0.84, 0.6), 0.15, None, None))
    for s in range(nseg):
        ta, tb = th0 + tot * s / nseg, th0 + tot * (s + 1) / nseg
        A_ = (cx + math.cos(ta) * rm, cz + math.sin(ta) * rm); B_ = (cx + math.cos(tb) * rm, cz + math.sin(tb) * rm)
        g.decks.append({'pts': [[round(A_[0], 2), round(A_[1], 2), round(y0 + rise * s / nseg, 3)], [round(B_[0], 2), round(B_[1], 2), round(y0 + rise * (s + 1) / nseg, 3)]],
                        'width': round(RS1 - RS0, 2), 'tunnel': True})
    # ---- observation deck: floor with the stair well, arcade wall with 12 open arches, ceiling, parapet colliders
    tend = th0 + tot
    for i in range(48):
        t0, t1 = 2 * math.pi * i / 48, 2 * math.pi * (i + 1) / 48
        tm = (t0 + t1) / 2
        dd = ((tend - tm) % (2 * math.pi))
        if dd < 1.9: continue                        # the well over the last part of the stair
        g.poly('tiles', [(cx, yd, cz), (cx + math.cos(t0) * RIN, yd, cz + math.sin(t0) * RIN), (cx + math.cos(t1) * RIN, yd, cz + math.sin(t1) * RIN)], C('#b99a76'), (0, 1, 0))
        g.poly('plaster', [(cx, yd - 0.3, cz), (cx + math.cos(t1) * RIN, yd - 0.3, cz + math.sin(t1) * RIN), (cx + math.cos(t0) * RIN, yd - 0.3, cz + math.sin(t0) * RIN)], C('#e3dac6'), (0, -1, 0))
    for i in range(24):   # rail around the well (open toward the stair's arrival)
        t = tend - 1.9 + 1.9 * i / 24 * 0.8
        g.rod('metal', (cx + math.cos(t) * RS0, yd, cz + math.sin(t) * RS0), (cx + math.cos(t) * RS0, yd + 1.0, cz + math.sin(t) * RS0), 0.025, C('#3a3a3a'), n=4)
    NA = 12
    fac = ring_facets(cx, cz, RIN, NA)
    for i in range(NA):
        a, b = fac[i], fac[(i + 1) % NA]
        Fw = Geo.frame(a, b)
        if Fw[2][0] * (cx - a[0]) + Fw[2][1] * (cz - a[1]) < 0: Fw = Geo.frame(b, a)
        Le = v2len(v2sub(b, a))
        hole = opening_poly(Le / 2, 1.75, y_a0 + 2.2, y_a0 + 5.6, 1, 10)
        radial_panel(g, 'plaster', Fw, 0, Le, yd - 0.3, ytop, hole, C('#e8dfcb'))
        mid = v2lerp(a, b, 0.5)
        g.cols.append({'x': round(mid[0] - Fw[2][0] * 0.1, 2), 'z': round(mid[1] - Fw[2][1] * 0.1, 2), 'hx': round(Le / 2 + 0.2, 2), 'hz': 0.3,
                       'yaw': round(math.atan2(-Fw[1][1], Fw[1][0]), 4), 'yMin': yd - 0.2, 'yMax': yd + 1.05})
        # bake-only sky outside each arch
        tm = math.atan2(mid[1] - cz, mid[0] - cx)
        so = [(cx + math.cos(tm + d) * 9.0, cz + math.sin(tm + d) * 9.0) for d in (-0.3, 0.3)]
        g.poly('bakesky', [(so[0][0], yd - 3, so[0][1]), (so[1][0], yd - 3, so[1][1]), (so[1][0], ytop + 3, so[1][1]), (so[0][0], ytop + 3, so[0][1])], SKY, (cx - mid[0], 0, cz - mid[1]))
    g.lathe('plaster', cx, cz, [(RIN, ytop), (0.0, ytop)], C('#f1ebe0'), n=24)
    g.lights.append(('POINT', (cx, ytop - 0.6, cz), 160, (1.0, 0.9, 0.75), 0.3, None, None))
    # doors: through the tall portal of the entrance pavilion
    n = edge_n(pa_, pb_); m = ec
    po = (m[0] + n[0] * 2.5, m[1] + n[1] * 2.5)
    dvec = v2norm(v2sub(m, c))
    pin = (cx + dvec[0] * (RO - 1.8), cz + dvec[1] * (RO - 1.8))
    g.doors.append({'label': 'Coit Tower', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(n[0], n[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-dvec[0], -dvec[1]), 3)]})
    return g


INTERIORS = {'cityHall': cityhall_int, 'opera': opera_int, 'ferry': ferry_int, 'coit': coit_int}


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = int(a[a.index('--res') + 1]) if '--res' in a else 2048
    spp = int(a[a.index('--spp') + 1]) if '--spp' in a else 256
    ids = [x for x in a if not x.startswith('--') and not x.isdigit()]
    for bid in ids:
        fn, hide = BUILDERS[bid]
        O = ORIGINS[bid]() if bid in ORIGINS else origin_for([ring_of(i) for i in hide])
        run_interior(bid, INTERIORS[bid], O, res=res, samples=spp)


if __name__ == '__main__':
    main()
