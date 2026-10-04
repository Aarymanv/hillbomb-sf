"""HILLBOMB hero interiors, wave 5. Run:  python hero_int_w5.py -- fortPoint alcatraz ... [--res 2048 --spp 256]

Interior meta extras (hero_int.js): hideExt (hide the site's exterior while the player is inside: open courtyards that
share the exterior's walls), showR (radius in which the interior shows from outside; 0 = only when inside).
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_interior import *   # noqa
from hero_int_w1 import (floor_over, potted_plant, rail, stairs)   # noqa
from hero_int_w2 import face_yaw, bench   # noqa
from hero_int_w3 import solid_stair   # noqa
from hero_wave1 import origin_for, sidewalk   # noqa
from hero_wave2 import Loc   # noqa
import hero_wave5 as W5
from hero_wave5 import BUILDERS, ORIGINS, edges_of, cannon, BRICK5, BRICK5_D, GRAN5, GRAN5_D, IRON, WOOD5   # noqa


def seg_col(g, A, B, th, y0, y1, out=0.0):
    """collider box along world segment A->B (thickness th, centre pushed `out` along the left normal)"""
    L = v2len(v2sub(B, A))
    if L < 0.2: return
    t = v2norm(v2sub(B, A)); n = (-t[1], t[0])
    m = v2add(v2lerp(A, B, 0.5), v2mul(n, out))
    g.cols.append({'x': round(m[0], 2), 'z': round(m[1], 2), 'hx': round(L / 2, 2), 'hz': round(th / 2, 2), 'yaw': round(math.atan2(-t[1], t[0]), 4),
                   'yMin': round(y0, 2), 'yMax': round(y1, 2)})


def seg_room(g, name, A, B, d0, d1, y0, y1):
    """room box along world segment A->B spanning left-normal offsets d0..d1"""
    L = v2len(v2sub(B, A)); t = v2norm(v2sub(B, A)); n = (-t[1], t[0])
    m = v2add(v2lerp(A, B, 0.5), v2mul(n, (d0 + d1) / 2))
    g.rooms.append({'name': name, 'x': round(m[0], 2), 'z': round(m[1], 2), 'hx': round(L / 2, 2), 'hz': round(abs(d1 - d0) / 2, 2),
                    'yaw': round(math.atan2(-t[1], t[0]), 4), 'y0': round(y0, 2), 'y1': round(y1, 2)})


def vault_cell(g, F, u0, u1, d, y0, spring, col, slot='brickred', n=10, back=True):
    """barrel-vaulted cell behind a wall frame F: u0..u1 wide, running from w = 0 to w = -d, springing at y0 + spring"""
    r = (u1 - u0) / 2; uc = (u0 + u1) / 2; ys = y0 + spring
    P = lambda u, y, w: Geo.fp(F, u, y, w)
    N = (F[2][0], 0, F[2][1])
    g.quad_sub(slot, P(u0, y0, 0), P(u1, y0, 0), P(u1, y0, -d), P(u0, y0, -d), shade(col, 0.8), (0, 1, 0))
    for s, uu in ((1, u0), (-1, u1)):
        g.quad_sub(slot, P(uu, y0, 0), P(uu, y0, -d), P(uu, ys, -d), P(uu, ys, 0), col, (F[1][0] * s, 0, F[1][1] * s))
    for k in range(n):
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
        p0 = (uc + math.cos(a0) * r, ys + math.sin(a0) * r); p1 = (uc + math.cos(a1) * r, ys + math.sin(a1) * r)
        am = (a0 + a1) / 2
        g.quad_sub(slot, P(p0[0], p0[1], 0), P(p1[0], p1[1], 0), P(p1[0], p1[1], -d), P(p0[0], p0[1], -d), col,
                   (-F[1][0] * math.cos(am), -math.sin(am), -F[1][1] * math.cos(am)))
    if back:
        prof = [(u0, y0), (u1, y0)] + [(uc + math.cos(math.pi * k / n) * r, ys + math.sin(math.pi * k / n) * r) for k in range(n + 1)]
        g.poly(slot, [P(u, y, -d) for u, y in prof], col, N)


# ================================================================================== Fort Point: the courtyard
def fort_int(O):
    L, outer, court, yG, ys = W5.fp_geom()
    y0, y1, y2, y3 = ys
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Fort Point - Courtyard'; g.sky_k = 2.6
    g.floor_y = y0
    CE = edges_of(court); cgi = W5.fp_gorge(CE, L)
    OE = edges_of(outer); ogi = W5.fp_gorge(OE, L)
    # court floor (worn granite pavers) + drain gutter
    loc = [L.loc(*p) for p in court]
    a0, a1 = min(p[0] for p in loc), max(p[0] for p in loc); b0, b1 = min(p[1] for p in loc), max(p[1] for p in loc)
    g.poly('concrete', [(p[0], y0, p[1]) for p in court], C('#b8ae9f'), (0, 1, 0))
    for a, b in CE:
        n = edge_n(a, b)
        A, B = v2add(a, v2mul(n, -0.9)), v2add(b, v2mul(n, -0.9))
        g.poly('granite', [(A[0], y0 + 0.01, A[1]), (B[0], y0 + 0.01, B[1]), (b[0], y0 + 0.01, b[1]), (a[0], y0 + 0.01, a[1])], C('#8f887c'), (0, 1, 0))
    g.room('courtyard', a0, a1, b0, b1, y0, y3 + 0.5, floor=False)
    g.decks.append({'pts': [[round(L.xz(a0 + 2, (b0 + b1) / 2)[0], 2), round(L.xz(a0 + 2, (b0 + b1) / 2)[1], 2), round(y0, 3)],
                            [round(L.xz(a1 - 2, (b0 + b1) / 2)[0], 2), round(L.xz(a1 - 2, (b0 + b1) / 2)[1], 2), round(y0, 3)]],
                    'width': round(b1 - b0, 2), 'tunnel': False})
    D = 5.2                       # casemate depth behind the court face
    for i, (a, b) in enumerate(CE):
        Fi = Geo.frame(b, a); Le = v2len(v2sub(b, a)); Nn = (Fi[2][0], 0, Fi[2][1])       # faces into the court; w < 0 = casemates
        if i == cgi:
            # ---------------- barracks: 4 floors, doors + windows, iron galleries, the sally port in the middle
            um = Le / 2; FP_D = W5.FP_COURT - 0.6
            nb = max(2, int(Le / 3.5)); bw = Le / nb
            skip = [j for j in range(nb) if j * bw < um + 1.9 and (j + 1) * bw > um - 1.9]
            su0, su1 = min(skip) * bw, (max(skip) + 1) * bw
            for k in range(4):
                yk = y0 + k * 3.3
                for j in range(nb):
                    uc = (j + 0.5) * bw
                    if j in skip and k < 2: continue
                    door = k == 0 and j % 3 == 1
                    hole = opening_poly(uc, 1.2 if door else 1.05, yk + (0.02 if door else 0.95), yk + 2.55, 2, 8)
                    radial_panel(g, 'brickred', Fi, j * bw, (j + 1) * bw, yk, yk + 3.3, hole, BRICK5)
                    recess(g, Fi, hole, 0.35, 'brickred', BRICK5_D, 'wood' if door else 'glassI', C('#5b3a26') if door else (0.55, 0.6, 0.62, 1.0))
                    if not door: g.fbox('granite', Fi, uc - 0.62, uc + 0.62, yk + 0.85, yk + 0.95, 0, 0.08, GRAN5, top=True, bottom=True)
                if k:
                    g.fbox('metal', Fi, 0.4, Le - 0.4, yk - 0.14, yk + 0.02, 0, 1.6, IRON, top=True, bottom=True)
                    g.fbox('metal', Fi, 0.4, Le - 0.4, yk + 1.02, yk + 1.08, 1.55, 1.6, IRON, top=True, bottom=True)
                    for q in range(int((Le - 0.8) / 1.2) + 1):
                        g.fbox('metal', Fi, 0.4 + q * 1.2, 0.44 + q * 1.2, yk + 0.02, yk + 1.02, 1.55, 1.6, IRON, top=False)
                    for q in range(int((Le - 0.8) / 4.2) + 1):
                        g.fbox('metal', Fi, 0.4 + q * 4.2, 0.5 + q * 4.2, yk - 3.3, yk - 0.14, 1.45, 1.55, IRON, top=False)
            # sally port: vaulted passage through the barracks to the gate
            radial_panel(g, 'brickred', Fi, su0, su1, y0 + 4.9, y0 + 6.6, None, BRICK5)
            hole = opening_poly(um, 3.2, y0, y0 + 4.6, 1, 12)
            radial_panel(g, 'granite', Fi, su0, su1, y0, y0 + 4.9, hole, GRAN5)
            vault_cell(g, Fi, um - 1.6, um + 1.6, FP_D, y0, 3.0, BRICK5, back=False)
            back = [(um - 1.6, y0), (um + 1.6, y0)] + [(um + math.cos(math.pi * k / 10) * 1.6, y0 + 3.0 + math.sin(math.pi * k / 10) * 1.6) for k in range(11)]
            g.poly('wood', [Geo.fp(Fi, u, y, -FP_D) for u, y in back], C('#4a3322'), Nn)
            for s in (-1, 1):   # the heavy gate leaves, closed, iron studs
                g.fbox('wood', Fi, um - 1.55 if s < 0 else um + 0.02, um - 0.02 if s < 0 else um + 1.55, y0, y0 + 3.9, -FP_D + 0.02, -FP_D + 0.14, C('#553a27'), top=True)
            g.light('POINT', um, y0 + 3.4, -FP_D / 2, 60, (1.0, 0.82, 0.6), radius=0.2)
            pc = Geo.fp(Fi, um, y0 + 3.9, -FP_D / 2)
            g.lathe('lampI', pc[0], pc[2], [(0.0, y0 + 3.75), (0.18, y0 + 3.85), (0.0, y0 + 4.05)], (1.0, 0.85, 0.6, 1.0), n=8)
            A_, B_ = Geo.fp(Fi, um - 1.6, 0, 0), Geo.fp(Fi, um + 1.6, 0, 0)
            seg_room(g, 'sally port', (B_[0], B_[2]), (A_[0], A_[2]), 0.0, FP_D, y0, y0 + 4.6)
            for s in (-1, 1):
                p0 = Geo.fp(Fi, um + s * 1.6, 0, 0); p1 = Geo.fp(Fi, um + s * 1.6, 0, -FP_D)
                seg_col(g, (p0[0], p0[2]), (p1[0], p1[2]), 0.5, y0 - 1, y0 + 4.6, out=0)
            continue
        # ---------------- seaward casemates: ground tier walk-in vaulted gun rooms, tiers 2-3 arches with shallow cells
        nb = max(1, int(Le / 4.9)); bw = Le / nb; pier = 1.3
        for k, (ya_, yb_) in enumerate(((y0, y1), (y1, y2), (y2, y3))):
            for j in range(nb):
                u0_, u1_ = j * bw, (j + 1) * bw; uc = (u0_ + u1_) / 2; w = bw - pier
                spring = 2.2 if k == 0 else 1.8
                hole = opening_poly(uc, w, ya_ + (0.0 if k == 0 else 0.9), ya_ + spring + w / 2 + (0.0 if k == 0 else 0.9), 1, 12)
                radial_panel(g, 'brickred', Fi, u0_, u1_, ya_, yb_, hole, BRICK5)
                depth = D if k == 0 else 1.6
                yb0 = ya_ + (0.0 if k == 0 else 0.9)
                vault_cell(g, Fi, uc - w / 2, uc + w / 2, depth, yb0, spring, BRICK5)
                if k == 0:
                    # embrasure in the back wall: a slit of daylight + a gun on its carriage
                    g.fbox('sky', Fi, uc - 0.35, uc + 0.35, yb0 + 1.3, yb0 + 2.2, -depth + 0.01, -depth + 0.02, (0.62, 0.68, 0.76, 1.0), top=False)
                    g.fbox('granite', Fi, uc - 0.55, uc + 0.55, yb0 + 1.15, yb0 + 1.3, -depth + 0.02, -depth + 0.3, GRAN5, top=True)
                    if j % 2 == 0:
                        p = Geo.fp(Fi, uc, 0, -depth + 2.4); tdir = (-Fi[2][0], -Fi[2][1])
                        cannon(g, p[0], p[2], yb0, tdir)
                        g.cols.append({'x': round(p[0], 2), 'z': round(p[2], 2), 'hx': 1.0, 'hz': 0.8, 'yaw': round(math.atan2(-tdir[1], tdir[0]), 4), 'yMin': yb0 - 1, 'yMax': yb0 + 1.4})
                    # piers between cells (colliders) + back wall
                    for uu in (u0_, u1_):
                        p0 = Geo.fp(Fi, uu, 0, 0); p1 = Geo.fp(Fi, uu, 0, -depth)
                        seg_col(g, (p0[0], p0[2]), (p1[0], p1[2]), pier, ya_ - 1, yb_)
                g.fbox('granite', Fi, u0_, u1_, yb_ - 0.28, yb_, 0, 0.12, GRAN5, top=True, bottom=True)
                if k > 0:
                    g.fbox('metal', Fi, uc - w / 2, uc + w / 2, yb0 + 1.0, yb0 + 1.05, -0.05, 0.0, IRON, top=True)
        pb0 = Geo.fp(Fi, 0, 0, -D); pb1 = Geo.fp(Fi, Le, 0, -D)
        seg_col(g, (pb0[0], pb0[2]), (pb1[0], pb1[2]), 0.8, y0 - 1, y1, out=0)
        seg_room(g, 'casemates %d' % i, b, a, 0.0, D, y0, y1)
    # court parapet + terrace edge, stair tower doors in the gorge corners
    for a, b in CE:
        Fi = Geo.frame(b, a); Le = v2len(v2sub(b, a))
        g.fbox('brickred', Fi, 0, Le, y3, y3 + 1.0, -0.45, 0.0, BRICK5_D, top=True, back=True)
        g.fbox('granite', Fi, -0.1, Le + 0.1, y3 + 1.0, y3 + 1.18, -0.55, 0.1, GRAN5, top=True, bottom=True)
    # displays: two big Rodman guns on the court floor, information boards, benches
    cc = centroid(court)
    tdir = L.d(0, -1); tdir = (tdir[0], tdir[2])
    for s in (-1, 1):
        p = L.xz(s * 6.0, (b0 + b1) / 2 - 2.0)
        cannon(g, p[0], p[1], y0, tdir, L=4.6, r=0.42)
        g.cols.append({'x': round(p[0], 2), 'z': round(p[1], 2), 'hx': 1.5, 'hz': 1.0, 'yaw': round(math.atan2(-tdir[1], tdir[0]), 4), 'yMin': y0 - 1, 'yMax': y0 + 1.6})
    for k, s in enumerate((-1, 1)):
        p = L.xz(s * 11.0, b1 - 4.5)
        Fb = (p, L.u, L.v)
        g.fbox('wood', Fb, -0.9, 0.9, y0, y0 + 1.1, -0.05, 0.05, WOOD5, top=True, back=True)
        g.fbox('wood', Fb, -1.0, 1.0, y0 + 1.1, y0 + 2.2, -0.08, 0.02, C('#3d2a1c'), top=True, back=True)
        g.fbox('plaster', Fb, -0.85, 0.85, y0 + 1.2, y0 + 2.1, 0.02, 0.03, C('#e9e0c8'), top=False)
    for s in (-1, 1):
        p = L.xz(s * 13.0, (b0 + b1) / 2 + 4.0)
        Fb = (v2sub(p, v2mul(L.u, 1.0)), L.u, L.v)
        g.fbox('wood', Fb, 0, 2.0, y0 + 0.42, y0 + 0.5, -0.25, 0.25, WOOD5, top=True, back=True)
        for e in (0.15, 1.75): g.fbox('granite', Fb, e, e + 0.12, y0, y0 + 0.42, -0.2, 0.2, GRAN5_D, top=True, back=True)
    # flagpole + the lighthouse seen over the parapet come from the exterior; sky + sun for the bake
    g.poly('bakesky', [(p[0], y3 + 8.0, p[1]) for p in ring_offset(court, 2.0)], (1, 1, 1, 1), (0, -1, 0))
    g.lights.append(('SUN', (cc[0], y3 + 30.0, cc[1]), 3.2, (1.0, 0.95, 0.85), 0.02, None, (math.radians(38), 0.0, math.radians(215))))
    # the door: outside the sally port gate <-> just inside the court
    ga, gb = OE[ogi]; gm = v2lerp(ga, gb, 0.5); gn = edge_n(ga, gb)
    po = v2add(gm, v2mul(gn, 2.2))
    ca, cb = CE[cgi]; cm = v2lerp(ca, cb, 0.5); cn = edge_n(ca, cb)
    pin = v2add(cm, v2mul(cn, -2.5))
    g.doors.append({'label': 'Fort Point', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(-gn[0], -gn[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-cn[0], -cn[1]), 3)]})
    g.extra = {'hideExt': True, 'showR': 0}
    return g


# ================================================================================== Alcatraz: the cellhouse, Broadway
def alcatraz_int(O):
    L = W5.alc_frame(); yF = W5.alc_cell_y()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Alcatraz - Broadway'; g.sky_k = 4.6
    g.floor_y = yF
    A0, A1, AT = -24.0, 27.0, 33.0          # Broadway runs a = A0..A1, Times Square A1..AT
    BW, CD, BK, SC = 2.3, 2.74, 8.9, 13.5    # half corridor, cell depth, block outer face, side corridor outer wall
    yC = yF + 12.5
    CELLW = 1.52; TIER = 2.75; CH = 2.35
    PAINT = C('#d9d6c4'); PAINT2 = C('#b9c3b0'); BARS = C('#c8c1a8'); FLOOR = C('#9d9b94'); CEIL = C('#e4e1d6')
    # floors, rooms, ceiling with skylight wells over the three corridors
    g.quad_sub('concrete', g.P(A0 - 4, yF, -BW), g.P(A1, yF, -BW), g.P(A1, yF, BW), g.P(A0 - 4, yF, BW), FLOOR, (0, 1, 0))
    g.quad_sub('concrete', g.P(A1 - 1.2, yF, -SC), g.P(AT, yF, -SC), g.P(AT, yF, SC), g.P(A1 - 1.2, yF, SC), FLOOR, (0, 1, 0))
    for s in (-1, 1):
        g.quad_sub('concrete', g.P(19, yF, s * BK), g.P(A1, yF, s * BK), g.P(A1, yF, s * SC), g.P(19, yF, s * SC), FLOOR, (0, 1, 0))
    g.room('broadway', A0 - 4, A1, -BW, BW, yF, yC)
    g.room('times square', A1, AT, -SC, SC, yF, yC)
    for s in (-1, 1):
        g.room('side corridor', 19, A1, min(s * BK, s * SC), max(s * BK, s * SC), yF, yC)
    for (b0, b1) in ((-SC, -BK - 0.2), (-BK + 0.2, -BW - 0.2), (BW + 0.2, BK - 0.2), (BK + 0.2, SC)):
        g.quad_sub('plaster', g.P(A0 - 4, yC, b0), g.P(AT, yC, b0), g.P(AT, yC, b1), g.P(A0 - 4, yC, b1), CEIL, (0, -1, 0))
    for (b0, b1) in ((-BK - 0.2, -BK + 0.2), (-BW - 0.2, BW + 0.2), (BK - 0.2, BK + 0.2)):
        for k in range(9):
            a0 = A0 - 4 + k * 6.3; a1 = min(AT, a0 + 6.3)
            g.quad_sub('plaster', g.P(a0, yC, b0), g.P(min(a1, a0 + 1.4), yC, b0), g.P(min(a1, a0 + 1.4), yC, b1), g.P(a0, yC, b1), CEIL, (0, -1, 0))
            if a1 - a0 < 1.5: continue
            for s_, bb in ((1, b0), (-1, b1)):     # well sides
                g.poly('plaster', [g.P(a0 + 1.4, yC, bb), g.P(a1, yC, bb), g.P(a1, yC + 1.2, bb), g.P(a0 + 1.4, yC + 1.2, bb)], CEIL, (g.F[2][0] * s_, 0, g.F[2][1] * s_))
            for aa, s_ in ((a0 + 1.4, 1), (a1, -1)):
                g.poly('plaster', [g.P(aa, yC, b0), g.P(aa, yC, b1), g.P(aa, yC + 1.2, b1), g.P(aa, yC + 1.2, b0)], CEIL, (g.F[1][0] * s_, 0, g.F[1][1] * s_))
            g.poly('sky', [g.P(a0 + 1.4, yC + 1.2, b0), g.P(a1, yC + 1.2, b0), g.P(a1, yC + 1.2, b1), g.P(a0 + 1.4, yC + 1.2, b1)], (0.62, 0.68, 0.74, 1.0), (0, -1, 0))
            g.poly('bakesky', [g.P(a0 + 1.4, yC + 1.3, b0 - 1), g.P(a1, yC + 1.3, b0 - 1), g.P(a1, yC + 1.3, b1 + 1), g.P(a0 + 1.4, yC + 1.3, b1 + 1)], (1, 1, 1, 1), (0, -1, 0))
    # outer walls of Times Square + the side corridors (pale green dado, cream above), the SE door + the clock
    g.shell(A1, AT, -SC, SC, yF, yC, None, None, 'plaster', PAINT, None, None, walls=(True, False, True, False), ceiling=False)
    g.panel_u('plaster', -SC, SC, yF, yC, AT, PAINT, -1)
    g.lbox('plaster', AT - 0.02, AT, yF, yF + 1.4, -SC, SC, PAINT2, top=False)
    for s in (-1, 1):
        g.lbox('plaster', 19, A1, yF, yC, s * SC, s * (SC + 0.3), PAINT, top=False)
        g.lbox('plaster', 19, A1, yF, yF + 1.4, s * (SC - 0.02), s * SC, PAINT2, top=False)
        g.collider(19, A1, min(s * SC, s * (SC + 0.4)), max(s * SC, s * (SC + 0.4)), yF - 1, yC)
    g.collider(AT, AT + 0.5, -SC, SC, yF - 1, yC)
    g.lbox('metal', AT - 0.1, AT - 0.02, yF, yF + 2.8, -1.3, 1.3, C('#4a4b47'), top=False)
    g.lbox('plaster', AT - 0.15, AT - 0.02, yF + 2.8, yF + 3.1, -1.5, 1.5, PAINT, top=True, bottom=True)
    Fk = (g.xz(AT - 0.2, -1.0), L.v, (-L.u[0], -L.u[1]))
    g.fbox('paint', Fk, 0.4, 1.6, yF + 3.6, yF + 4.8, 0, 0.12, C('#2b2a27'), top=True, bottom=True)
    g.fbox('paint', Fk, 0.5, 1.5, yF + 3.7, yF + 4.7, 0.12, 0.14, C('#f1efe6'), top=False)
    g.fbox('paint', Fk, 0.98, 1.02, yF + 4.2, yF + 4.6, 0.14, 0.16, C('#1c1c1c'), top=False)
    g.fbox('paint', Fk, 1.0, 1.3, yF + 4.18, yF + 4.22, 0.14, 0.16, C('#1c1c1c'), top=False)
    # the NW end: gun gallery cage over the door to the dining hall
    g.panel_u('plaster', -BW, BW, yF, yC, A0 - 4, PAINT, 1)
    g.collider(A0 - 4.5, A0 - 4, -BW, BW, yF - 1, yC)
    g.lbox('wood', A0 - 3.98, A0 - 3.9, yF, yF + 2.6, -0.9, 0.9, C('#5a4632'), top=False)
    g.lbox('metal', A0 - 4, A0 - 2.6, yF + 4.2, yF + 4.35, -BW, BW, IRON, top=True, bottom=True)
    for k in range(int(2 * BW / 0.25)):
        b = -BW + k * 0.25
        g.lbox('metal', A0 - 2.64, A0 - 2.6, yF + 4.35, yF + 7.6, b, b + 0.04, IRON, top=False)
    g.lbox('metal', A0 - 4, A0 - 2.6, yF + 7.6, yF + 7.7, -BW, BW, IRON, top=True, bottom=True)
    # the two cell blocks facing Broadway (B at b < 0, C at b > 0): three tiers of barred cells + catwalks
    ncell = int((A1 - A0) / CELLW); A1c = A0 + ncell * CELLW
    for s in (-1, 1):
        f = lambda b: s * b
        for k in range(3):
            y0 = yF + k * TIER; y1 = y0 + CH
            g.quad_sub('concrete', g.P(A0, y0 + 0.01, f(BW)), g.P(A1c, y0 + 0.01, f(BW)), g.P(A1c, y0 + 0.01, f(BW + CD)), g.P(A0, y0 + 0.01, f(BW + CD)), C('#8f8d86'), (0, 1, 0))
            g.quad_sub('plaster', g.P(A0, y1, f(BW)), g.P(A1c, y1, f(BW)), g.P(A1c, y1, f(BW + CD)), g.P(A0, y1, f(BW + CD)), CEIL, (0, -1, 0))
            g.panel_in('plaster', A0, A1c, y0, y1, f(BW + CD), PAINT, -s)
            g.lbox('concrete', A0, A1c, y1, y0 + TIER, f(BW - 0.02), f(BW + 0.25), PAINT, top=(k == 2), bottom=True)
            for i in range(ncell + 1):
                a = A0 + i * CELLW
                g.lbox('plaster', a - 0.06, a + 0.06, y0, y1, f(BW), f(BW + CD), PAINT, top=False)
            for i in range(ncell):
                a = A0 + i * CELLW
                for q in range(9):   # bars + bands
                    bb = a + 0.16 + q * 0.15
                    g.lbox('metal', bb - 0.018, bb + 0.018, y0, y1, f(BW - 0.02), f(BW + 0.02), BARS, top=False)
                for yy in (y0 + 0.08, y0 + 1.25, y1 - 0.12):
                    g.lbox('metal', a + 0.06, a + CELLW - 0.06, yy - 0.04, yy + 0.04, f(BW - 0.03), f(BW + 0.03), BARS, top=True, bottom=True)
                # bunk against one partition, toilet + sink at the back, a shelf
                g.lbox('metal', a + 0.08, a + 0.82, y0 + 0.42, y0 + 0.5, f(BW + 0.35), f(BW + CD - 0.05), C('#6f6e68'), top=True, bottom=True)
                g.lbox('fabric', a + 0.1, a + 0.8, y0 + 0.5, y0 + 0.62, f(BW + 0.4), f(BW + CD - 0.1), C('#5b6451') if (i + k) % 3 else C('#7a6a55'), top=True)
                g.lbox('tiles', a + CELLW - 0.55, a + CELLW - 0.15, y0, y0 + 0.42, f(BW + CD - 0.5), f(BW + CD), C('#e8e6e0'), top=True)
                g.lbox('tiles', a + CELLW - 0.6, a + CELLW - 0.12, y0 + 0.8, y0 + 0.98, f(BW + CD - 0.42), f(BW + CD), C('#e8e6e0'), top=True, bottom=True)
                g.lbox('wood', a + CELLW - 0.7, a + CELLW - 0.08, y0 + 1.55, y0 + 1.6, f(BW + CD - 0.3), f(BW + CD), C('#7d6547'), top=True, bottom=True)
                # what the inmates left: folded blanket + pillow, books and a tin cup on the shelf, shoes, paper on the floor,
                # a towel on the sink, a peg with a shirt; every few cells a chessboard on the bunk or a stack of magazines
                Rc = random.Random(i * 31 + k * 7 + (s > 0) * 977)
                g.lbox('d_fabric', a + 0.12, a + 0.78, y0 + 0.62, y0 + 0.7, f(BW + CD - 0.55), f(BW + CD - 0.12), C('#4a5242'), top=True)
                g.lbox('d_fabric', a + 0.15, a + 0.75, y0 + 0.62, y0 + 0.72, f(BW + 0.45), f(BW + 0.8), C('#d9d4c4'), top=True)
                for q in range(Rc.randint(1, 4)):
                    g.lbox('d_paint', a + CELLW - 0.66 + q * 0.07, a + CELLW - 0.61 + q * 0.07, y0 + 1.6, y0 + 1.78 + Rc.random() * 0.05, f(BW + CD - 0.26), f(BW + CD - 0.06),
                           [C('#6b2a22'), C('#2e3a52'), C('#5a4a32'), C('#3a4a2e')][q % 4])
                cx, cz = g.xz(a + CELLW - 0.25, f(BW + CD - 0.15)); g.lathe('d_metal', cx, cz, [(0.035, y0 + 1.6), (0.04, y0 + 1.7), (0.0, y0 + 1.7)], C('#9a958a'), n=6)
                if Rc.random() < 0.7:
                    for sh in (0, 0.14): g.lbox('d_paint', a + 0.3 + sh, a + 0.4 + sh, y0, y0 + 0.08, f(BW + 0.5), f(BW + 0.78), C('#2a2420'), top=True)
                for q in range(Rc.randint(0, 3)):
                    pu, pw = a + 0.3 + Rc.random() * (CELLW - 0.6), BW + 0.4 + Rc.random() * (CD - 0.8)
                    x0_, z0_ = g.xz(pu, f(pw)); ang = Rc.random() * math.pi
                    g.poly('d_paint', [(x0_ + math.cos(ang) * 0.12, y0 + 0.012, z0_ + math.sin(ang) * 0.12), (x0_ + math.cos(ang + 1.6) * 0.09, y0 + 0.012, z0_ + math.sin(ang + 1.6) * 0.09),
                                       (x0_ - math.cos(ang) * 0.12, y0 + 0.012, z0_ - math.sin(ang) * 0.12), (x0_ - math.cos(ang + 1.6) * 0.09, y0 + 0.012, z0_ - math.sin(ang + 1.6) * 0.09)], C('#e2dccb'), (0, 1, 0))
                g.lbox('d_fabric', a + CELLW - 0.58, a + CELLW - 0.54, y0 + 0.62, y0 + 0.95, f(BW + CD - 0.45), f(BW + CD - 0.12), C('#e8e4d8'), top=True)
                if Rc.random() < 0.5: g.lbox('d_fabric', a + 0.45, a + 0.75, y0 + 1.25, y0 + 1.85, f(BW + CD - 0.06), f(BW + CD - 0.02), C('#7c8a9a'), top=True)
                if Rc.random() < 0.12:
                    cx, cz = g.xz(a + 0.45, f(BW + 1.6)); g.box('d_paint', cx - 0.18, cx + 0.18, y0 + 0.62, y0 + 0.64, cz - 0.18, cz + 0.18, C('#d8c9a8'))
            for i in range(ncell):   # every cell has its bare ceiling bulb (warm, low): the cells read as rooms, the corridor keeps its gloom
                cu, cw_ = A0 + (i + 0.5) * CELLW, f(BW + CD * 0.62)
                g.llathe('metal', cu, cw_, [(0.05, y1), (0.05, y1 - 0.06), (0.0, y1 - 0.06)], C('#3a3a36'), n=6)
                g.llathe('lampI', cu, cw_, [(0.0, y1 - 0.06), (0.035, y1 - 0.08), (0.03, y1 - 0.12), (0.0, y1 - 0.13)], (1.0, 0.82, 0.55, 1.0), n=8)
                lit = (i * 7 + k * 3 + (s > 0)) % 5 != 0          # a few bulbs out
                if lit: g.light('POINT', cu, y1 - 0.2, cw_, 26 if (i + k) % 3 else 18, (1.0, 0.8, 0.55), radius=0.05)
            if k:   # catwalk + railing (tiers 2 and 3)
                g.lbox('metal', A0 - 0.2, A1c + 0.2, y0 - 0.14, y0 + 0.01, f(BW - 1.05), f(BW), C('#7c7b74'), top=True, bottom=True)
                rail(g, [(A0 - 0.2, f(BW - 1.0)), (A1c + 0.2, f(BW - 1.0))], y0, 1.05, col=C('#c9c2aa'), post=1.52)
                for i in range(0, ncell + 1, 2):
                    a = A0 + i * CELLW
                    g.lbox('metal', a - 0.04, a + 0.04, y0 - 0.5, y0 - 0.14, f(BW - 1.0), f(BW), C('#7c7b74'), top=False)
        # block top + ends (letters B / C), the outer faces toward the side corridors
        yT = yF + 3 * TIER
        g.lbox('concrete', A0, A1c, yT - 0.4, yT, f(BW), f(BK), PAINT, top=True, bottom=False)
        g.lbox('plaster', A0 - 0.25, A0, yF, yT, f(BW), f(BK), PAINT, top=False)
        g.lbox('plaster', A1c, A1c + 0.25, yF, yT, f(BW), f(BK), PAINT, top=False)
        g.lbox('plaster', 19, A1c, yF, yT, f(BK - 0.05), f(BK), PAINT, top=False)
        g.lbox('plaster', 19, A1c, yF, yF + 1.4, f(BK), f(BK + 0.02), PAINT2, top=False)
        Fe = (g.xz(A1c + 0.27, f(BW + 2.2) + 1.0), (-L.v[0], -L.v[1]), (L.u[0], L.u[1]))
        g.text('paint', Fe, 1.0, yF + 5.5, 0.0, 'C' if s > 0 else 'B', 1.4, C('#2b2a27'), depth=0.04)
        g.collider(A0, A1c, min(f(BW - 0.05), f(BK)), max(f(BW - 0.05), f(BK)), yF - 1, yT)
        for q in range(int((SC - BK) / 0.15)):   # side corridor gates at a = 19
            bb = BK + q * 0.15
            g.lbox('metal', 18.98, 19.02, yF, yF + 3.2, f(bb) - 0.02, f(bb) + 0.02, BARS, top=False)
        g.lbox('metal', 18.95, 19.05, yF + 3.2, yF + 3.3, f(BK), f(SC), BARS, top=True, bottom=True)
        g.collider(18.8, 19.2, min(f(BK), f(SC)), max(f(BK), f(SC)), yF - 1, yF + 3.3)
        g.lbox('plaster', 18.7, 19.0, yF + 3.3, yC, f(BK), f(SC), PAINT, top=False, bottom=True)
    # Broadway sign on a beam over the corridor mouth, hanging lamps (warm)
    g.lbox('metal', A1c + 0.3, A1c + 0.5, yF + 8.8, yF + 9.0, -BW, BW, IRON, top=True, bottom=True)
    Fs = (g.xz(A1c + 0.52, 1.6), (-L.v[0], -L.v[1]), (L.u[0], L.u[1]))
    g.fbox('paint', Fs, 0, 3.2, yF + 8.15, yF + 8.8, 0, 0.04, C('#1f2a22'), top=True, bottom=True)
    g.text('paint', Fs, 1.6, yF + 8.3, 0.05, 'BROADWAY', 0.4, C('#efe9d8'), depth=0.02)
    for k in range(9):
        a = A0 + 2.0 + k * (A1 - A0 - 4.0) / 8
        g.lbox('metal', a - 0.02, a + 0.02, yF + 9.6, yC, -0.02, 0.02, IRON, top=False)
        g.llathe('metal', a, 0, [(0.05, yF + 9.6), (0.42, yF + 9.25), (0.44, yF + 9.2)], C('#3f4a44'), n=12)
        g.llathe('lampI', a, 0, [(0.3, yF + 9.24), (0.0, yF + 9.2)], (1.0, 0.85, 0.62, 1.0), n=10)
        g.light('POINT', a, yF + 9.0, 0, 220, (1.0, 0.84, 0.62), radius=0.3)
    for b in (-8.0, 0.0, 8.0):
        g.light('POINT', (A1 + AT) / 2, yF + 9.0, b, 220, (1.0, 0.84, 0.62), radius=0.3)
        g.llathe('lampI', (A1 + AT) / 2, b, [(0.3, yF + 9.24), (0.0, yF + 9.2)], (1.0, 0.85, 0.62, 1.0), n=10)
    g.decks.append({'pts': [[round(g.xz(A0 - 3, 0)[0], 2), round(g.xz(A0 - 3, 0)[1], 2), round(yF, 3)], [round(g.xz(A1, 0)[0], 2), round(g.xz(A1, 0)[1], 2), round(yF, 3)]],
                    'width': round(2 * BW, 2), 'tunnel': True})
    g.decks.append({'pts': [[round(g.xz(A1 + 0.5, 0)[0], 2), round(g.xz(A1 + 0.5, 0)[1], 2), round(yF, 3)], [round(g.xz(AT - 0.5, 0)[0], 2), round(g.xz(AT - 0.5, 0)[1], 2), round(yF, 3)]],
                    'width': round(2 * SC, 2), 'tunnel': True})
    # door: the admin portico outside <-> Times Square
    ar = ring_out(ring_of(1432))
    ent = max(edges_of(ar), key=lambda e: L.loc(*v2lerp(e[0], e[1], 0.5))[0])
    em = v2lerp(ent[0], ent[1], 0.5); en = edge_n(ent[0], ent[1])
    po = v2add(em, v2mul(en, 3.0))
    pin = g.xz(AT - 2.0, 0.0)
    g.doors.append({'label': 'Alcatraz Cellhouse', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(-en[0], -en[1]), 3)],
                    'in': [round(pin[0], 2), round(yF, 2), round(pin[1], 2), round(face_yaw(-L.u[0], -L.u[1]), 3)]})
    return g


# ================================================================================== Pier 45: the penny-arcade museum hall
def cabinet(g, a, b, y, face, kind, seed):
    """one antique coin-op machine at (a, b) facing +w*face; kinds: 0 upright diorama, 1 glass-dome automaton, 2 mutoscope, 3 strength tester"""
    R = random.Random(seed)
    WOODS = [C('#6b4226'), C('#7a4a2a'), C('#5a3a24'), C('#4c2f1f')]
    PAN = [C('#8f2d2a'), C('#2d5a4a'), C('#b8892e'), C('#2c3f6b'), C('#6b2d5a')]
    wd = WOODS[R.randrange(4)]; pn = PAN[R.randrange(5)]
    s = face
    if kind == 0:
        g.lbox('wood', a - 0.45, a + 0.45, y, y + 1.0, b - 0.35, b + 0.35, wd)
        g.lbox('wood', a - 0.42, a + 0.42, y + 1.0, y + 1.75, b - 0.3, b + 0.3, wd)
        g.lbox('paint', a - 0.47, a + 0.47, y + 1.75, y + 1.95, b - 0.37, b + 0.37, pn)
        g.lbox('screen', a - 0.32, a + 0.32, y + 1.08, y + 1.62, b + s * 0.3, b + s * 0.31, (1.0, 0.82, 0.55, 1.0), top=False)
        g.lbox('gold', a - 0.3, a + 0.3, y + 0.7, y + 0.9, b + s * 0.35, b + s * 0.37, C('#b8923e'), top=True)
        g.lbox('paint', a - 0.38, a + 0.38, y + 0.2, y + 0.65, b + s * 0.35, b + s * 0.36, pn, top=False)
    elif kind == 1:
        g.lbox('wood', a - 0.55, a + 0.55, y, y + 0.9, b - 0.45, b + 0.45, wd)
        g.lbox('glassI', a - 0.5, a + 0.5, y + 0.9, y + 1.7, b - 0.4, b + 0.4, (0.7, 0.75, 0.75, 1.0))
        for k in range(3):
            fx = a - 0.25 + k * 0.25
            g.llathe('paint', fx, b, [(0.07, y + 0.9), (0.08, y + 1.15), (0.05, y + 1.3), (0.06, y + 1.36), (0.0, y + 1.42)], PAN[(seed + k) % 5], n=6)
        g.lbox('lampI', a - 0.3, a + 0.3, y + 1.66, y + 1.69, b - 0.2, b + 0.2, (1.0, 0.85, 0.6, 1.0), top=False, bottom=True)
        g.lbox('wood', a - 0.58, a + 0.58, y + 1.7, y + 1.8, b - 0.48, b + 0.48, wd)
    elif kind == 2:
        g.llathe('metal', a, b, [(0.28, y), (0.2, y + 0.15), (0.13, y + 0.2), (0.12, y + 1.0), (0.3, y + 1.05), (0.3, y + 1.45), (0.18, y + 1.55), (0.0, y + 1.6)], C('#3b3f3a'), n=10)
        g.lbox('screen', a - 0.1, a + 0.1, y + 1.2, y + 1.35, b + s * 0.29, b + s * 0.31, (1.0, 0.8, 0.5, 1.0), top=False)
        g.lbox('paint', a - 0.16, a + 0.16, y + 1.25, y + 1.4, b + s * 0.3, b + s * 0.45, C('#1d1d1d'))
    else:
        g.lbox('wood', a - 0.35, a + 0.35, y, y + 2.3, b - 0.3, b + 0.3, wd)
        g.lbox('screen', a - 0.22, a + 0.22, y + 1.4, y + 1.95, b + s * 0.3, b + s * 0.31, (1.0, 0.9, 0.7, 1.0), top=False)
        g.lbox('metal', a - 0.08, a + 0.08, y + 0.9, y + 1.1, b + s * 0.3, b + s * 0.55, C('#8c8c86'))
        g.lbox('paint', a - 0.37, a + 0.37, y + 2.3, y + 2.5, b - 0.32, b + 0.32, pn)


def musee_int(O):
    L = W5.p45_frame()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Musee des Machines'; g.sky_k = 2.0
    A0, A1, B0, B1 = 1.6, 54.0, -12.5, 12.5
    yg = max(H(*L.xz(a, b)) for a in (5, 25, 45) for b in (-10, 0, 10)) + 0.05
    y0 = yg + 0.15; yw = y0 + 5.2; yr = y0 + 8.2
    g.floor_y = y0
    FL = C('#8a6a48'); WALL = C('#e2d7bf'); WAIN = C('#5b3b25'); TR = C('#6d4c32')
    g.room('arcade', A0, A1, B0, B1, y0, yr)
    g.lbox('wood', A0, A1, y0 - 0.3, y0, B0, B1, FL, top=True)
    g.decks.extend(rect_decks_w(g, A0, A1, B0, B1, y0))
    g.shell(A0, A1, B0, B1, y0, yw, None, None, 'plaster', WALL, None, None, ceiling=False)
    for (u0, u1, w0, w1) in ((A0, A1, B0, B0 + 0.03), (A0, A1, B1 - 0.03, B1), (A0, A0 + 0.03, B0, B1), (A1 - 0.03, A1, B0, B1)):
        g.lbox('wood', u0, u1, y0, y0 + 1.1, w0, w1, WAIN, top=True)
    # gabled roof on king-post trusses, board ceiling, clerestory glass along the ridge sides
    for s in (-1, 1):
        bb = B1 if s > 0 else B0
        g.quad_sub('wood', g.P(A0, yw, bb), g.P(A1, yw, bb), g.P(A1, yr, 0), g.P(A0, yr, 0), C('#a88762'), (0, -1, 0))
    for aa, s in ((A0, 1), (A1, -1)):
        g.poly('plaster', [g.P(aa, yw, B0), g.P(aa, yw, B1), g.P(aa, yr, 0)], WALL, (g.F[1][0] * s, 0, g.F[1][1] * s))
    for k in range(int((A1 - A0) / 5.0) + 1):
        a = A0 + 1.0 + k * 5.0
        if a > A1 - 0.5: break
        g.lbox('wood', a - 0.12, a + 0.12, yw - 0.3, yw, B0, B1, TR)                          # tie beam
        g.lbox('wood', a - 0.1, a + 0.1, yw, yr - 0.2, -0.12, 0.12, TR)                        # king post
        for s in (-1, 1):
            p0, p1 = g.P(a, yw, s * B1 * 0.98), g.P(a, yr - 0.25, 0)
            g.rod('wood', p0, p1, 0.13, TR, n=4)
            g.rod('wood', g.P(a, yw, s * B1 * 0.45), g.P(a, yr - 1.2, s * 0.2), 0.08, TR, n=4)
        # string of bulbs along each truss + a warm lamp
        for q in range(9):
            bq = B0 + 1.2 + q * (B1 - B0 - 2.4) / 8
            g.llathe('lampI', a, bq, [(0.0, yw - 0.45), (0.06, yw - 0.38), (0.0, yw - 0.3)], (1.0, 0.8, 0.5, 1.0), n=6)
        g.light('POINT', a, yw - 0.6, 0, 230, (1.0, 0.78, 0.52), radius=0.4)
    for s in (-1, 1):   # clerestory: daylight panels high on the long walls
        bb = (B1 - 0.02) if s > 0 else (B0 + 0.02)
        for k in range(int((A1 - A0) / 5.0)):
            a = A0 + 2.5 + k * 5.0
            g.panel_in('sky', a - 1.6, a + 1.6, y0 + 3.3, y0 + 4.6, bb, (0.72, 0.78, 0.85, 1.0), -s)
    # rows of machines: two back-to-back centre islands, one row along each long wall
    rows = [(B0 + 0.9, 1), (-2.2, -1), (2.2, 1), (B1 - 0.9, -1)]
    seed = 0
    for bw_, face in rows:
        a = A0 + 4.5
        while a < A1 - 4.5:
            kind = (seed * 7 + int(bw_ * 3)) % 4
            if bw_ in (-2.2, 2.2) and seed % 9 == 4: kind = 1
            cabinet(g, a, bw_, y0, face, kind, seed)
            seed += 1
            a += 1.45 if kind != 1 else 1.7
        g.collider(A0 + 3.8, a - 0.5, bw_ - 0.5, bw_ + 0.5, y0 - 1, y0 + 2.4)
    # the laughing lady in her glass booth + the fortune teller, facing the entrance
    for (ac, bc, name, tall) in ((A1 - 2.2, -6.5, 'LAUGHING LIL', 2.6), (A1 - 2.2, 6.5, 'MADAME ZOLTARA', 2.3)):
        g.lbox('wood', ac - 0.9, ac + 0.9, y0, y0 + 0.6, bc - 1.2, bc + 1.2, C('#5a3a24'))
        g.lbox('glassI', ac - 0.85, ac + 0.85, y0 + 0.6, y0 + tall + 0.2, bc - 1.15, bc + 1.15, (0.7, 0.75, 0.75, 1.0))
        g.lbox('wood', ac - 0.95, ac + 0.95, y0 + tall + 0.2, y0 + tall + 0.6, bc - 1.25, bc + 1.25, C('#5a3a24'))
        g.llathe('fabric', ac, bc, [(0.55, y0 + 0.6), (0.5, y0 + 1.2), (0.35, y0 + 1.7), (0.42, y0 + 1.9), (0.0, y0 + 1.95)], C('#b3423a') if tall > 2.4 else C('#3f2f63'), n=12)
        g.llathe('plaster', ac, bc, [(0.0, y0 + 1.95), (0.2, y0 + 2.05), (0.19, y0 + 2.3), (0.0, y0 + 2.42)], C('#e7c4a2'), n=10)
        g.llathe('fabric', ac, bc, [(0.21, y0 + 2.3), (0.24, y0 + 2.4), (0.0, y0 + 2.55)], C('#d8b04a') if tall < 2.4 else C('#8a4a2c'), n=10)
        g.lbox('lampI', ac - 0.5, ac + 0.5, y0 + tall + 0.15, y0 + tall + 0.19, bc - 0.6, bc + 0.6, (1.0, 0.85, 0.6, 1.0), top=False, bottom=True)
        g.light('POINT', ac, y0 + tall, bc, 25, (1.0, 0.82, 0.6), radius=0.2)
        Fn = (g.xz(ac - 0.97, bc - 1.2), L.v, (-L.u[0], -L.u[1]))
        g.text('paint', Fn, 1.2, y0 + tall + 0.27, 0.0, name, 0.2, C('#f1d58a'), depth=0.02)
        g.collider(ac - 1.0, ac + 1.0, bc - 1.3, bc + 1.3, y0 - 1, y0 + tall + 0.6)
    # a hanging banner over the aisle
    Fb = (g.xz(A0 + 12.0, -3.2), L.v, (-L.u[0], -L.u[1]))
    g.fbox('fabric', Fb, 0, 6.4, yw - 1.9, yw - 0.9, -0.02, 0.02, C('#7a1f24'), top=False, back=True)
    g.text('paint', Fb, 3.2, yw - 1.7, 0.03, 'PENNY ARCADE', 0.5, C('#f1d58a'), depth=0.02)
    # door: the bulkhead entrance on the Embarcadero
    po = L.xz(-2.5, 0.0); pin = L.xz(A0 + 1.2, 0.0)
    g.doors.append({'label': 'Musee des Machines', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


def rect_decks_w(g, a0, a1, b0, b1, y, strip=8.0):
    out = []
    n = max(1, int(math.ceil((b1 - b0) / strip))); w = (b1 - b0) / n
    for i in range(n):
        b = b0 + (i + 0.5) * w
        A, B = g.xz(a0 + 0.3, b), g.xz(a1 - 0.3, b)
        out.append({'pts': [[round(A[0], 2), round(A[1], 2), round(y, 3)], [round(B[0], 2), round(B[1], 2), round(y, 3)]], 'width': round(w, 2), 'tunnel': True})
    return out


# ================================================================================== Pier 39: the two-level market street
P39_SHOPS = ['BAY KITE CO.', 'FOG CITY FUDGE', 'SOURDOUGH & CO.', 'SEA LION SWEETS', 'HARBOR HATS', 'PELICAN POTTERY', 'THE CRAB SHACK', 'WHARF CANDLES',
             'MARINA MAGNETS', 'CABLE CAR TOYS', 'BAY GLASSWORKS', 'SEASIDE SOCKS', 'ANCHOR ARCADE', 'GOLDEN HOUR PHOTO', 'SALTWATER TAFFY', 'THE CHOWDER POT',
             'FERRY TALE BOOKS', 'FOGHORN GIFTS', 'HOT SAUCE HARBOR', 'NAUTICAL NOOK', 'BAYSIDE BEADS', 'PIER POPCORN', 'CRYSTAL COVE', 'DRIFTWOOD DECOR',
             'KITE & COMPASS', "GULL'S GALLERY", 'THE MUSIC BOX', 'SEAGLASS JEWELRY', 'BRIDGE VIEW CAFE', 'SWEET TIDE CREAMERY', 'SAN FRAN SHIRTS', 'CURIOUS OTTER']


def p39_frame():
    """market street axis inside building 1895: a from the south entrance (a = 0) north, b across (+ = east)"""
    A = (842.0, -3738.0); B = (848.0, -3808.0)
    return Loc(A, v2norm(v2sub(B, A)))


def p39_int(O):
    from hero_int_w3 import sign_uv
    L = p39_frame()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Pier 39 - Market Street'; g.sky_k = 3.0
    g.extra = {'signs': 'pier39_int_signs.png'}
    A0, A1 = 2.0, 54.0
    SW, GW, SD = 3.5, 2.1, 4.4          # street half width, upper gallery width, shop depth
    yg = min(sidewalk(*L.xz(a, 0)) for a in (0, 20, 40)) + 0.05
    y0 = max(yg + 0.2, floor_over(g, A0, A1, -SW - SD, SW + SD, pad=0.1)); g.floor_y = y0
    y1 = y0 + 4.2; yt = y0 + 8.3; yr = yt + 2.6
    WOODF = C('#8d7153'); FAC = [C('#8b6f55'), C('#6f7f86'), C('#a0876a'), C('#7d6a5a'), C('#8e8a7a')]; TRIM = C('#e9e2d0')
    rng = random.Random(39)
    g.room('street', A0, A1, -SW - SD, SW + SD, y0, yr)
    # street floor (weathered boards), the upper galleries, the skylit gable over the street
    g.lbox('wood', A0, A1, y0 - 0.3, y0, -SW - SD, SW + SD, WOODF, top=True)
    for s in (-1, 1):
        f = lambda b: s * b
        spans = ((A0, A1),) if s > 0 else ((A0, 42.8), (51.2, A1))      # west gallery: opening over the stair
        for (ga0, ga1) in spans:
            g.lbox('wood', ga0, ga1, y1 - 0.3, y1, f(SW), f(SW + GW), WOODF, top=True, bottom=True)
        g.lbox('wood', A0, A1, y1 - 0.3, y1, f(SW + GW), f(SW + GW + SD), WOODF, top=False, bottom=True)
        if s < 0:
            g.panel_in('wood', 42.8, 51.2, y0, y1, f(SW + SD), C('#7d6a5a'), -s)
            g.collider(42.8, 51.2, min(f(SW + SD), f(SW + SD + 0.4)), max(f(SW + SD), f(SW + SD + 0.4)), y0 - 1, y1)
        rail(g, [(A0, f(SW + 0.08)), (A1, f(SW + 0.08))], y1, 1.05, col=C('#f0ebe0'), post=1.3)
        for a in range(int(A0) + 2, int(A1), 5):
            g.lbox('wood', a - 0.12, a + 0.12, y0, y1 - 0.3, f(SW + 0.05), f(SW + 0.29), TRIM, collide=True)
        for (ga0, ga1) in spans:
            P0, P1 = L.xz(ga0 + 0.5, f(SW + GW / 2 + 0.1)), L.xz(ga1 - 0.5, f(SW + GW / 2 + 0.1))
            g.decks.append({'pts': [[round(P0[0], 2), round(P0[1], 2), round(y1, 3)], [round(P1[0], 2), round(P1[1], 2), round(y1, 3)]], 'width': round(GW, 2), 'tunnel': True})
        g.collider(A0, A1, min(f(SW - 0.05), f(SW + 0.12)), max(f(SW - 0.05), f(SW + 0.12)), y1, y1 + 1.1)
        # roof over the shops (outer), gable glass over the street
        g.quad_sub('wood', g.P(A0, yt, f(SW + GW + SD)), g.P(A1, yt, f(SW + GW + SD)), g.P(A1, yt, f(SW)), g.P(A0, yt, f(SW)), C('#b39a7a'), (0, -1, 0))
        g.poly('glassI', [g.P(A0, yt, f(SW)), g.P(A1, yt, f(SW)), g.P(A1, yr, 0), g.P(A0, yr, 0)], (0.7, 0.76, 0.78, 1.0), (0, -1, 0))
        for a in range(int(A0), int(A1) + 1, 3):
            g.rod('wood', g.P(a, yt, f(SW)), g.P(a, yr, 0), 0.08, C('#5a4632'), n=4)
        g.poly('bakesky', [g.P(A0 - 1, yr + 0.5, f(SW + 1)), g.P(A1 + 1, yr + 0.5, f(SW + 1)), g.P(A1 + 1, yr + 0.5, 0), g.P(A0 - 1, yr + 0.5, 0)], (1, 1, 1, 1), (0, -1, 0))
        # shops: ground floor fronts on the street line, upper floor fronts set back behind the gallery
        for lvl, (yl, wf) in enumerate(((y0, SW), (y1, SW + GW))):
            nb = int((A1 - A0) / 4.8)
            for k in range(nb):
                u0, u1 = A0 + (A1 - A0) * k / nb, A0 + (A1 - A0) * (k + 1) / nb; um = (u0 + u1) / 2
                if lvl == 0 and s < 0 and u1 > 43 and u0 < 51: continue       # the stair bay
                fc = FAC[(k + lvl * 2 + (s > 0)) % len(FAC)]
                top = yl + (3.9 if lvl == 0 else 3.8)
                # shop box (floor, back, sides, ceiling glow), glazed front with a door, fascia + sign, awning on the ground floor
                g.lbox('wood', u0, u1, yl, yl + 0.02, f(wf), f(wf + SD), C('#9b8468'), top=True)
                g.panel_in('plaster', u0, u1, yl, top, f(wf + SD), C('#e6dcc8'), -s)
                for uu in (u0, u1):
                    g.lbox('wood', uu - 0.08, uu + 0.08, yl, top + 0.3, f(wf), f(wf + SD), fc, top=False, collide=True)
                g.lbox('ceilglow', u0 + 0.2, u1 - 0.2, top - 0.02, top, f(wf + 0.5), f(wf + SD - 0.3), (1.0, 0.9, 0.75, 1.0), top=False, bottom=True)
                for q in range(3):   # shelves of goods
                    yy = yl + 0.5 + q * 0.75
                    g.lbox('wood', u0 + 0.3, u1 - 0.3, yy, yy + 0.05, f(wf + SD - 0.55), f(wf + SD - 0.05), C('#6b4b31'), top=True)
                    for m in range(int((u1 - u0 - 0.8) / 0.45)):
                        uu = u0 + 0.45 + m * 0.45
                        g.lbox('paint', uu, uu + 0.3, yy + 0.05, yy + 0.05 + 0.2 + 0.2 * rng.random(), f(wf + SD - 0.45), f(wf + SD - 0.15),
                               (0.3 + 0.6 * rng.random(), 0.3 + 0.5 * rng.random(), 0.3 + 0.5 * rng.random(), 1.0), top=True)
                g.lbox('wood', u0 + 0.9, u1 - 0.9, yl, yl + 0.9, f(wf + 1.6), f(wf + 2.6), C('#6b4b31'), top=True)
                g.lbox('wood', u0, u1, yl, yl + 0.5, f(wf - 0.02), f(wf + 0.1), fc, top=True)
                dw = 1.3; dc = um + (u1 - u0) * 0.2
                for (ga, gb) in ((u0 + 0.1, dc - dw / 2), (dc + dw / 2, u1 - 0.1)):
                    g.lbox('glassI', ga, gb, yl + 0.5, top - 0.35, f(wf + 0.02), f(wf + 0.05), (0.72, 0.78, 0.8, 1.0), top=False)
                g.lbox('wood', u0, u1, top - 0.35, top + 0.35, f(wf - 0.04), f(wf + 0.1), fc, top=True, bottom=True)
                Ft = (g.xz(um, f(wf - 0.06)), (-s * L.u[0], -s * L.u[1]), (-s * L.v[0], -s * L.v[1]))
                hw_ = min(2.0, (u1 - u0) / 2 - 0.3)
                name = P39_SHOPS[(k * 2 + lvl * 13 + (s > 0) * 7) % len(P39_SHOPS)]
                g.poly('signI', [Geo.fp(Ft, -hw_, top - 0.28, 0.01), Geo.fp(Ft, hw_, top - 0.28, 0.01), Geo.fp(Ft, hw_, top + 0.28, 0.01), Geo.fp(Ft, -hw_, top + 0.28, 0.01)],
                       (1.0, 0.92, 0.75, 1.0), (Ft[2][0], 0, Ft[2][1]), uv=sign_uv(P39_SHOPS.index(name)))
                if lvl == 0 and k % 2 == 0:
                    ac = [C('#2f5f7a'), C('#7a2f2f'), C('#2f6a4a'), C('#8a6a2a')][(k // 2 + (s > 0)) % 4]
                    A_, B_ = g.P(u0 + 0.2, top + 0.4, f(wf - 0.05)), g.P(u1 - 0.2, top + 0.4, f(wf - 0.05))
                    C_, D_ = g.P(u1 - 0.2, top - 0.3, f(wf - 1.1)), g.P(u0 + 0.2, top - 0.3, f(wf - 1.1))
                    g.poly('fabric', [A_, B_, C_, D_], ac, (0, 1, 0)); g.poly('fabric', [A_, B_, C_, D_], shade(ac, 0.7), (0, -1, 0))
                if k % 2 == 0: g.light('POINT', um, top - 0.6, f(wf + SD * 0.5), 60, (1.0, 0.86, 0.66), radius=0.3)
    # the stair (west side, south of the stair bay) up to the west gallery
    solid_stair(g, 51.0, -(SW + GW / 2 + 0.2), 43.0, -(SW + GW / 2 + 0.2), y0, y1, 1.8, C('#8d7153'), slot='wood', cheek=C('#7d6a5a'), bal=False)
    # string lights across the street, hanging baskets, benches, end walls
    for a in range(int(A0) + 3, int(A1), 6):
        for q in range(9):
            b = -SW + q * (2 * SW) / 8
            yy = y1 + 2.6 - 0.35 * (1 - (b / SW) ** 2)
            g.llathe('lampI', a, b, [(0.0, yy - 0.08), (0.06, yy - 0.02), (0.0, yy + 0.04)], (1.0, 0.82, 0.5, 1.0), n=6)
        g.rod('metal', g.P(a, y1 + 2.65, -SW), g.P(a, y1 + 2.3, 0), 0.01, C('#2a2a2a'), n=3); g.rod('metal', g.P(a, y1 + 2.3, 0), g.P(a, y1 + 2.65, SW), 0.01, C('#2a2a2a'), n=3)
        g.light('POINT', a, y1 + 2.2, 0, 70, (1.0, 0.82, 0.55), radius=0.3)
        for s in (-1, 1):
            x, z = g.xz(a + 3, s * (SW + 0.2))
            g.cyl('metal', x, z, 0.02, y1 + 1.4, y1 + 2.1, C('#2a2a2a'), n=3)
            g.llathe('leaf', a + 3, s * (SW + 0.2), [(0.0, y1 + 0.9), (0.45, y1 + 1.1), (0.5, y1 + 1.4), (0.0, y1 + 1.5)], C('#4f7a36'), n=8)
            g.llathe('fabric', a + 3, s * (SW + 0.2), [(0.12, y1 + 1.12), (0.3, y1 + 1.35), (0.0, y1 + 1.42)], C('#d8568a') if a % 12 else C('#e8c64a'), n=6)
    for a in (12.0, 30.0):
        for s in (-1, 1):
            Fb = (g.xz(a - 1.0, s * 1.8), L.u, L.v)
            g.fbox('wood', Fb, 0, 2.0, y0 + 0.42, y0 + 0.5, -0.25, 0.25, C('#7d6547'), top=True, back=True)
            for e in (0.15, 1.75): g.fbox('metal', Fb, e, e + 0.1, y0, y0 + 0.42, -0.2, 0.2, C('#2f3a33'), top=True, back=True)
    for aa, sg in ((A0, 1), (A1, -1)):
        g.panel_u('wood', -SW - GW - SD, SW + GW + SD, y0, yt, aa, C('#7d6a5a'), sg)
        g.poly('wood', [g.P(aa, yt, -SW), g.P(aa, yt, SW), g.P(aa, yr, 0)], C('#7d6a5a'), (g.F[1][0] * sg, 0, g.F[1][1] * sg))
        g.collider(aa - 0.25 if sg > 0 else aa, aa if sg > 0 else aa + 0.25, -SW - GW - SD, SW + GW + SD, y0 - 1, yr)
    g.panel_u('sky', -2.4, 2.4, y1 + 0.6, yt - 0.4, A1 - 0.02, (0.72, 0.8, 0.88, 1.0), -1)
    g.panel_u('lampI', -1.6, 1.6, y0 + 0.4, y0 + 2.8, A0 + 0.02, (1.0, 0.95, 0.85, 1.0), 1)
    for s in (-1, 1):
        g.collider(A0, A1, min(s * (SW + GW + SD), s * (SW + GW + SD + 0.5)), max(s * (SW + GW + SD), s * (SW + GW + SD + 0.5)), y0 - 1, yr)
    # door: the south entrance of the building
    po = L.xz(-3.5, 0.0); pin = L.xz(A0 + 1.5, 0.0)
    g.doors.append({'label': 'Pier 39 - Market Street', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


# ================================================================================== Pier 15: the science museum hall
def exhibit_table(g, a, b, y, R, k):
    COLS = [C('#e0463a'), C('#2f7fd0'), C('#f2b632'), C('#3aa06a'), C('#8d4fc2'), C('#f07a2a'), C('#e8e6df')]
    top = COLS[k % len(COLS)]
    g.lbox('wood', a - 1.1, a + 1.1, y, y + 0.9, b - 0.7, b + 0.7, C('#cfc6b4'))
    g.lbox('paint', a - 1.15, a + 1.15, y + 0.9, y + 0.96, b - 0.75, b + 0.75, top, top=True, bottom=True)
    kind = k % 5
    if kind == 0:    # spinning disc on a post
        g.llathe('metal', a, b, [(0.04, y + 0.96), (0.04, y + 1.5)], C('#7c8084'), n=6)
        g.llathe('paint', a, b, [(0.0, y + 1.5), (0.55, y + 1.5), (0.55, y + 1.54), (0.0, y + 1.54)], COLS[(k + 3) % 7], n=16)
    elif kind == 1:  # glass tank
        g.lbox('glassI', a - 0.7, a + 0.7, y + 0.96, y + 1.6, b - 0.4, b + 0.4, (0.6, 0.75, 0.8, 1.0))
        g.lbox('paint', a - 0.65, a + 0.65, y + 0.97, y + 1.25, b - 0.35, b + 0.35, C('#3c7fa0'), top=True)
    elif kind == 2:  # lenses + a screen
        for q in range(3):
            g.llathe('glassI', a - 0.6 + q * 0.6, b, [(0.0, y + 0.96), (0.2, y + 1.3), (0.0, y + 1.64)], (0.8, 0.85, 0.9, 1.0), n=10)
        g.lbox('screen', a - 0.5, a + 0.5, y + 1.3, y + 1.9, b + 0.6, b + 0.65, (0.55, 0.7, 0.95, 1.0), top=False)
    elif kind == 3:  # pendulum frame
        for s in (-1, 1): g.lbox('metal', a + s * 0.9 - 0.04, a + s * 0.9 + 0.04, y + 0.96, y + 2.4, b - 0.04, b + 0.04, C('#6f7478'), top=False)
        g.lbox('metal', a - 0.95, a + 0.95, y + 2.4, y + 2.46, b - 0.05, b + 0.05, C('#6f7478'), top=True, bottom=True)
        x, z = g.xz(a + 0.2, b); g.rod('metal', (x, y + 2.4, z), (x + 0.05, y + 1.3, z), 0.01, C('#2a2a2a'), n=3)
        g.llathe('gold', a + 0.25, b, [(0.0, y + 1.1), (0.12, y + 1.22), (0.0, y + 1.34)], C('#c9a24a'), n=10)
    else:            # magnets / gears board
        g.lbox('paint', a - 1.0, a + 1.0, y + 0.96, y + 2.0, b - 0.06, b + 0.06, C('#2b2d31'), top=True)
        for q in range(5):
            g.lbox('paint', a - 0.9 + q * 0.38, a - 0.66 + q * 0.38, y + 1.2 + (q % 2) * 0.35, y + 1.44 + (q % 2) * 0.35, b + 0.06, b + 0.1, COLS[(k + q) % 7], top=True)


def exp_int(O):
    L, a0, a1, b0, b1 = W5.exp_box()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'The Science Pier - Main Hall'; g.sky_k = 3.2
    A0, A1 = max(a0, 0.0) + 3.5, max(a0, 0.0) + 78.0
    B0, B1 = max(b0 + 1.5, -19.0), min(b1 - 1.5, 19.0)
    yg = max(H(*L.xz(a, 0)) for a in (20, 50, 80)) + 0.05
    y0 = yg + 0.15; yw = y0 + 8.4; ym = yw + 2.2
    g.floor_y = y0
    R = random.Random(15)
    g.room('hall', A0, A1, B0, B1, y0, ym + 1.5)
    g.quad_sub('concrete', g.P(A0, y0, B0), g.P(A1, y0, B0), g.P(A1, y0, B1), g.P(A0, y0, B1), C('#8e8b84'), (0, 1, 0))
    g.decks.extend(rect_decks_w(g, A0, A1, B0, B1, y0))
    g.shell(A0, A1, B0, B1, y0, yw, None, None, 'plaster', C('#e7e3da'), None, None, ceiling=False)
    # clerestory glass bands (daylight) along both long walls, the monitor down the middle of the roof
    for s in (-1, 1):
        bb = (B1 - 0.02) if s > 0 else (B0 + 0.02)
        for k in range(int((A1 - A0) / 7.6)):
            a = A0 + 3.8 + k * 7.6
            g.panel_in('sky', a - 3.0, a + 3.0, y0 + 3.2, y0 + 7.2, bb, (0.75, 0.8, 0.86, 1.0), -s)
        g.quad_sub('plaster', g.P(A0, yw, s * abs(B1 if s > 0 else B0)), g.P(A1, yw, s * abs(B1 if s > 0 else B0)), g.P(A1, ym, s * 5.0), g.P(A0, ym, s * 5.0), C('#d9d6ce'), (0, -1, 0))
        g.poly('sky', [g.P(A0, ym, s * 5.0), g.P(A1, ym, s * 5.0), g.P(A1, ym + 1.5, s * 5.0), g.P(A0, ym + 1.5, s * 5.0)], (0.75, 0.8, 0.86, 1.0), (-g.F[2][0] * s, 0, -g.F[2][1] * s))
        g.poly('bakesky', [g.P(A0, ym + 2.5, s * 7.0), g.P(A1, ym + 2.5, s * 7.0), g.P(A1, ym + 2.5, 0), g.P(A0, ym + 2.5, 0)], (1, 1, 1, 1), (0, -1, 0))
    g.quad_sub('plaster', g.P(A0, ym + 1.5, -5.0), g.P(A1, ym + 1.5, -5.0), g.P(A1, ym + 1.5, 5.0), g.P(A0, ym + 1.5, 5.0), C('#e9e7e1'), (0, -1, 0))
    for aa, s in ((A0, 1), (A1, -1)):
        g.poly('plaster', [g.P(aa, yw, B0), g.P(aa, yw, B1), g.P(aa, ym, 5.0), g.P(aa, ym + 1.5, 5.0), g.P(aa, ym + 1.5, -5.0), g.P(aa, ym, -5.0)], C('#e7e3da'), (g.F[1][0] * s, 0, g.F[1][1] * s))
    # steel trusses every 7.6 m, pendant lights
    for k in range(int((A1 - A0) / 7.6) + 1):
        a = A0 + 0.5 + k * 7.6
        if a > A1 - 0.3: break
        g.lbox('metal', a - 0.12, a + 0.12, yw - 0.5, yw - 0.2, B0, B1, C('#5d6a6f'))
        for s in (-1, 1):
            g.rod('metal', g.P(a, yw - 0.2, s * abs(B1 if s > 0 else B0) * 0.98), g.P(a, ym - 0.1, s * 5.0), 0.12, C('#5d6a6f'), n=4)
            for q in range(4):
                bq = s * (3.0 + q * 3.8)
                if abs(bq) > abs(B1 if s > 0 else B0) - 1: continue
                g.rod('metal', g.P(a, yw - 0.5, bq), g.P(a, yw - 0.2 + (ym - yw) * (1 - abs(bq) / 19.0), bq * 0.95), 0.05, C('#5d6a6f'), n=3)
        for bq in (-9.0, 0.0, 9.0):
            g.llathe('metal', a + 3.8, bq, [(0.05, yw - 0.2), (0.05, yw - 1.8), (0.45, yw - 2.2), (0.48, yw - 2.25)], C('#e3e0d8'), n=12)
            g.llathe('lampI', a + 3.8, bq, [(0.4, yw - 2.24), (0.0, yw - 2.27)], (1.0, 0.95, 0.85, 1.0), n=10)
            g.light('POINT', a + 3.8, yw - 2.6, bq, 160, (1.0, 0.94, 0.85), radius=0.4)
    # exhibits: a grid of tables, plus a few big pieces (dark dome, vortex column, a giant colour wheel, hanging mobiles)
    k = 0
    for i in range(7):
        for j in range(4):
            a = A0 + 10 + i * 8.5 + (j % 2) * 2.0; b = -12.0 + j * 8.0
            if a > A1 - 6: continue
            if (i, j) in ((2, 1), (2, 2), (5, 1), (5, 2)): continue
            exhibit_table(g, a, b, y0, R, k); k += 1
            g.collider(a - 1.15, a + 1.15, b - 0.75, b + 0.75, y0 - 1, y0 + 1.0)
    ac = A0 + 10 + 2 * 8.5 + 1.0
    g.llathe('paint', ac, 0.0, [(4.5, y0), (4.4, y0 + 1.5), (3.8, y0 + 3.0), (2.6, y0 + 4.2), (0.0, y0 + 4.8)], C('#23252a'), n=24)
    g.collider(ac - 3.6, ac + 3.6, -3.6, 3.6, y0 - 1, y0 + 4.5)
    av = A0 + 10 + 5 * 8.5 + 1.0
    g.llathe('metal', av, 0.0, [(1.4, y0), (1.4, y0 + 0.9), (0.0, y0 + 0.9)], C('#3f4448'), n=16)
    g.llathe('glassI', av, 0.0, [(1.0, y0 + 0.9), (1.0, y0 + 5.2)], (0.75, 0.82, 0.86, 1.0), n=16)
    g.llathe('screen', av, 0.0, [(0.05, y0 + 0.95), (0.3, y0 + 2.5), (0.12, y0 + 3.8), (0.02, y0 + 5.0)], (0.75, 0.82, 0.92, 1.0), n=10)
    g.llathe('metal', av, 0.0, [(1.2, y0 + 5.2), (1.2, y0 + 5.6), (0.0, y0 + 5.6)], C('#3f4448'), n=16)
    g.collider(av - 1.4, av + 1.4, -1.4, 1.4, y0 - 1, y0 + 5.6)
    for q in range(12):   # giant colour wheel on the end wall
        a0_, a1_ = 2 * math.pi * q / 12, 2 * math.pi * (q + 1) / 12
        c0 = g.P(A1 - 0.05, y0 + 4.2, 0.0)
        hue = q / 12.0
        col = (max(0, min(1, abs(hue * 6 - 3) - 1)), max(0, min(1, 2 - abs(hue * 6 - 2))), max(0, min(1, 2 - abs(hue * 6 - 4))), 1.0)
        g.poly('paint', [c0, g.P(A1 - 0.05, y0 + 4.2 + math.sin(a0_) * 2.6, math.cos(a0_) * 2.6), g.P(A1 - 0.05, y0 + 4.2 + math.sin(a1_) * 2.6, math.cos(a1_) * 2.6)], col, (-g.F[1][0], 0, -g.F[1][1]))
    for q in range(5):   # hanging mobiles
        a = A0 + 14 + q * 12.0; b = R.uniform(-8, 8)
        x, z = g.xz(a, b); g.rod('metal', (x, yw - 0.5, z), (x, yw - 3.0, z), 0.01, C('#2a2a2a'), n=3)
        for m in range(4):
            aa = 2 * math.pi * m / 4
            g.llathe('paint', a + math.cos(aa) * 0.9, b + math.sin(aa) * 0.9, [(0.0, yw - 3.4), (0.25, yw - 3.2), (0.0, yw - 3.0)], [C('#e0463a'), C('#2f7fd0'), C('#f2b632'), C('#3aa06a')][m], n=8)
    # banner + the entrance door on the bulkhead
    Fb = (g.xz(A0 + 6.0, -4.0), L.v, (-L.u[0], -L.u[1]))
    g.fbox('fabric', Fb, 0, 8.0, yw - 2.6, yw - 1.3, -0.02, 0.02, C('#b9412f'), top=False, back=True)
    g.text('paint', Fb, 4.0, yw - 2.35, 0.03, 'EXPLORE EVERYTHING', 0.5, C('#f4efe4'), depth=0.02)
    po = L.xz(a0 - 3.0, (b0 + b1) / 2); pin = L.xz(A0 + 1.5, 0.0)
    g.doors.append({'label': 'The Science Pier', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


INTERIORS = {'fortPoint': fort_int, 'alcatraz': alcatraz_int, 'pier45': musee_int, 'pier39': p39_int, 'exploratorium': exp_int}


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = int(a[a.index('--res') + 1]) if '--res' in a else 2048
    spp = int(a[a.index('--spp') + 1]) if '--spp' in a else 256
    ids = [x for x in a if not x.startswith('--') and not x.isdigit()]
    for bid in ids:
        run_interior(bid, INTERIORS[bid], site_origin(bid), res=res, samples=spp)


def site_origin(bid):
    """exterior origin of any hero site (wave 5 here, or an earlier wave's builder table)"""
    import hero_wave3 as W3, hero_wave4 as W4
    for M in (W5, W3, W4):
        if bid in M.BUILDERS:
            fn, hide = M.BUILDERS[bid]
            return M.ORIGINS[bid]() if bid in M.ORIGINS else origin_for([ring_of(i) for i in hide])
    raise KeyError(bid)

if __name__ == '__main__':
    main()
