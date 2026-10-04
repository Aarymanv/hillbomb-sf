// Spotify OAuth: Authorization Code with PKCE (no client secret, no password ever touches the game).
// Flow: beginLogin() stashes {verifier, state, returnUrl} in sessionStorage and returns the accounts.spotify.com URL;
// Spotify redirects back to origin+pathname with ?code&state (or ?error); captureCallback() (synchronous, runs at
// module load so ?play etc. are restored before main.js reads the URL) cleans the URL; completeCallback() verifies
// state and exchanges the code. Tokens live in localStorage and are refreshed 60 s before expiry; concurrent
// refreshes share one in-flight promise; a rotated refresh token replaces the old one; invalid_grant disconnects.
// Every storage access is wrapped: storage can throw (private mode, blocked site data), the session then lives in memory.
import { createPkce, createState } from './pkce.js';

export const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private user-library-read';
export const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const KEYS = { tokens: 'hillbomb.spotify.tokens.v1', clientId: 'hillbomb.spotify.clientId', pkce: 'hillbomb.spotify.pkce.v1' };
export const REFRESH_MARGIN_MS = 60_000;
export const CLIENT_ID_RE = /^[0-9a-f]{32}$/i;
const CALLBACK_KEYS = ['code', 'state', 'error', 'error_description'];

export class AuthError extends Error {
  constructor(code, message, status = 0) { super(message); this.name = 'AuthError'; this.code = code; this.status = status; }
}

/** Storage wrapper that never throws. `get` returns the parsed JSON (or raw string when raw=true), null on any failure. */
export function safeStore(getStore) {
  const store = () => { try { return typeof getStore === 'function' ? getStore() : getStore; } catch { return null; } };
  return {
    get(k, raw = false) { try { const v = store()?.getItem(k); if (v == null) return null; return raw ? v : JSON.parse(v); } catch { return null; } },
    set(k, v, raw = false) { try { const s = store(); if (!s) return false; s.setItem(k, raw ? String(v) : JSON.stringify(v)); return true; } catch { return false; } },
    remove(k) { try { const s = store(); if (!s) return false; s.removeItem(k); return true; } catch { return false; } },
  };
}

/** redirect_uri the app must register: the page itself, without query or hash. */
export function redirectUriFor(loc) { return loc.origin + loc.pathname; }

export function buildAuthorizeUrl({ clientId, redirectUri, challenge, state, scope = SCOPES }) {
  const u = new URL(AUTHORIZE_URL);
  u.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, scope, redirect_uri: redirectUri,
    state, code_challenge_method: 'S256', code_challenge: challenge,
  }).toString();
  return u.toString();
}

/** null unless the URL is an OAuth callback: needs `state` plus `code` or `error`. */
export function parseCallback(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  const p = u.searchParams, state = p.get('state'), code = p.get('code'), error = p.get('error');
  if (!state || (!code && !error)) return null;
  return { code, state, error, errorDescription: p.get('error_description') };
}

/** Remove the OAuth params, keeping every other param exactly as written (so "?play" stays "?play"). */
export function stripCallbackParams(href) {
  const u = new URL(href);
  const kept = u.search.replace(/^\?/, '').split('&').filter(kv => kv && !CALLBACK_KEYS.includes(decodeURIComponent(kv.split('=')[0])));
  u.search = kept.length ? '?' + kept.join('&') : '';
  return u.toString();
}

/** Same-origin check for the stashed return URL (never redirect anywhere else). */
function sameOriginUrl(url, base) {
  try { const u = new URL(url, base); return u.origin === new URL(base).origin ? u.toString() : null; } catch { return null; }
}

/**
 * Synchronous: if `href` is an OAuth callback, read + delete the PKCE stash, put the original URL back with
 * replaceState (code/state removed from the address bar and history) and return the pending result for
 * completeCallback(). Returns null for normal page loads. Never throws.
 */
export function captureCallback({ href, session, replaceState }) {
  try {
    const cb = parseCallback(href);
    if (!cb) return null;
    const ss = safeStore(session);
    const stash = ss.get(KEYS.pkce);
    ss.remove(KEYS.pkce);
    const clean = (stash && sameOriginUrl(stash.returnUrl, href)) || stripCallbackParams(href);
    try { replaceState?.(clean); } catch { /* ignore */ }
    return { ...cb, stash: stash || null, cleanUrl: clean };
  } catch {
    return null;
  }
}

export function createAuth({
  fetch: fetchFn = (...a) => globalThis.fetch(...a),
  local = () => globalThis.localStorage,
  session = () => globalThis.sessionStorage,
  now = () => Date.now(),
  onChange = null,
} = {}) {
  const ls = safeStore(local), ss = safeStore(session);
  let tokens = validTokens(ls.get(KEYS.tokens));
  let inflight = null;
  let message = '';
  let clientIdMem = ls.get(KEYS.clientId, true) || '';

  function validTokens(t) { return t && typeof t.access_token === 'string' && typeof t.refresh_token === 'string' && Number.isFinite(t.expires_at) ? t : null; }
  function emit() { try { onChange?.(A); } catch (e) { console.warn('[spotify] auth listener threw', e); } }
  function store(rec) { tokens = rec; ls.set(KEYS.tokens, rec); }
  function record(j, prev, clientId) {
    return {
      access_token: j.access_token,
      refresh_token: j.refresh_token || prev?.refresh_token || null, // Spotify may rotate it; else keep the old one
      expires_at: now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000,
      scope: j.scope || prev?.scope || '',
      client_id: clientId || prev?.client_id || '',
    };
  }
  async function postForm(params) {
    let res;
    try {
      res = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    } catch (e) {
      throw new AuthError('network', 'Could not reach Spotify (network error)');
    }
    let j = null;
    try { j = await res.json(); } catch { j = null; }
    return { res, j };
  }
  function clear(msg) {
    tokens = null; message = msg || '';
    ls.remove(KEYS.tokens);
    emit();
  }

  async function doRefresh() {
    // another tab may have refreshed (and rotated the refresh token) already: adopt its newer record
    const stored = validTokens(ls.get(KEYS.tokens));
    if (stored && tokens && stored.access_token !== tokens.access_token && now() < stored.expires_at - REFRESH_MARGIN_MS) { tokens = stored; return tokens.access_token; }
    const prev = tokens;
    if (!prev) throw new AuthError('not_connected', 'Not connected to Spotify');
    const clientId = prev.client_id || A.clientId;
    const { res, j } = await postForm({ grant_type: 'refresh_token', refresh_token: prev.refresh_token, client_id: clientId });
    if (res.ok && j?.access_token) {
      store(record(j, prev, clientId));
      return tokens.access_token;
    }
    const err = j?.error;
    if (err === 'invalid_grant' || err === 'invalid_client') {
      const msg = err === 'invalid_client' ? 'Spotify no longer accepts this app (invalid client): check the Client ID.'
        : 'Your Spotify session expired or was revoked.';
      clear(msg);
      throw new AuthError(err, msg, res.status);
    }
    throw new AuthError('refresh_failed', `Spotify token refresh failed (${res.status}${j?.error_description ? ': ' + j.error_description : ''})`, res.status);
  }

  const A = {
    get clientId() { return clientIdMem; },
    set clientId(v) { clientIdMem = String(v || '').trim(); ls.set(KEYS.clientId, clientIdMem, true); },
    get tokens() { return tokens ? { ...tokens } : null; },
    get message() { return message; },
    isConnected: () => !!tokens,

    /** Build the authorize URL and stash the PKCE verifier/state/returnUrl for the callback. */
    async beginLogin({ clientId = clientIdMem, redirectUri, returnUrl }) {
      clientId = String(clientId || '').trim();
      if (!clientId) throw new AuthError('no_client_id', 'Paste your Spotify app Client ID first');
      const { verifier, challenge } = await createPkce(64);
      const state = createState();
      const ok = ss.set(KEYS.pkce, { verifier, state, returnUrl, redirectUri, clientId, t: now() });
      if (!ok) throw new AuthError('storage', 'This browser blocks session storage, so the Spotify login cannot complete');
      message = '';
      return buildAuthorizeUrl({ clientId, redirectUri, challenge, state });
    },

    /** Finish a callback captured by captureCallback(). Resolves {ok:true} or {ok:false, error, message}; never throws. */
    async completeCallback(p) {
      if (!p) return null;
      if (p.error) {
        const denied = p.error === 'access_denied';
        message = denied ? 'Spotify sign-in was cancelled.' : `Spotify sign-in failed: ${p.errorDescription || p.error}`;
        emit();
        return { ok: false, error: denied ? 'access_denied' : p.error, message };
      }
      if (!p.stash || !p.stash.state || p.stash.state !== p.state) {
        message = 'Spotify sign-in could not be verified (state mismatch).';
        emit();
        return { ok: false, error: 'state_mismatch', message };
      }
      try {
        await A.exchangeCode({ code: p.code, redirectUri: p.stash.redirectUri, clientId: p.stash.clientId, verifier: p.stash.verifier });
        return { ok: true };
      } catch (e) {
        message = e.message || 'Spotify sign-in failed';
        emit();
        return { ok: false, error: e.code || 'exchange_failed', message };
      }
    },

    async exchangeCode({ code, redirectUri, clientId, verifier }) {
      const { res, j } = await postForm({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier });
      if (!res.ok || !j?.access_token) {
        throw new AuthError(j?.error || 'exchange_failed', `Spotify refused the sign-in (${j?.error_description || j?.error || res.status})`, res.status);
      }
      if (!j.refresh_token) throw new AuthError('exchange_failed', 'Spotify returned no refresh token');
      store(record(j, null, clientId));
      message = '';
      emit();
      return A.tokens;
    },

    /** A valid access token, refreshing first when it expires within 60 s. Throws AuthError when not connected. */
    async getAccessToken() {
      if (!tokens) throw new AuthError('not_connected', message || 'Not connected to Spotify');
      if (now() >= tokens.expires_at - REFRESH_MARGIN_MS) return A.refresh();
      return tokens.access_token;
    },

    /**
     * Refresh now. Concurrent calls share one request. With {ifToken}, skip when the current token already
     * differs from the one the caller saw rejected (someone else refreshed meanwhile).
     */
    refresh({ ifToken } = {}) {
      if (inflight) return inflight;
      if (ifToken && tokens && tokens.access_token !== ifToken && now() < tokens.expires_at - REFRESH_MARGIN_MS) return Promise.resolve(tokens.access_token);
      inflight = doRefresh().finally(() => { inflight = null; });
      return inflight;
    },

    disconnect(msg = '') { clear(msg); },
    _clearMessage() { message = ''; },
  };
  return A;
}
