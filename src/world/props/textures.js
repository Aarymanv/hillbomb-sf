// Canvas-painted atlases for street props: prop faces (signs, ads, meters), street-name blades, road decals,
// foliage (leaf clusters, palm fronds, bark) and the far-tree impostors. No image assets.
import * as THREE from 'three';
import { mulberry } from './kit.js';

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = false, aniso = 8, mips = true, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso; t.flipY = flipY;
  t.generateMipmaps = mips; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}
// uv rect helper: pixel rect in a WxH canvas (y down) -> [u0, v0, u1, v1] with flipY textures (v up)
export function uvRect(W, H, x, y, w, h) { return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]; }

// ============================================================ prop atlas (1024 x 1024)
export const PROP_ATLAS = 1024;
export const PA = {  // pixel rects
  stop: [0, 0, 256, 256], allway: [256, 0, 256, 64], muni: [256, 64, 128, 192], meter: [384, 64, 128, 64],
  paystation: [384, 128, 128, 128],
  ads: [[512, 0, 128, 256], [640, 0, 128, 256], [768, 0, 128, 256], [896, 0, 128, 256]],
  news: [[0, 256, 128, 128], [128, 256, 128, 128], [256, 256, 128, 128], [384, 256, 128, 128]],
  hand: [512, 256, 128, 128], walk: [640, 256, 128, 128], grime: [768, 256, 256, 128],
  oneway: [0, 384, 256, 80], mapPanel: [256, 384, 256, 128], trash: [512, 384, 128, 128], noParking: [640, 384, 96, 128],
  hydrantTag: [736, 384, 32, 32], busSign: [768, 384, 256, 96],
};
export function paUV(r) { return uvRect(PROP_ATLAS, PROP_ATLAS, r[0], r[1], r[2], r[3]); }

function roundRect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }

export function propAtlas() {
  const N = PROP_ATLAS, [c, x] = canvas(N), rnd = mulberry(77);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, N, N);
  // ---- stop sign
  {
    const [X, Y, W] = PA.stop, cx = X + W / 2, cy = Y + W / 2;
    const oct = (r) => { x.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); };
    x.fillStyle = '#3a3a3a'; x.fillRect(X, Y, W, W);
    oct(127); x.fillStyle = '#f4f4f4'; x.fill();
    oct(116); x.fillStyle = '#c4121c'; x.fill();
    x.fillStyle = '#f7f7f7'; x.font = 'bold 72px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('STOP', cx, cy + 4);
  }
  // ---- ALL WAY plaque
  { const [X, Y, W, H] = PA.allway; x.fillStyle = '#f4f4f4'; x.fillRect(X, Y, W, H); x.fillStyle = '#c4121c'; x.fillRect(X + 5, Y + 5, W - 10, H - 10);
    x.fillStyle = '#fff'; x.font = 'bold 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ALL WAY', X + W / 2, Y + H / 2 + 2); }
  // ---- Muni stop flag
  { const [X, Y, W, H] = PA.muni; x.fillStyle = '#fbfbf6'; x.fillRect(X, Y, W, H);
    x.fillStyle = '#c8102e'; x.fillRect(X, Y, W, 44);
    x.fillStyle = '#fff'; x.font = 'bold italic 34px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('muni', X + W / 2, Y + 23);
    x.fillStyle = '#1b1b1b'; x.font = 'bold 30px Arial, sans-serif';
    const routes = ['5', '21', '38', '49'];
    routes.forEach((r, i) => { x.fillStyle = i % 2 ? '#1b1b1b' : '#8a1c1c'; x.fillText(r, X + 34 + (i % 2) * 60, Y + 76 + Math.floor(i / 2) * 44); });
    x.fillStyle = '#e8b500'; x.fillRect(X, Y + H - 26, W, 26); x.fillStyle = '#1b1b1b'; x.font = 'bold 16px Arial, sans-serif'; x.fillText('BUS STOP', X + W / 2, Y + H - 12); }
  // ---- meter face + pay station
  { const [X, Y, W, H] = PA.meter; x.fillStyle = '#2d3136'; x.fillRect(X, Y, W, H); x.fillStyle = '#9fd4a8'; x.fillRect(X + 18, Y + 12, W - 36, 26);
    x.fillStyle = '#133a1d'; x.font = 'bold 18px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('0:47', X + W / 2, Y + 26);
    x.fillStyle = '#e8b500'; x.fillRect(X + 18, Y + 44, 30, 10); x.fillStyle = '#5a5f66'; x.fillRect(X + 58, Y + 44, 52, 10); }
  { const [X, Y, W, H] = PA.paystation; x.fillStyle = '#23272c'; x.fillRect(X, Y, W, H); x.fillStyle = '#3d7fc4'; x.fillRect(X, Y, W, 22);
    x.fillStyle = '#fff'; x.font = 'bold 15px Arial'; x.textAlign = 'center'; x.fillText('PAY HERE', X + W / 2, Y + 16);
    x.fillStyle = '#86c6e8'; x.fillRect(X + 20, Y + 34, W - 40, 36); x.fillStyle = '#555'; for (let i = 0; i < 12; i++) x.fillRect(X + 26 + (i % 4) * 20, Y + 80 + Math.floor(i / 4) * 14, 14, 9); }
  // ---- ad panels (backlit)
  const adCols = [['#1d3557', '#e63946', '#f1faee'], ['#ffb703', '#023047', '#ffffff'], ['#2a9d8f', '#264653', '#e9c46a'], ['#6a4c93', '#ff595e', '#ffca3a']];
  const adText = [['FOGGY', 'DAYS'], ['BAY', 'BREW'], ['GO', 'MUNI'], ['HILL', 'BOMB']];
  PA.ads.forEach(([X, Y, W, H], i) => {
    const [a, b, d] = adCols[i];
    const g = x.createLinearGradient(X, Y, X, Y + H); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(X, Y, W, H);
    x.fillStyle = d; x.globalAlpha = 0.9; x.beginPath(); x.arc(X + W / 2, Y + H * 0.38, 36 + i * 4, 0, 7); x.fill(); x.globalAlpha = 1;
    x.fillStyle = b; x.fillRect(X + 20 + i * 5, Y + H * 0.3, 30, 30);
    x.fillStyle = d; x.font = 'bold 30px Arial Black, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(adText[i][0], X + W / 2, Y + H * 0.72); x.font = 'bold 22px Arial, sans-serif'; x.fillText(adText[i][1], X + W / 2, Y + H * 0.84);
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 6; x.strokeRect(X + 3, Y + 3, W - 6, H - 6);
  });
  // ---- newspaper box fronts
  const newsCol = ['#1f5fa8', '#c0272d', '#f2c230', '#f4f4f0'], newsTxt = ['Chronicle', 'Examiner', 'WEEKLY', 'FREE'];
  PA.news.forEach(([X, Y, W, H], i) => {
    x.fillStyle = newsCol[i]; x.fillRect(X, Y, W, H);
    x.fillStyle = 'rgba(210,225,235,0.9)'; x.fillRect(X + 14, Y + 34, W - 28, 52);
    x.fillStyle = '#333'; for (let k = 0; k < 5; k++) x.fillRect(X + 20, Y + 42 + k * 9, (W - 40) * (0.5 + rnd() * 0.5), 4);
    x.fillStyle = i === 3 ? '#222' : '#fff'; x.font = 'bold 20px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(newsTxt[i], X + W / 2, Y + 18);
    x.fillStyle = '#444'; x.fillRect(X + W / 2 - 16, Y + 96, 32, 8);
  });
  // ---- pedestrian signal symbols
  { const [X, Y, W] = PA.hand; x.fillStyle = '#111'; x.fillRect(X, Y, W, W); x.fillStyle = '#ff7a1a';
    roundRect(x, X + 40, Y + 30, 46, 70, 12); x.fill(); for (let k = 0; k < 4; k++) { roundRect(x, X + 40 + k * 12, Y + 12, 9, 30, 4); x.fill(); } roundRect(x, X + 22, Y + 52, 22, 12, 5); x.fill(); }
  { const [X, Y, W] = PA.walk; x.fillStyle = '#111'; x.fillRect(X, Y, W, W); x.fillStyle = '#f2f6ff'; x.strokeStyle = '#f2f6ff'; x.lineCap = 'round'; x.lineWidth = 12;
    x.beginPath(); x.arc(X + 66, Y + 22, 11, 0, 7); x.fill();
    x.beginPath(); x.moveTo(X + 64, Y + 40); x.lineTo(X + 60, Y + 76); x.moveTo(X + 60, Y + 76); x.lineTo(X + 44, Y + 112); x.moveTo(X + 60, Y + 76); x.lineTo(X + 80, Y + 110);
    x.moveTo(X + 64, Y + 44); x.lineTo(X + 44, Y + 64); x.moveTo(X + 64, Y + 44); x.lineTo(X + 84, Y + 62); x.stroke(); }
  // ---- grime / painted metal variation (poles use it with v along the height: darker near the ground)
  { const [X, Y, W, H] = PA.grime; const img = x.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const v = 1 - Math.pow(1 - j / H, 6) * 0.35;  // bottom rows (j->H) dark
      const n = 0.93 + rnd() * 0.07 + (Math.sin(i * 0.21 + j * 0.03) * 0.015);
      const k = (j * W + i) * 4, val = Math.max(0, Math.min(255, 255 * v * n));
      img.data[k] = val; img.data[k + 1] = val; img.data[k + 2] = val * 0.98; img.data[k + 3] = 255;
    }
    x.putImageData(img, X, Y); }
  // ---- one way sign
  { const [X, Y, W, H] = PA.oneway; x.fillStyle = '#111'; x.fillRect(X, Y, W, H); x.fillStyle = '#fff'; x.fillRect(X + 4, Y + 4, W - 8, H - 8);
    x.fillStyle = '#111'; x.beginPath(); x.moveTo(X + 16, Y + 30); x.lineTo(X + 190, Y + 30); x.lineTo(X + 190, Y + 14); x.lineTo(X + 240, Y + 40); x.lineTo(X + 190, Y + 66); x.lineTo(X + 190, Y + 50); x.lineTo(X + 16, Y + 50); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ONE WAY', X + 100, Y + 41); }
  // ---- shelter map panel, trash can band, no parking sign, bus header
  { const [X, Y, W, H] = PA.mapPanel; x.fillStyle = '#e9eef0'; x.fillRect(X, Y, W, H); x.strokeStyle = '#c8102e'; x.lineWidth = 4;
    x.beginPath(); for (let k = 0; k < 9; k++) x.lineTo(X + 12 + k * 28, Y + 30 + (rnd() * 70)); x.stroke(); x.strokeStyle = '#1f5fa8'; x.beginPath(); for (let k = 0; k < 9; k++) x.lineTo(X + 12 + k * 28, Y + 30 + (rnd() * 70)); x.stroke();
    x.fillStyle = '#c8102e'; x.fillRect(X, Y, W, 16); x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.textAlign = 'left'; x.fillText('SFMTA  Muni  Route map', X + 6, Y + 12); }
  { const [X, Y, W, H] = PA.trash; x.fillStyle = '#23402f'; x.fillRect(X, Y, W, H); x.fillStyle = '#d7dfd2'; x.font = 'bold 15px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SF Public Works', X + W / 2, Y + 64);
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 10; k++) x.fillRect(X + k * 13, Y, 5, H); }
  { const [X, Y, W, H] = PA.noParking; x.fillStyle = '#f7f7f7'; x.fillRect(X, Y, W, H); x.strokeStyle = '#1b6e3a'; x.lineWidth = 4; x.strokeRect(X + 4, Y + 4, W - 8, H - 8);
    x.fillStyle = '#1b6e3a'; x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillText('2 HOUR', X + W / 2, Y + 26); x.fillText('PARKING', X + W / 2, Y + 44); x.font = '11px Arial'; x.fillText('8AM - 6PM', X + W / 2, Y + 66); x.fillText('EXCEPT', X + W / 2, Y + 84); x.fillText('AREA  S', X + W / 2, Y + 102); }
  { const [X, Y, W, H] = PA.hydrantTag; x.fillStyle = '#1f5fa8'; x.fillRect(X, Y, W, H); }
  { const [X, Y, W, H] = PA.busSign; x.fillStyle = '#c8102e'; x.fillRect(X, Y, W, H); x.fillStyle = '#fff'; x.font = 'bold italic 44px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('muni', X + W / 2, Y + H / 2); }
  // white texel (bottom-right)
  x.fillStyle = '#ffffff'; x.fillRect(N - 16, N - 16, 16, 16);
  return tex(c, { aniso: 8 });
}

// ============================================================ street-name atlas (2048 x 2048, 6 x 32 slots)
export const NAME_COLS = 6, NAME_ROWS = 32;
export function nameAtlas(names) {
  const W = 2048, H = 2048, [c, x] = canvas(W, H);
  const sw = Math.floor(W / NAME_COLS), sh = Math.floor(H / NAME_ROWS);
  x.fillStyle = '#0c5a33'; x.fillRect(0, 0, W, H);
  const slots = new Map();
  names.slice(0, NAME_COLS * NAME_ROWS).forEach((name, i) => {
    const col = i % NAME_COLS, row = Math.floor(i / NAME_COLS), X = col * sw, Y = row * sh;
    x.fillStyle = '#0e6b3b'; x.fillRect(X, Y, sw, sh);
    x.strokeStyle = '#eef3ee'; x.lineWidth = 3; roundRect(x, X + 4, Y + 4, sw - 8, sh - 8, 6); x.stroke();
    // block number (small, left) + name
    const num = String(100 * (1 + (name.length * 7 + i * 3) % 29));
    x.fillStyle = '#eef3ee'; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = 'bold 15px Arial, Helvetica, sans-serif'; x.fillText(num, X + 12, Y + sh / 2 + 1);
    let fs = 38; x.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    let tw = x.measureText(name).width; const avail = sw - 70;
    if (tw > avail) { fs = Math.floor(fs * avail / tw); x.font = `bold ${fs}px Arial, Helvetica, sans-serif`; tw = x.measureText(name).width; }
    x.textAlign = 'center'; x.fillText(name, X + 40 + (sw - 52) / 2, Y + sh / 2 + 2);
    slots.set(name, uvRect(W, H, X + 1, Y + 1, sw - 2, sh - 2));
  });
  return { texture: tex(c, { aniso: 16 }), slots };
}

// ============================================================ decal atlas (1024 x 1024)
export const DA = { manhole: [0, 0, 256, 256], drain: [256, 0, 256, 128], stop: [512, 0, 256, 128], oil: [512, 128, 256, 128], patch: [768, 0, 256, 256],
  crack: [256, 128, 256, 128], plate: [0, 256, 256, 256], ped: [256, 256, 256, 256], xing: [512, 256, 256, 128], pit: [768, 256, 256, 256], white: [1004, 1004, 16, 16] };
export function daUV(r) { return uvRect(1024, 1024, r[0], r[1], r[2], r[3]); }
export function decalAtlas() {
  const N = 1024, [c, x] = canvas(N), rnd = mulberry(91);
  x.clearRect(0, 0, N, N);
  // manhole: dark iron disc with a rim and radial/concentric raised pattern
  { const [X, Y, W] = DA.manhole, cx = X + W / 2, cy = Y + W / 2;
    x.fillStyle = 'rgba(40,40,42,1)'; x.beginPath(); x.arc(cx, cy, 124, 0, 7); x.fill();
    x.strokeStyle = 'rgba(95,94,90,1)'; x.lineWidth = 7; x.beginPath(); x.arc(cx, cy, 118, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(75,74,72,1)'; x.lineWidth = 4;
    for (let r = 26; r < 110; r += 20) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; x.beginPath(); x.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); x.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108); x.stroke(); }
    x.fillStyle = 'rgba(120,118,112,1)'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('S.F.', cx, cy);
    // rust / wear
    for (let k = 0; k < 120; k++) { x.fillStyle = `rgba(${90 + rnd() * 50},${60 + rnd() * 30},${40},${0.12 * rnd()})`; x.beginPath(); x.arc(cx + (rnd() - 0.5) * 220, cy + (rnd() - 0.5) * 220, 3 + rnd() * 10, 0, 7); x.fill(); }
    x.globalCompositeOperation = 'destination-in'; x.beginPath(); x.arc(cx, cy, 125, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over'; }
  // storm drain grate
  { const [X, Y, W, H] = DA.drain; x.fillStyle = 'rgba(28,28,30,1)'; x.fillRect(X + 8, Y + 16, W - 16, H - 32);
    x.fillStyle = 'rgba(82,80,76,1)'; x.fillRect(X + 8, Y + 16, W - 16, 8); x.fillRect(X + 8, Y + H - 24, W - 16, 8);
    for (let k = 0; k < 15; k++) x.fillRect(X + 14 + k * 16, Y + 16, 6, H - 32);
    x.fillStyle = 'rgba(8,8,10,0.9)'; for (let k = 0; k < 14; k++) x.fillRect(X + 20 + k * 16, Y + 24, 10, H - 48); }
  // STOP road text (white, slightly worn)
  { const [X, Y, W, H] = DA.stop; x.fillStyle = 'rgba(240,240,236,0.95)'; x.font = 'bold 118px Arial Narrow, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(X + W / 2, Y + H / 2); x.scale(1, 1.0); x.fillText('STOP', 0, 6); x.restore();
    x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(0,0,0,${rnd() * 0.5})`; x.fillRect(X + rnd() * W, Y + rnd() * H, 2 + rnd() * 6, 2 + rnd() * 4); } x.globalCompositeOperation = 'source-over'; }
  // oil stain
  { const [X, Y, W, H] = DA.oil; for (let k = 0; k < 14; k++) { const g = x.createRadialGradient(X + W / 2 + (rnd() - 0.5) * 90, Y + H / 2 + (rnd() - 0.5) * 30, 2, X + W / 2, Y + H / 2, 40 + rnd() * 60);
    g.addColorStop(0, 'rgba(10,10,12,0.12)'); g.addColorStop(1, 'rgba(10,10,12,0)'); x.fillStyle = g; x.fillRect(X, Y, W, H); } }
  // asphalt patch (darker, crisp edges)
  { const [X, Y, W, H] = DA.patch; x.fillStyle = 'rgba(22,22,24,0.32)'; x.beginPath();
    const pts = 14; for (let k = 0; k < pts; k++) { const a = k / pts * Math.PI * 2; const r = 90 + rnd() * 30; x.lineTo(X + W / 2 + Math.cos(a) * r * 1.1, Y + H / 2 + Math.sin(a) * r * 0.8); } x.closePath(); x.fill();
    x.strokeStyle = 'rgba(8,8,8,0.35)'; x.lineWidth = 3; x.stroke(); }
  // cracks
  { const [X, Y, W, H] = DA.crack; x.strokeStyle = 'rgba(12,12,12,0.7)'; x.lineWidth = 2;
    for (let k = 0; k < 6; k++) { x.beginPath(); let px = X + 10 + rnd() * 30, py = Y + H / 2 + (rnd() - 0.5) * 60; x.moveTo(px, py); while (px < X + W - 15) { px += 8 + rnd() * 16; py += (rnd() - 0.5) * 18; py = Math.max(Y + 6, Math.min(Y + H - 6, py)); x.lineTo(px, py); } x.stroke(); } }
  // steel utility plate
  { const [X, Y, W] = DA.plate; x.fillStyle = 'rgba(98,95,90,1)'; x.fillRect(X + 16, Y + 16, W - 32, W - 32);
    x.strokeStyle = 'rgba(40,38,36,1)'; x.lineWidth = 4; x.strokeRect(X + 18, Y + 18, W - 36, W - 36);
    x.fillStyle = 'rgba(122,118,110,1)'; for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) if ((i + j) % 2 === 0) x.fillRect(X + 30 + i * 17, Y + 30 + j * 17, 10, 4); }
  // pedestrian xing diamond / bike symbol (road paint)
  { const [X, Y, W] = DA.ped; x.strokeStyle = 'rgba(240,240,236,0.9)'; x.lineWidth = 9; x.lineCap = 'round';
    const cx = X + W / 2, cy = Y + W / 2; x.beginPath(); x.arc(cx - 50, cy + 40, 36, 0, 7); x.stroke(); x.beginPath(); x.arc(cx + 50, cy + 40, 36, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(cx - 50, cy + 40); x.lineTo(cx - 10, cy - 20); x.lineTo(cx + 50, cy + 40); x.moveTo(cx - 10, cy - 20); x.lineTo(cx + 30, cy - 20); x.lineTo(cx + 50, cy + 40); x.moveTo(cx - 20, cy - 36); x.lineTo(cx, cy - 36); x.stroke();
    x.beginPath(); x.arc(cx + 8, cy - 70, 12, 0, 7); x.fillStyle = 'rgba(240,240,236,0.9)'; x.fill(); }
  { const [X, Y, W, H] = DA.xing; x.fillStyle = 'rgba(240,240,236,0.9)'; x.font = 'bold 86px Arial Narrow, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('XING', X + W / 2, Y + H / 2 + 4); }
  // tree pit: dark soil + mulch with a thin steel frame
  { const [X, Y, W] = DA.pit; x.fillStyle = 'rgba(44,34,26,1)'; x.fillRect(X + 8, Y + 8, W - 16, W - 16);
    for (let k = 0; k < 900; k++) { const v = 30 + rnd() * 50; x.fillStyle = `rgba(${v + 20},${v + 8},${v - 4},${0.5 + rnd() * 0.5})`; x.fillRect(X + 12 + rnd() * (W - 24), Y + 12 + rnd() * (W - 24), 2 + rnd() * 5, 2 + rnd() * 4); }
    x.strokeStyle = 'rgba(70,70,68,1)'; x.lineWidth = 8; x.strokeRect(X + 10, Y + 10, W - 20, W - 20); }
  x.fillStyle = 'rgba(255,255,255,1)'; x.fillRect(DA.white[0] - 4, DA.white[1] - 4, 24, 24);
  return tex(c, { aniso: 16 });
}
export function glowTexture() {
  const N = 128, [c, x] = canvas(N);
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.62)'); g.addColorStop(0.55, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return tex(c, { srgb: false, aniso: 1 });
}
export function dropTexture() {
  const N = 64, [c, x] = canvas(N);
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(235,245,255,0.7)'); g.addColorStop(1, 'rgba(220,235,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return tex(c, { aniso: 1 });
}

// ============================================================ foliage atlas (2048 x 2048, 4 x 4 cells of 512)
export const FOLIAGE = 2048, FC = 512;
export const LEAF = { plane: 0, ficus: 1, blossom: 2, autumn: 3, pine: 4, cypress: 5, euc: 6, scrub: 7, frond: 8, deadFrond: 10, fan: 11, barkPlane: 12, barkDark: 13, barkEuc: 14, barkPalm: 15 };
export function leafCellUV(cell, span = 1) { const col = cell % 4, row = Math.floor(cell / 4); return uvRect(FOLIAGE, FOLIAGE, col * FC + 12, row * FC + 12, FC * span - 24, FC - 24); }
export const BARK_AVG = {};
export const LEAF_AVG = {};

function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }
function leafShape(x, len, wid) { // leaf with pointed tip along +x from the origin
  x.beginPath(); x.moveTo(0, 0);
  x.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.8, len, 0);
  x.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.3, wid, 0, 0);
  x.fill();
}
function paintCluster(x, X, Y, S, rnd, o) {
  const cx = X + S / 2, cy = Y + S / 2, R = S * 0.4;
  // twigs underneath
  x.strokeStyle = o.twig || 'rgba(70,52,36,0.9)'; x.lineCap = 'round';
  for (let k = 0; k < (o.twigs ?? 7); k++) {
    const a = rnd() * Math.PI * 2, r = R * (0.5 + rnd() * 0.45);
    x.lineWidth = 2 + rnd() * 3; x.beginPath(); x.moveTo(cx + (rnd() - 0.5) * 20, cy + (rnd() - 0.5) * 20);
    x.quadraticCurveTo(cx + Math.cos(a + 0.4) * r * 0.5, cy + Math.sin(a + 0.4) * r * 0.5, cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke();
  }
  const n = o.count;
  for (let i = 0; i < n; i++) {
    // gaussian-ish radial distribution, denser in the middle; later leaves (on top) lighter
    const t = i / n;
    const a = rnd() * Math.PI * 2, rr = R * Math.pow(rnd(), o.spread ?? 0.7);
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * (o.squash ?? 1);
    if (Math.hypot(px - cx, (py - cy)) > R - o.len * 0.35) continue;
    const [h, s, l] = o.col(rnd, t);
    x.save(); x.translate(px, py);
    const rot = o.hang ? Math.PI / 2 + (rnd() - 0.5) * 1.1 : a + (rnd() - 0.5) * 1.6;
    x.rotate(rot);
    const len = o.len * (0.7 + rnd() * 0.6), wid = o.wid * (0.7 + rnd() * 0.6);
    if (o.kind === 'needle') {
      x.strokeStyle = hsl(h, s, l); x.lineWidth = o.wid; x.lineCap = 'round';
      const k = 9 + Math.floor(rnd() * 7);
      for (let q = 0; q < k; q++) { const b = (q / k - 0.5) * 1.9; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(b) * len, Math.sin(b) * len); x.stroke(); }
    } else if (o.kind === 'scale') {
      x.fillStyle = hsl(h, s, l);
      for (let q = 0; q < 6; q++) { x.beginPath(); x.ellipse(q * wid * 0.9, (rnd() - 0.5) * wid * 0.6, wid * 0.9, wid * 0.62, 0, 0, 7); x.fill(); }
      x.fillStyle = hsl(h, s, l + 7, 0.8); x.beginPath(); x.ellipse(wid * 2, -wid * 0.3, wid * 1.2, wid * 0.4, 0, 0, 7); x.fill();
    } else if (o.kind === 'flower') {
      if (rnd() < (o.leafFrac ?? 0.25)) { const [lh, ls, ll] = o.leafCol(rnd); x.fillStyle = hsl(lh, ls, ll); leafShape(x, len * 1.2, wid * 0.9); }
      else { x.fillStyle = hsl(h, s, l); for (let q = 0; q < 5; q++) { x.rotate(Math.PI * 2 / 5); x.beginPath(); x.ellipse(wid * 0.55, 0, wid * 0.62, wid * 0.42, 0, 0, 7); x.fill(); }
        x.fillStyle = hsl(50, 80, 70); x.beginPath(); x.arc(0, 0, wid * 0.22, 0, 7); x.fill(); }
    } else {
      x.fillStyle = hsl(h, s, l); leafShape(x, len, wid);
      if (o.vein) { x.strokeStyle = hsl(h, s - 10, l + 12, 0.55); x.lineWidth = 1.2; x.beginPath(); x.moveTo(1, 0); x.lineTo(len * 0.85, 0); x.stroke(); }
    }
    x.restore();
  }
}
function paintBark(x, X, Y, S, rnd, kind) {
  const img = x.createImageData(S, S), d = img.data;
  // value noise
  const G = 16, g = []; for (let i = 0; i < G * G; i++) g.push(rnd());
  const vn = (u, v) => { const i = Math.floor(u) % G, j = Math.floor(v) % G, fu = u - Math.floor(u), fv = v - Math.floor(v); const a = g[j * G + i], b = g[j * G + (i + 1) % G], c = g[((j + 1) % G) * G + i], e = g[((j + 1) % G) * G + (i + 1) % G]; const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv); return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + e * su) * sv; };
  let sr = 0, sg = 0, sb = 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S * G, v = j / S * G;
    let r, gg, b;
    if (kind === 'plane') { // camouflage patches
      const n = vn(u * 0.6, v * 0.35) * 0.6 + vn(u * 1.4, v * 0.9) * 0.4;
      const t = n < 0.42 ? 0 : n < 0.55 ? 1 : 2;
      [r, gg, b] = [[86, 80, 64], [122, 116, 94], [158, 150, 122]][t];
      const f = 0.9 + vn(u * 6, v * 6) * 0.2; r *= f; gg *= f; b *= f;
    } else if (kind === 'dark') { // vertical furrows
      const f = Math.pow(Math.abs(Math.sin((u * 1.3 + vn(u * 0.5, v * 0.15) * 3) * Math.PI)), 0.6);
      const n = 0.75 + vn(u * 2, v * 0.6) * 0.35;
      r = (52 + 50 * f) * n; gg = (44 + 40 * f) * n; b = (36 + 32 * f) * n;
    } else if (kind === 'euc') { // pale with peeling strips
      const strip = vn(u * 2.2, v * 0.12);
      const pale = strip > 0.48;
      const n = 0.85 + vn(u * 5, v * 2) * 0.25;
      if (pale) { r = 176 * n; gg = 168 * n; b = 152 * n; } else { r = 128 * n; gg = 104 * n; b = 86 * n; }
    } else { // palm: diamond leaf-base scars
      const a = (u * 2 + v * 2) % 2, c = (u * 2 - v * 2 + 64) % 2;
      const ridge = Math.min(Math.abs(a - 1), Math.abs(c - 1));
      const n = 0.85 + vn(u * 4, v * 4) * 0.25;
      const k = 0.65 + ridge * 0.55;
      r = 120 * k * n; gg = 100 * k * n; b = 76 * k * n;
    }
    const q = (j * S + i) * 4; d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = 255;
    sr += r; sg += gg; sb += b;
  }
  x.putImageData(img, X, Y);
  const n = S * S; return [sr / n / 255, sg / n / 255, sb / n / 255];
}
function paintFrond(x, X, Y, W, H, rnd, dead = false) {
  // rachis along +x from left (base) to right (tip), leaflets both sides angled toward the tip
  const cy = Y + H / 2;
  x.strokeStyle = dead ? '#7a5a34' : '#5b6b2c'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(X + 6, cy); x.lineTo(X + W - 6, cy); x.stroke();
  const n = 70;
  for (let i = 0; i < n; i++) {
    const t = i / n, px = X + 18 + t * (W - 30);
    const len = H * 0.47 * (t < 0.12 ? t / 0.12 * 0.7 + 0.3 : 1 - Math.pow((t - 0.12) / 0.88, 2) * 0.85);
    for (const sd of [-1, 1]) {
      const a = sd * (0.75 + rnd() * 0.25);
      const l = dead ? 34 + rnd() * 10 : 30 + rnd() * 14, h = dead ? 32 + rnd() * 8 : 78 + rnd() * 16, s = dead ? 45 : 42 + rnd() * 15;
      x.strokeStyle = hsl(h, s, l); x.lineWidth = 4 + rnd() * 2;
      x.beginPath(); x.moveTo(px, cy); x.quadraticCurveTo(px + Math.cos(a) * len * 0.5 + 6, cy + Math.sin(a) * len * 0.5, px + Math.cos(a * 0.8) * len * 0.95 + 14, cy + Math.sin(a) * len); x.stroke();
    }
  }
}
function paintFan(x, X, Y, S, rnd) {
  const cx = X + S / 2, cy = Y + S * 0.92;
  for (let i = 0; i < 46; i++) {
    const a = Math.PI + (i / 45) * Math.PI;
    const len = S * (0.42 + rnd() * 0.06);
    x.strokeStyle = hsl(85 + rnd() * 20, 30 + rnd() * 15, 28 + rnd() * 16); x.lineWidth = 9 + rnd() * 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.moveTo(cx + Math.cos(a) * len * 0.9, cy + Math.sin(a) * len * 0.9); x.lineTo(cx + Math.cos(a + 0.04) * len * 1.07, cy + Math.sin(a + 0.04) * len * 1.07); x.stroke();
  }
}

export function foliageAtlas() {
  const N = FOLIAGE, [c, x] = canvas(N), rnd = mulberry(1234);
  x.clearRect(0, 0, N, N);
  const cell = (i) => [(i % 4) * FC, Math.floor(i / 4) * FC];
  const green = (h0, h1, s0, s1, l0, l1) => (r, t) => [h0 + r() * (h1 - h0), s0 + r() * (s1 - s0), l0 + r() * (l1 - l0) + t * 10];
  paintCluster(x, ...cell(LEAF.plane), FC, rnd, { count: 820, len: 44, wid: 25, col: green(76, 104, 34, 54, 20, 36), vein: true, spread: 0.62 });
  paintCluster(x, ...cell(LEAF.ficus), FC, rnd, { count: 1800, len: 24, wid: 11, col: green(98, 120, 38, 55, 14, 28), spread: 0.55, vein: true });
  paintCluster(x, ...cell(LEAF.blossom), FC, rnd, { kind: 'flower', count: 1500, len: 22, wid: 12, spread: 0.6, col: (r, t) => [330 + r() * 22, 55 + r() * 30, 70 + r() * 16 + t * 4], leafFrac: 0.18, leafCol: r => [95 + r() * 25, 30 + r() * 10, 30 + r() * 10] });
  paintCluster(x, ...cell(LEAF.autumn), FC, rnd, { count: 820, len: 42, wid: 25, vein: true, spread: 0.62, col: (r, t) => { const k = r(); return k < 0.42 ? [34 + r() * 14, 78 + r() * 18, 40 + r() * 12 + t * 8] : k < 0.72 ? [16 + r() * 12, 72 + r() * 20, 34 + r() * 10 + t * 6] : k < 0.88 ? [50 + r() * 12, 62 + r() * 16, 38 + r() * 10 + t * 6] : [4 + r() * 8, 62, 30 + r() * 8]; } });
  paintCluster(x, ...cell(LEAF.pine), FC, rnd, { kind: 'needle', count: 300, len: 44, wid: 2.2, col: green(95, 130, 25, 40, 16, 30), spread: 0.6, twigs: 10 });
  paintCluster(x, ...cell(LEAF.cypress), FC, rnd, { kind: 'scale', count: 900, len: 20, wid: 8, col: green(100, 140, 25, 40, 12, 26), spread: 0.55, twigs: 6 });
  paintCluster(x, ...cell(LEAF.euc), FC, rnd, { count: 700, len: 64, wid: 11, col: green(70, 110, 12, 24, 30, 46), hang: true, spread: 0.65, twigs: 9, twig: 'rgba(120,70,60,0.9)' });
  paintCluster(x, ...cell(LEAF.scrub), FC, rnd, { count: 1500, len: 16, wid: 8, col: green(70, 95, 22, 36, 20, 34), spread: 0.5, twigs: 12 });
  { const [X, Y] = cell(LEAF.frond); paintFrond(x, X, Y + 96, FC * 2, 320, rnd, false); }
  { const [X, Y] = cell(LEAF.deadFrond); paintFrond(x, X, Y + 96, FC, 320, rnd, true); }
  { const [X, Y] = cell(LEAF.fan); paintFan(x, X, Y, FC, rnd); }
  // bark cells: painted at 128 px and scaled up (broadleaf trunks use the photo bark; these are the fallback + impostor colour)
  const [bc, bx] = canvas(128);
  const bark = (key, cellId, kind, size) => {
    const avg = paintBark(bx, 0, 0, size, rnd, kind);
    const [X, Y] = cell(cellId);
    x.imageSmoothingEnabled = true; x.drawImage(bc, 0, 0, size, size, X, Y, FC, FC);
    BARK_AVG[key] = avg;
  };
  bark('plane', LEAF.barkPlane, 'plane', 128);
  bark('dark', LEAF.barkDark, 'dark', 128);
  bark('euc', LEAF.barkEuc, 'euc', 128);
  // palm trunks keep the painted diamond pattern at full resolution
  BARK_AVG.palm = paintBark(x, ...cell(LEAF.barkPalm), FC, rnd, 'palm');
  const t = tex(c, { aniso: 8 });
  t.userData.canvas = c;
  return t;
}
