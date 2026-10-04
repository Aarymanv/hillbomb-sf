# dev: 2x2 comparison panel (each image cover-cropped to 16:9).  python dev/quad.py out.jpg a b c d [--w 1280]
import sys
from PIL import Image
args = sys.argv[1:]
W = 1280
if '--w' in args:
    k = args.index('--w'); W = int(args[k + 1]); del args[k:k + 2]
out, ims = args[0], args[1:5]
pw, ph = W // 2, W * 9 // 32
S = Image.new('RGB', (pw * 2, ph * 2))
for k, p in enumerate(ims):
    im = Image.open(p).convert('RGB')
    s = max(pw / im.width, ph / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x0, y0 = (im.width - pw) // 2, (im.height - ph) // 2
    S.paste(im.crop((x0, y0, x0 + pw, y0 + ph)), ((k % 2) * pw, (k // 2) * ph))
S.save(out, quality=88)
