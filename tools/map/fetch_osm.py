# Downloads the real-world source data for the 1:1 San Francisco map into tools/map/raw/ (not shipped; bake.py turns it
# into public/assets/map/). OpenStreetMap data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
# Usage: python tools/map/fetch_osm.py [roads|buildings|areas|all]
import json, os, sys, time, urllib.request, urllib.parse
RAW = os.path.join(os.path.dirname(__file__), 'raw')
BBOX = (37.700, -122.530, 37.845, -122.355)            # south, west, north, east: SF + Marin Headlands + Treasure Island
EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
UA = {'User-Agent': 'hillbomb-sf map bake (personal game project)'}

def bb(b): return f'({b[0]},{b[1]},{b[2]},{b[3]})'
def query(body, b):
    return f'[out:json][timeout:600][maxsize:1000000000];({body.replace("BB", bb(b))});out body geom qt;'

Q = {
  'drive': '''way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|pedestrian|raceway)$"]BB;''',
  'paths': '''way["highway"~"^(footway|path|cycleway|steps|bridleway|corridor|elevator|platform)$"]BB;way["railway"~"^(rail|light_rail|tram|subway|funicular|narrow_gauge|disused|abandoned)$"]BB;''',
  'nodes': '''node["highway"~"^(traffic_signals|stop|crossing|street_lamp|give_way|turning_circle|motorway_junction|bus_stop|mini_roundabout)$"]BB;
    node["railway"~"^(stop|station|tram_stop|halt|level_crossing|crossing)$"]BB;''',
  'areas': '''way["natural"]BB;relation["natural"]BB;way["landuse"]BB;relation["landuse"]BB;way["leisure"]BB;relation["leisure"]BB;
    way["amenity"~"^(parking|school|university|hospital|place_of_worship)$"]BB;way["man_made"~"^(pier|breakwater|bridge|groyne|quay|tower|lighthouse)$"]BB;
    relation["man_made"="bridge"]BB;way["waterway"]BB;way["place"~"^(island|islet)$"]BB;relation["place"~"^(island|islet)$"]BB;
    way["area:highway"]BB;way["aeroway"]BB;way["tourism"~"^(attraction|museum|viewpoint)$"]BB;node["natural"~"^(tree|peak)$"]BB;''',
  'buildings': '''way["building"]BB;relation["building"]BB;way["building:part"]BB;relation["building:part"]BB;''',
}

def fetch(name, b, out):
    if os.path.exists(out): print('have', out); return
    data = urllib.parse.urlencode({'data': query(Q[name], b)}).encode()
    for attempt in range(6):
        ep = EP[attempt % len(EP)]
        try:
            t = time.time()
            req = urllib.request.Request(ep, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=1200) as r: raw = r.read()
            j = json.loads(raw)
            if j.get('remark') and 'error' in j['remark'].lower(): raise RuntimeError(j['remark'][:200])
            with open(out, 'wb') as f: f.write(raw)
            print(f'{name} {out} {len(raw)/1e6:.1f} MB {len(j["elements"])} elements {time.time()-t:.0f}s via {ep}', flush=True)
            return
        except Exception as e:
            print(f'{name} attempt {attempt} {ep}: {e}', flush=True); time.sleep(15 + 15 * attempt)
    raise SystemExit(f'failed {name}')

def main():
    os.makedirs(RAW, exist_ok=True)
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    s, w, n, e = BBOX
    # every category in slices so each Overpass request stays small (bake.py de-duplicates by element id)
    def sliced(name, ni, nj):
        k = 0
        for i in range(ni):
            for j in range(nj):
                b = (s + (n - s) * i / ni, w + (e - w) * j / nj, s + (n - s) * (i + 1) / ni, w + (e - w) * (j + 1) / nj)
                fetch(name, b, os.path.join(RAW, f'osm_{name}_{k}.json')); k += 1
    if which in ('roads', 'all'): sliced('drive', 2, 2); sliced('nodes', 1, 1); sliced('paths', 2, 2)
    if which in ('areas', 'all'): sliced('areas', 2, 2)
    if which in ('buildings', 'all'): sliced('buildings', 4, 4)

if __name__ == '__main__':
    main()
