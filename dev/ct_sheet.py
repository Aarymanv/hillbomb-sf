"""Chinatown side-by-side sheet: the concept vs our same framing (night rain), daytime, drive-through (chase cam) frames.
python dev/ct_sheet.py [suffix]   -> shots/chinatown_vs_ref.jpg
Inputs (dev/ctshots.js): shots/ct_<view>_<suffix>.jpg for views ref (concept framing), refday, drive1..3; concept image
shots/REF_target_chinatown_night.webp; old in-game shot shots/REG_old_washington_rain.webp.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shots')
suf = sys.argv[1] if len(sys.argv) > 1 else 'x'
OUTN = sys.argv[2] if len(sys.argv) > 2 else 'chinatown_vs_ref.jpg'
W, H = 960, 540


def load(name):
    p = os.path.join(S, name)
    if not os.path.exists(p): return Image.new('RGB', (W, H), (40, 0, 0))
    im = Image.open(p).convert('RGB')
    r = max(W / im.width, H / im.height); im = im.resize((int(im.width * r + 0.5), int(im.height * r + 0.5)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def label(im, s):
    d = ImageDraw.Draw(im)
    try: f = ImageFont.truetype('arialbd.ttf', 22)
    except Exception: f = ImageFont.load_default()
    d.rectangle([0, 0, d.textlength(s, font=f) + 16, 34], fill=(0, 0, 0))
    d.text((8, 5), s, font=f, fill=(255, 255, 255))
    return im


rows = [
    [label(load('REF_target_chinatown_night.webp'), 'Concept (target)'), label(load('ct_ref_%s.jpg' % suf), 'HILLBOMB: same framing, night rain')],
    [label(load('ct_ref_final.jpg'), 'Round 1 (same framing, night rain)'), label(load('ct_refday_%s.jpg' % suf), 'HILLBOMB: same framing, day')],
    [label(load('ct_drive1_%s.jpg' % suf), 'Drive-through: Grant Ave (chase cam)'), label(load('ct_drive2_%s.jpg' % suf), 'Drive-through: Grant Ave further on')],
]
sheet = Image.new('RGB', (W * 2 + 12, H * len(rows) + 6 * (len(rows) + 1)), (16, 16, 16))
for j, r in enumerate(rows):
    for i, im in enumerate(r): sheet.paste(im, (i * (W + 12), 6 + j * (H + 6)))
out = os.path.join(S, OUTN)
sheet.save(out, quality=88)
print(out, sheet.size)
