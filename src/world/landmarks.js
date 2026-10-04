// HILLBOMB landmarks: procedural, recognisable San Francisco landmarks (no asset files).
// buildLandmarks({ heightAt }) -> { group, colliders, update(dt, env) }
// Every landmark is also exported on its own (same return shape) for the dev preview page.
import * as THREE from 'three';
import { buildGoldenGate } from './landmarks/goldenGate.js';
import { buildBayBridge } from './landmarks/bayBridge.js';
import { buildTransamerica, buildSalesforce, buildFerryBuilding } from './landmarks/downtown.js';
import { buildCityHall, buildGraceCathedral, buildCoitTower, buildPaintedLadies } from './landmarks/civic.js';
import { buildPalaceOfFineArts, buildCliffHouse, buildSutroTower, buildHawkHill } from './landmarks/west.js';
import { buildAlcatraz, buildBallpark, buildWharfSign } from './landmarks/bay.js';
import { updateShared } from './landmarks/kit.js';
export { registerLandmarksV2 } from './landmarks/v2/lm2.js';

export {
  buildGoldenGate, buildBayBridge, buildTransamerica, buildSalesforce, buildFerryBuilding,
  buildCityHall, buildGraceCathedral, buildCoitTower, buildPaintedLadies,
  buildPalaceOfFineArts, buildCliffHouse, buildSutroTower, buildHawkHill,
  buildAlcatraz, buildBallpark, buildWharfSign,
};
// Aliases matching the anchor names
export { buildBallpark as buildOraclePark, buildWharfSign as buildFishermansWharfSign, buildPalaceOfFineArts as buildPalace };

// id -> builder (ids match LANDMARKS keys in anchors.js where one exists)
export const LANDMARK_BUILDERS = {
  goldenGate: buildGoldenGate,
  bayBridge: buildBayBridge,
  transamerica: buildTransamerica,
  salesforce: buildSalesforce,
  coit: buildCoitTower,
  ferry: buildFerryBuilding,
  palaceFineArts: buildPalaceOfFineArts,
  paintedLadies: buildPaintedLadies,
  cityHall: buildCityHall,
  sutroTower: buildSutroTower,
  alcatraz: buildAlcatraz,
  oraclePark: buildBallpark,
  cliffHouse: buildCliffHouse,
  fishermansWharfSign: buildWharfSign,
  graceCathedral: buildGraceCathedral,
  hawkHill: buildHawkHill,
};

export function buildLandmarks({ heightAt = () => 0, only = null, ...opts } = {}) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const colliders = [];
  const parts = {};
  for (const [id, fn] of Object.entries(LANDMARK_BUILDERS)) {
    if (only && !only.includes(id)) continue;
    const r = fn({ heightAt, ...opts });
    parts[id] = r;
    group.add(r.group);
    for (const c of r.colliders) colliders.push(c);
  }
  const list = Object.values(parts);
  return {
    group,
    colliders,
    parts, // per-landmark { group, colliders, triangles, update }
    update(dt, env = {}) {
      updateShared(env);
      for (const p of list) p.update(dt, env);
    },
  };
}
