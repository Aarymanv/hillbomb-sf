"""Offline GPU texture packer: JPG/PNG/WebP -> DDS (BC1/DXT1 or BC3/DXT5) with a full mip chain, pre-flipped for WebGL.

Why: the game kept ~2.7 GB of uncompressed RGBA8 textures resident (4 B/px + mips). BC1 = 0.5 B/px (8x), BC3 = 1 B/px (4x).
Runtime: src/world/texpack.js loads <name>.dds next to the original when WEBGL_compressed_texture_s3tc(_srgb) exists,
else the original image. Normal maps stay RGBA8 (BC1 normals shimmer in speculars).

usage: python tools/texpack.py [--force] [--only substr]   (writes public/assets/**/<name>.dds + public/assets/texpack.json)
"""
import glob, json, os, struct, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
# (glob, mode, alpha, flip) -- mode 'srgb' mips in linear light (as GL generateMipmap on sRGB8_ALPHA8), 'lin' as stored;
# alpha -> BC3; flip = the original is drawn with flipY = true (DDS rows stored bottom-up); glTF-UV textures (kit, car AO) don't flip
JOBS = [
    ('tex/*/color.jpg', 'srgb', False, True), ('tex/*/rough.jpg', 'lin', False, True), ('tex/*/ao.jpg', 'lin', False, True),
    ('kit/fac3_alb.jpg', 'srgb', False, False), ('kit/fac3_orm.jpg', 'lin', False, False), ('kit/city_alb.jpg', 'srgb', False, False), ('kit/city_orm.jpg', 'lin', False, False),
    ('baked/facade_alb.jpg', 'srgb', False, True), ('baked/rooms_day.jpg', 'srgb', False, True), ('baked/rooms_night.jpg', 'srgb', False, True),
    ('baked/shops.jpg', 'srgb', False, True), ('baked/shops_night.jpg', 'srgb', False, True),
    ('trees/leaves_albedo.webp', 'srgb', True, True), ('trees/impostors_albedo.webp', 'srgb', True, True),
    ('cars/*_ao.jpg', 'lin', False, False),
    ('peds/*_alb.webp', 'srgb', True, False), ('peds/*_nrm.png', 'lin', True, False),   # pedestrians (tools/blender/peds): BC3 albedo+mask, BC3 DXT5nm normals
]


def to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def to_srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def blocks(img):  # (h, w, c) -> (nb, 16, c), h, w multiples of 4
    h, w, c = img.shape
    return img.reshape(h // 4, 4, w // 4, 4, c).transpose(0, 2, 1, 3, 4).reshape(-1, 16, c)


def pad4(img):
    h, w = img.shape[:2]; H, W = (h + 3) // 4 * 4, (w + 3) // 4 * 4
    if H == h and W == w: return img
    return np.pad(img, ((0, H - h), (0, W - w), (0, 0)), mode='edge')


def bc1_color(B):
    """B: (nb, 16, 3) float 0..255 -> (nb,) c0 u16, c1 u16, idx u32 (4-colour mode, c0 > c1)."""
    mean = B.mean(1, keepdims=True); X = B - mean
    cov = np.einsum('nki,nkj->nij', X, X)
    ax = np.ones((B.shape[0], 3)) / np.sqrt(3)
    for _ in range(6):
        ax = np.einsum('nij,nj->ni', cov, ax); ax /= np.maximum(np.linalg.norm(ax, axis=1, keepdims=True), 1e-9)
    t = np.einsum('nki,ni->nk', X, ax)
    tmin, tmax = t.min(1), t.max(1); inset = (tmax - tmin) / 32
    e0 = mean[:, 0] + ax * (tmax - inset)[:, None]; e1 = mean[:, 0] + ax * (tmin + inset)[:, None]
    def q565(e):
        e = np.clip(e, 0, 255)
        r = np.round(e[:, 0] * 31 / 255).astype(np.uint16); g = np.round(e[:, 1] * 63 / 255).astype(np.uint16); b = np.round(e[:, 2] * 31 / 255).astype(np.uint16)
        return (r << 11) | (g << 5) | b
    def dq(c):
        c = c.astype(np.int32)
        return np.stack([((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31], 1)
    W0 = np.array([1, 0, 2 / 3, 1 / 3], np.float32)
    def fit(e0, e1):
        c0, c1 = q565(e0), q565(e1)
        sw = c0 < c1; c0, c1 = np.where(sw, c1, c0), np.where(sw, c0, c1)
        eq = c0 == c1
        c1 = np.where(eq & (c0 > 0), c0 - 1, c1); c0 = np.where(eq & (c0 == 0), 1, c0)  # keep 4-colour mode
        p0, p1 = dq(c0), dq(c1)
        pal = np.stack([p0, p1, (2 * p0 + p1) / 3, (p0 + 2 * p1) / 3], 1).astype(np.float32)  # (nb, 4, 3)
        d = ((B[:, :, None, :] - pal[:, None, :, :]) ** 2).sum(-1)  # (nb, 16, 4)
        idx = d.argmin(-1)
        return c0, c1, idx, np.take_along_axis(d, idx[..., None], -1).sum((1, 2))
    c0, c1, idx, err = fit(e0, e1)
    for _ in range(2):  # least-squares endpoint refit on the chosen indices (squish-style), keep per block if better
        a = W0[idx]; b = 1 - a
        aa, bb, ab = (a * a).sum(1), (b * b).sum(1), (a * b).sum(1)
        ax_, bx_ = np.einsum('nk,nkc->nc', a, B), np.einsum('nk,nkc->nc', b, B)
        det = aa * bb - ab * ab; ok = np.abs(det) > 1e-6; det = np.where(ok, det, 1)
        n0 = (ax_ * bb[:, None] - bx_ * ab[:, None]) / det[:, None]; n1 = (bx_ * aa[:, None] - ax_ * ab[:, None]) / det[:, None]
        n0 = np.where(ok[:, None], n0, e0); n1 = np.where(ok[:, None], n1, e1)
        k0, k1, ki, ke = fit(n0, n1)
        better = ke < err
        c0, c1, err = np.where(better, k0, c0), np.where(better, k1, c1), np.where(better, ke, err)
        idx = np.where(better[:, None], ki, idx); e0, e1 = np.where(better[:, None], n0, e0), np.where(better[:, None], n1, e1)
    idx = idx.astype(np.uint32)
    word = np.zeros(B.shape[0], np.uint32)
    for k in range(16): word |= idx[:, k] << np.uint32(2 * k)
    return c0, c1, word


def bc3_alpha(A):
    """A: (nb, 16) float 0..255 -> (nb, 8) bytes (8-value mode, a0 > a1)."""
    a0 = np.clip(np.round(A.max(1)), 0, 255).astype(np.int32); a1 = np.clip(np.round(A.min(1)), 0, 255).astype(np.int32)
    same = a0 == a1; a0 = np.where(same & (a0 < 255), a0 + 1, a0); a1 = np.where(same & (a0 == 255) & (a1 == 255), 254, a1)
    vals = np.stack([a0, a1] + [((7 - i) * a0 + i * a1) / 7 for i in range(1, 7)], 1)  # codes 0..7
    idx = np.abs(A[:, :, None] - vals[:, None, :]).argmin(-1).astype(np.uint64)
    bits = np.zeros(A.shape[0], np.uint64)
    for k in range(16): bits |= idx[:, k] << np.uint64(3 * k)
    out = np.zeros((A.shape[0], 8), np.uint8); out[:, 0] = a0; out[:, 1] = a1
    for k in range(6): out[:, 2 + k] = ((bits >> np.uint64(8 * k)) & np.uint64(255)).astype(np.uint8)
    return out


def encode(img, alpha):
    h, w = img.shape[:2]
    B = blocks(pad4(img)).astype(np.float32)
    c0, c1, word = bc1_color(B[:, :, :3])
    col = np.zeros((B.shape[0], 8), np.uint8)
    col[:, 0:2] = c0.astype('<u2').view(np.uint8).reshape(-1, 2); col[:, 2:4] = c1.astype('<u2').view(np.uint8).reshape(-1, 2)
    col[:, 4:8] = word.astype('<u4').view(np.uint8).reshape(-1, 4)
    if not alpha: return col.tobytes()
    return np.concatenate([bc3_alpha(B[:, :, 3]), col], 1).tobytes()


def mip_down(f, mode):  # f float (h, w, c) in 0..1 storage space
    h, w = f.shape[:2]; H, W = max(1, h // 2), max(1, w // 2)
    g = f.copy()
    if mode == 'srgb': g[..., :3] = to_lin(g[..., :3])
    g = g[:H * 2, :W * 2] if h > 1 and w > 1 else g
    if h > 1 and w > 1: g = g.reshape(H, 2, W, 2, -1).mean((1, 3))
    elif h > 1: g = g.reshape(H, 2, 1, -1).mean(1)
    elif w > 1: g = g.reshape(1, W, 2, -1).mean(2)
    if mode == 'srgb': g[..., :3] = to_srgb(np.clip(g[..., :3], 0, 1))
    return np.clip(g, 0, 1)


def dds(path_out, w, h, levels, alpha):
    four = b'DXT5' if alpha else b'DXT1'
    pf = struct.pack('<II4sIIIII', 32, 0x4, four, 0, 0, 0, 0, 0)
    flags = 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000
    hdr = struct.pack('<IIIIIII', 124, flags, h, w, len(levels[0]), 0, len(levels)) + b'\0' * 44 + pf + struct.pack('<IIIII', 0x1000 | 0x400000 | 0x8, 0, 0, 0, 0)
    with open(path_out, 'wb') as f: f.write(b'DDS ' + hdr); [f.write(l) for l in levels]


def pack(src, mode, alpha, flip, force=False):
    out = os.path.splitext(src)[0] + '.dds'
    if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src): return out, None
    im = Image.open(src).convert('RGBA' if alpha else 'RGB')
    f = np.asarray(im, np.float32) / 255.0
    if flip: f = f[::-1]  # row 0 = image bottom (the original texture has flipY = true)
    levels = []
    ok = lambda n: n % 4 == 0 or n <= 2   # WEBGL_compressed_texture_s3tc: mips must be a multiple of 4 or 1/2 wide (NPOT chains stop early)
    while True:
        levels.append(encode(np.round(f * 255), alpha))
        if f.shape[0] == 1 and f.shape[1] == 1: break
        f = mip_down(f, mode)
        if not (ok(f.shape[0]) and ok(f.shape[1])): break
    dds(out, im.width, im.height, levels, alpha)
    return out, (im.width, im.height)


if __name__ == '__main__':
    force = '--force' in sys.argv; only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    manifest = {}
    for pat, mode, alpha, flip in JOBS:
        for src in sorted(glob.glob(os.path.join(ROOT, pat))):
            rel = os.path.relpath(src, ROOT).replace(os.sep, '/')
            if only and only not in rel: manifest[rel] = 1 if os.path.exists(os.path.splitext(src)[0] + '.dds') else 0; continue
            out, sz = pack(src, mode, alpha, flip, force)
            manifest[rel] = 1
            if sz: print(rel, sz, os.path.getsize(out) // 1024, 'KB', flush=True)
    p = os.path.join(ROOT, 'texpack.json')
    with open(p, 'w') as f: json.dump({'v': 1, 'files': sorted(k for k, v in manifest.items() if v)}, f, indent=0)
    print('manifest', len(manifest))
