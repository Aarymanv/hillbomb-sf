"""Chinatown hero set plan (plain python, no bpy): which OSM footprints front the hero streets, grouped into blocks.

Hero streets: Grant Avenue (Bush St .. Broadway), Washington / Clay / Sacramento / Jackson (Stockton .. Kearny: one block
each side of Grant) and Waverly Place. Blocks = (side of Grant, segment between two cross streets). A footprint joins the
set when one of its edges faces a hero street (parallel, within the half-width + sidewalk + 2.5 m, normal toward it).
python tools/blender/ct_plan.py  -> tools/blender/_cache/hero/ct_plan.json (+ a summary)
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '_cache', 'hero')

CROSS = ['Bush Street', 'Pine Street', 'California Street', 'Sacramento Street', 'Clay Street', 'Washington Street',
         'Jackson Street', 'Pacific Avenue', 'Broadway']
SIDE_ST = ['Washington Street', 'Clay Street', 'Sacramento Street', 'Jackson Street']
TALL = 32.0          # taller footprints stay OSM (hotels / towers)
EXCLUDE_HEROES = True


def load():
    S = json.load(open(os.path.join(CACHE, 'sites.json')))
    return S


def seg_dist(p, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
    q = (ax + dx * t, az + dz * t)
    return math.hypot(p[0] - q[0], p[1] - q[1]), q, (dx / math.sqrt(L2), dz / math.sqrt(L2))


def streets_by_name(S):
    out = {}
    for s in S['streets']:
        out.setdefault(s['name'], []).append(s)
    return out


def isect(st_a, st_b):
    """closest approach of two named streets (point)"""
    best = (1e9, None)
    for ea in st_a:
        for eb in st_b:
            for p in ea['pts']:
                for q in eb['pts']:
                    d = math.hypot(p[0] - q[0], p[1] - q[1])
                    if d < best[0]: best = (d, ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2))
    return best[1]


def ring_out(r):
    r = [tuple(p) for p in r]
    if len(r) > 2 and r[0] == r[-1]: r = r[:-1]
    a = sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2
    return r[::-1] if a > 0 else r


def hero_hides():
    """footprints already owned by other hero sites (Sing Chong / Sing Fat / Old St. Mary's ...)"""
    out = set()
    for f in os.listdir(CACHE):
        if not f.endswith('.json') or f in ('sites.json', 'ct_plan.json') or f.startswith('ct_'): continue
        try: d = json.load(open(os.path.join(CACHE, f)))
        except Exception: continue
        out.update(d.get('hide') or [])
    return out


def plan():
    S = load(); Z = S['ctown']; N = streets_by_name(Z)
    grant = N['Grant Avenue']
    X = {c: isect(grant, N[c]) for c in CROSS}
    # Grant axis: Bush -> Broadway
    gb, gn = X['Bush Street'], X['Broadway']
    ax = (gn[0] - gb[0], gn[1] - gb[1]); AL = math.hypot(*ax); ax = (ax[0] / AL, ax[1] / AL)
    along = lambda p: (p[0] - gb[0]) * ax[0] + (p[1] - gb[1]) * ax[1]
    side = lambda p: 1 if ((p[0] - gb[0]) * ax[1] - (p[1] - gb[1]) * ax[0]) > 0 else -1   # +1 = west of Grant
    cuts = [along(X[c]) for c in CROSS]
    stock = {c: isect(N['Stockton Street'], N[c]) for c in SIDE_ST}
    kear = {c: isect(N['Kearny Street'], N[c]) for c in SIDE_ST}
    # hero street segments (polylines clipped by along-range / cross-street ends)
    segs = []
    def add(name, pts, w, sw, keep):
        for i in range(len(pts) - 1):
            a, b = pts[i][:2], pts[i + 1][:2]
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if keep(m): segs.append({'name': name, 'a': a, 'b': b, 'w': w, 'sw': sw})
    lo, hi = cuts[0] - 6, cuts[-1] + 6
    for e in grant: add('Grant Avenue', e['pts'], e['width'], e['sidewalk'], lambda m: lo < along(m) < hi)
    for c in SIDE_ST:
        s0, k0 = stock[c], kear[c]
        dx, dz = k0[0] - s0[0], k0[1] - s0[1]; L = math.hypot(dx, dz)
        for e in N[c]:
            add(c, e['pts'], e['width'], e['sidewalk'], lambda m, s0=s0, dx=dx, dz=dz, L=L: -4 < ((m[0] - s0[0]) * dx + (m[1] - s0[1]) * dz) / L < L + 4)
    for e in N.get('Waverly Place', []): add('Waverly Place', e['pts'], e['width'], e['sidewalk'], lambda m: True)
    own = hero_hides() if EXCLUDE_HEROES else set()
    blds = []
    for b in Z['buildings']:
        if b['i'] in own or len(b['ring']) < 3: continue
        r = ring_out(b['ring'])
        fronts = []
        for k in range(len(r)):
            a, c = r[k], r[(k + 1) % len(r)]
            L = math.hypot(c[0] - a[0], c[1] - a[1])
            if L < 1.6: continue
            t = ((c[0] - a[0]) / L, (c[1] - a[1]) / L); n = (-t[1], t[0])
            m = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
            best = None
            for s in segs:
                d, q, sd = seg_dist(m, s['a'], s['b'])
                if d > s['w'] / 2 + s['sw'] + 2.5: continue
                if abs(t[0] * sd[0] + t[1] * sd[1]) < 0.9: continue
                if (q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1] <= 0: continue
                if best is None or d < best[0]: best = (d, s['name'], s['w'], s['sw'])
            if best: fronts.append({'e': k, 'street': best[1], 'd': round(best[0], 2), 'w': best[2], 'sw': best[3], 'len': round(L, 2)})
        if not fronts: continue
        if b['h'] > TALL: continue
        c = b['c']
        seg = sum(1 for x in cuts if along(c) > x) - 1
        blds.append({'i': b['i'], 'h': b['h'], 'base': b['base'], 'levels': b['levels'], 'kind': b['kind'], 'area': b['area'],
                     'c': c, 'side': side(c), 'seg': max(0, min(len(CROSS) - 2, seg)), 'fronts': fronts})
    blocks = {}
    for b in blds:
        key = 'ct_%s%d' % ('w' if b['side'] > 0 else 'e', b['seg'])
        blocks.setdefault(key, []).append(b)
    out = {'cross': {c: X[c] for c in CROSS}, 'axis': ax, 'origin': gb, 'cuts': cuts, 'segs': segs,
           'blocks': {k: [b['i'] for b in v] for k, v in sorted(blocks.items())}, 'buildings': {b['i']: b for b in blds}}
    json.dump(out, open(os.path.join(CACHE, 'ct_plan.json'), 'w'))
    # runtime zone (lantern-string skip, wet-street mirror, ground light map frame)
    js = os.path.join(HERE, '..', '..', 'src', 'world', 'landmarks', 'v2', 'ct_zone.js')
    R2 = lambda v: [round(v[0], 2), round(v[1], 2)]
    zs = [[s['name'], R2(s['a']), R2(s['b']), s['w'], s['sw']] for s in segs]
    with open(js, 'w') as f:
        f.write('// GENERATED by tools/blender/ct_plan.py: the Chinatown hero streets (Grant Ave Bush..Broadway, Washington / Clay /\n')
        f.write('// Sacramento / Jackson one block each side, Waverly Place). seg = [name, a [x, z], b [x, z], width, sidewalk].\n')
        f.write('export const CT_SEGS = ' + json.dumps(zs, separators=(',', ':')) + ';\n')
        f.write('export const CT_CROSS = ' + json.dumps({k: R2(v) for k, v in X.items()}, separators=(',', ':')) + ';\n')
        f.write('''// true when (x, z) lies on a hero street (carriageway + sidewalks, + pad m)
export function onCtStreet(x, z, pad = 0, name = null) {
  for (const [n, a, b, w, sw] of CT_SEGS) {
    if (name && n !== name) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < w / 2 + sw + pad) return true;
  }
  return false;
}
''')
    return out


if __name__ == '__main__':
    P = plan()
    print('cross', {k: [round(v[0]), round(v[1])] for k, v in P['cross'].items()})
    tot = 0
    for k, v in P['blocks'].items():
        bs = [P['buildings'][i] for i in v]; tot += len(v)
        fr = sum(f['len'] for b in bs for f in b['fronts'])
        print(k, len(v), 'frontage %.0f m' % fr, 'h', sorted(round(b['h']) for b in bs))
    print('total', tot)
