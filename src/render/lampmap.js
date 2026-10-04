// Street-lamp light map: every street lamp within ~800 m of the camera is splatted (GPU, top-down) into a world-space
// irradiance texture: rgb = the lamp's irradiance on the ground (point source, cos / d^2, soft cut-off at ~3 lamp
// heights), a = the highest lamp head over the texel. fog.js adds it to every lit built-in material (up-facing surfaces
// get it all, vertical ones a little, nothing above the lamp heads), so the pools are real light: they don't depend on
// the ambient (the old additive pool decals multiplied whatever was under them), they light kerbs, cars and people,
// and they fall off smoothly. Colours by district: sodium (HPS) in the old industrial / Mission / Excelsior streets,
// warm 3000 K LED in the neighbourhoods, cooler 4000 K LED downtown. Under the lamps, a dim warm FILL along every street
// (storefront, window and sign spill, the far lamps' bounce): commercial corridors brighter, quiet streets barely lit,
// max-blended so segment joints never double up.
import * as THREE from 'three';
import { zoneAtV2, COMMERCIAL_ZONES_V2, COMMERCIAL_STREETS_V2 } from '../world/props/v2zones.js';

// shared uniforms (fog.js registers them on every built-in material)
export const HB_LAMPXF = { x: 0, y: 0, z: 1 / 1536, w: 0 };   // region origin x, z, 1 / size, strength (0 = off)
export const HB_LAMPTEX = { value: null };
export const HB_POOLK = { value: 1 };                           // the old pool decals (props): 0 while this map is live

const SIZE = 1536, RES = 1024, MAXL = 6000;
const SODIUM = [1.0, 0.56, 0.25], LED3K = [1.0, 0.8, 0.6], LED4K = [1.0, 0.9, 0.8];
const SODIUM_ZONES = new Set(['industrial', 'mission', 'tenderloin']);
const COOL_ZONES = new Set(['downtown', 'downtown_soma', 'soma', 'chinatown']);

export function createLampMap(renderer) {
  const rt = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  HB_LAMPTEX.value = rt.texture;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aLamp = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 4), 4), aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 3), 3);
  geo.setAttribute('aLamp', aLamp); geo.setAttribute('aCol', aCol);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOrg: { value: new THREE.Vector3() } },
    vertexShader: `attribute vec4 aLamp; attribute vec3 aCol; uniform vec3 uOrg; varying vec2 vR; varying vec3 vCol; varying float vH, vY, vRad;
      void main(){
        float h = clamp(aLamp.y - aLamp.w, 5.0, 16.0), R = 2.8 * h;
        vec2 p = aLamp.xz + position.xy * R;
        vR = position.xy * R; vH = h; vY = aLamp.y; vRad = R; vCol = aCol;
        gl_Position = vec4((p - uOrg.xy) * uOrg.z * 2.0 - 1.0, 0.0, 1.0);
      }`,
    fragmentShader: `varying vec2 vR; varying vec3 vCol; varying float vH, vY, vRad;
      void main(){
        float r2 = dot(vR, vR), h = vH;
        float d2 = r2 + h * h;
        float E = h * h / (d2 * d2);                             // cos^2(theta) / d^2 (downlight: I ~ cos)
        float cut = 1.0 - smoothstep(0.7 * vRad, vRad, sqrt(r2));
        if (cut <= 0.0) discard;
        gl_FragColor = vec4(vCol * E * cut, vY);
      }`,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh); const cam = new THREE.Camera();
  // street fill: one quad per street segment (x = across in [-1, 1], y = along in [0, 1])
  const MAXS = 12000;
  const sgeo = new THREE.InstancedBufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  sgeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aSeg = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4), aSegP = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4);
  sgeo.setAttribute('aSeg', aSeg); sgeo.setAttribute('aSegP', aSegP); sgeo.instanceCount = 0;
  const smat = new THREE.ShaderMaterial({
    uniforms: { uOrg: mat.uniforms.uOrg },
    vertexShader: `attribute vec4 aSeg; attribute vec4 aSegP; uniform vec3 uOrg; varying float vX, vHW; varying vec2 vE;
      void main(){
        vec2 a = aSeg.xy, b = aSeg.zw, t = b - a; float L = max(length(t), 1e-3); t /= L; vec2 n = vec2(-t.y, t.x);
        float W = aSegP.x + 5.0;
        vec2 p = a - t * 4.0 + t * (L + 8.0) * position.y + n * position.x * W;
        vX = position.x * W; vHW = aSegP.x; vE = aSegP.yz;
        gl_Position = vec4((p - uOrg.xy) * uOrg.z * 2.0 - 1.0, 0.0, 1.0);
      }`,
    fragmentShader: `varying float vX, vHW; varying vec2 vE;
      void main(){
        float k = 1.0 - smoothstep(vHW - 1.5, vHW + 5.0, abs(vX));
        gl_FragColor = vec4(vec3(1.0, 0.74, 0.5) * vE.x * k, vE.y);
      }`,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const smesh = new THREE.Mesh(sgeo, smat); smesh.frustumCulled = false;
  const sscene = new THREE.Scene(); sscene.add(smesh);
  const segCache = new WeakMap();
  function fillSegments(graph, groundAt) {
    let n = 0;
    const x0 = ox - 60, x1 = ox + SIZE + 60, z0 = oz - 60, z1 = oz + SIZE + 60;
    for (const e of graph.edges) {
      if (!e.pts || e.tunnel || e.deck || e.kind === 'highway' || e.kind === 'alley' || e.kind === 'park' || e.kind === 'plaza' || e.unpaved) continue;
      let info = segCache.get(e);
      if (!info) {
        const m = e.pts[e.pts.length >> 1];
        let zone = 'avenues'; try { zone = zoneAtV2(m[0], m[1]); } catch { /* v1 */ }
        const comm = COMMERCIAL_ZONES_V2.has(zone) || COMMERCIAL_STREETS_V2.has(e.name) || zone === 'mission' || zone === 'soma' || zone === 'castro';
        const E = (comm ? 0.4 : 0.15) * (e.kind === 'arterial' ? 1.25 : 1) * (0.85 + 0.3 * ((Math.abs(Math.sin(m[0] * 3.1 + m[1] * 7.7)) * 1000) % 1));
        info = { E, hw: (e.width || 8) / 2 + (e.sidewalk || 2.5), gy: null };
        segCache.set(e, info);
      }
      for (let i = 0; i < e.pts.length - 1 && n < MAXS; i++) {
        const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1];
        if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
        if (!info.gy) info.gy = e.pts.map(q => groundAt ? groundAt(q[0], q[1]) : 0);
        const gy = Math.max(info.gy[i], info.gy[i + 1]);
        aSeg.array.set([ax, az, bx, bz], n * 4); aSegP.array.set([info.hw, info.E, gy + 6, 0], n * 4);
        n++;
      }
    }
    aSeg.needsUpdate = true; aSegP.needsUpdate = true; aSeg.addUpdateRange(0, n * 4); aSegP.addUpdateRange(0, n * 4);
    sgeo.instanceCount = n;
    return n;
  }
  const colOf = new Map();
  let ox = 1e9, oz = 1e9, lastN = -1, lastBroken = -1, timer = 0, active = false;
  const I = 240;          // lamp intensity: ~4 W/m^2-equivalent peak under a 9 m head (scene units)

  function lampColour(L) {
    let c = colOf.get(L);
    if (c) return c;
    const sod = L.col && L.col[2] < 0.55;                     // props flag: sodium-look head
    let zone = 'avenues'; try { zone = zoneAtV2(L.x, L.z); } catch { /* v1 map */ }
    const hsh = Math.abs(Math.sin(L.x * 12.9898 + L.z * 78.233) * 43758.5453) % 1;
    // SF swapped most cobra heads to LED (2017-2020); sodium survives in pockets
    const base = sod || (SODIUM_ZONES.has(zone) && hsh < 0.55) || hsh < 0.08 ? SODIUM : COOL_ZONES.has(zone) ? (hsh < 0.3 ? LED3K : LED4K) : LED3K;
    const k = 0.9 + 0.2 * ((hsh * 7.31) % 1);
    c = [base[0] * k, base[1] * k, base[2] * k];
    colOf.set(L, c);
    return c;
  }
  function render(lamps, groundAt) {
    let n = 0, broken = 0;
    const x0 = ox - 50, x1 = ox + SIZE + 50, z0 = oz - 50, z1 = oz + SIZE + 50;
    for (const L of lamps) {
      if (L.broken) { broken++; continue; }
      if (L.x < x0 || L.x > x1 || L.z < z0 || L.z > z1 || n >= MAXL) continue;
      let gy = L.gy;
      if (gy === undefined) { gy = groundAt ? groundAt(L.x, L.z) : L.y - 8; L.gy = gy; }
      const c = lampColour(L);
      aLamp.array.set([L.x, L.y, L.z, gy], n * 4);
      aCol.array.set([c[0] * I, c[1] * I, c[2] * I], n * 3);
      n++;
    }
    aLamp.needsUpdate = true; aCol.needsUpdate = true;
    aLamp.addUpdateRange(0, n * 4); aCol.addUpdateRange(0, n * 3);
    geo.instanceCount = n;
    mat.uniforms.uOrg.value.set(ox, oz, 1 / SIZE);
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.autoClear = false;
    const graph = globalThis.__world?.graph;
    if (graph?.edges && fillSegments(graph, groundAt)) renderer.render(sscene, cam);
    if (n) renderer.render(scene, cam);
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); renderer.autoClear = ac;
    HB_LAMPXF.x = ox; HB_LAMPXF.y = oz; HB_LAMPXF.z = 1 / SIZE;
    return broken;
  }
  function update(dt, camera, nightV) {
    const lamps = globalThis.__world?.props?.lamps;
    const on = !!(lamps && lamps.length && camera && nightV > 0.02);
    HB_POOLK.value = lamps && lamps.length ? 0 : 1;
    if (!on) { HB_LAMPXF.w = 0; active = false; return; }
    // lamps switch on at dusk on the same schedule the props use for their heads
    HB_LAMPXF.w = Math.min(1, nightV * 1.15);
    timer -= dt;
    const cx = camera.position.x, cz = camera.position.z;
    const S = 96, nx = Math.round((cx - SIZE / 2) / S) * S, nz = Math.round((cz - SIZE / 2) / S) * S;
    const moved = Math.abs(cx - (ox + SIZE / 2)) > 300 || Math.abs(cz - (oz + SIZE / 2)) > 300;
    let broken = 0; for (const L of lamps) if (L.broken) broken++;
    if (!active || moved || lamps.length !== lastN || broken !== lastBroken || timer <= 0) {
      if (moved || !active) { ox = nx; oz = nz; }
      render(lamps, globalThis.__world?.groundAt ? (x, z) => globalThis.__world.groundAt(x, z, 999) : null);
      lastN = lamps.length; lastBroken = broken; timer = 5; active = true;
    }
  }
  return { update, rt, xf: HB_LAMPXF, poolK: HB_POOLK, get count() { return geo.instanceCount; }, get segs() { return sgeo.instanceCount; }, _dbg: { smat, sscene, fillSegments } };
}

// GLSL added to every lit built-in material (fog.js lights_fragment_end)
export const LAMPMAP_GLSL = /* glsl */`
#if defined( HB_FOG_PARS ) && ! defined( HB_NO_LAMPMAP )
if ( hbLampXf.w > 0.001 && fogNear >= 0.0 ) {
  vec3 hbLP = cameraPosition + vFogRay;
  vec2 hbLuv = ( hbLP.xz - hbLampXf.xy ) * hbLampXf.z;
  if ( hbLuv.x > 0.0 && hbLuv.y > 0.0 && hbLuv.x < 1.0 && hbLuv.y < 1.0 ) {
    vec4 hbLm = texture2D( hbLampTex, hbLuv );
    vec3 hbNw = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
    float hbUp = mix( 0.14, 1.0, smoothstep( 0.15, 0.8, hbNw.y ) );
    float hbBelow = smoothstep( hbLm.a - 0.3, hbLm.a - 2.5, hbLP.y );
    vec3 hbE = hbLm.rgb * ( hbLampXf.w * hbUp * hbBelow );
    reflectedLight.directDiffuse += hbE * BRDF_Lambert( material.diffuseColor );
    #ifdef STANDARD
    // a broad sheen of the lamps on glossy / wet surfaces (the sharp reflection is the SSR pass), and the grazing-angle
    // sheen of rough asphalt / paving (road-lighting "R-tables": a lit street brightens toward the distance)
    float hbNV = saturate( dot( geometryNormal, geometryViewDir ) );
    // (road 3) wet: the broad sheen was a direction-less grey veil over the whole lamp pool (more than half of a rainy
    // Market St road's brightness); on wet ground the lamp's reflection is the streak (wetstreaks.js + the SSR pass)
    reflectedLight.directSpecular += hbE * ( material.specularColor * ( 0.35 * ( 1.0 - smoothstep( 0.2, 0.7, material.roughness ) ) * ( 1.0 - 0.9 * hbWet.x ) )
      + vec3( 0.035 * pow( 1.0 - hbNV, 4.0 ) * smoothstep( 0.5, 0.9, hbUp ) * ( 1.0 - 0.75 * hbWet.x ) ) );   // (wet: the broad dry-asphalt sheen gives way to the mirror streaks)
    #endif
  }
}
#endif
`;
