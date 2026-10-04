"""Stitch the car pass 4 frame strips (shots/car4_<name>_<suffix>_<k>.jpg) into shots/car4_<name>_<suffix>.jpg.
   python dev/car4_sheet.py before|after"""
import sys, os, glob
from PIL import Image
suf = sys.argv[1] if len(sys.argv) > 1 else 'after'
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shots')
for name in ('doors_enter', 'doors_exit', 'cockpit_night', 'cockpit_day', 'ev_tail_night', 'parked_street'):
    fs = sorted(glob.glob(os.path.join(S, 'car4_%s_%s_[0-9].jpg' % (name, suf))))
    if not fs: continue
    ims = [Image.open(f).convert('RGB') for f in fs]
    if len(ims) == 1: out = ims[0]
    else:
        cols = 2 if len(ims) in (2, 4) else len(ims)
        w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
        if len(ims) == 2: cols, rows = 2, 1
        out = Image.new('RGB', (w * cols, h * rows), (0, 0, 0))
        for i, im in enumerate(ims): out.paste(im.resize((w, h)), ((i % cols) * w, (i // cols) * h))
    out.save(os.path.join(S, 'car4_%s_%s.jpg' % (name, suf)), quality=88)
    print('car4_%s_%s.jpg' % (name, suf), out.size)
