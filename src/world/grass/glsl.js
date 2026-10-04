// Shared GLSL for the ground-cover layers (grass, flowers, ferns, shrubs, rocks). Every object is placed procedurally in the
// vertex shader from (chunk, object index): a hashed position inside the chunk, the ground capture (height, blocked mask,
// ground present; 0.5 m texels, see capture.js) and the biome window (surface class, lushness, slope; 4 m cells, see bio.js).

import { YARD_GLSL, NOYARDG } from './yard_glsl.js';

export const COMMON_V = /* glsl */`
attribute vec4 aChunk;   // chunk x0, z0, size, salt
attribute float aIdx;    // object index inside the chunk
uniform sampler2D uCap; uniform vec4 uCapXf;   // origin x, origin z, 1/size, texels
uniform sampler2D uBio; uniform vec4 uBioXf;
uniform sampler2D uLot;  // lot frames of yard cells (capture.js BioWindow.lotTex)
uniform float uTime;
uniform vec4 uWind;      // dir x, dir z, strength, wetness
uniform vec4 uFlat[12];  // flatteners: x, z, radius, strength
uniform vec4 uLayer;     // near, far, layer density (1/m^2), far fade distance
uniform vec3 uCam;       // the real camera (shadow passes have their own cameraPosition)
uniform float uDensMul;
varying vec3 vGC;
varying vec4 vCov;       // t (0 root..1 tip), translucency, u, v

uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(inout uint s) { s = pcg(s); return float(s >> 8) * (1.0 / 16777216.0); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.11 + 3.7) * 0.15; }

vec4 capAt(vec2 xz, out vec2 grad) {
  float R = uCapXf.w; vec2 f = (xz - uCapXf.xy) * uCapXf.z * R - 0.5; vec2 fl = floor(f); vec2 t = f - fl; ivec2 i = ivec2(fl);
  grad = vec2(0.0);
  if (i.x < 0 || i.y < 0 || i.x >= int(R) - 1 || i.y >= int(R) - 1) return vec4(0.0, 1.0, 0.0, 0.0);
  vec4 a = texelFetch(uCap, i, 0), b = texelFetch(uCap, i + ivec2(1, 0), 0), c = texelFetch(uCap, i + ivec2(0, 1), 0), d = texelFetch(uCap, i + ivec2(1, 1), 0);
  grad = vec2(mix(b.x - a.x, d.x - c.x, t.y), mix(c.x - a.x, d.x - b.x, t.x)) * (R * uCapXf.z);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
float blockedAt(vec2 xz) { vec2 g; vec4 c = capAt(xz, g); return max(c.y, 1.0 - c.z); }
vec4 bioAt(vec2 xz) { float R = uBioXf.w; ivec2 i = ivec2(floor((xz - uBioXf.xy) * uBioXf.z * R)); i = clamp(i, ivec2(0), ivec2(int(R) - 1)); return texelFetch(uBio, i, 0); }

struct Site { vec3 p; vec3 n; float d; float rank; vec4 bio; int cls; bool ok; uint s; };
Site site() {
  Site S; float cs = aChunk.z; ivec2 ci = ivec2(floor(aChunk.xy / cs + 0.5));
  uint s = pcg(uint(ci.x) * 73856093u ^ uint(ci.y) * 19349663u ^ uint(aChunk.w));
  s = pcg(s ^ (uint(aIdx + 0.5) * 2654435761u));
  vec2 xz = aChunk.xy + vec2(rnd(s), rnd(s)) * cs;
  S.rank = rnd(s);
  vec2 g; vec4 c = capAt(xz, g);
  S.p = vec3(xz.x, c.x, xz.y); S.n = normalize(vec3(-g.x, 1.0, -g.y));
  S.ok = c.z > 0.999 && c.y < 0.004;
  S.d = distance(S.p, uCam);
  vec2 j = (vec2(rnd(s), rnd(s)) - 0.5) * 4.5;          // dithered biome borders
  S.bio = bioAt(xz + j); S.cls = int(S.bio.r * 255.0 + 0.5);
  S.s = s; return S;
}
// travelling gusts 0..1 (pattern moves with the wind at ~5 m/s)
float gustAt(vec2 xz) { return smoothstep(0.3, 0.8, fbm(xz * 0.03 - uWind.xy * uTime * 0.16)); }
// strongest flattener: xy = push direction, z = amount
vec3 flatAt(vec2 xz) {
  vec3 o = vec3(0.0);
  for (int k = 0; k < 12; k++) {
    vec4 f = uFlat[k]; if (f.w <= 0.0) continue;
    vec2 dv = xz - f.xy; float dd = length(dv); float a = f.w * (1.0 - smoothstep(f.z * 0.55, f.z, dd));
    if (a > o.z) o = vec3(dd > 1e-3 ? dv / dd : vec2(1.0, 0.0), a);
  }
  return o;
}
vec3 bez(vec3 a, vec3 b, vec3 c, float t) { float u = 1.0 - t; return u * u * a + 2.0 * u * t * b + t * t * c; }
vec3 bezT(vec3 a, vec3 b, vec3 c, float t) { return 2.0 * (1.0 - t) * (b - a) + 2.0 * t * (c - b); }
// 0 = lush green .. 1 = golden summer-dry
// + a ~300 m macro drift so whole hillsides differ (terrainmat.js uses the same formula for the far ground)
float dryness(vec4 bio, float patchN, vec2 xz) { return clamp(1.0 - bio.g + (patchN - 0.5) * 0.8 + (vnoise(xz * 0.0035 + 5.3) - 0.5) * 0.45 * (1.0 - 0.8 * smoothstep(0.8, 0.95, bio.g)), 0.0, 1.0); }
vec3 grassCol(float dry, float n1, float r) {
  vec3 wet = mix(vec3(0.045, 0.14, 0.018), vec3(0.12, 0.23, 0.035), n1); wet = mix(wet, vec3(0.2, 0.28, 0.06), r * 0.35);
  vec3 dr = mix(vec3(0.36, 0.25, 0.09), vec3(0.6, 0.43, 0.16), n1); dr = mix(dr, vec3(0.74, 0.6, 0.34), r * 0.45);
  return mix(wet, dr, smoothstep(0.3, 0.7, dry));
}
float grassDens(int c) { return c == 3 ? 1.0 : c == 9 ? 1.0 : c == 8 ? 0.85 : c == 7 ? 0.4 : c == 5 ? 0.2 : c == 4 ? 0.14 : c == 6 ? 0.12 : 0.0; }
// wildflower patches: x poppy, y lupine, z yellow (dandelion / goldfields), w white (daisy / clover)
vec4 flowerField(vec2 xz, float dry, int c) {
  if (c != 3 && c != 8 && c != 9) return vec4(0.0);
  float f1 = fbm(xz * 0.045 + 31.0), f2 = fbm(xz * 0.06 - 17.0);
  return vec4(smoothstep(0.6, 0.72, f1) * (0.25 + 0.75 * dry), smoothstep(0.62, 0.74, f2) * (0.2 + 0.8 * dry),
              smoothstep(0.58, 0.7, 1.0 - f1) * (1.0 - dry) * 0.8, smoothstep(0.6, 0.74, 1.0 - f2) * (1.0 - dry) * 0.7);
}
// ice plant (Carpobrotus) mats: the dunes above the beach and the coastal bluffs of the west side
float iceAt(int c, vec3 p) {
  float n = fbm(p.xz * 0.025 + 41.0);
  if (c == 4) return p.y > 3.5 ? smoothstep(0.3, 0.44, n) : 0.0;
  if (c == 8 && p.x < -6500.0) return smoothstep(0.52, 0.64, n);
  return 0.0;
}
const vec3 FL_POPPY = vec3(0.95, 0.28, 0.015), FL_LUPINE = vec3(0.3, 0.17, 0.66), FL_YELLOW = vec3(0.95, 0.72, 0.04), FL_WHITE = vec3(0.85, 0.85, 0.8);
${NOYARDG ? '#define HB_NOYARD' : YARD_GLSL}
`;

// ------------------------------------------------------------------ per-layer vertex bodies: void coverMain(out P, out N, out kill)
export const BODY = {};

BODY.grass = /* glsl */`
void coverMain(out vec3 P, out vec3 N, out bool kill) {
  Site S = site();
  float t = position.y, side = position.x;
  uint s = S.s;
  float icef = iceAt(S.cls, S.p);
  // residential yards: blades only on the lots whose ground is lawn (grass/yard_glsl.js, same patchwork as the terrain)
  float yk = 1.0; vec4 yc = vec4(0.0);
#ifndef HB_NOYARD
  if (S.cls == 9) { yc = yardCell(uLot, uBioXf, S.p.xz); yk = yardGrassK(yc); }
#endif
  float target0 = min(110.0, 110.0 * pow(8.5 / max(S.d, 0.5), 1.8)) * max(grassDens(S.cls) * yk, icef * 1.6) * uDensMul;   // (ice plant: closed mats)
  if (!S.ok || S.rank * uLayer.z >= target0 || S.d < uLayer.x || S.d >= uLayer.y) { kill = true; P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); vGC = vec3(0.0); vCov = vec4(0.0); return; }
  float r1 = rnd(s), r2 = rnd(s), r3 = rnd(s), r4 = rnd(s), r5 = rnd(s), r6 = rnd(s), r7 = rnd(s);
  float patchN = fbm(S.p.xz * 0.03 + 11.0), n1 = vnoise(S.p.xz * 0.13);
  float dry = dryness(S.bio, patchN, S.p.xz);
  int c = S.cls;
  float dens = max(grassDens(c) * yk, icef * 1.6);
  bool ice = r7 < icef * 0.97;
  bool lawn = c == 9 || (c == 3 && S.bio.g > 0.6 && patchN < 0.6);
  bool forest = c == 7;
  float H, W, stiff = 1.0;
  // ice plant: fleshy finger leaves in low closed mats; flowering patches (spring) carry the odd broad magenta flower
  float iceFl = ice ? smoothstep(0.5, 0.68, fbm(S.p.xz * 0.09 + 9.0)) : 0.0;
  bool iceFlower = ice && r6 > 1.0 - 0.07 * iceFl - 0.006;
  if (ice) { H = mix(0.09, 0.17, r1) + (iceFlower ? 0.03 : 0.0); W = iceFlower ? 0.11 : 0.072; stiff = 4.0; }
  else if (lawn) { H = c == 9 && yc.x > 0.5 ? mix(0.08, 0.26, r1) : mix(0.06, 0.16, r1); W = 0.028; stiff = 2.2; }   // (dry yard lawns: unmown, gone to seed)
  else if (forest) { H = mix(0.1, 0.3, r1 * r1); W = 0.02; }
  else {
    H = mix(0.3, 0.95, pow(r1, 0.8)) * mix(0.75, 1.2, n1) * (r6 < 0.4 ? 0.5 : 1.0); W = mix(0.016, 0.03, r2);
    if (c == 8) H *= 0.85;
    if (c == 4) { H *= 0.7; W *= 1.4; }
    H *= mix(1.0, 0.55, smoothstep(0.35, 0.0, dry));     // unmown green meadow is a bit shorter than the dry hills
  }
  float d = S.d;
  float target = min(110.0, 110.0 * pow(8.5 / max(d, 0.5), 1.8)) * dens * uDensMul;
  kill = !S.ok || S.rank * uLayer.z >= target || d < uLayer.x || d >= uLayer.y;
  W *= clamp(pow(d / 8.5, 0.9), 1.0, 7.0);               // fewer, wider blades with distance keep the coverage
  H *= smoothstep(uLayer.w, uLayer.w * 0.78, d);          // far fade: shrink into the terrain
  // forest floor under canopy: mostly leaf / needle litter and low moss cushions, only a few thin grass blades
  bool litter = forest && r5 < 0.5 && d < 40.0;
  bool moss = forest && !litter && r5 < 0.93;
  float ang = r3 * 6.2831853; vec2 fd = vec2(cos(ang), sin(ang));
  vec2 vd = normalize(uCam.xz - S.p.xz + 1e-4); float dd = dot(fd, vd);
  fd = normalize(fd + vd * (dd < 0.0 ? -1.0 : 1.0) * 0.6 * (1.0 - abs(dd)));    // no razor-thin edge-on blades
  vec3 fdir = vec3(fd.x, 0.0, fd.y), sdir = vec3(-fd.y, 0.0, fd.x), up = vec3(0.0, 1.0, 0.0);
  float g = gustAt(S.p.xz), wAmt = uWind.z;
  float flut = sin(uTime * (2.4 + 2.0 * r4) + dot(S.p.xz, uWind.xy) * 0.9 + r4 * 6.28) * (0.05 + 0.12 * g);
  vec2 hoff = fd * (0.12 + 0.35 * r2) + uWind.xy * (wAmt * (0.2 + 1.15 * g) + flut * wAmt) / stiff;
  vec3 fl = flatAt(S.p.xz);
  if (ice) hoff = fd * (0.55 + 0.45 * r2) + uWind.xy * wAmt * 0.04;
  hoff = mix(hoff, fl.xy * 2.4, fl.z);
  float hl = length(hoff), a = min(hl, 1.45); vec2 hd = hl > 1e-4 ? hoff / hl : fd;
  vec3 tip = S.p + vec3(hd.x * sin(a), cos(a), hd.y * sin(a)) * H;
  vec3 mid = S.p + up * H * 0.62 + vec3(hd.x, 0.0, hd.y) * H * 0.1 * sin(a);
  float wt = W;
  if (litter) { tip = S.p + fdir * (0.05 + 0.05 * r1) + up * 0.02; mid = mix(S.p, tip, 0.5) + up * 0.018; wt = 0.05 + 0.04 * r6; }
  if (moss) { tip = S.p + fdir * (0.05 + 0.07 * r1) + up * (0.018 + 0.025 * r2); mid = mix(S.p, tip, 0.5) + up * 0.035; wt = (0.1 + 0.1 * r6) * clamp(d / 12.0, 1.0, 2.5); }
  vec3 pos = bez(S.p, mid, tip, t);
  vec3 tg = normalize(bezT(S.p, mid, tip, max(t, 0.02)) + 1e-5);
  pos += sdir * side * wt * 0.5 * (1.0 - pow(t, 1.5));
  vec3 nb = normalize(cross(sdir, tg));
  nb = normalize(nb + sdir * side * 0.45);
  float farN = smoothstep(8.0, 60.0, d);
  N = normalize(mix(nb, S.n, 0.3 + 0.5 * farN));
  P = pos;
  // colour: biome palette, patches, per-blade jitter, base AO, bleached tips, gust sheen, rain darkening
  vec3 col = grassCol(dry, n1, r4);
  if (forest) col = mix(vec3(0.16, 0.25, 0.06), vec3(0.26, 0.33, 0.1), n1);
  if (lawn) col = mix(col, vec3(0.07, 0.19, 0.025), 0.55);
#ifndef HB_NOYARD
  if (c == 9) { float yd = yc.x < 1.5 ? yardLawnDry(yc, S.p.xz) : 0.9; dry = yd; col = yardLawnCol(yd, n1) * (1.0 + 0.25 * r4); }
#endif
  if (ice) {   // Carpobrotus: fleshy yellow-green to blue-green mats, red-tinged (stressed) leaves and whole bronze-red mats
    float m = fbm(S.p.xz * 0.05 + 3.0), bg = vnoise(S.p.xz * 0.07 + 2.0);
    col = mix(vec3(0.17, 0.43, 0.09), vec3(0.3, 0.55, 0.13), n1);
    col = mix(col, vec3(0.12, 0.38, 0.2), bg * 0.6);                              // glaucous blue-green leaves
    col = mix(col, vec3(0.6, 0.12, 0.16), t * t * 0.9 * smoothstep(0.42, 0.62, m));   // red tips
    col = mix(col, vec3(0.5, 0.16, 0.13), 0.7 * smoothstep(0.66, 0.8, m));            // whole red-bronze mats
    if (iceFlower && t > 0.62) col = vec3(0.92, 0.1, 0.56);                        // magenta (C. chilensis) flowers
  }
  col *= 0.8 + 0.4 * r6;
  // (succulent mats: shallow base shade and no dry-grass tip bleaching: the old 0.35 base AO under warm golden-hour light
  // read the mats as olive-brown)
  float ao = mix(ice ? 0.62 : 0.35, 1.0, smoothstep(0.0, 0.75, t));
  col = mix(col * ao, col * (ice ? 1.08 : 1.15 + 0.25 * dry), t * t);
  if (litter) { col = mix(vec3(0.17, 0.1, 0.04), vec3(0.3, 0.2, 0.08), r1) * (0.7 + 0.4 * r2); N = S.n; }
  if (moss) { col = mix(vec3(0.09, 0.16, 0.03), vec3(0.2, 0.26, 0.07), r1) * (0.75 + 0.4 * r2) * mix(0.7, 1.0, t); N = normalize(mix(S.n, nb, 0.3)); }
  // far flower speckle: tips of distant blades take the colour of wildflower patches
  vec4 fw = flowerField(S.p.xz, dry, c);
  float fs = fw.x + fw.y + fw.z + fw.w;
  if (d > 26.0 && t > 0.7 && r5 < fs * 0.35) {
    vec3 fc = r2 * fs < fw.x ? FL_POPPY : r2 * fs < fw.x + fw.y ? FL_LUPINE : r2 * fs < fw.x + fw.y + fw.z ? FL_YELLOW : FL_WHITE;
    col = mix(col, fc, smoothstep(26.0, 40.0, d));
  }
  col *= 1.0 + 0.28 * g * wAmt;
  col *= 1.0 - 0.3 * uWind.w;
  vGC = col; vCov = vec4(t, litter ? 0.15 : moss ? 0.3 : ice ? 0.5 : 0.6, side, t);
}`;

BODY.flower = /* glsl */`
void coverMain(out vec3 P, out vec3 N, out bool kill) {
  Site S = site();
  if (!S.ok || (S.cls != 3 && S.cls != 8 && S.cls != 9) || S.d < uLayer.x || S.d >= uLayer.y || S.rank * uLayer.z >= 4.0 * min(1.0, pow(12.0 / max(S.d, 0.5), 1.3))) { kill = true; P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); vGC = vec3(0.0); vCov = vec4(0.0); return; }
#ifndef HB_NOYARD
  if (S.cls == 9 && yardGrassK(yardCell(uLot, uBioXf, S.p.xz)) < 0.5) { kill = true; P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); vGC = vec3(0.0); vCov = vec4(0.0); return; }
#endif
  uint s = S.s;
  float r1 = rnd(s), r2 = rnd(s), r3 = rnd(s), r4 = rnd(s);
  float patchN = fbm(S.p.xz * 0.03 + 11.0);
  float dry = dryness(S.bio, patchN, S.p.xz);
  vec4 fw = flowerField(S.p.xz, dry, S.cls);
  float fs = fw.x + fw.y + fw.z + fw.w, d = S.d;
  float target = min(uLayer.z, 4.0 * fs) * min(1.0, pow(12.0 / max(d, 0.5), 1.3)) * uDensMul;
  kill = !S.ok || S.rank * uLayer.z >= target || d < uLayer.x || d >= uLayer.y;
  // species: 0 poppy, 1 lupine, 2 yellow, 3 white
  float pick = r1 * fs; int sp = pick < fw.x ? 0 : pick < fw.x + fw.y ? 1 : pick < fw.x + fw.y + fw.z ? 2 : 3;
  float Hs = sp == 0 ? mix(0.22, 0.38, r2) : sp == 1 ? mix(0.2, 0.36, r2) : sp == 2 ? mix(0.1, 0.24, r2) : mix(0.06, 0.16, r2);
  float R = sp == 0 ? 0.035 : sp == 1 ? 0.017 : sp == 2 ? 0.024 : 0.022;
  float big = clamp(d / 14.0, 1.0, 2.2); R *= big; Hs *= mix(1.0, 1.25, big - 1.0);
  Hs *= smoothstep(uLayer.y, uLayer.y * 0.8, d);
  float g = gustAt(S.p.xz), wAmt = uWind.z;
  float flut = sin(uTime * (2.0 + 2.0 * r3) + r3 * 6.28) * 0.08 * (0.3 + g);
  vec2 hoff = vec2(cos(r4 * 6.28), sin(r4 * 6.28)) * 0.12 + uWind.xy * (wAmt * (0.15 + 0.8 * g) + flut * wAmt);
  vec3 fl = flatAt(S.p.xz); hoff = mix(hoff, fl.xy * 2.4, fl.z);
  float hl = length(hoff), a = min(hl, 1.4); vec2 hd = hl > 1e-4 ? hoff / hl : vec2(1.0, 0.0);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 tip = S.p + vec3(hd.x * sin(a), cos(a), hd.y * sin(a)) * Hs, mid = S.p + up * Hs * 0.6;
  vec3 fcol = sp == 0 ? FL_POPPY : sp == 1 ? FL_LUPINE : sp == 2 ? FL_YELLOW : FL_WHITE;
  fcol *= 0.85 + 0.3 * r3;
  if (position.z < 0.5) {                               // stem
    float t = position.y, side = position.x;
    vec3 tg = normalize(bezT(S.p, mid, tip, max(t, 0.02)) + 1e-5);
    vec3 sd = normalize(cross(tg, vec3(0.3, 0.0, 1.0)));
    P = bez(S.p, mid, tip, t) + sd * side * 0.004 * big;
    N = normalize(mix(cross(sd, tg), S.n, 0.4));
    vec3 col = vec3(0.07, 0.16, 0.03) * mix(0.35, 1.0, t);
    if (sp == 1 && t > 0.6) col = mix(col, vec3(0.1, 0.2, 0.05), 0.5);
    vGC = col; vCov = vec4(t, 0.5, side, t);
  } else {                                               // head: centre + 2 rings of 6
    float ring = position.x, ang = position.y * 6.2831853 + r4 * 3.0;
    vec2 rc = vec2(cos(ang), sin(ang));
    vec3 c0, c1, c2;   // (radius, height) of centre, ring1, ring2 in head units
    if (sp == 0) { c0 = vec3(0.0, 0.0, 0.0); c1 = vec3(0.55, 0.4, 0.0); c2 = vec3(1.15, 1.05, 0.0); }
    // lupine: a slender spindle-shaped raceme (~16 x 2 cm), widest a third of the way up, whorls of florets in the fragment
    else if (sp == 1) { float wob = 0.9 + 0.2 * hash12(vec2(position.y * 7.0, r4 * 13.0)); c0 = vec3(0.0, 9.5, 0.0); c1 = vec3(0.62 * wob, 3.4, 0.0); c2 = vec3(0.4 * wob, 0.0, 0.0); }
    else if (sp == 2) { c0 = vec3(0.0, 0.35, 0.0); c1 = vec3(0.6, 0.3, 0.0); c2 = vec3(1.15, 0.1, 0.0); }
    else { c0 = vec3(0.0, 0.2, 0.0); c1 = vec3(0.3, 0.18, 0.0); c2 = vec3(1.2, 0.05, 0.0); }
    vec3 cr = ring < 0.5 ? c0 : ring < 1.5 ? c1 : c2;
    P = tip + vec3(rc.x * cr.x, cr.y, rc.y * cr.x) * R;
    N = normalize(vec3(rc.x * cr.x, sp == 1 ? 0.25 : 0.8, rc.y * cr.x));
    vec3 col = fcol;
    if (ring < 0.5) col = sp == 0 ? vec3(0.9, 0.55, 0.05) : sp == 3 ? vec3(0.9, 0.7, 0.05) : sp == 1 ? vec3(0.52, 0.42, 0.84) : fcol * 0.8;   // lupine: paler buds at the tip
    vGC = col; vCov = vec4(1.0, sp == 1 ? 0.45 : 0.85, sp == 1 ? 2.0 : 0.0, sp == 1 ? cr.y / 9.5 : 1.0);   // z = 2: lupine spike, w = height up it
  }
  vGC *= 1.0 - 0.25 * uWind.w;
}`;

BODY.fern = /* glsl */`
attribute vec2 aTpl;   // frond u (-1..1), v (0 base .. 1 tip)
void coverMain(out vec3 P, out vec3 N, out bool kill) {
  Site S = site();
  if (!S.ok || S.cls != 7 || S.d >= uLayer.y) { kill = true; P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); vGC = vec3(0.0); vCov = vec4(0.0); return; }
  uint s = S.s;
  float r1 = rnd(s), r2 = rnd(s), r3 = rnd(s);
  float d = S.d;
  float patchN = fbm(S.p.xz * 0.05 + 5.0);
  float dens = S.cls == 7 ? smoothstep(0.22, 0.45, patchN) : 0.0;
  kill = !S.ok || S.rank >= dens * uDensMul || d < uLayer.x || d >= uLayer.y;
  float sc = mix(0.55, 1.15, r1) * smoothstep(uLayer.y, uLayer.y * 0.8, d);
  float yaw = r2 * 6.2831853; float cy = cos(yaw), sy = sin(yaw);
  vec3 lp = position * sc;
  float g = gustAt(S.p.xz);
  float v = aTpl.y;
  vec3 wv = vec3(uWind.x, 0.0, uWind.y) * uWind.z * (0.08 + 0.18 * g) * v * v * sc;
  wv.y -= 0.04 * v * v * sin(uTime * 2.3 + r3 * 6.28 + v * 2.0) * (0.3 + g);
  P = S.p + vec3(cy * lp.x - sy * lp.z, lp.y, sy * lp.x + cy * lp.z) + wv;
  vec3 nn = normal; N = normalize(mix(vec3(cy * nn.x - sy * nn.z, nn.y, sy * nn.x + cy * nn.z), vec3(0.0, 1.0, 0.0), 0.3));
  vec3 col = mix(vec3(0.03, 0.1, 0.018), vec3(0.09, 0.2, 0.035), v) * (0.8 + 0.4 * r3);
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.5, v));
  vGC = col * (1.0 - 0.25 * uWind.w); vCov = vec4(v, 0.7, aTpl.x, v);
}`;

BODY.shrub = /* glsl */`
attribute vec2 aTpl;   // leaf-card corner (-1..1)
void coverMain(out vec3 P, out vec3 N, out bool kill) {
  Site S = site();
  uint s = S.s;
  float r1 = rnd(s), r2 = rnd(s), r3 = rnd(s);
  int c = S.cls; float d = S.d;
  if (!S.ok || S.rank * 0.7 >= (c == 8 ? 1.0 : c == 7 ? 0.45 : c == 4 ? 0.12 : c == 3 ? 0.08 : 0.0) * uDensMul || d >= uLayer.y) { kill = true; P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); vGC = vec3(0.0); vCov = vec4(0.0); return; }
  float patchN = fbm(S.p.xz * 0.04 + 23.0);
  float dry = dryness(S.bio, fbm(S.p.xz * 0.03 + 11.0), S.p.xz);
  float dens = c == 8 ? 1.0 : c == 7 ? 0.45 : c == 4 ? 0.12 : c == 3 ? 0.08 * dry : 0.0;
  dens *= smoothstep(0.25, 0.6, patchN) * 1.6;
  // keep the whole bush off roads / walls
  float rad = mix(0.35, 1.15, r1 * r1);
  bool clear = blockedAt(S.p.xz + vec2(rad, 0.0)) < 0.01 && blockedAt(S.p.xz - vec2(rad, 0.0)) < 0.01 && blockedAt(S.p.xz + vec2(0.0, rad)) < 0.01 && blockedAt(S.p.xz - vec2(0.0, rad)) < 0.01;
  kill = !S.ok || !clear || S.rank >= dens * uDensMul || d < uLayer.x || d >= uLayer.y;
  rad *= smoothstep(uLayer.y, uLayer.y * 0.8, d);
  float yaw = r2 * 6.2831853; float cy = cos(yaw), sy = sin(yaw);
  vec3 lp = position * vec3(rad, rad * 0.75, rad);
  float g = gustAt(S.p.xz);
  float hgt = max(position.y, 0.0);
  vec3 wv = vec3(uWind.x, 0.0, uWind.y) * uWind.z * (0.03 + 0.08 * g) * hgt * rad + vec3(0.0, 0.015, 0.0) * sin(uTime * 3.0 + dot(position, vec3(7.0))) * hgt;
  P = S.p + vec3(cy * lp.x - sy * lp.z, lp.y + rad * 0.3, sy * lp.x + cy * lp.z) + wv;
  vec3 nn = normal; N = normalize(vec3(cy * nn.x - sy * nn.z, nn.y + 0.3, sy * nn.x + cy * nn.z));
  vec3 col = mix(vec3(0.03, 0.08, 0.02), vec3(0.08, 0.1, 0.035), dry);
  if (r3 > 0.7 && c != 7) col = vec3(0.1, 0.12, 0.07);   // sage
  col *= mix(0.35, 1.05, clamp(length(position) * 0.9 + position.y * 0.3, 0.0, 1.0)) * (0.85 + 0.3 * r3);
  vGC = col * (1.0 - 0.25 * uWind.w); vCov = vec4(1.0, 0.45, aTpl.x, aTpl.y);
}`;

BODY.rock = /* glsl */`
void coverMain(out vec3 P, out vec3 N, out bool kill) {
  Site S = site();
  uint s = S.s;
  float r1 = rnd(s), r2 = rnd(s), r3 = rnd(s), r4 = rnd(s), r5 = rnd(s);
  int c = S.cls; float d = S.d;
  if (!S.ok || c == 0 || c == 1 || c == 2 || c == 9 || d >= uLayer.y) { kill = true; P = vec3(0.0); N = vec3(0.0, 1.0, 0.0); vGC = vec3(0.0); vCov = vec4(0.0); return; }
  float sl = S.bio.b * 1.5;
  float dens = smoothstep(0.4, 0.85, sl) * 0.9 + (c == 6 ? 1.0 : 0.0) + (c == 8 || c == 3 ? 0.05 : 0.0) + (c == 7 ? 0.1 : 0.0) + (c == 4 ? 0.03 : 0.0) + (c == 5 ? 0.08 : 0.0);
  if (c == 0 || c == 1 || c == 2 || c == 9) dens = 0.0;
  dens *= 0.3 + 1.4 * fbm(S.p.xz * 0.05 + 3.0);
  float sz = 0.22 + 1.7 * pow(r1, 3.0);
  bool clear = blockedAt(S.p.xz + vec2(sz, 0.0)) < 0.01 && blockedAt(S.p.xz - vec2(sz, 0.0)) < 0.01 && blockedAt(S.p.xz + vec2(0.0, sz)) < 0.01 && blockedAt(S.p.xz - vec2(0.0, sz)) < 0.01;
  kill = !S.ok || !clear || S.rank >= dens || d < uLayer.x || d >= uLayer.y;
  vec3 sc = sz * vec3(mix(0.8, 1.3, r2), mix(0.45, 0.85, r3), mix(0.8, 1.3, r4));
  sc *= smoothstep(uLayer.y, uLayer.y * 0.85, d);
  float yaw = r5 * 6.2831853; float cy = cos(yaw), sy = sin(yaw);
  vec3 lp = position * sc;
  // lean with the slope a little
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), S.n, 0.6));
  vec3 ax = normalize(cross(up, vec3(sy, 0.0, cy))); vec3 az = cross(ax, up);
  P = S.p + ax * (cy * lp.x - sy * lp.z) + up * (lp.y - sc.y * 0.35) + az * (sy * lp.x + cy * lp.z);
  vec3 nl = normal / sc; vec3 nr = vec3(cy * nl.x - sy * nl.z, nl.y, sy * nl.x + cy * nl.z);
  N = normalize(ax * nr.x + up * nr.y + az * nr.z);
  vec3 col = mix(vec3(0.62, 0.58, 0.52), vec3(0.78, 0.7, 0.58), r2);
  if (c == 7) col = mix(col, vec3(0.22, 0.3, 0.12), smoothstep(0.3, 0.9, N.y) * 0.7);   // moss on forest rocks
  vGC = col; vCov = vec4(1.0, 0.0, 0.0, 0.0);
}`;

// ------------------------------------------------------------------ fragment
export const COMMON_F = /* glsl */`
uniform float uNight;
varying vec3 vGC;
varying vec4 vCov;
`;
export const TRANSLUCENT_F = /* glsl */`
void RE_Direct_Cover(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float back = pow(saturate(dot(-geometryViewDir, directLight.direction)), 3.0);
  float thru = saturate(-dot(geometryNormal, directLight.direction));
  reflectedLight.directDiffuse += material.diffuseColor * directLight.color * vCov.y * (0.45 * thru + 1.5 * back) * (0.35 + 0.65 * vCov.x) * (1.0 - 0.7 * uNight);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Cover
`;
export const ALPHA_F = {
  fern: /* glsl */`
  { float au = abs(vCov.z), v = vCov.w;
    float env = sin(3.14159 * pow(clamp(v, 0.0, 1.0), 0.75));
    float q = fract(v * 15.0 + au * 1.3);
    bool leaf = au < env * 0.98 && q < 0.8 - 0.35 * au / max(env, 0.05);
    if (!(leaf || au < 0.06)) discard; }`,
  shrub: /* glsl */`
  { vec2 q = vCov.zw; float a = 0.0;
    const vec2 C[5] = vec2[5](vec2(0.0, 0.1), vec2(-0.5, -0.35), vec2(0.5, -0.3), vec2(-0.4, 0.55), vec2(0.42, 0.5));
    for (int k = 0; k < 5; k++) { vec2 dq = q - C[k]; float an = float(k) * 1.3; dq = mat2(cos(an), -sin(an), sin(an), cos(an)) * dq; a = max(a, 1.0 - dot(dq * vec2(1.0, 2.0), dq * vec2(1.0, 2.0)) / 0.2); }
    if (a <= 0.0) discard; }`,
};

// flower heads (fragment, after diffuseColor *= vGC): lupine spikes = whorls of small pea flowers (bright florets, dark gaps
// between the whorls, a pale banner fleck on each), smaller and closer toward the tip
export const FLOWER_F = /* glsl */`
  if (vCov.z > 1.5) {
    float h = clamp(vCov.w, 0.0, 1.0), q = h * (9.0 + 5.0 * h), wh = fract(q);
    float fl = smoothstep(0.0, 0.3, wh) * smoothstep(1.0, 0.62, wh);
    diffuseColor.rgb *= mix(0.42, 1.12, fl);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.92), 0.25 * smoothstep(0.55, 0.75, wh) * smoothstep(0.95, 0.75, wh) * (1.0 - h));
  }`;
