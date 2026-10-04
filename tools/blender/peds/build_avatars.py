# Rocketbox avatars -> public/assets/peds/<id>.glb (+ <id>_alb.webp / <id>_nrm.png; tools/texpack.py makes the .dds)
# One skinned material per character: the body / head / hair / extra textures are packed into one 2048x1024 atlas
#   body  (0,0)-(1024,1024)   alpha = clothing tint mask (0 skin .. 1 cloth)
#   head  (1024,0) 512^2      alpha = specular (roughness proxy)
#   hair  (1536,0) 512^2      alpha = opacity (alpha-tested hair cards / lashes)
#   extra (1024,512) 512^2    glasses / helmet / mask (alpha = opacity)
# and a 1024x512 normal atlas with the same layout (DXT5nm style: X in alpha, Y in green; tools/texpack -> BC3).
# Meshes: LOD0 = the source mesh, LOD1 / LOD2 = collapse-decimated (hair cards protected), skinned to the shared
# 34-bone skeleton (common.BONES), GAME SPACE (see common.py), feet at y = 0, faces -Z.
# usage: python build_avatars.py [Name ...]     (no names = every avatar in tools/peds_src/av)
import os, sys, json, struct, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
import numpy as np
from PIL import Image, ImageFilter
from mathutils import Matrix, Vector
from common import SRC, OUT, BONES, BI, C3, parents, to_game, import_fbx, reduced

AW, AH = 2048, 1024
REG = {'body': (0, 0, 1024, 1024), 'head': (1024, 0, 512, 512), 'hair': (1536, 0, 512, 512), 'extra': (1024, 512, 512, 512)}
MARGIN = 6          # px (albedo scale) of edge padding inside every region against mip bleeding
LOD_TRIS = (None, 3600, 1700)


def region_of(mat):
    n = mat.lower()
    if n.endswith('_body'): return 'body'
    if n.endswith('_head'): return 'head'
    if n.endswith('_opacity'): return 'hair'
    return 'extra'


def tex_for(av, mat, kind):
    d = os.path.join(SRC, 'av', av)
    base = mat
    cands = {'color': [base + '_color.tga', base + '_opacity_color.tga'], 'normal': [base + '_normal.tga'], 'specular': [base + '_specular.tga']}[kind]
    if kind == 'color' and mat.lower().endswith('_opacity'): cands = [base + '_color.tga']
    for c in cands:
        p = os.path.join(d, c)
        if os.path.exists(p): return p
    return None


def inner(r, scale=1.0):
    x, y, w, h = r
    m = MARGIN * scale
    return x * scale + m, y * scale + m, w * scale - 2 * m, h * scale - 2 * m


def rsz(img, size):
    # Pillow resizes RGBA premultiplied (colour under alpha 0 -> black): resize the channels independently
    if img.mode != 'RGBA': return img.resize(size, Image.LANCZOS)
    return Image.merge('RGBA', [c.resize(size, Image.LANCZOS) for c in img.split()])


def place(atlas, img, r, scale=1.0):
    x, y, w, h = [int(round(v)) for v in inner(r, scale)]
    im = rsz(img, (w, h))
    m = int(round(MARGIN * scale))
    # edge padding: paste a slightly larger copy underneath
    big = rsz(img, (w + 2 * m, h + 2 * m))
    atlas.paste(big, (x - m, y - m)); atlas.paste(im, (x, y))


def skin_mask(body_rgb, head_rgb):
    """0 = skin, 1 = cloth (body texture). Skin reference = robust median of skin-like pixels of the head texture."""
    def ycc(a):
        a = a.astype(np.float32) / 255
        Y = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
        return Y, (a[..., 2] - Y) * 0.564, (a[..., 0] - Y) * 0.713
    hy, hb, hr = ycc(head_rgb)
    sel = (hy > 0.12) & (hr > 0.015) & (hb < 0.0) & (hr < 0.2)
    if sel.sum() < 500: sel = hy > 0.1
    rb, rr, ry = np.median(hb[sel]), np.median(hr[sel]), np.median(hy[sel])
    by, bb, br = ycc(body_rgb)
    d = np.hypot((bb - rb) / 0.035, (br - rr) / 0.045)
    lum = np.abs(np.log((by + 0.02) / (ry + 0.02)))
    d = d + np.maximum(lum - 0.55, 0) * 6
    m = np.clip((d - 1.0) / 1.0, 0, 1)
    m[by < 0.03] = 1.0                       # black background / shoes
    img = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    return img


def push_pull(rgb, w):
    """fill texels with w == 0 from their neighbourhood (pyramid push-pull); rgb float (h, w, c), w (h, w)."""
    levels = []
    c, ww = rgb * w[..., None], w.astype(np.float32)
    while min(ww.shape) > 1:
        levels.append((c, ww))
        h2, w2 = ww.shape[0] // 2, ww.shape[1] // 2
        c = c[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, -1).sum((1, 3)); ww = ww[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).sum((1, 3))
    col = c / np.maximum(ww, 1e-6)[..., None]
    for c, ww in reversed(levels):
        up = np.repeat(np.repeat(col, 2, 0), 2, 1)[:ww.shape[0], :ww.shape[1]]
        if up.shape[:2] != ww.shape: up = np.pad(up, ((0, ww.shape[0] - up.shape[0]), (0, ww.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        own = c / np.maximum(ww, 1e-6)[..., None]
        k = np.clip(ww, 0, 1)[..., None]
        col = own * k + up * (1 - k)
    return col


def coverage(obj, mat_index, size):
    from PIL import ImageDraw
    im = Image.new('L', size, 0); d = ImageDraw.Draw(im)
    uv = obj.data.uv_layers.active.data
    W, H = size
    for p in obj.data.polygons:
        if p.material_index != mat_index: continue
        pts = [(uv[li].uv[0] % 1.0001 * W, (1 - uv[li].uv[1]) * H) for li in p.loop_indices]
        d.polygon(pts, fill=255)
    return np.asarray(im.filter(ImageFilter.MaxFilter(7))) > 0


def build_atlases(av, mats, obj=None):
    alb = Image.new('RGBA', (AW, AH), (128, 128, 128, 255))
    nrm = Image.new('RGBA', (AW // 2, AH // 2), (0, 128, 0, 128))     # flat normal (DXT5nm: X in A, Y in G)
    head_rgb = None
    by_reg = {}
    for m in mats: by_reg.setdefault(region_of(m), m)
    if 'head' in by_reg:
        p = tex_for(av, by_reg['head'], 'color')
        head_rgb = np.asarray(Image.open(p).convert('RGB').resize((512, 512), Image.LANCZOS))
    for reg, m in by_reg.items():
        cp = tex_for(av, m, 'color')
        if not cp: print('  no color for', m); continue
        src = Image.open(cp)
        rgb = src.convert('RGB')
        r = REG[reg]
        size = (r[2], r[3])
        if reg == 'body':
            small = rgb.resize(size, Image.LANCZOS)
            a = skin_mask(np.asarray(small), head_rgb if head_rgb is not None else np.asarray(small))
        elif reg == 'head':
            sp = tex_for(av, m, 'specular')
            a = Image.open(sp).convert('L') if sp else Image.new('L', size, 60)
        else:
            a = src.getchannel('A') if src.mode == 'RGBA' else Image.new('L', src.size, 255)
            op = os.path.join(SRC, 'av', av, m + '_opacity_color.tga')
            if reg == 'extra' and os.path.exists(op) and op != cp: a = Image.open(op).convert('RGBA').getchannel('A')
        if a.size != rgb.size: a = a.resize(rgb.size, Image.LANCZOS)
        if reg in ('body', 'head') and obj is not None:
            # texels outside the UV islands: push-pull fill so mips / bilinear never pull in the black background
            cov = coverage(obj, mats.index(m), rgb.size)
            arr = np.asarray(rgb).astype(np.float32); aa = np.asarray(a).astype(np.float32)[..., None]
            filled = push_pull(np.concatenate([arr, aa], -1), cov.astype(np.float32))
            rgb = Image.fromarray(np.clip(filled[..., :3], 0, 255).astype(np.uint8)); a = Image.fromarray(np.clip(filled[..., 3], 0, 255).astype(np.uint8))
        rgba = rgb.copy(); rgba.putalpha(a)
        if reg in ('hair', 'extra'):
            # alpha-tested cards: bleed the colour into the transparent texels so mips don't darken the edges
            arr = np.asarray(rgba).astype(np.float32)
            al = arr[..., 3:4] / 255
            col = arr[..., :3] * al
            blur_c = np.asarray(Image.fromarray(col.astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))).astype(np.float32)
            blur_a = np.asarray(Image.fromarray((al[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))).astype(np.float32)[..., None] / 255
            fill = blur_c / np.maximum(blur_a, 1e-3)
            arr[..., :3] = np.where(al > 0.5, arr[..., :3], np.clip(fill, 0, 255))
            rgba = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        place(alb, rgba, r)
        npth = tex_for(av, m, 'normal')
        if npth:
            n = np.asarray(Image.open(npth).convert('RGB')).copy()
            out = np.zeros(n.shape[:2] + (4,), np.uint8)
            out[..., 1] = n[..., 1]; out[..., 3] = n[..., 0]
            if reg in ('body', 'head'):
                cov = coverage(obj, mats.index(m), (n.shape[1], n.shape[0]))
                f = push_pull(out.astype(np.float32), cov.astype(np.float32)); out = np.clip(f, 0, 255).astype(np.uint8)
            place(nrm, Image.fromarray(out, 'RGBA'), r, 0.5)
    # webp (and some decoders) drop the colour of alpha-0 texels: keep the body / head alpha >= 3 (mask ~0 = skin)
    arr = np.asarray(alb).copy()
    arr[:, :1536, 3] = np.maximum(arr[:, :1536, 3], 3); arr[512:, 1024:, 3] = np.asarray(alb)[512:, 1024:, 3]
    alb = Image.fromarray(arr, 'RGBA')
    return alb, nrm


def uv_map(reg, u, v):
    x, y, w, h = inner(REG[reg])
    return (x + u * w) / AW, (y + (1 - v) * h) / AH         # glTF uv: origin top-left


# ------------------------------------------------------------------------------------------------ mesh extraction
def extract(obj, arm, mats_regions, yshift):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    M = obj.matrix_world
    N3 = M.to_3x3().inverted().transposed()
    vg = {g.index: g.name for g in obj.vertex_groups}
    red_of = {}
    for i, n in vg.items():
        b = arm.data.bones.get(n)
        red_of[i] = BI[reduced(b)] if b else 0
    # per-vertex skin
    skin = []
    for v in me.vertices:
        acc = {}
        for g in v.groups:
            if g.weight <= 0: continue
            j = red_of.get(g.group, 0); acc[j] = acc.get(j, 0) + g.weight
        top = sorted(acc.items(), key=lambda t: -t[1])[:4]
        s = sum(w for _, w in top) or 1
        top = [(j, w / s) for j, w in top] + [(0, 0.0)] * (4 - len(top))
        skin.append(top)
    uvl = me.uv_layers.active.data
    cn = me.corner_normals
    keymap = {}; P = []; Nn = []; UV = []; J = []; Wt = []; idx = []
    for tri in me.loop_triangles:
        reg = mats_regions[tri.material_index] if tri.material_index < len(mats_regions) else 'body'
        for li, vi in zip(tri.loops, tri.vertices):
            u, v = uvl[li].uv
            n = cn[li].vector
            key = (vi, round(u, 5), round(v, 5), round(n.x, 3), round(n.y, 3), round(n.z, 3), reg)
            k = keymap.get(key)
            if k is None:
                k = keymap[key] = len(P)
                p = C3 @ (M @ me.vertices[vi].co); p.y += yshift
                nn = (C3 @ (N3 @ n)).normalized()
                P.append((p.x, p.y, p.z)); Nn.append((nn.x, nn.y, nn.z))
                UV.append(uv_map(reg, u, v))
                J.append([j for j, _ in skin[vi]]); Wt.append([w for _, w in skin[vi]])
            idx.append(k)
    ev.to_mesh_clear()
    return np.array(P, np.float32), np.array(Nn, np.float32), np.array(UV, np.float32), np.array(J, np.uint8), np.array(Wt, np.float32), np.array(idx, np.uint32)


def decimated(obj, target, protect_mats):
    """copy of obj with a collapse decimate hitting ~target triangles (hair / extra materials protected)."""
    cp = obj.copy(); cp.data = obj.data.copy(); bpy.context.scene.collection.objects.link(cp)
    me = cp.data
    vg = cp.vertex_groups.new(name='_dec')
    keep = set()
    for p in me.polygons:
        if p.material_index in protect_mats: keep.update(p.vertices)
    vg.add([i for i in range(len(me.vertices)) if i not in keep], 1.0, 'REPLACE')
    if keep: vg.add(list(keep), 0.0, 'REPLACE')
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    prot = sum(len(p.vertices) - 2 for p in me.polygons if p.material_index in protect_mats)
    ratio = max(0.05, min(1.0, (target - min(prot, target * 0.35)) / max(1, tris - prot)))
    mod = cp.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio
    mod.vertex_group = '_dec'; mod.vertex_group_factor = 1.0; mod.use_collapse_triangulate = True
    # keep the armature deform after the decimate in the stack order irrelevant: we read rest-pose geometry
    for m in list(cp.modifiers):
        if m.type == 'ARMATURE': cp.modifiers.remove(m)
    return cp


# ------------------------------------------------------------------------------------------------ GLB writer
def glb(path, lods, rest_local, inv_bind, par):
    bins = bytearray(); views = []; accs = []

    def add(arr, target=None, comp=5126, typ='VEC3', minmax=False, normalized=False):
        nonlocal bins
        while len(bins) % 4: bins += b'\0'
        off = len(bins); data = arr.tobytes(); bins += data
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v)
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1

    nodes = []; meshes = []
    nb = len(BONES)
    for i in range(nb):
        q, t = rest_local[i]
        nodes.append({'name': BONES[i], 'rotation': [q.x, q.y, q.z, q.w], 'translation': [t.x, t.y, t.z]})
    for i in range(nb):
        ch = [j for j in range(nb) if par[j] == i]
        if ch: nodes[i]['children'] = ch
    ibm = add(np.array(inv_bind, np.float32).reshape(nb, 16), comp=5126, typ='MAT4')
    mesh_nodes = []
    for li, (P, N, UV, J, W, I) in enumerate(lods):
        attrs = {'POSITION': add(P, 34962, minmax=True), 'NORMAL': add(N, 34962), 'TEXCOORD_0': add(UV, 34962, typ='VEC2'),
                 'JOINTS_0': add(J, 34962, comp=5121, typ='VEC4'), 'WEIGHTS_0': add(W, 34962, typ='VEC4')}
        ind = I.astype(np.uint16) if P.shape[0] < 65536 else I
        ia = add(ind, 34963, comp=5123 if ind.dtype == np.uint16 else 5125, typ='SCALAR')
        meshes.append({'name': f'LOD{li}', 'primitives': [{'attributes': attrs, 'indices': ia, 'material': 0}]})
        nodes.append({'name': f'LOD{li}', 'mesh': li, 'skin': 0}); mesh_nodes.append(len(nodes) - 1)
    js = {'asset': {'version': '2.0', 'generator': 'hillbomb peds pipeline (Rocketbox, MIT)'},
          'scene': 0, 'scenes': [{'nodes': [0] + mesh_nodes}], 'nodes': nodes, 'meshes': meshes,
          'materials': [{'name': 'ped', 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.7}}],
          'skins': [{'joints': list(range(nb)), 'inverseBindMatrices': ibm, 'skeleton': 0}],
          'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bins)}]}
    jb = json.dumps(js, separators=(',', ':')).encode()
    while len(jb) % 4: jb += b' '
    while len(bins) % 4: bins += b'\0'
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bins)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bins), 0x004E4942)); f.write(bins)


def build(av):
    arm = import_fbx(os.path.join(SRC, 'av', av, av + '.fbx'))
    obj = next(o for o in bpy.data.objects if o.type == 'MESH')
    mats = [m.name for m in obj.data.materials]
    regions = [region_of(m) for m in mats]
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    par = parents(arm)
    W = [to_game(arm.matrix_world @ arm.data.bones[n].matrix_local) for n in BONES]
    # ground: lowest rest vertex
    M = obj.matrix_world
    miny = min((C3 @ (M @ v.co)).y for v in obj.data.vertices)
    yshift = -miny
    W = [(q, t + Vector((0, yshift, 0))) for q, t in W]
    rest_local = []
    for i in range(len(BONES)):
        q, t = W[i]
        if par[i] < 0: rest_local.append((q, t)); continue
        pq, pt = W[par[i]]
        rest_local.append(((pq.inverted() @ q).normalized(), pq.inverted() @ (t - pt)))
    inv_bind = []
    for q, t in W:
        m = (Matrix.Translation(t) @ q.to_matrix().to_4x4()).inverted()
        inv_bind += [m[r][c] for c in range(4) for r in range(4)]     # column-major
    for m in list(obj.modifiers):
        if m.type == 'ARMATURE': m.show_viewport = False
    lods = [extract(obj, arm, regions, yshift)]
    protect = {i for i, r in enumerate(regions) if r in ('hair', 'extra')}
    for t in LOD_TRIS[1:]:
        cp = decimated(obj, t, protect)
        bpy.context.view_layer.update()
        lods.append(extract(cp, arm, regions, yshift))
        bpy.data.objects.remove(cp, do_unlink=True)
    vid = av.lower()
    os.makedirs(OUT, exist_ok=True)
    glb(os.path.join(OUT, vid + '.glb'), lods, rest_local, inv_bind, par)
    alb, nrm = build_atlases(av, mats, obj)
    alb.save(os.path.join(OUT, vid + '_alb.webp'), quality=92, method=6, exact=True)   # exact: keep RGB under alpha 0 (skin mask)
    nrm.save(os.path.join(OUT, vid + '_nrm.png'), optimize=True)
    ys = lods[0][0][:, 1]
    info = {'id': vid, 'name': av, 'g': 'f' if 'female' in av.lower() else 'm', 'h': float(ys.max()), 'hip': float(W[0][1].y),
            'tris': [int(l[5].shape[0] // 3) for l in lods], 'verts': [int(l[0].shape[0]) for l in lods],
            'regions': sorted(set(regions))}
    with open(os.path.join(OUT, vid + '.json'), 'w') as f: json.dump(info, f)
    print(av, info['tris'], info['verts'], 'h %.2f hip %.2f' % (info['h'], info['hip']))


if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('-')] or sorted(os.listdir(os.path.join(SRC, 'av')))
    for n in names: build(n)
