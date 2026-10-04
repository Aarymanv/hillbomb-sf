// Buildings v2 global pass: one tight loop over every real OSM footprint (178k) -> neighbourhood zone (real lat/lon),
// architectural style (zone + height + kind + area + levels), oriented bounding box, street-facing walls (outward probe
// on the baked road raster), facade ground line y0, and the per-building params the facade shader reads (material.js NP
// texels per building, same layout as plan.js makeParamsTexture, so near/far LODs and v1 share one shader).
import * as THREE from 'three';
import { toLatLon } from '../latlon.js';
import { NP, PW } from './material.js';
import { L } from './layers.js';
import { S, GT, WT, IT } from './plan.js';
import { lin } from './emit.js';
import { splitRows, NOV5, NOV6 } from './v2lots.js';

// ------------------------------------------------------------------ neighbourhoods (real centres, radius m)
export const Z = { DOWNTOWN: 0, SOMA: 1, INDUSTRIAL: 2, CHINATOWN: 3, NORTHBEACH: 4, WHARF: 5, NOBHILL: 6, TENDERLOIN: 7,
  VICTORIAN: 8, CASTRO: 9, MISSION: 10, MARINA: 11, AVENUES: 12, PRESIDIO: 13, BAYVIEW: 14, CIVIC: 15 };
export const ZONE_NAMES = Object.keys(Z);
const AREAS = [
  [37.7946, -122.3999, 700, Z.DOWNTOWN], [37.7880, -122.4075, 380, Z.DOWNTOWN], [37.7865, -122.3925, 450, Z.DOWNTOWN], [37.7895, -122.3960, 420, Z.DOWNTOWN],
  [37.7810, -122.3895, 450, Z.SOMA], [37.7785, -122.4056, 1100, Z.SOMA], [37.7706, -122.3920, 800, Z.SOMA],
  [37.7609, -122.3874, 600, Z.INDUSTRIAL], [37.7272, -122.3700, 1100, Z.INDUSTRIAL], [37.8235, -122.3706, 900, Z.INDUSTRIAL], [37.7480, -122.3860, 700, Z.INDUSTRIAL],
  [37.7310, -122.3880, 1500, Z.BAYVIEW], [37.7153, -122.4040, 900, Z.BAYVIEW],
  [37.7941, -122.4066, 340, Z.CHINATOWN],
  [37.8008, -122.4103, 500, Z.NORTHBEACH], [37.8025, -122.4058, 320, Z.NORTHBEACH],
  [37.8080, -122.4177, 600, Z.WHARF],
  [37.8011, -122.4194, 600, Z.NOBHILL], [37.7930, -122.4161, 450, Z.NOBHILL],
  [37.7847, -122.4141, 450, Z.TENDERLOIN], [37.7793, -122.4176, 380, Z.CIVIC],
  [37.7759, -122.4245, 500, Z.VICTORIAN], [37.7717, -122.4318, 450, Z.VICTORIAN], [37.7692, -122.4481, 700, Z.VICTORIAN], [37.7651, -122.4497, 450, Z.VICTORIAN],
  [37.7810, -122.4330, 800, Z.VICTORIAN], [37.7854, -122.4295, 350, Z.VICTORIAN], [37.7925, -122.4382, 900, Z.VICTORIAN], [37.7980, -122.4370, 500, Z.VICTORIAN],
  [37.7886, -122.4515, 600, Z.VICTORIAN], [37.7843, -122.4498, 500, Z.VICTORIAN], [37.7765, -122.4330, 350, Z.VICTORIAN],
  [37.7609, -122.4350, 650, Z.CASTRO], [37.7502, -122.4337, 900, Z.CASTRO],
  [37.7599, -122.4148, 1200, Z.MISSION], [37.7599, -122.4015, 900, Z.MISSION], [37.7417, -122.4150, 900, Z.MISSION],
  [37.8021, -122.4368, 750, Z.MARINA],
  [37.7989, -122.4662, 1800, Z.PRESIDIO],
  [37.7802, -122.4642, 1000, Z.AVENUES], [37.7778, -122.4930, 1300, Z.AVENUES], [37.7870, -122.4900, 500, Z.AVENUES], [37.7602, -122.4677, 900, Z.AVENUES],
  [37.7555, -122.4950, 1600, Z.AVENUES], [37.7406, -122.4927, 1100, Z.AVENUES], [37.7480, -122.4630, 700, Z.AVENUES], [37.7544, -122.4477, 700, Z.AVENUES],
  [37.7417, -122.4430, 600, Z.AVENUES], [37.7340, -122.4336, 700, Z.AVENUES], [37.7246, -122.4250, 1100, Z.AVENUES], [37.7230, -122.4520, 900, Z.AVENUES],
  [37.7250, -122.4930, 1200, Z.AVENUES],
];
const KXD = 88100, KZD = 110992;
export const inChinatown = (lat, lon) => lat > 37.7904 && lat < 37.7981 && lon > -122.4093 && lon < -122.4043;
export function zoneAt(x, z) {
  const [lat, lon] = toLatLon(x, z);
  // real Chinatown: Bush St (Dragon Gate) to Broadway, Powell / Stockton to Kearny (the circles below leaked its south end
  // along Grant Ave into downtown)
  if (inChinatown(lat, lon)) return Z.CHINATOWN;
  let best = Z.AVENUES, bq = 1;
  for (let k = 0; k < AREAS.length; k++) {
    const a = AREAS[k], dx = (lon - a[1]) * KXD, dz = (lat - a[0]) * KZD, q = (dx * dx + dz * dz) / (a[2] * a[2]);
    if (q < bq) { bq = q; best = a[3]; }
  }
  return best;
}

// ------------------------------------------------------------------ palettes (linear)
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
  china: P([0xb8a58a, 0x9fb5a2, 0xc9a26a, 0x8f5a48, 0xa8b8a8, 0xc8b89a, 0x7f8f84, 0xb07a58, 0xd0c09a]),   // painted brick: tan, jade, mustard, oxblood
  chinaTrim: P([0xb8202a, 0x1f7a4a, 0xd8a820, 0x1f6f8f, 0xc83a2a, 0x2a8f6a]),
  loftPaint: P([0xd8cfc0, 0x5f6e5c, 0x6a6f78, 0x9f9a90, 0xc8b89a, 0x8a5a44, 0x7f8f8a, 0xb8a888]),
  loftTrim: P([0x2a2a2a, 0x3a2a22, 0x1f2a24, 0xd8d0c0, 0x5a1a1a]),
  ware: P([0x9faaaa, 0x7f9a8a, 0x6a7f9a, 0xb8aa98, 0xc0bcb4, 0x9a8a7a, 0xaab0b0]),
  glass: P([0x4a6a78, 0x5a7a88, 0x3f5f6a, 0x6a8088, 0x4a6a5a, 0x7a6a50, 0x557080]),
  spandrel: P([0x9aa4ac, 0x8a9298, 0x7a8288, 0xb0b0a8, 0xc8c4bc, 0x9a9488]),
  stone: P([0xd8ceb8, 0xc8bca0, 0xb8b4ac, 0xe0d8c8, 0xa8a49c, 0xcab89c, 0x9c9894]),
  concrete: P([0xb8b4aa, 0xc8c4b8, 0xa8a8a0, 0xd0c8b8]),
  roofTile: P([0xa8543a, 0xb8643f, 0x9a4a36, 0xc07a52]),
  shingle: P([0x5a5654, 0x4a4644, 0x6a5a4e, 0x3f4448, 0x6e6660]),
  whites: P([0xf4f1ea, 0xece8de, 0xe2e0da, 0xd8d8d4, 0xc8ccd0, 0xb8bcc0, 0xf0ece0, 0xa8aeb4]),
  bold: P([0xe8b83a, 0x3a8f8a, 0xd8587a, 0x8a5ab0, 0x4a78c0, 0xe07a3a, 0x5aa05a, 0xc03a3a, 0x2f6fa0, 0xf0c8d8]),
};
const RESZ = new Set([Z.VICTORIAN, Z.CASTRO, Z.MISSION, Z.MARINA, Z.AVENUES, Z.BAYVIEW, Z.NORTHBEACH]);
const pick = (a, r) => a[Math.min(a.length - 1, Math.floor(r * a.length))];
const lift = (c, minL) => { const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; if (l >= minL) return c; const k = minL / Math.max(l, 1e-3); return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; };
const hexLin = (h) => lin(h);

// style dims: groundH, floorH, parapet, margin, bay (target window-cell width, m)
const DIMS = [];
DIMS[S.VICTORIAN] = [2.9, 3.4, 1.4, 0.25, 3.4]; DIMS[S.EDWARDIAN] = [2.9, 3.2, 1.0, 0.25, 3.0]; DIMS[S.STUCCO] = [2.9, 3.0, 0.8, 0.3, 3.6];
DIMS[S.COMMERCIAL] = [4.3, 3.3, 1.2, 0.35, 3.0]; DIMS[S.APARTMENT] = [4.0, 3.0, 1.3, 0.4, 2.8]; DIMS[S.CHINATOWN] = [4.1, 3.2, 1.1, 0.35, 2.9];
DIMS[S.LOFT] = [5.0, 4.2, 1.5, 0.6, 3.8]; DIMS[S.WAREHOUSE] = [6.0, 4.5, 1.2, 0.8, 5.5]; DIMS[S.TOWER_GLASS] = [6.5, 3.8, 2.2, 0.8, 1.6];
DIMS[S.TOWER_STONE] = [6.0, 3.7, 2.4, 1.0, 2.6]; DIMS[S.OFFICE] = [5.0, 3.8, 1.2, 0.8, 3.2];

function chooseStyle(zone, hA, kind, area, r, rich = false) {
  if (hA >= 45) {
    if (zone === Z.DOWNTOWN) return r < 0.62 ? S.TOWER_GLASS : S.TOWER_STONE;
    if (zone === Z.SOMA) return r < 0.75 ? S.TOWER_GLASS : S.TOWER_STONE;
    return r < 0.3 ? S.TOWER_GLASS : S.TOWER_STONE;
  }
  if (kind === 6 || kind === 7 || kind === 9) return S.OFFICE;
  if (hA >= 16) {
    switch (zone) {
      case Z.DOWNTOWN: return r < 0.45 ? S.OFFICE : r < 0.85 ? S.TOWER_STONE : S.TOWER_GLASS;
      case Z.SOMA: return r < 0.3 ? S.LOFT : r < 0.55 ? S.OFFICE : r < 0.82 ? S.APARTMENT : S.TOWER_GLASS;
      case Z.INDUSTRIAL: case Z.WHARF: case Z.BAYVIEW: return r < 0.6 ? S.LOFT : S.OFFICE;
      case Z.CHINATOWN: return r < 0.8 ? S.CHINATOWN : S.APARTMENT;
      case Z.CIVIC: return r < 0.5 ? S.TOWER_STONE : S.OFFICE;
      default: return kind === 3 || kind === 5 ? (r < 0.5 ? S.OFFICE : S.TOWER_STONE) : r < 0.85 ? S.APARTMENT : S.TOWER_STONE;
    }
  }
  if (kind === 4) return r < 0.7 ? S.WAREHOUSE : S.LOFT;
  if (kind === 5 || kind === 8) return r < 0.5 ? S.TOWER_STONE : S.OFFICE;
  const comm = kind === 3;
  switch (zone) {
    case Z.DOWNTOWN: return r < 0.35 ? S.OFFICE : r < 0.65 ? S.TOWER_STONE : S.COMMERCIAL;
    case Z.CIVIC: return comm ? S.COMMERCIAL : r < 0.5 ? S.APARTMENT : S.TOWER_STONE;
    case Z.SOMA: return area > 1200 ? (r < 0.5 ? S.WAREHOUSE : S.LOFT) : r < 0.42 ? S.LOFT : r < 0.57 ? S.WAREHOUSE : r < 0.8 ? S.APARTMENT : S.COMMERCIAL;
    case Z.INDUSTRIAL: return area < 180 ? (r < 0.6 ? S.STUCCO : S.EDWARDIAN) : r < 0.6 ? S.WAREHOUSE : S.LOFT;
    case Z.WHARF: return r < 0.4 ? S.WAREHOUSE : r < 0.8 ? S.COMMERCIAL : S.LOFT;
    case Z.CHINATOWN: return r < 0.85 ? S.CHINATOWN : S.APARTMENT;
    case Z.NORTHBEACH: return comm || r < 0.25 ? S.COMMERCIAL : r < 0.62 ? S.EDWARDIAN : r < 0.85 ? S.APARTMENT : S.VICTORIAN;
    case Z.NOBHILL: return area > 450 || r < 0.5 ? S.APARTMENT : r < 0.85 ? S.EDWARDIAN : r < 0.93 ? S.VICTORIAN : S.COMMERCIAL;
    case Z.TENDERLOIN: return comm ? S.COMMERCIAL : r < 0.74 ? S.APARTMENT : r < 0.94 ? S.COMMERCIAL : S.OFFICE;
    case Z.VICTORIAN: return comm ? S.COMMERCIAL : area > 450 ? S.APARTMENT : r < 0.55 ? S.VICTORIAN : r < 0.9 ? S.EDWARDIAN : S.STUCCO;
    case Z.CASTRO: return comm ? S.COMMERCIAL : area > 450 ? S.APARTMENT : r < 0.45 ? S.VICTORIAN : r < 0.8 ? S.EDWARDIAN : S.STUCCO;
    case Z.MISSION: return comm ? S.COMMERCIAL : area > 500 ? (r < 0.5 ? S.APARTMENT : S.COMMERCIAL) : r < 0.14 ? S.COMMERCIAL : r < 0.55 ? S.VICTORIAN : r < 0.85 ? S.EDWARDIAN : r < 0.93 ? S.APARTMENT : S.STUCCO;
    case Z.MARINA: return comm ? S.COMMERCIAL : area > 400 ? S.APARTMENT : r < 0.62 ? S.STUCCO : r < 0.86 ? S.EDWARDIAN : S.APARTMENT;
    case Z.PRESIDIO: return r < 0.65 ? S.APARTMENT : S.EDWARDIAN;
    case Z.BAYVIEW: return area > 900 ? S.WAREHOUSE : comm ? S.COMMERCIAL : r < 0.62 ? S.STUCCO : r < 0.86 ? S.EDWARDIAN : S.VICTORIAN;
    // (v6) inner / central Richmond: Edwardian flats + Doelger-era stucco side by side (the Sunset stays mostly stucco)
    default: return comm ? S.COMMERCIAL : area > 500 ? S.APARTMENT : rich ? (r < 0.5 ? S.STUCCO : r < 0.86 ? S.EDWARDIAN : S.VICTORIAN)
      : r < 0.85 ? S.STUCCO : r < 0.95 ? S.EDWARDIAN : S.VICTORIAN;
  }
}

// ------------------------------------------------------------------ commercial corridors (real streets) -> district id
// A building whose street-facing wall looks onto one of these streets gets a storefront ground floor (lit sign band,
// awning, blade signs: v2dress.js) whatever its style. DIST ids are also the dress flavour keys.
export const DIST = { NONE: 0, UNIONSQ: 1, FIDI: 2, POLK: 3, MISSION: 4, CASTRO: 5, HAIGHT: 6, NBEACH: 7, TENDERLOIN: 8, CLEMENT: 9,
  IRVING: 10, CHESTNUT: 11, FILLMORE: 12, DIVIS: 13, CHINA: 14, VALENCIA: 15, TWENTYFOURTH: 16, UNION: 17 };
// [district, street regex (null = every street in the box), lat0, lat1, lon0, lon1]
const CORRIDORS = [
  [DIST.UNIONSQ, /^(Powell|Stockton|Geary|Post|Sutter|O'Farrell|Grant|Maiden|Kearny|Mason|Ellis|Market)\b/, 37.7838, 37.7905, -122.4112, -122.4022],
  [DIST.FIDI, /^(Montgomery|Kearny|Sansome|Battery|Bush|Pine|California|Sacramento|Clay|Front|Market|Mission|Howard|New Montgomery|2nd|Second|Drumm|Davis|Spear|Main|Beale|Fremont|1st|First)\b/, 37.7860, 37.7970, -122.4050, -122.3930],
  [DIST.POLK, /^Polk\b/, 37.7830, 37.8010, -122.4245, -122.4175],
  [DIST.MISSION, /^Mission\b/, 37.7440, 37.7720, -122.4230, -122.4150],
  [DIST.VALENCIA, /^Valencia\b/, 37.7470, 37.7700, -122.4235, -122.4195],
  [DIST.TWENTYFOURTH, /^24th\b/, 37.7505, 37.7540, -122.4240, -122.4050],
  [DIST.MISSION, /^(16th|18th|22nd)\b/, 37.7545, 37.7660, -122.4235, -122.4150],
  [DIST.CASTRO, /^Castro\b/, 37.7570, 37.7645, -122.4370, -122.4330],
  [DIST.CASTRO, /^(Market|18th)\b/, 37.7595, 37.7680, -122.4380, -122.4265],
  [DIST.HAIGHT, /^Haight\b/, 37.7680, 37.7735, -122.4545, -122.4240],
  [DIST.NBEACH, /^(Columbus|Broadway|Grant|Stockton|Green|Vallejo|Union|Kearny|Powell)\b/, 37.7970, 37.8035, -122.4135, -122.4025],
  [DIST.TENDERLOIN, null, 37.7812, 37.7872, -122.4192, -122.4100],
  [DIST.CLEMENT, /^Clement\b/, 37.7815, 37.7845, -122.4770, -122.4555],
  [DIST.IRVING, /^Irving\b/, 37.7625, 37.7650, -122.4840, -122.4580],
  [DIST.CHESTNUT, /^Chestnut\b/, 37.7995, 37.8015, -122.4460, -122.4320],
  [DIST.UNION, /^Union\b/, 37.7965, 37.7990, -122.4380, -122.4250],
  [DIST.FILLMORE, /^Fillmore\b/, 37.7815, 37.7935, -122.4350, -122.4315],
  [DIST.DIVIS, /^Divisadero\b/, 37.7700, 37.7860, -122.4410, -122.4365],
];
const CR = 8;   // corridor raster cell (m)
function corridorRaster(data, X0, Z0, W, H) {
  const R = data.roads; if (!R || !R.edges) return null;
  const nx = Math.ceil(W / CR), nz = Math.ceil(H / CR), a = new Uint8Array(nx * nz), P = R.pts;
  const tests = CORRIDORS.map(c => c);
  for (const E of R.edges) {
    const name = R.names[E[2]] || '', width = E[6] || 8, p0 = E[10], np = E[11];
    if (!name || np < 2) continue;
    let cand = null;
    for (const c of tests) if (!c[1] || c[1].test(name)) { (cand || (cand = [])).push(c); }
    if (!cand) continue;
    const rad = width / 2 + 3;
    for (let k = 0; k + 1 < np; k++) {
      const ax = P[(p0 + k) * 3], az = P[(p0 + k) * 3 + 1], bx = P[(p0 + k + 1) * 3], bz = P[(p0 + k + 1) * 3 + 1];
      const [lat, lon] = toLatLon((ax + bx) / 2, (az + bz) / 2);
      let d = 0;
      for (const c of cand) if (lat > c[2] && lat < c[3] && lon > c[4] && lon < c[5]) { d = c[0]; break; }
      if (!d) continue;
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
      for (let s = 0; s <= n; s++) {
        const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
        const i0 = Math.max(0, Math.floor((x - rad - X0) / CR)), i1 = Math.min(nx - 1, Math.floor((x + rad - X0) / CR));
        const j0 = Math.max(0, Math.floor((z - rad - Z0) / CR)), j1 = Math.min(nz - 1, Math.floor((z + rad - Z0) / CR));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const cx = X0 + (i + 0.5) * CR - x, cz = Z0 + (j + 0.5) * CR - z;
          if (cx * cx + cz * cz <= (rad + CR * 0.5) ** 2) a[j * nx + i] = d;
        }
      }
    }
  }
  return { a, nx, nz, at(x, z) { const i = Math.floor((x - X0) / CR), j = Math.floor((z - Z0) / CR); return i < 0 || j < 0 || i >= nx || j >= nz ? 0 : a[j * nx + i]; } };
}

// ------------------------------------------------------------------ per-building record (SoA)
function hash(i, s) { let h = Math.imul(i ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
export const FRONT = 1;

export function planCity(data, terrain) {
  const t0 = performance.now();
  // rowhouse lots: long residential footprints become per-lot pieces appended after the OSM buildings (v2lots.js)
  const SP = splitRows(data.buildings, terrain);
  const B = SP.B, N = SP.N, N0 = SP.N0;
  const P = {
    N, N0, bx: B, lotF: SP.lotF, lotN: SP.lotN, par: SP.par, twinOf: SP.twin, lots: SP.stats, lotMs: SP.ms, cx: new Float32Array(N), cz: new Float32Array(N), area: new Float32Array(N),
    minX: new Float32Array(N), minZ: new Float32Array(N), maxX: new Float32Array(N), maxZ: new Float32Array(N),
    ox: new Float32Array(N), oz: new Float32Array(N), ohx: new Float32Array(N), ohz: new Float32Array(N), oyaw: new Float32Array(N), fill: new Float32Array(N),
    y0: new Float32Array(N), yb: new Float32Array(N), yEave: new Float32Array(N), yTop: new Float32Array(N),
    style: new Uint8Array(N), zone: new Uint8Array(N), pitched: new Uint8Array(N), rnd: new Float32Array(N),
    edge: new Uint8Array(B.verts.length / 2),      // per ring edge (global vertex index): FRONT bit
    roofC: new Float32Array(N * 3), roofL: new Uint8Array(N), flags: new Uint8Array(N),
    corr: new Uint8Array(N), swd: new Uint8Array(N),   // corridor district id; street distance of the first asphalt probe (dm)
    eg: new Int16Array(B.verts.length / 2).fill(-32768),   // per ring vertex on a street wall: ground 1.2 m out (5 cm units, absolute; v3 NEAR stoops / garages)
    // (v6) back yard: ground height behind the house (-1e4 = no yard) + the yard direction (opposite the main street front, x127)
    yg: new Float32Array(N).fill(-1e4), yd: new Int8Array(N * 2), ys: new Float32Array(N),   // ys = ground slope along the yard (m / m)
  };
  const CRr = corridorRaster(data, B.X0, B.Z0, B.TC * 512, B.TR * 512);
  const rows = Math.ceil(N * NP / PW) + 1;
  const params = new Float32Array(PW * rows * 4);
  P.params = params;
  const ring = [];
  const X0 = B.X0, Z0 = B.Z0, TC = B.TC;
  let fronts = 0;
  for (let i = 0; i < N; i++) {
    // ring in world space (inlined B.ring for speed)
    const t = B.tileOf[i], ox = X0 + (t % TC) * 512, oz = Z0 + Math.floor(t / TC) * 512, n = B.nv[i], v0 = B.v0[i];
    ring.length = n * 2;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let k = 0, v = v0 * 2; k < n; k++, v += 2) {
      const x = ox + B.verts[v] / 16, z = oz + B.verts[v + 1] / 16; ring[k * 2] = x; ring[k * 2 + 1] = z;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    P.minX[i] = x0; P.minZ[i] = z0; P.maxX[i] = x1; P.maxZ[i] = z1;
    // area + centroid
    let A = 0, cx = 0, cz = 0;
    for (let k = 0; k < n; k++) {
      const ax = ring[k * 2] - x0, az = ring[k * 2 + 1] - z0, kk = (k + 1) % n, bx = ring[kk * 2] - x0, bz = ring[kk * 2 + 1] - z0;
      const cr = ax * bz - bx * az; A += cr; cx += (ax + bx) * cr; cz += (az + bz) * cr;
    }
    const sgn = A < 0 ? -1 : 1;
    A *= 0.5;
    if (Math.abs(A) > 1e-3) { cx = x0 + cx / (6 * A); cz = z0 + cz / (6 * A); } else { cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; }
    const area = Math.abs(A);
    P.cx[i] = cx; P.cz[i] = cz; P.area[i] = area;
    const zone = zoneAt(cx, cz), r = hash(i, 1);
    let rich = false;
    if (!NOV6 && zone === Z.AVENUES) { const [la, lo] = toLatLon(cx, cz); rich = la > 37.7735 && la < 37.7885 && lo > -122.5105 && lo < -122.4570; }
    // oriented bounding box: minimum area over (up to 48 longest-ish) edge directions
    let bestA = Infinity, bux = 1, buz = 0, bu0 = 0, bu1 = 0, bv0 = 0, bv1 = 0;
    const step = n > 48 ? Math.ceil(n / 48) : 1;
    for (let k = 0; k < n; k += step) {
      const kk = (k + 1) % n, ex = ring[kk * 2] - ring[k * 2], ez = ring[kk * 2 + 1] - ring[k * 2 + 1], l = Math.hypot(ex, ez);
      if (l < 0.4) continue;
      const ux = ex / l, uz = ez / l;
      let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9;
      for (let q = 0; q < n; q++) {
        const px = ring[q * 2] - cx, pz = ring[q * 2 + 1] - cz, u = px * ux + pz * uz, w = -px * uz + pz * ux;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w;
      }
      const a = (u1 - u0) * (w1 - w0);
      if (a < bestA) { bestA = a; bux = ux; buz = uz; bu0 = u0; bu1 = u1; bv0 = w0; bv1 = w1; }
    }
    if (bestA === Infinity) { bestA = Math.max(1, (x1 - x0) * (z1 - z0)); bu0 = x0 - cx; bu1 = x1 - cx; bv0 = z0 - cz; bv1 = z1 - cz; }
    // local X = (bux, buz), local Z = (-buz, bux) => yaw with (cos, -sin) = (bux, buz)
    const mu = (bu0 + bu1) / 2, mw = (bv0 + bv1) / 2;
    P.ox[i] = cx + bux * mu - buz * mw; P.oz[i] = cz + buz * mu + bux * mw;
    P.ohx[i] = (bu1 - bu0) / 2; P.ohz[i] = (bv1 - bv0) / 2; P.oyaw[i] = Math.atan2(-buz, bux);
    P.fill[i] = area / Math.max(bestA, 1e-3);
    // street-facing walls: outward probe on the road raster (asphalt) 2.5 .. 17 m out
    const base = B.base[i];
    let gMax = -1e9, gMin = 1e9, anyF = false, mfx = 0, mfz = 0, mfl = 0;
    for (let k = 0; k < n; k++) {
      const kk = (k + 1) % n, ax = ring[k * 2], az = ring[k * 2 + 1], ex = ring[kk * 2] - ax, ez = ring[kk * 2 + 1] - az, l = Math.hypot(ex, ez);
      if (l < 1.5) continue;
      const nx = sgn * ez / l, nz = -sgn * ex / l, mx = ax + ex * 0.5, mz = az + ez * 0.5;
      let front = false, fd = 0;
      for (const d of PROBE) { const s = terrain.surfaceRaw(mx + nx * d, mz + nz * d); if (s === 1) { front = true; fd = d; break; } if (s === 0) break; }
      if (!front) continue;
      if (CRr && l >= 3) { const c = CRr.at(mx + nx * fd, mz + nz * fd); if (c && !P.corr[i]) P.corr[i] = c; }
      if (!P.swd[i] || fd * 10 < P.swd[i]) P.swd[i] = Math.min(255, fd * 10);
      P.edge[v0 + k] |= FRONT; anyF = true; fronts++;
      if (l > mfl) { mfl = l; mfx = nx; mfz = nz; }
      const ga = terrain.heightAt(ax + nx * 1.2, az + nz * 1.2), gb = terrain.heightAt(ax + ex + nx * 1.2, az + ez + nz * 1.2);
      P.eg[v0 + k] = Math.round(ga * 20); if (P.eg[v0 + kk] === -32768) P.eg[v0 + kk] = Math.round(gb * 20);
      gMax = Math.max(gMax, ga, gb); gMin = Math.min(gMin, ga, gb);
    }
    const kind = B.kind[i];
    let roofH = B.roofH[i];
    let roofShape = B.roof[i];
    const hAll = B.h[i];
    // lot pieces: style first (flat-roof height), then a roofline that fits it; rear additions copy their front lot
    let lotStyle = -1;
    if (i >= N0) {
      const tw = SP.twin[i];
      if (tw >= 0) { lotStyle = P.style[tw]; roofShape = 0; }
      else {
        const yT = base + hAll, yy0 = Math.min(anyF ? Math.min(gMax, gMin + 3.5) + 0.05 : base, yT - 2.5);
        lotStyle = chooseStyle(zone, yT - yy0, kind, area, r, rich);
        roofShape = lotRoof(lotStyle, zone, roofShape, hash(i, 5));
      }
    } else if (!NOV6 && roofShape === 0 && !(roofH > 0) && kind <= 2 && hAll < 14 && !(B.minH[i] > 0) && area < 400) {
      // (v6) separately traced houses (most of the Sunset / Richmond / Excelsior / Bayview) with no OSM roof shape: the
      // district's share of hipped / gabled roofs, so a block is not all flat parapet boxes from above
      const yT = base + hAll, yy0 = Math.min(anyF ? Math.min(gMax, gMin + 3.5) + 0.05 : base, yT - 2.5);
      roofShape = houseRoof(chooseStyle(zone, yT - yy0, kind, area, r, rich), zone, hash(i, 605));
    }
    // pitched roofs only on compact footprints (OBB fill) of modest size; flat otherwise
    let pitched = roofShape >= 1 && roofShape <= 5 && roofShape !== 4 && P.fill[i] > 0.72 && area < 2500 && hAll < 40 ? roofShape : 0;
    if (roofShape === 4 || roofShape === 6 || roofShape === 7) pitched = 8 + roofShape;   // domes (flag only)
    const short = Math.min(P.ohx[i], P.ohz[i]);
    if (pitched && pitched < 8) { const cap = Math.min(short * (pitched === 5 ? 0.35 : 0.75), 6, hAll * 0.35); roofH = roofH > 0 ? Math.min(roofH, cap) : Math.min(short * (pitched === 5 ? 0.35 : 0.6), 4.5, hAll * 0.35); }
    if (pitched >= 8) roofH = Math.min(roofH > 0 ? roofH : short * 0.7, short * 1.2, hAll * 0.5);
    const yTop = base + hAll, yEave = pitched ? yTop - roofH : yTop;
    P.pitched[i] = pitched; P.yTop[i] = yTop; P.yEave[i] = yEave;
    P.yb[i] = B.minH[i] > 0 ? base + B.minH[i] : Math.min(base, anyF ? gMin : base) - 1.2;
    let y0 = anyF ? Math.min(gMax, gMin + 3.5) + 0.05 : base + Math.min(B.slope[i], 3.5) * 0.5;
    if (B.minH[i] > 0) y0 = base + B.minH[i];
    y0 = Math.min(y0, yEave - 2.5);
    P.y0[i] = y0;
    // ------------------------------------------------------------ style + look
    P.zone[i] = zone; P.rnd[i] = r;
    const hA = yEave - y0;
    const style = lotStyle >= 0 ? lotStyle : chooseStyle(zone, hA, kind, area, r, rich);
    P.style[i] = style;
    writeParams(params, i, style, zone, hA, B, P, kind);
    if (i >= N0 && SP.twin[i] >= 0) copyLook(params, P, SP.twin[i], i);
    // (v6) back yard behind houses / small flats (MID v6yard.js: fences on the lot lines, decks, patios, sheds, beds)
    if (!NOV6 && (style === S.VICTORIAN || style === S.EDWARDIAN || style === S.STUCCO || (style === S.APARTMENT && area < 500)) && area < 700 && hA < 16 && kind <= 2 && !(P.flags[i] & 32)) {
      let dx = 0, dz = 0;
      const tw = i >= N0 ? SP.twin[i] : -1;
      if (tw >= 0) { dx = P.yd[tw * 2] / 127; dz = P.yd[tw * 2 + 1] / 127; P.yg[tw] = -1e4; }   // the rear addition carries the lot's yard
      else if (mfl > 0) { dx = -mfx; dz = -mfz; }
      if (dx || dz) {
        let dm = 0;
        for (let k = 0; k < n; k++) dm = Math.max(dm, (ring[k * 2] - cx) * dx + (ring[k * 2 + 1] - cz) * dz);
        P.yg[i] = terrain.heightAt(cx + dx * (dm + 3), cz + dz * (dm + 3));
        P.ys[i] = Math.max(-0.6, Math.min(0.6, (terrain.heightAt(cx + dx * (dm + 11), cz + dz * (dm + 11)) - P.yg[i]) / 8));
        P.yd[i * 2] = Math.round(dx * 127); P.yd[i * 2 + 1] = Math.round(dz * 127);
      }
    }
  }
  if (!NOV6) repaintNeighbours(P, params);
  P.fronts = fronts;
  P.nov5 = NOV5 ? 1 : 0;
  P.nov6 = NOV6 ? 1 : 0;
  P.v3 = typeof location !== 'undefined' && /[?&]nov3(&|$)/.test(location.search) ? 0 : 1;   // A/B switch for the v3 NEAR street facades
  P.pc = packCompact(P);
  P.ms = performance.now() - t0;
  const tex = new THREE.DataTexture(params, PW, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  P.paramsTex = tex;
  return P;
}
const PROBE = [2.5, 5, 8, 12, 17];

// roofline of a rowhouse lot (OSM rarely knows it): Italianate / Stick Victorians flat behind a cornice or false front,
// or a front-facing gable; Edwardians often hipped; Sunset / Richmond / Marina stucco mostly flat behind a parapet
function lotRoof(st, zone, parent, q) {
  if (parent >= 1 && parent <= 3) return q < 0.8 ? parent : 0;
  if (st === S.VICTORIAN) return q < 0.28 ? 1 : 0;
  if (st === S.EDWARDIAN) return q < 0.3 ? 2 : q < 0.4 ? 1 : 0;
  if (st === S.STUCCO) return q < 0.14 ? 2 : q < 0.22 ? 1 : 0;
  return 0;
}
// (v6) roofline of a separately traced house without an OSM roof shape (district shares, see planCity)
function houseRoof(st, zone, q) {
  if (st === S.VICTORIAN) return q < 0.12 ? 1 : 0;
  if (st === S.EDWARDIAN) return q < 0.24 ? 2 : q < 0.32 ? 1 : 0;
  if (st === S.STUCCO) {
    if (zone === Z.BAYVIEW || zone === Z.INDUSTRIAL) return q < 0.3 ? 2 : q < 0.44 ? 1 : 0;
    if (zone === Z.MARINA) return q < 0.14 ? 2 : 0;
    return q < 0.17 ? 2 : q < 0.27 ? 1 : 0;
  }
  return 0;
}
// (v6) no two neighbouring houses in the same paint: a house whose wall colour is within a few % of a neighbour's (centroids
// < 13 m apart, earlier index) is repainted from its style's palette (the pick farthest from every neighbour)
function repaintNeighbours(P, D) {
  const N = P.N, B = P.bx, CELL = 13, grid = new Map(), key = (x, z) => Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
  const pals = { [S.VICTORIAN]: [PAL.vicBody, PAL.whites], [S.EDWARDIAN]: [PAL.edwBody], [S.STUCCO]: [PAL.stucco, PAL.whites] };
  const twin = P.twinOf;
  const col = (i) => { const o = i * NP * 4 + 12; return [D[o], D[o + 1], D[o + 2]]; };
  const diff = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  let changed = 0;
  for (let i = 0; i < N; i++) {
    if (i < P.N0 && P.lotN[i]) continue;
    const st = P.style[i], k = key(P.cx[i], P.cz[i]);
    const pl = pals[st];
    if (pl && !B.color[i] && !(twin && twin[i] >= 0)) {
      const nb = [];
      for (let gz = -1; gz <= 1; gz++) for (let gx = -1; gx <= 1; gx++) {
        const a = grid.get(k + gx * 100003 + gz); if (!a) continue;
        for (const j of a) if (Math.hypot(P.cx[j] - P.cx[i], P.cz[j] - P.cz[i]) < CELL) nb.push(col(j));
      }
      const c0 = col(i);
      if (nb.some(c => diff(c, c0) < 0.04)) {
        let best = c0, bs = -1;
        for (let t = 0; t < 6; t++) {
          const arr = pl.length > 1 && hash(i, 710 + t) > 0.8 ? pl[1] : pl[0];
          const c = lift(pick(arr, hash(i, 700 + t)), st === S.VICTORIAN ? 0.1 : 0.26);
          let m = 9; for (const q of nb) m = Math.min(m, diff(q, c));
          if (m > bs) { bs = m; best = c; }
        }
        const o = i * NP * 4 + 12; D[o] = best[0]; D[o + 1] = best[1]; D[o + 2] = best[2]; changed++;
      }
    }
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
  }
  // rear additions follow their (maybe repainted) front lot
  if (twin) for (let i = P.N0; i < N; i++) if (twin[i] >= 0) { const a = twin[i] * NP * 4 + 12, b = i * NP * 4 + 12; D[b] = D[a]; D[b + 1] = D[a + 1]; D[b + 2] = D[a + 2]; }
  P.repainted = changed;
}
// rear addition: same paint / trim / wall material as its front lot
function copyLook(D, P, a, b) {
  const oa = a * NP * 4, ob = b * NP * 4;
  D[ob + 8] = D[oa + 8];
  for (const k of [3, 4, 5]) for (let c = 0; c < 3; c++) D[ob + k * 4 + c] = D[oa + k * 4 + c];
  D[ob + 9 * 4 + 2] = D[oa + 9 * 4 + 2]; D[ob + 9 * 4 + 3] = D[oa + 9 * 4 + 3];
  D[ob + 7 * 4 + 3] = D[oa + 7 * 4 + 3];
}

// per-building facade params (same texel layout as plan.js makeParamsTexture)
function writeParams(D, i, style, zone, hA, B, P, kind) {
  let s = 7;
  const r = () => hash(i, s++);
  let [groundH, floorH, parapet, margin, bay] = DIMS[style];
  groundH += (r() - 0.5) * 0.3;
  // commercial corridor: storefront ground floor (not glass towers / warehouses / Chinatown, which has its own dress)
  const store = P.corr[i] > 0 && zone !== Z.CHINATOWN && style !== S.TOWER_GLASS && style !== S.WAREHOUSE && (style < S.TOWER_GLASS || hash(i, 99) < 0.7);
  if (store) groundH = Math.max(groundH, 3.9 + hash(i, 98) * 0.5);
  // vertical grid: fill the real height exactly (levels when OSM knows them)
  const topH = hA;
  let cornice = Math.min(parapet, topH * 0.18);
  if (topH < groundH + 1.2) { groundH = Math.max(2.2, topH - cornice); }
  const avail = topH - cornice - groundH;
  let floors = B.levels[i] > 1 ? B.levels[i] - 1 : Math.max(0, Math.round(avail / floorH));
  if (floors > 0) {
    let fh = avail / floors;
    if (fh < 2.7 || fh > 5.2) { floors = Math.max(0, Math.round(avail / floorH)); fh = floors ? avail / floors : floorH; }
    if (floors > 0) floorH = Math.min(5.2, Math.max(2.7, fh));
    cornice = Math.max(0.3, topH - groundH - floors * floorH);
  }
  // looks
  let wallLayer = L.STUCCO, wallC, trimC, accC, glassC = lin(0x1b2228), glassMetal = 0.0;
  let winType = WT.DOUBLE, groundType = GT.RESID, itype = IT.RES, lit = 0.42, recess = 0.16, gCell = 0, hood = 1, age = 0.5;
  let winW = 0.95, winH = 2.1, sillH = 0.75, flags = 0;
  const cw = bay;
  switch (style) {
    case S.VICTORIAN:
      { const q = hash(i, 62); wallLayer = L.SIDING; wallC = pick(q < 0.18 ? PAL.whites : zone === Z.MISSION && q < 0.5 ? PAL.bold : PAL.vicBody, r()); } trimC = pick(PAL.vicTrim, r()); accC = pick(PAL.vicAcc, r());
      groundType = GT.HOUSE; winW = 0.95; winH = 2.2; sillH = 0.7; recess = 0.14; age = 0.25; gCell = r() < 0.5 ? 0 : 1; flags |= 1;
      break;
    case S.EDWARDIAN:
      wallLayer = r() < 0.45 ? L.SIDING : L.STUCCO; wallC = pick(zone === Z.MISSION && hash(i, 62) < 0.15 ? PAL.bold : PAL.edwBody, r()); trimC = pick(PAL.edwTrim, r()); accC = pick(PAL.vicAcc, r());
      groundType = GT.HOUSE; winW = 1.0; winH = 2.0; sillH = 0.75; recess = 0.14; age = 0.3; gCell = r() < 0.5 ? 0 : 1; flags |= 1;
      if (zone === Z.PRESIDIO) { wallLayer = L.SIDING; wallC = lin(0xf2efe6); trimC = lin(0xffffff); groundType = GT.RESID; }
      break;
    case S.STUCCO:
      wallLayer = L.STUCCO; wallC = pick((zone === Z.AVENUES || zone === Z.MARINA) && hash(i, 62) < 0.3 ? PAL.whites : PAL.stucco, r()); trimC = pick(PAL.stuccoTrim, r()); accC = pick(PAL.commAcc, r());
      winType = WT.PICTURE; groundType = GT.HOUSE; winW = 1.5; winH = 1.7; sillH = 0.85; recess = 0.12; age = 0.35; gCell = r() < 0.5 ? 0 : 1;
      if (r() < 0.5) flags |= 2;  // clay-tile eave
      if (!NOV6) {
        // (v6) Doelger / Marina box bays (oriels) over the garage; Mediterranean-revival arched windows (Marina, some Sunset)
        if (hash(i, 601) < (zone === Z.AVENUES ? 0.5 : zone === Z.MARINA ? 0.32 : zone === Z.BAYVIEW ? 0.25 : 0.35)) flags |= 1;
        if (hash(i, 602) < (zone === Z.MARINA ? 0.42 : zone === Z.AVENUES ? 0.15 : 0.1)) winType = WT.ARCH;
      }
      break;
    case S.COMMERCIAL: {
      const rr = r();
      wallLayer = RESZ.has(zone) ? (rr < 0.12 ? L.BRICK : rr < 0.3 ? L.BRICK_PAINT : rr < 0.75 ? L.STUCCO : L.SIDING) : rr < 0.3 ? L.BRICK : rr < 0.45 ? L.BRICK_PAINT : rr < 0.8 ? L.STUCCO : L.SIDING;
      wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.comm, r()); trimC = pick(PAL.edwTrim, r()); accC = pick(PAL.commAcc, r());
      winType = r() < 0.2 ? WT.ARCH : WT.DOUBLE; groundType = GT.STORE; itype = r() < 0.3 ? IT.OFFICE : IT.RES; winW = 1.1; winH = 1.9; sillH = 0.8; recess = 0.18; age = 0.6;
      break;
    }
    case S.APARTMENT: {
      const rr = r();
      wallLayer = RESZ.has(zone) ? (rr < 0.1 ? L.BRICK : rr < 0.16 ? L.BRICK_DARK : rr < 0.78 ? L.STUCCO : rr < 0.9 ? L.SIDING : L.BRICK_PAINT) : rr < 0.35 ? L.BRICK : rr < 0.55 ? L.BRICK_DARK : rr < 0.9 ? L.STUCCO : L.BRICK_PAINT;
      if (zone === Z.MARINA || zone === Z.AVENUES) wallLayer = L.STUCCO;
      wallC = (wallLayer === L.BRICK || wallLayer === L.BRICK_DARK) ? [1, 1, 1] : pick(wallLayer === L.SIDING ? PAL.edwBody : PAL.aptStucco, r()); trimC = pick(PAL.aptTrim, r()); accC = pick(PAL.commAcc, r());
      groundType = zone === Z.TENDERLOIN || zone === Z.CIVIC || r() < 0.3 ? GT.STORE : GT.LOBBY; winW = 1.0; winH = 1.8; sillH = 0.8; recess = 0.2; age = 0.7;
      if (wallLayer !== L.STUCCO && r() < 0.75) flags |= 4;         // fire escape
      if (r() < 0.5) flags |= 1;                                      // bay columns
      // (v5) Tenderloin / Nob Hill / Civic Center apartment blocks: stacked bays on most of them
      if (!NOV5 && (zone === Z.TENDERLOIN || zone === Z.NOBHILL || zone === Z.CIVIC) && hash(i, 542) < 0.6) flags |= 1;
      if (zone === Z.PRESIDIO) { wallLayer = L.BRICK; wallC = [1, 1, 1]; trimC = lin(0xf4f0e6); accC = lin(0x2a3a2a); groundType = GT.RESID; flags &= ~4; }
      break;
    }
    case S.CHINATOWN:
      { const rw = r(); wallLayer = rw < 0.5 ? L.BRICK_PAINT : rw < 0.68 ? L.STUCCO : L.BRICK; } wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.china, r()); trimC = pick(PAL.chinaTrim, r()); accC = pick(PAL.chinaTrim, r());
      groundType = GT.STORE; winW = 1.0; winH = 1.8; sillH = 0.8; recess = 0.18; age = 0.7; flags |= 8;   // balconies
      break;
    case S.LOFT:
      wallLayer = r() < 0.62 ? L.BRICK : r() < 0.88 ? L.BRICK_PAINT : L.CONCRETE; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.loftPaint, r()); trimC = pick(PAL.loftTrim, r()); accC = pick(PAL.commAcc, r());
      winType = r() < 0.55 ? WT.ARCH : WT.LOFT; groundType = r() < 0.45 ? GT.ROLLUP : GT.STORE; itype = IT.LOFT; winW = cw * 0.62; winH = floorH * 0.62; sillH = 0.9; recess = 0.32; age = 0.85; hood = 0;
      if (r() < 0.6) flags |= 4;
      break;
    case S.WAREHOUSE:
      wallLayer = r() < 0.45 ? L.CORRUGATED : r() < 0.8 ? L.CONCRETE : L.BRICK; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.ware, r()); trimC = pick(PAL.loftTrim, r()); accC = pick(PAL.ware, r());
      winType = WT.LOFT; groundType = GT.ROLLUP; itype = IT.LOFT; winW = cw * 0.6; winH = 1.6; sillH = Math.max(0.9, floorH - 2.2); recess = 0.12; age = 0.9; hood = 0; lit = 0.15;
      break;
    case S.TOWER_GLASS:
      wallLayer = L.METAL; wallC = pick(PAL.spandrel, r()); trimC = lin(0x3a3e44); accC = lin(0x2a2e33); glassC = pick(PAL.glass, r()); glassMetal = 0.35 + r() * 0.3;
      winType = WT.PLAIN; groundType = GT.LOBBY; itype = IT.OFFICE; lit = 0.5; recess = 0.05; winW = cw; winH = floorH - 1.0; sillH = 0.95; age = 0.2; hood = 0; flags |= 16;
      break;
    case S.TOWER_STONE:
      wallLayer = r() < 0.85 ? L.STONE : L.BRICK; wallC = wallLayer === L.BRICK ? [1, 1, 1] : pick(PAL.stone, r()); trimC = pick(PAL.stone, r()); accC = lin(0x2a2622);
      winType = WT.PLAIN; groundType = GT.LOBBY; itype = hA > 30 && zone !== Z.DOWNTOWN ? IT.RES : IT.OFFICE; lit = 0.45; recess = 0.28; winW = Math.min(1.5, cw * 0.55); winH = floorH * 0.58; sillH = 0.9; age = 0.6; hood = 0;
      break;
    default: // OFFICE (also garages, transit, canopies)
      wallLayer = r() < 0.5 ? L.CONCRETE : L.STONE; wallC = pick(wallLayer === L.CONCRETE ? PAL.concrete : PAL.stone, r()); trimC = lin(0x4a4a48); accC = lin(0x2a2e33); glassC = pick(PAL.glass, r()); glassMetal = 0.25;
      winType = WT.PLAIN; groundType = GT.LOBBY; itype = IT.OFFICE; lit = 0.45; recess = 0.22; winW = cw * 0.82; winH = floorH * 0.5; sillH = 1.0; age = 0.6; hood = 0;
      if (r() < 0.5) winW = cw;
      if (kind === 6) { wallLayer = L.CONCRETE; wallC = pick(PAL.concrete, r()); winW = cw * 0.9; winH = floorH * 0.45; sillH = 1.0; lit = 0.02; groundType = GT.BLANK; itype = IT.LOFT; }
      if (kind === 7) flags |= 32;        // canopy: no windows
      break;
  }
  // false fronts (Italianate / Western false front / Sunset parapet front): the street wall rises above the side parapets
  if (!(P.pitched[i] > 0) && hA < 16 && (style === S.VICTORIAN || style === S.EDWARDIAN || style === S.STUCCO || style === S.COMMERCIAL)
    && hash(i, 61) < (style === S.VICTORIAN || style === S.COMMERCIAL ? 0.35 : style === S.STUCCO ? 0.3 : 0.2)) flags |= 64;
  if (store && !(flags & 32)) { groundType = GT.STORE; if (style === S.TOWER_STONE || style === S.OFFICE) itype = IT.OFFICE; }
  // OSM building:colour
  const oc = B.color[i];
  if (oc) {
    wallC = hexLin(oc);
    if (wallLayer === L.BRICK || wallLayer === L.BRICK_DARK) wallLayer = L.BRICK_PAINT;
  }
  wallC = lift(wallC, style === S.VICTORIAN || style === S.CHINATOWN ? 0.1 : style === S.TOWER_GLASS ? 0.2 : 0.26);
  accC = lift(accC, 0.045); trimC = lift(trimC, 0.05);
  winW = Math.min(winW, cw - 0.3); winH = Math.max(0.6, Math.min(winH, floorH - sillH - 0.3));
  // roof material
  const rc = B.roofColor[i];
  const pitched = P.pitched[i] > 0 && P.pitched[i] < 8;
  let roofL = pitched ? L.ROOF_SHINGLE : L.GRAVEL, roofC = pitched ? pick(PAL.shingle, r()) : [0.46, 0.45, 0.44];
  if (!pitched) { const rv = hash(i, 97); roofC = rv < 0.3 ? [0.78, 0.78, 0.76] : rv < 0.5 ? [0.16, 0.155, 0.15] : rv < 0.72 ? [0.5, 0.49, 0.47] : rv < 0.84 ? [0.66, 0.68, 0.7] : [0.55, 0.5, 0.44]; }   // white membrane / tar / gravel / silver coat / tan
  if (pitched && (style === S.STUCCO || zone === Z.MARINA) && r() < 0.6) { roofL = L.CLAYTILE; roofC = [1, 1, 1]; }
  if (!pitched && hA > 30) { roofL = L.CONCRETE; roofC = [0.6, 0.6, 0.58]; }
  if (rc) roofC = hexLin(rc);
  P.roofL[i] = roofL; P.roofC[i * 3] = roofC[0]; P.roofC[i * 3 + 1] = roofC[1]; P.roofC[i * 3 + 2] = roofC[2];
  P.flags[i] = flags;
  // pack
  const o = i * NP * 4;
  const put = (k, a, b, c, d) => { const j = o + k * 4; D[j] = a; D[j + 1] = b; D[j + 2] = c; D[j + 3] = d; };
  const lox = Math.max(0.05, (cw - winW) / 2 / cw), hix = 1 - lox;
  put(0, floorH, groundH, topH, margin);
  put(1, lox, sillH / floorH, hix, (sillH + winH) / floorH);
  put(2, wallLayer, winType, groundType + 8 * gCell, r());
  put(3, wallC[0], wallC[1], wallC[2], lit);
  put(4, trimC[0], trimC[1], trimC[2], itype);
  put(5, accC[0], accC[1], accC[2], recess);
  put(6, P.y0[i], 0, 0, cornice);
  put(7, glassC[0], glassC[1], glassC[2], glassMetal);
  put(8, cw, 2, age, hood);
  // extra texel 9: bay target width, floors, wall layer (for near details), v2 code (material.js P9.w):
  // 1 = v2 marker | 2 * decor bits (1 mural on exposed side walls, 2 peeling paint, 4 rust streaks, 8 vivid paint)
  // | 32 * (MID kit window unit + 1) | 512 * (MID kit door unit + 1)  (v1 plan.js used P9.xy for the kit units)
  let decor = 0;
  const brickW = wallLayer === L.BRICK || wallLayer === L.BRICK_DARK || wallLayer === L.BRICK_PAINT;
  if (hA < 30 && style !== S.TOWER_GLASS && style !== S.TOWER_STONE && style !== S.OFFICE
    && hash(i, 131) < (zone === Z.MISSION ? (NOV6 ? 0.22 : 0.09) : zone === Z.SOMA || zone === Z.INDUSTRIAL ? (NOV6 ? 0.16 : 0.1) : 0)) decor |= 1;   // (v6) fewer: from above they read as glitches
  if ((style === S.VICTORIAN || (style === S.EDWARDIAN && wallLayer === L.SIDING)) && hash(i, 132) < (zone === Z.MISSION ? 0.4 : 0.26)) decor |= 2;
  if ((style === S.LOFT || style === S.WAREHOUSE || (flags & 4) || (brickW && style === S.APARTMENT)) && hash(i, 133) < 0.6) decor |= 4;
  if ((style === S.STUCCO && hash(i, 134) < (zone === Z.AVENUES || zone === Z.MARINA || zone === Z.BAYVIEW ? 0.5 : 0.3))
    || (style === S.VICTORIAN && hash(i, 134) < 0.35)) decor |= 8;
  const kWin0 = style === S.VICTORIAN ? 0 : style === S.EDWARDIAN ? 1 : style === S.LOFT || style === S.WAREHOUSE || winType === WT.LOFT ? 6
    : winType === WT.ARCH ? 2 : style === S.STUCCO ? 4 : brickW ? 3 : style === S.APARTMENT && wallLayer === L.STUCCO && hash(i, 301) < 0.45 ? 5 : 1;
  // (v5) window type varies per lot within a style (v3front.js winPiece makes the same pick)
  const wvar = winVar(style, i);
  const kWin = wvar === 'win_vic' ? 0 : wvar === 'win_edw' ? 1 : wvar === 'win_modern' ? 5 : kWin0;
  const kDoor = style === S.VICTORIAN ? 7 : 8;
  put(9, bay, floors, wallLayer, 1 + 2 * decor + 32 * (kWin + 1) + 512 * (kDoor + 1));
}
// (v5) per-lot window type within a style: some Edwardians carry Victorian sashes, some Victorians plainer Edwardian ones,
// a third of the stucco houses modern sliders. null = the style's own window. (shared with v3front.js winPiece)
export function winVar(style, i) {
  if (NOV5) return null;
  const q = hash(i, 541);
  if (style === S.EDWARDIAN) return q < 0.25 ? 'win_vic' : null;
  if (style === S.VICTORIAN) return q < 0.15 ? 'win_edw' : null;
  if (style === S.STUCCO) return q < 0.35 ? 'win_modern' : null;
  return null;
}
// compact per-building copy of the params the emitters read (P.pc, stride PC): lets the build workers skip the 34 MB texture
export const PC = 26;
const PMAP = new Int8Array(40).fill(-1);
[[0, 0], [0, 1], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 2], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2], [6, 3], [8, 3], [9, 0], [9, 1], [9, 2], [2, 1], [5, 3], [4, 3], [3, 3]]
  .forEach(([k, c], j) => { PMAP[k * 4 + c] = j; });
export function packCompact(P) {
  const N = P.N, pc = new Float32Array(N * PC), D = P.params;
  for (let i = 0; i < N; i++) { const o = i * NP * 4; for (let q = 0; q < 40; q++) if (PMAP[q] >= 0) pc[i * PC + PMAP[q]] = D[o + q]; }
  return pc;
}
export const prm = (P, i, k, c) => P.pc[i * PC + PMAP[k * 4 + c]];
// buildings of a tile range [f, f + c): OSM footprints, with split rows replaced by their lot pieces (v2lots.js)
export function eachIn(P, f, c, hidden, fn) {
  const LN = P.lotN, LF = P.lotF;
  for (let i = f; i < f + c; i++) {
    if (hidden && hidden.has(i)) continue;
    const n = LN ? LN[i] : 0;
    if (!n) fn(i); else for (let j = LF[i], e = j + n; j < e; j++) fn(j);
  }
}
