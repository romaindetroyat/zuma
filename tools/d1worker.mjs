/**
 * Pages advanced-mode worker serving the `--deploy` artefact from D1 (R2.0.20, plan 05-17, option B, D-42).
 *
 * The files are stored in the D1 database bound as ASSETS_DB (`ASSETS` is the reserved Pages static-asset binding),
 * table `blobs (key TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (key, part))`: `key` =
 * `sha256:<hex>` of the raw content, `data` = base64 pieces of at most 60 000 characters (each statement stays far
 * below D1's 100 KB statement limit). The path → { key, contentType, size } manifest is inlined in the generated
 * `_worker.js`, so a deployment is one worker file plus the rows it names. No dependency; its only network call is
 * the Cloudflare Access JWKS of the team (each request but the public files carries a JWT it validates).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { contentType, listFiles } from './pagesupload.mjs';

/** Name of the D1 binding of the Pages project (production and preview). */
export const D1_BINDING = 'ASSETS_DB';
/** Maximum base64 characters per row. */
export const CHUNK_CHARS = 60000;

const TEXT = new Set(['text/html', 'text/css', 'text/plain', 'application/javascript', 'application/json', 'application/manifest+json']);

/** Content-Type served by the worker: the Pages type, with `charset=utf-8` on text types. */
export function workerContentType(file) {
  const type = contentType(file);
  return TEXT.has(type) ? `${type}; charset=utf-8` : type;
}

/** Base64 of `buf` in pieces of at most CHUNK_CHARS characters (one empty piece for an empty file). */
export function chunks(buf) {
  const b64 = Buffer.from(buf).toString('base64');
  if (b64.length === 0) return [''];
  const out = [];
  for (let i = 0; i < b64.length; i += CHUNK_CHARS) out.push(b64.slice(i, i + CHUNK_CHARS));
  return out;
}

/**
 * Files to serve under `dir` (the Pages exclusions of listFiles, which also skip `_d1/`): { path, abs, size, key,
 * contentType }, sorted by path; `key` = `sha256:<hex>` of the raw bytes.
 */
export function blobFiles(dir) {
  return listFiles(dir).map(p => {
    const abs = path.join(dir, ...p.split('/'));
    const buf = fs.readFileSync(abs);
    return { path: p, abs, size: buf.length, key: `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`, contentType: workerContentType(p) };
  });
}

/** Worker manifest: { "/<path>": { key, contentType, size } }. */
export function workerManifest(files) {
  return Object.fromEntries(files.map(f => [`/${f.path}`, { key: f.key, contentType: f.contentType, size: f.size }]));
}

/** Team domain of Cloudflare Access (`<team>.cloudflareaccess.com`, the `auth_domain` of the organisation). */
const TEAM_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
/** Access application AUD tag: 64 hexadecimal digits. */
const AUD_TAG = /^[0-9a-f]{64}$/;

/** Checked Access settings of the worker: { issuer, certs, aud }; throws (French) when absent or malformed. */
export function accessSettings(access) {
  const team = access?.team;
  const aud = access?.aud;
  if (typeof team !== 'string' || !TEAM_DOMAIN.test(team)) throw new Error('Access : domaine d’équipe absent ou invalide (attendu <équipe>.cloudflareaccess.com) ; worker non généré.');
  if (typeof aud !== 'string' || !AUD_TAG.test(aud)) throw new Error('Access : AUD de l’application absent ou invalide (64 chiffres hexadécimaux) ; worker non généré.');
  const issuer = `https://${team}`;
  return { issuer, certs: `${issuer}/cdn-cgi/access/certs`, aud };
}

/**
 * Source of the `_worker.js` ES module for `manifest` (deterministic: same manifest, build and Access settings → same
 * source). `access` = { team: '<team>.cloudflareaccess.com', aud: '<64 hex>' } is mandatory (fail closed).
 *
 * Access (defence in depth): the edge may evaluate the « fichiers publics » Bypass on the raw path while the runtime
 * hands the worker a WHATWG-normalised URL (`/public/%2e%2e/assets/pack.json` → `/assets/pack.json`), so the worker
 * authenticates every request itself. Only GET / HEAD of the exact files of the manifest under `/public/` are served
 * without a token; everything else (navigation fallback, 404s, 405s, 304s included) first needs a valid Access JWT from
 * `Cf-Access-Jwt-Assertion` (else the `CF_Authorization` cookie): RS256 (RSASSA-PKCS1-v1_5 / SHA-256) against the
 * team JWKS (cached 1 h per isolate, kept at most 24 h when the refresh fails, refetched once on an unknown kid, at
 * most every 10 s), `iss` = the team URL, `aud` containing the app AUD, `exp` > now and `nbf` / `iat` ≤ now, 60 s of
 * skew. Otherwise → 403 « Accès refusé. » `no-store`, without detail.
 *
 * Serving: GET / HEAD only (405); exact path lookup (`/` → `/index.html`); `/cdn-cgi/` → 404; unknown navigation →
 * `/index.html`, else 404; `cache-control` `private` immutable for `/assets/` and hashed names, `no-cache` otherwise;
 * strong ETag = the content hash, If-None-Match → 304 without query; HEAD without query; body = the rows of the key
 * ordered by part, base64-decoded, size checked against the manifest (else 503), kept in a bounded per-isolate cache.
 * Never logs anything.
 */
export function generateWorker(manifest, { build = '', access } = {}) {
  const { issuer, certs, aud } = accessSettings(access);
  // JSON is valid JS; U+2028 / U+2029 are escaped for older parsers.
  const files = JSON.stringify(manifest).replace(/[\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16)}`);
  return `// Zuma — Pages worker generated by tools/d1worker.mjs (plan 05-17). Build ${JSON.stringify(String(build)).slice(1, -1)}. Do not edit.
// Serves the files of the --deploy artefact from the D1 database bound as ${D1_BINDING}, each request but the public
// files authenticated by its Cloudflare Access JWT. GET / HEAD only, no logging.
const BUILD = ${JSON.stringify(String(build))};
const FILES = new Map(Object.entries(${files}));
const SQL = 'SELECT data FROM blobs WHERE key = ? ORDER BY part';
const IMMUTABLE = 'private, max-age=31536000, immutable';
const HASHED = /[.-][0-9a-f]{8,}\\.[a-z0-9]+$/i;
const CACHE_MAX_ENTRIES = 64;
const CACHE_MAX_BYTES = 16 * 1024 * 1024;
const CACHE_MAX_ITEM = 2 * 1024 * 1024;
const cache = new Map();
let cached = 0;

// Cloudflare Access (injected by tools/deploy.mjs at build time).
const ISSUER = ${JSON.stringify(issuer)};
const AUD = ${JSON.stringify(aud)};
const CERTS = ${JSON.stringify(certs)};
const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const SKEW_S = 60;
const JWKS_TTL_MS = 3600 * 1000;
const JWKS_RETRY_MS = 10 * 1000;
const JWKS_STALE_MAX_MS = 24 * 3600 * 1000;
const TOKEN_MAX_CHARS = 8192;
const B64URL = /^[A-Za-z0-9_-]+$/;
let jwks = null; // { at, keys: Map<kid, CryptoKey> } of the last successful fetch
let jwksTried = 0;

function plain(status, text, extra) {
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-zuma-build': BUILD };
  return new Response(text, { status, headers: Object.assign(headers, extra || {}) });
}

function denied() {
  return new Response('Accès refusé.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

function bytesOf(part) {
  if (!B64URL.test(part)) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decode(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  } catch {
    return null;
  }
}

function jsonOf(part) {
  const bytes = bytesOf(part);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function fetchKeys() {
  try {
    const res = await fetch(CERTS, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const keys = new Map();
    for (const k of Array.isArray(data && data.keys) ? data.keys : []) {
      if (!k || k.kty !== 'RSA' || typeof k.kid !== 'string' || typeof k.n !== 'string' || typeof k.e !== 'string') continue;
      if (k.alg !== undefined && k.alg !== 'RS256') continue;
      if (k.use !== undefined && k.use !== 'sig') continue;
      try {
        keys.set(k.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, ext: true }, RS256, false, ['verify']));
      } catch {
        // an unusable key is skipped
      }
    }
    if (keys.size === 0) return null;
    jwks = { at: Date.now(), keys };
    return jwks;
  } catch {
    return null;
  }
}

/**
 * Fetches the JWKS for this request; never rejects. The in-flight promise is deliberately not shared between
 * requests: a fetch started by a request that is then cancelled would leave every other request awaiting it hanging
 * (Workers I/O is bound to the request that started it). Only the resulting keys are shared.
 */
function refreshKeys() {
  jwksTried = Date.now();
  return fetchKeys();
}

async function keyFor(kid) {
  const now = Date.now();
  if (!jwks || (now - jwks.at >= JWKS_TTL_MS && now - jwksTried >= JWKS_RETRY_MS)) await refreshKeys();
  // Keys kept after failed refreshes for a day at most (Access keeps a retired key valid for 7 days).
  if (jwks && Date.now() - jwks.at > JWKS_STALE_MAX_MS) return null;
  let key = jwks ? jwks.keys.get(kid) : undefined;
  // Unknown kid (rotation): one refetch, unless the keys were fetched less than JWKS_RETRY_MS ago.
  if (!key && Date.now() - jwksTried >= JWKS_RETRY_MS) {
    await refreshKeys();
    key = jwks ? jwks.keys.get(kid) : undefined;
  }
  return key || null;
}

function tokenOf(request) {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header !== null) return header;
  for (const pair of (request.headers.get('cookie') || '').split(';')) {
    const i = pair.indexOf('=');
    if (i > 0 && pair.slice(0, i).trim() === 'CF_Authorization') return pair.slice(i + 1).trim();
  }
  return null;
}

const finite = v => typeof v === 'number' && Number.isFinite(v);

/** True when \`token\` is an Access JWT of this application, signed by a current key of the team. */
async function validToken(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX_CHARS) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const header = jsonOf(parts[0]);
  const claims = jsonOf(parts[1]);
  const signature = bytesOf(parts[2]);
  if (!header || !claims || !signature) return false;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) return false;
  if (claims.iss !== ISSUER) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(AUD)) return false;
  const now = Date.now() / 1000;
  if (!finite(claims.exp) || claims.exp <= now - SKEW_S) return false;
  if (claims.nbf !== undefined && (!finite(claims.nbf) || claims.nbf > now + SKEW_S)) return false;
  if (claims.iat !== undefined && (!finite(claims.iat) || claims.iat > now + SKEW_S)) return false;
  const key = await keyFor(header.kid);
  if (!key) return false;
  return crypto.subtle.verify(RS256, key, signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
}

async function authorized(request) {
  try {
    return (await validToken(tokenOf(request))) === true;
  } catch {
    return false;
  }
}

/** Exact public file read (no token needed): GET / HEAD of a manifest entry under /public/. */
function isPublic(method, path) {
  return (method === 'GET' || method === 'HEAD') && path !== null && path.startsWith('/public/') && FILES.has(path);
}

function cacheFor(path) {
  return path.startsWith('/assets/') || HASHED.test(path) ? IMMUTABLE : 'no-cache';
}
function isNavigation(request) {
  return request.headers.get('sec-fetch-mode') === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

function isCdnCgi(path) {
  return path === '/cdn-cgi' || path.startsWith('/cdn-cgi/');
}

function notModified(header, etag) {
  if (!header) return false;
  return header.split(',').some(tag => {
    const t = tag.trim();
    return t === '*' || t.replace(/^W\\//, '') === etag;
  });
}

function decode(b64) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function remember(key, bytes) {
  if (bytes.length > CACHE_MAX_ITEM) return;
  cache.set(key, bytes);
  cached += bytes.length;
  for (const [k, v] of cache) {
    if (cache.size <= CACHE_MAX_ENTRIES && cached <= CACHE_MAX_BYTES) break;
    cache.delete(k);
    cached -= v.length;
  }
}

async function body(db, entry) {
  const hit = cache.get(entry.key);
  if (hit) {
    cache.delete(entry.key);
    cache.set(entry.key, hit);
    return hit;
  }
  let rows;
  try {
    rows = (await db.prepare(SQL).bind(entry.key).all()).results || [];
  } catch {
    return null;
  }
  if (rows.length === 0) return null;
  let bytes;
  try {
    bytes = decode(rows.map(r => r.data).join(''));
  } catch {
    return null;
  }
  if (bytes.length !== entry.size) return null;
  remember(entry.key, bytes);
  return bytes;
}

export default {
  async fetch(request, env) {
    const raw = new URL(request.url).pathname;
    let path = null;
    try {
      path = decodeURIComponent(raw);
    } catch {
      path = null;
    }
    const method = request.method;
    if (!isPublic(method, path) && !(await authorized(request))) return denied();
    if (method !== 'GET' && method !== 'HEAD') return plain(405, 'Méthode non autorisée.', { allow: 'GET, HEAD' });
    if (isCdnCgi(raw) || path === null || isCdnCgi(path)) return plain(404, 'Introuvable.');
    if (path === '/') path = '/index.html';
    let entry = FILES.get(path);
    if (!entry) {
      if (!isNavigation(request)) return plain(404, 'Introuvable.');
      path = '/index.html';
      entry = FILES.get(path);
      if (!entry) return plain(404, 'Introuvable.');
    }
    const etag = '"' + entry.key.slice(entry.key.indexOf(':') + 1) + '"';
    const cacheControl = cacheFor(path);
    if (notModified(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers: { etag, 'cache-control': cacheControl } });
    }
    const headers = { 'content-type': entry.contentType, 'cache-control': cacheControl, etag, 'x-content-type-options': 'nosniff' };
    if (method === 'HEAD') return new Response(null, { status: 200, headers: Object.assign(headers, { 'content-length': String(entry.size) }) });
    const db = env && env.${D1_BINDING};
    if (!db) return plain(500, 'Liaison D1 « ${D1_BINDING} » absente.');
    const bytes = await body(db, entry);
    if (!bytes) return plain(503, 'Fichier pas encore disponible, réessayez dans une minute.', { 'retry-after': '60' });
    return new Response(bytes, { status: 200, headers });
  },
};
`;
}
