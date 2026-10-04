// dev: ide: typed arrays reachable from the game objects, bytes by path (deduped by ArrayBuffer). __heapWalk(depth = 9)
window.__heapWalk = (maxD = 9, top = 30) => {
  const seenBuf = new WeakSet(), seen = new WeakSet(), agg = new Map();
  const add = (p, b) => { const k = p.split('.').slice(0, 4).join('.').replace(/\.\d+/g, '.#'); agg.set(k, (agg.get(k) || 0) + b); };
  const walk = (o, p, d) => {
    if (!o || typeof o !== 'object') return;
    if (ArrayBuffer.isView(o)) { if (!seenBuf.has(o.buffer)) { seenBuf.add(o.buffer); add(p, o.buffer.byteLength); } return; }
    if (o instanceof ArrayBuffer) { if (!seenBuf.has(o)) { seenBuf.add(o); add(p, o.byteLength); } return; }
    if (seen.has(o) || d > maxD || o instanceof Node || o === window) return; seen.add(o);
    if (o.isObject3D) { p = 'scene:' + (o.name || o.type); d = 0; }
    let keys; try { keys = o instanceof Map ? [...o.keys()] : Object.keys(o); } catch { return; }
    if (Array.isArray(o) && o.length > 2000 && typeof o[0] !== 'object') { add(p + '.[jsarray]', o.length * 8); return; }
    for (const k of keys.slice(0, 50000)) { let v; try { v = o instanceof Map ? o.get(k) : o[k]; } catch { continue; } if (v && typeof v === 'object') walk(v, p + '.' + (Array.isArray(o) || o instanceof Map ? '#' : String(k).slice(0, 20)), d + 1); }
  };
  walk(window.__scene, 'scene', 0); walk(window.__world, 'world', 0); walk(window.__G, 'G', 0);
  let tot = 0; for (const v of agg.values()) tot += v;
  return { totalMB: Math.round(tot / 1048576), heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576), top: [...agg].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => k + ' ' + Math.round(v / 1048576)) };
};
