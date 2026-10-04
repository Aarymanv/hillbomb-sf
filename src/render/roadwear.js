// Road surface wear, painted in the asphalt shader (makeRoadMaterial in terrainmat.js):
//   tyre-polished wheel tracks + lighter lane centres + oil drips, rectangular repairs + utility trenches, crack
//   networks (alligator cracking in the wheel paths) + tar-sealed crack snakes, oil under parking stalls and at stop
//   lines, manholes / utility vaults / valve covers, concrete gutter pans, and aged lane paint (from aRoad / aLanes).
// Street ribbons of the 1:1 map carry road coordinates (HB_ROADCOORD: aRoad, aLanes, aSpan, see world/v2/roadmesh.js);
// junction polygons and the old map fall back to world-space variation. HB_ROADPAINT paints the lane lines.
// Sidewalks (HB_CURBPAINT) get SF painted curbs (red / yellow / white / green / blue zones).

export const ROAD_VERT_PARS = `
#ifdef HB_ROADCOORD
attribute vec4 aRoad; attribute vec4 aLanes; attribute vec4 aSpan;
varying vec4 vRoad; varying vec4 vLanes; varying vec4 vSpan;
#endif`;
export const ROAD_VERT = `
#ifdef HB_ROADCOORD
vRoad = aRoad; vLanes = aLanes; vSpan = aSpan;
#endif`;

export const ROAD_FRAG_PARS = `
#ifdef HB_ROADCOORD
varying vec4 vRoad; varying vec4 vLanes; varying vec4 vSpan;
#endif
// HB_GUTTER (gutter streams / satin damp asphalt in render/fog.js) is defined HERE, next to the variable it gates, never in
// material.defines: a define that lives in material.defines survives any copy of the defines (ShaderMaterial.copy,
// {...m.defines} spreads, program-cache reuse keyed on defines) while the onBeforeCompile code that declares hbGutter
// does not -> 'hbGutter: undeclared identifier'. Text-injected define + declaration can never be separated.
#define HB_GUTTER
float hbGutter = 0.0;
float rdRough = 0.5, rdRoughK = 0.0, rdRoughAdd = 0.0, rdFlat = 0.0, rdMetal = 0.0, rdH = 0.0;
float rH1(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 rH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float rN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rH1(i), rH1(i + vec2(1.0, 0.0)), f.x), mix(rH1(i + vec2(0.0, 1.0)), rH1(i + vec2(1.0, 1.0)), f.x), f.y); }
float rF(vec2 p) { return rN(p) * 0.5 + rN(p * 2.03 + 5.1) * 0.3 + rN(p * 4.1 + 1.7) * 0.2; }
bool rBit(float f, float b) { return mod(floor(f / b + 0.001), 2.0) > 0.5; }
// box-filtered band |d| < w (anti-aliased, energy conserving when the band is thinner than a pixel)
float rBandAA(float d, float w, float aa) { aa = max(aa, 1e-5); return clamp((min(d + aa * 0.5, w) - max(d - aa * 0.5, -w)) / aa, 0.0, 1.0); }
float rBand(float d, float w) { return rBandAA(d, w, fwidth(d)); }
float rFill(float sd) { return clamp(0.5 - sd / max(fwidth(sd), 1e-5), 0.0, 1.0); }
float rRect(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// distance-ish to the nearest Voronoi border (F2 - F1)
float rVoro(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); float d = length(g + rH2(i + g) * 0.8 + 0.1 - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}`;

// runs after <color_fragment>: diffuseColor = asphalt photo x tint x vertex colour
export const ROAD_FRAG = `
{
  vec3 P = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  float camD = length(vViewPosition);
  float nearK = 1.0 - smoothstep(25.0, 90.0, camD);      // fine detail (cracks, chips) fades out to its average
  float bumpK = 1.0 - smoothstep(15.0, 60.0, camD);
  float det = 1.0;
  #ifdef USE_MAP
  {
    // anti-tiling: a second, rotated + rescaled read of the asphalt photo swapped in by a low-frequency mask, and the
    // aggregate's salt-and-pepper contrast calmed (the photo read as a tiled sticker at a car's eye height)
    vec3 t1 = texture2D(map, vMapUv).rgb;
    vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.73 + vec2(0.37, 0.11);
    vec3 t2 = texture2D(map, uv2).rgb;
    float av = max(dot(textureLod(map, vec2(0.5), 12.0).rgb, vec3(0.3, 0.59, 0.11)), 0.02);
    float bl = smoothstep(0.3, 0.7, rN(P.xz * 0.045 + 3.0));
    vec3 tt = mix(t1, t2, bl);
    float l1 = max(dot(t1, vec3(0.3, 0.59, 0.11)), 0.02), lt = dot(tt, vec3(0.3, 0.59, 0.11));
    // (road 2) the aggregate reads near the car (92 % of the photo's grain contrast), calmed with distance (62 %)
    float nearG = 1.0 - smoothstep(6.0, 45.0, camD);
    float lc = mix(av, lt, mix(0.62, 0.92, nearG));
    diffuseColor.rgb *= clamp(lc / l1, 0.35, 2.5) * mix(vec3(1.0), tt / max(vec3(lt), 0.02), 0.5);
    det = clamp(lc / av, 0.5, 1.7);
    // detail relief at close range: a 4.7x finer, rotated read of the photo as a height (stones stand proud of the binder)
    float dl = dot(texture2D(map, mat2(0.6, 0.8, -0.8, 0.6) * vMapUv * 4.7 + 0.31).rgb, vec3(0.3, 0.59, 0.11));
    rdH += (dl / av - 1.0) * 0.0016 * (1.0 - smoothstep(3.0, 14.0, camD));
  }
  #endif
  // (road 2) warm neutral binder (the sky fill turned the neutral photo blue-grey in shade)
  diffuseColor.rgb *= vec3(1.1, 1.0, 0.84);
  vec3 alb = diffuseColor.rgb;
  float fl = 0.0, hw = 0.0, isJ = 1.0;
  vec2 q = P.xz;                                            // (lateral, along) on a street ribbon, world xz elsewhere
  float seed = rH1(floor(P.xz / 61.0));
  #ifdef HB_ROADCOORD
  fl = floor(vRoad.w + 0.5); hw = vRoad.z;
  if (!rBit(fl, 32.0)) { isJ = 0.0; q = vRoad.xy; seed = vSpan.z; }
  #endif
  float asph = rBit(fl, 4.0) ? 0.0 : 1.0;                   // brick (Lombard) keeps its own look
  bool hwy = rBit(fl, 2.0), alley = rBit(fl, 64.0);
  // macro variation: long streaks along the street, blotches elsewhere
  float mac = isJ > 0.5 ? rF(P.xz * 0.06) : rF(vec2(q.x * 0.35, q.y * 0.03) + seed * 31.0);
  alb *= mix(1.0, 0.86 + 0.28 * mac, asph);
  // (road 2) resurfacing age per block: fresh overlays dark and warm-black, old ones grey and faded; plus a slow
  // hillside-scale mottle (both break the 7 m photo repeat and the 'one flat colour' look of a whole street)
  {
    float ageB = isJ > 0.5 ? rN(P.xz * 0.009 + 5.0) : fract(seed * 13.7 + 0.21);
    vec3 ageC = mix(vec3(0.8, 0.79, 0.77), vec3(1.14, 1.13, 1.1), ageB);
    float slow = 0.9 + 0.2 * rF(P.xz * 0.013 + 17.0);
    alb = mix(alb, alb * ageC * slow, asph);
  }
  float tr = 0.0, inLane = 0.0, u = 9.0, gut = 0.0;
  #ifdef HB_ROADCOORD
  float x = vRoad.x, s = vRoad.y, ax = abs(x);
  float lanes = max(vLanes.x, 1.0), lw = max(vLanes.y, 2.4), med = vLanes.z, pw = vLanes.w;
  bool two = rBit(fl, 1.0);
  float G0 = min(0.8, hw * 0.12);
  float gw = (hwy || alley || asph < 0.5) ? 0.0 : min(0.6, hw * 0.12);
  if (isJ < 0.5 && asph > 0.5) {
    // the ribbon's vertex colour darkens the outer strip as a fake gutter: undo it, a real gutter pan is painted below
    alb /= mix(1.0, 0.62, clamp((ax - (hw - G0)) / max(G0, 0.01), 0.0, 1.0));
    // wheel tracks: two tyre paths per lane (+-0.82 m), polished dark rubber, the lane centre lighter between them
    float wob = 0.14 * sin(s * 0.019 + seed * 40.0) + 0.06 * sin(s * 0.071 + seed * 11.0);
    float r = two ? (ax - med) / lw : (x + lanes * lw * 0.5) / lw;
    if (r > 0.0 && r < lanes) { inLane = 1.0; u = (fract(r) - 0.5) * lw + wob; }
    tr = inLane * (1.0 - smoothstep(0.1, 0.42, abs(abs(u) - 0.82))) * (0.7 + 0.3 * rN(vec2(s * 0.08, x * 0.5)));
    // real SF asphalt: the tyre paths are worn lighter (binder gone, aggregate polished), the lane centre carries a dark
    // oil band from dripping engines (streaky, heavier near junctions where cars idle)
    float ctr = inLane * (1.0 - smoothstep(0.2, 0.62, abs(u)));
    float oil = ctr * (0.55 + 0.45 * rN(vec2(s * 0.11, x * 1.3 + seed * 20.0))) * (0.7 + 0.3 * rN(vec2(s * 0.9, x * 4.0)));
    alb *= (1.0 + 0.14 * tr) * (1.0 - 0.3 * oil);
    float drip = ctr * (1.0 - smoothstep(0.04, 0.22, abs(u - 0.3 * (rN(vec2(s * 0.7, 3.0)) - 0.5)))) * smoothstep(0.5, 0.85, rN(vec2(s * 0.45, seed * 50.0)));
    alb *= 1.0 - 0.3 * drip;
    rdRoughAdd -= 0.08 * oil;
    rdRoughAdd -= 0.1 * tr + 0.15 * drip;
    rdFlat += 0.45 * tr;
    rdH -= 0.006 * tr;
    // rain collects in the ruts
    hbGutter = max(hbGutter, tr * smoothstep(0.5, 0.75, rN(vec2(s * 0.06, x * 0.4 + 7.0))) * 0.85);
    // parking lanes: dusty, no polish, an oil stain under most stalls (every 6.2 m)
    if (pw > 0.0 && ax > hw - pw && ax < hw - gw) {
      alb *= 1.05;
      float sl = s / 6.2, hh = rH1(vec2(floor(sl), seed * 91.0 + sign(x)));
      vec2 d = vec2((ax - (hw - pw * 0.55)) / 0.5, (fract(sl) - 0.42 - 0.12 * hh) * 6.2 / 0.85);
      float st = (1.0 - smoothstep(0.3, 1.0, length(d) + (rN(q * 3.1) - 0.5) * 0.7)) * step(0.3, hh) * (0.45 + 0.55 * hh);
      alb *= 1.0 - 0.5 * st; rdRoughAdd -= 0.35 * st;
    }
    // queues at stop signs / signals: drips under the first two cars + braking rubber on the approach lanes
    float ds = 1e4;
    if (rBit(vSpan.w, 1.0) && two && x < 0.0) ds = s - vSpan.x;
    if (rBit(vSpan.w, 2.0) && (!two || x > 0.0)) ds = min(ds, vSpan.y - s);
    if (ds < 16.0 && inLane > 0.5) {
      float k = floor((ds - 0.8) / 6.4), lo = mod(ds - 0.8, 6.4) - 2.3;
      float bl = (1.0 - smoothstep(0.3, 1.0, length(vec2(u / 0.55, lo / 1.3)) + (rN(q * 2.7) - 0.5) * 0.6)) * (k < 0.5 ? 1.0 : 0.55) * step(0.8, ds);
      alb *= (1.0 - 0.45 * bl) * (1.0 - 0.14 * tr * (1.0 - smoothstep(4.0, 16.0, ds)));
      rdRoughAdd -= 0.3 * bl;
    }
  }
  #endif
  // ---- brick paving (Lombard's crooked block): running bond 20 x 10 cm, mortar joints, fired-clay colour spread
  if (asph < 0.5) {
    vec2 bq = q / vec2(0.2, 0.1);
    bq.x += step(1.0, mod(floor(bq.y), 2.0)) * 0.5;
    vec2 bi = floor(bq), bf = fract(bq);
    float ed = min(min(bf.x, 1.0 - bf.x) * 0.2, min(bf.y, 1.0 - bf.y) * 0.1);
    float mort = (1.0 - smoothstep(0.005, 0.005 + fwidth(q.y) * 0.8 + 0.002, ed)) * nearK + 0.22 * (1.0 - nearK);
    float h = rH1(bi + seed * 13.0);
    vec3 brick = mix(vec3(0.43, 0.19, 0.13), vec3(0.52, 0.28, 0.2), h) * (0.8 + 0.25 * rH1(bi + 7.0)) * mix(1.0, 0.72, step(0.93, h));
    brick *= 0.85 + 0.3 * rN(q * 0.6 + seed);
    alb = mix(brick, vec3(0.3, 0.28, 0.26), mort) * (0.8 + 0.2 * det);
    rdRough = mix(0.75, 0.9, mort); rdRoughK = 1.0; rdFlat += 0.3;
    rdH -= 0.004 * mort;
  }
  // ---- repairs: rectangular patches (one candidate per cell) + long utility trenches
  {
    vec2 cs = isJ > 0.5 ? vec2(5.0) : vec2(3.6, 7.0);
    vec2 ci = floor(q / cs);
    vec2 hsz = cs * mix(vec2(0.14), vec2(0.42), rH2(ci + 3.1 + seed));
    vec2 cc = (ci + 0.5) * cs + (rH2(ci + 7.7 + seed) - 0.5) * (cs - 2.0 * hsz);
    float sd = rRect(q, cc, hsz);
    float on = step(rH1(ci + seed * 17.0), 0.14) * asph;
    float fresh = step(rH1(ci + 5.5 + seed), 0.5);
    #ifdef HB_ROADCOORD
    float tc = floor(q.y / 45.0), t0 = (tc + 0.05 + 0.3 * rH1(vec2(tc, seed * 5.0 + 1.0))) * 45.0, tl = 8.0 + 24.0 * rH1(vec2(tc, seed * 5.0 + 2.0));
    float sdT = rRect(q, vec2((rH1(vec2(tc, seed * 5.0 + 3.0)) - 0.5) * hw * 1.3, t0 + tl * 0.5), vec2(0.34, tl * 0.5));
    float onT = step(rH1(vec2(tc, seed * 13.0)), 0.3) * (1.0 - isJ) * asph;
    if (onT * rFill(sdT) > on * rFill(sd)) { sd = sdT; on = onT; fresh = step(0.4, rH1(vec2(tc, seed + 9.0))); }
    #endif
    float pf = rFill(sd) * on;
    alb = mix(alb, alb * mix(1.2, 0.68, fresh), pf);
    rdRoughAdd += pf * mix(0.05, -0.1, fresh); rdFlat += pf * 0.35 * fresh;
    rdH += pf * 0.003 * (fresh * 2.0 - 1.0);
    float seam = rBand(sd, 0.03) * on;
    alb = mix(alb, vec3(0.03), seam * 0.8 * (0.5 + 0.5 * nearK)); rdRoughAdd += 0.1 * seam;
  }
  // ---- cracks: alligator network (mostly in the wheel paths) + long block cracks
  {
    vec2 wq = q + vec2(rN(q * 1.7 + 3.0), rN(q * 1.7 + 9.0)) * 0.35;    // warp: no regular cell shapes
    float m1 = smoothstep(0.62, 0.8, rF(q * vec2(0.4, 0.13) + seed * 23.0));
    m1 = max(m1, tr * smoothstep(0.5, 0.7, rN(q * 0.21 + 4.0)));
    float crk = rBand(rVoro(wq * 2.6 + seed * 5.0), 0.02) * m1;
    float m2 = smoothstep(0.62, 0.8, rN(q * 0.07 + seed * 7.0 + 2.0));
    crk = max(crk, rBand(rVoro(wq * 0.3 + seed * 3.0), 0.007) * m2);
    crk *= asph;
    alb *= 1.0 - (0.45 * nearK + 0.1 * (1.0 - nearK)) * crk;
    rdRoughAdd += 0.2 * crk; rdH -= 0.003 * crk;
  }
  // ---- crack sealant ("tar snakes"): wavy glossy black lines, transverse cracks, the centre joint
  {
    // isoline of a noise field, widened by its true gradient so the line is ~3 cm everywhere
    vec2 sk = isJ > 0.5 ? vec2(0.35) : vec2(0.55, 0.16), sq = q * sk + seed * 9.0 + 40.0;
    float sn = rN(sq), gx = (rN(sq + vec2(0.01, 0.0)) - sn) * 100.0 * sk.x, gy = (rN(sq + vec2(0.0, 0.01)) - sn) * 100.0 * sk.y;
    float sdm = (sn - 0.5) / max(length(vec2(gx, gy)), 0.05);
    float snake = rBand(sdm, 0.016) * smoothstep(0.55, 0.7, rN(q * 0.045 + seed * 3.0 + 11.0));
    #ifdef HB_ROADCOORD
    float tc = floor(q.y / 11.0);
    float tp = (tc + 0.2 + 0.6 * rH1(vec2(tc, seed * 7.0))) * 11.0 + 0.35 * sin(q.x * 1.3 + tc);
    float cx = (rH1(vec2(tc, seed * 7.0 + 4.0)) - 0.5) * hw, ex = hw * mix(0.25, 1.0, rH1(vec2(tc, seed + 6.0)));
    float trans = rBand(q.y - tp, 0.022) * step(rH1(vec2(tc, seed * 3.0 + 1.0)), 0.4) * step(abs(q.x - cx), ex);
    float joint = rBand(q.x - 0.28 - 0.06 * sin(q.y * 0.21), 0.02) * step(rN(vec2(q.y * 0.03, seed * 9.0)), 0.5);
    snake = max(snake, (1.0 - isJ) * max(trans, joint));
    #endif
    snake *= asph * (1.0 - smoothstep(60.0, 220.0, camD));
    alb = mix(alb, vec3(0.022, 0.021, 0.02), snake * 0.9);
    rdRough = mix(rdRough, 0.42, snake); rdRoughK = max(rdRoughK, snake); rdFlat += snake; rdH += 0.0015 * snake;
  }
  // ---- random oil stains (more in junctions / on the old map than along the lanes)
  {
    vec2 oc = floor(q / 3.5);
    vec2 op = (oc + 0.25 + 0.5 * rH2(oc + 1.3 + seed)) * 3.5;
    float ob = (1.0 - smoothstep(0.2, 1.0, length((q - op) / vec2(0.55, 0.75)) + (rN(q * 2.3) - 0.5) * 0.8)) * step(rH1(oc + seed * 5.0 + 60.0), isJ > 0.5 ? 0.1 : 0.035) * asph;
    alb *= 1.0 - 0.45 * ob; rdRoughAdd -= 0.35 * ob;
  }
  // ---- lane paint (worn, chipped, dirty): the geometry lane lines are off when the shader paints them
  #if defined( HB_ROADCOORD ) && defined( HB_ROADPAINT )
  if (isJ < 0.5 && asph > 0.5 && !alley) {
    float aaS = fwidth(s);
    float live = step(vSpan.x + 1.5, s) * step(s, vSpan.y - 1.5);
    float dash = rBandAA(mod(s, 9.0) - 1.5, 1.5, aaS);
    float wP = 0.0, yP = 0.0, green = 0.0;
    float W = lanes * lw;
    if (two) {
      if (hw >= 3.5) yP += rBand(x - 0.13, 0.05) + rBand(x + 0.13, 0.05);
      for (int l = 1; l < 4; l++) { if (float(l) >= lanes) break; float o = med + float(l) * lw; wP += (rBand(x - o, 0.055) + rBand(x + o, 0.055)) * dash; }
      if (hwy) wP += rBand(ax - (hw - 0.45), 0.07);
    } else {
      for (int l = 1; l < 6; l++) { if (float(l) >= lanes) break; wP += rBand(x + W * 0.5 - float(l) * lw, 0.055) * dash; }
      if (hwy) { yP += rBand(x + W * 0.5 + 0.1, 0.065); wP += rBand(x - W * 0.5 - 0.1, 0.07); }
    }
    // bike lanes: solid edge line, green conflict zones near the junctions
    if (rBit(fl, 256.0)) {
      float te = two ? med + W : W * 0.5, pe = hw - pw - gw;
      if (pe - te > 1.1) {
        wP += rBand(ax - te, 0.08);
        float conflict = 1.0 - smoothstep(16.0, 20.0, min(s - vSpan.x, vSpan.y - s));
        green = step(te + 0.1, ax) * step(ax, pe) * (rBit(fl, 512.0) ? 1.0 : conflict);
      }
    }
    // metered stalls (some arterials): T marks every 6.1 m
    if (pw > 0.0 && rBit(fl, 128.0) && seed < 0.6) {
      float sm = mod(s, 6.1) - 3.05, pe = hw - pw;
      wP += rBandAA(sm, 0.05, aaS) * step(pe, ax) * step(ax, pe + 0.6) + rBand(ax - pe, 0.05) * step(abs(sm), 0.35);
    }
    float age = 0.55 + 0.45 * fract(seed * 7.3);
    // (road 2) chips fade by pixel footprint too (cycles per pixel), not only distance: at grazing angles the 9 / m chip
    // noise aliased into shimmer on the lane lines well inside 45 m
    float chipFw = max(fwidth(x) * 9.0, fwidth(s) * 3.0);
    float chip = mix(0.72, smoothstep(0.26, 0.34, rF(vec2(x * 9.0, s * 3.0) + seed * 17.0)), (1.0 - smoothstep(12.0, 45.0, camD)) * (1.0 - smoothstep(0.2, 0.5, chipFw)));
    float scuff = 1.0 - 0.45 * smoothstep(0.4, 0.8, rN(vec2(x * 1.5, s * 0.4) + seed * 3.0));
    float tyre = 1.0 - 0.55 * tr;                           // paint wears off where the tyres roll
    float kW = clamp(wP, 0.0, 1.0) * live * age * chip * scuff * tyre, kY = clamp(yP, 0.0, 1.0) * live * age * chip * scuff * tyre;
    float tone = 0.85 + 0.15 * det;
    alb = mix(alb, vec3(0.74, 0.74, 0.7) * tone, kW);
    alb = mix(alb, vec3(0.78, 0.5, 0.07) * tone, kY);
    alb = mix(alb, vec3(0.1, 0.3, 0.12) * tone, green * 0.85 * age * mix(1.0, chip, 0.6));
    float kP = max(max(kW, kY), green * 0.85);
    rdRough = mix(rdRough, 0.55, kP); rdRoughK = max(rdRoughK, kP); rdFlat += 0.6 * kP; rdH += 0.0012 * kP;
  }
  #endif
  // ---- gutter pan: concrete strip at the curb, expansion joints every 3 m, grime and leaves toward the curb
  #ifdef HB_ROADCOORD
  if (isJ < 0.5 && gw > 0.0) {
    gut = clamp((ax - (hw - gw)) / max(fwidth(ax), 1e-4) + 0.5, 0.0, 1.0);
    vec3 cc = vec3(0.42, 0.41, 0.385) * mix(1.0, det, 0.5) * (0.85 + 0.3 * rN(q * vec2(2.0, 0.5)));
    float grime = smoothstep(hw - 0.25, hw, ax) * 0.5 + smoothstep(0.55, 0.85, rF(q * vec2(3.0, 0.7) + 13.0)) * 0.45;
    cc *= 1.0 - grime * 0.55;
    float joint = rBandAA(mod(s, 3.0) - 1.5, 0.008, fwidth(s)) * gut;
    float lip = rBand(ax - (hw - gw), 0.016);
    alb = mix(alb, cc, gut);
    alb *= 1.0 - 0.6 * max(joint, lip) * (0.4 + 0.6 * nearK);
    rdRough = mix(rdRough, 0.85, gut); rdRoughK = max(rdRoughK, gut); rdFlat += 0.4 * gut;
    hbGutter = max(hbGutter, smoothstep(hw - 0.5, hw - 0.08, ax));
    float sdn = x > 0.0 ? 1.0 : -1.0, hdr = fract(seed * 23.7 + sdn * 0.31);
    if (hdr <= 0.8 && vSpan.y - vSpan.x >= 20.0) {
      vec2 dd = vec2(ax - (hw - 0.4), s - (hdr < 0.4 ? vSpan.x + 3.0 : vSpan.y - 3.0));
      float gsd = rRect(dd, vec2(0.0), vec2(0.33, 0.5));
      float gIn = rFill(gsd + 0.045), gFr = rFill(gsd) - gIn;
      float bars = mix(0.45, step(0.42, fract(dd.x * 11.0)), 1.0 - smoothstep(8.0, 25.0, camD));
      vec3 iron = vec3(0.075, 0.07, 0.065) * (0.8 + 0.4 * rN(q * 7.0));
      alb = mix(alb, mix(vec3(0.004), iron * 1.6, bars), gIn);
      alb = mix(alb, iron * 1.3, gFr);
      alb *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.35, gsd)) * (1.0 - rFill(gsd));      // silt stain around it
      rdRough = mix(rdRough, 0.5, gIn + gFr); rdRoughK = max(rdRoughK, gIn + gFr); rdMetal = max(rdMetal, (gIn * bars + gFr) * 0.5); rdFlat += gIn + gFr;
      rdH -= 0.012 * gIn * (1.0 - bars);
      hbGutter = max(hbGutter, (1.0 - smoothstep(0.0, 0.8, gsd)) * 0.9);
    }
  }
  #endif
  // ---- covers: sewer manholes (round cast iron), utility vaults (diamond plate in a concrete frame), water valves
  {
    vec2 mc; float mon, typ; vec2 mcen;
    #ifdef HB_ROADCOORD
    if (isJ < 0.5) {
      float c = floor(q.y / 26.0); mc = vec2(c, seed * 37.0);
      float t = rH1(mc + 5.0), sd = rH1(mc + 8.0) < 0.5 ? -1.0 : 1.0;
      typ = rH1(mc + 9.0);
      float lat = t < 0.4 ? (two ? 0.0 : (rH1(mc + 2.0) - 0.5) * lw) : t < 0.75 ? sd * (two ? med + 0.5 * lw : 0.3 * lw) : sd * (hw - max(pw, 1.4) * 0.5);
      if (typ > 0.65) lat = sd * (hw - gw - 0.75);                 // vaults / valves sit by the curb
      mcen = vec2(lat, (c + 0.2 + 0.6 * rH1(mc + 1.0)) * 26.0);
      mon = step(rH1(mc), 0.6) * step(1.2, hw);
    } else
    #endif
    {
      vec2 c = floor(q / 7.0); mc = c + seed;
      mcen = (c + 0.2 + 0.6 * rH2(c + 1.7)) * 7.0; typ = rH1(mc + 9.0) * 0.6;
      mon = step(rH1(mc + 3.3), 0.14);
    }
    mon *= asph;
    vec2 dm = q - mcen;
    vec3 iron = vec3(0.07, 0.066, 0.062) * (0.8 + 0.4 * rN(q * 9.0));
    iron = mix(iron, vec3(0.2, 0.1, 0.045), smoothstep(0.6, 0.9, rN(q * 5.0 + seed * 3.0)) * 0.5);
    float patK = 1.0 - smoothstep(8.0, 30.0, camD);
    float disc = 0.0, frame = 0.0, pat = 0.5, settle = 0.0, conc = 0.0;
    if (typ < 0.65) {
      float r = length(dm), R = 0.34;
      disc = rFill(r - R); frame = rFill(r - R - 0.05) - disc;
      settle = (1.0 - smoothstep(R + 0.05, R + 0.5, r)) * (1.0 - disc - frame);
      float rings = smoothstep(-0.3, 0.3, sin(r * 69.0)) * step(0.13, r);
      vec2 gq = dm * 55.0; float grid = smoothstep(-0.25, 0.25, sin(gq.x) * sin(gq.y)) * (1.0 - step(0.13, r));
      pat = mix(0.5, max(rings, grid) * step(r, R - 0.035), patK);
    } else if (typ < 0.85) {
      vec2 hs = vec2(0.45, 0.72);
      float sd = rRect(dm, vec2(0.0), hs);
      float inner = rFill(sd + 0.07); conc = rFill(sd) - inner; disc = inner;
      vec2 dq = (dm * 16.0); float dp = abs(fract(dq.x + dq.y) - 0.5) + abs(fract(dq.x - dq.y) - 0.5);
      pat = mix(0.5, smoothstep(0.35, 0.45, dp), patK);
      settle = (1.0 - smoothstep(0.0, 0.3, sd)) * (1.0 - rFill(sd));
    } else {
      float r = min(length(dm - vec2(0.0, 0.3)), length(dm + vec2(0.0, 0.3)));
      disc = rFill(r - 0.1); frame = rFill(r - 0.13) - disc; pat = mix(0.5, step(0.05, r), patK);
    }
    disc *= mon; frame *= mon; settle *= mon; conc *= mon;
    alb *= 1.0 - 0.18 * settle;
    alb = mix(alb, mix(iron * 0.6, iron * 1.9, pat), disc);
    alb = mix(alb, iron * 1.4, frame);
    alb = mix(alb, vec3(0.36, 0.35, 0.33) * det, conc);
    float met = disc + frame;
    rdRough = mix(rdRough, mix(0.62, 0.34, pat), met); rdRough = mix(rdRough, 0.8, conc);
    rdRoughK = max(rdRoughK, met + conc); rdMetal = max(rdMetal, met * 0.55); rdFlat += met + conc;
    rdH += disc * 0.004 * pat + frame * 0.002 - settle * 0.012;
  }
  rdH *= bumpK;
  diffuseColor.rgb = alb;
}`;

export const ROAD_ROUGH = `
roughnessFactor = clamp(roughnessFactor + 0.3, 0.0, 0.95);      // (road 2) dry asphalt ~0.8 (the photo map averages 0.52)
roughnessFactor = clamp(roughnessFactor + rdRoughAdd, 0.05, 1.0);
roughnessFactor = mix(roughnessFactor, rdRough, clamp(rdRoughK, 0.0, 1.0));`;
export const ROAD_METAL = `metalnessFactor = max(metalnessFactor, rdMetal);`;
// flatten the aggregate normal where the surface is paint / polish / metal, then bump from rdH (m) via derivatives
export const ROAD_NORMAL = `
normal = normalize(mix(normal, nonPerturbedNormal, clamp(rdFlat, 0.0, 1.0)));
{
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
  float hx = dFdx(rdH), hy = dFdy(rdH);
  vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
  float dt = dot(sX, R1);
  vec3 gr = sign(dt) * (hx * R1 + hy * R2);
  normal = normalize(abs(dt) * normal - gr);
}
// (road 2) street canyon: a grazing reflection off the dry road sees facades and cars, not the open sky (fog.js resets
// this when wet, with its own horizon term)
#ifdef HB_FOG_PARS
{
  vec3 rr = reflect(normalize(-vViewPosition), normal);
  hbSpecOcc = mix(0.4, 1.0, smoothstep(0.02, 0.45, (vec4(rr, 0.0) * viewMatrix).y));
}
#endif`;

// ---------------------------------------------------------------------------------------------- painted curbs
export const CURB_VERT_PARS = `attribute vec4 aCurb; attribute float aCurbD; attribute vec4 aCurbZ; attribute float aCurbDr;
varying vec4 vCurb; varying float vCurbD; varying vec4 vCurbZ; varying float vCurbDr;`;
export const CURB_VERT = `vCurb = aCurb; vCurbD = aCurbD; vCurbZ = aCurbZ; vCurbDr = aCurbDr;`;
export const CURB_FRAG_PARS = `varying vec4 vCurb; varying float vCurbD; varying vec4 vCurbZ; varying float vCurbDr; float curbK = 0.0;
// SF curb colours (faded) by the rules, from the per-side plan in world/v2/roadmesh.js curbPlan (the same hashes the street
// props use to place hydrants and bus stops): red = no stopping (daylighting at junction corners, +-2.8 m at hydrants, bus
// zones), yellow = commercial loading, white = passenger loading, blue = disabled, green = short-term; grey otherwise.
// c = (s, red-corner s0 | -1e4, red-corner s1 | 1e4, side * (1 + seed) | 10 + hash at corners), z = (hydrant s, hydrant s,
// bus stop s, floor(zone start) + type / 10), -1 = none
vec4 hbCurbPaint(vec4 c, vec4 z) {
  vec3 RED = vec3(0.5, 0.07, 0.05);
  float code = c.w;
  if (code > 9.5) return vec4(RED, step(code - 10.0, 0.85));
  if (abs(code) < 0.5) return vec4(0.0);
  float s = c.x;
  if (s - c.y < 6.0 || c.z - s < 6.0) return vec4(RED, 1.0);
  if ((z.x >= 0.0 && abs(s - z.x) < 2.8) || (z.y >= 0.0 && abs(s - z.y) < 2.8)) return vec4(RED, 1.0);
  if (z.z >= 0.0 && s > z.z - 14.0 && s < z.z + 10.0) return vec4(RED, 1.0);
  if (z.w >= 0.0) {
    float st = floor(z.w), ty = floor(fract(z.w) * 10.0 + 0.5);
    float zl = ty < 1.5 ? 12.0 : ty < 2.5 ? 7.0 : ty < 3.5 ? 6.5 : 7.0;
    if (s > st && s < st + zl) return vec4(ty < 1.5 ? vec3(0.72, 0.52, 0.06) : ty < 2.5 ? vec3(0.78, 0.78, 0.75) : ty < 3.5 ? vec3(0.06, 0.16, 0.5) : vec3(0.08, 0.34, 0.14), 1.0);
  }
  return vec4(0.0);
}`;
export const CURB_FRAG = `
{
  vec4 cp = hbCurbPaint(vCurb, vCurbZ);
  float on = cp.a * (1.0 - step(0.16, vCurbD));
  float chip = smoothstep(0.25, 0.4, fract(sin(dot(floor(vSW.xz * 14.0 + vSW.y * 9.0), vec2(12.9898, 78.233))) * 43758.5453));
  on *= mix(0.72, 1.0, chip) * (1.0 - 0.25 * smoothstep(20.0, 60.0, length(vSW - cameraPosition)));
  diffuseColor.rgb = mix(diffuseColor.rgb, cp.rgb * (0.75 + 0.25 * diffuseColor.g), on);
  curbK = on;
  // storm drain curb inlet (catch basin): a dark mouth in the curb face with a steel lip, above the gutter grate
  if (vCurbDr >= 0.0 && vCurbD < -0.5 && abs(vCurb.x - vCurbDr) < 0.55) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), 0.92); curbK = 1.0;
  }
}`;

// ---------------------------------------------------------------------------------------------- marking geometry wear
export const MARK_FRAG_PARS = `float mkRough = 0.0;
float mH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float mN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mH(i), mH(i + vec2(1.0, 0.0)), f.x), mix(mH(i + vec2(0.0, 1.0)), mH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
export const MARK_FRAG = `
{
  vec3 P = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  float camD = length(vViewPosition);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float paint = smoothstep(0.42, 0.52, lum);
  // (road 2) fine chips fade by pixel footprint as well as distance (31 / m noise shimmered on crosswalks at grazing angles)
  float nearK = (1.0 - smoothstep(12.0, 45.0, camD)) * (1.0 - smoothstep(0.012, 0.035, length(fwidth(P.xz))));
  // chips (fine, fade to their average far away), scrubbed patches, grime
  // (kept small: big dark blotches read as a cow pattern, not as worn thermoplastic)
  float chip = mix(0.04, smoothstep(0.72, 0.86, mN(P.xz * 14.0) * 0.6 + mN(P.xz * 31.0 + 3.1) * 0.4), nearK);
  float scrub = smoothstep(0.6, 0.95, mN(P.xz * 0.9 + 11.0) * 0.7 + mN(P.xz * 3.3) * 0.3) * 0.3;
  float wear = clamp(max(chip * 0.7, scrub), 0.0, 0.7);
  vec3 asph = vec3(0.1, 0.1, 0.097) * (0.8 + 0.4 * mN(P.xz * 3.0));
  float grime = 0.84 + 0.16 * mN(P.xz * 1.4 + 5.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, grime, paint), asph, paint * wear);
  mkRough = paint * wear * 0.28;
}`;
