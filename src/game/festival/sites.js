// Festival sites: the Main Stage at Marina Green + six outposts that open with progression.
// Everything is placed in a local site frame (+Z = entrance toward the road, stage at -Z), dropped onto the live
// terrain per prop, merged per material (~10 draw calls per site) and lit at night (LED screens, string lights,
// sweeping stage beams). Car podiums show real car models on turntables; the crowd is one instanced mesh.
import * as THREE from 'three';
import { SITES, CHAPTERS } from './catalog.js';
import { findFootprint, ll, clamp } from './util.js';
import { Kit, frame, std, glowMat } from './kit.js';
import { stageScreenTex, archBannerTex, sideScreenTex, flagTex, COLORS } from './branding.js';
import { createCrowd } from './crowd.js';
import { buildModel, CARS } from '../../vehicle/cars.js';

const THEME_CAR = { main: ['aska', 'coupeGT'], dirt: ['trophy'], street: ['tora'], drift: ['rz7'], road: ['coupe'], xc: ['baja'], stunt: ['buggy'] };
const THEME_NAME = { main: 'Main Stage', dirt: 'Dirt Outpost', street: 'Night Market', drift: 'Drift Club', road: 'Road Club', xc: 'Cross Country Camp', stunt: 'Stunt Park' };

export function createSites(F) {
  const { G, world } = F;
  const SI = { list: [], byId: {} };
  const flagMat = makeFlagMat();
  const beamMat = makeBeamMat();
  const tStage = stageScreenTex(), tFlags = flagTex();

  for (const def of SITES) {
    const site = { ...def, def, built: false, open: false };
    // resolve: anchor + alternates; the entrance faces the authored compass heading or the nearest road, then a clear
    // footprint (the rotated site's world bounding box) is searched near the anchor
    let fp = null, yaw = 0;
    for (const p of [def.ll, ...(def.alt || [])]) {
      if (def.facing != null) { const a = def.facing * Math.PI / 180; yaw = Math.atan2(Math.sin(a), -Math.cos(a)); }
      else { const [ax, az] = ll(p[0], p[1]); const n = world.graph.nearestEdge(ax, az, 260); yaw = n ? Math.atan2(n.x - ax, n.z - az) : 0; }
      const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
      fp = findFootprint(world, p[0], p[1], c * def.w + sn * def.d, sn * def.w + c * def.d, { radius: def.kind === 'main' ? 90 : 160 });
      if (fp && fp.bad === 0) break;
    }
    if (!fp) { site.broken = true; SI.list.push(site); SI.byId[site.id] = site; continue; }
    site.x = fp.x; site.z = fp.z;
    if (def.facing == null) { const n = world.graph.nearestEdge(fp.x, fp.z, 260); if (n) yaw = Math.atan2(n.x - fp.x, n.z - fp.z); }
    site.yaw = yaw;
    site.y = world.groundAt(fp.x, fp.z, world.heightAt(fp.x, fp.z) + 3);
    const fr = frame(site.x, site.y, site.z, yaw);
    site.fr = fr;
    const hub = [fr.x(0, def.d / 2 - (def.kind === 'main' ? 9 : 5)), fr.z(0, def.d / 2 - (def.kind === 'main' ? 9 : 5))];
    site.hub = { x: hub[0], z: hub[1] };
    build(site);
    SI.list.push(site); SI.byId[site.id] = site;
  }

  // ---------------------------------------------------------------- builder
  function build(site) {
    const kit = new Kit(), fr = site.fr, col = site.color, main = site.kind === 'main';
    const gy = (lx, lz) => { const x = fr.x(lx, lz), z = fr.z(lx, lz); return world.groundAt(x, z, world.heightAt(x, z) + 3); };
    const at = (lx, ly, lz, extra = {}) => { const x = fr.x(lx, lz), z = fr.z(lx, lz); return { ...extra, x, y: gy(lx, lz) + ly, z, ry: fr.yaw + (extra.ry || 0) }; };
    const colliders = [];
    const solid = (lx, lz, hx, hz, h, ry = 0) => { const x = fr.x(lx, lz), z = fr.z(lx, lz), y = gy(lx, lz); colliders.push({ x, z, hx, hz, yaw: fr.yaw + ry, yMin: y - 2, yMax: y + h, kind: 'festival' }); };
    const screens = [];   // [{w,h, tex, t}] textured quads (merged per texture below)
    const beams = [];     // stage light positions (local)
    const lights = [];    // string light points (world)
    const flags = [];     // flag placements (world)
    const podiums = [];   // [{lx, lz, car}]
    const crowd = [];     // crowd spots (world)
    const W = site.w, D = site.d;
    const truss = (lx, lz, h) => { // square truss tower (4 chords + rungs)
      for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) kit.box('metal', 0.07, h, 0.07, '#c9ccd2', at(lx + a, h / 2, lz + b));
      for (let y = 0.6; y < h; y += 1.1) { kit.box('metal', 0.56, 0.05, 0.05, '#c9ccd2', at(lx, y, lz - 0.25)); kit.box('metal', 0.56, 0.05, 0.05, '#c9ccd2', at(lx, y, lz + 0.25)); kit.box('metal', 0.05, 0.05, 0.56, '#c9ccd2', at(lx - 0.25, y, lz)); kit.box('metal', 0.05, 0.05, 0.56, '#c9ccd2', at(lx + 0.25, y, lz)); }
    };
    const trussBeam = (lx0, lx1, y, lz) => {
      const L = Math.abs(lx1 - lx0), cx = (lx0 + lx1) / 2;
      for (const [a, b] of [[0, -0.25], [0, 0.25], [0.5, -0.25], [0.5, 0.25]]) kit.box('metal', L, 0.07, 0.07, '#c9ccd2', at(cx, y + a - 0.25, lz + b));
      for (let x = lx0; x <= lx1; x += 1.2) kit.box('metal', 0.05, 0.5, 0.05, '#c9ccd2', at(x, y, lz - 0.25));
    };
    const tent = (lx, lz, w, d, c1, c2 = '#f6f3ee', ry = 0) => {
      const h = 2.6;
      for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) kit.cyl('metal', 0.05, 0.05, h, '#d8dade', at(lx + a, h / 2, lz + b), 6);
      // peaked roof (4-sided pyramid) with stripes: two stacked pyramids for a two-tone look
      const roof = new THREE.ConeGeometry(Math.hypot(w, d) / 2, 1.8, 4, 1, true); roof.rotateY(Math.PI / 4); roof.scale(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414);
      kit.add('cloth', roof, c1, at(lx, h + 0.9, lz, { ry }));
      const valance = new THREE.BoxGeometry(w, 0.45, d); kit.add('cloth', valance, c2, at(lx, h - 0.1, lz, { ry }));
      kit.box('std', w * 0.9, 0.9, 0.5, '#2a2c34', at(lx, 0.45, lz + d / 2 - 0.4, { ry })); // counter
      solid(lx, lz, w / 2, d / 2, h + 1.8, ry);
    };
    const barrier = (lx0, lz0, lx1, lz1) => {
      const L = Math.hypot(lx1 - lx0, lz1 - lz0), n = Math.max(1, Math.round(L / 2.2)), ry = Math.atan2(lx1 - lx0, lz1 - lz0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, lx = lx0 + (lx1 - lx0) * t, lz = lz0 + (lz1 - lz0) * t;
        kit.box('metal', 0.06, 1.05, 2.1, '#9aa0aa', at(lx, 0.55, lz, { ry }));
        kit.box('metal', 0.04, 0.9, 1.9, '#6b717b', at(lx, 0.55, lz, { ry, sx: 0.6 }));
      }
      const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
      solid(cx, cz, 0.2, L / 2, 1.2, ry);
    };
    const flagLine = (lx0, lz0, lx1, lz1, step = 7) => {
      const L = Math.hypot(lx1 - lx0, lz1 - lz0), n = Math.max(1, Math.round(L / step));
      for (let i = 0; i <= n; i++) {
        const t = i / n, lx = lx0 + (lx1 - lx0) * t, lz = lz0 + (lz1 - lz0) * t;
        kit.cyl('metal', 0.045, 0.06, 6.2, '#e8e8ea', at(lx, 3.1, lz), 6);
        const p = at(lx, 3.4, lz);
        flags.push({ x: p.x, y: p.y, z: p.z, yaw: fr.yaw + Math.atan2(lx1 - lx0, lz1 - lz0) + Math.PI / 2, d: (i + flags.length) % 4 });
      }
    };
    const stringLights = (a, b, sag = 1.2, n = 16) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n, lx = a[0] + (b[0] - a[0]) * t, lz = a[2] + (b[2] - a[2]) * t;
        const y0 = gy(a[0], a[2]) + a[1], y1 = gy(b[0], b[2]) + b[1];
        lights.push([fr.x(lx, lz), y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag, fr.z(lx, lz)]);
      }
    };
    const podium = (lx, lz, car) => {
      kit.cyl('std', 3.3, 3.5, 0.55, '#1b1c24', at(lx, 0.27, lz), 28);
      kit.cyl('glow', 3.36, 3.36, 0.08, col, at(lx, 0.5, lz), 28);
      podiums.push({ lx, lz, car });
      solid(lx, lz, 3, 3, 1.2);
    };
    const arch = (hw, lz, h, text) => {
      for (const s of [-1, 1]) {
        kit.box('std', 1.4, h, 1.4, COLORS.NAVY, at(s * hw, h / 2, lz));
        kit.box('glow', 0.25, h - 1, 0.3, col, at(s * (hw - 0.72), h / 2, lz + 0.72));
        kit.box('glow', 0.25, h - 1, 0.3, col, at(s * (hw - 0.72), h / 2, lz - 0.72));
        solid(s * hw, lz, 0.8, 0.8, h);
      }
      kit.box('std', hw * 2 + 1.4, h * 0.34, 0.8, COLORS.NAVY, at(0, h - h * 0.17, lz));
      screens.push({ tex: archBannerTex(text, col), w: hw * 2 + 0.6, h: h * 0.3, p: at(0, h - h * 0.17, lz + 0.42), ry: 0 });
      screens.push({ tex: archBannerTex(text, col), w: hw * 2 + 0.6, h: h * 0.3, p: at(0, h - h * 0.17, lz - 0.42), ry: Math.PI });
    };

    if (main) {
      // ---- main stage (back, -Z), LED wall, truss roof, speakers
      const sz = -D / 2 + 9;
      kit.box('std', 24, 3.6, 10, '#15161c', at(0, -0.3, sz));
      kit.box('glow', 24, 0.12, 0.12, col, at(0, 1.5, sz + 5));
      solid(0, sz, 12, 5, 3);
      screens.push({ tex: tStage, w: 19, h: 7.4, p: at(0, 6.4, sz - 3.6), ry: 0, main: true });
      kit.box('std', 19.8, 8, 0.5, '#0c0d12', at(0, 6.3, sz - 3.95));
      for (const s of [-1, 1]) { truss(s * 12.3, sz - 3, 14); truss(s * 12.3, sz + 4.2, 14); }
      trussBeam(-12.3, 12.3, 14, sz - 3); trussBeam(-12.3, 12.3, 14, sz + 4.2);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) kit.box('std', 1.1, 0.6, 0.9, '#1a1b20', at(s * 10.6, 12.6 - i * 0.62, sz + 4.6, { rx: -0.06 * i }));
        kit.box('std', 2.4, 2.2, 2.2, '#1a1b20', at(s * 13.8, 1.1, sz + 3)); // subs
        screens.push({ tex: sideScreenTex('LIVE', col), w: 4.4, h: 4.4, p: at(s * 17.2, 6, sz + 1.6), ry: 0 });
        truss(s * 17.2, sz + 1.2, 9);
      }
      for (let i = 0; i < 8; i++) { const lx = -10.5 + i * 3; kit.cyl('metal', 0.22, 0.28, 0.5, '#23252c', at(lx, 13.5, sz + 4.2), 8); beams.push([lx, 13.3, sz + 4.2]); }
      // crowd pit + barriers
      barrier(-12, sz + 6.5, 12, sz + 6.5);
      barrier(-12, sz + 6.5, -12, sz + 24); barrier(12, sz + 6.5, 12, sz + 24);
      for (let r = 0; r < 9; r++) for (let c = 0; c < 22; c++) {
        const lx = -11 + c * 1.02 + ((r % 2) * 0.5) + (Math.sin(r * 7 + c * 3) * 0.25), lz = sz + 7.6 + r * 1.9 + Math.cos(r * 5 + c) * 0.3;
        if (Math.random() < 0.12) continue;
        const p = at(lx, 0, lz); crowd.push({ x: p.x, y: p.y, z: p.z, yaw: fr.yaw });
      }
      // FOH + delay towers
      tent(0, sz + 28, 5, 4, COLORS.NAVY, col);
      truss(-12.5, sz + 26, 8); truss(12.5, sz + 26, 8);
      beams.push([-12.5, 8, sz + 26], [12.5, 8, sz + 26]);
      // vendor tents along the sides
      const tc = [col, COLORS.GOLD, '#f6f3ee'];
      [-22, -8, 6].forEach((lz, i) => { tent(-W / 2 + 5, lz, 6, 6, tc[i % 3]); tent(W / 2 - 5, lz, 6, 6, tc[(i + 1) % 3]); });
      // podiums + hero cars
      podium(-15, D / 2 - 16, THEME_CAR.main[0]); podium(15, D / 2 - 16, THEME_CAR.main[1]);
      // string lights over the crowd
      stringLights([-W / 2 + 5, 4.5, -22], [0, 7, sz + 18]); stringLights([W / 2 - 5, 4.5, -22], [0, 7, sz + 18]);
      stringLights([-W / 2 + 5, 4.5, 6], [W / 2 - 5, 4.5, 6], 1.6, 24);
      // entrance arch + perimeter flags
      arch(8, D / 2 - 1, 10, 'Marina Green');
      flagLine(-W / 2 + 1, -D / 2 + 1, -W / 2 + 1, D / 2 - 4); flagLine(W / 2 - 1, -D / 2 + 1, W / 2 - 1, D / 2 - 4); flagLine(-W / 2 + 1, -D / 2 + 1, W / 2 - 1, -D / 2 + 1, 9);
    } else {
      // ---- outpost: DJ booth / mini stage, tents, podium, themed props
      const sz = -D / 2 + 5;
      kit.box('std', 10, 2.6, 5, '#15161c', at(0, -0.4, sz));
      kit.box('glow', 10, 0.1, 0.1, col, at(0, 0.9, sz + 2.5));
      kit.box('std', 3, 1.1, 1, '#22242c', at(0, 1.45, sz + 0.8));
      screens.push({ tex: sideScreenTex(THEME_NAME[site.theme] || 'LIVE', col), w: 3.6, h: 3.6, p: at(0, 3.6, sz - 2), ry: 0 });
      screens.push({ tex: archBannerTex(site.place, col), w: 8, h: 1.5, p: at(0, 6.3, sz - 2), ry: 0 });
      for (const s of [-1, 1]) truss(s * 4.8, sz - 1.8, 7);
      trussBeam(-4.8, 4.8, 7, sz - 1.8);
      beams.push([-3, 6.8, sz - 1.8], [0, 6.8, sz - 1.8], [3, 6.8, sz - 1.8]);
      solid(0, sz, 5, 2.5, 3);
      tent(-W / 2 + 5, -2, 5, 5, col); tent(W / 2 - 5, -2, 5, 5, COLORS.GOLD);
      podium(-W / 2 + 8, D / 2 - 8, THEME_CAR[site.theme]?.[0] || 'coupe');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
        if (Math.random() < 0.18) continue;
        const p = at(-5 + c * 1.05 + (r % 2) * 0.5, 0, sz + 4.2 + r * 1.7); crowd.push({ x: p.x, y: p.y, z: p.z, yaw: fr.yaw });
      }
      stringLights([-W / 2 + 5, 3.8, -2], [W / 2 - 5, 3.8, -2], 1.1, 18);
      arch(6, D / 2 - 1, 7.5, site.place);
      flagLine(-W / 2 + 1, -D / 2 + 1, -W / 2 + 1, D / 2 - 4, 8); flagLine(W / 2 - 1, -D / 2 + 1, W / 2 - 1, D / 2 - 4, 8);
      themeProps(site.theme, kit, at, solid, W, D, col);
    }

    // ---- merge + dress
    const mats = {
      std: std({ roughness: 0.7 }), metal: std({ metalness: 0.75, roughness: 0.35 }), cloth: std({ roughness: 0.9, side: THREE.DoubleSide }), glow: glowMat(),
    };
    const group = kit.build(mats, { shadows: { std: true, cloth: true, metal: false } });
    group.name = 'festival-site-' + site.id;
    const glowM = mats.glow;
    // textured screens: one mesh per texture (few)
    const screenMats = [];
    for (const s of screens) {
      const m = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), m);
      q.position.set(s.p.x, s.p.y, s.p.z); q.rotation.y = s.p.ry + s.ry;
      group.add(q); screenMats.push({ m, main: !!s.main });
    }
    // flags (instanced, waving)
    let flagMesh = null;
    if (flags.length) {
      const fg = new THREE.PlaneGeometry(1.1, 2.6, 6, 1); fg.translate(0.55, 0, 0);
      const dAttr = new THREE.InstancedBufferAttribute(new Float32Array(flags.length), 1);
      fg.setAttribute('aDesign', dAttr);
      flagMesh = new THREE.InstancedMesh(fg, flagMat.material, flags.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      flags.forEach((f, i) => { q.setFromAxisAngle(up, f.yaw); m4.compose(new THREE.Vector3(f.x, f.y + 1.3, f.z), q, new THREE.Vector3(1, 1, 1)); flagMesh.setMatrixAt(i, m4); dAttr.array[i] = f.d; });
      flagMesh.castShadow = true; flagMesh.computeBoundingSphere();
      group.add(flagMesh);
    }
    // string lights (instanced glow bulbs)
    let bulbs = null;
    if (lights.length) {
      bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false }), lights.length);
      const m4 = new THREE.Matrix4();
      lights.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); bulbs.setMatrixAt(i, m4); });
      bulbs.computeBoundingSphere(); group.add(bulbs);
    }
    // stage beams (instanced cones, night only)
    let beamMesh = null;
    const beamPts = beams.map(([lx, ly, lz]) => { const x = fr.x(lx, lz), z = fr.z(lx, lz); return new THREE.Vector3(x, gy(lx, lz) + ly, z); });
    if (beamPts.length) { beamMesh = new THREE.InstancedMesh(beamMat.geo, beamMat.material, beamPts.length); beamMesh.frustumCulled = false; beamMesh.renderOrder = 7; group.add(beamMesh); }
    // podium cars: built the first time the player comes near (car models are the expensive part)
    const cars = [];
    site.buildCars = () => {
      site.buildCars = null;
      for (const p of podiums) {
        const key = CARS[p.car] ? p.car : 'coupe';
        try {
          const vis = buildModel(CARS[key].model, { paint: site.kind === 'main' ? (cars.length ? 0xffc247 : 0xff2e7e) : new THREE.Color(col).getHex(), seed: 7 + cars.length });
          const x = fr.x(p.lx, p.lz), z = fr.z(p.lx, p.lz), y = gy(p.lx, p.lz) + 0.55;
          vis.root.position.set(x, y, z); vis.root.rotation.y = fr.yaw + 0.6;
          vis.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
          group.add(vis.root); cars.push({ vis, spin: 0.22 * (cars.length % 2 ? -1 : 1) });
        } catch (e) { console.warn('[festival] podium car', e); }
      }
    };
    // crowd
    const cr = crowd.length ? createCrowd(crowd, { seed: site.id.length }) : null;
    if (cr) group.add(cr.mesh);
    G.scene.add(group);
    // colliders only once the site is open (outposts are fenced off before)
    site.colliders = colliders;
    Object.assign(site, { group, glowM, screenMats, flagMesh, bulbs, beamMesh, beamPts, cars, crowd: cr, built: true });
    group.visible = false;
  }

  function themeProps(theme, kit, at, solid, W, D, col) {
    const side = W / 2 - 6, front = D / 2 - 8;
    if (theme === 'dirt' || theme === 'xc') {
      for (let i = 0; i < 6; i++) { kit.cyl('cloth', 0.75, 0.75, 1.2, '#d8b56a', at(side - (i % 3) * 1.7, 0.6 + Math.floor(i / 3) * 1.2, front, { rz: Math.PI / 2 }), 10); }
      solid(side - 1.7, front, 2.8, 0.9, 2.4);
      for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) kit.cyl('std', 0.45, 0.45, 0.28, '#17171a', at(side - 6 + i * 1.0, 0.14 + k * 0.28, front + 3), 12);
      if (theme === 'xc') { const a = new THREE.TorusGeometry(4, 0.45, 10, 24, Math.PI); kit.add('cloth', a, col, at(0, 0, front + 6)); }
    } else if (theme === 'street') {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { kit.cyl('metal', 0.06, 0.06, 4.4, '#222', at(s * side, 2.2, -8 + i * 8), 6); kit.box('glow', 0.14, 2.6, 0.14, i % 2 ? '#4fd2ff' : '#ff2e7e', at(s * side, 3.1, -8 + i * 8)); }
      kit.box('std', 6.5, 2.8, 2.4, '#ffc247', at(side - 2, 1.6, front)); kit.box('std', 6.3, 0.9, 2.3, '#1b1c22', at(side - 2, 0.45, front));
      kit.box('glow', 3, 0.5, 0.05, '#ff2e7e', at(side - 2, 2.4, front + 1.22));
      solid(side - 2, front, 3.3, 1.3, 3);
    } else if (theme === 'drift' || theme === 'stunt') {
      const cc = ['#b43a2c', '#2d5f8a', '#d99a2b', '#3d6b45'];
      for (let i = 0; i < 3; i++) { kit.box('std', 6.1, 2.6, 2.44, cc[i % 4], at(side - 1, 1.3 + (i === 2 ? 2.6 : 0), front - (i === 2 ? 1.2 : i * 2.6))); }
      solid(side - 1, front - 1.3, 3.1, 2.6, 5.4);
      for (let i = 0; i < 8; i++) kit.cyl('std', 0.45, 0.45, 0.28, '#17171a', at(-side + (i % 4) * 0.95, 0.14 + Math.floor(i / 4) * 0.28, front + 2), 12);
      if (theme === 'stunt') { const r = new THREE.BoxGeometry(5, 0.3, 9); kit.add('std', r, '#8a8f99', at(0, 1.2, front + 3, { rx: 0.25 })); solid(0, front + 3, 2.5, 4.5, 2.4); }
    } else if (theme === 'road') {
      for (let k = 0; k < 4; k++) kit.box('std', 12, 0.5, 1.2, '#2a2c34', at(side - 6, 0.25 + k * 0.5, front - k * 1.2));
      kit.box('glow', 12, 0.08, 0.08, col, at(side - 6, 2.05, front - 4));
      solid(side - 6, front - 1.8, 6, 2.4, 2.2);
    }
  }

  // ---------------------------------------------------------------- open / close + per frame
  SI.setOpen = function (site, open) {
    if (!site.built || site.open === open) return;
    site.open = open;
    site.group.visible = open;
    if (open) for (const c of site.colliders) world.colliders.add(c);
    else for (const c of site.colliders) world.colliders.remove(c);
  };
  SI.refresh = function () {
    const ch = F.chapter(), on = F.enabled();
    for (const s of SI.list) {
      if (s.broken) continue;
      const open = on && ch >= s.chapter;
      SI.setOpen(s, open);
      F.markers.setVisible('site:' + s.id, on && open);
      F.markers.setVisible('site-lock:' + s.id, on && !open);
    }
  };
  // markers (site = beam + icon; locked outposts = map-only lock)
  for (const s of SI.list) {
    if (s.broken) continue;
    F.markers.add({ id: 'site:' + s.id, kind: s.kind === 'main' ? 'main' : 'outpost', icon: s.kind === 'main' ? 'site' : 'outpost', group: 'site', x: s.hub.x, z: s.hub.z,
      color: s.color, title: s.name, sub: s.kind === 'main' ? 'Campaign, Prize Spins, garage and fast travel' : `${s.place} · outpost`, meta: s.place, beamH: s.kind === 'main' ? 220 : 150, beamR: s.kind === 'main' ? 6 : 4.5,
      iconSize: s.kind === 'main' ? 9 : 7, iconH: s.kind === 'main' ? 20 : 12, iconRange: 900, fastTravel: true, visible: false, action: 'Fast travel', onSelect: ctx => F.select('site', s, ctx) });
    if (s.kind !== 'main') F.markers.add({ id: 'site-lock:' + s.id, kind: 'lock', icon: 'lock', group: 'site', x: s.hub.x, z: s.hub.z, color: '#6b717b', title: s.name,
      sub: `Opens in chapter ${s.chapter}: ${CHAPTERS[s.chapter]?.name || ''}`, beam: false, iconRange: 0, visible: false });
  }
  const cam = new THREE.Vector3();
  let t = 0;
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), be = new THREE.Euler(), bs = new THREE.Vector3(), bp = new THREE.Vector3();
  SI.update = function (dt) {
    t += dt;
    const night = G.env.night.value;
    cam.copy(G.camera.position);
    flagMat.uniforms.uTime.value = t;
    for (const s of SI.list) {
      if (!s.open) continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      const near = d < 650;
      s.group.visible = d < 3200;
      if (!s.group.visible) continue;
      s.glowM.color.setScalar(1 + night * 2.2);
      for (const sm of s.screenMats) sm.m.color.setScalar((sm.main ? 1.05 : 0.95) + night * (sm.main ? 1.2 : 0.8) + (sm.main ? Math.sin(t * 2.2) * 0.05 : 0));
      if (s.bulbs) { s.bulbs.visible = near; s.bulbs.material.color.setRGB(1, 0.94, 0.77).multiplyScalar(0.7 + night * 2.4); }
      if (s.crowd) { s.crowd.mesh.visible = d < 520; if (s.crowd.mesh.visible) s.crowd.update(dt, 0.4 + night * 0.6); }
      if (s.flagMesh) s.flagMesh.visible = d < 900;
      if (s.buildCars && d < 700) s.buildCars();
      for (const c of s.cars) { c.vis.root.visible = d < 500; if (c.vis.root.visible) c.vis.root.rotation.y += c.spin * dt; }
      // sweeping stage beams at night
      if (s.beamMesh) {
        const on = night > 0.25 && d < 1400;
        s.beamMesh.visible = on;
        if (on) {
          beamMat.material.uniforms.uAlpha.value = clamp((night - 0.25) * 2, 0, 1);
          for (let i = 0; i < s.beamPts.length; i++) {
            const p = s.beamPts[i];
            be.set(0.35 + Math.sin(t * 0.7 + i * 1.3) * 0.45, s.yaw + Math.PI + Math.sin(t * 0.45 + i * 0.9) * 0.9, 0, 'YXZ');
            bq.setFromEuler(be);
            bm.compose(bp.copy(p), bq, bs.set(1, 1, 1));
            s.beamMesh.setMatrixAt(i, bm);
          }
          s.beamMesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  };
  SI.nearestOpen = function (x, z) { let best = null, bd = Infinity; for (const s of SI.list) if (s.open) { const d = Math.hypot(s.hub.x - x, s.hub.z - z); if (d < bd) { bd = d; best = s; } } return best; };
  SI.main = () => SI.byId.main;
  void ll;
  return SI;
}

// waving flag material: 2x2 print atlas, per-instance design, sine wave growing toward the free edge
function makeFlagMat() {
  const tex = flagTex();
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
  material.onBeforeCompile = sh => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aDesign;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
        vMapUv = vMapUv * 0.5 + vec2(mod(aDesign, 2.0), 1.0 - floor(aDesign / 2.0) - 1.0) * 0.5 + vec2(0.0, 0.5);
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hbF = clamp(position.x / 1.1, 0.0, 1.0);
        float hbI = float(gl_InstanceID);
        transformed.z += sin(uTime * 3.4 + position.x * 3.0 + hbI * 1.7) * 0.28 * hbF + sin(uTime * 5.1 + position.y * 2.0 + hbI) * 0.06 * hbF;`);
  };
  return { material, uniforms };
}
// stage beam: an open cone hanging from the fixture (apex at the origin, pointing -Y), soft additive falloff
function makeBeamMat() {
  const geo = new THREE.CylinderGeometry(0.15, 3.2, 38, 18, 1, true); geo.translate(0, -19, 0); // apex at 0, cone extends down (-Y)
  const material = new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = -position.y / 38.0; vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        #endif
        vec3 n = normal;
        #ifdef USE_INSTANCING
        n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * wp; vV = normalize(-mv.xyz); vN = normalize(normalMatrix * n); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uAlpha; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = (1.0 - vY) * (1.0 - vY) * 0.16 * rim * uAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.95) * a, a); }`,
  });
  return { geo, material };
}
