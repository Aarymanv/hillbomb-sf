// City Hall, Grace Cathedral, Coit Tower, Painted Ladies.
import * as THREE from 'three';
import { LANDMARKS } from '../anchors.js';
import { Kit, shade, loftGeom, archGeom, gothicGeom, prismGeom, flutedRing, rng, winLit } from './kit.js';
import { foundation } from './downtown.js';

const WARM = [1.6, 1.15, 0.6];
const DARKWIN = 0x2c333b;

// =====================================================================
export function buildCityHall({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.cityHall, ...AO } : LANDMARKS.cityHall;
  const kit = new Kit('cityHall', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const HW = A.width / 2, HD = A.depth / 2;
  const GR = 0xcbc7bd, GR_D = 0xb3aea3, GR_L = 0xdcd8cf;
  const RW = rng(11);
  const f = foundation(kit, 'solid', 0, 0, HW + 1, HD + 6, 0x9f9a90);
  const y0 = f.base;
  const Y = (h) => y0 + h;
  // main block: rusticated base, piano nobile, attic, cornice + balustrade
  kit.boxY('solid', 0, Y(0), Y(21), 0, HW * 2, HD * 2, GR);
  kit.boxY('solid', 0, Y(0), Y(6), 0, HW * 2 + 0.6, HD * 2 + 0.6, GR_D);
  kit.boxY('solid', 0, Y(6), Y(6.6), 0, HW * 2 + 1, HD * 2 + 1, GR_L);
  kit.boxY('solid', 0, Y(17.6), Y(18.4), 0, HW * 2 + 1.2, HD * 2 + 1.2, GR_L);
  kit.boxY('solid', 0, Y(21), Y(21.8), 0, HW * 2 + 1.4, HD * 2 + 1.4, GR_L);
  kit.boxY('solid', 0, Y(21.8), Y(23), 0, HW * 2 + 0.4, HD * 2 + 0.4, GR_D);
  // windows on all four faces (3 upper floors + base)
  const floors = [[2.2, 2.6], [8.3, 2.8], [12.6, 2.8], [19.0, 1.4]];
  const faceRows = [[[0, -1], HW, HD], [[0, 1], HW, HD], [[-1, 0], HD, HW], [[1, 0], HD, HW]];
  for (const [[nx, nz], along, off] of faceRows) {
    const tx = nz, tz = -nx;
    for (let u = -along + 3; u <= along - 2.9; u += 3.2) {
      if (nz < 0 && Math.abs(u) < 14) continue; // portico
      for (const [yy, hh] of floors) {
        const px = nx * (off + 0.02) + tx * u, pz = nz * (off + 0.02) + tz * u;
        kit.box('glow', px, Y(yy + hh / 2), pz, nx ? 0.1 : 1.3, hh, nz ? 0.1 : 1.3, DARKWIN, { ecol: winLit(RW, WARM, 0.45) });
      }
    }
  }
  // giant colonnade across the front (floors 2-3) and on the end pavilions
  for (let x = -HW + 8; x <= HW - 7.9; x += 3.2) {
    if (Math.abs(x) < 15) continue;
    kit.cyl('solid', x - 1.6, Y(6.6), -HD - 1.2, 0.6, 0.52, 11, 8, GR_L);
  }
  kit.boxY('solid', 0, Y(17.6), Y(18.6), -HD - 1.2, HW * 2 - 12, 1.8, GR_L);
  for (const sg of [-1, 1]) {           // end pavilions
    kit.boxY('solid', sg * (HW - 3.5), Y(0), Y(24.5), 0, 7.5, HD * 2 + 2.4, GR);
    kit.boxY('solid', sg * (HW - 3.5), Y(24.5), Y(25.3), 0, 8.3, HD * 2 + 3.2, GR_L);
  }
  // central pavilion + pedimented portico + steps
  kit.boxY('solid', 0, Y(0), Y(6.6), -HD - 2.2, 30, 6.4, GR_D);            // projecting base under the portico
  kit.boxY('solid', 0, Y(6.0), Y(6.6), -HD - 2.2, 30.6, 7, GR_L);
  kit.boxY('solid', 0, Y(6.6), Y(25), -HD - 1, 28, 4, GR);
  for (let i = 0; i < 6; i++) kit.cyl('solid', -10 + i * 4, Y(6.6), -HD - 4.2, 0.85, 0.75, 15, 10, GR_L);
  kit.boxY('solid', 0, Y(21.6), Y(24), -HD - 3.4, 26, 3.6, GR_L);
  kit.gable('solid', 'solid', 0, -HD - 3.2, 13.4, 2.0, Y(24), 4.6, GR, GR_D, { over: 0.4, th: 0.6 });
  for (let k = 0; k < 4; k++) kit.boxY('solid', 0, f.bot, Y(1.2 - 0.3 * k), -HD - 5.4 - 1.2 * k - 0.6, 30 + 2 * k, 1.2, GR_D);
  kit.place('glow', archGeom(3.4, 4.8, 6), 0, Y(1.2), -HD - 5.43, DARKWIN, { yaw: Math.PI, ecol: WARM });
  for (const sx of [-7, 7]) kit.place('glow', archGeom(2.4, 4.0, 6), sx, Y(1.2), -HD - 5.43, DARKWIN, { yaw: Math.PI, ecol: WARM });
  kit.place('glow', archGeom(3.0, 6.5, 6), 0, Y(8.5), -HD - 3.03, DARKWIN, { yaw: Math.PI, ecol: WARM });
  // ---- dome assembly ----
  const DT = A.domeTopY;
  kit.boxY('solid', 0, Y(23), Y(28), 0, 36, 36, GR);
  kit.boxY('solid', 0, Y(28), Y(28.8), 0, 37, 37, GR_L);
  kit.cyl('solid', 0, Y(28.8), 0, 11.6, 11.6, 10.4, 28, GR_D);
  for (let i = 0; i < 28; i++) {                       // drum colonnade
    const a = i / 28 * Math.PI * 2;
    kit.cyl('solid', Math.cos(a) * 12.8, Y(29.3), Math.sin(a) * 12.8, 0.5, 0.44, 8.8, 8, GR_L);
    kit.box('glow', Math.cos(a + Math.PI / 28) * 11.64, Y(33.6), Math.sin(a + Math.PI / 28) * 11.64, 0.1, 4.4, 1.1, DARKWIN, { yaw: -a - Math.PI / 28, ecol: [1.8, 1.3, 0.7] });
  }
  kit.cyl('solid', 0, Y(28.8), 0, 13.8, 13.8, 0.5, 28, GR_L);
  kit.cyl('solid', 0, Y(38.1), 0, 13.9, 13.9, 1.4, 28, GR_L);
  kit.cyl('solid', 0, Y(39.5), 0, 12.1, 12.1, 1.0, 28, GR_D);
  kit.cyl('solid', 0, Y(40.5), 0, 10.6, 10.6, 2.4, 28, GR);
  kit.cyl('solid', 0, Y(42.9), 0, 10.2, 10.2, 0.6, 28, GR_L);
  const domeB = 43.5, domeR = 9.7;
  const domeH = DT - 6.2 - domeB;
  const dome = new THREE.SphereGeometry(domeR, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  kit.place('glow', dome, 0, Y(domeB), 0, 0x8a9b97, { scale: [1, domeH / domeR, 1], ecol: [0.2, 0.17, 0.11] });
  for (let i = 0; i < 16; i++) {                       // gilded ribs
    const a = i / 16 * Math.PI * 2; let prev = null;
    for (let k = 0; k <= 7; k++) {
      const t = k / 7 * Math.PI / 2 * 0.93, r = (domeR + 0.06) * Math.cos(t), y = Y(domeB) + domeH * Math.sin(t) + 0.05;
      const p = [Math.cos(a) * r, y, Math.sin(a) * r];
      if (prev) kit.beam('gold', prev, p, 0.32, 0.22, 0xd7b35a);
      prev = p;
    }
  }
  // lantern
  const L0 = Y(domeB + domeH - 0.5);
  kit.cyl('solid', 0, L0, 0, 2.6, 2.4, 3.0, 12, GR_L);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; kit.box('glow', Math.cos(a) * 2.55, L0 + 1.6, Math.sin(a) * 2.55, 0.1, 1.9, 0.8, DARKWIN, { yaw: -a, ecol: [2.4, 1.9, 1.1] }); }
  const cap = new THREE.SphereGeometry(2.6, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  kit.place('gold', cap, 0, L0 + 3.0, 0, 0xd9b45c, { scale: [1, 0.8, 1] });
  kit.cyl('gold', 0, L0 + 5.0, 0, 0.45, 0.05, Y(DT) - (L0 + 5.0), 6, 0xe0bd66);
  kit.collider(0, 0, HW + 0.8, HD + 0.8, 0, f.bot, Y(DT));
  kit.collider(0, -HD - 2.8, 15, 2.8, 0, f.bot, Y(25));
  kit.collider(0, -HD - 7.8, 18, 2.4, 0, f.bot, Y(1.2));
  return kit.finish();
}

// =====================================================================
export function buildGraceCathedral({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.graceCathedral, ...AO } : LANDMARKS.graceCathedral;
  const kit = new Kit('graceCathedral', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const ST = 0xc9c7c1, ST_D = 0xaeaba4, ST_L = 0xd9d7d1, ROOF = 0x75807b;
  // the front (north) sits at street level; on a slope the rest stands on a stone podium
  const [flo, fhi] = kit.hRange(0, -14, 21, 9);
  const [plo] = kit.hRange(0, 13, 21, 36);
  const y0 = Math.max(fhi, flo + 0.5), f = { base: y0, bot: Math.min(plo, y0) - 2 };
  kit.boxY('solid', 0, f.bot, y0 + 0.02, 13, 42.6, 72.6, 0x96928b);
  kit.boxY('solid', 0, y0 - 0.5, y0 + 0.1, 13, 43.4, 73.4, 0xb4b0a8);
  for (let y = y0 - 3; y > f.bot + 1; y -= 2.6) kit.boxY('solid', 0, y - 0.12, y + 0.12, 13, 42.8, 72.8, 0x87837c); // rustication
  const Y = (h) => y0 + h;
  const z0 = -22, z1 = 40;                    // nave front / back
  const GLASS = (x, y, z) => { const k = Math.abs(Math.sin(x * 1.7 + y * 0.9 + z * 1.3)); return k > 0.66 ? [0.2, 0.35, 1.2] : k > 0.33 ? [1.1, 0.18, 0.16] : [1.05, 0.8, 0.22]; };
  // nave + gable roof
  kit.boxY('solid', 0, Y(0), Y(22), (z0 + z1) / 2, 14, z1 - z0, ST);
  kit.gable('solid', 'solid', 0, (z0 + z1) / 2, 7, (z1 - z0) / 2, Y(22), 8, ST, ROOF, { over: 0.6, th: 0.4 });
  // aisles with lean-to roofs, buttresses, flying buttresses, windows
  for (const sg of [-1, 1]) {
    kit.boxY('solid', sg * 9.5, Y(0), Y(11), (z0 + 11 + z1) / 2, 5, z1 - z0 - 11, ST_D);
    kit.box('solid', sg * 9.6, Y(12), (z0 + 11 + z1) / 2, 6.2, 0.35, z1 - z0 - 11 + 0.6, ROOF, { rz: -sg * 0.38 });
    for (let z = z0 + 13; z < z1 - 1; z += 6) {
      if (z > 16 && z < 32) continue; // transept
      kit.boxY('solid', sg * 12.6, Y(0), Y(12.5), z, 1.3, 1.8, ST_L);
      kit.cyl('solid', sg * 12.6, Y(12.5), z, 0.7, 0.05, 2.5, 4, ST_L);
      kit.beam('solid', [sg * 12.4, Y(11.2), z], [sg * 7.2, Y(18.5), z], 0.8, 0.9, ST_L);
      kit.place('glow', gothicGeom(1.6, 4.6, 4), sg * 12.03, Y(3), z + 3, 0x30343c, { yaw: sg * Math.PI / 2, ecol: GLASS });
      kit.place('glow', gothicGeom(2.0, 5.2, 4), sg * 7.03, Y(14), z + 3, 0x30343c, { yaw: sg * Math.PI / 2, ecol: GLASS });
    }
  }
  // transept
  kit.boxY('solid', 0, Y(0), Y(22), 24, 40, 12, ST);
  kit.gable('solid', 'solid', 0, 24, 6, 20, Y(22), 7.5, ST, ROOF, { alongX: true, over: 0.6, th: 0.4 });
  for (const sg of [-1, 1]) {
    kit.place('glow', new THREE.CircleGeometry(3, 16), sg * 20.03, Y(15), 24, 0x30343c, { yaw: sg * Math.PI / 2, ecol: GLASS });
    kit.place('glow', gothicGeom(3, 8, 5), sg * 20.03, Y(2), 24, 0x30343c, { yaw: sg * Math.PI / 2, ecol: [0.9, 0.62, 0.32] });
  }
  // flèche over the crossing
  kit.cyl('solid', 0, Y(28), 24, 2.2, 2.0, 4, 8, ST_L);
  kit.cyl('solid', 0, Y(32), 24, 2.0, 0.08, 14, 8, ROOF);
  // polygonal apse
  const apse = [];
  for (let i = 0; i <= 6; i++) { const a = -i / 6 * Math.PI; apse.push([Math.cos(a) * 7, -Math.sin(a) * 7]); }
  const ring = apse.map(([x, z]) => [x, z]);
  // ring runs x: 7 -> -7 through +z (south); clockwise in (x,z) math plane when traversed 7->... -> -7 with z>0
  const apseRing = ring.slice().reverse();
  kit.geom('solid', loftGeom(apseRing.map(([x, z]) => [x, z + z1]), Y(0), apseRing.map(([x, z]) => [x, z + z1]), Y(20), { closed: false }), null, ST);
  const apseRoof = loftGeom(apseRing.map(([x, z]) => [x * 1.05, z * 1.05 + z1]), Y(20), apseRing.map(([x, z]) => [x * 0.05, z * 0.05 + z1]), Y(28), { closed: false });
  kit.geom('solid', apseRoof, null, ROOF);
  for (let i = 1; i < 6; i++) { const a = i / 6 * Math.PI; kit.place('glow', gothicGeom(1.8, 7, 4), Math.cos(a) * 6.9, Y(8), z1 + Math.sin(a) * 6.9, 0x30343c, { yaw: Math.atan2(Math.cos(a), Math.sin(a)), ecol: GLASS }); }
  // west-work: two square bell towers and the rose-window facade (front = -Z)
  for (const sg of [-1, 1]) {
    const tx = sg * 10.5, tz = z0 + 5.5;
    kit.boxY('solid', tx, Y(0), Y(38), tz, 11, 11, ST);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      kit.boxY('solid', tx + cx * 5.4, Y(0), Y(36.5), tz + cz * 5.4, 1.5, 1.5, ST_L);
      kit.cyl('solid', tx + cx * 5.2, Y(38.6), tz + cz * 5.2, 0.8, 0.05, 4.2, 4, ST_L, { yaw: Math.PI / 4 });
    }
    kit.boxY('solid', tx, Y(38), Y(38.6), tz, 11.8, 11.8, ST_L);
    kit.boxY('solid', tx, Y(24), Y(24.6), tz, 11.6, 11.6, ST_L);
    for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      for (const k of [-1.6, 1.6]) {
        const px = tx + nx * 5.53 + (nz ? k : 0), pz = tz + nz * 5.53 + (nx ? k : 0);
        kit.place('glow', gothicGeom(1.9, 10, 4), px, Y(26), pz, 0x23272d, { yaw: Math.atan2(nx, nz), ecol: [0.22, 0.16, 0.08] });
      }
    }
    kit.place('glow', gothicGeom(2.6, 6, 5), tx, Y(0.2), z0 - 0.03, 0x3a2a20, { yaw: Math.PI, ecol: [0.9, 0.62, 0.32] });
    kit.collider(tx, tz, 5.8, 5.8, 0, f.bot, Y(40));
  }
  // centre facade (between the towers) with rose window and main portal
  kit.boxY('solid', 0, Y(0), Y(22), z0 + 0.5, 10, 1, ST_L);
  kit.boxY('solid', 0, Y(0.2), Y(10.5), z0 - 0.3, 8, 0.6, ST_D);
  kit.place('glow', gothicGeom(4.6, 9.4, 6), 0, Y(0.2), z0 - 0.63, 0x3a2a20, { yaw: Math.PI, ecol: [0.9, 0.62, 0.32] });
  kit.place('solid', new THREE.RingGeometry(4.2, 4.9, 24), 0, Y(16), z0 - 0.02, ST_L, { yaw: Math.PI });
  const rose = new THREE.CircleGeometry(4.25, 24, 0, Math.PI * 2);
  const roseCol = (x, y) => { const r = Math.hypot(x, y - Y(16)), a = Math.atan2(y - Y(16), x); const petal = Math.cos(a * 12) > 0.3; return r < 1.2 ? [1.2, 0.9, 0.25] : petal ? [0.18, 0.3, 1.3] : [1.15, 0.16, 0.2]; };
  kit.place('glow', rose, 0, Y(16), z0 - 0.04, 0x39414f, { yaw: Math.PI, ecol: roseCol });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; kit.beam('solid', [0, Y(16), z0 - 0.08], [Math.cos(a) * 4.2, Y(16) + Math.sin(a) * 4.2, z0 - 0.08], 0.22, 0.12, ST_L, { up: [0, 0, 1] }); }
  kit.collider(0, (z0 + z1) / 2 + 2, 12.8, (z1 - z0) / 2 + 5, 0, f.bot, Y(29));
  kit.collider(0, 24, 20, 6, 0, f.bot, Y(29));
  return kit.finish();
}

// =====================================================================
export function buildCoitTower({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.coit, ...AO } : LANDMARKS.coit;
  // snap onto the local summit of Telegraph Hill (search 40 m around the anchor)
  let cx0 = A.x, cz0 = A.z, cy0 = heightAt(A.x, A.z);
  for (let dx = -40; dx <= 40; dx += 2) for (let dz = -40; dz <= 40; dz += 2) {
    if (dx * dx + dz * dz > 1600) continue;
    const y = heightAt(A.x + dx, A.z + dz); if (y > cy0 + 0.25) { cy0 = y; cx0 = A.x + dx; cz0 = A.z + dz; }
  }
  const kit = new Kit('coit', { x: cx0, z: cz0, yaw: A.yaw, heightAt });
  const R = A.radius, H = A.height;
  const WHITE = 0xe6dfcf, BEIGE = 0xd6ccb6, BEIGE_D = 0xbdb29b;
  const y0 = kit.h(0, 0);
  const [lo] = kit.hRange(0, 0, 11, 11);
  const bot = Math.min(lo, y0) - 2;
  // base building: two tiers with arched loggia
  kit.boxY('solid', 0, bot, y0 + 5, 0, 22, 22, BEIGE);
  kit.boxY('solid', 0, y0 + 5, y0 + 5.6, 0, 22.8, 22.8, BEIGE_D);
  kit.boxY('solid', 0, y0 + 5.6, y0 + 7.4, 0, 16, 16, BEIGE);
  for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    for (let k = -3; k <= 3; k++) {
      const tx = nz, tz = -nx;
      kit.place('glow', archGeom(1.7, 3.4, 5), nx * 11.02 + tx * k * 2.9, y0 + 0.5, nz * 11.02 + tz * k * 2.9, 0x3a342e, { yaw: Math.atan2(nx, nz), ecol: WARM });
    }
  }
  // fluted shaft
  const shaft = loftGeom(flutedRing(R, 0.35, 20), y0 + 5, flutedRing(R * 0.985, 0.35, 20), y0 + H - 2.2);
  kit.geom('solid', shaft, null, WHITE);
  // observation level arches
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
    kit.place('glow', archGeom(1.5, 3.6, 5), nx * (R * 0.985 + 0.02), y0 + H - 7.2, nz * (R * 0.985 + 0.02), 0x2b2b2b, { yaw: Math.atan2(nx, nz), ecol: [1.8, 1.4, 0.8] });
  }
  kit.cyl('solid', 0, y0 + H - 2.2, 0, R + 0.35, R + 0.35, 0.9, 24, BEIGE);
  kit.cyl('solid', 0, y0 + H - 1.3, 0, R * 0.92, R * 0.92, 1.3, 24, WHITE);
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; kit.box('solid', Math.cos(a) * R * 0.9, y0 + H + 0.3, Math.sin(a) * R * 0.9, 0.8, 0.6, 0.8, WHITE, { yaw: -a }); }
  kit.cyl('solid', 0, y0 + H - 0.1, 0, R * 0.7, R * 0.7, 0.4, 16, BEIGE_D);
  // Pioneer Park parking circle (west of the tower), with the statue in the middle
  const cx = -24, cz = 2;
  kit.drape('solid', new THREE.RingGeometry(5, 13, 28, 1), cx, cz, 0.09, 0x3a3b3e);
  kit.drape('solid', new THREE.CircleGeometry(5, 20), cx, cz, 0.12, 0x5c7d45);
  kit.drape('solid', new THREE.PlaneGeometry(10, 12, 2, 2), -12, 0, 0.1, 0x3a3b3e);
  const sy = kit.h(cx, cz);
  kit.boxY('solid', cx, sy - 1, sy + 2.2, cz, 1.4, 1.4, BEIGE_D);
  kit.cyl('solid', cx, sy + 2.2, cz, 0.35, 0.3, 2.2, 6, 0x6f6a5f);
  kit.collider(0, 0, 11, 11, 0, bot, y0 + H + 1);
  kit.collider(cx, cz, 0.8, 0.8, 0, sy - 1, sy + 4.4);
  return kit.finish();
}

// =====================================================================
const LADIES = [
  // body, trim, accent
  [0xa9d8c0, 0xfbf7ee, 0x7a3b4a], // mint
  [0xa9c6e3, 0xfdfbf4, 0x2d4a6e], // powder blue
  [0xf3dc8a, 0xffffff, 0x3e6b56], // butter yellow
  [0xf1b7c2, 0xfffaf3, 0x6e2f45], // pink
  [0xc6b4dc, 0xfbf8f1, 0x4f3a6b], // lavender
  [0xf6c3a0, 0xfefaf1, 0x7c4428], // peach
  [0x8fc9b5, 0xf6f1e3, 0x8a3b2f], // sea-green
];
export function buildPaintedLadies({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.paintedLadies, ...AO } : LANDMARKS.paintedLadies;
  const kit = new Kit('paintedLadies', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const n = A.count, LW = A.lotWidth, W = LW - 0.25, D = 15, hw = W / 2;
  const ROOF = 0x4a4a52, BASE = 0x8f8a82;
  const RW = rng(23);
  const bay = prismGeom([[-1.8, 0], [1.8, 0], [1.15, 1.0], [-1.15, 1.0]], 7.2);
  bay.rotateX(-Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const [body, trim, accent] = LADIES[i % LADIES.length];
    const cx = -(i + 0.5) * LW;              // along the row (local +X = north, so going south = -X)
    const cz = D / 2;                       // front facade at local z = 0, facing -Z (west)
    const [lo] = kit.hRange(cx, cz, hw, D / 2);
    const g = Math.max(kit.h(cx - hw, 0), kit.h(cx + hw, 0), kit.h(cx, 0));   // street level at the front
    const bot = Math.min(lo, g) - 2;
    const Y = (h) => g + h;
    kit.boxY('solid', cx, bot, Y(2.2), cz, W, D, BASE);                    // raised basement
    kit.boxY('solid', cx, Y(2.2), Y(9.4), cz, W, D, body);
    // cornice bands
    kit.boxY('solid', cx, Y(2.1), Y(2.45), -0.12, W + 0.1, 0.35, trim);
    kit.boxY('solid', cx, Y(5.7), Y(6.05), -0.15, W + 0.1, 0.4, trim);
    kit.boxY('solid', cx, Y(9.3), Y(10.0), -0.35, W + 0.5, 0.8, trim);
    kit.boxY('solid', cx, Y(9.5), Y(9.8), -0.5, W + 0.6, 0.25, accent);
    for (let k = 0; k < 6; k++) kit.box('solid', cx - hw + 0.5 + k * (W - 1) / 5, Y(9.1), -0.25, 0.25, 0.45, 0.4, trim);
    // steep front gable (ridge runs front-to-back) + roof
    kit.gable('solid', 'solid', cx, cz, hw, D / 2, Y(10.0), 5.2, body, ROOF, { over: 0.45, th: 0.28 });
    kit.beam('solid', [cx - hw - 0.1, Y(10.0), -0.18], [cx, Y(15.2), -0.18], 0.35, 0.35, trim, { up: [0, 0, 1] });
    kit.beam('solid', [cx + hw + 0.1, Y(10.0), -0.18], [cx, Y(15.2), -0.18], 0.35, 0.35, trim, { up: [0, 0, 1] });
    kit.box('solid', cx, Y(10.05), -0.15, W, 0.3, 0.3, trim);
    kit.place('solid', archGeom(1.6, 2.5, 5), cx, Y(11.0), -0.05, trim, { yaw: Math.PI, scale: [1.25, 1.12, 1] });
    kit.place('glow', archGeom(1.3, 2.3, 5), cx, Y(11.1), -0.09, DARKWIN, { yaw: Math.PI, ecol: winLit(RW, WARM, 0.35) });
    // fish-scale shingle band inside the gable (accent colour)
    kit.box('solid', cx, Y(10.6), -0.08, W * 0.8, 0.35, 0.12, accent);
    // two-storey angled bay window (left of the entry)
    const bx = cx + hw - 2.4;                         // local +X side = north end of each lot
    kit.place('solid', bay, bx, Y(2.2), 0, body);
    kit.box('solid', bx, Y(9.45), -0.5, 3.9, 0.3, 1.25, trim);
    kit.box('solid', bx, Y(2.25), -0.5, 3.9, 0.3, 1.25, trim);
    for (const fy of [3.1, 6.6]) {
      kit.box('solid', bx, Y(fy + 1.0), -1.03, 1.9, 2.3, 0.08, trim);
      kit.box('glow', bx, Y(fy + 1.0), -1.06, 1.5, 1.95, 0.06, DARKWIN, { ecol: winLit(RW, WARM, 0.35) });
      for (const s of [-1, 1]) {
        const a = [bx + s * 1.75, Y(fy + 1.0), -0.08 - 0.02], b = [bx + s * 1.2, Y(fy + 1.0), -0.95];
        const nx = s * 1.0, nz = -0.7, nl = Math.hypot(nx, nz), ox = nx / nl * 0.06, oz = nz / nl * 0.06;
        kit.beam('glow', [a[0] + ox, a[1], a[2] + oz], [b[0] + ox, b[1], b[2] + oz], 0.05, 1.9, DARKWIN, { ecol: winLit(RW, WARM, 0.35) });
      }
    }
    // entry side: door + transom at floor 1, window above
    const dx = cx - hw + 1.5;
    kit.box('solid', dx, Y(3.6), -0.08, 1.7, 3.0, 0.15, trim);
    kit.box('solid', dx, Y(3.45), -0.14, 1.2, 2.5, 0.1, accent);
    kit.box('glow', dx, Y(4.95), -0.16, 1.1, 0.35, 0.06, DARKWIN, { ecol: winLit(RW, WARM, 0.35) });
    kit.box('solid', dx, Y(7.6), -0.08, 1.6, 2.5, 0.12, trim);
    kit.box('glow', dx, Y(7.6), -0.15, 1.2, 2.1, 0.06, DARKWIN, { ecol: winLit(RW, WARM, 0.35) });
    // porch hood over the door
    kit.gable('solid', 'solid', dx, -0.7, 1.1, 0.7, Y(5.3), 0.9, trim, accent, { over: 0.15, th: 0.12 });
    kit.cyl('solid', dx - 0.95, Y(2.2), -1.25, 0.1, 0.1, 3.1, 6, trim);
    kit.cyl('solid', dx + 0.95, Y(2.2), -1.25, 0.1, 0.1, 3.1, 6, trim);
    // stoop: steps from the sidewalk up to the entry
    const nSteps = 7, rise = 2.2 / nSteps;
    for (let k = 0; k < nSteps; k++) {
      const zf = -1.4 - (nSteps - 1 - k) * 0.33;
      kit.boxY('solid', dx, Math.min(bot, g - 0.5), Y((k + 1) * rise), (zf + 0) / 2, 1.8, Math.abs(zf), k === nSteps - 1 ? trim : shade(trim, 0.85));
    }
    kit.beam('solid', [dx - 0.95, Y(1.0), -3.4], [dx - 0.95, Y(3.2), -1.3], 0.08, 0.08, accent);
    kit.beam('solid', [dx + 0.95, Y(1.0), -3.4], [dx + 0.95, Y(3.2), -1.3], 0.08, 0.08, accent);
    // side windows on the basement / garage level
    kit.box('solid', cx + 0.6, Y(1.1), -0.05, 2.6, 1.8, 0.1, accent);
    kit.collider(cx, D / 2 - 0.6, hw, D / 2 + 0.6, 0, bot, Y(15.2));
    kit.collider(dx, -2.1, 0.95, 1.3, 0, bot, Y(2.2));
  }
  return kit.finish();
}
