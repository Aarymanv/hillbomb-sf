"""HILLBOMB facade kit v3: real-geometry street-facade pieces for the NEAR tier of the v2 (1:1 OSM) buildings
(src/world/facade/v3front.js): window units per style (casings, sills, hoods, jamb liners, double-hung / casement /
steel sashes), doors, garage doors, clay-tile caps and pent roofs, railings, entry lamps, meters, mailboxes,
downspouts, planters, hedges, gates, loading-dock bumpers. Baked (albedo, tangent normal from a bevelled copy, AO,
roughness, metalness) into ONE atlas, exported as one GLB of named low-poly meshes.

Run: tools/.venv-blender/Scripts/python.exe tools/blender/kit_facade3.py [--res 3072] [--samples 64] [--only name,name]
Outputs (public/assets/kit/): fac3_kit.glb, fac3_alb.jpg, fac3_nrm.jpg, fac3_orm.jpg (R AO, G rough, B metal),
fac3_kit.json (per piece: atlas rect, bbox, tris, opening [W0, H0], recess rec0, stretch zones).

Authoring frame ("wall coords"): u along the wall (right, seen from the street), v up, d outward; converted to Blender
(x = u, y = -d, z = v); glTF turns that into three (x = u, y = v, z = d).
Openings: the opening is [0, W0] x [0, H0] in the wall plane d = 0; parts at d < -0.02 sit inside the reveal and are
shifted by (rec - rec0) in the game; u / v inside [sx0, W0 - sx0] x [sy0, H0 - sy0] stretch to the real opening, the
margins keep their size (9-slice in geometry).
Tint masks (second UV set, u = mask / 2): 0 baked colour, 1 tint A (trim), 2 tint B (accent / door).
Tinted parts are baked on a 0.8 grey paint; the game multiplies the vertex colour tint / 0.8.
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
RES = arg('--res', 3072)
SAMPLES = arg('--samples', 64)
GRID = 7
PI = math.pi


# ------------------------------------------------------------------ materials
def M_bump(name, color, rough=0.5, metal=0.0, kind='noise', scale=40.0, strength=0.35, dist=0.004, var=0.08, lin=False):
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    c = L.hexc(color) if isinstance(color, str) else (color if lin else tuple(L.srgb_to_lin(color)))
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
        elif kind in ('wave', 'wavex'):
            t = nt.nodes.new('ShaderNodeTexWave'); t.wave_type = 'BANDS'; t.bands_direction = 'Z' if kind == 'wave' else 'X'; t.wave_profile = 'SIN'
            t.inputs['Scale'].default_value = scale
            nt.links.new(tc.outputs['Object'], t.inputs['Vector']); h = t.outputs['Fac']
        else:  # voronoi (leaves)
            t = nt.nodes.new('ShaderNodeTexVoronoi'); t.inputs['Scale'].default_value = scale
            nt.links.new(tc.outputs['Object'], t.inputs['Vector']); h = t.outputs['Distance']
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = strength; b.inputs['Distance'].default_value = dist
        nt.links.new(h, b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    L._MATS[name] = m
    m['hb_metal'] = metal
    return m


def mats():
    K = {}
    K['paint'] = M_bump('f_paint', (0.8, 0.8, 0.8), rough=0.45, kind='noise', scale=70, strength=0.08, var=0.04, lin=True)
    K['iron'] = M_bump('f_iron', '#17181a', rough=0.5, metal=0.6, kind='noise', scale=60, strength=0.2, var=0.2)
    K['galv'] = M_bump('f_galv', '#8d9395', rough=0.4, metal=0.75, kind='noise', scale=20, strength=0.1, var=0.15)
    K['alu'] = M_bump('f_alu', '#a9adb0', rough=0.32, metal=0.85, kind='noise', scale=30, strength=0.05, var=0.06)
    K['steel'] = M_bump('f_steel', '#1f2622', rough=0.5, metal=0.55, kind='noise', scale=40, strength=0.2, var=0.15)
    K['stone'] = L.MT('f_stone', 'concrete', tint='#c9bca0', scale=1.4)
    K['conc'] = L.MT('f_conc', 'concrete', tint='#aaa69c', scale=1.6)
    K['terra'] = M_bump('f_terra', '#a2502f', rough=0.62, kind='noise', scale=45, strength=0.3, var=0.22)
    K['wood'] = L.MT('f_wood', 'wood_floor', tint='#6b4a30', scale=1.2, rot=PI / 2)
    K['glass'] = M_bump('f_glass', '#0d1115', rough=0.06, metal=0.9, kind=None, var=0.03)
    K['lampglass'] = M_bump('f_lampglass', '#e8d6a8', rough=0.25, kind='noise', scale=90, strength=0.1, var=0.05)
    K['brass'] = M_bump('f_brass', '#b08a3a', rough=0.3, metal=0.9, kind='noise', scale=60, strength=0.05, var=0.1)
    K['rubber'] = M_bump('f_rubber', '#141414', rough=0.85, kind='noise', scale=30, strength=0.4, var=0.1)
    K['leaf'] = M_bump('f_leaf', '#2f4a22', rough=0.75, kind='voronoi', scale=38, strength=0.9, dist=0.02, var=0.3)
    K['leaf2'] = M_bump('f_leaf2', '#3d5a2a', rough=0.7, kind='voronoi', scale=22, strength=0.8, dist=0.02, var=0.35)
    K['soil'] = M_bump('f_soil', '#2e2419', rough=0.95, kind='noise', scale=40, strength=0.6, var=0.2)
    K['pot'] = M_bump('f_pot', '#9c5634', rough=0.7, kind='noise', scale=50, strength=0.15, var=0.15)
    K['roll'] = M_bump('f_roll', '#9ea3a5', rough=0.42, metal=0.65, kind='wave', scale=38, strength=0.9, dist=0.012, var=0.18)
    K['dark'] = M_bump('f_dark', '#0b0b0c', rough=0.9, kind=None, var=0.02)
    K['meter'] = M_bump('f_meter', '#7b7f7a', rough=0.45, metal=0.3, kind='noise', scale=25, strength=0.1, var=0.15)
    # front-yard planting (per-leaf colour variation + flower speckle baked into the albedo)
    K['agave'] = M_flora('f_agave', '#7f9e93', '#5f8277', None, 0.0, scale=9)
    K['succ'] = M_flora('f_succ', '#9fb49a', '#c49aa8', '#d8c27a', 0.18, scale=26)
    K['succ2'] = M_flora('f_succ2', '#6f8a4a', '#9aa85a', '#c2503a', 0.12, scale=18)
    K['shrub'] = M_flora('f_shrub', '#2f4c26', '#46642e', None, 0.0, scale=40)
    K['hydr'] = M_flora('f_hydr', '#32502a', '#3f5c2c', '#8aa6d8', 0.5, scale=30, flower2='#d88ab0')
    K['bougain'] = M_flora('f_bougain', '#2e4a22', '#3c5a28', '#c8206e', 0.68, scale=36, flower2='#e04090')
    K['flowers'] = M_flora('f_flowers', '#35542a', '#476a30', '#e8e0d8', 0.55, scale=48, flower2='#c8387a', flower3='#f0b030')
    K['gravel'] = M_bump('f_gravel', '#8f877a', rough=0.95, kind='voronoi', scale=90, strength=0.7, dist=0.01, var=0.3)
    K['mulch'] = M_bump('f_mulch', '#4a3322', rough=0.95, kind='voronoi', scale=70, strength=0.8, dist=0.01, var=0.35)
    K['bark'] = M_bump('f_bark', '#4d3f33', rough=0.9, kind='wave', scale=30, strength=0.6, dist=0.01, var=0.2)
    K['bin_k'] = M_bump('f_bin_k', '#1b1c1d', rough=0.55, kind='noise', scale=50, strength=0.1, var=0.08)
    K['bin_b'] = M_bump('f_bin_b', '#1d4a8c', rough=0.5, kind='noise', scale=50, strength=0.1, var=0.08)
    K['bin_g'] = M_bump('f_bin_g', '#2f6b2c', rough=0.5, kind='noise', scale=50, strength=0.1, var=0.08)
    K['plaque'] = M_bump('f_plaque', '#e8e2d4', rough=0.5, kind='noise', scale=80, strength=0.05, var=0.05)
    K['tyre'] = M_bump('f_tyre', '#121212', rough=0.8, kind='noise', scale=80, strength=0.3, var=0.06)
    for mt in K.values():
        if 'hb_metal' not in mt:
            mt['hb_metal'] = 0.0
    return K


def M_flora(name, leafA, leafB, flower, amt, scale=30.0, flower2=None, flower3=None):
    """foliage: voronoi cells = leaves (colour between leafA / leafB per cell), a second voronoi = flower heads
    (amt = share of cells in flower, colours flower / flower2 / flower3 per cell), bump from the cell distance."""
    if name in L._MATS:
        return L._MATS[name]
    m = bpy.data.materials.new(name)
    nt = L._nt(m)
    p = L.principled(nt)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    v1 = nt.nodes.new('ShaderNodeTexVoronoi'); v1.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], v1.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(v1.outputs['Color'], sep.inputs['Color'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs[6].default_value = L.hexc(leafA) + (1.0,); mix.inputs[7].default_value = L.hexc(leafB) + (1.0,)
    nt.links.new(sep.outputs[0], mix.inputs['Factor'])
    # darker leaf edges (cell borders)
    edge = nt.nodes.new('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = 0.0; edge.inputs['From Max'].default_value = 0.35
    edge.inputs['To Min'].default_value = 0.55; edge.inputs['To Max'].default_value = 1.0
    nt.links.new(v1.outputs['Distance'], edge.inputs['Value'])
    shade = nt.nodes.new('ShaderNodeMix'); shade.data_type = 'RGBA'; shade.blend_type = 'MULTIPLY'; shade.inputs['Factor'].default_value = 1.0
    nt.links.new(mix.outputs[2], shade.inputs[6]); nt.links.new(edge.outputs['Result'], shade.inputs[7])
    out = shade.outputs[2]
    if flower and amt > 0:
        v2 = nt.nodes.new('ShaderNodeTexVoronoi'); v2.inputs['Scale'].default_value = scale * 0.55
        nt.links.new(tc.outputs['Object'], v2.inputs['Vector'])
        s2 = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(v2.outputs['Color'], s2.inputs['Color'])
        gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'LESS_THAN'; gt.inputs[1].default_value = amt
        nt.links.new(s2.outputs[1], gt.inputs[0])
        fc = nt.nodes.new('ShaderNodeMix'); fc.data_type = 'RGBA'
        f2 = flower2 or flower
        fc.inputs[6].default_value = L.hexc(flower) + (1.0,); fc.inputs[7].default_value = L.hexc(f2) + (1.0,)
        nt.links.new(s2.outputs[2], fc.inputs['Factor'])
        fcol = fc.outputs[2]
        if flower3:
            gt3 = nt.nodes.new('ShaderNodeMath'); gt3.operation = 'GREATER_THAN'; gt3.inputs[1].default_value = 0.7
            nt.links.new(s2.outputs[0], gt3.inputs[0])
            f3 = nt.nodes.new('ShaderNodeMix'); f3.data_type = 'RGBA'; f3.inputs[7].default_value = L.hexc(flower3) + (1.0,)
            nt.links.new(fcol, f3.inputs[6]); nt.links.new(gt3.outputs[0], f3.inputs['Factor']); fcol = f3.outputs[2]
        # petals: lighter centres of the flower cells
        pe = nt.nodes.new('ShaderNodeMapRange'); pe.inputs['From Min'].default_value = 0.0; pe.inputs['From Max'].default_value = 0.5
        pe.inputs['To Min'].default_value = 1.1; pe.inputs['To Max'].default_value = 0.7
        nt.links.new(v2.outputs['Distance'], pe.inputs['Value'])
        fm = nt.nodes.new('ShaderNodeMix'); fm.data_type = 'RGBA'; fm.blend_type = 'MULTIPLY'; fm.inputs['Factor'].default_value = 1.0
        nt.links.new(fcol, fm.inputs[6]); nt.links.new(pe.outputs['Result'], fm.inputs[7])
        fin = nt.nodes.new('ShaderNodeMix'); fin.data_type = 'RGBA'
        nt.links.new(out, fin.inputs[6]); nt.links.new(fm.outputs[2], fin.inputs[7]); nt.links.new(gt.outputs[0], fin.inputs['Factor'])
        out = fin.outputs[2]
    nt.links.new(out, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.72
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.9; b.inputs['Distance'].default_value = 0.02
    nt.links.new(v1.outputs['Distance'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    L._MATS[name] = m
    m['hb_metal'] = 0.0
    return m


# ------------------------------------------------------------------ builder in wall coords
def V(u, v, d):
    return (u, -d, v)


class P3:
    """faces in wall coords with a wanted normal (winding fixed to match), a material slot and a tint mask."""
    def __init__(self):
        self.mb = MB()

    def face(self, pts, n, m=0, k=0):
        vs = self.mb.verts([V(*p) for p in pts])
        f = self.mb.bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(Vector(V(*n))) < 0:
            f.normal_flip()
        self.mb._fin([f], (k / 2.0, 0.0, 0.0), m)
        return f

    def box(self, u0, u1, v0, v1, d0, d1, m=0, k=0, faces=63):
        if faces & 1: self.face([(u0, v0, d1), (u1, v0, d1), (u1, v1, d1), (u0, v1, d1)], (0, 0, 1), m, k)
        if faces & 2: self.face([(u1, v0, d0), (u0, v0, d0), (u0, v1, d0), (u1, v1, d0)], (0, 0, -1), m, k)
        if faces & 4: self.face([(u1, v0, d1), (u1, v0, d0), (u1, v1, d0), (u1, v1, d1)], (1, 0, 0), m, k)
        if faces & 8: self.face([(u0, v0, d0), (u0, v0, d1), (u0, v1, d1), (u0, v1, d0)], (-1, 0, 0), m, k)
        if faces & 16: self.face([(u0, v1, d0), (u0, v1, d1), (u1, v1, d1), (u1, v1, d0)], (0, 1, 0), m, k)
        if faces & 32: self.face([(u0, v0, d0), (u1, v0, d0), (u1, v0, d1), (u0, v0, d1)], (0, -1, 0), m, k)

    def ext(self, prof, u0, u1, m=0, k=0, caps=3):
        """profile [(d, v), ...] listed from the wall bottom, outward, up and back to the wall; extruded along u."""
        n = len(prof)
        for i in range(n - 1):
            (da, va), (db, vb) = prof[i], prof[i + 1]
            if abs(da - db) < 1e-7 and abs(va - vb) < 1e-7:
                continue
            nu = Vector((0, -(db - da), (vb - va)))     # (u, v, d) normal of the strip, see Frame.extrude
            self.face([(u0, va, da), (u1, va, da), (u1, vb, db), (u0, vb, db)], (0, nu.y, nu.z), m, k)
        if caps & 1:
            self.face([(u0, v, d) for d, v in prof], (-1, 0, 0), m, k)
        if caps & 2:
            self.face([(u1, v, d) for d, v in prof], (1, 0, 0), m, k)

    def hcyl(self, p0, p1, r, up, n=6, m=0, k=0, caps=True):
        """half cylinder (barrel tile) from p0 to p1 (wall coords), bulging toward `up`."""
        p0, p1, up = Vector(p0), Vector(p1), Vector(up)
        ax = (p1 - p0).normalized()
        side = ax.cross(up).normalized(); upn = side.cross(ax).normalized()
        if upn.dot(up) < 0:
            upn = -upn
        ring = [side * math.cos(PI * i / n) * r + upn * math.sin(PI * i / n) * r for i in range(n + 1)]
        for i in range(n):
            a, b = ring[i], ring[i + 1]
            mid = (a + b) * 0.5
            self.face([tuple(p0 + a), tuple(p1 + a), tuple(p1 + b), tuple(p0 + b)], tuple(mid), m, k)
        if caps:
            self.face([tuple(p1 + q) for q in ring], tuple(ax), m, k)
            self.face([tuple(p0 + q) for q in ring], tuple(-ax), m, k)

    def cylv(self, cu, cd, v0, v1, r, n=10, m=0, k=0, top=True):
        """vertical cylinder at (u, d)."""
        pts = [(cu + r * math.cos(2 * PI * i / n), cd + r * math.sin(2 * PI * i / n)) for i in range(n)]
        for i in range(n):
            (ua, da), (ub, db) = pts[i], pts[(i + 1) % n]
            mu, md = (ua + ub) / 2 - cu, (da + db) / 2 - cd
            self.face([(ua, v0, da), (ub, v0, db), (ub, v1, db), (ua, v1, da)], (mu, 0, md), m, k)
        if top:
            self.face([(u, v1, d) for u, d in pts], (0, 1, 0), m, k)

    def blob(self, cu, cv, cd, ru, rv, rd, m=0, k=0, seg=8, rings=5):
        """ellipsoid (shrubs), lower half flattened."""
        rows = []
        for j in range(rings + 1):
            t = -PI / 2 + PI * j / rings
            rows.append([(cu + ru * math.cos(t) * math.cos(2 * PI * i / seg), cv + rv * math.sin(t) * (0.6 if t < 0 else 1.0), cd + rd * math.cos(t) * math.sin(2 * PI * i / seg)) for i in range(seg)])
        for j in range(rings):
            for i in range(seg):
                a, b, c, d = rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]
                if j == 0:
                    self.face([a, c, d], tuple(Vector(c) - Vector((cu, cv, cd))), m, k)
                elif j == rings - 1:
                    self.face([a, b, d], tuple(Vector(a) - Vector((cu, cv, cd))), m, k)
                else:
                    ctr = (Vector(a) + Vector(c)) * 0.5 - Vector((cu, cv, cd))
                    self.face([a, b, c, d], tuple(ctr), m, k)


# ------------------------------------------------------------------ pieces
PIECES = []
def piece(name, open_=None, rec0=0.0, sx=0.1, sy=0.1):
    def deco(fn):
        PIECES.append((name, fn, {'open': open_, 'rec0': rec0, 'sx': sx, 'sy': sy}))
        return fn
    return deco


def jambs(p, W, H, rec, k=1, head=True):
    p.box(0, 0.03, 0, H, -rec, 0, k=k, faces=4)
    p.box(W - 0.03, W, 0, H, -rec, 0, k=k, faces=8)
    if head:
        p.box(0, W, H - 0.03, H, -rec, 0, k=k, faces=32)


def dh_sashes(p, W, H, rec, k=1, horns=False, muntins=0, m=0):
    """double-hung: upper sash outboard, lower sash inboard, meeting rail at mid height."""
    ym = H * 0.5
    s = 0.055
    d1 = -rec + 0.075; d0 = -rec + 0.04                  # upper sash plane
    e1 = -rec + 0.04; e0 = -rec + 0.012                  # lower sash plane
    # upper sash
    p.box(0.03, 0.03 + s, ym - (0.09 if horns else 0.0), H - 0.03, d0, d1, m=m, k=k, faces=1 | 4 | 8 | 32)
    p.box(W - 0.03 - s, W - 0.03, ym - (0.09 if horns else 0.0), H - 0.03, d0, d1, m=m, k=k, faces=1 | 4 | 8 | 32)
    p.box(0.03 + s, W - 0.03 - s, H - 0.03 - s, H - 0.03, d0, d1, m=m, k=k, faces=1 | 32)
    p.box(0.03 + s, W - 0.03 - s, ym, ym + 0.045, d0, d1, m=m, k=k, faces=1 | 16 | 32)
    # lower sash
    p.box(0.03, 0.03 + s, 0.0, ym + 0.02, e0, e1, m=m, k=k, faces=1 | 4 | 8 | 16)
    p.box(W - 0.03 - s, W - 0.03, 0.0, ym + 0.02, e0, e1, m=m, k=k, faces=1 | 4 | 8 | 16)
    p.box(0.03 + s, W - 0.03 - s, 0.0, 0.09, e0, e1, m=m, k=k, faces=1 | 16)
    p.box(0.03 + s, W - 0.03 - s, ym - 0.03, ym + 0.02, e0, e1, m=m, k=k, faces=1 | 16 | 32)
    for q in range(1, muntins + 1):                       # upper-sash muntins ("3 over 1")
        u = W * q / (muntins + 1)
        p.box(u - 0.014, u + 0.014, ym + 0.045, H - 0.03 - s, d0, d1 - 0.012, m=m, k=k, faces=1 | 4 | 8)


@piece('win_vic', open_=(0.95, 2.2), rec0=0.14, sx=0.12, sy=0.12)
def p_win_vic(K):
    """Italianate double-hung window: flat casing with backband, frieze + moulded hood on brackets (accent),
    sill with ears and apron, painted jamb liners, horned sashes."""
    W, H, R = 0.95, 2.2, 0.14
    p = P3()
    for (a, b) in ((-0.15, 0.0), (W, W + 0.15)):
        p.box(a, b, -0.02, H, 0, 0.028, k=1, faces=1 | 16)
    p.box(-0.18, -0.15, -0.02, H + 0.2, 0, 0.05, k=1, faces=1 | 4 | 8 | 16)
    p.box(W + 0.15, W + 0.18, -0.02, H + 0.2, 0, 0.05, k=1, faces=1 | 4 | 8 | 16)
    p.box(-0.15, W + 0.15, H, H + 0.2, 0, 0.028, k=1, faces=1 | 32)
    p.ext([(0.0, H + 0.2), (0.07, H + 0.2), (0.07, H + 0.23), (0.12, H + 0.27), (0.15, H + 0.29), (0.15, H + 0.35), (0.12, H + 0.37), (0.0, H + 0.37)], -0.3, W + 0.3, k=2)
    for u in (-0.27, W + 0.19):
        p.ext([(0.0, H + 0.02), (0.03, H + 0.02), (0.05, H + 0.1), (0.07, H + 0.15), (0.07, H + 0.2), (0.0, H + 0.2)], u, u + 0.08, k=2)
    p.box(-0.24, W + 0.24, -0.07, 0.0, -R, 0.09, k=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(-0.12, W + 0.12, -0.3, -0.07, 0, 0.025, k=1, faces=1 | 4 | 8 | 32)
    for (a, b) in ((-0.21, -0.12), (W + 0.12, W + 0.21)):
        p.ext([(0.0, -0.24), (0.035, -0.2), (0.05, -0.12), (0.05, -0.07), (0.0, -0.07)], a, b, k=1)
    jambs(p, W, H, R)
    dh_sashes(p, W, H, R, horns=True)
    return p.mb, [K['paint']]


@piece('win_edw', open_=(1.0, 1.9), rec0=0.14, sx=0.12, sy=0.12)
def p_win_edw(K):
    """Edwardian / Craftsman double-hung (3 over 1): flat casing, drip-cap head, sill + apron."""
    W, H, R = 1.0, 1.9, 0.14
    p = P3()
    p.box(-0.11, 0.0, -0.02, H, 0, 0.03, k=1, faces=1 | 8 | 16)
    p.box(W, W + 0.11, -0.02, H, 0, 0.03, k=1, faces=1 | 4 | 16)
    p.box(-0.14, W + 0.14, H, H + 0.16, 0, 0.035, k=1, faces=1 | 4 | 8 | 32)
    p.ext([(0.0, H + 0.16), (0.07, H + 0.16), (0.07, H + 0.19), (0.05, H + 0.22), (0.0, H + 0.23)], -0.17, W + 0.17, k=1)
    p.box(-0.17, W + 0.17, -0.06, 0.0, -R, 0.075, k=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(-0.09, W + 0.09, -0.2, -0.06, 0, 0.022, k=1, faces=1 | 4 | 8 | 32)
    jambs(p, W, H, R)
    dh_sashes(p, W, H, R, muntins=2)
    return p.mb, [K['paint']]


@piece('win_bay', open_=(0.9, 1.9), rec0=0.08, sx=0.08, sy=0.1)
def p_win_bay(K):
    """bay-window unit: narrow casing, sill, 1 over 1 sashes (the bay facets leave little wall)."""
    W, H, R = 0.9, 1.9, 0.08
    p = P3()
    p.box(-0.06, 0.0, -0.02, H + 0.06, 0, 0.025, k=1, faces=1 | 8 | 16)
    p.box(W, W + 0.06, -0.02, H + 0.06, 0, 0.025, k=1, faces=1 | 4 | 16)
    p.box(-0.06, W + 0.06, H, H + 0.08, 0, 0.03, k=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(-0.09, W + 0.09, -0.05, 0.0, -R, 0.06, k=1, faces=1 | 4 | 8 | 16 | 32)
    jambs(p, W, H, R)
    dh_sashes(p, W, H, R)
    return p.mb, [K['paint']]


@piece('win_stucco', open_=(1.6, 1.6), rec0=0.12, sx=0.36, sy=0.1)
def p_win_stucco(K):
    """Sunset / Marina picture window: raised surround band, sloped sill, steel casement frame
    (narrow side lites with horizontal muntins, fixed centre)."""
    W, H, R = 1.6, 1.6, 0.12
    p = P3()
    p.box(-0.1, 0.0, -0.08, H + 0.1, 0, 0.025, k=1, faces=1 | 8 | 16 | 32)
    p.box(W, W + 0.1, -0.08, H + 0.1, 0, 0.025, k=1, faces=1 | 4 | 16 | 32)
    p.box(0.0, W, H, H + 0.1, 0, 0.025, k=1, faces=1 | 16)
    p.ext([(-R, 0.0), (-R, -0.005), (0.06, -0.06), (0.07, -0.06), (0.07, -0.09), (0.0, -0.09)], -0.12, W + 0.12, k=1, caps=3)
    jambs(p, W, H, R, k=1)
    d0, d1 = -R + 0.015, -R + 0.055
    fw = 0.045
    p.box(0.03, W - 0.03, 0.0, fw, d0, d1, m=1, faces=1 | 16)
    p.box(0.03, W - 0.03, H - 0.03 - fw, H - 0.03, d0, d1, m=1, faces=1 | 32)
    p.box(0.03, 0.03 + fw, fw, H - 0.03 - fw, d0, d1, m=1, faces=1 | 4)
    p.box(W - 0.03 - fw, W - 0.03, fw, H - 0.03 - fw, d0, d1, m=1, faces=1 | 8)
    for u in (0.36, W - 0.36):
        p.box(u - 0.03, u + 0.03, fw, H - 0.03 - fw, d0, d1 + 0.01, m=1, faces=1 | 4 | 8)
        for q in range(1, 4):
            y = H * q / 4
            a, b = (0.03 + fw, u - 0.03) if u < W / 2 else (u + 0.03, W - 0.03 - fw)
            p.box(a, b, y - 0.012, y + 0.012, d0, d1 - 0.01, m=1, faces=1 | 16 | 32)
    return p.mb, [K['paint'], K['steel']]


@piece('win_modern', open_=(1.2, 1.4), rec0=0.1, sx=0.1, sy=0.1)
def p_win_modern(K):
    """aluminium slider, concrete sill."""
    W, H, R = 1.2, 1.4, 0.1
    p = P3()
    d0, d1 = -R + 0.01, -R + 0.06
    fw = 0.045
    p.box(0, W, 0, fw, d0, d1, m=0, faces=1 | 16)
    p.box(0, W, H - fw, H, d0, d1, m=0, faces=1 | 32)
    p.box(0, fw, fw, H - fw, d0, d1, m=0, faces=1 | 4)
    p.box(W - fw, W, fw, H - fw, d0, d1, m=0, faces=1 | 8)
    p.box(W / 2 - 0.03, W / 2 + 0.03, fw, H - fw, d0 + 0.01, d1 + 0.005, m=0, faces=1 | 4 | 8)
    p.box(-0.05, W + 0.05, -0.05, 0.0, -R, 0.04, m=1, faces=1 | 4 | 8 | 16 | 32)
    jambs(p, W, H, R, k=0)
    return p.mb, [K['alu'], K['conc']]


@piece('win_loft', open_=(1.8, 2.4), rec0=0.3, sx=0.1, sy=0.1)
def p_win_loft(K):
    """industrial steel multi-lite window (4 x 5 lites, hopper band), stone sill."""
    W, H, R = 1.8, 2.4, 0.3
    p = P3()
    d0, d1 = -R + 0.01, -R + 0.06
    fw = 0.055
    p.box(0, W, 0, fw, d0, d1, faces=1 | 16)
    p.box(0, W, H - fw, H, d0, d1, faces=1 | 32)
    p.box(0, fw, fw, H - fw, d0, d1, faces=1 | 4)
    p.box(W - fw, W, fw, H - fw, d0, d1, faces=1 | 8)
    for q in range(1, 4):
        u = W * q / 4
        p.box(u - 0.016, u + 0.016, fw, H - fw, d0, d1 - 0.01, faces=1 | 4 | 8)
    for q in range(1, 5):
        v = H * q / 5
        p.box(fw, W - fw, v - 0.016, v + 0.016, d0, d1 - 0.01, faces=1 | 16 | 32)
    p.box(fw, W - fw, H * 0.4 - 0.03, H * 0.4 + 0.03, d0, d1 + 0.02, faces=1 | 16 | 32)
    p.box(-0.12, W + 0.12, -0.1, 0.0, -R * 0.6, 0.07, m=1, faces=1 | 4 | 8 | 16 | 32)
    return p.mb, [K['steel'], K['stone']]


@piece('win_brick', open_=(1.0, 1.9), rec0=0.2, sx=0.12, sy=0.12)
def p_win_brick(K):
    """masonry window: stone lintel with keystone, stone sill, painted double-hung sashes."""
    W, H, R = 1.0, 1.9, 0.2
    p = P3()
    p.box(-0.16, W + 0.16, H, H + 0.3, 0, 0.035, m=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(W / 2 - 0.12, W / 2 + 0.12, H - 0.04, H + 0.36, 0, 0.07, m=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(-0.12, W + 0.12, -0.11, 0.0, -R * 0.6, 0.08, m=1, faces=1 | 4 | 8 | 16 | 32)
    jambs(p, W, H, R, k=1)
    dh_sashes(p, W, H, R)
    return p.mb, [K['paint'], K['stone']]


@piece('win_arch', open_=(1.0, 2.3), rec0=0.16, sx=0.0, sy=0.12)
def p_win_arch(K):
    """round-headed window (Italianate / loft): archivolt with keystone, casing, sill, sashes with an arched top."""
    W, H, R = 1.0, 2.3, 0.16
    r = W / 2; cy = H - r; n = 10
    p = P3()
    for i in range(n):                                   # archivolt + arched jamb liner
        a0, a1 = PI - PI * i / n, PI - PI * (i + 1) / n
        i0 = (r + r * math.cos(a0), cy + r * math.sin(a0)); i1 = (r + r * math.cos(a1), cy + r * math.sin(a1))
        o0 = (r + (r + 0.13) * math.cos(a0), cy + (r + 0.13) * math.sin(a0)); o1 = (r + (r + 0.13) * math.cos(a1), cy + (r + 0.13) * math.sin(a1))
        p.face([(i0[0], i0[1], 0.04), (o0[0], o0[1], 0.04), (o1[0], o1[1], 0.04), (i1[0], i1[1], 0.04)], (0, 0, 1), k=1)
        p.face([(o0[0], o0[1], 0.0), (o0[0], o0[1], 0.04), (o1[0], o1[1], 0.04), (o1[0], o1[1], 0.0)], (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0), k=1)
        p.face([(i0[0], i0[1], -R), (i1[0], i1[1], -R), (i1[0], i1[1], 0.04), (i0[0], i0[1], 0.04)], (-math.cos((a0 + a1) / 2), -math.sin((a0 + a1) / 2), 0), k=1)
        # sash head ring
        s0 = (r + (r - 0.06) * math.cos(a0), cy + (r - 0.06) * math.sin(a0)); s1 = (r + (r - 0.06) * math.cos(a1), cy + (r - 0.06) * math.sin(a1))
        p.face([(s0[0], s0[1], -R + 0.06), (i0[0], i0[1], -R + 0.06), (i1[0], i1[1], -R + 0.06), (s1[0], s1[1], -R + 0.06)], (0, 0, 1), k=1)
    p.box(W / 2 - 0.08, W / 2 + 0.08, H - 0.06, H + 0.2, 0, 0.08, k=2, faces=1 | 4 | 8 | 16)
    p.box(-0.13, 0.0, -0.02, cy, 0, 0.04, k=1, faces=1 | 8 | 16)
    p.box(W, W + 0.13, -0.02, cy, 0, 0.04, k=1, faces=1 | 4 | 16)
    p.box(-0.2, W + 0.2, -0.07, 0.0, -R, 0.08, k=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(0, 0.03, 0, cy, -R, 0, k=1, faces=4)
    p.box(W - 0.03, W, 0, cy, -R, 0, k=1, faces=8)
    s = 0.055
    e0, e1 = -R + 0.012, -R + 0.06
    p.box(0.0, s, 0.0, cy, e0, e1, k=1, faces=1 | 4 | 8)
    p.box(W - s, W, 0.0, cy, e0, e1, k=1, faces=1 | 4 | 8)
    p.box(s, W - s, 0.0, 0.09, e0, e1, k=1, faces=1 | 16)
    p.box(s, W - s, cy * 0.55, cy * 0.55 + 0.05, e0, e1 + 0.015, k=1, faces=1 | 16 | 32)
    p.box(s, W - s, cy - 0.03, cy + 0.02, e0, e1, k=1, faces=1 | 16 | 32)
    return p.mb, [K['paint']]


@piece('door_vic', open_=(1.0, 2.15), rec0=0.0, sx=0.14, sy=0.14)
def p_door_vic(K):
    """panelled front door: two glazed upper lites, two raised lower panels, brass knob / slot / kick plate,
    thin painted frame. Leaf plane d = 0."""
    W, H = 1.0, 2.15
    p = P3()
    p.box(-0.07, 0.0, 0, H + 0.07, -0.03, 0.03, k=1, faces=1 | 4 | 8 | 16)
    p.box(W, W + 0.07, 0, H + 0.07, -0.03, 0.03, k=1, faces=1 | 4 | 8 | 16)
    p.box(0.0, W, H, H + 0.07, -0.03, 0.03, k=1, faces=1 | 32 | 16)
    st = 0.13
    p.box(0, st, 0, H, -0.02, 0.0, k=2, faces=1 | 8 | 4)
    p.box(W - st, W, 0, H, -0.02, 0.0, k=2, faces=1 | 4 | 8)
    p.box(st, W - st, H - 0.14, H, -0.02, 0.0, k=2, faces=1 | 32)
    p.box(st, W - st, 0, 0.24, -0.02, 0.0, k=2, faces=1 | 16)
    p.box(st, W - st, 0.9, 1.08, -0.02, 0.0, k=2, faces=1 | 16 | 32)
    p.box(W / 2 - 0.05, W / 2 + 0.05, 0.24, H - 0.14, -0.02, 0.0, k=2, faces=1 | 4 | 8)
    for (a, b) in ((st, W / 2 - 0.05), (W / 2 + 0.05, W - st)):
        p.box(a, b, 1.08, H - 0.14, -0.045, -0.035, m=1, faces=1)                      # glass
        p.box(a + 0.03, b - 0.03, 0.3, 0.84, -0.02, -0.005, k=2, faces=1 | 4 | 8 | 16 | 32)   # raised panel
        p.box(a, b, 0.24, 0.9, -0.03, -0.02, k=2, faces=1)
    p.box(W - st + 0.03, W - st + 0.09, 0.95, 1.03, 0.0, 0.06, m=2, faces=63)                # knob rosette
    p.box(W / 2 - 0.14, W / 2 + 0.14, 0.95, 1.0, 0.0, 0.008, m=2, faces=1 | 16 | 32)       # mail slot
    p.box(0.02, W - 0.02, 0.0, 0.2, 0.0, 0.004, m=2, faces=1 | 16)                          # kick plate
    return p.mb, [K['paint'], K['glass'], K['brass']]


@piece('door_modern', open_=(0.95, 2.1), rec0=0.0, sx=0.14, sy=0.14)
def p_door_modern(K):
    """mid-century flush door with three stepped lites and a bar pull (Sunset / Marina)."""
    W, H = 0.95, 2.1
    p = P3()
    p.box(-0.06, 0.0, 0, H + 0.06, -0.03, 0.03, k=1, faces=1 | 4 | 8 | 16)
    p.box(W, W + 0.06, 0, H + 0.06, -0.03, 0.03, k=1, faces=1 | 4 | 8 | 16)
    p.box(0.0, W, H, H + 0.06, -0.03, 0.03, k=1, faces=1 | 32 | 16)
    p.box(0, W, 0, H, -0.02, 0.0, k=2, faces=1)
    for q in range(3):
        u = 0.28 + q * 0.12; v = 1.25 + q * 0.18
        p.box(u, u + 0.14, v, v + 0.14, -0.03, -0.008, m=1, faces=1)
        p.box(u - 0.02, u + 0.16, v - 0.02, v + 0.16, -0.02, 0.006, k=2, faces=4 | 8 | 16 | 32)
    p.box(W - 0.16, W - 0.12, 0.85, 1.25, 0.0, 0.05, m=2, faces=63)
    return p.mb, [K['paint'], K['glass'], K['alu']]


def garage_frame(p, W, H, R, k=1):
    p.box(-0.1, 0.0, 0.0, H + 0.1, 0.0, 0.03, k=k, faces=1 | 8 | 4 | 16)
    p.box(W, W + 0.1, 0.0, H + 0.1, 0.0, 0.03, k=k, faces=1 | 4 | 8 | 16)
    p.box(0.0, W, H, H + 0.1, 0.0, 0.03, k=k, faces=1 | 32 | 16)
    jambs(p, W, H, R, k=k)
    p.box(0.0, W, 0.0, H, -R - 0.05, -R - 0.04, m=1, faces=1)                  # dark backer


@piece('garage_sect', open_=(2.5, 2.2), rec0=0.2, sx=0.1, sy=0.0)
def p_garage_sect(K):
    """sectional garage door: 4 sections of raised panels, handle, bottom seal, painted frame."""
    W, H, R = 2.5, 2.2, 0.2
    p = P3()
    garage_frame(p, W, H, R)
    sh = (H - 0.02) / 4
    for s in range(4):
        y0 = 0.02 + s * sh
        p.box(0.03, W - 0.03, y0 + 0.006, y0 + sh - 0.006, -R, -R + 0.04, k=1, faces=1 | 16 | 32)
        for q in range(4):
            u0 = 0.1 + q * (W - 0.2) / 4
            p.box(u0 + 0.03, u0 + (W - 0.2) / 4 - 0.03, y0 + 0.1, y0 + sh - 0.1, -R + 0.04, -R + 0.055, k=1, faces=1 | 4 | 8 | 16 | 32)
    p.box(0.03, W - 0.03, 0.0, 0.03, -R, -R + 0.05, m=2, faces=1 | 16)
    p.box(W / 2 - 0.1, W / 2 + 0.1, 0.62, 0.66, -R + 0.04, -R + 0.08, m=3, faces=63)
    return p.mb, [K['paint'], K['dark'], K['rubber'], K['iron']]


@piece('garage_carriage', open_=(2.5, 2.2), rec0=0.2, sx=0.1, sy=0.0)
def p_garage_carriage(K):
    """carriage-house garage door: vertical boards (grooves in the bake), window row, strap hinges, handles."""
    W, H, R = 2.5, 2.2, 0.2
    p = P3()
    garage_frame(p, W, H, R)
    p.box(0.03, W - 0.03, 0.02, H - 0.02, -R, -R + 0.045, m=2, faces=1)
    for q in range(4):                                                          # window row
        u0 = 0.15 + q * (W - 0.3) / 4
        p.box(u0 + 0.05, u0 + (W - 0.3) / 4 - 0.05, H - 0.55, H - 0.18, -R + 0.03, -R + 0.035, m=4, faces=1)
        p.box(u0 + 0.02, u0 + (W - 0.3) / 4 - 0.02, H - 0.58, H - 0.15, -R + 0.045, -R + 0.06, m=2, faces=4 | 8 | 16 | 32)
    p.box(W / 2 - 0.012, W / 2 + 0.012, 0.02, H - 0.02, -R + 0.045, -R + 0.05, m=1, faces=1)
    for v in (0.35, H - 0.8):
        for (a, b) in ((0.08, 0.7), (W - 0.7, W - 0.08)):
            p.box(a, b, v, v + 0.05, -R + 0.045, -R + 0.056, m=3, faces=1 | 16 | 32 | 4 | 8)
    for u in (W / 2 - 0.12, W / 2 + 0.08):
        p.box(u, u + 0.04, 0.95, 1.25, -R + 0.045, -R + 0.09, m=3, faces=63)
    return p.mb, [K['paint'], K['dark'], K['wood'], K['iron'], K['glass']]


@piece('garage_roll', open_=(2.5, 2.2), rec0=0.2, sx=0.1, sy=0.0)
def p_garage_roll(K):
    """galvanised roll-up door with guides and a bottom bar."""
    W, H, R = 2.5, 2.2, 0.2
    p = P3()
    garage_frame(p, W, H, R, k=1)
    p.box(0.03, W - 0.03, 0.06, H - 0.02, -R, -R + 0.03, m=2, faces=1)
    p.box(0.03, W - 0.03, 0.0, 0.06, -R, -R + 0.05, m=3, faces=1 | 16)
    for (a, b) in ((0.0, 0.06), (W - 0.06, W)):
        p.box(a, b, 0.0, H, -R, -R + 0.07, m=3, faces=1 | 4 | 8)
    return p.mb, [K['paint'], K['dark'], K['roll'], K['iron']]


@piece('rollup_big', open_=(3.6, 3.8), rec0=0.3, sx=0.1, sy=0.0)
def p_rollup_big(K):
    """industrial roll-up door: corrugated curtain, steel guides, hood box at the head, bollard guards."""
    W, H, R = 3.6, 3.8, 0.3
    p = P3()
    jambs(p, W, H, R, k=0)
    p.box(0.0, W, 0.0, H, -R - 0.05, -R - 0.04, m=1, faces=1)
    p.box(0.03, W - 0.03, 0.08, H - 0.02, -R, -R + 0.03, m=0, faces=1)
    p.box(0.03, W - 0.03, 0.0, 0.08, -R, -R + 0.06, m=2, faces=1 | 16)
    for (a, b) in ((0.0, 0.08), (W - 0.08, W)):
        p.box(a, b, 0.0, H, -R, -R + 0.1, m=2, faces=1 | 4 | 8)
    p.box(-0.15, W + 0.15, H, H + 0.55, 0.0, 0.38, m=2, faces=1 | 4 | 8 | 16 | 32)
    for u in (-0.35, W + 0.2):
        p.cylv(u + 0.075, 0.2, 0.0, 1.1, 0.075, n=10, m=3)
    return p.mb, [K['roll'], K['dark'], K['galv'], K['paint']]


@piece('tile_cap', sx=0.0, sy=0.0)
def p_tile_cap(K):
    """1.0 m run of clay barrel-tile coping on a 0.3 m parapet (u 0..1, v 0 = top of the wall, the wall face at d = 0)."""
    p = P3()
    p.box(0.0, 1.0, 0.0, 0.05, -0.34, 0.06, m=1, faces=1 | 16 | 32)
    for q in range(4):
        u = 0.125 + q * 0.25
        p.hcyl((u, 0.05, -0.36), (u, 0.05, 0.1), 0.11, (0, 1, 0), n=5, m=0)
    return p.mb, [K['terra'], K['conc']]


@piece('tile_pent', sx=0.0, sy=0.0)
def p_tile_pent(K):
    """1.0 m run of a Spanish-tile pent roof: slopes from the wall (v 0.55) out to d 0.6 (v 0.28) on rafter tails,
    painted fascia; barrel tiles down the slope."""
    p = P3()
    y0, y1, D = 0.55, 0.28, 0.6
    p.face([(0.0, y0, 0.0), (1.0, y0, 0.0), (1.0, y1, D), (0.0, y1, D)], (0, 1, 0.5), m=1)
    p.face([(0.0, y1 - 0.02, D), (1.0, y1 - 0.02, D), (1.0, y0 - 0.02, 0.0), (0.0, y0 - 0.02, 0.0)], (0, -1, 0), k=1)
    p.box(0.0, 1.0, y1 - 0.14, y1, D - 0.03, D, k=1, faces=1 | 32)
    for u in (0.25, 0.75):
        p.ext([(0.0, y0 - 0.16), (D - 0.05, y1 - 0.12), (D - 0.05, y1 - 0.02), (0.0, y0 - 0.02)], u - 0.03, u + 0.03, k=1)
    sl = Vector((0, y1 - y0, D)).normalized()
    upv = Vector((0, sl.z, -sl.y))
    for q in range(5):
        u = 0.1 + q * 0.2
        a = Vector((u, y0 + 0.02, -0.02)); b = Vector((u, y1 + 0.02, D + 0.06))
        p.hcyl(tuple(a), tuple(b), 0.085, tuple(upv), n=5, m=0)
    return p.mb, [K['terra'], K['dark'], K['paint']]


@piece('rail_seg', sx=0.0, sy=0.0)
def p_rail_seg(K):
    """1.0 m iron railing segment (u 0..1, v 0..0.95), pickets every 0.11 m; sheared along stairs in the game."""
    p = P3()
    p.box(0.0, 1.0, 0.9, 0.95, -0.022, 0.022, faces=1 | 2 | 16 | 32)
    p.box(0.0, 1.0, 0.07, 0.1, -0.012, 0.012, faces=1 | 2 | 16 | 32)
    for q in range(9):
        u = 0.055 + q * 0.11
        p.box(u - 0.009, u + 0.009, 0.1, 0.9, -0.009, 0.009, faces=1 | 2 | 4 | 8)
    return p.mb, [K['iron']]


@piece('newel', sx=0.0, sy=0.0)
def p_newel(K):
    p = P3()
    p.box(-0.05, 0.05, 0.0, 1.0, -0.05, 0.05, faces=1 | 2 | 4 | 8)
    p.box(-0.075, 0.075, 1.0, 1.06, -0.075, 0.075, faces=63)
    p.blob(0.0, 1.12, 0.0, 0.05, 0.06, 0.05, seg=8, rings=4)
    return p.mb, [K['iron']]


@piece('lamp_wall', sx=0.0, sy=0.0)
def p_lamp_wall(K):
    """coach lantern by the door (u centred, v 0 = bottom of the lantern); the glow is a code quad inside."""
    p = P3()
    p.box(-0.06, 0.06, -0.05, 0.3, 0.0, 0.02, faces=1 | 4 | 8 | 16 | 32)
    p.box(-0.015, 0.015, 0.12, 0.16, 0.02, 0.12, faces=1 | 4 | 8 | 16 | 32)
    for (a, b) in ((-0.09, -0.075), (0.075, 0.09)):
        for (c, e) in ((0.1, 0.115), (0.265, 0.28)):
            p.box(a, b, 0.0, 0.3, c, e, faces=1 | 2 | 4 | 8)
    p.box(-0.075, 0.075, 0.02, 0.28, 0.115, 0.265, m=1, faces=1 | 4 | 8)
    p.box(-0.1, 0.1, -0.02, 0.0, 0.09, 0.29, faces=63)
    p.face([(-0.11, 0.3, 0.08), (0.11, 0.3, 0.08), (0.11, 0.3, 0.3), (-0.11, 0.3, 0.3)], (0, -1, 0))
    for (q, n) in (([(-0.11, 0.3, 0.3), (0.11, 0.3, 0.3), (0.0, 0.4, 0.19)], (0, 0.5, 1)), ([(0.11, 0.3, 0.08), (-0.11, 0.3, 0.08), (0.0, 0.4, 0.19)], (0, 0.5, -1)),
                   ([(-0.11, 0.3, 0.08), (-0.11, 0.3, 0.3), (0.0, 0.4, 0.19)], (-1, 0.5, 0)), ([(0.11, 0.3, 0.3), (0.11, 0.3, 0.08), (0.0, 0.4, 0.19)], (1, 0.5, 0))):
        p.face(q, n)
    return p.mb, [K['iron'], K['lampglass']]


@piece('mailbox', sx=0.0, sy=0.0)
def p_mailbox(K):
    p = P3()
    p.box(-0.18, 0.18, 0.0, 0.3, 0.0, 0.11, faces=1 | 4 | 8 | 32)
    p.ext([(0.0, 0.3), (0.13, 0.31), (0.12, 0.35), (0.0, 0.37)], -0.19, 0.19)
    p.box(-0.1, 0.1, 0.1, 0.13, 0.11, 0.125, m=1, faces=63)
    return p.mb, [K['iron'], K['brass']]


@piece('meters', sx=0.0, sy=0.0)
def p_meters(K):
    """PG&E gas meter set (riser, meter, regulator) + electric meter box; u 0..0.9, v 0 = ground."""
    p = P3()
    p.cylv(0.1, 0.12, -0.1, 0.55, 0.03, n=8, m=0)
    p.box(0.08, 0.42, 0.52, 0.58, 0.09, 0.15, m=0, faces=63)
    p.box(0.18, 0.4, 0.58, 0.9, 0.04, 0.28, m=1, faces=1 | 4 | 8 | 16)
    p.cylv(0.29, 0.28, 0.66, 0.84, 0.07, n=10, m=0, top=False)
    p.cylv(0.1, 0.12, 0.58, 1.05, 0.028, n=8, m=0)
    p.box(0.02, 0.12, 1.0, 1.08, 0.0, 0.15, m=0, faces=63)
    p.box(0.52, 0.82, 0.95, 1.45, 0.0, 0.14, m=1, faces=1 | 4 | 8 | 16 | 32)
    p.cylv(0.67, 0.19, 1.12, 1.3, 0.085, n=12, m=2)
    p.cylv(0.67, 0.07, 0.0, 0.95, 0.025, n=6, m=0)
    return p.mb, [K['galv'], K['meter'], K['lampglass']]


@piece('downspout', sx=0.0, sy=0.0)
def p_downspout(K):
    """1.0 m tileable rectangular downspout (u centred, d 0.02..0.1) with a strap; the shoe is the bottom 0.3 m."""
    p = P3()
    p.box(-0.045, 0.045, 0.0, 1.0, 0.025, 0.1, k=1, faces=1 | 4 | 8)
    p.box(-0.055, 0.055, 0.45, 0.5, 0.0, 0.11, m=1, faces=1 | 4 | 8 | 16 | 32)
    return p.mb, [K['paint'], K['iron']]


@piece('planter', sx=0.0, sy=0.0)
def p_planter(K):
    """concrete planter trough 1.2 x 0.45 x 0.5 with clipped shrubs (u 0..1.2, d 0..0.45)."""
    p = P3()
    p.box(0.0, 1.2, 0.0, 0.5, 0.0, 0.45, m=0, faces=1 | 2 | 4 | 8)
    p.box(0.04, 1.16, 0.42, 0.44, 0.04, 0.41, m=2, faces=16)
    for (c, r) in ((0.25, 0.26), (0.62, 0.3), (0.97, 0.24)):
        p.blob(c, 0.55, 0.22, r, 0.28 + r * 0.3, 0.2, m=1, seg=8, rings=5)
    for (a, b) in ((0.0, 1.2),):
        p.box(a - 0.02, b + 0.02, 0.48, 0.52, -0.02, 0.47, m=0, faces=16 | 1 | 2 | 4 | 8)
    return p.mb, [K['conc'], K['leaf'], K['soil']]


@piece('pot', sx=0.0, sy=0.0)
def p_pot(K):
    p = P3()
    n = 10
    prof = [(0.12, 0.0), (0.17, 0.34), (0.19, 0.36), (0.19, 0.4)]
    for j in range(len(prof) - 1):
        (r0, v0), (r1, v1) = prof[j], prof[j + 1]
        for i in range(n):
            a0, a1 = 2 * PI * i / n, 2 * PI * (i + 1) / n
            q = [(r0 * math.cos(a0), v0, r0 * math.sin(a0)), (r0 * math.cos(a1), v0, r0 * math.sin(a1)), (r1 * math.cos(a1), v1, r1 * math.sin(a1)), (r1 * math.cos(a0), v1, r1 * math.sin(a0))]
            p.face(q, (math.cos((a0 + a1) / 2), 0.1, math.sin((a0 + a1) / 2)), m=0)
    p.blob(0.0, 0.62, 0.0, 0.26, 0.34, 0.26, m=1, seg=9, rings=5)
    return p.mb, [K['pot'], K['leaf2']]


@piece('hedge', sx=0.0, sy=0.0)
def p_hedge(K):
    """1.0 m clipped hedge run (u 0..1, v 0..1, d 0..0.6); the bevelled bake rounds it."""
    p = P3()
    # (v4) rounded, lumpy cross-section swept along u; the lumps are periodic in u so runs tile seamlessly
    prof = [(0.57, 0.0), (0.62, 0.35), (0.61, 0.75), (0.53, 0.92), (0.3, 0.97), (0.07, 0.92), (-0.01, 0.75), (-0.02, 0.35), (0.03, 0.0)]
    nu = 8
    cen = (0.3, 0.5)
    def P_(i, j):
        u = i / nu
        d, v = prof[j]
        nd, nv = d - cen[0], v - cen[1]
        l = math.hypot(nd, nv) or 1.0
        lump = 0.045 * math.sin(2 * PI * u * 2 + j * 1.3) + 0.03 * math.sin(2 * PI * u * 3 + j * 2.7 + 1.0)
        if j in (0, len(prof) - 1):
            lump *= 0.3
        return (u, v + nv / l * lump, d + nd / l * lump)
    for i in range(nu):
        for j in range(len(prof) - 1):
            a, b, c, d = P_(i, j), P_(i + 1, j), P_(i + 1, j + 1), P_(i, j + 1)
            mid = ((prof[j][0] + prof[j + 1][0]) / 2 - cen[0], (prof[j][1] + prof[j + 1][1]) / 2 - cen[1])
            p.face([a, b, c, d], (0.0, mid[1], mid[0]), m=0)
    for i, s in ((0, -1), (nu, 1)):
        p.face([P_(i, j) for j in range(len(prof))], (s, 0, 0), m=0)
    return p.mb, [K['leaf']]


@piece('gate', sx=0.0, sy=0.0)
def p_gate(K):
    """wrought-iron side-passage gate 1.0 x 1.8 (u 0..1) with finials, set 0.15 m behind the wall face."""
    p = P3()
    for (a, b) in ((0.0, 0.05), (0.95, 1.0)):
        p.box(a, b, 0.0, 1.8, -0.19, -0.14, faces=1 | 2 | 4 | 8 | 16)
    for v in (0.1, 1.55):
        p.box(0.05, 0.95, v, v + 0.04, -0.18, -0.15, faces=1 | 2 | 16 | 32)
    for q in range(8):
        u = 0.1 + q * 0.114
        p.box(u - 0.01, u + 0.01, 0.14, 1.72, -0.175, -0.155, faces=1 | 2 | 4 | 8)
        p.face([(u - 0.025, 1.72, -0.165), (u + 0.025, 1.72, -0.165), (u, 1.8, -0.165)], (0, 0, 1))
    return p.mb, [K['iron']]


@piece('dock', sx=0.0, sy=0.0)
def p_dock(K):
    """loading-dock bumpers + steel edge angle for a 3.2 m door (u 0..3.2, v 0 = dock top, d 0 = dock face)."""
    p = P3()
    p.box(0.0, 3.2, -0.06, 0.0, 0.0, 0.02, m=1, faces=1 | 16 | 32)
    p.box(0.0, 3.2, -0.01, 0.0, -0.25, 0.0, m=1, faces=16)
    for u in (0.35, 2.65):
        p.box(u, u + 0.25, -0.75, -0.05, 0.0, 0.12, m=0, faces=1 | 4 | 8 | 16 | 32)
        p.box(u + 0.03, u + 0.22, -0.7, -0.1, 0.12, 0.13, m=1, faces=1)
    return p.mb, [K['rubber'], K['galv']]


# ------------------------------------------------------------------ front yards / sidewalk life (v4)
def _hn(i, j, s=0):
    """deterministic hash noise in [-1, 1]"""
    x = math.sin(i * 12.9898 + j * 78.233 + s * 37.719) * 43758.5453
    return (x - math.floor(x)) * 2.0 - 1.0


def lumpy(p, cu, cv, cd, ru, rv, rd, m=0, k=0, seg=12, rings=7, amp=0.16, seed=0, flat=0.55, per=None):
    """irregular leafy mass: ellipsoid with low-frequency lumps (per = u period for tileable runs), flattened base."""
    rows = []
    for j in range(rings + 1):
        t = -PI / 2 + PI * j / rings
        row = []
        for i in range(seg):
            a = 2 * PI * i / seg
            n = (math.sin(a * 3 + seed) * 0.5 + math.sin(t * 4 + a * 2 + seed * 1.7) * 0.35 + _hn(i, j, seed) * 0.35) * amp
            if j in (0, rings):
                n = 0.0
            r = 1.0 + n
            x = cu + ru * math.cos(t) * math.cos(a) * r
            if per:
                x = cu + ru * math.cos(t) * math.cos(a) * (1.0 + 0.5 * n)
            y = cv + rv * math.sin(t) * (flat if t < 0 else 1.0) * r
            z = cd + rd * math.cos(t) * math.sin(a) * r
            row.append((x, y, z))
        rows.append(row)
    c = Vector((cu, cv, cd))
    for j in range(rings):
        for i in range(seg):
            a, b, cc, d = rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]
            if j == 0:
                p.face([a, cc, d], tuple(Vector(cc) - c), m, k)
            elif j == rings - 1:
                p.face([a, b, d], tuple(Vector(a) - c), m, k)
            else:
                p.face([a, b, cc, d], tuple((Vector(a) + Vector(cc)) * 0.5 - c), m, k)


def leaf(p, base, az, el0, droop, L_, w0, th=0.02, seg=4, m=0, k=0, cup=0.35, under=True):
    """one fleshy leaf (agave / aloe / echeveria): tapered, curving strip with a cupped upper face and a keel."""
    pts = []
    for s in range(seg + 1):
        t = s / seg
        el = el0 - droop * t * t
        pts.append(t)
    ca, sa = math.cos(az), math.sin(az)
    pos = [Vector(base)]
    for s in range(1, seg + 1):
        t0, t1 = (s - 1) / seg, s / seg
        el = el0 - droop * ((t0 + t1) / 2) ** 2
        step = L_ / seg
        dirv = Vector((ca * math.cos(el), math.sin(el), sa * math.cos(el)))
        pos.append(pos[-1] + dirv * step)
    side = Vector((-sa, 0.0, ca))
    rim, keel = [], []
    for s in range(seg + 1):
        t = s / seg
        w = w0 * (1.0 - t) ** 0.8 * (1.0 if s < seg else 0.0) + 1e-4
        c = pos[s]
        rim.append((c - side * w * 0.5, c + side * w * 0.5))
        up = Vector((0, 1, 0))
        keel.append(c - up * th * (1.0 - t) + side * 0.0)
    for s in range(seg):
        l0, r0 = rim[s]; l1, r1 = rim[s + 1]
        c0 = pos[s] + Vector((0, th * cup * (1 - s / seg), 0)); c1 = pos[s + 1] + Vector((0, th * cup * (1 - (s + 1) / seg), 0))
        # upper face: two strips from the rims to a slightly sunken midrib (cupped)
        p.face([tuple(l0), tuple(c0 - Vector((0, th * cup, 0))), tuple(c1 - Vector((0, th * cup, 0))), tuple(l1)], (0, 1, 0), m, k)
        p.face([tuple(c0 - Vector((0, th * cup, 0))), tuple(r0), tuple(r1), tuple(c1 - Vector((0, th * cup, 0)))], (0, 1, 0), m, k)
        # underside: rims to the keel
        if not under:
            continue
        p.face([tuple(l0), tuple(l1), tuple(keel[s + 1]), tuple(keel[s])], tuple(-side + Vector((0, -1, 0))), m, k)
        p.face([tuple(r0), tuple(keel[s]), tuple(keel[s + 1]), tuple(r1)], tuple(side + Vector((0, -1, 0))), m, k)


def rosette(p, cu, cd, v0, n, L_, w0, el0, droop, m=0, seed=0, th=0.02, seg=3, whorls=2, under=True):
    for wh in range(whorls):
        for i in range(n):
            az = 2 * PI * (i + 0.5 * wh) / n + seed + _hn(i, wh, seed) * 0.15
            f = 1.0 - 0.3 * wh
            leaf(p, (cu, v0 + 0.01 * wh, cd), az, el0 + 0.35 * wh, droop, L_ * f * (1 + 0.1 * _hn(i, 3, seed)), w0 * f, th=th, seg=seg, m=m, under=under)


def tube(p, a, b, r, n=6, m=0, k=0, caps=False):
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    ref = Vector((0, 1, 0)) if abs(ax.y) < 0.9 else Vector((1, 0, 0))
    s1 = ax.cross(ref).normalized(); s2 = ax.cross(s1).normalized()
    ring = [s1 * math.cos(2 * PI * i / n) * r + s2 * math.sin(2 * PI * i / n) * r for i in range(n)]
    for i in range(n):
        q0, q1 = ring[i], ring[(i + 1) % n]
        p.face([tuple(a + q0), tuple(a + q1), tuple(b + q1), tuple(b + q0)], tuple((q0 + q1) * 0.5), m, k)
    if caps:
        p.face([tuple(b + q) for q in ring], tuple(ax), m, k)
        p.face([tuple(a + q) for q in ring], tuple(-ax), m, k)


def wheel(p, cu, cv, cd, R, w, m_tyre, m_rim, n=14, spokes=True):
    """wheel in the (u, v) plane at depth cd: tyre band + side walls, rim ring, hub."""
    ri = R - 0.035
    for i in range(n):
        a0, a1 = 2 * PI * i / n, 2 * PI * (i + 1) / n
        o0, o1 = (math.cos(a0), math.sin(a0)), (math.cos(a1), math.sin(a1))
        P_ = lambda o, r, d: (cu + o[0] * r, cv + o[1] * r, d)
        p.face([P_(o0, R, cd - w), P_(o1, R, cd - w), P_(o1, R, cd + w), P_(o0, R, cd + w)], (o0[0] + o1[0], o0[1] + o1[1], 0), m_tyre)
        for sd in (-1, 1):
            p.face([P_(o0, ri, cd + sd * w), P_(o1, ri, cd + sd * w), P_(o1, R, cd + sd * w), P_(o0, R, cd + sd * w)], (0, 0, sd), m_tyre)
            p.face([P_(o0, ri - 0.02, cd + sd * w * 0.6), P_(o1, ri - 0.02, cd + sd * w * 0.6), P_(o1, ri, cd + sd * w * 0.6), P_(o0, ri, cd + sd * w * 0.6)], (0, 0, sd), m_rim)
    if spokes:
        for i in range(0, n, 2):
            a = 2 * PI * i / n
            tube(p, (cu, cv, cd), (cu + math.cos(a) * (ri - 0.02), cv + math.sin(a) * (ri - 0.02), cd), 0.004, n=3, m=m_rim)
    p.cylv(cu, cd, cv - 0.02, cv + 0.02, 0.025, n=6, m=m_rim)


@piece('agave', sx=0.0, sy=0.0)
def p_agave(K):
    """Agave americana rosette (~1.2 m across, 0.8 m tall), centred at u = d = 0, v 0 = ground."""
    p = P3()
    for i in range(13):
        az = 2 * PI * i / 13 + _hn(i, 1) * 0.2
        leaf(p, (0, 0.05, 0), az, 0.75 + 0.35 * _hn(i, 2), 0.9, 0.55 + 0.1 * _hn(i, 3), 0.13, th=0.035, seg=5, cup=0.5)
    for i in range(6):
        az = 2 * PI * (i + 0.5) / 6
        leaf(p, (0, 0.06, 0), az, 1.2, 0.5, 0.45, 0.1, th=0.03, seg=4, cup=0.5)
    return p.mb, [K['agave']]


@piece('succulents', sx=0.0, sy=0.0)
def p_succulents(K):
    """dry garden bed 1.2 x 0.6 (u 0..1.2, d 0..0.6): gravel top on a low concrete edge, echeveria / aeonium rosettes,
    an aloe with a flower spike."""
    p = P3()
    p.box(0.0, 1.2, 0.0, 0.14, 0.0, 0.6, m=3, faces=1 | 2 | 4 | 8)
    p.box(0.03, 1.17, 0.1, 0.12, 0.03, 0.57, m=2, faces=16)
    for c, (u, d, n, L_, s) in enumerate(((0.18, 0.2, 9, 0.12, 0), (0.36, 0.42, 10, 0.14, 1), (0.62, 0.18, 9, 0.11, 0), (0.95, 0.4, 11, 0.15, 1), (1.05, 0.15, 8, 0.1, 0), (0.78, 0.46, 9, 0.12, 1))):
        rosette(p, u, d, 0.12, n, L_, 0.07, 0.35, 0.5, m=s, seed=c * 1.3, th=0.015, seg=2, whorls=2, under=False)
    # aloe
    rosette(p, 0.52, 0.36, 0.12, 8, 0.32, 0.06, 0.85, 0.7, m=1, seed=4.0, th=0.02, seg=3, whorls=1)
    tube(p, (0.52, 0.2, 0.36), (0.54, 0.75, 0.37), 0.01, n=4, m=1)
    p.blob(0.54, 0.78, 0.37, 0.03, 0.08, 0.03, m=1, seg=6, rings=3)
    return p.mb, [K['succ'], K['succ2'], K['gravel'], K['conc']]


@piece('shrub', sx=0.0, sy=0.0)
def p_shrub(K):
    """rounded evergreen shrub (pittosporum / rosemary), ~0.9 m, centred at u = d = 0."""
    p = P3()
    lumpy(p, 0.0, 0.42, 0.0, 0.48, 0.45, 0.44, m=0, seed=1.0, amp=0.18)
    lumpy(p, 0.22, 0.62, 0.05, 0.26, 0.24, 0.24, m=0, seed=2.0, seg=10, rings=6, amp=0.2)
    return p.mb, [K['shrub']]


@piece('shrub_flower', sx=0.0, sy=0.0)
def p_shrub_flower(K):
    """hydrangea-like flowering shrub ~0.8 m (blue / pink heads), centred at u = d = 0."""
    p = P3()
    lumpy(p, 0.0, 0.36, 0.0, 0.5, 0.4, 0.42, m=0, seed=3.0, amp=0.14)
    for i in range(7):
        a = 2 * PI * i / 7
        p.blob(math.cos(a) * 0.3, 0.55 + 0.12 * _hn(i, 5), math.sin(a) * 0.26, 0.13, 0.11, 0.13, m=1, seg=7, rings=4)
    return p.mb, [K['shrub'], K['hydr']]


@piece('flowerbed', sx=0.0, sy=0.0)
def p_flowerbed(K):
    """1.0 m tileable flower border (u 0..1, d 0..0.45): mulch strip + low mounds of flowers (lavender / impatiens)."""
    p = P3()
    p.box(0.0, 1.0, 0.0, 0.08, 0.0, 0.45, m=1, faces=1 | 16)
    for i, u in enumerate((0.17, 0.5, 0.83)):
        lumpy(p, u, 0.1, 0.22 + 0.05 * _hn(i, 7), 0.2, 0.2, 0.17, m=0, seg=9, rings=5, seed=i * 2.1, amp=0.2)
    return p.mb, [K['flowers'], K['mulch']]


@piece('bougain', sx=0.0, sy=0.0)
def p_bougain(K):
    """bougainvillea trained up a wall: woody trunks from a small bed + a magenta mass 2.2 m wide, up to 3.2 m,
    0.5 m deep (u -1.1..1.1 about the trunk, d 0..0.5 from the wall)."""
    p = P3()
    for (a, b, r) in (((0.0, 0.0, 0.16), (-0.2, 1.4, 0.12), 0.035), ((0.05, 0.0, 0.16), (0.35, 1.6, 0.1), 0.03), ((-0.2, 1.4, 0.12), (-0.6, 2.2, 0.1), 0.022)):
        tube(p, a, b, r, n=5, m=1)
    for i in range(16):
        # fan of small leafy clusters: narrow at the trunk, spreading and thinning toward the top / sides
        t = (i + 0.5) / 16
        v = 0.9 + 2.3 * math.sqrt(t) + 0.15 * _hn(i, 1)
        u = (0.25 + 0.85 * t) * _hn(i, 2) * 1.1
        r = 0.36 - 0.14 * t + 0.05 * _hn(i, 3)
        lumpy(p, u, v, 0.16 + 0.12 * abs(_hn(i, 4)), r * 1.1, r * 0.85, r * 0.6, m=0, seg=8, rings=5, seed=i * 1.7 + 0.5, amp=0.28, flat=1.0)
    return p.mb, [K['bougain'], K['bark']]


@piece('pot_tall', sx=0.0, sy=0.0)
def p_pot_tall(K):
    """large glazed pot with a clipped olive / ficus standard (1.9 m), centred at u = d = 0."""
    p = P3()
    n = 12
    prof = [(0.17, 0.0), (0.26, 0.2), (0.27, 0.52), (0.25, 0.6), (0.27, 0.62)]
    for j in range(len(prof) - 1):
        (r0, v0), (r1, v1) = prof[j], prof[j + 1]
        for i in range(n):
            a0, a1 = 2 * PI * i / n, 2 * PI * (i + 1) / n
            q = [(r0 * math.cos(a0), v0, r0 * math.sin(a0)), (r0 * math.cos(a1), v0, r0 * math.sin(a1)), (r1 * math.cos(a1), v1, r1 * math.sin(a1)), (r1 * math.cos(a0), v1, r1 * math.sin(a0))]
            p.face(q, (math.cos((a0 + a1) / 2), 0.1, math.sin((a0 + a1) / 2)), m=0, k=2)
    p.cylv(0.0, 0.0, 0.55, 0.58, 0.24, n=10, m=3)
    tube(p, (0, 0.55, 0), (0.03, 1.35, 0.01), 0.025, n=5, m=2)
    lumpy(p, 0.03, 1.55, 0.0, 0.36, 0.34, 0.34, m=1, seg=11, rings=6, seed=5.0, amp=0.16)
    return p.mb, [K['paint'], K['shrub'], K['bark'], K['soil']]


@piece('fence_iron', sx=0.0, sy=0.0)
def p_fence_iron(K):
    """1.0 m low wrought-iron front fence (u 0..1, v 0..1.05, d 0) with spear pickets; post at u = 0."""
    p = P3()
    p.box(0.0, 0.05, 0.0, 1.12, -0.025, 0.025, m=0, faces=1 | 2 | 4 | 8 | 16)
    p.box(0.0, 1.0, 0.1, 0.13, -0.012, 0.012, m=0, faces=1 | 2 | 16 | 32)
    p.box(0.0, 1.0, 0.86, 0.89, -0.012, 0.012, m=0, faces=1 | 2 | 16 | 32)
    for q in range(8):
        u = 0.1 + q * 0.12
        p.box(u - 0.009, u + 0.009, 0.02, 0.95, -0.009, 0.009, m=0, faces=1 | 2 | 4 | 8)
        p.face([(u - 0.022, 0.95, 0.0), (u + 0.022, 0.95, 0.0), (u, 1.03, 0.0)], (0, 0, 1), m=0)
        p.face([(u + 0.022, 0.95, 0.0), (u - 0.022, 0.95, 0.0), (u, 1.03, 0.0)], (0, 0, -1), m=0)
    return p.mb, [K['iron']]


@piece('fence_pick', sx=0.0, sy=0.0)
def p_fence_pick(K):
    """1.0 m painted picket fence (tint A), u 0..1, v 0..0.95; post at u = 0."""
    p = P3()
    p.box(0.0, 0.08, 0.0, 1.02, -0.04, 0.04, m=0, k=1, faces=1 | 2 | 4 | 8 | 16)
    for v in (0.2, 0.7):
        p.box(0.0, 1.0, v, v + 0.07, -0.035, -0.012, m=0, k=1, faces=1 | 2 | 16 | 32)
    for q in range(7):
        u = 0.13 + q * 0.135
        p.box(u - 0.035, u + 0.035, 0.04, 0.84, -0.012, 0.0, m=0, k=1, faces=1 | 2 | 4 | 8)
        p.face([(u - 0.035, 0.84, 0.0), (u + 0.035, 0.84, 0.0), (u, 0.92, 0.0)], (0, 0, 1), m=0, k=1)
    return p.mb, [K['paint']]


@piece('bike', sx=0.0, sy=0.0)
def p_bike(K):
    """city bicycle parked along a wall (u 0..1.75, v 0 = ground, d 0.2 = frame plane); frame = tint B."""
    p = P3()
    R, d = 0.34, 0.2
    wheel(p, 0.36, R, d, R, 0.018, 3, 1)
    wheel(p, 1.4, R, d, R, 0.018, 3, 1)
    bb, seat, head, rear, front = (0.8, 0.3, d), (0.68, 0.82, d), (1.22, 0.78, d), (0.36, R, d), (1.4, R, d)
    for a, b in ((rear, bb), (rear, seat), (bb, seat), (bb, head), (seat, head)):
        tube(p, a, b, 0.018, n=5, m=0, k=2)
    tube(p, head, front, 0.016, n=5, m=0, k=2)
    tube(p, (1.22, 0.78, d), (1.19, 0.98, d), 0.014, n=4, m=1)
    tube(p, (1.19, 0.98, d - 0.26), (1.19, 0.98, d + 0.26), 0.012, n=4, m=1)
    tube(p, (0.68, 0.82, d), (0.66, 0.92, d), 0.012, n=4, m=1)
    p.box(0.57, 0.8, 0.92, 0.97, d - 0.06, d + 0.06, m=2, faces=63)
    p.box(0.76, 0.84, 0.24, 0.36, d + 0.05, d + 0.07, m=1, faces=1 | 2)
    p.box(1.3, 1.52, 0.72, 0.74, d - 0.05, d + 0.05, m=1, faces=16 | 32)
    return p.mb, [K['paint'], K['alu'], K['rubber'], K['tyre']]


@piece('scooter', sx=0.0, sy=0.0)
def p_scooter(K):
    """shared e-scooter on its kickstand (u 0..1.1, v 0 = ground, d 0 = centre plane); stem / deck = tint B."""
    p = P3()
    wheel(p, 0.12, 0.12, 0.0, 0.12, 0.025, 2, 1, n=10, spokes=False)
    wheel(p, 0.98, 0.12, 0.0, 0.12, 0.025, 2, 1, n=10, spokes=False)
    p.box(0.16, 0.9, 0.1, 0.17, -0.075, 0.075, m=0, k=2, faces=63)
    p.box(0.2, 0.85, 0.17, 0.18, -0.065, 0.065, m=2, faces=16)
    tube(p, (0.97, 0.16, 0.0), (0.9, 1.12, 0.0), 0.022, n=6, m=0, k=2)
    tube(p, (0.9, 1.12, -0.24), (0.9, 1.12, 0.24), 0.014, n=5, m=1)
    p.box(0.87, 0.95, 1.0, 1.1, -0.04, 0.04, m=0, k=2, faces=63)
    tube(p, (0.45, 0.12, 0.07), (0.38, 0.0, 0.2), 0.008, n=3, m=1)
    return p.mb, [K['paint'], K['alu'], K['rubber']]


@piece('bins3', sx=0.0, sy=0.0)
def p_bins3(K):
    """SF three-cart set (landfill black / recycling blue / compost green), u 0..1.95, d 0..0.75, v 0 = ground:
    tapered bodies, overhanging lids with a hinge bar, wheels at the back, grab handles."""
    p = P3()
    for i, mt in enumerate((0, 1, 2)):
        u0 = i * 0.66
        B0 = [(u0 + 0.06, 0.06, 0.08), (u0 + 0.52, 0.06, 0.08), (u0 + 0.52, 0.06, 0.66), (u0 + 0.06, 0.06, 0.66)]
        T0 = [(u0 + 0.01, 0.95, 0.03), (u0 + 0.57, 0.95, 0.03), (u0 + 0.57, 0.95, 0.72), (u0 + 0.01, 0.95, 0.72)]
        for q in range(4):
            a, b = B0[q], B0[(q + 1) % 4]; c, d = T0[(q + 1) % 4], T0[q]
            mid = ((a[0] + b[0]) / 2 - (u0 + 0.29), 0.0, (a[2] + b[2]) / 2 - 0.37)
            p.face([a, b, c, d], mid, m=mt)
        p.face([B0[0], B0[3], B0[2], B0[1]], (0, -1, 0), m=mt)
        p.box(u0 - 0.01, u0 + 0.59, 0.95, 1.0, 0.0, 0.76, m=mt, faces=63)
        p.box(u0 + 0.05, u0 + 0.53, 1.0, 1.02, 0.05, 0.72, m=mt, faces=16)
        tube(p, (u0 + 0.06, 0.95, 0.01), (u0 + 0.52, 0.95, 0.01), 0.018, n=5, m=mt)
        for uu in (u0 + 0.02, u0 + 0.5):
            tube(p, (uu, 0.1, 0.1), (uu + 0.06, 0.1, 0.1), 0.1, n=8, m=3, caps=True)
    return p.mb, [K['bin_k'], K['bin_b'], K['bin_g'], K['tyre']]


FONT5x7 = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
}


def numbers(K, text, plaque=True):
    """house numbers: raised brass (or black) 5x7-pixel digits 0.15 m tall (merged pixel runs), on a plaque or the wall.
    u 0..W, v 0..0.2, d 0 = wall."""
    p = P3()
    px_ = 0.15 / 7
    W = len(text) * 6 * px_ + px_
    if plaque:
        p.box(-0.03, W + 0.03, -0.03, 0.18, 0.0, 0.015, m=1, faces=1 | 4 | 8 | 16 | 32)
    d0 = 0.015 if plaque else 0.0
    for ci, ch in enumerate(text):
        rows = FONT5x7[ch]
        for r, row in enumerate(rows):
            c = 0
            while c < 5:
                if row[c] == '1':
                    e = c
                    while e + 1 < 5 and row[e + 1] == '1':
                        e += 1
                    u0 = px_ + (ci * 6 + c) * px_; u1 = px_ + (ci * 6 + e + 1) * px_
                    v1 = 0.15 - r * px_; v0 = v1 - px_
                    p.box(u0, u1, v0, v1, d0, d0 + 0.008, m=0, faces=1 | 16 | 32)
                    c = e + 1
                else:
                    c += 1
    return p.mb, [K['brass'], K['plaque']] if plaque else [K['brass']]


@piece('num_a', sx=0.0, sy=0.0)
def p_num_a(K):
    return numbers(K, '1427')


@piece('num_b', sx=0.0, sy=0.0)
def p_num_b(K):
    return numbers(K, '2638', plaque=False)


@piece('num_c', sx=0.0, sy=0.0)
def p_num_c(K):
    return numbers(K, '1915')


# ------------------------------------------------------------------ build, UV, bake, export (after kit_city.py)
def finish(mb, name, mat_list):
    bmesh.ops.remove_doubles(mb.bm, verts=mb.bm.verts, dist=1e-5)
    return mb.obj(name, mat_list)


def atlas_rects():
    rects = {}
    for c, (name, fn, meta) in enumerate(PIECES):
        col, row = c % GRID, c // GRID
        rects[name] = [col / GRID, 1 - (row + 1) / GRID, (col + 1) / GRID, 1 - row / GRID]
    assert len(PIECES) <= GRID * GRID
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


def mask_uv(ob):
    """copy the per-corner tint mask (Col.r) into a second UV set 'Mask' (u = mask / 2)."""
    me = ob.data
    col = me.color_attributes.get('Col')
    n = len(me.loops)
    a = np.zeros(n * 4, np.float32)
    if col is not None and col.domain == 'CORNER':
        col.data.foreach_get('color', a)
    a = a.reshape(-1, 4)
    uvm = me.uv_layers.new(name='Mask')
    b = np.zeros((n, 2), np.float32); b[:, 0] = a[:, 0]; b[:, 1] = 0.0
    uvm.data.foreach_set('uv', b.ravel())


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data; ob.modifiers.clear(); ob.data = me; bpy.data.meshes.remove(old)


def bake_setup():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    dev = L.pick_device(True)
    sc.cycles.device = 'GPU' if dev.startswith('GPU') else 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    sc.world.light_settings.distance = 0.5
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


FOLIAGE = {'hedge', 'shrub', 'shrub_flower', 'flowerbed', 'bougain'}
WALL_MOUNT = {'tile_cap', 'tile_pent', 'lamp_wall', 'mailbox', 'downspout', 'num_a', 'num_b', 'num_c', 'bougain', 'meters', 'bins3', 'bike', 'planter', 'dock'}
GROUND = {'meters', 'bins3', 'bike', 'planter', 'dock', 'pot', 'hedge', 'agave', 'succulents', 'shrub', 'shrub_flower', 'flowerbed',
          'pot_tall', 'fence_iron', 'fence_pick', 'scooter', 'bougain', 'newel'}


def occluders(meta):
    """(v4) AO-only context for the bake: the wall the piece is mounted on (with the opening cut out) and / or the
    ground it stands on, so casings, sills, tiles, pots and bins get their contact occlusion baked (the pieces used to
    be baked floating in space). Not bake targets, removed before export."""
    obs = []
    for k, (name, fn, pm) in enumerate(PIECES):
        off = Vector(((k % 6) * 12.0, (k // 6) * 12.0, 0.0))
        j = meta[name]; mn, mx = j['min'], j['max']
        mb = MB(); q = []
        def quad(a, b, c, d):
            vs = mb.verts([V(*a), V(*b), V(*c), V(*d)]); q.append(mb.bm.faces.new(vs))
        u0, u1, v0, v1 = mn[0] - 1.5, mx[0] + 1.5, min(mn[1], 0.0) - 1.0, mx[1] + 1.0
        if pm['open']:
            W0, H0 = pm['open']
            quad((u0, v0, 0), (0, v0, 0), (0, v1, 0), (u0, v1, 0))
            quad((W0, v0, 0), (u1, v0, 0), (u1, v1, 0), (W0, v1, 0))
            quad((0, v0, 0), (W0, v0, 0), (W0, 0, 0), (0, 0, 0))
            quad((0, H0, 0), (W0, H0, 0), (W0, v1, 0), (0, v1, 0))
            if name.startswith('garage') or name == 'rollup_big':
                quad((u0, 0, 0), (u1, 0, 0), (u1, 0, 2.5), (u0, 0, 2.5))
        else:
            if name in WALL_MOUNT:
                quad((u0, v0, 0), (u1, v0, 0), (u1, v1, 0), (u0, v1, 0))
            if name in GROUND:
                dA = 0.0 if name in WALL_MOUNT else mn[2] - 1.5
                quad((u0, 0, dA), (u1, 0, dA), (u1, 0, mx[2] + 1.5), (u0, 0, mx[2] + 1.5))
        if not q:
            continue
        mb._fin(q, (1, 1, 1), 0)
        ob = mb.obj('__occ_' + name, [K_OCC()])
        ob.location = off
        obs.append(ob)
    return obs


def K_OCC():
    return M_bump('f_occ', (0.5, 0.5, 0.5), rough=0.9, kind=None, var=0.0, lin=True)


def main():
    t0 = time.time()
    L.reset_factory()
    K = mats()
    rects = atlas_rects()
    los, his, meta = [], [], {}
    for k, (name, fn, pm) in enumerate(PIECES):
        mb, ml = fn(K)
        lo = finish(mb, name, ml)
        uv_into(lo, rects[name])
        off = Vector(((k % 6) * 12.0, (k // 6) * 12.0, 0.0))
        lo.location = off
        hi = lo.copy(); hi.data = lo.data.copy(); hi.name = name + '_hi'
        bpy.context.scene.collection.objects.link(hi)
        b = hi.modifiers.new('bev', 'BEVEL'); b.width = 0.006; b.segments = 2; b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(30); b.harden_normals = True; b.use_clamp_overlap = True
        if name in ('hedge', 'planter', 'pot'):
            b.width = 0.06 if name == 'hedge' else 0.02; b.segments = 3
        if name in FOLIAGE:
            # (v4) leafy relief for the normal bake: subdivide the high copy and displace it with small voronoi cells
            hi.modifiers.remove(b)
            s = hi.modifiers.new('sub', 'SUBSURF'); s.levels = 2; s.render_levels = 2
            tx = bpy.data.textures.new('leafy_' + name, 'VORONOI'); tx.noise_scale = 0.045; tx.distance_metric = 'DISTANCE'
            dm = hi.modifiers.new('disp', 'DISPLACE'); dm.texture = tx; dm.strength = -0.035; dm.mid_level = 0.5; dm.texture_coords = 'GLOBAL'
        hi.data.shade_smooth()
        apply_mods(hi)
        los.append(lo); his.append(hi)
        tris = sum(len(p.vertices) - 2 for p in lo.data.polygons)
        bb = [Vector(c) for c in lo.bound_box]
        # bbox in three coords (x = u, y = v, z = d) at the origin
        mn = [min(c.x for c in bb), min(c.z for c in bb), -max(c.y for c in bb)]
        mx = [max(c.x for c in bb), max(c.z for c in bb), -min(c.y for c in bb)]
        meta[name] = {'rect': rects[name], 'tris': tris, 'min': mn, 'max': mx, 'open': pm['open'], 'rec0': pm['rec0'], 'sx': pm['sx'], 'sy': pm['sy']}
        print(f'[fac3] {name}: {tris} tris')
    occ = occluders(meta)
    dev = bake_setup()
    print('[fac3] bake device', dev)
    for h in his:
        h.hide_render = True
    alb, nrm, ao, rgh, mtl = image('alb', (0.5, 0.5, 0.5, 1)), image('nrm', (0.5, 0.5, 1, 1), True), image('ao', (1, 1, 1, 1), True), image('rgh', (0.6, 0.6, 0.6, 1), True), image('mtl', (0, 0, 0, 1), True)
    def bake(kind, im, **kw):
        t = time.time(); set_target(im); select(los)
        bpy.ops.object.bake(type=kind, **kw)
        print(f'[fac3] bake {kind} {time.time() - t:.1f}s')
    bake('DIFFUSE', alb, pass_filter={'COLOR'})
    bake('AO', ao)
    bake('ROUGHNESS', rgh)
    metal_emit(True); bake('EMIT', mtl); metal_emit(False)
    for h in his:
        h.hide_render = False
    t = time.time(); set_target(nrm)
    for lo, hi in zip(los, his):
        select([hi, lo], lo)
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.07)
    print(f'[fac3] bake NORMAL {time.time() - t:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    A = px(alb)
    A = np.where(A <= 0.0031308, A * 12.92, 1.055 * np.power(np.clip(A, 0, 1), 1 / 2.4) - 0.055)
    L.save_image(os.path.join(OUT, 'fac3_alb.jpg'), A, 'JPEG', 90)
    L.save_image(os.path.join(OUT, 'fac3_nrm.jpg'), px(nrm), 'JPEG', 95)
    ORM = np.stack([px(ao)[:, :, 0], px(rgh)[:, :, 0], px(mtl)[:, :, 0]], axis=2)
    L.save_image(os.path.join(OUT, 'fac3_orm.jpg'), ORM, 'JPEG', 92)
    for h in his + occ:
        bpy.data.objects.remove(h, do_unlink=True)
    for im in (alb, nrm, ao, rgh, mtl):
        bpy.data.images.remove(im)
    bpy.context.view_layer.update()
    for lo in los:
        lo.location = (0, 0, 0)
        me = lo.data
        if 'UVMap' in me.uv_layers:
            me.uv_layers.remove(me.uv_layers['UVMap'])
        mask_uv(lo)
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        me.materials.clear()
    select(los)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'fac3_kit.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_normals=True, export_texcoords=True, export_yup=True, export_apply=True)
    with open(os.path.join(OUT, 'fac3_kit.json'), 'w') as f:
        json.dump({'res': RES, 'pieces': meta, 'frame': 'three: x = u along the wall, y = v up, z = d outward; uv1.x = tint mask / 2'}, f, indent=1)
    print(f'[fac3] done in {time.time() - t0:.0f}s ->', OUT)


main()
