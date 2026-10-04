# Re-download selected ambientCG (CC0) materials at higher resolution and store them as quality JPEGs in public/assets/tex/<key>/.
import io, json, os, sys, urllib.request, zipfile
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
UP = {  # key: (ambientCG id, res)
  'asphalt': ('Asphalt031', '4K'), 'brick_red': ('Bricks075A', '2K'), 'brick_tan': ('Bricks101', '2K'), 'siding': ('WoodSiding008', '2K'),
  'stucco': ('Plaster001', '2K'), 'painted_plaster': ('PaintedPlaster017', '2K'), 'concrete_rough': ('Concrete046', '2K'), 'paving': ('PavingStones128', '2K'),
  'gravel_roof': ('Gravel023', '2K'), 'roof_tiles': ('RoofingTiles013A', '2K'), 'metal': ('Metal032', '2K'), 'corrugated': ('CorrugatedSteel009', '2K'),
  'marble': ('Marble012', '2K'), 'tiles': ('Tiles107', '2K'), 'concrete': ('Concrete034', '2K'), 'wood_floor': ('WoodFloor051', '2K'),
}
MAPS = {'Color': 'color', 'NormalGL': 'normal', 'Roughness': 'rough', 'AmbientOcclusion': 'ao', 'Metalness': 'metal'}
UA = {'User-Agent': 'Mozilla/5.0 (hillbomb-sf asset fetch)'}
M = json.load(open(os.path.join(ROOT, 'manifest.json')))
tot = 0
for key, (aid, res) in UP.items():
    url = f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip'
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
    z = zipfile.ZipFile(io.BytesIO(data)); d = os.path.join(ROOT, 'tex', key); os.makedirs(d, exist_ok=True)
    for name in z.namelist():
        for suf, out in MAPS.items():
            if name.endswith(f'_{suf}.jpg'):
                im = Image.open(io.BytesIO(z.read(name)))
                im = im.convert('L') if out in ('rough', 'ao', 'metal') else im.convert('RGB')
                im.save(os.path.join(d, out + '.jpg'), quality=92 if out == 'normal' else 88, optimize=True)
    sz = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d)); tot += sz
    if key in M['materials']: M['materials'][key]['res'] = res
    print(f'{key:16s} {aid} {res} zip {len(data)/1e6:.0f} MB -> {sz/1e6:.1f} MB', flush=True)
json.dump(M, open(os.path.join(ROOT, 'manifest.json'), 'w'), indent=1)
print(f'total upgraded {tot/1e6:.1f} MB')
