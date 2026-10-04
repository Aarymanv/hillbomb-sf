// headless body: debug the v6 yard emission on the MID tile around a point (window.__dbgAt)
for (let k = 0; k < 1500 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.plan); k++) await new Promise(r => setTimeout(r, 200));
const P = window.__world.buildings.plan;
const vb = await import('http://127.0.0.1:5190/src/world/facade/v2build.js'), vg = await import('http://127.0.0.1:5190/src/world/facade/v2geom.js'), vy = await import('http://127.0.0.1:5190/src/world/facade/v6yard.js');
const g = window.__G.world.graph, A = g.intersection('Fulton Street', '22nd Avenue');
const B = vb.wrapB(P.bx), T = 512, tx = Math.floor((A.x - B.X0) / T), tz = Math.floor((A.z - B.Z0) / T);
const tile = { tx, tz, key: tz * B.TC + tx, x0: B.X0 + tx * T, z0: B.Z0 + tz * T, x1: B.X0 + tx * T + T, z1: B.Z0 + tz * T + T };
const t0 = performance.now();
const r = vb.buildMidTile({ B, P, R: new vg.Raster(T) }, tile, null);
return { ms: performance.now() - t0, tris: r.buf.ni / 3, yst: vy.YST };
