// (perf 10/4) runtime switches for the performance passes, so a single session can A/B them (dev/perf_ab.js flips them
// between drive segments). Defaults on; ?no<name> in the URL turns one off at load, window.__perf.<name> = false at run time.
//   maskcull   Google tiles wholly inside our near block are culled (world/v2/googletiles.js)
//   extcull    interior-site exterior shells hidden past the near city (game/sys_interiors.js)
//   shaderwarm first-use shaders compiled in the background, the object drawn once ready (render/shaderwarm.js)
//   shadowcull shadow casters whose shadow can't reach the camera frustum are skipped (render/environment.js)
//   tilesthrottle  Google tiles traversal every other frame on a widened frustum, three culls the meshes (world/v2/googletiles.js)
//   waterthrottle  the water mirror re-renders every 3rd frame while no water is within 320 m (render/water.js)
//   carlean    street cars: shut doors merged into the body, one LOD level in the graph, static nodes frozen (vehicle/models.js)
//   probeumw   the car reflection probe renders with the matrices of the last main render (no extra scene.updateMatrixWorld)
//   carshadowproxy  far street cars (LOD 1 / 2) cast the sun shadow from one merged depth-only proxy (vehicle/models.js)
//   physlite   car physics: ground probes skip the normal / surface taps where they are never read (vehicle/physics.js; same results)
const q = typeof location !== 'undefined' ? location.search : '';
export const PERF = globalThis.HB_PERF || (globalThis.HB_PERF = {});
for (const k of ['maskcull', 'extcull', 'shaderwarm', 'waterthrottle', 'shadowcull', 'tilesthrottle', 'probeumw', 'carlean', 'carshadowproxy', 'physlite']) if (PERF[k] === undefined) PERF[k] = !new RegExp('[?&]no' + k + '(&|$)').test(q);
if (typeof window !== 'undefined') window.__perf = PERF;
