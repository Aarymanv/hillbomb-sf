# Stage 2: road graph from OSM. Split ways at shared nodes, classify, widths/lanes/oneway, clip to the map, heights:
# ground roads follow the DEM with FLAT intersection plateaus (the SF "crest" profile), bridges/viaducts and tunnels
# are solved over the structure graph from their ground anchors. Output: cache/roads.pkl (graph + dense profiles).
import math, os, pickle, time
from collections import defaultdict
import numpy as np
from scipy import ndimage
from common import CACHE, CELL, grid_extent, load_osm, proj, rdp, parse_len, polylen

# class: (rank, default total lanes, lane width, default oneway, parking per side, sidewalk, traffic ok)
CLS = {
    'motorway':       (0, 6, 3.7, False, 0.0, 0.0, True),
    'trunk':          (1, 4, 3.5, False, 0.0, 2.5, True),
    'primary':        (2, 4, 3.3, False, 2.3, 3.8, True),
    'secondary':      (3, 4, 3.25, False, 2.3, 3.5, True),
    'tertiary':       (4, 2, 3.25, False, 2.3, 3.2, True),
    'unclassified':   (5, 2, 3.2, False, 2.2, 3.0, True),
    'residential':    (5, 2, 3.1, False, 2.2, 3.0, True),
    'living_street':  (6, 2, 3.0, False, 0.0, 2.0, False),
    'busway':         (3, 2, 3.4, False, 0.0, 3.5, False),
    'road':           (5, 2, 3.2, False, 0.0, 2.5, True),
    'service':        (7, 1, 3.4, False, 0.0, 0.0, False),
    'pedestrian':     (7, 1, 5.0, False, 0.0, 0.0, False),
    'track':          (8, 1, 3.6, False, 0.0, 0.0, False),
    'motorway_link':  (1, 1, 3.7, True, 0.0, 0.0, True),
    'trunk_link':     (2, 1, 3.6, True, 0.0, 0.0, True),
    'primary_link':   (3, 1, 3.5, False, 0.0, 0.0, True),
    'secondary_link': (4, 1, 3.5, False, 0.0, 0.0, True),
    'tertiary_link':  (5, 1, 3.4, False, 0.0, 0.0, True),
}
MINOR = {'service', 'track', 'pedestrian', 'living_street'}
SKIP_SERVICE = {'driveway', 'parking_aisle', 'drive-through', 'parking', 'emergency_access', 'bus'}


def classify(t):
    hw = t.get('highway')
    if hw not in CLS or t.get('area') == 'yes':
        return None
    if hw == 'service' and (t.get('service') in SKIP_SERVICE or t.get('access') in ('private', 'no')):
        return None
    if t.get('construction') or t.get('disused'):
        return None
    rank, lanes0, lw, ow0, park0, side0, traffic = CLS[hw]
    ow = t.get('oneway')
    oneway = 1 if ow in ('yes', 'true', '1') else -1 if ow == '-1' else 0
    if ow is None and (ow0 or hw == 'motorway' or t.get('junction') in ('roundabout', 'circular')):
        oneway = 1
    lanes = t.get('lanes')
    try:
        lanes = max(1, int(float(str(lanes).split(';')[0])))
    except (TypeError, ValueError):
        lanes = (3 if hw == 'motorway' else 2 if hw in ('trunk', 'primary') else 1) if oneway else lanes0
    if hw == 'service':
        lanes = 1 if t.get('service') == 'alley' or oneway else 2
        lw = 2.9 if t.get('service') == 'alley' else 3.1
    park = park0
    pl = t.get('parking:both') or t.get('parking:lane:both')
    if pl in ('no', 'no_parking', 'no_stopping', 'separate'): park = 0.0
    if oneway and hw in ('primary', 'secondary', 'tertiary') and lanes >= 3: park = min(park, 2.3)
    nside = 2 if park > 0 else 0
    if (t.get('parking:left') or t.get('parking:lane:left')) in ('no', 'no_parking', 'no_stopping'): nside = max(0, nside - 1)
    if (t.get('parking:right') or t.get('parking:lane:right')) in ('no', 'no_parking', 'no_stopping'): nside = max(0, nside - 1)
    width = parse_len(t.get('width'))
    carriage = lanes * lw + nside * park + (1.2 if hw in ('motorway', 'trunk') else 0.0)
    if width and 3 < width < 60: carriage = width
    sw = side0
    s = t.get('sidewalk')
    if s in ('no', 'none'): sw = 0.0
    elif s in ('both', 'left', 'right', 'separate') and sw == 0 and hw not in ('motorway', 'motorway_link', 'trunk_link'): sw = 2.5
    bridge = t.get('bridge') not in (None, 'no') or t.get('man_made') == 'bridge'
    tunnel = t.get('tunnel') not in (None, 'no', 'building_passage') and t.get('covered') != 'yes'
    try:
        layer = int(t.get('layer', '0'))
    except ValueError:
        layer = 0
    surface = t.get('surface', '')
    unpaved = hw == 'track' or surface in ('unpaved', 'dirt', 'gravel', 'ground', 'compacted', 'fine_gravel', 'sand', 'grass')
    restricted = hw in ('busway', 'pedestrian') or t.get('motor_vehicle') in ('no', 'destination') and hw in ('primary', 'secondary') or t.get('access') == 'no'
    name = t.get('name') or t.get('ref') or ''
    cw = [t.get(k) for k in ('cycleway', 'cycleway:both', 'cycleway:right', 'cycleway:left')]
    return dict(hw=hw, rank=rank, lanes=lanes, oneway=oneway, width=round(carriage, 2), sidewalk=sw, park=park if nside else 0.0,
                parkSides=nside, bridge=bridge, tunnel=tunnel, layer=layer, unpaved=unpaved, traffic=traffic and not restricted,
                restricted=restricted, name=name, ref=t.get('ref', ''), maxspeed=parse_len(str(t.get('maxspeed', '')).replace('mph', ''), None),
                cycle=any(v in ('lane', 'track', 'opposite_lane', 'opposite_track') for v in cw),
                cycleTrack=any(v in ('track', 'opposite_track') for v in cw),
                sharrow=any(v == 'shared_lane' for v in cw))


def dem_sampler(dem, X0, Z0):
    coef = ndimage.spline_filter(dem, order=3, mode='nearest')
    def sample(x, z):
        x = np.asarray(x, np.float64); z = np.asarray(z, np.float64)
        return ndimage.map_coordinates(coef, [((z - Z0) / CELL).ravel(), ((x - X0) / CELL).ravel()], order=3, mode='nearest', prefilter=False).reshape(x.shape)
    return sample


def resample(pts, step):
    """Insert points so no segment is longer than step. pts (N,2). Returns (M,2) and cumulative s."""
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(math.ceil(L / step)))
        for k in range(1, n + 1):
            out.append(a + (b - a) * (k / n))
    P = np.array(out)
    d = np.hypot(*np.diff(P, axis=0).T)
    return P, np.concatenate([[0], np.cumsum(d)])


def run():
    t0 = time.time()
    X0, Z0, X1, Z1, NX, NZ = grid_extent()
    dem = np.load(os.path.join(CACHE, 'dem.npy'))
    H = dem_sampler(dem, X0, Z0)
    ways = []
    for el in load_osm('drive'):
        info = classify(el.get('tags', {}))
        if not info or not el.get('geometry') or any(g is None for g in el['geometry']):
            continue
        lat = np.array([g['lat'] for g in el['geometry']]); lon = np.array([g['lon'] for g in el['geometry']])
        x, z = proj(lat, lon)
        ways.append((el['id'], el['nodes'], np.stack([x, z], 1), info))
    # node usage -> split points
    use = defaultdict(int)
    for _, nodes, _, _ in ways:
        for i, n in enumerate(nodes):
            use[n] += 1 if 0 < i < len(nodes) - 1 else 2
    M = 30.0
    inside = lambda p: X0 + M <= p[0] <= X1 - M and Z0 + M <= p[1] <= Z1 - M
    nodes = {}          # osm id -> index
    npos = []
    def node_at(osm_id, p):
        if osm_id not in nodes:
            nodes[osm_id] = len(npos); npos.append((float(p[0]), float(p[1])))
        return nodes[osm_id]
    edges = []
    for wid, nids, P, info in ways:
        if info['oneway'] == -1:
            nids = nids[::-1]; P = P[::-1]; info = dict(info, oneway=1)
        start = 0
        for i in range(1, len(nids)):
            if use[nids[i]] >= 2 or i == len(nids) - 1:
                seg = P[start:i + 1]; sid = nids[start:i + 1]
                # clip to the map: keep the longest inside run
                ins = np.array([inside(p) for p in seg])
                if ins.all():
                    runs = [(0, len(seg))]
                else:
                    runs, k = [], 0
                    while k < len(seg):
                        if ins[k]:
                            j = k
                            while j < len(seg) and ins[j]: j += 1
                            runs.append((k, j)); k = j
                        else: k += 1
                for (a, b) in runs:
                    if b - a < 2: continue
                    pts = seg[a:b]
                    ia = node_at(sid[a], pts[0]); ib = node_at(sid[b - 1], pts[-1])
                    if ia == ib and len(pts) < 4: continue
                    edges.append(dict(a=ia, b=ib, pts=rdp(pts, 0.2), way=wid, **info))
                start = i
    npos = np.array(npos)
    print(f'raw graph: {len(npos)} nodes {len(edges)} edges')
    # connected components; drop tiny islands of road
    parent = list(range(len(npos)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for e in edges:
        ra, rb = find(e['a']), find(e['b'])
        if ra != rb: parent[ra] = rb
    comp_len = defaultdict(float)
    for e in edges: comp_len[find(e['a'])] += polylen(e['pts'])
    edges = [e for e in edges if comp_len[find(e['a'])] > 250]
    main_comp = max(comp_len, key=comp_len.get)
    for e in edges: e['main'] = find(e['a']) == main_comp
    # re-index nodes
    used = sorted({e['a'] for e in edges} | {e['b'] for e in edges})
    remap = {o: i for i, o in enumerate(used)}
    npos = npos[used]
    for e in edges: e['a'] = remap[e['a']]; e['b'] = remap[e['b']]
    N = len(npos)
    inc = defaultdict(list)
    for k, e in enumerate(edges): inc[e['a']].append(k); inc[e['b']].append(k)
    print(f'graph: {N} nodes {len(edges)} edges, {sum(polylen(e["pts"]) for e in edges)/1000:.0f} km')

    # ------------------------------------------------------------------ heights
    struct = lambda e: e['bridge'] or e['tunnel']
    ground_node = np.array([any(not struct(edges[k]) for k in inc[i]) for i in range(N)])
    # ground node height: DEM mean over a 3 m disk
    offs = np.array([[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]], float)
    hn = np.array([H(npos[i, 0] + offs[:, 0], npos[i, 1] + offs[:, 1]).mean() for i in range(N)])
    # junction clusters: a ground junction and its neighbours along a < 10 m ground edge (offset T-junctions, divided-road
    # crossings, a bridge abutment next to a junction: Hyde St over the Broadway cut) share one table height, so there
    # is no 1-3 m step between two plateaus. Clusters wider than 25 m keep their own heights.
    deg = np.array([len(inc[i]) for i in range(N)])
    cpar = list(range(N))
    def cfind(i):
        while cpar[i] != i: cpar[i] = cpar[cpar[i]]; i = cpar[i]
        return i
    for e in edges:
        if not struct(e) and max(deg[e['a']], deg[e['b']]) >= 3 and polylen(e['pts']) < 10.0:
            ra_, rb_ = cfind(e['a']), cfind(e['b'])
            if ra_ != rb_: cpar[ra_] = rb_
    # side lanes that don't get an intersection table on the street they join: service / alleys, the SF "Places",
    # "Alleys", "Terraces" ..., and short dead ends (Russell St, Delgado Pl and Warner Pl on Hyde made a staircase of
    # tables every 20 m that launched cars at 15 m/s)
    LANE_WORDS = ('Place', 'Alley', 'Terrace', 'Court', 'Lane', 'Walk', 'Row', 'Path')
    def minor_stem(o, j):
        if o['hw'] in MINOR: return True
        if o['hw'] not in ('residential', 'unclassified', 'living_street', 'road'): return False
        if o['name'].split(' ')[-1] in LANE_WORDS: return True
        far = o['b'] if o['a'] == j else o['a']
        return deg[far] == 1 and polylen(o['pts']) < 150
    cl = defaultdict(list)
    for i in range(N): cl[cfind(i)].append(i)
    cluster = {}
    for mem in cl.values():
        if len(mem) > 1 and all(ground_node[j] for j in mem) and np.ptp(npos[mem], axis=0).max() < 25.0:
            hn[mem] = hn[mem].mean()
            for j in mem: cluster[j] = mem
    # structure-only nodes: Laplacian solve over structure edges, anchors fixed
    free = np.where(~ground_node)[0]
    if len(free):
        nb = defaultdict(list)
        for e in edges:
            if struct(e):
                L = max(1.0, polylen(e['pts']))
                nb[e['a']].append((e['b'], 1 / L)); nb[e['b']].append((e['a'], 1 / L))
        clear = np.zeros(N)
        for i in free:
            g = hn[i]
            br = any(edges[k]['bridge'] for k in inc[i])
            clear[i] = (max(g, 0) + 6.5) if br else -1e9          # bridges clear the ground/water by >= 6.5 m
        h = hn.copy()
        for i in free: h[i] = max(hn[i], clear[i])
        for it in range(3000):
            for i in free:
                s = w = 0.0
                for j, wt in nb[i]: s += h[j] * wt; w += wt
                if w: h[i] = max(s / w, clear[i]) if it > 200 else s / w
        # tunnels must stay >= 7 m under the surface where possible (else they become cuts)
        for i in free:
            if any(edges[k]['tunnel'] for k in inc[i]) and not any(edges[k]['bridge'] for k in inc[i]):
                h[i] = min(h[i], hn[i] - 7.0) if hn[i] - h[i] < 7 and hn[i] - 7 > h[i] - 12 else h[i]
        hn = h
    # layered decks sharing a footprint (Bay Bridge approaches / YBI viaduct, I 80 upper / lower): +4.5 m per layer above 1,
    # applied at the structure-only nodes whose edges are all layered; the edges then ramp between their nodes. (The old
    # per-edge sqrt(sin(pi u)) hump had a vertical tangent at both ends: 56-107 % grades, a ramp into the sky on the YBI
    # viaduct, Fleet Week / Lowtide 5.)
    for e in edges:
        e['deckOffset'] = 4.5 * (e['layer'] - 1) if e['bridge'] and e['layer'] >= 2 and 'I 80' in (e['ref'] or '') else 0.0
    for i in free:
        offs = [edges[k]['deckOffset'] for k in inc[i]]
        if offs and min(offs) > 0: hn[i] += min(offs)

    # hero bridges: real deck profiles (Golden Gate, Bay Bridge west span stacked decks), see hero_bridges()
    hero = hero_bridges(edges)
    for k, (fn, snap) in hero.items():
        e = edges[k]; e['bridge'] = e['bridge'] or not e['tunnel']; e['hero'] = (fn, snap)
    for k, (fn, snap) in hero.items():
        e = edges[k]
        for end in ('a', 'b'):
            i = e[end]; p = npos[i]
            y = float(fn(np.array([p[0]]), np.array([p[1]]))[0])
            others = [j for j in inc[i] if j not in hero]
            if others and abs(hn[i] - y) > 0.3:
                print(f'  hero edge {k}: node {i} shared with {others} keeps {hn[i]:.1f} (profile {y:.1f})')
            elif not others: hn[i] = y

    # per-edge dense profile
    portal = [ground_node[i] and any(edges[k]['tunnel'] and not edges[k]['bridge'] for k in inc[i]) for i in range(N)]
    nportal = []
    nflat = np.full(N, 7.0)          # flat radius left at each node once the vertical curves are in (stage_land's plateau disk)
    for e in edges:
        P, s = resample(e['pts'], 3.0)
        L = s[-1]
        ha, hb = hn[e['a']], hn[e['b']]
        if e.get('hero'):
            fn, snap = e.pop('hero'); e['heroDeck'] = True
            if snap: P = snap(P, s)
            y = fn(P[:, 0], P[:, 1])
            # pin the ends to the node heights (joints with non-hero edges), blended over 40 m
            ba = max(40.0, abs(ha - y[0]) * 25); bb = max(40.0, abs(hb - y[-1]) * 25)
            wa = np.clip(1 - s / ba, 0, 1); wb = np.clip(1 - (L - s) / bb, 0, 1)
            wa = wa * wa * (3 - 2 * wa); wb = wb * wb * (3 - 2 * wb)
            y = y + (ha - y[0]) * wa + (hb - y[-1]) * wb
        elif struct(e):
            u = s / max(L, 1e-6)
            y = ha + (hb - ha) * (u * u * (3 - 2 * u) * 0.5 + u * 0.5)
        else:
            # ground along the road, sampled 18 m past both ends on the extended end directions so the smoothing
            # (sigma ~ 6 m) keeps the grade through the nodes instead of flattening ('nearest' padding made a lip at every node)
            def ext(p0, p1):
                d = p0 - p1; l = math.hypot(d[0], d[1]) or 1.0
                return np.array([p0 + d / l * (3.0 * q) for q in (6, 5, 4, 3, 2, 1)])
            PX = np.vstack([ext(P[0], P[1]), P, ext(P[-1], P[-2])[::-1]])
            g = H(PX[:, 0], PX[:, 1])
            g = ndimage.gaussian_filter1d(g, 2.0, mode='nearest')[6:-6]
            # tunnel portals: the DEM in a portal cut / under the viaduct leaving it is not the road (YBI east portal: 59.1 m
            # at the bore, a 54.4 m dip 8 m out = a 4.6 m drop out of the tunnel). Where the DEM wanders > 1 m off the straight
            # line from the portal to the ground 35 m out, the road takes that line.
            for at_b in (False, True):
                i_n = e['b'] if at_b else e['a']
                if not portal[i_n]: continue
                gg = g[::-1] if at_b else g                     # (a view: writes go into g)
                ss = (L - s)[::-1] if at_b else s
                j = int(np.searchsorted(ss, min(35.0, 0.8 * L)))
                if j < 3 or j >= len(gg): continue
                ramp = hn[i_n] + (gg[j] - hn[i_n]) * ss[:j] / ss[j]
                dev = float(np.abs(gg[:j] - ramp).max())
                if dev > 1.0:
                    gg[:j] = ramp; nportal.append((e['name'], round(dev, 1)))
            # flat plateaus (the SF intersection "tables") only at real junctions (degree >= 3): half the widest crossing
            # street + 2 m (crosswalk). Way splits (degree 2) and dead ends keep the street's grade.
            # the crossing streets: not this street's own continuation (same name), not cluster-internal links, and
            # alleys / service lanes don't flatten a through street
            def plateau(i, other):
                mem = cluster.get(i, [i])
                if len(mem) == 1 and deg[i] < 3: return 0.0
                ws, cross = [], 0
                for j in mem:
                    for k in inc[j]:
                        o = edges[k]
                        if o is e or (o['a'] in mem and o['b'] in mem): continue
                        if o['name'] and o['name'] == e['name']: continue
                        cross += 1
                        if e['hw'] not in MINOR and minor_stem(o, j): continue
                        ws.append((o['width'] / 2 + 2.0, o['rank']))
                # a T onto this street by a lower-class side street: the through street keeps its grade
                if cross == 1 and ws and ws[0][1] > e['rank']: return 0.0
                return min(max(w for w, _ in ws) if ws else 0.0, L * 0.4)
            ra, rb = plateau(e['a'], e['b']), plateau(e['b'], e['a'])
            y, fa, fb = vertical_curves(s, g, L, ra, rb, ha, hb)
            nflat[e['a']] = min(nflat[e['a']], fa); nflat[e['b']] = min(nflat[e['b']], fb)
        e['dense'] = np.column_stack([P, y])
        e['len'] = L
        # output polyline: 3D simplify of the dense profile (keeps curves + grade changes)
        e['pts3'] = rdp3(e['dense'], 0.2, 0.05)
    print(f'tunnel portals: {sum(portal)} nodes, {len(nportal)} approach profiles straightened: {nportal}')
    out = dict(npos=npos, nh=hn, edges=edges, ground=ground_node, nflat=nflat, extent=(X0, Z0, X1, Z1, NX, NZ))
    with open(os.path.join(CACHE, 'roads.pkl'), 'wb') as f: pickle.dump(out, f)
    nb_ = sum(1 for e in edges if e['bridge']); nt = sum(1 for e in edges if e['tunnel'])
    print(f'heights done: {nb_} bridge edges, {nt} tunnel edges, {len(free)} structure nodes  {time.time()-t0:.0f}s')
    return out


# ---------------------------------------------------------------------------------------------------------- vertical curves
VC_MIN, VC_MAX = 8.0, 16.0
def vertical_curves(s, g, L, ra, rb, ha, hb):
    """SF intersection tables with real vertical curves. The design profile is flat on the plateaus (ra / rb from the
    nodes) and follows the smoothed ground g between them, shifted linearly to meet the plateau heights. Each grade break
    gets a vertical curve of length T = 6 m + 40 m x grade (8-16 m): the break moves T/4 out from the plateau edge and the
    profile is box-filtered over T (a box filter of a kink is an exact parabola, curvature = grade / T). The table keeps
    most of its flat, the block keeps its grade. Ends without a plateau (ra = 0) get no curve. Returns (y, flat a, flat b)."""
    def design(pa, pb):
        ga = np.interp(pa, s, g); gb = np.interp(L - pb, s, g)
        mid = np.clip((s - pa) / max(L - pa - pb, 1e-6), 0, 1)
        y = g + (ha - ga) * (1 - mid) + (hb - gb) * mid
        if pa > 0: y[s <= pa] = ha
        if pb > 0: y[s >= L - pb] = hb
        return y
    y0 = design(ra, rb)
    Lm = L - ra - rb
    if Lm < 4 or (ra <= 0 and rb <= 0): return y0, ra, rb
    def grade(s0, sgn):                      # mean grade over the 12 m beyond the plateau edge
        d = min(12.0, Lm * 0.5)
        return abs(np.interp(s0 + sgn * d, s, y0) - np.interp(s0, s, y0)) / d
    Ta = min(float(np.clip(6 + 40 * grade(ra, 1), VC_MIN, VC_MAX)), Lm * 0.45) if ra > 0 else 0.0
    Tb = min(float(np.clip(6 + 40 * grade(L - rb, -1), VC_MIN, VC_MAX)), Lm * 0.45) if rb > 0 else 0.0
    pa, pb = ra + Ta / 4, rb + Tb / 4
    y1 = design(pa, pb)
    # variable-width box filter on a 0.25 m grid; beyond the nodes the plateau (or the end grade) continues
    sf = np.arange(-VC_MAX, L + VC_MAX + 0.25, 0.25)
    yf = np.interp(sf, s, y1)
    if ra <= 0: yf[sf < 0] = y1[0] + (y1[1] - y1[0]) / max(s[1], 1e-6) * sf[sf < 0]
    if rb <= 0: yf[sf > L] = y1[-1] + (y1[-1] - y1[-2]) / max(s[-1] - s[-2], 1e-6) * (sf[sf > L] - L)
    C = np.concatenate([[0.0], np.cumsum((yf[1:] + yf[:-1]) * 0.125)])
    lo, hi = pa + Ta / 2, L - pb - Tb / 2
    u = np.clip((s - lo) / max(hi - lo, 1e-6), 0, 1); u = u * u * (3 - 2 * u)
    T = np.maximum(Ta + (Tb - Ta) * u, 0.5)
    y = (np.interp(s + T / 2, sf, C) - np.interp(s - T / 2, sf, C)) / T
    y[0] = y1[0]; y[-1] = y1[-1]
    return y, max(0.0, pa - Ta / 2), max(0.0, pb - Tb / 2)


# ---------------------------------------------------------------------------------------------------------- hero bridges
# Deck profiles that the landmarks module (src/world/landmarks/v2, src/world/v2/anchors2.js) builds its structures on.
# Golden Gate: axis from the south tower centre; road 75 m at both towers, 77 m crown, joints 55.2 (s -674) / 71.5 (s 2042).
GG_O, GG_D = np.array([-5153.8, -4346.0]), np.array([-0.0918, -0.9958])
def gg_deck(s):
    s = np.asarray(s, float); y = np.full_like(s, 71.5)
    y[s <= -674] = 55.2
    m = (s > -674) & (s < 0); t = (s[m] + 674) / 674; y[m] = 55.2 + (75 - 55.2) * (t * (2 - t))
    m = (s >= 0) & (s <= 1280); u = s[m] / 1280 * 2 - 1; y[m] = 75 + 2 * (1 - u * u)
    m = (s > 1280) & (s < 2042); t = (s[m] - 1280) / (2042 - 1280); y[m] = 75 + (71.5 - 75) * t
    return y
# Bay Bridge west span: SF (2525.8,-1254.6) -> YBI (4590.8,-3682.5). Piers (surface raster): W2 649, W3 1372, W5 2128,
# W6 2831; W1 (SF anchorage) 296, W4 (centre anchorage) 1750, W7 (YBI anchorage) 3184. Upper deck (westbound), lower
# (eastbound) stacked 9.5 m below on the same centreline.
BAY_A, BAY_B = np.array([2525.8, -1254.6]), np.array([4590.8, -3682.5])
BAY_D = (BAY_B - BAY_A) / np.linalg.norm(BAY_B - BAY_A)
BAY_UP = [(-124, 38.8), (0, 39.8), (296, 50.0), (649, 63.0), (1010, 68.0), (1372, 63.0), (1750, 62.0), (2128, 63.0),
          (2480, 68.0), (2831, 63.0), (3187, 63.5), (3319, 64.5)]
BAY_GAP = 9.5
def axis_s(O, D, x, z): return (np.asarray(x) - O[0]) * D[0] + (np.asarray(z) - O[1]) * D[1]
def axis_l(O, D, x, z): return -(np.asarray(x) - O[0]) * D[1] + (np.asarray(z) - O[1]) * D[0]
def bay_upper(s):
    from scipy.interpolate import PchipInterpolator
    k = np.array(BAY_UP); return PchipInterpolator(k[:, 0], k[:, 1], extrapolate=True)(np.clip(s, k[0, 0], k[-1, 0]))
def bay_lower(s):
    from scipy.interpolate import PchipInterpolator
    s = np.asarray(s, float)
    k = [(-26, 23.0), (100, 28.5)] + [(a, b - BAY_GAP) for a, b in BAY_UP if a >= 296 and a <= 3187] + [(3314, 55.0), (3490, 59.1)]
    k = np.array(k); return PchipInterpolator(k[:, 0], k[:, 1])(np.clip(s, k[0, 0], k[-1, 0]))


def hero_bridges(edges):
    """edge index -> (profile(x, z) -> y, lateral snap(P, s) -> P or None). Edges are checked by name/ref."""
    out = {}
    gg = lambda x, z: gg_deck(axis_s(GG_O, GG_D, x, z))
    for k, e in enumerate(edges):
        if 'Golden Gate Bridge' not in e['name']: continue
        P = np.asarray(e['pts']); s = axis_s(GG_O, GG_D, P[:, 0], P[:, 1]); l = axis_l(GG_O, GG_D, P[:, 0], P[:, 1])
        if s.min() >= -680 and s.max() <= 2050 and np.abs(l).max() < 70: out[k] = (gg, None)
    up = lambda x, z: bay_upper(axis_s(BAY_A, BAY_D, x, z))
    lo = lambda x, z: bay_lower(axis_s(BAY_A, BAY_D, x, z))
    def snap(P, s):
        # pull the eastbound (lower deck) way onto the upper deck centreline, tapering to the OSM position at its ends
        sa = axis_s(BAY_A, BAY_D, P[:, 0], P[:, 1]); la = axis_l(BAY_A, BAY_D, P[:, 0], P[:, 1])
        w = np.clip(np.minimum(s, s[-1] - s) / 90.0, 0, 1); w = w * w * (3 - 2 * w)
        lt = la * (1 - w) + 0.45 * w
        return np.column_stack([BAY_A[0] + BAY_D[0] * sa - BAY_D[1] * lt, BAY_A[1] + BAY_D[1] * sa + BAY_D[0] * lt])
    for idx, fn, sn in [(28690, up, None), (4751, up, None), (5750, up, None), (8636, lo, None), (22914, lo, snap),
                        (11585, lo, None), (8684, lo, None), (8637, lo, None)]:
        if idx < len(edges) and 'I 80' in (edges[idx]['ref'] or ''): out[idx] = (fn, sn)
        else: print(f'  WARNING: Bay Bridge edge {idx} not found (OSM changed?)')
    print(f'  hero bridge edges: {len(out)}')
    return out


def rdp3(P, eh, ev):
    """3D RDP: keep a point if it deviates > eh horizontally or > ev vertically from the chord."""
    n = len(P)
    if n < 3: return P
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True
    st = [(0, n - 1)]
    while st:
        a, b = st.pop()
        if b <= a + 1: continue
        A, B = P[a], P[b]
        d = B[:2] - A[:2]; L2 = d @ d
        Q = P[a + 1:b]
        t = np.clip(((Q[:, :2] - A[:2]) @ d) / L2, 0, 1) if L2 > 1e-12 else np.zeros(len(Q))
        cx = A[0] + d[0] * t; cz = A[1] + d[1] * t; cy = A[2] + (B[2] - A[2]) * t
        dh = np.hypot(Q[:, 0] - cx, Q[:, 1] - cz) / eh
        dv = np.abs(Q[:, 2] - cy) / ev
        err = np.maximum(dh, dv)
        k = int(np.argmax(err))
        if err[k] > 1:
            m = a + 1 + k; keep[m] = True; st.append((a, m)); st.append((m, b))
    return P[keep]


if __name__ == '__main__':
    run()
