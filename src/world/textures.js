// Canvas-generated tiling textures (no image assets).
import * as THREE from 'three';
import { mulberry32 } from './geo.js';

function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// tileable value noise into an ImageData channel
function noiseField(n, cells, rnd) {
  const g = []; for (let j = 0; j < cells; j++) { g.push([]); for (let i = 0; i < cells; i++) g[j].push(rnd()); }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = (x / n) * cells, fy = (y / n) * cells;
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
    const a = g[j % cells][i % cells], b = g[j % cells][(i + 1) % cells], c = g[(j + 1) % cells][i % cells], d = g[(j + 1) % cells][(i + 1) % cells];
    out[y * n + x] = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  return out;
}
function fbmField(n, rnd, octaves = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]]) {
  const out = new Float32Array(n * n);
  for (const [cells, amp] of octaves) { const f = noiseField(n, cells, rnd); for (let i = 0; i < out.length; i++) out[i] += f[i] * amp; }
  return out;
}

let cache = null;
export function worldTextures() {
  if (cache) return cache;
  cache = {};
  // ---- asphalt
  {
    const n = 512, [c, x] = canvas(n), rnd = mulberry32(11);
    const f = fbmField(n, rnd);
    const img = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const sp = rnd();
      let v = 92 + (f[i] - 0.5) * 22 + (sp < 0.08 ? 26 * rnd() : 0) - (sp > 0.96 ? 16 * rnd() : 0);
      img.data[i * 4] = v + 1; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v - 2; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // tar seams & cracks
    x.strokeStyle = 'rgba(30,30,32,0.22)'; x.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      x.beginPath(); let px = rnd() * n, py = rnd() * n; x.moveTo(px, py);
      for (let s = 0; s < 8; s++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
    x.fillStyle = 'rgba(20,20,22,0.07)';
    for (let k = 0; k < 10; k++) { x.beginPath(); x.ellipse(rnd() * n, rnd() * n, 20 + rnd() * 50, 10 + rnd() * 30, rnd() * 3, 0, 7); x.fill(); }
    cache.asphalt = tex(c);
  }
  // ---- sidewalk concrete: 2x2 slabs per tile (tile = 3 m)
  {
    const n = 512, [c, x] = canvas(n), rnd = mulberry32(23);
    const f = fbmField(n, rnd);
    const img = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 150 + (f[i] - 0.5) * 26 + (rnd() < 0.05 ? -22 * rnd() : 0);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v - 4; img.data[i * 4 + 2] = v - 11; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = 'rgba(70,68,64,0.8)';
    x.fillRect(0, 0, n, 3); x.fillRect(0, n / 2 - 1, n, 3); x.fillRect(0, 0, 3, n); x.fillRect(n / 2 - 1, 0, 3, n);
    x.fillStyle = 'rgba(40,40,40,0.1)';
    for (let k = 0; k < 14; k++) { x.beginPath(); x.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 18, 5 + rnd() * 12, 0, 0, 7); x.fill(); }
    cache.concrete = tex(c);
  }
  // ---- ground detail (greyscale, multiplied with vertex colour)
  {
    const n = 512, [c, x] = canvas(n), rnd = mulberry32(37);
    const f = fbmField(n, rnd, [[8, 0.4], [16, 0.25], [32, 0.2], [64, 0.15]]);
    const img = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 168 + (f[i] - 0.5) * 70 + (rnd() - 0.5) * 22;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    cache.ground = tex(c);
  }
  // ---- soft round glow (sprites / light pools)
  {
    const n = 128, [c, x] = canvas(n);
    const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    cache.glow = tex(c, { repeat: false });
  }
  return cache;
}
