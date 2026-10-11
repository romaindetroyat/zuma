// R2.0.20 — hébergement privé, option B (plan 05-17) : le jeu est servi par un `_worker.js` Pages (mode avancé) qui
// lit chaque fichier dans D1 (table `blobs`, morceaux base64). Tout est vérifié hors réseau : worker généré exécuté
// dans node:vm avec une D1 simulée, client D1 / liaison / déploiement sur une API simulée, dry run sur un artefact
// temporaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { blobFiles, workerManifest, workerContentType, chunks, generateWorker, D1_BINDING, CHUNK_CHARS } from '../tools/d1worker.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-r220-d1-'));
const write = (root, rel, data) => {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** Pseudo-random bytes (deterministic) so the base64 of a file spans several chunks. */
const noise = n => Buffer.from(Array.from({ length: n }, (_, i) => (i * 7919 + (i >> 3) * 31) & 255));

/** A small --deploy-like tree (index, sw, version, manifest, modules, pack files, a hashed file, exclusions). */
function tree() {
  const dir = tmp();
  const files = {
    'index.html': '<!doctype html><title>Zuma</title>',
    'sw.js': "const ASSETS_CACHE = 'zuma-assets-abcdef012345';",
    'version.json': '{"version":"2.0.20"}',
    'public/manifest.webmanifest': '{"name":"Zuma"}',
    'public/style.css': 'body{}',
    'public/icon.svg': '<svg/>',
    'js/main.js': 'export {};',
    'assets/pack.json': '{}',
    'assets/images/frog.gif': 'GIF89a-frog',
    'assets/sounds/pop.ogg': 'OggS-pop',
    'assets/music/zuma.mo3': noise(100000),
    'assets/empty.txt': '',
    'assets/copy.gif': 'GIF89a-frog',
    'js/chunk-0123abcd.js': 'export const x = 1;',
    '_worker.js': 'old worker',
    '_d1/manifest.json': '{}',
    '.DS_Store': 'x',
  };
  for (const [rel, data] of Object.entries(files)) write(dir, rel, data);
  return { dir, files };
}
const bytesOf = (files, rel) => Buffer.from(files[rel]);

// ------------------------------------------------------------ fichiers, morceaux, manifeste, types

test('blobFiles: Pages exclusions plus _d1/, key = sha256:<hex of the raw content>, size and type', () => {
  const { dir, files } = tree();
  const list = blobFiles(dir);
  const paths = list.map(f => f.path);
  assert.ok(!paths.some(p => p === '_worker.js' || p.startsWith('_d1/') || p === '.DS_Store'), paths.join(' '));
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(list.length, Object.keys(files).length - 3);
  for (const f of list) {
    assert.equal(f.key, `sha256:${sha(bytesOf(files, f.path))}`, f.path);
    assert.equal(f.size, bytesOf(files, f.path).length, f.path);
    assert.equal(f.contentType, workerContentType(f.path), f.path);
    assert.equal(f.abs, path.join(dir, ...f.path.split('/')));
  }
  const same = list.filter(f => f.path === 'assets/copy.gif' || f.path === 'assets/images/frog.gif');
  assert.equal(same[0].key, same[1].key, 'identical contents share one key');
});

test('chunks: base64 cut in pieces of at most 60 000 characters, joined back to the content; one empty piece for an empty file', () => {
  assert.equal(CHUNK_CHARS, 60000);
  const buf = noise(100000);
  const parts = chunks(buf);
  assert.equal(parts.length, Math.ceil(buf.toString('base64').length / 60000));
  assert.ok(parts.length >= 3);
  assert.ok(parts.every(p => p.length <= 60000 && p.length > 0));
  assert.ok(parts.slice(0, -1).every(p => p.length === 60000));
  assert.equal(parts.join(''), buf.toString('base64'));
  assert.deepEqual(chunks(Buffer.alloc(0)), ['']);
  assert.deepEqual(chunks(Buffer.from('abc')), ['YWJj']);
});

test('workerContentType: charset on text types; binary and unknown types unchanged', () => {
  const want = {
    'index.html': 'text/html; charset=utf-8', 'js/main.js': 'application/javascript; charset=utf-8',
    'public/style.css': 'text/css; charset=utf-8', 'version.json': 'application/json; charset=utf-8',
    'public/manifest.webmanifest': 'application/manifest+json; charset=utf-8', 'r.txt': 'text/plain; charset=utf-8',
    'public/icon.svg': 'image/svg+xml', 'a.gif': 'image/gif', 'b.jpg': 'image/jpeg', 'c.png': 'image/png',
    's.ogg': 'audio/ogg', 's.m4a': 'audio/mp4', 'music/zuma.mo3': 'application/octet-stream', 'noext': 'application/octet-stream',
  };
  for (const [file, type] of Object.entries(want)) assert.equal(workerContentType(file), type, file);
});

test('workerManifest maps "/<path>" to { key, contentType, size }', () => {
  const m = workerManifest([{ path: 'index.html', key: 'sha256:aa', contentType: 'text/html; charset=utf-8', size: 3, abs: '/x' }]);
  assert.deepEqual(m, { '/index.html': { key: 'sha256:aa', contentType: 'text/html; charset=utf-8', size: 3 } });
});

// ------------------------------------------------------------ worker généré (node:vm, D1 simulée)

/** Loads the generated module in a fresh vm context that only has the Web globals a Pages worker gets. */
function loadWorker(source, { fetch = jwksServer().fetch, clock = { offset: 0 } } = {}) {
  assert.equal(source.match(/^export default /gm)?.length, 1, 'exactly one default export');
  const script = source.replace(/^export default /m, 'globalThis.worker = ');
  const context = vm.createContext({ Response, Headers, URL, atob, crypto: globalThis.crypto, fetch, TextEncoder, TextDecoder, clock, realNow: Date.now });
  // The test clock: Date.now() inside the worker = real time + clock.offset (ms).
  vm.runInContext('Date.now = () => realNow() + clock.offset;', context);
  vm.runInContext(script, context, { filename: '_worker.js' });
  return context.worker;
}

// ------------------------------------------------------------ Cloudflare Access JWT (RS256, team JWKS)

const TEAM = 'equipe-test.cloudflareaccess.com';
const ISS = `https://${TEAM}`;
const CERTS = `${ISS}/cdn-cgi/access/certs`;
const AUD = 'c0ffee'.repeat(10) + 'c0de';
const ACCESS = { team: TEAM, aud: AUD };
const subtle = globalThis.crypto.subtle;
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

/** RSA key pair with its JWKS entry (shape of https://<team>.cloudflareaccess.com/cdn-cgi/access/certs). */
async function signingKey(kid) {
  const { privateKey, publicKey } = await subtle.generateKey(RSA, true, ['sign', 'verify']);
  const { n, e } = await subtle.exportKey('jwk', publicKey);
  return { kid, privateKey, jwk: { kid, kty: 'RSA', alg: 'RS256', use: 'sig', e, n } };
}
const K1 = await signingKey('kid-1');
const K2 = await signingKey('kid-2');
const b64u = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const nowS = (clock = { offset: 0 }) => Math.floor((Date.now() + clock.offset) / 1000);

/** Claims of an Access application token, valid for one hour at `clock`. */
const claims = (over = {}, clock) => {
  const t = nowS(clock);
  return { aud: [AUD], email: 'joueur@example.org', exp: t + 3600, iat: t - 5, nbf: t - 5, iss: ISS, type: 'app', identity_nonce: 'n', sub: 'u-1', country: 'FR', ...over };
};

/** Signed JWT; `key` signs, `header` overrides the protected header (kid defaults to the signing key). */
async function jwt(body = claims(), { key = K1, header = {} } = {}) {
  const head = b64u({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header });
  const payload = b64u(body);
  const sig = Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(`${head}.${payload}`))).toString('base64url');
  return `${head}.${payload}.${sig}`;
}

/** Fake team JWKS endpoint: serves `keys` (mutable), counts fetches, can fail. */
function jwksServer(keys = [K1.jwk]) {
  const server = {
    keys, urls: [], fail: false,
    fetch: async (url, _init) => {
      server.urls.push(String(url instanceof Request ? url.url : url));
      assert.equal(String(url instanceof Request ? url.url : url), CERTS, 'only the team certs URL is fetched');
      if (server.fail === 'throw') throw new TypeError('network');
      if (server.fail) return new Response('oops', { status: 500 });
      return new Response(JSON.stringify({ keys: server.keys, public_cert: { kid: 'x', cert: '-' }, public_certs: [] }), { headers: { 'content-type': 'application/json' } });
    },
  };
  return server;
}

const SELECT = 'SELECT data FROM blobs WHERE key = ? ORDER BY part';

/** Fake D1 binding holding the tree's contents as rows (key, part, data); records every query. */
function fakeD1(list, { drop = [], truncate = [] } = {}) {
  const rows = [];
  const seen = new Set();
  for (const f of list) {
    if (drop.includes(f.path) || seen.has(f.key)) continue;
    seen.add(f.key);
    let parts = chunks(fs.readFileSync(f.abs));
    if (truncate.includes(f.path)) parts = parts.slice(0, -1);
    parts.forEach((data, part) => rows.push({ key: f.key, part, data }));
  }
  rows.reverse(); // storage order is irrelevant: the query orders by part
  const queries = [];
  return {
    queries,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            all: async () => {
              queries.push({ sql, args });
              assert.equal(sql, SELECT);
              assert.equal(args.length, 1);
              const results = rows.filter(r => r.key === args[0]).sort((a, b) => a.part - b.part).map(r => ({ data: r.data }));
              return { results, success: true, meta: {} };
            },
          };
        },
      };
    },
  };
}

/**
 * Generated worker over the tree, a fake D1 and a fake JWKS. `req(p, init)` sends a valid Access JWT in
 * Cf-Access-Jwt-Assertion; `anon(p, init)` sends the request as is.
 */
async function setup(opts = {}) {
  const { dir, files } = tree();
  const list = blobFiles(dir);
  const source = generateWorker(workerManifest(list), { build: '2.0.20+T', access: ACCESS });
  const jwks = jwksServer();
  const clock = { offset: 0 };
  const worker = loadWorker(source, { fetch: jwks.fetch, clock });
  const db = fakeD1(list, opts);
  const env = { [D1_BINDING]: db };
  const token = await jwt();
  const anon = (p, init = {}) => worker.fetch(new Request(`https://zuma-x.pages.dev${p}`, init), env, {});
  const req = (p, init = {}) => anon(p, { ...init, headers: { 'cf-access-jwt-assertion': token, ...(init.headers ?? {}) } });
  const keyOf = rel => list.find(f => f.path === rel).key;
  return { dir, files, list, source, worker, db, env, req, anon, keyOf, jwks, clock, token };
}

const NAV = { headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html,application/xhtml+xml' } };
// Private: the pack is only ever served to an authenticated player, never stored by a shared cache.
const IMMUTABLE = 'private, max-age=31536000, immutable';

test('worker: / and /index.html serve index.html (text/html, no-cache, strong ETag, body from D1)', async () => {
  const { req, files, keyOf, db } = await setup();
  for (const p of ['/', '/index.html', '/?utm=1']) {
    const res = await req(p);
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.equal(res.headers.get('etag'), `"${keyOf('index.html').slice('sha256:'.length)}"`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await res.text(), files['index.html']);
  }
  assert.ok(db.queries.length >= 1 && db.queries.every(q => q.args[0] === keyOf('index.html')), 'key passed as a bound parameter');
});

test('worker: content types, cache classes and exact bytes (multi-part and empty files) per path', async () => {
  const { req, files } = await setup();
  const want = {
    '/sw.js': ['application/javascript; charset=utf-8', 'no-cache'],
    '/version.json': ['application/json; charset=utf-8', 'no-cache'],
    '/public/manifest.webmanifest': ['application/manifest+json; charset=utf-8', 'no-cache'],
    '/public/style.css': ['text/css; charset=utf-8', 'no-cache'],
    '/public/icon.svg': ['image/svg+xml', 'no-cache'],
    '/js/main.js': ['application/javascript; charset=utf-8', 'no-cache'],
    '/js/chunk-0123abcd.js': ['application/javascript; charset=utf-8', IMMUTABLE],
    '/assets/pack.json': ['application/json; charset=utf-8', IMMUTABLE],
    '/assets/images/frog.gif': ['image/gif', IMMUTABLE],
    '/assets/sounds/pop.ogg': ['audio/ogg', IMMUTABLE],
    '/assets/music/zuma.mo3': ['application/octet-stream', IMMUTABLE],
    '/assets/empty.txt': ['text/plain; charset=utf-8', IMMUTABLE],
  };
  for (const [p, [type, cache]] of Object.entries(want)) {
    const res = await req(p);
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('content-type'), type, p);
    assert.equal(res.headers.get('cache-control'), cache, p);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(bytesOf(files, p.slice(1))), `${p}: same bytes`);
  }
});

test('worker: decoded bodies are cached per isolate (second GET without query), cache bounded', async () => {
  const { req, db, source } = await setup();
  await req('/assets/music/zuma.mo3');
  const n = db.queries.length;
  const again = await req('/assets/music/zuma.mo3');
  assert.equal(again.status, 200);
  assert.equal((await again.arrayBuffer()).byteLength, 100000);
  assert.equal(db.queries.length, n, 'served from the isolate cache');
  assert.match(source, /CACHE_MAX_ENTRIES = \d+/);
  assert.match(source, /CACHE_MAX_BYTES = \d+/);
});

test('worker: If-None-Match (exact, list, weak, *) → 304 without query; another tag → 200', async () => {
  const { req, keyOf, db } = await setup();
  const etag = `"${keyOf('assets/images/frog.gif').slice(7)}"`;
  for (const inm of [etag, `"other", ${etag}`, `W/${etag}`, '*']) {
    const before = db.queries.length;
    const res = await req('/assets/images/frog.gif', { headers: { 'if-none-match': inm } });
    assert.equal(res.status, 304, inm);
    assert.equal(res.headers.get('etag'), etag);
    assert.equal(res.headers.get('cache-control'), IMMUTABLE);
    assert.equal(await res.text(), '');
    assert.equal(db.queries.length, before, `${inm}: no query`);
  }
  const res = await req('/assets/images/frog.gif', { headers: { 'if-none-match': '"other"' } });
  assert.equal(res.status, 200);
});

test('worker: HEAD answers the headers (content-length from the manifest) without body or query', async () => {
  const { req, files, db } = await setup();
  const res = await req('/sw.js', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.equal(res.headers.get('content-length'), String(Buffer.byteLength(files['sw.js'])));
  assert.equal(await res.text(), '');
  assert.equal(db.queries.length, 0);
});

test('worker: unknown navigation → index.html; unknown resource → 404; /cdn-cgi/ → 404 even as a navigation', async () => {
  const { req, files } = await setup();
  for (const p of ['/jeu', '/niveaux/3', '/public/']) {
    const res = await req(p, NAV);
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8', p);
    assert.equal(res.headers.get('cache-control'), 'no-cache', p);
    assert.equal(await res.text(), files['index.html'], p);
  }
  const accepted = await req('/ailleurs', { headers: { accept: 'text/html' } });
  assert.equal(accepted.status, 200, 'Accept: text/html counts as a navigation');
  for (const p of ['/assets/absent.gif', '/js/absent.js', '/_worker.js', '/_d1/manifest.json', '/.DS_Store', '/index.htm', '/constructor', '/__proto__']) {
    const res = await req(p);
    assert.equal(res.status, 404, p);
    assert.equal(res.headers.get('cache-control'), 'no-store', p);
  }
  for (const p of ['/cdn-cgi/access/authorized', '/cdn-cgi/access/logout', '/cdn-cgi', '/%63dn-cgi/access/x']) {
    for (const init of [{}, NAV]) {
      const res = await req(p, init);
      assert.equal(res.status, 404, `${p} ${init.headers ? 'navigation' : ''}`);
    }
  }
  const traversal = await req('/public/..%2Fassets/pack.json');
  assert.equal(traversal.status, 404, 'no path normalisation beyond exact lookup');
  const bad = await req('/%E0%A4%A');
  assert.equal(bad.status, 404, 'malformed escapes → 404');
});

test('worker: GET / HEAD only (405 with Allow); absent or incomplete file → 503 retry-after; missing binding → 500', async () => {
  const { req, worker } = await setup();
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await req('/index.html', { method, ...(['POST', 'PUT', 'PATCH'].includes(method) ? { body: 'x' } : {}) });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }
  const dropped = await setup({ drop: ['assets/pack.json'], truncate: ['assets/music/zuma.mo3'] });
  for (const p of ['/assets/pack.json', '/assets/music/zuma.mo3']) {
    const res = await dropped.req(p);
    assert.equal(res.status, 503, p);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  const unbound = await worker.fetch(new Request('https://zuma-x.pages.dev/index.html', { headers: { 'cf-access-jwt-assertion': await jwt() } }), {}, {});
  assert.equal(unbound.status, 500);
  assert.equal(unbound.headers.get('cache-control'), 'no-store');
});

test('worker source: ES module without import, console, process, Buffer or eval; deterministic; importable', async () => {
  const { source, list } = await setup();
  assert.doesNotMatch(source, /^\s*import\s/m, 'no import');
  assert.doesNotMatch(source, /\bconsole\b|\bprocess\b|\bBuffer\b|\beval\b|\brequire\(/, 'never logs, Node-free');
  assert.ok(source.includes(SELECT), 'the one query, with a bound parameter');
  assert.match(source, /2\.0\.20\+T/, 'build stamp recorded');
  assert.equal(generateWorker(workerManifest(list), { build: '2.0.20+T', access: ACCESS }), source, 'same input → same source');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(typeof mod.default.fetch, 'function');
  for (const f of list) {
    assert.ok(source.includes(JSON.stringify(`/${f.path}`)), f.path);
    assert.ok(source.includes(f.key), f.key);
  }
});

// ------------------------------------------------------------ worker : Cloudflare Access JWT (défense en profondeur)

const DENIED = 'Accès refusé.';
async function assertDenied(res, what) {
  assert.equal(res.status, 403, what);
  assert.equal(res.headers.get('cache-control'), 'no-store', what);
  assert.equal(res.headers.get('etag'), null, what);
  assert.equal(res.headers.get('x-zuma-build'), null, `${what}: no build stamp for an anonymous caller`);
  assert.equal(await res.text(), DENIED, `${what}: no detail`);
}
const withJwt = (token, init = {}) => ({ ...init, headers: { 'cf-access-jwt-assertion': token, ...(init.headers ?? {}) } });

test('generateWorker refuses to build without a valid Access configuration (fail closed)', () => {
  const m = workerManifest([{ path: 'index.html', key: 'sha256:aa', contentType: 'text/html; charset=utf-8', size: 3 }]);
  for (const access of [undefined, null, {}, { team: TEAM }, { aud: AUD }, { team: TEAM, aud: 'x' }, { team: TEAM, aud: AUD.slice(1) },
    { team: 'https://equipe.cloudflareaccess.com', aud: AUD }, { team: 'evil.example.org', aud: AUD }, { team: 'a.cloudflareaccess.com/x', aud: AUD }]) {
    assert.throws(() => generateWorker(m, { build: 'b', access }), /Access/, JSON.stringify(access));
  }
  const source = generateWorker(m, { build: 'b', access: ACCESS });
  assert.ok(source.includes(JSON.stringify(ISS)) && source.includes(JSON.stringify(AUD)), 'issuer and AUD inlined');
  assert.ok(source.includes(JSON.stringify(CERTS)), 'team certs URL inlined');
  assert.match(source, /RSASSA-PKCS1-v1_5/);
  assert.match(source, /SHA-256/);
});

test('worker: a valid Access JWT (header, else CF_Authorization cookie) opens every protected path', async () => {
  const { anon, token, files } = await setup();
  const ok = await anon('/assets/pack.json', withJwt(token));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), files['assets/pack.json']);
  for (const cookie of [`CF_Authorization=${token}`, `theme=dark; CF_Authorization=${token}; other=1`]) {
    const res = await anon('/index.html', { headers: { cookie } });
    assert.equal(res.status, 200, cookie.slice(0, 20));
    assert.equal(await res.text(), files['index.html']);
  }
  const nav = await anon('/jeu', withJwt(token, NAV));
  assert.equal(nav.status, 200, 'navigation fallback with a JWT');
  // The header wins: an invalid header is not rescued by a valid cookie.
  await assertDenied(await anon('/index.html', { headers: { 'cf-access-jwt-assertion': 'x.y.z', cookie: `CF_Authorization=${token}` } }), 'bad header + good cookie');
  await assertDenied(await anon('/index.html', { headers: { cookie: `XCF_Authorization=${token}` } }), 'other cookie name');
});

test('worker: missing, expired, future, wrong aud / iss, bad signature, unknown kid, alg none / HS256 and malformed JWTs → 403 « Accès refusé. »', async () => {
  const { anon, db, clock } = await setup();
  const t = nowS(clock);
  const forged = await jwt(claims(), { key: K2, header: { kid: K1.kid } });
  const valid = await jwt();
  const [h, p] = valid.split('.');
  const cases = {
    missing: null,
    empty: '',
    expired: await jwt(claims({ exp: t - 61 })),
    'no exp': await jwt(claims({ exp: undefined })),
    'exp as string': await jwt(claims({ exp: String(t + 3600) })),
    'nbf in the future': await jwt(claims({ nbf: t + 120 })),
    'iat in the future': await jwt(claims({ iat: t + 120 })),
    'wrong aud': await jwt(claims({ aud: ['f'.repeat(64)] })),
    'aud missing': await jwt(claims({ aud: undefined })),
    'aud as a prefix': await jwt(claims({ aud: [AUD.slice(0, 32)] })),
    'wrong iss': await jwt(claims({ iss: 'https://autre.cloudflareaccess.com' })),
    'iss with a trailing slash': await jwt(claims({ iss: `${ISS}/` })),
    'bad signature (other key, same kid)': forged,
    'tampered payload': `${h}.${b64u(claims({ email: 'intrus@example.org' }))}.${valid.split('.')[2]}`,
    'unknown kid': await jwt(claims(), { key: K2 }),
    'no kid': await jwt(claims(), { header: { kid: undefined } }),
    'alg none': `${b64u({ alg: 'none', kid: K1.kid })}.${p}.`,
    'alg none with signature': `${b64u({ alg: 'none', kid: K1.kid })}.${p}.${valid.split('.')[2]}`,
    'alg HS256': await jwt(claims(), { header: { alg: 'HS256' } }),
    'two parts': `${h}.${p}`,
    'four parts': `${valid}.x`,
    'not base64url': `${h}.${p}.!!!`,
    'payload not JSON': `${h}.${b64u('nope')}.${valid.split('.')[2]}`,
    'header not an object': `${b64u('"RS256"')}.${p}.${valid.split('.')[2]}`,
    oversized: `${h}.${b64u({ ...claims(), pad: 'x'.repeat(20000) })}.${valid.split('.')[2]}`,
  };
  for (const [what, token] of Object.entries(cases)) {
    const init = token === null ? {} : withJwt(token);
    await assertDenied(await anon('/assets/pack.json', init), what);
    await assertDenied(await anon('/jeu', { ...init, headers: { ...(init.headers ?? {}), ...NAV.headers } }), `${what} (navigation)`);
  }
  assert.equal(db.queries.length, 0, 'nothing is read from D1 for a refused request');
  assert.equal((await anon('/assets/pack.json', withJwt(valid))).status, 200, 'control: the valid token passes');
  // 60 s of clock skew are tolerated on exp, nbf and iat.
  for (const over of [{ exp: t - 30 }, { nbf: t + 30 }, { iat: t + 30 }, { aud: AUD }, { aud: ['autre', AUD] }]) {
    assert.equal((await anon('/index.html', withJwt(await jwt(claims(over))))).status, 200, JSON.stringify(over));
  }
});

test('worker: every protected answer needs the JWT (methods, HEAD, If-None-Match, 404s, /cdn-cgi) — no oracle', async () => {
  const { anon, keyOf } = await setup();
  const etag = `"${keyOf('assets/pack.json').slice(7)}"`;
  const probes = [
    ['/assets/pack.json', { method: 'HEAD' }], ['/assets/pack.json', { headers: { 'if-none-match': etag } }],
    ['/assets/pack.json', { method: 'POST', body: 'x' }], ['/assets/absent.gif', {}], ['/', {}], ['/index.html', NAV],
    ['/sw.js', {}], ['/version.json', {}], ['/js/main.js', {}], ['/cdn-cgi/access/x', {}], ['/%E0%A4%A', {}],
    ['/_worker.js', {}],
  ];
  for (const [p, init] of probes) await assertDenied(await anon(p, init), `${init.method ?? 'GET'} ${p}`);
});

test('worker: only the exact files under /public/ are served without JWT; traversal stays protected', async () => {
  const { anon, files, req } = await setup();
  for (const rel of ['public/manifest.webmanifest', 'public/style.css', 'public/icon.svg']) {
    const res = await anon(`/${rel}`);
    assert.equal(res.status, 200, rel);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(bytesOf(files, rel)), rel);
    assert.equal(res.headers.get('cache-control'), 'no-cache', rel);
    assert.equal((await anon(`/${rel}`, { method: 'HEAD' })).status, 200, `HEAD ${rel}`);
  }
  // The WHATWG parser (the Request constructor, as in the Workers runtime) resolves %2e%2e before the worker sees it.
  const sneaky = new Request('https://zuma-x.pages.dev/public/%2e%2e/assets/pack.json');
  assert.equal(new URL(sneaky.url).pathname, '/assets/pack.json');
  for (const p of ['/public/%2e%2e/assets/pack.json', '/public/%2E%2E/index.html', '/public/./../assets/pack.json', '/public/..%2Fassets/pack.json',
    '/public/..%2fassets%2fpack.json', '/public/', '/public', '/public/absent.css', '/public/manifest.webmanifest/', '/public/style.css%00',
    '/Public/style.css', '/public//style.css', '/public/%2e%2e%2fassets/pack.json']) {
    await assertDenied(await anon(p), p);
    await assertDenied(await anon(p, NAV), `${p} (navigation)`);
  }
  await assertDenied(await anon('/public/style.css', { method: 'POST', body: 'x' }), 'public file, other method: still no detail');
  assert.equal((await req('/public/style.css', { method: 'POST', body: 'x' })).status, 405, 'with a JWT: 405');
});

test('worker: JWKS fetched once per isolate, kept 1 h, refetched once on an unknown kid (at most every 10 s); fetch failures → 403; stale keys kept on a failed refresh', async () => {
  const { anon, jwks, clock } = await setup();
  for (let i = 0; i < 4; i++) assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock))))).status, 200);
  assert.deepEqual(jwks.urls, [CERTS], 'one fetch for several requests');
  // Rotation: kid-2 appears; a token signed by kid-2 triggers one refetch and passes.
  jwks.keys = [K1.jwk, K2.jwk];
  clock.offset += 11_000;
  assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K2 })))).status, 200);
  assert.equal(jwks.urls.length, 2, 'refetched on the unknown kid');
  // An unknown kid right after a fetch: no new fetch (cooldown), 403.
  const K3 = await signingKey('kid-3');
  await assertDenied(await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K3 }))), 'unknown kid in the cooldown');
  assert.equal(jwks.urls.length, 2, 'no fetch during the cooldown');
  clock.offset += 11_000;
  await assertDenied(await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K3 }))), 'unknown kid, absent from the JWKS');
  assert.equal(jwks.urls.length, 3, 'exactly one refetch per unknown kid');
  // Within the hour: no refetch for known kids; after it, one refetch.
  assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock))))).status, 200);
  assert.equal(jwks.urls.length, 3);
  clock.offset += 3_601_000;
  assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock))))).status, 200);
  assert.equal(jwks.urls.length, 4, 'refetched after one hour');
  // A key removed from the JWKS stops working after the next refresh.
  jwks.keys = [K2.jwk];
  clock.offset += 3_601_000;
  await assertDenied(await anon('/index.html', withJwt(await jwt(claims({}, clock)))), 'kid-1 retired');
  assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K2 })))).status, 200);

  // A failed refresh after the hour keeps the previous keys (no outage when the certs endpoint hiccups).
  jwks.fail = 500;
  clock.offset += 3_601_000;
  assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K2 })))).status, 200, 'stale keys used');
  clock.offset += 24 * 3_600_000;
  await assertDenied(await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K2 }))), 'keys older than a day are dropped');
  jwks.fail = false;
  clock.offset += 11_000;
  assert.equal((await anon('/index.html', withJwt(await jwt(claims({}, clock), { key: K2 })))).status, 200, 'recovers once the JWKS answers');

  for (const fail of ['throw', 500]) {
    const s = await setup();
    s.jwks.fail = fail;
    await assertDenied(await s.anon('/index.html', withJwt(s.token)), `JWKS ${fail}`);
    s.jwks.fail = false;
    assert.equal((await s.anon('/index.html', withJwt(s.token))).status, 200, `JWKS ${fail}: recovers on the next request`);
  }
  // Concurrent cold requests each fetch for themselves (no in-flight promise shared across requests: a cancelled
  // request would leave the others hanging in the Workers runtime); the keys are shared afterwards.
  const c = await setup();
  const all = await Promise.all(Array.from({ length: 5 }, () => c.anon('/index.html', withJwt(c.token))));
  assert.ok(all.every(r => r.status === 200));
  assert.ok(c.jwks.urls.length >= 1 && c.jwks.urls.length <= 5);
  const n = c.jwks.urls.length;
  assert.equal((await c.anon('/index.html', withJwt(c.token))).status, 200);
  assert.equal(c.jwks.urls.length, n, 'keys cached once fetched');
});

test('worker source: never logs nor echoes the token; JWKS URL is the only fetch', async () => {
  const { source } = await setup();
  assert.doesNotMatch(source, /\bconsole\b/);
  assert.equal(source.match(/(?<!async )\bfetch\(/g)?.length, 1, 'a single fetch call (the team certs)');
  assert.match(source, /cf-access-jwt-assertion/i);
  assert.match(source, /CF_Authorization/);
});

test('D1 binding name is ASSETS_DB, not the reserved Pages ASSETS binding', () => {
  assert.equal(D1_BINDING, 'ASSETS_DB');
});

// ============================================================ client D1 + liaison + déploiement (API simulée)

const {
  findDatabase, readBlobs, planD1, insertBatches, uploadBlobs, bindingBody, bindingOk, deployWorker, workerMarker,
  ROW_BUDGET, MAX_BODY_BYTES, COMPATIBILITY_DATE, SCHEMA, INSERT, DATABASE_NAME,
} = await import('../tools/d1deploy.mjs');

const A = '/accounts/acc';
const UUID = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';
// R2.0.22: shared records database (plan 06.1-03).
const S_UUID = '1c2d3e4f-5061-7283-94a5-b6c7d8e9f0a1';
const SCORES = { database: { uuid: S_UUID, name: 'zuma-scores' }, tables: new Set(['scores', 'times']) };
const noSleep = async () => undefined;

/**
 * Simulated D1 REST API (one database, a tiny SQL subset: schema, sqlite_master, GROUP BY state, INSERT OR IGNORE)
 * plus the Pages project and deployments. Records every call; `fail` = { status, times, when(call) } injects errors.
 */
function fakeApi({ database = true, table = true, rows = [], project = {}, batch = true, fail = null, environment = 'production' } = {}) {
  const s = { database: database ? { uuid: UUID, name: DATABASE_NAME } : null, table, rows: rows.map(r => ({ ...r })), project: { name: 'zuma', production_branch: 'main', deployment_configs: { production: {}, preview: {} }, ...project } };
  const calls = [];
  const err = (status, message) => Object.assign(new Error(message), { status });
  const run = (sql, params = []) => {
    assert.ok(params.every(p => typeof p === 'string'), 'D1 REST params are strings');
    if (sql === SCHEMA) { s.table = true; return { results: [], success: true, meta: { changes: 0 } }; }
    if (/^SELECT name FROM sqlite_master/.test(sql)) return { results: s.table ? [{ name: 'blobs' }] : [], success: true, meta: {} };
    if (!s.table) throw err(400, 'no such table: blobs');
    if (/^SELECT key, COUNT\(\*\) AS parts, SUM\(LENGTH\(data\)\) AS chars FROM blobs GROUP BY key$/.test(sql)) {
      const by = new Map();
      for (const r of s.rows) { const e = by.get(r.key) ?? { key: r.key, parts: 0, chars: 0 }; e.parts++; e.chars += r.data.length; by.set(r.key, e); }
      return { results: [...by.values()], success: true, meta: {} };
    }
    if (sql === INSERT) {
      assert.equal(params.length, 3);
      assert.ok(Buffer.byteLength(sql) + params.reduce((n, p) => n + Buffer.byteLength(p), 0) < 100000, 'statement under 100 KB');
      const [key, part, data] = params;
      if (s.rows.some(r => r.key === key && r.part === Number(part))) return { results: [], success: true, meta: { changes: 0 } };
      s.rows.push({ key, part: Number(part), data });
      return { results: [], success: true, meta: { changes: 1 } };
    }
    throw err(400, `unsupported SQL ${sql}`);
  };
  const api = async (method, p, o = {}) => {
    const call = { method, path: p, body: o.body, form: o.form };
    calls.push(call);
    if (fail && fail.times > 0 && fail.when(call)) { fail.times--; throw err(fail.status, 'injected'); }
    if (method === 'GET' && p.startsWith(`${A}/d1/database?`)) {
      const name = new URL(`https://x${p}`).searchParams.get('name');
      return s.database && s.database.name.includes(name) ? [{ ...s.database }, { uuid: 'other', name: `${DATABASE_NAME}-old` }] : [];
    }
    if (method === 'POST' && p === `${A}/d1/database`) { s.database = { uuid: UUID, name: o.body.name }; return { ...s.database }; }
    if (method === 'POST' && p === `${A}/d1/database/${UUID}/query`) {
      assert.ok(Buffer.byteLength(JSON.stringify(o.body)) < MAX_BODY_BYTES, 'request body under the cap');
      if (o.body.batch) {
        if (!batch) throw err(400, 'batch unsupported');
        return o.body.batch.map(q => run(q.sql, q.params));
      }
      return [run(o.body.sql, o.body.params)];
    }
    if (p === `${A}/pages/projects/zuma` && method === 'GET') return structuredClone(s.project);
    if (p === `${A}/pages/projects/zuma` && method === 'PATCH') {
      for (const env of ['production', 'preview']) Object.assign(s.project.deployment_configs[env], o.body.deployment_configs[env]);
      return structuredClone(s.project);
    }
    if (p === `${A}/pages/projects/zuma/deployments` && method === 'POST') {
      const dep = { id: 'dep-1', url: 'https://abc12345.zuma-x.pages.dev', environment, latest_stage: { name: 'queued', status: 'active' }, deployment_trigger: { metadata: { branch: o.form.get('branch'), commit_message: o.form.get('commit_message') } } };
      s.project.canonical_deployment = { ...dep, latest_stage: { name: 'deploy', status: 'success' } };
      return dep;
    }
    if (p === `${A}/pages/projects/zuma/deployments/dep-1`) return { ...s.project.canonical_deployment };
    throw err(404, `unexpected ${method} ${p}`);
  };
  return { api, calls, s };
}

const writesOf = calls => calls.filter(c => !(c.method === 'GET' || (c.path.endsWith('/query') && /^SELECT /.test(c.body.sql ?? ''))));

test('findDatabase: exact name only; readBlobs: table check then one GROUP BY (key, parts, chars)', async () => {
  const { api, calls } = fakeApi({ rows: [{ key: 'sha256:a', part: 0, data: 'QQ==' }, { key: 'sha256:a', part: 1, data: 'Qg==' }] });
  assert.deepEqual(await findDatabase(api, A, DATABASE_NAME), { uuid: UUID, name: DATABASE_NAME });
  assert.equal(calls[0].path, `${A}/d1/database?name=${DATABASE_NAME}&per_page=100`);
  assert.equal(await findDatabase(fakeApi({ database: false }).api, A, DATABASE_NAME), null);
  const blobs = await readBlobs(api, A, UUID);
  assert.equal(blobs.table, true);
  assert.deepEqual(blobs.present.get('sha256:a'), { parts: 2, chars: 8 });
  assert.ok(calls.slice(1).every(c => c.method === 'POST' && /^SELECT /.test(c.body.sql)), 'reads are SELECTs');
  const none = await readBlobs(fakeApi({ table: false }).api, A, UUID);
  assert.deepEqual({ table: none.table, size: none.present.size }, { table: false, size: 0 });
});

test('planD1: absent database → everything planned; complete rows skipped; an incomplete key is planned again', () => {
  const { dir } = tree();
  const files = blobFiles(dir);
  const empty = planD1({ files, database: null, blobs: null, project: null, marker: 'worker:x' });
  const unique = new Set(files.map(f => f.key));
  assert.equal(empty.createDatabase, true);
  assert.equal(empty.createTable, true);
  assert.equal(empty.missing.length, unique.size, 'one entry per unique key');
  assert.equal(empty.chunks, empty.missing.reduce((n, f) => n + chunks(fs.readFileSync(f.abs)).length, 0));
  assert.equal(empty.rows, 2 * empty.chunks, 'two rows written per chunk (table + primary-key index)');
  assert.equal(empty.bind, true);
  assert.equal(empty.deploy, true);
  // Every key complete except the multi-part music file, which lacks its last part.
  const present = new Map();
  for (const f of files) {
    const parts = chunks(fs.readFileSync(f.abs));
    const kept = f.path === 'assets/music/zuma.mo3' ? parts.slice(0, -1) : parts;
    present.set(f.key, { parts: kept.length, chars: kept.join('').length });
  }
  // R2.0.22: shared records database (plan 06.1-03) — both bindings and the records database are part of the plan.
  const project = { deployment_configs: bindingBody(UUID, S_UUID).deployment_configs, canonical_deployment: { latest_stage: { name: 'deploy', status: 'success' }, deployment_trigger: { metadata: { commit_message: 'R2.0.20 x worker:abc' } } } };
  const p = planD1({ files, database: { uuid: UUID }, blobs: { table: true, present }, project, marker: 'worker:abc', scores: SCORES });
  assert.deepEqual(p.missing.map(f => f.path), ['assets/music/zuma.mo3']);
  assert.equal(p.createDatabase || p.createTable || p.bind || p.deploy, false);
  const done = planD1({ files, database: { uuid: UUID }, blobs: { table: true, present: new Map([...present, [files.find(f => f.path === 'assets/music/zuma.mo3').key, { parts: 3, chars: noise(100000).toString('base64').length }]]) }, project, marker: 'worker:abc', scores: SCORES });
  assert.equal(done.missing.length, 0);
  assert.equal(done.rows, 0);
  assert.equal(planD1({ files, database: { uuid: UUID }, blobs: { table: true, present }, project, marker: 'worker:new', scores: SCORES }).deploy, true, 'another worker → deploy');
});

test('insertBatches: every statement exactly once, each request body under 900 KB', () => {
  const stmts = Array.from({ length: 40 }, (_, i) => ({ sql: INSERT, params: [`sha256:${i}`, '0', 'x'.repeat(60000)] }));
  const out = insertBatches(stmts);
  assert.ok(out.length >= 3);
  for (const b of out) assert.ok(Buffer.byteLength(JSON.stringify({ batch: b })) < MAX_BODY_BYTES);
  assert.deepEqual(out.flat(), stmts);
  assert.deepEqual(insertBatches([]), []);
});

test('uploadBlobs: schema not touched, INSERT OR IGNORE with bound string params in batches; rows rebuild every file', async () => {
  const { dir } = tree();
  const files = blobFiles(dir);
  const { api, calls, s } = fakeApi();
  const plan = planD1({ files, database: { uuid: UUID }, blobs: { table: true, present: new Map() }, project: null, marker: 'worker:x' });
  const logs = [];
  const res = await uploadBlobs(api, { A, uuid: UUID, plan, log: m => logs.push(m), sleep: noSleep });
  const posts = calls.filter(c => c.method === 'POST');
  assert.ok(posts.length >= 1 && posts.every(c => c.path === `${A}/d1/database/${UUID}/query` && Array.isArray(c.body.batch)));
  for (const c of posts) for (const q of c.body.batch) assert.equal(q.sql, INSERT);
  assert.equal(res.statements, plan.chunks);
  for (const f of files) {
    const data = s.rows.filter(r => r.key === f.key).sort((a, b) => a.part - b.part).map(r => r.data).join('');
    assert.ok(Buffer.from(data, 'base64').equals(fs.readFileSync(f.abs)), `${f.path} rebuilt from its rows`);
  }
  assert.match(logs.join('\n'), /instructions/);
  // Idempotent: nothing missing → no call at all.
  const again = planD1({ files, database: { uuid: UUID }, blobs: await readBlobs(api, A, UUID), project: null, marker: 'worker:x' });
  const n = calls.length;
  await uploadBlobs(api, { A, uuid: UUID, plan: again, sleep: noSleep });
  assert.equal(again.missing.length, 0);
  assert.equal(calls.length, n);
});

test('uploadBlobs: over the row budget → refused before any call; 400 on batch → single statements; 5xx retried', async () => {
  const { dir } = tree();
  const files = blobFiles(dir);
  const plan = planD1({ files, database: { uuid: UUID }, blobs: { table: true, present: new Map() }, project: null, marker: 'w' });
  const big = { ...plan, chunks: ROW_BUDGET, rows: 2 * ROW_BUDGET };
  const refused = fakeApi();
  await assert.rejects(uploadBlobs(refused.api, { A, uuid: UUID, plan: big, sleep: noSleep }), /50 000|budget|lignes/);
  assert.equal(refused.calls.length, 0);
  const single = fakeApi({ batch: false });
  await uploadBlobs(single.api, { A, uuid: UUID, plan, sleep: noSleep });
  const singles = single.calls.filter(c => c.body && c.body.sql === INSERT);
  assert.equal(singles.length, plan.chunks, 'one request per statement after the 400');
  assert.equal(new Set(single.s.rows.map(r => r.key)).size, plan.missing.length);
  const flaky = fakeApi({ fail: { status: 502, times: 2, when: c => c.method === 'POST' } });
  await uploadBlobs(flaky.api, { A, uuid: UUID, plan, sleep: noSleep });
  assert.equal(new Set(flaky.s.rows.map(r => r.key)).size, plan.missing.length, 'completed after retries');
  const denied = fakeApi({ fail: { status: 403, times: 1, when: c => c.method === 'POST' } });
  await assert.rejects(uploadBlobs(denied.api, { A, uuid: UUID, plan, sleep: noSleep }), e => e.status === 403);
  assert.equal(denied.calls.length, 1, 'stops at the refused write');
});

test('bindingBody / bindingOk: ASSETS_DB and SCORES_DB → { id } on production and preview with the fixed compatibility date', () => {
  // R2.0.22: shared records database (plan 06.1-03) — one PATCH carries both bindings.
  const body = bindingBody(UUID, S_UUID);
  assert.match(COMPATIBILITY_DATE, /^\d{4}-\d{2}-\d{2}$/);
  for (const env of ['production', 'preview']) {
    assert.deepEqual(body.deployment_configs[env], { d1_databases: { ASSETS_DB: { id: UUID }, SCORES_DB: { id: S_UUID } }, compatibility_date: COMPATIBILITY_DATE });
  }
  assert.deepEqual(Object.keys(body), ['deployment_configs']);
  assert.equal(bindingOk({ deployment_configs: body.deployment_configs }, UUID, S_UUID), true);
  assert.equal(bindingOk({ deployment_configs: body.deployment_configs }, 'other', S_UUID), false);
  assert.equal(bindingOk({ deployment_configs: body.deployment_configs }, UUID, 'other'), false);
  const prodOnly = structuredClone(body);
  delete prodOnly.deployment_configs.preview.d1_databases;
  assert.equal(bindingOk(prodOnly, UUID, S_UUID), false);
  const oldDate = structuredClone(body);
  oldDate.deployment_configs.production.compatibility_date = '2021-01-01';
  assert.equal(bindingOk(oldDate, UUID, S_UUID), false);
  assert.equal(bindingOk(null, UUID, S_UUID), false);
});

test('deployWorker: main only; multipart manifest {} + branch + commit message with the worker marker + _worker.js file', async () => {
  const source = 'export default { fetch() { return new Response("x"); } };\n';
  for (const branch of ['preview', '', undefined]) {
    const f = fakeApi();
    await assert.rejects(deployWorker(f.api, { A, project: 'zuma', worker: source, branch, message: 'R', sleep: noSleep }), /main/);
    assert.equal(f.calls.length, 0);
  }
  const { api, calls } = fakeApi();
  const res = await deployWorker(api, { A, project: 'zuma', worker: source, branch: 'main', message: 'R2.0.20 build', sleep: noSleep });
  const post = calls.find(c => c.method === 'POST');
  assert.equal(post.path, `${A}/pages/projects/zuma/deployments`);
  const form = post.form;
  assert.ok(form instanceof FormData);
  assert.deepEqual([...form.keys()].sort(), ['_worker.js', 'branch', 'commit_dirty', 'commit_message', 'manifest']);
  assert.equal(form.get('manifest'), '{}');
  assert.equal(form.get('branch'), 'main');
  assert.equal(form.get('commit_dirty'), 'true');
  assert.equal(form.get('commit_message'), `R2.0.20 build ${workerMarker(source)}`);
  assert.match(workerMarker(source), /^worker:[0-9a-f]{16}$/);
  const file = form.get('_worker.js');
  assert.equal(file.name, '_worker.js');
  assert.equal(await file.text(), source);
  assert.deepEqual(res, { id: 'dep-1', url: 'https://abc12345.zuma-x.pages.dev', environment: 'production', ready: true });
  assert.deepEqual(writesOf(calls).map(c => c.method), ['POST']);
});
