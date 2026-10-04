// Open-world collectibles: bonus boards (smashable XP / fast-travel signs), barn finds (rumour -> search area ->
// discovery -> restoration -> car), player houses (buy, fast travel, perks), roads discovered (% of the network),
// district discovery banners, and fast travel itself.
import * as THREE from 'three';
import { BOARDS, BARNS, HOUSES } from './catalog.js';
import { snapRoad, snapLand, fmtMoney, clamp, rng, hashStr, yawOf, ll } from './util.js';
import { bitsToB64, b64ToBits } from './save.js';
import { emblem, COLORS } from './branding.js';
import { Kit, std } from './kit.js';
import { DISTRICTS } from '../../world/anchors.js';
import { buildModel, CARS } from '../../vehicle/cars.js';
import { edgePointAt } from '../../world/roads.js';

const COND = "'Barlow Condensed','Arial Narrow',Impact,sans-serif";
export function createCollectibles(F) {
  const { G, world } = F;
  const C = {};
  const g = world.graph;

  // ================================================================ bonus boards
  const boardTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const draw = () => {
      const x = c.getContext('2d');
      [['XP', '#ff5a1f', '#ffc247', 'XP BOARD'], ['FT', '#1d6bff', '#4fd2ff', 'FAST TRAVEL']].forEach(([k, a, b, label], i) => {
        const y0 = i * 256, gr = x.createLinearGradient(0, y0, 512, y0 + 256); gr.addColorStop(0, a); gr.addColorStop(1, b);
        x.fillStyle = gr; x.fillRect(0, y0, 512, 256);
        x.fillStyle = COLORS.NAVY; x.fillRect(0, y0 + 206, 512, 50);
        emblem(x, 104, y0 + 104, 80);
        x.fillStyle = '#fff'; x.font = `italic 800 150px ${COND}`; x.textAlign = 'left'; x.fillText(k, 210, y0 + 160);
        x.font = `800 34px ${COND}`; x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(label + '  ·  HILLBOMB', 256, y0 + 243);
      });
      t.needsUpdate = true;
    };
    draw(); document.fonts?.ready?.then(draw);
    return t;
  })();
  const panelGeo = new THREE.BoxGeometry(3.4, 1.7, 0.14);
  const uvs = { xp: 0.5, ft: 0 };
  function panelGeoFor(kind) {
    const g2 = panelGeo.clone(), uv = g2.attributes.uv, off = uvs[kind];
    for (let i = 0; i < uv.count; i++) uv.setY(i, off + uv.getY(i) * 0.5);
    return g2;
  }
  const boards = [];
  for (const b of BOARDS) {
    const r0 = snapRoad(world, b.ll[0], b.ll[1], null, 250);
    if (!r0) continue;
    // roadside spot: try both sides, a few setbacks, and slide along the street until it is clear
    let spot = null, r = r0;
    const P = {};
    search: for (const ds of [0, 12, -12, 24, -24, 40, -40]) {
      const s1 = Math.max(2, Math.min(r0.edge.len - 2, r0.s + ds));
      edgePointAt(r0.edge, s1, P);
      r = { x: P.x, z: P.z, dx: P.dx, dz: P.dz, edge: r0.edge };
      const rx = -r.dz, rz = r.dx;
      for (const off of [r.edge.width / 2 + 3.4, r.edge.width / 2 + 4.8]) for (const s of [1, -1]) {
        const x = r.x + rx * off * s, z = r.z + rz * off * s;
        if (world.heightAt(x, z) > 0.3 && !world.colliders.pointHit(x, world.groundAt(x, z) + 1, z, 1.7) && !world.colliders.pointHit(x + Math.cos(Math.atan2(r.dz, r.dx)) * 1.6, world.groundAt(x, z) + 1, z, 0.5)) { spot = { x, z, s }; break search; }
      }
    }
    if (!spot) continue;
    const rx = -r.dz, rz = r.dx;
    const y = world.groundAt(spot.x, spot.z, world.heightAt(spot.x, spot.z) + 3);
    const yaw = yawOf(-rx * spot.s, -rz * spot.s) + Math.PI; // face the road
    const col = { x: spot.x, z: spot.z, hx: 1.8, hz: 0.35, yaw, yMin: y - 1, yMax: y + 4.5, kind: 'board', breakable: true, festivalBoard: b.id };
    boards.push({ ...b, x: spot.x, y, z: spot.z, yaw, col, i: boards.length });
  }
  const bMats = { xp: new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.15 }) };
  bMats.ft = bMats.xp;
  const panels = { xp: new THREE.InstancedMesh(panelGeoFor('xp'), bMats.xp, BOARDS.length), ft: new THREE.InstancedMesh(panelGeoFor('ft'), bMats.ft, BOARDS.length) };
  const postGeo = new THREE.BoxGeometry(0.16, 3.2, 0.16); postGeo.translate(0, 1.6, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 }), BOARDS.length * 2);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3(0, 0, 0), ONE = new THREE.Vector3(1, 1, 1), bp = new THREE.Vector3();
  function layoutBoards() {
    const cnt = { xp: 0, ft: 0 }; let pc = 0;
    for (const b of boards) {
      const smashed = !!F.S.boards[b.id];
      b.pi = cnt[b.kind]++;
      bq.setFromAxisAngle(UP, b.yaw);
      bm.compose(bp.set(b.x, b.y + 3.3, b.z), bq, smashed ? ZERO : ONE); panels[b.kind].setMatrixAt(b.pi, bm);
      for (const s of [-1, 1]) { bm.compose(bp.set(b.x + Math.cos(b.yaw) * 1.3 * s, b.y, b.z - Math.sin(b.yaw) * 1.3 * s), bq, smashed ? ZERO : ONE); posts.setMatrixAt(pc++, bm); }
      if (!smashed && !b.added) { world.colliders.add(b.col); b.added = true; }
    }
    panels.xp.count = cnt.xp; panels.ft.count = cnt.ft; posts.count = pc;
    for (const m of [panels.xp, panels.ft, posts]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.castShadow = true; }
  }
  const boardGroup = new THREE.Group(); boardGroup.name = 'festival-boards'; boardGroup.add(panels.xp, panels.ft, posts);
  G.scene.add(boardGroup);
  for (const b of boards) F.markers.add({ id: 'bd:' + b.id, kind: b.kind === 'xp' ? 'board' : 'boardft', icon: b.kind === 'xp' ? 'board' : 'boardft', group: 'collect', x: b.x, z: b.z,
    color: b.kind === 'xp' ? '#ff8a1d' : '#3aa0ff', title: `${b.kind === 'xp' ? 'XP' : 'Fast Travel'} Board`, sub: b.name, beam: false, iconSize: 2.6, iconH: 6, iconRange: 160, minimap: true, bigmap: false });
  C.boards = boards;
  C.refreshBoards = () => { for (const b of boards) F.markers.setVisible('bd:' + b.id, F.enabled() && !F.S.boards[b.id]); };
  let boardT = 0;
  function checkBoards(dt) {
    boardT -= dt; if (boardT > 0) return; boardT = 0.15;
    const p = G.player.pos;
    for (const b of boards) {
      if (F.S.boards[b.id] || !b.col.broken) continue;
      if (Math.hypot(b.x - p.x, b.z - p.z) > 80) continue;
      smashBoard(b);
    }
  }
  function smashBoard(b) {
    F.S.boards[b.id] = 1;
    try { world.colliders.remove(b.col); } catch { /* ignore */ }
    layoutBoards();
    G.fx?.sparks?.(b.x, b.y + 3, b.z, 0, 3, 0, 26);
    G.fx?.dust?.(b.x, b.y + 0.5, b.z, 0, 0, 1, [0.9, 0.6, 0.3]);
    G.audio?.impact?.(0.6, 'prop'); G.audio?.ui('skill');
    const n = Object.keys(F.S.boards).filter(k => BOARDS.find(x => x.id === k)?.kind === b.kind).length, tot = BOARDS.filter(x => x.kind === b.kind).length;
    if (b.kind === 'xp') { F.award({ credits: 0, xp: 1500, fp: 25 }, 'XP Board', { silent: true }); F.overlay.stunt('XP Board', '+1,500 XP', -1, `${n} / ${tot} · ${b.name}`, '#ff8a1d'); }
    else { F.award({ credits: 0, xp: 500, fp: 25 }, 'Fast Travel Board', { silent: true }); F.overlay.stunt('Fast Travel Board', `-${n * 10}%`, -1, `Fast travel discount · ${n} / ${tot}`, '#3aa0ff'); }
    F.markers.setVisible('bd:' + b.id, false);
    F.bump('boards');
    G.skills?.add?.('BONUS BOARD', 500);
    F.save();
  }
  C.ftDiscount = () => Math.min(1, BOARDS.filter(b => b.kind === 'ft' && F.S.boards[b.id]).length * 0.1);

  // ================================================================ barn finds
  const barns = [];
  const shedMat = { std: std({ roughness: 0.85 }), metal: std({ metalness: 0.5, roughness: 0.6 }) };
  for (const def of BARNS) {
    const p = snapLand(world, def.ll[0], def.ll[1], { radius: 140, pad: 6 });
    if (!p) continue;
    const y = world.groundAt(p.x, p.z, world.heightAt(p.x, p.z) + 3);
    const n = g.nearestEdge(p.x, p.z, 200);
    const yaw = n ? Math.atan2(n.x - p.x, n.z - p.z) : 0; // doors toward the road
    const rand = rng(hashStr(def.id));
    const a = rand() * Math.PI * 2, r = 40 + rand() * 60;
    const B = { ...def, x: p.x, y, z: p.z, yaw, cx: p.x + Math.cos(a) * r, cz: p.z + Math.sin(a) * r, radius: 150 };
    // shed: wooden walls, pitched tin roof, two doors (animated open on discovery)
    const kit = new Kit();
    const W = 7, D = 8, H = 3.4;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const T = (lx, ly, lz, extra = {}) => ({ ...extra, x: p.x + c * lx + s * lz, y: y + ly, z: p.z - s * lx + c * lz, ry: yaw + (extra.ry || 0) });
    kit.box('std', W, H, 0.2, '#6b4a33', T(0, H / 2, -D / 2)); kit.box('std', 0.2, H, D, '#6f4d35', T(-W / 2, H / 2, 0)); kit.box('std', 0.2, H, D, '#6f4d35', T(W / 2, H / 2, 0));
    kit.box('std', W, 0.9, 0.2, '#6b4a33', T(0, H - 0.45, D / 2));
    for (const sx of [-1, 1]) kit.box('metal', W / 2 + 0.6, 0.08, D + 0.8, '#7d8288', T(sx * W / 4, H + 0.9, 0, { rz: sx * 0.45 }));
    kit.box('std', W, 1.8, 0.2, '#6b4a33', T(0, H + 0.4, -D / 2, { sy: 1 })); // gable back
    const shed = kit.build(shedMat, { shadows: { std: true, metal: true } });
    const doorGeo = new THREE.BoxGeometry(W / 2 - 0.1, H - 0.95, 0.12); doorGeo.translate((W / 2 - 0.1) / 2, (H - 0.95) / 2, 0);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3c28, roughness: 0.9 });
    const doors = [-1, 1].map(sx => {
      const d = new THREE.Mesh(doorGeo, doorMat); d.castShadow = true;
      const hinge = new THREE.Object3D(); hinge.position.set(p.x + c * (sx * W / 2) + s * (D / 2), y, p.z - s * (sx * W / 2) + c * (D / 2)); hinge.rotation.y = yaw + (sx < 0 ? 0 : Math.PI);
      if (sx > 0) d.position.x = 0; hinge.add(d); shed.add(hinge); return { hinge, sx, base: hinge.rotation.y };
    });
    shed.visible = false; shed.name = 'barn-' + def.id;
    G.scene.add(shed);
    B.shed = shed; B.doors = doors;
    B.cols = [
      { x: p.x - s * D / 2, z: p.z - c * D / 2, hx: W / 2, hz: 0.2, yaw, yMin: y - 1, yMax: y + H + 1, kind: 'barn' },
    ];
    // side walls
    for (const sx of [-1, 1]) B.cols.push({ x: p.x + c * (sx * W / 2), z: p.z - s * (sx * W / 2), hx: 0.2, hz: D / 2, yaw, yMin: y - 1, yMax: y + H + 1, kind: 'barn' });
    barns.push(B);
  }
  C.barns = barns;
  const barnState = id => F.S.barns[id] || null;
  function barnCar(B) {
    const owned = F.cars.owned();
    const cands = [...(B.prefer || []), ...F.cars.roster().filter(k => (F.cars.spec(k)?.tags || []).some(t => (B.tags || []).includes(t)))];
    return cands.find(k => F.cars.exists(k) && !owned.includes(k)) || cands.find(k => F.cars.exists(k)) || 'muscle';
  }
  C.refreshBarns = function () {
    const ch = F.chapter(), on = F.enabled();
    for (const B of barns) {
      let st = barnState(B.id);
      if (!st && ch >= B.chapter && F.S.prologue) { st = F.S.barns[B.id] = { s: 'rumour' }; F.queueCaption([['walt', B.rumour]]); F.overlay.banner('Barn find rumour', B.name, 'Search area marked on your map', '#c8a26a', 3400); F.save(); }
      const vis = on && st && st.s !== 'done';
      B.shed.visible = !!st && on;
      if (st && !B.colsOn && on) { for (const c of B.cols) world.colliders.add(c); B.colsOn = true; }
      F.markers.remove('barn:' + B.id);
      if (vis) {
        const found = st.s !== 'rumour';
        F.markers.add({ id: 'barn:' + B.id, kind: 'barn', icon: 'barn', group: 'collect', x: found ? B.x : B.cx, z: found ? B.z : B.cz, color: '#c8a26a',
          title: found ? B.name : 'Barn find rumour', sub: found ? (st.s === 'restoring' ? 'Being restored' : 'Restored') : 'Search the area', meta: found ? '' : B.rumour, beam: false, iconRange: found ? 200 : 0, radius: found ? 0 : B.radius, data: B });
      }
    }
  };
  function discoverBarn(B) {
    const st = F.S.barns[B.id];
    st.s = 'restoring'; st.car = barnCar(B); st.ready = (F.S.playTime || 0) + B.restore * 60;
    F.bump('barns');
    F.save();
    // cinematic: doors swing open, a dusty silhouette inside
    const key = CARS[st.car] ? st.car : 'muscle';
    let vis = null;
    try {
      vis = buildModel(CARS[key].model, { paint: 0x4a4540, seed: 3 });
      const c = Math.cos(B.yaw), s = Math.sin(B.yaw);
      vis.root.position.set(B.x - s * 0.6, B.y, B.z - c * 0.6); vis.root.rotation.y = B.yaw + Math.PI;
      vis.root.traverse(o => { if (o.isMesh && o.material?.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.45); if ('roughness' in o.material) o.material.roughness = 1; } });
      G.scene.add(vis.root);
    } catch { /* model unavailable */ }
    B.vis = vis;
    let t = 0;
    const pv = G.player.vehicle; if (pv) { pv.input.throttle = 0; pv.input.brake = 1; pv.input.autoReverse = false; }
    F.cinematic(4.2, (cam, dt) => {
      t += dt;
      const o = Math.min(1, t / 1.6);
      for (const d of B.doors) d.hinge.rotation.y = d.base + d.sx * o * 1.7;
      const a = B.yaw + 0.6 - t * 0.12, r = 13 - t * 0.8;
      cam.position.set(B.x + Math.sin(a) * r, B.y + 2.2, B.z + Math.cos(a) * r);
      cam.lookAt(B.x, B.y + 1.2, B.z);
    }, () => {
      F.overlay.banner('Barn find', F.cars.name(st.car), `Restoration ready in ${B.restore} minutes of play`, '#c8a26a', 4200, 'levelup');
      F.queueCaption([['walt', `Would you look at that. Leave it with me, I will have it running in about ${B.restore} minutes.`]]);
      F.award({ credits: 0, xp: 2500, fp: 150 }, 'Barn find', { silent: true });
      C.refreshBarns();
    });
  }
  function checkBarns() {
    const pv = G.player.vehicle, p = G.player.pos;
    for (const B of barns) {
      const st = barnState(B.id);
      if (!st) continue;
      if (st.s === 'rumour' && pv && Math.hypot(p.x - B.x, p.z - B.z) < 26) discoverBarn(B);
      else if (st.s === 'restoring' && (F.S.playTime || 0) >= st.ready) {
        st.s = 'done';
        F.cars.give(st.car, 'barnfind');
        F.overlay.banner('Barn find restored', F.cars.name(st.car), 'Added to your garage', '#c8a26a', 4000, 'purchase');
        if (B.vis) { G.scene.remove(B.vis.root); B.vis = null; }
        F.save(); C.refreshBarns();
      }
    }
  }

  // ================================================================ houses
  const houses = [];
  const houseKit = new Kit();
  for (const def of HOUSES) {
    const r = snapRoad(world, def.ll[0], def.ll[1], null, 250);
    if (!r) continue;
    const rx = -r.dz, rz = r.dx;
    let side = 1;
    for (const s of [1, -1]) { const x = r.x + rx * (r.edge.width / 2 + 3) * s, z = r.z + rz * (r.edge.width / 2 + 3) * s; if (!world.colliders.pointHit(x, world.groundAt(x, z) + 1, z, 0.5)) { side = s; break; } }
    const sx = r.x + rx * (r.edge.width / 2 + 2.2) * side, sz = r.z + rz * (r.edge.width / 2 + 2.2) * side, sy = world.groundAt(sx, sz, world.heightAt(sx, sz) + 3);
    // for-sale sign (hidden once owned)
    const H = { ...def, x: r.x, z: r.z, sx, sz, sy, yaw: yawOf(r.dx, r.dz), side };
    houses.push(H);
  }
  const saleTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
    x.fillStyle = '#f6f3ee'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#ff2e7e'; x.fillRect(0, 0, 256, 44);
    x.fillStyle = '#fff'; x.font = `italic 800 38px ${COND}`; x.textAlign = 'center'; x.fillText('FOR SALE', 128, 36);
    x.fillStyle = '#0d0f1a'; x.font = `800 26px ${COND}`; x.fillText('HILLBOMB REALTY', 128, 86); x.font = `600 20px ${COND}`; x.fillText('ASK AT THE CURB · PRESS E', 128, 124);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const signs = new THREE.Group(); signs.name = 'festival-house-signs';
  for (const H of houses) {
    const s = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0xf6f3ee })); post.position.y = 1; s.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.05), new THREE.MeshStandardMaterial({ map: saleTex, roughness: 0.6 })); board.position.set(0, 1.9, 0); s.add(board);
    s.position.set(H.sx, H.sy, H.sz); s.rotation.y = H.yaw + Math.PI / 2 * H.side;
    signs.add(s); H.sign = s;
  }
  G.scene.add(signs);
  void houseKit;
  C.houses = houses;
  C.owns = id => F.S.houses.includes(id);
  C.refreshHouses = function () {
    for (const H of houses) {
      const owned = C.owns(H.id);
      H.sign.visible = F.enabled() && !owned;
      F.markers.remove('house:' + H.id);
      if (F.enabled()) F.markers.add({ id: 'house:' + H.id, kind: owned ? 'house' : 'house', icon: 'house', group: 'collect', x: H.sx, z: H.sz, color: owned ? '#39e07a' : '#a7b0ba',
        title: H.name, sub: owned ? 'Your house · fast travel' : `For sale · ${fmtMoney(H.price)}`, meta: `${H.place} · ${H.perkText}`, beam: owned, beamH: 60, beamR: 2, iconSize: 3.4, iconH: 7, iconRange: 380, fastTravel: owned, data: H,
        action: owned ? 'Fast travel' : '', onSelect: owned ? ctx => F.select('house', H, ctx) : null });
    }
  };
  C.buyHouse = async function (H) {
    if (C.owns(H.id)) return;
    const ok = await F.screens.confirm({ kicker: 'Player house', title: H.name, text: `${H.place}. ${H.perkText}<br><br>Price: <b style="color:var(--ui-acc2)">${fmtMoney(H.price)}</b> · You have ${fmtMoney(G.economy.money)}`, yes: `Buy for ${fmtMoney(H.price)}`, no: 'Not now' });
    if (!ok) return;
    if (!G.economy.spend(H.price)) { G.audio?.ui('error'); G.hud?.toast?.('Not enough credits', `You need ${fmtMoney(H.price - G.economy.money)} more`, '', 2600); return; }
    F.S.houses.push(H.id);
    G.audio?.ui('purchase');
    F.overlay.banner('House purchased', H.name, H.perkText, '#39e07a', 4000);
    if (H.perk === 'spin') F.addSpins(1, false);
    if (H.perk === 'credits') F.addSpins(1, true);
    F.bump('houses');
    C.refreshHouses(); F.save();
  };

  // ================================================================ roads discovered
  const E = g.edges;
  const sig = `${E.length}:${Math.round(E.reduce((s, e) => s + e.len, 0))}`;
  const totalLen = E.reduce((s, e) => s + e.len, 0);
  let bits = new Uint8Array(Math.ceil(E.length / 8));
  // progress is kept per road network (v1 grid / v2 real map): switching maps parks the other map's bits
  const other = F.S.roadsOther || (F.S.roadsOther = {});
  if (F.S.roadsSig !== sig) { if (F.S.roadsSig && F.S.roads) other[F.S.roadsSig] = F.S.roads; F.S.roads = other[sig] || ''; delete other[sig]; F.S.roadsSig = sig; }
  if (F.S.roads) bits = b64ToBits(F.S.roads, bits.length);
  const has = i => (bits[i >> 3] >> (i & 7)) & 1;
  let discLen = 0; for (let i = 0; i < E.length; i++) if (has(i)) discLen += E[i].len;
  C.roadsPct = () => (100 * discLen / Math.max(1, totalLen));
  C.roadsInfo = () => ({ discovered: discLen, total: totalLen, edges: E.length });
  let cur = null, curAcc = 0, lastX = 0, lastZ = 0, roadT = 0, lastPct = Math.floor(C.roadsPct());
  function checkRoads(dt) {
    roadT -= dt; if (roadT > 0) return; roadT = 0.25;
    const pv = G.player.vehicle; if (!pv) { cur = null; return; }
    const x = pv.pos.x, z = pv.pos.z;
    const n = g.nearestEdge(x, z, 12);
    const step = Math.hypot(x - lastX, z - lastZ); lastX = x; lastZ = z;
    if (!n) { cur = null; return; }
    const i = n.edge.id;
    if (has(i)) { cur = null; return; }
    if (cur !== i) { cur = i; curAcc = 0; }
    if (step < 30) curAcc += step;
    if (curAcc >= Math.min(n.edge.len * 0.55, 110)) {
      bits[i >> 3] |= 1 << (i & 7); discLen += n.edge.len; cur = null;
      F.S.roads = bitsToB64(bits);
      const pct = Math.floor(C.roadsPct());
      if (pct > lastPct) {
        const gained = pct - lastPct; lastPct = pct;
        F.award({ credits: 0, xp: 150 * gained, fp: 10 * gained }, 'Roads discovered', { silent: true });
        if (pct % 5 === 0) G.hud?.toast?.('Roads discovered', `${pct}% of San Francisco explored`, 'good', 2600);
        F.setStat('roadsPct', pct);
        F.save();
      }
    }
  }

  // ================================================================ districts
  const districtNames = [...new Set(DISTRICTS.map(d => d.name))];
  C.districtCount = districtNames.length;
  let distT = 0;
  function checkDistrict(dt) {
    distT -= dt; if (distT > 0) return; distT = 1;
    if (!G.player.vehicle && !G.player.pos) return;
    const p = G.player.pos, name = world.district(p.x, p.z);
    if (!name || name === 'San Francisco' || F.S.districts.includes(name)) return;
    F.S.districts.push(name);
    if (G.hud?.district) { G.hud.district(name, `Discovered · ${F.S.districts.length} / ${districtNames.length}`); G.audio?.ui('checkpoint'); }
    else F.overlay.banner('District discovered', name, `${F.S.districts.length} / ${districtNames.length} districts`, '#4fd2ff', 3000, 'checkpoint');
    F.award({ credits: 500, xp: 600, fp: 40 }, name, { silent: true });
    F.setStat('districts', F.S.districts.length);
    F.save();
  }

  // ================================================================ fast travel
  C.ftCost = function () { if (F.perk('freeft')) return 0; return Math.round(2500 * (1 - C.ftDiscount()) / 50) * 50; };
  C.ftTargets = function () {
    const out = [];
    for (const s of F.sites.list) if (s.open) out.push({ id: 'site:' + s.id, name: s.name, sub: s.place, x: s.hub.x, z: s.hub.z, color: s.color, icon: s.kind === 'main' ? 'site' : 'outpost' });
    for (const H of houses) if (C.owns(H.id)) out.push({ id: 'house:' + H.id, name: H.name, sub: H.place, x: H.x, z: H.z, color: '#39e07a', icon: 'house' });
    return out;
  };
  C.fastTravel = async function (target) {
    if (F.activity) { G.hud?.toast?.('Not now', 'Finish the current event first', '', 2000); return false; }
    const cost = C.ftCost();
    if (cost && G.economy.money < cost) { G.audio?.ui('error'); G.hud?.toast?.('Fast travel', `Costs ${fmtMoney(cost)}. Smash fast travel boards to make it cheaper.`, '', 2800); return false; }
    if (cost) G.economy.spend(cost);
    F.overlay.fadeTo(1, 4);
    F.after(0.3, () => {
      const n = g.nearestEdge(target.x, target.z, 120);
      let x = target.x, z = target.z, yaw = 0;
      if (n) { x = n.x; z = n.z; const e = n.edge, k = Math.min(n.k, e.pts.length - 2); yaw = yawOf(e.pts[k + 1][0] - e.pts[k][0], e.pts[k + 1][1] - e.pts[k][1]); }
      const pv = G.player.vehicle;
      if (pv) F.cars.place(pv, x, z, yaw); else G.player.pos.set(x, world.groundAt(x, z, world.heightAt(x, z) + 3), z);
      G.rig.snap();
      F.overlay.lower(target.name, 'Fast travel', target.sub || '', 2600);
      F.overlay.fadeTo(0, 2.5);
    });
    return true;
  };

  // ================================================================ update + visibility
  layoutBoards();
  C.refreshAll = () => { C.refreshBoards(); C.refreshBarns(); C.refreshHouses(); boardGroup.visible = F.enabled(); };
  C.update = function (dt) {
    checkBoards(dt);
    if (F.activity) return;
    checkRoads(dt); checkDistrict(dt);
    checkBarns();
    // house purchase prompts via POIs (set up in festival.js)
  };
  C.setVisible = v => { boardGroup.visible = v; signs.visible = v; for (const B of barns) if (!v) B.shed.visible = false; };
  void clamp; void ll;
  return C;
}
