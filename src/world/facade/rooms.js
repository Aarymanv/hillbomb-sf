// Canvas atlas of furnished room back walls for the interior-mapping shader (fallback until baked atlases exist).
// 2048 x 1024 = 4 x 2 tiles of 512 x 512; each tile is a front view of a room's back wall (about 3.6 m wide, 3 m tall):
// 0 living room, 1 library, 2 bedroom, 3 kitchen, 4 dining, 5 study/office, 6 hallway, 7 window wall.
import * as THREE from 'three';
import { mulberry32 } from '../geo.js';

let tex = null;
export function roomBackWalls() {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const x = c.getContext('2d');
  const rnd = mulberry32(777);
  const T = 512;
  const walls = ['#cdbb9a', '#8fa3a8', '#d9cbb6', '#e6e0d2', '#9b6b5a', '#b9c2b0', '#d8c8a8', '#c9d3d9'];
  for (let i = 0; i < 8; i++) {
    const X = (i % 4) * T, Y = Math.floor(i / 4) * T;
    x.save(); x.translate(X, Y); x.beginPath(); x.rect(0, 0, T, T); x.clip();
    drawTile(x, i, T, walls[i], rnd);
    x.restore();
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// helpers (canvas y grows downward; floor line at the bottom)
function shadeRect(x, X, Y, W, H, col, dark = 0.25) {
  x.fillStyle = col; x.fillRect(X, Y, W, H);
  const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, `rgba(0,0,0,${dark})`);
  x.fillStyle = g; x.fillRect(X, Y, W, H);
}
function frame(x, X, Y, W, H, rnd) {
  x.fillStyle = '#3a2a1c'; x.fillRect(X - 6, Y - 6, W + 12, H + 12);
  x.fillStyle = '#efe8d8'; x.fillRect(X, Y, W, H);
  const pal = [['#2f5d7c', '#e3b04b', '#c0583a'], ['#6b8f4e', '#d9c27a', '#3e4a6b'], ['#b3453a', '#f1d6a0', '#355c4a']][Math.floor(rnd() * 3)];
  x.fillStyle = pal[0]; x.fillRect(X + 8, Y + 8, W - 16, H - 16);
  x.fillStyle = pal[1]; x.beginPath(); x.arc(X + W * (0.3 + rnd() * 0.4), Y + H * 0.4, Math.min(W, H) * 0.18, 0, 7); x.fill();
  x.fillStyle = pal[2]; x.beginPath(); x.moveTo(X + 8, Y + H - 8); x.lineTo(X + W * 0.45, Y + H * 0.5); x.lineTo(X + W - 8, Y + H - 8); x.fill();
}
function lamp(x, cx, top, bottom, on = true) {
  x.fillStyle = '#2b2b2b'; x.fillRect(cx - 3, top + 40, 6, bottom - top - 40);
  x.fillStyle = '#3a3a3a'; x.fillRect(cx - 22, bottom - 6, 44, 6);
  const g = x.createLinearGradient(0, top, 0, top + 44); g.addColorStop(0, '#f8e2b0'); g.addColorStop(1, '#d9a85a');
  x.fillStyle = g; x.beginPath(); x.moveTo(cx - 18, top); x.lineTo(cx + 18, top); x.lineTo(cx + 30, top + 44); x.lineTo(cx - 30, top + 44); x.fill();
  if (on) { const r = x.createRadialGradient(cx, top + 30, 5, cx, top + 30, 120); r.addColorStop(0, 'rgba(255,220,160,0.35)'); r.addColorStop(1, 'rgba(255,220,160,0)'); x.fillStyle = r; x.fillRect(cx - 120, top - 90, 240, 240); }
}
function plant(x, cx, bottom, s = 1) {
  x.fillStyle = '#8a5a3a'; x.fillRect(cx - 22 * s, bottom - 44 * s, 44 * s, 44 * s);
  x.fillStyle = '#3f6b3a';
  for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.28; x.beginPath(); x.ellipse(cx + Math.cos(a) * 40 * s, bottom - 44 * s + Math.sin(a) * 70 * s, 12 * s, 40 * s, a + Math.PI / 2, 0, 7); x.fill(); }
}
function sofa(x, X, Y, W, col) {
  shadeRect(x, X, Y, W, 70, col, 0.35);                     // back cushions
  shadeRect(x, X - 18, Y + 30, 30, 90, col, 0.45);          // arms
  shadeRect(x, X + W - 12, Y + 30, 30, 90, col, 0.45);
  shadeRect(x, X + 10, Y + 62, W - 20, 50, col, 0.2);       // seat
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(X + W / 2 - 1, Y + 62, 2, 50);
  x.fillStyle = '#e8d9b8'; x.fillRect(X + 22, Y + 30, 40, 34); x.fillStyle = '#b8574a'; x.fillRect(X + W - 64, Y + 30, 40, 34);
  x.fillStyle = '#2a2018'; x.fillRect(X, Y + 112, 8, 12); x.fillRect(X + W - 8, Y + 112, 8, 12);
}
function books(x, X, Y, W, H, rnd) {
  let u = X;
  while (u < X + W - 6) {
    const w = 6 + rnd() * 10, h = H * (0.7 + rnd() * 0.28);
    const cols = ['#7a2a24', '#2f4a6b', '#c8a24a', '#3f5f3a', '#d8d0c0', '#5a3a5a', '#b8643a', '#1f2a3a'];
    x.fillStyle = cols[Math.floor(rnd() * cols.length)]; x.fillRect(u, Y + H - h, w, h);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(u + 1, Y + H - h + 6, w - 2, 2);
    u += w + (rnd() < 0.1 ? 8 : 0.8);
  }
}
function floorLine(x, T, col = '#5a4030') {
  x.fillStyle = col; x.fillRect(0, T - 30, T, 30);
  x.fillStyle = '#f2ece0'; x.fillRect(0, T - 42, T, 12); // baseboard
}
function wallpaper(x, T, base, kind, rnd) {
  x.fillStyle = base; x.fillRect(0, 0, T, T);
  if (kind === 1) { x.fillStyle = 'rgba(255,255,255,0.10)'; for (let u = 0; u < T; u += 32) x.fillRect(u, 0, 14, T); }
  if (kind === 2) { x.fillStyle = 'rgba(80,40,20,0.10)'; for (let v = 0; v < T; v += 40) for (let u = (v / 40) % 2 * 20; u < T; u += 40) { x.beginPath(); x.arc(u, v, 6, 0, 7); x.fill(); } }
  if (kind === 3) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, T * 0.55, T, T * 0.45); x.fillStyle = '#f2ece0'; x.fillRect(0, T * 0.55, T, 8); }
  const g = x.createLinearGradient(0, 0, 0, T); g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  x.fillStyle = g; x.fillRect(0, 0, T, T);
}

function drawTile(x, i, T, wall, rnd) {
  const F = T - 30; // floor line
  switch (i) {
    case 0: { // living room
      wallpaper(x, T, wall, 1, rnd); floorLine(x, T);
      frame(x, 120, 120, 120, 90, rnd); frame(x, 270, 140, 80, 70, rnd);
      sofa(x, 90, F - 125, 300, '#5a6b7a');
      lamp(x, 440, 150, F); plant(x, 50, F, 0.9);
      break;
    }
    case 1: { // library
      wallpaper(x, T, wall, 0, rnd); floorLine(x, T, '#4a3020');
      shadeRect(x, 30, 40, 452, F - 40, '#5a3a24', 0.3);
      for (let k = 0; k < 5; k++) { const y0 = 60 + k * 82; x.fillStyle = '#3a2416'; x.fillRect(40, y0 + 70, 432, 10); books(x, 44, y0, 424, 70, rnd); }
      sofa(x, 150, F - 110, 160, '#7a3a2a');
      break;
    }
    case 2: { // bedroom
      wallpaper(x, T, wall, 2, rnd); floorLine(x, T, '#6a4a34');
      shadeRect(x, 130, F - 190, 250, 110, '#6b4a34', 0.3);   // headboard
      shadeRect(x, 120, F - 100, 270, 100, '#e8e2d6', 0.2);   // bed
      x.fillStyle = '#9fb4c8'; x.fillRect(120, F - 70, 270, 70);
      x.fillStyle = '#f4f0e8'; x.fillRect(150, F - 118, 90, 30); x.fillRect(270, F - 118, 90, 30);
      shadeRect(x, 50, F - 70, 60, 70, '#5a3a24'); shadeRect(x, 400, F - 70, 60, 70, '#5a3a24');
      lamp(x, 80, F - 140, F - 70); lamp(x, 430, F - 140, F - 70);
      frame(x, 200, 90, 110, 70, rnd);
      break;
    }
    case 3: { // kitchen
      wallpaper(x, T, wall, 0, rnd); floorLine(x, T, '#8a8a88');
      x.fillStyle = '#dfe8ec'; for (let v = F - 200; v < F - 110; v += 16) for (let u = 20; u < 492; u += 16) { x.fillRect(u, v, 15, 15); }
      shadeRect(x, 20, 40, 300, 110, '#f2eee6', 0.15);         // upper cabinets
      for (let u = 20; u < 320; u += 75) { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; x.strokeRect(u + 4, 44, 67, 102); }
      shadeRect(x, 20, F - 110, 330, 110, '#f2eee6', 0.2);     // lower cabinets
      x.fillStyle = '#3a3a3a'; x.fillRect(16, F - 118, 338, 10); // counter
      shadeRect(x, 370, 60, 120, F - 60, '#c8ccd0', 0.25);     // fridge
      x.fillStyle = '#8a8e92'; x.fillRect(380, 150, 6, 60); x.fillRect(380, 250, 6, 80);
      x.fillStyle = '#a8c8e0'; x.fillRect(120, F - 200, 110, 70); // window over the sink
      break;
    }
    case 4: { // dining
      wallpaper(x, T, wall, 3, rnd); floorLine(x, T, '#5a3a28');
      frame(x, 150, 80, 210, 130, rnd);
      shadeRect(x, 110, F - 110, 290, 22, '#4a2e1e', 0.2);     // table top
      x.fillStyle = '#3a2416'; x.fillRect(130, F - 90, 10, 90); x.fillRect(372, F - 90, 10, 90);
      for (const u of [90, 190, 300, 400]) { shadeRect(x, u, F - 150, 36, 60, '#6b4a34', 0.3); x.fillStyle = '#3a2416'; x.fillRect(u + 2, F - 90, 6, 90); x.fillRect(u + 28, F - 90, 6, 90); }
      x.fillStyle = '#2a2a2a'; x.fillRect(254, 0, 3, 60);
      const g = x.createRadialGradient(256, 70, 4, 256, 70, 60); g.addColorStop(0, '#fff2d0'); g.addColorStop(1, 'rgba(255,220,150,0)'); x.fillStyle = g; x.fillRect(190, 20, 130, 110);
      x.fillStyle = '#c8a060'; x.beginPath(); x.moveTo(236, 60); x.lineTo(276, 60); x.lineTo(290, 80); x.lineTo(222, 80); x.fill();
      break;
    }
    case 5: { // study / office
      wallpaper(x, T, '#c8ccc8', 0, rnd); floorLine(x, T, '#3a3e48');
      shadeRect(x, 60, F - 105, 380, 18, '#d8d0c0', 0.1);      // desk
      x.fillStyle = '#5a5a5a'; x.fillRect(70, F - 87, 10, 87); x.fillRect(420, F - 87, 10, 87);
      shadeRect(x, 170, F - 215, 150, 100, '#1a1a1e', 0.1);    // monitor
      x.fillStyle = '#4a7ab0'; x.fillRect(178, F - 207, 134, 84);
      x.fillStyle = '#2a2a2a'; x.fillRect(238, F - 115, 14, 12);
      shadeRect(x, 200, F - 80, 80, 80, '#2a2a30', 0.3);       // chair
      for (let k = 0; k < 2; k++) { x.fillStyle = '#6a6a6a'; x.fillRect(40, 70 + k * 70, 170, 8); books(x, 44, 12 + k * 70, 160, 58, rnd); }
      frame(x, 330, 70, 120, 90, rnd);
      break;
    }
    case 6: { // hallway with a door
      wallpaper(x, T, wall, 2, rnd); floorLine(x, T, '#6a4a34');
      shadeRect(x, 190, F - 330, 140, 330, '#6b4a34', 0.25);
      x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 3; x.strokeRect(205, F - 310, 110, 130); x.strokeRect(205, F - 160, 110, 130);
      x.fillStyle = '#d8b050'; x.beginPath(); x.arc(310, F - 170, 6, 0, 7); x.fill();
      frame(x, 50, 120, 100, 140, rnd);
      x.fillStyle = '#3a2a1c'; x.fillRect(400, 90, 10, F - 90); x.fillStyle = '#7a5a3a'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(405 + (k - 1) * 18, 140 + k * 10, 14, 40, 0, 0, 7); x.fill(); }
      plant(x, 460, F, 0.8);
      break;
    }
    default: { // window wall with curtains
      wallpaper(x, T, wall, 0, rnd); floorLine(x, T, '#6a4a34');
      const g = x.createLinearGradient(0, 80, 0, 360); g.addColorStop(0, '#d8e8f4'); g.addColorStop(1, '#a8c0d0');
      x.fillStyle = g; x.fillRect(130, 80, 250, 280);
      x.fillStyle = '#f4f0e8'; x.fillRect(126, 76, 258, 8); x.fillRect(126, 356, 258, 8); x.fillRect(251, 80, 8, 280); x.fillRect(130, 216, 250, 6);
      for (const [u, w] of [[90, 60], [360, 60]]) { const cg = x.createLinearGradient(u, 0, u + w, 0); cg.addColorStop(0, '#8a3a3a'); cg.addColorStop(0.5, '#b85a4a'); cg.addColorStop(1, '#7a2a2a'); x.fillStyle = cg; x.fillRect(u, 60, w, F - 60); }
      shadeRect(x, 180, F - 90, 150, 90, '#6b7a5a', 0.3);      // armchair
      plant(x, 450, F, 1.0);
      break;
    }
  }
}
