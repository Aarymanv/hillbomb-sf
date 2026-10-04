"""Quick review sheet of cached tiles: review.py rooms|shops idx,idx out.png [scale]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import hb_lib as L
kind, idx, out = sys.argv[1], sys.argv[2], sys.argv[3]
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
rows = []
for i in [int(x) for x in idx.split(',')]:
    vs = ('day', 'night') if kind == 'rooms' else ('day', 'night')
    tiles = [L.load_png(os.path.join(L.CACHE, kind, '%02d_%s.png' % (i, v))) for v in vs]
    row = np.concatenate([tiles[0], np.ones((tiles[0].shape[0], 6, 3)), tiles[1]], axis=1)
    rows.append(row); rows.append(np.ones((6, row.shape[1], 3)))
img = np.concatenate(rows[:-1], axis=0)
if scale != 1.0:
    s = int(round(1 / scale)); img = img[::s, ::s]
L.save_image(out, img, 'PNG')
