// PKCE helpers (RFC 7636) for Spotify's Authorization Code flow. Pure functions: no DOM, no storage.
// Work in browsers (secure contexts: https or http://127.0.0.1) and in Node 20+ through globalThis.crypto.

export const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const ALNUM = UNRESERVED.slice(0, 62);
export const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

function webCrypto() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('Web Crypto is not available in this browser');
  return c;
}

/** Uniform random string over `alphabet` (rejection sampling, so no modulo bias). */
export function randomString(length = 64, alphabet = UNRESERVED) {
  const n = alphabet.length, limit = 256 - (256 % n), out = [];
  const c = webCrypto();
  while (out.length < length) {
    const buf = c.getRandomValues(new Uint8Array(Math.max(16, length * 2)));
    for (let i = 0; i < buf.length && out.length < length; i++) if (buf[i] < limit) out.push(alphabet[buf[i] % n]);
  }
  return out.join('');
}

/** A code_verifier: 43..128 chars from the RFC 7636 unreserved set. */
export function createVerifier(length = 64) {
  if (!(length >= 43 && length <= 128)) throw new RangeError('PKCE verifier length must be 43..128');
  return randomString(length);
}

/** The OAuth `state` value (CSRF guard): 32 alphanumeric chars, about 190 bits. */
export function createState(length = 32) { return randomString(length, ALNUM); }

export function base64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text) {
  const subtle = webCrypto().subtle;
  if (!subtle) throw new Error('Spotify login needs a secure page: open the game over https or at http://127.0.0.1');
  return new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** S256 code_challenge = BASE64URL(SHA256(ASCII(code_verifier))). */
export async function challengeFor(verifier) { return base64url(await sha256(verifier)); }

export async function createPkce(length = 64) {
  const verifier = createVerifier(length);
  return { verifier, challenge: await challengeFor(verifier), method: 'S256' };
}
