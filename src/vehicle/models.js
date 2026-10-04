/**
 * HILLBOMB: San Francisco. Procedural car models (no asset files).
 * Owner: car models agent. See CONVENTIONS.md.
 *
 * Local frame: +X right, +Y up, -Z forward. Origin on the ground (y = 0 = tyre contact),
 * x = 0 centre line, z = 0 midway between the axles. US cars: driver on the left (-X).
 *
 * How a body is made:
 *   1. lower body  = a loft of cross-sections along z (wheel wells notched out, crowned hood/deck,
 *                    rounded shoulders, rounded nose/tail). Profile tables per model drive it.
 *   2. greenhouse  = a second loft sitting on the belt line; its quads are split into glass
 *                    (windshield / side / rear) and pillars by z-range, so glass and paint meet exactly.
 *   3. details     = conformal patches projected onto the body (lamps, grilles, seams, liveries),
 *                    swept tubes (bumpers, trims) and small primitives, all merged per material.
 *   4. wheels      = revolved tyre + rim profile with real spokes, one geometry per model.
 * Everything is built once per model id and shared by every instance (lazy, ~30-80 ms per id).
 *
 * Per instance meshes / draw calls (8-9): paint, [paint2 livery], details, lamps, glass, 4 wheels.
 *   paint / paint2 : per-instance MeshPhysicalMaterial (clearcoat) -> setPaint(hex) / setPaint2(hex)
 *   details        : ONE shared MeshStandardMaterial (vertex colours + atlas map + per-vertex metal/rough
 *                    via the 'surf' attribute, patched in onBeforeCompile): trim, chrome, rubber, interior,
 *                    grilles, plates, decals. The wheel meshes share it too.
 *   lamps          : per-instance MeshStandardMaterial; every lamp vertex carries a 'lampId' group and
 *                    the emissive intensity comes from a uniform array driven by setLights():
 *                    0 static amber, 1 head, 2 tail, 3 brake-only (CHMSL), 4 reverse, 5 siren red,
 *                    6 siren blue, 7 sign (taxi, lit with head), 8 DRL / light bars, 9 always-on sign (bus).
 *   glass          : one shared transparent material (depthWrite false, no shadow).
 * Extras on the returned object (beyond the contract): setPaint2(hex), spec.
 * Debug exports prefixed with '_' are for dev/cars.html only.
 */
import * as THREE from 'three';
import { applyCarProbe } from '../render/carprobe.js';
import { wheelOBC, paintUniforms, paintLayersOBC, lampDepthOBC, NOISE_GLSL } from './carshade.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { packedUrl, loadPacked } from '../world/texpack.js';

export const MODEL_IDS = ['hatch', 'sedan', 'taxi', 'police', 'muscle', 'coupe', 'super', 'suv', 'pickup', 'van', 'boxtruck', 'bus', 'ev', 'rally', 'cablecar',
  'brawler', 'vandal', 'stallion18', 'hellion', 'comet', 'rz7', 'kaminari', 'raiden', 'senkou', 'hachi', 'sora', 'classic9', 'coupeGT', 'k5', 'k3', 'sovereign', 'vanguard',
  'sport1', 'aspro', 'rallye6', 'saetta', 'seiun', 'contessa', 'tempesta', 'stradale', 'funo', 'aska', 'celerite', 'munja', 'elektra',
  'piccina', 'nipper', 'petard', 'gauner', 'tora', 'kugel', 'picknick', 'buggy', 'trophy', 'trekker', 'kodiak', 'baja', 'kestrel'];

// ================================================================== math helpers
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sq = (x) => x * x;
const bez2 = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Monotone cubic (Fritsch-Carlson) interpolation through [[x, y], ...]; clamps outside the range. */
function pchip(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  if (n === 1) return () => ys[0];
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * m[lo + 1];
  };
}
const F = (v) => (typeof v === 'function' ? v : Array.isArray(v) ? pchip(v) : () => v);

// ================================================================== texture atlas
const AS = 1024;
const TEX = {
  WHITE: [0, 0, 64, 64],
  HEAD: [64, 0, 256, 72],
  HEADR: [320, 0, 128, 128],
  TAIL: [448, 0, 256, 128],
  TAILBAR: [704, 0, 320, 64],
  CHROMEBAR: [704, 64, 320, 64],
  HONEY: [0, 128, 256, 128],
  SLATS: [256, 128, 256, 128],
  EGG: [512, 128, 256, 128],
  VBARS: [768, 128, 256, 128],
  PLATE0: [0, 256, 256, 128], PLATE1: [256, 256, 256, 128], PLATE2: [512, 256, 256, 128], PLATE3: [768, 256, 256, 128],
  POLICE: [0, 384, 512, 128],
  TAXI: [512, 384, 256, 128],
  CHECKER: [768, 384, 256, 64],
  LOUVER: [768, 448, 256, 64],
  BUSDEST: [0, 512, 512, 96],
  CABLESIGN: [512, 512, 512, 96],
  ROUNDEL: [0, 608, 192, 192],
  SPONSOR: [192, 608, 512, 96],
  BANNER: [192, 704, 512, 64],
  BADGE: [704, 608, 96, 96],
  CARNUM: [800, 608, 128, 96],
  UNIT: [928, 608, 96, 96],
  ROUTE: [704, 704, 192, 96],
};
const TEXR = {};
for (const k in TEX) {
  const [x, y, w, h] = TEX[k], e = 1.5;
  TEXR[k] = [(x + e) / AS, 1 - (y + h - e) / AS, (x + w - e) / AS, 1 - (y + e) / AS];
}
const WUV = [32 / AS, 1 - 32 / AS];
function texUV(tex, u, v) { const r = TEXR[tex]; return [lerp(r[0], r[2], u), lerp(r[1], r[3], v)]; }

let _atlas = null;
function getAtlas() {
  if (_atlas) return _atlas;
  let canvas = null;
  try {
    if (typeof document !== 'undefined') canvas = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(AS, AS);
  } catch (e) { canvas = null; }
  const g = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (g) {
    canvas.width = AS; canvas.height = AS;
    drawAtlas(g);
    _atlas = new THREE.CanvasTexture(canvas);
    _atlas.anisotropy = 8;
  } else {
    _atlas = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    _atlas.needsUpdate = true;
  }
  _atlas.colorSpace = THREE.SRGBColorSpace;
  return _atlas;
}

function drawAtlas(g) {
  const R = (k) => TEX[k];
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const text = (s, x, y, w, h, font, color, align = 'center') => {
    g.save(); g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
    let size = h; g.font = font.replace('#', size + 'px');
    while (g.measureText(s).width > w && size > 6) { size -= 2; g.font = font.replace('#', size + 'px'); }
    g.fillText(s, align === 'center' ? x + w / 2 : x, y + h / 2 + size * 0.04); g.restore();
  };
  g.clearRect(0, 0, AS, AS);
  { const [x, y, w, h] = R('WHITE'); g.fillStyle = '#fff'; g.fillRect(x, y, w, h); }
  // modern projector headlamp (drawn for a ~3.5:1 lamp)
  {
    const [x, y, w, h] = R('HEAD');
    let gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#62686f'); gr.addColorStop(1, '#1e2125');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = '#aab1b9'; g.fillRect(x, y + h * 0.12, w, h * 0.05);
    for (const [cx, r] of [[x + w * 0.3, h * 0.26], [x + w * 0.56, h * 0.22]]) {
      const cy = y + h * 0.48;
      const rg = g.createRadialGradient(cx, cy, 1, cx, cy, r);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, '#f2f6ff'); rg.addColorStop(0.6, '#9aa1a9'); rg.addColorStop(0.85, '#4d5359'); rg.addColorStop(1, '#2a2d31');
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    }
    g.fillStyle = '#ffffff'; rr(x + w * 0.06, y + h * 0.78, w * 0.86, h * 0.1, h * 0.05); g.fill();
    g.fillStyle = '#dfe6ee'; rr(x + w * 0.72, y + h * 0.3, w * 0.2, h * 0.34, h * 0.08); g.fill();
  }
  // round reflector headlamp
  {
    const [x, y, w, h] = R('HEADR'); const cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = '#2b2e33'; g.fillRect(x, y, w, h);
    const rg = g.createRadialGradient(cx, cy, 2, cx, cy, w * 0.5);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.18, '#ffffff'); rg.addColorStop(0.3, '#c8cdd4'); rg.addColorStop(0.55, '#eef2f6'); rg.addColorStop(0.75, '#8a9098'); rg.addColorStop(0.95, '#dfe3e8'); rg.addColorStop(1, '#555a60');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, w * 0.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 14, y + 8); g.lineTo(cx + i * 14, y + h - 8); g.stroke(); }
  }
  // modern tail lamp
  {
    const [x, y, w, h] = R('TAIL');
    g.fillStyle = '#4a0508'; g.fillRect(x, y, w, h);
    g.fillStyle = '#b3121b'; g.fillRect(x, y + h * 0.1, w, h * 0.8);
    g.strokeStyle = '#ff5048'; g.lineWidth = h * 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + w * 0.12, y + h * 0.25); g.lineTo(x + w * 0.9, y + h * 0.25); g.lineTo(x + w * 0.9, y + h * 0.75); g.stroke();
    g.lineWidth = h * 0.05; g.strokeStyle = '#e02630';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + w * (0.18 + i * 0.16), y + h * 0.45); g.lineTo(x + w * (0.28 + i * 0.16), y + h * 0.62); g.stroke(); }
  }
  // full-width tail bar
  {
    const [x, y, w, h] = R('TAILBAR');
    g.fillStyle = '#3c0407'; g.fillRect(x, y, w, h);
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#6a0a0e'); gr.addColorStop(0.5, '#ff3a36'); gr.addColorStop(1, '#6a0a0e');
    g.fillStyle = gr; g.fillRect(x, y + h * 0.2, w, h * 0.6);
  }
  // chrome bar (brightwork) gradient
  {
    const [x, y, w, h] = R('CHROMEBAR');
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#9ea4ab'); gr.addColorStop(0.55, '#3c4046'); gr.addColorStop(1, '#e8ebee');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  // honeycomb mesh
  {
    const [x, y, w, h] = R('HONEY');
    g.fillStyle = '#050505'; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = '#34373b'; g.lineWidth = 3;
    const s = 11;
    for (let row = -1; row < h / (s * 1.5) + 1; row++) for (let col = -1; col < w / (s * 1.732) + 1; col++) {
      const cx = x + col * s * 1.732 + (row % 2 ? s * 0.866 : 0), cy = y + row * s * 1.5;
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + s * Math.cos(a), cy + s * Math.sin(a)); } g.closePath(); g.stroke();
    }
    g.restore();
  }
  // horizontal slats
  {
    const [x, y, w, h] = R('SLATS');
    g.fillStyle = '#060606'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) {
      const yy = y + 8 + i * (h - 16) / 5.2;
      const gr = g.createLinearGradient(0, yy, 0, yy + 10); gr.addColorStop(0, '#8f959c'); gr.addColorStop(0.5, '#2b2e32'); gr.addColorStop(1, '#101113');
      g.fillStyle = gr; g.fillRect(x + 4, yy, w - 8, 10);
    }
  }
  // egg-crate (vintage)
  {
    const [x, y, w, h] = R('EGG');
    g.fillStyle = '#070707'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#4d5157'; g.lineWidth = 3;
    for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(x + i * w / 16, y); g.lineTo(x + i * w / 16, y + h); g.stroke(); }
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(x, y + i * h / 6); g.lineTo(x + w, y + i * h / 6); g.stroke(); }
  }
  // vertical bars
  {
    const [x, y, w, h] = R('VBARS');
    g.fillStyle = '#080808'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 18; i++) { const gr = g.createLinearGradient(x + i * 14, 0, x + i * 14 + 8, 0); gr.addColorStop(0, '#8d9399'); gr.addColorStop(1, '#222'); g.fillStyle = gr; g.fillRect(x + 4 + i * 14, y, 7, h); }
  }
  // licence plates (fictional numbers, US 12x6 in layout)
  ['7HLB042', '8BMB517', '6SFC219', '9KRL304'].forEach((num, i) => {
    const [x, y, w, h] = R('PLATE' + i);
    g.fillStyle = '#f7f7f4'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#1b2a5a'; g.lineWidth = 4; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    text('California', x, y + 8, w, 30, 'italic bold # Georgia, serif', '#b3202a');
    text(num, x + 10, y + 42, w - 20, 70, 'bold # "Arial Narrow", Arial, sans-serif', '#1b2a5a');
  });
  // POLICE door text (transparent background)
  {
    const [x, y, w, h] = R('POLICE');
    text('POLICE', x + 8, y + 6, w - 16, 84, 'bold # Arial, Helvetica, sans-serif', '#0d1d44');
    g.fillStyle = '#b5122a'; g.fillRect(x + 20, y + 98, w - 40, 8);
    text('HILLBOMB CITY  UNIT 12', x + 20, y + 106, w - 40, 20, 'bold # Arial, sans-serif', '#0d1d44');
  }
  // TAXI sign (lit panel with dark letters)
  {
    const [x, y, w, h] = R('TAXI');
    g.fillStyle = '#fff6d8'; g.fillRect(x, y, w, h);
    text('TAXI', x + 10, y + 10, w - 20, h - 20, 'bold # Arial Black, Arial, sans-serif', '#1a1a1a');
  }
  // checker strip
  {
    const [x, y, w, h] = R('CHECKER'); const n = 16, s = w / n;
    for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++) { g.fillStyle = (r + c) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x + c * s, y + r * h / 2, s, h / 2); }
  }
  // louvres
  {
    const [x, y, w, h] = R('LOUVER');
    g.fillStyle = '#0a0a0a'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 12; i++) { const gr = g.createLinearGradient(x + i * w / 12, 0, x + (i + 1) * w / 12, 0); gr.addColorStop(0, '#3a3d42'); gr.addColorStop(0.6, '#15171a'); gr.addColorStop(1, '#050505'); g.fillStyle = gr; g.fillRect(x + i * w / 12 + 2, y + 3, w / 12 - 4, h - 6); }
  }
  // bus destination (LED, drawn white, tinted amber by vertex colour)
  {
    const [x, y, w, h] = R('BUSDEST');
    g.fillStyle = '#000'; g.fillRect(x, y, w, h);
    text('38', x + 8, y + 8, 90, h - 16, 'bold # Arial, sans-serif', '#fff', 'left');
    text('GEARY  OCEAN BEACH', x + 110, y + 14, w - 124, h - 28, 'bold # Arial, sans-serif', '#fff');
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < w; i += 4) g.fillRect(x + i, y, 1, h);
    for (let j = 0; j < h; j += 4) g.fillRect(x, y + j, w, 1);
  }
  // cable car roof sign
  {
    const [x, y, w, h] = R('CABLESIGN');
    g.fillStyle = '#f1e7cb'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#1f2e5c'; g.lineWidth = 5; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    text('POWELL & MASON', x + 16, y + 14, w - 32, h - 28, 'bold # Georgia, serif', '#1f2e5c');
  }
  // rally roundel
  {
    const [x, y, w, h] = R('ROUNDEL');
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.47, 0, TAU); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 8; g.stroke();
    text('27', x + 20, y + 30, w - 40, h - 60, 'bold # Arial Black, Arial, sans-serif', '#111');
  }
  { const [x, y, w, h] = R('SPONSOR'); text('HILLBOMB', x, y, w, h, 'italic bold # Arial Black, Arial, sans-serif', '#ffffff'); }
  { const [x, y, w, h] = R('BANNER'); g.fillStyle = '#0c0c0c'; g.fillRect(x, y, w, h); text('HILLBOMB RALLY TEAM', x + 10, y + 4, w - 20, h - 8, 'bold # Arial, sans-serif', '#ffd21a'); }
  // badge emblem (fictional): ring with a stylised hill/chevron
  {
    const [x, y, w, h] = R('BADGE'); const cx = x + w / 2, cy = y + h / 2;
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#8f959c'); gr.addColorStop(1, '#e9ecef');
    g.strokeStyle = gr; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, w * 0.4, 0, TAU); g.stroke();
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx - w * 0.3, cy + h * 0.16); g.lineTo(cx, cy - h * 0.2); g.lineTo(cx + w * 0.3, cy + h * 0.16); g.lineTo(cx + w * 0.18, cy + h * 0.16); g.lineTo(cx, cy - h * 0.04); g.lineTo(cx - w * 0.18, cy + h * 0.16); g.closePath(); g.fill();
  }
  { const [x, y, w, h] = R('CARNUM'); text('12', x, y, w, h, 'bold # Georgia, serif', '#e2b64e'); }
  { const [x, y, w, h] = R('UNIT'); text('12', x, y, w, h, 'bold # Arial Black, Arial, sans-serif', '#111'); }
  { const [x, y, w, h] = R('ROUTE'); g.fillStyle = '#000'; g.fillRect(x, y, w, h); text('38', x, y + 6, w, h - 12, 'bold # Arial, sans-serif', '#fff'); }
}

// ================================================================== finishes
// A finish says which merged mesh a triangle goes to ('b') plus its vertex colour / metal / rough / lamp group / texture.
const C = (hex) => new THREE.Color(hex);
const D = (hex, m, r, o) => Object.assign({ b: 'details', col: C(hex), m, r }, o);
const LAMP = { NONE: 0, HEAD: 1, TAIL: 2, BRAKE: 3, REV: 4, RED: 5, BLUE: 6, SIGN: 7, DRL: 8, ALWAYS: 9 };
const Lf = (hex, lamp, tex) => ({ b: 'lamps', col: C(hex), m: 0, r: 0.2, lamp, tex });
const FIN = {
  paint: { b: 'paint' },
  paint2: { b: 'paint2' },
  glass: { b: 'glass' },
  black: D(0x0e0e0f, 0.0, 0.62),
  blackGloss: D(0x060607, 0.25, 0.14),
  trim: D(0x121214, 0.1, 0.35),
  rubber: D(0x121212, 0.0, 0.9),
  under: D(0x0f0f11, 0.0, 0.9),
  well: D(0x080808, 0.0, 0.95),
  chrome: D(0xf2f3f6, 1.0, 0.07),
  darkChrome: D(0x585c63, 1.0, 0.16),
  alu: D(0xc9ccd1, 0.95, 0.26),
  silver: D(0xaeb3b9, 0.9, 0.32),
  gun: D(0x44474d, 0.9, 0.33),
  graphite: D(0x2a2c30, 0.85, 0.35),
  interior: D(0x1c1c1e, 0.0, 0.85),
  seat: D(0x28282b, 0.0, 0.8),
  dash: D(0x141416, 0.1, 0.6),
  wood: D(0x6b3f1f, 0.0, 0.55),
  woodLight: D(0x9a6a3c, 0.0, 0.5),
  gold: D(0xd8aa48, 1.0, 0.24),
  brass: D(0xc8a04a, 1.0, 0.3),
  white: D(0xf0f0f0, 0.0, 0.38),
  cream: D(0xefe4c8, 0.0, 0.45),
  grey: D(0x6d7075, 0.2, 0.55),
  roofGrey: D(0x8d8a84, 0.0, 0.8),
  steel: D(0x9aa0a6, 0.85, 0.4),
  bedliner: D(0x151515, 0.0, 0.97),
  seam: D(0x050505, 0.0, 0.8),
  grille: D(0x0c0c0d, 0.3, 0.45),
  mirrorGlass: D(0xb8c2cc, 1.0, 0.03),
  tyre: D(0x1b1b1c, 0.0, 0.86),
  tread: D(0x111112, 0.0, 0.95),
  barrel: D(0x2c2e31, 0.7, 0.45),
  wheelBack: D(0x121213, 0.3, 0.7),
  rotor: D(0x8a8d91, 0.9, 0.42),
  red: D(0xb01a20, 0.0, 0.45),
  yellow: D(0xf5c518, 0.0, 0.45),
  plate: D(0xffffff, 0.0, 0.45),
  decal: D(0xffffff, 0.0, 0.45),
  decalChrome: D(0xffffff, 1.0, 0.22),
};
const tx = (fin, tex, extra) => Object.assign({}, fin, { tex }, extra);

// ================================================================== geometry accumulation
function makeCtx(P, lod) {
  const mk = () => ({ pos: [], nor: [], col: [], uv: [], surf: [], lamp: [], tag: [] });
  return {
    P, lod, B: { paint: mk(), paint2: mk(), details: mk(), glass: mk(), lamps: mk() }, tag: 0, rec: P._hq ? [] : null,
    bmin: [Infinity, Infinity, Infinity], bmax: [-Infinity, -Infinity, -Infinity], noBounds: false,
    head: [], exhaust: [], tgtP: [], tgtN: [], proj: null,
  };
}

function pushVert(ctx, bk, fin, x, y, z, nx, ny, nz, u, v) {
  bk.pos.push(x, y, z); bk.nor.push(nx, ny, nz);
  const c = fin.col; if (c) bk.col.push(c.r, c.g, c.b); else bk.col.push(1, 1, 1);
  bk.uv.push(u, v); bk.surf.push(fin.m || 0, fin.r ?? 0.5); bk.lamp.push(fin.lamp || 0); bk.tag.push(ctx.tag);
  if (!ctx.noBounds) {
    const a = ctx.bmin, b = ctx.bmax;
    if (x < a[0]) a[0] = x; if (y < a[1]) a[1] = y; if (z < a[2]) a[2] = z;
    if (x > b[0]) b[0] = x; if (y > b[1]) b[1] = y; if (z > b[2]) b[2] = z;
  }
}

/** Blender hero pass (tools/blender/car_hero.py): export-only records of the detail calls; every vertex emitted inside one
 *  carries the record id (bucket 'tag'), so the Blender pass can replace the flat decal version with modelled geometry. */
const finRec = (f) => f && ({ b: f.b, lamp: f.lamp || 0, tex: f.tex || null, m: f.m || 0, r: f.r ?? 0.5, col: f.col ? [f.col.r, f.col.g, f.col.b] : null, seam: f === FIN.seam });
function tagged(ctx, mkRec, fn) {
  if (!ctx.rec || ctx.lod) return fn();
  const rec = mkRec();
  rec.parent = ctx.tag; ctx.rec.push(rec); rec.id = ctx.rec.length;
  const t0 = ctx.tag; ctx.tag = rec.id;
  try { return fn(); } finally { ctx.tag = t0; }
}

/** Triangle soup: positions + one finish per triangle (+ optional local uv), normals computed later. */
class Soup {
  constructor() { this.p = []; this.f = []; this.uv = []; this.gr = []; this.g = 0; }
  tri(a, b, c, f, ua, ub, uc) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); this.f.push(f); this.gr.push(this.g);
    if (ua) this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]); else this.uv.push(0, 0, 0, 0, 0, 0);
  }
}

/** Smooth normals, but only across edges whose faces differ by less than `deg` (area weighted). */
function creaseNormals(p, deg, gr = null) {
  const nt = (p.length / 9) | 0, cosT = Math.cos((deg * Math.PI) / 180);
  const fu = new Float64Array(nt * 3), fa = new Float64Array(nt * 3);
  const keys = new Array(nt * 3), map = new Map();
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const e1x = p[o + 3] - p[o], e1y = p[o + 4] - p[o + 1], e1z = p[o + 5] - p[o + 2];
    const e2x = p[o + 6] - p[o], e2y = p[o + 7] - p[o + 1], e2z = p[o + 8] - p[o + 2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(cx, cy, cz) || 1e-30;
    fa[t * 3] = cx; fa[t * 3 + 1] = cy; fa[t * 3 + 2] = cz;
    fu[t * 3] = cx / l; fu[t * 3 + 1] = cy / l; fu[t * 3 + 2] = cz / l;
    for (let v = 0; v < 3; v++) {
      const k = (gr ? gr[t] + '|' : '') + Math.round(p[o + v * 3] * 1e4) + '_' + Math.round(p[o + v * 3 + 1] * 1e4) + '_' + Math.round(p[o + v * 3 + 2] * 1e4);
      keys[t * 3 + v] = k;
      let arr = map.get(k); if (!arr) map.set(k, (arr = [])); arr.push(t);
    }
  }
  const out = new Float32Array(nt * 9);
  for (let t = 0; t < nt; t++) {
    const ux = fu[t * 3], uy = fu[t * 3 + 1], uz = fu[t * 3 + 2];
    for (let v = 0; v < 3; v++) {
      let sx = 0, sy = 0, sz = 0;
      for (const s of map.get(keys[t * 3 + v])) {
        if (fu[s * 3] * ux + fu[s * 3 + 1] * uy + fu[s * 3 + 2] * uz >= cosT) { sx += fa[s * 3]; sy += fa[s * 3 + 1]; sz += fa[s * 3 + 2]; }
      }
      const l = Math.hypot(sx, sy, sz);
      if (l < 1e-24) { sx = ux; sy = uy; sz = uz; } else { sx /= l; sy /= l; sz /= l; }
      out[t * 9 + v * 3] = sx; out[t * 9 + v * 3 + 1] = sy; out[t * 9 + v * 3 + 2] = sz;
    }
  }
  return out;
}

function emitSoup(ctx, soup, deg = 40, asTarget = false) {
  const p = soup.p, n = creaseNormals(p, deg, soup.gr), nt = soup.f.length;
  for (let t = 0; t < nt; t++) {
    const fin = soup.f[t], bk = ctx.B[fin.b];
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      const uv = fin.tex ? texUV(fin.tex, soup.uv[t * 6 + v * 2], soup.uv[t * 6 + v * 2 + 1]) : WUV;
      pushVert(ctx, bk, fin, p[o], p[o + 1], p[o + 2], n[o], n[o + 1], n[o + 2], uv[0], uv[1]);
    }
  }
  if (asTarget) for (let i = 0; i < p.length; i++) { ctx.tgtP.push(p[i]); ctx.tgtN.push(n[i]); }
}

/** Orient a quad (a,b,c,d) so its normal agrees with `en`, then add it. */
function quadO(soup, a, b, c, d, en, f, ua, ub, uc, ud) {
  const n = cross3(sub3(c, a), sub3(d, b));
  if (dot3(n, en) < 0) { soup.tri(a, c, b, f, ua, uc, ub); soup.tri(a, d, c, f, ua, ud, uc); }
  else { soup.tri(a, b, c, f, ua, ub, uc); soup.tri(a, c, d, f, ua, uc, ud); }
}
function triO(soup, a, b, c, en, f) {
  const n = cross3(sub3(b, a), sub3(c, a));
  if (dot3(n, en) < 0) soup.tri(a, c, b, f); else soup.tri(a, b, c, f);
}

// ---------------------------------------------------------------- primitives (three geometries, transformed)
const _qq = new THREE.Quaternion(), _ee = new THREE.Euler();
function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _qq.setFromEuler(_ee.set(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
}
const GEO = {};
const geoC = (key, fn) => GEO[key] || (GEO[key] = fn());
const BOX = () => geoC('box', () => new THREE.BoxGeometry(1, 1, 1).toNonIndexed());
const CYL = (n = 12, open = false) => geoC('cyl' + n + open, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, open).toNonIndexed());
const SPH = (w = 12, h = 8) => geoC('sph' + w + '_' + h, () => new THREE.SphereGeometry(1, w, h).toNonIndexed());
const TOR = () => geoC('tor', () => new THREE.TorusGeometry(1, 0.1, 4, 14).toNonIndexed());

function addGeo(ctx, geo, fin, m) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv ? g.attributes.uv.array : null;
  const e = m.elements, nm = new THREE.Matrix3().getNormalMatrix(m).elements;
  const flip = m.determinant() < 0, bk = ctx.B[fin.b], n = pa.length / 3;
  for (let i = 0; i < n; i += 3) {
    for (let j = 0; j < 3; j++) {
      const k = i + (flip ? (j === 0 ? 0 : 3 - j) : j);
      const x = pa[k * 3], y = pa[k * 3 + 1], z = pa[k * 3 + 2];
      const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = na[k * 3], ny = na[k * 3 + 1], nz = na[k * 3 + 2];
      let NX = nm[0] * nx + nm[3] * ny + nm[6] * nz, NY = nm[1] * nx + nm[4] * ny + nm[7] * nz, NZ = nm[2] * nx + nm[5] * ny + nm[8] * nz;
      const l = Math.hypot(NX, NY, NZ) || 1;
      const uv = ua && fin.tex ? texUV(fin.tex, ua[k * 2], ua[k * 2 + 1]) : WUV;
      pushVert(ctx, bk, fin, X, Y, Z, NX / l, NY / l, NZ / l, uv[0], uv[1]);
    }
  }
}
const box = (ctx, fin, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => addGeo(ctx, BOX(), fin, M(x, y, z, rx, ry, rz, sx, sy, sz));
/** cylinder between points a and b */
function cylAB(ctx, fin, a, b, r, n = 10, open = false, r2 = null) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(r, len, r2 ?? r));
  addGeo(ctx, CYL(n, open), fin, m);
}
function rbox(ctx, fin, x, y, z, sx, sy, sz, r, rx = 0, ry = 0, rz = 0, n = 1) {
  // chamfered (n=1) or rounded (n>1) box built from a lofted rounded-rect section; cached per size
  const key = 'rb' + [sx, sy, sz, r, n].map((v) => v.toFixed(3)).join('_');
  const g = geoC(key, () => roundBoxGeo(sx, sy, sz, r, n));
  addGeo(ctx, g, fin, M(x, y, z, rx, ry, rz));
}
function roundBoxGeo(sx, sy, sz, r, n = 1) {
  r = Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4);
  const soup = new Soup(), hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const ring = (inset) => {
    const pts = []; const rr = Math.max(1e-4, r - inset);
    const cs = [[hx - r, -hy + r, -Math.PI / 2], [hx - r, hy - r, 0], [-hx + r, hy - r, Math.PI / 2], [-hx + r, -hy + r, Math.PI]];
    for (const [cx, cy, a] of cs) for (let i = 0; i <= n; i++) { const t = a + (i / n) * Math.PI / 2; pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]); }
    return pts;
  };
  const st = [];
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI / 2; st.push([-hz + r - r * Math.cos(t), r - r * Math.sin(t)]); }
  for (let i = n; i >= 0; i--) { const t = (i / n) * Math.PI / 2; st.push([hz - r + r * Math.cos(t), r - r * Math.sin(t)]); }
  const rings = st.map(([z, ins]) => ring(ins).map(([x, y]) => [x, y, z]));
  const f = { b: 'x' };
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let k = 0; k < A.length; k++) { const k1 = (k + 1) % A.length; soup.tri(A[k], A[k1], B[k], f); soup.tri(A[k1], B[k1], B[k], f); }
  }
  const cap = (R, flip) => { const c = [0, 0, R[0][2]]; for (let k = 0; k < R.length; k++) { const k1 = (k + 1) % R.length; if (flip) soup.tri(c, R[k1], R[k], f); else soup.tri(c, R[k], R[k1], f); } };
  cap(rings[0], true); cap(rings[rings.length - 1], false);
  const nrm = creaseNormals(soup.p, n > 1 ? 60 : 30);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(soup.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

// ---------------------------------------------------------------- revolve (axis X by default)
/** prof: [[a (axial), r], ...]; outward side is to the LEFT of the walking direction in (a, r). */
function revolve(soup, prof, segs, fins, frame = null, phase = 0) {
  const map = frame || ((a, y, z) => [a, y, z]);
  for (let s = 0; s < segs; s++) {
    const t0 = phase + (s / segs) * TAU, t1 = phase + ((s + 1) / segs) * TAU, tm = (t0 + t1) / 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    for (let i = 0; i < prof.length - 1; i++) {
      const [a0, r0] = prof[i], [a1, r1] = prof[i + 1];
      const A = map(a0, r0 * c0, r0 * s0), B = map(a1, r1 * c0, r1 * s0), Cc = map(a1, r1 * c1, r1 * s1), Dd = map(a0, r0 * c1, r0 * s1);
      const da = a1 - a0, dr = r1 - r0;
      const o = map(0, 0, 0), en0 = map(-dr, da * Math.cos(tm), da * Math.sin(tm));
      const en = [en0[0] - o[0], en0[1] - o[1], en0[2] - o[2]];
      quadO(soup, A, B, Cc, Dd, en, Array.isArray(fins) ? fins[i] : fins);
    }
  }
}

// ================================================================== projector (axis aligned ray casts onto the body)
class Projector {
  constructor(p, n) { this.p = Float32Array.from(p); this.n = Float32Array.from(n); this.g = {}; }
  grid(axis) {
    if (this.g[axis]) return this.g[axis];
    const [ia, ib] = axis === 'z' ? [0, 1] : axis === 'x' ? [2, 1] : [0, 2];
    const p = this.p, nt = p.length / 9;
    let minA = Infinity, minB = Infinity, maxA = -Infinity, maxB = -Infinity;
    for (let i = 0; i < p.length; i += 3) { minA = Math.min(minA, p[i + ia]); maxA = Math.max(maxA, p[i + ia]); minB = Math.min(minB, p[i + ib]); maxB = Math.max(maxB, p[i + ib]); }
    const cs = 0.06, na = Math.ceil((maxA - minA) / cs) + 1, nb = Math.ceil((maxB - minB) / cs) + 1;
    const cells = new Array(na * nb);
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const a0 = Math.min(p[o + ia], p[o + 3 + ia], p[o + 6 + ia]), a1 = Math.max(p[o + ia], p[o + 3 + ia], p[o + 6 + ia]);
      const b0 = Math.min(p[o + ib], p[o + 3 + ib], p[o + 6 + ib]), b1 = Math.max(p[o + ib], p[o + 3 + ib], p[o + 6 + ib]);
      const ca0 = Math.floor((a0 - minA) / cs), ca1 = Math.floor((a1 - minA) / cs), cb0 = Math.floor((b0 - minB) / cs), cb1 = Math.floor((b1 - minB) / cs);
      for (let a = ca0; a <= ca1; a++) for (let b = cb0; b <= cb1; b++) { const k = a + b * na; (cells[k] || (cells[k] = [])).push(t); }
    }
    return (this.g[axis] = { ia, ib, minA, minB, cs, na, nb, cells });
  }
  /** dir: '-z' front, '+z' rear, '+x' right, '-x' left, '+y' top. (a,b) = (x,y) | (z,y) | (x,z). */
  hit(dir, a, b) {
    const axis = dir[1], sgn = dir[0] === '+' ? 1 : -1;
    const G = this.grid(axis), ic = axis === 'z' ? 2 : axis === 'x' ? 0 : 1, { ia, ib } = G;
    const ca = Math.floor((a - G.minA) / G.cs), cb = Math.floor((b - G.minB) / G.cs);
    if (ca < 0 || cb < 0 || ca >= G.na || cb >= G.nb) return null;
    const list = G.cells[ca + cb * G.na]; if (!list) return null;
    const p = this.p;
    let best = -1, bd = -Infinity, bl0 = 0, bl1 = 0, bl2 = 0;
    for (const t of list) {
      const o = t * 9;
      const a0 = p[o + ia], b0 = p[o + ib], a1 = p[o + 3 + ia], b1 = p[o + 3 + ib], a2 = p[o + 6 + ia], b2 = p[o + 6 + ib];
      const det = (b1 - b2) * (a0 - a2) + (a2 - a1) * (b0 - b2);
      if (Math.abs(det) < 1e-12) continue;
      const l0 = ((b1 - b2) * (a - a2) + (a2 - a1) * (b - b2)) / det;
      const l1 = ((b2 - b0) * (a - a2) + (a0 - a2) * (b - b2)) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-7 || l1 < -1e-7 || l2 < -1e-7) continue;
      const d = (l0 * p[o + ic] + l1 * p[o + 3 + ic] + l2 * p[o + 6 + ic]) * sgn;
      if (d > bd) { bd = d; best = t; bl0 = l0; bl1 = l1; bl2 = l2; }
    }
    if (best < 0) return null;
    const o = best * 9, n = this.n;
    const P = [0, 1, 2].map((c) => bl0 * p[o + c] + bl1 * p[o + 3 + c] + bl2 * p[o + 6 + c]);
    const N = norm3([0, 1, 2].map((c) => bl0 * n[o + c] + bl1 * n[o + 3 + c] + bl2 * n[o + 6 + c]));
    return { p: P, n: N };
  }
}

// ---------------------------------------------------------------- 2D polygon helpers
function ell(cx, cy, rx, ry, n = 20, a0 = 0) { const o = []; for (let i = 0; i < n; i++) { const t = a0 + (i / n) * TAU; o.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); } return o; }
function rrect(x0, y0, x1, y1, r, n = 3) {
  r = Math.min(r, (x1 - x0) / 2 - 1e-5, (y1 - y0) / 2 - 1e-5);
  const o = [], cs = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  for (const [cx, cy, a] of cs) for (let i = 0; i <= n; i++) { const t = a + (i / n) * Math.PI / 2; o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return o;
}
const mirX = (poly) => poly.map((p) => [-p[0], p[1]]).reverse();
const area2 = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
/** offset a polygon outward by d (miter limited) */
function grow(poly, d) {
  const n = poly.length, s = area2(poly) > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    let e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [(s * e1[1]) / l1, (-s * e1[0]) / l1], n2 = [(s * e2[1]) / l2, (-s * e2[0]) / l2];
    let m = [n1[0] + n2[0], n1[1] + n2[1]]; const lm = Math.hypot(m[0], m[1]) || 1; m = [m[0] / lm, m[1] / lm];
    const k = d / Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
    return [p[0] + m[0] * k, p[1] + m[1] * k];
  });
}
function densify(pts, maxE, closed) {
  const o = [], n = pts.length, lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const a = pts[i], b = pts[(i + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxE));
    for (let j = 0; j < k; j++) o.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  if (!closed) o.push(pts[n - 1]);
  return o;
}

/** Sutherland-Hodgman clip of a polygon against an axis aligned rectangle */
function clipRect(poly, x0, y0, x1, y1) {
  let out = poly;
  for (const [ax, v, s] of [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]]) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const P = inp[i], Q = inp[(i + 1) % inp.length], pin = s * (P[ax] - v) >= 0, qin = s * (Q[ax] - v) >= 0;
      if (pin) out.push(P);
      if (pin !== qin) { const t = (v - P[ax]) / (Q[ax] - P[ax]); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
    if (!out.length) break;
  }
  return out;
}
function earcutInto(tris, poly, holes) {
  const pts = poly.concat(...holes);
  const faces = THREE.ShapeUtils.triangulateShape(poly.map((q) => new THREE.Vector2(q[0], q[1])), holes.map((h) => h.map((q) => new THREE.Vector2(q[0], q[1]))));
  for (const f of faces) tris.push([pts[f[0]], pts[f[1]], pts[f[2]]]);
}

/**
 * Conformal patch: tessellate a 2D polygon in the view plane of `dir` (grid clipped, then refined where the
 * body curves), project every vertex onto the body along the view axis and lift it by `off` along the
 * surface normal. `depth` extrudes it with side walls.
 */
function patch(ctx, dir, poly, fin, o = {}) { return tagged(ctx, () => ({ k: 'patch', dir, poly, fin: finRec(fin), off: o.off ?? 0.005, depth: o.depth || 0, holes: o.holes || null, strip: !!o.tris2d }), () => patch_(ctx, dir, poly, fin, o)); }
function patch_(ctx, dir, poly, fin, o = {}) {
  if (!ctx.proj || !poly || poly.length < 3) return null;
  const lod = ctx.lod, off = o.off ?? 0.005, depth = o.depth || 0;
  const cell = lod ? Math.max(0.6, o.maxEdge || 0) : (o.maxEdge ?? 0.12), tol = 0.0025, maxDepth = lod ? 0 : (o.refine ?? 1);
  const holes = o.holes || [];
  let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
  for (const q of poly) { a0 = Math.min(a0, q[0]); a1 = Math.max(a1, q[0]); b0 = Math.min(b0, q[1]); b1 = Math.max(b1, q[1]); }
  let tris = o.tris2d || null;
  if (!tris) {
    tris = [];
    if (holes.length || (a1 - a0 <= cell * 1.5 && b1 - b0 <= cell * 1.5)) earcutInto(tris, poly, holes);
    else {
      const na = Math.max(1, Math.round((a1 - a0) / cell)), nb = Math.max(1, Math.round((b1 - b0) / cell));
      const ca = (a1 - a0) / na, cb = (b1 - b0) / nb;
      for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
        const piece = clipRect(poly, a0 + i * ca, b0 + j * cb, a0 + (i + 1) * ca, b0 + (j + 1) * cb);
        if (piece.length >= 3 && Math.abs(area2(piece)) > 1e-9) earcutInto(tris, piece, []);
      }
    }
  }
  const ub = o.uvBox || [a0, b0, a1, b1];
  const flipU = (dir === '-z' || dir === '+x') !== !!o.uvMirror;
  const uvOf = (a, b) => {
    if (!fin.tex) return WUV;
    let u = (a - ub[0]) / (ub[2] - ub[0] || 1), v = (b - ub[1]) / (ub[3] - ub[1] || 1);
    if (dir === '+y') return texUV(fin.tex, o.uvMirror ? 1 - u : u, 1 - v);
    return texUV(fin.tex, flipU ? 1 - u : u, v);
  };
  const cache = new Map();
  const H = (q) => {
    const k = Math.round(q[0] * 1e5) + ',' + Math.round(q[1] * 1e5);
    let h = cache.get(k);
    if (h === undefined) { h = ctx.proj.hit(dir, q[0], q[1]); cache.set(k, h); }
    return h;
  };
  const bk = ctx.B[fin.b];
  const lift = (h, d) => [h.p[0] + h.n[0] * d, h.p[1] + h.n[1] * d, h.p[2] + h.n[2] * d];
  let cx = 0, cy = 0, cz = 0, cn = 0;
  const emit = (A, B, Cc) => {
    const ha = H(A), hb = H(B), hc = H(Cc);
    if (!ha || !hb || !hc) return;
    const d = off + depth, va = lift(ha, d), vb = lift(hb, d), vc = lift(hc, d);
    const fn = cross3(sub3(vb, va), sub3(vc, va));
    if (dot3(fn, fn) < 1e-16) return;
    const avg = [ha.n[0] + hb.n[0] + hc.n[0], ha.n[1] + hb.n[1] + hc.n[1], ha.n[2] + hb.n[2] + hc.n[2]];
    let L = [[va, ha, A], [vb, hb, B], [vc, hc, Cc]];
    if (dot3(fn, avg) < 0) L = [L[0], L[2], L[1]];
    for (const [v, h, q] of L) {
      const uv = uvOf(q[0], q[1]);
      pushVert(ctx, bk, fin, v[0], v[1], v[2], h.n[0], h.n[1], h.n[2], uv[0], uv[1]);
      cx += v[0]; cy += v[1]; cz += v[2]; cn++;
    }
  };
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const dev = (p, q, m) => {
    const hp = H(p), hq = H(q), hm = H(m);
    if (!hp || !hq || !hm) return 0;
    return Math.hypot(hm.p[0] - (hp.p[0] + hq.p[0]) / 2, hm.p[1] - (hp.p[1] + hq.p[1]) / 2, hm.p[2] - (hp.p[2] + hq.p[2]) / 2);
  };
  const rec = (A, B, Cc, dd) => {
    if (dd < maxDepth) {
      const mAB = mid(A, B), mBC = mid(B, Cc), mCA = mid(Cc, A);
      const dv = Math.max(dev(A, B, mAB), dev(B, Cc, mBC), dev(Cc, A, mCA));
      if (dv > tol && dv < 0.03) {
        rec(A, mAB, mCA, dd + 1); rec(mAB, B, mBC, dd + 1); rec(mCA, mBC, Cc, dd + 1); rec(mAB, mBC, mCA, dd + 1);
        return;
      }
    }
    emit(A, B, Cc);
  };
  for (const t of tris) rec(t[0], t[1], t[2], 0);
  if (!cn) return null;
  const cen = [cx / cn, cy / cn, cz / cn];
  if (depth > 0 && !lod) {
    const soup = new Soup(), wallFin = o.wallFin || fin;
    for (const ringPts of [poly, ...holes]) {
      const R = densify(ringPts, 0.03, true), isHole = ringPts !== poly;
      for (let i = 0; i < R.length; i++) {
        const ha = H(R[i]), hb = H(R[(i + 1) % R.length]);
        if (!ha || !hb) continue;
        const pa = lift(ha, off), pb = lift(hb, off), qa = lift(ha, off + depth), qb = lift(hb, off + depth);
        const m3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
        let en = sub3(m3, cen); if (isHole) en = [-en[0], -en[1], -en[2]];
        const nn = ha.n, k = dot3(en, nn);
        quadO(soup, pa, pb, qb, qa, [en[0] - nn[0] * k, en[1] - nn[1] * k, en[2] - nn[2] * k], wallFin);
      }
    }
    emitSoup(ctx, soup, 30);
  }
  return { c: cen };
}

/** thin dark line (door gaps etc.) following a 2D polyline in the view plane */
function seam(ctx, dir, line, o = {}) { return tagged(ctx, () => ({ k: 'seam', dir, line, w: o.w ?? 0.0065, gap: !o.fin || o.fin === FIN.seam }), () => seam_(ctx, dir, line, o)); }
function seam_(ctx, dir, line, o = {}) {
  if (ctx.lod) return;
  const w = o.w ?? 0.0065, pts = densify(line, o.step ?? 0.1, false), L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    L.push([pts[i][0] - (ty * w) / 2, pts[i][1] + (tx * w) / 2]); R.push([pts[i][0] + (ty * w) / 2, pts[i][1] - (tx * w) / 2]);
  }
  const tris2d = [];
  for (let i = 0; i < pts.length - 1; i++) { tris2d.push([L[i], L[i + 1], R[i + 1]]); tris2d.push([L[i], R[i + 1], R[i]]); }
  patch(ctx, dir, L.concat(R.slice().reverse()), o.fin || FIN.seam, { off: o.off ?? 0.005, tris2d });
}
const bothSides = (ctx, fn) => { fn('+x', 1); fn('-x', -1); };

/** sweep a closed 2D profile (u = outward, v = up) along a 3D path with frames */
function tube(ctx, path, prof, fin, o = {}) {
  const soup = new Soup(), n = path.length;
  const frames = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const T = norm3(sub3(b, a));
    let V = o.up ? o.up(i) : [0, 1, 0];
    V = norm3(sub3(V, T.map((t) => t * dot3(V, T))));
    const U = norm3(cross3(T, V));
    return { U, V };
  });
  let uc = 0, vc = 0; for (const q of prof) { uc += q[0]; vc += q[1]; } uc /= prof.length; vc /= prof.length;
  const P = (i, j) => { const { U, V } = frames[i], q = prof[j], s = o.scale ? o.scale(i) : 1; return [path[i][0] + (U[0] * q[0] + V[0] * q[1]) * s, path[i][1] + (U[1] * q[0] + V[1] * q[1]) * s, path[i][2] + (U[2] * q[0] + V[2] * q[1]) * s]; };
  const m = prof.length;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
    const j1 = (j + 1) % m, { U, V } = frames[i];
    const du = (prof[j][0] + prof[j1][0]) / 2 - uc, dv = (prof[j][1] + prof[j1][1]) / 2 - vc;
    const en = [U[0] * du + V[0] * dv, U[1] * du + V[1] * dv, U[2] * du + V[2] * dv];
    quadO(soup, P(i, j), P(i + 1, j), P(i + 1, j1), P(i, j1), en, fin);
  }
  if (o.caps !== false) for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], T = norm3(sub3(b, a)).map((t) => t * sg);
    const c = P(i, 0).map((_, k) => { let s = 0; for (let j = 0; j < m; j++) s += P(i, j)[k]; return s / m; });
    for (let j = 0; j < m; j++) triO(soup, c, P(i, j), P(i, (j + 1) % m), T, fin);
  }
  emitSoup(ctx, soup, o.crease ?? 50);
}

// ================================================================== body lofts
function endRound(d, r) { if (d >= r.z) return 0; const s = 1 - Math.max(d, 0) / r.z; return 1 - Math.sqrt(Math.max(0, 1 - s * s)); }

/** lower-body cross-section parameters at z */
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// end rounding with optional separate lengths for plan (zx), top (zt) and bottom (zb): a long top + short bottom = raked fascia
const endR = (d, r, k) => endRound(d, r[k] ? { z: r[k] } : r);
function section(P, z) {
  let yb = P.yb(z), yt = P.yt(z), yh = P.yh(z), w = P.w(z);
  const dF = z - P.zF, dR = P.zR - z, rF = P.rndF, rR = P.rndR;
  w -= endR(dF, rF, 'zx') * rF.x + endR(dR, rR, 'zx') * rR.x;
  const dt = endR(dF, rF, 'zt') * rF.t + endR(dR, rR, 'zt') * rR.t;
  yt -= dt; yh -= dt;
  yb += endR(dF, rF, 'zb') * rF.b + endR(dR, rR, 'zb') * rR.b;
  // very rounded tips (bug, buggy) can pinch the section shut: keep a sliver of height so the side stays finite
  if (yh < yb + 0.03) { const m = (yh + yb) / 2; yb = m - 0.015; yh = m + 0.015; if (yt < yh) yt = yh; }
  // body pass 3 sculpt (P.sculpt): the whole section pulled in (base + waist between the arches) so the flared arches end
  // at the profile-table width; S.w stays the table width (getModelSpec / physics box unchanged)
  const SC = P.sculpt, ws = SC ? w - SC._base - SC.waist * sculptBetween(P, z) : w;
  const yw = yb + P.kw * (yh - yb);
  const r = Math.min(P.sr, (yh - yw) * 0.6);
  const xc = ws - P.tumble;
  const tum = P.tumble, tuck = P.tuck, tp = P.tuckPow;
  const sideX0 = (y) => (y >= yw ? ws - tum * sq((y - yw) / Math.max(1e-6, yh - yw)) : ws - tuck * Math.pow(clamp((yw - y) / Math.max(1e-6, yw - yb), 0, 1), tp));
  const topY0 = (x) => yt - (yt - yh) * sq(Math.min(x, xc) / xc);
  const sideX = SC ? (y) => sideX0(y) + sculptSide(P, SC, z, y, yb, yh) : sideX0;
  const topY = SC ? (x) => topY0(x) + sculptTop(P, SC, z, x, ws) : topY0;
  return { z, yb, yt, yh, w, yw, r, xc, sideX, topY };
}

// ---------------------------------------------------------------- body pass 3 sculpt terms (hero / top-traffic cars)
function sculptBetween(P, z) {
  const A0 = P.arches[0], A1 = P.arches[1];
  if (!A0 || !A1) return 0;
  return sstep(A0.z + A0.ra * 0.6, A0.z + A0.ra * 1.7, z) * (1 - sstep(A1.z - A1.ra * 1.7, A1.z - A1.ra * 0.6, z));
}
/** side offset at (z, y): arch flares / haunches (an elliptic band around each arch that runs down to the sill and rolls
 *  into the shoulder), a raised shoulder under the belt, a concave lower-door cove and a tucked rocker */
function sculptSide(P, SC, z, y, yb, yh) {
  const h = (y - yb) / Math.max(0.05, yh - yb);
  let o = 0;
  P.arches.forEach((A, i) => {
    const F = i ? SC.flR : SC.flF; if (!F) return;
    const rn = Math.hypot((z - A.z) / A.ra, Math.max(0, y - A.cy) / A.rh), k = SC.flW / A.ra;
    o += F * sstep(0.93, 1.03, rn) * (1 - sstep(1.03 + k * 0.3, 1.03 + k, rn)) * (1 - sstep(0.82, 1.0, h));
  });
  const btw = sculptBetween(P, z);
  o += SC.shoulder * Math.exp(-sq((h - 0.8) / 0.09)) * (1 - sstep(0.9, 1.0, h)) - SC.cove * btw * Math.exp(-sq((h - 0.4) / 0.15)) - SC.rocker * (1 - sstep(0.0, 0.25, h));
  return o;
}
/** bonnet: centre power dome + raised fender crowns with valleys between, faded out at the nose and the scuttle */
function sculptTop(P, SC, z, x, w) {
  if (!SC.dome && !SC.crown) return 0;
  const zE = P.gh ? P.gh.z0 : P.zF + 1.1;
  const along = sstep(P.zF + 0.1, P.zF + 0.45, z) * (1 - sstep(zE - 0.3, zE - 0.04, z));
  if (along <= 0) return 0;
  const u = x / w;
  return along * (SC.dome * Math.exp(-sq(u / 0.3)) + SC.crown * Math.exp(-sq((u - 0.8) / 0.12)) - 0.45 * SC.crown * Math.exp(-sq((u - 0.56) / 0.11)));
}

function archTop(P, z) {
  for (const A of P.arches) {
    const d = Math.abs(z - A.z) / A.ra;
    if (d < 1) return A.cy + A.rh * Math.pow(1 - Math.pow(d, A.p), 1 / A.p);
  }
  return -Infinity;
}
/** arch opening height actually cut into the body at z (never closer than 3 cm to the shoulder) */
function archCut(P, z, S) { const ya = archTop(P, z); return Math.min(ya, (S || section(P, z)).yh - 0.03); }

function lowerRing(P, z, lod) {
  const S = section(P, z), { yb, yh, r, xc, sideX, topY } = S;
  const yTopSide = yh - r;
  const ya = archCut(P, z, S);
  const yLow = Math.max(yb, ya);
  const xi = Math.min(P.xi, sideX(yLow) - 0.02);
  let lv = lod || P.levelsOnly ? [yb, yTopSide] : [yb, yb + 0.45 * (S.yw - yb), S.yw, S.yw + 0.5 * (yTopSide - S.yw), yTopSide];
  if (P._hq && !P.levelsOnly) lv = P._hq2 ? [0, 0.07, 0.15, 0.22, 0.3, 0.37, 0.45, 0.53, 0.62, 0.71, 0.8, 0.9, 1].map((t) => yb + t * (S.yw - yb)).concat([0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.87, 1].map((t) => S.yw + t * (yTopSide - S.yw)))
    : [0, 0.15, 0.3, 0.45, 0.62, 0.8, 1].map((t) => yb + t * (S.yw - yb)).concat([0.25, 0.5, 0.75, 1].map((t) => S.yw + t * (yTopSide - S.yw)));
  if (P.levels && !lod) for (const y of P.levels) lv.push(clamp(y, yb, yTopSide));
  if (lod && P.lodLevels) for (const y of P.lodLevels) lv.push(clamp(y, yb, yTopSide));
  lv.sort((a, b) => a - b);
  const pts = [[0, yb], [xi, yb], [xi, yLow]], tags = ['floor', 'wellWall', 'wellRoof'];
  let ci = -1;
  if (P.charY && !lod) { const cy = clamp(P.charY(z), yb + 0.02, yTopSide - 0.02); lv.push(cy); lv.sort((a, b) => a - b); ci = lv.indexOf(cy); }
  for (let i = 0; i < lv.length; i++) {
    const y = Math.max(lv[i], yLow);
    const ridge = i === ci && y > yLow + 1e-4 ? P.charD : 0;
    pts.push([sideX(y) + ridge, y]); if (i > 0) tags.push(ci >= 0 && i > ci ? 'sideU' : 'side');
  }
  const p0 = pts[pts.length - 1], cc = [xc, yh], x2 = xc - r, p2 = [x2, topY(x2)];
  const nc = lod ? 1 : P._hq2 ? 11 : P._hq ? 6 : 2;
  for (let i = 1; i <= nc; i++) { pts.push(bez2(p0, cc, p2, i / (nc + 1))); tags.push('corner'); }
  pts.push(p2); tags.push('corner');
  const xg = Math.max(0.02, P.topIn ? Math.min(P.topIn(z), x2 - 0.01) : x2 * 0.62);
  pts.push([xg, topY(xg)]); tags.push('top');
  const bedY = P.bedY ? P.bedY(z) : null;
  if (bedY != null) {
    pts.push([xg, bedY]); tags.push('bedWall');
    if (!lod) { pts.push([xg * 0.5, bedY]); tags.push('topIn'); }
    pts.push([0, bedY]); tags.push('topIn');
  } else {
    pts.push([xg, topY(xg)]); tags.push('bedWall');
    if (!lod) { pts.push([xg * 0.5, topY(xg * 0.5)]); tags.push('topIn'); }
    pts.push([0, S.yt]); tags.push('topIn');
  }
  return { pts, tags };
}

function ghRing(P, z, lod, inset = 0) {
  const G = P.gh, wb = G.wb(z), wt = Math.min(G.wt(z), wb - 0.005);
  const S = section(P, z), yBelt = S.topY(wb);
  const yr = G.roof(z), crown = G.crown, yEdge = yr - crown, h = yEdge - yBelt;
  const rc = clamp(h * 0.45, 0, G.rc);
  const pts = [[wb, yBelt - 0.05]], tags = [];
  const y1 = Math.min(yBelt + 0.003, yEdge - rc);
  pts.push([wb, y1]); tags.push('hid');
  const dx = wt - wb, dy = yEdge - y1, len = Math.hypot(dx, dy) || 1, s2 = Math.max(0, len - rc) / len;
  const p2 = [wb + dx * s2, y1 + dy * s2];
  if (!lod) { pts.push([wb + dx * s2 * 0.5 + G.bulge * clamp(h / 0.25, 0, 1), y1 + dy * s2 * 0.5]); tags.push('side'); }
  pts.push(p2); tags.push('side');
  const x3 = wt - rc, p3 = [x3, yr - crown * sq(x3 / wt)], cc = [wt, yEdge];
  const ncs = lod ? 0 : P._hq2 ? 9 : P._hq ? 5 : 2;
  for (let i = 1; i <= ncs; i++) { pts.push(bez2(p2, cc, p3, i / (ncs + 1))); tags.push('corner'); }
  pts.push(p3); tags.push('corner');
  for (const f of lod ? [0.5] : P._hq2 ? [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] : P._hq ? [0.84, 0.68, 0.5, 0.33, 0.16] : [0.66, 0.33]) { const x = x3 * f; pts.push([x, yr - crown * sq(x / wt)]); tags.push('roof'); }
  pts.push([0, yr]); tags.push('roof');
  if (inset) {
    const o = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      // ring runs CCW (seen from +z): outward normal = (ty, -tx)
      return [Math.max(0, p[0] - ty * inset), p[1] + tx * inset];
    });
    o[o.length - 1][0] = 0;
    return { pts: o, tags };
  }
  return { pts, tags };
}

/** Loft rings (right half, mirrored to the left) along z. matFn picks a finish per quad (or null to skip). */
function loft(soup, zs, ringFn, matFn, o = {}) {
  const rings = [];
  for (const z of zs) {
    const { pts, tags } = ringFn(z), n = pts.length, R = [], T = [];
    for (let k = 0; k < n; k++) R.push([pts[k][0], pts[k][1], z]);
    for (let k = n - 2; k >= (o.closed ? 1 : 0); k--) R.push([-pts[k][0], pts[k][1], z]);
    for (let k = 0; k < n - 1; k++) T.push([tags[k], 1]);
    for (let k = n - 2; k >= 0; k--) T.push([tags[k], -1]);
    rings.push({ z, R, T });
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], m = A.R.length, segs = o.closed ? m : m - 1;
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % m, a = A.R[k], b = A.R[k1], c = B.R[k1], d = B.R[k];
      const f = matFn({ z: (A.z + B.z) / 2, x: (a[0] + b[0] + c[0] + d[0]) / 4, y: (a[1] + b[1] + c[1] + d[1]) / 4, tag: A.T[k][0], side: A.T[k][1] });
      if (!f) continue;
      soup.g = o.groupOf ? o.groupOf(A.T[k][0]) : 0;
      if (o.flip) { soup.tri(a, d, b, f); soup.tri(b, d, c, f); } else { soup.tri(a, b, d, f); soup.tri(b, c, d, f); }
      soup.g = 0;
    }
  }
  const cap = (ring, start) => {
    const R = ring.R, m = R.length; let cx = 0, cy = 0; for (const p of R) { cx += p[0]; cy += p[1]; }
    const c = [cx / m, cy / m, ring.z], f = o.capFin;
    for (let k = 0; k < m; k++) { const a = R[k], b = R[(k + 1) % m]; if (start !== !!o.flip) soup.tri(c, b, a, f); else soup.tri(c, a, b, f); }
  };
  if (o.capStart) cap(rings[0], true);
  if (o.capEnd) cap(rings[rings.length - 1], false);
  return rings;
}

function fillStations(brk, sp) {
  const b = brk.filter((z) => Number.isFinite(z)).sort((x, y) => x - y), u = [];
  for (const z of b) if (!u.length || z - u[u.length - 1] > 0.0008) u.push(z);
  const out = [u[0]];
  for (let i = 1; i < u.length; i++) {
    const a = out[out.length - 1], z = u[i], k = Math.ceil((z - a) / sp - 1e-6);
    for (let j = 1; j < k; j++) out.push(a + ((z - a) * j) / k);
    out.push(z);
  }
  return out;
}

function lowerStations(P, lod) {
  const brk = [P.zF, P.zR], nE = lod ? 2 : P._hq2 ? 16 : P._hq ? 10 : 5;
  for (let i = 1; i <= nE; i++) { const t = 1 - Math.cos((i / nE) * Math.PI / 2); brk.push(P.zF + P.rndF.z * t, P.zR - P.rndR.z * t); }
  for (const A of P.arches) {
    brk.push(A.z - A.ra - 0.002, A.z + A.ra + 0.002, A.z - A.ra + 0.002, A.z + A.ra - 0.002);
    const nA = lod ? 2 : P._hq ? Math.max(18, (P.archN ?? 9) * 2) : P.archN ?? 9;
    for (let i = 0; i <= nA; i++) { const ph = Math.PI * (0.08 + (0.84 * i) / nA); brk.push(A.z - A.ra * Math.cos(ph)); }
  }
  if (P.gh) brk.push(P.gh.zE0, P.gh.zE1);
  if (P.bed) brk.push(P.bed.z0 - 0.002, P.bed.z0 + 0.002, P.bed.z1 - 0.002, P.bed.z1 + 0.002);
  if (P.breaks && (!lod || P.lodBreaks)) brk.push(...P.breaks);
  return fillStations(brk.filter((z) => z >= P.zF && z <= P.zR), lod ? (P.lodSpacing ?? 0.6) : (P.spacing ?? 0.2) * (P._hq2 ? 0.2 : P._hq ? 0.45 : 1));
}

function ghStations(P, lod) {
  const G = P.gh, brk = [G.z0, G.z1, G.zE0, G.zE1];
  for (const r of [G.ws, G.rear, G.roofGlass, ...(G.side || []), ...(G.bars || [])]) if (r) brk.push(r[0], r[1]);
  if (G.breaks) brk.push(...G.breaks);
  return fillStations(brk.filter((z) => z >= G.z0 && z <= G.z1), lod ? 0.6 : P._hq2 ? 0.03 : P._hq ? 0.06 : 0.13);
}

const inR = (z, r) => r && z > r[0] && z < r[1];
const inAny = (z, rs) => rs && rs.some((r) => z > r[0] && z < r[1]);

function lowerMat(P, q, lod) {
  if (q.tag === 'sideU') q = Object.assign({}, q, { tag: 'side' });
  if (P.lowerMat) { const f = P.lowerMat(q, lod); if (f !== undefined) return f; }
  const t = q.tag;
  if (t === 'floor') return FIN.under;
  if (t === 'wellWall' || t === 'wellRoof') return FIN.well;
  if (t === 'topIn' || t === 'bedWall') {
    if (P.bed && q.z > P.bed.z0 - 0.003 && q.z < P.bed.z1 + 0.003) return FIN.bedliner;
    if (P.gh && q.z > P.gh.zE0 && q.z < P.gh.zE1) return lod ? FIN.glassProxy : FIN.interior;
  }
  return FIN.paint;
}

function ghMat(P, q) {
  const G = P.gh, z = q.z;
  if (G.mat) { const f = G.mat(q); if (f !== undefined) return f; }
  if (q.tag === 'hid') return FIN.paint;
  if (q.tag === 'roof') {
    if (inR(z, G.ws) || inR(z, G.rear) || inR(z, G.roofGlass)) return FIN.glass;
    return G.roofFin || FIN.paint;
  }
  if (q.tag === 'corner') {
    // body pass 3: slim A-pillars, the side half of the roof-edge arc along the windscreen is glass (glass wraps the pillar)
    if (P.sculpt && inR(z, G.ws) && Math.abs(q.x) > G.wt(z) - G.rc * 0.5) return FIN.glass;
    if (inR(z, G.ws) || inR(z, G.rear)) return G.aFin || FIN.paint;
    return G.railFin || FIN.paint;
  }
  if (inAny(z, G.side)) return FIN.glass;
  // body pass 3: the A-pillar's side face ahead of the front door glass is a fixed quarter light (the old black-gloss
  // triangle filled a third of the in-car view); only the rounded roof-edge strip stays a pillar
  if (P.sculpt && q.tag === 'side' && G.ws && G.side && G.side.length && z > G.ws[0] + 0.035 && z < G.side[0][0] - 0.012) return FIN.glass;
  if (G.pillarFin) return typeof G.pillarFin === 'function' ? G.pillarFin(z) : G.pillarFin;
  return FIN.paint;
}

function buildBody(ctx) {
  const P = ctx.P, lod = ctx.lod;
  const soup = new Soup();
  loft(soup, lowerStations(P, lod), (z) => lowerRing(P, z, lod), (q) => lowerMat(P, q, lod), { closed: true, capStart: true, capEnd: true, capFin: FIN.paint, groupOf: P.charY ? (t) => (t === 'side' || t === 'floor' || t === 'wellWall' || t === 'wellRoof' ? 0 : 1) : null });
  emitSoup(ctx, soup, P.crease, true);
  if (P.gh) {
    const zs = ghStations(P, lod), gs = new Soup();
    loft(gs, zs, (z) => ghRing(P, z, lod), (q) => ghMat(P, q), { closed: false });
    emitSoup(ctx, gs, P.crease, true);
    if (!lod) {
      // inner liner so pillars/roof are not see-through from inside
      const ls = new Soup();
      const lz = fillStations(ghStations(P, 1).filter((z) => z >= P.gh.zE0 - 0.05 && z <= P.gh.zE1 + 0.05), 0.3);
      loft(ls, lz, (z) => ghRing(P, z, 0, 0.018), (q) => {
        if (q.tag === 'hid') return null;
        const f = ghMat(P, q);
        return f === FIN.glass ? null : FIN.interior;
      }, { closed: false, flip: true });
      ctx.noBounds = true; emitSoup(ctx, ls, 60); ctx.noBounds = false;
    }
  }
  ctx.proj = new Projector(ctx.tgtP, ctx.tgtN);
}
FIN.glassProxy = D(0x151b20, 0.3, 0.1);

// ================================================================== reusable details
/**
 * Upright lamp pod faired into a sloped fender (911 / classic style): a body-coloured can along an axis
 * between the surface normal and straight ahead, a chrome bezel ring and a textured lens. Returns the lens centre.
 */
function lampPod(ctx, x, y, rx, ry, o = {}) { return tagged(ctx, () => ({ k: 'pod', x, y, rx, ry, lamp: o.lamp ?? 1 }), () => lampPod_(ctx, x, y, rx, ry, o)); }
function lampPod_(ctx, x, y, rx, ry, o = {}) {
  const h = ctx.proj.hit('-z', x, y); if (!h) return null;
  const mix = o.mix ?? 0.35, n = h.n;
  const a = norm3([n[0] * mix, n[1] * mix + (o.up ?? 0.05), n[2] * mix - (1 - mix)]);
  const A = new THREE.Vector3(a[0], a[1], a[2]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), A);
  const out = o.out ?? 0.025, len = o.len ?? 0.1;
  const f = [h.p[0] + a[0] * out, h.p[1] + a[1] * out, h.p[2] + a[2] * out];
  const at = (d) => new THREE.Vector3(f[0] + a[0] * d, f[1] + a[1] * d, f[2] + a[2] * d);
  const segs = ctx.lod ? 8 : 18;
  addGeo(ctx, CYL(segs, true), o.canFin || FIN.paint, new THREE.Matrix4().compose(at(-len / 2), q, new THREE.Vector3(rx * 1.06, len, ry * 1.06)));
  if (!ctx.lod) {
    const q2 = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    addGeo(ctx, TOR(), o.bezel || FIN.chrome, new THREE.Matrix4().compose(at(-0.004), q2, new THREE.Vector3(rx, ry, rx * 0.6)));
    addGeo(ctx, CYL(segs), FIN.black, new THREE.Matrix4().compose(at(-0.02), q, new THREE.Vector3(rx * 0.97, 0.01, ry * 0.97)));
  }
  addGeo(ctx, CYL(segs), Lf(o.col ?? 0xffffff, o.lamp ?? LAMP.HEAD, o.tex ?? 'HEADR'), new THREE.Matrix4().compose(at(-0.012), q, new THREE.Vector3(rx * 0.92, 0.004, ry * 0.92)));
  return f;
}
function lampHousing(ctx, dir, poly, fin, g = 0.012) { patch(ctx, dir, grow(poly, g), fin || FIN.darkChrome, { off: 0.004 }); }

function headlamps(ctx, h) { return tagged(ctx, () => ({ k: 'head', dir: h.dir || '-z' }), () => headlamps_(ctx, h)); }
function headlamps_(ctx, h) {
  const dir = h.dir || '-z';
  for (const s of [-1, 1]) {
    const pl = s > 0 ? h.poly : mirX(h.poly);
    if (h.housing !== null) lampHousing(ctx, dir, pl, h.housing, h.hg ?? 0.012);
    const r = patch(ctx, dir, pl, Lf(h.col ?? 0xffffff, h.lamp ?? LAMP.HEAD, h.tex === null ? undefined : (h.tex ?? 'HEAD')), { off: h.off ?? 0.0085, uvMirror: s < 0, depth: h.depth || 0, refine: 2, maxEdge: 0.08 });
    if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
    if (h.drl) patch(ctx, dir, s > 0 ? h.drl : mirX(h.drl), Lf(0xffffff, LAMP.DRL), { off: (h.off ?? 0.0085) + 0.002 });
    if (h.ind) patch(ctx, dir, s > 0 ? h.ind : mirX(h.ind), Lf(0xffa21a, LAMP.NONE), { off: (h.off ?? 0.0085) + 0.001 });
  }
}
function taillamps(ctx, t) { return tagged(ctx, () => ({ k: 'tail', dir: '+z' }), () => taillamps_(ctx, t)); }
function taillamps_(ctx, t) {
  for (const s of [-1, 1]) {
    const m = (p) => (p ? (s > 0 ? p : mirX(p)) : null);
    if (t.housing !== null) lampHousing(ctx, '+z', m(t.poly), t.housing || FIN.blackGloss, t.hg ?? 0.01);
    patch(ctx, '+z', m(t.poly), Lf(t.col ?? 0xffffff, t.lamp ?? LAMP.TAIL, t.tex === null ? undefined : (t.tex ?? 'TAIL')), { off: 0.0085, uvMirror: s < 0 });
    if (t.rev) patch(ctx, '+z', m(t.rev), Lf(0xf4f6ff, LAMP.REV), { off: 0.0095 });
    if (t.ind) patch(ctx, '+z', m(t.ind), Lf(0xff9a1a, LAMP.NONE), { off: 0.0095 });
    if (t.extra) for (const e of t.extra) patch(ctx, '+z', m(e.poly), Lf(e.col ?? 0xffffff, e.lamp ?? LAMP.TAIL, e.tex), { off: 0.0095 });
  }
}
function grille(ctx, g) { return tagged(ctx, () => ({ k: 'grille', dir: g.dir || '-z', poly: g.poly, tex: g.tex || null }), () => grille_(ctx, g)); }
function grille_(ctx, g) {
  const dir = g.dir || '-z';
  if (g.surround) patch(ctx, dir, grow(g.poly, g.sw ?? 0.014), g.surround, { off: 0.004, depth: g.sdepth || 0 });
  patch(ctx, dir, g.poly, tx(g.fin || FIN.grille, g.tex), { off: g.surround ? 0.0075 + (g.sdepth || 0) * 0.5 : 0.005 });
}
function plate(ctx, end, o) { return tagged(ctx, () => ({ k: 'plate', end, x: o.x || 0, y: o.y }), () => plate_(ctx, end, o)); }
function plate_(ctx, end, o) {
  const dir = end === 'F' ? '-z' : '+z', sg = end === 'F' ? -1 : 1, y = o.y, x = o.x || 0, w = 0.31, h = 0.157;
  let z = end === 'F' ? Infinity : -Infinity;
  for (const [a, b] of [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x - w / 2, y + h / 2], [x + w / 2, y + h / 2], [x, y]]) {
    const hh = ctx.proj.hit(dir, a, b); if (!hh) continue;
    z = end === 'F' ? Math.min(z, hh.p[2]) : Math.max(z, hh.p[2]);
  }
  if (!Number.isFinite(z)) return;
  box(ctx, FIN.black, x, y, z + sg * 0.006, w + 0.03, h + 0.025, 0.01);
  addGeo(ctx, BOX(), tx(FIN.plate, 'PLATE' + ((o.idx ?? 0) % 4)), M(x, y, z + sg * 0.014, 0, 0, 0, w, h, 0.006));
}
function mirrors(ctx, m) { return tagged(ctx, () => ({ k: 'mirror', z: m.z, y: m.y, len: m.len ?? 0.2, h: m.h ?? 0.115, d: m.d ?? 0.1, driverOnly: !!m.driverOnly, paint: !m.fin || m.fin === FIN.paint, sides: [-1, 1].map((s) => { const h = ctx.proj?.hit(s > 0 ? '+x' : '-x', m.z, m.y); return h ? [s, h.p[0]] : null; }).filter(Boolean) }), () => mirrors_(ctx, m)); }
function mirrors_(ctx, m) {
  for (const s of [-1, 1]) {
    if (m.driverOnly && s > 0) continue;
    const hit = ctx.proj.hit(s > 0 ? '+x' : '-x', m.z, m.y); if (!hit) continue;
    const L = m.len ?? 0.2, Hh = m.h ?? 0.115, Dd = m.d ?? 0.1, x0 = hit.p[0], cx = x0 + s * (0.05 + L * 0.5);
    ctx.noBounds = true;
    rbox(ctx, m.fin || FIN.paint, cx, m.y + 0.03, m.z, L, Hh, Dd, Math.min(Hh, Dd) * 0.42, 0, s * 0.1, s * 0.05);
    box(ctx, FIN.mirrorGlass, cx, m.y + 0.03, m.z + Dd / 2 + 0.001, L * 0.84, Hh * 0.76, 0.006, 0, s * 0.1, s * 0.05);
    box(ctx, m.stalk || FIN.black, x0 + s * 0.04, m.y, m.z - 0.005, 0.1, 0.035, 0.06);
    ctx.noBounds = false;
  }
}
function handles(ctx, list, fin = FIN.chrome, o = {}) { return tagged(ctx, () => ({ k: 'handles', list, flush: !!o.flush, chrome: fin === FIN.chrome }), () => handles_(ctx, list, fin, o)); }
function handles_(ctx, list, fin = FIN.chrome, o = {}) {
  for (const [z, y] of list) bothSides(ctx, (dir, s) => {
    const h = ctx.proj.hit(dir, z, y); if (!h) return;
    ctx.noBounds = true;
    if (o.flush) patch(ctx, dir, rrect(z - 0.075, y - 0.012, z + 0.075, y + 0.012, 0.01), o.flushFin || FIN.blackGloss, { off: 0.005 });
    else box(ctx, fin, h.p[0] + s * 0.011, y, z, 0.022, 0.026, 0.15);
    ctx.noBounds = false;
  });
}
function exhausts(ctx, list) { return tagged(ctx, () => ({ k: 'exhaust', list: list.map((e) => { const z1 = ctx.P.zR + (e.dz ?? -0.01); return { x: e.x, y: e.y, r: e.r ?? 0.035, z0: z1 - (e.len ?? 0.22), z1, oval: !!e.oval }; }) }), () => exhausts_(ctx, list)); }
function exhausts_(ctx, list) {
  const P = ctx.P;
  for (const e of list) {
    const r = e.r ?? 0.035, z1 = P.zR + (e.dz ?? -0.01), z0 = z1 - (e.len ?? 0.22);
    ctx.noBounds = true;
    if (e.oval) {
      addGeo(ctx, CYL(14, true), e.fin || FIN.chrome, M(e.x, e.y, (z0 + z1) / 2, Math.PI / 2, 0, 0, r * 1.5, z1 - z0, r));
      addGeo(ctx, CYL(14), FIN.black, M(e.x, e.y, z1 - 0.025, Math.PI / 2, 0, 0, r * 1.38, 0.01, r * 0.85));
    } else {
      cylAB(ctx, e.fin || FIN.chrome, [e.x, e.y, z0], [e.x, e.y, z1], r, 14, true);
      cylAB(ctx, FIN.black, [e.x, e.y, z1 - 0.03], [e.x, e.y, z1 - 0.02], r * 0.9, 10);
    }
    ctx.noBounds = false;
    ctx.exhaust.push(new THREE.Vector3(e.x, e.y, z1 + 0.01));
  }
}
function wipers(ctx, o = {}) { return tagged(ctx, () => ({ k: 'wipers', list: (o.list || [[-0.42, 0.55, 0.06], [0.2, 0.5, 0.1]]).map(([x, len, ang]) => { const z = ctx.P.gh.zE0 + (o.dz ?? 0.07), h = ctx.proj?.hit('+y', x, z); return h ? { x, len, ang, p: h.p, n: h.n } : null; }).filter(Boolean) }), () => wipers_(ctx, o)); }
function wipers_(ctx, o = {}) {
  const G = ctx.P.gh, z = G.zE0 + (o.dz ?? 0.07);
  for (const [x, len, ang] of o.list || [[-0.42, 0.55, 0.06], [0.2, 0.5, 0.1]]) {
    const h = ctx.proj.hit('+y', x, z); if (!h) continue;
    const th = Math.atan2(h.n[2], h.n[1]);
    box(ctx, FIN.black, h.p[0] + h.n[0] * 0.012, h.p[1] + h.n[1] * 0.012, h.p[2] + h.n[2] * 0.012, len, 0.012, 0.02, th, ang, 0);
  }
}
function beltTrim(ctx, fin, z0, z1, o = {}) {
  const P = ctx.P, G = P.gh, pts = [];
  if (ctx.lod) return;
  const nb = Math.max(2, Math.ceil((z1 - z0) / 0.2));
  for (let i = 0; i <= nb; i++) { const z = lerp(z0, z1, i / nb), S = section(P, z), wb = G.wb(z); pts.push([wb + 0.003, S.topY(wb) + 0.002, z]); }
  const prof = [[-0.004, -0.006], [0.006, -0.006], [0.006, o.h ?? 0.006], [-0.004, o.h ?? 0.006]];
  for (const s of [1, -1]) tube(ctx, s > 0 ? pts : pts.map((p) => [-p[0], p[1], p[2]]).reverse(), prof, fin);
}
function archTrims(ctx, o = {}) {
  const P = ctx.P, wOut = o.width ?? 0.03, hOut = o.out ?? 0.01, inner = o.inner ?? 0.006;
  const prof = [[-inner, 0], [0, hOut * 0.9], [wOut * 0.45, hOut], [wOut, 0]];
  for (const A of P.arches) {
    // path in (z, y) with outward 2D normals (away from the opening)
    const path = [];
    const yb0 = section(P, A.z - A.ra).yb, yb1 = section(P, A.z + A.ra).yb;
    const legF = o.legs === false ? [] : [[A.z - A.ra, yb0 + 0.01], [A.z - A.ra, lerp(yb0, A.cy, 0.5)]];
    for (const q of legF) path.push({ p: q, n: [-1, 0] });
    const N = ctx.lod ? 4 : 10;
    for (let i = 0; i <= N; i++) {
      const ph = Math.PI * (1 - i / N), c = Math.cos(ph), sgn = Math.sign(c) || 1, d = Math.abs(c);
      const z = A.z + A.ra * c * 0.999, y = Math.min(A.cy + A.rh * Math.pow(Math.max(0, 1 - Math.pow(d, A.p)), 1 / A.p), section(P, z).yh - 0.03);
      path.push({ p: [z, Math.max(y, A.cy)], n: null });
    }
    if (o.legs !== false) { path.push({ p: [A.z + A.ra, lerp(yb1, A.cy, 0.5)], n: [1, 0] }); path.push({ p: [A.z + A.ra, yb1 + 0.01], n: [1, 0] }); }
    for (let i = 0; i < path.length; i++) if (!path[i].n) {
      const a = path[Math.max(0, i - 1)].p, b = path[Math.min(path.length - 1, i + 1)].p;
      const t = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(t[0], t[1]) || 1;
      path[i].n = [-t[1] / l, t[0] / l];
      const rel = [path[i].p[0] - A.z, path[i].p[1] - A.cy];
      if (path[i].n[0] * rel[0] + path[i].n[1] * rel[1] < 0) path[i].n = [-path[i].n[0], -path[i].n[1]];
    }
    for (const s of [1, -1]) {
      const soup = new Soup();
      const V = (i, j) => {
        const { p, n } = path[i], [u, v] = prof[j];
        const z = p[0] + n[0] * u, y = p[1] + n[1] * u, S = section(P, z);
        return [s * (S.sideX(y) + v + 0.002), y, z];
      };
      for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < prof.length - 1; j++) {
        const du = prof[j + 1][0] - prof[j][0], dv = prof[j + 1][1] - prof[j][1];
        const n2 = path[i].n, en = [s * du, -dv * n2[1], -dv * n2[0]];
        quadO(soup, V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1), en, o.fin || FIN.paint);
      }
      emitSoup(ctx, soup, 55);
    }
  }
}
function interior(ctx, o = {}) { return tagged(ctx, () => ({ k: 'interior' }), () => interior_(ctx, o)); }
function interior_(ctx, o = {}) {
  const P = ctx.P, G = P.gh; if (!G || ctx.lod) return;
  ctx.noBounds = true;
  const yAt = (z, x = 0.35) => section(P, z).topY(x);
  const eye = P.eye, sxL = eye[0];
  const wheelZ = o.wheelZ ?? eye[2] - 0.52;
  const zE = G.zE0, dashZ = Math.min(zE + (o.dash ?? 0.1), wheelZ - 0.42);
  const wIn = (z) => G.wb(z) - 0.03;
  // dashboard
  const gy = (x, z) => { const h = ctx.proj.hit('+y', x, z); return h ? h.p[1] : Infinity; };
  const dz1 = dashZ + 0.36, dwh = wIn(dashZ + 0.2) * 0.94, dBot = yAt(dashZ) - 0.12;
  const dTop = Math.min(yAt(dz1) + 0.1, gy(0, dashZ) - 0.025, gy(dwh * 0.92, dashZ) - 0.025, gy(-dwh * 0.92, dashZ) - 0.025);
  if (dTop > dBot + 0.03) box(ctx, FIN.dash, 0, (dTop + dBot) / 2, (dashZ + dz1) / 2, 2 * dwh, dTop - dBot, dz1 - dashZ);
  const IR = ctx.rec && ctx.tag ? ctx.rec[ctx.tag - 1] : null;
  if (IR) Object.assign(IR, { eye, dashZ, dz1, dwh, dTop, dBot, seats: [], rear: null });
  // steering wheel (driver left)
  const sx = sxL, sz = wheelZ, sy = Math.min(yAt(sz) + (o.wheelY ?? 0.13), eye[1] - 0.2);
  addGeo(ctx, TOR(), FIN.dash, M(sx, sy, sz, -0.45, 0, 0, 0.18, 0.18, 0.18));
  if (IR) IR.wheel = [sx, sy, sz];
  box(ctx, FIN.dash, sx, sy - 0.04, sz - 0.14, 0.05, 0.05, 0.24, -0.45, 0, 0);
  addGeo(ctx, CYL(8), FIN.dash, M(sx, sy, sz + 0.004, -0.45 + Math.PI / 2, 0, 0, 0.055, 0.03, 0.055));
  // seats (kept below the headliner)
  const roofAt = (z) => G.roof(clamp(z, G.z0, G.z1)) - G.crown - 0.03;
  const seat = (x, z, w = 0.48) => {
    const y0 = yAt(z), top = Math.min(y0 + 0.3, roofAt(z) - 0.2), bot = y0 - 0.25;
    box(ctx, FIN.seat, x, (top + bot) / 2, z, w, top - bot, 0.13, 0.2, 0, 0);
    if (IR) IR.seats.push({ x, z, w, top, bot, hTop: Math.min(top + 0.17, roofAt(z + 0.05) - 0.05) });
    const hTop = Math.min(top + 0.17, roofAt(z + 0.05) - 0.05);
    if (hTop > top + 0.06) box(ctx, FIN.seat, x, (top + 0.02 + hTop) / 2, z + 0.06, w * 0.55, hTop - top - 0.02, 0.1, 0.2, 0, 0);
  };
  const fz = o.frontSeat ?? eye[2] + 0.12;
  if (o.frontSeats !== false) { seat(sxL, fz); seat(-sxL, fz); }
  if (o.rearSeat) {
    const z = o.rearSeat, y0 = yAt(z), top = Math.min(y0 + 0.26, roofAt(z) - 0.2), bot = y0 - 0.25;
    box(ctx, FIN.seat, 0, (top + bot) / 2, z, 2 * wIn(z) - 0.08, top - bot, 0.14, 0.25, 0, 0);
    if (IR) IR.rear = { z, w: 2 * wIn(z) - 0.08, top, bot, hTop: Math.min(top + 0.15, roofAt(z + 0.05) - 0.05) };
    const hTop = Math.min(top + 0.15, roofAt(z + 0.05) - 0.05);
    if (hTop > top + 0.05) for (const x of [-0.42, 0.42]) box(ctx, FIN.seat, x, (top + 0.02 + hTop) / 2, z + 0.07, 0.24, hTop - top - 0.02, 0.1, 0.25, 0, 0);
  }
  ctx.noBounds = false;
}
/** inward-facing dark shell following the lower body between z0 and z1 (cab / saloon interiors of single-loft bodies) */
function innerShell(ctx, z0, z1, inset = 0.03, yMin = 0) {
  if (ctx.lod) return;
  const P = ctx.P, soup = new Soup();
  const ring = (z) => {
    const { pts, tags } = lowerRing(P, z, 1);
    const o = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      return [Math.max(0, p[0] - ty * inset), Math.max(yMin, p[1] + tx * inset)];
    });
    o[0][0] = 0; o[o.length - 1][0] = 0;
    return { pts: o, tags };
  };
  loft(soup, fillStations([z0, z1], yMin > 0 ? 1.2 : 0.4), ring, () => FIN.interior, { closed: true, flip: true, capStart: true, capEnd: true, capFin: FIN.interior });
  const nb = ctx.noBounds; ctx.noBounds = true; emitSoup(ctx, soup, 60); ctx.noBounds = nb;
}
function chmsl(ctx, x0, x1, y, dir = '+z') { patch(ctx, dir, rrect(x0, y - 0.009, x1, y + 0.009, 0.008), Lf(0xd4000c, LAMP.BRAKE), { off: 0.006 }); }
function badge(ctx, dir, x, y, r = 0.045) { return tagged(ctx, () => ({ k: 'badge', dir, x, y, r }), () => badge_(ctx, dir, x, y, r)); }
function badge_(ctx, dir, x, y, r = 0.045) { patch(ctx, dir, ell(x, y, r, r, 16), tx(FIN.decalChrome, 'BADGE'), { off: 0.009 }); }
/** planform outline of the lower body at height y around one end: returns [x, z] points right side -> across -> left side */
function planEnd(P, y, zFrom, end, gap = 0) {
  const zs = [], n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n, zE = end === 'F' ? P.zF : P.zR;
    const tt = 1 - Math.cos((t * Math.PI) / 2);
    zs.push(lerp(zFrom, zE, t < 0.6 ? t / 0.6 * 0.6 : 0.6 + 0.4 * tt));
  }
  const zEnd = end === 'F' ? P.zF : P.zR, right = [];
  for (const z of zs) { const S = section(P, z); right.push([S.sideX(clamp(y, S.yb, S.yh)) + gap, z]); }
  const xe = right[right.length - 1][0];
  for (let i = 1; i <= 3; i++) right.push([xe * (1 - i / 3), zEnd + (end === 'F' ? -gap : gap)]);
  const left = right.slice(0, -1).reverse().map(([x, z]) => [-x, z]);
  return right.concat(left);
}
function bumperBar(ctx, y, zFrom, end, prof, fin, gap = 0.012) {
  const pl = planEnd(ctx.P, y, zFrom, end, gap);
  const path = (end === 'F' ? pl : pl.slice().reverse()).map(([x, z]) => [x, y, z]);
  tube(ctx, path, prof, fin, { crease: 60 });
}

// ================================================================== model definitions
const DEFS = {};
// SF street colours (share of cars on the road, ~2024 US fleet + the city's grey/white bias): white, black, grey and
// silver are ~70 %, then blue and red; a sprinkle of greens, beiges and the odd yellow / orange / teal.
export const STREET_PAINT = [
  [0xeeeeec, 0.13], [0xf5f5f2, 0.05], [0xdcdcd8, 0.03],                     // whites
  [0x0e0f11, 0.12], [0x1a1b1e, 0.06],                                       // blacks
  [0x5d6168, 0.07], [0x44474d, 0.05], [0x8d9197, 0.05],                     // greys
  [0xb4b8bd, 0.09], [0xc9ccd0, 0.05],                                       // silvers
  [0x1f3a66, 0.04], [0x2b3a55, 0.03], [0x1f5d8a, 0.02], [0x6b8fb5, 0.01],   // blues
  [0x9c1b1f, 0.04], [0x7a1d22, 0.02], [0xb3262a, 0.02],                     // reds
  [0x2e4a38, 0.015], [0x5e7152, 0.01], [0xc9c1b0, 0.015], [0x6b5139, 0.01], // greens, beige, brown
  [0xd9a21b, 0.005], [0xc4571c, 0.005], [0x4b2e5a, 0.003], [0x2f7f7a, 0.005],
];
/** weighted street colour for r in [0, 1) */
export function streetPaint(r) { let t = 0; for (const [, w] of STREET_PAINT) t += w; let x = r * t; for (const [c, w] of STREET_PAINT) { x -= w; if (x <= 0) return c; } return STREET_PAINT[0][0]; }
const PAL = STREET_PAINT.map(([c]) => c);

// ---- sedan family (sedan / taxi / police share the body)
function sedanBase() {
  return {
    wb: 2.82, ohF: 0.97, ohR: 1.06, R: 0.334, ww: 0.235, rimR: 0.229, tf: 1.565, tr: 1.565,
    body: {
      yb: [[-2.38, 0.3], [-2.1, 0.24], [-1.8, 0.2], [-1.0, 0.18], [1.0, 0.18], [1.8, 0.21], [2.2, 0.28], [2.47, 0.36]],
      yh: [[-2.38, 0.77], [-2.0, 0.815], [-1.4, 0.855], [-0.7, 0.9], [0.3, 0.94], [1.3, 0.975], [2.0, 0.995], [2.47, 0.98]],
      yt: [[-2.38, 0.79], [-2.12, 0.845], [-1.5, 0.885], [-0.7, 0.935], [-0.2, 0.95], [1.6, 0.99], [2.1, 1.015], [2.47, 1.0]],
      w: [[-2.38, 0.8], [-2.15, 0.875], [-1.8, 0.905], [-1.41, 0.918], [0, 0.922], [1.41, 0.92], [2.0, 0.905], [2.3, 0.88], [2.47, 0.845]],
      kw: 0.42, tuck: 0.06, tumble: 0.035, sr: 0.075, charY: [[-2.3, 0.7], [0, 0.77], [2.4, 0.84]], charD: 0.007,
      rndF: { z: 0.22, x: 0.14, t: 0.09, b: 0.06 }, rndR: { z: 0.12, x: 0.08, t: 0.04, b: 0.04 },
    },
    arch: { dy: 0.02, top: 0.06, side: 0.075, p: 2.2 },
    gh: {
      z0: -0.78, z1: 1.9,
      roof: [[-0.78, 0.9], [-0.5, 1.07], [-0.2, 1.24], [0.1, 1.385], [0.35, 1.435], [0.75, 1.44], [1.05, 1.41], [1.35, 1.3], [1.65, 1.14], [1.9, 0.98]],
      wb: [[-0.78, 0.79], [-0.3, 0.815], [0.5, 0.83], [1.3, 0.82], [1.9, 0.77]],
      wt: [[-0.78, 0.73], [-0.2, 0.685], [0.4, 0.672], [1.0, 0.665], [1.5, 0.64], [1.9, 0.6]],
      rc: 0.07, crown: 0.035,
      ws: [-0.78, 0.13], rear: [1.1, 1.9], side: [[-0.56, 0.3], [0.39, 1.3]],
      pillarFin: (z) => (z < 0.39 ? FIN.blackGloss : FIN.paint),
    },
  };
}
function sedanDetails(ctx, o = {}) {
  headlamps(ctx, { poly: [[0.42, 0.625], [0.62, 0.635], [0.78, 0.66], [0.855, 0.69], [0.84, 0.735], [0.64, 0.73], [0.44, 0.7]], drl: o.drl === false ? null : [[0.45, 0.63], [0.77, 0.662], [0.775, 0.672], [0.45, 0.642]] });
  grille(ctx, { poly: [[-0.37, 0.53], [0.37, 0.53], [0.4, 0.69], [-0.4, 0.69]], tex: o.grilleTex || 'SLATS', surround: FIN.chrome, sw: 0.012 });
  grille(ctx, { poly: [[-0.58, 0.31], [0.58, 0.31], [0.63, 0.45], [-0.63, 0.45]], tex: 'HONEY' });
  for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? ell(0.74, 0.38, 0.05, 0.028, 12) : ell(-0.74, 0.38, 0.05, 0.028, 12), Lf(0xf4f4ff, LAMP.HEAD), { off: 0.008 });
  badge(ctx, '-z', 0, 0.61, 0.042);
  plate(ctx, 'F', { y: 0.38, idx: o.plate ?? 0 });
  taillamps(ctx, { poly: [[0.47, 0.85], [0.87, 0.85], [0.89, 0.925], [0.49, 0.94]], rev: [[0.405, 0.87], [0.462, 0.87], [0.475, 0.925], [0.41, 0.93]] });
  patch(ctx, '+z', [[-0.4, 0.915], [0.4, 0.915], [0.4, 0.927], [-0.4, 0.927]], FIN.chrome, { off: 0.008 });
  plate(ctx, 'R', { y: 0.7, idx: o.plate ?? 0 });
  badge(ctx, '+z', 0, 0.9, 0.035);
  grille(ctx, { poly: [[-0.62, 0.38], [0.62, 0.38], [0.66, 0.46], [-0.66, 0.46]], dir: '+z', tex: 'HONEY' });
  if (o.exhaust !== false) exhausts(ctx, [{ x: -0.5, y: 0.33, r: 0.036 }, { x: 0.5, y: 0.33, r: 0.036 }]);
  chmsl(ctx, -0.13, 0.13, 1.37);
  mirrors(ctx, { z: -0.5, y: 1.0, fin: o.mirrorFin });
  if (o.archLips !== false) archTrims(ctx, { fin: FIN.paint, width: 0.032, out: 0.007, inner: 0.004 });
  handles(ctx, [[0.02, 0.875], [0.97, 0.9]], o.handleFin || FIN.chrome);
  bothSides(ctx, (dir) => {
    seam(ctx, dir, [[-0.93, 0.27], [-0.95, 0.62], [-0.88, 0.9]]);
    seam(ctx, dir, [[0.345, 0.26], [0.345, 0.93]]);
    seam(ctx, dir, [[1.01, 0.26], [1.0, 0.52], [1.1, 0.7], [1.25, 0.84], [1.29, 0.96]]);
  });
  seam(ctx, '+y', [[-0.74, -2.2], [0.74, -2.2]]);
  seam(ctx, '+y', [[-0.74, 1.95], [0.74, 1.95]]);
  seam(ctx, '+z', [[-0.78, 0.98], [-0.8, 0.84], [0.8, 0.84], [0.78, 0.98]]);
  if (o.belt !== false) beltTrim(ctx, o.belt || FIN.chrome, -0.56, 1.3);
  wipers(ctx);
  interior(ctx, { rearSeat: 0.95 });
}

DEFS.sedan = () => Object.assign(sedanBase(), {
  name: 'Veloce Meridian', defaultPaint: 0x2b3a55, wheel: { style: 'split5', fin: FIN.alu },
  features: (ctx) => sedanDetails(ctx, {}),
});
DEFS.taxi = () => Object.assign(sedanBase(), {
  name: 'Meridian Taxi', defaultPaint: 0xf2b90f, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.chrome },
  proxyExtra: (ctx) => { const y0 = ctx.P.gh.roof(0.62); box(ctx, D(0x151515, 0, 0.6), 0, y0 + 0.02, 0.62, 0.64, 0.05, 0.28); box(ctx, D(0xfff2c0, 0, 0.4), 0, y0 + 0.13, 0.62, 0.6, 0.18, 0.22); },
  extraBounds: { maxY: 1.72 },
  features: (ctx) => {
    sedanDetails(ctx, { plate: 2, mirrorFin: FIN.black });
    bothSides(ctx, (dir) => patch(ctx, dir, [[-1.0, 0.7], [1.2, 0.7], [1.2, 0.76], [-1.0, 0.76]], tx(FIN.decal, 'CHECKER'), { off: 0.006 }));
    // roof sign
    const G = ctx.P.gh, z = 0.62, y0 = G.roof(z);
    rbox(ctx, FIN.black, 0, y0 + 0.02, z, 0.66, 0.05, 0.3, 0.02);
    rbox(ctx, Lf(0xfff2c0, LAMP.SIGN), 0, y0 + 0.14, z, 0.62, 0.2, 0.22, 0.03);
    for (const s of [-1, 1]) addGeo(ctx, BOX(), Lf(0xffffff, LAMP.SIGN, 'TAXI'), M(0, y0 + 0.14, z + s * 0.1125, 0, s > 0 ? 0 : Math.PI, 0, 0.5, 0.15, 0.004));
    bothSides(ctx, (dir) => patch(ctx, dir, [[0.1, 0.58], [0.3, 0.58], [0.3, 0.66], [0.1, 0.66]], tx(FIN.decal, 'UNIT'), { off: 0.006 }));
  },
});
DEFS.police = () => Object.assign(sedanBase(), {
  name: 'Meridian Interceptor', defaultPaint: 0x0c0c0e, defaultPaint2: 0xf3f3f3, wheel: { style: 'steel', fin: FIN.black, cap: FIN.chrome },
  proxyExtra: (ctx) => {
    const y0 = ctx.P.gh.roof(0.42);
    box(ctx, D(0xd01010, 0, 0.4), -0.31, y0 + 0.07, 0.42, 0.56, 0.09, 0.25); box(ctx, D(0x1040e0, 0, 0.4), 0.31, y0 + 0.07, 0.42, 0.56, 0.09, 0.25);
    bothSides(ctx, (dir) => patch(ctx, dir, [[-0.92, 0.3], [0.99, 0.3], [0.99, 0.88], [-0.92, 0.88]], D(0xf3f3f3, 0, 0.4), { off: 0.006 }));
  },
  extraBounds: { minZ: -2.52, maxY: 1.67 },
  features: (ctx) => {
    sedanDetails(ctx, { plate: 3, mirrorFin: FIN.black, handleFin: FIN.black, drl: false, archLips: false, belt: false });
    // white doors + roof (paint2)
    bothSides(ctx, (dir) => {
      patch(ctx, dir, [[-0.92, 0.29], [0.99, 0.29], [0.99, 0.5], [1.1, 0.68], [1.24, 0.8], [1.27, 0.9], [-0.87, 0.89], [-0.94, 0.62]], FIN.paint2, { off: 0.006, maxEdge: 0.24, refine: 2 });
      patch(ctx, dir, [[-0.78, 0.48], [0.62, 0.48], [0.62, 0.74], [-0.78, 0.74]], tx(FIN.decal, 'POLICE'), { off: 0.0095 });
    });
    patch(ctx, '+y', [[-0.6, 0.16], [0.6, 0.16], [0.6, 1.06], [-0.6, 1.06]], FIN.paint2, { off: 0.005, maxEdge: 0.2 });
    // light bar: black base, red left, blue right, clear centre
    const G = ctx.P.gh, z = 0.42, y0 = G.roof(z) + 0.004;
    box(ctx, FIN.black, -0.45, y0 + 0.012, z, 0.04, 0.03, 0.1); box(ctx, FIN.black, 0.45, y0 + 0.012, z, 0.04, 0.03, 0.1);
    rbox(ctx, FIN.black, 0, y0 + 0.045, z, 1.24, 0.05, 0.27, 0.02);
    rbox(ctx, Lf(0xff0a0a, LAMP.RED), -0.33, y0 + 0.1, z, 0.54, 0.075, 0.24, 0.035);
    rbox(ctx, Lf(0x1a4dff, LAMP.BLUE), 0.33, y0 + 0.1, z, 0.54, 0.075, 0.24, 0.035);
    rbox(ctx, Lf(0xe8f0ff, LAMP.NONE), 0, y0 + 0.1, z, 0.1, 0.07, 0.22, 0.02);
    // push bumper
    const zf = ctx.P.zF;
    for (const s of [-1, 1]) {
      cylAB(ctx, FIN.black, [s * 0.3, 0.32, zf - 0.09], [s * 0.3, 0.74, zf - 0.09], 0.025, 8);
      box(ctx, FIN.black, s * 0.3, 0.42, zf - 0.02, 0.04, 0.05, 0.14);
      box(ctx, FIN.rubber, s * 0.3, 0.55, zf - 0.12, 0.07, 0.3, 0.03);
    }
    cylAB(ctx, FIN.black, [-0.36, 0.64, zf - 0.09], [0.36, 0.64, zf - 0.09], 0.022, 8);
    cylAB(ctx, FIN.black, [-0.36, 0.44, zf - 0.09], [0.36, 0.44, zf - 0.09], 0.022, 8);
    // spotlight on the driver A-pillar
    cylAB(ctx, FIN.chrome, [-0.86, 1.02, -0.45], [-0.86, 1.02, -0.6], 0.055, 12);
    patch(ctx, '-z', ell(0.62, 0.575, 0.03, 0.02, 10), Lf(0xff2020, LAMP.RED), { off: 0.009 });
    patch(ctx, '-z', ell(-0.62, 0.575, 0.03, 0.02, 10), Lf(0x2050ff, LAMP.BLUE), { off: 0.009 });
    cylAB(ctx, FIN.black, [0.4, G.roof(1.0) - 0.02, 1.0], [0.4, G.roof(1.0) + 0.25, 1.05], 0.004, 4);
  },
});

// ---- hatch
DEFS.hatch = () => ({
  name: 'Kiwi GT', defaultPaint: 0xc8352c, wheel: { style: 'split5', fin: FIN.silver },
  wb: 2.62, ohF: 0.86, ohR: 0.57, R: 0.316, ww: 0.205, rimR: 0.203, tf: 1.54, tr: 1.52,
  body: {
    yb: [[-2.17, 0.33], [-1.95, 0.24], [-1.6, 0.2], [-1.0, 0.175], [1.0, 0.18], [1.45, 0.22], [1.7, 0.27], [1.88, 0.35]],
    yh: [[-2.17, 0.72], [-1.9, 0.79], [-1.3, 0.86], [-0.8, 0.925], [0.3, 0.96], [1.3, 0.98], [1.88, 0.975]],
    yt: [[-2.17, 0.73], [-1.95, 0.805], [-1.35, 0.885], [-0.85, 0.945], [-0.3, 0.965], [1.88, 0.995]],
    w: [[-2.17, 0.78], [-1.95, 0.86], [-1.31, 0.883], [0, 0.89], [1.31, 0.888], [1.7, 0.87], [1.88, 0.845]],
    kw: 0.42, tuck: 0.055, tumble: 0.035, sr: 0.07, charY: [[-2.1, 0.66], [0, 0.78], [1.85, 0.84]], charD: 0.006,
    rndF: { z: 0.17, x: 0.12, t: 0.05, b: 0.05 }, rndR: { z: 0.09, x: 0.06, t: 0.03, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.055, side: 0.07, p: 2.2 },
  gh: {
    z0: -1.02, z1: 1.86,
    roof: [[-1.02, 0.9], [-0.74, 1.07], [-0.44, 1.24], [-0.16, 1.4], [0.2, 1.455], [0.9, 1.455], [1.3, 1.44], [1.5, 1.405], [1.64, 1.28], [1.76, 1.1], [1.86, 0.93]],
    wb: [[-1.02, 0.78], [-0.3, 0.8], [0.8, 0.81], [1.5, 0.8], [1.86, 0.76]],
    wt: [[-1.02, 0.72], [-0.2, 0.665], [0.6, 0.655], [1.4, 0.645], [1.86, 0.6]],
    rc: 0.07, crown: 0.035,
    ws: [-1.02, -0.13], rear: [1.5, 1.86], side: [[-0.82, 0.3], [0.39, 1.18]],
    pillarFin: (z) => (z < 0.39 ? FIN.blackGloss : FIN.paint),
  },
  features: (ctx) => {
    headlamps(ctx, { poly: [[0.38, 0.655], [0.74, 0.675], [0.83, 0.71], [0.8, 0.755], [0.4, 0.735]], drl: [[0.42, 0.66], [0.74, 0.68], [0.75, 0.69], [0.42, 0.672]] });
    grille(ctx, { poly: [[-0.36, 0.63], [0.36, 0.63], [0.38, 0.7], [-0.38, 0.7]], tex: 'SLATS', fin: FIN.blackGloss });
    patch(ctx, '-z', [[-0.37, 0.67], [0.37, 0.67], [0.37, 0.677], [-0.37, 0.677]], FIN.chrome, { off: 0.009 });
    grille(ctx, { poly: [[-0.52, 0.35], [0.52, 0.35], [0.58, 0.51], [-0.58, 0.51]], tex: 'HONEY' });
    badge(ctx, '-z', 0, 0.665, 0.038);
    plate(ctx, 'F', { y: 0.43, idx: 1 });
    taillamps(ctx, { poly: [[0.5, 0.835], [0.86, 0.835], [0.87, 0.925], [0.54, 0.935]] });
    for (const s of [-1, 1]) patch(ctx, '+z', s > 0 ? rrect(0.42, 0.37, 0.56, 0.41, 0.01) : rrect(-0.56, 0.37, -0.42, 0.41, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.008 });
    plate(ctx, 'R', { y: 0.63, idx: 1 });
    badge(ctx, '+z', 0, 0.8, 0.035);
    grille(ctx, { poly: [[-0.5, 0.36], [0.5, 0.36], [0.52, 0.42], [-0.52, 0.42]], dir: '+z', fin: FIN.black });
    exhausts(ctx, [{ x: -0.45, y: 0.28, r: 0.033 }]);
    // roof spoiler over the tailgate glass
    const G = ctx.P.gh, zs = 1.52, ys = G.roof(zs);
    const spPath = [-0.6, -0.3, 0, 0.3, 0.6].map((x) => [x, ys - G.crown * sq(x / G.wt(zs)) + 0.004, zs - 0.02]);
    tube(ctx, spPath, [[-0.07, -0.02], [0.06, -0.02], [0.075, 0.0], [0.05, 0.012], [-0.07, 0.006]], FIN.paint, { up: () => [0, 1, 0], crease: 40 });
    chmsl(ctx, -0.16, 0.16, ys - 0.03);
    mirrors(ctx, { z: -0.76, y: 1.0, fin: FIN.paint });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.007, inner: 0.004 });
    handles(ctx, [[-0.08, 0.89], [0.84, 0.9]], FIN.paint);
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.95, 0.25], [-0.97, 0.62], [-0.92, 0.88]]);
      seam(ctx, dir, [[0.345, 0.24], [0.345, 0.94]]);
      seam(ctx, dir, [[0.98, 0.24], [0.98, 0.48], [1.06, 0.64], [1.16, 0.8], [1.19, 0.935]]);
    });
    seam(ctx, '+y', [[-0.72, -2.02], [0.72, -2.02]]);
    seam(ctx, '+z', [[-0.72, 0.6], [0.72, 0.6]]);
    beltTrim(ctx, FIN.blackGloss, -0.82, 1.18);
    wipers(ctx);
    interior(ctx, { rearSeat: 0.82 });
  },
});

// ---- muscle ('68 fastback homage)
DEFS.muscle = () => ({
  name: 'Stallion 390 Fastback', defaultPaint: 0x1f3a2c, extraBounds: { maxX: 0.965, minZ: -2.36, maxZ: 2.4 }, wheel: { style: 'torq5', fin: FIN.gun, lip: FIN.chrome },
  wb: 2.74, ohF: 0.92, ohR: 0.96, R: 0.33, ww: 0.215, wwR: 0.25, rimR: 0.19, tf: 1.52, tr: 1.52,
  body: {
    yb: [[-2.29, 0.32], [-2.0, 0.24], [-1.5, 0.2], [0, 0.185], [1.5, 0.2], [2.0, 0.25], [2.33, 0.34]],
    yh: [[-2.29, 0.79], [-1.8, 0.825], [-1.0, 0.855], [-0.4, 0.875], [0.8, 0.9], [1.6, 0.925], [2.33, 0.93]],
    yt: [[-2.29, 0.785], [-2.0, 0.825], [-1.2, 0.865], [-0.5, 0.89], [0.5, 0.9], [1.8, 0.93], [2.2, 0.94], [2.33, 0.965]],
    w: [[-2.29, 0.84], [-2.05, 0.885], [-1.37, 0.9], [-0.2, 0.902], [1.0, 0.915], [1.37, 0.92], [2.1, 0.9], [2.33, 0.875]],
    kw: 0.52, tuck: 0.08, tumble: 0.05, sr: 0.045, crease: 32, charY: [[-2.25, 0.7], [-0.5, 0.7], [0.5, 0.68], [0.85, 0.7]], charD: 0.008,
    rndF: { z: 0.1, x: 0.06, t: 0.03, b: 0.05 }, rndR: { z: 0.07, x: 0.05, t: 0.015, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.07, side: 0.08, p: 2.0 },
  gh: {
    z0: -0.62, z1: 2.12,
    roof: [[-0.62, 0.86], [-0.4, 0.98], [-0.15, 1.14], [0.1, 1.265], [0.3, 1.305], [0.6, 1.31], [0.9, 1.28], [1.3, 1.185], [1.7, 1.07], [2.0, 0.975], [2.12, 0.93]],
    wb: [[-0.62, 0.78], [0, 0.8], [1.0, 0.82], [1.8, 0.8], [2.12, 0.77]],
    wt: [[-0.62, 0.7], [0, 0.655], [0.6, 0.645], [1.2, 0.625], [2.12, 0.58]],
    rc: 0.05, crown: 0.03,
    ws: [-0.62, 0.22], rear: [0.9, 1.84], side: [[-0.48, 0.74]],
    pillarFin: FIN.paint,
  },
  features: (ctx) => {
    const P = ctx.P;
    // wide dark mouth with round lamps
    grille(ctx, { poly: rrect(-0.72, 0.47, 0.72, 0.72, 0.06), tex: 'EGG', surround: FIN.chrome, sw: 0.016, fin: FIN.grille });
    for (const s of [-1, 1]) {
      const cx = s * 0.575, cy = 0.595;
      patch(ctx, '-z', ell(cx, cy, 0.095, 0.095, 24), FIN.chrome, { off: 0.01, depth: 0.012, holes: [ell(cx, cy, 0.078, 0.078, 24)] });
      const r = patch(ctx, '-z', ell(cx, cy, 0.08, 0.08, 24), Lf(0xffffff, LAMP.HEAD, 'HEADR'), { off: 0.012 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
    }
    badge(ctx, '-z', 0, 0.6, 0.06);
    patch(ctx, '-z', [[-0.62, 0.595], [0.62, 0.595], [0.62, 0.603], [-0.62, 0.603]], FIN.chrome, { off: 0.011 });
    // chrome blade bumpers
    const bprof = [[-0.01, -0.045], [0.03, -0.04], [0.045, 0.0], [0.03, 0.035], [-0.01, 0.04]];
    bumperBar(ctx, 0.43, P.zF + 0.42, 'F', bprof, FIN.chrome, 0.018);
    for (const s of [-1, 1]) patch(ctx, '-z', rrect(s * 0.6 - 0.07, 0.3, s * 0.6 + 0.07, 0.34, 0.015), Lf(0xffb040, LAMP.NONE), { off: 0.008 });
    plate(ctx, 'F', { y: 0.33, idx: 2 });
    // tail: black concave panel + 3 vertical lamps per side + chrome gas cap
    patch(ctx, '+z', rrect(-0.76, 0.63, 0.76, 0.87, 0.03), FIN.blackGloss, { off: 0.005 });
    for (const s of [-1, 1]) for (const cx of [0.36, 0.5, 0.64]) {
      const x = s * cx;
      patch(ctx, '+z', rrect(x - 0.052, 0.66, x + 0.052, 0.84, 0.012), FIN.chrome, { off: 0.008 });
      patch(ctx, '+z', rrect(x - 0.042, 0.67, x + 0.042, 0.83, 0.01), Lf(0xc8000a, LAMP.TAIL), { off: 0.011 });
    }
    patch(ctx, '+z', ell(0, 0.75, 0.07, 0.07, 20), FIN.chrome, { off: 0.009, depth: 0.01 });
    patch(ctx, '+z', ell(0, 0.75, 0.045, 0.045, 16), tx(FIN.decalChrome, 'BADGE'), { off: 0.021 });
    bumperBar(ctx, 0.46, P.zR - 0.35, 'R', bprof, FIN.chrome, 0.018);
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.25 - 0.06, 0.34, s * 0.25 + 0.06, 0.38, 0.012), Lf(0xf6f6ff, LAMP.REV), { off: 0.008 });
    plate(ctx, 'R', { y: 0.36, idx: 2 });
    exhausts(ctx, [{ x: -0.52, y: 0.26, r: 0.036, len: 0.45 }, { x: 0.52, y: 0.26, r: 0.036, len: 0.45 }]);
    // side scoop, C-pillar louvres
    bothSides(ctx, (dir) => {
      patch(ctx, dir, [[0.66, 0.52], [0.95, 0.54], [0.97, 0.7], [0.74, 0.66]], FIN.blackGloss, { off: 0.005 });
      patch(ctx, dir, [[0.66, 0.52], [0.95, 0.54], [0.95, 0.548], [0.66, 0.528]], FIN.chrome, { off: 0.008 });
      patch(ctx, dir, [[0.95, 0.94], [1.35, 0.95], [1.3, 1.07], [0.95, 1.08]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
      seam(ctx, dir, [[-0.93, 0.25], [-0.96, 0.87]]);
      seam(ctx, dir, [[0.76, 0.25], [0.8, 0.58], [0.78, 0.88]]);
      patch(ctx, dir, [[-2.1, 0.62], [0.9, 0.66], [0.9, 0.672], [-2.1, 0.632]], FIN.seam, { off: 0.005 });
    });
    seam(ctx, '+y', [[-0.76, -2.12], [0.76, -2.12]]);
    seam(ctx, '+y', [[-0.72, 1.9], [0.72, 1.9]]);
    beltTrim(ctx, FIN.chrome, -0.48, 0.74, { h: 0.008 });
    // drip rail chrome along the roof edge
    for (const s of [-1, 1]) {
      const pts = []; const G = P.gh;
      for (let z = -0.3; z <= 0.85; z += 0.05) pts.push([s * (G.wt(z) + 0.004), G.roof(z) - G.crown - 0.03, z]);
      tube(ctx, s > 0 ? pts : pts.slice().reverse(), [[-0.004, -0.004], [0.006, -0.004], [0.006, 0.004], [-0.004, 0.004]], FIN.chrome);
    }
    mirrors(ctx, { z: -0.36, y: 0.93, fin: FIN.chrome, stalk: FIN.chrome, len: 0.12, h: 0.09, d: 0.09, driverOnly: true });
    archTrims(ctx, { fin: FIN.paint, width: 0.035, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.55, 0.83]], FIN.chrome);
    wipers(ctx, { list: [[-0.4, 0.48, 0.05], [0.18, 0.46, 0.08]] });
    interior(ctx, { rearSeat: 1.1, wheelY: 0.17 });
  },
});

// ---- coupe (rear-engine, 911 vibe)
DEFS.coupe = () => ({
  name: 'Schwabe 9R', defaultPaint: 0xb9bdc2, wheel: { style: 'fuchs5', fin: FIN.alu },
  wb: 2.45, ohF: 0.96, ohR: 1.11, R: 0.345, ww: 0.245, wwR: 0.3, rimR: 0.254, tf: 1.565, tr: 1.56,
  body: {
    yb: [[-2.185, 0.3], [-1.9, 0.22], [-1.3, 0.18], [0, 0.155], [1.2, 0.17], [1.8, 0.22], [2.1, 0.28], [2.335, 0.34]],
    yh: [[-2.185, 0.6], [-1.95, 0.69], [-1.5, 0.76], [-1.22, 0.78], [-0.9, 0.76], [-0.5, 0.75], [0.4, 0.8], [0.9, 0.84], [1.25, 0.86], [1.7, 0.865], [2.1, 0.86], [2.335, 0.835]],
    yt: [[-2.185, 0.6], [-1.95, 0.66], [-1.5, 0.705], [-0.9, 0.735], [-0.5, 0.76], [1.0, 0.84], [1.6, 0.87], [2.1, 0.885], [2.335, 0.865]],
    w: [[-2.185, 0.76], [-2.0, 0.85], [-1.6, 0.9], [-1.225, 0.915], [-0.6, 0.905], [0.2, 0.915], [0.8, 0.94], [1.225, 0.955], [1.8, 0.945], [2.15, 0.92], [2.335, 0.87]],
    kw: 0.45, tuck: 0.07, tumble: 0.06, sr: 0.085, crease: 45,
    rndF: { z: 0.22, x: 0.15, t: 0.07, b: 0.05 }, rndR: { z: 0.15, x: 0.12, t: 0.05, b: 0.05 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.0 },
  gh: {
    z0: -0.82, z1: 2.15,
    roof: [[-0.82, 0.73], [-0.55, 0.9], [-0.3, 1.1], [-0.05, 1.24], [0.2, 1.3], [0.45, 1.3], [0.75, 1.255], [1.1, 1.16], [1.45, 1.045], [1.8, 0.945], [2.05, 0.89], [2.15, 0.86]],
    wb: [[-0.82, 0.76], [0, 0.8], [0.8, 0.8], [1.5, 0.76], [2.15, 0.72]],
    wt: [[-0.82, 0.69], [0, 0.64], [0.6, 0.62], [1.1, 0.58], [1.6, 0.5], [2.15, 0.44]],
    rc: 0.08, crown: 0.04,
    ws: [-0.82, 0.12], rear: [0.95, 1.72], side: [[-0.62, 0.5], [0.56, 1.02]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      const c = lampPod(ctx, s * 0.655, 0.655, 0.105, 0.088, { mix: 0.3, up: 0.12, len: 0.12, out: 0.03 });
      if (c) ctx.head.push(new THREE.Vector3(c[0], c[1], c[2] - 0.02));
    }
    grille(ctx, { poly: [[-0.34, 0.3], [0.34, 0.3], [0.37, 0.44], [-0.37, 0.44]], tex: 'HONEY' });
    for (const s of [-1, 1]) {
      grille(ctx, { poly: s > 0 ? [[0.48, 0.31], [0.78, 0.33], [0.76, 0.46], [0.5, 0.45]] : mirX([[0.48, 0.31], [0.78, 0.33], [0.76, 0.46], [0.5, 0.45]]), tex: 'HONEY' });
      patch(ctx, '-z', s > 0 ? [[0.5, 0.47], [0.75, 0.48], [0.75, 0.49], [0.5, 0.482]] : mirX([[0.5, 0.47], [0.75, 0.48], [0.75, 0.49], [0.5, 0.482]]), Lf(0xffffff, LAMP.DRL), { off: 0.007 });
    }
    badge(ctx, '-z', 0, 0.58, 0.035);
    plate(ctx, 'F', { y: 0.37, idx: 3 });
    // full-width tail bar
    patch(ctx, '+z', [[-0.88, 0.765], [0.88, 0.765], [0.87, 0.815], [-0.87, 0.815]], FIN.blackGloss, { off: 0.004 });
    patch(ctx, '+z', [[-0.86, 0.775], [0.86, 0.775], [0.85, 0.805], [-0.85, 0.805]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.008 });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.62 - 0.08, 0.4, s * 0.62 + 0.08, 0.43, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    grille(ctx, { poly: [[-0.7, 0.3], [0.7, 0.3], [0.72, 0.38], [-0.72, 0.38]], dir: '+z', fin: FIN.black, tex: 'HONEY' });
    plate(ctx, 'R', { y: 0.52, idx: 3 });
    exhausts(ctx, [{ x: -0.1, y: 0.33, r: 0.034, oval: true, dz: 0.0 }, { x: 0.1, y: 0.33, r: 0.034, oval: true, dz: 0.0 }]);
    // engine lid louvres + ducktail spoiler
    patch(ctx, '+y', [[-0.36, 1.78], [0.36, 1.78], [0.36, 2.0], [-0.36, 2.0]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    const zs = 2.2, ys = section(P, zs).yt;
    tube(ctx, [[-0.66, ys + 0.004, zs], [0, ys + 0.012, zs], [0.66, ys + 0.004, zs]], [[-0.1, -0.012], [0.07, 0.035], [0.1, 0.03], [0.05, -0.02]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    box(ctx, Lf(0xd4000c, LAMP.BRAKE), 0, ys + 0.045, zs + 0.075, 0.5, 0.012, 0.012);
    mirrors(ctx, { z: -0.47, y: 0.82, fin: FIN.paint, len: 0.19, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.04, out: 0.009, inner: 0.004 });
    handles(ctx, [[0.38, 0.8]], FIN.blackGloss, { flush: true });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.84, 0.24], [-0.85, 0.6], [-0.78, 0.8]]);
      seam(ctx, dir, [[0.62, 0.22], [0.64, 0.55], [0.6, 0.84]]);
    });
    seam(ctx, '+y', [[-0.6, -2.02], [0.6, -2.02]]);
    wipers(ctx, { list: [[-0.36, 0.5, 0.05], [0.16, 0.48, 0.08]] });
    interior(ctx, { rearSeat: 0.95, wheelY: 0.13 });
  },
});

// ---- super (mid-engine wedge)
DEFS.super = () => ({
  name: 'Toro Furia', defaultPaint: 0xf2640f, extraBounds: { minY: 0.075 }, wheel: { style: 'y5', fin: FIN.graphite },
  wb: 2.62, ohF: 1.02, ohR: 0.88, R: 0.335, ww: 0.245, wwR: 0.305, rimR: 0.254, tf: 1.66, tr: 1.6,
  body: {
    yb: [[-2.33, 0.16], [-2.05, 0.13], [-1.31, 0.12], [0, 0.11], [1.31, 0.12], [1.9, 0.17], [2.19, 0.3]],
    yh: [[-2.33, 0.45], [-2.05, 0.57], [-1.7, 0.7], [-1.31, 0.765], [-0.95, 0.76], [-0.6, 0.72], [0.0, 0.74], [0.7, 0.82], [1.31, 0.86], [1.9, 0.86], [2.19, 0.83]],
    yt: [[-2.33, 0.44], [-2.0, 0.53], [-1.6, 0.6], [-1.2, 0.65], [-0.6, 0.7], [0.5, 0.8], [1.2, 0.86], [1.9, 0.88], [2.19, 0.85]],
    w: [[-2.33, 0.72], [-2.15, 0.86], [-1.85, 0.94], [-1.31, 0.965], [-0.6, 0.93], [0.2, 0.935], [0.9, 0.965], [1.31, 0.975], [1.9, 0.965], [2.19, 0.93]],
    kw: 0.45, tuck: 0.12, tumble: 0.06, sr: 0.035, crease: 28, charY: [[-2.3, 0.36], [-1.0, 0.45], [0.4, 0.52], [2.1, 0.6]], charD: 0.01,
    rndF: { z: 0.08, x: 0.08, t: 0.04, b: 0.03 }, rndR: { z: 0.06, x: 0.05, t: 0.02, b: 0.02 },
  },
  arch: { dy: 0.01, top: 0.035, side: 0.06, p: 3.2 },
  gh: {
    z0: -1.35, z1: 2.05,
    roof: [[-1.35, 0.62], [-1.0, 0.78], [-0.6, 0.95], [-0.2, 1.1], [0.15, 1.16], [0.45, 1.165], [0.8, 1.13], [1.2, 1.05], [1.6, 0.98], [1.9, 0.94], [2.05, 0.9]],
    wb: [[-1.35, 0.82], [-0.4, 0.8], [0.3, 0.77], [1.0, 0.72], [2.05, 0.68]],
    wt: [[-1.35, 0.74], [-0.4, 0.64], [0.3, 0.58], [0.8, 0.53], [1.5, 0.5], [2.05, 0.48]],
    rc: 0.05, crown: 0.035, bulge: 0.008,
    ws: [-1.35, 0.05], rear: [0.62, 1.05], side: [[-1.05, 0.45]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { dir: '+y', poly: [[0.42, -2.24], [0.54, -2.25], [0.84, -2.02], [0.845, -1.95], [0.74, -2.0], [0.44, -2.2]], drl: [[0.46, -2.23], [0.81, -1.99], [0.815, -1.97], [0.46, -2.215]], hg: 0.01 });
    grille(ctx, { poly: [[-0.42, 0.2], [0.42, 0.2], [0.36, 0.3], [-0.36, 0.3]], tex: 'HONEY' });
    for (const s of [-1, 1]) grille(ctx, { poly: s > 0 ? [[0.44, 0.2], [0.66, 0.2], [0.66, 0.39], [0.58, 0.37], [0.46, 0.3]] : mirX([[0.44, 0.2], [0.66, 0.2], [0.66, 0.39], [0.58, 0.37], [0.46, 0.3]]), tex: 'HONEY' });
    patch(ctx, '-z', [[-0.64, 0.19], [0.64, 0.19], [0.64, 0.205], [-0.64, 0.205]], FIN.black, { off: 0.006, depth: 0.015 });
    badge(ctx, '-z', 0, 0.36, 0.028);
    // rear: mesh band, thin lamps, diffuser, centre exhausts
    patch(ctx, '+z', [[-0.78, 0.4], [-0.12, 0.4], [-0.12, 0.62], [-0.2, 0.68], [-0.8, 0.68]], tx(FIN.grille, 'HONEY'), { off: 0.005 });
    patch(ctx, '+z', mirX([[-0.78, 0.4], [-0.12, 0.4], [-0.12, 0.62], [-0.2, 0.68], [-0.8, 0.68]]), tx(FIN.grille, 'HONEY'), { off: 0.005 });
    patch(ctx, '+z', [[-0.1, 0.4], [0.1, 0.4], [0.1, 0.6], [-0.1, 0.6]], FIN.black, { off: 0.005 });
    taillamps(ctx, { poly: [[0.22, 0.72], [0.84, 0.735], [0.87, 0.78], [0.24, 0.755]], tex: 'TAIL', housing: FIN.blackGloss, rev: [[0.55, 0.43], [0.72, 0.43], [0.72, 0.455], [0.55, 0.455]] });
    for (let i = -3; i <= 3; i++) box(ctx, FIN.black, i * 0.16, 0.22, P.zR - 0.16, 0.012, 0.16, 0.36, -0.3, 0, 0);
    box(ctx, FIN.black, 0, 0.15, P.zR - 0.22, 1.4, 0.02, 0.44, -0.3, 0, 0);
    exhausts(ctx, [{ x: -0.1, y: 0.5, r: 0.045, dz: -0.005 }, { x: 0.1, y: 0.5, r: 0.045, dz: -0.005 }]);
    // engine cover louvres
    for (let i = 0; i < 2; i++) patch(ctx, '+y', [[-0.34, 1.18 + i * 0.3], [0.34, 1.18 + i * 0.3], [0.32, 1.36 + i * 0.3], [-0.32, 1.36 + i * 0.3]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    // side intakes
    bothSides(ctx, (dir) => {
      patch(ctx, dir, [[0.22, 0.6], [0.86, 0.4], [0.88, 0.74], [0.48, 0.73]], tx(FIN.grille, 'HONEY'), { off: 0.005 });
      patch(ctx, dir, [[0.22, 0.6], [0.86, 0.4], [0.86, 0.412], [0.24, 0.612]], FIN.graphite, { off: 0.008 });
      patch(ctx, dir, [[-1.0, 0.16], [0.8, 0.16], [0.8, 0.2], [-1.0, 0.22]], FIN.black, { off: 0.005 });
      seam(ctx, dir, [[-0.98, 0.22], [-1.0, 0.6], [-0.95, 0.72]]);
      seam(ctx, dir, [[0.32, 0.25], [0.28, 0.6], [0.5, 0.82]]);
    });
    seam(ctx, '+y', [[-0.7, -2.1], [0.7, -2.1]]);
    // wing
    // small integrated wing (optional-style lip on the tail)
    const wz = 2.08, wy = section(P, wz).yt + 0.035;
    tube(ctx, [[-0.8, wy - 0.01, wz], [0, wy, wz], [0.8, wy - 0.01, wz]], [[-0.1, -0.03], [0.05, -0.012], [0.1, 0.012], [0.06, 0.02], [-0.1, 0.0]], FIN.paint, { up: () => [0, 1, 0], crease: 30 });
    mirrors(ctx, { z: -0.8, y: 0.8, fin: FIN.paint, len: 0.2, h: 0.08, d: 0.11 });
    archTrims(ctx, { fin: FIN.paint, width: 0.04, out: 0.01, inner: 0.004 });
    handles(ctx, [[0.2, 0.75]], FIN.black, { flush: true });
    wipers(ctx, { list: [[-0.2, 0.62, 0.02]] });
    interior(ctx, { wheelY: 0.1, dash: 0.25 });
  },
});

// ---- SUV
DEFS.suv = () => ({
  name: 'Ridgeback XL', defaultPaint: 0x5d6168, seatX: 0.4, wheel: { style: 'multi6', fin: FIN.alu },
  wb: 2.87, ohF: 0.92, ohR: 1.11, R: 0.382, ww: 0.255, rimR: 0.229, tf: 1.63, tr: 1.63,
  body: {
    yb: [[-2.355, 0.48], [-2.1, 0.34], [-1.7, 0.29], [-1.0, 0.26], [1.0, 0.26], [1.8, 0.3], [2.3, 0.4], [2.545, 0.5]],
    yh: [[-2.355, 0.98], [-2.0, 1.05], [-1.2, 1.09], [-0.7, 1.12], [0.5, 1.15], [1.5, 1.17], [2.545, 1.16]],
    yt: [[-2.355, 0.99], [-2.05, 1.07], [-1.3, 1.12], [-0.8, 1.15], [0, 1.16], [2.545, 1.18]],
    w: [[-2.355, 0.86], [-2.15, 0.935], [-1.435, 0.97], [0, 0.965], [1.435, 0.97], [2.3, 0.95], [2.545, 0.92]],
    kw: 0.5, tuck: 0.05, tumble: 0.04, sr: 0.07, charY: [[-2.3, 0.9], [2.5, 0.96]], charD: 0.007,
    rndF: { z: 0.18, x: 0.1, t: 0.06, b: 0.06 }, rndR: { z: 0.1, x: 0.07, t: 0.04, b: 0.05 },
    levels: [0.44],
  },
  lowerMat: (q) => (q.tag === 'side' && q.y < 0.44 ? FIN.black : undefined),
  arch: { dy: 0.02, top: 0.07, side: 0.085, p: 2.7 },
  gh: {
    z0: -0.85, z1: 2.47,
    roof: [[-0.85, 1.12], [-0.55, 1.3], [-0.25, 1.5], [0.05, 1.7], [0.35, 1.765], [1.2, 1.78], [2.1, 1.765], [2.3, 1.73], [2.4, 1.6], [2.47, 1.13]],
    wb: [[-0.85, 0.88], [0, 0.9], [1.5, 0.9], [2.47, 0.86]],
    wt: [[-0.85, 0.8], [0, 0.76], [1.2, 0.76], [2.2, 0.75], [2.47, 0.7]],
    rc: 0.08, crown: 0.04, bulge: 0.01,
    ws: [-0.85, 0.1], rear: [2.3, 2.47], side: [[-0.68, 0.42], [0.52, 1.36], [1.44, 2.2]],
    pillarFin: FIN.blackGloss,
  },
  extraBounds: { maxY: 1.84, maxX: 1.0 },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: [[-0.5, 0.66], [0.5, 0.66], [0.56, 0.97], [-0.56, 0.97]], tex: 'SLATS', surround: FIN.chrome, sw: 0.02 });
    headlamps(ctx, { poly: [[0.58, 0.9], [0.88, 0.915], [0.92, 0.985], [0.6, 0.99]], drl: [[0.6, 0.905], [0.88, 0.92], [0.885, 0.93], [0.6, 0.915]] });
    patch(ctx, '-z', [[-0.86, 0.42], [0.86, 0.42], [0.84, 0.6], [-0.84, 0.6]], FIN.black, { off: 0.005, maxEdge: 0.25 });
    patch(ctx, '-z', [[-0.42, 0.44], [0.42, 0.44], [0.46, 0.55], [-0.46, 0.55]], FIN.silver, { off: 0.008, maxEdge: 0.25 });
    for (const s of [-1, 1]) patch(ctx, '-z', ell(s * 0.72, 0.52, 0.05, 0.035, 12), Lf(0xf4f4ff, LAMP.HEAD), { off: 0.009 });
    badge(ctx, '-z', 0, 0.82, 0.06);
    plate(ctx, 'F', { y: 0.63, idx: 0 });
    taillamps(ctx, { poly: [[0.62, 0.98], [0.94, 0.97], [0.95, 1.14], [0.66, 1.15]], rev: [[0.5, 1.0], [0.61, 1.0], [0.62, 1.07], [0.5, 1.07]] });
    patch(ctx, '+z', [[-0.86, 0.42], [0.86, 0.42], [0.84, 0.62], [-0.84, 0.62]], FIN.black, { off: 0.005, maxEdge: 0.25 });
    patch(ctx, '+z', [[-0.4, 0.44], [0.4, 0.44], [0.4, 0.52], [-0.4, 0.52]], FIN.silver, { off: 0.008, maxEdge: 0.25 });
    plate(ctx, 'R', { y: 0.8, idx: 0 });
    badge(ctx, '+z', 0, 0.98, 0.045);
    exhausts(ctx, [{ x: 0.55, y: 0.4, r: 0.04 }]);
    const G = P.gh;
    // tailgate spoiler + rear wiper
    const zs = 2.28, ys = G.roof(zs);
    tube(ctx, [[-0.7, ys - 0.01, zs], [0, ys - 0.002, zs], [0.7, ys - 0.01, zs]], [[-0.06, -0.012], [0.09, -0.02], [0.09, 0.006], [-0.06, 0.012]], FIN.paint, { up: () => [0, 1, 0] });
    chmsl(ctx, -0.18, 0.18, ys - 0.03);
    box(ctx, FIN.black, 0.05, 1.28, 2.47, 0.5, 0.012, 0.02, 0, 0, 0.35);
    // roof rails
    ctx.noBounds = false;
    for (const s of [-1, 1]) {
      const pts = [];
      for (let z = 0.25; z <= 2.1; z += 0.12) pts.push([s * 0.63, G.roof(z) + 0.045, z]);
      tube(ctx, pts, [[-0.012, -0.015], [0.012, -0.015], [0.012, 0.015], [-0.012, 0.015]], FIN.silver);
      for (const z of [0.3, 2.05]) box(ctx, FIN.black, s * 0.63, G.roof(z) + 0.022, z, 0.035, 0.05, 0.12);
    }
    archTrims(ctx, { fin: FIN.black, width: 0.075, out: 0.028, inner: 0.01 });
    mirrors(ctx, { z: -0.62, y: 1.24, fin: FIN.black, len: 0.23, h: 0.14, d: 0.1 });
    handles(ctx, [[0.05, 1.07], [1.05, 1.08]], FIN.chrome);
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.98, 0.46], [-0.99, 0.8], [-0.9, 1.12]]);
      seam(ctx, dir, [[0.475, 0.45], [0.475, 1.14]]);
      seam(ctx, dir, [[1.36, 0.45], [1.36, 0.72], [1.45, 0.94], [1.44, 1.16]]);
    });
    seam(ctx, '+z', [[-0.78, 1.14], [-0.8, 0.66], [0.8, 0.66], [0.78, 1.14]]);
    seam(ctx, '+y', [[-0.82, -2.18], [0.82, -2.18]]);
    beltTrim(ctx, FIN.chrome, -0.68, 2.2);
    wipers(ctx, { list: [[-0.46, 0.6, 0.06], [0.22, 0.56, 0.1]] });
    interior(ctx, { rearSeat: 1.0, seatX: 0.4 });
  },
});

// ---- pickup (crew cab, open bed)
DEFS.pickup = () => {
  const bed = { z0: 0.88, z1: 2.8 };
  const P = {
    name: 'Hauler 150 Crew', defaultPaint: 0x9c2a1f, seatX: 0.42, wheel: { style: 'multi6', fin: FIN.graphite },
    wb: 3.55, ohF: 0.93, ohR: 1.12, R: 0.419, ww: 0.275, rimR: 0.254, tf: 1.68, tr: 1.68,
    body: {
      yb: [[-2.705, 0.55], [-2.4, 0.46], [-1.9, 0.44], [-1.0, 0.43], [0.6, 0.44], [0.95, 0.6], [2.6, 0.62], [2.895, 0.66]],
      yh: [[-2.705, 1.2], [-2.3, 1.27], [-1.5, 1.3], [-0.9, 1.33], [0.5, 1.35], [2.895, 1.35]],
      yt: [[-2.705, 1.21], [-2.35, 1.29], [-1.5, 1.32], [-0.9, 1.345], [0.5, 1.35], [2.895, 1.36]],
      w: [[-2.705, 0.92], [-2.5, 0.99], [-1.775, 1.015], [0, 1.015], [2.6, 1.015], [2.895, 0.99]],
      kw: 0.55, tuck: 0.04, tumble: 0.02, sr: 0.06, charY: 1.08, charD: 0.009,
      rndF: { z: 0.14, x: 0.1, t: 0.05, b: 0.06 }, rndR: { z: 0.05, x: 0.03, t: 0.015, b: 0.02 },
      bedY: (z) => (z > bed.z0 && z < bed.z1 ? 0.97 : null),
    },
    bed,
    arch: { dy: 0.03, top: 0.075, side: 0.09, p: 2.8 },
    gh: {
      z0: -1.0, z1: 0.84,
      roof: [[-1.0, 1.3], [-0.75, 1.5], [-0.45, 1.74], [-0.2, 1.9], [0.05, 1.93], [0.7, 1.925], [0.78, 1.88], [0.84, 1.3]],
      wb: [[-1.0, 0.92], [0, 0.93], [0.84, 0.93]],
      wt: [[-1.0, 0.86], [0, 0.83], [0.84, 0.83]],
      rc: 0.07, crown: 0.03,
      ws: [-1.0, -0.08], rear: [0.74, 0.84], side: [[-0.84, -0.02], [0.07, 0.66]],
      pillarFin: FIN.blackGloss,
    },
    extraBounds: { maxY: 1.93, maxX: 1.07, maxZ: 2.95, minZ: -2.76, minY: 0.4 },
    features: (ctx) => {
      const P = ctx.P;
      grille(ctx, { poly: [[-0.62, 0.72], [0.62, 0.72], [0.66, 1.17], [-0.66, 1.17]], tex: 'SLATS', surround: FIN.chrome, sw: 0.035 });
      for (const y of [0.87, 1.02]) patch(ctx, '-z', [[-0.64, y], [0.64, y], [0.64, y + 0.03], [-0.64, y + 0.03]], FIN.chrome, { off: 0.011 });
      headlamps(ctx, { poly: [[0.7, 0.98], [0.94, 0.99], [0.95, 1.17], [0.72, 1.17]], drl: [[0.7, 0.99], [0.72, 0.99], [0.72, 1.16], [0.7, 1.16]] });
      badge(ctx, '-z', 0, 0.95, 0.07);
      bumperBar(ctx, 0.62, P.zF + 0.35, 'F', [[-0.04, -0.12], [0.05, -0.1], [0.06, 0.08], [-0.04, 0.1]], FIN.silver, 0.02);
      patch(ctx, '-z', [[-0.5, 0.46], [0.5, 0.46], [0.5, 0.5], [-0.5, 0.5]], FIN.black, { off: 0.005 });
      plate(ctx, 'F', { y: 0.63, idx: 3 });
      // bed rails, tailgate
      for (const s of [-1, 1]) {
        const pts = []; for (let z = bed.z0 - 0.02; z <= bed.z1 + 0.02; z += 0.2) pts.push([s * 0.965, section(P, z).topY(0.965) + 0.008, z]);
        tube(ctx, pts, [[-0.045, -0.01], [0.045, -0.01], [0.045, 0.012], [-0.045, 0.012]], FIN.black);
      }
      taillamps(ctx, { poly: [[0.83, 0.92], [0.955, 0.92], [0.955, 1.3], [0.83, 1.3]], housing: FIN.chrome, hg: 0.01, rev: [[0.83, 0.86], [0.955, 0.86], [0.955, 0.915], [0.83, 0.915]] });
      patch(ctx, '+z', rrect(-0.15, 1.12, 0.15, 1.18, 0.02), FIN.black, { off: 0.006 });
      badge(ctx, '+z', 0, 1.0, 0.06);
      seam(ctx, '+z', [[-0.86, 0.66], [0.86, 0.66]]);
      bumperBar(ctx, 0.56, P.zR - 0.3, 'R', [[-0.04, -0.08], [0.06, -0.07], [0.06, 0.08], [-0.04, 0.08]], FIN.silver, 0.03);
      plate(ctx, 'R', { y: 0.57, idx: 3 });
      exhausts(ctx, [{ x: 0.7, y: 0.4, r: 0.045, dz: -0.28, len: 0.4 }]);
      // frame + running boards
      for (const s of [-1, 1]) box(ctx, FIN.under, s * 0.5, 0.48, 1.9, 0.08, 0.16, 2.0);
      for (const s of [-1, 1]) box(ctx, FIN.black, s * 0.98, 0.42, -0.15, 0.16, 0.035, 2.0);
      archTrims(ctx, { fin: FIN.black, width: 0.06, out: 0.02 });
      mirrors(ctx, { z: -0.8, y: 1.43, fin: FIN.black, len: 0.26, h: 0.2, d: 0.1 });
      handles(ctx, [[-0.25, 1.24], [0.55, 1.24]], FIN.chrome);
      bothSides(ctx, (dir) => {
        seam(ctx, dir, [[-1.2, 0.47], [-1.22, 0.9], [-1.1, 1.33]]);
        seam(ctx, dir, [[0.02, 0.46], [0.02, 1.33]]);
        seam(ctx, dir, [[0.8, 0.46], [0.8, 1.33]]);
      });
      seam(ctx, '+y', [[-0.9, -2.45], [0.9, -2.45]]);
      beltTrim(ctx, FIN.chrome, -0.84, 0.66);
      wipers(ctx, { list: [[-0.48, 0.66, 0.05], [0.22, 0.62, 0.08]] });
      interior(ctx, { rearSeat: 0.55, seatX: 0.42 });
    },
  };
  return P;
};

// ---- van (high-roof panel van)
DEFS.van = () => ({
  name: 'Cargomaster HD', defaultPaint: 0xf2f2f0, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.black },
  wb: 3.66, ohF: 0.98, ohR: 1.16, R: 0.356, ww: 0.235, rimR: 0.203, tf: 1.72, tr: 1.72,
  body: {
    yb: [[-2.81, 0.5], [-2.5, 0.4], [-2.0, 0.35], [-1.0, 0.34], [1.83, 0.36], [2.5, 0.4], [2.99, 0.48]],
    yh: [[-2.81, 0.95], [-2.45, 1.08], [-2.0, 1.15], [-1.78, 1.24], [-1.35, 1.8], [-1.05, 2.32], [-0.8, 2.48], [-0.5, 2.5], [2.99, 2.5]],
    yt: [[-2.81, 0.97], [-2.45, 1.12], [-2.0, 1.19], [-1.78, 1.28], [-1.35, 1.86], [-1.05, 2.4], [-0.8, 2.56], [-0.5, 2.58], [2.99, 2.58]],
    w: [[-2.81, 0.86], [-2.55, 0.95], [-2.0, 0.99], [-1.83, 1.0], [-0.8, 1.01], [2.8, 1.01], [2.99, 0.99]],
    kw: 0.3, tuck: 0.03, tumble: 0.07, sr: 0.12,
    rndF: { z: 0.14, x: 0.1, t: 0.04, b: 0.06 }, rndR: { z: 0.05, x: 0.04, t: 0.04, b: 0.03 },
    levels: [0.52, 1.2, 2.05], lodLevels: [1.2], levelsOnly: true, spacing: 0.22, archN: 8,
  },
  breaks: [-1.8, -1.02, -1.62, -0.8], lodBreaks: true,
  lowerMat: (q, lod) => {
    const z = q.z, t = q.tag;
    if ((t === 'top' || t === 'topIn' || t === 'bedWall') && z > -1.8 && z < -1.02) return lod ? FIN.glassProxy : FIN.glass;
    if (t === 'corner' && z > -1.8 && z < -1.02) return FIN.black;
    if (t === 'side' && q.y > 1.2 && q.y < 2.05 && z > -1.62 && z < -0.8) return lod ? FIN.glassProxy : FIN.glass;
    if (t === 'side' && q.y < 0.52) return FIN.black;
    return undefined;
  },
  arch: { dy: 0.02, top: 0.07, side: 0.075, p: 2.5 },
  seat: [-0.5, 1.86, -0.97],
  extraBounds: { maxZ: 3.15, maxX: 1.03 },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: [[-0.5, 0.64], [0.5, 0.64], [0.54, 0.92], [-0.54, 0.92]], tex: 'SLATS', surround: FIN.silver, sw: 0.02 });
    headlamps(ctx, { poly: [[0.56, 0.8], [0.9, 0.82], [0.93, 0.98], [0.6, 0.97]] });
    patch(ctx, '-z', [[-0.94, 0.4], [0.94, 0.4], [0.94, 0.62], [-0.94, 0.62]], FIN.black, { off: 0.005 });
    for (const s of [-1, 1]) patch(ctx, '-z', ell(s * 0.72, 0.5, 0.045, 0.03, 12), Lf(0xf4f4ff, LAMP.HEAD), { off: 0.009 });
    badge(ctx, '-z', 0, 0.78, 0.06);
    plate(ctx, 'F', { y: 0.5, idx: 1 });
    // rear barn doors with windows
    const zr = P.zR;
    for (const s of [-1, 1]) {
      const rw = s > 0 ? [[0.08, 1.4], [0.8, 1.4], [0.8, 2.05], [0.08, 2.05]] : mirX([[0.08, 1.4], [0.8, 1.4], [0.8, 2.05], [0.08, 2.05]]);
      patch(ctx, '+z', grow(rw, 0.02), FIN.black, { off: 0.004 });
      patch(ctx, '+z', rw, FIN.interior, { off: 0.006 });
      patch(ctx, '+z', rw, FIN.glass, { off: 0.009 });
      patch(ctx, '+z', s > 0 ? [[0.87, 0.6], [0.965, 0.6], [0.965, 1.25], [0.87, 1.25]] : mirX([[0.87, 0.6], [0.965, 0.6], [0.965, 1.25], [0.87, 1.25]]), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? [[0.87, 0.53], [0.965, 0.53], [0.965, 0.6], [0.87, 0.6]] : mirX([[0.87, 0.53], [0.965, 0.53], [0.965, 0.6], [0.87, 0.6]]), Lf(0xf4f6ff, LAMP.REV), { off: 0.008 });
    }
    seam(ctx, '+z', [[0, 0.5], [0, 2.35]]);
    seam(ctx, '+z', [[-0.86, 0.52], [-0.86, 2.36], [0.86, 2.36], [0.86, 0.52]]);
    patch(ctx, '+z', rrect(0.06, 1.1, 0.2, 1.14, 0.01), FIN.black, { off: 0.008 });
    patch(ctx, '+z', [[-1.0, 0.38], [1.0, 0.38], [1.0, 0.5], [-1.0, 0.5]], FIN.black, { off: 0.005 });
    chmsl(ctx, -0.2, 0.2, 2.44);
    plate(ctx, 'R', { y: 0.72, idx: 1 });
    box(ctx, FIN.black, 0, 0.36, zr + 0.06, 1.2, 0.08, 0.16);
    exhausts(ctx, [{ x: -0.55, y: 0.34, r: 0.035, dz: -0.1 }]);
    // sliding door (right side) + rail, cab doors
    seam(ctx, '+x', [[-0.55, 0.42], [-0.55, 2.2], [0.75, 2.2], [0.75, 0.42]]);
    seam(ctx, '+x', [[0.75, 1.95], [2.9, 1.95]], { w: 0.012 });
    patch(ctx, '+x', rrect(-0.45, 1.05, -0.29, 1.09, 0.01), FIN.black, { off: 0.008 });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-1.7, 0.42], [-1.72, 1.25], [-1.8, 1.3]]);
      seam(ctx, dir, [[-0.72, 0.42], [-0.72, 2.2]]);
      patch(ctx, dir, [[-1.64, 1.18], [-0.8, 1.18], [-0.8, 1.21], [-1.64, 1.21]], FIN.black, { off: 0.006 });
    });
    handles(ctx, [[-0.9, 1.1]], FIN.black);
    archTrims(ctx, { fin: FIN.black, width: 0.05, out: 0.015 });
    mirrors(ctx, { z: -1.5, y: 1.45, fin: FIN.black, len: 0.26, h: 0.26, d: 0.1 });
    // wipers + cab interior (the loft is hollow: add an inward facing cab box)
    for (const [x, len] of [[-0.4, 0.62], [0.28, 0.58]]) box(ctx, FIN.black, x, 1.32, -1.73, len, 0.015, 0.02, -0.9, 0, 0.05);
    ctx.noBounds = true;
    innerShell(ctx, -1.95, -0.7, 0.03, 0.95);
    box(ctx, FIN.dash, 0, 1.23, -1.66, 1.86, 0.2, 0.3);
    for (const x of [-0.45, 0.45]) { box(ctx, FIN.seat, x, 1.55, -0.9, 0.5, 0.72, 0.13, 0.15, 0, 0); box(ctx, FIN.seat, x, 1.99, -0.85, 0.26, 0.15, 0.1, 0.15, 0, 0); }
    addGeo(ctx, TOR(), FIN.dash, M(-0.45, 1.45, -1.4, -0.95, 0, 0, 0.2, 0.2, 0.2));
    ctx.noBounds = false;
  },
});

// ---- cutaway box truck (delivery / moving truck): van cab + a tall box (paint2) with the "attic" over the cab
DEFS.boxtruck = () => ({
  name: 'Metro Hauler 16', defaultPaint: 0xf0f0ee, defaultPaint2: 0xf4f4f2, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.black },
  wb: 4.2, ohF: 0.98, ohR: 2.05, R: 0.37, ww: 0.235, rimR: 0.203, tf: 1.74, tr: 1.74,
  body: {
    yb: [[-3.08, 0.52], [-2.75, 0.42], [-2.3, 0.38], [-1.2, 0.38], [-0.95, 0.6], [4.15, 0.62], [4.2, 0.66]],
    yh: [[-3.08, 0.97], [-2.72, 1.1], [-2.27, 1.17], [-2.05, 1.26], [-1.62, 1.8], [-1.3, 2.2], [-1.0, 2.26], [-0.97, 2.27], [-0.93, 3.28], [4.2, 3.28]],
    yt: [[-3.08, 0.99], [-2.72, 1.14], [-2.27, 1.21], [-2.05, 1.3], [-1.62, 1.86], [-1.3, 2.26], [-1.0, 2.32], [-0.97, 2.33], [-0.93, 3.35], [4.2, 3.35]],
    w: [[-3.08, 0.86], [-2.82, 0.95], [-2.27, 0.99], [-2.1, 1.0], [-0.97, 1.01], [-0.93, 1.18], [4.2, 1.18]],
    kw: 0.3, tuck: 0.02, tumble: 0.05, sr: 0.08,
    rndF: { z: 0.14, x: 0.1, t: 0.04, b: 0.06 }, rndR: { z: 0.03, x: 0.03, t: 0.03, b: 0.02 },
    levels: [0.55, 1.2, 2.05], lodLevels: [1.2], levelsOnly: true, spacing: 0.24, archN: 8,
  },
  breaks: [-2.07, -1.29, -1.89, -1.07, -0.95], lodBreaks: true,
  lowerMat: (q, lod) => {
    const z = q.z, t = q.tag;
    if (z > -0.95) return t === 'side' && q.y < 0.64 ? FIN.black : FIN.paint2;
    if ((t === 'top' || t === 'topIn' || t === 'bedWall') && z > -2.07 && z < -1.29) return lod ? FIN.glassProxy : FIN.glass;
    if (t === 'corner' && z > -2.07 && z < -1.29) return FIN.black;
    if (t === 'side' && q.y > 1.2 && q.y < 2.05 && z > -1.89 && z < -1.07) return lod ? FIN.glassProxy : FIN.glass;
    if (t === 'side' && q.y < 0.55) return FIN.black;
    return undefined;
  },
  arch: { dy: 0.02, top: 0.07, side: 0.075, p: 2.5 },
  seat: [-0.5, 1.86, -1.24],
  extraBounds: { maxZ: 4.3, maxX: 1.2, maxY: 3.4, minZ: -3.12 },
  features: (ctx) => {
    const P = ctx.P, zr = P.zR;
    grille(ctx, { poly: [[-0.5, 0.64], [0.5, 0.64], [0.54, 0.92], [-0.54, 0.92]], tex: 'SLATS', surround: FIN.silver, sw: 0.02 });
    headlamps(ctx, { poly: [[0.56, 0.8], [0.9, 0.82], [0.93, 0.98], [0.6, 0.97]] });
    patch(ctx, '-z', [[-0.94, 0.4], [0.94, 0.4], [0.94, 0.62], [-0.94, 0.62]], FIN.black, { off: 0.005 });
    for (const s of [-1, 1]) patch(ctx, '-z', ell(s * 0.72, 0.5, 0.045, 0.03, 12), Lf(0xf4f4ff, LAMP.HEAD), { off: 0.009 });
    badge(ctx, '-z', 0, 0.78, 0.06);
    plate(ctx, 'F', { y: 0.5, idx: 3 });
    // attic over the cab (box overhang), marker lamps along its front edge
    ctx.noBounds = false;
    rbox(ctx, FIN.paint2, 0, 2.86, -1.42, 2.34, 0.96, 1.06, 0.05);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) box(ctx, Lf(0xffa21a, LAMP.ALWAYS), x, 3.25, -1.957, 0.07, 0.035, 0.012);
    // rear: roll-up door (slat seams), rails, lamps, step bumper, plate
    patch(ctx, '+z', [[-1.08, 0.66], [1.08, 0.66], [1.08, 3.2], [-1.08, 3.2]], FIN.grey, { off: 0.004, maxEdge: 0.4 });
    patch(ctx, '+z', [[-1.0, 0.7], [1.0, 0.7], [1.0, 3.1], [-1.0, 3.1]], FIN.white, { off: 0.007, maxEdge: 0.4 });
    for (let y = 0.95; y < 3.1; y += 0.27) patch(ctx, '+z', [[-1.0, y - 0.006], [1.0, y - 0.006], [1.0, y + 0.006], [-1.0, y + 0.006]], FIN.grey, { off: 0.009 });
    patch(ctx, '+z', rrect(-0.12, 0.76, 0.12, 0.84, 0.02), FIN.chrome, { off: 0.011 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', rrect(s * 1.12 - 0.05, 0.7, s * 1.12 + 0.05, 1.0, 0.02), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008 });
      patch(ctx, '+z', rrect(s * 1.12 - 0.05, 1.02, s * 1.12 + 0.05, 1.12, 0.02), Lf(0xff9a1a, LAMP.NONE), { off: 0.008 });
      patch(ctx, '+z', ell(s * 0.5, 3.24, 0.03, 0.02, 10), Lf(0xc8000a, LAMP.TAIL), { off: 0.008 });
    }
    chmsl(ctx, -0.25, 0.25, 3.26);
    box(ctx, FIN.black, 0, 0.5, zr + 0.12, 2.1, 0.12, 0.3);
    box(ctx, FIN.steel, 0, 0.58, zr + 0.2, 1.6, 0.03, 0.18);
    plate(ctx, 'R', { y: 0.46, idx: 3 });
    exhausts(ctx, [{ x: -0.7, y: 0.4, r: 0.04, dz: -0.1 }]);
    // box: corner posts, rub rails, side marker lamps; underride frame
    for (const s of [-1, 1]) {
      for (const z of [-0.93, zr - 0.02]) box(ctx, FIN.silver, s * 1.19, 1.97, z, 0.035, 2.72, 0.05);
      box(ctx, FIN.silver, s * 1.19, 0.66, (zr - 0.93) / 2, 0.04, 0.06, zr + 0.93);
      box(ctx, FIN.silver, s * 1.19, 3.33, (zr - 0.93) / 2, 0.04, 0.05, zr + 0.93);
      for (const z of [-0.6, 1.6, zr - 0.2]) patch(ctx, s > 0 ? '+x' : '-x', ell(z, 0.82, 0.035, 0.02, 10), Lf(z > 3 ? 0xc8000a : 0xffa21a, LAMP.ALWAYS), { off: 0.03 });
    }
    ctx.noBounds = true;
    for (const s of [-1, 1]) box(ctx, FIN.under, s * 0.45, 0.5, 1.5, 0.12, 0.16, 5.2);
    ctx.noBounds = false;
    // cab: doors, handles, mirrors, wipers, arch trims
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-1.97, 0.42], [-1.99, 1.25], [-2.07, 1.3]]);
      seam(ctx, dir, [[-0.99, 0.42], [-0.99, 2.2]]);
    });
    handles(ctx, [[-1.17, 1.1]], FIN.black);
    archTrims(ctx, { fin: FIN.black, width: 0.05, out: 0.015 });
    mirrors(ctx, { z: -1.77, y: 1.45, fin: FIN.black, len: 0.28, h: 0.3, d: 0.1 });
    for (const [x, len] of [[-0.4, 0.62], [0.28, 0.58]]) box(ctx, FIN.black, x, 1.32, -2.0, len, 0.015, 0.02, -0.9, 0, 0.05);
    ctx.noBounds = true;
    innerShell(ctx, -2.22, -0.97, 0.03, 0.95);
    box(ctx, FIN.dash, 0, 1.23, -1.93, 1.86, 0.2, 0.3);
    for (const x of [-0.45, 0.45]) { box(ctx, FIN.seat, x, 1.55, -1.17, 0.5, 0.72, 0.13, 0.15, 0, 0); box(ctx, FIN.seat, x, 1.99, -1.12, 0.26, 0.15, 0.1, 0.15, 0, 0); }
    addGeo(ctx, TOR(), FIN.dash, M(-0.45, 1.45, -1.67, -0.95, 0, 0, 0.2, 0.2, 0.2));
    ctx.noBounds = false;
  },
});

// ---- city bus
DEFS.bus = () => ({
  name: 'Metro Transit 40', defaultPaint: 0xc7cbd0, defaultPaint2: 0xb3202a, wheel: { style: 'bus', fin: FIN.alu },
  wb: 6.1, ohF: 2.55, ohR: 3.35, R: 0.5, ww: 0.3, rimR: 0.286, tf: 2.1, tr: 2.05,
  body: {
    yb: [[-5.6, 0.42], [-5.3, 0.32], [-4.5, 0.3], [5.5, 0.3], [6.2, 0.36], [6.4, 0.45]],
    yh: [[-5.6, 2.82], [6.4, 2.82]],
    yt: [[-5.6, 2.95], [-5.2, 3.0], [6.0, 3.0], [6.4, 2.95]],
    w: [[-5.6, 1.2], [-5.45, 1.255], [-5.2, 1.275], [6.2, 1.275], [6.4, 1.24]],
    kw: 0.3, tuck: 0.02, tumble: 0.02, sr: 0.18, spacing: 0.6, archN: 6, lodSpacing: 1.5,
    rndF: { z: 0.14, x: 0.12, t: 0.1, b: 0.06 }, rndR: { z: 0.12, x: 0.1, t: 0.08, b: 0.06 },
    levels: [0.95, 1.15, 1.25, 2.55], lodLevels: [1.25, 2.55], levelsOnly: true,
  },
  breaks: [-5.3, -4.25, 0.15, 0.2, 1.4, -3.75, -3.65, -2.65, -2.55, -1.55, -1.45, -0.35, -0.25, 1.45, 2.55, 2.65, 3.75, 3.85, 4.95],
  lowerMat: (q, lod) => {
    const z = q.z, y = q.y, t = q.tag, right = q.side > 0;
    if (t !== 'side') return undefined;
    const door = right && ((z > -5.3 && z < -4.25) || (z > 0.2 && z < 1.4));
    if (door && y > 0.34 && y < 2.55) return lod ? FIN.glassProxy : FIN.glass;
    if (y > 1.25 && y < 2.55) {
      const win = [[-5.3, -3.75], [-3.65, -2.65], [-2.55, -1.55], [-1.45, -0.35], [-0.25, 0.15], [0.2, 1.4], [1.45, 2.55], [2.65, 3.75], [3.85, 4.95]];
      if (inAny(z, win) && !(right && z > 0.15 && z < 0.2)) return lod ? FIN.glassProxy : FIN.glass;
      return FIN.blackGloss;
    }
    if (y > 0.95 && y < 1.15) return FIN.paint2;
    return undefined;
  },
  arch: { dy: 0.03, top: 0.08, side: 0.1, p: 2.2 },
  seat: [-0.75, 2.1, -4.72],
  extraBounds: { maxY: 3.25, minZ: -5.75 },
  features: (ctx) => {
    const P = ctx.P;
    // windshield (dark backing + glass), destination sign
    patch(ctx, '-z', rrect(-1.2, 0.98, 1.2, 2.7, 0.08), FIN.black, { off: 0.004, maxEdge: 0.3 });
    patch(ctx, '-z', rrect(-1.14, 1.02, 1.14, 2.64, 0.06), FIN.interior, { off: 0.007, maxEdge: 0.3 });
    patch(ctx, '-z', rrect(-1.14, 1.02, 1.14, 2.64, 0.06), FIN.glass, { off: 0.011, maxEdge: 0.3 });
    patch(ctx, '-z', [[-0.015, 1.02], [0.015, 1.02], [0.015, 2.64], [-0.015, 2.64]], FIN.black, { off: 0.013 });
    patch(ctx, '-z', [[-1.05, 2.71], [1.05, 2.71], [1.05, 2.93], [-1.05, 2.93]], FIN.black, { off: 0.005 });
    patch(ctx, '-z', [[-0.98, 2.73], [0.98, 2.73], [0.98, 2.91], [-0.98, 2.91]], Lf(0xffb13a, LAMP.ALWAYS, 'BUSDEST'), { off: 0.008 });
    headlamps(ctx, { poly: [[0.78, 0.55], [1.12, 0.55], [1.14, 0.72], [0.8, 0.72]], hg: 0.02 });
    patch(ctx, '-z', [[-1.26, 0.32], [1.26, 0.32], [1.26, 0.52], [-1.26, 0.52]], FIN.black, { off: 0.005 });
    plate(ctx, 'F', { y: 0.42, idx: 2 });
    // bike rack (folded)
    const zf = P.zF - 0.05;
    ctx.noBounds = false;
    for (const s of [-1, 1]) cylAB(ctx, FIN.black, [s * 0.5, 0.45, zf - 0.02], [s * 0.5, 0.95, zf - 0.08], 0.02, 6);
    cylAB(ctx, FIN.black, [-0.55, 0.95, zf - 0.08], [0.55, 0.95, zf - 0.08], 0.02, 6);
    cylAB(ctx, FIN.black, [-0.55, 0.7, zf - 0.05], [0.55, 0.7, zf - 0.05], 0.016, 6);
    // rear: engine grille, rear window, lamps, route number
    patch(ctx, '+z', rrect(-0.95, 0.5, 0.95, 1.15, 0.05), tx(FIN.grille, 'LOUVER'), { off: 0.006 });
    patch(ctx, '+z', rrect(-1.0, 1.85, 1.0, 2.6, 0.06), FIN.interior, { off: 0.006, maxEdge: 0.3 });
    patch(ctx, '+z', rrect(-1.0, 1.85, 1.0, 2.6, 0.06), FIN.glass, { off: 0.01, maxEdge: 0.3 });
    patch(ctx, '+z', [[-0.35, 2.65], [0.35, 2.65], [0.35, 2.85], [-0.35, 2.85]], Lf(0xffb13a, LAMP.ALWAYS, 'ROUTE'), { off: 0.008 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', ell(s * 1.1, 1.05, 0.08, 0.08, 16), Lf(0xc8000a, LAMP.TAIL), { off: 0.008 });
      patch(ctx, '+z', ell(s * 1.1, 0.85, 0.07, 0.07, 16), Lf(0xff9a1a, LAMP.NONE), { off: 0.008 });
      patch(ctx, '+z', ell(s * 1.1, 0.67, 0.06, 0.06, 16), Lf(0xf4f6ff, LAMP.REV), { off: 0.008 });
      patch(ctx, '+z', ell(s * 1.1, 1.25, 0.06, 0.06, 16), Lf(0xc8000a, LAMP.BRAKE), { off: 0.008 });
    }
    patch(ctx, '+z', [[-1.26, 0.35], [1.26, 0.35], [1.26, 0.48], [-1.26, 0.48]], FIN.black, { off: 0.005 });
    plate(ctx, 'R', { y: 1.35, idx: 2 });
    exhausts(ctx, [{ x: -0.9, y: 0.36, r: 0.05, dz: -0.02 }]);
    // doors: frames on the right side
    for (const [z0, z1] of [[-5.3, -4.25], [0.2, 1.4]]) {
      seam(ctx, '+x', [[z0, 0.36], [z0, 2.56], [z1, 2.56], [z1, 0.36]], { w: 0.03, fin: FIN.black });
      seam(ctx, '+x', [[(z0 + z1) / 2, 0.36], [(z0 + z1) / 2, 2.56]], { w: 0.03, fin: FIN.black });
    }
    // roof pods
    box(ctx, FIN.grey, 0, 3.08, 1.0, 1.8, 0.16, 2.6);
    box(ctx, FIN.grey, 0, 3.06, 5.3, 1.6, 0.12, 1.4);
    // big bus mirrors
    ctx.noBounds = true;
    for (const s of [-1, 1]) {
      cylAB(ctx, FIN.black, [s * 1.2, 2.6, -5.45], [s * 1.38, 2.55, -5.75], 0.02, 6);
      rbox(ctx, FIN.black, s * 1.4, 2.3, -5.78, 0.08, 0.42, 0.18, 0.03);
    }
    ctx.noBounds = false;
    // interior: inward box + seats, driver
    ctx.noBounds = true;
    innerShell(ctx, -5.45, 6.25, 0.04, 1.1);
    for (let z = -3.3; z < 5.2; z += 0.85) for (const x of [-0.64, 0.64]) {
      if (z > 0.1 && z < 1.5 && x > 0) continue;
      box(ctx, FIN.seat, x, 1.3, z + 0.2, 0.84, 0.62, 0.1, 0.12, 0, 0);
    }
    box(ctx, FIN.seat, -0.75, 1.4, -4.6, 0.5, 0.7, 0.12);
    addGeo(ctx, TOR(), FIN.dash, M(-0.75, 1.55, -5.1, -1.1, 0, 0, 0.24, 0.24, 0.24));
    box(ctx, FIN.dash, 0, 1.0, -5.35, 2.3, 0.5, 0.25);
    ctx.noBounds = false;
    archTrims(ctx, { fin: FIN.black, width: 0.05, out: 0.012 });
  },
});

// ---- EV
DEFS.ev = () => ({
  name: 'Volta S', defaultPaint: 0xeceef0, wheel: { style: 'aero', fin: FIN.silver },
  wb: 2.875, ohF: 0.84, ohR: 1.0, R: 0.335, ww: 0.235, rimR: 0.2413, tf: 1.58, tr: 1.58,
  body: {
    yb: [[-2.2775, 0.3], [-2.0, 0.22], [-1.6, 0.18], [0, 0.155], [1.6, 0.18], [2.1, 0.25], [2.4375, 0.36]],
    yh: [[-2.2775, 0.62], [-2.0, 0.7], [-1.5, 0.765], [-0.9, 0.83], [0, 0.9], [1.2, 0.95], [2.0, 0.97], [2.4375, 0.95]],
    yt: [[-2.2775, 0.62], [-2.05, 0.71], [-1.5, 0.785], [-0.9, 0.845], [0, 0.91], [1.8, 0.98], [2.3, 0.99], [2.4375, 0.97]],
    w: [[-2.2775, 0.76], [-2.05, 0.86], [-1.6, 0.91], [-1.4375, 0.922], [0, 0.925], [1.4375, 0.925], [2.1, 0.9], [2.4375, 0.85]],
    kw: 0.45, tuck: 0.07, tumble: 0.05, sr: 0.1, crease: 50,
    rndF: { z: 0.24, x: 0.16, t: 0.08, b: 0.06 }, rndR: { z: 0.14, x: 0.1, t: 0.04, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.065, p: 2.1 },
  gh: {
    z0: -1.05, z1: 2.2,
    roof: [[-1.05, 0.82], [-0.75, 0.98], [-0.4, 1.18], [-0.05, 1.36], [0.3, 1.43], [0.7, 1.44], [1.1, 1.4], [1.5, 1.28], [1.85, 1.12], [2.1, 1.0], [2.2, 0.96]],
    wb: [[-1.05, 0.8], [0, 0.83], [1.2, 0.83], [2.2, 0.76]],
    wt: [[-1.05, 0.72], [-0.2, 0.66], [0.7, 0.65], [1.5, 0.62], [2.2, 0.56]],
    rc: 0.07, crown: 0.04,
    ws: [-1.05, 0.02], roofGlass: [0.06, 1.4], rear: [1.4, 2.06], side: [[-0.86, 0.36], [0.44, 1.5]], bars: [[0.02, 0.06]],
    pillarFin: FIN.blackGloss, aFin: FIN.blackGloss, railFin: FIN.blackGloss, roofFin: FIN.blackGloss,
    mat: (q) => (q.tag === 'roof' && q.z > 2.06 ? FIN.paint : undefined),
  },
  features: (ctx) => {
    headlamps(ctx, { poly: [[0.46, 0.6], [0.78, 0.615], [0.86, 0.645], [0.82, 0.672], [0.5, 0.66]], hg: 0.008 });
    patch(ctx, '-z', [[-0.8, 0.657], [0.8, 0.657], [0.8, 0.667], [-0.8, 0.667]], Lf(0xffffff, LAMP.DRL), { off: 0.008 });
    grille(ctx, { poly: [[-0.46, 0.3], [0.46, 0.3], [0.5, 0.37], [-0.5, 0.37]], tex: 'HONEY' });
    badge(ctx, '-z', 0, 0.58, 0.03);
    plate(ctx, 'F', { y: 0.43, idx: 0 });
    patch(ctx, '+z', [[-0.88, 0.855], [0.88, 0.855], [0.86, 0.9], [-0.86, 0.9]], FIN.blackGloss, { off: 0.004 });
    patch(ctx, '+z', [[-0.86, 0.863], [0.86, 0.863], [0.845, 0.892], [-0.845, 0.892]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.008 });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.6 - 0.07, 0.4, s * 0.6 + 0.07, 0.43, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    plate(ctx, 'R', { y: 0.66, idx: 0 });
    badge(ctx, '+z', 0, 0.8, 0.03);
    grille(ctx, { poly: [[-0.6, 0.37], [0.6, 0.37], [0.62, 0.42], [-0.62, 0.42]], dir: '+z', fin: FIN.black });
    mirrors(ctx, { z: -0.76, y: 0.96, fin: FIN.paint, len: 0.18, h: 0.1 });
    handles(ctx, [[0.0, 0.88], [0.95, 0.9]], FIN.blackGloss, { flush: true, flushFin: FIN.darkChrome });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-1.02, 0.24], [-1.03, 0.62], [-0.98, 0.86]]);
      seam(ctx, dir, [[0.4, 0.23], [0.4, 0.92]]);
      seam(ctx, dir, [[1.05, 0.24], [1.04, 0.5], [1.14, 0.68], [1.3, 0.84], [1.34, 0.95]]);
    });
    seam(ctx, '+y', [[-0.7, -2.12], [0.7, -2.12]]);
    wipers(ctx, { list: [[-0.42, 0.56, 0.05], [0.2, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 1.0, dash: 0.3 });
  },
});

// ---- rally hatch
DEFS.rally = () => ({
  name: 'Kiwi R27 Rally', defaultPaint: 0x1464c8, defaultPaint2: 0xf5f5f5, wheel: { style: 'rally6', fin: FIN.white },
  wb: 2.51, ohF: 0.9, ohR: 0.69, R: 0.33, ww: 0.235, rimR: 0.229, tf: 1.62, tr: 1.62,
  body: {
    yb: [[-2.155, 0.28], [-1.9, 0.22], [-1.5, 0.19], [0, 0.17], [1.5, 0.19], [1.945, 0.3]],
    yh: [[-2.155, 0.68], [-1.9, 0.77], [-1.3, 0.83], [-0.8, 0.88], [0.3, 0.91], [1.3, 0.93], [1.945, 0.92]],
    yt: [[-2.155, 0.69], [-1.95, 0.78], [-1.3, 0.855], [-0.85, 0.905], [-0.3, 0.92], [1.945, 0.95]],
    w: [[-2.155, 0.78], [-1.95, 0.88], [-1.6, 0.925], [-1.255, 0.94], [-0.85, 0.915], [-0.2, 0.892], [0.6, 0.9], [1.255, 0.942], [1.7, 0.92], [1.945, 0.87]],
    kw: 0.42, tuck: 0.06, tumble: 0.04, sr: 0.06, charY: [[-2.1, 0.64], [0, 0.76], [1.9, 0.82]], charD: 0.007,
    rndF: { z: 0.15, x: 0.1, t: 0.05, b: 0.04 }, rndR: { z: 0.08, x: 0.06, t: 0.03, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.065, side: 0.08, p: 2.3 },
  gh: {
    z0: -0.95, z1: 1.9,
    roof: [[-0.95, 0.87], [-0.65, 1.04], [-0.35, 1.21], [-0.08, 1.38], [0.25, 1.42], [1.0, 1.42], [1.4, 1.4], [1.56, 1.34], [1.7, 1.17], [1.82, 1.0], [1.9, 0.9]],
    wb: [[-0.95, 0.78], [0, 0.8], [1.4, 0.8], [1.9, 0.75]],
    wt: [[-0.95, 0.71], [0, 0.66], [1.3, 0.645], [1.9, 0.6]],
    rc: 0.07, crown: 0.035,
    ws: [-0.95, -0.05], rear: [1.55, 1.9], side: [[-0.76, 0.3], [0.4, 1.1]],
    pillarFin: FIN.black,
  },
  extraBounds: { maxY: 1.5, maxX: 0.965, minZ: -2.21, minY: 0.04 },
  features: (ctx) => {
    const P = ctx.P, G = P.gh;
    headlamps(ctx, { poly: [[0.4, 0.675], [0.76, 0.695], [0.83, 0.735], [0.8, 0.775], [0.42, 0.755]] });
    grille(ctx, { poly: [[-0.38, 0.6], [0.38, 0.6], [0.4, 0.7], [-0.4, 0.7]], tex: 'HONEY' });
    grille(ctx, { poly: [[-0.62, 0.3], [0.62, 0.3], [0.66, 0.52], [-0.66, 0.52]], tex: 'HONEY' });
    patch(ctx, '-z', [[-0.9, 0.24], [0.9, 0.24], [0.9, 0.29], [-0.9, 0.29]], FIN.black, { off: 0.005, depth: 0.02 });
    for (const s of [-1, 1]) box(ctx, FIN.red, s * 0.45, 0.33, P.zF - 0.02, 0.05, 0.03, 0.12);
    // light pod on the bonnet
    const pz = -1.95, py = section(P, pz).yt;
    rbox(ctx, FIN.black, 0, py + 0.07, pz, 1.0, 0.13, 0.08, 0.03);
    for (const x of [-0.36, -0.12, 0.12, 0.36]) {
      cylAB(ctx, FIN.black, [x, py + 0.075, pz - 0.03], [x, py + 0.075, pz - 0.075], 0.062, 14);
      addGeo(ctx, CYL(14), Lf(0xffffff, LAMP.HEAD, 'HEADR'), M(x, py + 0.075, pz - 0.078, Math.PI / 2, 0, 0, 0.055, 0.004, 0.055));
    }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.24, py + 0.075, pz - 0.08), new THREE.Vector3(0.24, py + 0.075, pz - 0.08));
    plate(ctx, 'F', { y: 0.4, idx: 1 });
    taillamps(ctx, { poly: [[0.5, 0.815], [0.86, 0.815], [0.87, 0.905], [0.54, 0.915]] });
    patch(ctx, '+z', [[-0.92, 0.3], [0.92, 0.3], [0.9, 0.46], [-0.9, 0.46]], FIN.black, { off: 0.005 });
    plate(ctx, 'R', { y: 0.6, idx: 1 });
    exhausts(ctx, [{ x: 0.35, y: 0.3, r: 0.05, len: 0.4 }]);
    // livery: twin stripes over the car, door swoosh, roundels, sponsor, windshield banner
    for (const s of [-1, 1]) {
      const st = s > 0 ? [[0.1, P.zF + 0.05], [0.24, P.zF + 0.05], [0.24, P.zR - 0.05], [0.1, P.zR - 0.05]] : mirX([[0.1, P.zF + 0.05], [0.24, P.zF + 0.05], [0.24, P.zR - 0.05], [0.1, P.zR - 0.05]]);
      patch(ctx, '+y', st.map(([x, z]) => [x, z]).filter(() => true), FIN.paint2, { off: 0.005, maxEdge: 0.08 });
    }
    bothSides(ctx, (dir) => {
      patch(ctx, dir, [[-1.6, 0.3], [-0.6, 0.3], [0.9, 0.74], [0.9, 0.84], [-0.4, 0.5], [-1.6, 0.44]], FIN.paint2, { off: 0.005 });
      patch(ctx, dir, ell(-0.25, 0.64, 0.17, 0.17, 24), tx(FIN.decal, 'ROUNDEL'), { off: 0.009 });
      patch(ctx, dir, [[0.48, 1.0], [1.04, 1.0], [1.04, 1.09], [0.48, 1.09]], tx(FIN.decal, 'SPONSOR'), { off: 0.004 });
      seam(ctx, dir, [[-0.95, 0.25], [-0.97, 0.62], [-0.92, 0.87]]);
      seam(ctx, dir, [[0.35, 0.24], [0.35, 0.9]]);
    });
    patch(ctx, '-z', [[-0.62, 1.3], [0.62, 1.3], [0.6, 1.37], [-0.6, 1.37]], tx(FIN.decal, 'BANNER'), { off: 0.006 });
    // roof scoop
    const rz = 0.1, ry = G.roof(rz);
    rbox(ctx, FIN.paint, 0, ry + 0.03, rz + 0.05, 0.36, 0.08, 0.3, 0.03);
    box(ctx, FIN.black, 0, ry + 0.035, rz - 0.1, 0.3, 0.055, 0.01);
    // rear wing
    const wz = 1.62, wy = G.roof(1.5) + 0.015, wyB = G.roof(wz);
    tube(ctx, [[-0.7, wy, wz], [0, wy + 0.008, wz], [0.7, wy, wz]], [[-0.13, 0], [0.09, 0.022], [0.13, 0.012], [0.09, -0.01]], FIN.paint2, { up: () => [0, 1, 0], crease: 30 });
    for (const s of [-1, 1]) { box(ctx, FIN.black, s * 0.705, wy - 0.02, wz + 0.02, 0.01, 0.1, 0.26); box(ctx, FIN.black, s * 0.35, (wy + wyB) / 2, wz, 0.02, wy - wyB, 0.07); }
    // mud flaps
    for (const A of P.arches) for (const s of [-1, 1]) box(ctx, FIN.red, s * 0.8, 0.17, A.z + A.ra + 0.02, 0.22, 0.26, 0.008);
    archTrims(ctx, { fin: FIN.black, width: 0.06, out: 0.022 });
    mirrors(ctx, { z: -0.74, y: 0.97, fin: FIN.paint2, len: 0.18 });
    chmsl(ctx, -0.15, 0.15, 1.3);
    wipers(ctx, { list: [[-0.4, 0.5, 0.05]] });
    interior(ctx, { rearSeat: null });
    // roll cage hint
    ctx.noBounds = true;
    for (const s of [-1, 1]) cylAB(ctx, FIN.white, [s * 0.62, 1.0, 0.45], [s * 0.55, 1.34, 0.45], 0.02, 6);
    cylAB(ctx, FIN.white, [-0.55, 1.34, 0.45], [0.55, 1.34, 0.45], 0.02, 6);
    ctx.noBounds = false;
  },
});

// ================================================================== roster bodies (garage v2)
// Shared helpers for the roster cars below: door cut lines from the side-window layout, chrome blade bumpers,
// round lamps with chrome bezels, vertical/horizontal lamp bars.
function doorSeams(ctx, z0, zB, zR, yTop, o = {}) {
  bothSides(ctx, (dir) => {
    seam(ctx, dir, [[z0, o.yb ?? 0.27], [z0 - 0.02, (o.yb ?? 0.27) + (yTop - (o.yb ?? 0.27)) * 0.55], [z0 + 0.06, yTop]]);
    if (zB != null) seam(ctx, dir, [[zB, o.yb ?? 0.27], [zB, yTop + 0.02]]);
    if (zR != null) seam(ctx, dir, [[zR, o.yb ?? 0.27], [zR, (o.yb ?? 0.27) + (yTop - (o.yb ?? 0.27)) * 0.5], [zR + (o.rearKick ?? 0.1), yTop]]);
  });
}
function roundLamp(ctx, dir, x, y, r, col, lamp, tex, o = {}) {
  patch(ctx, dir, ell(x, y, r * 1.2, r * 1.2, 24), o.bezel || FIN.chrome, { off: o.off ?? 0.008, depth: o.depth ?? 0.01, holes: [ell(x, y, r, r, 24)] });
  const res = patch(ctx, dir, ell(x, y, r, r, 24), Lf(col, lamp, tex), { off: (o.off ?? 0.008) + 0.002 });
  if (res && lamp === LAMP.HEAD) ctx.head.push(new THREE.Vector3(res.c[0], res.c[1], res.c[2] - 0.02));
  return res;
}
const bladeProf = [[-0.01, -0.04], [0.03, -0.036], [0.045, 0.0], [0.03, 0.032], [-0.01, 0.036]];
const softBumper = [[-0.03, -0.06], [0.03, -0.055], [0.05, 0.0], [0.03, 0.05], [-0.03, 0.055]];
function vBars(ctx, xs, y0, y1, w, fin, off = 0.009) { for (const s of [-1, 1]) for (const x of xs) patch(ctx, '+z', rrect(s * x - w / 2, y0, s * x + w / 2, y1, Math.min(w, y1 - y0) * 0.3), fin, { off }); }

// ---- '68 Brawler 440 (Charger homage): long flat hood, hidden-headlamp full-width grille, flying-buttress roof
DEFS.brawler = () => ({
  name: 'Hargrove Brawler 440', defaultPaint: 0x101012, wheel: { style: 'steel', fin: FIN.black, cap: FIN.chrome },
  wb: 2.97, ohF: 1.02, ohR: 1.29, R: 0.33, ww: 0.21, wwR: 0.23, rimR: 0.19, tf: 1.52, tr: 1.5,
  body: {
    yb: [[-2.505, 0.34], [-2.3, 0.25], [-1.9, 0.19], [-1.0, 0.165], [1.2, 0.165], [2.0, 0.21], [2.5, 0.3], [2.775, 0.37]],
    yh: [[-2.505, 0.79], [-2.3, 0.835], [-1.5, 0.865], [-0.6, 0.885], [0.5, 0.9], [1.5, 0.925], [2.4, 0.94], [2.775, 0.925]],
    yt: [[-2.505, 0.785], [-2.35, 0.845], [-1.6, 0.885], [-0.6, 0.915], [0.5, 0.93], [1.8, 0.955], [2.5, 0.962], [2.775, 0.95]],
    w: [[-2.505, 0.86], [-2.35, 0.93], [-1.485, 0.95], [-0.6, 0.94], [0.3, 0.942], [1.1, 0.962], [1.485, 0.975], [2.2, 0.965], [2.6, 0.94], [2.775, 0.9]],
    kw: 0.56, tuck: 0.09, tumble: 0.05, sr: 0.05, crease: 34, charY: [[-2.45, 0.72], [0.2, 0.735], [2.7, 0.78]], charD: 0.008,
    rndF: { z: 0.08, x: 0.05, t: 0.02, b: 0.05 }, rndR: { z: 0.08, x: 0.05, t: 0.015, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.075, side: 0.085, p: 2.0 },
  gh: {
    z0: -0.62, z1: 1.86,
    roof: [[-0.62, 0.9], [-0.35, 1.03], [-0.1, 1.18], [0.15, 1.3], [0.4, 1.345], [0.8, 1.35], [1.05, 1.325], [1.3, 1.24], [1.55, 1.12], [1.75, 1.01], [1.86, 0.97]],
    wb: [[-0.62, 0.8], [0, 0.83], [1.0, 0.85], [1.86, 0.84]],
    wt: [[-0.62, 0.72], [0, 0.68], [0.8, 0.66], [1.2, 0.66], [1.86, 0.72]],
    rc: 0.06, crown: 0.03,
    ws: [-0.62, 0.15], rear: [1.08, 1.34], side: [[-0.42, 0.42], [0.47, 1.0]],
    pillarFin: FIN.paint,
    // tunnel back: glass only between the sail panels
    mat: (q) => (q.tag === 'roof' && q.z > 1.08 && q.z < 1.34 ? (Math.abs(q.x) < 0.42 ? FIN.glass : FIN.paint) : undefined),
  },
  seatDZ: 1.1,
  features: (ctx) => {
    const P = ctx.P;
    // full-width recessed grille, headlamps hidden behind it (split in the middle)
    patch(ctx, '-z', rrect(-0.88, 0.47, 0.88, 0.76, 0.03), FIN.chrome, { off: 0.004, depth: 0.012 });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? rrect(0.035, 0.49, 0.86, 0.74, 0.02) : rrect(-0.86, 0.49, -0.035, 0.74, 0.02), tx(FIN.grille, 'EGG'), { off: 0.018 });
    patch(ctx, '-z', rrect(-0.03, 0.49, 0.03, 0.74, 0.01), FIN.chrome, { off: 0.02 });
    for (const s of [-1, 1]) ctx.head.push(new THREE.Vector3(s * 0.6, 0.62, P.zF - 0.02));
    badge(ctx, '-z', 0, 0.615, 0.045);
    bumperBar(ctx, 0.41, P.zF + 0.45, 'F', bladeProf, FIN.chrome, 0.02);
    for (const s of [-1, 1]) patch(ctx, '-z', rrect(s * 0.62 - 0.08, 0.28, s * 0.62 + 0.08, 0.33, 0.015), Lf(0xffb040, LAMP.NONE), { off: 0.008 });
    plate(ctx, 'F', { y: 0.31, idx: 2 });
    // tail: recessed black panel, quad round lamps
    patch(ctx, '+z', rrect(-0.84, 0.6, 0.84, 0.86, 0.03), FIN.blackGloss, { off: 0.005 });
    for (const s of [-1, 1]) for (const x of [0.45, 0.68]) roundLamp(ctx, '+z', s * x, 0.73, 0.07, 0xc8000a, LAMP.TAIL);
    patch(ctx, '+z', rrect(-0.2, 0.7, 0.2, 0.76, 0.01), tx(FIN.decalChrome, 'CHROMEBAR'), { off: 0.008 });
    bumperBar(ctx, 0.45, P.zR - 0.4, 'R', bladeProf, FIN.chrome, 0.02);
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.25 - 0.06, 0.33, s * 0.25 + 0.06, 0.37, 0.012), Lf(0xf6f6ff, LAMP.REV), { off: 0.008 });
    plate(ctx, 'R', { y: 0.34, idx: 2 });
    exhausts(ctx, [{ x: -0.55, y: 0.25, r: 0.035, len: 0.4 }, { x: 0.55, y: 0.25, r: 0.035, len: 0.4 }]);
    // hood: twin R/T style vent strakes, side scallops, round fuel cap
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.34 - 0.07, -1.55, s * 0.34 + 0.07, -1.15, 0.02), tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.35, 0.64], [0.45, 0.62], [0.5, 0.55]], { w: 0.01 });
      seam(ctx, dir, [[0.55, 0.64], [1.2, 0.66], [1.25, 0.58]], { w: 0.01 });
    });
    patch(ctx, '-x', ell(1.95, 0.8, 0.07, 0.07, 18), FIN.chrome, { off: 0.008, depth: 0.008 });
    doorSeams(ctx, -0.58, null, 0.46, 0.88, { yb: 0.24 });
    seam(ctx, '+y', [[-0.78, -2.3], [0.78, -2.3]]);
    seam(ctx, '+y', [[-0.74, 2.0], [0.74, 2.0]]);
    beltTrim(ctx, FIN.chrome, -0.42, 1.0, { h: 0.007 });
    mirrors(ctx, { z: -0.4, y: 0.94, fin: FIN.chrome, stalk: FIN.chrome, len: 0.12, h: 0.09, d: 0.09, driverOnly: true });
    archTrims(ctx, { fin: FIN.chrome, width: 0.02, out: 0.006, inner: 0.003 });
    handles(ctx, [[0.3, 0.84]], FIN.chrome);
    wipers(ctx, { list: [[-0.4, 0.5, 0.05], [0.18, 0.48, 0.08]] });
    interior(ctx, { rearSeat: 1.2, wheelY: 0.17 });
  },
});

// ---- '70 Vandal 454 (Chevelle homage): notchback coupe, twin round lamps in a wide grille, cowl-induction hood, stripes
DEFS.vandal = () => ({
  name: 'Cardinal Vandal 454', defaultPaint: 0xd8a51b, wheel: { style: 'torq5', fin: FIN.alu, lip: FIN.chrome },
  wb: 2.84, ohF: 0.94, ohR: 1.24, R: 0.33, ww: 0.215, wwR: 0.235, rimR: 0.19, tf: 1.52, tr: 1.52,
  body: {
    yb: [[-2.36, 0.33], [-2.1, 0.24], [-1.7, 0.19], [-1.0, 0.17], [1.2, 0.17], [1.9, 0.21], [2.4, 0.3], [2.66, 0.37]],
    yh: [[-2.36, 0.8], [-2.1, 0.84], [-1.4, 0.86], [-0.6, 0.87], [0.5, 0.88], [1.4, 0.9], [2.3, 0.91], [2.66, 0.9]],
    yt: [[-2.36, 0.8], [-2.15, 0.85], [-1.4, 0.88], [-0.6, 0.9], [0.3, 0.905], [1.6, 0.925], [2.4, 0.93], [2.66, 0.925]],
    w: [[-2.36, 0.9], [-2.2, 0.94], [-1.42, 0.95], [-0.5, 0.94], [0.5, 0.94], [1.42, 0.955], [2.3, 0.945], [2.66, 0.92]],
    kw: 0.6, tuck: 0.1, tumble: 0.035, sr: 0.035, crease: 30, charY: [[-2.3, 0.76], [2.6, 0.78]], charD: 0.01,
    rndF: { z: 0.06, x: 0.03, t: 0.01, b: 0.04 }, rndR: { z: 0.06, x: 0.03, t: 0.01, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.07, side: 0.08, p: 2.4 },
  gh: {
    z0: -0.55, z1: 1.52,
    roof: [[-0.55, 0.88], [-0.3, 1.0], [-0.05, 1.16], [0.2, 1.3], [0.45, 1.34], [0.85, 1.34], [1.05, 1.32], [1.2, 1.2], [1.35, 1.07], [1.52, 0.93]],
    wb: [[-0.55, 0.8], [0, 0.83], [1.0, 0.84], [1.52, 0.82]],
    wt: [[-0.55, 0.72], [0, 0.68], [0.8, 0.67], [1.2, 0.66], [1.52, 0.7]],
    rc: 0.05, crown: 0.025,
    ws: [-0.55, 0.22], rear: [1.08, 1.52], side: [[-0.35, 0.5], [0.55, 1.0]],
    pillarFin: FIN.paint, roofFin: FIN.black,
  },
  features: (ctx) => {
    const P = ctx.P;
    patch(ctx, '-z', rrect(-0.86, 0.5, 0.86, 0.76, 0.02), FIN.chrome, { off: 0.004, depth: 0.01 });
    patch(ctx, '-z', rrect(-0.84, 0.52, 0.84, 0.74, 0.015), tx(FIN.grille, 'VBARS'), { off: 0.016 });
    for (const s of [-1, 1]) { roundLamp(ctx, '-z', s * 0.72, 0.63, 0.078, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.018 }); roundLamp(ctx, '-z', s * 0.52, 0.63, 0.065, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.018 }); }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.62, 0.63, P.zF - 0.02), new THREE.Vector3(0.62, 0.63, P.zF - 0.02));
    patch(ctx, '-z', rrect(-0.2, 0.61, 0.2, 0.655, 0.01), FIN.chrome, { off: 0.02 });
    badge(ctx, '-z', 0, 0.635, 0.035);
    bumperBar(ctx, 0.44, P.zF + 0.4, 'F', bladeProf, FIN.chrome, 0.02);
    plate(ctx, 'F', { y: 0.33, idx: 0 });
    for (const s of [-1, 1]) patch(ctx, '-z', rrect(s * 0.42 - 0.07, 0.3, s * 0.42 + 0.07, 0.35, 0.012), Lf(0xffb040, LAMP.NONE), { off: 0.008 });
    // rear: lamps set into the chrome bumper, black tail panel
    patch(ctx, '+z', rrect(-0.8, 0.6, 0.8, 0.84, 0.02), FIN.blackGloss, { off: 0.005 });
    badge(ctx, '+z', 0, 0.72, 0.045);
    bumperBar(ctx, 0.48, P.zR - 0.35, 'R', [[-0.01, -0.07], [0.04, -0.065], [0.055, 0.0], [0.04, 0.06], [-0.01, 0.065]], FIN.chrome, 0.02);
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.62 - 0.14, 0.455, s * 0.62 + 0.14, 0.51, 0.02), Lf(0xc8000a, LAMP.TAIL), { off: 0.064 });
    plate(ctx, 'R', { y: 0.62, idx: 0 });
    exhausts(ctx, [{ x: -0.5, y: 0.25, r: 0.036, len: 0.4 }, { x: 0.5, y: 0.25, r: 0.036, len: 0.4 }]);
    // cowl-induction bulge (raised pad + flap) on the hood
    rbox(ctx, FIN.paint, 0, section(P, -1.2).yt + 0.02, -1.15, 0.62, 0.05, 1.1, 0.02);
    box(ctx, FIN.black, 0, section(P, -0.66).yt + 0.035, -0.62, 0.5, 0.035, 0.03);
    doorSeams(ctx, -0.52, null, 0.58, 0.87, { yb: 0.26 });
    seam(ctx, '+y', [[-0.8, -2.16], [0.8, -2.16]]);
    seam(ctx, '+y', [[-0.76, 1.62], [0.76, 1.62]]);
    beltTrim(ctx, FIN.chrome, -0.35, 1.0);
    mirrors(ctx, { z: -0.35, y: 0.93, fin: FIN.chrome, stalk: FIN.chrome, len: 0.12, h: 0.09, d: 0.09 });
    archTrims(ctx, { fin: FIN.chrome, width: 0.018, out: 0.005, inner: 0.003 });
    handles(ctx, [[0.45, 0.84]], FIN.chrome);
    wipers(ctx, { list: [[-0.4, 0.5, 0.05], [0.18, 0.48, 0.08]] });
    interior(ctx, { rearSeat: 1.05, wheelY: 0.17 });
  },
});

// ---- '18 Stallion GT (modern pony car): shark nose, trapezoid grille, tri-bar tail lamps, fastback
DEFS.stallion18 = () => ({
  name: 'Bayliss Stallion GT', defaultPaint: 0x1d57c2, wheel: { style: 'y5', fin: FIN.graphite },
  wb: 2.72, ohF: 0.9, ohR: 1.17, R: 0.34, ww: 0.255, wwR: 0.275, rimR: 0.241, tf: 1.58, tr: 1.62,
  body: {
    yb: [[-2.26, 0.3], [-2.05, 0.2], [-1.6, 0.155], [0, 0.14], [1.5, 0.15], [2.1, 0.23], [2.53, 0.34]],
    yh: [[-2.26, 0.69], [-2.05, 0.76], [-1.6, 0.8], [-0.8, 0.855], [0, 0.875], [1.0, 0.9], [1.8, 0.925], [2.53, 0.915]],
    yt: [[-2.26, 0.7], [-2.02, 0.8], [-1.5, 0.845], [-0.8, 0.895], [0, 0.91], [1.6, 0.935], [2.3, 0.95], [2.53, 0.935]],
    w: [[-2.26, 0.8], [-2.05, 0.9], [-1.36, 0.95], [-0.5, 0.935], [0.4, 0.94], [1.36, 0.965], [2.1, 0.95], [2.53, 0.88]],
    kw: 0.5, tuck: 0.08, tumble: 0.06, sr: 0.06, charY: [[-2.2, 0.66], [0, 0.7], [1.0, 0.74], [2.45, 0.8]], charD: 0.008,
    rndF: { z: 0.2, x: 0.12, t: 0.06, b: 0.05 }, rndR: { z: 0.1, x: 0.07, t: 0.02, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.07, p: 2.3 },
  gh: {
    z0: -0.72, z1: 2.2,
    roof: [[-0.72, 0.9], [-0.45, 1.06], [-0.15, 1.25], [0.15, 1.355], [0.45, 1.378], [0.8, 1.365], [1.2, 1.28], [1.6, 1.14], [1.95, 1.02], [2.2, 0.965]],
    wb: [[-0.72, 0.8], [0, 0.83], [1.0, 0.83], [2.2, 0.78]],
    wt: [[-0.72, 0.72], [0, 0.66], [0.8, 0.63], [1.6, 0.58], [2.2, 0.54]],
    rc: 0.07, crown: 0.035,
    ws: [-0.72, 0.18], rear: [1.25, 2.02], side: [[-0.5, 0.52], [0.58, 1.12]],
    pillarFin: (z) => (z < 0.55 ? FIN.blackGloss : FIN.paint),
  },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: [[-0.5, 0.4], [0.5, 0.4], [0.6, 0.64], [-0.6, 0.64]], tex: 'HONEY', surround: FIN.blackGloss, sw: 0.02 });
    badge(ctx, '-z', 0, 0.54, 0.05);
    headlamps(ctx, { poly: [[0.5, 0.665], [0.8, 0.68], [0.875, 0.705], [0.82, 0.735], [0.54, 0.72]], hg: 0.01,
      drl: [[0.56, 0.672], [0.8, 0.684], [0.805, 0.692], [0.56, 0.681]] });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) patch(ctx, '-z', s > 0 ? rrect(0.62 + i * 0.05, 0.43, 0.64 + i * 0.05, 0.5, 0.005) : rrect(-0.64 - i * 0.05, 0.43, -0.62 - i * 0.05, 0.5, 0.005), Lf(0xffffff, LAMP.DRL), { off: 0.008 });
    patch(ctx, '-z', [[-0.78, 0.24], [0.78, 0.24], [0.8, 0.3], [-0.8, 0.3]], FIN.black, { off: 0.005, depth: 0.02 });
    plate(ctx, 'F', { y: 0.35, idx: 1 });
    // tail: black panel, tri-bar vertical lamps, ducktail
    patch(ctx, '+z', rrect(-0.82, 0.66, 0.82, 0.86, 0.03), FIN.blackGloss, { off: 0.004 });
    vBars(ctx, [0.5, 0.6, 0.7], 0.69, 0.84, 0.065, Lf(0xd4000c, LAMP.TAIL), 0.009);
    badge(ctx, '+z', 0, 0.77, 0.05);
    grille(ctx, { poly: [[-0.7, 0.26], [0.7, 0.26], [0.72, 0.36], [-0.72, 0.36]], dir: '+z', fin: FIN.black, tex: 'HONEY' });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.3 - 0.07, 0.44, s * 0.3 + 0.07, 0.47, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    plate(ctx, 'R', { y: 0.55, idx: 1 });
    exhausts(ctx, [{ x: -0.6, y: 0.28, r: 0.042 }, { x: -0.48, y: 0.28, r: 0.042 }, { x: 0.48, y: 0.28, r: 0.042 }, { x: 0.6, y: 0.28, r: 0.042 }]);
    const zs = 2.36, ys = section(P, zs).yt;
    tube(ctx, [[-0.7, ys + 0.004, zs], [0, ys + 0.014, zs], [0.7, ys + 0.004, zs]], [[-0.1, -0.012], [0.07, 0.03], [0.1, 0.026], [0.05, -0.02]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    // hood vents + side gill
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.36 - 0.1, -1.55, s * 0.36 + 0.1, -1.25, 0.03), tx(FIN.grille, 'LOUVER'), { off: 0.006 });
    bothSides(ctx, (dir) => patch(ctx, dir, [[0.72, 0.5], [1.02, 0.52], [0.98, 0.6], [0.76, 0.58]], FIN.blackGloss, { off: 0.005 }));
    doorSeams(ctx, -0.66, null, 0.6, 0.86, { yb: 0.22 });
    seam(ctx, '+y', [[-0.72, -2.05], [0.72, -2.05]]);
    mirrors(ctx, { z: -0.5, y: 0.94, fin: FIN.paint, len: 0.2, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.38, 0.85]], FIN.blackGloss, { flush: true });
    wipers(ctx, { list: [[-0.42, 0.55, 0.05], [0.2, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 1.05, dash: 0.2 });
  },
});

// ---- '21 Hellion Widebody (modern retro muscle, bolted-on fender flares, big hood scoop, full-width tail light)
DEFS.hellion = () => ({
  name: 'Hargrove Hellion Widebody', defaultPaint: 0x7a1417, wheel: { style: 'multi6', fin: FIN.graphite },
  wb: 2.95, ohF: 0.98, ohR: 1.1, R: 0.35, ww: 0.28, wwR: 0.3, rimR: 0.254, tf: 1.66, tr: 1.66,
  body: {
    yb: [[-2.455, 0.3], [-2.2, 0.2], [-1.8, 0.16], [0, 0.15], [1.6, 0.16], [2.2, 0.24], [2.575, 0.36]],
    yh: [[-2.455, 0.82], [-2.2, 0.87], [-1.5, 0.89], [-0.6, 0.905], [0.4, 0.92], [1.5, 0.95], [2.3, 0.965], [2.575, 0.955]],
    yt: [[-2.455, 0.82], [-2.25, 0.88], [-1.5, 0.915], [-0.6, 0.93], [0.4, 0.94], [1.6, 0.97], [2.3, 0.98], [2.575, 0.97]],
    w: [[-2.455, 0.9], [-2.3, 0.97], [-1.8, 1.0], [-1.475, 1.02], [-1.0, 0.99], [0, 0.965], [1.0, 0.985], [1.475, 1.025], [2.0, 1.0], [2.575, 0.93]],
    kw: 0.55, tuck: 0.07, tumble: 0.05, sr: 0.05, crease: 32, charY: [[-2.4, 0.78], [0, 0.79], [2.5, 0.84]], charD: 0.008,
    rndF: { z: 0.08, x: 0.05, t: 0.02, b: 0.04 }, rndR: { z: 0.07, x: 0.04, t: 0.015, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.07, p: 2.8 },
  gh: {
    z0: -0.68, z1: 1.72,
    roof: [[-0.68, 0.94], [-0.4, 1.08], [-0.12, 1.26], [0.15, 1.38], [0.45, 1.41], [0.85, 1.41], [1.1, 1.38], [1.3, 1.28], [1.5, 1.14], [1.72, 1.0]],
    wb: [[-0.68, 0.82], [0, 0.84], [1.0, 0.85], [1.72, 0.83]],
    wt: [[-0.68, 0.74], [0, 0.69], [0.8, 0.68], [1.3, 0.66], [1.72, 0.68]],
    rc: 0.05, crown: 0.025,
    ws: [-0.68, 0.18], rear: [1.15, 1.72], side: [[-0.48, 0.55], [0.6, 1.1]],
    pillarFin: (z) => (z < 0.58 ? FIN.blackGloss : FIN.paint),
  },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: rrect(-0.86, 0.55, 0.86, 0.78, 0.02), tex: 'HONEY', surround: FIN.blackGloss, sw: 0.02 });
    for (const s of [-1, 1]) { roundLamp(ctx, '-z', s * 0.72, 0.665, 0.07, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.012, bezel: FIN.darkChrome }); roundLamp(ctx, '-z', s * 0.55, 0.665, 0.058, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.012, bezel: FIN.darkChrome }); }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.64, 0.665, P.zF - 0.02), new THREE.Vector3(0.64, 0.665, P.zF - 0.02));
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? ell(0.72, 0.665, 0.085, 0.085, 24) : ell(-0.72, 0.665, 0.085, 0.085, 24), Lf(0xffffff, LAMP.DRL), { off: 0.009, holes: [s > 0 ? ell(0.72, 0.665, 0.075, 0.075, 24) : ell(-0.72, 0.665, 0.075, 0.075, 24)] });
    patch(ctx, '-z', [[-0.84, 0.28], [0.84, 0.28], [0.86, 0.46], [-0.86, 0.46]], tx(FIN.grille, 'HONEY'), { off: 0.005 });
    patch(ctx, '-z', [[-0.9, 0.2], [0.9, 0.2], [0.92, 0.26], [-0.92, 0.26]], FIN.black, { off: 0.005, depth: 0.02 });
    badge(ctx, '-z', 0, 0.665, 0.04);
    plate(ctx, 'F', { y: 0.38, idx: 3 });
    // big hood scoop
    const zh = -1.35, yh = section(P, zh).yt;
    rbox(ctx, FIN.paint, 0, yh + 0.035, zh, 0.62, 0.09, 0.9, 0.035);
    box(ctx, FIN.black, 0, yh + 0.045, zh - 0.451, 0.5, 0.055, 0.008);
    // bolted flares
    archTrims(ctx, { fin: FIN.black, width: 0.075, out: 0.03, inner: 0.01 });
    // full-width 'racetrack' tail lamp ring
    patch(ctx, '+z', rrect(-0.86, 0.67, 0.86, 0.87, 0.04), FIN.blackGloss, { off: 0.004 });
    patch(ctx, '+z', rrect(-0.84, 0.69, 0.84, 0.85, 0.03), Lf(0xd4000c, LAMP.TAIL, 'TAILBAR'), { off: 0.007, holes: [rrect(-0.8, 0.72, 0.8, 0.82, 0.02)] });
    patch(ctx, '+z', rrect(-0.8, 0.72, 0.8, 0.82, 0.02), FIN.blackGloss, { off: 0.008 });
    badge(ctx, '+z', 0, 0.77, 0.04);
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.62 - 0.08, 0.735, s * 0.62 + 0.08, 0.76, 0.008), Lf(0xf4f6ff, LAMP.REV), { off: 0.009 });
    grille(ctx, { poly: [[-0.8, 0.26], [0.8, 0.26], [0.82, 0.4], [-0.82, 0.4]], dir: '+z', fin: FIN.black, tex: 'HONEY' });
    plate(ctx, 'R', { y: 0.55, idx: 3 });
    exhausts(ctx, [{ x: -0.62, y: 0.3, r: 0.05, oval: true }, { x: 0.62, y: 0.3, r: 0.05, oval: true }]);
    const zs = 2.46, ys = section(P, zs).yt;
    tube(ctx, [[-0.78, ys + 0.004, zs], [0, ys + 0.01, zs], [0.78, ys + 0.004, zs]], [[-0.08, -0.012], [0.06, 0.035], [0.09, 0.03], [0.04, -0.02]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    doorSeams(ctx, -0.64, null, 0.62, 0.9, { yb: 0.24 });
    seam(ctx, '+y', [[-0.8, -2.25], [0.8, -2.25]]);
    seam(ctx, '+y', [[-0.78, 1.82], [0.78, 1.82]]);
    patch(ctx, '+x', ell(2.0, 0.84, 0.065, 0.065, 18), FIN.darkChrome, { off: 0.007, depth: 0.006 });
    mirrors(ctx, { z: -0.46, y: 0.98, fin: FIN.paint, len: 0.2, h: 0.1 });
    handles(ctx, [[0.4, 0.86]], FIN.blackGloss, { flush: true });
    wipers(ctx, { list: [[-0.42, 0.55, 0.05], [0.2, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 1.05, dash: 0.2 });
  },
});

// ---- '57 Comet Fuelie (roadster homage): open cockpit, wraparound screen, coves, chrome-toothed grille
DEFS.comet = () => ({
  name: 'Cardinal Comet Fuelie', defaultPaint: 0xb3151c, defaultPaint2: 0xf2efe6, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.chrome },
  wb: 2.59, ohF: 0.84, ohR: 0.94, R: 0.33, ww: 0.19, rimR: 0.19, tf: 1.45, tr: 1.49,
  body: {
    yb: [[-2.135, 0.34], [-1.9, 0.24], [-1.5, 0.2], [0, 0.18], [1.4, 0.19], [1.9, 0.25], [2.235, 0.36]],
    yh: [[-2.135, 0.74], [-1.95, 0.79], [-1.5, 0.82], [-0.7, 0.84], [0, 0.82], [0.8, 0.82], [1.5, 0.86], [2.0, 0.85], [2.235, 0.8]],
    yt: [[-2.135, 0.74], [-1.95, 0.8], [-1.4, 0.84], [-0.7, 0.87], [-0.4, 0.88], [0.9, 0.84], [1.5, 0.87], [2.0, 0.87], [2.235, 0.82]],
    w: [[-2.135, 0.72], [-1.95, 0.82], [-1.3, 0.87], [-0.6, 0.86], [0.3, 0.855], [1.3, 0.89], [1.9, 0.86], [2.235, 0.78]],
    kw: 0.5, tuck: 0.1, tumble: 0.05, sr: 0.08, crease: 45,
    rndF: { z: 0.28, x: 0.18, t: 0.08, b: 0.06 }, rndR: { z: 0.24, x: 0.14, t: 0.06, b: 0.06 },
    // open cockpit: the top surface drops into the tub between the screen and the rear deck
    bedY: (z) => (z > -0.42 && z < 0.72 ? 0.4 : null),
  },
  bed: { z0: -0.42, z1: 0.72 },
  arch: { dy: 0.03, top: 0.06, side: 0.07, p: 2.0 },
  lowerMat: (q) => ((q.tag === 'topIn' || q.tag === 'bedWall') && q.z > -0.42 && q.z < 0.72 ? FIN.interior : undefined),
  seat: [-0.36, 0.95, 0.35],
  features: (ctx) => {
    const P = ctx.P;
    // coves in the contrast colour
    bothSides(ctx, (dir) => patch(ctx, dir, [[-0.95, 0.38], [-0.2, 0.4], [0.1, 0.46], [0.1, 0.72], [-0.3, 0.74], [-0.95, 0.72], [-1.08, 0.55]], FIN.paint2, { off: 0.005, refine: 2 }));
    // toothed chrome grille mouth + round lamps with brows
    patch(ctx, '-z', ell(0, 0.47, 0.44, 0.13, 32), FIN.chrome, { off: 0.004, depth: 0.012 });
    patch(ctx, '-z', ell(0, 0.47, 0.41, 0.105, 32), tx(FIN.grille, 'VBARS'), { off: 0.018 });
    for (const s of [-1, 1]) roundLamp(ctx, '-z', s * 0.6, 0.69, 0.075, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.01, depth: 0.03 });
    badge(ctx, '-z', 0, 0.72, 0.05);
    bumperBar(ctx, 0.36, P.zF + 0.3, 'F', bladeProf, FIN.chrome, 0.015);
    plate(ctx, 'F', { y: 0.47, idx: 2 });
    // windscreen frame + glass (wraparound)
    const zw = -0.38, yb = section(P, zw).yt;
    const fr = []; for (let i = 0; i <= 12; i++) { const t = i / 12, x = -0.72 + 1.44 * t; fr.push([x, yb + 0.3 - Math.pow(Math.abs(x) / 0.8, 3) * 0.08, zw + 0.12 + Math.pow(Math.abs(x) / 0.75, 2) * 0.14]); }
    tube(ctx, fr, [[-0.012, -0.012], [0.012, -0.012], [0.012, 0.012], [-0.012, 0.012]], FIN.chrome, { crease: 60 });
    for (const s of [-1, 1]) cylAB(ctx, FIN.chrome, [s * 0.72, yb - 0.02, zw + 0.28], [s * 0.72, yb + 0.22, zw + 0.26], 0.012, 8);
    const gl = new Soup();
    for (let i = 0; i < 12; i++) { const a = fr[i], b = fr[i + 1], a0 = [a[0], yb, a[2] - 0.04 + 0.02], b0 = [b[0], yb, b[2] - 0.02]; quadO(gl, a0, b0, b, a, [0, 0.3, -1], FIN.glass); }
    emitSoup(ctx, gl, 60);
    // rear: small tail fins with lamps, bumperettes
    for (const s of [-1, 1]) { roundLamp(ctx, '+z', s * 0.56, 0.6, 0.05, 0xc8000a, LAMP.TAIL); cylAB(ctx, FIN.chrome, [s * 0.55, 0.42, P.zR - 0.25], [s * 0.55, 0.42, P.zR + 0.05], 0.05, 12); }
    bumperBar(ctx, 0.38, P.zR - 0.25, 'R', bladeProf, FIN.chrome, 0.015);
    plate(ctx, 'R', { y: 0.58, idx: 2 });
    exhausts(ctx, [{ x: -0.35, y: 0.3, r: 0.035, dz: -0.06 }, { x: 0.35, y: 0.3, r: 0.035, dz: -0.06 }]);
    // cockpit: tub, seats, wheel, roll hoop-less
    ctx.noBounds = true;
    for (const x of [-0.36, 0.36]) { rbox(ctx, FIN.seat, x, 0.48, 0.36, 0.46, 0.13, 0.5, 0.04); rbox(ctx, FIN.seat, x, 0.7, 0.62, 0.44, 0.42, 0.11, 0.04, -0.22, 0, 0); }
    box(ctx, FIN.dash, 0, 0.78, -0.3, 1.5, 0.14, 0.24);
    addGeo(ctx, TOR(), FIN.wood, M(-0.36, 0.86, -0.06, -0.5, 0, 0, 0.19, 0.19, 0.19));
    box(ctx, FIN.interior, 0, 0.62, 0.0, 0.2, 0.2, 1.0);
    ctx.noBounds = false;
    doorSeams(ctx, -0.4, null, null, 0.8, { yb: 0.26 });
    seam(ctx, '+y', [[-0.64, -1.95], [0.64, -1.95]]);
    seam(ctx, '+y', [[-0.6, 0.9], [0.6, 0.9]]);
    mirrors(ctx, { z: -0.3, y: 0.86, fin: FIN.chrome, stalk: FIN.chrome, len: 0.1, h: 0.08, d: 0.08, driverOnly: true });
    archTrims(ctx, { fin: FIN.chrome, width: 0.018, out: 0.005, inner: 0.003 });
  },
});

// open-top windscreen: chrome/black frame + glass, rising from the cowl at zw (half width hw, height h, rake dz)
function openScreen(ctx, zw, hw, h, dz, fin = FIN.chrome, o = {}) {
  const P = ctx.P, yb = section(P, zw).yt - 0.01, n = 12, fr = [];
  for (let i = 0; i <= n; i++) { const x = -hw + 2 * hw * i / n, a = Math.abs(x) / hw; fr.push([x, yb + h - a * a * a * (o.drop ?? 0.06), zw + dz + a * a * (o.wrap ?? 0.12)]); }
  ctx.noBounds = true;
  tube(ctx, fr, [[-0.012, -0.012], [0.012, -0.012], [0.012, 0.012], [-0.012, 0.012]], fin, { crease: 60 });
  for (const s of [-1, 1]) cylAB(ctx, fin, [s * hw, yb - 0.02, zw + (o.wrap ?? 0.12)], [s * hw, yb + h, zw + dz + (o.wrap ?? 0.12)], 0.012, 8);
  const gl = new Soup();
  for (let i = 0; i < n; i++) { const a = fr[i], b = fr[i + 1]; const a0 = [a[0], yb, a[2] - dz], b0 = [b[0], yb, b[2] - dz]; quadO(gl, a0, b0, b, a, [0, 0.35, -1], FIN.glass); }
  emitSoup(ctx, gl, 60);
  ctx.noBounds = false;
}
// cockpit furniture for open cars (tub is the body's bed): seats, dash, wheel
function openCockpit(ctx, zSeat, yFloor, o = {}) {
  ctx.noBounds = true;
  const sx = o.seatX ?? 0.36;
  for (const x of [-sx, sx]) { rbox(ctx, FIN.seat, x, yFloor + 0.08, zSeat, 0.44, 0.12, 0.48, 0.04); rbox(ctx, FIN.seat, x, yFloor + 0.32, zSeat + 0.26, 0.42, o.back ?? 0.44, 0.11, 0.04, -0.24, 0, 0); }
  box(ctx, FIN.dash, 0, (o.dashY ?? yFloor + 0.38), zSeat - 0.72, (o.dashW ?? 1.36), 0.14, 0.26);
  addGeo(ctx, TOR(), o.wheelFin || FIN.dash, M(-sx, (o.dashY ?? yFloor + 0.38) + 0.06, zSeat - 0.44, -0.55, 0, 0, 0.18, 0.18, 0.18));
  box(ctx, FIN.interior, 0, yFloor + 0.1, zSeat - 0.1, 0.22, 0.18, 1.0);
  ctx.noBounds = false;
}
// flush pop-up headlamp covers (closed): outline seams on the nose top, plus low bumper lamps that carry the beams
function popups(ctx, z0, z1, x0, x1) {
  for (const s of [-1, 1]) seam(ctx, '+y', s > 0 ? [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]] : [[-x0, z0], [-x1, z0], [-x1, z1], [-x0, z1], [-x0, z0]], { w: 0.006 });
}

// ---- '93 Kaze RZ-7 Spirit (rotary coupe homage): curvy, pop-ups, fender peaks above the hood, double-bubble roof, hoop wing
DEFS.rz7 = () => ({
  name: 'Kaze RZ-7 Spirit', defaultPaint: 0xc21a1a, wheel: { style: 'split5', fin: FIN.alu },
  wb: 2.425, ohF: 0.86, ohR: 1.0, R: 0.315, ww: 0.225, rimR: 0.203, tf: 1.46, tr: 1.46,
  body: {
    yb: [[-2.0725, 0.26], [-1.85, 0.17], [-1.4, 0.14], [0, 0.13], [1.4, 0.14], [1.9, 0.2], [2.2125, 0.32]],
    yh: [[-2.0725, 0.56], [-1.85, 0.66], [-1.5, 0.76], [-1.21, 0.815], [-0.9, 0.8], [-0.4, 0.78], [0.3, 0.8], [1.0, 0.84], [1.5, 0.86], [1.9, 0.85], [2.2125, 0.8]],
    yt: [[-2.0725, 0.56], [-1.85, 0.635], [-1.4, 0.69], [-0.9, 0.74], [-0.5, 0.77], [0.5, 0.81], [1.6, 0.85], [2.0, 0.85], [2.2125, 0.82]],
    w: [[-2.0725, 0.66], [-1.9, 0.8], [-1.5, 0.86], [-1.21, 0.88], [-0.8, 0.86], [0, 0.85], [0.8, 0.865], [1.21, 0.885], [1.8, 0.87], [2.2125, 0.8]],
    kw: 0.45, tuck: 0.08, tumble: 0.07, sr: 0.1, crease: 50,
    rndF: { z: 0.3, x: 0.2, t: 0.06, b: 0.05 }, rndR: { z: 0.18, x: 0.12, t: 0.05, b: 0.05 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.065, p: 2.2 },
  gh: {
    z0: -0.75, z1: 2.0,
    roof: [[-0.75, 0.78], [-0.5, 0.92], [-0.2, 1.08], [0.1, 1.18], [0.4, 1.22], [0.7, 1.2], [1.0, 1.13], [1.35, 1.04], [1.7, 0.95], [2.0, 0.88]],
    wb: [[-0.75, 0.74], [0, 0.76], [1.0, 0.74], [2.0, 0.68]],
    wt: [[-0.75, 0.66], [0, 0.6], [0.7, 0.57], [1.4, 0.52], [2.0, 0.5]],
    rc: 0.08, crown: 0.05, bulge: 0.012,
    ws: [-0.75, 0.15], rear: [0.82, 1.92], side: [[-0.55, 0.62]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    popups(ctx, -1.78, -1.5, 0.42, 0.72);
    patch(ctx, '-z', ell(0, 0.34, 0.4, 0.1, 32), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.015, wallFin: FIN.black });
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? rrect(0.5, 0.36, 0.72, 0.43, 0.02) : rrect(-0.72, 0.36, -0.5, 0.43, 0.02), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
      patch(ctx, '-z', s > 0 ? rrect(0.5, 0.31, 0.72, 0.345, 0.012) : rrect(-0.72, 0.31, -0.5, 0.345, 0.012), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    badge(ctx, '-z', 0, 0.5, 0.03);
    plate(ctx, 'F', { y: 0.25, idx: 1 });
    // tail: smoked lens band with 3 round lamps a side, hoop wing
    patch(ctx, '+z', rrect(-0.82, 0.66, 0.82, 0.79, 0.04), FIN.blackGloss, { off: 0.004 });
    for (const s of [-1, 1]) for (const x of [0.5, 0.63, 0.76]) patch(ctx, '+z', ell(s * x, 0.725, 0.048, 0.048, 18), Lf(x === 0.5 ? 0xf4f6ff : 0xd4000c, x === 0.5 ? LAMP.REV : LAMP.TAIL), { off: 0.008 });
    badge(ctx, '+z', 0, 0.725, 0.035);
    plate(ctx, 'R', { y: 0.5, idx: 1 });
    exhausts(ctx, [{ x: 0.3, y: 0.26, r: 0.042 }, { x: 0.42, y: 0.26, r: 0.042 }]);
    const zw = 1.95, yw = section(P, zw).yt;
    tube(ctx, [[-0.66, yw + 0.1, zw], [0, yw + 0.115, zw], [0.66, yw + 0.1, zw]], [[-0.012, -0.08], [0.016, 0.04], [0.006, 0.08], [-0.014, 0.05]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) box(ctx, FIN.paint, s * 0.64, yw + 0.05, zw + 0.02, 0.03, 0.11, 0.1);
    bothSides(ctx, (dir) => patch(ctx, dir, [[-1.02, 0.4], [-0.9, 0.42], [-0.9, 0.5], [-1.02, 0.49]], FIN.blackGloss, { off: 0.005 }));
    doorSeams(ctx, -0.72, null, 0.66, 0.78, { yb: 0.22, rearKick: 0.12 });
    seam(ctx, '+y', [[-0.62, -1.3], [0.62, -1.3]]);
    mirrors(ctx, { z: -0.5, y: 0.84, fin: FIN.paint, len: 0.17, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.3, 0.76]], FIN.blackGloss, { flush: true });
    wipers(ctx, { list: [[-0.36, 0.5, 0.05], [0.16, 0.46, 0.08]] });
    interior(ctx, { rearSeat: null, wheelY: 0.12 });
  },
});

// ---- '98 Tenzan Kaminari RZ (twin-turbo I6 GT homage): long rounded nose, oval lamps, big mouth, hoop wing, round tails
DEFS.kaminari = () => ({
  name: 'Tenzan Kaminari RZ', defaultPaint: 0xe07a12, wheel: { style: 'split5', fin: FIN.silver },
  wb: 2.55, ohF: 1.0, ohR: 0.97, R: 0.325, ww: 0.235, wwR: 0.27, rimR: 0.216, tf: 1.52, tr: 1.52,
  body: {
    yb: [[-2.275, 0.25], [-2.05, 0.17], [-1.6, 0.14], [0, 0.13], [1.5, 0.14], [2.0, 0.2], [2.245, 0.32]],
    yh: [[-2.275, 0.6], [-2.05, 0.7], [-1.6, 0.775], [-1.28, 0.815], [-0.7, 0.8], [0.3, 0.82], [1.2, 0.87], [1.8, 0.88], [2.245, 0.84]],
    yt: [[-2.275, 0.6], [-2.0, 0.7], [-1.5, 0.76], [-0.9, 0.8], [-0.4, 0.82], [0.6, 0.84], [1.6, 0.88], [2.245, 0.86]],
    w: [[-2.275, 0.7], [-2.05, 0.84], [-1.6, 0.89], [-1.275, 0.905], [-0.6, 0.89], [0.3, 0.9], [1.275, 0.925], [1.9, 0.9], [2.245, 0.84]],
    kw: 0.45, tuck: 0.08, tumble: 0.06, sr: 0.09, crease: 50,
    rndF: { z: 0.3, x: 0.2, t: 0.07, b: 0.05 }, rndR: { z: 0.2, x: 0.13, t: 0.05, b: 0.05 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.065, p: 2.2 },
  gh: {
    z0: -0.8, z1: 2.0,
    roof: [[-0.8, 0.8], [-0.55, 0.94], [-0.25, 1.12], [0.05, 1.23], [0.35, 1.27], [0.7, 1.26], [1.0, 1.2], [1.4, 1.1], [1.75, 0.98], [2.0, 0.9]],
    wb: [[-0.8, 0.77], [0, 0.79], [1.0, 0.79], [2.0, 0.72]],
    wt: [[-0.8, 0.7], [0, 0.64], [0.7, 0.62], [1.4, 0.56], [2.0, 0.52]],
    rc: 0.09, crown: 0.04,
    ws: [-0.8, 0.1], rear: [1.0, 1.92], side: [[-0.6, 0.6], [0.66, 1.0]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.46, 0.56], [0.7, 0.575], [0.86, 0.61], [0.86, 0.645], [0.7, 0.65], [0.48, 0.615]], hg: 0.01, tex: null, housing: FIN.darkChrome, col: 0x2a2d31 });
    for (const s of [-1, 1]) for (const x of [0.54, 0.64, 0.76]) patch(ctx, '-z', ell(s * x, 0.606, 0.03, 0.028, 14), Lf(0xffffff, LAMP.HEAD, 'HEADR'), { off: 0.013 });
    patch(ctx, '-z', rrect(-0.56, 0.25, 0.56, 0.45, 0.06), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.015, wallFin: FIN.black });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? rrect(0.62, 0.3, 0.8, 0.4, 0.03) : rrect(-0.8, 0.3, -0.62, 0.4, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    badge(ctx, '-z', 0, 0.52, 0.035);
    plate(ctx, 'F', { y: 0.34, idx: 3 });
    // tail: round lamps in a body-colour bar, big hoop wing, single big exhaust
    for (const s of [-1, 1]) for (const x of [0.52, 0.73]) roundLamp(ctx, '+z', s * x, 0.73, 0.062, 0xd4000c, LAMP.TAIL, undefined, { bezel: FIN.darkChrome });
    patch(ctx, '+z', rrect(-0.35, 0.7, 0.35, 0.765, 0.02), FIN.blackGloss, { off: 0.006 });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.25 - 0.07, 0.715, s * 0.25 + 0.07, 0.75, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.008 });
    badge(ctx, '+z', 0, 0.735, 0.03);
    plate(ctx, 'R', { y: 0.5, idx: 3 });
    grille(ctx, { poly: [[-0.7, 0.24], [0.7, 0.24], [0.72, 0.32], [-0.72, 0.32]], dir: '+z', fin: FIN.black });
    exhausts(ctx, [{ x: 0.5, y: 0.27, r: 0.05, oval: true }]);
    const zw = 2.02, yw = section(P, zw).yt;
    tube(ctx, [[-0.78, yw + 0.17, zw], [0, yw + 0.19, zw], [0.78, yw + 0.17, zw]], [[-0.014, -0.1], [0.018, 0.05], [0.006, 0.1], [-0.016, 0.06]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) { box(ctx, FIN.paint, s * 0.77, yw + 0.09, zw + 0.02, 0.035, 0.18, 0.14); }
    chmsl(ctx, -0.12, 0.12, yw + 0.19, '+z');
    bothSides(ctx, (dir) => patch(ctx, dir, [[-0.98, 0.42], [-0.86, 0.44], [-0.86, 0.54], [-0.98, 0.52]], FIN.blackGloss, { off: 0.005 }));
    doorSeams(ctx, -0.76, null, 0.68, 0.82, { yb: 0.22 });
    seam(ctx, '+y', [[-0.66, -1.95], [0.66, -1.95]]);
    mirrors(ctx, { z: -0.56, y: 0.86, fin: FIN.paint, len: 0.18, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.34, 0.8]], FIN.paint);
    wipers(ctx, { list: [[-0.4, 0.52, 0.05], [0.18, 0.48, 0.08]] });
    interior(ctx, { rearSeat: 0.9, wheelY: 0.12 });
  },
});

// ---- '99 Himura Raiden GT-R (AWD twin-turbo coupe homage): boxy wedge, angry lamps, big intakes, twin round tails, tall wing
DEFS.raiden = () => ({
  name: 'Himura Raiden GT-R', defaultPaint: 0x2f4fa3, wheel: { style: 'mesh10', fin: FIN.gun },
  wb: 2.665, ohF: 0.96, ohR: 1.0, R: 0.33, ww: 0.245, rimR: 0.229, tf: 1.48, tr: 1.49,
  body: {
    yb: [[-2.2925, 0.26], [-2.05, 0.16], [-1.6, 0.14], [0, 0.13], [1.6, 0.14], [2.05, 0.2], [2.3325, 0.32]],
    yh: [[-2.2925, 0.67], [-2.1, 0.74], [-1.6, 0.795], [-0.8, 0.855], [0.3, 0.895], [1.3, 0.925], [2.0, 0.945], [2.3325, 0.935]],
    yt: [[-2.2925, 0.68], [-2.05, 0.765], [-1.5, 0.815], [-0.8, 0.87], [0.3, 0.905], [1.6, 0.94], [2.3325, 0.955]],
    w: [[-2.2925, 0.8], [-2.12, 0.87], [-1.6, 0.89], [-1.33, 0.9], [-0.6, 0.875], [0.4, 0.875], [1.33, 0.9], [2.0, 0.89], [2.3325, 0.85]],
    kw: 0.42, tuck: 0.06, tumble: 0.04, sr: 0.035, crease: 32, charY: [[-2.2, 0.7], [0, 0.76], [2.2, 0.8]], charD: 0.008,
    rndF: { z: 0.12, x: 0.07, t: 0.03, b: 0.04 }, rndR: { z: 0.08, x: 0.05, t: 0.02, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.045, side: 0.06, p: 2.6 },
  gh: {
    z0: -0.8, z1: 1.72,
    roof: [[-0.8, 0.87], [-0.55, 1.03], [-0.25, 1.22], [0.05, 1.34], [0.4, 1.36], [0.9, 1.355], [1.15, 1.3], [1.4, 1.12], [1.6, 1.0], [1.72, 0.96]],
    wb: [[-0.8, 0.78], [0, 0.8], [1.0, 0.8], [1.72, 0.76]],
    wt: [[-0.8, 0.7], [0, 0.64], [0.9, 0.63], [1.72, 0.62]],
    rc: 0.05, crown: 0.02,
    ws: [-0.8, 0.15], rear: [1.15, 1.66], side: [[-0.6, 0.6], [0.66, 1.1]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.48, 0.63], [0.8, 0.645], [0.86, 0.695], [0.84, 0.715], [0.5, 0.705]], hg: 0.01, housing: FIN.darkChrome,
      drl: [[0.52, 0.64], [0.8, 0.652], [0.81, 0.662], [0.52, 0.652]] });
    grille(ctx, { poly: [[-0.4, 0.6], [0.4, 0.6], [0.42, 0.7], [-0.42, 0.7]], tex: 'HONEY', surround: FIN.chrome, sw: 0.01 });
    badge(ctx, '-z', 0, 0.65, 0.028);
    patch(ctx, '-z', rrect(-0.62, 0.3, 0.62, 0.52, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.015, wallFin: FIN.black });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? rrect(0.68, 0.28, 0.84, 0.38, 0.02) : rrect(-0.84, 0.28, -0.68, 0.38, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    patch(ctx, '-z', [[-0.86, 0.2], [0.86, 0.2], [0.88, 0.25], [-0.88, 0.25]], FIN.black, { off: 0.005, depth: 0.02 });
    plate(ctx, 'F', { y: 0.41, idx: 0 });
    // NACA hood duct
    patch(ctx, '+y', [[-0.12, -1.35], [0.12, -1.35], [0.2, -1.05], [-0.2, -1.05]], FIN.blackGloss, { off: 0.005 });
    // tail: twin round lamps each side with light rings, tall wing, diffuser
    patch(ctx, '+z', rrect(-0.84, 0.66, 0.84, 0.88, 0.02), FIN.paint, { off: 0.003 });
    for (const s of [-1, 1]) for (const x of [0.5, 0.71]) {
      roundLamp(ctx, '+z', s * x, 0.77, 0.07, 0xd4000c, LAMP.TAIL, undefined, { bezel: FIN.blackGloss });
      patch(ctx, '+z', ell(s * x, 0.77, 0.03, 0.03, 14), Lf(0xff5048, LAMP.BRAKE), { off: 0.012 });
    }
    badge(ctx, '+z', 0, 0.77, 0.035);
    plate(ctx, 'R', { y: 0.55, idx: 0 });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.3 - 0.06, 0.4, s * 0.3 + 0.06, 0.43, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    grille(ctx, { poly: [[-0.7, 0.24], [0.7, 0.24], [0.72, 0.34], [-0.72, 0.34]], dir: '+z', fin: FIN.black, tex: 'HONEY' });
    exhausts(ctx, [{ x: 0.55, y: 0.28, r: 0.05 }]);
    const zw = 2.1, yw = section(P, zw).yt;
    tube(ctx, [[-0.8, yw + 0.2, zw], [0, yw + 0.21, zw], [0.8, yw + 0.2, zw]], [[-0.012, -0.12], [0.016, 0.05], [0.006, 0.12], [-0.014, 0.07]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) { box(ctx, FIN.paint, s * 0.8, yw + 0.19, zw, 0.012, 0.07, 0.26); box(ctx, FIN.paint, s * 0.56, yw + 0.1, zw + 0.02, 0.03, 0.19, 0.12); }
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-1.02, 0.45], [-0.88, 0.47], [-0.88, 0.6], [-1.02, 0.58]], FIN.blackGloss, { off: 0.005 }); patch(ctx, dir, [[-1.0, 0.2], [1.0, 0.2], [1.0, 0.25], [-1.0, 0.26]], FIN.black, { off: 0.005, depth: 0.012 }); });
    doorSeams(ctx, -0.76, null, 0.7, 0.86, { yb: 0.24 });
    seam(ctx, '+y', [[-0.72, -2.05], [0.72, -2.05]]);
    seam(ctx, '+y', [[-0.72, 1.82], [0.72, 1.82]]);
    mirrors(ctx, { z: -0.58, y: 0.93, fin: FIN.paint, len: 0.18, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.035, out: 0.012, inner: 0.004 });
    handles(ctx, [[0.36, 0.86]], FIN.paint);
    wipers(ctx, { list: [[-0.42, 0.55, 0.05], [0.2, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 1.0, wheelY: 0.13 });
  },
});

// ---- '92 Ichiban Senkou NX (mid-engine homage): low pop-up nose, black glass canopy, long deck, full-width tail + spoiler
DEFS.senkou = () => ({
  name: 'Ichiban Senkou NX', defaultPaint: 0xcfd2d4, wheel: { style: 'y5', fin: FIN.alu },
  wb: 2.53, ohF: 1.0, ohR: 0.875, R: 0.315, ww: 0.215, wwR: 0.235, rimR: 0.2, tf: 1.51, tr: 1.53,
  body: {
    yb: [[-2.265, 0.24], [-2.0, 0.16], [-1.5, 0.13], [0, 0.12], [1.5, 0.13], [1.9, 0.18], [2.14, 0.3]],
    yh: [[-2.265, 0.52], [-2.0, 0.62], [-1.6, 0.7], [-1.26, 0.735], [-0.9, 0.72], [-0.5, 0.7], [0.3, 0.74], [1.0, 0.8], [1.6, 0.82], [2.14, 0.8]],
    yt: [[-2.265, 0.52], [-2.0, 0.6], [-1.5, 0.66], [-1.0, 0.7], [-0.6, 0.72], [0.5, 0.78], [1.2, 0.81], [1.8, 0.83], [2.14, 0.82]],
    w: [[-2.265, 0.7], [-2.05, 0.83], [-1.6, 0.88], [-1.265, 0.895], [-0.5, 0.88], [0.4, 0.89], [1.265, 0.905], [1.8, 0.895], [2.14, 0.86]],
    kw: 0.45, tuck: 0.07, tumble: 0.06, sr: 0.05, crease: 38, charY: [[-2.2, 0.46], [0, 0.55], [2.0, 0.62]], charD: 0.006,
    rndF: { z: 0.22, x: 0.15, t: 0.05, b: 0.04 }, rndR: { z: 0.1, x: 0.06, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.4 },
  gh: {
    z0: -1.2, z1: 1.7,
    roof: [[-1.2, 0.72], [-0.9, 0.86], [-0.6, 1.0], [-0.3, 1.1], [0, 1.155], [0.3, 1.16], [0.6, 1.13], [0.9, 1.06], [1.2, 0.97], [1.5, 0.89], [1.7, 0.86]],
    wb: [[-1.2, 0.8], [-0.4, 0.8], [0.4, 0.78], [1.0, 0.72], [1.7, 0.64]],
    wt: [[-1.2, 0.72], [-0.4, 0.62], [0.4, 0.58], [1.0, 0.52], [1.7, 0.5]],
    rc: 0.06, crown: 0.04,
    ws: [-1.2, -0.05], rear: [0.62, 1.05], side: [[-1.0, 0.45]],
    pillarFin: FIN.blackGloss, roofFin: FIN.blackGloss, railFin: FIN.blackGloss, aFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    popups(ctx, -2.0, -1.72, 0.4, 0.74);
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? rrect(0.5, 0.34, 0.76, 0.4, 0.015) : rrect(-0.76, 0.34, -0.5, 0.4, 0.015), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
      patch(ctx, '-z', s > 0 ? rrect(0.5, 0.41, 0.76, 0.435, 0.01) : rrect(-0.76, 0.41, -0.5, 0.435, 0.01), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    patch(ctx, '-z', rrect(-0.44, 0.24, 0.44, 0.32, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    badge(ctx, '-z', 0, 0.44, 0.03);
    plate(ctx, 'F', { y: 0.3, idx: 2 });
    // side intake behind the doors
    bothSides(ctx, (dir) => patch(ctx, dir, [[0.55, 0.36], [0.95, 0.4], [0.95, 0.64], [0.7, 0.62]], tx(FIN.grille, 'HONEY'), { off: 0.005, depth: 0.012, wallFin: FIN.black }));
    // full-width tail light bar + wing that sweeps out of the rear fenders
    patch(ctx, '+z', rrect(-0.86, 0.6, 0.86, 0.74, 0.03), FIN.blackGloss, { off: 0.004 });
    patch(ctx, '+z', rrect(-0.84, 0.62, 0.84, 0.72, 0.02), Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.008 });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.18 - 0.08, 0.63, s * 0.18 + 0.08, 0.71, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    const zw = 1.98, yw = section(P, zw).yt;
    tube(ctx, [[-0.86, yw + 0.02, zw], [-0.6, yw + 0.06, zw], [0, yw + 0.065, zw], [0.6, yw + 0.06, zw], [0.86, yw + 0.02, zw]], [[-0.01, -0.1], [0.014, 0.04], [0.004, 0.1], [-0.012, 0.05]], FIN.paint, { up: () => [0, 0, 1], crease: 40 });
    plate(ctx, 'R', { y: 0.48, idx: 2 });
    exhausts(ctx, [{ x: -0.2, y: 0.28, r: 0.04, oval: true }, { x: 0.2, y: 0.28, r: 0.04, oval: true }]);
    patch(ctx, '+y', [[-0.45, 1.25], [0.45, 1.25], [0.45, 1.75], [-0.45, 1.75]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    doorSeams(ctx, -1.1, null, 0.5, 0.74, { yb: 0.2, rearKick: 0.05 });
    seam(ctx, '+y', [[-0.66, -1.62], [0.66, -1.62]]);
    mirrors(ctx, { z: -0.9, y: 0.82, fin: FIN.paint, len: 0.17, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.25, 0.72]], FIN.blackGloss, { flush: true });
    wipers(ctx, { list: [[-0.32, 0.55, 0.04]] });
    interior(ctx, { wheelY: 0.1, dash: 0.25 });
  },
});

// ---- '86 Tenzan Hachi 1600 (hachi-roku homage): boxy 3-door hatch, pop-ups, black lower half, full-width tail lamps
DEFS.hachi = () => ({
  name: 'Tenzan Hachi 1600', defaultPaint: 0xf2f2f0, defaultPaint2: 0x131315, wheel: { style: 'mesh10', fin: FIN.silver },
  wb: 2.4, ohF: 0.87, ohR: 0.93, R: 0.3, ww: 0.195, rimR: 0.178, tf: 1.36, tr: 1.35,
  body: {
    yb: [[-2.07, 0.3], [-1.85, 0.2], [-1.5, 0.17], [0, 0.15], [1.4, 0.16], [1.9, 0.22], [2.13, 0.3]],
    yh: [[-2.07, 0.66], [-1.85, 0.7], [-1.4, 0.73], [-0.8, 0.765], [0.2, 0.785], [1.2, 0.805], [1.9, 0.815], [2.13, 0.8]],
    yt: [[-2.07, 0.67], [-1.85, 0.71], [-1.4, 0.745], [-0.8, 0.78], [0.2, 0.795], [1.2, 0.825], [2.13, 0.815]],
    w: [[-2.07, 0.76], [-1.9, 0.8], [-1.2, 0.81], [0, 0.81], [1.2, 0.815], [1.9, 0.8], [2.13, 0.76]],
    kw: 0.45, tuck: 0.04, tumble: 0.03, sr: 0.03, crease: 28, levels: [0.5],
    rndF: { z: 0.06, x: 0.04, t: 0.01, b: 0.03 }, rndR: { z: 0.05, x: 0.03, t: 0.01, b: 0.03 },
  },
  lowerMat: (q) => (q.tag === 'side' && q.y < 0.5 ? FIN.paint2 : undefined),
  arch: { dy: 0.02, top: 0.06, side: 0.06, p: 2.6 },
  gh: {
    z0: -0.9, z1: 2.02,
    roof: [[-0.9, 0.8], [-0.6, 0.96], [-0.3, 1.13], [-0.05, 1.26], [0.3, 1.3], [0.9, 1.3], [1.2, 1.26], [1.5, 1.12], [1.8, 0.95], [2.02, 0.85]],
    wb: [[-0.9, 0.72], [0, 0.74], [1.0, 0.74], [2.02, 0.7]],
    wt: [[-0.9, 0.64], [0, 0.6], [1.0, 0.59], [2.02, 0.55]],
    rc: 0.05, crown: 0.02,
    ws: [-0.9, -0.05], rear: [1.22, 1.98], side: [[-0.7, 0.4], [0.46, 1.12]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    popups(ctx, -1.95, -1.72, 0.36, 0.7);
    patch(ctx, '-z', rrect(-0.4, 0.6, 0.4, 0.64, 0.01), tx(FIN.grille, 'SLATS'), { off: 0.006 });
    badge(ctx, '-z', 0, 0.62, 0.02);
    bumperBar(ctx, 0.46, P.zF + 0.35, 'F', [[-0.04, -0.07], [0.05, -0.06], [0.06, 0.05], [-0.04, 0.06]], FIN.black, 0.02);
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? rrect(0.58, 0.54, 0.76, 0.6, 0.01) : rrect(-0.76, 0.54, -0.58, 0.6, 0.01), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
      patch(ctx, '-z', s > 0 ? rrect(0.44, 0.54, 0.56, 0.6, 0.01) : rrect(-0.56, 0.54, -0.44, 0.6, 0.01), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    plate(ctx, 'F', { y: 0.44, idx: 1 });
    // full-width tail lamps, black centre garnish, black bumper
    for (const s of [-1, 1]) patch(ctx, '+z', s > 0 ? rrect(0.34, 0.62, 0.76, 0.74, 0.012) : rrect(-0.76, 0.62, -0.34, 0.74, 0.012), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
    patch(ctx, '+z', rrect(-0.33, 0.62, 0.33, 0.74, 0.01), FIN.blackGloss, { off: 0.008 });
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.4 - 0.05, 0.63, s * 0.4 + 0.05, 0.66, 0.006), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    bumperBar(ctx, 0.46, P.zR - 0.3, 'R', [[-0.04, -0.07], [0.05, -0.06], [0.06, 0.05], [-0.04, 0.06]], FIN.black, 0.02);
    plate(ctx, 'R', { y: 0.56, idx: 1 });
    exhausts(ctx, [{ x: 0.45, y: 0.27, r: 0.03 }]);
    const G = P.gh, zs = 1.55, ys = G.roof(zs);
    tube(ctx, [-0.56, 0, 0.56].map((x) => [x, ys - G.crown * sq(x / G.wt(zs)) + 0.004, zs - 0.02]), [[-0.06, -0.015], [0.05, -0.015], [0.06, 0.0], [0.04, 0.01], [-0.06, 0.004]], FIN.paint2, { up: () => [0, 1, 0], crease: 40 });
    doorSeams(ctx, -0.86, null, 0.44, 0.78, { yb: 0.26 });
    seam(ctx, '+y', [[-0.7, -1.9], [0.7, -1.9]]);
    mirrors(ctx, { z: -0.66, y: 0.86, fin: FIN.black, len: 0.14, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint2, width: 0.02, out: 0.006, inner: 0.003 });
    handles(ctx, [[0.34, 0.76]], FIN.black);
    wipers(ctx, { list: [[-0.38, 0.5, 0.05], [0.16, 0.46, 0.08]] });
    interior(ctx, { rearSeat: 0.95, wheelY: 0.13 });
  },
});

// ---- '90 Kaze Sora roadster (NA roadster homage): smooth open two-seater, pop-ups, oval mouth, oval tail lamps
DEFS.sora = () => ({
  name: 'Kaze Sora Roadster', defaultPaint: 0xb3121a, wheel: { style: 'split5', fin: FIN.alu },
  wb: 2.265, ohF: 0.82, ohR: 0.865, R: 0.29, ww: 0.185, rimR: 0.178, tf: 1.41, tr: 1.43,
  body: {
    yb: [[-1.9525, 0.26], [-1.75, 0.18], [-1.3, 0.15], [0, 0.14], [1.3, 0.15], [1.75, 0.2], [1.9975, 0.3]],
    yh: [[-1.9525, 0.55], [-1.75, 0.64], [-1.3, 0.705], [-0.8, 0.735], [0, 0.735], [0.8, 0.755], [1.5, 0.79], [1.9975, 0.775]],
    yt: [[-1.9525, 0.55], [-1.75, 0.625], [-1.3, 0.685], [-0.8, 0.725], [-0.5, 0.74], [0.5, 0.745], [1.3, 0.795], [1.8, 0.805], [1.9975, 0.785]],
    w: [[-1.9525, 0.66], [-1.75, 0.78], [-1.13, 0.835], [-0.4, 0.828], [0.4, 0.828], [1.13, 0.84], [1.7, 0.82], [1.9975, 0.74]],
    kw: 0.45, tuck: 0.07, tumble: 0.06, sr: 0.08, crease: 48,
    rndF: { z: 0.28, x: 0.18, t: 0.06, b: 0.05 }, rndR: { z: 0.2, x: 0.12, t: 0.05, b: 0.05 },
    bedY: (z) => (z > -0.55 && z < 0.62 ? 0.36 : null),
  },
  bed: { z0: -0.55, z1: 0.62 },
  lowerMat: (q) => ((q.tag === 'topIn' || q.tag === 'bedWall') && q.z > -0.55 && q.z < 0.62 ? FIN.interior : undefined),
  arch: { dy: 0.02, top: 0.05, side: 0.06, p: 2.2 },
  seat: [-0.34, 0.9, 0.22],
  features: (ctx) => {
    const P = ctx.P;
    popups(ctx, -1.72, -1.46, 0.36, 0.68);
    patch(ctx, '-z', ell(0, 0.32, 0.3, 0.08, 28), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? ell(0.55, 0.36, 0.07, 0.035, 16) : ell(-0.55, 0.36, 0.07, 0.035, 16), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(s * 0.55, 0.5, P.zF + 0.2));
    }
    badge(ctx, '-z', 0, 0.46, 0.028);
    plate(ctx, 'F', { y: 0.2, idx: 0 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? ell(0.58, 0.64, 0.18, 0.06, 24) : ell(-0.58, 0.64, 0.18, 0.06, 24), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? rrect(0.28, 0.4, 0.4, 0.43, 0.01) : rrect(-0.4, 0.4, -0.28, 0.43, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    }
    plate(ctx, 'R', { y: 0.55, idx: 0 });
    exhausts(ctx, [{ x: 0.42, y: 0.24, r: 0.03 }]);
    openScreen(ctx, -0.62, 0.66, 0.36, 0.22, FIN.black, { wrap: 0.06, drop: 0.03 });
    openCockpit(ctx, 0.12, 0.36, { seatX: 0.34, dashY: 0.66, dashW: 1.3 });
    for (const x of [-0.34, 0.34]) rbox(ctx, FIN.seat, x, 0.92, 0.42, 0.24, 0.16, 0.1, 0.03, -0.2, 0, 0);
    doorSeams(ctx, -0.6, null, null, 0.72, { yb: 0.22 });
    seam(ctx, '+y', [[-0.62, -1.6], [0.62, -1.6]]);
    seam(ctx, '+y', [[-0.6, 0.75], [0.6, 0.75]]);
    mirrors(ctx, { z: -0.46, y: 0.78, fin: FIN.paint, len: 0.14, h: 0.08 });
    archTrims(ctx, { fin: FIN.paint, width: 0.025, out: 0.006, inner: 0.003 });
    handles(ctx, [[-0.1, 0.7]], FIN.chrome);
  },
});

// ---- '73 Schwabe 9R RS 2.7 (air-cooled flat-six homage): narrow body, upright fender lamps, ducktail, script stripe
DEFS.classic9 = () => ({
  name: 'Schwabe 9R RS 2.7', defaultPaint: 0xf1efe6, defaultPaint2: 0x1e4fb3, wheel: { style: 'fuchs5', fin: FIN.alu },
  wb: 2.271, ohF: 0.86, ohR: 1.03, R: 0.31, ww: 0.19, wwR: 0.215, rimR: 0.19, tf: 1.37, tr: 1.39,
  body: {
    yb: [[-1.9955, 0.28], [-1.75, 0.2], [-1.2, 0.16], [0, 0.15], [1.1, 0.16], [1.7, 0.21], [2.0, 0.27], [2.1655, 0.33]],
    yh: [[-1.9955, 0.56], [-1.75, 0.66], [-1.35, 0.73], [-1.135, 0.75], [-0.8, 0.73], [-0.4, 0.72], [0.3, 0.77], [0.8, 0.81], [1.135, 0.83], [1.6, 0.83], [1.95, 0.8], [2.1655, 0.76]],
    yt: [[-1.9955, 0.56], [-1.75, 0.62], [-1.35, 0.665], [-0.8, 0.7], [-0.45, 0.73], [0.9, 0.81], [1.5, 0.84], [1.95, 0.82], [2.1655, 0.77]],
    w: [[-1.9955, 0.66], [-1.8, 0.76], [-1.4, 0.8], [-1.135, 0.81], [-0.6, 0.8], [0.1, 0.8], [0.7, 0.82], [1.135, 0.845], [1.7, 0.83], [2.0, 0.8], [2.1655, 0.74]],
    kw: 0.45, tuck: 0.06, tumble: 0.05, sr: 0.08, crease: 45,
    rndF: { z: 0.2, x: 0.14, t: 0.06, b: 0.05 }, rndR: { z: 0.22, x: 0.14, t: 0.08, b: 0.05 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.0 },
  gh: {
    z0: -0.75, z1: 1.95,
    roof: [[-0.75, 0.72], [-0.5, 0.88], [-0.25, 1.06], [0, 1.2], [0.25, 1.28], [0.5, 1.29], [0.8, 1.25], [1.1, 1.15], [1.4, 1.03], [1.7, 0.92], [1.95, 0.84]],
    wb: [[-0.75, 0.72], [0, 0.74], [0.8, 0.72], [1.95, 0.62]],
    wt: [[-0.75, 0.64], [0, 0.59], [0.6, 0.57], [1.1, 0.53], [1.6, 0.46], [1.95, 0.4]],
    rc: 0.08, crown: 0.04,
    ws: [-0.75, 0.12], rear: [0.9, 1.62], side: [[-0.55, 0.45], [0.52, 0.95]],
    pillarFin: FIN.paint,
  },
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      const c = lampPod(ctx, s * 0.58, 0.64, 0.085, 0.085, { mix: 0.3, up: 0.14, len: 0.12, out: 0.03 });
      if (c) ctx.head.push(new THREE.Vector3(c[0], c[1], c[2] - 0.02));
      patch(ctx, '-z', s > 0 ? rrect(0.5, 0.34, 0.66, 0.38, 0.012) : rrect(-0.66, 0.34, -0.5, 0.38, 0.012), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
      patch(ctx, '-z', s > 0 ? ell(0.3, 0.36, 0.06, 0.03, 14) : ell(-0.3, 0.36, 0.06, 0.03, 14), tx(FIN.grille, 'HONEY'), { off: 0.008 });
    }
    bumperBar(ctx, 0.4, P.zF + 0.3, 'F', [[-0.02, -0.035], [0.03, -0.03], [0.04, 0.0], [0.03, 0.028], [-0.02, 0.032]], FIN.chrome, 0.015);
    badge(ctx, '+y', 0, -1.75, 0.03);
    plate(ctx, 'F', { y: 0.29, idx: 3 });
    // tail: slim lamps, engine lid grille, ducktail
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? rrect(0.4, 0.56, 0.76, 0.615, 0.012) : rrect(-0.76, 0.56, -0.4, 0.615, 0.012), Lf(0xd4000c, LAMP.TAIL), { off: 0.008 });
      patch(ctx, '+z', s > 0 ? rrect(0.4, 0.535, 0.52, 0.555, 0.006) : rrect(-0.52, 0.535, -0.4, 0.555, 0.006), Lf(0xf4f6ff, LAMP.REV), { off: 0.008 });
    }
    patch(ctx, '+y', [[-0.3, 1.62], [0.3, 1.62], [0.3, 1.86], [-0.3, 1.86]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    const zd = 2.06, yd = section(P, zd).yt;
    tube(ctx, [[-0.6, yd + 0.004, zd], [0, yd + 0.012, zd], [0.6, yd + 0.004, zd]], [[-0.11, -0.012], [0.06, 0.04], [0.1, 0.035], [0.05, -0.02]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    bumperBar(ctx, 0.4, P.zR - 0.3, 'R', [[-0.02, -0.035], [0.03, -0.03], [0.04, 0.0], [0.03, 0.028], [-0.02, 0.032]], FIN.chrome, 0.015);
    plate(ctx, 'R', { y: 0.46, idx: 3 });
    exhausts(ctx, [{ x: -0.42, y: 0.26, r: 0.032 }]);
    // script stripe along the sill
    bothSides(ctx, (dir) => patch(ctx, dir, [[-0.78, 0.28], [0.72, 0.28], [0.74, 0.34], [-0.76, 0.34]], FIN.paint2, { off: 0.005 }));
    doorSeams(ctx, -0.72, null, 0.48, 0.75, { yb: 0.25 });
    seam(ctx, '+y', [[-0.56, -1.82], [0.56, -1.82]]);
    beltTrim(ctx, FIN.chrome, -0.55, 0.95, { h: 0.006 });
    mirrors(ctx, { z: -0.45, y: 0.8, fin: FIN.chrome, stalk: FIN.chrome, len: 0.1, h: 0.08, d: 0.08, driverOnly: true });
    archTrims(ctx, { fin: FIN.paint, width: 0.035, out: 0.01, inner: 0.004 });
    handles(ctx, [[0.3, 0.76]], FIN.chrome);
    wipers(ctx, { list: [[-0.34, 0.48, 0.05], [0.14, 0.46, 0.08]] });
    interior(ctx, { rearSeat: 0.85, wheelY: 0.13 });
  },
});

// ---- '19 Schwabe 9R GT3 RS: the coupe body lowered and widened, big swan-neck wing, splitter, hood vents
DEFS.coupeGT = () => {
  const B = DEFS.coupe();
  B.name = 'Schwabe 9R GT3 RS'; B.defaultPaint = 0x6fc13b; B.wheel = { style: 'split5', fin: FIN.graphite };
  B.body = Object.assign({}, B.body, {
    yb: B.body.yb.map(([z, y]) => [z, y - 0.03]),
    w: B.body.w.map(([z, x]) => [z, x + (z > 0.6 ? 0.03 : 0.015)]),
  });
  B.tf += 0.03; B.tr += 0.05; B.wwR = 0.325;
  const base = B.features;
  B.noWing = true;
  B.features = (ctx) => {
    base(ctx);
    const P = ctx.P;
    // swan-neck GT wing, front splitter + canards, hood vents, side intakes
    const zw = 1.95, yw = section(P, zw).yt + 0.34;
    tube(ctx, [[-0.82, yw, zw], [0, yw + 0.01, zw], [0.82, yw, zw]], [[-0.012, -0.16], [0.022, 0.06], [0.008, 0.16], [-0.018, 0.08]], FIN.graphite, { up: () => [0, 0, 1], crease: 30 });
    for (const s of [-1, 1]) { box(ctx, FIN.graphite, s * 0.83, yw - 0.02, zw, 0.012, 0.14, 0.36); cylAB(ctx, FIN.black, [s * 0.34, yw - 0.02, zw - 0.02], [s * 0.3, yw - 0.36, zw + 0.12], 0.018, 8); }
    box(ctx, FIN.graphite, 0, 0.11, P.zF + 0.26, 1.46, 0.018, 0.36);
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.26 - 0.1, -1.95, s * 0.26 + 0.1, -1.7, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    bothSides(ctx, (dir) => patch(ctx, dir, [[0.72, 0.5], [0.95, 0.54], [0.95, 0.66], [0.74, 0.62]], tx(FIN.grille, 'HONEY'), { off: 0.005 }));
  };
  return B;
};

// ---- '19 Kessler K5 Sport (M-division super sedan homage): twin-kidney grille, angry lamps, quad pipes
DEFS.k5 = () => ({
  name: 'Kessler K5 Sport', defaultPaint: 0x23282f, wheel: { style: 'y5', fin: FIN.graphite },
  wb: 2.98, ohF: 0.95, ohR: 1.04, R: 0.345, ww: 0.255, wwR: 0.285, rimR: 0.254, tf: 1.62, tr: 1.6,
  body: {
    yb: [[-2.44, 0.28], [-2.2, 0.19], [-1.8, 0.16], [0, 0.15], [1.8, 0.16], [2.25, 0.23], [2.53, 0.34]],
    yh: [[-2.44, 0.74], [-2.1, 0.8], [-1.5, 0.84], [-0.7, 0.9], [0.3, 0.93], [1.3, 0.96], [2.0, 0.98], [2.53, 0.96]],
    yt: [[-2.44, 0.75], [-2.15, 0.82], [-1.5, 0.87], [-0.7, 0.925], [-0.2, 0.94], [1.6, 0.975], [2.1, 0.995], [2.53, 0.98]],
    w: [[-2.44, 0.8], [-2.2, 0.9], [-1.8, 0.93], [-1.49, 0.945], [0, 0.935], [1.49, 0.95], [2.0, 0.93], [2.3, 0.9], [2.53, 0.86]],
    kw: 0.42, tuck: 0.06, tumble: 0.04, sr: 0.07, charY: [[-2.35, 0.72], [0, 0.78], [2.45, 0.85]], charD: 0.008,
    rndF: { z: 0.2, x: 0.12, t: 0.07, b: 0.05 }, rndR: { z: 0.12, x: 0.08, t: 0.04, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.07, p: 2.3 },
  gh: {
    z0: -0.78, z1: 1.98,
    roof: [[-0.78, 0.92], [-0.5, 1.09], [-0.2, 1.27], [0.1, 1.4], [0.4, 1.45], [0.8, 1.455], [1.1, 1.43], [1.4, 1.33], [1.7, 1.17], [1.98, 1.0]],
    wb: [[-0.78, 0.8], [-0.3, 0.82], [0.5, 0.83], [1.3, 0.82], [1.98, 0.78]],
    wt: [[-0.78, 0.73], [-0.2, 0.68], [0.4, 0.665], [1.0, 0.66], [1.5, 0.64], [1.98, 0.6]],
    rc: 0.07, crown: 0.035,
    ws: [-0.78, 0.15], rear: [1.15, 1.98], side: [[-0.56, 0.34], [0.42, 1.3]],
    pillarFin: (z) => (z < 0.42 ? FIN.blackGloss : FIN.paint),
  },
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      const k = s > 0 ? [[0.03, 0.54], [0.24, 0.54], [0.25, 0.72], [0.05, 0.72]] : mirX([[0.03, 0.54], [0.24, 0.54], [0.25, 0.72], [0.05, 0.72]]);
      grille(ctx, { poly: k, tex: 'VBARS', surround: FIN.chrome, sw: 0.014 });
    }
    headlamps(ctx, { poly: [[0.32, 0.64], [0.72, 0.655], [0.86, 0.69], [0.82, 0.725], [0.36, 0.72]], hg: 0.01, housing: FIN.blackGloss,
      drl: [[0.36, 0.652], [0.74, 0.664], [0.745, 0.674], [0.36, 0.662]] });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? [[0.52, 0.28], [0.86, 0.3], [0.84, 0.5], [0.56, 0.48]] : mirX([[0.52, 0.28], [0.86, 0.3], [0.84, 0.5], [0.56, 0.48]]), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    patch(ctx, '-z', rrect(-0.46, 0.28, 0.46, 0.4, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    patch(ctx, '-z', [[-0.86, 0.2], [0.86, 0.2], [0.88, 0.25], [-0.88, 0.25]], FIN.graphite, { off: 0.005, depth: 0.018 });
    badge(ctx, '-z', 0, 0.8, 0.035);
    plate(ctx, 'F', { y: 0.46, idx: 0 });
    // power bulge + L tail lamps + quad pipes + diffuser + lip spoiler
    rbox(ctx, FIN.paint, 0, section(P, -1.3).yt + 0.012, -1.3, 0.6, 0.03, 1.2, 0.012);
    for (const s of [-1, 1]) {
      const t = [[0.46, 0.86], [0.9, 0.86], [0.92, 0.94], [0.62, 0.95], [0.6, 0.9], [0.46, 0.9]];
      patch(ctx, '+z', s > 0 ? grow(t, 0.01) : mirX(grow(t, 0.01)), FIN.blackGloss, { off: 0.004 });
      patch(ctx, '+z', s > 0 ? t : mirX(t), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
    }
    badge(ctx, '+z', 0, 0.9, 0.03);
    plate(ctx, 'R', { y: 0.7, idx: 0 });
    for (const s of [-1, 1]) patch(ctx, '+z', s > 0 ? rrect(0.34, 0.5, 0.48, 0.53, 0.01) : rrect(-0.48, 0.5, -0.34, 0.53, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    grille(ctx, { poly: [[-0.72, 0.24], [0.72, 0.24], [0.74, 0.38], [-0.74, 0.38]], dir: '+z', fin: FIN.graphite, tex: 'HONEY' });
    exhausts(ctx, [{ x: -0.62, y: 0.3, r: 0.045 }, { x: -0.5, y: 0.3, r: 0.045 }, { x: 0.5, y: 0.3, r: 0.045 }, { x: 0.62, y: 0.3, r: 0.045 }]);
    const zs = 2.46, ys = section(P, zs).yt;
    tube(ctx, [[-0.62, ys + 0.004, zs], [0, ys + 0.01, zs], [0.62, ys + 0.004, zs]], [[-0.06, -0.01], [0.05, 0.02], [0.07, 0.016], [0.03, -0.012]], FIN.graphite, { up: () => [0, 1, 0], crease: 35 });
    chmsl(ctx, -0.15, 0.15, 1.44);
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-1.02, 0.52], [-0.84, 0.54], [-0.84, 0.6], [-1.02, 0.59]], tx(FIN.grille, 'HONEY'), { off: 0.005 }); });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.95, 0.27], [-0.97, 0.62], [-0.9, 0.93]]);
      seam(ctx, dir, [[0.37, 0.26], [0.37, 0.96]]);
      seam(ctx, dir, [[1.12, 0.26], [1.1, 0.52], [1.2, 0.72], [1.34, 0.86], [1.38, 0.99]]);
    });
    seam(ctx, '+y', [[-0.76, -2.22], [0.76, -2.22]]);
    seam(ctx, '+y', [[-0.76, 2.05], [0.76, 2.05]]);
    beltTrim(ctx, FIN.blackGloss, -0.56, 1.3);
    mirrors(ctx, { z: -0.52, y: 1.02, fin: FIN.graphite, len: 0.2, h: 0.11 });
    archTrims(ctx, { fin: FIN.paint, width: 0.035, out: 0.01, inner: 0.004 });
    handles(ctx, [[0.05, 0.9], [1.0, 0.92]], FIN.blackGloss, { flush: true, flushFin: FIN.darkChrome });
    wipers(ctx);
    interior(ctx, { rearSeat: 1.0 });
  },
});

// ---- '88 Kessler K3 Evolution (DTM homologation homage): boxy two-door, box flares, quad lamps, kidney grille, trunk wing
DEFS.k3 = () => ({
  name: 'Kessler K3 Evolution', defaultPaint: 0xf1f1ee, wheel: { style: 'mesh10', fin: FIN.silver },
  wb: 2.562, ohF: 0.78, ohR: 1.0, R: 0.3, ww: 0.215, rimR: 0.203, tf: 1.412, tr: 1.424,
  body: {
    yb: [[-2.061, 0.28], [-1.85, 0.19], [-1.4, 0.16], [0, 0.15], [1.4, 0.16], [1.9, 0.22], [2.281, 0.3]],
    yh: [[-2.061, 0.7], [-1.85, 0.75], [-1.4, 0.77], [-0.7, 0.795], [0.3, 0.815], [1.3, 0.835], [1.9, 0.86], [2.281, 0.86]],
    yt: [[-2.061, 0.71], [-1.85, 0.765], [-1.4, 0.785], [-0.7, 0.81], [0.3, 0.825], [1.4, 0.855], [1.9, 0.895], [2.281, 0.895]],
    w: [[-2.061, 0.8], [-1.85, 0.83], [-1.281, 0.85], [-0.8, 0.82], [0, 0.815], [0.8, 0.82], [1.281, 0.855], [1.9, 0.84], [2.281, 0.81]],
    kw: 0.45, tuck: 0.04, tumble: 0.02, sr: 0.025, crease: 26, charY: [[-2.0, 0.66], [2.2, 0.72]], charD: 0.006,
    rndF: { z: 0.06, x: 0.04, t: 0.01, b: 0.03 }, rndR: { z: 0.05, x: 0.03, t: 0.01, b: 0.03 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.05, p: 2.8 },
  gh: {
    z0: -0.72, z1: 1.75,
    roof: [[-0.72, 0.83], [-0.45, 1.0], [-0.15, 1.2], [0.15, 1.33], [0.45, 1.36], [0.9, 1.36], [1.15, 1.32], [1.4, 1.14], [1.6, 1.0], [1.75, 0.93]],
    wb: [[-0.72, 0.74], [0, 0.76], [1.0, 0.76], [1.75, 0.74]],
    wt: [[-0.72, 0.66], [0, 0.62], [1.0, 0.61], [1.75, 0.6]],
    rc: 0.04, crown: 0.015,
    ws: [-0.72, 0.12], rear: [1.15, 1.72], side: [[-0.52, 0.62], [0.68, 1.12]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    patch(ctx, '-z', rrect(-0.8, 0.55, 0.8, 0.71, 0.01), FIN.blackGloss, { off: 0.004 });
    for (const s of [-1, 1]) { roundLamp(ctx, '-z', s * 0.68, 0.63, 0.07, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.007, bezel: FIN.chrome }); roundLamp(ctx, '-z', s * 0.5, 0.63, 0.06, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.007, bezel: FIN.chrome }); }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.6, 0.63, P.zF - 0.02), new THREE.Vector3(0.6, 0.63, P.zF - 0.02));
    for (const s of [-1, 1]) grille(ctx, { poly: s > 0 ? rrect(0.03, 0.56, 0.16, 0.7, 0.03) : rrect(-0.16, 0.56, -0.03, 0.7, 0.03), tex: 'VBARS', surround: FIN.chrome, sw: 0.012 });
    badge(ctx, '-z', 0, 0.735, 0.03);
    bumperBar(ctx, 0.43, P.zF + 0.3, 'F', [[-0.04, -0.09], [0.05, -0.08], [0.06, 0.06], [-0.04, 0.07]], FIN.black, 0.02);
    patch(ctx, '-z', [[-0.8, 0.22], [0.8, 0.22], [0.82, 0.3], [-0.82, 0.3]], FIN.black, { off: 0.005, depth: 0.02 });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? rrect(0.5, 0.4, 0.7, 0.46, 0.01) : rrect(-0.7, 0.4, -0.5, 0.46, 0.01), Lf(0xffa21a, LAMP.NONE), { off: 0.07 });
    plate(ctx, 'F', { y: 0.36, idx: 2 });
    // tail lamps, black bumper, raised decklid + wing
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? rrect(0.36, 0.66, 0.8, 0.79, 0.01) : rrect(-0.8, 0.66, -0.36, 0.79, 0.01), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? rrect(0.36, 0.66, 0.46, 0.7, 0.006) : rrect(-0.46, 0.66, -0.36, 0.7, 0.006), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    }
    patch(ctx, '+z', rrect(-0.34, 0.68, 0.34, 0.77, 0.01), FIN.blackGloss, { off: 0.008 });
    bumperBar(ctx, 0.45, P.zR - 0.3, 'R', [[-0.04, -0.09], [0.05, -0.08], [0.06, 0.06], [-0.04, 0.07]], FIN.black, 0.02);
    plate(ctx, 'R', { y: 0.56, idx: 2 });
    exhausts(ctx, [{ x: -0.5, y: 0.26, r: 0.034 }, { x: -0.4, y: 0.26, r: 0.034 }]);
    const zw = 2.12, yw = section(P, zw).yt;
    tube(ctx, [[-0.7, yw + 0.06, zw], [0, yw + 0.066, zw], [0.7, yw + 0.06, zw]], [[-0.01, -0.09], [0.014, 0.04], [0.005, 0.09], [-0.012, 0.05]], FIN.paint, { up: () => [0, 0, 1], crease: 40 });
    for (const s of [-1, 1]) box(ctx, FIN.paint, s * 0.66, yw + 0.03, zw, 0.03, 0.06, 0.12);
    doorSeams(ctx, -0.68, null, 0.66, 0.8, { yb: 0.26, rearKick: 0.02 });
    seam(ctx, '+y', [[-0.72, -1.95], [0.72, -1.95]]);
    seam(ctx, '+y', [[-0.72, 1.85], [0.72, 1.85]]);
    beltTrim(ctx, FIN.black, -0.52, 1.12);
    mirrors(ctx, { z: -0.52, y: 0.86, fin: FIN.paint, len: 0.14, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint, width: 0.05, out: 0.025, inner: 0.004 });
    handles(ctx, [[0.42, 0.78]], FIN.black);
    wipers(ctx, { list: [[-0.4, 0.5, 0.05], [0.16, 0.46, 0.08]] });
    interior(ctx, { rearSeat: 1.0, wheelY: 0.13 });
  },
});

// ---- '64 Ashcombe Sovereign (spy GT homage): faired headlamps, shield grille, bonnet scoop, side strakes, wire wheels
DEFS.sovereign = () => ({
  name: 'Ashcombe Sovereign', defaultPaint: 0xa9adb0, wheel: { style: 'mesh10', fin: FIN.chrome },
  wb: 2.49, ohF: 0.95, ohR: 1.13, R: 0.33, ww: 0.19, rimR: 0.19, tf: 1.38, tr: 1.36,
  body: {
    yb: [[-2.195, 0.34], [-1.95, 0.24], [-1.5, 0.19], [0, 0.17], [1.4, 0.18], [1.95, 0.24], [2.375, 0.34]],
    yh: [[-2.195, 0.66], [-1.95, 0.74], [-1.5, 0.8], [-1.245, 0.82], [-0.7, 0.8], [0, 0.8], [0.8, 0.82], [1.245, 0.84], [1.9, 0.82], [2.375, 0.76]],
    yt: [[-2.195, 0.64], [-1.95, 0.72], [-1.5, 0.78], [-0.9, 0.82], [-0.5, 0.83], [0.6, 0.83], [1.5, 0.84], [2.0, 0.82], [2.375, 0.76]],
    w: [[-2.195, 0.64], [-1.95, 0.76], [-1.5, 0.82], [-1.245, 0.84], [-0.6, 0.83], [0.3, 0.83], [1.245, 0.85], [1.9, 0.82], [2.375, 0.72]],
    kw: 0.45, tuck: 0.08, tumble: 0.06, sr: 0.1, crease: 48,
    rndF: { z: 0.3, x: 0.2, t: 0.08, b: 0.05 }, rndR: { z: 0.3, x: 0.2, t: 0.08, b: 0.06 },
  },
  arch: { dy: 0.03, top: 0.07, side: 0.07, p: 2.0 },
  gh: {
    z0: -0.62, z1: 1.9,
    roof: [[-0.62, 0.83], [-0.38, 0.97], [-0.1, 1.14], [0.2, 1.27], [0.5, 1.32], [0.85, 1.31], [1.15, 1.22], [1.45, 1.08], [1.7, 0.96], [1.9, 0.88]],
    wb: [[-0.62, 0.72], [0, 0.74], [1.0, 0.72], [1.9, 0.62]],
    wt: [[-0.62, 0.65], [0, 0.6], [0.8, 0.57], [1.4, 0.5], [1.9, 0.44]],
    rc: 0.07, crown: 0.035,
    ws: [-0.62, 0.18], rear: [1.05, 1.7], side: [[-0.42, 0.56], [0.62, 1.05]],
    pillarFin: FIN.paint,
  },
  features: (ctx) => {
    const P = ctx.P;
    const shield = [[-0.28, 0.6], [0.28, 0.6], [0.31, 0.5], [0.2, 0.37], [0, 0.33], [-0.2, 0.37], [-0.31, 0.5]];
    patch(ctx, '-z', grow(shield, 0.018), FIN.chrome, { off: 0.004, depth: 0.012 });
    patch(ctx, '-z', shield, tx(FIN.grille, 'SLATS'), { off: 0.018 });
    for (const s of [-1, 1]) {
      const r = roundLamp(ctx, '-z', s * 0.6, 0.62, 0.075, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.004, bezel: FIN.chrome, depth: 0.004 });
      void r;
      patch(ctx, '-z', s > 0 ? ell(0.6, 0.62, 0.1, 0.085, 24) : ell(-0.6, 0.62, 0.1, 0.085, 24), FIN.glass, { off: 0.03 });
      patch(ctx, '-z', s > 0 ? ell(0.46, 0.44, 0.035, 0.025, 12) : ell(-0.46, 0.44, 0.035, 0.025, 12), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    bumperBar(ctx, 0.36, P.zF + 0.35, 'F', bladeProf, FIN.chrome, 0.015);
    for (const s of [-1, 1]) cylAB(ctx, FIN.chrome, [s * 0.36, 0.3, P.zF + 0.04], [s * 0.36, 0.48, P.zF + 0.02], 0.028, 10);
    plate(ctx, 'F', { y: 0.27, idx: 3 });
    // bonnet scoop
    const zs = -1.2, ys = section(P, zs).yt;
    rbox(ctx, FIN.paint, 0, ys + 0.02, zs, 0.34, 0.05, 0.6, 0.02);
    box(ctx, FIN.black, 0, ys + 0.022, zs - 0.301, 0.28, 0.03, 0.006);
    // side strakes behind the front wheel
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-0.95, 0.46], [-0.8, 0.46], [-0.8, 0.62], [-0.95, 0.62]], FIN.black, { off: 0.004 }); for (let i = 0; i < 3; i++) patch(ctx, dir, [[-0.94, 0.48 + i * 0.05], [-0.81, 0.48 + i * 0.05], [-0.81, 0.49 + i * 0.05], [-0.94, 0.49 + i * 0.05]], FIN.chrome, { off: 0.007 }); });
    // tail: stacked lamps, bumper with overriders
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? [[0.52, 0.56], [0.7, 0.58], [0.66, 0.72], [0.54, 0.7]] : mirX([[0.52, 0.56], [0.7, 0.58], [0.66, 0.72], [0.54, 0.7]]), Lf(0xd4000c, LAMP.TAIL), { off: 0.008 });
      patch(ctx, '+z', s > 0 ? ell(0.6, 0.52, 0.035, 0.025, 12) : ell(-0.6, 0.52, 0.035, 0.025, 12), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
      cylAB(ctx, FIN.chrome, [s * 0.36, 0.3, P.zR - 0.04], [s * 0.36, 0.48, P.zR - 0.02], 0.028, 10);
    }
    bumperBar(ctx, 0.38, P.zR - 0.35, 'R', bladeProf, FIN.chrome, 0.015);
    plate(ctx, 'R', { y: 0.5, idx: 3 });
    exhausts(ctx, [{ x: -0.28, y: 0.25, r: 0.032 }, { x: -0.18, y: 0.25, r: 0.032 }]);
    doorSeams(ctx, -0.58, null, null, 0.8, { yb: 0.28 });
    bothSides(ctx, (dir) => seam(ctx, dir, [[0.58, 0.28], [0.6, 0.8]]));
    seam(ctx, '+y', [[-0.62, -1.95], [0.62, -1.95]]);
    beltTrim(ctx, FIN.chrome, -0.42, 1.05, { h: 0.006 });
    mirrors(ctx, { z: -0.4, y: 0.86, fin: FIN.chrome, stalk: FIN.chrome, len: 0.1, h: 0.08, d: 0.08, driverOnly: true });
    handles(ctx, [[0.36, 0.78]], FIN.chrome);
    wipers(ctx, { list: [[-0.36, 0.48, 0.05], [0.14, 0.46, 0.08]] });
    interior(ctx, { rearSeat: 0.95, wheelY: 0.15 });
  },
});

// ---- '19 Ashcombe Vanguard V12 (modern grand tourer): hexagonal grille, slim lamps, side gills, aeroblade tail
DEFS.vanguard = () => ({
  name: 'Ashcombe Vanguard V12', defaultPaint: 0x1f4a3b, wheel: { style: 'y5', fin: FIN.graphite },
  wb: 2.805, ohF: 0.95, ohR: 0.95, R: 0.35, ww: 0.265, wwR: 0.305, rimR: 0.267, tf: 1.66, tr: 1.65,
  body: {
    yb: [[-2.3525, 0.26], [-2.1, 0.17], [-1.6, 0.14], [0, 0.13], [1.6, 0.14], [2.1, 0.2], [2.3525, 0.32]],
    yh: [[-2.3525, 0.63], [-2.1, 0.72], [-1.6, 0.79], [-1.3, 0.81], [-0.6, 0.8], [0.4, 0.82], [1.3, 0.87], [1.9, 0.87], [2.3525, 0.84]],
    yt: [[-2.3525, 0.63], [-2.05, 0.73], [-1.5, 0.79], [-0.9, 0.82], [-0.4, 0.83], [0.8, 0.85], [1.8, 0.88], [2.3525, 0.86]],
    w: [[-2.3525, 0.76], [-2.1, 0.9], [-1.6, 0.97], [-1.4, 0.985], [-0.6, 0.95], [0.4, 0.955], [1.4, 0.99], [2.0, 0.96], [2.3525, 0.88]],
    kw: 0.45, tuck: 0.08, tumble: 0.06, sr: 0.09, crease: 45, charY: [[-2.2, 0.5], [0, 0.56], [2.2, 0.66]], charD: 0.006,
    rndF: { z: 0.26, x: 0.18, t: 0.07, b: 0.05 }, rndR: { z: 0.14, x: 0.09, t: 0.03, b: 0.04 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.2 },
  gh: {
    z0: -0.85, z1: 2.05,
    roof: [[-0.85, 0.83], [-0.6, 0.95], [-0.3, 1.12], [0, 1.23], [0.3, 1.28], [0.65, 1.27], [1.0, 1.2], [1.4, 1.08], [1.75, 0.97], [2.05, 0.9]],
    wb: [[-0.85, 0.8], [0, 0.82], [1.0, 0.8], [2.05, 0.72]],
    wt: [[-0.85, 0.72], [0, 0.65], [0.7, 0.62], [1.4, 0.56], [2.05, 0.52]],
    rc: 0.08, crown: 0.04,
    ws: [-0.85, 0.1], rear: [1.0, 1.92], side: [[-0.65, 0.72]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: [[-0.5, 0.26], [0.5, 0.26], [0.6, 0.45], [0.46, 0.58], [-0.46, 0.58], [-0.6, 0.45]], tex: 'SLATS', fin: FIN.grille, surround: FIN.darkChrome, sw: 0.02 });
    headlamps(ctx, { poly: [[0.6, 0.6], [0.86, 0.575], [0.92, 0.61], [0.66, 0.655]], hg: 0.008, housing: FIN.blackGloss, drl: [[0.62, 0.61], [0.88, 0.588], [0.89, 0.598], [0.63, 0.62]] });
    badge(ctx, '+y', 0, -2.2, 0.035);
    patch(ctx, '-z', [[-0.86, 0.2], [0.86, 0.2], [0.88, 0.24], [-0.88, 0.24]], FIN.graphite, { off: 0.005, depth: 0.018 });
    plate(ctx, 'F', { y: 0.2, idx: 1 });
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-1.02, 0.42], [-0.88, 0.44], [-0.9, 0.66], [-1.0, 0.62]], FIN.blackGloss, { off: 0.005 }); patch(ctx, dir, [[-0.99, 0.46], [-0.9, 0.47], [-0.91, 0.62], [-0.98, 0.6]], FIN.chrome, { off: 0.007 }); });
    // hood vents, aeroblade lip, thin light bar
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.36 - 0.12, -1.7, s * 0.36 + 0.12, -1.45, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    patch(ctx, '+z', [[-0.88, 0.74], [0.88, 0.74], [0.86, 0.79], [-0.86, 0.79]], FIN.blackGloss, { off: 0.004 });
    patch(ctx, '+z', [[-0.86, 0.75], [0.86, 0.75], [0.845, 0.78], [-0.845, 0.78]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.008 });
    const zs = 2.28, ys = section(P, zs).yt;
    tube(ctx, [[-0.78, ys + 0.004, zs], [0, ys + 0.014, zs], [0.78, ys + 0.004, zs]], [[-0.1, -0.012], [0.06, 0.03], [0.09, 0.026], [0.04, -0.018]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    grille(ctx, { poly: [[-0.74, 0.24], [0.74, 0.24], [0.76, 0.4], [-0.76, 0.4]], dir: '+z', fin: FIN.graphite, tex: 'HONEY' });
    for (const s of [-1, 1]) patch(ctx, '+z', s > 0 ? rrect(0.3, 0.46, 0.44, 0.49, 0.01) : rrect(-0.44, 0.46, -0.3, 0.49, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    plate(ctx, 'R', { y: 0.58, idx: 1 });
    exhausts(ctx, [{ x: -0.62, y: 0.3, r: 0.045 }, { x: -0.5, y: 0.3, r: 0.045 }, { x: 0.5, y: 0.3, r: 0.045 }, { x: 0.62, y: 0.3, r: 0.045 }]);
    doorSeams(ctx, -0.8, null, 0.76, 0.84, { yb: 0.22 });
    seam(ctx, '+y', [[-0.7, -2.1], [0.7, -2.1]]);
    beltTrim(ctx, FIN.chrome, -0.65, 0.72, { h: 0.004 });
    mirrors(ctx, { z: -0.62, y: 0.88, fin: FIN.graphite, len: 0.19, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.035, out: 0.01, inner: 0.004 });
    handles(ctx, [[0.4, 0.82]], FIN.blackGloss, { flush: true, flushFin: FIN.chrome });
    wipers(ctx, { list: [[-0.4, 0.55, 0.05], [0.18, 0.5, 0.08]] });
    interior(ctx, { rearSeat: 0.95, wheelY: 0.12 });
  },
});

// rally aux-lamp pod on the bonnet (4 round lamps)
function lampPodBar(ctx, z, n = 4, span = 0.36) {
  const P = ctx.P, py = section(P, z).yt;
  rbox(ctx, FIN.black, 0, py + 0.07, z, span * 2 + 0.28, 0.13, 0.08, 0.03);
  for (let i = 0; i < n; i++) {
    const x = -span + (2 * span * i) / (n - 1);
    cylAB(ctx, FIN.black, [x, py + 0.075, z - 0.03], [x, py + 0.075, z - 0.075], 0.062, 14);
    addGeo(ctx, CYL(14), Lf(0xffffff, LAMP.HEAD, 'HEADR'), M(x, py + 0.075, z - 0.078, Math.PI / 2, 0, 0, 0.055, 0.004, 0.055));
  }
}
// sticker-style rally livery bits: door roundel + sponsor band on the screen
function rallyDecals(ctx, zDoor, yDoor, screenY) {
  bothSides(ctx, (dir) => patch(ctx, dir, ell(zDoor, yDoor, 0.15, 0.15, 24), tx(FIN.decal, 'ROUNDEL'), { off: 0.009 }));
  if (screenY) patch(ctx, '-z', [[-0.6, screenY], [0.6, screenY], [0.58, screenY + 0.07], [-0.58, screenY + 0.07]], tx(FIN.decal, 'BANNER'), { off: 0.006 });
}

// ---- '85 Vierling Sport 1 E2 (Group B homage): short-wheelbase box-flared coupe, huge splitter + roof-high wing
DEFS.sport1 = () => ({
  name: 'Vierling Sport 1 E2', defaultPaint: 0xf2f2ee, defaultPaint2: 0xc3141b, wheel: { style: 'rally6', fin: FIN.white },
  wb: 2.22, ohF: 0.95, ohR: 0.99, R: 0.32, ww: 0.235, rimR: 0.203, tf: 1.51, tr: 1.5,
  body: {
    yb: [[-2.06, 0.22], [-1.85, 0.18], [-1.4, 0.17], [0, 0.17], [1.3, 0.18], [1.8, 0.24], [2.1, 0.34]],
    yh: [[-2.06, 0.66], [-1.85, 0.72], [-1.3, 0.76], [-0.7, 0.795], [0.3, 0.82], [1.2, 0.85], [1.8, 0.87], [2.1, 0.86]],
    yt: [[-2.06, 0.67], [-1.85, 0.74], [-1.3, 0.78], [-0.7, 0.81], [0.3, 0.83], [1.4, 0.87], [2.1, 0.87]],
    w: [[-2.06, 0.88], [-1.85, 0.93], [-1.3, 0.955], [-1.11, 0.96], [-0.62, 0.9], [0.4, 0.9], [0.62, 0.9], [1.11, 0.96], [1.7, 0.935], [2.1, 0.88]],
    kw: 0.45, tuck: 0.04, tumble: 0.02, sr: 0.03, crease: 26, levels: [0.45],
    rndF: { z: 0.06, x: 0.04, t: 0.02, b: 0.02 }, rndR: { z: 0.05, x: 0.03, t: 0.01, b: 0.03 },
  },
  lowerMat: (q) => (q.tag === 'side' && q.y < 0.45 ? FIN.paint2 : undefined),
  arch: { dy: 0.02, top: 0.06, side: 0.06, p: 3.0 },
  gh: {
    z0: -0.75, z1: 1.7,
    roof: [[-0.75, 0.83], [-0.5, 0.98], [-0.2, 1.18], [0.1, 1.3], [0.4, 1.33], [0.8, 1.33], [1.1, 1.29], [1.35, 1.15], [1.55, 1.02], [1.7, 0.95]],
    wb: [[-0.75, 0.76], [0, 0.78], [1.0, 0.78], [1.7, 0.74]],
    wt: [[-0.75, 0.68], [0, 0.64], [1.0, 0.63], [1.7, 0.6]],
    rc: 0.04, crown: 0.015,
    ws: [-0.75, 0.1], rear: [1.12, 1.65], side: [[-0.55, 0.55], [0.62, 1.1]],
    pillarFin: FIN.black,
  },
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? rrect(0.44, 0.58, 0.8, 0.68, 0.01) : rrect(-0.8, 0.58, -0.44, 0.68, 0.01), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.009, uvMirror: s < 0 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
    }
    grille(ctx, { poly: rrect(-0.4, 0.58, 0.4, 0.68, 0.01), tex: 'SLATS', fin: FIN.black });
    patch(ctx, '-z', rrect(-0.7, 0.28, 0.7, 0.5, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.015, wallFin: FIN.black });
    box(ctx, FIN.graphite, 0, 0.14, P.zF + 0.24, 1.72, 0.02, 0.4);
    for (const s of [-1, 1]) roundLamp(ctx, '-z', s * 0.55, 0.39, 0.06, 0xffffff, LAMP.DRL, 'HEADR', { off: 0.02, bezel: FIN.black });
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.3 - 0.14, -1.7, s * 0.3 + 0.14, -1.35, 0.02), tx(FIN.grille, 'LOUVER'), { off: 0.006 });
    plate(ctx, 'F', { y: 0.53, idx: 0 });
    // tail + big wing on the hatch
    for (const s of [-1, 1]) patch(ctx, '+z', s > 0 ? rrect(0.44, 0.68, 0.82, 0.8, 0.01) : rrect(-0.82, 0.68, -0.44, 0.8, 0.01), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
    patch(ctx, '+z', rrect(-0.42, 0.68, 0.42, 0.8, 0.01), FIN.black, { off: 0.008 });
    plate(ctx, 'R', { y: 0.55, idx: 0 });
    const G = P.gh, zw = 1.78, yw = G.roof(1.55) + 0.06;
    tube(ctx, [[-0.86, yw, zw], [0, yw + 0.01, zw], [0.86, yw, zw]], [[-0.014, -0.16], [0.02, 0.06], [0.006, 0.16], [-0.016, 0.08]], FIN.paint2, { up: () => [0, 0, 1], crease: 30 });
    for (const s of [-1, 1]) { box(ctx, FIN.black, s * 0.86, yw - 0.02, zw, 0.012, 0.16, 0.34); box(ctx, FIN.black, s * 0.6, (yw + section(P, zw).yt) / 2, zw + 0.02, 0.03, yw - section(P, zw).yt, 0.12); }
    exhausts(ctx, [{ x: 0.62, y: 0.26, r: 0.05, len: 0.3 }]);
    rallyDecals(ctx, 0.0, 0.6, 1.25);
    bothSides(ctx, (dir) => patch(ctx, dir, [[-2.0, 0.46], [2.05, 0.5], [2.05, 0.54], [-2.0, 0.5]], FIN.paint2, { off: 0.005 }));
    doorSeams(ctx, -0.72, null, 0.62, 0.8, { yb: 0.24, rearKick: 0.02 });
    seam(ctx, '+y', [[-0.74, -1.85], [0.74, -1.85]]);
    mirrors(ctx, { z: -0.55, y: 0.88, fin: FIN.paint, len: 0.15, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint, width: 0.06, out: 0.03, inner: 0.004 });
    for (const A of P.arches) for (const s of [-1, 1]) box(ctx, FIN.black, s * 0.84, 0.16, A.z + A.ra + 0.02, 0.24, 0.26, 0.008);
    wipers(ctx, { list: [[-0.4, 0.5, 0.05]] });
    interior(ctx, { rearSeat: null, wheelY: 0.13 });
    ctx.noBounds = true;
    for (const s of [-1, 1]) cylAB(ctx, FIN.white, [s * 0.62, 0.9, 0.5], [s * 0.55, 1.26, 0.5], 0.02, 6);
    cylAB(ctx, FIN.white, [-0.55, 1.26, 0.5], [0.55, 1.26, 0.5], 0.02, 6);
    ctx.noBounds = false;
  },
});

// ---- '92 Delfino Aspro Evo (Italian rally hatch homage): boxy 5-door, bulging flares, quad round lamps, roof spoiler
DEFS.aspro = () => ({
  name: 'Delfino Aspro Evo', defaultPaint: 0xc4151c, wheel: { style: 'split5', fin: FIN.silver },
  wb: 2.48, ohF: 0.7, ohR: 0.72, R: 0.3, ww: 0.205, rimR: 0.203, tf: 1.5, tr: 1.5,
  body: {
    yb: [[-1.94, 0.26], [-1.75, 0.19], [-1.3, 0.17], [0, 0.16], [1.3, 0.17], [1.75, 0.22], [1.96, 0.3]],
    yh: [[-1.94, 0.68], [-1.75, 0.73], [-1.3, 0.77], [-0.7, 0.8], [0.3, 0.84], [1.2, 0.87], [1.96, 0.88]],
    yt: [[-1.94, 0.69], [-1.75, 0.745], [-1.3, 0.785], [-0.7, 0.815], [0.3, 0.85], [1.4, 0.88], [1.96, 0.89]],
    w: [[-1.94, 0.82], [-1.75, 0.875], [-1.24, 0.895], [-0.8, 0.85], [0, 0.845], [0.8, 0.85], [1.24, 0.895], [1.75, 0.875], [1.96, 0.83]],
    kw: 0.45, tuck: 0.04, tumble: 0.025, sr: 0.03, crease: 26,
    rndF: { z: 0.06, x: 0.04, t: 0.01, b: 0.03 }, rndR: { z: 0.05, x: 0.03, t: 0.01, b: 0.03 },
  },
  arch: { dy: 0.02, top: 0.06, side: 0.055, p: 2.8 },
  gh: {
    z0: -0.85, z1: 1.9,
    roof: [[-0.85, 0.84], [-0.6, 1.0], [-0.3, 1.2], [0, 1.33], [0.3, 1.36], [1.2, 1.36], [1.5, 1.33], [1.7, 1.15], [1.85, 0.98], [1.9, 0.92]],
    wb: [[-0.85, 0.74], [0, 0.76], [1.2, 0.76], [1.9, 0.72]],
    wt: [[-0.85, 0.66], [0, 0.62], [1.2, 0.62], [1.9, 0.6]],
    rc: 0.04, crown: 0.015,
    ws: [-0.85, 0.05], rear: [1.55, 1.88], side: [[-0.65, 0.25], [0.32, 1.0], [1.05, 1.4]],
    pillarFin: FIN.black,
  },
  features: (ctx) => {
    const P = ctx.P;
    patch(ctx, '-z', rrect(-0.84, 0.56, 0.84, 0.72, 0.01), FIN.black, { off: 0.004 });
    for (const s of [-1, 1]) { roundLamp(ctx, '-z', s * 0.72, 0.64, 0.058, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.007, bezel: FIN.darkChrome }); roundLamp(ctx, '-z', s * 0.53, 0.64, 0.052, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.007, bezel: FIN.darkChrome }); }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.62, 0.64, P.zF - 0.02), new THREE.Vector3(0.62, 0.64, P.zF - 0.02));
    grille(ctx, { poly: rrect(-0.32, 0.58, 0.32, 0.7, 0.01), tex: 'SLATS', fin: FIN.black, surround: FIN.chrome, sw: 0.008 });
    badge(ctx, '-z', 0, 0.64, 0.035);
    patch(ctx, '-z', rrect(-0.74, 0.28, 0.74, 0.46, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.3 - 0.13, -1.62, s * 0.3 + 0.13, -1.35, 0.02), tx(FIN.grille, 'LOUVER'), { off: 0.006 });
    plate(ctx, 'F', { y: 0.37, idx: 2 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? rrect(0.48, 0.64, 0.82, 0.8, 0.01) : rrect(-0.82, 0.64, -0.48, 0.8, 0.01), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? rrect(0.48, 0.64, 0.58, 0.69, 0.005) : rrect(-0.58, 0.64, -0.48, 0.69, 0.005), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    }
    plate(ctx, 'R', { y: 0.58, idx: 2 });
    grille(ctx, { poly: [[-0.82, 0.3], [0.82, 0.3], [0.8, 0.46], [-0.8, 0.46]], dir: '+z', fin: FIN.black });
    exhausts(ctx, [{ x: 0.5, y: 0.26, r: 0.042 }]);
    const G = P.gh, zs = 1.5, ys = G.roof(zs);
    tube(ctx, [-0.62, 0, 0.62].map((x) => [x, ys - G.crown * sq(x / G.wt(zs)) + 0.006, zs - 0.02]), [[-0.08, -0.02], [0.08, -0.02], [0.09, 0.0], [0.06, 0.014], [-0.08, 0.006]], FIN.paint, { up: () => [0, 1, 0], crease: 40 });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.85, 0.24], [-0.87, 0.6], [-0.82, 0.86]]);
      seam(ctx, dir, [[0.3, 0.23], [0.3, 0.9]]);
      seam(ctx, dir, [[1.02, 0.25], [1.0, 0.55], [1.08, 0.88]]);
    });
    seam(ctx, '+y', [[-0.72, -1.78], [0.72, -1.78]]);
    mirrors(ctx, { z: -0.66, y: 0.9, fin: FIN.black, len: 0.14, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint, width: 0.06, out: 0.03, inner: 0.004 });
    handles(ctx, [[0.1, 0.84], [1.0, 0.86]], FIN.black);
    wipers(ctx, { list: [[-0.4, 0.5, 0.05], [0.16, 0.46, 0.08]] });
    interior(ctx, { rearSeat: 0.9, wheelY: 0.13 });
  },
});

// ---- '99 Sakata Rallye VI (rally sedan homage): gaping front mouth with offset plate, fog lamps, two-tier wing
DEFS.rallye6 = () => ({
  name: 'Sakata Rallye VI', defaultPaint: 0xd11f25, wheel: { style: 'multi6', fin: FIN.white },
  wb: 2.51, ohF: 0.84, ohR: 1.0, R: 0.32, ww: 0.225, rimR: 0.216, tf: 1.515, tr: 1.505,
  body: {
    yb: [[-2.095, 0.24], [-1.85, 0.17], [-1.4, 0.15], [0, 0.15], [1.4, 0.16], [1.9, 0.22], [2.255, 0.32]],
    yh: [[-2.095, 0.68], [-1.85, 0.74], [-1.4, 0.77], [-0.8, 0.81], [0.2, 0.84], [1.2, 0.87], [1.9, 0.9], [2.255, 0.89]],
    yt: [[-2.095, 0.69], [-1.85, 0.755], [-1.4, 0.79], [-0.8, 0.83], [0.2, 0.855], [1.4, 0.89], [2.0, 0.91], [2.255, 0.9]],
    w: [[-2.095, 0.8], [-1.85, 0.86], [-1.255, 0.885], [-0.7, 0.86], [0.2, 0.86], [1.255, 0.885], [1.9, 0.87], [2.255, 0.82]],
    kw: 0.43, tuck: 0.05, tumble: 0.035, sr: 0.05, crease: 32, charY: [[-2.0, 0.7], [2.2, 0.78]], charD: 0.006,
    rndF: { z: 0.12, x: 0.08, t: 0.03, b: 0.04 }, rndR: { z: 0.07, x: 0.05, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.06, p: 2.6 },
  gh: {
    z0: -0.8, z1: 1.72,
    roof: [[-0.8, 0.86], [-0.52, 1.03], [-0.22, 1.23], [0.08, 1.37], [0.4, 1.41], [0.85, 1.41], [1.1, 1.38], [1.35, 1.22], [1.55, 1.05], [1.72, 0.96]],
    wb: [[-0.8, 0.76], [0, 0.78], [1.0, 0.78], [1.72, 0.76]],
    wt: [[-0.8, 0.68], [0, 0.64], [1.0, 0.63], [1.72, 0.62]],
    rc: 0.05, crown: 0.02,
    ws: [-0.8, 0.1], rear: [1.12, 1.7], side: [[-0.6, 0.42], [0.48, 1.2]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.42, 0.63], [0.74, 0.64], [0.84, 0.68], [0.8, 0.72], [0.44, 0.7]], hg: 0.01, housing: FIN.darkChrome });
    grille(ctx, { poly: [[-0.36, 0.6], [0.36, 0.6], [0.38, 0.7], [-0.38, 0.7]], tex: 'HONEY', surround: FIN.chrome, sw: 0.008 });
    badge(ctx, '-z', 0, 0.65, 0.03);
    patch(ctx, '-z', [[-0.66, 0.26], [0.66, 0.26], [0.7, 0.52], [-0.7, 0.52]], tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.018, wallFin: FIN.black });
    for (const s of [-1, 1]) roundLamp(ctx, '-z', s * 0.76, 0.34, 0.045, 0xffffff, LAMP.DRL, 'HEADR', { off: 0.008, bezel: FIN.black });
    plate(ctx, 'F', { y: 0.5, x: -0.5, idx: 1 });
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.34 - 0.12, -1.75, s * 0.34 + 0.12, -1.5, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    patch(ctx, '+y', [[-0.14, -1.35], [0.14, -1.35], [0.18, -1.08], [-0.18, -1.08]], FIN.blackGloss, { off: 0.006 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? rrect(0.44, 0.72, 0.84, 0.84, 0.015) : rrect(-0.84, 0.72, -0.44, 0.84, 0.015), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? rrect(0.44, 0.72, 0.54, 0.76, 0.006) : rrect(-0.54, 0.72, -0.44, 0.76, 0.006), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    }
    plate(ctx, 'R', { y: 0.58, idx: 1 });
    grille(ctx, { poly: [[-0.7, 0.26], [0.7, 0.26], [0.72, 0.36], [-0.72, 0.36]], dir: '+z', fin: FIN.black });
    exhausts(ctx, [{ x: 0.55, y: 0.27, r: 0.055 }]);
    const zw = 2.08, yw = section(P, zw).yt;
    for (const [dy, c] of [[0.16, 0.24], [0.06, 0.14]]) tube(ctx, [[-0.76, yw + dy, zw], [0, yw + dy + 0.008, zw], [0.76, yw + dy, zw]], [[-0.01, -c / 2], [0.016, c * 0.2], [0.005, c / 2], [-0.012, c * 0.3]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) box(ctx, FIN.paint, s * 0.76, yw + 0.1, zw, 0.012, 0.16, 0.26);
    doorSeams(ctx, -0.76, 0.46, 1.22, 0.86, { yb: 0.24, rearKick: 0.08 });
    seam(ctx, '+y', [[-0.72, -1.88], [0.72, -1.88]]);
    seam(ctx, '+y', [[-0.72, 1.8], [0.72, 1.8]]);
    mirrors(ctx, { z: -0.6, y: 0.93, fin: FIN.paint, len: 0.16, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.04, out: 0.016, inner: 0.004 });
    handles(ctx, [[0.2, 0.86], [1.05, 0.88]], FIN.paint);
    wipers(ctx, { list: [[-0.4, 0.52, 0.05], [0.18, 0.48, 0.09]] });
    interior(ctx, { rearSeat: 1.0, wheelY: 0.13 });
  },
});

// ---- '74 Delfino Saetta HF (wedge rally legend homage): tiny wheelbase, wraparound visor screen, pop-ups, lamp pod
DEFS.saetta = () => ({
  name: 'Delfino Saetta HF', defaultPaint: 0x2f7fd1, wheel: { style: 'torq5', fin: FIN.gold },
  wb: 2.18, ohF: 0.82, ohR: 0.71, R: 0.31, ww: 0.205, wwR: 0.225, rimR: 0.178, tf: 1.43, tr: 1.46,
  body: {
    yb: [[-1.91, 0.2], [-1.7, 0.15], [-1.2, 0.13], [0, 0.12], [1.2, 0.13], [1.6, 0.18], [1.8, 0.28]],
    yh: [[-1.91, 0.44], [-1.7, 0.56], [-1.3, 0.67], [-1.09, 0.7], [-0.7, 0.67], [0, 0.68], [0.7, 0.72], [1.09, 0.74], [1.5, 0.74], [1.8, 0.72]],
    yt: [[-1.91, 0.44], [-1.7, 0.52], [-1.3, 0.6], [-0.9, 0.64], [-0.6, 0.66], [0.5, 0.72], [1.2, 0.74], [1.8, 0.72]],
    w: [[-1.91, 0.66], [-1.7, 0.8], [-1.2, 0.86], [-0.6, 0.86], [0.3, 0.86], [1.09, 0.875], [1.5, 0.86], [1.8, 0.8]],
    kw: 0.45, tuck: 0.07, tumble: 0.07, sr: 0.06, crease: 40,
    rndF: { z: 0.2, x: 0.14, t: 0.04, b: 0.03 }, rndR: { z: 0.06, x: 0.04, t: 0.01, b: 0.02 },
  },
  arch: { dy: 0.015, top: 0.05, side: 0.06, p: 2.2 },
  gh: {
    z0: -1.0, z1: 0.92,
    roof: [[-1.0, 0.66], [-0.75, 0.82], [-0.5, 0.96], [-0.25, 1.05], [0.05, 1.1], [0.35, 1.1], [0.6, 1.06], [0.8, 1.0], [0.92, 0.96]],
    wb: [[-1.0, 0.8], [-0.3, 0.8], [0.3, 0.76], [0.92, 0.7]],
    wt: [[-1.0, 0.74], [-0.3, 0.62], [0.3, 0.58], [0.92, 0.56]],
    rc: 0.09, crown: 0.05, bulge: 0.02,
    ws: [-1.0, -0.22], rear: [0.58, 0.92], side: [[-0.9, 0.25]],
    pillarFin: FIN.black,
    // wraparound visor: the screen curls round into the side glass
    mat: (q) => (q.tag === 'corner' && q.z < -0.22 ? FIN.glass : undefined),
  },
  seatDZ: 0.72,
  features: (ctx) => {
    const P = ctx.P;
    popups(ctx, -1.7, -1.45, 0.4, 0.7);
    patch(ctx, '-z', rrect(-0.5, 0.22, 0.5, 0.3, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? rrect(0.52, 0.3, 0.72, 0.35, 0.01) : rrect(-0.72, 0.3, -0.52, 0.35, 0.01), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    lampPodBar(ctx, -1.55, 4, 0.33);
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.22, section(P, -1.55).yt + 0.075, -1.63), new THREE.Vector3(0.22, section(P, -1.55).yt + 0.075, -1.63));
    plate(ctx, 'F', { y: 0.26, idx: 3 });
    // roof spoiler, louvred engine lid, twin round tails
    const G = P.gh, zr = 0.86, yr = G.roof(zr);
    tube(ctx, [-0.56, 0, 0.56].map((x) => [x, yr - G.crown * sq(x / G.wt(zr)) + 0.02, zr]), [[-0.08, -0.015], [0.08, -0.012], [0.09, 0.006], [-0.08, 0.01]], FIN.black, { up: () => [0, 1, 0], crease: 40 });
    patch(ctx, '+y', [[-0.5, 1.0], [0.5, 1.0], [0.5, 1.62], [-0.5, 1.62]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    patch(ctx, '+z', rrect(-0.8, 0.44, 0.8, 0.66, 0.03), FIN.black, { off: 0.004 });
    for (const s of [-1, 1]) for (const x of [0.5, 0.68]) roundLamp(ctx, '+z', s * x, 0.55, 0.065, 0xd4000c, LAMP.TAIL, undefined, { bezel: FIN.black });
    plate(ctx, 'R', { y: 0.34, idx: 3 });
    exhausts(ctx, [{ x: 0, y: 0.26, r: 0.045 }]);
    rallyDecals(ctx, -0.35, 0.44, null);
    doorSeams(ctx, -0.95, null, null, 0.66, { yb: 0.2 });
    bothSides(ctx, (dir) => seam(ctx, dir, [[0.3, 0.2], [0.35, 0.7]]));
    mirrors(ctx, { z: -0.78, y: 0.8, fin: FIN.black, len: 0.14, h: 0.08 });
    archTrims(ctx, { fin: FIN.black, width: 0.045, out: 0.02, inner: 0.004 });
    wipers(ctx, { list: [[-0.2, 0.62, 0.02]] });
    interior(ctx, { wheelY: 0.08, dash: 0.3 });
  },
});

// ---- '98 Mutsu Seiun 22R (boxer rally coupe homage): wide flares, hood scoop, gold wheels, tall wing
DEFS.seiun = () => ({
  name: 'Mutsu Seiun 22R', defaultPaint: 0x1d3f9e, wheel: { style: 'mesh10', fin: FIN.gold },
  wb: 2.52, ohF: 0.83, ohR: 1.015, R: 0.32, ww: 0.235, rimR: 0.216, tf: 1.54, tr: 1.55,
  body: {
    yb: [[-2.09, 0.25], [-1.85, 0.17], [-1.4, 0.15], [0, 0.15], [1.4, 0.16], [1.9, 0.22], [2.275, 0.32]],
    yh: [[-2.09, 0.68], [-1.85, 0.74], [-1.4, 0.77], [-0.8, 0.8], [0.2, 0.83], [1.2, 0.86], [1.9, 0.88], [2.275, 0.87]],
    yt: [[-2.09, 0.69], [-1.85, 0.755], [-1.4, 0.79], [-0.8, 0.82], [0.2, 0.845], [1.4, 0.875], [2.0, 0.9], [2.275, 0.89]],
    w: [[-2.09, 0.82], [-1.85, 0.885], [-1.26, 0.915], [-0.72, 0.86], [0.2, 0.86], [0.72, 0.86], [1.26, 0.915], [1.9, 0.885], [2.275, 0.83]],
    kw: 0.43, tuck: 0.05, tumble: 0.035, sr: 0.05, crease: 32, charY: [[-2.0, 0.7], [2.2, 0.78]], charD: 0.006,
    rndF: { z: 0.12, x: 0.08, t: 0.03, b: 0.04 }, rndR: { z: 0.07, x: 0.05, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.055, p: 2.4 },
  gh: {
    z0: -0.78, z1: 1.7,
    roof: [[-0.78, 0.85], [-0.5, 1.02], [-0.2, 1.22], [0.1, 1.35], [0.4, 1.39], [0.85, 1.39], [1.1, 1.36], [1.35, 1.2], [1.55, 1.04], [1.7, 0.96]],
    wb: [[-0.78, 0.76], [0, 0.78], [1.0, 0.78], [1.7, 0.76]],
    wt: [[-0.78, 0.68], [0, 0.64], [1.0, 0.63], [1.7, 0.62]],
    rc: 0.05, crown: 0.02,
    ws: [-0.78, 0.1], rear: [1.12, 1.68], side: [[-0.58, 0.6], [0.66, 1.15]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.4, 0.62], [0.76, 0.63], [0.84, 0.66], [0.82, 0.71], [0.42, 0.7]], hg: 0.01, housing: FIN.darkChrome });
    grille(ctx, { poly: [[-0.3, 0.6], [0.3, 0.6], [0.36, 0.66], [0.3, 0.72], [-0.3, 0.72], [-0.36, 0.66]], tex: 'HONEY', surround: FIN.chrome, sw: 0.01 });
    badge(ctx, '-z', 0, 0.66, 0.03);
    patch(ctx, '-z', [[-0.5, 0.28], [0.5, 0.28], [0.54, 0.44], [-0.54, 0.44]], tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    for (const s of [-1, 1]) roundLamp(ctx, '-z', s * 0.7, 0.4, 0.06, 0xffffff, LAMP.DRL, 'HEADR', { off: 0.008, bezel: FIN.black });
    plate(ctx, 'F', { y: 0.5, idx: 0 });
    const zs = -1.35, ys = section(P, zs).yt;
    rbox(ctx, FIN.paint, 0, ys + 0.03, zs, 0.62, 0.07, 0.6, 0.025);
    box(ctx, FIN.black, 0, ys + 0.035, zs - 0.301, 0.52, 0.045, 0.006);
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? rrect(0.42, 0.7, 0.84, 0.82, 0.015) : rrect(-0.84, 0.7, -0.42, 0.82, 0.015), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? ell(0.52, 0.76, 0.04, 0.04, 12) : ell(-0.52, 0.76, 0.04, 0.04, 12), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    }
    plate(ctx, 'R', { y: 0.58, idx: 0 });
    grille(ctx, { poly: [[-0.7, 0.26], [0.7, 0.26], [0.72, 0.36], [-0.72, 0.36]], dir: '+z', fin: FIN.black });
    exhausts(ctx, [{ x: 0.52, y: 0.27, r: 0.052 }]);
    const zw = 2.08, yw = section(P, zw).yt;
    tube(ctx, [[-0.8, yw + 0.22, zw], [0, yw + 0.23, zw], [0.8, yw + 0.22, zw]], [[-0.012, -0.13], [0.018, 0.05], [0.006, 0.13], [-0.014, 0.07]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) { box(ctx, FIN.paint, s * 0.8, yw + 0.2, zw, 0.012, 0.08, 0.28); box(ctx, FIN.paint, s * 0.55, yw + 0.11, zw + 0.02, 0.03, 0.21, 0.12); }
    doorSeams(ctx, -0.74, null, 0.7, 0.84, { yb: 0.24 });
    seam(ctx, '+y', [[-0.72, -1.88], [0.72, -1.88]]);
    seam(ctx, '+y', [[-0.72, 1.8], [0.72, 1.8]]);
    mirrors(ctx, { z: -0.58, y: 0.92, fin: FIN.paint, len: 0.16, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.06, out: 0.03, inner: 0.004 });
    handles(ctx, [[0.36, 0.84]], FIN.paint);
    wipers(ctx, { list: [[-0.4, 0.52, 0.05], [0.18, 0.48, 0.09]] });
    interior(ctx, { rearSeat: 1.0, wheelY: 0.13 });
  },
});

// diffuser fins + panel under the tail
function diffuser(ctx, w = 0.7, n = 5, y = 0.16, d = 0.4) { return tagged(ctx, () => ({ k: 'diffuser', w, n, y, d }), () => diffuser_(ctx, w, n, y, d)); }
function diffuser_(ctx, w = 0.7, n = 5, y = 0.16, d = 0.4) {
  const P = ctx.P;
  box(ctx, FIN.graphite, 0, y, P.zR - d / 2, w * 2, 0.018, d, -0.28, 0, 0);
  for (let i = 0; i < n; i++) { const x = -w + 0.08 + (2 * (w - 0.08) * i) / (n - 1); box(ctx, FIN.graphite, x, y + 0.06, P.zR - d / 2 + 0.02, 0.012, 0.14, d * 0.9, -0.28, 0, 0); }
}
// thin chrome/black line following a (z, y) polyline on both flanks (C-lines, sill blades)
function flankLine(ctx, line, w, fin) { bothSides(ctx, (dir) => seam(ctx, dir, line, { w, fin, step: 0.04, off: 0.006 })); }

// ---- '76 Toro Contessa 400 (70s wedge homage): knife-edge wedge, one-plane screen, NACA doors, rear air boxes
DEFS.contessa = () => ({
  name: 'Toro Contessa 400', defaultPaint: 0xd8231d, wheel: { style: 'aero', fin: FIN.silver },
  wb: 2.45, ohF: 0.95, ohR: 0.74, R: 0.31, ww: 0.215, wwR: 0.245, rimR: 0.19, tf: 1.5, tr: 1.52,
  body: {
    yb: [[-2.175, 0.16], [-1.9, 0.13], [-1.3, 0.12], [0, 0.11], [1.3, 0.12], [1.8, 0.17], [1.965, 0.26]],
    yh: [[-2.175, 0.4], [-1.9, 0.5], [-1.5, 0.63], [-1.225, 0.7], [-0.9, 0.66], [-0.5, 0.64], [0.3, 0.68], [1.225, 0.72], [1.7, 0.72], [1.965, 0.7]],
    yt: [[-2.175, 0.4], [-1.9, 0.46], [-1.5, 0.53], [-1.0, 0.6], [-0.7, 0.64], [0.5, 0.7], [1.3, 0.72], [1.965, 0.71]],
    w: [[-2.175, 0.72], [-1.95, 0.86], [-1.5, 0.9], [-1.225, 0.91], [-0.6, 0.9], [0.3, 0.92], [1.225, 0.945], [1.7, 0.93], [1.965, 0.9]],
    kw: 0.45, tuck: 0.1, tumble: 0.1, sr: 0.02, crease: 22,
    rndF: { z: 0.05, x: 0.05, t: 0.01, b: 0.02 }, rndR: { z: 0.04, x: 0.03, t: 0.01, b: 0.02 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 3.2 },
  gh: {
    z0: -1.05, z1: 1.22,
    roof: [[-1.05, 0.63], [-0.7, 0.78], [-0.35, 0.93], [0, 1.05], [0.3, 1.07], [0.65, 1.07], [0.9, 1.02], [1.1, 0.9], [1.22, 0.8]],
    wb: [[-1.05, 0.84], [-0.4, 0.84], [0.4, 0.84], [1.22, 0.84]],
    wt: [[-1.05, 0.74], [-0.4, 0.62], [0.3, 0.58], [1.22, 0.62]],
    rc: 0.02, crown: 0.015, bulge: 0.0,
    ws: [-1.05, 0.02], rear: [0.66, 0.95], side: [[-0.8, 0.12], [0.18, 0.6]],
    pillarFin: FIN.paint,
  },
  seatDZ: 0.85,
  features: (ctx) => {
    const P = ctx.P;
    popups(ctx, -1.85, -1.58, 0.36, 0.76);
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? rrect(0.52, 0.3, 0.74, 0.36, 0.01) : rrect(-0.74, 0.3, -0.52, 0.36, 0.01), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
      patch(ctx, '-z', s > 0 ? rrect(0.3, 0.3, 0.48, 0.34, 0.01) : rrect(-0.48, 0.3, -0.3, 0.34, 0.01), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    patch(ctx, '-z', rrect(-0.26, 0.26, 0.26, 0.34, 0.01), tx(FIN.grille, 'SLATS'), { off: 0.006 });
    badge(ctx, '+y', 0, -2.0, 0.03);
    plate(ctx, 'F', { y: 0.22, idx: 3 });
    // NACA ducts on the doors + rear shoulder air boxes
    bothSides(ctx, (dir) => patch(ctx, dir, [[-0.2, 0.52], [0.5, 0.54], [0.5, 0.6], [0.1, 0.6]], FIN.black, { off: 0.005 }));
    for (const s of [-1, 1]) { rbox(ctx, FIN.paint, s * 0.66, 0.84, 0.68, 0.3, 0.2, 0.42, 0.02); box(ctx, FIN.black, s * 0.66, 0.86, 0.469, 0.24, 0.12, 0.006); }
    patch(ctx, '+y', [[-0.5, 1.15], [0.5, 1.15], [0.5, 1.8], [-0.5, 1.8]], tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    // tail: black panel, rectangular lamp clusters, quad pipes
    patch(ctx, '+z', rrect(-0.86, 0.36, 0.86, 0.66, 0.01), FIN.black, { off: 0.004 });
    for (const s of [-1, 1]) for (const [x, c, L] of [[0.72, 0xd4000c, LAMP.TAIL], [0.56, 0xffa21a, LAMP.NONE], [0.4, 0xf4f6ff, LAMP.REV]]) patch(ctx, '+z', rrect(s * x - 0.07, 0.5, s * x + 0.07, 0.62, 0.008), Lf(c, L), { off: 0.009 });
    plate(ctx, 'R', { y: 0.44, idx: 3 });
    exhausts(ctx, [{ x: -0.36, y: 0.24, r: 0.035 }, { x: -0.26, y: 0.24, r: 0.035 }, { x: 0.26, y: 0.24, r: 0.035 }, { x: 0.36, y: 0.24, r: 0.035 }]);
    doorSeams(ctx, -0.98, null, 0.62, 0.64, { yb: 0.2, rearKick: 0.02 });
    mirrors(ctx, { z: -0.84, y: 0.74, fin: FIN.paint, len: 0.14, h: 0.08 });
    archTrims(ctx, { fin: FIN.black, width: 0.03, out: 0.012, inner: 0.004 });
    wipers(ctx, { list: [[-0.2, 0.7, 0.02]] });
    interior(ctx, { wheelY: 0.08, dash: 0.3 });
  },
});

// ---- '89 Rossetti Tempesta (twin-turbo V8 homage): louvred lexan engine cover, full-width wing, NACA ducts, triple pipes
DEFS.tempesta = () => ({
  name: 'Rossetti Tempesta', defaultPaint: 0xc8141a, wheel: { style: 'y5', fin: FIN.alu },
  wb: 2.45, ohF: 1.05, ohR: 0.86, R: 0.33, ww: 0.245, wwR: 0.32, rimR: 0.216, tf: 1.59, tr: 1.61,
  body: {
    yb: [[-2.275, 0.17], [-2.0, 0.12], [-1.4, 0.11], [0, 0.1], [1.4, 0.11], [1.9, 0.16], [2.085, 0.26]],
    yh: [[-2.275, 0.44], [-2.0, 0.56], [-1.6, 0.68], [-1.225, 0.74], [-0.8, 0.68], [-0.3, 0.64], [0.4, 0.7], [1.225, 0.76], [1.8, 0.76], [2.085, 0.74]],
    yt: [[-2.275, 0.44], [-2.0, 0.52], [-1.5, 0.58], [-1.0, 0.62], [-0.6, 0.64], [0.5, 0.72], [1.4, 0.76], [2.085, 0.75]],
    w: [[-2.275, 0.8], [-2.0, 0.92], [-1.5, 0.96], [-1.225, 0.975], [-0.5, 0.95], [0.4, 0.965], [1.225, 0.99], [1.8, 0.975], [2.085, 0.93]],
    kw: 0.45, tuck: 0.1, tumble: 0.08, sr: 0.04, crease: 30,
    rndF: { z: 0.12, x: 0.1, t: 0.03, b: 0.03 }, rndR: { z: 0.04, x: 0.03, t: 0.01, b: 0.02 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.6 },
  gh: {
    z0: -1.05, z1: 1.9,
    roof: [[-1.05, 0.64], [-0.75, 0.8], [-0.45, 0.94], [-0.15, 1.05], [0.15, 1.11], [0.45, 1.11], [0.75, 1.07], [1.1, 0.97], [1.5, 0.87], [1.9, 0.8]],
    wb: [[-1.05, 0.82], [-0.3, 0.82], [0.5, 0.8], [1.2, 0.74], [1.9, 0.7]],
    wt: [[-1.05, 0.74], [-0.3, 0.62], [0.4, 0.58], [1.0, 0.54], [1.9, 0.5]],
    rc: 0.07, crown: 0.04,
    ws: [-1.05, -0.05], rear: [0.55, 1.9], side: [[-0.85, 0.45]],
    pillarFin: FIN.paint,
  },
  seatDZ: 0.85,
  features: (ctx) => {
    const P = ctx.P;
    // clear-covered lamp bays on the nose + low rectangular lamps
    for (const s of [-1, 1]) {
      patch(ctx, '+y', s > 0 ? rrect(0.46, -2.05, 0.8, -1.82, 0.03) : rrect(-0.8, -2.05, -0.46, -1.82, 0.03), FIN.blackGloss, { off: 0.004 });
      patch(ctx, '+y', s > 0 ? rrect(0.5, -2.02, 0.76, -1.86, 0.02) : rrect(-0.76, -2.02, -0.5, -1.86, 0.02), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.007 });
      const r = patch(ctx, '-z', s > 0 ? rrect(0.54, 0.34, 0.78, 0.4, 0.01) : rrect(-0.78, 0.34, -0.54, 0.4, 0.01), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
    }
    patch(ctx, '-z', rrect(-0.46, 0.22, 0.46, 0.34, 0.02), tx(FIN.grille, 'SLATS'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    patch(ctx, '+y', [[-0.1, -1.6], [0.1, -1.6], [0.16, -1.25], [-0.16, -1.25]], FIN.blackGloss, { off: 0.005 });
    for (const s of [-1, 1]) patch(ctx, '+y', s > 0 ? [[0.3, -1.5], [0.4, -1.5], [0.46, -1.2], [0.32, -1.2]] : mirX([[0.3, -1.5], [0.4, -1.5], [0.46, -1.2], [0.32, -1.2]]), FIN.blackGloss, { off: 0.005 });
    badge(ctx, '-z', 0, 0.38, 0.028);
    plate(ctx, 'F', { y: 0.19, idx: 2 });
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-0.4, 0.46], [0.3, 0.5], [0.3, 0.56], [-0.1, 0.56]], FIN.black, { off: 0.005 }); patch(ctx, dir, [[0.5, 0.42], [0.9, 0.46], [0.9, 0.66], [0.62, 0.64]], tx(FIN.grille, 'HONEY'), { off: 0.005 }); });
    // louvres over the engine cover glass
    for (let i = 0; i < 7; i++) { const z = 0.75 + i * 0.13, y = P.gh.roof(z) - P.gh.crown + 0.012; box(ctx, FIN.black, 0, y, z, 0.9 - i * 0.04, 0.01, 0.05, 0.25, 0, 0); }
    // full-width wing blended into the rear fenders
    const zw = 1.98, yw = section(P, zw).yt + 0.16;
    tube(ctx, [[-0.94, yw - 0.03, zw], [-0.6, yw, zw], [0, yw + 0.005, zw], [0.6, yw, zw], [0.94, yw - 0.03, zw]], [[-0.012, -0.12], [0.018, 0.05], [0.006, 0.12], [-0.014, 0.06]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) box(ctx, FIN.paint, s * 0.93, yw - 0.09, zw, 0.03, 0.14, 0.24);
    patch(ctx, '+z', rrect(-0.86, 0.32, 0.86, 0.64, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.004 });
    for (const s of [-1, 1]) for (const x of [0.58, 0.76]) roundLamp(ctx, '+z', s * x, 0.52, 0.06, 0xd4000c, LAMP.TAIL, undefined, { bezel: FIN.black, off: 0.009 });
    plate(ctx, 'R', { y: 0.4, idx: 2 });
    exhausts(ctx, [{ x: -0.1, y: 0.42, r: 0.04 }, { x: 0, y: 0.42, r: 0.04 }, { x: 0.1, y: 0.42, r: 0.04 }]);
    doorSeams(ctx, -0.98, null, 0.46, 0.66, { yb: 0.18, rearKick: 0.04 });
    mirrors(ctx, { z: -0.84, y: 0.76, fin: FIN.paint, len: 0.15, h: 0.08 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    wipers(ctx, { list: [[-0.22, 0.66, 0.02]] });
    interior(ctx, { wheelY: 0.08, dash: 0.3 });
  },
});

// ---- '18 Rossetti Stradale V12 (front-mid V12 GT homage): long bonnet, swept slim lamps, big mouth, quad round tails
DEFS.stradale = () => ({
  name: 'Rossetti Stradale V12', defaultPaint: 0xa3121b, wheel: { style: 'split5', fin: FIN.graphite },
  wb: 2.72, ohF: 1.0, ohR: 0.94, R: 0.35, ww: 0.275, wwR: 0.315, rimR: 0.254, tf: 1.67, tr: 1.63,
  body: {
    yb: [[-2.36, 0.24], [-2.1, 0.15], [-1.6, 0.13], [0, 0.12], [1.6, 0.13], [2.05, 0.19], [2.3, 0.3]],
    yh: [[-2.36, 0.6], [-2.1, 0.68], [-1.6, 0.76], [-1.36, 0.785], [-0.7, 0.76], [0.2, 0.78], [1.36, 0.84], [1.9, 0.85], [2.3, 0.82]],
    yt: [[-2.36, 0.6], [-2.05, 0.69], [-1.5, 0.75], [-0.9, 0.79], [-0.4, 0.8], [0.8, 0.82], [1.8, 0.85], [2.3, 0.83]],
    w: [[-2.36, 0.78], [-2.1, 0.92], [-1.6, 0.975], [-1.36, 0.99], [-0.6, 0.95], [0.4, 0.955], [1.36, 0.995], [1.9, 0.96], [2.3, 0.88]],
    kw: 0.45, tuck: 0.09, tumble: 0.07, sr: 0.08, crease: 44, charY: [[-2.2, 0.45], [-0.5, 0.52], [1.0, 0.6], [2.2, 0.62]], charD: 0.008,
    rndF: { z: 0.24, x: 0.16, t: 0.06, b: 0.05 }, rndR: { z: 0.12, x: 0.08, t: 0.03, b: 0.04 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.3 },
  gh: {
    z0: -0.85, z1: 2.05,
    roof: [[-0.85, 0.8], [-0.6, 0.93], [-0.3, 1.1], [0, 1.21], [0.3, 1.26], [0.65, 1.25], [1.0, 1.18], [1.4, 1.06], [1.75, 0.95], [2.05, 0.88]],
    wb: [[-0.85, 0.8], [0, 0.82], [1.0, 0.8], [2.05, 0.72]],
    wt: [[-0.85, 0.72], [0, 0.65], [0.7, 0.62], [1.4, 0.56], [2.05, 0.52]],
    rc: 0.08, crown: 0.04,
    ws: [-0.85, 0.1], rear: [1.0, 1.92], side: [[-0.65, 0.7]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.5, 0.6], [0.86, 0.585], [0.93, 0.62], [0.9, 0.645], [0.56, 0.64]], hg: 0.008, housing: FIN.blackGloss, drl: [[0.54, 0.61], [0.88, 0.596], [0.89, 0.606], [0.55, 0.62]] });
    grille(ctx, { poly: rrect(-0.62, 0.22, 0.62, 0.44, 0.06), tex: 'HONEY', fin: FIN.grille, surround: FIN.blackGloss, sw: 0.016 });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? [[0.66, 0.26], [0.86, 0.3], [0.84, 0.46], [0.68, 0.44]] : mirX([[0.66, 0.26], [0.86, 0.3], [0.84, 0.46], [0.68, 0.44]]), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    badge(ctx, '+y', 0, -2.2, 0.032);
    plate(ctx, 'F', { y: 0.33, idx: 1 });
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.3 - 0.13, -1.75, s * 0.3 + 0.13, -1.45, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    bothSides(ctx, (dir) => patch(ctx, dir, [[-1.0, 0.46], [-0.86, 0.48], [-0.86, 0.64], [-1.0, 0.6]], FIN.blackGloss, { off: 0.005 }));
    patch(ctx, '+z', rrect(-0.84, 0.64, 0.84, 0.8, 0.03), FIN.paint, { off: 0.002 });
    for (const s of [-1, 1]) for (const x of [0.52, 0.72]) roundLamp(ctx, '+z', s * x, 0.72, 0.058, 0xd4000c, LAMP.TAIL, undefined, { bezel: FIN.blackGloss });
    const zs = 2.2, ys = section(P, zs).yt;
    tube(ctx, [[-0.7, ys + 0.004, zs], [0, ys + 0.01, zs], [0.7, ys + 0.004, zs]], [[-0.08, -0.012], [0.05, 0.02], [0.08, 0.018], [0.04, -0.016]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    diffuser(ctx, 0.72, 5, 0.16, 0.4);
    plate(ctx, 'R', { y: 0.5, idx: 1 });
    exhausts(ctx, [{ x: -0.62, y: 0.32, r: 0.045 }, { x: -0.5, y: 0.32, r: 0.045 }, { x: 0.5, y: 0.32, r: 0.045 }, { x: 0.62, y: 0.32, r: 0.045 }]);
    doorSeams(ctx, -0.8, null, 0.76, 0.82, { yb: 0.2 });
    seam(ctx, '+y', [[-0.72, -2.15], [0.72, -2.15]]);
    mirrors(ctx, { z: -0.62, y: 0.86, fin: FIN.paint, len: 0.18, h: 0.09 });
    archTrims(ctx, { fin: FIN.paint, width: 0.035, out: 0.01, inner: 0.004 });
    handles(ctx, [[0.42, 0.8]], FIN.blackGloss, { flush: true, flushFin: FIN.chrome });
    wipers(ctx, { list: [[-0.4, 0.55, 0.05], [0.18, 0.5, 0.08]] });
    interior(ctx, { wheelY: 0.1 });
  },
});

// ---- '94 Merrick F-Uno (three-seat V12 hypercar homage): bubble canopy, roof snorkel, dihedral doors, big side intakes
DEFS.funo = () => ({
  name: 'Merrick F-Uno', defaultPaint: 0x9aa4a8, wheel: { style: 'split5', fin: FIN.alu },
  wb: 2.72, ohF: 0.9, ohR: 0.67, R: 0.32, ww: 0.235, wwR: 0.315, rimR: 0.216, tf: 1.57, tr: 1.47,
  body: {
    yb: [[-2.26, 0.18], [-2.0, 0.13], [-1.5, 0.12], [0, 0.11], [1.5, 0.12], [1.85, 0.17], [2.03, 0.26]],
    yh: [[-2.26, 0.42], [-2.0, 0.54], [-1.6, 0.66], [-1.36, 0.72], [-0.9, 0.66], [-0.4, 0.62], [0.4, 0.7], [1.36, 0.76], [1.8, 0.75], [2.03, 0.72]],
    yt: [[-2.26, 0.42], [-2.0, 0.5], [-1.5, 0.57], [-1.0, 0.61], [-0.6, 0.64], [0.5, 0.72], [1.4, 0.76], [2.03, 0.73]],
    w: [[-2.26, 0.7], [-2.0, 0.84], [-1.5, 0.9], [-1.36, 0.91], [-0.6, 0.88], [0.4, 0.89], [1.36, 0.91], [1.8, 0.89], [2.03, 0.84]],
    kw: 0.45, tuck: 0.09, tumble: 0.08, sr: 0.07, crease: 42,
    rndF: { z: 0.22, x: 0.16, t: 0.05, b: 0.03 }, rndR: { z: 0.1, x: 0.07, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.2 },
  gh: {
    z0: -1.1, z1: 1.2,
    roof: [[-1.1, 0.62], [-0.8, 0.8], [-0.5, 0.95], [-0.2, 1.07], [0.1, 1.13], [0.4, 1.14], [0.7, 1.1], [0.95, 1.0], [1.2, 0.86]],
    wb: [[-1.1, 0.8], [-0.3, 0.8], [0.4, 0.78], [1.2, 0.7]],
    wt: [[-1.1, 0.7], [-0.3, 0.55], [0.4, 0.5], [1.2, 0.46]],
    rc: 0.12, crown: 0.07, bulge: 0.03,
    ws: [-1.1, 0.0], rear: [0.75, 1.05], side: [[-0.9, 0.45]],
    pillarFin: FIN.black,
  },
  seat: [0, 0.82, 0.05],
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      patch(ctx, '-z', s > 0 ? rrect(0.44, 0.4, 0.76, 0.5, 0.03) : rrect(-0.76, 0.4, -0.44, 0.5, 0.03), FIN.blackGloss, { off: 0.005 });
      for (const x of [0.5, 0.58, 0.66]) patch(ctx, '-z', ell(s * x, 0.45, 0.028, 0.028, 12), Lf(0xffffff, LAMP.HEAD, 'HEADR'), { off: 0.008 });
      patch(ctx, '-z', ell(s * 0.72, 0.45, 0.022, 0.022, 10), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.58, 0.45, P.zF + 0.1), new THREE.Vector3(0.58, 0.45, P.zF + 0.1));
    patch(ctx, '-z', rrect(-0.36, 0.22, 0.36, 0.34, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    badge(ctx, '+y', 0, -2.05, 0.03);
    // roof snorkel intake
    const zr = 0.45, yr = P.gh.roof(zr);
    rbox(ctx, FIN.paint, 0, yr + 0.05, zr + 0.3, 0.26, 0.11, 0.75, 0.04);
    box(ctx, FIN.black, 0, yr + 0.06, zr - 0.071, 0.2, 0.07, 0.006);
    bothSides(ctx, (dir) => patch(ctx, dir, [[0.28, 0.3], [0.95, 0.34], [0.95, 0.66], [0.5, 0.62]], tx(FIN.grille, 'HONEY'), { off: 0.005, depth: 0.012, wallFin: FIN.black }));
    patch(ctx, '+z', rrect(-0.8, 0.3, 0.8, 0.64, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.004 });
    for (const s of [-1, 1]) for (const x of [0.46, 0.58, 0.7]) patch(ctx, '+z', ell(s * x, 0.56, 0.04, 0.04, 14), Lf(x === 0.46 ? 0xf4f6ff : 0xd4000c, x === 0.46 ? LAMP.REV : LAMP.TAIL), { off: 0.008 });
    const zf = 1.9, yf = section(P, zf).yt;
    tube(ctx, [[-0.62, yf + 0.03, zf], [0, yf + 0.035, zf], [0.62, yf + 0.03, zf]], [[-0.01, -0.07], [0.012, 0.03], [0.004, 0.07], [-0.01, 0.03]], FIN.paint, { up: () => [0, 0, 1], crease: 35 });
    plate(ctx, 'R', { y: 0.4, idx: 1 });
    exhausts(ctx, [{ x: 0, y: 0.36, r: 0.05 }]);
    diffuser(ctx, 0.6, 4, 0.14, 0.34);
    bothSides(ctx, (dir) => { seam(ctx, dir, [[-1.0, 0.22], [-1.02, 0.55], [-0.9, 0.72]]); seam(ctx, dir, [[0.25, 0.22], [0.27, 0.72]]); });
    mirrors(ctx, { z: -0.9, y: 0.74, fin: FIN.paint, len: 0.16, h: 0.08 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    wipers(ctx, { list: [[-0.1, 0.66, 0.0]] });
    // central driving position, two passenger seats set back either side
    ctx.noBounds = true;
    const y0 = section(P, 0).topY(0.3);
    rbox(ctx, FIN.seat, 0, y0 - 0.1, 0.05, 0.42, 0.44, 0.12, 0.04, 0.2, 0, 0);
    for (const s of [-1, 1]) rbox(ctx, FIN.seat, s * 0.46, y0 - 0.14, 0.32, 0.38, 0.38, 0.12, 0.04, 0.2, 0, 0);
    box(ctx, FIN.dash, 0, y0 - 0.02, -0.72, 1.3, 0.12, 0.3);
    addGeo(ctx, TOR(), FIN.dash, M(0, y0 + 0.02, -0.4, -0.5, 0, 0, 0.17, 0.17, 0.17));
    ctx.noBounds = false;
  },
});

// ---- '20 Kronvall Aska (1600 hp megacar homage): wide low wedge, huge splitter, boomerang wing on swan necks, diffuser
DEFS.aska = () => ({
  name: 'Kronvall Aska', defaultPaint: 0xf4f4f2, wheel: { style: 'y5', fin: FIN.graphite },
  wb: 2.7, ohF: 1.08, ohR: 0.83, R: 0.35, ww: 0.275, wwR: 0.335, rimR: 0.267, tf: 1.7, tr: 1.65,
  body: {
    yb: [[-2.43, 0.14], [-2.2, 0.1], [-1.6, 0.09], [0, 0.09], [1.6, 0.1], [2.0, 0.15], [2.18, 0.24]],
    yh: [[-2.43, 0.38], [-2.2, 0.52], [-1.8, 0.67], [-1.35, 0.78], [-0.9, 0.7], [-0.4, 0.64], [0.4, 0.7], [1.35, 0.8], [1.9, 0.78], [2.18, 0.74]],
    yt: [[-2.43, 0.38], [-2.2, 0.46], [-1.7, 0.54], [-1.1, 0.6], [-0.6, 0.63], [0.5, 0.72], [1.4, 0.77], [2.18, 0.74]],
    w: [[-2.43, 0.8], [-2.2, 0.95], [-1.7, 1.0], [-1.35, 1.015], [-0.6, 0.96], [0.4, 0.98], [1.35, 1.02], [1.9, 1.0], [2.18, 0.94]],
    kw: 0.45, tuck: 0.12, tumble: 0.08, sr: 0.05, crease: 34, charY: [[-2.3, 0.3], [-0.8, 0.36], [0.6, 0.44], [2.0, 0.52]], charD: 0.012,
    rndF: { z: 0.1, x: 0.1, t: 0.03, b: 0.02 }, rndR: { z: 0.05, x: 0.04, t: 0.01, b: 0.02 },
  },
  arch: { dy: 0.012, top: 0.04, side: 0.06, p: 3.0 },
  gh: {
    z0: -1.15, z1: 1.65,
    roof: [[-1.15, 0.63], [-0.85, 0.8], [-0.55, 0.95], [-0.25, 1.07], [0.05, 1.15], [0.35, 1.17], [0.65, 1.14], [0.95, 1.06], [1.3, 0.93], [1.65, 0.83]],
    wb: [[-1.15, 0.84], [-0.3, 0.84], [0.5, 0.8], [1.65, 0.66]],
    wt: [[-1.15, 0.72], [-0.3, 0.6], [0.4, 0.56], [1.0, 0.5], [1.65, 0.44]],
    rc: 0.08, crown: 0.05, bulge: 0.015,
    ws: [-1.15, -0.1], rear: [0.7, 1.1], side: [[-0.95, 0.5]],
    pillarFin: FIN.blackGloss, roofFin: FIN.graphite,
  },
  seatDZ: 0.85,
  noWing: true,
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.52, 0.5], [0.88, 0.5], [0.95, 0.54], [0.58, 0.56]], hg: 0.008, housing: FIN.blackGloss, drl: [[0.56, 0.507], [0.9, 0.507], [0.91, 0.515], [0.56, 0.516]] });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? [[0.3, 0.18], [0.8, 0.2], [0.86, 0.4], [0.36, 0.38]] : mirX([[0.3, 0.18], [0.8, 0.2], [0.86, 0.4], [0.36, 0.38]]), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.015, wallFin: FIN.black });
    box(ctx, FIN.graphite, 0, 0.07, P.zF + 0.2, 1.86, 0.018, 0.5);
    for (const s of [-1, 1]) box(ctx, FIN.graphite, s * 0.9, 0.3, P.zF + 0.32, 0.16, 0.012, 0.1, 0, 0, s * 0.25);
    for (const s of [-1, 1]) patch(ctx, '+y', rrect(s * 0.34 - 0.15, -1.95, s * 0.34 + 0.15, -1.55, 0.04), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    badge(ctx, '+y', 0, -2.25, 0.028);
    plate(ctx, 'F', { y: 0.3, idx: 0 });
    bothSides(ctx, (dir) => { patch(ctx, dir, [[0.3, 0.26], [0.95, 0.3], [0.95, 0.6], [0.55, 0.56]], tx(FIN.grille, 'HONEY'), { off: 0.005, depth: 0.015, wallFin: FIN.black }); patch(ctx, dir, [[-1.2, 0.14], [1.2, 0.14], [1.2, 0.2], [-1.2, 0.2]], FIN.graphite, { off: 0.005, depth: 0.015 }); });
    // boomerang wing on two swan necks rising from the deck
    const zw = 2.05, yw = 1.28;
    tube(ctx, [[-0.98, yw - 0.06, zw + 0.06], [-0.5, yw, zw], [0, yw + 0.02, zw - 0.02], [0.5, yw, zw], [0.98, yw - 0.06, zw + 0.06]], [[-0.014, -0.17], [0.024, 0.07], [0.008, 0.17], [-0.018, 0.09]], FIN.graphite, { up: () => [0, 0, 1], crease: 30 });
    for (const s of [-1, 1]) { box(ctx, FIN.graphite, s * 0.98, yw - 0.1, zw + 0.06, 0.012, 0.18, 0.4); tube(ctx, [[s * 0.42, yw - 0.02, zw], [s * 0.42, yw - 0.2, zw - 0.1], [s * 0.42, section(P, 1.6).yt + 0.02, 1.62]], [[-0.012, -0.05], [0.012, -0.05], [0.012, 0.05], [-0.012, 0.05]], FIN.graphite, { crease: 50 }); }
    patch(ctx, '+z', [[-0.88, 0.6], [0.88, 0.6], [0.86, 0.64], [-0.86, 0.64]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.007 });
    patch(ctx, '+z', rrect(-0.88, 0.22, 0.88, 0.56, 0.02), tx(FIN.grille, 'HONEY'), { off: 0.004 });
    diffuser(ctx, 0.86, 7, 0.1, 0.55);
    plate(ctx, 'R', { y: 0.46, idx: 0 });
    exhausts(ctx, [{ x: -0.08, y: 0.5, r: 0.04 }, { x: 0.08, y: 0.5, r: 0.04 }, { x: 0, y: 0.58, r: 0.04 }]);
    doorSeams(ctx, -1.08, null, 0.28, 0.66, { yb: 0.2, rearKick: 0.05 });
    mirrors(ctx, { z: -0.94, y: 0.76, fin: FIN.graphite, len: 0.16, h: 0.07 });
    archTrims(ctx, { fin: FIN.graphite, width: 0.03, out: 0.01, inner: 0.004 });
    wipers(ctx, { list: [[-0.2, 0.68, 0.02]] });
    interior(ctx, { wheelY: 0.08, dash: 0.3 });
  },
});

// ---- '21 Moreau Célérité (W16 quad-turbo homage): horseshoe grille, C-line, roof spine, full-width LED tail
DEFS.celerite = () => ({
  name: 'Moreau Célérité', defaultPaint: 0x1b2e5c, defaultPaint2: 0x0d0f14, wheel: { style: 'multi6', fin: FIN.graphite },
  wb: 2.71, ohF: 1.06, ohR: 0.77, R: 0.36, ww: 0.285, wwR: 0.355, rimR: 0.254, tf: 1.74, tr: 1.67,
  body: {
    yb: [[-2.415, 0.2], [-2.15, 0.14], [-1.6, 0.12], [0, 0.11], [1.6, 0.12], [1.95, 0.17], [2.125, 0.28]],
    yh: [[-2.415, 0.5], [-2.15, 0.62], [-1.7, 0.73], [-1.355, 0.8], [-0.8, 0.72], [-0.2, 0.7], [0.6, 0.75], [1.355, 0.81], [1.9, 0.8], [2.125, 0.78]],
    yt: [[-2.415, 0.5], [-2.15, 0.58], [-1.6, 0.66], [-1.0, 0.7], [-0.5, 0.72], [0.6, 0.76], [1.5, 0.8], [2.125, 0.78]],
    w: [[-2.415, 0.8], [-2.2, 0.95], [-1.7, 1.0], [-1.355, 1.02], [-0.6, 0.98], [0.4, 0.99], [1.355, 1.025], [1.9, 1.0], [2.125, 0.94]],
    kw: 0.45, tuck: 0.1, tumble: 0.08, sr: 0.1, crease: 46,
    rndF: { z: 0.22, x: 0.16, t: 0.05, b: 0.04 }, rndR: { z: 0.08, x: 0.06, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.012, top: 0.04, side: 0.06, p: 2.4 },
  gh: {
    z0: -1.05, z1: 1.9,
    roof: [[-1.05, 0.72], [-0.75, 0.87], [-0.45, 1.02], [-0.15, 1.13], [0.15, 1.18], [0.45, 1.18], [0.75, 1.13], [1.1, 1.03], [1.5, 0.92], [1.9, 0.84]],
    wb: [[-1.05, 0.86], [-0.3, 0.86], [0.5, 0.82], [1.9, 0.7]],
    wt: [[-1.05, 0.74], [-0.3, 0.62], [0.5, 0.58], [1.2, 0.52], [1.9, 0.46]],
    rc: 0.08, crown: 0.045,
    ws: [-1.05, 0.0], rear: [0.8, 1.5], side: [[-0.85, 0.55]],
    pillarFin: FIN.blackGloss, roofFin: FIN.paint2, aFin: FIN.paint2,
  },
  seatDZ: 0.9,
  features: (ctx) => {
    const P = ctx.P;
    const horse = [[-0.18, 0.5], [0.18, 0.5], [0.24, 0.42], [0.24, 0.3], [0.16, 0.22], [-0.16, 0.22], [-0.24, 0.3], [-0.24, 0.42]];
    patch(ctx, '-z', grow(horse, 0.02), FIN.chrome, { off: 0.004, depth: 0.012 });
    patch(ctx, '-z', horse, tx(FIN.grille, 'HONEY'), { off: 0.018 });
    for (const s of [-1, 1]) {
      patch(ctx, '-z', s > 0 ? rrect(0.46, 0.46, 0.9, 0.56, 0.03) : rrect(-0.9, 0.46, -0.46, 0.56, 0.03), FIN.blackGloss, { off: 0.005 });
      for (let i = 0; i < 4; i++) { const x = 0.52 + i * 0.1; patch(ctx, '-z', rrect(s * x - 0.035, 0.49, s * x + 0.035, 0.53, 0.01), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 }); }
      patch(ctx, '-z', s > 0 ? [[0.36, 0.2], [0.86, 0.22], [0.9, 0.4], [0.4, 0.38]] : mirX([[0.36, 0.2], [0.86, 0.22], [0.9, 0.4], [0.4, 0.38]]), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.66, 0.51, P.zF + 0.12), new THREE.Vector3(0.66, 0.51, P.zF + 0.12));
    plate(ctx, 'F', { y: 0.16, idx: 3 });
    // C-line: chrome sweep around the cabin side intake
    flankLine(ctx, [[-0.6, 0.96], [0.2, 0.98], [0.62, 0.94], [0.85, 0.8], [0.9, 0.55], [0.78, 0.34], [0.4, 0.26], [-0.6, 0.24]], 0.035, FIN.chrome);
    bothSides(ctx, (dir) => patch(ctx, dir, [[0.55, 0.36], [0.82, 0.4], [0.84, 0.72], [0.6, 0.78]], tx(FIN.grille, 'HONEY'), { off: 0.005, depth: 0.015, wallFin: FIN.black }));
    // roof spine
    ctx.noBounds = true;
    const sp = []; for (let z = 0.1; z <= 1.8; z += 0.1) sp.push([0, P.gh.roof(z) + 0.004, z]);
    tube(ctx, sp, [[-0.012, 0], [0.012, 0], [0.006, 0.03], [-0.006, 0.03]], FIN.paint2, { crease: 50 });
    ctx.noBounds = false;
    patch(ctx, '+z', [[-0.9, 0.62], [0.9, 0.62], [0.88, 0.66], [-0.88, 0.66]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.007 });
    patch(ctx, '+z', rrect(-0.86, 0.26, 0.86, 0.58, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.004 });
    const zs = 1.98, ys = section(P, zs).yt;
    tube(ctx, [[-0.8, ys + 0.03, zs], [0, ys + 0.035, zs], [0.8, ys + 0.03, zs]], [[-0.01, -0.12], [0.014, 0.05], [0.004, 0.12], [-0.012, 0.05]], FIN.paint2, { up: () => [0, 0, 1], crease: 35 });
    diffuser(ctx, 0.8, 6, 0.14, 0.4);
    plate(ctx, 'R', { y: 0.45, idx: 3 });
    exhausts(ctx, [{ x: -0.09, y: 0.36, r: 0.045 }, { x: 0.09, y: 0.36, r: 0.045 }, { x: -0.09, y: 0.46, r: 0.045 }, { x: 0.09, y: 0.46, r: 0.045 }]);
    doorSeams(ctx, -1.0, null, null, 0.72, { yb: 0.2 });
    mirrors(ctx, { z: -0.86, y: 0.82, fin: FIN.paint2, len: 0.17, h: 0.08 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    wipers(ctx, { list: [[-0.2, 0.7, 0.02]] });
    interior(ctx, { wheelY: 0.08, dash: 0.3 });
  },
});

// ---- '22 Iskra Munja (electric hypercar homage): closed nose, slim lamps, side air channels, full-width tail, no pipes
DEFS.munja = () => ({
  name: 'Iskra Munja', defaultPaint: 0x4a5058, wheel: { style: 'aero', fin: FIN.graphite },
  wb: 2.75, ohF: 1.07, ohR: 0.93, R: 0.36, ww: 0.275, wwR: 0.315, rimR: 0.267, tf: 1.72, tr: 1.68,
  body: {
    yb: [[-2.445, 0.2], [-2.2, 0.13], [-1.6, 0.12], [0, 0.11], [1.6, 0.12], [2.05, 0.17], [2.305, 0.28]],
    yh: [[-2.445, 0.48], [-2.2, 0.6], [-1.7, 0.73], [-1.375, 0.8], [-0.8, 0.72], [-0.2, 0.7], [0.6, 0.75], [1.375, 0.81], [1.9, 0.8], [2.305, 0.77]],
    yt: [[-2.445, 0.48], [-2.2, 0.57], [-1.6, 0.65], [-1.0, 0.7], [-0.5, 0.72], [0.6, 0.76], [1.6, 0.8], [2.305, 0.78]],
    w: [[-2.445, 0.78], [-2.2, 0.94], [-1.7, 0.99], [-1.375, 1.0], [-0.6, 0.96], [0.4, 0.97], [1.375, 1.005], [1.9, 0.98], [2.305, 0.92]],
    kw: 0.45, tuck: 0.1, tumble: 0.08, sr: 0.09, crease: 44, charY: [[-2.3, 0.36], [0, 0.42], [2.2, 0.55]], charD: 0.01,
    rndF: { z: 0.24, x: 0.18, t: 0.06, b: 0.04 }, rndR: { z: 0.08, x: 0.06, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.012, top: 0.04, side: 0.06, p: 2.4 },
  gh: {
    z0: -1.1, z1: 2.0,
    roof: [[-1.1, 0.72], [-0.8, 0.87], [-0.5, 1.02], [-0.2, 1.13], [0.1, 1.19], [0.4, 1.2], [0.7, 1.16], [1.05, 1.07], [1.5, 0.95], [2.0, 0.85]],
    wb: [[-1.1, 0.86], [-0.3, 0.86], [0.5, 0.82], [2.0, 0.72]],
    wt: [[-1.1, 0.74], [-0.3, 0.63], [0.5, 0.59], [1.3, 0.53], [2.0, 0.48]],
    rc: 0.08, crown: 0.045,
    ws: [-1.1, 0.0], rear: [0.9, 1.7], side: [[-0.9, 0.6]],
    pillarFin: FIN.blackGloss,
  },
  seatDZ: 0.9,
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.5, 0.56], [0.86, 0.54], [0.92, 0.575], [0.56, 0.6]], hg: 0.008, housing: FIN.blackGloss, drl: [[0.52, 0.565], [0.88, 0.548], [0.89, 0.556], [0.53, 0.574]] });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? [[0.3, 0.2], [0.78, 0.22], [0.82, 0.38], [0.34, 0.36]] : mirX([[0.3, 0.2], [0.78, 0.22], [0.82, 0.38], [0.34, 0.36]]), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.015, wallFin: FIN.black });
    patch(ctx, '-z', rrect(-0.22, 0.24, 0.22, 0.32, 0.03), FIN.blackGloss, { off: 0.006 });
    badge(ctx, '-z', 0, 0.46, 0.026);
    plate(ctx, 'F', { y: 0.16, idx: 0 });
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-1.0, 0.3], [0.9, 0.38], [0.95, 0.56], [0.4, 0.54], [-0.9, 0.44]], FIN.blackGloss, { off: 0.005 }); });
    patch(ctx, '+z', [[-0.9, 0.64], [0.9, 0.64], [0.88, 0.67], [-0.88, 0.67]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.007 });
    const zs = 2.12, ys = section(P, zs).yt;
    tube(ctx, [[-0.82, ys + 0.03, zs], [0, ys + 0.035, zs], [0.82, ys + 0.03, zs]], [[-0.01, -0.12], [0.014, 0.05], [0.004, 0.12], [-0.012, 0.05]], FIN.graphite, { up: () => [0, 0, 1], crease: 35 });
    diffuser(ctx, 0.84, 7, 0.14, 0.45);
    plate(ctx, 'R', { y: 0.46, idx: 0 });
    doorSeams(ctx, -1.04, null, null, 0.72, { yb: 0.2 });
    mirrors(ctx, { z: -0.9, y: 0.82, fin: FIN.graphite, len: 0.16, h: 0.07 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.35, 0.7]], FIN.blackGloss, { flush: true });
    wipers(ctx, { list: [[-0.2, 0.7, 0.02]] });
    interior(ctx, { wheelY: 0.08, dash: 0.3 });
  },
});

// ---- '21 Schwabe Elektra S (electric sports saloon homage): four-dot lamps, no grille, low fastback, light bar
DEFS.elektra = () => ({
  name: 'Schwabe Elektra S', defaultPaint: 0x3e4f5f, wheel: { style: 'aero', fin: FIN.silver },
  wb: 2.9, ohF: 0.97, ohR: 1.09, R: 0.345, ww: 0.245, wwR: 0.285, rimR: 0.254, tf: 1.7, tr: 1.66,
  body: {
    yb: [[-2.42, 0.24], [-2.15, 0.16], [-1.7, 0.13], [0, 0.12], [1.7, 0.13], [2.2, 0.2], [2.54, 0.32]],
    yh: [[-2.42, 0.56], [-2.15, 0.66], [-1.7, 0.74], [-1.45, 0.77], [-0.8, 0.77], [0.2, 0.8], [1.45, 0.86], [2.1, 0.87], [2.54, 0.84]],
    yt: [[-2.42, 0.56], [-2.15, 0.65], [-1.6, 0.72], [-1.0, 0.77], [-0.5, 0.79], [0.8, 0.83], [1.8, 0.87], [2.54, 0.85]],
    w: [[-2.42, 0.76], [-2.2, 0.9], [-1.7, 0.965], [-1.45, 0.98], [-0.6, 0.95], [0.4, 0.955], [1.45, 0.985], [2.1, 0.96], [2.54, 0.88]],
    kw: 0.45, tuck: 0.08, tumble: 0.06, sr: 0.09, crease: 46,
    rndF: { z: 0.26, x: 0.18, t: 0.06, b: 0.05 }, rndR: { z: 0.14, x: 0.09, t: 0.03, b: 0.04 },
  },
  arch: { dy: 0.015, top: 0.045, side: 0.06, p: 2.3 },
  gh: {
    z0: -0.95, z1: 2.25,
    roof: [[-0.95, 0.8], [-0.65, 0.96], [-0.35, 1.14], [-0.05, 1.28], [0.3, 1.36], [0.7, 1.37], [1.1, 1.32], [1.5, 1.2], [1.9, 1.04], [2.25, 0.92]],
    wb: [[-0.95, 0.8], [0, 0.82], [1.2, 0.8], [2.25, 0.72]],
    wt: [[-0.95, 0.72], [0, 0.66], [0.8, 0.63], [1.5, 0.58], [2.25, 0.52]],
    rc: 0.08, crown: 0.04,
    ws: [-0.95, 0.12], rear: [1.35, 2.15], side: [[-0.75, 0.4], [0.48, 1.3]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      const h = [[0.5, 0.58], [0.84, 0.59], [0.9, 0.63], [0.86, 0.68], [0.54, 0.66]];
      patch(ctx, '-z', s > 0 ? grow(h, 0.012) : mirX(grow(h, 0.012)), FIN.blackGloss, { off: 0.004 });
      for (const [x, y] of [[0.6, 0.605], [0.72, 0.61], [0.6, 0.645], [0.72, 0.65]]) patch(ctx, '-z', rrect(s * x - 0.045, y - 0.014, s * x + 0.045, y + 0.014, 0.01), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.009 });
      patch(ctx, '-z', s > 0 ? [[0.62, 0.26], [0.84, 0.28], [0.84, 0.5], [0.66, 0.48]] : mirX([[0.62, 0.26], [0.84, 0.28], [0.84, 0.5], [0.66, 0.48]]), FIN.blackGloss, { off: 0.006, depth: 0.012 });
    }
    ctx.head.length = 0; ctx.head.push(new THREE.Vector3(-0.66, 0.63, P.zF + 0.14), new THREE.Vector3(0.66, 0.63, P.zF + 0.14));
    patch(ctx, '-z', rrect(-0.5, 0.26, 0.5, 0.36, 0.03), tx(FIN.grille, 'HONEY'), { off: 0.006 });
    badge(ctx, '+y', 0, -2.2, 0.03);
    plate(ctx, 'F', { y: 0.44, idx: 0 });
    patch(ctx, '+z', [[-0.9, 0.78], [0.9, 0.78], [0.88, 0.83], [-0.88, 0.83]], FIN.blackGloss, { off: 0.004 });
    patch(ctx, '+z', [[-0.88, 0.787], [0.88, 0.787], [0.865, 0.822], [-0.865, 0.822]], Lf(0xffffff, LAMP.TAIL, 'TAILBAR'), { off: 0.008 });
    patch(ctx, '+z', rrect(-0.24, 0.7, 0.24, 0.74, 0.01), FIN.chrome, { off: 0.008 });
    for (const s of [-1, 1]) patch(ctx, '+z', s > 0 ? rrect(0.3, 0.44, 0.44, 0.47, 0.01) : rrect(-0.44, 0.44, -0.3, 0.47, 0.01), Lf(0xf4f6ff, LAMP.REV), { off: 0.007 });
    diffuser(ctx, 0.7, 5, 0.18, 0.4);
    plate(ctx, 'R', { y: 0.58, idx: 0 });
    const zs = 2.36, ys = section(P, zs).yt;
    tube(ctx, [[-0.66, ys + 0.004, zs], [0, ys + 0.01, zs], [0.66, ys + 0.004, zs]], [[-0.08, -0.012], [0.05, 0.02], [0.08, 0.018], [0.04, -0.016]], FIN.paint, { up: () => [0, 1, 0], crease: 35 });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.97, 0.24], [-0.99, 0.6], [-0.92, 0.84]]);
      seam(ctx, dir, [[0.46, 0.22], [0.46, 0.9]]);
      seam(ctx, dir, [[1.25, 0.23], [1.24, 0.5], [1.34, 0.7], [1.46, 0.84], [1.5, 0.92]]);
    });
    seam(ctx, '+y', [[-0.72, -2.15], [0.72, -2.15]]);
    mirrors(ctx, { z: -0.7, y: 0.92, fin: FIN.paint, len: 0.18, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.05, 0.84], [1.0, 0.86]], FIN.blackGloss, { flush: true, flushFin: FIN.darkChrome });
    wipers(ctx, { list: [[-0.42, 0.56, 0.05], [0.2, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 1.1, dash: 0.3 });
  },
});

// ---- '65 Motta Piccina (tiny rear-engined city car homage): round body, lamp eyes, chrome moustache, canvas roof
DEFS.piccina = () => ({
  name: 'Motta Piccina', defaultPaint: 0x9fd0c9, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.chrome },
  wb: 1.84, ohF: 0.5, ohR: 0.63, R: 0.26, ww: 0.13, rimR: 0.152, tf: 1.08, tr: 1.1,
  body: {
    yb: [[-1.42, 0.3], [-1.25, 0.22], [-0.95, 0.18], [0, 0.17], [0.9, 0.18], [1.3, 0.24], [1.55, 0.34]],
    yh: [[-1.42, 0.58], [-1.25, 0.66], [-0.92, 0.7], [-0.5, 0.72], [0.2, 0.74], [0.92, 0.74], [1.3, 0.72], [1.55, 0.66]],
    yt: [[-1.42, 0.58], [-1.25, 0.66], [-0.95, 0.72], [-0.6, 0.75], [0.9, 0.76], [1.3, 0.74], [1.55, 0.68]],
    w: [[-1.42, 0.5], [-1.25, 0.6], [-0.92, 0.64], [0, 0.655], [0.92, 0.66], [1.3, 0.63], [1.55, 0.55]],
    kw: 0.45, tuck: 0.08, tumble: 0.08, sr: 0.12, crease: 55,
    rndF: { z: 0.3, x: 0.2, t: 0.12, b: 0.08 }, rndR: { z: 0.3, x: 0.2, t: 0.1, b: 0.08 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.05, p: 2.0 },
  gh: {
    z0: -0.62, z1: 1.15,
    roof: [[-0.62, 0.75], [-0.45, 0.92], [-0.25, 1.1], [-0.05, 1.24], [0.2, 1.31], [0.55, 1.31], [0.8, 1.26], [1.0, 1.12], [1.15, 0.95]],
    wb: [[-0.62, 0.58], [0, 0.6], [0.8, 0.58], [1.15, 0.52]],
    wt: [[-0.62, 0.5], [0, 0.52], [0.8, 0.5], [1.15, 0.44]],
    rc: 0.1, crown: 0.05,
    ws: [-0.62, -0.15], rear: [0.85, 1.12], side: [[-0.45, 0.28], [0.34, 0.82]],
    pillarFin: FIN.paint,
    mat: (q) => (q.tag === 'roof' && q.z > -0.05 && q.z < 0.8 && Math.abs(q.x) < 0.36 ? FIN.black : undefined),
  },
  seatDZ: 0.72,
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      roundLamp(ctx, '-z', s * 0.42, 0.63, 0.065, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.006, depth: 0.02 });
      patch(ctx, '-z', ell(s * 0.44, 0.5, 0.03, 0.02, 10), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    patch(ctx, '-z', [[-0.3, 0.6], [-0.06, 0.63], [0.06, 0.63], [0.3, 0.6], [0.3, 0.615], [0.06, 0.645], [-0.06, 0.645], [-0.3, 0.615]], FIN.chrome, { off: 0.008 });
    badge(ctx, '-z', 0, 0.56, 0.04);
    for (const s of [-1, 1]) cylAB(ctx, FIN.chrome, [s * 0.18, 0.34, P.zF + 0.12], [s * 0.6, 0.34, P.zF + 0.22], 0.015, 8);
    plate(ctx, 'F', { y: 0.4, idx: 2 });
    patch(ctx, '+z', rrect(-0.34, 0.5, 0.34, 0.66, 0.03), tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', rrect(s * 0.48 - 0.035, 0.5, s * 0.48 + 0.035, 0.62, 0.015), Lf(0xd4000c, LAMP.TAIL), { off: 0.008 });
      cylAB(ctx, FIN.chrome, [s * 0.18, 0.36, P.zR - 0.12], [s * 0.6, 0.36, P.zR - 0.22], 0.015, 8);
    }
    plate(ctx, 'R', { y: 0.4, idx: 2 });
    exhausts(ctx, [{ x: -0.3, y: 0.26, r: 0.025, dz: -0.05 }]);
    doorSeams(ctx, -0.55, null, null, 0.72, { yb: 0.26 });
    bothSides(ctx, (dir) => seam(ctx, dir, [[0.36, 0.26], [0.38, 0.72]]));
    beltTrim(ctx, FIN.chrome, -0.45, 0.82, { h: 0.005 });
    mirrors(ctx, { z: -0.45, y: 0.8, fin: FIN.chrome, stalk: FIN.chrome, len: 0.08, h: 0.06, d: 0.06, driverOnly: true });
    handles(ctx, [[0.3, 0.7]], FIN.chrome);
    wipers(ctx, { list: [[-0.26, 0.36, 0.05], [0.1, 0.34, 0.08]] });
    interior(ctx, { rearSeat: 0.72, seatX: 0.3, wheelY: 0.16 });
  },
});

// ---- '65 Pembrook Nipper S (classic mini homage): box on tiny wheels at the corners, flange seams, white roof
DEFS.nipper = () => ({
  name: 'Pembrook Nipper S', defaultPaint: 0x8c1c24, defaultPaint2: 0xefe9dc, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.chrome },
  wb: 2.04, ohF: 0.48, ohR: 0.53, R: 0.26, ww: 0.145, rimR: 0.127, tf: 1.17, tr: 1.16,
  body: {
    yb: [[-1.5, 0.28], [-1.35, 0.2], [-1.0, 0.17], [0, 0.16], [1.0, 0.17], [1.35, 0.21], [1.55, 0.28]],
    yh: [[-1.5, 0.66], [-1.3, 0.72], [-1.0, 0.75], [-0.5, 0.77], [0.3, 0.78], [1.0, 0.78], [1.55, 0.74]],
    yt: [[-1.5, 0.66], [-1.35, 0.72], [-1.0, 0.76], [-0.5, 0.78], [1.0, 0.79], [1.55, 0.76]],
    w: [[-1.5, 0.6], [-1.35, 0.67], [-1.0, 0.69], [0, 0.7], [1.0, 0.7], [1.35, 0.68], [1.55, 0.64]],
    kw: 0.55, tuck: 0.06, tumble: 0.04, sr: 0.06, crease: 38,
    rndF: { z: 0.15, x: 0.1, t: 0.05, b: 0.04 }, rndR: { z: 0.1, x: 0.06, t: 0.03, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.04, p: 2.0 },
  gh: {
    z0: -0.7, z1: 1.3,
    roof: [[-0.7, 0.8], [-0.5, 0.98], [-0.3, 1.16], [-0.15, 1.28], [0.1, 1.34], [1.0, 1.34], [1.2, 1.3], [1.3, 1.1]],
    wb: [[-0.7, 0.63], [0, 0.64], [1.3, 0.62]],
    wt: [[-0.7, 0.6], [0, 0.58], [1.3, 0.56]],
    rc: 0.05, crown: 0.02,
    ws: [-0.7, -0.15], rear: [1.12, 1.3], side: [[-0.5, 0.28], [0.36, 1.02]],
    pillarFin: FIN.paint, roofFin: FIN.paint2,
  },
  seatDZ: 0.8,
  features: (ctx) => {
    const P = ctx.P;
    const mo = [[-0.34, 0.62], [0.34, 0.62], [0.36, 0.52], [0.24, 0.44], [0.1, 0.45], [0, 0.42], [-0.1, 0.45], [-0.24, 0.44], [-0.36, 0.52]];
    patch(ctx, '-z', grow(mo, 0.015), FIN.chrome, { off: 0.004, depth: 0.008 });
    patch(ctx, '-z', mo, tx(FIN.grille, 'SLATS'), { off: 0.014 });
    for (const s of [-1, 1]) {
      roundLamp(ctx, '-z', s * 0.5, 0.6, 0.075, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.006, depth: 0.03 });
      patch(ctx, '-z', ell(s * 0.54, 0.44, 0.03, 0.022, 10), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
      roundLamp(ctx, '-z', s * 0.16, 0.34, 0.05, 0xffffff, LAMP.DRL, 'HEADR', { off: 0.04, depth: 0.02 });
    }
    ctx.head.length = 2;
    bumperBar(ctx, 0.32, P.zF + 0.2, 'F', [[-0.01, -0.025], [0.02, -0.02], [0.03, 0.0], [0.02, 0.02], [-0.01, 0.025]], FIN.chrome, 0.012);
    plate(ctx, 'F', { y: 0.28, idx: 2 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', rrect(s * 0.54 - 0.04, 0.5, s * 0.54 + 0.04, 0.66, 0.012), Lf(0xd4000c, LAMP.TAIL), { off: 0.008 });
      patch(ctx, '+z', rrect(s * 0.54 - 0.03, 0.45, s * 0.54 + 0.03, 0.49, 0.008), Lf(0xffa21a, LAMP.NONE), { off: 0.008 });
    }
    bumperBar(ctx, 0.32, P.zR - 0.2, 'R', [[-0.01, -0.025], [0.02, -0.02], [0.03, 0.0], [0.02, 0.02], [-0.01, 0.025]], FIN.chrome, 0.012);
    plate(ctx, 'R', { y: 0.44, idx: 2 });
    exhausts(ctx, [{ x: 0.3, y: 0.24, r: 0.025 }]);
    // welded flange seams: A/C pillars and along the sills
    bothSides(ctx, (dir) => { seam(ctx, dir, [[-0.72, 0.2], [-0.7, 0.78]], { w: 0.012, fin: FIN.paint }); seam(ctx, dir, [[1.32, 0.22], [1.3, 0.76]], { w: 0.012, fin: FIN.paint }); });
    doorSeams(ctx, -0.62, null, 0.36, 0.76, { yb: 0.24, rearKick: 0.0 });
    beltTrim(ctx, FIN.chrome, -0.5, 1.02, { h: 0.005 });
    mirrors(ctx, { z: -0.95, y: 0.78, fin: FIN.chrome, stalk: FIN.chrome, len: 0.08, h: 0.06, d: 0.06 });
    handles(ctx, [[0.25, 0.72]], FIN.chrome);
    wipers(ctx, { list: [[-0.28, 0.36, 0.04], [0.1, 0.34, 0.06]] });
    interior(ctx, { rearSeat: 0.85, seatX: 0.3, wheelY: 0.18 });
  },
});

// ---- '87 Rochelle Pétard GTi (80s French hot hatch homage): flat bonnet, slim lamps, red pinstripes, arch extensions
DEFS.petard = () => ({
  name: 'Rochelle Pétard GTi', defaultPaint: 0xf4f2ee, wheel: { style: 'split5', fin: FIN.silver },
  wb: 2.42, ohF: 0.65, ohR: 0.63, R: 0.29, ww: 0.185, rimR: 0.19, tf: 1.35, tr: 1.31,
  body: {
    yb: [[-1.86, 0.3], [-1.65, 0.2], [-1.2, 0.17], [0, 0.16], [1.2, 0.17], [1.6, 0.22], [1.84, 0.3]],
    yh: [[-1.86, 0.66], [-1.65, 0.7], [-1.2, 0.74], [-0.6, 0.77], [0.3, 0.8], [1.2, 0.82], [1.84, 0.82]],
    yt: [[-1.86, 0.67], [-1.65, 0.71], [-1.2, 0.75], [-0.6, 0.785], [0.3, 0.81], [1.84, 0.83]],
    w: [[-1.86, 0.72], [-1.65, 0.77], [-1.21, 0.785], [0, 0.78], [1.21, 0.785], [1.65, 0.77], [1.84, 0.73]],
    kw: 0.45, tuck: 0.04, tumble: 0.03, sr: 0.04, crease: 30,
    rndF: { z: 0.08, x: 0.05, t: 0.02, b: 0.03 }, rndR: { z: 0.06, x: 0.04, t: 0.01, b: 0.03 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.05, p: 2.4 },
  gh: {
    z0: -0.78, z1: 1.8,
    roof: [[-0.78, 0.82], [-0.52, 1.0], [-0.26, 1.18], [0, 1.3], [0.3, 1.34], [1.1, 1.34], [1.4, 1.3], [1.6, 1.12], [1.75, 0.95], [1.8, 0.88]],
    wb: [[-0.78, 0.7], [0, 0.72], [1.2, 0.72], [1.8, 0.68]],
    wt: [[-0.78, 0.63], [0, 0.6], [1.2, 0.59], [1.8, 0.56]],
    rc: 0.05, crown: 0.02,
    ws: [-0.78, -0.02], rear: [1.45, 1.78], side: [[-0.6, 0.52], [0.58, 1.2]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.4, 0.6], [0.74, 0.6], [0.75, 0.68], [0.41, 0.68]], hg: 0.008, housing: FIN.black });
    grille(ctx, { poly: [[-0.36, 0.6], [0.36, 0.6], [0.37, 0.68], [-0.37, 0.68]], tex: 'SLATS', fin: FIN.black });
    patch(ctx, '-z', [[-0.36, 0.605], [0.36, 0.605], [0.36, 0.612], [-0.36, 0.612]], FIN.red, { off: 0.01 });
    badge(ctx, '-z', 0, 0.645, 0.03);
    bumperBar(ctx, 0.44, P.zF + 0.3, 'F', [[-0.04, -0.08], [0.05, -0.07], [0.06, 0.06], [-0.04, 0.07]], FIN.black, 0.02);
    patch(ctx, '-z', [[-0.72, 0.47], [0.72, 0.47], [0.72, 0.478], [-0.72, 0.478]], FIN.red, { off: 0.07 });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? rrect(0.5, 0.38, 0.66, 0.43, 0.01) : rrect(-0.66, 0.38, -0.5, 0.43, 0.01), Lf(0xffffff, LAMP.DRL), { off: 0.07 });
    plate(ctx, 'F', { y: 0.36, idx: 1 });
    for (const s of [-1, 1]) {
      patch(ctx, '+z', s > 0 ? rrect(0.4, 0.66, 0.76, 0.78, 0.01) : rrect(-0.76, 0.66, -0.4, 0.78, 0.01), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? rrect(0.4, 0.66, 0.48, 0.7, 0.005) : rrect(-0.48, 0.66, -0.4, 0.7, 0.005), Lf(0xf4f6ff, LAMP.REV), { off: 0.01 });
    }
    patch(ctx, '+z', rrect(-0.38, 0.68, 0.38, 0.76, 0.01), FIN.black, { off: 0.008 });
    bumperBar(ctx, 0.44, P.zR - 0.25, 'R', [[-0.04, -0.08], [0.05, -0.07], [0.06, 0.06], [-0.04, 0.07]], FIN.black, 0.02);
    plate(ctx, 'R', { y: 0.58, idx: 1 });
    exhausts(ctx, [{ x: -0.45, y: 0.26, r: 0.03 }]);
    const G = P.gh, zs = 1.42, ys = G.roof(zs);
    tube(ctx, [-0.54, 0, 0.54].map((x) => [x, ys - G.crown * sq(x / G.wt(zs)) + 0.004, zs - 0.02]), [[-0.06, -0.014], [0.05, -0.014], [0.06, 0.0], [0.04, 0.01], [-0.06, 0.004]], FIN.black, { up: () => [0, 1, 0], crease: 40 });
    bothSides(ctx, (dir) => patch(ctx, dir, [[-1.7, 0.44], [1.7, 0.44], [1.7, 0.448], [-1.7, 0.448]], FIN.red, { off: 0.006 }));
    doorSeams(ctx, -0.74, null, 0.56, 0.78, { yb: 0.24, rearKick: 0.04 });
    seam(ctx, '+y', [[-0.64, -1.72], [0.64, -1.72]]);
    mirrors(ctx, { z: -0.58, y: 0.86, fin: FIN.black, len: 0.13, h: 0.08 });
    archTrims(ctx, { fin: FIN.black, width: 0.05, out: 0.018, inner: 0.004 });
    handles(ctx, [[0.3, 0.76]], FIN.black);
    wipers(ctx, { list: [[-0.36, 0.48, 0.05], [0.14, 0.44, 0.08]] });
    interior(ctx, { rearSeat: 0.95, wheelY: 0.13 });
  },
});

// ---- '21 Heimwagen Gauner R (AWD super hatch homage): LED bar grille, big intakes, roof spoiler, quad pipes
DEFS.gauner = () => ({
  name: 'Heimwagen Gauner R', defaultPaint: 0x2d5fa6, wheel: { style: 'y5', fin: FIN.graphite },
  wb: 2.63, ohF: 0.83, ohR: 0.83, R: 0.33, ww: 0.235, rimR: 0.241, tf: 1.54, tr: 1.51,
  body: {
    yb: [[-2.145, 0.28], [-1.9, 0.19], [-1.5, 0.16], [0, 0.15], [1.5, 0.16], [1.9, 0.22], [2.145, 0.32]],
    yh: [[-2.145, 0.7], [-1.9, 0.77], [-1.4, 0.82], [-0.8, 0.87], [0.3, 0.9], [1.3, 0.92], [2.145, 0.92]],
    yt: [[-2.145, 0.71], [-1.9, 0.79], [-1.4, 0.84], [-0.8, 0.885], [0.3, 0.91], [2.145, 0.93]],
    w: [[-2.145, 0.76], [-1.9, 0.86], [-1.3, 0.895], [0, 0.895], [1.3, 0.905], [1.9, 0.88], [2.145, 0.84]],
    kw: 0.42, tuck: 0.05, tumble: 0.04, sr: 0.06, crease: 36, charY: [[-2.0, 0.72], [0, 0.8], [2.0, 0.86]], charD: 0.007,
    rndF: { z: 0.16, x: 0.1, t: 0.05, b: 0.05 }, rndR: { z: 0.08, x: 0.05, t: 0.02, b: 0.04 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.065, p: 2.4 },
  gh: {
    z0: -0.95, z1: 2.05,
    roof: [[-0.95, 0.9], [-0.65, 1.08], [-0.35, 1.26], [-0.05, 1.4], [0.3, 1.45], [1.1, 1.45], [1.5, 1.43], [1.75, 1.35], [1.9, 1.18], [2.05, 0.98]],
    wb: [[-0.95, 0.8], [0, 0.82], [1.2, 0.82], [2.05, 0.78]],
    wt: [[-0.95, 0.73], [0, 0.68], [1.2, 0.66], [2.05, 0.62]],
    rc: 0.06, crown: 0.03,
    ws: [-0.95, -0.05], rear: [1.72, 2.02], side: [[-0.75, 0.32], [0.42, 1.25], [1.32, 1.62]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.4, 0.64], [0.78, 0.65], [0.86, 0.69], [0.8, 0.72], [0.42, 0.71]], hg: 0.008, housing: FIN.blackGloss, drl: [[0.44, 0.648], [0.78, 0.657], [0.79, 0.666], [0.44, 0.657]] });
    grille(ctx, { poly: [[-0.38, 0.64], [0.38, 0.64], [0.4, 0.71], [-0.4, 0.71]], tex: 'HONEY', fin: FIN.blackGloss });
    patch(ctx, '-z', [[-0.4, 0.645], [0.4, 0.645], [0.4, 0.652], [-0.4, 0.652]], Lf(0xffffff, LAMP.DRL), { off: 0.01 });
    badge(ctx, '-z', 0, 0.675, 0.032);
    patch(ctx, '-z', [[-0.5, 0.26], [0.5, 0.26], [0.54, 0.44], [-0.54, 0.44]], tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.014, wallFin: FIN.black });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? [[0.58, 0.28], [0.82, 0.3], [0.82, 0.5], [0.6, 0.48]] : mirX([[0.58, 0.28], [0.82, 0.3], [0.82, 0.5], [0.6, 0.48]]), tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.012, wallFin: FIN.black });
    plate(ctx, 'F', { y: 0.5, idx: 0 });
    for (const s of [-1, 1]) {
      const t = [[0.46, 0.8], [0.84, 0.8], [0.86, 0.87], [0.5, 0.88]];
      patch(ctx, '+z', s > 0 ? grow(t, 0.01) : mirX(grow(t, 0.01)), FIN.blackGloss, { off: 0.004 });
      patch(ctx, '+z', s > 0 ? t : mirX(t), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
    }
    badge(ctx, '+z', 0, 0.84, 0.035);
    plate(ctx, 'R', { y: 0.64, idx: 0 });
    grille(ctx, { poly: [[-0.72, 0.26], [0.72, 0.26], [0.74, 0.38], [-0.74, 0.38]], dir: '+z', fin: FIN.graphite, tex: 'HONEY' });
    exhausts(ctx, [{ x: -0.62, y: 0.3, r: 0.04 }, { x: -0.52, y: 0.3, r: 0.04 }, { x: 0.52, y: 0.3, r: 0.04 }, { x: 0.62, y: 0.3, r: 0.04 }]);
    const G = P.gh, zs = 1.74, ys = G.roof(zs);
    tube(ctx, [-0.64, 0, 0.64].map((x) => [x, ys - G.crown * sq(x / G.wt(zs)) + 0.004, zs - 0.02]), [[-0.08, -0.018], [0.09, -0.02], [0.1, 0.0], [0.07, 0.012], [-0.08, 0.006]], FIN.blackGloss, { up: () => [0, 1, 0], crease: 40 });
    chmsl(ctx, -0.16, 0.16, ys - 0.03);
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.92, 0.26], [-0.94, 0.62], [-0.88, 0.89]]);
      seam(ctx, dir, [[0.4, 0.25], [0.4, 0.93]]);
      seam(ctx, dir, [[1.3, 0.25], [1.28, 0.55], [1.36, 0.8], [1.34, 0.93]]);
    });
    seam(ctx, '+y', [[-0.7, -1.95], [0.7, -1.95]]);
    mirrors(ctx, { z: -0.72, y: 1.0, fin: FIN.chrome, len: 0.18, h: 0.1 });
    archTrims(ctx, { fin: FIN.paint, width: 0.03, out: 0.008, inner: 0.004 });
    handles(ctx, [[0.0, 0.88], [0.95, 0.9]], FIN.paint);
    wipers(ctx, { list: [[-0.4, 0.55, 0.05], [0.18, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 0.9 });
  },
});

// ---- '19 Ichiban Tora Type-RR (aggressive FWD hot hatch homage): huge tailgate wing, triple centre pipes, vents everywhere
DEFS.tora = () => ({
  name: 'Ichiban Tora Type-RR', defaultPaint: 0xe9e9e6, wheel: { style: 'multi6', fin: FIN.black },
  wb: 2.7, ohF: 0.95, ohR: 0.91, R: 0.335, ww: 0.245, rimR: 0.254, tf: 1.6, tr: 1.59,
  body: {
    yb: [[-2.3, 0.26], [-2.05, 0.17], [-1.6, 0.14], [0, 0.13], [1.6, 0.14], [2.0, 0.2], [2.26, 0.32]],
    yh: [[-2.3, 0.64], [-2.05, 0.72], [-1.6, 0.8], [-1.35, 0.83], [-0.8, 0.84], [0.3, 0.88], [1.35, 0.92], [2.0, 0.93], [2.26, 0.9]],
    yt: [[-2.3, 0.64], [-2.0, 0.73], [-1.5, 0.8], [-0.9, 0.85], [-0.4, 0.87], [0.8, 0.9], [1.8, 0.93], [2.26, 0.91]],
    w: [[-2.3, 0.78], [-2.05, 0.9], [-1.6, 0.94], [-1.35, 0.955], [-0.6, 0.92], [0.4, 0.925], [1.35, 0.96], [2.0, 0.93], [2.26, 0.88]],
    kw: 0.42, tuck: 0.07, tumble: 0.05, sr: 0.05, crease: 32, charY: [[-2.2, 0.66], [0, 0.72], [2.2, 0.82]], charD: 0.01,
    rndF: { z: 0.14, x: 0.1, t: 0.04, b: 0.04 }, rndR: { z: 0.08, x: 0.06, t: 0.02, b: 0.03 },
  },
  arch: { dy: 0.02, top: 0.05, side: 0.065, p: 2.8 },
  gh: {
    z0: -0.95, z1: 2.12,
    roof: [[-0.95, 0.87], [-0.65, 1.03], [-0.35, 1.2], [-0.05, 1.34], [0.3, 1.41], [0.8, 1.42], [1.2, 1.36], [1.6, 1.22], [1.9, 1.08], [2.12, 0.96]],
    wb: [[-0.95, 0.8], [0, 0.82], [1.2, 0.8], [2.12, 0.74]],
    wt: [[-0.95, 0.72], [0, 0.66], [0.9, 0.63], [1.6, 0.58], [2.12, 0.54]],
    rc: 0.06, crown: 0.03,
    ws: [-0.95, 0.05], rear: [1.35, 2.05], side: [[-0.75, 0.36], [0.44, 1.25]],
    pillarFin: FIN.blackGloss,
  },
  features: (ctx) => {
    const P = ctx.P;
    headlamps(ctx, { poly: [[0.44, 0.6], [0.8, 0.6], [0.9, 0.63], [0.84, 0.68], [0.5, 0.66]], hg: 0.008, housing: FIN.blackGloss, drl: [[0.5, 0.606], [0.82, 0.606], [0.84, 0.614], [0.5, 0.614]] });
    grille(ctx, { poly: [[-0.36, 0.56], [0.36, 0.56], [0.4, 0.66], [-0.4, 0.66]], tex: 'HONEY', fin: FIN.blackGloss });
    patch(ctx, '-z', [[-0.62, 0.22], [0.62, 0.22], [0.66, 0.46], [-0.66, 0.46]], tx(FIN.grille, 'HONEY'), { off: 0.006, depth: 0.016, wallFin: FIN.black });
    for (const s of [-1, 1]) patch(ctx, '-z', s > 0 ? [[0.7, 0.26], [0.88, 0.3], [0.88, 0.48], [0.72, 0.46]] : mirX([[0.7, 0.26], [0.88, 0.3], [0.88, 0.48], [0.72, 0.46]]), FIN.blackGloss, { off: 0.006, depth: 0.012 });
    patch(ctx, '-z', [[-0.9, 0.18], [0.9, 0.18], [0.9, 0.22], [-0.9, 0.22]], FIN.red, { off: 0.005, depth: 0.012 });
    badge(ctx, '-z', 0, 0.61, 0.03);
    plate(ctx, 'F', { y: 0.34, idx: 1 });
    const zh = -1.4, yh = section(P, zh).yt;
    rbox(ctx, FIN.paint, 0, yh + 0.02, zh, 0.44, 0.05, 0.4, 0.02);
    box(ctx, FIN.black, 0, yh + 0.03, zh - 0.201, 0.34, 0.03, 0.006);
    // boomerang tail lamps, big wing on the tailgate, triple centre pipes
    for (const s of [-1, 1]) {
      const t = [[0.36, 0.8], [0.8, 0.84], [0.88, 0.9], [0.82, 0.92], [0.5, 0.86], [0.36, 0.85]];
      patch(ctx, '+z', s > 0 ? t : mirX(t), Lf(0xffffff, LAMP.TAIL, 'TAIL'), { off: 0.008, uvMirror: s < 0 });
      patch(ctx, '+z', s > 0 ? [[0.62, 0.3], [0.86, 0.32], [0.86, 0.46], [0.66, 0.44]] : mirX([[0.62, 0.3], [0.86, 0.32], [0.86, 0.46], [0.66, 0.44]]), FIN.blackGloss, { off: 0.006, depth: 0.01 });
    }
    plate(ctx, 'R', { y: 0.6, idx: 1 });
    diffuser(ctx, 0.6, 5, 0.16, 0.35);
    exhausts(ctx, [{ x: -0.12, y: 0.3, r: 0.04 }, { x: 0.12, y: 0.3, r: 0.04 }, { x: 0, y: 0.3, r: 0.03 }]);
    const zw = 2.02, yw = P.gh.roof(1.95) + 0.16;
    tube(ctx, [[-0.78, yw, zw], [0, yw + 0.01, zw], [0.78, yw, zw]], [[-0.012, -0.12], [0.018, 0.05], [0.006, 0.12], [-0.014, 0.06]], FIN.blackGloss, { up: () => [0, 0, 1], crease: 35 });
    for (const s of [-1, 1]) { box(ctx, FIN.blackGloss, s * 0.78, yw - 0.02, zw, 0.012, 0.1, 0.26); box(ctx, FIN.blackGloss, s * 0.5, yw - 0.09, zw + 0.02, 0.03, 0.18, 0.1); }
    bothSides(ctx, (dir) => { patch(ctx, dir, [[-1.2, 0.17], [1.2, 0.17], [1.2, 0.22], [-1.2, 0.23]], FIN.blackGloss, { off: 0.005, depth: 0.014 }); patch(ctx, dir, [[-1.2, 0.225], [1.2, 0.215], [1.2, 0.222], [-1.2, 0.232]], FIN.red, { off: 0.02 }); });
    bothSides(ctx, (dir) => {
      seam(ctx, dir, [[-0.92, 0.24], [-0.94, 0.62], [-0.88, 0.86]]);
      seam(ctx, dir, [[0.42, 0.23], [0.42, 0.9]]);
      seam(ctx, dir, [[1.26, 0.24], [1.24, 0.55], [1.34, 0.72], [1.36, 0.9]]);
    });
    seam(ctx, '+y', [[-0.72, -2.1], [0.72, -2.1]]);
    mirrors(ctx, { z: -0.72, y: 0.95, fin: FIN.blackGloss, len: 0.18, h: 0.1 });
    archTrims(ctx, { fin: FIN.blackGloss, width: 0.04, out: 0.016, inner: 0.004 });
    handles(ctx, [[0.0, 0.86], [0.95, 0.88]], FIN.blackGloss, { flush: true });
    wipers(ctx, { list: [[-0.42, 0.55, 0.05], [0.2, 0.5, 0.09]] });
    interior(ctx, { rearSeat: 1.0 });
  },
});

// separate fender shell over a wheel (beetle wings, cycle wings, buggy/trophy flares): quarter-ellipse section
// swept along an arc over the axle, painted outside, dark inside. Mirrored to both sides.
function fenderShell(ctx, o) {
  const n = ctx.lod ? 6 : (o.n ?? 18), m = ctx.lod ? 2 : (o.m ?? 6), th = o.th ?? 0.018;
  const sect = (u, side) => {
    const t = Math.sin((u * Math.PI) / 2), e = Math.sqrt(Math.max(0, 1 - t * t));
    const z = o.zc + t * o.lz;
    const y0 = o.yEnd + (o.yTop - o.yEnd) * Math.pow(e, o.pow ?? 0.55);
    const xo = o.xIn + (o.xOut - o.xIn) * Math.pow(e, o.taper ?? 0.3);
    const sk = Math.max(0.004, (o.skirt ?? 0.12) * Math.pow(e, 0.5));
    const out = [], inn = [];
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * (Math.PI / 2), sx = Math.sin(a), cy = Math.cos(a);
      out.push([side * (o.xIn + (xo - o.xIn) * sx), y0 - sk + sk * cy, z]);
      inn.push([side * (o.xIn + Math.max(0, xo - o.xIn - th) * sx), y0 - sk + Math.max(0, sk - th) * cy, z]);
    }
    const lip = o.lip ?? 0.03;
    out.push([side * xo, y0 - sk - lip * e, z]); inn.push([side * (xo - th), y0 - sk - lip * e, z]);
    return { out, inn, cx: o.xIn * side, cy: y0 - sk, z };
  };
  for (const side of [1, -1]) {
    const soup = new Soup(), rings = [];
    for (let i = 0; i <= n; i++) rings.push(sect(-1 + (2 * i) / n, side));
    for (let i = 0; i < n; i++) {
      const A = rings[i], B = rings[i + 1];
      for (let j = 0; j < A.out.length - 1; j++) {
        const pa = A.out[j], pb = A.out[j + 1], qa = B.out[j], qb = B.out[j + 1];
        const en = [(pa[0] + pb[0]) / 2 - A.cx, (pa[1] + pb[1]) / 2 - A.cy + 0.02, ((A.z + B.z) / 2 - o.zc) * 0.15];
        quadO(soup, pa, pb, qb, qa, en, o.fin || FIN.paint);
        const ia = A.inn[j], ib = A.inn[j + 1], ja = B.inn[j], jb = B.inn[j + 1];
        quadO(soup, ia, ib, jb, ja, [-en[0], -en[1], -en[2]], FIN.well);
      }
      // outer edge (lip thickness)
      const k = A.out.length - 1;
      quadO(soup, A.out[k], A.inn[k], B.inn[k], B.out[k], [0, -1, 0], o.fin || FIN.paint);
    }
    emitSoup(ctx, soup, o.crease ?? 55);
  }
}
/** a whole spare wheel (tyre + steel/alu rim) as detail geometry. axis: 'x' (standing, facing sideways) or 'z' (facing back) */
function spareWheel(ctx, c, axis, R, w, rimFin = FIN.silver) {
  const soup = new Soup(), hw = w / 2, rb = R * 0.58;
  const frame = axis === 'z' ? (a, u, v) => [c[0] + u, c[1] + v, c[2] + a] : axis === 'y' ? (a, u, v) => [c[0] + u, c[1] + a, c[2] + v] : (a, u, v) => [c[0] + a, c[1] + u, c[2] + v];
  const segs = ctx.lod ? 8 : 20;
  revolve(soup, [[-hw, rb], [-hw, R * 0.9], [-hw * 0.6, R], [hw * 0.6, R], [hw, R * 0.9], [hw, rb]], segs, [FIN.tyre, FIN.tyre, FIN.tread, FIN.tyre, FIN.tyre], frame);
  revolve(soup, [[hw * 0.9, rb], [hw * 0.6, rb * 0.92], [hw * 0.5, rb * 0.45], [hw * 0.55, rb * 0.25], [hw * 0.55, 0]], segs, rimFin, frame);
  revolve(soup, [[-hw * 0.9, 0], [-hw * 0.9, rb]], segs, FIN.wheelBack, frame);
  emitSoup(ctx, soup, 50);
}

// ---- '63 Heimwagen Kugel 1300 (air-cooled people's car homage): domed body, separate fenders, running boards
DEFS.kugel = () => ({
  name: 'Heimwagen Kugel 1300', defaultPaint: 0x7fb2cf, wheel: { style: 'steel', fin: FIN.silver, cap: FIN.chrome },
  wb: 2.4, ohF: 0.8, ohR: 0.87, R: 0.32, ww: 0.15, rimR: 0.19, tf: 1.31, tr: 1.35,
  body: {
    yb: [[-2.0, 0.42], [-1.8, 0.32], [-1.3, 0.27], [0, 0.26], [1.3, 0.27], [1.8, 0.32], [2.07, 0.42]],
    yh: [[-2.0, 0.58], [-1.7, 0.72], [-1.3, 0.82], [-0.8, 0.9], [0, 0.93], [0.8, 0.93], [1.4, 0.86], [1.8, 0.74], [2.07, 0.6]],
    yt: [[-2.0, 0.6], [-1.7, 0.76], [-1.3, 0.86], [-0.8, 0.93], [0, 0.95], [0.8, 0.95], [1.4, 0.89], [1.8, 0.76], [2.07, 0.62]],
    w: [[-2.0, 0.42], [-1.8, 0.5], [-1.4, 0.57], [-0.8, 0.64], [0, 0.665], [0.8, 0.665], [1.4, 0.6], [1.8, 0.5], [2.07, 0.42]],
    kw: 0.5, tuck: 0.06, tumble: 0.06, sr: 0.14, crease: 60,
    rndF: { z: 0.3, x: 0.14, t: 0.12, b: 0.06 }, rndR: { z: 0.3, x: 0.14, t: 0.1, b: 0.06 },
  },
  noArches: true,
  gh: {
    z0: -0.75, z1: 1.6,
    roof: [[-0.75, 0.92], [-0.55, 1.1], [-0.3, 1.3], [0, 1.43], [0.35, 1.5], [0.7, 1.48], [0.95, 1.38], [1.2, 1.2], [1.45, 1.02], [1.6, 0.93]],
    wb: [[-0.75, 0.6], [0, 0.62], [1.0, 0.6], [1.6, 0.52]],
    wt: [[-0.75, 0.52], [0, 0.5], [0.8, 0.48], [1.6, 0.4]],
    rc: 0.14, crown: 0.08,
    ws: [-0.75, -0.12], rear: [1.08, 1.38], side: [[-0.55, 0.35], [0.45, 0.95]],
    pillarFin: FIN.paint,
  },
  extraBounds: { maxX: 0.8 },
  seatDZ: 0.85,
  features: (ctx) => {
    const P = ctx.P;
    fenderShell(ctx, { zc: -1.2, lz: 0.58, xIn: 0.46, xOut: 0.8, yTop: 0.78, yEnd: 0.36, skirt: 0.16, pow: 0.5 });
    fenderShell(ctx, { zc: 1.2, lz: 0.62, xIn: 0.5, xOut: 0.81, yTop: 0.8, yEnd: 0.36, skirt: 0.16, pow: 0.5 });
    // running boards between the wings
    for (const s of [-1, 1]) { box(ctx, FIN.rubber, s * 0.72, 0.35, 0, 0.18, 0.025, 1.2); box(ctx, FIN.chrome, s * 0.8, 0.35, 0, 0.01, 0.03, 1.2); }
    // headlamps set into the front wings
    for (const s of [-1, 1]) {
      const z = -1.62, y = 0.66, x = s * 0.64;
      cylAB(ctx, FIN.paint, [x, y - 0.02, z + 0.08], [x, y, z - 0.04], 0.085, 20);
      addGeo(ctx, TOR(), FIN.chrome, M(x, y, z - 0.045, Math.PI / 2 - 0.15, 0, 0, 0.085, 0.085, 0.05));
      addGeo(ctx, CYL(20), Lf(0xffffff, LAMP.HEAD, 'HEADR'), M(x, y, z - 0.046, Math.PI / 2 - 0.15, 0, 0, 0.078, 0.004, 0.078));
      ctx.head.push(new THREE.Vector3(x, y, z - 0.06));
      addGeo(ctx, SPH(10, 6), Lf(0xffa21a, LAMP.NONE), M(x * 0.97, 0.8, -1.3, 0, 0, 0, 0.03, 0.02, 0.05));
      // tail lamps on the rear wings
      addGeo(ctx, SPH(12, 8), Lf(0xd4000c, LAMP.TAIL), M(s * 0.66, 0.66, 1.72, 0.4, 0, 0, 0.045, 0.07, 0.03));
    }
    // blade bumpers with overriders, bonnet handle + badge, engine lid louvres
    for (const [z, y] of [[P.zF - 0.08, 0.36], [P.zR + 0.08, 0.38]]) {
      tube(ctx, [[-0.78, y, z + Math.sign(z) * -0.08], [-0.4, y, z], [0.4, y, z], [0.78, y, z + Math.sign(z) * -0.08]], bladeProf, FIN.chrome, { crease: 60 });
      for (const s of [-1, 1]) { cylAB(ctx, FIN.chrome, [s * 0.4, y - 0.02, z], [s * 0.4, y + 0.1, z], 0.02, 8); box(ctx, FIN.black, s * 0.4, y - 0.02, z - Math.sign(z) * 0.1, 0.04, 0.04, 0.2); }
    }
    badge(ctx, '-z', 0, 0.62, 0.045);
    patch(ctx, '-z', rrect(-0.05, 0.72, 0.05, 0.74, 0.008), FIN.chrome, { off: 0.008 });
    for (const s of [-1, 1]) patch(ctx, '-z', ell(s * 0.2, 0.46, 0.06, 0.03, 12), tx(FIN.grille, 'SLATS'), { off: 0.006 });
    patch(ctx, '+z', rrect(-0.24, 0.62, 0.24, 0.72, 0.02), tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    plate(ctx, 'F', { y: 0.5, idx: 2 });
    plate(ctx, 'R', { y: 0.5, idx: 2 });
    exhausts(ctx, [{ x: -0.35, y: 0.33, r: 0.028, dz: 0.02 }, { x: 0.35, y: 0.33, r: 0.028, dz: 0.02 }]);
    doorSeams(ctx, -0.72, null, null, 0.9, { yb: 0.3 });
    bothSides(ctx, (dir) => seam(ctx, dir, [[0.42, 0.3], [0.45, 0.9]]));
    seam(ctx, '+y', [[-0.4, -1.6], [0.4, -1.6]]);
    beltTrim(ctx, FIN.chrome, -0.55, 0.95, { h: 0.005 });
    mirrors(ctx, { z: -0.6, y: 0.94, fin: FIN.chrome, stalk: FIN.chrome, len: 0.08, h: 0.06, d: 0.06, driverOnly: true });
    handles(ctx, [[0.32, 0.86]], FIN.chrome);
    wipers(ctx, { list: [[-0.3, 0.36, 0.05], [0.1, 0.34, 0.08]] });
    interior(ctx, { rearSeat: 0.85, seatX: 0.3, wheelY: 0.16 });
  },
});

// ---- '67 Heimwagen Picknick Bus (split-screen microbus homage): V-front two-tone, split windscreen, skylights
DEFS.picknick = () => ({
  name: 'Heimwagen Picknick Bus', defaultPaint: 0xd94e2a, defaultPaint2: 0xefe7d4, wheel: { style: 'steel', fin: FIN.cream, cap: FIN.chrome },
  wb: 2.4, ohF: 0.78, ohR: 1.1, R: 0.34, ww: 0.18, rimR: 0.178, tf: 1.37, tr: 1.36,
  body: {
    yb: [[-1.98, 0.42], [-1.8, 0.31], [-1.4, 0.27], [0, 0.26], [1.4, 0.27], [1.9, 0.31], [2.3, 0.42]],
    yh: [[-1.98, 1.25], [-1.92, 1.5], [-1.78, 1.7], [-1.5, 1.82], [-1.0, 1.86], [1.8, 1.86], [2.1, 1.8], [2.3, 1.6]],
    yt: [[-1.98, 1.3], [-1.92, 1.56], [-1.78, 1.77], [-1.5, 1.88], [-1.0, 1.92], [1.8, 1.92], [2.1, 1.86], [2.3, 1.66]],
    w: [[-1.98, 0.74], [-1.8, 0.84], [-1.4, 0.86], [0, 0.86], [1.8, 0.86], [2.1, 0.84], [2.3, 0.78]],
    kw: 0.3, tuck: 0.03, tumble: 0.1, sr: 0.18,
    rndF: { z: 0.2, x: 0.12, t: 0.04, b: 0.06 }, rndR: { z: 0.2, x: 0.1, t: 0.08, b: 0.05 },
    levels: [1.24, 1.28, 1.66], lodLevels: [1.24], levelsOnly: true, spacing: 0.2, archN: 8,
  },
  breaks: [-1.2, -0.25, -0.2, 0.75, 0.8, 1.7, 1.75], lodBreaks: true,
  lowerMat: (q, lod) => {
    const z = q.z, y = q.y, t = q.tag;
    if (t === 'side' && y > 1.28 && y < 1.66 && z > -1.35 && z < 1.72 && !(z > -0.25 && z < -0.2) && !(z > 0.75 && z < 0.8)) return lod ? FIN.glassProxy : FIN.glass;
    if ((t === 'side' || t === 'corner' || t === 'top' || t === 'topIn') && y > 1.24) return FIN.paint2;
    return undefined;
  },
  arch: { dy: 0.02, top: 0.07, side: 0.07, p: 2.2 },
  seat: [-0.45, 1.45, -1.25],
  extraBounds: { maxY: 1.98 },
  features: (ctx) => {
    const P = ctx.P;
    // V-front in the contrast colour + split windscreen
    patch(ctx, '-z', [[-0.9, 1.24], [-0.14, 0.74], [0.14, 0.74], [0.9, 1.24], [0.9, 1.98], [-0.9, 1.98]], FIN.paint2, { off: 0.004, maxEdge: 0.2, refine: 2 });
    for (const s of [-1, 1]) {
      const pane = s > 0 ? rrect(0.03, 1.3, 0.74, 1.68, 0.06) : rrect(-0.74, 1.3, -0.03, 1.68, 0.06);
      patch(ctx, '-z', grow(pane, 0.02), FIN.chrome, { off: 0.006 });
      patch(ctx, '-z', pane, FIN.interior, { off: 0.008 });
      patch(ctx, '-z', pane, FIN.glass, { off: 0.012 });
      roundLamp(ctx, '-z', s * 0.62, 0.98, 0.08, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.006, depth: 0.03 });
      patch(ctx, '-z', ell(s * 0.62, 1.14, 0.035, 0.025, 12), Lf(0xffa21a, LAMP.NONE), { off: 0.01 });
      patch(ctx, '-z', rrect(s * 0.3 - 0.1, 0.62, s * 0.3 + 0.1, 0.66, 0.02), tx(FIN.grille, 'SLATS'), { off: 0.006 });
    }
    patch(ctx, '-z', ell(0, 1.02, 0.14, 0.14, 28), FIN.chrome, { off: 0.008, depth: 0.012 });
    patch(ctx, '-z', ell(0, 1.02, 0.1, 0.1, 24), tx(FIN.decalChrome, 'BADGE'), { off: 0.022 });
    tube(ctx, [[-0.9, 0.44, P.zF + 0.1], [-0.5, 0.44, P.zF - 0.06], [0.5, 0.44, P.zF - 0.06], [0.9, 0.44, P.zF + 0.1]], bladeProf, FIN.chrome, { crease: 60 });
    plate(ctx, 'F', { y: 0.55, idx: 2 });
    // rear: engine lid louvres, small window, round tails, bumper
    patch(ctx, '+z', rrect(-0.5, 1.34, 0.5, 1.62, 0.04), FIN.interior, { off: 0.006 });
    patch(ctx, '+z', rrect(-0.5, 1.34, 0.5, 1.62, 0.04), FIN.glass, { off: 0.01 });
    patch(ctx, '+z', rrect(-0.4, 0.62, 0.4, 0.78, 0.02), tx(FIN.decal, 'LOUVER'), { off: 0.006 });
    for (const s of [-1, 1]) roundLamp(ctx, '+z', s * 0.72, 1.1, 0.045, 0xd4000c, LAMP.TAIL);
    tube(ctx, [[-0.9, 0.44, P.zR - 0.1], [-0.5, 0.44, P.zR + 0.06], [0.5, 0.44, P.zR + 0.06], [0.9, 0.44, P.zR - 0.1]], bladeProf, FIN.chrome, { crease: 60 });
    plate(ctx, 'R', { y: 0.9, idx: 2 });
    exhausts(ctx, [{ x: 0.3, y: 0.34, r: 0.03, dz: -0.05 }]);
    // side: cargo doors, engine intake louvres, roof skylights
    seam(ctx, '+x', [[-0.2, 0.3], [-0.2, 1.8], [0.75, 1.8], [0.75, 0.3]]);
    seam(ctx, '+x', [[0.27, 0.3], [0.27, 1.8]]);
    bothSides(ctx, (dir) => { seam(ctx, dir, [[-1.2, 0.3], [-1.2, 1.24], [-1.35, 1.8]]); patch(ctx, dir, [[1.75, 1.3], [2.12, 1.3], [2.1, 1.6], [1.75, 1.6]], tx(FIN.decal, 'LOUVER'), { off: 0.006 }); });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) patch(ctx, '+y', rrect(s * 0.66 - 0.1, -0.6 + i * 0.55, s * 0.66 + 0.1, -0.3 + i * 0.55, 0.03), FIN.glass, { off: 0.006 });
    handles(ctx, [[-0.6, 1.1]], FIN.chrome);
    mirrors(ctx, { z: -1.5, y: 1.4, fin: FIN.chrome, stalk: FIN.chrome, len: 0.1, h: 0.08, d: 0.08 });
    archTrims(ctx, { fin: FIN.paint, width: 0.02, out: 0.005 });
    // cab interior (single loft is hollow)
    ctx.noBounds = true;
    innerShell(ctx, -1.9, 2.2, 0.03, 0.62);
    box(ctx, FIN.dash, 0, 1.2, -1.75, 1.6, 0.16, 0.24);
    for (const x of [-0.45, 0.45]) { box(ctx, FIN.seat, x, 0.95, -1.0, 0.5, 0.18, 0.5); box(ctx, FIN.seat, x, 1.25, -0.78, 0.5, 0.55, 0.12, 0.15, 0, 0); }
    for (const z of [0.1, 1.0]) { box(ctx, FIN.seat, 0, 0.9, z, 1.5, 0.18, 0.5); box(ctx, FIN.seat, 0, 1.2, z + 0.25, 1.5, 0.5, 0.12, 0.15, 0, 0); }
    addGeo(ctx, TOR(), FIN.dash, M(-0.45, 1.3, -1.45, -1.0, 0, 0, 0.21, 0.21, 0.21));
    ctx.noBounds = false;
  },
});

// ---- '70 Sandpiper Dune Buggy (fibreglass beach buggy homage): open tub, swooping wings, exposed flat-four, roll hoop
DEFS.buggy = () => ({
  name: 'Sandpiper Dune Buggy', defaultPaint: 0xf2a114, wheel: { style: 'steel', fin: FIN.chrome, cap: FIN.chrome },
  wb: 2.03, ohF: 0.62, ohR: 0.3, R: 0.34, wwR: 0.28, ww: 0.2, rimR: 0.19, tf: 1.36, tr: 1.44,
  body: {
    yb: [[-1.635, 0.44], [-1.35, 0.36], [-0.9, 0.31], [0, 0.29], [0.9, 0.31], [1.315, 0.4]],
    yh: [[-1.635, 0.54], [-1.35, 0.66], [-1.015, 0.8], [-0.6, 0.62], [0, 0.58], [0.6, 0.64], [1.015, 0.84], [1.315, 0.72]],
    yt: [[-1.635, 0.56], [-1.3, 0.64], [-0.8, 0.66], [-0.5, 0.62], [0.9, 0.62], [1.315, 0.66]],
    w: [[-1.635, 0.5], [-1.35, 0.7], [-1.015, 0.8], [-0.6, 0.66], [0, 0.62], [0.6, 0.68], [1.015, 0.86], [1.315, 0.8]],
    kw: 0.5, tuck: 0.12, tumble: 0.06, sr: 0.09, crease: 50,
    rndF: { z: 0.3, x: 0.2, t: 0.05, b: 0.06 }, rndR: { z: 0.1, x: 0.05, t: 0.02, b: 0.04 },
    bedY: (z) => (z > -0.72 && z < 0.95 ? 0.36 : null),
  },
  bed: { z0: -0.72, z1: 0.95 },
  lowerMat: (q) => ((q.tag === 'topIn' || q.tag === 'bedWall') && q.z > -0.72 && q.z < 0.95 ? FIN.interior : undefined),
  arch: { dy: 0.03, top: 0.1, side: 0.12, p: 2.0 },
  seat: [-0.3, 0.9, 0.25],
  extraBounds: { maxY: 1.35, maxZ: 1.75 },
  features: (ctx) => {
    const P = ctx.P;
    for (const s of [-1, 1]) {
      const z = -1.25, y = section(P, z).yt + 0.04, x = s * 0.4;
      cylAB(ctx, FIN.chrome, [x, y - 0.06, z + 0.06], [x, y + 0.02, z - 0.06], 0.075, 18);
      addGeo(ctx, CYL(18), Lf(0xffffff, LAMP.HEAD, 'HEADR'), M(x, y + 0.02, z - 0.062, Math.PI / 2 - 0.5, 0, 0, 0.068, 0.004, 0.068));
      ctx.head.push(new THREE.Vector3(x, y + 0.02, z - 0.08));
    }
    patch(ctx, '-z', rrect(-0.18, 0.46, 0.18, 0.5, 0.01), FIN.chrome, { off: 0.01 });
    tube(ctx, [[-0.5, 0.42, P.zF - 0.02], [0, 0.42, P.zF - 0.08], [0.5, 0.42, P.zF - 0.02]], [[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], FIN.chrome, { crease: 60 });
    plate(ctx, 'F', { y: 0.52, idx: 1 });
    openScreen(ctx, -0.72, 0.6, 0.26, 0.1, FIN.chrome, { wrap: 0.04, drop: 0.03 });
    openCockpit(ctx, 0.25, 0.36, { seatX: 0.3, dashY: 0.62, dashW: 1.1, back: 0.5 });
    // roll hoop
    ctx.noBounds = true;
    const hz = 0.72, pts = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; pts.push([Math.cos(a) * 0.6, 0.62 + Math.sin(a) * 0.62, hz]); }
    tube(ctx, pts, ell(0, 0, 0.025, 0.025, 8), FIN.chrome, { up: () => [0, 0, 1], crease: 60 });
    for (const s of [-1, 1]) cylAB(ctx, FIN.chrome, [s * 0.5, 1.15, hz], [s * 0.45, 0.66, 1.25], 0.02, 8);
    // exposed flat-four: block, cylinders, air cleaners, twin pipes
    box(ctx, FIN.gun, 0, 0.55, 1.45, 0.62, 0.3, 0.42);
    for (const s of [-1, 1]) for (const z of [1.33, 1.57]) cylAB(ctx, FIN.alu, [s * 0.3, 0.55, z], [s * 0.46, 0.55, z], 0.07, 12);
    box(ctx, FIN.black, 0, 0.78, 1.4, 0.3, 0.16, 0.26);
    for (const s of [-1, 1]) { cylAB(ctx, FIN.chrome, [s * 0.18, 0.86, 1.4], [s * 0.18, 0.96, 1.4], 0.07, 14); cylAB(ctx, FIN.chrome, [s * 0.14, 0.4, 1.6], [s * 0.14, 0.4, 1.78], 0.035, 10); }
    ctx.exhaust.push(new THREE.Vector3(-0.14, 0.4, 1.79), new THREE.Vector3(0.14, 0.4, 1.79));
    for (const s of [-1, 1]) addGeo(ctx, SPH(10, 6), Lf(0xd4000c, LAMP.TAIL), M(s * 0.62, 0.66, 1.31, 0, 0, 0, 0.04, 0.03, 0.02));
    ctx.noBounds = false;
    plate(ctx, 'R', { y: 0.5, idx: 1 });
  },
});

// ---- '19 Mesa Trophy Truck (desert racer homage): giant tyres, long-travel shocks, bed with two spares, light bar, cage
DEFS.trophy = () => ({
  name: 'Mesa Trophy Truck', defaultPaint: 0xf0f0ee, defaultPaint2: 0xe8601c, wheel: { style: 'rally6', fin: FIN.black },
  wb: 3.05, ohF: 1.25, ohR: 1.3, R: 0.5, ww: 0.33, rimR: 0.216, tf: 2.02, tr: 2.02,
  body: {
    yb: [[-2.775, 0.8], [-2.5, 0.66], [-2.0, 0.58], [-1.0, 0.52], [0.6, 0.52], [1.2, 0.64], [2.2, 0.72], [2.825, 0.82]],
    yh: [[-2.775, 1.1], [-2.5, 1.22], [-2.0, 1.3], [-1.2, 1.34], [-0.5, 1.37], [0.6, 1.4], [1.2, 1.22], [2.2, 1.22], [2.825, 1.16]],
    yt: [[-2.775, 1.12], [-2.5, 1.26], [-2.0, 1.34], [-1.2, 1.38], [-0.5, 1.4], [0.6, 1.42], [1.2, 1.24], [2.825, 1.22]],
    w: [[-2.775, 0.82], [-2.5, 1.04], [-1.9, 1.16], [-1.525, 1.19], [-1.1, 1.08], [-0.8, 0.98], [0, 0.96], [0.9, 0.98], [1.525, 1.13], [2.3, 1.05], [2.825, 0.92]],
    kw: 0.5, tuck: 0.12, tumble: 0.05, sr: 0.06, crease: 36, levels: [0.9],
    rndF: { z: 0.3, x: 0.2, t: 0.08, b: 0.1 }, rndR: { z: 0.1, x: 0.06, t: 0.02, b: 0.04 },
    bedY: (z) => (z > 0.72 && z < 2.6 ? 0.8 : null),
  },
  bed: { z0: 0.72, z1: 2.6 },
  lowerMat: (q) => (q.tag === 'side' && q.y < 0.9 ? FIN.paint2 : (q.tag === 'topIn' || q.tag === 'bedWall') && q.z > 0.72 && q.z < 2.6 ? FIN.bedliner : undefined),
  arch: { dy: 0.04, top: 0.2, side: 0.13, p: 2.3 },
  gh: {
    z0: -0.78, z1: 0.68,
    roof: [[-0.78, 1.38], [-0.55, 1.58], [-0.3, 1.78], [-0.05, 1.9], [0.3, 1.93], [0.58, 1.9], [0.68, 1.5]],
    wb: [[-0.78, 0.92], [0, 0.92], [0.68, 0.92]],
    wt: [[-0.78, 0.82], [0, 0.78], [0.68, 0.78]],
    rc: 0.07, crown: 0.03,
    ws: [-0.78, -0.08], rear: [0.6, 0.68], side: [[-0.6, 0.52]],
    pillarFin: FIN.black, roofFin: FIN.paint2,
  },
  extraBounds: { maxY: 2.1, maxX: 1.2 },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: rrect(-0.6, 0.86, 0.6, 1.12, 0.04), tex: 'HONEY', fin: FIN.black, surround: FIN.black, sw: 0.03 });
    for (const s of [-1, 1]) {
      const r = patch(ctx, '-z', s > 0 ? rrect(0.66, 0.98, 0.92, 1.1, 0.03) : rrect(-0.92, 0.98, -0.66, 1.1, 0.03), Lf(0xffffff, LAMP.HEAD, 'HEAD'), { off: 0.008 });
      if (r) ctx.head.push(new THREE.Vector3(r.c[0], r.c[1], r.c[2] - 0.02));
    }
    badge(ctx, '-z', 0, 1.0, 0.06);
    // tube bumper, roof light bar, hood pins, number boards
    tube(ctx, [[-0.95, 0.72, P.zF + 0.25], [-0.6, 0.72, P.zF - 0.05], [0.6, 0.72, P.zF - 0.05], [0.95, 0.72, P.zF + 0.25]], ell(0, 0, 0.03, 0.03, 8), FIN.black, { crease: 60 });
    const G = P.gh, zl = -0.05, yl = G.roof(zl) + 0.06;
    rbox(ctx, FIN.black, 0, yl, zl, 1.5, 0.1, 0.12, 0.03);
    for (let i = 0; i < 6; i++) addGeo(ctx, CYL(14), Lf(0xffffff, LAMP.DRL, 'HEADR'), M(-0.62 + i * 0.248, yl, zl - 0.062, Math.PI / 2, 0, 0, 0.05, 0.004, 0.05));
    bothSides(ctx, (dir) => patch(ctx, dir, ell(-0.1, 1.05, 0.2, 0.2, 24), tx(FIN.decal, 'ROUNDEL'), { off: 0.009 }));
    bothSides(ctx, (dir) => patch(ctx, dir, [[-2.2, 1.08], [-1.0, 1.08], [-1.0, 1.18], [-2.2, 1.18]], tx(FIN.decal, 'SPONSOR'), { off: 0.006 }));
    // bed: two spares standing, cage, shocks, fuel cell
    ctx.noBounds = true;
    for (const z of [1.3, 1.95]) spareWheel(ctx, [0, 0.8 + P.R, z], 'z', P.R, P.ww, FIN.black);
    box(ctx, FIN.graphite, 0, 1.0, 2.45, 1.4, 0.36, 0.26);
    const cy = 1.55;
    for (const s of [-1, 1]) {
      tube(ctx, [[s * 0.78, 1.5, 0.66], [s * 0.78, cy, 1.2], [s * 0.72, 1.25, 2.55]], ell(0, 0, 0.025, 0.025, 8), FIN.black, { crease: 60 });
      cylAB(ctx, FIN.black, [s * 0.78, 1.52, 1.4], [s * 0.72, 0.86, 1.6], 0.02, 8);
      // long-travel shocks (reservoir bodies) to the rear axle
      cylAB(ctx, FIN.gold, [s * 0.6, 1.3, 1.38], [s * 0.78, P.R + 0.1, 1.5], 0.045, 10);
      cylAB(ctx, FIN.gold, [s * 0.66, 1.3, 1.62], [s * 0.84, P.R + 0.1, 1.55], 0.045, 10);
      cylAB(ctx, FIN.gold, [s * 0.62, 1.2, -1.45], [s * 0.86, P.R + 0.12, -1.52], 0.04, 10);
    }
    cylAB(ctx, FIN.black, [-0.78, cy, 1.2], [0.78, cy, 1.2], 0.025, 8);
    cylAB(ctx, FIN.black, [-0.72, 1.25, 2.55], [0.72, 1.25, 2.55], 0.025, 8);
    for (const s of [-1, 1]) { addGeo(ctx, SPH(10, 6), Lf(0xd4000c, LAMP.TAIL), M(s * 0.7, 1.22, 2.58, 0, 0, 0, 0.04, 0.04, 0.02)); cylAB(ctx, FIN.chrome, [s * 0.95, 0.86, 2.1], [s * 1.05, 0.86, 2.55], 0.05, 12); }
    ctx.exhaust.push(new THREE.Vector3(-1.05, 0.86, 2.56), new THREE.Vector3(1.05, 0.86, 2.56));
    ctx.noBounds = false;
    fenderShell(ctx, { zc: 1.525, lz: 0.75, xIn: 0.95, xOut: 1.2, yTop: 1.22, yEnd: 0.8, skirt: 0.18, fin: FIN.paint2, pow: 0.4 });
    doorSeams(ctx, -0.74, null, 0.62, 1.34, { yb: 0.62, rearKick: 0 });
    mirrors(ctx, { z: -0.62, y: 1.44, fin: FIN.black, len: 0.2, h: 0.14 });
    wipers(ctx, { list: [[-0.42, 0.62, 0.05]] });
    interior(ctx, { rearSeat: null, seatX: 0.42 });
    plate(ctx, 'F', { y: 0.78, idx: 3 });
  },
});

// ---- '85 Hawthorne Trekker 110 (British 4x4 homage): slab sides, flat bonnet with bulge, alpine windows, spare on the door
DEFS.trekker = () => ({
  name: 'Hawthorne Trekker 110', defaultPaint: 0x40503a, defaultPaint2: 0xefefe8, wheel: { style: 'steel', fin: FIN.black, cap: FIN.silver },
  wb: 2.79, ohF: 0.7, ohR: 1.1, R: 0.39, ww: 0.235, rimR: 0.203, tf: 1.49, tr: 1.49,
  body: {
    yb: [[-2.095, 0.52], [-1.9, 0.44], [-1.4, 0.4], [0, 0.38], [1.4, 0.39], [2.0, 0.44], [2.495, 0.52]],
    yh: [[-2.095, 1.06], [-1.9, 1.1], [-1.0, 1.12], [-0.75, 1.12], [0, 1.14], [2.495, 1.14]],
    yt: [[-2.095, 1.08], [-1.9, 1.12], [-1.0, 1.14], [2.495, 1.16]],
    w: [[-2.095, 0.84], [-1.9, 0.88], [-1.4, 0.895], [0, 0.895], [2.495, 0.895]],
    kw: 0.5, tuck: 0.02, tumble: 0.0, sr: 0.02, crease: 20,
    rndF: { z: 0.04, x: 0.03, t: 0.01, b: 0.02 }, rndR: { z: 0.03, x: 0.02, t: 0.01, b: 0.02 },
  },
  arch: { dy: 0.02, top: 0.09, side: 0.08, p: 3.5 },
  gh: {
    z0: -0.75, z1: 2.45,
    roof: [[-0.75, 1.16], [-0.62, 1.5], [-0.52, 1.8], [-0.46, 1.96], [0, 2.0], [2.3, 2.0], [2.45, 1.96]],
    wb: [[-0.75, 0.82], [2.45, 0.82]],
    wt: [[-0.75, 0.77], [2.45, 0.77]],
    rc: 0.03, crown: 0.01,
    ws: [-0.75, -0.46], rear: [2.4, 2.45], side: [[-0.4, 0.42], [0.52, 1.3], [1.4, 2.25]],
    pillarFin: FIN.paint, roofFin: FIN.paint2,
  },
  extraBounds: { maxZ: 2.75 },
  features: (ctx) => {
    const P = ctx.P;
    patch(ctx, '-z', rrect(-0.84, 0.66, 0.84, 1.06, 0.01), FIN.black, { off: 0.004 });
    grille(ctx, { poly: rrect(-0.42, 0.7, 0.42, 1.02, 0.01), tex: 'EGG', fin: FIN.grille });
    for (const s of [-1, 1]) {
      patch(ctx, '-z', rrect(s * 0.64 - 0.14, 0.76, s * 0.64 + 0.14, 1.02, 0.015), FIN.black, { off: 0.008 });
      roundLamp(ctx, '-z', s * 0.64, 0.89, 0.085, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.01, bezel: FIN.chrome });
      patch(ctx, '-z', rrect(s * 0.64 - 0.04, 0.7, s * 0.64 + 0.04, 0.74, 0.01), Lf(0xffa21a, LAMP.NONE), { off: 0.012 });
    }
    box(ctx, FIN.black, 0, 0.58, P.zF - 0.08, 1.86, 0.14, 0.12);
    plate(ctx, 'F', { y: 0.58, idx: 0 });
    rbox(ctx, FIN.paint, 0, section(P, -1.3).yt + 0.02, -1.3, 1.0, 0.04, 1.3, 0.015);
    // snorkel up the right A-pillar
    ctx.noBounds = true;
    tube(ctx, [[0.9, 0.9, -1.0], [0.92, 1.3, -0.82], [0.9, 1.9, -0.6], [0.86, 2.02, -0.66]], ell(0, 0, 0.05, 0.05, 10), FIN.black, { crease: 60 });
    ctx.noBounds = false;
    // rear: spare on the side-hinged door, vertical lamps, step
    ctx.noBounds = true;
    spareWheel(ctx, [0.1, 1.1, P.zR + 0.14], 'z', P.R, P.ww, FIN.black);
    ctx.noBounds = false;
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.78 - 0.05, 0.6, s * 0.78 + 0.05, 0.9, 0.01), Lf(0xd4000c, LAMP.TAIL), { off: 0.008 });
    box(ctx, FIN.black, 0, 0.55, P.zR + 0.06, 1.2, 0.08, 0.12);
    plate(ctx, 'R', { y: 0.7, x: -0.45, idx: 0 });
    exhausts(ctx, [{ x: 0.6, y: 0.4, r: 0.03, dz: -0.2 }]);
    doorSeams(ctx, -0.72, 0.46, 1.32, 1.12, { yb: 0.42, rearKick: 0 });
    bothSides(ctx, (dir) => { seam(ctx, dir, [[-0.72, 1.12], [-0.72, 1.95]]); seam(ctx, dir, [[2.44, 0.42], [2.44, 1.95]]); for (let i = 0; i < 3; i++) patch(ctx, dir, rrect(0.9 + i * 0.45 - 0.14, 1.9, 0.9 + i * 0.45 + 0.14, 1.96, 0.02), FIN.glass, { off: 0.005 }); });
    seam(ctx, '+y', [[-0.84, -2.02], [0.84, -2.02]]);
    mirrors(ctx, { z: -0.6, y: 1.3, fin: FIN.black, len: 0.2, h: 0.16 });
    archTrims(ctx, { fin: FIN.black, width: 0.06, out: 0.02 });
    handles(ctx, [[-0.2, 1.05], [1.0, 1.05]], FIN.black);
    wipers(ctx, { list: [[-0.45, 0.52, 0.05], [0.25, 0.5, 0.08]] });
    interior(ctx, { rearSeat: 0.9, seatX: 0.42 });
  },
});

// ---- '78 Tenzan Kodiak 40 (lifted short 4x4 homage): flat grille with round lamps, white top, big tyres, rear spare
DEFS.kodiak = () => ({
  name: 'Tenzan Kodiak 40', defaultPaint: 0x5d8fb8, defaultPaint2: 0xefefe8, wheel: { style: 'steel', fin: FIN.black, cap: FIN.black },
  wb: 2.285, ohF: 0.72, ohR: 0.83, R: 0.44, ww: 0.3, rimR: 0.19, tf: 1.48, tr: 1.48,
  body: {
    yb: [[-1.8625, 0.62], [-1.7, 0.56], [-1.2, 0.52], [0, 0.5], [1.2, 0.52], [1.7, 0.56], [1.9725, 0.62]],
    yh: [[-1.8625, 1.24], [-1.6, 1.3], [-1.0, 1.32], [-0.7, 1.34], [0, 1.3], [1.9725, 1.32]],
    yt: [[-1.8625, 1.26], [-1.6, 1.33], [-1.0, 1.35], [-0.7, 1.36], [0, 1.32], [1.9725, 1.34]],
    w: [[-1.8625, 0.78], [-1.6, 0.82], [-1.14, 0.84], [-0.6, 0.8], [0, 0.8], [1.14, 0.84], [1.9725, 0.82]],
    kw: 0.5, tuck: 0.02, tumble: 0.01, sr: 0.03, crease: 22,
    rndF: { z: 0.05, x: 0.04, t: 0.01, b: 0.02 }, rndR: { z: 0.04, x: 0.03, t: 0.01, b: 0.02 },
  },
  arch: { dy: 0.03, top: 0.1, side: 0.1, p: 3.0 },
  gh: {
    z0: -0.7, z1: 1.9,
    roof: [[-0.7, 1.36], [-0.62, 1.7], [-0.58, 1.9], [-0.5, 1.95], [1.8, 1.95], [1.9, 1.9]],
    wb: [[-0.7, 0.74], [1.9, 0.76]],
    wt: [[-0.7, 0.72], [1.9, 0.74]],
    rc: 0.05, crown: 0.01,
    ws: [-0.7, -0.52], rear: [1.85, 1.9], side: [[-0.4, 0.4], [0.9, 1.75]],
    pillarFin: FIN.paint2, roofFin: FIN.paint2, railFin: FIN.paint2,
  },
  extraBounds: { maxZ: 2.2, maxY: 2.0 },
  features: (ctx) => {
    const P = ctx.P;
    grille(ctx, { poly: rrect(-0.44, 0.9, 0.44, 1.24, 0.01), tex: 'SLATS', fin: FIN.grille, surround: FIN.paint, sw: 0.02 });
    for (const s of [-1, 1]) { roundLamp(ctx, '-z', s * 0.62, 1.08, 0.085, 0xffffff, LAMP.HEAD, 'HEADR', { off: 0.008, bezel: FIN.chrome }); patch(ctx, '-z', ell(s * 0.62, 0.92, 0.03, 0.03, 10), Lf(0xffa21a, LAMP.NONE), { off: 0.008 }); }
    badge(ctx, '-z', 0, 1.18, 0.04);
    box(ctx, FIN.black, 0, 0.72, P.zF - 0.1, 1.8, 0.16, 0.12);
    plate(ctx, 'F', { y: 0.72, idx: 3 });
    ctx.noBounds = true;
    spareWheel(ctx, [0, 1.15, P.zR + 0.18], 'z', P.R, P.ww, FIN.black);
    tube(ctx, [[-0.92, 1.0, -1.0], [-0.95, 1.4, -0.82], [-0.92, 1.95, -0.62], [-0.88, 2.05, -0.68]], ell(0, 0, 0.05, 0.05, 10), FIN.black, { crease: 60 });
    ctx.noBounds = false;
    for (const s of [-1, 1]) patch(ctx, '+z', rrect(s * 0.7 - 0.05, 0.9, s * 0.7 + 0.05, 1.08, 0.01), Lf(0xd4000c, LAMP.TAIL), { off: 0.008 });
    box(ctx, FIN.black, 0, 0.72, P.zR + 0.08, 1.7, 0.14, 0.12);
    plate(ctx, 'R', { y: 0.95, x: 0.45, idx: 3 });
    exhausts(ctx, [{ x: -0.6, y: 0.58, r: 0.03, dz: -0.15 }]);
    doorSeams(ctx, -0.66, null, 0.46, 1.32, { yb: 0.56, rearKick: 0 });
    mirrors(ctx, { z: -0.56, y: 1.45, fin: FIN.chrome, stalk: FIN.chrome, len: 0.14, h: 0.12 });
    archTrims(ctx, { fin: FIN.black, width: 0.09, out: 0.04 });
    handles(ctx, [[-0.1, 1.24]], FIN.chrome);
    wipers(ctx, { list: [[-0.4, 0.46, 0.05], [0.2, 0.44, 0.08]] });
    interior(ctx, { rearSeat: 1.1, seatX: 0.38 });
  },
});

// ---- '21 Bayliss Bighorn Baja (high-performance off-road pickup): the Hauler lifted on long-travel suspension, flares, marker lamps
DEFS.baja = () => {
  const B = DEFS.pickup();
  B.name = 'Bayliss Bighorn Baja'; B.defaultPaint = 0x2f3237; B.wheel = { style: 'rally6', fin: FIN.graphite };
  const lift = 0.14;
  B.R = 0.445; B.ww = 0.32; B.rimR = 0.216; B.tf = 1.84; B.tr = 1.84;
  B.body = Object.assign({}, B.body, {
    yb: B.body.yb.map(([z, y]) => [z, y + lift]), yh: B.body.yh.map(([z, y]) => [z, y + lift]), yt: B.body.yt.map(([z, y]) => [z, y + lift]),
    w: B.body.w.map(([z, x]) => [z, x + 0.05]),
    bedY: (z) => (z > B.bed.z0 && z < B.bed.z1 ? 0.97 + lift : null),
    charY: 1.08 + lift,
  });
  B.gh = Object.assign({}, B.gh, { roof: B.gh.roof.map(([z, y]) => [z, y + lift]), wb: B.gh.wb.map(([z, x]) => [z, x + 0.03]), wt: B.gh.wt.map(([z, x]) => [z, x + 0.03]) });
  B.arch = { dy: 0.03, top: 0.1, side: 0.11, p: 2.6 };
  B.extraBounds = { maxY: 1.93 + lift + 0.06, maxX: 1.15, maxZ: 2.95, minZ: -2.76, minY: 0.5 };
  B.features = (ctx) => {
    const P = ctx.P, L = lift;
    grille(ctx, { poly: [[-0.66, 0.72 + L], [0.66, 0.72 + L], [0.7, 1.17 + L], [-0.7, 1.17 + L]], tex: 'HONEY', fin: FIN.black, surround: FIN.graphite, sw: 0.03 });
    for (let i = -1; i <= 1; i++) patch(ctx, '-z', rrect(i * 0.08 - 0.02, 1.09 + L, i * 0.08 + 0.02, 1.13 + L, 0.008), Lf(0xffa21a, LAMP.DRL), { off: 0.012 });
    patch(ctx, '-z', [[-0.5, 0.92 + L], [0.5, 0.92 + L], [0.5, 1.0 + L], [-0.5, 1.0 + L]], FIN.graphite, { off: 0.012 });
    headlamps(ctx, { poly: [[0.72, 0.98 + L], [0.96, 0.99 + L], [0.97, 1.16 + L], [0.74, 1.16 + L]], housing: FIN.black, drl: [[0.72, 0.99 + L], [0.74, 0.99 + L], [0.74, 1.15 + L], [0.72, 1.15 + L]] });
    box(ctx, FIN.graphite, 0, 0.6 + L, P.zF + 0.12, 1.9, 0.22, 0.3);
    for (const s of [-1, 1]) roundLamp(ctx, '-z', s * 0.6, 0.62 + L, 0.05, 0xffffff, LAMP.DRL, 'HEADR', { off: 0.2, bezel: FIN.black });
    plate(ctx, 'F', { y: 0.78 + L, idx: 3 });
    for (const s of [-1, 1]) { const pts = []; for (let z = B.bed.z0 - 0.02; z <= B.bed.z1 + 0.02; z += 0.2) pts.push([s * 1.0, section(P, z).topY(1.0) + 0.008, z]); tube(ctx, pts, [[-0.045, -0.01], [0.045, -0.01], [0.045, 0.012], [-0.045, 0.012]], FIN.black); }
    taillamps(ctx, { poly: [[0.86, 0.92 + L], [1.0, 0.92 + L], [1.0, 1.3 + L], [0.86, 1.3 + L]], housing: FIN.black, hg: 0.01, rev: [[0.86, 0.86 + L], [1.0, 0.86 + L], [1.0, 0.915 + L], [0.86, 0.915 + L]] });
    badge(ctx, '+z', 0, 1.0 + L, 0.06);
    box(ctx, FIN.graphite, 0, 0.62 + L, P.zR - 0.1, 1.9, 0.18, 0.26);
    plate(ctx, 'R', { y: 0.62 + L, idx: 3 });
    exhausts(ctx, [{ x: -0.62, y: 0.52 + L, r: 0.05, dz: -0.28, len: 0.4 }, { x: 0.62, y: 0.52 + L, r: 0.05, dz: -0.28, len: 0.4 }]);
    const G = P.gh, zr = -0.2, yr = G.roof(zr);
    for (let i = -1; i <= 1; i++) addGeo(ctx, SPH(8, 6), Lf(0xffa21a, LAMP.DRL), M(i * 0.1, yr + 0.02, zr - 0.3, 0, 0, 0, 0.03, 0.015, 0.02));
    ctx.noBounds = true;
    for (const s of [-1, 1]) box(ctx, FIN.black, s * 1.02, 0.46 + L, -0.15, 0.14, 0.04, 2.0);
    ctx.noBounds = false;
    archTrims(ctx, { fin: FIN.black, width: 0.1, out: 0.05, inner: 0.01 });
    mirrors(ctx, { z: -0.8, y: 1.43 + L, fin: FIN.black, len: 0.26, h: 0.2, d: 0.1 });
    handles(ctx, [[-0.25, 1.24 + L], [0.55, 1.24 + L]], FIN.black);
    bothSides(ctx, (dir) => { seam(ctx, dir, [[-1.2, 0.47 + L], [-1.22, 0.9 + L], [-1.1, 1.33 + L]]); seam(ctx, dir, [[0.02, 0.46 + L], [0.02, 1.33 + L]]); seam(ctx, dir, [[0.8, 0.46 + L], [0.8, 1.33 + L]]); });
    wipers(ctx, { list: [[-0.48, 0.66, 0.05], [0.22, 0.62, 0.08]] });
    interior(ctx, { rearSeat: 0.55, seatX: 0.42 });
  };
  return B;
};

// ---- '17 Kestrel Sprint 620 (seven-style lightweight homage): narrow tub, nose cone, cycle wings, side pipe, roll bar
DEFS.kestrel = () => ({
  name: 'Kestrel Sprint 620', defaultPaint: 0x1f7a3d, wheel: { style: 'split5', fin: FIN.black },
  wb: 2.23, ohF: 0.44, ohR: 0.44, R: 0.29, ww: 0.195, wwR: 0.225, rimR: 0.19, tf: 1.3, tr: 1.36,
  body: {
    yb: [[-1.555, 0.22], [-1.3, 0.16], [-0.8, 0.12], [0, 0.11], [1.0, 0.12], [1.4, 0.16], [1.555, 0.22]],
    yh: [[-1.555, 0.46], [-1.3, 0.54], [-0.8, 0.6], [-0.4, 0.64], [0, 0.62], [0.8, 0.62], [1.3, 0.62], [1.555, 0.6]],
    yt: [[-1.555, 0.48], [-1.3, 0.56], [-0.8, 0.63], [-0.4, 0.68], [-0.2, 0.68], [0.8, 0.64], [1.555, 0.62]],
    w: [[-1.555, 0.16], [-1.4, 0.22], [-1.0, 0.3], [-0.4, 0.42], [0.2, 0.5], [0.9, 0.52], [1.3, 0.5], [1.555, 0.46]],
    kw: 0.5, tuck: 0.03, tumble: 0.02, sr: 0.04, crease: 30,
    rndF: { z: 0.12, x: 0.06, t: 0.06, b: 0.04 }, rndR: { z: 0.06, x: 0.03, t: 0.02, b: 0.03 },
    bedY: (z) => (z > -0.35 && z < 0.62 ? 0.3 : null),
  },
  bed: { z0: -0.35, z1: 0.62 },
  lowerMat: (q) => ((q.tag === 'topIn' || q.tag === 'bedWall') && q.z > -0.35 && q.z < 0.62 ? FIN.interior : undefined),
  noArches: true,
  seat: [-0.22, 0.72, 0.28],
  extraBounds: { maxX: 0.8, maxY: 1.0 },
  features: (ctx) => {
    const P = ctx.P;
    patch(ctx, '-z', ell(0, 0.34, 0.12, 0.1, 20), tx(FIN.grille, 'HONEY'), { off: 0.004 });
    // cycle wings (front, on struts), flared rear wings, lamps on stalks, wishbones
    fenderShell(ctx, { zc: P.axleFZ, lz: 0.36, xIn: 0.53, xOut: 0.78, yTop: 0.68, yEnd: 0.52, skirt: 0.06, pow: 0.6, taper: 0.1, lip: 0.01, fin: FIN.paint });
    fenderShell(ctx, { zc: P.axleRZ, lz: 0.5, xIn: 0.44, xOut: 0.82, yTop: 0.67, yEnd: 0.3, skirt: 0.2, pow: 0.45, fin: FIN.paint });
    ctx.noBounds = true;
    for (const s of [-1, 1]) {
      const zf = P.axleFZ;
      cylAB(ctx, FIN.graphite, [s * 0.2, 0.18, zf - 0.12], [s * 0.6, P.R - 0.05, zf], 0.012, 6);
      cylAB(ctx, FIN.graphite, [s * 0.2, 0.18, zf + 0.12], [s * 0.6, P.R - 0.05, zf], 0.012, 6);
      cylAB(ctx, FIN.graphite, [s * 0.22, 0.4, zf - 0.1], [s * 0.6, P.R + 0.08, zf], 0.012, 6);
      cylAB(ctx, FIN.graphite, [s * 0.22, 0.4, zf + 0.1], [s * 0.6, P.R + 0.08, zf], 0.012, 6);
      cylAB(ctx, FIN.black, [s * 0.62, P.R + 0.06, zf], [s * 0.64, 0.64, zf], 0.012, 6);
      // lamp on a stalk beside the nose
      const lx = s * 0.42, ly = 0.6, lz = -1.3;
      cylAB(ctx, FIN.chrome, [s * 0.18, 0.5, -1.25], [lx, ly - 0.02, lz + 0.04], 0.012, 6);
      cylAB(ctx, FIN.chrome, [lx, ly, lz + 0.06], [lx, ly, lz - 0.06], 0.075, 18);
      addGeo(ctx, CYL(18), Lf(0xffffff, LAMP.HEAD, 'HEADR'), M(lx, ly, lz - 0.062, Math.PI / 2, 0, 0, 0.068, 0.004, 0.068));
      ctx.head.push(new THREE.Vector3(lx, ly, lz - 0.08));
      addGeo(ctx, SPH(10, 6), Lf(0xffa21a, LAMP.NONE), M(s * 0.7, 0.62, zf - 0.3, 0, 0, 0, 0.025, 0.02, 0.03));
      addGeo(ctx, SPH(10, 6), Lf(0xd4000c, LAMP.TAIL), M(s * 0.62, 0.52, P.zR + 0.02, 0, 0, 0, 0.04, 0.04, 0.02));
    }
    // side-exit exhaust along the right flank
    tube(ctx, [[0.46, 0.44, -0.8], [0.56, 0.36, -0.5], [0.58, 0.34, 0.3], [0.58, 0.34, 0.75]], ell(0, 0, 0.045, 0.045, 12), FIN.chrome, { crease: 60 });
    ctx.exhaust.push(new THREE.Vector3(0.58, 0.34, 0.77));
    // roll bar + aero screen + cockpit
    const hz = 0.68, pts = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; pts.push([Math.cos(a) * 0.38, 0.6 + Math.sin(a) * 0.36, hz]); }
    tube(ctx, pts, ell(0, 0, 0.022, 0.022, 8), FIN.black, { up: () => [0, 0, 1], crease: 60 });
    cylAB(ctx, FIN.black, [0, 0.95, hz], [0, 0.62, 1.2], 0.02, 8);
    ctx.noBounds = false;
    openScreen(ctx, -0.42, 0.4, 0.18, 0.08, FIN.black, { wrap: 0.03, drop: 0.02 });
    openCockpit(ctx, 0.25, 0.3, { seatX: 0.22, dashY: 0.58, dashW: 0.8, back: 0.42 });
    plate(ctx, 'R', { y: 0.36, idx: 1 });
    seam(ctx, '+y', [[-0.24, -1.0], [0.24, -1.0]]);
    mirrors(ctx, { z: -0.3, y: 0.66, fin: FIN.black, len: 0.12, h: 0.07 });
  },
});

// ---- San Francisco cable car (custom build)
DEFS.cablecar = () => ({
  name: 'Powell Street Cable Car', defaultPaint: 0x7a1a22, defaultPaint2: 0xefe3c4, custom: buildCableCar,
  wb: 5.0, ohF: 1.75, ohR: 1.75, R: 0.26, ww: 0.09, rimR: 0.2, tf: 1.067, tr: 1.067,
  wheel: { style: 'cable', fin: FIN.graphite },
  seat: [0, 2.4, -2.15], door: [-1.6, 0, -2.6],
  W: 2.62, H: 3.14, L: 8.74, extraBounds: { minY: 0.13 },
});

function buildCableCar(ctx) {
  const P = ctx.P, L = 8.5, zF = -4.25, zR = 4.25, hw = 1.16;
  const deckY = 0.78, cab0 = -1.5, cab1 = 2.9, sill = 1.52, winTop = 2.32, eave = 2.52;
  const wood = FIN.wood, woodL = FIN.woodLight, brass = FIN.brass, gold = FIN.gold;
  // underframe + trucks
  box(ctx, FIN.under, 0, 0.56, 0, 1.9, 0.18, L - 0.3);
  for (const z of [P.axleFZ, P.axleRZ]) {
    box(ctx, FIN.graphite, 0, 0.42, z, 1.25, 0.16, 1.2);
    if (!ctx.lod) for (const s of [-1, 1]) box(ctx, FIN.graphite, s * 0.62, 0.3, z, 0.06, 0.2, 0.9);
  }
  if (!ctx.lod) box(ctx, FIN.graphite, 0, 0.28, 0, 0.3, 0.3, 0.6);
  // deck
  box(ctx, woodL, 0, deckY - 0.06, 0, 2.36, 0.12, L);
  box(ctx, FIN.paint, 0, deckY - 0.16, 0, 2.38, 0.1, L - 0.1);
  // running boards along the open front section and side
  for (const s of [-1, 1]) {
    box(ctx, woodL, s * 1.24, 0.47, -2.6, 0.14, 0.04, 3.1);
    if (!ctx.lod) for (const z of [-4.0, -2.6, -1.2]) box(ctx, FIN.graphite, s * 1.2, 0.56, z, 0.05, 0.18, 0.05);
  }
  // front open section: end dash panel, outward benches
  box(ctx, FIN.paint, 0, deckY + 0.3, zF + 0.05, 2.3, 0.6, 0.08);
  box(ctx, FIN.paint2, 0, deckY + 0.64, zF + 0.05, 2.34, 0.08, 0.12);

  for (const s of [-1, 1]) {
    box(ctx, wood, s * 0.93, deckY + 0.42, -2.75, 0.44, 0.06, 2.3);
    box(ctx, FIN.paint, s * 0.93, deckY + 0.2, -2.75, 0.4, 0.4, 2.2);
    box(ctx, wood, s * 0.69, deckY + 0.72, -2.75, 0.05, 0.56, 2.3);
    if (!ctx.lod) box(ctx, wood, s * 1.12, deckY + 0.36, -2.75, 0.06, 0.08, 2.32);
  }
  // grip lever + brake lever
  if (!ctx.lod) {
    cylAB(ctx, FIN.graphite, [0, deckY, -2.4], [0, deckY + 1.15, -2.3], 0.025, 8);
    box(ctx, FIN.graphite, 0, deckY + 1.16, -2.3, 0.2, 0.05, 0.05);
    cylAB(ctx, FIN.graphite, [0.25, deckY, -3.6], [0.28, deckY + 0.95, -3.55], 0.02, 8);
  }
  // cabin: lower panels, posts, windows
  const cz = (cab0 + cab1) / 2, cl = cab1 - cab0;
  for (const s of [-1, 1]) {
    box(ctx, FIN.paint, s * (hw - 0.02), (deckY + sill) / 2, cz, 0.06, sill - deckY, cl);
    box(ctx, FIN.paint2, s * (hw - 0.01), sill + 0.03, cz, 0.08, 0.06, cl + 0.02);
    box(ctx, FIN.paint2, s * (hw - 0.02), (winTop + eave) / 2, cz, 0.06, eave - winTop, cl);
    // pinstripe panel outlines
    const nP = ctx.lod ? 0 : 6;
    for (let i = 0; i < nP; i++) {
      const z0 = cab0 + 0.08 + (i * (cl - 0.16)) / nP, z1 = z0 + (cl - 0.16) / nP - 0.08, y0 = deckY + 0.1, y1 = sill - 0.1;
      const xx = s * (hw + 0.013);
      box(ctx, gold, xx, y0, (z0 + z1) / 2, 0.006, 0.012, z1 - z0);
      box(ctx, gold, xx, y1, (z0 + z1) / 2, 0.006, 0.012, z1 - z0);
      box(ctx, gold, xx, (y0 + y1) / 2, z0, 0.006, y1 - y0, 0.012);
      box(ctx, gold, xx, (y0 + y1) / 2, z1, 0.006, y1 - y0, 0.012);
    }
    // windows + posts
    const nW = 7, ww = cl / nW;
    if (ctx.lod) { box(ctx, FIN.glassProxy, s * (hw - 0.02), (sill + winTop) / 2, cz, 0.05, winTop - sill, cl); continue; }
    for (let i = 0; i <= nW; i++) box(ctx, FIN.paint2, s * (hw - 0.02), (sill + winTop) / 2, cab0 + i * ww, 0.07, winTop - sill, 0.07);
    for (let i = 0; i < nW; i++) {
      const z = cab0 + (i + 0.5) * ww;
      addGeo(ctx, BOX(), FIN.glass, M(s * (hw - 0.02), (sill + winTop) / 2 + 0.03, z, 0, 0, 0, 0.012, winTop - sill - 0.06, ww - 0.07));
      box(ctx, FIN.paint2, s * (hw - 0.01), sill + 0.35, z, 0.03, 0.03, ww - 0.07);
    }

    addGeo(ctx, BOX(), tx(FIN.decal, 'CARNUM'), M(s * (hw + 0.012), deckY + 0.42, cab0 + 0.45, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0.36, 0.26, 0.004));
  }
  // cabin end bulkheads with doors
  for (const [z, sg] of [[cab0, -1], [cab1, 1]]) {
    box(ctx, FIN.paint, 0, (deckY + sill) / 2, z, 2 * hw, sill - deckY, 0.06);
    box(ctx, FIN.paint2, 0, (winTop + eave) / 2, z, 2 * hw, eave - winTop, 0.06);
    if (!ctx.lod) for (const x of [-hw + 0.1, -0.42, 0.42, hw - 0.1]) box(ctx, FIN.paint2, x, (sill + winTop) / 2, z, 0.1, winTop - sill, 0.07);
    if (!ctx.lod) for (const x of [-0.78, 0.78]) addGeo(ctx, BOX(), FIN.glass, M(x, (sill + winTop) / 2, z, 0, 0, 0, 0.6, winTop - sill, 0.012));
    box(ctx, wood, 0, (deckY + winTop) / 2, z + sg * 0.01, 0.8, winTop - deckY, 0.04);
  }
  // cabin interior: inward box + longitudinal benches
  ctx.noBounds = true;
  if (!ctx.lod) addGeo(ctx, new THREE.BoxGeometry(2 * hw - 0.1, eave - deckY - 0.02, cl - 0.08).toNonIndexed(), FIN.interior, M(0, (deckY + eave) / 2, cz, 0, 0, 0, -1, 1, 1));
  if (!ctx.lod) for (const s of [-1, 1]) box(ctx, wood, s * 0.85, deckY + 0.45, cz, 0.42, 0.06, cl - 0.3);
  ctx.noBounds = false;
  // rear open platform: railing + poles
  box(ctx, FIN.paint, 0, deckY + 0.3, zR - 0.05, 2.3, 0.6, 0.08);
  box(ctx, FIN.paint2, 0, deckY + 0.64, zR - 0.05, 2.34, 0.08, 0.12);
  if (!ctx.lod) for (const s of [-1, 1]) cylAB(ctx, brass, [s * 1.12, deckY + 0.9, cab1 + 0.1], [s * 1.12, deckY + 0.9, zR - 0.1], 0.02, 8);
  // brass poles
  const poles = [];
  for (const z of [-4.05, -3.45, -2.85, -2.25, -1.65]) for (const s of [-1, 1]) poles.push([s * 1.14, z]);
  for (const z of [cab1 + 0.2, zR - 0.15]) for (const s of [-1, 1]) poles.push([s * 1.14, z]);
  if (!ctx.lod) for (const [x, z] of poles) cylAB(ctx, brass, [x, deckY, z], [x, eave, z], 0.022, 8, true);
  // roof: arched loft with clerestory, overhanging both ends
  const roofRing = (z) => {
    const pts = [], tags = [];
    const w0 = hw + 0.08, y0 = eave;
    pts.push([0, y0 - 0.04]); tags.push('under');
    pts.push([w0, y0 - 0.04]); tags.push('edge');
    pts.push([w0, y0 + 0.04]); tags.push('slope');
    for (const f of [0.8, 0.62]) { pts.push([w0 * f, y0 + 0.04 + 0.3 * (1 - f * f)]); tags.push(f === 0.62 ? 'clr' : 'slope'); }
    pts.push([0.56, y0 + 0.36]); tags.push('clrWin');
    pts.push([0.56, y0 + 0.52]); tags.push('clr');
    pts.push([0.3, y0 + 0.58]); tags.push('clr');
    pts.push([0, y0 + 0.6]);
    return { pts, tags };
  };
  const rs = new Soup(), zs = fillStations([zF - 0.1, zR + 0.1], ctx.lod ? 2 : 0.5);
  loft(rs, zs, roofRing, (q) => (q.tag === 'under' ? FIN.interior : q.tag === 'edge' ? FIN.paint2 : q.tag === 'clrWin' ? (Math.abs(q.z) < 3.8 ? FIN.glassProxy : FIN.roofGrey) : FIN.roofGrey), { closed: true, capStart: true, capEnd: true, capFin: FIN.paint2 });
  emitSoup(ctx, rs, 40, true);
  ctx.proj = new Projector(ctx.tgtP, ctx.tgtN);
  // destination signs on both roof ends
  for (const [z, sg] of [[zF - 0.1, -1], [zR + 0.1, 1]]) {
    addGeo(ctx, BOX(), tx(FIN.decal, 'CABLESIGN'), M(0, eave + 0.3, z + sg * 0.012, 0, sg < 0 ? Math.PI : 0, 0, 1.3, 0.24, 0.01));
  }
  // lights: headlamp at each end, tail lamps at the rear
  for (const [z, sg] of [[zF, -1], [zR, 1]]) {
    const nL = ctx.lod ? 6 : 14;
    cylAB(ctx, brass, [0, deckY + 0.3, z + sg * 0.04], [0, deckY + 0.3, z + sg * 0.14], 0.1, nL);
    addGeo(ctx, CYL(nL), Lf(0xfff4dc, LAMP.HEAD, 'HEADR'), M(0, deckY + 0.3, z + sg * 0.142, Math.PI / 2, 0, 0, 0.085, 0.004, 0.085));
    box(ctx, FIN.graphite, 0, 0.62, z + sg * 0.06, 1.8, 0.12, 0.12);
  }
  ctx.head.push(new THREE.Vector3(-0.08, deckY + 0.3, zF - 0.15), new THREE.Vector3(0.08, deckY + 0.3, zF - 0.15));
  for (const s of [-1, 1]) addGeo(ctx, CYL(ctx.lod ? 6 : 10), Lf(0xc8000a, LAMP.TAIL), M(s * 0.9, deckY + 0.45, zR + 0.012, Math.PI / 2, 0, 0, 0.05, 0.02, 0.05));
  // bell
  if (!ctx.lod) addGeo(ctx, SPH(10, 6), brass, M(0, eave - 0.1, -3.3, 0, 0, 0, 0.09, 0.09, 0.09));
}

// ================================================================== wheels
function buildWheel(P, lod) {
  const soup = new Soup(), R = P.R, hw = P.ww / 2, rb = P.rimR, W = P.wheel || {}, S = lod ? 8 : (P._wheelSegs || 14);
  const rim = W.fin || FIN.alu, lip = W.lip || rim;
  if (W.style === 'cable') {
    revolve(soup, [[-hw, R * 0.92], [-hw, R], [hw * 0.6, R], [hw, R * 0.94], [hw, R * 0.7], [hw * 0.5, R * 0.62], [hw * 0.5, 0.06], [hw * 0.9, 0.05], [hw * 0.9, 0.0]], S, [FIN.steel, FIN.steel, FIN.steel, rim, rim, rim, FIN.graphite, FIN.graphite]);
    if (!lod) revolve(soup, [[-hw * 1.8, R * 1.1], [-hw, R * 1.1], [-hw, R * 0.9]], S, FIN.steel);
  } else if (lod) {
    revolve(soup, [[-hw, rb * 0.9], [-hw, R], [hw, R], [hw, rb], [hw * 0.6, 0]], S, [FIN.tyre, FIN.tread, FIN.tyre, W.style === 'steel' || W.style === 'bus' ? FIN.silver : rim]);
  } else {
    const prof = [
      [-hw * 0.84, rb], [-hw, lerp(rb, R, 0.55)], [-hw * 0.62, R], [hw * 0.62, R], [hw * 0.94, R - 0.018], [hw, lerp(rb, R, 0.5)], [hw * 0.84, rb],
      [hw * 0.9, rb - 0.01], [hw * 0.5, rb - 0.026], [-hw * 0.5, rb - 0.03], [-hw * 0.5, 0.0],
    ];
    const fins = [FIN.tyre, FIN.tyre, FIN.tread, FIN.tyre, FIN.tyre, FIN.tyre, lip, lip, FIN.barrel, FIN.wheelBack];
    revolve(soup, prof, S, fins);
    revolve(soup, [[-hw * 0.1, rb * 0.8], [-hw * 0.1, rb * 0.42]], S, FIN.rotor);
  }
  if (lod || W.style === 'cable') {
    const c = makeCtx(P, lod); c.noBounds = true; emitSoup(c, soup, 50); return c.B.details;
  }
  const rIn = rb - 0.024, aF = hw * 0.5, hubR = Math.max(0.045, rb * 0.24);
  const spokeAB = (p0, p1, w0, w1, a0, a1, d, fin, ridge = 0.004) => {
    const dy = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dy, dz) || 1, ny = -dz / l, nz = dy / l;
    const V = (p, t, a) => [a, p[0] + ny * t, p[1] + nz * t];
    const A0 = V(p0, -w0, a0), A1 = V(p1, -w1, a1), B0 = V(p0, w0, a0), B1 = V(p1, w1, a1), M0 = V(p0, 0, a0 + ridge), M1 = V(p1, 0, a1 + ridge);
    const A0b = V(p0, -w0, a0 - d), A1b = V(p1, -w1, a1 - d), B0b = V(p0, w0, a0 - d), B1b = V(p1, w1, a1 - d);
    quadO(soup, A0, A1, M1, M0, [1, 0, 0], fin); quadO(soup, M0, M1, B1, B0, [1, 0, 0], fin);
    quadO(soup, A0, A1, A1b, A0b, [0, -ny, -nz], fin); quadO(soup, B0, B1, B1b, B0b, [0, ny, nz], fin);
  };
  const pol = (r, th) => [r * Math.cos(th), r * Math.sin(th)];
  const hub = (fin, capFin, nuts = 5) => {
    revolve(soup, [[aF - 0.035, hubR], [aF + 0.004, hubR], [aF + 0.014, hubR * 0.72], [aF + 0.014, 0]], 8, fin);
    if (capFin) revolve(soup, [[aF + 0.014, hubR * 0.42], [aF + 0.02, hubR * 0.36], [aF + 0.02, 0]], 8, capFin);
    if (!lod && nuts) for (let i = 0; i < nuts; i++) {
      const [y, z] = pol(hubR * 0.62, (i / nuts) * TAU + 0.3);
      revolve(soup, [[aF + 0.012, 0.009], [aF + 0.026, 0.009], [aF + 0.026, 0]], 5, FIN.chrome, (a, yy, zz) => [a, y + yy, z + zz]);
    }
  };
  const style = W.style || 'split5';
  if (style === 'cable') { /* disc wheel already complete */ }
  else if (style === 'steel' || style === 'bus') {
    const face = style === 'bus' ? FIN.alu : rim;
    revolve(soup, [[aF, rb - 0.028], [aF - 0.02, rb * 0.82], [aF - 0.03, rb * 0.62], [aF - 0.005, rb * 0.45], [aF + 0.005, hubR * 1.1], [aF + 0.005, 0]], 16, face);
    if (!lod) {
      const nh = style === 'bus' ? 8 : 6;
      for (let i = 0; i < nh; i++) {
        const [y, z] = pol(rb * 0.72, (i / nh) * TAU);
        revolve(soup, [[aF - 0.024, 0.022], [aF - 0.024, 0]], 7, FIN.wheelBack, (a, yy, zz) => [a, y + yy, z + zz]);
      }
    }
    if (W.cap || style === 'bus') revolve(soup, [[aF, rb * 0.45], [aF + 0.03, rb * 0.36], [aF + 0.045, 0]], 12, W.cap || FIN.chrome);
    if (style === 'bus' && !lod) for (let i = 0; i < 8; i++) {
      const [y, z] = pol(rb * 0.5, (i / 8) * TAU);
      revolve(soup, [[aF, 0.013], [aF + 0.025, 0.013], [aF + 0.025, 0]], 6, FIN.chrome, (a, yy, zz) => [a, y + yy, z + zz]);
    }
  } else if (style === 'aero') {
    revolve(soup, [[aF, rb - 0.028], [aF + 0.008, rb * 0.8], [aF + 0.012, rb * 0.4], [aF + 0.012, 0]], 16, rim);
    if (!lod) for (let i = 0; i < 5; i++) {
      const th = (i / 5) * TAU;
      spokeAB(pol(rb * 0.42, th), pol(rb * 0.88, th + 0.35), 0.018, 0.012, aF + 0.014, aF + 0.009, 0.004, FIN.wheelBack, 0);
    }
    hub(rim, FIN.darkChrome, 0);
  } else {
    const n = { split5: 5, y5: 5, torq5: 5, fuchs5: 5, multi6: 6, rally6: 6, mesh10: 10 }[style] || 5;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      if (style === 'split5') for (const d of [-0.1, 0.1]) spokeAB(pol(hubR * 0.9, th + d * 0.5), pol(rIn, th + d), 0.011, 0.014, aF + 0.012, aF - 0.004, 0.03, rim);
      else if (style === 'y5') {
        const rm = lerp(hubR, rIn, 0.45);
        spokeAB(pol(hubR * 0.9, th), pol(rm, th), 0.016, 0.014, aF + 0.012, aF + 0.004, 0.03, rim);
        for (const d of [-0.2, 0.2]) spokeAB(pol(rm, th), pol(rIn, th + d), 0.011, 0.012, aF + 0.004, aF - 0.004, 0.03, rim);
      } else if (style === 'torq5') spokeAB(pol(hubR * 0.9, th), pol(rIn, th), 0.018, 0.048, aF + 0.004, aF, 0.035, rim, 0.002);
      else if (style === 'fuchs5') {
        spokeAB(pol(hubR * 0.9, th), pol(rIn, th), 0.03, 0.05, aF + 0.01, aF - 0.002, 0.035, rim, 0.006);
        spokeAB(pol(hubR * 1.2, th), pol(rIn - 0.02, th), 0.018, 0.032, aF + 0.0165, aF + 0.0045, 0.004, FIN.graphite, 0.0);
      } else if (style === 'multi6') {
        spokeAB(pol(hubR * 0.9, th), pol(rIn, th - 0.08), 0.02, 0.018, aF + 0.012, aF, 0.03, rim);
        spokeAB(pol(hubR * 0.9, th), pol(rIn, th + 0.08), 0.02, 0.018, aF + 0.012, aF, 0.03, rim);
      } else if (style === 'rally6') spokeAB(pol(hubR * 0.9, th), pol(rIn, th), 0.024, 0.03, aF + 0.004, aF - 0.004, 0.04, rim, 0.003);
      else spokeAB(pol(hubR * 0.9, th), pol(rIn, th), 0.009, 0.012, aF + 0.01, aF - 0.004, 0.03, rim);
    }
    hub(rim, style === 'torq5' ? FIN.chrome : FIN.darkChrome, style === 'rally6' ? 0 : 5);
  }
  const ctx = makeCtx(P, lod);
  ctx.noBounds = true;
  emitSoup(ctx, soup, 50);
  return ctx.B.details;
}

// ================================================================== assembly + caches
// roster models that do not have their own body yet borrow the closest existing one
const STANDIN = { piccina: 'hatch', nipper: 'hatch', petard: 'hatch', gauner: 'hatch', tora: 'hatch', brawler: 'muscle', vandal: 'muscle', stallion18: 'muscle', hellion: 'muscle', corsair: 'coupe', rz7: 'coupe', kaminari: 'coupe', raiden: 'sedan', senkou: 'super', hachi: 'hatch', sora: 'coupe', classic9: 'coupe', coupeGT: 'coupe', k5: 'sedan', k3: 'sedan', sovereign: 'muscle', vanguard: 'coupe', sport1: 'rally', aspro: 'rally', rallye6: 'sedan', saetta: 'super', seiun: 'sedan', contessa: 'super', tempesta: 'super', stradale: 'coupe', funo: 'super', aska: 'super', celerite: 'super', munja: 'super', elektra: 'ev', trophy: 'pickup', buggy: 'rally', trekker: 'suv', kodiak: 'suv', baja: 'pickup', kugel: 'hatch', picknick: 'van', comet: 'muscle', kestrel: 'rally' };
const PDEF = new Map();
// body pass 3 (tools/blender/car_body.py notes): sculpt amounts for the hero / top-traffic bodies, metres. fl* arch flares /
// haunches (flW band width), waist = coke-bottle pinch between the arches, shoulder / cove / rocker = side section, dome /
// crown = bonnet, ghIn = extra greenhouse tumblehome, ghTaper = cabin plan taper towards the C-pillar; rndF / rndR override
// the end rounding lengths (zt top, zx plan, zb bottom: long top + short bottom = raked fascia, chin forward).
const SCULPT_SEDAN = { flF: 0.028, flR: 0.03, waist: 0.012, shoulder: 0.008, cove: 0.01, rocker: 0.014, dome: 0.01, crown: 0.012, ghIn: 0.03, ghTaper: 0.03, rndF: { zt: 0.52, t: 0.15, zx: 0.45, x: 0.19, zb: 0.1, b: 0.05 }, rndR: { zt: 0.34, t: 0.08, zx: 0.3, x: 0.13, zb: 0.1 } };
const SCULPT = {
  sedan: SCULPT_SEDAN, taxi: SCULPT_SEDAN,
  hatch: { flF: 0.03, flR: 0.034, waist: 0.012, shoulder: 0.008, cove: 0.01, rocker: 0.014, dome: 0.008, crown: 0.012, ghIn: 0.03, ghTaper: 0.03, rndF: { zt: 0.48, t: 0.14, zx: 0.42, x: 0.17, zb: 0.1, b: 0.05 }, rndR: { zt: 0.16, zx: 0.18, x: 0.08 } },
  ev: { flF: 0.022, flR: 0.026, waist: 0.008, shoulder: 0.006, cove: 0.008, rocker: 0.012, dome: 0.006, crown: 0.01, ghIn: 0.04, ghTaper: 0.04, rndF: { zt: 0.6, t: 0.16, zx: 0.5, x: 0.22, zb: 0.14, b: 0.06 }, rndR: { zt: 0.36, t: 0.07, zx: 0.32, x: 0.14 } },
  suv: { flF: 0.035, flR: 0.035, flW: 0.24, waist: 0.01, shoulder: 0.008, cove: 0.014, rocker: 0.02, dome: 0.012, crown: 0.014, ghIn: 0.03, ghTaper: 0.025, rndF: { zt: 0.45, t: 0.12, zx: 0.36, x: 0.14, zb: 0.14, b: 0.08 }, rndR: { zt: 0.2, zx: 0.22, x: 0.1 } },
  pickup: { flF: 0.04, flR: 0.04, flW: 0.24, waist: 0.008, shoulder: 0.006, cove: 0.012, rocker: 0.02, dome: 0.016, crown: 0.012, ghIn: 0.025, rndF: { zt: 0.36, t: 0.1, zx: 0.28, x: 0.13, zb: 0.12, b: 0.07 } },
  tora: { flF: 0.045, flR: 0.042, waist: 0.016, shoulder: 0.008, cove: 0.016, rocker: 0.018, dome: 0.008, crown: 0.016, ghIn: 0.04, ghTaper: 0.04, rndF: { zt: 0.45, t: 0.12, zx: 0.38, x: 0.15, zb: 0.07, b: 0.03 }, rndR: { zt: 0.2, zx: 0.2, x: 0.09 } },
  rallye6: { flF: 0.05, flR: 0.05, flW: 0.22, waist: 0.014, shoulder: 0.006, cove: 0.012, rocker: 0.016, dome: 0.012, crown: 0.012, ghIn: 0.03, ghTaper: 0.03, rndF: { zt: 0.38, t: 0.1, zx: 0.3, x: 0.12, zb: 0.08 }, rndR: { zt: 0.22, zx: 0.2, x: 0.08 } },
  stallion18: { flF: 0.03, flR: 0.05, flW: 0.26, waist: 0.016, shoulder: 0.012, cove: 0.012, rocker: 0.016, dome: 0.018, crown: 0.01, ghIn: 0.04, ghTaper: 0.06, rndF: { zt: 0.3, t: 0.08, zx: 0.4, x: 0.16, zb: 0.16, b: 0.08 }, rndR: { zt: 0.22, zx: 0.26, x: 0.1 } },
  coupe: { flF: 0.045, flR: 0.07, flW: 0.28, waist: 0.016, shoulder: 0.004, cove: 0.008, rocker: 0.012, crown: 0.022, ghIn: 0.045, ghTaper: 0.07, rndF: { zt: 0.6, t: 0.14, zx: 0.5, x: 0.22, zb: 0.12 }, rndR: { zt: 0.5, t: 0.1, zx: 0.4, x: 0.17 } },
  super: { flF: 0.035, flR: 0.065, flW: 0.28, waist: 0.02, shoulder: 0.004, cove: 0.01, rocker: 0.012, crown: 0.016, ghIn: 0.03, ghTaper: 0.06, rndF: { zx: 0.3, x: 0.14, zt: 0.22, zb: 0.06 }, rndR: { zt: 0.14, zx: 0.2, x: 0.08 } },
  muscle: { flF: 0.02, flR: 0.05, flW: 0.3, waist: 0.014, shoulder: 0.012, cove: 0.01, rocker: 0.014, dome: 0.02, crown: 0.008, ghIn: 0.035, ghTaper: 0.06, rndF: { zx: 0.22, x: 0.09 }, rndR: { zx: 0.18, x: 0.07 } },
  k5: { flF: 0.035, flR: 0.042, waist: 0.014, shoulder: 0.012, cove: 0.014, rocker: 0.016, dome: 0.016, crown: 0.014, ghIn: 0.035, ghTaper: 0.03, rndF: { zt: 0.5, t: 0.13, zx: 0.42, x: 0.17, zb: 0.1, b: 0.05 }, rndR: { zt: 0.3, t: 0.07, zx: 0.28, x: 0.12, zb: 0.1 } },
};

function getP(id) {
  if (PDEF.has(id)) return PDEF.get(id);
  const mk = DEFS[id] || DEFS[STANDIN[id]];
  if (!mk) throw new Error('models.js: unknown car model id "' + id + '"');
  const raw = mk(), P = Object.assign({ id }, raw);
  P.zF = -raw.wb / 2 - raw.ohF; P.zR = raw.wb / 2 + raw.ohR;
  P.axleFZ = -raw.wb / 2; P.axleRZ = raw.wb / 2;
  P.wwR = raw.wwR || raw.ww;
  const R = raw.R;
  const mkA = (z, o) => { const cy = R + (o.dy ?? 0.02), top = 2 * R + (o.top ?? 0.05); return { z, cy, ra: R + (o.side ?? 0.07), rh: top - cy, p: o.p ?? 2.2 }; };
  const ar = raw.arch || {};
  // noArches: wheels sit outside the body (cycle wings, open-wheelers): nothing is cut from the lower body
  P.arches = raw.noArches ? [] : [mkA(P.axleFZ, ar.F || ar), mkA(P.axleRZ, ar.R || ar)];
  P.xi = Math.min(raw.tf / 2 - raw.ww / 2, raw.tr / 2 - P.wwR / 2) - 0.03;
  if (raw.body) {
    const b = raw.body;
    Object.assign(P, {
      yb: F(b.yb), yt: F(b.yt), yh: F(b.yh), w: F(b.w), kw: b.kw ?? 0.45, tuck: b.tuck ?? 0.05, tuckPow: b.tuckPow ?? 2, tumble: b.tumble ?? 0.03,
      sr: b.sr ?? 0.06, crease: b.crease ?? 38, lodSpacing: b.lodSpacing, charY: b.charY != null ? F(b.charY) : null, charD: b.charD ?? 0.006, levels: b.levels || null, lodLevels: b.lodLevels || null, levelsOnly: !!b.levelsOnly, archN: b.archN, bedY: b.bedY || null, spacing: b.spacing,
      rndF: Object.assign({ z: 0.15, x: 0.1, t: 0.05, b: 0.04 }, b.rndF), rndR: Object.assign({ z: 0.12, x: 0.08, t: 0.04, b: 0.04 }, b.rndR),
    });
    const S0 = !raw.noArches && !(typeof location !== 'undefined' && /[?&]sculpt=0/.test(location.search)) && SCULPT[id];
    if (S0) {
      const SC = Object.assign({ flF: 0, flR: 0, flW: 0.2, waist: 0, shoulder: 0, cove: 0, rocker: 0, dome: 0, crown: 0, ghIn: 0, ghTaper: 0 }, S0);
      SC._base = Math.max(0, Math.max(SC.flF, SC.flR) - 0.008);
      if (S0.rndF) Object.assign(P.rndF, S0.rndF);
      if (S0.rndR) Object.assign(P.rndR, S0.rndR);
      P.sculpt = SC;
    }
  }
  if (raw.gh) {
    const g = raw.gh;
    P.gh = Object.assign({}, g, { roof: F(g.roof), wb: F(g.wb), wt: F(g.wt), rc: g.rc ?? 0.07, crown: g.crown ?? 0.03, bulge: g.bulge ?? 0.012 });
    const G = P.gh;
    if (P.sculpt) {
      // greenhouse follows the pulled-in body (most of the base + waist), leans in more (tumblehome) and tapers in plan
      // towards the C-pillar
      const SC = P.sculpt, wb0 = G.wb, wt0 = G.wt, rearT = (z) => sstep(G.z0 + (G.z1 - G.z0) * 0.45, G.z1, z);
      const shift = (z) => 0.75 * (SC._base + SC.waist * sculptBetween(P, z)) + SC.ghTaper * rearT(z);
      G.wb = (z) => wb0(z) - shift(z);
      G.wt = (z) => wt0(z) - shift(z) - SC.ghIn;
    }
    P.topIn = (z) => G.wb(z) - 0.015;
    if (P.bed) { const bz = P.bed.z0; P.topIn = (z) => (z < bz - 0.05 ? G.wb(z) - 0.015 : 0.925); }
    const above = (z) => G.roof(z) - G.crown - section(P, z).topY(G.wb(z));
    let a = G.z0; while (a < G.z1 && above(a) < 0.004) a += 0.002;
    let b = G.z1; while (b > G.z0 && above(b) < 0.004) b -= 0.002;
    G.zE0 = a; G.zE1 = b;
    // driver eye: ~1.06 m behind the windshield base, 0.27 m above the belt, left seat
    const ez = a + (raw.seatDZ ?? 1.06), belt = section(P, ez).topY(0.4);
    P.eye = [-(raw.seatX ?? 0.37), +(Math.min(belt + 0.27, G.roof(clamp(ez, G.z0, G.z1)) - G.crown - 0.14)).toFixed(3), +ez.toFixed(3)];
    if (!raw.seat) P.seat = P.eye;
  }
  PDEF.set(id, P);
  return P;
}

function bucketGeometry(bk, kind) {
  if (!bk.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.nor, 3));
  if (kind === 'details' || kind === 'lamps' || kind === 'proxy') {
    g.setAttribute('color', new THREE.Float32BufferAttribute(bk.col, 3));
    if (kind !== 'proxy') g.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
  }
  if (kind === 'details') g.setAttribute('surf', new THREE.Float32BufferAttribute(bk.surf, 2));
  if (kind === 'lamps') g.setAttribute('lampId', new THREE.Float32BufferAttribute(bk.lamp, 1));
  const m = mergeVertices(g, 1e-5);
  m.computeBoundingBox(); m.computeBoundingSphere();
  return m;
}

const GEOM = new Map();
function getGeoms(id) {
  if (GEOM.has(id)) return GEOM.get(id);
  const P = getP(id), ctx = makeCtx(P, 0);
  if (P.custom) P.custom(ctx);
  else { buildBody(ctx); if (P.features) P.features(ctx); }
  const geoms = {};
  for (const k of ['paint', 'paint2', 'details', 'glass', 'lamps']) geoms[k] = bucketGeometry(ctx.B[k], k);
  const wheel = bucketGeometry(buildWheel(P, 0), 'details');
  const out = { P, geoms, wheel, head: ctx.head.slice(0, 2), exhaust: ctx.exhaust.slice(), bmin: ctx.bmin.slice(), bmax: ctx.bmax.slice() };
  if (out.head.length < 2) {
    const y = P.R * 2, z = P.zF + 0.05;
    out.head = [new THREE.Vector3(-0.6, y, z), new THREE.Vector3(0.6, y, z)];
  }
  GEOM.set(id, out);
  return out;
}

// ================================================================== materials
let SHARED = null;
function surfOBC(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 surf;\nvarying vec2 vSurf;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vSurf;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.y;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.x;');
}
function lampOBC(shader) {
  shader.uniforms.uLamp = this.userData.uLamp;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float lampId;\nuniform float uLamp[10];\nvarying float vLampI;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampI = uLamp[int(lampId + 0.5)];');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vLampI;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vLampI;');
}
function shared() {
  if (SHARED) return SHARED;
  const atlas = getAtlas();
  const details = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, alphaTest: 0.5, roughness: 0.5, metalness: 0 });
  details.onBeforeCompile = surfOBC;
  details.customProgramCacheKey = () => 'hb-car-surf';
  details.name = 'car-details';
  const glass = makeGlass(0);
  SHARED = { atlas, details, glass };
  return SHARED;
}
// Glass: premultiplied blending so the tint darkens what is behind by opacity while reflections stay at full strength
// (plain alpha blending scaled the sky reflection by the opacity: windows read as flat dark plastic). Fresnel raises
// the opacity at grazing angles; reflections get the car IBL boost + horizon occlusion.
function makeGlass(tint = 0) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x0b1116).multiplyScalar(1 - tint * 0.6), metalness: 0, roughness: 0.02,
    transparent: true, opacity: 0.58 + tint * 0.36, depthWrite: false, premultipliedAlpha: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + envGlsl('2.6'))
      .replace('#include <opaque_fragment>', `vec3 hbSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        float hbF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
        float hbA = mix(diffuseColor.a, 0.94, hbF);
        gl_FragColor = vec4(outgoingLight - hbSpec + hbSpec / max(hbA, 0.05), hbA);`);
    applyCarProbe(sh);
  };
  m.customProgramCacheKey = () => 'hb-car-glass-v2';
  m.name = 'car-glass';
  return m;
}
// street paint: solid whites / blacks carry little flake, greys / silvers / blues are metallic
function flakeFor(hex) {
  const c = C(hex), hsl = {}; c.getHSL(hsl);
  return hsl.l > 0.8 || hsl.l < 0.06 ? 0.08 : hsl.s < 0.25 ? 0.5 : 0.3;
}
function makePaint(hex, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.45, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.035 });
  m.name = 'car-paint';
  const U = m.userData.hbU = paintUniforms({ flake: o.flake ?? flakeFor(hex), dirt: o.dirt ?? 0, wear: o.wear ?? 0 });
  m.onBeforeCompile = sh => { paintLayersOBC(sh, U); boostPaintEnv(sh); };
  m.customProgramCacheKey = () => 'car-paint-env-v3';
  return m;
}
// The world's IBL is graded down (~0.4) so walls and roads don't look plastic; lacquered car paint (and glass) must
// mirror the sky much more strongly than that or it reads as matte plastic. three ignores material.envMapIntensity
// for scene.environment, so scale the IBL terms in the shader.
const PAINT_ENV_BOOST = 2.4;
function boostPaintEnv(shader, k = PAINT_ENV_BOOST) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + envGlsl(k.toFixed(2)));
  applyCarProbe(shader);   // the player car's reflection probe (render/carprobe.js): the real street around nearby cars
}
// IBL boost + horizon occlusion: reflection vectors that point below the horizon see asphalt, not the sky dome
// (the PMREM's lower half is bright fog, which is what made lower doors and sills glow like plastic).
function envGlsl(k) {
  return `#ifdef USE_ENVMAP
  { vec3 hbRw = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
    float hbW = 0.03 + material.roughness * 0.5;
    radiance *= ${k} * mix(0.12, 1.0, smoothstep(-hbW, hbW + 0.02, hbRw.y));
    #ifdef USE_CLEARCOAT
    float hbWc = 0.03 + material.clearcoatRoughness * 0.5;
    clearcoatRadiance *= ${k} * mix(0.1, 1.0, smoothstep(-hbWc, hbWc + 0.02, hbRw.y));
    #endif
  }
#endif
`;
}

// ================================================================== paint finishes + liveries (per-instance "look")
// look = { paint, finish, pearl, paint2, rim, rimColor, rimFinish, caliper, tint, livery: { kind, color, color2, number } }
export const FINISHES = {
  gloss: { name: 'Gloss', metalness: 0.04, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, flake: 0 },
  metallic: { name: 'Metallic flake', metalness: 0.62, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, flake: 0.55 },
  pearl: { name: 'Pearlescent', metalness: 0.4, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.03, flake: 0.3, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [260, 720] },
  candy: { name: 'Candy', metalness: 0.88, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, flake: 0.25 },
  satin: { name: 'Satin', metalness: 0.35, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35, flake: 0.15 },
  matte: { name: 'Matte', metalness: 0.08, roughness: 0.66, clearcoat: 0, clearcoatRoughness: 0.5, flake: 0, sheen: 0.25 },
  chrome: { name: 'Chrome', metalness: 1, roughness: 0.06, clearcoat: 0.5, clearcoatRoughness: 0.02, flake: 0 },
};
export const RIM_STYLES = { split5: 'Split 5-spoke', y5: 'Y-spoke', multi6: 'Twin 6-spoke', mesh10: '10-spoke', rally6: 'Rally 6-spoke', torq5: 'Muscle 5-slot', fuchs5: 'Classic leaf', aero: 'Aero disc', steel: 'Steelie' };
export const RIM_FINISHES = { alu: ['Silver', 0.95, 0.26], chrome: ['Chrome', 1.0, 0.06], gun: ['Gunmetal', 0.9, 0.33], black: ['Gloss black', 0.3, 0.18], matte: ['Matte black', 0.1, 0.7], gold: ['Gold', 1.0, 0.22], white: ['White', 0.05, 0.35], paint: ['Custom', 0.4, 0.28] };
export const LIVERIES = { none: 'None', stripes: 'Centre stripe', twin: 'Twin stripes', side: 'Side stripe', twotone: 'Two-tone roof', number: 'Race number', race: 'Full race' };

// Object-space livery + metallic flake, patched into the paint shader (hero instances only).
function paintOBC(shader) {
  const U = this.userData.liv;
  paintLayersOBC(shader, this.userData.hbU);
  Object.assign(shader.uniforms, U);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLivP; varying vec3 vLivN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLivP = position; vLivN = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vLivP; varying vec3 vLivN;
uniform vec4 uStripe; uniform vec3 uStripeCol; uniform vec4 uTone; uniform vec3 uToneCol; uniform vec4 uSide; uniform vec4 uSideZ; uniform vec3 uSideCol;
uniform sampler2D uNum; uniform vec4 uNumRect; uniform float uFlake;
float livHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float band(float v, float a, float b){ float w = fwidth(v) * 0.75 + 1e-4; return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v)); }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 lc = diffuseColor.rgb; vec3 an = abs(vLivN);
  if (uTone.z > 0.5) { float s = uTone.y * (vLivP.y - uTone.x); float w = fwidth(vLivP.y) + 1e-4; lc = mix(lc, uToneCol, smoothstep(-w, w, s)); }
  if (uSide.z > 0.5 && an.x > 0.45) { float m = band(vLivP.y, uSide.x, uSide.y) * band(vLivP.z, uSideZ.x, uSideZ.y); lc = mix(lc, uSideCol, m); }
  if (uStripe.z > 0.5 && an.x < 0.8) { float ax = abs(vLivP.x); lc = mix(lc, uStripeCol, band(ax, uStripe.x, uStripe.x + uStripe.y)); }
  if (uNumRect.w > 0.5 && an.x > 0.55) {
    vec2 q = vec2(0.5 + (uNumRect.x - vLivP.z) * sign(vLivP.x) / (2.0 * uNumRect.z), 0.5 + (vLivP.y - uNumRect.y) / (2.0 * uNumRect.z));
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) { vec4 t = texture2D(uNum, q); lc = mix(lc, t.rgb, t.a); }
  }
  diffuseColor.rgb = lc;
}`);
  boostPaintEnv(shader);
}
function numberTexture(num, col = '#111111', ring = '#ffffff') {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; return t; }
  c.width = c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = ring; g.beginPath(); g.arc(128, 128, 118, 0, TAU); g.fill();
  g.lineWidth = 10; g.strokeStyle = col; g.beginPath(); g.arc(128, 128, 104, 0, TAU); g.stroke();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  const s = String(num ?? 27).slice(0, 3);
  g.font = `italic 900 ${s.length > 2 ? 104 : 138}px "Barlow Condensed", Impact, Arial Black, sans-serif`;
  g.fillText(s, 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function makeHeroPaint(hex) {
  const m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 });
  m.name = 'car-paint';
  m.userData.liv = {
    uStripe: { value: new THREE.Vector4() }, uStripeCol: { value: new THREE.Color() }, uTone: { value: new THREE.Vector4() }, uToneCol: { value: new THREE.Color() },
    uSide: { value: new THREE.Vector4() }, uSideZ: { value: new THREE.Vector4() }, uSideCol: { value: new THREE.Color() },
    uNum: { value: null }, uNumRect: { value: new THREE.Vector4() }, uFlake: { value: 0 },
  };
  m.userData.liv.uNum.value = numberTexture(27);
  m.userData.hbU = paintUniforms({ flake: 0.55, dirt: 0.08, wear: 0 });
  m.onBeforeCompile = paintOBC;
  m.customProgramCacheKey = () => 'hb-paint-hero-v2';
  return m;
}
function applyFinish(m, finish, hex) {
  const F = FINISHES[finish] || FINISHES.metallic;
  m.color.setHex(finish === 'chrome' && hex == null ? 0xdfe3e8 : hex ?? m.color.getHex());
  m.metalness = F.metalness; m.roughness = F.roughness; m.clearcoat = F.clearcoat; m.clearcoatRoughness = F.clearcoatRoughness;
  m.iridescence = F.iridescence || 0;
  if (F.iridescence) { m.iridescenceIOR = F.iridescenceIOR; m.iridescenceThicknessRange = F.iridescenceThicknessRange.slice(); }
  m.sheen = F.sheen || 0; if (F.sheen) m.sheenRoughness = 0.6;
  if (m.userData.hbU) m.userData.hbU.uHbFlake.value = F.flake || 0;
}
function makeLamps() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: shared().atlas, roughness: 0.22, metalness: 0 });
  m.userData.uLamp = { value: new Float32Array([0.05, 0.15, 0.6, 0, 0.05, 0.2, 0.2, 0.35, 1.4, 1.6]) };
  m.onBeforeCompile = function (sh) { lampOBC.call(this, sh); lampDepthOBC(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + envGlsl('mix(1.0, 2.0, metalnessFactor)')); applyCarProbe(sh); };
  m.customProgramCacheKey = () => 'hb-car-lamp-v2';
  m.name = 'car-lamps';
  return m;
}

/** clear lamp lens over the modelled housings (body pass 2): premultiplied like the glass (reflections at full strength),
 *  tinted by the atlas lamp art (red tail lenses, clear heads), a little of the lamp group's light scattered in the lens */
function makeLens(lamps) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: shared().atlas, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, premultipliedAlpha: true });
  m.userData.uLamp = lamps.userData.uLamp;
  m.onBeforeCompile = function (sh) {
    lampOBC.call(this, sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float hbL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(0.92), diffuseColor.rgb / max(hbL, 0.05) * 0.6, step(0.12, max(diffuseColor.r - diffuseColor.g, 0.0)) ); }`)
      .replace('totalEmissiveRadiance += diffuseColor.rgb * vLampI;', 'totalEmissiveRadiance += diffuseColor.rgb * vLampI * 0.35;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + envGlsl('2.6'))
      .replace('#include <opaque_fragment>', `vec3 hbSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        float hbF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
        float hbA = mix(diffuseColor.a, 0.9, hbF);
        gl_FragColor = vec4(outgoingLight - hbSpec + hbSpec / max(hbA, 0.05), hbA);`);
    applyCarProbe(sh);
  };
  m.customProgramCacheKey = () => 'hb-car-lens-v1';
  m.name = 'car-lens';
  return m;
}

// ================================================================== baked car assets (tools/blender/cars.py)
// public/assets/cars/<id>.glb: LOD0/1/2 of the HQ body (paint, paint2, details, lamps, glass, wheel) + caliper, Draco,
// plus <id>_ao.jpg (one ray-traced AO atlas shared by every LOD, uv1). The procedural build stays as the fallback and is
// what a car shows until its asset arrives; live instances and parked sets swap in place (onCarAsset).
// ?carbase=<dir>: load the baked cars from public/assets/<dir>/ instead (dev perf A/B against a baseline copy)
const CAR_BASE = (import.meta.env?.BASE_URL || './') + 'assets/' + ((typeof location !== 'undefined' && /[?&]carbase=([\w-]+)/.exec(location.search)?.[1]) || 'cars') + '/';
const HAS_DOM = typeof window !== 'undefined' && typeof fetch === 'function' && !/[?&]carassets=0/.test(window.location?.search || '');   // ?carassets=0: procedural only (A/B)
export const CAR_LOD_DIST = [0, 24, 75];
const ASSET = new Map(), WAIT = new Map(), LOADING = new Set();
let carIndex = null, carIndexP = null, gltfLoader = null, texLoader = null;
function carLoaders() {
  if (!gltfLoader) {
    const draco = new DRACOLoader(); draco.setDecoderPath(CAR_BASE + 'draco/'); draco.setDecoderConfig({ type: 'wasm' });
    gltfLoader = new GLTFLoader(); gltfLoader.setDRACOLoader(draco);
    texLoader = new THREE.TextureLoader();
  }
  return gltfLoader;
}
function fetchCarIndex() {
  if (!HAS_DOM) return Promise.resolve(null);
  if (!carIndexP) carIndexP = fetch(CAR_BASE + 'cars.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => (carIndex = j?.cars || {}));
  return carIndexP;
}
/** the most-seen models first (traffic + parked mix); others load on first use */
const CAR_PRELOAD = ['sedan', 'hatch', 'suv', 'ev', 'taxi', 'pickup', 'van', 'boxtruck', 'coupe', 'muscle', 'police', 'bus', 'k5'];
/** Preload baked car assets (optional: everything also loads lazily). Resolves when the listed ids are in. */
export function loadCarAssets(ids = CAR_PRELOAD) {
  return fetchCarIndex().then(() => Promise.all(ids.map((id) => new Promise((res) => { if (!carIndex?.[id]) return res(); onCarAsset(id, res); }))));
}
if (HAS_DOM) loadCarAssets();
function requestCar(id) {
  if (!HAS_DOM || ASSET.has(id) || LOADING.has(id)) return;
  if (!carIndex) { fetchCarIndex().then(() => requestCar(id)); return; }
  if (!carIndex[id]) return;
  LOADING.add(id);
  carLoaders();
  const aoUrl = CAR_BASE + id + '_ao.jpg';   // BC1 .dds when packed (tools/texpack.py): 2.7 MB instead of 21 MB per 2K atlas
  const ao = packedUrl(aoUrl) ? loadPacked(aoUrl, { anisotropy: 4 }).userData.ready : new Promise((res) => texLoader.load(aoUrl, res, undefined, () => res(null)));
  const glb = new Promise((res) => gltfLoader.load(CAR_BASE + id + '.glb', res, undefined, (e) => { console.warn('[cars] asset failed', id, e); res(null); }));
  Promise.all([glb, ao]).then(([g, t]) => {
    if (!g || !t) return;
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.channel = 1; t.anisotropy = 4; t.needsUpdate = true;
    const lods = [{}, {}, {}]; let caliper = null, heroL = null, A_cab = null;
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = /^(L\d|H)_([a-z0-9]+)/.exec(o.name), geo = fixCarGeo(o.geometry, m ? m[2] : 'caliper');
      if (!m) { if (/^caliper/.test(o.name)) caliper = geo; return; }
      if (m[1] === 'H') (heroL || (heroL = {}))[m[2]] = geo; else lods[+m[1][1]][m[2]] = geo;
    });
    // body pass 2: hero-only level H (player / showroom), L0 for traffic up close
    const A = { id, lods, hero: heroL, caliper, ao: t, details: makeDetailsMat(t, (A_cab = cabinBox(id))), cab: A_cab, parked: [null, null, null], parkedMat: null };
    ASSET.set(id, A);
    for (const cb of WAIT.get(id) || []) { try { cb(A); } catch (e) { console.warn('[cars] onCarAsset', e); } }
    WAIT.delete(id);
  }).finally(() => LOADING.delete(id));
}
/** cb(asset) once the baked asset of id is in (immediately if it already is; never if the id has no asset). */
export function onCarAsset(id, cb) {
  if (ASSET.has(id)) { cb(ASSET.get(id)); return; }
  if (!WAIT.has(id)) WAIT.set(id, []);
  WAIT.get(id).push(cb); requestCar(id);
}
export const carAssetReady = (id) => ASSET.has(id);
// glTF -> the attribute layout the car materials expect: uv (atlas, three's flipY), uv1 (AO), surf (metal, rough), lampId
function fixCarGeo(g, kind) {
  const n = g.attributes.position.count, out = new THREE.BufferGeometry();
  // degenerate slivers from the Blender pass can carry zero normals: normalize(0) = NaN in the G-buffer, which the
  // SSR / GTAO blurs then smear over the whole street as black
  { const na = g.attributes.normal.array; for (let i = 0; i < na.length; i += 3) { const l = na[i] * na[i] + na[i + 1] * na[i + 1] + na[i + 2] * na[i + 2]; if (!(l > 1e-8)) { na[i] = 0; na[i + 1] = 1; na[i + 2] = 0; } } }
  out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
  const c = g.attributes.color, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c ? c.getX(i) : 1; col[i * 3 + 1] = c ? c.getY(i) : 1; col[i * 3 + 2] = c ? c.getZ(i) : 1; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const u0 = g.attributes.uv, s = g.attributes.uv1, l = g.attributes.uv2, a = g.attributes.uv3;
  const uv = new Float32Array(n * 2), surf = new Float32Array(n * 2), lamp = new Float32Array(n), ao = new Float32Array(n * 2).fill(0.999);
  for (let i = 0; i < n; i++) {
    if (u0) { uv[i * 2] = u0.getX(i); uv[i * 2 + 1] = 1 - u0.getY(i); }
    if (s) { surf[i * 2] = s.getX(i); surf[i * 2 + 1] = 1 - s.getY(i); } else surf[i * 2 + 1] = 0.5;
    if (l) lamp[i] = l.getX(i);
    if (a) { ao[i * 2] = a.getX(i); ao[i * 2 + 1] = a.getY(i); }
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('uv1', new THREE.BufferAttribute(ao, 2));
  out.setAttribute('surf', new THREE.BufferAttribute(surf, 2));
  if (kind === 'lamps' || kind === 'lens') out.setAttribute('lampId', new THREE.BufferAttribute(lamp, 1));
  out.setIndex(g.index);
  out.computeBoundingBox(); out.computeBoundingSphere();
  out.name = 'car:' + kind;
  return out;
}
// in-car view fill: a lit box (model space) around the cabin adds soft indirect light to the details material (seats,
// dash, door cards, headliner) while the camera is in the cockpit. A uniform, not a light: adding a PointLight to the
// scene recompiled every program (a multi-second hitch on the first 'C').
// in-car view gains: window-light irradiance x gain (the eye adapts to the cabin; at the street exposure a physically lit
// black dash reads as a hole), gauges / screen emissive x lamp (night readability). window.__hbCab for live tuning.
export const CABIN = { gain: 3.2, lamp: 2.5 };
if (typeof window !== 'undefined') window.__hbCab = CABIN;
function cabinBox(id) {
  const P = getP(id), e = P.eye || P.seat || [-0.37, 1.1, 0];
  return { c: new THREE.Vector4(0, e[1] - 0.3, e[2] - 0.15, 0), h: new THREE.Vector3(0.95, 0.62, 1.25) };
}
function makeDetailsMat(ao, cab) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: getAtlas(), alphaTest: 0.5, roughness: 0.5, metalness: 0, aoMap: ao });
  const uC = { value: cab ? cab.c : new THREE.Vector4() }, uH = { value: cab ? cab.h : new THREE.Vector3() };
  m.onBeforeCompile = (sh) => {
    surfOBC(sh); wheelOBC(sh, CAR_BASE);
    sh.uniforms.uHbCab = uC; sh.uniforms.uHbCabH = uH;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHbCabP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHbCabP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHbCab;\nuniform vec3 uHbCabH;\nvarying vec3 vHbCabP;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + envGlsl('mix(1.0, 1.9, metalnessFactor)') + `
        // in-car view (body pass 3): the cabin is lit by what the glass sees. The street probe (or the sky IBL where the
        // probe saw nothing) is sampled diffusely along the surface normal bent towards the horizon (the roof hides the
        // zenith), plus a little bounce from the cabin itself; the baked AO is softened in the cabin (below)
        float hbCabIn = 0.0;
        if (uHbCab.w > 0.0) {
          vec3 hbQ = abs(vHbCabP - uHbCab.xyz) - uHbCabH; hbCabIn = step(max(hbQ.x, max(hbQ.y, hbQ.z)), 0.0);
          if (hbCabIn > 0.0) {
            vec3 hbWn = inverseTransformDirection(geometryNormal, viewMatrix);
            vec3 hbD = normalize(vec3(hbWn.x, hbWn.y * 0.3 + 0.18, hbWn.z));
            vec3 hbL = vec3(0.0);
            #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
            hbL = getIBLIrradiance(transformDirection(hbD, viewMatrix));
            #endif
            if (uProbeP.w > 0.0) { vec4 hbP = textureLod(uProbe, hbD, 6.0); hbL = mix(hbL, PI * hbP.rgb * 1.15 + hbL * (1.0 - hbP.a), uProbeP.w); }
            irradiance += hbL * uHbCab.w + vec3(0.06, 0.055, 0.05) * uHbCab.w;
          }
        }`)
      .replace('#include <aomap_fragment>', `#ifdef USE_AOMAP
        float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity * (1.0 - 0.5 * hbCabIn) + 1.0;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
        reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), ambientOcclusion, material.roughness );
        #endif
        #endif`);
    applyCarProbe(sh);
  };
  m.customProgramCacheKey = () => 'hb-car-surf-ao-v4';
  m.name = 'car-details';
  return m;
}

// ---------------------------------------------------------------- parked / instanced cars
/** One merged geometry of LOD level (1 = near, 2 = far) for InstancedMesh use: position, normal, color, surf, uv1.
 *  surf.x < -0.5 marks paint (instance colour, clearcoat); surf.x < -1.5 = second paint (keeps its colour). null if not loaded. */
export function parkedCarGeometry(id, level) {
  const A = ASSET.get(id); if (!A) return null;
  if (A.parked[level]) return A.parked[level];
  const P = getP(id), L = A.lods[level], parts = [];
  const p2 = C(P.defaultPaint2 ?? 0xf0f0f0);
  // uv = the details atlas (plates, grilles, lamp artwork, badges); flat parts and the wheel marker zones -> white texel
  const put = (g, mtx, col, surf, atlas = !col) => {
    if (!g) return;
    const n = g.attributes.position.count, o = new THREE.BufferGeometry();
    o.setAttribute('position', g.attributes.position.clone()); o.setAttribute('normal', g.attributes.normal.clone());
    const c = new Float32Array(n * 3), s = new Float32Array(n * 2), uv = new Float32Array(n * 2), gu = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      if (col) c.set(col, i * 3); else { c[i * 3] = g.attributes.color.getX(i); c[i * 3 + 1] = g.attributes.color.getY(i); c[i * 3 + 2] = g.attributes.color.getZ(i); }
      if (surf) s.set(surf, i * 2); else { s[i * 2] = g.attributes.surf.getX(i); s[i * 2 + 1] = g.attributes.surf.getY(i); }
      const uy = atlas && gu ? gu.getY(i) : 9;
      if (uy >= -0.01 && uy <= 1.01) { uv[i * 2] = gu.getX(i); uv[i * 2 + 1] = uy; } else { uv[i * 2] = WUV[0]; uv[i * 2 + 1] = WUV[1]; }
    }
    o.setAttribute('color', new THREE.BufferAttribute(c, 3)); o.setAttribute('surf', new THREE.BufferAttribute(s, 2));
    o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    o.setAttribute('uv1', g.attributes.uv1.clone());
    o.setIndex(g.index.clone());
    if (mtx) { o.applyMatrix4(mtx); if (mtx.determinant() < 0) { const I = o.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } } }
    parts.push(o);
  };
  put(L.paint, null, [1, 1, 1], [-1, 0.32]);
  put(L.paint2, null, [p2.r, p2.g, p2.b], [-2, 0.32]);
  put(L.details); put(L.lamps, null, null, [0, 0.34], true);
  { const lp = parts[parts.length - 1]; if (lp && L.lamps) { const c = lp.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] *= 0.55; } }   // unlit lenses: 0.18-gloss full-bright lenses flashed white under headlights / the probe at night
  put(L.glass, null, [0.012, 0.016, 0.02], [0, 0.03]);
  const mx = new THREE.Matrix4();
  for (const [x, z, w] of [[-P.tf / 2, P.axleFZ, P.ww], [P.tf / 2, P.axleFZ, P.ww], [-P.tr / 2, P.axleRZ, P.wwR], [P.tr / 2, P.axleRZ, P.wwR]]) {
    mx.makeScale((x < 0 ? -1 : 1) * (w / P.ww), 1, 1).setPosition(x, P.R, z);
    put(L.wheel, mx);
    if (level === 1 && A.caliper) put(A.caliper, mx, [0.09, 0.09, 0.1], [0.2, 0.4]);
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere(); g.computeBoundingBox(); g.name = 'parked:' + id + ':L' + level;
  A.parked[level] = g;
  return g;
}
/** Material for parkedCarGeometry (one per model id: it carries that model's AO atlas). Instance colour = paint. */
export function makeParkedCarMaterial(id) {
  const A = ASSET.get(id); if (!A) return null;
  if (A.parkedMat) return A.parkedMat;
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, aoMap: A.ao, map: getAtlas(), alphaTest: 0.5 });
  // per-instance road grime from a hash of the instance position (parked cars sit for days: dirtier than traffic)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 surf;
varying vec2 vSurf;
varying float vPaint;
varying float vDirt;
varying vec3 vHbP;`)
      .replace('#include <color_vertex>', `vColor = vec3(1.0); vColor *= color; vSurf = surf; vPaint = step(surf.x, -0.5); vHbP = position;
        vDirt = 0.2;
        #ifdef USE_INSTANCING
        { vec2 t = instanceMatrix[3].xz; float h = fract(sin(dot(floor(t * 0.7), vec2(12.9898, 78.233))) * 43758.5453); vDirt = 0.12 + h * h * 0.85; }
        #endif
        #ifdef USE_INSTANCING_COLOR
        vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, step(-1.5, surf.x) * vPaint);
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vSurf;
varying float vPaint;
varying float vDirt;
varying vec3 vHbP;
float hbDirtK = 0.0;
` + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      #ifdef USE_AOMAP
      { float g = texture2D(aoMap, vAoMapUv).b * 1.35 + smoothstep(0.75, 0.2, vHbP.y) * 0.35;
        float n1 = hbVN3(vHbP * vec3(2.2, 7.0, 2.2)), n2 = hbVN3(vHbP * 11.0 + 3.1);
        hbDirtK = clamp(vDirt * g * (0.55 + 0.9 * n1) - 0.18 + 0.1 * n2, 0.0, 1.0) * vPaint;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.14, 0.115) * (0.8 + 0.4 * n2), hbDirtK * 0.8); }
      #endif`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(vSurf.y, 0.8, hbDirtK);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(vSurf.x, 0.45, vPaint) * (1.0 - hbDirtK);')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= vPaint * (1.0 - hbDirtK * 0.85);
#endif`)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + envGlsl('mix(mix(1.0, 1.9, vSurf.x), 2.4, vPaint)'));
  };
  m.customProgramCacheKey = () => 'hb-parked-pbr-v2';
  m.name = 'car-parked';
  A.parkedMat = m;
  return m;
}

// ================================================================== public API
const SPEC = new Map();
/** Cheap, cached physical + layout description of a model (computed from the profile tables, no meshes). */
export function getModelSpec(id) {
  if (SPEC.has(id)) return SPEC.get(id);
  const P = getP(id);
  let minX = 0, maxX = 0, maxY = 0, bodyBottomY = Infinity, minY = Infinity;
  if (P.custom) { maxX = P.W / 2; minX = -maxX; maxY = P.H; bodyBottomY = 0.36; minY = 0.2; }
  if (P.custom && P.L) { P.extraBounds = Object.assign({ minZ: -P.L / 2, maxZ: P.L / 2 }, P.extraBounds); }
  else {
    for (let z = P.zF; z <= P.zR + 1e-6; z += 0.02) {
      const S = section(P, z);
      minY = Math.min(minY, S.yb);
      maxX = Math.max(maxX, S.w); maxY = Math.max(maxY, S.yt, S.yh);
      if (P.gh && z >= P.gh.z0 && z <= P.gh.z1) maxY = Math.max(maxY, P.gh.roof(z));
      const raF = P.arches[0]?.ra ?? P.R + 0.07, raR = P.arches[1]?.ra ?? P.R + 0.07;
      if (z > P.axleFZ + raF && z < P.axleRZ - raR) bodyBottomY = Math.min(bodyBottomY, S.yb);
    }
    minX = -maxX;
  }
  const eb = P.extraBounds || {};
  const minZ = Math.min(P.zF, eb.minZ ?? P.zF) - 0.03, maxZ = Math.max(P.zR, eb.maxZ ?? P.zR) + 0.03;
  maxY = Math.max(maxY, eb.maxY ?? 0);
  if (eb.maxX) { maxX = Math.max(maxX, eb.maxX); minX = -maxX; }
  if (eb.minY != null) minY = Math.min(minY, eb.minY);
  const seat = P.seat || [-0.37, 1.1, 0];
  const door = P.door || [-(maxX + 0.45), 0, seat[2] + 0.1];
  const spec = {
    length: maxZ - minZ, width: maxX - minX, height: maxY,
    wheelbase: P.wb, trackF: P.tf, trackR: P.tr, wheelRadius: P.R, wheelWidth: P.ww, wheelWidthR: P.wwR,
    axleFZ: P.axleFZ, axleRZ: P.axleRZ, wheelY: P.R, bodyBottomY,
    seat: seat.slice(), doorL: door.slice(),
    bounds: { min: [minX, +minY.toFixed(3), minZ], max: [maxX, maxY, maxZ] },
    defaultPaint: P.defaultPaint, defaultPaint2: P.defaultPaint2 ?? null, name: P.name,
  };
  // livery anchors: belt line (two-tone split), side stripe height, door number position
  if (!P.custom) {
    const S0 = section(P, 0);
    spec.beltY = +(P.gh ? S0.topY(P.gh.wb(0)) + 0.012 : S0.yh + 0.01).toFixed(3);
    spec.sideY = +(S0.yw + (S0.yh - S0.yw) * 0.35).toFixed(3);
    spec.doorZ = +(P.eye ? P.eye[2] - 0.05 : 0).toFixed(3);
    spec.doorY = +((S0.yb + S0.yh) / 2 + 0.03).toFixed(3);
    spec.numR = +Math.min(0.24, (S0.yh - S0.yb) * 0.36).toFixed(3);
    // hood camera: on the bonnet centreline a little ahead of the windshield base; cab-forward bodies (vans, buses)
    // get a bumper camera just ahead of the nose instead
    const zE = P.gh ? P.gh.zE0 : P.zF + 1.2;
    if (zE - P.zF > 0.9) { const z = zE - 0.3; spec.hoodCam = [0, +(section(P, z).topY(0) + 0.17).toFixed(3), +z.toFixed(3)]; }
    else { const Sf = section(P, P.zF + 0.15); spec.hoodCam = [0, +Math.min(1.25, Sf.yh * 0.85 + 0.1).toFixed(3), +(P.zF - 0.1).toFixed(3)]; }
  } else { spec.beltY = 1.5; spec.sideY = 1; spec.doorZ = 0; spec.doorY = 1; spec.numR = 0.2; }
  if (!spec.hoodCam) spec.hoodCam = [0, +(spec.seat[1] + 0.25).toFixed(3), +(minZ + 0.3).toFixed(3)];
  SPEC.set(id, spec);
  return spec;
}

// ---------------------------------------------------------------- per-instance extras (hero cars: player, showroom)
const EXTRA = new Map();
/** cached 'details'-style geometry built by fn(ctx) in the model's frame (wings, splitters, calipers, custom rims) */
function extraGeom(key, P, fn) {
  if (EXTRA.has(key)) return EXTRA.get(key);
  const ctx = makeCtx(P, 0); ctx.noBounds = true;
  fn(ctx);
  const g = bucketGeometry(ctx.B.details, 'details');
  EXTRA.set(key, g);
  return g;
}
const RIM_COL = { chrome: 0xf2f3f6, gun: 0x44474d, black: 0x0a0a0b, matte: 0x1a1a1b, gold: 0xc9a043, white: 0xefefef, alu: 0xc9ccd1 };
function rimGeom(id, P, style, finKey, hex) {
  const [, m, r] = RIM_FINISHES[finKey] || RIM_FINISHES.alu;
  const col = finKey === 'paint' ? (hex ?? 0xc9ccd1) : RIM_COL[finKey] ?? 0xc9ccd1;
  const key = `rim|${id}|${style}|${finKey}|${col}`;
  if (EXTRA.has(key)) return EXTRA.get(key);
  const W = { style, fin: D(col, m, r) };
  if (style === 'steel') W.cap = FIN.chrome;
  const g = bucketGeometry(buildWheel(Object.assign({}, P, { wheel: W, _wheelSegs: 32 }), 0), 'details');
  EXTRA.set(key, g);
  return g;
}
/** smooth (32-segment) version of the stock wheel for hero cars: close-ups show the tyre silhouette */
function heroWheelGeom(id, P) {
  const key = 'hw|' + id;
  if (!EXTRA.has(key)) EXTRA.set(key, bucketGeometry(buildWheel(Object.assign({}, P, { _wheelSegs: 32 }), 0), 'details'));
  return EXTRA.get(key);
}
/** brake caliper sitting over the rotor, trailing edge up (wheel local frame: x = axle, y up, z back) */
function caliperGeom(P) {
  return extraGeom('caliper|' + P.id, P, (ctx) => {
    const rb = P.rimR, hw = P.ww / 2, a0 = -hw * 0.1 - 0.03, a1 = -hw * 0.1 + 0.03;
    const soup = new Soup(), f = { b: 'details', col: C(0xffffff), m: 0.1, r: 0.35 };
    const r0 = rb * 0.56, r1 = rb * 0.86, th0 = 0.35, th1 = 1.25, n = 8;
    const pt = (a, r, th) => [a, r * Math.cos(th), r * Math.sin(th)];
    for (let i = 0; i < n; i++) {
      const t0 = lerp(th0, th1, i / n), t1 = lerp(th0, th1, (i + 1) / n), tm = (t0 + t1) / 2;
      quadO(soup, pt(a1, r0, t0), pt(a1, r1, t0), pt(a1, r1, t1), pt(a1, r0, t1), [1, 0, 0], f);
      quadO(soup, pt(a0, r0, t0), pt(a0, r1, t0), pt(a0, r1, t1), pt(a0, r0, t1), [-1, 0, 0], f);
      quadO(soup, pt(a0, r1, t0), pt(a1, r1, t0), pt(a1, r1, t1), pt(a0, r1, t1), [0, Math.cos(tm), Math.sin(tm)], f);
      quadO(soup, pt(a0, r0, t0), pt(a1, r0, t0), pt(a1, r0, t1), pt(a0, r0, t1), [0, -Math.cos(tm), -Math.sin(tm)], f);
    }
    for (const [th, sg] of [[th0, -1], [th1, 1]]) quadO(soup, pt(a0, r0, th), pt(a1, r0, th), pt(a1, r1, th), pt(a0, r1, th), [0, -Math.sin(th) * sg, Math.cos(th) * sg], f);
    emitSoup(ctx, soup, 40);
  });
}
/** bolt-on aero: rear wing (1 = sport lip wing, 2 = GT wing on uprights) and a front splitter */
function wingGeom(P, lv) {
  return extraGeom(`wing|${P.id}|${lv}`, P, (ctx) => {
    const zw = P.zR - (lv > 1 ? 0.3 : 0.22);
    const S = section(P, zw);
    let yDeck = S.yt;
    if (P.gh && zw > P.gh.z0 && zw < P.gh.z1) yDeck = Math.max(yDeck, P.gh.roof(zw) - P.gh.crown);
    const w = Math.min(S.w, 0.95) * (lv > 1 ? 0.97 : 0.9), h = lv > 1 ? 0.28 : 0.1, chord = lv > 1 ? 0.3 : 0.2;
    const y = yDeck + h, fin = FIN.graphite;
    // airfoil section in (u = outward/up side, v): tube frames use U = T x up; here the path runs along x so U = z-ish
    const prof = [[-0.012, -chord * 0.5], [0.018, chord * 0.2], [0.006, chord * 0.5], [-0.016, chord * 0.3]];
    tube(ctx, [[-w, y, zw], [0, y + 0.006, zw], [w, y, zw]], prof, fin, { up: () => [0, 0, 1], crease: 30 });
    for (const s of [-1, 1]) {
      box(ctx, fin, s * w, y - 0.03, zw, 0.012, 0.12, chord * 1.3);
      box(ctx, FIN.black, s * w * 0.55, (yDeck + y) / 2, zw + 0.03, 0.02, y - yDeck + 0.02, 0.09);
    }
  });
}
function splitterGeom(P) {
  return extraGeom('split|' + P.id, P, (ctx) => {
    const zf = P.zF, S = section(P, zf + 0.25), y = Math.max(0.06, S.yb - 0.02), w = Math.min(S.w, 0.95) - 0.04;
    box(ctx, FIN.graphite, 0, y, zf + 0.2, w * 1.9, 0.014, 0.3);
    for (const s of [-1, 1]) box(ctx, FIN.graphite, s * (w * 0.95 - 0.02), y + 0.035, zf + 0.2, 0.01, 0.06, 0.26);
  });
}

/**
 * Build one drivable instance. Geometry is shared per id; materials for paint/lamps are per instance.
 * opts: { paint, paint2, seed, look, hero, wing, splitter }
 *   seed picks a street colour when paint is omitted (traffic). hero (or look) = player / showroom quality: calipers,
 *   paint with finishes + liveries, custom rims, tint. setLook(look) updates all of that live; setAero(wing, splitter).
 */
export function buildCarModel(id, opts = {}) {
  const G = getGeoms(id), P = G.P, S = shared();
  const hero = !!(opts.hero || opts.look);
  let paintHex = opts.paint;
  if (paintHex == null && opts.seed != null && !['taxi', 'police', 'bus', 'cablecar', 'van'].includes(id)) {
    let s = (opts.seed * 2654435761) >>> 0; s ^= s >>> 15; paintHex = streetPaint((s % 10007) / 10007);
  }
  if (paintHex == null) paintHex = P.defaultPaint;
  // road grime: street cars range from washed to a month of SF fog + brake dust (seeded), heroes start almost clean
  let dirt = opts.dirt;
  if (dirt == null) { const h = opts.seed != null ? (Math.sin(opts.seed * 12.9898 + 4.1) * 43758.5453) % 1 : 0.1; dirt = hero ? 0.08 : 0.1 + Math.abs(h) * Math.abs(h) * 0.75; }
  const paint = hero ? makeHeroPaint(paintHex) : makePaint(paintHex, { dirt, wear: ['taxi', 'police', 'bus', 'van', 'pickup'].includes(id) ? 0.5 : 0.15 });
  if (hero) paint.userData.hbU.uHbDirt.value = dirt;
  const paint2 = G.geoms.paint2 ? makePaint(opts.paint2 ?? P.defaultPaint2 ?? 0xffffff) : null;
  const lamps = makeLamps();
  let lensMat = null;
  const root = new THREE.Group();
  root.name = 'car:' + id;
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const add = (parent, geo, mat, shadow = true) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m); return m;
  };
  let glassMat = S.glass, tintK = 0, asset = null, detailsMat = S.details, customRim = null, lodLevel = 0;
  const glassMeshes = [], wheels = [], wheelMeshes = [], calipers = [];
  const pos = [[-P.tf / 2, P.axleFZ, P.ww], [P.tf / 2, P.axleFZ, P.ww], [-P.tr / 2, P.axleRZ, P.wwR], [P.tr / 2, P.axleRZ, P.wwR]];
  let calMat = null;
  const needCal = () => (hero && !P.custom) || (asset && asset.caliper);
  const mkCal = () => {
    if (calMat) return;
    calMat = new THREE.MeshStandardMaterial({ color: hero ? 0xb01a20 : 0x2a2b2e, roughness: 0.35, metalness: hero ? 0.15 : 0.6 }); calMat.name = 'car-caliper';
  };
  function addBodyLevel(parent, g) {
    add(parent, g.paint, paint); add(parent, g.paint2, paint2); add(parent, g.details, detailsMat);
    add(parent, g.lamps, lamps);
    if (g.lens) { lensMat = lensMat || makeLens(lamps); const lm = add(parent, g.lens, lensMat, false); lm.renderOrder = 1; }
    const gm = add(parent, g.glass, glassMat, false);
    if (gm) { gm.receiveShadow = false; gm.renderOrder = 1; glassMeshes.push(gm); }
  }
  function wheelGeo() { return customRim || (asset ? ((hero && asset.hero) || asset.lods[lodLevel]).wheel : hero && !P.custom ? heroWheelGeom(id, P) : G.wheel); }
  function syncWheels() {
    const g = wheelGeo(), mat = asset && !customRim ? asset.details : S.details;
    for (const m of wheelMeshes) { m.geometry = g; m.material = mat; }
    for (const c of calipers) c.visible = hero || lodLevel === 0;
  }
  function mountBody() {
    body.clear(); glassMeshes.length = 0;
    asset = ASSET.get(id) || null;
    if (!asset) { requestCar(id); addBodyLevel(body, G.geoms); return; }
    detailsMat = asset.details;
    for (const m of [paint, paint2, lamps]) if (m) { m.aoMap = asset.ao; m.needsUpdate = true; }
    if (hero) { addBodyLevel(body, asset.hero || asset.lods[0]); lodLevel = 0; }
    else {
      const lod = new THREE.LOD(); lod.name = 'lod';
      asset.lods.forEach((L, i) => { const grp = new THREE.Group(); addBodyLevel(grp, L); lod.addLevel(grp, CAR_LOD_DIST[i], i ? 0.08 : 0); });
      const upd = lod.update.bind(lod);
      lod.update = (cam) => { upd(cam); const l = lod.getCurrentLevel(); if (l !== lodLevel) { lodLevel = l; syncWheels(); } };
      body.add(lod);
    }
    if (needCal()) addCalipers();
    if (asset.caliper) for (const c of calipers) c.geometry = asset.caliper;
    if (calMat) { calMat.aoMap = asset.ao; calMat.needsUpdate = true; }
    syncWheels();
  }
  function addCalipers() {
    if (calipers.length || P.custom) return;
    mkCal();
    const g = asset?.caliper || caliperGeom(P);
    wheels.forEach((w, i) => { const c = new THREE.Mesh(g, calMat); c.scale.copy(wheelMeshes[i].scale); c.castShadow = false; w.pivot.add(c); calipers.push(c); });
  }
  for (const [x, z, w] of pos) {
    const pivot = new THREE.Object3D(), spin = new THREE.Object3D();
    pivot.position.set(x, P.R, z);
    pivot.add(spin);
    const m = new THREE.Mesh(G.wheel, S.details);
    m.scale.set((x < 0 ? -1 : 1) * (w / P.ww), 1, 1);
    m.castShadow = true; m.receiveShadow = true;
    spin.add(m); root.add(pivot);
    wheels.push({ pivot, spin }); wheelMeshes.push(m);
  }
  let wingMesh = null, splitMesh = null, disposed = false, lastLook = null;
  mountBody();
  if (!asset) { if (hero && !P.custom) addCalipers(); syncWheels(); onCarAsset(id, () => { if (!disposed) { mountBody(); if (lastLook) setLook(lastLook); } }); }
  const u = lamps.userData.uLamp.value;
  let cabinOn = false;
  function setLights(o = {}) {
    u[0] = 0.05;
    u[1] = o.head ? 1.3 : 0.15;            // lit lens; the bright point is the flare core (render/carlights.js): 2.5 bloomed the whole lamp cluster white
    u[2] = o.brake ? 3.0 : 0.6;
    u[3] = o.brake ? 3.0 : 0.0;
    u[4] = o.reverse ? 2.5 : 0.05;
    if (o.siren) {
      const ph = ((o.sirenPhase || 0) * 1.6) % 1;
      const on = (a) => (ph > a && ph < a + 0.11) || (ph > a + 0.19 && ph < a + 0.3);
      u[5] = on(0.0) ? 6 : 0.12; u[6] = on(0.5) ? 7 : 0.12;
    } else { u[5] = 0.2; u[6] = 0.2; }
    const kc = cabinOn ? CABIN.lamp : 1;     // in-car view: gauges / screen read at the cabin's adapted exposure
    u[7] = (o.head ? 2.4 : 0.35) * kc;
    u[8] = o.head ? 1.7 : 1.5;
    u[9] = (o.head ? 2.2 : 1.4) * kc;
  }
  setLights({});
  const spec = getModelSpec(id);
  function setAero(wing = 0, splitter = 0) {
    if (wingMesh) { root.remove(wingMesh); wingMesh = null; }
    if (splitMesh) { root.remove(splitMesh); splitMesh = null; }
    if (P.custom) return;
    if (wing > 0 && !P.noWing) { wingMesh = new THREE.Mesh(wingGeom(P, wing), S.details); wingMesh.castShadow = true; root.add(wingMesh); }
    if (splitter > 0) { splitMesh = new THREE.Mesh(splitterGeom(P), S.details); root.add(splitMesh); }
  }
  function setLook(look = {}) {
    lastLook = look;
    if (hero) applyFinish(paint, look.finish || 'metallic', look.paint ?? paint.color.getHex());
    if (look.dirt != null) paint.userData.hbU.uHbDirt.value = look.dirt;
    else if (look.paint != null) paint.color.setHex(look.paint);
    if (paint2 && look.paint2 != null) paint2.color.setHex(look.paint2);
    if (!hero) return;
    // liveries (object space, see paintOBC)
    const L = look.livery || { kind: 'none' }, U = paint.userData.liv, kind = L.kind || 'none';
    const c1 = new THREE.Color(L.color ?? 0xffffff), c2 = new THREE.Color(L.color2 ?? 0x111111);
    const stripes = kind === 'stripes' ? [0, 0.16] : kind === 'twin' || kind === 'race' ? [0.07, 0.12] : null;
    U.uStripe.value.set(stripes ? stripes[0] : 0, stripes ? stripes[1] : 0, stripes ? 1 : 0, 0); U.uStripeCol.value.copy(c1);
    U.uTone.value.set(spec.beltY, 1, kind === 'twotone' ? 1 : 0, 0); U.uToneCol.value.copy(c1);
    const side = kind === 'side' || kind === 'race';
    U.uSide.value.set(spec.sideY - 0.035, spec.sideY + 0.035, side ? 1 : 0, 0); U.uSideZ.value.set(P.zF + 0.2, P.zR - 0.2, 0, 0); U.uSideCol.value.copy(c1);
    const num = kind === 'number' || kind === 'race';
    if (num && (U._num !== L.number || U._numCol !== L.color2)) { U.uNum.value?.dispose?.(); U.uNum.value = numberTexture(L.number ?? 27, '#' + c2.getHexString(), '#ffffff'); U._num = L.number; U._numCol = L.color2; }
    U.uNumRect.value.set(spec.doorZ, spec.doorY, spec.numR, num ? 1 : 0);
    // rims + calipers (custom rims are procedural: they use the plain details material, stock rims the baked asset)
    if (!P.custom) {
      customRim = look.rim || (look.rimFinish && look.rimFinish !== 'stock')
        ? rimGeom(id, P, look.rim || (P.wheel || {}).style || 'split5', look.rimFinish && look.rimFinish !== 'stock' ? look.rimFinish : 'alu', look.rimColor ?? null) : null;
      syncWheels();
    }
    if (calMat) calMat.color.setHex(look.caliper ?? 0xb01a20);
    // window tint
    const tint = look.tint ?? 0;
    if (Math.abs(tint - tintK) > 1e-3) {
      if (glassMat !== S.glass) glassMat.dispose();
      glassMat = tint > 0.01 ? makeGlass(tint) : S.glass; tintK = tint;
      for (const gm of glassMeshes) gm.material = glassMat;
    }
  }
  // in-car view: cabin fill (see makeDetailsMat)
  function setCabin(on) { cabinOn = on; if (asset?.cab) asset.cab.c.w = on ? CABIN.gain : 0; }
  if (opts.wing || opts.splitter) setAero(opts.wing | 0, opts.splitter | 0);
  if (opts.look) setLook(opts.look);
  else if (hero) applyFinish(paint, flakeFor(paintHex) < 0.1 ? 'gloss' : 'metallic', paintHex);   // solid whites / blacks stay solid (unowned player cars have no look)
  return {
    root, wheels, setLights, setLook, setAero, setCabin, hero,
    setPaint(hex) { paint.color.setHex(hex); },
    setPaint2(hex) { if (paint2) paint2.color.setHex(hex); },
    headlightAnchors: G.head.map((v) => v.clone()),
    exhaustAnchors: G.exhaust.map((v) => v.clone()),
    spec,
    dispose() { disposed = true; paint.userData.liv?.uNum.value?.dispose?.(); paint.dispose(); if (paint2) paint2.dispose(); lamps.dispose(); lensMat?.dispose(); calMat?.dispose(); if (glassMat !== S.glass) glassMat.dispose(); root.removeFromParent(); },
  };
}

const PROXY = new Map();
/** One merged low-detail geometry (with a 'color' attribute; paint areas are white) for InstancedMesh use. Shared: do not dispose. */
export function buildCarProxy(id) {
  if (PROXY.has(id)) return PROXY.get(id);
  const P = getP(id), ctx = makeCtx(P, 1);
  if (P.custom) P.custom(ctx);
  else {
    buildBody(ctx);
    // essentials: lamps, grille, plate colour blocks
    const quick = (dir, poly, hex) => patch(ctx, dir, poly, D(hex, 0, 0.4), { off: 0.006, maxEdge: 0.5 });
    const g = getGeomsLite(P);
    for (const [dir, poly, hex] of g) quick(dir, poly, hex);
    if (P.proxyExtra) P.proxyExtra(ctx);
  }
  const wb = buildWheel(P, 1);
  const all = { pos: [], nor: [], col: [] };
  const put = (bk, colOverride) => {
    for (let i = 0; i < bk.pos.length; i += 3) {
      all.pos.push(bk.pos[i], bk.pos[i + 1], bk.pos[i + 2]); all.nor.push(bk.nor[i], bk.nor[i + 1], bk.nor[i + 2]);
      if (colOverride) all.col.push(colOverride.r, colOverride.g, colOverride.b); else all.col.push(bk.col[i], bk.col[i + 1], bk.col[i + 2]);
    }
  };
  put(ctx.B.paint, new THREE.Color(1, 1, 1));
  put(ctx.B.paint2, C(P.defaultPaint2 ?? 0xffffff));
  put(ctx.B.glass, C(0x141a1f));
  put(ctx.B.details); put(ctx.B.lamps);
  // bake 4 wheels
  for (const [x, z, w] of [[-P.tf / 2, P.axleFZ, P.ww], [P.tf / 2, P.axleFZ, P.ww], [-P.tr / 2, P.axleRZ, P.wwR], [P.tr / 2, P.axleRZ, P.wwR]]) {
    const sx = (x < 0 ? -1 : 1) * (w / P.ww), flip = sx < 0;
    for (let i = 0; i < wb.pos.length; i += 9) {
      for (let j = 0; j < 3; j++) {
        const k = i + (flip ? (j === 0 ? 0 : 3 - j) * 3 : j * 3);
        all.pos.push(wb.pos[k] * sx + x, wb.pos[k + 1] + P.R, wb.pos[k + 2] + z);
        all.nor.push(wb.nor[k] * Math.sign(sx), wb.nor[k + 1], wb.nor[k + 2]);
        all.col.push(wb.col[k], wb.col[k + 1], wb.col[k + 2]);
      }
    }
  }
  const geo = bucketGeometry(all, 'proxy');
  geo.name = 'carProxy:' + id;
  PROXY.set(id, geo);
  return geo;
}
function getGeomsLite(P) {
  // simple lamp / grille blocks per model for the proxy (front: x,y ; rear: x,y)
  const zF = P.zF, list = [];
  const hy = section(P, zF + 0.05).yh - 0.1, ty = section(P, P.zR - 0.05).yh - 0.1;
  const hw = section(P, zF + 0.1).w - 0.2, tw = section(P, P.zR - 0.1).w - 0.18;
  for (const s of [-1, 1]) {
    list.push(['-z', [[s * (hw - 0.26), hy - 0.04], [s * hw, hy - 0.04], [s * hw, hy + 0.04], [s * (hw - 0.26), hy + 0.04]], 0xf2f4f8]);
    list.push(['+z', [[s * (tw - 0.3), ty - 0.05], [s * tw, ty - 0.05], [s * tw, ty + 0.03], [s * (tw - 0.3), ty + 0.03]], 0xc0141c]);
  }
  list.push(['-z', [[-0.4, hy - 0.2], [0.4, hy - 0.2], [0.4, hy - 0.07], [-0.4, hy - 0.07]], 0x111111]);
  return list;
}

/** Debug helper (dev page): triangle + draw call counts per model. */
export function _modelStats(id) {
  const G = getGeoms(id);
  const tri = (g) => (g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0);
  let t = 0, dc = 0;
  for (const k in G.geoms) if (G.geoms[k]) { t += tri(G.geoms[k]); dc++; }
  t += 4 * tri(G.wheel); dc += 4;
  return { tris: t, drawCalls: dc, wheelTris: tri(G.wheel), proxyTris: tri(buildCarProxy(id)), bmin: G.bmin, bmax: G.bmax };
}
/** Debug helper: wheel clearance under each arch (arch cut height minus tyre top) and tyre outer face vs body side. */
export function _archCheck(id) {
  const P = getP(id); if (P.custom) return null;
  return P.arches.map((A, i) => {
    const S = section(P, A.z), ww = i ? P.wwR : P.ww, tr = i ? P.tr : P.tf;
    return { top: +(archCut(P, A.z, S) - 2 * P.R).toFixed(3), side: +(S.sideX(P.R) - (tr / 2 + ww / 2)).toFixed(3), inner: +((tr / 2 - ww / 2) - P.xi).toFixed(3) };
  });
}
/** Debug helper (dev page / lab): lower-body cross-section parameters of a model at z. */
export function _section(id, z) { const S = section(getP(id), z); return { yb: S.yb, yt: S.yt, yh: S.yh, w: S.w, yw: S.yw, r: S.r, xc: S.xc }; }
/** Offline export for the Blender car pipeline (tools/blender/cars_export.mjs): raw HQ buckets (LOD0 source), the
 *  stock wheel at 40 segments and the layout. Not used at runtime. */
export function _exportCar(id, o = {}) {
  const P = Object.assign({}, getP(id), { _hq: true, _hq2: !!o.hq2 }), ctx = makeCtx(P, 0);
  if (P.custom) P.custom(ctx); else { buildBody(ctx); if (P.features) P.features(ctx); }
  const W = P.wheel || {};
  return {
    id, B: ctx.B, wheel: buildWheel(Object.assign({}, P, { _wheelSegs: 40 }), 0),
    meta: { R: P.R, rimR: P.rimR, ww: P.ww, wwR: P.wwR, tf: P.tf, tr: P.tr, axleFZ: P.axleFZ, axleRZ: P.axleRZ, custom: !!P.custom, style: W.style || 'split5',
      head: ctx.head.slice(0, 2).map((v) => [v.x, v.y, v.z]), bmin: ctx.bmin, bmax: ctx.bmax, zF: P.zF, zR: P.zR, eye: P.eye || null,
      gh: P.gh ? { z0: P.gh.z0, z1: P.gh.z1, zE0: P.gh.zE0, zE1: P.gh.zE1 } : null },
    rec: ctx.rec,
  };
}
/** Parked-car InstanceSet / StreamSet (props): swap its geometry + material to the baked LOD (1 near, 2 far) once in. */
export function upgradeParkedSet(set, id, level) {
  onCarAsset(id, () => {
    const g = parkedCarGeometry(id, level), m = makeParkedCarMaterial(id);
    if (!g || !m) return;
    set.geometry = g; set.material = m;
    if (set.mesh) { set.mesh.geometry = g; set.mesh.material = m; }
    set.dirty = true;
  });
}
