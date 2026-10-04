"""HILLBOMB city kit: reusable street-facade and rooftop pieces for the v2 (real 1:1 OSM) buildings, modelled in
Blender, baked (albedo, tangent normal from a bevelled high-poly copy, AO, roughness, metalness) into ONE shared
2048 atlas and exported as one GLB of named low-poly meshes. The game merges them per NEAR tile (v2build.js).

Run: tools/.venv-blender/Scripts/python.exe tools/blender/kit_city.py [--res 2048] [--samples 96] [--preview]
Outputs (public/assets/kit/): city_kit.glb, city_alb.jpg, city_nrm.png, city_orm.jpg (R AO, G rough, B metal),
city_kit.json (pieces: atlas cell, bbox, tris, tint flag), city_kit_preview.jpg (with --preview).

Piece frames (Blender, Z up; glTF export turns -Y into three's +Z):
  wall pieces   origin on the wall surface, +X along the wall (right seen from the street), -Y outward, +Z up
  roof pieces   origin at the roof surface under the piece's centre
Tinting: pieces with tint=True are baked on a 0.8 grey paint; the game multiplies vertex colour (trim colour / 0.8).
"""
import bpy, bmesh, math, os, sys, json, time
import numpy as np
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hb_lib as L
from hb_lib import MB, TR

OUT = os.path.join(L.ROOT, 'public', 'assets', 'kit')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
def arg(k, d):
    return type(d)(ARGS[ARGS.index(k) + 1]) if k in ARGS else d
RES = arg('--res', 2048)
SAMPLES = arg('--samples', 96)
PREVIEW = '--preview' in ARGS
GRID = 5                              # atlas cells per side
PI = math.pi


# ------------------------------------------------------------------ materials
def M_bump(name, color, rough=0.5, metal=0.0, kind='noise', scale=40.0, strength=0.35, dist=0.004, var=0.08, lin=False):
    """Principled + procedural bump (noise, 'wave' bands along Z, 'grid' grating, 'rings')."""
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    c = L.hexc(color) if isinstance(color, str) else (color if lin else tuple(L.srgb_to_lin(color)))
    # colour variation (dirt) from object-space noise
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 5.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.inputs['To Min'].default_value = 1.0 - var * 2; ramp.inputs['To Max'].default_value = 1.0
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    mul.inputs[6].default_value = tuple(c)[:3] + (1.0,)
    nt.links.new(ramp.outputs['Result'], mul.inputs[7])
    nt.links.new(mul.outputs[2], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if kind:
        if kind == 'noise':
            t = nt.nodes.new('ShaderNodeTexNoise'); t.inputs['Scale'].default_value = scale; t.inputs['Detail'].default_value = 8.0
            nt.links.new(tc.outputs['Object'], t.inputs['Vector']); h = t.outputs['Fac']
        elif kind == 'wave':
            t = nt.nodes.new('ShaderNodeTexWave'); t.wave_type = 'BANDS'; t.bands_direction = 'Z'; t.wave_profile = 'SAW'
            t.inputs['Scale'].default_value = scale
            nt.links.new(tc.outputs['Object'], t.inputs['Vector']); h = t.outputs['Fac']
        elif kind == 'grid':
            t = nt.nodes.new('ShaderNodeTexBrick'); t.inputs['Scale'].default_value = scale; t.inputs['Mortar Size'].default_value = 0.02
            t.offset = 0.0; nt.links.new(tc.outputs['Object'], t.inputs['Vector']); h = t.outputs['Fac']
        else:  # rings (fan grilles)
            t = nt.nodes.new('ShaderNodeTexWave'); t.wave_type = 'RINGS'; t.inputs['Scale'].default_value = scale
            nt.links.new(tc.outputs['Object'], t.inputs['Vector']); h = t.outputs['Fac']
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = strength; b.inputs['Distance'].default_value = dist
        nt.links.new(h, b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    L._MATS[name] = m
    m['hb_metal'] = metal
    return m


def mats():
    K = {}
    K['paint'] = M_bump('k_paint', (0.8, 0.8, 0.8), rough=0.42, kind='noise', scale=90, strength=0.12, var=0.05, lin=True)
    K['iron'] = M_bump('k_iron', '#1c1d1f', rough=0.55, metal=0.55, kind='noise', scale=60, strength=0.25, var=0.25)
    K['grate'] = M_bump('k_grate', '#1a1b1d', rough=0.6, metal=0.5, kind='grid', scale=30, strength=0.6, var=0.25)
    K['rust'] = M_bump('k_rust', '#4a2c1c', rough=0.8, metal=0.2, kind='noise', scale=30, strength=0.4, var=0.3)
    K['galv'] = M_bump('k_galv', '#8f9597', rough=0.38, metal=0.8, kind='noise', scale=20, strength=0.1, var=0.15)
    K['hvac'] = M_bump('k_hvac', '#b9bbb6', rough=0.45, metal=0.35, kind='noise', scale=25, strength=0.08, var=0.12)
    K['louver'] = M_bump('k_louver', '#a8aaa5', rough=0.5, metal=0.35, kind='wave', scale=22, strength=0.8, dist=0.01, var=0.15)
    K['fan'] = M_bump('k_fan', '#2a2c2e', rough=0.5, metal=0.5, kind='rings', scale=40, strength=0.9, dist=0.01, var=0.1)
    K['wood'] = L.MT('k_wood', 'wood_floor', tint='#6a4a34', scale=1.4, rot=PI / 2)
    K['conc'] = L.MT('k_conc', 'concrete', tint='#b4b0a6', scale=2.0)
    K['stucco'] = L.MT('k_stucco', 'stucco', tint='#cfc7b8', scale=2.0)
    K['brick'] = L.MT('k_brick', 'brick_red', scale=1.1)
    K['terra'] = M_bump('k_terra', '#a4583a', rough=0.7, kind='noise', scale=50, strength=0.2, var=0.15)
    K['glass'] = M_bump('k_glass', '#101418', rough=0.08, metal=0.9, kind=None, var=0.05)
    K['door'] = M_bump('k_door', '#4e5550', rough=0.45, metal=0.4, kind='noise', scale=40, strength=0.1, var=0.1)
    K['tar'] = M_bump('k_tar', '#2c2b2a', rough=0.85, kind='noise', scale=15, strength=0.3, var=0.15)
    for mt in K.values():
        if 'hb_metal' not in mt:
            mt['hb_metal'] = 0.0
    return K


# ------------------------------------------------------------------ geometry helpers
def prism_x(mb, poly, x0, x1, m=0):
    """polygon [(y, z), ...] extruded along X from x0 to x1 (closed)."""
    a = mb.verts([(x0, y, z) for y, z in poly]); b = mb.verts([(x1, y, z) for y, z in poly])
    n = len(poly); fs = [mb.bm.faces.new(a[::-1]), mb.bm.faces.new(b)]
    for i in range(n):
        j = (i + 1) % n
        fs.append(mb.bm.faces.new([a[i], a[j], b[j], b[i]]))
    return mb._fin(fs, (1, 1, 1), m)


def beam(mb, p0, p1, w, h, m=0):
    """rectangular bar from p0 to p1 (w across, h in the 'up-ish' direction)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0); L_ = d.length; d.normalize()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
    s = d.cross(up).normalized(); u = s.cross(d).normalized()
    M = Matrix(((d.x, s.x, u.x, p0.x), (d.y, s.y, u.y, p0.y), (d.z, s.z, u.z, p0.z), (0, 0, 0, 1)))
    return mb.box(0, L_, -w / 2, w / 2, -h / 2, h / 2, m=m, M=M)


def ring_band(mb, r, z0, z1, n=20, m=0):
    return mb.cyl(0, 0, z0, z1, r, n=n, m=m, caps=(False, False))


# ------------------------------------------------------------------ pieces
PIECES = []
def piece(name, tint=False, cells=1):
    def deco(fn):
        PIECES.append((name, fn, tint, cells))
        return fn
    return deco


@piece('bracket', tint=True)
def p_bracket(K):
    """Italianate scroll bracket under a cornice: top at z=0 against the wall, projects 0.5 m, 0.75 m tall.
    Low: the outline prism; high (baked into the normal map): cap plate, volute, drop."""
    poly = [(0.0, 0.0), (-0.5, 0.0), (-0.5, -0.07), (-0.44, -0.1), (-0.34, -0.12), (-0.25, -0.17), (-0.18, -0.27),
            (-0.15, -0.4), (-0.13, -0.52), (-0.1, -0.62), (-0.06, -0.7), (0.0, -0.75)]
    lo = MB(); prism_x(lo, [(0.0, 0.0), (-0.5, 0.0), (-0.5, -0.08), (-0.3, -0.13), (-0.18, -0.28), (-0.13, -0.55), (-0.06, -0.72), (0.0, -0.8)], -0.095, 0.095, 0)
    hi = MB(); prism_x(hi, poly, -0.075, 0.075, 0)
    prism_x(hi, [(0.0, -0.02), (-0.46, -0.02), (-0.46, -0.06), (0.0, -0.06)], -0.09, 0.09, 0)
    hi.cyl(0, 0, -0.085, 0.085, 0.065, n=16, m=0, M=TR(0, -0.13, -0.6, ry=PI / 2))
    hi.cyl(0, 0, -0.05, 0.05, 0.035, n=12, m=0, M=TR(0, -0.25, -0.16, ry=PI / 2))
    hi.cyl(0, 0, -0.8, -0.74, 0.03, 0.055, n=12, m=0, M=TR(0, -0.05, 0))
    return lo, [K['paint']], hi


@piece('cornice', tint=True)
def p_cornice(K):
    """2.0 m tileable bracketed cornice run (x in -1..1): frieze, dentils, modillions, corona, cyma crown.
    Bottom of the frieze at z=0, top z=0.68, projection 0.56. Low: 8-point envelope; high: the full mouldings."""
    prof = [(0.0, 0.0), (-0.04, 0.0), (-0.04, 0.26), (-0.07, 0.28), (-0.09, 0.32), (-0.1, 0.33), (-0.1, 0.42), (-0.13, 0.42),
            (-0.47, 0.43), (-0.49, 0.44), (-0.49, 0.52), (-0.51, 0.53), (-0.53, 0.56), (-0.555, 0.61), (-0.55, 0.64),
            (-0.56, 0.66), (-0.56, 0.68), (0.0, 0.68)]
    lo = MB(); prism_x(lo, [(0.0, 0.0), (-0.05, 0.0), (-0.05, 0.3), (-0.17, 0.33), (-0.17, 0.41), (-0.49, 0.43), (-0.57, 0.58), (-0.57, 0.69), (0.0, 0.69)], -1.0, 1.0, 0)
    hi = MB(); prism_x(hi, prof, -1.0, 1.0, 0)
    for k in range(14):
        x = -1.0 + (k + 0.5) / 7
        hi.box(x - 0.032, x + 0.032, -0.165, -0.1, 0.335, 0.405, m=0)
    for x in (-0.75, -0.25, 0.25, 0.75):
        prism_x(hi, [(-0.1, 0.43), (-0.44, 0.43), (-0.44, 0.405), (-0.36, 0.39), (-0.24, 0.37), (-0.16, 0.36), (-0.1, 0.345)], x - 0.05, x + 0.05, 0)
        hi.box(x - 0.19, x + 0.19, -0.055, -0.04, 0.05, 0.22, m=0)
    return lo, [K['paint']], hi


@piece('cornice_brick', tint=False)
def p_cornice_brick(K):
    """2.0 m tileable corbelled brick cornice with a galvanised sheet-metal cap (apartments, lofts)."""
    lo = MB()
    prism_x(lo, [(0.0, 0.0), (-0.06, 0.0), (-0.12, 0.12), (-0.24, 0.26), (-0.24, 0.46), (-0.18, 0.5), (0.0, 0.5)], -1.0, 1.0, 0)
    prism_x(lo, [(0.02, 0.5), (-0.3, 0.5), (-0.3, 0.56), (-0.27, 0.6), (0.02, 0.62)], -1.0, 1.0, 1)
    hi = MB()
    prism_x(hi, [(0.0, 0.0), (-0.06, 0.0), (-0.06, 0.12), (-0.12, 0.12), (-0.12, 0.24), (-0.18, 0.24), (-0.18, 0.5), (0.0, 0.5)], -1.0, 1.0, 0)
    for k in range(8):
        x = -1.0 + (k + 0.5) / 4
        hi.box(x - 0.06, x + 0.06, -0.24, -0.18, 0.26, 0.46, m=0)
    prism_x(hi, [(0.02, 0.5), (-0.3, 0.5), (-0.3, 0.56), (-0.27, 0.6), (0.02, 0.62)], -1.0, 1.0, 1)
    return lo, [K['brick'], K['galv']], hi


@piece('fire_escape', tint=False, cells=2)
def p_fire_escape(K):
    """One floor of a fire escape, 3.0 m wide (x -1.5..1.5), platform at z=0 projecting 1.15 m, stair up to z=3.0."""
    mb = MB()
    D = 1.15
    mb.box(-1.5, 1.5, -D, -0.04, -0.05, 0.0, m=1)                              # grating
    mb.box(-1.52, 1.52, -D - 0.04, -D, -0.14, 0.02, m=0)                        # edge angle
    for x in (-1.52, 1.48):
        mb.box(x, x + 0.04, -D, -0.02, -0.14, 0.0, m=0)
    for z in (0.5, 0.95):                                                       # rails
        mb.box(-1.52, 1.52, -D - 0.035, -D + 0.005, z, z + 0.035, m=0)
        for x in (-1.52, 1.48):
            mb.box(x, x + 0.035, -D, -0.02, z, z + 0.035, m=0)
    n = 11
    for k in range(n):                                                          # balusters (flat bars)
        x = -1.5 + 3.0 * k / (n - 1)
        mb.box(x - 0.012, x + 0.012, -D - 0.03, -D, 0.0, 0.95, m=0)
    for x in (-1.5, 1.49):
        for y in (-0.4, -0.78):
            mb.box(x - 0.01, x + 0.012, y - 0.012, y + 0.012, 0.0, 0.95, m=0)
    for x in (-1.2, 1.2):                                                       # knee braces to the wall
        beam(mb, (x, -0.02, -0.75), (x, -D + 0.05, -0.08), 0.05, 0.05, m=0)
        mb.box(x - 0.08, x + 0.08, -0.03, 0.0, -0.85, -0.6, m=0)
    # stair: from x=+1.1 (z=0) up to x=-1.25 (z=3.0) against the wall side of the platform
    y0, y1 = -0.12, -0.7
    for y in (y0, y1):
        beam(mb, (1.15, y, 0.0), (-1.3, y, 3.0), 0.03, 0.18, m=0)
    steps = 13
    for k in range(1, steps):
        t = k / steps
        x = 1.15 + (-1.3 - 1.15) * t; z = 3.0 * t
        mb.box(x - 0.11, x + 0.11, y1, y0, z - 0.1, z - 0.07, m=1)
    beam(mb, (1.15, y1 - 0.02, 0.9), (-1.3, y1 - 0.02, 3.9), 0.035, 0.035, m=0)   # handrail
    beam(mb, (1.15, y1 - 0.02, 0.0), (1.15, y1 - 0.02, 0.9), 0.03, 0.03, m=0)
    return mb, [K['iron'], K['grate']]


@piece('fire_escape_top', tint=False)
def p_fire_escape_top(K):
    """Top floor of a fire escape (platform + railing, a roof gooseneck ladder)."""
    mb = MB()
    D = 1.15
    mb.box(-1.5, 1.5, -D, -0.04, -0.05, 0.0, m=1)
    mb.box(-1.52, 1.52, -D - 0.04, -D, -0.14, 0.02, m=0)
    for z in (0.5, 0.95):
        mb.box(-1.52, 1.52, -D - 0.035, -D + 0.005, z, z + 0.035, m=0)
        for x in (-1.52, 1.48):
            mb.box(x, x + 0.035, -D, -0.02, z, z + 0.035, m=0)
    for k in range(11):
        x = -1.5 + 3.0 * k / 10
        mb.box(x - 0.012, x + 0.012, -D - 0.03, -D, 0.0, 0.95, m=0)
    for x in (-1.2, 1.2):
        beam(mb, (x, -0.02, -0.75), (x, -D + 0.05, -0.08), 0.05, 0.05, m=0)
    for x in (-1.3, -0.9):                                                      # gooseneck ladder rails to the roof
        mb.box(x - 0.015, x + 0.015, -0.3, -0.27, 0.0, 2.6, m=0)
    for k in range(8):
        mb.box(-1.3, -0.9, -0.3, -0.28, 0.3 + k * 0.3, 0.325 + k * 0.3, m=0)
    return mb, [K['iron'], K['grate']]


@piece('water_tank', cells=2)
def p_water_tank(K):
    """Redwood water tank on a steel stand (roof piece), tank r 1.6 m, total 6.6 m."""
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box(sx * 1.1 - 0.08, sx * 1.1 + 0.08, sy * 1.1 - 0.08, sy * 1.1 + 0.08, 0, 2.45, m=1)
    for a, b in (((-1.1, -1.1), (1.1, -1.1)), ((1.1, -1.1), (1.1, 1.1)), ((1.1, 1.1), (-1.1, 1.1)), ((-1.1, 1.1), (-1.1, -1.1))):
        beam(mb, (a[0], a[1], 2.4), (b[0], b[1], 2.4), 0.14, 0.2, m=1)
        beam(mb, (a[0], a[1], 0.3), (b[0], b[1], 2.2), 0.05, 0.05, m=1)
    for k in range(-2, 3):
        mb.box(-1.55, 1.55, k * 0.5 - 0.08, k * 0.5 + 0.08, 2.5, 2.62, m=0)       # joists
    mb.cyl(0, 0, 2.62, 5.8, 1.6, n=14, m=0)
    for z in (2.9, 3.6, 4.3, 5.0, 5.6):
        ring_band(mb, 1.625, z, z + 0.05, n=14, m=1)
    mb.cyl(0, 0, 5.8, 6.7, 1.72, 0.08, n=14, m=0, caps=(True, False))
    mb.cyl(0, 0, 6.65, 6.85, 0.1, 0.02, n=8, m=1)
    mb.box(-0.3, 0.3, -1.2, -0.7, 6.1, 6.35, m=0, M=TR(0, 0, 0))
    for x in (-0.22, 0.22):                                                     # ladder
        mb.box(x - 0.02, x + 0.02, -1.66, -1.62, 0.0, 6.0, m=1)
    for k in range(9):
        mb.box(-0.22, 0.22, -1.65, -1.63, 0.3 + k * 0.64, 0.34 + k * 0.64, m=1)
    return mb, [K['wood'], K['iron']]


@piece('hvac_a')
def p_hvac_a(K):
    mb = MB()
    mb.box(-0.95, 0.95, -0.6, 0.6, 0.0, 0.12, m=3)                            # curb
    mb.box(-0.9, 0.9, -0.55, 0.55, 0.12, 1.05, m=0)
    mb.box(-0.86, 0.86, -0.56, -0.55, 0.2, 0.9, m=1)                           # louvered faces
    mb.box(-0.86, 0.86, 0.55, 0.56, 0.2, 0.9, m=1)
    mb.cyl(0.35, 0, 1.05, 1.12, 0.36, n=16, m=2)
    mb.box(-0.8, -0.2, -0.45, 0.45, 1.05, 1.1, m=0)
    beam(mb, (-0.9, 0.3, 0.6), (-1.4, 0.3, 0.1), 0.08, 0.08, m=0)              # duct / conduit
    return mb, [K['hvac'], K['louver'], K['fan'], K['tar']]


@piece('hvac_b')
def p_hvac_b(K):
    mb = MB()
    mb.box(-1.7, 1.7, -1.0, 1.0, 0.0, 0.15, m=3)
    mb.box(-1.6, 1.6, -0.95, 0.95, 0.15, 1.35, m=0)
    for y in (-0.955, 0.955):
        mb.box(-1.5, 0.3, y - 0.005, y + 0.005, 0.25, 1.25, m=1)
    for x in (-0.8, 0.8):
        mb.cyl(x, 0, 1.35, 1.45, 0.52, n=18, m=2)
    mb.box(1.1, 1.55, -0.6, 0.6, 1.35, 1.55, m=0)
    return mb, [K['hvac'], K['louver'], K['fan'], K['tar']]


@piece('bulkhead')
def p_bulkhead(K):
    """Stair bulkhead / roof access: 2.6 x 2.3 x 2.7 m, door on the -Y face."""
    mb = MB()
    mb.box(-1.3, 1.3, -1.15, 1.15, 0, 2.7, m=0)
    mb.box(-1.42, 1.42, -1.27, 1.27, 2.7, 2.86, m=1)
    mb.box(-0.48, 0.48, -1.19, -1.15, 0.0, 2.12, m=2)
    mb.box(-0.56, 0.56, -1.21, -1.15, 2.12, 2.2, m=1)
    mb.box(-0.12, 0.12, -1.35, -1.15, 2.3, 2.42, m=1)                           # light
    mb.cyl(0.8, 0.5, 2.86, 3.5, 0.08, n=8, m=1)
    return mb, [K['stucco'], K['galv'], K['door']]


@piece('antenna')
def p_antenna(K):
    mb = MB()
    mb.box(-0.3, 0.3, -0.3, 0.3, 0, 0.12, m=1)
    mb.cyl(0, 0, 0.12, 6.0, 0.045, 0.03, n=6, m=0)
    for z, w in ((3.6, 1.2), (4.6, 0.9), (5.4, 0.6)):
        beam(mb, (-w, 0, z), (w, 0, z), 0.025, 0.025, m=0)
        for x in (-w, w):
            beam(mb, (x, -0.25, z), (x, 0.25, z), 0.015, 0.015, m=0)
    mb.lathe([(0.0, 0.0), (0.2, 0.03), (0.36, 0.1), (0.42, 0.14), (0.4, 0.15), (0.0, 0.02)], n=14, m=0, M=TR(0, -0.15, 2.6, rx=-PI / 2 + 0.5))
    return mb, [K['galv'], K['conc']]


@piece('dish')
def p_dish(K):
    mb = MB()
    mb.box(-0.35, 0.35, -0.35, 0.35, 0, 0.08, m=1)
    mb.cyl(0, 0, 0.08, 0.9, 0.035, n=6, m=0)
    mb.lathe([(0.0, 0.0), (0.18, 0.02), (0.34, 0.07), (0.45, 0.13), (0.43, 0.14), (0.0, 0.02)], n=16, m=0, M=TR(0, -0.05, 1.0, rx=-PI / 2 + 0.6))
    beam(mb, (0, -0.1, 1.0), (0, -0.55, 1.35), 0.02, 0.02, m=0)
    return mb, [K['galv'], K['conc']]


@piece('skylight')
def p_skylight(K):
    mb = MB()
    mb.box(-0.85, 0.85, -0.65, 0.65, 0, 0.32, m=1)
    v = mb.verts([(-0.8, -0.6, 0.32), (0.8, -0.6, 0.32), (0.8, 0.6, 0.32), (-0.8, 0.6, 0.32), (-0.35, 0, 0.78), (0.35, 0, 0.78)])
    fs = [mb.bm.faces.new([v[0], v[1], v[5], v[4]]), mb.bm.faces.new([v[2], v[3], v[4], v[5]]),
          mb.bm.faces.new([v[1], v[2], v[5]]), mb.bm.faces.new([v[3], v[0], v[4]])]
    mb._fin(fs, (1, 1, 1), 0)
    for a, b in (((-0.8, -0.6, 0.32), (-0.35, 0, 0.78)), ((0.8, -0.6, 0.32), (0.35, 0, 0.78)), ((0.8, 0.6, 0.32), (0.35, 0, 0.78)),
                 ((-0.8, 0.6, 0.32), (-0.35, 0, 0.78)), ((-0.35, 0, 0.8), (0.35, 0, 0.8)), ((0, -0.3, 0.55), (0, 0.3, 0.55))):
        beam(mb, a, b, 0.04, 0.04, m=2)
    return mb, [K['glass'], K['galv'], K['iron']]


@piece('chimney')
def p_chimney(K):
    """Brick chimney stack for houses: base at z=-1.0 (sinks into the roof), cap at 1.6, two flue pots."""
    mb = MB()
    mb.box(-0.38, 0.38, -0.26, 0.26, -1.0, 1.45, m=0)
    mb.box(-0.44, 0.44, -0.32, 0.32, 1.35, 1.45, m=0)
    mb.box(-0.47, 0.47, -0.35, 0.35, 1.45, 1.55, m=0)
    mb.box(-0.42, 0.42, -0.3, 0.3, 1.55, 1.6, m=2)
    for x in (-0.17, 0.17):
        mb.cyl(x, 0, 1.6, 1.95, 0.1, 0.085, n=10, m=1)
        mb.cyl(x, 0, 1.95, 2.0, 0.11, 0.11, n=10, m=1)
    return mb, [K['brick'], K['terra'], K['conc']]


@piece('vents')
def p_vents(K):
    mb = MB()
    for x, y, r, h in ((-0.3, 0.1, 0.06, 0.7), (0.05, -0.15, 0.09, 0.55), (0.3, 0.2, 0.05, 0.9)):
        mb.cyl(x, y, 0, h, r, n=6, m=0)
        mb.cyl(x, y, h, h + 0.06, r * 1.6, r * 0.4, n=6, m=0)
    mb.cyl(0.0, 0.45, 0, 0.35, 0.12, n=8, m=0)
    mb.sphere(0.0, 0.45, 0.55, 0.22, seg=8, rings=5, m=1)
    return mb, [K['galv'], K['louver']]


@piece('penthouse', cells=2)
def p_penthouse(K):
    """Elevator machine room for mid-rise / tower roofs: 5.2 x 3.8 x 3.4 m, louvres, door, rail."""
    mb = MB()
    mb.box(-2.6, 2.6, -1.9, 1.9, 0, 3.4, m=0)
    mb.box(-2.72, 2.72, -2.02, 2.02, 3.4, 3.58, m=1)
    mb.box(-2.2, -0.6, -1.92, -1.9, 1.6, 2.8, m=2)
    mb.box(0.6, 1.5, -1.93, -1.9, 0.0, 2.2, m=3)
    mb.box(2.6, 2.62, -1.2, 1.2, 1.2, 2.8, m=2)
    for x in (-2.4, 0.0, 2.4):
        mb.cyl(x, 1.4, 3.58, 4.1, 0.1, n=8, m=1)
    return mb, [K['conc'], K['galv'], K['louver'], K['door']]


# ------------------------------------------------------------------ build, UV, bake, export
def finish(mb, name, mat_list):
    bmesh.ops.recalc_face_normals(mb.bm, faces=mb.bm.faces)
    ob = mb.obj(name, mat_list)
    return ob


def atlas_rects():
    """cells per piece -> uv rect [u0, v0, u1, v1] (v up); wide pieces take 2 cells side by side."""
    rects, c = {}, 0
    for name, fn, tint, cells in PIECES:
        if cells == 2 and c % GRID == GRID - 1:
            c += 1
        col, row = c % GRID, c // GRID
        rects[name] = [col / GRID, 1 - (row + 1) / GRID, (col + cells) / GRID, 1 - row / GRID]
        c += cells
    assert c <= GRID * GRID, c
    return rects


def uv_into(ob, rect, margin_px=10):
    me = ob.data
    if 'Atlas' not in me.uv_layers:
        me.uv_layers.new(name='Atlas')
    me.uv_layers.active = me.uv_layers['Atlas']
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.01, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = me.uv_layers['Atlas'].data
    a = np.empty(len(uv) * 2, np.float32); uv.foreach_get('uv', a); a = a.reshape(-1, 2)
    lo, hi = a.min(0), a.max(0)
    m = margin_px / RES
    w, h = rect[2] - rect[0] - 2 * m, rect[3] - rect[1] - 2 * m
    s = min(w / max(hi[0] - lo[0], 1e-6), h / max(hi[1] - lo[1], 1e-6))
    a = (a - lo) * s + np.array([rect[0] + m, rect[1] + m])
    uv.foreach_set('uv', a.ravel())


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data; ob.modifiers.clear(); ob.data = me; bpy.data.meshes.remove(old)


def bake_setup():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    dev = L.pick_device(True)
    sc.cycles.device = 'GPU' if dev.startswith('GPU') else 'CPU'
    sc.render.threads_mode = 'AUTO'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = False
    # a neutral world for AO distances
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    sc.world.light_settings.distance = 0.6
    return dev


def image(name, col=(0, 0, 0, 1), data=False):
    im = bpy.data.images.new(name, RES, RES, alpha=False, float_buffer=True)
    im.generated_color = col
    if data:
        im.colorspace_settings.name = 'Non-Color'
    return im


def set_target(im):
    for mt in bpy.data.materials:
        if not mt.use_nodes:
            continue
        nt = mt.node_tree
        n = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage')
        n.name = '__bake__'; n.image = im
        for x in nt.nodes:
            x.select = False
        n.select = True; nt.nodes.active = n


def select(obs, active=None):
    for o in bpy.data.objects:
        if o.name in bpy.context.view_layer.objects:
            o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]


def metal_emit(on):
    """swap every material output to an emission of its metalness (for the metal channel bake)."""
    for mt in bpy.data.materials:
        if not mt.use_nodes:
            continue
        nt = mt.node_tree; out = nt.nodes.get('Material Output')
        if out is None:
            continue
        if on:
            e = nt.nodes.new('ShaderNodeEmission'); e.name = '__metal__'
            v = float(mt.get('hb_metal', 0.0)); e.inputs['Color'].default_value = (v, v, v, 1); e.inputs['Strength'].default_value = 1.0
            mt['__surf__'] = [l.from_node.name for l in out.inputs['Surface'].links][0] if out.inputs['Surface'].links else ''
            nt.links.new(e.outputs[0], out.inputs['Surface'])
        else:
            e = nt.nodes.get('__metal__'); src = nt.nodes.get(mt.get('__surf__', ''))
            if src is not None:
                nt.links.new(src.outputs[0], out.inputs['Surface'])
            if e is not None:
                nt.nodes.remove(e)


def px(im):
    a = np.empty(RES * RES * 4, np.float32); im.pixels.foreach_get(a)
    return np.flipud(a.reshape(RES, RES, 4))[:, :, :3]


def main():
    t0 = time.time()
    L.reset_factory()
    K = mats()
    rects = atlas_rects()
    los, his, meta = [], [], {}
    for k, (name, fn, tint, cells) in enumerate(PIECES):
        res = fn(K)
        mb, ml = res[0], res[1]
        lo = finish(mb, name, ml)
        uv_into(lo, rects[name])
        off = Vector(((k % 4) * 30.0, (k // 4) * 30.0, 0.0))      # spread apart for AO
        lo.location = off
        if len(res) > 2:
            hi = finish(res[2], name + '_hi', ml); hi.location = off; lo['hb_hi'] = 1
        else:
            hi = lo.copy(); hi.data = lo.data.copy(); hi.name = name + '_hi'
            bpy.context.scene.collection.objects.link(hi)
        b = hi.modifiers.new('bev', 'BEVEL'); b.width = 0.01 if len(res) > 2 else 0.012; b.segments = 3; b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(30); b.harden_normals = True; b.use_clamp_overlap = True
        hi.data.shade_smooth()
        apply_mods(hi)
        los.append(lo); his.append(hi)
        tris = sum(len(p.vertices) - 2 for p in lo.data.polygons)
        bb = [Vector(c) for c in lo.bound_box]
        meta[name] = {'rect': rects[name], 'tint': tint, 'tris': tris,
                      'min': [min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb)],
                      'max': [max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb)]}
        print(f'[kit] {name}: {tris} tris')
    dev = bake_setup()
    print('[kit] bake device', dev)
    for h in his:
        h.hide_render = True
    alb, nrm, ao, rgh, mtl = image('alb', (0.5, 0.5, 0.5, 1)), image('nrm', (0.5, 0.5, 1, 1), True), image('ao', (1, 1, 1, 1), True), image('rgh', (0.6, 0.6, 0.6, 1), True), image('mtl', (0, 0, 0, 1), True)
    def bake(kind, im, **kw):
        t = time.time(); set_target(im); select(los)
        bpy.ops.object.bake(type=kind, **kw)
        print(f'[kit] bake {kind} {time.time() - t:.1f}s')
    bake('DIFFUSE', alb, pass_filter={'COLOR'})
    bake('AO', ao)
    bake('ROUGHNESS', rgh)
    metal_emit(True); bake('EMIT', mtl); metal_emit(False)
    # normals: high (bevelled) -> low, tangent space
    for h in his:
        h.hide_render = False
    t = time.time(); set_target(nrm)
    for lo, hi in zip(los, his):
        select([hi, lo], lo)
        ext = 0.09 if lo.get('hb_hi') else 0.03
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=ext, max_ray_distance=ext * 2.2)
    print(f'[kit] bake NORMAL {time.time() - t:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    A = px(alb)                       # linear
    A = np.where(A <= 0.0031308, A * 12.92, 1.055 * np.power(np.clip(A, 0, 1), 1 / 2.4) - 0.055)
    L.save_image(os.path.join(OUT, 'city_alb.jpg'), A, 'JPEG', 92)
    N = px(nrm)
    L.save_image(os.path.join(OUT, 'city_nrm.png'), N, 'PNG')
    ORM = np.stack([px(ao)[:, :, 0], px(rgh)[:, :, 0], px(mtl)[:, :, 0]], axis=2)
    L.save_image(os.path.join(OUT, 'city_orm.jpg'), ORM, 'JPEG', 94)
    # export: low meshes at the origin, Atlas UV only, no colours / materials
    for h in his:
        bpy.data.objects.remove(h, do_unlink=True)
    bpy.context.view_layer.update()
    for lo in los:
        lo.location = (0, 0, 0)
        me = lo.data
        if 'UVMap' in me.uv_layers:
            me.uv_layers.remove(me.uv_layers['UVMap'])
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        me.materials.clear()
    select(los)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'city_kit.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_normals=True, export_texcoords=True, export_yup=True, export_apply=True)
    with open(os.path.join(OUT, 'city_kit.json'), 'w') as f:
        json.dump({'res': RES, 'pieces': meta, 'frame': 'three: +x along wall, +z outward (roof pieces: centred), +y up'}, f, indent=1)
    print(f'[kit] done in {time.time() - t0:.0f}s ->', OUT)
    if PREVIEW:
        preview(los)


def preview(los):
    """contact sheet with the baked maps on the low meshes (checks the atlas / UV / export path)."""
    for mt in list(bpy.data.materials):
        bpy.data.materials.remove(mt)
    m = bpy.data.materials.new('pv'); nt = L._nt(m); p = L.principled(nt)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'Atlas'
    ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = bpy.data.images.load(os.path.join(OUT, 'city_alb.jpg'))
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images.load(os.path.join(OUT, 'city_nrm.png')); tn.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'Atlas'
    for t in (ta, tn):
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
    nt.links.new(ta.outputs['Color'], p.inputs['Base Color']); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    x = 0.0
    for lo in los:
        lo.data.materials.append(m)
        bb = [Vector(c) for c in lo.bound_box]; w = max(c.x for c in bb) - min(c.x for c in bb)
        lo.location = (x - min(c.x for c in bb), 0, 0); x += w + 0.8
    sc = L.setup_render(1600, 600, samples=48)
    sun = L.light('SUN', (0, 0, 10), 4.0, rot=(math.radians(50), 0, math.radians(-30)))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (x / 2, -26, 9); cam.rotation_euler = (math.radians(74), 0, 0); cam.data.lens = 35
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.4, 0.45, 0.5, 1)
    sc.render.image_settings.file_format = 'JPEG'
    L.render_to(os.path.join(OUT, 'city_kit_preview.jpg'))


main()
