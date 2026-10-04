// Unit tests for the Spotify integration. Zero deps: `node dev/audio.spotify.test.mjs` (Node 20+).
// fetch, storage, clock, sleep and the SDK device are mocked; no network, no credentials.
import assert from 'node:assert/strict';
import { createPkce, challengeFor, createVerifier, createState, VERIFIER_RE, base64url } from '../src/audio/spotify/pkce.js';
import {
  SCOPES, AUTHORIZE_URL, TOKEN_URL, KEYS, REFRESH_MARGIN_MS, buildAuthorizeUrl, parseCallback, stripCallbackParams,
  captureCallback, createAuth, redirectUriFor, safeStore,
} from '../src/audio/spotify/auth.js';
import { createApi, parseRetryAfter, ApiError } from '../src/audio/spotify/api.js';
import { createSpotifyStation, MSG, pickImage, normalizeSource } from '../src/audio/spotify/station.js';

// ------------------------------------------------------------------ tiny runner
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ------------------------------------------------------------------ mocks
function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
function throwingStorage() {
  const boom = () => { throw new Error('SecurityError: storage disabled'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}
function json(status, body, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
/** fetch mock: `routes` is a list of handlers (req) => Response|undefined, tried in order; every call is recorded. */
function mockFetch(handler) {
  const calls = [];
  const f = async (url, init = {}) => {
    const req = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    calls.push(req);
    const r = await handler(req, calls.length);
    if (!r) throw new Error('unexpected fetch ' + req.method + ' ' + req.url);
    return r;
  };
  f.calls = calls;
  return f;
}
const form = body => Object.fromEntries(new URLSearchParams(body));
const clock = (t0 = 1_700_000_000_000) => { const c = { t: t0 }; c.now = () => c.t; return c; };
const tokenJson = (n, extra = {}) => ({ access_token: 'AT' + n, token_type: 'Bearer', expires_in: 3600, scope: SCOPES, ...extra });
function connectedAuth({ fetch, now, local = memStorage(), expiresInMs = 3_600_000, refresh = 'RT0' } = {}) {
  local.setItem(KEYS.tokens, JSON.stringify({ access_token: 'AT0', refresh_token: refresh, expires_at: now() + expiresInMs, scope: SCOPES, client_id: 'c'.repeat(32) }));
  return createAuth({ fetch, now, local: () => local, session: () => memStorage() });
}

// ------------------------------------------------------------------ PKCE
test('PKCE: RFC 7636 Appendix B vector + cross-check against node:crypto', async () => {
  // RFC 7636 Appendix B: code_verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" (base64url of the RFC's 32 octets)
  const octets = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];
  const verifier = base64url(new Uint8Array(octets));
  assert.equal(verifier, 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(await challengeFor(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  // the string in the task brief ("...-mJ92K4ZkyJ...") is a garbled copy of that verifier: it is still hashed correctly
  const nodeCrypto = await import('node:crypto');
  for (const v of ['dBjftJeZ4CVP-mJ92K4ZkyJvHwUxL8sYXMKx0p8zV6w', createVerifier(43), createVerifier(128)]) {
    assert.equal(await challengeFor(v), nodeCrypto.createHash('sha256').update(v).digest('base64url'));
  }
});
test('PKCE: verifier length + charset, pair consistency', async () => {
  for (const n of [43, 64, 128]) { const v = createVerifier(n); assert.equal(v.length, n); assert.match(v, VERIFIER_RE); }
  assert.throws(() => createVerifier(42), RangeError);
  assert.throws(() => createVerifier(129), RangeError);
  const { verifier, challenge, method } = await createPkce();
  assert.equal(verifier.length, 64); assert.match(verifier, /^[A-Za-z0-9\-._~]+$/); assert.equal(method, 'S256');
  assert.equal(challenge, await challengeFor(verifier));
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/); // 32 bytes -> 43 base64url chars, no padding
  const many = new Set(Array.from({ length: 200 }, () => createVerifier()));
  assert.equal(many.size, 200);
});
test('PKCE: state randomness (unique, url-safe, ~uniform)', () => {
  const N = 2000, seen = new Set(), counts = new Map();
  for (let i = 0; i < N; i++) {
    const s = createState();
    assert.match(s, /^[A-Za-z0-9]{32}$/);
    seen.add(s);
    for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  assert.equal(seen.size, N);
  assert.equal(counts.size, 62); // every alphanumeric symbol shows up
  const exp = (N * 32) / 62;
  for (const c of counts.values()) assert.ok(Math.abs(c - exp) < exp * 0.25, 'symbol frequency within 25%');
});
test('PKCE: base64url has no +, / or =', () => {
  assert.equal(base64url(new Uint8Array([251, 255, 191])), '-_-_');
  assert.equal(base64url(new Uint8Array([1])), 'AQ');
});

// ------------------------------------------------------------------ authorize URL + callback
test('authorize URL: endpoint, params, scopes, encoding', () => {
  const url = buildAuthorizeUrl({ clientId: 'abc123', redirectUri: 'http://127.0.0.1:5190/', challenge: 'CH_-x', state: 'ST8' });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, AUTHORIZE_URL);
  const p = u.searchParams;
  assert.deepEqual([...p.keys()].sort(), ['client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'response_type', 'scope', 'state']);
  assert.equal(p.get('response_type'), 'code');
  assert.equal(p.get('client_id'), 'abc123');
  assert.equal(p.get('redirect_uri'), 'http://127.0.0.1:5190/');
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.equal(p.get('code_challenge'), 'CH_-x');
  assert.equal(p.get('state'), 'ST8');
  assert.equal(p.get('scope'), 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private user-library-read');
  assert.equal(SCOPES, p.get('scope'));
  assert.ok(url.includes('redirect_uri=http%3A%2F%2F127.0.0.1%3A5190%2F'), 'redirect_uri percent-encoded');
  assert.ok(url.includes('scope=streaming+user-read-email+'), 'scope spaces form-encoded');
  assert.ok(!url.includes('client_secret'));
  // odd characters in a redirect path survive the round trip
  const u2 = new URL(buildAuthorizeUrl({ clientId: 'x', redirectUri: 'https://ex.com/a b/&c?/', challenge: 'c', state: 's' }));
  assert.equal(u2.searchParams.get('redirect_uri'), 'https://ex.com/a b/&c?/');
});
test('redirect URI = origin + pathname (no query/hash)', () => {
  const loc = new URL('http://127.0.0.1:5190/dev/audio.spotify.html?spotify#x');
  assert.equal(redirectUriFor(loc), 'http://127.0.0.1:5190/dev/audio.spotify.html');
  assert.equal(redirectUriFor(new URL('http://127.0.0.1:5190/?play')), 'http://127.0.0.1:5190/');
});
test('beginLogin stashes verifier/state/returnUrl; URL challenge matches verifier', async () => {
  const session = memStorage(), c = clock();
  const auth = createAuth({ fetch: mockFetch(() => null), now: c.now, local: () => memStorage(), session: () => session });
  await assert.rejects(auth.beginLogin({ clientId: '', redirectUri: 'x', returnUrl: 'y' }), /Client ID/);
  const url = await auth.beginLogin({ clientId: 'f'.repeat(32), redirectUri: 'http://127.0.0.1:5190/', returnUrl: 'http://127.0.0.1:5190/?play&spotify' });
  const stash = JSON.parse(session.getItem(KEYS.pkce));
  const p = new URL(url).searchParams;
  assert.equal(p.get('state'), stash.state);
  assert.equal(p.get('code_challenge'), await challengeFor(stash.verifier));
  assert.match(stash.verifier, VERIFIER_RE);
  assert.equal(stash.returnUrl, 'http://127.0.0.1:5190/?play&spotify');
  assert.equal(stash.redirectUri, 'http://127.0.0.1:5190/');
  assert.equal(stash.clientId, 'f'.repeat(32));
});
test('callback parsing', () => {
  assert.equal(parseCallback('http://127.0.0.1:5190/?play'), null);
  assert.equal(parseCallback('http://127.0.0.1:5190/?code=abc'), null, 'code without state is not ours');
  assert.deepEqual(parseCallback('http://127.0.0.1:5190/?code=abc&state=xyz'), { code: 'abc', state: 'xyz', error: null, errorDescription: null });
  assert.equal(parseCallback('http://127.0.0.1:5190/?error=access_denied&state=xyz').error, 'access_denied');
  assert.equal(stripCallbackParams('http://127.0.0.1:5190/?play&code=a&state=b&car=muscle#h'), 'http://127.0.0.1:5190/?play&car=muscle#h');
  assert.equal(stripCallbackParams('http://127.0.0.1:5190/?code=a&state=b'), 'http://127.0.0.1:5190/');
});
test('captureCallback restores the original URL, clears the stash; ignores normal loads', () => {
  const session = memStorage();
  session.setItem(KEYS.pkce, JSON.stringify({ verifier: 'v'.repeat(64), state: 'S1', returnUrl: 'http://127.0.0.1:5190/?play&spotify', redirectUri: 'http://127.0.0.1:5190/', clientId: 'cid' }));
  const replaced = [];
  assert.equal(captureCallback({ href: 'http://127.0.0.1:5190/?play', session: () => session, replaceState: u => replaced.push(u) }), null);
  assert.equal(replaced.length, 0);
  assert.ok(session.getItem(KEYS.pkce), 'stash untouched on a normal load');
  const p = captureCallback({ href: 'http://127.0.0.1:5190/?code=C0DE&state=S1', session: () => session, replaceState: u => replaced.push(u) });
  assert.equal(p.code, 'C0DE'); assert.equal(p.state, 'S1'); assert.equal(p.stash.verifier, 'v'.repeat(64));
  assert.deepEqual(replaced, ['http://127.0.0.1:5190/?play&spotify']);
  assert.equal(session.getItem(KEYS.pkce), null, 'stash is single-use');
  // a foreign-origin returnUrl is never used
  session.setItem(KEYS.pkce, JSON.stringify({ state: 'S2', returnUrl: 'https://evil.example/' }));
  captureCallback({ href: 'http://127.0.0.1:5190/?code=x&state=S2', session: () => session, replaceState: u => replaced.push(u) });
  assert.equal(replaced.at(-1), 'http://127.0.0.1:5190/');
  // storage that throws: still cleans the URL, reports no stash
  const q = captureCallback({ href: 'http://127.0.0.1:5190/?play&code=x&state=S3', session: () => throwingStorage(), replaceState: u => replaced.push(u) });
  assert.equal(q.stash, null); assert.equal(replaced.at(-1), 'http://127.0.0.1:5190/?play');
});
test('completeCallback: state mismatch and access_denied never hit the token endpoint', async () => {
  const f = mockFetch(() => null), c = clock();
  const auth = createAuth({ fetch: f, now: c.now, local: () => memStorage(), session: () => memStorage() });
  const r1 = await auth.completeCallback({ code: 'C', state: 'EVIL', stash: { state: 'GOOD', verifier: 'v', redirectUri: 'r', clientId: 'c' } });
  assert.equal(r1.ok, false); assert.equal(r1.error, 'state_mismatch');
  const r2 = await auth.completeCallback({ code: 'C', state: 'X', stash: null });
  assert.equal(r2.error, 'state_mismatch');
  const r3 = await auth.completeCallback({ error: 'access_denied', state: 'GOOD', stash: { state: 'GOOD' } });
  assert.equal(r3.ok, false); assert.equal(r3.error, 'access_denied'); assert.match(r3.message, /cancelled/);
  assert.equal(f.calls.length, 0);
  assert.equal(auth.isConnected(), false);
});
test('token exchange: request body, headers, stored record + expiry math', async () => {
  const c = clock(), local = memStorage();
  const f = mockFetch(req => (req.url === TOKEN_URL ? json(200, tokenJson(1, { refresh_token: 'RT1' })) : null));
  const changes = [];
  const auth = createAuth({ fetch: f, now: c.now, local: () => local, session: () => memStorage(), onChange: a => changes.push(a.isConnected()) });
  const r = await auth.completeCallback({ code: 'C0DE', state: 'S', stash: { state: 'S', verifier: 'VER', redirectUri: 'http://127.0.0.1:5190/', clientId: 'CID' } });
  assert.deepEqual(r, { ok: true });
  assert.equal(f.calls.length, 1);
  const req = f.calls[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(req.headers.Authorization, undefined, 'PKCE: no client secret / basic auth');
  assert.deepEqual(form(req.body), { grant_type: 'authorization_code', code: 'C0DE', redirect_uri: 'http://127.0.0.1:5190/', client_id: 'CID', code_verifier: 'VER' });
  const saved = JSON.parse(local.getItem(KEYS.tokens));
  assert.deepEqual(saved, { access_token: 'AT1', refresh_token: 'RT1', expires_at: c.t + 3600 * 1000, scope: SCOPES, client_id: 'CID' });
  assert.equal(await auth.getAccessToken(), 'AT1');
  assert.deepEqual(changes, [true]);
});
test('token exchange failure is reported, not thrown', async () => {
  const c = clock();
  const f = mockFetch(() => json(400, { error: 'invalid_grant', error_description: 'Invalid authorization code' }));
  const auth = createAuth({ fetch: f, now: c.now, local: () => memStorage(), session: () => memStorage() });
  const r = await auth.completeCallback({ code: 'old', state: 'S', stash: { state: 'S', verifier: 'v', redirectUri: 'r', clientId: 'c' } });
  assert.equal(r.ok, false); assert.match(r.message, /Invalid authorization code/);
  assert.equal(auth.isConnected(), false);
});

// ------------------------------------------------------------------ refresh
test('refresh only inside the last 60 s; body carries refresh_token + client_id', async () => {
  const c = clock();
  const f = mockFetch(req => (req.url === TOKEN_URL ? json(200, tokenJson(1, { refresh_token: 'RT1' })) : null));
  const auth = connectedAuth({ fetch: f, now: c.now });
  c.t += 3_600_000 - REFRESH_MARGIN_MS - 1000; // 61 s before expiry
  assert.equal(await auth.getAccessToken(), 'AT0');
  assert.equal(f.calls.length, 0);
  c.t += 2000; // 59 s before expiry
  assert.equal(await auth.getAccessToken(), 'AT1');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(form(f.calls[0].body), { grant_type: 'refresh_token', refresh_token: 'RT0', client_id: 'c'.repeat(32) });
  assert.equal(auth.tokens.expires_at, c.t + 3_600_000);
});
test('refresh token rotation: keep the new one if returned, else the old one', async () => {
  const c = clock(), local = memStorage();
  let n = 0;
  const f = mockFetch(() => json(200, ++n === 1 ? tokenJson(1, { refresh_token: 'RT_NEW' }) : tokenJson(2)));
  const auth = connectedAuth({ fetch: f, now: c.now, local });
  await auth.refresh();
  assert.equal(auth.tokens.refresh_token, 'RT_NEW');
  assert.equal(JSON.parse(local.getItem(KEYS.tokens)).refresh_token, 'RT_NEW');
  await auth.refresh();
  assert.equal(auth.tokens.access_token, 'AT2');
  assert.equal(auth.tokens.refresh_token, 'RT_NEW', 'no refresh_token in response -> keep the previous one');
  assert.equal(form(f.calls[1].body).refresh_token, 'RT_NEW');
});
test('concurrent refreshes share one request', async () => {
  const c = clock();
  let release;
  const gate = new Promise(r => { release = r; });
  const f = mockFetch(async () => { await gate; return json(200, tokenJson(9)); });
  const auth = connectedAuth({ fetch: f, now: c.now, expiresInMs: 10_000 }); // inside the margin already
  const all = Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.refresh(), auth.getAccessToken(), auth.refresh({ ifToken: 'AT0' })]);
  release();
  assert.deepEqual(await all, ['AT9', 'AT9', 'AT9', 'AT9', 'AT9']);
  assert.equal(f.calls.length, 1);
  // ifToken: a stale 401 after someone else refreshed does not refresh again
  assert.equal(await auth.refresh({ ifToken: 'AT0' }), 'AT9');
  assert.equal(f.calls.length, 1);
});
test('invalid_grant clears tokens -> disconnected with a clear message', async () => {
  const c = clock(), local = memStorage();
  const f = mockFetch(() => json(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }));
  const auth = connectedAuth({ fetch: f, now: c.now, local, expiresInMs: 0 });
  const station = createSpotifyStation({ auth, api: createApi({ auth, fetch: f }), createDevice: fakeDeviceFactory().create, local: () => memStorage(), now: c.now });
  await assert.rejects(auth.getAccessToken(), e => e.code === 'invalid_grant');
  assert.equal(auth.isConnected(), false);
  assert.equal(local.getItem(KEYS.tokens), null);
  assert.match(auth.message, /expired or was revoked/);
  station.authChanged();
  assert.equal(station.snapshot().status, 'disconnected');
  assert.equal(station.nowPlaying().message, 'Your Spotify session expired or was revoked. Press O to connect.');
});
test('network failure during refresh keeps the tokens (transient)', async () => {
  const c = clock();
  const f = async () => { throw new TypeError('Failed to fetch'); };
  const auth = connectedAuth({ fetch: f, now: c.now, expiresInMs: 0 });
  await assert.rejects(auth.getAccessToken(), e => e.code === 'network');
  assert.equal(auth.isConnected(), true);
});
test('storage that throws: login + tokens keep working in memory', async () => {
  const c = clock();
  const f = mockFetch(() => json(200, tokenJson(1, { refresh_token: 'RT1' })));
  const auth = createAuth({ fetch: f, now: c.now, local: () => throwingStorage(), session: () => memStorage() });
  auth.clientId = 'a'.repeat(32); // write throws internally; value kept in memory
  assert.equal(auth.clientId, 'a'.repeat(32));
  const r = await auth.completeCallback({ code: 'C', state: 'S', stash: { state: 'S', verifier: 'v', redirectUri: 'r', clientId: 'c' } });
  assert.equal(r.ok, true);
  assert.equal(await auth.getAccessToken(), 'AT1');
  auth.disconnect();
  assert.equal(auth.isConnected(), false);
  // the accessor itself throwing (e.g. localStorage getter in a sandboxed iframe)
  const a2 = createAuth({ fetch: f, now: c.now, local: () => { throw new Error('denied'); }, session: () => { throw new Error('denied'); } });
  assert.equal(a2.isConnected(), false);
  await assert.rejects(a2.beginLogin({ clientId: 'x', redirectUri: 'r', returnUrl: 'u' }), /session storage/);
  const s = safeStore(() => throwingStorage());
  assert.equal(s.get('k'), null); assert.equal(s.set('k', 1), false); assert.equal(s.remove('k'), false);
});
test('adopts a newer token another tab stored instead of refreshing again', async () => {
  const c = clock(), local = memStorage();
  const f = mockFetch(() => json(200, tokenJson(5)));
  const auth = connectedAuth({ fetch: f, now: c.now, local, expiresInMs: 1000 });
  local.setItem(KEYS.tokens, JSON.stringify({ access_token: 'OTHER_TAB', refresh_token: 'RT_OT', expires_at: c.t + 3_600_000, scope: SCOPES, client_id: 'c' }));
  assert.equal(await auth.getAccessToken(), 'OTHER_TAB');
  assert.equal(f.calls.length, 0);
});

// ------------------------------------------------------------------ Web API client
test('API: bearer header, query string, JSON body, 204 -> null', async () => {
  const c = clock();
  const f = mockFetch(req => {
    if (req.url.startsWith('https://api.spotify.com/v1/me/player/play')) return new Response(null, { status: 204 });
    if (req.url === 'https://api.spotify.com/v1/me') return json(200, { id: 'u1', display_name: 'U' });
  });
  const auth = connectedAuth({ fetch: f, now: c.now });
  const api = createApi({ auth, fetch: f });
  assert.deepEqual(await api.me(), { id: 'u1', display_name: 'U' });
  assert.equal(f.calls[0].headers.Authorization, 'Bearer AT0');
  assert.equal(await api.play('dev1', { uris: ['spotify:track:1'] }), null);
  assert.equal(f.calls[1].url, 'https://api.spotify.com/v1/me/player/play?device_id=dev1');
  assert.equal(f.calls[1].method, 'PUT');
  assert.equal(f.calls[1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(f.calls[1].body), { uris: ['spotify:track:1'] });
});
test('API: 401 -> refresh + retry once with the new token', async () => {
  const c = clock();
  const f = mockFetch(req => {
    if (req.url === TOKEN_URL) return json(200, tokenJson(1));
    return req.headers.Authorization === 'Bearer AT1' ? json(200, { id: 'ok' }) : json(401, { error: { status: 401, message: 'The access token expired' } });
  });
  const auth = connectedAuth({ fetch: f, now: c.now });
  const api = createApi({ auth, fetch: f });
  assert.deepEqual(await api.me(), { id: 'ok' });
  assert.deepEqual(f.calls.map(r => (r.url === TOKEN_URL ? 'token' : r.headers.Authorization)), ['Bearer AT0', 'token', 'Bearer AT1']);
});
test('API: a second 401 is not retried again', async () => {
  const c = clock();
  const f = mockFetch(req => (req.url === TOKEN_URL ? json(200, tokenJson(1)) : json(401, { error: { status: 401, message: 'Invalid access token' } })));
  const auth = connectedAuth({ fetch: f, now: c.now });
  const api = createApi({ auth, fetch: f });
  await assert.rejects(api.me(), e => e instanceof ApiError && e.status === 401);
  assert.equal(f.calls.filter(r => r.url !== TOKEN_URL).length, 2);
  assert.equal(f.calls.filter(r => r.url === TOKEN_URL).length, 1);
});
test('API: 401 whose refresh hits invalid_grant disconnects', async () => {
  const c = clock();
  const f = mockFetch(req => (req.url === TOKEN_URL ? json(400, { error: 'invalid_grant' }) : json(401, { error: { status: 401, message: 'revoked' } })));
  const auth = connectedAuth({ fetch: f, now: c.now });
  await assert.rejects(createApi({ auth, fetch: f }).me(), e => e.code === 'invalid_grant');
  assert.equal(auth.isConnected(), false);
});
test('API: 429 sleeps Retry-After seconds then retries; long waits throw', async () => {
  const c = clock(), slept = [];
  let n = 0;
  const f = mockFetch(() => (++n === 1 ? json(429, { error: { status: 429, message: 'API rate limit exceeded' } }, { 'Retry-After': '2' }) : json(200, { id: 'after' })));
  const auth = connectedAuth({ fetch: f, now: c.now });
  const api = createApi({ auth, fetch: f, sleep: async ms => { slept.push(ms); } });
  assert.deepEqual(await api.me(), { id: 'after' });
  assert.deepEqual(slept, [2000]);
  const f2 = mockFetch(() => json(429, null, { 'Retry-After': '120' }));
  const api2 = createApi({ auth, fetch: f2, sleep: async ms => { slept.push(ms); } });
  await assert.rejects(api2.me(), e => e.status === 429 && e.retryAfter === 120 && /120 s/.test(e.message));
  assert.equal(f2.calls.length, 1); assert.deepEqual(slept, [2000], 'no 2-minute stall');
  const f3 = mockFetch(() => json(429, null, { 'Retry-After': '1' }));
  const api3 = createApi({ auth, fetch: f3, sleep: async () => {}, max429: 2 });
  await assert.rejects(api3.me(), e => e.status === 429);
  assert.equal(f3.calls.length, 3, 'gives up after max429 retries');
  assert.equal(parseRetryAfter(null), 1); assert.equal(parseRetryAfter('7'), 7);
  assert.equal(parseRetryAfter(new Date(c.t + 5000).toUTCString(), c.t), 5);
});
test('API: errors carry status + Spotify reason', async () => {
  const c = clock();
  const f = mockFetch(() => json(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }));
  const api = createApi({ auth: connectedAuth({ fetch: f, now: c.now }), fetch: f });
  await assert.rejects(api.next(), e => e.status === 403 && e.reason === 'PREMIUM_REQUIRED');
  assert.equal(f.calls[0].url, 'https://api.spotify.com/v1/me/player/next');
  assert.equal(f.calls[0].method, 'POST');
});

// ------------------------------------------------------------------ station
function fakeDeviceFactory({ failWith = null } = {}) {
  const F = { calls: [], created: 0, handlers: null, dev: null };
  F.create = async opts => {
    F.created++;
    F.handlers = opts;
    let resolve, reject;
    const ready = new Promise((a, b) => { resolve = a; reject = b; });
    ready.catch(() => {});
    const log = name => (...a) => { F.calls.push([name, ...a]); return Promise.resolve(); };
    F.dev = { ready, activate: log('activate'), setVolume: log('setVolume'), pause: log('pause'), resume: log('resume'), next: log('next'), prev: log('prev'), disconnect: log('disconnect') };
    queueMicrotask(() => (failWith ? reject(Object.assign(new Error(failWith.message || failWith.kind), { kind: failWith.kind })) : resolve('DEV1')));
    return F.dev;
  };
  F.state = (o = {}) => F.handlers.onState({
    paused: false, position: 1000, duration: 200000,
    track_window: { current_track: { id: 't1', name: 'Song', artists: [{ name: 'A' }, { name: 'B' }], album: { name: 'Alb', images: [{ url: 'https://i.scdn.co/640', width: 640 }, { url: 'https://i.scdn.co/300', width: 300 }, { url: 'https://i.scdn.co/64', width: 64 }] }, duration_ms: 200000 } },
    ...o,
  });
  return F;
}
function apiRouter(routes) {
  return mockFetch(req => {
    const u = new URL(req.url);
    const key = `${req.method} ${u.pathname.replace('/v1', '')}`;
    const r = routes[key];
    if (typeof r === 'function') return r(req, u);
    if (r) return r();
    throw new Error('no route ' + key);
  });
}
function stationWith({ routes, device = fakeDeviceFactory(), product = 'premium', c = clock(), connected = true, local = memStorage() }) {
  const f = apiRouter({ 'GET /me': () => json(200, { id: 'u1', display_name: 'Driver', ...(product === undefined ? {} : { product }) }), ...routes });
  const auth = connected ? connectedAuth({ fetch: f, now: c.now }) : createAuth({ fetch: f, now: c.now, local: () => memStorage(), session: () => memStorage() });
  const timers = { setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms, 5)); t.unref?.(); return t; }, clearTimeout }; // unref: pollers never keep node alive
  const station = createSpotifyStation({ auth, api: createApi({ auth, fetch: f, sleep: async () => {} }), createDevice: device.create, local: () => local, now: c.now, rand: () => 0.5, timers, hidden: () => false });
  return { station, f, device, auth, c };
}
const apiCalls = f => f.calls.map(r => { const u = new URL(r.url); return `${r.method} ${u.pathname.replace('/v1', '')}${u.search}`; });

test('station: not connected -> message, T is a harmless no-op', async () => {
  const { station, f } = stationWith({ routes: {}, connected: false });
  assert.equal(station.id, 'spotify'); assert.equal(station.name, 'Spotify'); assert.equal(station.genre, 'Not connected');
  station.onSelect(); station.next(); station.setVolume(0.3); station.setPaused(true); station.setPaused(false); station.onDeselect();
  await station._settle();
  assert.equal(station.nowPlaying().message, MSG.notConnected);
  assert.equal(station.nowPlaying().title, null);
  assert.equal(f.calls.length, 0, 'nothing loads from Spotify before connecting');
});
test('station: premium -> SDK device, transfer (play:false) then Liked Songs shuffled', async () => {
  const local = memStorage();
  local.setItem('hillbomb.spotify.source.v1', JSON.stringify({ type: 'liked' }));
  const items = Array.from({ length: 3 }, (_, i) => ({ track: { uri: 'spotify:track:' + i } }));
  const { station, f, device } = stationWith({ local, routes: {
    'PUT /me/player': () => new Response(null, { status: 204 }),
    'GET /me/tracks': () => json(200, { items, total: 3 }),
    'PUT /me/player/play': () => new Response(null, { status: 204 }),
  } });
  station.setVolume(0.4);
  station.onSelect();
  await station._settle();
  assert.equal(device.created, 1);
  assert.equal(device.handlers.name, 'HILLBOMB Radio');
  assert.equal(device.handlers.volume, 0.4);
  const calls = apiCalls(f);
  assert.deepEqual(calls, ['GET /me', 'PUT /me/player', 'GET /me/tracks?limit=50&offset=0', 'PUT /me/player/play?device_id=DEV1']);
  assert.deepEqual(JSON.parse(f.calls[1].body), { device_ids: ['DEV1'], play: false });
  assert.deepEqual(JSON.parse(f.calls[3].body).uris.slice().sort(), ['spotify:track:0', 'spotify:track:1', 'spotify:track:2']);
  device.state();
  const np = station.nowPlaying();
  assert.equal(np.title, 'Song'); assert.equal(np.artist, 'A, B'); assert.equal(np.art, 'https://i.scdn.co/300'); assert.equal(np.durationMs, 200000);
  assert.equal(station.genre, 'Liked Songs');
});
test('station: playlist source uses context_uri + shuffle; queue source resumes', async () => {
  const { station, f } = stationWith({ routes: {
    'PUT /me/player': () => new Response(null, { status: 204 }),
    'PUT /me/player/shuffle': () => new Response(null, { status: 204 }),
    'PUT /me/player/play': () => new Response(null, { status: 204 }),
  } });
  station.setSource({ type: 'playlist', id: 'PL1', name: 'Road trip', total: 10 });
  station.onSelect();
  await station._settle();
  const play = f.calls.filter(r => r.url.includes('/me/player/play'));
  assert.deepEqual(JSON.parse(play[0].body), { context_uri: 'spotify:playlist:PL1', offset: { position: 5 } });
  assert.ok(apiCalls(f).includes('PUT /me/player/shuffle?state=true&device_id=DEV1'));
  assert.equal(station.genre, 'Road trip');
  station.setSource({ type: 'queue' }); // while selected + ready -> restart with the new source
  await station._settle();
  const last = f.calls.filter(r => r.url.includes('/me/player/play')).at(-1);
  assert.equal(last.body, undefined, 'resume = PUT play without a body');
});
test('station: setPaused pauses, resumes only if it was playing; deselect pauses', async () => {
  const { station, device } = stationWith({ routes: {
    'PUT /me/player': () => new Response(null, { status: 204 }), 'PUT /me/player/play': () => new Response(null, { status: 204 }),
  } });
  station.onSelect();
  await station._settle();
  device.state({ paused: false });
  station.setPaused(true);
  assert.deepEqual(device.calls.filter(c => c[0] === 'pause').length, 1);
  device.state({ paused: true });
  station.setPaused(false);
  await station._settle();
  assert.equal(device.calls.filter(c => c[0] === 'resume').length, 1, 'was playing -> resumed');
  device.state({ paused: true }); // user paused on their own
  station.setPaused(true); station.setPaused(false);
  await station._settle();
  assert.equal(device.calls.filter(c => c[0] === 'resume').length, 1, 'was paused -> stays paused');
  device.state({ paused: false });
  station.setVolume(0.25);
  assert.deepEqual(device.calls.filter(c => c[0] === 'setVolume').at(-1), ['setVolume', 0.25]);
  station.next(); station.prev();
  await station._settle();
  assert.equal(device.calls.filter(c => c[0] === 'next').length, 1);
  assert.equal(device.calls.filter(c => c[0] === 'prev').length, 1);
  station.onDeselect();
  assert.equal(device.calls.filter(c => c[0] === 'pause').length, 2);
});
test('station: menus open while the device starts -> playback waits for unpause', async () => {
  const { station, f } = stationWith({ routes: {
    'PUT /me/player': () => new Response(null, { status: 204 }), 'PUT /me/player/play': () => new Response(null, { status: 204 }),
  } });
  station.setPaused(true);
  station.onSelect();
  await station._settle();
  assert.ok(!apiCalls(f).some(c => c.startsWith('PUT /me/player/play')), 'nothing plays while paused');
  station.setPaused(false);
  await station._settle();
  assert.ok(apiCalls(f).some(c => c.startsWith('PUT /me/player/play')));
});
test('station: free account -> Premium message, remote now-playing, 403 on skip', async () => {
  const { station, f, device } = stationWith({ product: 'free', routes: {
    'GET /me/player/currently-playing': () => json(200, { is_playing: true, progress_ms: 5000, item: { type: 'track', id: 'r1', name: 'Phone Song', artists: [{ name: 'P' }], album: { name: 'X', images: [] }, duration_ms: 100000 } }),
    'POST /me/player/next': () => json(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }),
  } });
  station.onSelect();
  await station._settle();
  await new Promise(r => setTimeout(r, 30)); // first poll
  assert.equal(device.created, 0, 'no SDK for free accounts');
  const np = station.nowPlaying();
  assert.equal(np.title, 'Phone Song');
  assert.match(np.message, /Premium/);
  assert.equal(station.genre, 'Premium required');
  station.next();
  await station._settle();
  assert.match(station.nowPlaying().message, /Premium is required to skip tracks/);
  station.onDeselect();
  const polls = f.calls.filter(r => r.url.includes('currently-playing')).length;
  await new Promise(r => setTimeout(r, 30));
  assert.equal(f.calls.filter(r => r.url.includes('currently-playing')).length, polls, 'polling stops when tuned away');
});
test('station: product missing (2026 dev-mode apps) -> SDK attempt; account_error -> Premium message', async () => {
  const device = fakeDeviceFactory({ failWith: { kind: 'account', message: 'This functionality is restricted to premium users only' } });
  const { station } = stationWith({ product: undefined, device, routes: { 'GET /me/player/currently-playing': () => new Response(null, { status: 204 }) } });
  station.onSelect();
  await station._settle();
  assert.equal(device.created, 1);
  assert.equal(station.snapshot().mode, 'remote');
  assert.equal(station.snapshot().premium, false);
  assert.equal(station.nowPlaying().message, MSG.premium);
});
test('station: SDK initialization_error (no EME) -> remote mode with explanation', async () => {
  const device = fakeDeviceFactory({ failWith: { kind: 'init', message: 'Failed to initialize player' } });
  const { station } = stationWith({ device, routes: { 'GET /me/player/currently-playing': () => new Response(null, { status: 204 }) } });
  station.onSelect();
  await station._settle();
  assert.equal(station.snapshot().mode, 'remote');
  assert.match(station.nowPlaying().message, /DRM\/EME/);
});
test('station: autoplay blocked -> message; a user gesture activates + resumes', async () => {
  const { station, device } = stationWith({ routes: { 'PUT /me/player': () => new Response(null, { status: 204 }), 'PUT /me/player/play': () => new Response(null, { status: 204 }) } });
  station.onSelect();
  await station._settle();
  device.handlers.onAutoplayFailed();
  assert.equal(station.nowPlaying().message, MSG.autoplay);
  station.gesture();
  assert.deepEqual(device.calls.filter(c => c[0] === 'activate' || c[0] === 'resume').map(c => c[0]), ['activate', 'resume']);
  station.gesture();
  assert.equal(device.calls.filter(c => c[0] === 'activate').length, 1, 'activateElement once');
});
test('station: disconnect tears down the device and clears tokens', async () => {
  const { station, device, auth } = stationWith({ routes: { 'PUT /me/player': () => new Response(null, { status: 204 }), 'PUT /me/player/play': () => new Response(null, { status: 204 }) } });
  station.onSelect();
  await station._settle();
  station.disconnect();
  assert.ok(device.calls.some(c => c[0] === 'disconnect'));
  assert.equal(auth.isConnected(), false);
  assert.equal(station.snapshot().status, 'disconnected');
  assert.equal(station.nowPlaying().message, MSG.notConnected);
});
test('station: playlists (2026 "items" field and legacy "tracks") + helpers', async () => {
  const { station } = stationWith({ routes: {
    'GET /me/playlists': () => json(200, { items: [
      { id: 'a', name: 'New', uri: 'spotify:playlist:a', items: { total: 12 }, images: [{ url: 'https://i/a', width: 60 }], owner: { display_name: 'me' } },
      { id: 'b', name: 'Old', tracks: { total: 7 }, images: null },
      null,
    ], next: null }),
  } });
  const pl = await station.loadPlaylists();
  assert.deepEqual(pl.map(p => [p.id, p.total, p.uri]), [['a', 12, 'spotify:playlist:a'], ['b', 7, 'spotify:playlist:b']]);
  assert.equal(pickImage([{ url: 'x', width: 640 }, { url: 'y', width: 64 }], 100), 'x');
  assert.equal(pickImage([]), null);
  assert.deepEqual(normalizeSource({ type: 'bogus' }), { type: 'queue' });
  assert.deepEqual(normalizeSource(null), { type: 'queue' });
});

// ------------------------------------------------------------------ run
let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log('  ok   ' + t.name); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e)); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
