// Placement data for the ground-cover shaders.
//  GroundCapture: an orthographic top-down render of the ground meshes around the camera into a float target
//    (R = ground height, G = blocked (road / sidewalk / building / deck), B = ground present). 0.5 m texels, 384 m window.
//    Blocked meshes are lifted a little in depth so they win ties with the terrain at road edges.
//  BioWindow: the 4 m surface raster around the camera as RGBA8 (R = class, G = lushness, B = slope, A = 255), built
//    per 256 m tile (cached, one tile per frame) into a 3x3-tile window.
import * as THREE from 'three';
import { ll } from '../latlon.js';

const BLOCK_RE = /road|sidewalk|walk|marking|paved|deck|curb|rail|kerb|bridge|pier|plaza/i;

function capMat(flag) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false });
  m.onBeforeCompile = sh => {
    sh.uniforms.uFlag = { value: flag };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCapY;').replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cw = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        cw = batchingMatrix * cw;
      #endif
      #ifdef USE_INSTANCING
        cw = instanceMatrix * cw;
      #endif
      vCapY = (modelMatrix * cw).y;
      ${flag ? 'gl_Position.z -= 1.2e-4 * gl_Position.w;' : ''}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCapY;\nuniform float uFlag;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor = vec4(vCapY, uFlag, 1.0, 1.0);');
  };
  m.customProgramCacheKey = () => 'hbgrasscap' + flag;
  return m;
}

export class GroundCapture {
  constructor(renderer, { size = 384, res = 768, ground = [], blocked = [] } = {}) {
    this.renderer = renderer; this.size = size; this.res = res; this.ground = ground; this.blocked = blocked;
    this.rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    this.rt.texture.name = 'grass-capture';
    const h = size / 2;
    this.cam = new THREE.OrthographicCamera(-h, h, -h, h, 1, 8000);   // top < bottom: texture row 0 = min z
    this.cam.up.set(0, 0, -1);
    this.matG = capMat(0); this.matB = capMat(1);
    this.xf = new THREE.Vector4(1e9, 1e9, 1 / size, res);
    this.cx = 1e9; this.cz = 1e9; this.age = 0;
  }
  capture(x, z) {
    const r = this.renderer, texel = this.size / this.res;
    const cx = Math.round(x / texel) * texel, cz = Math.round(z / texel) * texel;
    this.cam.position.set(cx, 4000, cz); this.cam.lookAt(cx, 0, cz); this.cam.updateMatrixWorld();
    const swapped = [], hidden = [];
    const visit = (root, forceBlocked) => root && root.traverse(o => {
      if (o.isMesh) { swapped.push(o, o.material); o.material = (forceBlocked || BLOCK_RE.test(o.name)) ? this.matB : this.matG; }
      else if ((o.isLine || o.isPoints || o.isSprite) && o.visible) { hidden.push(o); o.visible = false; }
    });
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevShadow = r.shadowMap.autoUpdate;
    const prevCol = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
    try {
      for (const g of this.ground) visit(g, false);
      for (const b of this.blocked) visit(b, true);
      r.shadowMap.autoUpdate = false; r.autoClear = false;
      r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
      for (const g of this.ground) if (g) r.render(g, this.cam);
      for (const b of this.blocked) if (b) r.render(b, this.cam);
    } finally {
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      for (const o of hidden) o.visible = true;
      r.setRenderTarget(prevRT); r.autoClear = prevAuto; r.shadowMap.autoUpdate = prevShadow; r.setClearColor(prevCol, prevA);
    }
    this.cx = cx; this.cz = cz; this.age = 0;
    this.xf.set(cx - this.size / 2, cz - this.size / 2, 1 / this.size, this.res);
  }
}

// ---------------------------------------------------------------- biome raster
const TILE = 64, WIN = 3;
// irrigated parks (green all summer) by lat/lon: [lat0, lon0, lat1, lon1] boxes or [lat, lon, radius m] circles
const PARK_BOX = [[37.7655, -122.5110, 37.7745, -122.4575], [37.7715, -122.4580, 37.7735, -122.4527]];   // Golden Gate Park + Panhandle
const PARK_CIRCLE = [[37.7596, -122.4269, 170], [37.7764, -122.4346, 120], [37.8030, -122.4480, 250], [37.8005, -122.4585, 250], [37.7920, -122.4270, 110], [37.7855, -122.4555, 120]];
export class BioWindow {
  constructor({ grid, cls, height }) {
    this.grid = grid; this.cls = cls; this.height = height;
    const R = TILE * WIN; this.R = R;
    this.data = new Uint8Array(R * R * 4);
    this.tex = new THREE.DataTexture(this.data, R, R, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.needsUpdate = true;
    this.xf = new THREE.Vector4(1e9, 1e9, 1 / (R * grid.cell), R);
    this.tiles = new Map(); this.want = null; this.cur = null;
    this.parkBoxes = PARK_BOX.map(([a, b, c, d]) => { const p = ll(a, b), q = ll(c, d); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; });
    this.parkCircles = PARK_CIRCLE.map(([a, b, r]) => { const p = ll(a, b); return [p[0], p[1], r]; });
  }
  inPark(x, z) {
    for (const b of this.parkBoxes) if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]) return true;
    for (const c of this.parkCircles) if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2]) return true;
    return false;
  }
  buildTile(ti, tj) {
    const { x0, z0, cell } = this.grid, out = new Uint8Array(TILE * TILE * 4), N = TILE + 2, hs = new Float32Array(N * N);
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) hs[b * N + a] = this.height(x0 + (ti * TILE + a - 1) * cell, z0 + (tj * TILE + b - 1) * cell);
    for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
      const x = x0 + (ti * TILE + a) * cell, z = z0 + (tj * TILE + b) * cell, k = (b + 1) * N + a + 1;
      const c = this.cls(x, z) | 0, h = hs[k];
      const sl = Math.hypot(hs[k + 1] - hs[k - 1], hs[k + N] - hs[k - N]) / (2 * cell);
      let lush = 0;
      if (c === 9) lush = 0.95;
      else if (c === 3) {
        lush = Math.min(1, Math.max(0, 1.25 - sl * 3.5)) * Math.min(1, Math.max(0, (150 - h) / 90));
        if (this.inPark(x, z)) lush = Math.max(lush, 0.95);
      } else if (c === 8) lush = 0.08; else if (c === 7) lush = 0.8; else if (c === 5) lush = 0.25; else if (c === 4) lush = 0.35; else if (c === 6) lush = 0.2;
      const o = (b * TILE + a) * 4;
      out[o] = c; out[o + 1] = Math.round(lush * 255); out[o + 2] = Math.min(255, Math.round(sl / 1.5 * 255)); out[o + 3] = 255;
    }
    return out;
  }
  // call every frame; builds at most one missing tile per call, swaps the window when all 9 are ready
  update(x, z) {
    const { x0, z0, cell } = this.grid;
    // 3x3 tiles with the camera's tile in the middle (>= 256 m of data in every direction)
    const bi = Math.floor(((x - x0) / cell + 0.5) / TILE) - 1, bj = Math.floor(((z - z0) / cell + 0.5) / TILE) - 1;
    const key = bi + ',' + bj;
    if (this.cur === key) return false;
    let built = 0;
    for (let j = 0; j < WIN; j++) for (let i = 0; i < WIN; i++) {
      const k = (bi + i) + ',' + (bj + j);
      if (!this.tiles.has(k)) { if (built >= 1 && this.cur !== null) return false; this.tiles.set(k, this.buildTile(bi + i, bj + j)); built++; }
    }
    const R = this.R;
    for (let j = 0; j < WIN; j++) for (let i = 0; i < WIN; i++) {
      const t = this.tiles.get((bi + i) + ',' + (bj + j));
      for (let b = 0; b < TILE; b++) this.data.set(t.subarray(b * TILE * 4, (b + 1) * TILE * 4), ((j * TILE + b) * R + i * TILE) * 4);
    }
    this.tex.needsUpdate = true;
    this.xf.set(x0 + bi * TILE * cell - cell / 2, z0 + bj * TILE * cell - cell / 2, 1 / (R * cell), R);
    this.cur = key;
    if (this.tiles.size > 80) for (const k of this.tiles.keys()) { this.tiles.delete(k); if (this.tiles.size <= 40) break; }
    return true;
  }
}
