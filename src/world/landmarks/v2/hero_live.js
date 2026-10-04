// live hero site list (hero_lm.js fills it; render/streetmirror.js draws the Chinatown blocks' LOD1 into the wet-street mirror)
export const HERO_LIVE = { sites: [] };
// ?noct = A/B baseline without the Chinatown hero set (OSM footprints, old lantern strings, no street mirror)
export const NO_CT = typeof location !== 'undefined' && /[?&]noct/.test(location.search);
if (typeof window !== 'undefined') window.__heroLive = HERO_LIVE;   // dev: lightmap tuning from the console
