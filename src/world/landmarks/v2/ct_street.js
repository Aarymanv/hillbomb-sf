// Chinatown hero streets: darker, broken, puddled asphalt (a multiply decal over the carriageway of ct_zone.js runs).
// The concept's street is near-black wet asphalt with patchy repairs and standing water; ours read smooth grey. The decal
// multiplies the lit road (before the wet-reflection pass adds the reflections on top, so streaks / neon stay bright):
// value-noise patches (repairs, wear), darker puddle patches (the same world-space field post.js uses to make the mirror
// sharp and strong there), fading to neutral by 140 m (no far aliasing). Built lazily per segment once the camera is
// within 220 m (heights from world.groundAt, i.e. the road surface the cars drive on), never rebuilt.
// buildCtStreet({ scene, segs, groundAt, night }) -> { update(camera) }
import * as THREE from 'three';
import { HB_WET } from '../../../render/fog.js';

const VS = `varying vec3 vW; varying float vD;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const FS = `uniform float uNight, uWet; varying vec3 vW; varying float vD;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 q){ vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0)), f.x), f.y); }
void main(){
  float fade = 1.0 - smoothstep(70.0, 140.0, vD);
  float patchy = vn(vW.xz * 0.35) * 0.6 + vn(vW.xz * 1.7) * 0.4;           // repairs / wear
  float crack = smoothstep(0.035, 0.0, abs(vn(vW.xz * 0.9) - 0.5)) * (1.0 - smoothstep(25.0, 50.0, vD));
  float pud = smoothstep(0.55, 0.72, vn(vW.xz * 0.21));                      // standing water (post.js ctPud)
  float base = mix(0.86, 0.42, uNight) * mix(0.85, 1.0, 1.0 - uWet);        // darker asphalt, near-black when wet at night
  // (road 2) calmer: the strong patch / contour-line multiply read as smeared smudges under the streaked reflections
  float m = base * (0.88 + 0.2 * patchy) * (1.0 - 0.12 * crack) * (1.0 - 0.35 * pud * uWet);
  gl_FragColor = vec4(vec3(mix(1.0, m, fade)), 1.0);
}`;

export function buildCtStreet({ scene, segs, groundAt, night, onCt = () => true }) {
  const U = { uNight: { value: 0 }, uWet: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 });
  mat.userData.keep = true;
  const group = new THREE.Group(); group.name = 'ct:street'; scene.add(group);
  const built = new Set(), seen = new Map();
  function build(i) {
    const [, a, b, w] = segs[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) return;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux, hw = w / 2 - 0.15;
    const nu = Math.max(1, Math.ceil(L / 2)), nw = 4, P = [], I = [];
    for (let k = 0; k <= nu; k++) for (let j = 0; j <= nw; j++) {
      const s = L * k / nu, t = -hw + 2 * hw * j / nw, x = a[0] + ux * s + nx * t, z = a[1] + uz * s + nz * t;
      P.push(x, groundAt(x, z) + 0.035, z);
    }
    for (let k = 0; k < nu; k++) for (let j = 0; j < nw; j++) { const q = k * (nw + 1) + j; I.push(q, q + nw + 1, q + 1, q + 1, q + nw + 1, q + nw + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = 'ct:asphalt'; m.renderOrder = -2; m.matrixAutoUpdate = false; m.castShadow = m.receiveShadow = false;
    group.add(m);
  }
  // contact shadows under the parked cars on the hero streets (props2 parked instances are placed level on the slope with
  // no ground contact at night: they read as floating): soft multiply blobs following the road under each car
  const BLOB = 96;
  const bmat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
    vertexShader: 'varying vec2 vQ; void main(){ vQ = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uNight; varying vec2 vQ; void main(){ float r = length(vQ * vec2(1.0, 1.0)); float a = (1.0 - smoothstep(0.45, 1.0, r)); gl_FragColor = vec4(vec3(1.0 - a * mix(0.55, 0.75, uNight)), 1.0); }' });
  bmat.userData.keep = true;
  const bgeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(bgeo, bmat, BLOB); blobs.name = 'ct:carShadows'; blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = -1;
  group.add(blobs);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _o = new THREE.Matrix4(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qt = new THREE.Quaternion();
  let parked = null, scanN = 0;
  function carShadows(c) {
    if (++scanN % 5 === 1) parked = null;     // streamed props come and go: rescan every 5 s
    if (!parked) { parked = []; scene.traverse(o => { if (o.isInstancedMesh && /^props2:parked/.test(o.name)) { o.geometry.computeBoundingBox(); parked.push(o); } }); if (!parked.length) parked = null; }
    if (!parked) return;
    let n = 0;
    for (const o of parked) {
      if (!o.visible) continue;
      const bb = o.geometry.boundingBox, ex = (bb.max.x - bb.min.x) || 1.8, ez = (bb.max.z - bb.min.z) || 4.5;
      for (let i = 0; i < o.count && n < BLOB; i++) {
        o.getMatrixAt(i, _o); _o.premultiply(o.matrixWorld); _o.decompose(_p, _q, _s);
        if (Math.hypot(_p.x - c.x, _p.z - c.z) > 110 || !onCt(_p.x, _p.z)) continue;
        // the blob in the car's own axes (whatever its long axis is), tilted onto the road plane (groundAt gradient)
        const y0 = groundAt(_p.x, _p.z), hx = (groundAt(_p.x + 1.5, _p.z) - groundAt(_p.x - 1.5, _p.z)) / 3, hz = (groundAt(_p.x, _p.z + 1.5) - groundAt(_p.x, _p.z - 1.5)) / 3;
        _n.set(-hx, 1, -hz).normalize(); _qt.setFromUnitVectors(_up, _n); _q.premultiply(_qt);
        _m.compose(_p.set(_p.x, y0 + 0.05, _p.z), _q, _s.set(ex * 1.25 * _s.x, 1, ez * 1.12 * _s.z));
        blobs.setMatrixAt(n++, _m);
      }
    }
    blobs.count = n; blobs.instanceMatrix.needsUpdate = true;
  }
  let t = 0;
  return {
    group,
    update(dt, camera) {
      U.uNight.value = night?.value ?? 0; U.uWet.value = Math.min(1, HB_WET.x);
      if ((t -= dt) > 0 || !camera) return; t = 1.0;
      const c = camera.position;
      carShadows(c);
      // (perf 10/4) the decal fades to neutral (x1) by 140 m: built segments past ~200 m are hidden (they were ~40-80 draws
      // anywhere in the city once the hero streets had been visited)
      for (const m of group.children) { if (m.name !== 'ct:asphalt') continue; const sp = m.geometry.boundingSphere; m.visible = Math.hypot(sp.center.x - c.x, sp.center.z - c.z) - sp.radius < 200; }
      for (let i = 0; i < segs.length; i++) {
        if (built.has(i)) continue;
        const [, a, b] = segs[i], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (Math.hypot(mx - c.x, mz - c.z) > 220) { seen.delete(i); continue; }
        const n = (seen.get(i) || 0) + 1; seen.set(i, n);
        if (n >= 3) { built.add(i); build(i); }      // 3 s near: the road tiles have streamed (groundAt = the road surface)
      }
    },
  };
}
