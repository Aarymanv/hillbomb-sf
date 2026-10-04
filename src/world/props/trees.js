// Trees: photoreal San Francisco species baked in Blender by tools/blender/trees.py (public/assets/trees/, see trees.json).
//   near = LOD0 glb (space-colonisation bark tubes + leaf cards rendered from real 3D leaves, 1-11k tris), instanced per species
//   mid  = LOD1 glb (~1k tris: scaffold limbs + clustered cards), then LOD2 glb (~100-400 tris: trunk + big clusters)
//   far  = hemi-octahedral impostors (8x8 Cycles views per species: albedo*AO + frame-space normals, 3-view blending),
//          ONE instanced draw for every far tree in the city.
// LODs cross-fade with a complementary 4x4 Bayer dither keyed on the shared eye distance, in the colour AND shadow passes,
// so near/mid/far never double up. Wind: per-vertex (bend, flutter) baked into the _WIND attribute (+ canopy AO, leaf flag).
// Leaves and bark share one 4096^2 atlas stored with linear-premultiplied alpha (mip-correct edges; the shader un-premultiplies).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { packedUrl, loadPacked, capImage } from '../texpack.js';

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/trees/';

// kind: broad | palm | fan | scrub (props.js counts shrubs by kind). cls picks the LOD distances. H / collider are refreshed
// from trees.json when it loads (the static values match the bake so placement works even before).
export const SPECIES = [
  { id: 'plane', H: 14.2, collider: 0.35 },     // London plane (Market St, Van Ness, Civic Center)
  { id: 'plane2', H: 12.2, collider: 0.3 },
  { id: 'ficus', H: 9.0, collider: 0.3 },       // Indian laurel fig (Ficus microcarpa)
  { id: 'ficus2', H: 7.6, collider: 0.28 },
  { id: 'oak', H: 11.2, collider: 0.55 },       // coast live oak
  { id: 'oak2', H: 9.5, collider: 0.45 },
  { id: 'brisbox', H: 13.0, collider: 0.3 },    // Brisbane / Victorian box (Lophostemon), SF's most common street tree
  { id: 'cherry', H: 7.2, collider: 0.25 },     // flowering cherry in bloom
  { id: 'plum', H: 6.9, collider: 0.22 },       // purple-leaf flowering plum
  { id: 'euc', H: 36.2, collider: 0.6, cls: 'forest' },      // blue gum eucalyptus
  { id: 'euc2', H: 27.3, collider: 0.5, cls: 'forest' },
  { id: 'pine', H: 27.8, collider: 0.55, cls: 'forest' },    // Monterey pine
  { id: 'pine2', H: 21.7, collider: 0.48, cls: 'forest' },
  { id: 'cypress', H: 18.6, collider: 0.7, cls: 'forest' },  // Monterey cypress
  { id: 'cypress2', H: 15.5, collider: 0.6, cls: 'forest' },
  { id: 'canary', H: 15.1, collider: 0.55, kind: 'palm' },   // Canary Island date palm (Dolores St, Embarcadero)
  { id: 'canary2', H: 11.8, collider: 0.55, kind: 'palm' },
  { id: 'fanpalm', H: 23.2, collider: 0.35, kind: 'fan' },   // Mexican fan palm
  { id: 'fanpalm2', H: 17.1, collider: 0.35, kind: 'fan' },
  { id: 'scrub', H: 2.4, collider: 0, kind: 'scrub', cls: 'scrub' },  // coyote brush
  { id: 'redwood', H: 41.1, collider: 1.0, cls: 'forest' },   // coast redwood (Golden Gate Park groves)
  { id: 'redwood2', H: 31.5, collider: 0.8, cls: 'forest' },
  { id: 'cypress3', H: 12.4, collider: 0.7, cls: 'forest' },  // wind-shorn coastal cypress: local +x = downwind
  { id: 'ginkgo', H: 11.2, collider: 0.25 },                  // ginkgo (residential / downtown street tree)
  { id: 'vbox', H: 8.9, collider: 0.25 },                     // Victorian box (Pittosporum undulatum)
  { id: 'pampas', H: 3.0, collider: 0, kind: 'scrub', cls: 'scrub' },  // pampas grass (coastal bluffs, freeway slopes)
].map(s => ({ kind: 'broad', cls: 'street', ...s }));
export const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));
// legacy ids used by placement code
Object.assign(SPECIES_INDEX, { blossom: SPECIES_INDEX.cherry, palm: SPECIES_INDEX.canary, autumn: SPECIES_INDEX.brisbox });

// LOD bands (metres from the eye): l0 = LOD0 -> LOD1, l1 = LOD1 -> LOD2, l2 = LOD2 -> impostor cross-fades, far = impostor fade-out
export const BANDS = {
  street: { l0: [62, 78], l1: [150, 175], l2: [300, 340], far: 2600 },
  forest: { l0: [52, 66], l1: [135, 160], l2: [300, 340], far: 4000 },
  scrub: { l0: [30, 42], l1: [80, 100], l2: [160, 190], far: 650 },
};

const TU = { eye: { value: new THREE.Vector3(0, 1e5, 0) } };
const NIGHT0 = { value: 0 };
const geos = SPECIES.map(() => [new THREE.BufferGeometry(), new THREE.BufferGeometry(), new THREE.BufferGeometry()]);
let manifest = null, loading = null;
const texLoader = new THREE.TextureLoader();
const TEX = {};

function tex(name, srgb) {
  if (TEX[name]) return TEX[name];
  let done;
  const ready = new Promise(r => (done = r));
  if (packedUrl(BASE + name)) { const t = loadPacked(BASE + name, { srgb, anisotropy: 8 }); return (TEX[name] = t); }   // BC3 atlas (texpack)
  const t = texLoader.load(BASE + name, (tt) => { tt.image = capImage(tt.image); done(); }, undefined, () => { console.warn('[trees] missing texture', name); done(); });
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.userData.ready = ready;
  return (TEX[name] = t);
}

// the shared leaf atlas (facade kit leaf cards, facade/kitleaf.js)
export const leafAtlas = () => tex('leaves_albedo.webp', true);

function fillGeo(dst, gltf) {
  let src = null;
  gltf.scene.traverse(o => { if (!src && o.isMesh) src = o.geometry; });
  if (!src) return;
  for (const [a, b] of [['position', 'position'], ['normal', 'normal'], ['uv', 'uv'], ['aTree', '_wind']]) dst.setAttribute(a, src.attributes[b]);
  dst.setIndex(src.index);
  src.computeBoundingSphere();
  dst.boundingSphere = src.boundingSphere.clone();
  dst.userData.ready = true;
}

// Preload trees.json, every LOD glb and the four atlases (call before the world build). progress(0..1). Resolves false if missing.
export function loadTreeAssets(progress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    try { manifest = await (await fetch(BASE + 'trees.json')).json(); } catch { console.warn('[trees] trees.json missing: run tools/blender/trees.py'); return false; }
    const gl = new GLTFLoader();
    const jobs = [];
    let done = 0, total = 1;
    const tick = () => progress(++done / total);
    for (const [n, s] of [['leaves_albedo.webp', 1], ['leaves_normal.webp', 0], ['impostors_albedo.webp', 1], ['impostors_normal.webp', 0]]) jobs.push(tex(n, s).userData.ready.then(tick));
    SPECIES.forEach((S, i) => {
      const m = manifest.species?.[S.id];
      if (!m) return;
      S.H = m.H; S.collider = m.collider; S.meta = m;
      [m.lod0, m.lod1, m.lod2 || m.lod1].forEach((f, lod) => jobs.push(gl.loadAsync(BASE + f).then(g => fillGeo(geos[i][lod], g), e => console.warn('[trees]', f, e)).then(tick)));
    });
    total = jobs.length;
    await Promise.all(jobs);
    return true;
  })();
  return loading;
}

// ---------------------------------------------------------------- shaders
const BAYER = `float hbBayer(vec2 p){ vec2 q = mod(floor(p), 4.0); int i = int(q.x + q.y * 4.0);
  float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k=0;k<16;k++) if (k==i) return (m[k]+0.5)/16.0; return 0.5; }`;
const TREE_PARS = `uniform float uTime; uniform vec3 uWind; uniform vec3 uEye; uniform vec4 uBand; attribute vec4 aTree; varying vec4 vTree;`;
// wind (gusting bend toward the wind + small orbit + leaf flutter along the normal) and the LOD dither thresholds
const TREE_BEGIN = `
  vec3 transformed = vec3( position );
  #ifdef USE_INSTANCING
    vec3 iPos = instanceMatrix[3].xyz; mat3 iM = mat3(instanceMatrix); float iS2 = max(1e-4, dot(iM[0], iM[0]));
  #else
    vec3 iPos = vec3(0.0); mat3 iM = mat3(1.0); float iS2 = 1.0;
  #endif
  float ph = dot(iPos.xz, vec2(0.071, 0.053));
  float gust = 0.55 + 0.45 * sin(uTime * 0.41 + ph * 0.35) * sin(uTime * 0.19 + ph * 0.8 + 1.3);
  float sway = aTree.x * uWind.z * gust * (0.75 + 0.25 * sin(uTime * 1.35 + ph));
  vec3 wWorld = vec3(uWind.x, 0.0, uWind.y) * sway;
  wWorld.xz += vec2(sin(uTime * 1.1 + ph * 1.7), cos(uTime * 0.93 + ph)) * aTree.x * uWind.z * 0.18;
  transformed += (transpose(iM) * wWorld) / iS2;
  float camD = distance(uEye.xz, iPos.xz);
  // leaf flutter: small, slow (~0.4 Hz) and faded out with distance so far canopies never shimmer
  transformed += normal * aTree.y * uWind.z * 0.07 * (1.0 - smoothstep(20.0, 60.0, camD)) * sin(uTime * 2.6 + ph * 3.1 + position.x * 1.3 + position.y * 0.9 + position.z * 1.1);
  vTree = vec4(aTree.z, aTree.w, uBand.y > 0.0 ? clamp((uBand.y - camD) / max(1.0, uBand.y - uBand.x), 0.0, 1.0) : 0.0,
    clamp((uBand.w - camD) / max(1.0, uBand.w - uBand.z), 0.0, 1.0));
`;
const DITHER = `{ float bz = hbBayer(gl_FragCoord.xy); if (bz < vTree.z || bz >= vTree.w) discard; }`;

function makeTreeMaterial(alb, nrm, U, B, lod) {
  const [fi, fo] = [[null, B.l0], [B.l0, B.l1], [B.l1, B.l2]][lod];
  const uBand = { value: new THREE.Vector4(fi ? fi[0] : -1, fi ? fi[1] : -1, fo[0], fo[1]) };
  const vert = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.time, uWind: U.wind, uEye: TU.eye, uBand, uNight: U.night || NIGHT0 });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TREE_PARS).replace('#include <begin_vertex>', TREE_BEGIN);
  };
  const m = new THREE.MeshStandardMaterial({ map: alb, normalMap: nrm, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    vert(sh);
    sh.uniforms.uSun = U.sun;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vTree; uniform vec4 uSun; uniform float uNight;\n' + BAYER)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        // night: the sky / IBL fill fades like the buildings' day light does; lamps, windows and the moon (direct lights) still light the canopy
        reflectedLight.indirectDiffuse *= 1.0 - 0.88 * uNight; reflectedLight.indirectSpecular *= 1.0 - 0.9 * uNight;`)
      .replace('#include <map_fragment>', `
        vec4 tx = texture2D(map, vMapUv);
        float lf = step(0.5, vTree.y);
        diffuseColor.rgb *= tx.rgb / max(tx.a, 0.02) * vTree.x;
        float aT = tx.a;
        { vec2 dx = dFdx(vMapUv * 4096.0), dy = dFdy(vMapUv * 4096.0);      // keep canopies dense down the mip chain
          aT *= 1.0 + lf * 0.3 * max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy)))); }
        { vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));   // edge-on cards thin out, no slivers
          aT *= mix(1.0, smoothstep(0.06, 0.3, abs(dot(fn, normalize(vViewPosition)))), lf); }
        diffuseColor.a = aT;`)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;\n' + DITHER)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.92, 0.8, lf);')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (lf > 0.5) { normal = normalize(vNormal); nonPerturbedNormal = normal; }   // leaves keep the baked canopy normal on both faces`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (lf > 0.5) normal = normalize(mix(nonPerturbedNormal, normal, 0.45));      // soft leaf detail: no glints at grazing angles`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        // leaves transmit the (shadowed) sun: soft through-light on the far face + a forward-scatter lobe toward the eye
        void RE_Direct_Tree(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          // the moon (the sun light at night) barely lights foliage, like the buildings' night dimming; lamps keep full strength
          IncidentLight dl = directLight;
          dl.color *= 1.0 - 0.8 * uNight * step(0.999, dot(directLight.direction, -uSun.xyz));
          RE_Direct_Physical(dl, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          if (vTree.y > 0.5) {
            float back = pow(saturate(dot(-geometryViewDir, dl.direction)), 4.0);
            float thru = saturate(-dot(geometryNormal, dl.direction));
            reflectedLight.directDiffuse += material.diffuseColor * dl.color * (0.3 * thru + 0.75 * back) * (0.4 + 0.6 * vTree.x);
          }
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Tree`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (0.05 * uSun.w * lf);   // multiple scattering inside the crown: shaded leaves never go black`);
  };
  m.customProgramCacheKey = () => 'hb-tree-v4';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: alb, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    vert(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vTree;\n' + BAYER)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;\n' + DITHER);
  };
  depth.customProgramCacheKey = () => 'hb-tree-depth-v1';
  return { material: m, depth };
}

function impostorGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

// Hemi-octahedral impostor: camera-facing quad over the bake sphere; the 3 nearest baked views are re-projected onto their own
// planes and blended (premultiplied), normals decoded from each view's frame and lit by the regular PBR path.
function makeImpostorMaterial(U) {
  const I = manifest?.impostor || { frames: 8, cols: 5, rows: 4 };
  const alb = tex('impostors_albedo.webp', true), nrm = tex('impostors_normal.webp', false);
  const m = new THREE.MeshStandardMaterial({ map: alb, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const COMMON = `const float NF = ${I.frames}.0; uniform vec2 uGrid;
    vec3 octDec(vec2 g) { vec2 o = g / (NF - 1.0) * 2.0 - 1.0; vec2 p = vec2(o.x + o.y, o.x - o.y) * 0.5;
      return normalize(vec3(p.x, max(0.0, 1.0 - abs(p.x) - abs(p.y)), p.y)); }
    void fBasis(vec3 D, out vec3 r, out vec3 u) { vec3 up = abs(D.y) > 0.999 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0); r = normalize(cross(up, D)); u = cross(D, r); }
    varying vec2 vUv0; varying vec2 vUv1; varying vec2 vUv2; varying vec3 vWgt; varying vec4 vF01; varying vec2 vF2; varying vec3 vRot; varying vec2 vFade;`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uEye: TU.eye, uTime: U.time, uWind: U.wind, uSun: U.sun, uNight: U.night || NIGHT0, tImpN: { value: nrm }, uGrid: { value: new THREE.Vector2(I.cols, I.rows) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      ${COMMON}
      attribute vec4 aImp; attribute vec2 aFade; uniform vec3 uEye; uniform float uTime; uniform vec3 uWind;
      vec2 fUv(vec2 g, vec3 P, vec3 dir, vec3 C, float R, float slot) {
        vec3 D = octDec(g), r, u; fBasis(D, r, u);
        float dd = dot(dir, D);
        vec3 Q = P + dir * (abs(dd) > 1e-3 ? dot(C - P, D) / dd : 0.0) - C;
        vec2 f = clamp(vec2(dot(Q, r), dot(Q, u)) / (2.0 * R) + 0.5, 0.0, 1.0);
        return (vec2(mod(slot, uGrid.x), floor(slot / uGrid.x)) + (g + f) / NF) / uGrid;
      }`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 0.0, 1.0);')
      .replace('#include <begin_vertex>', `
        vec3 iPos = instanceMatrix[3].xyz; mat3 iM = mat3(instanceMatrix);
        vec3 sc2 = vec3(dot(iM[0], iM[0]), dot(iM[1], iM[1]), dot(iM[2], iM[2]));
        vec3 ew = cameraPosition - iPos;
        vec3 eL = vec3(dot(iM[0], ew), dot(iM[1], ew), dot(iM[2], ew)) / sc2;       // eye in the tree's bake frame
        float R = aImp.y; vec3 C = vec3(0.0, aImp.z, 0.0);
        vec3 V = eL - C; V.y = max(V.y, 0.0); V = normalize(V + vec3(0.0, 1e-4, 0.0));
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 cuL = vec3(dot(iM[0], cu), dot(iM[1], cu), dot(iM[2], cu)) / sc2;
        vec3 br = normalize(cross(cuL, V)); vec3 bu = cross(V, br);
        vec3 transformed = C + (position.x * br + position.y * bu) * R;
        vec2 g = (vec2(V.x + V.z, V.x - V.z) / (abs(V.x) + abs(V.y) + abs(V.z)) * 0.5 + 0.5) * (NF - 1.0);
        vec2 c0 = clamp(floor(g), 0.0, NF - 2.0), f = g - c0, g0, g1, g2;
        if (f.x + f.y < 1.0) { g0 = c0; g1 = c0 + vec2(1.0, 0.0); g2 = c0 + vec2(0.0, 1.0); vWgt = vec3(1.0 - f.x - f.y, f.x, f.y); }
        else { g0 = c0 + vec2(1.0); g1 = c0 + vec2(0.0, 1.0); g2 = c0 + vec2(1.0, 0.0); vWgt = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y); }
        vec3 dir = normalize(transformed - eL);
        vUv0 = fUv(g0, transformed, dir, C, R, aImp.x); vUv1 = fUv(g1, transformed, dir, C, R, aImp.x); vUv2 = fUv(g2, transformed, dir, C, R, aImp.x);
        vF01 = vec4(g0, g1); vF2 = g2;
        float s0 = sqrt(sc2.x); vRot = vec3(iM[0].x / s0, -iM[0].z / s0, sqrt(sc2.x / sc2.y));
        float camD = distance(uEye.xz, iPos.xz);
        vFade = vec2(clamp((aFade.y - camD) / max(1.0, aFade.y - aFade.x), 0.0, 1.0), clamp((aImp.w - camD) / 250.0, 0.0, 1.0));
        if (vFade.x >= 1.0 || vFade.y <= 0.0) transformed = vec3(0.0);
        transformed.x += uWind.x * uWind.z * 0.012 * max(0.0, transformed.y) * (0.6 + 0.4 * sin(uTime * 0.7 + dot(iPos.xz, vec2(0.071, 0.053))));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      ${COMMON}
      uniform sampler2D tImpN; uniform vec4 uSun; uniform float uNight;
      ${BAYER}
      vec3 impN(vec2 g, vec2 uv) { vec3 D = octDec(g), r, u; fBasis(D, r, u); vec3 n = texture2D(tImpN, uv).xyz * 2.0 - 1.0; return r * n.x + u * n.y + D * n.z; }`)
      .replace('#include <map_fragment>', `
        vec4 s0 = texture2D(map, vUv0), s1 = texture2D(map, vUv1), s2 = texture2D(map, vUv2);
        vec4 cI = s0 * vWgt.x + s1 * vWgt.y + s2 * vWgt.z;
        diffuseColor.rgb *= cI.rgb / max(cI.a, 0.02);
        float aI = cI.a;
        { vec2 dx = dFdx(vUv0 * uGrid * 1024.0), dy = dFdy(vUv0 * uGrid * 1024.0);
          aI *= 1.0 + 0.3 * max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy)))); }
        diffuseColor.a = aI;`)
      .replace('#include <alphatest_fragment>', `if (diffuseColor.a < 0.5) discard;
        { float bz = hbBayer(gl_FragCoord.xy); if (bz < vFade.x || bz >= vFade.y) discard; }`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        void RE_Direct_Imp(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          IncidentLight dl = directLight;
          dl.color *= 1.0 - 0.8 * uNight * step(0.999, dot(directLight.direction, -uSun.xyz));
          RE_Direct_Physical(dl, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Imp`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0;
        vec3 nL = impN(vF01.xy, vUv0) * (vWgt.x * s0.a) + impN(vF01.zw, vUv1) * (vWgt.y * s1.a) + impN(vF2, vUv2) * (vWgt.z * s2.a);
        nL.y *= vRot.z;
        vec3 normal = normalize((viewMatrix * vec4(vRot.x * nL.x + vRot.y * nL.z, nL.y, -vRot.y * nL.x + vRot.x * nL.z, 0.0)).xyz);
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (pow(max(0.0, dot(normalize(vViewPosition), uSun.xyz)), 4.0) * 0.25 + 0.04) * uSun.w;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        // night: the sky / IBL fill fades like the buildings' day light does; lamps, windows and the moon (direct lights) still light the canopy
        reflectedLight.indirectDiffuse *= 1.0 - 0.88 * uNight; reflectedLight.indirectSpecular *= 1.0 - 0.9 * uNight;`);
  };
  m.customProgramCacheKey = () => 'hb-impostor-v4';
  return m;
}

// One instanced impostor set (all species, one draw). aImp = (slot, R, cy, fade-out distance), aFade = fade-in band.
let impMat = null;
export function buildFarSet(U, InstanceSet, name) {
  impMat ||= makeImpostorMaterial(U);
  return new InstanceSet(name, impostorGeometry(), impMat, { cull: false, color: true, attrs: { aImp: 4, aFade: 2 } });
}

// Build the instanced sets for every placed tree: per species LOD0 + LOD1, plus one far impostor set.
// trees: [{ sp, x, y, z, yaw, s, sy, tint }]; yawM(x, y, z, yaw, sx, sy, sz) -> 16 numbers. Returns InstanceSets (add them to the cull list).
export function buildTreeSets(trees, U, InstanceSet, yawM) {
  loadTreeAssets();   // no-op after the preload; on pages without it the geometry and textures fill in when they arrive
  const alb = tex('leaves_albedo.webp', true), nrm = tex('leaves_normal.webp', false);
  const mats = {};
  const matFor = (cls, lod) => mats[cls + lod] || (mats[cls + lod] = makeTreeMaterial(alb, nrm, U, BANDS[cls], lod));
  const sets = [];
  const per = SPECIES.map((S, i) => {
    const B = BANDS[S.cls], m0 = matFor(S.cls, 0), m1 = matFor(S.cls, 1), m2 = matFor(S.cls, 2);
    const s0 = new InstanceSet('tree0:' + S.id, geos[i][0], m0.material, { maxDist: B.l0[1] + 2, cell: 48, castShadow: true, depthMaterial: m0.depth, color: true, height: S.H, always: 55 });
    const s1 = new InstanceSet('tree1:' + S.id, geos[i][1], m1.material, { minDist: B.l0[0] - 2, maxDist: B.l1[1] + 2, cell: 64, castShadow: S.cls !== 'scrub', depthMaterial: m1.depth, color: true, height: S.H, always: 0 });
    const s2 = new InstanceSet('tree2:' + S.id, geos[i][2], m2.material, { minDist: B.l1[0] - 2, maxDist: B.l2[1] + 2, cell: 96, castShadow: false, depthMaterial: m2.depth, color: true, height: S.H, always: 0 });
    sets.push(s0, s1, s2);
    return [s0, s1, s2];
  });
  const far = buildFarSet(U, InstanceSet, 'trees:far');
  for (const t of trees) {
    const S = SPECIES[t.sp], B = BANDS[S.cls], m = yawM(t.x, t.y, t.z, t.yaw, t.s, t.s * t.sy, t.s);
    per[t.sp][0].add(m, null, t.tint);
    per[t.sp][1].add(m, null, t.tint);
    per[t.sp][2].add(m, null, t.tint);
    const im = S.meta;
    if (im) far.add(m, { aImp: [im.slot, im.R, im.cy, B.far], aFade: B.l2 }, t.tint);
  }
  sets.push(far);
  sets.lods = per;   // [species][lod] -> set
  return sets;
}

// once per frame before rendering: the LOD dither reference (shared by the colour and shadow passes)
export function updateTrees(camera) { if (camera) TU.eye.value.copy(camera.position); }
