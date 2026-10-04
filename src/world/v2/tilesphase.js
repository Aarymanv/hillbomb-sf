// (perf r3 10/4) Google tiles update spread over frames. TilesRendererBase.update() runs the whole traversal in one
// call (4-12 ms on our city: markUsedTiles ~40 %, toggleTiles ~35 %, queue / LRU / plugin hooks the rest); run every 3rd
// frame it was the p95 frame. Here one update is a cycle run as a generator, ~1 ms of it per frame:
//   A  plugins' doTilesNeedUpdate, 'update-before', stats reset, frameCount++, prepareForTraversal, markUsedTiles (sliced)
//   B  markUsedSetLeaves + markVisibleTiles, toggleTiles (sliced: tiles shown / hidden as it goes)
//   C  LRU used-set hand-over, removeUnusedPendingTiles, download requests, scheduleUnload, 'update-after'
// The traversal functions are a copy of 3d-tiles-renderer 0.5.3 src/core/renderer/tiles/traverseFunctions.js (MIT,
// NASA-AMMOS/3DTilesRendererJS); the sliced passes yield every 16 tiles once the frame's slice is spent. Bookkeeping
// difference: the library marks every tile of the previous traversal unused in the LRU cache at the START of update();
// with frames in between, an unload pass (scheduled by tile loads) could then evict tiles that are still on screen. So
// the previous used set stays marked until C, where the tiles not used by this traversal are released.
import { LOADED, FAILED, UNLOADED } from '3d-tiles-renderer';

const viewErrorTarget = { inView: false, error: Infinity, distanceFromCamera: Infinity };
// TilesRendererBase.calculateTileViewErrorWithPlugin without its allocations (invokeAllPlugins copies the plugin list
// and builds a closure + a pending array per tile: ~8 MB/s of garbage while driving); same logic, the region plugins
// (plugins with calculateTileViewError other than the renderer) are listed once per traversal in viewPlugins
const regionTarget = { inView: true, error: 0, distance: Infinity };
let viewPlugins = [];
function viewError(r, tile, target) {
  r.calculateTileViewError(tile, target);
  const { errorFalloff, errorFalloffDensity } = r;
  if (errorFalloff > 0 && Number.isFinite(target.distanceFromCamera)) { const f = target.distanceFromCamera * errorFalloffDensity; target.error -= errorFalloff * (1 - Math.exp(-f * f)); }
  let inRegion = null, inRegionError = 0, inRegionDistance = Infinity;
  for (let i = 0; i < viewPlugins.length; i++) {
    regionTarget.inView = true; regionTarget.error = 0; regionTarget.distance = Infinity;
    if (viewPlugins[i].calculateTileViewError(tile, regionTarget)) {
      if (inRegion === null) inRegion = true;
      inRegion = inRegion && regionTarget.inView;
      if (regionTarget.inView) { inRegionDistance = Math.min(inRegionDistance, regionTarget.distance); inRegionError = Math.max(inRegionError, regionTarget.error); }
    }
  }
  if (target.inView && inRegion !== false) { target.error = Math.max(target.error, inRegionError); target.distanceFromCamera = Math.min(target.distanceFromCamera, inRegionDistance); }
  else if (inRegion) { target.inView = true; target.error = inRegionError; target.distanceFromCamera = inRegionDistance; }
  else target.inView = false;
}
const isDownloadFinished = v => v === LOADED || v === FAILED;
const isProcessed = tile => Boolean(tile.traversal);
const isUsedThisFrame = (tile, frameCount) => isProcessed(tile) && tile.traversal.lastFrameVisited === frameCount && tile.traversal.used;
function areChildrenProcessed(tile) {
  const { children } = tile;
  const childrenReady = children.length === 0 || isProcessed(children[children.length - 1]);
  const contentReady = !tile.internal.hasUnrenderableContent || isDownloadFinished(tile.internal.loadingState);
  return childrenReady && contentReady;
}
const canUnconditionallyRefine = tile => tile.traversal.unconditionallyRefine;
function resetFrameState(tile, renderer, computeViewError = true) {
  if (!isProcessed(tile)) return;
  renderer.ensureChildrenArePreprocessed(tile);
  const tr = tile.traversal;
  if (tr.lastFrameVisited !== renderer.frameCount) {
    tr.wasInFrustum = tr.inFrustum; tr.wasSetActive = tr.active; tr.wasSetVisible = tr.visible; tr.usedLastFrame = tr.used;
    tr.lastFrameVisited = renderer.frameCount;
    tr.used = false; tr.inFrustum = false; tr.isLeaf = false; tr.visible = false; tr.active = false; tr.error = Infinity; tr.distanceFromCamera = Infinity;
    tr.allChildrenReady = false; tr.allChildrenLoaded = false; tr.kicked = false; tr.allUsedChildrenProcessed = false;
    if (computeViewError) {
      viewError(renderer, tile, viewErrorTarget);
      tr.inFrustum = viewErrorTarget.inView; tr.error = viewErrorTarget.error; tr.distanceFromCamera = viewErrorTarget.distanceFromCamera;
    }
    tr.unconditionallyRefine = tile.internal.hasUnrenderableContent;
    if (!tr.unconditionallyRefine) {
      let p = tile.parent;
      while (p && p.traversal.unconditionallyRefine) p = p.parent;
      if (p && p.geometricError <= tile.geometricError) tr.unconditionallyRefine = true;
    }
  }
}
function recursivelyMarkUsed(tile, renderer, cacheOnly = false) {
  resetFrameState(tile, renderer);
  if (cacheOnly) renderer.markTileUsed(tile); else tile.traversal.used = true;
  if (canUnconditionallyRefine(tile) && areChildrenProcessed(tile)) for (const c of tile.children) recursivelyMarkUsed(c, renderer, cacheOnly);
}
function recursivelyMarkPreviouslyUsed(tile, renderer) {
  resetFrameState(tile, renderer);
  if (tile.traversal.usedLastFrame) {
    tile.traversal.used = true;
    if (tile.traversal.wasSetActive) tile.traversal.active = true;
    if ((!tile.traversal.active || canUnconditionallyRefine(tile)) && areChildrenProcessed(tile)) for (const c of tile.children) recursivelyMarkPreviouslyUsed(c, renderer);
  }
}
function canTraverse(tile, renderer) {
  if (tile.traversal.error <= renderer.errorTarget && !canUnconditionallyRefine(tile)) return false;
  if (renderer.maxDepth > 0 && tile.internal.depth + 1 >= renderer.maxDepth) return false;
  if (!areChildrenProcessed(tile)) return false;
  return true;
}
function kickActiveChildren(tile, renderer) {
  for (const c of tile.children) {
    if (isUsedThisFrame(c, renderer.frameCount)) {
      if (c.traversal.active) { c.traversal.kicked = true; c.traversal.active = false; }
      kickActiveChildren(c, renderer);
    }
  }
}
const isChildReady = tile => !canUnconditionallyRefine(tile) && (!tile.internal.hasContent || isDownloadFinished(tile.internal.loadingState));
function markUsedSetLeaves(tile, renderer) {
  const fc = renderer.frameCount;
  if (!isUsedThisFrame(tile, fc)) return;
  const children = tile.children;
  let anyChildrenUsed = false;
  for (const c of children) anyChildrenUsed = anyChildrenUsed || isUsedThisFrame(c, fc);
  if (!anyChildrenUsed) tile.traversal.isLeaf = true;
  else {
    for (const c of children) markUsedSetLeaves(c, renderer);
    let allChildrenLoaded = true;
    for (const c of children) {
      if (isUsedThisFrame(c, fc)) {
        const childCanDisplay = !canUnconditionallyRefine(c);
        const childContentReady = !c.internal.hasContent || isDownloadFinished(c.internal.loadingState);
        if (!((childCanDisplay && childContentReady) || c.traversal.allChildrenLoaded)) allChildrenLoaded = false;
      }
    }
    tile.traversal.allChildrenLoaded = allChildrenLoaded;
  }
  let allUsedChildrenProcessed = true;
  for (const c of children) if (isUsedThisFrame(c, fc) && !c.traversal.allUsedChildrenProcessed) allUsedChildrenProcessed = false;
  tile.traversal.allUsedChildrenProcessed = allUsedChildrenProcessed && areChildrenProcessed(tile);
}
function markVisibleTiles(tile, renderer) {
  if (!isUsedThisFrame(tile, renderer.frameCount)) return;
  const children = tile.children;
  if (tile.refine === 'REPLACE' && renderer.loadAncestors && !tile.traversal.allChildrenLoaded && !canUnconditionallyRefine(tile)) tile.traversal.isLeaf = true;
  if (tile.traversal.isLeaf) {
    if (!canUnconditionallyRefine(tile)) {
      tile.traversal.active = true;
      if (areChildrenProcessed(tile) && tile.internal.hasContent && !isDownloadFinished(tile.internal.loadingState)) for (const c of children) recursivelyMarkPreviouslyUsed(c, renderer);
    }
    return;
  }
  let allChildrenReady = children.length > 0;
  for (const c of children) {
    markVisibleTiles(c, renderer);
    if (isUsedThisFrame(c, renderer.frameCount)) {
      const childIsReady = c.traversal.active && isChildReady(c);
      if (!childIsReady && !c.traversal.allChildrenReady) allChildrenReady = false;
    }
  }
  tile.traversal.allChildrenReady = allChildrenReady;
  if (tile.refine === 'REPLACE' && !allChildrenReady && tile.traversal.wasSetActive && isChildReady(tile)) { tile.traversal.active = true; kickActiveChildren(tile, renderer); }
}
// (perf r3) time-sliced versions of the two heavy passes: they yield (to the next frame) when the slice's deadline has
// passed, checked every 16 tiles. Same logic as the library's markUsedTiles / toggleTiles.
let deadline = Infinity, tick = 0;
const toggles = [];
function applyToggles(renderer) {
  for (let i = 0; i < toggles.length; i += 3) {
    const tile = toggles[i], k = toggles[i + 1], v = toggles[i + 2];
    if (k === 0) renderer.invokeOnePlugin(p => p.setTileActive && p.setTileActive(tile, v));
    else if (k === 1) renderer.invokeOnePlugin(p => p.setTileVisible && p.setTileVisible(tile, v));
    else renderer.invokeOnePlugin(p => p.setEmptyTileVisible && p.setEmptyTileVisible(tile, v));
  }
  toggles.length = 0;
}
function* markUsedTilesG(tile, renderer) {
  if ((++tick & 15) === 0 && performance.now() > deadline) yield;
  resetFrameState(tile, renderer);
  if (!tile.traversal.inFrustum) return;
  const parent = tile.parent;
  if (parent && parent.refine === 'ADD' && tile.geometricError > 0 && tile.traversal.error * (parent.geometricError / tile.geometricError) <= renderer.errorTarget) return;
  if (!canTraverse(tile, renderer)) { tile.traversal.used = true; return; }
  let anyChildrenUsed = false, anyChildrenInFrustum = false;
  const children = tile.children;
  for (let i = 0, l = children.length; i < l; i++) {
    const c = children[i];
    yield* markUsedTilesG(c, renderer);
    anyChildrenUsed = anyChildrenUsed || isUsedThisFrame(c, renderer.frameCount);
    anyChildrenInFrustum = anyChildrenInFrustum || c.traversal.inFrustum;
  }
  if (tile.refine === 'REPLACE' && !anyChildrenInFrustum && children.length !== 0) {
    tile.traversal.inFrustum = false;
    renderer.markTileUsed(tile);
    for (const c of children) recursivelyMarkUsed(c, renderer, true);
    return;
  }
  tile.traversal.used = true;
  if (tile.refine === 'REPLACE' && anyChildrenUsed && (renderer.loadSiblings || renderer.loadAncestors)) for (const c of children) recursivelyMarkUsed(c, renderer);
}
function* toggleTilesG(tile, renderer) {
  if ((++tick & 15) === 0 && performance.now() > deadline) yield;
  resetFrameState(tile, renderer, false);
  const isUsed = isUsedThisFrame(tile, renderer.frameCount);
  const tr = tile.traversal, it = tile.internal;
  if (isUsed) {
    if (it.hasUnrenderableContent) { renderer.markTileUsed(tile); renderer.queueTileForDownload(tile); }
    if (it.hasRenderableContent && tile.refine === 'ADD') tr.active = true;
    if ((tr.active || tr.kicked) && it.hasContent) {
      renderer.markTileUsed(tile);
      if (tr.allUsedChildrenProcessed) renderer.queueTileForDownload(tile);
      if (it.loadingState !== LOADED) tr.active = false;
    }
    if (renderer.loadAncestors && it.hasContent) { renderer.markTileUsed(tile); renderer.queueTileForDownload(tile); }
    if (it.virtualChildCount > 0 && it.hasContent) renderer.markTileUsed(tile);
    tr.visible = it.hasRenderableContent && tr.active && tr.inFrustum && it.loadingState === LOADED;
    renderer.stats.used++;
    if (tr.inFrustum) renderer.stats.inFrustum++;
  }
  if (isUsed || isProcessed(tile) && tr.usedLastFrame) {
    let setActive = false, setVisible = false;
    if (isUsed) { setActive = tr.active; setVisible = renderer.displayActiveTiles ? tr.active || tr.visible : tr.visible; }
    else resetFrameState(tile, renderer, false);
    if (it.hasRenderableContent && it.loadingState === LOADED) {
      if (setActive) renderer.stats.active++;
      if (setVisible) renderer.stats.visible++;
      // the scene changes are queued and applied together at the end of the pass (a parent hidden in one slice and its
      // children shown in the next would leave a hole for a frame)
      if (tr.wasSetActive !== setActive) toggles.push(tile, 0, setActive);
      if (tr.wasSetVisible !== setVisible) toggles.push(tile, 1, setVisible);
    } else if (!it.hasRenderableContent) {
      setVisible = tr.isLeaf;
      if (tr.wasSetVisible !== setVisible) toggles.push(tile, 2, setVisible);
    }
    tr.visible = setVisible; tr.active = setActive;
    for (const c of tile.children) yield* toggleTilesG(c, renderer);
  }
}

// phases over a TilesRenderer; returns { start() -> bool, next() -> bool (true when the cycle is complete), busy, ms }
export function createPhasedUpdate(tiles) {
  let phase = 0; const prevUsed = new Set();
  const st = { cycles: 0, frames: 0, sliceMs: 0, cycleMs: 0 };
  function C() {
    const { lruCache, usedSet, stats, queuedTiles, queuedTileSet, downloadQueue, parseQueue, processNodeQueue } = tiles;
    for (const t of prevUsed) if (!usedSet.has(t)) lruCache.markUnused(t);
    prevUsed.clear();
    tiles.removeUnusedPendingTiles();
    queuedTiles.sort(lruCache.unloadPriorityCallback);
    let requested = 0; const n = queuedTiles.length;
    for (; requested < n && !lruCache.isFull(); requested++) tiles.requestTileContents(queuedTiles[requested]);
    stats.refused += queuedTiles.length - requested;
    queuedTiles.length = 0; queuedTileSet.clear();
    lruCache.scheduleUnload();
    const running = downloadQueue.running || parseQueue.running || processNodeQueue.running;
    if (running === false && tiles.isLoading === true) { tiles.cachedSinceLoadComplete.clear(); stats.inCacheSinceLoad = 0; tiles.dispatchEvent({ type: 'tiles-load-end' }); tiles.isLoading = false; }
    tiles.dispatchEvent({ type: 'update-after' });
  }
  // the whole cycle as one generator: A (markUsedTiles sliced), B (leaves + visible, then toggleTiles sliced), C
  function* cycle() {
    const t0 = performance.now();
    // A
    {
      const { stats, usedSet } = tiles;
      let needsUpdate = null;
      tiles.invokeAllPlugins(p => { if (p.doTilesNeedUpdate) { const r = p.doTilesNeedUpdate(); needsUpdate = needsUpdate === null ? r : Boolean(needsUpdate || r); } });
      if (needsUpdate === false) { tiles.dispatchEvent({ type: 'update-before' }); tiles.dispatchEvent({ type: 'update-after' }); return; }
      tiles.dispatchEvent({ type: 'update-before' });
      stats.inFrustum = 0; stats.used = 0; stats.active = 0; stats.visible = 0; stats.refused = 0; stats.tilesProcessed = 0;
      tiles.frameCount++;
      prevUsed.clear(); for (const t of usedSet) prevUsed.add(t); usedSet.clear();
      tiles.prepareForTraversal();
      viewPlugins = tiles.plugins.filter(p => p !== tiles && p.calculateTileViewError);
      yield* markUsedTilesG(tiles.root, tiles);
    }
    yield;
    markUsedSetLeaves(tiles.root, tiles);
    markVisibleTiles(tiles.root, tiles);
    toggles.length = 0;
    yield* toggleTilesG(tiles.root, tiles);
    applyToggles(tiles);
    yield;
    C();
    st.cycleMs = performance.now() - t0;
  }
  let gen = null;
  const step = (ms) => {
    deadline = performance.now() + ms; tick = 0;
    const t = performance.now();
    const r = gen.next();
    st.sliceMs = Math.max(st.sliceMs * 0.995, performance.now() - t);
    if (r.done) { gen = null; st.cycles++; return true; }
    return false;
  };
  return {
    st,
    get busy() { return gen !== null; },
    // usable once the root tileset is in (before that the library's own update() loads it)
    ready: () => !!tiles.root && typeof tiles.prepareForTraversal === 'function',
    budgetMs: 1.0,
    // start a cycle and run its first slice; true when it already completed
    start() { if (gen) return false; gen = cycle(); st.frames = 1; return step(this.budgetMs); },
    // the next slice of the running cycle; true when the cycle completed with it
    next() { if (!gen) return true; st.frames++; return step(this.budgetMs); },
    // the rest of a running cycle at once (jumps, sharp turns)
    finish() { while (gen) step(Infinity); },
  };
}
export { UNLOADED };
