// Terrain for the 1:1 real-data map. Same query API as world/terrain.js (heightAt, groundAt, surfaceAt, deckAt, addDeck,
// curbAt, decks) so physics, AI and every placement module work unchanged. Heights are the baked 4 m grid (roads already
// carved in, flat across, plateaued at intersections). Sidewalks (+0.15) are resolved exactly from the road graph.
import { SURF } from '../terrain.js';

const CURB = 0.15;
// raster classes 8 (scrub) and 9 (yard) have no physics row: they drive like dirt / grass
const SURF_COMPAT = [SURF.WATER, SURF.ASPHALT, SURF.CONCRETE, SURF.GRASS, SURF.SAND, SURF.DIRT, SURF.ROCK, SURF.FOREST, SURF.DIRT, SURF.GRASS];

export class Terrain2 {
  constructor(data) {
    const m = data.meta;
    this.meta = m; this.data = data;
    this.X0 = m.extent.x0; this.Z0 = m.extent.z0; this.NX = data.NX; this.NZ = data.NZ; this.CELL = m.cell; this.inv = 1 / m.cell;
    this.h = data.height; this.s = data.surf;
    this.decks = []; this.deckHash = new Map();
    this.graph = null;
    this.bounds = { minX: m.extent.x0, maxX: m.extent.x1, minZ: m.extent.z0, maxZ: m.extent.z1 };
  }
  // raw grid height at vertex (i, j), metres
  hv(i, j) {
    i = i < 0 ? 0 : i >= this.NX ? this.NX - 1 : i; j = j < 0 ? 0 : j >= this.NZ ? this.NZ - 1 : j;
    return this.h[j * this.NX + i] * 0.01;
  }
  heightAt(x, z) {
    const fx = (x - this.X0) * this.inv, fz = (z - this.Z0) * this.inv;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.NX - 1 || j >= this.NZ - 1) return this.hv(i, j);
    const tx = fx - i, tz = fz - j, k = j * this.NX + i, H = this.h, NX = this.NX;
    const a = H[k], b = H[k + 1], c = H[k + NX], d = H[k + NX + 1];
    return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * 0.01;
  }
  sampleRaw(x, z) { return this.heightAt(x, z); }
  surfaceRaw(x, z) {
    const i = Math.round((x - this.X0) * this.inv), j = Math.round((z - this.Z0) * this.inv);
    if (i < 0 || j < 0 || i >= this.NX || j >= this.NZ) return 0;
    return this.s[j * this.NX + i];
  }
  surfaceAt(x, z) { return SURF_COMPAT[this.surfaceRaw(x, z)] ?? SURF.GRASS; }

  // ------------------------------------------------------------ decks: bridges, viaducts, tunnels (from the road graph)
  addDeck(d) {
    const pts = d.pts;
    const deck = { ...d, pts, hw: d.width / 2 + (d.sidewalk || 0), roadHw: d.width / 2, segs: [] };
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az, ay] = pts[k], [bx, bz, by] = pts[k + 1];
      const seg = { deck, k, ax, az, ay, bx, bz, by, ex: bx - ax, ez: bz - az, l2: (bx - ax) ** 2 + (bz - az) ** 2 || 1e-6, len: Math.hypot(bx - ax, bz - az) };
      deck.segs.push(seg);
      const r = deck.hw + 2;
      const cx0 = Math.floor((Math.min(ax, bx) - r) / 32), cx1 = Math.floor((Math.max(ax, bx) + r) / 32);
      const cz0 = Math.floor((Math.min(az, bz) - r) / 32), cz1 = Math.floor((Math.max(az, bz) + r) / 32);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const key = cx * 100003 + cz; let arr = this.deckHash.get(key);
        if (!arr) this.deckHash.set(key, arr = []);
        arr.push(seg);
      }
    }
    this.decks.push(deck);
    return deck;
  }
  // highest deck surface at (x, z) that is <= yMax. returns {y, deck, seg, t} or null
  deckAt(x, z, yMax = Infinity) {
    const arr = this.deckHash.get(Math.floor(x / 32) * 100003 + Math.floor(z / 32));
    if (!arr) return null;
    let best = null;
    for (const s of arr) {
      let t = ((x - s.ax) * s.ex + (z - s.az) * s.ez) / s.l2;
      if (t < -0.02 || t > 1.02) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (s.ax + s.ex * t), dz = z - (s.az + s.ez * t);
      if (dx * dx + dz * dz > s.deck.hw * s.deck.hw) continue;
      const y = s.ay + (s.by - s.ay) * t;
      if (y <= yMax && (!best || y > best.y)) best = { y, deck: s.deck, seg: s, t };
    }
    return best;
  }

  // ------------------------------------------------------------ sidewalks: outside every carriageway, inside some sidewalk band
  setGraph(graph) { this.graph = graph; }
  curbAt(x, z) {
    const g = this.graph; if (!g) return 0;
    const C = g.edgeHashCell, arr = g.edgeHash.get(Math.floor(x / C) * 100003 + Math.floor(z / C));
    if (!arr) return 0;
    let walk = false;
    for (let q = 0; q < arr.length; q++) {
      const it = arr[q], e = it[0];
      if (e.deck) continue;
      const k = it[1], p = e.pts[k], p2 = e.pts[k + 1];
      const dx = p2[0] - p[0], dz = p2[1] - p[1], l2 = dx * dx + dz * dz || 1e-6;
      let t = ((x - p[0]) * dx + (z - p[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - p[0] - dx * t, ez = z - p[1] - dz * t, d2 = ex * ex + ez * ez;
      const hw = e.width * 0.5;
      if (d2 < hw * hw) return 0;                                          // on a carriageway: road wins
      const sw = hw + e.sidewalk;
      if (e.sidewalk > 0 && d2 < sw * sw) walk = true;
    }
    if (!walk) return 0;
    // intersection mouths: inside the junction radius it's road
    const n = g.nearestNode?.(x, z, 30);
    if (n && n.deg >= 3) { const dx = x - n.x, dz = z - n.z; if (dx * dx + dz * dz < n.radius * n.radius) return 0; }
    return CURB;
  }

  // ground under a probe: max(terrain (+ curb), deck <= probeY + 0.6); tunnels: a deck below the terrain surface wins
  // when the probe itself is below that surface or within 2.5 m of the tunnel road. Writes the normal + surface into out (optional).
  groundAt(x, z, probeY = Infinity, out = null) {
    const t0 = this.heightAt(x, z);
    const th = t0 + this.curbAt(x, z);
    const dk = this.deckAt(x, z, probeY + 0.6);
    if (dk && (dk.y > th || (dk.deck.tunnel && (probeY < t0 - 0.8 || probeY < dk.y + 2.5)))) {   // (at a portal the cover is thin: stay in the bore)
      if (out) {
        const s = dk.seg, gy = (s.by - s.ay) / (s.len || 1);
        const tx = s.ex / (s.len || 1), tz = s.ez / (s.len || 1);
        out.x = -tx * gy; out.y = 1; out.z = -tz * gy;
        const l = Math.hypot(out.x, out.y, out.z); out.x /= l; out.y /= l; out.z /= l;
        out.surface = dk.deck.kind === 'pier' ? SURF.CONCRETE : SURF.ASPHALT;
        out.deck = dk.deck;
      }
      return dk.y;
    }
    if (out) {
      const e = 0.6;
      const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
      const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      out.x = -hx / (2 * e); out.y = 1; out.z = -hz / (2 * e);
      const l = Math.hypot(out.x, out.y, out.z); out.x /= l; out.y /= l; out.z /= l;
      out.surface = this.surfaceAt(x, z);
      out.deck = null;
    }
    return th;
  }
  // v1 compatibility shims (grid-only concepts)
  cellIsActive() { return false; }
  isGrid() { return false; }
  setBlocks() {}
  paintCorridor() {}
}
