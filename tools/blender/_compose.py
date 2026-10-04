import sys
from PIL import Image
fs = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in fs]
w, h = ims[0].size; c = 2 if len(ims) > 1 else 1; r = (len(ims) + c - 1) // c
S = Image.new('RGB', (w * c, h * r))
for i, im in enumerate(ims): S.paste(im, ((i % c) * w, (i // c) * h))
S.save(sys.argv[1], quality=85)
