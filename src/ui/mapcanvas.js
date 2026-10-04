// Top-down map of SF (water, land, hillshade, parks, blocks, piers, roads) rendered into a tile pyramid.
// Shared by the minimap and the big map. Tiles are painted lazily (a small budget per frame) and cached (LRU).
//   const T = createMapTiles(world);
//   T.draw(ctx, pxPerMetre, x0, z0, x1, z1)  // ctx transform must already map world metres -> canvas pixels
//   T.pump(ms)                               // paint queued tiles for up to `ms` milliseconds
import { BOUNDS as BOUNDS_V1, LAND, MARIN, PRESIDIO, LANDS_END, GG_PARK, TWIN_PEAKS, PARK_BLOCKS } from '../world/map.js';

export const MAP_SCALE = 0.42; // legacy single-canvas scale (px per metre)
export const PAL = {
  water: '#0b1822', shallow: '#0f2331', coast: 'rgba(120,190,230,.12)', land: '#1c222b', wild: '#1b2a21', block: '#252c37',
  park: '#1e3827', parkEdge: '#244430', pier: '#2b323e', casing: 'rgba(6,8,12,.85)',
  road: ['#434c5a', '#667080', '#a7b0bc', '#e6d3a0', '#d4d6da'], parkRoad: '#61785f', gg: '#e3552f', bay: '#c8d0da',
};
const LEVELS = [0.125, 0.25, 0.5, 1, 2, 4];
const TILE = 512, GUT = 2;
const MAX_TILES = 80;

function roadClass(e) {
  const k = e.kind;
  if (k === 'bridge' || e.deck) return 4;
  if (k === 'highway') return 3;
  if (k === 'arterial' || k === 'boulevard' || e.width >= 18) return 2;
  if (k === 'park' || k === 'scenic' || k === 'mountain') return 5;
  if (k === 'collector' || k === 'road' || k === 'crooked' || e.width >= 14) return 1;
  return 0;
}

export function createMapTiles(world) {
  // v2 (1:1 map): bounds = the bake extent, background = public/assets/map/map_base.png (8 m/px land use + hillshade)
  const V2 = !!world.v2 && !!world.terrain?.bounds;
  const BOUNDS = V2 ? world.terrain.bounds : BOUNDS_V1;
  const W = BOUNDS.maxX - BOUNDS.minX, H = BOUNDS.maxZ - BOUNDS.minZ;
  let baseImg = null;
  // ---------------------------------------------------------------- spatial index
  const CELL = 250, GX = Math.ceil(W / CELL), GZ = Math.ceil(H / CELL);
  const cells = Array.from({ length: GX * GZ }, () => ({ e: [], b: [] }));
  const bbox = pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; } return [a, b, c, d]; };
  const insert = (bb, pad, list, item) => {
    const i0 = Math.max(0, Math.floor((bb[0] - pad - BOUNDS.minX) / CELL)), i1 = Math.min(GX - 1, Math.floor((bb[2] + pad - BOUNDS.minX) / CELL));
    const j0 = Math.max(0, Math.floor((bb[1] - pad - BOUNDS.minZ) / CELL)), j1 = Math.min(GZ - 1, Math.floor((bb[3] + pad - BOUNDS.minZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * GX + i][list].push(item);
  };
  const edges = world.graph.edges.map((e, i) => ({ i, pts: e.pts, w: e.width, cls: roadClass(e), deck: e.deck?.kind || null, bb: bbox(e.pts), name: e.name, len: e.len }));
  edges.sort((a, b) => a.cls === 5 ? -1 : b.cls === 5 ? 1 : a.cls - b.cls || a.w - b.w);
  edges.forEach((e, n) => { e.n = n; insert(e.bb, e.w, 'e', e); });
  const blocks = (world.blocks || []).map(b => ({ poly: b.poly, park: !!b.park, bb: bbox(b.poly) }));
  blocks.forEach(b => insert(b.bb, 0, 'b', b));
  const piers = [];
  for (const d of world.terrain?.decks || []) if (d.kind === 'pier') {
    const [a, b] = [d.pts[0], d.pts[d.pts.length - 1]];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * d.hw, nz = dx / l * d.hw;
    piers.push([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]);
  }
  const PARKS = [PRESIDIO, LANDS_END, GG_PARK, TWIN_PEAKS];

  // ---------------------------------------------------------------- hillshade (async, 8 m grid)
  let shade = null;
  function buildShade(done) {
    const s = 0.125, cw = Math.ceil(W * s), ch = Math.ceil(H * s), step = 1 / s;
    const hts = new Float32Array(cw * ch);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const img = c.getContext('2d').createImageData(cw, ch);
    let row = 0;
    const lx = -0.55, ly = 0.62, lz = -0.56; // light from the north-west, fairly high
    const flat = ly;
    function chunk() {
      const t0 = performance.now();
      while (row < ch && performance.now() - t0 < 6) {
        const z = BOUNDS.minZ + (row + 0.5) * step;
        for (let i = 0; i < cw; i++) hts[row * cw + i] = world.heightAt(BOUNDS.minX + (i + 0.5) * step, z);
        row++;
      }
      if (row < ch) { setTimeout(chunk, 0); return; }
      const d = img.data;
      for (let j = 1; j < ch - 1; j++) for (let i = 1; i < cw - 1; i++) {
        const h = hts[j * cw + i];
        if (h < 0.3) continue;
        const gx = (hts[j * cw + i + 1] - hts[j * cw + i - 1]) / (2 * step) * 2.2, gz = (hts[(j + 1) * cw + i] - hts[(j - 1) * cw + i]) / (2 * step) * 2.2;
        const inv = 1 / Math.hypot(gx, 1, gz);
        const dot = (-gx * lx + ly - gz * lz) * inv - flat;
        const o = (j * cw + i) * 4;
        const elev = Math.min(1, h / 140);
        if (dot > 0) { d[o] = 255; d[o + 1] = 244; d[o + 2] = 226; d[o + 3] = Math.min(255, dot * 330 + elev * 26); }
        else { d[o] = 0; d[o + 1] = 2; d[o + 2] = 8; d[o + 3] = Math.min(200, -dot * 420); }
      }
      c.getContext('2d').putImageData(img, 0, 0);
      shade = c; done?.();
    }
    setTimeout(chunk, 0);
  }

  // ---------------------------------------------------------------- painter
  const polyPath = (g, pts) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
  function paint(g, x0, z0, x1, z1, s) {
    const px = 1 / s; // one pixel in world units
    g.fillStyle = PAL.water; g.fillRect(x0 - px, z0 - px, x1 - x0 + 2 * px, z1 - z0 + 2 * px);
    if (V2) {
      if (baseImg) {
        g.imageSmoothingEnabled = true;
        g.filter = 'saturate(0.55) brightness(0.62) contrast(1.05)';
        g.drawImage(baseImg, BOUNDS.minX, BOUNDS.minZ, W, H);
        g.filter = 'none';
      }
    } else {
    // shallow-water halo + land
    g.beginPath(); for (const p of LAND) polyPath(g, p);
    g.lineJoin = 'round'; g.strokeStyle = PAL.shallow; g.lineWidth = Math.max(40, 5 * px); g.stroke();
    g.strokeStyle = PAL.coast; g.lineWidth = Math.max(6, 2.2 * px); g.stroke();
    g.fillStyle = PAL.land; g.fill();
    g.beginPath(); polyPath(g, MARIN); g.fillStyle = PAL.wild; g.fill();
    g.save();
    g.beginPath(); for (const p of LAND) polyPath(g, p); g.clip();
    if (shade) { g.imageSmoothingEnabled = true; g.globalAlpha = 0.85; g.drawImage(shade, BOUNDS.minX, BOUNDS.minZ, W, H); g.globalAlpha = 1; }
    // parks
    g.fillStyle = PAL.park;
    g.beginPath(); for (const p of PARKS) polyPath(g, p);
    for (const [a, b, c, d] of PARK_BLOCKS) g.rect(a, b, c - a, d - b);
    g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1;
    g.restore();
    }
    // blocks + roads from the spatial index
    const i0 = Math.max(0, Math.floor((x0 - 40 - BOUNDS.minX) / CELL)), i1 = Math.min(GX - 1, Math.floor((x1 + 40 - BOUNDS.minX) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - 40 - BOUNDS.minZ) / CELL)), j1 = Math.min(GZ - 1, Math.floor((z1 + 40 - BOUNDS.minZ) / CELL));
    const bs = new Set(), es = new Set();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = cells[j * GX + i]; for (const b of c.b) bs.add(b); for (const e of c.e) es.add(e); }
    if (s >= 0.2) {
      g.beginPath(); for (const b of bs) if (!b.park) polyPath(g, b.poly); g.fillStyle = PAL.block; g.fill();
      g.beginPath(); for (const b of bs) if (b.park) polyPath(g, b.poly); g.fillStyle = PAL.parkEdge; g.fill();
    }
    g.beginPath(); for (const p of piers) polyPath(g, p); g.fillStyle = PAL.pier; g.fill();
    const list = [...es].sort((a, b) => a.n - b.n);
    const widthPx = e => Math.max([0.7, 0.9, 1.3, 1.9, 2.2, 0.9][e.cls], e.w * s * (e.cls >= 2 ? 0.86 : 0.74));
    g.lineCap = 'round'; g.lineJoin = 'round';
    // casings for major roads when zoomed in
    if (s >= 0.45) {
      g.strokeStyle = PAL.casing;
      for (const e of list) { if (e.cls < 2) continue; g.beginPath(); line(g, e.pts); g.lineWidth = (widthPx(e) + Math.min(4, 1.2 + s)) * px; g.stroke(); }
    }
    const localA = s < 0.2 ? 0.55 : s < 0.4 ? 0.8 : 1;
    for (const e of list) {
      g.beginPath(); line(g, e.pts);
      g.strokeStyle = e.deck === 'goldengate' ? PAL.gg : e.deck === 'baybridge' ? PAL.bay : e.cls === 5 ? PAL.parkRoad : PAL.road[Math.min(4, e.cls)];
      g.globalAlpha = e.cls === 0 ? localA : 1;
      g.lineWidth = widthPx(e) * px; g.stroke();
    }
    g.globalAlpha = 1;
    // centre line on highways at high zoom
    if (s >= 1.5) {
      g.setLineDash([6 * px, 7 * px]); g.strokeStyle = 'rgba(40,34,20,.55)'; g.lineWidth = 1.2 * px;
      for (const e of list) if (e.cls === 3 || e.cls === 4) { g.beginPath(); line(g, e.pts); g.stroke(); }
      g.setLineDash([]);
    }
  }
  function line(g, pts) { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }

  // ---------------------------------------------------------------- base (whole map at 0.125 px/m)
  const base = document.createElement('canvas');
  base.width = Math.ceil(W * LEVELS[0]); base.height = Math.ceil(H * LEVELS[0]);
  function paintBase() { const g = base.getContext('2d'); g.setTransform(LEVELS[0], 0, 0, LEVELS[0], -BOUNDS.minX * LEVELS[0], -BOUNDS.minZ * LEVELS[0]); paint(g, BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ, LEVELS[0]); }
  paintBase();

  // ---------------------------------------------------------------- tiles
  const cache = new Map(); // key -> { c, used }
  const queue = [];        // keys, most recent last
  const queued = new Set();
  let tick = 0, version = 0, shadeVer = 0;
  const key = (li, tx, ty) => li * 1e6 + ty * 1000 + tx;
  function tileCanvas(li, tx, ty) {
    const s = LEVELS[li], span = TILE / s;
    const x0 = BOUNDS.minX + tx * span, z0 = BOUNDS.minZ + ty * span;
    const c = document.createElement('canvas'); c.width = c.height = TILE + GUT * 2;
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, (GUT - x0 * s), (GUT - z0 * s));
    paint(g, x0 - GUT / s, z0 - GUT / s, x0 + span + GUT / s, z0 + span + GUT / s, s);
    return c;
  }
  function request(li, tx, ty) {
    const k = key(li, tx, ty);
    const t = cache.get(k);
    if (t) { t.used = tick; if (t.sv !== shadeVer && !queued.has(k)) { queued.add(k); queue.unshift([li, tx, ty, k]); } return t.c; } // stale tiles stay visible until repainted
    if (!queued.has(k)) { queued.add(k); queue.push([li, tx, ty, k]); }
    else { const i = queue.findIndex(q => q[3] === k); if (i >= 0 && i < queue.length - 1) queue.push(queue.splice(i, 1)[0]); }
    return null;
  }
  function pump(ms = 4, maxTiles = 99) {
    const t0 = performance.now(); let n = 0;
    while (queue.length && n < maxTiles && (n === 0 || performance.now() - t0 < ms)) {
      const [li, tx, ty, k] = queue.pop(); queued.delete(k);
      if (cache.has(k) && cache.get(k).sv === shadeVer) continue;
      cache.set(k, { c: tileCanvas(li, tx, ty), used: tick, li, sv: shadeVer });
      n++;
    }
    if (queue.length > 64) { const drop = queue.splice(0, queue.length - 64); for (const q of drop) queued.delete(q[3]); }
    if (cache.size > MAX_TILES) {
      const ev = [...cache.entries()].filter(([, t]) => t.li > 1).sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < cache.size - MAX_TILES && i < ev.length; i++) cache.delete(ev[i][0]);
    }
    if (n) version++;
    return n;
  }
  // draw the map region [x0,x1]x[z0,z1] (world); ctx transform maps world -> pixels at `s` px per metre
  function draw(ctx, s, x0, z0, x1, z1) {
    tick++;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // base
    const b0 = LEVELS[0];
    const sx = Math.max(0, (x0 - BOUNDS.minX) * b0 - 2), sy = Math.max(0, (z0 - BOUNDS.minZ) * b0 - 2);
    const sw = Math.min(base.width - sx, (x1 - x0) * b0 + 4), sh = Math.min(base.height - sy, (z1 - z0) * b0 + 4);
    if (sw > 0 && sh > 0) ctx.drawImage(base, sx, sy, sw, sh, BOUNDS.minX + sx / b0, BOUNDS.minZ + sy / b0, sw / b0, sh / b0);
    let li = LEVELS.findIndex(L => L >= s * 0.8); if (li < 0) li = LEVELS.length - 1;
    if (li === 0) return;
    const lo = li > 1 ? li - 1 : null;
    if (lo) drawLevel(ctx, lo, x0, z0, x1, z1, false);
    drawLevel(ctx, li, x0, z0, x1, z1, true);
  }
  function drawLevel(ctx, li, x0, z0, x1, z1, req) {
    const s = LEVELS[li], span = TILE / s;
    const tx0 = Math.max(0, Math.floor((x0 - BOUNDS.minX) / span)), tx1 = Math.min(Math.ceil(W / span) - 1, Math.floor((x1 - BOUNDS.minX) / span));
    const ty0 = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / span)), ty1 = Math.min(Math.ceil(H / span) - 1, Math.floor((z1 - BOUNDS.minZ) / span));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const c = req ? request(li, tx, ty) : (cache.get(key(li, tx, ty))?.c || null);
      if (!c) continue;
      if (!req) cache.get(key(li, tx, ty)).used = tick;
      ctx.drawImage(c, GUT, GUT, TILE, TILE, BOUNDS.minX + tx * span, BOUNDS.minZ + ty * span, span, span);
    }
  }
  // prefetch level-1 tiles (whole map, small) in idle time
  function warm() { for (let ty = 0; ty < Math.ceil(H * LEVELS[1] / TILE); ty++) for (let tx = 0; tx < Math.ceil(W * LEVELS[1] / TILE); tx++) request(1, tx, ty); }
  if (V2) {
    const im = new Image();
    im.onload = () => { baseImg = im; paintBase(); shadeVer++; version++; warm(); };
    im.onerror = () => console.warn('[map] map_base.png failed');
    im.src = (import.meta.env?.BASE_URL || '/') + 'assets/map/map_base.png';
  } else buildShade(() => { paintBase(); shadeVer++; version++; warm(); });
  warm();
  return {
    base, draw, pump, request, edges, LEVELS,
    get pending() { return queue.length; },
    get version() { return version; },
    get shadeReady() { return V2 ? !!baseImg : !!shade; },
    bounds: BOUNDS,
    paintRegion(g, x0, z0, x1, z1, s) { paint(g, x0, z0, x1, z1, s); },
  };
}

// Legacy: whole map as one canvas at MAP_SCALE (kept for anything still reading G.hud.map).
export function renderMapCanvas(world, tiles = null) {
  const T = tiles || createMapTiles(world);
  const BOUNDS = T.bounds || BOUNDS_V1, W = BOUNDS.maxX - BOUNDS.minX, H = BOUNDS.maxZ - BOUNDS.minZ;
  const Wp = Math.ceil(W * MAP_SCALE), Hp = Math.ceil(H * MAP_SCALE);
  const c = document.createElement('canvas'); c.width = Wp; c.height = Hp;
  const g = c.getContext('2d');
  g.setTransform(MAP_SCALE, 0, 0, MAP_SCALE, -BOUNDS.minX * MAP_SCALE, -BOUNDS.minZ * MAP_SCALE);
  T.paintRegion(g, BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ, MAP_SCALE);
  const X = wx => (wx - BOUNDS.minX) * MAP_SCALE, Z = wz => (wz - BOUNDS.minZ) * MAP_SCALE;
  return { canvas: c, W: Wp, H: Hp, X, Z };
}
