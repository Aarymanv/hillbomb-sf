// World anchors shared by every module. Pure data + tiny helpers, no three.js imports.
// WORLD FRAME: metres. +X = east, +Z = south (so north is -Z), +Y = up. Sea level y = 0.
// The map is San Francisco at ~0.5 horizontal scale (1 real km ~ 500 m), vertical relief ~0.55 of real.

// ---------- Golden Gate Bridge (runs roughly north from the Presidio toll plaza to Marin) ----------
// point(s, l): s = metres along the bridge axis from the south (SF) end, l = lateral offset (+ = east side)
export const GG_BRIDGE = {
  start: [-1560, -1200],            // south end of the deck (toll plaza, on the Fort Point bluff)
  dir: [-0.1390, -0.9903],          // unit axis, pointing north (slightly west)
  length: 1260,                     // south end -> north end (Marin), metres
  roadWidth: 20,                    // asphalt, 6 lanes
  deckWidth: 27,                    // full deck incl. 2 sidewalks outside the traffic rails
  southAnchorS: 150, southTowerS: 320, northTowerS: 940, northAnchorS: 1110,
  towerTopY: 125,                   // top of the tower legs
  towerLegLateral: 16,              // leg centre offset from the axis (legs at l = +-16)
  cableLateral: 14.5,               // main cables at l = +-14.5
  cableSagY: 42,                    // main cable lowest point (mid-span) y
  // road surface height along the axis (gentle arch)
  deckY(s) { const u = (s - 630) / 630; return 34 + 4 * (1 - u * u); },
};

// ---------- Bay Bridge, west (suspension) span: SF Rincon Hill anchorage -> Yerba Buena Island ----------
export const BAY_BRIDGE = {
  start: [2255, -95],               // SF cable anchorage, just offshore of the Embarcadero (the engine's approach viaduct continues SW from here over the Embarcadero into SoMa)
  dir: [0.6461, -0.7633],           // unit axis, pointing north-east toward YBI
  length: 1430,                     // to the YBI shore
  roadWidth: 18,
  deckWidth: 22,
  towersS: [150, 490, 850, 1190],   // four suspension towers
  centerAnchorS: 670,               // big concrete centre anchorage between the two spans
  ybiAnchorS: 1370,
  towerTopY: 108,
  towerLegLateral: 12.5,
  cableLateral: 11.5,
  cableSagY: 44,
  deckY(s) { return 37 + 2 * Math.min(1, s / 1430); },
};

export function bridgePoint(br, s, l = 0) {
  const [sx, sz] = br.start, [dx, dz] = br.dir;
  return [sx + dx * s + -dz * l, sz + dz * s + dx * l];
}

// ---------- Landmarks (ground positions; build on heightAt(x, z)) ----------
// yaw: radians about +Y. yaw 0 = the landmark's "front" faces -Z (north); PI/2 = front faces -X (west)...
// in general front direction = (-sin(yaw), 0, -cos(yaw)).
export const LANDMARKS = {
  transamerica: { x: 1700, z: -500, yaw: 0, baseHalf: 14, height: 135 },
  salesforce:   { x: 1900, z: -262, yaw: 0, baseHalf: 13.5, height: 165 },
  coit:         { x: 1520, z: -965, yaw: 0, height: 32, radius: 6 },
  // Ferry Building: long axis along (0.6, 0.8); front faces (-0.8, 0.6) (toward Market St / the city)
  ferry:        { x: 2074, z: -589, yaw: Math.atan2(0.8, -0.6), length: 110, depth: 28, height: 15, towerHeight: 44 },
  palaceFineArts: { x: -390, z: -995, yaw: 0, radius: 22 },
  paintedLadies: { x: 158, z: 380, yaw: Math.PI / 2, count: 7, lotWidth: 8.5 }, // row along Steiner St, fronts face west (-X)
  cityHall:     { x: 800, z: 300, yaw: Math.PI / 2, width: 90, depth: 62, domeTopY: 62 }, // front faces west (Van Ness)
  sutroTower:   { x: -600, z: 1520, height: 150 },
  alcatraz:     { x: 750, z: -2315, yaw: 0.35 },
  oraclePark:   { x: 2150, z: 420, yaw: -0.6 },
  cliffHouse:   { x: -3135, z: 270, yaw: Math.PI / 2 },
  fishermansWharfSign: { x: 1060, z: -1238, yaw: 0 },
  graceCathedral: { x: 1180, z: -345, yaw: 0 },
  hawkHill:     { x: -2330, z: -2560 },
  twinPeaks:    { x: -420, z: 1600 },
};

// Named districts (for the HUD location label and building styles). Rough centres + radius.
export const DISTRICTS = [
  { name: 'Financial District', x: 1750, z: -380, r: 330 },
  { name: 'SoMa', x: 1500, z: 350, r: 480 },
  { name: 'Chinatown', x: 1480, z: -420, r: 170 },
  { name: 'North Beach', x: 1420, z: -820, r: 220 },
  { name: 'Telegraph Hill', x: 1560, z: -980, r: 140 },
  { name: "Fisherman's Wharf", x: 1150, z: -1200, r: 230 },
  { name: 'Russian Hill', x: 1000, z: -880, r: 230 },
  { name: 'Nob Hill', x: 1170, z: -380, r: 200 },
  { name: 'Tenderloin', x: 1150, z: 50, r: 200 },
  { name: 'Civic Center', x: 850, z: 300, r: 180 },
  { name: 'Marina', x: 150, z: -1050, r: 330 },
  { name: 'Pacific Heights', x: 250, z: -420, r: 380 },
  { name: 'Western Addition', x: 350, z: 250, r: 330 },
  { name: 'Hayes Valley', x: 650, z: 520, r: 200 },
  { name: 'Haight-Ashbury', x: -250, z: 700, r: 260 },
  { name: 'Castro', x: 250, z: 1250, r: 250 },
  { name: 'Mission', x: 850, z: 1500, r: 420 },
  { name: 'Potrero Hill', x: 1750, z: 1450, r: 320 },
  { name: 'Mission Bay', x: 2150, z: 900, r: 300 },
  { name: 'Richmond', x: -1700, z: 200, r: 1000 },
  { name: 'Sunset', x: -1800, z: 1600, r: 1000 },
  { name: 'Golden Gate Park', x: -1800, z: 860, r: 0, rect: [-3000, 620, -560, 1100] },
  { name: 'Presidio', x: -1000, z: -700, r: 650 },
  { name: 'Lands End', x: -2450, z: -120, r: 500 },
  { name: 'Twin Peaks', x: -420, z: 1600, r: 380 },
  { name: 'Marin Headlands', x: -2000, z: -2700, r: 1200 },
  { name: 'Alcatraz', x: 750, z: -2315, r: 180 },
  { name: 'Yerba Buena Island', x: 3420, z: -1440, r: 320 },
  { name: 'Treasure Island', x: 3080, z: -2130, r: 450 },
  { name: 'Golden Gate Bridge', x: -1640, z: -1820, r: 0 },
  { name: 'Bay Bridge', x: 2680, z: -630, r: 0 },
];
