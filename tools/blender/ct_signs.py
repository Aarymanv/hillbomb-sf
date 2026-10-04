"""Chinatown hero set textures (plain CPython + Pillow, not Blender): shop-sign atlas + shop-interior atlas.

python tools/blender/ct_signs.py  ->  public/assets/landmarks/ct/ct_signs.png   (2048 x 2048 RGBA)
                                      public/assets/landmarks/ct/ct_shops.jpg   (2048 x 1024 RGB)
Sign atlas: rows 0..11 = wide box-lit / neon fascia signs, 2 columns of 1024 x 128 (cell k = SIGNS[k]);
y 1536..2048 = 16 vertical blade signs of 128 x 512 (BLADES[k]). The texture is both albedo and emission (night).
Shop atlas: 4 x 2 cells of 512 x 512 = back walls seen through the shop glass (SHOPS order), all brightly lit.
Every name is fictional. Fonts (SIL OFL, tools/blender/_cache/fonts): Noto Sans TC / Noto Serif TC / LXGW WenKai TC,
Oswald, Bebas Neue (public/assets/ASSET_LICENSES.md).
"""
import os, sys, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FD = os.path.join(HERE, '_cache', 'fonts')
OUT = os.path.join(ROOT, 'public', 'assets', 'landmarks', 'ct')

# (english, chinese, style, sub) - style: red | green | black (neon) | white | yellow | jade | maroon | blue
SIGNS = [
    ('WAH MEI NOODLES', '華美麵家', 'red', 'NOODLES · WONTON · CONGEE'),
    ('DOUBLE HAPPINESS', '雙喜酒家', 'black', 'AUTHENTIC CANTONESE'),
    ('OCEAN PEARL SEAFOOD', '海珠海鮮', 'green', 'LIVE SEAFOOD'),
    ('GOLDEN LOTUS DIM SUM', '金蓮點心', 'yellow', 'DIM SUM · TO GO'),
    ('WANG\'S HERBS', '王記藥材', 'jade', 'GINSENG · HERBS · TEA'),
    ('LUCKY DRAGON BAKERY', '福龍餅家', 'red', 'EGG TARTS · MOON CAKES'),
    ('JADE PALACE', '玉宮酒家', 'black', 'BANQUET HALL UPSTAIRS'),
    ('NEW CANTON BBQ', '新廣州燒臘', 'white', 'ROAST DUCK · BBQ PORK'),
    ('PEARL RIVER GIFTS', '珠江禮品', 'maroon', 'SOUVENIRS · SILK · JADE'),
    ('SUN WAH MARKET', '新華市場', 'green', 'PRODUCE · GROCERY'),
    ('GREAT STAR JEWELRY', '大星珠寶', 'blue', '24K GOLD · JADE'),
    ('GOLDEN PHOENIX', '金鳳餐廳', 'red', 'AUTHENTIC CUISINE'),
    ('PHOENIX TEA HOUSE', '鳳凰茶樓', 'black', 'FINE CHINESE TEAS'),
    ('WING FAT TRADING', '永發貿易', 'yellow', 'IMPORT · EXPORT'),
    ('KOW LOON CAFE', '九龍冰室', 'white', 'MILK TEA · PINEAPPLE BUNS'),
    ('ORIENT SILK & GIFTS', '東方絲綢', 'maroon', 'SILK ROBES · FANS'),
    ('HAPPY GARDEN', '快樂園', 'green', 'RESTAURANT'),
    ('FOUR SEAS', '四海酒家', 'red', 'SEAFOOD RESTAURANT'),
    ('RED LANTERN GIFTS', '紅燈籠禮品', 'black', 'LANTERNS · SOUVENIRS'),
    ('TAI SHAN HARDWARE', '台山五金', 'blue', 'KITCHENWARE'),
    ('BAMBOO HOUSE', '竹園', 'jade', 'NOODLE HOUSE'),
    ('PEACE HARMONY TEA', '和平茶莊', 'yellow', 'OOLONG · PU-ERH'),
    ('KAM LUN BAKERY', '金倫餅家', 'red', 'FRESH DAILY'),
    ('GOLDEN DRAGON', '金龍酒家', 'black', 'COCKTAILS · KARAOKE'),
]
BLADES = ['酒家', '茶樓', '飯店', '點心', '餅家', '藥材', '旅館', '金龍', '海鮮', '珠寶', '麵家', '燒臘', '雙喜', '禮品', '冰室', '當舖']
BLADE_STYLE = ['red', 'black', 'green', 'yellow', 'black', 'jade', 'white', 'red', 'blue', 'maroon', 'red', 'black', 'red', 'yellow', 'green', 'black']
SHOPS = ['grocery', 'herbs', 'bakery', 'gifts', 'restaurant', 'jewelry', 'tea', 'bbq']

STY = {   # bg, text, accent (cn), border, neon(bool)
    'red': ((176, 22, 20), (255, 226, 120), (255, 214, 90), (236, 186, 60), False),
    'green': ((12, 92, 52), (250, 250, 236), (255, 210, 70), (232, 196, 80), False),
    'black': ((14, 10, 12), (255, 70, 60), (255, 186, 60), (255, 60, 60), True),
    'white': ((246, 240, 226), (190, 20, 24), (28, 120, 60), (190, 20, 24), False),
    'yellow': ((250, 200, 40), (180, 14, 18), (180, 14, 18), (140, 20, 20), False),
    'jade': ((20, 110, 96), (255, 240, 200), (255, 220, 120), (240, 210, 120), False),
    'maroon': ((110, 16, 26), (255, 230, 170), (255, 200, 80), (230, 180, 70), False),
    'blue': ((20, 40, 120), (255, 255, 255), (255, 210, 80), (255, 210, 80), False),
}


def F(name, px, var=None):
    f = ImageFont.truetype(os.path.join(FD, name), px)
    if var:
        try: f.set_variation_by_axes([var])
        except Exception: pass
    return f


def fit(d, s, fname, px, maxw, maxh, var=None):
    while px > 10:
        f = F(fname, px, var); bb = d.textbbox((0, 0), s, font=f)
        if bb[2] - bb[0] <= maxw and bb[3] - bb[1] <= maxh: return f, bb
        px -= 2
    f = F(fname, px, var); return f, d.textbbox((0, 0), s, font=f)


def neon_text(im, xy, s, f, col, glow=6):
    """neon tube look: blurred halo + bright core"""
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); dl = ImageDraw.Draw(lay)
    dl.text(xy, s, font=f, fill=col + (255,), stroke_width=3, stroke_fill=col + (255,))
    halo = lay.filter(ImageFilter.GaussianBlur(glow))
    im.alpha_composite(halo); im.alpha_composite(halo)
    core = Image.new('RGBA', im.size, (0, 0, 0, 0)); dc = ImageDraw.Draw(core)
    w = tuple(min(255, int(c * 0.35 + 255 * 0.65)) for c in col)
    dc.text(xy, s, font=f, fill=w + (255,))
    im.alpha_composite(core)


def wide_sign(en, cn, style, sub, W=1024, H=128):
    bg, tc, ac, bc, neon = STY[style]
    im = Image.new('RGBA', (W, H), bg + (255,)); d = ImageDraw.Draw(im)
    # subtle vertical gradient (box-lit sheet brighter in the middle)
    for y in range(H):
        k = 0.86 + 0.14 * math.sin(math.pi * y / H)
        d.line([(0, y), (W, y)], fill=tuple(int(c * k) for c in bg) + (255,))
    d.rectangle([3, 3, W - 4, H - 4], outline=bc + (255,), width=4)
    if not neon: d.rectangle([11, 11, W - 12, H - 12], outline=tuple(int(c * 0.7) for c in bc) + (255,), width=1)
    cnf = 'WenKaiTC-Bold.ttf' if style in ('red', 'maroon', 'jade', 'yellow') else 'NotoSansTC.ttf'
    # chinese block on the left (or right for some), english big, sub line small
    right = (hash(en) & 1) == 1 and len(cn) <= 3
    cw = int(H * 0.82 * len(cn) * 0.95)
    fc, bb = fit(d, cn, cnf, int(H * 0.78), min(cw, 330), int(H * 0.78), ('wght', 900) if cnf == 'NotoSansTC.ttf' else None)
    cx = (W - 24 - (bb[2] - bb[0])) if right else 22
    cy = (H - (bb[3] - bb[1])) // 2 - bb[1]
    if neon: neon_text(im, (cx, cy), cn, fc, ac)
    else:
        d.text((cx + 2, cy + 3), cn, font=fc, fill=(0, 0, 0, 90)); d.text((cx, cy), cn, font=fc, fill=ac + (255,))
    x0 = 22 + (0 if right else (bb[2] - bb[0]) + 26); x1 = (W - 22 - (bb[2] - bb[0]) - 26) if right else W - 22
    ef, eb = fit(d, en, 'Oswald.ttf', 78, x1 - x0, 74 if sub else 92, ('wght', 650))
    ex = x0 + (x1 - x0 - (eb[2] - eb[0])) // 2 - eb[0]; ey = (12 if sub else (H - (eb[3] - eb[1])) // 2) - eb[1] + (4 if sub else 0)
    if neon: neon_text(im, (ex, ey), en, ef, tc)
    else:
        d.text((ex + 2, ey + 3), en, font=ef, fill=(0, 0, 0, 80)); d.text((ex, ey), en, font=ef, fill=tc + (255,))
    if sub:
        sf, sb = fit(d, sub, 'Oswald.ttf', 26, x1 - x0, 26, ('wght', 500))
        sx = x0 + (x1 - x0 - (sb[2] - sb[0])) // 2 - sb[0]; sy = H - 14 - (sb[3] - sb[1]) - sb[1]
        if neon: neon_text(im, (sx, sy), sub, sf, ac, glow=3)
        else: d.text((sx, sy), sub, font=sf, fill=ac + (255,) if style not in ('white', 'yellow') else tc + (255,))
    return im


def blade(cn, style, W=128, H=512):
    bg, tc, ac, bc, neon = STY[style]
    im = Image.new('RGBA', (W, H), bg + (255,)); d = ImageDraw.Draw(im)
    d.rectangle([3, 3, W - 4, H - 4], outline=bc + (255,), width=5)
    n = len(cn); ch = (H - 30) // n
    for k, c in enumerate(cn):
        f, bb = fit(d, c, 'NotoSerifTC.ttf' if k % 2 else 'NotoSansTC.ttf', min(ch - 6, 104), W - 22, ch - 8, ('wght', 900))
        x = (W - (bb[2] - bb[0])) // 2 - bb[0]; y = 15 + k * ch + (ch - (bb[3] - bb[1])) // 2 - bb[1]
        if neon: neon_text(im, (x, y), c, f, tc, glow=5)
        else: d.text((x, y), c, font=f, fill=(ac if style in ('red', 'green', 'maroon', 'jade', 'blue') else tc) + (255,))
    return im


# ------------------------------------------------------------------------------------------ shop interiors
def shop_cell(kind, S=512, seed=1):
    R = random.Random(seed)
    im = Image.new('RGB', (S, S), (230, 220, 200)); d = ImageDraw.Draw(im)
    wall = {'grocery': (226, 224, 210), 'herbs': (120, 70, 40), 'bakery': (246, 232, 206), 'gifts': (170, 30, 30), 'restaurant': (210, 180, 140),
            'jewelry': (40, 30, 30), 'tea': (130, 90, 50), 'bbq': (236, 220, 196)}[kind]
    d.rectangle([0, 0, S, S], fill=wall)
    # ceiling strip lights (top) + floor (bottom)
    d.rectangle([0, 0, S, 40], fill=tuple(int(c * 0.9) for c in wall))
    for x in range(30, S, 120): d.rectangle([x, 14, x + 70, 24], fill=(255, 252, 240))
    d.rectangle([0, S - 60, S, S], fill=(150, 140, 130) if kind != 'jewelry' else (60, 50, 50))
    pal = [(220, 40, 40), (250, 200, 40), (60, 140, 70), (240, 120, 40), (60, 90, 170), (250, 250, 240), (200, 60, 120), (120, 70, 40)]
    if kind in ('grocery', 'tea', 'gifts', 'herbs'):
        y = 60
        while y < S - 120:
            sh = R.randint(56, 80)
            d.rectangle([10, y + sh - 6, S - 10, y + sh], fill=(110, 90, 70))
            x = 14
            while x < S - 30:
                w = R.randint(14, 38) if kind != 'herbs' else 44; h = R.randint(22, sh - 10)
                c = R.choice(pal) if kind != 'herbs' else (160 + R.randint(-20, 20), 110, 60)
                if kind == 'herbs':
                    d.rectangle([x, y + 6, x + w - 3, y + sh - 8], fill=(140, 80, 40), outline=(90, 50, 25))
                    d.ellipse([x + w // 2 - 4, y + sh // 2 - 4, x + w // 2 + 3, y + sh // 2 + 3], fill=(230, 200, 120))
                elif kind == 'tea':
                    d.rectangle([x, y + sh - 6 - h, x + w - 3, y + sh - 6], fill=c); d.rectangle([x, y + sh - 6 - h, x + w - 3, y + sh - 6 - h + 6], fill=(220, 190, 90))
                else:
                    d.rectangle([x, y + sh - 6 - h, x + w - 3, y + sh - 6], fill=c)
                    if R.random() < 0.5: d.rectangle([x + 3, y + sh - 6 - h + 5, x + w - 6, y + sh - 6 - h + 10], fill=(255, 255, 255))
                x += w
            y += sh + 4
        if kind == 'gifts':
            for k in range(6):
                cx = R.randint(40, S - 40); d.ellipse([cx - 18, 44, cx + 18, 86], fill=(230, 30, 30)); d.line([(cx, 40), (cx, 46)], fill=(240, 200, 60), width=3)
    elif kind in ('bakery', 'jewelry'):
        # menu boards / mirrored back + lit glass counter
        for k in range(3):
            x = 20 + k * 165; d.rectangle([x, 60, x + 150, 200], fill=(30, 26, 22) if kind == 'bakery' else (70, 60, 60))
            for j in range(7): d.line([(x + 12, 76 + j * 17), (x + 12 + R.randint(60, 125), 76 + j * 17)], fill=(250, 240, 200), width=4)
        d.rectangle([0, 300, S, S - 60], fill=(250, 246, 236) if kind == 'bakery' else (230, 230, 240))
        for k in range(26):
            x = R.randint(10, S - 40); y = R.randint(320, S - 90)
            c = (240, 180, 60) if kind == 'bakery' else (255, 220, 100) if R.random() < 0.6 else (80, 200, 120)
            d.ellipse([x, y, x + 26, y + 16], fill=c)
    elif kind in ('restaurant', 'bbq'):
        # menu board, hanging roast ducks (bbq), round tables
        d.rectangle([30, 56, S - 30, 150], fill=(160, 20, 20))
        for j in range(4): d.line([(50, 74 + j * 20), (S - 60 - R.randint(0, 120), 74 + j * 20)], fill=(255, 220, 120), width=6)
        if kind == 'bbq':
            d.line([(20, 180), (S - 20, 180)], fill=(160, 160, 160), width=4)
            for k in range(8):
                x = 40 + k * 58; d.polygon([(x, 182), (x + 30, 182), (x + 36, 260), (x + 15, 290), (x - 6, 260)], fill=(150 + R.randint(-20, 20), 60, 20))
            d.rectangle([0, 330, S, S - 60], fill=(240, 240, 236))
        else:
            for k in range(4):
                x = 40 + k * 120; d.ellipse([x, 330, x + 90, 370], fill=(250, 250, 250)); d.rectangle([x + 40, 368, x + 50, S - 60], fill=(90, 60, 40))
                for j in (-1, 1): d.rectangle([x + 45 + j * 52, 330, x + 45 + j * 52 + 12, S - 70], fill=(140, 30, 30))
    # lighting: warm ceiling light pools (bright top-centre, darker corners / floor), slight blur (seen through glass)
    import numpy as np
    a = np.asarray(im, np.float32) / 255.0
    yy, xx = np.mgrid[0:S, 0:S] / S
    pool = 0.45 + 0.75 * np.exp(-(((xx - 0.5) / 0.55) ** 2 + ((yy - 0.25) / 0.6) ** 2))
    pool *= 1.0 - 0.35 * np.clip((yy - 0.75) / 0.25, 0, 1)
    a = a * pool[:, :, None] * np.array([1.0, 0.9, 0.76])[None, None, :]
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    A = Image.new('RGBA', (2048, 2048), (0, 0, 0, 255))
    for k, (en, cn, st, sub) in enumerate(SIGNS):
        A.paste(wide_sign(en, cn, st, sub), ((k % 2) * 1024, (k // 2) * 128))
    for k, cn in enumerate(BLADES):
        A.paste(blade(cn, BLADE_STYLE[k]), (k * 128, 1536))
    A.convert('RGB').save(os.path.join(OUT, 'ct_signs.png'), optimize=True)
    B = Image.new('RGB', (2048, 1024))
    for k, kind in enumerate(SHOPS):
        B.paste(shop_cell(kind, seed=k + 3), ((k % 4) * 512, (k // 4) * 512))
    B.save(os.path.join(OUT, 'ct_shops.jpg'), quality=90)
    print('ct_signs.png', os.path.getsize(os.path.join(OUT, 'ct_signs.png')) // 1024, 'KB; ct_shops.jpg', os.path.getsize(os.path.join(OUT, 'ct_shops.jpg')) // 1024, 'KB')


if __name__ == '__main__':
    main()
