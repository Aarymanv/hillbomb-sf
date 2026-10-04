// Dynamic reflection probe around the player's car: a small cube map (128 px, half-float) re-rendered one face per
// frame (full refresh every 6 frames) from ~1 m above the car, with the player's car, grass and rain hidden and no
// shadow-map updates. Car paint / glass / trim (vehicle/models.js) sample it through the shared CAR_PROBE uniforms,
// sphere-parallax corrected, blurred by roughness through the mip chain, and fading out ~6-11 m from the probe so
// the player's car and the cars right next to it see the real street (buildings, street lights, neon) while every
// other car keeps the sky IBL. Where the probe saw nothing (beyond its far plane) the sky IBL shows through (alpha).
import * as THREE from 'three';
import { PERF } from './perfflags.js';

// uProbeP = (probe centre xyz, strength 0..1); uProbeR = parallax sphere radius (m)
export const CAR_PROBE = {
  uProbe: { value: null },
  uProbeP: { value: new THREE.Vector4(0, -1e5, 0, 0) },
  uProbeR: { value: 18 },
};
export const PROBE_PARS = `uniform samplerCube uProbe; uniform vec4 uProbeP; uniform float uProbeR;
vec3 hbProbeWP() { return cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz; }
// blend the probe into an IBL radiance (already boosted / horizon-occluded): rgb is premultiplied by coverage
vec3 hbProbe(vec3 rad, vec3 wp, vec3 rw, float rough, float w) {
  vec3 d = wp - uProbeP.xyz; float b = dot(d, rw), c = dot(d, d) - uProbeR * uProbeR;
  vec3 L = d + rw * (-b + sqrt(max(b * b - c, 0.0)));
  vec4 p = textureLod(uProbe, L, clamp(rough * 10.0, 0.0, 6.0));
  return mix(rad, p.rgb * 1.15 + rad * (1.0 - p.a), w);
}`;
// inside <lights_fragment_maps> after the IBL boost: radiance (+ clearcoatRadiance) exist under USE_ENVMAP
export const PROBE_APPLY = `#ifdef USE_ENVMAP
if (uProbeP.w > 0.0) {
  vec3 hbWp = hbProbeWP();
  float hbPw = uProbeP.w * (1.0 - smoothstep(6.0, 11.0, distance(hbWp, uProbeP.xyz)));
  if (hbPw > 0.0) {
    vec3 hbRw = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
    radiance = hbProbe(radiance, hbWp, hbRw, material.roughness, hbPw);
    #ifdef USE_CLEARCOAT
    vec3 hbRc = inverseTransformDirection(reflect(-geometryViewDir, geometryClearcoatNormal), viewMatrix);
    clearcoatRadiance = hbProbe(clearcoatRadiance, hbWp, hbRc, material.clearcoatRoughness, hbPw);
    #endif
  }
}
#endif
`;
// patch a car material's shader (call from onBeforeCompile, after its own env boost)
export function applyCarProbe(shader) {
  Object.assign(shader.uniforms, CAR_PROBE);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PROBE_PARS)
    .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + PROBE_APPLY);
}

// Budget: the full scene is ~460 draws / 2.5 M triangles per face (6-9 ms). The probe keeps the big emitters and
// surfaces (buildings, roads, terrain, lamp glows, signs, nearby cars) and drops the costly small stuff. Only meshes
// are hidden, never lights: a change in the light count would recompile every material.
const HIDE_TOP = new Set(['grass', 'props', 'peds', 'googleTiles', 'landmarks', 'weather:rain', 'weather:splash', 'weather:wetstreaks', 'weather:bolt']);
const CAR_KEEP = 18;       // other cars within this distance stay in the probe
function meshesOf(root, out) {
  const hasLight = o => { let l = false; o.traverse(c => { if (c.isLight) l = true; }); return l; };
  const walk = o => {
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !hasLight(o)) { out.push(o); return; }
    for (const c of o.children) if (!c.isLight) walk(c);
  };
  if (root.isLight) return out;
  if (!hasLight(root)) out.push(root); else walk(root);
  return out;
}
export function createCarProbe(renderer, scene, { size = 128, facesPerFrame = 1, far = 180 } = {}) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const cam = new THREE.CubeCamera(0.4, far, rt);
  cam.coordinateSystem = renderer.coordinateSystem; cam.updateCoordinateSystem();
  const clear = new THREE.Color();
  let face = 0, hidden = null, primed = 0, enabled = true;
  const stats = { ms: 0 };
  let cars = [];
  function findHidden() {
    hidden = []; cars = [];
    for (const c of scene.children) {
      if (HIDE_TOP.has(c.name) || c.name.startsWith('site:')) meshesOf(c, hidden);
      else if (c.name.startsWith('car:')) cars.push(c);
    }
  }
  return {
    rt, stats,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; if (!enabled) { CAR_PROBE.uProbeP.value.w = 0; primed = 0; } },
    // pos: probe centre (world), exclude: object hidden while capturing (the player's car)
    update(pos, exclude) {
      if (!enabled || !pos) { CAR_PROBE.uProbeP.value.w = 0; primed = 0; return; }
      const t0 = performance.now();
      if (!hidden || (primed % 90) === 0) findHidden();
      const hid = [];
      for (const o of hidden) if (o.visible) { o.visible = false; hid.push(o); }
      for (const c of cars) if (c.visible && c !== exclude && (c.position.x - pos.x) ** 2 + (c.position.z - pos.z) ** 2 > CAR_KEEP * CAR_KEEP) { c.visible = false; hid.push(c); }
      const exVis = exclude ? exclude.visible : true; if (exclude) exclude.visible = false;
      const sm = renderer.shadowMap, smAuto = sm.autoUpdate, smNeed = sm.needsUpdate;
      sm.autoUpdate = false; sm.needsUpdate = false;
      const prevRT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
      renderer.getClearColor(clear); const prevA = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      // cars inside the capture must not sample the cube being rendered (feedback loop): sky IBL only meanwhile
      CAR_PROBE.uProbe.value = null; CAR_PROBE.uProbeP.value.w = 0;
      cam.position.copy(pos); cam.updateMatrixWorld(true);
      const n = primed < 1 ? 6 : facesPerFrame;              // the first frame fills the whole cube
      const cams = cam.children;
      // (perf r2) the scene's world matrices are the last main render's: renderer.render would walk the whole graph
      // (~5.5 k nodes, ~1.4 ms) again just to move the cars around us by one frame. ?noprobeumw = off
      const prevMW = scene.matrixWorldAutoUpdate; if (PERF.probeumw && primed > 0) scene.matrixWorldAutoUpdate = false;
      for (let i = 0; i < n; i++) {
        rt.texture.generateMipmaps = i === n - 1;           // mips once, after the last face of this frame
        renderer.setRenderTarget(rt, face);
        renderer.render(scene, cams[face]);
        face = (face + 1) % 6;
      }
      scene.matrixWorldAutoUpdate = prevMW;
      renderer.setRenderTarget(prevRT, prevFace, prevMip);
      renderer.setClearColor(clear, prevA);
      sm.autoUpdate = smAuto; sm.needsUpdate = smNeed;
      if (exclude) exclude.visible = exVis;
      for (const o of hid) o.visible = true;
      primed++;
      CAR_PROBE.uProbe.value = rt.texture;
      CAR_PROBE.uProbeP.value.set(pos.x, pos.y, pos.z, 1);
      stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    },
    dispose() { rt.dispose(); CAR_PROBE.uProbeP.value.w = 0; CAR_PROBE.uProbe.value = null; },
  };
}
