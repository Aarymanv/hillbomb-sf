// HILLBOMB weather: clear | fog (Karl the Fog) | overcast | rain | storm, with smooth transitions and a slow random cycle
// in free roam. Drives: sky (storm HDRI blend, see hdrisky.js), sun/shadow strength, fog + the low marine-layer bank,
// wet materials (fog.js HB_WET: darker, glossier, puddles, ripples), water state (wind / chop / rain rings), GPU rain
// streaks around the camera (occluded under bridges/roofs/trees by a top-down depth map), splashes on the surfaces the
// rain actually lands on, lens drops, spray behind fast cars, lightning + thunder.
//
// API (G.weather, also env.weather):
//   set(kind, { transition = 20 })   kind: 'clear' | 'fog' | 'overcast' | 'rain' | 'storm'
//   kind (target), rain 0..1, wetness 0..1 (lags rain), wind 0..1, fogDensity (sea-level fog density), cloud 0..1,
//   gripMul (1 dry .. 0.8 soaked; physics multiplies tyre grip by it), locked / setLocked(bool) (stops the random cycle),
//   auto (random cycle on), flash 0..1 (lightning), KINDS
// Hooks used if present: G.audio.weather({ rain, wind }) every second, G.audio.thunder(distanceMetres) per strike.
import * as THREE from 'three';
import { HB_WET, HB_FOG } from './fog.js';
import { createWetStreaks } from './wetstreaks.js';
import { createLampGlow } from './lampglow.js';
import { inGGPark, inPresidio, inLandsEnd, inTwinPeaks } from '../world/map.js';
import { zoneAtV2 } from '../world/props/v2zones.js';

export const KINDS = {
  //          cloud  rain  wind  fog   bank  haze  storm dark  chop
  clear:    { cloud: 0.0, rain: 0, wind: 0.22, fog: 0.0, bank: 0.0, haze: 0.0, storm: 0, dark: 0.0, chop: 0.0 },
  fog:      { cloud: 0.2, rain: 0, wind: 0.14, fog: 0.0, bank: 1.0, haze: 0.1, storm: 0, dark: 0.05, chop: 0.0 },
  overcast: { cloud: 0.8, rain: 0, wind: 0.2, fog: 0.1, bank: 0.0, haze: 0.25, storm: 0, dark: 0.3, chop: 0.05 },
  rain:     { cloud: 0.95, rain: 0.6, wind: 0.58, fog: 0.22, bank: 0.0, haze: 0.55, storm: 0, dark: 0.5, chop: 0.45 },
  storm:    { cloud: 1.0, rain: 1.0, wind: 0.95, fog: 0.22, bank: 0.0, haze: 0.45, storm: 1, dark: 0.68, chop: 1.0 },
};
const NEXT = { // random cycle (weights)
  clear: { clear: 3, fog: 2, overcast: 2 },
  fog: { clear: 3, fog: 1, overcast: 2 },
  overcast: { clear: 2, rain: 3, fog: 1, overcast: 1 },
  rain: { overcast: 3, rain: 1, storm: 2 },
  storm: { rain: 3, overcast: 1 },
};
const SAVE_KEY = 'hillbomb.weather.v1';
const PARAMS = Object.keys(KINDS.clear);

export function createWeather({ env, scene, renderer, quality = {} }) {
  const tier = quality.weather ?? ({ low: 0, medium: 1, high: 2 }[quality.name] ?? 2);
  const cur = { ...KINDS.clear };           // current (blended) parameters
  let from = { ...cur }, to = KINDS.clear, tT = 1, tDur = 1;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { saved = {}; }
  const W = {
    KINDS, kind: 'clear', locked: !!saved.lock, auto: true,
    rain: 0, wetness: 0, puddles: 0, wind: cur.wind, cloud: 0, fogDensity: 0, flash: 0, gripMul: 1, choppy: 0,
    bank: 0, haze: 0, dark: 0, drift: 0, indoors: false, lensDrops: 0,
    set(kind, { transition = 20 } = {}) {
      if (!KINDS[kind]) { console.warn('[weather] unknown kind', kind); return; }
      from = { ...cur }; to = KINDS[kind]; W.kind = kind; tT = 0; tDur = Math.max(0.001, transition);
      if (transition <= 0) { Object.assign(cur, to); tT = 1; if (!to.rain) { W.wetness = 0; W.puddles = 0; } else { W.wetness = 1; W.puddles = Math.min(1, to.rain + 0.3); } }
      cycleTimer = rand(240, 600);
      if (W.locked) persist();
    },
    setLocked(on) { W.locked = !!on; persist(); },
    get params() { return cur; },
    // settings helper: 'auto' (random cycle) or a kind to lock to; MODES lists the options for a settings row
    MODES: [['auto', 'Dynamic'], ['clear', 'Clear'], ['fog', 'Karl the Fog'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['storm', 'Storm']],
    get mode() { return W.locked ? W.kind : 'auto'; },
    set mode(v) { if (v === 'auto') W.setLocked(false); else if (KINDS[v]) { W.set(v, { transition: 8 }); W.setLocked(true); } },
  };
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ lock: W.locked, kind: W.kind })); } catch { /* storage unavailable */ } }
  let cycleTimer = rand(240, 600);
  const params = new URLSearchParams(location.search);
  const forced = params.get('weather');
  if (forced && KINDS[forced]) { W.set(forced, { transition: 0 }); W.auto = false; }
  else if (W.locked && KINDS[saved.kind]) W.set(saved.kind, { transition: 0 });

  // ---------------------------------------------------------------- rain occlusion: top-down depth around the camera
  const OCC_R = 48, OCC_N = tier >= 1 ? 256 : 128, OCC_TOP = 320, OCC_NEAR = 1, OCC_FAR = 900;
  const occRT = new THREE.WebGLRenderTarget(OCC_N, OCC_N, { depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  occRT.depthTexture = new THREE.DepthTexture(OCC_N, OCC_N, THREE.UnsignedIntType);
  const occCam = new THREE.OrthographicCamera(-OCC_R, OCC_R, OCC_R, -OCC_R, OCC_NEAR, OCC_FAR);
  occCam.up.set(0, 0, -1);
  const occMat = new THREE.MeshDepthMaterial();
  const occXf = new THREE.Vector4(0, 0, 1 / (2 * OCC_R), -1e5);   // cx, cz, 1/(2R), top y
  let occTimer = 0; const occAt = new THREE.Vector3(1e9, 0, 0); let occValid = false;
  function renderOcclusion(camera) {
    const texel = 2 * OCC_R / OCC_N;
    const cx = Math.round(camera.position.x / texel) * texel, cz = Math.round(camera.position.z / texel) * texel;
    const top = Math.max(camera.position.y, 0) + OCC_TOP;
    occCam.position.set(cx, top, cz); occCam.lookAt(cx, top - 1, cz); occCam.updateMatrixWorld();
    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate, prevOverride = scene.overrideMaterial;
    const hidden = [];
    for (const o of [env.sky?.mesh, rain.mesh, splash.mesh, bolt.line, streaks?.mesh, lampGlow?.mesh]) if (o && o.visible) { o.visible = false; hidden.push(o); }
    const prevMW = scene.matrixWorldAutoUpdate; scene.matrixWorldAutoUpdate = false;   // main render refreshes them
    renderer.shadowMap.autoUpdate = false; scene.overrideMaterial = occMat;
    // (9/30) try/finally: one throwing onBeforeRender / shader here used to leave the depth override on the scene for
    // good (the whole city rendered as grey clay, sky + rain hidden)
    try {
      renderer.setRenderTarget(occRT); renderer.clear(true, true, false);
      renderer.render(scene, occCam);
    } finally {
      scene.matrixWorldAutoUpdate = prevMW;
      scene.overrideMaterial = prevOverride; renderer.shadowMap.autoUpdate = prevShadow; renderer.setRenderTarget(prevRT);
      for (const o of hidden) o.visible = true;
    }
    occXf.set(cx, cz, 1 / (2 * OCC_R), top);
    occAt.copy(camera.position); occValid = true;
  }

  // ---------------------------------------------------------------- rain streaks (one draw call)
  const NR = [4000, 9000, 16000][tier];
  const rain = (() => {
    const pos = new Float32Array(NR * 4 * 3), seed = new Float32Array(NR * 4 * 4), corner = new Float32Array(NR * 4 * 2), idx = new Uint32Array(NR * 6);
    for (let i = 0; i < NR; i++) {
      const s = [Math.random(), Math.random(), Math.random(), (i + Math.random()) / NR];
      for (let k = 0; k < 4; k++) { seed.set(s, (i * 4 + k) * 4); corner.set([k & 1 ? 1 : -1, k >> 1], (i * 4 + k) * 2); }
      const b = i * 4; idx.set([b, b + 1, b + 3, b, b + 3, b + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const u = {
      uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(44, 30, 44) }, uVel: { value: new THREE.Vector3(0, -9, 0) },
      uCamVel: { value: new THREE.Vector3() }, uTime: { value: 0 }, uStreak: { value: 1 / 45 }, uWidth: { value: 0.008 }, uPx: { value: 0.001 },
      uCount: { value: 0 }, tOcc: { value: occRT.depthTexture }, uOcc: { value: occXf }, uOccOn: { value: 0 }, uOccNF: { value: new THREE.Vector2(OCC_NEAR, OCC_FAR) },
      uColor: { value: new THREE.Color(0.5, 0.52, 0.55) }, uAlpha: { value: 0.3 },
      uHead: { value: new THREE.Vector3() }, uHeadDir: { value: new THREE.Vector3(0, 0, -1) }, uHeadOn: { value: 0 },
      uLampP: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -1e4, 0, 1)) }, uLampC: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute vec4 aSeed; attribute vec2 aCorner;
        uniform vec3 uCam, uBox, uVel, uCamVel, uHead, uHeadDir; uniform float uTime, uStreak, uWidth, uPx, uCount, uOccOn, uHeadOn;
        uniform sampler2D tOcc; uniform vec4 uOcc; uniform vec2 uOccNF; uniform vec4 uLampP[8]; uniform vec3 uLampC[8];
        varying vec2 vC; varying float vA; varying float vLit; varying vec3 vLamp;
        void main(){
          vC = aCorner; vA = 0.0; vLit = 0.0; vLamp = vec3(0.0);
          if (aSeed.w > uCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec3 vel = uVel * (0.8 + 0.4 * fract(aSeed.w * 97.13));
          vec3 p = aSeed.xyz * uBox + vel * uTime;
          p = uCam + (fract((p - uCam) / uBox + 0.5) - 0.5) * uBox;
          if (uOccOn > 0.5) {
            vec2 ouv = vec2((p.x - uOcc.x) * uOcc.z + 0.5, 0.5 - (p.z - uOcc.y) * uOcc.z);
            if (ouv.x > 0.0 && ouv.y > 0.0 && ouv.x < 1.0 && ouv.y < 1.0) {
              float d = texture(tOcc, ouv).r;
              float topY = uOcc.w - (uOccNF.x + d * (uOccNF.y - uOccNF.x));
              if (p.y < topY - 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
            }
          }
          vec3 rel = vel - uCamVel;
          vec4 va = viewMatrix * vec4(p, 1.0), vb = viewMatrix * vec4(p - rel * uStreak, 1.0);
          vec3 dir = va.xyz - vb.xyz; float len = length(dir); dir = len > 1e-4 ? dir / len : vec3(0.0, 1.0, 0.0);
          vec3 side = normalize(cross(dir, normalize(va.xyz)));
          float dist = length(va.xyz);
          float w = max(uWidth, uPx * dist * 0.9);
          vec3 pos = mix(vb.xyz, va.xyz, aCorner.y) + side * aCorner.x * w;
          gl_Position = projectionMatrix * vec4(pos, 1.0);
          vA = smoothstep(1.5, 6.0, dist) * (1.0 - smoothstep(uBox.x * 0.28, uBox.x * 0.5, dist)) * (uWidth / w);
          // headlight cone (player car at night)
          if (uHeadOn > 0.0) { vec3 hv = p - uHead; float hd = length(hv); vLit = uHeadOn * smoothstep(0.82, 0.95, dot(hv / max(hd, 1e-3), uHeadDir)) * (1.0 - smoothstep(4.0, 34.0, hd)); }
          // street lamps: drops glitter in each lamp's cone of light
          for (int i = 0; i < 8; i++) {
            vec3 lv = p - uLampP[i].xyz; float ld2 = dot(lv, lv), r = uLampP[i].w;
            if (ld2 < r * r && lv.y < 0.5) vLamp += uLampC[i] * (1.0 - sqrt(ld2) / r) * smoothstep(-0.2 * r, 0.3, -lv.y * 0.6 + 0.2);
          }
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec2 vC; varying float vA; varying float vLit; varying vec3 vLamp;
        void main(){
          float across = 1.0 - abs(vC.x); across *= across;
          float along = smoothstep(0.0, 0.3, vC.y) * smoothstep(1.0, 0.85, vC.y);
          float a = across * along * vA * uAlpha * (1.0 + vLit * 1.2);
          if (a < 0.002) discard;
          gl_FragColor = vec4((uColor * (1.0 + vLit * 3.5) + vLamp * 1.1) * a, 1.0);   // was 9 / 1.6: lit drops strobed through bloom
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.name = 'weather:rain'; mesh.visible = false;
    scene.add(mesh);
    return { mesh, u };
  })();

  // ---------------------------------------------------------------- splashes on the surfaces the rain hits
  const SK = [24, 36, 44][tier], CELL = 0.75;
  const splash = (() => {
    const n = SK * SK;
    const pos = new Float32Array(n * 4 * 3), cell = new Float32Array(n * 4 * 2), corner = new Float32Array(n * 4 * 2), idx = new Uint32Array(n * 6);
    for (let j = 0; j < SK; j++) for (let i = 0; i < SK; i++) {
      const q = j * SK + i;
      for (let k = 0; k < 4; k++) { cell.set([i - SK / 2, j - SK / 2], (q * 4 + k) * 2); corner.set([k & 1 ? 1 : -1, k >> 1 ? 1 : -1], (q * 4 + k) * 2); }
      const b = q * 4; idx.set([b, b + 1, b + 3, b, b + 3, b + 2], q * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCell', new THREE.BufferAttribute(cell, 2));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const u = {
      uCam: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uRain: { value: 0 }, uCell: { value: CELL },
      tOcc: { value: occRT.depthTexture }, uOcc: { value: occXf }, uOccNF: { value: new THREE.Vector2(OCC_NEAR, OCC_FAR) },
      uColor: { value: new THREE.Color(0.7, 0.72, 0.75) },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec2 aCell, aCorner;
        uniform vec3 uCam, uRight; uniform float uTime, uRain, uCell; uniform sampler2D tOcc; uniform vec4 uOcc; uniform vec2 uOccNF;
        varying vec2 vC; varying float vPh; varying float vA;
        float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main(){
          vC = aCorner; vA = 0.0; vPh = 0.0;
          vec2 c = floor(uCam.xz / uCell) + aCell;
          float h = hh(c), period = 0.3 + 0.35 * hh(c + 1.7);
          float tt = uTime / period + h * 10.0, cyc = floor(tt); vPh = fract(tt);
          if (hh(c + cyc * 0.1371) > uRain * 0.8) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec2 xz = (c + vec2(hh(c + cyc * 1.31), hh(c - cyc * 0.71))) * uCell;
          vec2 ouv = vec2((xz.x - uOcc.x) * uOcc.z + 0.5, 0.5 - (xz.y - uOcc.y) * uOcc.z);
          if (ouv.x < 0.0 || ouv.y < 0.0 || ouv.x > 1.0 || ouv.y > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float y = uOcc.w - (uOccNF.x + texture(tOcc, ouv).r * (uOccNF.y - uOccNF.x));
          float s = 0.07 + 0.16 * vPh;
          vec3 p = vec3(xz.x, y + 0.01, xz.y) + uRight * aCorner.x * s + vec3(0.0, 1.0, 0.0) * (aCorner.y * 0.5 + 0.5) * s * 1.3;
          float d = length(p - uCam);
          vA = (1.0 - smoothstep(9.0, 16.0, d)) * smoothstep(0.8, 2.0, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vC; varying float vPh; varying float vA;
        void main(){
          vec2 q = vec2(vC.x, vC.y * 0.5 + 0.5);
          // crown: a thin arc rising out of the surface + flying droplets
          float e = length(vec2(q.x, (q.y - 0.02) * 1.6));
          float ring = smoothstep(0.1, 0.0, abs(e - 0.35 - vPh * 0.5)) * smoothstep(0.75, 0.0, q.y);
          float drops = 0.0;
          for (int k = 0; k < 4; k++) {
            float a = (float(k) - 1.5) * 0.55;
            vec2 dp = vec2(sin(a) * (0.25 + vPh * 0.6), 0.1 + vPh * (1.1 - vPh) * 1.6 * cos(a));
            drops += smoothstep(0.09, 0.0, length(q - dp));
          }
          float a = (ring * 0.8 + drops) * (1.0 - vPh) * vA * 0.4;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.name = 'weather:splash'; mesh.visible = false;
    scene.add(mesh);
    return { mesh, u };
  })();

  // ---------------------------------------------------------------- lightning
  const bolt = (() => {
    const MAXP = 400;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(9, 10, 14), transparent: true, opacity: 1, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const line = new THREE.LineSegments(g, m); line.frustumCulled = false; line.visible = false; line.renderOrder = 9; line.name = 'weather:bolt';
    scene.add(line);
    return { line, g, m, MAXP, t: 0, life: 0, dir: new THREE.Vector3(), dist: 0 };
  })();
  W.flashDir = bolt.dir;
  let nextStrike = rand(6, 14);
  const thunderQ = [];
  function strike(camera) {
    const az = Math.random() * Math.PI * 2, dist = rand(900, 4500);
    const gx = camera.position.x + Math.cos(az) * dist, gz = camera.position.z + Math.sin(az) * dist;
    const top = rand(650, 1000);
    const segs = [];
    const branch = (x0, y0, z0, x1, y1, z1, depth, rough) => {
      const pts = [[x0, y0, z0], [x1, y1, z1]];
      for (let it = 0; it < 6; it++) {
        const nx = [];
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          nx.push(a, [(a[0] + b[0]) / 2 + (Math.random() - 0.5) * L * rough, (a[1] + b[1]) / 2 + (Math.random() - 0.5) * L * rough * 0.3, (a[2] + b[2]) / 2 + (Math.random() - 0.5) * L * rough]);
        }
        nx.push(pts[pts.length - 1]); pts.splice(0, pts.length, ...nx);
      }
      for (let k = 0; k < pts.length - 1; k++) segs.push(pts[k], pts[k + 1]);
      if (depth < 2) for (let b = 0; b < 3; b++) {
        const k = 8 + Math.floor(Math.random() * (pts.length - 16)); const p = pts[k];
        const l = rand(80, 260) / (depth + 1);
        branch(p[0], p[1], p[2], p[0] + (Math.random() - 0.5) * l, p[1] - l * rand(0.5, 1), p[2] + (Math.random() - 0.5) * l, depth + 1, 0.55);
      }
    };
    branch(gx + rand(-150, 150), top, gz + rand(-150, 150), gx, 0, gz, 0, 0.42);
    const arr = bolt.g.attributes.position.array; let n = 0;
    for (const p of segs) { if (n >= bolt.MAXP) break; arr[n * 3] = p[0]; arr[n * 3 + 1] = p[1]; arr[n * 3 + 2] = p[2]; n++; }
    bolt.g.setDrawRange(0, n - (n & 1)); bolt.g.attributes.position.needsUpdate = true;
    bolt.t = 0; bolt.life = rand(0.22, 0.4); bolt.line.visible = true; bolt.dist = dist;
    bolt.dir.set(gx - camera.position.x, top * 0.5 - camera.position.y, gz - camera.position.z).normalize();
    thunderQ.push({ at: dist / 343, dist });
  }

  // ---------------------------------------------------------------- per-frame
  let G = null, audioTimer = 0, time = 0, sprayAcc = 0;
  const streaks = tier > 0 ? createWetStreaks(scene) : null;
  const lampGlow = tier > 0 ? createLampGlow(scene) : null;
  const prevCam = new THREE.Vector3(), camVel = new THREE.Vector3(), _v = new THREE.Vector3(), _f = new THREE.Vector3();
  let lastCam = null;
  function update(dt, camera) {
    time += dt;
    if (camera) lastCam = camera;
    // blend toward the target kind
    if (tT < 1) {
      tT = Math.min(1, tT + dt / tDur);
      const e = tT * tT * (3 - 2 * tT);
      for (const k of PARAMS) cur[k] = from[k] + (to[k] - from[k]) * e;
    }
    // random cycle (free roam only)
    if (G && W.auto && !W.locked && G.state === 'play' && !G.events?.active) {
      cycleTimer -= dt;
      if (cycleTimer <= 0) W.set(pickNext(W.kind), { transition: rand(35, 70) });
    }
    // wetness lags the rain; puddles lag the wetness; both dry slowly
    const rainNow = cur.rain;
    if (rainNow > 0.02) { W.wetness = Math.min(1, W.wetness + dt * (0.02 + rainNow * 0.05)); W.puddles = Math.min(1, W.puddles + dt * rainNow * 0.012); }
    else { const dry = 1 + 2 * (1 - cur.cloud); W.wetness = Math.max(0, W.wetness - dt * 0.0035 * dry); W.puddles = Math.max(0, W.puddles - dt * 0.0022 * dry); }
    W.rain = rainNow; W.wind = cur.wind; W.cloud = cur.cloud; W.bank = cur.bank; W.haze = cur.haze; W.dark = cur.dark; W.choppy = cur.chop;
    W.gripMul = +(1 - 0.17 * W.wetness - 0.03 * W.puddles).toFixed(3);
    W.drift += dt * (0.0006 + 0.004 * cur.wind);      // clouds creep across the sky
    HB_FOG.w += dt * (2 + 9 * cur.wind);               // fog bank advection (m)
    // indoors (an interior volume around the camera): no rain, no wet shading
    W.indoors = false;
    if (G?.interiors?.sites && camera) for (const S of G.interiors.sites) if (S.inside?.(camera.position.x, camera.position.y, camera.position.z, 0.3)) { W.indoors = true; break; }
    HB_WET.x = W.indoors ? 0 : W.wetness; HB_WET.y = time; HB_WET.z = W.indoors ? 0 : rainNow; HB_WET.w = W.puddles;
    // lightning
    W.flash = 0;
    if (cur.storm > 0.5 && camera) {
      nextStrike -= dt;
      if (nextStrike <= 0) { strike(camera); nextStrike = rand(5, 16) / cur.storm; }
    }
    if (bolt.line.visible) {
      bolt.t += dt;
      const t = bolt.t / bolt.life;
      const env1 = t < 1 ? Math.max(0, Math.sin(t * Math.PI * 3.2)) * (1 - t) + (t < 0.12 ? 1 : 0) : 0;
      W.flash = env1 * THREE.MathUtils.clamp(2200 / bolt.dist, 0.25, 1);
      bolt.m.opacity = Math.min(1, env1 * 1.5);
      if (t >= 1) bolt.line.visible = false;
    }
    for (let i = thunderQ.length - 1; i >= 0; i--) { thunderQ[i].at -= dt; if (thunderQ[i].at <= 0) { G?.audio?.thunder?.(thunderQ[i].dist); thunderQ.splice(i, 1); } }
    // audio bed
    audioTimer -= dt;
    if (audioTimer <= 0 && G) { audioTimer = 1; G.audio?.weather?.({ rain: W.indoors ? rainNow * 0.3 : rainNow, wind: cur.wind, storm: cur.storm, indoors: W.indoors }); }
    if (!camera) return;
    // camera velocity (for streak direction), robust to teleports
    if (dt > 0) { camVel.copy(camera.position).sub(prevCam).divideScalar(dt); if (camVel.length() > 120) camVel.set(0, 0, 0); }
    prevCam.copy(camera.position);
    // rain particles
    const show = rainNow > 0.01 && !W.indoors;
    rain.mesh.visible = show; splash.mesh.visible = show && tier > 0;
    if (show) {
      occTimer -= dt;
      if (occTimer <= 0 || occAt.distanceToSquared(camera.position) > 36) { renderOcclusion(camera); occTimer = 0.35; }
      const R = rain.u;
      R.uCam.value.copy(camera.position); R.uTime.value = time; R.uCamVel.value.copy(camVel);
      R.uCount.value = Math.min(1, 0.15 + rainNow * 0.85);
      const windV = 2 + 9 * cur.wind;
      R.uVel.value.set(windV * 0.94, -(8.5 + rainNow * 2), windV * 0.34);
      R.uOccOn.value = occValid ? 1 : 0;
      const h = renderer.domElement.height || 720;
      R.uPx.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / h;
      // colour: ambient haze brightness + lightning
      // additive: drops catch the ambient sky/haze light by day and the city's light at night
      const fc = env.fog.color, nt = env.night.value;
      R.uColor.value.setRGB(fc.r * 0.42 + 0.05 * nt + W.flash * 0.2, fc.g * 0.44 + 0.05 * nt + W.flash * 0.22, fc.b * 0.47 + 0.06 * nt + W.flash * 0.26);
      R.uAlpha.value = 0.22 + 0.33 * rainNow;
      // player headlights light the rain at night
      const pv = G?.player?.vehicle;
      if (pv && env.night.value > 0.3 && pv.lights?.head) {
        pv.body.forward(_f); R.uHead.value.copy(pv.root.position).addScaledVector(_f, 1.8); R.uHead.value.y += 0.7; R.uHeadDir.value.copy(_f);
        R.uHeadOn.value = env.night.value;
      } else R.uHeadOn.value = 0;
      lampTimer -= Math.max(dt, 0.004);
      if (lampTimer <= 0) { lampTimer = 0.03; nearestLamps(camera, R.uLampP.value, R.uLampC.value); }
      const S = splash.u;
      S.uCam.value.copy(camera.position); S.uTime.value = time; S.uRain.value = rainNow;
      camera.getWorldDirection(_v); S.uRight.value.set(-_v.z, 0, _v.x).normalize();
      S.uColor.value.copy(R.uColor.value).multiplyScalar(1.4);
    }
    // lens drops (chase / far / hood cameras in the rain)
    const rig = G?.rig?.rig;
    const lensOK = G && G.state === 'play' && G.player?.mode === 'car' && rig && rig.mode !== 'cinematic';
    W.lensDrops += ((lensOK && show ? rainNow : 0) - W.lensDrops) * Math.min(1, dt * 0.6);
    if (G?.state === 'photo') W.lensDrops = 0;          // clean lens for photos
    if (!/[?&]lensdrops/.test(location.search)) W.lensDrops = 0;   // (regression fix 9/30) off by default: the refracted drops read as flat grey discs (?lensdrops = A/B)
    if (G?.post?.setLensDrops) G.post.setLensDrops(W.lensDrops, time);
    if (G?.post) G.post.nightRain = (W.indoors ? 0 : W.wetness) * env.night.value;
    if (G?.post?.atmosParams && camera) atmosUpdate(dt, camera);
    // spray behind fast cars on wet roads
    if (G && W.wetness > 0.25 && G.fx?.spray && dt > 0) sprayFx(dt, camera);
    // lamp + car-light streaks on wet ground (night)
    if (streaks) streaks.update(camera, G?.world, W.indoors ? 0 : W.wetness, Math.max(env.night.value, cur.dark * 0.5));
    // volumetric lamp cones + halos in rain / haze (night)
    if (lampGlow && camera) lampGlow.update(dt, camera, G?.world, W.indoors ? 0 : rainNow, Math.min(1, (cur.haze || 0) * 1.5), env.night.value);
  }
  // ground mist / light shafts (post.js AtmosPass): mist settles in parks and on the hills (mornings and evenings most),
  // a thin layer everywhere, and a wet haze down the street canyons in the rain
  const IS_V2 = typeof location !== 'undefined' && new URLSearchParams(location.search).get('map') !== 'v1';   // v2 = the default map
  const natureAt = (x, z) => {
    if (IS_V2) { const zn = zoneAtV2(x, z); return zn === 'park' || zn === 'hills' ? 1 : 0; }
    return inGGPark(x, z) || inPresidio(x, z) || inLandsEnd(x, z) || inTwinPeaks(x, z) || z < -1700 ? 1 : 0;
  };
  let natS = -1, natT = 0, groundS = null;
  function atmosUpdate(dt, camera) {
    const A = G.post.atmosParams, x = camera.position.x, z = camera.position.z;
    natT -= dt; if (natT <= 0 || natS < 0) { natT = 0.5; const n = natureAt(x, z); natS = natS < 0 ? n : natS + (n - natS) * 0.2; }
    const g = G.world?.groundAt ? G.world.groundAt(x, z, camera.position.y) : null;
    if (Number.isFinite(g)) groundS = groundS === null ? g : groundS + (g - groundS) * Math.min(1, dt * 2);
    const h = env.state?.hours ?? 12, nt = env.night.value;
    const lowSun = Math.exp(-((h - 7.5) ** 2) / 4) + 0.8 * Math.exp(-((h - 18.8) ** 2) / 3);   // dawn / dusk mist
    const rain = W.indoors ? 0 : W.rain;
    // seen from high up (drone, hilltops) the layer is a veil over everything: thin it out
    const alt = Number.isFinite(groundS) ? camera.position.y - groundS : 0;
    A.mist = Math.min(1.2, natS * (0.2 + 0.3 * lowSun) + (1 - natS) * 0.08 + cur.haze * 0.4 + rain * 0.45 + nt * 0.1) * (0.35 + 0.65 * (1 - Math.min(1, Math.max(0, (alt - 12) / 40))));
    A.mistH = 5 + 9 * natS * (1 - rain) + 4 * cur.haze;
    A.mistBase = (groundS ?? 0) - 0.5;
    A.rays = 0.75 + 0.6 * Math.min(1, cur.haze + natS * 0.5);
    A.glare = 0.8 * (1 - 0.8 * cur.cloud);
    // daylight: only the sun, glints and sky blow out into bloom (white facades in full sun stay clean); night keeps 0.9
    if (G.post.bloom) G.post.bloom.threshold = 0.9 + 1.1 * (1 - nt);
  }
  let lampTimer = 0; const lampTmp = [];
  function nearestLamps(camera, P, C) {
    const lamps = G?.world?.props?.lamps, nt = env.night.value;
    lampTmp.length = 0;
    if (lamps && nt > 0.15) for (const L of lamps) {
      if (L.broken) continue;
      const dx = L.x - camera.position.x, dz = L.z - camera.position.z, d2 = dx * dx + dz * dz;
      if (d2 < 45 * 45) lampTmp.push([d2, L]);
    }
    lampTmp.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < 8; i++) {
      const L = lampTmp[i]?.[1];
      if (L) { const k = nt * (1 - THREE.MathUtils.smoothstep(Math.sqrt(lampTmp[i][0]), 28, 45)); P[i].set(L.x, L.y, L.z, Math.min(14, (L.r || 8) * 1.2)); C[i].set(L.col[0] * k, L.col[1] * k, L.col[2] * k); }   // distance fade: lamps entering / leaving the 8-set (4 Hz refresh) no longer pop
      else { P[i].set(0, -1e4, 0, 1); C[i].set(0, 0, 0); }
    }
  }
  function sprayFx(dt, camera) {
    const list = G.vehicles?.() || [];
    let n = 0;
    for (const v of list) {
      const b = v.body; if (!b || b.speed < 7) continue;
      const dx = v.pos.x - camera.position.x, dz = v.pos.z - camera.position.z;
      if (dx * dx + dz * dz > 110 * 110) continue;
      if (++n > 8) break;
      const rate = (b.speed - 6) * 0.9 * W.wetness * (0.6 + W.puddles * 0.8);
      sprayAcc = (v._sprayAcc || 0) + rate * dt;
      for (let i = 2; i < 4; i++) {
        const w = b.wheels?.[i]; if (!w?.contact || w.surface === 3 || w.surface === 7) continue;
        let k = sprayAcc; while (k >= 1) { k -= 1; G.fx.spray(w.cp.x, w.cp.y, w.cp.z, b.vel.x, b.vel.z, Math.min(1, b.speed / 35), 1 - env.night.value * 0.7); }
      }
      v._sprayAcc = sprayAcc % 1;
    }
  }
  function pickNext(k) {
    const opts = NEXT[k] || NEXT.clear; let tot = 0;
    for (const w of Object.values(opts)) tot += w;
    let r = Math.random() * tot;
    for (const [kk, w] of Object.entries(opts)) { r -= w; if (r <= 0) return kk; }
    return 'clear';
  }
  W.update = update;
  W.attach = (game) => { G = game; };
  // force a lightning strike now (storm or not), e.g. for events / cutscenes
  W.strike = () => { if (lastCam) strike(lastCam); };
  W.debug = () => ({ kind: W.kind, t: +tT.toFixed(2), cur: { ...cur }, wet: +W.wetness.toFixed(3), puddles: +W.puddles.toFixed(3), occ: occValid, grip: W.gripMul, indoors: W.indoors });
  return W;
}
function rand(a, b) { return a + Math.random() * (b - a); }
