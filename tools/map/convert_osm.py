# Converts raw/SanFrancisco.osm.gz (BBBike extract, OSM XML; (c) OpenStreetMap contributors, ODbL 1.0) into the same
# per-category JSON shape Overpass "out body geom" returns (raw/osm_<cat>_0.json), cropped to BBOX.
import gzip, json, os, re, time
import xml.etree.ElementTree as ET
from common import RAW, BBOX

DRIVE = re.compile(r'^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|pedestrian|raceway)$')
PATHS_HW = re.compile(r'^(footway|path|cycleway|steps|bridleway|corridor|platform)$')
RAIL = re.compile(r'^(rail|light_rail|tram|subway|funicular|narrow_gauge|disused|abandoned)$')
NODE_HW = re.compile(r'^(traffic_signals|stop|crossing|street_lamp|give_way|turning_circle|motorway_junction|bus_stop|mini_roundabout)$')
NODE_RW = re.compile(r'^(stop|station|tram_stop|halt|level_crossing|crossing)$')
AREA_AMENITY = re.compile(r'^(parking|school|university|hospital|place_of_worship)$')
AREA_MANMADE = re.compile(r'^(pier|breakwater|bridge|groyne|quay|tower|lighthouse)$')


def area_tags(t):
    return ('natural' in t or 'landuse' in t or 'leisure' in t or 'waterway' in t or 'area:highway' in t or 'aeroway' in t
            or AREA_AMENITY.match(t.get('amenity', '')) or AREA_MANMADE.match(t.get('man_made', ''))
            or t.get('place') in ('island', 'islet') or t.get('tourism') in ('attraction', 'museum', 'viewpoint'))


def main():
    t0 = time.time()
    s, w, n, e = BBOX
    pad = 0.01
    inb = lambda la, lo: s - pad <= la <= n + pad and w - pad <= lo <= e + pad
    coords = {}
    out = {k: [] for k in ('drive', 'paths', 'nodes', 'areas', 'buildings')}
    ways = {}
    rels = []
    ctx = ET.iterparse(gzip.open(os.path.join(RAW, 'SanFrancisco.osm.gz')), events=('end',))
    nn = nw = nr = 0
    for ev, el in ctx:
        tag = el.tag
        if tag == 'node':
            nn += 1
            la, lo = float(el.get('lat')), float(el.get('lon'))
            i = int(el.get('id'))
            coords[i] = (la, lo)
            tg = {c.get('k'): c.get('v') for c in el if c.tag == 'tag'}
            if tg and inb(la, lo):
                if NODE_HW.match(tg.get('highway', '')) or NODE_RW.match(tg.get('railway', '')):
                    out['nodes'].append({'type': 'node', 'id': i, 'lat': la, 'lon': lo, 'tags': tg})
                elif tg.get('natural') in ('tree', 'peak'):
                    out['areas'].append({'type': 'node', 'id': i, 'lat': la, 'lon': lo, 'tags': tg})
            el.clear()
        elif tag == 'way':
            nw += 1
            refs = [int(c.get('ref')) for c in el if c.tag == 'nd']
            tg = {c.get('k'): c.get('v') for c in el if c.tag == 'tag'}
            i = int(el.get('id'))
            ways[i] = refs
            if tg:
                geo = [coords.get(r) for r in refs]
                if any(g and inb(*g) for g in geo):
                    item = {'type': 'way', 'id': i, 'nodes': refs, 'tags': tg,
                            'geometry': [{'lat': g[0], 'lon': g[1]} if g else None for g in geo]}
                    hw = tg.get('highway', '')
                    if DRIVE.match(hw): out['drive'].append(item)
                    elif PATHS_HW.match(hw) or RAIL.match(tg.get('railway', '')): out['paths'].append(item)
                    if 'building' in tg or 'building:part' in tg: out['buildings'].append(item)
                    elif area_tags(tg): out['areas'].append(item)
            el.clear()
        elif tag == 'relation':
            nr += 1
            tg = {c.get('k'): c.get('v') for c in el if c.tag == 'tag'}
            mem = [(c.get('type'), int(c.get('ref')), c.get('role')) for c in el if c.tag == 'member']
            rels.append((int(el.get('id')), tg, mem))
            el.clear()
    # relations: multipolygon buildings / areas (members carry geometry like Overpass)
    for rid, tg, mem in rels:
        if tg.get('type') not in ('multipolygon', 'building'):
            continue
        isb = 'building' in tg or 'building:part' in tg
        if not (isb or area_tags(tg)):
            continue
        members = []
        hit = False
        for mt, ref, role in mem:
            if mt != 'way' or ref not in ways:
                continue
            geo = [coords.get(r) for r in ways[ref]]
            if any(g and inb(*g) for g in geo): hit = True
            members.append({'type': 'way', 'ref': ref, 'role': role, 'geometry': [{'lat': g[0], 'lon': g[1]} if g else None for g in geo]})
        if hit and members:
            out['buildings' if isb else 'areas'].append({'type': 'relation', 'id': rid, 'tags': tg, 'members': members})
    for k, v in out.items():
        with open(os.path.join(RAW, f'osm_{k}_0.json'), 'w') as f:
            json.dump({'elements': v}, f)
        print(f'{k:10s} {len(v):7d} elements')
    print(f'parsed {nn} nodes {nw} ways {nr} relations in {time.time()-t0:.0f}s')


if __name__ == '__main__':
    main()
