// Runtime fallback for lots the building generator did not skip: remove their colliders and hide their meshes.
// Buildings v2 (facade/*: far tiles + streamed near LOD with a per-building hide texture): mark the building hidden in
// the far tiles and take it out of its near-LOD cell so it is never emitted. Legacy merged tiles: collapse triangles.
import { obbOverlap } from '../geo.js';

export function hideGenericLots(world, lots, footprints = []) {
  const B = world.buildings;
  let nCol = 0, nSpec = 0, nTri = 0;
  const lotSet = new Set(lots);
  const covers = (o) => footprints.some(fp => obbOverlap({ ...fp, hx: fp.hx - 0.3, hz: fp.hz - 0.3 }, o, 0));
  // ---- buildings v2
  if (B?.specs && B.near?.cells) {
    const hide = B.specs.filter(sp => lotSet.has(sp.lot) || covers(sp));
    const ids = new Set(hide.map(sp => sp.id));
    const hd = B.internals?.hideData, ht = B.internals?.hideTex;
    for (const sp of hide) if (hd) hd[sp.id] = 255;
    if (ht) ht.needsUpdate = true;
    for (const c of B.near.cells.values()) {
      if (!c.specs.some(sp => ids.has(sp.id))) continue;
      if (c.meshes) { B.near.drop(c); const i = B.near.built.indexOf(c); if (i >= 0) B.near.built.splice(i, 1); }
      c.specs = c.specs.filter(sp => !ids.has(sp.id));
      for (const sp of hide) if (hd) hd[sp.id] = 255;
    }
    nSpec = hide.length;
    for (const c of world.colliders.list.slice()) {
      if (c.kind !== 'building') continue;
      if ((c.lot && lotSet.has(c.lot)) || hide.some(sp => Math.abs(c.x - sp.x) < 0.05 && Math.abs(c.z - sp.z) < 0.05)) { world.colliders.remove(c); nCol++; }
    }
    return { colliders: nCol, specs: nSpec, tris: 0 };
  }
  // ---- legacy: colliders by lot geometry, then collapse triangles in the merged tiles
  for (const lot of lots) {
    for (const c of world.colliders.list.slice()) {
      if (c.kind === 'interior' || c.kind === 'bounds') continue;
      if (Math.abs(c.x - lot.x) < 0.3 && Math.abs(c.z - lot.z) < 0.3 && Math.abs(c.hx - lot.hx) < 0.3 && Math.abs(c.hz - lot.hz) < 0.3) { world.colliders.remove(c); nCol++; }
    }
  }
  const root = B?.group;
  if (!root || !lots.length) return { colliders: nCol, specs: 0, tris: 0 };
  const regions = lots.map(l => ({ l, c: Math.cos(l.yaw), s: Math.sin(l.yaw), r: Math.hypot(l.hx, l.hz) + 3.5 }));
  const local = (R, x, z) => { const dx = x - R.l.x, dz = z - R.l.z; return [R.c * dx - R.s * dz, R.s * dx + R.c * dz]; };
  const inRegion = (R, x, z, side) => { const [lx, lz] = local(R, x, z); return Math.abs(lx) <= R.l.hx + side && lz >= -R.l.hz - 3.0 && lz <= R.l.hz + 0.45; };
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.isInstancedMesh) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, aF = g.attributes.aF;
    if (!pos || !idx) return;
    const e = o.matrixWorld.elements;
    const wx = i => e[0] * pos.getX(i) + e[4] * pos.getY(i) + e[8] * pos.getZ(i) + e[12];
    const wz = i => e[2] * pos.getX(i) + e[6] * pos.getY(i) + e[10] * pos.getZ(i) + e[14];
    const nT = idx.count / 3;
    for (const R of regions) {
      let seed = null;
      if (aF) {
        const hist = new Map();
        for (let t = 0; t < nT; t++) {
          const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
          const [lx, lz] = local(R, (wx(a) + wx(b) + wx(c)) / 3, (wz(a) + wz(b) + wz(c)) / 3);
          if (Math.abs(lx) > R.l.hx - 0.25 || Math.abs(lz) > R.l.hz - 0.25) continue;
          const f = Math.round((aF.getX(a) % 1) * 1e5); hist.set(f, (hist.get(f) || 0) + 1);
        }
        let bn = 0; for (const [f, n] of hist) if (n > bn) { bn = n; seed = f; }
      }
      let hit = 0;
      for (let t = 0; t < nT; t++) {
        const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
        const side = seed !== null ? 0.6 : 0.04;
        if (seed !== null && Math.round((aF.getX(a) % 1) * 1e5) !== seed) continue;
        if (!inRegion(R, wx(a), wz(a), side) || !inRegion(R, wx(b), wz(b), side) || !inRegion(R, wx(c), wz(c), side)) continue;
        idx.setX(t * 3 + 1, a); idx.setX(t * 3 + 2, a); hit++;
      }
      if (hit) { idx.needsUpdate = true; nTri += hit; }
    }
  });
  return { colliders: nCol, specs: 0, tris: nTri };
}
