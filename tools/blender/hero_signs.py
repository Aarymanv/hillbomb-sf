"""Shop-sign atlas for hero interiors (plain CPython + Pillow, not Blender).

python tools/blender/hero_signs.py ferry  ->  public/assets/landmarks/ferry/ferry_int_signs.png
Cells: 2 columns x 16 rows of 512x64 px, cell k = names[k]; text is warm cream on transparent (alpha-tested in the game).
The Blender builder maps each sign quad onto its cell (hero_int_w3.sign_uv).
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
CW, CH, COLS, ROWS = 512, 64, 2, 16


def font(px):
    for f in ('georgiab.ttf', 'georgia.ttf', 'timesbd.ttf', 'arialbd.ttf'):
        p = os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts', f)
        if os.path.exists(p): return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def atlas(names, out):
    im = Image.new('RGBA', (CW * COLS, CH * ROWS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for k, s in enumerate(names):
        cx, cy = (k % COLS) * CW, (k // COLS) * CH
        px = 46
        while px > 16:
            f = font(px); bb = d.textbbox((0, 0), s, font=f)
            if bb[2] - bb[0] <= CW - 36 and bb[3] - bb[1] <= CH - 12: break
            px -= 2
        bb = d.textbbox((0, 0), s, font=f)
        x = cx + (CW - (bb[2] - bb[0])) / 2 - bb[0]; y = cy + (CH - (bb[3] - bb[1])) / 2 - bb[1]
        d.text((x + 2, y + 2), s, font=f, fill=(60, 30, 10, 200))
        d.text((x, y), s, font=f, fill=(255, 236, 196, 255))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, optimize=True)
    print('signs', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'ferry'
    if which == 'pier39':
        import ast
        src = open(os.path.join(HERE, 'hero_int_w5.py'), encoding='utf-8').read()
        i0 = src.index('P39_SHOPS = ['); i1 = src.index(']', i0)
        names = ast.literal_eval(src[i0 + 12:i1 + 1])
        atlas(names, os.path.join(ROOT, 'public', 'assets', 'landmarks', 'pier39', 'pier39_int_signs.png'))
    if which == 'ferry':
        import ast
        src = open(os.path.join(HERE, 'hero_int_w3.py'), encoding='utf-8').read()
        i0 = src.index('SHOPS = ['); i1 = src.index(']', i0)
        names = ast.literal_eval(src[i0 + 8:i1 + 1])
        atlas(names, os.path.join(ROOT, 'public', 'assets', 'landmarks', 'ferry', 'ferry_int_signs.png'))
