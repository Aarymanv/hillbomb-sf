// v2-only landmarks (real scale): Embarcadero Center night outlines, Pier 39 gate, Conservatory of Flowers, de Young
// Hamon tower, Legion of Honor, Mission Dolores, Castro Theatre sign, Chinatown Dragon Gate, Union Square Dewey column,
// Alcatraz lighthouse + water tower. Every builder: (opts) -> Kit result { group, colliders, update }.
// Frames: kit local +X = right, -Z = front, y = world height (see kit.js).
import * as THREE from 'three';
import { Kit, shade, archGeom, loftGeom, circleRing, rng } from '../kit.js';

const WARM = [2.2, 1.5, 0.75];

// ------------------------------------------------------------------------------------------ Embarcadero Center lights
// The four towers are outlined in white bulbs at night (a San Francisco skyline signature). Follows the OSM rings.
export function buildEmbarcaderoLights({ B, groups, heightAt }) {
  const kit = new Kit('embarcaderoLights', { heightAt });
  const ring = [];
  for (const ids of groups) for (const i of ids) {
    B.ring(i, ring); const n = ring.length / 2; if (n < 3) continue;
    const y0 = B.base[i] + (B.minH[i] || 0), y1 = B.base[i] + B.h[i];
    for (let k = 0; k < n; k++) {
      const ax = ring[k * 2], az = ring[k * 2 + 1], bx = ring[((k + 1) % n) * 2], bz = ring[((k + 1) % n) * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az); if (len < 2) continue;
      const ox = -(bz - az) / len * 0.25, oz = (bx - ax) / len * 0.25;        // just outside the wall
      kit.beam('glow', [ax + ox, y1 + 0.1, az + oz], [bx + ox, y1 + 0.1, bz + oz], 0.22, 0.22, 0xf4f1e8, { ecol: [2.6, 2.5, 2.2] });
      kit.beam('glow', [ax + ox, y0 + 4, az + oz], [ax + ox, y1 + 0.1, az + oz], 0.22, 0.22, 0xf4f1e8, { ecol: [2.6, 2.5, 2.2] });
    }
  }
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Pier 39 entrance gate
export function buildPier39({ x, z, yaw, heightAt }) {
  const kit = new Kit('pier39', { x, z, yaw, heightAt });
  const y = kit.h(0, 0), WOOD = 0x8a6a4a, WOOD_D = 0x6b5038, BLUE = 0x1f4f86;
  for (const sg of [-1, 1]) {
    kit.boxY('solid', sg * 9, y, y + 9.5, 0, 1.6, 1.6, WOOD);
    kit.boxY('solid', sg * 9, y + 9.5, y + 10.5, 0, 2.2, 2.2, WOOD_D);
    kit.collider(sg * 9, 0, 0.8, 0.8, 0, y, y + 10.5);
  }
  kit.boxY('solid', 0, y + 7, y + 7.8, 0, 20, 1.4, WOOD_D);
  kit.gable('solid', 'solid', 0, 0, 10.6, 1.4, y + 10.2, 2.4, WOOD, 0x4a5a64, { alongX: true, over: 0.4, th: 0.25 });
  // sign board with lit lettering
  kit.boxY('paint', 0, y + 7.8, y + 10.2, -0.1, 12, 0.5, BLUE);
  const letters = 'PIER 39';
  for (let i = 0; i < letters.length; i++) if (letters[i] !== ' ') kit.box('glow', -4.2 + i * 1.4, y + 9, -0.4, 0.9, 1.5, 0.1, 0xfff6dc, { ecol: [3, 2.6, 1.6] });
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Conservatory of Flowers
// Victorian glasshouse (1879): central octagonal pavilion with a 18 m dome + cupola, two arched-roof wings with end
// pavilions, white-painted wood frame. Front faces south (JFK Drive).
export function buildConservatory({ x, z, yaw, heightAt }) {
  const kit = new Kit('conservatory', { x, z, yaw, heightAt });
  const [lo, hi] = kit.hRange(0, 0, 38, 12);
  const y0 = hi + 0.3, WHITE = 0xf1efe8, GLASS = 0xcfd9d6;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfe8e4, roughness: 0.18, metalness: 0, transmission: 0, transparent: true, opacity: 0.55, emissive: 0xffe9c4, emissiveIntensity: 0, vertexColors: true });
  glass.name = 'lm-conservatory-glass';
  kit.register('glass', glass, { castShadow: false });
  kit.boxY('solid', 0, lo - 1.5, y0, 0, 80, 22, 0xb9b3a6);
  // wings: vaulted glass roofs (half cylinders along x) on low glazed walls
  for (const sg of [-1, 1]) {
    const cx = sg * 21, len = 26;
    kit.boxY('glass', cx, y0, y0 + 4.5, 0, len, 11, GLASS);
    const vault = new THREE.CylinderGeometry(5.5, 5.5, len, 16, 1, true, 0, Math.PI); vault.rotateZ(Math.PI / 2); vault.rotateX(-Math.PI / 2);
    kit.place('glass', vault, cx, y0 + 4.5, 0, GLASS);
    for (let k = 0; k <= 8; k++) {                                 // white ribs
      const px = cx - len / 2 + k * len / 8;
      for (let a = 0; a < 8; a++) {
        const t0 = a / 8 * Math.PI, t1 = (a + 1) / 8 * Math.PI;
        kit.beam('paint', [px, y0 + 4.5 + Math.sin(t0) * 5.6, Math.cos(t0) * 5.6], [px, y0 + 4.5 + Math.sin(t1) * 5.6, Math.cos(t1) * 5.6], 0.25, 0.25, WHITE);
      }
      for (const f of [-1, 1]) kit.boxY('paint', px, y0, y0 + 4.5, f * 5.55, 0.3, 0.3, WHITE);
    }
    // end pavilion
    const ex = sg * 36;
    kit.boxY('glass', ex, y0, y0 + 7, 0, 7, 13, GLASS);
    kit.gable('paint', 'glass', ex, 0, 3.6, 6.6, y0 + 7, 3.2, WHITE, GLASS, { over: 0.2, th: 0.2 });
    for (const f of [-1, 1]) for (const g of [-1, 1]) kit.boxY('paint', ex + f * 3.5, y0, y0 + 7.2, g * 6.5, 0.4, 0.4, WHITE);
    kit.collider(cx, 0, len / 2 + 1, 6, 0, lo, y0 + 10);
    kit.collider(ex, 0, 3.6, 6.6, 0, lo, y0 + 10);
  }
  // central pavilion: octagonal drum, dome, lantern cupola
  const oct = circleRing(8.2, 8).map(([a, b]) => [a, b]);
  kit.geom('glass', loftGeom(oct, y0, oct, y0 + 8.5), null, GLASS);
  for (let i = 0; i < 8; i++) { const a = -i / 8 * Math.PI * 2; kit.boxY('paint', Math.cos(a) * 8.25, y0, y0 + 8.8, Math.sin(a) * 8.25, 0.45, 0.45, WHITE); }
  kit.cyl('paint', 0, y0 + 8.5, 0, 8.6, 8.6, 0.6, 8, WHITE);
  const dome = new THREE.SphereGeometry(8.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 1.05, 1);
  kit.place('glass', dome, 0, y0 + 9.1, 0, GLASS);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    let prev = null;
    for (let k = 0; k <= 6; k++) { const t = k / 6 * Math.PI / 2, p = [Math.cos(a) * Math.cos(t) * 8.3, y0 + 9.1 + Math.sin(t) * 8.6, Math.sin(a) * Math.cos(t) * 8.3]; if (prev) kit.beam('paint', prev, p, 0.22, 0.22, WHITE); prev = p; }
  }
  kit.cyl('paint', 0, y0 + 17.4, 0, 2.2, 2.2, 2.2, 8, WHITE);
  kit.cyl('paint', 0, y0 + 19.6, 0, 2.6, 0.2, 1.8, 8, WHITE);
  kit.boxY('paint', 0, y0 + 21.4, y0 + 22.8, 0, 0.2, 0.2, 0xc8b060);
  kit.collider(0, 0, 8.4, 8.4, 0, lo, y0 + 20);
  // entrance porch (front = -z)
  kit.boxY('paint', 0, y0, y0 + 5.5, -8.8, 5, 3.2, WHITE);
  kit.place('glow', archGeom(2.6, 3.8, 6), 0, y0, -10.45, 0x3a3a34, { ecol: WARM });
  const res = kit.finish();
  const up0 = res.update;
  res.update = (dt, env = {}) => { up0(dt, env); glass.emissiveIntensity = (env.night || 0) * 0.55; };
  return res;
}

// ------------------------------------------------------------------------------------------ de Young Hamon tower
// 44 m twisting tower clad in perforated copper (now brown), glazed observation floor on top.
export function buildDeYoungTower({ x, z, yaw, heightAt, base }) {
  const kit = new Kit('deYoungTower', { x, z, yaw, heightAt });
  const y0 = base ?? kit.h(0, 0), H = 44;
  const cop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.65 });
  cop.name = 'lm-deyoung-copper';
  kit.register('copper', cop, {});
  const N = 12;
  // rhomboid footprint at the base twisting to a rectangle aligned with the park grid at the top
  const ringAt = (t) => {
    const tw = t * 0.62, hx = 13.5 - 2.5 * t, hz = 9 + 2 * t, sk = (1 - t) * 5;
    const pts = [[hx + sk, hz], [hx - sk, -hz], [-hx - sk, -hz], [-hx + sk, hz]];
    return pts.map(([a, b]) => [a * Math.cos(tw) - b * Math.sin(tw), a * Math.sin(tw) + b * Math.cos(tw)]);
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const col = (x2, y2, z2) => { const k = 0.55 + 0.1 * Math.sin(x2 * 1.3 + y2 * 0.7) * Math.cos(z2 * 1.1); return [0.52 * k, 0.34 * k, 0.21 * k]; };
    kit.geom('copper', loftGeom(ringAt(t0), y0 + t0 * (H - 4), ringAt(t1), y0 + t1 * (H - 4)), null, col);
  }
  const top = ringAt(1);
  kit.geom('glow', loftGeom(top, y0 + H - 4, top, y0 + H - 0.8), null, 0x2e3a40, [1.4, 1.2, 0.9]);
  kit.geom('copper', loftGeom(top.map(([a, b]) => [a * 1.03, b * 1.03]), y0 + H - 0.8, top.map(([a, b]) => [a * 1.03, b * 1.03]), y0 + H, { capTop: true }), null, 0x5a3b26);
  kit.collider(0, 0, 13, 10, 0, y0 - 1, y0 + H);
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Legion of Honor
// Beaux-Arts court of honor: triumphal-arch gateway, Ionic colonnades on three sides, hexastyle portico.
export function buildLegion({ x, z, yaw, heightAt }) {
  const kit = new Kit('legion', { x, z, yaw, heightAt });
  const ST = 0xe8e2d4, ST_D = 0xcfc7b6, ST_L = 0xf2eee4;
  const [lo, hi] = kit.hRange(0, 0, 40, 35);
  const y0 = hi + 0.2;
  kit.boxY('solid', 0, lo - 1, y0, 0, 84, 76, ST_D);
  // court paving
  kit.boxY('solid', 0, y0, y0 + 0.08, 0, 50, 48, 0xd9d2c2);
  const column = (cx, cz, h) => {
    kit.cyl('solid', cx, y0, cz, 0.62, 0.62, 0.5, 12, ST_L);
    kit.cyl('solid', cx, y0 + 0.5, cz, 0.5, 0.44, h - 1.2, 12, ST);
    kit.boxY('solid', cx, y0 + h - 0.7, y0 + h, cz, 1.3, 1.3, ST_L);
  };
  // colonnades (left, right, back) with entablature
  const CH = 9;
  for (const sg of [-1, 1]) {
    for (let k = -5; k <= 5; k++) column(sg * 22, k * 4, CH);
    kit.boxY('solid', sg * 22, y0 + CH, y0 + CH + 2, 0, 2.6, 44, ST_L);
    kit.boxY('solid', sg * 27, y0, y0 + CH + 3.5, 0, 7.5, 76, ST);                 // wings (galleries)
    kit.boxY('solid', sg * 27, y0 + CH + 3.5, y0 + CH + 4.5, 0, 8.2, 76.6, ST_L);
    kit.collider(sg * 27, 0, 3.8, 38, 0, lo, y0 + CH + 4.5);
  }
  for (let k = -4; k <= 4; k++) column(k * 4.4, 22, CH);
  kit.boxY('solid', 0, y0 + CH, y0 + CH + 2, 22, 40, 2.6, ST_L);
  // museum block behind + hexastyle portico with pediment
  kit.boxY('solid', 0, y0, y0 + 15, 32, 50, 16, ST);
  kit.boxY('solid', 0, y0 + 15, y0 + 16.2, 32, 51, 17, ST_L);
  for (let k = -2.5; k <= 2.5; k++) column(k * 3.2, 22.5, 12.5);
  kit.boxY('solid', 0, y0 + 12.5, y0 + 14, 22.5, 20, 2.4, ST_L);
  kit.gable('solid', 'solid', 0, 22.5, 10.3, 1.4, y0 + 14, 3.2, ST_L, ST_D, { alongX: true, over: 0.3, th: 0.3 });
  kit.place('glow', archGeom(3, 5.2, 8), 0, y0, 23.95, 0x3b3530, { ecol: WARM });
  kit.collider(0, 32, 25, 8, 0, lo, y0 + 16);
  // triumphal arch gateway at the front
  kit.boxY('solid', 0, y0, y0 + 14, -24, 16, 4, ST);
  kit.boxY('solid', 0, y0 + 14, y0 + 16.5, -24, 17, 4.6, ST_L);
  kit.place('solid', archGeom(6, 10, 10), 0, y0, -26.05, 0x2f2b27);
  kit.place('solid', archGeom(6, 10, 10), 0, y0, -21.95, 0x2f2b27, { yaw: Math.PI });
  for (const sg of [-1, 1]) { kit.collider(sg * 5.5, -24, 2.5, 2, 0, y0, y0 + 16.5); for (const f of [-1, 1]) column(sg * 6.8, -24 + f * 2.4, 11.5); }
  // front screen walls
  for (const sg of [-1, 1]) { kit.boxY('solid', sg * 16, y0, y0 + 6, -24, 16, 1.4, ST); kit.collider(sg * 16, -24, 8, 0.7, 0, y0, y0 + 6); }
  // The Thinker on a plinth in the court
  kit.boxY('solid', 0, y0, y0 + 2.4, -8, 1.8, 1.8, ST_D);
  kit.cyl('steel', 0, y0 + 2.4, -8, 0.55, 0.45, 1.9, 8, 0x2c3431);
  kit.collider(0, -8, 0.9, 0.9, 0, y0, y0 + 4.3);
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Mission Dolores
// Old mission (1791): white adobe, four-column facade with a balcony of three bells, low red-tile gable.
// Basilica (1918): Churrigueresque facade with two ornate towers and a central shell window.
export function buildMissionDolores({ mission, basilica, heightAt }) {
  const WHITE = 0xece5d6, TILE = 0x9a4a2e, CREAM = 0xe2d6bd, CREAM_D = 0xc9b999;
  const m = new Kit('missionDolores', { x: mission.x, z: mission.z, yaw: mission.yaw, heightAt });
  {
    const [lo, hi] = m.hRange(0, 0, 9, 22); const y0 = hi;
    m.boxY('solid', 0, lo - 1, y0 + 9, 0, 17, 44, WHITE);
    m.gable('solid', 'solid', 0, 0, 8.5, 22, y0 + 9, 3.2, WHITE, TILE, { over: 0.8, th: 0.35 });
    // front: 4 engaged columns in two tiers, balcony niche with bells
    for (let k = -1.5; k <= 1.5; k++) { m.boxY('solid', k * 3.4, y0, y0 + 6, -22.3, 1.1, 0.8, CREAM); m.boxY('solid', k * 2.6, y0 + 6.5, y0 + 11, -22.3, 0.8, 0.7, CREAM); }
    m.boxY('solid', 0, y0 + 6, y0 + 6.5, -22.5, 16, 1.4, CREAM_D);
    for (const bx of [-2.6, 0, 2.6]) m.cyl('steel', bx, y0 + 7.4, -22.1, 0.55, 0.3, 1.1, 10, 0x6a5a38);
    m.place('glow', archGeom(2.6, 3.8, 6), 0, y0, -22.8, 0x3b2c20, { ecol: WARM });
    m.collider(0, 0, 8.5, 22, 0, lo, y0 + 12);
  }
  const res1 = m.finish();
  const b = new Kit('missionDoloresBasilica', { x: basilica.x, z: basilica.z, yaw: basilica.yaw, heightAt });
  {
    const [lo, hi] = b.hRange(0, 0, 16, 28); const y0 = hi;
    b.boxY('solid', 0, lo - 1, y0 + 16, 4, 24, 54, CREAM);
    b.gable('solid', 'solid', 0, 4, 12, 27, y0 + 16, 5, CREAM, TILE, { over: 0.6, th: 0.4 });
    // facade: central frontispiece + two towers with domed lanterns
    b.boxY('solid', 0, y0, y0 + 22, -23.4, 14, 2, CREAM);
    b.place('glow', archGeom(4.5, 7.5, 8), 0, y0, -24.45, 0x2e241c, { ecol: WARM });
    b.place('glow', archGeom(3.4, 3.4, 8), 0, y0 + 11, -24.45, 0x3a3d52, { ecol: [0.8, 1.0, 2.0] });
    for (let i = 0; i < 6; i++) b.boxY('solid', -5.5 + i * 2.2, y0 + 1, y0 + 20, -24.5, 0.6, 0.4, CREAM_D);
    b.boxY('solid', 0, y0 + 22, y0 + 24, -23.4, 8, 2, CREAM_D);
    for (const sg of [-1, 1]) {
      const tx = sg * 9.5;
      b.boxY('solid', tx, y0, y0 + 26, -22.5, 5.5, 5.5, CREAM);
      b.boxY('solid', tx, y0 + 26, y0 + 27, -22.5, 6.2, 6.2, CREAM_D);
      b.boxY('solid', tx, y0 + 27, y0 + 32, -22.5, 4.2, 4.2, CREAM);
      for (const f of [-1, 1]) b.place('glow', archGeom(1.6, 3.2, 6), tx, y0 + 27.6, -22.5 + f * 2.12, 0x2e241c, { yaw: f < 0 ? 0 : Math.PI, ecol: WARM });
      b.cyl('solid', tx, y0 + 32, -22.5, 2.3, 2.3, 0.8, 12, CREAM_D);
      const dome = new THREE.SphereGeometry(2.2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      b.place('solid', dome, tx, y0 + 32.8, -22.5, TILE);
      b.cyl('solid', tx, y0 + 34.8, -22.5, 0.5, 0.2, 1.6, 8, CREAM_D);
      b.boxY('gold', tx, y0 + 36.3, y0 + 37.8, -22.5, 0.15, 0.15, 0xd7b35a);
      b.box('gold', tx, y0 + 37.3, -22.5, 0.8, 0.12, 0.12, 0xd7b35a);
      b.collider(tx, -22.5, 2.8, 2.8, 0, lo, y0 + 36);
    }
    b.collider(0, 4, 12, 27, 0, lo, y0 + 21);
  }
  const res2 = b.finish();
  const group = new THREE.Group(); group.add(res1.group, res2.group);
  return { name: 'missionDolores', group, colliders: [...res1.colliders, ...res2.colliders], update(dt, env) { res1.update(dt, env); } };
}

// ------------------------------------------------------------------------------------------ Castro Theatre blade sign
// Vertical "CASTRO" neon blade over a triangular marquee, on the theatre's Castro Street facade.
export function buildCastroSign({ x, z, yaw, heightAt, base }) {
  const kit = new Kit('castroSign', { x, z, yaw, heightAt });
  const y0 = base ?? kit.h(0, 0);
  const RED = 0xb8302a, CREAM = 0xf2e6c8;
  // marquee: V-shaped canopy with bulb rows
  const my = y0 + 4.2;
  for (const sg of [-1, 1]) {
    kit.beam('paint', [0, my, -3.2], [sg * 7, my, -0.2], 0.35, 1.6, CREAM);
    kit.beam('glow', [0, my + 0.95, -3.35], [sg * 7, my + 0.95, -0.35], 0.12, 0.2, 0xfff2cc, { ecol: [1.3, 1.0, 0.5] });
    kit.beam('glow', [0, my - 0.55, -3.35], [sg * 7, my - 0.55, -0.35], 0.12, 0.2, 0xfff2cc, { ecol: [1.3, 1.0, 0.5] });
  }
  kit.boxY('paint', 0, my - 0.8, my + 0.8, -1.6, 2.2, 3.2, CREAM);
  // blade: 16 m tall, projecting from the facade, letters stacked vertically on both faces
  const by0 = y0 + 6, by1 = y0 + 21;
  kit.boxY('paint', 0, by0, by1, -1.8, 0.7, 3.2, RED);
  kit.boxY('paint', 0, by1, by1 + 1.4, -1.8, 0.9, 2.4, CREAM);
  const word = 'CASTRO';
  for (let i = 0; i < word.length; i++) {
    const cy = by1 - 1.4 - i * 2.3;
    for (const f of [-1, 1]) kit.box('glow', f * 0.4, cy, -1.8, 0.1, 1.5, 1.3, 0xfbe7b0, { ecol: [1.5, 0.35, 0.15] });
  }
  for (const f of [-1, 1]) kit.boxY('glow', f * 0.4, by0 + 0.2, by1 - 0.2, -3.35, 0.12, 0.12, 0xfff2cc, { ecol: [1.2, 0.9, 0.45] });
  kit.collider(0, -1.8, 0.5, 1.8, 0, by0, by1 + 1.4);
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Chinatown Dragon Gate
// Grant Ave at Bush St (1970): three openings, green glazed-tile pagoda roofs, dragons + fish on the ridges.
export function buildDragonGate({ x, z, yaw, heightAt, span = 22 }) {
  const kit = new Kit('dragonGate', { x, z, yaw, heightAt });
  const y0 = Math.max(kit.h(-span / 2, 0), kit.h(span / 2, 0), kit.h(0, 0));
  const GREEN = 0x2f7a4b, GREEN_D = 0x1f5a36, RED = 0xa8241c, GOLD = 0xd6aa3c, STONE = 0xd8d2c4;
  const roof = (cx, y, w, d, rise) => {
    kit.gable('paint', 'paint', cx, 0, w / 2, d / 2, y, rise, RED, GREEN, { alongX: true, over: 0.9, th: 0.35 });
    // up-turned eave tips + ridge ornaments
    for (const sg of [-1, 1]) {
      kit.beam('paint', [cx + sg * (w / 2 + 0.3), y - 0.2, 0], [cx + sg * (w / 2 + 1.3), y + 0.7, 0], 0.4, d + 1.4, GREEN_D);
      kit.box('gold', cx + sg * (w / 2 - 0.4), y + rise + 0.45, 0, 0.9, 0.9, 0.3, GOLD);
    }
    kit.box('paint', cx, y + rise + 0.1, 0, w - 0.5, 0.35, 0.5, GREEN_D);
  };
  const hw = span / 2 + 3.5;
  // stone piers
  for (const px of [-hw, -span / 2 + 0.6, span / 2 - 0.6, hw]) {
    kit.boxY('solid', px, y0 - 1, y0 + 7.5, 0, 1.6, 1.6, STONE);
    kit.collider(px, 0, 0.8, 0.8, 0, y0 - 1, y0 + 12);
  }
  // central gate (over the roadway) + side gates (over the sidewalks)
  kit.boxY('paint', 0, y0 + 7.5, y0 + 9, 0, span + 1, 1.4, RED);
  kit.boxY('paint', 0, y0 + 9, y0 + 10.5, 0, span - 4, 0.7, GREEN_D);
  kit.boxY('glow', 0, y0 + 9.2, y0 + 10.3, -0.4, 5, 0.1, 0x173c2a, { ecol: [1.8, 1.4, 0.5] });   // plaque
  roof(0, y0 + 10.5, span - 2, 3.4, 2.2);
  for (const sg of [-1, 1]) {
    const cx = sg * (span / 2 + 1.75);
    kit.boxY('paint', cx, y0 + 5.5, y0 + 6.8, 0, 4.6, 1.2, RED);
    roof(cx, y0 + 6.8, 3.8, 2.6, 1.5);
  }
  // guardian lions
  for (const sg of [-1, 1]) {
    kit.boxY('solid', sg * (hw + 1.8), y0, y0 + 1.1, -1.5, 1.2, 1.6, STONE);
    kit.cyl('solid', sg * (hw + 1.8), y0 + 1.1, -1.5, 0.5, 0.35, 1.3, 8, 0x7c7a72);
  }
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Union Square Dewey column
// 1903 Dewey Monument: 29 m Corinthian granite column, bronze Victory with trident and wreath. Plus the four palms.
export function buildDeweyColumn({ x, z, heightAt }) {
  const kit = new Kit('unionSquare', { x, z, heightAt });
  const y0 = kit.h(0, 0), GRAN = 0xcfc9bd, GRAN_D = 0xa9a397, BRONZE = 0x5b4c32;
  kit.boxY('solid', 0, y0 - 0.5, y0 + 0.9, 0, 9, 9, GRAN_D);
  kit.boxY('solid', 0, y0 + 0.9, y0 + 1.8, 0, 7.4, 7.4, GRAN);
  kit.boxY('solid', 0, y0 + 1.8, y0 + 6, 0, 5, 5, GRAN);
  kit.boxY('solid', 0, y0 + 6, y0 + 6.8, 0, 5.6, 5.6, GRAN_D);
  kit.cyl('solid', 0, y0 + 6.8, 0, 1.25, 1.05, 18.5, 20, GRAN);
  kit.cyl('solid', 0, y0 + 25.3, 0, 1.05, 1.6, 1.4, 16, GRAN_D);                     // capital
  kit.boxY('solid', 0, y0 + 26.7, y0 + 27.3, 0, 3.3, 3.3, GRAN);
  kit.cyl('solid', 0, y0 + 27.3, 0, 1, 0.9, 1.6, 12, GRAN_D);
  // Victory: body, wings, raised wreath, trident
  kit.cyl('gold', 0, y0 + 28.9, 0, 0.45, 0.25, 2.6, 10, BRONZE);
  kit.cyl('gold', 0, y0 + 31.5, 0, 0.22, 0.22, 0.5, 8, BRONZE);
  for (const sg of [-1, 1]) kit.beam('gold', [sg * 0.2, y0 + 30.6, 0.2], [sg * 1.4, y0 + 32, 0.6], 0.12, 1.1, BRONZE);
  kit.rod('gold', [0.4, y0 + 30.4, 0], [0.9, y0 + 32.8, -0.1], 0.06, 5, BRONZE);
  kit.cyl('gold', 0.9, y0 + 32.9, -0.1, 0.35, 0.35, 0.08, 10, BRONZE, { rx: Math.PI / 2 });
  kit.rod('gold', [-0.4, y0 + 29, 0], [-0.55, y0 + 33.5, 0], 0.05, 5, BRONZE);
  kit.collider(0, 0, 4.5, 4.5, 0, y0 - 0.5, y0 + 7);
  // floodlights at the plinth corners
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box('glow', a * 3.6, y0 + 1.1, b * 3.6, 0.5, 0.35, 0.5, 0xfff0d0, { ecol: [2.5, 2.2, 1.6] });
  // palms at the square's corners
  const R = rng(39);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = a * 36, pz = b * 36, py = kit.h(px, pz), h = 11 + R() * 3;
    kit.cyl('solid', px, py, pz, 0.38, 0.28, h, 8, 0x7a6a55);
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * Math.PI * 2 + R();
      kit.beam('solid', [px, py + h, pz], [px + Math.cos(ang) * 3.6, py + h - 1.3, pz + Math.sin(ang) * 3.6], 0.9, 0.12, 0x3f6a2c);
    }
    kit.collider(px, pz, 0.4, 0.4, 0, py, py + h);
  }
  return kit.finish();
}

// ------------------------------------------------------------------------------------------ Alcatraz lighthouse + water tower
export function buildAlcatraz2({ light, tower, heightAt }) {
  const kit = new Kit('alcatraz2', { heightAt });
  const WHITE = 0xf0eee8;
  {
    const [x, z] = light, y0 = kit.heightAt(x, z);
    const ring = (r) => circleRing(r, 8);
    kit.geom('solid', loftGeom(ring(2.6), y0, ring(1.9), y0 + 20).translate(x, 0, z), null, WHITE);
    kit.cyl('solid', x, y0 + 20, z, 2.5, 2.5, 0.6, 8, 0x2e2e2e);
    kit.cyl('glow', x, y0 + 20.6, z, 1.5, 1.5, 2.6, 8, 0xfff6d8, { ecol: [5, 4.3, 2.8] });
    kit.cyl('solid', x, y0 + 23.2, z, 1.8, 0.2, 1.8, 8, 0x2e2e2e);
    kit.collider(x, z, 2.6, 2.6, 0, y0, y0 + 25);
  }
  {
    const [x, z] = tower, y0 = kit.heightAt(x, z), H = 28;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.beam('paint', [x + a * 4.5, y0, z + b * 4.5], [x + a * 3.4, y0 + H - 8, z + b * 3.4], 0.5, 0.5, 0xc9c1b0);
    for (let y = y0 + 5; y < y0 + H - 8; y += 6) kit.boxY('paint', x, y, y + 0.3, z, 8, 8, 0xb9b1a0);
    kit.cyl('paint', x, y0 + H - 8, z, 4.4, 4.4, 7, 16, 0xe2ddd0);
    kit.cyl('paint', x, y0 + H - 1, z, 4.6, 0.3, 2, 16, 0x9a2e22);
    kit.collider(x, z, 4.6, 4.6, 0, y0, y0 + H);
  }
  return kit.finish();
}
