// Reflection probe that follows the player's car (render/carprobe.js). Off on low quality or on foot.
// Debug: window.__carProbe (.enabled, .stats.ms = smoothed CPU ms per frame).
import { createCarProbe } from '../render/carprobe.js';

export function install(G) {
  const q = G.quality?.name || 'high';
  if (!G.renderer || q === 'low') return;
  const probe = createCarProbe(G.renderer, G.scene, { size: q === 'high' ? 128 : 96, facesPerFrame: 1, far: q === 'high' ? 180 : 140 });
  if (typeof window !== 'undefined') window.__carProbe = probe;
  const pos = { x: 0, y: 0, z: 0 };
  let tick = 0;
  G.systems.push({
    update() {
      const v = G.player?.vehicle, root = v?.root;
      if (!root || G.player.mode !== 'car') { probe.update(null); return; }
      const moved = Math.hypot(root.position.x - pos.x, root.position.z - pos.z);
      // parked / crawling: half rate (the street around only changes with lights and passing cars)
      if (moved < 0.08 && (tick++ & 1)) return;
      pos.x = root.position.x; pos.y = root.position.y + 1.0; pos.z = root.position.z;
      probe.update(pos, root);
    },
  });
}
