# Downloads the CC0 (public domain) PBR materials (ambientCG) and HDRI skies (Poly Haven) used by the game into
# public/assets/. Re-running skips files that already exist. Writes public/assets/manifest.json + ASSET_LICENSES.md.
import io, json, os, sys, urllib.request, zipfile

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
TEX = os.path.join(ROOT, 'tex')
HDR = os.path.join(ROOT, 'hdri')
UA = {'User-Agent': 'Mozilla/5.0 (hillbomb-sf asset fetch)'}

# key: (ambientCG id, resolution). Keys are what the game code uses.
MATERIALS = {
    'asphalt':        ('Asphalt031', '2K'),
    'brick_red':      ('Bricks075A', '2K'),
    'concrete':       ('Concrete034', '2K'),
    'brick_tan':      ('Bricks101', '1K'),
    'siding':         ('WoodSiding008', '1K'),
    'stucco':         ('Plaster001', '1K'),
    'painted_plaster':('PaintedPlaster017', '1K'),
    'concrete_rough': ('Concrete046', '1K'),
    'paving':         ('PavingStones128', '1K'),
    'gravel_roof':    ('Gravel023', '1K'),
    'grass':          ('Grass004', '1K'),
    'forest_floor':   ('Ground037', '1K'),
    'sand':           ('Ground054', '1K'),
    'rock':           ('Rock035', '1K'),
    'metal':          ('Metal032', '1K'),
    'corrugated':     ('CorrugatedSteel009', '1K'),
    'roof_tiles':     ('RoofingTiles013A', '1K'),
    'wood_floor':     ('WoodFloor051', '1K'),
    'fabric':         ('Fabric030', '1K'),
    'tiles':          ('Tiles107', '1K'),
    'marble':         ('Marble012', '1K'),
    'carpet':         ('Carpet016', '1K'),
    'leather':        ('Leather037', '1K'),
    'bark':           ('Bark014', '1K'),
    'cliff_rock':     ('Rock051', '1K'),
}
# ambientCG HDRIs (4K EXR -> RGBE .hdr at 4k + 2k via tools/.venv-blender bpy, see tools/blender/). Kept in the manifest by hand:
# evening_storm_4k / evening_storm_2k = EveningSkyHDRI030B
HDRIS = {
    'sunrise': 'qwantani_sunrise_puresky', 'morning': 'qwantani_morning_puresky', 'noon': 'kloofendal_48d_partly_cloudy_puresky',
    'afternoon': 'kloofendal_38d_partly_cloudy_puresky', 'sunset': 'qwantani_sunset_puresky', 'dusk': 'qwantani_dusk_2_puresky',
    'night': 'qwantani_night_puresky',
}
MAPS = {'Color': 'color.jpg', 'NormalGL': 'normal.jpg', 'Roughness': 'rough.jpg', 'AmbientOcclusion': 'ao.jpg', 'Metalness': 'metal.jpg'}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def main():
    os.makedirs(TEX, exist_ok=True); os.makedirs(HDR, exist_ok=True)
    manifest = {'materials': {}, 'hdri': {}}
    total = 0
    for key, (aid, res) in MATERIALS.items():
        d = os.path.join(TEX, key)
        os.makedirs(d, exist_ok=True)
        have = [f for f in MAPS.values() if os.path.exists(os.path.join(d, f))]
        if 'color.jpg' not in have:
            url = f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip'
            data = get(url)
            z = zipfile.ZipFile(io.BytesIO(data))
            for name in z.namelist():
                for suffix, out in MAPS.items():
                    if name.endswith(f'_{suffix}.jpg'):
                        with open(os.path.join(d, out), 'wb') as f: f.write(z.read(name))
            print(f'{key:16s} {aid} {res}  {len(data)/1e6:.1f} MB zip', flush=True)
        maps = [k for k, f in MAPS.items() if os.path.exists(os.path.join(d, f))]
        size = sum(os.path.getsize(os.path.join(d, f)) for f in MAPS.values() if os.path.exists(os.path.join(d, f)))
        total += size
        manifest['materials'][key] = {'source': 'ambientCG', 'id': aid, 'res': res, 'maps': [MAPS[m][:-4] for m in maps], 'url': f'https://ambientcg.com/view?id={aid}'}
    for key, name in HDRIS.items():
        out = os.path.join(HDR, key + '.hdr')
        if not os.path.exists(out):
            data = get(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/{name}_2k.hdr')
            with open(out, 'wb') as f: f.write(data)
            print(f'hdri {key:10s} {name}  {len(data)/1e6:.1f} MB', flush=True)
        total += os.path.getsize(out)
        manifest['hdri'][key] = {'source': 'Poly Haven', 'id': name, 'res': '2k', 'url': f'https://polyhaven.com/a/{name}'}
    for k in ('evening_storm_4k', 'evening_storm_2k'):
        if os.path.exists(os.path.join(HDR, k + '.hdr')): manifest['hdri'][k] = {'source': 'ambientCG', 'id': 'EveningSkyHDRI030B', 'res': k[-2:], 'url': 'https://ambientcg.com/view?id=EveningSkyHDRI030B'}
    with open(os.path.join(ROOT, 'manifest.json'), 'w') as f: json.dump(manifest, f, indent=1)
    lines = ['# Third-party assets (all CC0 / public domain)', '',
             'PBR materials from ambientCG (https://ambientcg.com, CC0 1.0) and HDRI skies from Poly Haven (https://polyhaven.com, CC0 1.0).', '']
    for k, m in manifest['materials'].items(): lines.append(f'* `tex/{k}`: ambientCG **{m["id"]}** ({m["res"]}), {m["url"]}')
    for k, m in manifest['hdri'].items(): lines.append(f'* `hdri/{k}.hdr`: {m["source"]} **{m["id"]}** ({m["res"]}), {m["url"]}')
    with open(os.path.join(ROOT, 'ASSET_LICENSES.md'), 'w') as f: f.write('\n'.join(lines) + '\n')
    print(f'TOTAL on disk: {total/1e6:.1f} MB')

if __name__ == '__main__':
    main()
