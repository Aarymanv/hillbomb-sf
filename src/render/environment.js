// Time of day, sun/moon light with a camera-following shadow frustum, hemisphere light, sky, height fog, env map,
// and the weather system (render/weather.js) that modulates all of them.
import * as THREE from 'three';
import { createSky, createCloudPass, sunDirection, moonDirection, skyState } from './sky.js';
import { createAtmosphere } from './atmosphere.js';
import { HeightFog, patchFogChunks, HB_FOG, HB_SUN, HB_SUNCOL, HB_KEY, HB_CLOUD_A, HB_CLOUD_B, HB_CLOUD_TEX } from './fog.js';
import { createHdriSky } from './hdrisky.js';
import { createWeather } from './weather.js';
import { createLampMap } from './lampmap.js';
import { PERF } from './perfflags.js';

const lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const AGX = typeof location !== 'undefined' && /[?&]tm=agx/.test(location.search);
const desat = (c, k) => { const l = lum(c); return c.setRGB(l + (c.r - l) * k, l + (c.g - l) * k, l + (c.b - l) * k); };
// directional light 0 (sun) samples its own shadow map inside the near frustum and the far cascade (light 1) outside
// it, blended over a band; light 1 itself contributes no light and is skipped
let farPatched = false;
function patchFarCascade() {
  if (farPatched) return; farPatched = true;
  const C = THREE.ShaderChunk;
  const orig = `		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );`;
  const repl = `		#if ( NUM_DIR_LIGHT_SHADOWS > 1 ) && ( UNROLLED_LOOP_INDEX == 1 || ( UNROLLED_LOOP_INDEX == 2 && NUM_DIR_LIGHT_SHADOWS > 2 ) )
		// far / nearest-cascade carrier lights: no light of their own
		#else
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		#if ( NUM_DIR_LIGHT_SHADOWS > 1 ) && ( UNROLLED_LOOP_INDEX == 0 )
		if ( directLight.visible && receiveShadow ) {
			vec3 hbC = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
			vec2 hbE = min( hbC.xy, 1.0 - hbC.xy );
			float hbNear = hbC.z <= 1.0 ? smoothstep( 0.015, 0.1, min( hbE.x, hbE.y ) ) : 0.0;
			float hbS = hbNear > 0.0 ? getShadow( directionalShadowMap[ 0 ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
			if ( hbNear < 1.0 ) {
				float hbF = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
				hbS = mix( hbF, hbS, hbNear );
			}
			#if ( NUM_DIR_LIGHT_SHADOWS > 2 )
			{   // nearest cascade (0-40 m around the camera, ~3 cm texels): sill / eave / tile shadows
				vec3 hbC3 = vDirectionalShadowCoord[ 2 ].xyz / vDirectionalShadowCoord[ 2 ].w;
				vec2 hbE3 = min( hbC3.xy, 1.0 - hbC3.xy );
				float hbN3 = hbC3.z <= 1.0 ? smoothstep( 0.02, 0.12, min( hbE3.x, hbE3.y ) ) : 0.0;
				// (v5) the near map only holds the street-facade detail casters (layer 7: v3 walls, kit frames / sills / tile
				// caps / railings / porches / clutter): it ADDS their crisp shadows on top of the main map, faded at its border
				if ( hbN3 > 0.0 ) hbS = min( hbS, mix( 1.0, getShadow( directionalShadowMap[ 2 ], directionalLightShadows[ 2 ].shadowMapSize, directionalLightShadows[ 2 ].shadowIntensity, directionalLightShadows[ 2 ].shadowBias, directionalLightShadows[ 2 ].shadowRadius, vDirectionalShadowCoord[ 2 ] ), hbN3 ) );
			}
			#endif
			directLight.color *= hbS;
		}
		#ifdef HB_FOG_PARS
		directLight.color *= hbCloudShadow( cameraPosition + vFogRay );
		#endif
		#else
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#if defined( HB_FOG_PARS ) && ( UNROLLED_LOOP_INDEX == 0 )
		directLight.color *= hbCloudShadow( cameraPosition + vFogRay );
		#endif
		#endif
		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		#endif`;
  if (!C.lights_fragment_begin.includes(orig)) { console.warn('[environment] far shadow cascade: three chunk changed, cascade disabled'); return; }
  C.lights_fragment_begin = C.lights_fragment_begin.replace(orig, repl);
}
// zone tuning hook (src/world/landmarks/v2/hero_lm.js: the Chinatown hero streets in night rain want a near-black sky with
// only a faint city glow): multipliers on the night skyglow + light pollution and on the fog colour, 1 = untouched
export const ENV_ZONE = { sky: 1, fog: 1, amb: 1 };      // amb: hemisphere + IBL ambient
export const NEAR_SHADOW_LAYER = 7;     // (v5) casters of the nearest shadow cascade only (water reflection uses 5)
export function createEnvironment({ renderer, scene, quality }) {
  patchFogChunks();
  // physically based sky by default; ?sky=hdri = the photographic HDRI captures (old look)
  const PHYS = !(typeof location !== 'undefined' && /[?&]sky=hdri/.test(location.search));
  const atmos = PHYS ? createAtmosphere(renderer) : null;
  const sky = createSky(atmos);
  scene.add(sky.mesh);
  HB_CLOUD_TEX.value = sky.uniforms.tNoise.value;
  const fog = new HeightFog(0xc4d0dc);
  scene.fog = fog;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = quality.shadows > 0;
  const smap = quality.shadows >= 2 ? 4096 : 2048;
  sun.shadow.mapSize.set(smap, smap);
  const SH = quality.shadows >= 2 ? 150 : 115;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 900 });
  // ~1.6 shadow texels: keeps cornice/window-recess shadows (0.6 erased them) without acne
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = (2 * SH / smap) * 1.6;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  // far cascade (high quality): a second, lights-nothing directional light whose low-res shadow map covers ~2 km around
  // the camera; the patched directional-light loop (see patchFarCascade) uses it wherever the near map ends.
  // Re-rendered only every few seconds or when the camera / sun moved (long views get building + hill shadows).
  let far = null;
  if (quality.shadows > 0 && (quality.farShadows ?? quality.name === 'high')) {
    patchFarCascade();
    far = new THREE.DirectionalLight(0xffffff, 0);
    far.castShadow = true; far.name = 'env:farShadow';
    far.shadow.mapSize.set(2048, 2048);
    const FR = 1100;
    Object.assign(far.shadow.camera, { left: -FR, right: FR, top: FR, bottom: -FR, near: 1, far: 3200 });
    far.shadow.bias = -0.0006; far.shadow.normalBias = (2 * FR / 2048) * 1.2; far.shadow.radius = 1;
    far.shadow.autoUpdate = false; far.shadow.needsUpdate = true;
    far.shadow.camera.updateProjectionMatrix();
    scene.add(far, far.target);
  }
  // nearest cascade (high only): a third lights-nothing directional light whose 2048 map covers ~56 m around
  // the camera (2.7 cm texels, ~4 cm normal-offset bias vs ~12 cm on the 150 m map) -> window sills, eaves, roof tiles and
  // kit trim cast their own shadows near the player. Blended in by the same patched loop (index 2).
  let near3 = null;
  const NR = 28;
  // (v5) ON by default on high / ultra (?nonearshadow = off). Only the street-facade detail meshes cast into it (layer 7,
  // NEAR_SHADOW_LAYER: v2city puts the v3 walls on 0 + 7 and the kit3 / clutter pieces on 7 only, so those never draw
  // into the 115 m main map, whose ~18 cm normal bias erased them anyway). The full-scene version cost 0.5-1.4 ms GPU
  // (MID tile megameshes drawn into a 56 m map); detail-only + every-other-frame refresh is what ships.
  const NS_ON = far && typeof location !== 'undefined' && !/[?&]nonearshadow/.test(location.search);
  globalThis.HB_NEAR_SHADOW = !!NS_ON;
  if (NS_ON) {
    near3 = new THREE.DirectionalLight(0xffffff, 0);
    near3.castShadow = true; near3.name = 'env:nearShadow';
    near3.shadow.mapSize.set(2048, 2048);
    Object.assign(near3.shadow.camera, { left: -NR, right: NR, top: NR, bottom: -NR, near: 1, far: 700 });
    near3.shadow.bias = -0.00015; near3.shadow.normalBias = (2 * NR / 2048) * 1.5;
    near3.shadow.camera.updateProjectionMatrix();
    near3.shadow.camera.layers.set(NEAR_SHADOW_LAYER);
    near3.shadow.autoUpdate = false; near3.shadow.needsUpdate = true;
    scene.add(near3, near3.target);
  }
  if (near3) casterCull(near3, 5);
  const _n3 = new THREE.Vector3(); let near3Frame = 0;
  // (perf 10/4) shadow caster culling against the view: a caster drawn into the sun / nearest map only if the volume its
  // shadow can reach (its bounding sphere swept along the light down to ~100 m below the focus) touches the camera
  // frustum. Casters behind / beside the view whose shadows can't land in it (cars, peds, props, landmark pieces: ~40 %
  // of the shadow draws on a street view) are skipped; nothing in view changes. The nearest map is refreshed every other
  // frame, so its test uses a frustum widened by 5 m. Water mirror / car probe reuse the map (their off-view shadows
  // were never accurate at that resolution). ?noshadowcull = off.
  const _vf = new THREE.Frustum(), _vpm = new THREE.Matrix4(), _cs = new THREE.Sphere(), _lt = new THREE.Vector3();
  const cull = { on: false, groundY: 0, n: 0, kept: 0 };
  // shadow-only proxies (hero_lm.js shadowProxies) carry their real bounds in userData.shadowSphere (the geometry's is parked
  // out of every camera's view)
  function casterCull(light, margin, view = true) {
    const sh = light.shadow, base = sh.getFrustum();
    const proxy = {
      intersectsSprite: (s) => base.intersectsSprite(s),
      intersectsObject(o) {
        const ss = o.userData.shadowSphere;
        if (ss) { _cs.copy(ss).applyMatrix4(o.matrixWorld); if (!base.intersectsSphere(_cs)) return false; }
        else if (!base.intersectsObject(o)) return false;
        if (!view || !cull.on || !PERF.shadowcull) return true;
        if (!ss) {
          let bs;
          if (o.boundingSphere !== undefined) { if (o.boundingSphere === null) o.computeBoundingSphere(); bs = o.boundingSphere; }
          else { const g = o.geometry; if (!g) return true; if (g.boundingSphere === null) g.computeBoundingSphere(); bs = g.boundingSphere; }
          _cs.copy(bs).applyMatrix4(o.matrixWorld);
        }
        const c = _cs.center, r = _cs.radius + margin;
        const ext = Math.min(1500, Math.max(0, c.y + r - cull.groundY) / Math.max(0.05, -_lt.y));
        cull.n++;
        for (const p of _vf.planes) {
          const d0 = p.normal.dot(c) + p.constant;
          if (d0 >= -r) continue;
          const d1 = d0 + p.normal.dot(_lt) * ext;
          if (d1 < -r) return false;
        }
        cull.kept++;
        return true;
      },
    };
    sh.getFrustum = () => proxy;
  }
  if (sun.castShadow) casterCull(sun, 1);
  if (far) casterCull(far, 0, false);
  const farAt = new THREE.Vector3(1e9, 0, 0), farDir = new THREE.Vector3(); let farTimer = 0;
  const hemi = new THREE.HemisphereLight(0xb4cbe6, 0x55503f, 1.0);
  scene.add(hemi);

  const night = { value: 0 };
  const state = {
    hours: 17.2,          // start near golden hour
    timeScale: 1 / 60,    // game hours per real second (1 game day = 24 min)
    paused: false,
    fogMode: 'karl',      // 'clear' | 'karl' | 'thick'
    fogBoost: 0,          // extra fog for weather events
    cloud: 0.45,
    exposureMul: 1,       // photo mode exposure (EV offset = log2)
    reflections: true,    // planar water reflections
    moonAge: 10,          // days since new moon (phase + where the moon sits at night)
  };
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  // Hand-tuned looks by sun elevation (deg). exposure: tone-map exposure; sun: key light; warm: sun colour toward amber;
  // env: photographic IBL (ambient + reflections); bounce: warm light reflected off the sunlit street onto down/side-facing
  // surfaces (hemisphere ground colour = a cheap GI term); fill: extra sky fill; fog: density scale; sky: HDRI brightness.
  const LOOKS = [
    { el: -14, envSat: 0.75, tint: [1.0, 0.97, 1.0], exposure: 1.72, sun: 0.55, warm: 0.0, env: 0.17, bounce: 0.0, fill: 0.55, fog: 1.0, sat: 1.04, con: 1.06, sky: 0.03, city: 1.6 },
    { el: -4, envSat: 0.7, tint: [1.02, 0.97, 1.0], exposure: 1.45, sun: 0.15, warm: 0.3, env: 0.13, bounce: 0.05, fill: 0.26, fog: 1.1, sat: 1.06, con: 1.06, sky: 0.08, city: 0.7 },
    { el: 3, envSat: 0.62, tint: [1.1, 0.96, 0.86], exposure: 1.22, sun: 2.3, warm: 0.95, env: 0.2, bounce: 0.24, fill: 0.12, fog: 1.25, sat: 1.14, con: 1.08, sky: 0.2, city: 0.2 },
    { el: 10, envSat: 0.58, tint: [1.08, 0.97, 0.88], exposure: 1.02, sun: 3.2, warm: 0.72, env: 0.28, bounce: 0.3, fill: 0.1, fog: 0.7, sat: 1.14, con: 1.12, sky: 0.3, city: 0 },
    { el: 24, envSat: 0.55, tint: [1.03, 0.99, 0.94], exposure: 0.9, sun: 3.6, warm: 0.36, env: 0.36, bounce: 0.32, fill: 0.08, fog: 0.5, sat: 1.12, con: 1.12, sky: 0.4, city: 0 },
    { el: 45, envSat: 0.55, tint: [1.0, 1.0, 0.97], exposure: 0.84, sun: 3.8, warm: 0.14, env: 0.42, bounce: 0.3, fill: 0.08, fog: 0.45, sat: 1.1, con: 1.12, sky: 0.46, city: 0 },
  ];
  // physical sky looks: exposure (all light), adapt (EV of natural-light adaptation: the eye opens up as the sun sets,
  // artificial lights stay put), sat / con (grade), fog (density scale), warm (Google-tiles tint)
  const PLOOKS = [
    { el: -18, exposure: 1.72, adapt: 10.0, sat: 1.04, con: 1.08, fog: 1.0, warm: 0.0 },
    { el: -12, exposure: 1.68, adapt: 10.0, sat: 1.05, con: 1.08, fog: 1.0, warm: 0.0 },
    { el: -8, exposure: 1.55, adapt: 9.4, sat: 1.08, con: 1.08, fog: 1.05, warm: 0.0 },
    { el: -4, exposure: 1.36, adapt: 5.4, sat: 1.1, con: 1.08, fog: 1.1, warm: 0.2 },
    { el: 0, exposure: 1.12, adapt: 2.6, sat: 1.08, con: 1.08, fog: 1.0, warm: 0.6 },
    { el: 4, exposure: 1.02, adapt: 1.4, sat: 1.08, con: 1.1, fog: 0.9, warm: 0.8 },
    { el: 10, exposure: 0.95, adapt: 0.5, sat: 1.08, con: 1.1, fog: 0.7, warm: 0.6 },
    { el: 24, exposure: 0.9, adapt: 0.0, sat: 1.08, con: 1.1, fog: 0.5, warm: 0.3 },
    { el: 45, exposure: 0.86, adapt: 0.0, sat: 1.06, con: 1.1, fog: 0.45, warm: 0.12 },
  ];
  const look = {};
  const WARM = new THREE.Color(1.0, 0.56, 0.26), GROUND = new THREE.Color(1.0, 0.82, 0.64), SODIUM = new THREE.Color(1.0, 0.55, 0.22);
  const FLASH = new THREE.Color(0.8, 0.86, 1.1), GREY = new THREE.Color(0.62, 0.66, 0.72);
  function lookAt(el, T = LOOKS) {
    let i = 0; while (i < T.length - 2 && el > T[i + 1].el) i++;
    const A = T[i], B = T[i + 1], t = THREE.MathUtils.clamp((el - A.el) / (B.el - A.el), 0, 1), e = t * t * (3 - 2 * t);
    for (const k in A) if (k !== 'el') look[k] = Array.isArray(A[k]) ? A[k].map((v, q) => v + (B[k][q] - v) * e) : A[k] + (B[k] - A[k]) * e;
    return look;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.mesh.geometry, sky.mesh.material);
  envScene.add(envSky);
  let envRT = null, lastEnvHours = -99, lastEnvCloud = -1, lastEnvDrift = -99, envAt = 0;
  const hsky = PHYS ? null : createHdriSky(renderer);   // null if the HDRI assets are missing -> procedural sky/env
  const hdrHorizon = new THREE.Color();
  let hdrReady = false;
  let time = 0;
  const fogColor = new THREE.Color(), _c = new THREE.Color(), _f = new THREE.Vector3();

  // ---- physical sky: equirect bake of the dome (env mode) -> PMREM (IBL) + the water's sky texture
  let eqRT = null, eqScene = null, eqCam = null, pmTarget = null;
  if (PHYS) {
    eqRT = new THREE.WebGLRenderTarget(512, 256, /* (look-dev: the bake now really draws every re-bake; half res = ~1/4 the cost) */ { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    eqRT.texture.mapping = THREE.EquirectangularReflectionMapping; eqRT.texture.minFilter = eqRT.texture.magFilter = THREE.LinearFilter;
    // a dense grid whose vertices carry the equirect direction (same convention as water.js skyDir)
    const g = new THREE.PlaneGeometry(2, 2, 128, 64), P = g.attributes.position, uv = g.attributes.uv, dir = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const az = (uv.getX(i) - 0.5) * Math.PI * 2, el = (uv.getY(i) - 0.5) * Math.PI;
      dir[i * 3] = Math.cos(el) * Math.cos(az); dir[i * 3 + 1] = Math.sin(el); dir[i * 3 + 2] = Math.cos(el) * Math.sin(az);
    }
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    const eqMat = new THREE.ShaderMaterial({ uniforms: sky.uniforms, fragmentShader: sky.material.fragmentShader, depthTest: false, depthWrite: false,
      vertexShader: 'attribute vec3 aDir; varying vec3 vDir; void main(){ vDir = aDir; gl_Position = vec4(position.xy, 0.0, 1.0); }' });
    const q = new THREE.Mesh(g, eqMat); q.frustumCulled = false;
    eqScene = new THREE.Scene(); eqScene.add(q); eqCam = new THREE.Camera();
  }
  // CPU state of the physical sky (read by weather / water / tiles through api.phys)
  const phys = { sunE: 1, gain: 1, T: new THREE.Color(), Tm: new THREE.Color(), moonPhase: 0, lp: 0, skyAmb: new THREE.Color(), ground: new THREE.Color(), horizon: new THREE.Color() };
  const WB = new THREE.Color(1, 1, 1);
  if (atmos) {   // white balance: the noon sun + sky reads neutral
    const t = atmos.transmittance(Math.sin(60 * Math.PI / 180), 0.05);
    WB.setRGB(1 / t.r, 1 / t.g, 1 / t.b); const m = lum(WB); WB.multiplyScalar(1 / m);
    WB.setRGB(Math.pow(WB.r, 0.85), Math.pow(WB.g, 0.85), Math.pow(WB.b, 0.85)); WB.multiplyScalar(1 / lum(WB));
  }
  const SUN_E = 3.7;          // sun irradiance at the top of the atmosphere (scene units, before adaptation)
  const MOON_E = 0.24;
  const SKY_K = 1.5;         // sky radiance gain (coastal haze + a camera-like sky; also lifts the IBL fill)        // full-moon irradiance in adapted night units
  const LP_COL = new THREE.Color(1.0, 0.6, 0.36);   // sodium + warm LED city glow
  const MOON_TINT = new THREE.Color(0.78, 0.88, 1.08);
  const _t = new THREE.Color(), _u = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), windOff = new THREE.Vector2();
  let gainS = -1;

  // street-lamp light map (night pools as real light on every lit surface)
  const lampMap = quality.name === 'low' ? null : createLampMap(renderer);
  const cloudPass = PHYS && quality.name !== 'low' ? createCloudPass(renderer, sky) : null;
  const api = { sky, sun, hemi, fog, night, state, sunDir, moonDir, look, renderer, quality, hsky, atmos, phys, lampMap, cloudPass, update, get nightF() { return night.value; }, get time() { return time; } };
  const weather = createWeather({ env: api, scene, renderer, quality });
  api.weather = weather;

  function update(dt, camera, focus) {
    time += dt;
    if (!state.paused) state.hours = (state.hours + dt * state.timeScale) % 24;
    weather.update(dt, camera);
    const Wp = weather.params, cloud = weather.cloud, dark = weather.dark;
    sunDirection(state.hours, sunDir);
    moonDirection(state.hours, moonDir, state.moonAge);
    const sunEl = Math.asin(sunDir.y) * 180 / Math.PI;
    const nightF = THREE.MathUtils.smoothstep(-sunEl, -4, 7);
    night.value = nightF;
    const h = state.hours;
    // (physical sky: a lighter Karl haze in clear weather; the marine-layer bank carries the real fog days)
    const karl = state.fogMode === 'clear' ? 0 : state.fogMode === 'thick' ? 1 : PHYS ? 0.16 + (0.26 + 0.2 * weather.bank) * (Math.exp(-((h - 7) ** 2) / 5) + Math.exp(-((h - 21) ** 2) / 8)) : 0.18 + 0.42 * (Math.exp(-((h - 7) ** 2) / 5) + Math.exp(-((h - 21) ** 2) / 8));
    const bank = state.fogMode === 'clear' ? 0 : weather.bank;
    const k = Math.min(1.3, karl * (1 - 0.6 * bank) * (1 - 0.45 * cloud) + state.fogBoost + Wp.fog);
    HB_FOG.x = 0; HB_FOG.y = 0.075; HB_FOG.z = bankFront(bank);
    lampMap?.update(dt, camera, nightF);
    if (PHYS) updatePhys(dt, camera, sunEl, nightF, cloud, dark, Wp, k, bank);
    else updateHdri(dt, camera, sunEl, nightF, cloud, dark, Wp, k, bank);
    // view frustum + light travel direction for the shadow caster culling (casterCull)
    if (camera) {
      camera.updateMatrixWorld();
      _vf.setFromProjectionMatrix(_vpm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
      _lt.copy(lightDir).negate(); cull.groundY = Math.min(camera.position.y, focus ? focus.y : camera.position.y) - 100; cull.on = _lt.y < -0.02;
    } else cull.on = false;
    // shadow frustum follows the focus, snapped to texels
    const fx = focus ? focus.x : 0, fy = focus ? focus.y : 0, fz = focus ? focus.z : 0;
    const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
    const cx = Math.round(fx / texel) * texel, cz = Math.round(fz / texel) * texel;
    sun.target.position.set(cx, fy, cz);
    sun.position.set(cx + lightDir.x * 400, fy + lightDir.y * 400, cz + lightDir.z * 400);
    sun.target.updateMatrixWorld();
    if (near3 && camera) {
      if (!camera.layers.isEnabled(NEAR_SHADOW_LAYER)) camera.layers.enable(NEAR_SHADOW_LAYER);   // detail-only meshes stay visible
      // refreshed every other frame (the map + its matrix only move together, so a skipped frame just reuses the last one;
      // the 56 m box comfortably covers 1 frame of travel)
      near3.shadow.needsUpdate = (near3Frame = (near3Frame + 1) & 1) === 0;
    }
    if (near3 && camera && near3.shadow.needsUpdate) {
      // centred ~14 m ahead of the camera (the 0-40 m the player looks at), snapped to its texel size
      camera.getWorldDirection(_n3); _n3.y = 0; if (_n3.lengthSq() < 1e-6) _n3.set(0, 0, -1); _n3.normalize();
      const t3 = 2 * NR / near3.shadow.mapSize.x;
      const nx = Math.round((camera.position.x + _n3.x * 14) / t3) * t3, nz = Math.round((camera.position.z + _n3.z * 14) / t3) * t3;
      const ny = Math.round(camera.position.y / t3) * t3 - 2;
      near3.target.position.set(nx, ny, nz); near3.position.set(nx + lightDir.x * 300, ny + lightDir.y * 300, nz + lightDir.z * 300);
      near3.target.updateMatrixWorld();
      near3.shadow.intensity = sun.shadow.intensity;
    }
    if (far) {
      farTimer -= dt;
      const moved = Math.hypot(fx - farAt.x, fz - farAt.z) > 140 || farDir.dot(lightDir) < 0.99995 || farTimer <= 0;
      if (moved && !far.shadow.needsUpdate) {
        const ft = (far.shadow.camera.right - far.shadow.camera.left) / far.shadow.mapSize.x;
        const ax = Math.round(fx / ft) * ft, az = Math.round(fz / ft) * ft;
        far.target.position.set(ax, 0, az);
        far.position.set(ax + lightDir.x * 1500, lightDir.y * 1500, az + lightDir.z * 1500);
        far.target.updateMatrixWorld();
        far.shadow.needsUpdate = true; farAt.set(fx, fy, fz); farDir.copy(lightDir); farTimer = 4;
      }
      far.shadow.intensity = sun.shadow.intensity;
    }
  }

  // ------------------------------------------------------------------ physical sky + lighting
  function updatePhys(dt, camera, sunEl, nightF, cloud, dark, Wp, k, bank) {
    const L = lookAt(sunEl, PLOOKS);
    const U = sky.uniforms;
    const camY = camera ? camera.position.y : 50;
    const manual = typeof window !== 'undefined' && !!window.__manual;
    // aerosols: coastal haze, more under weather / in the marine layer
    const mieK = 2.0 + 1.8 * Wp.haze + 0.8 * cloud + 0.8 * bank;
    atmos.update(sunDir, moonDir, { camY, mieK: Math.round(mieK * 10) / 10, sync: manual });
    // natural-light adaptation (smoothed a little so a time scrub can't pop) and exposure
    // (+ the eye opening up under a thick deck: overcast days read bright grey, not dim)
    const gain = Math.pow(2, L.adapt + 1.25 * Math.pow(Math.max(cloud, 0.75 * U.uBankWash.value), 1.2) * THREE.MathUtils.smoothstep(sunEl, -2, 10));   // (+ inside the fog bank: last frame's wash)
    gainS = gainS < 0 || manual ? gain : gainS + (gain - gainS) * Math.min(1, dt * 4);
    const E = SUN_E * gainS;
    phys.sunE = E; phys.gain = gainS;
    L.sat *= 1 - 0.28 * cloud; L.con *= 1 - 0.04 * cloud;
    // (look-dev) AgX tone map (post.js) compensation: saturation back, and at night AgX's softer toe lifts the dark city
    // (ACES crushed it): -0.3 EV + a little contrast so the pools / windows pop off dark walls
    // (regression fix 9/30) ACES again (post.js): no AgX compensation; ?tm=agx keeps the look-dev numbers for A/B
    if (AGX) { L.sat *= 1.12; L.exposure *= 1.05 - 0.25 * nightF; L.con *= 1 + 0.06 * nightF; }
    L.exposure *= (1 + 0.18 * cloud * (1 - nightF)) * state.exposureMul;
    L.sky = 1; L.env = 1; L.city = nightF; L.bounce = 0; L.fill = 0; L.sun = E;
    // sun + moon through the atmosphere
    // (display sun colour: a camera white-balances part of the low sun's red away -> orange-gold, not blood red)
    const T = desat(atmos.transmittance(sunDir.y, camY / 1000 + 0.02, phys.T), 0.56);
    const Tm = atmos.transmittance(moonDir.y, camY / 1000 + 0.02, phys.Tm);
    const elong = sunDir.dot(moonDir), illum = (1 - elong) / 2;   // illuminated fraction
    phys.moonPhase = illum;
    const moonK = MOON_E * Math.pow(illum, 1.6) * THREE.MathUtils.smoothstep(-sunEl, 2, 9);
    // light pollution: the city's glow, stronger in haze / fog / under a low deck (reflected back down)
    const lpK = 0.028 * THREE.MathUtils.smoothstep(-sunEl, -1, 10) * (1 + 0.7 * cloud + 1.0 * bank + 0.5 * Wp.haze) * (1 - 0.6 * weather.rain);   // (regression fix 9/30: rain 0.3 -> 0.6: the lit low deck read as a muddy brown veil)
    phys.lp = lpK;
    const sunE3 = _v.set(WB.r * E, WB.g * E, WB.b * E);
    U.uSunE.value.copy(sunE3).multiplyScalar(SKY_K);
    U.uMoonE.value.set(MOON_TINT.r * moonK * Tm.r, MOON_TINT.g * moonK * Tm.g, MOON_TINT.b * moonK * Tm.b);
    U.uLP.value.set(LP_COL.r * lpK, LP_COL.g * lpK, LP_COL.b * lpK).multiplyScalar(ENV_ZONE.sky);
    // the city night sky is never black: skyglow scattered all over the dome (blue-grey), dimmer under clear air
    const nsk = THREE.MathUtils.smoothstep(-sunEl, 2, 12) * (1 + 0.8 * cloud + 0.6 * bank);
    U.uNightSky.value.set(0.017 * nsk, 0.021 * nsk, 0.03 * nsk).multiplyScalar(ENV_ZONE.sky);
    U.uSunCol.value.setRGB(T.r * sunE3.x, T.g * sunE3.y, T.b * sunE3.z);
    U.uSunDisc.value = 90 * (1 - 0.97 * cloud);
    U.uMoonDisc.value = 1.4 * THREE.MathUtils.smoothstep(-sunEl, -6, 4) * (0.35 + 0.65 * THREE.MathUtils.smoothstep(illum, 0, 0.5));
    U.uStars.value = 0.06 * nightF * (1 - cloud) * (1 - 0.8 * bank) * (1 - Math.min(1, Wp.haze * 1.5));
    const cx = camera ? camera.position.x : 0;
    U.uLPOcean.value = THREE.MathUtils.smoothstep(-cx, 2500, 6500);    // near Ocean Beach the west is the dark Pacific
    U.uNight.value = nightF; U.uTime.value = time;
    U.uSunDir.value.copy(sunDir); U.uMoonDir.value.copy(moonDir);
    if (camera) { sky.mesh.position.copy(camera.position); U.uCamPos.value.copy(camera.position); }
    // clouds from the weather: fair-weather cumulus + cirrus when clear, stratocumulus -> nimbostratus with cloud cover
    const strat = THREE.MathUtils.smoothstep(cloud, 0.3, 0.85);
    // fair-weather cumulus build in the afternoon and collapse after dark; cloud cover takes over with the weather
    const convect = 0.05 + 0.2 * THREE.MathUtils.smoothstep(sunEl, -4, 20);
    const cov = Math.min(1, convect * (1 - 0.8 * bank) + 0.95 * Math.pow(cloud * (1 - 0.7 * bank), 0.85));   // above the marine layer: clear
    U.uCloudLow.value.set(cov, 0.018 + 0.03 * cloud, 1500 - 700 * strat, 650 + 900 * strat);
    U.uCloudHigh.value.set(0.4 * (1 - cloud) + 0.08, 0.38 * (1 - 0.9 * cloud), 8800, 0);
    U.uCloudType.value.set(strat, dark * 1.05, 9000 + 13000 * strat, 0);
    const ws = 5 + 16 * weather.wind;
    windOff.x += dt * ws * 0.94; windOff.y += dt * ws * 0.34;
    U.uWind.value.copy(windOff);
    // cloud shadows on the ground (fog.js hbCloudShadow): the same field the volumetric pass marches
    HB_CLOUD_A.x = cov; HB_CLOUD_A.y = U.uCloudType.value.z; HB_CLOUD_A.z = windOff.x; HB_CLOUD_A.w = windOff.y;
    HB_CLOUD_B.x = U.uCloudLow.value.z + U.uCloudLow.value.w * 0.35; HB_CLOUD_B.y = strat;
    HB_CLOUD_B.z = 0.82 * THREE.MathUtils.smoothstep(sunEl, 1, 8) * (1 - 0.6 * cloud);
    const Tc = desat(atmos.transmittance(sunDir.y, 1.5, _t), 0.7);
    U.uCloudSun.value.set(Tc.r * sunE3.x, Tc.g * sunE3.y, Tc.b * sunE3.z);
    const Ti = atmos.transmittance(sunDir.y, 8.8, _t);
    U.uCirrusSun.value.set(Ti.r * sunE3.x, Ti.g * sunE3.y, Ti.b * sunE3.z);
    U.uMoonCloud.value.copy(U.uMoonE.value).multiplyScalar(0.55);
    // sky ambient at the clouds (zenith + mid sky), from the LUT readback
    const zen = atmos.sample(_u.set(0, 1, 0), sunDir, _c);
    const mid = atmos.ring(30, sunDir, _t, 8);
    const amb = phys.skyAmb.setRGB((zen.r + mid.r) * 0.5 * sunE3.x, (zen.g + mid.g) * 0.5 * sunE3.y, (zen.b + mid.b) * 0.5 * sunE3.z).multiplyScalar(SKY_K);
    amb.r += U.uNightSky.value.x * 0.9; amb.g += U.uNightSky.value.y * 0.9; amb.b += U.uNightSky.value.z * 0.9;
    amb.r += U.uMoonE.value.x * 0.03 + U.uLP.value.x * 0.4; amb.g += U.uMoonE.value.y * 0.03 + U.uLP.value.y * 0.4; amb.b += U.uMoonE.value.z * 0.035 + U.uLP.value.z * 0.4;
    U.uCloudAmb.value.set(amb.r * 1.25, amb.g * 1.25, amb.b * 1.25);
    // fog colour = the horizon (clear sky ring, then the cloud base / grey haze under cover, the city glow at night)
    // (the horizon in the view direction, blended with the all-round average; the sun side adds fog.js's Mie lobe)
    const hz = atmos.ring(2, sunDir, phys.horizon, 16);
    if (camera) { camera.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(1, 0, 0); _f.normalize(); _f.y = 0.05; _f.normalize(); hz.lerp(atmos.sample(_f, sunDir, _c), 0.6); }
    fogColor.setRGB(hz.r * sunE3.x, hz.g * sunE3.y, hz.b * sunE3.z).multiplyScalar(SKY_K);
    fogColor.r += LP_COL.r * lpK * 1.1 + U.uMoonE.value.x * 0.05; fogColor.g += LP_COL.g * lpK * 1.1 + U.uMoonE.value.y * 0.05; fogColor.b += LP_COL.b * lpK * 1.1 + U.uMoonE.value.z * 0.06;
    fogColor.r += U.uNightSky.value.x; fogColor.g += U.uNightSky.value.y; fogColor.b += U.uNightSky.value.z;
    // under a deck the horizon is the cloud base: grey, lit by what diffuses through (sun) + the sky above
    const aL = lum(amb), cS = U.uCloudSun.value, cL = (0.2126 * cS.x + 0.7152 * cS.y + 0.0722 * cS.z) * 0.035;
    const base = _t.set(amb.r * 0.3 + aL * 0.45 + cL, amb.g * 0.3 + aL * 0.45 + cL, amb.b * 0.3 + aL * 0.48 + cL * 1.02).add(_c.copy(LP_COL).multiplyScalar(lpK * 1.5));
    base.multiplyScalar(1 - 0.6 * dark);
    fogColor.lerp(base, Math.min(1, cloud * 0.85));
    // the haze reads paler than the deep horizon ring (camera-like saturation; golden hour = luminous gold, never brown)
    const golden0 = THREE.MathUtils.smoothstep(sunEl, -3, 2) * (1 - THREE.MathUtils.smoothstep(sunEl, 9, 18)) * (1 - cloud);
    const twi = THREE.MathUtils.smoothstep(-sunEl, -1, 5) * (1 - THREE.MathUtils.smoothstep(-sunEl, 10, 16));   // blue hour
    desat(fogColor, 0.72 - 0.22 * golden0 - 0.3 * twi).multiplyScalar(1 + 0.25 * golden0);
    if (golden0 > 0) { const Lm = lum(fogColor); fogColor.lerp(_c.setRGB(Lm * 1.12, Lm * 0.99, Lm * 0.82), 0.6 * golden0); }
    if (twi > 0) { const Lm = lum(fogColor); fogColor.lerp(_c.setRGB(Lm * 0.8, Lm * 0.95, Lm * 1.35), 0.45 * twi); }
    fogColor.add(_c.copy(FLASH).multiplyScalar(weather.flash * 0.12 * lum(fogColor) / 0.3));
    fog.color.copy(fogColor).multiplyScalar(ENV_ZONE.fog);
    // fog density: Karl + weather haze; golden hour stays clear (warm but crisp towers)
    const golden = THREE.MathUtils.smoothstep(sunEl, -3, 2) * (1 - THREE.MathUtils.smoothstep(sunEl, 9, 18)) * (1 - cloud);
    const gClear = 1 - 0.6 * golden;
    fog.set((0.0006 + 0.0062 * k * k) * L.fog * gClear, 0.016 + 0.012 * (1 - k) + 0.01 * golden, (0.00009 + 0.00005 * k + 0.00011 * Wp.haze) * L.fog * (1 - 0.45 * golden) + nightF * 0.00004);
    // marine layer: a deep bank (~250-330 m tops, rolls over Twin Peaks / Sutro), see fog.js
    HB_FOG.x = bank * 0.0085; HB_FOG.y = 290;
    weather.fogDensity = +(fog.density + HB_FOG.x).toFixed(5);
    // camera inside the bank: the sky washes out
    U.uBankWash.value = bank > 0.01 && camera ? bank * (1 - THREE.MathUtils.smoothstep(camY, 200, 360)) * 0.85   /* (three's smoothstep is not symmetric: (x, 360, 200) was always 0) */ * THREE.MathUtils.smoothstep(HB_FOG.z - (camera.position.x), -300, 400) : 0;
    HB_SUN.x = sunDir.x; HB_SUN.y = sunDir.y; HB_SUN.z = sunDir.z;
    HB_SUN.w = 0.5 * (1 - nightF) * (1 - 0.75 * cloud) * (0.35 + 0.65 * THREE.MathUtils.clamp(1 - sunEl / 30, 0, 1));
    HB_SUNCOL.setRGB(T.r, T.g, T.b).multiplyScalar(lum(fogColor) / Math.max(1e-3, lum(T)) * 1.1);
    U.uFogCol.value.copy(fogColor);
    U.uFogBand.value = (0.12 + 0.4 * k) * (1 - 0.65 * golden) + 0.3 * bank;
    U.uCloud.value = cloud; U.uFlash.value = weather.flash; U.uWash.value = Math.min(0.85, Wp.haze * 0.5 + weather.rain * 0.3);
    if (weather.flash > 0) U.uFlashDir.value.copy(weather.flashDir || U.uFlashDir.value);
    // lights: sun by day, moon by night (crossing when both are ~0); cloud cover dims the direct light, softens shadows
    // (look-dev) inside Karl the sun is a pale disc through the deck: soft, dim, almost shadowless light
    const direct = (1 - 0.92 * Math.pow(cloud, 1.2)) * (1 - 0.8 * U.uBankWash.value);
    const useMoon = sunEl < -2.5;
    lightDir.copy(useMoon ? moonDir : sunDir);
    if (lightDir.y < 0.08) lightDir.y = 0.08, lightDir.normalize();
    if (useMoon) {
      sun.color.setRGB(MOON_TINT.r * Tm.r, MOON_TINT.g * Tm.g, MOON_TINT.b * Tm.b); const m = Math.max(sun.color.r, sun.color.g, sun.color.b, 1e-4); sun.color.multiplyScalar(1 / m);
      sun.intensity = moonK * m * THREE.MathUtils.smoothstep(moonDir.y, 0.0, 0.25) * direct;
    } else {
      sun.color.setRGB(T.r * WB.r, T.g * WB.g, T.b * WB.b); const m = Math.max(sun.color.r, sun.color.g, sun.color.b, 1e-4); sun.color.multiplyScalar(1 / m);
      sun.intensity = E * m * direct;
    }
    sun.shadow.intensity = (1 - 0.8 * cloud) * (1 - 0.6 * U.uBankWash.value);
    // contact shadows: the key light's share of a lit, up-facing pixel's light
    { const kI = sun.intensity * lum(sun.color), aI = Math.PI * lum(amb) * 1.1; HB_KEY.x = lightDir.x; HB_KEY.y = lightDir.y; HB_KEY.z = lightDir.z; HB_KEY.w = kI / (kI + aI + 1e-4) * sun.shadow.intensity; }
    // ground radiance (env below the horizon + hemisphere ground): sunlit / sky-lit street, the city's lamps at night
    const gAlb = 0.13;
    const gE = _c.setRGB(T.r * sunE3.x, T.g * sunE3.y, T.b * sunE3.z).multiplyScalar(Math.max(sunDir.y, 0) * direct).add(_t.copy(amb).multiplyScalar(Math.PI * 0.8));
    phys.ground.copy(gE).multiplyScalar(gAlb / Math.PI).add(_t.copy(LP_COL).multiplyScalar(0.055 * nightF));   // + the lamp-lit city
    U.uGround.value.set(phys.ground.r, phys.ground.g, phys.ground.b);
    // hemisphere: a small fill for materials without the env map (custom shaders read it); the IBL does the rest
    hemi.color.copy(amb).multiplyScalar(0.9);
    hemi.groundColor.copy(phys.ground).multiplyScalar(0.9);
    if (weather.flash > 0) { hemi.color.add(_c.copy(FLASH).multiplyScalar(weather.flash * 0.8)); hemi.groundColor.add(_c.copy(FLASH).multiplyScalar(weather.flash * 0.2)); }
    hemi.intensity = ENV_ZONE.amb;
    // environment re-bake (wall-clock throttled; smaller steps at twilight when the light changes fastest)
    const now = performance.now();
    const step = sunEl > -14 && sunEl < 12 ? 0.02 : 0.06;
    const changed = Math.abs(state.hours - lastEnvHours) > step || Math.abs(cloud - lastEnvCloud) > 0.02 || Math.abs(weather.drift - lastEnvDrift) > 0.05 || !envRT;
    if (changed && (now - envAt > 400 || manual || !envRT)) {
      envAt = now; lastEnvHours = state.hours; lastEnvCloud = cloud; lastEnvDrift = weather.drift;
      const prev = renderer.getRenderTarget();
      const crt = U.uCloudRT.value;
      // (look-dev fix) the dome shader still binds uHdr = eqRT.texture from the previous bake: sampling the target it
      // draws into is a WebGL feedback loop -> every re-bake after the first draw call was dropped and the IBL stayed at
      // the boot bake (black: the atmosphere LUTs weren't ready) -> zero sky fill, shaded streets pure black
      U.uEnvMode.value = 1; U.uCloudRT.value = 0; U.uHdr.value = null;
      renderer.setRenderTarget(eqRT); renderer.render(eqScene, eqCam);
      U.uEnvMode.value = 0; U.uCloudRT.value = crt;
      renderer.setRenderTarget(prev);
      envRT = pmrem.fromEquirectangular(eqRT.texture, envRT);
      scene.environment = envRT.texture;
      U.uHdr.value = eqRT.texture; U.uHdrMix.value = 0; U.uHdrScale.value = 1;
    }
    scene.environmentIntensity = (1 + weather.flash * 0.5) * ENV_ZONE.amb;
    if (cloudPass && camera) cloudPass.render(camera, quality.name === 'high' ? 3 : 4);
    // grass / trees / tiles read L.warm etc.; sun colour for the Google tiles tint
    L.warm *= 1 - cloud;
  }

  // ------------------------------------------------------------------ photographic HDRI sky (?sky=hdri)
  function updateHdri(dt, camera, sunEl, nightF, cloud, dark, Wp, k, bank) {
    const S = skyState(sunEl);
    const L = lookAt(sunEl);
    L.sat *= 1 - 0.28 * cloud; L.con *= 1 - 0.04 * cloud;
    if (AGX) L.sat *= 1.12;   // (look-dev) AgX compensation (?tm=agx only)
    L.exposure *= (1 + 0.3 * cloud * (1 - nightF)) * state.exposureMul;
    L.fill *= 1 + 1.3 * cloud; L.bounce *= 1 - 0.8 * cloud; L.env *= 1 - 0.25 * dark;
    const golden = THREE.MathUtils.smoothstep(sunEl, -3, 2) * (1 - THREE.MathUtils.smoothstep(sunEl, 9, 18)) * (1 - cloud) * (state.fogMode === 'thick' ? 0 : 1);
    const gClear = 1 - 0.6 * golden;
    fog.set((0.0006 + 0.0062 * k * k) * L.fog * gClear, 0.016 + 0.012 * (1 - k) + 0.01 * golden, (0.00009 + 0.00005 * k + 0.00011 * Wp.haze) * L.fog * (1 - 0.45 * nightF) * (1 - 0.45 * golden) + nightF * 0.00003);
    HB_FOG.x = bank * 0.12 * L.fog; HB_FOG.y = 0.075;
    weather.fogDensity = +(fog.density + HB_FOG.x).toFixed(5);
    fogColor.copy(S.fog);
    const skyScale = L.sky * (1 - 0.35 * dark);
    if (hdrReady) fogColor.lerp(_c.copy(hdrHorizon).multiplyScalar(skyScale * 0.9), 0.5);
    fogColor.lerp(_c.copy(GREY).multiplyScalar(lum(fogColor) / 0.64 + 1e-4), cloud * 0.45).multiplyScalar(1 - 0.3 * dark);
    if (camera) {
      camera.getWorldDirection(_f);
      const toward = Math.max(0, _f.x * sunDir.x + _f.z * sunDir.z) * (1 - nightF);
      fogColor.lerp(S.sunCol, toward * 0.08 * THREE.MathUtils.clamp(1 - sunEl / 25, 0, 1) * (1 - cloud * 0.7));
    }
    if (golden > 0) { const Lm = lum(fogColor); fogColor.lerp(_c.setRGB(Lm * 1.14, Lm * 0.98, Lm * 0.8), 0.5 * golden).multiplyScalar(1 + 0.22 * golden); }
    fogColor.add(_c.copy(FLASH).multiplyScalar(weather.flash * 0.12));
    fog.color.copy(fogColor).multiplyScalar(ENV_ZONE.fog);
    HB_SUN.x = sunDir.x; HB_SUN.y = sunDir.y; HB_SUN.z = sunDir.z;
    HB_SUN.w = (1 - nightF) * (1 - 0.75 * cloud) * (0.35 + 0.65 * THREE.MathUtils.clamp(1 - sunEl / 30, 0, 1));
    HB_SUNCOL.copy(S.sunCol).multiplyScalar(lum(fogColor) / Math.max(1e-3, lum(S.sunCol)) * 1.1);
    const U = sky.uniforms;
    U.uSunDir.value.copy(sunDir); U.uMoonDir.value.copy(moonDir);
    U.uZenith.value.copy(S.zenith); U.uHorizon.value.copy(S.horizon); U.uSunCol.value.copy(S.sunCol);
    U.uFogCol.value.copy(fogColor); U.uNight.value = nightF; U.uTime.value = time; U.uFogBand.value = (0.25 + 0.5 * k) * (1 - 0.65 * golden) + 0.35 * bank;
    U.uCloud.value = hdrReady ? 0 : Math.max(state.cloud, cloud);
    U.uHdrMix.value = hdrReady ? 1 : 0; U.uHdrScale.value = skyScale;
    U.uBandFix.value = golden; U.uFlash.value = weather.flash; U.uWash.value = Math.min(0.85, Wp.haze * 0.55 + weather.rain * 0.3);
    if (weather.flash > 0) U.uFlashDir.value.copy(weather.flashDir || U.uFlashDir.value);
    if (camera) sky.mesh.position.copy(camera.position);
    const useMoon = sunEl < -3;
    lightDir.copy(useMoon ? moonDir : sunDir);
    if (lightDir.y < 0.08) lightDir.y = 0.08, lightDir.normalize();
    const direct = 1 - 0.9 * Math.pow(cloud, 1.3);
    if (useMoon) { sun.color.setRGB(0.56, 0.65, 0.85); sun.intensity = L.sun * THREE.MathUtils.clamp(moonDir.y * 3, 0, 1) * direct; }
    else { sun.color.copy(S.sunCol).lerp(WARM, L.warm * 0.6); sun.intensity = L.sun * THREE.MathUtils.smoothstep(sunEl, -3, 2) * direct; }
    sun.shadow.intensity = 1 - 0.75 * cloud;
    const sunLum = useMoon ? 0 : sun.intensity * Math.max(0, sunDir.y + 0.15);
    hemi.color.copy(S.hemiSky).lerp(_c.copy(GREY).multiplyScalar(lum(S.hemiSky) / 0.64 + 1e-4), cloud * 0.6).multiplyScalar(L.fill * 2);
    hemi.groundColor.copy(GROUND).multiplyScalar(sunLum * L.bounce * 0.55).add(_c.copy(SODIUM).multiplyScalar(0.16 * L.city));
    if (weather.flash > 0) { hemi.color.add(_c.copy(FLASH).multiplyScalar(weather.flash * 1.6)); hemi.groundColor.add(_c.copy(FLASH).multiplyScalar(weather.flash * 0.4)); }
    hemi.intensity = ENV_ZONE.amb;
    const now = performance.now();
    const changed = Math.abs(state.hours - lastEnvHours) > 0.05 || Math.abs(cloud - lastEnvCloud) > 0.025 || Math.abs(weather.drift - lastEnvDrift) > 0.03;
    if (changed && now - envAt > 450) {
      envAt = now; lastEnvHours = state.hours; lastEnvCloud = cloud; lastEnvDrift = weather.drift;
      if (hsky) {
        const r = hsky.update(sunDir, state.hours, { sat: L.envSat, tint: L.tint }, { cloud, dark, drift: weather.drift });
        scene.environment = r.env; U.uHdr.value = r.texture; hdrHorizon.copy(r.horizon); hdrReady = true;
        const P = r.params;
        U.uDirect.value = 1; U.tA.value = P.tA; U.tB.value = P.tB; U.tS.value = P.tS; U.hW.value = P.w;
        U.rotA.value = P.rotA; U.rotB.value = P.rotB; U.rotS.value = P.rotS; U.sA.value = P.sA; U.sB.value = P.sB; U.sS.value = P.sS;
        U.stormW.value = P.stormW; U.capS.value = P.capS; U.stormG.value = P.stormG;
      } else {
        const old = envRT;
        envRT = pmrem.fromScene(envScene, 0.02, 1, 3000);
        scene.environment = envRT.texture;
        scene.environmentIntensity = (0.35 + 0.4 * (1 - nightF)) * ENV_ZONE.amb;
        if (old) old.dispose();
      }
    }
    if (hsky && hdrReady) scene.environmentIntensity = (L.env + weather.flash * 0.5) * ENV_ZONE.amb;
  }
  // world x of the fog bank's eastern edge (the bank pours in from the Pacific, i.e. from -X)
  let worldSpan = null;
  function bankFront(bank) {
    if (bank <= 0.001) return -1e9;
    const B = worldSpan || { minX: -4000, maxX: 4000 };
    return B.minX + (B.maxX - B.minX) * (PHYS ? 0.12 + 0.43 * bank : 0.15 + 0.75 * bank);   // phys: Karl stops around Twin Peaks
  }
  api.setWorldBounds = (b) => { worldSpan = b; };
  api._dbg = { get eqRT() { return eqRT; }, get envRT() { return envRT; }, pmrem };
  return api;
}
