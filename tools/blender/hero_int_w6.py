"""HILLBOMB hero interiors, wave 6: the landmarks that had no walk-in yet.
Run:  python hero_int_w6.py -- davies legion chase ghirardelli cliffHouse embCenter hobart mills phelan [--res 2048 --spp 384]

Davies Symphony Hall (glass lobby + balcony, the auditorium: terraced orchestra, side tiers, stage, organ, acrylic clouds),
Legion of Honor (rotunda + three skylit galleries), Mission Bay Arena (concourse + bowl around the court, centre-hung board),
Girardi Square chocolate shop + soda fountain, the Cliffside House dining room (glass wall to the ocean),
Embarcadero Center galleria (two shop levels), Hobart / Mills / Phelan office lobbies.
Frames: Loc on the longest edge of the main OSM footprint (a along it, b across); interiors stay inside the footprint,
floors above the terrain (floor_over). Furniture and decor are Poly Haven models (hero_props.prop), materials the CC0
library (x_* slots, int_assets.py). Brand names are fictionalised like the exteriors.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_interior import *   # noqa
from hero_int_w1 import floor_over, rail, stairs, coffers, pilaster, checker, GOLDC   # noqa
from hero_int_w2 import face_yaw, light_grid   # noqa
from hero_int_w3 import solid_stair, dirw   # noqa
from hero_wave1 import origin_for, sidewalk, ring_edges   # noqa
from hero_wave2 import Loc   # noqa
from hero_props import prop   # noqa

SKYC = (0.75, 0.85, 1.0, 1.0)
VELVET = C('#7a1a22'); OAK = C('#8a6038'); WALNUT = C('#4e3220'); CREAMW = C('#ece4d2'); BRASS = C('#b8914a')


# ------------------------------------------------------------------------------------------ helpers
def site_loc(ring_id, flip=False):
    """Loc on the longest edge of the footprint + its local extents"""
    rr = ring_out(ring_simplify(ring_of(ring_id), 0.3))
    e = max(ring_edges(rr), key=lambda e: v2len(v2sub(e[1], e[0])))
    u = v2norm(v2sub(e[1], e[0]))
    if flip: u = (-u[0], -u[1])
    L = Loc(centroid(rr), u)
    loc = [L.loc(*p) for p in rr]
    return L, min(q[0] for q in loc), max(q[0] for q in loc), min(q[1] for q in loc), max(q[1] for q in loc), rr


def mk(O, L, name, sky_k=3.0):
    g = IGeo(O, (L.xz(0, 0), L.u, L.v)); g.name = name; g.sky_k = sky_k
    return g


def door2(g, label, L, a_out, b_out, a_in, b_in, y_in):
    po, pi = L.xz(a_out, b_out), L.xz(a_in, b_in)
    dx, dz = pi[0] - po[0], pi[1] - po[1]
    yaw = round(face_yaw(dx, dz), 3)
    g.doors.append({'label': label, 'v': 2, 'out': [round(po[0], 2), round(sidewalk(*po) + 0.05, 2), round(po[1], 2), yaw],
                    'in': [round(pi[0], 2), round(y_in, 2), round(pi[1], 2), yaw]})


def seat_row_u(g, u, w0, w1, y, face, col=VELVET, pitch=0.56, back=True):
    """a straight row of theatre seats at u (row runs along w), facing +u (face=1) or -u; pan, back, arms"""
    n = int((w1 - w0) / pitch)
    s = 1 if face > 0 else -1
    for k in range(n):
        w = w0 + (k + 0.5) * (w1 - w0) / n
        g.lbox('d_x_velvet', u - 0.25, u + 0.25, y + 0.38, y + 0.48, w - 0.24, w + 0.24, col, top=True, bottom=False)
        if back: g.lbox('d_x_velvet', u - s * 0.3, u - s * 0.2, y + 0.45, y + 1.0, w - 0.24, w + 0.24, shade(col, 0.85), top=True)
        g.lbox('d_metal', u - 0.22, u + 0.18, y, y + 0.38, w - 0.27, w - 0.25, C('#2a2624'), top=False)
    g.lbox('d_metal', u - 0.22, u + 0.18, y, y + 0.38, w1 - 0.04, w1 - 0.02, C('#2a2624'), top=False)


def terrace(g, u0, u1, w0, w1, y0, y1, slot='x_carpet_red', col=C('#6b1f24')):
    """stepped floor between u0 (y0) and u1 (y1), one step per row (rows along w), tread + riser, with a walkable ramp"""
    return


def pendant(g, u, w, y_ceil, y_lamp, asset='modern_ceiling_lamp_01', power=120, col=(1.0, 0.86, 0.66), fit=0.45):
    g.llathe('metal', u, w, [(0.012, y_ceil), (0.012, y_lamp + 0.3)], C('#1a1a1a'), n=4)
    prop(g, asset, u, y_lamp + 0.35, w, fit=(fit, None, None), hang=True, collide=False)
    g.light('POINT', u, y_lamp - 0.1, w, power, col, radius=0.2)


def picture(g, u, w_face, face, y, wd, ht, seed, frame=C('#a8843c')):
    """framed canvas on the wall plane w = w_face, facing +w (face = 1) or -w: gilt frame + a painted field of colour blocks"""
    R = random.Random(seed)
    wf = w_face + face * 0.03
    g.lbox('x_gold', u - wd / 2 - 0.12, u + wd / 2 + 0.12, y - 0.12, y + ht + 0.12, min(w_face, wf + face * 0.04), max(w_face, wf + face * 0.04), frame, top=True, bottom=True)
    if seed >= 40: pals = [[C('#3a2c20'), C('#8a6e4e'), C('#c9b08a'), C('#e8dcc4'), C('#5a4632')]]
    else: pals = [[C('#5b6e3a'), C('#a7b37a'), C('#d9c79a'), C('#3d4a5c'), C('#8fa4b8')], [C('#3a2b20'), C('#7a4a2c'), C('#c99a5b'), C('#e8d6b0'), C('#2c2a28')],
            [C('#27405e'), C('#6d8fb3'), C('#e1d6bf'), C('#b8442e'), C('#f0c25c')]]
    pal = pals[seed % len(pals)]
    g.light('POINT', u, y + ht + 0.5, w_face + face * 0.6, 35 * wd * ht, (1.0, 0.86, 0.66), radius=0.1)    # picture light
    nx, ny = 5, 4
    for i in range(nx):
        for j in range(ny):
            c = pal[(i * 3 + j * 2 + R.randint(0, 2)) % len(pal)]
            c = shade(c, 0.85 + 0.3 * R.random())
            u0, u1 = u - wd / 2 + wd * i / nx, u - wd / 2 + wd * (i + 1) / nx
            y0_, y1_ = y + ht * j / ny, y + ht * (j + 1) / ny
            g.panel_in('d_paint', u0, u1, y0_, y1_, wf + face * 0.05, c, face)


def pedestal_with(g, asset, u, w, y, h=1.1, fit_h=0.75):
    g.lbox('x_marble_white', u - 0.35, u + 0.35, y, y + h, w - 0.35, w + 0.35, C('#e9e4da'), top=True)
    prop(g, asset, u, y + h, w, fit=(None, fit_h, None), collide=False)
    g.collider(u - 0.4, u + 0.4, w - 0.4, w + 0.4, y, y + h + fit_h)


# ================================================================================== Davies Symphony Hall
def davies_int(O):
    L, a0, a1, b0, b1, rr = site_loc(38949)
    g = mk(O, L, 'Davies Symphony Hall', 2.6); g.res = 4096
    g.extra = {'detailIbl': 5.0, 'propIbl': 2.0, 'hideExt': True}     # the exterior's lower roofs cut through the hall volume
    # lobby along the glass facade (local -a side), auditorium behind it; stage at +a
    LA0, LA1 = a0 + 1.5, a0 + 11.0          # lobby band
    HA0, HA1 = LA1 + 1.0, a1 - 2.5          # hall
    B0, B1 = b0 + 3.0, b1 - 3.0
    yG = min(sidewalk(*p) for p in rr) + 0.1
    y0 = max(yG + 0.3, floor_over(g, LA0, HA1, B0, B1, pad=0.15)); g.floor_y = y0
    Hh = 19.0; yc = y0 + Hh
    # ---- lobby: terrazzo, glass wall with mullions, a balcony along the glass, bar, plants
    g.room('lobby', LA0, LA1, B0, B1, y0, y0 + 12.0)
    g.quad_sub('x_terrazzo', g.P(LA0, y0, B0), g.P(LA1, y0, B0), g.P(LA1, y0, B1), g.P(LA0, y0, B1), C('#c9bfae'), (0, 1, 0))
    g.quad_sub('x_plaster', g.P(LA0, y0 + 12.0, B0), g.P(LA1, y0 + 12.0, B0), g.P(LA1, y0 + 12.0, B1), g.P(LA0, y0 + 12.0, B1), C('#eeeae2'), (0, -1, 0))
    for k in range(int((B1 - B0) / 2.4) + 1):
        w = B0 + k * (B1 - B0) / int((B1 - B0) / 2.4)
        g.lbox('metal', LA0 - 0.12, LA0 + 0.05, y0, y0 + 12.0, w - 0.06, w + 0.06, C('#3a3d40'))
    g.poly('glassI', [g.P(LA0, y0, B0), g.P(LA0, y0, B1), g.P(LA0, y0 + 12.0, B1), g.P(LA0, y0 + 12.0, B0)], C('#d4dde0'), dirw(g, 1, 0))
    g.poly('bakesky', [g.P(LA0 - 3.0, y0, B0), g.P(LA0 - 3.0, y0, B1), g.P(LA0 - 3.0, y0 + 14.0, B1), g.P(LA0 - 3.0, y0 + 14.0, B0)], SKYC, dirw(g, 1, 0))
    g.collider(LA0 - 0.4, LA0, B0, B1, y0 - 1, y0 + 12)
    g.collider(LA0, LA1, B0 - 0.4, B0, y0 - 1, y0 + 12); g.collider(LA0, LA1, B1, B1 + 0.4, y0 - 1, y0 + 12)
    for (w0_, w1_) in ((B0, B0 + 0.3), (B1 - 0.3, B1)):
        g.lbox('x_plaster', LA0, LA1, y0, y0 + 12.0, w0_, w1_, C('#e6e1d8'), top=False)
    # lobby balcony (loge level) along the glass: slab, glass balustrade, stair at the +b end
    yl = y0 + 6.0
    g.lbox('x_plaster', LA0 + 0.2, LA0 + 4.2, yl - 0.4, yl, B0 + 0.3, B1 - 7.0, C('#f2efe8'), top=True, bottom=True)
    g.lbox('x_parquet', LA0 + 0.2, LA0 + 4.2, yl, yl + 0.02, B0 + 0.3, B1 - 7.0, C('#a06a3c'))
    g.lbox('glassI', LA0 + 4.15, LA0 + 4.25, yl, yl + 1.05, B0 + 0.3, B1 - 7.0, C('#d4dde0'))
    g.lbox('x_brass', LA0 + 4.12, LA0 + 4.28, yl + 1.05, yl + 1.1, B0 + 0.3, B1 - 7.0, BRASS)
    g.deck_rect(LA0 + 0.3, LA0 + 4.1, B0 + 0.4, B1 - 7.1, yl)
    g.collider(LA0 + 4.1, LA0 + 4.35, B0 + 0.3, B1 - 7.0, yl - 0.3, yl + 1.15)
    solid_stair(g, LA0 + 2.2, B1 - 1.5, LA0 + 2.2, B1 - 7.0, y0, yl, 2.6, C('#d6cec0'), slot='x_marble_cream', cheek=C('#cfc6b6'), bal=True) if False else stairs(g, LA0 + 2.2, B1 - 1.2, LA0 + 2.2, B1 - 7.0, y0, yl, 2.6, C('#d6cec0'), slot='x_marble_cream')
    for q in range(4): g.spot(LA0 + 2.0, yl, B0 + 4 + q * 7.0, LA0, B0 + 4 + q * 7.0, 'stand')
    # bar at the -b end, high tables, plants, posters
    g.lbox('x_veneer', LA1 - 1.4, LA1 - 0.6, y0, y0 + 1.1, B0 + 1.0, B0 + 9.0, C('#5b3a22'), collide=True)
    g.lbox('x_marble_black', LA1 - 1.5, LA1 - 0.5, y0 + 1.1, y0 + 1.16, B0 + 0.9, B0 + 9.1, C('#26262a'))
    for k in range(5): prop(g, 'wine_bottles_01', LA1 - 1.0, y0 + 1.16, B0 + 1.8 + k * 1.6, fit=(0.35, None, None), collide=False)
    for k in range(4): prop(g, 'bar_chair_round_01', LA1 - 2.2, y0, B0 + 2.0 + k * 2.0, face=(LA1, B0 + 2.0 + k * 2.0), fit=(None, 0.8, None), collide=False)
    for (u, w) in ((LA0 + 6.0, B0 + 14.0), (LA0 + 6.0, B0 + 24.0), (LA0 + 6.0, B0 + 34.0)):
        prop(g, 'round_wooden_table_01', u, y0, w, fit=(0.75, None, None))
        g.spot(u + 0.8, y0, w + 0.4, u, w, 'stand'); g.spot(u - 0.7, y0, w - 0.5, u, w, 'stand')
    for (u, w) in ((LA0 + 1.0, B0 + 1.0), (LA0 + 1.0, B1 - 9.0), (LA1 - 1.0, B1 - 1.5)):
        prop(g, 'potted_plant_02', u, y0, w, yaw=u, fit=(None, 2.0, None), collide=False)
    for k in range(6):
        pendant(g, LA0 + 7.5, B0 + 3 + k * (B1 - B0 - 6) / 5, y0 + 12.0, y0 + 7.5, power=200)
    # ---- the hall: wood-panelled walls, raked orchestra, side tiers, rear balcony, stage + organ, acrylic clouds
    g.room('hall', HA0, HA1, B0, B1, y0, yc)
    g.shell(HA0, HA1, B0, B1, y0, yc, None, None, 'x_veneer', C('#6a4a32'), 'x_plaster', C('#e9e3d6'), walls=(True, True, True, False))
    cs = g.cols[-4:]; g.cols = g.cols[:-4] + cs[1:]     # no shell wall / collider on the lobby side: the doorway wall below
    g.lbox('x_veneer', HA0 - 0.05, HA0, y0 + 12.0, yc, B0, B1, C('#5e4634'))
    SA0 = HA1 - 13.0                       # stage front
    ys = y0 + 1.1
    g.lbox('x_wood_floor', SA0, HA1, y0, ys, B0, B1, C('#8a6038'), top=True)
    g.deck_rect(SA0 + 0.2, HA1 - 0.2, B0 + 0.4, B1 - 0.4, ys)
    g.collider(SA0 - 0.1, SA0 + 0.1, B0, B1, y0, ys + 0.4) if False else None
    # orchestra chairs + stands in arcs on the stage, a grand piano
    cu, cw = HA1 - 2.0, (B0 + B1) / 2
    for r_, n_ in ((4.0, 10), (6.2, 15), (8.4, 20), (10.4, 24)):
        for k in range(n_):
            a = math.pi * (0.15 + 0.7 * k / (n_ - 1)) + math.pi / 2
            u = cu + math.cos(a) * r_ * 0.9; w = cw + math.sin(a) * r_ * 1.25
            if u < SA0 + 0.5: continue
            g.lbox('d_wood', u - 0.22, u + 0.22, ys + 0.44, ys + 0.48, w - 0.22, w + 0.22, C('#2b2622'))
            g.lbox('d_wood', u + 0.18, u + 0.22, ys + 0.48, ys + 0.95, w - 0.2, w + 0.2, C('#2b2622'))
            g.lbox('d_metal', u - 0.03, u + 0.03, ys, ys + 0.44, w - 0.03, w + 0.03, C('#1d1d1d'), top=False)
            if k % 2 == 0:
                g.lbox('d_metal', u - 0.62, u - 0.6, ys, ys + 1.05, w - 0.01, w + 0.01, C('#1d1d1d'), top=False)
                g.lbox('d_metal', u - 0.68, u - 0.62, ys + 0.95, ys + 1.3, w - 0.25, w + 0.25, C('#1d1d1d'))
    g.lbox('paint', SA0 + 1.5, SA0 + 4.2, ys + 0.75, ys + 1.0, cw - 3.6, cw - 2.2, C('#0e0e10'))
    g.lbox('paint', SA0 + 1.6, SA0 + 4.1, ys + 1.0, ys + 1.05, cw - 3.5, cw - 2.3, C('#0e0e10'))
    for (du, dw) in ((1.7, -3.5), (4.0, -3.5), (2.8, -2.3)): g.lbox('paint', SA0 + du - 0.05, SA0 + du + 0.05, ys, ys + 0.75, cw + dw - 0.05, cw + dw + 0.05, C('#0e0e10'), top=False)
    g.collider(SA0 + 1.4, SA0 + 4.3, cw - 3.7, cw - 2.1, ys, ys + 1.1)
    # the organ: tiers of polished pipes on the back wall above the choir seats
    for tier, (yb_, n_, hmax) in enumerate(((ys + 4.0, 36, 8.0), (ys + 4.5, 22, 10.5))):
        for k in range(n_):
            w = B0 + 4.0 + (B1 - B0 - 8.0) * k / (n_ - 1)
            hgt = hmax * (0.45 + 0.55 * (1 - abs(2 * k / (n_ - 1) - 1) ** 1.6))
            r_ = 0.12 + 0.1 * (hgt / hmax)
            uu = HA1 - 0.6 - tier * 0.5
            g.llathe('d_x_brass', uu, w, [(r_, yb_), (r_, yb_ + hgt), (r_ * 0.6, yb_ + hgt + 0.2), (0.0, yb_ + hgt + 0.25)], C('#c9c3b5'), n=10)
            g.llathe('d_metal', uu, w, [(0.0, yb_ - 0.5), (r_ * 0.8, yb_ - 0.2), (r_, yb_)], C('#8f8a80'), n=8)
    g.lbox('x_veneer', HA1 - 3.0, HA1, ys, ys + 3.6, B0 + 2.0, B1 - 2.0, C('#5e4634'))
    for q in range(4): seat_row_u(g, HA1 - 2.6 + q * 0.6 * 0, B0 + 3.0, B1 - 3.0, ys + 0.9 * q, -1, col=C('#5b1820'), back=False) if False else None
    # acrylic reflector clouds over the stage
    for k in range(16):
        a = 2 * math.pi * k / 16
        u = SA0 + 5.5 + math.cos(a) * 3.2 + (k % 3) * 0.6; w = cw + math.sin(a) * 6.5
        yy = y0 + 13.0 + (k % 4) * 0.5
        g.llathe('glassI', u, w, [(0.0, yy), (1.1, yy + 0.08), (1.25, yy + 0.18), (0.0, yy + 0.22)], C('#dfe6ea'), n=16)
        g.llathe('metal', u, w, [(0.01, yy + 0.2), (0.01, yc)], C('#2a2a2a'), n=3)
    # orchestra seating: raked rows facing the stage
    nrow = 24; rise = 0.16; row_d = 0.95
    ur0 = SA0 - 2.5
    # hall floor (the shell has none): in front of the stage, under the rows, behind the last row
    g.quad_sub('x_carpet_red', g.P(HA0, y0, B0), g.P(SA0, y0, B0), g.P(SA0, y0, B1), g.P(HA0, y0, B1), C('#5a1c22'), (0, 1, 0))
    u_last, y_last = ur0, y0
    for r in range(nrow):
        u = ur0 - r * row_d; yr = y0 + r * rise
        if u < HA0 + 3.0: break
        u_last, y_last = u, yr
        # tread (carpet) for this row + riser, wall to wall (a 0.3 m strip at the walls showed the ground below)
        g.lbox('x_carpet_red', u - row_d / 2, u + row_d / 2, y0, yr, B0, B1, C('#5a1c22'), top=True, sides=True)
        for (w0_, w1_) in ((B0 + 2.0, cw - 1.0), (cw + 1.0, B1 - 2.0)):
            seat_row_u(g, u, w0_, w1_, yr, 1)
        if r % 4 == 1: g.spot(u, yr, B0 + 2.0 + (r * 3.7) % (cw - B0 - 4.0), HA1, cw, 'sit')
    # behind the last row up to the back wall: a landing at the top row's height (was an open pit to the ground)
    if u_last - row_d / 2 > HA0:
        g.lbox('x_carpet_red', HA0, u_last - row_d / 2, y0, y_last, B0, B1, C('#5a1c22'), top=True, sides=True)
        g.deck_rect(HA0 + 0.2, u_last - row_d / 2, B0 + 0.4, B1 - 0.4, y_last)
    yrear = y0 + (nrow - 1) * rise
    for r in range(nrow - 1):
        u = ur0 - r * row_d - row_d / 2; ya, yb = y0 + r * rise, y0 + (r + 1) * rise
        for wm in (cw, B0 + 1.0, B1 - 1.0):
            g.decks.append({'pts': [[round(g.xz(u + row_d, wm)[0], 2), round(g.xz(u + row_d, wm)[1], 2), round(ya, 3)], [round(g.xz(u, wm)[0], 2), round(g.xz(u, wm)[1], 2), round(yb, 3)]],
                            'width': 1.8 if wm == cw else 1.6, 'tunnel': True})
    # side tiers (terrace boxes) on both walls with a row of seats, gilt fronts, walkable
    for (w0_, w1_, face) in ((B0, B0 + 3.4, 1), (B1 - 3.4, B1, -1)):
        for ty in (y0 + 5.5, y0 + 9.5):
            g.lbox('x_veneer', HA0 + 2.0, SA0 - 1.0, ty - 0.5, ty, w0_, w1_, C('#5e4634'), top=True, bottom=True)
            g.lbox('x_carpet_red', HA0 + 2.0, SA0 - 1.0, ty, ty + 0.02, w0_, w1_, C('#5a1c22'))
            wf = w1_ if face > 0 else w0_
            g.lbox('x_veneer', HA0 + 2.0, SA0 - 1.0, ty, ty + 1.0, min(wf, wf - face * 0.15), max(wf, wf - face * 0.15), C('#5e4634'), top=True)
            g.lbox('x_gold', HA0 + 2.0, SA0 - 1.0, ty + 0.95, ty + 1.02, min(wf, wf - face * 0.2), max(wf, wf - face * 0.2), BRASS)
            for k in range(int((SA0 - 1.0 - HA0 - 2.0) / 0.6)):
                u = HA0 + 2.4 + k * 0.6; wc_ = (w0_ + w1_) / 2 + face * 0.4
                g.lbox('d_x_velvet', u - 0.24, u + 0.24, ty + 0.38, ty + 0.46, wc_ - 0.25, wc_ + 0.25, VELVET)
                g.lbox('d_x_velvet', u - 0.24, u + 0.24, ty + 0.45, ty + 0.95, wc_ - face * 0.3 - 0.05, wc_ - face * 0.3 + 0.05, shade(VELVET, 0.85))
            g.deck_rect(HA0 + 2.1, SA0 - 1.1, w0_ + 0.1, w1_ - 0.1, ty)
            g.collider(HA0 + 2.0, SA0 - 1.0, min(wf, wf - face * 0.25), max(wf, wf - face * 0.25), ty - 0.3, ty + 1.1)
            for q in range(3): g.spot(HA0 + 6 + q * 8.0, ty, (w0_ + w1_) / 2 - face * 0.6, SA0 + 4, cw, 'stand')
    # rear balcony (first tier) over the back of the orchestra
    yt = y0 + 7.2
    g.lbox('x_veneer', HA0, HA0 + 7.0, yt - 0.6, yt, B0 + 3.4, B1 - 3.4, C('#5e4634'), top=True, bottom=True)
    for q in range(5):
        uq = HA0 + 0.8 + q * 1.2; yq = yt + q * 0.35
        g.lbox('x_carpet_red', uq - 0.6, uq + 0.6, yt, yq, B0 + 3.4, B1 - 3.4, C('#5a1c22'), top=True)
        seat_row_u(g, uq, B0 + 4.0, B1 - 4.0, yq, 1)
    g.lbox('x_gold', HA0 + 6.9, HA0 + 7.05, yt, yt + 1.0, B0 + 3.4, B1 - 3.4, BRASS, top=True)
    g.collider(HA0 + 6.9, HA0 + 7.1, B0 + 3.4, B1 - 3.4, yt - 0.3, yt + 1.1)
    g.deck_rect(HA0 + 0.2, HA0 + 6.8, B0 + 3.5, B1 - 3.5, yt)
    g.link((LA0 + 2.0, yl, B0 + 2.0, LA0 + 4.0, B0 + 2.0), (HA0 + 1.0, yt, B0 + 4.5, HA0 + 6.0, B0 + 4.5), 'First tier', 'Loge lobby', verb='walk to')
    g.link((LA1 - 0.5, y0, B1 - 2.0, HA0 + 3.0, B1 - 2.0), (HA0 + 2.5, y0 + 6.0 - 0.5 + 0.5, B1 - 1.7, SA0, B1 - 1.7), 'Terrace boxes', 'Lobby', verb='walk to')
    # lighting: warm house lights in the ceiling coffers, stage wash, wall sconces
    for i in range(4):
        for j in range(3):
            u = HA0 + 4 + i * (SA0 - HA0 - 8) / 3; w = B0 + 6 + j * (B1 - B0 - 12) / 2
            g.lathe('lampI', *g.xz(u, w), [(0.0, yc - 0.05), (0.6, yc - 0.05), (0.0, yc - 0.04)], (1.0, 0.86, 0.62, 1.0), n=12)
            g.light('POINT', u, yc - 1.0, w, 700, (1.0, 0.84, 0.62), radius=0.6)
    # house lights ON (concert before the downbeat): downlight grid in the ceiling + cove strips, the stage washed by front spots
    g.light('AREA', SA0 + 6.0, y0 + 14.0, cw, 16000, (1.0, 0.92, 0.8), size=(10.0, 14.0))
    for i in range(5):
        g.light('AREA', HA0 + 3.0 + i * (SA0 - HA0 - 4.0) / 4, yc - 0.6, cw, 14000, (1.0, 0.86, 0.66), size=(6.0, B1 - B0 - 6.0))
    for i in range(10):
        for j in range(7):
            u = HA0 + 2.0 + i * (SA0 - HA0 - 3.0) / 9; w = B0 + 3.0 + j * (B1 - B0 - 6.0) / 6
            g.lathe('lampI', *g.xz(u, w), [(0.0, yc - 0.03), (0.16, yc - 0.03), (0.0, yc - 0.02)], (1.0, 0.88, 0.68, 1.0), n=8)
    for (wv, f_) in ((B0 + 0.2, 1), (B1 - 0.2, -1)):
        g.lbox('ceilglow', HA0, SA0, yc - 0.9, yc - 0.8, min(wv, wv + f_ * 0.6), max(wv, wv + f_ * 0.6), (1.0, 0.86, 0.62, 1.0), top=False, bottom=True)
        g.light('AREA', (HA0 + SA0) / 2, yc - 1.0, wv + f_ * 1.0, 6000, (1.0, 0.84, 0.6), size=(SA0 - HA0, 1.0))
    for k in range(6):     # front-of-house spots on the stage
        g.lights.append(('SPOT', g.P(SA0 - 14.0, yc - 2.0, B0 + 6 + k * (B1 - B0 - 12) / 5), 9000, (1.0, 0.94, 0.85), 0.2, None, (math.radians(55), 0, math.atan2(-g.F[1][0], -g.F[1][1]))))
    for k in range(6):
        for (wv, face) in ((B0 + 0.1, 1), (B1 - 0.1, -1)):
            u = HA0 + 3 + k * (SA0 - HA0 - 6) / 5
            g.lbox('lampI', u - 0.15, u + 0.15, y0 + 3.0, y0 + 3.5, min(wv, wv + face * 0.15), max(wv, wv + face * 0.15), (1.0, 0.82, 0.55, 1.0))
            g.light('POINT', u, y0 + 3.2, wv + face * 0.5, 50, (1.0, 0.8, 0.55), radius=0.1)
    # wall between lobby and hall with three doorways
    for (w0_, w1_) in ((B0, B0 + 6.0), (B0 + 9.0, cw - 1.5), (cw + 1.5, B1 - 9.0), (B1 - 6.0, B1)):
        g.lbox('x_plaster', LA1, HA0, y0, y0 + 12.0, w0_, w1_, C('#ebe6dc'))
        g.lbox('x_veneer', LA1 - 0.06, HA0 + 0.06, y0, y0 + 3.3, w1_ - 0.25, w1_, C('#5e4634')) if w1_ < B1 else None
        g.lbox('x_veneer', LA1 - 0.06, HA0 + 0.06, y0, y0 + 3.3, w0_, w0_ + 0.25, C('#5e4634')) if w0_ > B0 else None
        g.collider(LA1, HA0, w0_, w1_, y0 - 1, y0 + 12.0)
    g.lbox('x_plaster', LA1, HA0, y0 + 3.2, y0 + 12.0, B0 + 6.0, B1 - 6.0, C('#ebe6dc'), bottom=True)
    g.lbox('x_veneer', LA1 - 0.06, HA0 + 0.06, y0 + 3.2, y0 + 3.45, B0 + 6.0, B1 - 6.0, C('#5e4634'), bottom=True)
    g.shot_at(HA0 + 7.0, y0 + 8.3, B0 + 3.6, HA1 - 10.0, y0 + 0.8, cw + 6.0)      # over the terrace-box rail, across the orchestra
    door2(g, 'Davies Symphony Hall', L, a0 - 4.0, (B0 + B1) / 2 + 6.0, LA0 + 2.0, (B0 + B1) / 2 + 6.0, y0)
    g.probe = {'room': 1}
    return g


# ================================================================================== Legion of Honor: rotunda + three skylit galleries
def legion_int(O):
    L, a0, a1, b0, b1, rr = site_loc(17803)
    g = mk(O, L, 'Legion of Honor - Galleries', 3.2); g.res = 4096
    bm_ = (b0 + b1) / 2
    B0, B1 = max(b0 + 2.0, bm_ - 7.0), min(b1 - 2.0, bm_ + 7.0)
    A0, A1 = a0 + 2.0, a1 - 2.0
    yG = min(sidewalk(*p) for p in rr) + 0.1
    y0 = max(yG + 0.3, floor_over(g, A0, A1, B0, B1, pad=0.15)); g.floor_y = y0
    H1 = 7.5
    nrm = 5; seg = (A1 - A0) / nrm
    walls = [C('#9a4040'), C('#5a7a66'), C('#8a5468'), C('#9a4040'), C('#4e6a7a')]
    for i in range(nrm):
        u0, u1 = A0 + i * seg, A0 + (i + 1) * seg
        g.room('gallery%d' % i, u0, u1, B0, B1, y0, y0 + H1 + 3.0)
        g.quad_sub('x_parquet', g.P(u0, y0, B0), g.P(u1, y0, B0), g.P(u1, y0, B1), g.P(u0, y0, B1), C('#9a6a40'), (0, 1, 0))
        # walls: damask fabric above a marble dado, picture rail, deep cornice; cove up to the skylight lantern
        for (wv, face) in ((B0, 1), (B1, -1)):
            g.panel_in('x_jacquard', u0, u1, y0 + 1.0, y0 + H1 - 1.0, wv, walls[i], face)
            g.panel_in('x_marble_grey', u0, u1, y0, y0 + 1.0, wv + face * 0.02, C('#cfc7bb'), face)
            g.lbox('x_gold', u0, u1, y0 + H1 - 1.25, y0 + H1 - 1.15, min(wv, wv + face * 0.08), max(wv, wv + face * 0.08), BRASS)
            g.lbox('x_plaster', u0, u1, y0 + H1 - 1.0, y0 + H1, min(wv, wv + face * 0.5), max(wv, wv + face * 0.5), CREAMW, top=False, bottom=True)
            g.collider(u0, u1, min(wv, wv - face * 0.4), max(wv, wv - face * 0.4), y0 - 1, y0 + H1)
            # paintings: big gilt frames (Poly Haven) and canvases between
            for k in range(3):
                u = u0 + seg * (k + 0.5) / 3
                if k == 1:
                    prop(g, 'fancy_picture_frame_01' if (i + (face > 0)) % 2 else 'fancy_picture_frame_02', u, y0 + 2.2, wv + face * 0.06, face=(u, wv + face * 5), fit=(2.2, None, None), collide=False)
                else:
                    picture(g, u, wv, face, y0 + 2.0, 1.6, 1.2 + (k % 2) * 0.6, seed=i * 10 + k + (face > 0) * 5)
            # coved ceiling up to the lantern
            for j in range(6):
                t0, t1 = j / 6 * math.pi / 2, (j + 1) / 6 * math.pi / 2
                r = 3.0
                P = lambda uu, t: g.P(uu, y0 + H1 + math.sin(t) * r * 0.8, wv + face * (0.5 + (1 - math.cos(t)) * r))
                g.poly('x_plaster', [P(u0, t0), P(u1, t0), P(u1, t1), P(u0, t1)], CREAMW, dirw(g, 0, face, -0.5))
        # end walls with the doorway to the next room (classical door frame)
        for (ue, face) in ((u0, 1), (u1, -1)):
            if (face > 0 and i == 0) or (face < 0 and i == nrm - 1):
                g.panel_u('x_jacquard', B0, B1, y0, y0 + H1, ue, walls[i], face)
                g.collider(min(ue, ue - face * 0.4), max(ue, ue - face * 0.4), B0, B1, y0 - 1, y0 + H1)
                continue
            wm = (B0 + B1) / 2
            for (w0_, w1_) in ((B0, wm - 1.6), (wm + 1.6, B1)):
                g.panel_u('x_jacquard', w0_, w1_, y0, y0 + H1, ue, walls[i], face)
            g.panel_u('x_jacquard', wm - 1.6, wm + 1.6, y0 + 4.2, y0 + H1, ue, walls[i], face)
            g.lbox('x_marble_cream', ue - 0.25, ue + 0.25, y0, y0 + 4.5, wm - 2.0, wm - 1.6, C('#e6dfd2')); g.lbox('x_marble_cream', ue - 0.25, ue + 0.25, y0, y0 + 4.5, wm + 1.6, wm + 2.0, C('#e6dfd2'))
            g.lbox('x_marble_cream', ue - 0.3, ue + 0.3, y0 + 4.2, y0 + 4.9, wm - 2.2, wm + 2.2, C('#e6dfd2'))
            g.collider(ue - 0.3, ue + 0.3, B0, wm - 1.6, y0 - 1, y0 + H1); g.collider(ue - 0.3, ue + 0.3, wm + 1.6, B1, y0 - 1, y0 + H1)
        # the skylight lantern: frosted laylight (emissive by day) under the glass roof + bake sky
        um, wm = (u0 + u1) / 2, (B0 + B1) / 2
        yl_ = y0 + H1 + 2.4
        g.poly('sky', [g.P(u0 + 0.5, yl_, B0 + 4.0), g.P(u1 - 0.5, yl_, B0 + 4.0), g.P(u1 - 0.5, yl_, B1 - 4.0), g.P(u0 + 0.5, yl_, B1 - 4.0)], (0.92, 0.94, 0.96, 1.0), (0, -1, 0))
        for k in range(1, 8):
            uu = u0 + 0.5 + (u1 - u0 - 1.0) * k / 8
            g.lbox('metal', uu - 0.04, uu + 0.04, yl_ - 0.08, yl_ - 0.01, B0 + 4.0, B1 - 4.0, C('#c9c2b2'), top=False, bottom=True)
        g.poly('bakesky', [g.P(u0, yl_ + 3.0, B0), g.P(u1, yl_ + 3.0, B0), g.P(u1, yl_ + 3.0, B1), g.P(u0, yl_ + 3.0, B1)], SKYC, (0, -1, 0))
        g.light('AREA', um, yl_ - 0.2, wm, 900, (0.85, 0.9, 1.0), size=(seg - 2, B1 - B0 - 8))
        g.light('AREA', um, yl_ - 0.4, wm, 600, (1.0, 0.86, 0.68), size=(seg - 2, B1 - B0 - 8), day=False)
        for (wv_, f_) in ((B0, 1), (B1, -1)):     # cove uplights washing the walls
            g.light('AREA', um, y0 + H1 - 0.6, wv_ + f_ * 1.2, 500, (1.0, 0.88, 0.72), size=(seg - 1.0, 0.8))
        # sculpture down the middle, benches, visitors
        pedestal_with(g, ['marble_bust_01', 'gothic_statue', 'horse_statue_01', 'marble_bust_01', 'bronze_whale_statue'][i], um, wm, y0, h=1.0, fit_h=[0.8, 1.4, 0.7, 0.8, 0.6][i])
        for s_ in (-1, 1):
            prop(g, 'painted_wooden_bench', um + s_ * seg * 0.28, y0, wm, yaw=math.pi / 2, fit=(1.8, None, None))
        for q in range(3): g.spot(u0 + seg * (q + 0.5) / 3, y0, B0 + 2.6 + (q % 2) * (B1 - B0 - 5.2), u0 + seg * (q + 0.5) / 3, B0 if q % 2 == 0 else B1, 'stand')
    # vestibule at the +b court side: a doorway in the long wall of the middle gallery
    um = A0 + seg * 2.5
    g.shot_at(A0 + seg * 2.1, y0 + 1.7, (B0 + B1) / 2 + 3.0, A0 + seg * 3.6, y0 + 2.2, (B0 + B1) / 2 - 1.0)
    door2(g, 'Legion of Honor', L, um, b1 + 6.0, um, B1 - 2.5, y0)
    g.probe = {'room': 2}
    return g


# ================================================================================== Mission Bay Arena: concourse + bowl
def chase_int(O):
    L, a0, a1, b0, b1, rr = site_loc(49968)
    g = mk(O, L, 'Mission Bay Arena', 1.5); g.res = 4096
    ca, cb = (a0 + a1) / 2, (b0 + b1) / 2
    yG = min(sidewalk(*p) for p in rr) + 0.1
    y0 = max(yG + 0.3, floor_over(g, ca - 40, ca + 40, cb - 32, cb + 32, pad=0.15)); g.floor_y = y0
    # bowl: ellipses (semi-axes ra, rb) from the court edge outward; lower bowl to the concourse, upper bowl above it
    E = lambda t, ra, rb: g.xz(ca + math.cos(t) * ra, cb + math.sin(t) * rb)     # ellipse point -> world (x, z)
    CX = g.xz(ca, cb)
    IN = lambda p: (CX[0] - p[0], 0, CX[1] - p[1])          # face the court
    OUT = lambda p: (p[0] - CX[0], 0, p[1] - CX[1])         # face away (the concourse side)
    NS = 72
    ra0, rb0 = 22.0, 15.0              # court + apron
    nl, nu = 18, 20
    yc = y0 + nl * 0.42 + 0.3           # concourse level
    yroof = y0 + 34.0
    g.room('bowl', ca - 62, ca + 62, cb - 52, cb + 52, y0, yroof)
    # court: maple hardwood with painted lines (keys, centre circle) + apron
    g.quad_sub('x_wood_floor', g.P(ca - 18, y0, cb - 11), g.P(ca + 18, y0, cb - 11), g.P(ca + 18, y0, cb + 11), g.P(ca - 18, y0, cb + 11), C('#c9a074'), (0, 1, 0))
    g.quad_sub('paint', g.P(ca - 24, y0 - 0.01, cb - 17), g.P(ca + 24, y0 - 0.01, cb - 17), g.P(ca + 24, y0 - 0.01, cb + 17), g.P(ca - 24, y0 - 0.01, cb + 17), C('#1d2a44'), (0, 1, 0))
    LINE = C('#f2efe6')
    for (u0_, u1_, w0_, w1_) in ((-14.33, 14.33, -7.66, -7.56), (-14.33, 14.33, 7.56, 7.66), (-14.4, -14.3, -7.6, 7.6), (14.3, 14.4, -7.6, 7.6), (-0.05, 0.05, -7.6, 7.6)):
        g.lbox('paint', ca + u0_, ca + u1_, y0, y0 + 0.006, cb + w0_, cb + w1_, LINE)
    for (s_, col_) in ((-1, C('#f2b632')), (1, C('#f2b632'))):
        g.lbox('paint', ca + s_ * 14.3 - (5.8 if s_ > 0 else 0), ca + s_ * 14.3 + (5.8 if s_ < 0 else 0), y0, y0 + 0.004, cb - 2.45, cb + 2.45, col_)
        g.lathe('paint', *g.xz(ca + s_ * (14.33 - 1.575), cb), [(6.75, y0 + 0.007), (6.65, y0 + 0.007)], LINE, n=48)
        # baskets: stanchion, arm, backboard, rim
        ub = ca + s_ * 15.6
        g.lbox('paint', ub - 0.4, ub + 0.4, y0, y0 + 1.2, cb - 0.8, cb + 0.8, C('#1a1a1a'))
        g.lbox('metal', ub - 0.1, ub + 0.1, y0 + 1.2, y0 + 3.5, cb - 0.1, cb + 0.1, C('#c9c9c9'))
        g.lbox('glassI', ca + s_ * 14.0 - 0.02, ca + s_ * 14.0 + 0.02, y0 + 2.9, y0 + 3.95, cb - 0.9, cb + 0.9, C('#e8eef0'))
        g.llathe('paint', ca + s_ * 13.6, cb, [(0.23, y0 + 3.05), (0.24, y0 + 3.07)], C('#e2591f'), n=16)
        g.collider(ub - 0.5, ub + 0.5, cb - 0.9, cb + 0.9, y0, y0 + 3.6)
    g.lathe('paint', *g.xz(ca, cb), [(1.83, y0 + 0.007), (1.73, y0 + 0.007)], LINE, n=40)
    g.deck_rect(ca - 23.5, ca + 23.5, cb - 16.5, cb + 16.5, y0)
    # team benches + scorer's table
    g.lbox('paint', ca - 4.0, ca + 4.0, y0, y0 + 0.85, cb - 13.6, cb - 12.8, C('#1d2a44'), collide=True)
    g.lbox('screen', ca - 4.0, ca + 4.0, y0 + 0.2, y0 + 0.75, cb - 12.82, cb - 12.78, (0.95, 0.75, 0.2, 1.0))
    for s_ in (-1, 1):
        for k in range(10):
            prop(g, 'dining_chair_02', ca + s_ * (6.0 + k * 0.7), y0, cb - 13.3, face=(ca + s_ * (6.0 + k * 0.7), cb), fit=(None, 1.0, None), collide=False)
    # lower bowl rows (ellipse rings): tread + riser + seat backs per segment, aisles every 9th segment
    SEATC = C('#26407a')
    for r in range(nl):
        ra, rb = ra0 + 2.0 + r * 0.9, rb0 + 2.0 + r * 0.9
        yr = y0 + 0.3 + r * 0.42
        for i in range(NS):
            t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
            p0, p1 = E(t0, ra, rb), E(t1, ra, rb); q0, q1 = E(t0, ra + 0.9, rb + 0.9), E(t1, ra + 0.9, rb + 0.9)
            g.poly('x_carpet_blue', [(p0[0], yr, p0[1]), (p1[0], yr, p1[1]), (q1[0], yr, q1[1]), (q0[0], yr, q0[1])], C('#3a3f4a'), (0, 1, 0))
            g.poly('paint', [(q0[0], yr, q0[1]), (q1[0], yr, q1[1]), (q1[0], yr + 0.42, q1[1]), (q0[0], yr + 0.42, q0[1])], C('#2a2e36'), IN(q0))
            if i % 9 == 4: continue
            m0, m1 = E(t0, ra + 0.35, rb + 0.35), E(t1, ra + 0.35, rb + 0.35); n0, n1 = E(t0, ra + 0.7, rb + 0.7), E(t1, ra + 0.7, rb + 0.7)
            g.poly('d_x_velvet', [(m0[0], yr + 0.42, m0[1]), (m1[0], yr + 0.42, m1[1]), (n1[0], yr + 0.42, n1[1]), (n0[0], yr + 0.42, n0[1])], SEATC, (0, 1, 0))
            g.poly('d_x_velvet', [(n0[0], yr + 0.42, n0[1]), (n1[0], yr + 0.42, n1[1]), (n1[0], yr + 0.95, n1[1]), (n0[0], yr + 0.95, n0[1])], shade(SEATC, 0.8), IN(n0))
        if r % 5 == 2:
            t = 0.37 + r * 0.9
            p = E(t, ra + 0.5, rb + 0.5); g.spots.append([round(p[0], 2), round(yr, 2), round(p[1], 2), round(math.atan2(-(ca - p[0]), -(cb - p[1])), 3), 'sit'])
    # concourse ring: walkable ellipse band, rail on the bowl side, concession stands on the outer wall
    rac, rbc = ra0 + 2.0 + nl * 0.9, rb0 + 2.0 + nl * 0.9
    for i in range(NS):
        t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
        p0, p1 = E(t0, rac, rbc), E(t1, rac, rbc); q0, q1 = E(t0, rac + 9.0, rbc + 9.0), E(t1, rac + 9.0, rbc + 9.0)
        g.poly('x_terrazzo', [(p0[0], yc, p0[1]), (p1[0], yc, p1[1]), (q1[0], yc, q1[1]), (q0[0], yc, q0[1])], C('#9b968c'), (0, 1, 0))
        m0, m1 = E(t0, rac + 4.5, rbc + 4.5), E(t1, rac + 4.5, rbc + 4.5)
        g.decks.append({'pts': [[round(m0[0], 2), round(m0[1], 2), round(yc, 3)], [round(m1[0], 2), round(m1[1], 2), round(yc, 3)]], 'width': 9.0, 'tunnel': True})
        # glass rail on the bowl edge
        g.poly('glassI', [(p0[0], yc, p0[1]), (p1[0], yc, p1[1]), (p1[0], yc + 1.1, p1[1]), (p0[0], yc + 1.1, p0[1])], C('#d4dde0'), None)
        pm = E((t0 + t1) / 2, rac - 0.1, rbc - 0.1)
        g.cols.append({'x': round(pm[0], 2), 'z': round(pm[1], 2), 'hx': round(v2len(v2sub(p1, p0)) / 2 + 0.05, 2), 'hz': 0.15,
                       'yaw': round(math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]), 4), 'yMin': round(yc - 0.4, 2), 'yMax': round(yc + 1.15, 2)})
        # outer wall + concessions
        g.poly('x_plaster', [(q0[0], yc, q0[1]), (q1[0], yc, q1[1]), (q1[0], yc + 5.5, q1[1]), (q0[0], yc + 5.5, q0[1])], C('#d9d6cf'), IN(q0))
        qm = E((t0 + t1) / 2, rac + 9.3, rbc + 9.3)
        g.cols.append({'x': round(qm[0], 2), 'z': round(qm[1], 2), 'hx': round(v2len(v2sub(q1, q0)) / 2 + 0.1, 2), 'hz': 0.3,
                       'yaw': round(math.atan2(-(q1[1] - q0[1]), q1[0] - q0[0]), 4), 'yMin': round(yc - 0.4, 2), 'yMax': round(yc + 5.5, 2)})
        if i % 6 == 1:
            s0, s1 = E(t0 + 0.01, rac + 8.95, rbc + 8.95), E(t1 - 0.01, rac + 8.95, rbc + 8.95)
            g.poly('screen', [(s0[0], yc + 2.6, s0[1]), (s1[0], yc + 2.6, s1[1]), (s1[0], yc + 3.6, s1[1]), (s0[0], yc + 3.6, s0[1])], [(0.95, 0.55, 0.15, 1.0), (0.2, 0.55, 0.95, 1.0), (0.95, 0.85, 0.3, 1.0)][i % 3], IN(s0))
            c0, c1 = E(t0 + 0.01, rac + 7.8, rbc + 7.8), E(t1 - 0.01, rac + 7.8, rbc + 7.8)
            g.poly('x_marble_black', [(c0[0], yc + 1.05, c0[1]), (c1[0], yc + 1.05, c1[1]), (s1[0], yc + 1.05, s1[1]), (s0[0], yc + 1.05, s0[1])], C('#2a2a2c'), (0, 1, 0))
            g.poly('paint', [(c0[0], yc, c0[1]), (c1[0], yc, c1[1]), (c1[0], yc + 1.05, c1[1]), (c0[0], yc + 1.05, c0[1])], C('#3a3d44'), OUT(c0))
            sp = E((t0 + t1) / 2, rac + 6.2, rbc + 6.2)
            g.spots.append([round(sp[0], 2), round(yc, 2), round(sp[1], 2), round(math.atan2(-(qm[0] - sp[0]), -(qm[1] - sp[1])), 3), 'stand'])
        if i % 4 == 0:
            lp = E((t0 + t1) / 2, rac + 4.5, rbc + 4.5)
            g.lights.append(('POINT', (lp[0], yc + 4.8, lp[1]), 160, (1.0, 0.9, 0.78), 0.3, None, None))
            g.lathe('lampI', lp[0], lp[1], [(0.0, yc + 5.45), (0.5, yc + 5.45), (0.0, yc + 5.46)], (1.0, 0.92, 0.8, 1.0), n=10)
    # upper bowl: steeper rows from the concourse fascia up to the roof ring
    for r in range(nu):
        ra, rb = rac + 2.0 + r * 0.85, rbc + 2.0 + r * 0.85
        yr = yc + 5.8 + r * 0.55
        for i in range(NS):
            t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
            p0, p1 = E(t0, ra, rb), E(t1, ra, rb); q0, q1 = E(t0, ra + 0.85, rb + 0.85), E(t1, ra + 0.85, rb + 0.85)
            g.poly('paint', [(p0[0], yr, p0[1]), (p1[0], yr, p1[1]), (q1[0], yr, q1[1]), (q0[0], yr, q0[1])], C('#3a3f4a'), (0, 1, 0))
            g.poly('paint', [(q0[0], yr, q0[1]), (q1[0], yr, q1[1]), (q1[0], yr + 0.55, q1[1]), (q0[0], yr + 0.55, q0[1])], C('#2a2e36'), IN(q0))
            if i % 9 == 4: continue
            n0, n1 = E(t0, ra + 0.6, rb + 0.6), E(t1, ra + 0.6, rb + 0.6)
            g.poly('d_x_velvet', [(n0[0], yr + 0.42, n0[1]), (n1[0], yr + 0.42, n1[1]), (n1[0], yr + 0.95, n1[1]), (n0[0], yr + 0.95, n0[1])], shade(SEATC, 0.85), IN(n0))
    # upper bowl fascia (LED ribbon) over the concourse, roof: dark truss ceiling with light rigs
    for i in range(NS):
        t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
        p0, p1 = E(t0, rac + 1.5, rbc + 1.5), E(t1, rac + 1.5, rbc + 1.5)
        g.poly('paint', [(p0[0], yc + 4.6, p0[1]), (p1[0], yc + 4.6, p1[1]), (p1[0], yc + 5.8, p1[1]), (p0[0], yc + 5.8, p0[1])], C('#15171c'), OUT(p0))
        g.poly('screen', [(p0[0], yc + 4.8, p0[1]), (p1[0], yc + 4.8, p1[1]), (p1[0], yc + 5.3, p1[1]), (p0[0], yc + 5.3, p0[1])], (0.25, 0.45, 0.95, 1.0) if i % 2 else (0.95, 0.75, 0.2, 1.0), OUT(p0))
    rt = rac + 2.0 + nu * 0.85 + 1.0
    for i in range(NS):
        t0, t1 = 2 * math.pi * i / NS, 2 * math.pi * (i + 1) / NS
        for k in range(4):
            r0_, r1_ = rt * k / 4, rt * (k + 1) / 4
            P = lambda t, r: g.P(ca + math.cos(t) * r * 1.0, yroof - 2.0 * (r / rt), cb + math.sin(t) * r * (rbc / rac))
            g.poly('paint', [P(t0, r0_), P(t1, r0_), P(t1, r1_), P(t0, r1_)], C('#1a1c22'), (0, -1, 0))
    for k in range(12):
        t = 2 * math.pi * k / 12
        p, q = E(t, 6.0, 5.0), E(t, rt - 4.0, (rt - 4.0) * rbc / rac)
        g.rod('metal', (p[0], yroof - 0.6, p[1]), (q[0], yroof - 1.8, q[1]), 0.25, C('#3a3d44'), n=4)
        g.lights.append(('SPOT', (q[0], yroof - 2.2, q[1]), 9000, (1.0, 0.98, 0.95), 0.4, None, (math.radians(35), 0, -t)))
    # centre-hung board: four LED faces + rings
    hb = yroof - 9.0
    for k in range(4):
        tt_ = k * math.pi / 2
        du, dw = math.cos(tt_), math.sin(tt_)
        Fb = (g.xz(ca + du * 4.0 - dw * 4.0 * 0, cb + dw * 3.0), dirw(g, -dw, du)[::2], dirw(g, du, dw)[::2])
    g.lbox('paint', ca - 4.0, ca + 4.0, hb, hb + 6.0, cb - 3.0, cb + 3.0, C('#121316'), top=True, bottom=True)
    for (u0_, u1_, w0_, w1_, nrm_) in ((ca - 3.8, ca + 3.8, cb - 3.02, cb - 3.0, (0, -1)), (ca - 3.8, ca + 3.8, cb + 3.0, cb + 3.02, (0, 1)),
                                         (ca - 4.02, ca - 4.0, cb - 2.8, cb + 2.8, (-1, 0)), (ca + 4.0, ca + 4.02, cb - 2.8, cb + 2.8, (1, 0))):
        g.lbox('screen', u0_, u1_, hb + 0.6, hb + 5.2, w0_, w1_, (0.35, 0.55, 0.95, 1.0))
    g.lbox('screen', ca - 4.6, ca + 4.6, hb - 0.8, hb - 0.3, cb - 3.6, cb + 3.6, (0.95, 0.72, 0.2, 1.0))
    for (su, sw) in ((-1, -1), (1, -1), (-1, 1), (1, 1)): g.llathe('metal', ca + su * 3.5, cb + sw * 2.5, [(0.03, hb + 6.0), (0.03, yroof)], C('#2a2a2a'), n=3)
    g.light('AREA', ca, hb - 1.0, cb, 6000, (1.0, 0.97, 0.92), size=(30.0, 20.0))
    # stairs from the concourse down the aisles to the court are walkable ramps on four axes
    for t in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2):
        p0, p1 = E(t, ra0 + 2.0, rb0 + 2.0), E(t, rac, rbc)
        g.decks.append({'pts': [[round(p0[0], 2), round(p0[1], 2), round(y0 + 0.3, 3)], [round(p1[0], 2), round(p1[1], 2), round(yc, 3)]], 'width': 1.6, 'tunnel': True})
    # door: the plaza side (local -b), into the concourse
    pi = E(-math.pi / 2, rac + 5.0, rbc + 5.0); li = L.loc(*pi) if False else None
    g.shot_at(ca, yc + 1.8, cb - rbc - 3.0, ca, y0 + 1.0, cb)
    door2(g, 'Mission Bay Arena', L, ca, b0 - 5.0, ca, cb - (rbc + 5.0), yc)
    g.probe = {'room': 0, 'y': yc + 2.0}
    return g


# ================================================================================== Girardi Square: chocolate shop + soda fountain
def ghirardelli_int(O):
    L, a0, a1, b0, b1, rr = site_loc(3542)
    g = mk(O, L, 'Girardi Chocolate Shop & Soda Fountain', 2.8); g.res = 2048
    A0, A1, B0, B1 = a0 + 1.5, a1 - 1.5, b0 + 1.2, b1 - 1.2
    yG = min(sidewalk(*p) for p in rr) + 0.1
    y0 = max(yG + 0.2, floor_over(g, A0, A1, B0, B1, pad=0.12)); g.floor_y = y0
    Hh = 6.0
    g.room('shop', A0, A1, B0, B1, y0, y0 + Hh)
    g.quad_sub('x_wood_floor', g.P(A0, y0, B0), g.P(A1, y0, B0), g.P(A1, y0, B1), g.P(A0, y0, B1), C('#7a5232'), (0, 1, 0))
    g.shell(A0, A1, B0, B1, y0, y0 + Hh, None, None, 'x_brick_old', C('#8c4a34'), 'x_wood_dark', C('#3a2618'))
    for k in range(int((A1 - A0) / 3.0) + 1):
        u = A0 + k * (A1 - A0) / int((A1 - A0) / 3.0)
        g.lbox('x_wood_dark', u - 0.15, u + 0.15, y0 + Hh - 0.45, y0 + Hh, B0, B1, C('#3a2618'), top=False, bottom=True)
    for k in range(4):
        w = B0 + (k + 0.5) * (B1 - B0) / 4
        g.lbox('metal', A0, A1, y0 + Hh - 0.55, y0 + Hh - 0.45, w - 0.06, w + 0.06, C('#2a2a2a'), top=False, bottom=True)
    # arched windows on the street side (+b), sky panels + daylight
    for k in range(6):
        u = A0 + (k + 0.5) * (A1 - A0) / 6
        pts = [(u - 1.0, y0 + 0.9), (u + 1.0, y0 + 0.9)] + [(u + 1.0 * math.cos(t), y0 + 3.6 + math.sin(t) * 1.0) for t in [math.pi * i / 10 for i in range(11)]]
        g.poly('sky', [g.P(x, y, B1 - 0.05) for x, y in pts], SKYC, dirw(g, 0, -1))
        g.light('AREA', u, y0 + 2.8, B1 - 0.8, 120, (0.85, 0.9, 1.0), size=(1.8, 2.6))
    # the counter with glass display cases full of chocolate squares, the copper vats behind it
    cw_ = B0 + 4.2
    g.lbox('x_veneer', A0 + 4.0, A1 - 10.0, y0, y0 + 0.95, cw_ - 0.5, cw_ + 0.5, C('#4a2c1a'), collide=True)
    g.lbox('x_marble_white', A0 + 3.9, A1 - 9.9, y0 + 0.95, y0 + 1.0, cw_ - 0.55, cw_ + 0.55, C('#ece8e0'))
    g.lbox('glassI', A0 + 4.0, A1 - 10.0, y0 + 1.0, y0 + 1.45, cw_ - 0.2, cw_ + 0.45, C('#d8e2e4'))
    R = random.Random(7)
    choc = [C('#3b1f12'), C('#5a2e18'), C('#8a5a2e'), C('#c7a27a'), C('#e8d9c0'), C('#7a1f2a'), C('#2e6a4a'), C('#c9a03a')]
    for k in range(int((A1 - 10.0 - A0 - 4.0) / 0.22)):
        u = A0 + 4.15 + k * 0.22
        for j in range(3):
            g.lbox('d_paint', u - 0.08, u + 0.08, y0 + 1.0, y0 + 1.02 + 0.01 * j, cw_ - 0.1 + j * 0.17, cw_ - 0.02 + j * 0.17, choc[R.randint(0, len(choc) - 1)])
    for k in range(3):   # copper conching vats (the old works)
        u = A0 + 6.0 + k * 4.0
        g.llathe('x_bronze', u, B0 + 1.4, [(0.0, y0), (1.0, y0), (1.05, y0 + 0.9), (1.0, y0 + 1.5), (0.95, y0 + 1.55), (0.0, y0 + 1.5)], C('#b06a3a'), n=24)
        g.llathe('metal', u, B0 + 1.4, [(0.06, y0 + 1.5), (0.06, y0 + 2.6), (0.5, y0 + 2.8), (0.0, y0 + 2.85)], C('#3a3a3a'), n=8)
        g.collider(u - 1.1, u + 1.1, B0 + 0.3, B0 + 2.5, y0, y0 + 2.8)
    # wall shelves of gift boxes (the brand's square blue / red / gold tins)
    for k in range(10):
        u = A1 - 9.0 + (k % 5) * 1.6; yb = y0 + 0.4 + (k // 5) * 1.0
        g.lbox('x_wood_dark', u - 0.75, u + 0.75, yb, yb + 0.04, B0 + 0.05, B0 + 0.5, C('#3a2618'))
        for j in range(5):
            g.lbox('d_paint', u - 0.68 + j * 0.28, u - 0.46 + j * 0.28, yb + 0.04, yb + 0.3, B0 + 0.12, B0 + 0.42, [C('#1f3a7a'), C('#8a1f2a'), C('#c9a03a'), C('#2e6a4a')][(k + j) % 4])
    g.collider(A1 - 9.8, A1 - 1.2, B0, B0 + 0.6, y0, y0 + 2.5)
    # the soda fountain: marble bar + stools at the -a end, menu boards
    g.lbox('x_veneer', A0 + 0.3, A0 + 1.1, y0, y0 + 1.05, B0 + 7.0, B1 - 2.5, C('#4a2c1a'), collide=True)
    g.lbox('x_marble_white', A0 + 0.2, A0 + 1.25, y0 + 1.05, y0 + 1.1, B0 + 6.9, B1 - 2.4, C('#ece8e0'))
    for k in range(int((B1 - 2.5 - B0 - 7.0) / 1.0)):
        prop(g, 'bar_chair_round_01', A0 + 1.9, y0, B0 + 7.5 + k * 1.0, face=(A0, B0 + 7.5 + k * 1.0), fit=(None, 0.8, None), collide=False)
    g.panel_u('screen', B0 + 7.5, B1 - 3.0, y0 + 2.4, y0 + 3.6, A0 + 0.02, (0.98, 0.9, 0.75, 1.0), 1)
    g.text('d_x_gold', ((g.xz(A0 + 0.05, (B0 + B1) / 2 + 2.0)), (L.v[0], L.v[1]), (L.u[0], L.u[1])), 0, y0 + 4.0, 0.02, 'GIRARDI', 0.6, BRASS, depth=0.05)
    # cafe tables + pendant lamps, customers
    for i in range(3):
        for j in range(2):
            u, w = A0 + 9.0 + i * 5.0, B1 - 4.0 + j * 2.0 - (2.0 if i == 1 else 0)
            prop(g, 'round_wooden_table_01', u, y0, w, fit=(0.8, None, None))
            for s_ in (-1, 1): prop(g, 'dining_chair_02', u + s_ * 0.8, y0, w, face=(u, w), fit=(None, 1.0, None), collide=False)
            if (i + j) % 2 == 0: g.spot(u - 0.8, y0, w, u, w, 'sit')
    for k in range(6): pendant(g, A0 + 4.0 + k * (A1 - A0 - 8.0) / 5, (B0 + B1) / 2, y0 + Hh, y0 + 3.2, asset='hanging_industrial_lamp', power=90, fit=0.5)
    for q in range(5): g.spot(A0 + 6.0 + q * 3.0, y0, cw_ + 1.6, A0 + 6.0 + q * 3.0, cw_, 'stand')
    g.shot_at(A1 - 2.0, y0 + 1.7, B1 - 2.0, A0 + 4.0, y0 + 1.2, B0 + 3.0)
    door2(g, 'Girardi Chocolate Shop', L, (A0 + A1) / 2, b1 + 4.0, (A0 + A1) / 2, B1 - 2.0, y0)
    return g


# ================================================================================== Cliffside House: the dining room over the ocean
def cliffhouse_int(O):
    L, a0, a1, b0, b1, rr = site_loc(30813)
    g = mk(O, L, 'Cliffside House - Dining Room', 3.5); g.res = 2048
    # ocean = local -b (west): glass wall there
    A0, A1 = a0 + 8.0, a1 - 8.0
    B0, B1 = b0 + 2.0, b0 + 16.0
    y0 = floor_over(g, A0, A1, B0, B1, pad=0.3); g.floor_y = y0
    Hh = 4.6
    g.room('dining', A0, A1, B0, B1, y0, y0 + Hh)
    g.quad_sub('x_wood_floor', g.P(A0, y0, B0), g.P(A1, y0, B0), g.P(A1, y0, B1), g.P(A0, y0, B1), C('#6b4a30'), (0, 1, 0))
    g.lbox('x_carpet_blue', A0 + 2.0, A1 - 2.0, y0, y0 + 0.015, B0 + 1.0, B1 - 4.0, C('#2e3a4a'))
    g.shell(A0, A1, B0, B1, y0, y0 + Hh, None, None, 'x_plaster', C('#ece6da'), 'x_plaster', C('#f1ede4'), walls=(False, True, True, True))
    # the glass wall: tall panes with slim mullions (the real ocean shows through), bake sky beyond
    for k in range(int((A1 - A0) / 2.2) + 1):
        u = A0 + k * (A1 - A0) / int((A1 - A0) / 2.2)
        g.lbox('metal', u - 0.05, u + 0.05, y0, y0 + Hh, B0 - 0.05, B0 + 0.08, C('#2a2c2e'))
    g.poly('glassI', [g.P(A0, y0, B0), g.P(A1, y0, B0), g.P(A1, y0 + Hh, B0), g.P(A0, y0 + Hh, B0)], C('#d4dde0'), dirw(g, 0, 1))
    g.poly('bakesky', [g.P(A0, y0 - 6, B0 - 4.0), g.P(A1, y0 - 6, B0 - 4.0), g.P(A1, y0 + Hh + 6, B0 - 4.0), g.P(A0, y0 + Hh + 6, B0 - 4.0)], SKYC, dirw(g, 0, 1))
    g.collider(A0, A1, B0 - 0.4, B0, y0 - 1, y0 + Hh)
    # wainscot + framed photos on the back wall, bar at the +a end, tables for two/four by the glass
    g.lbox('x_veneer', A0, A1, y0, y0 + 1.1, B1 - 0.1, B1, C('#5b3a22'))
    for k in range(9):      # the old celebrity photo wall: sepia prints in dark frames
        u = A0 + 3.0 + k * (A1 - A0 - 6.0) / 8
        picture(g, u, B1, -1, y0 + 1.5 + (k % 2) * 0.25, 0.7, 0.55, seed=40 + k, frame=C('#2a1d14'))
    g.extra = {'hideExt': True}     # the exterior's own walls stand just outside the glass: hide them while inside
    g.lbox('x_veneer', A1 - 2.0, A1 - 1.2, y0, y0 + 1.1, B0 + 4.0, B1 - 1.0, C('#4a2c1a'), collide=True)
    g.lbox('x_marble_black', A1 - 2.1, A1 - 1.1, y0 + 1.1, y0 + 1.16, B0 + 3.9, B1 - 0.9, C('#26262a'))
    for k in range(4): prop(g, 'wine_bottles_01', A1 - 0.4, y0 + 1.1, B0 + 5.0 + k * 1.8, fit=(0.35, None, None), collide=False)
    g.lbox('x_veneer', A1 - 0.6, A1, y0 + 1.1, y0 + 1.14, B0 + 4.0, B1 - 1.0, C('#4a2c1a'))
    for k in range(5): prop(g, 'bar_chair_round_01', A1 - 2.8, y0, B0 + 4.8 + k * 1.6, face=(A1, B0 + 4.8 + k * 1.6), fit=(None, 0.8, None), collide=False)
    for i in range(int((A1 - A0 - 6.0) / 3.2)):
        for j, wj in enumerate((B0 + 2.2, B0 + 5.6, B0 + 9.0)):
            u = A0 + 2.5 + i * 3.2 + (j % 2) * 1.2
            if u > A1 - 4.0: continue
            g.llathe('fabric', u, wj, [(0.5, y0), (0.52, y0 + 0.74), (0.48, y0 + 0.76), (0.0, y0 + 0.77)], C('#f6f2ea'), n=16)
            g.llathe('glassI', u + 0.12, wj, [(0.03, y0 + 0.77), (0.04, y0 + 0.9), (0.0, y0 + 0.95)], C('#e8eef0'), n=6)
            for s_ in (-1, 1): prop(g, 'dining_chair_02', u + s_ * 0.85, y0, wj, face=(u, wj), fit=(None, 1.0, None), collide=False)
            g.collider(u - 0.55, u + 0.55, wj - 0.55, wj + 0.55, y0, y0 + 0.8)
            if (i + j) % 3 == 0: g.spot(u - 0.85, y0, wj, u, wj, 'sit')
            g.light('POINT', u, y0 + 1.1, wj, 6, (1.0, 0.7, 0.4), radius=0.03, day=False)   # table candle
            g.llathe('lampI', u - 0.1, wj + 0.1, [(0.0, y0 + 0.77), (0.03, y0 + 0.8), (0.02, y0 + 0.9), (0.0, y0 + 0.92)], (1.0, 0.75, 0.45, 1.0), n=6)
    for k in range(7): pendant(g, A0 + 3 + k * (A1 - A0 - 6) / 6, B0 + 6.5, y0 + Hh, y0 + 2.6, asset='modern_ceiling_lamp_01', power=110, fit=0.4)
    for q in range(3): g.spot(A1 - 4.0, y0, B0 + 5.0 + q * 2.0, A1, B0 + 5.0 + q * 2.0, 'stand')
    g.shot_at(A1 - 3.0, y0 + 1.7, B1 - 2.0, A0 + 6.0, y0 + 1.0, B0)
    door2(g, 'Cliffside House', L, (A0 + A1) / 2, b1 + 4.0, (A0 + A1) / 2, B1 - 2.0, y0)
    return g


# ================================================================================== Embarcadero Center galleria (two shop levels)
def embcenter_int(O):
    import hero_wave2 as W2
    best = max(W2.EC_POD, key=lambda i: abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring_out(ring_of(i)), ring_out(ring_of(i))[1:] + ring_out(ring_of(i))[:1]))))
    L, a0, a1, b0, b1, rr = site_loc(best)
    g = mk(O, L, 'Embarcadero Center - Galleria', 2.5); g.res = 2048
    A0, A1, B0, B1 = a0 + 2.0, a1 - 2.0, b0 + 1.5, b1 - 1.5
    if B1 - B0 > 15: B0, B1 = (B0 + B1) / 2 - 7.5, (B0 + B1) / 2 + 7.5
    yG = min(sidewalk(*p) for p in rr) + 0.1
    y0 = max(yG + 0.2, floor_over(g, A0, A1, B0, B1, pad=0.12)); g.floor_y = y0
    y1 = y0 + 5.2; yt = y1 + 5.6
    g.room('galleria', A0, A1, B0, B1, y0, yt)
    g.quad_sub('x_travertine', g.P(A0, y0, B0), g.P(A1, y0, B0), g.P(A1, y0, B1), g.P(A0, y0, B1), C('#d8cfc0'), (0, 1, 0))
    g.shell(A0, A1, B0, B1, y0, yt, None, None, 'x_plaster', C('#e8e4dc'), None, None, ceiling=False)
    # skylight vault
    for k in range(10):
        t0, t1 = math.pi * k / 10, math.pi * (k + 1) / 10
        rv = (B1 - B0) / 2; wc = (B0 + B1) / 2
        P = lambda uu, t: g.P(uu, yt + math.sin(t) * rv * 0.4, wc + math.cos(t) * rv)
        g.poly('glassI', [P(A0, t0), P(A1, t0), P(A1, t1), P(A0, t1)], C('#d4dde0'), dirw(g, 0, -math.cos((t0 + t1) / 2), -1))
    for k in range(int((A1 - A0) / 4.0) + 1):
        u = A0 + k * 4.0
        pts = [g.P(u, yt + math.sin(math.pi * j / 10) * (B1 - B0) / 2 * 0.4, (B0 + B1) / 2 + math.cos(math.pi * j / 10) * (B1 - B0) / 2) for j in range(11)]
        for j in range(10): g.rod('metal', pts[j], pts[j + 1], 0.06, C('#e6e6e6'), n=4)
    g.poly('bakesky', [g.P(A0, yt + 6, B0), g.P(A1, yt + 6, B0), g.P(A1, yt + 6, B1), g.P(A0, yt + 6, B1)], SKYC, (0, -1, 0))
    # two levels of shops on both long sides; the upper walkways (4 m) with glass rails, bridges every ~25 m
    gw = 4.0
    names = ['FOGLIGHT OPTICS', 'BAYSIDE BOOKS', 'MISSION TEA', 'EMBARCADERO PHARMACY', 'PIER GOODS', 'MARKET STREET SHOES', 'COASTAL KITCHEN', 'SAILCLOTH', 'NORTH BEACH GELATO', 'CABLE CAR GIFTS']
    R = random.Random(3)
    for (wv, face) in ((B0, 1), (B1, -1)):
        for lev, yl in enumerate((y0, y1)):
            nb = int((A1 - A0) / 7.0)
            for k in range(nb):
                u0, u1 = A0 + k * (A1 - A0) / nb, A0 + (k + 1) * (A1 - A0) / nb
                g.panel_in('screen', u0 + 0.3, u1 - 0.3, yl + 0.3, yl + 3.4, wv + face * 0.05, (0.75 + 0.2 * R.random(), 0.7 + 0.2 * R.random(), 0.6 + 0.2 * R.random(), 1.0), face)
                g.lbox('paint', u0 + 0.1, u1 - 0.1, yl + 3.5, yl + 4.2, min(wv, wv + face * 0.15), max(wv, wv + face * 0.15), [C('#1f2a3a'), C('#3a1f24'), C('#24382c'), C('#2e2a24')][(k + lev) % 4])
                Ft = (g.xz((u0 + u1) / 2, wv + face * 0.16), (L.u[0] * face, L.u[1] * face), (L.v[0] * face, L.v[1] * face))
                g.text('d_x_gold', Ft, 0, yl + 3.62, 0.0, names[(k * 2 + lev + (face > 0)) % len(names)], 0.34, C('#efe2c0'), depth=0.02)
                g.light('POINT', (u0 + u1) / 2, yl + 2.6, wv + face * 1.6, 70, (1.0, 0.9, 0.75), radius=0.3)
        # upper walkway slab + rail
        wa, wb = (wv, wv + face * gw)
        g.lbox('x_plaster', A0, A1, y1 - 0.45, y1, min(wa, wb), max(wa, wb), C('#f0ece4'), top=True, bottom=True)
        g.lbox('x_travertine', A0, A1, y1, y1 + 0.01, min(wa, wb), max(wa, wb), C('#d8cfc0'))
        g.lbox('glassI', A0, A1, y1, y1 + 1.1, min(wb, wb - face * 0.06), max(wb, wb - face * 0.06), C('#d4dde0'))
        g.lbox('metal', A0, A1, y1 + 1.08, y1 + 1.14, min(wb, wb - face * 0.1), max(wb, wb - face * 0.1), C('#c9c9c9'))
        g.deck_rect(A0 + 0.2, A1 - 0.2, min(wa, wb) + 0.1, max(wa, wb) - 0.1, y1)
        g.collider(A0, A1, min(wb, wb - face * 0.15), max(wb, wb - face * 0.15), y1 - 0.3, y1 + 1.15)
        for k in range(6):
            u = A0 + 4 + k * (A1 - A0 - 8) / 5
            g.lathe('lampI', *g.xz(u, wv + face * gw * 0.5), [(0.0, y1 - 0.47), (0.25, y1 - 0.47), (0.0, y1 - 0.46)], (1.0, 0.9, 0.75, 1.0), n=10)
            g.light('POINT', u, y1 - 0.8, wv + face * gw * 0.5, 60, (1.0, 0.88, 0.7), radius=0.2)
            g.spot(u + 1.5, y1, wv + face * 2.2, u + 1.5, wv, 'stand')
    # escalator links (one per end), planters with trees down the middle, benches
    wm = (B0 + B1) / 2
    g.link((A0 + 3.0, y0, wm, A0 + 6.0, wm), (A0 + 2.0, y1, B0 + 2.0, A0 + 6.0, B0 + 2.0), 'Escalator up', 'Escalator down')
    g.link((A1 - 3.0, y0, wm, A1 - 6.0, wm), (A1 - 2.0, y1, B1 - 2.0, A1 - 6.0, B1 - 2.0), 'Escalator up', 'Escalator down')
    for k in range(4):
        u = A0 + 10 + k * (A1 - A0 - 20) / 3
        g.lbox('x_travertine', u - 1.5, u + 1.5, y0, y0 + 0.55, wm - 1.5, wm + 1.5, C('#cfc6b6'), collide=True)
        prop(g, 'pachira_aquatica_01', u, y0 + 0.55, wm, yaw=k, fit=(None, 2.8, None), collide=False)
        for s_ in (-1, 1): prop(g, 'painted_wooden_bench', u + s_ * 2.6, y0, wm, yaw=math.pi / 2, fit=(1.6, None, None))
        g.spot(u + 1.0, y0, wm + 2.5, u + 1.0, B1, 'stand'); g.spot(u - 1.0, y0, wm - 2.5, u - 1.0, B0, 'stand')
    g.shot_at(A0 + 2.0, y1 + 1.7, B0 + 2.0, A1, y0 + 2.0, (B0 + B1) / 2)
    door2(g, 'Embarcadero Center', L, (A0 + A1) / 2, b0 - 4.0, (A0 + A1) / 2, B0 + 5.5, y0)
    return g


# ================================================================================== office lobbies: Hobart, Mills, Phelan
def office_lobby(O, ring, name, label, side, spec):
    """generic grand office lobby on the street side `side` ('a0' / 'a1' / 'b0' / 'b1') of the footprint"""
    L, a0, a1, b0, b1, rr = site_loc(ring)
    g = mk(O, L, name, 2.6); g.res = 2048
    D, Wd, Hh = spec.get('depth', 12.0), spec.get('width', 22.0), spec.get('height', 7.5)
    e = spec.get('edge')      # facade line when the footprint's extreme vertex is not on the street face
    if side in ('b0', 'b1'):
        am = (a0 + a1) / 2 + spec.get('off', 0.0)
        A0, A1 = am - Wd / 2, am + Wd / 2
        f = e if e is not None else (b0 if side == 'b0' else b1)
        B0, B1 = (f + 1.0, f + 1.0 + D) if side == 'b0' else (f - 1.0 - D, f - 1.0)
    else:
        bm = (b0 + b1) / 2 + spec.get('off', 0.0)
        B0, B1 = bm - Wd / 2, bm + Wd / 2
        f = e if e is not None else (a0 if side == 'a0' else a1)
        A0, A1 = (f + 1.0, f + 1.0 + D) if side == 'a0' else (f - 1.0 - D, f - 1.0)
    yG = min(sidewalk(*p) for p in rr) + 0.1
    y0 = max(yG + 0.2, floor_over(g, A0, A1, B0, B1, pad=0.12)); g.floor_y = y0
    g.room('lobby', A0, A1, B0, B1, y0, y0 + Hh)
    fl, wl = spec.get('floor', 'checker'), spec.get('wall', 'marble_cream')
    if fl == 'checker': checker(g, 'x_checker', A0, A1, B0, B1, y0, 1.2, C('#d9d4ca'), C('#d9d4ca'), diag=False)
    else: g.quad_sub('x_' + fl, g.P(A0, y0, B0), g.P(A1, y0, B0), g.P(A1, y0, B1), g.P(A0, y0, B1), spec.get('floor_col', C('#d9d0c0')), (0, 1, 0))
    street = {'a0': 0, 'a1': 1, 'b0': 2, 'b1': 3}[side]
    walls = tuple(k != {0: 3, 1: 1, 2: 0, 3: 2}[street] for k in range(4))
    g.shell(A0, A1, B0, B1, y0, y0 + Hh, None, None, 'x_' + wl, spec.get('wall_col', C('#e3d8c4')), None, None, ceiling=False, walls=walls)
    coffers(g, A0, A1, B0, B1, y0 + Hh - 0.6, 2.6, col=C('#efe8d8'), trim=GOLDC)
    # street wall: glass + bronze frame + revolving door bay
    sw_ = {'a0': (A0, 'u'), 'a1': (A1, 'u'), 'b0': (B0, 'w'), 'b1': (B1, 'w')}[side]
    if sw_[1] == 'u':
        face = 1 if side == 'a0' else -1
        g.panel_u('glassI', B0, B1, y0, y0 + Hh - 1.5, sw_[0], C('#d4dde0'), face)
        g.panel_u('x_bronze', B0, B1, y0 + Hh - 1.5, y0 + Hh, sw_[0], C('#5a4a32'), face)
        for k in range(7):
            w = B0 + k * (B1 - B0) / 6
            g.lbox('x_bronze', sw_[0] - 0.08, sw_[0] + 0.08, y0, y0 + Hh - 1.5, w - 0.08, w + 0.08, C('#5a4a32'))
        g.poly('bakesky', [g.P(sw_[0] - face * 3, y0, B0), g.P(sw_[0] - face * 3, y0, B1), g.P(sw_[0] - face * 3, y0 + Hh, B1), g.P(sw_[0] - face * 3, y0 + Hh, B0)], SKYC, dirw(g, face, 0))
        g.collider(min(sw_[0], sw_[0] - face * 0.4), max(sw_[0], sw_[0] - face * 0.4), B0, B1, y0 - 1, y0 + Hh)
        back = (A1 if side == 'a0' else A0); bf = -face
        door2(g, label, L, sw_[0] - face * 4.0, (B0 + B1) / 2, sw_[0] + face * 2.5, (B0 + B1) / 2, y0)
    else:
        face = 1 if side == 'b0' else -1
        g.panel_in('glassI', A0, A1, y0, y0 + Hh - 1.5, sw_[0], C('#d4dde0'), face)
        g.panel_in('x_bronze', A0, A1, y0 + Hh - 1.5, y0 + Hh, sw_[0], C('#5a4a32'), face)
        for k in range(7):
            u = A0 + k * (A1 - A0) / 6
            g.lbox('x_bronze', u - 0.08, u + 0.08, y0, y0 + Hh - 1.5, sw_[0] - 0.08, sw_[0] + 0.08, C('#5a4a32'))
        g.poly('bakesky', [g.P(A0, y0, sw_[0] - face * 3), g.P(A1, y0, sw_[0] - face * 3), g.P(A1, y0 + Hh, sw_[0] - face * 3), g.P(A0, y0 + Hh, sw_[0] - face * 3)], SKYC, dirw(g, 0, face))
        g.collider(A0, A1, min(sw_[0], sw_[0] - face * 0.4), max(sw_[0], sw_[0] - face * 0.4), y0 - 1, y0 + Hh)
        door2(g, label, L, (A0 + A1) / 2, sw_[0] - face * 4.0, (A0 + A1) / 2, sw_[0] + face * 2.5, y0)
    # elevator bank on the back wall: brass doors + indicator dials, a directory board, the concierge desk, benches
    if sw_[1] == 'u':
        bu = A1 if side == 'a0' else A0; f2 = -1 if side == 'a0' else 1
        for k in range(spec.get('lifts', 4)):
            w = B0 + (k + 0.5) * (B1 - B0) / spec.get('lifts', 4)
            g.panel_u('x_brass', w - 0.75, w + 0.75, y0, y0 + 2.4, bu + f2 * 0.03, C('#c9a85a'), f2)
            g.panel_u('x_bronze', w - 0.9, w + 0.9, y0 + 2.4, y0 + 2.9, bu + f2 * 0.035, C('#5a4a32'), f2)
            g.llathe('lampI', bu + f2 * 0.06, w, [(0.0, y0 + 2.62), (0.16, y0 + 2.62), (0.0, y0 + 2.63)], (1.0, 0.8, 0.5, 1.0), n=12) if False else None
        g.lbox('x_veneer', (A0 + A1) / 2 - 1.5, (A0 + A1) / 2 + 1.5, y0, y0 + 1.1, B0 + 1.2, B0 + 2.0, C('#4a2c1a'), collide=True)
    else:
        bw = B1 if side == 'b0' else B0; f2 = -1 if side == 'b0' else 1
        for k in range(spec.get('lifts', 4)):
            u = A0 + (k + 0.5) * (A1 - A0) / spec.get('lifts', 4)
            g.panel_in('x_brass', u - 0.75, u + 0.75, y0, y0 + 2.4, bw + f2 * 0.03, C('#c9a85a'), f2)
            g.panel_in('x_bronze', u - 0.9, u + 0.9, y0 + 2.4, y0 + 2.9, bw + f2 * 0.035, C('#5a4a32'), f2)
        g.lbox('x_veneer', A0 + 1.2, A0 + 2.0, y0, y0 + 1.1, (B0 + B1) / 2 - 1.5, (B0 + B1) / 2 + 1.5, C('#4a2c1a'), collide=True)
    for k in range(3):
        u = A0 + (k + 0.5) * (A1 - A0) / 3
        g.lathe('lampI', *g.xz(u, (B0 + B1) / 2), [(0.0, y0 + Hh - 0.62), (0.5, y0 + Hh - 0.62), (0.0, y0 + Hh - 0.61)], (1.0, 0.86, 0.62, 1.0), n=14)
        chandelier(g, u, (B0 + B1) / 2, y0 + Hh - 0.6, drop=1.8, R=0.8, tiers=2, power=500) if spec.get('chandeliers') else g.light('POINT', u, y0 + Hh - 1.2, (B0 + B1) / 2, 380, (1.0, 0.84, 0.6), radius=0.4)
    for (u, w) in ((A0 + 1.0, B0 + 1.0), (A1 - 1.0, B1 - 1.0)): prop(g, 'potted_plant_02', u, y0, w, fit=(None, 1.8, None), collide=False)
    prop(g, 'vintage_grandfather_clock_01', A1 - 1.0, y0, B0 + 1.0, face=((A0 + A1) / 2, (B0 + B1) / 2), fit=(None, 2.2, None)) if spec.get('clock') else None
    for q in range(4): g.spot(A0 + 2.0 + q * (A1 - A0 - 4.0) / 3, y0, (B0 + B1) / 2 + (1.5 if q % 2 else -1.5), (A0 + A1) / 2, (B0 + B1) / 2, 'stand')
    return g


def hobart_int(O):
    return office_lobby(O, 17508, 'Hobart Building - Lobby', 'Hobart Building', 'a0', {'edge': -21.0, 'depth': 11.0, 'width': 13.0, 'height': 5.6, 'floor': 'checker', 'wall': 'marble_cream', 'lifts': 3, 'clock': True})


def mills_int(O):
    return office_lobby(O, 17596, 'Mills Building - Lobby', 'Mills Building', 'b1', {'depth': 12.0, 'width': 20.0, 'height': 6.6, 'floor': 'marble_white', 'floor_col': C('#e3ddd2'), 'wall': 'marble_cream',
                                                                                     'wall_col': C('#e8dcc8'), 'lifts': 6, 'chandeliers': True})


def phelan_int(O):
    return office_lobby(O, 23557, 'Phelan Building - Lobby', 'Phelan Building', 'b1', {'depth': 10.0, 'width': 16.0, 'height': 5.8, 'floor': 'mosaic', 'floor_col': C('#d6cdb8'), 'wall': 'marble_siena',
                                                                                       'wall_col': C('#b98a5a'), 'lifts': 4, 'clock': True})


INTERIORS = {'davies': davies_int, 'legion': legion_int, 'chase': chase_int, 'ghirardelli': ghirardelli_int, 'cliffHouse': cliffhouse_int,
             'embCenter': embcenter_int, 'hobart': hobart_int, 'mills': mills_int, 'phelan': phelan_int}


def site_origin(bid):
    import hero_wave2 as W2, hero_wave3 as W3, hero_wave4 as W4, hero_wave5 as W5
    for M in (W2, W3, W4, W5):
        if bid in M.BUILDERS:
            fn, hide = M.BUILDERS[bid]
            return M.ORIGINS[bid]() if bid in getattr(M, 'ORIGINS', {}) else origin_for([ring_of(i) for i in hide])
    raise KeyError(bid)


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = int(a[a.index('--res') + 1]) if '--res' in a else 2048
    spp = int(a[a.index('--spp') + 1]) if '--spp' in a else 384
    ids = [x for x in a if not x.startswith('--') and not x.isdigit()]
    for bid in ids:
        run_interior(bid, INTERIORS[bid], site_origin(bid), res=res, samples=spp)


if __name__ == '__main__':
    main()
