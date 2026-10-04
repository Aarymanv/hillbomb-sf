// Google Photorealistic 3D Tiles (Map Tiles API) as the mid/far city on the 1:1 map. Our own city (roads, facades, props,
// physics) owns the 3x3 block of 512 m stream tiles around the player; the photogrammetry fills everything beyond it.
// Needs VITE_GOOGLE_TILES_KEY in .env.local. Attribution (Google + data providers) is shown on screen while active.
import * as THREE from 'three';
import { TilesRenderer, Scheduler } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, TilesFadePlugin, UnloadTilesPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { toLatLon } from '../latlon.js';
import { zoneAtV2, COMMERCIAL_ZONES_V2, COMMERCIAL_STREETS_V2 } from '../props/v2zones.js';
import { PERF } from '../../render/perfflags.js';
import { createPhasedUpdate } from './tilesphase.js';

const GEOID_N = -32.2;              // SF geoid undulation: sea level sits ~32 m below the WGS84 ellipsoid
const REANCHOR = 350;               // re-anchor the ENU frame when the player moves this far (curvature stays < 1 cm locally)
const NEAR_R = 300, NEAR_KEEP = 420; // our city owns every stream tile within NEAR_R of the player (kept until NEAR_KEEP)

export function createGoogleTiles({ scene, camera, renderer, stream, roots = [], key, env, graph = null }) {
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
  const draco = new DRACOLoader().setDecoderPath('./draco/');
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  // every tile queue schedules through Scheduler's requestAnimationFrame, which never fires in hidden/background tabs
  // (and the game can run frames manually): give it a timer-driven "session" instead
  Scheduler.setXRSession({ requestAnimationFrame: cb => setTimeout(() => cb(performance.now()), 0), cancelAnimationFrame: h => clearTimeout(h) });
  const Q = env?.quality || {};
  tiles.errorTarget = Q.tilesError ?? 12;       // screen-space error: lower = sharper, more requests (preset: low 24 .. ultra 10)
  // 520 MB (was 900): the cache sat at ~480-950 MB of tile geometry + textures, pushing the tab past 2 GB and
  // stretching GC pauses; 2 parses at a time (was 5) so a burst of tiles doesn't parse back to back in one task
  // (perf 9/30) preset-driven: 300 MB on high (was 520; the visible set at errorTarget 12 is ~150-250 MB), 160 on low
  tiles.lruCache.maxBytesSize = (Q.tilesMB ?? 300) * 1024 * 1024;
  tiles.lruCache.minBytesSize = Q.tilesMin ? Q.tilesMin * 1024 * 1024 : tiles.lruCache.maxBytesSize * 0.7;   // (library default 307 MB: unused tiles were kept above the new max)
  tiles.parseQueue.maxJobs = 2;
  tiles.group.name = 'googleTiles';
  tiles.group.matrixAutoUpdate = false;
  scene.add(tiles.group);

  // photo textures already contain their lighting: draw them unlit, dimmed at night, discarded inside our near block
  // uNear = 3x3 stream-tile block origin x, z, tile size, bitmask of the tiles that are ours (discarded here)
  // uGrade = rgb tint, w = saturation: the photos carry midday light, graded to our time of day
  const city = graph ? createCityLights(renderer, graph) : null;
  const U = { uNear: { value: new THREE.Vector4(0, 0, 1, 0) }, uDay: { value: 1 }, uGrade: { value: new THREE.Vector4(1, 1, 1, 1) },
    uCity: { value: city?.texture || null }, uCityXf: { value: city?.xf || new THREE.Vector4(0, 0, 0, 0) }, uNightL: { value: 0 } };
  const patch = m => {
    const b = new THREE.MeshBasicMaterial({ map: m.map, color: 0xffffff, fog: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    b.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw; uniform vec4 uNear; uniform float uDay; uniform vec4 uGrade; uniform sampler2D uCity; uniform vec4 uCityXf; uniform float uNightL;\n' + CITY_GLSL)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ vec2 nc = floor((vGw.xz - uNear.xy) / uNear.z);
  if (nc.x >= 0.0 && nc.y >= 0.0 && nc.x < 3.0 && nc.y < 3.0 && ((int(uNear.w + 0.5) >> int(nc.y * 3.0 + nc.x)) & 1) == 1) discard;
  if (vGw.y < 1.0) discard; }   // the Bay / ocean: our own water (and terrain) draws there; the photo water showed dark patches and seams`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec3 hbPhoto = diffuseColor.rgb;
diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, uGrade.w) * uGrade.rgb * uDay, 0.0);
if (uNightL > 0.01) diffuseColor.rgb += hbCityNight(vGw, hbPhoto) * uNightL;`);
    };
    b.customProgramCacheKey = () => 'gtiles-v4';
    return b;
  };
  tiles.addEventListener('load-model', ({ scene: s }) => {
    s.traverse(o => { if (o.isMesh && o.material) { const old = o.material; o.material = patch(old); old.dispose?.(); o.castShadow = false; o.receiveShadow = false; } });
    // (perf 10/4) tile content never moves inside its tile (re-anchoring moves tiles.group): no per-frame matrix recompose
    // for the ~600 tile nodes in every scene.updateMatrixWorld
    s.updateMatrix(); s.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  });

  // ENU frame at the anchor -> our world (+X east, +Y up, +Z south), anchored so the anchor lat/lon sits at its world x/z
  const anchor = { x: Infinity, z: Infinity };
  let anchorVer = 0;
  const F = new THREE.Matrix4(), B = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1), T = new THREE.Matrix4();
  function reanchor(x, z) {
    const [lat, lon] = toLatLon(x, z);
    tiles.ellipsoid.getEastNorthUpFrame(THREE.MathUtils.degToRad(lat), THREE.MathUtils.degToRad(lon), GEOID_N, F);
    T.makeTranslation(x, 0, z).multiply(B).multiply(F.invert());
    tiles.group.matrix.copy(T); tiles.group.matrixWorldNeedsUpdate = true; tiles.group.updateMatrixWorld(true);
    anchor.x = x; anchor.z = z; anchorVer++;
  }

  // attribution overlay (required while tiles are shown)
  const attr = document.createElement('div');
  attr.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:30;font:500 11px/1.2 Inter,system-ui,sans-serif;color:rgba(255,255,255,.8);text-shadow:0 1px 2px #000;pointer-events:none;white-space:nowrap';
  document.body.appendChild(attr);
  const stats = { loaded: 0, requests: 0 };
  tiles.addEventListener('load-model', () => { stats.loaded++; });

  let hideT = 0, calm = 0, ready = false, mask = 0, cx = -1e9, cz = -1e9, wasReady = false;
  const ours = new Set(), oursPrev = new Set();
  const last = { x: NaN, z: NaN };
  const T0 = stream.T;
  const inMask = (x, z) => { const i = Math.floor((x - cx) / T0), j = Math.floor((z - cz) / T0); return i >= 0 && j >= 0 && i < 3 && j < 3 && ((mask >> (j * 3 + i)) & 1) === 1; };
  const sunC = new THREE.Color();
  // (perf 10/4) tiles lying wholly inside our near block are culled before the tiles renderer refines, loads or draws them:
  // every fragment there is discarded by the uNear mask anyway, but the near photogrammetry is the most refined part of
  // the set (Mission: ~190 of ~280 tile draws, FiDi 109 of 119). Only within MASK_CULL_R of the focus (farthest box
  // corner): a mask cell is released at NEAR_KEEP (420 m), so a culled tile is back in view >= 80 m of travel before its
  // cell can hand over to the photos. ?nomaskcull = A/B.
  const MASK_CULL_R = 340;
  const _ob = new THREE.Box3(), _om = new THREE.Matrix4(), _oc = new THREE.Vector3();
  let fx = 0, fz = 0;
  const maskStats = { culled: 0 };
  const TPAD = 10, TSKIP = 3, TCOS = Math.cos(THREE.MathUtils.degToRad(TPAD / 2));
  const tcam = new THREE.PerspectiveCamera(); tcam.matrixAutoUpdate = false; tcam.matrixWorldAutoUpdate = false;
  const tLast = { n: 9, fwd: new THREE.Vector3(), pos: new THREE.Vector3(1e9, 0, 0), fov: 0, aspect: 0 }, _tf = new THREE.Vector3(), _tv = new THREE.Vector2();
  const phased = createPhasedUpdate(tiles);
  const cellsInMask = (x0, z0, x1, z1) => {
    const i0 = Math.floor((x0 - cx) / T0), i1 = Math.floor((x1 - cx) / T0), j0 = Math.floor((z0 - cz) / T0), j1 = Math.floor((z1 - cz) / T0);
    if (i0 < 0 || j0 < 0 || i1 > 2 || j1 > 2) return false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (((mask >> (j * 3 + i)) & 1) === 0) return false;
    return true;
  };
  tiles.registerPlugin({
    name: 'HB_NEAR_MASK_CULL',
    calculateTileViewError(tile, target) {
      if (!PERF.maskcull || !mask || api.nearRadius === 0) return false;
      let a = tile.__hbXZ;
      if (!a || a[4] !== anchorVer) {
        const bv = tile.engineData?.boundingVolume; if (!bv) return false;
        bv.getOBB(_ob, _om); _om.premultiply(tiles.group.matrixWorld);
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let k = 0; k < 8; k++) {
          _oc.set(k & 1 ? _ob.max.x : _ob.min.x, k & 2 ? _ob.max.y : _ob.min.y, k & 4 ? _ob.max.z : _ob.min.z).applyMatrix4(_om);
          if (_oc.x < x0) x0 = _oc.x; if (_oc.x > x1) x1 = _oc.x; if (_oc.z < z0) z0 = _oc.z; if (_oc.z > z1) z1 = _oc.z;
        }
        a = tile.__hbXZ = [x0, z0, x1, z1, anchorVer];
      }
      const dx = Math.max(fx - a[0], a[2] - fx), dz = Math.max(fz - a[1], a[3] - fz);
      if (dx * dx + dz * dz > MASK_CULL_R * MASK_CULL_R || !cellsInMask(a[0], a[1], a[2], a[3])) return false;
      target.inView = false; maskStats.culled++;
      return true;
    },
  });
  const api = {
    tiles, stats, maskStats, phased, phCycle: 5, nearRadius: null, get ready() { return ready; }, get nearMask() { return mask; },
    // is (x, z) inside our near block (or are the photos not ready yet)? (buildings kit cells follow it)
    ours: (x, z) => !ready || api.nearRadius !== 0 && inMask(x, z),
    update(dt, focus) {
      if (!focus) return;
      if (Math.hypot(focus.x - anchor.x, focus.z - anchor.z) > REANCHOR) reanchor(focus.x, focus.z);
      // a teleport: keep our whole city (incl. the far skyline) on screen until the photogrammetry there has streamed in
      if (!(Math.hypot(focus.x - last.x, focus.z - last.z) < 150)) { ready = false; calm = 0; }
      last.x = focus.x; last.z = focus.z;
      const ts = tiles.stats || {}, busy = (ts.queued || 0) + (ts.downloading || 0) + (ts.parsing || 0);
      calm = busy < 6 ? calm + dt : 0;
      if (calm > 0.6 && stats.loaded > 20) ready = true;
      if (ready !== wasReady) { wasReady = ready; hideT = 0; }
      // our near block: the stream tiles of the 3x3 around the focus that come within NEAR_R (kept until NEAR_KEEP),
      // so our city always reaches >= NEAR_R in every direction and the photogrammetry starts right after it
      // (hysteresis by stream-tile key: it used to be kept per 3x3 bit, so crossing into the next tile reset it and every
      // tile at 300-420 m flipped to the photogrammetry at once)
      const t = stream.tileAt(focus.x, focus.z);
      if (t) {
        const ox = t.x0 - T0, oz = t.z0 - T0;
        let m = 0; ours.clear();
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          const x0 = ox + i * T0, z0 = oz + j * T0, b = j * 3 + i, tl = stream.tile(t.tx - 1 + i, t.tz - 1 + j);
          const d = Math.hypot(Math.max(x0 - focus.x, 0, focus.x - x0 - T0), Math.max(z0 - focus.z, 0, focus.z - z0 - T0));
          if (tl && (d <= NEAR_R || (d <= NEAR_KEEP && oursPrev.has(tl.key)))) { m |= 1 << b; ours.add(tl.key); }
        }
        if (m !== mask || ox !== cx || oz !== cz) hideT = 0;      // our meshes follow the shader mask in the same frame
        cx = ox; cz = oz; mask = m;
        oursPrev.clear(); for (const k of ours) oursPrev.add(k);
      }
      U.uNear.value.set(cx, cz, T0, api.nearRadius === 0 ? 0 : mask);   // nearRadius 0 = debug: photogrammetry everywhere
      // our meshes outside the block give way to the photogrammetry once it has loaded (checked a few times a second);
      // multi-tile meshes (far skyline / far terrain chunks) always give way then: they would double up with the photos
      hideT -= dt;
      if (hideT <= 0) {
        hideT = 0.25;
        for (const r of roots) for (const m of r.children) {
          const g = m.geometry; if (!g) continue;
          if (!g.boundingBox) g.computeBoundingBox();
          const bb = g.boundingBox;
          if (api.nearRadius === 0) { m.visible = false; continue; }
          if (!ready) { m.visible = true; continue; }
          const big = bb.max.x - bb.min.x > T0 * 1.6 || bb.max.z - bb.min.z > T0 * 1.6;
          m.visible = !big && inMask((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2);
        }
      }
      // grade to our light: divide out our tone-map exposure (it rises at dusk / night), warm the tint with the sun at
      // golden hour, a little extra saturation so the photos sit with our city
      const nightF = env?.night?.value ?? 0, expo = renderer.toneMappingExposure || 1, L = env?.look || {};
      if (env?.sun?.color) sunC.copy(env.sun.color); else sunC.setRGB(1, 1, 1);
      sunC.multiplyScalar(1 / Math.max(sunC.r, sunC.g, sunC.b, 1e-3));
      const warm = THREE.MathUtils.clamp(L.warm ?? 0, 0, 1) * (1 - nightF), k = 0.6 * warm;
      U.uGrade.value.set(1 + (sunC.r - 1) * k, 1 + (sunC.g - 1) * k, 1 + (sunC.b - 1) * k, 1.12 * (L.sat ?? 1.1) / 1.1);
      // (physical sky: the photos follow the natural-light level -> they darken through dusk; the city lights come on)
      const phys = env?.phys && env.atmos;
      const dayK = phys ? 0.55 + 0.45 * THREE.MathUtils.smoothstep(env.sunDir?.y || 0, -0.05, 0.2) : 1;
      U.uDay.value = THREE.MathUtils.lerp(0.9 * 0.86 / Math.max(0.5, expo) * (1 - 0.2 * warm) * dayK, phys ? 0.05 : 0.12, nightF);
      U.uNightL.value = city ? THREE.MathUtils.smoothstep(nightF, 0.25, 0.9) : 0;
      if (city && U.uNightL.value > 0) city.ensure();
      fx = focus.x; fz = focus.z;
      camera.updateMatrixWorld();
      // (perf 10/4) the tiles traversal (3-5 ms CPU) runs every TSKIP-th frame: it selects tiles for a frustum widened by
      // TPAD degrees (same pixel scale, so the same LOD) and the tile meshes are frustum-culled by three every frame, so a
      // tile turning into view between two traversals is already shown. A turn of more than TPAD / 2, a fov / aspect change
      // or a jump traverses at once. ?notilesthrottle = every frame on the real camera.
      if (PERF.tilesthrottle) {
        if (tiles.autoDisableRendererCulling) tiles.autoDisableRendererCulling = false;
        if (tiles.cameras.includes(camera)) tiles.deleteCamera(camera);
        const k = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2 + TPAD)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.getWorldDirection(_tf);
        const turned = _tf.dot(tLast.fwd) < TCOS, jumped = camera.position.distanceToSquared(tLast.pos) > 400;
        const urgent = turned || jumped || camera.fov !== tLast.fov || camera.aspect !== tLast.aspect || !tiles.cameras.length;
        // (perf r3) the traversal runs as a cycle sliced over frames (world/v2/tilesphase.js, ~1 ms per frame) instead of
        // all of it every 3rd frame; a sharp turn / jump finishes the running cycle at once and starts the next. A cycle
        // starts every phCycle (5) frames or when the last one ends, whichever is later (pan test dev/tiles_pan.js,
        // 120 deg/s vs a full traversal every frame on the real camera: differing cells below the A/A noise).
        // ?notilesphase = the library's whole update() every TSKIP frames.
        const usePh = PERF.tilesphase && phased.ready();
        tLast.n++;
        if (usePh && phased.busy) { if (urgent) phased.finish(); else phased.next(); }
        if (!(usePh && phased.busy) && (tLast.n >= (usePh ? api.phCycle : TSKIP) || urgent)) {
          tLast.n = 0; tLast.fwd.copy(_tf); tLast.pos.copy(camera.position); tLast.fov = camera.fov; tLast.aspect = camera.aspect;
          tcam.fov = camera.fov + 2 * TPAD; tcam.aspect = camera.aspect; tcam.near = camera.near; tcam.far = camera.far; tcam.zoom = camera.zoom; tcam.updateProjectionMatrix();
          tcam.matrixWorld.copy(camera.matrixWorld); tcam.matrixWorldInverse.copy(camera.matrixWorldInverse); tcam.position.setFromMatrixPosition(camera.matrixWorld);
          tiles.setCamera(tcam);
          renderer.getSize(_tv); tiles.setResolution(tcam, _tv.x * k, _tv.y * k);
          maskStats.culled = 0;
          if (usePh) { phased.start(); if (urgent) phased.finish(); }
          else tiles.update();
        }
      } else {
        if (!tiles.autoDisableRendererCulling) tiles.autoDisableRendererCulling = true;
        if (tiles.cameras.includes(tcam)) tiles.deleteCamera(tcam);
        maskStats.culled = 0;
        tiles.setCamera(camera);
        tiles.setResolutionFromRenderer(camera, renderer);
        tiles.update();
      }
      const a = tiles.getAttributions?.() || [];
      const txt = a.map(x => x.value).filter(Boolean).join(' ');
      attr.textContent = 'Google' + (txt ? ' · ' + txt : '');
    },
    dispose() { tiles.dispose(); attr.remove(); },
  };
  return api;
}

// ---------------------------------------------------------------- night: the photogrammetry city lights up
// A static world-space light map of the WHOLE street graph (rendered once, ~11 m texels): warm street-light lines with
// lamp beads every ~32 m, brighter on commercial corridors; alpha = commercial density (drives the lit-window share).
// The tile shader adds it to up-facing surfaces and draws procedural lit windows on facades (pixel-footprint LOD:
// far walls fade to their average glow instead of sparkling).
const CITY_GLSL = /* glsl */`
float hbCH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 hbCityNight(vec3 p, vec3 photo) {
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  vec2 cuv = (p.xz - uCityXf.xy) * uCityXf.zw;
  vec4 cl = (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) ? texture2D(uCity, cuv) : vec4(0.0);
  float pl = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  float green = smoothstep(0.02, 0.09, photo.g - max(photo.r, photo.b));   // trees / lawns: no windows
  vec3 o = vec3(0.0);
  // streets: glow on the ground, lit asphalt + kerbs
  float up = smoothstep(0.55, 0.85, abs(n.y));
  o += cl.rgb * up * (0.35 + 1.4 * pl);
  // windows on walls
  float wall = 1.0 - smoothstep(0.25, 0.5, abs(n.y));
  if (wall > 0.0 && p.y > 4.0) {
    vec2 t = normalize(vec2(-n.z, n.x) + 1e-5);
    vec2 c = vec2(dot(p.xz, t) / 2.7, (p.y - 1.0) / 3.5);
    vec2 id = floor(c), f = fract(c);
    float blk = hbCH(floor(p.xz / 23.0) + 7.1);                     // per-facade variation
    float prob = mix(0.12, 0.42, cl.a) * (0.6 + 0.8 * blk);
    float h = hbCH(id + blk * 31.0);
    float lit = step(1.0 - prob, h);
    float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.28, f.y) * step(f.y, 0.82);
    vec3 wc = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.92, 1.0), step(0.72, hbCH(id + 3.3)) * (0.3 + 0.7 * cl.a));
    wc *= 0.55 + 0.9 * hbCH(id + 9.7);
    vec2 fw = fwidth(c);
    float lod = smoothstep(0.2, 0.6, max(fw.x, fw.y));
    vec3 w = mix(wc * lit * win, vec3(1.0, 0.8, 0.55) * prob * 0.38, lod);
    o += w * wall * (1.0 - green) * 1.4;
  }
  return o;
}`;
function createCityLights(renderer, graph) {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const nd of graph.nodes) { minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x); minZ = Math.min(minZ, nd.z); maxZ = Math.max(maxZ, nd.z); }
  const S = Math.max(maxX - minX, maxZ - minZ) + 400, RES = 1024;
  const ox = (minX + maxX) / 2 - S / 2, oz = (minZ + maxZ) / 2 - S / 2;
  const xf = new THREE.Vector4(ox, oz, 1 / S, 1 / S);
  const rt = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
  let done = false;
  function ensure() {
    if (done) return; done = true;
    const A = [], B = [], C = [];
    for (const e of graph.edges) {
      if (!e.pts || e.tunnel || e.kind === 'alley' || e.kind === 'park' || e.kind === 'plaza' || e.unpaved) continue;
      const m = e.pts[e.pts.length >> 1];
      let zone = 'avenues'; try { zone = zoneAtV2(m[0], m[1]); } catch { /* v1 */ }
      const comm = COMMERCIAL_ZONES_V2.has(zone) || zone === 'soma' || zone === 'downtown_soma' ? 1 : COMMERCIAL_STREETS_V2.has(e.name) || zone === 'mission' ? 0.6 : 0;
      const E = (0.24 + 0.3 * comm) * (e.kind === 'arterial' || e.kind === 'highway' ? 1.35 : 1);
      const sod = zone === 'industrial' || zone === 'mission' || e.kind === 'highway' ? 1 : 0;
      let s0 = 0;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1];
        A.push(ax, az, bx, bz); B.push((e.width || 8) / 2 + 3, E, comm, s0); C.push(sod, 0);
        s0 += Math.hypot(bx - ax, bz - az);
      }
    }
    const N = A.length / 4;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aSeg', new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
    geo.setAttribute('aQ', new THREE.InstancedBufferAttribute(new Float32Array(C), 2));
    geo.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uXf: { value: xf } },
      vertexShader: `attribute vec4 aSeg, aP; attribute vec2 aQ; uniform vec4 uXf; varying float vX, vS, vSod; varying vec4 vP;
        void main(){ vec2 a = aSeg.xy, b = aSeg.zw, t = b - a; float L = max(length(t), 1e-3); t /= L; vec2 n = vec2(-t.y, t.x);
          float W = aP.x + 8.0; vec2 p = a - t * 6.0 + t * (L + 12.0) * position.y + n * position.x * W;
          vX = position.x * W; vS = aP.w - 6.0 + (L + 12.0) * position.y; vP = aP; vSod = aQ.x;
          gl_Position = vec4((p - uXf.xy) * uXf.zw * 2.0 - 1.0, 0.0, 1.0); }`,
      fragmentShader: `varying float vX, vS, vSod; varying vec4 vP;
        void main(){ float k = 1.0 - smoothstep(vP.x - 3.0, vP.x + 8.0, abs(vX));
          float bead = 0.55 + 0.45 * pow(0.5 + 0.5 * cos(vS * 6.2831853 / 32.0), 3.0);
          vec3 col = mix(vec3(1.0, 0.8, 0.58), vec3(1.0, 0.6, 0.3), vSod);
          gl_FragColor = vec4(col * vP.y * k * bead, vP.z * k); }`,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(mesh);
    const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), ac = renderer.autoClear;
    renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(true, false, false); renderer.autoClear = false;
    renderer.render(sc, new THREE.Camera());
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); renderer.autoClear = ac;
    geo.dispose(); mat.dispose();
  }
  return { texture: rt.texture, xf, ensure };
}
