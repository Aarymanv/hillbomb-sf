"""HILLBOMB storefront interior-mapping atlas (Blender/Cycles).

Outputs (public/assets/baked/):
  shops.jpg, shops_night.jpg   2048x2048, 2 cols x 4 rows of 1024x512 tiles, sRGB JPEG q90
  shops.json                   [{index, name, type, label, col, row, tint, litFraction}]

Contract: same interior-mapping projection as rooms.py but the cell is 8 m wide x 4 m tall x
8 m deep (normalised x in [-1,1] = 8 m, y in [-1,1] = 4 m, D = 1 = 8 m); camera 8 m in front
of the shop window on its axis; 1024x512 tile -> square pixels.
    uv = 0.5 + 0.5 * p.xy * C / (C - p.z),  C = D = 1

Usage:
  tools/.venv-blender/Scripts/python tools/blender/shops.py [--samples 192] [--only 0,3] [--test]
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
W, H, D = 8.0, 4.0, 8.0
TW, TH = 1024, 512
CACHE_DIR = os.path.join(L.CACHE, 'shops')

DAY_WINDOW_W = 15.0     # window-plane area light (8 x 4 m)
DAY_SKY = 0.3
NIGHT_SKY = 0.012
DAY_GAIN = 1.0          # shop lights by day
NIGHT_GAIN = 1.7        # ... and a bit brighter at night
EXPOSURE = 0.0
LIT_THRESHOLD = 0.3


# ----------------------------------------------------------------------------
# shell / helpers
# ----------------------------------------------------------------------------

def wall_mat(color, name=None, detail=0.35):
    return L.MT(name or ('wall_' + color.lstrip('#')), 'painted_plaster', tint=color, scale=2.2, detail=detail,
                normal=0.25, rough_mul=0.8, rough_add=0.15)


def shell(wall, floor, ceil=None, back=None, left=None, right=None):
    ceil = ceil or L.MT('ceiling', 'painted_plaster', tint='#efece6', scale=2.5, detail=0.25, normal=0.15)
    m = MB(); m.box(-W / 2 - 0.3, W / 2 + 0.3, -0.3, D + 0.3, -0.2, 0.0); m.obj('floor', floor)
    m = MB(); m.box(-W / 2 - 0.3, W / 2 + 0.3, -0.3, D + 0.3, H, H + 0.2); m.obj('ceiling', ceil)
    m = MB(); m.box(-W / 2 - 0.2, -W / 2, -0.3, D + 0.2, -0.2, H + 0.2); m.obj('wall_l', left or wall)
    m = MB(); m.box(W / 2, W / 2 + 0.2, -0.3, D + 0.2, -0.2, H + 0.2); m.obj('wall_r', right or wall)
    m = MB(); m.box(-W / 2 - 0.2, W / 2 + 0.2, D, D + 0.2, -0.2, H + 0.2); m.obj('wall_b', back or wall)


def baseboard(mat, h=0.1):
    b = MB()
    b.sweep([(-W / 2, -0.3), (-W / 2, D), (W / 2, D), (W / 2, -0.3)], [(0, 0), (0.015, 0), (0.015, h), (0, h)])
    b.obj('baseboard', mat, sharp=40)


def lower_wall(mat, top=1.2, walls='lbr', name='lowerwall'):
    b = MB()
    if 'l' in walls:
        b.box(-W / 2, -W / 2 + 0.012, -0.3, D, 0, top)
    if 'r' in walls:
        b.box(W / 2 - 0.012, W / 2, -0.3, D, 0, top)
    if 'b' in walls:
        b.box(-W / 2, W / 2, D - 0.012, D, 0, top)
    b.obj(name, mat)


def daylight():
    ob = L.light('AREA', (0.0, -0.02, H / 2), DAY_WINDOW_W, L.kelvin(6500), size=(W - 0.01, H - 0.01),
                 rot=(PI / 2, 0, 0), name='window_L')

    def hook(v, ld=ob.data):
        ld.energy = DAY_WINDOW_W if v == 'day' else 0.0
    L.on_variant(hook, persistent=False)


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

    def hook(v, sock=sock):
        sock.default_value = DAY_SKY if v == 'day' else NIGHT_SKY
    L.on_variant(hook)


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
    return TR(x, y, 0, rz=math.atan2(fx, -fy))


def slight_warm(k):
    """Day / night colour pair for shop lighting (day a touch cooler, night ~700 K warmer)."""
    return L.kelvin(k + 400), L.kelvin(max(2200, k - 300))


def tube_light(x, y, length=1.2, along='Y', ceil=H, power=45.0, k=4200, name='tube', drop=0.0):
    cd, cn = slight_warm(k)
    z = ceil - drop
    b = MB()
    if along == 'Y':
        b.box(x - 0.1, x + 0.1, y - length / 2, y + length / 2, z - 0.07, z)
    else:
        b.box(x - length / 2, x + length / 2, y - 0.1, y + 0.1, z - 0.07, z)
    b.obj(name + '_hs', P.mats()['plastic_white'], bevel=0.005, seg=1)
    e = MB()
    if along == 'Y':
        e.box(x - 0.075, x + 0.075, y - length / 2 + 0.03, y + length / 2 - 0.03, z - 0.072, z - 0.069)
    else:
        e.box(x - length / 2 + 0.03, x + length / 2 - 0.03, y - 0.075, y + 0.075, z - 0.072, z - 0.069)
    e.obj(name + '_diff', L.M_emit('tube_diff_%d' % k, cd, day=4.0, night=5.0))
    sz = (0.15, length - 0.06) if along == 'Y' else (length - 0.06, 0.15)
    return [L.light('AREA', (x, y, z - 0.075), power, cd, size=sz, day=power * DAY_GAIN, night=power, color_night=cn, name=name + '_L')]


def can_light(x, y, power=30.0, k=3000, ceil=H, name='can', spot=1.6):
    cd, cn = slight_warm(k)
    s = MB()
    s.cyl(x, y, ceil - 0.005, ceil, 0.08, n=20)
    s.obj(name + '_trim', P.mats()['plastic_white'], smooth=True)
    e = MB()
    e.cyl(x, y, ceil - 0.006, ceil - 0.004, 0.05, n=20)
    e.obj(name + '_lens', L.M_emit('can_lens_%d' % k, cd, day=25.0, night=30.0))
    return [L.light('SPOT', (x, y, ceil - 0.03), power, cd, 0.05, day=power * DAY_GAIN, night=power, color_night=cn,
                    name=name + '_L', spot=(spot, 0.7))]


def shop_pendant(x, y, drop=1.2, kind='dome', mat=None, power=45.0, k=2900, r=0.22, name='pend'):
    cd, cn = slight_warm(k)
    out = P.pendant(TR(x, y, 0), ceil=H, drop=drop, kind=kind, mat=mat, night=power, day=power * DAY_GAIN, r=r, name=name)
    for l in out:
        l.data.color = cd

        def hook(v, ld=l.data, cd=cd, cn=cn):
            ld.color = cd if v == 'day' else cn
        L.on_variant(hook, persistent=False)
    return out


def text(M, body, size=0.1, mat=None, align='LEFT', extrude=0.0, name='txt', yoff=-0.004):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.extrude = extrude
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = M @ TR(0, yoff, 0) @ Matrix.Rotation(PI / 2, 4, 'X')
    if mat is not None:
        cu.materials.append(mat)
    return ob


def menu_board(M, w, h, title, items, bg='#161616', fg='#f2eee4', accent='#e8b84a', glow=0.0, name='menu', rng=None,
               price=True, cols=1):
    """Board hanging/mounted with its face toward local -Y; M = centre of the board."""
    b = MB(M)
    b.box(-w / 2, w / 2, -0.03, 0.0, -h / 2, h / 2)
    b.obj(name + '_bg', L.M_emit('board_' + bg.lstrip('#') + '_%d' % int(glow * 10), L.hexc(bg), day=glow, night=glow * 1.2,
                                 base=L.hexc(bg), rough=0.6) if glow else L.M('board_' + bg.lstrip('#'), bg, rough=0.7))
    fm = L.M_emit('menu_ink_' + fg.lstrip('#'), L.hexc(fg), day=0.6, night=0.8, base=L.hexc(fg), rough=0.6)
    am = L.M_emit('menu_acc_' + accent.lstrip('#'), L.hexc(accent), day=0.8, night=1.0, base=L.hexc(accent), rough=0.6)
    text(M @ TR(0, -0.03, h / 2 - 0.13), title, size=min(0.2, h * 0.16), mat=am, align='CENTER', name=name + '_title')
    n = len(items)
    per_col = int(math.ceil(n / cols))
    lh = (h - 0.35) / max(1, per_col)
    cw = (w - 0.2) / cols
    for i, it in enumerate(items):
        c, r = i // per_col, i % per_col
        x0 = -w / 2 + 0.1 + c * cw
        z = h / 2 - 0.32 - r * lh
        text(M @ TR(x0, -0.03, z), it, size=min(0.075, lh * 0.7), mat=fm, align='LEFT', name='%s_i%d' % (name, i))
        if price:
            text(M @ TR(x0 + cw - 0.08, -0.03, z), '%d.%02d' % (rng.randint(4, 19), rng.choice([0, 25, 50, 75, 95])) if rng else '9.50',
                 size=min(0.07, lh * 0.65), mat=am, align='RIGHT', name='%s_p%d' % (name, i))


def neon(M, body, color, size=0.35, power=6.0, name='neon', strength=12.0):
    mat = L.M_emit('neon_' + name, color, day=strength * 0.8, night=strength, base=tuple(c * 0.5 for c in color))
    ob = text(M, body, size=size, mat=mat, align='CENTER', extrude=0.012, name=name)
    return [L.light('POINT', P.world_pt(M, 0, -0.15, 0), power, color, 0.3, day=power * 0.6, night=power, name=name + '_L')]


def product_colors(rng, n=40, sat=0.8):
    pal = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#264653', '#e9c46a', '#8ecae6', '#219ebc', '#023047', '#ffb703',
           '#fb8500', '#6a994e', '#bc4749', '#f2e8cf', '#386641', '#9d4edd', '#ff006e', '#3a86ff', '#ffffff', '#1b1b1b']
    return [P.jitter(rng.choice(pal), rng, 0.1) for _ in range(n)]


def products_row(mb, x0, x1, yb, z, dmax, hmax, rng, M=None, kind='box'):
    x = x0
    while x < x1 - 0.04:
        c = rng.choice(PRODUCT_COLS)
        wv = rng.uniform(0.05, 0.12) if kind == 'box' else rng.uniform(0.06, 0.08)
        hv = rng.uniform(0.5, 1.0) * hmax
        facings = rng.randint(1, 4)
        if x + wv > x1:
            break
        for f in range(facings):
            if x + wv > x1:
                break
            if kind == 'box':
                dd = dmax * rng.uniform(0.7, 1.0)
                mb.box(x, x + wv - 0.004, yb - dd, yb, z, z + hv, color=c, M=M)
                lc = LABEL_COLS[(int(x * 997) + int(z * 131)) % len(LABEL_COLS)]
                l0 = rng.uniform(0.25, 0.5)
                mb.box(x + 0.006, x + wv - 0.01, yb - dd - 0.002, yb - dd + 0.001, z + hv * l0, z + hv * (l0 + rng.uniform(0.15, 0.35)), color=lc, M=M)
            else:
                r = wv / 2 - 0.004
                mb.cyl(x + wv / 2, yb - dmax / 2, z, z + hv * 0.75, r, n=10, color=c, M=M)
                mb.cyl(x + wv / 2, yb - dmax / 2, z + hv * 0.75, z + hv, r, r * 0.35, n=10, color=c, M=M)
            x += wv


PRODUCT_COLS = []
LABEL_COLS = [(0.95, 0.95, 0.93), (0.95, 0.85, 0.2), (0.9, 0.1, 0.1), (0.1, 0.1, 0.1), (0.2, 0.5, 0.9), (0.95, 0.95, 0.93)]


def gondola(M, w, d, h, shelves, rng, name='gondola', double=True, mat=None):
    K = P.mats()
    mat = mat or L.M('gondola', '#e6e6e2', rough=0.4, metal=0.3)
    b = MB(M)
    b.box(-w / 2, w / 2, -0.02, 0.02, 0.1, h)
    b.box(-w / 2, w / 2, -d / 2 if double else -d, d / 2 if double else 0.0, 0.0, 0.12)
    sp = (h - 0.15) / shelves
    for i in range(1, shelves):
        z = 0.12 + i * sp
        b.box(-w / 2, w / 2, -d / 2 + 0.02 if double else -d + 0.02, d / 2 - 0.02 if double else 0.0, z - 0.012, z)
    b.obj(name, mat, bevel=0.003, seg=1)
    pr = MB(M)
    for i in range(shelves):
        z = 0.12 + i * sp
        for side in ((-1, 1) if double else (-1,)):
            Ms = TR(0, 0, 0, rz=0 if side < 0 else PI)
            products_row(pr, -w / 2 + 0.02, w / 2 - 0.02, -0.03, z, d / 2 - 0.05, min(0.3, sp - 0.05), rng, M=Ms,
                         kind='bottle' if rng.random() < 0.2 else 'box')
    pr.obj(name + '_prod', L.M('product', (1, 1, 1), rough=0.3, attr=True, coat=0.3), bevel=0.002, seg=1)


def drinks_fridge(M, w=0.75, h=2.0, d=0.7, doors=1, rng=None, name='fridge', k=5500):
    K = P.mats()
    b = MB(M)
    tw = w * doors
    b.box(-tw / 2, tw / 2, d / 2 - 0.04, d / 2, 0.0, h)            # back
    b.box(-tw / 2, -tw / 2 + 0.03, -d / 2, d / 2, 0.0, h)          # sides
    b.box(tw / 2 - 0.03, tw / 2, -d / 2, d / 2, 0.0, h)
    b.box(-tw / 2, tw / 2, -d / 2, d / 2, h - 0.1, h)              # top
    b.box(-tw / 2, tw / 2, -d / 2, d / 2, 0.0, 0.1)                # plinth
    for k_ in range(1, doors):
        b.box(-tw / 2 + k_ * w - 0.015, -tw / 2 + k_ * w + 0.015, -d / 2, d / 2 - 0.04, 0.1, h - 0.1)
    b.obj(name + '_body', L.M('fridge_body', '#1b1b1d', rough=0.4, metal=0.4), bevel=0.005, seg=1)
    e = MB(M)
    e.box(-tw / 2 + 0.03, tw / 2 - 0.03, d / 2 - 0.08, d / 2 - 0.06, 0.12, h - 0.2)
    e.obj(name + '_glow', L.M_emit('fridge_glow', L.kelvin(k), day=3.0, night=3.5, base=(0.9, 0.9, 0.9)))
    pr = MB(M)
    for i in range(5):
        z = 0.15 + i * 0.34
        pr.box(-tw / 2 + 0.03, tw / 2 - 0.03, -d / 2 + 0.05, d / 2 - 0.1, z - 0.01, z)
        products_row(pr, -tw / 2 + 0.04, tw / 2 - 0.04, d / 2 - 0.12, z, 0.4, 0.26, rng, kind='bottle')
    pr.obj(name + '_bottles', L.M('bottles', (1, 1, 1), rough=0.12, attr=True, coat=0.5), smooth=False)
    fr = MB(M)
    for k_ in range(doors):
        x0 = -tw / 2 + k_ * w
        fr.box(x0, x0 + 0.035, -d / 2 - 0.04, -d / 2, 0.05, h - 0.1)
        fr.box(x0 + w - 0.035, x0 + w, -d / 2 - 0.04, -d / 2, 0.05, h - 0.1)
        fr.box(x0, x0 + w, -d / 2 - 0.04, -d / 2, h - 0.14, h - 0.1)
        fr.box(x0, x0 + w, -d / 2 - 0.04, -d / 2, 0.05, 0.1)
        fr.box(x0 + w - 0.07, x0 + w - 0.055, -d / 2 - 0.08, -d / 2 - 0.04, 0.8, 1.5)
    fr.obj(name + '_frames', L.M('fridge_frame', '#2a2a2c', rough=0.3, metal=0.6), bevel=0.003, seg=1)
    g = MB(M)
    g.quad((-tw / 2, -d / 2 - 0.02, 0.1), (tw / 2, -d / 2 - 0.02, 0.1), (tw / 2, -d / 2 - 0.02, h - 0.14), (-tw / 2, -d / 2 - 0.02, h - 0.14))
    g.obj(name + '_glass', glass_door_mat())
    hd = MB(M)
    hd.box(-tw / 2, tw / 2, -d / 2 - 0.05, -d / 2 + 0.02, h - 0.1, h + 0.12)
    hd.obj(name + '_header', L.M_emit('fridge_header', (0.9, 0.15, 0.1), day=1.5, night=2.0, base=(0.8, 0.1, 0.08)))
    return [L.light('AREA', P.world_pt(M, 0, -d / 2 - 0.1, h / 2), 20.0 * doors, L.kelvin(k), size=(tw, h * 0.7),
                    rot=(PI / 2 + 0 * 0, 0, M.to_euler()[2] + PI), day=12.0 * doors, night=16.0 * doors, name=name + '_L')]


def glass_door_mat():
    name = 'glass_door'
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = nt.nodes.get('Material Output')
    tp = nt.nodes.new('ShaderNodeBsdfTransparent')
    gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.03
    fr = nt.nodes.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.5
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fr.outputs[0], mx.inputs[0])
    nt.links.new(tp.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    L._MATS[name] = m
    return m


def counter(M, w, d=0.7, h=1.02, front=None, top=None, name='counter', kick=True):
    K = P.mats()
    b = MB(M)
    b.box(-w / 2, w / 2, -d / 2 + 0.03, d / 2, 0.1 if kick else 0.0, h - 0.04)
    if kick:
        b.box(-w / 2 + 0.03, w / 2 - 0.03, -d / 2 + 0.08, d / 2, 0.0, 0.1, m=1)
    b.obj(name, [front or K['oak'], K['plastic_black']], bevel=0.004, seg=2)
    t = MB(M)
    t.box(-w / 2 - 0.03, w / 2 + 0.03, -d / 2 - 0.02, d / 2, h - 0.04, h)
    t.obj(name + '_top', top or K['marble'], bevel=0.005, seg=2)


def glass_case(M, w, d=0.6, h=1.25, base=None, name='case', trays=None, rng=None):
    """Refrigerated display case (glass box on a base), optional trays of food items."""
    K = P.mats()
    b = MB(M)
    b.box(-w / 2, w / 2, -d / 2, d / 2, 0.0, 0.75)
    b.obj(name + '_base', base or L.M('case_base', '#d8d8d4', rough=0.35), bevel=0.005, seg=2)
    fr = MB(M)
    for sx in (-1, 1):
        fr.box(sx * w / 2 - 0.02, sx * w / 2 + 0.02, -d / 2, d / 2, 0.75, h)
    fr.box(-w / 2, w / 2, -d / 2, d / 2, h - 0.02, h)
    fr.box(-w / 2, w / 2, -0.01, 0.01, 1.0, 1.01)
    fr.obj(name + '_frame', K['chrome'], bevel=0.003, seg=1)
    g = MB(M)
    g.quad((-w / 2, -d / 2, 0.75), (w / 2, -d / 2, 0.75), (w / 2, -d / 2 + 0.15, h - 0.02), (-w / 2, -d / 2 + 0.15, h - 0.02))
    g.obj(name + '_glass', glass_door_mat())
    e = MB(M)
    e.box(-w / 2 + 0.03, w / 2 - 0.03, -0.1, 0.1, h - 0.035, h - 0.025)
    e.obj(name + '_led', L.M_emit('case_led', L.kelvin(4000), day=6.0, night=6.0))
    return [L.light('AREA', P.world_pt(M, 0, 0, h - 0.04), 14.0, L.kelvin(4000), size=(w - 0.1, d - 0.1), day=14.0, night=16.0,
                    rot=(0, 0, M.to_euler()[2]), name=name + '_L')]


def food_tray(mb, x, y, z, w, d, kind, rng, M=None):
    """Rows of pastries/buns/pizza slices on a tray (attr-coloured)."""
    mb.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + 0.01, color=(0.75, 0.75, 0.75), M=M)
    nx = max(1, int(w / 0.1)); ny = max(1, int(d / 0.1))
    for i in range(nx):
        for j in range(ny):
            px = x - w / 2 + (i + 0.5) * w / nx + rng.uniform(-0.01, 0.01)
            py = y - d / 2 + (j + 0.5) * d / ny + rng.uniform(-0.01, 0.01)
            if kind == 'bun':
                mb.sphere(px, py, z + 0.035, 0.038, sz=0.7, seg=12, rings=6, color=P.jitter('#f3ead8', rng, 0.05), M=M)
            elif kind == 'tart':
                mb.cyl(px, py, z + 0.01, z + 0.03, 0.035, 0.04, n=12, color=(0.75, 0.5, 0.2), M=M)
                mb.cyl(px, py, z + 0.03, z + 0.032, 0.03, n=12, color=(0.95, 0.75, 0.15), M=M)
            elif kind == 'croissant':
                mb.sphere(px, py, z + 0.03, 0.045, sz=0.55, sx=1.5, seg=12, rings=6, color=P.jitter('#c98a3a', rng, 0.1), M=M)
            elif kind == 'donut':
                mb.cyl(px, py, z + 0.01, z + 0.04, 0.04, n=14, color=P.jitter(rng.choice(['#c07040', '#e8a0b0', '#5a3020', '#f0e0c0']), rng, 0.05), M=M)
            elif kind == 'sesame':
                mb.sphere(px, py, z + 0.035, 0.033, seg=10, rings=6, color=(0.85, 0.6, 0.3), M=M)
            else:  # cake slice / generic
                mb.box(px - 0.035, px + 0.035, py - 0.035, py + 0.035, z + 0.01, z + 0.07,
                       color=P.jitter(rng.choice(['#f0e0c8', '#5a3020', '#e8a0b0', '#f2d060']), rng, 0.05), M=M)


def image_mat(name, arr, rough=0.6, emit=0.0):
    img = L.np_to_image(name + '_img', arr)
    return L.M_image(name, img, rough=rough, emit_day=emit, emit_night=emit * 1.2)


def pizza_image(name, rng):
    npr = np.random.default_rng(rng.randint(0, 9999))
    h = w = 128
    yy, xx = np.mgrid[0:h, 0:w] / 128.0 - 0.5
    r = np.sqrt(xx ** 2 + yy ** 2)
    img = np.zeros((h, w, 3)) + np.array([0.1, 0.1, 0.1])
    img[r < 0.5] = [0.8, 0.55, 0.25]
    img[r < 0.44] = [0.75, 0.2, 0.08]
    n = L.vnoise(h, w, 10, npr, 3)
    cheese = (n > 0.45) & (r < 0.44)
    img[cheese] = [0.97, 0.85, 0.5]
    for k in range(10):
        a = npr.uniform(0, 2 * PI); rr = npr.uniform(0.05, 0.36)
        cx, cy = rr * math.cos(a), rr * math.sin(a)
        img[((xx - cx) ** 2 + (yy - cy) ** 2) < 0.0035] = [0.6, 0.1, 0.05]
    return L.np_to_image(name, np.clip(img * (0.9 + 0.2 * n[..., None]), 0, 1))


def talavera_image(name, rng, w=256, h=64):
    img = np.zeros((h, w, 3)) + np.array(L.hexc('#f2ece0', lin=False))
    t = 32
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx % t) / t - 0.5; v = (yy % t) / t - 0.5
    r = np.sqrt(u * u + v * v)
    blue = np.array(L.hexc('#1f4a9a', lin=False)); yel = np.array(L.hexc('#e8a82a', lin=False)); grn = np.array(L.hexc('#2a8a5a', lin=False))
    img[(np.abs(u) + np.abs(v)) < 0.42] = blue
    img[(np.abs(u) + np.abs(v)) < 0.3] = np.array(L.hexc('#f2ece0', lin=False))
    img[r < 0.16] = yel
    img[r < 0.07] = grn
    img[(np.abs(u) > 0.47) | (np.abs(v) > 0.47)] = np.array(L.hexc('#b8b0a0', lin=False))
    return L.np_to_image(name, img)


def glyph_board_image(name, rng, rows=5, cols=6, bg='#a8161a', fg='#f5c842'):
    """Board of blocky pseudo-hanzi glyphs (the built-in font has no CJK)."""
    npr = np.random.default_rng(rng.randint(0, 9999))
    cell = 24
    h, w = rows * cell * 2 + 20, cols * cell + 20
    img = np.zeros((h, w, 3)) + np.array(L.hexc(bg, lin=False))
    f = np.array(L.hexc(fg, lin=False))
    for r in range(rows):
        for c in range(cols):
            y0 = 10 + r * cell * 2 + 4; x0 = 10 + c * cell + 3
            g = npr.random((5, 5)) > 0.55
            g[2, :] |= npr.random() > 0.5
            g[:, 2] |= npr.random() > 0.5
            for i in range(5):
                for j in range(5):
                    if g[i, j]:
                        img[y0 + i * 3:y0 + i * 3 + 3, x0 + j * 3:x0 + j * 3 + 3] = f
            img[y0 + cell - 2:y0 + cell + 1, x0:x0 + 18] = f * 0.9 if c % 3 == 0 else img[y0 + cell - 2:y0 + cell + 1, x0:x0 + 18]
    return L.np_to_image(name, img)


def photo_board_image(name, rng, n=6, bg='#f2c230'):
    npr = np.random.default_rng(rng.randint(0, 9999))
    h, w = 120, 360
    img = np.zeros((h, w, 3)) + np.array(L.hexc(bg, lin=False))
    pw = w // n
    for k in range(n):
        x0 = k * pw + 6; x1 = x0 + pw - 12
        img[10:70, x0:x1] = [0.2 + npr.random() * 0.3, 0.12, 0.05]
        yy, xx = np.mgrid[10:70, x0:x1]
        cx, cy = (x0 + x1) / 2, 42
        m = ((xx - cx) / ((x1 - x0) * 0.45)) ** 2 + ((yy - cy) / 18.0) ** 2 < 1
        sub = img[10:70, x0:x1]
        sub[m] = [0.85, 0.65, 0.3]
        m2 = m & (npr.random(m.shape) > 0.6)
        sub[m2] = [0.3, 0.6, 0.2]
        img[80:86, x0:x1 - 20] = [0.1, 0.1, 0.1]
        img[92:98, x0:x0 + 25] = [0.75, 0.1, 0.08]
    return L.np_to_image(name, img)


def bentwood_chair(M, mat, seat=None, name='bchair'):
    P.dining_chair(M, mat, seat=seat, name=name, style='spindle')


def cafe_table(M, top, legs, r=0.35, h=0.74, name='ctab'):
    P.table(M, top, legs=legs, w=r * 2, d=r * 2, h=h, leg='round_top', name=name)


def people_silhouette(M, rng, color=None, name='person', seated=False):
    """Very simple standing/seated figure (reads as a customer at 1024 px)."""
    K = P.mats()
    c = color or P.jitter(rng.choice(['#2a3a5a', '#5a2a2a', '#3a3a3a', '#6a6a60', '#c8b89a', '#2a4a3a']), rng, 0.1)
    b = MB(M)
    if seated:
        b.box(-0.17, 0.17, -0.12, 0.12, 0.45, 1.05, color=c)
        for sx in (-1, 1):
            b.box(-0.045, 0.045, -0.3, 0.05, 0.0, 0.1, color=c, M=TR(sx * 0.2, 0.0, 0.68, rx=0.2))
        b.box(-0.17, 0.17, -0.45, 0.05, 0.4, 0.55, color=(0.15, 0.15, 0.18))
        b.box(-0.17, -0.03, -0.5, -0.38, 0.0, 0.45, color=(0.15, 0.15, 0.18))
        b.box(0.03, 0.17, -0.5, -0.38, 0.0, 0.45, color=(0.15, 0.15, 0.18))
        hz = 1.17
    else:
        b.box(-0.17, -0.02, -0.08, 0.08, 0.0, 0.85, color=(0.15, 0.15, 0.2))
        b.box(0.02, 0.17, -0.08, 0.08, 0.0, 0.85, color=(0.15, 0.15, 0.2))
        b.box(-0.2, 0.2, -0.12, 0.12, 0.85, 1.48, color=c)
        for sx in (-1, 1):
            b.box(-0.045, 0.045, -0.05, 0.05, 0.0, 0.62, color=c, M=TR(sx * 0.245, 0.0, 0.83, ry=sx * 0.06))
        hz = 1.6
    b.obj(name + '_body', K['attr_matte'], bevel=0.05, seg=3)
    hd = MB(M)
    hd.sphere(0, 0, hz, 0.1, sz=1.15, seg=16, rings=10, color=P.jitter(rng.choice(['#e0b090', '#8a5a3a', '#c89070', '#5a3a28', '#f0c8a8']), rng, 0.05))
    hd.sphere(0, 0.015, hz + 0.04, 0.102, sz=0.8, seg=16, rings=10, color=P.jitter(rng.choice(['#1a1410', '#3a2a1a', '#6a5a4a', '#c8a060']), rng, 0.05))
    hd.obj(name + '_head', K['attr_matte'], smooth=True)


# ----------------------------------------------------------------------------
# shops
# ----------------------------------------------------------------------------

def shop_pizzeria(rng):
    K = P.mats()
    wall = wall_mat('#efe4cc')
    brick = L.MT('brick_pz', 'brick_tan', scale=1.8, normal=1.0)
    floor = KIT.M_tiles('pz_floor', scale=2.4, checker=('#e9e3d6', '#1d1d1f'), grout='#77736a', rough=0.25)
    shell(wall, floor, back=brick)
    lower_wall(KIT.M_tiles('pz_sub', '#f3f1ea', '#c8c4b8', scale=0.8, sx=2.0), top=1.25, walls='lr')
    baseboard(L.M('pz_base', '#1d1d1f', rough=0.4), 0.08)
    lights = []
    # oven
    ov = MB(TR(0.6, 6.9, 0))
    ov.box(-1.05, 1.05, -0.8, 0.8, 0.0, 1.05)
    ov.obj('oven_base', L.MT('brick_pz', 'brick_tan', scale=1.8, normal=1.0), bevel=0.01, seg=2)
    dm = MB(TR(0.6, 6.9, 0))
    prof = [(1.0 * math.cos(t), 1.05 + 0.85 * math.sin(t)) for t in np.linspace(0, PI / 2, 12)]
    dm.lathe(prof, n=40)
    dm.obj('oven_dome', L.M('oven_tile', '#9a3a22', rough=0.35, coat=0.4), smooth=True)
    mo = MB(TR(0.6, 6.9, 0))
    mo.box(-0.35, 0.35, -1.02, -0.99, 1.1, 1.45)
    mo.obj('oven_mouth', L.M_emit('fire_glow', L.kelvin(1600), day=10.0, night=12.0, base=(0.1, 0.03, 0.01)))
    ar = MB(TR(0.6, 6.9, 0))
    ar.box(-0.5, 0.5, -1.05, -0.95, 1.05, 1.1)
    ar.box(-0.5, -0.35, -1.05, -0.95, 1.1, 1.52); ar.box(0.35, 0.5, -1.05, -0.95, 1.1, 1.52); ar.box(-0.5, 0.5, -1.05, -0.95, 1.45, 1.6)
    ar.obj('oven_arch', L.M('oven_arch', '#2a2a2a', rough=0.5, metal=0.4), bevel=0.01, seg=2)
    lights.append(L.light('POINT', (0.6, 5.75, 1.3), 30.0, L.kelvin(1700), 0.2, day=30.0, night=40.0, name='oven_L'))
    # counter with pizzas
    counter(TR(-0.6, 4.7, 0), 5.2, front=L.M('pz_counter', '#7a1f1a', rough=0.35), top=K['marble'], name='ctr')
    sg = MB(TR(-0.6, 4.7, 0))
    sg.quad((-2.5, -0.25, 1.35), (2.5, -0.25, 1.35), (2.5, 0.0, 1.5), (-2.5, 0.0, 1.5))
    sg.obj('sneeze', glass_door_mat())
    pz = MB(TR(-0.6, 4.7, 1.02))
    for k in range(5):
        x = -2.1 + k * 0.95
        pz.quad((x - 0.22, -0.22, 0.012), (x + 0.22, -0.22, 0.012), (x + 0.22, 0.22, 0.012), (x - 0.22, 0.22, 0.012), uv01=True)
    pz.obj('pizzas', L.M_image('pizza_mat', pizza_image('pizza_img', rng), rough=0.4))
    tray = MB(TR(-0.6, 4.7, 1.02))
    for k in range(5):
        tray.cyl(-2.1 + k * 0.95, 0, 0.0, 0.01, 0.26, n=28)
    tray.obj('trays', K['steel'], smooth=True)
    # menu boards hung above counter
    items = ['MARGHERITA', 'PEPPERONI', 'QUATTRO FORMAGGI', 'MUSHROOM', 'SAUSAGE AND PEPPER', 'VEGGIE', 'GARLIC KNOTS', 'CAESAR SALAD']
    for k, x in enumerate((-2.6, -0.6, 1.4)):
        menu_board(TR(x, 5.3, 2.85), 1.8, 1.0, ['PIZZA', 'SLICES', 'SIDES'][k], rng.sample(items, 5), name='mb%d' % k, rng=rng)
        rod = MB(); rod.cyl(x - 0.7, 5.3, 3.35, H, 0.004, n=5); rod.cyl(x + 0.7, 5.3, 3.35, H, 0.004, n=5); rod.obj('mbrod%d' % k, K['chrome'], smooth=True)
    lights += neon(TR(-2.4, D - 0.05, 2.1), 'PIZZA', (1.0, 0.12, 0.1), size=0.55, name='neon_pz')
    # front tables
    cloth = KIT.M_tiles('redcheck', scale=0.5, checker=('#c8282a', '#f2efe8'), grout='#c8282a', rough=0.8)
    for k, (x, y) in enumerate(((-2.6, 2.6), (-0.4, 2.2), (1.9, 2.7), (2.2, 1.0))):
        P.table(TR(x, y, 0), cloth, legs=K['black_metal'], w=0.8, d=0.8, h=0.76, leg='pedestal', name='pt%d' % k)
        for (fx, fy) in ((0, 1), (0, -1)):
            P.dining_chair(TR(x - fx * 0.0, y - fy * 0.6, 0, rz=math.atan2(fx, -fy)), K['walnut'], name='pch%d%d' % (k, fy + 1))
    ld = MB(); ld.box(-3.9, -0.6, 0.25, 0.6, 1.02, 1.07); ld.obj('pz_ledge', K['walnut'], bevel=0.005, seg=2)
    lb = MB()
    for x in (-3.5, -3.0, -1.3):
        lb.box(-0.03, 0.03, -0.03, 0.03, 0.0, 1.02, M=TR(x, 0.5, 0))
    lb.obj('pz_ledge_legs', K['black_metal'])
    for k, x in enumerate((-3.3, -2.5, -1.7, -0.9)):
        P.stool(TR(x, 0.95, 0), L.M('pz_red', '#8a1a14', rough=0.35), h=0.74, name='pzs%d' % k)
    people_silhouette(TR(-2.5, 0.95, 0, rz=0.0), rng, name='pz_win', seated=True)
    people_silhouette(TR(-0.3, 4.05, 0, rz=PI), rng, name='cust1')
    people_silhouette(TR(0.2, 5.4, 0), rng, color=(0.9, 0.9, 0.88), name='cook')
    lights += drinks_fridge(at_left(4.6, 0.7), rng=rng, name='pzfridge')
    for k, y in enumerate((1.6, 3.2)):
        P.art(on_wall('r', y, 2.0), P.art_image('pz_ph%d' % k, 'photo', rng), 0.7, 0.5, frame='#1a1a1a', border=0.03, mat_border=0.05, name='pzart%d' % k)
    for k, (x, y) in enumerate(((-2.6, 2.4), (-0.4, 2.0), (1.9, 2.5))):
        lights += shop_pendant(x, y, drop=1.5, kind='dome', mat=L.M('pz_red', '#8a1a14', rough=0.35), power=45.0, r=0.2, name='pzp%d' % k)
    for x in (-2.5, 0.0, 2.5):
        lights += can_light(x, 4.3, power=40.0, name='pzc%d' % int(x * 10 + 30))
    lights += can_light(0.6, 6.2, power=35.0, name='pzc_oven')
    return lights


def shop_diner(rng):
    K = P.mats()
    wall = wall_mat('#f1e8d2')
    floor = KIT.M_tiles('dn_floor', scale=2.4, checker=('#efece4', '#141416'), grout='#6a6a66', rough=0.2)
    shell(wall, floor)
    lower_wall(L.M('dn_red', '#b0201e', rough=0.3, coat=0.3), top=1.05, walls='lbr')
    trim = MB()
    for (x0, x1, y0, y1) in ((-W / 2, -W / 2 + 0.02, -0.3, D), (W / 2 - 0.02, W / 2, -0.3, D), (-W / 2, W / 2, D - 0.02, D)):
        trim.box(x0, x1, y0, y1, 1.05, 1.1)
    trim.obj('dn_chrome', K['chrome'])
    lights = []
    vinyl = L.M('dn_vinyl', '#b3221f', rough=0.3, coat=0.4)
    formica = L.M('dn_formica', '#e8e2d2', rough=0.25, coat=0.3)
    for k, y in enumerate((1.4, 3.1, 4.8, 6.5)):
        for side in (-1, 1):
            by = y + side * 0.55
            bm = MB(TR(-W / 2 + 0.45, by, 0))
            bm.box(-0.45, 0.45, -0.28, 0.28, 0.0, 0.46)
            bm.box(-0.45, 0.45, (0.12 if side > 0 else -0.28), (0.28 if side > 0 else -0.12), 0.46, 1.15)
            bm.obj('booth%d%d' % (k, side + 1), vinyl, bevel=0.04, seg=3)
        P.table(TR(-W / 2 + 0.5, y, 0), formica, legs=K['chrome'], w=0.95, d=0.7, h=0.76, leg='pedestal', name='bt%d' % k)
        tb = MB(TR(-W / 2 + 0.5, y, 0.76))
        tb.cyl(0.3, 0.0, 0.0, 0.12, 0.03, n=12, color=(0.9, 0.9, 0.9)); tb.cyl(0.36, 0.05, 0.0, 0.12, 0.03, n=12, color=(0.7, 0.1, 0.05))
        tb.box(-0.05, 0.05, -0.05, 0.05, 0.0, 0.1, color=(0.85, 0.85, 0.85))
        tb.obj('bt_items%d' % k, K['attr_gloss'], smooth=True)
    # counter + stools
    counter(TR(1.9, 4.3, 0, rz=PI / 2), 5.4, d=0.7, front=L.M('dn_steel_front', '#c8ccd0', rough=0.25, metal=1.0), top=formica, name='dctr')
    for k in range(7):
        y = 1.9 + k * 0.72
        st = MB(TR(1.25, y, 0))
        st.cyl(0, 0, 0.0, 0.03, 0.2, n=20); st.cyl(0, 0, 0.03, 0.66, 0.035, n=12)
        st.obj('dstool_b%d' % k, K['chrome'], smooth=True)
        ss = MB(TR(1.25, y, 0)); ss.cyl(0, 0, 0.66, 0.76, 0.19, n=24); ss.obj('dstool_s%d' % k, vinyl, bevel=0.03, seg=3)
    # back bar
    counter(at_right(4.3, 0.6), 5.4, d=0.6, h=0.95, front=L.M('dn_mint', '#9fd0bc', rough=0.3), top=K['steel'], name='bbar')
    lights += glass_case(at_right(3.0, 0.6) @ TR(0, 0, 0.0) @ TR(0, 0, 0), 1.2, name='piecase', rng=rng) if False else []
    pc = MB(at_right(3.2, 0.6) @ TR(0, 0, 0.95))
    pc.box(-0.45, 0.45, -0.25, 0.25, 0.0, 0.5, color=(1, 1, 1))
    pc.obj('pie_dome', glass_door_mat())
    pies = MB(at_right(3.2, 0.6) @ TR(0, 0, 0.95))
    for x in (-0.25, 0.1):
        pies.cyl(x, 0, 0.0, 0.06, 0.13, 0.14, n=20, color=(0.8, 0.55, 0.25))
    pies.obj('pies', K['attr_matte'], smooth=True)
    cm = MB(at_right(5.2, 0.6) @ TR(0, 0, 0.95))
    for k in range(3):
        cm.box(-0.8 + k * 0.35, -0.55 + k * 0.35, -0.2, 0.2, 0.0, 0.5, color=(0.1, 0.1, 0.1))
        cm.cyl(-0.675 + k * 0.35, -0.12, 0.05, 0.22, 0.07, n=16, color=(0.15, 0.1, 0.05))
    cm.obj('coffee_mach', K['attr_gloss'], bevel=0.01, seg=2)
    menu_board(on_wall('r', 4.3, 2.55, off=0.02), 3.4, 1.0, "TODAY'S SPECIALS", ['PANCAKES', 'HASH BROWNS', 'BURGER DELUXE', 'CLUB SANDWICH',
                                                                           'MILKSHAKES', 'APPLE PIE', 'BLT', 'CHILI'], bg='#f4f0e2', fg='#1a1a1a', accent='#b3221f', name='dmenu', rng=rng, cols=2)
    lights += neon(TR(0.0, D - 0.05, 2.7), 'DINER', (0.1, 0.8, 1.0), size=0.6, name='neon_dn')
    ck = MB(TR(-1.8, D, 2.8)); ck.cyl(0, 0, 0, 0.04, 0.22, n=32, M=Matrix.Rotation(PI / 2, 4, 'X')); ck.obj('dclock', K['chrome'], smooth=True)
    jb = MB(at_back(-2.9, 0.6)); jb.box(-0.4, 0.4, -0.3, 0.3, 0.0, 1.5); jb.obj('jukebox', L.M_emit('jukebox', (1.0, 0.45, 0.1), day=2.0, night=3.0, base=(0.6, 0.2, 0.1)), bevel=0.2, seg=6)
    for k, y in enumerate((2.0, 3.6, 5.2, 6.8)):
        lights += shop_pendant(1.6, y, drop=1.3, kind='globe', power=40.0, r=0.16, name='dgl%d' % k)
    for k, y in enumerate((1.4, 3.1, 4.8, 6.5)):
        lights += can_light(-3.3, y, power=35.0, name='dc%d' % k)
    for k, (x, y) in enumerate(((-1.4, 1.6), (0.2, 1.3), (-1.2, 3.4))):
        P.table(TR(x, y, 0), formica, legs=K['chrome'], w=0.75, d=0.75, h=0.76, leg='pedestal', name='dct%d' % k)
        for j, a in enumerate((0.0, PI)):
            P.dining_chair(TR(x + 0.5 * math.sin(a), y - 0.5 * math.cos(a), 0, rz=a + PI), K['chrome'], seat=vinyl, name='dcc%d%d' % (k, j), style='solid')
    people_silhouette(TR(1.25, 3.34, 0, rz=-PI / 2), rng, name='d_c1', seated=True)
    people_silhouette(TR(-3.55, 4.25, 0, rz=0), rng, name='d_c2', seated=True)
    people_silhouette(TR(3.0, 5.0, 0, rz=PI / 2), rng, color=(0.95, 0.95, 0.92), name='d_cook')
    return lights


def shop_bodega(rng):
    K = P.mats()
    wall = wall_mat('#eeeeea')
    floor = KIT.M_tiles('bd_floor', scale=3.0, checker=('#d8d6d0', '#b8b4ac'), grout='#8a8680', rough=0.3)
    shell(wall, floor, ceil=L.M('acoustic', '#e2e0da', rough=0.95, bump=0.25, bump_scale=300.0))
    KIT.drop_ceiling(H, -W / 2, W / 2, -0.3, D, name='bdc')
    baseboard(L.M('vinyl_base', '#3a3a3a', rough=0.5), 0.1)
    lights = []
    prod = L.M('product', (1, 1, 1), rough=0.3, attr=True, coat=0.3)
    # back wall: long run of glowing drinks fridges + a wall gondola
    lights += drinks_fridge(at_back(-1.55, 0.72), w=0.78, doors=6, rng=rng, name='bfr')
    gondola(at_back(2.75, 0.45), 2.4, 0.45, 2.1, 6, rng, name='bwall', double=False)
    # left wall: wall shelving packed with goods
    gondola(at_left(3.8, 0.45), 5.2, 0.45, 2.1, 6, rng, name='lwall', double=False)
    # three aisles of double-sided gondolas
    for k, x in enumerate((-2.2, -0.6, 1.0)):
        gondola(TR(x, 4.7, 0, rz=PI / 2), 3.4, 0.8, 1.6, 5, rng, name='aisle%d' % k)
        cap = MB(TR(x, 2.9, 0))
        cap.box(-0.4, 0.4, -0.3, 0.3, 0.0, 0.12, color=(0.85, 0.85, 0.83))
        for lvl in range(3):
            products_row(cap, -0.38, 0.38, 0.0, 0.12 + lvl * 0.34, 0.28, 0.3, rng)
        cap.obj('endcap%d' % k, prod, bevel=0.002, seg=1)
    # counter at the front right with register, lotto, candy
    counter(TR(2.9, 2.0, 0, rz=PI / 2), 2.4, d=0.75, front=L.M('bd_ctr', '#6a4a30', rough=0.5), top=L.M('bd_top', '#d8d4ca', rough=0.3), name='bctr')
    rg = MB(TR(2.9, 1.5, 1.02)); rg.box(-0.18, 0.18, -0.15, 0.15, 0, 0.12, color=(0.15, 0.15, 0.15)); rg.box(-0.15, 0.15, -0.03, 0.0, 0.12, 0.35, color=(0.1, 0.1, 0.1), M=TR(0, 0.05, 0, rx=-0.3))
    rg.obj('register', K['attr_gloss'], bevel=0.005, seg=1)
    cr = MB(TR(2.9, 2.4, 1.02))
    products_row(cr, -0.3, 0.3, 0.2, 0.0, 0.35, 0.12, rng)
    cr.box(-0.32, 0.32, -0.18, 0.18, 0.12, 0.13, color=(0.8, 0.8, 0.8))
    products_row(cr, -0.3, 0.3, 0.2, 0.13, 0.35, 0.1, rng)
    cr.obj('candy', prod, bevel=0.002, seg=1)
    lot = MB(TR(2.9, 2.9, 1.02)); lot.box(-0.3, 0.3, -0.05, 0.05, 0.0, 0.5, color=(0.95, 0.95, 0.95)); lot.obj('lotto', L.M_emit('lotto', (1.0, 0.85, 0.3), day=1.2, night=1.5, base=(0.9, 0.8, 0.3)), bevel=0.01, seg=1)
    gondola(at_right(2.0, 0.35), 2.4, 0.35, 2.2, 8, rng, name='cigs', double=False, mat=L.M('bd_wood', '#5a3a22', rough=0.5))
    # front: flower buckets, chips rack, newspaper stand, ice chest
    fl = MB(); stm = MB(); blooms = MB()
    for k in range(7):
        x = -3.5 + k * 0.42
        fl.cyl(x, 0.55, 0.0, 0.32, 0.16, 0.18, n=16, color=(0.15, 0.15, 0.17))
        for j in range(9):
            a = rng.uniform(0, 2 * PI); r = rng.uniform(0.0, 0.12)
            hh = rng.uniform(0.55, 0.85)
            stm.cyl(x + r * math.cos(a), 0.55 + r * math.sin(a), 0.2, hh, 0.004, n=4)
            col = rng.choice([(0.9, 0.1, 0.2), (0.95, 0.8, 0.1), (0.95, 0.5, 0.7), (1.0, 1.0, 0.95), (0.95, 0.4, 0.1), (0.5, 0.2, 0.7)])
            blooms.sphere(x + r * math.cos(a) * 1.3, 0.55 + r * math.sin(a) * 1.3, hh, rng.uniform(0.035, 0.05), color=col, seg=8, rings=5)
    fl.obj('buckets', K['attr_gloss'], smooth=True)
    stm.obj('flower_stems', K['stem'], smooth=True)
    blooms.obj('blooms', L.M('bloom', (1, 1, 1), rough=0.6, attr=True, subsurface=0.2), smooth=True)
    ch = MB(TR(0.3, 1.0, 0))
    ch.box(-0.45, 0.45, -0.25, 0.25, 0.0, 0.05, color=(0.8, 0.8, 0.8))
    for lvl in range(4):
        z = 0.2 + lvl * 0.38
        ch.box(-0.45, 0.45, -0.2, 0.2, z - 0.01, z, color=(0.8, 0.8, 0.8))
        x = -0.43
        while x < 0.35:
            c = rng.choice(PRODUCT_COLS)
            ch.box(x, x + 0.14, -0.12, 0.08, z, z + 0.3, color=c, M=TR(0, 0, 0, rx=0.15))
            x += 0.15
    ch.box(-0.46, -0.44, -0.02, 0.02, 0.0, 1.8, color=(0.7, 0.7, 0.7)); ch.box(0.44, 0.46, -0.02, 0.02, 0.0, 1.8, color=(0.7, 0.7, 0.7))
    ch.obj('chips_rack', prod, bevel=0.01, seg=2)
    ns = MB(TR(1.4, 0.7, 0))
    ns.box(-0.35, 0.35, -0.2, 0.2, 0.0, 0.7, color=(0.2, 0.25, 0.3))
    for k in range(3):
        ns.box(-0.33 + k * 0.23, -0.13 + k * 0.23, -0.15, 0.15, 0.7, 0.72 + k * 0.01, color=(0.9, 0.88, 0.82), M=TR(0, 0, 0, rx=0.1))
    ns.obj('newsstand', K['attr_matte'], bevel=0.005, seg=1)
    sign = MB()
    for (x, y, z, w, h, c) in ((-1.0, 7.99, 2.7, 0.7, 0.4, (0.95, 0.9, 0.2)), (2.6, 7.99, 2.55, 0.5, 0.35, (1.0, 0.3, 0.2)),
                               (-3.99, 2.0, 2.45, 0.6, 0.45, (0.95, 0.95, 0.95)), (3.99, 4.5, 2.65, 0.5, 0.4, (0.2, 0.6, 1.0)),
                               (3.99, 1.2, 2.5, 0.4, 0.3, (0.1, 0.7, 0.3))):
        if abs(y - 7.99) < 0.02:
            sign.box(x - w / 2, x + w / 2, y - 0.005, y, z - h / 2, z + h / 2, color=c)
        else:
            sign.box(x - 0.005 if x > 0 else x, x if x > 0 else x + 0.005, y - w / 2, y + w / 2, z - h / 2, z + h / 2, color=c)
    sign.obj('paper_signs', K['paper'])
    atm = MB(at_left(0.8, 0.5)); atm.box(-0.3, 0.3, -0.25, 0.25, 0.0, 1.6, color=(0.25, 0.3, 0.4)); atm.obj('atm', K['attr_gloss'], bevel=0.02, seg=2)
    atmg = MB(at_left(0.8, 0.5)); atmg.box(-0.15, 0.15, -0.26, -0.25, 1.15, 1.4); atmg.obj('atm_scr', L.M_emit('atm_scr', (0.3, 0.6, 1.0), day=1.5, night=2.0))
    lights += neon(TR(-2.4, 0.12, 3.3), 'OPEN', (1.0, 0.15, 0.2), size=0.3, name='neon_open', power=3.0)
    lights += neon(TR(1.8, 0.12, 3.35), 'ATM  LOTTO', (0.2, 0.6, 1.0), size=0.22, name='neon_atm', power=2.0)
    lights += neon(TR(-1.55, D - 0.05, 3.1), 'COLD BEER', (0.95, 0.9, 0.3), size=0.3, name='neon_beer')
    for x in (-2.2, -0.6, 1.0, 2.6):
        for y in (1.5, 3.5, 5.5, 7.2):
            lights += tube_light(x, y, 1.2, 'Y', power=32.0, k=4300, name='bt%d%d' % (int(x * 10 + 30), int(y * 10)))
    people_silhouette(TR(3.4, 2.1, 0, rz=-PI / 2), rng, name='clerk')
    people_silhouette(TR(-1.4, 3.6, 0, rz=PI / 2 + 0.3), rng, name='shopper')
    people_silhouette(TR(2.1, 2.4, 0, rz=PI / 2), rng, name='shopper2')
    return lights


def washer(mb, M, x, color=(0.95, 0.95, 0.94), dryer=False):
    mb.box(x - 0.34, x + 0.34, -0.36, 0.36, 0.0, 0.92, color=color, M=M)


def shop_laundromat(rng):
    K = P.mats()
    wall = wall_mat('#d9e8f0')
    floor = KIT.M_tiles('lm_floor', '#c8c4bc', '#9a968e', scale=3.0, rough=0.35)
    shell(wall, floor, ceil=L.M('acoustic', '#e2e0da', rough=0.95, bump=0.25, bump_scale=300.0))
    KIT.drop_ceiling(H, -W / 2, W / 2, -0.3, D, name='ldc')
    lower_wall(L.M('lm_lower', '#3a6a9a', rough=0.35, coat=0.2), top=1.0, walls='lbr')
    lights = []
    white = L.M('appliance_white', '#f2f2ef', rough=0.25, coat=0.4)
    steel = K['steel']
    body = MB(); door = MB(); ring = MB(); panel = MB()
    # washers along left wall (front faces +X)
    for k in range(9):
        y = 0.8 + k * 0.72
        M = TR(-W / 2 + 0.38, y, 0, rz=PI / 2)
        body.box(-0.34, 0.34, -0.36, 0.36, 0.0, 0.95, M=M)
        panel.box(-0.34, 0.34, -0.36, -0.2, 0.95, 1.08, M=M)
        ring.cyl(0, 0, 0, 0.03, 0.22, n=28, M=M @ TR(0, -0.36, 0.55) @ Matrix.Rotation(PI / 2, 4, 'X'))
        door.cyl(0, 0, 0.031, 0.034, 0.18, n=28, M=M @ TR(0, -0.36, 0.55) @ Matrix.Rotation(PI / 2, 4, 'X'))
    # stacked dryers along the back wall (front faces -Y)
    for k in range(9):
        x = -3.2 + k * 0.76
        for lvl in (0, 1):
            M = TR(x, D - 0.4, lvl * 1.0)
            body.box(-0.37, 0.37, -0.38, 0.38, 0.02, 0.98, M=M)
            ring.cyl(0, 0, 0, 0.03, 0.27, n=28, M=M @ TR(0, -0.38, 0.5) @ Matrix.Rotation(PI / 2, 4, 'X'))
            door.cyl(0, 0, 0.031, 0.034, 0.23, n=28, M=M @ TR(0, -0.38, 0.5) @ Matrix.Rotation(PI / 2, 4, 'X'))
    body.obj('lm_bodies', white, bevel=0.01, seg=2)
    panel.obj('lm_panels', L.M('lm_panel', '#2a2d33', rough=0.3), bevel=0.005, seg=1)
    ring.obj('lm_rings', K['chrome'], smooth=True)
    door.obj('lm_doors', L.M('lm_glass', '#10161c', rough=0.05, coat=1.0), smooth=True)
    # folding tables + baskets
    for k, y in enumerate((2.2, 4.4)):
        P.table(TR(0.6, y, 0, rz=PI / 2), L.M('lm_lam', '#e8e6e0', rough=0.3), legs=K['chrome'], w=1.8, d=0.8, h=0.86, leg='round', name='ft%d' % k)
    bs = MB()
    for (x, y, c) in ((0.5, 1.8, (0.2, 0.5, 0.9)), (0.7, 4.8, (0.9, 0.3, 0.3)), (0.4, 4.0, (0.95, 0.95, 0.95))):
        bs.box(-0.25, 0.25, -0.18, 0.18, 0.86, 1.12, color=c, M=TR(x, y, 0, rz=rng.uniform(-0.3, 0.3)))
    bs.box(-0.2, 0.2, -0.15, 0.15, 1.12, 1.2, color=(0.9, 0.85, 0.75), M=TR(0.5, 1.8, 0))
    bs.obj('baskets', K['attr_matte'], bevel=0.02, seg=2)
    # chairs along right wall
    for k in range(6):
        y = 1.0 + k * 0.6
        P.dining_chair(at_right(y, 0.5), K['chrome'], seat=L.M('lm_chair', '#e8a81a', rough=0.35), name='lch%d' % k, style='solid')
    vm = MB(at_right(5.6, 0.8)); vm.box(-0.45, 0.45, -0.4, 0.4, 0.0, 1.85); vm.obj('vending', L.M('vend_red', '#b82020', rough=0.3), bevel=0.01, seg=2)
    vg = MB(at_right(5.6, 0.8)); vg.box(-0.4, 0.2, -0.405, -0.4, 0.6, 1.75); vg.obj('vend_glass', L.M_emit('vend_glow', (0.95, 0.95, 1.0), day=2.0, night=2.5))
    cmx = MB(at_right(6.8, 0.4)); cmx.box(-0.3, 0.3, -0.2, 0.2, 0.9, 1.7); cmx.obj('changer', steel, bevel=0.01, seg=2)
    menu_board(on_wall('r', 3.0, 2.6, off=0.02), 2.2, 0.8, 'WASH AND DRY', ['WASH  REG', 'WASH  XL', 'DRY  8 MIN', 'SOAP'], bg='#1f4a8a', fg='#ffffff',
               accent='#ffd23a', name='lmenu', rng=rng)
    lights += neon(TR(2.2, 0.12, 3.3), 'OPEN 24H', (1.0, 0.2, 0.4), size=0.25, name='neon_lm', power=3.0)
    for x in (-2.4, 0.0, 2.4):
        for y in (1.5, 3.5, 5.5, 7.2):
            lights += tube_light(x, y, 1.2, 'Y', power=34.0, k=4600, name='lt%d%d' % (int(x * 10 + 30), int(y * 10)))
    bn = MB(TR(1.6, 0.6, 0)); bn.box(-1.1, 1.1, -0.22, 0.22, 0.0, 0.45); bn.obj('lm_bench', L.M('lm_bench', '#e8a81a', rough=0.35), bevel=0.02, seg=2)
    P.plant(TR(-1.2, 0.6, 0), 'snake', 1.1, rng, pot_mat=P.mats()['ceramic'], name='lm_snake')
    people_silhouette(TR(1.2, 0.72, 0, rz=0.0), rng, name='lm_p3', seated=True)
    mag = MB(TR(0.6, 4.4, 0.86)); P.book_stack(mag, 0.0, 0.0, 0.0, rng, 3); mag.obj('lm_mags', P.mats()['book'], bevel=0.002, seg=1)
    people_silhouette(TR(0.1, 2.9, 0, rz=-PI / 2), rng, name='lm_p1')
    people_silhouette(TR(3.45, 2.2, 0, rz=-PI / 2), rng, name='lm_p2', seated=True)
    return lights


def shop_cafe(rng):
    K = P.mats()
    wall = wall_mat('#f0ebe2')
    floor = L.MT('cafe_floor', 'wood_floor', tint='#8a6440', scale=2.4, normal=0.6, rough_mul=0.55, coat=0.3)
    shell(wall, floor, back=KIT.M_tiles('cafe_sub', '#f4f3ee', '#cfcac0', scale=0.8, sx=2.0))
    baseboard(P.paint('#2a2a2a', 0.4), 0.1)
    lights = []
    counter(TR(-0.4, 6.1, 0), 4.6, d=0.75, front=P.M_wood('cafe_slats', '#6a4428', '#a8784a', grain_axis='Z'), top=K['marble'], name='cctr')
    sl = MB(TR(-0.4, 6.1, 0))
    for k in range(46):
        x = -2.28 + k * 0.1
        sl.box(x, x + 0.06, -0.39, -0.37, 0.1, 0.98)
    sl.obj('slats', P.M_wood('cafe_slats', '#6a4428', '#a8784a', grain_axis='Z'), bevel=0.003, seg=1)
    # espresso machine
    em = MB(TR(0.6, 6.25, 1.02))
    em.box(-0.45, 0.45, -0.25, 0.25, 0.0, 0.5)
    em.obj('espresso', K['chrome'], bevel=0.02, seg=3)
    eg = MB(TR(0.6, 6.25, 1.02))
    for x in (-0.25, 0.0, 0.25):
        eg.cyl(x, -0.3, 0.22, 0.3, 0.035, n=14)
        eg.box(x - 0.01, x + 0.01, -0.45, -0.3, 0.24, 0.26)
    eg.box(-0.45, 0.45, -0.28, -0.24, 0.0, 0.05)
    eg.obj('espresso_gh', K['black_metal'], smooth=True)
    gr = MB(TR(1.35, 6.25, 1.02)); gr.cyl(0, 0, 0, 0.45, 0.09, n=16, color=(0.1, 0.1, 0.1)); gr.lathe([(0.03, 0.45), (0.12, 0.65), (0.1, 0.66)], n=20, color=(0.5, 0.35, 0.2))
    gr.obj('grinder', K['attr_gloss'], smooth=True)
    lights += glass_case(TR(-1.6, 6.05, 0), 1.5, d=0.7, h=1.3, base=P.M_wood('cafe_slats', '#6a4428', '#a8784a', grain_axis='Z'), name='pastry', rng=rng)
    ft = MB(TR(-1.6, 6.05, 0))
    food_tray(ft, -0.35, 0.0, 0.76, 0.55, 0.45, 'croissant', rng)
    food_tray(ft, 0.35, 0.0, 0.76, 0.55, 0.45, 'donut', rng)
    food_tray(ft, 0.0, 0.0, 1.02, 1.2, 0.4, 'cake', rng)
    ft.obj('pastries', L.M('pastry', (1, 1, 1), rough=0.45, attr=True, coat=0.2), smooth=True)
    # back wall shelves
    sh = MB(TR(0, D, 0))
    for z in (1.5, 1.95):
        sh.box(-3.5, 3.5, -0.3, 0.0, z, z + 0.04)
    sh.obj('cafe_shelves', K['oak'], bevel=0.005, seg=2)
    bags = MB(TR(0, D, 0))
    for z in (1.54, 1.99):
        x = -3.4
        while x < 3.3:
            c = rng.choice([(0.85, 0.8, 0.7), (0.15, 0.15, 0.15), (0.6, 0.35, 0.2), (0.9, 0.9, 0.88), (0.3, 0.45, 0.4)])
            if rng.random() < 0.5:
                bags.box(x, x + 0.12, -0.2, -0.1, z, z + 0.22, color=c)
                x += 0.15
            else:
                bags.cyl(x + 0.05, -0.15, z, z + 0.09, 0.045, n=12, color=c)
                x += 0.12
    bags.obj('cafe_bags', K['attr_matte'], bevel=0.003, seg=1)
    menu_board(TR(-0.4, D - 0.05, 2.75), 3.2, 1.05, 'COFFEE', ['ESPRESSO', 'CORTADO', 'CAPPUCCINO', 'LATTE', 'POUR OVER', 'COLD BREW', 'MATCHA', 'CHAI'],
               bg='#1b1b1b', fg='#efeae0', accent='#d8b27a', name='cmenu', rng=rng, cols=2)
    for k, x in enumerate((-2.0, -0.8, 0.4, 1.6)):
        lights += shop_pendant(x, 5.8, drop=1.6, kind='dome', mat=K['brass'], power=40.0, r=0.17, name='cp%d' % k)
    # seating
    stone = L.MT('marble_w', 'marble', tint='#e4e2de', scale=1.4, rough_mul=0.35, normal=0.2, coat=0.4)
    for k, (x, y) in enumerate(((-2.8, 1.6), (-1.2, 2.3), (0.6, 1.5), (2.4, 2.2), (-2.8, 3.6), (1.8, 3.8))):
        cafe_table(TR(x, y, 0), stone, K['black_metal'], r=0.33, name='ct%d' % k)
        for a in (0.3, PI + 0.3):
            P.dining_chair(TR(x + 0.55 * math.sin(a), y - 0.55 * math.cos(a), 0, rz=a + PI), P.M_wood('bentwood', '#3a2416', '#5a3a22'), name='cc%d%d' % (k, int(a)))
        cu = MB(TR(x, y, 0.74)); cu.cyl(0.1, 0.05, 0, 0.08, 0.04, n=14, color=(0.95, 0.95, 0.93)); cu.cyl(-0.12, -0.08, 0, 0.1, 0.035, n=14, color=(0.9, 0.9, 0.88))
        cu.obj('cups%d' % k, K['attr_gloss'], smooth=True)
    bn = MB(TR(-W / 2 + 0.25, 2.6, 0)); bn.box(-0.25, 0.25, -1.8, 1.8, 0.0, 0.45); bn.obj('bench', K['walnut'], bevel=0.01, seg=2)
    bc = MB(TR(-W / 2 + 0.25, 2.6, 0)); bc.box(-0.23, 0.23, -1.75, 1.75, 0.45, 0.55); bc.obj('bench_cush', P.fabric('#5a6a58', 'fab_cafe'), bevel=0.03, seg=3)
    P.plant(TR(3.5, 0.6, 0), 'fig', 2.0, rng, pot_mat=K['terracotta'], name='cfig')
    P.plant(TR(3.5, 4.8, 0), 'monstera', 1.3, rng, pot_mat=K['ceramic'], name='cmon')
    P.plant(TR(0, D, 1.99) @ TR(-2.6, -0.15, 0.04), 'trail', 0.3, rng, name='ctrail')
    for x in (-2.5, 0.0, 2.5):
        for y in (1.5, 3.5):
            lights += can_light(x, y, power=35.0, k=3000, name='ccan%d%d' % (int(x * 10 + 30), int(y)))
    people_silhouette(TR(0.2, 6.75, 0, rz=PI), rng, name='barista', color=(0.15, 0.15, 0.15))
    people_silhouette(TR(-0.9, 4.9, 0, rz=PI), rng, name='cc1')
    people_silhouette(TR(0.6, 2.05, 0, rz=PI + 0.3), rng, name='cc2', seated=True)
    return lights


def shop_bookstore(rng):
    K = P.mats()
    wall = wall_mat('#46685a', detail=0.5)
    floor = L.MT('bs_floor', 'wood_floor', tint='#6a4428', scale=2.4, normal=0.6, rough_mul=0.6, coat=0.25)
    shell(wall, floor)
    baseboard(P.paint('#1e2e26', 0.4), 0.12)
    lights = []
    shelf = K['walnut']
    for k, x in enumerate((-3.0, -1.5, 0.0, 1.5, 3.0)):
        P.bookshelf(at_back(x, 0.4), shelf, w=1.5, d=0.4, h=3.3, shelves=9, rng=rng, name='bsb%d' % k, fill=0.95)
    for k, y in enumerate((1.4, 2.9, 4.4, 5.9)):
        P.bookshelf(at_left(y, 0.4), shelf, w=1.5, d=0.4, h=3.3, shelves=9, rng=rng, name='bsl%d' % k, fill=0.93)
    for k, y in enumerate((2.9, 4.4, 5.9)):
        P.bookshelf(at_right(y, 0.4), shelf, w=1.5, d=0.4, h=3.3, shelves=9, rng=rng, name='bsr%d' % k, fill=0.93)
    # low double-sided shelf in the middle + tables of stacks
    for k, y in enumerate((4.8,)):
        P.bookshelf(TR(-0.6, y, 0), shelf, w=2.2, d=0.4, h=1.3, shelves=3, rng=rng, name='mid', fill=0.95)
    tb = MB()
    for k, (x, y) in enumerate(((-0.8, 2.6), (1.2, 3.2))):
        P.table(TR(x, y, 0), K['oak'], w=1.5, d=0.9, h=0.8, leg='square', name='bt%d' % k)
        for i in range(6):
            P.book_stack(tb, x - 0.55 + (i % 3) * 0.55, y - 0.2 + (i // 3) * 0.42, 0.8, rng, rng.randint(2, 6))
    for i in range(10):
        bx = -0.3 + (i % 5) * 0.28
        tb.box(-0.09, 0.09, -0.02, 0.02, 0, 0.26, color=P.jitter(rng.choice(P.BOOK_PALETTE), rng), M=TR(bx - 0.6, 4.8 - 0.25, 1.3, rx=-0.25) if i < 5 else TR(bx - 0.6, 4.8 + 0.25, 1.3, rx=0.25, rz=PI))
    tb.obj('display_books', K['book'], bevel=0.002, seg=1)
    lad = MB(TR(1.8, D - 0.7, 0, rx=-0.18))
    for sx in (-0.22, 0.22):
        lad.box(sx - 0.02, sx + 0.02, -0.02, 0.02, 0.0, 3.4)
    for k in range(1, 11):
        lad.box(-0.22, 0.22, -0.015, 0.015, k * 0.3, k * 0.3 + 0.025)
    lad.obj('bladder', K['oak'], bevel=0.004, seg=2)
    P.armchair(facing(2.8, 1.4, -0.7, -0.6), P.leather('#6a3a22'), legs=K['walnut'], name='barm')
    lights += P.floor_lamp(TR(3.5, 1.9, 0), shade='#efe0c0', base=K['brass'], night=40.0, day=30.0, name='bfl')
    P.rug(TR(0.2, 2.8, 0), P.rug_image('rug_bs', 'persian', rng), 3.5, 2.6)
    counter(TR(2.6, 0.9, 0, rz=PI / 2), 1.2, d=0.6, front=shelf, top=K['oak'], name='bsctr')
    for k, (x, y) in enumerate(((-1.8, 2.0), (0.4, 2.0), (-1.8, 4.2), (0.4, 4.2), (2.2, 3.4), (-0.7, 6.3), (1.6, 6.3), (-2.4, 1.0), (0.2, 0.9))):
        lights += shop_pendant(x, y, drop=1.0, kind='dome', mat=K['brass'], power=48.0, r=0.18, name='bsp%d' % k)
    for x in (-3.0, -1.5, 0.0, 1.5, 3.0):
        lights += can_light(x, D - 1.0, power=30.0, k=3000, name='bscb%d' % int(x * 10 + 40), spot=1.2)
    for y in (1.4, 2.9, 4.4, 5.9):
        lights += can_light(-3.0, y, power=26.0, k=3000, name='bscl%d' % int(y * 10), spot=1.2)
        lights += can_light(3.0, y, power=26.0, k=3000, name='bscr%d' % int(y * 10), spot=1.2)
    menu_board(TR(0.0, D - 0.42, 3.62), 2.4, 0.5, 'BOOKS', [], bg='#1a2a22', fg='#e8d8a8', accent='#e8c878', name='bsign', rng=rng, price=False)
    ft = MB()
    for k, (x, y) in enumerate(((-2.4, 1.0), (0.2, 0.9))):
        P.table(TR(x, y, 0), K['walnut'], w=1.4, d=0.7, h=0.78, leg='square', name='bft%d' % k)
        for i in range(5):
            ft.box(-0.09, 0.09, -0.02, 0.02, 0, 0.27, color=P.jitter(rng.choice(P.BOOK_PALETTE), rng),
                   M=TR(x - 0.5 + i * 0.25, y - 0.15, 0.78, rx=0.35, rz=PI))
        P.book_stack(ft, x - 0.3, y + 0.15, 0.78, rng, 4)
        P.book_stack(ft, x + 0.35, y + 0.15, 0.78, rng, 3)
    ft.obj('front_books', K['book'], bevel=0.002, seg=1)
    people_silhouette(TR(-0.9, 3.4, 0, rz=0.2), rng, name='bp1')
    people_silhouette(TR(1.5, 5.3, 0, rz=PI - 0.4), rng, name='bp2')
    return lights


def shop_taqueria(rng):
    K = P.mats()
    wall = wall_mat('#e8793a')
    upper = wall_mat('#2a9d8f')
    floor = KIT.M_tiles('tq_floor', '#b8603a', '#7a4028', scale=2.4, rough=0.45)
    shell(wall, floor, back=upper)
    lower_wall(wall_mat('#f2c230'), top=1.1, walls='lr')
    baseboard(L.M('tq_base', '#3a2418', rough=0.4), 0.1)
    lights = []
    tal = L.M_image('talavera', talavera_image('talavera_img', rng), rough=0.2, coat=0.5)
    counter(TR(-0.3, 5.6, 0), 5.6, d=0.75, front=L.M('tq_front', '#f2ece0', rough=0.2), top=K['steel'], name='tctr')
    tf = MB(TR(-0.3, 5.6, 0))
    tf.quad((-2.8, -0.386, 0.1), (2.8, -0.386, 0.1), (2.8, -0.386, 0.98), (-2.8, -0.386, 0.98), uv01=True)
    tf.obj('tal_front', tal)
    sg = MB(TR(-0.3, 5.6, 0))
    sg.quad((-2.7, -0.3, 1.3), (2.7, -0.3, 1.3), (2.7, -0.05, 1.5), (-2.7, -0.05, 1.5))
    sg.obj('tq_sneeze', glass_door_mat())
    pans = MB(TR(-0.3, 5.6, 1.02))
    cols = [(0.5, 0.2, 0.08), (0.9, 0.85, 0.7), (0.2, 0.5, 0.15), (0.75, 0.1, 0.05), (0.9, 0.7, 0.3), (0.25, 0.15, 0.1), (0.95, 0.95, 0.9), (0.4, 0.6, 0.2)]
    for k in range(8):
        x = -2.4 + k * 0.62
        pans.box(x - 0.28, x + 0.28, -0.2, 0.15, -0.005, 0.02, color=cols[k])
    pans.obj('tq_food', L.M('tq_food', (1, 1, 1), rough=0.5, attr=True, bump=0.4), bevel=0.003, seg=1)
    # big illuminated menu with photos
    ph = photo_board_image('tq_photos', rng)
    mb = MB(TR(-0.3, D - 0.05, 2.9))
    mb.quad((-2.8, -0.02, -0.5), (2.8, -0.02, -0.5), (2.8, -0.02, 0.5), (-2.8, -0.02, 0.5), uv01=True)
    mb.obj('tq_menu', L.M_image('tq_menu_mat', ph, rough=0.3, emit_day=1.2, emit_night=1.2))
    fr = MB(TR(-0.3, D - 0.05, 2.9)); fr.box(-2.85, 2.85, 0.0, 0.05, -0.55, 0.55); fr.obj('tq_menu_frame', L.M('tq_frame', '#1a1a1a', rough=0.4))
    text(TR(-0.3, D - 0.08, 3.62), 'TAQUERIA EL FAROLITO', size=0.32, mat=L.M_emit('tq_title', (1.0, 0.85, 0.2), day=2.0, night=3.0), align='CENTER', name='tq_title')
    # papel picado
    pp = MB()
    for k, y in enumerate((1.2, 2.6, 4.0)):
        for i in range(28):
            x = -3.8 + i * 0.28
            sag = 0.18 * (1 - ((x / 3.9) ** 2))
            pp.box(x, x + 0.22, y - 0.002, y + 0.002, 3.55 - sag - 0.28, 3.55 - sag,
                   color=[(0.95, 0.2, 0.5), (0.2, 0.6, 0.95), (0.95, 0.8, 0.1), (0.3, 0.8, 0.3), (0.95, 0.4, 0.1), (0.6, 0.2, 0.8)][(i + k) % 6])
    pp.obj('papel', L.M_shade('papel_mat', (1, 1, 1), trans=0.6) if False else L.M('papel_mat', (1, 1, 1), rough=0.6, attr=True, subsurface=0.0), smooth=False)
    ln = MB()
    for y in (1.2, 2.6, 4.0):
        ln.cyl(0, 0, -4.0, 4.0, 0.002, n=4, M=TR(0, y, 3.55 - 0.01, ry=PI / 2))
    ln.obj('papel_strings', K['cord'], smooth=True)
    chairs = [L.M('tq_c%d' % i, c, rough=0.35) for i, c in enumerate(('#d62828', '#f2c230', '#2a9d8f', '#1f6aa5'))]
    for k, (x, y) in enumerate(((-2.8, 1.5), (-0.8, 2.2), (1.3, 1.5), (2.9, 3.2), (-2.8, 3.6))):
        P.table(TR(x, y, 0), L.M('tq_table', '#f2ece0', rough=0.3), legs=K['chrome'], w=0.8, d=0.8, h=0.76, leg='pedestal', name='tt%d' % k)
        for j, a in enumerate((0.0, PI)):
            P.dining_chair(TR(x + 0.55 * math.sin(a), y - 0.55 * math.cos(a), 0, rz=a + PI), chairs[(k + j) % 4], name='tch%d%d' % (k, j), style='solid')
        tb = MB(TR(x, y, 0.76)); tb.cyl(0.2, 0.1, 0, 0.18, 0.03, n=10, color=(0.8, 0.1, 0.05)); tb.cyl(0.26, 0.15, 0, 0.18, 0.03, n=10, color=(0.2, 0.6, 0.2))
        tb.box(-0.15, 0.15, -0.1, 0.1, 0, 0.03, color=(0.95, 0.95, 0.95))
        tb.obj('tq_tbl%d' % k, K['attr_gloss'], smooth=True)
    lights += drinks_fridge(at_right(6.0, 0.7), doors=2, rng=rng, name='tqfr')
    for k, (x, y) in enumerate(((-2.8, 1.5), (-0.8, 2.2), (1.3, 1.5), (2.9, 3.2))):
        lights += shop_pendant(x, y, drop=1.4, kind='cone', mat=L.M('tq_pend', '#1a1a1a', rough=0.35), power=40.0, r=0.18, name='tp%d' % k)
    for x in (-2.5, 0.0, 2.5):
        lights += can_light(x, 5.2, power=45.0, k=3300, name='tcan%d' % int(x * 10 + 30))
    P.art(on_wall('l', 2.5, 2.2), P.art_image('tq_art1', 'poster', rng), 0.8, 1.1, frame='#1a1a1a', border=0.03, name='tqa1')
    people_silhouette(TR(-0.8, 6.3, 0, rz=PI), rng, name='tq_cook', color=(0.95, 0.95, 0.92))
    people_silhouette(TR(0.8, 4.6, 0, rz=PI), rng, name='tq_c1')
    people_silhouette(TR(-2.8, 2.05, 0, rz=PI), rng, name='tq_c2', seated=True)
    return lights


def shop_dimsum(rng):
    K = P.mats()
    wall = wall_mat('#f2e6cc')
    floor = KIT.M_tiles('ds_floor', '#e8e2d4', '#b0a898', scale=2.4, rough=0.2)
    shell(wall, floor)
    lower_wall(L.M('ds_red', '#a8161a', rough=0.3, coat=0.3), top=0.9, walls='lbr')
    baseboard(L.M('ds_base', '#3a1a10', rough=0.4), 0.08)
    lights = []
    # L-shaped display cases
    for k, x in enumerate((-1.4, 0.2, 1.8)):
        lights += glass_case(TR(x, 3.8, 0), 1.55, d=0.75, h=1.3, base=L.M('ds_case_base', '#8a1a14', rough=0.3, coat=0.3), name='dcase%d' % k, rng=rng)
    fd = MB()
    kinds = [('bun', 'tart'), ('sesame', 'bun'), ('tart', 'croissant')]
    for k, x in enumerate((-1.4, 0.2, 1.8)):
        food_tray(fd, x - 0.37, 3.8, 0.76, 0.66, 0.55, kinds[k][0], rng)
        food_tray(fd, x + 0.37, 3.8, 0.76, 0.66, 0.55, kinds[k][1], rng)
        food_tray(fd, x, 3.8, 1.02, 1.3, 0.4, 'bun' if k != 1 else 'tart', rng)
    fd.obj('ds_food', L.M('ds_pastry', (1, 1, 1), rough=0.45, attr=True, coat=0.25), smooth=True)
    counter(TR(-0.2, 6.0, 0), 4.2, d=0.7, front=L.M('ds_ctr', '#6a1410', rough=0.35), top=K['marble'], name='dsctr')
    stm = MB(TR(-0.2, 6.0, 1.02))
    for k in range(4):
        for lvl in range(rng.randint(2, 4)):
            stm.cyl(-1.6 + k * 0.35, 0.0, lvl * 0.09, lvl * 0.09 + 0.085, 0.14, n=24)
    stm.obj('steamers', P.M_wood('bamboo', '#b8904a', '#e0c080', coat=0.0), smooth=True)
    reg = MB(TR(1.2, 6.0, 1.02)); reg.box(-0.18, 0.18, -0.15, 0.15, 0, 0.12, color=(0.15, 0.15, 0.15)); reg.box(-0.12, 0.12, -0.02, 0.02, 0.1, 0.3, color=(0.1, 0.1, 0.1))
    reg.sphere(0.5, 0.0, 0.1, 0.1, color=(0.95, 0.85, 0.3)); reg.sphere(0.5, 0.0, 0.24, 0.07, color=(0.95, 0.9, 0.85))
    reg.obj('ds_reg', K['attr_gloss'], smooth=True)
    gb = glyph_board_image('ds_glyphs', rng)
    for k, x in enumerate((-2.2, -0.2, 1.8)):
        b = MB(TR(x, D - 0.05, 2.8))
        b.quad((-0.8, -0.02, -0.6), (0.8, -0.02, -0.6), (0.8, -0.02, 0.6), (-0.8, -0.02, 0.6), uv01=True)
        b.obj('ds_menu%d' % k, L.M_image('ds_menu_mat', gb, rough=0.4, emit_day=0.8, emit_night=1.0))
        fr = MB(TR(x, D - 0.05, 2.8)); fr.box(-0.85, 0.85, 0.0, 0.03, -0.65, 0.65); fr.obj('ds_menu_fr%d' % k, K['brass'], bevel=0.005, seg=1)
    # red lanterns
    lan = MB(); tas = MB(); cap = MB()
    lpos = [(-2.6, 1.6), (-0.9, 1.4), (0.8, 1.6), (2.5, 1.4), (-1.8, 5.0), (1.2, 5.0)]
    for (x, y) in lpos:
        z = 2.75
        lan.sphere(x, y, z, 0.26, sz=0.8, seg=24, rings=14)
        cap.cyl(x, y, z + 0.18, z + 0.24, 0.1, n=16); cap.cyl(x, y, z - 0.24, z - 0.18, 0.1, n=16)
        cap.cyl(x, y, z + 0.24, H, 0.004, n=5)
        tas.cyl(x, y, z - 0.55, z - 0.24, 0.025, 0.012, n=8)
    lan.obj('lanterns', L.M_emit('lantern_red', (1.0, 0.06, 0.02), day=0.35, night=0.5, base=(0.6, 0.02, 0.01), rough=0.45), smooth=True)
    cap.obj('lantern_caps', L.M('gold', '#c8a040', rough=0.3, metal=1.0), smooth=True)
    tas.obj('lantern_tassels', L.M('tassel', '#c01810', rough=0.8), smooth=True)
    for k, (x, y) in enumerate(lpos):
        lights.append(L.light('POINT', (x, y, 2.35), 6.0, (1.0, 0.3, 0.15), 0.1, day=4.0, night=6.0, name='lanL%d' % k))
    # round table + chairs
    for k, (x, y) in enumerate(((-2.6, 1.8), (2.4, 1.8))):
        P.table(TR(x, y, 0), L.M('ds_cloth', '#f4f0e6', rough=0.8), legs=K['black_metal'], w=1.1, d=1.1, h=0.76, leg='round_top', name='dst%d' % k)
        for j in range(4):
            a = j * PI / 2 + 0.4
            P.dining_chair(TR(x + 0.75 * math.sin(a), y - 0.75 * math.cos(a), 0, rz=a + PI), K['walnut'], seat=L.M('ds_seat', '#8a1a14', rough=0.4), name='dsc%d%d' % (k, j))
        tt = MB(TR(x, y, 0.76))
        for j in range(3):
            tt.cyl(0.3 * math.cos(j * 2.1), 0.3 * math.sin(j * 2.1), 0, 0.07, 0.09, n=18, color=(0.72, 0.56, 0.3))
        tt.cyl(0, 0, 0, 0.12, 0.05, 0.06, n=16, color=(0.95, 0.95, 0.92))
        tt.obj('ds_tt%d' % k, K['attr_gloss'], smooth=True)
    P.art(on_wall('l', 4.5, 2.2), P.art_image('ds_art', 'landscape', rng), 1.2, 0.8, frame_mat=L.M('gold', '#c8a040', rough=0.3, metal=1.0), border=0.05, name='dsart')
    P.plant(TR(3.5, 6.8, 0), 'palm', 1.8, rng, pot_mat=L.M('ds_pot', '#1f4a9a', rough=0.2, coat=0.5), name='dsplant')
    for x in (-2.5, 0.0, 2.5):
        for y in (3.4, 6.2):
            lights += can_light(x, y, power=38.0, k=3500, name='dcan%d%d' % (int(x * 10 + 30), int(y)))
    people_silhouette(TR(-0.8, 6.65, 0, rz=PI), rng, name='ds_staff', color=(0.9, 0.9, 0.88))
    people_silhouette(TR(0.3, 3.0, 0, rz=0.1), rng, name='ds_c1')
    people_silhouette(TR(-0.5, 2.6, 0, rz=-0.3), rng, name='ds_c2')
    return lights


# interior light multiplier per shop (applied to every variant-switched light, both variants)
LIGHT_MUL = [7.0, 4.4, 0.85, 0.68, 8.5, 14.0, 6.2, 3.8]

SHOPS = [
    ('pizzeria', 'Pizzeria', shop_pizzeria),
    ('diner', 'Diner', shop_diner),
    ('bodega', 'Corner Bodega', shop_bodega),
    ('laundromat', 'Laundromat', shop_laundromat),
    ('cafe', 'Cafe', shop_cafe),
    ('bookstore', 'Bookstore', shop_bookstore),
    ('taqueria', 'Taqueria', shop_taqueria),
    ('dimsum', 'Dim Sum / Chinese Bakery', shop_dimsum),
]


def build_shop(i):
    L.clear_objects()
    global PRODUCT_COLS
    rng = random.Random(4242 + 91 * i)
    PRODUCT_COLS = product_colors(random.Random(77 + i), 60)
    L.setup_im_camera(W, H, D, TW, TH)
    SHOPS[i][2](rng)
    daylight()
    L.GAIN['day'] = DAY_GAIN * LIGHT_MUL[i]
    L.GAIN['night'] = NIGHT_GAIN * LIGHT_MUL[i]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--samples', type=int, default=192)
    ap.add_argument('--only', type=str, default='')
    ap.add_argument('--variants', type=str, default='day,night')
    ap.add_argument('--scale', type=float, default=1.0, help='resolution scale for quick tests')
    ap.add_argument('--test', action='store_true')
    ap.add_argument('--no-atlas', action='store_true')
    ap.add_argument('--assemble-only', action='store_true')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    a = ap.parse_args(argv)
    if a.assemble_only:
        assemble()
        return
    global TW, TH
    TW, TH = int(1024 * a.scale), int(512 * a.scale)
    L.reset_factory()
    L.GAIN['day'] = DAY_GAIN
    L.GAIN['night'] = NIGHT_GAIN
    L.setup_render(TW, TH, samples=a.samples, exposure=EXPOSURE)
    setup_world()
    idx = [int(s) for s in a.only.split(',')] if a.only else list(range(len(SHOPS)))
    t0 = time.time()
    out_dir = CACHE_DIR + ('_test' if a.test else '')
    for i in idx:
        build_shop(i)
        if i == idx[0]:
            L.verify_projection(W, H, D, TW, TH, 'shops')
        for v in a.variants.split(','):
            L.set_variant(v)
            dt = L.render_to(os.path.join(out_dir, '%02d_%s.png' % (i, v)))
            print('[shops] %02d %-12s %-5s %.1fs' % (i, SHOPS[i][0], v, dt), flush=True)
    print('[shops] render total %.1fs' % (time.time() - t0))
    if not a.no_atlas and not a.test and not a.only:
        assemble()


def assemble():
    tiles = {}
    for v in ('day', 'night'):
        atlas = np.zeros((TH * 4, TW * 2, 3), np.float32)
        for i in range(8):
            img = L.load_png(os.path.join(CACHE_DIR, '%02d_%s.png' % (i, v)))
            r, c = i // 2, i % 2
            atlas[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = img
            tiles[(i, v)] = img
        L.save_image(os.path.join(L.BAKED, 'shops.jpg' if v == 'day' else 'shops_night.jpg'), atlas, 'JPEG', 90)
    meta = []
    for i, (typ, label, _) in enumerate(SHOPS):
        d, n = tiles[(i, 'day')], tiles[(i, 'night')]
        tint = d.reshape(-1, 3).mean(axis=0)
        meta.append({'index': i, 'name': typ, 'type': typ, 'label': label, 'col': i % 2, 'row': i // 2,
                     'tint': [round(float(x), 4) for x in tint],
                     'tintHex': '#%02x%02x%02x' % tuple(int(round(float(x) * 255)) for x in tint),
                     'litFraction': round(float((L.luma(n) > LIT_THRESHOLD).mean()), 4)})
    with open(os.path.join(L.BAKED, 'shops.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[shops] wrote shops.jpg, shops_night.jpg, shops.json')


if __name__ == '__main__':
    main()
