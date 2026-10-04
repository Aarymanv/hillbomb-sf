// Sky dome: physically based atmosphere (atmosphere.js sky-view LUTs for the sun AND the moon), 2.5D cloud layers
// (cumulus / stratocumulus / nimbostratus low deck + cirrus, weather-driven coverage, sun-lit with multiple-scattering
// octaves and a forward-scattering silver lining, advected by the wind), the moon with its phase, a handful of faint
// stars, and the urban night sky (sodium / LED light-pollution glow near the horizon, low clouds lit from below).
// The same shader renders the environment cube (uEnvMode: no discs / stars, ground below the horizon) so the IBL
// matches the visible sky. The photographic HDRI sky (hdrisky.js) is still available with ?sky=hdri.
import * as THREE from 'three';
import { HDRI_GLSL } from './hdrisky.js';
import { SKYVIEW_GLSL } from './atmosphere.js';

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = gl_Position.w * 0.999995;   // just inside the far plane (drawn after the opaque scene, early-z culled)
}`;

export const SKY_FS = `
uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uFogCol;
uniform float uNight; uniform float uTime; uniform float uCloud; uniform float uFogBand;
uniform sampler2D uHdr; uniform float uHdrMix; uniform float uHdrScale;
uniform float uDirect; uniform sampler2D tA, tB, tS; uniform float hW, rotA, rotB, rotS, sA, sB, sS, stormW, capS; uniform vec4 stormG;
uniform float uFlash; uniform vec3 uFlashDir; uniform float uWash; uniform float uBandFix;
// physical sky
uniform float uPhys; uniform sampler2D tSunView, tMoonView, tNoise, tClouds; uniform float uCloudRT; uniform vec2 uRes;
uniform vec3 uSunE, uMoonE, uLP; uniform float uLPOcean, uStars, uEnvMode, uMoonDisc, uSunDisc;
uniform vec3 uNightSky, uGround, uCamPos, uCloudSun, uCirrusSun, uCloudAmb, uMoonCloud;
uniform vec4 uCloudLow, uCloudHigh, uCloudType; uniform vec2 uWind; uniform float uBankWash, uSkySat;
varying vec3 vDir;
${HDRI_GLSL}
${SKYVIEW_GLSL}
float h1(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h1(i+vec3(0,0,0)),h1(i+vec3(1,0,0)),f.x), mix(h1(i+vec3(0,1,0)),h1(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h1(i+vec3(0,0,1)),h1(i+vec3(1,0,1)),f.x), mix(h1(i+vec3(0,1,1)),h1(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=0.5; } return s; }
float gPx = 1e-3;   // angular size of a pixel (set in main, uniform control flow)
float hgP(float g, float mu){ float g2 = g * g; return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5); }   // x 4pi (isotropic = 1)
// distance along d (unit) from the camera (height hc m) to the spherical shell at height hs m (stable form)
float shellT(float dy, float hc, float hs) {
  float Rc = 6360000.0 + hc, k = (hs - hc) * (12720000.0 + hs + hc), b = Rc * dy;
  float q = b * b + k; if (q < 0.0) return -1.0;
  return k > 0.0 ? k / (b + sqrt(q)) : (-b - sqrt(q));
}
// low deck coverage field at world xz (0..1): one tap of the baked cumulus (r) / stratus (g) fields
float lowDens(vec2 p) {
  vec4 a = texture2D(tNoise, (p + uWind) / uCloudType.z);
  float s = mix(a.r, a.g * 0.7 + a.r * 0.3, uCloudType.x);
  float th = 1.0 - uCloudLow.x;
  return smoothstep(th - 0.02, th + mix(0.42, 0.5, uCloudType.x), s);
}
float fineDens(vec2 p) { return texture2D(tNoise, (p + uWind * 1.15) / uCloudType.z * 5.3 + 0.37).b; }
// low cloud deck, 2.5D: each point of the coverage field is a cloud with a flat base and a domed top of height
// T * dn^0.7. Seen from below we look into the base: sunlight crosses the whole cloud above it (dark thick cores,
// bright thin edges, a forward-scattering silver lining); near the horizon we see the sides, lit by the height-field
// normal. rgb = in-scattered radiance (premultiplied), a = opacity
vec4 lowClouds(vec3 d, float mu, out float tOut) {
  tOut = -1.0;
  if (uCloudLow.x < 0.005) return vec4(0.0);
  float hc = uCamPos.y, base = uCloudLow.z, T = uCloudLow.w;
  if (hc > base) return vec4(0.0);
  float t = shellT(d.y, hc, base + T * 0.3);
  if (t <= 0.0 || t > 80000.0) return vec4(0.0);
  vec2 p = uCamPos.xz + d.xz * t;
  float dn = lowDens(p);
  if (dn < 0.003) return vec4(0.0);
  // cauliflower detail erodes the edges and breaks up the shading
  float fd = fineDens(p);
  dn = clamp(dn * (0.8 + 0.4 * fd) - 0.06 * (1.0 - dn) * (1.0 - fd), 0.0, 1.0);
  if (dn < 0.003) return vec4(0.0);
  float e = 60.0 + t * 0.004;                                        // finite-difference step grows with distance
  float dx = lowDens(p + vec2(e, 0.0)) - dn, dz = lowDens(p + vec2(0.0, e)) - dn;
  float h = T * pow(dn, 0.7);
  float sl = sqrt(d.y * d.y + 2.0 * (base - hc) / 6360000.0);      // local elevation at the layer (curved shell)
  float side = 1.0 - smoothstep(0.06, 0.4, sl);                      // how much of the view sees cloud sides
  vec3 L = uNight > 0.5 ? uMoonDir : uSunDir;
  float ly = max(L.y, 0.03);
  float sig = uCloudLow.y;
  // opacity along the view: through the dome from below, a slab chord near the horizon
  float path = h / max(sl, 0.05);
  path = min(path, T * 5.0);
  float alpha = (1.0 - exp(-sig * path * 1.2)) * smoothstep(0.0, 0.3, dn);
  // light: from below, the sun crosses the cloud above the point (sampled up-sun); on the sides, a lambert-ish term
  vec2 ls = normalize(L.xz + 1e-5);
  float dS = lowDens(p + ls * min(h * 0.6 / ly, 2500.0));
  float hS = T * pow(max(dn, dS), 0.7);
  float tauS = sig * hS * mix(1.0, 0.45, side) / max(ly, 0.12) * 0.9;
  float ph = mix(hgP(0.72, mu), hgP(-0.2, mu), 0.3);
  float beer = exp(-tauS) * ph + 0.45 * exp(-tauS * 0.3) * mix(1.0, ph, 0.4) + 0.2 * exp(-tauS * 0.1);
  vec3 N = normalize(vec3(-dx * T * 1.6 / e, 1.0, -dz * T * 1.6 / e));
  float lam = pow(clamp(dot(N, normalize(vec3(L.x, max(L.y, 0.0) + 0.05, L.z))) * 0.6 + 0.4, 0.0, 1.0), 1.4);
  float sideLit = lam * (0.55 + 0.45 * ph) + 0.25 * exp(-tauS * 0.2);
  float lit = mix(beer, sideLit * 1.6, side * 0.8) * (0.8 + 0.4 * fd) + 0.9 / (1.0 + 0.075 * tauS);
  // edges glow toward the sun (thin, forward-scattering), thick cores go grey
  lit += (1.0 - dn) * pow(max(mu, 0.0), 8.0) * 2.5;
  vec3 col = (uNight > 0.5 ? uMoonCloud : uCloudSun) * lit * (0.9 / 3.14159);
  col += mix(vec3(dot(uCloudAmb, vec3(0.2126, 0.7152, 0.0722))), uCloudAmb, 0.55) * mix(0.55, 1.1, clamp(N.y * 0.5 + 0.5 * (1.0 - dn), 0.0, 1.0));
  col *= 1.0 - uCloudType.y * 0.75;
  // city light from below: low decks glow over the city at night
  col += uLP * (1.3 + 1.2 * dn) * (1.0 - smoothstep(600.0, 3500.0, base)) * mix(1.0, 0.45, uLPOcean * smoothstep(0.2, -0.6, d.x));
  col += vec3(0.75, 0.8, 1.0) * uFlash * (0.4 + 2.5 * pow(max(dot(d, uFlashDir), 0.0), 4.0)) * 1.5;
  float f = exp(-t / mix(28000.0, 9000.0, uCloudType.y));
  tOut = t;
  return vec4(col * alpha * f, alpha * f);
}
vec4 cirrus(vec3 d, float mu) {
  if (uCloudHigh.x < 0.005) return vec4(0.0);
  float t = shellT(d.y, uCamPos.y, uCloudHigh.z);
  if (t <= 0.0 || t > 160000.0) return vec4(0.0);
  vec2 p = (uCamPos.xz + d.xz * t + uWind * 2.2) / 26000.0;
  vec2 q = vec2(p.x * 0.8 + p.y * 0.6, (p.y * 0.8 - p.x * 0.6) * 2.6);   // streaks along the upper wind
  float n = texture2D(tNoise, q).a * 0.7 + texture2D(tNoise, q * 3.1 + 0.4).a * 0.3;
  float m = smoothstep(1.0 - uCloudHigh.x, 1.0 - uCloudHigh.x + 0.45, n) * smoothstep(0.3, 0.9, texture2D(tNoise, p * 0.31 + 0.2).g);
  float a = m * uCloudHigh.y * exp(-t / 70000.0);
  float ph = hgP(0.6, mu) * 0.55 + 0.45;
  vec3 col = uCirrusSun * ph * (0.9 / 3.14159) * 0.8 + uCloudAmb * 0.9 + uLP * 1.2;
  return vec4(col * a, a);
}
vec3 stars(vec3 d) {
  vec3 p = d * 260.0; vec3 c = floor(p);
  float h = h1(c);
  if (h < 0.99955) return vec3(0.0);
  vec3 sp = normalize(c + 0.5 + (vec3(h1(c + 1.7), h1(c + 3.1), h1(c + 5.3)) - 0.5) * 0.6);
  float r = length(d - sp) / gPx;
  float mag = pow((h - 0.99955) / 0.00045, 3.0);
  float tw = 0.9 + 0.1 * sin(uTime * 0.7 + h * 3000.0);
  vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.8, 0.88, 1.0), h1(c + 9.1));
  return tint * exp(-r * r * 1.6) * (0.25 + 1.6 * mag) * tw;
}
vec3 moonDisc(vec3 d) {
  float R = 0.0135;                                              // ~0.77 deg radius (larger than life so the phase reads)
  vec3 m = uMoonDir; float c = dot(d, m);
  if (c < 1.0 - R * R * 0.5 - 1e-5) return vec3(0.0);
  vec3 o = (d - m * c) / R; float r2 = dot(o, o);
  float px = gPx / R;
  float edge = smoothstep(1.0, 1.0 - 2.0 * px, sqrt(r2));
  if (edge <= 0.0) return vec3(0.0);
  vec3 N = normalize(o - m * sqrt(max(1.0 - r2, 0.0)));
  float lit = smoothstep(-0.03, 0.08, dot(N, uSunDir));
  // maria (low-frequency dark patches) + fine texture
  vec3 q = N * 3.0;
  float mar = smoothstep(0.45, 0.62, fbm(q + 11.0)) * 0.35 + (fbm(N * 18.0) - 0.5) * 0.12;
  vec3 alb = vec3(1.0, 0.97, 0.92) * (0.82 - mar);
  float limb = 0.8 + 0.2 * sqrt(max(1.0 - r2, 0.0));
  return alb * limb * (lit + 0.012) * edge;
}
void main() {
  vec3 d = normalize(vDir);
  gPx = max(length(fwidth(d)), 1e-5);
  float y = d.y;
  vec3 col;
  float cover = 0.0;
  if (uPhys > 0.5) {
    // ---------------------------------------------------------------- physical sky
    vec3 dq = vec3(d.x, max(d.y, 0.0), d.z);   // below the horizon: the horizon colour (ground/fog blend follows)
    col = texture2D(tSunView, aViewUv(dq, uSunDir)).rgb * uSunE;
    col += texture2D(tMoonView, aViewUv(dq, uMoonDir)).rgb * uMoonE;
    // camera-like saturation: paler, hazier toward the horizon
    col = max(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSkySat * mix(0.78, 1.0, smoothstep(0.0, 0.45, d.y))), 0.0);
    float mu = dot(d, uSunDir), muM = dot(d, uMoonDir);
    float muL = uNight > 0.5 ? muM : mu;
    // urban light pollution: sodium / LED glow scattered in the low haze, brightest at the horizon
    float el = max(y, 0.0);
    float ocean = mix(1.0, 0.25, uLPOcean * smoothstep(0.3, -0.7, d.x));
    col += uLP * (0.22 + 0.8 * exp(-el / 0.09) + 0.4 * exp(-el / 0.4)) * ocean + uNightSky * (0.75 + 0.25 * el);
    vec3 sky = col;
    if (uEnvMode < 0.5 && y > 0.0) {
      col += stars(d) * uStars * smoothstep(0.02, 0.3, y);
      col += moonDisc(d) * uMoonDisc;
      // sun disc (limb darkened), dimmed through the atmosphere by the CPU sun colour in uSunCol
      float sd = acos(clamp(mu, -1.0, 1.0)) / 0.0047;
      if (sd < 1.3) col += uSunCol * uSunDisc * smoothstep(1.0, 0.85, sd) * (0.6 + 0.4 * sqrt(max(1.0 - sd * sd, 0.0)));
    }
    // cirrus, then the low deck in front of it
    if (y > -0.02) {
      vec4 ci = cirrus(d, muL);
      col = col * (1.0 - ci.a) + ci.rgb;
      if (uCloudRT > 0.5) {
        // volumetric pass (main camera), a small tent filter over the low-res target hides the march jitter
        vec2 cuv = gl_FragCoord.xy / uRes, ct = 0.8 / (uRes / 3.0);
        vec4 cr = texture2D(tClouds, cuv) * 0.36 + (texture2D(tClouds, cuv + vec2(ct.x, ct.y)) + texture2D(tClouds, cuv + vec2(-ct.x, ct.y))
          + texture2D(tClouds, cuv + vec2(ct.x, -ct.y)) + texture2D(tClouds, cuv + vec2(-ct.x, -ct.y))) * 0.16;
        col = col * cr.a + cr.rgb;
        cover = 1.0 - cr.a;
      } else {
        float tl;
        vec4 lo = lowClouds(d, muL, tl);
        col = col * (1.0 - lo.a) + lo.rgb;
        cover = lo.a;
      }
    }
    // below the horizon: the (fogged) ground; the env bake uses the ground radiance there
    float gb = smoothstep(0.0, -0.035, y);
    col = mix(col, uEnvMode > 0.5 ? mix(uFogCol, uGround, smoothstep(-0.02, -0.25, y)) : uFogCol, gb);
    // haze band hugging the horizon (fogged far terrain blends into the sky), rain wash, inside the fog bank
    col = mix(col, uFogCol, uFogBand * smoothstep(0.16, 0.0, abs(y)));
    col = mix(col, uFogCol, uWash * smoothstep(0.45, 0.0, y));
    col = mix(col, uFogCol, uBankWash);
    col += vec3(0.6, 0.65, 0.8) * uFlash * 0.25 * (1.0 - cover);
    if (any(isnan(col))) col = uFogCol;
    // (look-dev) the IBL bake: a real street's fill is the sky plus neutral / warm walls and paving, not the pure dome
    // (a saturated blue env turned every shaded street cobalt)
    if (uEnvMode > 0.5) col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.72);
    gl_FragColor = vec4(clamp(col, 0.0, 512.0), 1.0);
    return;
  }
  // ---------------------------------------------------------------- photographic sky (?sky=hdri)
  float t = pow(clamp(y, 0.0, 1.0), 0.45);
  col = mix(uHorizon, uZenith, t);
  if (uHdrMix > 0.0) {
    vec3 hc;
    if (uDirect > 0.5) {
      float az = atan(d.z, d.x), el = asin(clamp(d.y, -1.0, 1.0));
      float e = el < 0.0 ? -el * 0.35 : el;
      hc = mix(hdriSamp(tA, az, e, rotA, sA, 40.0), hdriSamp(tB, az, e, rotB, sB, 40.0), hW);
      if (stormW > 0.001) {
        vec3 st = stormGrade(hdriSamp(tS, az, e, rotS, sS, capS), stormG, e);
        float fl = uFlash * (0.35 + 1.6 * pow(max(dot(d, uFlashDir), 0.0), 6.0));
        st += st * fl * 6.0 + vec3(0.6, 0.65, 0.8) * fl * 0.15;
        hc = mix(hc, st, stormW);
      }
      if (el < 0.0) hc *= mix(1.0, 0.45, smoothstep(0.0, 0.6, -el));
      cover = stormW;
    } else {
      vec2 huv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
      hc = texture2D(uHdr, huv).rgb;
    }
    col = mix(col, hc * uHdrScale, uHdrMix);
  }
  col = mix(col, uFogCol, smoothstep(0.02, -0.06, y));
  float sd = max(dot(d, uSunDir), 0.0);
  float clearSky = 1.0 - cover * 0.92;
  col += uSunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.6) * (1.0 - uNight * 0.9) * (1.0 - cover * 0.6);
  col += uSunCol * smoothstep(0.9994, 0.9997, sd) * 18.0 * (1.0 - uNight) * clearSky;
  col += moonDisc(d) * 3.0 * uNight * clearSky;
  col = mix(col, uFogCol, uFogBand * smoothstep(0.22, 0.0, abs(y)) );
  col = mix(col, uFogCol, uWash * smoothstep(0.45, 0.0, y));
  gl_FragColor = vec4(col, 1.0);
}`;

// tiling cloud noise (256^2 RGBA8, mipmapped), histogram-equalised per channel so coverage c covers ~c of the sky:
// r = Worley-Perlin cumulus cells, g = soft value fbm (stratus / modulation), b = fine billows, a = cirrus fbm
export function makeCloudNoise(N = 256) {
  const rnd = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const value = (x, y, P, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const m = k => ((k % P) + P) % P;
    const a = rnd(m(xi), m(yi), s), b = rnd(m(xi + 1), m(yi), s), c = rnd(m(xi), m(yi + 1), s), d = rnd(m(xi + 1), m(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const worley = (x, y, P, s) => {
    const xi = Math.floor(x), yi = Math.floor(y); let best = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, mx = ((cx % P) + P) % P, my = ((cy % P) + P) % P;
      const px = cx + rnd(mx, my, s), py = cy + rnd(mx, my, s + 7);
      const d = (px - x) ** 2 + (py - y) ** 2; if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const ch = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N)];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, k = j * N + i;
    let f = 0, a = 0.5; for (let o = 0; o < 4; o++) { const P = 4 << o; f += a * value(u * P, v * P, P, 11 + o); a *= 0.5; }
    const w = (1 - worley(u * 4, v * 4, 4, 3)) * 0.6 + (1 - worley(u * 8, v * 8, 8, 5)) * 0.28 + (1 - worley(u * 16, v * 16, 16, 9)) * 0.12;
    const fine = (1 - worley(u * 32, v * 32, 32, 41)) * 0.6 + (1 - worley(u * 64, v * 64, 64, 43)) * 0.4;
    ch[0][k] = w * 0.62 + f * 0.22 + fine * 0.16;
    let g = 0; a = 0.5; for (let o = 0; o < 5; o++) { const P = 2 << o; g += a * value(u * P, v * P, P, 31 + o); a *= 0.5; }
    ch[1][k] = g;
    ch[2][k] = (1 - worley(u * 16, v * 16, 16, 21)) * 0.6 + (1 - worley(u * 32, v * 32, 32, 23)) * 0.4;
    let c = 0; a = 0.5; for (let o = 0; o < 5; o++) { const P = 4 << o; c += a * value(u * P, v * P, P, 51 + o); a *= 0.55; }
    ch[3][k] = c;
  }
  const data = new Uint8Array(N * N * 4), idx = new Uint32Array(N * N);
  for (let c = 0; c < 4; c++) {
    const A = ch[c]; for (let k = 0; k < N * N; k++) idx[k] = k;
    idx.sort((p, q) => A[p] - A[q]);
    for (let r = 0; r < N * N; r++) data[idx[r] * 4 + c] = Math.round(r / (N * N - 1) * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export function createSky(atmos = null) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 0.45 }, uFogBand: { value: 0.3 },
    uHdr: { value: null }, uHdrMix: { value: 0 }, uHdrScale: { value: 1 },
    uDirect: { value: 0 }, tA: { value: null }, tB: { value: null }, tS: { value: null }, hW: { value: 0 }, rotA: { value: 0 }, rotB: { value: 0 }, rotS: { value: 0 },
    sA: { value: 1 }, sB: { value: 1 }, sS: { value: 1 }, stormW: { value: 0 }, capS: { value: 40 }, stormG: { value: new THREE.Vector4(1, 0, 1, 0) },
    uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uWash: { value: 0 }, uBandFix: { value: 0 },
    // physical sky
    uPhys: { value: atmos ? 1 : 0 }, tSunView: { value: atmos?.sunView.texture || null }, tMoonView: { value: atmos?.moonView.texture || null },
    tNoise: { value: atmos ? makeCloudNoise() : null }, uMieK: atmos ? atmos.uniforms.uMieK : { value: 1.6 },
    uSunE: { value: new THREE.Vector3(1, 1, 1) }, uMoonE: { value: new THREE.Vector3() }, uLP: { value: new THREE.Vector3() },
    uLPOcean: { value: 0 }, uStars: { value: 0 }, uEnvMode: { value: 0 }, uMoonDisc: { value: 0 }, uSunDisc: { value: 0 },
    uGround: { value: new THREE.Vector3() }, uNightSky: { value: new THREE.Vector3() }, uCamPos: { value: new THREE.Vector3() }, uCloudSun: { value: new THREE.Vector3() },
    uCirrusSun: { value: new THREE.Vector3() }, uCloudAmb: { value: new THREE.Vector3() }, uMoonCloud: { value: new THREE.Vector3() },
    uCloudLow: { value: new THREE.Vector4(0.2, 0.03, 1500, 900) }, uCloudHigh: { value: new THREE.Vector4(0.3, 0.5, 8500, 0) },
    uCloudType: { value: new THREE.Vector4(0, 0, 14000, 0) }, uWind: { value: new THREE.Vector2() }, uBankWash: { value: 0 }, tClouds: { value: null }, uCloudRT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uSkySat: { value: 0.8 },   /* (look-dev 0.76 -> 0.64; regression fix 9/30 -> 0.8: the user's liked shot is a deep saturated blue) */
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e6;   // last among the opaques: early-z rejects every covered pixel
  mesh.name = 'sky';
  return { mesh, uniforms, material: mat };
}

// ---------------------------------------------------------------- time of day model
const LAT = 37.8 * Math.PI / 180, DEC = -1.2 * Math.PI / 180;
const E = new THREE.Vector3(1, 0, 0), P = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)), Q = new THREE.Vector3(0, Math.cos(LAT), Math.sin(LAT));
export function sunDirection(hours, out = new THREE.Vector3()) {
  const H = (hours - 13.1) / 24 * Math.PI * 2;
  out.copy(Q).multiplyScalar(Math.cos(DEC) * Math.cos(H)).addScaledVector(E, -Math.cos(DEC) * Math.sin(H)).addScaledVector(P, Math.sin(DEC));
  return out.normalize();
}
// the moon lags the sun by (age / 29.53) of a day: age ~10 days = a waxing gibbous moon high in the evening sky
export function moonDirection(hours, out = new THREE.Vector3(), age = 10) {
  const H = (hours - 13.1 - age / 29.53 * 24.84) / 24 * Math.PI * 2, dec = 0.16;
  out.copy(Q).multiplyScalar(Math.cos(dec) * Math.cos(H)).addScaledVector(E, -Math.cos(dec) * Math.sin(H)).addScaledVector(P, Math.sin(dec));
  return out.normalize();
}

// keyframes by sun elevation (degrees): zenith, horizon, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity, fog colour
const KEYS = [
  { el: -18, zen: 0x03060f, hor: 0x1c1a2a, sun: 0x000000, si: 0.0, hs: 0x303c62, hg: 0x3a2a1c, hi: 0.6, fog: 0x2a2432 },
  { el: -8, zen: 0x08112c, hor: 0x33304a, sun: 0x3a2030, si: 0.0, hs: 0x36436a, hg: 0x35281e, hi: 0.62, fog: 0x2d2a3e },
  { el: -2, zen: 0x1b2a52, hor: 0xc26a4a, sun: 0xff7a3a, si: 0.15, hs: 0x55607e, hg: 0x221c1a, hi: 0.6, fog: 0x6a5a66 },
  { el: 4, zen: 0x3a5d94, hor: 0xffa062, sun: 0xff9a52, si: 1.4, hs: 0x8fa3c2, hg: 0x3a2f28, hi: 0.62, fog: 0xc8a48c },
  { el: 12, zen: 0x4a78b8, hor: 0xe8c9a6, sun: 0xffc98e, si: 2.2, hs: 0xa9bfd9, hg: 0x4a4034, hi: 0.7, fog: 0xc9c6c0 },
  { el: 30, zen: 0x3f74c0, hor: 0xbfd4e8, sun: 0xfff0dc, si: 2.6, hs: 0xb4cbe6, hg: 0x55503f, hi: 0.74, fog: 0xc4d0dc },
  { el: 70, zen: 0x3b6fc2, hor: 0xb8d0ea, sun: 0xfff6ea, si: 2.75, hs: 0xb9d0ea, hg: 0x5a5646, hi: 0.76, fog: 0xc2d0de },
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpHex(a, b, t, out) { _c1.setHex(a); _c2.setHex(b); return out.copy(_c1).lerp(_c2, t); }
export function skyState(sunEl) {
  let i = 0; while (i < KEYS.length - 2 && sunEl > KEYS[i + 1].el) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((sunEl - A.el) / (B.el - A.el), 0, 1);
  return {
    zenith: lerpHex(A.zen, B.zen, t, new THREE.Color()), horizon: lerpHex(A.hor, B.hor, t, new THREE.Color()),
    sunCol: lerpHex(A.sun, B.sun, t, new THREE.Color()), sunI: A.si + (B.si - A.si) * t,
    hemiSky: lerpHex(A.hs, B.hs, t, new THREE.Color()), hemiGround: lerpHex(A.hg, B.hg, t, new THREE.Color()), hemiI: A.hi + (B.hi - A.hi) * t,
    fog: lerpHex(A.fog, B.fog, t, new THREE.Color()),
  };
}

// ---------------------------------------------------------------- volumetric low clouds (screen pass, 1/3 res)
// Ray-marched cumulus / stratocumulus deck for the main camera: a 3D density built from the weather coverage field,
// a rounded height profile (tall where coverage is dense, flat bases), height-sheared detail erosion; 3 light samples
// toward the sun / moon per step (Beer + powder, multiple-scattering octaves, dual-lobe phase -> silver linings), sky
// ambient by height in the cloud, the city's glow on low bases at night. rgb = in-scattered radiance, a = transmittance.
// The dome composites it (sky.js main); reflections and the env bake keep the cheap 2.5D layer.
const CLOUD_FS = `
uniform sampler2D tNoise; uniform vec4 uCloudLow, uCloudType; uniform vec2 uWind; uniform vec3 uCamPos, uSunDir, uMoonDir;
uniform float uNight, uFlash, uLPOcean; uniform vec3 uCloudSun, uMoonCloud, uCloudAmb, uLP, uFlashDir;
uniform mat4 uInvProj, uCamWorld; uniform vec2 uLoRes;
varying vec2 vUv;
float hgP(float g, float mu){ float g2 = g * g; return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5); }
float shellT(float dy, float hc, float hs) {
  float Rc = 6360000.0 + hc, k = (hs - hc) * (12720000.0 + hs + hc), b = Rc * dy;
  float q = b * b + k; if (q < 0.0) return -1.0;
  return k > 0.0 ? k / (b + sqrt(q)) : (-b - sqrt(q));
}
float cDens(vec3 p, float hf, float detail) {
  vec2 uv = (p.xz + uWind) / uCloudType.z;
  vec4 a = texture2D(tNoise, uv);
  float s = mix(a.r, a.g * 0.7 + a.r * 0.3, uCloudType.x);
  float d0 = s - (1.0 - uCloudLow.x);
  if (d0 <= -0.02) return 0.0;
  float tall = clamp(d0 / mix(0.4, 0.25, uCloudType.x), 0.0, 1.0);
  float top = mix(pow(tall, 0.6), 0.55 + 0.45 * tall, uCloudType.x);            // dome (cumulus) -> flat deck (stratus)
  float prof = smoothstep(0.0, 0.06, hf) * (1.0 - smoothstep(top * 0.72, top, hf));
  float d = clamp(d0 * 5.0 + 0.1, 0.0, 1.0) * prof;
  if (detail > 0.5 && d > 0.0) {
    float f = texture2D(tNoise, uv * 5.3 + vec2(hf * 0.61, -hf * 0.43) + 0.37).b;
    d = clamp(d - (1.0 - f) * 0.42 * (1.0 - d * 0.6) - (1.0 - hf) * 0.0, 0.0, 1.0);
  }
  return d;
}
void main() {
  vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 vp = uInvProj * ndc; vp /= vp.w;
  vec3 d = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
  float hc = uCamPos.y, base = uCloudLow.z, T = uCloudLow.w;
  if (uCloudLow.x < 0.005 || d.y < -0.02 || hc > base) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t0 = shellT(d.y, hc, base), t1 = shellT(d.y, hc, base + T);
  if (t0 <= 0.0 || t0 > 70000.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  t1 = min(t1, t0 + 9000.0);
  if (!(t1 > t0 + 1.0)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }   // grazing rays: no slab chord (and no NaN)
  vec3 L = uNight > 0.5 ? uMoonDir : uSunDir;
  vec3 Lm = normalize(vec3(L.x, max(L.y, 0.06), L.z));
  float mu = dot(d, L);
  float sig = uCloudLow.y;
  vec3 lcol = (uNight > 0.5 ? uMoonCloud : uCloudSun);
  const int N = 32;
  float dt = (t1 - t0) / float(N);
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float trans = 1.0; vec3 acc = vec3(0.0);
  float ph0 = mix(hgP(0.75, mu), hgP(-0.25, mu), 0.3), ph1 = mix(hgP(0.35, mu), hgP(-0.1, mu), 0.3);
  float lpK = (1.0 - smoothstep(600.0, 3500.0, base)) * mix(1.0, 0.45, uLPOcean * smoothstep(0.2, -0.6, d.x));
  for (int i = 0; i < N; i++) {
    float t = t0 + (float(i) + jit) * dt;
    vec3 p = vec3(uCamPos.x + d.x * t, hc + d.y * t + t * t / 12720000.0, uCamPos.z + d.z * t);
    float hf = (p.y - base) / T;
    if (hf < 0.0 || hf > 1.0) continue;
    float den = cDens(p, hf, 1.0);
    if (den < 0.004) continue;
    // light march (3 taps up toward the light, growing steps)
    float od = 0.0;
    for (int k = 1; k <= 3; k++) {
      float sd = T * 0.14 * float(k * k);
      vec3 q = p + Lm * sd;
      float hq = (q.y - base) / T;
      if (hq > 1.0) break;
      od += cDens(q, hq, 0.0) * T * 0.14 * float(2 * k - 1);
    }
    float tauL = sig * od;
    // + diffusion through thick decks (two-stream: 1 / (1 + 0.75 (1 - g) tau)): overcast bases stay a lit grey
    float lum = exp(-tauL) * ph0 + 0.5 * exp(-tauL * 0.25) * ph1 + 0.25 * exp(-tauL * 0.06) + 0.9 / (1.0 + 0.075 * (tauL + sig * T * (1.0 - hf) * 0.5));   // (look-dev made cumulus 0.5 (grey bases); regression fix 9/30: back to 0.9, bright white cumulus)
    float powder = 1.0 - exp(-den * sig * 180.0);
    lum *= mix(1.0, powder, 0.55 * (1.0 - smoothstep(0.4, 0.95, mu)));
    vec3 ambC = mix(vec3(dot(uCloudAmb, vec3(0.2126, 0.7152, 0.0722))), uCloudAmb, 0.55);
    vec3 S = lcol * lum * (0.9 / 3.14159) + ambC * mix(mix(0.26, 0.38, uCloudType.x), 1.1, hf) * (1.0 - 0.35 * den);
    S *= 1.0 - uCloudType.y * 0.72;
    S += uLP * (1.4 + 1.2 * den) * (1.0 - hf * 0.7) * lpK;
    S += vec3(0.75, 0.8, 1.0) * uFlash * (0.4 + 2.5 * pow(max(dot(d, uFlashDir), 0.0), 4.0)) * 1.5;
    float st = exp(-sig * den * dt);
    acc += trans * S * (1.0 - st);
    trans *= st;
    if (trans < 0.015) break;
  }
  float f = exp(-t0 / mix(24000.0, 9000.0, uCloudType.y));
  vec4 o = vec4(acc * f, mix(1.0, trans, f));
  gl_FragColor = any(isnan(o)) || any(isinf(o)) ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(o, 0.0, 64.0);
}`;
export function createCloudPass(renderer, sky) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
  const U = sky.uniforms;
  const uniforms = { tNoise: U.tNoise, uCloudLow: U.uCloudLow, uCloudType: U.uCloudType, uWind: U.uWind, uCamPos: U.uCamPos, uSunDir: U.uSunDir, uMoonDir: U.uMoonDir,
    uNight: U.uNight, uFlash: U.uFlash, uLPOcean: U.uLPOcean, uCloudSun: U.uCloudSun, uMoonCloud: U.uMoonCloud, uCloudAmb: U.uCloudAmb, uLP: U.uLP, uFlashDir: U.uFlashDir,
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uLoRes: { value: new THREE.Vector2() } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: CLOUD_FS, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad); const cam = new THREE.Camera();
  const sz = new THREE.Vector2();
  let mainCam = null;
  // the dome uses the pass only for the camera it was rendered for (not the water mirror / probes)
  // (uRes = the target the dome is drawn into right now: the composer's targets follow its own pixel ratio, which can
  // differ from the drawing buffer -> gl_FragCoord / uRes ran past 1 and the clamped cloud texture smeared into streaks)
  const tsz = new THREE.Vector2();
  sky.mesh.onBeforeRender = (r, s, c) => {
    U.uCloudRT.value = c === mainCam && U.uCloudLow.value.x > 0.005 ? 1 : 0;
    if (U.uCloudRT.value) { const t = r.getRenderTarget(); if (t) U.uRes.value.set(t.width, t.height); else U.uRes.value.copy(r.getDrawingBufferSize(tsz)); }
  };
  function render(camera, divisor = 3) {
    renderer.getDrawingBufferSize(sz);
    const w = Math.max(2, Math.ceil(sz.x / divisor)), h = Math.max(2, Math.ceil(sz.y / divisor));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    U.uRes.value.set(sz.x, sz.y);
    camera.updateMatrixWorld();
    uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    uniforms.uCamWorld.value.copy(camera.matrixWorld);
    uniforms.uLoRes.value.set(w, h);
    mainCam = camera;
    if (U.uCloudLow.value.x <= 0.005) return;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev);
  }
  U.tClouds.value = rt.texture;
  return { rt, render };
}
