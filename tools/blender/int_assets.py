"""Interior asset library: CC0 PBR materials (ambientCG, Poly Haven) + Poly Haven furniture models (plain python).

Materials -> public/assets/landmarks/_itex/<key>/{color,rough,normal}.dds + _itex/lib.json
  color: BC1 sRGB 2K (full mips), rough: BC1 linear 1K (G = roughness, B = metalness: glTF ARM order), normal: BC3 "DXT5nm" 1K (X in A, Y in G).
  lib.json: { key: { tile (m per repeat), albedo (linear mean rgb), rough (mean), metal } }  (runtime hero_int.js, bake hero_interior.py)
Models  -> tools/blender/_cache/int_assets/models/<id>/<id>_1k.gltf (+ bin, textures); packed per use by hero_props.py.
Sources + licences are recorded in public/assets/ASSET_LICENSES.md (all CC0).
usage: python tools/blender/int_assets.py [--mats] [--models] [--only key,key]
"""
import io, json, os, sys, zipfile, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from texpack import encode, mip_down, dds   # noqa  (perf pass BC1/BC3 encoder)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'landmarks', '_itex')
SRC = os.path.join(HERE, '_cache', 'int_assets')
LIC = os.path.join(ROOT, 'public', 'assets', 'ASSET_LICENSES.md')
UA = {'User-Agent': 'Mozilla/5.0 (HILLBOMB asset fetch)'}

# key: (source, id, tile metres, metal)
MATS = {
    'marble_white': ('acg', 'Marble012', 2.0, 0), 'marble_cream': ('acg', 'Marble014', 2.0, 0), 'marble_black': ('acg', 'Marble016', 2.0, 0),
    'marble_grey': ('acg', 'Marble023', 2.0, 0), 'marble_siena': ('acg', 'Marble008', 2.0, 0), 'travertine': ('acg', 'Travertine009', 2.4, 0),
    'onyx': ('acg', 'Onyx015', 2.0, 0), 'checker': ('acg', 'Tiles074', 1.2, 0), 'mosaic': ('acg', 'Tiles131', 1.0, 0), 'terrazzo': ('acg', 'Terrazzo019M', 2.0, 0),
    'parquet': ('ph', 'herringbone_parquet', 2.0, 0), 'wood_dark': ('ph', 'dark_wood', 2.0, 0), 'veneer': ('ph', 'rosewood_veneer1', 1.6, 0),
    'cherry': ('ph', 'lacquered_cherry_wood', 1.6, 0), 'wood_floor': ('ph', 'wood_floor', 2.4, 0),
    'carpet_red': ('acg', 'Carpet015', 1.2, 0), 'carpet_blue': ('acg', 'Carpet006', 1.6, 0), 'carpet_beige': ('acg', 'Carpet009', 1.6, 0),
    'velvet': ('ph', 'velour_velvet', 0.8, 0), 'jacquard': ('ph', 'quatrefoil_jacquard_fabric', 0.8, 0), 'leather': ('acg', 'Leather037', 0.8, 0),
    'plaster': ('acg', 'Plaster001', 3.0, 0), 'plaster_ornate': ('ph', 'patterned_plaster_wall', 2.0, 0),
    'brass': ('acg', 'Metal042A', 1.0, 1), 'gold': ('acg', 'Metal048A', 1.0, 1), 'bronze': ('acg', 'Metal008', 1.0, 1),
    'limestone': ('ph', 'large_sandstone_blocks_01', 3.0, 0), 'brick_old': ('ph', 'red_brick_plaster_patch_02', 2.5, 0),
}
# Poly Haven furniture / decor (CC0)
MODELS = ['ArmChair_01', 'GreenChair_01', 'Sofa_01', 'sofa_02', 'sofa_03', 'modern_arm_chair_01', 'mid_century_lounge_chair', 'Ottoman_01',
          'CoffeeTable_01', 'coffee_table_round_01', 'modern_coffee_table_01', 'side_table_01', 'side_table_tall_01', 'WoodenTable_01',
          'round_wooden_table_01', 'dining_table', 'dining_chair_02', 'bar_chair_round_01', 'gallinera_chair', 'gallinera_table',
          'Chandelier_01', 'Chandelier_02', 'Chandelier_03', 'lantern_chandelier_01', 'modern_ceiling_lamp_01', 'hanging_industrial_lamp',
          'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'pachira_aquatica_01', 'calathea_orbifolia_01', 'fern_02', 'planter_box_01',
          'vintage_grandfather_clock_01', 'ornate_mirror_01', 'fancy_picture_frame_01', 'fancy_picture_frame_02', 'marble_bust_01',
          'brass_vase_01', 'ceramic_vase_01', 'CashRegister_01', 'wooden_display_shelves_01', 'ClassicConsole_01', 'painted_wooden_bench',
          'wine_bottles_01', 'CoffeeCart_01', 'wicker_basket_01', 'wooden_crate_01', 'standing_picture_frame_01', 'wall_clock',
          'metal_trash_can', 'tea_set_01', 'decorative_book_set_01', 'brass_candleholders', 'chinese_chandelier', 'gothic_statue',
          'industrial_wall_sconce', 'Television_01', 'bananas', 'lemon', 'croissant', 'strawberry_chocolate_cake', 'CheeseBox_01',
          # round 2: trees for the glasshouses, luggage, vases, art, shelving, office, food, statues, candles
          'island_tree_01', 'island_tree_02', 'island_tree_03', 'jacaranda_tree', 'tree_small_02', 'planter_box_02', 'planter_box_03',
          'vintage_suitcase', 'hand_truck', 'ceramic_vase_02', 'ceramic_vase_03', 'ceramic_vase_04', 'brass_vase_02', 'brass_vase_03',
          'antique_ceramic_vase_01', 'wooden_candlestick', 'hanging_picture_frame_01', 'hanging_picture_frame_02', 'hanging_picture_frame_03',
          'steel_frame_shelves_01', 'steel_frame_shelves_02', 'Shelf_01', 'drawer_cabinet', 'metal_office_desk', 'desk_lamp_arm_01',
          'classic_laptop', 'Television_02', 'food_apple_01', 'food_pears_asian_01', 'food_lime_01', 'hamburger_buns', 'carrot_cake', 'jug_01',
          'wooden_bowl_01', 'cardboard_box_01', 'horse_statue_01', 'bronze_whale_statue', 'bronze_shark_statue', 'bronze_ray_statue',
          'mantel_clock_01', 'lion_head', 'chess_set', 'wooden_stool_01', 'round_wooden_table_02', 'small_wooden_table_01',
          'painted_wooden_cabinet', 'vintage_cabinet_01', 'chinese_screen_panels', 'wicker_basket_02', 'GothicCabinet_01', 'ClassicNightstand_01',
          'wooden_bucket_01', 'vintage_grandfather_clock_01', 'old_bed_frame', 'metal_trash_can', 'can_rusted', 'plastic_crate_01',
          # round 3 (10/03): reading rooms, cafes, lobbies (dress kinds library / cafe / lobby / foyer / science)
          'book_encyclopedia_set_01', 'wooden_bookshelf_worn', 'WoodenChair_01', 'WoodenTable_02', 'modern_coffee_table_02', 'planter_pot_clay',
          'industrial_coffee_table', 'painted_wooden_chair_01', 'metal_stool_02', 'SchoolDesk_01']


def get(url, timeout=120):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def fetch_mat(key):
    src, aid, tile, metal = MATS[key]
    d = os.path.join(SRC, 'mats', key); os.makedirs(d, exist_ok=True)
    have = lambda n: os.path.exists(os.path.join(d, n))
    if src == 'acg':
        if not have('color.jpg'):
            z = zipfile.ZipFile(io.BytesIO(get('https://ambientcg.com/get?file=%s_2K-JPG.zip' % aid)))
            for n in z.namelist():
                low = n.lower()
                for tag, out in (('_color.', 'color.jpg'), ('_normalgl.', 'normal.jpg'), ('_roughness.', 'rough.jpg'), ('_metalness.', 'metal.jpg')):
                    if tag in low: open(os.path.join(d, out), 'wb').write(z.read(n))
        url = 'https://ambientcg.com/view?id=' + aid
    else:
        if not have('color.jpg'):
            f = json.loads(get('https://api.polyhaven.com/files/' + aid))
            for tag, out in (('Diffuse', 'color.jpg'), ('nor_gl', 'normal.jpg'), ('Rough', 'rough.jpg')):
                if tag in f: open(os.path.join(d, out), 'wb').write(get(f[tag]['2k']['jpg']['url']))
            if 'Metal' in f: open(os.path.join(d, 'metal.jpg'), 'wb').write(get(f['Metal']['2k']['jpg']['url']))
        url = 'https://polyhaven.com/a/' + aid
    return key, url


def save_dds(path, img, mode, alpha):
    f = np.asarray(img, np.float32) / 255.0
    f = f[::-1]    # textures are drawn with flipY = true: DDS rows bottom-up
    levels = []
    ok = lambda n: n % 4 == 0 or n <= 2
    while True:
        levels.append(encode(np.round(f * 255), alpha))
        if f.shape[0] == 1 and f.shape[1] == 1: break
        f = mip_down(f, mode)
        if not (ok(f.shape[0]) and ok(f.shape[1])): break
    dds(path, img.width, img.height, levels, alpha)


def to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def pack_mat(key):
    src, aid, tile, metal = MATS[key]
    d = os.path.join(SRC, 'mats', key); o = os.path.join(OUT, key); os.makedirs(o, exist_ok=True)
    col = Image.open(os.path.join(d, 'color.jpg')).convert('RGB')
    if col.width > 2048: col = col.resize((2048, 2048), Image.LANCZOS)
    save_dds(os.path.join(o, 'color.dds'), col, 'srgb', False)
    a = np.asarray(col.resize((64, 64), Image.BILINEAR), np.float32) / 255.0
    albedo = to_lin(a).reshape(-1, 3).mean(0)
    rp = os.path.join(d, 'rough.jpg')
    rough = Image.open(rp).convert('L').resize((1024, 1024), Image.LANCZOS) if os.path.exists(rp) else Image.new('L', (1024, 1024), 128)
    mp = os.path.join(d, 'metal.jpg')
    met = Image.open(mp).convert('L').resize((1024, 1024), Image.LANCZOS) if os.path.exists(mp) else Image.new('L', (1024, 1024), 255 if metal else 0)
    # three.js reads roughness from G and metalness from B (glTF ARM packing)
    save_dds(os.path.join(o, 'rough.dds'), Image.merge('RGB', (Image.new('L', (1024, 1024), 255), rough, met)), 'lin', False)
    npth = os.path.join(d, 'normal.jpg')
    if os.path.exists(npth):
        n = Image.open(npth).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        r, g, b = n.split(); z = Image.new('L', n.size, 0)
        save_dds(os.path.join(o, 'normal.dds'), Image.merge('RGBA', (z, g, z, r)), 'lin', True)
    rmean = float(np.asarray(rough, np.float32).mean() / 255.0)
    return key, {'tile': tile, 'albedo': [round(float(x), 4) for x in albedo], 'rough': round(rmean, 3), 'metal': metal, 'normal': os.path.exists(npth)}


def fetch_model(mid):
    d = os.path.join(SRC, 'models', mid)
    if os.path.exists(os.path.join(d, mid + '_1k.gltf')): return mid, 'cached'
    try:
        f = json.loads(get('https://api.polyhaven.com/files/' + mid))
        g = f['gltf']['1k']['gltf']
    except Exception as e:
        return mid, 'skip (%s)' % e
    os.makedirs(os.path.join(d, 'textures'), exist_ok=True)
    for rel, inc in g['include'].items():
        open(os.path.join(d, rel), 'wb').write(get(inc['url']))
    open(os.path.join(d, mid + '_1k.gltf'), 'wb').write(get(g['url']))
    return mid, 'ok'


def licences(rows):
    """append rows to the '## Hero interiors' table of ASSET_LICENSES.md (created on first use)"""
    NL = chr(10)
    have = open(LIC, encoding='utf-8').read() if os.path.exists(LIC) else '# Third-party assets' + NL
    if '## Hero interiors' not in have:
        have = have.rstrip(NL) + NL + NL + '## Hero interiors (public/assets/landmarks/_itex, _iprops)' + NL + '| Asset | Source | Used as | Licence |' + NL + '|---|---|---|---|' + NL
    head = '|---|---|---|---|'
    i = have.index(head, have.index('## Hero interiors')) + len(head)
    for r in rows:     # insert under the interiors table header (other sections follow it)
        if ('| ' + r[0] + ' |') not in have: have = have[:i] + NL + '| %s | %s | %s | CC0 1.0 |' % r + have[i:]
    open(LIC, 'w', encoding='utf-8').write(have)


if __name__ == '__main__':
    a = sys.argv[1:]
    only = set(a[a.index('--only') + 1].split(',')) if '--only' in a else None
    rows = []
    if '--mats' in a or not ('--models' in a):
        keys = [k for k in MATS if not only or k in only]
        with cf.ThreadPoolExecutor(6) as ex:
            for key, url in ex.map(fetch_mat, keys): rows.append((MATS[key][1], url, 'interior material ' + key)); print('fetched', key, flush=True)
        libp = os.path.join(OUT, 'lib.json'); lib = json.load(open(libp)) if os.path.exists(libp) else {}
        with cf.ThreadPoolExecutor(4) as ex:
            for key, meta in ex.map(pack_mat, keys): lib[key] = meta; print('packed', key, meta['albedo'], flush=True)
        os.makedirs(OUT, exist_ok=True); json.dump(lib, open(libp, 'w'), indent=0)
    if '--models' in a:
        ids = [m for m in MODELS if not only or m in only]
        with cf.ThreadPoolExecutor(8) as ex:
            for mid, st in ex.map(fetch_model, ids): rows.append((mid, 'https://polyhaven.com/a/' + mid, 'interior prop model')); print('model', mid, st, flush=True)
    licences(rows)
