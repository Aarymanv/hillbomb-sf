// Buildings v2 build worker: holds a copy of the footprint + plan arrays and builds FAR chunks, MID tiles, NEAR tiles
// (facade detail + merged Blender kit pieces) and storefront DRESS tiles off the main thread. Geometry comes back as
// transferable typed arrays (v2build.js packBuf, v2detail.js KitBuf.pack, v2dressgeo.js).
import { wrapB, buildFarChunk, buildMidTile, buildNearTile, buildDress, packBuf, transferList } from './v2build.js';
import { Raster } from './v2geom.js';
import { setKit, setKit3 } from './v2detail.js';
import { dressTransfer } from './v2dressgeo.js';
import { setNOV5 } from './v2lots.js';

let ctx = null;
const kitTransfer = (k) => [k.pos.buffer, k.nrm.buffer, k.uv.buffer, k.col.buffer, k.idx.buffer];
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { ctx = { B: wrapB(m.B), P: m.P, R: new Raster(m.B.tile) }; setNOV5(m.P.nov5); return; }
  if (m.type === 'kit') { setKit(m.kit); return; }
  if (m.type === 'kit3') { setKit3(m.kit); return; }
  const t0 = performance.now();
  const hidden = m.hidden && m.hidden.length ? new Set(m.hidden) : null;
  if (m.type === 'far') {
    const out = [], tl = [];
    for (const [key, list] of m.chunks) { const b = buildFarChunk(ctx, list); if (b.empty) continue; const p = packBuf(b); out.push([key, p]); tl.push(...transferList(p)); }
    self.postMessage({ id: m.id, chunks: out, ms: performance.now() - t0 }, tl);
  } else if (m.type === 'mid') {
    const { buf, fronts } = buildMidTile(ctx, m.tile, hidden);
    const p = buf.empty ? null : packBuf(buf);
    self.postMessage({ id: m.id, geo: p, fronts, ms: performance.now() - t0 }, p ? [...transferList(p), fronts.buffer] : [fronts.buffer]);
  } else if (m.type === 'near') {
    const { buf, kit } = buildNearTile(ctx, m.key, m.fronts, hidden, m.tx, m.tz);
    const p = buf.empty ? null : packBuf(buf), k = kit ? kit.pack(packBuf) : null;
    const tl = []; if (p) tl.push(...transferList(p)); if (k) for (const c of k) { if (c.geo) tl.push(...kitTransfer(c.geo)); if (c.geo3) tl.push(...kitTransfer(c.geo3)); if (c.geo3d) tl.push(...kitTransfer(c.geo3d)); if (c.geoF) tl.push(...transferList(c.geoF)); tl.push(c.ids.buffer, c.ids3.buffer); }
    self.postMessage({ id: m.id, geo: p, kit: k, kitOn: !!kit, ms: performance.now() - t0 }, tl);
  } else if (m.type === 'dress') {
    const r = buildDress(ctx, m.key, hidden, m.tx, m.tz);
    r.id = m.id; r.ms = performance.now() - t0;
    self.postMessage(r, dressTransfer(r));
  }
};
