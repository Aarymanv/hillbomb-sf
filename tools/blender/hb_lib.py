"""HILLBOMB Blender baking library: scene/render setup, interior-mapping camera,
PBR materials from public/assets/tex, a bmesh-based mesh builder, procedural
images and image IO (no PIL needed: everything goes through bpy images).

Shared by rooms.py and shops.py.  Blender frame used by every generator:
  +X = right (as seen from the street), +Y = into the room (window plane at Y=0,
  back wall at Y=depth), +Z = up (floor at Z=0).
"""
import bpy, bmesh, math, os, random, time
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TEX = os.path.join(ROOT, 'public', 'assets', 'tex')
BAKED = os.path.join(ROOT, 'public', 'assets', 'baked')
CACHE = os.path.join(HERE, '_cache')

# ----------------------------------------------------------------------------
# scene / render
# ----------------------------------------------------------------------------
_STATE = {'dev': None}


def reset_factory():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear(); _IMGS.clear(); _MEANS.clear(); MAT_HOOKS.clear(); OBJ_HOOKS.clear()


def clear_objects():
    """Remove every object/mesh/light/curve but keep materials and images."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.lights, bpy.data.curves, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)
    OBJ_HOOKS.clear()


def pick_device(prefer_gpu=True):
    if _STATE['dev'] is not None:
        return _STATE['dev']
    dev = 'CPU'
    if prefer_gpu:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try:
                prefs.compute_device_type = t
                prefs.get_devices()
            except Exception:
                continue
            ok = False
            for d in prefs.devices:
                d.use = (d.type == t)
                ok = ok or d.use
            if ok:
                dev = 'GPU:' + t
                break
    _STATE['dev'] = dev
    print('[hb] render device', dev)
    return dev


def setup_render(res_x, res_y, samples=128, look='Medium High Contrast', exposure=0.0, gpu=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    dev = pick_device(gpu)
    sc.cycles.device = 'GPU' if dev.startswith('GPU') else 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.008
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    sc.cycles.denoising_prefilter = 'ACCURATE'
    try:
        sc.cycles.denoising_quality = 'HIGH'
    except Exception:
        pass
    sc.cycles.denoising_use_gpu = dev.startswith('GPU')
    sc.cycles.max_bounces = 10
    sc.cycles.diffuse_bounces = 5
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 8
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.sample_clamp_direct = 0
    sc.cycles.sample_clamp_indirect = 6.0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    sc.cycles.seed = 7
    sc.render.use_persistent_data = True
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.use_border = False
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = look
    except Exception:
        sc.view_settings.look = 'None'
    sc.view_settings.exposure = exposure
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = 'sRGB'
    sc.sequencer_colorspace_settings.name = 'sRGB'
    im = sc.render.image_settings
    im.file_format = 'PNG'
    im.color_mode = 'RGB'
    im.color_depth = '8'
    im.compression = 15
    return sc


def render_to(path):
    sc = bpy.context.scene
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t


# ----------------------------------------------------------------------------
# interior-mapping camera
# ----------------------------------------------------------------------------

def setup_im_camera(width_m, height_m, depth_m, res_x, res_y, cam_dist=None):
    """Pinhole camera reproducing the interior-mapping contract.

    Room: X in [-W/2, W/2], Z in [0, H], window plane Y=0, back wall Y=depth.
    Camera sits on the window axis at Y = -C (C = depth, i.e. normalised C = D = 1),
    looking +Y, and the window rectangle exactly fills the frame.  X and Z spans
    differ from the pixel aspect, so non-square pixels (pixel_aspect_x/y) make the
    mapping exact in both axes:   u = 0.5 + 0.5*x*C/(C - z)   (normalised coords).
    """
    C = depth_m if cam_dist is None else cam_dist
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('im_cam')
    cd.type = 'PERSP'
    cd.lens_unit = 'MILLIMETERS'
    cd.sensor_fit = 'HORIZONTAL'
    cd.sensor_width = 36.0
    cd.lens = 36.0 * C / width_m          # tan(hfov/2) = (W/2)/C
    cd.shift_x = cd.shift_y = 0.0
    cd.clip_start = 0.05
    cd.clip_end = 200.0
    cam = bpy.data.objects.new('im_cam', cd)
    sc.collection.objects.link(cam)
    cam.location = (0.0, -C, height_m / 2.0)
    cam.rotation_euler = (math.pi / 2, 0.0, 0.0)
    sc.camera = cam
    frame_aspect = width_m / height_m
    res_aspect = res_x / res_y
    r = frame_aspect / res_aspect
    if r >= 1:
        sc.render.pixel_aspect_x, sc.render.pixel_aspect_y = r, 1.0
    else:
        sc.render.pixel_aspect_x, sc.render.pixel_aspect_y = 1.0, 1.0 / r
    return cam


def contract_uv(X, Y, Z, W, H, Dm):
    """Normalised contract: x=X/(W/2), y=(Z-H/2)/(H/2), z=-Y/Dm (D=C=1)."""
    x = X / (W / 2); y = (Z - H / 2) / (H / 2); z = -Y / Dm
    C = 1.0
    return 0.5 + 0.5 * x * C / (C - z), 0.5 + 0.5 * y * C / (C - z)


def verify_projection(W, H, Dm, res_x, res_y, label=''):
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    cam = sc.camera
    bpy.context.view_layer.update()
    worst = 0.0
    rows = []
    for X in (-W / 2, W / 2):
        for Z in (0.0, H):
            for Y in (0.0, Dm):
                p = world_to_camera_view(sc, cam, Vector((X, Y, Z)))
                u, v = contract_uv(X, Y, Z, W, H, Dm)
                ex = abs(p.x - u) * res_x; ey = abs(p.y - v) * res_y
                worst = max(worst, ex, ey)
                rows.append((X, Y, Z, round(p.x, 5), round(p.y, 5), round(u, 5), round(v, 5)))
    print(f'[hb] projection check {label}: worst error {worst:.4f} px')
    for r in rows:
        print('   corner X=%5.2f Y=%5.2f Z=%5.2f  blender(u,v)=(%.5f, %.5f)  contract=(%.5f, %.5f)' % r)
    return worst


# ----------------------------------------------------------------------------
# variant switching (day/night): hooks registered by builders
# ----------------------------------------------------------------------------
GAIN = {'day': 1.0, 'night': 1.0}   # global multipliers for variant-switched lights
MAT_HOOKS = []   # persistent (materials/world survive clear_objects)
OBJ_HOOKS = []   # per-scene (lights), cleared with the objects


def on_variant(fn, persistent=True):
    (MAT_HOOKS if persistent else OBJ_HOOKS).append(fn)
    return fn


def set_variant(variant):
    for fn in MAT_HOOKS + OBJ_HOOKS:
        fn(variant)


def light(kind, loc, power, color=(1, 1, 1), radius=0.05, rot=None, size=(1, 1), name='L',
          day=None, night=None, cam_vis=False, spot=None, color_night=None):
    """Create a light. day/night: power for each variant (None = use `power` always)."""
    ld = bpy.data.lights.new(name, kind)
    ld.color = color[:3]
    ld.energy = power
    if kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = radius
    if kind == 'AREA':
        ld.shape = 'RECTANGLE'
        ld.size, ld.size_y = size
    if kind == 'SPOT' and spot:
        ld.spot_size, ld.spot_blend = spot
    if kind == 'SUN':
        ld.angle = radius
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    ob.visible_camera = cam_vis
    if day is not None or night is not None:
        dv = power if day is None else day
        nv = power if night is None else night

        cd, cn = tuple(color[:3]), tuple((color_night or color)[:3])

        def hook(v, ld=ld, dv=dv, nv=nv, cd=cd, cn=cn):
            ld.energy = dv * GAIN['day'] if v == 'day' else nv * GAIN['night']
            ld.color = cd if v == 'day' else cn
        on_variant(hook, persistent=False)
    return ob


def kelvin(t):
    """Approximate linear RGB of a black body (normalised, max=1)."""
    t = t / 100.0
    if t <= 66:
        r = 255
        g = 99.4708025861 * math.log(t) - 161.1195681661
        b = 0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307
    else:
        r = 329.698727446 * (t - 60) ** -0.1332047592
        g = 288.1221695283 * (t - 60) ** -0.0755148492
        b = 255
    c = [max(0.0, min(255.0, x)) / 255.0 for x in (r, g, b)]
    c = [x ** 2.2 for x in c]
    m = max(c)
    return tuple(x / m for x in c)


# ----------------------------------------------------------------------------
# materials
# ----------------------------------------------------------------------------
_MATS = {}
_IMGS = {}
_MEANS = {}


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def hexc(h, lin=True):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(srgb_to_lin(c)) if lin else tuple(c)


def tex_image(key, kind):
    k = (key, kind)
    if k in _IMGS:
        return _IMGS[k]
    p = os.path.join(TEX, key, kind + '.jpg')
    if not os.path.exists(p):
        _IMGS[k] = None
        return None
    im = bpy.data.images.load(p, check_existing=True)
    if kind != 'color':
        im.colorspace_settings.name = 'Non-Color'
    _IMGS[k] = im
    return im


def tex_mean(key):
    """Mean linear colour of a texture's color map (to re-tint it)."""
    if key in _MEANS:
        return _MEANS[key]
    im = tex_image(key, 'color')
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(-1, 4)[::7, :3]
    m = srgb_to_lin(px).mean(axis=0)
    _MEANS[key] = tuple(float(x) for x in m)
    return _MEANS[key]


def _nt(mat):
    try:
        mat.use_nodes = True
    except Exception:
        pass
    return mat.node_tree


def mix_rgb(nt, fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    n.blend_type = blend
    ins = [i for i in n.inputs]
    fa = [i for i in ins if i.name == 'Factor' and i.type == 'VALUE'][0]
    A = [i for i in ins if i.name == 'A' and i.type == 'RGBA'][0]
    B = [i for i in ins if i.name == 'B' and i.type == 'RGBA'][0]
    out = [o for o in n.outputs if o.type == 'RGBA'][0]
    for sock, val in ((fa, fac), (A, a), (B, b)):
        if isinstance(val, bpy.types.NodeSocket):
            nt.links.new(val, sock)
        elif isinstance(val, (int, float)):
            sock.default_value = val
        else:
            sock.default_value = tuple(val) + ((1.0,) if len(val) == 3 else ())
    return out


def vmul(nt, a, b):
    n = nt.nodes.new('ShaderNodeVectorMath')
    n.operation = 'MULTIPLY'
    for sock, val in ((n.inputs[0], a), (n.inputs[1], b)):
        if isinstance(val, bpy.types.NodeSocket):
            nt.links.new(val, sock)
        else:
            sock.default_value = tuple(val)[:3]
    return n.outputs[0]


def math_node(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for sock, val in ((n.inputs[0], a), (n.inputs[1], b)):
        if val is None:
            continue
        if isinstance(val, bpy.types.NodeSocket):
            nt.links.new(val, sock)
        else:
            sock.default_value = val
    return n.outputs[0]


def noise_fac(nt, scale=8.0, detail=4.0, coord='Object', lo=0.0, hi=1.0):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs[coord], n.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.3
    mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value = lo
    mr.inputs['To Max'].default_value = hi
    nt.links.new(n.outputs['Fac'], mr.inputs['Value'])
    return mr.outputs['Result']


def principled(nt):
    p = nt.nodes.get('Principled BSDF')
    if p is None:
        p = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = nt.nodes.get('Material Output') or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(p.outputs[0], out.inputs['Surface'])
    return p


def M(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, spec=0.5, coat=0.0, coat_rough=0.05,
      attr=False, rough_var=0.08, sheen=0.0, emit=None, emit_strength=0.0, transmission=0.0,
      ior=1.45, alpha=1.0, subsurface=0.0, bump=0.0, bump_scale=60.0, lin=True):
    """Plain Principled material. color is linear unless lin=False (then sRGB hex/tuple)."""
    if name in _MATS:
        return _MATS[name]
    if isinstance(color, str):
        color = hexc(color)
    elif not lin:
        color = tuple(srgb_to_lin(color))
    m = bpy.data.materials.new(name)
    nt = _nt(m)
    p = principled(nt)
    col_src = tuple(color)[:3]
    if attr:
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = 'Col'
        col_src = vmul(nt, a.outputs['Color'], color)
        nt.links.new(col_src, p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = col_src + (1.0,)
    p.inputs['Metallic'].default_value = metal
    if rough_var > 0:
        f = noise_fac(nt, 6.0, 3.0, 'Object', max(0.02, rough - rough_var), min(1.0, rough + rough_var))
        nt.links.new(f, p.inputs['Roughness'])
    else:
        p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    p.inputs['IOR'].default_value = ior
    if coat > 0:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    if sheen > 0:
        p.inputs['Sheen Weight'].default_value = sheen
    if transmission > 0:
        p.inputs['Transmission Weight'].default_value = transmission
    if subsurface > 0:
        p.inputs['Subsurface Weight'].default_value = subsurface
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    if emit is not None:
        p.inputs['Emission Color'].default_value = tuple(emit)[:3] + (1.0,)
        p.inputs['Emission Strength'].default_value = emit_strength
    if bump > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = bump_scale
        nz.inputs['Detail'].default_value = 6
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        b = nt.nodes.new('ShaderNodeBump')
        b.inputs['Strength'].default_value = bump
        b.inputs['Distance'].default_value = 0.002
        nt.links.new(nz.outputs['Fac'], b.inputs['Height'])
        nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    _MATS[name] = m
    return m


def MT(name, key, tint=None, scale=1.0, rough_mul=1.0, rough_add=0.0, normal=1.0, metal=0.0,
       spec=0.5, coat=0.0, detail=1.0, attr=False, ao=0.6, rot=0.0, sheen=0.0, lin=False):
    """Textured PBR material from public/assets/tex/<key>.  scale = metres per texture tile.
    tint: target mean colour (sRGB tuple/hex unless lin=True); the photo texture is
    re-coloured to that mean while keeping its detail.  detail<1 flattens toward tint."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    nt = _nt(m)
    p = principled(nt)
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0 / scale, 1.0 / scale, 1.0)
    mp.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])

    def img(kind):
        im = tex_image(key, kind)
        if im is None:
            return None
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = im
        n.interpolation = 'Cubic' if kind == 'color' else 'Linear'
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
        return n

    c = img('color')
    col = c.outputs['Color']
    if tint is not None:
        if isinstance(tint, str):
            tl = hexc(tint)
        elif lin:
            tl = tuple(tint)
        else:
            tl = tuple(srgb_to_lin(tint))
        mean = tex_mean(key)
        k = tuple(tl[i] / max(1e-4, mean[i]) for i in range(3))
        col = vmul(nt, col, k)
        if detail < 1.0:
            col = mix_rgb(nt, 1.0 - detail, col, tl)
    elif detail < 1.0:
        mean = tex_mean(key)
        col = mix_rgb(nt, 1.0 - detail, col, mean)
    if attr:
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = 'Col'
        col = vmul(nt, col, a.outputs['Color'])
    aon = img('ao') if ao > 0 else None
    if aon is not None:
        aof = mix_rgb(nt, ao, (1, 1, 1), aon.outputs['Color'])
        col = vmul(nt, col, aof)
    nt.links.new(col, p.inputs['Base Color'])
    r = img('rough')
    if r is not None:
        rr = math_node(nt, 'MULTIPLY_ADD', r.outputs['Color'], rough_mul)
        rr.node.inputs[2].default_value = rough_add
        rr.node.use_clamp = True
        nt.links.new(rr, p.inputs['Roughness'])
    else:
        p.inputs['Roughness'].default_value = 0.5 * rough_mul + rough_add
    if normal > 0:
        nm = img('normal')
        if nm is not None:
            nn = nt.nodes.new('ShaderNodeNormalMap')
            nn.uv_map = 'UVMap'
            nn.inputs['Strength'].default_value = normal
            nt.links.new(nm.outputs['Color'], nn.inputs['Color'])
            nt.links.new(nn.outputs['Normal'], p.inputs['Normal'])
    mt = img('metal') if metal > 0 else None
    if mt is not None:
        nt.links.new(mt.outputs['Color'], p.inputs['Metallic'])
    else:
        p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    if coat > 0:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.08
    if sheen > 0:
        p.inputs['Sheen Weight'].default_value = sheen
    _MATS[name] = m
    return m


def M_emit(name, color=(1, 1, 1), day=0.0, night=5.0, base=None, rough=0.4, image=None,
           lin=True):
    """Emissive material whose strength switches with the variant."""
    if name in _MATS:
        return _MATS[name]
    if isinstance(color, str):
        color = hexc(color)
    m = bpy.data.materials.new(name)
    nt = _nt(m)
    p = principled(nt)
    b = base if base is not None else (0.8, 0.8, 0.8)
    p.inputs['Base Color'].default_value = tuple(b)[:3] + (1.0,)
    p.inputs['Roughness'].default_value = rough
    if image is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = image
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        ec = vmul(nt, t.outputs['Color'], color)
        nt.links.new(ec, p.inputs['Emission Color'])
    else:
        p.inputs['Emission Color'].default_value = tuple(color)[:3] + (1.0,)
    sock = p.inputs['Emission Strength']
    sock.default_value = night

    def hook(v, sock=sock, d=day, n=night):
        sock.default_value = d if v == 'day' else n
    on_variant(hook)
    _MATS[name] = m
    return m


def M_shade(name, color=(0.9, 0.85, 0.75), trans=0.55, day_emit=0.0, night_emit=0.0):
    """Translucent fabric lampshade (Diffuse + Translucent mix)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    nt = _nt(m)
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = nt.nodes.get('Material Output') or nt.nodes.new('ShaderNodeOutputMaterial')
    d = nt.nodes.new('ShaderNodeBsdfDiffuse'); d.inputs['Color'].default_value = tuple(color) + (1,)
    t = nt.nodes.new('ShaderNodeBsdfTranslucent'); t.inputs['Color'].default_value = tuple(color) + (1,)
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = trans
    nt.links.new(d.outputs[0], mx.inputs[1]); nt.links.new(t.outputs[0], mx.inputs[2])
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = tuple(kelvin(2900)) + (1,)
    e.inputs['Strength'].default_value = night_emit
    ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(mx.outputs[0], ad.inputs[0]); nt.links.new(e.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    sock = e.inputs['Strength']

    def hook(v, sock=sock):
        sock.default_value = day_emit if v == 'day' else night_emit
    on_variant(hook)
    _MATS[name] = m
    return m


def M_leaf(name, color=(0.05, 0.16, 0.03), trans=0.3):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    nt = _nt(m)
    p = principled(nt)
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'Col'
    col = vmul(nt, a.outputs['Color'], color)
    nt.links.new(col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.42
    p.inputs['Specular IOR Level'].default_value = 0.45
    out = nt.nodes.get('Material Output')
    t = nt.nodes.new('ShaderNodeBsdfTranslucent')
    nt.links.new(vmul(nt, col, (1.4, 1.8, 0.6)), t.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = trans
    nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(t.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    _MATS[name] = m
    return m


def M_image(name, image, rough=0.5, coat=0.0, emit_day=0.0, emit_night=0.0, spec=0.5, gain=1.0):
    """Material showing a (procedural) image through the UV map (0..1 over the face)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    nt = _nt(m)
    p = principled(nt)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image; t.extension = 'EXTEND'
    t.interpolation = 'Cubic'
    nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
    col = t.outputs['Color']
    if gain != 1.0:
        col = vmul(nt, col, (gain, gain, gain))
    nt.links.new(col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    if coat:
        p.inputs['Coat Weight'].default_value = coat
    if emit_day or emit_night:
        nt.links.new(t.outputs['Color'], p.inputs['Emission Color'])
        sock = p.inputs['Emission Strength']
        sock.default_value = emit_night

        def hook(v, sock=sock):
            sock.default_value = emit_day if v == 'day' else emit_night
        on_variant(hook)
    _MATS[name] = m
    return m


# ----------------------------------------------------------------------------
# mesh builder
# ----------------------------------------------------------------------------
BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def TR(x=0.0, y=0.0, z=0.0, rz=0.0, rx=0.0, ry=0.0, s=None):
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')
    if s is not None:
        if isinstance(s, (int, float)):
            s = (s, s, s)
        m = m @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    return m


class MB:
    """bmesh builder with per-corner colour ('Col'), box-projected UVs in metres
    ('UVMap') and multi-material support (m=index)."""

    def __init__(self, M=None):
        self.bm = bmesh.new()
        self.uvl = self.bm.loops.layers.uv.new('UVMap')
        self.cl = self.bm.loops.layers.float_color.new('Col')
        self.M = M if M is not None else Matrix.Identity(4)

    def _fin(self, faces, color=(1, 1, 1), m=0, uv='box', uvs=None):
        c = tuple(color)[:3] + (1.0,)
        for fi, f in enumerate(faces):
            f.material_index = m
            f.normal_update()
            if uv == 'box':
                n = f.normal
                ax = max(range(3), key=lambda i: abs(n[i]))
                for l in f.loops:
                    co = l.vert.co
                    if ax == 0:
                        l[self.uvl].uv = (co.y, co.z)
                    elif ax == 1:
                        l[self.uvl].uv = (co.x, co.z)
                    else:
                        l[self.uvl].uv = (co.x, co.y)
                    l[self.cl] = c
            else:
                for li, l in enumerate(f.loops):
                    if uvs is not None:
                        l[self.uvl].uv = uvs[fi][li]
                    l[self.cl] = c
        return faces

    def verts(self, pts, M=None):
        MM = self.M @ M if M is not None else self.M
        return [self.bm.verts.new(MM @ Vector(p)) for p in pts]

    def box(self, x0, x1, y0, y1, z0, z1, color=(1, 1, 1), m=0, M=None):
        pts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
               (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        vs = self.verts(pts, M)
        fs = [self.bm.faces.new([vs[i] for i in f]) for f in BOX_FACES]
        return self._fin(fs, color, m)

    def boxc(self, cx, cy, cz, sx, sy, sz, color=(1, 1, 1), m=0, M=None):
        return self.box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, color, m, M)

    def quad(self, p0, p1, p2, p3, color=(1, 1, 1), m=0, M=None, uv01=False):
        vs = self.verts([p0, p1, p2, p3], M)
        f = self.bm.faces.new(vs)
        if uv01:
            return self._fin([f], color, m, uv='given', uvs=[[(0, 0), (1, 0), (1, 1), (0, 1)]])
        return self._fin([f], color, m)

    def cyl(self, cx, cy, z0, z1, r0, r1=None, n=24, color=(1, 1, 1), m=0, M=None, caps=(True, True),
            sx=1.0, sy=1.0):
        r1 = r0 if r1 is None else r1
        bot, top = [], []
        for i in range(n):
            a = 2 * math.pi * i / n
            ca, sa = math.cos(a), math.sin(a)
            bot.append((cx + r0 * ca * sx, cy + r0 * sa * sy, z0))
            top.append((cx + r1 * ca * sx, cy + r1 * sa * sy, z1))
        vb = self.verts(bot, M); vt = self.verts(top, M)
        fs = []
        for i in range(n):
            j = (i + 1) % n
            fs.append(self.bm.faces.new([vb[i], vb[j], vt[j], vt[i]]))
        if caps[0] and r0 > 0:
            fs.append(self.bm.faces.new(list(reversed(vb))))
        if caps[1] and r1 > 0:
            fs.append(self.bm.faces.new(vt))
        return self._fin(fs, color, m)

    def lathe(self, prof, n=24, color=(1, 1, 1), m=0, M=None, cx=0.0, cy=0.0, close_top=False, close_bot=False):
        """prof = [(r, z), ...] revolved around Z."""
        rings = []
        for (r, z) in prof:
            ring = []
            for i in range(n):
                a = 2 * math.pi * i / n
                ring.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
            rings.append(self.verts(ring, M))
        fs = []
        for k in range(len(rings) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(n):
                j = (i + 1) % n
                fs.append(self.bm.faces.new([A[i], A[j], B[j], B[i]]))
        if close_bot and prof[0][0] > 0:
            fs.append(self.bm.faces.new(list(reversed(rings[0]))))
        if close_top and prof[-1][0] > 0:
            fs.append(self.bm.faces.new(rings[-1]))
        return self._fin(fs, color, m)

    def sphere(self, cx, cy, cz, r, color=(1, 1, 1), m=0, M=None, seg=16, rings=10, sz=1.0, sx=1.0, sy=1.0):
        prof = []
        for k in range(rings + 1):
            t = math.pi * k / rings
            prof.append((r * math.sin(t), -r * math.cos(t) * sz))
        MM = TR(cx, cy, cz) @ Matrix.Diagonal((sx, sy, 1, 1))
        MM = M @ MM if M is not None else MM
        return self.lathe(prof, seg, color, m, MM)

    def grid(self, P, nu, nv, color=(1, 1, 1), m=0, M=None, uv01=True):
        """P(u,v)->(x,y,z) with u,v in [0,1]."""
        vs = []
        for j in range(nv + 1):
            row = []
            for i in range(nu + 1):
                row.append(P(i / nu, j / nv))
            vs.append(self.verts(row, M))
        fs, uvs = [], []
        for j in range(nv):
            for i in range(nu):
                fs.append(self.bm.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]]))
                uvs.append([(i / nu, j / nv), ((i + 1) / nu, j / nv), ((i + 1) / nu, (j + 1) / nv), (i / nu, (j + 1) / nv)])
        if uv01:
            return self._fin(fs, color, m, uv='given', uvs=uvs)
        return self._fin(fs, color, m)

    def sweep(self, path, prof, color=(1, 1, 1), m=0, M=None, closed=False):
        """Sweep a wall-trim profile along a 2D polyline path [(x,y),...] at floor level.
        prof = [(d, z)] with d = distance from the wall toward the room (left normal)."""
        P = [Vector((p[0], p[1])) for p in path]
        nseg = len(P) - 1
        normals = []
        for i in range(nseg):
            d = (P[i + 1] - P[i]).normalized()
            normals.append(Vector((d.y, -d.x)))
        miters = []
        for i in range(len(P)):
            if i == 0:
                miters.append(normals[0])
            elif i == len(P) - 1:
                miters.append(normals[-1])
            else:
                a, b = normals[i - 1], normals[i]
                mm = (a + b)
                mm = mm / (1.0 + a.dot(b))
                miters.append(mm)
        rings = []
        for (d, z) in prof:
            ring = [(P[i].x + miters[i].x * d, P[i].y + miters[i].y * d, z) for i in range(len(P))]
            rings.append(self.verts(ring, M))
        fs = []
        for k in range(len(prof) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(nseg):
                fs.append(self.bm.faces.new([A[i], A[i + 1], B[i + 1], B[i]]))
        return self._fin(fs, color, m)

    def obj(self, name, mats, bevel=0.0, seg=3, smooth=None, sharp=None, subsurf=0, cam=True,
            shadow=True, parent=None, bevel_angle=35.0):
        if not isinstance(mats, (list, tuple)):
            mats = [mats]
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for mt in mats:
            me.materials.append(mt)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if smooth is None:
            smooth = bevel > 0 or subsurf > 0 or sharp is not None
        if smooth:
            me.shade_smooth()
            if sharp is not None:
                me.set_sharp_from_angle(angle=math.radians(sharp))
        if bevel > 0:
            b = ob.modifiers.new('bev', 'BEVEL')
            b.width = bevel
            b.segments = seg
            b.limit_method = 'ANGLE'
            b.angle_limit = math.radians(bevel_angle)
            b.harden_normals = True
            b.use_clamp_overlap = True
        if subsurf:
            s = ob.modifiers.new('sub', 'SUBSURF')
            s.levels = subsurf
            s.render_levels = subsurf
        ob.visible_camera = cam
        ob.visible_shadow = shadow
        return ob


# ----------------------------------------------------------------------------
# procedural images (numpy, sRGB, top-down rows)
# ----------------------------------------------------------------------------

def vnoise(h, w, cells, rng, octaves=4, persist=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    c = cells
    for _ in range(octaves):
        gh, gw = max(2, int(c * h / max(h, w)) + 2), max(2, int(c * w / max(h, w)) + 2)
        g = rng.random((gh, gw)).astype(np.float32)
        ys = np.linspace(0, gh - 1.001, h); xs = np.linspace(0, gw - 1.001, w)
        y0 = ys.astype(int); x0 = xs.astype(int)
        fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; cc = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy)
        tot += amp
        amp *= persist
        c *= 2
    return out / tot


def np_to_image(name, arr, pack=True):
    """arr: (h, w, 3|4) float sRGB 0..1, row 0 = top."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), arr.dtype)], axis=2)
    im = bpy.data.images.get(name)
    if im is not None and tuple(im.size) != (w, h):
        bpy.data.images.remove(im)
        im = None
    if im is None:
        im = bpy.data.images.new(name, w, h, alpha=False)
    im.pixels.foreach_set(np.ascontiguousarray(np.flipud(np.clip(arr, 0, 1))).astype(np.float32).ravel())
    if pack:
        im.pack()
    return im


def load_png(path):
    """Load an image file -> (h, w, 3) float array of stored (sRGB) values, row 0 = top."""
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return np.flipud(px.reshape(h, w, 4))[:, :, :3].copy()


def save_image(path, arr, fmt='JPEG', quality=90):
    """arr: (h, w, 3) sRGB 0..1 floats, row 0 = top.  Writes 8-bit sRGB."""
    h, w = arr.shape[:2]
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)
    name = '__save__' + os.path.basename(path)
    im = bpy.data.images.new(name, w, h, alpha=False)
    im.pixels.foreach_set(np.ascontiguousarray(np.flipud(rgba)).astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = fmt
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(filepath=path, quality=quality)
    bpy.data.images.remove(im)


def luma(arr):
    return 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]


# ----------------------------------------------------------------------------
# tiny 5x7 bitmap font for contact-sheet labels
# ----------------------------------------------------------------------------
_FONT = {
    'A': '01110100011000111111100011000110001', 'B': '11110100011000111110100011000111110',
    'C': '01110100011000010000100001000101110', 'D': '11110100011000110001100011000111110',
    'E': '11111100001000011110100001000011111', 'F': '11111100001000011110100001000010000',
    'G': '01110100011000010111100011000101111', 'H': '10001100011000111111100011000110001',
    'I': '01110001000010000100001000010001110', 'J': '00111000100001000010000101001001100',
    'K': '10001100101010011000101001001010001', 'L': '10000100001000010000100001000011111',
    'M': '10001110111010110101100011000110001', 'N': '10001100011100110101100111000110001',
    'O': '01110100011000110001100011000101110', 'P': '11110100011000111110100001000010000',
    'Q': '01110100011000110001101011001001101', 'R': '11110100011000111110101001001010001',
    'S': '01111100001000001110000010000111110', 'T': '11111001000010000100001000010000100',
    'U': '10001100011000110001100011000101110', 'V': '10001100011000110001100010101000100',
    'W': '10001100011000110101101011010101010', 'X': '10001100010101000100010101000110001',
    'Y': '10001100010101000100001000010000100', 'Z': '11111000010001000100010001000011111',
    '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
    '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
    '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
    '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
    '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
    '-': '00000000000000011111000000000000000', ' ': '0' * 35, '/': '00001000010001000100010001000010000',
    '.': '00000000000000000000000000110001100', ':': '00000011000110000000011000110000000',
    '_': '00000000000000000000000000000011111', '#': '01010010101111101010111110101001010',
}


def draw_text(arr, text, x, y, scale=2, color=(1, 1, 1)):
    """Draw text into arr (row 0 = top) at pixel x, y (top-left)."""
    cx = x
    for ch in text.upper():
        g = _FONT.get(ch, _FONT[' '])
        for r in range(7):
            for c in range(5):
                if g[r * 5 + c] == '1':
                    y0 = y + r * scale; x0 = cx + c * scale
                    if 0 <= y0 < arr.shape[0] - scale and 0 <= x0 < arr.shape[1] - scale:
                        arr[y0:y0 + scale, x0:x0 + scale, :3] = color
        cx += 6 * scale
    return cx
