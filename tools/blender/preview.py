"""Contact sheet for review: public/assets/baked/rooms_preview.png

Rooms (day | night, 256 px tiles) on top, shops (day | night, 512x256 tiles) below, each
tile labelled with its atlas index and name.  Reads the baked atlases + json only.
Run: tools/.venv-blender/Scripts/python tools/blender/preview.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import hb_lib as L


def down2(a):
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    a = a[:h, :w]
    return 0.25 * (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2])


def label_tiles(img, meta, cols, tw, th):
    for m in meta:
        x0, y0 = m['col'] * tw, m['row'] * th
        txt = '%d %s' % (m['index'], m['name'].replace('_', ' '))
        w = len(txt) * 12 + 8
        img[y0 + 4:y0 + 22, x0 + 4:x0 + 4 + w] *= 0.35
        L.draw_text(img, txt, x0 + 8, y0 + 6, 2, (1, 1, 1))
        # tile grid lines
        img[y0:y0 + th, x0:x0 + 1] = 0.0
        img[y0:y0 + 1, x0:x0 + tw] = 0.0
    return img


def main():
    B = L.BAKED
    rd = down2(L.load_png(os.path.join(B, 'rooms_day.jpg')))
    rn = down2(L.load_png(os.path.join(B, 'rooms_night.jpg')))
    sd = down2(L.load_png(os.path.join(B, 'shops.jpg')))
    sn = down2(L.load_png(os.path.join(B, 'shops_night.jpg')))
    rm = json.load(open(os.path.join(B, 'rooms.json')))
    sm = json.load(open(os.path.join(B, 'shops.json')))
    for a in (rd, rn):
        label_tiles(a, rm, 4, 256, 256)
    for a in (sd, sn):
        label_tiles(a, sm, 2, 512, 256)
    gap, head = 16, 40
    Wd = 1024 * 2 + gap * 3
    Ht = head + 1024 + head + 1024 + gap * 2
    sheet = np.full((Ht, Wd, 3), 0.12, np.float32)
    y = 0
    L.draw_text(sheet, 'ROOMS DAY  (4X4, 512 PX TILES)', gap, y + 12, 2, (0.9, 0.9, 0.9))
    L.draw_text(sheet, 'ROOMS NIGHT', gap * 2 + 1024, y + 12, 2, (0.9, 0.9, 0.9))
    y += head
    sheet[y:y + 1024, gap:gap + 1024] = rd
    sheet[y:y + 1024, gap * 2 + 1024:gap * 2 + 2048] = rn
    y += 1024 + gap
    L.draw_text(sheet, 'SHOPS DAY  (2X4, 1024X512 TILES)', gap, y + 12, 2, (0.9, 0.9, 0.9))
    L.draw_text(sheet, 'SHOPS NIGHT', gap * 2 + 1024, y + 12, 2, (0.9, 0.9, 0.9))
    y += head
    sheet[y:y + 1024, gap:gap + 1024] = sd
    sheet[y:y + 1024, gap * 2 + 1024:gap * 2 + 2048] = sn
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'shots', 'rooms_preview.png')   # review only, not shipped
    L.save_image(out, sheet, 'PNG')
    print('[preview] wrote', out, sheet.shape)


if __name__ == '__main__':
    main()
