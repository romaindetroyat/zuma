// R2.0.20 — PWA (plan 05-14, D-42, D-38) : service worker généré qui précache le shell ET tout le pack (jeu hors ligne
// après la première visite, `assets/` cache d'abord, cache du pack réutilisé d'une version du code à l'autre), mise à
// jour seulement après « Mettre à jour », artefact `--deploy` (jamais publié par le dépôt ni la CI).
// Le repli `index.html` ne sert que les navigations ; `api/` et `cdn-cgi/` (Cloudflare Access, plus tard) ne sont
// jamais interceptés ni mis en cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { swSource, packFiles, packHash, deployError } from '../tools/swgen.mjs';
import { updateReady, formatSize } from '../.compiled/pwa.js';

const read = file => fs.readFileSync(file, 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-r220-'));
const modules = () => read('tools/build.mjs').match(/const MODULES = \[([^\]]*)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''));

// ------------------------------------------------------------ swgen (pur)

test('swSource fills the template: build stamp, shell list, pack list and hash; no marker left', () => {
  const template = read('public/sw.js');
  assert.match(template, /__BUILD__/);
  assert.match(template, /__ASSETS_HASH__/);
  assert.match(template, /\/\* __ASSETS__ \*\//);
  const src = swSource(template, { build: '2.0.20+X', shell: ['./', './index.html', './js/core.js'], assets: ['b/z.png', 'pack.json'], assetsHash: 'abcdef012345' });
  assert.doesNotMatch(src, /__[A-Z_]+__/, 'no marker left');
  assert.match(src, /const VERSION = '2\.0\.20\+X'/);
  assert.match(src, /'zuma-assets-abcdef012345'/);
  assert.match(src, /const SHELL = \["\.\/","\.\/index\.html","\.\/js\/core\.js"\];/);
  assert.match(src, /const ASSETS = \["\.\/assets\/b\/z\.png","\.\/assets\/pack\.json"\];/, './assets/<path>, sorted');
  const none = swSource(template, { build: 'b', shell: ['./'], assets: [], assetsHash: null });
  assert.match(none, /'zuma-assets-none'/);
  assert.match(none, /const ASSETS = \[\];/);
  assert.doesNotMatch(none, /__[A-Z_]+__/);
  assert.doesNotThrow(() => new vm.Script(src), 'the generated worker parses');
});

test('packFiles lists every file with / separators, sorted; packHash is stable and follows path, size and content', () => {
  const dir = tmp();
  try {
    fs.mkdirSync(path.join(dir, 'images', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'pack.json'), '{}');
    fs.writeFileSync(path.join(dir, 'images', 'b.png'), 'bbb');
    fs.writeFileSync(path.join(dir, 'images', 'sub', 'a.gif'), 'a');
    assert.deepEqual(packFiles(dir), ['images/b.png', 'images/sub/a.gif', 'pack.json']);
    const h = packHash(dir);
    assert.match(h, /^[0-9a-f]{12}$/);
    assert.equal(packHash(dir), h, 'stable');
    fs.writeFileSync(path.join(dir, 'images', 'b.png'), 'bbc');
    const h2 = packHash(dir);
    assert.notEqual(h2, h, 'content change');
    fs.renameSync(path.join(dir, 'images', 'b.png'), path.join(dir, 'images', 'c.png'));
    assert.notEqual(packHash(dir), h2, 'path change');
    assert.deepEqual(packFiles(path.join(dir, 'missing')), []);
    assert.equal(packHash(path.join(dir, 'missing')), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--deploy refuses a missing pack with a French message; the npm script and the private-only log exist', () => {
  const dir = tmp();
  try {
    assert.match(deployError(dir), /pack original introuvable/);
    fs.writeFileSync(path.join(dir, 'pack.json'), '{}');
    assert.equal(deployError(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const build = read('tools/build.mjs');
  assert.match(build, /--deploy/);
  assert.match(build, /version\.json/);
  assert.match(build, /process\.exit\(1\)/);
  assert.match(build, /uniquement en privé/);
  assert.equal(JSON.parse(read('package.json')).scripts.deploy, 'node tools/build.mjs --deploy');
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /--deploy|--local|wrangler/, 'the CI builds the public copy only');
});

// ------------------------------------------------------------ dist/sw.js (build public de npm test)

test('dist/sw.js: shell = MODULES exactly + statics, two caches, skipWaiting only on message, no index.html for sub-resources', () => {
  const sw = read('dist/sw.js');
  assert.doesNotMatch(sw, /__[A-Z_]+__/);
  const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\]);/)[1]);
  const js = shell.filter(u => u.startsWith('./js/')).map(u => u.slice(5, -3));
  assert.deepEqual(js, modules(), 'one entry per module, MODULES order');
  assert.ok(modules().includes('pwa'));
  for (const u of ['./', './index.html', './public/style.css', './public/manifest.webmanifest', './public/icon.svg']) assert.ok(shell.includes(u), u);
  for (const u of shell.filter(u => u.startsWith('./public/'))) assert.ok(fs.existsSync(path.join('dist', u)), `${u} exists in dist/`);
  assert.match(sw, /'zuma-shell-' \+ VERSION/);
  assert.match(sw, /'zuma-assets-[0-9a-f]{12}'|'zuma-assets-none'/);
  const skips = [...sw.matchAll(/skipWaiting\(\)/g)];
  assert.equal(skips.length, 1, 'one skipWaiting call');
  const message = sw.slice(sw.indexOf("addEventListener('message'"));
  assert.ok(message.indexOf('skipWaiting()') > 0 && message.indexOf('skipWaiting()') < message.indexOf('});'), 'inside the message handler');
  assert.match(sw, /ignoreSearch: true/);
  // r217 lock still readable: the template names every module.
  for (const name of modules()) assert.match(read('public/sw.js'), new RegExp(`\\./js/${name}\\.js`), `${name} in the template`);
});

// ------------------------------------------------------------ comportement du worker (vm, caches simulés)

const SCOPE = 'https://h.example/zuma/';
function harness(src, { stored = {}, online = true } = {}) {
  const abs = u => new URL(typeof u === 'string' ? u : u.url, SCOPE).href;
  const store = new Map(Object.entries(stored).map(([name, urls]) => [name, new Map(urls.map(u => [abs(u), { ok: true, url: abs(u), from: name, clone() { return this; } }]))]));
  const log = { fetched: [], skipWaiting: 0, claimed: 0 };
  const state = { online };
  const fetch = async r => {
    const url = abs(r);
    log.fetched.push(url);
    if (!state.online) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, url, from: 'network', clone() { return { ...this }; } };
  };
  const strip = u => { const x = new URL(u); x.search = ''; return x.href; };
  const lookup = (m, r, opts) => {
    const k = abs(r);
    if (m.has(k)) return m.get(k);
    if (opts?.ignoreSearch) for (const [key, v] of m) if (strip(key) === strip(k)) return v;
    return undefined;
  };
  const cache = name => ({
    match: async (r, opts) => lookup(store.get(name), r, opts),
    add: async r => { const res = await fetch(r); store.get(name).set(abs(r), res); },
    addAll: async rs => { for (const r of rs) { const res = await fetch(r); store.get(name).set(abs(r), res); } },
    put: async (r, res) => { store.get(name).set(abs(r), res); },
  });
  const caches = {
    open: async name => { if (!store.has(name)) store.set(name, new Map()); return cache(name); },
    keys: async () => [...store.keys()],
    delete: async name => store.delete(name),
    match: async (r, opts) => { for (const m of store.values()) { const v = lookup(m, r, opts); if (v) return v; } return undefined; },
  };
  class Request { constructor(u, init = {}) { this.url = abs(u); this.method = init.method ?? 'GET'; this.mode = init.mode ?? 'cors'; this.cache = init.cache; } }
  const handlers = {};
  const self = {
    location: new URL('sw.js', SCOPE),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: async () => { log.skipWaiting++; },
    clients: { claim: async () => { log.claimed++; } },
  };
  vm.runInNewContext(src, { self, caches, fetch, Request, URL, Promise, console });
  const wait = async (type, extra = {}) => { const ev = { ...extra, waitUntil(p) { this.p = p; } }; handlers[type](ev); await ev.p; };
  const respond = async (url, mode = 'cors', method = 'GET') => {
    const ev = { request: new Request(url, { mode, method }), respondWith(p) { this.p = p; } };
    handlers.fetch(ev);
    if (!ev.p) return { intercepted: false };
    try { return { intercepted: true, response: await ev.p }; } catch (error) { return { intercepted: true, error }; }
  };
  return { store, log, state, wait, respond, handlers };
}
const generated = (assets = ['pack.json', 'images/a.png', 'images/b.png'], hash = 'abcdef012345') =>
  swSource(read('public/sw.js'), { build: 'B1', shell: ['./', './index.html', './js/main.js'], assets, assetsHash: hash });

test('install precaches the shell, then only the pack entries that are missing, without skipWaiting', async () => {
  const h = harness(generated(), { stored: { 'zuma-assets-abcdef012345': ['./assets/pack.json', './assets/images/a.png'] } });
  await h.wait('install');
  assert.equal(h.log.skipWaiting, 0, 'the first install activates by itself; updates wait for « Mettre à jour »');
  assert.deepEqual([...h.store.get('zuma-shell-B1').keys()], [SCOPE, SCOPE + 'index.html', SCOPE + 'js/main.js']);
  const assetFetches = h.log.fetched.filter(u => u.includes('/assets/'));
  assert.deepEqual(assetFetches, [SCOPE + 'assets/images/b.png'], 'a complete pack cache is not downloaded again');
  assert.equal(h.store.get('zuma-assets-abcdef012345').size, 3);
});

test('message skip-waiting → skipWaiting; activate keeps only the shell and pack caches, then claims', async () => {
  const h = harness(generated(), { stored: { 'zuma-shell-OLD': ['./'], 'zuma-assets-000000000000': ['./assets/x'], 'zuma-assets-abcdef012345': [], 'other': [] } });
  h.handlers.message({ data: { type: 'nothing' } });
  assert.equal(h.log.skipWaiting, 0);
  h.handlers.message({ data: { type: 'skip-waiting' } });
  assert.equal(h.log.skipWaiting, 1);
  await h.wait('install');
  await h.wait('activate');
  assert.deepEqual([...h.store.keys()].sort(), ['zuma-assets-abcdef012345', 'zuma-shell-B1']);
  assert.equal(h.log.claimed, 1);
});

test('fetch routing: navigations from the shell (ignoreSearch, index.html offline), assets cache first, no HTML for sub-resources', async () => {
  const h = harness(generated());
  await h.wait('install');
  h.state.online = false;
  const nav = await h.respond(SCOPE + '?level=1-1&debug=1', 'navigate');
  assert.equal(nav.response.url, SCOPE, 'navigation served from the shell, query ignored');
  const deep = await h.respond(SCOPE + 'unknown/page', 'navigate');
  assert.equal(deep.response.url, SCOPE + 'index.html', 'offline navigation → cached index.html');
  const asset = await h.respond(SCOPE + 'assets/images/a.png');
  assert.equal(asset.response.from, 'zuma-assets-abcdef012345', 'asset from the pack cache offline');
  const missing = await h.respond(SCOPE + 'assets/images/zzz.png');
  assert.ok(missing.error, 'a missing asset fails like the network, never index.html');
  const js = await h.respond(SCOPE + 'js/nope.js');
  assert.ok(js.error, 'a missing script fails, never index.html');
  // Back online: an asset absent from the cache is fetched and kept (a failed precache entry is retried here).
  h.state.online = true;
  const later = await h.respond(SCOPE + 'assets/images/zzz.png');
  assert.equal(later.response.from, 'network');
  await new Promise(r => setTimeout(r, 0));
  assert.ok(h.store.get('zuma-assets-abcdef012345').has(SCOPE + 'assets/images/zzz.png'), 'kept in the pack cache');
});

test('api/ and cdn-cgi/ (future Access / scores) are never intercepted nor cached; other origins and POST pass through', async () => {
  const h = harness(generated());
  await h.wait('install');
  for (const url of [SCOPE + 'api/scores', 'https://h.example/api/scores', 'https://h.example/cdn-cgi/access/login', SCOPE + 'cdn-cgi/x', 'https://other.example/x.js']) {
    assert.equal((await h.respond(url)).intercepted, false, url);
    assert.equal((await h.respond(url, 'navigate')).intercepted, false, `${url} (navigation)`);
  }
  assert.equal((await h.respond(SCOPE + 'assets/pack.json', 'cors', 'POST')).intercepted, false, 'POST');
  for (const m of h.store.values()) for (const k of m.keys()) assert.doesNotMatch(k, /\/(api|cdn-cgi)\//, k);
});

// ------------------------------------------------------------ page : mise à jour, toast, sources

test('updateReady: only with a controller and a worker installed / waiting (first install → false)', () => {
  assert.equal(updateReady(true, 'installed'), true);
  assert.equal(updateReady(true, 'waiting'), true);
  assert.equal(updateReady(false, 'installed'), false, 'first install');
  assert.equal(updateReady(true, 'installing'), false);
  assert.equal(updateReady(true, 'activated'), false);
  assert.equal(updateReady(true, null), false);
});

test('formatSize: French megabytes with one decimal', () => {
  assert.equal(formatSize(6_400_000), '6,1 Mo');
  assert.equal(formatSize(0), '0 Mo');
  assert.equal(formatSize(Number.NaN), '0 Mo');
  assert.equal(formatSize(52_428_800), '50,0 Mo');
});

test('index.html update toast; main.js registers through pwa.ts; pwa.js writes nothing to the network and shares nothing', () => {
  const html = read('index.html');
  assert.match(html, /id="update-toast"/);
  assert.match(html, /Nouvelle version disponible/);
  assert.match(html, /id="update-apply"[^>]*>Mettre à jour</);
  assert.match(html, /id="update-later"[^>]*>Plus tard</);
  const main = read('.compiled/main.js');
  assert.match(main, /registerServiceWorker\(/);
  assert.doesNotMatch(main, /serviceWorker\.register\(/);
  assert.match(main, /applyUpdate\(/);
  assert.match(main, /offlineStatus\(/);
  const pwa = read('.compiled/pwa.js');
  for (const bad of ['method:', 'POST', 'XMLHttpRequest', 'sendBeacon', 'navigator.share']) assert.ok(!pwa.includes(bad), bad);
  assert.match(pwa, /register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(pwa, /type: 'skip-waiting'/);
  const css = read('public/style.css');
  const rule = css.match(/#update-toast button\s*\{[^}]*\}/);
  assert.ok(rule && /min-height:\s*44px/.test(rule[0]), 'toast buttons ≥ 44 px');
});
