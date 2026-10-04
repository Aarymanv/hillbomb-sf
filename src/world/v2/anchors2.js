// Real-scale (1:1) landmark anchors for the v2 map. Pure data + tiny helpers, no three.js imports.
// WORLD FRAME: metres, +X east, +Z south, +Y up, sea level 0 (same as anchors.js).
// Projection: EXACTLY the bake's (tools/map/common.py, public/assets/map/meta.json projection). NOTE: src/world/latlon.js
// ll() currently uses KX 111320*cos(lat0) ~ 87980 and KZ 110574, the bake uses kx 88100.22 / kz 110992.23: that is
// ~12 m off at Coit Tower and ~40 m at the Golden Gate north tower, so landmarks use llx() below until latlon.js adopts
// meta.projection.kx/kz.
export const PROJ = { lat0: 37.7749, lon0: -122.4194, kx: 88100.2238999239, kz: 110992.2282353035 };
export function setProj2(meta) { if (meta?.projection) Object.assign(PROJ, { lat0: meta.projection.lat0, lon0: meta.projection.lon0, kx: meta.projection.kx, kz: meta.projection.kz }); }
export function llx(lat, lon) { return [(lon - PROJ.lon0) * PROJ.kx, -(lat - PROJ.lat0) * PROJ.kz]; }

// ---------- Golden Gate Bridge (derived from OSM deck polylines + tower piers in the surface raster) ----------
// Axis origin = south tower centre; s = metres north along the axis; l = lateral (+ = east).
// South tower pier/fender centre (-5158, -4346) (fender 88 x 48 m); north tower (-5271, -5620): span 1279.4 m (real 1280).
// OSM "Pylon S1" footprint at s = -346 (real side span 343 m). SF shoreline s ~ -300, Marin shore s ~ 1300.
export const GG2 = {
  origin: [-5153.8, -4346.0],
  dir: [-0.0918, -0.9958],            // unit, pointing north (slightly west)
  mainSpan: 1280, sideSpan: 343,      // towers at s = 0 and 1280; cable anchorages ~ s = -343 / 1623
  towerTop: 227,                      // above water
  roadAtTowers: 75,                   // towers rise 152 m above the roadway (real)
  roadMid: 77,                        // gentle crown at midspan (clearance 67 m to the truss bottom)
  truss: 7.6, deckWidth: 27.4, roadWidth: 18.9, sidewalk: 3.2, cableSpacing: 27.4, cableDia: 0.92, suspenderStep: 15.24,
  osmBridgeS: [-674, 1630],           // extent of the OSM bridge-flagged ways along the axis
};
export function ggPoint(s, l = 0) { const [ox, oz] = GG2.origin, [dx, dz] = GG2.dir; return [ox + dx * s - dz * l, oz + dz * s + dx * l]; }
export function ggS(x, z) { const [ox, oz] = GG2.origin, [dx, dz] = GG2.dir; return (x - ox) * dx + (z - oz) * dz; }
// recommended road profile (see PROGRESS_V2.md): keeps the OSM south joint (55.2 m at s = -674) and the Marin joint
// (71.5 m at s ~ 2042), 75 m at both towers, 77 m at midspan
export function ggDeckY(s) {
  if (s <= -674) return 55.2;
  if (s < 0) { const t = (s + 674) / 674; return 55.2 + (GG2.roadAtTowers - 55.2) * (t * (2 - t)); }
  if (s <= GG2.mainSpan) { const u = s / GG2.mainSpan * 2 - 1; return GG2.roadAtTowers + (GG2.roadMid - GG2.roadAtTowers) * (1 - u * u); }
  if (s < 2042) { const t = (s - GG2.mainSpan) / (2042 - GG2.mainSpan); return GG2.roadAtTowers + (71.5 - GG2.roadAtTowers) * t; }
  return 71.5;
}

// ---------- Bay Bridge west span (OSM: upper deck = westbound edge layer 2, lower deck = eastbound layer 1) ----------
// Upper deck way: SF (2525.8, -1254.6) -> YBI (4590.8, -3682.5). Lower deck way: SF (2557.5, -1285.1) -> YBI (4593.4, -3680.3),
// offset 3.4-4.4 m laterally from the upper deck (should be stacked). Real: 2 suspension bridges (main 704 m, sides 353 m)
// sharing a central anchorage; towers W2 W3 | W4 anchorage | W5 W6; decks ~9.5 m apart; clearance 58 m.
export const BAY2 = {
  sf: [2525.8, -1254.6], ybi: [4590.8, -3682.5],
  mainSpan: 704, sideSpan: 353, deckGap: 9.5, roadWidth: 19.7,
};

// ---------- landmarks: real lat/lon (verified against OSM footprints in the baked data, see PROGRESS_V2.md) ----------
// h = real height (m above its base), osm = building indices the landmark replaces (to hide in the buildings streamer)
export const LM2 = {
  transamerica: { lat: 37.79519, lon: -122.40279, h: 260, base: 53, osm: [13643, 13634] },
  salesforce: { lat: 37.78976, lon: -122.39688, h: 326, osm: [17645, 17646, 17647, 17648, 17649, 17651, 17652, 17653] },
  coit: { lat: 37.80239, lon: -122.40582, h: 64, dia: 11, osm: [9290, 9291, 9292, 9293, 9294, 9297] },
  ferry: { lat: 37.79554, lon: -122.39341, len: 200, tower: 75, osm: [13853, 13855, 13856, 13857, 13858, 13859, 13860] },
  cityHall: { lat: 37.77927, lon: -122.41924, domeTop: 94, w: 119, d: 87, osm: [39058, 39059, 39060, 39064, 39065, 39066, 39082, 39083] },
  palaceFineArts: { lat: 37.80285, lon: -122.44842, dome: 49, osm: [2401, 2402, 2411] },
  paintedLadies: { lat: 37.77627, lon: -122.43277 },
  sutroTower: { lat: 37.75523, lon: -122.45284, h: 298, osm: [76658, 76659, 76660, 76661, 76662] },
  alcatraz: { lat: 37.8267, lon: -122.4230, osm: [1433, 1421, 1432, 1431] },
  oraclePark: { lat: 37.77857, lon: -122.38907 },
  cliffHouse: { lat: 37.77846, lon: -122.51411, osm: [30813] },
  sutroBaths: { lat: 37.78033, lon: -122.51362 },
  wharfSign: { lat: 37.80824, lon: -122.41577 },
  pier39: { lat: 37.80867, lon: -122.40981 },
  graceCathedral: { lat: 37.79195, lon: -122.41327, towers: 53, osm: [16833, 17137, 17138, 16834] },
  lombard: { lat: 37.80210, lon: -122.41874 },
  twinPeaks: { lat: 37.75363, lon: -122.44768 },
  conservatory: { lat: 37.77202, lon: -122.46036, osm: [42784] },
  deYoung: { lat: 37.77146, lon: -122.46869, tower: 44, osm: [42775, 42776, 42777, 42778, 42779, 42780, 42781, 42782] },
  legion: { lat: 37.78448, lon: -122.50084 },
  fortPoint: { lat: 37.81063, lon: -122.47701 },
  hawkHill: { lat: 37.8254, lon: -122.4995 },
  batterySpencer: { lat: 37.8275, lon: -122.4834 },
  missionDolores: { lat: 37.76440, lon: -122.42692 },
  castroTheatre: { lat: 37.76203, lon: -122.43490 },
  dragonGate: { lat: 37.79078, lon: -122.40576 },
  unionSquare: { lat: 37.78799, lon: -122.40750, column: 29 },
  treasureIsland1: { lat: 37.8237, lon: -122.3708 },
  cablePowellMarket: { lat: 37.78486, lon: -122.40780 },
  cableHydeBeach: { lat: 37.80634, lon: -122.42068 },
  cableTaylorBay: { lat: 37.80490, lon: -122.41530 },
};
export function lmXZ(id) { const a = LM2[id]; return a ? llx(a.lat, a.lon) : null; }

// ---------- v2 landmark sites (world metres, measured on the baked OSM footprints 2026-09-28) ----------
// at = kit origin, yaw = kit yaw (front faces (-sin yaw, -cos yaw)), grid9 = the north-of-Market street grid (9 deg).
// hide = OSM building indices the model replaces; hideR = also hide every footprint whose centroid is within r m.
// hero = always loaded (tall / seen from far away), otherwise streamed by tile. S = uniform scale for v1 builders.
const G9 = 0.157;
export const SITES2 = {
  transamerica: { at: [1463.8, -2249.4], yaw: G9, hero: true, A: { baseHalf: 24, height: 260 }, hide: [13643, 13634, 13639, 13640, 13641, 13642] },
  salesforce: { at: [1979.5, -1651.5], yawStreet: 'Mission Street', hero: true, A: { baseHalf: 25.5, height: 326 }, hideR: 32 },
  coit: { at: [1195.3, -3049.4], yaw: 0, hero: true, A: { height: 64, radius: 5.65 }, hide: [9290, 9291, 9292, 9293, 9294, 9297] },
  ferry: { at: [2287, -2290], yaw: 2.199, hero: true, A: { length: 200, depth: 48, height: 16, towerHeight: 75 }, hide: [13853, 13855, 13856, 13857, 13858, 13859, 13860] },
  cityHall: { at: [14.4, -485.4], yaw: -1.414, hero: true, S: 1.35, A: { width: 88, depth: 64.5, domeTopY: 66 }, hideR: 58 },   // 119 x 87 m, dome 89 m
  sutroTower: { at: [-2947.2, 2182], hero: true, A: { height: 298 }, hide: [76658, 76659, 76660, 76661, 76662] },
  palaceFineArts: { at: [-2555, -3110], yaw: -Math.PI / 2, hero: true, S: 1.4, A: { radius: 22, noLagoon: true }, hideR: 26, hideFloat: 160 },
  alcatraz: { light: [-255.1, -5699.9], tower: [-388, -5905], hero: true, hide: [1431] },
  graceCathedral: { at: [526, -1882], yaw: -1.414, S: 1.35, A: {}, hide: [16833, 17137, 17138, 16834] },
  paintedLadies: { at: [-1175.6, -151.3], yaw: Math.PI / 2 + 0.136, A: { count: 7, lotWidth: 7.3 }, hide: [38262, 38261, 38266, 38260, 38245, 38265, 38253] },
  oraclePark: { at: [2673, -453], yaw: -1.094, S: 1.43, A: {}, hide: [39956, 39957, 39958, 39959, 39960, 39961] },
  cliffHouse: { at: [-8336.1, -399.6], yaw: Math.PI / 2, A: {}, hide: [30813] },
  wharfSign: { street: ['Jefferson Street', 'Taylor Street'], off: [6, -9], yaw: Math.PI, A: {} },
  conservatory: { at: [-3597.4, 251.9], yaw: Math.PI, hide: [42784], hideR: 44 },
  deYoung: { at: [-4309, 316.5], yaw: 0.19, base: 73.5, hide: [42775, 42776, 42777, 42778, 42779, 42780, 42781, 42782, 42783] },
  legion: { at: [-7171, -1066.5], frontStreet: /Legion of Honor/i, hide: [17802, 17803, 17804, 17807, 17808, 17811] },
  missionDolores: { mission: [-651.9, 1189.7], basilica: [-666.8, 1169], yaw: -1.484, hide: [57521, 57522] },
  castroTheatre: { at: [-1374.4, 1432.5], yaw: 1.64, base: 42.5 },
  dragonGate: { street: ['Grant Avenue', 'Bush Street'], along: 'Grant Avenue', back: 13 },
  unionSquare: { corners: [['Geary Street', 'Powell Street'], ['Geary Street', 'Stockton Street'], ['Post Street', 'Powell Street'], ['Post Street', 'Stockton Street']], fallback: [1048.4, -1452.9] },
  embarcaderoCenter: { at: [1890, -2200], groups: [[13813, 13814, 13816], [13811, 13810, 13812], [13809, 13807, 13808], [13796, 13797, 13798, 13800]] },
  pier39: { street: ['The Embarcadero', 'Beach Street'], along: null, north: 28, fallback: [860, -3585] },
};
