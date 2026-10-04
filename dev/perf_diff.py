# dev-only: compare perf_shots.js captures. python dev/perf_diff.py before after [--sheet name]
# per view: mean abs diff (0-255), share of pixels differing > 24, and a before | after | diff x4 sheet in shots/.
import sys, glob, os
from PIL import Image, ImageChops
import numpy as np
a, b = sys.argv[1], sys.argv[2]
sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
root = os.path.join(os.path.dirname(__file__), '..', 'shots')
rows = []
for fa in sorted(glob.glob(os.path.join(root, f'perfv_*_{a}.jpg'))):
    fb = fa[:-len(a) - 4] + b + '.jpg'
    if not os.path.exists(fb): continue
    A = np.asarray(Image.open(fa).convert('RGB')).astype(np.int16); B = np.asarray(Image.open(fb).convert('RGB')).astype(np.int16)
    d = np.abs(A - B).max(axis=2)
    name = os.path.basename(fa)[6:-len(a) - 5]
    print(f'{name:16s} mean {d.mean():5.2f}  >24: {100 * (d > 24).mean():5.2f}%  >64: {100 * (d > 64).mean():5.2f}%')
    rows.append((A, B, d))
if sheet and rows:
    W = 640; H = 360; im = Image.new('RGB', (W * 3, H * len(rows)))
    for i, (A, B, d) in enumerate(rows):
        im.paste(Image.fromarray(A.astype(np.uint8)).resize((W, H)), (0, i * H)); im.paste(Image.fromarray(B.astype(np.uint8)).resize((W, H)), (W, i * H))
        im.paste(Image.fromarray(np.clip(d * 4, 0, 255).astype(np.uint8)).convert('RGB').resize((W, H)), (2 * W, i * H))
    im.save(os.path.join(root, sheet + '.jpg'), quality=85)
    print('sheet', sheet)
