// Alcatraz, the ballpark (Oracle-style, unbranded), Fisherman's Wharf sign.
import * as THREE from 'three';
import { LANDMARKS } from '../anchors.js';
import { Kit, shade, makeCanvas, canvasTex, archGeom } from './kit.js';

const WARM = [1.6, 1.15, 0.6];
const DARKWIN = 0x2c333b;

// =====================================================================
export function buildAlcatraz({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.alcatraz, ...AO } : LANDMARKS.alcatraz;
  const kit = new Kit('alcatraz', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const CONC = 0xd3cdbf, CONC_D = 0xb4ad9d, RUST = 0x9b6a45;
  // find the island's high point (the engine provides the terrain)
  let best = [0, 0, -Infinity];
  for (let x = -140; x <= 140; x += 5) for (let z = -70; z <= 70; z += 5) { const h = kit.h(x, z); if (h > best[2]) best = [x, z, h]; }
  const [hx0, hz0] = best;
  const onLand = (x, z) => kit.h(x, z) > 1.5;
  // ---- cellhouse (long 3-storey concrete block on the summit), long axis = local X ----
  const CL = 36, CW = 12;
  const [clo, chi] = kit.hRange(hx0, hz0, CL, CW);
  const cy = chi, cbot = Math.min(clo, 0) - 2;
  kit.boxY('solid', hx0, cbot, cy + 12, hz0, CL * 2, CW * 2, CONC);
  kit.boxY('solid', hx0, cy + 12, cy + 12.6, hz0, CL * 2 + 0.6, CW * 2 + 0.6, CONC_D);
  for (let x = -CL + 4; x <= CL - 3.9; x += 4) for (const sg of [-1, 1]) {
    kit.boxY('glow', hx0 + x, cy + 2, cy + 10.5, hz0 + sg * (CW + 0.03), 1.6, 0.08, 0x3a3f44, { ecol: [0.35, 0.3, 0.2] });
    for (let b = -0.5; b <= 0.51; b += 0.5) kit.boxY('solid', hx0 + x + b, cy + 2, cy + 10.5, hz0 + sg * (CW + 0.09), 0.07, 0.06, 0x2a2a2a);
  }
  for (let x = -CL + 8; x <= CL - 8; x += 12) kit.boxY('solid', hx0 + x, cy + 12.6, cy + 14.2, hz0, 6, 10, CONC_D); // roof monitors
  // administration wing (lower, at the -X end, toward the city side)
  kit.boxY('solid', hx0 - CL - 6, cbot, cy + 8, hz0 + 2, 12, 18, shade(CONC, 0.95));
  for (let z = -5; z <= 9; z += 3.5) kit.boxY('glow', hx0 - CL - 12.03, cy + 2, cy + 6.5, hz0 + z, 0.08, 1.5, DARKWIN, { ecol: [0.8, 0.65, 0.4] });
  kit.collider(hx0, hz0, CL, CW, 0, cbot, cy + 14.2);
  kit.collider(hx0 - CL - 6, hz0 + 2, 6, 9, 0, cbot, cy + 8);
  // ---- lighthouse next to the admin end ----
  const lx = hx0 - CL - 6, lz = hz0 + 20;
  const lg = Math.min(kit.h(lx, lz), cy);
  const LH = cy + 22;
  kit.cyl('solid', lx, lg - 2, lz, 2.0, 1.6, LH - lg + 2, 8, 0xe7e2d6);
  kit.cyl('solid', lx, LH, lz, 2.6, 2.6, 0.4, 8, 0x3b3b3b);
  kit.cyl('glow', lx, LH + 0.4, lz, 1.4, 1.4, 2.2, 8, 0xfff2cf, { ecol: [3.2, 2.8, 2.0] });
  kit.cyl('solid', lx, LH + 2.6, lz, 1.6, 0.2, 1.4, 8, 0x6d2a22);
  kit.collider(lx, lz, 2, 2, 0, lg - 2, LH + 4);
  // rotating beam (separate mesh, additive, fades toward the far end)
  const bl = 110, beamG = new THREE.ConeGeometry(7, bl, 16, 1, true);
  beamG.translate(0, -bl / 2, 0); beamG.rotateZ(Math.PI / 2);   // apex at the origin, opening toward +X
  const bc = new Float32Array(beamG.attributes.position.count * 3);
  for (let i = 0; i < beamG.attributes.position.count; i++) { const x = beamG.attributes.position.getX(i); const k = Math.max(0, 1 - x / bl); bc[i * 3] = k; bc[i * 3 + 1] = k * 0.95; bc[i * 3 + 2] = k * 0.8; }
  beamG.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  beamMat.name = 'lm-lighthouse-beam';
  const beamPivot = new THREE.Group(); beamPivot.position.set(lx, LH + 1.5, lz);
  const b1 = new THREE.Mesh(beamG, beamMat), b2 = new THREE.Mesh(beamG, beamMat);
  b2.rotation.y = Math.PI; b1.name = b2.name = 'alcatraz:beam';
  beamPivot.add(b1, b2); beamPivot.visible = false; kit.add(beamPivot);
  kit.onUpdate((dt, env) => {
    const night = env.night || 0;
    beamPivot.visible = night > 0.02;
    beamMat.opacity = 0.22 * night;
    beamPivot.rotation.y = (env.time || 0) * 0.9;
  });
  // ---- water tower on legs (at the +X end of the island) ----
  let wx = hx0 + CL + 14, wz = hz0 - 12;
  if (!onLand(wx, wz)) { wx = hx0 + CL + 4; wz = hz0 - 20; }
  const wg = kit.h(wx, wz), WT = wg + 16;
  for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
    kit.boxY('paint', wx + dx, Math.min(wg, kit.h(wx + dx, wz + dz)) - 1, WT, wz + dz, 0.5, 0.5, 0x8e8a80);
    kit.collider(wx + dx, wz + dz, 0.3, 0.3, 0, wg - 1, WT);
  }
  for (const y of [wg + 5, wg + 10.5]) for (const [a, b] of [[[-3.5, -3.5], [3.5, -3.5]], [[3.5, -3.5], [3.5, 3.5]], [[3.5, 3.5], [-3.5, 3.5]], [[-3.5, 3.5], [-3.5, -3.5]]]) {
    kit.beam('paint', [wx + a[0], y, wz + a[1]], [wx + b[0], y, wz + b[1]], 0.25, 0.25, 0x8e8a80);
    kit.beam('paint', [wx + a[0], y - 5, wz + a[1]], [wx + b[0], y, wz + b[1]], 0.12, 0.12, 0x8e8a80);
  }
  kit.cyl('paint', wx, WT, wz, 5.2, 5.2, 7, 16, (x, y) => (y < WT + 1.2 ? RUST : 0xd9d3c5));
  kit.cyl('paint', wx, WT + 7, wz, 5.4, 0.3, 2.2, 16, 0x9a958a);
  // ---- dock + Building 64 at the shore toward the city ----
  const dir = [0.35, 0.94];                         // local march direction (toward the SF side)
  let sx = hx0, sz = hz0;
  for (let k = 0; k < 60; k++) { const nx = sx + dir[0] * 3, nz = sz + dir[1] * 3; if (kit.h(nx, nz) < 2.5) break; sx = nx; sz = nz; }
  const byaw = Math.atan2(dir[0], dir[1]);          // front of the dock building faces the water
  const BX = sx - dir[0] * 8, BZ = sz - dir[1] * 8;
  const [dlo, dhi] = kit.hRange(BX, BZ, 18, 6, byaw);
  const dy0 = Math.max(dlo, 1.5), dbot = Math.min(dlo, 0) - 2;   // sits at the waterline; its back cuts into the slope
  kit.boxY('solid', BX, dbot, dy0 + 10, BZ, 36, 12, 0xd9ccaa, { yaw: byaw });
  kit.boxY('solid', BX, dy0 + 10, dy0 + 10.6, BZ, 36.6, 12.6, 0xa89e86, { yaw: byaw });
  const cB = Math.cos(byaw), sB = Math.sin(byaw);
  const toK = (u, v) => [BX + cB * u + sB * v, BZ - sB * u + cB * v];
  for (let u = -16; u <= 16; u += 3.2) for (const yy of [2, 5.5, 8.5]) {
    const [px, pz] = toK(u, 6.03);
    kit.box('glow', px, dy0 + yy, pz, 1.1, 1.6, 0.08, DARKWIN, { yaw: byaw, ecol: [0.5, 0.4, 0.25] });
  }
  { const [px, pz] = toK(0, 6.1); kit.box('solid', px, dy0 + 7.1, pz, 26, 1.1, 0.1, 0xefe9da, { yaw: byaw }); } // faded sign band
  { const [px, pz] = toK(0, 6.16); for (let k = -11; k <= 11; k++) kit.box('solid', px + cB * k * 1.0, dy0 + 7.1, pz - sB * k * 1.0, 0.55, 0.6, 0.04, 0x2b2b2b, { yaw: byaw }); }
  kit.collider(BX, BZ, 18, 6, byaw, dbot, dy0 + 10.6);
  // pier into the water
  const [pxc, pzc] = toK(0, 16);
  kit.boxY('solid', pxc, 1.0, 1.6, pzc, 30, 14, 0x6b5a48, { yaw: byaw });
  for (let u = -14; u <= 14; u += 4) for (const v of [10, 16, 22]) { const [px, pz] = toK(u, v); kit.boxY('solid', px, -3, 1.0, pz, 0.5, 0.5, 0x4c4035); }
  kit.collider(pxc, pzc, 15, 7, byaw, -3, 1.6);
  return kit.finish();
}

// =====================================================================
export function buildBallpark({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.oraclePark, ...AO } : LANDMARKS.oraclePark;
  const kit = new Kit('ballpark', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const BRICK = 0x80321f, BRICK_D = 0x652619, SEAT = 0x1f4f3c, CONC = 0xb9b5ad, GRASS = 0x4f8a3a, DIRT = 0xa8744a;
  const y0 = kit.h(0, 0);
  const [lo] = kit.hRange(0, 0, 90, 90);
  const deep = Math.min(lo, y0) - 2;
  const HP = [0, 50];                                    // home plate (local x,z); centre field toward -Z
  const s2 = Math.SQRT1_2;
  const dL = [-s2, -s2], dR = [s2, -s2], nL = [-s2, s2], nR = [s2, s2];
  const LF = 72, RF = 66, OFF = 12;
  // ---- stands path: left foul line -> arc behind home -> right foul line ----
  const path = [];
  for (let t = LF; t >= 0; t -= 6) path.push([HP[0] + dL[0] * t + nL[0] * OFF, HP[1] + dL[1] * t + nL[1] * OFF, nL]);
  const aL = Math.atan2(nL[1], nL[0]), aR = Math.atan2(nR[1], nR[0]);
  for (let k = 1; k < 8; k++) { const a = aL + (aR - aL) * k / 8; const n = [Math.cos(a), Math.sin(a)]; path.push([HP[0] + n[0] * OFF, HP[1] + n[1] * OFF, n]); }
  for (let t = 0; t <= RF + 0.01; t += 6) path.push([HP[0] + dR[0] * t + nR[0] * OFF, HP[1] + dR[1] * t + nR[1] * OFF, nR]);
  // cross-section (d outward, y up, colour of the face that follows the point)
  const prof = [[0, -1, 0x2e5d3f], [0, 1.4, CONC], [1.2, 1.6, SEAT], [20, 13, CONC], [23.5, 13, CONC], [23.5, 16, SEAT], [36, 27, CONC], [36.5, 27.8, BRICK], [38.5, 27.8, BRICK], [38.5, deep - y0, BRICK]];
  const pos = [], colr = [];
  const c3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const P3 = (i, j) => { const [px, pz, n] = path[i]; const [d, y] = prof[j]; return [px + n[0] * d, y0 + y, pz + n[1] * d]; };
  for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < prof.length - 1; j++) {
    const a = P3(i, j), b = P3(i, j + 1), c = P3(i + 1, j), d = P3(i + 1, j + 1);
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    const cc = c3(prof[j][2]); for (let k = 0; k < 6; k++) colr.push(...cc);
  }
  // end caps
  for (const i of [0, path.length - 1]) {
    const pts2 = prof.map(([d, y]) => new THREE.Vector2(d, y)); pts2.push(new THREE.Vector2(0, deep - y0));
    const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
    const [px, pz, n] = path[i];
    for (const t of tris) for (const tt of [t, [t[0], t[2], t[1]]]) {   // both windings (cheap, avoids a DoubleSide material)
      const q = tt.map((k) => [px + n[0] * pts2[k].x, y0 + pts2[k].y, pz + n[1] * pts2[k].x]);
      pos.push(...q[0], ...q[1], ...q[2]); const cc = c3(CONC); for (let k = 0; k < 3; k++) colr.push(...cc);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.computeVertexNormals();
  const fn = (() => { let k = 0; return () => { const c = [colr[k], colr[k + 1], colr[k + 2]]; k += 3; return c; }; })();
  kit.geom('solid', sg, null, fn);
  // arcade openings on the brick facade, brick piers, cornice + colliders
  const arch1 = archGeom(3.0, 5.2, 6), arch2 = archGeom(2.2, 3.4, 5);
  for (let i = 0; i < path.length - 1; i++) {
    const [px, pz, n] = path[i], [qx, qz, n2] = path[i + 1];
    const nm = [(n[0] + n2[0]) / 2, (n[1] + n2[1]) / 2], nl = Math.hypot(nm[0], nm[1]); nm[0] /= nl; nm[1] /= nl;
    const mx = (px + qx) / 2 + nm[0] * 38.53, mz = (pz + qz) / 2 + nm[1] * 38.53, yaw = Math.atan2(nm[0], nm[1]);
    kit.place('glow', arch1, mx, y0 + 0.3, mz, DARKWIN, { yaw, ecol: WARM });
    for (const yy of [8.5, 15.5, 22]) kit.place('glow', arch2, mx, y0 + yy, mz, DARKWIN, { yaw, ecol: WARM });
    // brick pier at the segment joint + string courses
    const jx = px + n[0] * 38.6, jz = pz + n[1] * 38.6;
    kit.boxY('solid', jx, y0, y0 + 27.6, jz, 1.1, 0.5, BRICK_D, { yaw: Math.atan2(n[0], n[1]) });
    for (const yy of [6.8, 13.8, 20.6]) kit.beam('solid', [px + n[0] * 38.62, y0 + yy, pz + n[1] * 38.62], [qx + n2[0] * 38.62, y0 + yy, qz + n2[1] * 38.62], 0.35, 0.45, 0x9d8f7c);
    kit.beam('solid', [px + n[0] * 38.3, y0 + 28.2, pz + n[1] * 38.3], [qx + n2[0] * 38.3, y0 + 28.2, qz + n2[1] * 38.3], 1.6, 0.8, 0xa59886);
    const len = Math.hypot(qx - px, qz - pz), cx = (px + qx) / 2 + nm[0] * 19, cz = (pz + qz) / 2 + nm[1] * 19;
    kit.collider(cx, cz, len / 2 + 0.5, 19.5, Math.atan2(-(qz - pz), qx - px), deep, y0 + 29);
  }
  // clock tower at the main (home plate) entrance
  { const k = Math.floor(path.length / 2), [px, pz, n] = path[k], tx = px + n[0] * 41, tz = pz + n[1] * 41, yaw = Math.atan2(n[0], n[1]);
    kit.boxY('solid', tx, deep, y0 + 36, tz, 8, 8, BRICK, { yaw });
    kit.boxY('solid', tx, y0 + 36, y0 + 37, tz, 9, 9, 0xa59886, { yaw });
    kit.cyl('solid', tx, y0 + 37, tz, 4.2, 0.4, 5, 4, 0x3f5a4a, { yaw: yaw + Math.PI / 4 });
    kit.place('glow', new THREE.CircleGeometry(2.2, 20), tx + n[0] * 4.03, y0 + 31, tz + n[1] * 4.03, 0xf1ecdf, { yaw, ecol: [2.2, 2.0, 1.5] });
    kit.place('glow', archGeom(3.6, 7, 6), tx + n[0] * 4.03, y0, tz + n[1] * 4.03, DARKWIN, { yaw, ecol: WARM });
    kit.collider(tx, tz, 4, 4, yaw, deep, y0 + 42);
  }
  const towers = [2, Math.floor(path.length * 0.3), Math.floor(path.length * 0.5), Math.floor(path.length * 0.7), path.length - 3];
  for (const i of towers) {
    const [px, pz, n] = path[i], tx = px + n[0] * 40, tz = pz + n[1] * 40, yaw = Math.atan2(n[0], n[1]);
    kit.boxY('paint', tx, deep, y0 + 46, tz, 1.4, 1.4, 0x9ea3a6);
    kit.box('paint', tx - n[0] * 0.6, y0 + 47.5, tz - n[1] * 0.6, 8, 4, 0.8, 0x9ea3a6, { yaw });
    kit.box('glow', tx - n[0] * 1.05, y0 + 47.5, tz - n[1] * 1.05, 7.4, 3.4, 0.1, 0xe8e8e2, { yaw, ecol: [3, 3, 2.7] });
    kit.collider(tx, tz, 0.8, 0.8, 0, deep, y0 + 50);
  }
  // ---- field (fair + foul territory) ----
  const lfPole = [HP[0] + dL[0] * LF, HP[1] + dL[1] * LF], rfPole = [HP[0] + dR[0] * RF, HP[1] + dR[1] * RF];
  const cf = [HP[0], HP[1] - 88], ctrl = [2 * cf[0] - (lfPole[0] + rfPole[0]) / 2, 2 * cf[1] - (lfPole[1] + rfPole[1]) / 2];
  const wallPts = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16, u = 1 - t; wallPts.push([u * u * lfPole[0] + 2 * u * t * ctrl[0] + t * t * rfPole[0], u * u * lfPole[1] + 2 * u * t * ctrl[1] + t * t * rfPole[1]]); }
  const fieldPts = wallPts.map((p) => p);
  for (let i = path.length - 1; i >= 0; i--) fieldPts.push([path[i][0], path[i][1]]);
  const shape = new THREE.Shape(fieldPts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const fg = new THREE.ShapeGeometry(shape); fg.rotateX(-Math.PI / 2);
  kit.geom('solid', fg, new THREE.Matrix4().makeTranslation(0, y0 + 0.06, 0), GRASS);
  { // field foundation: the field outline extruded down to below the lowest ground
    const fx = new THREE.ExtrudeGeometry(shape, { depth: y0 - 0.03 - deep, bevelEnabled: false, curveSegments: 2 });
    fx.rotateX(-Math.PI / 2);
    kit.geom('solid', fx, new THREE.Matrix4().makeTranslation(0, deep, 0), 0x77756f);
  }
  const dia = new THREE.PlaneGeometry(22, 22); dia.rotateX(-Math.PI / 2); dia.rotateY(Math.PI / 4);
  kit.geom('solid', dia, new THREE.Matrix4().makeTranslation(HP[0], y0 + 0.09, HP[1] - 15.5), DIRT);
  const inner = new THREE.PlaneGeometry(15, 15); inner.rotateX(-Math.PI / 2); inner.rotateY(Math.PI / 4);
  kit.geom('solid', inner, new THREE.Matrix4().makeTranslation(HP[0], y0 + 0.12, HP[1] - 15.5), GRASS);
  const mound = new THREE.CircleGeometry(2.4, 12); mound.rotateX(-Math.PI / 2);
  kit.geom('solid', mound, new THREE.Matrix4().makeTranslation(HP[0], y0 + 0.2, HP[1] - 13.5), DIRT);
  // outfield wall (+ higher brick wall in right field on the water)
  for (let k = 0; k < wallPts.length - 1; k++) {
    const a = wallPts[k], b = wallPts[k + 1], rf = k >= 11;
    const h = rf ? 7 : 3, col = rf ? BRICK_D : 0x2e5d3f;
    kit.beam('solid', [a[0], y0 + h / 2, a[1]], [b[0], y0 + h / 2, b[1]], 0.8, h, col);
    const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    kit.collider((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, 0.4, yaw, deep, y0 + h);
  }
  // left/centre bleachers behind the wall
  for (let k = 0; k < 10; k++) {
    const a = wallPts[k], b = wallPts[k + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz), nx = tz / tl, nz = -tx / tl; // outward (away from home)
    const yaw = Math.atan2(nx, nz);
    for (let r = 0; r < 4; r++) kit.box('solid', mx + nx * (2 + r * 2.2), y0 + 1.5 + r * 1.4, mz + nz * (2 + r * 2.2), tl + 0.3, 1.4 + r * 0 + 0.2, 2.3, r % 2 ? SEAT : shade(SEAT, 1.2), { yaw });
  }
  // scoreboard in right-centre
  { const a = wallPts[12], sx = a[0] * 1.12, sz = HP[1] + (a[1] - HP[1]) * 1.12; const yaw = Math.atan2(sx - HP[0], sz - HP[1]);
    for (const d of [-8, 8]) { const px = sx + Math.cos(yaw) * d, pz = sz - Math.sin(yaw) * d; kit.boxY('paint', px, y0, y0 + 14, pz, 1, 1, 0x3a3a3a); kit.collider(px, pz, 0.6, 0.6, 0, deep, y0 + 14); }
    kit.box('paint', sx, y0 + 19, sz, 24, 11, 1.4, 0x2b2b2b, { yaw });
    kit.box('glow', sx - Math.sin(yaw) * 0.72, y0 + 19, sz - Math.cos(yaw) * 0.72, 22, 9, 0.05, 0x1c2630, { yaw, ecol: [0.9, 1.1, 1.3] });
  }
  // ---- the giant glove + the bottle slide, beyond left field in the corner facing the bay ----
  const cn = [dL[0] * 0.72 + 0 * 0.28, dL[1] * 0.72 - 0.28], cl = Math.hypot(cn[0], cn[1]);
  const gp = [HP[0] + cn[0] / cl * 100, HP[1] + cn[1] / cl * 100];
  const gyaw = Math.atan2(HP[0] - gp[0], HP[1] - gp[1]);           // glove opens toward home plate
  const gg = kit.h(gp[0], gp[1]);
  const GL = 0xa8743d, GL_D = 0x7d5429;
  kit.boxY('solid', gp[0], Math.min(gg, y0) - 1, y0 + 1.5, gp[1], 13, 8, CONC, { yaw: gyaw });
  const cG = Math.cos(gyaw), sGw = Math.sin(gyaw);
  const GS = 1.5;
  const toG = (u, y, v) => [gp[0] + (cG * u + sGw * v) * GS, y0 + 1.5 + y * GS, gp[1] + (-sGw * u + cG * v) * GS];
  const palm = new THREE.SphereGeometry(1, 14, 10);
  { const [x, y, z] = toG(0, 5, 0); kit.place('solid', palm, x, y, z, GL, { yaw: gyaw, rx: -0.3, scale: [4.2 * GS, 5.2 * GS, 1.9 * GS] }); }
  const finger = new THREE.CapsuleGeometry(1.05, 4.6, 4, 8);
  [-2.7, -0.9, 0.9, 2.7].forEach((u, i) => { const [x, y, z] = toG(u * 1.02, 10.3 - Math.abs(u) * 0.35, -1.3); kit.place('solid', finger, x, y, z, i % 2 ? GL : shade(GL, 0.94), { yaw: gyaw, rx: -0.45, rz: -u * 0.07, scale: GS }); });
  { const [x, y, z] = toG(4.8, 5.5, -0.8); kit.place('solid', finger, x, y, z, GL, { yaw: gyaw, rx: -0.3, rz: -0.75, scale: GS }); }
  { const [x, y, z] = toG(3.5, 8.5, -1.6); kit.box('solid', x, y, z, 2.6 * GS, 3.2 * GS, 0.4 * GS, GL_D, { yaw: gyaw, rx: -0.4 }); }
  for (let k = 0; k < 5; k++) { const [x, y, z] = toG(-3 + k * 1.5, 2.2, -1.8); kit.box('solid', x, y, z, 0.9, 0.25, 0.25, 0x3b2a1a, { yaw: gyaw }); }
  kit.collider(gp[0], gp[1], 6.5, 4, gyaw, deep, y0 + 20);
  // bottle (lathe) + two helical slides
  const bp = [gp[0] + cG * 20, gp[1] - sGw * 20];
  const bg = kit.h(bp[0], bp[1]);
  kit.cyl('solid', bp[0], Math.min(bg, y0) - 1, bp[1], 5.5, 5.5, y0 + 1 - Math.min(bg, y0) + 1, 16, CONC);
  const prof2 = [[0.01, 0], [3.1, 0], [3.5, 1.5], [3.7, 6.5], [3.1, 9.5], [3.5, 11.5], [3.4, 13.5], [2.2, 16.5], [1.3, 19.5], [1.1, 21.5], [1.25, 22], [1.25, 23.2], [0.01, 23.3]];
  const lathe = new THREE.LatheGeometry(prof2.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  kit.geom('solid', lathe, new THREE.Matrix4().makeTranslation(bp[0], y0 + 1, bp[1]), (x, y) => ((y > y0 + 8 && y < y0 + 11) ? 0xf2efe8 : (y > y0 + 22 ? 0xd8d8d8 : 0xa3261f)));
  for (const ph of [0, Math.PI]) {
    let prev = null;
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, a = ph + t * Math.PI * 4, y = y0 + 17 - t * 15.5;
      const p = [bp[0] + Math.cos(a) * 5.4, y, bp[1] + Math.sin(a) * 5.4];
      if (prev) kit.rod('paint', prev, p, 0.85, 6, ph ? 0xe8c02e : 0x2f6fb3);
      prev = p;
    }
  }
  kit.collider(bp[0], bp[1], 5.5, 5.5, 0, deep, y0 + 24);
  return kit.finish();
}

// =====================================================================
let fwTex = null;
function wharfTexture() {
  if (fwTex !== null) return fwTex;
  const S = 512, c = makeCanvas(S, S);
  if (!c) return (fwTex = undefined);
  const g = c.getContext('2d'), R = S / 2;
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#1d4f8f'; g.beginPath(); g.arc(R, R, R * 0.99, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#eef3f6'; g.beginPath(); g.arc(R, R, R * 0.66, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2d06b'; g.lineWidth = 6; g.beginPath(); g.arc(R, R, R * 0.66, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(R, R, R * 0.96, 0, Math.PI * 2); g.stroke();
  // text on an arc, letters spaced by their measured widths; top = reads clockwise, bottom = counter-clockwise
  const arcText = (txt, rad, centre, bottom, size) => {
    g.font = `bold ${size}px Georgia, 'Times New Roman', serif`; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const track = size * 0.06, ws = [...txt].map((ch) => g.measureText(ch).width + track);
    const total = ws.reduce((x, y) => x + y, 0);
    let acc = -total / 2;
    for (let i = 0; i < txt.length; i++) {
      const mid = acc + ws[i] / 2; acc += ws[i];
      const a = bottom ? centre - mid / rad : centre + mid / rad;
      g.save(); g.translate(R + Math.cos(a) * rad, R + Math.sin(a) * rad); g.rotate(bottom ? a - Math.PI / 2 : a + Math.PI / 2); g.fillText(txt[i], 0, 0); g.restore();
    }
  };
  arcText("FISHERMAN'S WHARF", R * 0.815, Math.PI * 1.5, false, 42);
  arcText('SAN FRANCISCO', R * 0.815, Math.PI * 0.5, true, 38);
  // the crab
  g.save(); g.translate(R, R * 1.05);
  g.strokeStyle = '#c8452d'; g.lineWidth = 9; g.lineCap = 'round';
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    g.beginPath(); g.moveTo(s * 40, 5 + k * 10); g.quadraticCurveTo(s * (80 + k * 6), -10 + k * 22, s * (95 + k * 4), 40 + k * 16); g.stroke();
  }
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 45, -20); g.quadraticCurveTo(s * 80, -70, s * 70, -105); g.stroke();
    g.fillStyle = '#d4492f'; g.beginPath(); g.ellipse(s * 72, -118, 22, 30, s * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#eef3f6'; g.beginPath(); g.moveTo(s * 72, -118); g.lineTo(s * 60, -150); g.lineTo(s * 84, -145); g.fill();
  }
  g.fillStyle = '#d4492f'; g.beginPath(); g.ellipse(0, 10, 62, 44, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e9765c'; g.beginPath(); g.ellipse(-12, -2, 30, 16, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#222'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 16, -40, 7, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#d4492f'; g.lineWidth = 5; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 14, -28); g.lineTo(s * 16, -38); g.stroke(); }
  g.restore();
  fwTex = canvasTex(c, { repeat: false });
  return fwTex;
}
export function buildWharfSign({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.fishermansWharfSign, ...AO } : LANDMARKS.fishermansWharfSign;
  const kit = new Kit('wharfSign', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const y0 = kit.h(0, 0), [lo] = kit.hRange(0, 0, 1, 1);
  const cy = y0 + 7.4, R = 2.7, WOOD = 0x6b4424, POLE = 0x1f3f5f;
  kit.cyl('solid', 0, Math.min(lo, y0) - 1, 0, 0.9, 0.9, y0 + 0.4 - Math.min(lo, y0) + 1, 10, 0x8e8a82);
  kit.boxY('paint', 0, y0 + 0.4, cy - R + 0.2, 0, 0.36, 0.36, POLE);
  const tex = wharfTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex || null, emissiveMap: tex || null, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, color: tex ? 0xffffff : 0x1d4f8f });
  mat.name = 'lm-wharfsign'; mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -4;
  kit.register('fwsign', mat, {});
  const face = new THREE.CircleGeometry(R, 40);
  kit.place('fwsign', face, 0, cy, 0.19, 0xffffff);
  kit.place('fwsign', face, 0, cy, -0.19, 0xffffff, { yaw: Math.PI });
  kit.cyl('solid', 0, cy, -0.18, R + 0.05, R + 0.05, 0.36, 40, 0x1a3d6d, { rx: Math.PI / 2 });
  const rim = new THREE.TorusGeometry(R + 0.15, 0.2, 6, 40);
  kit.place('solid', rim, 0, cy, 0, WOOD);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
    kit.rod('solid', [c * (R + 0.2), cy + s * (R + 0.2), 0], [c * (R + 1.0), cy + s * (R + 1.0), 0], 0.13, 6, WOOD);
    kit.place('solid', new THREE.SphereGeometry(0.22, 8, 6), c * (R + 1.05), cy + s * (R + 1.05), 0, WOOD);
  }
  kit.collider(0, 0, 0.9, 0.9, 0, Math.min(lo, y0) - 1, cy + R + 1.2);
  const res = kit.finish();
  const up0 = res.update;
  res.update = (dt, env = {}) => { up0(dt, env); mat.emissiveIntensity = (env.night || 0) * 0.85; };
  return res;
}
