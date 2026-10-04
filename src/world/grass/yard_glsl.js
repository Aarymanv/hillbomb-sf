// Residential yard ground (surface class 9) as a lot patchwork instead of one green carpet. Shared by the terrain material
// (render/terrainmat.js: ground albedo) and the grass blades (grass/glsl.js: blade cover + colour), so blades only grow on
// the lawns the ground shows. Each yard point falls in a lot cell: on the 1:1 map the block's real lot frame from the
// biome window's lot texture (grass/capture.js + v2/lotframe.js: 25 ft lots, back-to-back at the block centre line),
// elsewhere a 7.6 x 15 m world grid. Per lot: watered lawn, dry / patchy lawn, bare dirt (darker leaf litter in shaded
// lots), concrete slabs, brick pavers, bark mulch, decomposed granite; about half the lots have a planting bed along the
// fences. Season: SF in October = the end of the dry season, so most lawns read golden-brown. ?noyardground = off (A/B).
export const NOYARDG = typeof location !== 'undefined' && /[?&]noyardground\b/.test(location.search || '');

export const YARD_GLSL = /* glsl */`
const float Y_LOTW = 7.62;
const float Y_SEASON = 0.75;   // 0 = wet-season green .. 1 = late dry season (SF fall: golden-brown)
const vec3 Y_AVG = vec3(0.23, 0.19, 0.12);   // mean yard colour (far: the lot pattern averages out instead of aliasing)
float yH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float yN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(yH(i), yH(i + vec2(1.0, 0.0)), f.x), mix(yH(i + vec2(0.0, 1.0)), yH(i + vec2(1.0, 1.0)), f.x), f.y); }
// lot cell of a yard point: x = ground type, y = distance to the nearest lot line (m), z = a second per-lot hash, w = 1 on a
// real lot frame. Types: 0 watered lawn, 1 dry lawn, 2 bare dirt, 3 concrete, 4 brick pavers, 5 bark mulch, 6 gravel / DG
vec4 yardCell(sampler2D L, vec4 xf, vec2 xz) {
  vec2 f = (xz - xf.xy) * xf.z * xf.w;
  vec4 F = vec4(0.0);
  if (f.x >= 0.0 && f.y >= 0.0 && f.x < xf.w && f.y < xf.w) F = texelFetch(L, ivec2(f), 0);
  vec2 id; float edge;
  if (F.w > 0.5) {
    vec2 t = vec2(cos(F.z), sin(F.z)), d = xz - F.xy;
    float u = dot(d, t), v = dot(d, vec2(-t.y, t.x));
    float li = floor(u / Y_LOTW), du = u - li * Y_LOTW;
    id = vec2(li * 1.37 + (v < 0.0 ? 0.61 : 0.0), 0.0) + floor(F.xy * 0.05);
    edge = min(min(du, Y_LOTW - du), abs(v));
  } else {
    float row = floor(xz.y / 15.0), x = xz.x + row * 3.1, col = floor(x / Y_LOTW);
    id = vec2(col, row * 1.91 + 400.0);
    edge = min(min(x - col * Y_LOTW, (col + 1.0) * Y_LOTW - x), min(xz.y - row * 15.0, (row + 1.0) * 15.0 - xz.y));
  }
  float h = yH(id * 0.731 + 17.3), h2 = yH(id * 1.177 + 3.9);
  // the mix drifts at neighbourhood scale (~300 m): some streets keep watered lawns, others are mostly paved or gone to seed
  float hood = yN(xz * 0.004 + 9.1);
  float w0 = 0.08 + 0.16 * hood, w1 = 0.3, w2 = 0.1, w3 = 0.12 + 0.1 * (1.0 - hood), w4 = 0.06, w5 = 0.12, w6 = 0.08;
  float r = h * (w0 + w1 + w2 + w3 + w4 + w5 + w6);
  float ty = r < w0 ? 0.0 : r < w0 + w1 ? 1.0 : r < w0 + w1 + w2 ? 2.0 : r < w0 + w1 + w2 + w3 ? 3.0 : r < w0 + w1 + w2 + w3 + w4 ? 4.0 : r < w0 + w1 + w2 + w3 + w4 + w5 ? 5.0 : 6.0;
  return vec4(ty, edge, h2, F.w);
}
// planting bed along the lot lines (fences) in about half the lots: width (m), 0 = none
float yardBed(vec4 c) { return c.z < 0.55 ? 0.55 + 0.4 * fract(c.z * 7.3) : 0.0; }
// lawn dryness 0 green .. 1 golden: dry spots in watered lawns, green survivors in dry ones
float yardLawnDry(vec4 c, vec2 xz) {
  float b = yN(xz * 0.35 + c.z * 13.0) * 0.6 + yN(xz * 1.1) * 0.4;
  return c.x < 0.5 ? clamp(0.06 + Y_SEASON * 0.22 + (b - 0.5) * 0.7, 0.0, 1.0) : clamp(0.48 + Y_SEASON * 0.36 + (b - 0.5) * 0.9 + (c.z - 0.5) * 0.3, 0.0, 1.0);
}
vec3 yardLawnCol(float dry, float n) {
  vec3 g = mix(vec3(0.05, 0.12, 0.025), vec3(0.085, 0.16, 0.035), n);
  vec3 o = mix(vec3(0.15, 0.15, 0.055), vec3(0.19, 0.18, 0.07), n);
  vec3 d = mix(vec3(0.3, 0.23, 0.1), vec3(0.43, 0.34, 0.17), n);
  return dry < 0.5 ? mix(g, o, dry * 2.0) : mix(o, d, dry * 2.0 - 1.0);
}
// blade cover of a yard cell 0..1: lawns full, dirt / gravel a few weeds, hard and mulched ground and fence beds none
float yardGrassK(vec4 c) {
  float k = c.x < 0.5 ? 1.0 : c.x < 1.5 ? 0.85 : c.x < 2.5 ? 0.12 : c.x > 5.5 ? 0.08 : 0.0;
  return c.y < yardBed(c) ? 0.0 : k;
}
// ground albedo of a yard point (before the photo detail). aa = world metres per pixel (fades sub-pixel patterns).
// hard = 1 for paving (flatten the grass normal map), detK = which photo gives the detail: 0 grass, 1 forest floor, 2 sand
vec3 yardAlb(vec4 c, vec2 xz, float aa, out float hard, out float detK) {
  float n = yN(xz * 0.9 + c.z * 7.0), n2 = yN(xz * 0.21 + 3.3);
  float pat = 1.0 - smoothstep(0.04, 0.12, aa);
  vec3 col; hard = 0.0; detK = 0.0;
  if (c.x < 1.5) col = yardLawnCol(yardLawnDry(c, xz), n);
  else if (c.x < 2.5) {        // dry soil; lots shaded by a tree: darker, leaf litter
    col = mix(vec3(0.16, 0.115, 0.075), vec3(0.23, 0.17, 0.115), n); detK = 1.0;
    if (c.z < 0.4) col = mix(col * 0.6, vec3(0.12, 0.09, 0.045), 0.45 * n2);
  } else if (c.x < 3.5) {      // concrete slabs (1.5 m joints), stained
    vec2 g = abs(fract(xz / 1.5) - 0.5); float e = 0.5 - max(g.x, g.y);
    col = vec3(0.33, 0.32, 0.3) * (0.82 + 0.28 * n2) * (1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.02 + aa, e)) * (1.0 - smoothstep(0.15, 0.4, aa)));
    hard = 1.0; detK = 2.0;
  } else if (c.x < 4.5) {      // brick pavers, running bond
    vec2 p = xz * vec2(1.0 / 0.21, 1.0 / 0.105); p.x += step(1.0, mod(floor(p.y), 2.0)) * 0.5;
    vec2 g = abs(fract(p) - 0.5); float e = min(0.5 - g.x, 0.5 - g.y);
    vec3 br = mix(vec3(0.29, 0.14, 0.09), vec3(0.36, 0.21, 0.14), yH(floor(p)) * pat + 0.5 * (1.0 - pat));
    col = mix(br, vec3(0.3, 0.29, 0.27), (1.0 - smoothstep(0.04, 0.1, e)) * pat * 0.8) * (0.85 + 0.25 * n2);
    hard = 1.0; detK = 2.0;
  } else if (c.x < 5.5) {      // bark mulch
    col = mix(vec3(0.11, 0.07, 0.042), vec3(0.16, 0.095, 0.055), n); detK = 1.0;
  } else {                     // decomposed granite / pea gravel
    col = mix(vec3(0.34, 0.29, 0.22), vec3(0.42, 0.37, 0.29), n); detK = 2.0; hard = 0.6;
  }
  // fence bed: dark soil with low shrubs
  float bed = yardBed(c);
  float bk = bed > 0.0 ? 1.0 - smoothstep(bed - 0.12 - aa, bed + aa, c.y) : 0.0;
  col = mix(col, mix(vec3(0.07, 0.055, 0.035), vec3(0.05, 0.1, 0.03), smoothstep(0.35, 0.65, n)), bk);
  hard *= 1.0 - bk;
  // far: the per-lot pattern averages out (a lot is a few pixels) instead of shimmering
  return mix(col, Y_AVG, smoothstep(1.0, 2.6, aa));
}
`;
