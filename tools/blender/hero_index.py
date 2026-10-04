"""Collect tools/blender/_cache/hero/<id>.json into src/world/landmarks/v2/hero_sites.js (plain python, no bpy)."""
import json, os, glob, math
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, '_cache', 'hero')
OUT = os.path.join(ROOT, 'src', 'world', 'landmarks', 'v2', 'hero_sites.js')
ASSETS = os.path.join(ROOT, 'public', 'assets', 'landmarks')

NEAR_OVERRIDE = {'stFrancis': 320, 'ca101': 300, 'ca555': 300, 'grandHyatt': 320, 'jwMarriott': 340, 'embCenter': 320}
import sys as _sys
EXCLUDE = set(_sys.argv[_sys.argv.index('--exclude') + 1].split(',')) if '--exclude' in _sys.argv else set()
sites = []
for p in sorted(glob.glob(os.path.join(CACHE, '*.json'))):
    if os.path.basename(p) == 'sites.json': continue
    if os.path.basename(p)[:-5] in EXCLUDE: continue
    with open(p) as f: d = json.load(f)
    if 'origin' not in d or 'lods' not in d: continue
    if not all(os.path.exists(os.path.join(ASSETS, d['id'], l['file'])) for l in d['lods']): continue
    keep = {k: d[k] for k in ('id', 'name', 'origin', 'hide', 'colliders', 'lods', 'top', 'replaces', 'interior', 'lights', 'decks', 'near', 'noTrees', 'park', 'far', 'links') if k in d}
    mt = lambda f: int(os.path.getmtime(os.path.join(ASSETS, d['id'], f))) % 1000000 if os.path.exists(os.path.join(ASSETS, d['id'], f)) else 0
    keep['lods'] = [{'file': l['file'], 'tris': l['tris'], 'v': mt(l['file'])} for l in d['lods']]   # v: cache-buster (file mtime)
    for k in ('lm', 'ct', 'glow'):     # Chinatown hero set (hero_ctown.py): exterior day / night lightmaps (+ BC1 .dds from ct_pack.py)
        if k in d: keep[k] = d[k]
    if keep.get('lm'):
        L_ = keep['lm'] = dict(keep['lm']); L_['v'] = mt(L_['day']) + mt(L_['night'])
        dd = []
        for k in ('day', 'night'):
            src, dds = os.path.join(ASSETS, d['id'], L_[k]), os.path.join(ASSETS, d['id'], os.path.splitext(L_[k])[0] + '.dds')
            if os.path.exists(dds) and os.path.getmtime(dds) >= os.path.getmtime(src): dd.append(k)
        if dd: L_['dds'] = dd
    if keep.get('interior'):
        keep['interior'] = dict(keep['interior']); keep['interior']['v'] = mt(keep['interior']['file']); keep['interior']['lmv'] = mt(keep['interior']['lm'])
        if keep['interior'].get('signs'): keep['interior']['sv'] = mt(keep['interior']['signs'])
        I = keep['interior']
        if I.get('lmn') and not os.path.exists(os.path.join(ASSETS, d['id'], I['lmn'])): I.pop('lmn', None); I.pop('lmnScale', None)
        if I.get('lmn'): I['lmnv'] = mt(I['lmn'])
        # BC1/BC3 .dds next to the image (hero_int_pack.py), only when it is up to date
        dd = []
        for k in ('lm', 'lmn', 'signs'):
            f = I.get(k)
            if not f: continue
            src, dds = os.path.join(ASSETS, d['id'], f), os.path.join(ASSETS, d['id'], os.path.splitext(f)[0] + '.dds')
            if os.path.exists(dds) and os.path.getmtime(dds) >= os.path.getmtime(src): dd.append(k)
        if dd: I['dds'] = dd
    if d['id'] == 'unionSquare' and 'noTrees' not in keep:     # wave-1 plaza: generic street trees stood among the palms
        try:
            import sys as _s; _s.path.insert(0, HERE)
            from hero_wave1 import plaza_rect
            keep['noTrees'] = [[[round(p[0], 1), round(p[1], 1)] for p in plaza_rect()]]
        except Exception as e: print('noTrees', e)
    # generic trees never grow inside a hero: one zone per hidden footprint (1.5 m margin), on top of any plaza zones
    try:
        import sys as _s; _s.path.insert(0, HERE)
        from hero_lib import ring_of as _ro, ring_out as _rout, ring_offset as _roff
        zs = []
        for i in keep.get('hide', []):
            r = _ro(i)
            if len(r) >= 3: zs.append([[round(p[0], 1), round(p[1], 1)] for p in _roff(_rout(r), 1.5)])
        if zs: keep['noTrees'] = (keep.get('noTrees') or []) + zs
    except Exception as e: print('noTrees', d['id'], e)
    if d['id'] in NEAR_OVERRIDE and 'near' not in keep: keep['near'] = NEAR_OVERRIDE[d['id']]   # finned towers: flat LOD sooner (no shimmer)
    for dr in (keep.get('interior') or {}).get('doors', []):     # v1 door yaws were swapped (faced the wall)
        if dr.get('v', 1) < 2:
            import math
            dr['out'][3] = round(dr['out'][3] + math.pi, 3); dr['in'][3] = round(dr['in'][3] + math.pi, 3); dr['v'] = 2
    # street-level review camera: across the street from the longest open facade of the main footprint
    try:
        import sys as _s; _s.path.insert(0, HERE)
        from hero_wave1 import ring_edges, neighbour_top, sidewalk
        from hero_lib import ring_of, edge_n, v2len, v2sub, v2lerp
        from hero_lib import sites as _sites, buildings_near, point_in
        SS = [st for S in _sites().values() for st in S['streets']]
        def on_street(p):
            best_d = 1e9
            for st in SS:
                P = st['pts']
                if abs(P[0][0] - p[0]) > 400 and abs(P[-1][0] - p[0]) > 400: continue
                for k in range(len(P) - 1):
                    ax, az = P[k][:2]; bx, bz = P[k + 1][:2]; ex, ez = bx - ax, bz - az; l2 = ex * ex + ez * ez or 1
                    t = max(0, min(1, ((p[0] - ax) * ex + (p[1] - az) * ez) / l2))
                    best_d = min(best_d, math.hypot(p[0] - ax - ex * t, p[1] - az - ez * t))
            return best_d
        own = set(d['hide']); cands = []
        for a, b in ring_edges(ring_of(d['hide'][0])):
            L = v2len(v2sub(b, a))
            if L < 6 or neighbour_top(a, b, own) is not None: continue
            n = edge_n(a, b); m = v2lerp(a, b, 0.5)
            for dist in (18, 24, 30, 14):
                c = (m[0] + n[0] * dist, m[1] + n[1] * dist)
                if on_street(c) < 7 and not any(point_in(bb['ring'], *c) for bb in buildings_near(c[0], c[1], 60)):
                    cands.append((L, a, b, dist)); break
        best = max(cands, key=lambda q: q[0]) if cands else None
        if best:
            L, a, b, dist = best; n = edge_n(a, b); m = v2lerp(a, b, 0.5)
            c = (m[0] + n[0] * dist, m[1] + n[1] * dist)
            y = sidewalk(*c) + 1.7
            keep['view'] = [round(c[0], 1), round(y, 1), round(c[1], 1), round(m[0], 1), round(y + min(30, (d.get('top', 40) - y) * 0.35 + 6), 1), round(m[1], 1)]
    except Exception as e:
        print('view', d['id'], e)
    sites.append(keep)
with open(OUT, 'w') as f:
    f.write('// GENERATED by tools/blender/hero_index.py from the Blender hero builds. Do not edit by hand.\n')
    f.write('// origin = [x, yBase, z] (world); hide = OSM building indices replaced; colliders in world coordinates.\n')
    f.write('export const HERO_SITES = ' + json.dumps(sites, separators=(',', ':')) + ';\n')
print('hero_sites.js:', len(sites), 'sites', os.path.getsize(OUT) // 1024, 'KB')
