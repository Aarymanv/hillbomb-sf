"""HILLBOMB car assets: Blender pass over the procedural car models.

Input : tools/blender/_cache/cars/<id>.json  (node tools/blender/cars_export.mjs: HQ loft buckets in the three.js
        car frame, +X right, +Y up, -Z forward, metres).
Output: public/assets/cars/<id>.glb (Draco) + <id>_ao.jpg, and cars.json (merged by --index).

Per car:
  * every bucket becomes a welded mesh (shared positions, per-corner normals / colours / uvs kept exactly),
  * a vented brake disc + a caliper are modelled here (bevelled, subdivided), the rotor joins the wheel,
  * one ray-traced AO atlas (Cycles bake, GPU+CPU) over body, trim, lamps, wheel and caliper; the 4 wheels
    and a ground plane occlude the body, glass does not occlude (so cabins stay lit through the windows),
  * LOD1 / LOD2 = collapse-decimated copies sharing the same AO atlas (uv1),
  * GLB nodes: L{0,1,2}_{paint,paint2,details,lamps,glass,wheel}, caliper.
    uv0 = atlas uv (V flipped by glTF), uv1 = AO uv, uv2 = (metalness, roughness) (V flipped), uv3.x = lamp group.

Run:  python tools/blender/cars.py -- sedan hatch ...   [--res 1024] [--samples 256]
      python tools/blender/cars.py -- --index            (rebuild cars.json from the files present)
"""
import bpy, bmesh, sys, os, json, base64, math, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(HERE, '_cache', 'cars')
OUT = os.path.join(ROOT, 'public', 'assets', 'cars')
if os.environ.get('HB_OUT'): OUT = os.environ['HB_OUT']   # perf A/B baselines (with HB_NOHERO): never the live folder

# LOD targets (triangles) : LOD1 ~ the old full procedural model, LOD2 ~ the old parked proxy
LOD_RATIO = {1: 0.30, 2: 0.035}
WHEEL_RATIO = {1: 0.22, 2: 0.035}
# body pass 2 (car_hero.py): garage cars get a hero level H (player / showroom, up to ~120k tris) above L0 ~30k,
# the most common traffic bodies an L0 ~40k; both then L1 ~5k (24-75 m) and L2 ~1.7k (far, as before)
HERO_IDS = ['hatch', 'tora', 'rallye6', 'stallion18', 'coupe', 'super', 'muscle', 'k5', 'sedan']
TRAFFIC6 = ['sedan', 'hatch', 'suv', 'ev', 'taxi', 'pickup']
HERO_TRIS = {'L0': 30000, 'L1': 5000, 'L2': 1700}
TRAFFIC_L0 = 40000
HERO_WHEEL = {'L0': 0.55, 'L1': 0.12, 'L2': 0.035}


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'ids': [], 'res': 1024, 'samples': 256, 'index': False}
    i = 0
    while i < len(a):
        if a[i] == '--res': o['res'] = int(a[i + 1]); i += 2
        elif a[i] == '--samples': o['samples'] = int(a[i + 1]); i += 2
        elif a[i] == '--index': o['index'] = True; i += 1
        else: o['ids'].append(a[i]); i += 1
    return o


def devices():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices: d.use = d.type in ('OPTIX', 'CPU')
        return 'GPU'
    except Exception:
        return 'CPU'


def arr(b, k, w):
    return np.frombuffer(base64.b64decode(b[k]), dtype=np.float32).reshape(-1, w)


# ---------------------------------------------------------------------------- mesh from a triangle soup
def soup_mesh(name, b, uv_ao=False):
    pos, nor, col, uv, surf, lamp = arr(b, 'pos', 3), arr(b, 'nor', 3), arr(b, 'col', 3), arr(b, 'uv', 2), arr(b, 'surf', 2), arr(b, 'lamp', 1)
    tag = arr(b, 'tag', 1)[:, 0] if 'tag' in b else None
    return make_mesh(name, pos, nor, col, uv, surf, lamp, tag)


def make_mesh(name, pos, nor, col, uv, surf, lamp, tag=None):
    key = np.round(pos / 2e-5).astype(np.int64)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    verts = np.zeros((len(uniq), 3)); cnt = np.zeros(len(uniq))
    np.add.at(verts, inv, pos); np.add.at(cnt, inv, 1); verts /= cnt[:, None]
    tri = inv.reshape(-1, 3)
    ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
    srt = np.sort(tri, axis=1)
    _, first = np.unique(srt, axis=0, return_index=True)
    keep = np.zeros(len(tri), bool); keep[first] = True
    ok &= keep
    corners = np.arange(len(pos)).reshape(-1, 3)[ok].reshape(-1)
    tri = tri[ok]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.astype(np.float32).ravel())
    nt = len(tri)
    me.loops.add(nt * 3); me.loops.foreach_set('vertex_index', tri.ravel().astype(np.int32))
    me.polygons.add(nt)
    me.polygons.foreach_set('loop_start', (np.arange(nt) * 3).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(nt, 3, np.int32))
    me.update(calc_edges=True)
    for lname, data in (('uv0', uv[corners]), ('surf', surf[corners]), ('lamp', np.c_[lamp[corners], np.zeros(len(corners))])):
        L = me.uv_layers.new(name=lname); L.data.foreach_set('uv', data.astype(np.float32).ravel())
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', np.c_[col[corners], np.ones(len(corners))].astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    for p in me.polygons: p.use_smooth = True
    if tag is not None:
        ta = me.attributes.new('tag', 'INT', 'FACE'); ta.data.foreach_set('value', np.round(tag[corners][0::3]).astype(np.int32))
    n = nor[corners]; n /= np.maximum(np.linalg.norm(n, axis=1), 1e-9)[:, None]
    me.normals_split_custom_set(n.tolist())
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------------------- brake disc + caliper (modelled here)
def revolve_profile(bm, prof, segs, col, surf, uvl, sl, cl, uvfn=None):
    """profile [(x_axial, r)] revolved about +X; returns faces. col/surf per face."""
    rings = []
    for (x, r) in prof:
        ring = [bm.verts.new((x, r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs))) for i in range(segs)]
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            paint_face(f, col, surf, uvl, sl, cl, uvfn)


WUV = (32 / 1024, 1 - 32 / 1024)      # the atlas' white texel block (models.js WUV)


def paint_face(f, col, surf, uvl, sl, cl, uvfn=None):
    for l in f.loops:
        l[cl] = (col[0], col[1], col[2], 1.0)
        l[sl].uv = surf
        l[uvl].uv = uvfn(l.vert.co) if uvfn else WUV


def srgb(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def new_bm_mesh(name):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv0'); sl = bm.loops.layers.uv.new('surf'); ll = bm.loops.layers.uv.new('lamp')
    cl = bm.loops.layers.float_color.new('col')
    return me, bm, uvl, sl, ll, cl


def finish_bm(name, me, bm, subsurf=0, smooth_deg=35):
    bm.normal_update()
    bm.to_mesh(me); bm.free()
    me.color_attributes.active_color = me.color_attributes['col']
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    if subsurf:
        m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    apply_mods(ob)
    me.set_sharp_from_angle(angle=math.radians(smooth_deg))
    return ob


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)


def rotor_mesh(meta):
    """vented rotor + hat, in the wheel frame (x = axle, outer face +x), spins with the wheel"""
    R, rb, hw = meta['R'], meta['rimR'], meta['ww'] / 2
    if not rb: rb = R * 0.62
    me, bm, uvl, sl, ll, cl = new_bm_mesh('rotor')
    x0, x1 = -hw * 0.1 - 0.016, -hw * 0.1 + 0.016
    ro, ri = rb * 0.8, rb * 0.47
    disc, vent, hat = srgb(0x8e9196), srgb(0x3a3c40), srgb(0x2a2b2e)
    segs = 64
    # outer face, rim edge, inner face (with a dark vent band showing between the two plates)
    # disc faces carry the rotor marker uv (models.js: uv.y 4..5 = radial 0..1, uv.x = turns): drilled holes, slots and
    # the lathe-turned friction ring are drawn by the wheel shader
    def ruv(co):
        return (math.atan2(co.z, co.y) / (2 * math.pi) % 1.0, 4.0 + min(1.0, max(0.0, (math.hypot(co.y, co.z) - ri) / (ro - ri))))
    revolve_profile(bm, [(x1, ri), (x1, ro - 0.004), (x1 - 0.003, ro)], segs, disc, (0.9, 0.38), uvl, sl, cl, ruv)
    revolve_profile(bm, [(x1 - 0.003, ro), (x1 - 0.009, ro), (x0 + 0.009, ro), (x0 + 0.003, ro)], segs, vent, (0.6, 0.6), uvl, sl, cl)
    revolve_profile(bm, [(x0 + 0.003, ro), (x0, ro - 0.004), (x0, ri)], segs, disc, (0.9, 0.38), uvl, sl, cl, ruv)
    # hat towards the hub face
    revolve_profile(bm, [(x1, ri), (x1 + 0.004, ri * 0.98), (hw * 0.25, ri * 0.9), (hw * 0.3, ri * 0.55), (hw * 0.3, 0.0)], segs, hat, (0.7, 0.45), uvl, sl, cl)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return finish_bm('rotor', me, bm, 0, 40)


def caliper_mesh(meta):
    """4-pot style caliper over the rotor's trailing top edge; vertex colour white = runtime caliper colour"""
    R, rb, hw = meta['R'], meta['rimR'], meta['ww'] / 2
    if not rb: rb = R * 0.62
    me, bm, uvl, sl, ll, cl = new_bm_mesh('caliper')
    xc, t = -hw * 0.1, 0.032
    r0, r1 = rb * 0.6, rb * 0.87
    th0, th1, n = 0.3, 1.3, 10
    grid = []
    for i in range(n + 1):
        th = th0 + (th1 - th0) * i / n
        c, s = math.cos(th), math.sin(th)
        grid.append([bm.verts.new((xc + dx, r * c, r * s)) for (dx, r) in ((-t, r0), (-t, r1), (t, r1), (t, r0))])
    white = [1.0, 1.0, 1.0]
    for a, b in zip(grid[:-1], grid[1:]):
        for k in range(4):
            f = bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
            paint_face(f, white, (0.1, 0.32), uvl, sl, cl)
    for g, rev in ((grid[0], True), (grid[-1], False)):
        f = bm.faces.new(list(reversed(g)) if rev else g)
        paint_face(f, white, (0.1, 0.32), uvl, sl, cl)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = finish_bm('caliper', me, bm, 2, 50)
    return ob


# ---------------------------------------------------------------------------- tyre (modelled here)
KNOBBY = {'baja', 'trophy', 'buggy'}
NREP = 8


def catmull(pts, n=4):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in range(2)))
    out.append(pts[-1])
    return out


def tyre_mesh(meta, cid, segs=64):
    """radial tyre in the wheel frame (x = axle, outer face +x): bead, rim protector, bulged sidewall, rounded shoulders,
    flat tread. uv0 = the tyre texture contract (car_textures.py): x = angle / 2pi * NREP, y = 2 + v (road) / 6 + v (knobby),
    v = 0 outer bead .. 0.32 shoulder .. 0.68 shoulder .. 1 inner bead"""
    R, rb, hw = meta['R'], meta['rimR'] or meta['R'] * 0.62, meta['ww'] / 2
    H = R - rb
    side = [(hw * 0.80, rb + 0.004), (hw * 0.93, rb + 0.012), (hw * 1.00, rb + 0.026), (hw * 1.02, rb + 0.040),
            (hw * 1.045, rb + H * 0.42), (hw * 1.03, rb + H * 0.66), (hw * 0.97, R - 0.024), (hw * 0.88, R - 0.007), (hw * 0.76, R)]
    tread = [(hw * 0.76, R), (hw * 0.38, R + 0.001), (0.0, R + 0.0015), (-hw * 0.38, R + 0.001), (-hw * 0.76, R)]
    sa = catmull(side, 2)
    prof = sa + tread[1:] + [(-x, r) for (x, r) in reversed(sa)][1:]
    # piecewise arclength -> v (sidewall 0..0.32, tread 0.32..0.68, sidewall 0.68..1)
    def arcl(pts):
        d = [0.0]
        for a, b in zip(pts[:-1], pts[1:]): d.append(d[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        return d
    n0 = len(sa); n1 = n0 + len(tread) - 1
    vs = []
    for (i0, i1, v0, v1) in ((0, n0, 0.0, 0.32), (n0 - 1, n1, 0.32, 0.68), (n1 - 1, len(prof), 0.68, 1.0)):
        d = arcl(prof[i0:i1]); L = d[-1] or 1.0
        for k, dd in enumerate(d):
            if i0 + k < len(vs): continue
            vs.append(v0 + (v1 - v0) * dd / L)
    base = 6.0 if cid in KNOBBY else 2.0
    me, bm, uvl, sl, ll, cl = new_bm_mesh('tyre')
    col = srgb(0x1c1c1d)
    rings = []
    for (x, r) in prof:
        rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    for pi in range(len(prof) - 1):
        a, b = rings[pi], rings[pi + 1]
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new((a[i], b[i], b[j], a[j]))          # profile runs outer -> inner: this winding faces out
            uvs = ((i, pi), (i, pi + 1), (i + 1, pi + 1), (i + 1, pi))
            for l, (ii, pp) in zip(f.loops, uvs):
                l[cl] = (col[0], col[1], col[2], 1.0)
                l[sl].uv = (0.0, 0.88)
                l[uvl].uv = (ii / segs * NREP, base + vs[pp])
    return finish_bm('tyre', me, bm, 0, 60)


def strip_tyre(ob):
    """drop the procedural tyre faces (finish tyre (0, 0.86) / tread (0, 0.95)) from the imported JS wheel"""
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    sl = bm.loops.layers.uv['surf']
    dead = []
    for f in bm.faces:
        s0 = f.loops[0][sl].uv
        if abs(s0[0]) < 0.01 and (abs(s0[1] - 0.86) < 0.012 or abs(s0[1] - 0.95) < 0.012): dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(me); bm.free()
    return len(dead)


def bevel_rim(ob, width=0.0012):
    """soft edges on the (procedural, hard-edged) rim so spokes catch a highlight line"""
    try:
        me = ob.data
        if me.has_custom_normals:
            bpy.context.view_layer.objects.active = ob
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        sharp = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(40)]
        if sharp:
            bmesh.ops.bevel(bm, geom=sharp, offset=width, offset_type='OFFSET', segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
        bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(50))
    except Exception as e:
        print('[cars] rim bevel skipped', e)


# ---------------------------------------------------------------------------- AO bake
def _emit_mat(name, build_fn):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(build_fn(nt), em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    return mat, nt


def _math(nt, op, a, b=None, clamp=False):
    m = nt.nodes.new('ShaderNodeMath'); m.operation = op; m.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None: continue
        if isinstance(v, (int, float)): m.inputs[i].default_value = v
        else: nt.links.new(v, m.inputs[i])
    return m.outputs[0]


def _curv(nt):
    g = nt.nodes.new('ShaderNodeNewGeometry')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.clamp = True
    mr.inputs['From Min'].default_value = 0.4; mr.inputs['From Max'].default_value = 0.6
    nt.links.new(g.outputs['Pointiness'], mr.inputs['Value'])
    return mr.outputs['Result']


def _grime(nt):
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 24; ao.inputs['Distance'].default_value = 0.4
    g = nt.nodes.new('ShaderNodeNewGeometry')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(g.outputs['Position'], sp.inputs[0])
    sn = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(g.outputs['Normal'], sn.inputs[0])
    occ = _math(nt, 'SUBTRACT', 1.0, ao.outputs['AO'])                                         # 1 - wide AO
    low = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'DIVIDE', _math(nt, 'SUBTRACT', sp.outputs['Y'], 0.12), 0.75, True))
    down = _math(nt, 'MAXIMUM', _math(nt, 'MULTIPLY', sn.outputs['Y'], -1.0), 0.0)
    acc = _math(nt, 'ADD', _math(nt, 'MULTIPLY', occ, 0.8), _math(nt, 'MULTIPLY', low, 0.45))
    acc = _math(nt, 'ADD', acc, _math(nt, 'MULTIPLY', down, 0.3), True)
    return acc


def bake_masks(targets, res, samples):
    """G = convexity (Cycles pointiness: edges 1, flat 0.5, creases 0), B = grime (wide AO + low + downward faces)"""
    sc = bpy.context.scene
    outs = []
    for name, fn, smp in (('curv', _curv, 8), ('grime', _grime, 128)):
        img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=False)
        img.colorspace_settings.name = 'Non-Color'
        mat, nt = _emit_mat('bk_' + name, fn)
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.nodes.active = tn
        for ob in targets:
            ob.data.materials.clear(); ob.data.materials.append(mat)
            ob.data.uv_layers.active = ob.data.uv_layers['ao']
        sc.cycles.samples = smp
        t = time.time()
        bpy.ops.object.bake(type='EMIT', use_clear=True, margin=6)
        print('[cars] %s bake' % name, round(time.time() - t, 1), 's')
        a = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[..., 0]
        for _ in range(2): a = (a * 4 + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 8   # denoise
        outs.append(a)
        for ob in targets: ob.data.materials.clear()
    return outs


def bake_ao(targets, occluders, res, samples, path):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = devices()
    sc.cycles.samples = samples
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = True
    if not sc.world:
        sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = 0.9
    img = bpy.data.images.new('ao', res, res, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new('bake')
    mat.use_nodes = True
    nt = mat.node_tree
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
    nt.nodes.active = tn
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in targets:
        ob.data.materials.clear(); ob.data.materials.append(mat)
        ob.data.uv_layers.active = ob.data.uv_layers['ao']
        ob.select_set(True)
    for ob in occluders:
        if not ob.data.materials: ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = targets[0]
    t = time.time()
    bpy.ops.object.bake(type='AO', use_clear=True, margin=6)
    print('[cars] AO bake', round(time.time() - t, 1), 's')
    ao = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[..., 0]
    for ob in targets + occluders: ob.data.materials.clear()
    for ob in occluders:
        if not ob.data.materials: ob.data.materials.append(mat)
    curv, grime = bake_masks(targets, res, samples)
    # R = AO (three's aoMap reads .r), G = convexity, B = grime; one RGB jpg per car (models.js masks)
    rgb = bpy.data.images.new('masks', res, res, alpha=False, float_buffer=False)
    rgb.colorspace_settings.name = 'Non-Color'
    rgb.pixels.foreach_set(np.dstack([ao, curv, grime, np.ones_like(ao)]).astype(np.float32).ravel())
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.quality = 88
    rgb.save_render(path, scene=sc)
    for ob in targets + occluders: ob.data.materials.clear()


def ao_unwrap(obs, res):
    """one lightmap-style atlas over all bake targets (joined temporarily so islands pack together)"""
    for ob in obs:
        ob.data.uv_layers.new(name='ao')
        ob.data.uv_layers.active = ob.data.uv_layers['ao']
    for o in bpy.context.selected_objects: o.select_set(False)
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=4.0 / res, rotate=True, shape_method='CONCAVE', margin_method='FRACTION')
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------------------- LODs + export
def dup(ob, name):
    o = ob.copy(); o.data = ob.data.copy(); o.name = name; o.data.name = name
    bpy.context.scene.collection.objects.link(o)
    return o


def decimate(ob, ratio):
    if ratio >= 0.999 or len(ob.data.polygons) < 40: return ob
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
    apply_mods(ob)
    return ob


def tris(ob): return len(ob.data.polygons)


def lod_from(base, lv, body_ratio, wheel_ratio, lens_to_lamps=False, drop_interior=False):
    """decimated copies of the base parts named <lv>_*; returns total tris (wheel x4)"""
    tot = 0; made = {}
    for k, o in base.items():
        if k == 'lens' and lens_to_lamps: continue
        made[k] = dup(o, '%s_%s' % (lv, k))
    if lens_to_lamps and 'lens' in base and 'lamps' in made:
        ln = dup(base['lens'], lv + '_lensx')
        for o in bpy.context.selected_objects: o.select_set(False)
        ln.select_set(True); made['lamps'].select_set(True); bpy.context.view_layer.objects.active = made['lamps']
        bpy.ops.object.join()
    for k, d in made.items():
        if drop_interior and 'int' in d.data.attributes:
            t = np.zeros(len(d.data.polygons), np.int32); d.data.attributes['int'].data.foreach_get('value', t)
            idx = np.nonzero(t == 1)[0]
            if len(idx):
                bm = bmesh.new(); bm.from_mesh(d.data); bm.faces.ensure_lookup_table()
                bmesh.ops.delete(bm, geom=[bm.faces[i] for i in idx], context='FACES'); bm.to_mesh(d.data); bm.free()
        r = wheel_ratio if k == 'wheel' else body_ratio * (1.6 if k in ('glass', 'lamps', 'lens') else 1.0)
        if r < 0.999:
            if d.data.has_custom_normals:
                bpy.context.view_layer.objects.active = d
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
            decimate(d, min(1.0, r))
            d.data.set_sharp_from_angle(angle=math.radians(40 if k != 'wheel' else 50))
        tot += tris(d) * (4 if k == 'wheel' else 1)
    return tot


def build(cid, res, samples):
    t0 = time.time()
    hj = os.path.join(SRC, cid + '.hero.json')
    hero = (cid in HERO_IDS or cid in TRAFFIC6) and os.path.exists(hj) and not os.environ.get('HB_NOHERO')
    with open(hj if hero else os.path.join(SRC, cid + '.json')) as f: D = json.load(f)
    meta, B = D['meta'], D['buckets']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = {k: soup_mesh('L0_' + k, B[k]) for k in ('paint', 'paint2', 'details', 'lamps', 'glass') if k in B}
    if hero:
        sys.path.insert(0, HERE)
        import car_hero
        car_hero.detail(parts, D, log=print)
        import car_body
        car_body.aero(cid, parts, D, log=print)
        res = max(res, 2048)
    wheel = soup_mesh('L0_wheel', B['wheel'])
    custom = meta['custom']
    cal = None
    if not custom and meta.get('style') not in ('cable',):
        nt = strip_tyre(wheel)
        bevel_rim(wheel)
        rot = rotor_mesh(meta)
        ty = tyre_mesh(meta, cid, 96 if hero else 64) if nt else None
        # join the rotor + the new tyre into the wheel (they spin with it)
        for o in bpy.context.selected_objects: o.select_set(False)
        wheel.select_set(True); rot.select_set(True)
        if ty: ty.select_set(True)
        bpy.context.view_layer.objects.active = wheel
        bpy.ops.object.join()
        cal = caliper_mesh(meta)
    # bake scene: wheel + caliper packed in the same atlas but baked away from the body (they move at runtime)
    targets = [o for k, o in parts.items() if k not in ('glass', 'lens')] + [wheel] + ([cal] if cal else [])
    ao_unwrap(targets, res)
    far = (60.0, 0.0, 0.0)
    wheel.location = far
    if cal: cal.location = far
    occ = []
    for (x, z, w) in ((-meta['tf'] / 2, meta['axleFZ'], meta['ww']), (meta['tf'] / 2, meta['axleFZ'], meta['ww']), (-meta['tr'] / 2, meta['axleRZ'], meta['wwR']), (meta['tr'] / 2, meta['axleRZ'], meta['wwR'])):
        o = wheel.copy(); o.data = wheel.data.copy(); o.location = (x, meta['R'], z); o.scale = ((-1 if x < 0 else 1) * w / meta['ww'], 1, 1)
        bpy.context.scene.collection.objects.link(o); occ.append(o)
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0, 0), rotation=(-math.pi / 2, 0, 0))
    ground = bpy.context.active_object; occ.append(ground)
    for k in ('glass', 'lens'):
        if k in parts: parts[k].hide_render = True
    os.makedirs(OUT, exist_ok=True)
    bake_ao(targets, occ, res, samples, os.path.join(OUT, cid + '_ao.jpg'))
    for o in occ: bpy.data.objects.remove(o, do_unlink=True)
    wheel.location = (0, 0, 0)
    if cal: cal.location = (0, 0, 0)
    for k in ('glass', 'lens'):
        if k in parts: parts[k].hide_render = False
    base = dict(parts); base['wheel'] = wheel
    body = sum(tris(o) for k, o in parts.items())
    if hero:
        # traffic-only bodies: the full-detail base is a build input only (B_*, deleted before export), L0 = ~40k
        top = 'H' if cid in HERO_IDS else 'B'
        for k, o in base.items(): o.name = '%s_%s' % (top, k); o.data.name = o.name
        stats = {top: body + 4 * tris(wheel)} if top == 'H' else {}
        levels = [('L0', TRAFFIC_L0 if cid in TRAFFIC6 else HERO_TRIS['L0']), ('L1', HERO_TRIS['L1']), ('L2', HERO_TRIS['L2'])]
        for lv, target in levels:
            wr = HERO_WHEEL[lv]
            br = max(0.005, (target - 4 * tris(wheel) * wr) / max(1, body))
            for it in range(3):
                tot = lod_from(base, lv, br, wr, lens_to_lamps=lv != 'L0', drop_interior=lv != 'L0')
                if tot < target * 1.12 or it == 2: break
                for o in [o for o in bpy.context.scene.objects if o.name.startswith(lv + '_')]: bpy.data.objects.remove(o, do_unlink=True)
                wt = 4 * tris(wheel) * wr
                br *= max(0.2, (target - wt) / max(1.0, tot - wt))
            stats[lv] = tot
        if top == 'B':
            for o in [o for o in bpy.context.scene.objects if o.name.startswith('B_')]: bpy.data.objects.remove(o, do_unlink=True)
    else:
        stats = {'L0': body + 4 * tris(wheel)}
        for lv in (1, 2):
            tot = 0
            for k, o in base.items():
                d = dup(o, 'L%d_%s' % (lv, k))
                r = WHEEL_RATIO[lv] if k == 'wheel' else LOD_RATIO[lv] * (1.6 if k in ('glass', 'lamps') else 1.0)
                decimate(d, min(1.0, r))
                if d.data.has_custom_normals:
                    bpy.context.view_layer.objects.active = d
                    bpy.ops.mesh.customdata_custom_splitnormals_clear()
                d.data.set_sharp_from_angle(angle=math.radians(40 if k != 'wheel' else 50))
                tot += tris(d) * (4 if k == 'wheel' else 1)
            stats['L%d' % lv] = tot
    # export
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    path = os.path.join(OUT, cid + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=False, export_apply=True,
                              export_materials='NONE', export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
                              export_all_vertex_colors=False, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=16 if hero else 15, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12, export_draco_color_quantization=10,
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
    kb = os.path.getsize(path) // 1024 + os.path.getsize(os.path.join(OUT, cid + '_ao.jpg')) // 1024
    info = {'id': cid, 'tris': stats, 'kb': kb, 'caliper': cal is not None, 'hero': hero, 'sec': round(time.time() - t0, 1)}
    with open(os.path.join(SRC, cid + ('.done.json' if not os.environ.get('HB_OUT') else '.done_alt')), 'w') as f: json.dump(info, f)
    print('[cars]', json.dumps(info))


def index():
    ids, tot = [], 0
    for fn in sorted(os.listdir(SRC)):
        if fn.endswith('.done.json'):
            with open(os.path.join(SRC, fn)) as f: d = json.load(f)
            if os.path.exists(os.path.join(OUT, d['id'] + '.glb')):
                ids.append(d); tot += d['kb']
    with open(os.path.join(OUT, 'cars.json'), 'w') as f:
        json.dump({'version': 2, 'cars': {d['id']: {'tris': d['tris'], 'caliper': d['caliper'], **({'hero': True} if d.get('hero') else {})} for d in ids}}, f, indent=1)
    print('[cars] index', len(ids), 'cars', tot // 1024, 'MB')


if __name__ == '__main__':
    o = args()
    if o['index']: index()
    for cid in o['ids']:
        build(cid, o['res'], o['samples'])
