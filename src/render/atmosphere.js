// Physically based sky (Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique"):
// Rayleigh + Mie + ozone, precomputed transmittance and multiple-scattering LUTs (once at boot), and sky-view LUTs
// (latitude/longitude around the light, sqrt-compressed toward the horizon) re-rendered when the sun / moon move.
// Radiance is per unit light illuminance (sun = 1). The sky dome (sky.js) samples the sky-view LUTs; the CPU gets the
// sun colour from an exact numeric transmittance and the horizon / zenith colours from an async readback of the LUT
// (fog colour, cloud ambient, env ground) so the lighting matches the sky on screen.
import * as THREE from 'three';

export const ATMOS_GLSL = /* glsl */`
const float A_RG = 6360.0, A_RT = 6460.0;
const vec3 A_RAY = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float A_MIE_S = 3.996e-3, A_MIE_A = 4.40e-3;
const vec3 A_OZ = vec3(0.650e-3, 1.881e-3, 0.085e-3);
const float A_PI = 3.14159265359;
uniform float uMieK;     // aerosol multiplier (coastal haze / weather)
void aMedium(float h, out vec3 scatR, out float scatM, out vec3 ext) {
  h = max(h, 0.0);
  float dR = exp(-h / 8.0), dM = exp(-h / 1.2), dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  scatR = A_RAY * dR; scatM = A_MIE_S * uMieK * dM;
  ext = scatR + vec3((A_MIE_S + A_MIE_A) * uMieK * dM) + A_OZ * dO;
}
// distance to sphere R along rd from ro (inside or outside); -1 if missed / behind
float aSphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd), c = dot(ro, ro) - R * R, d = b * b - c;
  if (d < 0.0) return -1.0;
  d = sqrt(d);
  float t0 = -b - d, t1 = -b + d;
  return t0 > 0.0 ? t0 : (t1 > 0.0 ? t1 : -1.0);
}
vec2 aTransUv(float r, float mu) {
  float H = sqrt(A_RT * A_RT - A_RG * A_RG), rho = sqrt(max(0.0, r * r - A_RG * A_RG));
  float disc = r * r * (mu * mu - 1.0) + A_RT * A_RT;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dmin = A_RT - r, dmax = rho + H;
  vec2 x = vec2((d - dmin) / max(dmax - dmin, 1e-4), rho / H);
  return vec2(0.5 / 256.0, 0.5 / 64.0) + x * vec2(1.0 - 1.0 / 256.0, 1.0 - 1.0 / 64.0);
}
float aPhaseR(float mu) { return 3.0 / (16.0 * A_PI) * (1.0 + mu * mu); }
float aPhaseM(float g, float mu) { float g2 = g * g; return 3.0 / (8.0 * A_PI) * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
`;

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const TRANS_FS = `${ATMOS_GLSL}
varying vec2 vUv;
void main() {
  vec2 x = (vUv - vec2(0.5 / 256.0, 0.5 / 64.0)) / vec2(1.0 - 1.0 / 256.0, 1.0 - 1.0 / 64.0);
  float H = sqrt(A_RT * A_RT - A_RG * A_RG), rho = H * clamp(x.y, 0.0, 1.0);
  float r = sqrt(rho * rho + A_RG * A_RG);
  float dmin = A_RT - r, dmax = rho + H, d = dmin + clamp(x.x, 0.0, 1.0) * (dmax - dmin);
  float mu = d <= 0.0 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0), rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float tMax = max(aSphere(ro, rd, A_RT), 0.0);
  vec3 od = vec3(0.0); float dt = tMax / 40.0;
  for (int i = 0; i < 40; i++) { vec3 p = ro + rd * (float(i) + 0.5) * dt; vec3 sR; float sM; vec3 e; aMedium(length(p) - A_RG, sR, sM, e); od += e * dt; }
  gl_FragColor = vec4(exp(-od), 1.0);
}`;

const MS_FS = `${ATMOS_GLSL}
uniform sampler2D tTrans;
varying vec2 vUv;
void main() {
  vec2 x = clamp((vUv - 0.5 / 32.0) / (1.0 - 1.0 / 32.0), 0.0, 1.0);
  float cs = x.x * 2.0 - 1.0, r = A_RG + 0.01 + x.y * (A_RT - A_RG - 0.02);
  vec3 ro = vec3(0.0, r, 0.0), sun = vec3(0.0, cs, -sqrt(max(0.0, 1.0 - cs * cs)));
  vec3 L2 = vec3(0.0), fms = vec3(0.0);
  for (int i = 0; i < 8; i++) for (int j = 0; j < 8; j++) {
    float th = 6.28318530718 * (float(i) + 0.5) / 8.0, ph = acos(1.0 - 2.0 * (float(j) + 0.5) / 8.0);
    vec3 rd = vec3(cos(th) * sin(ph), cos(ph), sin(th) * sin(ph));
    float tG = aSphere(ro, rd, A_RG), tT = aSphere(ro, rd, A_RT), tMax = tG > 0.0 ? tG : tT;
    float dt = max(tMax, 0.0) / 20.0;
    vec3 thr = vec3(1.0), Lp = vec3(0.0), fp = vec3(0.0);
    for (int k = 0; k < 20; k++) {
      vec3 p = ro + rd * (float(k) + 0.5) * dt; float pr = length(p);
      vec3 sR; float sM; vec3 e; aMedium(pr - A_RG, sR, sM, e);
      vec3 sT = exp(-e * dt);
      float mu = dot(p / pr, sun);
      vec3 Ts = texture2D(tTrans, aTransUv(pr, mu)).rgb * (aSphere(p, sun, A_RG) > 0.0 ? 0.0 : 1.0);
      vec3 sc = sR + vec3(sM);
      vec3 S = Ts * sc / (4.0 * A_PI);
      vec3 ie = 1.0 / max(e, vec3(1e-7));
      Lp += thr * (S - S * sT) * ie;
      fp += thr * (sc - sc * sT) * ie;
      thr *= sT;
    }
    if (tG > 0.0) { vec3 p = ro + rd * tG; float mu = dot(normalize(p), sun); Lp += thr * texture2D(tTrans, aTransUv(A_RG, mu)).rgb * max(mu, 0.0) * 0.3 / A_PI; }
    L2 += Lp; fms += fp;
  }
  L2 /= 64.0; fms /= 64.0;
  gl_FragColor = vec4(L2 / max(1.0 - fms, vec3(1e-3)), 1.0);
}`;

// sky-view LUT: u = azimuth from the light (0..pi, symmetric), v = sqrt-compressed elevation (horizon at 0.5)
const VIEW_FS = `${ATMOS_GLSL}
uniform sampler2D tTrans, tMS; uniform vec3 uLight; uniform float uCamR, uMieG;
varying vec2 vUv;
void main() {
  float v = vUv.y * 2.0 - 1.0;
  float el = sign(v) * v * v * 1.5707963;
  float az = vUv.x * A_PI;
  vec3 rd = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  float lEl = asin(clamp(uLight.y, -1.0, 1.0));
  vec3 L = vec3(cos(lEl), sin(lEl), 0.0);
  vec3 ro = vec3(0.0, uCamR, 0.0);
  float tG = aSphere(ro, rd, A_RG), tT = aSphere(ro, rd, A_RT), tMax = tG > 0.0 ? tG : tT;
  tMax = min(max(tMax, 0.0), 400.0);
  float mu = dot(rd, L), pR = aPhaseR(mu), pM = aPhaseM(uMieG, mu);
  vec3 thr = vec3(1.0), acc = vec3(0.0);
  float tPrev = 0.0;
  for (int i = 0; i < 32; i++) {
    float f = (float(i) + 0.3) / 32.0, t = tMax * f * f, dt = t - tPrev; tPrev = t;
    vec3 p = ro + rd * t; float pr = length(p);
    vec3 sR; float sM; vec3 e; aMedium(pr - A_RG, sR, sM, e);
    vec3 sT = exp(-e * dt);
    vec3 up = p / pr; float smu = dot(up, L);
    vec3 Ts = texture2D(tTrans, aTransUv(pr, smu)).rgb * (aSphere(p, L, A_RG) > 0.0 ? 0.0 : 1.0);
    vec2 msUv = vec2(0.5 / 32.0) + clamp(vec2(smu * 0.5 + 0.5, (pr - A_RG) / (A_RT - A_RG)), 0.0, 1.0) * (1.0 - 1.0 / 32.0);
    vec3 ms = texture2D(tMS, msUv).rgb;
    vec3 S = Ts * (sR * pR + sM * pM) + ms * (sR + vec3(sM));
    acc += thr * (S - S * sT) / max(e, vec3(1e-7));
    thr *= sT;
  }
  gl_FragColor = vec4(acc, 1.0);
}`;

// sky-view LUT lookup (shared with sky.js): d = world view dir, L = light dir
export const SKYVIEW_GLSL = /* glsl */`
vec2 aViewUv(vec3 d, vec3 L) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963);
  vec2 a = d.xz, b = L.xz; float la = length(a), lb = length(b);
  float c = la > 1e-5 && lb > 1e-5 ? dot(a, b) / (la * lb) : 1.0;
  float u = acos(clamp(c, -1.0, 1.0)) / 3.14159265;
  return vec2(0.5 / 192.0 + u * (1.0 - 1.0 / 192.0), 0.5 / 108.0 + v * (1.0 - 1.0 / 108.0));
}`;

const RG = 6360, RT = 6460, RAY = [5.802e-3, 13.558e-3, 33.1e-3], MIE_S = 3.996e-3, MIE_A = 4.4e-3, OZ = [0.65e-3, 1.881e-3, 0.085e-3];

export function createAtmosphere(renderer) {
  const mkRT = (w, h) => {
    const r = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    r.texture.minFilter = r.texture.magFilter = THREE.LinearFilter; r.texture.wrapS = r.texture.wrapT = THREE.ClampToEdgeWrapping;
    return r;
  };
  const trans = mkRT(256, 64), ms = mkRT(32, 32), sunView = mkRT(192, 108), moonView = mkRT(192, 108);
  const common = { uMieK: { value: 1.6 } };
  const mat = (fs, u = {}) => new THREE.ShaderMaterial({ uniforms: { ...u, uMieK: common.uMieK }, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  const transMat = mat(TRANS_FS);
  const msMat = mat(MS_FS, { tTrans: { value: trans.texture } });
  const viewMat = mat(VIEW_FS, { tTrans: { value: trans.texture }, tMS: { value: ms.texture }, uLight: { value: new THREE.Vector3(0, 1, 0) }, uCamR: { value: RG + 0.05 }, uMieG: { value: 0.8 } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), transMat); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.Camera();
  const draw = (m, rt) => { const prev = renderer.getRenderTarget(); quad.material = m; renderer.setRenderTarget(rt); renderer.render(qs, qc); renderer.setRenderTarget(prev); };
  let mieK = -1;
  function bakeStatic() { draw(transMat, trans); draw(msMat, ms); mieK = common.uMieK.value; }
  bakeStatic();

  // ---- CPU mirror (exact numeric integration of the same medium) for the sun / moon colour
  function extAt(h, out) {
    h = Math.max(h, 0);
    const dR = Math.exp(-h / 8), dM = Math.exp(-h / 1.2) * common.uMieK.value, dO = Math.max(0, 1 - Math.abs(h - 25) / 15);
    for (let c = 0; c < 3; c++) out[c] = RAY[c] * dR + (MIE_S + MIE_A) * dM + OZ[c] * dO;
    return out;
  }
  const _e = [0, 0, 0];
  function transmittance(dirY, altKm = 0.05, out = new THREE.Color()) {
    const r = RG + altKm, mu = THREE.MathUtils.clamp(dirY, -1, 1);
    // planet in the way (below the geometric horizon of the observer): smooth over the sun's disc (~0.27 deg)
    const muH = -Math.sqrt(Math.max(0, 1 - (RG / r) ** 2));
    const vis = THREE.MathUtils.smoothstep(mu, muH - 0.006, muH + 0.006);
    const b = r * mu, disc = b * b - (r * r - RT * RT), tMax = -b + Math.sqrt(Math.max(disc, 0));
    const N = 48; let od0 = 0, od1 = 0, od2 = 0;
    for (let i = 0; i < N; i++) {
      const f = (i + 0.5) / N, t = tMax * f * f, dt = tMax * (2 * f) / N;
      const px = Math.sqrt(Math.max(0, 1 - mu * mu)) * t, py = r + mu * t;
      extAt(Math.hypot(px, py) - RG, _e); od0 += _e[0] * dt; od1 += _e[1] * dt; od2 += _e[2] * dt;
    }
    return out.setRGB(Math.exp(-od0) * vis, Math.exp(-od1) * vis, Math.exp(-od2) * vis);
  }

  // ---- async readback of the sun sky-view LUT (horizon / zenith colours for fog, clouds, env ground)
  const W = 192, H = 108, buf = new Uint16Array(W * H * 4);
  const cpu = { ready: false, data: new Float32Array(W * H * 3) };
  let reading = false;
  const f16 = THREE.DataUtils.fromHalfFloat;
  function unpack() { const d = cpu.data; for (let i = 0, j = 0; i < W * H * 4; i += 4, j += 3) { d[j] = f16(buf[i]); d[j + 1] = f16(buf[i + 1]); d[j + 2] = f16(buf[i + 2]); } cpu.ready = true; }
  function readBack(sync) {
    if (sync) { try { renderer.readRenderTargetPixels(sunView, 0, 0, W, H, buf); unpack(); } catch (e) { /* unsupported readback */ } return; }
    if (reading || !renderer.readRenderTargetPixelsAsync) return;
    reading = true;
    renderer.readRenderTargetPixelsAsync(sunView, 0, 0, W, H, buf).then(unpack, () => {}).finally(() => { reading = false; });
  }
  // sample the CPU copy: world dir d, light dir L (same mapping as SKYVIEW_GLSL)
  function sample(d, L, out = new THREE.Color()) {
    if (!cpu.ready) return out.setRGB(0, 0, 0);
    const el = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    const v = 0.5 + 0.5 * Math.sign(el) * Math.sqrt(Math.abs(el) / 1.5707963);
    const la = Math.hypot(d.x, d.z), lb = Math.hypot(L.x, L.z);
    const c = la > 1e-5 && lb > 1e-5 ? (d.x * L.x + d.z * L.z) / (la * lb) : 1;
    const u = Math.acos(THREE.MathUtils.clamp(c, -1, 1)) / Math.PI;
    const x = THREE.MathUtils.clamp(u * (W - 1), 0, W - 1), y = THREE.MathUtils.clamp(v * (H - 1), 0, H - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const D = cpu.data, g = (xx, yy, k) => D[(yy * W + xx) * 3 + k];
    const r = [0, 1, 2].map(k => (g(x0, y0, k) * (1 - fx) + g(x1, y0, k) * fx) * (1 - fy) + (g(x0, y1, k) * (1 - fx) + g(x1, y1, k) * fx) * fy);
    return out.setRGB(r[0], r[1], r[2]);
  }
  const _d = new THREE.Vector3(), _s = new THREE.Color();
  // average sky radiance over a ring at elevation elDeg (n azimuths)
  function ring(elDeg, L, out = new THREE.Color(), n = 16) {
    out.setRGB(0, 0, 0); const el = elDeg * Math.PI / 180, ce = Math.cos(el), se = Math.sin(el);
    for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; _d.set(ce * Math.cos(a), se, ce * Math.sin(a)); out.add(sample(_d, L, _s)); }
    return out.multiplyScalar(1 / n);
  }

  const lastSun = new THREE.Vector3(9, 9, 9), lastMoon = new THREE.Vector3(9, 9, 9);
  // re-render the sky-view LUTs when the lights moved (sub-texel changes are skipped)
  function update(sunDir, moonDir, { camY = 50, mieK = 1.6, force = false, sync = false } = {}) {
    common.uMieK.value = mieK;
    if (Math.abs(mieK - mieK0) > 0.02) { mieK0 = mieK; bakeStatic(); force = true; }
    viewMat.uniforms.uCamR.value = RG + Math.max(0.01, camY / 1000 + 0.01);
    let did = false;
    if (force || lastSun.dot(sunDir) < 0.999995) {
      viewMat.uniforms.uLight.value.copy(sunDir); draw(viewMat, sunView); lastSun.copy(sunDir); did = true;
    }
    if (force || lastMoon.dot(moonDir) < 0.99998) {
      viewMat.uniforms.uLight.value.copy(moonDir); draw(viewMat, moonView); lastMoon.copy(moonDir);
    }
    if (did || !cpu.ready) readBack(sync);
    return did;
  }
  let mieK0 = common.uMieK.value;
  return { trans, ms, sunView, moonView, update, transmittance, sample, ring, cpu, uniforms: common, readBack };
}
