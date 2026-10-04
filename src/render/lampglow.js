// Volumetric street-lamp light at night: for the nearest lamps, a soft cone of light scattered by rain / haze under
// the head (with falling drops glinting inside it) and a wide halo around the head. Axial / camera-facing billboards,
// one instanced additive draw call. Strength follows rain (droplets scatter) and the night factor.
import * as THREE from 'three';

const MAXL = 28;
export function createLampGlow(scene) {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  const iP = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);  // head xyz, height above ground
  const iC = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);  // colour, type (0 cone, 1 halo)
  geo.setAttribute('iP', iP); geo.setAttribute('iC', iC); geo.instanceCount = 0;
  const U = { uTime: { value: 0 }, uCone: { value: 0 }, uHalo: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `attribute vec4 iP, iC; uniform float uCone, uHalo; varying vec2 vQ; varying vec3 vCol; varying float vType; varying vec2 vW; varying float vDist;
      void main(){
        vec3 P = iP.xyz; float hl = iP.w; vType = iC.w; vQ = position.xy * 2.0;
        float dist = length(P - cameraPosition); vDist = dist;
        float nearFade = smoothstep(5.0, 22.0, dist);
        vec3 wp;
        if (iC.w < 0.5) {
          // cone: vertical axis, faces the camera around Y; widens toward the ground
          vec3 toC = cameraPosition - P; vec3 side = normalize(vec3(-toC.z, 0.0, toC.x) + 1e-5);
          float t = 0.5 - position.y;                                  // 0 at the head .. 1 at the ground
          float r = mix(0.22, max(0.9, hl * 0.3), t);
          wp = P + vec3(0.0, -t * hl * 0.98 - 0.25, 0.0) + side * position.x * 2.0 * r;
          vCol = iC.rgb * uCone * nearFade;
          vW = vec2(position.x * 2.0 * r, wp.y);
        } else {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float R = 0.75 + dist * 0.006;                               // small, tight halo (was 2.6 m + : read as white blobs)
          wp = P + (right * position.x + up * position.y) * R * 2.0 + normalize(cameraPosition - P) * 0.6;
          vCol = iC.rgb * uHalo * mix(0.35, 1.0, nearFade);
          vW = vec2(0.0);
        }
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `uniform float uTime; varying vec2 vQ; varying vec3 vCol; varying float vType; varying vec2 vW; varying float vDist;
      float h11(float p){ return fract(sin(p * 127.1) * 43758.5453); }
      void main(){
        float k;
        if (vType < 0.5) {
          float t = 0.5 - vQ.y * 0.5;                                     // 0 head .. 1 ground
          float across = sqrt(max(0.0, 1.0 - vQ.x * vQ.x));              // path length through the cone
          k = across * across * exp(-t * 2.2) * smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.75, 1.0, t)) * 0.55;
          // falling drops caught in the light: thin bright dashes in world-anchored columns
          float col = floor(vW.x * 3.0), fx = fract(vW.x * 3.0);
          float ph = fract(vW.y * 0.3 + uTime * (3.4 + h11(col) * 1.5) + h11(col + 7.0) * 10.0);
          float drop = smoothstep(0.95, 0.99, ph) * smoothstep(0.12, 0.0, abs(fx - 0.5)) * step(0.5, h11(col + 3.0)) * (1.0 - smoothstep(12.0, 40.0, vDist));
          k *= 1.0 + drop * 0.0 * across;   // drop dashes off: they sparkled frame to frame (the rain mesh already lights drops in lamp cones)
        } else {
          float r = length(vQ);
          k = (exp(-r * r * 12.0) * 0.55 + exp(-r * 5.0) * 0.12) * (1.0 - smoothstep(0.7, 1.0, r));
        }
        if (k < 0.002) discard;
        gl_FragColor = vec4(vCol * k, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'weather:lampglow'; mesh.visible = false;
  scene.add(mesh);
  const cand = [];
  // rain 0..1, haze 0..1 (fog / mist), night 0..1
  function update(dt, camera, world, rain, haze, night) {
    U.uTime.value += dt;
    const lamps = world?.props?.lamps;
    const amt = night * (0.18 + 0.82 * Math.max(rain, haze));
    mesh.visible = !!lamps && amt > 0.03;
    if (!mesh.visible) return;
    U.uCone.value = amt * 0.03;   // (regression fix 9/30: 0.09 -> 0.03, the cone read as a grey diagonal beam)
    U.uHalo.value = night * (0.1 + 0.3 * Math.max(rain, haze));   // (regression fix 9/30: 0.07 + 0.18 -> 0.1 + 0.3: streetlights read again in the rain)   // subtle: bloom does the rest
    const cx = camera.position.x, cz = camera.position.z;
    cand.length = 0;
    for (let i = 0; i < lamps.length; i++) {
      const L = lamps[i]; if (L.broken) continue;
      const dx = L.x - cx, dz = L.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < 150 * 150) cand.push(d2, i);
    }
    // partial selection of the nearest MAXL (pairs [d2, i])
    const idx = []; for (let j = 0; j < cand.length; j += 2) idx.push(j);
    idx.sort((a, b) => cand[a] - cand[b]);
    const A = iP.array, C = iC.array; let n = 0;
    // fade out toward the MAXL-th lamp (a continuous distance) and the 150 m range: lamps never pop in / out
    const dMax = idx.length > MAXL ? Math.sqrt(cand[idx[MAXL - 1]]) : 150;
    for (let q = 0; q < idx.length && q < MAXL; q++) {
      const L = lamps[cand[idx[q] + 1]], fd = 1 - THREE.MathUtils.smoothstep(Math.sqrt(cand[idx[q]]), dMax * 0.7, dMax);
      const gy = world.groundAt ? world.groundAt(L.x, L.z, L.y - 0.5) : L.y - 6;
      const hl = Math.max(2, L.y - gy);
      for (let type = 0; type < 2; type++) {
        A.set([L.x, L.y, L.z, hl], n * 4); C.set([L.col[0] * fd, L.col[1] * fd, L.col[2] * fd, type], n * 4); n++;
      }
    }
    geo.instanceCount = n; iP.needsUpdate = true; iC.needsUpdate = true;
  }
  return { mesh, update };
}
