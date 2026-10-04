"""Hero interior lightmaps / sign atlases -> BC1/BC3 .dds next to the JPEG/PNG (plain python: numpy + PIL).

Uses the perf pass's encoder (tools/texpack.py `pack`). Lightmaps are glTF-uv textures (no flip), gamma-encoded (sRGB).
A 2K lightmap: 16 MB RGBA8 (+5 MB mips) -> 2.7 MB BC1; the big halls bake at 4K (10.9 MB BC1).
usage: python tools/blender/hero_int_pack.py [ids...] [--force]
"""
import glob, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from texpack import pack   # noqa
ASSETS = os.path.join(HERE, '..', '..', 'public', 'assets', 'landmarks')
force = '--force' in sys.argv
ids = [a for a in sys.argv[1:] if not a.startswith('--')]
for src in sorted(glob.glob(os.path.join(ASSETS, '*', '*_int_*.*'))):
    bid = os.path.basename(os.path.dirname(src))
    if ids and bid not in ids: continue
    ext = os.path.splitext(src)[1].lower()
    if ext not in ('.jpg', '.png'): continue
    alpha = ext == '.png'
    im = Image.open(src)
    out, sz = pack(src, 'srgb', alpha, False, force)
    if sz: print(os.path.relpath(out, ASSETS), sz, os.path.getsize(out) // 1024, 'KB', flush=True)

# ---- Poly Haven prop textures referenced by interior metas (hero_props.py): _iprops/<asset>/<file>.dds, glTF uv (no flip)
import json
import numpy as np
from texpack import encode, mip_down, dds
CACHE = os.path.join(HERE, '_cache', 'hero')
MODELS = os.path.join(HERE, '_cache', 'int_assets', 'models')


def _save(path, img, mode, alpha):
    f = np.asarray(img, np.float32) / 255.0
    levels, ok = [], (lambda n: n % 4 == 0 or n <= 2)
    while True:
        levels.append(encode(np.round(f * 255), alpha))
        if f.shape[0] == 1 and f.shape[1] == 1: break
        f = mip_down(f, mode)
        if not (ok(f.shape[0]) and ok(f.shape[1])): break
    dds(path, img.width, img.height, levels, alpha)


done = set()
for jp in sorted(glob.glob(os.path.join(CACHE, '*.json'))):
    if ids and os.path.basename(jp)[:-5] not in ids: continue
    try: I = json.load(open(jp)).get('interior') or {}
    except Exception: continue
    for slot, M in (I.get('props') or {}).items():
        if M.get('ext'): continue      # shared game texture (e.g. the tree atlas), already packed
        od = os.path.join(ASSETS, '_iprops', M['asset']); os.makedirs(od, exist_ok=True)
        for kind in ('diff', 'arm', 'nor'):
            f = M.get(kind)
            if not f or (M['asset'], f) in done: continue
            done.add((M['asset'], f))
            src = os.path.join(MODELS, M['asset'], 'textures', f)
            out = os.path.join(od, os.path.splitext(f)[0] + '.dds')
            if not os.path.exists(src) or (os.path.exists(out) and not force and os.path.getmtime(out) >= os.path.getmtime(src)): continue
            im = Image.open(src)
            if kind == 'diff':
                a = M.get('alpha') and im.mode in ('RGBA', 'LA')
                _save(out, im.convert('RGBA' if a else 'RGB'), 'srgb', bool(a))
            elif kind == 'arm':
                if '_rough' in f.lower():    # roughness-only map: pack as ARM (G = rough, B = metal 0)
                    L = im.convert('L'); _save(out, Image.merge('RGB', (Image.new('L', im.size, 255), L, Image.new('L', im.size, 0))), 'lin', False)
                else: _save(out, im.convert('RGB'), 'lin', False)
            else:
                r, g, b = im.convert('RGB').split(); z = Image.new('L', im.size, 0)
                _save(out, Image.merge('RGBA', (z, g, z, r)), 'lin', True)
            print('prop tex', M['asset'], f, flush=True)

# ---- lmMed: median irradiance of the used lightmap texels (runtime auto exposure, hero_int.js), from the JPEG + lmScale
for jp in sorted(glob.glob(os.path.join(CACHE, '*.json'))):
    bid = os.path.basename(jp)[:-5]
    if ids and bid not in ids: continue
    try: info = json.load(open(jp))
    except Exception: continue
    I = info.get('interior')
    if not I or not I.get('lm'): continue
    src = os.path.join(ASSETS, bid, I['lm'])
    if not os.path.exists(src): continue
    a = np.asarray(Image.open(src).convert('RGB').resize((512, 512), Image.BILINEAR), np.float32) / 255.0
    irr = (a ** 2.2).mean(axis=2) * float(I.get('lmScale', 1.0))
    nz = irr[irr > 1e-4]
    med = round(float(np.median(nz)), 5) if nz.size else 0.0
    if I.get('lmMed') != med:
        I['lmMed'] = med; json.dump(info, open(jp, 'w')); print('lmMed', bid, med, flush=True)
