"""Poly Haven furniture / decor in the hero interiors (Blender side).

Interior builders call prop(g, asset, u, y, w, ...) to place a model (frame coords of the IGeo); run_interior() calls
build_props(g, O) which imports each used glTF once (tools/blender/_cache/int_assets/models, int_assets.py --models),
decimates it to a triangle budget, instances every placement and joins the copies per material into objects named
I_p_<asset>__<k> (slot 'p_<asset>__<k>'): UVMap = the model's own UVs (glTF convention on export), 'lm' = lightmap.
Returns (objects, slot_meta, albedo): slot_meta[slot] = {diff, arm, nor, alpha} texture file names (packed to
public/assets/landmarks/_iprops/<asset>/<name>.dds by int_props_pack.py), albedo[slot] = linear mean rgb for the bake.
Front: models face -Y in Blender (+z in game) unless FRONT says otherwise (radians added to the yaw).
"""
import bpy, bmesh, math, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_cache', 'int_assets', 'models')
FRONT = {}            # per-asset yaw offset (radians) when the model's front is not -Y
TRIS = {'Chandelier_01': 9000, 'Chandelier_02': 9000, 'Chandelier_03': 9000, 'chinese_chandelier': 6000, 'lantern_chandelier_01': 5000,
        'potted_plant_01': 24000, 'potted_plant_02': 7000, 'potted_plant_04': 16000, 'pachira_aquatica_01': 20000, 'calathea_orbifolia_01': 12000,
        'fern_02': 6500, 'vintage_grandfather_clock_01': 5000}
DEFAULT_TRIS = 2500
# multi-variant files (objects <name>_a, _b ... laid out side by side): one variant per placement (cycled when not given)
VARIANTS = {'pachira_aquatica_01': 'abcd', 'calathea_orbifolia_01': 'abcde', 'fern_02': 'abcd'}
SKIP = ('ground',)


def prop(g, asset, u, y, w, face=None, yaw=0.0, s=1.0, tris=None, collide=True, fit=None, hang=False, variant=None):
    """place `asset` at frame (u, y, w) (bounds centred on u, w; base at y, or the top at y when hang). face=(u, w) point it looks at (else yaw in frame radians, 0 = facing -w, i.e.
    toward the street side). fit=(sx, sy, sz) metres: scale the model to that bounding size (overrides s, uniform = min)."""
    if not hasattr(g, 'props'): g.props = []
    x, z = g.xz(u, w)
    a, t, n = g.F
    if face is not None:
        fx, fz = g.xz(face[0], face[1]); dx, dz = fx - x, fz - z
    else:
        # frame direction -w rotated by yaw (about +y)
        d0 = (-n[0], -n[1]); c, sn = math.cos(yaw), math.sin(yaw)
        dx, dz = d0[0] * c - d0[1] * sn, d0[0] * sn + d0[1] * c
    if variant is None and asset in VARIANTS: variant = VARIANTS[asset][len(g.props) % len(VARIANTS[asset])]
    g.props.append({'variant': variant, 'asset': asset, 'x': x, 'y': y, 'z': z, 'dx': dx, 'dz': dz, 's': s, 'fit': fit, 'tris': tris, 'collide': collide and not hang, 'hang': hang})


TREES = os.path.join(HERE, '..', '..', 'public', 'assets', 'trees')


def _path(asset):
    """'tree:<species>' = the game's own tree LOD0 (tools/blender/trees.py: bark tubes + leaf cards on the shared atlas)"""
    if asset.startswith('tree:'): return os.path.join(TREES, asset[5:] + '_lod0.glb')
    return os.path.join(SRC, asset, asset + '_1k.gltf')


def prop_xz(g, asset, x, z, y, **kw):
    """prop() at a WORLD (x, z) point"""
    a, t, n = g.F
    dx, dz = x - a[0], z - a[1]
    prop(g, asset, dx * t[0] + dz * t[1], y, dx * n[0] + dz * n[1], **kw)


def _import(asset, variant=None):
    path = _path(asset)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    drop = [o for o in objs if any(k in o.name.lower() for k in SKIP) or (variant and not o.name.split('.')[0].endswith('_' + variant))]
    if variant and len(drop) == len(objs): drop = [o for o in objs if any(k in o.name.lower() for k in SKIP)]
    for o in drop: bpy.data.objects.remove(o, do_unlink=True)
    objs = [o for o in objs if o not in drop]
    for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
        pass
    # bake parent transforms into the meshes, unparent, drop empties
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.context.view_layer.update()
    for o in objs:
        o.data = o.data.copy(); o.data.transform(o.matrix_world); o.matrix_world.identity()
    for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    return objs


def _decimate(objs, target):
    tot = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    if tot <= target: return tot
    r = max(0.02, target / tot)
    for o in objs:
        if o.data.shape_keys: o.shape_key_clear()       # some models ship shape keys (the decimate modifier refuses them)
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r; m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        for q in bpy.context.selected_objects: q.select_set(False)
        o.select_set(True)
        bpy.ops.object.modifier_apply(modifier='dec')
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


def _tex_of(mat, socket):
    """image file name feeding a Principled input (through normal-map / separate nodes)"""
    if not mat or not mat.use_nodes: return None
    b = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: return None
    seen = set()
    def walk(sock):
        for l in sock.links:
            nd = l.from_node
            if nd in seen: continue
            seen.add(nd)
            if nd.type == 'TEX_IMAGE' and nd.image: return nd.image
            for i in nd.inputs:
                r = walk(i)
                if r: return r
        return None
    return walk(b.inputs[socket])


def _gltf_mats(asset):
    """material name -> {diff, arm, nor, alpha, color, emissive} straight from the glTF (Blender merges/renames images)"""
    import json
    g = json.load(open(os.path.join(SRC, asset, asset + '_1k.gltf')))
    imgs = [os.path.basename(i.get('uri', '')) for i in g.get('images', [])]; tex = g.get('textures', [])
    f = lambda t: imgs[tex[t['index']]['source']] if t else None
    out = {}
    for m in g.get('materials', []):
        pb = m.get('pbrMetallicRoughness', {})
        em = m.get('emissiveFactor') or [0, 0, 0]
        out[m.get('name', '')] = {'diff': f(pb.get('baseColorTexture')), 'arm': f(pb.get('metallicRoughnessTexture')), 'nor': f(m.get('normalTexture')),
                                  'alpha': m.get('alphaMode') in ('MASK', 'BLEND'), 'color': pb.get('baseColorFactor', [1, 1, 1, 1]),
                                  'glass': 'KHR_materials_transmission' in m.get('extensions', {}) or 'glass' in m.get('name', '').lower() or 'crystal' in m.get('name', '').lower(),
                                  'emissive': max(em) > 0.05 or bool(m.get('emissiveTexture')) or any(k in m.get('name', '').lower() for k in ('lamp', 'bulb', 'light'))}
    return out


def _albedo(img):
    if not img: return (0.6, 0.6, 0.6)
    try:
        im = img.copy(); im.scale(32, 32)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
        bpy.data.images.remove(im)
        rgb = px[:, :3].mean(0)
        if img.colorspace_settings.name == 'sRGB':   # pixels are stored values; to linear
            rgb = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
        return tuple(float(v) for v in rgb)
    except Exception:
        return (0.6, 0.6, 0.6)


def build_props(g, O):
    """-> (slot geometry dicts in game coords, slot meta, albedo per slot, colliders)"""
    from mathutils import Matrix
    P = getattr(g, 'props', [])
    if not P: return {}, {}, {}, []
    geo, meta, alb, cols = {}, {}, {}, []
    by = {}
    for p in P: by.setdefault((p['asset'], p.get('variant')), []).append(p)
    for (asset, variant), pl in by.items():
        if os.environ.get('HB_ONLYPROP') and asset not in os.environ['HB_ONLYPROP'].split(','): continue
        if not os.path.exists(_path(asset)):
            print('[props] missing', asset, flush=True); continue
        src = _import(asset, variant)
        if not src: continue
        gm = _gltf_mats(asset) if not asset.startswith('tree:') else {}
        tris = 0 if os.environ.get('HB_NODEC') else _decimate(src, pl[0]['tris'] or TRIS.get(asset, 60000 if asset.startswith('tree:') else DEFAULT_TRIS))
        # bounds of the source (Blender axes: x, y, z-up)
        V = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in src])
        lo, hi = V.min(0), V.max(0)
        # material groups
        groups = {}
        for o in src:
            for i, ms in enumerate(o.material_slots):
                groups.setdefault(ms.material.name if ms.material else 'none', ms.material)
        names = list(groups.keys())
        merged = {k: [] for k in names}
        for p in pl:
            sc = p['s']
            if p['fit']:
                ext = [hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]]   # x, height, depth
                sc = min(f / max(e, 1e-3) for f, e in zip(p['fit'], ext) if f)
            # game facing (dx, dz) -> Blender (dx, -dz); model front = -Y
            bx, by_ = p['dx'], -p['dz']
            th = math.atan2(bx, -by_) + FRONT.get(asset, 0.0)
            # centre the bounds on the spot, base (or top when hanging) at y
            C0 = Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -(hi[2] if p['hang'] else lo[2])))
            M = Matrix.Translation((p['x'] - O[0], -(p['z'] - O[2]), p['y'] - O[1])) @ Matrix.Rotation(th, 4, 'Z') @ Matrix.Scale(sc, 4) @ C0
            for o in src:
                me = o.data.copy(); me.transform(M)
                # split by material: keep polygons per slot via a separate copy per material
                for i, ms in enumerate(o.material_slots):
                    key = ms.material.name if ms.material else 'none'
                    if len(o.material_slots) == 1:
                        part = me
                    else:
                        part = me.copy(); bm = bmesh.new(); bm.from_mesh(part)
                        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != i], context='FACES')
                        bm.to_mesh(part); bm.free()
                    merged[key].append(part)
            if p['collide']:
                hx, hz = (hi[0] - lo[0]) * sc / 2, (hi[1] - lo[1]) * sc / 2
                if (hi[2] - lo[2]) * sc > 0.35 and max(hx, hz) > 0.12:
                    cx, cy = 0.0, 0.0
                    c, s_ = math.cos(th), math.sin(th)
                    wx, wy = cx * c - cy * s_, cx * s_ + cy * c          # Blender offset of the bounds centre
                    # game yaw of the box's local x axis (Blender x rotated by th): game (cos th, -sin th)
                    cols.append({'x': round(p['x'] + wx, 2), 'z': round(p['z'] - wy, 2), 'hx': round(hx, 2), 'hz': round(hz, 2),
                                 'yaw': round(math.atan2(s_, c), 4), 'yMin': round(p['y'] - 0.2, 2), 'yMax': round(p['y'] + (hi[2] - lo[2]) * sc, 2)})
            p['size'] = ((hi[0] - lo[0]) * sc, (hi[2] - lo[2]) * sc, (hi[1] - lo[1]) * sc)
        for k, key in enumerate(names):
            parts = merged[key]
            if not parts: continue
            slot = 'p_%s__%s%d' % (asset.replace(':', '_'), variant or '', k)
            bm = bmesh.new()
            for me in parts: bm.from_mesh(me)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
            uvl = bm.loops.layers.uv.get('UVMap') or (bm.loops.layers.uv[0] if len(bm.loops.layers.uv) else None)
            bm.verts.index_update()
            # slot geometry in GAME coordinates (Geo slot dict: v, f, uv per face, c per face) -> to_object() like the architecture
            V = [(v.co.x + O[0], v.co.z + O[1], -v.co.y + O[2]) for v in bm.verts]
            Fc = [[l.vert.index for l in f.loops] for f in bm.faces]
            UV = [[tuple(l[uvl].uv) for l in f.loops] if uvl else None for f in bm.faces]
            bm.free()
            geo[slot] = {'v': V, 'f': Fc, 'uv': UV, 'c': [(1.0, 1.0, 1.0, 1.0)] * len(Fc)}
            mat = groups[key]
            if asset.startswith('tree:'):     # shared leaf / bark atlas (BC3, premultiplied alpha), alpha-tested
                meta[slot] = {'asset': asset, 'ext': 'trees/', 'diff': 'leaves_albedo.dds', 'alpha': True}
                alb[slot] = (0.1, 0.16, 0.06)
                for me_ in parts:
                    try: bpy.data.meshes.remove(me_)
                    except Exception: pass
                continue
            G = gm.get(key) or gm.get(key.rsplit('.', 1)[0]) or {}
            if (G.get('emissive') and not G.get('diff')) or G.get('glass'):
                # bulbs / lamp glass -> the shared emissive 'lampI' slot; chandelier crystal / glass -> 'crystal' (glints, bloom)
                key_ = 'crystal_p' if G.get('glass') else 'lampI_p'
                d = geo.pop(slot); d['c'] = [(1.0, 0.95, 0.88, 1.0) if G.get('glass') else (1.0, 0.86, 0.62, 1.0)] * len(d['f']); d['uv'] = [None] * len(d['f'])
                geo.setdefault(key_, {'v': [], 'f': [], 'uv': [], 'c': []})
                L = geo[key_]; off = len(L['v']); L['v'] += d['v']; L['f'] += [[i + off for i in f_] for f_ in d['f']]; L['uv'] += d['uv']; L['c'] += d['c']
            else:
                meta[slot] = {'asset': asset, 'diff': G.get('diff'), 'arm': G.get('arm'), 'nor': G.get('nor'), 'alpha': bool(G.get('alpha'))}
                img = _tex_of(mat, 'Base Color')
                alb[slot] = _albedo(img) if img else tuple(float(x) for x in (G.get('color') or [0.6] * 3)[:3])
            for me_ in parts:
                try: bpy.data.meshes.remove(me_)
                except Exception: pass
        for o in src: bpy.data.objects.remove(o, do_unlink=True)
        print('[props] %s x%d, %d tris each, bounds %s, scale %s' % (asset, len(pl), tris, np.round(hi - lo, 2).tolist(), sorted(set(round(p.get('size', (0,))[0], 2) for p in pl))), flush=True)
    return geo, meta, alb, cols
