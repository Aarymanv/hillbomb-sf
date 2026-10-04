"""Chinatown hero set -> BC1 .dds next to the JPEG/PNG (plain python: numpy + PIL, tools/texpack.py encoder).

Lightmaps public/assets/landmarks/ct_*/ct_*_lm.jpg / _lmn.jpg (glTF uv, no flip, sRGB) and the sign / shop atlases in
public/assets/landmarks/ct/. A 2K lightmap: 16 MB RGBA8 + mips -> 2.7 MB BC1.
usage: python tools/blender/ct_pack.py [--force]     (then hero_index.py flags them: site.lm.dds)
"""
import glob, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from texpack import pack   # noqa
ASSETS = os.path.join(HERE, '..', '..', 'public', 'assets', 'landmarks')
force = '--force' in sys.argv
srcs = sorted(glob.glob(os.path.join(ASSETS, 'ct_*', 'ct_*_lm*.jpg'))) + [os.path.join(ASSETS, 'ct', 'ct_signs.png'), os.path.join(ASSETS, 'ct', 'ct_shops.jpg')]
tot = 0
for src in srcs:
    if not os.path.exists(src): continue
    out, sz = pack(src, 'srgb', False, False, force)
    if sz: print(os.path.relpath(out, ASSETS), os.path.getsize(out) // 1024, 'KB', flush=True)
    if out and os.path.exists(out): tot += os.path.getsize(out)
print('ct dds total %.1f MB' % (tot / 1048576))
# LOD1 night tint: mean linear night irradiance of the lit wall texels (the far LOD has no lightmap; hero_lm.js adds
# albedo x avg x nightScale x gain so the LOD0 swap at ~200 m doesn't pop from dark to lit)
import json
import numpy as np
CACHE = os.path.join(HERE, '_cache', 'hero')
for src in sorted(glob.glob(os.path.join(ASSETS, 'ct_*', 'ct_*_lmn.jpg'))):
    bid = os.path.basename(os.path.dirname(src)); jp = os.path.join(CACHE, bid + '.json')
    if not os.path.exists(jp): continue
    a = np.asarray(Image.open(src).convert('RGB'), np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    lum = lin.mean(2); m = lum > 0.004
    avg = [round(float(lin[:, :, c][m].mean()), 4) for c in range(3)] if m.any() else [0, 0, 0]
    d = json.load(open(jp))
    if d.get('lm'): d['lm']['avg'] = avg; json.dump(d, open(jp, 'w')); print(bid, 'night avg', avg)

