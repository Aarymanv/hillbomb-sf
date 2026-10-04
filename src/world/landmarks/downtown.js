// Downtown landmarks: Transamerica Pyramid, Salesforce Tower, Ferry Building.
import * as THREE from 'three';
import { LANDMARKS } from '../anchors.js';
import { Kit, shade, makeCanvas, canvasTex, roundedRing, loftGeom, archGeom, rng, winLit } from './kit.js';

// ---------- shared small helpers ----------
function foundation(kit, key, cx, cz, hx, hz, color, { minBase = -Infinity, ry = 0 } = {}) {
  const [lo, hi] = kit.hRange(cx, cz, hx, hz, ry);
  const base = Math.max(hi, minBase);
  const bot = Math.min(lo, 0) - 2;
  if (base - bot > 0.05) kit.boxY(key, cx, bot, base + 0.02, cz, hx * 2 + 0.6, hz * 2 + 0.6, color, { yaw: ry });
  return { base, bot, lo, hi };
}
// quad with planar UVs: corners a,b,c,d (CCW seen from the front), uv = (dot(p, uAxis)/su, y/sv)
function quadGeom(a, b, c, d, uAxis, su, sv) {
  const pos = [...a, ...b, ...c, ...a, ...c, ...d];
  const uv = [];
  for (const p of [a, b, c, a, c, d]) uv.push((p[0] * uAxis[0] + p[2] * uAxis[2]) / su, p[1] / sv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------- textures ----------
let taTex = null;
function transamericaTextures() {
  if (taTex) return taTex;
  const N = 8, C = 32, S = N * C;
  const cm = makeCanvas(S, S), ce = makeCanvas(S, S);
  if (!cm) return (taTex = {});
  const g = cm.getContext('2d'), e = ce.getContext('2d');
  g.fillStyle = '#ece7da'; g.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * C, y = j * C;
    g.fillStyle = '#c9c2b3'; g.fillRect(x + 10, y + 8, 13, 17);
    g.fillStyle = '#5d6873'; g.fillRect(x + 11, y + 9, 11, 15);
    g.fillStyle = 'rgba(190,210,225,0.3)'; g.fillRect(x + 11, y + 9, 11, 4);
    if (Math.random() < 0.38) { e.fillStyle = Math.random() < 0.7 ? '#ffd79a' : '#fff1d6'; e.fillRect(x + 11, y + 9, 11, 15); }
  }
  taTex = { map: canvasTex(cm), emissiveMap: canvasTex(ce) };
  return taTex;
}
let sfTex = null;
function salesforceTextures() {
  if (sfTex) return sfTex;
  const W = 256, H = 256, cm = makeCanvas(W, H), ce = makeCanvas(W, H), cc = makeCanvas(128, 256);
  if (!cm) return (sfTex = {});
  const g = cm.getContext('2d'), e = ce.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#879fb1'); grd.addColorStop(1, '#a3b7c6');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const floors = 8, fh = H / floors;
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    g.fillStyle = '#b4c3ce'; g.fillRect(0, y, W, 3);                 // spandrel line
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y + 5, W, 6);
    for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(40,55,70,0.18)'; g.fillRect(x, y + 5, 1, fh - 5); }
    for (let x = 0; x < W; x += 32) if (Math.random() < 0.42) { e.fillStyle = Math.random() < 0.5 ? '#fff4dc' : '#dfeaff'; e.fillRect(x + 1, y + 7, 30, fh - 9); }
  }
  // crown LED screen: soft vertical/horizontal bands that we scroll + recolour at night
  const c = cc.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y++) {
    const v = 0.5 + 0.5 * Math.sin(y / 256 * Math.PI * 6);
    for (let x = 0; x < 128; x += 4) {
      const u = 0.5 + 0.5 * Math.sin(x / 128 * Math.PI * 4 + y / 40);
      const b = Math.round(255 * Math.pow(v * 0.6 + u * 0.4, 2.2));
      c.fillStyle = `rgb(${b},${b},${b})`; c.fillRect(x, y, 3, 1);
    }
  }
  sfTex = { map: canvasTex(cm), emissiveMap: canvasTex(ce), crown: canvasTex(cc, { srgb: false }) };
  return sfTex;
}

// =====================================================================
export function buildTransamerica({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.transamerica, ...AO } : LANDMARKS.transamerica;
  const kit = new Kit('transamerica', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const B = A.baseHalf, H = A.height;
  const f = foundation(kit, 'solid', 0, 0, B + 3, B + 3, 0x9d998f);
  const y0 = f.base;
  kit.boxY('solid', 0, y0 - 0.3, y0 + 0.25, 0, B * 2 + 8, B * 2 + 8, 0xb4afa4); // plaza slab
  const yBody = y0 + 0.8 * H;
  const half = (y) => B * (1 - 0.74 * (y - y0) / (yBody - y0));   // body tapers to ~26% at the top floor
  const T = transamericaTextures();
  const mat = new THREE.MeshStandardMaterial({ map: T.map || null, emissiveMap: T.emissiveMap || null, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.78, color: T.map ? 0xffffff : 0xe6dfcf });
  mat.name = 'lm-transamerica';
  kit.register('ta', mat, {});
  // body: 4 trapezoid faces with world-space window UVs (cell 1.9 m x 2.25 m, tile = 8x8)
  const yb = y0 + 7, hb = half(yb), ht = half(yBody);
  const faces = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [nx, nz] of faces) {
    const tx = nz, tz = -nx; // tangent (right when looking at the face from outside)
    const a = [nx * hb - tx * hb, yb, nz * hb - tz * hb], b = [nx * hb + tx * hb, yb, nz * hb + tz * hb];
    const c = [nx * ht + tx * ht, yBody, nz * ht + tz * ht], d = [nx * ht - tx * ht, yBody, nz * ht - tz * ht];
    kit.geom('ta', quadGeom(a, b, c, d, [tx, 0, tz], 15.2, 18), null, 0xffffff);
  }
  kit.box('solid', 0, yBody - 0.2, 0, ht * 2 + 0.3, 0.6, ht * 2 + 0.3, 0xe0dacb);
  // base: recessed glass lobby behind the sloping A-frame truss columns
  kit.boxY('glow', 0, y0, yb, 0, (hb - 1.6) * 2, (hb - 1.6) * 2, 0x39424c, { ecol: [0.9, 0.75, 0.5] });
  kit.boxY('solid', 0, yb - 0.8, yb, 0, hb * 2 + 0.2, hb * 2 + 0.2, 0xd6cfbf);
  for (const [nx, nz] of faces) {
    const tx = -nz, tz = nx;
    for (let k = -3; k <= 3; k++) {
      const u = k / 3 * (hb - 1.2);
      const top = [nx * hb + tx * u, yb - 0.8, nz * hb + tz * u];
      const bl = [nx * (hb - 0.5) + tx * (u - 2.1), y0, nz * (hb - 0.5) + tz * (u - 2.1)];
      const br2 = [nx * (hb - 0.5) + tx * (u + 2.1), y0, nz * (hb - 0.5) + tz * (u + 2.1)];
      if (k > -3) kit.beam('solid', bl, top, 0.9, 0.9, 0xd9d2c3);
      if (k < 3) kit.beam('solid', br2, top, 0.9, 0.9, 0xd9d2c3);
    }
  }
  // wings on the east and west faces (vertical, so they stand proud of the tapering faces near the top)
  const yw0 = y0 + 0.48 * H, yw1 = yBody + 2.2;
  for (const sg of [-1, 1]) {
    const xo = half(yw0);
    kit.boxY('solid', sg * (xo + 0.5) / 2, yw0, yw1, 0, xo - 0.5, 4.4, 0xe4ddce);
    kit.boxY('solid', sg * (xo + 0.5) / 2, yw1, yw1 + 0.7, 0, xo - 0.1, 4.8, 0xcfc8b8);
    for (let y = yw0 + 3; y < yw1 - 1; y += 4.5) kit.box('glow', sg * (xo + 0.02), y, 0, 0.1, 1.4, 0.7, 0x2b333d, { ecol: [0.8, 0.65, 0.4] });
    // the wing's sloped underside where it leaves the face
    kit.beam('solid', [sg * (xo - 1.5), yw0 - 4, 0], [sg * xo, yw0 + 0.2, 0], 1.2, 4.4, 0xd8d1c1);
  }
  // aluminium-clad spire (continues the pyramid to the point)
  const sp = new THREE.ConeGeometry(ht * 0.72 * Math.SQRT2, y0 + H - yBody, 4, 1);
  sp.rotateY(Math.PI / 4); sp.translate(0, (y0 + H - yBody) / 2, 0);
  kit.place('steel', sp, 0, yBody, 0, 0xd9dcdc);
  kit.box('blink', 0, y0 + H + 0.3, 0, 0.6, 0.8, 0.6, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
  kit.collider(0, 0, B, B, 0, f.bot, y0 + H);
  const res = kit.finish();
  const up0 = res.update;
  res.update = (dt, env = {}) => { up0(dt, env); mat.emissiveIntensity = (env.night || 0) * 1.1; };
  return res;
}

// =====================================================================
export function buildSalesforce({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.salesforce, ...AO } : LANDMARKS.salesforce;
  const kit = new Kit('salesforce', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const B = A.baseHalf, H = A.height, R = 0.35;
  const f = foundation(kit, 'solid', 0, 0, B + 2, B + 2, 0x8d8f91);
  const y0 = f.base;
  kit.boxY('solid', 0, y0 - 0.3, y0 + 0.2, 0, B * 2 + 10, B * 2 + 10, 0xa9a9a6);
  const half = (y) => B - (B * 0.19) * Math.pow((y - y0) / H, 1.7);
  const yCrown = y0 + 0.88 * H, yTop = y0 + H;
  const T = salesforceTextures();
  const glass = new THREE.MeshStandardMaterial({ map: T.map || null, emissiveMap: T.emissiveMap || null, emissive: 0xfff3dd, emissiveIntensity: 0, color: T.map ? 0xdfe8ef : 0x7f95a6, metalness: 0.55, roughness: 0.16 });
  glass.name = 'lm-sf-glass';
  kit.register('sfglass', glass, {});
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.5, metalness: 0.3, emissive: 0xffffff, emissiveMap: T.crown || null, emissiveIntensity: 0, side: THREE.DoubleSide });
  crownMat.name = 'lm-sf-crown';
  kit.register('sfcrown', crownMat, { castShadow: false });
  const ring = (h, n = 5) => roundedRing(h, h, h * R, n);
  // glass shaft in 6 lofted sections (follows the gentle taper)
  const secs = 6;
  for (let i = 0; i < secs; i++) {
    const ya = y0 + (yCrown - y0) * i / secs, yb2 = y0 + (yCrown - y0) * (i + 1) / secs;
    const g = loftGeom(ring(half(ya)), ya, ring(half(yb2)), yb2, { capTop: i === secs - 1 });
    // uv: u = arc length / 24 m, v = y / 30 m (8 floors per tile)
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 24, uv.getY(k) / 30);
    kit.geom('sfglass', g, null, 0xffffff);
  }
  // lobby band
  kit.geom('glow', loftGeom(ring(half(y0) + 0.3), y0, ring(half(y0) + 0.3), y0 + 7), null, 0x3a4653, [0.9, 0.85, 0.7]);
  kit.geom('solid', loftGeom(ring(half(y0 + 7) + 0.5), y0 + 7, ring(half(y0 + 7) + 0.5), y0 + 7.8, { capTop: true }), null, 0xe8ecee);
  // inner LED screen of the crown + open top
  kit.geom('sfcrown', loftGeom(ring(half(yCrown) - 1.4), yCrown, ring(half(yTop) - 1.4), yTop - 1.5), null, 0xffffff);
  // vertical white fins: evenly spaced along the perimeter, running through the crown to the top
  const unit = roundedRing(1, 1, R, 8);
  const per = []; let L = 0;
  for (let i = 0; i < unit.length; i++) { const a = unit[i], b = unit[(i + 1) % unit.length]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); per.push([a, b, L, d]); L += d; }
  const nF = 76;
  const at = (t) => { const x = t * L; for (const [a, b, l0, d] of per) if (x <= l0 + d) { const k = (x - l0) / d; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; } return unit[0]; };
  for (let i = 0; i < nF; i++) {
    const [ux, uz] = at(i / nF), nl = Math.hypot(ux, uz), nx = ux / nl, nz = uz / nl;
    // follow the (curved) taper in 4 pieces
    for (let k = 0; k < 4; k++) {
      const ya = y0 + 8 + (yTop - y0 - 8) * k / 4, yb2 = y0 + 8 + (yTop - y0 - 8) * (k + 1) / 4;
      const qa = [ux * half(ya) + nx * 0.22, ya, uz * half(ya) + nz * 0.22], qb = [ux * half(yb2) + nx * 0.22, yb2, uz * half(yb2) + nz * 0.22];
      kit.beam('solid', qa, qb, 0.2, 0.4, 0xe6ebee, { up: [nx, 0, nz] });
    }
  }
  // crown lattice: horizontal rings (outer face + inner face) = perforated screen
  for (let y = yCrown + 1.4; y < yTop - 0.2; y += 1.7) {
    const hh = half(y) + 0.2;
    kit.geom('solid', loftGeom(ring(hh, 3), y, ring(hh, 3), y + 0.32), null, 0xe9eced);
    kit.geom('solid', loftGeom(ring(hh - 0.5, 3).slice().reverse(), y, ring(hh - 0.5, 3).slice().reverse(), y + 0.32), null, 0xd5dadd);
  }
  kit.geom('solid', loftGeom(ring(half(yCrown) + 0.3), yCrown - 0.4, ring(half(yCrown) + 0.3), yCrown + 1.2, { capTop: false }), null, 0xe6e9ea);
  kit.geom('solid', loftGeom(ring(half(yTop) + 0.35), yTop - 0.5, ring(half(yTop) + 0.35), yTop + 0.3), null, 0xf1f3f3);
  kit.geom('solid', loftGeom(ring(half(yTop) - 0.2).slice().reverse(), yTop - 0.5, ring(half(yTop) - 0.2).slice().reverse(), yTop + 0.3), null, 0xdde1e3);
  for (const s of [-1, 1]) kit.box('blink', s * 3, yTop - 1.2, 0, 0.5, 0.6, 0.5, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
  kit.collider(0, 0, B, B, 0, f.bot, yTop);
  const res = kit.finish();
  const up0 = res.update;
  const hsl = { h: 0, s: 0, l: 0 };
  res.update = (dt, env = {}) => {
    up0(dt, env);
    const night = env.night || 0, t = env.time || 0;
    glass.emissiveIntensity = night * 0.9;
    crownMat.emissiveIntensity = night * 2.2;
    if (night > 0.01) {
      hsl.h = (0.58 + 0.2 * Math.sin(t * 0.045) + 0.12 * Math.sin(t * 0.11) + 1) % 1;
      hsl.s = 0.2 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.07), 2);
      crownMat.emissive.setHSL(hsl.h, hsl.s, 0.62);
      if (crownMat.emissiveMap) { crownMat.emissiveMap.offset.set(t * 0.013, -t * 0.021); }
    }
  };
  return res;
}

// =====================================================================
export function buildFerryBuilding({ heightAt = () => 0, A: AO = null } = {}) {
  const A = AO ? { ...LANDMARKS.ferry, ...AO } : LANDMARKS.ferry;
  const kit = new Kit('ferry', { x: A.x, z: A.z, yaw: A.yaw, heightAt });
  const HL = A.length / 2, HD = A.depth / 2, BH = A.height, TH = A.towerHeight;
  const STONE = 0xd9cfbb, STONE_D = 0xbfb49f, STONE_L = 0xe7dfcf, ROOF = 0x6e7a73, WIN = 0x2e3640;
  const WARM = [1.6, 1.15, 0.6];
  const R = rng(7);
  const f = foundation(kit, 'solid', 0, 0, HL, HD, 0x8e8a82, { minBase: 1.2 });
  const y0 = f.base;
  // main block
  kit.boxY('solid', 0, y0, y0 + BH - 2, 0, HL * 2, HD * 2, STONE);
  kit.boxY('solid', 0, y0 + BH - 2.2, y0 + BH - 1.4, 0, HL * 2 + 1.4, HD * 2 + 1.4, STONE_L);   // cornice
  kit.boxY('solid', 0, y0 + BH - 1.4, y0 + BH, 0, HL * 2 + 0.2, HD * 2 + 0.2, STONE_D);          // parapet
  kit.boxY('solid', 0, y0 + 6.6, y0 + 7.3, 0, HL * 2 + 0.5, HD * 2 + 0.5, STONE_L);              // string course
  kit.boxY('solid', 0, y0 + BH - 1.8, y0 + BH + 2.2, 0, HL * 2 - 8, 9, ROOF);                     // nave skylight roof
  kit.box('solid', 0, y0 + BH + 2.6, 0, HL * 2 - 9, 0.8, 5, shade(ROOF, 1.2));
  // end pavilions
  for (const sg of [-1, 1]) {
    kit.boxY('solid', sg * (HL - 4), y0, y0 + BH + 1.2, 0, 8.4, HD * 2 + 1.6, STONE);
    kit.boxY('solid', sg * (HL - 4), y0 + BH + 1.2, y0 + BH + 1.9, 0, 9, HD * 2 + 2.2, STONE_L);
  }
  // facades: arcade arches (ground floor) + arched windows (upper floor), front and back
  const bay = 5.5;
  const bigArch = archGeom(3.6, 5.6, 6), smallArch = archGeom(1.5, 3.0, 5);
  for (const side of [-1, 1]) {           // -1 = front (-Z), +1 = back (bay side)
    const zf = side * (HD + 0.03), yawF = side < 0 ? Math.PI : 0;
    for (let x = -(HL - 11); x <= HL - 10.9; x += bay) {
      if (side < 0 && Math.abs(x) < 7) continue;       // tower
      kit.place('glow', bigArch, x, y0 + 0.4, zf, WIN, { yaw: yawF, ecol: winLit(R, WARM, 0.25) });
      kit.place('glow', smallArch, x - 1.2, y0 + 8.2, zf, WIN, { yaw: yawF, ecol: winLit(R, WARM, 0.25) });
      kit.place('glow', smallArch, x + 1.2, y0 + 8.2, zf, WIN, { yaw: yawF, ecol: winLit(R, WARM, 0.25) });
      kit.boxY('solid', x + bay / 2, y0, y0 + BH - 2.2, side * (HD + 0.2), 0.7, 0.4, STONE_L); // pilaster
    }
  }
  // end facades
  for (const sg of [-1, 1]) for (let z = -HD + 4; z < HD - 3; z += 5) {
    kit.place('glow', smallArch, sg * (HL + 0.83), y0 + 2.5, z, WIN, { yaw: sg * Math.PI / 2, ecol: winLit(R, WARM, 0.25), scale: [1.2, 1.4, 1] });
    kit.place('glow', smallArch, sg * (HL + 0.83), y0 + 8.4, z, WIN, { yaw: sg * Math.PI / 2, ecol: winLit(R, WARM, 0.25) });
  }
  // ---- clock tower ----
  const tz = -HD + 5.5, T0 = y0;
  kit.boxY('solid', 0, T0, T0 + 27, tz, 10, 10, STONE);
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) kit.boxY('solid', cx * 4.7, T0 + BH, T0 + 27, tz + cz * 4.7, 1.2, 1.2, STONE_L);
  for (let y = T0 + BH + 2; y < T0 + 25; y += 3.4) for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    kit.box('glow', nx * 5.03, y, tz + nz * 5.03, nx ? 0.06 : 1.1, 1.8, nz ? 0.06 : 1.1, WIN, { ecol: WARM });
  }
  // grand arched entrance on the front
  kit.place('glow', archGeom(4.4, 7.5, 8), 0, T0 + 0.3, tz - 5.05, WIN, { yaw: Math.PI, ecol: WARM });
  // clock stage
  kit.boxY('solid', 0, T0 + 27, T0 + 31.8, tz, 10.8, 10.8, STONE_L);
  kit.boxY('solid', 0, T0 + 31.8, T0 + 32.6, tz, 11.8, 11.8, STONE_D);
  const face = new THREE.CircleGeometry(1.9, 20), rim = new THREE.CircleGeometry(2.25, 20);
  for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const yawC = Math.atan2(nx, nz);
    const px = nx * 5.42, pz = tz + nz * 5.42;
    kit.place('solid', rim, px, T0 + 29.4, pz, 0x3b3a36, { yaw: yawC });
    kit.place('glow', face, px + nx * 0.04, T0 + 29.4, pz + nz * 0.04, 0xf3eedf, { yaw: yawC, ecol: [2.6, 2.3, 1.7] });
    // hands (10:10)
    const hx = px + nx * 0.1, hz = pz + nz * 0.1, tx = -nz, tzv = nx;
    kit.beam('solid', [hx, T0 + 29.4, hz], [hx - tx * 0.9, T0 + 29.4 + 0.75, hz - tzv * 0.9], 0.14, 0.05, 0x1d1d1d, { up: [nx, 0, nz] });
    kit.beam('solid', [hx, T0 + 29.4, hz], [hx + tx * 1.2, T0 + 29.4 + 1.0, hz + tzv * 1.2], 0.1, 0.05, 0x1d1d1d, { up: [nx, 0, nz] });
  }
  // colonnaded belvedere
  const b0 = T0 + 32.6, b1 = T0 + 37.6;
  kit.boxY('glow', 0, b0, b1, tz, 6.4, 6.4, 0x3d3f41, { ecol: [1.2, 0.95, 0.6] });
  kit.boxY('solid', 0, b0, b0 + 1, tz, 9.8, 9.8, STONE);                                  // balustrade
  for (const i of [-1, 0, 1]) for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const tx = -nz, tzv = nx;
    kit.cyl('solid', nx * 4.3 + tx * i * 3.6, b0 + 1, tz + nz * 4.3 + tzv * i * 3.6, 0.42, 0.36, b1 - b0 - 1, 8, STONE_L);
  }
  kit.boxY('solid', 0, b1, b1 + 0.9, tz, 10, 10, STONE_D);
  kit.boxY('solid', 0, b1 + 0.9, T0 + 41.6, tz, 6, 6, STONE);
  for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) kit.place('glow', archGeom(1.4, 2.4, 5), nx * 3.03, b1 + 1.2, tz + nz * 3.03, WIN, { yaw: Math.atan2(nx, nz), ecol: WARM });
  kit.boxY('solid', 0, T0 + 41.6, T0 + 42.2, tz, 6.8, 6.8, STONE_D);
  const dome = new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  kit.place('solid', dome, 0, T0 + 42.2, tz, 0x9aa39d, { scale: [1, 0.72, 1] });
  kit.cyl('solid', 0, T0 + 43.9, tz, 0.35, 0.2, TH - 43.9 + 0.2, 6, STONE_L);
  kit.cyl('solid', 0, T0 + TH, tz, 0.07, 0.05, 7, 4, 0xdddddd);
  kit.box('solid', 0.85, T0 + TH + 6.2, tz, 1.6, 0.9, 0.04, 0xb8312f);
  kit.collider(0, 0, HL + 0.6, HD + 0.8, 0, f.bot, y0 + BH + 2);
  kit.collider(0, tz, 5.9, 5.9, 0, f.bot, T0 + TH);
  return kit.finish();
}
export { foundation, quadGeom };
