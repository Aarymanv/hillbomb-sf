// World + map markers for everything the festival places.
// World: instanced light beams, ground rings and billboard icons (3 draw calls for every marker in the city).
// Map / minimap: registered with G.ui.markers when the UI shell provides it (checked lazily, so install order does not
// matter); otherwise exposed through the legacy G.blips() chain the current HUD / big map read.
import * as THREE from 'three';
import { iconAtlas, iconIndex } from './icons.js';

const BLIP_LETTER = { road: 'R', street: 'S', dirt: 'D', xc: 'X', drag: 'Q', drift: 'F', showcase: '★', story: '!', trap: 'T', zone: 'Z', danger: '!',
  driftzone: 'D', trail: 'B', board: 'B', boardft: 'F', barn: '?', house: 'H', site: 'H', outpost: 'O', checkpoint: '', finish: 'F', pickup: 'P', dropoff: 'D', target: '•', lock: '' };

export function createMarkers(G) {
  const scene = G.scene;
  const CAP_B = 128, CAP_I = 320;
  // ---------------------------------------------------------------- beams
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true); beamGeo.translate(0, 0.5, 0);
  const bCol = new THREE.InstancedBufferAttribute(new Float32Array(CAP_B * 4), 4); bCol.setUsage(THREE.DynamicDrawUsage);
  beamGeo.setAttribute('aCol', bCol);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv;
      void main(){ vUv = uv; vCol = aCol; vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: `uniform float uTime; varying vec4 vCol; varying vec2 vUv;
      void main(){ float y = vUv.y; float a = pow(1.0 - y, 1.5) * (0.62 + 0.22 * sin(y * 36.0 - uTime * 3.2)) * vCol.a;
      float edge = 1.0 - abs(vUv.x * 2.0 - 1.0); a *= 0.55 + 0.45 * edge; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a); }`,
  });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, CAP_B);
  beams.frustumCulled = false; beams.renderOrder = 6; beams.count = 0; beams.name = 'festival-beams';
  scene.add(beams);
  // ---------------------------------------------------------------- rings (ground)
  const ringGeo = new THREE.RingGeometry(0.78, 1, 48, 1); ringGeo.rotateX(-Math.PI / 2);
  const rCol = new THREE.InstancedBufferAttribute(new Float32Array(CAP_B * 4), 4); rCol.setUsage(THREE.DynamicDrawUsage);
  ringGeo.setAttribute('aCol', rCol);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv; void main(){ vUv = uv; vCol = aCol; vec4 p = vec4(position,1.0);
      #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: `uniform float uTime; varying vec4 vCol; varying vec2 vUv; void main(){ float a = vCol.a * (0.7 + 0.3 * sin(uTime * 4.0)); gl_FragColor = vec4(vCol.rgb * a, a); }`,
  });
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, CAP_B);
  rings.frustumCulled = false; rings.renderOrder = 6; rings.count = 0;
  scene.add(rings);
  // ---------------------------------------------------------------- icons (billboards, drawn over the world when near)
  const at = iconAtlas();
  const tex = new THREE.CanvasTexture(at.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const iconGeo = new THREE.PlaneGeometry(1, 1);
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(CAP_I * 4), 4); iCol.setUsage(THREE.DynamicDrawUsage);
  const iTile = new THREE.InstancedBufferAttribute(new Float32Array(CAP_I * 2), 2); iTile.setUsage(THREE.DynamicDrawUsage); // tile, size
  iconGeo.setAttribute('aCol', iCol); iconGeo.setAttribute('aTile', iTile);
  const iconMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uTiles: { value: at.tiles }, uMin: { value: 0.028 } }, transparent: true, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `attribute vec4 aCol; attribute vec2 aTile; uniform float uTiles; uniform float uMin; varying vec2 vUv; varying vec4 vCol; varying vec2 vQ;
      void main(){ vCol = aCol; vQ = position.xy * 2.0;
        vec3 c = vec3(0.0);
        #ifdef USE_INSTANCING
        c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        float d = max(1.0, -mv.z); float s = max(aTile.y, d * uMin);
        mv.xy += position.xy * s;
        float t = aTile.x; vec2 cell = vec2(mod(t, uTiles), floor(t / uTiles));
        vUv = (cell + vec2(position.x + 0.5, 0.5 - position.y)) / uTiles; vUv.y = 1.0 - vUv.y;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; varying vec2 vQ;
      void main(){ float r = length(vQ); if (r > 1.0 || vCol.a < 0.01) discard;
        float ring = smoothstep(0.84, 0.88, r); float disc = 1.0 - smoothstep(0.96, 1.0, r);
        vec3 base = mix(vCol.rgb, vec3(0.05), ring);
        float glyph = texture2D(uMap, vUv).a * (1.0 - ring);
        vec3 col = mix(base, vec3(0.06, 0.06, 0.08), glyph * 0.92);
        gl_FragColor = vec4(col, disc * vCol.a); }`,
  });
  const icons = new THREE.InstancedMesh(iconGeo, iconMat, CAP_I);
  icons.frustumCulled = false; icons.renderOrder = 50; icons.count = 0;
  scene.add(icons);
  const _m = new THREE.Matrix4(), _c = new THREE.Color();

  // ---------------------------------------------------------------- registry
  const list = [];         // all marker records
  const byId = new Map();
  let dirtyLayout = true, blips = [], blipsDirty = true, syncT = 0, filter = null;
  const M = { list, beams, rings, icons };

  M.add = function (o) {
    if (byId.has(o.id)) M.remove(o.id);
    const r = {
      id: o.id, kind: o.kind || 'event', x: o.x, z: o.z, y: o.y ?? G.world.groundAt(o.x, o.z, (o.yHint ?? G.world.heightAt(o.x, o.z)) + 3),
      color: new THREE.Color(o.color || '#ffc247'), css: o.color || '#ffc247', icon: o.icon || o.kind, title: o.title || '', sub: o.sub || '',
      beam: o.beam !== false, beamH: o.beamH ?? 110, beamR: o.beamR ?? 3.4, ringR: o.ringR ?? 9, iconSize: o.iconSize ?? 7, iconH: o.iconH ?? 9,
      iconRange: o.iconRange ?? 420, beamRange: o.beamRange ?? 4000, alpha: 0, visible: o.visible !== false, group: o.group || 'world',
      minimap: o.minimap !== false, bigmap: o.bigmap !== false, fastTravel: !!o.fastTravel, onSelect: o.onSelect || null, uiId: null, blip: o.blip ?? BLIP_LETTER[o.icon || o.kind] ?? '',
      edge: !!o.edge, priority: o.priority || 0, data: o.data || null, meta: o.meta || '', radius: o.radius || 0, done: !!o.done, action: o.action || '',
    };
    list.push(r); byId.set(r.id, r);
    dirtyLayout = true; blipsDirty = true;
    return r;
  };
  M.get = id => byId.get(id);
  M.update = function (id, patch) {
    const r = byId.get(id); if (!r) return;
    let moved = false;
    for (const k in patch) {
      if (k === 'color') { r.color.set(patch.color); r.css = patch.color; }
      else { if ((k === 'x' || k === 'z') && r[k] !== patch[k]) moved = true; r[k] = patch[k]; }
    }
    if (moved && patch.y === undefined) r.y = G.world.groundAt(r.x, r.z, G.world.heightAt(r.x, r.z) + 3);
    dirtyLayout = true; blipsDirty = true;
    if (r.uiId != null) { try { G.ui?.markers?.update?.(r.uiId, uiPatch(patch)); } catch { /* ui shell busy */ } }
  };
  M.remove = function (id) {
    const r = byId.get(id); if (!r) return;
    byId.delete(id); list.splice(list.indexOf(r), 1);
    if (r.uiId != null) { try { G.ui?.markers?.remove?.(r.uiId); } catch { /* ignore */ } }
    dirtyLayout = true; blipsDirty = true;
  };
  M.setVisible = (id, v) => { const r = byId.get(id); if (r && r.visible !== v) { r.visible = v; dirtyLayout = true; blipsDirty = true; pushVis(r); } };
  // filter(r) -> bool decides what is shown (activity mode hides the open world)
  M.setFilter = fn => { filter = fn; dirtyLayout = true; blipsDirty = true; for (const r of list) pushVis(r); };
  const shown = r => r.visible && (!filter || filter(r));
  function pushVis(r) { if (r.uiId != null) { const h = !shown(r); if (r._uiHidden !== h) { r._uiHidden = h; try { G.ui?.markers?.update?.(r.uiId, { hidden: h }); } catch { /* ignore */ } } } }
  function uiPatch(p) { const o = {}; for (const k of ['x', 'z', 'title', 'sub', 'color', 'fastTravel', 'meta', 'done', 'radius', 'kind']) if (k in p) o[k] = p[k]; if ('visible' in p) o.hidden = !p.visible; return o; }

  // ---------------------------------------------------------------- UI shell sync (lazy)
  function syncUI() {
    const um = G.ui?.markers;
    if (!um?.add) return false;
    for (const r of list) {
      if (r.uiId != null || (!r.minimap && !r.bigmap)) continue;
      try {
        const o = { id: 'fest:' + r.id, kind: r.kind, x: r.x, z: r.z, title: r.title, sub: r.sub, color: r.css, minimap: r.minimap, bigmap: r.bigmap,
          fastTravel: r.fastTravel, edge: r.edge, hidden: !shown(r), done: !!r.done };
        if (r.meta) o.meta = r.meta;
        if (r.radius) o.radius = r.radius;
        if (r.onSelect) { o.onSelect = (m, ctx) => r.onSelect(ctx, m); if (r.action) o.action = r.action; }
        r.uiId = um.add(o) ?? ('fest:' + r.id); r._uiHidden = o.hidden;
      } catch (e) { console.warn('[festival] ui.markers.add', e); return false; }
    }
    return true;
  }
  M.usingUI = () => !!G.ui?.markers?.add;

  // ---------------------------------------------------------------- legacy blips (current HUD minimap + big map)
  const prevBlips = G.blips;
  G.blips = () => {
    const out = prevBlips ? prevBlips() : [];
    if (M.usingUI()) return out;
    if (blipsDirty) {
      blipsDirty = false; blips = [];
      for (const r of list) if (shown(r) && (r.minimap || r.bigmap)) blips.push({ x: r.x, z: r.z, type: r.kind === 'checkpoint' ? 'checkpoint' : r.kind === 'rival' ? 'car' : r.kind === 'target' ? 'car' : 'event', color: r.css, icon: r.blip, edge: r.edge });
    }
    for (const b of blips) out.push(b);
    return out;
  };

  // ---------------------------------------------------------------- per frame
  const bList = [], iList = [];
  M.update3D = function (dt) {
    beamMat.uniforms.uTime.value += dt; ringMat.uniforms.uTime.value += dt;
    syncT -= dt; if (syncT <= 0) { syncT = 0.5; syncUI(); }
    const cam = G.camera.position;
    if (dirtyLayout) {
      dirtyLayout = false; bList.length = 0; iList.length = 0;
      for (const r of list) { if (!shown(r)) continue; if (r.beam && bList.length < CAP_B) bList.push(r); if (r.icon && iList.length < CAP_I) iList.push(r); }
      for (let i = 0; i < bList.length; i++) {
        const r = bList[i];
        _m.makeScale(r.beamR, r.beamH, r.beamR).setPosition(r.x, r.y, r.z); beams.setMatrixAt(i, _m);
        _m.makeScale(r.ringR, 1, r.ringR).setPosition(r.x, r.y + 0.25, r.z); rings.setMatrixAt(i, _m);
      }
      for (let i = 0; i < iList.length; i++) {
        const r = iList[i];
        _m.makeTranslation(r.x, r.y + r.iconH, r.z); icons.setMatrixAt(i, _m);
        iTile.array[i * 2] = iconIndex(r.icon); iTile.array[i * 2 + 1] = r.iconSize;
      }
      beams.count = rings.count = bList.length; icons.count = iList.length;
      beams.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = icons.instanceMatrix.needsUpdate = true; iTile.needsUpdate = true;
    }
    for (let i = 0; i < bList.length; i++) {
      const r = bList[i], d = Math.hypot(r.x - cam.x, r.z - cam.z);
      // subtle up close, bright across the city, gone past its range
      const a = (0.14 + 0.62 * smooth(d, 30, 320)) * (1 - smooth(d, r.beamRange * 0.8, r.beamRange));
      bCol.array[i * 4] = r.color.r; bCol.array[i * 4 + 1] = r.color.g; bCol.array[i * 4 + 2] = r.color.b; bCol.array[i * 4 + 3] = a;
      rCol.array[i * 4] = r.color.r; rCol.array[i * 4 + 1] = r.color.g; rCol.array[i * 4 + 2] = r.color.b; rCol.array[i * 4 + 3] = 0.9 * (1 - smooth(d, 250, 400));
    }
    for (let i = 0; i < iList.length; i++) {
      const r = iList[i], d = Math.hypot(r.x - cam.x, r.z - cam.z);
      const a = (1 - smooth(d, r.iconRange * 0.75, r.iconRange)) * smooth(d, 4, 12);
      _c.copy(r.color);
      iCol.array[i * 4] = _c.r; iCol.array[i * 4 + 1] = _c.g; iCol.array[i * 4 + 2] = _c.b; iCol.array[i * 4 + 3] = a;
    }
    bCol.needsUpdate = rCol.needsUpdate = iCol.needsUpdate = true;
  };
  M.setWorldVisible = v => { beams.visible = rings.visible = icons.visible = v; };
  return M;
}
function smooth(x, a, b) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
