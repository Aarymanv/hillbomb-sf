// Loader for the baked 1:1 San Francisco (tools/map -> public/assets/map/). Decodes everything into typed arrays.
// Map data (c) OpenStreetMap contributors (ODbL); elevation: AWS Terrain Tiles (USGS 3DEP, NOAA). See meta.attribution.
const BASE = 'assets/map/';

async function fetchBuf(name, onBytes) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`map data ${name}: HTTP ${r.status}`);
  if (!r.body || !onBytes) return r.arrayBuffer();
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onBytes(got, total); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}
async function gunzip(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf;            // a server already decoded it
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadMapData(progress = () => {}) {
  const meta = await (await fetch(BASE + 'meta.json')).json();
  const files = ['height.bin.gz', 'surf.bin.gz', 'roads.json.gz', 'buildings.bin.gz', 'extras.json.gz'];
  const got = new Map(); let totalAll = 0; for (const f of files) totalAll += meta.sizes?.[f] || 0;
  const tick = () => { let g = 0; for (const v of got.values()) g += v; progress(Math.min(1, g / (totalAll || 1))); };
  const bufs = await Promise.all(files.map(f => fetchBuf(f, (n) => { got.set(f, n); tick(); }).then(gunzip)));
  const [hBuf, sBuf, rBuf, bBuf, xBuf] = bufs;
  const NX = meta.nx, NZ = meta.nz;
  // heights: Int16 cm residuals of the left + up - upleft predictor
  const r = new Int16Array(hBuf), h = new Int16Array(NX * NZ);
  h[0] = r[0];
  for (let i = 1; i < NX; i++) h[i] = r[i] + h[i - 1];
  for (let j = 1; j < NZ; j++) {
    const o = j * NX, u = o - NX;
    h[o] = r[o] + h[u];
    for (let i = 1; i < NX; i++) h[o + i] = r[o + i] + h[o + i - 1] + h[u + i] - h[u + i - 1];
  }
  const td = new TextDecoder();
  return {
    meta, NX, NZ, height: h, surf: new Uint8Array(sBuf),
    roads: JSON.parse(td.decode(rBuf)), buildings: parseBuildings(bBuf), extras: JSON.parse(td.decode(xBuf)),
  };
}

// buildings.bin: header '<4sIIHHff' (magic, count, nverts, tilesX, tilesZ, x0, z0), tileFirst u32[T], tileCount u32[T],
// 28-byte records '<IHhHHBBBBHIIH' (v0, nv, baseY*50, h*10, minH*10, levels, kind, roof, slope*10, roofH*10, color, roofColor, flags),
// then Int16 vertex pairs (x, z) * 16 relative to the tile's min corner.
function parseBuildings(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'SFB1') throw new Error('buildings.bin: bad magic ' + magic);
  const count = dv.getUint32(4, true), nverts = dv.getUint32(8, true), TC = dv.getUint16(12, true), TR = dv.getUint16(14, true);
  const X0 = dv.getFloat32(16, true), Z0 = dv.getFloat32(20, true), T = TC * TR;
  let o = 24;
  const tileFirst = new Uint32Array(buf.slice(o, o + T * 4)); o += T * 4;
  const tileCount = new Uint32Array(buf.slice(o, o + T * 4)); o += T * 4;
  const B = {
    count, TC, TR, X0, Z0, tile: 512, tileFirst, tileCount,
    v0: new Uint32Array(count), nv: new Uint16Array(count), base: new Float32Array(count), h: new Float32Array(count), minH: new Float32Array(count),
    levels: new Uint8Array(count), kind: new Uint8Array(count), roof: new Uint8Array(count), slope: new Float32Array(count), roofH: new Float32Array(count),
    color: new Uint32Array(count), roofColor: new Uint32Array(count), flags: new Uint16Array(count), tileOf: new Uint16Array(count),
  };
  for (let i = 0; i < count; i++, o += 28) {
    B.v0[i] = dv.getUint32(o, true); B.nv[i] = dv.getUint16(o + 4, true); B.base[i] = dv.getInt16(o + 6, true) / 50;
    B.h[i] = dv.getUint16(o + 8, true) / 10; B.minH[i] = dv.getUint16(o + 10, true) / 10; B.levels[i] = dv.getUint8(o + 12);
    B.kind[i] = dv.getUint8(o + 13); B.roof[i] = dv.getUint8(o + 14); B.slope[i] = dv.getUint8(o + 15) / 10; B.roofH[i] = dv.getUint16(o + 16, true) / 10;
    B.color[i] = dv.getUint32(o + 18, true); B.roofColor[i] = dv.getUint32(o + 22, true); B.flags[i] = dv.getUint16(o + 26, true);
  }
  B.verts = new Int16Array(buf.slice(o, o + nverts * 4));
  for (let t = 0; t < T; t++) for (let k = 0; k < tileCount[t]; k++) B.tileOf[tileFirst[t] + k] = t;
  // world-space ring of building i: [x0, z0, x1, z1, ...] (counter-clockwise in x/z)
  B.ring = (i, out = []) => {
    const t = B.tileOf[i], ox = X0 + (t % TC) * B.tile, oz = Z0 + Math.floor(t / TC) * B.tile;
    out.length = 0;
    for (let k = 0, v = B.v0[i] * 2; k < B.nv[i]; k++, v += 2) out.push(ox + B.verts[v] / 16, oz + B.verts[v + 1] / 16);
    return out;
  };
  B.inTile = (tx, tz) => { const t = tz * TC + tx; return t >= 0 && t < T ? [tileFirst[t], tileCount[t]] : [0, 0]; };
  return B;
}
