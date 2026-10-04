"""HILLBOMB photoreal street / park trees, produced in Blender (Cycles) + numpy.

Stages (default: all, in order)
  atlas : leaf-cluster, palm-frond and fan-leaf cards rendered in Cycles from real 3D leaf geometry (albedo x cluster AO under a
          uniform sky, plus tangent-space normals) and tileable bark textures (periodic procedural height fields), packed into one
          4096^2 atlas shared by every tree -> leaves_albedo.webp (linear-premultiplied RGBA) + leaves_normal.webp.
  trees : space-colonisation skeletons (species envelopes, leaders, pipe-model radii) -> bark tubes + leaf cards (canopy AO and
          canopy normals from a leaf-density field) -> <id>_lod0.glb (6-12k tris) and <id>_lod1.glb (~1-1.6k tris, clustered cards).
          glb attributes: POSITION, NORMAL, TEXCOORD_0 (GL convention, v up), _WIND = (bend, flutter, ao, leaf) u8 normalised.
  imp   : hemi-octahedral impostors (8x8 views) of every LOD0 rendered in Cycles: albedo*AO and frame-space normals.
  pack  : combined impostor atlases (5x4 slots of 1024^2) + trees.json.
  sheet : lit contact sheet of every LOD0 for review (tools/blender/_cache/trees/sheet.png, shots/trees_sheet.jpg).
Run:  tools/.venv-blender/Scripts/python tools/blender/trees.py [--stage atlas,trees,imp,pack,sheet] [--only plane,oak] [--spp 160]
"""
import bpy, math, os, sys, json, struct, time, zlib
import numpy as np
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hb_lib as hb

ROOT = hb.ROOT
OUT = os.path.join(ROOT, 'public', 'assets', 'trees')
CACHE = os.path.join(HERE, '_cache', 'trees')
for _d in (OUT, CACHE):
    os.makedirs(_d, exist_ok=True)
ARGV = sys.argv[1:]


def opt(k, d=None):
    return ARGV[ARGV.index(k) + 1] if k in ARGV else d


STAGES = opt('--stage', 'atlas,trees,imp,pack,sheet').split(',')
ONLY = set(opt('--only').split(',')) if opt('--only') else None
SPP = int(opt('--spp', '160'))
AT = 4096      # leaf / bark atlas (8 x 8 cells of 512)
NF = 8         # impostor frames per axis (hemi-octahedral)
IMP = 768      # impostor atlas per species (96 px frames: impostors start past the LOD2 band, ~300 m)
T0 = time.time()


def log(*a):
    print('[trees %5.0fs]' % (time.time() - T0), *a, flush=True)


# ---------------------------------------------------------------- small maths
def srgb2lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def lin2srgb(c):
    c = np.clip(np.asarray(c, np.float32), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055).astype(np.float32)


def hx(h):
    return srgb2lin([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255])


def nrmz(v):
    v = np.asarray(v, np.float64)
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * np.asarray(t)[..., None]


def conv(p):  # GL (x, y up, z) -> Blender (x, -z, y)
    p = np.asarray(p, np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def rotz(v, a):
    c, s = math.cos(a), math.sin(a)
    return np.array([c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]])


# ---------------------------------------------------------------- images
def img_read(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return np.flipud(px.reshape(h, w, 4)).copy()


def img_write(path, arr, fmt='PNG', quality=90):
    h, w, c = arr.shape
    if c == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], 2)
    im = bpy.data.images.new('__w', w, h, alpha=(c == 4))
    im.alpha_mode = 'STRAIGHT'
    im.pixels.foreach_set(np.ascontiguousarray(np.flipud(np.clip(arr, 0, 1))).astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = fmt
    im.save(filepath=path, quality=quality)
    bpy.data.images.remove(im)


def pushpull(rgb, a):
    """Fill rgb where a == 0 from a coverage-weighted pyramid (no dark fringes at mips / alpha edges)."""
    lv = [(rgb * a[..., None], a.astype(np.float32))]
    while min(lv[-1][1].shape) > 1:
        c, w = lv[-1]
        h2, w2 = c.shape[0] // 2, c.shape[1] // 2
        lv.append((c[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, -1).sum((1, 3)), w[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).sum((1, 3))))
    fill = lv[-1][0] / np.maximum(lv[-1][1], 1e-8)[..., None]
    for c, w in reversed(lv[:-1]):
        up = np.repeat(np.repeat(fill, 2, 0), 2, 1)
        up = np.pad(up, ((0, c.shape[0] - up.shape[0]), (0, c.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        wn = np.minimum(w, 1.0)[..., None]
        fill = c / np.maximum(w, 1e-8)[..., None] * wn + up * (1 - wn)
    return np.where(a[..., None] > 0, rgb, fill).astype(np.float32)


def half(n):  # 2x box downsample of an encoded normal map, renormalised
    h, w = n.shape[0] // 2, n.shape[1] // 2
    v = n.reshape(h, 2, w, 2, 3).mean((1, 3)) * 2 - 1
    return (nrmz(v) * 0.5 + 0.5).astype(np.float32)


# ---------------------------------------------------------------- periodic procedural fields (tileable bark)
def pnoise(h, w, gx0, gy0, rng, octaves=4, gain=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gx, gy = max(1, int(gx0 * 2 ** o)), max(1, int(gy0 * 2 ** o))
        L = rng.random((gy, gx)).astype(np.float32)
        xs, ys = np.arange(w) * gx / w, np.arange(h) * gy / h
        x0, y0 = xs.astype(int), ys.astype(int)
        tx, ty = xs - x0, ys - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        x1, y1 = (x0 + 1) % gx, (y0 + 1) % gy
        a, b, c, d = L[y0][:, x0], L[y0][:, x1], L[y1][:, x0], L[y1][:, x1]
        out += ((a + (b - a) * tx) * (1 - ty)[:, None] + (c + (d - c) * tx) * ty[:, None]) * amp
        tot += amp
        amp *= gain
    return out / tot


def pvoronoi(h, w, nx, ny, rng, warp=(0, 0), Wm=1.0, Hm=2.0, m=(1.0, 1.0), jit=0.9):
    Pj = rng.random((ny, nx, 2)) * jit + (1 - jit) / 2
    ids = rng.random((ny, nx))
    X, Y = np.meshgrid((np.arange(w) + 0.5) / w * nx, (np.arange(h) + 0.5) / h * ny)
    X, Y = X + warp[0], Y + warp[1]
    cx, cy = np.floor(X).astype(int), np.floor(Y).astype(int)
    sx, sy = Wm / nx * m[0], Hm / ny * m[1]
    f1 = np.full((h, w), 1e9)
    f2 = np.full((h, w), 1e9)
    cid = np.zeros((h, w))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            gx, gy = cx + dx, cy + dy
            mx, my = gx % nx, gy % ny
            d = np.hypot((gx + Pj[my, mx, 0] - X) * sx, (gy + Pj[my, mx, 1] - Y) * sy)
            c = d < f1
            f2 = np.where(c, f1, np.minimum(f2, d))
            cid = np.where(c, ids[my, mx], cid)
            f1 = np.where(c, d, f1)
    return f1, f2, cid


def pblur(a, r):
    for ax in (0, 1):
        acc = a.copy()
        for k in range(1, r + 1):
            acc += np.roll(a, k, ax) + np.roll(a, -k, ax)
        a = acc / (2 * r + 1)
    return a


def wsample(a, dx, dy):
    """Periodic bilinear resample of a (h, w) field at (x + dx, y + dy) pixels (domain warp)."""
    h, w = a.shape
    X, Y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    xs, ys = (X + dx) % w, (Y + dy) % h
    x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
    tx, ty = xs - x0, ys - y0
    x1, y1 = (x0 + 1) % w, (y0 + 1) % h
    return (a[y0, x0] * (1 - tx) + a[y0, x1] * tx) * (1 - ty) + (a[y1, x0] * (1 - tx) + a[y1, x1] * tx) * ty


_PHOTO = {}


def photo_bark(w, h):
    """CC0 photo bark (public/assets/tex/bark, ~1 m tile) resampled to 512 px/m and tiled to (h, w): sRGB colour, luminance."""
    if 'c' not in _PHOTO:
        src = img_read(os.path.join(ROOT, 'public', 'assets', 'tex', 'bark', 'color.jpg'))[..., :3]
        n = src.shape[0] // 512
        src = src[:512 * n, :512 * n].reshape(512, n, 512, n, 3).mean((1, 3)) if n > 1 else src
        _PHOTO['c'] = src.astype(np.float32)
    c = _PHOTO['c']
    c = np.tile(c, (h // 512 + 1, w // 512 + 1, 1))[:h, :w]
    L = (c * [0.3, 0.55, 0.15]).sum(-1)
    return c, L


def bark(kind, w, h, seed):
    """-> (albedo linear (h,w,3), height 0..1, relief depth in metres). Texture covers w/512 x h/512 metres, tiles both ways.
    Fibrous / furrowed fields are domain-warped anisotropic noise (no cell outlines); fissured barks borrow the high-pass detail of
    the CC0 photo bark so every species carries real micro-structure."""
    rng = np.random.default_rng(seed)
    Wm, Hm = w / 512, h / 512

    def nz(fx, fy, o=4, g=0.5):
        return pnoise(h, w, max(1, round(fx * Wm)), max(1, round(fy * Hm)), rng, o, g)

    def vor(fx, fy, warp=(0, 0), m=(1.0, 1.0)):
        return pvoronoi(h, w, max(1, round(fx * Wm)), max(1, round(fy * Hm)), rng, warp, Wm, Hm, m)

    def fib(fx, fy, warp=40.0, o=5):   # vertical fibres wandering sideways (warp in px), 0..1
        n = nz(fx, fy, o, 0.55)
        return wsample(n, (nz(3, 2, 3) - 0.5) * warp + (nz(9, 5, 2) - 0.5) * warp * 0.35, 0 * n)

    def ridged(n):
        return 1 - np.abs(2 * n - 1)

    X, Y = np.meshgrid((np.arange(w) + .5) / w * Wm, (np.arange(h) + .5) / h * Hm)
    pc, pL = photo_bark(w, h)
    pdet = pL - pblur(pL, 5)           # photo micro-structure (high-pass)

    def psamp(sx, sy, warp=0.0):   # photo luminance at (x * sx, y * sy); sx * w / 512 and sy * h / 512 must be integers (tiling)
        if 'L' not in _PHOTO:
            _PHOTO['L'] = (_PHOTO['c'] * [0.3, 0.55, 0.15]).sum(-1).astype(np.float32)
        L0 = _PHOTO['L']
        n = L0.shape[0]
        Xp, Yp = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        xs = (Xp * sx + (nz(3, 2, 3) - 0.5) * warp) % n
        ys = (Yp * sy) % n
        x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
        tx, ty = xs - x0, ys - y0
        x1, y1 = (x0 + 1) % n, (y0 + 1) % n
        return (L0[y0, x0] * (1 - tx) + L0[y0, x1] * tx) * (1 - ty) + (L0[y1, x0] * (1 - tx) + L0[y1, x1] * tx) * ty

    def norm01(a):
        lo, hi = np.percentile(a, 2), np.percentile(a, 98)
        return np.clip((a - lo) / max(hi - lo, 1e-4), 0, 1).astype(np.float32)

    def grad(L, cols):   # gradient map: furrow -> ridge colours (sRGB hex), linear out
        cs = np.array([hx(c) for c in cols])
        t = L * (len(cs) - 1)
        i = np.clip(t.astype(int), 0, len(cs) - 2)
        f = (t - i)[..., None]
        return cs[i] * (1 - f) + cs[i + 1] * f

    def detail(col, k=1.6):
        return col * np.clip(1 + k * pdet, 0.5, 1.5)[..., None]

    def stretch(a, lo, hi):
        return np.clip((a - lo) / (hi - lo), 0, 1)

    def diamonds(nd, nr, wx=0.0, wy=0.0):
        s, t = (X + wx) * nd + (Y + wy) * nr, (X + wx) * nd - (Y + wy) * nr
        return np.minimum(np.minimum(s % 1, 1 - s % 1), np.minimum(t % 1, 1 - t % 1))

    if kind == 'plane':   # London plane: exfoliating jigsaw of olive-grey old bark over cream / khaki new bark, soft edges
        col = mix(hx(0xb4ad92), hx(0xa29c7c), nz(6, 6))
        hgt = np.zeros((h, w), np.float32)
        for k, (c, f) in enumerate(((0xa9a47c, 5), (0x8f8c74, 4), (0x7c7a6a, 3.5), (0xb49e7a, 6))):
            m = nz(f, f * 0.8, 5, 0.55)
            m = wsample(m, (nz(4, 4, 3) - .5) * 70, (nz(4, 4, 3) - .5) * 70)
            e = ss(0.53, 0.56, m)
            col = mix(col, hx(c) * (0.9 + 0.2 * nz(20, 20))[..., None], e * 0.95)
            hgt = np.maximum(hgt, e * (0.3 + 0.15 * k))
        col = col * (0.94 + 0.12 * nz(80, 60, 3))[..., None]
        return col, np.clip(hgt + 0.08 * nz(60, 60), 0, 1), 0.0035
    if kind == 'ficus':   # smooth grey, horizontal wrinkle bands, sparse lenticels
        wr = wsample(nz(2, 40, 4), (nz(3, 3) - .5) * 30, 0 * X)
        f1, _, _ = vor(24, 18, m=(1.0, 2.5))
        dots = 1 - ss(0.002, 0.004, f1)
        col = mix(hx(0x7e7c74), hx(0x9e9a8e), nz(3, 5)) * (0.93 + 0.12 * wr)[..., None]
        col = mix(col, hx(0x6a7060), ss(0.6, 0.75, nz(4, 6)) * 0.35)   # algae stain
        return detail(mix(col, hx(0xb4ae9c), dots * 0.45), 0.4), 0.35 * wr + 0.2 * nz(12, 12) + 0.15 * dots, 0.003
    if kind == 'oak':     # coast live oak: the photo structure recoloured grey, shorter plates, pale lichen
        L = norm01(psamp(1, 1.5, 30) * 0.45 + ss(0.25, 0.9, 1 - ridged(fib(7, 1.8, 60))) * 0.55)
        col = grad(L, (0x221e1a, 0x5a554c, 0x857f74, 0xa8a296)) * (0.9 + 0.2 * nz(6, 4))[..., None]
        lich = ss(0.62, 0.7, nz(6, 5, 5)) * ss(0.4, 0.7, L)
        col = mix(col, hx(0xa8ae98), lich * 0.55)
        return col, np.clip(L * 0.9 + 0.1 * lich, 0, 1), 0.014
    if kind == 'ginkgo':  # ginkgo: grey-brown, finer corky furrows
        L = norm01(psamp(2, 1.5, 20) * 0.5 + ss(0.25, 0.9, 1 - ridged(fib(12, 3, 40))) * 0.5)
        col = grad(L, (0x2a241f, 0x625a50, 0x8a8074, 0xa49a8c)) * (0.9 + 0.2 * nz(6, 4))[..., None]
        return col, L, 0.009
    if kind == 'brisbox':  # Brisbane box: smooth salmon-tan patches shedding over grey-brown
        col = mix(hx(0xb08870), hx(0xc49a7c), nz(5, 5))
        hgt = np.zeros((h, w), np.float32)
        for c, f in ((0x8a7466, 4), (0x7a6a60, 3)):
            m = wsample(nz(f, f * 1.6, 5, 0.55), (nz(4, 3, 3) - .5) * 60, (nz(4, 3, 3) - .5) * 90)
            e = ss(0.54, 0.57, m)
            col, hgt = mix(col, hx(c) * (0.9 + 0.2 * nz(20, 30))[..., None], e), np.maximum(hgt, e * 0.5)
        return detail(col, 0.35), np.clip(hgt + 0.1 * nz(50, 50), 0, 1), 0.004
    if kind == 'cherry':  # Prunus: dark red-brown, horizontal lenticel dashes, peeling bands
        f1, _, _ = vor(7, 30, m=(1.0, 5.0))
        dash = 1 - ss(0.004, 0.009, f1)
        band = nz(2, 22, 3)
        col = hx(0x4d2c25) * ((0.75 + 0.45 * band) * (0.9 + 0.2 * nz(20, 20)))[..., None]
        return detail(mix(col, hx(0x9c7c62), dash * 0.75), 0.5), 0.4 * band + 0.3 * dash + 0.1 * nz(40, 40), 0.003
    if kind == 'euc':     # blue gum: smooth cream / blue-grey, long hanging ribbons of shed brown bark, orange fresh patches
        streak = wsample(nz(10, 0.6, 4), (nz(2, 1) - .5) * 14, 0 * X)
        base = mix(hx(0xbab4a4), hx(0x969c98), nz(2, 1, 3)) * (0.9 + 0.14 * streak)[..., None]
        base = mix(base, hx(0xc89c78), ss(0.6, 0.7, nz(5, 3, 4)) * 0.5)
        rib = ss(0.58, 0.64, fib(12, 0.8, 16, 4))
        rc = hx(0x7a5e46) * (0.7 + 0.5 * fib(40, 2, 20, 3))[..., None]
        col = mix(base, rc, rib)
        return detail(col, 0.35 * rib + 0.1), np.clip(0.55 * rib + 0.12 * streak, 0, 1), 0.006
    if kind == 'pine':    # Monterey pine: the CC0 photo bark (thick plates, near-black fissures)
        col = srgb2lin(pc) * [1.0, 0.9, 0.82]
        return col, np.clip(pblur(pL, 1) * 1.3, 0, 1), 0.02
    if kind == 'cypress':  # Monterey cypress: long braided stringy ridges (photo stretched 2x vertically + fibres), grey-brown
        a = fib(34, 1.6, 70)
        L = norm01(psamp(1, 0.5, 60) * 0.65 + a * 0.35)
        col = grad(L, (0x241c17, 0x5c5048, 0x8a7e70, 0xa89c8c)) * (0.9 + 0.2 * nz(6, 3))[..., None]
        col = mix(col, hx(0x7a5a44), ss(0.55, 0.7, nz(5, 2)) * 0.35 * (1 - L))      # rusty inner fibres
        return col, L, 0.016
    if kind == 'redwood':  # coast redwood: thick spongy red-brown fibrous ridges, deep furrows
        a = fib(14, 0.9, 60)
        L = norm01(psamp(1, 0.5, 80) * 0.6 + a * 0.4)
        col = grad(L, (0x261812, 0x5a3626, 0x7c5038, 0x94705a)) * (0.9 + 0.2 * nz(6, 3))[..., None]
        col = mix(col, hx(0x8e7c6e), ss(0.62, 0.72, nz(4, 3)) * 0.45 * L)   # weathered grey outer fibres
        return col, L, 0.03
    if kind == 'canary':  # Canary Island date palm: irregular diamond leaf-base scars, fibrous
        wx, wy = (nz(2, 3, 3) - .5) * 0.25, (nz(2, 3, 3) - .5) * 0.25
        rim = ss(0.02, 0.3, diamonds(5, 7, wx, wy))
        fibr = fib(60, 6, 20, 3)
        col = mix(hx(0x3a3028), hx(0x8a7a66), rim) * (0.8 + 0.3 * nz(6, 6) + 0.15 * fibr)[..., None]
        return detail(col, 0.9), rim * 0.7 + 0.2 * fibr, 0.02
    if kind == 'fan':     # Mexican fan palm: grey, fine rings, vertical cracks
        rings = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * 22 + (nz(3, 1, 2) - .5) * 1.5))
        cr = ss(0.62, 0.9, ridged(fib(14, 2.5, 40)))
        col = mix(hx(0x77705f), hx(0x948a7a), nz(4, 8)) * (0.85 + 0.15 * rings)[..., None]
        return detail(mix(col, hx(0x2e2924), cr * 0.6), 0.9), 0.3 * rings + 0.5 * (1 - cr), 0.006
    if kind == 'knob':    # canary crown "pineapple" of leaf bases
        rim = ss(0, 0.2, diamonds(4, 5))
        col = mix(hx(0x3a2c18), mix(hx(0x8c7a46), hx(0xa27c4a), nz(4, 4)), rim) * (0.85 + 0.3 * nz(20, 20))[..., None]
        return col, rim * 0.8 + 0.2 * nz(20, 40), 0.025
    if kind == 'fantop':  # fan palm: crosshatched leaf bases under the crown
        s, t = X * 6 + Y * 6, X * 6 - Y * 6
        ln = np.maximum(1 - ss(0, 0.08, np.minimum(s % 1, 1 - s % 1)), 1 - ss(0, 0.08, np.minimum(t % 1, 1 - t % 1)))
        fb = nz(50, 50, 3)
        return mix(hx(0x5c4834), hx(0x7c644a), fb) * (1 - 0.4 * ln)[..., None], 0.5 * fb + 0.4 * (1 - ln), 0.012
    raise ValueError(kind)


def bark_maps(kind, w, h, seed):
    col, hgt, depth = bark(kind, w, h, seed)
    col = col * np.clip(1 + 2.2 * (hgt - pblur(hgt, 6)), 0.45, 1.15)[..., None]
    px = 1.0 / 512
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / (2 * px) * depth
    dy = (np.roll(hgt, 1, 0) - np.roll(hgt, -1, 0)) / (2 * px) * depth   # +v = image up
    n = nrmz(np.dstack([-dx, -dy, np.ones_like(hgt)]))
    return lin2srgb(col), (n * 0.5 + 0.5).astype(np.float32)


# ---------------------------------------------------------------- atlas layout
LEAVES = ['plane', 'ficus', 'oak', 'brisbox', 'cherry', 'plum', 'euc', 'pine', 'cypress', 'scrub', 'redwood', 'ginkgo', 'vbox', 'pampas']
VARS = {'scrub': 1, 'cherry': 1, 'plum': 1, 'vbox': 1}   # atlas cells per leaf (8x8 grid is full)
BARKS = ['plane', 'ficus', 'oak', 'brisbox', 'cherry', 'euc', 'pine', 'cypress', 'canary', 'fan', 'redwood', 'ginkgo']


def pack_layout():
    items = [('bark_' + b, 1, 2, 'bark') for b in BARKS]
    items += [('frond_a', 4, 1, 'frond'), ('frond_b', 4, 1, 'frond'), ('fan', 2, 2, 'fan'), ('fandead', 1, 2, 'fandead'),
              ('knob', 1, 1, 'bark'), ('fantop', 1, 1, 'bark')]
    items += [('lf_%s_%d' % (l, v), 1, 1, 'leaf') for l in LEAVES for v in range(VARS.get(l, 2))]
    occ = np.zeros((8, 8), bool)
    lay = {}
    for key, w, h, kind in sorted(items, key=lambda t: -t[1] * t[2]):
        for r in range(8 - h + 1):
            c = next((c for c in range(8 - w + 1) if not occ[r:r + h, c:c + w].any()), None)
            if c is not None:
                occ[r:r + h, c:c + w] = True
                lay[key] = (c, r, w, h, kind)
                break
        assert key in lay, key
    return lay


def rect_of(lay, key, inner=0.02):
    c, r, w, h, kind = lay[key]
    u0, u1, v1, v0 = c / 8, (c + w) / 8, 1 - r / 8, 1 - (r + h) / 8
    if kind == 'bark':
        e = 0.5 / AT
        return (u0 + e, v0 + e, u1 - e, v1 - e)
    du, dv = (u1 - u0) * inner, (v1 - v0) * inner
    return (u0 + du, v0 + dv, u1 - du, v1 - dv)


# ---------------------------------------------------------------- 3D leaf geometry for the cluster cards
class Geo:
    def __init__(s):
        s.V, s.F, s.C, s.n = [], [], [], 0

    def add(s, V, F, C):
        V = np.asarray(V, np.float64)
        s.V.append(V)
        s.F.append(np.asarray(F, np.int64).reshape(-1, 3) + s.n)
        s.C.append(np.array(np.broadcast_to(np.asarray(C, np.float64), V.shape)))
        s.n += len(V)

    def arrays(s):
        return np.concatenate(s.V), np.concatenate(s.F), np.concatenate(s.C)


PROF = {
    'ellip': lambda t: np.sin(np.pi * np.clip(t, 0, 1) ** 0.9) ** 0.8,
    'ovate': lambda t: np.clip((t ** 0.55) * (1 - t) ** 0.9 / 0.42, 0, 1),
    'lance': lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.7), 0, 1) ** 1.3,
    'oak': lambda t: np.sin(np.pi * np.clip(t, 0, 1) ** 0.85) ** 0.7 * (1 + 0.14 * np.sin(t * 9 * np.pi)),
    'fan': lambda t: np.clip(np.clip(t, 0, 1) ** 1.15 * (1 - 0.3 * np.exp(-((t - 1) / 0.07) ** 2)), 0.04, 1),   # ginkgo fan, notched tip
    'wavy': lambda t: np.sin(np.pi * np.clip(t, 0, 1) ** 0.8) ** 0.9 * (1 + 0.12 * np.sin(t * 13 * np.pi)),       # pittosporum
}


def leaf_blade(L, W, prof, rows=7, fold=0.25, curl=0.12, sick=0.0):
    """Leaf along +Y (base at origin), facing +Z; V-fold along the midrib, tip curl, sickle bend. -> V, F, shade."""
    t = np.linspace(0, 1, rows + 1)
    hw = 0.5 * W * prof(t)
    y, xo, z = t * L, sick * L * np.sin(np.pi * t) * t, -curl * L * t * t
    V = np.stack([np.stack([xo - hw, y, z - fold * hw], 1), np.stack([xo, y, z], 1), np.stack([xo + hw, y, z - fold * hw], 1)], 1).reshape(-1, 3)
    F = []
    for i in range(rows):
        a, b = 3 * i, 3 * i + 3
        F += [(a, a + 1, b + 1), (a, b + 1, b), (a + 1, a + 2, b + 2), (a + 1, b + 2, b + 1)]
    return V, np.array(F), np.tile([0.86, 1.12, 0.86], rows + 1)


def leaf_palmate(L, rng, n=44):
    ang = np.linspace(-0.75, np.pi + 0.75, n)
    lob = [(np.pi / 2, 1.0), (np.pi / 2 - 0.9, 0.86), (np.pi / 2 + 0.9, 0.86), (np.pi / 2 - 1.75, 0.5), (np.pi / 2 + 1.75, 0.5)]
    r = (0.38 + sum(l * rng.uniform(0.9, 1.08) * np.exp(-((ang - a) / 0.26) ** 2) for a, l in lob) * 0.62) * L * 0.5
    c = np.array([0, 0.3 * L, 0])
    rim = np.stack([r * np.cos(ang), c[1] + r * np.sin(ang), -0.25 * r * r / L], 1)
    V = np.concatenate([c[None], rim])
    F = np.array([(0, i + 1, i + 2) for i in range(n - 1)])
    return V, F, np.concatenate([[1.12], np.full(n, 0.9)])


def place(Vl, p, ydir, zhint):
    y = nrmz(ydir)
    x = nrmz(np.cross(y, zhint))
    z = np.cross(x, y)
    return p + Vl[:, 0:1] * x + Vl[:, 1:2] * y + Vl[:, 2:3] * z


def strip(pts, w0, w1, zdir=(0, 0, 1)):
    pts = np.asarray(pts, np.float64)
    k = len(pts)
    side = nrmz(np.cross(np.gradient(pts, axis=0), zdir)) * np.linspace(w0, w1, k)[:, None] / 2
    V = np.concatenate([pts - side, pts + side])
    F = []
    for i in range(k - 1):
        F += [(i, i + 1, k + i + 1), (i, k + i + 1, k + i)]
    return V, np.array(F)


def twig(rng, a, b, n=8, bend=0.1):
    a, b = np.asarray(a, np.float64), np.asarray(b, np.float64)
    t = np.linspace(0, 1, n)[:, None]
    perp = nrmz(np.cross(b - a, [0, 0, 1]))
    return a + (b - a) * t + perp * bend * np.linalg.norm(b - a) * rng.uniform(-1, 1) * np.sin(np.pi * t)


def pick_col(rng, cols, jit=0.12):
    i, j = rng.integers(len(cols), size=2)
    c = cols[i] + (cols[j] - cols[i]) * rng.random()
    return c * rng.uniform(1 - jit, 1 + jit) * (1 + rng.normal(0, 0.04, 3))


LEAF_CFG = {  # S = card size (m); shape = (profile, width/length, fold, curl[, sickle]) or 'palm'
    'plane': dict(S=1.25, shape='palm', L=0.21, n=64, side=7, cols=[0x55752f, 0x4b6a2a, 0x62803a, 0x6d8a40, 0x5a7432], pet=0.25, tw=0.012, spread=(0.4, 1.3), depth=0.14),
    'ficus': dict(S=0.72, shape=('ellip', 0.45, 0.22, 0.05), L=0.07, n=230, side=6, cols=[0x2a4a1c, 0x33561f, 0x3c6226, 0x2e4f1e], pet=0.12, tw=0.01),
    'oak': dict(S=0.66, shape=('oak', 0.62, 0.4, -0.12), L=0.052, n=250, side=6, cols=[0x2b4220, 0x364f26, 0x40582a, 0x33472a], pet=0.08, tw=0.009),
    'brisbox': dict(S=0.85, shape=('ellip', 0.36, 0.2, 0.1), L=0.13, n=105, side=5, whorl=True, cols=[0x3c5a26, 0x46662c, 0x365224, 0x4d6a30], pet=0.1, tw=0.011),
    'cherry': dict(S=0.78, shape=('ovate', 0.5, 0.15, 0.1), L=0.065, n=18, side=7, cols=[0x6a6a38, 0x7a6e3a, 0x5a6230], pet=0.1, tw=0.01,
                   flowers=85, fr=0.017, fcols=[0xf4bccb, 0xf7ccd8, 0xeaa6bc, 0xfbe4ec], twig=0x4a2e26),
    'plum': dict(S=0.7, shape=('ovate', 0.55, 0.2, 0.1), L=0.058, n=235, side=6, cols=[0x4a1c28, 0x5c2432, 0x3c1620, 0x6a2c36], pet=0.12, tw=0.009,
                 flowers=5, fr=0.013, fcols=[0xf6d8e0, 0xf0c4d0], twig=0x3a2420),
    'euc': dict(S=1.0, shape=('lance', 0.14, 0.1, 0.12, 0.18), L=0.2, n=150, side=6, droop=True, cols=[0x7a8a72, 0x6a7c64, 0x86967c, 0x72846a], pet=0.1, tw=0.009, twig=0x7a5040),
    'scrub': dict(S=0.55, shape=('ovate', 0.5, 0.25, 0.05), L=0.03, n=520, side=7, cols=[0x3a5626, 0x46622c, 0x344e22, 0x4e6a34], pet=0.05, tw=0.007),
    'pine': dict(S=0.95, L=0.15, cols=[0x2c4722, 0x365428, 0x2a3f1f, 0x3a5a2a]),
    'cypress': dict(S=1.1, cols=[0x2d4620, 0x375426, 0x44622c, 0x2a3e1c, 0x3c5a24]),
    'redwood': dict(S=0.5, cols=[0x2e4a22, 0x375a26, 0x2a4220, 0x3f6228], tip=0x5a7a34),
    'ginkgo': dict(S=0.72, shape=('fan', 1.2, 0.08, 0.06), L=0.058, n=150, side=5, cols=[0x6a8a34, 0x5e7e2e, 0x78963c, 0x587a2a, 0x8a9a3a], pet=0.55, tw=0.01,
                   spread=(0.3, 1.4)),
    'vbox': dict(S=0.8, shape=('wavy', 0.3, 0.25, 0.1), L=0.1, n=150, side=5, whorl=True, cols=[0x2c4a1c, 0x355624, 0x2a4418, 0x3e5e28], pet=0.1, tw=0.01),
    'pampas': dict(S=1.0),
}


def blade_fn(spec):
    if spec == 'palm':
        return lambda L, rng: leaf_palmate(L, rng)
    prof, wr, fold, curl, *rest = spec
    sick = rest[0] if rest else 0.0
    return lambda L, rng: leaf_blade(L, L * wr * rng.uniform(0.85, 1.15), PROF[prof], 7, fold, curl * rng.uniform(0.5, 1.5), sick * rng.uniform(0.4, 1.2) * rng.choice([-1, 1]))


def add_flower(g, rng, p, r, col):
    zh = nrmz(np.array([rng.normal(0, 0.3), rng.normal(0, 0.3), 1.0]))
    for k in range(5):
        a = k * 2 * math.pi / 5 + rng.normal(0, 0.12)
        Vl, Fl, sh = leaf_blade(r, r * 0.9, PROF['ellip'], 3, 0.0, -0.3)
        g.add(place(Vl, p, np.array([math.cos(a), math.sin(a), 0.3]), zh), Fl, col * sh[:, None])
    Vc, Fc, _ = leaf_blade(r * 0.35, r * 0.35, PROF['ellip'], 2, 0, 0)
    g.add(place(Vc, p + [0, -r * 0.17, r * 0.12], [0, 1, 0], zh), Fc, hx(0xd8b048))


def cl_broad(rng, S, cfg):
    g = Geo()
    twc = hx(cfg.get('twig', 0x5a4636))
    cols = [hx(c) for c in cfg['cols']]
    main = twig(rng, [0, 0.03 * S, 0], [rng.uniform(-0.1, 0.1) * S, cfg.get('reach', 0.8) * S, 0.02 * S], 9, 0.1)
    tws = [main]
    for k in range(cfg.get('side', 3)):
        src = tws[rng.integers(len(tws))] if k > 2 else main
        p0 = src[rng.integers(2, len(src) - 1)]
        a = (1 if k % 2 else -1) * rng.uniform(0.45, 1.05)
        e = p0 + np.array([math.sin(a), math.cos(a), 0]) * rng.uniform(0.22, 0.4) * S
        e[0], e[1] = np.clip(e[0], -0.4 * S, 0.4 * S), min(e[1], 0.9 * S)
        tws.append(twig(rng, p0, e, 6, 0.12))
    for j, t in enumerate(tws):
        V, F = strip(t, cfg.get('tw', 0.012) * S * (1 if j == 0 else 0.65), 0.003 * S)
        g.add(V, F, twc)
    blade = blade_fn(cfg['shape'])
    for i in range(cfg['n']):
        t = main if rng.random() < 0.3 else tws[rng.integers(len(tws))]
        q = rng.uniform(0.1, 1.0) ** 0.6
        k = min(len(t) - 2, int(q * (len(t) - 1)))
        p = t[k] + (t[k + 1] - t[k]) * rng.random()
        td = nrmz(t[k + 1] - t[k])
        if cfg.get('whorl') and rng.random() < 0.55:
            p, a = t[-1], rng.uniform(-1.5, 1.5)
        elif cfg.get('droop'):
            a = rng.choice([-1, 1]) * rng.uniform(1.6, 2.7)
        elif q > 0.93 and rng.random() < 0.5:
            a = rng.normal(0, 0.25)
        else:
            a = rng.choice([-1, 1]) * rng.uniform(*cfg.get('spread', (0.5, 1.25)))
        d = rotz(td, a)
        d[2] = rng.uniform(-0.3, 0.3)
        d = nrmz(d)
        L = cfg['L'] * rng.uniform(0.75, 1.15)
        pet = cfg.get('pet', 0.12) * L
        ok = False
        for _ in range(5):
            tip = p + d * (L + pet)
            if abs(tip[0]) < 0.47 * S and 0.02 * S < tip[1] < 0.97 * S:
                ok = True
                break
            L, pet = L * 0.75, pet * 0.75
        if not ok:
            continue
        Vl, Fl, sh = blade(L, rng)
        zh = nrmz(np.array([rng.normal(0, 0.35), rng.normal(0, 0.35), 1.0]))
        c = pick_col(rng, cols)
        dz = np.array([0, 0, rng.uniform(0, cfg.get('depth', 0.1)) * S])
        g.add(place(Vl, p + d * pet + dz, d, zh), Fl, c[None] * sh[:, None])
        if pet > 0.004:
            Vp, Fp = strip([p, p + d * pet + dz], 0.004, 0.003)
            g.add(Vp, Fp, c * 0.8)
    fcols = [hx(c) for c in cfg.get('fcols', [0xffffff])]
    for i in range(cfg.get('flowers', 0)):
        t = tws[rng.integers(len(tws))]
        p = t[rng.integers(1, len(t))]
        for j in range(rng.integers(3, 6)):
            q = p + np.array([rng.normal(0, 0.03), rng.normal(0, 0.03), rng.uniform(0.02, 0.1)]) * S / 0.78
            q[0], q[1] = np.clip(q[0], -0.44 * S, 0.44 * S), np.clip(q[1], 0.05 * S, 0.94 * S)
            add_flower(g, rng, q, cfg['fr'] * rng.uniform(0.85, 1.15), pick_col(rng, fcols, 0.06))
    return g


def cl_pine(rng, S, cfg):
    g = Geo()
    cols = [hx(c) for c in cfg['cols']]
    tws = [twig(rng, [0, 0.03 * S, 0], [rng.uniform(-0.05, 0.05) * S, 0.62 * S, 0], 8, 0.05)]
    for k in range(3):
        p0 = tws[0][rng.integers(2, 6)]
        a = (1 if k else -1) * rng.uniform(0.5, 0.8)
        tws.append(twig(rng, p0, p0 + np.array([math.sin(a), math.cos(a), 0]) * 0.3 * S, 6, 0.05))
    for t in tws:
        V, F = strip(t, 0.018 * S, 0.01 * S)
        g.add(V, F, hx(0x5a4030))
    shade = np.array([0.72, 0.95, 1.08] * 2)[:, None]
    for ti, t in enumerate(tws):
        for i in range(210 if ti == 0 else 120):
            q = rng.uniform(0.12, 1.0) ** 0.7
            k = min(len(t) - 2, int(q * (len(t) - 1)))
            p = t[k] + (t[k + 1] - t[k]) * rng.random()
            td = nrmz(t[k + 1] - t[k])
            az, th = rng.uniform(0, 2 * math.pi), rng.uniform(0.35, 1.05)
            perp = nrmz(np.cross(td, [0, 0, 1]))
            bd = nrmz(td * math.cos(th) + (perp * math.cos(az) + np.array([0, 0, 1.0]) * math.sin(az)) * math.sin(th))
            L, c = cfg['L'] * rng.uniform(0.8, 1.1), pick_col(rng, cols)
            for j in range(3):
                d = nrmz(bd + rng.normal(0, 0.07, 3))
                end = p + d * L
                if abs(end[0]) > 0.48 * S or not (0.01 * S < end[1] < 0.98 * S):
                    continue
                V, F = strip([p, p + d * L * 0.5 + [0, -0.004, 0], end], 0.0032, 0.0014)
                g.add(V, F, c[None] * shade)
    return g


def cl_cypress(rng, S, cfg):
    g = Geo()
    cols = [hx(c) for c in cfg['cols']]

    def rec(p, d, L, w, depth):
        pts, dd = [p], d.copy()
        for i in range(5):
            dd = nrmz(dd + rng.normal(0, 0.12, 3) * [1, 1, 0.5])
            pts.append(pts[-1] + dd * L / 5)
        pts = np.array(pts)
        pts[:, 0] = np.clip(pts[:, 0], -0.47 * S, 0.47 * S)
        pts[:, 1] = np.clip(pts[:, 1], 0.02 * S, 0.97 * S)
        V, F = strip(pts, w, w * 0.6)
        g.add(V, F, pick_col(rng, cols) * (0.72 + 0.12 * depth))
        if depth >= 4:
            return
        nc = [7, 7, 5, 4][depth]
        for k in range(nc):
            t = (k + 1) / (nc + 1)
            cd = rotz(d, (1 if k % 2 else -1) * rng.uniform(0.6, 0.95))
            cd[2] += rng.normal(0, 0.35)
            rec(pts[min(4, int(t * 5))], nrmz(cd), L * rng.uniform(0.38, 0.5) * (1 - 0.4 * t), w * 0.62, depth + 1)

    for k in range(14):
        a = rng.uniform(-1.05, 1.05)
        rec(np.array([rng.normal(0, 0.03) * S, 0.04 * S, 0]), nrmz(np.array([math.sin(a), math.cos(a), rng.normal(0, 0.2)])),
            rng.uniform(0.42, 0.62) * S, 0.015, 0)
    return g


def cl_redwood(rng, S, cfg):
    """Flat two-ranked needle sprays: main twig, alternate side twigs, needles in the spray plane."""
    g = Geo()
    cols = [hx(c) for c in cfg['cols']]
    tip = hx(cfg['tip'])
    main = twig(rng, [0, 0.03 * S, 0], [rng.uniform(-0.08, 0.08) * S, 0.92 * S, 0], 10, 0.06)
    tws = [main]
    k = 0
    for t in np.linspace(0.12, 0.85, 11):
        p0 = main[min(len(main) - 2, int(t * (len(main) - 1)))]
        sd = 1 if k % 2 else -1
        a = sd * rng.uniform(0.75, 1.05)
        L = (0.42 - 0.3 * t) * S * rng.uniform(0.85, 1.1)
        e = p0 + np.array([math.sin(a), math.cos(a), 0]) * L
        e[0] = np.clip(e[0], -0.46 * S, 0.46 * S)
        tw = twig(rng, p0, e, 6, 0.08)
        tws.append(tw)
        for u in (0.35, 0.65):
            q0 = tw[int(u * (len(tw) - 1))]
            dd = nrmz(tw[-1] - tw[0])
            for sd2 in (-1, 1):
                e2 = q0 + rotz(dd, sd2 * rng.uniform(0.6, 0.9)) * L * rng.uniform(0.3, 0.45)
                e2[0] = np.clip(e2[0], -0.46 * S, 0.46 * S)
                e2[1] = np.clip(e2[1], 0.03 * S, 0.97 * S)
                tws.append(twig(rng, q0, e2, 4, 0.06))
        k += 1
    for j, t in enumerate(tws):
        V, F = strip(t, 0.006 * S * (1 if j == 0 else 0.6), 0.002 * S)
        g.add(V, F, hx(0x5a4632))
    for j, t in enumerate(tws):
        seg = np.linalg.norm(np.diff(t, axis=0), axis=1)
        s_ = np.concatenate([[0], np.cumsum(seg)])
        n = int(s_[-1] / (0.014 * S))
        for i in range(n):
            q = (i + rng.random() * 0.5) / max(n, 1)
            k2 = min(len(t) - 2, int(q * (len(t) - 1)))
            p = t[k2] + (t[k2 + 1] - t[k2]) * rng.random()
            td = nrmz(t[k2 + 1] - t[k2])
            L = 0.055 * S * (0.55 + 0.45 * math.sin(math.pi * min(1.0, q * 1.1 + 0.08))) * rng.uniform(0.85, 1.1)
            c = pick_col(rng, cols) if q < 0.8 else mix(pick_col(rng, cols), tip, (q - 0.8) / 0.2 * 0.7)
            for sd in (-1, 1):
                d = nrmz(rotz(td, sd * rng.uniform(1.05, 1.35)) + [0, 0, rng.normal(0, 0.1)])
                Vl, Fl, sh = leaf_blade(L, L * 0.28, PROF['lance'], 3, 0.2, 0.05)
                g.add(place(Vl, p, d, [0, 0, 1.0]), Fl, c[None] * sh[:, None])
    return g


def cl_pampas(rng, variant):
    """variant 0: arching bundle of long grey-green blades (base at the bottom centre); 1: cream feathery plume on a stalk."""
    g = Geo()
    if variant == 0:
        cols = [hx(c) for c in (0x7a8a5a, 0x6a7a4c, 0x84905e, 0x5e6c44)]
        for i in range(16):
            x1 = rng.uniform(-0.44, 0.44)
            y1 = rng.uniform(0.7, 0.98)
            pts = np.array([[x1 * (s ** 1.6) + rng.normal(0, 0.01), y1 * s, 0] for s in np.linspace(0, 1, 9)])
            V, F = strip(pts, 0.03, 0.004)
            c = pick_col(rng, cols)
            C = np.concatenate([mix(c, hx(0xb4a472), np.linspace(0, 1, 9) ** 3 * 0.8)] * 2)
            g.add(V, F, C)
        return g
    V, F = strip([[0, 0.0, 0], [0, 0.3, 0], [0, 0.56, 0]], 0.022, 0.016)
    g.add(V, F, hx(0xa8a07a))
    cols = [hx(c) for c in (0xe6dcc4, 0xd8ccaa, 0xece0cc, 0xd4c4a8)]
    rach = np.array([[rng.normal(0, 0.005), y, 0] for y in np.linspace(0.45, 0.98, 12)])
    V, F = strip(rach, 0.01, 0.004)
    g.add(V, F, hx(0xc8bc98))
    for i in range(420):
        q = rng.random()
        p = rach[0] + (rach[-1] - rach[0]) * q
        env = math.sin(math.pi * min(1.0, q * 0.95 + 0.05)) ** 0.7 * 0.42
        a = rng.choice([-1, 1]) * rng.uniform(0.15, 1.2)
        d = nrmz(np.array([math.sin(a), math.cos(a) * 1.3, rng.normal(0, 0.3)]))
        L = env * rng.uniform(0.4, 1.0)
        e = p + d * L
        e[0] = np.clip(e[0], -0.47, 0.47)
        e[1] = min(e[1], 0.99)
        V, F = strip(twig(rng, p, e, 4, 0.15), 0.008, 0.002)
        g.add(V, F, pick_col(rng, cols, 0.08))
    return g


def cl_frond(rng, variant):
    g = Geo()
    cols = [hx(c) for c in ((0x4e6a2c, 0x5a7632, 0x46602a, 0x557030) if variant == 0 else (0x5a6a30, 0x66743a, 0x56642c, 0x6e7640))]
    V, F = strip(np.stack([np.linspace(0, 5.5, 24), np.zeros(24), np.zeros(24)], 1), 0.075, 0.014)
    g.add(V, F, hx(0x9a9a4a if variant == 0 else 0xa89a50))
    nl = 125
    for side in (-1, 1):
        for i in range(nl):
            s0 = 0.03 + 0.955 * (i + (0.5 if side > 0 else 0)) / nl
            x = s0 * 5.6
            if s0 < 0.17:   # petiole spines
                L, a, W, col, fold = 0.07 + 0.25 * s0 / 0.17, rng.uniform(0.35, 0.6), 0.009, hx(0x9a9656), 0.0
            else:
                pr = math.sin(math.pi * min(1.0, (s0 - 0.12) / 0.9)) ** 0.55
                L, a, W, col, fold = 0.14 + 0.54 * pr, rng.uniform(0.62, 0.85), 0.024, pick_col(rng, cols), 0.6
            L = min(L * rng.uniform(0.92, 1.06), 0.66 / math.sin(a), (5.58 - x) / max(0.2, math.cos(a)))
            if L < 0.03:
                continue
            d = nrmz(np.array([math.cos(a), side * math.sin(a), rng.normal(0, 0.25)]))
            Vl, Fl, sh = leaf_blade(L, W, PROF['lance'], 6, fold, 0.08)
            g.add(place(Vl, np.array([x, side * 0.02, 0.0]), d, nrmz(np.array([0, -side * 0.3, 1]))), Fl, col[None] * sh[:, None])
    return g


def cl_fan(rng):
    g = Geo()
    cols = [hx(c) for c in (0x5f7a3a, 0x6b8442, 0x55703a, 0x66803e)]
    hc = np.array([0, 0.64, 0.0])
    V, F = strip([[0, 0, 0], [0, 0.35, 0], hc], 0.06, 0.045)
    g.add(V, F, hx(0x7a7a44))
    ns, span = 58, 1.95
    for i in range(ns):
        a = math.pi / 2 - span + 2 * span * (i + 0.5) / ns
        d = np.array([math.cos(a), math.sin(a), 0.0])
        rj = 0.5 * rng.uniform(0.92, 1.05)
        rt = min(0.76, rj + rng.uniform(0.18, 0.27))
        c = pick_col(rng, cols)
        Vl, Fl, sh = leaf_blade(rj, 2 * span / ns * rj * 1.15, lambda t: np.clip(t * 1.1, 0.12, 1), 6, 0.55 if i % 2 else -0.55, 0.0)
        g.add(place(Vl, hc + d * 0.04, d, [0, 0, 1]), Fl, c[None] * sh[:, None])
        for k in (-1, 1):
            a2 = a + k * span / ns * 0.3
            p0 = hc + np.array([math.cos(a2), math.sin(a2), 0]) * rj
            dd = nrmz(np.array([math.cos(a2), math.sin(a2) - 0.35, -0.3]))
            Vt, Ft = strip([p0, p0 + dd * (rt - rj) * 0.5, p0 + dd * (rt - rj)], 0.018, 0.004)
            g.add(Vt, Ft, c * 0.85 + hx(0x403818) * 0.3)
    return g


def cl_fandead(rng):
    g = Geo()
    hc = np.array([0, 1.3, 0])
    V, F = strip([[0, 1.58, 0], hc], 0.05, 0.045)
    g.add(V, F, hx(0x6a5a44))
    cols = [hx(c) for c in (0x8a7458, 0x6e5a44, 0x9a8a6a, 0x5a4a3a, 0x7a6a50)]
    for i in range(40):
        a = -math.pi / 2 + rng.uniform(-0.3, 0.3)
        L = rng.uniform(0.9, 1.2)
        Vl, Fl, sh = leaf_blade(L, 0.035, lambda t: np.clip(0.5 + t, 0, 1) * (1 - t ** 4), 5, 0.4, 0.1)
        g.add(place(Vl, hc, np.array([math.cos(a), math.sin(a), rng.normal(0, 0.15)]), [0, 0, 1]), Fl, pick_col(rng, cols)[None] * sh[:, None])
    return g


def build_item(key, kind):
    rng = np.random.default_rng(zlib.crc32(key.encode()))
    if kind == 'leaf':
        leaf = key.split('_')[1]
        cfg = LEAF_CFG[leaf]
        S = cfg['S']
        if leaf == 'pampas':
            return cl_pampas(rng, int(key.split('_')[2])), (-S / 2, 0, S, S)
        g = cl_pine(rng, S, cfg) if leaf == 'pine' else cl_cypress(rng, S, cfg) if leaf == 'cypress' else cl_redwood(rng, S, cfg) if leaf == 'redwood' \
            else cl_broad(rng, S, cfg)
        return g, (-S / 2, 0, S, S)
    if kind == 'frond':
        return cl_frond(rng, 0 if key.endswith('a') else 1), (0, -0.7, 5.6, 1.4)
    if kind == 'fan':
        return cl_fan(rng), (-0.8, 0, 1.6, 1.6)
    return cl_fandead(rng), (-0.4, 0, 0.8, 1.6)


# ---------------------------------------------------------------- Blender scene helpers
def reset():
    hb.reset_factory()
    hb._STATE['dev'] = None


def scene_setup(rx, ry, spp, transform='Standard', denoise=False):
    sc = hb.setup_render(rx, ry, samples=spp, look='None')
    sc.view_settings.view_transform = transform
    try:
        sc.view_settings.look = 'None'
    except Exception:
        pass
    sc.render.film_transparent = True
    sc.cycles.use_denoising = denoise
    sc.cycles.transparent_max_bounces = 128
    sc.cycles.max_bounces = 8
    sc.cycles.filter_width = 1.2
    sc.render.dither_intensity = 0.0
    sc.render.image_settings.color_mode = 'RGBA'
    return sc


def set_world(sc, color=(1, 1, 1), strength=1.0):
    w = bpy.data.worlds.new('W')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    nt.nodes.clear()
    bg, out = nt.nodes.new('ShaderNodeBackground'), nt.nodes.new('ShaderNodeOutputWorld')
    bg.inputs['Color'].default_value = (*color, 1)
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def ortho_cam(sc, cx, cy, scale, z=200.0, rot=(0, 0, 0)):
    cd = bpy.data.cameras.new('C')
    cd.type, cd.ortho_scale, cd.clip_start, cd.clip_end = 'ORTHO', scale, 0.01, 2 * z + 400
    cam = bpy.data.objects.new('C', cd)
    sc.collection.objects.link(cam)
    cam.location, cam.rotation_euler = (cx, cy, z), rot
    sc.camera = cam
    return cam


def mk_obj(sc, name, V, F, vcol=None, uv=None, pattrs=None, mat=None, link=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(V, np.float64).tolist(), [], np.asarray(F, np.int64).tolist())
    Fr = np.asarray(F).ravel()
    if vcol is not None:
        a = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
        c = vcol[Fr]
        a.data.foreach_set('color', np.concatenate([c, np.ones((len(c), 1))], 1).astype(np.float32).ravel())
    if uv is not None:
        me.uv_layers.new(name='UVMap').data.foreach_set('uv', np.asarray(uv, np.float32)[Fr].ravel())
    for nm, arr in (pattrs or {}).items():
        arr = np.asarray(arr, np.float32)
        if arr.ndim == 1:
            me.attributes.new(nm, 'FLOAT', 'POINT').data.foreach_set('value', arr)
        else:
            me.attributes.new(nm, 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', arr.ravel())
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    if link:
        sc.collection.objects.link(ob)
    return ob, me


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt


def N(nt, typ, **kw):
    n = nt.nodes.new(typ)
    for k, v in kw.items():
        if hasattr(n, k):
            setattr(n, k, v)
        else:
            n.inputs[k].default_value = v
    return n


def emit_out(nt, color_socket, alpha_socket=None):
    em = N(nt, 'ShaderNodeEmission', Strength=1.0)
    nt.links.new(color_socket, em.inputs['Color'])
    out = N(nt, 'ShaderNodeOutputMaterial')
    if alpha_socket is None:
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        return
    gt = N(nt, 'ShaderNodeMath', operation='GREATER_THAN')
    gt.inputs[1].default_value = 0.5
    nt.links.new(alpha_socket, gt.inputs[0])
    tr, mx = N(nt, 'ShaderNodeBsdfTransparent'), N(nt, 'ShaderNodeMixShader')
    nt.links.new(gt.outputs[0], mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])


def normal_color(nt, vec_socket):
    ma = N(nt, 'ShaderNodeVectorMath', operation='MULTIPLY_ADD')
    ma.inputs[1].default_value = (0.5, 0.5, 0.5)
    ma.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(vec_socket, ma.inputs[0])
    return ma.outputs[0]


def atex(nt, img):
    uvn = N(nt, 'ShaderNodeUVMap', uv_map='UVMap')
    tex = N(nt, 'ShaderNodeTexImage', interpolation='Linear')
    tex.image = img
    nt.links.new(uvn.outputs[0], tex.inputs['Vector'])
    return tex


def scale_by(nt, vec, fac_socket):
    m = N(nt, 'ShaderNodeVectorMath', operation='SCALE')
    nt.links.new(vec, m.inputs[0])
    nt.links.new(fac_socket, m.inputs['Scale'])
    return m.outputs['Vector']


# ---------------------------------------------------------------- stage: atlas
def stage_atlas(lay):
    reset()
    sc = scene_setup(AT, AT, SPP, 'Standard', denoise=True)
    set_world(sc, (1, 1, 1), 1.0)
    ml, nt = new_mat('AT_LIT')
    at = N(nt, 'ShaderNodeAttribute', attribute_name='col')
    tc, nz = N(nt, 'ShaderNodeTexCoord'), N(nt, 'ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value, nz.inputs['Detail'].default_value = 60.0, 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    fm = N(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD')
    fm.inputs[1].default_value, fm.inputs[2].default_value = 0.35, 0.82
    nt.links.new(nz.outputs['Fac'], fm.inputs[0])
    df, out = N(nt, 'ShaderNodeBsdfDiffuse'), N(nt, 'ShaderNodeOutputMaterial')
    nt.links.new(scale_by(nt, at.outputs['Color'], fm.outputs[0]), df.inputs['Color'])
    nt.links.new(df.outputs[0], out.inputs['Surface'])
    mn, nt2 = new_mat('AT_NRM')
    geo = N(nt2, 'ShaderNodeNewGeometry')
    emit_out(nt2, normal_color(nt2, geo.outputs['Normal']))
    meshes, ntri = [], 0
    for key, (c, r, w, h, kind) in lay.items():
        if kind == 'bark':
            continue
        g, (ox, oy, PW, PH) = build_item(key, kind)
        V, F, C = g.arrays()
        V[:, 0] = np.clip(V[:, 0], ox + 0.001 * PW, ox + 0.999 * PW)
        V[:, 1] = np.clip(V[:, 1], oy + 0.001 * PH, oy + 0.999 * PH)
        x0, y0, k = c - 4, 4 - (r + h), w * 0.96 / PW
        B = np.stack([x0 + w * 0.02 + (V[:, 0] - ox) * k, y0 + h * 0.02 + (V[:, 1] - oy) * k, V[:, 2] * k], 1)
        ob, me = mk_obj(sc, key, B, F, vcol=C, mat=ml)
        meshes.append(me)
        ntri += len(F)
    log('atlas geometry', len(meshes), 'cards,', ntri, 'tris')
    ortho_cam(sc, 0, 0, 8.0, z=50)
    pa, pn = os.path.join(CACHE, 'atlas_a.png'), os.path.join(CACHE, 'atlas_n.png')
    log('atlas albedo render %.0fs' % hb.render_to(pa))
    for me in meshes:
        me.materials[0] = mn
    sc.view_settings.view_transform = 'Raw'
    sc.cycles.samples, sc.cycles.use_denoising = 32, False
    set_world(sc, (0, 0, 0), 0.0)
    log('atlas normal render %.0fs' % hb.render_to(pn))
    A, Nn = img_read(pa), img_read(pn)[..., :3]
    alb, a = A[..., :3], A[..., 3].copy()
    for key, (c, r, w, h, kind) in lay.items():
        if kind != 'bark':
            continue
        name = key[5:] if key.startswith('bark_') else key
        col, nrm = bark_maps(name, 512 * w, 512 * h, zlib.crc32(key.encode()))
        ys, xs = slice(r * 512, (r + h) * 512), slice(c * 512, (c + w) * 512)
        alb[ys, xs], Nn[ys, xs], a[ys, xs] = col, nrm, 1.0
    alb, Nn = pushpull(alb, a), pushpull(Nn, a)
    img_write(os.path.join(CACHE, 'leaves_albedo_straight.png'), np.dstack([alb, a]))
    img_write(os.path.join(OUT, 'leaves_albedo.webp'), np.dstack([lin2srgb(srgb2lin(alb) * a[..., None]), a]), 'WEBP', 90)
    img_write(os.path.join(OUT, 'leaves_normal.webp'), half(Nn), 'WEBP', 92)
    img_write(os.path.join(ROOT, 'shots', 'trees_atlas.jpg'), alb[::4, ::4] * a[::4, ::4, None] + 0.45 * (1 - a[::4, ::4, None]), 'JPEG', 88)
    log('atlas written')


# ---------------------------------------------------------------- species
SPECIES = [
    dict(id='plane', H=14.5, hb=3.4, R0=0.34, crown=('clumps', (0, 9.6, 0), (5.4, 4.2, 5.4), 9, (2.7, 2.3)), clump_lo=-0.2, M=2200, leaders=4, lel=(0.75, 1.1), llen=(2.8, 4.0), spine=0.45,
         cards=2300, leaf='plane', bark='plane', flare=0.18, collider=0.35),
    dict(id='plane2', H=12.0, hb=2.9, R0=0.28, crown=('clumps', (0, 8.0, 0), (4.6, 3.6, 4.6), 8, (2.4, 2.0)), clump_lo=-0.2, M=1900, leaders=3, lel=(0.8, 1.15), llen=(2.4, 3.4), spine=0.4,
         cards=1950, leaf='plane', bark='plane', flare=0.18, seed=29, collider=0.3),
    dict(id='ficus', H=8.5, hb=2.1, R0=0.26, crown=('ell', (0, 5.5, 0), (3.9, 3.0, 3.9)), shell=0.45, bot=0.6, M=1900, leaders=3, lel=(0.6, 1.0), llen=(1.6, 2.4),
         cards=2700, leaf='ficus', bark='ficus', flare=0.3, seed=5, collider=0.3),
    dict(id='ficus2', H=7.2, hb=1.9, R0=0.22, crown=('ell', (0, 4.8, 0), (3.2, 2.5, 3.2)), shell=0.45, bot=0.5, M=1600, leaders=2, lel=(0.7, 1.1), llen=(1.4, 2.0),
         cards=2300, leaf='ficus', bark='ficus', flare=0.3, seed=17, collider=0.28),
    dict(id='oak', H=11.0, hb=1.7, R0=0.5, crown=('ell', (0, 6.8, 0), (7.6, 4.2, 7.0)), shell=0.55, bot=0.5, M=2600, leaders=4, lel=(0.25, 0.7), llen=(3.5, 5.5),
         trop=0.03, crook=0.22, lean=0.7, cards=2900, leaf='oak', bark='oak', flare=0.35, seed=43, collider=0.55),
    dict(id='oak2', H=9.0, hb=1.4, R0=0.4, crown=('ell', (0, 5.6, 0), (6.0, 3.6, 5.6)), shell=0.55, bot=0.5, M=2200, leaders=3, lel=(0.3, 0.8), llen=(3.0, 4.5),
         trop=0.03, crook=0.22, lean=0.6, cards=2450, leaf='oak', bark='oak', flare=0.35, seed=47, collider=0.45),
    dict(id='brisbox', H=12.5, hb=2.7, R0=0.28, crown=('ell', (0, 8.3, 0), (3.7, 4.4, 3.7)), bot=0.8, M=2000, leaders=2, lel=(1.1, 1.35), llen=(2.5, 3.5), spine=0.6,
         trop=0.18, cards=2200, leaf='brisbox', bark='brisbox', seed=61, collider=0.3),
    dict(id='cherry', H=6.5, hb=1.4, R0=0.18, crown=('vase', 1.9, 6.4, 1.0, 3.3), shell=0.6, M=1500, leaders=5, lel=(0.85, 1.15), llen=(1.4, 2.0),
         cards=1650, leaf='cherry', bark='cherry', seed=3, collider=0.25, step=0.3),
    dict(id='plum', H=6.3, hb=1.6, R0=0.17, crown=('ell', (0, 4.2, 0), (2.9, 2.2, 2.9)), M=1500, leaders=4, lel=(0.8, 1.2), llen=(1.2, 1.8),
         cards=1750, leaf='plum', bark='cherry', seed=9, collider=0.22, step=0.3),
    dict(id='euc', cls='forest', H=40.0, hb=15.0, R0=0.7, crown=('clumps', (0, 28.0, 0), (8.0, 11.5, 8.0), 10, (3.8, 3.2)), clump_lo=-0.5, cs=1.5, M=2800, leaders=3, lel=(1.05, 1.35),
         llen=(4.0, 7.0), spine=0.6, trop=0.2, cards=2600, leaf='euc', bark='euc', vcard=0.6, seed=41, collider=0.6, step=0.55, bark_tris=4600),
    dict(id='euc2', cls='forest', H=26.0, hb=9.0, R0=0.5, crown=('clumps', (0, 17.5, 0), (6.2, 8.0, 6.2), 8, (3.2, 2.6)), clump_lo=-0.5, cs=1.45, M=2500, leaders=3, lel=(1.0, 1.3),
         llen=(3.5, 6.0), spine=0.55, trop=0.2, cards=2300, leaf='euc', bark='euc', vcard=0.6, seed=53, collider=0.5, step=0.5, bark_tris=4200),
    dict(id='pine', cls='forest', H=28.0, hb=9.0, R0=0.6, crown=('clumps', (0, 19.5, 0), (8.5, 8.0, 8.5), 11, (3.8, 2.6)), clump_lo=-0.3, cs=1.5, M=3000, leaders=5, lel=(0.5, 1.0),
         llen=(3.5, 6.0), spine=0.7, trop=0.15, cards=3200, leaf='pine', bark='pine', up=0.45, seed=31, collider=0.55, step=0.5, bark_tris=4400),
    dict(id='pine2', cls='forest', H=21.0, hb=5.5, R0=0.48, crown=('clumps', (0, 14.0, 0), (7.0, 7.0, 7.0), 10, (3.2, 2.4)), clump_lo=-0.3, cs=1.45, M=2700, leaders=5, lel=(0.5, 1.0),
         llen=(3.0, 5.0), spine=0.7, trop=0.15, cards=2800, leaf='pine', bark='pine', up=0.45, seed=37, collider=0.48, step=0.45, bark_tris=4000),
    dict(id='cypress', cls='forest', H=19.0, hb=2.8, R0=0.78, crown=('pads', (0, 13.0, 0), (10.0, 5.5, 9.0), 15, (4.6, 2.4)), cs=1.5, M=3600, leaders=5, lel=(0.35, 0.85),
         llen=(5.0, 7.5), trop=0.05, crook=0.16, lean=0.6, cards=3400, leaf='cypress', bark='cypress', up=0.6, flare=0.3, seed=17, collider=0.7, step=0.5, bark_tris=4600),
    dict(id='cypress2', cls='forest', H=15.0, hb=2.3, R0=0.6, crown=('pads', (0, 10.0, 0), (7.5, 4.5, 7.0), 12, (3.8, 2.0)), cs=1.45, M=3000, leaders=4, lel=(0.35, 0.9),
         llen=(4.0, 6.0), trop=0.05, crook=0.16, lean=0.9, cards=3000, leaf='cypress', bark='cypress', up=0.6, flare=0.3, seed=23, collider=0.6, step=0.45, bark_tris=4200),
    dict(id='canary', kind='palm', trunk=10.5, R0=0.45, fronds=118, fl=5.6, seed=7, collider=0.55),
    dict(id='canary2', kind='palm', trunk=7.2, R0=0.47, fronds=100, fl=5.2, seed=19, collider=0.55),
    dict(id='fanpalm', kind='fan', trunk=20.5, R0=0.22, fans=38, seed=13, collider=0.35),
    dict(id='fanpalm2', kind='fan', trunk=14.6, R0=0.24, fans=32, seed=27, collider=0.35),
    dict(id='scrub', cls='scrub', H=1.8, hb=0.0, R0=0.045, crown=('ell', (0, 1.0, 0), (1.6, 0.9, 1.6)), bot=0.5, M=700, leaders=6, lel=(0.5, 1.3), llen=(0.5, 0.9),
         cards=560, leaf='scrub', bark='oak', seed=61, collider=0.0, step=0.18, bark_tris=500, bark1=0, k1=120, rmin=0.008, bark2=0, k2=40),
    # coast redwood (Golden Gate Park groves): straight single leader, narrow cone of drooping sprays
    dict(id='redwood', cls='forest', H=42.0, hb=5.0, R0=1.0, crown=('cone', 5.0, 42.5, 6.2), shell=0.55, M=3600, leaders=0, spine=0.95, spine_el=1.555,
         lel=(0.1, 0.3), llen=(2.0, 3.0), trop=-0.04, whorls=True, cs=1.9, crook=0.03, lean=0.04, cards=4800, leaf='redwood', bark='redwood', up=0.1, flare=0.45, seed=71, collider=1.0, step=0.6,
         bark_tris=4000, k1=460),
    dict(id='redwood2', cls='forest', H=32.0, hb=3.5, R0=0.75, crown=('cone', 3.5, 32.5, 4.9), shell=0.55, M=3000, leaders=0, spine=0.95, spine_el=1.55,
         lel=(0.1, 0.3), llen=(2.0, 3.0), trop=-0.04, whorls=True, cs=1.9, crook=0.03, lean=0.04, cards=4000, leaf='redwood', bark='redwood', up=0.1, flare=0.4, seed=73, collider=0.8, step=0.55,
         bark_tris=3800, k1=420),
    # wind-shorn coastal Monterey cypress (Lands End / Sea Cliff / Ocean Beach): leans and streams downwind (+x), flat sheared top
    dict(id='cypress3', cls='forest', H=11.0, hb=1.4, R0=0.75, crown=('pads', (3.5, 7.0, 0), (9.0, 2.8, 6.5), 13, (4.4, 1.7)), shear=1.6, cs=1.5, M=3200,
         leaders=5, lel=(0.2, 0.6), llen=(4.5, 7.0), trop=0.02, crook=0.18, lean=1.6, leandir=(1.0, 0.0), cards=3000, leaf='cypress', bark='cypress', up=0.7,
         flare=0.35, seed=91, collider=0.7, step=0.45, bark_tris=4200),
    dict(id='ginkgo', H=11.0, hb=2.4, R0=0.2, crown=('ell', (0, 7.0, 0), (2.9, 4.3, 2.9)), shell=0.5, M=1800, leaders=4, lel=(1.0, 1.3), llen=(2.4, 3.4),
         spine=0.6, trop=0.2, cards=1600, leaf='ginkgo', bark='ginkgo', seed=83, collider=0.25, step=0.35),
    # Victorian box (Pittosporum undulatum): dense glossy dome, residential streets
    dict(id='vbox', H=8.5, hb=1.7, R0=0.24, crown=('ell', (0, 5.3, 0), (3.5, 3.2, 3.5)), shell=0.6, bot=0.6, M=2000, leaders=4, lel=(0.6, 1.0),
         llen=(1.5, 2.3), cards=2600, leaf='vbox', bark='ficus', seed=87, collider=0.25, step=0.35),
    # pampas grass (coastal bluffs, freeway slopes): fountain of blades + cream plumes
    dict(id='pampas', kind='tuft', cls='scrub', H=3.0, blades=80, plumes=16, seed=97, collider=0.0),
]
DEF = dict(kind='broad', cls='street', shell=0.5, bot=0.7, trop=0.1, step=0.4, flare=0.2, lean=0.25, crook=0.12, up=0.25, seed=11, spine=0.0, bark_tris=3600, bark1=380, k1=430,
           bark2=110, k2=110)
SPECIES = [{**DEF, **s} for s in SPECIES]


# ---------------------------------------------------------------- skeleton: envelopes + space colonisation
def env_points(sp, rng):
    kind, *p = sp['crown']
    M = sp['M']
    if kind == 'ell':
        c, r = np.array(p[0]), np.array(p[1])
        u = nrmz(rng.normal(size=(M, 3)))
        rad = np.where(rng.random(M) < sp['shell'], rng.uniform(0.72, 1.0, M), rng.random(M) ** (1 / 3))
        q = u * rad[:, None]
        q[:, 1] = np.where(q[:, 1] < 0, q[:, 1] * sp['bot'], q[:, 1])
        return c + q * r
    if kind == 'vase':
        y0, y1, r0, r1 = p
        y = rng.uniform(y0, y1, M)
        rr = r0 + (r1 - r0) * ((y - y0) / (y1 - y0)) ** 0.7
        rad = np.where(rng.random(M) < sp['shell'], rng.uniform(0.6, 1.0, M), rng.random(M) ** 0.5) * rr
        a = rng.uniform(0, 2 * math.pi, M)
        return np.stack([np.cos(a) * rad, y, np.sin(a) * rad], 1)
    if kind == 'cone':   # conifer cone: volume-uniform in height, radius tapering to the tip
        y0, y1, r0 = p
        y = y1 - (y1 - y0) * rng.random(M) ** (1 / 3)
        rr = r0 * ((y1 - y) / (y1 - y0)) ** 0.95
        rad = np.where(rng.random(M) < sp['shell'], rng.uniform(0.65, 1.0, M), rng.random(M) ** 0.5) * rr
        a = rng.uniform(0, 2 * math.pi, M)
        return np.stack([np.cos(a) * rad, y, np.sin(a) * rad], 1)
    c, r, n, (ch, cv) = np.array(p[0]), np.array(p[1]), p[2], p[3]
    if kind == 'clumps':
        u = nrmz(rng.normal(size=(n, 3)))
        lo = sp.get('clump_lo', 0.1)
        u[:, 1] = lo + (1 - lo) * np.abs(u[:, 1])
        ctr = c + nrmz(u) * rng.uniform(0.45, 1.0, (n, 1)) * r
    else:   # pads: layered flat foliage pads under a flat, wind-shorn top
        a, d = rng.uniform(0, 2 * math.pi, n), np.sqrt(rng.random(n)) * 0.85
        ctr = np.stack([c[0] + np.cos(a) * d * r[0], c[1] + r[1] * 0.5 * (1 - d * d) + rng.normal(0, 0.3, n) * r[1], c[2] + np.sin(a) * d * r[2]], 1)
        ctr[:, 1] += sp.get('shear', 0.0) * np.cos(a) * d * r[1]     # wind-shorn: the crown rises downwind
        ctr[:, 1] = np.minimum(ctr[:, 1], sp['H'] - cv * 1.1)
    k = rng.integers(0, n, M)
    sc = rng.uniform(0.7, 1.2, (n, 1))[k]
    q = nrmz(rng.normal(size=(M, 3))) * (rng.random(M) ** (1 / 3))[:, None] * np.array([ch, cv, ch]) * sc
    return ctr[k] + q


def colonize(P, par, elig, A, sp, rng):
    step = sp['step']
    di, dk = step * 5.5, step * 1.8
    cap = len(P) + 60000
    PP = np.zeros((cap, 3))
    PP[:len(P)] = P
    PAR = np.full(cap, -1)
    PAR[:len(P)] = par
    kids = np.zeros(cap, int)
    for q in par:
        if q >= 0:
            kids[q] += 1
    last = np.zeros((cap, 3))
    last[0] = (0, 1, 0)
    for i in range(1, len(P)):
        last[i] = nrmz(PP[i] - PP[PAR[i]])
    n = len(P)
    bd, bi = np.full(len(A), np.inf), np.zeros(len(A), int)

    def upd(ids):
        for s in range(0, len(A), 2048):
            D = ((A[s:s + 2048, None, :] - PP[ids][None]) ** 2).sum(-1)
            j = D.argmin(1)
            dm = np.sqrt(D[np.arange(len(j)), j])
            b = dm < bd[s:s + 2048]
            bd[s:s + 2048][b] = dm[b]
            bi[s:s + 2048][b] = ids[j[b]]

    upd(np.asarray(elig))
    trop = np.array([0, sp['trop'], 0])
    for it in range(300):
        alive = bd > dk
        A, bd, bi = A[alive], bd[alive], bi[alive]
        if len(A) == 0:
            break
        near = bd < di
        if not near.any():   # separated foliage clumps / pads: reach for the nearest unreached cluster
            near = bd < bd.min() + di
        t = bi[near]
        acc = np.zeros((n, 3))
        np.add.at(acc, t, nrmz(A[near] - PP[t]))
        g = np.unique(t)
        g = g[kids[g] < 4]
        if len(g) == 0 or n + len(g) > cap:
            break
        d = nrmz(nrmz(acc[g]) + last[g] * 0.25 + trop + rng.normal(0, 0.06, (len(g), 3)))
        k = len(g)
        PP[n:n + k], PAR[n:n + k], last[n:n + k] = PP[g] + d * step, g, d
        kids[g] += 1
        ids = np.arange(n, n + k)
        n += k
        upd(ids)
    return PP[:n], PAR[:n]


def grow_tree(sp, rng):
    H, hb_, step = sp['H'], sp['hb'], sp['step']
    P, par = [], []

    def add(p, q):
        P.append(np.asarray(p, np.float64))
        par.append(q)
        return len(P) - 1

    lv = (np.array(sp['leandir'], np.float64) if sp.get('leandir') else nrmz(rng.normal(size=2))) * sp['lean']
    ntr = max(2, int(round((hb_ + 0.3) / 0.45)))
    cur, wob = add([0, -0.3, 0], -1), np.zeros(2)
    for i in range(1, ntr + 1):
        t = i / ntr
        wob += rng.normal(0, 0.025, 2)
        cur = add([lv[0] * t ** 1.4 + wob[0], -0.3 + (hb_ + 0.3) * t, lv[1] * t ** 1.4 + wob[1]], cur)
    top = cur
    elig = [i for i in range(len(P)) if P[i][1] >= hb_ * 0.72]
    specs = [(rng.uniform(0, 6.3), sp.get('spine_el', math.pi / 2 - 0.08), sp['spine'] * (H - hb_))] if sp['spine'] else []
    for k in range(sp['leaders']):
        specs.append((2 * math.pi * k / sp['leaders'] + rng.uniform(-0.5, 0.5), rng.uniform(*sp['lel']), rng.uniform(*sp['llen'])))
    spine_nodes = []
    for si, (az, el, L) in enumerate(specs):
        d = np.array([math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)])
        c = top
        for s in range(max(2, int(L / step))):
            d = nrmz(d + rng.normal(0, sp['crook'], 3) * [1, 0.4, 1] + [0, sp['trop'] * 0.15, 0])
            c = add(P[c] + d * step, c)
            elig.append(c)
            if si == 0 and sp['spine']:
                spine_nodes.append(c)
    if sp.get('whorls'):
        _, y0, y1, r0 = sp['crown']
        for node in spine_nodes[::2]:
            y = P[node][1]
            R = r0 * max(0.0, (y1 - y) / (y1 - y0)) ** 0.95
            if R < 0.8:
                continue
            for k in range(3):
                az, c = rng.uniform(0, 2 * math.pi), node
                d = nrmz(np.array([math.cos(az), rng.uniform(-0.3, 0.1), math.sin(az)]))
                for q in range(max(1, int(R * rng.uniform(0.55, 0.9) / step))):
                    d = nrmz(d + rng.normal(0, 0.08, 3) + [0, -0.04, 0])
                    c = add(P[c] + d * step, c)
                    elig.append(c)
    A = env_points(sp, rng)
    A = A[A[:, 1] > (hb_ + 0.4 if hb_ > 0 else 0.15)]
    P, par = colonize(np.array(P), np.array(par), np.array(elig), A, sp, rng)
    return P, par, A.mean(0)


def radii(P, par, sp):
    n = len(P)
    cnt = np.zeros(n)
    for i in range(n - 1, -1, -1):
        if cnt[i] == 0:
            cnt[i] = 1
        if par[i] >= 0:
            cnt[par[i]] += cnt[i]
    r = sp['R0'] / cnt[0] ** (1 / 2.4) * cnt ** (1 / 2.4)
    kids = [[] for _ in range(n)]
    for i in range(1, n):
        kids[par[i]].append(i)
    single = np.array([len(k) == 1 for k in kids])
    single[0] = False
    child = np.array([k[0] if len(k) == 1 else i for i, k in enumerate(kids)])
    for _ in range(2):
        Q = P.copy()
        Q[single] = 0.5 * P[single] + 0.25 * (P[par[single]] + P[child[single]])
        P = Q
    return P, r, cnt, kids


def extract_chains(kids, r):
    out, stack = [], [(0, -1)]
    while stack:
        s, pj = stack.pop()
        ch, c = ([pj] if pj >= 0 else []) + [s], s
        while kids[c]:
            ks = sorted(kids[c], key=lambda q: -r[q])
            stack.extend((q, c) for q in ks[1:])
            c = ks[0]
            ch.append(c)
        out.append(ch)
    return out


# ---------------------------------------------------------------- meshes
class Acc:
    def __init__(s):
        s.P, s.N, s.UV, s.FL, s.LF, s.B, s.F, s.n = [], [], [], [], [], [], [], 0

    def add(s, P, N, UV, flut, leaf, F, bend=None):
        k = len(P)
        s.P.append(np.asarray(P, np.float64))
        s.N.append(np.asarray(N, np.float64))
        s.UV.append(np.asarray(UV, np.float64))
        s.FL.append(np.broadcast_to(np.asarray(flut, np.float64), (k,)).copy())
        s.LF.append(np.full(k, float(leaf)))
        s.B.append(np.full(k, np.nan) if bend is None else np.broadcast_to(np.asarray(bend, np.float64), (k,)).copy())
        s.F.append(np.asarray(F, np.int64).reshape(-1, 3) + s.n)
        s.n += k

    def extend(s, o):
        for i in range(len(o.P)):
            s.add(o.P[i], o.N[i], o.UV[i], o.FL[i], o.LF[i][0] if len(o.LF[i]) else 0, o.F[i] - (sum(len(x) for x in o.P[:i])), o.B[i])

    def finish(s, can, H, Rh):
        P, Nn, UV, FL, LF, B, F = (np.concatenate(x) for x in (s.P, s.N, s.UV, s.FL, s.LF, s.B, s.F))
        leaf = LF > 0.5
        if can.k is None:
            can.calibrate(P[leaf])
        ao = can.ao(P)
        Nn = nrmz(Nn)
        if leaf.any():
            Nn[leaf] = nrmz(Nn[leaf] * 0.35 + can.normal(P[leaf]) * 0.65)
        y = np.clip(P[:, 1] / H, 0, 1)
        d = np.clip(np.hypot(P[:, 0], P[:, 2]) / max(Rh, 0.5), 0, 1.2)
        B = np.where(np.isnan(B), np.clip(0.55 * y ** 1.5 + 0.45 * d ** 1.3, 0, 1), B)
        return dict(P=P, N=Nn, UV=UV, W=np.stack([B, np.clip(FL, 0, 1), ao, LF], 1), F=F)


class Canopy:
    """Leaf-density field (card area per m^3): canopy AO (optical depth toward the sky) and outward canopy normals."""

    def __init__(s, C, w, vox, center):
        s.vox, s.c0, s.k = vox, np.asarray(center, np.float64), None
        s.lo = C.min(0) - 5 * vox
        s.dims = np.ceil((C.max(0) + 5 * vox - s.lo) / vox).astype(int) + 1
        g = np.zeros(s.dims)
        i = ((C - s.lo) / vox).astype(int)
        np.add.at(g, (i[:, 0], i[:, 1], i[:, 2]), w)
        g /= vox ** 3
        for ax in range(3):
            for _ in range(2):
                g = (np.roll(g, 1, ax) + 2 * g + np.roll(g, -1, ax)) / 4
        s.g = g
        s.dirs, wt = [np.array([0, 1.0, 0])], [1.0]
        for el, w_ in ((0.75, 0.8), (0.22, 0.45)):
            for a in range(6):
                az = a * math.pi / 3 + el
                s.dirs.append(np.array([math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)]))
                wt.append(w_)
        s.w = np.array(wt) / sum(wt)

    def dens(s, P):
        i = np.floor((P - s.lo) / s.vox).astype(int)
        ok = np.all((i >= 0) & (i < s.dims), 1)
        i = np.clip(i, 0, s.dims - 1)
        return np.where(ok, s.g[i[:, 0], i[:, 1], i[:, 2]], 0.0)

    def tau(s, P):
        T = np.zeros((len(s.dirs), len(P)))
        for k, d in enumerate(s.dirs):
            for st in range(1, 22):
                T[k] += s.dens(P + d * (st * s.vox * 1.1))
        return T * s.vox * 1.1

    def calibrate(s, P, target=0.55):
        T = s.tau(P[::max(1, len(P) // 4000)])
        lo, hi = 1e-3, 30.0
        for _ in range(40):
            k = math.sqrt(lo * hi)
            if np.median((np.exp(-k * T) * s.w[:, None]).sum(0)) > target:
                lo = k
            else:
                hi = k
        s.k = k

    def ao(s, P):
        return 0.18 + 0.82 * (np.exp(-s.k * s.tau(P)) * s.w[:, None]).sum(0)

    def normal(s, P):
        h = s.vox
        G = np.stack([s.dens(P + [h, 0, 0]) - s.dens(P - [h, 0, 0]), s.dens(P + [0, h, 0]) - s.dens(P - [0, h, 0]),
                      s.dens(P + [0, 0, h]) - s.dens(P - [0, 0, h])], 1)
        return nrmz(nrmz(-G) * 0.55 + nrmz(P - s.c0) * 0.45 + [0, 0.15, 0])


def simplify(P, R, seglen, ang=0.2):
    keep, last = [0], 0
    for j in range(1, len(P) - 1):
        d = np.linalg.norm(P[j] - P[last])
        if d >= seglen or (d > seglen * 0.3 and np.dot(nrmz(P[j] - P[last]), nrmz(P[j + 1] - P[j])) < math.cos(ang)):
            keep.append(j)
            last = j
    keep.append(len(P) - 1)
    return P[keep], R[keep]


def sides_for(r0, lod):
    if lod == 2:
        return 5 if r0 >= 0.3 else 4 if r0 >= 0.12 else 3
    if lod == 0:
        return 16 if r0 >= 0.4 else 12 if r0 >= 0.2 else 8 if r0 >= 0.1 else 6 if r0 >= 0.05 else 5 if r0 >= 0.03 else 4
    return 8 if r0 >= 0.3 else 6 if r0 >= 0.12 else 4 if r0 >= 0.06 else 3


def ring_param(sides, rmax):
    circ = 2 * math.pi * max(rmax, 1e-3)
    k = int(np.clip(round(circ / 1.0), 1, 4))   # bark cell = 1 m of circumference -> sectors keep the bark at physical scale
    spk = max(1, math.ceil(sides / k))
    sides = spk * k
    th = np.array([2 * math.pi * (q * spk + a) / sides for q in range(k) for a in range(spk + 1)])
    uu = np.array([a / spk for q in range(k) for a in range(spk + 1)])
    quad = np.array([q * (spk + 1) + a for q in range(k) for a in range(spk)])
    return k, th, uu, quad, circ


def tube(acc, pts, rr, sides, rect, flare=0.0, bendfn=None):
    """Bark tube; the texture repeats every 2 m of (sector-scaled) length with a duplicate seam ring (atlas cells cannot wrap)."""
    k, th, uu, quad, circ = ring_param(sides, rr[0])
    Lrep = float(np.clip(2.0 * circ / k, 0.45, 2.0))
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    v = s / Lrep
    rec, ci = [(pts[0], rr[0], 0.0, True)], 0
    for j in range(1, len(pts)):
        while v[j] > ci + 1 + 1e-6:
            t = (ci + 1 - v[j - 1]) / (v[j] - v[j - 1])
            p, q = pts[j - 1] + (pts[j] - pts[j - 1]) * t, rr[j - 1] + (rr[j] - rr[j - 1]) * t
            rec += [(p, q, 1.0, False), (p, q, 0.0, True)]
            ci += 1
        rec.append((pts[j], rr[j], v[j] - ci, False))
    Pr = np.array([x[0] for x in rec])
    T = nrmz(np.gradient(Pr, axis=0))
    n1 = nrmz(np.cross(T[0], [0, 1.0, 0] if abs(T[0][1]) < 0.9 else [1.0, 0, 0]))
    Ps, Ns, UVs, fr = [], [], [], None
    nv = len(th)
    for i, (p, q, vl, new) in enumerate(rec):
        if not (i > 0 and new and np.allclose(Pr[i], Pr[i - 1])):
            n1 = nrmz(n1 - T[i] * np.dot(n1, T[i]))
            fr = (n1, np.cross(T[i], n1))
        d = np.cos(th)[:, None] * fr[0] + np.sin(th)[:, None] * fr[1]
        rad = np.full(nv, q)
        if flare > 0 and p[1] < 1.3:
            rad = rad * (1 + flare * (1 - max(p[1], 0) / 1.3) ** 2 * (0.55 + 0.45 * np.cos(5 * th + 0.7)))
        Ps.append(p + d * rad[:, None])
        Ns.append(d)
        UVs.append(np.stack([rect[0] + uu * (rect[2] - rect[0]), np.full(nv, rect[1] + vl * (rect[3] - rect[1]))], 1))
    F = []
    for i in range(len(rec) - 1):
        if rec[i + 1][3]:
            continue
        a0, b0 = i * nv + quad, (i + 1) * nv + quad
        F += [np.stack([a0, a0 + 1, b0 + 1], 1), np.stack([a0, b0 + 1, b0], 1)]
    if not F:
        return 0
    P = np.concatenate(Ps)
    acc.add(P, np.concatenate(Ns), np.concatenate(UVs), 0.0, 0.0, np.concatenate(F), None if bendfn is None else bendfn(P))
    return sum(len(f) for f in F)


def lathe(acc, c, hs, rs, sides, rect, bend=0.5):
    k, th, uu, quad, _ = ring_param(sides, max(rs))
    nv, Ps, Ns, UVs = len(th), [], [], []
    for j, (h, r) in enumerate(zip(hs, rs)):
        d = np.stack([np.cos(th), np.zeros(nv), -np.sin(th)], 1)
        j0, j1 = max(j - 1, 0), min(j + 1, len(hs) - 1)
        dr = (rs[j1] - rs[j0]) / max(1e-3, hs[j1] - hs[j0])
        Ps.append(c + d * r + [0, h, 0])
        Ns.append(nrmz(d + [0, -dr, 0]))
        UVs.append(np.stack([rect[0] + uu * (rect[2] - rect[0]), np.full(nv, rect[1] + j / (len(hs) - 1) * (rect[3] - rect[1]))], 1))
    F = []
    for i in range(len(hs) - 1):
        a0, b0 = i * nv + quad, (i + 1) * nv + quad
        F += [np.stack([a0, a0 + 1, b0 + 1], 1), np.stack([a0, b0 + 1, b0], 1)]
    acc.add(np.concatenate(Ps), np.concatenate(Ns), np.concatenate(UVs), 0.0, 0.0, np.concatenate(F), bend)


def bark_tubes(acc, P, r, kids, sp, rect, lod, budget):
    chains = extract_chains(kids, r)
    rmin = sp.get('rmin', 0.012) if lod == 0 else 0.05 if lod == 1 else 0.12
    for _ in range(45):
        a, tris = Acc(), 0
        for ci, ch in enumerate(chains):
            rr = r[ch].astype(np.float64)
            if ci and len(ch) > 1:
                rr[0] = rr[1]
            below = np.nonzero(rr < rmin)[0]
            m = below[0] if len(below) else len(ch)
            if m < 2:
                continue
            seg = float(np.clip(rr[0] * (6, 12, 20)[lod], (0.3, 0.7, 1.2)[lod], (1.0, 2.5, 4.0)[lod]))
            pts, q = simplify(P[ch[:m]], rr[:m].copy(), seg)
            if len(pts) < 2:
                continue
            q[-1] *= 0.6
            tris += tube(a, pts, q, sides_for(q[0], lod), rect, sp['flare'] if ci == 0 else 0.0)
        if tris <= budget or budget <= 0:
            break
        rmin *= 1.15
    if budget > 0:
        acc.extend(a)
    return rmin


def make_cards(sp, P, par, cnt, C, S, nvar, rng):
    cand = np.nonzero((cnt <= 3) & (P[:, 1] > sp['hb'] * 0.9 + 0.2))[0]
    n = sp['cards']
    idx = rng.choice(cand, n)
    g = nrmz(P[idx] - P[np.maximum(par[idx], 0)])
    base = P[idx] + rng.normal(0, 0.15 * S, (n, 3))
    o = nrmz(base - C)
    nn = nrmz(nrmz(rng.normal(size=(n, 3))) * 0.6 + o * 0.7 + np.array([0, sp['up'], 0]))
    if sp.get('vcard'):
        nn[:, 1] *= 1 - sp['vcard']
        nn = nrmz(nn)
    nn[(nn * o).sum(1) < -0.1] *= -1
    v = g - nn * (g * nn).sum(1, keepdims=True)
    weak = np.linalg.norm(v, axis=1) < 0.2
    v[weak] = np.array([0, 1.0, 0]) - nn[weak] * nn[weak, 1:2] + np.array([1e-3, 0, 0])
    v = nrmz(v)
    a = rng.uniform(-0.45, 0.45, n)[:, None]
    v = nrmz(v * np.cos(a) + np.cross(nn, v) * np.sin(a))
    size = S * rng.uniform(0.82, 1.18, n)
    return dict(base=base - v * (0.1 * size)[:, None], v=v, n=nn, size=size, cell=rng.integers(0, nvar, n))


def cluster_cards(cd, K, S, mx=2.6):
    ctr = cd['base'] + cd['v'] * cd['size'][:, None] / 2
    vox = S
    for _ in range(60):
        _, first, inv, cnt = np.unique(np.floor(ctr / vox).astype(np.int64), axis=0, return_index=True, return_inverse=True, return_counts=True)
        if len(cnt) <= K:
            break
        vox *= 1.1
    inv, m = inv.ravel(), len(cnt)

    def mean(a):
        o = np.zeros((m, a.shape[1]))
        np.add.at(o, inv, a)
        return o / cnt[:, None]

    c, nn = mean(ctr), nrmz(mean(cd['n']))
    v = mean(cd['v'])
    v = nrmz(v - nn * (v * nn).sum(1, keepdims=True) + 1e-4)
    size = S * np.clip(np.sqrt(cnt) * 0.85, 1.0, mx)
    return dict(base=c - v * size[:, None] / 2, v=v, n=nn, size=size, cell=cd['cell'][first])


def card_mesh(acc, cd, rects, bend=None):
    b, v, nn, s = cd['base'], cd['v'], cd['n'], cd['size']
    u = nrmz(np.cross(v, nn))
    n = len(b)
    hs = (s / 2)[:, None]
    p0, p1 = b - u * hs, b + u * hs
    P = np.stack([p0, p1, p1 + v * s[:, None], p0 + v * s[:, None]], 1).reshape(-1, 3)
    R = np.asarray(rects)[cd['cell']]
    UV = np.stack([R[:, [0, 1]], R[:, [2, 1]], R[:, [2, 3]], R[:, [0, 3]]], 1).reshape(-1, 2)
    fl = (np.array([0.25, 0.25, 1.0, 1.0])[None] * np.random.default_rng(n).uniform(0.6, 1.0, (n, 1))).ravel()
    F = ((np.arange(n) * 4)[:, None, None] + np.array([[0, 1, 2], [0, 2, 3]])[None]).reshape(-1, 3)
    acc.add(P, np.repeat(nn, 4, 0), UV, fl, 1.0, F, bend)


def make_broad(sp, lay):
    rng = np.random.default_rng(sp['seed'])
    P, par, C = grow_tree(sp, rng)
    P, r, cnt, kids = radii(P, par, sp)
    S = LEAF_CFG[sp['leaf']]['S'] * sp.get('cs', 1.0)
    nvar = VARS.get(sp['leaf'], 2)
    rects = [rect_of(lay, 'lf_%s_%d' % (sp['leaf'], v)) for v in range(nvar)]
    cards = make_cards(sp, P, par, cnt, C, S, nvar, rng)
    ctr = cards['base'] + cards['v'] * cards['size'][:, None] / 2
    can = Canopy(ctr, cards['size'] ** 2 * 0.5, max(0.3, sp['H'] / 45), C)
    Rh = float(np.percentile(np.hypot(ctr[:, 0], ctr[:, 2]), 95))
    out = {}
    for lod in (0, 1, 2):
        acc = Acc()
        bark_tubes(acc, P, r, kids, sp, rect_of(lay, 'bark_' + sp['bark']), lod, (sp['bark_tris'], sp['bark1'], sp['bark2'])[lod])
        card_mesh(acc, (cards, cluster_cards(cards, sp['k1'], S), cluster_cards(cards, sp['k2'], S, 3.6))[lod], rects)
        out[lod] = acc.finish(can, sp['H'], Rh)
    return out[0], out[1], out[2]


def frond_point(base, az, el, L, age, s):
    h, y = math.cos(el) * L * s, math.sin(el) * L * s - (0.1 + 0.3 * age) * L * s * s
    return base + np.array([math.cos(az) * h, y, math.sin(az) * h])


def frond_mesh(acc, fr, segs, rects):
    az, el, L, base, age, cell, fold, tw = fr
    s_ = np.linspace(0, 1, segs + 1)
    C = np.array([frond_point(base, az, el, L, age, s) for s in s_])
    T = nrmz(np.gradient(C, axis=0))
    side = nrmz(np.cross(T, [0, 1.0, 0]))
    up = np.cross(side, T)
    ct, st = np.cos(tw * s_)[:, None], np.sin(tw * s_)[:, None]
    side, up = side * ct + up * st, up * ct - side * st
    fa = (fold * (1 - 0.4 * s_))[:, None]
    Lp, Rp = C - side * 0.7 * np.cos(fa) + up * 0.7 * np.sin(fa), C + side * 0.7 * np.cos(fa) + up * 0.7 * np.sin(fa)
    rc = rects[cell]
    u = rc[0] + s_ * (rc[2] - rc[0])
    UV = np.stack([np.stack([u, np.full_like(u, v)], 1) for v in (rc[1], (rc[1] + rc[3]) / 2, rc[3])], 1).reshape(-1, 2)
    F = []
    for i in range(segs):
        a, b = 3 * i, 3 * i + 3
        F += [(a, a + 1, b + 1), (a, b + 1, b), (a + 1, a + 2, b + 2), (a + 1, b + 2, b + 1)]
    acc.add(np.stack([Lp, C, Rp], 1).reshape(-1, 3), np.repeat(up, 3, 0), UV, np.clip(np.repeat(0.3 + 0.7 * s_, 3) + np.tile([0.15, 0, 0.15], segs + 1), 0, 1),
            1.0, np.array(F), np.repeat(0.45 + 0.55 * s_, 3))


def grid_card(acc, base, v, n, Sw, Sh, rect, cup, fl0, b0, rows=(0, 0.4, 0.7, 1.0), cols=(0, 0.5, 1)):
    u = nrmz(np.cross(v, n))
    P, UV, FL, B = [], [], [], []
    for rv in rows:
        for cu in cols:
            lift = cup * Sh * max(0.0, (rv - 0.35) / 0.65) * abs(cu - 0.5) * 2
            P.append(base + u * (cu - 0.5) * Sw + v * rv * Sh + n * lift)
            UV.append((rect[0] + cu * (rect[2] - rect[0]), rect[1] + rv * (rect[3] - rect[1])))
            FL.append(fl0 + (1 - fl0) * rv)
            B.append(b0 + (1 - b0) * rv * 0.6)
    nc, F = len(cols), []
    for i in range(len(rows) - 1):
        for j in range(nc - 1):
            a = i * nc + j
            F += [(a, a + 1, a + nc + 1), (a, a + nc + 1, a + nc)]
    acc.add(np.array(P), np.repeat(n[None], len(P), 0), np.array(UV), np.array(FL), 1.0, np.array(F), np.array(B))


def make_canary(sp, lay):
    rng = np.random.default_rng(sp['seed'])
    Ht, R0 = sp['trunk'], sp['R0']
    b = rng.normal(0, 1, 2) * 0.5
    ts = np.linspace(0, 1, 14)
    trunk = np.stack([b[0] * np.sin(ts * 1.6) * ts, -0.3 + (Ht + 0.3) * ts, b[1] * ts ** 2], 1)
    trr = R0 * (1 + 0.28 * np.exp(-(trunk[:, 1] + 0.3) / 0.5)) * (1 - 0.06 * ts)
    T = trunk[-1]
    kh = np.linspace(-0.35, 1.55, 9)
    kr = R0 * 1.05 + 0.72 * np.sin(np.pi * np.clip((kh + 0.35) / 1.9, 0, 1)) ** 0.85
    rects = [rect_of(lay, 'frond_a'), rect_of(lay, 'frond_b')]
    fronds, nf = [], sp['fronds']
    for f in range(nf):
        age = (f + rng.random()) / nf
        az = f * 2.39996 + rng.normal(0, 0.12)
        hf = 1.35 - 1.2 * age
        rf = np.interp(hf, kh, kr) * 0.85
        fronds.append((az, 1.05 - 1.6 * age + rng.normal(0, 0.08), sp['fl'] * rng.uniform(0.88, 1.06) * (0.72 if age < 0.07 else 1),
                       T + np.array([math.cos(az) * rf, hf, math.sin(az) * rf]), age, int((age > 0.55 and rng.random() < 0.6) or rng.random() < 0.15),
                       rng.uniform(0.3, 0.55), rng.normal(0, 0.25)))
    pts = np.array([frond_point(fr[3], fr[0], fr[1], fr[2], fr[4], s) for fr in fronds for s in np.linspace(0.1, 1, 6)])
    cc = T + np.array([0, 1.0, 0])
    can = Canopy(pts, np.full(len(pts), 0.8), 0.5, cc)
    H = float(pts[:, 1].max() + 0.5)
    Rh = float(np.hypot(pts[:, 0], pts[:, 2]).max())
    out = {}
    for lod in (0, 1, 2):
        acc = Acc()
        tube(acc, trunk if lod < 2 else trunk[[0, 4, 8, 13]], trr if lod < 2 else trr[[0, 4, 8, 13]], (12, 6, 5)[lod], rect_of(lay, 'bark_canary'), 0.15 if lod == 0 else 0.0,
             bendfn=lambda P: 0.5 * np.clip(P[:, 1] / Ht, 0, 1) ** 2)
        lathe(acc, T, (kh, kh[::2], kh[::4])[lod], (kr, kr[::2], kr[::4])[lod], (14, 7, 5)[lod], rect_of(lay, 'knob'))
        for i, fr in enumerate(fronds):
            if lod == 0 or (lod == 1 and i % 5 in (0, 2, 4)) or (lod == 2 and i % 3 == 0):
                frond_mesh(acc, fr, (9, 3, 2)[lod], rects)
        out[lod] = acc.finish(can, H, Rh)
    return out[0], out[1], out[2]


def make_fan(sp, lay):
    rng = np.random.default_rng(sp['seed'])
    Ht, R0 = sp['trunk'], sp['R0']
    lean = rng.normal(0, 1, 2) * 0.35
    ts = np.linspace(0, 1, 16)
    trunk = np.stack([lean[0] * ts ** 1.5, -0.3 + (Ht + 0.3) * ts, lean[1] * ts ** 1.5], 1)
    trr = R0 * (1 + 0.95 * np.exp(-(trunk[:, 1] + 0.3) / 0.9))
    T = trunk[-1]
    cut = int(np.searchsorted(trunk[:, 1], Ht - 1.6))
    fans = []
    for f in range(sp['fans']):
        age = (f + rng.random()) / sp['fans']
        az, el = f * 2.39996 + rng.normal(0, 0.1), 1.3 - 1.55 * age + rng.normal(0, 0.08)
        d = np.array([math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)])
        n = nrmz(np.array([0, 1.0, 0]) - d * d[1] + rng.normal(0, 0.25, 3))
        fans.append((d, n, rng.uniform(0.9, 1.1)))
    skirt = []
    for ring in range(2):
        for i in range(14):
            az = (i + 0.5 * ring) / 14 * 2 * math.pi + rng.normal(0, 0.1)
            o = np.array([math.cos(az), 0, math.sin(az)])
            top = T + o * (0.28 + 0.1 * ring) + [0, -0.35 - 0.9 * ring, 0]
            v = nrmz(np.array([0, 1.0, 0]) - o * 0.22)
            skirt.append((top, v, nrmz(o + [0, 0.15, 0])))
    pts = np.array([T + d * 1.4 * s for d, n, s in fans] + [t - v * 1.2 for t, v, o in skirt])
    can = Canopy(pts, np.full(len(pts), 2.0), 0.45, T)
    H = float(max(pts[:, 1].max(), T[1]) + 1.2)
    out = {}
    for lod in (0, 1, 2):
        acc = Acc()
        bf = (lambda P: 0.5 * np.clip(P[:, 1] / Ht, 0, 1) ** 2)
        tube(acc, trunk[:cut + 1], trr[:cut + 1], (8, 5, 4)[lod], rect_of(lay, 'bark_fan'), 0.25 if lod == 0 else 0.0, bendfn=bf)
        tube(acc, trunk[cut:], trr[cut:] * 1.08, (8, 5, 4)[lod], rect_of(lay, 'fantop'), 0.0, bendfn=bf)
        for i, (d, n, s) in enumerate(fans):
            if lod == 0 or (lod == 1 and i % 3 != 1) or (lod == 2 and i % 2 == 0):
                grid_card(acc, T + d * 0.2, d, n, 2.5 * s, 2.5 * s, rect_of(lay, 'fan'), 0.18, 0.15, 0.5,
                          *(((0, 0.4, 0.7, 1.0), (0, 0.5, 1)) if lod == 0 else ((0, 1.0), (0, 1))))
        for i, (top, v, o) in enumerate(skirt):
            if lod == 0 or (lod == 1 and i % 3 == 0) or (lod == 2 and i % 5 == 0):
                grid_card(acc, top - v * 2.4, v, o, 1.1, 2.4, rect_of(lay, 'fandead'), 0.08, 0.1, 0.35,
                          *(((0, 0.5, 1.0), (0, 0.5, 1)) if lod == 0 else ((0, 1.0), (0, 1))))
        out[lod] = acc.finish(can, H, 2.0)
    return out[0], out[1], out[2]


def make_tuft(sp, lay):
    """Pampas grass: arching blade-bundle ribbons around the crown + crossed plume cards on tall stalks."""
    rng = np.random.default_rng(sp['seed'])
    rb, rp = rect_of(lay, 'lf_pampas_0'), rect_of(lay, 'lf_pampas_1')
    blades = []
    for i in range(sp['blades']):
        az = rng.uniform(0, 2 * math.pi)
        el = rng.uniform(0.75, 1.35)
        L = rng.uniform(1.4, 2.2) * (1.0 if el < 1.2 else 0.85)
        base = np.array([math.cos(az) * 0.18, 0.0, math.sin(az) * 0.18]) * rng.uniform(0.3, 1.0)
        blades.append((az, el, L, base, rng.uniform(0.25, 0.4), rng.uniform(0.6, 1.0)))
    plumes = []
    for i in range(sp['plumes']):
        az = rng.uniform(0, 2 * math.pi)
        tilt = rng.uniform(0.0, 0.22)
        v = nrmz(np.array([math.cos(az) * math.sin(tilt), math.cos(tilt), math.sin(az) * math.sin(tilt)]))
        plumes.append((np.array([math.cos(az) * 0.12, -0.05, math.sin(az) * 0.12]), v, rng.uniform(2.3, 3.2), rng.uniform(0, math.pi)))
    pts = np.array([b[3] + np.array([math.cos(b[0]) * math.cos(b[1]), math.sin(b[1]) * 0.8, math.sin(b[0]) * math.cos(b[1])]) * b[2] * s
                    for b in blades for s in (0.4, 0.8)] + [pl[0] + pl[1] * pl[2] * s for pl in plumes for s in (0.6, 0.9)])
    can = Canopy(pts, np.full(len(pts), 0.6), 0.3, np.array([0, 1.0, 0]))
    H = float(max(pl[0][1] + pl[1][1] * pl[2] for pl in plumes)) + 0.05
    out = {}
    for lod in (0, 1, 2):
        acc = Acc()
        segs = (6, 3, 2)[lod]
        for i, (az, el, L, base, w, dr) in enumerate(blades):
            if (lod == 1 and i % 2) or (lod == 2 and i % 4):
                continue
            ww = w * (1.0, 1.35, 1.9)[lod]
            s_ = np.linspace(0, 1, segs + 1)
            h = np.cos(el) * L * s_ + 0.05
            y = np.sin(el) * L * s_ - dr * 0.45 * L * s_ * s_
            C = base + np.stack([math.cos(az) * h, y, math.sin(az) * h], 1)
            T = nrmz(np.gradient(C, axis=0))
            side = nrmz(np.cross(T, [0, 1.0, 0]) + 1e-6)
            up = np.cross(side, T)
            P = np.concatenate([C - side * ww / 2, C + side * ww / 2])
            UV = np.concatenate([np.stack([np.full(segs + 1, rb[0]), rb[1] + s_ * (rb[3] - rb[1])], 1),
                                 np.stack([np.full(segs + 1, rb[2]), rb[1] + s_ * (rb[3] - rb[1])], 1)])
            k = segs + 1
            F = [(j, j + 1, k + j + 1) for j in range(segs)] + [(j, k + j + 1, k + j) for j in range(segs)]
            acc.add(P, np.concatenate([up, up]), UV, np.concatenate([s_, s_]), 1.0, np.array(F), np.concatenate([s_ * 0.6, s_ * 0.6]))
        for i, (b, v, Hp, a) in enumerate(plumes):
            if lod == 2 and i % 2:
                continue
            for q in ((0, math.pi / 2) if lod < 2 else (0,)):
                n = nrmz(np.cross(v, [math.cos(a + q), 0, math.sin(a + q)]))
                grid_card(acc, b, v, n, 0.55, Hp, rp, 0.0, 0.2, 0.2, *(((0, 0.5, 0.75, 1.0), (0, 0.5, 1)) if lod == 0 else ((0, 1.0), (0, 1))))
        out[lod] = acc.finish(can, H, 1.2)
    return out[0], out[1], out[2]


def write_glb(path, name, L):
    P = np.ascontiguousarray(L['P'], '<f4')
    Nn = np.ascontiguousarray(nrmz(L['N']), '<f4')
    UV = np.ascontiguousarray(np.round(np.clip(L['UV'], 0, 1) * 65535), '<u2')
    W = np.ascontiguousarray(np.round(np.clip(L['W'], 0, 1) * 255), 'u1')
    big = len(P) > 65535
    I = np.ascontiguousarray(L['F'].ravel(), '<u4' if big else '<u2')
    blob, views, accs = bytearray(), [], []

    def put(arr, target, comp, typ, count, norm=False, mm=None):
        b = arr.tobytes()
        views.append(dict(buffer=0, byteOffset=len(blob), byteLength=len(b), target=target))
        blob.extend(b)
        blob.extend(b'\0' * ((-len(b)) % 4))
        a = dict(bufferView=len(views) - 1, componentType=comp, count=count, type=typ)
        if norm:
            a['normalized'] = True
        if mm is not None:
            a['min'], a['max'] = mm
        accs.append(a)
        return len(accs) - 1

    attrs = dict(POSITION=put(P, 34962, 5126, 'VEC3', len(P), mm=(P.min(0).tolist(), P.max(0).tolist())),
                 NORMAL=put(Nn, 34962, 5126, 'VEC3', len(P)), TEXCOORD_0=put(UV, 34962, 5123, 'VEC2', len(P), True),
                 _WIND=put(W, 34962, 5121, 'VEC4', len(P), True))
    ind = put(I, 34963, 5125 if big else 5123, 'SCALAR', len(I))
    js = dict(asset=dict(version='2.0', generator='HILLBOMB tools/blender/trees.py', extras=dict(
        note='TEXCOORD_0 in GL convention (v up) into public/assets/trees/leaves_*.webp; _WIND = (bend, flutter, ao, leaf)')),
        scene=0, scenes=[dict(nodes=[0])], nodes=[dict(mesh=0, name=name)],
        meshes=[dict(name=name, primitives=[dict(attributes=attrs, indices=ind, material=0)])],
        materials=[dict(name='tree_atlas', doubleSided=True, alphaMode='MASK', alphaCutoff=0.5)],
        buffers=[dict(byteLength=len(blob))], bufferViews=views, accessors=accs)
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((-len(jb)) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(blob)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A))
        f.write(jb)
        f.write(struct.pack('<II', len(blob), 0x004E4942))
        f.write(bytes(blob))


def stage_trees(lay):
    for sp in SPECIES:
        if ONLY and sp['id'] not in ONLY:
            continue
        t = time.time()
        Ls = {'broad': make_broad, 'palm': make_canary, 'fan': make_fan, 'tuft': make_tuft}[sp['kind']](sp, lay)
        L0 = Ls[0]
        for lod, L in enumerate(Ls):
            write_glb(os.path.join(OUT, '%s_lod%d.glb' % (sp['id'], lod)), '%s_lod%d' % (sp['id'], lod), L)
        np.savez_compressed(os.path.join(CACHE, 'lod0_%s.npz' % sp['id']), **L0)
        P = L0['P']
        cy = float((P[:, 1].min() + P[:, 1].max()) / 2)
        meta = dict(kind=sp['kind'], cls=sp['cls'], H=round(float(P[:, 1].max()), 2), collider=sp['collider'],
                    crownR=round(float(np.percentile(np.hypot(P[:, 0], P[:, 2]), 98)), 2),
                    tris=[len(L['F']) for L in Ls], cy=round(cy, 3), R=round(float(np.linalg.norm(P - [0, cy, 0], axis=1).max() * 1.01), 3))
        json.dump(meta, open(os.path.join(CACHE, 'meta_%s.json' % sp['id']), 'w'))
        log('%-9s tris %5d / %4d / %4d  H %.1f  R %.1f  %.1fs' % (sp['id'], *meta['tris'], meta['H'], meta['R'], time.time() - t))


# ---------------------------------------------------------------- stage: impostors
def frame_dir(i, j):
    ox, oy = i / (NF - 1) * 2 - 1, j / (NF - 1) * 2 - 1
    px, pz = (ox + oy) / 2, (ox - oy) / 2
    return nrmz(np.array([px, max(0.0, 1 - abs(px) - abs(pz)), pz]))


def frame_basis(D):
    up = np.array([0, 0, -1.0]) if abs(D[1]) > 0.999 else np.array([0, 1.0, 0])
    r = nrmz(np.cross(up, D))
    return r, np.cross(D, r)


def load_tree(sc, sid, name='tree', link=False, extra=None):
    d = np.load(os.path.join(CACHE, 'lod0_%s.npz' % sid))
    P, W = d['P'], d['W']
    pa = {'ao': W[:, 2], 'nrm': conv(d['N']), 'leaf': W[:, 3]}
    return mk_obj(sc, name, conv(P), d['F'], uv=d['UV'], pattrs=pa, link=link), P


def stage_imp(lay):
    atlas_png = os.path.join(CACHE, 'leaves_albedo_straight.png')
    for sp in SPECIES:
        sid = sp['id']
        if ONLY and sid not in ONLY:
            continue
        meta = json.load(open(os.path.join(CACHE, 'meta_%s.json' % sid)))
        R, C = meta['R'], np.array([0, meta['cy'], 0])
        reset()
        sc = scene_setup(IMP, IMP, 40, 'Standard')
        set_world(sc, (0, 0, 0), 0.0)
        img = bpy.data.images.load(atlas_png)
        ma, nt = new_mat('IM_ALB')
        tex = atex(nt, img)
        emit_out(nt, scale_by(nt, tex.outputs['Color'], N(nt, 'ShaderNodeAttribute', attribute_name='ao').outputs['Fac']), tex.outputs['Alpha'])
        mn, nt2 = new_mat('IM_NRM')
        tex2 = atex(nt2, img)
        vt = N(nt2, 'ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='OBJECT', convert_to='WORLD')
        nt2.links.new(N(nt2, 'ShaderNodeAttribute', attribute_name='nrm').outputs['Vector'], vt.inputs[0])
        nm = N(nt2, 'ShaderNodeVectorMath', operation='NORMALIZE')
        nt2.links.new(vt.outputs[0], nm.inputs[0])
        emit_out(nt2, normal_color(nt2, nm.outputs[0]), tex2.outputs['Alpha'])
        (ob, me), P = load_tree(sc, sid)
        me.materials.append(ma)
        for i in range(NF):
            for j in range(NF):
                D = frame_dir(i, j)
                r, u = frame_basis(D)
                M = Matrix((tuple(conv(r)), tuple(conv(u)), tuple(conv(D)))).to_4x4()
                o = bpy.data.objects.new('f%d_%d' % (i, j), me)
                sc.collection.objects.link(o)
                o.matrix_world = Matrix.Translation(((i + 0.5 - NF / 2) * 2 * R, (j + 0.5 - NF / 2) * 2 * R, 0)) @ M @ Matrix.Translation(tuple(-conv(C)))
        ortho_cam(sc, 0, 0, NF * 2 * R, z=4 * R + 10)
        ta = hb.render_to(os.path.join(CACHE, 'imp_%s_a.png' % sid))
        me.materials[0] = mn
        sc.view_settings.view_transform = 'Raw'
        sc.cycles.samples = 24
        tn = hb.render_to(os.path.join(CACHE, 'imp_%s_n.png' % sid))
        log('impostor %-9s %.0fs + %.0fs' % (sid, ta, tn))


# ---------------------------------------------------------------- stage: pack
def stage_pack(lay):
    cols, rows = 6, 5
    A = np.zeros((rows * IMP, cols * IMP, 4), np.float32)
    Nn = np.full((rows * IMP, cols * IMP, 3), 0.5, np.float32)
    man = dict(version=1, generator='tools/blender/trees.py', uv='gl',
               atlas=dict(albedo='leaves_albedo.webp', normal='leaves_normal.webp', size=AT, premultiplied='linear'),
               impostor=dict(albedo='impostors_albedo.webp', normal='impostors_normal.webp', frames=NF, cols=cols, rows=rows, slot=IMP,
                             mapping='hemi-octahedral, frame (i,j) at uv ((i+fu)/N, (j+fv)/N), GL v-up; normals in frame space (right, up, view)'),
               species={})
    for s, sp in enumerate(SPECIES):
        sid = sp['id']
        pa, pn = img_read(os.path.join(CACHE, 'imp_%s_a.png' % sid)), img_read(os.path.join(CACHE, 'imp_%s_n.png' % sid))
        a = pa[..., 3]
        rgb, nrm = pushpull(pa[..., :3], a), pushpull(pn[..., :3], a)
        r0, c0 = (rows - 1 - s // cols) * IMP, (s % cols) * IMP
        A[r0:r0 + IMP, c0:c0 + IMP] = np.dstack([lin2srgb(srgb2lin(rgb) * a[..., None]), a])
        Nn[r0:r0 + IMP, c0:c0 + IMP] = nrm
        meta = json.load(open(os.path.join(CACHE, 'meta_%s.json' % sid)))
        man['species'][sid] = dict(meta, slot=s, lod0='%s_lod0.glb' % sid, lod1='%s_lod1.glb' % sid, lod2='%s_lod2.glb' % sid)
    img_write(os.path.join(OUT, 'impostors_albedo.webp'), A, 'WEBP', 90)
    img_write(os.path.join(OUT, 'impostors_normal.webp'), half(Nn), 'WEBP', 90)
    json.dump(man, open(os.path.join(OUT, 'trees.json'), 'w'), indent=1)
    img_write(os.path.join(ROOT, 'shots', 'trees_impostors.jpg'), A[::4, ::4, :3] + 0.45 * (1 - A[::4, ::4, 3:4]), 'JPEG', 85)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    log('packed; public/assets/trees = %.1f MB' % (tot / 1e6))


# ---------------------------------------------------------------- stage: contact sheet
def stage_sheet(lay):
    reset()
    sc = scene_setup(2600, 1500, 96, 'AgX', denoise=True)
    sc.render.film_transparent = False
    set_world(sc, (0.62, 0.72, 0.86), 0.9)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy, sun.data.angle = 4.5, 0.05
    sun.rotation_euler = (0.85, 0.0, -0.7)
    sc.collection.objects.link(sun)
    img = bpy.data.images.load(os.path.join(CACHE, 'leaves_albedo_straight.png'))
    m, nt = new_mat('LIT')
    tex = atex(nt, img)
    col = scale_by(nt, tex.outputs['Color'], N(nt, 'ShaderNodeAttribute', attribute_name='ao').outputs['Fac'])
    bs, tl = N(nt, 'ShaderNodeBsdfPrincipled', Roughness=0.65), N(nt, 'ShaderNodeBsdfTranslucent')
    nt.links.new(col, bs.inputs['Base Color'])
    nt.links.new(col, tl.inputs['Color'])
    f = N(nt, 'ShaderNodeMath', operation='MULTIPLY')
    f.inputs[1].default_value = 0.35
    nt.links.new(N(nt, 'ShaderNodeAttribute', attribute_name='leaf').outputs['Fac'], f.inputs[0])
    m1 = N(nt, 'ShaderNodeMixShader')
    nt.links.new(f.outputs[0], m1.inputs[0])
    nt.links.new(bs.outputs[0], m1.inputs[1])
    nt.links.new(tl.outputs[0], m1.inputs[2])
    gt = N(nt, 'ShaderNodeMath', operation='GREATER_THAN')
    gt.inputs[1].default_value = 0.5
    nt.links.new(tex.outputs['Alpha'], gt.inputs[0])
    m2, tp, out = N(nt, 'ShaderNodeMixShader'), N(nt, 'ShaderNodeBsdfTransparent'), N(nt, 'ShaderNodeOutputMaterial')
    nt.links.new(gt.outputs[0], m2.inputs[0])
    nt.links.new(tp.outputs[0], m2.inputs[1])
    nt.links.new(m1.outputs[0], m2.inputs[2])
    nt.links.new(m2.outputs[0], out.inputs['Surface'])
    rowsl = [['euc', 'euc2', 'pine', 'pine2', 'cypress', 'cypress2', 'fanpalm', 'fanpalm2'], ['plane', 'plane2', 'oak', 'oak2', 'brisbox', 'canary', 'canary2'],
             ['ficus', 'ficus2', 'cherry', 'plum', 'scrub', 'vbox', 'ginkgo'], ['redwood', 'redwood2', 'cypress3', 'pampas']]
    for ri, row in enumerate(rowsl):
        x = 0.0
        for sid in row:
            if not os.path.exists(os.path.join(CACHE, 'lod0_%s.npz' % sid)):
                continue
            (ob, me), P = load_tree(sc, sid, sid, link=True)
            me.materials.append(m)
            k = 10.0 / max(P[:, 1].max(), 1.0)
            w = (P[:, 0].max() - P[:, 0].min()) * k
            ob.scale = (k, k, k)
            ob.location = (x - P[:, 0].min() * k, 0, -ri * 12.5)
            x += w + 1.0
        for o in [o for o in sc.collection.objects if o.type == 'MESH' and abs(o.location.z + ri * 12.5) < 1e-3]:
            o.location.x -= x / 2
    ortho_cam(sc, 0, -200, 92, z=0, rot=(math.pi / 2, 0, 0))
    sc.camera.location = (0, -200, -14.5)
    p = os.path.join(CACHE, 'sheet.png')
    log('sheet %.0fs' % hb.render_to(p))
    img_write(os.path.join(ROOT, 'shots', 'trees_sheet.jpg'), img_read(p)[..., :3], 'JPEG', 88)


if __name__ == '__main__':
    LAY = pack_layout()
    json.dump(LAY, open(os.path.join(CACHE, 'layout.json'), 'w'))
    for st, fn in (('atlas', stage_atlas), ('trees', stage_trees), ('imp', stage_imp), ('pack', stage_pack), ('sheet', stage_sheet)):
        if st in STAGES:
            log('--- stage', st)
            fn(LAY)
    log('done')
