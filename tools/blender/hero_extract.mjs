// HILLBOMB hero landmarks: dump the OSM footprints + nearby streets around each hero site (input for hero_*.py).
// node tools/blender/hero_extract.mjs  -> tools/blender/_cache/hero/sites.json
import fs from 'fs'; import zlib from 'zlib'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const MAP = path.join(ROOT, 'public/assets/map');
const meta = JSON.parse(fs.readFileSync(path.join(MAP, 'meta.json')));
const P = meta.projection;
const llx = (lat, lon) => [(lon - P.lon0) * P.kx, -(lat - P.lat0) * P.kz];

// hero sites: approximate lat/lon of the building (the extractor lists every footprint within r m)
export const SITES = {
  masonPost: [37.78870, -122.41010, 110], jwMarriott: [37.78830, -122.40975, 45], stFrancis: [37.78790, -122.40885, 60], macys: [37.78680, -122.40700, 70],
  saks: [37.78870, -122.40830, 40], neiman: [37.78770, -122.40620, 40], grandHyatt: [37.78935, -122.40680, 45],
  apple: [37.78875, -122.40700, 30], unionSquare: [37.78799, -122.40750, 260],
  palace: [37.78820, -122.40190, 60], phelan: [37.78640, -122.40560, 40], ca555: [37.79200, -122.40350, 50],
  hobart: [37.78930, -122.40120, 25], mills: [37.79110, -122.40200, 40], ca101: [37.79290, -122.39810, 45],
  embarcadero: [37.79500, -122.39800, 170], fidi: [37.79000, -122.40150, 420], hallidie: [37.79020, -122.40340, 25],
  turntable: [37.78478, -122.40780, 45], transamerica: [37.79519, -122.40279, 70], salesforce: [37.78976, -122.39688, 60],
  transit: [37.78920, -122.39640, 260], cityHall: [37.77927, -122.41924, 95], opera: [37.77830, -122.42090, 70],
  davies: [37.77760, -122.42060, 55], asianArt: [37.78020, -122.41630, 60], library: [37.77915, -122.41582, 60],
  ferry: [37.79554, -122.39341, 130], pier39: [37.80867, -122.40981, 120], ghirardelli: [37.80590, -122.42290, 90],
  coit: [37.80239, -122.40582, 60], civic: [37.77950, -122.41850, 330],
  // wave 4: neighbourhoods + parks
  castro: [37.76203, -122.43490, 60], missionDolores: [37.76440, -122.42692, 80], ssPeterPaul: [37.80150, -122.41020, 110],
  columbusTower: [37.79660, -122.40530, 90], grace: [37.79195, -122.41327, 90], nobHill: [37.79195, -122.41060, 130],
  paintedLadies: [37.77627, -122.43277, 110], pofa: [37.80285, -122.44842, 200], deYoung: [37.77146, -122.46869, 320],
  academy: [37.76986, -122.46612, 130], conservatory: [37.77202, -122.46036, 70], legion: [37.78448, -122.50084, 110],
  oracle: [37.77857, -122.38907, 180], chase: [37.76802, -122.38770, 140], chinatown: [37.79262, -122.40566, 70],
  // wave 5: waterfront + icons
  fortPoint: [37.81055, -122.47715, 110], ggPlaza: [37.80720, -122.47520, 170], alcatraz: [37.82660, -122.42250, 330],
  pier33: [37.80790, -122.40480, 70], wharfCrab: [37.80800, -122.41770, 70], hydePier: [37.80930, -122.42220, 170],
  pier45: [37.80960, -122.41630, 130], lombard: [37.80210, -122.41870, 110], twinPeaks: [37.75440, -122.44770, 150],
  landsEnd: [37.77950, -122.51380, 230], exploratorium: [37.80170, -122.39730, 170], balmy: [37.75180, -122.41240, 110],
  doloresPark: [37.75960, -122.42710, 260], sutro: [37.75523, -122.45285, 90],
  // Chinatown hero set (Grant Ave Bush..Broadway + side streets, hero_ctown.py)
  ctown: [37.79410, -122.40600, 480],
};

const zb = zlib.gunzipSync(fs.readFileSync(path.join(MAP, 'buildings.bin.gz')));
const buf = zb.buffer.slice(zb.byteOffset, zb.byteOffset + zb.byteLength);
const dv = new DataView(buf);
const count = dv.getUint32(4, true), nverts = dv.getUint32(8, true), TC = dv.getUint16(12, true), TR = dv.getUint16(14, true);
const X0 = dv.getFloat32(16, true), Z0 = dv.getFloat32(20, true), T = TC * TR;
let o = 24;
const tileFirst = new Uint32Array(buf.slice(o, o + T * 4)); o += T * 4;
const tileCount = new Uint32Array(buf.slice(o, o + T * 4)); o += T * 4;
const rec = o; o += count * 28;
const verts = new Int16Array(buf.slice(o, o + nverts * 4));
const tileOf = new Uint16Array(count);
for (let t = 0; t < T; t++) for (let k = 0; k < tileCount[t]; k++) tileOf[tileFirst[t] + k] = t;
function bld(i) {
  const q = rec + i * 28;
  const v0 = dv.getUint32(q, true), nv = dv.getUint16(q + 4, true);
  const t = tileOf[i], ox = X0 + (t % TC) * 512, oz = Z0 + Math.floor(t / TC) * 512;
  const ring = [];
  for (let k = 0, v = v0 * 2; k < nv; k++, v += 2) ring.push([+(ox + verts[v] / 16).toFixed(2), +(oz + verts[v + 1] / 16).toFixed(2)]);
  return { i, ring, base: dv.getInt16(q + 6, true) / 50, h: dv.getUint16(q + 8, true) / 10, minH: dv.getUint16(q + 10, true) / 10,
    levels: dv.getUint8(q + 12), kind: meta.buildingKinds[dv.getUint8(q + 13)], roof: dv.getUint8(q + 14) };
}
// terrain: int16 cm residuals of the left+up-upleft predictor (same as mapdata.js), 4 m grid
const NX = meta.nx, NZ = meta.nz;
const hz = zlib.gunzipSync(fs.readFileSync(path.join(MAP, 'height.bin.gz')));
const hr = new Int16Array(hz.buffer.slice(hz.byteOffset, hz.byteOffset + hz.byteLength)), H = new Int16Array(NX * NZ);
H[0] = hr[0];
for (let i = 1; i < NX; i++) H[i] = hr[i] + H[i - 1];
for (let j = 1; j < NZ; j++) { const o = j * NX, u = o - NX; H[o] = hr[o] + H[u]; for (let i = 1; i < NX; i++) H[o + i] = hr[o + i] + H[o + i - 1] + H[u + i] - H[u + i - 1]; }
const heightAt = (x, z) => { const fx = (x - meta.extent.x0) / meta.cell, fz = (z - meta.extent.z0) / meta.cell, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * NX + i;
  return ((H[k] + (H[k + 1] - H[k]) * tx) * (1 - tz) + (H[k + NX] + (H[k + NX + 1] - H[k + NX]) * tx) * tz) * 0.01; };
const R = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(MAP, 'roads.json.gz'))));
const out = {};
for (const [id, [lat, lon, r]] of Object.entries(SITES)) {
  const [x, z] = llx(lat, lon);
  const list = [];
  const tx0 = Math.floor((x - r - X0) / 512), tx1 = Math.floor((x + r - X0) / 512), tz0 = Math.floor((z - r - Z0) / 512), tz1 = Math.floor((z + r - Z0) / 512);
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = tz * TC + tx;
    for (let i = tileFirst[t]; i < tileFirst[t] + tileCount[t]; i++) {
      const b = bld(i); const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length, cz = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length;
      let a = 0; for (let k = 0; k < b.ring.length; k++) { const [x1, z1] = b.ring[k], [x2, z2] = b.ring[(k + 1) % b.ring.length]; a += x1 * z2 - x2 * z1; }
      const d = Math.hypot(cx - x, cz - z);
      if (d < r) list.push({ ...b, c: [+cx.toFixed(1), +cz.toFixed(1)], area: Math.round(Math.abs(a) / 2), d: Math.round(d) });
    }
  }
  list.sort((a, b) => a.d - b.d);
  const streets = [];
  for (const E of R.edges) {
    const [, , name, , , , width, sidewalk, , , p0, np] = E;
    const pts = []; let near = false;
    for (let k = 0; k < np; k++) { const q = (p0 + k) * 3; pts.push([+R.pts[q].toFixed(1), +R.pts[q + 1].toFixed(1), +R.pts[q + 2].toFixed(2)]); if (Math.hypot(R.pts[q] - x, R.pts[q + 1] - z) < r + 80) near = true; }
    if (near && R.names[name]) streets.push({ name: R.names[name], width, sidewalk, pts });
  }
  const G = 2, gr = r + 60, n = Math.ceil(2 * gr / G) + 1, hg = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hg.push(+heightAt(x - gr + i * G, z - gr + j * G).toFixed(2));
  out[id] = { at: [+x.toFixed(1), +z.toFixed(1)], buildings: list, streets, hgrid: { x0: x - gr, z0: z - gr, step: G, n, h: hg } };
  console.log(id, x.toFixed(0), z.toFixed(0), list.map(b => `#${b.i} h${b.h} min${b.minH} a${b.area} d${b.d} ${b.kind}`).slice(0, 8).join(' | '));
}
fs.mkdirSync(path.join(ROOT, 'tools/blender/_cache/hero'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/blender/_cache/hero/sites.json'), JSON.stringify(out));
