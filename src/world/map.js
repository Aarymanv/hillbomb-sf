// The San Francisco map: coastline, hills, the street grid, special roads, decks (bridges, ramps, piers), parks.
// Pure data + pure functions (no three.js). World frame: +X east, +Z south, +Y up, metres. See anchors.js.
import { GG_BRIDGE, BAY_BRIDGE, bridgePoint, LANDMARKS } from './anchors.js';

export const BOUNDS = { minX: -3600, maxX: 3900, minZ: -3400, maxZ: 2300 }; // heightfield extent
export const PLAY = { minX: -3280, maxX: 3780, minZ: -3180, maxZ: 2085 };   // invisible walls

// ------------------------------------------------------------------ land polygons
const circlePoly = (cx, cz, rx, rz, rot = 0, n = 28, wobble = 0, seed = 1) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(a * 3 + seed) * Math.cos(a * 2 - seed * 0.7);
    const lx = Math.cos(a) * rx * w, lz = Math.sin(a) * rz * w;
    out.push([cx + lx * Math.cos(rot) - lz * Math.sin(rot), cz + lx * Math.sin(rot) + lz * Math.cos(rot)]);
  }
  return out;
};

export const MAINLAND = [
  [-3070, 2600], [-3075, 1500], [-3080, 900], [-3085, 500], [-3112, 380], [-3172, 305], [-3178, 238], [-3122, 168],
  [-3050, 62], [-2900, -40], [-2750, -120], [-2600, -190], [-2450, -232], [-2300, -262], [-2150, -330], [-2000, -402],
  [-1880, -470], [-1800, -620], [-1762, -800], [-1722, -1000], [-1690, -1180], [-1668, -1330], [-1640, -1382],
  [-1560, -1392], [-1515, -1335], [-1470, -1255], [-1380, -1198], [-1200, -1180], [-900, -1188], [-600, -1194],
  [-380, -1205], [-200, -1228], [0, -1232], [200, -1236], [380, -1242], [430, -1292], [560, -1302], [650, -1272],
  [730, -1252], [900, -1280], [1100, -1305], [1300, -1322], [1450, -1296], [1588, -1214], [1692, -1087], [1813, -925],
  [1932, -782], [2020, -688], [2072, -660], [2112, -606], [2142, -545], [2176, -430], [2204, -300], [2222, -160],
  [2230, -50], [2242, 110], [2264, 320], [2310, 550], [2372, 790], [2432, 1090], [2484, 1390], [2524, 1690],
  [2548, 2050], [2560, 2600],
];

export const MARIN = [
  [-3700, -2360], [-3000, -2330], [-2600, -2292], [-2300, -2242], [-2000, -2204], [-1800, -2190], [-1735, -2172],
  [-1640, -2190], [-1500, -2262], [-1300, -2332], [-1100, -2420], [-900, -2560], [-700, -2760], [-520, -3000],
  [-380, -3600], [-3700, -3600],
];
export const ALCATRAZ = circlePoly(750, -2315, 128, 52, 0.35, 26, 0.08, 2);
export const YBI = circlePoly(3420, -1440, 340, 300, -0.4, 30, 0.07, 5);
export const TI = [ // Treasure Island + causeway to YBI
  [2760, -2400], [3340, -2420], [3360, -1900], [3300, -1860], [3290, -1790], [3240, -1760], [3190, -1800],
  [3200, -1870], [2760, -1880],
];
export const LAND = [MAINLAND, MARIN, ALCATRAZ, YBI, TI];

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToPolyEdges(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + ex * t), dz = z - (az + ez * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// exact signed distance to the coast (+ inland). Slow: use the cached grid (coastSDF) for bulk queries.
export function coastSDFExact(x, z) {
  let best = Infinity, inside = false;
  for (const p of LAND) {
    const d = distToPolyEdges(x, z, p);
    if (pointInPoly(x, z, p)) inside = true;
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

// cached coarse SDF grid (8 m), bilinear
const SDF_RES = 8;
const SDF_W = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / SDF_RES) + 1;
const SDF_H = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / SDF_RES) + 1;
let sdfGrid = null;
export function buildCoastSDF() {
  if (sdfGrid) return sdfGrid;
  sdfGrid = new Float32Array(SDF_W * SDF_H);
  // speed: evaluate exactly on a 32 m grid, and only refine near the coast
  const C = 4, CW = Math.ceil(SDF_W / C) + 1, CH = Math.ceil(SDF_H / C) + 1;
  const coarse = new Float32Array(CW * CH);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++)
    coarse[j * CW + i] = coastSDFExact(BOUNDS.minX + i * C * SDF_RES, BOUNDS.minZ + j * C * SDF_RES);
  for (let j = 0; j < SDF_H; j++) {
    for (let i = 0; i < SDF_W; i++) {
      const ci = i / C, cj = j / C, i0 = Math.min(CW - 2, Math.floor(ci)), j0 = Math.min(CH - 2, Math.floor(cj));
      const fx = ci - i0, fz = cj - j0;
      const a = coarse[j0 * CW + i0], b = coarse[j0 * CW + i0 + 1], c = coarse[(j0 + 1) * CW + i0], d = coarse[(j0 + 1) * CW + i0 + 1];
      const v = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
      sdfGrid[j * SDF_W + i] = Math.abs(v) < 70 ? coastSDFExact(BOUNDS.minX + i * SDF_RES, BOUNDS.minZ + j * SDF_RES) : v;
    }
  }
  return sdfGrid;
}
export function coastSDF(x, z) {
  const fx = (x - BOUNDS.minX) / SDF_RES, fz = (z - BOUNDS.minZ) / SDF_RES;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= SDF_W - 1 || j >= SDF_H - 1) return -500;
  const tx = fx - i, tz = fz - j, k = j * SDF_W + i;
  const g = sdfGrid;
  return (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - tz) + (g[k + SDF_W] * (1 - tx) + g[k + SDF_W + 1] * tx) * tz;
}

// coast character: W = transition width (small = cliff / seawall), shoreH = land height at the waterline, slope under water
export function coastType(x, z) {
  if (z < -2100) return { W: 26, shoreH: 0.8, sea: 0.35 };                                  // Marin: cliffs
  if (Math.hypot(x - 750, z + 2315) < 260) return { W: 7, shoreH: 0.8, sea: 0.5 };          // Alcatraz
  if (x > 2700 && z < -1000) {
    if (z < -1850) return { W: 4, shoreH: 2.6, sea: 0.4 };                                   // Treasure Island seawall
    return { W: 16, shoreH: 1.0, sea: 0.35 };                                                // YBI
  }
  if (x < -2960 && z > 330) return { W: 115, shoreH: 0.5, sea: 0.018 };                     // Ocean Beach
  if (x < -1580 && z > -1450 && z < 330) return { W: 13, shoreH: 0.6, sea: 0.4 };           // Lands End / Sea Cliff / Presidio bluffs
  if (x < 680 && z < -1000) return { W: 45, shoreH: 0.9, sea: 0.05 };                       // Crissy Field / Marina Green
  return { W: 5, shoreH: 2.4, sea: 0.4 };                                                    // seawall: Wharf, Embarcadero, Mission Bay
}

// ------------------------------------------------------------------ hills
// [x, z, height, radiusX, radiusZ, rot?]; gaussian bump, ~10% of its height at the radius
export const HILLS = [
  // Twin Peaks / Mt Sutro massif
  [-420, 1640, 84, 560, 560], [-452, 1522, 36, 118, 118], [-392, 1700, 34, 118, 118], [-640, 1392, 56, 230, 200], [-600, 1520, 24, 160, 160],
  // ridges south of the massif (map edge)
  [-250, 1990, 58, 300, 250], [-640, 2010, 70, 350, 260],
  // Buena Vista, Corona Heights, Tank Hill
  [-110, 772, 58, 170, 160], [40, 1010, 42, 120, 110], [-250, 1100, 44, 180, 160],
  // Castro / Noe rising toward Twin Peaks, Mission Dolores slope
  [100, 1450, 30, 300, 350], [500, 1480, 16, 250, 250],
  // Bernal (SE edge), Potrero Hill
  [1150, 2170, 48, 260, 220], [1760, 1450, 48, 280, 230],
  // Nob Hill, Russian Hill, Telegraph Hill
  [1180, -380, 60, 250, 230], [1000, -905, 55, 180, 205], [1530, -962, 48, 112, 112],
  // Pacific Heights ridge, Presidio Heights
  [200, -420, 52, 560, 220], [-300, -330, 40, 300, 250],
  // Cathedral Hill, Alamo Square, Lone Mountain, Rincon Hill
  [650, 60, 18, 300, 260], [120, 392, 30, 160, 140], [-520, 280, 42, 150, 130], [2110, -30, 16, 120, 120],
  // Richmond plateau, Sunset slope
  [-1500, 100, 30, 1100, 500], [-1300, 1700, 48, 1000, 700],
  // Presidio hills + Fort Point bluff (toll plaza ~31 m)
  [-900, -700, 42, 450, 350], [-1450, -700, 45, 350, 400], [-1560, -1210, 30, 190, 170],
  // Lands End / Lincoln Park / Sutro Heights
  [-2350, -60, 48, 420, 220], [-2950, 232, 34, 150, 150],
  // Marin Headlands
  [-2300, -2560, 125, 420, 300], [-1650, -2760, 115, 380, 400], [-2900, -2560, 110, 500, 400], [-1000, -2820, 80, 420, 350], [-1900, -2400, 40, 250, 180],
  // Alcatraz, Yerba Buena Island
  [750, -2315, 24, 110, 45, 0.35], [3420, -1440, 58, 240, 220],
];
const HILL_K = 2.3;
const hillBoxes = HILLS.map(([x, z, h, rx, rz]) => { const r = Math.max(rx, rz) * 1.6; return [x - r, x + r, z - r, z + r]; });

// value noise
function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function fbm(x, z, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * (vnoise(x * f, z * f) * 2 - 1); a *= 0.5; f *= 2.03; }
  return s;
}

// roughness of the natural terrain (noise amplitude), metres
function roughness(x, z) {
  if (z < -2100) return 9;                                      // Marin
  if (x > 2700) return 4;                                       // YBI
  if (inPresidio(x, z) || inLandsEnd(x, z)) return 5;
  if (inTwinPeaks(x, z)) return 7;
  if (inGGPark(x, z)) return 3.5;
  return 1.2;
}

// natural terrain height (before the street grid and road carving)
export function H0(x, z) {
  let land = 1.5;
  for (let k = 0; k < HILLS.length; k++) {
    const b = hillBoxes[k];
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const [hx, hz, h, rx, rz, rot] = HILLS[k];
    let dx = x - hx, dz = z - hz;
    if (rot) { const c = Math.cos(rot), s = Math.sin(rot); const lx = dx * c + dz * s, lz = -dx * s + dz * c; dx = lx; dz = lz; }
    const d2 = (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz);
    land += h * Math.exp(-HILL_K * d2);
  }
  land += roughness(x, z) * fbm(x * 0.006, z * 0.006, 3);
  const sd = coastSDF(x, z);
  const ct = coastType(x, z);
  if (sd >= 0) {
    const t = Math.min(1, sd / ct.W), s = t * t * (3 - 2 * t);
    return ct.shoreH + (Math.max(land, ct.shoreH) - ct.shoreH) * s;
  }
  return Math.max(-32, ct.shoreH + sd * ct.sea - 0.6);
}

// ------------------------------------------------------------------ exclusion zones (no street grid inside)
export const PRESIDIO = [[-250, -1450], [-250, -540], [-650, -540], [-650, -220], [-1880, -220], [-1880, -1450]];
export const LANDS_END = [[-1880, -1100], [-1880, -220], [-2150, -220], [-2150, 100], [-3400, 100], [-3400, -1100]];
export const GG_PARK = [[-3000, 580], [-550, 580], [-550, 1140], [-3000, 1140]];
export const TWIN_PEAKS = [[-40, 1500], [-120, 1420], [-300, 1330], [-500, 1180], [-720, 1180], [-850, 1300], [-850, 1500],
  [-700, 1700], [-660, 2100], [-60, 2100], [30, 1860]];
export function inPresidio(x, z) { return x < -250 && x > -1880 && z < -220 && pointInPoly(x, z, PRESIDIO); }
export function inLandsEnd(x, z) { return x < -1880 && z < 100 && pointInPoly(x, z, LANDS_END); }
export function inGGPark(x, z) { return x > -3000 && x < -550 && z > 580 && z < 1140; }
export function inTwinPeaks(x, z) { return x > -860 && x < 40 && z > 1170 && pointInPoly(x, z, TWIN_PEAKS); }
export function inExclusion(x, z) { return inPresidio(x, z) || inLandsEnd(x, z) || inGGPark(x, z) || inTwinPeaks(x, z); }

// ------------------------------------------------------------------ street grid
// N-S lines (x), east -> west: [x, name, width]
export const XL = [
  [2150, 'Steuart St', 12], [2050, 'Spear St', 12], [1950, 'Beale St', 12], [1850, 'Front St', 12], [1750, 'Battery St', 12],
  [1650, 'Montgomery St', 14], [1550, 'Kearny St', 12], [1450, 'Stockton St', 12], [1350, 'Powell St', 12], [1250, 'Taylor St', 12],
  [1150, 'Jones St', 12], [1050, 'Hyde St', 12], [950, 'Larkin St', 12], [850, 'Polk St', 12], [750, 'Van Ness Ave', 20],
  [650, 'Franklin St', 14], [550, 'Octavia St', 12], [450, 'Laguna St', 12], [350, 'Webster St', 12], [250, 'Fillmore St', 14],
  [150, 'Steiner St', 12], [50, 'Scott St', 12], [-50, 'Divisadero St', 16], [-150, 'Baker St', 12], [-250, 'Lyon St', 12],
  [-350, 'Masonic Ave', 14], [-450, 'Parker Ave', 12], [-550, 'Stanyan St', 14], [-650, 'Arguello Blvd', 14], [-750, '4th Ave', 12],
  [-850, '6th Ave', 12], [-950, '8th Ave', 12], [-1050, '10th Ave', 12], [-1150, '12th Ave', 12], [-1250, 'Park Presidio Blvd', 18],
  [-1350, '16th Ave', 12], [-1450, '19th Ave', 18], [-1550, '21st Ave', 12], [-1650, '23rd Ave', 12], [-1750, '25th Ave', 14],
  [-1850, '27th Ave', 12], [-1950, '30th Ave', 12], [-2050, '32nd Ave', 12], [-2150, '34th Ave', 12], [-2250, '36th Ave', 12],
  [-2350, 'Sunset Blvd', 18], [-2450, '39th Ave', 12], [-2550, '41st Ave', 12], [-2650, '43rd Ave', 12], [-2750, '45th Ave', 12],
  [-2850, '46th Ave', 12], [-2950, '48th Ave', 12],
];
// E-W lines (z), north -> south
export const ZL = [
  [-1180, 'Beach St', 12], [-1100, 'Bay St', 12], [-1020, 'Chestnut St', 12], [-940, 'Lombard St', 18], [-860, 'Filbert St', 12],
  [-780, 'Union St', 12], [-700, 'Green St', 12], [-620, 'Broadway', 16], [-540, 'Jackson St', 12], [-460, 'Washington St', 12],
  [-380, 'Sacramento St', 12], [-300, 'California St', 14], [-220, 'Pine St', 12], [-140, 'Sutter St', 12], [-60, 'Post St', 12],
  [20, 'Geary Blvd', 18], [100, 'Ellis St', 12], [180, 'Turk St', 12], [260, 'McAllister St', 12], [340, 'Fulton St', 12],
  [420, 'Hayes St', 12], [500, 'Fell St', 16], [580, 'Oak St', 14], [660, 'Haight St', 12], [740, 'Waller St', 12],
  [820, 'Duboce Ave', 12], [900, '14th St', 12], [980, '15th St', 12], [1060, '16th St', 14], [1140, '17th St', 12],
  [1220, '18th St', 12], [1300, '19th St', 12], [1380, '20th St', 12], [1460, '21st St', 12], [1540, '22nd St', 12],
  [1620, '23rd St', 12], [1700, '24th St', 14], [1780, '25th St', 12], [1860, '26th St', 12], [1940, 'Army St', 12],
  [2020, 'Cesar Chavez St', 18],
];
export const MARKET_C = 1476; // Market St: x + z = MARKET_C
export const southOfMarket = (x, z) => x + z > MARKET_C;
const RICHMOND_Z = { '-220': 'Lake St', '-140': 'California St', '-60': 'Clement St', '20': 'Geary Blvd', '100': 'Anza St', '180': 'Balboa St', '260': 'Cabrillo St', '340': 'Hugo St', '420': 'Kezar Way', '500': 'Lincoln Ave', '580': 'Fulton St' };
const SUNSET_Z = { '1140': 'Lincoln Way', '1220': 'Irving St', '1300': 'Judah St', '1380': 'Kirkham St', '1460': 'Lawton St', '1540': 'Moraga St', '1620': 'Noriega St', '1700': 'Ortega St', '1780': 'Pacheco St', '1860': 'Quintara St', '1940': 'Rivera St', '2020': 'Santiago St' };
const SOMA_Z = { '-460': 'Market St', '-380': 'Mission St', '-300': 'Howard St', '-220': 'Folsom St', '-140': 'Harrison St', '-60': 'Bryant St', '20': 'Brannan St', '100': 'Townsend St', '180': 'King St', '260': 'Berry St', '340': 'Channel St', '420': 'Mission Bay Blvd', '500': 'Mariposa St', '580': '18th St', '660': '19th St', '740': '20th St', '820': '22nd St' };
const SOMA_X = { '2150': 'The Embarcadero', '2050': 'Spear St', '1950': '1st St', '1850': '2nd St', '1750': '3rd St', '1650': '4th St', '1550': '5th St', '1450': '6th St', '1350': '7th St', '1250': '8th St', '1150': '9th St', '1050': '10th St', '950': '11th St', '850': '12th St' };
const MISSION_X = { '150': 'Noe St', '50': 'Castro St', '-50': 'Diamond St', '250': 'Sanchez St', '350': 'Church St', '450': 'Dolores St', '550': 'Guerrero St', '650': 'Valencia St', '750': 'Mission St', '850': 'S Van Ness Ave', '950': 'Folsom St', '1050': 'Harrison St', '1150': 'Bryant St', '1250': 'Potrero Ave', '1350': 'Vermont St', '1450': 'Kansas St', '1550': 'Rhode Island St', '1650': 'De Haro St', '1750': 'Carolina St', '1850': 'Wisconsin St', '1950': 'Arkansas St', '2050': 'Connecticut St', '2150': '3rd St' };
export function gridStreetName(axis, idx, x, z) {
  if (axis === 'x') {
    const [lx, name] = XL[idx];
    if (southOfMarket(x, z) && z < 880 && x > 800) return SOMA_X[lx] || name;
    if (z > 880 && x > -120) return MISSION_X[lx] || name;
    return name;
  }
  const [lz, name] = ZL[idx];
  if (x < -600 && RICHMOND_Z[lz]) return RICHMOND_Z[lz];
  if (x < -600 && SUNSET_Z[lz]) return SUNSET_Z[lz];
  if (southOfMarket(x, z) && x > 800 && SOMA_Z[lz]) return SOMA_Z[lz];
  return name;
}

// park blocks inside the grid (x0, z0, x1, z1 = cell corners on line coordinates)
export const PARK_BLOCKS = [
  [-550, 500, -150, 580, 'The Panhandle'],
  [-150, 660, -50, 820, 'Buena Vista Park'],
  [50, 340, 150, 420, 'Alamo Square'],
  [1350, -140, 1450, -60, 'Union Square'],
  [1450, -860, 1550, -780, 'Washington Square'],
  [1450, -1020, 1650, -940, 'Pioneer Park'],
  [450, 1380, 650, 1540, 'Dolores Park'],
  [450, -460, 550, -380, 'Lafayette Park'],
  [50, -380, 150, -300, 'Alta Plaza'],
  [850, 260, 950, 340, 'Civic Center Plaza'],
  [-250, -1180, 450, -1100, 'Marina Green'],
  [950, -1180, 1150, -1100, 'Aquatic Park'],
  [-50, 980, 50, 1060, 'Corona Heights'],
  [1150, -460, 1250, -380, 'Huntington Park'],
];
// blocks fully occupied by a landmark (buildings skipped)
export const LANDMARK_BLOCKS = [
  [1650, -540, 1750, -460], // Transamerica
  [1850, -300, 1950, -220], // Salesforce
  [750, 260, 850, 340],     // City Hall
  [150, 340, 250, 420],     // Painted Ladies block (only its west edge is the landmark; generator treats specially)
  [1150, -380, 1250, -300], // Grace Cathedral
];

// ------------------------------------------------------------------ special roads (polylines, width, profile)
// pts: [x, z] or [x, z, y]; y = explicit height anchor. smooth: catmull-rom sample spacing (0 = straight segments).
function catmull(pts, spacing) {
  if (!spacing || pts.length < 3) return pts.map(p => p.slice());
  const out = [];
  const P = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const q = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
      if (p1.length > 2 && p2.length > 2) q.push(p1[2] + (p2[2] - p1[2]) * t);
      else if (k === 0 && p1.length > 2) q.push(p1[2]);
      out.push(q);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// Lombard St crooked block: Hyde (1050) -> Jones (1150), eastbound downhill, 8 hairpins
function lombardCrooked() {
  const z0 = -940, pts = [[1056.5, z0]];
  const turns = 8, x0 = 1064, x1 = 1137, amp = 8;
  for (let i = 0; i <= turns; i++) {
    const x = x0 + ((x1 - x0) * i) / turns;
    pts.push([x, z0 + (i % 2 === 0 ? -amp : amp) * (i === 0 || i === turns ? 0.3 : 1)]);
  }
  pts.push([1143.5, z0]);
  return pts;
}

const EMBARCADERO = [[730, -1205], [900, -1235], [1100, -1262], [1300, -1280], [1440, -1255], [1560, -1180], [1660, -1060],
  [1780, -900], [1900, -755], [1985, -640], [2040, -564], [2095, -490], [2140, -380], [2170, -220], [2185, -60], [2200, 120],
  [2225, 330], [2270, 560], [2330, 800], [2390, 1100], [2440, 1400], [2480, 1700], [2500, 2060]];

const gg = (s, l = 0) => bridgePoint(GG_BRIDGE, s, l);

export const SPECIAL_ROADS = [
  { name: 'Market St', width: 22, pts: [[2040, -564], [226, 1250]], smooth: 0, kind: 'boulevard', trees: 'plane', cuts: true },
  { name: 'Market St', width: 16, pts: [[226, 1250], [150, 1330], [60, 1420], [-40, 1492], [-150, 1560]], smooth: 8, kind: 'road' },
  { name: 'Portola Dr', width: 16, pts: [[-150, 1560], [-110, 1700], [-70, 1850], [-50, 2000], [-45, 2090]], smooth: 8, kind: 'road' },
  { name: 'Twin Peaks Blvd', width: 10, smooth: 6, kind: 'mountain', pts: [[-150, 1560], [-240, 1500], [-330, 1440], [-420, 1418],
    [-505, 1450], [-535, 1530], [-505, 1600], [-440, 1612], [-362, 1622], [-330, 1700], [-352, 1782], [-422, 1812], [-482, 1770],
    [-505, 1690], [-470, 1630], [-440, 1612]] },
  { name: 'Clarendon Ave', width: 11, smooth: 7, kind: 'mountain', pts: [[-535, 1530], [-620, 1470], [-700, 1430], [-780, 1400], [-850, 1380]] },
  { name: 'The Embarcadero', width: 22, pts: EMBARCADERO, smooth: 8, kind: 'boulevard', trees: 'palm', cuts: true },
  { name: 'Columbus Ave', width: 14, pts: [[1700, -460], [1180, -1140]], smooth: 0, kind: 'road', cuts: true },
  { name: 'Great Highway', width: 18, smooth: 8, kind: 'highway', pts: [[-3035, 2090], [-3035, 1400], [-3036, 700], [-3040, 460],
    [-3055, 360], [-3060, 280], [-3040, 200], [-2990, 180], [-2950, 180]] },
  { name: 'El Camino del Mar', width: 11, smooth: 7, kind: 'scenic', pts: [[-1850, -400], [-1950, -332], [-2100, -282], [-2250, -232],
    [-2400, -172], [-2550, -102], [-2700, -42], [-2830, 40], [-2900, 120], [-2950, 180]] },
  { name: 'Lincoln Blvd', width: 11, smooth: 7, kind: 'scenic', pts: [[-1508, -1150], [-1600, -1100], [-1660, -950], [-1700, -780],
    [-1720, -620], [-1760, -480], [-1850, -400]] },
  { name: 'Presidio Pkwy', width: 20, smooth: 8, kind: 'highway', pts: [[-250, -940], [-400, -940], [-600, -946], [-800, -990],
    [-1000, -1050], [-1200, -1110], [-1380, -1158], [-1480, -1186], [...gg(-40), 33.2], [...gg(0), 33.6]] },
  { name: 'Park Presidio Blvd', width: 18, smooth: 8, kind: 'highway', pts: [[-1250, -220], [-1262, -400], [-1300, -600],
    [-1380, -800], [-1440, -960], [-1480, -1070], [-1490, -1150], [-1480, -1186]] },
  { name: 'Arguello Blvd', width: 12, smooth: 7, kind: 'scenic', pts: [[-650, -540], [-660, -700], [-700, -820], [-800, -900], [-900, -960], [-1000, -1050]] },
  { name: 'JFK Dr', width: 12, smooth: 7, kind: 'park', pts: [[-550, 700], [-800, 718], [-1050, 762], [-1250, 802], [-1500, 782],
    [-1800, 758], [-2100, 800], [-2400, 830], [-2700, 818], [-2950, 848], [-3036, 860]] },
  { name: 'MLK Jr Dr', width: 11, smooth: 7, kind: 'park', pts: [[-550, 1060], [-800, 1062], [-1100, 1042], [-1450, 1020],
    [-1800, 1045], [-2150, 1030], [-2500, 1052], [-2800, 1040], [-3036, 1050]] },
  { name: 'Crossover Dr', width: 14, smooth: 7, kind: 'road', pts: [[-1250, 580], [-1262, 700], [-1290, 820], [-1370, 960], [-1440, 1080], [-1450, 1140]] },
  { name: 'Lombard St', width: 7, smooth: 2.2, kind: 'crooked', pts: lombardCrooked() },
  // Marin
  { name: 'US-101', width: 20, smooth: 8, kind: 'highway', pts: [[...gg(1260), 33.6], [...gg(1300), 33.8], [-1765, -2600], [-1760, -2780], [-1728, -2960], [-1700, -3150]] },
  { name: 'Conzelman Rd', width: 10, smooth: 6, kind: 'mountain', pts: [[-1748, -2520], [-1860, -2502], [-1980, -2448], [-2090, -2402],
    [-2180, -2420], [-2200, -2480], [-2150, -2540], [-2080, -2590], [-2150, -2640], [-2260, -2620], [-2340, -2580], [-2420, -2520], [-2520, -2470]] },
  { name: 'Alexander Ave', width: 10, smooth: 6, kind: 'scenic', pts: [[-1756, -2560], [-1640, -2500], [-1520, -2440], [-1400, -2390], [-1300, -2370], [-1180, -2440], [-1060, -2520]] },
  // Yerba Buena / Treasure Island
  { name: 'Yerba Buena Rd', width: 18, smooth: 8, kind: 'highway', pts: [[3179, -1187, 39], [3222, -1238, 38.8], [3262, -1310, 37],
    [3270, -1420, 32], [3250, -1540, 25], [3228, -1660, 16], [3222, -1760, 7], [3215, -1850, 3.4], [3180, -1930, 3.2], [3100, -1960, 3.2]] },
  { name: 'Avenue of the Palms', width: 16, smooth: 6, kind: 'boulevard', trees: 'palm', pts: [[3100, -1960], [2980, -1960], [2860, -1990],
    [2810, -2080], [2810, -2300], [2860, -2370], [3000, -2380], [3250, -2380], [3310, -2320], [3310, -2050], [3280, -1980], [3180, -1930]] },
  { name: 'California Ave', width: 12, smooth: 0, kind: 'road', pts: [[2810, -2160], [3310, -2160]] },
];
// finalise: resample curves
for (const r of SPECIAL_ROADS) r.path = catmull(r.pts, r.smooth);

// ------------------------------------------------------------------ decks (elevated drivable surfaces)
// pts: [x, z, y]; width = drivable width; rails: guard rails on both edges; kind for visuals
function ggDeck() {
  const pts = [];
  for (let s = 0; s <= GG_BRIDGE.length + 0.1; s += 20) { const [x, z] = gg(s); pts.push([x, z, GG_BRIDGE.deckY(s)]); }
  const [ex, ez] = gg(GG_BRIDGE.length);
  if (Math.hypot(pts[pts.length - 1][0] - ex, pts[pts.length - 1][1] - ez) > 0.5) pts.push([ex, ez, GG_BRIDGE.deckY(GG_BRIDGE.length)]);
  return pts;
}
function bayDeck() {
  const pts = [];
  // approach viaduct from SoMa (King St at Battery) climbing to the bridge
  const appr = [[1750, 180, null], [1820, 180, 6.5], [1900, 180, 13], [1980, 175, 20], [2050, 150, 26.5], [2110, 102, 31],
    [2160, 36, 34.5], [2205, -30, 36.5]];
  for (const p of appr) pts.push(p);
  for (let s = 0; s <= BAY_BRIDGE.length + 0.1; s += 20) { const [x, z] = bridgePoint(BAY_BRIDGE, s); pts.push([x, z, BAY_BRIDGE.deckY(s)]); }
  const [ex, ez] = bridgePoint(BAY_BRIDGE, BAY_BRIDGE.length);
  if (Math.hypot(pts[pts.length - 1][0] - ex, pts[pts.length - 1][1] - ez) > 0.5) pts.push([ex, ez, BAY_BRIDGE.deckY(BAY_BRIDGE.length)]);
  return pts;
}
function pier(x, z, dirx, dirz, len, width, name) {
  const n = Math.hypot(dirx, dirz); dirx /= n; dirz /= n;
  const back = 30; // start inland under the promenade so the join is seamless
  return { name, width, rails: false, kind: 'pier', y: 3.0,
    pts: [[x - dirx * back, z - dirz * back, 3.0], [x + dirx * len, z + dirz * len, 3.0]] };
}
export const DECKS = [
  { name: 'Golden Gate Bridge', width: GG_BRIDGE.roadWidth, rails: true, kind: 'goldengate', pts: ggDeck(), sidewalk: 3 },
  { name: 'Bay Bridge', width: BAY_BRIDGE.roadWidth, rails: true, kind: 'baybridge', pts: bayDeck(), sidewalk: 0 },
  pier(1330, -1300, 0.05, -1, 190, 44, 'Pier 39'),
  pier(1570, -1200, 0.62, -0.78, 170, 34, 'Pier 33'),
  pier(1670, -1075, 0.76, -0.65, 180, 34, 'Pier 29'),
  pier(1790, -915, 0.78, -0.63, 200, 38, 'Pier 23'),
  pier(1910, -770, 0.8, -0.6, 190, 34, 'Pier 15'),
  pier(1995, -672, 0.8, -0.6, 150, 30, 'Pier 7'),
  pier(2170, -470, 0.97, -0.25, 160, 36, 'Pier 14'),
  pier(2205, -250, 1, -0.05, 170, 34, 'Pier 22'),
  pier(2230, 240, 1, 0.08, 170, 40, 'Pier 30'),
  pier(2300, 700, 0.97, -0.2, 190, 40, 'Pier 48'),
  pier(2400, 1150, 0.98, -0.18, 180, 44, 'Pier 70'),
];

// grid street segments replaced by decks / special cases: [axis, lineIndex, from, to] on the other axis
export const REMOVED_STREETS = [
  ['z', ZL.findIndex(l => l[0] === 180), 1750, 2160], // King St under the Bay Bridge approach
  ['z', ZL.findIndex(l => l[0] === -940), 1050, 1150], // Lombard St crooked block (replaced by the crooked road)
];

// ------------------------------------------------------------------ building style zones
export function zoneAt(x, z) {
  const som = southOfMarket(x, z);
  if (x > 1580 && z > -760 && z < 150 && !(som && z > 60)) return 'downtown';
  if (x > 1300 && z > -700 && z < 300 && !som) return x > 1500 || z > -300 ? 'downtown' : 'chinatown';
  if (som && x > 900 && z < 900) return (x + z > 2000 || z < 200) && x > 1600 ? 'downtown_soma' : 'soma';
  if (x > 1250 && z > -1150 && z < -700) return 'northbeach';
  if (z < -1060 && x > 700) return 'wharf';
  if (x > 1000 && z > -250 && z < 300) return 'tenderloin';
  if (x > 1300 && z > 900) return 'industrial';
  if (x > 900 && z > 900) return 'mission';
  if (z < -900 && x > -260 && x < 700) return 'marina';
  if (x > 600 && z < 300 && z > -1000) return 'nobhill';
  if (x < -600) return 'avenues';
  if (z > 900) return 'castro';
  return 'victorian';
}

export function districtAt(DISTRICTS, x, z) {
  let best = null, bd = Infinity;
  for (const d of DISTRICTS) {
    if (d.rect) { const [x0, z0, x1, z1] = d.rect; if (x > x0 && x < x1 && z > z0 && z < z1) return d.name; continue; }
    if (!d.r) continue;
    const dd = Math.hypot(x - d.x, z - d.z) / d.r;
    if (dd < 1 && dd < bd) { bd = dd; best = d.name; }
  }
  return best;
}
