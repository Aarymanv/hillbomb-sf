# Stage 5: write the game data to public/assets/map/.
#   meta.json                 extent, projection, tiles, counts, attribution
#   height.bin.gz             Int16 centimetres, NZ x NX, row-major (4 m cells, x fastest)
#   surf.bin.gz               Uint8 surface class per cell (0-7 = SURF in terrain.js, 8 scrub, 9 yard)
#   roads.json.gz             graph: nodes, edges, 3D polylines, names, junction control
#   buildings.bin.gz          footprints + attributes, grouped by 512 m tile (see src/world/v2/mapdata.js for the layout)
#   extras.json.gz            rails (cable car / streetcar / light rail), lakes, trees, park paths, named buildings
#   map_base.png              8 m/px colour map (land use + hillshade + water) for the UI map
import gzip, json, math, os, pickle, struct, time
import numpy as np
from PIL import Image
from scipy import ndimage
from common import CACHE, CELL, TILE, OUT, KX, KZ, LAT0, LON0, grid_extent, load_osm, proj, rdp, way_xy

CLS_ID = {'motorway': 0, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4, 'unclassified': 5, 'residential': 6, 'living_street': 7,
          'busway': 8, 'road': 9, 'service': 10, 'pedestrian': 11, 'track': 12, 'motorway_link': 13, 'trunk_link': 14, 'primary_link': 15,
          'secondary_link': 16, 'tertiary_link': 17}


def gz(path, data):
    with gzip.open(path, 'wb', compresslevel=9) as f: f.write(data)
    return os.path.getsize(path)


def run():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    X0, Z0, X1, Z1, NX, NZ = grid_extent()
    height = np.load(os.path.join(CACHE, 'height.npy'))
    surf = np.load(os.path.join(CACHE, 'surf.npy'))
    R = pickle.load(open(os.path.join(CACHE, 'roads.pkl'), 'rb'))
    B = pickle.load(open(os.path.join(CACHE, 'buildings.pkl'), 'rb'))
    lakes = pickle.load(open(os.path.join(CACHE, 'lakes.pkl'), 'rb'))
    sizes = {}

    # ---------------------------------------------------------------- rasters
    # heights: centimetres on and near roads, 5 cm on natural ground, 0.5 m (smoothed) on the sea bed; then a 2D
    # predictor (left + up - upleft) so gzip sees small residuals. Decode: a = r + left + up - upleft (row 0: left, col 0: up).
    roadw = np.load(os.path.join(CACHE, 'roadw.npy')).astype(np.float32)
    sea = (surf == 0) & (height < -1.0)
    h = height.copy()
    h[sea] = np.round(ndimage.gaussian_filter(height, 3)[sea] * 2) / 2
    a = np.round(h * 100).astype(np.int32)
    nat = (roadw < 0.02) & ~sea
    a[nat] = np.round(a[nat] / 5) * 5
    a = np.clip(a, -32767, 32767)
    pred = np.zeros_like(a)
    pred[1:, 1:] = a[1:, :-1] + a[:-1, 1:] - a[:-1, :-1]; pred[0, 1:] = a[0, :-1]; pred[1:, 0] = a[:-1, 0]
    r = a - pred
    assert np.abs(r).max() < 32767
    sizes['height.bin.gz'] = gz(os.path.join(OUT, 'height.bin.gz'), r.astype('<i2').tobytes())
    sizes['surf.bin.gz'] = gz(os.path.join(OUT, 'surf.bin.gz'), surf.astype(np.uint8).tobytes())

    # ---------------------------------------------------------------- roads
    npos, nh, edges = R['npos'], R['nh'], R['edges']
    N = len(npos)
    deg = np.zeros(N, int)
    for e in edges: deg[e['a']] += 1; deg[e['b']] += 1
    ctrl = np.zeros(N, np.uint8)
    # junction control from OSM signal/stop nodes (on or within 18 m of a junction)
    jn = np.where(deg >= 3)[0]
    from scipy.spatial import cKDTree
    kd = cKDTree(npos[jn])
    for el in load_osm('nodes'):
        hw = el['tags'].get('highway')
        bit = 1 if hw == 'traffic_signals' else 2 if hw == 'stop' else 4 if hw == 'crossing' else 0
        if not bit: continue
        x, z = proj(el['lat'], el['lon'])
        d, k = kd.query([float(x), float(z)])
        if d < (18 if bit < 4 else 12): ctrl[jn[k]] |= bit
    names = []; name_id = {}
    def nid(s):
        if s not in name_id: name_id[s] = len(names); names.append(s)
        return name_id[s]
    E, P = [], []
    for e in edges:
        pts = e['pts3']
        flags = (1 if e['bridge'] else 0) | (2 if e['tunnel'] else 0) | (4 if e['unpaved'] else 0) | (8 if e['traffic'] else 0) | \
                (16 if e['restricted'] else 0) | (32 if e.get('main') else 0) | (64 if e['cycle'] else 0) | (128 if e.get('cycleTrack') else 0) | (256 if e.get('sharrow') else 0)
        E.append([e['a'], e['b'], nid(e['name']), CLS_ID[e['hw']], e['lanes'], 1 if e['oneway'] else 0, round(e['width'], 2), round(e['sidewalk'], 2),
                  e['parkSides'], flags, len(P) // 3, len(pts), e['layer']])
        for x, z, y in pts: P += [round(float(x), 2), round(float(z), 2), round(float(y), 2)]
    roads = dict(nodes=[round(float(v), 2) for xz, y in zip(npos, nh) for v in (xz[0], xz[1], y)], ctrl=ctrl.tolist(), names=names,
                 edgeFields=['a', 'b', 'name', 'cls', 'lanes', 'oneway', 'width', 'sidewalk', 'parkSides', 'flags', 'p0', 'np', 'layer'],
                 classes=list(CLS_ID.keys()), edges=E, pts=P)
    sizes['roads.json.gz'] = gz(os.path.join(OUT, 'roads.json.gz'), json.dumps(roads, separators=(',', ':')).encode())

    # ---------------------------------------------------------------- buildings (binary)
    recs = B['recs']; TC, TR = B['tiles']
    # per-building 28 bytes: u32 v0, u16 nv, i16 baseY(cm/2 -> +-655 m), u16 h(dm), u16 minH(dm), u8 levels, u8 kind, u8 roof, u8 slope(dm, cap 25.5), u16 roofH(dm),
    #                        u32 color(rgb, 0 = none), u32 roofColor, u16 flags (1 known height, 2 named) -> pad to 28
    rec = bytearray(); verts = []
    tile_first = np.zeros(TC * TR, np.uint32); tile_count = np.zeros(TC * TR, np.uint32)
    named = []
    for i, b in enumerate(recs):
        tx, tz = b['tile']; ti = tz * TC + tx
        if tile_count[ti] == 0: tile_first[ti] = i
        tile_count[ti] += 1
        ox, oz = X0 + tx * TILE, Z0 + tz * TILE
        v0 = len(verts) // 2
        for x, z in b['ring']:
            verts += [int(round((x - ox) * 16)), int(round((z - oz) * 16))]
        flags = (1 if b.get('known') else 0) | (2 if b['name'] else 0)
        rec += struct.pack('<IHhHHBBBBHIIH', v0, len(b['ring']), int(round(b['base'] * 50)), int(round(b['h'] * 10)), int(round(b['mh'] * 10)),
                           min(255, b['levels']), b['kind'], b['roof'], min(255, int(b['slope'] * 10)), int(round(b['rh'] * 10)), b['col'], b['rcol'], flags)
        if b['name']: named.append([i, b['name']])
    vb = np.array(verts, dtype='<i2').tobytes()
    head = struct.pack('<4sIIHHff', b'SFB1', len(recs), len(verts) // 2, TC, TR, float(X0), float(Z0))
    blob = head + tile_first.astype('<u4').tobytes() + tile_count.astype('<u4').tobytes() + bytes(rec) + vb
    sizes['buildings.bin.gz'] = gz(os.path.join(OUT, 'buildings.bin.gz'), blob)

    # ---------------------------------------------------------------- extras: rails, lakes, trees, park paths, named
    hgt = lambda x, z: float(height[min(NZ - 1, max(0, int((z - Z0) / CELL))), min(NX - 1, max(0, int((x - X0) / CELL)))])
    # road name lookup for cable-car detection
    from scipy.spatial import cKDTree as KD
    mids, mid_name = [], []
    for e in edges:
        p = e['pts3']
        for k in range(len(p) - 1):
            mids.append(((p[k][0] + p[k + 1][0]) / 2, (p[k][1] + p[k + 1][1]) / 2)); mid_name.append(e['name'])
    kd2 = KD(np.array(mids))
    CABLE_ST = ('Powell Street', 'Hyde Street', 'Mason Street', 'Taylor Street', 'Jackson Street', 'Washington Street', 'California Street')
    rails, paths, trees = [], [], []
    for el in load_osm('paths'):
        t = el['tags']; p = way_xy(el)
        if p is None or np.isnan(p).any(): continue
        if not ((p[:, 0] > X0) & (p[:, 0] < X1) & (p[:, 1] > Z0) & (p[:, 1] < Z1)).any(): continue
        rw = t.get('railway')
        if rw in ('tram', 'light_rail', 'rail') and t.get('tunnel') in (None, 'no') and t.get('service') != 'yard':
            p = rdp(p, 0.3)
            _, ks = kd2.query(p)
            nm = [mid_name[k] for k in ks]
            # cable car lines are the 3'6" (1067 mm) gauge, unelectrified trams; the street-name vote is the fallback
            cable = rw == 'tram' and (t.get('gauge') == '1067' or (t.get('gauge') is None and sum(n in CABLE_ST for n in nm) > len(nm) / 2 and 'Market Street' not in nm))
            rails.append(dict(kind='cable' if cable else rw, bridge=t.get('bridge') not in (None, 'no'), pts=[[round(float(x), 2), round(float(z), 2)] for x, z in p]))
        elif t.get('highway') in ('footway', 'path', 'cycleway', 'steps', 'bridleway') and t.get('footway') not in ('sidewalk', 'crossing', 'access_aisle'):
            p = rdp(p, 0.5)
            paths.append(dict(kind=t['highway'], paved=t.get('surface', 'paved' if t['highway'] in ('footway', 'cycleway', 'steps') else 'dirt') in ('paved', 'asphalt', 'concrete', 'paving_stones', 'concrete:plates'),
                              w=2.4 if t['highway'] == 'cycleway' else 1.8 if t['highway'] != 'steps' else 2.0, pts=[[round(float(x), 1), round(float(z), 1)] for x, z in p]))
    for el in load_osm('areas'):
        if el['type'] == 'node' and el['tags'].get('natural') == 'tree':
            x, z = proj(el['lat'], el['lon']); trees.append([round(float(x), 1), round(float(z), 1)])
    peaks = []
    for el in load_osm('areas'):
        if el['type'] == 'node' and el['tags'].get('natural') == 'peak' and el['tags'].get('name'):
            x, z = proj(el['lat'], el['lon']); peaks.append([el['tags']['name'], round(float(x), 1), round(float(z), 1)])
    lk = []
    for L in lakes:
        i0, j0, w, h = L['bbox']
        lk.append(dict(name=L['name'], level=L['level'], x0=X0 + i0 * CELL, z0=Z0 + j0 * CELL, x1=X0 + (i0 + w) * CELL, z1=Z0 + (j0 + h) * CELL))
    extras = dict(rails=rails, lakes=lk, trees=trees, paths=paths, named=named, peaks=peaks)
    sizes['extras.json.gz'] = gz(os.path.join(OUT, 'extras.json.gz'), json.dumps(extras, separators=(',', ':')).encode())

    # ---------------------------------------------------------------- UI base map (8 m/px)
    PAL = np.array([[16, 36, 52], [60, 64, 70], [150, 150, 146], [74, 110, 62], [214, 198, 156], [120, 100, 76], [112, 110, 104], [44, 78, 50], [96, 108, 70], [118, 122, 110]], np.float32)
    s2 = surf[::2, ::2]; h2 = height[::2, ::2]
    gy, gx = np.gradient(h2, CELL * 2)
    shade = np.clip(0.85 + (-gx * 0.6 + gy * 0.6) * 0.5, 0.55, 1.2)[..., None]
    img = PAL[s2] * np.where(s2[..., None] == 0, 1.0, shade)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'map_base.png'), optimize=True)
    sizes['map_base.png'] = os.path.getsize(os.path.join(OUT, 'map_base.png'))

    meta = dict(version=2, heightEncoding='int16 cm, residual of left+up-upleft predictor', created=time.strftime('%Y-%m-%d'), projection=dict(lat0=LAT0, lon0=LON0, kx=KX, kz=KZ, scale=1),
                extent=dict(x0=X0, z0=Z0, x1=X1, z1=Z1), cell=CELL, nx=NX, nz=NZ, tile=TILE, tiles=[TC, TR],
                counts=dict(nodes=N, edges=len(edges), buildings=len(recs), rails=len(rails), paths=len(paths), trees=len(trees), lakes=len(lk)),
                surfaces=['water', 'asphalt', 'concrete', 'grass', 'sand', 'dirt', 'rock', 'forest', 'scrub', 'yard'],
                buildingKinds=['generic', 'house', 'apartments', 'commercial', 'industrial', 'civic', 'garage', 'roof', 'landmark', 'transit'],
                roofShapes=['flat', 'gabled', 'hipped', 'pyramidal', 'dome', 'skillion', 'onion', 'round'],
                attribution=['Map data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright), via BBBike extract',
                             'Elevation: AWS Terrain Tiles (Mapzen/Tilezen), incl. USGS 3DEP (public domain) and NOAA/GEBCO bathymetry'],
                sizes=sizes)
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
    tot = sum(sizes.values())
    print('\n'.join(f'  {k:18s} {v/1e6:6.2f} MB' for k, v in sizes.items()))
    print(f'total {tot/1e6:.1f} MB  signals {int((ctrl & 1).astype(bool).sum())} stops {int(((ctrl & 2) > 0).sum())} rails {len(rails)} (cable {sum(r["kind"]=="cable" for r in rails)}) paths {len(paths)} trees {len(trees)}  {time.time()-t0:.0f}s')


if __name__ == '__main__':
    run()
