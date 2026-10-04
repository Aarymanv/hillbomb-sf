// Street prop models (merged Kit geometry per model, vertex colours + aSurf material channels).
// Local frame: origin at the base on the ground, +Y up, -Z = the side facing the road (lamp arms reach toward -Z).
import * as THREE from 'three';
import { Kit } from './kit.js';
import { PA, paUV } from './textures.js';

// palette (sRGB hex)
const C = {
  galv: 0x9ca1a5, galvDark: 0x6f7478, olive: 0x34423a, black: 0x1c1e20, bronze: 0x2e3a2c, gold: 0xb89142,
  signalBody: 0x23262a, signalYellow: 0xe0b000, wood: 0x5b4735, woodDark: 0x3f3226, ceramic: 0xd8d4c8,
  concrete: 0xaaa59c, hydrant: 0xebe9e2, hydrantTop: 0x2459ad, trash: 0x22402d, benchFrame: 0x2b4636, slat: 0x8c6242,
  glass: 0x4d6470, shelterFrame: 0x2a2d30, muniRed: 0xc8102e, mailBlue: 0x1f4f9c, soil: 0x3b2c20, shrub: 0x3f6b2e,
  lensCool: 0xfff0d8, lensWarm: 0xffd49a, lensSodium: 0xffac58,
};
const M = { metal: [0.42, 0.75], paint: [0.55, 0.25], plastic: [0.6, 0], rough: [0.9, 0], glass: [0.08, 0.6], wood: [0.92, 0] };
const PBRK = new Map();
PBRK.set(M.metal, [1, 1]); PBRK.set(M.paint, [1, 0.45]); PBRK.set(M.rough, [2, 1]);
const mat = (k, m, glowN = 0, glowD = 0) => { k.mat(m[0], m[1], glowN, glowD); const p = PBRK.get(m); if (p) k.pbr(p[0], p[1]); return k; };
// uv helpers for textured faces: [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]
const faceUV = (r) => { const [u0, v0, u1, v1] = paUV(r); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; };
const grimeCyl = (k, x, y0, y1, z, r0, r1, seg) => { const [u0, v0, u1, v1] = paUV(PA.grime); k.textured(); k.cyl(x, y0, y1, z, r0, r1, seg, 0b10, 0, [u0, v0], u1 - u0); // v constant: fix below
  // remap v by height: bottom (y0) -> dark row (v0), 3 m up -> v1
  const n = (seg + 1) * 2, capN = r1 > 0.001 ? seg + 2 : 0, start = k.count - n - capN;
  for (let i = start; i < k.count; i++) { const y = k.pos[i * 3 + 1]; k.uv[i * 2 + 1] = v0 + (v1 - v0) * Math.min(1, Math.max(0.02, (y - y0) / 3)); if (i >= k.count - capN) k.uv[i * 2] = (u0 + u1) / 2; }
  k.flat(); };

// ------------------------------------------------------------------ lamps
// cobra head on a davit arm. returns { kit, head: [x,y,z] local light position }
export function cobraLamp({ H = 9.2, arm = 2.4, pole = C.galv, lens = C.lensCool, headCol = C.galvDark, base = true } = {}) {
  const k = new Kit(); k.flat();
  mat(k, M.metal).color(pole);
  if (base) { k.color(C.concrete); mat(k, M.rough); k.cyl(0, -0.3, 0.12, 0, 0.3, 0.28, 8, 0b10); mat(k, M.metal).color(pole); k.cyl(0, 0.1, 0.55, 0, 0.19, 0.16, 8, 0b10); }
  grimeCyl(k, 0, 0.1, H - 0.4, 0, 0.13, 0.075, 10);
  // davit arm: rises then curves out over the road (toward -Z)
  const path = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; const a = t * Math.PI / 2; path.push([0, H - 1.6 + Math.sin(a) * 1.5, -(1 - Math.cos(a)) * 0.9 - t * t * (arm - 0.9)]); }
  path.push([0, H - 0.08, -arm]);
  k.tube(path, path.map((_, i) => 0.075 - i * 0.004), 7);
  // head: elongated shell + flat glowing lens underneath
  const hz = -arm - 0.32;
  k.color(headCol); mat(k, M.paint);
  k.sphere(0, H - 0.02, hz, 0.2, 0.1, 0.42, 10, 5);
  k.color(lens); mat(k, M.glass, 1.0);
  k.push().translate(0, H - 0.075, hz).scale(1, 1, 2.1); k.disc(0, 0, 0, 0.16, 12, -1); k.pop();
  return { kit: k, head: [0, H - 0.15, hz] };
}
// Market St "Path of Gold"-style ornate standard: fluted base, two globes on a cross arm, finial
export function ornateLamp({ H = 8.4 } = {}) {
  const k = new Kit(); k.flat();
  mat(k, M.paint).color(C.bronze);
  k.lathe(0, 0, [[0.36, -0.2], [0.36, 0.3], [0.3, 0.36], [0.3, 0.7], [0.24, 0.78], [0.22, 1.2], [0.27, 1.32], [0.18, 1.45], [0.15, 2.6], [0.13, 2.7], [0.13, H - 1.9], [0.17, H - 1.75], [0.1, H - 1.6]], 12);
  // flutes (thin boxes)
  for (let i = 0; i < 8; i++) { k.push().rotY(i * Math.PI / 4); k.box(0.155, 2.0, 0, 0.018, 0.55, 0.018); k.pop(); }
  k.cyl(0, H - 1.6, H - 0.5, 0, 0.09, 0.07, 8, 0b10);
  // cross arm with scrolls
  k.push().translate(0, H - 1.35, 0);
  k.box(0, 0, 0, 0.78, 0.045, 0.045);
  k.tube([[-0.05, -0.35, 0], [-0.35, -0.2, 0], [-0.6, 0.02, 0]], [0.03, 0.03, 0.03], 5);
  k.tube([[0.05, -0.35, 0], [0.35, -0.2, 0], [0.6, 0.02, 0]], [0.03, 0.03, 0.03], 5);
  k.pop();
  for (const sx of [-0.72, 0.72]) {
    k.color(C.gold); mat(k, M.metal); k.cyl(sx, H - 1.33, H - 1.18, 0, 0.09, 0.12, 8, 0b10);
    k.color(C.lensWarm); mat(k, M.glass, 1.0); k.sphere(sx, H - 0.9, 0, 0.27, 0.3, 0.27, 12, 8);
    k.color(C.gold); mat(k, M.metal); k.cyl(sx, H - 0.62, H - 0.5, 0, 0.1, 0.04, 8, 0b10);
  }
  // centre lantern + finial
  k.color(C.lensWarm); mat(k, M.glass, 0.8); k.sphere(0, H - 0.25, 0, 0.2, 0.24, 0.2, 10, 7);
  k.color(C.gold); mat(k, M.metal); k.cyl(0, H - 0.05, H + 0.35, 0, 0.05, 0.005, 6, 0b10);
  return { kit: k, head: [0, H - 0.9, 0], heads2: [[-0.72, H - 0.9, 0], [0.72, H - 0.9, 0]] };
}
// residential: slender post with a short gooseneck and a small LED head
export function postLamp({ H = 6.8 } = {}) {
  const k = new Kit(); k.flat();
  mat(k, M.paint).color(C.olive);
  k.cyl(0, -0.2, 0.45, 0, 0.14, 0.12, 8, 0b10);
  grimeCyl(k, 0, 0.4, H, 0, 0.085, 0.06, 8);
  const path = []; for (let i = 0; i <= 7; i++) { const a = (i / 7) * Math.PI * 0.62; path.push([0, H - 0.2 + Math.sin(a) * 0.45, -(1 - Math.cos(a)) * 0.9]); }
  k.tube(path, path.map(() => 0.045), 6);
  const e = path[path.length - 1];
  k.color(C.galvDark); mat(k, M.paint);
  k.box(0, e[1] - 0.05, e[2] - 0.22, 0.14, 0.055, 0.26);
  k.color(C.lensWarm); mat(k, M.glass, 1.0); k.box(0, e[1] - 0.112, e[2] - 0.22, 0.11, 0.008, 0.21, 0b100000);
  return { kit: k, head: [0, e[1] - 0.2, e[2] - 0.22] };
}
// trolley span pole (dark green steel); optional cobra light
export function trolleyPole({ H = 9.0, lamp = false } = {}) {
  let k, head = null;
  if (lamp) { const r = cobraLamp({ H: H - 1.3, arm: 2.2, pole: C.olive, base: false }); k = r.kit; head = r.head; k.flat(); mat(k, M.paint).color(C.olive); k.cyl(0, H - 1.8, H, 0, 0.1, 0.085, 8, 0b10); }
  else { k = new Kit(); k.flat(); mat(k, M.paint).color(C.olive); grimeCyl(k, 0, 0, H, 0, 0.16, 0.09, 10); }
  mat(k, M.paint).color(C.olive);
  k.cyl(0, -0.2, 0.6, 0, 0.24, 0.2, 10, 0b10);
  // span wire eye bands
  k.color(C.black); mat(k, M.metal); k.cyl(0, H - 2.25, H - 2.1, 0, 0.14, 0.14, 8, 0b10);
  k.box(0, H - 2.17, -0.17, 0.03, 0.04, 0.08);
  // pole-mounted muni painted band on some poles is added by the bus stop pole model instead
  return { kit: k, head, attach: [0, H - 2.17, -0.2] };
}
// wooden utility pole (Sunset / Richmond): crossarm perpendicular to the street (local Z), insulators, optional transformer + light
export function woodPole({ H = 10.6, transformer = false } = {}) {
  const k = new Kit(); k.flat();
  mat(k, M.wood).color(C.wood);
  k.cyl(0, -0.4, H, 0, 0.17, 0.12, 9, 0b10);
  k.color(C.woodDark);
  k.box(0, H - 0.55, 0, 0.06, 0.06, 1.05);                   // crossarm along Z
  k.tube([[0, H - 1.3, 0], [0, H - 0.6, -0.7]], [0.025, 0.025], 4); k.tube([[0, H - 1.3, 0], [0, H - 0.6, 0.7]], [0.025, 0.025], 4); // braces
  k.color(C.ceramic); mat(k, M.plastic);
  for (const z of [-0.9, -0.3, 0.9]) k.cyl(0, H - 0.49, H - 0.3, z, 0.045, 0.035, 6, 0b10);
  k.cyl(0, H, H + 0.22, 0, 0.045, 0.035, 6, 0b10);
  // lower communication cable clamp
  k.color(C.black); k.box(0, 6.8, 0, 0.1, 0.05, 0.1);
  if (transformer) { k.color(0x80868a); mat(k, M.metal); k.cyl(0.36, H - 3.1, H - 2.0, 0, 0.26, 0.26, 10, 0b11); k.color(0x5a5f63); k.box(0.2, H - 2.6, 0, 0.12, 0.08, 0.08); }
  // street light on a short arm toward the road
  k.color(C.galvDark); mat(k, M.metal);
  k.tube([[0, 7.6, -0.1], [0, 7.95, -0.8], [0, 8.05, -1.6]], [0.04, 0.035, 0.035], 5);
  k.sphere(0, 8.03, -1.85, 0.14, 0.08, 0.3, 8, 4);
  k.color(C.lensSodium); mat(k, M.glass, 1.0); k.push().translate(0, 7.97, -1.85).scale(1, 1, 2); k.disc(0, 0, 0, 0.11, 10, -1); k.pop();
  return { kit: k, head: [0, 7.85, -1.85], wires: [[0, H - 0.38, -0.9], [0, H - 0.38, -0.3], [0, H - 0.38, 0.9], [0, H + 0.2, 0]], comm: [0, 6.8, 0] };
}

// ------------------------------------------------------------------ traffic control
export function signalPole({ H = 7.4 } = {}) {
  const k = new Kit(); k.flat();
  mat(k, M.metal).color(C.galv);
  k.color(C.concrete); mat(k, M.rough); k.cyl(0, -0.3, 0.1, 0, 0.42, 0.4, 8, 0b10);
  mat(k, M.metal).color(C.galv);
  k.lathe(0, 0, [[0.3, 0.05], [0.3, 0.12], [0.22, 0.2], [0.2, 0.5]], 8);
  grimeCyl(k, 0, 0.45, H, 0, 0.19, 0.14, 12);
  k.disc(0, H, 0, 0.14, 12, 1);
  // arm clamp plate at 5.9 m, toward -Z
  k.box(0, 5.9, -0.2, 0.2, 0.28, 0.06);
  // push-button box + small control cabinet? (button on the pole)
  k.color(C.signalBody); mat(k, M.plastic); k.box(0, 1.1, -0.22, 0.07, 0.12, 0.05);
  return { kit: k };
}
// unit mast arm: from the pole (z=0) toward -Z over length 1 (instance scale z = arm length), slight upward sweep
export function mastArm() {
  const k = new Kit(); k.flat(); mat(k, M.metal).color(C.galv);
  const path = []; for (let i = 0; i <= 6; i++) { const t = i / 6; path.push([0, 0.06 * t, -t]); }
  // radius must stay constant under the z scale: use a box-ish tube with tiny radius in x/y only
  k.tube(path, path.map((_, i) => 0.11 - i * 0.008), 8);
  return { kit: k };
}
// 3-lens vehicle head, origin at the housing centre; lenses on the -Z face. aSurf.x = lens id (1 red, 2 yellow, 3 green)
export function signalHead({ backplate = true } = {}) {
  const k = new Kit(); k.flat();
  k.color(C.signalBody); k.mat(0.5, 0.2, 0, 0);
  k.box(0, 0, 0, 0.19, 0.53, 0.14);
  if (backplate) {
    k.box(0, 0, 0.16, 0.34, 0.68, 0.012);
    k.color(C.signalYellow); k.mat(0.4, 0, 0, 0);
    // retroreflective yellow border strips on the backplate face (-Z side)
    k.box(0, 0.655, 0.146, 0.34, 0.025, 0.004); k.box(0, -0.655, 0.146, 0.34, 0.025, 0.004);
    k.box(0.315, 0, 0.146, 0.025, 0.68, 0.004); k.box(-0.315, 0, 0.146, 0.025, 0.68, 0.004);
  }
  // lenses + visors
  [[0.34, 1], [0, 2], [-0.34, 3]].forEach(([y, id]) => {
    k.color(0xffffff); k.mat(0.15, 0, id, 0);
    k.discZ(0, y, -0.142, 0.125, 14, -1);
    k.color(C.signalBody); k.mat(0.5, 0.2, 0, 0);
    // visor: half tube open at the bottom
    const base = k.count;
    for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI; const cx = Math.cos(a) * 0.145, cy = Math.sin(a) * 0.145; k.v(cx, y + cy, -0.14, cx, cy, 0); k.v(cx, y + cy * 0.9, -0.42, cx, cy, 0); }
    for (let i = 0; i < 5; i++) { const a = base + i * 2; k.quadI(a, a + 2, a + 3, a + 1); k.quadI(a, a + 1, a + 3, a + 2); }
  });
  return { kit: k };
}
// pedestrian head (hand / walk), lens ids 4 (hand) / 5 (walk), textured
export function pedHead() {
  const k = new Kit(); k.flat();
  k.color(C.signalBody); k.mat(0.5, 0.2, 0, 0);
  k.box(0, 0, 0, 0.2, 0.2, 0.13);
  k.box(0, 0.2, -0.16, 0.2, 0.012, 0.04);
  k.textured(); k.color(0xffffff);
  // hand (viewer's left) and walking person (viewer's right) side by side; the signal shader lights one of them
  k.mat(0.2, 0, 4, 0); k.box(0.095, 0.0, -0.131, 0.088, 0.17, 0.001, 0b10, faceUV(PA.hand));
  k.mat(0.2, 0, 5, 0); k.box(-0.095, 0.0, -0.131, 0.088, 0.17, 0.001, 0b10, faceUV(PA.walk));
  k.flat();
  return { kit: k };
}
export function stopSign({ tall = false } = {}) {
  const k = new Kit(); k.flat();
  const H = tall ? 3.55 : 2.75;
  mat(k, M.metal).color(C.galv);
  k.box(0, H / 2 - 0.3, 0, 0.03, H / 2 + 0.3, 0.03);
  // octagon: textured front, grey back
  const r = 0.4, oct = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; oct.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const [u0, v0, u1, v1] = paUV(PA.stop);
  const y0 = 2.15, zf = -0.045;
  k.textured(); k.color(0xffffff); k.mat(0.45, 0, 0, 0);
  const c0 = k.v(0, y0, zf, 0, 0, -1, (u0 + u1) / 2, (v0 + v1) / 2);
  const ring = oct.map(([x, y]) => k.v(x, y0 + y, zf, 0, 0, -1, u0 + (0.5 - (x / r) * 0.496) * (u1 - u0), v0 + (0.5 + (y / r) * 0.496) * (v1 - v0)));
  for (let i = 0; i < 8; i++) k.tri(c0, ring[(i + 1) % 8], ring[i]);
  k.flat(); k.color(0x8a8d90); mat(k, M.metal);
  const c1 = k.v(0, y0, zf + 0.012, 0, 0, 1);
  const ring2 = oct.map(([x, y]) => k.v(x, y0 + y, zf + 0.012, 0, 0, 1));
  for (let i = 0; i < 8; i++) k.tri(c1, ring2[i], ring2[(i + 1) % 8]);
  // ALL WAY plaque
  k.textured(); k.color(0xffffff); k.mat(0.45, 0, 0, 0);
  k.box(0, 1.62, -0.04, 0.24, 0.07, 0.006, 0b10, faceUV(PA.allway));
  k.flat(); k.color(0x8a8d90); k.box(0, 1.62, -0.03, 0.24, 0.07, 0.004, 0b01);
  return { kit: k, bladeY: [H - 0.42, H - 0.2] };
}
export function namePost() {
  const k = new Kit(); k.flat(); mat(k, M.metal).color(C.galv);
  k.box(0, 1.6, 0, 0.03, 1.9, 0.03);
  k.cyl(0, 3.5, 3.56, 0, 0.04, 0.02, 6, 0b10);
  return { kit: k, bladeY: [3.13, 3.35] };
}
// street-name blade: long axis local X, faces +-Z; face vertices flagged aSurf.w = -1 (bladeMat maps the per-instance slot uv)
export function nameBlade() {
  const k = new Kit(); k.flat();
  k.color(0xffffff); k.mat(0.4, 0, 0, -1);
  const w = 0.46, h = 0.085, d = 0.012;
  k.quad([w, -h, -d], [-w, -h, -d], [-w, h, -d], [w, h, -d], [[0, 0], [1, 0], [1, 1], [0, 1]]);   // front (-Z), reads left->right
  k.quad([-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d], [[0, 0], [1, 0], [1, 1], [0, 1]]);       // back (+Z)
  k.color(0x0e6b3b); k.mat(0.5, 0, 0, 0);
  k.box(0, h, 0, w, 0.004, d, 0b010000); k.box(0, -h, 0, w, 0.004, d, 0b100000);
  // bracket
  k.color(C.galv); mat(k, M.metal); k.box(0, 0, 0, 0.05, 0.1, 0.03);
  return { kit: k };
}

// ------------------------------------------------------------------ sidewalk furniture
export function hydrant() {
  const k = new Kit(); k.flat();
  mat(k, M.paint).color(C.hydrant);
  k.lathe(0, 0, [[0.19, -0.05], [0.19, 0.06], [0.15, 0.09], [0.13, 0.12], [0.125, 0.52], [0.16, 0.56], [0.16, 0.62], [0.13, 0.64]], 12);
  k.color(C.hydrantTop);
  k.lathe(0, 0, [[0.14, 0.62], [0.145, 0.66], [0.12, 0.74], [0.07, 0.79], [0.0, 0.8]], 12);
  k.cyl(0, 0.79, 0.86, 0, 0.035, 0.03, 5, 0b10);   // operating nut
  k.color(C.hydrant);
  // side outlets (+-X) and the steamer (front, -Z)
  for (const sx of [-1, 1]) { k.push().translate(sx * 0.12, 0.42, 0).rotZ(-sx * Math.PI / 2); k.cyl(0, 0, 0.1, 0, 0.055, 0.05, 8, 0b10); k.color(C.hydrantTop); k.cyl(0, 0.1, 0.13, 0, 0.06, 0.06, 6, 0b10); k.color(C.hydrant); k.pop(); }
  k.push().translate(0, 0.38, -0.1).rotX(-Math.PI / 2); k.cyl(0, 0, 0.1, 0, 0.075, 0.07, 10, 0b10); k.color(C.hydrantTop); k.cyl(0, 0.1, 0.14, 0, 0.08, 0.08, 6, 0b10); k.pop();
  return { kit: k };
}
export function parkingMeter() {
  const k = new Kit(); k.flat();
  mat(k, M.metal).color(C.galvDark);
  k.cyl(0, -0.1, 1.08, 0, 0.035, 0.03, 6, 0b10);
  k.color(0x3b3f44); mat(k, M.paint);
  k.box(0, 1.25, 0, 0.1, 0.16, 0.075);
  k.lathe(0, 0, [[0.1, 1.41], [0.09, 1.45], [0.05, 1.49], [0, 1.5]], 8);
  k.textured(); k.color(0xffffff); k.mat(0.3, 0, 0, 0.35);
  k.box(0, 1.27, -0.077, 0.085, 0.043, 0.002, 0b10, faceUV(PA.meter));
  k.box(0, 1.27, 0.077, 0.085, 0.043, 0.002, 0b10, faceUV(PA.meter));
  k.flat();
  return { kit: k };
}
export function payStation() {
  const k = new Kit(); k.flat();
  mat(k, M.paint).color(0x2a2e33);
  k.box(0, 0.78, 0, 0.2, 0.78, 0.14);
  k.box(0, 1.58, -0.03, 0.22, 0.03, 0.18);
  k.textured(); k.color(0xffffff); k.mat(0.3, 0, 0.3, 0.3);
  k.box(0, 1.1, -0.141, 0.19, 0.32, 0.002, 0b10, faceUV(PA.paystation));
  k.flat();
  return { kit: k };
}
export function busShelter() {
  const k = new Kit(); k.flat();
  const L = 4.2, D = 1.5, Hh = 2.55;
  mat(k, M.paint).color(C.shelterFrame);
  for (const x of [-L / 2, L / 2]) for (const z of [-D / 2 + 0.1, D / 2]) k.box(x, Hh / 2, z, 0.05, Hh / 2, 0.05);
  // roof: thin slab with a sloped top, red "muni" fascia on the road side
  k.box(0, Hh + 0.06, 0, L / 2 + 0.15, 0.06, D / 2 + 0.2);
  k.color(C.muniRed); mat(k, M.paint); k.box(0, Hh + 0.06, -D / 2 - 0.21, L / 2 + 0.15, 0.07, 0.01);
  // glass back + one glass end, ad panel on the other end
  k.color(C.glass); k.mat(0.06, 0.55, 0, 0);
  k.box(0, 1.35, D / 2, L / 2 - 0.05, 1.05, 0.012);
  k.box(-L / 2, 1.35, 0.1, 0.012, 1.05, D / 2 - 0.12);
  k.color(C.shelterFrame); mat(k, M.paint); k.box(L / 2, 1.3, 0.1, 0.07, 1.15, D / 2 - 0.12);
  k.textured(); k.color(0xffffff); k.mat(0.2, 0, 1.3, 0.2);
  k.push().translate(L / 2, 1.3, 0.1).rotY(-Math.PI / 2); k.box(0, 0, -0.072, D / 2 - 0.18, 1.02, 0.002, 0b10, faceUV(PA.ads[0])); k.pop();
  k.push().translate(L / 2, 1.3, 0.1).rotY(Math.PI / 2); k.box(0, 0, -0.072, D / 2 - 0.18, 1.02, 0.002, 0b10, faceUV(PA.ads[2])); k.pop();
  // map panel on the back glass (inside face)
  k.mat(0.3, 0, 0.2, 0.1); k.box(-0.8, 1.4, D / 2 - 0.02, 0.5, 0.25, 0.002, 0b10, faceUV(PA.mapPanel));
  k.flat();
  // bench inside
  k.color(0x7d8387); mat(k, M.metal);
  k.box(0.2, 0.46, D / 2 - 0.32, 1.3, 0.025, 0.2);
  for (const x of [-0.9, 1.3]) k.box(x, 0.23, D / 2 - 0.32, 0.03, 0.23, 0.15);
  // lit roof panel underside (glows at night)
  k.color(0xfff4dc); k.mat(0.3, 0, 0.5, 0); k.box(0, Hh - 0.005, 0, L / 2 - 0.3, 0.003, D / 2 - 0.25, 0b100000);
  return { kit: k, half: [L / 2, D / 2] };
}
export function busStopPole() {
  const k = new Kit(); k.flat();
  mat(k, M.metal).color(C.galv);
  k.cyl(0, -0.2, 3.1, 0, 0.045, 0.04, 8, 0b10);
  k.color(C.signalYellow); mat(k, M.paint); k.cyl(0, 1.6, 2.0, 0, 0.05, 0.05, 8, 0);
  k.textured(); k.color(0xffffff); k.mat(0.4, 0, 0, 0);
  k.box(0.2, 2.72, 0, 0.18, 0.3, 0.012, 0b11, faceUV(PA.muni));
  k.flat();
  return { kit: k };
}
export function bench() {
  const k = new Kit(); k.flat();
  const L = 1.8;
  mat(k, M.paint).color(C.benchFrame);
  for (const x of [-L / 2 + 0.15, L / 2 - 0.15]) {
    k.box(x, 0.22, -0.18, 0.03, 0.22, 0.03); k.box(x, 0.22, 0.18, 0.03, 0.22, 0.03);
    k.box(x, 0.44, 0, 0.03, 0.025, 0.24);
    k.box(x, 0.66, 0.24, 0.03, 0.24, 0.025);
    k.box(x, 0.62, -0.05, 0.025, 0.02, 0.2);
  }
  k.color(C.slat); mat(k, M.wood);
  for (let i = 0; i < 4; i++) k.box(0, 0.47, -0.19 + i * 0.12, L / 2, 0.018, 0.045);
  for (let i = 0; i < 3; i++) k.box(0, 0.58 + i * 0.13, 0.26, L / 2, 0.045, 0.015);
  return { kit: k };
}
export function trashCan() {
  const k = new Kit(); k.flat();
  const [u0, v0, u1, v1] = paUV(PA.trash);
  mat(k, M.paint).color(0xffffff); k.textured();
  k.cyl(0, 0, 0.92, 0, 0.3, 0.32, 14, 0, 1 / 0.92 * (v1 - v0), [u1, v0], -(u1 - u0));
  k.flat(); k.color(C.trash);
  k.lathe(0, 0, [[0.34, 0.9], [0.34, 0.98], [0.28, 1.06], [0.12, 1.1], [0, 1.11]], 14);
  k.color(0x121412); k.box(0, 1.0, -0.28, 0.14, 0.03, 0.06);
  k.color(C.trash); k.cyl(0, -0.02, 0.05, 0, 0.3, 0.3, 14, 0);
  return { kit: k };
}
export function newsBoxes(n = 3) {
  const k = new Kit();
  const w = 0.42, gap = 0.04, x0 = -((n - 1) * (w + gap)) / 2;
  const cols = [0x1f5fa8, 0xc0272d, 0xf2c230, 0xf4f4f0];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (w + gap), ci = (i * 3 + n) % 4;
    k.flat(); mat(k, M.paint).color(cols[ci]);
    k.box(x, 0.62, 0, w / 2, 0.45, 0.22);
    k.lathe(x, 0, [[0.02, 0], [0.02, 0.17]], 4);
    k.box(x, 0.08, 0, w / 2 - 0.03, 0.08, 0.19);
    k.textured(); k.color(0xffffff); k.mat(0.35, 0, 0, 0);
    k.box(x, 0.8, -0.221, w / 2 - 0.02, 0.2, 0.002, 0b10, faceUV(PA.news[ci]));
  }
  k.flat();
  return { kit: k, half: [(n * (w + gap)) / 2, 0.25] };
}
export function bikeRack() {
  const k = new Kit(); k.flat(); mat(k, M.metal).color(C.galv);
  for (const x of [-0.45, 0.45]) {
    const path = [[x, -0.1, -0.35]]; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; path.push([x, 0.62 + Math.sin(a) * 0.22, -Math.cos(a) * 0.35]); } path.push([x, -0.1, 0.35]);
    k.tube(path, path.map(() => 0.028), 6);
  }
  return { kit: k };
}
// (v4) street-tree well: square cut in the sidewalk (origin = sidewalk surface) with a worn concrete lip, dark soil /
// mulch, weeds and ivy tufts; optional cast-iron grate (commercial streets)
export function treeWell({ grate = false } = {}) {
  const k = new Kit(); k.flat();
  k.color(0x8f8b83); mat(k, M.rough);
  for (const [x, z, hx, hz] of [[0, 0.6, 0.64, 0.04], [0, -0.6, 0.64, 0.04], [0.6, 0, 0.04, 0.56], [-0.6, 0, 0.04, 0.56]]) k.box(x, -0.02, z, hx, 0.03, hz);
  k.color(0x2c2118); k.mat(0.95, 0, 0, 0); k.box(0, -0.07, 0, 0.56, 0.01, 0.56, 0b010000);
  k.color(0x4a3a2a); for (const [x, z, r] of [[0.3, 0.25, 0.14], [-0.28, -0.3, 0.12], [0.2, -0.32, 0.1], [-0.35, 0.2, 0.1]]) k.box(x, -0.058, z, r, 0.004, r * 0.8, 0b010000);
  if (grate) {
    k.color(0x1e1f20); mat(k, M.metal);
    for (const r of [0.54, 0.36, 0.2]) for (const s of [-1, 1]) { k.box(0, -0.005, s * r, r + 0.02, 0.012, 0.018); k.box(s * r, -0.005, 0, 0.018, 0.012, r); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; k.push().rotY(a); k.box(0, -0.006, 0.37, 0.012, 0.011, 0.17); k.pop(); }
  } else {
    k.color(0x3f5a2a); k.mat(0.9, 0, 0, 0);
    for (const [x, z, r] of [[0.42, 0.4, 0.1], [-0.43, 0.38, 0.08], [0.41, -0.44, 0.09], [-0.2, -0.45, 0.07], [0.05, 0.47, 0.06]]) k.sphere(x, -0.04, z, r, r * 0.6, r, 6, 4);
  }
  return { kit: k };
}
export function planter() {
  const k = new Kit(); k.flat();
  k.color(C.concrete); mat(k, M.rough);
  k.box(0, 0.3, 0, 0.55, 0.3, 0.55, 0b101111);
  k.box(0, 0.6, 0.5, 0.55, 0.03, 0.05, 0b010000); k.box(0, 0.6, -0.5, 0.55, 0.03, 0.05, 0b010000);
  k.box(0.5, 0.6, 0, 0.05, 0.03, 0.45, 0b010000); k.box(-0.5, 0.6, 0, 0.05, 0.03, 0.45, 0b010000);
  k.color(C.soil); k.box(0, 0.56, 0, 0.5, 0.01, 0.5, 0b010000);
  k.color(C.shrub); k.mat(0.9, 0, 0, 0);
  const blobs = [[0, 0.95, 0, 0.42], [0.2, 0.8, 0.18, 0.3], [-0.22, 0.8, -0.1, 0.3], [0.1, 0.78, -0.25, 0.26], [-0.15, 0.82, 0.22, 0.26]];
  blobs.forEach(([x, y, z, r], i) => { k.color(i % 2 ? 0x3a6428 : 0x4a7a33); k.sphere(x, y, z, r, r * 0.85, r, 7, 5); });
  return { kit: k };
}
export function bollard() {
  const k = new Kit(); k.flat(); mat(k, M.paint).color(C.black);
  k.cyl(0, -0.1, 0.85, 0, 0.1, 0.1, 10, 0);
  k.lathe(0, 0, [[0.1, 0.85], [0.09, 0.9], [0.05, 0.94], [0, 0.95]], 10);
  k.color(0xd8d8d0); k.mat(0.2, 0.3, 0, 0.05); k.cyl(0, 0.72, 0.78, 0, 0.102, 0.102, 10, 0);
  return { kit: k };
}
export function mailbox() {
  const k = new Kit(); k.flat(); mat(k, M.paint).color(C.mailBlue);
  k.box(0, 0.7, 0, 0.26, 0.5, 0.25);
  k.push().translate(0, 1.2, 0).rotX(Math.PI / 2); k.cyl(0, -0.25, 0.25, 0, 0.26, 0.26, 12, 0b11); k.pop();
  k.color(0x1a1a1a); for (const x of [-0.22, 0.22]) for (const z of [-0.2, 0.2]) k.box(x, 0.1, z, 0.025, 0.1, 0.025);
  k.color(0xdddddd); k.box(0, 1.05, -0.252, 0.14, 0.05, 0.002);
  return { kit: k };
}
export function parkingSign() {
  const k = new Kit(); k.flat(); mat(k, M.metal).color(C.galv);
  k.box(0, 1.2, 0, 0.025, 1.4, 0.025);
  k.textured(); k.color(0xffffff); k.mat(0.4, 0, 0, 0);
  k.box(0, 2.25, -0.03, 0.2, 0.28, 0.004, 0b11, faceUV(PA.noParking));
  k.flat();
  return { kit: k };
}
export function mooringBollard() {
  const k = new Kit(); k.flat(); mat(k, M.paint).color(0x232527);
  k.lathe(0, 0, [[0.3, 0], [0.3, 0.08], [0.2, 0.12], [0.16, 0.35], [0.24, 0.45], [0.24, 0.52], [0.15, 0.56], [0, 0.57]], 12);
  return { kit: k };
}
// 3 m pipe railing segment along local X from 0 to 3
export function railing() {
  const k = new Kit(); k.flat(); mat(k, M.paint).color(0x3a4a52);
  for (const y of [0.55, 1.08]) { k.push().translate(0, y, 0).rotZ(-Math.PI / 2); k.cyl(0, 0, 3, 0, 0.03, 0.03, 6, 0); k.pop(); }
  k.cyl(0, -0.05, 1.12, 0, 0.035, 0.035, 6, 0b10);
  return { kit: k };
}
// debris shard (tumbling pieces)
export function shard() {
  const k = new Kit(); k.flat(); k.mat(0.6, 0.3, 0, 0); k.color(0xffffff);
  k.box(0, 0, 0, 0.12, 0.05, 0.08); k.box(0.05, 0.04, 0.02, 0.05, 0.05, 0.05);
  return { kit: k };
}

export const PROP_COLORS = C;
export { THREE };
