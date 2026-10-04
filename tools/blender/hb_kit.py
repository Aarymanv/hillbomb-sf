"""Larger assemblies for the interior bakes: kitchens, offices, renovation props,
blinds, string lights, wainscoting, hallways.  Same local-frame convention as
hb_props (front = local -Y).  Wall-run builders take a WALL frame: origin on the
wall surface at floor level, local +X along the wall, local -Y pointing into the room.
"""
import math, random
import numpy as np
import bpy
from mathutils import Matrix, Vector
import hb_lib as L
import hb_props as P
from hb_lib import MB, TR

PI = math.pi


def M_tiles(name, color='#f2f1ec', grout='#b8b4aa', scale=0.8, sx=1.0, rough=0.12, checker=None):
    """Glazed tiles from the 'tiles' texture (8x8 tiles per image). scale = metres per image.
    sx stretches tiles horizontally (2 = subway).  checker=(c1, c2) alternates tile colours."""
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0 / (scale * sx), 1.0 / scale, 1.0)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])

    def img(kind):
        im = L.tex_image('tiles', kind)
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = im
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
        return n
    c = img('color')
    # grout mask: texture is white tiles with grey grout
    g = L.math_node(nt, 'SUBTRACT', 1.0, c.outputs['Color'])
    g = L.math_node(nt, 'MULTIPLY', g, 4.0, clamp=True)
    if checker:
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(mp.outputs['Vector'], sep.inputs[0])
        fx = L.math_node(nt, 'FLOOR', L.math_node(nt, 'MULTIPLY', sep.outputs['X'], 8.0))
        fy = L.math_node(nt, 'FLOOR', L.math_node(nt, 'MULTIPLY', sep.outputs['Y'], 8.0))
        par = L.math_node(nt, 'FLOORED_MODULO', L.math_node(nt, 'ADD', fx, fy), 2.0)
        base = L.mix_rgb(nt, par, L.hexc(checker[0]), L.hexc(checker[1]))
    else:
        base = L.hexc(color)
    col = L.mix_rgb(nt, g, base, L.hexc(grout))
    nt.links.new(col, p.inputs['Base Color'])
    rr = L.math_node(nt, 'MULTIPLY_ADD', g, 0.6)
    rr.node.inputs[2].default_value = rough
    nt.links.new(rr, p.inputs['Roughness'])
    nm = img('normal'); nm.image.colorspace_settings.name = 'Non-Color'
    nn = nt.nodes.new('ShaderNodeNormalMap'); nn.uv_map = 'UVMap'; nn.inputs['Strength'].default_value = 0.8
    nt.links.new(nm.outputs['Color'], nn.inputs['Color'])
    nt.links.new(nn.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Coat Weight'].default_value = 0.3
    L._MATS[name] = m
    return m


def M_imgtile(name, img, scale=2.4, rough=0.8, normal_key=None, normal=0.3):
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0 / scale, 1.0 / scale, 1.0)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if normal_key:
        nm = nt.nodes.new('ShaderNodeTexImage'); nm.image = L.tex_image(normal_key, 'normal')
        nt.links.new(mp.outputs['Vector'], nm.inputs['Vector'])
        nn = nt.nodes.new('ShaderNodeNormalMap'); nn.uv_map = 'UVMap'; nn.inputs['Strength'].default_value = normal
        nt.links.new(nm.outputs['Color'], nn.inputs['Color'])
        nt.links.new(nn.outputs['Normal'], p.inputs['Normal'])
    L._MATS[name] = m
    return m


# ----------------------------------------------------------------------------
# kitchen
# ----------------------------------------------------------------------------

def shaker_front(mb, x0, x1, z0, z1, y, m=0, rail=0.06):
    """Door/drawer front on plane y (front face at y - 0.02), with a shaker frame."""
    mb.box(x0, x1, y - 0.02, y, z0, z1, m=m)
    if x1 - x0 > 0.2 and z1 - z0 > 0.14:
        r = min(rail, (z1 - z0) * 0.25)
        mb.box(x0, x1, y - 0.028, y - 0.02, z1 - r, z1, m=m)
        mb.box(x0, x1, y - 0.028, y - 0.02, z0, z0 + r, m=m)
        mb.box(x0, x0 + r, y - 0.028, y - 0.02, z0 + r, z1 - r, m=m)
        mb.box(x1 - r, x1, y - 0.028, y - 0.02, z0 + r, z1 - r, m=m)


def kitchen_run(Mw, x0, x1, cab, top, splash, handle, rng, range_x=None, sink_x=None, uppers=True, upper_skip=(),
                hood=None, name='krun', upper_top=2.25, under_lights=True, night_under=10.0):
    """Base (and upper) cabinets along a wall from local x0..x1."""
    K = P.mats()
    d = 0.6
    carcass = MB(Mw)
    carcass.box(x0, x1, -d + 0.05, 0.0, 0.0, 0.1, m=1)          # toe kick (dark)
    carcass.box(x0, x1, -d + 0.02, 0.0, 0.1, 0.88)
    fronts = MB(Mw)
    units = []
    x = x0
    while x < x1 - 0.05:
        w = min(0.6, x1 - x)
        units.append((x, x + w))
        x += w
    hw = MB(Mw)
    lights = []
    for (a, b) in units:
        c = (a + b) / 2
        if range_x is not None and abs(c - range_x) < 0.35:
            continue
        shaker_front(fronts, a + 0.003, b - 0.003, 0.7, 0.86, -d + 0.02)
        shaker_front(fronts, a + 0.003, b - 0.003, 0.12, 0.68, -d + 0.02)
        hw.box(c - 0.07, c + 0.07, -d - 0.035, -d - 0.008, 0.775, 0.787)
        if sink_x is not None and abs(c - sink_x) < 0.35:
            continue
        hw.box(b - 0.06, b - 0.048, -d - 0.035, -d - 0.008, 0.45, 0.6)
    carcass.obj(name + '_carcass', [cab, K['plastic_black']], bevel=0.003, seg=1)
    fronts.obj(name + '_fronts', cab, bevel=0.003, seg=1)
    hw.obj(name + '_hw', handle, bevel=0.003, seg=1)
    ct = MB(Mw)
    if sink_x is not None:
        ct.box(x0 - 0.01, sink_x - 0.3, -d - 0.03, 0.0, 0.88, 0.92)
        ct.box(sink_x + 0.3, x1 + 0.01, -d - 0.03, 0.0, 0.88, 0.92)
        ct.box(sink_x - 0.3, sink_x + 0.3, -d - 0.03, -d + 0.06, 0.88, 0.92)
        ct.box(sink_x - 0.3, sink_x + 0.3, -0.1, 0.0, 0.88, 0.92)
    else:
        ct.box(x0 - 0.01, x1 + 0.01, -d - 0.03, 0.0, 0.88, 0.92)
    ct.obj(name + '_top', top, bevel=0.004, seg=2)
    sp = MB(Mw)
    sp.box(x0, x1, -0.012, 0.0, 0.92, upper_top - 0.8 if uppers else 1.45)
    sp.obj(name + '_splash', splash)
    if sink_x is not None:
        sk = MB(Mw)
        sk.box(sink_x - 0.3, sink_x + 0.3, -d + 0.06, -0.1, 0.7, 0.72)
        sk.box(sink_x - 0.3, sink_x - 0.28, -d + 0.06, -0.1, 0.7, 0.92)
        sk.box(sink_x + 0.28, sink_x + 0.3, -d + 0.06, -0.1, 0.7, 0.92)
        sk.box(sink_x - 0.3, sink_x + 0.3, -d + 0.06, -d + 0.08, 0.7, 0.92)
        sk.box(sink_x - 0.3, sink_x + 0.3, -0.12, -0.1, 0.7, 0.92)
        sk.cyl(sink_x, -0.06, 0.92, 1.25, 0.013, n=12)
        pts = [Vector((sink_x, -0.06 - 0.1 * (1 - math.cos(t)), 1.25 + 0.1 * math.sin(t))) for t in np.linspace(0, PI, 9)]
        for k in range(8):
            dv = pts[k + 1] - pts[k]
            rot = dv.to_track_quat('Z', 'Y').to_matrix().to_4x4()
            sk.cyl(0, 0, 0, dv.length, 0.012, n=10, M=Matrix.Translation(pts[k]) @ rot)
        sk.cyl(sink_x, -0.26, 1.13, 1.25, 0.013, n=10)
        sk.obj(name + '_sink', K['chrome'], smooth=True)
    if range_x is not None:
        rg = MB(Mw)
        rw = 0.76
        a, b = range_x - rw / 2, range_x + rw / 2
        rg.box(a, b, -d - 0.02, 0.0, 0.0, 0.9)
        rg.box(a, b, -0.08, 0.0, 0.9, 1.05)
        rg.obj(name + '_range', K['steel'], bevel=0.005, seg=2)
        ov = MB(Mw)
        ov.box(a + 0.06, b - 0.06, -d - 0.03, -d - 0.02, 0.2, 0.62)
        ov.obj(name + '_ovenglass', L.M('oven_glass', '#050505', rough=0.08, coat=1.0))
        gr = MB(Mw)
        for gx in (a + 0.19, b - 0.19):
            for gy in (-0.44, -0.18):
                gr.box(gx - 0.17, gx + 0.17, gy - 0.12, gy + 0.12, 0.9, 0.925)
        for k in range(5):
            gr.cyl(0, 0, 0, 0.025, 0.018, n=12, M=TR(a + 0.12 + k * 0.13, -d - 0.02, 0.78, rx=PI / 2))
        gr.box(a + 0.08, b - 0.08, -d - 0.07, -d - 0.05, 0.66, 0.68)
        gr.obj(name + '_grates', K['black_metal'], bevel=0.003, seg=1)
    if uppers:
        ud = 0.34
        up = MB(Mw)
        uf = MB(Mw)
        uh = MB(Mw)
        ulight = MB(Mw)
        for (a, b) in units:
            c = (a + b) / 2
            if any(abs(c - s) < 0.35 for s in upper_skip):
                continue
            up.box(a, b, -ud, 0.0, upper_top - 0.8, upper_top)
            shaker_front(uf, a + 0.003, b - 0.003, upper_top - 0.8 + 0.01, upper_top - 0.01, -ud)
            uh.box(b - 0.06, b - 0.048, -ud - 0.035, -ud - 0.008, upper_top - 0.75, upper_top - 0.6)
            if under_lights:
                ulight.box(a + 0.03, b - 0.03, -ud + 0.03, -ud + 0.06, upper_top - 0.805, upper_top - 0.8)
        up.obj(name + '_uppers', cab, bevel=0.003, seg=1)
        uf.obj(name + '_ufronts', cab, bevel=0.003, seg=1)
        uh.obj(name + '_uhw', handle, bevel=0.002, seg=1)
        if under_lights:
            ulight.obj(name + '_ulight', L.M_emit('underled', P.WARM2, day=0.0, night=12.0))
            xs = [c for c in np.linspace(x0 + 0.3, x1 - 0.3, max(1, int((x1 - x0) / 1.2)))]
            for k, xc in enumerate(xs):
                lt = L.light('AREA', P.world_pt(Mw, xc, -ud + 0.05, upper_top - 0.82), 0.0, P.WARM2, size=(1.0, 0.05),
                             day=0.0, night=night_under, name=name + '_ul%d' % k)
                lt.rotation_euler = (0, 0, Mw.to_euler()[2])
                lights.append(lt)
    if hood is not None:
        hd = MB(Mw)
        hx = hood
        hd.box(hx - 0.4, hx + 0.4, -0.5, 0.0, 1.62, 1.72)
        prof = MB(Mw)
        hd.box(hx - 0.14, hx + 0.14, -0.28, 0.0, 1.72, 3.0)
        hd.obj(name + '_hood', K['steel'], bevel=0.004, seg=2)
    return lights


def fridge(M, w=0.9, d=0.72, h=1.82, mat=None, name='fridge', retro=False):
    K = P.mats()
    mat = mat or K['steel']
    b = MB(M)
    if retro:
        b.box(-w / 2, w / 2, -d / 2, d / 2, 0.05, h)
        b.obj(name, mat, bevel=0.08, seg=5)
        hd = MB(M)
        hd.box(w / 2 - 0.1, w / 2 - 0.05, -d / 2 - 0.05, -d / 2, h * 0.62, h * 0.72)
        hd.obj(name + '_hd', K['chrome'], bevel=0.01, seg=2)
        return
    b.box(-w / 2, w / 2, -d / 2 + 0.03, d / 2, 0.05, h)
    b.box(-w / 2 + 0.003, -0.003, -d / 2, -d / 2 + 0.03, 0.62, h - 0.01)
    b.box(0.003, w / 2 - 0.003, -d / 2, -d / 2 + 0.03, 0.62, h - 0.01)
    b.box(-w / 2 + 0.003, w / 2 - 0.003, -d / 2, -d / 2 + 0.03, 0.06, 0.6)
    b.obj(name, mat, bevel=0.006, seg=2)
    hd = MB(M)
    for sx in (-1, 1):
        hd.cyl(sx * 0.05, -d / 2 - 0.05, 0.8, 1.55, 0.012, n=10)
        hd.box(sx * 0.05 - 0.01, sx * 0.05 + 0.01, -d / 2 - 0.05, -d / 2, 0.79, 0.81)
        hd.box(sx * 0.05 - 0.01, sx * 0.05 + 0.01, -d / 2 - 0.05, -d / 2, 1.54, 1.56)
    hd.cyl(0, 0, -0.3, 0.3, 0.012, n=10, M=TR(0, -d / 2 - 0.05, 0.5, ry=PI / 2))
    hd.obj(name + '_hd', K['chrome'], smooth=True)
    bk = MB(M)
    bk.box(-w / 2 + 0.01, w / 2 - 0.01, -d / 2 + 0.035, d / 2, 0.0, 0.05)
    bk.obj(name + '_kick', K['plastic_black'])


def island(M, w, d, cab, top, handle, name='island'):
    b = MB(M)
    b.box(-w / 2, w / 2, -d / 2 + 0.05, d / 2 - 0.05, 0.1, 0.88)
    b.box(-w / 2 + 0.04, w / 2 - 0.04, -d / 2 + 0.1, d / 2 - 0.1, 0.0, 0.1)
    fr = MB(M)
    n = max(1, int(round(w / 0.6)))
    uw = w / n
    for k in range(n):
        a = -w / 2 + k * uw
        shaker_front(fr, a + 0.003, a + uw - 0.003, 0.12, 0.86, d / 2 - 0.05 + 0.028) if False else None
        # the island's "front" faces +Y (the kitchen side); window side gets panels too
        shaker_front(fr, a + 0.003, a + uw - 0.003, 0.12, 0.86, -d / 2 + 0.05)
    b.obj(name, cab, bevel=0.004, seg=2)
    fr.obj(name + '_panels', cab, bevel=0.003, seg=1)
    t = MB(M)
    t.box(-w / 2 - 0.05, w / 2 + 0.05, -d / 2 - 0.2, d / 2 + 0.02, 0.88, 0.92)
    t.obj(name + '_top', top, bevel=0.005, seg=2)


def fruit_bowl(M, rng, name='fruit'):
    K = P.mats()
    b = MB(M)
    b.lathe([(0.0, 0.0), (0.07, 0.0), (0.14, 0.05), (0.15, 0.08), (0.145, 0.08), (0.13, 0.05), (0.06, 0.012), (0.0, 0.012)], n=32)
    b.obj(name + '_bowl', K['ceramic'], smooth=True)
    f = MB(M)
    cols = [(0.6, 0.05, 0.02), (0.75, 0.35, 0.02), (0.55, 0.6, 0.05), (0.8, 0.55, 0.05)]
    for k in range(7):
        a = rng.uniform(0, 2 * PI); r = rng.uniform(0.0, 0.08)
        f.sphere(r * math.cos(a), r * math.sin(a), 0.07 + (0.04 if r < 0.04 else 0), 0.038, color=rng.choice(cols), seg=12, rings=8)
    f.obj(name + '_fruit', K['attr_gloss'], smooth=True)


def kettle(mb, x, y, z, M=None, color=(0.6, 0.05, 0.04)):
    mb.lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.06), (0.085, 0.16), (0.04, 0.2), (0.0, 0.21)], n=24, color=color, M=(M or Matrix.Identity(4)) @ TR(x, y, z))


def jars(mb, x0, y, z, n, rng, M=None):
    x = x0
    for k in range(n):
        r = rng.uniform(0.04, 0.06); h = rng.uniform(0.12, 0.26)
        mb.cyl(x + r, y, z, z + h, r, n=16, color=(0.9, 0.88, 0.82), M=M)
        x += 2 * r + 0.02


def plates_stack(mb, x, y, z, n=6, r=0.13, M=None, color=(0.92, 0.92, 0.9)):
    for k in range(n):
        mb.lathe([(0.0, 0.0), (r * 0.6, 0.0), (r, 0.012), (r * 0.98, 0.016), (r * 0.6, 0.006), (0, 0.006)], n=24,
                 color=color, M=(M or Matrix.Identity(4)) @ TR(x, y, z + k * 0.017))


# ----------------------------------------------------------------------------
# office
# ----------------------------------------------------------------------------

def drop_ceiling(ceil, x0, x1, y0, y1, panels=(), tile=0.6, name='dropceil'):
    """Suspended ceiling grid flush with the room ceiling; panels = [(x, y, w, d)] holes."""
    K = P.mats()
    g = MB()
    xs = np.arange(x0, x1 + 1e-6, tile)
    ys = np.arange(y0, y1 + 1e-6, tile)
    for x in xs:
        g.box(x - 0.012, x + 0.012, y0, y1, ceil - 0.03, ceil - 0.005)
    for y in ys:
        g.box(x0, x1, y - 0.012, y + 0.012, ceil - 0.03, ceil - 0.005)
    g.obj(name + '_grid', L.M('tbar', '#e9e8e4', rough=0.35, metal=0.2))
    t = MB()
    t.box(x0, x1, y0, y1, ceil - 0.012, ceil)
    t.obj(name + '_tiles', L.M('acoustic', '#e2e0da', rough=0.95, bump=0.25, bump_scale=300.0))


def desk(M, top, legs, w=1.4, d=0.75, h=0.74, name='desk', panel=False):
    t = MB(M)
    t.box(-w / 2, w / 2, -d / 2, d / 2, h - 0.03, h)
    t.obj(name + '_top', top, bevel=0.004, seg=2)
    lg = MB(M)
    if panel:
        for sx in (-1, 1):
            lg.box(sx * (w / 2 - 0.03) - 0.02, sx * (w / 2 - 0.03) + 0.02, -d / 2 + 0.03, d / 2 - 0.03, 0, h - 0.03)
        lg.box(-w / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.06, d / 2 - 0.04, 0.3, h - 0.03)
    else:
        for sx in (-1, 1):
            x = sx * (w / 2 - 0.05)
            lg.box(x - 0.025, x + 0.025, -d / 2 + 0.05, d / 2 - 0.05, 0.0, 0.03)
            lg.box(x - 0.02, x + 0.02, -0.03, 0.03, 0.03, h - 0.03)
            lg.box(x - 0.025, x + 0.025, -d / 2 + 0.05, d / 2 - 0.05, h - 0.06, h - 0.03)
        lg.box(-w / 2 + 0.05, w / 2 - 0.05, -0.02, 0.02, h - 0.1, h - 0.06)
    lg.obj(name + '_legs', legs, bevel=0.003, seg=1)
    return h


def workstation(M, rng, top, legs, chair_fab, screen_img, w=1.4, d=0.75, n_mon=1, on_day=True, on_night=False,
                name='ws', chair=True, lamp=False, night_lamp=0.0, papers=True):
    """User sits at local -Y facing +Y; monitors at the +Y side facing the user."""
    K = P.mats()
    h = desk(M, top, legs, w, d, name=name)
    lights = []
    for k in range(n_mon):
        x = (k - (n_mon - 1) / 2) * 0.62
        P.monitor(M @ TR(x, d / 2 - 0.2, h, rz=(-(k - (n_mon - 1) / 2) * 0.25) + PI), screen_img if k == 0 else
                  P.screen_image(screen_img.name + '_b', 3, 'sheet'), w=0.6, on_day=on_day, on_night=on_night,
                  name='%s_m%d' % (name, k))
    kb = MB(M)
    P.keyboard(kb, 0.0, -0.12, h)
    if papers:
        for k in range(rng.randint(1, 3)):
            kb.box(-0.105, 0.105, -0.15, 0.15, 0, 0.004, color=(0.95, 0.95, 0.93),
                   M=TR(rng.choice((-1, 1)) * rng.uniform(0.35, 0.55), rng.uniform(-0.2, 0.1), h + k * 0.004, rz=rng.uniform(-0.4, 0.4)))
    kb.obj(name + '_kb', K['attr_matte'], bevel=0.002, seg=1)
    mg = MB(M)
    mx = rng.choice((-1, 1)) * rng.uniform(0.3, 0.55)
    mg.cyl(mx, rng.uniform(-0.25, 0.0), h, h + 0.095, 0.04, n=16, color=P.jitter(rng.choice(['#e8e4dc', '#2a3a5a', '#b83a2c', '#1a1a1a']), rng))
    mg.obj(name + '_mug', K['attr_gloss'], smooth=True)
    if chair:
        P.office_chair(M @ TR(rng.uniform(-0.1, 0.1), -d / 2 - 0.25, 0, rz=rng.uniform(-0.5, 0.5)), chair_fab, name=name + '_ch')
    if lamp:
        lights += desk_lamp(M @ TR(w / 2 - 0.18, d / 2 - 0.15, h, rz=2.6), night=night_lamp, name=name + '_lamp')
    return lights


def desk_lamp(M, night=25.0, color='#1a1a1a', name='dlamp', kind='arm'):
    K = P.mats()
    b = MB(M)
    mat = P.paint(color, 0.35) if kind != 'bankers' else K['brass']
    if kind == 'bankers':
        b.cyl(0, 0, 0, 0.02, 0.09, n=24)
        b.cyl(0, 0, 0.02, 0.33, 0.012, n=10)
        b.obj(name + '_base', mat, smooth=True)
        s = MB(M)
        s.cyl(0, 0, -0.18, 0.18, 0.09, n=24, sx=1.0, sy=1.0, M=TR(0, -0.06, 0.36) @ Matrix.Rotation(PI / 2, 4, 'Y') @ Matrix.Diagonal((1, 1, 1, 1)))
        s.obj(name + '_shade', L.M('bankers_green', '#0f4a2a', rough=0.08, coat=0.6, transmission=0.0), smooth=True)
        return [L.light('POINT', P.world_pt(M, 0, -0.06, 0.235), night, P.WARM, 0.03, day=0.0, night=night, name=name + '_L')]
    b.cyl(0, 0, 0, 0.025, 0.08, n=20)
    p0 = Vector((0, 0, 0.025)); p1 = Vector((0, -0.12, 0.38)); p2 = Vector((0, -0.32, 0.36))
    for (a, c) in ((p0, p1), (p1, p2)):
        dv = c - a
        rot = dv.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        b.cyl(0, 0, 0, dv.length, 0.008, n=8, M=Matrix.Translation(a) @ rot)
    b.lathe([(0.02, 0.0), (0.035, -0.02), (0.07, -0.1)], n=24, M=TR(p2.x, p2.y, p2.z))
    b.obj(name, mat, smooth=True)
    bl = MB(M)
    bl.sphere(p2.x, p2.y, p2.z - 0.05, 0.02)
    bl.obj(name + '_bulb', P.bulb_mat(on=night > 0), smooth=True)
    return [L.light('SPOT', P.world_pt(M, p2.x, p2.y, p2.z - 0.04), night, P.WARM, 0.02, day=0.0, night=night,
                    name=name + '_L', spot=(2.0, 0.5))]


def filing_cabinet(M, w=0.47, d=0.62, h=1.32, drawers=4, mat=None, name='fcab'):
    K = P.mats()
    mat = mat or L.M('fcab_grey', '#8f9296', rough=0.4, metal=0.5)
    b = MB(M)
    b.box(-w / 2, w / 2, -d / 2 + 0.02, d / 2, 0.0, h)
    fh = (h - 0.04) / drawers
    for k in range(drawers):
        z0 = 0.03 + k * fh
        b.box(-w / 2 + 0.01, w / 2 - 0.01, -d / 2, -d / 2 + 0.02, z0 + 0.004, z0 + fh - 0.004)
    b.obj(name, mat, bevel=0.004, seg=2)
    hd = MB(M)
    for k in range(drawers):
        z = 0.03 + k * fh + fh * 0.72
        hd.box(-0.07, 0.07, -d / 2 - 0.025, -d / 2, z - 0.012, z + 0.012)
    hd.obj(name + '_hd', K['chrome'], bevel=0.003, seg=1)


def whiteboard(M, w=1.6, h=1.0, rng=None, name='wb'):
    K = P.mats()
    rng = rng or random.Random(5)
    f = MB(M)
    f.box(-w / 2, w / 2, -0.02, 0.0, -h / 2, h / 2)
    f.box(-w / 2 + 0.1, w / 2 - 0.1, -0.08, 0.0, -h / 2 - 0.03, -h / 2)
    f.obj(name + '_frame', L.M('alu', '#c8cacc', rough=0.3, metal=1.0), bevel=0.004, seg=1)
    npr = np.random.default_rng(rng.randint(0, 999))
    img = np.ones((128, 200, 3)) * 0.96
    for k in range(14):
        r = int(npr.integers(10, 118)); c = int(npr.integers(10, 150)); ln = int(npr.integers(10, 45))
        col = [[0.1, 0.2, 0.6], [0.1, 0.1, 0.1], [0.7, 0.1, 0.1], [0.1, 0.5, 0.2]][int(npr.integers(0, 4))]
        img[r:r + 2, c:c + ln] = col
    img[20:80, 150:152] = [0.1, 0.1, 0.1]; img[78:80, 150:190] = [0.1, 0.1, 0.1]
    im = L.np_to_image(name + '_img', img)
    s = MB(M)
    s.quad((-w / 2 + 0.015, -0.021, -h / 2 + 0.015), (w / 2 - 0.015, -0.021, -h / 2 + 0.015), (w / 2 - 0.015, -0.021, h / 2 - 0.015),
           (-w / 2 + 0.015, -0.021, h / 2 - 0.015), uv01=True)
    s.obj(name + '_surf', L.M_image('wb_' + name, im, rough=0.12, coat=0.5))


def cubicle_panel(mb, x0, y0, x1, y1, h=1.35, t=0.06, M=None):
    """Straight partition from (x0,y0) to (x1,y1)."""
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy)
    a = math.atan2(dy, dx)
    mb.box(0, ln, -t / 2, t / 2, 0.02, h, M=(M or Matrix.Identity(4)) @ TR(x0, y0, 0, rz=a))


def exit_sign(M, name='exit'):
    b = MB(M)
    b.box(-0.17, 0.17, -0.03, 0.0, -0.1, 0.1)
    b.obj(name + '_box', P.mats()['plastic_white'], bevel=0.004, seg=1)
    img = np.zeros((32, 64, 3)); img[...] = [0.05, 0.75, 0.25]
    for x0 in (8, 20, 32, 44):
        img[8:24, x0:x0 + 8] = [0.9, 1.0, 0.9]
        img[12:20, x0 + 2:x0 + 8] = [0.05, 0.75, 0.25]
    im = L.np_to_image(name + '_img', img)
    s = MB(M)
    s.quad((-0.15, -0.031, -0.07), (0.15, -0.031, -0.07), (0.15, -0.031, 0.07), (-0.15, -0.031, 0.07), uv01=True)
    s.obj(name + '_face', L.M_emit('exit_face', (1, 1, 1), day=2.0, night=4.0, image=im))


# ----------------------------------------------------------------------------
# misc room props
# ----------------------------------------------------------------------------

def string_lights(p0, p1, sag=0.2, n=18, night=40.0, name='fairy'):
    b = MB()
    c = MB()
    pts = []
    for k in range(n + 1):
        t = k / n
        p = Vector(p0).lerp(Vector(p1), t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(p)
    for k in range(n):
        dv = pts[k + 1] - pts[k]
        rot = dv.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        c.cyl(0, 0, 0, dv.length, 0.002, n=5, M=Matrix.Translation(pts[k]) @ rot)
        b.sphere(pts[k].x, pts[k].y - 0.01, pts[k].z - 0.02, 0.012, seg=8, rings=5)
    c.obj(name + '_wire', P.mats()['cord'], smooth=True)
    b.obj(name + '_bulbs', L.M_emit('fairy_bulb', L.kelvin(2400), day=0.0, night=35.0), smooth=True)
    lights = []
    for t in (0.25, 0.75):
        p = pts[int(t * n)]
        lights.append(L.light('POINT', (p.x, p.y - 0.08, p.z - 0.05), 0.0, L.kelvin(2400), 0.3, day=0.0, night=night / 2,
                              name=name + '_L%d' % int(t * 100)))
    return lights


def blinds(x0, x1, ztop, zbot, y=0.07, tilt=0.75, color='#ecebe6', pitch=0.022, name='blinds'):
    m = L.M('blind_alu', color, rough=0.35, metal=0.0, rough_var=0.03)
    b = MB()
    z = ztop - 0.06
    while z > zbot + 0.02:
        b.box(x0, x1, -0.0125, 0.0125, -0.0007, 0.0007, M=TR(0, y, z, rx=tilt))
        z -= pitch
    b.box(x0 - 0.01, x1 + 0.01, y - 0.025, y + 0.025, zbot - 0.02, zbot + 0.005)
    b.obj(name + '_slats', m, smooth=False)
    h = MB()
    h.box(x0 - 0.02, x1 + 0.02, y - 0.03, y + 0.03, ztop - 0.05, ztop)
    h.obj(name + '_head', m, bevel=0.005, seg=2)
    s = MB()
    for x in np.linspace(x0 + 0.15, x1 - 0.15, max(2, int((x1 - x0) / 0.6))):
        for dy in (-0.013, 0.013):
            s.box(x - 0.0015, x + 0.0015, y + dy - 0.0008, y + dy + 0.0008, zbot, ztop - 0.05)
    s.obj(name + '_ladders', L.M('blind_cord', '#dcd8cc', rough=0.8))
    cord = MB()
    cord.cyl(x1 - 0.08, y - 0.03, zbot - 0.45, ztop - 0.05, 0.002, n=5)
    cord.obj(name + '_cord', L.M('blind_cord', '#dcd8cc', rough=0.8), smooth=True)


def wainscot(paths_panels, color, trim, top=0.9, name='wains'):
    """paths_panels: list of (M_wall, x0, x1) spans in wall frames; paints the lower wall and adds panel mouldings."""
    lw = MB()
    mo = MB()
    for (Mw, x0, x1) in paths_panels:
        lw.box(x0, x1, -0.012, 0.0, 0.0, top, M=Mw)
        n = max(1, int((x1 - x0) / 0.7))
        pw = (x1 - x0) / n
        for k in range(n):
            a = x0 + k * pw + 0.1; b = x0 + (k + 1) * pw - 0.1
            z0, z1 = 0.32, top - 0.1
            for (bx0, bx1, bz0, bz1) in ((a, b, z1 - 0.02, z1), (a, b, z0, z0 + 0.02), (a, a + 0.02, z0, z1), (b - 0.02, b, z0, z1)):
                mo.box(bx0, bx1, -0.024, -0.012, bz0, bz1, M=Mw)
    lw.obj(name + '_paint', color)
    mo.obj(name + '_mould', color, bevel=0.004, seg=2)


def hallway(x0, x1, hd, depth, wall, floor, rng, night=18.0, day=0.0, W=4.0, D=4.0, H=3.0, art_img=None):
    """Dim hallway behind a doorway in the back wall (Y = D .. D + 0.2 is the wall)."""
    K = P.mats()
    y0, y1 = D + 0.2, D + 0.2 + depth
    xa, xb = x0 - 1.6, x1 + 1.6
    m = MB(); m.box(xa, xb, y0 - 0.2, y1 + 0.2, -0.2, 0.0); m.obj('hall_floor', floor)
    m = MB(); m.box(xa, xb, y0 - 0.2, y1 + 0.2, H, H + 0.2); m.obj('hall_ceil', L.MT('ceiling', 'painted_plaster', tint='#efece6', scale=2.5, detail=0.25, normal=0.15))
    m = MB(); m.box(xa - 0.2, xb + 0.2, y1, y1 + 0.2, -0.2, H + 0.2)
    m.box(xa - 0.2, xa, y0 - 0.2, y1, -0.2, H + 0.2)
    m.box(xb, xb + 0.2, y0 - 0.2, y1, -0.2, H + 0.2)
    m.obj('hall_walls', wall)
    bb = MB(); bb.box(xa, xb, y1 - 0.018, y1, 0.0, 0.16); bb.obj('hall_base', P.paint('#efebe2', 0.3))
    if art_img is not None:
        P.art(TR((x0 + x1) / 2 + 0.1, y1, 1.55), art_img, 0.55, 0.7, frame='#1a1a1a', border=0.03, mat_border=0.05, name='hall_art')
    lights = P.flush_light(TR((x0 + x1) / 2, (y0 + y1) / 2, 0), ceil=H, r=0.14, night=night, day=day, name='hall_fl')
    return lights


def door_casing(Mw, x0, x1, hd, mat, name='dcase'):
    c = MB(Mw)
    cw = 0.09
    c.box(x0 - cw, x0, -0.022, 0.0, 0.0, hd + cw)
    c.box(x1, x1 + cw, -0.022, 0.0, 0.0, hd + cw)
    c.box(x0 - cw - 0.015, x1 + cw + 0.015, -0.032, 0.0, hd + cw, hd + cw + 0.03)
    c.obj(name, mat, bevel=0.004, seg=2)


def ladder(M, h=1.8, name='ladder'):
    alu = L.M('ladder_alu', '#c4c6c8', rough=0.35, metal=1.0)
    b = MB(M)
    spread = 0.35
    for side in (-1, 1):
        a = math.atan2(spread, h)
        for sx in (-0.23, 0.23):
            b.box(sx - 0.02, sx + 0.02, -0.035, 0.0, 0.0, h / math.cos(a), M=TR(0, side * spread, 0, rx=side * a) @ TR(0, 0.0175, 0))
        if side < 0:
            for k in range(1, 6):
                z = k * h / 6
                t = z / h
                b.box(-0.23, 0.23, -0.04, 0.02, z - 0.012, z + 0.012, M=TR(0, -spread * (1 - t), 0))
    b.box(-0.25, 0.25, -0.1, 0.1, h - 0.02, h + 0.03)
    b.obj(name, alu, bevel=0.003, seg=1)


def paint_can(mb, x, y, r=0.085, h=0.19, M=None, color=(0.8, 0.8, 0.8)):
    mb.cyl(x, y, 0, h, r, n=20, color=color, M=M)
    mb.cyl(x, y, h, h + 0.008, r * 0.95, n=20, color=(0.6, 0.6, 0.62), M=M)


def sawhorse(M, name='sawhorse'):
    wd = P.mats()['pine']
    b = MB(M)
    b.box(-0.5, 0.5, -0.045, 0.045, 0.66, 0.72)
    for sx in (-0.42, 0.42):
        for sy in (-1, 1):
            b.box(-0.022, 0.022, -0.022, 0.022, 0.0, 0.72, M=TR(sx, sy * 0.13, 0, rx=sy * 0.18))
    b.obj(name, wd, bevel=0.003, seg=1)


def drop_cloth(M, w, d, rng, color='#d6cfc0', name='dropcloth'):
    npr = np.random.default_rng(rng.randint(0, 9999))
    hmap = L.vnoise(40, 40, 5, npr, 3)

    def Pf(u, v):
        i = min(39, int(v * 39)); j = min(39, int(u * 39))
        z = 0.004 + 0.05 * max(0.0, hmap[i, j] - 0.45) ** 1.2
        return ((u - 0.5) * w, (v - 0.5) * d, z)
    m = MB(M)
    m.grid(Pf, 40, 40, uv01=False)
    m.obj(name, L.MT('canvas_' + color.lstrip('#'), 'fabric', tint=color, scale=0.6, normal=0.6, rough_add=0.2), smooth=True)


def drywall_image(name, rng):
    npr = np.random.default_rng(rng.randint(0, 9999))
    h, w = 512, 512                      # covers 2.4 m x 2.4 m
    img = np.ones((h, w, 3)) * np.array(L.hexc('#c9c3b6', lin=False))
    n = L.vnoise(h, w, 12, npr, 4)
    img *= (0.92 + 0.12 * n[..., None])
    mud = np.array(L.hexc('#ebe8e0', lin=False))
    yy, xx = np.mgrid[0:h, 0:w]
    # taped vertical seam at x = 1.2 m (= 256 px) and horizontal at 1.2 m
    for m in (np.abs(xx - 256) < 22 + 10 * L.vnoise(h, w, 6, npr, 2), np.abs(yy - 256) < 20 + 10 * L.vnoise(h, w, 6, npr, 2)):
        img[m] = mud * (0.97 + 0.04 * n[m][:, None])
    for k in range(40):
        cy, cx = int(npr.integers(10, h - 10)), int(npr.integers(10, w - 10))
        if abs(cx - 256) < 30 or k % 2:
            cy = int(npr.integers(0, 8)) * 64 + 20
        rr = int(npr.integers(3, 9))
        img[max(0, cy - rr):cy + rr, max(0, cx - rr):cx + rr] = mud
    return L.np_to_image(name, np.clip(img, 0, 1))


def work_light(M, night=120.0, day=0.0, name='worklight'):
    K = P.mats()
    b = MB(M)
    for k in range(3):
        a = 2 * PI * k / 3
        b.cyl(0, 0, 0, 1.3, 0.01, n=6, M=TR(0.35 * math.cos(a), 0.35 * math.sin(a), 0) @ Matrix.Rotation(-0.26, 4, Vector((-math.sin(a), math.cos(a), 0))))
    b.cyl(0, 0, 1.2, 1.75, 0.012, n=8)
    b.obj(name + '_tripod', K['black_metal'], smooth=True)
    hd = MB(M)
    hd.box(-0.14, 0.14, -0.06, 0.06, 1.72, 1.94, M=TR(0, 0, 0, rx=0.0))
    hd.obj(name + '_head', L.M('worklight_yel', '#d9a51a', rough=0.4), bevel=0.01, seg=2)
    g = MB(M)
    g.quad((-0.12, -0.061, 1.74), (0.12, -0.061, 1.74), (0.12, -0.061, 1.92), (-0.12, -0.061, 1.92))
    g.obj(name + '_lens', L.M_emit('worklens', L.kelvin(4300), day=0.0, night=40.0))
    lt = L.light('SPOT', P.world_pt(M, 0, -0.08, 1.83), night, L.kelvin(4300), 0.08, day=day, night=night,
                 name=name + '_L', spot=(2.2, 0.4))
    e = M.to_euler()
    lt.rotation_euler = (PI / 2 - 0.25, 0, e[2] + PI)
    return [lt]
