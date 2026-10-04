"""Original mural atlas for Balmy Alley (plain CPython + Pillow, not Blender).

python tools/blender/hero_murals.py  ->  public/assets/landmarks/balmy/balmy_murals.jpg
Atlas: 2 columns x 4 rows of 512x256 cells (cell k = column k % 2, row k // 2). Every mural is generated here from
simple painted shapes (suns, hills, waves, birds, flowers, stylised faces and hands, pattern borders): original art,
no copies of the real alley's murals. The Blender builder maps each mural panel onto its cell (hero_wave5.mural_uv).
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CW, CH, COLS, ROWS = 512, 256, 2, 4
PALS = [
    [(233, 69, 60), (246, 180, 45), (32, 120, 170), (40, 160, 110), (245, 235, 210), (60, 40, 90)],
    [(250, 120, 40), (220, 50, 110), (70, 60, 170), (250, 210, 70), (30, 170, 170), (20, 30, 50)],
    [(20, 90, 160), (90, 190, 220), (250, 240, 200), (240, 100, 70), (60, 140, 60), (120, 40, 60)],
    [(160, 40, 120), (250, 150, 200), (250, 220, 90), (80, 180, 90), (40, 60, 130), (250, 250, 240)],
]


def sun(d, cx, cy, r, col, ray, R):
    for k in range(18):
        a = 2 * math.pi * k / 18 + R.random() * 0.1
        d.polygon([(cx + math.cos(a - 0.08) * r * 1.1, cy + math.sin(a - 0.08) * r * 1.1), (cx + math.cos(a) * r * 1.7, cy + math.sin(a) * r * 1.7),
                   (cx + math.cos(a + 0.08) * r * 1.1, cy + math.sin(a + 0.08) * r * 1.1)], fill=ray)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)


def hills(d, y, col, R, amp=40, n=5):
    pts = [(0, CH)]
    for i in range(n + 1):
        pts.append((i * CW / n, y - R.random() * amp))
    pts.append((CW, CH))
    d.polygon(pts, fill=col)


def waves(d, y, col, col2, R):
    for k in range(4):
        yy = y + k * 14
        pts = [(0, CH)] + [(x, yy + math.sin(x / 26.0 + k) * 7) for x in range(0, CW + 8, 8)] + [(CW, CH)]
        d.polygon(pts, fill=col if k % 2 == 0 else col2)


def flower(d, cx, cy, r, col, core):
    for k in range(7):
        a = 2 * math.pi * k / 7
        px, py = cx + math.cos(a) * r * 0.7, cy + math.sin(a) * r * 0.7
        d.ellipse([px - r * 0.45, py - r * 0.45, px + r * 0.45, py + r * 0.45], fill=col)
    d.ellipse([cx - r * 0.35, cy - r * 0.35, cx + r * 0.35, cy + r * 0.35], fill=core)


def bird(d, cx, cy, s, col):
    d.line([(cx - s, cy), (cx - s * 0.3, cy - s * 0.45), (cx, cy)], fill=col, width=4)
    d.line([(cx, cy), (cx + s * 0.3, cy - s * 0.45), (cx + s, cy)], fill=col, width=4)


def face(d, cx, cy, r, skin, hair, eye, R):
    d.ellipse([cx - r * 1.15, cy - r * 1.25, cx + r * 1.15, cy + r * 0.6], fill=hair)
    d.ellipse([cx - r, cy - r, cx + r, cy + r * 1.1], fill=skin)
    for s in (-1, 1):
        d.ellipse([cx + s * r * 0.4 - r * 0.14, cy - r * 0.15, cx + s * r * 0.4 + r * 0.14, cy + r * 0.05], fill=eye)
        d.arc([cx + s * r * 0.4 - r * 0.22, cy - r * 0.42, cx + s * r * 0.4 + r * 0.22, cy - r * 0.1], 200, 340, fill=eye, width=3)
    d.arc([cx - r * 0.35, cy + r * 0.25, cx + r * 0.35, cy + r * 0.7], 20, 160, fill=eye, width=4)


def border(d, col, col2):
    for x in range(0, CW, 24):
        d.polygon([(x, 0), (x + 12, 14), (x + 24, 0)], fill=col)
        d.polygon([(x, CH), (x + 12, CH - 14), (x + 24, CH)], fill=col2)


def mural(k):
    R = random.Random(1000 + k * 37)
    P = PALS[(k + (k // 4) * 2) % len(PALS)]
    im = Image.new('RGB', (CW, CH), P[4])
    d = ImageDraw.Draw(im)
    # sky bands
    for i in range(6):
        c = tuple(int(P[2][j] * (1 - i / 7) + P[4][j] * (i / 7)) for j in range(3))
        d.rectangle([0, i * 26, CW, (i + 1) * 26], fill=c)
    theme = k % 4
    if theme == 0:
        sun(d, 380 if k < 4 else 130, 70, 38, P[1], P[0], R)
        hills(d, 170, P[3], R); hills(d, 205, P[5], R, amp=25, n=7)
        for i in range(6): bird(d, 60 + i * 45, 50 + R.random() * 40, 14, P[5])
        for i in range(5): flower(d, 40 + i * 110, 225, 18, P[0 if i % 2 else 1], P[4])
    elif theme == 1:
        waves(d, 150, P[2], P[4] if k % 2 else P[3], R)
        sun(d, 110 if k < 4 else 400, 80, 44, P[1], P[0], R)
        face(d, 360 if k < 4 else 150, 110, 62, (196, 140, 100) if k < 4 else (150, 100, 70), P[5], (30, 20, 20), R)
        for i in range(4): bird(d, 200 + i * 30, 40 + i * 8, 12, P[4])
    elif theme == 2:
        d.rectangle([0, 0, CW, CH], fill=P[5])
        for i in range(9):
            flower(d, R.randint(20, CW - 20), R.randint(30, CH - 30), R.randint(18, 40), P[R.randrange(4)], P[4])
        for s in (-1, 1):   # two raised hands reaching to a sun in the middle
            x0 = 256 + s * 150
            tip = (x0 + 30 * -s, 112)
            d.polygon([(x0 - 22, CH), (x0 + 22, CH), (tip[0] + 12, tip[1] + 6), (tip[0] - 12, tip[1] - 2)], fill=(196, 140, 100))
            d.ellipse([tip[0] - 20, tip[1] - 30, tip[0] + 20, tip[1] + 6], fill=(196, 140, 100))
            for f in range(4):
                fx = tip[0] - 15 + f * 10
                d.rounded_rectangle([fx - 4, tip[1] - 58 + abs(f - 1.5) * 6, fx + 4, tip[1] - 22], radius=4, fill=(196, 140, 100))
        sun(d, 256, 80, 36, P[1], P[0], R)
    else:
        for i in range(8):
            d.rectangle([i * 64, 0, (i + 1) * 64, CH], fill=P[i % 4])
        for i in range(8):
            cx = i * 64 + 32
            d.ellipse([cx - 24, 90, cx + 24, 138], fill=P[4])
            d.polygon([(cx, 60), (cx + 18, 90), (cx - 18, 90)], fill=P[5])
        face(d, 256, 190, 40, (170, 110, 80), P[5], (20, 15, 15), R)
    border(d, P[0], P[1])
    # painted-wall texture: speckle + a slight blur so edges read as brushed paint
    px = im.load()
    for _ in range(9000):
        x, y = R.randrange(CW), R.randrange(CH)
        c = px[x, y]; f = 0.85 + R.random() * 0.25
        px[x, y] = tuple(max(0, min(255, int(v * f))) for v in c)
    return im.filter(ImageFilter.GaussianBlur(0.7))


if __name__ == '__main__':
    atlas = Image.new('RGB', (CW * COLS, CH * ROWS))
    for k in range(COLS * ROWS):
        atlas.paste(mural(k), ((k % COLS) * CW, (k // COLS) * CH))
    out = os.path.join(ROOT, 'public', 'assets', 'landmarks', 'balmy', 'balmy_murals.jpg')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    atlas.save(out, quality=86)
    print('murals', out, os.path.getsize(out) // 1024, 'KB')
