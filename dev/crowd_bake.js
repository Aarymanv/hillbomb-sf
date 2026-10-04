// Far-crowd impostor bake (run in the game page, any spot): renders 16 Rocketbox avatars walking (8 phases of their gait
// cycle) from 8 horizontal directions into a 2048x1024 atlas (32x64 px cells), albedo (sRGB, alpha = coverage) and view-space
// normals. Rows = avatars (top-down), columns = angle * 8 + phase. Angle k: camera at azimuth k * 45 deg from the avatar's
// facing (k = 0 in front, counter-clockwise seen from above).
//   const r = await (await import('http://127.0.0.1:5190/dev/crowd_bake.js')).bake()   -> { alb, nrm (PNG data URLs), meta }
// The node side (tools/crowd_bake.mjs) writes public/assets/peds/crowd_{alb,nrm}.png + crowd.json; then
// python tools/texpack.py --only crowd
import * as THREE from 'three';
import { RealHuman, pedIndex, bakeMaterial } from '/src/game/peds/realhuman.js';

const CW = 32, CH = 64, ANG = 8, PH = 8, ROWS = 16, W = CW * ANG * PH, H = CH * ROWS;
const BOX_W = 1.0, BOX_H = 2.0;      // metres covered by one cell (feet at the bottom edge)

export async function bake() {
  const R = window.__renderer;
  const idx = await pedIndex();
  // 16 everyday avatars, alternating women / men, a few business suits
  const pool = idx.avatars.filter(a => !a.tags.includes('police') && !a.tags.includes('jogger') && !/medical|construction|delivery/.test(a.id));
  const f = pool.filter(a => a.g === 'f'), m = pool.filter(a => a.g === 'm');
  const pickN = (arr, n) => { const out = [], step = arr.length / n; for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]); return out; };
  const avs = []; const fs = pickN(f, 8), ms = pickN(m, 8);
  for (let i = 0; i < 8; i++) avs.push(fs[i], ms[i]);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-BOX_W / 2, BOX_W / 2, BOX_H, 0, 0.1, 40);
  const mk = (cs) => { const t = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, samples: 0 }); t.texture.colorSpace = cs; return t; };
  const rtA = mk(THREE.SRGBColorSpace), rtN = mk(THREE.NoColorSpace);
  const oldTarget = R.getRenderTarget(), oldAuto = R.autoClear, oc = new THREE.Color(); R.getClearColor(oc); const oa = R.getClearAlpha();
  const oldTM = R.toneMapping, oldShadow = R.shadowMap.autoUpdate;
  R.toneMapping = THREE.NoToneMapping;
  R.autoClear = false;
  for (const rt of [rtA, rtN]) { R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(true, true, true); }
  const meta = { cell: [CW, CH], box: [BOX_W, BOX_H], angles: ANG, phases: PH, rows: ROWS, avatars: [] };
  for (let r = 0; r < ROWS; r++) {
    const info = avs[r];
    const h = new RealHuman({ avatar: info.id, player: true, castShadow: false, height: info.h, seed: 0.37 + r * 0.11 });
    scene.add(h.root);
    for (let i = 0; i < 400 && !h.av; i++) await new Promise(res => setTimeout(res, 50));
    if (!h.av) { console.warn('[crowd bake] no avatar', info.id); continue; }
    const s = { state: 'walk', speed: 1.4 };
    for (let i = 0; i < 90; i++) h.update(1 / 60, s);
    // gait cycles per second at 1.4 m/s (for the runtime phase rate)
    const p0 = h.phase; h.update(0.05, s); let dp = h.phase - p0; if (dp < 0) dp += 1;
    const rate = dp / 0.05;
    const mat = bakeMaterial(h.av); const keep = h.mesh.material; h.mesh.material = mat;
    for (let k = 0; k < PH; k++) {
      h.phase = (k / PH) - 1e-5 + 1; h.phase %= 1;
      h.update(1e-5, s);
      h.root.updateMatrixWorld(true);
      for (let a = 0; a < ANG; a++) {
        const th = a * Math.PI * 2 / ANG;
        cam.position.set(-Math.sin(th) * 10, 0, -Math.cos(th) * 10);
        cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        // cell (column = angle * PH + phase, row r from the top) -> GL viewport (origin bottom-left)
        const x = (a * PH + k) * CW, y = (ROWS - 1 - r) * CH;
        for (const [rt, mode] of [[rtA, 0], [rtN, 1]]) {
          mat.userData.U.uMode.value = mode;
          rt.viewport.set(x, y, CW, CH); rt.scissor.set(x, y, CW, CH); rt.scissorTest = true;
          R.setRenderTarget(rt); R.render(scene, cam);
        }
      }
    }
    h.mesh.material = keep; mat.dispose();
    meta.avatars.push({ id: info.id, g: info.g, rate: +rate.toFixed(4) });
    scene.remove(h.root); h.dispose();
  }
  const read = (rt, dil) => {
    const buf = new Uint8Array(W * H * 4);
    rt.viewport.set(0, 0, W, H); rt.scissorTest = false;
    R.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    // flip to top-down rows
    const img = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) img.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    if (dil) dilate(img, buf);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0);
    return c.toDataURL('image/png');
  };
  const alb = read(rtA, true);
  const nrm = read(rtN, true);
  R.setRenderTarget(oldTarget); R.autoClear = oldAuto; R.setClearColor(oc, oa); R.toneMapping = oldTM; R.shadowMap.autoUpdate = oldShadow;
  rtA.dispose(); rtN.dispose();
  return { alb, nrm, meta };
}

// bleed colours into transparent texels (mips must not pull in black); alpha untouched
function dilate(img) {
  const W4 = W * 4, filled = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) filled[i] = img[i * 4 + 3] > 127 ? 1 : 0;
  for (let it = 0; it < 8; it++) {
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (filled[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx; if (!filled[j]) continue;
        r += img[j * 4]; g += img[j * 4 + 1]; b += img[j * 4 + 2]; n++;
      }
      if (n) add.push(i, r / n, g / n, b / n);
    }
    for (let q = 0; q < add.length; q += 4) { const i = add[q]; img[i * 4] = add[q + 1]; img[i * 4 + 1] = add[q + 2]; img[i * 4 + 2] = add[q + 3]; filled[i] = 1; }
  }
  return W4;
}
