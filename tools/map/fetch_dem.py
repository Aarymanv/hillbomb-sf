# Downloads elevation tiles (Terrarium PNG encoding, AWS Open Data "Terrain Tiles", s3://elevation-tiles-prod; in the US the
# source is USGS 3DEP, public domain; bathymetry from NOAA/GEBCO/ETOPO1) covering the map bbox at zoom 14 (~7.6 m/pixel).
# height_m = R*256 + G + B/256 - 32768
import math, os, urllib.request
from fetch_osm import BBOX, RAW
Z = 14
UA = {'User-Agent': 'hillbomb-sf map bake (personal game project)'}
def tile(lat, lon, z):
    n = 2 ** z; x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return int(x), int(y)
def main():
    s, w, n, e = BBOX
    x0, y0 = tile(n, w, Z); x1, y1 = tile(s, e, Z)
    d = os.path.join(RAW, 'dem'); os.makedirs(d, exist_ok=True)
    tot = 0; cnt = 0
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            out = os.path.join(d, f'{Z}_{x}_{y}.png')
            if not os.path.exists(out):
                url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: data = r.read()
                with open(out, 'wb') as f: f.write(data)
            tot += os.path.getsize(out); cnt += 1
    print(f'dem z{Z} x {x0}-{x1} y {y0}-{y1}: {cnt} tiles {tot/1e6:.1f} MB')
if __name__ == '__main__':
    main()
