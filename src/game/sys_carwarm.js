// (perf r2) Street-car warm-up at boot (behind the loading screen): every traffic model's procedural build (30-66 ms the
// first time a model spawned mid-drive), its baked asset (loads in the background), the AO atlas upload and the far
// shadow proxies. ?nocarwarm = off (each model is built on its first spawn, as before).
import { TRAFFIC_MIX, CARS } from '../vehicle/cars.js';
import { prewarmCarModel } from '../vehicle/models.js';
import { PERF } from '../render/perfflags.js';

export function install(G) {
  if (!PERF.carwarm) return;
  const ids = new Set(TRAFFIC_MIX.map(([id]) => CARS[id]?.model || id));
  for (const id of ids) { try { prewarmCarModel(id, G.renderer); } catch (e) { console.warn('[carwarm]', id, e); } }
}
