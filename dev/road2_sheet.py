"""Road pass 2 sheets (dev/road2shots.js captures).
python dev/road2_sheet.py               -> shots/road2_vs_ref.jpg (concept | before | after, same framing)
                                           shots/road2_pairs.jpg (before | after for every view)
python dev/road2_sheet.py grid <suffix> -> shots/road2_grid_<suffix>.jpg (all views of one suffix, quick look)
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shots')
VIEWS = ['grant_rain', 'grant_day', 'mission_rain', 'hyde_day', 'market_night']


def load(name, W, H):
    p = os.path.join(S, name)
    if not os.path.exists(p): return Image.new('RGB', (W, H), (40, 0, 0))
    im = Image.open(p).convert('RGB')
    r = max(W / im.width, H / im.height); im = im.resize((int(im.width * r + 0.5), int(im.height * r + 0.5)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def label(im, s):
    d = ImageDraw.Draw(im)
    try: f = ImageFont.truetype('arialbd.ttf', 20)
    except Exception: f = ImageFont.load_default()
    d.rectangle([0, 0, d.textlength(s, font=f) + 14, 30], fill=(0, 0, 0))
    d.text((7, 4), s, font=f, fill=(255, 255, 255))
    return im


def sheet(cells, cols, W, H, out):
    rows = (len(cells) + cols - 1) // cols
    sh = Image.new('RGB', (cols * W + (cols - 1) * 8, rows * H + (rows - 1) * 8), (20, 20, 20))
    for i, (f, t) in enumerate(cells):
        sh.paste(label(load(f, W, H), t), ((i % cols) * (W + 8), (i // cols) * (H + 8)))
    sh.save(os.path.join(S, out), quality=88)
    print(out)


if len(sys.argv) > 1 and sys.argv[1] == 'road3':   # python dev/road2_sheet.py road3 -> shots/road3_sheet.jpg (concept row + before | after)
    cells = [('REF_target_chinatown_night.webp', 'Concept (target)'), ('road3_ref_before.jpg', 'Concept framing: before'), ('road3_ref_after.jpg', 'Concept framing: after')]
    for v in ['lamp_rain', 'mission_rain']: cells += [(f'road3_{v}_before.jpg', f'{v}: before'), (f'road3_{v}_after.jpg', f'{v}: after'), (f'road3_{v}_after_refl.jpg', f'{v}: after, reflection x4')]
    sheet(cells, 3, 960, 540, 'road3_sheet.jpg')
elif len(sys.argv) > 2 and sys.argv[1] == 'grid':
    suf = sys.argv[2]
    sheet([(f'road2_{v}_{suf}.jpg', f'{v} {suf}') for v in VIEWS + ['ref']], 2, 800, 450, f'road2_grid_{suf}.jpg')
else:
    sheet([('REF_target_chinatown_night.webp', 'Concept (target)'), ('road2_ref_before.jpg', 'Before (same framing)'), ('road2_ref_after.jpg', 'After')], 3, 960, 540, 'road2_vs_ref.jpg')
    cells = []
    for v in VIEWS: cells += [(f'road2_{v}_before.jpg', f'{v}: before'), (f'road2_{v}_after.jpg', f'{v}: after')]
    sheet(cells, 2, 960, 540, 'road2_pairs.jpg')
