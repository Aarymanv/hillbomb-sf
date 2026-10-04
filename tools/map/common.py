# Shared constants/helpers for the 1:1 San Francisco map bake. The projection MUST match src/world/latlon.js (v2).
import glob, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
CACHE = os.path.join(HERE, 'cache')
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'assets', 'map'))
BBOX = (37.700, -122.530, 37.845, -122.355)            # south, west, north, east

LAT0, LON0 = 37.7749, -122.4194
_phi = math.radians(LAT0)
KZ = 111132.954 - 559.822 * math.cos(2 * _phi) + 1.175 * math.cos(4 * _phi)      # m per degree latitude
KX = 111412.84 * math.cos(_phi) - 93.5 * math.cos(3 * _phi) + 0.118 * math.cos(5 * _phi)  # m per degree longitude

CELL = 4.0          # heightfield / surface raster resolution (m)
TILE = 512.0        # streaming tile size (m)


def proj(lat, lon):
    return (np.asarray(lon) - LON0) * KX, -(np.asarray(lat) - LAT0) * KZ


def unproj(x, z):
    return LAT0 - np.asarray(z) / KZ, LON0 + np.asarray(x) / KX


def grid_extent():
    s, w, n, e = BBOX
    x0, z0 = proj(n, w)
    x1, z1 = proj(s, e)
    X0 = math.floor(x0 / TILE) * TILE
    Z0 = math.floor(z0 / TILE) * TILE
    X1 = math.ceil(x1 / TILE) * TILE
    Z1 = math.ceil(z1 / TILE) * TILE
    NX = int(round((X1 - X0) / CELL)) + 1          # vertices (inclusive of the far edge)
    NZ = int(round((Z1 - Z0) / CELL)) + 1
    return X0, Z0, X1, Z1, NX, NZ


def load_osm(prefix):
    """Merge sliced Overpass JSON files, de-duplicated by (type, id)."""
    seen = {}
    for f in sorted(glob.glob(os.path.join(RAW, f'osm_{prefix}_*.json'))):
        with open(f, 'rb') as fh:
            for el in json.load(fh)['elements']:
                seen[(el['type'], el['id'])] = el
    return list(seen.values())


def way_xy(el):
    g = el.get('geometry') or []
    if not g:
        return None
    lat = np.array([p['lat'] if p else np.nan for p in g])
    lon = np.array([p['lon'] if p else np.nan for p in g])
    x, z = proj(lat, lon)
    return np.stack([x, z], 1)


def rdp(pts, eps):
    """Ramer-Douglas-Peucker on an (N,2+) array, keeps endpoints."""
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a, :2], pts[b, :2]
        d = q - p; L = math.hypot(d[0], d[1])
        seg = pts[a + 1:b, :2] - p
        if L < 1e-9:
            dist = np.hypot(seg[:, 0], seg[:, 1])
        else:
            dist = np.abs(seg[:, 0] * d[1] - seg[:, 1] * d[0]) / L
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = a + 1 + k; keep[m] = True
            stack.append((a, m)); stack.append((m, b))
    return pts[keep]


def parse_len(v, default=None):
    """'12', '12 m', '40\\'', '12.5;13' -> metres."""
    if v is None:
        return default
    v = str(v).split(';')[0].strip().lower().replace(',', '.')
    try:
        if v.endswith("'") or v.endswith('ft'):
            return float(v.rstrip("'").replace('ft', '').strip()) * 0.3048
        return float(v.replace('m', '').strip())
    except ValueError:
        return default


def polylen(p):
    d = np.diff(p[:, :2], axis=0)
    return float(np.hypot(d[:, 0], d[:, 1]).sum())
