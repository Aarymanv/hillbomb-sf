// Real-world lat/lon <-> world metres (+X east, +Z south). Author all placed content (events, festival sites,
// collectibles, story beats) in REAL lat/lon through ll(), never raw x/z, so it survives map rebuilds.
// The current hand-built map ('v1', ~0.49 scale) uses an affine fit to 18 landmarks (residuals 20-240 m):
// snap what you place to the road graph (graph.nearestEdge) instead of trusting the raw point.
// The real-data map ('v2') switches this to an exact local equirectangular projection via setProjection().
export const ORIGIN = { lat: 37.7749, lon: -122.4194 };          // Civic Center
let KX = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180), KZ = 110574;   // metres per degree (v1 fit constants)

// x = a*E + b*N + c, z = d*E + e*N + f, with E/N = real metres east/north of ORIGIN
const V1 = { a: 0.48965244, b: 0.01632074, c: 856.656, d: 0.01197891, e: -0.48459162, f: 529.858 };
let T = V1, inv = invert(V1);
export let MAP_SCALE = 0.49;

function invert(t) {
  const det = t.a * t.e - t.b * t.d;
  return { a: t.e / det, b: -t.b / det, d: -t.d / det, e: t.a / det, c: t.c, f: t.f };
}
// v2: scale 1 = real size. Real-data maps call this before anything reads ll().
export function setProjection({ scale = 1, kx = null, kz = null } = {}) {
  // v2 must use the bake's exact metres-per-degree (meta.projection.kx / kz), else things drift ~40 m across the map
  if (kx) KX = kx; if (kz) KZ = kz;
  T = { a: scale, b: 0, c: 0, d: 0, e: -scale, f: 0 };
  inv = invert(T); MAP_SCALE = scale;
}
export function ll(lat, lon) {
  const E = (lon - ORIGIN.lon) * KX, N = (lat - ORIGIN.lat) * KZ;
  return [T.a * E + T.b * N + T.c, T.d * E + T.e * N + T.f];
}
export function toLatLon(x, z) {
  const dx = x - inv.c, dz = z - inv.f;
  const E = inv.a * dx + inv.b * dz, N = inv.d * dx + inv.e * dz;
  return [ORIGIN.lat + N / KZ, ORIGIN.lon + E / KX];
}
// real-world distance (m) -> world distance at the current map scale
export const metres = m => m * MAP_SCALE;
