"""HILLBOMB hero interiors, wave 4. Run:  python hero_int_w4.py -- castro missionDolores ... [--res 2048 --spp 256]"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_interior import *   # noqa
from hero_int_w1 import (checker, floor_over, chandelier, potted_plant, CREAM, CREAM_D, GOLDC, SKY, MARB_W, MARB_G, rail, stairs, coffers, pilaster)   # noqa
from hero_int_w2 import glass_walls, light_grid, bench, elevator_bank, face_yaw   # noqa
from hero_int_w3 import dirw, arch_hole, wall_with_holes, solid_stair   # noqa
from hero_wave1 import origin_for, sidewalk, edge_facing, ring_edges   # noqa
from hero_wave2 import Loc, ring_scale   # noqa
import hero_wave4 as W4
from hero_wave4 import BUILDERS, ORIGINS, arch_pts   # noqa

RED_V = C('#6e1b1e'); GOLD4 = C('#c29a48'); TEAL = C('#3d5f5a'); RUST = C('#7c3324'); WOOD4 = C('#5b3a24'); WASHI = C('#efe9dc')


def plane_frame(g, L, a0, a1, wc, s):
    """wall frame on the plane b = wc of a Loc, facing +b (s > 0) or -b; returns (F, ufun) where ufun(a) -> frame u"""
    if s > 0: return (L.xz(a0, wc), L.u, L.v), (lambda a: a - a0)
    return (L.xz(a1, wc), (-L.u[0], -L.u[1]), (-L.v[0], -L.v[1])), (lambda a: a1 - a)


def endwall_frame(L, a, b0, b1, s):
    """wall frame on the plane a = const facing +a (s > 0) or -a; u runs along b"""
    if s > 0:   # t must satisfy n = (-t.z, t.x) = +u  ->  t = (u.z, -u.x) = -v
        return (L.xz(a, b1), (-L.v[0], -L.v[1]), L.u), (lambda b: b1 - b)
    return (L.xz(a, b0), L.v, (-L.u[0], -L.u[1])), (lambda b: b - b0)


def reveal(g, F, hole, depth, col, slot='plaster', skip_bottom=True):
    m = len(hole); cu = sum(p[0] for p in hole) / m; cv = sum(p[1] for p in hole) / m; vmin = min(p[1] for p in hole)
    for k in range(m):
        p, q = hole[k], hole[(k + 1) % m]
        if skip_bottom and p[1] < vmin + 0.01 and q[1] < vmin + 0.01: continue
        mu, mv = (p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv
        g.poly(slot, [Geo.fp(F, p[0], p[1], 0), Geo.fp(F, q[0], q[1], 0), Geo.fp(F, q[0], q[1], -depth), Geo.fp(F, p[0], p[1], -depth)], col,
               (-(F[1][0] * mu), -mv, -(F[1][1] * mu)))


def pews(g, L, a0, a1, b0, b1, y, step=1.05, col=WOOD4, collide=True):
    """rows of wooden pews facing +a (the altar)"""
    n = int((a1 - a0) / step)
    for k in range(n):
        a = a0 + k * step
        L.box(g, 'wood', a, a + 0.42, b0, b1, y + 0.42, y + 0.47, col, top=True, bottom=True)
        L.box(g, 'wood', a - 0.05, a + 0.02, b0, b1, y + 0.1, y + 0.95, shade(col, 0.9), top=True)
        for bb in (b0, b1 - 0.06):
            L.box(g, 'wood', a - 0.05, a + 0.45, bb, bb + 0.06, y, y + 0.9, shade(col, 0.8), top=True)
    if collide: g.cols.append(L.col(a0 - 0.1, a0 + n * step - 0.5, b0, b1, y - 1, y + 0.95))


def lcol(g, L, a, b, y0, y1, r, col, cap=GOLD4, slot='marble', order='corinthian'):
    x, z = L.xz(a, b)
    g.lathe(slot, x, z, [(r * 1.35, y0), (r * 1.35, y0 + 0.35), (r * 1.1, y0 + 0.55), (r, y0 + 0.75), (r * 0.9, y1 - 1.1 * r)], col, n=16)
    if order == 'corinthian':
        g.lathe('gold', x, z, [(r * 0.9, y1 - 1.1 * r), (r * 1.05, y1 - 0.7 * r), (r * 1.4, y1 - 0.25 * r), (r * 1.45, y1)], cap, n=16)
    else:
        g.lathe(slot, x, z, [(r * 0.9, y1 - 0.6 * r), (r * 1.35, y1 - 0.25 * r), (r * 1.35, y1)], col, n=16)
    g.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': round(r * 1.1, 2), 'hz': round(r * 1.1, 2), 'yaw': 0, 'yMin': round(y0 - 1, 2), 'yMax': round(y1, 2)})


def stained(seed):
    R = random.Random(seed)
    return [(0.9, 0.3, 0.25, 1.0), (0.3, 0.45, 0.95, 1.0), (0.95, 0.8, 0.35, 1.0), (0.35, 0.7, 0.45, 1.0), (0.6, 0.35, 0.85, 1.0)][R.randrange(5)]


def win_panel(g, F, hole, w, col, slot='stained'):
    g.poly(slot, [Geo.fp(F, u, v, w) for u, v in hole], col, (F[2][0], 0, F[2][1]))


# ================================================================================== generic basilica nave (SS Peter & Paul, Grace)
def church(g, L, a0, a1, NB, AB, y0, ys, ya, yv0, yv, pal, pointed=True, bay=6.0, apse=None, rose_r=0.0, label='Church'):
    wall, wall_d, vault, vault_d, rib, floor_a, floor_b = pal
    n = max(2, int(round((a1 - a0 - 6.0) / bay))); bw = (a1 - a0 - 6.0) / n
    ap0 = a0 + 3.0; ap1 = a1 - 3.0                      # arcade range (first/last bay walls are solid)
    g.room('nave', a0, a1, -AB, AB, y0, yv)
    checker(g, 'marble', a0, a1, -AB, AB, y0, 1.2, floor_a, floor_b, diag=False)
    # outer shell: aisle walls, end walls
    g.shell(a0, a1, -AB, AB, y0, ya, None, None, 'plaster', wall, None, None, walls=(False, False, False, False), ceiling=False)
    for s in (-1, 1):   # aisle walls: lancets (stained glass), dado
        F, uf = plane_frame(g, L, a0, a1, s * AB, -s)
        holes = []
        for k in range(n):
            uc = uf(ap0 + (k + 0.5) * bw)
            holes.append(arch_pts(uc, min(2.4, bw * 0.45), y0 + 3.2, ya - 2.2, 10, pointed=pointed))
        wall_with_holes(g, F, 0, a1 - a0, y0, ya, holes, wall)
        for k, h in enumerate(holes):
            reveal(g, F, h, 0.6, wall_d)
            win_panel(g, F, h, -0.6, stained(k * 7 + s))
        g.fbox('wood', F, 0, a1 - a0, y0, y0 + 1.2, 0, 0.05, WOOD4, top=True)
    # aisle ceilings (flat, ribbed)
    for s in (-1, 1):
        b0, b1 = sorted((s * NB, s * AB))
        g.quad_sub('plaster', L.P(a0, b0, ya), L.P(a1, b0, ya), L.P(a1, b1, ya), L.P(a0, b1, ya), vault_d, (0, -1, 0))
        for k in range(n + 1):
            a = ap0 + k * bw
            L.box(g, 'plaster', a - 0.2, a + 0.2, b0, b1, ya - 0.5, ya, rib, top=False, bottom=True)
    # arcade walls at b = +-NB: nave face (arches + clerestory), aisle face (arches only)
    for s in (-1, 1):
        for face in (1, -1):              # face = +1: towards the aisle (outward), -1: towards the nave
            F, uf = plane_frame(g, L, a0, a1, s * NB + face * s * 0.45, face * s)
            top = ya if face > 0 else yv0
            holes = []
            for k in range(n):
                uc = uf(ap0 + (k + 0.5) * bw)
                holes.append(arch_pts(uc, bw - 1.6, y0, ys, 12, pointed=pointed))
            wall_with_holes(g, F, 0, a1 - a0, y0, ya, holes, wall)
            if face < 0:
                clh = []
                for k in range(n):
                    uc = uf(ap0 + (k + 0.5) * bw)
                    clh.append(arch_pts(uc, min(2.6, bw * 0.5), ya + 1.0, yv0 - 1.8, 10, pointed=pointed))
                wall_with_holes(g, F, 0, a1 - a0, ya, yv0, clh, wall)
                for k, h in enumerate(clh):
                    reveal(g, F, h, 0.9, wall_d)
                    win_panel(g, F, h, -0.9, stained(k * 3 + 11 + s))
                    g.poly('bakesky', [Geo.fp(F, u, v, -2.5) for u, v in h], SKY, (F[2][0], 0, F[2][1]))
                for k, h in enumerate(holes):
                    reveal(g, F, h, 0.9, wall_d)
                g.fbox('plaster', F, 0, a1 - a0, ya - 0.4, ya + 0.1, 0, 0.35, wall_d, top=True, bottom=True)
                g.fbox('plaster', F, 0, a1 - a0, yv0 - 0.5, yv0, 0, 0.45, wall_d, top=True, bottom=True)
        for k in range(n + 1):             # piers: clustered columns
            a = ap0 + k * bw
            lcol(g, L, a, s * NB, y0, ys, 0.7, wall, cap=GOLD4 if not pointed else wall_d, slot='marble', order='corinthian' if not pointed else 'doric')
            if pointed:     # vaulting shaft up the nave face to the vault springing
                x, z = L.xz(a, s * (NB - 0.55))
                g.lathe('plaster', x, z, [(0.28, ys), (0.25, yv0)], wall_d, n=8)
    # clerestory wall-face over the solid first/last half bays is part of the walls above; now the vault
    NS = 14
    for k in range(NS):
        t0, t1 = k / NS, (k + 1) / NS
        def VP(a, t):
            ang = math.pi * t
            if pointed:
                # two-centred pointed barrel: each half is an arc of radius R = 1.3 * NB
                R = 1.35 * NB; hb = NB
                if t <= 0.5:
                    th = math.acos((R - hb) / R) * (t / 0.5)
                    return L.P(a, -NB + R - R * math.cos(th), yv0 + R * math.sin(th) * (yv - yv0) / (R * math.sin(math.acos((R - hb) / R))))
                th = math.acos((R - hb) / R) * ((1 - t) / 0.5)
                return L.P(a, NB - R + R * math.cos(th), yv0 + R * math.sin(th) * (yv - yv0) / (R * math.sin(math.acos((R - hb) / R))))
            return L.P(a, -NB * math.cos(ang), yv0 + (yv - yv0) * math.sin(ang))
        for j in range(n + 2):
            aa0 = a0 if j == 0 else ap0 + (j - 1) * bw
            aa1 = ap0 if j == 0 else (a1 if j == n + 1 else ap0 + j * bw)
            g.poly('plaster', [VP(aa0, t0), VP(aa1, t0), VP(aa1, t1), VP(aa0, t1)], vault if (k + j) % 2 else vault_d, (0, -1, 0))
    for k in range(n + 1):                 # transverse + diagonal ribs
        a = ap0 + k * bw
        pts = [VP(a, t / 16) for t in range(17)]
        for j in range(16): g.rod('gold' if not pointed else 'plaster', pts[j], pts[j + 1], 0.16, rib, n=4)
        if k < n and pointed:
            for sg in (-1, 1):
                pp = [L.P(a + bw * (t / 16 if sg > 0 else 1 - t / 16), -NB + 2 * NB * t / 16, VP(0, t / 16)[1] + 0.3 * math.sin(math.pi * t / 16)) for t in range(17)]
                for j in range(16): g.rod('plaster', pp[j], pp[j + 1], 0.1, rib, n=4)
    # end walls: entrance (rose window + doors), altar end
    for (a, s) in ((a0, 1), (a1, -1)):
        F, uf = endwall_frame(L, a, -AB, AB, s)
        holes = []
        if s > 0 and rose_r > 0:
            rp = [(uf(0.0) + math.cos(2 * math.pi * i / 32) * rose_r, (yv0 + yv) / 2 - 0.6 + math.sin(2 * math.pi * i / 32) * rose_r) for i in range(32)]
            holes.append(rp)
        if s < 0:
            holes = [arch_pts(uf(bb), 2.0, ya + 1.5, yv0 + 2.0, 10, pointed=pointed) for bb in (-3.2, 0.0, 3.2)]
        wall_with_holes(g, F, 0, 2 * AB, y0, yv + 0.5, holes, wall) if holes else radial_panel(g, 'plaster', F, 0, 2 * AB, y0, yv + 0.5, None, wall)
        for k, h in enumerate(holes):
            reveal(g, F, h, 0.8, wall_d)
            win_panel(g, F, h, -0.8, (0.55, 0.45, 0.95, 1.0) if s > 0 else stained(k + 40))
            g.poly('bakesky', [Geo.fp(F, u, v, -2.5) for u, v in h], SKY, (F[2][0], 0, F[2][1]))
        if s > 0 and rose_r > 0:
            uc = uf(0.0); yc = (yv0 + yv) / 2 - 0.6
            for i in range(16):
                ang = 2 * math.pi * i / 16
                g.rod('plaster', Geo.fp(F, uc, yc, -0.75), Geo.fp(F, uc + math.cos(ang) * rose_r, yc + math.sin(ang) * rose_r, -0.75), 0.07, wall_d, n=4)
        if s > 0:     # entrance doors
            uc = uf(0.0)
            g.fbox('wood', F, uc - 1.6, uc + 1.6, y0, y0 + 5.2, 0, 0.12, WOOD4, top=True)
            for bb in (-NB - 3.0, NB + 3.0):
                g.fbox('wood', F, uf(bb) - 1.0, uf(bb) + 1.0, y0, y0 + 3.4, 0, 0.12, WOOD4, top=True)
    # sanctuary: raised platform, altar, reredos, hanging lamps
    Ls = a1 - 9.0
    for s_ in range(3):
        L.box(g, 'marble', Ls + s_ * 0.45, a1, -NB + 0.5, NB - 0.5, y0, y0 + 0.18 * (s_ + 1), shade(floor_a, 1.0 - 0.03 * s_), top=True)
    ys_ = y0 + 0.54
    A_, B_ = L.xz(Ls - 0.3, 0), L.xz(Ls + 1.4, 0)
    g.decks.append({'pts': [[round(A_[0], 2), round(A_[1], 2), round(y0, 3)], [round(B_[0], 2), round(B_[1], 2), round(ys_, 3)]], 'width': 4.0, 'tunnel': True})
    g.decks.append({'pts': [[round(L.xz(Ls + 1.4, 0)[0], 2), round(L.xz(Ls + 1.4, 0)[1], 2), round(ys_, 3)], [round(L.xz(a1 - 0.6, 0)[0], 2), round(L.xz(a1 - 0.6, 0)[1], 2), round(ys_, 3)]],
                    'width': round(2 * NB - 1.4, 2), 'tunnel': True})
    L.box(g, 'marble', a1 - 4.8, a1 - 3.6, -1.6, 1.6, ys_, ys_ + 1.05, C('#f2eee6'), top=True)
    g.collider(a1 - 4.9, a1 - 3.5, -1.7, 1.7, ys_ - 1, ys_ + 1.1)
    L.box(g, 'fabric', a1 - 4.85, a1 - 3.55, -1.65, 1.65, ys_ + 0.85, ys_ + 1.07, C('#f6f3ea'), top=True)
    for bb in (-1.2, 1.2):
        x, z = L.xz(a1 - 4.2, bb)
        g.lathe('gold', x, z, [(0.12, ys_ + 1.05), (0.05, ys_ + 1.2), (0.04, ys_ + 1.6)], GOLD4, n=6)
        g.lathe('lampI', x, z, [(0.03, ys_ + 1.6), (0.03, ys_ + 1.9), (0.0, ys_ + 1.95)], (1.0, 0.85, 0.55, 1.0), n=4)
        g.lights.append(('POINT', (x, ys_ + 2.0, z), 25, (1.0, 0.75, 0.45), 0.05, None, None))
    # reredos / baldachin
    if apse == 'reredos':
        F, uf = endwall_frame(L, a1 - 0.15, -AB, AB, -1)
        uc = uf(0.0)
        g.fbox('gold', F, uc - 4.5, uc + 4.5, ys_, ys_ + 10.0, 0, 0.5, GOLD4, top=True)
        for k in range(5):
            uu = uc - 3.6 + k * 1.8
            g.fbox('plaster', F, uu - 0.6, uu + 0.6, ys_ + 2.0, ys_ + 6.5, 0.5, 0.55, C('#2f3a58'), top=False)
            p = Geo.fp(F, uu, 0, 0.9)
            g.lathe('paint', p[0], p[2], [(0.32, ys_ + 2.2), (0.3, ys_ + 4.4), (0.2, ys_ + 4.8), (0.22, ys_ + 5.2), (0.0, ys_ + 5.5)], stained(k + 60), n=8)
            g.fbox('gold', F, uu - 0.75, uu + 0.75, ys_ + 6.5, ys_ + 7.4, 0.5, 0.8, GOLD4, top=True, bottom=True)
        for k in range(3):
            g.fbox('gold', F, uc - 4.5 + k * 0.4, uc + 4.5 - k * 0.4, ys_ + 10.0 + k * 1.2, ys_ + 11.2 + k * 1.2, 0, 0.45, GOLD4, top=True)
        pc = Geo.fp(F, uc, 0, 0.6)
        g.rod('gold', (pc[0], ys_ + 13.8, pc[2]), (pc[0], ys_ + 16.5, pc[2]), 0.12, GOLD4, n=4)
        g.rod('gold', Geo.fp(F, uc - 0.8, ys_ + 15.6, 0.6), Geo.fp(F, uc + 0.8, ys_ + 15.6, 0.6), 0.12, GOLD4, n=4)
        g.light('AREA', a1 - 7.0, ys_ + 9.0, 0.0, 900, (1.0, 0.86, 0.62), size=(4.0, 4.0), rot=None)
    else:   # baldachin over the altar (four columns + canopy)
        for (da, db) in ((-5.4, -2.4), (-5.4, 2.4), (-2.9, -2.4), (-2.9, 2.4)):
            x, z = L.xz(a1 + da, db)
            g.lathe('marble', x, z, [(0.3, ys_), (0.25, ys_ + 0.3), (0.22, ys_ + 5.5), (0.32, ys_ + 5.8)], C('#e9e3d6'), n=12)
        L.box(g, 'gold', a1 - 5.8, a1 - 2.5, -2.8, 2.8, ys_ + 5.8, ys_ + 6.6, GOLD4, top=True, bottom=True)
        x, z = L.xz(a1 - 4.15, 0.0)
        g.lathe('gold', x, z, [(2.6, ys_ + 6.6), (1.2, ys_ + 8.2), (0.2, ys_ + 9.0), (0.0, ys_ + 9.6)], GOLD4, n=12)
        g.rod('gold', (x, ys_ + 9.6, z), (x, ys_ + 11.0, z), 0.08, GOLD4, n=4)
        g.light('AREA', a1 - 4.2, ys_ + 5.4, 0.0, 700, (1.0, 0.86, 0.62), size=(3.0, 3.0))
    # pews
    pews(g, L, a0 + 7.0, Ls - 2.0, -NB + 0.9, -1.4, y0)
    pews(g, L, a0 + 7.0, Ls - 2.0, 1.4, NB - 0.9, y0)
    # hanging lamps down the nave, warm spill lights in the aisles
    for k in range(n):
        a = ap0 + (k + 0.5) * bw
        x, z = L.xz(a, 0.0)
        yl = ys + 1.5
        g.lathe('metal', x, z, [(0.02, yv - 1.0), (0.02, yl + 0.6)], C('#2a2622'), n=4)
        g.lathe('lampI', x, z, [(0.0, yl - 0.4), (0.45, yl - 0.1), (0.5, yl + 0.3), (0.25, yl + 0.6), (0.0, yl + 0.65)], (1.0, 0.86, 0.6, 1.0), n=10)
        g.lights.append(('POINT', (x, yl, z), 520, (1.0, 0.82, 0.58), 0.4, None, None))
        for s in (-1, 1):
            g.light('POINT', a, ya - 1.2, s * (NB + AB) / 2, 90, (1.0, 0.82, 0.58), radius=0.3)
    # walkable floor + door
    g.floor_y = y0
    return n, bw


def door_at(g, label, L, a_out, a_in, b, y_out, y_in):
    po, pin = L.xz(a_out, b), L.xz(a_in, b)
    g.doors.append({'label': label, 'v': 2, 'out': [round(po[0], 2), round(y_out, 2), round(po[1], 2), round(face_yaw(-L.u[0], -L.u[1]), 3)],
                    'in': [round(pin[0], 2), round(y_in, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})


# ================================================================================== Saints Peter and Paul: nave
def sspp_int(O):
    L, W = W4.sspp_frame()
    hw = W / 2
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Saints Peter and Paul Church'; g.sky_k = 2.5
    yG = min(sidewalk(*L.xz(-1.0, b)) for b in (-hw, 0, hw)) + 0.1
    y0 = max(yG + 0.9, floor_over(g, 9.5, 46.2, -hw + 1.2, hw - 1.2, pad=0.1))
    pal = (C('#f1ede4'), C('#ddd6c7'), C('#f3efe6'), C('#e3dccd'), C('#c9a24a'), C('#e9e4d8'), C('#b9a27f'))
    church(g, L, 9.5, 46.2, 6.2, hw - 1.2, y0, y0 + 8.5, y0 + 11.5, y0 + 16.5, y0 + 21.0, pal, pointed=False, bay=5.6, apse='baldachin', rose_r=3.2)
    door_at(g, 'Saints Peter and Paul Church', L, -4.2, 11.5, 0.0, sidewalk(*L.xz(-4.2, 0.0)) + 0.9, y0)
    g.decks.append({'pts': [[round(L.xz(-3.5, 0)[0], 2), round(L.xz(-3.5, 0)[1], 2), round(y0, 3)], [round(L.xz(0.5, 0)[0], 2), round(L.xz(0.5, 0)[1], 2), round(y0, 3)]],
                    'width': 12.0, 'tunnel': False}) if False else None
    return g


# ================================================================================== Grace Cathedral: nave + the labyrinth
def grace_int(O):
    L = W4.grace_frame()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Grace Cathedral'; g.sky_k = 2.0
    yG = min(sidewalk(*L.xz(-2.0, b)) for b in (-14, 0, 14)) + 0.1
    r = ring_of(16833)
    amax = max(L.loc(*p)[0] for p in r)
    y0 = max(yG + 0.05, floor_over(g, 10.5, amax - 12.4, -13.0, 13.0, pad=0.1))
    pal = (C('#d6d0c3'), C('#c1b9a9'), C('#dcd6ca'), C('#cbc3b4'), C('#b5ad9d'), C('#cfc8ba'), C('#a39b8c'))
    n, bw = church(g, L, 10.5, amax - 12.4, 6.8, 13.0, y0, y0 + 10.4, y0 + 13.8, y0 + 20.0, y0 + 28.5, pal, pointed=True, bay=6.2, apse='reredos', rose_r=4.0)
    # the labyrinth (terrazzo, 11 circuits) inside the entrance
    cx, cz = L.xz(18.5, 0.0)
    for k in range(12):
        r0, r1 = 5.6 - k * 0.45, 5.6 - k * 0.45 - 0.22
        g.lathe('marble', cx, cz, [(r0, y0 + 0.006), (max(0.0, r1), y0 + 0.006)], C('#6f6a62'), n=48)
        g.lathe('marble', cx, cz, [(max(0.0, r1), y0 + 0.005), (max(0.0, r1 - 0.23), y0 + 0.005)], C('#e8e3d8'), n=48)
    for i in range(6):   # centre rosette
        a = 2 * math.pi * i / 6
        g.lathe('marble', cx + math.cos(a) * 0.35, cz + math.sin(a) * 0.35, [(0.3, y0 + 0.008), (0.0, y0 + 0.008)], C('#b7a27a'), n=10)
    door_at(g, 'Grace Cathedral', L, -4.5, 12.5, 0.0, yG, y0)
    return g


# ================================================================================== Mission Dolores: the 1791 chapel
def mission_int(O):
    Lm, Wm, Lb, Wb = W4.md_frames()
    b0, b1, CL, WH = W4.MD['CB0'], W4.MD['CB1'], W4.MD['CLEN'], W4.MD['WALL']
    F = (Lm.xz(0, 0), Lm.u, Lm.v)
    g = IGeo(O, F); g.name = 'Mission Dolores'; g.sky_k = 3.5
    L = Lm
    yG = min(H(*Lm.xz(0.8, b)) for b in (-6, 0, 6)) + 0.1
    A0, A1, B0, B1 = 1.2, CL - 1.2, b0 + 1.15, b1 - 1.15
    y0 = max(yG + 0.35, floor_over(g, A0, A1, B0, B1, pad=0.1))
    bm = (B0 + B1) / 2
    yc = y0 + 6.6
    g.room('chapel', A0, A1, B0, B1, y0, yc)
    # terracotta floor, whitewashed walls with a painted dado band
    checker(g, 'tiles', A0, A1, B0, B1, y0, 0.45, C('#a65d3f'), C('#94503a'), diag=False)
    g.shell(A0, A1, B0, B1, y0, yc, None, None, 'plaster', WASHI, None, None, ceiling=False)
    for s in (-1, 1):
        Fw, uf = plane_frame(g, L, A0, A1, B0 if s < 0 else B1, -s)
        g.fbox('plaster', Fw, 0, A1 - A0, y0, y0 + 1.3, 0, 0.02, C('#c9b79a'), top=False, sides=False)
        for k in range(int((A1 - A0) / 0.9)):
            uu = 0.45 + k * 0.9
            g.poly('plaster', [Geo.fp(Fw, uu - 0.3, y0 + 1.3, 0.03), Geo.fp(Fw, uu + 0.3, y0 + 1.3, 0.03), Geo.fp(Fw, uu, y0 + 1.75, 0.03)], C('#7a3b2a') if k % 2 else C('#3e5a6b'),
                   (Fw[2][0], 0, Fw[2][1]))
        g.fbox('plaster', Fw, 0, A1 - A0, y0 + 1.75, y0 + 1.85, 0, 0.03, C('#7a3b2a'), top=False, sides=False)
        # stations of the cross
        for k in range(7):
            uu = 3.0 + k * (A1 - A0 - 6.0) / 6
            g.fbox('gold', Fw, uu - 0.35, uu + 0.35, y0 + 2.4, y0 + 3.3, 0, 0.06, GOLD4, top=True)
            g.fbox('paint', Fw, uu - 0.27, uu + 0.27, y0 + 2.48, y0 + 3.22, 0.06, 0.07, stained(k + 20), top=False, sides=False)
    # small high windows on the south wall (daylight)
    for k in range(4):
        a = 6.0 + k * 6.2 + 3.1
        Fw, uf = plane_frame(g, L, A0, A1, B0, 1)
        g.fbox('sky', Fw, uf(a) - 0.4, uf(a) + 0.4, y0 + 4.25, y0 + 5.65, 0.0, 0.02, SKY, top=False, sides=False)
        g.poly('bakesky', [L.P(a - 0.8, B0 - 2.0, y0 + 3.6), L.P(a + 0.8, B0 - 2.0, y0 + 3.6), L.P(a + 0.8, B0 - 2.0, y0 + 6.3), L.P(a - 0.8, B0 - 2.0, y0 + 6.3)], SKY, L.d(0, 1))
    # the painted ceiling: redwood beams + Ohlone chevron / diamond boards
    cols4 = [C('#9a3a26'), C('#d9b36a'), C('#3f5563'), C('#efe6d2')]
    g.quad_sub('plaster', L.P(A0, B0, yc), L.P(A1, B0, yc), L.P(A1, B1, yc), L.P(A0, B1, yc), C('#e8dcc2'), (0, -1, 0))
    nb = int((A1 - A0) / 1.1)
    for k in range(nb + 1):
        a = A0 + k * (A1 - A0) / nb
        L.box(g, 'wood', a - 0.14, a + 0.14, B0, B1, yc - 0.32, yc, C('#6a4428'), top=False, bottom=True)
        if k < nb:
            a2 = a + (A1 - A0) / nb
            nd = int((B1 - B0) / 0.7)
            for j in range(nd):
                bb0 = B0 + j * (B1 - B0) / nd; bb1 = bb0 + (B1 - B0) / nd; bc = (bb0 + bb1) / 2
                am = (a + a2) / 2
                cc = cols4[(j + k) % 4]
                g.poly('plaster', [L.P(a + 0.16, bc, yc - 0.01), L.P(am, bb1, yc - 0.01), L.P(a2 - 0.16, bc, yc - 0.01), L.P(am, bb0, yc - 0.01)], cc, (0, -1, 0))
        # chevrons painted on the beam soffit
        for j in range(int((B1 - B0) / 0.5)):
            bb = B0 + 0.25 + j * 0.5
            g.poly('wood', [L.P(a - 0.13, bb - 0.2, yc - 0.325), L.P(a, bb, yc - 0.325), L.P(a + 0.13, bb - 0.2, yc - 0.325)], cols4[j % 3], (0, -1, 0))
    # the gilded retablo (1796) behind the altar
    Fr, uf = endwall_frame(L, A1 - 0.05, B0, B1, -1)
    uc = uf(bm)
    g.fbox('gold', Fr, uc - 2.9, uc + 2.9, y0 + 0.9, y0 + 6.3, 0, 0.35, GOLD4, top=True)
    for tier, (yy0, yy1) in enumerate(((y0 + 1.4, y0 + 3.4), (y0 + 3.7, y0 + 5.6))):
        for k in range(3):
            uu = uc + (k - 1) * 1.8
            g.fbox('plaster', Fr, uu - 0.55, uu + 0.55, yy0, yy1, 0.35, 0.4, C('#6b2b24') if k != 1 else C('#2d3e5e'), top=False)
            p = Geo.fp(Fr, uu, 0, 0.62)
            g.lathe('paint', p[0], p[2], [(0.26, yy0), (0.24, yy0 + 1.1), (0.14, yy0 + 1.35), (0.15, yy0 + 1.55), (0.0, yy0 + 1.75)], stained(k + tier * 3 + 90), n=8)
        for k in range(4):
            uu = uc - 2.7 + k * 1.8
            g.lathe('gold', *Geo.fp(Fr, uu, 0, 0.55)[0::2], [(0.14, yy0 - 0.2), (0.11, yy1), (0.18, yy1 + 0.2)], GOLD4, n=8)
        g.fbox('gold', Fr, uc - 3.0, uc + 3.0, yy1 + 0.1, yy1 + 0.35, 0, 0.7, GOLD4, top=True, bottom=True)
    slab = [(uc - 1.4, y0 + 6.3), (uc + 1.4, y0 + 6.3), (uc, y0 + 6.55)]
    g.poly('gold', [Geo.fp(Fr, u, v, 0.36) for u, v in slab], GOLD4, (Fr[2][0], 0, Fr[2][1]))
    L.box(g, 'tiles', A1 - 4.0, A1, B0, B1, y0, y0 + 0.36, C('#8a4a34'), top=True)
    L.box(g, 'plaster', A1 - 2.4, A1 - 1.4, bm - 1.3, bm + 1.3, y0 + 0.36, y0 + 1.36, C('#efe7d6'), top=True)
    L.box(g, 'fabric', A1 - 2.45, A1 - 1.35, bm - 1.35, bm + 1.35, y0 + 1.2, y0 + 1.38, C('#f7f3ea'), top=True)
    g.collider(A1 - 2.5, A1 - 1.3, bm - 1.4, bm + 1.4, y0, y0 + 1.4)
    for bb in (bm - 1.0, bm - 0.35, bm + 0.35, bm + 1.0):
        x, z = L.xz(A1 - 1.9, bb)
        g.lathe('lampI', x, z, [(0.04, y0 + 1.38), (0.04, y0 + 1.75), (0.0, y0 + 1.8)], (1.0, 0.85, 0.55, 1.0), n=4)
    g.light('POINT', A1 - 2.8, y0 + 2.4, bm, 160, (1.0, 0.72, 0.42), radius=0.2)
    g.light('AREA', A1 - 6.0, y0 + 5.8, bm, 250, (1.0, 0.82, 0.6), size=(3.0, 3.0))
    g.decks.append({'pts': [[round(L.xz(A1 - 3.6, bm)[0], 2), round(L.xz(A1 - 3.6, bm)[1], 2), round(y0 + 0.36, 3)], [round(L.xz(A1 - 0.4, bm)[0], 2), round(L.xz(A1 - 0.4, bm)[1], 2), round(y0 + 0.36, 3)]],
                    'width': round(B1 - B0 - 0.4, 2), 'tunnel': True})
    # side altars
    for s in (-1, 1):
        bw_ = B0 if s < 0 else B1
        Fw, uf2 = plane_frame(g, L, A0, A1, bw_, -s)
        uu = uf2(A1 - 7.0)
        g.fbox('gold', Fw, uu - 0.9, uu + 0.9, y0 + 0.9, y0 + 3.9, 0, 0.25, GOLD4, top=True)
        g.fbox('plaster', Fw, uu - 0.45, uu + 0.45, y0 + 1.4, y0 + 3.2, 0.25, 0.28, C('#2d3e5e'), top=False)
        p = Geo.fp(Fw, uu, 0, 0.5)
        g.lathe('paint', p[0], p[2], [(0.22, y0 + 1.5), (0.2, y0 + 2.5), (0.12, y0 + 2.7), (0.13, y0 + 2.85), (0.0, y0 + 3.0)], stained(s + 70), n=8)
        g.fbox('plaster', Fw, uu - 0.8, uu + 0.8, y0, y0 + 0.9, 0, 0.6, C('#e9e0cc'), top=True)
        g.collider(A1 - 7.9, A1 - 6.1, bw_ - 0.7 if s > 0 else bw_, bw_ if s > 0 else bw_ + 0.7, y0, y0 + 1)
    # pews + centre aisle, the choir loft over the entrance
    pews(g, L, A0 + 4.8, A1 - 6.0, B0 + 0.3, bm - 0.75, y0, step=1.0)
    pews(g, L, A0 + 4.8, A1 - 6.0, bm + 0.75, B1 - 0.3, y0, step=1.0)
    L.box(g, 'wood', A0, A0 + 4.2, B0, B1, y0 + 3.6, y0 + 3.85, C('#5a3a22'), top=True, bottom=True)
    for bb in (B0 + 1.2, B1 - 1.2):
        x, z = L.xz(A0 + 4.1, bb); g.lathe('wood', x, z, [(0.14, y0), (0.14, y0 + 3.6)], C('#5a3a22'), n=6)
        g.collider(A0 + 3.9, A0 + 4.3, bb - 0.2, bb + 0.2, y0, y0 + 3.6)
    for k in range(int((B1 - B0) / 0.25)):
        x, z = L.xz(A0 + 4.15, B0 + 0.12 + k * 0.25)
        g.lathe('wood', x, z, [(0.04, y0 + 3.85), (0.05, y0 + 4.2), (0.04, y0 + 4.7)], C('#5a3a22'), n=4)
    L.box(g, 'wood', A0 + 4.05, A0 + 4.25, B0, B1, y0 + 4.7, y0 + 4.8, C('#5a3a22'), top=True, bottom=True)
    # wrought-iron candle chandeliers
    for k in range(3):
        a = A0 + 8.0 + k * 8.5
        x, z = L.xz(a, bm)
        g.lathe('metal', x, z, [(0.015, yc - 0.3), (0.015, y0 + 4.6)], C('#1e1b18'), n=4)
        g.lathe('metal', x, z, [(0.7, y0 + 4.4), (0.72, y0 + 4.5), (0.68, y0 + 4.5)], C('#1e1b18'), n=12)
        for i in range(8):
            t = 2 * math.pi * i / 8
            g.lathe('lampI', x + math.cos(t) * 0.7, z + math.sin(t) * 0.7, [(0.025, y0 + 4.5), (0.025, y0 + 4.75), (0.0, y0 + 4.8)], (1.0, 0.85, 0.55, 1.0), n=4)
        g.lights.append(('POINT', (x, y0 + 4.7, z), 180, (1.0, 0.75, 0.45), 0.5, None, None))
    # open front door: daylight panel
    Fd, ufd = endwall_frame(L, A0 + 0.02, B0, B1, 1)
    g.fbox('sky', Fd, ufd(bm) - 1.15, ufd(bm) + 1.15, y0, y0 + 3.5, -0.02, 0.0, SKY, top=False, sides=False)
    g.poly('bakesky', [L.P(A0 - 2.0, bm - 1.5, y0), L.P(A0 - 2.0, bm + 1.5, y0), L.P(A0 - 2.0, bm + 1.5, y0 + 3.6), L.P(A0 - 2.0, bm - 1.5, y0 + 3.6)], SKY, L.d(1, 0))
    g.floor_y = y0
    door_at(g, 'Mission Dolores', L, -2.6, A0 + 1.4, bm, H(*L.xz(-2.6, bm)) + 0.1, y0)
    return g


# ================================================================================== Castro Theatre: lobby + the auditorium under the tent ceiling
def castro_int(O):
    L, Wf = W4.castro_frame()
    hw = Wf / 2
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Castro Theatre'; g.sky_k = 1.0
    yG = min(sidewalk(*L.xz(a, 1.0)) for a in (-hw, 0, hw)) + 0.05
    y0 = max(yG + 0.08, floor_over(g, -13.2, 13.2, -44.5, -3.3, pad=0.15) + 2.45)
    # ---- lobby
    LA, LB0, LB1, LH = 8.5, -12.5, -3.3, y0 + 6.2
    g.room('lobby', -LA, LA, LB0, LB1, y0, LH)
    g.room('auditorium', -13.2, 13.2, -44.5, LB0, y0 - 2.6, y0 + 14.8, floor=False)
    L.box(g, 'carpet', -LA, LA, LB0, LB1, y0, y0 + 0.02, C('#7a1f24'), top=True)
    g.decks.append({'pts': [[round(L.xz(-LA, (LB0 + LB1) / 2)[0], 2), round(L.xz(-LA, (LB0 + LB1) / 2)[1], 2), round(y0, 3)],
                            [round(L.xz(LA, (LB0 + LB1) / 2)[0], 2), round(L.xz(LA, (LB0 + LB1) / 2)[1], 2), round(y0, 3)]], 'width': LB1 - LB0, 'tunnel': True})
    g.shell(-LA, LA, LB0, LB1, y0, LH, None, None, 'plaster', C('#caa46a'), 'plaster', C('#b98f55'), walls=(False, True, True, True))
    coffers(g, -LA, LA, LB0, LB1, LH - 0.05, 2.2, col=C('#b98f55'), trim=GOLD4)
    for a in (-LA + 0.01, LA - 0.01):
        s = 1 if a < 0 else -1
        for k in range(3):
            b = LB0 + 1.5 + k * 3.0
            L.box(g, 'plaster', a, a + s * 0.05, b - 1.0, b + 1.0, y0 + 1.2, y0 + 4.5, [RUST, TEAL, RED_V][k], top=False)
            L.box(g, 'gold', a, a + s * 0.08, b - 1.1, b + 1.1, y0 + 4.5, y0 + 4.7, GOLD4, top=True, bottom=True)
    chandelier(g, 0.0, (LB0 + LB1) / 2, LH - 0.1, drop=2.0, R=1.1, tiers=3, power=700)
    g.light('POINT', 0.0, y0 + 3.0, LB1 - 1.2, 120, (1.0, 0.85, 0.62), radius=0.3)
    # lobby back wall with three openings into the auditorium
    Fb, ufb = endwall_frame(L, 0.0, 0, 0, 1) if False else (None, None)
    wF = (L.xz(LA, LB0), (-L.u[0], -L.u[1]), (-L.v[0], -L.v[1]))       # plane b = LB0 facing -b (into the auditorium)
    wB = (L.xz(-LA, LB0), L.u, L.v)                                     # facing +b (into the lobby)
    ops = [(-5.2, -3.2), (-1.0, 1.0), (3.2, 5.2)]
    holesB = [[(a0_ + LA, y0), (a1_ + LA, y0), (a1_ + LA, y0 + 3.0), (a0_ + LA, y0 + 3.0)] for a0_, a1_ in ops]
    wall_with_holes(g, wB, 0, 2 * LA, y0, LH, holesB, C('#caa46a'))
    # ---- auditorium
    AW, AB0, AB1 = 13.2, -38.5, LB0            # seating range (b)
    SB0, SB1 = -44.5, -38.5                    # stage house
    yf = lambda b: y0 - 2.4 * max(0.0, min(1.0, (AB1 - b) / (AB1 - (AB0 + 2.0))))
    ystage = y0 - 1.3
    yC, yE = y0 + 14.3, y0 + 11.8               # tent apex / edge
    # raked floor (strips) + decks
    nstr = 14
    for k in range(nstr):
        bb0 = AB1 - (AB1 - AB0) * k / nstr; bb1 = AB1 - (AB1 - AB0) * (k + 1) / nstr
        g.quad_sub('carpet', L.P(-AW, bb0, yf(bb0)), L.P(AW, bb0, yf(bb0)), L.P(AW, bb1, yf(bb1)), L.P(-AW, bb1, yf(bb1)), C('#6b1c22'), (0, 1, 0))
    A_, B_ = L.xz(0.0, AB1), L.xz(0.0, AB0 + 2.0)
    g.decks.append({'pts': [[round(A_[0], 2), round(A_[1], 2), round(y0, 3)], [round(B_[0], 2), round(B_[1], 2), round(y0 - 2.4, 3)]], 'width': 2 * AW - 0.4, 'tunnel': True})
    A_, B_ = L.xz(0.0, AB0 + 2.0), L.xz(0.0, AB0)
    g.decks.append({'pts': [[round(A_[0], 2), round(A_[1], 2), round(y0 - 2.4, 3)], [round(B_[0], 2), round(B_[1], 2), round(y0 - 2.4, 3)]], 'width': 2 * AW - 0.4, 'tunnel': True})
    # auditorium side walls: wainscot, murals between gilded pilasters, sconces
    for s in (-1, 1):
        a_w = s * AW
        Fw, _uf = endwall_frame(L, a_w, SB0, AB1, -s)
        Lw = AB1 - SB0
        radial_panel(g, 'plaster', Fw, 0, Lw, y0 - 3.0, yE + 0.6, None, C('#8a4a2e'))
        g.fbox('wood', Fw, 0, Lw, y0 - 3.0, y0 + 0.9, 0, 0.06, C('#4a1a18'), top=True)
        nm = 6
        for k in range(nm):
            u0 = 2.0 + k * (Lw - 4.0) / nm; u1 = u0 + (Lw - 4.0) / nm
            g.fbox('plaster', Fw, u0 + 0.6, u1 - 0.6, y0 + 2.2, y0 + 8.6, 0, 0.03, [TEAL, C('#8c6a3c'), C('#5a3d5e')][k % 3], top=False, sides=False)
            R = random.Random(k * 13 + s)
            for j in range(9):            # mural figures / landscape blocks
                uu = u0 + 0.9 + j * (u1 - u0 - 1.8) / 8; hh = R.uniform(1.2, 4.2)
                g.fbox('plaster', Fw, uu - 0.25, uu + 0.25, y0 + 2.6, y0 + 2.6 + hh, 0.03, 0.05, (0.55 + 0.4 * R.random(), 0.4 + 0.3 * R.random(), 0.25 + 0.2 * R.random(), 1.0), top=False, sides=False)
            g.fbox('gold', Fw, u0 - 0.35, u0 + 0.35, y0 - 0.5, yE, 0, 0.3, GOLD4, top=True)
            g.fbox('lampI', Fw, (u0 + u1) / 2 - 0.25, (u0 + u1) / 2 + 0.25, y0 + 9.3, y0 + 10.0, 0.05, 0.3, (1.0, 0.8, 0.5, 1.0))
            p = Geo.fp(Fw, (u0 + u1) / 2, y0 + 9.6, 0.8)
            g.lights.append(('POINT', p, 90, (1.0, 0.78, 0.5), 0.2, None, None))
        g.fbox('gold', Fw, 0, Lw, y0 + 8.9, y0 + 9.2, 0, 0.3, GOLD4, top=True, bottom=True)
        g.cols.append(L.col(a_w if s > 0 else a_w - 0.3, a_w + 0.3 if s > 0 else a_w, SB0, AB1, y0 - 3, yE))
    # rear wall (auditorium side) with the openings
    wall_with_holes(g, wF, 0, 2 * LA, y0 - 0.1, yE + 0.6, [[(LA - a1_, y0), (LA - a0_, y0), (LA - a0_, y0 + 3.0), (LA - a1_, y0 + 3.0)] for a0_, a1_ in ops],
                    C('#8a4a2e'))
    for (a0_, a1_) in ((-AW, -LA), (LA, AW)):
        g.poly('plaster', [L.P(a0_, AB1, y0 - 0.1), L.P(a1_, AB1, y0 - 0.1), L.P(a1_, AB1, yE + 0.6), L.P(a0_, AB1, yE + 0.6)], C('#8a4a2e'), L.d(0, -1))
    g.cols.append(L.col(-AW, -LA, AB1 - 0.2, AB1 + 0.3, y0 - 1, yE)); g.cols.append(L.col(LA, AW, AB1 - 0.2, AB1 + 0.3, y0 - 1, yE))
    for (a0_, a1_) in ((-LA, -5.2), (-3.2, -1.0), (1.0, 3.2), (5.2, LA)):
        g.cols.append(L.col(a0_, a1_, LB0 - 0.2, LB0 + 0.2, y0 - 1, LH))
    # seats: three blocks with two aisles
    for (s0, s1) in ((-AW + 0.6, -7.8), (-6.4, 6.4), (7.8, AW - 0.6)):
        nr = int((AB1 - 1.2 - (AB0 + 3.0)) / 0.95)
        for k in range(nr):
            b = AB1 - 1.6 - k * 0.95
            yy = yf(b)
            # individual velvet seats (pan + back + arm caps) on a continuous cast-iron base
            nseat = max(1, int((s1 - s0) / 0.54)); sw = (s1 - s0) / nseat
            for q in range(nseat):
                aq = s0 + (q + 0.5) * sw
                L.box(g, 'd_x_velvet', aq - sw / 2 + 0.04, aq + sw / 2 - 0.04, b - 0.5, b - 0.08, yy + 0.38, yy + 0.49, C('#9a1f28'), top=True)
                L.box(g, 'd_x_velvet', aq - sw / 2 + 0.04, aq + sw / 2 - 0.04, b - 0.12, b, yy + 0.45, yy + 1.0, C('#861a22'), top=True)
                L.box(g, 'd_metal', aq - sw / 2 - 0.02, aq - sw / 2 + 0.03, b - 0.45, b, yy + 0.38, yy + 0.66, C('#2a2320'), top=True)
            L.box(g, 'metal', s0, s1, b - 0.35, b - 0.2, yy, yy + 0.38, C('#2a2320'), top=False)
            if k % 6 == 2 and s0 < 0 < s1: g.spots.append([round(L.xz(-1.2 + (k % 3), b - 0.3)[0], 2), round(yy, 2), round(L.xz(-1.2 + (k % 3), b - 0.3)[1], 2), round(math.atan2(-L.v[0], -L.v[1]) + math.pi, 3), 'sit'])
        g.cols.append(L.col(s0, s1, AB1 - 1.6 - (nr - 1) * 0.95 - 0.5, AB1 - 1.6, y0 - 3, y0 + 1.0))
    # orchestra pit rail + stage apron
    L.box(g, 'wood', -9.0, 9.0, AB0, AB0 + 0.4, y0 - 2.4, ystage + 0.02, C('#3e1a16'), top=True)
    L.box(g, 'wood', -12.0, 12.0, SB0, AB0, y0 - 2.6, ystage, C('#5a3a22'), top=True)
    g.cols.append(L.col(-12.0, 12.0, SB0, AB0 + 0.4, y0 - 3, ystage))
    # proscenium: arched opening framed in gold, organ grilles either side
    Fp = (L.xz(AW, AB0 + 0.02), (-L.u[0], -L.u[1]), (-L.v[0], -L.v[1]))
    Fp = (L.xz(-AW, AB0), L.u, L.v)
    pro = arch_pts(AW, 15.0, ystage, y0 + 4.0, 18)
    radial_panel(g, 'plaster', Fp, 0, 2 * AW, y0 - 2.6, yE + 0.6, pro, C('#7a4a2a'))
    reveal(g, Fp, pro, 1.2, C('#b88a45'), slot='gold')
    for k in range(len(pro) - 3):
        p, q = pro[k + 2], pro[k + 3]
        g.poly('gold', [Geo.fp(Fp, *p, 0.05), Geo.fp(Fp, *q, 0.05), Geo.fp(Fp, q[0] + (q[0] - AW) * 0.07, q[1] + (q[1] - y0 - 4.0) * 0.07, 0.25),
                        Geo.fp(Fp, p[0] + (p[0] - AW) * 0.07, p[1] + (p[1] - y0 - 4.0) * 0.07, 0.25)], GOLD4, (Fp[2][0], 0, Fp[2][1]))
    for s in (-1, 1):
        uc = AW + s * 11.2
        g.fbox('gold', Fp, uc - 1.6, uc + 1.6, y0 + 1.0, y0 + 8.0, 0, 0.25, GOLD4, top=True)
        for k in range(8):
            g.fbox('metal', Fp, uc - 1.4, uc + 1.4, y0 + 1.4 + k * 0.8, y0 + 1.55 + k * 0.8, 0.25, 0.32, C('#3a2a18'), top=True, bottom=True)
        for k in range(5):
            g.fbox('metal', Fp, uc - 1.4 + k * 0.7 - 0.05, uc - 1.4 + k * 0.7 + 0.05, y0 + 1.2, y0 + 7.8, 0.25, 0.32, C('#3a2a18'), top=False)
        g.poly('gold', [Geo.fp(Fp, uc - 1.6, y0 + 8.0, 0.25), Geo.fp(Fp, uc + 1.6, y0 + 8.0, 0.25), Geo.fp(Fp, uc, y0 + 10.2, 0.25)], GOLD4, (Fp[2][0], 0, Fp[2][1]))
    # stage: screen + red house curtain swags
    Fs = (L.xz(-AW, SB0 + 0.6), L.u, L.v)
    g.fbox('screen', Fs, AW - 7.5, AW + 7.5, ystage + 1.2, ystage + 8.0, 0, 0.05, (0.85, 0.82, 0.78, 1.0), top=False, sides=False)
    g.fbox('plaster', Fs, 0, 2 * AW, ystage, yE + 3.0, -0.4, 0.0, C('#141212'), top=False, sides=False)
    L.box(g, 'plaster', -AW, AW, SB0, AB0, y0 + 12.4, y0 + 12.6, C('#141212'), top=False, bottom=True)
    R_ = random.Random(3)     # a film still on the screen: sky, the bay, bridge towers
    for (u0, u1, v0, v1, cc) in ((AW - 7.3, AW + 7.3, 4.2, 6.6, (0.55, 0.7, 0.95, 1.0)), (AW - 7.3, AW + 7.3, 1.4, 2.6, (0.15, 0.3, 0.45, 1.0)),
                                 (AW - 7.3, AW + 7.3, 2.6, 3.3, (0.45, 0.5, 0.4, 1.0)), (AW - 4.2, AW - 3.7, 2.6, 6.2, (0.75, 0.2, 0.12, 1.0)), (AW + 2.6, AW + 3.1, 2.6, 6.2, (0.75, 0.2, 0.12, 1.0)),
                                 (AW - 7.3, AW + 7.3, 3.9, 4.05, (0.75, 0.2, 0.12, 1.0))):
        g.fbox('screen', Fs, u0, u1, ystage + v0, ystage + v1, 0.05, 0.07, cc, top=False, sides=False)
    for s in (-1, 1):
        for k in range(10):
            uu = AW + s * (7.8 + k * 0.28)
            g.fbox('fabric', Fs, uu - 0.16, uu + 0.16, ystage, y0 + 6.2, 0.4 + 0.08 * (k % 2), 0.6 + 0.08 * (k % 2), C('#8e1a1f') if k % 2 else C('#7a151a'), top=True)
    for k in range(7):    # valance swags
        uu = AW - 8.5 + k * 17.0 / 6
        pts = [Geo.fp(Fs, uu - 1.6 + 3.2 * t / 8, y0 + 5.8 - 0.8 * math.sin(math.pi * t / 8), 1.0) for t in range(9)]
        for j in range(8):
            p, q = pts[j], pts[j + 1]
            g.poly('fabric', [p, q, (q[0], q[1] + 0.7, q[2]), (p[0], p[1] + 0.7, p[2])], C('#8e1a1f'), L.d(0, 1))
    g.light('AREA', 0.0, y0 + 5.0, AB0 + 6.0, 700, (1.0, 0.95, 0.85), size=(6.0, 3.0), rot=None)
    # ---- the tent ceiling: radial draped panels from a gilded sunburst, chandelier
    cb = (AB0 + AB1) / 2 + 0.5
    NR = 48
    per = []
    for i in range(NR):
        t = 2 * math.pi * i / NR
        dx, dz = math.cos(t), math.sin(t)
        k_ = min(AW / max(1e-6, abs(dx)), ((AB1 - AB0) / 2 + 0.5) / max(1e-6, abs(dz)))
        per.append((dx * k_, cb + dz * k_))
    TS = 9
    cl = [RUST, GOLD4, TEAL, GOLD4]
    def TP(i, t, s=0.0):
        a0_, b0_ = per[i % NR]; a1_, b1_ = per[(i + 1) % NR]
        aa, bb = a0_ + (a1_ - a0_) * s, b0_ + (b1_ - b0_) * s
        y = yC - (yC - yE) * (t ** 0.85) - 0.55 * math.sin(math.pi * s) * t
        return L.P(aa * t, cb + (bb - cb) * t, y)
    for i in range(NR):
        for k in range(TS):
            t0, t1 = 0.12 + 0.88 * k / TS, 0.12 + 0.88 * (k + 1) / TS
            for j in range(3):
                s0, s1 = j / 3, (j + 1) / 3
                g.poly('plaster', [TP(i, t0, s0), TP(i, t1, s0), TP(i, t1, s1), TP(i, t0, s1)], shade(cl[i % 4], 0.85 + 0.2 * (1 - abs(s0 + s1 - 1))), (0, -1, 0))
        pts = [TP(i, 0.12 + 0.88 * k / 12) for k in range(13)]
        for k in range(12): g.rod('gold', pts[k], pts[k + 1], 0.06, GOLD4, n=4)
    # edge valance (scalloped lambrequin) all round
    for i in range(NR):
        p = TP(i, 1.0); q = TP(i + 1, 1.0)
        g.poly('plaster', [p, q, (q[0], q[1] - 1.0, q[2]), ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 1.5, (p[2] + q[2]) / 2), (p[0], p[1] - 1.0, p[2])], GOLD4, None)
    x, z = L.xz(0.0, cb)
    g.lathe('gold', x, z, [(0.0, yC - 0.2), (2.4, yC - 0.35), (2.6, yC - 0.1), (0.0, yC + 0.3)], GOLD4, n=32)
    for i in range(24):
        t = 2 * math.pi * i / 24
        g.poly('gold', [(x + math.cos(t - 0.06) * 2.6, yC - 0.3, z + math.sin(t - 0.06) * 2.6), (x + math.cos(t) * 4.6, yC - 0.62, z + math.sin(t) * 4.6),
                        (x + math.cos(t + 0.06) * 2.6, yC - 0.3, z + math.sin(t + 0.06) * 2.6)], GOLD4, (0, -1, 0))
    chandelier(g, 0.0, cb, yC - 0.3, drop=4.5, R=2.2, tiers=4, power=2600)
    # cove uplight ring
    for i in range(NR):
        p = TP(i, 0.98); q = TP(i + 1, 0.98)
        g.poly('ceilglow', [(p[0], yE - 1.1, p[2]), (q[0], yE - 1.1, q[2]), (q[0], yE - 0.95, q[2]), (p[0], yE - 0.95, p[2])], (1.0, 0.72, 0.45, 1.0), (0, 1, 0))
    g.floor_y = y0
    door_at(g, 'Castro Theatre', L, 4.2, -5.0, 0.0, sidewalk(*L.xz(0.0, 4.2)), y0) if False else None
    po, pin = L.xz(0.0, 3.8), L.xz(0.0, -5.2)
    g.doors.append({'label': 'Castro Theatre', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(face_yaw(L.v[0], L.v[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-L.v[0], -L.v[1]), 3)]})
    return g


# ================================================================================== Fairmont: the lobby
def fairmont_int(O):
    r = ring_simplify(ring_of(17164), 0.3)
    ea, eb = W4.fair_front(r)
    Fr = Geo.frame(ea, eb); Le = v2len(v2sub(eb, ea))
    g = IGeo(O, Fr); g.name = 'The Fairhaven - Lobby'; g.sky_k = 2.0
    yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    U0, U1, W0, W1 = -7.0, Le + 7.0, -34.0, -10.0
    y0 = max(yG + 0.6, floor_over(g, U0, U1, W0, -1.0, pad=0.1))
    yc = y0 + 8.4
    g.room('lobby', U0, U1, W0, W1, y0, yc)
    g.room('entry', 1.5, Le - 1.5, W1, -1.0, y0, y0 + 5.0)
    checker(g, 'marble', U0, U1, W0, W1, y0, 1.4, C('#efe9dd'), C('#cdbfa6'), diag=True)
    checker(g, 'marble', 1.5, Le - 1.5, W1, -1.0, y0, 1.4, C('#efe9dd'), C('#cdbfa6'), diag=True)
    g.lbox('carpet', U0 + 6, U1 - 6, y0, y0 + 0.02, -25.0, -19.0, C('#7d1e26'))
    g.shell(U0, U1, W0, W1, y0, yc, None, None, 'plaster', C('#f0e6d0'), None, None, walls=(True, True, False, True))
    g.shell(1.5, Le - 1.5, W1, -1.0, y0, y0 + 5.0, None, None, 'plaster', C('#f0e6d0'), 'plaster', C('#efe4cc'), walls=(False, True, True, True))
    # front wall of the hall (at W1) with the entry opening
    Fw = (Geo.fp(Fr, U0, 0, W1)[0::2], Fr[1], (-Fr[2][0], -Fr[2][1]))
    Fw = (Geo.fp(Fr, U1, 0, W1)[0::2], (-Fr[1][0], -Fr[1][1]), (-Fr[2][0], -Fr[2][1]))
    hole = [(U1 - (Le - 1.5), y0), (U1 - 1.5, y0), (U1 - 1.5, y0 + 5.0), (U1 - (Le - 1.5), y0 + 5.0)]
    radial_panel(g, 'plaster', Fw, 0, U1 - U0, y0, yc, hole, C('#f0e6d0'))
    g.collider(U0, 1.5, W1 - 0.2, W1 + 0.3, y0 - 1, yc); g.collider(Le - 1.5, U1, W1 - 0.2, W1 + 0.3, y0 - 1, yc)
    coffers(g, U0, U1, W0, W1, yc - 0.05, 2.4, col=C('#efe2c6'), trim=GOLD4)
    # red faux-marble columns with gilded capitals (two rows)
    for wc in (-15.0, -29.0):
        for k in range(7):
            u = U0 + 4.0 + k * (U1 - U0 - 8.0) / 6
            x, z = g.xz(u, wc)
            g.lathe('marble', x, z, [(0.75, y0), (0.75, y0 + 0.5), (0.55, y0 + 0.8), (0.5, yc - 1.6)], C('#8e2f2a'), n=16)
            g.lathe('gold', x, z, [(0.5, yc - 1.6), (0.62, yc - 1.1), (0.85, yc - 0.6), (0.9, yc - 0.3)], GOLD4, n=16)
            g.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': 0.6, 'hz': 0.6, 'yaw': 0, 'yMin': y0 - 1, 'yMax': yc})
    # grand stair at the back up to a mezzanine landing
    um = (U0 + U1) / 2
    solid_stair(g, um, -30.5, um, -33.5 + 0.0, y0, y0 + 1.2, 6.0, C('#e8dfcf')) if False else None
    g.floor_y = y0
    stairs(g, um, -27.5, um, -32.0, y0, y0 + 2.4, 7.0, C('#7d1e26'), slot='carpet', rail_col=GOLD4)
    g.lbox('marble', um - 6.0, um + 6.0, y0, y0 + 2.4, W0, -32.0, C('#e8dfcf'), top=True)
    a_, b_ = g.xz(um - 5.5, -33.0), g.xz(um + 5.5, -33.0)
    g.decks.append({'pts': [[round(a_[0], 2), round(a_[1], 2), round(y0 + 2.4, 3)], [round(b_[0], 2), round(b_[1], 2), round(y0 + 2.4, 3)]], 'width': 1.9, 'tunnel': True})
    for s in (-1, 1):
        g.collider(um + s * 3.6 - 0.2, um + s * 3.6 + 0.2, -32.0, -27.5, y0, y0 + 3.4)
    g.lbox('wood', um - 1.4, um + 1.4, y0 + 2.4, y0 + 5.6, W0 + 0.02, W0 + 0.14, C('#4a2a1a'))
    g.lbox('gold', um - 1.7, um + 1.7, y0 + 5.6, y0 + 6.1, W0 + 0.02, W0 + 0.22, GOLD4)
    # reception desk, sofas, palms, chandeliers
    g.lbox('wood', U1 - 4.0, U1 - 2.8, y0, y0 + 1.1, -26.0, -18.0, C('#5a3420'), collide=True)
    g.lbox('marble', U1 - 4.1, U1 - 2.7, y0 + 1.1, y0 + 1.18, -26.1, -17.9, C('#2a2a28'))
    g.lbox('wood', U1 - 0.1, U1 - 0.02, y0 + 1.0, y0 + 4.5, -26.0, -18.0, C('#6a3c24'))
    for k, u in enumerate((U0 + 6.5, U0 + 12.0, U1 - 12.0)):
        for w in (-21.0, -23.5):
            sofa(g, u, w, y0, 0.0 if w < -22 else math.pi, [C('#c9a86a'), C('#7d1e26'), C('#2e4a3e')][k])
        table(g, u, -22.25, y0, 0.6, 0.45, C('#2a2a28'))
        g.collider(u - 1.3, u + 1.3, -24.3, -20.2, y0, y0 + 0.9)
    for (u, w) in ((U0 + 1.5, W1 - 1.5), (U1 - 1.5, W1 - 1.5), (U0 + 1.5, W0 + 1.5), (U1 - 1.5, W0 + 1.5)):
        potted_plant(g, u, w, y0, h=2.6, seed=int(abs(u * 7)))
        g.collider(u - 0.5, u + 0.5, w - 0.5, w + 0.5, y0, y0 + 1.5)
    for k in range(3):
        chandelier(g, U0 + (U1 - U0) * (k + 0.5) / 3, -22.0, yc - 0.1, drop=2.2, R=1.5, tiers=3, power=1100)
    for s in (-1, 1):
        for k in range(4):
            w = W0 + 3.5 + k * 6.5
            u = U0 + 0.05 if s < 0 else U1 - 0.05
            g.lbox('lampI', u - 0.1, u + 0.1, y0 + 3.2, y0 + 3.8, w - 0.2, w + 0.2, (1.0, 0.82, 0.55, 1.0))
            g.light('POINT', u - s * 0.6, y0 + 3.5, w, 70, (1.0, 0.8, 0.55), radius=0.2)
    po = Geo.fp(Fr, Le / 2, 0, 9.0); pin = g.xz(Le / 2, -3.5)
    g.doors.append({'label': 'The Fairhaven', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(po[0], po[2]), 2), round(po[2], 2), round(face_yaw(Fr[2][0], Fr[2][1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-Fr[2][0], -Fr[2][1]), 3)]})
    return g


def sofa(g, u, w, y, rot, col, L_=2.4):
    """upholstered sofa on the untextured 'paint' slot (the fabric PBR set is near-black under a lightmap)"""
    from hero_interior import PROCFURN, sofa as _sofa
    if not PROCFURN:
        _sofa(g, u, w, y, rot, col, L=L_); return
    a, t, n = g.F
    ca, sa = math.cos(rot), math.sin(rot)
    tt = (t[0] * ca + n[0] * sa, t[1] * ca + n[1] * sa); nn = (-tt[1], tt[0])
    o = g.xz(u, w)
    F = ((o[0] - tt[0] * L_ / 2 - nn[0] * 0.45, o[1] - tt[1] * L_ / 2 - nn[1] * 0.45), tt, nn)
    g.fbox('paint', F, 0, L_, y + 0.1, y + 0.45, 0, 0.9, col, top=True, back=True)
    g.fbox('paint', F, 0, L_, y + 0.45, y + 0.9, 0.0, 0.22, shade(col, 0.9), top=True, back=True)
    for e in (0, L_ - 0.2):
        g.fbox('paint', F, e, e + 0.2, y + 0.45, y + 0.66, 0.22, 0.9, shade(col, 0.95), top=True, back=True)
    for e in (0.1, L_ - 0.15):
        g.fbox('wood', F, e, e + 0.06, y, y + 0.1, 0.1, 0.8, C('#2a1a10'), top=False)


def table(g, u, w, y, r, h, top_col):
    from hero_interior import table as _t
    _t(g, u, w, y, r, h, top_col)


# ================================================================================== Mark Hopkins: Top of the Mark
def topmark_int(O):
    r = ring_out(ring_simplify(ring_of(17153), 0.4))
    e = max(ring_edges(r), key=lambda e: v2len(v2sub(e[1], e[0])))
    c = centroid(r)
    L = Loc(c, v2norm(v2sub(e[1], e[0])))
    q = [L.loc(*p) for p in r]
    A0, A1, B0, B1 = min(x[0] for x in q) + 0.7, max(x[0] for x in q) - 0.7, min(x[1] for x in q) + 0.7, max(x[1] for x in q) - 0.7
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Top of the Hill'; g.sky_k = 3.5; g.style = 'club'
    yG = min(sidewalk(*p) for i in W4.MH_HIDE[:3] for p in ring_out(ring_of(i))) + 0.1
    y0 = yG + W4.MH['TOWER'] + 0.3; yc = y0 + 4.3
    g.room('lounge', A0, A1, B0, B1, y0, yc)
    g.floor_y = y0
    L.box(g, 'carpet', A0, A1, B0, B1, y0 - 0.3, y0, C('#23304a'), top=True)
    g.decks.append({'pts': [[round(L.xz(A0 + 0.4, 0)[0], 2), round(L.xz(A0 + 0.4, 0)[1], 2), round(y0, 3)], [round(L.xz(A1 - 0.4, 0)[0], 2), round(L.xz(A1 - 0.4, 0)[1], 2), round(y0, 3)]],
                    'width': round(B1 - B0, 2), 'tunnel': True})
    for k in range(int((A1 - A0) / 2.0)):     # patterned carpet border
        a = A0 + 1.0 + k * 2.0
        for bb in (B0 + 1.0, B1 - 1.0):
            x, z = L.xz(a, bb)
            g.lathe('carpet', x, z, [(0.55, y0 + 0.005), (0.0, y0 + 0.005)], C('#b8923e'), n=4)
    # glass walls all round (the real city shows through), slim bronze mullions, bake-only sky outside
    for s in range(4):
        if s == 0: P0, P1 = (A0, B0), (A1, B0)
        elif s == 1: P0, P1 = (A1, B0), (A1, B1)
        elif s == 2: P0, P1 = (A1, B1), (A0, B1)
        else: P0, P1 = (A0, B1), (A0, B0)
        pa, pb = L.xz(*P0), L.xz(*P1)
        Fw = Geo.frame(pa, pb)
        cx_, cz_ = L.xz(0, 0)
        if Fw[2][0] * (cx_ - pa[0]) + Fw[2][1] * (cz_ - pa[1]) < 0: Fw = Geo.frame(pb, pa)
        Lw = v2len(v2sub(pb, pa))
        g.fbox('plaster', Fw, 0, Lw, y0, y0 + 0.5, -0.05, 0.0, C('#e8dcc4'), top=False, sides=False)
        g.fbox('plaster', Fw, 0, Lw, yc - 0.45, yc, -0.05, 0.0, C('#e8dcc4'), top=False, sides=False)
        g.poly('glassI', [Geo.fp(Fw, 0, y0 + 0.5, -0.1), Geo.fp(Fw, Lw, y0 + 0.5, -0.1), Geo.fp(Fw, Lw, yc - 0.45, -0.1), Geo.fp(Fw, 0, yc - 0.45, -0.1)], C('#d4dde0'), (Fw[2][0], 0, Fw[2][1]))
        for k in range(int(Lw / 2.6) + 1):
            u = min(Lw - 0.1, 0.1 + k * 2.6)
            g.fbox('metal', Fw, u - 0.07, u + 0.07, y0 + 0.5, yc - 0.45, -0.12, 0.0, C('#5b4a32'), top=False)
        g.poly('bakesky', [Geo.fp(Fw, -2, y0 - 2, -6.0), Geo.fp(Fw, Lw + 2, y0 - 2, -6.0), Geo.fp(Fw, Lw + 2, yc + 3, -6.0), Geo.fp(Fw, -2, yc + 3, -6.0)], SKY, (Fw[2][0], 0, Fw[2][1]))
        mid = v2lerp(pa, pb, 0.5)
        g.cols.append({'x': round(mid[0] - Fw[2][0] * 0.35, 2), 'z': round(mid[1] - Fw[2][1] * 0.35, 2), 'hx': round(Lw / 2 + 0.3, 2), 'hz': 0.3,
                       'yaw': round(math.atan2(-Fw[1][1], Fw[1][0]), 4), 'yMin': y0 - 1, 'yMax': yc})
    L.box(g, 'plaster', A0, A1, B0, B1, yc, yc + 0.1, C('#f1e8d6'), top=False, bottom=True)
    coffers(g, A0 + 3.0, A1 - 3.0, B0 + 3.0, B1 - 3.0, yc - 0.05, 2.6, col=C('#efe4cc'), trim=GOLD4)
    # the bar: oval-ended counter in the middle, back bar with lit bottles, stools
    L.box(g, 'wood', -4.0, 4.0, -1.6, 1.6, y0, y0 + 1.1, C('#3a2216'), top=True)
    L.box(g, 'marble', -4.15, 4.15, -1.75, 1.75, y0 + 1.1, y0 + 1.16, C('#1d1d1c'), top=True)
    L.box(g, 'wood', -2.6, 2.6, -0.45, 0.45, y0, y0 + 2.6, C('#2e1c12'), top=True)
    for s in (-1, 1):
        for k in range(3):
            L.box(g, 'lampI', -2.4, 2.4, s * 0.46 - 0.02, s * 0.46 + 0.02, y0 + 1.3 + k * 0.45, y0 + 1.33 + k * 0.45, (1.0, 0.8, 0.5, 1.0))
            for j in range(16):
                a = -2.3 + j * 0.3
                x, z = L.xz(a, s * 0.55)
                g.lathe('crystal', x, z, [(0.04, y0 + 1.33 + k * 0.45), (0.04, y0 + 1.55 + k * 0.45), (0.015, y0 + 1.65 + k * 0.45), (0.0, y0 + 1.7 + k * 0.45)],
                        [(0.4, 0.6, 0.3, 1.0), (0.7, 0.45, 0.15, 1.0), (0.85, 0.85, 0.8, 1.0)][(j + k) % 3], n=5)
    g.collider(-4.2, 4.2, -1.8, 1.8, y0 - 1, y0 + 1.2)
    for k in range(10):
        for s in (-1, 1):
            a = -3.6 + k * 0.8
            x, z = L.xz(a, s * 2.3)
            g.lathe('metal', x, z, [(0.22, y0), (0.04, y0 + 0.1), (0.03, y0 + 0.7), (0.2, y0 + 0.72), (0.2, y0 + 0.78), (0.0, y0 + 0.8)], C('#8a6a3a'), n=8)
    g.light('POINT', 0.0, yc - 0.6, 0.0, 300, (1.0, 0.8, 0.55), radius=0.4)
    # lounge: tables + club chairs along the windows, a baby grand
    R = random.Random(5)
    for a in [A0 + 2.2 + k * 3.2 for k in range(int((A1 - A0 - 4.0) / 3.2) + 1)]:
        for bb in (B0 + 1.8, B1 - 1.8):
            table(g, a, bb, y0, 0.45, 0.7, C('#1d1d1c'))
            for d in (-0.9, 0.9):
                sofa(g, a + d, bb, y0, math.pi / 2 if d < 0 else -math.pi / 2, C('#7a5a3a'), L_=0.8)
            g.collider(a - 1.3, a + 1.3, bb - 0.6, bb + 0.6, y0, y0 + 0.8)
    x, z = L.xz(A1 - 3.5, 0.0)
    g.lathe('wood', x, z, [(1.1, y0 + 0.7), (1.1, y0 + 1.0), (0.0, y0 + 1.0)], C('#111111'), n=14, cap_bot=True)
    for (da, db) in ((-0.6, -0.6), (0.6, -0.6), (0.0, 0.7)):
        xx, zz = L.xz(A1 - 3.5 + da, db); g.lathe('wood', xx, zz, [(0.06, y0), (0.06, y0 + 0.7)], C('#111111'), n=4)
    g.collider(A1 - 4.7, A1 - 2.3, -1.2, 1.2, y0, y0 + 1.1)
    light_grid(g, A0 + 1.5, A1 - 1.5, B0 + 1.5, B1 - 1.5, yc - 0.06, step=4.0, power=45, col=(1.0, 0.88, 0.7))
    # elevator doors on the inner wall at the A0 end (arrival point)
    g.lbox('gold', A0 + 0.05, A0 + 0.12, y0, y0 + 2.6, -0.9, 0.9, C('#b8923e'))
    # doors: street door at the tower's corner face -> elevator arrival up here
    a_, b_ = edge_facing(ring_simplify(ring_of(17153), 0.4), -0.81, -0.58)
    n_ = edge_n(a_, b_); m = v2lerp(a_, b_, 0.5)
    po = (m[0] + n_[0] * 2.5, m[1] + n_[1] * 2.5)
    pin = L.xz(A0 + 1.5, 0.0)
    g.doors.append({'label': 'Top of the Hill (elevator)', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(face_yaw(n_[0], n_[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


# ================================================================================== shared: glass-walled room with bake sky
def glass_room(g, L, A0, A1, B0, B1, y0, y1, step=2.4, sill=0.5, mull=C('#2a2826'), frame=C('#e8e2d4'), sky_d=6.0, collide=True):
    cx_, cz_ = L.xz((A0 + A1) / 2, (B0 + B1) / 2)
    for s in range(4):
        P0, P1 = [((A0, B0), (A1, B0)), ((A1, B0), (A1, B1)), ((A1, B1), (A0, B1)), ((A0, B1), (A0, B0))][s]
        pa, pb = L.xz(*P0), L.xz(*P1)
        Fw = Geo.frame(pa, pb)
        if Fw[2][0] * (cx_ - pa[0]) + Fw[2][1] * (cz_ - pa[1]) < 0: Fw = Geo.frame(pb, pa)
        Lw = v2len(v2sub(pb, pa))
        g.fbox('plaster', Fw, 0, Lw, y0, y0 + sill, -0.05, 0.0, frame, top=True, sides=False)
        g.poly('glassI', [Geo.fp(Fw, 0, y0 + sill, -0.08), Geo.fp(Fw, Lw, y0 + sill, -0.08), Geo.fp(Fw, Lw, y1, -0.08), Geo.fp(Fw, 0, y1, -0.08)], C('#d4dde0'), (Fw[2][0], 0, Fw[2][1]))
        for k in range(int(Lw / step) + 1):
            u = min(Lw - 0.06, 0.06 + k * step)
            g.fbox('metal', Fw, u - 0.06, u + 0.06, y0 + sill, y1, -0.12, 0.0, mull, top=False, back=True)
        g.poly('bakesky', [Geo.fp(Fw, -4, y0 - 3, -sky_d), Geo.fp(Fw, Lw + 4, y0 - 3, -sky_d), Geo.fp(Fw, Lw + 4, y1 + 4, -sky_d), Geo.fp(Fw, -4, y1 + 4, -sky_d)], SKY, (Fw[2][0], 0, Fw[2][1]))
        if collide:
            mid = v2lerp(pa, pb, 0.5)
            g.cols.append({'x': round(mid[0] - Fw[2][0] * 0.35, 2), 'z': round(mid[1] - Fw[2][1] * 0.35, 2), 'hx': round(Lw / 2 + 0.3, 2), 'hz': 0.3,
                           'yaw': round(math.atan2(-Fw[1][1], Fw[1][0]), 4), 'yMin': y0 - 1, 'yMax': y1})


# ================================================================================== de Young: Hamon observation floor
def deyoung_int(O):
    qt = W4.dy_quad(42782)
    ct = centroid(qt)
    e = max([(qt[k], qt[(k + 1) % 4]) for k in range(4)], key=lambda e: v2len(v2sub(e[1], e[0])))
    L = Loc(ct, v2norm(v2sub(e[1], e[0])))
    q = [L.loc(*p) for p in qt]
    A0, A1, B0, B1 = min(x[0] for x in q) + 0.6, max(x[0] for x in q) - 0.6, min(x[1] for x in q) + 0.6, max(x[1] for x in q) - 0.6
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'de Young - Hamon Observation Floor'; g.sky_k = 3.5
    yT1 = bld(42782)['base'] + bld(42782)['h']
    y0 = yT1 - 4.2 + 0.25; y1 = yT1 - 0.8
    g.room('observation', A0, A1, B0, B1, y0, y1)
    g.floor_y = y0
    L.box(g, 'wood', A0, A1, B0, B1, y0 - 0.3, y0, C('#a07a52'), top=True)
    g.decks.append({'pts': [[round(L.xz(A0 + 0.3, 0)[0], 2), round(L.xz(A0 + 0.3, 0)[1], 2), round(y0, 3)], [round(L.xz(A1 - 0.3, 0)[0], 2), round(L.xz(A1 - 0.3, 0)[1], 2), round(y0, 3)]],
                    'width': round(B1 - B0, 2), 'tunnel': True})
    glass_room(g, L, A0, A1, B0, B1, y0, y1, step=2.4, sill=0.35, mull=C('#3b3430'), frame=C('#6f4d35'))
    L.box(g, 'plaster', A0, A1, B0, B1, y1, y1 + 0.1, C('#e9e6e0'), top=False, bottom=True)
    for k in range(int((A1 - A0) / 3.0)):
        a = A0 + 1.5 + k * 3.0
        L.box(g, 'lampI', a - 1.0, a + 1.0, -0.15, 0.15, y1 - 0.05, y1, (1.0, 0.92, 0.8, 1.0), top=False, bottom=True)
        g.light('POINT', a, y1 - 0.5, 0.0, 60, (1.0, 0.9, 0.78), radius=0.3)
    # elevator core in the middle, benches along the glass, map panels on the core
    L.box(g, 'metal', -2.2, 2.2, -1.6, 1.6, y0, y1, C('#6f4d35'), top=False)
    g.collider(-2.3, 2.3, -1.7, 1.7, y0 - 1, y1)
    for s in (-1, 1):
        g.lbox('gold', -1.0, 1.0, y0, y0 + 2.4, s * 1.6, s * 1.62, C('#b98a52'))
        for k in range(3):
            a = A0 + 2.5 + k * ((A1 - A0 - 5.0) / 2)
            if abs(a) < 3.5: continue
            bench(g, a, s * (B1 - B0) / 2 * 0.62, y0, along_u=True, L=2.6)
    for s in (-1, 1):
        g.lbox('screen', s * 2.21 - 0.01 * s, s * 2.22, y0 + 1.0, y0 + 2.2, -1.2, 1.2, (0.12, 0.15, 0.2, 1.0))
    g.shot_at(A0 + 4.0, y0 + 1.7, (B0 + B1) / 2 - 3.0, A1, y0 + 0.5, B1)
    Ld = W4.dy_frame()
    po = Ld.xz(0.0, -15.0); pin = L.xz(-3.2, 0.0)
    g.doors.append({'label': 'de Young - Observation Floor (elevator)', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(-Ld.v[0], -Ld.v[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-L.u[0], -L.u[1]), 3)]})
    return g


# ================================================================================== California Academy of Sciences: the rainforest dome
def academy_int(O):
    L, a0, a1, b0, b1 = W4.ac_frame()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'California Academy of Sciences - Rainforest'; g.sky_k = 3.0
    yG = min(H(*L.xz(a, b)) for a in (a0, 0, a1) for b in (b0, b1)) + 0.1
    y0 = max(yG + 0.15, floor_over(g, 18.0, 64.0, -24.0, 26.0, pad=0.1)); yc = y0 + 10.05
    SA, SB, R, yS = 40.0, 2.0, 13.5, y0 + 6.0
    HA0, HA1, HB0, HB1 = 18.0, 64.0, -24.0, 26.0
    g.room('sphere', SA - R, SA + R, SB - R, SB + R, y0, yS + R)
    g.room('hall', HA0, HA1, HB0, HB1, y0, yc)
    g.floor_y = y0
    checker(g, 'concrete', HA0, HA1, HB0, HB1, y0, 3.0, C('#d9d6cf'), C('#cfccc4'), diag=False)
    g.decks += rect_decks_i(L, HA0, HA1, HB0, HB1, y0)
    g.shell(HA0, HA1, HB0, HB1, y0, yc, None, None, 'plaster', C('#eeeeea'), None, None)
    # ceiling with a hole for the sphere, round skylights
    NR = 48
    rc = math.sqrt(R * R - (yc - yS) ** 2) + 0.2
    for i in range(NR):
        t0, t1 = 2 * math.pi * i / NR, 2 * math.pi * (i + 1) / NR
        def edge(t):
            dx, dz = math.cos(t), math.sin(t)
            k = min(((HA1 if dx > 0 else HA0) - SA) / dx if abs(dx) > 1e-6 else 1e9, ((HB1 if dz > 0 else HB0) - SB) / dz if abs(dz) > 1e-6 else 1e9)
            return (SA + dx * k, SB + dz * k)
        e0, e1 = edge(t0), edge(t1)
        g.poly('plaster', [L.P(SA + math.cos(t0) * rc, SB + math.sin(t0) * rc, yc), L.P(SA + math.cos(t1) * rc, SB + math.sin(t1) * rc, yc), L.P(e1[0], e1[1], yc), L.P(e0[0], e0[1], yc)],
               C('#f2f2ee'), (0, -1, 0))
    for (a, b) in ((HA0 + 5, HB0 + 5), (HA0 + 5, HB1 - 5), (HA1 - 5, HB0 + 5), (HA1 - 5, HB1 - 5), (HA0 + 5, SB), (HA1 - 5, SB)):
        x, z = L.xz(a, b)
        g.lathe('sky', x, z, [(1.6, yc - 0.02), (0.0, yc - 0.02)], SKY, n=16)
        g.lathe('bakesky', x, z, [(1.6, yc + 1.5), (0.0, yc + 1.5)], SKY, n=12)
    # the glass sphere: meridian/parallel steel grid
    NM, NP = 24, 14
    def SP(i, j):
        th = 2 * math.pi * i / NM; ph = -math.asin((yS - y0) / R) + (math.pi / 2 + math.asin((yS - y0) / R)) * j / NP
        return L.P(SA + math.cos(th) * math.cos(ph) * R, SB + math.sin(th) * math.cos(ph) * R, yS + math.sin(ph) * R)
    for i in range(NM):
        for j in range(NP):
            g.poly('glassI', [SP(i, j), SP(i + 1, j), SP(i + 1, j + 1), SP(i, j + 1)], C('#d8e4e6'), None)
        for j in range(NP): g.rod('metal', SP(i, j), SP(i, j + 1), 0.07, C('#e6e9e8'), n=4)
    for j in range(1, NP):
        for i in range(NM): g.rod('metal', SP(i, j), SP(i + 1, j), 0.06, C('#e6e9e8'), n=4)
    g.poly('bakesky', [L.P(SA - R, SB - R, yS + R + 5), L.P(SA + R, SB - R, yS + R + 5), L.P(SA + R, SB + R, yS + R + 5), L.P(SA - R, SB + R, yS + R + 5)], SKY, (0, -1, 0))
    # rainforest floor: soil + ferns, a pond, trees, the spiral canopy walk
    x, z = L.xz(SA, SB)
    g.lathe('grass', x, z, [(math.sqrt(R * R - (yS - y0) ** 2), y0 + 0.02), (0.0, y0 + 0.02)], C('#4f5f33'), n=32)
    g.lathe('marble', *L.xz(SA - 3.0, SB + 3.0), [(3.2, y0 + 0.05), (0.0, y0 + 0.05)], C('#24424a'), n=20)
    RS0, RS1 = 8.6, 10.9; rm = (RS0 + RS1) / 2
    rise = 11.5; turns = 1.25; tot = 2 * math.pi * turns; th0 = math.pi * 0.95
    nseg = 60
    for k in range(nseg):
        ta, tb = th0 + tot * k / nseg, th0 + tot * (k + 1) / nseg
        ya, yb = y0 + 0.4 + rise * k / nseg, y0 + 0.4 + rise * (k + 1) / nseg
        Pt = lambda t, r, y: L.P(SA + math.cos(t) * r, SB + math.sin(t) * r, y)
        g.poly('wood', [Pt(ta, RS0, ya), Pt(ta, RS1, ya), Pt(tb, RS1, yb), Pt(tb, RS0, yb)], C('#7a5a3c'), (0, 1, 0))
        g.poly('wood', [Pt(ta, RS0, ya - 0.3), Pt(tb, RS0, yb - 0.3), Pt(tb, RS1, yb - 0.3), Pt(ta, RS1, ya - 0.3)], C('#5d4430'), (0, -1, 0))
        for rr in (RS0, RS1):
            g.rod('metal', Pt(ta, rr, ya + 1.0), Pt(tb, rr, yb + 1.0), 0.03, C('#3a3a38'), n=3)
            if k % 3 == 0: g.rod('metal', Pt(ta, rr, ya), Pt(ta, rr, ya + 1.0), 0.03, C('#3a3a38'), n=3)
        if k % 6 == 0:
            g.rod('metal', Pt(ta, rm, y0), Pt(ta, rm, ya - 0.3), 0.08, C('#e6e9e8'), n=4)
        A_, B_ = L.xz(SA + math.cos(ta) * rm, SB + math.sin(ta) * rm), L.xz(SA + math.cos(tb) * rm, SB + math.sin(tb) * rm)
        g.decks.append({'pts': [[round(A_[0], 2), round(A_[1], 2), round(ya, 3)], [round(B_[0], 2), round(B_[1], 2), round(yb, 3)]], 'width': round(RS1 - RS0, 2), 'tunnel': True})
    # canopy platform at the top
    te = th0 + tot
    g.llathe('wood', SA + math.cos(te) * 5.5, SB + math.sin(te) * 5.5, [(3.2, y0 + 11.9), (0.0, y0 + 11.9)], C('#7a5a3c'), n=16)
    A_ = L.xz(SA + math.cos(te) * 5.5, SB + math.sin(te) * 5.5)
    g.decks.append({'pts': [[round(A_[0], 2), round(A_[1], 2), round(y0 + 11.9, 3)], [round(A_[0] + 0.1, 2), round(A_[1] + 0.1, 2), round(y0 + 11.9, 3)]], 'width': 6.2, 'tunnel': True})
    import hero_wave2 as W2
    R_ = random.Random(21)
    for k in range(14):
        t = 2 * math.pi * k / 14 + R_.uniform(-0.2, 0.2)
        rr = R_.uniform(1.0, 6.5) if k % 2 else R_.uniform(11.3, 11.8)
        x, z = L.xz(SA + math.cos(t) * rr, SB + math.sin(t) * rr)
        h = R_.uniform(7.0, 15.0) if rr < 7 else R_.uniform(4.0, 7.0)
        from hero_props import prop_xz
        prop_xz(g, ['tree:ficus', 'tree:ficus2', 'tree:plane2'][k % 3], x, z, y0, yaw=k * 1.3, fit=(None, h, None))
    for k in range(24):
        t = 2 * math.pi * k / 24; rr = R_.uniform(2.0, 7.5)
        potted_plant(g, SA + math.cos(t) * rr, SB + math.sin(t) * rr, y0 - 0.55, h=1.6, seed=k)
    for k in range(4):
        g.light('POINT', SA + math.cos(k * 1.57) * 5.0, y0 + 14.0, SB + math.sin(k * 1.57) * 5.0, 350, (0.95, 1.0, 0.9), radius=1.0)
    # hall: exhibits (a whale skeleton-ish arch of ribs), benches
    for k in range(18):
        a = HA0 + 4.0 + k * 0.9; hh = 1.4 + 1.6 * math.sin(math.pi * k / 17)
        pa, pb = L.P(a, HB1 - 7.0 - hh * 0.4, y0 + 4.0), L.P(a, HB1 - 7.0 + hh * 0.4, y0 + 4.0)
        g.rod('marble', L.P(a, HB1 - 7.0, y0 + 4.0 + hh * 0.3), pa, 0.07, C('#ece6d6'), n=4); g.rod('marble', L.P(a, HB1 - 7.0, y0 + 4.0 + hh * 0.3), pb, 0.07, C('#ece6d6'), n=4)
    g.rod('marble', L.P(HA0 + 4.0, HB1 - 7.0, y0 + 4.5), L.P(HA0 + 20.0, HB1 - 7.0, y0 + 4.5), 0.14, C('#ece6d6'), n=5)
    for k in range(3): bench(g, HA0 + 6.0 + k * 6.0, HB0 + 4.0, y0, along_u=True, L=3.0)
    light_grid(g, HA0 + 3, HA1 - 3, HB0 + 3, HB1 - 3, yc - 0.05, step=6.0, power=80, col=(1.0, 0.95, 0.88), skip=lambda a, b: math.hypot(a - SA, b - SB) < rc + 1)
    po = L.xz(0.0, b0 - 7.0); pin = L.xz(HA0 + 3.0, SB)
    g.doors.append({'label': 'California Academy of Sciences', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(-L.v[0], -L.v[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


def rect_decks_i(L, a0, a1, b0, b1, y, strip=10.0):
    from hero_wave2 import rect_decks
    return [dict(d, tunnel=True) for d in rect_decks(L, a0, a1, b0, b1, y, strip=strip)]


# ================================================================================== Conservatory of Flowers: the palm house
def conservatory_int(O):
    L = Loc(W4.CF_C, W4.CF_U)
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'Conservatory of Flowers'; g.sky_k = 2.6
    yG = min(H(*L.xz(a, b)) for a in (-36, 0, 36) for b in (-12, 18)) + 0.1
    y0 = max(yG + 0.85, floor_over(g, -26.8, 26.8, -12.4, 18.8, pad=0.1))
    g.room('dome', -9.4, 9.4, -12.4, 8.4, y0, y0 + 16.5)
    g.room('west', -26.8, -9.4, -12.3, -1.7, y0, y0 + 9.0)
    g.room('east', 9.4, 26.8, -12.3, -1.7, y0, y0 + 9.0)
    g.room('porch', -2.3, 2.3, 8.4, 18.8, y0, y0 + 6.5)
    g.floor_y = y0
    for (a0, a1, b0, b1) in ((-9.4, 9.4, -12.4, 8.4), (-26.8, -9.4, -12.3, -1.7), (9.4, 26.8, -12.3, -1.7), (-2.3, 2.3, 8.4, 18.8)):
        L.box(g, 'tiles', a0, a1, b0, b1, y0 - 0.3, y0, C('#b9aa92'), top=True)
        g.decks += rect_decks_i(L, a0, a1, b0, b1, y0, strip=6.0)
    # inner plinth + white frames (the exterior panes are one-sided: from inside you look through to the park)
    segs = [((-26.8, -12.3), (26.8, -12.3)), ((26.8, -12.3), (26.8, -1.7)), ((26.8, -1.7), (9.4, -1.7)), ((-9.4, -1.7), (-26.8, -1.7)), ((-26.8, -1.7), (-26.8, -12.3)),
            ((9.4, 8.4), (2.3, 8.4)), ((-2.3, 8.4), (-9.4, 8.4)), ((2.3, 8.4), (2.3, 18.8)), ((-2.3, 18.8), (-2.3, 8.4)), ((2.3, 18.8), (-2.3, 18.8))]
    for (P0, P1) in segs:
        pa, pb = L.xz(*P0), L.xz(*P1)
        Fw = Geo.frame(pa, pb); Lw = v2len(v2sub(pb, pa))
        mid = L.loc(*v2lerp(pa, pb, 0.5)); inner = (mid[0] * 0.8, mid[1] * 0.8 - 1.0)
        pin_ = L.xz(*inner)
        if Fw[2][0] * (pin_[0] - pa[0]) + Fw[2][1] * (pin_[1] - pa[1]) < 0: Fw = Geo.frame(pb, pa)
        g.fbox('plaster', Fw, 0, Lw, y0, y0 + 0.9, -0.05, 0.1, C('#ebe7dc'), top=True, back=True)
        for k in range(int(Lw / 1.3) + 1):
            g.fbox('paint', Fw, k * 1.3 - 0.05, k * 1.3 + 0.05, y0 + 0.9, y0 + 6.2, -0.1, 0.0, C('#f4f4ef'), top=False, back=True)
        g.poly('bakesky', [Geo.fp(Fw, -3, y0 - 2, -8), Geo.fp(Fw, Lw + 3, y0 - 2, -8), Geo.fp(Fw, Lw + 3, y0 + 14, -8), Geo.fp(Fw, -3, y0 + 14, -8)], SKY, (Fw[2][0], 0, Fw[2][1]))
        m = v2lerp(pa, pb, 0.5)
        g.cols.append({'x': round(m[0] - Fw[2][0] * 0.3, 2), 'z': round(m[1] - Fw[2][1] * 0.3, 2), 'hx': round(Lw / 2 + 0.2, 2), 'hz': 0.3,
                       'yaw': round(math.atan2(-Fw[1][1], Fw[1][0]), 4), 'yMin': y0 - 1, 'yMax': y0 + 6})
    # dome: octagonal glass walls, drum, ribbed dome seen from below; skylight emitters above
    cx, cz = L.xz(0.0, -2.5)
    R0 = 9.6
    for i in range(16):
        t = 2 * math.pi * i / 16
        g.rod('paint', (cx + math.cos(t) * R0, y0, cz + math.sin(t) * R0), (cx + math.cos(t) * R0, y0 + 7.4, cz + math.sin(t) * R0), 0.07, C('#f4f4ef'), n=4)
        prof = [(R0 - 1.0 + 0.0, y0 + 10.6)] + [((R0 - 1.4) * math.cos(math.pi / 2 * k / 8) ** 0.75, y0 + 10.6 + 6.6 * math.sin(math.pi / 2 * k / 8)) for k in range(9)]
        for k in range(len(prof) - 1):
            g.rod('paint', (cx + math.cos(t) * prof[k][0], prof[k][1] - 0.1, cz + math.sin(t) * prof[k][0]), (cx + math.cos(t) * prof[k + 1][0], prof[k + 1][1] - 0.1, cz + math.sin(t) * prof[k + 1][0]),
                  0.08, C('#f4f4ef'), n=4)
    g.lathe('plaster', cx, cz, [(R0 + 0.4, y0 + 7.4), (R0 - 1.0, y0 + 7.6)], C('#f4f4ef'), n=16)
    g.lathe('plaster', cx, cz, [(R0 - 1.0, y0 + 10.2), (R0 - 1.4, y0 + 10.6)], C('#f4f4ef'), n=16)
    for s in (-1, 1):
        g.lathe('bakesky', cx, cz, [(R0 + 6.0, y0 + 22.0), (0.0, y0 + 22.0)], SKY, n=12)
    # plants: a giant palm under the dome, palms + tree ferns, bromeliad beds, a lily pond
    from hero_wave1 import palm
    import hero_wave2 as W2
    from hero_props import prop_xz
    prop_xz(g, 'tree:canary', cx + 0.5, cz - 1.0, y0, fit=(None, 13.5, None))
    R_ = random.Random(33)
    for k in range(7):
        t = 2 * math.pi * k / 7 + 0.3; rr = 5.8
        x, z = cx + math.cos(t) * rr, cz + math.sin(t) * rr
        if L.loc(x, z)[1] > 4.0: continue
        if k % 2: prop_xz(g, ['tree:fanpalm', 'tree:fanpalm2'][k % 4 // 2], x, z, y0, yaw=k, fit=(None, R_.uniform(6.5, 9.0), None))
        else: prop_xz(g, 'tree:ficus2', x, z, y0, yaw=k, fit=(None, R_.uniform(4.0, 6.5), None))
    for s in (-1, 1):
        for k in range(5):
            a = s * (11.5 + k * 3.2)
            prop_xz(g, ['tree:ficus', 'tree:fanpalm2', 'tree:ficus2'][(k + s) % 3], *L.xz(a, -9.5), y0, yaw=k + s, fit=(None, R_.uniform(3.0, 5.0), None))
            potted_plant(g, a + 1.4, -4.2, y0, h=1.5, seed=k + 50 * s)
            for j in range(5):
                x, z = L.xz(a + R_.uniform(-1.2, 1.2), -6.5 + R_.uniform(-0.8, 0.8))
                g.lathe('leaf', x, z, [(0.3, y0), (0.35, y0 + 0.25), (0.0, y0 + 0.4)], [C('#c9383a'), C('#e8c33a'), C('#8e4bb0'), C('#e86f9a')][(k + j) % 4], n=6)
        g.cols.append(L.col(min(s * 10.5, s * 26.0), max(s * 10.5, s * 26.0), -11.5, -7.5, y0 - 1, y0 + 2))
    px, pz = L.xz(0.0, 3.6)
    g.lathe('plaster', px, pz, [(2.6, y0), (2.6, y0 + 0.45), (2.3, y0 + 0.45), (2.3, y0 + 0.2)], C('#cfc7b4'), n=20)
    g.lathe('marble', px, pz, [(2.3, y0 + 0.3), (0.0, y0 + 0.3)], C('#1f3b3a'), n=20)
    for k in range(9):
        t = 2 * math.pi * k / 9
        g.lathe('leaf', px + math.cos(t) * 1.3, pz + math.sin(t) * 1.3, [(0.35, y0 + 0.32), (0.0, y0 + 0.33)], C('#3f7a3a'), n=8)
    g.cols.append({'x': round(px, 2), 'z': round(pz, 2), 'hx': 2.5, 'hz': 2.5, 'yaw': 0, 'yMin': y0 - 1, 'yMax': y0 + 0.5})
    for k in range(3):
        g.light('POINT', 0.0, y0 + 9.0 - k * 2.0, -2.5 + (k - 1) * 3.0, 120, (1.0, 0.95, 0.85), radius=0.8)
    po = L.xz(0.0, 21.5); pin = L.xz(0.0, 12.0)
    g.doors.append({'label': 'Conservatory of Flowers', 'v': 2, 'out': [round(po[0], 2), round(H(*po) + 0.1, 2), round(po[1], 2), round(face_yaw(L.v[0], L.v[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-L.v[0], -L.v[1]), 3)]})
    return g


# ================================================================================== wave-3 extras: SF Main Library atrium, Asian Art Museum grand hall
def ring_slab(g, L, A0, A1, B0, B1, ca, cb, R, y, th, top_slot, top_col, bot_col, NR=40):
    """rectangular floor slab with a round hole (atrium) of radius R at (ca, cb)"""
    for i in range(NR):
        t0, t1 = 2 * math.pi * i / NR, 2 * math.pi * (i + 1) / NR
        def edge(t):
            dx, dz = math.cos(t), math.sin(t)
            k = min(((A1 if dx > 0 else A0) - ca) / dx if abs(dx) > 1e-6 else 1e9, ((B1 if dz > 0 else B0) - cb) / dz if abs(dz) > 1e-6 else 1e9)
            return (ca + dx * k, cb + dz * k)
        e0, e1 = edge(t0), edge(t1)
        i0, i1 = (ca + math.cos(t0) * R, cb + math.sin(t0) * R), (ca + math.cos(t1) * R, cb + math.sin(t1) * R)
        g.poly(top_slot, [L.P(*i0, y), L.P(*i1, y), L.P(*e1, y), L.P(*e0, y)], top_col, (0, 1, 0))
        g.poly('plaster', [L.P(*i0, y - th), L.P(*i1, y - th), L.P(*e1, y - th), L.P(*e0, y - th)], bot_col, (0, -1, 0))
        g.poly('plaster', [L.P(*i0, y - th), L.P(*i1, y - th), L.P(*i1, y), L.P(*i0, y)], C('#f4f3ef'), L.d(-math.cos((t0 + t1) / 2), -math.sin((t0 + t1) / 2)))


def library_int(O):
    import hero_wave3 as W3
    L, a0, a1, b0, b1 = W3.library_rect()
    F = (L.xz(0, 0), L.u, L.v)
    g = IGeo(O, F); g.name = 'San Francisco Public Library'; g.sky_k = 3.0
    ring = L.ring([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])
    yG = min(sidewalk(*p) for p in ring) + 0.1
    top = yG + 33.0
    ca, cb = (a0 + a1) / 2, (b0 + b1) / 2
    A0, A1, B0, B1 = max(a0 + 1.5, ca - 22.0), min(a1 - 1.5, ca + 22.0), max(b0 + 1.5, cb - 17.0), min(b1 - 1.5, cb + 17.0)
    y0 = max(yG + 0.2, floor_over(g, A0, A1, B0, B1, pad=0.1)); g.floor_y = y0
    R = 10.5; yr = top - 1.0
    g.room('atrium', ca - R, ca + R, cb - R, cb + R, y0, yr)
    g.room('hall', A0, A1, B0, B1, y0, y0 + 5.8)
    checker(g, 'marble', A0, A1, B0, B1, y0, 1.5, C('#e9e6df'), C('#d9d4ca'), diag=False)
    g.decks += rect_decks_i(L, A0, A1, B0, B1, y0)
    g.shell(A0, A1, B0, B1, y0, yr, None, None, 'plaster', C('#f4f3ef'), None, None)
    # stacked gallery floors round the atrium, glass balustrades, maple floors
    levels = [y0 + 5.8 + 4.4 * k for k in range(5)]
    for k, yl in enumerate(levels):
        ring_slab(g, L, A0, A1, B0, B1, ca, cb, R, yl, 0.5, 'wood', C('#c9a472'), C('#f1f0ec'))
        for i in range(40):
            t0, t1 = 2 * math.pi * i / 40, 2 * math.pi * (i + 1) / 40
            p0, p1 = L.P(ca + math.cos(t0) * R, cb + math.sin(t0) * R, yl), L.P(ca + math.cos(t1) * R, cb + math.sin(t1) * R, yl)
            g.poly('glassI', [p0, p1, (p1[0], yl + 1.05, p1[2]), (p0[0], yl + 1.05, p0[2])], C('#d8e2e3'), None)
            g.rod('metal', (p0[0], yl + 1.08, p0[2]), (p1[0], yl + 1.08, p1[2]), 0.04, C('#c9c9c4'), n=4)
        # a bridge across the atrium on alternate levels
        if k % 2 == 1:
            th = 0.6 + k * 0.9
            d = (math.cos(th), math.sin(th)); n_ = (-d[1], d[0])
            P_ = lambda s, w, y: L.P(ca + d[0] * s + n_[0] * w, cb + d[1] * s + n_[1] * w, y)
            g.poly('wood', [P_(-R, -1.4, yl), P_(R, -1.4, yl), P_(R, 1.4, yl), P_(-R, 1.4, yl)], C('#c9a472'), (0, 1, 0))
            g.poly('plaster', [P_(-R, -1.4, yl - 0.5), P_(R, -1.4, yl - 0.5), P_(R, 1.4, yl - 0.5), P_(-R, 1.4, yl - 0.5)], C('#f1f0ec'), (0, -1, 0))
            for w in (-1.4, 1.4):
                g.poly('glassI', [P_(-R, w, yl), P_(R, w, yl), P_(R, w, yl + 1.05), P_(-R, w, yl + 1.05)], C('#d8e2e3'), None)
                g.rod('metal', P_(-R, w, yl + 1.08), P_(R, w, yl + 1.08), 0.04, C('#c9c9c4'), n=4)
        light_grid(g, A0 + 2, A1 - 2, B0 + 2, B1 - 2, yl - 0.5, step=7.0, power=40, skip=lambda u, w: math.hypot(u - ca, w - cb) < R + 1.5)
    # skylight: glass oculus with steel ribs, bake sky above
    x, z = L.xz(ca, cb)
    g.lathe('plaster', x, z, [(max(B1 - B0, A1 - A0), yr), (R + 1.0, yr)], C('#f4f3ef'), n=40) if False else ring_slab(g, L, A0, A1, B0, B1, ca, cb, R + 0.5, yr, 0.4, 'plaster', C('#f4f3ef'), C('#f4f3ef'))
    g.lathe('glassI', x, z, [(R + 0.5, yr - 0.4), (7.0, yr + 2.8), (0.0, yr + 4.0)], C('#dfe8ea'), n=32)
    for i in range(16):
        t = 2 * math.pi * i / 16
        pts = [(x + math.cos(t) * r_, y_, z + math.sin(t) * r_) for r_, y_ in ((R + 0.5, yr - 0.4), (7.0, yr + 2.8), (0.0, yr + 4.0))]
        g.rod('metal', pts[0], pts[1], 0.08, C('#b9bdbd'), n=4); g.rod('metal', pts[1], pts[2], 0.08, C('#b9bdbd'), n=4)
    g.lathe('bakesky', x, z, [(R + 6.0, yr + 7.0), (0.0, yr + 7.0)], SKY, n=16)
    # the grand stair to level 2, book stacks along the walls, reading tables
    st0 = ca - R - 2.0
    stairs(g, st0, cb + R + 2.5, st0 - 12.0, cb + R + 2.5, y0, levels[0], 3.6, C('#e9e6df'), slot='marble', rail_col=C('#c9c9c4'))
    for s in (-1, 1):
        g.collider(st0 - 12.0, st0, cb + R + 2.5 + s * 1.9 - 0.15, cb + R + 2.5 + s * 1.9 + 0.15, y0, levels[0] + 1.0)
    R_ = random.Random(12)
    for (u0, u1, w, face) in ((A0 + 1.0, A1 - 1.0, B0 + 0.4, 1), (A0 + 1.0, A1 - 1.0, B1 - 0.4, -1)):
        for k in range(int((u1 - u0) / 1.2)):
            uu = u0 + k * 1.2
            if abs(uu - ca) < 5.0: continue
            g.lbox('wood', uu, uu + 1.1, y0, y0 + 2.2, w - 0.35 * face * 0 - 0.3, w + 0.3, C('#a47b4c'))
            for sh in range(5):
                for bk in range(6):
                    g.lbox('paint', uu + 0.05 + bk * 0.17, uu + 0.2 + bk * 0.17, y0 + 0.1 + sh * 0.42, y0 + 0.35 + sh * 0.42 + R_.uniform(-0.05, 0.03), w - 0.34 if face > 0 else w - 0.2,
                           w - 0.18 if face > 0 else w - 0.34 + 0.16 * 2, [C('#7a2e2a'), C('#2e4a6b'), C('#3f6b3a'), C('#c9a24a'), C('#e8e2d0')][R_.randrange(5)])
        g.collider(u0, u1, w - 0.4, w + 0.4, y0, y0 + 2.2)
    for k in range(4):
        u = ca - 15.0 + k * 10.0
        if abs(u - ca) < R: continue
        for w in (cb - 13.0, cb + 13.0):
            g.lbox('wood', u - 2.0, u + 2.0, y0 + 0.72, y0 + 0.78, w - 0.8, w + 0.8, C('#b88a58'))
            for d in (-1.8, 1.8): g.lbox('metal', u + d - 0.05, u + d + 0.05, y0, y0 + 0.72, w - 0.7, w + 0.7, C('#6b6b66'))
            g.llathe('lampI', u, w, [(0.0, y0 + 1.1), (0.25, y0 + 1.2), (0.0, y0 + 1.25)], (1.0, 0.9, 0.7, 1.0), n=8)
            g.collider(u - 2.0, u + 2.0, w - 0.8, w + 0.8, y0, y0 + 0.8)
    g.light('AREA', ca, yr - 2.0, cb, 3000, (0.95, 0.97, 1.0), size=(14.0, 14.0))
    po, pin = L.xz(a0 - 6.0, cb), L.xz(A0 + 2.0, cb)
    g.doors.append({'label': 'San Francisco Public Library', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po), 2), round(po[1], 2), round(face_yaw(-L.u[0], -L.u[1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(L.u[0], L.u[1]), 3)]})
    return g


def asianart_int(O):
    import hero_wave3 as W3
    r = ring_simplify(ring_of(29848), 0.4)
    a, b = edge_facing(r, -W3.CH_U[0], -W3.CH_U[1])
    Fr = Geo.frame(a, b); Le = v2len(v2sub(b, a)); um = Le / 2
    g = IGeo(O, Fr); g.name = 'Asian Art Museum'; g.sky_k = 2.5
    yG = min(sidewalk(*p) for p in ring_out(r)) + 0.1
    U0, U1, W0, W1 = um - 11.0, um + 11.0, -36.0, -3.0
    y0 = max(yG + 0.3, floor_over(g, U0, U1, W0, W1, pad=0.1)); g.floor_y = y0
    ypn = y0 + 6.8; yc = y0 + 17.5
    g.room('grand hall', U0, U1, W0, W1, y0, yc)
    checker(g, 'marble', U0, U1, W0, W1, y0, 1.2, C('#e6ded0'), C('#c7b9a3'), diag=True)
    g.decks += rect_decks_i(Loc(g.xz(0, 0), Fr[1]), U0, U1, -W1, -W0, y0) if False else []
    g.decks.append({'pts': [[round(g.xz(um, W1 - 0.5)[0], 2), round(g.xz(um, W1 - 0.5)[1], 2), round(y0, 3)], [round(g.xz(um, -14.0)[0], 2), round(g.xz(um, -14.0)[1], 2), round(y0, 3)]],
                    'width': U1 - U0, 'tunnel': True})
    g.shell(U0, U1, W0, W1, y0, yc, None, None, 'plaster', C('#e4dccb'), None, None)
    coffers(g, U0, U1, W0, W1, yc - 0.05, 2.75, col=C('#e9e0cc'), trim=GOLD4)
    # side walls: tall arched windows over a stone dado, giant pilasters
    for (u, face) in ((U0 + 0.02, 1), (U1 - 0.02, -1)):
        for k in range(5):
            w = W1 - 4.0 - k * 6.5
            if face > 0: Fw = (g.xz(u, w + 1.6), (Fr[2][0], Fr[2][1]) if False else (-Fr[2][0], -Fr[2][1]), Fr[1])
            Fw, uf = (g.xz(u, W1), (-Fr[2][0], -Fr[2][1]), Fr[1]) if face > 0 else (g.xz(u, W0), (Fr[2][0], Fr[2][1]), (-Fr[1][0], -Fr[1][1])), None
            uu = (W1 - w) if face > 0 else (w - W0)
            h = arch_pts(uu, 2.6, ypn + 1.0, ypn + 7.0, 10)
            g.poly('sky', [Geo.fp(Fw, p[0], p[1], 0.03) for p in h], SKY, (Fw[2][0], 0, Fw[2][1]))
            g.poly('bakesky', [Geo.fp(Fw, p[0], p[1], -2.0) for p in h], SKY, (Fw[2][0], 0, Fw[2][1]))
            g.fbox('plaster', Fw, uu - 1.6, uu + 1.6, ypn + 0.8, ypn + 1.0, 0.0, 0.3, C('#cbbfa8'), top=True, bottom=True)
            g.fbox('plaster', Fw, uu + 2.6, uu + 3.6, y0, yc - 1.2, 0.0, 0.3, C('#d6ccb8'), top=False)
            g.fbox('gold', Fw, uu + 2.4, uu + 3.8, yc - 1.2, yc - 0.6, 0.0, 0.45, GOLD4, top=True, bottom=True)
        g.lbox('plaster', min(u, u + face * 0.4), max(u, u + face * 0.4), y0, y0 + 1.5, W0, W1, C('#b9ab93'))
    # the grand staircase: central flight to a landing, then the upper landing (piano nobile) across the back
    stairs(g, um, -14.0, um, -24.0, y0, ypn * 0 + y0 + 4.2, 9.0, C('#ddd3c1'), slot='marble', rail_col=C('#6b5a3a'))
    g.lbox('marble', um - 5.0, um + 5.0, y0, y0 + 4.2, -27.0, -24.0, C('#ddd3c1'), top=True)
    a_, b_ = g.xz(um - 4.5, -25.5), g.xz(um + 4.5, -25.5)
    g.decks.append({'pts': [[round(a_[0], 2), round(a_[1], 2), round(y0 + 4.2, 3)], [round(b_[0], 2), round(b_[1], 2), round(y0 + 4.2, 3)]], 'width': 2.8, 'tunnel': True})
    for s in (-1, 1):
        stairs(g, um + s * 6.5, -25.5, um + s * 10.3, -25.5, y0 + 4.2, ypn, 3.0, C('#ddd3c1'), slot='marble', rail_col=C('#6b5a3a')) if False else None
        g.collider(um + s * 4.6 - 0.2, um + s * 4.6 + 0.2, -24.0, -14.0, y0, y0 + 5.2)
    g.lbox('marble', U0, U1, y0, ypn, W0, -27.0, C('#ddd3c1'), top=True)
    g.lbox('marble', um - 5.0, um + 5.0, y0 + 4.2, ypn, -27.05, -27.0, C('#cfc4b0'))
    for s in (-1, 1):
        stairs(g, um + s * 7.5, -24.5, um + s * 7.5, -27.0, y0 + 4.2 * 0 + ypn - 2.6, ypn, 3.0, C('#ddd3c1'), slot='marble') if False else None
    a_, b_ = g.xz(U0 + 1.0, -31.5), g.xz(U1 - 1.0, -31.5)
    g.decks.append({'pts': [[round(a_[0], 2), round(a_[1], 2), round(ypn, 3)], [round(b_[0], 2), round(b_[1], 2), round(ypn, 3)]], 'width': 8.5, 'tunnel': True})
    rail(g, [(U0, -27.0), (um - 5.0, -27.0)], ypn, 1.05, col=C('#6b5a3a'), post=1.0); rail(g, [(um + 5.0, -27.0), (U1, -27.0)], ypn, 1.05, col=C('#6b5a3a'), post=1.0)
    g.collider(U0, um - 5.0, -27.2, -26.8, ypn, ypn + 1.1); g.collider(um + 5.0, U1, -27.2, -26.8, ypn, ypn + 1.1)
    # doorways at the back of the landing + lanterns, a stone Buddha on a plinth
    for k in (-1, 0, 1):
        g.lbox('wood', um + k * 6.0 - 1.4, um + k * 6.0 + 1.4, ypn, ypn + 4.2, W0 + 0.02, W0 + 0.12, C('#3a2a1c'))
        g.lbox('gold', um + k * 6.0 - 1.7, um + k * 6.0 + 1.7, ypn + 4.2, ypn + 4.7, W0 + 0.02, W0 + 0.2, GOLD4)
    for k in range(3):
        chandelier(g, um, W1 - 5.0 - k * 9.0, yc - 0.2, drop=3.0, R=1.2, tiers=2, power=900)
    x, z = g.xz(um, -9.0)
    g.lathe('granite', x, z, [(1.4, y0), (1.4, y0 + 0.9), (1.1, y0 + 1.0)], C('#8f887c'), n=16, cap_bot=False)
    g.lathe('stone', x, z, [(1.1, y0 + 1.0), (1.05, y0 + 1.5), (0.7, y0 + 2.0), (0.5, y0 + 2.5), (0.42, y0 + 2.9), (0.3, y0 + 3.2), (0.0, y0 + 3.4)], C('#6f6a60'), n=16)
    g.collider(um - 1.4, um + 1.4, -10.4, -7.6, y0, y0 + 3.4)
    po = Geo.fp(Fr, um, 0, 6.0); pin = g.xz(um, -4.0)
    g.doors.append({'label': 'Asian Art Museum', 'v': 2, 'out': [round(po[0], 2), round(sidewalk(po[0], po[2]), 2), round(po[2], 2), round(face_yaw(Fr[2][0], Fr[2][1]), 3)],
                    'in': [round(pin[0], 2), round(y0, 2), round(pin[1], 2), round(face_yaw(-Fr[2][0], -Fr[2][1]), 3)]})
    return g


INTERIORS_W3 = {'library': library_int, 'asianArt': asianart_int}


INTERIORS = {'ssPeterPaul': sspp_int, 'grace': grace_int, 'missionDolores': mission_int, 'castro': castro_int, 'fairmont': fairmont_int, 'markHopkins': topmark_int,
             'deYoung': deyoung_int, 'academy': academy_int, 'conservatory': conservatory_int}


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = int(a[a.index('--res') + 1]) if '--res' in a else 2048
    spp = int(a[a.index('--spp') + 1]) if '--spp' in a else 256
    ids = [x for x in a if not x.startswith('--') and not x.isdigit()]
    import hero_wave3 as W3
    for bid in ids:
        if bid in INTERIORS_W3:
            fn, hide = W3.BUILDERS[bid]
            O = W3.ORIGINS[bid]() if bid in W3.ORIGINS else origin_for([ring_of(i) for i in hide])
            run_interior(bid, INTERIORS_W3[bid], O, res=res, samples=spp)
            continue
        fn, hide = BUILDERS[bid]
        O = ORIGINS[bid]() if bid in ORIGINS else origin_for([ring_of(i) for i in hide])
        run_interior(bid, INTERIORS[bid], O, res=res, samples=spp)


if __name__ == '__main__':
    main()
