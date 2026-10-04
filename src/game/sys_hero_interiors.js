// Walk-in interiors of the hero landmarks (logic in src/world/interiors/hero_int.js). Auto-installed by main.js.
import { installHeroInteriors } from '../world/interiors/hero_int.js';

export function install(G) {
  if (!G.world?.v2) return;
  let api = null;
  try { api = installHeroInteriors(G); } catch (e) { console.error('[heroInt] install', e); }
  if (!api) return;
  G.heroInteriors = api;
  G.systems.push({ update(dt) { try { api.update(dt); } catch (e) { console.error('[heroInt] update', e); api.update = () => {}; } } });
}
