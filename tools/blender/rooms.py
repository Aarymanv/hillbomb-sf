"""HILLBOMB interior-mapping room atlas generator (Blender/Cycles).

Outputs (public/assets/baked/):
  rooms_day.jpg, rooms_night.jpg   2048x2048, 4x4 tiles of 512x512, sRGB JPEG q90
  rooms.json                        [{index, type, name, col, row, tint, litFraction}]

Contract (see verify_projection.py): room 4.0 m wide x 3.0 m tall x 4.0 m deep; window
plane = the whole front face; camera on the window axis at C = D (4 m) in front, frame =
window rectangle, non-square pixels so  uv = 0.5 + 0.5*p.xy*C/(C - p.z)  holds exactly.

Usage:
  tools/.venv-blender/Scripts/python tools/blender/rooms.py [--samples 192] [--only 0,3]
      [--variants day,night] [--tile 512] [--no-atlas]
"""
import os, sys, json, math, random, time, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import numpy as np
from mathutils import Matrix, Vector
import hb_lib as L
import hb_props as P
import hb_kit as KIT
from hb_lib import MB, TR

PI = math.pi
W, H, D = 4.0, 3.0, 4.0
CACHE_DIR = os.path.join(L.CACHE, 'rooms')

# global lighting calibration (same exposure for day and night)
DAY_WINDOW_W = 17.0       # area light filling the window opening (W)
DAY_SKY = 0.42             # world (sky above / ground below) seen through the opening
NIGHT_SKY = 0.012
NIGHT_GAIN = 1.7          # multiplier on every lamp's night power
EXPOSURE = 0.0


# ----------------------------------------------------------------------------
# room shell
# ----------------------------------------------------------------------------

def wall_mat(color, name=None, detail=0.35):
    return L.MT(name or ('wall_' + color.lstrip('#')), 'painted_plaster', tint=color, scale=2.2, detail=detail,
                normal=0.25, rough_mul=0.8, rough_add=0.15)


def floor_wood(color='#6e4a2c', name=None, coat=0.35):
    return L.MT(name or ('floor_' + color.lstrip('#')), 'wood_floor', tint=color, scale=2.2, normal=0.6,
                rough_mul=0.55, rough_add=0.05, coat=coat)


BASE_PROF = [(0, 0), (0.018, 0), (0.018, 0.15), (0.012, 0.162), (0.012, 0.172), (0.005, 0.183), (0.0, 0.19)]


def crown_prof(top, s=1.0):
    pts = [(0.0, top - 0.17 * s), (0.012 * s, top - 0.165 * s), (0.016 * s, top - 0.15 * s), (0.03 * s, top - 0.14 * s)]
    for k in range(1, 8):
        t = k / 7 * PI / 2
        pts.append((0.03 * s + 0.1 * s * math.sin(t), top - 0.14 * s + 0.1 * s * (1 - math.cos(t))))
    pts += [(0.14 * s, top - 0.03 * s), (0.155 * s, top - 0.025 * s), (0.155 * s, top)]
    return pts


def trims(paths, trim, base_h=0.19, crown=None, rail=None, ceil_h=H, chair=None):
    """paths: list of polylines along the walls (room interior on the left side)."""
    b = MB()
    bs = base_h / 0.19
    for p in paths:
        b.sweep(p, [(d, z * bs) for d, z in BASE_PROF])
    b.obj('baseboard', trim, sharp=40)
    if crown:
        c = MB()
        cp = crown_prof(ceil_h, 1.35 if crown == 'victorian' else 0.8)
        for p in paths:
            c.sweep(p, cp)
        c.obj('crown', trim, sharp=40)
    if rail:
        r = MB()
        for p in paths:
            r.sweep(p, [(0, rail - 0.03), (0.02, rail - 0.02), (0.025, rail), (0.015, rail + 0.015), (0.0, rail + 0.02)])
        r.obj('picrail', trim, sharp=40)
    if chair:
        r = MB()
        for p in paths:
            r.sweep(p, [(0, chair - 0.03), (0.018, chair - 0.025), (0.028, chair), (0.018, chair + 0.025), (0.0, chair + 0.03)])
        r.obj('chairrail', trim, sharp=40)


DEFAULT_PATH = [(-W / 2, -0.3), (-W / 2, D), (W / 2, D), (W / 2, -0.3)]


def shell(wall, floor, ceil=None, back=None, left=None, right=None, ceil_h=H, back_door=None):
    """Room box.  Walls are thick boxes that extend out past the window plane (invisible to
    the camera there) so no light leaks around the opening.  back_door=(x0, x1, h) cuts a
    doorway into the back wall (see KIT.hallway for what lies behind it)."""
    ceil = ceil or L.MT('ceiling', 'painted_plaster', tint='#efece6', scale=2.5, detail=0.25, normal=0.15)
    m = MB(); m.box(-W / 2 - 0.3, W / 2 + 0.3, -0.3, D + 0.3, -0.2, 0.0); m.obj('floor', floor)
    m = MB(); m.box(-W / 2 - 0.3, W / 2 + 0.3, -0.3, D + 0.3, ceil_h, ceil_h + 0.2); m.obj('ceiling', ceil)
    m = MB(); m.box(-W / 2 - 0.2, -W / 2, -0.3, D + 0.2, -0.2, ceil_h + 0.2); m.obj('wall_l', left or wall)
    m = MB(); m.box(W / 2, W / 2 + 0.2, -0.3, D + 0.2, -0.2, ceil_h + 0.2); m.obj('wall_r', right or wall)
    m = MB()
    if back_door:
        x0, x1, hd = back_door
        m.box(-W / 2 - 0.2, x0, D, D + 0.2, -0.2, ceil_h + 0.2)
        m.box(x1, W / 2 + 0.2, D, D + 0.2, -0.2, ceil_h + 0.2)
        m.box(x0, x1, D, D + 0.2, hd, ceil_h + 0.2)
    else:
        m.box(-W / 2 - 0.2, W / 2 + 0.2, D, D + 0.2, -0.2, ceil_h + 0.2)
    m.obj('wall_b', back or wall)


def door_path(x0, x1):
    """Baseboard/crown paths around a back-wall doorway."""
    return [[(-W / 2, -0.3), (-W / 2, D), (x0, D)], [(x1, D), (W / 2, D), (W / 2, -0.3)]]


def outlets(pts):
    mb = MB()
    for (wall, a, z) in pts:
        if wall == 'b':
            M = TR(a, D, z)
        elif wall == 'l':
            M = TR(-W / 2, a, z, rz=PI / 2)
        else:
            M = TR(W / 2, a, z, rz=-PI / 2)
        P.outlet(mb, M)
    mb.obj('outlets', P.mats()['plastic_white'], bevel=0.002, seg=1)


def daylight(power=None, color=None, night=0.0):
    p = DAY_WINDOW_W if power is None else power
    L.light('AREA', (0.0, -0.02, H / 2), p, color or L.kelvin(6500), size=(W - 0.01, H - 0.01),
            rot=(PI / 2, 0, 0), day=p, night=night, name='window_L')


def sun_patch(elev=38.0, azim=-30.0, strength=3.2, hole=(-1.45, 1.45, 0.75, 2.75), mullions=True, wall=None):
    """Daytime sunlight through a window-shaped aperture.  A camera-invisible front wall
    (Y = -0.25 .. -0.05) with a sash-window hole and mullions restricts a sun lamp to a
    realistic parallelogram patch on the floor/walls.  The camera still sees through it."""
    x0, x1, z0, z1 = hole
    fw = MB()
    fw.box(-W / 2 - 0.3, x0, -0.25, -0.05, -0.3, H + 0.3)
    fw.box(x1, W / 2 + 0.3, -0.25, -0.05, -0.3, H + 0.3)
    fw.box(x0, x1, -0.25, -0.05, -0.3, z0)
    fw.box(x0, x1, -0.25, -0.05, z1, H + 0.3)
    if mullions:
        xm = (x0 + x1) / 2
        fw.box(xm - 0.04, xm + 0.04, -0.2, -0.1, z0, z1)
        zm = z0 + (z1 - z0) * 0.52
        fw.box(x0, x1, -0.2, -0.1, zm - 0.03, zm + 0.03)
        for xx in (x0 + (xm - x0) / 2, xm + (x1 - xm) / 2):
            fw.box(xx - 0.015, xx + 0.015, -0.17, -0.13, zm, z1)
    ob = fw.obj('frontwall', wall or L.M('frontwall', '#d8d4cc', rough=0.8), cam=True)
    ob.visible_camera = False
    e, a = math.radians(elev), math.radians(azim)
    d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), -math.sin(e)))
    sun = L.light('SUN', (0, -3, 3), strength, L.kelvin(5400), 0.009, day=strength, night=0.0, name='sun')
    sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return sun


def setup_world():
    sc = bpy.context.scene
    w = bpy.data.worlds.get('hb_world') or bpy.data.worlds.new('hb_world')
    sc.world = w
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -0.15
    mr.inputs['From Max'].default_value = 0.35
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    col = L.mix_rgb(nt, mr.outputs['Result'], (0.32, 0.3, 0.27), (0.55, 0.68, 0.9))
    nt.links.new(col, bg.inputs['Color'])
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    sock = bg.inputs['Strength']
    ndcol = mr.outputs['Result']

    def hook(v, sock=sock):
        sock.default_value = DAY_SKY if v == 'day' else NIGHT_SKY
    L.on_variant(hook)


# ----------------------------------------------------------------------------
# placement helpers
# ----------------------------------------------------------------------------

def at_back(x, depth, z=0.0, gap=0.01):
    return TR(x, D - depth / 2 - gap, z)


def at_left(y, depth, z=0.0, gap=0.01):
    return TR(-W / 2 + depth / 2 + gap, y, z, rz=PI / 2)


def at_right(y, depth, z=0.0, gap=0.01):
    return TR(W / 2 - depth / 2 - gap, y, z, rz=-PI / 2)


def on_wall(wall, a, z, off=0.0):
    if wall == 'b':
        return TR(a, D - off, z)
    if wall == 'l':
        return TR(-W / 2 + off, a, z, rz=PI / 2)
    return TR(W / 2 - off, a, z, rz=-PI / 2)


def facing(x, y, fx, fy):
    """Placement at (x, y) whose front faces the direction (fx, fy)."""
    rz = math.atan2(fx, -fy)
    return TR(x, y, 0, rz=rz)


# ----------------------------------------------------------------------------
# bigger local builders
# ----------------------------------------------------------------------------

def fireplace(M, surround, iron, hearth, rng, fire=True, name='fp'):
    K = P.mats()
    s = MB(M)
    s.box(-0.78, -0.56, -0.13, 0.0, 0.0, 1.12)
    s.box(0.56, 0.78, -0.13, 0.0, 0.0, 1.12)
    s.box(-0.78, 0.78, -0.11, 0.0, 0.9, 1.12)
    s.box(-0.88, 0.88, -0.24, 0.0, 1.12, 1.17)
    s.box(-0.84, 0.84, -0.2, 0.0, 1.09, 1.12)
    s.box(-0.8, -0.54, -0.15, 0.0, 0.0, 0.12)
    s.box(0.54, 0.8, -0.15, 0.0, 0.0, 0.12)
    s.obj(name + '_surround', surround, bevel=0.006, seg=2)
    ir = MB(M)
    ir.box(-0.56, 0.56, -0.05, 0.0, 0.0, 0.9)
    ir.obj(name + '_iron', iron, bevel=0.004, seg=2)
    # cavity (dark) as an inset box; opening drawn as a very dark recess
    cv = MB(M)
    cv.box(-0.36, 0.36, -0.055, -0.049, 0.0, 0.66)
    cv.obj(name + '_mouth', L.M('soot', '#050404', rough=0.9))
    h = MB(M)
    h.box(-0.9, 0.9, -0.55, 0.0, 0.0, 0.035)
    h.obj(name + '_hearth', hearth, bevel=0.004, seg=2)
    # grate + logs in front of the mouth
    g = MB(M)
    g.box(-0.24, 0.24, -0.2, -0.08, 0.035, 0.05)
    for sx in (-0.22, 0.22):
        g.box(sx - 0.01, sx + 0.01, -0.2, -0.08, 0.035, 0.18)
    g.obj(name + '_grate', K['black_metal'], bevel=0.003, seg=1)
    lg = MB(M)
    for k, (x, y, z, ang) in enumerate(((-0.02, -0.14, 0.09, 0.15), (0.03, -0.12, 0.14, -0.2), (0.0, -0.16, 0.19, 0.05))):
        lg.cyl(0, 0, -0.2, 0.2, 0.045, n=12, M=TR(x, y, z, rz=ang) @ Matrix.Rotation(PI / 2, 4, 'Y'))
    lg.obj(name + '_logs', L.M('log', '#3a2a1c', rough=0.9, bump=0.5), smooth=True)
    lights = []
    if fire:
        fl = MB(M)
        for k in range(7):
            x = rng.uniform(-0.16, 0.16)
            fl.sphere(x, -0.13 + rng.uniform(-0.03, 0.03), 0.2, rng.uniform(0.03, 0.05), sz=rng.uniform(2.0, 3.2), seg=10, rings=6)
        fl.obj(name + '_flames', L.M_emit('flame_fire', L.kelvin(1700), day=0.0, night=18.0, base=(0.1, 0.05, 0.02)), smooth=True)
        lights.append(L.light('POINT', P.world_pt(M, 0, -0.25, 0.3), 0.0, L.kelvin(1800), 0.12, day=0.0, night=45.0,
                              name=name + '_fireL'))
    return lights


def arc_lamp(M, base, shade, name='arc', night=45.0):
    b = MB(M)
    b.box(-0.15, 0.15, -0.15, 0.15, 0.0, 0.2)
    b.obj(name + '_base', base, bevel=0.01, seg=2)
    a = MB(M)
    pts = []
    R = 1.1
    for k in range(25):
        t = k / 24 * PI * 0.62
        pts.append(Vector((0.0, -R * (1 - math.cos(t)), 0.2 + 1.9 * math.sin(t))))
    for k in range(24):
        p0, p1 = pts[k], pts[k + 1]
        d = (p1 - p0)
        ln = d.length
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        a.cyl(0, 0, 0, ln, 0.012, n=8, M=Matrix.Translation(p0) @ rot)
    a.obj(name + '_arc', P.mats()['chrome'], smooth=True)
    tip = pts[-1]
    s = MB(M)
    s.lathe([(0.03, tip.z + 0.02), (0.12, tip.z - 0.05), (0.2, tip.z - 0.2)], n=32, cx=tip.x, cy=tip.y)
    s.obj(name + '_shade', shade, smooth=True)
    return [L.light('POINT', P.world_pt(M, tip.x, tip.y, tip.z - 0.14), night, P.WARM, 0.05, day=0.0, night=night,
                    name=name + '_L')]


def medallion(x, y, r=0.3):
    m = MB()
    m.lathe([(r, H), (r * 0.95, H - 0.02), (r * 0.7, H - 0.035), (r * 0.4, H - 0.04), (r * 0.2, H - 0.06), (0.0, H - 0.06)], n=40, cx=x, cy=y)
    m.obj('medallion', P.paint('#f0ece4', 0.35), smooth=True)


# ----------------------------------------------------------------------------
# rooms
# ----------------------------------------------------------------------------

def room_victorian_fireplace(rng):
    """Living room: SF Victorian parlour, chimney breast with fireplace, alcove shelves."""
    K = P.mats()
    wall = wall_mat('#a3b094')
    floor = floor_wood('#6b4529')
    trim = P.paint('#efebe2', 0.3)
    bx0, bx1, bd = -0.85, 0.85, 0.35
    path = [(-W / 2, -0.3), (-W / 2, D), (bx0, D), (bx0, D - bd), (bx1, D - bd), (bx1, D), (W / 2, D), (W / 2, -0.3)]
    shell(wall, floor)
    m = MB(); m.box(bx0, bx1, D - bd, D + 0.01, -0.01, H + 0.01); m.obj('breast', wall)
    trims([path], trim, base_h=0.24, crown='victorian', rail=2.35)
    lights = []
    lights += fireplace(TR(0, D - bd, 0), P.paint('#f2efe8', 0.25), K['black_metal'], K['marble'], rng)
    P.mirror(TR(0, D - bd, 1.85), 1.0, 1.05, name='fp_mirror')
    mb = MB(TR(0, D - bd - 0.12, 1.17))
    P.vase(mb, -0.55, 0, 0, 0.2, 0.06, color=(0.2, 0.3, 0.4))
    P.vase(mb, 0.45, 0, 0, 0.14, 0.05, color=(0.8, 0.75, 0.6), kind=2)
    mb.obj('mantel_vases', K['attr_gloss'], smooth=True)
    cs = MB(TR(0, D - bd - 0.12, 1.17))
    for x in (-0.7, 0.68):
        cs.lathe([(0.04, 0), (0.035, 0.01), (0.012, 0.03), (0.01, 0.18), (0.02, 0.2), (0.015, 0.21)], n=16, cx=x)
    cs.obj('candlesticks', K['brass'], smooth=True)
    cd = MB(TR(0, D - bd - 0.12, 1.17))
    for x in (-0.7, 0.68):
        cd.cyl(x, 0, 0.2, 0.36, 0.011, n=12)
    cd.obj('candles', K['candle'], smooth=True)
    st = MB(TR(0, D - bd - 0.12, 1.17)); P.stems(st, -0.55, 0, 0.18, 0.3, rng, 6); st.obj('mantel_stems', K['stem'], smooth=True)
    # alcove built-in shelves
    for sx, nm in ((-1, 'alc_l'), (1, 'alc_r')):
        cx = sx * (W / 2 + bx1) / 2
        P.bookshelf(TR(cx, D - 0.17, 0), trim, w=1.1, d=0.33, h=2.15, shelves=6, rng=rng, name=nm, fill=0.85)
    # seating group
    velvet = P.fabric('#2f4a4a', 'velvet_teal')
    P.sofa(at_left(2.05, 0.92), velvet, w=2.0, pillows=(P.fabric('#c9a24a'), P.fabric('#8a3a3a'), P.fabric('#e8e0cc')), rng=rng,
           style='chesterfield', legs=K['walnut'])
    P.armchair(facing(1.25, 2.35, -0.9, -0.35), P.leather('#6a3a22'), style='modern', legs=K['walnut'], name='arm1')
    rug_img = P.rug_image('rug_v', 'persian', rng)
    P.rug(TR(-0.25, 2.2, 0, rz=PI / 2), rug_img, 2.6, 1.9)
    P.table(TR(-0.4, 2.1, 0, rz=PI / 2), K['walnut'], w=1.1, d=0.55, h=0.42, leg='round', name='ctable')
    tb = MB()
    P.book_stack(tb, -0.35, 2.3, 0.42, rng, 3)
    tb.obj('ct_books', K['book'], bevel=0.002, seg=1)
    tv_ = MB(); P.vase(tv_, -0.45, 1.85, 0.42, 0.1, 0.09, kind=1, color=(0.85, 0.82, 0.75)); tv_.obj('ct_bowl', K['attr_gloss'], smooth=True)
    # side table + lamp near the window end of the sofa, floor lamp at the back
    P.table(TR(-1.72, 0.72, 0), K['walnut'], w=0.45, d=0.45, h=0.58, leg='round', name='stable')
    lights += P.table_lamp(TR(-1.72, 0.72, 0.58), shade='#efe2c8', name='tl1')
    lights += P.floor_lamp(TR(-1.7, 3.35, 0), shade='#efe2c8', name='fl1')
    # plants
    P.plant(TR(1.62, 3.3, 0), 'fig', 1.75, rng, pot_mat=K['terracotta'], name='fig')
    P.plant(TR(1.55, 0.55, 0), 'palm', 1.4, rng, pot_mat=K['ceramic'], name='palm')
    # art on right wall
    P.art(on_wall('r', 2.0, 1.75), P.art_image('art_v1', 'landscape', rng), 0.8, 0.6, frame='#b08d57', border=0.06, mat_border=0.06,
          frame_mat=K['brass'], name='a1')
    P.art(on_wall('r', 1.0, 1.6), P.art_image('art_v2', 'botanical', rng), 0.4, 0.55, frame='#2a1a10', border=0.03, mat_border=0.05, name='a2')
    medallion(0, 2.0)
    lights += P.chandelier(TR(0, 2.0, 0), ceil=H, drop=0.85, name='chand')
    # drapes at the window
    cm = P.curtain_mat('#5a2a2a')
    P.curtain(TR(-1.83, 0.12, 2.8), 0.3, 2.76, folds=4, depth=0.04, mat=cm, name='cur_l')
    P.curtain(TR(1.83, 0.12, 2.8), 0.3, 2.76, folds=4, depth=0.04, mat=cm, name='cur_r')
    outlets([('l', 3.4, 0.35), ('r', 3.0, 0.35)])
    return lights


def room_loft_brick(rng):
    """Living room: SoMa loft, exposed brick back wall, concrete floor, timber beams."""
    K = P.mats()
    wall = wall_mat('#e9e6e0')
    brick = L.MT('brick_loft', 'brick_tan', scale=1.8, normal=1.0, rough_mul=1.0)
    floor = L.MT('floor_concrete', 'concrete', tint='#8f8a83', scale=3.0, normal=0.4, rough_mul=0.6, coat=0.25)
    shell(wall, floor, back=brick)
    trims([DEFAULT_PATH], P.paint('#e9e6e0', 0.4), base_h=0.1)
    beams = MB()
    for x in (-1.35, 0.0, 1.35):
        beams.box(x - 0.1, x + 0.1, -0.3, D, H - 0.32, H)
    beams.box(-W / 2, W / 2, 2.4 - 0.1, 2.4 + 0.1, H - 0.34, H - 0.32 + 0.001)
    beams.obj('beams', P.M_wood('beam_wood', '#3a2616', '#6a4a2c', rough=0.7, coat=0.0, grain_axis='Y'), bevel=0.01, seg=2)
    duct = MB()
    duct.cyl(0, 0, -W / 2, W / 2, 0.13, n=28, M=TR(0, D - 0.3, H - 0.3) @ Matrix.Rotation(PI / 2, 4, 'Y'))
    duct.obj('duct', L.MT('duct_metal', 'metal', tint='#a8acb0', scale=1.0, metal=1.0, rough_mul=0.8), smooth=True)
    lights = []
    P.sofa(at_back(0.25, 0.95), P.leather('#8a4a24', 'cognac'), w=2.3, d=0.95, n=3, legs=K['black_metal'],
           pillows=(P.fabric('#d8d0bc'), P.fabric('#3a4a5a')), rng=rng)
    P.art(on_wall('b', 0.25, 1.75), P.art_image('art_l1', 'strokes', rng), 1.5, 1.0, frame='#111111', border=0.025, name='bigart')
    P.table(TR(0.25, 2.55, 0), P.M_wood('slab', '#5a3a22', '#9a6a40', coat=0.3), legs=K['black_metal'], w=1.25, d=0.65, h=0.4,
            leg='round', name='ct')
    tb = MB(); P.book_stack(tb, 0.0, 2.55, 0.4, rng, 2); tb.obj('ct_books', K['book'], bevel=0.002, seg=1)
    pl = MB(); P.vase(pl, 0.55, 2.5, 0.4, 0.09, 0.1, kind=1, color=(0.15, 0.15, 0.15)); pl.obj('ct_pot', K['attr_matte'], smooth=True)
    P.plant(TR(0.55, 2.5, 0.4), 'small', 0.35, rng, pot_mat=K['ceramic_dark'], name='ctplant')
    P.rug(TR(0.25, 2.6, 0), P.rug_image('rug_l', 'kilim', rng), 2.8, 2.0)
    P.armchair(facing(-1.25, 1.55, 0.75, 0.65), P.fabric('#b8b2a4'), legs=K['black_metal'], name='arm')
    lights += arc_lamp(TR(-1.55, 3.35, 0, rz=1.18), L.MT('marble_blk', 'marble', tint='#e8e6e2', scale=0.6, rough_mul=0.3),
                       P.mats()['chrome'], night=70.0)
    # industrial shelf on the right wall
    sh = L.M('shelf_metal', '#1a1a1a', rough=0.5, metal=0.6)
    fr = MB(at_right(2.2, 0.38))
    for x in (-0.6, 0.6):
        for y in (-0.17, 0.17):
            fr.box(x - 0.015, x + 0.015, y - 0.015, y + 0.015, 0, 2.1)
    fr.obj('ishelf_frame', sh, bevel=0.002, seg=1)
    boards = MB(at_right(2.2, 0.38))
    for z in (0.12, 0.55, 0.98, 1.41, 1.84):
        boards.box(-0.64, 0.64, -0.19, 0.19, z, z + 0.035)
    boards.obj('ishelf_boards', P.M_wood('shelfwood', '#6a4a2a', '#a07a4a'), bevel=0.004, seg=2)
    bk = MB(at_right(2.2, 0.38))
    for i, z in enumerate((0.155, 0.585, 1.015, 1.445)):
        P.books_row(bk, -0.6, 0.6 if i % 2 else 0.1, 0.17, z, 0.34, 0.24, rng, fill=0.85)
    bk.obj('ishelf_books', K['book'], bevel=0.0015, seg=1)
    dv = MB(at_right(2.2, 0.38))
    P.vase(dv, 0.35, 0.0, 0.585, 0.24, 0.07, color=(0.7, 0.35, 0.2))
    P.vase(dv, 0.25, 0.0, 1.445, 0.16, 0.08, kind=2, color=(0.9, 0.88, 0.8))
    P.vase(dv, -0.3, 0.0, 1.875, 0.2, 0.06, color=(0.1, 0.2, 0.25))
    dv.obj('ishelf_vases', K['attr_gloss'], smooth=True)
    P.plant(at_right(2.2, 0.38) @ TR(0.35, 0, 1.015), 'trail', 0.3, rng, name='shelfplant')
    P.plant(TR(-1.6, 0.55, 0), 'fig', 1.85, rng, pot_mat=L.M('pot_black', '#1c1c1c', rough=0.6), name='fig')
    P.plant(TR(1.65, 3.55, 0), 'snake', 0.9, rng, pot_mat=K['ceramic'], name='snake')
    for x in (-0.55, 1.05):
        lights += P.pendant(TR(x, 2.55, 0), ceil=H - 0.32, drop=0.75, kind='dome', color='#141414', night=65.0, name='pd%d' % int(x * 10))
    outlets([('b', -1.4, 0.3), ('l', 2.5, 0.3)])
    return lights


def room_living_tv(rng):
    """Living room: dusty-blue walls, sofa facing a wall-mounted TV (blue flicker at night)."""
    K = P.mats()
    wall = wall_mat('#a9b8c4')
    floor = floor_wood('#94693f')
    trim = P.paint('#f1efe9', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.16, crown='simple')
    lights = []
    P.sofa(at_left(2.25, 0.92), P.fabric('#7d7c78', 'fab_sofa_grey'), w=2.2,
           pillows=(P.fabric('#d9b44a'), P.fabric('#2e4a6a'), P.fabric('#e8e2d4')), rng=rng, legs=K['oak'])
    Mc = at_right(2.25, 0.42)
    P.cabinet(Mc, K['walnut'], w=1.7, d=0.42, h=0.5, rows=1, cols=3, doors=True, legs=True, name='media')
    lights += P.tv(on_wall('r', 2.25, 0.0, off=0.035), w=1.32, z=0.98, img=P.tv_image('tv_show1', 11), night=20.0, name='tv')
    dc = MB(Mc @ TR(0, 0, 0.5))
    P.book_stack(dc, 0.55, 0.0, 0.0, rng, 3)
    dc.box(-0.78, -0.62, -0.08, 0.08, 0.0, 0.3, color=(0.08, 0.08, 0.08))
    dc.obj('media_items', K['book'], bevel=0.002, seg=1)
    P.plant(Mc @ TR(-0.45, 0, 0.5), 'trail', 0.3, rng, name='mplant')
    P.table(TR(-0.5, 2.25, 0, rz=PI / 2), K['oak'], w=1.15, d=0.58, h=0.4, leg='round', name='ct')
    tb = MB(); P.book_stack(tb, -0.45, 2.45, 0.4, rng, 2); tb.obj('ct_books', K['book'], bevel=0.002, seg=1)
    rc = MB(); rc.box(-0.07, 0.07, -0.02, 0.02, 0.4, 0.415, color=(0.05, 0.05, 0.05), M=TR(-0.55, 2.0, 0, rz=0.4)); rc.obj('remote', K['attr_gloss'])
    P.rug(TR(-0.35, 2.3, 0, rz=PI / 2), P.rug_image('rug_tv', 'stripe', rng), 2.5, 1.8)
    P.bookshelf(at_back(-1.3, 0.34), P.paint('#f1efe9', 0.35), w=0.9, d=0.34, h=2.1, shelves=6, rng=rng, name='bs')
    P.art(on_wall('b', 0.35, 1.65), P.art_image('art_tv1', 'geo', rng), 0.9, 0.9, frame='#e8e4dc', border=0.03, mat_border=0.08, name='a1')
    P.armchair(facing(0.55, 3.35, -0.1, -1.0), P.fabric('#b5553a', 'fab_rust'), legs=K['oak'], name='arm')
    lights += P.floor_lamp(TR(-0.25, 3.62, 0), shade='#f0e8d8', night=16.0, name='fl')
    P.table(TR(-1.72, 0.85, 0), K['oak'], w=0.42, d=0.42, h=0.55, leg='round', name='st')
    lights += P.table_lamp(TR(-1.72, 0.85, 0.55), shade='#f0e8d8', night=0.0, name='tl')
    P.plant(TR(1.55, 0.55, 0), 'monstera', 1.3, rng, pot_mat=L.M('pot_basket', '#a88a60', rough=0.9, bump=0.6, bump_scale=120), name='mon')
    P.plant(TR(1.65, 3.65, 0), 'snake', 0.95, rng, pot_mat=K['ceramic'], name='snake')
    lights += P.flush_light(TR(0, 2.0, 0), night=0.0, name='fl_c')
    outlets([('r', 1.3, 0.3), ('l', 3.6, 0.3), ('b', 1.2, 0.3)])
    return lights


def room_bookish(rng):
    """Living room / library: butter-yellow Victorian, wall of books, reading corner."""
    K = P.mats()
    wall = wall_mat('#e3d3a2')
    floor = floor_wood('#5e3d24')
    trim = P.paint('#f3f0e8', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.24, crown='victorian', rail=2.4)
    lights = []
    shelf_paint = P.paint('#f3f0e8', 0.35)
    for k, x in enumerate((-1.32, 0.0, 1.32)):
        P.bookshelf(at_back(x, 0.34), shelf_paint, w=1.3, d=0.34, h=2.55, shelves=7, rng=rng, name='wall%d' % k, fill=0.93)
    lad = MB(TR(0.55, D - 0.62, 0, rx=-0.2))
    for sx in (-0.2, 0.2):
        lad.box(sx - 0.02, sx + 0.02, -0.02, 0.02, 0.0, 2.6)
    for k in range(1, 9):
        lad.box(-0.2, 0.2, -0.015, 0.015, k * 0.29, k * 0.29 + 0.025)
    lad.obj('ladder', K['walnut'], bevel=0.004, seg=2)
    P.armchair(facing(-1.05, 2.5, 0.5, -0.85), P.fabric('#2f5a45', 'fab_green_velvet'), style='chesterfield',
               legs=K['walnut'], name='wing')
    ot = MB(TR(-0.6, 1.75, 0))
    ot.box(-0.28, 0.28, -0.22, 0.22, 0.12, 0.42)
    ot.obj('ottoman', P.leather('#5a3420'), bevel=0.04, seg=3)
    lights += P.floor_lamp(TR(-1.7, 3.1, 0), shade='#efe0c0', base=K['brass'], night=38.0, name='fl')
    P.table(TR(-1.6, 1.85, 0), K['walnut'], w=0.4, d=0.4, h=0.55, leg='pedestal', name='st')
    sm = MB(); P.book_stack(sm, -1.6, 1.85, 0.55, rng, 3); sm.obj('st_books', K['book'], bevel=0.002, seg=1)
    mg = MB(); mg.cyl(-1.5, 1.72, 0.55, 0.645, 0.04, n=16, color=(0.9, 0.88, 0.84)); mg.obj('mug', K['attr_gloss'], smooth=True)
    P.sofa(at_right(1.95, 0.9), P.fabric('#9a4a2e', 'fab_rust_velvet'), w=2.0, pillows=(P.fabric('#e3d3a2'), P.fabric('#2f5a45')),
           rng=rng, legs=K['walnut'])
    P.table(TR(0.35, 1.95, 0), K['walnut'], w=0.9, d=0.9, h=0.44, leg='round_top', name='rt')
    ct = MB(); P.book_stack(ct, 0.3, 2.0, 0.44, rng, 4); ct.obj('rt_books', K['book'], bevel=0.002, seg=1)
    P.rug(TR(0.0, 2.1, 0), P.rug_image('rug_lib', 'persian', rng), 3.0, 2.1)
    P.plant(TR(-1.62, 0.5, 0), 'bush', 0.95, rng, pot_mat=K['terracotta'], name='bush')
    P.plant(TR(1.65, 3.4, 0), 'palm', 1.6, rng, pot_mat=K['ceramic'], name='palm')
    P.art(on_wall('l', 1.3, 1.75), P.art_image('art_lib1', 'landscape', rng), 0.7, 0.55, frame_mat=K['brass'], border=0.05, mat_border=0.05, name='a1')
    P.art(on_wall('l', 2.2, 1.85), P.art_image('art_lib2', 'photo', rng), 0.35, 0.45, frame='#1a1a1a', border=0.025, mat_border=0.05, name='a2')
    medallion(0.1, 2.0, 0.25)
    lights += P.pendant(TR(0.1, 2.0, 0), ceil=H, drop=0.8, kind='drum', night=40.0, r=0.28, name='drum')
    sun_patch(elev=35, azim=28, strength=3.0)
    outlets([('l', 3.5, 0.35), ('r', 3.4, 0.35)])
    return lights


def room_modern_hall(rng):
    """Living room: modern greige, doorway into a dim hallway, sideboard, big art."""
    K = P.mats()
    wall = wall_mat('#e2ddd4')
    floor = floor_wood('#a47c52', coat=0.3)
    trim = P.paint('#e2ddd4', 0.35)
    dx0, dx1, dh = 0.95, 1.8, 2.15
    shell(wall, floor, back_door=(dx0, dx1, dh))
    trims(door_path(dx0, dx1), trim, base_h=0.12)
    KIT.door_casing(TR(0, D, 0), dx0, dx1, dh, trim)
    lights = KIT.hallway(dx0, dx1, dh, 1.3, wall_mat('#d8d2c6'), floor, rng, night=14.0, day=0.0,
                         art_img=P.art_image('art_hall', 'photo', rng))
    P.sofa(at_back(-0.6, 0.95), P.fabric('#d9d1c3', 'fab_boucle'), w=2.1, d=0.95, n=2,
           pillows=(P.fabric('#8a9a8a'), P.fabric('#c8a070')), rng=rng, legs=K['walnut'])
    P.art(on_wall('b', -1.05, 1.72), P.art_image('art_m1', 'blocks', rng), 0.62, 0.82, frame_mat=K['oak'], border=0.025, name='a1')
    P.art(on_wall('b', -0.15, 1.72), P.art_image('art_m2', 'blocks', rng), 0.62, 0.82, frame_mat=K['oak'], border=0.025, name='a2')
    P.table(TR(-0.55, 2.35, 0), K['marble'], legs=K['black_metal'], w=0.85, d=0.85, h=0.38, leg='round_top', name='ct')
    KIT.fruit_bowl(TR(-0.45, 2.3, 0.38), rng, 'ctbowl')
    ft = MB(TR(-0.55, 2.35, 0.38)); P.book_stack(ft, -0.2, 0.1, 0.0, rng, 2); ft.obj('ct_books', K['book'], bevel=0.002, seg=1)
    P.armchair(facing(0.75, 1.35, -0.6, 0.8), P.leather('#3a2a20', 'lea_dark'), legs=K['black_metal'], name='lounge')
    P.rug(TR(-0.4, 2.45, 0), P.rug_image('rug_mod', 'plain', rng), 2.7, 2.0)
    Ms = at_right(2.0, 0.45)
    P.cabinet(Ms, K['walnut'], w=1.6, d=0.45, h=0.72, rows=1, cols=4, doors=True, legs=True, name='sideboard')
    P.art(on_wall('r', 2.0, 1.6), P.art_image('art_m3', 'strokes', rng), 1.2, 0.8, frame='#111111', border=0.02, name='a3')
    lights += P.table_lamp(Ms @ TR(0.55, 0.0, 0.72), shade='#efe6d6', h=0.55, night=20.0, name='sb_lamp')
    sd = MB(Ms @ TR(0, 0, 0.72)); P.vase(sd, -0.5, 0.0, 0.0, 0.3, 0.07, color=(0.1, 0.1, 0.1)); P.vase(sd, -0.3, 0.02, 0.0, 0.16, 0.06, kind=2, color=(0.75, 0.55, 0.4))
    sd.obj('sb_vases', K['attr_gloss'], smooth=True)
    st = MB(Ms @ TR(0, 0, 0.72)); P.stems(st, -0.5, 0.0, 0.28, 0.4, rng, 5); st.obj('sb_stems', K['stem'], smooth=True)
    P.plant(TR(-1.6, 0.6, 0), 'monstera', 1.5, rng, pot_mat=K['ceramic'], name='mon')
    P.plant(TR(1.65, 0.55, 0), 'fig', 1.6, rng, pot_mat=L.M('pot_black', '#1c1c1c', rough=0.6), name='fig')
    lights += P.floor_lamp(TR(0.7, 3.65, 0), shade='#efe6d6', base=K['black_metal'], night=28.0, name='fl')
    lights += P.pendant(TR(-0.55, 2.35, 0), ceil=H, drop=0.9, kind='globe', night=30.0, r=0.2, name='globe')
    outlets([('b', 0.5, 0.3), ('l', 2.5, 0.3)])
    return lights


def room_bedroom_blush(rng):
    """Bedroom: blush Victorian, bed against the back wall, bedside lamps, dresser."""
    K = P.mats()
    wall = wall_mat('#e0c3b8')
    floor = floor_wood('#86603c')
    trim = P.paint('#f4f1ea', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.22, crown='victorian', rail=2.35)
    lights = []
    l = 2.05
    P.bed(TR(0, D - l / 2 - 0.1, 0), P.fabric('#f1eee6', 'fab_duvet_w', 0.6), P.fabric('#e6e1d6', 'fab_sheet'),
          [P.fabric('#f4f1ea', 'fab_pw'), P.fabric('#f4f1ea', 'fab_pw'), P.fabric('#b87a74', 'fab_rose'), P.fabric('#8fa08a', 'fab_sage')],
          K['oak'], w=1.6, l=l, head='upholstered', head_mat=P.fabric('#b9ab98', 'fab_linen'), throw=P.fabric('#c9a24a', 'fab_mustard'), rng=rng)
    for sx in (-1, 1):
        Mn = at_back(sx * 1.17, 0.42)
        P.cabinet(Mn, P.paint('#f4f1ea', 0.35), w=0.5, d=0.42, h=0.56, rows=2, cols=1, legs=True, name='ns%d' % (sx + 1))
        lights += P.table_lamp(Mn @ TR(-sx * 0.05, 0.02, 0.56), shade='#f3e9d8', h=0.55, r=0.15, night=30.0, name='bl%d' % (sx + 1))
    nb = MB(at_back(1.17, 0.42) @ TR(0.1, -0.05, 0.56)); P.book_stack(nb, 0.05, 0, 0, rng, 2); nb.obj('ns_books', K['book'], bevel=0.002, seg=1)
    P.art(on_wall('b', 0.0, 1.85), P.art_image('art_bed1', 'landscape', rng), 1.3, 0.62, frame_mat=K['oak'], border=0.03, mat_border=0.06, name='a1')
    Md = at_left(1.6, 0.5)
    P.cabinet(Md, K['walnut'], w=1.25, d=0.5, h=0.86, rows=3, cols=2, legs=True, name='dresser')
    P.mirror(on_wall('l', 1.6, 1.55), 0.8, 0.9, frame_mat=K['brass'], name='dmirror')
    dd = MB(Md @ TR(0, 0, 0.86)); P.vase(dd, -0.4, 0.05, 0.0, 0.22, 0.06, color=(0.85, 0.75, 0.7)); dd.box(0.25, 0.45, -0.1, 0.05, 0.0, 0.07, color=(0.3, 0.15, 0.1))
    dd.obj('dresser_items', K['attr_gloss'], bevel=0.002, seg=1)
    ds = MB(Md @ TR(0, 0, 0.86)); P.stems(ds, -0.4, 0.05, 0.2, 0.35, rng, 6); ds.obj('dresser_stems', K['stem'], smooth=True)
    P.armchair(facing(1.35, 1.05, -0.8, -0.5), P.fabric('#8fa08a', 'fab_sage2'), legs=K['oak'], name='chair')
    P.rug(TR(0, 1.7, 0), P.rug_image('rug_bed', 'persian', rng), 2.6, 1.7)
    P.plant(TR(1.68, 3.05, 0), 'fig', 1.55, rng, pot_mat=K['terracotta'], name='fig')
    lights += P.flush_light(TR(0, 2.0, 0), night=0.0, name='ceil')
    cm = P.curtain_mat('#f6f2ea', sheer=True)
    P.curtain(TR(-1.78, 0.12, 2.82), 0.38, 2.78, folds=6, depth=0.04, mat=cm, name='cur_l')
    P.curtain(TR(1.78, 0.12, 2.82), 0.38, 2.78, folds=6, depth=0.04, mat=cm, name='cur_r')
    sun_patch(elev=42, azim=-25, strength=2.6)
    outlets([('b', -1.55, 0.3), ('r', 2.4, 0.3)])
    return lights


def room_bedroom_navy(rng):
    """Bedroom: navy accent wall behind the bed, TV on the dresser (blue at night)."""
    K = P.mats()
    wall = wall_mat('#d5cfc4')
    navy = wall_mat('#2d3b52', detail=0.5)
    floor = L.MT('carpet_grey', 'carpet', tint='#8d8983', scale=1.2, normal=0.7)
    trim = P.paint('#efebe4', 0.3)
    shell(wall, floor, left=navy)
    trims([DEFAULT_PATH], trim, base_h=0.14)
    lights = []
    l = 2.05
    P.bed(TR(-W / 2 + l / 2 + 0.1, 2.2, 0, rz=PI / 2), P.fabric('#c9c4ba', 'fab_duvet_g', 0.6), P.fabric('#eeeae2', 'fab_sheet2'),
          [P.fabric('#eeeae2', 'fab_pw2'), P.fabric('#eeeae2', 'fab_pw2'), P.fabric('#c77a3a', 'fab_ochre')],
          P.paint('#2a2a2a', 0.5), w=1.6, l=l, head='wood', head_mat=K['walnut'], throw=P.fabric('#3d4e6a', 'fab_navy'), rng=rng)
    for y in (1.02, 3.38):
        P.cabinet(at_left(y, 0.4), K['walnut'], w=0.45, d=0.4, h=0.52, rows=2, cols=1, legs=True, name='ns%d' % int(y * 10))
    lights += P.table_lamp(at_left(3.38, 0.4) @ TR(0, 0, 0.52), shade='#e8e0cc', h=0.5, r=0.14, night=10.0, name='bl')
    P.art(on_wall('l', 2.2, 1.7), P.art_image('art_nv', 'photo', rng), 1.0, 0.7, frame='#e8e4dc', border=0.025, mat_border=0.08, name='a1')
    Md = at_right(2.3, 0.5)
    P.cabinet(Md, K['walnut'], w=1.5, d=0.5, h=0.78, rows=3, cols=3, legs=True, name='dresser')
    lights += P.tv(Md @ TR(0, 0.05, 0.78), w=1.0, z=0.1, wall=False, img=P.tv_image('tv_show2', 21), night=16.0, name='tv')
    P.wardrobe(at_back(1.25, 0.6), P.paint('#efebe4', 0.35), w=1.1, d=0.6, h=2.1)
    KIT.desk(at_back(-0.25, 0.55), K['oak'], K['black_metal'], w=1.05, d=0.55, name='desk')
    lp = MB(at_back(-0.25, 0.55) @ TR(0, 0, 0.74))
    lp.box(-0.17, 0.17, -0.12, 0.12, 0, 0.012, color=(0.6, 0.6, 0.62), M=TR(0.1, -0.05, 0))
    lp.box(-0.17, 0.17, -0.005, 0.005, 0, 0.23, color=(0.6, 0.6, 0.62), M=TR(0.1, 0.07, 0.012, rx=-0.25))
    P.book_stack(lp, -0.35, 0.05, 0.0, rng, 3)
    lp.obj('desk_items', K['attr_gloss'], bevel=0.002, seg=1)
    P.dining_chair(at_back(-0.25, 0.55) @ TR(0, -0.5, 0, rz=PI + 0.2), K['oak'], seat=P.fabric('#3d4e6a'), name='dchair', style='solid')
    P.rug(TR(-0.4, 2.2, 0), P.rug_image('rug_nv', 'plain', rng), 2.4, 2.8)
    P.plant(TR(1.65, 0.5, 0), 'snake', 1.0, rng, pot_mat=K['ceramic_dark'], name='snake')
    lights += P.flush_light(TR(0, 2.0, 0), night=0.0, name='ceil')
    outlets([('r', 1.2, 0.3), ('b', -1.0, 0.3)])
    return lights


def room_bedroom_student(rng):
    """Bedroom: mint student room, desk with monitor, posters, fairy lights, beanbag."""
    K = P.mats()
    wall = wall_mat('#c3d9ca')
    floor = floor_wood('#b08a60', coat=0.2)
    trim = P.paint('#f4f2ee', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.12)
    lights = []
    l = 2.0
    P.bed(TR(1.2, D - l / 2 - 0.06, 0), P.fabric('#5f7896', 'fab_duvet_b', 0.6), P.fabric('#eeeeea', 'fab_sheet3'),
          [P.fabric('#eeeeea', 'fab_pw3'), P.fabric('#e0b64a', 'fab_yel')], K['pine'], w=1.4, l=l, head='metal', rng=rng)
    Md = at_left(1.5, 0.65)
    lights += KIT.workstation(Md, rng, P.paint('#f2f2f0', 0.4), P.paint('#f2f2f0', 0.4), P.fabric('#303030'),
                              P.screen_image('scr_student', 7, 'code'), w=1.3, d=0.65, on_day=False, on_night=True,
                              name='ws', lamp=True, night_lamp=30.0, papers=True)
    P.bookshelf(at_left(3.35, 0.3), K['pine'], w=0.8, d=0.3, h=1.8, shelves=5, rng=rng, name='bs', fill=0.8)
    for k, (x, z, kind) in enumerate(((-1.35, 1.7, 'poster'), (-0.6, 1.8, 'poster'), (0.05, 1.55, 'bridge'))):
        P.art(on_wall('b', x, z), P.art_image('pst%d' % k, kind, rng), 0.5, 0.7, frame='#ffffff', border=0.008, depth=0.008, name='pst%d' % k)
    lights += KIT.string_lights((0.35, D - 0.03, 2.3), (1.95, D - 0.03, 2.35), sag=0.18, n=20, night=26.0)
    bb = MB(TR(-0.7, 2.6, 0))
    bb.sphere(0, 0, 0.26, 0.45, sz=0.62, seg=24, rings=12)
    bb.obj('beanbag', P.fabric('#b5553a', 'fab_beanbag'), subsurf=1)
    P.rug(TR(-0.2, 2.2, 0), P.rug_image('rug_st', 'kilim', rng), 2.0, 1.4)
    P.plant(TR(-1.62, 0.55, 0), 'bush', 0.8, rng, pot_mat=K['terracotta'], name='bush')
    bk = MB(); bk.box(-0.2, 0.2, -0.15, 0.15, 0, 0.3, color=(0.2, 0.2, 0.22), M=TR(0.3, 1.2, 0, rz=0.3)); bk.obj('backpack', P.fabric('#2a3548', 'fab_pack'), bevel=0.05, seg=3)
    lights += P.pendant(TR(0.2, 2.0, 0), ceil=H, drop=0.5, kind='bulb', night=0.0, name='bare')
    outlets([('l', 2.3, 0.3), ('b', 0.4, 0.3)])
    return lights


def room_kitchen_white(rng):
    """Kitchen: white shaker cabinets, marble, subway tile, island with stools, pendants."""
    K = P.mats()
    wall = wall_mat('#ebe7df')
    floor = floor_wood('#8a6240')
    trim = P.paint('#f4f2ec', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.14, crown='simple')
    lights = []
    cab = P.paint('#f0eee8', 0.28)
    splash = KIT.M_tiles('subway', '#f2f1ec', '#c8c4ba', scale=0.8, sx=2.0)
    lights += KIT.kitchen_run(TR(0, D, 0), -W / 2, 1.05, cab, K['marble'], splash, K['brass'], rng, range_x=-0.35, sink_x=-1.4,
                              upper_skip=(-0.35,), hood=-0.35, name='krun', night_under=10.0)
    KIT.fridge(at_back(1.52, 0.72, gap=0.0), w=0.9, d=0.72, h=1.9)
    KIT.island(TR(-0.35, 1.9, 0), 1.9, 0.9, P.paint('#3d4f5c', 0.35), K['marble'], K['brass'])
    for x in (-1.0, -0.35, 0.3):
        P.stool(TR(x, 1.2, 0), K['oak'], h=0.66, name='stool%d' % int(x * 10 + 20))
    KIT.fruit_bowl(TR(-0.7, 1.95, 0.92), rng, 'bowl')
    it = MB()
    KIT.kettle(it, -0.55, D - 0.44, 0.925, color=(0.55, 0.06, 0.04))
    KIT.jars(it, 0.3, D - 0.12, 0.92, 3, rng)
    it.box(-1.95, -1.6, D - 0.04, D - 0.02, 0.92, 1.3, color=(0.55, 0.38, 0.22))
    P.book_stack(it, 0.0, 1.9, 0.92, rng, 2)
    it.obj('kitchen_items', K['attr_gloss'], bevel=0.002, seg=1)
    P.plant(TR(0.75, D - 0.3, 0.92), 'small', 0.25, rng, pot_mat=K['terracotta'], name='herb')
    Ml = TR(-W / 2, 0, 0, rz=PI / 2)
    sh = MB(Ml)
    for z in (1.45, 1.85):
        sh.box(1.9, 3.1, -0.26, 0.0, z, z + 0.035)
    sh.obj('lshelf', K['oak'], bevel=0.004, seg=2)
    ds = MB(Ml)
    KIT.plates_stack(ds, 2.2, -0.13, 1.485, 6)
    KIT.plates_stack(ds, 2.55, -0.13, 1.485, 4, r=0.1)
    KIT.jars(ds, 2.2, -0.12, 1.885, 5, rng)
    ds.obj('lshelf_items', K['attr_gloss'], smooth=True)
    P.art(on_wall('l', 1.0, 1.6), P.art_image('art_k1', 'botanical', rng), 0.45, 0.6, frame_mat=K['oak'], border=0.02, mat_border=0.04, name='a1')
    P.door(on_wall('r', 2.3, 0.0), mat=trim, name='door', panels=4)
    for x in (-0.95, 0.25):
        lights += P.pendant(TR(x, 1.9, 0), ceil=H, drop=0.95, kind='dome', mat=K['brass'], night=38.0, r=0.17, name='pk%d' % int(x * 10 + 20))
    outlets([('r', 3.5, 1.1)])
    return lights


def room_kitchen_retro(rng):
    """Kitchen: retro galley, mint cabinets, checker floor, dinette with chrome table."""
    K = P.mats()
    wall = wall_mat('#efe3c3')
    floor = KIT.M_tiles('checker_floor', scale=2.4, checker=('#efece2', '#1c1c1e'), grout='#6a6a66', rough=0.25)
    trim = P.paint('#f4f0e4', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.1)
    lights = []
    cab = P.paint('#96c7b0', 0.3)
    top = L.M('laminate', '#e9e4d6', rough=0.3, coat=0.2)
    splash = KIT.M_tiles('tile_yellow', '#e8d488', '#b8aa80', scale=1.0)
    Ml = TR(-W / 2, 0, 0, rz=PI / 2)
    lights += KIT.kitchen_run(Ml, 1.3, D, cab, top, splash, K['chrome'], rng, range_x=3.35, sink_x=2.2, upper_skip=(3.35,),
                              hood=None, name='lrun', night_under=8.0)
    KIT.fridge(at_back(-0.9, 0.7, gap=0.0), w=0.75, d=0.7, h=1.62, mat=L.M('retro_cream', '#ece2c8', rough=0.25, coat=0.6), retro=True)
    sh = MB(TR(0, D, 0))
    for z in (1.35, 1.75):
        sh.box(0.1, 1.7, -0.25, 0.0, z, z + 0.03)
    sh.obj('bshelf', P.paint('#96c7b0', 0.35), bevel=0.004, seg=2)
    ds = MB(TR(0, D, 0))
    KIT.plates_stack(ds, 0.35, -0.12, 1.38, 5, color=(0.9, 0.35, 0.3))
    KIT.jars(ds, 0.7, -0.12, 1.38, 4, rng)
    KIT.plates_stack(ds, 1.4, -0.12, 1.78, 6, r=0.11, color=(0.95, 0.9, 0.6))
    KIT.kettle(ds, 1.0, -0.12, 1.78, color=(0.1, 0.45, 0.6))
    ds.obj('bshelf_items', K['attr_gloss'], smooth=True)
    P.cabinet(at_back(0.9, 0.45), P.paint('#96c7b0', 0.3), w=1.4, d=0.45, h=0.86, rows=2, cols=2, top=top, handle=K['chrome'], legs=False, name='sb')
    KIT.fruit_bowl(at_back(0.9, 0.45) @ TR(0.3, 0, 0.86), rng, 'bowl')
    ck = MB(TR(0.9, D, 2.2)); ck.cyl(0, 0, 0, 0.03, 0.15, n=32, M=Matrix.Rotation(PI / 2, 4, 'X')); ck.obj('clock', L.M('clock_red', '#c8372d', rough=0.3), smooth=True)
    P.table(TR(1.15, 1.55, 0), L.M('formica', '#d84a3a', rough=0.3, coat=0.4), legs=K['chrome'], w=0.9, d=0.9, h=0.74, leg='round_top', name='dinette')
    for (x, y, fx, fy) in ((1.15, 0.95, 0, 1), (1.15, 2.15, 0, -1)):
        P.dining_chair(facing(x, y, fx, fy), K['chrome'], seat=L.M('vinyl_red', '#b82e2a', rough=0.35, coat=0.3), name='dch%d' % int(y * 10), style='solid')
    tb = MB(TR(1.15, 1.55, 0.74)); P.vase(tb, 0.1, 0.05, 0.0, 0.18, 0.05, kind=2, color=(0.9, 0.9, 0.95)); tb.obj('tvase', K['glass'], smooth=True)
    P.art(on_wall('r', 1.6, 1.65), P.art_image('art_r1', 'poster', rng), 0.5, 0.7, frame_mat=K['chrome'], border=0.02, name='a1')
    P.plant(TR(1.7, 3.5, 0), 'palm', 1.3, rng, pot_mat=K['terracotta'], name='palm')
    lights += P.pendant(TR(1.15, 1.55, 0), ceil=H, drop=1.05, kind='cone', color='#e8e0c8', night=40.0, r=0.2, name='pd')
    lights += P.flush_light(TR(-0.8, 2.6, 0), night=26.0, name='ceil', color=L.kelvin(3500))
    sun_patch(elev=30, azim=-35, strength=3.0)
    return lights


def office_common(ceil_panels, day_panels=9.0, night_panels=34.0, carpet='#5d6166'):
    wall = wall_mat('#e6e6e3')
    floor = L.MT('carpet_' + carpet.lstrip('#'), 'carpet', tint=carpet, scale=1.0, normal=0.8)
    shell(wall, floor, ceil=L.M('acoustic', '#e2e0da', rough=0.95, bump=0.25, bump_scale=300.0))
    trims([DEFAULT_PATH], L.M('vinyl_base', '#3a3a3a', rough=0.5), base_h=0.1)
    KIT.drop_ceiling(H, -W / 2, W / 2, -0.3, D, name='dc')
    lights = []
    for k, (x, y, on_n) in enumerate(ceil_panels):
        lights += P.ceiling_panel(TR(x, y, 0), ceil=H, w=0.6, d=1.2, day=day_panels, night=night_panels if on_n else 0.0,
                                  emit_d=3.0, emit_n=6.0 if on_n else 0.0, name='pan%d' % k)
    return lights


def room_office_open(rng):
    """Office: open-plan bench desks, filing cabinets, whiteboard, panel lights on."""
    K = P.mats()
    lights = office_common([(-1.2, 1.2, False), (1.2, 1.2, True), (-1.2, 3.0, True), (1.2, 3.0, False)])
    top = P.paint('#eeeeec', 0.4)
    leg = P.paint('#cfd1d3', 0.35)
    chair = P.fabric('#2c3440', 'fab_ochair')
    for x in (-0.72, 0.72):
        lights += KIT.workstation(TR(x, 1.75, 0), rng, top, leg, chair, P.screen_image('scr_o%d' % int(x * 10 + 10), int(x * 10 + 12), 'sheet'),
                                  w=1.4, d=0.75, n_mon=2, name='wsA%d' % int(x * 10 + 10))
        lights += KIT.workstation(TR(x, 2.55, 0, rz=PI), rng, top, leg, chair, P.screen_image('scr_p%d' % int(x * 10 + 10), int(x * 10 + 30), 'web'),
                                  w=1.4, d=0.75, n_mon=1, name='wsB%d' % int(x * 10 + 10))
    sc = MB(); sc.box(-1.42, 1.42, 2.14, 2.16, 0.74, 1.12); sc.obj('screen_div', P.fabric('#6a7a8a', 'fab_panel'), bevel=0.01, seg=2)
    for k, x in enumerate((-1.65, -1.15, -0.65)):
        KIT.filing_cabinet(at_back(x, 0.62), name='fc%d' % k)
    pr = MB(at_back(-1.15, 0.62) @ TR(0, 0, 1.32)); pr.box(-0.22, 0.22, -0.2, 0.2, 0, 0.28, color=(0.85, 0.85, 0.84)); pr.obj('printer', K['attr_matte'], bevel=0.01, seg=2)
    KIT.whiteboard(on_wall('b', 0.75, 1.45), 1.7, 1.0, rng)
    P.plant(TR(1.68, 3.6, 0), 'palm', 1.6, rng, pot_mat=P.paint('#e8e8e4', 0.4), name='palm')
    P.plant(TR(-1.65, 0.5, 0), 'snake', 1.0, rng, pot_mat=K['ceramic'], name='snake')
    P.door(on_wall('l', 3.0, 0.0), mat=P.paint('#b8a88a', 0.4), casing=P.paint('#9a9a98', 0.4), panels=0, name='door', knob=K['chrome'])
    P.art(on_wall('r', 2.0, 1.6), P.art_image('art_o1', 'geo', rng), 1.0, 0.7, frame_mat=K['chrome'], border=0.015, name='a1')
    return lights


def room_office_brick(rng):
    """Office: small brick-walled office, executive desk facing the window, bookshelves."""
    K = P.mats()
    wall = wall_mat('#e4e0d8')
    brick = L.MT('brick_off', 'brick_tan', scale=1.8, normal=1.0)
    floor = floor_wood('#5a3a22')
    shell(wall, floor, left=brick)
    trims([DEFAULT_PATH], P.paint('#e4e0d8', 0.35), base_h=0.12)
    lights = []
    Md = TR(0.05, 2.45, 0, rz=PI)
    lights += KIT.workstation(Md, rng, K['walnut'], K['walnut'], P.leather('#1e1a18', 'lea_exec'), P.screen_image('scr_ex', 9, 'web'),
                              w=1.7, d=0.8, n_mon=2, on_day=True, on_night=True, name='exec', chair=False)
    P.armchair(TR(0.05, 3.2, 0, rz=PI), P.leather('#1e1a18', 'lea_exec'), w=0.7, d=0.7, name='execchair')
    lights += KIT.desk_lamp(Md @ TR(-0.65, -0.2, 0.74, rz=PI), night=40.0, kind='bankers', name='bank')
    for x in (-0.55, 0.65):
        P.dining_chair(facing(x, 1.45, 0, 1), K['walnut'], seat=P.leather('#6a3a22'), name='guest%d' % int(x * 10 + 10), style='solid')
    for k, x in enumerate((-1.3, -0.35)):
        P.bookshelf(at_back(x, 0.36), K['walnut'], w=0.92, d=0.36, h=2.3, shelves=6, rng=rng, name='obs%d' % k,
                    palette=['#1f2f4f', '#7a1f1f', '#2f4a32', '#1c1c1c', '#8a6a3a', '#5a2e1a'])
    for k, x in enumerate((0.85, 1.35)):
        KIT.filing_cabinet(at_back(x, 0.62), h=1.02, drawers=3, mat=L.M('fcab_olive', '#5f6450', rough=0.4, metal=0.4), name='fc%d' % k)
    P.art(on_wall('b', 1.1, 1.7), P.art_image('art_ob1', 'photo', rng), 0.8, 0.55, frame='#111111', border=0.02, mat_border=0.06, name='a1')
    Mr = at_right(1.9, 0.9)
    P.sofa(Mr, P.leather('#6a3a22', 'lea_chester'), w=1.8, n=2, style='chesterfield', legs=K['walnut'], name='osofa')
    P.art(on_wall('r', 1.9, 1.75), P.art_image('art_ob2', 'bridge', rng), 1.2, 0.75, frame_mat=K['brass'], border=0.03, name='a2')
    P.plant(TR(1.65, 0.55, 0), 'fig', 1.7, rng, pot_mat=L.M('pot_black', '#1c1c1c', rough=0.6), name='fig')
    P.plant(TR(-1.65, 3.2, 0), 'snake', 0.9, rng, pot_mat=K['terracotta'], name='snake')
    P.rug(TR(0.05, 2.2, 0), P.rug_image('rug_off', 'persian', rng), 2.6, 2.4)
    lights += P.pendant(TR(0.05, 2.2, 0), ceil=H, drop=0.9, kind='cone', color='#1a1a1a', night=60.0, name='pd')
    outlets([('b', 0.5, 0.3), ('r', 3.2, 0.3)])
    return lights


def room_office_cubicles(rng):
    """Office: cubicle farm; by night everything is off except an exit sign and one monitor."""
    K = P.mats()
    lights = office_common([(-1.2, 1.5, False), (1.2, 1.5, False), (-1.2, 3.3, False), (1.2, 3.3, False)], carpet='#6d6a62')
    top = P.paint('#d8d4cc', 0.45)
    leg = P.paint('#5a5c60', 0.4)
    chair = P.fabric('#23262b', 'fab_ochair2')
    pan = MB()
    fab = P.fabric('#8c8f94', 'fab_cube')
    KIT.cubicle_panel(pan, -1.97, 2.4, 1.97, 2.4, h=1.35)            # divides the two rows
    KIT.cubicle_panel(pan, 0.0, 2.4, 0.0, 3.97, h=1.35)              # back-row divider
    KIT.cubicle_panel(pan, 0.0, 1.15, 0.0, 2.4, h=1.2)               # front-row divider
    pan.obj('cubes', fab, bevel=0.01, seg=2)
    tr = MB()
    tr.box(-1.97, 1.97, 2.37, 2.43, 1.35, 1.37)
    tr.box(-0.03, 0.03, 2.4, 3.97, 1.35, 1.37)
    tr.box(-0.03, 0.03, 1.15, 2.4, 1.2, 1.22)
    tr.obj('cube_trim', L.M('alu', '#c8cacc', rough=0.3, metal=1.0))
    k = 0
    for x in (-1.0, 1.0):
        for y in (3.58, 2.02):
            lights += KIT.workstation(TR(x, y, 0), rng, top, leg, chair, P.screen_image('scr_c%d' % k, 40 + k, ['code', 'sheet', 'web', 'sheet'][k]),
                                      w=1.5, d=0.7, n_mon=1 + (k % 2), on_day=True, on_night=(k == 1), name='cws%d' % k)
            k += 1
    pin = MB()
    for (x, y, z) in ((-1.4, 2.37, 1.0), (-0.7, 2.37, 1.1), (1.2, 2.37, 0.95)):
        pin.box(x - 0.1, x + 0.1, y - 0.004, y, z, z + 0.28, color=(0.95, 0.95, 0.9))
    pin.obj('pinned_papers', K['paper'])
    KIT.exit_sign(on_wall('b', -1.2, 2.55))
    P.plant(TR(1.7, 0.45, 0), 'palm', 1.5, rng, pot_mat=P.paint('#e8e8e4', 0.4), name='palm')
    wc = MB(TR(-1.7, 0.45, 0)); wc.box(-0.16, 0.16, -0.16, 0.16, 0.0, 1.0, color=(0.9, 0.9, 0.9)); wc.obj('cooler', K['attr_matte'], bevel=0.01, seg=2)
    bt = MB(TR(-1.7, 0.45, 1.0)); bt.cyl(0, 0, 0.0, 0.4, 0.14, n=24); bt.obj('bottle', L.M('bottle_blue', (0.5, 0.7, 0.9), rough=0.05, transmission=0.9), smooth=True)
    lights.append(L.light('POINT', (-1.2, D - 0.3, 2.45), 0.0, (0.2, 1.0, 0.4), 0.1, day=0.0, night=0.15, name='exit_glow'))
    return lights


def room_dining(rng):
    """Dining room: Victorian with wainscoting, table for six, chandelier, sideboard."""
    K = P.mats()
    wall = wall_mat('#d8c1ad')
    floor = floor_wood('#5b3a22')
    trim = P.paint('#f2eee6', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.24, crown='victorian', rail=2.35, chair=0.92)
    lower = P.paint('#44544b', 0.4)
    KIT.wainscot([(TR(0, D, 0), -W / 2, W / 2), (TR(-W / 2, 0, 0, rz=PI / 2), -0.3, D), (TR(W / 2, 0, 0, rz=-PI / 2), -D, 0.3)], lower, trim, top=0.9)
    lights = []
    P.table(TR(0, 2.3, 0), K['walnut'], w=1.9, d=0.95, h=0.76, leg='square', apron=True, name='dtable')
    for x in (-0.6, 0.0, 0.6):
        for (y, fy) in ((1.62, 1), (2.98, -1)):
            P.dining_chair(facing(x, y, 0, fy), K['walnut'], seat=P.fabric('#7a3a3a', 'fab_seat_red'), name='ch%d%d' % (int(x * 10 + 10), int(y)))
    tt = MB(TR(0, 2.3, 0.76))
    tt.box(-0.8, 0.8, -0.18, 0.18, 0.0, 0.004, color=(0.92, 0.9, 0.84))
    tt.obj('runner', K['paper'])
    pl = MB(TR(0, 2.3, 0.76))
    for x in (-0.6, 0.0, 0.6):
        for y in (-0.3, 0.3):
            KIT.plates_stack(pl, x, y, 0.004, 1, r=0.13)
    pl.obj('plates', K['attr_gloss'], smooth=True)
    cs = MB(TR(0, 2.3, 0.76))
    for x in (-0.35, 0.35):
        cs.lathe([(0.045, 0), (0.04, 0.012), (0.012, 0.04), (0.01, 0.25), (0.022, 0.27), (0.016, 0.28)], n=16, cx=x)
    cs.obj('dcandlesticks', K['brass'], smooth=True)
    cd = MB(TR(0, 2.3, 0.76))
    for x in (-0.35, 0.35):
        cd.cyl(x, 0, 0.27, 0.45, 0.011, n=12)
    cd.obj('dcandles', K['candle'], smooth=True)
    fl = MB(TR(0, 2.3, 0.76))
    for x in (-0.35, 0.35):
        fl.sphere(x, 0, 0.47, 0.009, sz=2.0, seg=8, rings=5)
    fl.obj('dflames', P.bulb_mat('flame2', night=50.0, color=L.kelvin(2000)), smooth=True)
    KIT.fruit_bowl(TR(0, 2.3, 0.764), rng, 'cbowl')
    Ms = at_back(0.0, 0.5)
    P.cabinet(Ms, K['walnut'], w=1.7, d=0.5, h=0.9, rows=1, cols=3, doors=True, legs=True, name='sideboard', top=K['marble'])
    P.mirror(on_wall('b', 0.0, 1.75), 1.2, 0.95, frame_mat=K['brass'], name='smirror')
    for sx in (-1, 1):
        lights += P.table_lamp(Ms @ TR(sx * 0.62, 0.02, 0.9), shade='#efe0c4', h=0.55, r=0.14, night=16.0, name='sl%d' % (sx + 1))
    sv = MB(Ms @ TR(0, 0, 0.9)); P.vase(sv, 0.0, 0.0, 0.0, 0.3, 0.09, color=(0.85, 0.83, 0.78)); sv.obj('sb_vase', K['attr_gloss'], smooth=True)
    ss = MB(Ms @ TR(0, 0, 0.9)); P.stems(ss, 0.0, 0.0, 0.28, 0.45, rng, 7); ss.obj('sb_stems', K['stem'], smooth=True)
    P.art(on_wall('l', 2.3, 1.7), P.art_image('art_d1', 'landscape', rng), 1.1, 0.75, frame_mat=K['brass'], border=0.06, name='a1')
    P.art(on_wall('r', 2.0, 1.72), P.art_image('art_d2', 'botanical', rng), 0.5, 0.65, frame_mat=K['walnut'], border=0.03, mat_border=0.05, name='a2')
    P.art(on_wall('r', 2.8, 1.72), P.art_image('art_d3', 'botanical', rng), 0.5, 0.65, frame_mat=K['walnut'], border=0.03, mat_border=0.05, name='a3')
    P.plant(TR(1.66, 0.55, 0), 'palm', 1.5, rng, pot_mat=K['ceramic'], name='palm')
    P.rug(TR(0, 2.3, 0), P.rug_image('rug_din', 'persian', rng), 2.9, 2.2)
    medallion(0, 2.3, 0.32)
    lights += P.chandelier(TR(0, 2.3, 0), ceil=H, drop=0.95, arms=8, r=0.4, night=75.0, name='dchand')
    cm = P.curtain_mat('#6a5a3a')
    P.curtain(TR(-1.83, 0.12, 2.8), 0.3, 2.76, folds=4, depth=0.04, mat=cm, name='cur_l')
    P.curtain(TR(1.83, 0.12, 2.8), 0.3, 2.76, folds=4, depth=0.04, mat=cm, name='cur_r')
    return lights


def room_renovation(rng):
    """Empty room under renovation: taped drywall, drop cloth, ladder, paint, work light."""
    K = P.mats()
    dw = KIT.M_imgtile('drywall', KIT.drywall_image('drywall_img', rng), scale=2.4, rough=0.85, normal_key='painted_plaster', normal=0.3)
    floor = L.MT('subfloor', 'wood_floor', tint='#b89a70', scale=3.5, normal=0.5, rough_mul=0.9, detail=0.6)
    dx0, dx1, dh = -1.55, -0.7, 2.1
    shell(dw, floor, ceil=L.M('bare_ceil', '#d9d6ce', rough=0.9, bump=0.2), back_door=(dx0, dx1, dh))
    lights = KIT.hallway(dx0, dx1, dh, 1.2, dw, floor, rng, night=0.0, day=0.0)
    KIT.drop_cloth(TR(0.2, 1.9, 0, rz=0.1), 2.6, 2.0, rng)
    KIT.ladder(TR(0.45, 2.7, 0, rz=0.35), h=1.75)
    pc = MB()
    for k, (x, y, c) in enumerate(((-1.2, 1.1, (0.85, 0.85, 0.82)), (-1.0, 0.95, (0.6, 0.62, 0.6)), (1.3, 3.4, (0.85, 0.85, 0.82)), (1.45, 3.25, (0.2, 0.35, 0.55)))):
        KIT.paint_can(pc, x, y, color=c)
    pc.box(-0.18, 0.18, -0.13, 0.13, 0, 0.05, color=(0.3, 0.3, 0.32), M=TR(-0.6, 1.2, 0, rz=0.4))
    pc.cyl(0, 0, 0, 0.36, 0.16, 0.14, n=20, color=(0.9, 0.9, 0.88), M=TR(1.2, 1.2, 0))
    pc.cyl(0, 0, 0, 0.3, 0.012, n=8, color=(0.6, 0.4, 0.2), M=TR(-0.55, 1.35, 0.03, rz=0.4) @ Matrix.Rotation(PI / 2 - 0.05, 4, 'Y'))
    pc.obj('cans', K['attr_matte'], bevel=0.004, seg=1)
    KIT.sawhorse(TR(-0.7, 2.4, 0, rz=0.1), name='sh1')
    KIT.sawhorse(TR(-0.7, 3.3, 0, rz=-0.05), name='sh2')
    pl = MB(TR(-0.7, 2.85, 0.72)); pl.box(-0.12, 0.12, -0.7, 0.7, 0, 0.04); pl.obj('plank', K['pine'], bevel=0.003, seg=1)
    sh = MB(TR(W / 2 - 0.02, 2.4, 0, rz=-PI / 2))
    for k in range(4):
        sh.box(-0.6, 0.6, -0.013, 0.0, 0, 2.4, M=TR(rng.uniform(-0.03, 0.03), -0.02 - k * 0.015, 0, rx=0.05 + k * 0.012))
    sh.obj('sheets', L.M('gypsum', '#dcd8d0', rough=0.9, bump=0.1), bevel=0.002, seg=1)
    tb = MB(TR(0.9, 0.9, 0, rz=0.3)); tb.box(-0.25, 0.25, -0.12, 0.12, 0, 0.22, color=(0.7, 0.1, 0.08)); tb.obj('toolbox', K['attr_gloss'], bevel=0.01, seg=2)
    cord = MB()
    pts = [Vector((1.9, 3.9, 0.3)), Vector((1.6, 3.0, 0.01)), Vector((0.8, 2.6, 0.01)), Vector((0.9, 1.8, 0.01)), Vector((1.55, 1.4, 0.01))]
    for k in range(len(pts) - 1):
        dv = pts[k + 1] - pts[k]
        rot = dv.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        cord.cyl(0, 0, 0, dv.length, 0.006, n=6, M=Matrix.Translation(pts[k]) @ rot)
    cord.obj('extcord', L.M('cord_orange', '#d86a1a', rough=0.5), smooth=True)
    lights += KIT.work_light(TR(1.55, 1.4, 0, rz=PI - 0.5), night=160.0)
    lights += P.pendant(TR(0.3, 2.0, 0), ceil=H, drop=0.45, kind='bulb', night=0.0, name='bare')
    return lights


def room_blinds(rng):
    """Study behind half-closed venetian blinds (top ~55% of the window covered)."""
    K = P.mats()
    wall = wall_mat('#c2ccd4')
    floor = floor_wood('#7a5534')
    trim = P.paint('#f2f0ea', 0.3)
    shell(wall, floor)
    trims([DEFAULT_PATH], trim, base_h=0.16, crown='simple')
    lights = []
    KIT.blinds(-W / 2 + 0.02, W / 2 - 0.02, H - 0.02, 1.32, y=0.07, tilt=0.55, color='#dedbd3')
    Md = TR(-0.35, 1.25, 0)
    KIT.desk(Md, K['oak'], K['black_metal'], w=1.4, d=0.7, name='sdesk')
    lights += KIT.desk_lamp(Md @ TR(0.5, 0.15, 0.74, rz=-2.4), night=34.0, name='slamp')
    dk = MB(Md @ TR(0, 0, 0.74))
    dk.box(-0.17, 0.17, -0.12, 0.12, 0, 0.012, color=(0.55, 0.55, 0.57), M=TR(-0.1, 0.05, 0))
    dk.box(-0.17, 0.17, -0.005, 0.005, 0, 0.23, color=(0.55, 0.55, 0.57), M=TR(-0.1, 0.17, 0.012, rx=0.25))
    P.book_stack(dk, -0.5, 0.1, 0.0, rng, 3)
    dk.obj('sdesk_items', K['attr_gloss'], bevel=0.002, seg=1)
    P.office_chair(Md @ TR(0.0, 0.55, 0, rz=PI + 0.3), P.fabric('#303338'), name='sch')
    P.bookshelf(at_back(-1.1, 0.34), K['walnut'], w=1.3, d=0.34, h=2.2, shelves=6, rng=rng, name='sbs')
    P.armchair(facing(1.2, 2.9, -0.6, -0.8), P.fabric('#c8b89a', 'fab_oat'), legs=K['walnut'], name='sarm')
    lights += P.floor_lamp(TR(1.72, 3.55, 0), shade='#efe6d6', night=42.0, name='sfl')
    P.art(on_wall('r', 2.4, 1.7), P.art_image('art_bl1', 'landscape', rng), 0.9, 0.65, frame='#1a1a1a', border=0.025, mat_border=0.06, name='a1')
    P.art(on_wall('b', 0.6, 1.6), P.art_image('art_bl2', 'geo', rng), 0.6, 0.6, frame='#e8e4dc', border=0.025, name='a2')
    P.rug(TR(0.4, 2.4, 0), P.rug_image('rug_bl', 'stripe', rng), 2.2, 1.6)
    P.plant(TR(1.6, 0.6, 0), 'monstera', 1.1, rng, pot_mat=K['terracotta'], name='mon')
    lights += P.flush_light(TR(0.2, 2.2, 0), night=0.0, name='ceil')
    outlets([('b', 0.1, 0.3), ('l', 2.4, 0.3)])
    return lights


# ----------------------------------------------------------------------------
ROOMS = [
    ('living', 'victorian_fireplace', room_victorian_fireplace),
    ('living', 'loft_brick', room_loft_brick),
    ('living', 'tv_room', room_living_tv),
    ('living', 'library', room_bookish),
    ('living', 'modern_hall', room_modern_hall),
    ('bedroom', 'blush_victorian', room_bedroom_blush),
    ('bedroom', 'navy_tv', room_bedroom_navy),
    ('bedroom', 'student', room_bedroom_student),
    ('kitchen', 'white_shaker', room_kitchen_white),
    ('kitchen', 'retro_galley', room_kitchen_retro),
    ('office', 'open_plan', room_office_open),
    ('office', 'brick_exec', room_office_brick),
    ('office', 'cubicles_dark', room_office_cubicles),
    ('dining', 'victorian_dining', room_dining),
    ('empty', 'renovation', room_renovation),
    ('blinds', 'study_blinds', room_blinds),
]


def build_room(i, tile):
    L.clear_objects()
    typ, name, fn = ROOMS[i]
    rng = random.Random(9001 + 37 * i)
    L.setup_im_camera(W, H, D, tile, tile)
    fn(rng)
    daylight()
    return typ, name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--samples', type=int, default=192)
    ap.add_argument('--tile', type=int, default=512)
    ap.add_argument('--only', type=str, default='')
    ap.add_argument('--variants', type=str, default='day,night')
    ap.add_argument('--no-atlas', action='store_true')
    ap.add_argument('--assemble-only', action='store_true', help='just rebuild atlases/json from the tile cache')
    ap.add_argument('--test', action='store_true', help='write tiles to _cache/rooms_test (never assembled)')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    a = ap.parse_args(argv)
    if a.assemble_only:
        assemble(a.tile)
        return
    L.reset_factory()
    L.GAIN['night'] = NIGHT_GAIN
    L.setup_render(a.tile, a.tile, samples=a.samples, exposure=EXPOSURE)
    setup_world()
    idx = [int(s) for s in a.only.split(',')] if a.only else list(range(len(ROOMS)))
    variants = a.variants.split(',')
    t0 = time.time()
    for i in idx:
        typ, name = build_room(i, a.tile)
        if i == idx[0]:
            L.verify_projection(W, H, D, a.tile, a.tile, 'rooms')
        for v in variants:
            L.set_variant(v)
            dt = L.render_to(os.path.join(CACHE_DIR + ('_test' if a.test else ''), '%02d_%s.png' % (i, v)))
            print('[rooms] %02d %-8s %-22s %-5s %.1fs' % (i, typ, name, v, dt), flush=True)
    print('[rooms] render total %.1fs' % (time.time() - t0))
    if not a.no_atlas and not a.test and len(ROOMS) == 16:
        assemble(a.tile)


def assemble(tile):
    out = {}
    meta = []
    for v in ('day', 'night'):
        atlas = np.zeros((tile * 4, tile * 4, 3), np.float32)
        for i in range(16):
            p = os.path.join(CACHE_DIR, '%02d_%s.png' % (i, v))
            img = L.load_png(p)
            r, c = i // 4, i % 4
            atlas[r * tile:(r + 1) * tile, c * tile:(c + 1) * tile] = img
        out[v] = atlas
        L.save_image(os.path.join(L.BAKED, 'rooms_%s.jpg' % v), atlas, 'JPEG', 90)
    for i in range(16):
        r, c = i // 4, i % 4
        d = out['day'][r * tile:(r + 1) * tile, c * tile:(c + 1) * tile]
        n = out['night'][r * tile:(r + 1) * tile, c * tile:(c + 1) * tile]
        tint = d.reshape(-1, 3).mean(axis=0)
        lit = float((L.luma(n) > LIT_THRESHOLD).mean())
        typ, name, _ = ROOMS[i]
        meta.append({'index': i, 'type': typ, 'name': name, 'col': c, 'row': r,
                     'tint': [round(float(x), 4) for x in tint],
                     'tintHex': '#%02x%02x%02x' % tuple(int(round(float(x) * 255)) for x in tint),
                     'litFraction': round(lit, 4)})
    with open(os.path.join(L.BAKED, 'rooms.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[rooms] wrote atlases + rooms.json')


LIT_THRESHOLD = 0.3

if __name__ == '__main__':
    main()
