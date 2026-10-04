# dev: contact sheet of shots.  python dev/sheet.py out.jpg cols w a.jpg b.jpg ...
import sys
from PIL import Image
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = [Image.open(p).convert('RGB') for p in sys.argv[4:]]
h = round(w * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h))
for k, im in enumerate(ims):
    S.paste(im.resize((w, h), Image.LANCZOS), ((k % cols) * w, (k // cols) * h))
S.save(out, quality=85)
