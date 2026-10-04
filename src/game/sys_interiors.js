// Enterable buildings: safehouse (Russian Hill), Bay Motors showroom (SoMa), multi-level parking garage (SoMa),
// diner (Fisherman's Wharf), bodega (Mission), cafe (Hayes Valley).
// Colliders + drivable decks are registered at install (cheap, permanent); meshes are built lazily within ~120 m
// and disposed beyond ~175 m. Interactions use E (interact); door transitions fade to black.
import * as THREE from 'three';
import { SITE_DEFS, placeAll, lotsToSkip, keepClearZones, siteAnchor } from '../world/interiors/sites.js';
import { Site } from '../world/interiors/site.js';
import { obbOverlap } from '../world/geo.js';
import { hideGenericLots } from '../world/interiors/hide.js';
import { getMaterials, updateMaterials } from '../world/interiors/materials.js';
import { createUI } from '../world/interiors/ui.js';
import { CARS, carParams } from '../vehicle/cars.js';
import * as safehouse from '../world/interiors/safehouse.js';
import * as showroom from '../world/interiors/showroom.js';
import * as parking from '../world/interiors/parking.js';
import * as diner from '../world/interiors/diner.js';
import * as bodega from '../world/interiors/bodega.js';
import * as cafe from '../world/interiors/cafe.js';
import * as pizza from '../world/interiors/pizza.js';

const MODULES = { safehouse, showroom, parking, diner, bodega, cafe, pizza };
const BLIPS = {
  safehouse: { icon: 'H', color: '#ffc247', edge: true },
  showroom: { icon: '$', color: '#4cd964', edge: true },
  parking: { icon: 'P', color: '#5aa9ff', edge: true },
  diner: { icon: 'D', color: '#ff6f91', edge: false },
  bodega: { icon: 'B', color: '#ff9f40', edge: false },
  cafe: { icon: 'C', color: '#d9a066', edge: false },
  pizza: { icon: 'Z', color: '#ff4436', edge: false },
};
const BUILD_R = 140, HIDE_R = 170, DROP_R = 450;   // interior build / hide / dispose radii (exteriors are permanent)

export function install(G) {
  const world = G.world;
  const UI = createUI(G);
  const sites = [];
  const ctx = { G, UI, mats: null, atlas: null, pivot, spawnCar, sleepMenu, garageMenu, foodMenu, carCard, fade: UI.fade, teleport };

  // ---------------------------------------------------------------- sites: placed by query (street names / lat-lon), static parts now
  let placed = new Map();
  // v2 (1:1 OSM map): no v1 blocks; the candidate lots are the real OSM footprints around each site's anchor
  const defs = SITE_DEFS.filter(d => MODULES[d.id]).map(d => (world.v2 && d.mode === 'block' ? { ...d, mode: undefined } : d));
  const blocks = world.v2 ? v2Blocks(world, defs) : world.blocks;
  try { placed = placeAll({ blocks, graph: world.graph, heightAt: world.heightAt }, defs); } catch (e) { console.error('[interiors] placement', e); }
  let skip = [];
  try { skip = lotsToSkip(blocks, world.graph, world.heightAt, placed); } catch (e) { console.warn('[interiors] skip lots', e); }
  for (const def of SITE_DEFS) {
    const mod = MODULES[def.id]; if (!mod) continue;
    const fp = placed.get(def.id); if (!fp) continue;
    try {
      const [y0, yMin] = floorLevel(world, fp, mod.FLOOR_PAD ?? 0.2);
      const S = new Site(G, def, fp, y0);
      S.ctx = ctx; S.side = fp.side; S.baseY = Math.min(-1.2, yMin - y0 - 0.5);
      S.covered = skip.filter(l => obbOverlap({ ...fp, hx: fp.hx - 0.3, hz: fp.hz - 0.3 }, l, 0));
      mod.setup(S, ctx);
      for (const c of S.colliders) world.colliders.add(c);
      for (const d of S.decks) world.terrain.addDeck(d);
      for (const d of S.doors) { d.outW = S.wp(d.out[0], d.y, d.out[1]); d.inW = S.wp(d.in[0], d.y, d.in[1]); d.outYaw = S.yaw + d.out[2]; d.inYaw = S.yaw + d.in[2]; }
      sites.push({ def, mod, S, built: null, r: Math.hypot(fp.hx, fp.hz) });
    } catch (e) { console.error('[interiors] setup ' + def.id, e); }
  }
  // generic buildings on our lots (if the generator did not skip them)
  if (world.v2) {
    // hide the OSM footprints our buildings replace (buildings module drops their meshes + colliders)
    let hid = 0;
    for (const l of skip) if (l.bi != null && world.buildings?.hideBuilding) { world.buildings.hideBuilding(l.bi); hid++; }
    console.log(`[interiors] v2: ${sites.length} sites; hid ${hid} OSM footprints`, sites.map(s => `${s.def.id}@${s.S.x.toFixed(0)},${s.S.z.toFixed(0)} on ${placed.get(s.def.id)?.street}`).join(' | '));
  } else try {
    const r = hideGenericLots(world, skip, sites.map(s => ({ x: s.S.x, z: s.S.z, hx: s.S.hx, hz: s.S.hz, yaw: s.S.yaw })));
    console.log(`[interiors] ${sites.length} sites; hid ${skip.length} generic lots (${r.specs} buildings, ${r.colliders} colliders, ${r.tris} tris)`, sites.map(s => `${s.def.id}@${s.S.x.toFixed(0)},${s.S.z.toFixed(0)}${s.S.side ? '/' + s.S.side : ''} on ${placed.get(s.def.id)?.street}`).join(' | '));
  } catch (e) { console.warn('[interiors] hide generic', e); }

  // ---------------------------------------------------------------- build everything once now (during the loading screen)
  { const t0 = performance.now(); for (const s of sites) build(s); console.log(`[interiors] all sites built in ${(performance.now() - t0).toFixed(0)} ms`); }

  // ---------------------------------------------------------------- real lights (kept in the scene: no shader recompiles)
  const lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffd6a0, 0, 11, 2); l.castShadow = false; G.scene.add(l); return { l, tgt: 0 }; });

  // ---------------------------------------------------------------- blips (keep everyone else's)
  const myBlips = sites.map(s => ({ x: s.S.x, z: s.S.z, type: 'event', name: s.def.name, ...(BLIPS[s.def.id] || { icon: '?', color: '#fff' }) }));
  const prevBlips = G.blips;
  G.blips = () => [...(prevBlips ? prevBlips() : []), ...myBlips];
  const show = sites.find(s => s.def.id === 'showroom');
  G.interiorsShowroom = show ? { x: show.S.x, z: show.S.z } : true;
  G.interiors = { sites: sites.map(s => s.S), ui: UI, placed, keepClear: () => keepClearZones(placed), info: () => sites.map(s => ({ id: s.def.id, x: +s.S.x.toFixed(1), z: +s.S.z.toFixed(1), y0: +s.S.y0.toFixed(2), built: !!s.built, drawCalls: s.built?.drawCalls, ms: s.buildMs, stats: s.built?.stats })) };

  // ---------------------------------------------------------------- camera: stay under ceilings / inside rooms
  const rig = G.rig, origApply = rig.apply;
  rig.apply = function (dt) { try { clampCamera(); } catch (e) { /* never break the camera */ } return origApply.call(this, dt); };
  function clampCamera() {
    if (window.__freeCam) return;
    const P = G.player, rp = rig.rig.pos;
    for (const s of sites) {
      if (!s.built) continue;
      const vol = s.S.inside(P.pos.x, P.pos.y + 0.4, P.pos.z);
      if (!vol) continue;
      const yRef = P.pos.y + (P.mode === 'car' ? 1.0 : 1.3);
      const ceil = s.S.ceilingAt(rp.x, rp.z, yRef) ?? s.S.ceilingAt(P.pos.x, P.pos.z, yRef);
      if (ceil != null && rp.y > ceil - 0.28) rp.y = ceil - 0.28;
      if (vol.clampXZ) {
        const [lx, lz] = s.S.l(rp.x, rp.z), b = vol.b, m = 0.3;
        const cx = Math.max(b[0] + m, Math.min(b[3] - m, lx)), cz = Math.max(b[2] + m, Math.min(b[5] - m, lz));
        if (cx !== lx || cz !== lz) { const [wx, wz] = s.S.w(cx, cz); rp.x = wx; rp.z = wz; }
      }
      break;
    }
  }

  // ---------------------------------------------------------------- per frame
  let prompted = false, buildCooldown = 0;
  const info = { playerLocal: null, inCar: false };
  G.systems.push({
    update(dt) {
      const P = G.player, pos = P.pos;
      const env = G.env;
      updateMaterials(dt, env);
      // interiors: lazy build / dispose (one build per frame at most); exteriors stay
      buildCooldown -= dt;
      for (const s of sites) {
        const d = Math.hypot(pos.x - s.S.x, pos.z - s.S.z) - s.r;
        if (!s.built && d < BUILD_R && buildCooldown <= 0) { build(s); buildCooldown = 0.15; }
        else if (s.built && d > DROP_R) dropInterior(s);
        if (s.int) s.int.visible = d < HIDE_R;
      }
      // site animation (doors, turntables) + which volume the player is in
      let active = null, activeVol = null;
      info.inCar = P.mode === 'car';
      for (const s of sites) {
        if (!s.B) continue;
        const [lx, lz] = s.S.l(pos.x, pos.z);
        info.playerLocal = [lx, pos.y - s.S.y0, lz];
        if (Math.abs(lx) < s.S.hx + 40 && Math.abs(lz) < s.S.hz + 40) {
          try { s.B.update?.(dt, info, ctx); } catch (e) { console.error('[interiors] update ' + s.def.id, e); s.B.update = null; }
        }
        if (!active && s.built) { const v = s.S.inside(pos.x, pos.y + 0.4, pos.z, 1.5); if (v) { active = s; activeVol = v; } }
      }
      updateLights(dt, active, activeVol);
      updateInteract();
    },
  });

  // (re)build a whole site: the fresh exterior replaces the old one, the interior is added. Returns true on success.
  function build(s) {
    const t0 = performance.now();
    try {
      if (!ctx.mats) { ctx.mats = getMaterials(); ctx.atlas = ctx.mats.atlas; }
      const B = s.mod.build(s.S, ctx);
      if (!s.root) {
        s.root = new THREE.Group(); s.root.name = 'site:' + s.def.id;
        s.root.position.set(s.S.x, s.S.y0, s.S.z); s.root.rotation.y = s.S.yaw; s.root.updateMatrix(); s.root.matrixAutoUpdate = false;
        G.scene.add(s.root);
      }
      if (s.ext) { s.root.remove(s.ext); disposeGroup(s.ext); }
      if (s.int) { s.root.remove(s.int); disposeGroup(s.int); s.B?.dispose?.(); }
      s.ext = B.ext || null; s.int = B.group || null;
      if (s.ext) { s.ext.name = 'exterior'; s.root.add(s.ext); }
      if (s.int) { s.int.name = 'interior'; s.root.add(s.int); }
      s.root.updateMatrixWorld(true);
      s.B = B; s.built = B; s.buildMs = +(performance.now() - t0).toFixed(0);
      const st = B.stats || {};
      console.log(`[interiors] built ${s.def.id} in ${(performance.now() - t0).toFixed(0)} ms (bake ${st.bakeMs?.toFixed(0)} ms, buffers ${st.meshMs?.toFixed(0)} ms, ${st.verts} verts, ${st.lights} lights, ${st.occ} occluders), ${B.drawCalls} draw calls`);
    } catch (e) { console.error('[interiors] build ' + s.def.id, e); s.built = { update: null, group: null, failed: true }; }
  }
  // far away: free the interior (the exterior shell keeps standing)
  function dropInterior(s) {
    if (s.int) { s.root.remove(s.int); disposeGroup(s.int); s.int = null; }
    s.B?.dispose?.();
    s.built = null;
  }
  function disposeGroup(g) { g.traverse(o => { if (o.isMesh && o.userData.own) o.geometry?.dispose(); }); }

  function updateLights(dt, s, vol) {
    const spots = s && vol && s.S.lightSpots ? s.S.lightSpots[vol.name] : null;
    lights.forEach((L, i) => {
      const sp = spots && spots[i];
      if (sp) {
        const p = s.S.wp(sp[0], sp[1], sp[2]);
        L.l.position.set(p.x, p.y, p.z); L.l.color.setHex(sp[3]); L.tgt = sp[4];
      } else L.tgt = 0;
      L.l.intensity += (L.tgt - L.l.intensity) * Math.min(1, dt * 4);
      if (L.l.intensity < 0.01 && L.tgt === 0) L.l.intensity = 0;
    });
  }

  function updateInteract() {
    if (UI.open || UI.fading || G.state !== 'play' || performance.now() < (UI.cooldown || 0)) { if (prompted) { G.hud.prompt(null, 'interiors'); prompted = false; } return; }
    const P = G.player, pos = P.pos, foot = P.mode === 'foot';
    let best = null, bd = Infinity, html = '';
    for (const s of sites) {
      if (!s.built) continue;
      for (const it of s.S.inter) {
        if (!foot && !it.car) continue;
        if (it.when && !it.when()) continue;
        const d = Math.hypot(pos.x - it.x, pos.z - it.z);
        if (d < it.r && Math.abs(pos.y - it.y) < 1.7 && d < bd) { bd = d; best = it; html = typeof it.prompt === 'function' ? it.prompt() : it.prompt; }
      }
      if (!foot) continue;
      for (const dr of s.S.doors) {
        for (const side of ['out', 'in']) {
          const w = side === 'out' ? dr.outW : dr.inW;
          const d = Math.hypot(pos.x - w.x, pos.z - w.z);
          if (d < 1.5 && Math.abs(pos.y - w.y) < 1.5 && d < bd) {
            bd = d;
            best = { use: () => doorUse(dr, side) };
            html = `<b>${dr.label}</b>Press <kbd>E</kbd> to ${side === 'out' ? 'enter' : 'exit'}`;
          }
        }
      }
    }
    if (best) {
      G.hud.prompt(html, 'interiors'); prompted = true;
      if (G.input.pressed('interact')) { G.hud.prompt(null, 'interiors'); prompted = false; G.audio?.ui('click'); best.use(); }
    } else if (prompted) { G.hud.prompt(null, 'interiors'); prompted = false; }
  }
  function doorUse(dr, side) {
    const to = side === 'out' ? dr.inW : dr.outW, yaw = side === 'out' ? dr.inYaw : dr.outYaw;
    UI.fade(() => teleport(to.x, to.y, to.z, yaw));
  }
  function teleport(x, y, z, yaw) {
    const P = G.player;
    if (P.vehicle) return;
    P.pos.set(x, world.groundAt(x, z, y + 0.5), z); P.vel.set(0, 0, 0); P.yaw = yaw;
    P.human.root.position.copy(P.pos); P.human.root.rotation.y = yaw;
    G.rig.rig.orbitYaw = yaw; G.rig.rig.orbitPitch = 0; G.rig.snap();
  }

  // ---------------------------------------------------------------- helpers exposed to the sites
  function pivot(group, x, y, z) {
    const pv = new THREE.Group(); pv.position.set(x, y, z); pv.matrixAutoUpdate = false; pv.updateMatrix();
    if (group) for (const m of [...group.children]) { m.position.set(-x, -y, -z); m.updateMatrix(); pv.add(m); }
    return pv;
  }
  let lastSpawned = null;
  function spawnCar(id, S, lx, lz, lyaw) {
    const [x, z] = S.w(lx, lz), yaw = S.yaw + lyaw;
    for (const v of G.vehicles().slice()) {
      if (v === G.player.vehicle) continue;
      if (Math.hypot(v.pos.x - x, v.pos.z - z) < 5) { if (v.ai) G.traffic?.removeCar?.(v); G.removeVehicle(v); }
    }
    if (lastSpawned && lastSpawned !== G.player.vehicle && G.vehicles().includes(lastSpawned)) G.removeVehicle(lastSpawned);
    const y = world.groundAt(x, z, S.y0 + 1.5);
    const v = G.spawnVehicle(id, x, z, yaw, { role: 'player', y });
    lastSpawned = v;
    return v;
  }
  function fmtH(h) { const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`; }
  function sleepMenu() {
    const now = G.env.state.hours;
    const sleep = (h, label) => {
      UI.close(true);
      UI.fade(() => {
        G.env.state.hours = h; G.player.health = 100; G.player.stamina = 1;
        G.economy.save();
        setTimeout(() => G.hud.toast(label, 'Game saved', 'good', 3200), 400);
      }, 700);
    };
    UI.show({
      name: 'sleep', title: 'Safehouse', kicker: 'BED', sub: `It's ${fmtH(now)}. Sleeping restores your health and saves the game.`,
      items: [
        { label: 'Sleep until morning', sub: 'Wake at 7:00 AM', act: () => sleep(7, 'Good morning, San Francisco') },
        { label: 'Sleep until evening', sub: 'Wake at 7:00 PM, golden hour', act: () => sleep(19, 'Evening. The city is waking up') },
        { label: 'Save game', sub: 'Keep the current time', act: () => { G.economy.save(); UI.close(); G.hud.toast('Game saved', '', 'good', 2000); } },
        { label: 'Cancel', act: () => UI.close() },
      ],
    });
  }
  function carStats(id) {
    const d = CARS[id], p = carParams(id);
    const accel = Math.min(1, (d.torque / d.mass) / 0.62), top = Math.min(1, d.top / 330), grip = Math.min(1, (d.grip - 0.85) / 0.4);
    const brake = Math.min(1, (p.brake ?? 1) / 1.25);
    return { d, accel, top, grip, brake };
  }
  function garageMenu(S) {
    const E = G.economy;
    const cards = E.owned.filter(id => CARS[id]).map(id => {
      const { d, accel, top } = carStats(id);
      return {
        cls: 'owned' + (E.current === id ? ' sel' : ''),
        html: `<span class="cls ${d.cls}">${d.cls}</span>${E.current === id ? '<span class="cur">CURRENT</span>' : ''}<h3>${d.name}</h3>
          <div class="stat"><span>Top speed</span><span>${G.hud.units === 'mph' ? Math.round(d.top / 1.609) + ' mph' : d.top + ' km/h'}</span></div>
          <div class="stat"><span>Drivetrain</span><span>${d.drive}</span></div>${UI.bar('Speed', top, '')}${UI.bar('Acceleration', accel, '')}`,
        act: () => {
          UI.close(true);
          E.current = id; E.save();
          const sp = S.spawn;
          spawnCar(id, S, sp.at[0], sp.at[1], sp.yaw);
          G.audio?.ui('confirm');
          G.hud.toast(`${d.name} is out front`, 'Parked by the garage door', 'good', 3200);
        },
      };
    });
    UI.show({ name: 'garage', title: 'Garage', kicker: 'YOUR CARS', sub: `Pick a car and it's parked outside the garage door. Buy more at <b style="color:var(--acc2)">Bay Motors</b> in SoMa.`, cards, items: [{ label: 'Close', act: () => UI.close() }], sel: Math.max(0, E.owned.indexOf(E.current)) });
  }
  // generic counter menu: items [{label, price, health, stamina, msg}]
  function foodMenu(title, kicker, sub, items) {
    const E = G.economy;
    UI.show({
      name: 'food', title, kicker, sub: `${sub} · $${Math.floor(E.money).toLocaleString()} in your pocket`,
      items: [...items.map(it => ({
        label: `${it.label} · $${it.price}`, sub: it.sub, disabled: E.money < it.price,
        act: () => {
          if (!E.spend(it.price)) { G.audio?.ui('error'); return; }
          const P = G.player; P.health = Math.min(100, P.health + (it.health || 0)); if (it.stamina) P.stamina = 1;
          G.audio?.ui('money'); UI.close();
          G.hud.toast(it.msg || it.label, `+${it.health || 0} health`, 'good', 2600);
        },
      })), { label: 'Leave', act: () => UI.close() }],
    });
  }
  // showroom car card: buy or take out
  function carCard(id, S, onBuy) {
    const E = G.economy, { d, accel, top, grip, brake } = carStats(id), owned = E.owned.includes(id);
    const can = E.money >= d.price;
    const units = G.hud.units === 'mph';
    const html = `<div class="int-car"><div>
        <span class="cls ${d.cls}">CLASS ${d.cls}</span>
        <div class="price ${owned ? 'owned' : ''}">${owned ? 'OWNED' : '$' + d.price.toLocaleString()}</div>
        <div class="blurb">${d.drive} · ${d.engine.toUpperCase()} · ${d.mass.toLocaleString()} kg. ${owned ? 'Already in your garage.' : can ? 'Drive it off the floor today.' : `You need <b style="color:var(--ink)">$${(d.price - E.money).toLocaleString()}</b> more. Win races and bank skill chains.`}</div>
      </div><div>
        ${UI.bar('Top speed', top, units ? Math.round(d.top / 1.609) + ' mph' : d.top + ' km/h')}
        ${UI.bar('Acceleration', accel, d.torque + ' Nm')}
        ${UI.bar('Handling', grip, d.grip.toFixed(2) + ' g')}
        ${UI.bar('Braking', brake, '')}
        <div class="int-spec"><span>Drivetrain <b>${d.drive}</b></span><span>Engine <b>${d.engine}</b></span><span>Weight <b>${d.mass.toLocaleString()} kg</b></span><span>Gears <b>${d.gears.length}</b></span></div>
      </div></div>`;
    const items = owned
      ? [{ label: 'Take it out', sub: 'Delivered to the drive-out door', act: () => { UI.close(true); E.current = id; E.save(); onBuy?.(id, false); } }]
      : [{ label: can ? `Buy for $${d.price.toLocaleString()}` : 'Not enough money', sub: can ? `Leaves you $${(E.money - d.price).toLocaleString()}` : `$${Math.floor(E.money).toLocaleString()} available`, disabled: !can,
        act: () => {
          if (!E.spend(d.price)) { G.audio?.ui('error'); return; }
          if (!E.owned.includes(id)) E.owned.push(id);
          E.current = id; E.save();
          G.audio?.ui('purchase');
          UI.close(true);
          G.hud.banner('SOLD', d.name, 'gold', 2400);
          onBuy?.(id, true);
        } }];
    items.push({ label: 'Close', act: () => UI.close() });
    UI.show({ name: 'car', title: d.name, kicker: 'BAY MOTORS · SAN FRANCISCO', html, items });
  }
}

// floor level of a site: highest terrain over the footprint + pad; also returns the lowest terrain
function floorLevel(world, fp, pad) {
  let m = -Infinity, lo = Infinity;
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  for (let i = -1; i <= 1.0001; i += 0.125) for (let j = -1; j <= 1.0001; j += 0.125) {
    const lx = i * fp.hx, lz = j * fp.hz;
    const h = world.heightAt(fp.x + c * lx + s * lz, fp.z - s * lx + c * lz);
    m = Math.max(m, h); lo = Math.min(lo, h);
  }
  return [m + pad, lo];
}

// v2: pseudo-blocks for the site placer: one per site anchor, lots = oriented boxes of the real OSM footprints nearby
// (longest-edge frame), tagged with the building index (bi) so the site can hide the footprint it replaces
function v2Blocks(world, defs) {
  const B = world.data?.buildings, st = world.stream; if (!B || !st) return [];
  const ring = [], out = [], seen = new Map();
  for (const def of defs) {
    const [ax, az] = siteAnchor(world.graph, def), R = def.mode === 'block' ? 320 : 170;
    const lots = [];
    const t0 = { tx: Math.floor((ax - st.X0) / st.T), tz: Math.floor((az - st.Z0) / st.T) };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const [f, c] = B.inTile(t0.tx + dx, t0.tz + dz);
      for (let i = f; i < f + c; i++) {
        if (seen.has(i)) { const l = seen.get(i); if (l && Math.hypot(l.x - ax, l.z - az) < R) lots.push(l); continue; }
        B.ring(i, ring); const n = ring.length / 2; if (n < 3) { seen.set(i, null); continue; }
        let best = 0, yaw = 0;
        for (let k = 0; k < n; k++) { const ex = ring[((k + 1) % n) * 2] - ring[k * 2], ez = ring[((k + 1) % n) * 2 + 1] - ring[k * 2 + 1], l2 = ex * ex + ez * ez; if (l2 > best) { best = l2; yaw = Math.atan2(ex, ez); } }
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let k = 0; k < n; k++) { const x = ring[k * 2], z = ring[k * 2 + 1], lx = cy * x - sy * z, lz = sy * x + cy * z; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); }
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
        // oriented box: local (x, z) -> world via the CONVENTIONS formula with this yaw
        const l = hx > 1.5 && hz > 1.5 && hx < 60 && hz < 60 ? { x: cy * mx + sy * mz, z: -sy * mx + cy * mz, hx, hz, yaw, bi: i } : null;
        seen.set(i, l);
        if (l && Math.hypot(l.x - ax, l.z - az) < R) lots.push(l);
      }
    }
    out.push({ lots, cx: ax, cz: az, inner: null });
  }
  return out;
}
