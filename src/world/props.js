// Street dressing for HILLBOMB: street + park trees (near 3D canopies, far billboards), lamps with night light pools,
// live traffic signals, stop signs, street-name blades, Muni trolley wires, Sunset/Richmond utility poles, sidewalk
// furniture, parked cars, waterfront bollards/railings, road decals, and breakables (knock-over, debris, hydrant geysers).
//
// buildProps({ world, scene, night }) -> { group, colliders, update(dt, { time, night, camera, focus }), onHit(c, speed, dir?), parked, stats }
import * as THREE from 'three';
import { HB_POOLK } from '../render/lampmap.js';
import { Kit, mulberry, hash2 } from './props/kit.js';
import * as TX from './props/textures.js';
import * as TR from './props/trees.js';
import * as MD from './props/models.js';
import { InstanceSet } from './props/instset.js';
import { WireBuilder, makeWireMaterial } from './props/wires.js';
import { createFx } from './props/fx.js';
import { signalFor } from '../game/drivers.js';
import { HB_WET } from '../render/fog.js';
import { buildCarProxy, buildCarModel, getModelSpec, upgradeParkedSet, STREET_PAINT } from '../vehicle/models.js';
import { SURF, resample } from './terrain.js';
import { inGGPark, inPresidio, inLandsEnd, inTwinPeaks, coastSDF, fbm } from './map.js';
import { pointInConvex } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PBR } from './assets.js';
import { registerV2 } from './props/v2.js';
import { buildNightDress } from './props/nightdress.js';   // render agent: Chinatown festoons + litter

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- street classes
const TROLLEY = new Set(['Market St', 'Geary Blvd', 'Mission St', 'Fillmore St', 'Haight St', 'Divisadero St', 'Van Ness Ave', 'Union St',
  'Hayes St', 'McAllister St', 'Fulton St', 'Sacramento St', 'Jackson St', 'Stockton St', '24th St', 'Castro St']);
const COMMERCIAL_ZONES = new Set(['downtown', 'downtown_soma', 'chinatown', 'northbeach', 'tenderloin', 'wharf', 'soma']);
const COMMERCIAL_STREETS = new Set(['Haight St', 'Valencia St', '24th St', 'Clement St', 'Irving St', 'Chestnut St', 'Union St', 'Fillmore St',
  'Castro St', '18th St', 'Divisadero St', 'Polk St', 'Columbus Ave', 'Geary Blvd', 'Mission St', 'Hayes St', 'Judah St', 'Noriega St',
  'Van Ness Ave', 'Market St', 'Church St', 'Sacramento St', 'Balboa St', 'Broadway', 'Lombard St', 'Stanyan St']);
const DOWNTOWN = new Set(['downtown', 'downtown_soma']);
const STREET_TREES = {
  victorian: [['brisbox', 0.25], ['plane2', 0.15], ['ficus', 0.15], ['ficus2', 0.1], ['cherry', 0.15], ['plum', 0.2]],
  castro: [['cherry', 0.25], ['ficus', 0.2], ['brisbox', 0.25], ['plum', 0.15], ['plane2', 0.15]],
  mission: [['ficus', 0.35], ['ficus2', 0.15], ['brisbox', 0.2], ['cherry', 0.15], ['plane2', 0.15]],
  marina: [['ficus', 0.25], ['brisbox', 0.25], ['plane2', 0.2], ['cherry', 0.15], ['plum', 0.15]],
  nobhill: [['plane', 0.3], ['ficus', 0.3], ['brisbox', 0.4]],
  northbeach: [['ficus', 0.5], ['ficus2', 0.2], ['cherry', 0.3]],
  tenderloin: [['ficus', 0.5], ['ficus2', 0.2], ['plane2', 0.3]],
  soma: [['plane2', 0.4], ['ficus', 0.3], ['brisbox', 0.3]],
  avenues: [['cherry', 0.25], ['plum', 0.25], ['ficus2', 0.15], ['brisbox', 0.2], ['plane2', 0.15]],
  industrial: [['ficus', 0.5], ['brisbox', 0.5]],
  wharf: [['palm', 0.7], ['fanpalm', 0.3]],
};
const LINED = { victorian: 0.48, castro: 0.5, mission: 0.4, marina: 0.42, nobhill: 0.36, northbeach: 0.25, tenderloin: 0.2, soma: 0.24, avenues: 0.2, industrial: 0.06, wharf: 0.06 };
// the Blender-baked species are authored at real size (plane 14 m, ficus 9 m, brisbox 13 m, cherry/plum 7 m, canary palm 15 m, fan palm 23 m)
const STREET_SCALE = { plane: [0.85, 1.05], plane2: [0.85, 1.05], ficus: [0.85, 1.1], ficus2: [0.85, 1.1], brisbox: [0.8, 1.05], cherry: [0.85, 1.1], plum: [0.85, 1.1], palm: [0.85, 1.05], canary2: [0.9, 1.1], fanpalm: [0.8, 1.0], fanpalm2: [0.85, 1.05], cypress2: [0.7, 0.9], pine2: [0.7, 0.9], oak2: [0.8, 1.0] };
const PARKS = {
  'The Panhandle': { cell: 11, dens: 0.8, sp: [['euc2', 0.3], ['cypress', 0.2], ['plane', 0.2], ['pine2', 0.15], ['oak', 0.15]] },
  'Buena Vista Park': { cell: 10, dens: 0.92, sp: [['euc', 0.35], ['cypress', 0.25], ['pine', 0.25], ['oak2', 0.15]] },
  'Alamo Square': { cell: 15, dens: 0.35, sp: [['cypress2', 0.35], ['pine2', 0.3], ['plane2', 0.2], ['oak2', 0.15]] },
  'Union Square': { cell: 12, dens: 0.5, sp: [['palm', 0.6], ['canary2', 0.4]] },
  'Washington Square': { cell: 13, dens: 0.35, sp: [['cypress2', 0.4], ['plane', 0.35], ['fanpalm', 0.25]] },
  'Pioneer Park': { cell: 10, dens: 0.8, sp: [['euc2', 0.4], ['cypress', 0.3], ['pine', 0.3]] },
  'Dolores Park': { cell: 14, dens: 0.32, sp: [['palm', 0.35], ['fanpalm', 0.1], ['cypress2', 0.2], ['plane2', 0.2], ['oak2', 0.15]] },
  'Lafayette Park': { cell: 11, dens: 0.62, sp: [['cypress', 0.4], ['pine', 0.3], ['euc2', 0.3]] },
  'Alta Plaza': { cell: 12, dens: 0.5, sp: [['cypress2', 0.4], ['pine', 0.3], ['plane2', 0.3]] },
  'Civic Center Plaza': { grid: 9, sp: [['plane2', 1]] },
  'Aquatic Park': { cell: 18, dens: 0.3, sp: [['cypress2', 0.5], ['palm', 0.3], ['fanpalm', 0.2]] },
  'Corona Heights': { cell: 9, dens: 0.55, sp: [['scrub', 1]] },
  'Huntington Park': { cell: 12, dens: 0.5, sp: [['plane', 0.5], ['ficus', 0.3], ['brisbox', 0.2]] },
};
// Golden Gate Park meadows / lakes / open areas (ellipses x, z, rx, rz)
const GGP_OPEN = [[-760, 700, 95, 55], [-1000, 800, 95, 60], [-1600, 790, 170, 55], [-1920, 790, 90, 50], [-2250, 905, 210, 110], [-2050, 830, 70, 40],
  [-2500, 700, 95, 45], [-1350, 900, 120, 85], [-650, 1030, 85, 60], [-2700, 1000, 200, 95], [-2450, 1010, 90, 55], [-1150, 1000, 60, 40], [-2900, 700, 60, 70]];
const CAR_MODELS = [['sedan', 0.22], ['k5', 0.04], ['hatch', 0.15], ['suv', 0.17], ['trekker', 0.02], ['ev', 0.1], ['van', 0.06], ['boxtruck', 0.02], ['pickup', 0.08], ['coupe', 0.05], ['muscle', 0.03], ['kugel', 0.01], ['taxi', 0.03]];
const CAR_PAINT = STREET_PAINT;

// decal accumulator split into tiles (frustum-culled meshes); same state API as Kit for quads
class TiledKit {
  constructor(tile = 600) { this.tile = tile; this.m = new Map(); this.c = [1, 1, 1]; this.tex = false; }
  kit(x, z) { const k = Math.floor(x / this.tile) * 1000 + Math.floor(z / this.tile); let g = this.m.get(k); if (!g) this.m.set(k, g = new Kit()); return g; }
  rgb(r, g, b) { this.c = [r, g, b]; return this; }
  textured() { this.tex = true; return this; }
  flat() { this.tex = false; return this; }
  quad(p0, p1, p2, p3, uvs) { const k = this.kit(p0[0], p0[2]); k.c = this.c; if (this.tex) k.textured(); else k.flat(); k.quad(p0, p1, p2, p3, uvs); }
  get count() { let n = 0; for (const k of this.m.values()) n += k.count; return n; }
}
function pickW(list, r) { let t = 0; for (const [, w] of list) t += w; let x = r * t; for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[list.length - 1][0]; }

// ---------------------------------------------------------------- materials
// shared photo-scanned detail (assets.js PBR library), triplanar in object space so instances don't swim.
// aPbr = (id, strength): id 1 = metal, 2 = concrete. The prop's own colour is kept; the photo adds albedo/roughness
// variation and a derivative bump from its luminance.
const PBR_FRAG_PARS = `
uniform sampler2D tMetC, tMetR, tConC, tConR; uniform vec2 kPbr;
varying vec2 vPbr; varying vec3 vObjPos; varying vec3 vObjN;
vec4 hbTri(sampler2D t, vec3 P, vec3 w) { return texture2D(t, P.zy) * w.x + texture2D(t, P.xz) * w.y + texture2D(t, P.xy) * w.z; }
vec3 hbPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * fd;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`;
const PBR_FRAG_APPLY = `
  if (vPbr.x > 0.5 && vPbr.y > 0.0) {
    vec3 tw = pow(abs(normalize(vObjN)) + 1e-4, vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
    bool met = vPbr.x < 1.5;
    vec3 P = vObjPos * (met ? kPbr.x : kPbr.y);
    vec3 c = met ? hbTri(tMetC, P, tw).rgb : hbTri(tConC, P, tw).rgb;
    float r = met ? hbTri(tMetR, P, tw).r : hbTri(tConR, P, tw).r;
    vec3 cm = met ? textureLod(tMetC, vec2(0.5), 12.0).rgb : textureLod(tConC, vec2(0.5), 12.0).rgb;
    float rm = met ? textureLod(tMetR, vec2(0.5), 12.0).r : textureLod(tConR, vec2(0.5), 12.0).r;
    float st = vPbr.y;
    diffuseColor.rgb *= mix(vec3(1.0), clamp(c / max(cm, vec3(0.03)), 0.0, 2.5), st * 0.85);
    roughnessFactor = clamp(roughnessFactor * mix(1.0, r / max(rm, 0.05), st * 0.8), 0.04, 1.0);
    float h = dot(c, vec3(0.3, 0.59, 0.11));
    normal = hbPerturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)) * 1.6 * st, faceDirection);
  }`;
function pbrUniforms(sh) {
  const M = PBR.tex('metal'), Cn = PBR.tex('concrete');
  sh.uniforms.tMetC = { value: M.map }; sh.uniforms.tMetR = { value: M.roughnessMap || M.map };
  sh.uniforms.tConC = { value: Cn.map }; sh.uniforms.tConR = { value: Cn.roughnessMap || Cn.map };
  sh.uniforms.kPbr = { value: new THREE.Vector2(1 / (PBR.TILE.metal || 2), 1 / (PBR.TILE.concrete || 3)) };
}
function makePropMaterial(map, U, key = 'prop') {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night; sh.uniforms.uGlowK = U.glowK;
    pbrUniforms(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSurf; attribute vec2 aPbr; varying vec4 vSurf; varying vec2 vPbr; varying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf; vPbr = aPbr; vObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSurf; uniform float uNight; uniform float uGlowK;\n' + PBR_FRAG_PARS)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.z;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + PBR_FRAG_APPLY)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (vSurf.x * uNight * uGlowK + max(vSurf.w, 0.0));');
  };
  m.customProgramCacheKey = () => 'hb-prop-v2-' + key;
  return m;
}
function makeSignalMaterial(map, U) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSurf; attribute float aState; varying vec4 vSurf; varying float vLit;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSurf = aSurf; float lid = aSurf.x; vLit = 0.0;
        if (lid > 0.5 && lid < 3.5) vLit = abs(lid - 1.0 - aState) < 0.5 ? 1.0 : 0.0;
        else if (lid > 3.5 && lid < 4.5) vLit = aState < 1.5 ? 1.0 : 0.0;
        else if (lid > 4.5) vLit = aState > 1.5 ? 1.0 : 0.0;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSurf; varying float vLit; uniform float uNight;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.z;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float lid = vSurf.x;
          if (lid > 0.5) {
            vec3 lc = lid < 1.5 ? vec3(1.0, 0.04, 0.02) : lid < 2.5 ? vec3(1.0, 0.5, 0.0) : lid < 3.5 ? vec3(0.05, 1.0, 0.55) : lid < 4.5 ? vec3(1.0, 0.42, 0.08) : vec3(0.85, 0.92, 1.0);
            float k = 2.2 + uNight * 1.4;   // was + 3.5: at night each lens bloomed into a 40 px halo that popped the frame mean as heads passed overhead
            if (lid < 3.5) { diffuseColor.rgb = mix(lc * 0.05 + 0.02, lc * 0.6, vLit); totalEmissiveRadiance += lc * vLit * k; }
            else { vec3 base = diffuseColor.rgb; diffuseColor.rgb = base * mix(0.12, 0.8, vLit); totalEmissiveRadiance += base * lc * vLit * k * 0.8; }
          } }`);
  };
  m.customProgramCacheKey = () => 'hb-signal-v1';
  return m;
}
function makeBladeMaterial(map, U) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSurf; attribute vec4 aUv; varying vec4 vSurf;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aSurf.w < -0.5 ? mix(aUv.xy, aUv.zw, uv) : vec2(0.0008, 0.0008);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSurf; uniform float uNight;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.z;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.08 * uNight;');
  };
  m.customProgramCacheKey = () => 'hb-blade-v1';
  return m;
}
function makeCarMaterial() {
  // lacquered paint on the body panels (vPaint), plain on tyres/trim/glass; the world IBL is graded down for walls and
  // roads, so the paint's reflections are boosted in-shader (three ignores envMapIntensity for scene.environment)
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.07 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vPaint;')
      .replace('#include <color_vertex>', `vColor = vec3(1.0); vColor *= color;
        float pm = step(0.965, min(color.r, min(color.g, color.b)));
        #ifdef USE_INSTANCING_COLOR
        vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, pm);
        #endif
        vPaint = pm;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPaint;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.55, 0.26, vPaint);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(0.15, 0.4, vPaint);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= vPaint;\n#endif')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#ifdef USE_ENVMAP\nradiance *= mix(1.0, 2.4, vPaint);\n#ifdef USE_CLEARCOAT\nclearcoatRadiance *= 2.4;\n#endif\n#endif');
  };
  m.customProgramCacheKey = () => 'hb-parked-v2';
  return m;
}
function additiveFog(m) {
  // lamp pool decals (multiplicative: dst * (1 + src)) give way to the lamp light map (render/lampmap.js) when it is live
  const pool = m.blending === THREE.CustomBlending && m.blendSrc === THREE.DstColorFactor;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(/gl_FragColor\.rgb\s*=\s*mix\(\s*gl_FragColor\.rgb,\s*fogColor,\s*fogFactor\s*\);/, 'gl_FragColor.rgb *= (1.0 - fogFactor);'));
    if (pool) {
      sh.uniforms.hbPoolK = HB_POOLK;
      sh.fragmentShader = 'uniform float hbPoolK;\n' + sh.fragmentShader.replace(/}\s*$/, '  gl_FragColor.rgb *= hbPoolK;\n}');
    }
  };
  m.customProgramCacheKey = () => pool ? 'hb-additive-fog-pool' : 'hb-additive-fog';
  return m;
}

// ---------------------------------------------------------------- matrices
const _M = new THREE.Matrix4();
function yawM(x, y, z, yaw, sx = 1, sy = sx, sz = sx) {
  const c = Math.cos(yaw), s = Math.sin(yaw), e = _M.elements;
  e[0] = c * sx; e[1] = 0; e[2] = -s * sx; e[3] = 0;
  e[4] = 0; e[5] = sy; e[6] = 0; e[7] = 0;
  e[8] = s * sz; e[9] = 0; e[10] = c * sz; e[11] = 0;
  e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
  return e;
}
const yawFront = (fx, fz) => Math.atan2(-fx, -fz);   // yaw so the local -Z (front) points along (fx, fz)
const yawAlongX = (vx, vz) => Math.atan2(-vz, vx);   // yaw so the local +X points along (vx, vz)

// ================================================================= build
export function buildProps({ world, scene, night, opts = {} }) {
  const t0 = performance.now();
  const T = { };
  const { terrain, graph, blocks } = world;
  const colliders = [];
  const H = (x, z) => terrain.heightAt(x, z);
  const rnd = mulberry(20260928);
  const U = {
    night: { value: 0 }, glowK: { value: 5.5 }, time: { value: 0 },
    wind: { value: new V3(0.94, 0.34, 0.32) }, sun: { value: new THREE.Vector4(0, 0, -1, 1) },
  };
  const nightU = night;
  const group = new THREE.Group(); group.name = 'props';

  // ---------------------------------------------------------------- textures + materials
  let tt = performance.now();
  const propTex = TX.propAtlas();
  const decalTex = TX.decalAtlas();
  const glowTex = TX.glowTexture();
  const names = [...new Set(graph.edges.map(e => e.name).filter(Boolean))].sort();
  const NA = TX.nameAtlas(names);
  T.textures = performance.now() - tt;
  const propMat = makePropMaterial(propTex, U, 'a');
  const signalMat = makeSignalMaterial(propTex, U);
  const bladeMat = makeBladeMaterial(NA.texture, U);
  const carMat = makeCarMaterial();

  // ---------------------------------------------------------------- queries
  const EH = graph.edgeHash, EC = graph.edgeHashCell;
  // signed clearance from the nearest (ground) road surface: < 0 = on a road
  function roadClear(x, z) {
    const arr = EH.get(Math.floor(x / EC) * 100003 + Math.floor(z / EC));
    if (!arr) return 99;
    let best = 99;
    for (const [e, k] of arr) {
      if (e.deck) continue;
      const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - e.width / 2;
      if (d < best) best = d;
    }
    return best;
  }
  const hitsCollider = (x, y, z, r) => !!world.colliders.pointHit(x, y + 1.2, z, r);
  function groundOK(x, z) { return coastSDF(x, z) > 1.5 && terrain.surfaceAt(x, z) !== SURF.WATER; }
  // occupancy (placed footprints)
  const OC = 4, occ = new Map();
  const ok = (i, j) => (i + 5000) * 20000 + (j + 5000);
  function free(x, z, r) {
    const i0 = Math.floor((x - r - 3) / OC), i1 = Math.floor((x + r + 3) / OC), j0 = Math.floor((z - r - 3) / OC), j1 = Math.floor((z + r + 3) / OC);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = occ.get(ok(i, j)); if (!a) continue; for (let q = 0; q < a.length; q += 3) { const dx = a[q] - x, dz = a[q + 1] - z, rr = a[q + 2] + r; if (dx * dx + dz * dz < rr * rr) return false; } }
    return true;
  }
  function occupy(x, z, r) { const k = ok(Math.floor(x / OC), Math.floor(z / OC)); let a = occ.get(k); if (!a) occ.set(k, a = []); a.push(x, z, r); }

  // ---------------------------------------------------------------- instance sets
  const sets = {};
  const kitGeo = (r) => r.kit.toGeometry();
  const models = {
    cobra: MD.cobraLamp(), cobraTall: MD.cobraLamp({ H: 11.5, arm: 3.1 }), ornate: MD.ornateLamp(), post: MD.postLamp(),
    trolley: MD.trolleyPole(), trolleyLamp: MD.trolleyPole({ lamp: true }), wood: MD.woodPole(), woodT: MD.woodPole({ transformer: true }),
    signalPole: MD.signalPole(), arm: MD.mastArm(), head: MD.signalHead(), ped: MD.pedHead(),
    stop: MD.stopSign(), stopTall: MD.stopSign({ tall: true }), namePost: MD.namePost(), blade: MD.nameBlade(),
    hydrant: MD.hydrant(), meter: MD.parkingMeter(), pay: MD.payStation(), shelter: MD.busShelter(), busPole: MD.busStopPole(),
    bench: MD.bench(), trash: MD.trashCan(), news: MD.newsBoxes(3), news2: MD.newsBoxes(2), bike: MD.bikeRack(), planter: MD.planter(),
    bollard: MD.bollard(), mailbox: MD.mailbox(), psign: MD.parkingSign(), mooring: MD.mooringBollard(), railing: MD.railing(), shard: MD.shard(),
  };
  const SETCFG = {
    cobra: { maxDist: 460, shadow: true, dyn: 6, height: 10 }, cobraTall: { maxDist: 560, shadow: true, dyn: 4, height: 12 },
    ornate: { maxDist: 460, shadow: true, dyn: 6, height: 9 }, post: { maxDist: 340, shadow: true, dyn: 6, height: 8 },
    trolley: { maxDist: 480, shadow: true, height: 10 }, trolleyLamp: { maxDist: 480, shadow: true, height: 10 },
    wood: { maxDist: 480, shadow: true, height: 11 }, woodT: { maxDist: 480, shadow: true, height: 11 },
    signalPole: { maxDist: 480, shadow: true, height: 8 }, arm: { maxDist: 480, shadow: true, height: 7 },
    stop: { maxDist: 240, dyn: 6, height: 3 }, stopTall: { maxDist: 240, dyn: 6, height: 4 }, namePost: { maxDist: 240, dyn: 4, height: 4 },
    hydrant: { maxDist: 180, dyn: 6, height: 1 }, meter: { maxDist: 150, dyn: 8, height: 1.5 }, pay: { maxDist: 170, dyn: 4, height: 1.7 },
    shelter: { maxDist: 320, shadow: true, height: 3 }, busPole: { maxDist: 220, dyn: 4, height: 3 }, bench: { maxDist: 170, dyn: 6, height: 1 },
    trash: { maxDist: 170, dyn: 8, height: 1.2 }, news: { maxDist: 170, dyn: 4, height: 1.2 }, news2: { maxDist: 170, dyn: 4, height: 1.2 },
    bike: { maxDist: 150, dyn: 4, height: 1 }, planter: { maxDist: 220, height: 1.4 }, bollard: { maxDist: 170, dyn: 8, height: 1 },
    mailbox: { maxDist: 170, dyn: 4, height: 1.5 }, psign: { maxDist: 170, dyn: 6, height: 2.6 }, mooring: { maxDist: 200, height: 0.6 },
    railing: { maxDist: 260, height: 1.2 }, shard: { maxDist: 1, dyn: 72, height: 1 },
  };
  for (const k in SETCFG) {
    const c = SETCFG[k];
    sets[k] = new InstanceSet(k, kitGeo(models[k]), propMat, { maxDist: c.maxDist, castShadow: !!c.shadow, dynamic: c.dyn || 0, height: c.height, color: k === 'shard' });
  }
  sets.head = new InstanceSet('head', kitGeo(models.head), signalMat, { maxDist: 380, attrs: { aState: 1 }, height: 7 });
  sets.ped = new InstanceSet('ped', kitGeo(models.ped), signalMat, { maxDist: 200, attrs: { aState: 1 }, height: 4 });
  sets.blade = new InstanceSet('blade', kitGeo(models.blade), bladeMat, { maxDist: 240, attrs: { aUv: 4 }, dynamic: 8, height: 4 });

  // lamps (for light pools + point lights)
  const lamps = [];   // { x, y, z, r, col:[r,g,b], pool: [start,count], broken }
  const LCOL = { cool: [1.0, 0.86, 0.66], warm: [1.0, 0.74, 0.44], sodium: [1.0, 0.6, 0.26] };
  function addLampHead(x, y, z, r, col) { lamps.push({ x, y, z, r, col, pool: null, broken: false }); return lamps.length - 1; }

  // generic placement of a prop instance + collider
  let propId = 0;
  function place(setName, x, y, z, yaw, { col = null, r = 0.3, hx, hz, h = 1, breakable = false, kind = 'prop', s = 1, noCollider = false, attr = null } = {}) {
    const set = sets[setName];
    const idx = set.add(yawM(x, y, z, yaw, s), attr);
    let c = null;
    if (!noCollider) {
      c = { x, z, hx: hx ?? r, hz: hz ?? r, yaw, yMin: y - 0.3, yMax: y + h, kind, breakable, id: 'prop:' + (propId++) };
      c.propRef = { set: setName, index: idx, x, y, z, yaw };
      colliders.push(c);
    }
    return { idx, c };
  }

  // ---------------------------------------------------------------- curbs (block edges with their street)
  tt = performance.now();
  const curbs = [];
  for (const b of blocks) {
    if (!b.inner) continue;
    const P = b.poly, n = P.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = P[i], [cx, cz] = P[(i + 1) % n];
      const L = Math.hypot(cx - ax, cz - az); if (L < 8) continue;
      const dx = (cx - ax) / L, dz = (cz - az) / L;
      let nx = -dz, nz = dx; if ((b.cx - ax) * nx + (b.cz - az) * nz < 0) { nx = -nx; nz = -nz; }
      const mx = (ax + cx) / 2 - nx * 3, mz = (az + cz) / 2 - nz * 3;
      const ne = graph.nearestEdge(mx, mz, 14);
      if (!ne || ne.edge.deck) continue;
      const e = ne.edge, [px, pz] = e.pts[ne.k], [qx, qz] = e.pts[ne.k + 1];
      const el = Math.hypot(qx - px, qz - pz) || 1;
      if (Math.abs(((qx - px) * dx + (qz - pz) * dz) / el) < 0.8) continue;
      const cd = Math.hypot((ax + cx) / 2 - ne.x, (az + cz) / 2 - ne.z);
      if (Math.abs(cd - e.width / 2) > 3.5) continue;
      const name = e.name || '';
      curbs.push({ ax, az, dx, dz, nx, nz, L, b, zone: b.zone, e, name, width: e.width, kind: e.kind, park: b.park,
        trolley: TROLLEY.has(name) && e.width >= 12, commercial: COMMERCIAL_ZONES.has(b.zone) || COMMERCIAL_STREETS.has(name),
        market: name === 'Market St' && e.width >= 16, embarcadero: name === 'The Embarcadero',
        parking: e.width <= 12 && (e.kind === 'local' || e.kind === 'road' || e.kind === 'park'),
        yaw: Math.atan2(nx, nz), hx: nz, hz: -nx, hydrants: [], noPark: [] });
    }
  }
  const at = (C, s, u) => [C.ax + C.dx * s + C.nx * u, C.az + C.dz * s + C.nz * u];
  function sidewalkOK(x, z, r = 0.3) { const y = H(x, z) + 0.15; return roadClear(x, z) > r + 0.1 && groundOK(x, z) && !hitsCollider(x, y, z, r) ? y : null; }
  T.curbs = performance.now() - tt;

  // ---------------------------------------------------------------- intersections: signals, stop signs, name blades
  tt = performance.now();
  const decals = new TiledKit(300);
  const DUV = (r) => TX.daUV(r);
  const heads = [];   // { node, hx, hz, idx: [build indices], ped: bool }
  const laneOff = (e, l) => (e.median || 0.15) + (l + 0.5) * e.laneW;
  function approaches(n) {
    const out = [];
    for (const e of n.edges) {
      if (e.deck || e.kind === 'crooked') continue;
      const P = e.pts, m = P.length;
      let dx, dz;
      if (e.a === n) { dx = P[0][0] - P[1][0]; dz = P[0][1] - P[1][1]; } else { dx = P[m - 1][0] - P[m - 2][0]; dz = P[m - 1][1] - P[m - 2][1]; }
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      out.push({ e, dx, dz, rx: -dz, rz: dx, hw: e.width / 2 });
    }
    return out;
  }
  function crossDist(A, apps) { let D = 3; for (const B of apps) { if (B === A) continue; const sn = Math.abs(A.dx * B.dz - A.dz * B.dx); if (sn > 0.3) D = Math.max(D, B.hw / sn); } return D; }
  function crossName(A, apps) { let best = null, bs = 0; for (const B of apps) { if (B.e.name === A.e.name) continue; const sn = Math.abs(A.dx * B.dz - A.dz * B.dx); if (sn > bs) { bs = sn; best = B; } } return best; }
  function addBlade(name, x, y, z, vx, vz, scale = 1) {
    const slot = NA.slots.get(name); if (!slot) return -1;
    return sets.blade.add(yawM(x, y, z, yawAlongX(vx, vz), scale, scale, 1), { aUv: slot });
  }
  // road decal: centre, along-axis (ux,uz) = texture "up", sizes (w across, l along), uv rect
  function roadDecal(x, z, ux, uz, w, l, uv, lift = 0.085, tint = 1) {
    const rx = -uz, rz = ux; // texture right (the driver's right) when "up" = (ux, uz)
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const px = x + rx * a * w / 2 + ux * b * l / 2, pz = z + rz * a * w / 2 + uz * b * l / 2; return [px, H(px, pz) + lift, pz]; });
    decals.rgb(tint, tint, tint);
    decals.textured();
    decals.quad(P[0], P[1], P[2], P[3], [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
    decals.flat();
  }
  let nSignals = 0, nStops = 0;
  for (const n of graph.nodes) {
    if (!n.signal && !n.stop) continue;
    const apps = approaches(n);
    if (apps.length < 3) continue;
    if (n.signal) {
      nSignals++;
      for (const A of apps) {
        const Dfar = crossDist(A, apps);
        let px = n.x + A.dx * (Dfar + 1.1) + A.rx * (A.hw + 0.9), pz = n.z + A.dz * (Dfar + 1.1) + A.rz * (A.hw + 0.9);
        let y = sidewalkOK(px, pz, 0.35);
        if (y === null) { px = n.x + A.dx * (Dfar + 2.5) + A.rx * (A.hw + 1.4); pz = n.z + A.dz * (Dfar + 2.5) + A.rz * (A.hw + 1.4); y = sidewalkOK(px, pz, 0.35); }
        if (y === null) continue;
        const yaw = yawFront(-A.rx, -A.rz);
        place('signalPole', px, y, pz, yaw, { r: 0.28, h: 7.4, kind: 'pole' });
        occupy(px, pz, 0.8);
        const lat = (px - n.x) * A.rx + (pz - n.z) * A.rz;
        const lanes = Math.max(1, A.e.lanes);
        const armLen = Math.max(3.2, lat - laneOff(A.e, 0) + 0.7);
        sets.arm.add(yawM(px, y + 5.9, pz, yaw, 1, 1, armLen));
        const grp = { node: n, hx: A.dx, hz: A.dz, idx: [], ped: false };
        const hyaw = yawFront(-A.dx, -A.dz);
        for (let l = 0; l < lanes; l++) {
          const off = lat - laneOff(A.e, l);
          const hx = px - A.rx * off, hz = pz - A.rz * off;
          grp.idx.push(sets.head.add(yawM(hx, y + 5.9 - 0.72, hz, hyaw), { aState: 0 }));
        }
        // near-side supplemental head on the pole
        grp.idx.push(sets.head.add(yawM(px - A.rx * 0.32, y + 3.3, pz - A.rz * 0.32, hyaw), { aState: 0 }));
        heads.push(grp);
        // pedestrian heads: across the approach (walk with the crossing traffic) and along it
        const pA = { node: n, hx: A.rx, hz: A.rz, idx: [], ped: true, set: 'ped' };
        pA.idx.push(sets.ped.add(yawM(px - A.rx * 0.22, y + 2.75, pz - A.rz * 0.22, yawFront(-A.rx, -A.rz)), { aState: 0 }));
        heads.push(pA);
        const pB = { node: n, hx: A.dx, hz: A.dz, idx: [], ped: true, set: 'ped' };
        pB.idx.push(sets.ped.add(yawM(px + A.dx * 0.22, y + 2.75, pz + A.dz * 0.22, yawFront(A.dx, A.dz)), { aState: 0 }));
        heads.push(pB);
        // mast-arm street name sign: the street you are about to cross
        const B = crossName(A, apps);
        if (B) { const s = Math.min(armLen - 0.8, armLen * 0.62); addBlade(B.e.name, px - A.rx * s, y + 6.32, pz - A.rz * s, A.rx, A.rz, 1.9); }
      }
    } else {
      // stop signs on the near-right corner of each approach, STOP painted on the lane
      let bladed = false;
      for (const A of apps) {
        const Dn = crossDist(A, apps);
        const px = n.x - A.dx * (Dn + 1.3) + A.rx * (A.hw + 0.55), pz = n.z - A.dz * (Dn + 1.3) + A.rz * (A.hw + 0.55);
        const y = sidewalkOK(px, pz, 0.2);
        if (y === null || !free(px, pz, 0.3)) continue;
        const tall = !bladed && n.grid;
        const model = tall ? 'stopTall' : 'stop';
        const { c } = place(model, px, y, pz, yawFront(-A.dx, -A.dz), { r: 0.12, h: 2.9, breakable: true });
        occupy(px, pz, 0.5);
        nStops++;
        if (tall) {
          bladed = true;
          const B = crossName(A, apps);
          const by = models.stopTall.bladeY;
          const b1 = addBlade(A.e.name, px, y + by[0], pz, A.dx, A.dz);
          const b2 = B ? addBlade(B.e.name, px, y + by[1], pz, B.dx, B.dz) : -1;
          if (c) c.propRef.blades = [b1, b2].filter(i => i >= 0);
        }
        // painted STOP on the approach lane (reads toward the driver: text "up" = travel direction)
        if (A.e.width >= 10) {
          const lo = laneOff(A.e, 0), sx = n.x - A.dx * (Dn + 6.2) + A.rx * lo, sz = n.z - A.dz * (Dn + 6.2) + A.rz * lo;
          roadDecal(sx, sz, A.dx, A.dz, Math.min(2.9, A.e.laneW * 0.8), 1.45, DUV(TX.DA.stop), 0.09, 0.95);
        }
      }
    }
  }
  T.intersections = performance.now() - tt;

  // ---------------------------------------------------------------- trolley streets: span poles + contact wires (edge driven)
  tt = performance.now();
  const wires = new WireBuilder(400);
  const roadY = (e, x, z) => H(x, z) + 0.05;
  let nTrolleyPoles = 0;
  for (const e of graph.edges) {
    if (e.deck || !TROLLEY.has(e.name) || e.width < 12 || e.kind === 'crooked') continue;
    const market = e.name === 'Market St' && e.width >= 16;
    const P = resample(e.pts, 4);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const len = cum[cum.length - 1];
    const pointAt = (s) => { let i = 0; while (i < P.length - 2 && cum[i + 1] < s) i++; const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dz) || 1; return [P[i][0] + dx * t, P[i][1] + dz * t, dx / l, dz / l]; };
    const hw = e.width / 2;
    const trimA = (e.a.deg >= 3 ? e.a.radius : 0) + 7, trimB = (e.b.deg >= 3 ? e.b.radius : 0) + 7;
    const spacing = market ? 30 : 33;
    const outerO = laneOff(e, e.lanes - 1);
    const contactOffs = [outerO - 0.3, outerO + 0.3, -(outerO - 0.3), -(outerO + 0.3)];
    if (market) contactOffs.push(laneOff(e, 0), -laneOff(e, 0));
    const stations = [];
    if (len > trimA + trimB + 4) {
      const nSt = Math.max(1, Math.round((len - trimA - trimB) / spacing));
      for (let i = 0; i <= nSt; i++) stations.push(trimA + (len - trimA - trimB) * (nSt ? i / nSt : 0.5));
    }
    stations.forEach((s, si) => {
      const [x, z, dx, dz] = pointAt(s);
      const rx = -dz, rz = dx;
      const ends = [];
      for (const sd of [1, -1]) {
        const px = x + rx * sd * (hw + 0.45), pz = z + rz * sd * (hw + 0.45);
        const y = sidewalkOK(px, pz, 0.3);
        if (y === null || !free(px, pz, 0.5)) { ends.push(null); continue; }
        const yaw = yawFront(-rx * sd, -rz * sd);
        let top;
        if (market) {
          place('ornate', px, y, pz, yaw, { r: 0.3, h: 8, breakable: false, kind: 'pole' });
          const hd = models.ornate.heads2;
          for (const h of hd) { const c = Math.cos(yaw), sn = Math.sin(yaw); addLampHead(px + c * h[0] + sn * h[2], y + h[1], pz - sn * h[0] + c * h[2], 6.5, LCOL.warm); }
          top = [px, y + 6.9, pz];
        } else {
          const lamp = (si + (sd > 0 ? 0 : 1)) % 2 === 0;
          place(lamp ? 'trolleyLamp' : 'trolley', px, y, pz, yaw, { r: 0.28, h: 9, kind: 'pole' });
          if (lamp) { const hd = models.trolleyLamp.head, c = Math.cos(yaw), sn = Math.sin(yaw); addLampHead(px + c * hd[0] + sn * hd[2], y + hd[1], pz - sn * hd[0] + c * hd[2], 8, LCOL.cool); }
          top = [px - rx * sd * 0.2, y + 6.85, pz - rz * sd * 0.2];
        }
        occupy(px, pz, 0.8); nTrolleyPoles++;
        ends.push(top);
      }
      // span wire across the street with the contact wire hangers
      if (ends[0] && ends[1]) {
        wires.span(ends[0], ends[1], 0.28, 10);
        // droppers from the span wire down to each contact wire
        const A = ends[0], B = ends[1], W = B[0] - A[0], Z = B[2] - A[2], LL = W * W + Z * Z || 1;
        for (const o of contactOffs) {
          const wx = x - dz * o, wz = z + dx * o;
          const t = Math.max(0, Math.min(1, ((wx - A[0]) * W + (wz - A[2]) * Z) / LL));
          const sy = A[1] + (B[1] - A[1]) * t - 0.28 * 4 * t * (1 - t);
          wires.line([[wx, sy, wz], [wx, roadY(e, wx, wz) + 5.75, wz]]);
        }
      }
    });
    // contact wires (2 per direction over the curb lane) + streetcar wire on Market
    for (const o of contactOffs) {
      const pts = [];
      for (let s = 0; s <= len + 0.01; s += 4) {
        const [x, z, dx, dz] = pointAt(Math.min(s, len));
        const wx = x - dz * o, wz = z + dx * o;
        const ph = (s % 33) / 33;
        pts.push([wx, roadY(e, wx, wz) + 5.75 - 0.14 * Math.sin(ph * Math.PI), wz]);
      }
      wires.line(pts);
    }
  }
  T.trolley = performance.now() - tt;

  // ---------------------------------------------------------------- curb-driven props
  tt = performance.now();
  const woodLines = new Map();   // lineKey -> [{ along, top:[4 anchors], comm, x, z, y, C }]
  let nLamps = 0, nHyd = 0;
  const busStops = [];
  for (const C of curbs) {
    const zone = C.zone, L = C.L, h = hash2(C.e.id * 3.1, C.b.id * 1.7, 5);
    const eh = hash2(C.e.id, 7, 11);
    // ---- lamps / utility poles
    if (!C.trolley) {
      const avenuesLocal = zone === 'avenues' && C.width <= 12;
      if (avenuesLocal) {
        const ns = Math.abs(C.dz) > Math.abs(C.dx);             // curb runs N-S
        const lineKey = ns ? 'x' + Math.round(C.ax - C.nx * (C.width / 2)) : 'z' + Math.round(C.az - C.nz * (C.width / 2));
        const lineCoord = ns ? Math.round(C.ax - C.nx * C.width / 2) : Math.round(C.az - C.nz * C.width / 2);
        const sideSel = hash2(lineCoord, 3, 17) < 0.5 ? 1 : -1;
        const side = ns ? Math.sign(C.nx) : Math.sign(C.nz);
        if (side === sideSel) {
          const sp = 40, s0 = 6 + (hash2(lineCoord, 9, 2) * 12);
          for (let s = s0; s < L - 5; s += sp) {
            const [x, z] = at(C, s, 0.42);
            const y = sidewalkOK(x, z, 0.2); if (y === null || !free(x, z, 0.5)) continue;
            const tr = hash2(x, z, 4) < 0.18;
            place(tr ? 'woodT' : 'wood', x, y, z, C.yaw, { r: 0.2, h: 10.5, kind: 'pole' });
            occupy(x, z, 0.7);
            const mdl = tr ? models.woodT : models.wood;
            const c = Math.cos(C.yaw), sn = Math.sin(C.yaw), W = (p) => [x + c * p[0] + sn * p[2], y + p[1], z - sn * p[0] + c * p[2]];
            addLampHead(...W(mdl.head), 6.5, LCOL.sodium); nLamps++;
            let arr = woodLines.get(lineKey + ':' + side); if (!arr) woodLines.set(lineKey + ':' + side, arr = []);
            arr.push({ along: ns ? z : x, anchors: mdl.wires.map(W), comm: W(mdl.comm), x, y, z, C, s });
          }
        }
      } else {
        let type, sp, u = 0.45;
        if (C.embarcadero) { type = 'ornate'; sp = 28; }
        else if (DOWNTOWN.has(zone) || zone === 'soma' || zone === 'tenderloin' || zone === 'chinatown') { type = 'cobra'; sp = 30; }
        else if (C.width >= 16 || C.kind === 'highway') { type = 'cobraTall'; sp = 38; }
        else if (C.width >= 14 || C.commercial || zone === 'industrial' || zone === 'wharf') { type = 'cobra'; sp = 34; }
        else { type = 'post'; sp = 44; }
        const s0 = 5 + eh * sp * (C.nx + C.nz > 0 ? 0.5 : 1) % sp;
        for (let s = Math.max(5, s0 % sp); s < L - 4; s += sp) {
          const [x, z] = at(C, s, u);
          const y = sidewalkOK(x, z, 0.25); if (y === null || !free(x, z, 0.6)) continue;
          const { c } = place(type, x, y, z, C.yaw, { r: 0.2, h: 9, breakable: true });
          occupy(x, z, 0.7);
          const mdl = models[type], cc = Math.cos(C.yaw), sn = Math.sin(C.yaw);
          const hds = mdl.heads2 || [mdl.head];
          const li = [];
          for (const hd of hds) li.push(addLampHead(x + cc * hd[0] + sn * hd[2], y + hd[1], z - sn * hd[0] + cc * hd[2], type === 'cobraTall' ? 10 : type === 'cobra' ? 8.5 : 6.2, type === 'post' || type === 'ornate' ? LCOL.warm : LCOL.cool));
          if (c) c.propRef.lamps = li;
          nLamps++;
        }
      }
    }
    // ---- hydrants (near a corner, some mid-block)
    if (L > 18) {
      const spots = [];
      if (h < 0.62) spots.push(h < 0.31 ? 5 + h * 6 : L - 5 - h * 4);
      if (L > 90 && hash2(C.e.id, C.b.id, 21) < 0.35) spots.push(L * 0.5);
      for (const s of spots) {
        const [x, z] = at(C, s, 0.5);
        const y = sidewalkOK(x, z, 0.2); if (y === null || !free(x, z, 0.4)) continue;
        place('hydrant', x, y, z, C.yaw, { r: 0.2, h: 0.85, breakable: true });
        occupy(x, z, 0.5); C.hydrants.push(s); nHyd++;
      }
    }
    // ---- bus stops (trolley / arterial / commercial main streets)
    if ((C.trolley || (C.width >= 16 && C.kind !== 'highway') || C.market) && L > 45 && hash2(C.e.id, C.b.id, 33) < (C.market ? 0.5 : 0.34)) {
      const down = C.hx * C.dx + C.hz * C.dz > 0;
      const s = down ? L - 13 : 13;
      const shelter = C.commercial || C.width >= 16 ? hash2(C.b.id, 2, 3) < 0.7 : hash2(C.b.id, 2, 3) < 0.3;
      if (shelter) {
        const [x, z] = at(C, s, 2.35);
        const y = sidewalkOK(x, z, 0.3);
        const [bx2, bz2] = at(C, s, 3.25);
        if (y !== null && !hitsCollider(bx2, y, bz2, 0.2) && free(x, z, 2.2)) {
          place('shelter', x, y, z, C.yaw, { hx: 2.15, hz: 0.78, h: 2.7, kind: 'prop' });
          occupy(x, z, 2.3);
          const [lx, lz] = at(C, s, 2.35);
          addLampHead(lx, y + 2.5, lz, 3.2, LCOL.cool);
        }
      }
      const sp = s + (down ? 3.2 : -3.2);
      const [px, pz] = at(C, sp, 0.45);
      const py = sidewalkOK(px, pz, 0.15);
      if (py !== null && free(px, pz, 0.3)) { place('busPole', px, py, pz, C.yaw, { r: 0.08, h: 3.2, breakable: true }); occupy(px, pz, 0.4); }
      if (!shelter) { const [bx, bz] = at(C, s, 2.0); const by = sidewalkOK(bx, bz, 0.4); if (by !== null && free(bx, bz, 1.0)) { place('bench', bx, by, bz, C.yaw, { hx: 0.9, hz: 0.3, h: 0.9, breakable: true }); occupy(bx, bz, 1.0); } }
      C.noPark.push([s - 12, s + 8]);
      busStops.push([C, s]);
    }
  }
  // utility wires along the avenues + service drops
  let nWoodSpans = 0;
  for (const [, arr] of woodLines) {
    arr.sort((a, b) => a.along - b.along);
    for (let i = 0; i < arr.length; i++) {
      const A = arr[i];
      const B = arr[i + 1];
      if (B && Math.hypot(B.x - A.x, B.z - A.z) < 80) {
        for (let w = 0; w < 4; w++) wires.span(A.anchors[w], B.anchors[w], w === 3 ? 0.35 : 0.55, 10);
        wires.span(A.comm, B.comm, 0.7, 10); nWoodSpans++;
      }
      // service drops to up to two houses on this curb
      let drops = 0;
      for (const lot of A.C.b.lots) {
        if (drops >= 2) break;
        if (lot.front[0] * -A.C.nx + lot.front[1] * -A.C.nz < 0.9) continue;
        const fx = lot.x + lot.front[0] * lot.hz, fz = lot.z + lot.front[1] * lot.hz;
        const dAl = (fx - A.x) * A.C.dx + (fz - A.z) * A.C.dz;
        if (Math.abs(dAl) > 17 || hash2(fx, fz, 8) < 0.35) continue;
        wires.span([A.comm[0], A.comm[1] - 0.2, A.comm[2]], [fx - A.C.nx * 0.05, H(fx, fz) + 5.4, fz - A.C.nz * 0.05], 0.3, 6);
        drops++;
      }
    }
  }
  T.curbs2 = performance.now() - tt;

  // ---------------------------------------------------------------- trees
  tt = performance.now();
  const trees = [];   // { sp, x, y, z, yaw, s, sy, tint }
  const treeOcc = (x, z, r) => free(x, z, r);
  function addTree(spId, x, y, z, s, { yaw = rnd() * TAU, sy = 0.92 + rnd() * 0.16, tint = null, collide = true } = {}) {
    const sp = TR.SPECIES_INDEX[spId];
    const S = TR.SPECIES[sp];
    const t = tint || [0.86 + rnd() * 0.24, 0.86 + rnd() * 0.24, 0.84 + rnd() * 0.2];
    trees.push({ sp, x, y, z, yaw, s, sy, tint: t });
    if (collide && S.collider > 0) colliders.push({ x, z, hx: S.collider * s, hz: S.collider * s, yaw: 0, yMin: y - 0.5, yMax: y + S.H * s * sy, kind: 'tree' });
  }
  let nStreetTrees = 0;
  const pitUV = DUV(TX.DA.pit);
  for (const C of curbs) {
    let spList = null, spacing = 9, u = 1.0, lined = 0;
    if (C.market) { spList = [['plane', 1]]; spacing = 9.5; lined = 1; u = 1.25; }
    else if (C.name === 'Dolores St') { spList = [['palm', 0.6], ['canary2', 0.4]]; spacing = 14; lined = 1; u = 1.1; }
    else if (C.embarcadero) { spList = null; }
    else if (C.name === 'Sunset Blvd' || C.name === 'Park Presidio Blvd' || C.name === '19th Ave') { spList = [['cypress2', 0.5], ['pine2', 0.5]]; spacing = 13; lined = 0.8; u = 1.3; }
    else if (C.name === 'Van Ness Ave') { spList = [['plane2', 1]]; spacing = 11; lined = 0.9; }
    else if (!DOWNTOWN.has(C.zone) && C.zone !== 'chinatown' && STREET_TREES[C.zone]) { spList = STREET_TREES[C.zone]; lined = LINED[C.zone] ?? 0.2; spacing = C.zone === 'avenues' ? 10 : 8.5; }
    if (!spList || C.park) continue;
    if (hash2(C.e.id, 5, 71) > lined) continue;
    // one species per block face mostly, mixed sometimes
    const main = pickW(spList, hash2(C.e.id, C.b.id, 13));
    for (let s = 4.5 + hash2(C.b.id, C.e.id, 3) * 3; s < C.L - 4.5; s += spacing + (rnd() - 0.5) * 2) {
      if (rnd() < 0.12) continue;
      const [x, z] = at(C, s, u);
      const y = sidewalkOK(x, z, 0.6); if (y === null || !free(x, z, 1.1)) continue;
      const spId = rnd() < 0.8 ? main : pickW(spList, rnd());
      const [a, b] = C.market ? [0.9, 1.1] : STREET_SCALE[spId] || [0.8, 1];
      addTree(spId, x, y - 0.12, z, a + rnd() * (b - a));
      occupy(x, z, 1.2);
      // tree pit (sidewalk decal)
      const P = [[-0.65, -0.65], [0.65, -0.65], [0.65, 0.65], [-0.65, 0.65]].map(([p, q]) => { const px = x + C.dx * p + C.nx * q, pz = z + C.dz * p + C.nz * q; return [px, H(px, pz) + 0.165, pz]; });
      decals.textured(); decals.rgb(1, 1, 1); decals.quad(P[0], P[1], P[2], P[3], [[pitUV[0], pitUV[1]], [pitUV[2], pitUV[1]], [pitUV[2], pitUV[3]], [pitUV[0], pitUV[3]]]); decals.flat();
      nStreetTrees++;
    }
  }
  T.streetTrees = performance.now() - tt;

  // ---------------------------------------------------------------- remaining sidewalk furniture
  tt = performance.now();
  const counts = { meter: 0, pay: 0, trash: 0, news: 0, bench: 0, bike: 0, planter: 0, bollard: 0, mailbox: 0, psign: 0 };
  for (const C of curbs) {
    const zone = C.zone, L = C.L, com = C.commercial, dt = DOWNTOWN.has(zone);
    const R = mulberry(Math.floor(hash2(C.e.id, C.b.id, 99) * 1e9));
    const put = (model, s, u, yaw, r, h, opts = {}) => {
      const [x, z] = at(C, s, u);
      const y = sidewalkOK(x, z, r); if (y === null || !free(x, z, r + 0.15)) return false;
      place(model, x, y, z, yaw, { r, h, breakable: opts.breakable ?? true, hx: opts.hx, hz: opts.hz });
      occupy(x, z, r + 0.2); counts[model.replace('news2', 'news')] = (counts[model.replace('news2', 'news')] || 0) + 1;
      return true;
    };
    // parking meters / pay stations
    if (com && C.parking && !C.market && L > 24) {
      if (dt && R() < 0.5) { put('pay', L * (0.3 + R() * 0.4), 0.45, C.yaw, 0.25, 1.6); }
      else if (R() < 0.65) for (let s = 7.5; s < L - 7; s += 6.2) { if (R() < 0.12) continue; put('meter', s, 0.35, C.yaw, 0.12, 1.5); }
    }
    // trash cans at corners
    const trashP = com ? 0.6 : C.park ? 0.35 : 0.08;
    if (R() < trashP) put('trash', 3.6, 0.6, C.yaw + R() * TAU, 0.33, 1.1);
    if (R() < trashP * 0.6) put('trash', L - 3.6, 0.6, C.yaw + R() * TAU, 0.33, 1.1);
    // newspaper boxes near downtown corners
    if ((dt || zone === 'soma' || zone === 'tenderloin' || zone === 'chinatown' || zone === 'northbeach' || C.market) && R() < 0.45) {
      put(R() < 0.5 ? 'news' : 'news2', R() < 0.5 ? 6.5 : L - 6.5, 0.95, C.yaw + Math.PI, 0.45, 1.1, { hx: 0.7, hz: 0.25 });
    }
    // bike racks, planters, benches
    if (com && R() < 0.35) put('bike', 10 + R() * (L - 20), 0.9, C.yaw + Math.PI / 2, 0.5, 1, { hx: 0.55, hz: 0.4 });
    if ((dt || C.market) && R() < (C.market ? 0.9 : 0.3)) { for (let s = 8 + R() * 6; s < L - 8; s += C.market ? 26 : 40) put('planter', s, C.market ? 2.4 : 1.0, C.yaw, 0.6, 1.2, { breakable: false, hx: 0.55, hz: 0.55 }); }
    if ((C.park || C.market) && R() < 0.7) { for (let s = 12 + R() * 10; s < L - 10; s += 28 + R() * 20) put('bench', s, C.park ? 2.6 : 2.2, C.yaw, 0.9, 0.9, { hx: 0.9, hz: 0.3 }); }
    // bollards at busy corners
    if ((dt || C.market) && R() < 0.35) { for (const s of [1.2, 2.2]) put('bollard', s, 0.35, 0, 0.11, 0.95); }
    // mailbox + neighbourhood parking signs
    if (R() < 0.1) put('mailbox', 4.5, 0.7, C.yaw, 0.3, 1.5);
    if (!com && C.parking && !C.park && R() < 0.45) put('psign', 12 + R() * Math.max(1, L - 24), 0.3, C.yaw, 0.1, 2.6);
  }
  T.furniture = performance.now() - tt;

  // ---------------------------------------------------------------- waterfront: Embarcadero palms, promenade, piers
  tt = performance.now();
  let nPalms = 0;
  for (const e of graph.edges) {
    if (e.deck) continue;
    const isEmb = e.name === 'The Embarcadero', isAvP = e.special && e.special.trees === 'palm' && !isEmb;
    if (!isEmb && !isAvP) continue;
    const P = resample(e.pts, 3), trA = (e.a.deg >= 3 ? e.a.radius + 5 : 2), trB = (e.b.deg >= 3 ? e.b.radius + 5 : 2);
    let s = 0;
    for (let i = 1; i < P.length - 1; i++) {
      const [x, z] = P[i];
      s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      if (s < trA || s > e.len - trB) continue;
      const dx = P[i + 1][0] - P[i - 1][0], dz = P[i + 1][1] - P[i - 1][1], l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
      if (isEmb) {
        if (i % 7 === 0 && !nearNode(x, z, 6)) { addTree('palm', x, H(x, z) + 0.02, z, 0.85 + rnd() * 0.2); nPalms++; }
        // promenade on the bay side: find the seawall
        if (i % 1 === 0) {
          const side = coastSDF(x + rx * 20, z + rz * 20) < coastSDF(x - rx * 20, z - rz * 20) ? 1 : -1;
          let o = -1;
          for (let q = e.width / 2 + 2; q < e.width / 2 + 30; q += 0.5) { if (coastSDF(x + rx * side * q, z + rz * side * q) < 1.2) { o = q; break; } }
          if (o > 0) {
            const wx = x + rx * side * (o - 0.7), wz = z + rz * side * (o - 0.7);
            const dk = terrain.deckAt(wx + rx * side * 2, wz + rz * side * 2, 20);
            if (!dk && groundOK(wx, wz)) {
              const wy = H(wx, wz) + 0.02;
              const along = Math.atan2(-(dz / l) * side, (dx / l) * side);
              if (i % 5 === 0) place('mooring', wx, wy, wz, rnd() * TAU, { r: 0.28, h: 0.6, kind: 'prop' });
              else if (i % 5 === 2 || i % 5 === 3) { const px = wx - rx * side * 0.3, pz = wz - rz * side * 0.3; sets.railing.add(yawM(px, H(px, pz), pz, yawAlongX(dx / l, dz / l))); }
              if (i % 10 === 4 && o > e.width / 2 + 7) {
                const lx = x + rx * side * (e.width / 2 + 3.2), lz = z + rz * side * (e.width / 2 + 3.2);
                const ly = H(lx, lz); if (groundOK(lx, lz) && free(lx, lz, 0.5)) { place('ornate', lx, ly + 0.1, lz, yawFront(-rx * side, -rz * side), { r: 0.3, h: 8, breakable: true }); occupy(lx, lz, 0.6); for (const hd of models.ornate.heads2) { const c = Math.cos(yawFront(-rx * side, -rz * side)), sn = Math.sin(yawFront(-rx * side, -rz * side)); addLampHead(lx + c * hd[0] + sn * hd[2], ly + hd[1], lz - sn * hd[0] + c * hd[2], 6.5, LCOL.warm); } }
              }
              if (i % 23 === 11 && o > e.width / 2 + 6) { const bx = x + rx * side * (o - 2.4), bz = z + rz * side * (o - 2.4); if (groundOK(bx, bz) && free(bx, bz, 1)) { place('bench', bx, H(bx, bz) + 0.02, bz, yawFront(rx * side, rz * side), { hx: 0.9, hz: 0.3, h: 0.9, breakable: true }); occupy(bx, bz, 1); } }
              void along;
            }
          }
        }
      } else if (i % 5 === 0) {
        for (const sd of [-1, 1]) { const px = x + rx * sd * (e.width / 2 + 1.6), pz = z + rz * sd * (e.width / 2 + 1.6); if (groundOK(px, pz) && roadClear(px, pz) > 0.5 && free(px, pz, 1)) { addTree('fanpalm', px, H(px, pz), pz, 0.8 + rnd() * 0.25); occupy(px, pz, 1); nPalms++; } }
      }
    }
  }
  function nearNode(x, z, extra) {
    const ne = graph.nearestEdge(x, z, 40); if (!ne) return false;
    for (const n of [ne.edge.a, ne.edge.b]) if (n.deg >= 3 && Math.hypot(n.x - x, n.z - z) < n.radius + extra) return true;
    return false;
  }
  // piers
  for (const d of terrain.decks) {
    if (d.kind !== 'pier') continue;
    const [ax, az, ay] = d.pts[0], [bx, bz] = d.pts[1];
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, rx = -dz, rz = dx, hw = d.hw;
    for (let s = 36; s < L - 1; s += 3) {
      for (const sd of [-1, 1]) {
        const x = ax + dx * s + rx * sd * (hw - 0.25), z = az + dz * s + rz * sd * (hw - 0.25);
        sets.railing.add(yawM(x, ay + 0.02, z, yawAlongX(dx, dz)));
        if (Math.round(s) % 15 === 0) { const mx = ax + dx * s + rx * sd * (hw - 1.1), mz = az + dz * s + rz * sd * (hw - 1.1); place('mooring', mx, ay + 0.02, mz, rnd() * TAU, { r: 0.28, h: 0.6 }); }
        if (Math.round(s) % 42 === 0) {
          const lx = ax + dx * s + rx * sd * (hw - 1.6), lz = az + dz * s + rz * sd * (hw - 1.6);
          const yaw = yawFront(-rx * sd, -rz * sd);
          place('cobra', lx, ay + 0.02, lz, yaw, { r: 0.2, h: 9, breakable: true });
          const hd = models.cobra.head, c = Math.cos(yaw), sn = Math.sin(yaw);
          addLampHead(lx + c * hd[0] + sn * hd[2], ay + hd[1], lz - sn * hd[0] + c * hd[2], 8.5, LCOL.cool);
        }
      }
    }
    for (let q = -hw + 1.5; q < hw - 1.4; q += 3) { const x = bx + rx * q - dx * 0.25, z = bz + rz * q - dz * 0.25; sets.railing.add(yawM(x, ay + 0.02, z, yawAlongX(rx, rz))); }
  }
  // highway / bridge-approach lighting
  for (const e of graph.edges) {
    const bay = e.deck && e.deck.kind === 'baybridge';
    if (!(e.kind === 'highway' && !e.deck) && !bay) continue;
    const P = resample(e.pts.map((p, i) => [p[0], p[1], e.ys ? e.ys[i] : undefined]), 45);
    let sAcc = 0;
    for (let i = 1; i < P.length - 1; i++) {
      sAcc += 45;
      if (bay && sAcc > 640) break;
      const [x, z] = P[i], dx = P[i + 1][0] - P[i - 1][0], dz = P[i + 1][1] - P[i - 1][1], l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
      const sd = i % 2 ? 1 : -1;
      const off = bay ? e.width / 2 + 0.35 : e.width / 2 + 1.6;
      const px = x + rx * sd * off, pz = z + rz * sd * off;
      let y;
      if (bay) { const dk = terrain.deckAt(px - rx * sd * 0.5, pz - rz * sd * 0.5, 999); if (!dk) continue; y = dk.y; }
      else { if (!groundOK(px, pz) || roadClear(px, pz) < 0.4 || terrain.deckAt(px, pz, 999)) continue; y = H(px, pz); }
      const yaw = yawFront(-rx * sd, -rz * sd);
      place('cobraTall', px, y, pz, yaw, { r: 0.22, h: 11, breakable: !bay });
      const hd = models.cobraTall.head, c = Math.cos(yaw), sn = Math.sin(yaw);
      addLampHead(px + c * hd[0] + sn * hd[2], y + hd[1], pz - sn * hd[0] + c * hd[2], 10.5, LCOL.sodium);
    }
  }
  T.waterfront = performance.now() - tt;

  // ---------------------------------------------------------------- parks and forests
  tt = performance.now();
  const treeCounts = {};
  const canForest = (x, z, clear = 3) => {
    if (!groundOK(x, z)) return null;
    const s = terrain.surfaceAt(x, z);
    if (s === SURF.ASPHALT || s === SURF.SAND || s === SURF.WATER) return null;
    if (roadClear(x, z) < clear) return null;
    const y = H(x, z);
    if (terrain.deckAt(x, z, y + 60)) return null;
    if (hitsCollider(x, y, z, 1.5)) return null;
    return y;
  };
  function scatter(region, x0, z0, x1, z1, cell, fn) {
    let n = 0;
    for (let z = z0; z < z1; z += cell) for (let x = x0; x < x1; x += cell) {
      const px = x + hash2(x, z, 1) * cell, pz = z + hash2(x, z, 2) * cell;
      const r = fn(px, pz, hash2(x, z, 3));
      if (r) n++;
    }
    treeCounts[region] = (treeCounts[region] || 0) + n;
  }
  const inOpen = (x, z) => GGP_OPEN.some(([cx, cz, rx, rz]) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1);
  // Golden Gate Park forest
  const TD = Math.sqrt(opts.treeDensity ?? 1);
  // Golden Gate Park: groves (noise-driven density) around open meadows
  scatter('ggpark', -3000, 580, -550, 1140, 10.5 / TD, (x, z, r) => {
    if (!inGGPark(x, z) || inOpen(x, z)) return false;
    const gn = fbm(x * 0.006 + 7.3, z * 0.006 - 2.1, 3);
    if (hash2(x, z, 5) > Math.min(0.9, Math.max(0.04, (gn + 0.1) * 3.2))) return false;
    const y = canForest(x, z, 3.5); if (y === null) return false;
    const sp = r < 0.26 ? 'cypress' : r < 0.36 ? 'cypress2' : r < 0.56 ? 'pine' : r < 0.64 ? 'pine2' : r < 0.78 ? 'euc' : r < 0.86 ? 'euc2' : r < 0.94 ? 'oak' : 'plane';
    addTree(sp, x, y - 0.2, z, 0.8 + hash2(x, z, 9) * 0.35); if (hash2(x, z, 12) < 0.3) addTree('scrub', x + 4, H(x + 4, z + 3) - 0.1, z + 3, 1.1 + r, { collide: false }); return true;
  });
  // JFK Dr lined with trees
  for (const e of graph.edges) {
    if (e.name !== 'JFK Dr' && e.name !== 'MLK Jr Dr') continue;
    const P = resample(e.pts, 18);
    for (let i = 1; i < P.length - 1; i++) {
      const [x, z] = P[i], dx = P[i + 1][0] - P[i - 1][0], dz = P[i + 1][1] - P[i - 1][1], l = Math.hypot(dx, dz) || 1;
      for (const sd of [-1, 1]) {
        const px = x - dz / l * sd * (e.width / 2 + 3.5), pz = z + dx / l * sd * (e.width / 2 + 3.5);
        const y = canForest(px, pz, 2.5); if (y === null || !free(px, pz, 2)) continue;
        addTree(rnd() < 0.5 ? 'euc2' : 'cypress2', px, y - 0.2, pz, 0.75 + rnd() * 0.3); occupy(px, pz, 2);
        treeCounts.ggpark++;
      }
    }
  }
  // Presidio
  scatter('presidio', -1880, -1450, -250, -220, 11.5 / TD, (x, z, r) => {
    if (!inPresidio(x, z)) return false;
    const s = terrain.surfaceAt(x, z), ha = hash2(x, z, 5);
    if (!(s === SURF.FOREST && ha < 0.8) && !(s === SURF.GRASS && ha < 0.03)) return false;
    const y = canForest(x, z, 3.5); if (y === null) return false;
    const sp = r < 0.42 ? (r < 0.25 ? 'euc' : 'euc2') : r < 0.72 ? (r < 0.6 ? 'cypress' : 'cypress2') : r < 0.92 ? 'pine' : 'oak';
    addTree(sp, x, y - 0.2, z, 0.8 + hash2(x, z, 9) * 0.35); if (hash2(x, z, 12) < 0.25) addTree('scrub', x + 4, H(x + 4, z + 3) - 0.1, z + 3, 1.1 + r, { collide: false }); return true;
  });
  // Lands End
  scatter('landsend', -3400, -1100, -1880, 100, 12.5, (x, z, r) => {
    if (!inLandsEnd(x, z)) return false;
    const s = terrain.surfaceAt(x, z);
    const y0 = canForest(x, z, 3); if (y0 === null) return false;
    if (s === SURF.FOREST) { addTree(r < 0.7 ? (r < 0.45 ? 'cypress' : 'cypress2') : 'pine', x, y0 - 0.2, z, 0.75 + hash2(x, z, 9) * 0.4); return true; }
    if (s === SURF.GRASS && r < 0.35) { addTree('scrub', x, y0 - 0.1, z, 0.8 + r, { collide: false }); return true; }
    return false;
  });
  // Twin Peaks / Mt Sutro
  scatter('twinpeaks', -860, 1170, 40, 2100, 12, (x, z, r) => {
    if (!inTwinPeaks(x, z)) return false;
    const sutro = Math.hypot(x + 640, z - 1392) < 260;
    const s = terrain.surfaceAt(x, z);
    const y = canForest(x, z, 3); if (y === null) return false;
    if (sutro && s !== SURF.ROCK && r < 0.7) { addTree(r < 0.4 ? 'euc' : r < 0.6 ? 'euc2' : 'cypress', x, y - 0.2, z, 0.8 + hash2(x, z, 9) * 0.35); return true; }
    if (s === SURF.FOREST && r < 0.5) { if (r < 0.08) addTree('euc2', x, y - 0.2, z, 0.7 + r * 3); else addTree('scrub', x, y - 0.1, z, 0.8 + r, { collide: false }); return true; }
    if (s === SURF.GRASS && r < 0.18) { addTree('scrub', x, y - 0.1, z, 0.7 + r * 2, { collide: false }); return true; }
    return false;
  });
  // Marin Headlands: coastal scrub + trees in the gullies
  scatter('marin', -3600, -3400, -300, -2100, 13, (x, z, r) => {
    if (z > -2140) return false;
    const s = terrain.surfaceAt(x, z);
    if (s !== SURF.FOREST && s !== SURF.GRASS) return false;
    const y = canForest(x, z, 3); if (y === null) return false;
    const n = fbm(x * 0.006 + 3.1, z * 0.006, 2);
    if (s === SURF.FOREST && n > 0.32 && r < 0.45) { addTree(r < 0.22 ? 'cypress' : r < 0.34 ? 'oak2' : r < 0.45 ? 'euc2' : 'pine', x, y - 0.2, z, 0.7 + hash2(x, z, 9) * 0.4); return true; }
    if (s === SURF.FOREST && r < 0.62) { addTree('scrub', x, y - 0.1, z, 0.8 + r * 0.9, { collide: false }); return true; }
    if (s === SURF.GRASS && r < 0.14) { addTree('scrub', x, y - 0.1, z, 0.6 + r * 2, { collide: false }); return true; }
    return false;
  });
  // Yerba Buena Island
  scatter('ybi', 2700, -1850, 3800, -1000, 17, (x, z, r) => {
    if (terrain.surfaceAt(x, z) !== SURF.FOREST) return false;
    const y = canForest(x, z, 3.5); if (y === null) return false;
    addTree(r < 0.45 ? 'euc' : r < 0.7 ? 'cypress' : 'pine', x, y - 0.2, z, 0.8 + hash2(x, z, 9) * 0.35); return true;
  });
  // park blocks inside the grid
  for (const b of blocks) {
    if (!b.park || !b.inner) continue;
    const cfg = PARKS[b.park]; if (!cfg) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of b.inner) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    if (cfg.grid) {
      for (let z = minZ + 5; z < maxZ - 4; z += cfg.grid) for (let x = minX + 5; x < maxX - 4; x += cfg.grid) {
        if (!pointInConvex(x, z, b.inner)) continue; const y = canForest(x, z, 1); if (y === null) continue;
        addTree(cfg.sp[0][0], x, y, z, 0.62, { yaw: 0.3, sy: 0.85 }); treeCounts.parks = (treeCounts.parks || 0) + 1;
      }
      continue;
    }
    scatter('parks', minX + 2, minZ + 2, maxX - 2, maxZ - 2, cfg.cell, (x, z, r) => {
      if (r > cfg.dens || !pointInConvex(x, z, b.inner)) return false;
      const y = canForest(x, z, 2); if (y === null || !free(x, z, 1)) return false;
      const sp = pickW(cfg.sp, hash2(x, z, 77));
      addTree(sp, x, y - 0.15, z, /palm|canary/.test(sp) ? 0.85 + r * 0.3 : sp === 'scrub' ? 0.9 + r : 0.7 + hash2(x, z, 9) * 0.4, { collide: sp !== 'scrub' });
      return true;
    });
  }
  T.forests = performance.now() - tt;

  // ---------------------------------------------------------------- build tree meshes (Blender-baked LOD0 / LOD1 per species + one impostor set)
  tt = performance.now();
  const treeSets = TR.buildTreeSets(trees, U, InstanceSet, yawM);
  T.treeMeshes = performance.now() - tt;

  // ---------------------------------------------------------------- parked cars
  tt = performance.now();
  const carSets = {}, carSpecs = {}, carHi = {};
  const HI_MODELS = new Set(opts.hiCars ?? CAR_MODELS.map(([id]) => id));
  const HI_DIST = 42;
  for (const [id] of CAR_MODELS) {
    try {
      carSpecs[id] = getModelSpec(id);
      // proxies everywhere at first; the near LOD (real model) is built lazily a few frames after load (see update)
      carSets[id] = new InstanceSet('parked:' + id, buildCarProxy(id), carMat, { maxDist: 210, minDist: 0, color: true, castShadow: false, height: 2, always: 40 });
      upgradeParkedSet(carSets[id], id, 2);   // baked LOD2 (tools/blender/cars.py) replaces the proxy once loaded
    } catch (err) { console.warn('[props] car model unavailable', id, err); }
  }
  // near LOD: the real car model merged into one vertex-coloured geometry (paint white = instance paint)
  function buildCarHi(id) {
    const car = buildCarModel(id, { paint: 0xffffff });
    car.root.updateMatrixWorld(true);
    const p2 = new THREE.Color(getModelSpec(id).defaultPaint2 ?? 0xf0f0f0);
    const parts = []; let paintN = 0;
    car.root.traverse(o => {
      if (!o.isMesh) return;
      const src = o.geometry, n = src.attributes.position.count, mn = o.material.name;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position.clone());
      g.setAttribute('normal', src.attributes.normal.clone());
      let col;
      if (src.attributes.color && mn !== 'car-paint') { const a = src.attributes.color; col = new THREE.Float32BufferAttribute(n * 3, 3); for (let i = 0; i < n; i++) col.setXYZ(i, a.getX(i), a.getY(i), a.getZ(i)); }
      else {
        let c = [0.62, 0.62, 0.62];
        if (mn === 'car-paint') c = paintN++ === 0 ? [1, 1, 1] : [p2.r * 0.96, p2.g * 0.96, p2.b * 0.96];
        else if (mn === 'car-glass') c = [0.016, 0.02, 0.025];
        const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set(c, i * 3); col = new THREE.BufferAttribute(arr, 3);
      }
      g.setAttribute('color', col);
      if (src.index) g.setIndex(src.index.clone());
      g.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0 && g.index) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
      parts.push(g);
    });
    car.dispose();
    const merged = mergeGeometries(parts, false);
    merged.computeBoundingSphere();
    return merged;
  }
  const parkedList = [];
  const _c = new THREE.Color();
  const _f = new V3(), _r = new V3(), _u = new V3(), _b = new V3(), _mx = new THREE.Matrix4();
  for (const C of curbs) {
    if (!C.parking || C.market || C.embarcadero) continue;
    const zone = C.zone;
    const dens = DOWNTOWN.has(zone) ? 0.68 : zone === 'industrial' ? 0.4 : zone === 'avenues' ? 0.48 : C.park ? 0.3 : 0.57;
    const R = mulberry(Math.floor(hash2(C.e.id, C.b.id, 55) * 1e9));
    const blocked = (s0, s1) => {
      for (const h of C.hydrants) if (s1 > h - 2.6 && s0 < h + 2.6) return true;
      for (const [a, b] of C.noPark) if (s1 > a && s0 < b) return true;
      return false;
    };
    const residential = !C.commercial && !DOWNTOWN.has(zone);
    let s = 6.8 + R() * 1.5;
    while (s < C.L - 6.8) {
      let id = pickW(CAR_MODELS, R());
      if (id === 'taxi' && !C.commercial) id = 'sedan';
      if (!carSets[id]) { s += 5; continue; }
      const sp = carSpecs[id], len = sp.length, wid = sp.width;
      const s0 = s, s1 = s + len;
      if (s1 > C.L - 6.8) break;
      if (R() < dens && !blocked(s0, s1)) {
        const sc = (s0 + s1) / 2;
        const [x, z] = at(C, sc, -(0.28 + wid / 2));
        // orientation: heading along the lane next to this curb, pitched/rolled to the road
        const hx = C.hx, hz = C.hz, rx = -hz, rz = hx;
        const fl = len * 0.38, wl = wid * 0.4;
        const hF = H(x + hx * fl, z + hz * fl), hB = H(x - hx * fl, z - hz * fl), hR = H(x + rx * wl, z + rz * wl), hL = H(x - rx * wl, z - rz * wl);
        const y = Math.max((hF + hB) / 2, (hR + hL) / 2) + 0.04;
        _f.set(hx * 2 * fl, hF - hB, hz * 2 * fl).normalize();
        _r.set(rx * 2 * wl, hR - hL, rz * 2 * wl).normalize();
        _u.crossVectors(_r, _f).normalize();
        _r.crossVectors(_f, _u).normalize();
        _b.copy(_f).negate();
        _mx.makeBasis(_r, _u, _b); _mx.setPosition(x, y, z);
        const paint = id === 'taxi' ? 0xf2c230 : pickW(CAR_PAINT, R());
        _c.setHex(paint);
        const set = carSets[id];
        const index = set.add(_mx.elements, null, [_c.r, _c.g, _c.b]);
        const yaw = yawFront(hx, hz);
        const id2 = 'parked:' + parkedList.length;
        const col = { x, z, hx: wid / 2, hz: len / 2, yaw, yMin: y - 0.2, yMax: y + sp.height, kind: 'parked', breakable: false, id: id2, index: parkedList.length };
        colliders.push(col);
        parkedList.push({ id: id2, model: id, paint, x, y, z, yaw, matrix: _mx.elements.slice(), col: [_c.r, _c.g, _c.b], collider: col, set: id, setIndex: index, hiIndex: -1, hidden: false });
        // oil stain under some
        if (R() < 0.2) roadDecal(x + hx * (R() - 0.5) * 2, z + hz * (R() - 0.5) * 2, hx, hz, 1.4, 2.2, DUV(TX.DA.oil), 0.088, 1);
      } else if (R() < 0.25) {
        const [x, z] = at(C, (s0 + s1) / 2, -1.1); roadDecal(x, z, C.hx, C.hz, 1.3, 2.0, DUV(TX.DA.oil), 0.088, 1);
      }
      s = s1 + 0.8 + R() * 1.6 + (residential && R() < 0.2 ? 3.2 : 0);
    }
  }
  T.parked = performance.now() - tt;

  // ---------------------------------------------------------------- road decals: manholes, drains, patches, curb paint
  tt = performance.now();
  for (const e of graph.edges) {
    if (e.deck || e.kind === 'crooked') continue;
    const R = mulberry(e.id * 977 + 13);
    const trA = (e.a.deg >= 3 ? e.a.radius + 4 : 2), trB = (e.b.deg >= 3 ? e.b.radius + 4 : 2);
    for (let s = trA + R() * 30; s < e.len - trB; s += 30 + R() * 40) {
      const p = edgeAt(e, s);
      const r = R();
      const lat = r < 0.5 ? laneOff(e, 0) * (R() < 0.5 ? 1 : -1) + (R() - 0.5) * 0.8 : (R() - 0.5) * 1.2;
      const x = p.x - p.dz * lat, z = p.z + p.dx * lat;
      if (r < 0.62) roadDecal(x, z, p.dx, p.dz, 0.92, 0.92, DUV(TX.DA.manhole), 0.088, 1);
      else if (r < 0.75) roadDecal(x, z, p.dx, p.dz, 0.8, 1.1, DUV(TX.DA.plate), 0.088, 1);
      else if (r < 0.9) roadDecal(x, z, p.dx, p.dz, 2.6 + R() * 2, 2 + R() * 2, DUV(TX.DA.patch), 0.086, 1);
      else roadDecal(x, z, p.dx, p.dz, 3.5, 1.6, DUV(TX.DA.crack), 0.087, 1);
    }
  }
  function edgeAt(e, s) {
    const c = e.cum; let k = 0; while (k < c.length - 2 && c[k + 1] < s) k++;
    const t = (s - c[k]) / ((c[k + 1] - c[k]) || 1), a = e.pts[k], b = e.pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l };
  }
  // storm drains at the gutter near corners + painted curbs (red at hydrants / bus zones, some yellow / green / white)
  const drainUV = DUV(TX.DA.drain), whiteUV = DUV(TX.DA.white);
  const curbPaint = (C, s0, s1, rgb) => {
    s0 = Math.max(0.5, s0); s1 = Math.min(C.L - 0.5, s1); if (s1 - s0 < 0.5) return;
    decals.rgb(rgb[0], rgb[1], rgb[2]);
    for (let s = s0; s < s1 - 0.01; s += 1.5) {
      const e1 = Math.min(s1, s + 1.5);
      const [x0, z0] = at(C, s, -0.01), [x1, z1] = at(C, e1, -0.01);
      const [ix0, iz0] = at(C, s, 0.14), [ix1, iz1] = at(C, e1, 0.14);
      const y0 = H(x0, z0), y1 = H(x1, z1);
      // vertical face (outward = -n) and a thin strip on top
      decals.quad([x1, y1 - 0.1, z1], [x0, y0 - 0.1, z0], [x0, y0 + 0.155, z0], [x1, y1 + 0.155, z1], [[whiteUV[0], whiteUV[1]], [whiteUV[2], whiteUV[1]], [whiteUV[2], whiteUV[3]], [whiteUV[0], whiteUV[3]]]);
      decals.quad([x0, y0 + 0.157, z0], [x1, y1 + 0.157, z1], [ix1, H(ix1, iz1) + 0.157, iz1], [ix0, H(ix0, iz0) + 0.157, iz0], [[whiteUV[0], whiteUV[1]], [whiteUV[2], whiteUV[1]], [whiteUV[2], whiteUV[3]], [whiteUV[0], whiteUV[3]]]);
    }
  };
  for (const C of curbs) {
    const R = mulberry(Math.floor(hash2(C.b.id, C.e.id, 404) * 1e9));
    for (const s of [2.4, C.L - 2.4]) {
      if (R() > 0.55) continue;
      const [x, z] = at(C, s, -0.32);
      roadDecal(x, z, C.nx, C.nz, 1.0, 0.5, drainUV, 0.088, 1);
    }
    for (const h of C.hydrants) curbPaint(C, h - 2.5, h + 2.5, [0.46, 0.06, 0.05]);
    for (const [a, b] of C.noPark) curbPaint(C, a + 2, b - 2, [0.46, 0.06, 0.05]);
    if (C.parking && C.commercial && R() < 0.3) { const s = 8 + R() * Math.max(1, C.L - 20); curbPaint(C, s, s + 7, [0.72, 0.6, 0.12]); }
    if (C.parking && R() < 0.06) { const s = 8 + R() * Math.max(1, C.L - 20); curbPaint(C, s, s + 6, R() < 0.5 ? [0.2, 0.45, 0.22] : [0.85, 0.85, 0.82]); }
  }
  T.decals = performance.now() - tt;

  // ---------------------------------------------------------------- light pools (merged, additive)
  tt = performance.now();
  // chunked meshes shown only within a draw distance (saves draw calls on long views)
  const distMeshes = [];
  const byDist = (m, maxD, night = false) => { const bs = m.geometry.boundingSphere || (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere); distMeshes.push({ m, x: bs.center.x, z: bs.center.z, r: bs.radius, maxD, night }); };
  const poolKits = new Map();
  const PC = 800;
  for (let li = 0; li < lamps.length; li++) {
    const L = lamps[li];
    const key = Math.floor(L.x / PC) * 1000 + Math.floor(L.z / PC);
    let k = poolKits.get(key); if (!k) poolKits.set(key, k = { pos: [], uv: [], col: [], idx: [] });
    const r = L.r, N = 3, base = k.pos.length / 3;
    const gy = terrain.groundAt(L.x, L.z, L.y - 0.5);
    const onDeck = L.y - gy < 14 && terrain.deckAt(L.x, L.z, L.y - 0.5);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const u = i / N, v = j / N, x = L.x + (u - 0.5) * 2 * r, z = L.z + (v - 0.5) * 2 * r;
      let y;
      if (onDeck) y = gy + 0.12;
      else { const h = H(x, z); y = h + (terrain.surfaceAt(x, z) === SURF.ASPHALT ? 0.1 : 0.19); }
      k.pos.push(x, y, z); k.uv.push(u, v);
      const I = Math.min(1, 7.5 / (L.y - gy + 1)) * 0.85;
      k.col.push(L.col[0] * I, L.col[1] * I, L.col[2] * I);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + j * (N + 1) + i; k.idx.push(a, a + N + 1, a + N + 2, a, a + N + 2, a + 1); }
    L.pool = { key, start: base, count: (N + 1) * (N + 1) };
  }
  // lamp light pools LIGHT what is underneath (dst * (1 + src)) instead of adding a constant: dark wet asphalt stays dark
  // with a warm pool, pale concrete brightens more (additive pools painted every street milky white at night)
  const poolMat = additiveFog(new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
  const poolMeshes = new Map();
  for (const [key, k] of poolKits) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(k.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(k.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(k.col, 3));
    g.setIndex(k.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(k.idx, 1) : new THREE.Uint16BufferAttribute(k.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, poolMat); m.name = 'props:pools'; m.renderOrder = 1; m.matrixAutoUpdate = false;
    group.add(m); poolMeshes.set(key, m); byDist(m, 650, true);
  }
  const poolList = [...poolMeshes.values()];
  T.pools = performance.now() - tt;

  // ---------------------------------------------------------------- finalize meshes
  tt = performance.now();
  const allSets = [...Object.values(sets), ...treeSets, ...Object.values(carSets)];
  const pendingHi = [...HI_MODELS].filter(id => carSets[id]);
  let hiFrame = 0;
  function buildNextHi() {
    const id = pendingHi.shift(); if (!id) return;
    try {
      const set = new InstanceSet('parkedHi:' + id, buildCarHi(id), carMat, { maxDist: HI_DIST, color: true, castShadow: true, height: 2, always: HI_DIST, cell: 32 });
      for (const p of parkedList) if (p.set === id) p.hiIndex = set.add(p.matrix, null, p.col);
      group.add(set.finalize());
      for (const p of parkedList) if (p.set === id && p.hidden) set.hide(p.hiIndex);
      carHi[id] = set; allSets.push(set); upgradeParkedSet(set, id, 1);
      carSets[id].minDist = HI_DIST; carSets[id].dirty = true;
    } catch (err) { console.warn('[props] parked near LOD failed', id, err); }
  }
  for (const s of allSets) group.add(s.finalize());
  const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const k of decals.m.values()) { if (!k.count) continue; const dm = new THREE.Mesh(k.toGeometry(), decalMat); dm.name = 'props:decals'; dm.receiveShadow = true; dm.renderOrder = 1; dm.matrixAutoUpdate = false; group.add(dm); byDist(dm, 220); }
  const wireMat = makeWireMaterial();
  for (const m of wires.build(wireMat)) { group.add(m); byDist(m, 470); }
  try { buildNightDress({ graph, blocks, heightAt: H, group, night: U.night }); } catch (err) { console.warn('[props] night dressing', err); }
  const fx = createFx({ groundAt: (x, z, y) => terrain.groundAt(x, z, y), shardSet: sets.shard, group });
  // a few real point lights that follow the nearest street lamps at night
  const NPL = opts.pointLights ?? 2;
  const plights = [];
  for (let i = 0; i < NPL; i++) { const l = new THREE.PointLight(0xffe2b8, 0, 26, 2); l.castShadow = false; l.name = 'props:lamplight'; group.add(l); plights.push({ light: l, lamp: -1, k: 0, want: false }); }
  // lamp spatial grid for the point lights
  const LG = 40, lampGrid = new Map();
  lamps.forEach((L, i) => { const k = Math.floor(L.x / LG) * 100000 + Math.floor(L.z / LG); let a = lampGrid.get(k); if (!a) lampGrid.set(k, a = []); a.push(i); });
  T.finalize = performance.now() - tt;

  // find the scene sun (for leaf translucency)
  let sun = null;
  scene.traverse(o => { if (!sun && o.isDirectionalLight) sun = o; });

  // ---------------------------------------------------------------- per-frame
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4();
  const lastCam = new V3(1e9, 0, 0), lastQ = new THREE.Quaternion(), _sd = new V3(), _v = new V3();
  let clock = 0, lightTimer = 0, lastFocusX = 0, lastFocusZ = 0;
  function updateSignals(time) {
    // phases live in the sets' source attribute; a change marks the set dirty so the next cull re-copies it
    const hS = sets.head.asrc.aState, pS = sets.ped.asrc.aState;
    for (let q = 0; q < heads.length; q++) {
      const g = heads[q];
      const ph = signalFor(g.node, g.hx, g.hz, time);
      const st = ph === 'red' ? 0 : ph === 'yellow' ? 1 : 2;
      const set = g.ped ? sets.ped : sets.head, arr = g.ped ? pS : hS;
      for (let w = 0; w < g.idx.length; w++) { const j = set.order[g.idx[w]]; if (arr[j] !== st) { arr[j] = st; set.dirty = true; } }
    }
  }
  const bestL = new Int32Array(8), bestD = new Float64Array(8);
  function updateLights(dt, focus, nightV) {
    lightTimer -= dt;
    if (lightTimer <= 0 && focus && NPL > 0) {
      lightTimer = 0.25;
      for (let q = 0; q < NPL; q++) { bestL[q] = -1; bestD[q] = 45 * 45; }
      const fx0 = Math.floor(focus.x / LG), fz0 = Math.floor(focus.z / LG);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const a = lampGrid.get((fx0 + i) * 100000 + fz0 + j); if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const li = a[n], L = lamps[li]; if (L.broken) continue;
          const d = (L.x - focus.x) ** 2 + (L.z - focus.z) ** 2;
          for (let q = 0; q < NPL; q++) if (d < bestD[q]) { for (let w = NPL - 1; w > q; w--) { bestD[w] = bestD[w - 1]; bestL[w] = bestL[w - 1]; } bestD[q] = d; bestL[q] = li; break; }
        }
      }
      // release lights whose lamp is no longer among the nearest, then assign free lights to new lamps
      for (let p = 0; p < NPL; p++) { const pl = plights[p]; let keep = false; for (let q = 0; q < NPL; q++) if (bestL[q] === pl.lamp) keep = true; pl.want = !keep; }
      for (let q = 0; q < NPL; q++) {
        const li = bestL[q]; if (li < 0) continue;
        let taken = false; for (let p = 0; p < NPL; p++) if (plights[p].lamp === li) taken = true;
        if (taken) continue;
        for (let p = 0; p < NPL; p++) {
          const pl = plights[p];
          if (pl.lamp < 0 || (pl.want && pl.k <= 0.03)) { pl.lamp = li; pl.want = false; const L = lamps[li]; pl.light.position.set(L.x, L.y - 1.3, L.z); pl.light.color.setRGB(L.col[0], L.col[1], L.col[2]); break; }
        }
      }
    }
    for (let p = 0; p < NPL; p++) {
      const pl = plights[p];
      const target = pl.lamp >= 0 && !pl.want && nightV > 0.05 && !lamps[pl.lamp].broken ? 1 : 0;
      pl.k += (target - pl.k) * Math.min(1, dt * 4);
      pl.light.intensity = pl.k * nightV * 45;
      pl.light.visible = pl.light.intensity > 0.5;
    }
  }
  function update(dt, env = {}) {
    clock += dt;
    // lazily build one parked-car near LOD every few frames once the game is running
    if (pendingHi.length && ++hiFrame > 20 && hiFrame % 6 === 0) buildNextHi();
    U.time.value = clock;
    const nightV = typeof env.night === 'number' ? env.night : (nightU?.value ?? 0);
    U.night.value = nightV;
    const time = typeof env.time === 'number' ? env.time : clock;
    const cam = env.camera;
    if (cam) {
      cam.updateMatrixWorld();
      projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projView);
      const moved = cam.position.distanceToSquared(lastCam) > 0.01 || 1 - Math.abs(cam.quaternion.dot(lastQ)) > 1e-6;
      if (moved) { lastCam.copy(cam.position); lastQ.copy(cam.quaternion); }
      for (let i = 0; i < allSets.length; i++) { const s = allSets[i]; if (moved || s.dirty) s.cull(cam.position.x, cam.position.z, frustum); }
      // leaf translucency: sun direction in view space (pointing from the sun into the scene)
      if (sun) {
        _sd.subVectors(sun.position, sun.target.position).normalize().transformDirection(cam.matrixWorldInverse).negate();
        U.sun.value.set(_sd.x, _sd.y, _sd.z, Math.max(0, 1 - nightV * 1.2));
      }
      TR.updateTrees(cam);
    }
    updateSignals(time);
    if (cam) for (let i = 0; i < distMeshes.length; i++) { const d = distMeshes[i], dx = d.x - cam.position.x, dz = d.z - cam.position.z; d.m.visible = Math.sqrt(dx * dx + dz * dz) - d.r < d.maxD && (!d.night || nightV > 0.03); }
    poolMat.color.setScalar(Math.min(1, nightV * 1.15) * 2.6 * (1 - 0.6 * HB_WET.x));   // gain on the lit colour; wet roads: the reflections carry the light instead
    const focus = env.focus || cam?.position;
    if (focus) { lastFocusX = focus.x; lastFocusZ = focus.z; }
    updateLights(dt, focus, nightV);
    fx.update(dt);
  }

  // ---------------------------------------------------------------- breakables
  const _hm = new THREE.Matrix4();
  const SHARD_COL = { cobra: [0.6, 0.62, 0.64], cobraTall: [0.6, 0.62, 0.64], ornate: [0.2, 0.25, 0.2], post: [0.22, 0.28, 0.24], hydrant: [0.92, 0.92, 0.9],
    meter: [0.35, 0.37, 0.4], pay: [0.2, 0.22, 0.25], trash: [0.12, 0.25, 0.16], bench: [0.45, 0.3, 0.2], news: [0.2, 0.35, 0.7], news2: [0.7, 0.2, 0.2],
    bike: [0.6, 0.62, 0.64], bollard: [0.1, 0.1, 0.1], mailbox: [0.1, 0.25, 0.6], psign: [0.8, 0.8, 0.8], stop: [0.8, 0.1, 0.1], stopTall: [0.8, 0.1, 0.1], busPole: [0.6, 0.62, 0.64] };
  const TALL = { cobra: 9.2, cobraTall: 11.5, ornate: 8.4, post: 6.8, stop: 2.8, stopTall: 3.5, psign: 2.6, busPole: 3.1 };
  function onHit(c, speed = 10, dir = null) {
    if (!c || !c.breakable || c.broken || speed < 6 || !c.propRef) return false;
    c.broken = true;
    const ref = c.propRef, set = sets[ref.set];
    let dx, dz;
    if (dir) { dx = dir.x; dz = dir.z; } else { dx = c.x - lastFocusX; dz = c.z - lastFocusZ; }
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    set.matrixAt(ref.index, _hm);
    set.hide(ref.index);
    try { world.colliders.remove(c); } catch { /* not registered */ }
    const col = SHARD_COL[ref.set] || [0.5, 0.5, 0.5];
    if (TALL[ref.set]) fx.knock(set, _hm, { dirX: dx, dirZ: dz, speed, mode: 'tip', height: TALL[ref.set] });
    else fx.knock(set, _hm, { dirX: dx, dirZ: dz, speed, mode: 'tumble' });
    fx.spawnShards(c.x, ref.y, c.z, dx, dz, speed, col, ref.set === 'hydrant' ? 5 : 8);
    if (ref.set === 'hydrant') fx.geyser(c.x, ref.y, c.z, 9);
    if (ref.blades) for (const b of ref.blades) sets.blade.hide(b);
    if (ref.lamps) for (const li of ref.lamps) killLamp(li);
    return true;
  }
  function killLamp(li) {
    const L = lamps[li]; if (!L || L.broken) return; L.broken = true;
    const m = poolMeshes.get(L.pool.key); if (!m) return;
    const colA = m.geometry.attributes.color;
    for (let i = 0; i < L.pool.count; i++) colA.setXYZ(L.pool.start + i, 0, 0, 0);
    colA.needsUpdate = true;
  }
  const parked = {
    list: parkedList,
    get(id) { const i = typeof id === 'number' ? id : +String(id).split(':')[1]; return parkedList[i] || null; },
    hide(id) { const p = parked.get(id); if (!p || p.hidden) return false; p.hidden = true; carSets[p.set].hide(p.setIndex); if (p.hiIndex >= 0 && carHi[p.set]) carHi[p.set].hide(p.hiIndex); try { world.colliders.remove(p.collider); } catch { /* */ } return true; },
    show(id) { const p = parked.get(id); if (!p || !p.hidden) return false; p.hidden = false; carSets[p.set].show(p.setIndex); if (p.hiIndex >= 0 && carHi[p.set]) carHi[p.set].show(p.hiIndex); world.colliders.add(p.collider); return true; },
  };

  const ms = performance.now() - t0;
  const stats = {
    ms: Math.round(ms), timings: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])),
    trees: trees.filter(t => TR.SPECIES[t.sp].kind !== 'scrub').length, shrubs: trees.filter(t => TR.SPECIES[t.sp].kind === 'scrub').length,
    treeRegions: treeCounts, streetTrees: nStreetTrees, palms: nPalms, lamps: lamps.length, lampPosts: nLamps, signals: nSignals, signalHeads: sets.head.n, stops: nStops,
    blades: sets.blade.n, trolleyPoles: nTrolleyPoles, woodSpans: nWoodSpans, hydrants: nHyd, parked: parkedList.length, busStops: busStops.length,
    wireSegments: wires.segments, decalVerts: decals.count, colliders: colliders.length, furniture: counts,
    sets: Object.fromEntries(allSets.map(s => [s.name, s.n])),
  };
  console.log(`[props] built in ${stats.ms} ms`, stats);
  return { group, colliders, update, onHit, parked, stats, lamps, sets, _debug: { curbs, trees, U } };
}

// ================================================================= 1:1 map (?map=v2): per-tile street dressing (props/v2.js)
export function registerPropsV2(stream, opts) {
  return registerV2(stream, { ...opts, F: { makePropMaterial, makeSignalMaterial, makeCarMaterial, additiveFog, yawM, pickW, CAR_MODELS, CAR_PAINT } });
}
