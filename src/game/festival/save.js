// Versioned save. One localStorage key holds the whole profile: { v: 2, economy: {...}, festival: {...} }.
// v1 ('hillbomb.save.v1', economy only) is migrated on first load and kept as a settings mirror because main.js reads
// the graphics quality from it before anything else loads.
export const SAVE_KEY = 'hillbomb.save.v2';
export const LEGACY_KEY = 'hillbomb.save.v1';
export const SAVE_VERSION = 2;

let store = null;
function read(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }
export function loadStore() {
  if (store) return store;
  const cur = read(SAVE_KEY);
  if (cur && cur.v >= 2) { store = migrate(cur); return store; }
  const old = read(LEGACY_KEY);
  store = { v: SAVE_VERSION, created: Date.now(), economy: old ? { ...old } : null, festival: null, migratedFrom: old ? 1 : 0 };
  return store;
}
function migrate(s) {
  // future versions upgrade here, one step at a time
  s.v = SAVE_VERSION;
  return s;
}
let pending = false;
export function persist(now = false) {
  if (!store) return;
  const write = () => {
    pending = false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(store));
      // legacy mirror (economy + settings) so older readers (main.js quality) keep working
      if (store.economy) localStorage.setItem(LEGACY_KEY, JSON.stringify(store.economy));
    } catch { /* storage full / unavailable */ }
  };
  if (now) { write(); return; }
  if (!pending) { pending = true; queueMicrotask(write); }
}
export function wipeStore() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  store = null;
}
// bitset <-> base64 (road discovery)
export function bitsToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
export function b64ToBits(b64, len) { const u8 = new Uint8Array(len); try { const s = atob(b64 || ''); for (let i = 0; i < Math.min(len, s.length); i++) u8[i] = s.charCodeAt(i); } catch { /* bad data */ } return u8; }
