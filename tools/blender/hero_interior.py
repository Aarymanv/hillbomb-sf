"""HILLBOMB hero interiors: room kit + Cycles lightmap bake + export (Blender 5.x).

Interiors are modelled in a ROOM FRAME F = (a, t, n) of the building (u along t, y up, w along n; the room lies at
w < 0 behind the facade). Geometry goes into a Geo (same slots idea as the exteriors); IGeo adds lights.
Bake: one lightmap atlas per interior (uv1, Smart UV + pack), DIFFUSE direct+indirect without colour = irradiance/pi,
stored gamma-encoded in a JPEG with a scale (lmScale) so the game can use it as MeshStandardMaterial.lightMap.
Outputs: public/assets/landmarks/<id>/<id>_int.glb (nodes I_<slot>), <id>_int_lm.jpg; meta merged into the site json.
"""
import bpy, bmesh, math, os, json, time
import numpy as np
from hero_lib import *   # noqa

# linear albedo means of the texture sets used by the game materials (bounce colour in the bake)
# library materials (slots 'x_<key>', int_assets.py): linear mean albedo per key from _itex/lib.json
LIB = {}
try:
    LIB = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'landmarks', '_itex', 'lib.json')))
except Exception:
    pass
OIDN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_cache', 'oidn', 'oidn-2.5.1.x64.windows', 'bin', 'oidnDenoise.exe')
TEX_ALBEDO = {'brickred': 0.38, 'brick': 0.5, 'stucco': 0.75, 'paving': 0.5, 'marble': 0.78, 'wood': 0.45, 'plaster': 0.85, 'carpet': 0.5, 'fabric': 0.6, 'granite': 0.7, 'tiles': 0.8, 'stone': 0.8, 'concrete': 0.6, 'leather': 0.4}
EMISSIVE = {'sky': 3.0, 'crystal': 6.0, 'lampI': 8.0, 'screen': 2.5, 'stained': 4.0, 'neonI': 6.0, 'ceilglow': 2.2, 'signI': 0.6}
# night bake (<id>_int_lmn.jpg, half res): daylight emitters drop to a city-glow trickle, daylight-coloured lights (blue > red) go off
NIGHT_EMIT = {'sky': 0.08, 'stained': 0.15}
NIGHT_SKY = (1.0, 0.72, 0.5)    # bake-only sky emitters at night: warm sodium skyglow
NIGHT_SKY_K = 0.025              # x sky_k


class IGeo(Geo):
    def __init__(self, O, F):
        super().__init__(O, 0)
        self.F = F; self.lights = []; self.maxedge = 1.6
        self.cols = []; self.rooms = []; self.decks = []; self.doors = []; self.spots = []

    # local helpers ------------------------------------------------------------------
    def P(self, u, y, w):
        return Geo.fp(self.F, u, y, w)

    def xz(self, u, w):
        p = Geo.fp(self.F, u, 0.0, w); return (p[0], p[2])

    def lbox(self, slot, u0, u1, y0, y1, w0, w1, col, top=True, bottom=False, sides=True, back=True, collide=False):
        self.fbox(slot, self.F, min(u0, u1), max(u0, u1), y0, y1, min(w0, w1), max(w0, w1), col, top=top, bottom=bottom, sides=sides, back=back)
        if collide: self.collider(u0, u1, w0, w1, y0, y1)

    def collider(self, u0, u1, w0, w1, y0, y1):
        a, t, n = self.F
        cu, cw = (u0 + u1) / 2, (w0 + w1) / 2
        x, z = self.xz(cu, cw)
        yaw = math.atan2(-t[1], t[0])
        self.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': round(abs(u1 - u0) / 2, 2), 'hz': round(abs(w1 - w0) / 2, 2), 'yaw': round(yaw, 4),
                          'yMin': round(y0, 2), 'yMax': round(y1, 2)})

    def light(self, kind, u, y, w, power, color=(1, 0.85, 0.65), radius=0.1, size=None, rot=None, day=None):
        """day: True = daylight stand-in (off in the night bake); default: daylight when the colour is bluer than red"""
        self.lights.append((kind, self.P(u, y, w), power, color, radius, size, rot, (color[2] > color[0]) if day is None else day))

    def spot(self, u, y, w, face_u=None, face_w=None, kind='stand'):
        """standing / idle person spot (runtime hero_int.js ambient people); faces (face_u, face_w) in frame coords or random"""
        x, z = self.xz(u, w)
        yaw = None
        if face_u is not None:
            fx, fz = self.xz(face_u, face_w); yaw = round(math.atan2(-(fx - x), -(fz - z)), 3)
        self.spots.append([round(x, 2), round(y, 2), round(z, 2), yaw, kind])

    def shot_at(self, u, y, w, tu, ty, tw):
        """review camera (dev/int_shots.js) in frame coords"""
        self.shot = list(self.P(u, y, w)) + list(self.P(tu, ty, tw))

    def link(self, a, b, la, lb, verb='ride'):
        """E-prompt hop between two points in frame coords: a = (u, y, w, face_u, face_w), labels la (shown at a) / lb"""
        def pt(q):
            x, z = self.xz(q[0], q[2]); fx, fz = self.xz(q[3], q[4])
            return [round(x, 2), round(q[1], 2), round(z, 2), round(math.atan2(-(fx - x), -(fz - z)), 3)]
        if not hasattr(self, 'links'): self.links = []
        self.links.append({'a': pt(a), 'b': pt(b), 'la': la, 'lb': lb, 'verb': verb})

    def ring_deck(self, cx, cz, r0, r1, y, n=24):
        """walkable annulus (world centre cx, cz): n straight deck segments along the ring"""
        rm, wd = (r0 + r1) / 2, (r1 - r0)
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            A = (cx + math.cos(a0) * rm, cz + math.sin(a0) * rm); B = (cx + math.cos(a1) * rm, cz + math.sin(a1) * rm)
            self.decks.append({'pts': [[round(A[0], 2), round(A[1], 2), round(y, 3)], [round(B[0], 2), round(B[1], 2), round(y, 3)]], 'width': round(wd, 2), 'tunnel': True})

    def ring_rail(self, cx, cz, r, y0, y1, n=32, th=0.25):
        """collider ring (balustrade / drum wall) of n boxes tangent to radius r"""
        for i in range(n):
            am = 2 * math.pi * (i + 0.5) / n
            x, z = cx + math.cos(am) * r, cz + math.sin(am) * r
            self.cols.append({'x': round(x, 2), 'z': round(z, 2), 'hx': round(r * math.pi / n + 0.05, 2), 'hz': th / 2,
                              'yaw': round(math.atan2(-math.cos(am), -math.sin(am)), 4), 'yMin': round(y0, 2), 'yMax': round(y1, 2)})

    def deck_rect(self, u0, u1, w0, w1, y):
        """walkable rectangle (frame coords) as one deck segment along its long axis"""
        L = abs(u1 - u0) >= abs(w1 - w0); cu, cw = (u0 + u1) / 2, (w0 + w1) / 2
        A, B, wd = (self.xz(u0, cw), self.xz(u1, cw), abs(w1 - w0)) if L else (self.xz(cu, w0), self.xz(cu, w1), abs(u1 - u0))
        self.decks.append({'pts': [[round(A[0], 2), round(A[1], 2), round(y, 3)], [round(B[0], 2), round(B[1], 2), round(y, 3)]], 'width': round(wd, 2), 'tunnel': True})

    def room(self, name, u0, u1, w0, w1, y0, y1, floor=True):
        a, t, n = self.F
        cu, cw = (u0 + u1) / 2, (w0 + w1) / 2
        x, z = self.xz(cu, cw)
        self.rooms.append({'name': name, 'x': round(x, 2), 'z': round(z, 2), 'hx': round(abs(u1 - u0) / 2, 2), 'hz': round(abs(w1 - w0) / 2, 2),
                           'yaw': round(math.atan2(-t[1], t[0]), 4), 'y0': round(y0, 2), 'y1': round(y1, 2)})
        if floor:
            L = abs(u1 - u0) >= abs(w1 - w0)
            if L: A, B, wd = self.xz(u0, cw), self.xz(u1, cw), abs(w1 - w0)
            else: A, B, wd = self.xz(cu, w0), self.xz(cu, w1), abs(u1 - u0)
            self.decks.append({'pts': [[round(A[0], 2), round(A[1], 2), round(y0, 3)], [round(B[0], 2), round(B[1], 2), round(y0, 3)]], 'width': round(wd, 2), 'tunnel': True})

    def door(self, label, u_out, w_out, y_out, u_in, w_in, y_in):
        a, t, n = self.F
        # facing: yaw of a direction (fx, fz) = atan2(-fx, -fz); outside faces the building (-n), inside faces inward (-n)
        yaw_room = math.atan2(n[0], n[1])            # faces -n: into the room
        xo, zo = self.xz(u_out, w_out); xi, zi = self.xz(u_in, w_in)
        self.doors.append({'label': label, 'v': 2, 'out': [round(xo, 2), round(y_out, 2), round(zo, 2), round(yaw_room + math.pi, 3)],
                           'in': [round(xi, 2), round(y_in, 2), round(zi, 2), round(yaw_room, 3)]})

    # room shell (inward faces) --------------------------------------------------------
    def shell(self, u0, u1, w0, w1, y0, y1, floor_slot, floor_col, wall_slot, wall_col, ceil_slot, ceil_col, walls=(True, True, True, True), ceiling=True):
        P = self.P
        if floor_slot: self.quad_sub(floor_slot, P(u0, y0, w0), P(u1, y0, w0), P(u1, y0, w1), P(u0, y0, w1), floor_col, (0, 1, 0))
        if ceiling and ceil_slot: self.quad_sub(ceil_slot, P(u0, y1, w0), P(u1, y1, w0), P(u1, y1, w1), P(u0, y1, w1), ceil_col, (0, -1, 0))
        a, t, n = self.F
        T = (t[0], 0, t[1]); N = (n[0], 0, n[1])
        sides = [((u0, w0), (u1, w0), N), ((u1, w0), (u1, w1), (-T[0], 0, -T[2])), ((u1, w1), (u0, w1), (-N[0], 0, -N[2])), ((u0, w1), (u0, w0), T)]
        # w0 is the far (back) side when w0 < w1 ... orientation handled by the hint pointing into the room
        for k, ((ua, wa), (ub, wb), _) in enumerate(sides):
            if not walls[k]: continue
            mu, mw = (ua + ub) / 2, (wa + wb) / 2; cu, cw = (u0 + u1) / 2, (w0 + w1) / 2
            hint = P(cu, 0, cw); hp = P(mu, 0, mw); hint = (hint[0] - hp[0], 0, hint[2] - hp[2])
            self.quad_sub(wall_slot, P(ua, y0, wa), P(ub, y0, wb), P(ub, y1, wb), P(ua, y1, wa), wall_col, hint)
        self.collider(u0 - 0.5, u0, w0, w1, y0 - 1, y1); self.collider(u1, u1 + 0.5, w0, w1, y0 - 1, y1)
        self.collider(u0, u1, min(w0, w1) - 0.5, min(w0, w1), y0 - 1, y1); self.collider(u0, u1, max(w0, w1), max(w0, w1) + 0.5, y0 - 1, y1)

    def panel_in(self, slot, u0, u1, y0, y1, w, col, face):
        """flat rectangle on a plane w = const facing +n (face=1) or -n (face=-1)"""
        a, t, n = self.F
        self.poly(slot, [self.P(u0, y0, w), self.P(u1, y0, w), self.P(u1, y1, w), self.P(u0, y1, w)], col, (n[0] * face, 0, n[1] * face))

    def panel_u(self, slot, w0, w1, y0, y1, u, col, face):
        """flat rectangle on a plane u = const facing +t (face=1) or -t"""
        a, t, n = self.F
        self.poly(slot, [self.P(u, y0, w0), self.P(u, y0, w1), self.P(u, y1, w1), self.P(u, y1, w0)], col, (t[0] * face, 0, t[1] * face))

    def lcyl(self, slot, u, w, r, y0, y1, col, n=16, r1=None, top=True):
        x, z = self.xz(u, w); self.cyl(slot, x, z, r, y0, y1, col, n=n, top=top, r1=r1)

    def llathe(self, slot, u, w, prof, col, n=16, cap_top=False, cap_bot=False):
        x, z = self.xz(u, w); self.lathe(slot, x, z, prof, col, n=n, cap_top=cap_top, cap_bot=cap_bot)


# ============================================================================ furniture kit
# Real furniture (Poly Haven, hero_props.py) replaces the box / lathe stand-ins of the first waves; HB_PROCFURN=1 = old boxes.
# g.style picks the family: 'classic' (default: hotel lobbies), 'modern', 'club'.
PROCFURN = bool(os.environ.get('HB_PROCFURN'))
SOFA = {'classic': 'Sofa_01', 'modern': 'sofa_02', 'club': 'sofa_03'}


def _facing(g, rot):
    """(tt, nn) of the box-sofa sub-frame: the seat faces +nn"""
    a, t, n = g.F
    ca, sa = math.cos(rot), math.sin(rot)
    tt = (t[0] * ca + n[0] * sa, t[1] * ca + n[1] * sa); nn = (-tt[1], tt[0])
    return tt, nn


def _face_pt(g, u, w, nn, d=3.0):
    """frame (u, w) of the point d metres along world direction nn from (u, w)"""
    a, t, n = g.F
    return (u + (nn[0] * t[0] + nn[1] * t[1]) * d, w + (nn[0] * n[0] + nn[1] * n[1]) * d)


def sofa(g, u, w, y, rot, col, L=2.2):
    """rot 0: seat faces -w (toward smaller w)... simple boxes in a rotated sub-frame"""
    if not PROCFURN:
        from hero_props import prop
        tt, nn = _facing(g, rot)
        st = getattr(g, 'style', 'classic')
        if L < 1.3:     # single seat
            prop(g, {'classic': 'ArmChair_01', 'modern': 'modern_arm_chair_01', 'club': 'GreenChair_01'}.get(st, 'ArmChair_01'), u, y, w, face=_face_pt(g, u, w, nn), fit=(None, 1.0, None))
        else:
            prop(g, SOFA.get(st, 'Sofa_01'), u, y, w, face=_face_pt(g, u, w, nn), fit=(L, None, None))
        return
    a, t, n = g.F
    ca, sa = math.cos(rot), math.sin(rot)
    tt = (t[0] * ca + n[0] * sa, t[1] * ca + n[1] * sa); nn = (-tt[1], tt[0])
    o = g.xz(u, w)
    F = ((o[0] - tt[0] * L / 2 - nn[0] * 0.45, o[1] - tt[1] * L / 2 - nn[1] * 0.45), tt, nn)
    g.fbox('fabric', F, 0, L, y, y + 0.42, 0, 0.9, col, top=True, back=True)
    g.fbox('fabric', F, 0, L, y + 0.42, y + 0.85, 0.0, 0.22, shade(col, 0.9), top=True, back=True)
    for e in (0, L - 0.2):
        g.fbox('fabric', F, e, e + 0.2, y + 0.42, y + 0.62, 0.22, 0.9, shade(col, 0.95), top=True, back=True)


def table(g, u, w, y, r, h, top_col, slot='marble'):
    g.llathe('metal', u, w, [(0.25, y), (0.06, y + 0.1), (0.05, y + h - 0.05), (0.2, y + h - 0.03)], C('#8c7442'), n=10)
    g.llathe(slot, u, w, [(r, y + h - 0.04), (r, y + h), (0.0, y + h)], top_col, n=20, cap_bot=True)


def potted_plant(g, u, w, y, h=1.8, seed=1):
    if not PROCFURN:
        from hero_props import prop
        prop(g, 'potted_plant_02', u, y, w, yaw=seed * 1.7, fit=(None, h * 0.95, None), collide=False)
        return
    import random
    R = random.Random(seed)
    g.llathe('granite', u, w, [(0.32, y), (0.42, y + 0.55), (0.45, y + 0.6), (0.0, y + 0.6)], C('#b8aa92'), n=14)
    x, z = g.xz(u, w)
    for k in range(14):
        az = k * 2.4 + R.random(); L = 0.7 + R.random() * 0.6; el = 0.5 + R.random() * 0.9
        b = (x, y + 0.55, z); tip = (x + math.cos(az) * L * math.cos(el) * 0.9, y + 0.55 + h * 0.4 + L * math.sin(el), z + math.sin(az) * L * math.cos(el) * 0.9)
        side = (-math.sin(az) * 0.16, 0, math.cos(az) * 0.16)
        mid = ((b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2 + 0.15, (b[2] + tip[2]) / 2)
        g.poly('leaf', [b, (mid[0] + side[0], mid[1], mid[2] + side[2]), tip, (mid[0] - side[0], mid[1], mid[2] - side[2])], C('#3e6a2c'), (0, 1, 0))


def chandelier(g, u, w, y_top, drop=1.6, R=1.3, tiers=3, power=900):
    """gilt ring chandelier with crystal drops + a warm point light"""
    if not PROCFURN:
        from hero_props import prop
        top = y_top - drop + 1.05
        g.llathe('gold', u, w, [(0.04, y_top), (0.04, top)], GOLD_I, n=6)
        prop(g, getattr(g, 'chandelier', 'Chandelier_03'), u, top, w, fit=(2.1 * R, None, None), hang=True)
        g.light('POINT', u, y_top - drop + 0.3, w, power, (1.0, 0.8, 0.58), radius=0.6)
        return
    g.llathe('gold', u, w, [(0.05, y_top), (0.05, y_top - drop + 0.9)], GOLD_I, n=6)
    for k in range(tiers):
        rr = R * (1 - k * 0.28); yy = y_top - drop + 0.2 + k * 0.35
        g.llathe('gold', u, w, [(rr, yy), (rr + 0.06, yy + 0.05), (rr, yy + 0.1), (rr - 0.06, yy + 0.05), (rr, yy)], GOLD_I, n=24)
        for i in range(int(10 + 6 * rr)):
            aa = 2 * math.pi * i / int(10 + 6 * rr)
            x, z = g.xz(u, w)
            px, pz = x + math.cos(aa) * rr, z + math.sin(aa) * rr
            g.lathe('crystal', px, pz, [(0.0, yy - 0.28), (0.05, yy - 0.18), (0.0, yy - 0.02)], (1.0, 0.92, 0.8, 1.0), n=4)
            g.lathe('crystal', px, pz, [(0.035, yy + 0.1), (0.035, yy + 0.22), (0.0, yy + 0.26)], (1.0, 0.88, 0.7, 1.0), n=4)
    g.llathe('crystal', u, w, [(0.0, y_top - drop - 0.3), (0.35, y_top - drop + 0.1), (0.2, y_top - drop + 0.5), (0.0, y_top - drop + 0.6)], (1.0, 0.9, 0.75, 1.0), n=10)
    g.light('POINT', u, y_top - drop + 0.3, w, power, (1.0, 0.8, 0.58), radius=0.6)


GOLD_I = C('#b8923e')


# ============================================================================ bake + export
# legacy slots -> library materials (texture detail, vertex colour = the surface's mean albedo: x_ shading = tex / mean * colour)
REMAP = {'marble': ('marble_white', 0.78), 'granite': ('marble_black', 0.7), 'wood': ('veneer', 0.45), 'plaster': ('plaster', 0.85),
         'carpet': ('carpet_red', 0.5), 'fabric': ('velvet', 0.6), 'leather': ('leather', 0.4), 'gold': ('gold', 1.0), 'stone': ('limestone', 0.8)}


def remap_slots(g):
    for old, (key, k) in [(o, v) for o, v in REMAP.items()] + [('d_' + o, v) for o, v in REMAP.items()]:
        if old not in g.S or key not in LIB: continue
        d = g.S.pop(old); new = ('d_' if old.startswith('d_') else '') + 'x_' + key
        d['c'] = [(c[0] * k, c[1] * k, c[2] * k, c[3]) for c in d['c']]
        if new not in g.S: g.S[new] = d; continue
        dst = g.S[new]; off = len(dst['v'])
        dst['v'] += d['v']; dst['f'] += [[i + off for i in f] for f in d['f']]; dst['uv'] += d['uv']; dst['c'] += d['c']


def slot_albedo(slot, extra=None):
    if extra and slot in extra: return tuple(extra[slot])
    if slot.startswith('x_'): return (1.0, 1.0, 1.0)     # the vertex colour carries the albedo
    k = TEX_ALBEDO.get(slot, 0.8); return (k, k, k)


def _bake_material(slot, img, night=False, extra=None, mode='light'):
    m = bpy.data.materials.new('bk_' + slot)
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes
    bsdf = N.get('Principled BSDF')
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'Col'; at.attribute_type = 'GEOMETRY'
    k = slot_albedo(slot, extra)
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    nt.links.new(at.outputs['Color'], mul.inputs[6]); mul.inputs[7].default_value = (k[0], k[1], k[2], 1)
    nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    if slot in EMISSIVE:
        nt.links.new(at.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = NIGHT_EMIT.get(slot, EMISSIVE[slot]) if night else EMISSIVE[slot]
    if slot in ('glassI', 'clear'):
        bsdf.inputs['Alpha'].default_value = 0.15
    tn = N.new('ShaderNodeTexImage'); tn.image = img
    for nd in N: nd.select = False
    tn.select = True; N.active = tn
    return m


def lm_unwrap(objs, res):
    for ob in objs:
        if 'lm' not in ob.data.uv_layers: ob.data.uv_layers.new(name='lm')
        ob.data.uv_layers.active = ob.data.uv_layers['lm']
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    r1 = bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    try: bpy.ops.uv.select_all(action='SELECT')
    except Exception as e: print('[hero] uv select_all', e, flush=True)
    r2 = bpy.ops.uv.pack_islands(margin=6.0 / res, rotate=True, shape_method=os.environ.get('HB_PACK', 'CONCAVE'), margin_method='FRACTION')
    if os.environ.get('HB_DEBUG') or r1 != {'FINISHED'} or r2 != {'FINISHED'}: print('[hero] unwrap', r1, r2, flush=True)
    if os.environ.get('HB_DEBUG'):
        bpy.ops.object.mode_set(mode='OBJECT')
        for ob in objs:
            uv = np.empty(len(ob.data.loops) * 2, dtype=np.float32); ob.data.uv_layers['lm'].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
            print('[dbg] packed', ob.name, uv.min(0).round(3).tolist(), uv.max(0).round(3).tolist(), flush=True)
        bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.object.mode_set(mode='OBJECT')
    # pack_islands targets the closest UDIM tile: islands can land outside 0..1 (never baked). Fit the whole layout back in.
    uvs = []
    for ob in objs:
        uv = np.empty(len(ob.data.loops) * 2, dtype=np.float32); ob.data.uv_layers['lm'].data.foreach_get('uv', uv); uvs.append(uv)
    if os.environ.get('HB_FORCEREFIT'): uvs = [u * 2.5 for u in uvs]
    allv = np.concatenate([u for u in uvs if u.size]).reshape(-1, 2)
    lo, hi = allv.min(0), allv.max(0); ext = float(max(hi - lo)); m = 2.0 / res
    if ext > 1e-6 and (lo.min() < 0 or hi.max() > 1):
        k = (1 - 2 * m) / ext
        for ob, uv in zip(objs, uvs):
            uv = uv.reshape(-1, 2); uv[:] = (uv - lo) * k + m
            ob.data.uv_layers['lm'].data.foreach_set('uv', uv.ravel())
        print('[hero] lightmap uv layout refit (extent %.2f)' % ext, flush=True)
    for ob in objs: ob.data.uv_layers.active = ob.data.uv_layers['UVMap']


def add_lights(lights, O):
    out = []
    for i, L in enumerate(lights):
        kind, p, power, color, radius, size, rot = L[:7]
        day = L[7] if len(L) > 7 else (color[2] > color[0])
        ld = bpy.data.lights.new('l%d' % i, kind)
        ld.energy = power; ld.color = color
        if kind in ('POINT', 'SPOT'): ld.shadow_soft_size = radius
        if kind == 'AREA':
            ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size or (1, 1)
        ob = bpy.data.objects.new('l%d' % i, ld)
        ob.location = (p[0] - O[0], -(p[2] - O[2]), p[1] - O[1])
        if rot: ob.rotation_euler = rot
        bpy.context.scene.collection.objects.link(ob)
        out.append((ld, power, day))
    return out


def _pfm_write(path, a):
    h, w = a.shape[:2]
    with open(path, 'wb') as f:
        f.write(b'PF\n%d %d\n-1.0\n' % (w, h)); f.write(np.ascontiguousarray(a[::-1, :, :3], dtype='<f4').tobytes())


def _pfm_read(path, res):
    b = open(path, 'rb').read(); i = 0
    for _ in range(3): i = b.index(b'\n', i) + 1
    return np.frombuffer(b[i:], dtype='<f4').reshape(res, res, 3)[::-1]


def _aux_bake(objs, res, kind, extra):
    """OIDN guides in lightmap space: 'albedo' (diffuse colour pass) and 'normal' (world normals)"""
    img = bpy.data.images.new('aux_' + kind, res, res, alpha=False, float_buffer=True)
    for ob in objs:
        slot = ob.name.split('_', 1)[1]
        ob.data.materials.clear(); ob.data.materials.append(_bake_material(slot, img, False, extra))
    sc = bpy.context.scene; sc.cycles.samples = 4
    if kind == 'albedo': bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=8)
    else:
        sc.render.bake.normal_space = 'OBJECT'
        bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=8)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[:, :, :3]
    if kind == 'normal': a = a * 2.0 - 1.0
    bpy.data.images.remove(img)
    return a


def denoise(px, res, aux=None):
    """Open Image Denoise (HDR, lightmap space, albedo + normal guides when given); falls back to a light blur"""
    import subprocess, tempfile
    if os.path.exists(OIDN):
        d = tempfile.mkdtemp(prefix='hb_oidn_')
        try:
            fi, fo = os.path.join(d, 'c.pfm'), os.path.join(d, 'o.pfm')
            _pfm_write(fi, px); args = [OIDN, '--hdr', fi, '-o', fo]
            if aux is not None:
                fa, fn = os.path.join(d, 'a.pfm'), os.path.join(d, 'n.pfm')
                _pfm_write(fa, np.clip(aux[0], 0, 1)); _pfm_write(fn, aux[1]); args += ['--alb', fa, '--nrm', fn]
            t = time.time()
            r = subprocess.run(args, capture_output=True, text=True, timeout=1800)
            if r.returncode == 0 and os.path.exists(fo):
                print('[hero] OIDN %dpx %.1f s' % (res, time.time() - t), flush=True)
                return _pfm_read(fo, res).copy()
            print('[hero] OIDN failed', r.stderr[-400:], flush=True)
        finally:
            for f in os.listdir(d): os.remove(os.path.join(d, f))
            os.rmdir(d)
    pad = np.pad(px, ((1, 1), (1, 1), (0, 0)), mode='edge')
    blur = sum(pad[1 + dy:1 + dy + res, 1 + dx:1 + dx + res] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
    return px * 0.35 + blur * 0.65


LAST = [0.0]


def bake_lightmap(objs, res, samples, path, gamma=2.2, night=False, extra=None, aux=None):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU' if os.environ.get('HB_CPU') else devices(); sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    try: sc.cycles.use_auto_tile = False       # no tile-buffer EXRs in %TEMP% (disk is tight)
    except Exception: pass
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 4
    sc.cycles.sample_clamp_indirect = 8.0
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    if bg: bg.inputs['Strength'].default_value = 0.0
    img = bpy.data.images.new('lm', res, res, alpha=False, float_buffer=True)
    for ob in objs:
        slot = ob.name.split('_', 1)[1]
        ob.data.materials.clear(); ob.data.materials.append(_bake_material(slot, img, night, extra))
        ob.data.uv_layers.active = ob.data.uv_layers['lm']
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bk = sc.render.bake
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
    bk.margin = 8; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'; bk.use_clear = True
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=8)
    print('[hero] lightmap bake%s %dpx %d spp %.1f s' % (' (night)' if night else '', res, samples, time.time() - t), flush=True)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[:, :, :3]
    if os.environ.get('HB_DEBUG'):
        for im in bpy.data.images:
            try: print('[dbg] img', im.name, tuple(im.size), round(float(np.array(im.pixels[:]).mean()), 4) if im.size[0] <= 256 else '-', flush=True)
            except Exception: pass
        ob0 = objs[0]; print('[dbg] mat', ob0.name, [m.name for m in ob0.data.materials], ob0.data.uv_layers.active.name, flush=True)
    if aux is not None and aux[0].shape[0] != res:     # guides baked at full res, night map at half
        aux = (aux[0][::aux[0].shape[0] // res, ::aux[0].shape[0] // res], aux[1][::aux[1].shape[0] // res, ::aux[1].shape[0] // res])
    raw = float(px.mean())
    px = np.maximum(denoise(px, res, aux), 0.0)
    print('[hero] lightmap mean raw %.4f denoised %.4f max %.4f nonzero %d' % (raw, float(px.mean()), float(px.max()), int((px.sum(2) > 0).sum())), flush=True)
    lum_ = px.mean(axis=2); nzm = lum_[lum_ > 1e-4]
    LAST[0] = float(np.median(nzm)) if nzm.size else 0.0     # median irradiance of the used texels (runtime auto exposure)
    bpy.data.images.remove(img)
    lum = px.mean(axis=2)
    nz = lum[lum > 1e-4]
    scale = float(np.percentile(nz, 99.3)) if nz.size else 1.0
    enc = np.clip(px / scale, 0, 1) ** (1 / gamma)
    out = bpy.data.images.new('lm8', res, res, alpha=False, float_buffer=False)
    out.colorspace_settings.name = 'sRGB'
    rgba = np.ones((res, res, 4), dtype=np.float32); rgba[:, :, :3] = enc
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = path; out.file_format = 'JPEG'
    sc.render.image_settings.quality = 90
    out.save()
    for ob in objs:
        ob.data.materials.clear()
        ob.data.uv_layers.active = ob.data.uv_layers['UVMap']
    return scale


def run_interior(bid, build_fn, O, res=2048, samples=384):
    """build the interior with build_fn(g: IGeo) -> meta, bake the lightmap, export, merge meta into <bid>.json"""
    t0 = time.time()
    res = min(res, 4096)       # VRAM: 4K BC1 = 10.9 MB (.dds next to the JPEG, tools/blender/hero_int_pack.py)
    reset()
    import hero_lib; hero_lib._WINRNG[0] = 777
    g = build_fn(O)
    res = min(getattr(g, 'res', res), 4096, int(os.environ.get('HB_RESCAP', 4096)))
    # round-2 dressing (hero_int_dress.DRESS): clutter by room kind on the free floor, before the slot remap
    try:
        from hero_int_dress import DRESS, dress_room
        for k_, (ri_, kind_, dens_) in enumerate(DRESS.get(bid, [])):
            if ri_ < len(g.rooms): print('[dress] %s room %d %s: %d' % (bid, ri_, kind_, dress_room(g, ri_, kind_, seed=k_ + 11, density=dens_)), flush=True)
    except Exception as e_:
        import traceback; traceback.print_exc()
    if getattr(g, 'remap', True): remap_slots(g)
    # Poly Haven props (hero_props.py): one slot per asset material, own UVs (UVMap) + lightmap UVs, built like the architecture
    from hero_props import build_props
    pgeo, pmeta, palb, pcols = ({}, {}, {}, []) if os.environ.get('HB_NOPROPS') else build_props(g, O)
    for em_ in ('lampI', 'crystal'):     # prop bulbs / crystal join the emissive slots
        lp = pgeo.pop(em_ + '_p', None)
        if not lp: continue
        d = g.S.setdefault(em_, {'v': [], 'f': [], 'uv': [], 'c': []}); off = len(d['v'])
        d['v'] += lp['v']; d['f'] += [[i + off for i in f] for f in lp['f']]; d['uv'] += lp['uv']; d['c'] += lp['c']
    g.cols += pcols
    objs = [to_object('I_%s' % s, d, O, angle=40) for s, d in g.S.items()]
    objs = [o for o in objs if o]
    # props are not lightmapped (thousands of UV islands): they occlude / bounce in the bake and are lit at runtime by the
    # room's box-projected probe (hero_int.js); their contact shadows land in the floor / wall lightmaps
    pobjs = [o for o in (to_object('I_%s' % s, d, O, angle=40) for s, d in pgeo.items()) if o]
    # emissive slots (windows, lamps, bulbs, signs) are unlit at runtime: emitters in the bake, no lightmap texels
    eobjs = [o for o in objs if o.name[2:] in EMISSIVE]
    objs = [o for o in objs if o not in eobjs]
    for o in eobjs:
        sl = o.name[2:]; m = bpy.data.materials.new('em_' + sl); m.use_nodes = True; nt = m.node_tree
        b = nt.nodes.get('Principled BSDF'); at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Col'; at.attribute_type = 'GEOMETRY'
        nt.links.new(at.outputs['Color'], b.inputs['Base Color']); nt.links.new(at.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = EMISSIVE[sl]
        o.data.materials.append(m)
    for o in pobjs:
        m = bpy.data.materials.new('occ_' + o.name); m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF'); a_ = palb.get(o.name[2:], (0.5, 0.5, 0.5))
        b.inputs['Base Color'].default_value = (a_[0], a_[1], a_[2], 1); b.inputs['Roughness'].default_value = 0.7
        o.data.materials.append(m)
    # small detail slots 'd_<slot>' (seat rows, lettering, merchandise): no lightmap islands either, lit by the probe like props
    dobjs = [o for o in objs if o.name[2:].startswith('d_')]
    objs = [o for o in objs if o not in dobjs]
    for o in dobjs:
        sl = o.name[4:]; a_ = slot_albedo(sl); m = bpy.data.materials.new('occd_' + sl); m.use_nodes = True; nt = m.node_tree
        b = nt.nodes.get('Principled BSDF'); at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'Col'; at.attribute_type = 'GEOMETRY'
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
        nt.links.new(at.outputs['Color'], mul.inputs[6]); mul.inputs[7].default_value = (a_[0], a_[1], a_[2], 1); nt.links.new(mul.outputs[2], b.inputs['Base Color'])
        o.data.materials.append(m)
    pobjs += dobjs
    if os.environ.get('HB_DEBUG'):
        print('[dbg] scene', bpy.context.scene.name, len(bpy.data.scenes), 'objs', len(bpy.context.scene.objects), [o.name for o in bpy.context.scene.objects if o.type not in ('MESH',)][:10], flush=True)
        print('[dbg] view layers', [vl.name for vl in bpy.context.scene.view_layers], 'collections', [c.name for c in bpy.data.collections][:10], flush=True)
    lobs = add_lights(g.lights, O)
    # bake-only emitters (slot 'bake*': sky outside glass walls, skylights): light the bake, never exported
    emitters = [o for o in objs if o.name.split('_', 1)[1].startswith('bake')]
    objs = [o for o in objs if o not in emitters]
    for o in emitters:
        m = bpy.data.materials.new('em'); m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = (0, 0, 0, 1)
        b.inputs['Emission Color'].default_value = (0.78, 0.86, 1.0, 1); b.inputs['Emission Strength'].default_value = getattr(g, 'sky_k', 3.0)
        o.data.materials.append(m)
    lm_unwrap(objs, res)
    if os.environ.get('HB_DEBUG'):
        for ob in objs:
            uv = np.empty(len(ob.data.loops) * 2, dtype=np.float32); ob.data.uv_layers['lm'].data.foreach_get('uv', uv)
            co = np.empty(len(ob.data.vertices) * 3, dtype=np.float32); ob.data.vertices.foreach_get('co', co)
            print('[dbg] co', ob.name, int(np.isnan(co).sum()), np.nanmin(co.reshape(-1, 3), 0).round(1).tolist(), np.nanmax(co.reshape(-1, 3), 0).round(1).tolist(), [l.name for l in ob.data.uv_layers], [a.name for a in ob.data.attributes][:12], flush=True)
            print('[dbg] lmuv', ob.name, len(ob.data.polygons), np.nanmin(uv) if uv.size else None, np.nanmax(uv) if uv.size else None, int(np.isnan(uv).sum()), flush=True)
    path_lm = os.path.join(OUT, bid, '%s_int_lm.jpg' % bid)
    os.makedirs(os.path.dirname(path_lm), exist_ok=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = devices()
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in objs: ob.select_set(True); ob.data.uv_layers.active = ob.data.uv_layers['lm']
    bpy.context.view_layer.objects.active = objs[0]
    sc.render.bake.target = 'IMAGE_TEXTURES'
    if os.environ.get('HB_DUMP'):
        sc_ = bpy.context.scene; out = {}
        for nm, obj in (('bake', sc_.render.bake), ('cycles', sc_.cycles), ('render', sc_.render), ('vl', bpy.context.view_layer), ('cvl', bpy.context.view_layer.cycles)):
            for pr in obj.bl_rna.properties:
                if pr.identifier in ('rna_type',): continue
                try: v = getattr(obj, pr.identifier)
                except Exception: continue
                if isinstance(v, (int, float, str, bool)): out[nm + '.' + pr.identifier] = v
        for L in bpy.data.lights:
            for pr in L.bl_rna.properties:
                try: v = getattr(L, pr.identifier)
                except Exception: continue
                if isinstance(v, (int, float, str, bool)): out['light.' + L.name + '.' + pr.identifier] = v
        for o in bpy.context.scene.objects:
            out['obj.' + o.name] = (o.hide_render, o.visible_camera, o.visible_diffuse, o.visible_glossy, o.visible_shadow, tuple(round(x, 3) for x in o.scale))
        json.dump(out, open(os.environ['HB_DUMP'], 'w'), indent=0, default=str)
    aux = None if os.environ.get('HB_NOAUX') else (_aux_bake(objs, res, 'albedo', palb), _aux_bake(objs, res, 'normal', palb))
    scale = bake_lightmap(objs, res, samples, path_lm, extra=palb, aux=aux)
    lm_med = LAST[0]
    # night lightmap: lamps only (+ a trickle of skyglow through the windows), half resolution
    path_n = os.path.join(OUT, bid, '%s_int_lmn.jpg' % bid)
    for ld, pw, day in lobs: ld.energy = 0.0 if day else pw
    for o in eobjs:
        sl = o.name[2:]
        if sl in NIGHT_EMIT: o.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = NIGHT_EMIT[sl]
    for o in emitters:
        b = o.data.materials[0].node_tree.nodes.get('Principled BSDF')
        b.inputs['Emission Color'].default_value = NIGHT_SKY + (1,); b.inputs['Emission Strength'].default_value = getattr(g, 'sky_k', 3.0) * NIGHT_SKY_K
    scale_n = bake_lightmap(objs, res // 2, max(96, samples // 2), path_n, night=True, extra=palb, aux=aux)
    # vertex colours keep alpha = 1 (no AO: the lightmap carries it)
    for o in emitters: bpy.data.objects.remove(o, do_unlink=True)
    path = os.path.join(OUT, bid, '%s_int.glb' % bid)
    for o in pobjs + eobjs: o.data.materials.clear()
    kb = export_glb(objs + pobjs + eobjs, path) // 1024
    meta = {'file': '%s_int.glb' % bid, 'lm': '%s_int_lm.jpg' % bid, 'lmScale': round(scale, 5), 'tris': g.tris(), 'kb': kb,
            'lmn': '%s_int_lmn.jpg' % bid, 'lmnScale': round(scale_n, 5), 'lmMed': round(lm_med, 5),
            'rooms': g.rooms, 'doors': g.doors, 'colliders': g.cols, 'decks': g.decks, 'name': getattr(g, 'name', bid)}
    if g.spots: meta['spots'] = g.spots
    if pmeta: meta['props'] = pmeta
    if getattr(g, 'probe', None): meta['probe'] = g.probe
    if getattr(g, 'shot', None): meta['shot'] = [round(v, 2) for v in g.shot]      # dev/int_shots.js review camera
    meta.update(getattr(g, 'extra', {}))
    jp = os.path.join(CACHE, bid + '.json')
    info = json.load(open(jp)) if os.path.exists(jp) else {'id': bid}
    info['interior'] = meta
    # interior links (escalators / elevators between levels): E prompts like the ferry links, tagged to be replaced on rebuild
    info['links'] = [l for l in info.get('links', []) if not l.get('int')] + [dict(l, int=1) for l in getattr(g, 'links', [])]
    if not info['links']: info.pop('links')
    with open(jp, 'w') as f: json.dump(info, f)
    print('[hero] interior %s: %d tris, %d KB glb, lm scale %.4f, %.1f s' % (bid, g.tris(), kb, scale, time.time() - t0), flush=True)
