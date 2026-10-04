# Stage 1: elevation. Terrarium tiles -> world-aligned 4 m heightfield (float32, metres), cached to cache/dem.npy.
import glob, math, os, time
import numpy as np
from PIL import Image
from scipy import ndimage
from common import RAW, CACHE, CELL, grid_extent, unproj

Z = 14


def mosaic():
    tiles = glob.glob(os.path.join(RAW, 'dem', f'{Z}_*.png'))
    xs = sorted({int(os.path.basename(t)[:-4].split('_')[1]) for t in tiles})
    ys = sorted({int(os.path.basename(t)[:-4].split('_')[2]) for t in tiles})
    H = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
    for t in tiles:
        _, x, y = os.path.basename(t)[:-4].split('_'); x, y = int(x), int(y)
        a = np.asarray(Image.open(t).convert('RGB')).astype(np.float32)
        H[(y - ys[0]) * 256:(y - ys[0] + 1) * 256, (x - xs[0]) * 256:(x - xs[0] + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return H, xs[0], ys[0]


def run():
    t0 = time.time()
    X0, Z0, X1, Z1, NX, NZ = grid_extent()
    H, tx0, ty0 = mosaic()
    # spline coefficients once (order 3), then sample per row block
    coef = ndimage.spline_filter(H, order=3, mode='nearest')
    n = 2 ** Z
    out = np.empty((NZ, NX), np.float32)
    xs = X0 + np.arange(NX) * CELL
    for j0 in range(0, NZ, 256):
        j1 = min(NZ, j0 + 256)
        zs = Z0 + np.arange(j0, j1) * CELL
        XX, ZZ = np.meshgrid(xs, zs)
        lat, lon = unproj(XX, ZZ)
        px = (lon + 180) / 360 * n
        py = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
        col = (px - tx0) * 256 - 0.5
        row = (py - ty0) * 256 - 0.5
        out[j0:j1] = ndimage.map_coordinates(coef, [row.ravel(), col.ravel()], order=3, mode='nearest', prefilter=False).reshape(row.shape)
    os.makedirs(CACHE, exist_ok=True)
    np.save(os.path.join(CACHE, 'dem.npy'), out)
    print(f'dem grid {NX}x{NZ} ({X0},{Z0})..({X1},{Z1}) range {out.min():.1f}..{out.max():.1f} m  {time.time()-t0:.1f}s')
    return out


if __name__ == '__main__':
    run()
