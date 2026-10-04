// Building planning: one spec per building (lots may split into terraced sub-buildings on steep streets).
// The spec drives both the far box LOD (far.js) and the near detailed LOD (near.js), and fills the params texture that
// the facade shader reads, so both LODs share window grid, colours and ground treatment.
import * as THREE from 'three';
import { mulberry32 } from '../geo.js';
import { L } from './layers.js';
import { NP, PW } from './material.js';
import { lin } from './emit.js';

export const S = { VICTORIAN: 0, EDWARDIAN: 1, STUCCO: 2, COMMERCIAL: 3, APARTMENT: 4, CHINATOWN: 5, LOFT: 6, WAREHOUSE: 7, TOWER_GLASS: 8, TOWER_STONE: 9, OFFICE: 10 };
export const GT = { RESID: 0, STORE: 1, HOUSE: 2, LOBBY: 3, ROLLUP: 4, BLANK: 5 };
export const WT = { DOUBLE: 0, ARCH: 1, PLAIN: 2, LOFT: 3, PICTURE: 4 };
export const IT = { RES: 0, OFFICE: 1, SHOP: 2, LOBBY: 3, LOFT: 4, CAFE: 5 };

const P = (arr) => arr.map(lin);
const PAL = {
  vicBody: P([0x6d8fb3, 0x7fa38b, 0xe5c76b, 0xd98b8b, 0x9b7fb0, 0x5f9ea0, 0xe8e0c8, 0x8f9aa3, 0xc76b5b, 0x5f7d9f, 0xa4b872, 0xf0d9a8, 0x8a6c9f, 0xd9a36b, 0x4f7b6a, 0xb86a86, 0x92b8c8, 0xa8c4d8, 0xe0b0a0]),
  vicTrim: P([0xf4efe2, 0xf6f1e4, 0xefe6cf, 0xfaf7ef, 0x5b4e6a, 0x8b3440, 0x34587f, 0xe8d49a, 0x3f6a4a, 0xf0e0b0]),
  vicAcc: P([0x8f1f2a, 0x1f2f4f, 0x2a1a14, 0xc9a13b, 0x245a3c, 0x5a1f4a, 0xb84a2a]),
  edwBody: P([0xe9e2cf, 0xd9d4c4, 0xc8cfd2, 0xe8d8b0, 0xb9c9d6, 0xd6c3a5, 0xf0ebdc, 0xa8b5a0, 0xcfb9a8, 0x9fb0bf, 0xe0c8b8]),
  edwTrim: P([0xfbf8f0, 0xf4efe2, 0xe9e1cc, 0x5c5850, 0x3d4a57]),
  stucco: P([0xf3eee2, 0xf1e3c8, 0xe9d3cc, 0xd6e5dc, 0xd5e1ec, 0xf2d6bd, 0xe4dcef, 0xf5e9b8, 0xe8e8e2, 0xcfe0e8, 0xf0cfc0, 0xdde8c8, 0xc8d8e0, 0xf4e4d4]),
  stuccoTrim: P([0xffffff, 0xf6f2ea, 0xd8cfc0, 0x8a7a6a, 0x6b7f8f, 0xb86a4a]),
  comm: P([0xd8cbb0, 0xb8c4c0, 0xe0c9a0, 0x9fb0a8, 0xcfa890, 0xe8e2d0, 0xa8a090, 0xc0d0c8, 0xd8b8a0, 0x8fa0b0]),
  commAcc: P([0x1f5f3f, 0x8f1f1f, 0x1f3f6f, 0xd8a02a, 0x2a2a2a, 0x6f2f5f, 0xc8502a, 0x2a6f6f, 0xe8d8b0]),
  aptStucco: P([0xe8e0cc, 0xd8d0bc, 0xc8c8b8, 0xe0d4b8, 0xd0d8cc, 0xf0e8d8, 0xc8bca8]),
  aptTrim: P([0xf0eadc, 0xd8ccb0, 0x6a5a4a, 0x40505a, 0xe8dcc0]),
  china: P([0xe8dcc8, 0xd8c8a8, 0xc8d0c8, 0xf0e0c0, 0xe0c8b0]),
  chinaTrim: P([0xb8202a, 0x1f7a4a, 0xd8a820, 0x1f6f8f, 0xc83a2a, 0x2a8f6a]),
  loftPaint: P([0xd8cfc0, 0x5f6e5c, 0x6a6f78, 0x9f9a90, 0xc8b89a, 0x8a5a44, 0x7f8f8a, 0xb8a888]),
  loftTrim: P([0x2a2a2a, 0x3a2a22, 0x1f2a24, 0xd8d0c0, 0x5a1a1a]),
  ware: P([0x9faaaa, 0x7f9a8a, 0x6a7f9a, 0xb8aa98, 0xc0bcb4, 0x9a8a7a, 0xaab0b0]),
  glass: P([0x4a6a78, 0x5a7a88, 0x3f5f6a, 0x6a8088, 0x4a6a5a, 0x7a6a50, 0x557080]),
  spandrel: P([0x9aa4ac, 0x8a9298, 0x7a8288, 0xb0b0a8, 0xc8c4bc, 0x9a9488]),
  stone: P([0xd8ceb8, 0xc8bca0, 0xb8b4ac, 0xe0d8c8, 0xa8a49c, 0xcab89c, 0x9c9894]),
  concrete: P([0xb8b4aa, 0xc8c4b8, 0xa8a8a0, 0xd0c8b8]),
};
const pick = (a, r) => a[Math.min(a.length - 1, Math.floor(r * a.length))];
// raise a linear colour to a minimum luminance (keeps hue), so painted walls never read as flat black
const lift = (c, minL) => { const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; if (l >= minL) return c; const k = minL / Math.max(l, 1e-3); return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; };
const lerp = (a, b, t) => a + (b - a) * t;

function chooseStyle(zone, r, lot, tallish) {
  const corner = lot.corner;
  switch (zone) {
    case 'victorian': return corner && r < 0.3 ? S.COMMERCIAL : r < 0.6 ? S.VICTORIAN : r < 0.9 ? S.EDWARDIAN : S.STUCCO;
    case 'castro': return corner && r < 0.3 ? S.COMMERCIAL : r < 0.5 ? S.VICTORIAN : r < 0.82 ? S.EDWARDIAN : S.STUCCO;
    case 'mission': return (corner && r < 0.45) || r < 0.25 ? S.COMMERCIAL : r < 0.6 ? S.VICTORIAN : r < 0.88 ? S.EDWARDIAN : r < 0.94 ? S.APARTMENT : S.STUCCO;
    case 'avenues': return corner && r < 0.18 ? S.COMMERCIAL : r < 0.88 ? S.STUCCO : r < 0.96 ? S.EDWARDIAN : S.VICTORIAN;
    case 'marina': return r < 0.55 ? S.STUCCO : r < 0.75 ? S.EDWARDIAN : r < 0.95 ? S.APARTMENT : S.VICTORIAN;
    case 'northbeach': return r < 0.4 ? S.COMMERCIAL : r < 0.72 ? S.EDWARDIAN : r < 0.85 ? S.APARTMENT : S.VICTORIAN;
    case 'nobhill': return tallish ? S.TOWER_STONE : r < 0.62 ? S.APARTMENT : r < 0.85 ? S.EDWARDIAN : S.COMMERCIAL;
    case 'tenderloin': return r < 0.72 ? S.APARTMENT : r < 0.94 ? S.COMMERCIAL : S.OFFICE;
    case 'chinatown': return r < 0.85 ? S.CHINATOWN : S.APARTMENT;
    case 'soma': return tallish ? S.TOWER_GLASS : r < 0.48 ? S.LOFT : r < 0.64 ? S.WAREHOUSE : r < 0.8 ? S.OFFICE : r < 0.92 ? S.APARTMENT : S.COMMERCIAL;
    case 'industrial': return r < 0.6 ? S.WAREHOUSE : r < 0.95 ? S.LOFT : S.OFFICE;
    case 'wharf': return r < 0.45 ? S.WAREHOUSE : r < 0.8 ? S.COMMERCIAL : S.LOFT;
    case 'downtown': return tallish ? (r < 0.6 ? S.TOWER_GLASS : S.TOWER_STONE) : r < 0.55 ? S.OFFICE : r < 0.8 ? S.TOWER_STONE : S.COMMERCIAL;
    case 'downtown_soma': return tallish ? (r < 0.8 ? S.TOWER_GLASS : S.TOWER_STONE) : r < 0.6 ? S.OFFICE : S.LOFT;
    default: return S.VICTORIAN;
  }
}
// tall-building height (m above ground) for the downtown / SoMa / Nob Hill zones, or 0 when the lot is low-rise
function towerHeight(zone, rnd, lot) {
  const r = rnd(), r2 = rnd(), r3 = rnd();
  switch (zone) {
    case 'downtown': {
      const dc = Math.hypot(lot.x - 1760, lot.z + 380), tall = Math.max(0, 1 - dc / 420);
      let h = 30 + r * 45 + tall * 45;
      if (r2 < 0.22 + tall * 0.3) h += 30 + r3 * (50 + tall * 40);
      if (lot.central) h = 70 + r3 * 70 + tall * 30;
      return h > 42 ? h : 0;
    }
    case 'downtown_soma': { let h = 25 + r * 40; if (r2 < 0.3) h += 30 + r3 * 60; if (lot.central) h = 60 + r3 * 60; return h > 42 ? h : 0; }
    case 'soma': return r2 < 0.1 && lot.hx > 9 ? 36 + r * 34 : 0;
    case 'nobhill': return r2 < 0.2 && lot.hx > 8 ? 34 + r * 30 : 0;
    default: return 0;
  }
}

// ------------------------------------------------------------------ spec
export function planBuildings(blocks, terrain, blockers) {
  const specs = [];
  const H = (x, z) => terrain.heightAt(x, z);
  for (const b of blocks) {
    for (const lot of b.lots) {
      if (blockers.some(o => overlapsCollider(lot, o))) continue;
      const rnd = mulberry32(Math.floor(lot.seed * 1e9) + 1);
      const tH = towerHeight(lot.zone, rnd, lot);
      const style = chooseStyle(lot.zone, rnd(), lot, tH > 0);
      // terrace split: wide low-rise lots on steep fronts become 2-3 buildings stepping down the hill
      const c = Math.cos(lot.yaw), s = Math.sin(lot.yaw);
      const W = lot.hx * 2;
      const fx = lot.x - s * lot.hz, fz = lot.z - c * lot.hz; // front edge centre (local -Z)
      const hA = H(fx + c * lot.hx, fz - s * lot.hx), hB = H(fx - c * lot.hx, fz + s * lot.hx);
      let parts = 1;
      const lowRise = style !== S.TOWER_GLASS && style !== S.TOWER_STONE && style !== S.OFFICE;
      if (lowRise && Math.abs(hA - hB) > 1.6 && W > 13) parts = Math.min(3, Math.max(2, Math.floor(W / 7)), Math.ceil(Math.abs(hA - hB) / 1.3));
      for (let p = 0; p < parts; p++) {
        const w = W / parts, cx = -lot.hx + w * (p + 0.5); // local x centre of the part
        const sub = parts === 1 ? lot : {
          ...lot, x: lot.x + c * cx, z: lot.z - s * cx, hx: w / 2 - (p > 0 && p < parts ? 0.04 : 0), seed: (lot.seed + p * 0.618) % 1,
          corner: lot.corner && (p === 0 || p === parts - 1),
        };
        const srnd = parts === 1 ? rnd : mulberry32(Math.floor(sub.seed * 1e9) + 7);
        const sp = makeSpec(sub, b, style, tH, srnd, H);
        sp.id = specs.length;
        specs.push(sp);
      }
    }
  }
  return specs;
}
function overlapsCollider(lot, o) {
  const dx = lot.x - o.x, dz = lot.z - o.z, r = Math.hypot(lot.hx, lot.hz) + Math.hypot(o.hx, o.hz);
  return dx * dx + dz * dz < r * r * 0.8;
}

function makeSpec(lot, block, style, tH, rnd, H) {
  const c = Math.cos(lot.yaw), s = Math.sin(lot.yaw);
  const sp = { lot, block, style, zone: lot.zone, c, s, x: lot.x, z: lot.z, hx: lot.hx, hz: lot.hz, yaw: lot.yaw, seed: rnd(), seedInt: Math.floor(lot.seed * 1e9) + 3 };
  const W = lot.hx * 2;
  sp.W = W;
  // ---------------------------------------------------------------- per-style dimensions
  let groundH, floorH, floors, parapet, setback, depthFrac, margin, bayW;
  const r = rnd, zone = lot.zone;
  switch (style) {
    case S.VICTORIAN: groundH = 2.8 + r() * 0.3; floorH = 3.4 + r() * 0.2; floors = r() < 0.8 ? 2 : 3; parapet = 1.3 + r() * 0.5; setback = 1.6 + r() * 0.6; depthFrac = 0.72; margin = 0.25; bayW = W / 2; break;
    case S.EDWARDIAN: groundH = 2.8 + r() * 0.2; floorH = 3.2; floors = r() < 0.55 ? 2 : 3; parapet = 0.9 + r() * 0.4; setback = 1.1 + r() * 0.6; depthFrac = 0.78; margin = 0.25; bayW = W / (W > 10.5 ? 3 : 2); break;
    case S.STUCCO: groundH = 2.9 + r() * 0.2; floorH = 3.0; floors = r() < 0.72 ? 1 : 2; parapet = 0.7 + r() * 0.5; setback = zone === 'avenues' ? 0.9 + r() * 0.8 : 0.6 + r() * 0.6; depthFrac = 0.7; margin = 0.3; bayW = W / 2; break;
    case S.COMMERCIAL: groundH = 4.2 + r() * 0.4; floorH = 3.3; floors = 1 + Math.floor(r() * 3); parapet = 1.1 + r() * 0.6; setback = 0; depthFrac = 0.92; margin = 0.35; bayW = 2.7 + r() * 0.6; break;
    case S.APARTMENT: groundH = 4.0; floorH = 3.0; floors = zone === 'tenderloin' ? 4 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3); parapet = 1.2 + r() * 0.5; setback = zone === 'marina' ? 0.8 : 0.1; depthFrac = 0.92; margin = 0.4; bayW = 2.5 + r() * 0.5; break;
    case S.CHINATOWN: groundH = 4.0 + r() * 0.3; floorH = 3.2; floors = 2 + Math.floor(r() * 3); parapet = 1.0 + r() * 0.4; setback = 0; depthFrac = 0.95; margin = 0.35; bayW = 2.6 + r() * 0.5; break;
    case S.LOFT: groundH = 4.8 + r() * 0.5; floorH = 4.1 + r() * 0.4; floors = 1 + Math.floor(r() * (zone === 'industrial' ? 2 : 4)); parapet = 1.4 + r() * 0.6; setback = 0; depthFrac = 0.96; margin = 0.6; bayW = 3.4 + r() * 0.8; break;
    case S.WAREHOUSE: groundH = 5.5 + r() * 1.5; floorH = 4.5; floors = r() < 0.6 ? 0 : 1; parapet = 1.0 + r() * 0.6; setback = 0; depthFrac = 0.97; margin = 0.8; bayW = 4.5 + r() * 1.5; break;
    case S.TOWER_GLASS: groundH = 6.5; floorH = 3.8; floors = Math.max(8, Math.round((tH - groundH) / floorH)); parapet = 2.2; setback = lot.central ? 0 : 0.3; depthFrac = 0.97; margin = 0.8; bayW = 1.5 + r() * 0.3; break;
    case S.TOWER_STONE: groundH = 6.0; floorH = 3.7; floors = Math.max(8, Math.round((tH - groundH) / floorH)); parapet = 2.0 + r() * 1.5; setback = 0.2; depthFrac = 0.96; margin = 1.2; bayW = 2.4 + r() * 0.5; break;
    default: /* OFFICE */ groundH = 5.0; floorH = 3.8; floors = 3 + Math.floor(r() * (zone.startsWith('downtown') ? 8 : 4)); parapet = 1.2; setback = 0.2; depthFrac = 0.95; margin = 0.8; bayW = 3.0 + r() * 0.6; break;
  }
  const D = lot.hz * 2;
  setback = Math.min(setback, D * 0.2);
  sp.setback = setback;
  sp.depth = Math.max(6, (D - setback) * depthFrac);
  sp.groundH = groundH; sp.floorH = floorH; sp.floors = floors; sp.parapet = parapet;
  sp.corniceH = parapet;
  sp.topH = groundH + floors * floorH + parapet;
  sp.margin = margin;
  sp.nb = Math.max(1, Math.round((W - 2 * margin) / bayW));
  if (style === S.VICTORIAN || style === S.STUCCO) sp.nb = 2;
  sp.cw = (W - 2 * margin) / sp.nb;
  // side (depth) grid
  sp.nbS = Math.max(1, Math.round((sp.depth - 2 * margin) / Math.max(2.4, bayW)));
  sp.cwS = (sp.depth - 2 * margin) / sp.nbS;
  // ---------------------------------------------------------------- ground line along the front (sidewalk heights)
  const fz0 = -lot.hz - 0.6; // just outside the lot front (sidewalk)
  const wAt = (lx, lz) => [lot.x + c * lx + s * lz, lot.z - s * lx + c * lz];
  // facade u runs from local +X (u = 0) to local -X (u = W)
  const [ax, az] = wAt(lot.hx, fz0), [bx, bz] = wAt(-lot.hx, fz0), [mx, mz] = wAt(0, fz0);
  const hL = H(ax, az), hR = H(bx, bz), hM = H(mx, mz);
  const y0 = Math.max(hL, hR, hM) + 0.06;
  sp.y0 = y0; sp.gA = hL - y0; sp.gB = (hR - hL) / W; sp.hL = hL; sp.hR = hR;
  let gmin = Math.min(hL, hR);
  for (const [lx, lz] of [[lot.hx, lot.hz], [-lot.hx, lot.hz], [0, 0]]) { const [x, z] = wAt(lx, lz); gmin = Math.min(gmin, H(x, z)); }
  sp.yb = gmin - 1.5;
  sp.yTop = y0 + sp.topH;
  // ---------------------------------------------------------------- looks
  let wallLayer = L.STUCCO, wallC, trimC, accC, glassC = lin(0x1b2228), glassMetal = 0.0;
  let winType = WT.DOUBLE, groundType = GT.RESID, itype = IT.RES, lit = 0.34, recess = 0.16, gCell = 0, hood = 1, age = 0.5;
  let winW = 0.95, winH = 2.1, sillH = 0.75;
  switch (style) {
    case S.VICTORIAN:
      wallLayer = L.SIDING; wallC = pick(PAL.vicBody, r()); trimC = pick(PAL.vicTrim, r()); accC = pick(PAL.vicAcc, r());
      winType = WT.DOUBLE; groundType = GT.HOUSE; winW = 0.95; winH = 2.2; sillH = 0.7; recess = 0.14; age = 0.25;
      gCell = r() < 0.5 ? 0 : 1; sp.gable = r() < (lot.corner ? 0.7 : 0.4); sp.turret = lot.corner && r() < 0.55;
      break;
    case S.EDWARDIAN:
      wallLayer = r() < 0.45 ? L.SIDING : L.STUCCO; wallC = pick(PAL.edwBody, r()); trimC = pick(PAL.edwTrim, r()); accC = pick(PAL.vicAcc, r());
      winType = WT.DOUBLE; groundType = GT.HOUSE; winW = 1.0; winH = 2.0; sillH = 0.75; recess = 0.14; age = 0.3; gCell = r() < 0.5 ? 0 : sp.nb - 1;
      sp.roundBay = r() < 0.4;
      break;
    case S.STUCCO:
      wallLayer = L.STUCCO; wallC = pick(PAL.stucco, r()); trimC = pick(PAL.stuccoTrim, r()); accC = pick(PAL.commAcc, r());
      winType = WT.PICTURE; groundType = GT.HOUSE; winW = 1.4; winH = 1.7; sillH = 0.85; recess = 0.12; age = 0.35; gCell = r() < 0.5 ? 0 : 1;
      sp.tileRoof = r() < 0.55; sp.archEntry = r() < 0.6;
      break;
    case S.COMMERCIAL: {
      const rr = r();
      wallLayer = rr < 0.3 ? L.BRICK : rr < 0.45 ? L.BRICK_PAINT : rr < 0.8 ? L.STUCCO : L.SIDING;
      wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.comm, r()); trimC = pick(PAL.edwTrim, r()); accC = pick(PAL.commAcc, r());
      winType = r() < 0.2 ? WT.ARCH : WT.DOUBLE; groundType = GT.STORE; itype = r() < 0.3 ? IT.OFFICE : IT.RES; winW = 1.1; winH = 1.9; sillH = 0.8; recess = 0.18; age = 0.6;
      sp.bayCols = wallLayer !== L.BRICK && r() < 0.4;
      break;
    }
    case S.APARTMENT: {
      const rr = r();
      wallLayer = rr < 0.35 ? L.BRICK : rr < 0.55 ? L.BRICK_DARK : rr < 0.9 ? L.STUCCO : L.BRICK_PAINT;
      wallC = (wallLayer === L.BRICK || wallLayer === L.BRICK_DARK) ? [1, 1, 1] : pick(PAL.aptStucco, r()); trimC = pick(PAL.aptTrim, r()); accC = pick(PAL.commAcc, r());
      winType = WT.DOUBLE; groundType = zone === 'tenderloin' || r() < 0.3 ? GT.STORE : GT.LOBBY; winW = 1.0; winH = 1.8; sillH = 0.8; recess = 0.2; age = 0.7;
      sp.bayCols = r() < 0.6; sp.fireEscape = (wallLayer !== L.STUCCO) && r() < 0.75; sp.neon = zone === 'tenderloin' && r() < 0.5;
      break;
    }
    case S.CHINATOWN:
      wallLayer = r() < 0.45 ? L.BRICK_PAINT : r() < 0.7 ? L.STUCCO : L.BRICK; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.china, r()); trimC = pick(PAL.chinaTrim, r()); accC = pick(PAL.chinaTrim, r());
      winType = WT.DOUBLE; groundType = GT.STORE; winW = 1.0; winH = 1.8; sillH = 0.8; recess = 0.18; age = 0.7; sp.balconies = r() < 0.75; sp.pagoda = lot.corner || r() < 0.25;
      break;
    case S.LOFT:
      wallLayer = r() < 0.62 ? L.BRICK : r() < 0.88 ? L.BRICK_PAINT : L.CONCRETE; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.loftPaint, r()); trimC = pick(PAL.loftTrim, r()); accC = pick(PAL.commAcc, r());
      winType = r() < 0.55 ? WT.ARCH : WT.LOFT; groundType = r() < 0.45 ? GT.ROLLUP : GT.STORE; itype = IT.LOFT; winW = sp.cw * 0.62; winH = floorH * 0.62; sillH = 0.9; recess = 0.32; age = 0.85; hood = 0;
      sp.fireEscape = r() < 0.7; sp.ghostSign = r() < 0.5;
      break;
    case S.WAREHOUSE:
      wallLayer = r() < 0.45 ? L.CORRUGATED : r() < 0.8 ? L.CONCRETE : L.BRICK; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.ware, r()); trimC = pick(PAL.loftTrim, r()); accC = pick(PAL.ware, r());
      winType = WT.LOFT; groundType = GT.ROLLUP; itype = IT.LOFT; winW = sp.cw * 0.6; winH = 1.6; sillH = floorH - 2.2; recess = 0.12; age = 0.9; hood = 0; lit = 0.15;
      if (floors === 0) { sp.clerestory = true; }
      break;
    case S.TOWER_GLASS:
      wallLayer = L.METAL; wallC = pick(PAL.spandrel, r()); trimC = lin(0x3a3e44); accC = lin(0x2a2e33); glassC = pick(PAL.glass, r()); glassMetal = 0.35 + r() * 0.3;
      winType = WT.PLAIN; groundType = GT.LOBBY; itype = IT.OFFICE; lit = 0.5; recess = 0.05; winW = sp.cw; winH = floorH - 1.0; sillH = 0.95; age = 0.2; hood = 0;
      sp.curtain = true;
      break;
    case S.TOWER_STONE:
      wallLayer = r() < 0.85 ? L.STONE : L.BRICK; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.stone, r()); trimC = pick(PAL.stone, r()); accC = lin(0x2a2622);
      winType = WT.PLAIN; groundType = GT.LOBBY; itype = IT.OFFICE; lit = 0.45; recess = 0.28; winW = Math.min(1.5, sp.cw * 0.55); winH = floorH * 0.58; sillH = 0.9; age = 0.6; hood = 0;
      break;
    default: // OFFICE
      wallLayer = r() < 0.5 ? L.CONCRETE : L.STONE; wallC = pick(wallLayer === L.CONCRETE ? PAL.concrete : PAL.stone, r()); trimC = lin(0x4a4a48); accC = lin(0x2a2e33); glassC = pick(PAL.glass, r()); glassMetal = 0.25;
      winType = WT.PLAIN; groundType = GT.LOBBY; itype = IT.OFFICE; lit = 0.45; recess = 0.22; winW = sp.cw * 0.82; winH = floorH * 0.5; sillH = 1.0; age = 0.6; hood = 0;
      sp.ribbon = r() < 0.5;
      break;
  }
  if (sp.ribbon) { winW = sp.cw; }
  wallC = lift(wallC, style === S.VICTORIAN ? 0.1 : style === S.TOWER_GLASS ? 0.2 : 0.28);
  accC = lift(accC, 0.045); trimC = lift(trimC, 0.05);
  // real-world paint: muted (photoreal SF is pastel, not toy-saturated) and no two buildings exactly alike
  const mute = (c, k, v = 1) => { const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map(x => Math.min(1, (y + (x - y) * k) * v)); };
  wallC = mute(wallC, 0.78, 0.9 + 0.16 * r()); trimC = mute(trimC, 0.85); accC = mute(accC, 0.85);
  sp.wallLayer = wallLayer; sp.wallC = wallC; sp.trimC = trimC; sp.accC = accC; sp.glassC = glassC; sp.glassMetal = glassMetal;
  sp.winType = winType; sp.groundType = groundType; sp.itype = itype; sp.lit = lit; sp.recess = recess; sp.gCell = gCell; sp.hood = hood; sp.age = age;
  winW = Math.min(winW, sp.cw - 0.3); winH = Math.min(winH, floorH - sillH - 0.3);
  sp.winW = winW; sp.winH = winH; sp.sillH = sillH;
  // baked facade-kit units (material.js KIT_KEYS order): 0 vic, 1 edw, 2 ital, 3 brick, 4 stucco, 5 modern, 6 loft; doors 7 vic, 8 edw
  const brickish = wallLayer === L.BRICK || wallLayer === L.BRICK_DARK || wallLayer === L.BRICK_PAINT || wallLayer === L.STONE;
  sp.kitWin = style === S.VICTORIAN ? 0 : style === S.STUCCO ? 4 : winType === WT.ARCH ? 2 : winType === WT.LOFT ? 6
    : style === S.OFFICE || style === S.TOWER_GLASS ? 5 : brickish ? 3 : 1;
  sp.kitDoor = style === S.VICTORIAN ? 7 : 8;
  // side exposure (street-facing sides of corner lots)
  sp.exposeR = false; sp.exposeL = false;
  if (lot.corner && block.inner) {
    for (const [sgn, key] of [[1, 'exposeL'], [-1, 'exposeR']]) {
      // local +X side is the facade's left edge (u = 0) seen from the street
      const [px, pz] = wAt(sgn * (lot.hx + 3.0), 0);
      if (!pointInPoly(px, pz, block.inner)) sp[key] = true;
    }
  }
  return sp;
}
function pointInPoly(x, z, poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const sg = cr > 0 ? 1 : -1;
    if (sign === 0) sign = sg; else if (sg !== sign) return false;
  }
  return true;
}

// ------------------------------------------------------------------ params texture
export function makeParamsTexture(specs) {
  const rows = Math.ceil(specs.length * NP / PW) + 1;
  const data = new Float32Array(PW * rows * 4);
  for (const sp of specs) {
    const o = sp.id * NP * 4;
    const put = (k, a, b, c, d) => { const i = o + k * 4; data[i] = a; data[i + 1] = b; data[i + 2] = c; data[i + 3] = d; };
    const cw = sp.cw, fh = sp.floorH;
    const lox = Math.max(0.05, (cw - sp.winW) / 2 / cw), hix = 1 - lox;
    put(0, fh, sp.groundH, sp.topH, sp.margin);
    put(1, lox, sp.sillH / fh, hix, (sp.sillH + sp.winH) / fh);
    put(2, sp.wallLayer, sp.winType, sp.groundType + 8 * sp.gCell, sp.seed);
    put(3, sp.wallC[0], sp.wallC[1], sp.wallC[2], sp.lit);
    put(4, sp.trimC[0], sp.trimC[1], sp.trimC[2], sp.itype);
    put(5, sp.accC[0], sp.accC[1], sp.accC[2], sp.recess);
    put(6, sp.y0, sp.gA, sp.gB, sp.corniceH);
    put(7, sp.glassC[0], sp.glassC[1], sp.glassC[2], sp.glassMetal);
    put(8, cw, sp.nb, sp.age, sp.hood);
    put(9, (sp.kitWin ?? -1) + 1, (sp.kitDoor ?? -1) + 1, 0, 0);
  }
  const t = new THREE.DataTexture(data, PW, rows, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
