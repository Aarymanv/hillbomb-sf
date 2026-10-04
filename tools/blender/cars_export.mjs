// Dump the procedural car models (HQ loft) for tools/blender/cars.py.  node tools/blender/cars_export.mjs [--hero] [ids...]
// --hero: denser loft (_hq2) + the detail-call records / per-vertex tags used by tools/blender/car_hero.py
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _exportCar, MODEL_IDS } from '../../src/vehicle/models.js';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '_cache', 'cars');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2), hero = argv.includes('--hero');
const ids = argv.filter((a) => !a.startsWith('--')).length ? argv.filter((a) => !a.startsWith('--')) : MODEL_IDS;
const b64 = (a, T = Float32Array) => Buffer.from(new T(a).buffer).toString('base64');
for (const id of ids) {
  const t0 = Date.now(), e = _exportCar(id, { hq2: hero }), out = { id, meta: e.meta, buckets: {}, rec: hero ? e.rec : null };
  const put = (k, bk) => { if (bk.pos.length) out.buckets[k] = { n: bk.pos.length / 3, pos: b64(bk.pos), nor: b64(bk.nor), col: b64(bk.col), uv: b64(bk.uv), surf: b64(bk.surf), lamp: b64(bk.lamp), tag: b64(bk.tag && bk.tag.length ? bk.tag : new Array(bk.pos.length / 3).fill(0)) }; };
  for (const k of ['paint', 'paint2', 'details', 'glass', 'lamps']) put(k, e.B[k]);
  put('wheel', e.wheel);
  fs.writeFileSync(path.join(OUT, id + (hero ? '.hero' : '') + '.json'), JSON.stringify(out));
  console.log(id, hero ? 'hero' : '', Object.fromEntries(Object.entries(out.buckets).map(([k, v]) => [k, v.n / 3 | 0])), (e.rec || []).length, 'recs', Date.now() - t0, 'ms');
}
