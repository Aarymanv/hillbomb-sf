// GPU-generated, tileable PBR surface layers for the facades (brick, stucco, siding, stone, concrete, ...).
// Two WebGLArrayRenderTargets: ALB (rgb = sRGB albedo, a = roughness) and NRM (rg = tangent normal xy, b = AO, a = mask).
// Generated once with the game's renderer (from update(), outside any render pass); until then 1x1 placeholders are bound.
import * as THREE from 'three';
import { LAYER_COUNT, TILE, L, PHOTO } from './layers.js';
import { PBR } from '../assets.js';
import { currentQuality } from '../../game/quality.js';

// relief depth (m) of each layer's height map, used to scale the normals
const DEPTH = [0.008, 0.005, 0.0025, 0.018, 0.012, 0.012, 0.008, 0.003, 0.012, 0.002, 0.012, 0.012, 0.012, 0.03, 0.002, 0.002, 0.006, 0.01, 0.008, 0.03, 0.004, 0.002, 0.008, 0.005];

const N = currentQuality().facadeRes || 1024;   // (perf 9/30: 512 on the low preset, game/quality.js) facade layer resolution. 2048 (full-res 2K scans) was measured 9/28: +~2 ms GPU at 1080p and +800 MB VRAM, only sharper within ~2 m

const FRAG = /* glsl */`
precision highp float;
precision highp int;
uniform int uPass;
uniform float uTexel;   // metres per texel of this layer
in vec2 vUv;
out vec4 fragColor;

struct Surf { vec3 col; float rough; float h; float ao; float mask; float depth; };

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(mod(i, per)), b = hash12(mod(i + vec2(1.0, 0.0), per)), c = hash12(mod(i + vec2(0.0, 1.0), per)), d = hash12(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 uv, vec2 f0, int oct){
  float s = 0.0, a = 0.5, n = 0.0; vec2 per = f0;
  for (int i = 0; i < 7; i++) { if (i >= oct) break; s += a * vnoise(uv * per, per); n += a; a *= 0.5; per *= 2.0; }
  return s / n;
}
// periodic voronoi: x = F1 distance, y = cell hash, z = F2 - F1 (edge distance)
vec3 voro(vec2 uv, float per){
  vec2 p = uv * per; vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 c = mod(i + g, per); vec2 o = hash22(c) * 0.85 + 0.075; vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(c + 17.0); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), id, sqrt(d2) - sqrt(d1));
}
float grey(float v){ return v; }
#define rgb(r, g, b) (vec3(float(r), float(g), float(b)) / 255.0)

// ---------------------------------------------------------------- masonry (running bond)
Surf masonry(vec2 uv, float rows, float cols, float mx, float my, float bevelW, int variant){
  Surf s;
  float y = uv.y * rows; float row = floor(y); float fy = fract(y);
  float x = uv.x * cols + (mod(row, 2.0) < 0.5 ? 0.0 : 0.5); float col = mod(floor(x), cols); float fx = fract(x);
  vec2 bidv = vec2(col, row);
  float bid = hash12(bidv), bid2 = hash12(bidv + 7.3), bid3 = hash12(bidv + 13.1);
  float ex = min(fx, 1.0 - fx) / mx, ey = min(fy, 1.0 - fy) / my;
  float e = min(ex, ey);
  // slightly irregular brick edges
  float jag = vnoise(uv * vec2(rows * 6.0), vec2(rows * 6.0)) * 0.6;
  float face = smoothstep(0.55, 1.0, e - jag * 0.4);
  float bevel = smoothstep(0.6, 1.0 + bevelW, e);
  float n1 = fbm(uv, vec2(8.0), 5);
  float n2 = vnoise(uv * vec2(320.0), vec2(320.0));
  float pit = step(0.93, vnoise(uv * vec2(180.0), vec2(180.0)));
  s.h = mix(0.12 + 0.12 * n2, 0.72 + 0.22 * bevel + 0.07 * (n1 - 0.5) + 0.05 * (n2 - 0.5) - 0.12 * pit, face);
  vec3 bc, mc;
  if (variant == 0) {        // red brick
    bc = mix(rgb(142, 58, 40), rgb(176, 88, 60), bid);
    if (bid2 > 0.84) bc = mix(bc, rgb(96, 42, 34), 0.75);
    if (bid2 < 0.07) bc = mix(bc, rgb(190, 128, 92), 0.6);
    bc *= 0.86 + 0.28 * n1 + 0.06 * (n2 - 0.5);
    bc = mix(bc, bc * vec3(0.8, 0.84, 0.9), smoothstep(0.55, 0.75, fbm(uv + 0.3, vec2(3.0), 3)) * 0.6); // soot
    mc = rgb(168, 160, 146) * (0.86 + 0.2 * n2);
    s.rough = mix(0.95, 0.84, face);
  } else if (variant == 1) { // painted brick (neutral, tinted)
    bc = vec3(0.9) * (0.95 + 0.06 * bid + 0.05 * (n1 - 0.5));
    mc = vec3(0.8) * (0.95 + 0.06 * n2);
    s.rough = mix(0.8, 0.66, face);
  } else if (variant == 2) { // dark glazed/brown brick
    bc = mix(rgb(92, 60, 48), rgb(122, 84, 64), bid);
    if (bid2 > 0.8) bc = mix(bc, rgb(70, 48, 44), 0.7);
    bc *= 0.88 + 0.24 * n1;
    mc = rgb(150, 142, 130) * (0.86 + 0.2 * n2);
    s.rough = mix(0.95, 0.7, face);
  } else if (variant == 3) { // ashlar stone
    bc = mix(rgb(196, 186, 164), rgb(214, 204, 184), bid) * (0.9 + 0.14 * n1 + 0.05 * (n2 - 0.5));
    bc = mix(bc, bc * 0.82, smoothstep(0.55, 0.8, fbm(uv + 0.7, vec2(4.0), 4)) * 0.7);
    mc = rgb(150, 142, 128);
    s.rough = 0.82;
  } else if (variant == 4) { // granite (polished, speckled)
    vec2 q = floor(uv * 300.0); float r = hash12(q), r2 = hash12(q + 5.0);
    bc = r < 0.35 ? rgb(34, 33, 36) : r < 0.7 ? rgb(88, 86, 92) : r < 0.9 ? rgb(128, 104, 100) : rgb(170, 168, 168);
    bc = mix(bc, rgb(70, 68, 72), 0.35 + 0.2 * r2);
    mc = rgb(40, 40, 42);
    s.rough = mix(0.7, 0.22, face);
  } else {                   // rusticated limestone base
    bc = mix(rgb(188, 178, 158), rgb(204, 194, 174), bid) * (0.9 + 0.14 * n1);
    mc = rgb(120, 114, 102);
    s.rough = 0.85;
  }
  s.col = mix(mc, bc, face);
  s.ao = mix(0.55 + 0.2 * n2, 1.0, smoothstep(0.3, 1.2, e));
  s.mask = 0.0;
  return s;
}

Surf stucco(vec2 uv){
  Surf s;
  float big = fbm(uv, vec2(3.0), 5), mid = fbm(uv + 0.37, vec2(24.0), 4), fine = vnoise(uv * vec2(400.0), vec2(400.0));
  float trowel = sin((uv.x * 11.0 + big * 9.0) * 6.2831) * 0.5 + 0.5;
  s.h = 0.5 + 0.28 * (mid - 0.5) + 0.22 * (fine - 0.5) + 0.06 * trowel;
  s.col = vec3(0.9) * (0.94 + 0.08 * (big - 0.5) + 0.05 * (mid - 0.5) + 0.04 * (fine - 0.5));
  s.rough = 0.9; s.ao = 0.92 + 0.08 * fine; s.mask = 0.0;
  return s;
}

Surf siding(vec2 uv){
  Surf s;
  float boards = 16.0; float y = uv.y * boards; float row = floor(y); float fy = fract(y);
  float grain = vnoise(uv * vec2(6.0, 512.0), vec2(6.0, 512.0));
  float jx = hash12(vec2(row, 3.0));
  float jd = abs(fract(uv.x * 2.0 + jx) - 0.5);
  float joint = 1.0 - smoothstep(0.004, 0.009, jd);
  s.h = 0.95 - 0.55 * fy - 0.25 * joint + 0.02 * (grain - 0.5);
  s.ao = mix(1.0, 0.55, smoothstep(0.82, 1.0, fy)) * (1.0 - 0.3 * joint);
  s.col = vec3(0.9) * (0.96 + 0.05 * (grain - 0.5) + 0.03 * hash12(vec2(row, floor(uv.x * 2.0 + jx))));
  s.rough = 0.55; s.mask = 0.0;
  return s;
}

Surf shingle(vec2 uv){
  Surf s;
  float rows = 8.0, cols = 8.0;
  float y = uv.y * rows; float row = floor(y); float fy = fract(y);
  float x = uv.x * cols + (mod(row, 2.0) < 0.5 ? 0.0 : 0.5); float fx = fract(x);
  float d = length(vec2(fx - 0.5, (fy - 0.62) * 1.1));
  bool own = fy > 0.62 || d < 0.5;
  float edge = own ? smoothstep(0.5, 0.42, fy > 0.62 ? abs(fx - 0.5) * 0.0 + 0.0 : d) : 0.0;
  float g = vnoise(uv * vec2(40.0, 400.0), vec2(40.0, 400.0));
  s.h = own ? 0.55 + 0.4 * (1.0 - fy) : 0.3 + 0.3 * fy;
  s.ao = own ? mix(0.7, 1.0, smoothstep(0.62, 0.9, fy) + (1.0 - smoothstep(0.35, 0.5, d))) : 0.5;
  s.ao = clamp(s.ao, 0.45, 1.0);
  float sid = hash12(vec2(floor(x), row));
  s.col = vec3(0.9) * (0.93 + 0.08 * sid + 0.04 * (g - 0.5));
  s.rough = 0.65; s.mask = 0.0;
  return s;
}

Surf concrete(vec2 uv){
  Surf s;
  float px = uv.x * 3.0, py = uv.y * 6.0; vec2 f = fract(vec2(px, py));
  float seam = 1.0 - smoothstep(0.0, 0.012, min(min(f.x, 1.0 - f.x) * 1.33 / 2.0, min(f.y, 1.0 - f.y) * 0.67 / 2.0) * 3.0);
  vec2 th = abs(f - vec2(0.25, 0.5)); vec2 th2 = abs(f - vec2(0.75, 0.5));
  float tie = 1.0 - smoothstep(0.012, 0.02, min(length(th * vec2(1.33, 0.67)), length(th2 * vec2(1.33, 0.67))));
  float big = fbm(uv, vec2(4.0), 5), fine = vnoise(uv * vec2(300.0), vec2(300.0)), pit = step(0.9, vnoise(uv * vec2(150.0), vec2(150.0)));
  s.h = 0.6 - 0.3 * seam - 0.4 * tie + 0.08 * (fine - 0.5) - 0.08 * pit;
  s.col = rgb(160, 158, 152) * (0.9 + 0.16 * (big - 0.5) + 0.06 * (fine - 0.5)) * (1.0 - 0.25 * tie);
  s.col = mix(s.col, s.col * 0.8, smoothstep(0.58, 0.75, fbm(uv * vec2(1.0, 1.0) + 0.5, vec2(6.0, 2.0), 4)));
  s.rough = 0.9; s.ao = 1.0 - 0.35 * seam - 0.5 * tie; s.mask = 0.0;
  return s;
}

Surf gravel(vec2 uv){
  Surf s;
  vec3 v = voro(uv, 110.0);
  float stone = smoothstep(0.02, 0.12, v.z);
  float tar = smoothstep(0.55, 0.7, fbm(uv, vec2(5.0), 4));
  s.h = stone * (0.6 + 0.4 * (1.0 - v.x));
  s.col = mix(rgb(52, 50, 50), rgb(100, 98, 94) + (v.y - 0.5) * 0.18, stone);
  s.col = mix(s.col, rgb(46, 45, 46), tar * 0.8);
  s.rough = 0.95; s.ao = mix(0.6, 1.0, stone); s.mask = 0.0;
  return s;
}

Surf trim(vec2 uv){
  Surf s;
  float b = vnoise(uv * vec2(10.0, 200.0), vec2(10.0, 200.0)), f = vnoise(uv * vec2(256.0), vec2(256.0));
  s.h = 0.5 + 0.03 * (b - 0.5) + 0.02 * (f - 0.5);
  s.col = vec3(0.92) * (0.98 + 0.03 * (b - 0.5));
  s.rough = 0.5; s.ao = 1.0; s.mask = 0.0;
  return s;
}

Surf corrugated(vec2 uv){
  Surf s;
  float w = sin(uv.x * 32.0 * 6.28318);
  float rust = smoothstep(0.55, 0.8, fbm(uv, vec2(24.0, 2.0), 5));
  float dirt = fbm(uv, vec2(3.0), 4);
  s.h = 0.5 + 0.5 * w;
  s.col = mix(vec3(0.78) * (0.9 + 0.2 * dirt), rgb(130, 82, 52), rust * 0.7);
  s.rough = mix(0.42, 0.85, rust); s.ao = 0.75 + 0.25 * (0.5 + 0.5 * w); s.mask = rust;
  return s;
}

Surf garage(vec2 uv){
  Surf s;
  float sec = uv.y * 4.0; float fy = fract(sec); float fx = fract(uv.x * 4.0);
  float seam = 1.0 - smoothstep(0.0, 0.03, min(fy, 1.0 - fy));
  vec2 pp = vec2(fx, fy);
  vec2 dd = min(pp - vec2(0.1, 0.18), vec2(0.9, 0.82) - pp);
  float inPanel = smoothstep(0.0, 0.03, min(dd.x, dd.y));
  float n = fbm(uv, vec2(6.0), 4);
  s.h = 0.7 - 0.25 * inPanel + 0.15 * smoothstep(0.03, 0.08, min(dd.x, dd.y)) - 0.5 * seam;
  s.col = vec3(0.9) * (0.95 + 0.06 * (n - 0.5)) * (1.0 - 0.3 * seam);
  s.rough = 0.55; s.ao = 1.0 - 0.5 * seam - 0.15 * (inPanel - smoothstep(0.03, 0.08, min(dd.x, dd.y))); s.mask = 0.0;
  return s;
}

float panelField(vec2 p, vec2 lo, vec2 hi, float bev, out float raised){
  vec2 d = min(p - lo, hi - p); float m = min(d.x, d.y);
  raised = smoothstep(0.0, bev, m);
  return step(0.0, m);
}
Surf door(vec2 uv){
  Surf s;
  float r1, r2, r3, r4, r5, r6;
  float a = panelField(uv, vec2(0.14, 0.06), vec2(0.46, 0.3), 0.04, r1) + panelField(uv, vec2(0.54, 0.06), vec2(0.86, 0.3), 0.04, r2)
          + panelField(uv, vec2(0.14, 0.36), vec2(0.46, 0.72), 0.04, r3) + panelField(uv, vec2(0.54, 0.36), vec2(0.86, 0.72), 0.04, r4);
  float glass = panelField(uv, vec2(0.14, 0.78), vec2(0.86, 0.94), 0.01, r5);
  float r = r1 + r2 + r3 + r4;
  float grain = vnoise(uv * vec2(8.0, 120.0), vec2(8.0, 120.0));
  s.h = 0.8 - 0.25 * a + 0.2 * r - 0.3 * glass;
  s.col = vec3(0.88) * (0.96 + 0.05 * (grain - 0.5));
  s.col = mix(s.col, rgb(30, 34, 40), glass);
  s.rough = mix(0.45, 0.1, glass); s.ao = 1.0 - 0.3 * (a - r) * 0.5; s.mask = glass;
  return s;
}

Surf claytile(vec2 uv){
  Surf s;
  float cx = uv.x * 5.0, cy = uv.y * 3.0; float fx = fract(cx), fy = fract(cy);
  float tid = hash12(vec2(floor(cx), floor(cy)));
  float barrel = sin(fx * 3.14159);
  float lip = smoothstep(0.0, 0.1, fy);
  s.h = barrel * 0.8 * (0.6 + 0.4 * (1.0 - fy)) * lip;
  s.col = mix(rgb(150, 70, 44), rgb(196, 108, 70), tid) * (0.75 + 0.3 * barrel) * (0.9 + 0.2 * fbm(uv, vec2(8.0), 4));
  s.rough = 0.7; s.ao = mix(0.45, 1.0, barrel) * mix(0.6, 1.0, lip); s.mask = 0.0;
  return s;
}

Surf awning(vec2 uv){
  Surf s;
  float stripe = step(0.5, fract(uv.x * 3.0));
  float weave = (sin(uv.x * 900.0) * sin(uv.y * 900.0)) * 0.5 + 0.5;
  float n = fbm(uv, vec2(4.0), 3);
  s.h = 0.5 + 0.08 * weave;
  s.col = vec3(0.92) * (0.95 + 0.05 * weave + 0.05 * (n - 0.5));
  s.rough = 0.9; s.ao = 1.0; s.mask = stripe;
  return s;
}

Surf mosaic(vec2 uv){
  Surf s;
  vec2 g = uv * 12.0; vec2 f = fract(g); float tid = hash12(floor(g));
  float grout = 1.0 - smoothstep(0.03, 0.07, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  s.h = 0.7 - 0.5 * grout;
  s.col = mix(vec3(0.88) * (0.9 + 0.12 * tid), vec3(0.62), grout);
  s.rough = mix(0.22, 0.85, grout); s.ao = 1.0 - 0.4 * grout; s.mask = 0.0;
  return s;
}

Surf planks(vec2 uv){
  Surf s;
  float px = uv.x * 12.0; float pid = hash12(vec2(floor(px), 1.0)); float fx = fract(px);
  float gap = 1.0 - smoothstep(0.0, 0.04, min(fx, 1.0 - fx));
  float grain = vnoise(vec2(uv.x * 400.0, uv.y * 6.0 + pid * 7.0), vec2(400.0, 6.0));
  float rings = sin((uv.y * 20.0 + grain * 3.0 + pid * 10.0) * 6.28) * 0.5 + 0.5;
  s.h = 0.7 - 0.5 * gap + 0.05 * grain;
  s.col = mix(rgb(112, 74, 46), rgb(150, 104, 66), pid) * (0.85 + 0.15 * rings + 0.1 * grain) * (1.0 - 0.5 * gap);
  s.rough = 0.6; s.ao = 1.0 - 0.5 * gap; s.mask = 0.0;
  return s;
}

Surf roofShingle(vec2 uv){
  Surf s;
  float y = uv.y * 14.0; float row = floor(y); float fy = fract(y);
  float x = uv.x * 6.0 + hash12(vec2(row, 2.0)); float fx = fract(x);
  float slot = 1.0 - smoothstep(0.0, 0.02, min(fx, 1.0 - fx));
  float tid = hash12(vec2(floor(x), row));
  float gran = hash12(floor(uv * 512.0));
  s.h = 0.4 + 0.5 * (1.0 - fy) - 0.3 * slot * step(fy, 0.6);
  s.col = vec3(0.34) * (0.8 + 0.3 * tid) * (0.85 + 0.3 * gran);
  s.rough = 0.95; s.ao = mix(0.55, 1.0, smoothstep(0.0, 0.18, fy)) * (1.0 - 0.4 * slot * step(fy, 0.6)); s.mask = 0.0;
  return s;
}

Surf rollup(vec2 uv){
  Surf s;
  float y = uv.y * 25.0; float fy = fract(y);
  float prof = smoothstep(0.0, 0.25, fy) * smoothstep(1.0, 0.75, fy);
  float n = fbm(uv, vec2(6.0), 4), streak = fbm(uv, vec2(30.0, 2.0), 3);
  s.h = 0.3 + 0.6 * prof;
  s.col = vec3(0.74) * (0.85 + 0.2 * n) * (0.9 + 0.1 * streak);
  s.rough = 0.45; s.ao = 0.6 + 0.4 * prof; s.mask = 0.0;
  return s;
}

Surf metalPanel(vec2 uv){
  Surf s;
  vec2 g = uv * vec2(2.0, 4.0); vec2 f = fract(g);
  float seam = 1.0 - smoothstep(0.0, 0.01, min(min(f.x, 1.0 - f.x) * 0.5, min(f.y, 1.0 - f.y) * 0.25) * 4.0);
  float streak = fbm(uv, vec2(40.0, 1.0), 3), pid = hash12(floor(g));
  s.h = 0.6 - 0.4 * seam;
  s.col = vec3(0.72) * (0.92 + 0.08 * pid + 0.06 * (streak - 0.5));
  s.rough = 0.35 + 0.1 * pid; s.ao = 1.0 - 0.4 * seam; s.mask = 0.0;
  return s;
}

Surf marble(vec2 uv){
  Surf s;
  vec2 g = uv * 2.0; vec2 f = fract(g);
  float joint = 1.0 - smoothstep(0.0, 0.006, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float w = fbm(uv, vec2(3.0), 6);
  float vein = 1.0 - smoothstep(0.0, 0.06, abs(sin((uv.x * 2.0 + uv.y + w * 3.0) * 3.14159)));
  s.h = 0.6 - 0.3 * joint;
  s.col = mix(rgb(226, 222, 214), rgb(150, 146, 144), vein * 0.7) * (0.96 + 0.06 * hash12(floor(g)));
  s.rough = 0.15; s.ao = 1.0 - 0.3 * joint; s.mask = 0.0;
  return s;
}

Surf paving(vec2 uv){
  Surf s;
  vec2 g = uv * 2.0; vec2 f = fract(g);
  float seam = 1.0 - smoothstep(0.0, 0.012, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float fine = vnoise(uv * vec2(300.0), vec2(300.0)), big = fbm(uv, vec2(4.0), 4);
  s.h = 0.6 - 0.4 * seam + 0.05 * fine;
  s.col = rgb(176, 172, 164) * (0.9 + 0.12 * (big - 0.5) + 0.06 * (fine - 0.5)) * (1.0 - 0.35 * seam);
  s.rough = 0.85; s.ao = 1.0 - 0.4 * seam; s.mask = 0.0;
  return s;
}

Surf layer(vec2 uv){
  Surf s;
#if LAYER_ID == 0
  s = masonry(uv, 32.0, 11.0, 0.045, 0.14, 1.2, 0); s.depth = 0.008;
#elif LAYER_ID == 1
  s = masonry(uv, 32.0, 11.0, 0.04, 0.12, 1.0, 1); s.depth = 0.005;
#elif LAYER_ID == 2
  s = stucco(uv); s.depth = 0.0025;
#elif LAYER_ID == 3
  s = siding(uv); s.depth = 0.018;
#elif LAYER_ID == 4
  s = shingle(uv); s.depth = 0.012;
#elif LAYER_ID == 5
  s = masonry(uv, 8.0, 4.0, 0.012, 0.03, 3.0, 3); s.depth = 0.012;
#elif LAYER_ID == 6
  s = concrete(uv); s.depth = 0.008;
#elif LAYER_ID == 7
  s = masonry(uv, 3.0, 2.0, 0.003, 0.005, 1.0, 4); s.depth = 0.003;
#elif LAYER_ID == 8
  s = gravel(uv); s.depth = 0.012;
#elif LAYER_ID == 9
  s = trim(uv); s.depth = 0.002;
#elif LAYER_ID == 10
  s = corrugated(uv); s.depth = 0.012;
#elif LAYER_ID == 11
  s = garage(uv); s.depth = 0.012;
#elif LAYER_ID == 12
  s = door(uv); s.depth = 0.012;
#elif LAYER_ID == 13
  s = claytile(uv); s.depth = 0.03;
#elif LAYER_ID == 14
  s = awning(uv); s.depth = 0.002;
#elif LAYER_ID == 15
  s = mosaic(uv); s.depth = 0.002;
#elif LAYER_ID == 16
  s = planks(uv); s.depth = 0.006;
#elif LAYER_ID == 17
  s = roofShingle(uv); s.depth = 0.01;
#elif LAYER_ID == 18
  s = rollup(uv); s.depth = 0.008;
#elif LAYER_ID == 19
  s = masonry(uv, 6.0, 3.0, 0.02, 0.1, 2.0, 5); s.depth = 0.03;
#elif LAYER_ID == 20
  s = metalPanel(uv); s.depth = 0.004;
#elif LAYER_ID == 21
  s = marble(uv); s.depth = 0.002;
#elif LAYER_ID == 22
  s = masonry(uv, 32.0, 11.0, 0.045, 0.14, 1.2, 2); s.depth = 0.008;
#else
  s = paving(uv); s.depth = 0.005;
#endif
  return s;
}

void main(){
  Surf s = layer(vUv);
  if (uPass == 0) fragColor = vec4(clamp(s.col, 0.0, 1.0), clamp(s.rough, 0.04, 1.0));
  else fragColor = vec4(s.h, clamp(s.ao, 0.0, 1.0), clamp(s.mask, 0.0, 1.0), 1.0);
}`;

const NFRAG = /* glsl */`
precision highp float;
uniform highp sampler2D uH;
uniform float uScale;   // height depth / texel size
in vec2 vUv;
out vec4 fragColor;
float H(ivec2 p){ return texelFetch(uH, (p + ${N}) % ${N}, 0).r; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uH, p, 0);
  float hx = H(p + ivec2(1, 0)) - H(p - ivec2(1, 0));
  float hy = H(p + ivec2(0, 1)) - H(p - ivec2(0, 1));
  vec3 n = normalize(vec3(-hx * uScale * 0.5, -hy * uScale * 0.5, 1.0));
  fragColor = vec4(n.xy * 0.5 + 0.5, c.g, c.b);
}`;

const BFRAG = /* glsl */`
precision highp float;
uniform sampler2D uMap, uNrmT, uRough, uAO;
uniform int uPass;
uniform vec2 uScale;
uniform vec4 uNeutral;   // x: neutralise to grey, y: target mean (linear), z: contrast kept, w: has AO
uniform vec3 uMul;
in vec2 vUv;
out vec4 fragColor;
void main(){
  vec2 uv = vUv * uScale;
  if (uPass == 0) {
    vec3 c = texture(uMap, uv).rgb;
    if (uNeutral.x > 0.5) {
      vec3 avg = textureLod(uMap, vec2(0.5), 12.0).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), la = max(dot(avg, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
      c = vec3(uNeutral.y * mix(1.0, l / la, uNeutral.z));
    }
    c *= uMul;
    float r = texture(uRough, uv).g;
    fragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), clamp(r, 0.04, 1.0));
  } else {
    vec3 n = texture(uNrmT, uv).rgb * 2.0 - 1.0;
    float ao = uNeutral.w > 0.5 ? texture(uAO, uv).r : 1.0;
    fragColor = vec4(n.xy * 0.5 + 0.5, ao, 0.0);
  }
}`;

const VERT = /* glsl */`
in vec3 position;
out vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function makeRT() {
  const rt = new THREE.WebGLArrayRenderTarget(N, N, LAYER_COUNT, { depthBuffer: false });
  const t = rt.texture;
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return rt;
}
function placeholder(v) {
  const d = new Uint8Array(4 * LAYER_COUNT);
  for (let i = 0; i < LAYER_COUNT; i++) d.set(v, i * 4);
  const t = new THREE.DataArrayTexture(d, 1, 1, LAYER_COUNT);
  t.needsUpdate = true;
  return t;
}

export function createFacadeTextures() {
  const out = {
    alb: { value: placeholder([200, 200, 200, 220]) },
    nrm: { value: placeholder([128, 128, 255, 0]) },
    ready: false, state: 0, next: 0,
    // call every frame with the renderer; compiles asynchronously, then renders a few layers per call
    step(renderer, layersPerStep = 3) {
      if (out.ready) return true;
      if (out.state === 0) {
        out.t0 = performance.now();
        out.albRT = makeRT(); out.nrmRT = makeRT();
        out.hRT = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
        out.mats = [];
        out.scene = new THREE.Scene(); out.cam = new THREE.Camera();
        out.geo = new THREE.BufferGeometry();
        out.geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        for (let l = 0; l < LAYER_COUNT; l++) {
          const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, defines: { LAYER_ID: l },
            uniforms: { uPass: { value: 0 }, uTexel: { value: TILE[l] / N } }, depthTest: false, depthWrite: false });
          out.mats.push(m);
          const mesh = new THREE.Mesh(out.geo, m); mesh.frustumCulled = false; out.scene.add(mesh);
        }
        out.nmat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: NFRAG, uniforms: { uH: { value: out.hRT.texture }, uScale: { value: 1 } }, depthTest: false, depthWrite: false });
        out.bmat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: BFRAG, depthTest: false, depthWrite: false,
          uniforms: { uMap: { value: null }, uNrmT: { value: null }, uRough: { value: null }, uAO: { value: null }, uPass: { value: 0 }, uScale: { value: new THREE.Vector2(1, 1) }, uNeutral: { value: new THREE.Vector4() }, uMul: { value: new THREE.Vector3(1, 1, 1) } } });
        out.pending = PHOTO.filter(p => PBR.tex(p.key));
        const nm = new THREE.Mesh(out.geo, out.nmat); nm.frustumCulled = false; out.scene.add(nm);
        out.state = 1;
        const p = renderer.compileAsync ? renderer.compileAsync(out.scene, out.cam) : Promise.resolve();
        p.then(() => { out.state = 2; }, () => { out.state = 2; });
        return false;
      }
      if (out.state === 1) return false;
      // state 2: render layers
      const prevRT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
      const prevAuto = renderer.autoClear, prevXr = renderer.xr.enabled;
      renderer.autoClear = false; renderer.xr.enabled = false;
      if (out.next === 0) { renderer.initRenderTarget(out.albRT); renderer.initRenderTarget(out.nrmRT); }
      const scene1 = out.scene1 || (out.scene1 = new THREE.Scene());
      if (!out.m1) { out.m1 = new THREE.Mesh(out.geo, out.mats[0]); out.m1.frustumCulled = false; scene1.add(out.m1); }
      for (let k = 0; k < layersPerStep && out.next < LAYER_COUNT; k++) {
        const l = out.next++;
        const last = l === LAYER_COUNT - 1;
        const m = out.mats[l];
        out.m1.material = m;
        m.uniforms.uPass.value = 0;
        out.albRT.texture.generateMipmaps = last;
        renderer.setRenderTarget(out.albRT, l); renderer.render(scene1, out.cam);
        m.uniforms.uPass.value = 1;
        renderer.setRenderTarget(out.hRT); renderer.render(scene1, out.cam);
        out.m1.material = out.nmat;
        out.nmat.uniforms.uScale.value = DEPTH[l] / (TILE[l] / N);
        out.nrmRT.texture.generateMipmaps = last;
        renderer.setRenderTarget(out.nrmRT, l); renderer.render(scene1, out.cam);
      }
      renderer.setRenderTarget(prevRT, prevFace, prevMip);
      renderer.autoClear = prevAuto; renderer.xr.enabled = prevXr;
      if (out.next < LAYER_COUNT) return false;
      out.albRT.texture.generateMipmaps = true; out.nrmRT.texture.generateMipmaps = true;
      for (const m of out.mats) m.dispose();
      out.nmat.dispose(); out.hRT.dispose();
      const oldA = out.alb.value, oldN = out.nrm.value;
      out.alb.value = out.albRT.texture; out.nrm.value = out.nrmRT.texture;
      oldA.dispose(); oldN.dispose();
      out.mats = null; out.scene = null;
      out.genMs = performance.now() - out.t0;
      out.ready = true;
      out.state = 3;
      return true;
    },
    // photo pass: overwrite layers with the shared photo-scanned PBR maps as soon as their images are loaded
    photoStep(renderer) {
      if (out.state !== 3) return out.state > 3;
      const loaded = (t) => t && t.image && (t.image.width > 0 || t.image.naturalWidth > 0);
      const now = out.pending.filter(p => { const e = PBR.tex(p.key); return loaded(e.map) && loaded(e.normalMap) && loaded(e.roughnessMap); });
      if (!now.length) { if (!out.pending.length || performance.now() - out.t0 > 60000) out.state = 4; return out.state > 3; }
      // upload the photo's maps one texture per frame first (each is a 2K decode + upload)
      { const e0 = PBR.tex(now[0].key);
        for (const t of [e0.map, e0.normalMap, e0.roughnessMap, e0.aoMap]) if (t && !t.userData.hbInit) { renderer.initTexture(t); t.userData.hbInit = true; return false; } }
      const prevRT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
      const prevAuto = renderer.autoClear; renderer.autoClear = false;
      const bm = out.bmat, U = bm.uniforms;
      out.m1.material = bm;
      // one photo per frame: uploading every loaded 2K photo set (texImage/texSubImage) in one frame hitched 600+ ms;
      // the array mipmaps are regenerated only after the last photo that is ready so far
      const ready = now.length; now.length = 1;
      now.forEach((p) => {
        const e = PBR.tex(p.key);
        const img = e.map.image, asp = (img.width || img.naturalWidth) / (img.height || img.naturalHeight);
        U.uMap.value = e.map; U.uNrmT.value = e.normalMap; U.uRough.value = e.roughnessMap; U.uAO.value = e.aoMap || e.map;
        U.uScale.value.set(1, asp);
        U.uNeutral.value.set(p.neutral ? 1 : 0, p.mean ?? 0.7, p.contrast ?? 1, e.aoMap ? 1 : 0);
        U.uMul.value.set(...(p.mul || [1, 1, 1]));
        const last = ready === 1;
        U.uPass.value = 0; out.albRT.texture.generateMipmaps = last;
        renderer.setRenderTarget(out.albRT, p.layer); renderer.render(out.scene1, out.cam);
        U.uPass.value = 1; out.nrmRT.texture.generateMipmaps = last;
        renderer.setRenderTarget(out.nrmRT, p.layer); renderer.render(out.scene1, out.cam);
        out.pending.splice(out.pending.indexOf(p), 1);
      });
      renderer.setRenderTarget(prevRT, prevFace, prevMip); renderer.autoClear = prevAuto;
      out.albRT.texture.generateMipmaps = true; out.nrmRT.texture.generateMipmaps = true;
      out.photoLayers = (out.photoLayers || 0) + now.length;
      if (!out.pending.length) { out.state = 4; out.bmat.dispose(); out.geo.dispose(); out.scene1 = null; }
      return out.state > 3;
    },
  };
  return out;
}
