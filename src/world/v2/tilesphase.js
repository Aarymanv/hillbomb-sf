// (perf r3 10/4) Google tiles update split over three frames. TilesRendererBase.update() runs the whole traversal in one
// call (4-12 ms on our city: markUsedTiles ~40 %, toggleTiles ~35 %, queue / LRU / plugin hooks the rest); run every 3rd
// frame it was the p95 frame. Here the same steps run one phase per frame:
//   A  plugins' doTilesNeedUpdate, 'update-before', stats reset, frameCount++, prepareForTraversal, markUsedTiles
//   B  markUsedSetLeaves + markVisibleTiles + toggleTiles (the scene graph changes here, in one frame)
//   C  LRU used-set hand-over, removeUnusedPendingTiles, download requests, scheduleUnload, 'update-after'
// The traversal functions are a copy of 3d-tiles-renderer 0.5.3 src/core/renderer/tiles/traverseFunctions.js (MIT,
// NASA-AMMOS/3DTilesRendererJS) so they can be called per phase. One difference in bookkeeping: the library marks every
// tile of the previous traversal unused in the LRU cache at the START of update(); with phases in between, an unload
// pass (scheduled by tile loads) could then evict tiles that are still on screen. So the previous used set stays marked
// until phase C, where the tiles not used by this traversal are released, i.e. the same state the library reaches.
import { LOADED, FAILED, UNLOADED } from '3d-tiles-renderer';

const viewErrorTarget = { inView: false, error: Infinity, distanceFromCamera: Infinity };
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
      renderer.calculateTileViewErrorWithPlugin(tile, viewErrorTarget);
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
function markUsedTiles(tile, renderer) {
  resetFrameState(tile, renderer);
  if (!tile.traversal.inFrustum) return;
  const parent = tile.parent;
  if (parent && parent.refine === 'ADD' && tile.geometricError > 0 && tile.traversal.error * (parent.geometricError / tile.geometricError) <= renderer.errorTarget) return;
  if (!canTraverse(tile, renderer)) { tile.traversal.used = true; return; }
  let anyChildrenUsed = false, anyChildrenInFrustum = false;
  const children = tile.children;
  for (let i = 0, l = children.length; i < l; i++) {
    const c = children[i];
    markUsedTiles(c, renderer);
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
function toggleTiles(tile, renderer) {
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
      if (tr.wasSetActive !== setActive) renderer.invokeOnePlugin(p => p.setTileActive && p.setTileActive(tile, setActive));
      if (tr.wasSetVisible !== setVisible) renderer.invokeOnePlugin(p => p.setTileVisible && p.setTileVisible(tile, setVisible));
    } else if (!it.hasRenderableContent) {
      setVisible = tr.isLeaf;
      if (tr.wasSetVisible !== setVisible) renderer.invokeOnePlugin(p => p.setEmptyTileVisible && p.setEmptyTileVisible(tile, setVisible));
    }
    tr.visible = setVisible; tr.active = setActive;
    for (const c of tile.children) toggleTiles(c, renderer);
  }
}

// phases over a TilesRenderer; returns { start() -> bool, next() -> bool (true when the cycle is complete), busy, ms }
export function createPhasedUpdate(tiles) {
  let phase = 0; const prevUsed = new Set();
  const st = { busy: false, ms: [0, 0, 0], cycles: 0 };
  function A() {
    const { stats, usedSet } = tiles;
    let needsUpdate = null;
    tiles.invokeAllPlugins(p => { if (p.doTilesNeedUpdate) { const r = p.doTilesNeedUpdate(); needsUpdate = needsUpdate === null ? r : Boolean(needsUpdate || r); } });
    if (needsUpdate === false) { tiles.dispatchEvent({ type: 'update-before' }); tiles.dispatchEvent({ type: 'update-after' }); return false; }
    tiles.dispatchEvent({ type: 'update-before' });
    stats.inFrustum = 0; stats.used = 0; stats.active = 0; stats.visible = 0; stats.refused = 0; stats.tilesProcessed = 0;
    tiles.frameCount++;
    // the previous traversal's tiles stay "used" in the LRU cache until phase C (see the header)
    prevUsed.clear(); for (const t of usedSet) prevUsed.add(t); usedSet.clear();
    tiles.prepareForTraversal();
    markUsedTiles(tiles.root, tiles);
    return true;
  }
  function B() {
    const root = tiles.root;
    markUsedSetLeaves(root, tiles);
    markVisibleTiles(root, tiles);
    toggleTiles(root, tiles);
  }
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
  const run = (k) => { const t = performance.now(); let r = true; if (k === 0) r = A(); else if (k === 1) B(); else C(); st.ms[k] = st.ms[k] * 0.9 + (performance.now() - t) * 0.1; return r; };
  return {
    st,
    get busy() { return phase !== 0; },
    // usable once the root tileset is in (before that the library's own update() loads it)
    ready: () => !!tiles.root && typeof tiles.prepareForTraversal === 'function',
    // phase A now; false when the plugins said no update is needed (cycle done)
    start() { if (phase !== 0) return false; if (!run(0)) return true; phase = 1; return false; },
    // the next phase; true when the cycle completed with it
    next() { if (phase === 0) return true; run(phase); phase = (phase + 1) % 3; if (phase === 0) { st.cycles++; return true; } return false; },
    // the rest of a running cycle at once (jumps, sharp turns)
    finish() { while (phase !== 0) { run(phase); phase = (phase + 1) % 3; } },
  };
}
export { UNLOADED };
