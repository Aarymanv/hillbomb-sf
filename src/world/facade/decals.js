// Canvas atlases + materials for the near LOD:
//  * DECAL atlas (2048^2): 64 shop sign bands (invented SF names), 5 vertical blade/neon signs, 3 murals, ghost signs,
//    lantern paper. Material: MeshStandard + alphaTest, emissive at night (lit signs, flickering neon, lanterns).
//  * CUT atlas (1024^2): fire-escape railings/gratings/stairs/ladders, balcony railings, gates. Alpha-tested, double-sided.
// Both use the facade vertex layout (aUv.xy = atlas uv, aC = tint rgb + emissive kind in a).
import * as THREE from 'three';
import { mulberry32 } from '../geo.js';

const NAMES = {
  mission: ['TAQUERIA LOS GALLOS', 'PANADERIA LA ESTRELLA', 'BURRITOS 24TH', 'MERCADO VALENCIA', 'EL POLLO FELIZ', 'LAVANDERIA', 'MARISCOS EL PUERTO', 'DULCERIA ROSA'],
  chinatown: ['GOLDEN LOTUS DIM SUM', 'JADE PALACE', 'LUCKY DRAGON BAKERY', 'WAH KEE HERBS', 'EASTERN TEA HOUSE', 'NEW CANTON BBQ', 'PEARL RIVER GIFTS', 'DOUBLE HAPPINESS'],
  northbeach: ['CAFFE TRIESTINO', 'PANIFICIO BELLA', 'NORTH BEACH PIZZA', 'BAR MARCONI', 'FOCACCIA BROS', 'LIBRERIA VESUVIO', 'SALUMERIA ROMA'],
  tenderloin: ['HOTEL ALDER', 'LIQUOR', 'SUDS LAUNDROMAT', 'PHO SAIGON', 'CHECKS CASHED', 'PIZZA', 'DONUTS 24 HRS', 'THAI KITCHEN'],
  soma: ['FOLSOM BREWING CO', 'MINT COFFEE ROASTERS', 'GALLERY 415', 'TAPROOM', 'BIKE WORKS', 'RECORDS', 'CLIMBING GYM'],
  avenues: ['SUNSET NOODLE HOUSE', 'OCEAN BEACH SURF', 'IRVING ST MARKET', 'DIM SUM EXPRESS', 'BOBA HOUSE', 'JUDAH HARDWARE', 'FOG DRIFT BAKERY'],
  generic: ['FOG CITY COFFEE', 'HAIGHT BOOKS', 'PAINTED LADY CAFE', 'BAY LAUNDROMAT', 'DOLORES DELI', 'SOURDOUGH & CO', 'GREEN CROSS', 'VINYL REVIVAL',
    'CORNER MARKET', 'BURRITOS', 'COFFEE', 'BOOKS', 'FLOWERS', 'WINE & SPIRITS', 'RAMEN', 'NAIL SALON', 'BARBER', 'BAKERY', 'DINER', 'NEWS & LOTTO'],
};
const ZONE_SET = { mission: 'mission', chinatown: 'chinatown', northbeach: 'northbeach', tenderloin: 'tenderloin', soma: 'soma', industrial: 'soma', avenues: 'avenues', downtown: 'generic', downtown_soma: 'soma' };
const CJK = ['金龍酒家', '茶樓', '福記', '中華', '點心', '餅家', '藥材', '雙喜'];
const BLADE = ['HOTEL', 'BAR', 'LIQUOR', 'OPEN', 'CAFE'];
const GHOST = ['SUPERIOR COFFEE', 'FURNITURE CO.', 'HOTEL', 'WAREHOUSE', 'BREWERY'];

const SIGN_COLS = 4, SIGN_ROWS = 16, SW = 512, SH = 96;
export const DECAL = {
  sign(i) { i = ((i % 64) + 64) % 64; const c = i % SIGN_COLS, r = Math.floor(i / SIGN_COLS); return [c * SW / 2048, 1 - (r + 1) * SH / 2048, (c + 1) * SW / 2048, 1 - r * SH / 2048]; },
  mural(i) { i = i % 3; return [i * 512 / 2048, 0, (i + 1) * 512 / 2048, 512 / 2048]; },
  blade(i) { i = i % 5; return [(1536 + i * 96) / 2048, 0, (1536 + (i + 1) * 96) / 2048, 512 / 2048]; },
  lantern: [2016 / 2048, 0, 1, 64 / 2048],
};
// sign slots grouped by zone: first index + count
const SLOT_ZONES = {};

function drawSigns(x, rnd) {
  let slot = 0;
  const fonts = ['900 italic 54px Georgia, serif', '900 56px "Arial Black", Impact, sans-serif', 'bold 52px "Trebuchet MS", sans-serif', 'bold 50px Georgia, serif', 'bold 58px Impact, "Arial Narrow", sans-serif', 'italic bold 56px "Brush Script MT", cursive'];
  const bgs = ['#1f5f3f', '#8f1f1f', '#1f3f6f', '#d8a02a', '#2a2a2a', '#6f2f5f', '#c8502a', '#2a6f6f', '#f0e6cc', '#113322', '#5a1a1a', '#e8d8a0', '#0f2a44', '#b8202a'];
  for (const [zone, list] of Object.entries(NAMES)) {
    const start = slot;
    const n = zone === 'generic' ? 20 : zone === 'chinatown' ? 8 : 7;
    for (let k = 0; k < n && slot < 64; k++, slot++) {
      const name = list[k % list.length];
      const c = slot % SIGN_COLS, r = Math.floor(slot / SIGN_COLS);
      const X = c * SW, Y = r * SH;
      const bg = bgs[Math.floor(rnd() * bgs.length)];
      const light = /#(f|e|d8a|e8d)/.test(bg);
      x.fillStyle = bg; x.fillRect(X, Y, SW, SH);
      // frame and pinstripe
      x.strokeStyle = light ? 'rgba(40,30,20,0.8)' : 'rgba(240,220,170,0.85)'; x.lineWidth = 4; x.strokeRect(X + 6, Y + 6, SW - 12, SH - 12);
      x.lineWidth = 1.5; x.strokeRect(X + 12, Y + 12, SW - 24, SH - 24);
      const f = fonts[Math.floor(rnd() * fonts.length)];
      x.font = f; x.textAlign = 'center'; x.textBaseline = 'middle';
      let size = 1;
      const w = x.measureText(name).width; if (w > SW - 50) size = (SW - 50) / w;
      x.save(); x.translate(X + SW / 2, Y + SH / 2 + 2); x.scale(size, 1);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillText(name, 2, 3);
      x.fillStyle = light ? '#2a1a10' : (rnd() < 0.5 ? '#f6ecd0' : '#f2c14e');
      x.fillText(name, 0, 0);
      if (zone === 'chinatown') { x.font = 'bold 30px "Microsoft YaHei", "SimHei", sans-serif'; x.fillStyle = '#f2c14e'; x.fillText(CJK[k % CJK.length], 0, -30); }
      x.restore();
    }
    SLOT_ZONES[zone] = [start, slot - start];
  }
  // remaining slots: neon-style signs (dark plate, glowing tube text)
  const neon = ['OPEN', 'COCKTAILS', 'PIZZA', 'NOODLES', 'TATTOO', 'LIQUOR', 'DONUTS', 'KARAOKE'];
  const nStart = slot;
  for (let k = 0; slot < 64; k++, slot++) {
    const c = slot % SIGN_COLS, r = Math.floor(slot / SIGN_COLS), X = c * SW, Y = r * SH;
    x.fillStyle = '#0c0c10'; x.fillRect(X, Y, SW, SH);
    const col = ['#ff3a5a', '#3af0ff', '#ffe03a', '#7aff5a', '#ff7ae0'][k % 5];
    x.font = 'bold 60px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = col; x.shadowBlur = 18; x.strokeStyle = col; x.lineWidth = 5; x.strokeText(neon[k % neon.length], X + SW / 2, Y + SH / 2);
    x.shadowBlur = 0; x.strokeStyle = '#fff6f0'; x.lineWidth = 1.5; x.strokeText(neon[k % neon.length], X + SW / 2, Y + SH / 2);
  }
  SLOT_ZONES.neon = [nStart, 64 - nStart];
}

function drawMural(x, X, Y, S, rnd, kind) {
  const pal = [['#f2b134', '#e4572e', '#29335c', '#17bebb', '#fdfffc'], ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#2b2d42'], ['#8338ec', '#ff006e', '#fb5607', '#ffbe0b', '#3a86ff']][kind % 3];
  const g = x.createLinearGradient(X, Y, X, Y + S); g.addColorStop(0, pal[3]); g.addColorStop(1, pal[0]);
  x.fillStyle = g; x.fillRect(X, Y, S, S);
  // sun + rays
  x.save(); x.beginPath(); x.rect(X, Y, S, S); x.clip();
  const sx = X + S * (0.3 + rnd() * 0.4), sy = Y + S * 0.35;
  for (let i = 0; i < 18; i++) { x.fillStyle = i % 2 ? pal[1] : pal[4]; x.beginPath(); x.moveTo(sx, sy); const a0 = i / 18 * Math.PI * 2, a1 = (i + 1) / 18 * Math.PI * 2; x.lineTo(sx + Math.cos(a0) * S, sy + Math.sin(a0) * S); x.lineTo(sx + Math.cos(a1) * S, sy + Math.sin(a1) * S); x.fill(); }
  x.globalAlpha = 0.9;
  x.fillStyle = pal[1]; x.beginPath(); x.arc(sx, sy, S * 0.13, 0, 7); x.fill();
  // hills / waves
  for (let k = 0; k < 4; k++) {
    x.fillStyle = pal[(k + 2) % 5]; x.beginPath(); x.moveTo(X, Y + S);
    for (let i = 0; i <= 20; i++) { const px = X + i / 20 * S; x.lineTo(px, Y + S * (0.55 + k * 0.1) + Math.sin(i * 0.9 + k * 2 + rnd()) * S * 0.05); }
    x.lineTo(X + S, Y + S); x.fill();
  }
  // stylised faces / flowers
  for (let k = 0; k < 7; k++) {
    const fx = X + rnd() * S, fy = Y + S * (0.55 + rnd() * 0.4), r = S * (0.03 + rnd() * 0.05);
    x.fillStyle = pal[k % 5];
    for (let p = 0; p < 6; p++) { x.beginPath(); x.ellipse(fx + Math.cos(p) * r, fy + Math.sin(p) * r, r * 0.8, r * 0.45, p, 0, 7); x.fill(); }
    x.fillStyle = pal[(k + 2) % 5]; x.beginPath(); x.arc(fx, fy, r * 0.5, 0, 7); x.fill();
  }
  // bold outline figure
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 6; x.fillStyle = pal[4];
  const hx = X + S * (0.15 + rnd() * 0.2), hy = Y + S * 0.62;
  x.beginPath(); x.ellipse(hx, hy, S * 0.08, S * 0.11, 0, 0, 7); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(hx - S * 0.12, Y + S); x.quadraticCurveTo(hx, hy + S * 0.05, hx + S * 0.12, Y + S); x.fill(); x.stroke();
  x.restore();
  x.globalAlpha = 1;
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 8; x.strokeRect(X + 4, Y + 4, S - 8, S - 8);
}

function drawBlades(x) {
  for (let i = 0; i < 5; i++) {
    const X = 1536 + i * 96, Y = 1536, word = BLADE[i];
    x.fillStyle = '#16161a'; x.fillRect(X, Y, 96, 512);
    x.strokeStyle = '#c8a040'; x.lineWidth = 4; x.strokeRect(X + 4, Y + 4, 88, 504);
    const col = ['#ff3a3a', '#3ae0ff', '#ffd23a', '#ff5ad0', '#7aff6a'][i];
    x.font = 'bold 70px "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const n = word.length, step = Math.min(90, 470 / n);
    for (let k = 0; k < n; k++) {
      const cy = Y + 256 + (k - (n - 1) / 2) * step;
      x.shadowColor = col; x.shadowBlur = 16; x.strokeStyle = col; x.lineWidth = 6; x.strokeText(word[k], X + 48, cy);
      x.shadowBlur = 0; x.strokeStyle = '#fff4ec'; x.lineWidth = 2; x.strokeText(word[k], X + 48, cy);
    }
  }
  // lantern paper (red with gold bands) in the corner
  const X = 2016, Y = 1984;
  x.fillStyle = '#c81e1e'; x.fillRect(X, Y, 32, 64);
  x.fillStyle = '#f2c14e'; x.fillRect(X, Y, 32, 7); x.fillRect(X, Y + 57, 32, 7);
  x.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 4; k++) x.fillRect(X + k * 8 + 3, Y + 7, 1.5, 50);
}

function drawGhosts(x, rnd) {
  // ghost signs share the neon rows? no: they live in the right column of the mural band as alpha-only letters
}

let atlas = null;
function decalAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = c.height = 2048;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 2048, 2048);
  const rnd = mulberry32(4242);
  drawSigns(x, rnd);
  for (let i = 0; i < 3; i++) drawMural(x, i * 512, 1536, 512, rnd, i);
  drawBlades(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = t;
  return t;
}
export function signSlot(zone, r) {
  decalAtlas();
  const set = SLOT_ZONES[ZONE_SET[zone] || 'generic'] || SLOT_ZONES.generic;
  if (r > 0.82 && (zone === 'tenderloin' || zone === 'soma' || zone === 'mission')) { const [s, n] = SLOT_ZONES.neon; return s + Math.floor(r * 97) % n; }
  const [s, n] = set;
  return s + Math.floor(r * n * 7.31) % n;
}
export function isNeonSlot(i) { const [s, n] = SLOT_ZONES.neon || [99, 0]; return i >= s && i < s + n; }

// ------------------------------------------------------------------ cutout atlas
export const CUT = {
  rail: [0, 0.75, 0.5, 1.0],        // fire-escape railing: balusters + rails
  grate: [0.5, 0.75, 1.0, 1.0],     // platform grating
  stair: [0, 0.5, 0.5, 0.75],       // stair flight (side view: stringer + treads)
  ladder: [0.5, 0.25, 0.625, 0.75],
  iron: [0, 0.25, 0.5, 0.5],        // ornate balcony railing
  china: [0, 0, 0.5, 0.25],         // geometric Chinatown railing
  gate: [0.625, 0.25, 1.0, 0.75],   // security gate
};
let cutTex = null;
function cutAtlas() {
  if (cutTex) return cutTex;
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  x.clearRect(0, 0, N, N);
  x.fillStyle = '#fff'; x.strokeStyle = '#fff';
  const R = (r) => [r[0] * N, (1 - r[3]) * N, (r[2] - r[0]) * N, (r[3] - r[1]) * N]; // canvas rect (y down)
  { // rail: top + mid + bottom rails and balusters
    const [X, Y, W, H] = R(CUT.rail);
    x.fillRect(X, Y + 2, W, 10); x.fillRect(X, Y + H * 0.5, W, 6); x.fillRect(X, Y + H - 12, W, 10);
    for (let i = 0; i <= 16; i++) x.fillRect(X + i * (W - 6) / 16, Y, 6, H);
  }
  { // grate: slats
    const [X, Y, W, H] = R(CUT.grate);
    for (let i = 0; i < 24; i++) x.fillRect(X, Y + i * H / 24, W, H / 24 * 0.55);
    x.fillRect(X, Y, 10, H); x.fillRect(X + W - 10, Y, 10, H);
  }
  { // stair flight seen from the side: diagonal stringers + treads
    const [X, Y, W, H] = R(CUT.stair);
    x.lineWidth = 12; x.beginPath(); x.moveTo(X, Y + H - 8); x.lineTo(X + W, Y + 8); x.stroke();
    x.lineWidth = 7; x.beginPath(); x.moveTo(X, Y + H * 0.55); x.lineTo(X + W * 0.9, Y); x.stroke();
    for (let i = 0; i < 10; i++) { const t = (i + 0.5) / 10; x.fillRect(X + t * W - 14, Y + H - t * H - 8, 28, 8); }
    for (let i = 0; i < 6; i++) { const t = i / 5; x.fillRect(X + t * W * 0.9, Y + H * 0.55 - t * H * 0.55, 4, H * 0.45); }
  }
  { // ladder
    const [X, Y, W, H] = R(CUT.ladder);
    x.fillRect(X + 4, Y, 10, H); x.fillRect(X + W - 14, Y, 10, H);
    for (let i = 0; i < 16; i++) x.fillRect(X, Y + i * H / 16 + 6, W, 6);
  }
  { // ornate iron railing
    const [X, Y, W, H] = R(CUT.iron);
    x.fillRect(X, Y, W, 12); x.fillRect(X, Y + H - 14, W, 14);
    x.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      const cx = X + (i + 0.5) * W / 12;
      x.fillRect(cx - 3, Y, 6, H);
      x.beginPath(); x.ellipse(cx + W / 24, Y + H * 0.45, W / 30, H * 0.28, 0, 0, 7); x.stroke();
    }
  }
  { // Chinatown geometric railing
    const [X, Y, W, H] = R(CUT.china);
    x.fillRect(X, Y, W, 14); x.fillRect(X, Y + H - 14, W, 14);
    x.lineWidth = 7;
    for (let i = 0; i < 8; i++) {
      const X0 = X + i * W / 8, w = W / 8;
      x.strokeRect(X0 + 6, Y + 18, w - 12, H - 36);
      x.beginPath(); x.moveTo(X0 + 6, Y + H / 2); x.lineTo(X0 + w / 2, Y + 18); x.lineTo(X0 + w - 6, Y + H / 2); x.lineTo(X0 + w / 2, Y + H - 18); x.closePath(); x.stroke();
    }
  }
  { // security gate (lattice)
    const [X, Y, W, H] = R(CUT.gate);
    x.lineWidth = 5;
    for (let i = -12; i < 24; i++) { x.beginPath(); x.moveTo(X + i * W / 12, Y); x.lineTo(X + (i + 12) * W / 12, Y + H); x.stroke(); x.beginPath(); x.moveTo(X + (i + 12) * W / 12, Y); x.lineTo(X + i * W / 12, Y + H); x.stroke(); }
    x.fillRect(X, Y, W, 10); x.fillRect(X, Y + H - 10, W, 10);
  }
  // clamp the lattice spill
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  cutTex = t;
  return t;
}

// ------------------------------------------------------------------ materials
const UV_PATCH = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aUv; attribute vec4 aC; varying float vEm; varying float vPh;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aUv.xy;\n#endif')
    .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor = aC.rgb;\n#endif\nvEm = floor(aC.a * 255.0 + 0.5); vPh = aUv.z;');
};
export function makeNearMaterials(night, time) {
  const decal = new THREE.MeshStandardMaterial({ map: decalAtlas(), vertexColors: true, roughness: 0.6, metalness: 0.0, alphaTest: 0.5, side: THREE.FrontSide });
  decal.onBeforeCompile = (sh) => {
    UV_PATCH(sh);
    sh.uniforms.uNight = night; sh.uniforms.uTime = time;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uTime; varying float vEm; varying float vPh;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // vEm: 0 none, 1 lit sign (lamp-lit at night), 2 neon (flicker), 3 lantern / glowing plate, 4 mural (no glow)
  vec3 base = diffuseColor.rgb;
  float k = 0.0;
  if (vEm > 0.5 && vEm < 1.5) k = 0.08 + 0.9 * uNight;
  else if (vEm > 1.5 && vEm < 2.5) {
    float fl = step(0.07, fract(sin(floor(uTime * 12.0 + vPh * 50.0) * 12.9898) * 43758.5453));
    float lum = dot(base, vec3(0.3, 0.59, 0.11));
    k = (0.15 + 3.2 * uNight * mix(0.9, 1.0, fl)) * smoothstep(0.12, 0.35, lum);   // neon buzz: a faint dip, not a 12 Hz strobe
  } else if (vEm > 2.5 && vEm < 3.5) k = 0.1 + 2.0 * uNight;
  totalEmissiveRadiance += base * k;
}`);
  };
  decal.customProgramCacheKey = () => 'bld-decal-v1';
  const cut = new THREE.MeshStandardMaterial({ map: cutAtlas(), vertexColors: true, roughness: 0.55, metalness: 0.5, alphaTest: 0.5, side: THREE.DoubleSide });
  cut.onBeforeCompile = (sh) => { UV_PATCH(sh); };
  cut.customProgramCacheKey = () => 'bld-cut-v1';
  // additive warm light pools on the pavement: radial falloff in uv, strength in aC.a, visible at night only
  // (lights what is underneath: dst * (1 + src); additive spill turned wet pavement milky white)
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  glow.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUv; attribute vec4 aC; varying vec2 vGuv; varying float vGk;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor = aC.rgb;\n#endif\nvGuv = aUv.xy; vGk = aC.a;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec2 vGuv; varying float vGk;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float gx = 1.0 - pow(abs(vGuv.x * 2.0 - 1.0), 2.0);
  float gy = 1.0 - smoothstep(0.5, 1.0, vGuv.y);
  diffuseColor.rgb *= gx * gy * vGk * 2.0 * smoothstep(0.35, 0.8, uNight) * 1.6;`);
  };
  glow.customProgramCacheKey = () => 'bld-glow-v1';
  const cutDepth = new THREE.MeshDepthMaterial({ map: cutAtlas(), alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  cutDepth.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aUv.xy;\n#endif');
  };
  cutDepth.customProgramCacheKey = () => 'bld-cutdepth-v1';
  return { decal, cut, cutDepth, glow };
}
