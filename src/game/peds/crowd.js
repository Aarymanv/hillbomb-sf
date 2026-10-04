// HILLBOMB: far crowds. Beyond the real (skinned) pedestrians (~150 m) busy sidewalks keep people out to ~420 m as
// multi-angle impostors: 16 Rocketbox avatars walking, baked from 8 directions x 8 gait phases (dev/crowd_bake.js ->
// peds/crowd_{alb,nrm}.png|dds, 32x64 px cells). One instanced draw: a camera-facing upright quad per person; the
// vertex shader picks the view sector (person yaw vs. camera) and the gait phase (time x the avatar's cycle rate); the
// fragment shader lights the baked view-space normals with the regular PBR path (sun, sky, lamp light at night, fog).
// Agents walk the sidewalk rings of the blocks around the camera (peds/nav.js), as many as the district's density says.
import * as THREE from 'three';
import { packedUrl, loadPacked } from '../../world/texpack.js';
import { LIFT_WALK, OFF_MIN, OFF_MAX } from './nav.js';

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/peds/';
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const NEAR0 = 132, NEAR1 = 158, FAR0 = 360, FAR1 = 420, R_IN = 118, R_OUT = 430;
const SPACING = 3.5;      // metres of sidewalk per person at density 1 (both directions)

function tex(url, srgb) {
  if (packedUrl(url)) { const t = loadPacked(url, { srgb, anisotropy: 2 }); return t; }
  const t = new THREE.TextureLoader().load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}

export function createFarCrowd(G, nav, parent, { max = 1000 } = {}) {
  const world = G.world;
  const U = { uTime: { value: 0 }, tN: { value: null }, uBand: { value: new THREE.Vector4(NEAR0, NEAR1, FAR0, FAR1) } };
  let meta = null, mesh = null;
  const cap = max;
  // agents (structure of arrays)
  const A = { R: new Array(cap), k: new Int32Array(cap), t: new Float32Array(cap), off: new Float32Array(cap), dir: new Int8Array(cap),
    sp: new Float32Array(cap), len: new Float32Array(cap), y: new Float32Array(cap), yaw: new Float32Array(cap), blk: new Array(cap), yT: new Uint8Array(cap) };
  let n = 0;
  const aP = new Float32Array(cap * 4), aA = new Float32Array(cap * 4);
  const _p = { x: 0, z: 0 };
  const blocks = new Map();       // block -> count of agents
  let lastX = 1e9, lastZ = 1e9, refreshT = 0, time = 0, frame = 0;

  // (retried: boot streams hundreds of requests and Chrome may drop one)
  const load = (k) => fetch(BASE + 'crowd.json').then(r => r.json()).then(m => { meta = m; build(); })
    .catch(e => { if (k < 4) setTimeout(() => load(k + 1), 1500 * (k + 1)); else console.warn('[peds] far crowd off', e); });
  load(0);

  function build() {
    const alb = tex(BASE + 'crowd_alb.png', true); U.tN.value = tex(BASE + 'crowd_nrm.png', false);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const M = meta, cols = M.angles * M.phases, rows = M.rows;
    const mat = new THREE.MeshStandardMaterial({ map: alb, alphaTest: 0.5, roughness: 0.85, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 aP; attribute vec4 aA; uniform float uTime; uniform vec4 uBand;
        varying vec3 vBR; varying vec3 vBU; varying vec3 vBF; varying float vFade; varying float vShade;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 0.0, 1.0);')
        .replace('#include <begin_vertex>', `
          vec3 P = aP.xyz; vec2 toC = cameraPosition.xz - P.xz; float dC = length(toC);
          vec2 tc = toC / max(dC, 1e-3);
          vec3 F = vec3(tc.x, 0.0, tc.y), Rt = vec3(F.z, 0.0, -F.x);
          vec3 transformed = P + Rt * (position.x * ${M.box[0].toFixed(3)}) + vec3(0.0, position.y * ${M.box[1].toFixed(3)}, 0.0);
          float cy = cos(aP.w), sy = sin(aP.w);
          vec2 dl = vec2(tc.x * cy - tc.y * sy, tc.x * sy + tc.y * cy);
          float th = atan(-dl.x, -dl.y);
          float ks = mod(floor(th / (6.2831853 / ${M.angles.toFixed(1)}) + 0.5) + ${M.angles.toFixed(1)}, ${M.angles.toFixed(1)});
          float ph = floor(fract(uTime * aA.z + aA.y) * ${M.phases.toFixed(1)});
          vec2 cell = vec2(ks * ${M.phases.toFixed(1)} + ph, ${(rows - 1).toFixed(1)} - aA.x);
          vFade = smoothstep(uBand.x, uBand.y, dC) * (1.0 - smoothstep(uBand.z, uBand.w, dC));
          if (vFade <= 0.0) transformed = P;
          vShade = aA.w;
          vBR = (viewMatrix * vec4(Rt, 0.0)).xyz; vBU = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz; vBF = (viewMatrix * vec4(F, 0.0)).xyz;
          vec2 cuv = (cell + vec2(uv.x, uv.y)) / vec2(${cols.toFixed(1)}, ${rows.toFixed(1)});`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>')
        .replace('#include <project_vertex>', `#include <project_vertex>
          #ifdef USE_MAP
          vMapUv = cuv;
          #endif`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D tN; varying vec3 vBR; varying vec3 vBU; varying vec3 vBF; varying float vFade; varying float vShade;
        float hbCrowdDither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb *= vShade;
          { // keep the coverage through the mips (alpha-tested thin figures would vanish with distance)
            vec2 dx = dFdx(vMapUv * vec2(${(cols * M.cell[0]).toFixed(1)}, ${(rows * M.cell[1]).toFixed(1)})), dy = dFdy(vMapUv * vec2(${(cols * M.cell[0]).toFixed(1)}, ${(rows * M.cell[1]).toFixed(1)}));
            diffuseColor.a *= 1.0 + 0.45 * max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy)))); }`)
        .replace('#include <alphatest_fragment>', `if (diffuseColor.a < 0.5 || hbCrowdDither(gl_FragCoord.xy) > vFade) discard;`)
        .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0;
          vec3 nb = texture2D(tN, vMapUv).xyz * 2.0 - 1.0;
          vec3 normal = normalize(vBR * nb.x + vBU * nb.y + vBF * nb.z);
          vec3 nonPerturbedNormal = normal;`);
    };
    mat.customProgramCacheKey = () => 'hb-crowd-v1';
    mesh = new THREE.Mesh(g, mat);
    mesh.name = 'farCrowd'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    parent.add(mesh);
  }

  function edgeSet(i) {
    const R = A.R[i], k = A.k[i];
    A.len[i] = nav.ringLen(R, k, A.off[i]);
    const k1 = k + 1 === R.n ? 0 : k + 1;
    let dx = R.vx[k1] - R.vx[k], dz = R.vz[k1] - R.vz[k];
    if (A.dir[i] < 0) { dx = -dx; dz = -dz; }
    A.yaw[i] = Math.atan2(-dx, -dz);
  }
  function spawn(b, R) {
    if (n >= cap) return false;
    const i = n++;
    A.R[i] = R; A.blk[i] = b;
    // a random point on the ring (edges weighted by length)
    let u = Math.random() * R.per, k = 0; while (k < R.n - 1 && u > R.len[k]) { u -= R.len[k]; k++; }
    A.k[i] = k; A.t[i] = clamp(u / R.len[k], 0, 1); A.off[i] = OFF_MIN + Math.random() * (OFF_MAX - OFF_MIN);
    A.dir[i] = Math.random() < 0.5 ? 1 : -1; A.sp[i] = 1.05 + Math.random() * 0.55;
    edgeSet(i);
    nav.ringPos(R, k, A.t[i], A.off[i], _p);
    A.y[i] = world.heightAt(_p.x, _p.z) + LIFT_WALK; A.yT[i] = (Math.random() * 8) | 0;
    const row = (Math.random() * meta.rows) | 0, rate = meta.avatars[row]?.rate || 0.9;
    aA[i * 4] = row; aA[i * 4 + 1] = Math.random(); aA[i * 4 + 2] = rate * A.sp[i] / 1.4; aA[i * 4 + 3] = 0.82 + Math.random() * 0.3;
    return true;
  }
  function kill(i) {
    const j = --n;
    if (i !== j) {
      for (const key of ['R', 'blk']) A[key][i] = A[key][j];
      for (const key of ['k', 't', 'off', 'dir', 'sp', 'len', 'y', 'yaw', 'yT']) A[key][i] = A[key][j];
      for (let c = 0; c < 4; c++) { aA[i * 4 + c] = aA[j * 4 + c]; aP[i * 4 + c] = aP[j * 4 + c]; }
    }
    A.R[j] = null; A.blk[j] = null;
  }

  const _near = [];
  function refresh(fx, fz) {
    const night = G.env?.night?.value ?? 0;
    const rain = (G.weather || G.env?.weather)?.rain || 0;
    const zone = nav.zoneAt(fx, fz);
    const k = (1 - night * (zone && ['downtown', 'castro', 'mission', 'northbeach', 'tenderloin', 'chinatown'].includes(zone) ? 0.35 : 0.65)) * (1 - 0.45 * rain) * (G.peds?.density ?? 1);
    const want = new Map();
    for (const b of nav.blocksNear(fx, fz, R_OUT, _near)) {
      const q = b._pbox, cx = (q[0] + q[2]) / 2, cz = (q[1] + q[3]) / 2, rad = Math.hypot(q[2] - q[0], q[3] - q[1]) / 2;
      const d = Math.hypot(cx - fx, cz - fz);
      if (d + rad < R_IN || d - rad > R_OUT) continue;
      const dens = nav.densityAt(cx, cz);
      if (dens < 0.08) continue;
      const R = nav.ring(b); if (!R) continue;
      // nearer blocks get more of the budget (a person 400 m out is 3 px; one at 160 m is three times taller)
      const near = clamp(Math.pow(160 / Math.max(160, d), 1.1), 0.3, 1);
      const c = R.per / SPACING * Math.pow(dens, 1.5) * k * near * (0.75 + 0.5 * hash(b));
      if (c > 0.5) want.set(b, [R, c]);
    }
    // over the cap: thin every block evenly (never fill the first blocks found and starve the rest)
    let sum = 0; for (const w of want.values()) sum += w[1];
    const f = sum > cap * 0.97 ? cap * 0.97 / sum : 1;
    for (const w of want.values()) w[1] = Math.round(w[1] * f);
    // drop agents of blocks that left the band (or now want fewer)
    const have = new Map();
    for (let i = n - 1; i >= 0; i--) {
      const b = A.blk[i], w = want.get(b), h = have.get(b) || 0;
      if (!w || h >= w[1]) { kill(i); continue; }
      have.set(b, h + 1);
    }
    for (const [b, [R, c]] of want) {
      for (let h = have.get(b) || 0; h < c; h++) if (!spawn(b, R)) break;
      if (n >= cap) break;
    }
  }
  const hash = (b) => { const q = b._pbox; const s = Math.sin(q[0] * 12.9898 + q[1] * 78.233) * 43758.5453; return s - Math.floor(s); };

  function update(dt, cam, fx, fz) {
    if (!mesh) return;
    time += dt; frame++; U.uTime.value = time;
    refreshT -= dt;
    if (Math.hypot(fx - lastX, fz - lastZ) > 35 || refreshT <= 0) { refresh(fx, fz); lastX = fx; lastZ = fz; refreshT = 4; }
    const yk = frame & 7;
    for (let i = 0; i < n; i++) {
      let t = A.t[i] + A.dir[i] * dt * A.sp[i] / A.len[i];
      if (t > 1 || t < 0) {
        const R = A.R[i];
        if (t > 1) { A.k[i] = A.k[i] + 1 === R.n ? 0 : A.k[i] + 1; t -= 1; } else { A.k[i] = A.k[i] === 0 ? R.n - 1 : A.k[i] - 1; t += 1; }
        t = clamp(t, 0, 1); edgeSet(i);
      }
      A.t[i] = t;
      nav.ringPos(A.R[i], A.k[i], t, A.off[i], _p);
      if (A.yT[i] === yk) A.y[i] = world.heightAt(_p.x, _p.z) + LIFT_WALK;
      aP[i * 4] = _p.x; aP[i * 4 + 1] = A.y[i]; aP[i * 4 + 2] = _p.z; aP[i * 4 + 3] = A.yaw[i];
    }
    const g = mesh.geometry;
    g.instanceCount = n;
    const pa = g.attributes.aP, aa = g.attributes.aA;
    pa.clearUpdateRanges(); pa.addUpdateRange(0, n * 4); pa.needsUpdate = true;
    aa.clearUpdateRanges(); aa.addUpdateRange(0, n * 4); aa.needsUpdate = true;
  }

  return {
    update,
    get count() { return n; },
    get mesh() { return mesh; },
    U,
    set visible(v) { if (mesh) mesh.visible = v; },
  };
}
