// Skid marks: a ring buffer of quad strips (one draw call). Each sliding wheel extends its own strip.
import * as THREE from 'three';

const MAXQ = 3000;
export function createSkidmarks(scene) {
  const pos = new Float32Array(MAXQ * 4 * 3), alpha = new Float32Array(MAXQ * 4);
  const idx = new Uint32Array(MAXQ * 6);
  for (let q = 0; q < MAXQ; q++) { const b = q * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6); }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aA = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('alpha', aA); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.02, 0.02, 0.02, vA * 0.62); }',
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
  let cursor = 0, used = 0;
  const last = new Map(); // wheel -> {lx, ly, lz, rx, rz, t}
  let dirtyFrom = MAXQ, dirtyTo = -1;

  function add(key, x, y, z, dx, dz, width, strength) {
    const prev = last.get(key);
    const nx = -dz, nz = dx; // perpendicular
    const hw = width / 2;
    const L = [x + nx * hw, y + 0.035, z + nz * hw], R = [x - nx * hw, y + 0.035, z - nz * hw];
    if (prev && Math.hypot(x - prev.x, z - prev.z) < 3.5) {
      if (Math.hypot(x - prev.x, z - prev.z) < 0.35) return;
      const q = cursor; cursor = (cursor + 1) % MAXQ; used = Math.min(MAXQ, used + 1);
      const b = q * 12;
      pos.set([...prev.L, ...prev.R, ...R, ...L], b);
      alpha.set([prev.a, prev.a, strength, strength], q * 4);
      dirtyFrom = Math.min(dirtyFrom, q); dirtyTo = Math.max(dirtyTo, q);
    }
    last.set(key, { x, z, L, R, a: strength, t: performance.now() });
  }
  function end(key) { last.delete(key); }
  function update() {
    if (dirtyTo >= dirtyFrom) {
      aPos.clearUpdateRanges(); aA.clearUpdateRanges();
      aPos.addUpdateRange(dirtyFrom * 12, (dirtyTo - dirtyFrom + 1) * 12); aA.addUpdateRange(dirtyFrom * 4, (dirtyTo - dirtyFrom + 1) * 4);
      aPos.needsUpdate = true; aA.needsUpdate = true;
      dirtyFrom = MAXQ; dirtyTo = -1;
    }
    geo.setDrawRange(0, used * 6);
  }
  return { add, end, update };
}
