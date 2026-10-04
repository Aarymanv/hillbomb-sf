// Overhead wires (Muni trolley contact wires, span wires, utility lines, service drops) as 1 px line segments,
// chunked for frustum culling, faded with distance so the far web doesn't turn into noise.
import * as THREE from 'three';

export class WireBuilder {
  constructor(chunk = 700) { this.chunk = chunk; this.map = new Map(); this.segments = 0; }
  _arr(x, z) { const k = Math.floor(x / this.chunk) * 1000 + Math.floor(z / this.chunk); let a = this.map.get(k); if (!a) this.map.set(k, a = []); return a; }
  // straight segment list from a polyline
  line(pts) { if (pts.length < 2) return; const a = this._arr(pts[0][0], pts[0][2]); for (let i = 0; i < pts.length - 1; i++) { a.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]); this.segments++; } }
  // catenary-ish sagging span between A and B
  span(A, B, sag, n = 8) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t]); }
    this.line(pts);
  }
  build(material) {
    const out = [];
    for (const [, arr] of this.map) {
      if (!arr.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      const m = new THREE.LineSegments(g, material);
      m.name = 'props:wires'; m.matrixAutoUpdate = false; m.renderOrder = 2;
      out.push(m);
    }
    return out;
  }
}

export function makeWireMaterial() {
  const m = new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.92, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWD;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWD = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWD;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= 1.0 - smoothstep(160.0, 520.0, vWD);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'hb-wires-v1';
  return m;
}
