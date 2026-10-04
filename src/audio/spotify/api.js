// Spotify Web API client: bearer auth from auth.getAccessToken() (auto-refresh), one refresh+retry on 401,
// 429 handled by sleeping Retry-After seconds (short waits only; long ones throw so the game never stalls).
export const API_BASE = 'https://api.spotify.com/v1';

export class ApiError extends Error {
  constructor(status, message, reason = null, retryAfter = 0) {
    super(message); this.name = 'ApiError'; this.status = status; this.reason = reason; this.retryAfter = retryAfter;
  }
}

/** Retry-After is seconds (or an HTTP date). Missing/garbled -> 1 s. */
export function parseRetryAfter(v, now = Date.now()) {
  if (v == null || v === '') return 1;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : 1;
}

export function createApi({
  auth,
  fetch: fetchFn = (...a) => globalThis.fetch(...a),
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  base = API_BASE,
  maxRetryAfterS = 10, // longer waits throw ApiError(429) instead of blocking
  max429 = 2,
} = {}) {
  async function request(method, path, { query, body } = {}) {
    let url = base + path;
    if (query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v != null) q.set(k, String(v));
      const s = q.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }
    let retried401 = false, n429 = 0;
    for (;;) {
      const token = await auth.getAccessToken();
      const headers = { Authorization: 'Bearer ' + token };
      let payload;
      if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      let res;
      try { res = await fetchFn(url, { method, headers, body: payload }); } catch { throw new ApiError(0, 'Could not reach Spotify (network error)', 'network'); }
      if (res.status === 401 && !retried401) {
        retried401 = true;
        await auth.refresh({ ifToken: token });
        continue;
      }
      if (res.status === 429) {
        const ra = parseRetryAfter(res.headers?.get?.('Retry-After'));
        if (n429 < max429 && ra <= maxRetryAfterS) { n429++; await sleep(ra * 1000); continue; }
        throw new ApiError(429, `Spotify is rate limiting requests; try again in ${Math.ceil(ra)} s`, 'rate_limited', ra);
      }
      if (res.status === 204 || res.status === 202) return null;
      let text = '';
      try { text = await res.text(); } catch { text = ''; }
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = text; } }
      if (!res.ok) {
        const e = data && typeof data === 'object' ? data.error : null;
        const msg = (e && typeof e === 'object' ? e.message : typeof e === 'string' ? e : '') || `HTTP ${res.status}`;
        throw new ApiError(res.status, msg, (e && typeof e === 'object' && e.reason) || null);
      }
      return data;
    }
  }

  const dev = deviceId => (deviceId ? { device_id: deviceId } : undefined);
  return {
    request,
    me: () => request('GET', '/me'),
    playlists: (limit = 50, offset = 0) => request('GET', '/me/playlists', { query: { limit, offset } }),
    savedTracks: (limit = 50, offset = 0) => request('GET', '/me/tracks', { query: { limit, offset } }),
    currentlyPlaying: () => request('GET', '/me/player/currently-playing', { query: { additional_types: 'track,episode' } }),
    transfer: (deviceId, play = false) => request('PUT', '/me/player', { body: { device_ids: [deviceId], play } }),
    /** body: {context_uri, offset} | {uris} | undefined (= resume the current context) */
    play: (deviceId, body) => request('PUT', '/me/player/play', { query: dev(deviceId), body }),
    pause: deviceId => request('PUT', '/me/player/pause', { query: dev(deviceId) }),
    next: deviceId => request('POST', '/me/player/next', { query: dev(deviceId) }),
    previous: deviceId => request('POST', '/me/player/previous', { query: dev(deviceId) }),
    shuffle: (state, deviceId) => request('PUT', '/me/player/shuffle', { query: { state: !!state, ...dev(deviceId) } }),
  };
}
