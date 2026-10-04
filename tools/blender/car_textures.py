"""Shared car detail textures (height fields -> tangent-space normal maps, numpy), saved through bpy.

  public/assets/cars/tyre.jpg  1024 x 1024: top half = road tyre, bottom half = off-road (knobby) tyre.
     one tile = 1/NREP of the circumference (u) x the whole tyre profile (v):
       v 0.00-0.32 outer sidewall (bead -> shoulder), 0.32-0.68 tread, 0.68-1.00 inner sidewall (shoulder -> bead)
     R,G = normal xy (x along the circumference, y along the profile), B = cavity (1 = surface, 0 = groove floor).
     No lettering: the sidewall carries a rim protector, fine bead ribs, an abstract embossed band and shoulder serrations.

Run: tools/.venv-blender/Scripts/python tools/blender/car_textures.py
The tyre UV contract (tools/blender/cars.py tyre_mesh + models.js tyre shader): uv.x = angle / 2pi * NREP, uv.y = 2 + v (road)
or 6 + v (off-road).
"""
import os, math
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'public', 'assets', 'cars'))
NREP = 8
W, H = 1024, 512            # one half
TILE_U_M, PROF_M = 0.26, 0.44   # physical size of a tile (m) for the slope scale


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def band(x, c, w, soft):
    return 1 - sstep(w, w + soft, np.abs(x - c))


def sidewall(u, w, knobby):
    """w: 0 at the bead .. 1 at the shoulder. heights in mm"""
    h = np.zeros_like(u)
    # bead: fine concentric ribs
    h += 0.25 * (np.sin(w * 2 * math.pi * 26) > 0.3) * (w < 0.07)
    # rim protector ridge
    h += 2.2 * band(w, 0.11, 0.025, 0.02)
    # a sidewall that bulges slightly: large-scale shape lives in the mesh, add a soft step at the mould line
    h += 0.35 * sstep(0.55, 0.6, w)
    # abstract embossed band (no letters): long raised dashes with rounded ends and small triangles between
    uu = (u * 3.0) % 1.0
    dash = band(w, 0.42, 0.018, 0.01) * band(uu, 0.35, 0.22, 0.03)
    tri = band(w, 0.42, 0.03, 0.01) * np.clip(1 - np.abs(uu - 0.8) * 18 - np.abs(w - 0.42) * 25, 0, 1)
    h += 0.5 * dash + 0.5 * np.clip(tri * 3, 0, 1)
    # a thin circular line under the band
    h += 0.3 * band(w, 0.5, 0.004, 0.004)
    # shoulder serrations (radial ribs every ~4 mm)
    ser = (np.sin(u * 2 * math.pi * (72 if not knobby else 40)) > 0) * sstep(0.8, 0.86, w)
    h += 0.45 * ser
    if knobby:
        # shoulder lugs wrapping over onto the sidewall
        lug = (np.floor(u * 10) % 2 == 0) * sstep(0.72, 0.8, w)
        h += 3.0 * lug
    return h


def tread_road(u, t):
    """t 0..1 across the tread. heights in mm (0 = groove floor, 8 = surface)"""
    h = np.full_like(u, 8.0)
    for c, w in ((0.25, 0.028), (0.5, 0.034), (0.75, 0.028)):
        h -= 7.0 * band(t, c, w, 0.006)
    # shoulder blocks: slanted lateral grooves, 8 per tile
    sh = (t < 0.18) | (t > 0.82)
    ph = (u * 8 + (np.where(t < 0.5, t, 1 - t)) * 1.2) % 1.0
    h -= 6.0 * sh * band(ph, 0.5, 0.05, 0.02)
    # intermediate ribs: thin directional sipes
    mid = ((t > 0.27) & (t < 0.48)) | ((t > 0.52) & (t < 0.73))
    ph2 = (u * 16 + np.abs(t - 0.5) * 2.4) % 1.0
    h -= 5.0 * mid * band(ph2, 0.5, 0.012, 0.01)
    # rounded block edges into the shoulder
    h -= 2.0 * (1 - sstep(0.0, 0.06, t)) + 2.0 * (1 - sstep(0.0, 0.06, 1 - t))
    return h


def tread_knobby(u, t):
    h = np.zeros_like(u)
    rows = np.floor(t * 5); col = np.floor(u * 6 + (rows % 2) * 0.5)
    fu = (u * 6 + (rows % 2) * 0.5) % 1.0; ft = (t * 5) % 1.0
    knob = sstep(0.0, 0.12, fu) * sstep(0.0, 0.12, 1 - fu) * sstep(0.0, 0.15, ft) * sstep(0.0, 0.15, 1 - ft)
    h += 12.0 * (knob > 0.5) * (0.75 + 0.25 * knob)
    # small sipe on every knob
    h -= 3.0 * (knob > 0.5) * band(fu, 0.5, 0.03, 0.02)
    return h


def half(knobby):
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)          # rows = v
    h = np.zeros_like(U)
    s0 = V < 0.32; s2 = V > 0.68; tr = ~s0 & ~s2
    h[s0] = sidewall(U[s0], V[s0] / 0.32, knobby)
    h[s2] = sidewall(U[s2], (1 - V[s2]) / 0.32, knobby) * 0.8
    tt = (V[tr] - 0.32) / 0.36
    h[tr] = (tread_knobby if knobby else tread_road)(U[tr], tt) + (0 if knobby else 0)
    # tread sits 'above' the sidewall scale; normalise per zone so the cavity term works on both
    return h


def to_normal(h, k=1.0):
    # slopes in mm per mm: pixel sizes differ in u and v
    du = TILE_U_M * 1000 / W; dv = PROF_M * 1000 / H
    hx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * du)
    hy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * dv)
    hy[0, :] = hy[1, :]; hy[-1, :] = hy[-2, :]
    n = np.dstack([-hx * k, -hy * k, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n


def blur(h, r=1):
    out = h.copy()
    for _ in range(r):
        out = (out + np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 5
    return out


def main():
    rows = []
    for knobby in (False, True):
        h = blur(half(knobby), 1)
        n = to_normal(h, 0.9)
        lo, hi = np.percentile(h, 1), np.percentile(h, 99)
        cav = np.clip((h - lo) / max(hi - lo, 1e-6), 0, 1)
        cav = 0.3 + 0.7 * cav
        rgb = np.dstack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, cav])
        rows.append(rgb)
    # image rows: blender pixels start bottom-left. three flips Y on load (flipY true) so v=0 is the bottom row:
    # the road half occupies tex v 0..0.5, off-road 0.5..1 (see models.js tyre shader)
    img = np.concatenate(rows, axis=0)     # row 0 = v 0 (bottom)
    im = bpy.data.images.new('tyre', W, 2 * H, alpha=False)
    im.colorspace_settings.name = 'Non-Color'
    px = np.dstack([img, np.ones(img.shape[:2])]).astype(np.float32)
    im.pixels.foreach_set(px.ravel())
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.display_settings.display_device = 'sRGB'
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 94; sc.render.image_settings.color_mode = 'RGB'
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'tyre.jpg')
    im.save_render(path, scene=sc)
    print('[car_textures] wrote', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
