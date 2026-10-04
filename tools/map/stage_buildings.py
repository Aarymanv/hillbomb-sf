# Stage 4: buildings. OSM footprints (+ building:part for detailed towers) with real heights where tagged, estimated
# otherwise; base elevation from the carved heightfield; grouped by 512 m tile. Output cache/buildings.pkl.
import math, os, pickle, re, time
from collections import defaultdict
import numpy as np
from common import CACHE, CELL, TILE, grid_extent, load_osm, proj, rdp, parse_len
from stage_land import rings_of

KIND = {'generic': 0, 'house': 1, 'apartments': 2, 'commercial': 3, 'industrial': 4, 'civic': 5, 'garage': 6, 'roof': 7, 'landmark': 8, 'transit': 9}
ROOF = {'flat': 0, 'gabled': 1, 'hipped': 2, 'pyramidal': 3, 'dome': 4, 'skillion': 5, 'onion': 6, 'round': 7, 'half-hipped': 2, 'gambrel': 1, 'mansard': 2, 'saltbox': 1, 'cone': 3}
COLORS = {'white': 0xf2f0ea, 'black': 0x222222, 'grey': 0x8c8c8c, 'gray': 0x8c8c8c, 'red': 0xa8413a, 'brown': 0x7a5a42, 'beige': 0xd9c9a8, 'yellow': 0xe0c060,
          'blue': 0x5872a0, 'green': 0x5f8a5a, 'tan': 0xc8b08a, 'orange': 0xd08040, 'pink': 0xe0a0a8, 'cream': 0xefe6cf, 'silver': 0xb8bcc2}


def kind_of(t):
    b = t.get('building') or 'part'
    if b in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'residential', 'cabin'): return KIND['house'] if b != 'residential' else KIND['apartments']
    if b in ('apartments', 'dormitory', 'hotel'): return KIND['apartments']
    if b in ('commercial', 'retail', 'office', 'supermarket', 'kiosk'): return KIND['commercial']
    if b in ('industrial', 'warehouse', 'manufacture', 'hangar', 'storage_tank', 'service'): return KIND['industrial']
    if b in ('school', 'university', 'college', 'church', 'cathedral', 'chapel', 'public', 'civic', 'government', 'hospital', 'museum', 'library', 'fire_station', 'stadium', 'temple', 'mosque', 'synagogue'): return KIND['civic']
    if b in ('garage', 'garages', 'shed', 'carport', 'hut'): return KIND['garage']
    if b in ('roof', 'canopy'): return KIND['roof']
    if b in ('train_station', 'transportation'): return KIND['transit']
    return KIND['generic']


def color_of(v):
    if not v: return 0
    v = v.strip().lower()
    if v in COLORS: return COLORS[v]
    m = re.match(r'^#?([0-9a-f]{6})$', v)
    if m: return int(m.group(1), 16)
    m = re.match(r'^#?([0-9a-f]{3})$', v)
    if m: return int(''.join(c * 2 for c in m.group(1)), 16)
    return 0


def pip(px, pz, poly):
    """point in polygon (even-odd) for arrays of points."""
    x, z = poly[:, 0], poly[:, 1]
    inside = np.zeros(np.shape(px), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        cond = ((z[i] > pz) != (z[j] > pz)) & (px < (x[j] - x[i]) * (pz - z[i]) / (z[j] - z[i] + 1e-12) + x[i])
        inside ^= cond; j = i
    return inside


def area(p):
    x, z = p[:, 0], p[:, 1]
    return 0.5 * (x @ np.roll(z, -1) - z @ np.roll(x, -1))


def run():
    t0 = time.time()
    X0, Z0, X1, Z1, NX, NZ = grid_extent()
    height = np.load(os.path.join(CACHE, 'height.npy'))
    surf = np.load(os.path.join(CACHE, 'surf.npy'))
    def hs(x, z):
        i = np.clip(((np.asarray(x) - X0) / CELL).astype(int), 0, NX - 1); j = np.clip(((np.asarray(z) - Z0) / CELL).astype(int), 0, NZ - 1)
        return height[j, i], surf[j, i]
    els = load_osm('buildings')
    parts, outlines = [], []
    for el in els:
        t = el.get('tags', {})
        rings = [r for r, outer in rings_of(el) if outer]
        if not rings: continue
        for r in rings:
            if np.hypot(*(r[0] - r[-1])) < 0.01: r = r[:-1]
            if len(r) < 3: continue
            r = rdp(np.vstack([r, r[:1]]), 0.15)[:-1]
            if len(r) < 3: continue
            a = area(r)
            if abs(a) < 6: continue
            if a < 0: r = r[::-1]            # counter-clockwise in (x, z) (clockwise seen from above since +z is south)
            (parts if 'building:part' in t and 'building' not in t else outlines).append((r, t, el['id']))
    # outlines that contain parts are replaced by their parts
    ph = defaultdict(list)
    for k, (r, t, _) in enumerate(parts):
        c = r.mean(0); ph[(int(c[0] // 64), int(c[1] // 64))].append((c, k))
    keep_outline = []
    for r, t, i in outlines:
        mn, mx = r.min(0), r.max(0)
        has = False
        for gx in range(int(mn[0] // 64), int(mx[0] // 64) + 1):
            for gz in range(int(mn[1] // 64), int(mx[1] // 64) + 1):
                for c, k in ph.get((gx, gz), ()):
                    if mn[0] <= c[0] <= mx[0] and mn[1] <= c[1] <= mx[1] and pip(np.array([c[0]]), np.array([c[1]]), r)[0]:
                        has = True; break
                if has: break
            if has: break
        if not has: keep_outline.append((r, t, i))
    items = keep_outline + [(r, dict(t, building=t.get('building', 'part')), i) for r, t, i in parts]
    print(f'{len(outlines)} outlines ({len(outlines)-len(keep_outline)} replaced by parts), {len(parts)} parts  {time.time()-t0:.0f}s')

    recs = []
    est = 0
    for r, t, oid in items:
        k = kind_of(t)
        h = parse_len(t.get('height'))
        mh = parse_len(t.get('min_height'), 0.0) or 0.0
        lv = parse_len(t.get('building:levels'))
        if (not h or h <= 0) and lv: h = lv * 3.2 + 1.2
        if t.get('building:min_level') and not mh: mh = (parse_len(t.get('building:min_level'), 0) or 0) * 3.2
        if not h or h <= 0:
            est += 1
            h = {1: 8.5, 2: 12.0, 3: 9.0, 4: 9.0, 5: 12.0, 6: 3.4, 7: 4.5, 9: 10.0}.get(k, 0.0)
        if k == KIND['roof'] and not mh: mh = max(0.0, h - 1.0)
        xs, zs = r[:, 0], r[:, 1]
        c = r.mean(0)
        gy, gs = hs(np.append(xs, c[0]), np.append(zs, c[1]))
        if (gs == 0).mean() > 0.6 and gy.max() < 1.0: continue           # on the water (not a pier)
        base = float(gy.min())
        slope = float(gy.max() - gy.min())
        rs = t.get('roof:shape', 'flat'); roof = ROOF.get(rs, 0)
        if not t.get('roof:shape') and k == KIND['house']: roof = ROOF['gabled']
        name = t.get('name', '')
        recs.append(dict(ring=r.astype(np.float32), base=base, slope=slope, h=float(h), mh=float(mh), levels=int(lv or 0), kind=k, roof=roof,
                         rh=float(parse_len(t.get('roof:height'), 0.0) or 0.0), col=color_of(t.get('building:colour')), rcol=color_of(t.get('roof:colour')),
                         mat=t.get('building:material', ''), name=name, id=oid, known=bool(t.get('height') or lv)))
    # fill unknown heights ('generic' 0.0) from the neighbourhood median within the tile
    tile_h = defaultdict(list)
    for b in recs:
        if b['h'] > 0: tile_h[(int((b['ring'][0, 0] - X0) // 256), int((b['ring'][0, 1] - Z0) // 256))].append(b['h'])
    med = {k: float(np.median(v)) for k, v in tile_h.items()}
    for b in recs:
        if b['h'] <= 0:
            b['h'] = max(4.0, min(24.0, med.get((int((b['ring'][0, 0] - X0) // 256), int((b['ring'][0, 1] - Z0) // 256)), 9.0)))
    # group by tile
    TC = int((X1 - X0) / TILE); TR = int((Z1 - Z0) / TILE)
    for b in recs:
        c = b['ring'].mean(0)
        b['tile'] = (min(TC - 1, max(0, int((c[0] - X0) // TILE))), min(TR - 1, max(0, int((c[1] - Z0) // TILE))))
    recs.sort(key=lambda b: (b['tile'][1], b['tile'][0]))
    hs_ = np.array([b['h'] for b in recs])
    print(f'{len(recs)} buildings, {est} estimated heights; height median {np.median(hs_):.1f} m, max {hs_.max():.0f} m, >100 m: {(hs_>100).sum()}  {time.time()-t0:.0f}s')
    pickle.dump(dict(recs=recs, tiles=(TC, TR)), open(os.path.join(CACHE, 'buildings.pkl'), 'wb'))


if __name__ == '__main__':
    run()
