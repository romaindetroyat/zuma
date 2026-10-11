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
function loadWorker(source) {
  assert.equal(source.match(/^export default /gm)?.length, 1, 'exactly one default export');
  const script = source.replace(/^export default /m, 'globalThis.worker = ');
  const context = vm.createContext({ Response, Headers, URL, atob });
  vm.runInContext(script, context, { filename: '_worker.js' });
  return context.worker;
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

function setup(opts) {
  const { dir, files } = tree();
  const list = blobFiles(dir);
  const source = generateWorker(workerManifest(list), { build: '2.0.20+T' });
  const worker = loadWorker(source);
  const db = fakeD1(list, opts);
  const env = { [D1_BINDING]: db };
  const req = (p, init = {}) => worker.fetch(new Request(`https://zuma-x.pages.dev${p}`, init), env, {});
  const keyOf = rel => list.find(f => f.path === rel).key;
  return { dir, files, list, source, worker, db, env, req, keyOf };
}

const NAV = { headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html,application/xhtml+xml' } };
const IMMUTABLE = 'public, max-age=31536000, immutable';

test('worker: / and /index.html serve index.html (text/html, no-cache, strong ETag, body from D1)', async () => {
  const { req, files, keyOf, db } = setup();
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
  const { req, files } = setup();
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
  const { req, db, source } = setup();
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
  const { req, keyOf, db } = setup();
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
  const { req, files, db } = setup();
  const res = await req('/sw.js', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.equal(res.headers.get('content-length'), String(Buffer.byteLength(files['sw.js'])));
  assert.equal(await res.text(), '');
  assert.equal(db.queries.length, 0);
});

test('worker: unknown navigation → index.html; unknown resource → 404; /cdn-cgi/ → 404 even as a navigation', async () => {
  const { req, files } = setup();
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
  const { req, worker } = setup();
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await req('/index.html', { method, ...(['POST', 'PUT', 'PATCH'].includes(method) ? { body: 'x' } : {}) });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }
  const dropped = setup({ drop: ['assets/pack.json'], truncate: ['assets/music/zuma.mo3'] });
  for (const p of ['/assets/pack.json', '/assets/music/zuma.mo3']) {
    const res = await dropped.req(p);
    assert.equal(res.status, 503, p);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  const unbound = await worker.fetch(new Request('https://zuma-x.pages.dev/index.html'), {}, {});
  assert.equal(unbound.status, 500);
  assert.equal(unbound.headers.get('cache-control'), 'no-store');
});

test('worker source: ES module without import, console, process, Buffer or eval; deterministic; importable', async () => {
  const { source, list } = setup();
  assert.doesNotMatch(source, /^\s*import\s/m, 'no import');
  assert.doesNotMatch(source, /\bconsole\b|\bprocess\b|\bBuffer\b|\beval\b|\brequire\(/, 'never logs, Node-free');
  assert.ok(source.includes(SELECT), 'the one query, with a bound parameter');
  assert.match(source, /2\.0\.20\+T/, 'build stamp recorded');
  assert.equal(generateWorker(workerManifest(list), { build: '2.0.20+T' }), source, 'same input → same source');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(typeof mod.default.fetch, 'function');
  for (const f of list) {
    assert.ok(source.includes(JSON.stringify(`/${f.path}`)), f.path);
    assert.ok(source.includes(f.key), f.key);
  }
});

test('D1 binding name is ASSETS_DB, not the reserved Pages ASSETS binding', () => {
  assert.equal(D1_BINDING, 'ASSETS_DB');
});
