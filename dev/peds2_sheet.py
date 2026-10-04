# Stitch the people round 2 frame strips: shots/peds2_<name>_<suf>_<k>.jpg -> shots/peds2_<name>_<suf>.jpg (one row),
# and (with two suffixes) a before/after sheet shots/peds2_sheet.jpg.
# usage: python dev/peds2_sheet.py after [before]
import os, sys, glob
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', 'shots')
STRIPS = ['enter_car', 'exit_car', 'knockdown', 'jump', 'senter', 'sexit', 'sknock']
SINGLE = ['closeup_phone', 'umbrella_rain', 'crowd_far']


def strip(name, suf):
    fs = sorted(glob.glob(os.path.join(ROOT, f'peds2_{name}_{suf}_*.jpg')), key=lambda p: int(p.rsplit('_', 1)[1][:-4]))
    if not fs: return None
    ims = [Image.open(f) for f in fs]
    h = 300; ims = [im.resize((int(im.width * h / im.height), h)) for im in ims]
    out = Image.new('RGB', (sum(i.width for i in ims), h))
    x = 0
    for i in ims: out.paste(i, (x, 0)); x += i.width
    p = os.path.join(ROOT, f'peds2_{name}_{suf}.jpg'); out.save(p, quality=88)
    return out


def sheet(sufs):
    rows = []
    for n in SINGLE + STRIPS:
        ims = []
        for s in sufs:
            p = os.path.join(ROOT, f'peds2_{n}_{s}.jpg')
            if os.path.exists(p): ims.append((s, Image.open(p)))
        if ims: rows.append((n, ims))
    W = 1600
    out_rows = []
    for n, ims in rows:
        if n in SINGLE:
            w = W // len(ims); row = Image.new('RGB', (W, int(w * 720 / 1280)))
            for k, (s, im) in enumerate(ims):
                row.paste(im.resize((w, row.height)), (k * w, 0)); ImageDraw.Draw(row).text((k * w + 8, 6), f'{n} {s}', fill=(255, 255, 0))
            out_rows.append(row)
        else:
            for s, im in ims:
                im = im.resize((W, int(im.height * W / im.width))); ImageDraw.Draw(im).text((8, 6), f'{n} {s}', fill=(255, 255, 0)); out_rows.append(im)
    H = sum(r.height for r in out_rows)
    out = Image.new('RGB', (W, H)); y = 0
    for r in out_rows: out.paste(r, (0, y)); y += r.height
    out.save(os.path.join(ROOT, 'peds2_sheet.jpg'), quality=85)


if __name__ == '__main__':
    sufs = sys.argv[1:] or ['after']
    for s in sufs:
        for n in STRIPS: strip(n, s)
    if len(sufs) > 1: sheet(sufs[::-1])
