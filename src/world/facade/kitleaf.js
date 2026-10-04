// Leaf-card foliage for the v3 facade kit (look-dev pass): the Blender kit's shrubs / hedges / bougainvillea are solid
// displaced blobs; they read as green rocks. Here each foliage piece keeps its mesh as a slightly shrunk inner core and
// gets alpha-tested leaf-branch cards (the tree system's leaf atlas, public/assets/trees/leaves_albedo.webp) sprouting
// from its surface along the normal. Cards stay inside the piece's merged KitBuf (same draw call): their UVs are pushed
// to u >= 2 so the kit material (material.js patchKitMaterial, opts.leaf) knows to sample the leaf atlas, discard, use
// the soft canopy normal and add sun transmission. Encoding: u = 2 + 2 * type + atlasU (type 0 leaves, 1 bougainvillea
// bracts, 2 hydrangea heads), v = aoStep + atlasV (aoStep 0..7 -> AO 0.45..1).
function h01(i, s) { let h = Math.imul(i ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }

// leaf cells of the 8 x 8 atlas grid used by leaf cards (GL v-up: row 0 = bottom): [col, row]
const DENSE = [[1, 0], [2, 0], [0, 0], [2, 2], [4, 2], [5, 2]];   // Victorian box / laurel / dark glossy leaves
const HEDGE = [[1, 0], [2, 0], [0, 0]];
const BLOSSOM = [0, 1];                                            // white-pink blossom spray (tinted in the shader)
const SPEC = {
  shrub: { n: 34, size: 0.42, cells: DENSE, flower: 0, fk: 0, shrink: 0.07 },
  shrub_flower: { n: 30, size: 0.4, cells: DENSE, flower: 2, fk: 12, shrink: 0.07 },
  hedge: { n: 22, size: 0.34, cells: HEDGE, flower: 0, fk: 0, shrink: 0.05 },
  bougain: { n: 56, size: 0.5, cells: [[2, 2], [4, 2], [1, 0]], flower: 1, fk: 26, shrink: 0.05 },
  // potted plants / planter boxes: only the foliage above yf (fraction of the piece height) sprouts cards
  pot: { n: 18, size: 0.3, cells: DENSE, flower: 0, fk: 0, shrink: 0.04, yf: 0.45 },
  pot_tall: { n: 26, size: 0.36, cells: [[2, 2], [4, 2], [5, 2]], flower: 0, fk: 0, shrink: 0.05, yf: 0.55 },
  planter: { n: 26, size: 0.32, cells: DENSE, flower: 2, fk: 6, shrink: 0.03, yf: 0.5 },
};

export function leafify(K) {
  for (const [name, S] of Object.entries(SPEC)) {
    const k = K[name]; if (!k || k.leafified) continue;
    const P = k.pos, N = k.nrm, I = k.idx, nv = P.length / 3;
    let y0 = Infinity, y1 = -Infinity; for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
    const yCut = S.yf ? y0 + (y1 - y0) * S.yf : y0 + 0.06;
    // area-weighted candidate triangles: not down-facing, off the ground
    const tris = [], cum = []; let A = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ar = Math.hypot(nx, ny, nz) / 2;
      if (ar < 1e-6) continue; nx /= 2 * ar; ny /= 2 * ar; nz /= 2 * ar;
      const cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3;
      if (ny < -0.35 || cy < yCut) continue;
      if (name === 'bougain' && nz < -0.2) continue;               // (wall side of the climber)
      A += ar; tris.push([a, b, c, nx, ny, nz]); cum.push(A);
    }
    if (!tris.length) continue;
    const nCards = S.n + S.fk;
    const cv = nCards * 8, oldN = nv;
    const pos = new Float32Array((nv + cv) * 3), nrm = new Float32Array((nv + cv) * 3), uv = new Float32Array((nv + cv) * 2), mask = new Float32Array(nv + cv);
    // core: pulled in along its normals so the cards form the silhouette
    for (let i = 0; i < nv; i++) {
      const o = i * 3, s = P[o + 1] > (S.yf ? yCut : y0 + 0.04) ? S.shrink : 0;
      pos[o] = P[o] - N[o] * s; pos[o + 1] = P[o + 1] - N[o + 1] * s * 0.6; pos[o + 2] = P[o + 2] - N[o + 2] * s;
      nrm[o] = N[o]; nrm[o + 1] = N[o + 1]; nrm[o + 2] = N[o + 2];
      uv[i * 2] = k.uv[i * 2]; uv[i * 2 + 1] = k.uv[i * 2 + 1]; mask[i] = k.mask[i];
    }
    const idx = new Uint32Array(I.length + nCards * 12); idx.set(I);
    let vi = oldN, ii = I.length;
    const salt = name.length * 131;
    for (let c = 0; c < nCards; c++) {
      const flower = c >= S.n;
      // pick a triangle (area-weighted), a point in it
      const r = h01(c + salt, 11) * A; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      const [a, b, cc, tnx, tny, tnz] = tris[lo];
      let u1 = h01(c + salt, 12), u2 = h01(c + salt, 13); if (u1 + u2 > 1) { u1 = 1 - u1; u2 = 1 - u2; }
      const px = P[a] + (P[b] - P[a]) * u1 + (P[cc] - P[a]) * u2, py = P[a + 1] + (P[b + 1] - P[a + 1]) * u1 + (P[cc + 1] - P[a + 1]) * u2, pz = P[a + 2] + (P[b + 2] - P[a + 2]) * u1 + (P[cc + 2] - P[a + 2]) * u2;
      // growth axis: the surface normal, bent upward a little, jittered
      let ax = tnx + (h01(c + salt, 14) - 0.5) * 0.7, ay = tny + 0.35 + (h01(c + salt, 15) - 0.5) * 0.5, az = tnz + (h01(c + salt, 16) - 0.5) * 0.7;
      if (name === 'bougain') az = Math.max(az, 0.15);
      let l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
      const L = S.size * (flower ? 0.6 : 0.8 + 0.4 * h01(c + salt, 17)), back = L * (flower ? 0.3 : 0.45);
      const bx = px - ax * back, by = py - ay * back, bz = pz - az * back, tx = bx + ax * L, ty = by + ay * L, tz = bz + az * L;
      // side axis: random roll about the growth axis
      const ang = h01(c + salt, 18) * Math.PI * 2; let rx = Math.cos(ang), ry = 0.3 * Math.sin(ang * 1.7), rz = Math.sin(ang);
      let sx = ay * rz - az * ry, sy = az * rx - ax * rz, sz = ax * ry - ay * rx; l = Math.hypot(sx, sy, sz) || 1;
      const w = L * 0.5; sx *= w / l; sy *= w / l; sz *= w / l;
      const cell = flower ? BLOSSOM : S.cells[Math.floor(h01(c + salt, 19) * S.cells.length)];
      const type = flower ? S.flower : 0;
      const ao = Math.min(7, Math.floor(3 + 5 * Math.max(0, tny * 0.5 + 0.5) * (0.6 + 0.4 * h01(c + salt, 20))));
      const cu0 = cell[0] / 8 + 0.002, cu1 = (cell[0] + 1) / 8 - 0.002, cv0 = cell[1] / 8 + 0.002, cv1 = (cell[1] + 1) / 8 - 0.002;
      const flipU = h01(c + salt, 21) < 0.5;
      const Q = [[bx - sx, by - sy, bz - sz, flipU ? cu1 : cu0, cv0], [bx + sx, by + sy, bz + sz, flipU ? cu0 : cu1, cv0], [tx + sx, ty + sy, tz + sz, flipU ? cu0 : cu1, cv1], [tx - sx, ty - sy, tz - sz, flipU ? cu1 : cu0, cv1]];
      for (let side = 0; side < 2; side++) {
        const b0 = vi;
        for (const q of Q) {
          const o = vi * 3; pos[o] = q[0]; pos[o + 1] = q[1]; pos[o + 2] = q[2];
          // canopy normal: the surface normal at the root, opened toward the card's own direction (soft, volumetric shading)
          let qx = tnx * 0.6 + ax * 0.4, qy = tny * 0.6 + ay * 0.4 + 0.15, qz = tnz * 0.6 + az * 0.4; const ql = Math.hypot(qx, qy, qz) || 1;
          nrm[o] = qx / ql; nrm[o + 1] = qy / ql; nrm[o + 2] = qz / ql;
          uv[vi * 2] = 2 + 2 * type + q[3]; uv[vi * 2 + 1] = ao + q[4]; mask[vi] = 0;
          vi++;
        }
        if (side === 0) { idx[ii++] = b0; idx[ii++] = b0 + 1; idx[ii++] = b0 + 2; idx[ii++] = b0; idx[ii++] = b0 + 2; idx[ii++] = b0 + 3; }
        else { idx[ii++] = b0; idx[ii++] = b0 + 2; idx[ii++] = b0 + 1; idx[ii++] = b0; idx[ii++] = b0 + 3; idx[ii++] = b0 + 2; }
      }
    }
    k.pos = pos; k.nrm = nrm; k.uv = uv; k.mask = mask; k.idx = idx; k.leafified = true;
  }
  return K;
}

// shader side (kit material): decode a leaf-card UV. GLSL, needs vMapUv.
export const LEAF_DECODE = /* glsl */`
bool kLeaf = vMapUv.x > 1.5;
float kLeafType = 0.0, kLeafAO = 1.0; vec2 kLeafUv = vMapUv;
if (kLeaf) { kLeafType = floor((vMapUv.x - 2.0) * 0.5); kLeafUv = vec2(vMapUv.x - 2.0 - 2.0 * kLeafType, fract(vMapUv.y)); kLeafAO = 0.45 + 0.55 * floor(vMapUv.y) / 7.0; }
`;
