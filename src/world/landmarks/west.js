// Palace of Fine Arts, Cliff House (+ Sutro Baths ruins), Sutro Tower, Hawk Hill vista.
import * as THREE from 'three';
import { LANDMARKS, GG_BRIDGE, bridgePoint } from '../anchors.js';
import { Kit, shade, prismGeom } from './kit.js';
import { foundation } from './downtown.js';

const WARM = [1.6, 1.15, 0.6];

// flat panel with an arched opening, extruded (thickness t) along +Z from 0..t; bottom at y=0, centred on x
function archFrameGeom(w, h, ow, oh, t) {
  const r = ow / 2, s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(-r, 0); s.lineTo(-r, oh - r);
  s.absarc(0, oh - r, r, Math.PI, 0, true);
  s.lineTo(r, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 10 });
}

// =====================================================================
export function buildPalaceOfFineArts({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.palaceFineArts, ...AO } : LANDMARKS.palaceFineArts;
  const kit = new Kit('palaceFineArts', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const R = A.radius;
  const STONE = 0xd8b596, STONE_D = 0xc09a7a, STONE_L = 0xe6caae, DOME = 0xcf8559;
  const f = foundation(kit, 'solid', 0, 0, R * 0.8, R * 0.8, 0xa58b73);
  const y0 = f.base, Y = (h) => y0 + h;
  // stepped octagonal platform
  kit.cyl('solid', 0, f.bot, 0, R + 1, R + 1, Y(0.6) - f.bot, 8, STONE_D, { yaw: Math.PI / 8 });
  kit.cyl('solid', 0, Y(0.6), 0, R, R, 0.6, 8, STONE, { yaw: Math.PI / 8 });
  // rotunda: 8 arched frames around an octagon (apothem 12)
  const ap = 12, side = 2 * ap * Math.tan(Math.PI / 8) + 0.4;
  const frame = archFrameGeom(side, 16, side - 3.6, 12.5, 2.4);
  frame.translate(0, 0, -1.2);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, nx = Math.sin(a), nz = Math.cos(a);
    kit.place('solid', frame, nx * ap, Y(1.2), nz * ap, STONE, { yaw: a });
    // pier pilasters at the octagon corners
    const ac = a + Math.PI / 8, rc = ap / Math.cos(Math.PI / 8);
    kit.boxY('solid', Math.sin(ac) * (rc + 0.3), Y(1.2), Y(16.4), Math.cos(ac) * (rc + 0.3), 2.2, 2.2, STONE_L, { yaw: ac });
  }
  kit.cyl('solid', 0, Y(16.8), 0, 14.4, 14.4, 1.6, 8, STONE_L, { yaw: Math.PI / 8 });
  kit.cyl('solid', 0, Y(18.4), 0, 13.2, 12.8, 3.2, 8, STONE, { yaw: Math.PI / 8 });
  kit.cyl('solid', 0, Y(21.6), 0, 13.4, 13.4, 0.6, 16, STONE_L);
  const dome = new THREE.SphereGeometry(12.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  kit.place('solid', dome, 0, Y(22.2), 0, DOME, { scale: [1, (33 - 22.2 - 0.8) / 12.6, 1] });
  // dome ribs + small lantern
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8; let prev = null;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6 * Math.PI / 2 * 0.92, r = 12.7 * Math.cos(t), y = Y(22.2) + 10 * Math.sin(t);
      const p = [Math.sin(a) * r, y + 0.1, Math.cos(a) * r];
      if (prev) kit.beam('solid', prev, p, 0.5, 0.3, shade(DOME, 0.85));
      prev = p;
    }
  }
  kit.cyl('solid', 0, Y(31.6), 0, 1.6, 1.2, 1.4, 8, STONE_L);
  // outer ring of columns with entablature and the "weeping women" planter boxes
  const nCol = 24, rc = R - 3.2;
  for (let i = 0; i < nCol; i++) {
    const a = i / nCol * Math.PI * 2;
    kit.cyl('solid', Math.sin(a) * rc, Y(1.2), Math.cos(a) * rc, 0.6, 0.52, 11.5, 8, STONE_L);
    const b = (i + 1) / nCol * Math.PI * 2;
    kit.beam('solid', [Math.sin(a) * rc, Y(13.3), Math.cos(a) * rc], [Math.sin(b) * rc, Y(13.3), Math.cos(b) * rc], 1.8, 1.6, STONE);
    if (i % 3 === 0) kit.boxY('solid', Math.sin(a) * rc, Y(14.1), Y(16.5), Math.cos(a) * rc, 1.9, 1.9, STONE_D, { yaw: a });
  }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, rr = ap / Math.cos(Math.PI / 8) + 0.3; kit.collider(Math.sin(a) * rr, Math.cos(a) * rr, 1.3, 1.3, a, f.bot, Y(33)); }
  for (let i = 0; i < nCol; i += 2) { const a = i / nCol * Math.PI * 2; kit.collider(Math.sin(a) * rc, Math.cos(a) * rc, 0.7, 0.7, a, f.bot, Y(16.5)); }
  // curved peristyle colonnade embracing the lagoon (centre of the arc is out in the lagoon, front = -Z)
  const Cz = -40, Rc = 58, spacing = 4.4;
  const nA = Math.floor((Rc * (70 - 22) * Math.PI / 180) / spacing);
  for (const sg of [-1, 1]) {
    let prevP = null;
    for (let k = 0; k <= nA; k++) {
      const th = sg * (22 + k / nA * 48) * Math.PI / 180;
      const px = Math.sin(th), pz = Math.cos(th);
      const cxm = px * Rc, czm = Cz + pz * Rc;
      const g = kit.h(cxm, czm);
      for (const dr of [-2.6, 2.6]) {
        kit.cyl('solid', px * (Rc + dr), g + 0.8, Cz + pz * (Rc + dr), 0.55, 0.48, 10.5, 8, STONE_L);
      }
      kit.boxY('solid', cxm, g - 1.5, g + 0.8, czm, spacing + 0.2, 7.2, STONE_D, { yaw: th });
      if (prevP) {
        const [qx, qz, qg] = prevP;
        kit.beam('solid', [qx, qg + 12.1, qz], [cxm, g + 12.1, czm], 7.2, 1.6, STONE, { up: [0, 1, 0] });
        kit.beam('solid', [qx, qg + 0.4, qz], [cxm, g + 0.4, czm], 7.0, 0.8, STONE_D);
        const mx = (qx + cxm) / 2, mz = (qz + czm) / 2;
        kit.collider(mx, mz, spacing / 2 + 0.2, 3.2, th, g - 1.5, g + 13);
      }
      if (k % 3 === 0) kit.boxY('solid', cxm, g + 12.9, g + 15.2, czm, 2.2, 5.6, STONE_D, { yaw: th });
      prevP = [cxm, czm, g];
    }
  }
  // lagoon: flat reflective water in front, in a low stone basin (level = highest ground under it + 0.3,
  // so the terrain never pokes through; the basin rim covers any gap down to lower ground)
  if (!A.noLagoon) {   // v2 has the real lagoon in the terrain
  const LX = 52, LZ = 26, LCZ = -52;
  let lgMax = -Infinity;
  for (let i = 0; i < 48; i++) for (const k of [0.3, 0.7, 1]) { const a = i / 48 * Math.PI * 2; lgMax = Math.max(lgMax, kit.h(Math.cos(a) * LX * k, LCZ + Math.sin(a) * LZ * k)); }
  const lg = lgMax + 0.3;
  kit.place('water', new THREE.CircleGeometry(1, 48), 0, lg, LCZ, 0xffffff, { rx: -Math.PI / 2, scale: [LX, LZ, 1] });
  for (let i = 0; i < 48; i++) {
    const a0 = i / 48 * Math.PI * 2, a1 = (i + 1) / 48 * Math.PI * 2;
    const p0 = [Math.cos(a0) * (LX + 0.6), LCZ + Math.sin(a0) * (LZ + 0.6)], p1 = [Math.cos(a1) * (LX + 0.6), LCZ + Math.sin(a1) * (LZ + 0.6)];
    const gmin = Math.min(kit.h(p0[0], p0[1]), kit.h(p1[0], p1[1]));
    const top = lg + 0.35, bot = gmin - 1;
    kit.beam('solid', [p0[0], (top + bot) / 2, p0[1]], [p1[0], (top + bot) / 2, p1[1]], 1.2, top - bot, 0xb8ab98);
  }
  }

  return kit.finish();
}

// =====================================================================
export function buildCliffHouse({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.cliffHouse, ...AO } : LANDMARKS.cliffHouse;
  const HX = 16, HZ = 8;
  // perch it on the cliff edge: march toward the ocean (front) until the ground drops away
  const fx = -Math.sin(A.yaw), fz = -Math.cos(A.yaw), g0 = heightAt(A.x, A.z);
  let px = A.x, pz = A.z;
  for (let d = 2; d <= 90; d += 2) {
    const y = heightAt(A.x + fx * d, A.z + fz * d);
    if (y < g0 - 4 || y < 0.5) { const back = Math.max(0, d - 4 - HZ); px = A.x + fx * back; pz = A.z + fz * back; break; }
  }
  const kit = new Kit('cliffHouse', { x: px, z: pz, yaw: A.yaw, heightAt });
  const WHITE = 0xf1f1ec, CONC = 0xa9a59c, GLASS = 0x33414c;
  const back = Math.max(kit.h(-HX, HZ), kit.h(HX, HZ), kit.h(0, HZ));
  const [lo] = kit.hRange(0, 0, HX, HZ + 4);
  const y0 = back, bot = Math.min(lo, 0) - 2;
  kit.boxY('solid', 0, bot, y0, -1, HX * 2, HZ * 2 + 2, CONC);                 // cliff substructure
  for (let x = -HX + 3; x <= HX - 2.9; x += 6.5) kit.boxY('solid', x, bot, y0, -HZ - 3.5, 1.4, 1.4, CONC); // deck piers
  kit.boxY('solid', 0, y0, y0 + 9, 0, HX * 2, HZ * 2, WHITE);
  kit.boxY('solid', 0, y0 + 9, y0 + 9.6, -0.5, HX * 2 + 2, HZ * 2 + 3, WHITE);  // roof overhang
  kit.boxY('solid', 0, y0 + 4.2, y0 + 4.8, -HZ - 0.6, HX * 2 + 0.4, 1.2, WHITE); // floor line / sunshade
  // big ocean-facing glass (front = local -Z = west)
  for (const [ya, yb] of [[0.6, 4.0], [5.0, 8.5]]) {
    kit.boxY('glow', 0, y0 + ya, y0 + yb, -HZ - 0.03, HX * 2 - 1.6, 0.1, GLASS, { ecol: WARM });
    for (let x = -HX + 0.8; x <= HX - 0.7; x += 3.2) kit.boxY('solid', x, y0 + ya, y0 + yb, -HZ - 0.1, 0.18, 0.16, WHITE);
  }
  for (const sg of [-1, 1]) kit.boxY('glow', sg * (HX + 0.03), y0 + 5, y0 + 8.5, -2, 0.1, 9, GLASS, { ecol: WARM });
  // cantilevered terrace
  kit.boxY('solid', 0, y0 - 0.6, y0 + 0.05, -HZ - 3, HX * 2 - 2, 6, WHITE);
  for (let x = -HX + 1; x <= HX - 1; x += 2) kit.boxY('solid', x, y0, y0 + 1.1, -HZ - 5.9, 0.08, 0.08, 0xdedede);
  kit.box('solid', 0, y0 + 1.1, -HZ - 5.9, HX * 2 - 2, 0.1, 0.12, 0xdedede);
  // street-side entrance canopy
  kit.boxY('solid', 4, y0 + 3.2, y0 + 3.5, HZ + 2, 8, 4, WHITE);
  kit.boxY('glow', 4, y0, y0 + 3, HZ + 0.03, 3.5, 0.1, GLASS, { ecol: WARM });
  kit.collider(0, -1, HX, HZ + 1, 0, bot, y0 + 9.6);
  // Sutro Baths ruins to the north (local +X), straddling the shoreline
  let oz = -30;
  for (let z = 0; z >= -120; z -= 3) if (kit.h(70, z) < 1.5) { oz = z - 8; break; }
  const ox = 70, rw = 60, rd = 30;
  const walls = [];
  for (const zz of [-rd / 2, rd / 2, -rd / 6, rd / 6]) walls.push([[ox - rw / 2, oz + zz], [ox + rw / 2, oz + zz]]);
  for (const xx of [-rw / 2, -rw / 6, rw / 6, rw / 2]) walls.push([[ox + xx, oz - rd / 2], [ox + xx, oz + rd / 2]]);
  walls.push([[ox - rw / 2 - 12, oz - 2], [ox - rw / 2, oz - 2]]);
  let wi = 0;
  for (const [a, b] of walls) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(len / 7);
    for (let k = 0; k < n; k++) {
      if ((wi++ * 7) % 5 === 3) continue; // gaps: it's a ruin
      const t0 = k / n, t1 = (k + 1) / n;
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const g0 = kit.h(p0[0], p0[1]), g1 = kit.h(p1[0], p1[1]);
      const gl = Math.min(g0, g1), top = Math.max(g0, g1, 0.3) + 1.2 + ((wi * 37) % 7) * 0.2;
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      const yaw = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
      kit.boxY('solid', mx, gl - 1.5, top, mz, len / n, 0.9, (wi % 3) ? 0x9c968b : 0x8a8479, { yaw });
      kit.collider(mx, mz, len / n / 2, 0.45, yaw, gl - 1.5, top);
    }
  }
  return kit.finish();
}

// =====================================================================
export function buildSutroTower({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.sutroTower, ...AO } : LANDMARKS.sutroTower;
  const kit = new Kit('sutroTower', { x: A.x, z: A.z, yaw: 0.2, heightAt });
  const H = A.height, RED = 0xc8322b, WHITE = 0xf2f0ec;
  const y0 = kit.h(0, 0);
  const Rb = 24, Rl = 16.5, Ru = 11, yl = 0.4 * H, yu = 0.72 * H;
  const legs = [0, 1, 2].map((i) => { const a = i / 3 * Math.PI * 2 + Math.PI / 2; return [Math.cos(a), Math.sin(a)]; });
  const seg = (a, b, w0, w1) => {
    // banded segment from a to b, split into ~9 m pieces with alternating colours
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.round(len / 9));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const w = w0 + (w1 - w0) * (t0 + t1) / 2;
      kit.beam('paint', p(t0), p(t1), w, w, (Math.floor((a[1] + (b[1] - a[1]) * (t0 + t1) / 2 - y0) / 9) % 2 === 0) ? RED : WHITE);
    }
  };
  const P = (r, [cx, cz], y) => [cx * r, y, cz * r];
  for (const L of legs) {
    const gy = kit.h(L[0] * Rb, L[1] * Rb);
    kit.boxY('solid', L[0] * Rb, Math.min(gy, y0) - 2, gy + 1.2, L[1] * Rb, 5, 5, 0x9d9990);
    kit.collider(L[0] * Rb, L[1] * Rb, 2.5, 2.5, 0, Math.min(gy, y0) - 2, y0 + yl);
    seg(P(Rb, L, gy + 1.2), P(Rl, L, y0 + yl), 3.0, 2.5);
    seg(P(Rl, L, y0 + yl), P(Ru, L, y0 + yu), 2.5, 2.0);
    seg(P(Ru, L, y0 + yu), P(Ru * 0.9, L, y0 + H - 6), 1.8, 1.2);
    kit.rod('paint', P(Ru * 0.9, L, y0 + H - 6), P(Ru * 0.9, L, y0 + H), 0.25, 6, WHITE);
    kit.box('blink', L[0] * Ru * 0.9, y0 + H + 0.2, L[1] * Ru * 0.9, 0.7, 0.7, 0.7, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
    kit.box('blink', L[0] * (Ru + 5.5), y0 + yu + 1.8, L[1] * (Ru + 5.5), 0.6, 0.6, 0.6, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
  }
  // crossbar trusses at two levels (the upper one with outrigger arms), + small antenna panels
  for (const [r, y, arm] of [[Rl, y0 + yl, 0], [Ru, y0 + yu, 6]]) {
    for (let i = 0; i < 3; i++) {
      const a = legs[i], b = legs[(i + 1) % 3];
      for (const dy of [-1.6, 1.6]) seg(P(r, a, y + dy), P(r, b, y + dy), 1.1, 1.1);
      for (let k = 0; k < 6; k++) {
        const t0 = k / 6, t1 = (k + 1) / 6;
        const pa = [a[0] * r + (b[0] - a[0]) * r * t0, y + (k % 2 ? 1.6 : -1.6), a[1] * r + (b[1] - a[1]) * r * t0];
        const pb = [a[0] * r + (b[0] - a[0]) * r * t1, y + (k % 2 ? -1.6 : 1.6), a[1] * r + (b[1] - a[1]) * r * t1];
        kit.beam('paint', pa, pb, 0.45, 0.45, WHITE);
      }
      if (arm) {
        seg(P(r, a, y + 1.6), P(r + arm, a, y + 1.6), 1.0, 0.8);
        seg(P(r, a, y - 1.6), P(r + arm, a, y + 1.6), 0.7, 0.7);
        for (let k = 0; k < 3; k++) kit.boxY('paint', a[0] * (r + 2 + k * 1.6), y + 2.3, y + 5.5, a[1] * (r + 2 + k * 1.6), 0.6, 0.6, 0xe0e0e0);
      }
    }
  }
  // antenna panels on the masts
  for (const L of legs) for (let y = y0 + yu + 8; y < y0 + H - 10; y += 7) kit.box('paint', L[0] * (Ru * 0.95 + 1.2), y, L[1] * (Ru * 0.95 + 1.2), 1.4, 3.2, 0.5, 0xd9d9d9, { yaw: Math.atan2(L[0], L[1]) });
  // transmitter building between the legs
  const [blo, bhi] = kit.hRange(0, 0, 9, 5);
  kit.boxY('solid', 0, blo - 2, bhi + 6, 0, 18, 10, 0xb9b4a8);
  kit.boxY('solid', 0, bhi + 6, bhi + 6.5, 0, 18.6, 10.6, 0x8f8b84);
  kit.collider(0, 0, 9, 5, 0, blo - 2, bhi + 6.5);
  return kit.finish();
}

// =====================================================================
export function buildHawkHill({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.hawkHill, ...AO } : LANDMARKS.hawkHill;
  const [bx, bz] = bridgePoint(GG_BRIDGE, GG_BRIDGE.length * 0.5, 0);
  const yaw = Math.atan2(-(bx - A.x), -(bz - A.z));   // platform front faces the bridge
  const kit = new Kit('hawkHill', { x: A.x, z: A.z, yaw, heightAt });
  const CONC = 0xa8a49a, CONC_D = 0x8d897f;
  const f = foundation(kit, 'solid', 0, 0, 8, 4.5, CONC_D);
  const y = f.base;
  kit.boxY('solid', 0, y - 0.1, y + 0.25, 0, 16, 9, CONC);
  for (let x = -7.8; x <= 7.81; x += 1.3) kit.boxY('paint', x, y + 0.25, y + 1.2, -4.4, 0.08, 0.08, 0x3d4a3f);
  kit.box('paint', 0, y + 1.2, -4.4, 15.8, 0.1, 0.12, 0x3d4a3f);
  kit.box('paint', 0, y + 0.7, -4.4, 15.8, 0.06, 0.06, 0x3d4a3f);
  kit.collider(0, -4.4, 8, 0.2, 0, y - 1, y + 1.2);
  // Battery Spencer style gun-battery walls with emplacement arcs
  for (const [cx, cz] of [[-20, 8], [18, 12]]) {
    const g = kit.h(cx, cz), [wlo] = kit.hRange(cx, cz, 9, 1);
    kit.boxY('solid', cx, wlo - 2, g + 2.2, cz, 18, 1.6, CONC_D);
    kit.boxY('solid', cx, g + 2.2, g + 2.6, cz, 18.4, 2.0, CONC);
    kit.collider(cx, cz, 9, 0.8, 0, wlo - 2, g + 2.6);
    let prev = null;
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI + k / 8 * Math.PI, p = [cx + Math.cos(a) * 5, cz - 0.8 + Math.sin(a) * 5];
      if (prev) {
        const gg = kit.h((p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2);
        kit.beam('solid', [prev[0], gg + 0.6, prev[1]], [p[0], gg + 0.6, p[1]], 0.9, 2.4, CONC);
      }
      prev = p;
    }
    kit.boxY('solid', cx + 4, g, g + 1.8, cz - 0.82, 1.3, 0.06, 0x1d1d1d);
  }
  // sign post
  const sx = 10, sz = 3, sg = kit.h(sx, sz);
  for (const d of [-1.1, 1.1]) kit.boxY('solid', sx + d, sg - 0.8, sg + 2.3, sz, 0.18, 0.18, 0x5a4330);
  kit.boxY('solid', sx, sg + 1.1, sg + 2.2, sz, 2.8, 0.1, 0x6b4a2e);
  kit.boxY('solid', sx, sg + 1.25, sg + 2.05, sz - 0.06, 2.4, 0.02, 0xe6dcc3);
  kit.collider(sx, sz, 1.4, 0.2, 0, sg - 0.8, sg + 2.3);
  return kit.finish();
}
export { archFrameGeom, prismGeom };
