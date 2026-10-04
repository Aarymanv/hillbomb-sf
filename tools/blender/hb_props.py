"""Procedural furniture / props for the HILLBOMB interior bakes.

Convention for every builder: M = placement matrix (use hb_lib.TR).  Local frame:
origin on the floor at the object's footprint centre, +Z up, the object's FRONT
faces local -Y.  With rz = 0 an object faces the window/camera (stand it against
the back wall); rz = +pi/2 faces +X (against the left wall); rz = -pi/2 faces -X
(against the right wall); rz = pi faces the back wall.
"""
import math, random
import numpy as np
import bpy
from mathutils import Matrix, Vector
import hb_lib as L
from hb_lib import MB, TR

PI = math.pi

# ----------------------------------------------------------------------------
# material library
# ----------------------------------------------------------------------------

def M_wood(name, dark='#4a2e1a', light='#8a5a36', rough=0.45, scale=1.0, coat=0.25, grain_axis='X'):
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    s = {'X': (0.8, 14, 14), 'Y': (14, 0.8, 14), 'Z': (14, 14, 0.8)}[grain_axis]
    mp.inputs['Scale'].default_value = tuple(v * scale for v in s)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 2.0
    nz.inputs['Detail'].default_value = 10.0
    nz.inputs['Distortion'].default_value = 0.6
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'BANDS'
    wv.inputs['Scale'].default_value = 3.0
    wv.inputs['Distortion'].default_value = 8.0
    wv.inputs['Detail'].default_value = 4.0
    nt.links.new(mp.outputs['Vector'], wv.inputs['Vector'])
    f = L.math_node(nt, 'MULTIPLY', nz.outputs['Fac'], wv.outputs['Fac'])
    f = L.math_node(nt, 'POWER', f, 0.7)
    col = L.mix_rgb(nt, f, L.hexc(dark), L.hexc(light))
    nt.links.new(col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.15
    L._MATS[name] = m
    return m


def mats():
    """Common materials (cached)."""
    d = {}
    d['oak'] = M_wood('oak', '#7a5534', '#b88a5a')
    d['walnut'] = M_wood('walnut', '#2f1d12', '#6a4428')
    d['teak'] = M_wood('teak', '#5a3718', '#9a6a3c')
    d['pine'] = M_wood('pine', '#a8835a', '#d9b98c', coat=0.1)
    d['white_paint'] = L.M('white_paint', '#e9e6df', rough=0.35, rough_var=0.05)
    d['black_metal'] = L.M('black_metal', '#161616', rough=0.45, metal=0.3)
    d['brass'] = L.M('brass', '#c09a5b', rough=0.28, metal=1.0)
    d['chrome'] = L.M('chrome', '#e0e0e0', rough=0.08, metal=1.0, rough_var=0.02)
    d['steel'] = L.MT('steel', 'metal', tint='#b8bcc0', scale=0.8, rough_mul=0.6, metal=1.0, normal=0.2)
    d['ceramic'] = L.M('ceramic', '#efece6', rough=0.12, coat=0.4, rough_var=0.02)
    d['ceramic_dark'] = L.M('ceramic_dark', '#2c3a3c', rough=0.18, coat=0.4, rough_var=0.02)
    d['terracotta'] = L.M('terracotta', '#a8583a', rough=0.75)
    d['soil'] = L.M('soil', '#2a1d14', rough=0.95, bump=0.4)
    d['glass'] = L.M('glass', (0.9, 0.95, 0.95), rough=0.02, transmission=1.0, ior=1.45, rough_var=0.0)
    d['mirror'] = L.M('mirror', '#d8d8d8', rough=0.02, metal=1.0, rough_var=0.0)
    d['plastic_black'] = L.M('plastic_black', '#0e0e0f', rough=0.35)
    d['plastic_white'] = L.M('plastic_white', '#e4e4e0', rough=0.3)
    d['plastic_grey'] = L.M('plastic_grey', '#5c5f63', rough=0.5)
    d['paper'] = L.M('paper', '#ece8dc', rough=0.8, attr=True)
    d['book'] = L.M('book', (1, 1, 1), rough=0.55, attr=True, rough_var=0.12)
    d['attr_matte'] = L.M('attr_matte', (1, 1, 1), rough=0.6, attr=True)
    d['attr_gloss'] = L.M('attr_gloss', (1, 1, 1), rough=0.2, attr=True, coat=0.3)
    d['stem'] = L.M('stem', '#3b3322', rough=0.7)
    d['leaf'] = L.M_leaf('leaf')
    d['candle'] = L.M('candle', '#f0ead8', rough=0.5, subsurface=0.3)
    d['cord'] = L.M('cord', '#111111', rough=0.5)
    d['marble'] = L.MT('marble_w', 'marble', tint='#e4e2de', scale=1.4, rough_mul=0.35, normal=0.2, coat=0.4, detail=1.0)
    d['wicker'] = L.MT('wicker', 'fabric', tint='#a07a4a', scale=0.15, normal=1.5)
    return d


def fabric(color, name=None, scale=0.45):
    return L.MT(name or ('fab_' + color.lstrip('#')), 'fabric', tint=color, scale=scale, normal=0.8, sheen=0.4,
                rough_mul=1.0, rough_add=0.1)


def leather(color, name=None):
    return L.MT(name or ('lea_' + color.lstrip('#')), 'leather', tint=color, scale=0.5, normal=0.6, rough_mul=0.7,
                coat=0.15)


def paint(color, rough=0.35, name=None):
    return L.M(name or ('paint_' + color.lstrip('#')), color, rough=rough, rough_var=0.05)


BOOK_PALETTE = ['#7a1f1f', '#1f2f4f', '#e8e0cc', '#1c1c1c', '#2f4a32', '#c89b3c', '#efefe8', '#d2692f', '#2e6b6b',
                '#5a2e4a', '#8a8a82', '#b83a2c', '#3a5f8c', '#d8c9a3', '#4a3a2a', '#9ab0a0', '#f2c230']


def jitter(hexcol, rng, amt=0.12):
    c = np.array(L.hexc(hexcol))
    c = c * (1.0 + np.array([rng.uniform(-amt, amt) for _ in range(3)]) * 0.5) * rng.uniform(1 - amt, 1 + amt)
    return tuple(np.clip(c, 0, 1))


# ----------------------------------------------------------------------------
# seating
# ----------------------------------------------------------------------------

def sofa(M, fab, w=2.1, d=0.92, n=3, legs=None, pillows=(), rng=None, arm_w=0.17, arm_h=0.62, back_h=0.82,
         style='modern', name='sofa'):
    rng = rng or random.Random(1)
    K = mats()
    legs = legs or K['walnut']
    lg = MB(M)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lg.cyl(sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), 0, 0.11, 0.024, 0.017, n=12)
    lg.obj(name + '_legs', legs, bevel=0.004, seg=2)
    mb = MB(M)
    mb.box(-w / 2, w / 2, -d / 2 + 0.04, d / 2, 0.11, 0.33)
    if style == 'chesterfield':
        arm_h = back_h
    mb.box(-w / 2, -w / 2 + arm_w, -d / 2, d / 2, 0.11, arm_h)
    mb.box(w / 2 - arm_w, w / 2, -d / 2, d / 2, 0.11, arm_h)
    mb.box(-w / 2 + arm_w - 0.01, w / 2 - arm_w + 0.01, d / 2 - 0.2, d / 2, 0.33, back_h)
    if style == 'chesterfield':
        for sx in (-1, 1):
            mb.cyl(0, 0, -d / 2, d / 2, 0.1, n=20, M=TR(sx * (w / 2 - arm_w / 2), 0, arm_h - 0.02) @ Matrix.Rotation(-PI / 2, 4, 'X'))
    mb.obj(name + '_frame', fab, bevel=0.035, seg=4)
    cu = MB(M)
    inner = w - 2 * arm_w
    cw = inner / n
    for i in range(n):
        x0 = -w / 2 + arm_w + i * cw + 0.004
        cu.box(x0, x0 + cw - 0.008, -d / 2 + 0.035, d / 2 - 0.19, 0.33, 0.48)
        if style != 'chesterfield':
            cu.box(x0, x0 + cw - 0.008, -0.2, 0.0, 0.0, back_h - 0.43 + 0.08, M=TR(0, d / 2 - 0.2, 0.48, rx=-0.2))
    cu.obj(name + '_cush', fab, bevel=0.05, seg=4)
    for k, pm in enumerate(pillows):
        side = -1 if k % 2 == 0 else 1
        off = (k // 2) * 0.22
        pw = 0.46 - off * 0.3
        pb = MB(M)
        px = side * (w / 2 - arm_w - pw / 2 - 0.04 - off)
        pb.box(-pw / 2, pw / 2, -0.07, 0.07, 0, pw,
               M=TR(px, d / 2 - 0.34, 0.45, rz=side * rng.uniform(0.1, 0.35) * -1, rx=-0.32, ry=side * rng.uniform(0.0, 0.12)))
        pb.obj(name + '_pillow%d' % k, pm, bevel=0.06, seg=2, subsurf=2)


def armchair(M, fab, w=0.86, d=0.86, legs=None, style='modern', pillow=None, rng=None, name='armchair'):
    sofa(M, fab, w=w, d=d, n=1, legs=legs, pillows=(pillow,) if pillow else (), rng=rng, arm_w=0.15,
         style=style, name=name)


def dining_chair(M, wood, seat=None, name='dchair', style='spindle'):
    mb = MB(M)
    w, d, sh, bh = 0.45, 0.48, 0.46, 0.92
    for sx in (-1, 1):
        mb.box(sx * (w / 2 - 0.02) - 0.02, sx * (w / 2 - 0.02) + 0.02, -d / 2 + 0.02, -d / 2 + 0.06, 0, sh)
        mb.box(sx * (w / 2 - 0.02) - 0.02, sx * (w / 2 - 0.02) + 0.02, d / 2 - 0.05, d / 2 - 0.01, 0, bh)
    mb.box(-w / 2, w / 2, -d / 2, d / 2, sh - 0.04, sh)
    mb.box(-w / 2 + 0.02, w / 2 - 0.02, d / 2 - 0.045, d / 2 - 0.015, bh - 0.1, bh - 0.02)
    if style == 'spindle':
        for i in range(5):
            x = -0.14 + i * 0.07
            mb.box(x - 0.01, x + 0.01, d / 2 - 0.04, d / 2 - 0.02, sh, bh - 0.1)
    else:
        mb.box(-w / 2 + 0.02, w / 2 - 0.02, d / 2 - 0.045, d / 2 - 0.015, sh + 0.2, sh + 0.28)
    mb.box(-w / 2 + 0.03, w / 2 - 0.03, -d / 2 + 0.03, d / 2 - 0.03, 0.14, 0.16)
    mb.obj(name, wood, bevel=0.006, seg=2)
    if seat is not None:
        sb = MB(M)
        sb.box(-w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.02, d / 2 - 0.05, sh, sh + 0.05)
        sb.obj(name + '_seat', seat, bevel=0.02, seg=3)


def office_chair(M, fab, name='ochair', rng=None):
    K = mats()
    mb = MB(M)
    # 5-star base
    for i in range(5):
        a = 2 * PI * i / 5 + 0.3
        mb.box(-0.02, 0.02, 0.0, 0.3, 0.07, 0.11, M=TR(0, 0, 0, rz=a))
        mb.sphere(0.3 * -math.sin(a), 0.3 * math.cos(a), 0.035, 0.03, seg=10, rings=6)
    mb.cyl(0, 0, 0.08, 0.42, 0.025, n=16)
    mb.box(-0.22, -0.2, -0.05, 0.15, 0.48, 0.66)
    mb.box(0.2, 0.22, -0.05, 0.15, 0.48, 0.66)
    mb.box(-0.26, -0.17, -0.12, 0.14, 0.66, 0.69)
    mb.box(0.17, 0.26, -0.12, 0.14, 0.66, 0.69)
    mb.box(-0.03, 0.03, 0.2, 0.25, 0.42, 0.62)
    mb.obj(name + '_frame', K['plastic_black'], bevel=0.008, seg=2)
    s = MB(M)
    s.box(-0.25, 0.25, -0.24, 0.24, 0.42, 0.5)
    s.box(-0.23, 0.23, 0.0, 0.07, 0.0, 0.56, M=TR(0, 0.22, 0.55, rx=-0.12))
    s.obj(name + '_seat', fab, bevel=0.035, seg=3)


def stool(M, top, legs=None, h=0.75, name='stool'):
    K = mats()
    mb = MB(M)
    for i in range(4):
        a = PI / 4 + i * PI / 2
        mb.cyl(0, 0, 0, h - 0.03, 0.013, n=8, M=TR(0.16 * math.cos(a), 0.16 * math.sin(a), 0, rx=0.06 * math.sin(a), ry=-0.06 * math.cos(a)))
    mb.lathe([(0.2, 0.25), (0.215, 0.25), (0.215, 0.27), (0.2, 0.27)], n=20, close_top=True)
    mb.obj(name + '_legs', legs or K['black_metal'], smooth=True)
    t = MB(M)
    t.cyl(0, 0, h - 0.04, h, 0.19, n=24)
    t.obj(name + '_top', top, bevel=0.012, seg=2)


# ----------------------------------------------------------------------------
# tables & storage
# ----------------------------------------------------------------------------

def table(M, top, legs=None, w=1.1, d=0.6, h=0.42, t=0.04, leg='square', inset=0.05, name='table', apron=False):
    legs = legs or top
    tb = MB(M)
    if leg == 'round_top':
        tb.cyl(0, 0, h - t, h, w / 2, n=40)
    else:
        tb.box(-w / 2, w / 2, -d / 2, d / 2, h - t, h)
    tb.obj(name + '_top', top, bevel=0.008, seg=2)
    lg = MB(M)
    if leg == 'pedestal' or leg == 'round_top':
        lg.lathe([(0.25, 0.0), (0.25, 0.02), (0.06, 0.08), (0.05, h - t - 0.05), (0.12, h - t)], n=24, close_bot=True)
    else:
        lw = 0.045 if leg == 'square' else 0.02
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = sx * (w / 2 - inset), sy * (d / 2 - inset)
                if leg == 'square':
                    lg.box(x - lw / 2, x + lw / 2, y - lw / 2, y + lw / 2, 0, h - t)
                else:
                    lg.cyl(x, y, 0, h - t, lw, n=10)
        if apron:
            lg.box(-w / 2 + inset, w / 2 - inset, -d / 2 + inset - 0.01, -d / 2 + inset + 0.01, h - t - 0.09, h - t)
            lg.box(-w / 2 + inset, w / 2 - inset, d / 2 - inset - 0.01, d / 2 - inset + 0.01, h - t - 0.09, h - t)
            lg.box(-w / 2 + inset - 0.01, -w / 2 + inset + 0.01, -d / 2 + inset, d / 2 - inset, h - t - 0.09, h - t)
            lg.box(w / 2 - inset - 0.01, w / 2 - inset + 0.01, -d / 2 + inset, d / 2 - inset, h - t - 0.09, h - t)
    lg.obj(name + '_legs', legs, bevel=0.004, seg=2)
    return h


def cabinet(M, body, w=1.2, d=0.45, h=0.8, rows=3, cols=2, handle=None, top=None, legs=True, name='cab',
            doors=False):
    """Dresser / sideboard / nightstand: drawer (or door) fronts with handles."""
    K = mats()
    handle = handle or K['brass']
    lh = 0.1 if legs else 0.0
    b = MB(M)
    b.box(-w / 2, w / 2, -d / 2 + 0.02, d / 2, lh, h - 0.03)
    fh = (h - 0.03 - lh - 0.02) / rows
    fw = (w - 0.02) / cols
    for r in range(rows):
        for c in range(cols):
            x0 = -w / 2 + 0.01 + c * fw + 0.004
            z0 = lh + 0.01 + r * fh + 0.004
            b.box(x0, x0 + fw - 0.008, -d / 2, -d / 2 + 0.022, z0, z0 + fh - 0.008)
    b.obj(name, body, bevel=0.004, seg=2)
    tp = MB(M)
    tp.box(-w / 2 - 0.01, w / 2 + 0.01, -d / 2 - 0.01, d / 2, h - 0.03, h)
    tp.obj(name + '_top', top or body, bevel=0.006, seg=2)
    hd = MB(M)
    for r in range(rows):
        for c in range(cols):
            xc = -w / 2 + 0.01 + c * fw + fw / 2
            zc = lh + 0.01 + r * fh + fh * (0.5 if not doors else 0.75)
            if doors:
                xc += (fw / 2 - 0.06) * (1 if c % 2 == 0 else -1)
                hd.box(xc - 0.006, xc + 0.006, -d / 2 - 0.03, -d / 2, zc - 0.07, zc + 0.07)
            elif fw > 0.5:
                hd.box(xc - 0.07, xc + 0.07, -d / 2 - 0.028, -d / 2, zc - 0.006, zc + 0.006)
            else:
                hd.sphere(xc, -d / 2 - 0.018, zc, 0.016, seg=12, rings=6)
    if legs:
        for sx in (-1, 1):
            for sy in (-1, 1):
                hd.cyl(sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0, lh, 0.02, 0.014, n=10)
    hd.obj(name + '_hw', [handle], smooth=True)


def bookshelf(M, wood, w=0.9, d=0.32, h=2.0, shelves=5, rng=None, fill=0.9, name='shelf', deco=True, palette=None):
    rng = rng or random.Random(2)
    K = mats()
    t = 0.022
    c = MB(M)
    c.box(-w / 2, -w / 2 + t, -d / 2, d / 2, 0, h)
    c.box(w / 2 - t, w / 2, -d / 2, d / 2, 0, h)
    c.box(-w / 2, w / 2, -d / 2, d / 2, h - t, h)
    c.box(-w / 2 + t, w / 2 - t, -d / 2 + 0.01, d / 2, 0, 0.08)
    c.box(-w / 2 + t, w / 2 - t, d / 2 - 0.008, d / 2, 0.08, h - t)
    sp = (h - 0.08 - t) / shelves
    levels = []
    for i in range(shelves):
        z = 0.08 + i * sp
        if i > 0:
            c.box(-w / 2 + t, w / 2 - t, -d / 2 + 0.01, d / 2 - 0.008, z - t / 2, z + t / 2)
        levels.append((z + (t / 2 if i > 0 else 0), sp - t))
    c.obj(name, wood, bevel=0.003, seg=2)
    bk = MB(M)
    for (z, space) in levels:
        books_row(bk, -w / 2 + t + 0.005, w / 2 - t - 0.005, d / 2 - 0.01, z, min(space - 0.02, 0.34), d - 0.06, rng,
                  fill=fill, palette=palette)
    bk.obj(name + '_books', K['book'], bevel=0.0015, seg=1)
    return levels


def books_row(mb, x0, x1, yb, z, hmax, dmax, rng, fill=0.9, palette=None, M=None, allow_stack=True):
    pal = palette or BOOK_PALETTE
    x = x0
    while x < x1 - 0.03:
        r = rng.random()
        if r > fill:
            x += rng.uniform(0.06, 0.2)
            continue
        if allow_stack and r < 0.07 and x1 - x > 0.3:
            # horizontal stack
            zz = z
            bw = rng.uniform(0.18, 0.24)
            for k in range(rng.randint(2, 5)):
                th = rng.uniform(0.02, 0.045)
                dd = rng.uniform(0.13, min(0.22, dmax))
                ww = bw * rng.uniform(0.85, 1.0)
                mb.box(x, x + ww, yb - dd, yb, zz, zz + th, jitter(rng.choice(pal), rng), M=M)
                zz += th
            x += bw + 0.01
            continue
        # run of similar books (a series)
        run = rng.randint(1, 6)
        base = rng.choice(pal)
        hh0 = rng.uniform(0.62, 1.0) * hmax
        for k in range(run):
            if x > x1 - 0.02:
                break
            th = rng.uniform(0.016, 0.048)
            th = min(th, x1 - x)
            hh = max(0.12, min(hmax, hh0 * rng.uniform(0.97, 1.03)))
            dd = min(dmax, hh * rng.uniform(0.62, 0.8))
            mb.box(x, x + th, yb - dd, yb, z, z + hh, jitter(base, rng, 0.08), M=M)
            x += th + rng.uniform(0.0, 0.0025)
        if rng.random() < 0.12 and x1 - x > 0.08:
            # leaning book
            th = 0.025; hh = min(hmax, 0.24)
            mb.box(0, th, yb - hh * 0.72, yb, 0, hh, jitter(rng.choice(pal), rng),
                   M=(M or Matrix.Identity(4)) @ TR(x + 0.01, 0, z, ry=0.35))
            x += 0.1


def wardrobe(M, body, w=1.0, d=0.6, h=2.05, name='wardrobe'):
    K = mats()
    b = MB(M)
    b.box(-w / 2, w / 2, -d / 2 + 0.02, d / 2, 0.06, h)
    for s in (-1, 1):
        x0 = 0.003 if s > 0 else -w / 2 + 0.005
        b.box(x0, x0 + w / 2 - 0.008, -d / 2, -d / 2 + 0.022, 0.08, h - 0.03)
        # shaker panel inset
        b.box(x0 + 0.07, x0 + w / 2 - 0.078, -d / 2 - 0.004, -d / 2 + 0.002, 0.2, h - 0.15)
    b.obj(name, body, bevel=0.004, seg=2)
    hd = MB(M)
    for s in (-1, 1):
        hd.box(s * 0.04 - 0.006, s * 0.04 + 0.006, -d / 2 - 0.03, -d / 2, 1.0, 1.2)
    hd.obj(name + '_hw', K['brass'], bevel=0.002, seg=1)


# ----------------------------------------------------------------------------
# bed
# ----------------------------------------------------------------------------

def bed(M, duvet, sheet, pillows, frame, w=1.6, l=2.05, head='upholstered', head_mat=None, throw=None, rng=None,
        name='bed'):
    rng = rng or random.Random(3)
    f = MB(M)
    f.box(-w / 2 - 0.04, w / 2 + 0.04, -l / 2 - 0.03, l / 2, 0.1, 0.32)
    for sx in (-1, 1):
        for sy in (-1, 1):
            f.box(sx * (w / 2 - 0.02) - 0.03, sx * (w / 2 - 0.02) + 0.03, sy * (l / 2 - 0.05) - 0.03, sy * (l / 2 - 0.05) + 0.03, 0, 0.1)
    f.obj(name + '_frame', frame, bevel=0.01, seg=2)
    hb = MB(M)
    if head == 'upholstered':
        hb.box(-w / 2 - 0.06, w / 2 + 0.06, l / 2 - 0.02, l / 2 + 0.08, 0.1, 1.25)
        hb.obj(name + '_head', head_mat or frame, bevel=0.04, seg=4)
    elif head == 'metal':
        K = mats()
        for sx in (-1, 1):
            hb.cyl(sx * (w / 2 + 0.02), l / 2 + 0.03, 0, 1.15, 0.018, n=12)
        hb.cyl(0, 0, -w / 2 - 0.02, w / 2 + 0.02, 0.015, n=12, M=TR(0, l / 2 + 0.03, 1.1, ry=PI / 2))
        hb.cyl(0, 0, -w / 2 - 0.02, w / 2 + 0.02, 0.012, n=12, M=TR(0, l / 2 + 0.03, 0.6, ry=PI / 2))
        for i in range(9):
            x = -w / 2 + (i + 0.5) * w / 9
            hb.cyl(x, l / 2 + 0.03, 0.6, 1.1, 0.008, n=8)
        hb.obj(name + '_head', head_mat or K['black_metal'], smooth=True)
    else:
        hb.box(-w / 2 - 0.06, w / 2 + 0.06, l / 2 - 0.01, l / 2 + 0.04, 0.0, 1.05)
        hb.box(-w / 2 - 0.08, w / 2 + 0.08, l / 2 - 0.03, l / 2 + 0.05, 1.05, 1.09)
        hb.obj(name + '_head', head_mat or frame, bevel=0.008, seg=2)
    m = MB(M)
    m.box(-w / 2, w / 2, -l / 2, l / 2 - 0.02, 0.32, 0.56)
    m.obj(name + '_mattress', sheet, bevel=0.04, seg=4)
    dv = MB(M)
    dv.box(-w / 2 - 0.05, w / 2 + 0.05, -l / 2 - 0.05, l / 2 - 0.55, 0.36, 0.63)
    dv.box(-w / 2 - 0.045, w / 2 + 0.045, l / 2 - 0.72, l / 2 - 0.45, 0.5, 0.67)
    dv.obj(name + '_duvet', duvet, bevel=0.07, seg=4)
    pb = MB(M)
    npw = len(pillows)
    for k, pm in enumerate(pillows):
        row = 0 if k < 2 else 1
        side = -1 if k % 2 == 0 else 1
        pw = w / 2 - 0.06
        px = side * (w / 4)
        py = l / 2 - 0.2 - row * 0.12
        pp = MB(M)
        pp.box(-pw / 2, pw / 2, -0.07, 0.07, 0, 0.42 if row == 0 else 0.36,
               M=TR(px, py, 0.55, rz=rng.uniform(-0.05, 0.05), rx=-(0.9 if row == 0 else 0.55)))
        pp.obj(name + '_pillow%d' % k, pm, bevel=0.07, seg=2, subsurf=2)
    if throw is not None:
        t = MB(M)
        t.box(-w / 2 - 0.06, w / 2 + 0.06, -l / 2 + 0.1, -l / 2 + 0.55, 0.62, 0.66)
        t.box(-w / 2 - 0.08, -w / 2 - 0.04, -l / 2 + 0.1, -l / 2 + 0.55, 0.32, 0.66)
        t.box(w / 2 + 0.04, w / 2 + 0.08, -l / 2 + 0.1, -l / 2 + 0.55, 0.32, 0.66)
        t.obj(name + '_throw', throw, bevel=0.02, seg=3)


# ----------------------------------------------------------------------------
# lighting fixtures (return list of light objects)
# ----------------------------------------------------------------------------
WARM = L.kelvin(2900)
WARM2 = L.kelvin(3200)
NEUTRAL = L.kelvin(4000)
COOL = L.kelvin(5000)


def world_pt(M, x, y, z):
    return tuple(M @ Vector((x, y, z)))


def shade_mat(color='#efe6d2', name=None):
    c = L.hexc(color)
    return L.M_shade(name or ('shade_' + color.lstrip('#')), tuple(c), trans=0.55)


def bulb_mat(name='bulb', day=0.0, night=25.0, color=None, on=True):
    if not on:
        return L.M('bulb_off', '#e8e6e0', rough=0.15, rough_var=0.0)
    return L.M_emit(name, color or WARM, day=day, night=night, base=(0.9, 0.9, 0.85))


def floor_lamp(M, h=1.6, shade='#efe6d2', base=None, night=40.0, day=0.0, name='flamp'):
    K = mats()
    b = MB(M)
    b.cyl(0, 0, 0, 0.025, 0.16, 0.15, n=28)
    b.cyl(0, 0, 0.025, h - 0.2, 0.012, n=10)
    b.obj(name + '_base', base or K['brass'], bevel=0.004, seg=2)
    s = MB(M)
    s.lathe([(0.22, h - 0.32), (0.16, h - 0.02)], n=32)
    s.obj(name + '_shade', shade_mat(shade), smooth=True)
    bl = MB(M)
    bl.sphere(0, 0, h - 0.17, 0.035)
    bl.obj(name + '_bulb', bulb_mat(on=night > 0), smooth=True)
    return [L.light('POINT', world_pt(M, 0, 0, h - 0.17), night, WARM, 0.04, day=day, night=night, name=name + '_L')]


def table_lamp(M, h=0.62, shade='#efe6d2', base=None, night=25.0, day=0.0, name='tlamp', r=0.17):
    K = mats()
    b = MB(M)
    b.lathe([(0.0, 0.0), (0.07, 0.0), (0.08, 0.02), (0.11, h * 0.22), (0.1, h * 0.4), (0.04, h * 0.55), (0.02, h * 0.6), (0.012, h * 0.72), (0.0, h * 0.72)], n=24)
    b.obj(name + '_base', base or K['ceramic'], smooth=True)
    s = MB(M)
    s.lathe([(r, h * 0.6), (r * 0.78, h)], n=32)
    s.obj(name + '_shade', shade_mat(shade), smooth=True)
    bl = MB(M)
    bl.sphere(0, 0, h * 0.78, 0.025)
    bl.obj(name + '_bulb', bulb_mat(on=night > 0), smooth=True)
    return [L.light('POINT', world_pt(M, 0, 0, h * 0.8), night, WARM, 0.03, day=day, night=night, name=name + '_L')]


def pendant(M, ceil=3.0, drop=0.7, kind='dome', mat=None, night=60.0, day=0.0, name='pend', color='#1a1a1a', r=0.22):
    K = mats()
    zc = ceil - drop
    c = MB(M)
    c.cyl(0, 0, zc, ceil, 0.004, n=6)
    c.cyl(0, 0, ceil - 0.02, ceil, 0.06, n=16)
    c.obj(name + '_cord', K['cord'], smooth=True)
    s = MB(M)
    fixture = mat or paint(color, rough=0.3)
    if kind == 'dome':
        prof = [(r * math.sin(t), zc - 0.0 + r * 0.9 * math.cos(t) - r * 0.9) for t in np.linspace(0.08, PI / 2, 10)]
        prof = [(0.03, zc + 0.02)] + [(p[0], p[1] + r * 0.9) for p in prof]
        prof = [(pr, pz - r * 0.9) for pr, pz in prof]
        s.lathe(prof, n=32)
        s.obj(name + '_shade', fixture, smooth=True)
        bz = zc - r * 0.55
    elif kind == 'globe':
        s.sphere(0, 0, zc - r, r, seg=32, rings=16)
        gm = (L.M_emit('globe_glass', WARM, day=day * 0.02, night=8.0, base=(0.9, 0.9, 0.88), rough=0.3) if night > 0
              else L.M('globe_off', '#e9e7e2', rough=0.3, subsurface=0.2))
        s.obj(name + '_globe', gm, smooth=True)
        bz = zc - r
    elif kind == 'drum':
        s.lathe([(r, zc - 0.3), (r, zc)], n=40)
        s.obj(name + '_shade', shade_mat('#eee6d6'), smooth=True)
        bz = zc - 0.18
    elif kind == 'cone':
        s.lathe([(r, zc - 0.28), (0.04, zc)], n=32)
        s.obj(name + '_shade', fixture, smooth=True)
        bz = zc - 0.18
    else:  # bare bulb
        bz = zc - 0.06
    bl = MB(M)
    bl.sphere(0, 0, bz, 0.03 if kind != 'bulb' else 0.04, sz=1.3)
    bl.obj(name + '_bulb', bulb_mat('bulb_hot', night=40.0 if kind == 'bulb' else 25.0, on=night > 0), smooth=True)
    return [L.light('POINT', world_pt(M, 0, 0, bz - 0.02), night, WARM, 0.035, day=day, night=night, name=name + '_L')]


def chandelier(M, ceil=3.0, drop=0.9, arms=6, r=0.36, night=70.0, day=0.0, name='chand'):
    K = mats()
    zc = ceil - drop
    b = MB(M)
    b.cyl(0, 0, zc + 0.15, ceil, 0.008, n=8)
    b.lathe([(0.0, zc - 0.12), (0.05, zc - 0.1), (0.07, zc - 0.02), (0.04, zc + 0.05), (0.02, zc + 0.15), (0.0, zc + 0.16)], n=20)
    cand = MB(M)
    for i in range(arms):
        a = 2 * PI * i / arms
        x, y = r * math.cos(a), r * math.sin(a)
        b.cyl(0, 0, 0, r, 0.009, n=8, M=TR(0, 0, zc - 0.02, rz=a - PI / 2, rx=-PI / 2 + 0.25) if False else TR(0, 0, zc - 0.03) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(PI / 2, 4, 'Y'))
        b.lathe([(0.035, zc + 0.0), (0.04, zc + 0.02), (0.02, zc + 0.03)], n=12, cx=x, cy=y)
        b.cyl(x, y, zc - 0.03, zc + 0.0, 0.01, n=8)
        cand.cyl(x, y, zc + 0.02, zc + 0.1, 0.012, n=10)
    b.obj(name, K['brass'], smooth=True)
    cand.obj(name + '_candles', K['candle'], smooth=True)
    fl = MB(M)
    for i in range(arms):
        a = 2 * PI * i / arms
        fl.sphere(r * math.cos(a), r * math.sin(a), zc + 0.125, 0.012, sz=1.8, seg=8, rings=6)
    fl.obj(name + '_flames', bulb_mat('flame', night=60.0, color=L.kelvin(2200)), smooth=True)
    return [L.light('POINT', world_pt(M, 0, 0, zc + 0.12), night, L.kelvin(2500), 0.08, day=day, night=night, name=name + '_L')]


def flush_light(M, ceil=3.0, r=0.2, night=45.0, day=0.0, name='flush', color=None):
    s = MB(M)
    s.lathe([(r, ceil), (r * 0.9, ceil - 0.06), (r * 0.5, ceil - 0.11), (0.0, ceil - 0.12)], n=32)
    fm = (L.M_emit('flush_glass', color or WARM2, day=0.0, night=6.0, base=(0.92, 0.92, 0.9), rough=0.35) if night > 0
          else L.M('flush_off', '#eceae4', rough=0.35, subsurface=0.2))
    s.obj(name, fm, smooth=True)
    return [L.light('POINT', world_pt(M, 0, 0, ceil - 0.2), night, color or WARM2, r, day=day, night=night, name=name + '_L')]


def recessed(M, ceil=3.0, night=18.0, day=0.0, name='can', color=None, spot=1.9):
    s = MB(M)
    s.cyl(0, 0, ceil - 0.005, ceil, 0.07, n=20)
    s.obj(name + '_trim', mats()['plastic_white'], smooth=True)
    e = MB(M)
    e.cyl(0, 0, ceil - 0.006, ceil - 0.004, 0.045, n=20)
    e.obj(name + '_lens', L.M_emit('can_lens', color or WARM2, day=0.0, night=30.0), smooth=True)
    return [L.light('SPOT', world_pt(M, 0, 0, ceil - 0.03), night, color or WARM2, 0.04, day=day, night=night,
                    name=name + '_L', spot=(spot, 0.6))]


def ceiling_panel(M, ceil=2.8, w=0.6, d=0.6, night=60.0, day=40.0, name='panel', color=None, emit_n=6.0, emit_d=4.5):
    col = color or L.kelvin(4200)
    s = MB(M)
    s.box(-w / 2, w / 2, -d / 2, d / 2, ceil - 0.012, ceil)
    s.obj(name + '_frame', mats()['plastic_white'])
    e = MB(M)
    e.quad((-w / 2 + 0.02, -d / 2 + 0.02, ceil - 0.013), (-w / 2 + 0.02, d / 2 - 0.02, ceil - 0.013),
           (w / 2 - 0.02, d / 2 - 0.02, ceil - 0.013), (w / 2 - 0.02, -d / 2 + 0.02, ceil - 0.013))
    key = 'panel_%d_%d' % (int(emit_d * 10), int(emit_n * 10))
    e.obj(name + '_diff', L.M_emit(key, col, day=emit_d, night=emit_n, base=(0.95, 0.95, 0.95)))
    return [L.light('AREA', world_pt(M, 0, 0, ceil - 0.02), night, col, size=(w - 0.04, d - 0.04), day=day,
                    night=night, name=name + '_L')]


# ----------------------------------------------------------------------------
# electronics
# ----------------------------------------------------------------------------

def tv(M, w=1.32, img=None, night_on=True, night=18.0, z=0.0, wall=True, name='tv', tv_color=None):
    """TV whose screen faces local -Y; bottom edge at height z."""
    K = mats()
    h = w * 0.5625
    b = MB(M)
    b.box(-w / 2, w / 2, -0.012, 0.03, z, z + h)
    if not wall:
        b.box(-0.18, 0.18, -0.1, 0.1, z - 0.08, z - 0.07)
        b.box(-0.03, 0.03, 0.0, 0.03, z - 0.07, z + 0.1)
    b.obj(name + '_body', K['plastic_black'], bevel=0.004, seg=2)
    img = img or tv_image('tvimg')
    col = tv_color or (0.55, 0.75, 1.0)
    scr = MB(M)
    scr.quad((-w / 2 + 0.008, -0.0125, z + 0.008), (w / 2 - 0.008, -0.0125, z + 0.008),
             (w / 2 - 0.008, -0.0125, z + h - 0.008), (-w / 2 + 0.008, -0.0125, z + h - 0.008), uv01=True)
    mat = L.M_emit('screen_' + name, col, day=0.0, night=(2.2 if night_on else 0.0), base=(0.004, 0.004, 0.005),
                   rough=0.06, image=img)
    scr.obj(name + '_screen', mat)
    out = []
    if night_on:
        out.append(L.light('AREA', world_pt(M, 0, -0.03, z + h / 2), night, col, size=(w, h), day=0.0, night=night,
                           rot=(M.to_euler()[0] + PI / 2, 0, M.to_euler()[2] + PI), name=name + '_L'))
    return out


def monitor(M, img, w=0.6, on_day=True, on_night=False, name='mon', z=0.0):
    K = mats()
    h = w * 0.58
    b = MB(M)
    b.box(-w / 2, w / 2, -0.01, 0.02, z + 0.1, z + 0.1 + h)
    b.box(-0.1, 0.1, -0.08, 0.1, z, z + 0.012)
    b.box(-0.025, 0.025, 0.02, 0.05, z, z + 0.1 + h * 0.6)
    b.obj(name + '_body', K['plastic_black'], bevel=0.003, seg=1)
    s = MB(M)
    s.quad((-w / 2 + 0.006, -0.0105, z + 0.106), (w / 2 - 0.006, -0.0105, z + 0.106),
           (w / 2 - 0.006, -0.0105, z + 0.1 + h - 0.006), (-w / 2 + 0.006, -0.0105, z + 0.1 + h - 0.006), uv01=True)
    key = 'mon_%s_%d%d' % (img.name, on_day, on_night)
    s.obj(name + '_scr', L.M_emit(key, (1, 1, 1), day=1.2 if on_day else 0.0, night=1.4 if on_night else 0.0,
                                  base=(0.01, 0.01, 0.012), rough=0.1, image=img))


def keyboard(mb, x, y, z, rz=0.0):
    mb.box(-0.22, 0.22, -0.07, 0.07, 0, 0.018, color=(0.05, 0.05, 0.05), M=TR(x, y, z, rz=rz))
    mb.box(-0.03, 0.03, -0.05, 0.05, 0, 0.02, color=(0.05, 0.05, 0.05), M=TR(x + 0.32, y, z, rz=rz))


# ----------------------------------------------------------------------------
# decor
# ----------------------------------------------------------------------------

def art(M, img, w, h, frame='#1a1a1a', border=0.05, mat_border=0.0, depth=0.03, name='art', frame_mat=None,
        gloss=0.0):
    """Framed picture hanging on a wall.  M: centre of the picture on the wall surface,
    local -Y = out of the wall."""
    fm = frame_mat or paint(frame, rough=0.4)
    f = MB(M)
    W2, H2 = w / 2, h / 2
    f.box(-W2, W2, -depth, 0, H2 - border, H2)
    f.box(-W2, W2, -depth, 0, -H2, -H2 + border)
    f.box(-W2, -W2 + border, -depth, 0, -H2 + border, H2 - border)
    f.box(W2 - border, W2, -depth, 0, -H2 + border, H2 - border)
    f.obj(name + '_frame', fm, bevel=0.004, seg=2)
    iw, ih = W2 - border, H2 - border
    if mat_border > 0:
        mm = MB(M)
        mm.box(-iw, iw, -depth * 0.5, -0.002, -ih, ih)
        mm.obj(name + '_mat', L.M('passepartout', '#f1eee6', rough=0.8))
        iw -= mat_border; ih -= mat_border
    p = MB(M)
    yy = -depth * 0.5 - 0.001 if mat_border > 0 else -depth * 0.4
    p.quad((-iw, yy, -ih), (iw, yy, -ih), (iw, yy, ih), (-iw, yy, ih), uv01=True)
    p.obj(name + '_pic', L.M_image('pic_' + img.name, img, rough=0.35 if gloss else 0.7, coat=gloss))


def mirror(M, w, h, frame_mat=None, name='mirror'):
    K = mats()
    fm = frame_mat or K['brass']
    f = MB(M)
    b = 0.06
    f.box(-w / 2, w / 2, -0.04, 0, h / 2 - b, h / 2)
    f.box(-w / 2, w / 2, -0.04, 0, -h / 2, -h / 2 + b)
    f.box(-w / 2, -w / 2 + b, -0.04, 0, -h / 2 + b, h / 2 - b)
    f.box(w / 2 - b, w / 2, -0.04, 0, -h / 2 + b, h / 2 - b)
    f.obj(name + '_frame', fm, bevel=0.01, seg=3)
    g = MB(M)
    g.quad((-w / 2 + b, -0.02, -h / 2 + b), (w / 2 - b, -0.02, -h / 2 + b), (w / 2 - b, -0.02, h / 2 - b), (-w / 2 + b, -0.02, h / 2 - b))
    g.obj(name + '_glass', K['mirror'])


def rug(M, img, w, d, name='rug', pile=0.012):
    r = MB(M)
    r.quad((-w / 2, -d / 2, pile), (w / 2, -d / 2, pile), (w / 2, d / 2, pile), (-w / 2, d / 2, pile), uv01=True)
    r.box(-w / 2, w / 2, -d / 2, d / 2, 0.0, pile - 0.001, color=(0.5, 0.5, 0.5), m=0)
    mat = rug_mat('rug_' + img.name, img)
    r.obj(name, mat)


def rug_mat(name, img):
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Cubic'
    nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
    # carpet fibre detail
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 400; nz.inputs['Detail'].default_value = 2
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    f = L.math_node(nt, 'MULTIPLY_ADD', nz.outputs['Fac'], 0.35)
    f.node.inputs[2].default_value = 0.82
    col = L.vmul(nt, t.outputs['Color'], (1, 1, 1))
    col2 = L.mix_rgb(nt, 1.0, col, f, blend='MULTIPLY')
    nt.links.new(col2, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.95
    p.inputs['Sheen Weight'].default_value = 0.6
    p.inputs['Specular IOR Level'].default_value = 0.2
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.4; b.inputs['Distance'].default_value = 0.002
    nt.links.new(nz.outputs['Fac'], b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    L._MATS[name] = m
    return m


def vase(mb, x, y, z, h=0.25, r=0.07, M=None, color=(0.8, 0.8, 0.8), kind=0):
    if kind == 0:
        prof = [(0.0, 0.0), (r * 0.7, 0.0), (r, h * 0.3), (r * 0.9, h * 0.6), (r * 0.45, h * 0.85), (r * 0.5, h), (r * 0.42, h)]
    elif kind == 1:
        prof = [(0.0, 0.0), (r, 0.0), (r, h), (r * 0.9, h)]
    else:
        prof = [(0.0, 0.0), (r * 0.5, 0.0), (r, h * 0.5), (r * 0.3, h * 0.95), (r * 0.35, h), (r * 0.28, h)]
    return mb.lathe(prof, n=24, color=color, M=(M or Matrix.Identity(4)) @ TR(x, y, z))


def stems(mb, x, y, z, h, rng, n=5, M=None):
    for i in range(n):
        a = rng.uniform(0, 2 * PI)
        lean = rng.uniform(0.05, 0.35)
        mb.cyl(0, 0, 0, h * rng.uniform(0.7, 1.0), 0.003, n=5, M=(M or Matrix.Identity(4)) @ TR(x, y, z, rz=a, rx=lean))


def candle(mb, x, y, z, h=0.2, r=0.025, M=None):
    mb.cyl(x, y, z, z + h, r, n=14, M=M)


def book_stack(mb, x, y, z, rng, n=3, M=None, rz=0.0):
    zz = z
    for k in range(n):
        w = rng.uniform(0.17, 0.26); d = rng.uniform(0.12, 0.2); t = rng.uniform(0.02, 0.04)
        mb.box(-w / 2, w / 2, -d / 2, d / 2, 0, t, jitter(rng.choice(BOOK_PALETTE), rng),
               M=(M or Matrix.Identity(4)) @ TR(x, y, zz, rz=rz + rng.uniform(-0.15, 0.15)))
        zz += t
    return zz


# ----------------------------------------------------------------------------
# plants
# ----------------------------------------------------------------------------

def leaf(mb, M, length, width, droop=0.3, fold=0.25, color=(1, 1, 1), shape='oval', nu=4, nv=6):
    def P(u, v):
        s = u * 2 - 1
        t = v
        if shape == 'oval':
            prof = math.sin(PI * min(1.0, t ** 0.8)) ** 0.7
        elif shape == 'blade':
            prof = (1 - t ** 3) * min(1.0, t * 8)
        elif shape == 'heart':
            prof = math.sin(PI * min(1.0, t ** 0.6)) ** 0.5
        else:
            prof = math.sin(PI * t) ** 0.9
        x = s * width / 2 * prof
        y = t * length
        z = -droop * (t ** 2) * length + fold * abs(s) * width / 2 * prof
        return (x, y, z)
    return mb.grid(P, nu, nv, color=color, M=M)


def pot(M, r=0.16, h=0.3, mat=None, name='pot'):
    K = mats()
    p = MB(M)
    p.lathe([(0.0, 0.0), (r * 0.78, 0.0), (r, h), (r * 0.93, h), (r * 0.9, h * 0.92)], n=28)
    p.obj(name, mat or K['ceramic'], smooth=True)
    s = MB(M)
    s.cyl(0, 0, h * 0.88, h * 0.9, r * 0.9, n=20)
    s.obj(name + '_soil', K['soil'])
    return h * 0.9


def plant(M, kind='fig', h=1.4, rng=None, pot_mat=None, pot_r=None, name='plant'):
    rng = rng or random.Random(4)
    K = mats()
    pr = pot_r or {'fig': 0.18, 'snake': 0.15, 'bush': 0.14, 'palm': 0.2, 'monstera': 0.2, 'small': 0.07, 'trail': 0.09}[kind]
    ph = {'small': 0.1, 'trail': 0.13}.get(kind, pr * 1.8)
    z0 = pot(M, pr, ph, pot_mat, name + '_pot')
    lv = MB(M)
    st = MB(M)

    def gcol():
        g = rng.uniform(0.75, 1.3)
        return (g * rng.uniform(0.85, 1.15), g, g * rng.uniform(0.8, 1.2))

    if kind == 'fig':
        trunk_h = h - z0
        st.cyl(0, 0, z0, z0 + trunk_h * 0.9, 0.02, 0.01, n=8)
        # a few side branches carrying most leaves -> fuller silhouette
        br = []
        for b in range(4):
            a = rng.uniform(0, 2 * PI)
            zb = z0 + trunk_h * rng.uniform(0.45, 0.75)
            ln = rng.uniform(0.2, 0.35)
            Mb = TR(0, 0, zb, rz=a, rx=0.9)
            st.cyl(0, 0, 0, ln, 0.01, 0.006, n=6, M=Mb @ Matrix.Rotation(-PI / 2, 4, 'X'))
            br.append((Mb, ln))
        for i in range(70):
            if i % 3 == 0:
                t = rng.uniform(0.4, 1.0)
                base = TR(0, 0, z0 + trunk_h * t)
                sc = 1.1 - 0.3 * t
            else:
                Mb, ln = br[i % len(br)]
                base = Mb @ TR(0, ln * rng.uniform(0.3, 1.0), 0, rx=-0.9)
                sc = 0.95
            a = rng.uniform(0, 2 * PI)
            L_ = rng.uniform(0.2, 0.32) * sc
            leaf(lv, base @ TR(0, 0, 0, rz=a, rx=rng.uniform(0.0, 0.8)), L_, L_ * 0.65,
                 droop=0.3, fold=0.18, color=gcol(), shape='heart')
    elif kind == 'snake':
        for i in range(14):
            a = rng.uniform(0, 2 * PI)
            r = rng.uniform(0.0, pr * 0.6)
            L_ = rng.uniform(0.45, 0.85) * (h / 0.9)
            leaf(lv, TR(r * math.cos(a), r * math.sin(a), z0 - 0.02, rz=a + rng.uniform(-0.3, 0.3), rx=PI / 2 - rng.uniform(0.05, 0.25)),
                 L_, 0.055, droop=-0.05, fold=0.35, color=(gcol()[0] * 0.8, gcol()[1] * 0.9, gcol()[2] * 0.7), shape='blade', nu=2, nv=6)
    elif kind in ('bush', 'small'):
        R = (h - z0) * 0.6
        n = 90 if kind == 'bush' else 30
        for i in range(n):
            a = rng.uniform(0, 2 * PI)
            e = rng.uniform(-0.2, 1.3)
            L_ = rng.uniform(0.07, 0.12) * (1 if kind == 'bush' else 0.6)
            leaf(lv, TR(0, 0, z0 + 0.01, rz=a - PI / 2) @ TR(0, rng.uniform(0.0, R * 0.7), rng.uniform(0, R * 0.9), rx=e * 0.6),
                 L_, L_ * 0.6, droop=0.3, fold=0.2, color=gcol(), shape='heart', nu=2, nv=4)
    elif kind == 'trail':
        for i in range(60):
            a = rng.uniform(0, 2 * PI)
            dz = rng.uniform(-0.45, 0.08)
            r = pr * rng.uniform(0.7, 1.3)
            L_ = rng.uniform(0.05, 0.08)
            leaf(lv, TR(r * math.cos(a), r * math.sin(a), z0 + dz, rz=a - PI / 2, rx=rng.uniform(-0.8, 0.4)), L_, L_ * 0.7,
                 droop=0.2, fold=0.2, color=gcol(), shape='heart', nu=2, nv=3)
    elif kind == 'palm':
        for i in range(9):
            a = 2 * PI * i / 9 + rng.uniform(-0.2, 0.2)
            pitch = rng.uniform(0.7, 1.2)
            Lf = rng.uniform(0.6, 0.9) * h / 1.5
            Mf = TR(0, 0, z0, rz=a, rx=pitch)
            st.cyl(0, 0, 0, Lf, 0.006, 0.003, n=5, M=Mf @ Matrix.Rotation(-PI / 2, 4, 'X'))
            for k in range(14):
                t = (k + 1) / 15.0
                for s in (-1, 1):
                    y = t * Lf
                    droop = 0.35 * t * t * Lf
                    Ml = Mf @ TR(0, y, -droop, rz=s * 1.1, rx=-0.4)
                    leaf(lv, Ml, 0.22 * (1 - 0.4 * t), 0.025, droop=0.4, fold=0.2, color=gcol(), shape='blade', nu=2, nv=4)
    elif kind == 'monstera':
        n = 14
        for i in range(n):
            a = 2 * PI * i / n + rng.uniform(-0.3, 0.3)
            pitch0 = rng.uniform(0.95, 1.4)
            pitch1 = rng.uniform(0.0, 0.45)
            Ls = rng.uniform(0.45, 0.8) * h
            pos = Vector((0.0, 0.0, z0))
            segs = 6
            for k in range(segs):
                pp = pitch0 + (pitch1 - pitch0) * (k / (segs - 1)) ** 1.3
                dv = Vector((-math.sin(a) * math.cos(pp), math.cos(a) * math.cos(pp), math.sin(pp)))
                seg_len = Ls / segs
                st.cyl(0, 0, 0, seg_len, 0.008, 0.007, n=6, M=Matrix.Translation(pos) @ dv.to_track_quat('Z', 'Y').to_matrix().to_4x4())
                pos = pos + dv * seg_len
            size = rng.uniform(0.28, 0.46)
            leaf(lv, TR(pos.x, pos.y, pos.z, rz=a, rx=pitch1 - rng.uniform(0.3, 0.7)), size, size * 0.92, droop=0.3, fold=0.12,
                 color=gcol(), shape='heart', nu=6, nv=6)
    st.obj(name + '_stems', K['stem'], smooth=True)
    lv.obj(name + '_leaves', K['leaf'], smooth=True)


# ----------------------------------------------------------------------------
# architecture
# ----------------------------------------------------------------------------

def door(M, w=0.86, h=2.1, mat=None, casing=None, open_frac=0.0, panels=4, name='door', knob=None):
    """Door in a wall; M at the wall surface, bottom centre, local -Y into the room."""
    K = mats()
    mat = mat or K['white_paint']
    casing = casing or mat
    c = MB(M)
    cw = 0.09
    c.box(-w / 2 - cw, -w / 2, -0.025, 0.0, 0, h + cw)
    c.box(w / 2, w / 2 + cw, -0.025, 0.0, 0, h + cw)
    c.box(-w / 2 - cw - 0.015, w / 2 + cw + 0.015, -0.035, 0.0, h + cw, h + cw + 0.035)
    c.obj(name + '_casing', casing, bevel=0.004, seg=2)
    d = MB(M)
    Md = TR(-w / 2, -0.01, 0, rz=-open_frac * 1.4)
    d.box(0, w, -0.04, 0.0, 0, h, M=Md)
    if panels == 4:
        for (x0, x1, z0, z1) in ((0.1, w / 2 - 0.05, 0.12, 0.95), (w / 2 + 0.05, w - 0.1, 0.12, 0.95),
                                 (0.1, w / 2 - 0.05, 1.1, h - 0.12), (w / 2 + 0.05, w - 0.1, 1.1, h - 0.12)):
            d.box(x0, x1, -0.048, -0.038, z0, z1, M=Md)
    elif panels == 2:
        d.box(0.12, w - 0.12, -0.048, -0.038, 0.15, 0.95, M=Md)
        d.box(0.12, w - 0.12, -0.048, -0.038, 1.1, h - 0.15, M=Md)
    d.obj(name + '_leaf', mat, bevel=0.005, seg=2)
    k = MB(M)
    k.sphere(w - 0.07, -0.08, 1.0, 0.028, M=Md, seg=12, rings=8)
    k.obj(name + '_knob', knob or K['brass'], smooth=True)


def radiator(M, w=0.9, h=0.62, mat=None, name='radiator'):
    mat = mat or L.M('rad_paint', '#d8d4ca', rough=0.35)
    r = MB(M)
    n = int(w / 0.065)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        r.box(x - 0.022, x + 0.022, -0.1, -0.03, 0.12, h, color=(1, 1, 1))
    r.box(-w / 2, w / 2, -0.09, -0.04, 0.14, 0.2)
    r.box(-w / 2, w / 2, -0.09, -0.04, h - 0.08, h - 0.02)
    for sx in (-1, 1):
        r.box(sx * w / 2 - 0.03, sx * w / 2 + 0.03, -0.11, -0.02, 0.0, 0.12)
    r.obj(name, mat, bevel=0.012, seg=3)


def outlet(mb, M):
    mb.box(-0.035, 0.035, -0.006, 0.0, -0.058, 0.058, color=(0.92, 0.92, 0.9), M=M)


def curtain(M, w, h, folds=7, depth=0.06, mat=None, name='curtain', gather=0.0):
    """Hanging curtain: M at the top-centre of the panel (rod height)."""
    K = mats()

    def P(u, v):
        x = (u - 0.5) * w * (1 - gather * (1 - v) * 0.0)
        a = u * folds * 2 * PI
        y = math.sin(a) * depth * (0.8 + 0.4 * (1 - v))
        z = -h * (1 - v)
        return (x, y, z)
    c = MB(M)
    c.grid(P, folds * 8, 12, uv01=False)
    c.obj(name, mat, smooth=True)
    rod = MB(M)
    rod.cyl(0, 0, -w / 2 - 0.1, w / 2 + 0.1, 0.012, n=10, M=TR(0, -0.0, 0.03, ry=PI / 2))
    rod.obj(name + '_rod', K['brass'], smooth=True)


def curtain_mat(color='#f4efe4', sheer=False, name=None):
    name = name or ('curt_' + color.lstrip('#') + ('_s' if sheer else ''))
    if name in L._MATS:
        return L._MATS[name]
    if not sheer:
        return L.M_shade(name, L.hexc(color), trans=0.3)
    c = tuple(L.hexc(color))
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = nt.nodes.get('Material Output')
    tp = nt.nodes.new('ShaderNodeBsdfTransparent')
    tl = nt.nodes.new('ShaderNodeBsdfTranslucent'); tl.inputs['Color'].default_value = c + (1,)
    df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = c + (1,)
    m1 = nt.nodes.new('ShaderNodeMixShader'); m1.inputs[0].default_value = 0.5
    nt.links.new(df.outputs[0], m1.inputs[1]); nt.links.new(tl.outputs[0], m1.inputs[2])
    m2 = nt.nodes.new('ShaderNodeMixShader'); m2.inputs[0].default_value = 0.42
    nt.links.new(tp.outputs[0], m2.inputs[1]); nt.links.new(m1.outputs[0], m2.inputs[2])
    nt.links.new(m2.outputs[0], out.inputs['Surface'])
    L._MATS[name] = m
    return m


# ----------------------------------------------------------------------------
# procedural images
# ----------------------------------------------------------------------------

def _img(name, arr):
    return L.np_to_image(name, arr)


def art_image(name, kind, rng, w=256, h=256):
    npr = np.random.default_rng(rng.randint(0, 10 ** 6))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    yy /= h; xx /= w
    tex = L.vnoise(h, w, 6, npr, 5)[..., None]
    if kind == 'blocks':
        base = np.array(L.hexc(rng.choice(['#b8452f', '#2d4a6b', '#d9a441', '#6b2d3f', '#3f6b52']), lin=False))
        img = np.ones((h, w, 3)) * base
        for k in range(rng.randint(2, 3)):
            c = np.array(L.hexc(rng.choice(['#e8c872', '#8a2c1f', '#1f2d3a', '#d97b4a', '#f0e6d0', '#4a6b8a']), lin=False))
            y0 = 0.08 + k * 0.3 + rng.uniform(-0.03, 0.03); y1 = y0 + rng.uniform(0.18, 0.26)
            m = np.clip(np.minimum(np.minimum((yy - y0) / 0.02, (y1 - yy) / 0.02), np.minimum((xx - 0.1) / 0.02, (0.9 - xx) / 0.02)), 0, 1)
            m = m * (0.8 + 0.2 * tex[..., 0])
            img = img * (1 - m[..., None]) + c * m[..., None]
        img *= (0.9 + 0.2 * tex)
    elif kind == 'landscape':
        sky = np.array(L.hexc(rng.choice(['#9fbfd9', '#e8b88a', '#c9d6df', '#f0d0a0']), lin=False))
        img = sky * (1 - 0.35 * yy[..., None]) + 0.1
        cols = ['#56704a', '#3d5a45', '#2a3d33', '#7a8a5a', '#8a6a4a', '#4a5a6a']
        for k in range(4):
            c = np.array(L.hexc(rng.choice(cols), lin=False)) * (0.7 + 0.1 * k)
            base_y = 0.45 + k * 0.13
            ridge = base_y + 0.08 * np.sin(xx[0] * rng.uniform(4, 9) + rng.uniform(0, 6)) + 0.05 * L.vnoise(1, w, 4, npr, 3)[0]
            m = (yy > ridge[None, :]).astype(np.float32)
            img = img * (1 - m[..., None]) + c * m[..., None]
        img *= (0.88 + 0.24 * tex)
    elif kind == 'geo':
        img = np.ones((h, w, 3)) * np.array(L.hexc('#efe6d2', lin=False))
        for k in range(rng.randint(3, 6)):
            c = np.array(L.hexc(rng.choice(['#c8372d', '#1f4e8c', '#f2b31f', '#1a1a1a', '#2f7a5a']), lin=False))
            cx, cy, r = rng.uniform(0.2, 0.8), rng.uniform(0.2, 0.8), rng.uniform(0.08, 0.25)
            if rng.random() < 0.5:
                m = ((xx - cx) ** 2 + (yy - cy) ** 2 < r * r)
            else:
                m = (abs(xx - cx) < r) & (abs(yy - cy) < r * rng.uniform(0.2, 1.0))
            img[m] = c
        img *= (0.92 + 0.12 * tex)
    elif kind == 'botanical':
        img = np.ones((h, w, 3)) * np.array(L.hexc('#ece3cc', lin=False))
        cx = 0.5
        stem = np.abs(xx - cx - 0.03 * np.sin(yy * 6)) < 0.006
        img[stem & (yy > 0.15) & (yy < 0.9)] = L.hexc('#3a5a2a', lin=False)
        for k in range(9):
            ly = 0.2 + k * 0.075
            s = -1 if k % 2 else 1
            lx = cx + s * 0.13
            m = ((xx - lx) / 0.13) ** 2 + ((yy - ly) / 0.04) ** 2 < 1
            img[m] = np.array(L.hexc('#4f7a3a', lin=False)) * (0.8 + 0.3 * tex[m])
        img *= (0.93 + 0.1 * tex)
    elif kind == 'bridge':
        img = np.array(L.hexc('#e9d9c4', lin=False)) * (1 - 0.4 * yy[..., None]) + np.array(L.hexc('#c77a55', lin=False)) * 0.25 * yy[..., None]
        red = np.array(L.hexc('#b8402c', lin=False))
        for tx in (0.28, 0.72):
            m = (abs(xx - tx) < 0.025) & (yy > 0.18) & (yy < 0.8)
            img[m] = red
        cab = np.abs(yy - (0.25 + 1.8 * (xx - 0.5) ** 2)) < 0.006
        img[cab & (xx > 0.02) & (xx < 0.98)] = red
        img[(abs(yy - 0.68) < 0.012)] = red
        water = yy > 0.72
        img[water] = np.array(L.hexc('#2d4a5a', lin=False)) * (0.8 + 0.3 * tex[water])
        fog = np.clip(1 - np.abs(yy - 0.62) / 0.12, 0, 1) * (0.5 + 0.5 * tex[..., 0])
        img = img * (1 - 0.6 * fog[..., None]) + 0.9 * 0.6 * fog[..., None]
    elif kind == 'photo':
        g = 0.25 + 0.5 * L.vnoise(h, w, 3, npr, 5)
        g = g * (1 - 0.3 * yy) + 0.2 * (yy < 0.5)
        img = np.repeat(g[..., None], 3, axis=2)
    elif kind == 'poster':
        c1 = np.array(L.hexc(rng.choice(['#d94a2b', '#1c6b8a', '#f2c230', '#2a2a2a']), lin=False))
        c2 = np.array(L.hexc(rng.choice(['#f0e8d8', '#1a1a1a', '#f2f2f2']), lin=False))
        img = np.ones((h, w, 3)) * c1
        m = (yy > 0.7) & (yy < 0.78) & (xx > 0.1) & (xx < 0.9)
        img[m] = c2
        m = ((xx - 0.5) ** 2 + (yy - 0.38) ** 2) < 0.06
        img[m] = c2 * 0.85 + c1 * 0.15
        img[(yy > 0.83) & (yy < 0.86) & (xx > 0.1) & (xx < 0.7)] = c2
        img *= (0.93 + 0.1 * tex)
    else:  # abstract strokes
        img = np.ones((h, w, 3)) * np.array(L.hexc('#e8e0d0', lin=False))
        for k in range(8):
            c = np.array(L.hexc(rng.choice(['#1a1a1a', '#c8372d', '#2d4a6b', '#d9a441', '#7a8a8a']), lin=False))
            a = rng.uniform(0, PI); cx, cy = rng.uniform(0.1, 0.9), rng.uniform(0.1, 0.9)
            d = np.abs((xx - cx) * math.sin(a) - (yy - cy) * math.cos(a))
            along = np.abs((xx - cx) * math.cos(a) + (yy - cy) * math.sin(a))
            m = (d < rng.uniform(0.01, 0.05) * (0.6 + 0.8 * tex[..., 0])) & (along < rng.uniform(0.15, 0.4))
            img[m] = c
    return _img(name, np.clip(img, 0, 1))


def rug_image(name, kind, rng, w=512, h=320):
    npr = np.random.default_rng(rng.randint(0, 10 ** 6))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w; v = yy / h
    n = L.vnoise(h, w, 20, npr, 3)
    if kind == 'persian':
        pal = [L.hexc(c, lin=False) for c in rng.choice([['#7a1f1f', '#1f2a44', '#d9c7a0', '#b0503a'],
                                                         ['#2a3a5a', '#8a2a2a', '#e0d0b0', '#3a5a5a'],
                                                         ['#9a4a2a', '#2a2a3a', '#d8c090', '#6a7a5a']])]
        img = np.ones((h, w, 3)) * np.array(pal[0])
        bd = np.minimum(np.minimum(u, 1 - u) * w, np.minimum(v, 1 - v) * h)
        img[bd < 34] = pal[1]
        img[(bd > 12) & (bd < 26)] = pal[3]
        img[(bd > 16) & (bd < 22) & ((((xx + yy) // 6) % 2) == 0)] = pal[2]
        cu, cv = (u - 0.5) * w / h, v - 0.5
        diamond = np.abs(cu) + np.abs(cv)
        img[(diamond < 0.25) & (bd > 34)] = pal[1]
        img[(diamond < 0.18) & (bd > 34)] = pal[3]
        img[(diamond < 0.08) & (bd > 34)] = pal[2]
        mot = ((np.sin(u * 60) * np.sin(v * 38)) > 0.7) & (bd > 40) & (diamond > 0.27)
        img[mot] = pal[2]
        img *= (0.82 + 0.3 * n[..., None])
        img *= 0.85
    elif kind == 'stripe':
        pal = [L.hexc(c, lin=False) for c in rng.choice([['#e8e0d0', '#2a3a4a'], ['#d8cbb0', '#8a5a3a'], ['#eeeeea', '#9aa8a0']])]
        s = ((v * 9 + 0.03 * np.sin(u * 40)) % 1.0) < 0.2
        img = np.where(s[..., None], np.array(pal[1]), np.array(pal[0]))
        img = img * (0.85 + 0.25 * n[..., None])
    elif kind == 'kilim':
        pal = [L.hexc(c, lin=False) for c in ['#c8603a', '#2a2a2a', '#e8dcc0', '#3a6a7a', '#d8a040']]
        band = (v * 7).astype(int)
        img = np.zeros((h, w, 3))
        for b in range(8):
            img[band == b] = pal[b % len(pal)]
        tri = (np.abs(((u * 14) % 1.0) - 0.5) * 2 > ((v * 7) % 1.0)) & (band % 2 == 0)
        img[tri] = np.array(pal[2])
        img *= (0.85 + 0.25 * n[..., None])
    else:  # plain / shag
        c = np.array(L.hexc(rng.choice(['#d8d0c0', '#8a8a86', '#c8b89a', '#5a6a6a']), lin=False))
        img = np.ones((h, w, 3)) * c * (0.8 + 0.35 * n[..., None])
        bd = np.minimum(np.minimum(u, 1 - u) * w, np.minimum(v, 1 - v) * h)
        img[bd < 6] *= 0.8
    return _img(name, np.clip(img, 0, 1))


def tv_image(name, seed=5, kind='show'):
    rng = np.random.default_rng(seed)
    h, w = 144, 256
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h; u = xx / w
    if kind == 'show':
        img = np.zeros((h, w, 3))
        img[..., 0] = 0.15 + 0.2 * (1 - v)
        img[..., 1] = 0.35 + 0.25 * (1 - v)
        img[..., 2] = 0.6 + 0.3 * (1 - v)
        n = L.vnoise(h, w, 5, rng, 3)
        img *= (0.6 + 0.6 * n[..., None])
        m = ((u - 0.35) ** 2 * 3 + (v - 0.55) ** 2) < 0.05
        img[m] = [0.75, 0.6, 0.5]
        img[v > 0.8] *= 0.4
    else:
        img = np.zeros((h, w, 3)); img[...] = [0.1, 0.5, 0.25]
        img[(v > 0.2) & (v < 0.8) & (np.abs(u - 0.5) < 0.004)] = 1.0
    return _img(name, np.clip(img, 0, 1))


def screen_image(name, seed=1, kind='code'):
    rng = np.random.default_rng(seed)
    h, w = 120, 200
    img = np.zeros((h, w, 3))
    if kind == 'code':
        img[...] = [0.12, 0.13, 0.16]
        img[:, :30] = [0.18, 0.19, 0.22]
        for r in range(8, h - 4, 5):
            x0 = 36 + int(rng.integers(0, 4)) * 6
            L_ = int(rng.integers(20, 120))
            c = [[0.6, 0.75, 0.9], [0.8, 0.6, 0.4], [0.6, 0.8, 0.5], [0.8, 0.8, 0.8]][int(rng.integers(0, 4))]
            img[r:r + 2, x0:min(w - 4, x0 + L_)] = c
    elif kind == 'sheet':
        img[...] = [0.95, 0.95, 0.95]
        img[:12] = [0.15, 0.45, 0.25]
        for r in range(16, h, 6):
            img[r] = [0.8, 0.8, 0.8]
        for c in range(0, w, 28):
            img[:, c] = [0.8, 0.8, 0.8]
        for k in range(12):
            r = int(rng.integers(3, 18)) * 6 + 2
            c = int(rng.integers(0, 6)) * 28 + 4
            img[r:r + 2, c:c + 18] = [0.2, 0.2, 0.2]
    else:  # desktop / web page
        img[...] = [0.93, 0.94, 0.96]
        img[:10] = [0.2, 0.3, 0.55]
        img[20:70, 10:120] = [0.55, 0.65, 0.75]
        for r in range(80, h - 6, 7):
            img[r:r + 2, 10:10 + int(rng.integers(60, 180))] = [0.35, 0.35, 0.38]
    return _img(name, np.clip(img, 0, 1))
