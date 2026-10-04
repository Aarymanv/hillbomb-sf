// Cheap instanced festival crowd: one merged low-poly figure (arms up), per-instance shirt colour, per-instance skin
// tone and a bob/jump animation in the vertex shader. One draw call per site.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let figGeo = null;
function figure() {
  if (figGeo) return figGeo;
  const parts = [];
  const add = (g, mask, col, m) => {
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(n).fill(mask), 1));
    const c = new THREE.Color(col), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aMask'].includes(k)) g.deleteAttribute(k);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const M = (x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 7), 1, '#ffffff', M(0, 1.2, 0));               // torso (shirt)
  add(new THREE.CylinderGeometry(0.17, 0.12, 0.82, 6), 0, '#2b2e38', M(0, 0.45, 0, 0, 1, 1, 0.8)); // legs
  add(new THREE.SphereGeometry(0.13, 8, 6), -1, '#ffffff', M(0, 1.67, 0));                        // head (skin)
  add(new THREE.BoxGeometry(0.08, 0.62, 0.08), 1, '#ffffff', M(-0.3, 1.66, 0, 0.35));            // arms up
  add(new THREE.BoxGeometry(0.08, 0.62, 0.08), 1, '#ffffff', M(0.3, 1.66, 0, -0.35));
  figGeo = mergeGeometries(parts);
  return figGeo;
}
const SHIRTS = ['#ff2e7e', '#ffc247', '#f6f3ee', '#2f6df0', '#39e07a', '#1a1b22', '#ff5a36', '#b25cff', '#4fd2ff', '#e8e2d4', '#c8843a', '#8e939b'];

// spots: [{x, y, z, yaw}] world placements
export function createCrowd(spots, { seed = 1 } = {}) {
  const geo = figure();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const U = { uTime: { value: 0 }, uJump: { value: 1 } };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uJump = U.uJump;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMask; uniform float uTime; uniform float uJump;')
      .replace('#include <color_vertex>', `
        float hbId = float(gl_InstanceID);
        float hbR = fract(sin(hbId * 12.9898) * 43758.5453);
        vec3 hbSkin = mix(vec3(0.95, 0.76, 0.6), vec3(0.33, 0.21, 0.14), fract(hbR * 7.13));
        #ifdef USE_INSTANCING_COLOR
        vec3 hbShirt = instanceColor.rgb;
        #else
        vec3 hbShirt = vec3(1.0);
        #endif
        vColor = color * (aMask > 0.5 ? hbShirt : aMask < -0.5 ? hbSkin : vec3(1.0));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hbPh = hbR * 6.2831;
        float hbJ = max(0.0, sin(uTime * (5.0 + hbR * 3.0) + hbPh)) * uJump * (0.1 + 0.16 * step(0.55, hbR));
        transformed.y += hbJ;
        transformed.x += sin(uTime * 1.7 + hbPh) * 0.05 * transformed.y;
        if (aMask > 0.5 && position.y > 1.4) transformed.x += sin(uTime * 6.0 + hbPh) * 0.12 * (position.y - 1.4);`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  spots.forEach((s, i) => {
    const sc = 0.9 + rnd() * 0.2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw + (rnd() - 0.5) * 0.6);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(sc, sc, sc));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(SHIRTS[Math.floor(rnd() * SHIRTS.length)]));
  });
  mesh.count = spots.length;
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return { mesh, update(dt, energy = 1) { U.uTime.value += dt; U.uJump.value = energy; } };
}
