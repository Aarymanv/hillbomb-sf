// Photographic sky: blends two CC0 HDRI captures (Poly Haven "qwantani" time-of-day series) by sun elevation, rotates each
// so its sun sits at the engine's sun azimuth, normalises brightness, and blends in a THIRD capture for cloud cover
// (ambientCG EveningSkyHDRI030B "evening storm", graded by time of day: dramatic at dusk, flat grey at noon, dark with
// sodium city glow at night). The result is rendered to an equirect target that feeds (a) scene.environment via PMREM
// (reflections + ambient) and (b) the water's sky fallback. The visible dome samples the source captures directly
// (see sky.js) with the same parameters, so the sky on screen keeps the full source resolution.
import * as THREE from 'three';
import { PBR } from '../world/assets.js';

const AM = [[-12, 'night'], [-4, 'dusk'], [2, 'sunrise'], [14, 'morning'], [42, 'noon']];
const PM = [[-12, 'night'], [-4, 'dusk'], [2, 'sunset'], [14, 'afternoon'], [42, 'noon']];

// shared GLSL (also used by the sky dome): sample one capture at (azimuth, elevation) with rotation + normalisation
export const HDRI_GLSL = `
vec3 hdriSamp(sampler2D t, float az, float el, float rot, float s, float cap){
  float a = az - rot;
  vec2 uv = vec2(fract(a / 6.28318530718 + 0.5), el / 3.14159265359 + 0.5);
  vec3 c = texture2D(t, uv).rgb * s;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return l > cap ? c * (cap / l) : c;   // tame the captured sun (the engine draws its own)
}
// storm capture graded by time of day: g = (sat, flatten 0..1, brightness, night 0..1)
vec3 stormGrade(vec3 c, vec4 g, float el){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, g.x);
  // flatten toward an even overcast (noon): compress the dynamic range around the mean
  c = mix(c, vec3(pow(max(l, 1e-4), 0.45)) * vec3(0.96, 0.99, 1.04), g.y);
  c *= g.z;
  // night: cold dark clouds lit from below by the city (sodium glow near the horizon)
  vec3 glow = vec3(1.0, 0.52, 0.22) * (0.25 + 0.75 * smoothstep(0.6, 0.0, el)) * (0.25 + l * 0.6);
  c = mix(c, c * vec3(0.55, 0.62, 0.8) + glow * 0.6, g.w);
  return c;
}
`;

export function createHdriSky(renderer) {
  const keys = ['night', 'dusk', 'sunrise', 'sunset', 'morning', 'afternoon', 'noon'];
  const tex = {}, meta = {};
  for (const k of keys) { const t = PBR.hdri(k); if (t) { tex[k] = t; meta[k] = analyse(t); } }
  if (!tex.noon) return null;
  const storm = PBR.hdri('evening_storm_2k') || PBR.hdri('evening_storm_4k');
  const stormHi = PBR.hdri('evening_storm_4k') || storm;
  const stormMeta = storm ? analyse(storm) : null;
  const W = 1024, H = 512;
  const mk = () => { const r = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false }); r.texture.mapping = THREE.EquirectangularReflectionMapping; r.texture.minFilter = r.texture.magFilter = THREE.LinearFilter; return r; };
  const rt = mk();      // visible sky (full colour)
  const rtEnv = mk();   // lighting environment (graded: desaturated + tinted, so shade isn't flooded with sky-blue)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null }, tB: { value: null }, tS: { value: storm }, w: { value: 0 }, rotA: { value: 0 }, rotB: { value: 0 }, rotS: { value: 0 },
      sA: { value: 1 }, sB: { value: 1 }, sS: { value: 1 }, stormW: { value: 0 }, stormG: { value: new THREE.Vector4(1, 0, 1, 0) }, capS: { value: 40 },
      sat: { value: 1 }, tint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tA, tB, tS; uniform float w, rotA, rotB, rotS, sA, sB, sS, stormW, capS, sat; uniform vec4 stormG; uniform vec3 tint; varying vec2 vUv;
      ${HDRI_GLSL}
      void main(){
        float az = (vUv.x - 0.5) * 6.28318530718, el = (vUv.y - 0.5) * 3.14159265359;
        // below the horizon: reflect the sky downward with a soft falloff (puresky captures have no ground)
        float e = el < 0.0 ? -el * 0.35 : el;
        vec3 c = mix(hdriSamp(tA, az, e, rotA, sA, 40.0), hdriSamp(tB, az, e, rotB, sB, 40.0), w);
        if (stormW > 0.001) c = mix(c, stormGrade(hdriSamp(tS, az, e, rotS, sS, capS), stormG, e), stormW);
        if (el < 0.0) c *= mix(1.0, 0.45, smoothstep(0.0, 0.6, -el));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, sat) * tint;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.Camera();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const horizon = new THREE.Color(), _c = new THREE.Color();
  // parameters the visible dome uses to sample the captures directly
  const params = { tA: null, tB: null, tS: stormHi, w: 0, rotA: 0, rotB: 0, rotS: 0, sA: 1, sB: 1, sS: 1, stormW: 0, stormG: mat.uniforms.stormG.value, capS: 40 };

  function pick(sunEl, hours) {
    const T = hours < 12.5 ? AM : PM;
    if (sunEl <= T[0][0]) return [T[0][1], T[0][1], 0];
    for (let i = 0; i < T.length - 1; i++) if (sunEl <= T[i + 1][0]) return [T[i][1], T[i + 1][1], (sunEl - T[i][0]) / (T[i + 1][0] - T[i][0])];
    return [T[T.length - 1][1], T[T.length - 1][1], 0];
  }
  // render the blend; weather = { cloud 0..1, drift (radians of cloud rotation) }; returns { texture, env, horizon, params }
  function update(sunDir, hours, grade = { sat: 0.6, tint: [1, 0.97, 0.92] }, weather = {}) {
    const sunEl = Math.asin(sunDir.y) * 180 / Math.PI;
    const [a, b, w] = pick(sunEl, hours);
    const ka = tex[a] ? a : 'noon', kb = tex[b] ? b : 'noon';
    const sunAz = Math.atan2(sunDir.z, sunDir.x);
    const U = mat.uniforms;
    U.tA.value = tex[ka]; U.tB.value = tex[kb]; U.w.value = w * w * (3 - 2 * w);
    U.rotA.value = sunAz - meta[ka].sunAz; U.rotB.value = sunAz - meta[kb].sunAz;
    U.sA.value = 1 / meta[ka].mean; U.sB.value = 1 / meta[kb].mean;
    // storm / overcast capture: weight by cloud cover, graded by sun elevation
    const cloud = storm ? THREE.MathUtils.clamp(weather.cloud || 0, 0, 1) : 0;
    const sw = THREE.MathUtils.smoothstep(cloud, 0.25, 0.85);
    U.stormW.value = sw;
    if (storm) {
      U.rotS.value = sunAz - stormMeta.sunAz + (weather.drift || 0);
      const day = THREE.MathUtils.smoothstep(sunEl, 6, 30), nightK = THREE.MathUtils.smoothstep(-sunEl, 2, 10);
      // relative brightness vs the clear capture it replaces: dimmer under heavy cloud
      U.sS.value = (1 / stormMeta.mean) * (0.85 - 0.35 * (weather.dark || 0)) * (1 + 0.9 * day);
      U.stormG.value.set(1 - 0.75 * day - 0.35 * nightK, 0.8 * day, 1, nightK);
      U.capS.value = sunEl > 12 ? 3 : 40;
    }
    const prev = renderer.getRenderTarget();
    U.sat.value = 1; U.tint.value.setRGB(1, 1, 1);
    renderer.setRenderTarget(rt); renderer.render(qScene, qCam);
    U.sat.value = grade.sat; U.tint.value.setRGB(grade.tint[0], grade.tint[1], grade.tint[2]);
    renderer.setRenderTarget(rtEnv); renderer.render(qScene, qCam);
    renderer.setRenderTarget(prev);
    const old = envRT;
    envRT = pmrem.fromEquirectangular(rtEnv.texture);
    if (old) old.dispose();
    horizon.copy(meta[ka].horizon).multiplyScalar(1 / meta[ka].mean).lerp(_c.copy(meta[kb].horizon).multiplyScalar(1 / meta[kb].mean), U.w.value);
    if (sw > 0) horizon.lerp(_c.copy(stormMeta.horizon).multiplyScalar(U.sS.value).multiplyScalar(0.8), sw * 0.8);
    Object.assign(params, { tA: U.tA.value, tB: U.tB.value, w: U.w.value, rotA: U.rotA.value, rotB: U.rotB.value, rotS: U.rotS.value, sA: U.sA.value, sB: U.sB.value, sS: U.sS.value, stormW: sw, capS: U.capS.value });
    return { texture: rt.texture, env: envRT.texture, horizon, params };
  }
  return { update, texture: rt.texture, params, hasStorm: !!storm };
}

// mean luminance (sun clamped), sun azimuth, average horizon colour
function analyse(t) {
  const { data, width: w, height: h } = t.image;
  const f = data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (v => v);
  let sum = 0, n = 0, best = -1, bu = 0;
  const hr = new THREE.Color(0, 0, 0); let hn = 0;
  const step = Math.max(4, Math.round(w / 512));
  for (let j = 0; j < h / 2; j += step) for (let i = 0; i < w; i += step) {
    const k = (j * w + i) * 4;
    const r = f(data[k]), g = f(data[k + 1]), b = f(data[k + 2]);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l > best) { best = l; bu = i / w; }
    sum += Math.min(l, 20); n++;
    const el = 0.5 - j / h; // 0 at the horizon row (top half only)
    if (el < 0.08) { hr.r += Math.min(r, 20); hr.g += Math.min(g, 20); hr.b += Math.min(b, 20); hn++; }
  }
  // texture rows: row 0 is the top of the image (flipY at upload), so u maps straight to the equirect azimuth
  return { mean: Math.max(1e-4, sum / n), sunAz: (bu - 0.5) * Math.PI * 2, horizon: hr.multiplyScalar(1 / Math.max(1, hn)) };
}
