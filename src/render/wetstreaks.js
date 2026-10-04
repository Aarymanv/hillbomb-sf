// Wet-road light streaks: every street lamp and car lamp near the camera paints its reflection on wet ground as a long,
// narrow streak running from the specular reflection point toward the viewer (the anisotropic look of wet asphalt at
// night). Broken up by the same puddle field the materials use (fog.js), occluded by the depth buffer, additive.
// Complements the screen-space pass in post.js, which can only reflect what is on screen.
import * as THREE from 'three';
import { HB_WET, HB_NOISE_GLSL } from './fog.js';
import { CAR_FLARES } from './carlights.js';

const MAXN = 160;
const WARM = [1.18, 0.86, 0.55];   // sodium-ish warm tint for lamp reflections (lum-preserving-ish)
export function createWetStreaks(scene) {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);           // x: -0.5..0.5 (across), y: -0.5..0.5 (along)
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 4), 4).setUsage(THREE.DynamicDrawUsage);  // reflection point xyz, light height
  const iB = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 4), 4).setUsage(THREE.DynamicDrawUsage);  // colour rgb, dist to light
  geo.setAttribute('iA', iA); geo.setAttribute('iB', iB);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uWet: { value: HB_WET }, uGain: { value: 1 } },
    vertexShader: `attribute vec4 iA, iB; varying vec2 vQ; varying vec3 vCol; varying vec3 vW; varying float vLen;
      void main(){
        vec3 R = iA.xyz; float hl = iA.w;
        vec2 d = R.xz - cameraPosition.xz; float r = max(length(d), 0.5); vec2 dir = d / r, perp = vec2(-dir.y, dir.x);
        float hc = max(cameraPosition.y - R.y, 0.3);
        // grazing views stretch the highlight: length toward the camera ~ distance, a short tail beyond
        float len = clamp(r * 0.85 * (0.55 + hl / (hl + hc)), 1.5, 60.0), tail = min(len * 0.2, 5.0);
        float along = position.y + 0.5;                          // 0 at the camera end .. 1 beyond R
        float s = mix(-len, tail, along);
        float wid = 0.07 + 0.0045 * r + 0.015 * hl;
        vec2 xz = R.xz + dir * s + perp * position.x * wid * 2.0;
        vW = vec3(xz.x, R.y + 0.03, xz.y);
        vQ = vec2(position.x * 2.0, s / (s < 0.0 ? len : tail));
        vCol = iB.rgb; vLen = len;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: `uniform vec4 uWet; uniform float uGain; varying vec2 vQ; varying vec3 vCol; varying vec3 vW; varying float vLen;
      ${HB_NOISE_GLSL}
      void main(){
        float across = exp(-vQ.x * vQ.x * 5.0);
        float a = vQ.y < 0.0 ? exp(-abs(vQ.y) * 2.0) * (1.0 - smoothstep(0.8, 1.0, -vQ.y)) : exp(-vQ.y * vQ.y * 6.0);
        // broken up: puddles mirror it cleanly, damp asphalt in flickering bands
        float pud = hbPuddle(vW.xz, uWet.w);
        float band = smoothstep(0.2, 0.85, hbVN(vW.xz * 1.7) * 0.7 + hbVN(vW.xz * 0.37) * 0.5);   // static bands (animated ones shimmered)
        float k = across * a * uWet.x * mix(band * 0.5, 1.0, pud) * uGain * 0.4;
        // the part of a streak right in front of the camera would be a wide white bar: fade it to a soft warm glint
        float dc = distance(vW, cameraPosition);
        k *= mix(0.22, 1.0, smoothstep(2.5, 18.0, dc));
        if (k < 0.002) discard;
        vec3 c = vCol * k;
        c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * vec3(1.2, 0.9, 0.62), 0.35 * (1.0 - smoothstep(8.0, 40.0, dc)));
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'weather:wetstreaks'; mesh.visible = false;
  scene.add(mesh);

  const A = iA.array, Bc = iB.array;
  const cand = [];
  function update(camera, world, wet, night) {
    const on = wet > 0.15 && night > 0.2 && world;
    mesh.visible = !!on;
    if (!on) return;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    cand.length = 0;
    // street lamps (props agent: world.props.lamps = [{ x, y, z, col, broken }])
    const lamps = world.props?.lamps;
    if (lamps) for (let i = 0; i < lamps.length; i++) {
      const L = lamps[i]; if (L.broken) continue;
      const dx = L.x - cx, dz = L.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < 140 * 140) { const l = (L.col[0] * 0.3 + L.col[1] * 0.59 + L.col[2] * 0.11) * 0.95; cand.push([d2, L.x, L.y, L.z, (L.col[0] * 0.4 + l * 0.6 * WARM[0]), (L.col[1] * 0.4 + l * 0.6 * WARM[1]), (L.col[2] * 0.4 + l * 0.6 * WARM[2])]); }
    }
    // car lamps (head / tail / sirens)
    const F = CAR_FLARES;
    for (let i = 0; i < F.n; i++) {
      const x = F.pos[i * 3], y = F.pos[i * 3 + 1], z = F.pos[i * 3 + 2];
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < 120 * 120) cand.push([d2, x, y, z, F.col[i * 3] * 0.48, F.col[i * 3 + 1] * 0.44, F.col[i * 3 + 2] * 0.39]);   // flare cols are ~2x HDR cores (carlights.js)
    }
    cand.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const c of cand) {
      if (n >= MAXN) break;
      const [, x, y, z, r, g, b] = c;
      const gy = world.groundAt(x, z, y - 0.3);
      const hl = Math.max(0.3, y - gy), hc = Math.max(0.3, cy - gy);
      const dx = x - cx, dz = z - cz, D = Math.hypot(dx, dz);
      if (D < 1) continue;
      const t = hc / (hc + hl);                       // reflection point along camera -> light base
      const rx = cx + dx * t, rz = cz + dz * t;
      const ry = world.groundAt(rx, rz, gy + 3);
      if (ry < 0.25) continue;                         // over the sea: the water has its own reflection
      A[n * 4] = rx; A[n * 4 + 1] = ry; A[n * 4 + 2] = rz; A[n * 4 + 3] = hl;
      // near the camera the streak fills the lower screen: keep it a soft glint, not a white bar
      const fall = (0.28 + 0.72 * THREE.MathUtils.smoothstep(D, 4, 30)) / (1 + D * D / 3600) * (1 - THREE.MathUtils.smoothstep(D, 100, 120));   // fade before the cut-off: no pops
      Bc[n * 4] = r * fall; Bc[n * 4 + 1] = g * fall; Bc[n * 4 + 2] = b * fall; Bc[n * 4 + 3] = D;
      n++;
    }
    geo.instanceCount = n;
    iA.needsUpdate = true; iB.needsUpdate = true;
    mat.uniforms.uGain.value = Math.min(1, night * 1.4);
  }
  return { mesh, update };
}
