# Stage 3: land/water from the OSM coastline, surface classes from land use, lakes, piers, and the final heightfield
# with every ground road carved in (flat across, cut/fill blended into the hillside).
import math, os, pickle, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from common import CACHE, CELL, grid_extent, load_osm, proj, way_xy

# surface classes (0-7 match src/world/terrain.js SURF)
WATER, ASPHALT, CONCRETE, GRASS, SAND, DIRT, ROCK, FOREST, SCRUB, YARD = range(10)


def rings_of(el):
    """Closed rings [(N,2) world xy] for a way or multipolygon relation: [(ring, is_outer)]."""
    if el['type'] == 'way':
        p = way_xy(el)
        return [(p, True)] if p is not None and len(p) >= 3 and not np.isnan(p).any() else []
    out = []
    for role in ('outer', 'inner'):
        segs = []
        for m in el.get('members', []):
            if m.get('type') != 'way' or (m.get('role') or 'outer') != role or not m.get('geometry'):
                continue
            if any(g is None for g in m['geometry']):
                continue
            lat = np.array([g['lat'] for g in m['geometry']]); lon = np.array([g['lon'] for g in m['geometry']])
            x, z = proj(lat, lon); segs.append(np.stack([x, z], 1))
        # stitch segments end to end
        while segs:
            cur = segs.pop()
            changed = True
            while changed and np.hypot(*(cur[0] - cur[-1])) > 0.5:
                changed = False
                for i, s in enumerate(segs):
                    if np.hypot(*(cur[-1] - s[0])) < 0.5: cur = np.vstack([cur, s[1:]]); segs.pop(i); changed = True; break
                    if np.hypot(*(cur[-1] - s[-1])) < 0.5: cur = np.vstack([cur, s[::-1][1:]]); segs.pop(i); changed = True; break
                    if np.hypot(*(cur[0] - s[-1])) < 0.5: cur = np.vstack([s[:-1], cur]); segs.pop(i); changed = True; break
                    if np.hypot(*(cur[0] - s[0])) < 0.5: cur = np.vstack([s[::-1][:-1], cur]); segs.pop(i); changed = True; break
            if len(cur) >= 3:
                out.append((cur, role == 'outer'))
    return out


class Raster:
    def __init__(self, X0, Z0, NX, NZ):
        self.X0, self.Z0, self.NX, self.NZ = X0, Z0, NX, NZ

    def px(self, P):
        return [((x - self.X0) / CELL, (z - self.Z0) / CELL) for x, z in P]

    def poly_mask(self, rings):
        """Boolean mask (bbox-limited) for outer minus inner rings. Returns (mask, i0, j0) or None."""
        allp = np.vstack([r for r, _ in rings])
        i0 = max(0, int((allp[:, 0].min() - self.X0) / CELL) - 1); i1 = min(self.NX, int((allp[:, 0].max() - self.X0) / CELL) + 2)
        j0 = max(0, int((allp[:, 1].min() - self.Z0) / CELL) - 1); j1 = min(self.NZ, int((allp[:, 1].max() - self.Z0) / CELL) + 2)
        if i1 <= i0 or j1 <= j0:
            return None
        im = Image.new('L', (i1 - i0, j1 - j0), 0); d = ImageDraw.Draw(im)
        for r, outer in sorted(rings, key=lambda t: not t[1]):
            pts = [((x - self.X0) / CELL - i0, (z - self.Z0) / CELL - j0) for x, z in r]
            d.polygon(pts, fill=255 if outer else 0)
        return np.asarray(im) > 127, i0, j0


def run():
    t0 = time.time()
    X0, Z0, X1, Z1, NX, NZ = grid_extent()
    dem = np.load(os.path.join(CACHE, 'dem.npy'))
    R = pickle.load(open(os.path.join(CACHE, 'roads.pkl'), 'rb'))
    ras = Raster(X0, Z0, NX, NZ)
    areas = load_osm('areas')

    # ---------------------------------------------------------------- land / water from the coastline
    bar = Image.new('L', (NX, NZ), 0); d = ImageDraw.Draw(bar)
    ncoast = 0
    for el in areas:
        if el['type'] == 'way' and el['tags'].get('natural') == 'coastline':
            p = way_xy(el)
            if p is None: continue
            d.line(ras.px(p), fill=255, width=2); ncoast += 1
    barrier = np.asarray(bar) > 127
    lab, nl = ndimage.label(~barrier)
    med = ndimage.median(dem, lab, index=np.arange(1, nl + 1))
    size = ndimage.sum(np.ones_like(dem), lab, index=np.arange(1, nl + 1))
    water_comp = np.zeros(nl + 1, bool)
    water_comp[1:] = (np.array(med) < -0.5)
    water = water_comp[lab]
    water[barrier] = dem[barrier] < 0.3
    print(f'coastline: {ncoast} ways, {nl} regions, water {water.mean()*100:.0f}% of grid  {time.time()-t0:.0f}s')

    # ---------------------------------------------------------------- surfaces
    surf = np.full((NZ, NX), YARD, np.uint8)
    surf[water] = WATER
    tagcls = []
    def cls_of(t):
        n, lu, le = t.get('natural'), t.get('landuse'), t.get('leisure')
        if n in ('water',) or lu in ('reservoir', 'basin') or t.get('water') in ('lake', 'pond', 'reservoir', 'lagoon'):
            return 'lake'
        if n in ('bay', 'strait', 'coastline', 'reef', 'tree', 'peak', 'cliff', 'tree_row'): return None
        if n in ('wood',) or lu in ('forest',): return FOREST
        if n in ('scrub', 'heath', 'shrubbery'): return SCRUB
        if n in ('sand', 'beach', 'dune') or t.get('surface') == 'sand': return SAND
        if n in ('bare_rock', 'scree', 'shingle', 'rock', 'stone'): return ROCK
        if n in ('grassland', 'meadow', 'wetland'): return GRASS
        if lu in ('grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery', 'orchard', 'allotments', 'flowerbed', 'greenfield', 'plant_nursery'): return GRASS
        if le in ('park', 'garden', 'golf_course', 'dog_park', 'nature_reserve', 'common'): return GRASS
        if le == 'pitch': return GRASS if t.get('surface', 'grass') in ('grass', 'artificial_turf', '') else CONCRETE
        if lu in ('construction', 'brownfield', 'landfill', 'quarry') or le == 'track' and t.get('surface') in ('dirt', 'clay', 'ground'): return DIRT
        if t.get('amenity') == 'parking' or 'area:highway' in t or t.get('aeroway') in ('runway', 'taxiway', 'apron') or t.get('man_made') in ('pier', 'quay', 'breakwater', 'groyne'):
            return CONCRETE
        if lu in ('retail', 'commercial', 'industrial', 'railway', 'port', 'military', 'garages'): return 'urban_hard'
        return None
    order = {'urban_hard': 0, GRASS: 1, SCRUB: 2, FOREST: 3, DIRT: 4, SAND: 5, ROCK: 6, CONCRETE: 7, 'lake': 8}
    jobs = []
    for el in areas:
        if el['type'] == 'node': continue
        c = cls_of(el.get('tags', {}))
        if c is None: continue
        rings = rings_of(el)
        if not rings: continue
        jobs.append((order[c], c, rings, el))
    jobs.sort(key=lambda j: j[0])
    hard = np.zeros((NZ, NX), bool)
    lakes = []
    piers = np.zeros((NZ, NX), bool)
    for _, c, rings, el in jobs:
        m = ras.poly_mask(rings)
        if m is None: continue
        mask, i0, j0 = m
        sl = (slice(j0, j0 + mask.shape[0]), slice(i0, i0 + mask.shape[1]))
        if c == 'urban_hard':
            hard[sl] |= mask
            continue
        if c == 'lake':
            sub = surf[sl]; land = sub != WATER
            mm = mask & land
            if mm.sum() < 3: continue
            # lake level = low percentile of the ground along/inside it
            lvl = float(np.percentile(dem[sl][mm], 8))
            sub[mm] = WATER
            lakes.append(dict(name=el['tags'].get('name', ''), level=round(lvl, 2), bbox=(i0, j0, mask.shape[1], mask.shape[0]), mask=mm))
            continue
        if el['tags'].get('man_made') in ('pier', 'quay', 'breakwater', 'groyne'):
            piers[sl] |= mask
            surf[sl][mask] = CONCRETE
            continue
        sub = surf[sl]
        sub[mask & (sub != WATER)] = c
    surf[(surf == YARD) & hard] = CONCRETE
    print(f'surfaces painted ({len(jobs)} polygons, {len(lakes)} lakes)  {time.time()-t0:.0f}s')

    # ---------------------------------------------------------------- carve roads
    Wb = np.zeros((NZ, NX), np.float32)
    Hb = np.zeros((NZ, NX), np.float32)
    Db = np.full((NZ, NX), 1e9, np.float32)
    edges, npos, nh = R['edges'], R['npos'], R['nh']
    BL = 9.0      # cut/fill blend width
    nseg = 0
    for e in edges:
        if e['bridge'] or e['tunnel']: continue
        hw = e['width'] / 2 + e['sidewalk'] + 0.6
        D = e['dense']
        for k in range(len(D) - 1):
            ax, az, ay = D[k]; bx, bz, by = D[k + 1]
            r = hw + BL
            i0 = max(0, int((min(ax, bx) - r - X0) / CELL)); i1 = min(NX - 1, int((max(ax, bx) + r - X0) / CELL) + 1)
            j0 = max(0, int((min(az, bz) - r - Z0) / CELL)); j1 = min(NZ - 1, int((max(az, bz) + r - Z0) / CELL) + 1)
            if i1 < i0 or j1 < j0: continue
            xs = X0 + np.arange(i0, i1 + 1) * CELL; zs = Z0 + np.arange(j0, j1 + 1) * CELL
            XX, ZZ = np.meshgrid(xs, zs)
            ex, ez = bx - ax, bz - az; l2 = ex * ex + ez * ez or 1e-9
            t = np.clip(((XX - ax) * ex + (ZZ - az) * ez) / l2, 0, 1)
            dx = XX - (ax + ex * t); dz = ZZ - (az + ez * t); dd = np.sqrt(dx * dx + dz * dz)
            w = np.clip((r - dd) / BL, 0, 1); w = w * w * (3 - 2 * w)
            yr = ay + (by - ay) * t
            sl = (slice(j0, j1 + 1), slice(i0, i1 + 1))
            better = (w > Wb[sl] + 1e-4) | ((w >= Wb[sl] - 1e-4) & (dd < Db[sl]))
            Wb[sl] = np.where(better, w, Wb[sl]); Hb[sl] = np.where(better, yr, Hb[sl]); Db[sl] = np.where(better, dd, Db[sl])
            nseg += 1
            # surface: asphalt / dirt inside the carriageway, concrete sidewalks
            inner = dd <= e['width'] / 2
            side = (dd > e['width'] / 2) & (dd <= e['width'] / 2 + e['sidewalk'])
            s2 = surf[sl]
            s2[inner] = DIRT if e['unpaved'] else ASPHALT
            s2[side & (s2 != ASPHALT)] = CONCRETE
    # intersection plateaus win
    for i in range(len(npos)):
        if not R['ground'][i]: continue
        x, z = npos[i]
        # flat disk only as far as the node's table stays flat (vertical curves start there; none at way splits / dead ends)
        r = min(7.0, float(R['nflat'][i])) if 'nflat' in R else 7.0
        if r < 1.0: continue
        i0 = max(0, int((x - r - X0) / CELL)); i1 = min(NX - 1, int((x + r - X0) / CELL) + 1)
        j0 = max(0, int((z - r - Z0) / CELL)); j1 = min(NZ - 1, int((z + r - Z0) / CELL) + 1)
        xs = X0 + np.arange(i0, i1 + 1) * CELL; zs = Z0 + np.arange(j0, j1 + 1) * CELL
        XX, ZZ = np.meshgrid(xs, zs); dd = np.hypot(XX - x, ZZ - z)
        sl = (slice(j0, j1 + 1), slice(i0, i1 + 1))
        m = dd <= r
        Wb[sl] = np.where(m, 1.0, Wb[sl]); Hb[sl] = np.where(m, nh[i], Hb[sl]); Db[sl] = np.where(m, 0, Db[sl])
    height = dem * (1 - Wb) + Hb * Wb
    print(f'carved {nseg} road segments  {time.time()-t0:.0f}s')

    # ---------------------------------------------------------------- water, shores, lakes, piers, rock
    sea = surf == WATER
    for L in lakes:
        i0, j0, w_, h_ = L['bbox']; sl = (slice(j0, j0 + h_), slice(i0, i0 + w_)); sea[sl] &= ~L['mask']
    height[sea] = np.minimum(height[sea], -1.2)
    # beaches/shores: land right next to the sea sits a little above it
    near = ndimage.binary_dilation(sea, iterations=2) & ~sea
    height[near & (height < 0.6)] = 0.6
    for L in lakes:
        i0, j0, w_, h_ = L['bbox']; sl = (slice(j0, j0 + h_), slice(i0, i0 + w_))
        dist = ndimage.distance_transform_edt(L['mask'])
        sub = height[sl]; sub[L['mask']] = L['level'] - np.minimum(dist[L['mask']] * CELL * 0.15, 4.0) - 0.4
        del L['mask']
    height[piers] = np.maximum(height[piers], 3.2)
    gy, gx = np.gradient(height, CELL)
    steep = np.hypot(gx, gy) > 0.9
    natural = np.isin(surf, (GRASS, SCRUB, FOREST, YARD, DIRT))
    surf[steep & natural & (Wb < 0.5)] = ROCK
    # sea bed never above water; land never below it unless it's a lake or the sea
    np.save(os.path.join(CACHE, 'height.npy'), height.astype(np.float32))
    np.save(os.path.join(CACHE, 'surf.npy'), surf)
    np.save(os.path.join(CACHE, 'roadw.npy'), Wb.astype(np.float16))
    pickle.dump(lakes, open(os.path.join(CACHE, 'lakes.pkl'), 'wb'))
    print(f'land stage done: height {height.min():.1f}..{height.max():.1f}  {time.time()-t0:.0f}s')


if __name__ == '__main__':
    run()
