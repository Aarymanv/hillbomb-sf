// Night car lighting: two real spotlights for the player's headlights (always present, intensity 0 by day so the light
// count never changes = no shader recompiles) + one Points draw call of lamp flares for every car + one instanced
// draw of headlight pools on the road in front of every nearby car with its lights on.
//
// Flares are small bright cores with a faint halo, sized in real metres through the actual projection (min 2 px:
// sub-pixel lamps fade out by area instead of shimmering), and directional: a headlight is bright only when it points
// at the camera, a tail light only from behind. The old flare was a 1.25 m sprite at a fixed 400 px scale, full
// strength from every side: close cars became white bloom blobs.
import * as THREE from 'three';

const MAX = 600, POOLS = 48;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4(), _o = new THREE.Matrix4();
// every lamp flare of the last update (world position + HDR colour), read by the wet-road streaks (render/wetstreaks.js)
export const CAR_FLARES = { pos: null, col: null, n: 0 };
// Low beams (look-dev): a real low beam has a sharp horizontal cut-off just below the lamp's height, so it pools on the
// road 5-25 m ahead and only lights the bottom of a wall across the junction. SpotLight cones are round, so three's
// spot-light info gets a cut-off for spots tagged by their decay (HEAD_DECAY, physical ~2): light that would travel
// upward from the lamp fades out over ~2.7 degrees around the horizontal.
const HEAD_DECAY = 1.9;
{
  const C = THREE.ShaderChunk, a = 'light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );';
  if (C.lights_pars_begin.includes(a) && !C.lights_pars_begin.includes('hbLowBeam')) C.lights_pars_begin = C.lights_pars_begin.replace(a, a + `
			if ( abs( spotLight.decay - ${HEAD_DECAY.toFixed(2)} ) < 0.005 ) {   // hbLowBeam
				float hbUp = dot( - light.direction, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
				light.color *= 1.0 - smoothstep( -0.035, 0.012, hbUp );
			}`);
  else if (!C.lights_pars_begin.includes('hbLowBeam')) console.warn('[carlights] low-beam cut-off: three chunk changed');
}
export function createCarLights(scene) {
  const spots = [0, 1].map(() => {
    const s = new THREE.SpotLight(0xfff1dc, 0, 70, 0.62, 0.75, HEAD_DECAY);   // (was decay 1.2: a wall 30 m ahead got ~1/3 of the near light)
    s.castShadow = false;
    scene.add(s, s.target);
    return s;
  });
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const U = { uProj: { value: 600 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `attribute float size; uniform float uProj; varying vec3 vCol; varying float vPx;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float px = size * uProj / max(0.5, -mv.z);                 // true projected size (px) of the flare sprite
        gl_PointSize = clamp(px, 2.0, 64.0);
        vCol = color * min(1.0, (px * px) / 4.0);                  // below 2 px: fade by covered area, no shimmer
        vPx = gl_PointSize; }`,
    fragmentShader: `varying vec3 vCol; varying float vPx;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0;
        float core = exp(-r2 * 30.0), halo = exp(-r2 * 6.0) * 0.07;
        float a = core + halo; if (a < 0.004) discard;
        gl_FragColor = vec4(vCol * a, 1.0); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  CAR_FLARES.pos = pos; CAR_FLARES.col = col;
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 8;
  scene.add(points);

  // headlight pools: one flat quad per car in the car's own frame (follows the road's grade), additive, soft cone
  const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2); pg.translate(0, 0, -0.5);   // spans z = 0..-1 (ahead)
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uStr: { value: 0 } },
    vertexShader: `varying vec2 vP; varying float vFade; attribute float aStr; varying float vStr;
      void main(){ vP = vec2(position.x, -position.z); vStr = aStr; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * w; vFade = 1.0 - smoothstep(90.0, 160.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uStr; varying vec2 vP; varying float vFade; varying float vStr;
      void main(){ float y = vP.y, x = vP.x / max(0.18, 0.28 + 0.55 * y);          // cone widens with distance
        float lat = exp(-x * x * 7.0), lon = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 1.6);
        float k = lat * lon * uStr * vStr * vFade; if (k < 0.002) discard;
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * k, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const pools = new THREE.InstancedMesh(pg, poolMat, POOLS);
  const poolStr = new THREE.InstancedBufferAttribute(new Float32Array(POOLS), 1).setUsage(THREE.DynamicDrawUsage);
  pg.setAttribute('aStr', poolStr);
  pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pools.frustumCulled = false; pools.renderOrder = 7; pools.count = 0; pools.name = 'carlight-pools';
  scene.add(pools);
  const near = [];

  function update(vehicles, player, camera, night, time) {
    // player headlights
    const pv = player.vehicle;
    const on = pv && night > 0.25;
    for (let i = 0; i < 2; i++) {
      const s = spots[i];
      s.intensity = on ? 110 * Math.min(1, (night - 0.25) * 3) : 0;
      if (!pv) continue;
      const a = pv.visual.headlightAnchors?.[i];
      if (!a) continue;
      _v.copy(a).applyQuaternion(pv.root.quaternion).add(pv.root.position);
      s.position.copy(_v);
      pv.body.forward(_f); pv.body.up(_u);
      s.target.position.copy(_v).addScaledVector(_f, 16).addScaledVector(_u, -1.1);
      s.target.updateMatrixWorld();
    }
    // projected size of 1 m at 1 m, in drawing-buffer pixels
    const H = window.__renderer?.domElement?.height || 720;
    U.uProj.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 60) / 2));
    // flares
    let n = 0;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const push = (x, y, z, r, g, b, sz) => { if (n >= MAX) return; pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; col[n * 3] = r; col[n * 3 + 1] = g; col[n * 3 + 2] = b; size[n] = sz; n++; };
    near.length = 0;
    for (const v of vehicles) {
      const dx = v.pos.x - cx, dz = v.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 > 320 * 320) continue;
      const L = v.lights;
      const q = v.root.quaternion, o = v.root.position, sp = v.spec;
      const head = v.visual.headlightAnchors || [];
      // facing: car forward (-Z) against the direction car -> camera
      _f.set(0, 0, -1).applyQuaternion(q);
      const dl = Math.sqrt(d2 + (cy - o.y) ** 2) || 1, face = (_f.x * -dx + _f.y * (cy - o.y) + _f.z * -dz) / dl;
      if (night > 0.2 && L.head) {
        const k = night * (0.06 + 0.94 * Math.pow(THREE.MathUtils.smoothstep(face, -0.15, 0.85), 1.5));
        for (const a of head) { _v.copy(a).applyQuaternion(q).add(o); push(_v.x, _v.y, _v.z, 2.2 * k, 2.0 * k, 1.7 * k, 0.5); }
        if (head.length && v !== pv) near.push(v, d2);      // (regression fix 9/30: not the player's car: its real spots light the road; the extra additive pool read as a white smear on wet asphalt)
      }
      // tail lights (approximate from the body bounds), seen from behind
      const tb = L.brake ? 1 : night > 0.2 ? 0.45 * night : 0;
      if (tb > 0 && head.length) {
        const back = 0.12 + 0.88 * THREE.MathUtils.smoothstep(-face, -0.2, 0.7), k = tb * back;
        const ty = head[0].y + 0.08, tz = sp.bounds.max[2] - 0.08, tx = sp.width / 2 - 0.28;
        for (const sx of [-1, 1]) { _v.set(sx * tx, ty, tz).applyQuaternion(q).add(o); push(_v.x, _v.y, _v.z, 1.5 * k, 0.07 * k, 0.05 * k, L.brake ? 0.42 : 0.3); }
      }
      // siren
      if (L.siren) {
        const ph = (time * 4 + v.uid * 0.37) % 1;
        const top = sp.height + 0.05;
        for (const sx of [-1, 1]) {
          const lit = sx < 0 ? ph < 0.5 : ph >= 0.5;
          if (!lit) continue;
          _v.set(sx * 0.45, top, -0.1).applyQuaternion(q).add(o);
          push(_v.x, _v.y, _v.z, sx < 0 ? 1.6 : 0.12, sx < 0 ? 0.07 : 0.3, sx < 0 ? 0.07 : 1.7, 0.9 + night * 0.5);
        }
      }
    }
    geo.setDrawRange(0, n);
    CAR_FLARES.n = n;
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    // road pools for the nearest cars with headlights on (the player's own car has real spotlights)
    let c = 0;
    const str = Math.min(1, Math.max(0, (night - 0.25) * 3));
    poolMat.uniforms.uStr.value = 0.5 * str;
    if (str > 0) {
      // nearest first (pairs [v, d2])
      const idx = []; for (let i = 0; i < near.length; i += 2) idx.push(i);
      idx.sort((a, b) => near[a + 1] - near[b + 1]);
      for (const i of idx) {
        if (c >= POOLS) break;
        const v = near[i], sp = v.spec, len = v === pv ? 24 : 16, w = Math.max(1.6, sp.width || 1.8) * 2.2;
        _o.makeScale(w, 1, len).setPosition(0, 0.04, (sp.bounds?.min?.[2] ?? -2.2) + 0.2);
        _m.compose(v.root.position, v.root.quaternion, _u.set(1, 1, 1)).multiply(_o);
        pools.setMatrixAt(c, _m); poolStr.array[c] = v === pv ? 1.3 : 1; c++;
      }
    }
    pools.count = c; pools.visible = c > 0;
    if (c) { pools.instanceMatrix.needsUpdate = true; poolStr.needsUpdate = true; }
  }
  return { update, spots, points, pools };
}
