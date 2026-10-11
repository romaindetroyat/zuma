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
import zlib from 'node:zlib';
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
  const before = h.log.fetched.length;
  const asset = await h.respond(SCOPE + 'assets/images/a.png');
  assert.equal(asset.response.url, SCOPE + 'assets/images/a.png', 'asset from the pack cache offline');
  assert.equal(h.log.fetched.length, before, 'no network attempt for a cached asset');
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
  // R2.0.22: shared records endpoint (plan 06.1-02) — never answered nor stored by the service worker.
  for (const url of [SCOPE + 'api/records', SCOPE + 'api/me']) {
    assert.equal((await h.respond(url)).intercepted, false, url);
    assert.equal((await h.respond(url, 'navigate')).intercepted, false, `${url} (navigation)`);
  }
  assert.equal((await h.respond(SCOPE + 'api/records', 'cors', 'POST')).intercepted, false, 'POST api/records');
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

// ------------------------------------------------------------ installabilité (D-38 §1–3)

/** Independent PNG reader: chunks with CRC check (own table), IHDR, inflated IDAT. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crcOf = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function readPng(file) {
  const buf = fs.readFileSync(file);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file}: PNG signature`);
  let off = 8;
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('latin1');
    const data = buf.subarray(off + 8, off + 8 + len);
    assert.equal(buf.readUInt32BE(off + 8 + len), crcOf(buf.subarray(off + 4, off + 8 + len)), `${file}: CRC of ${type}`);
    chunks.push({ type, data });
    off += 12 + len;
  }
  assert.equal(chunks[0].type, 'IHDR');
  assert.equal(chunks.at(-1).type, 'IEND');
  const ihdr = chunks[0].data;
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  assert.deepEqual([ihdr[8], ihdr[9]], [8, 6], 'RGBA 8 bits');
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data)));
  assert.equal(raw.length, h * (1 + 4 * w), 'h × (1 + 4w) bytes');
  const px = (x, y) => { const i = y * (1 + 4 * w) + 1 + 4 * x; return [...raw.subarray(i, i + 4)]; };
  for (let y = 0; y < h; y++) assert.equal(raw[y * (1 + 4 * w)], 0, 'filter 0');
  return { w, h, px };
}
const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('PNG icons of dist/public: sizes, valid chunks, transparent / opaque corners, ball colours, maskable pattern in the safe zone', () => {
  const BG = [0x12, 0x0c, 0x06, 255];
  for (const [file, size, opaque] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
    const { w, h, px } = readPng(path.join('dist/public', file));
    assert.deepEqual([w, h], [size, size], file);
    if (opaque) assert.ok(near(px(0, 0), BG, 0), `${file}: opaque #120c06 corner`);
    else assert.equal(px(0, 0)[3], 0, `${file}: transparent corner`);
    assert.ok(near(px(size >> 1, size >> 1), BG, 2), `${file}: centre on the dark background`);
    // Blue ball centre (40, 50) of the 128 px design, scaled (× 0.8 around the centre for the opaque icons).
    const map = v => opaque ? (12.8 + 0.8 * v) * size / 128 : v * size / 128;
    assert.ok(near(px(Math.round(map(40)), Math.round(map(54))), [0x19, 0x80, 0xff, 255], 12), `${file}: blue ball`);
    if (file === 'icon-maskable-512.png') {
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        if (near(px(x, y), BG, 3)) continue;
        assert.ok(Math.hypot(x - w / 2, y - h / 2) <= 0.4 * w, `pattern pixel (${x}, ${y}) inside the 80 % safe zone`);
      }
    }
  }
});

test('manifest: relative id / start_url / scope resolve under any base; PNG icons present; fullscreen, landscape, French', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));
  const at = 'https://h.example/zuma/public/manifest.webmanifest';
  const start = new URL(m.start_url, at);
  assert.equal(start.href, 'https://h.example/zuma/index.html');
  assert.equal(new URL(m.scope, at).href, 'https://h.example/zuma/');
  assert.equal(new URL(m.id, start).href, 'https://h.example/zuma/', 'id resolved against start_url');
  assert.equal(m.display, 'fullscreen');
  assert.deepEqual(m.display_override, ['fullscreen', 'standalone']);
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.lang, 'fr');
  assert.equal(m.dir, 'ltr');
  assert.deepEqual(m.categories, ['games']);
  const icon = (src, purpose) => m.icons.find(i => i.src === src && i.purpose === purpose);
  assert.equal(icon('icon-192.png', 'any')?.sizes, '192x192');
  assert.equal(icon('icon-512.png', 'any')?.sizes, '512x512');
  assert.equal(icon('icon-maskable-512.png', 'maskable')?.sizes, '512x512');
  assert.ok(icon('icon.svg', 'any'), 'SVG kept');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join('dist/public', i.src)), `${i.src} built`);
  const sw = read('dist/sw.js');
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) assert.match(sw, new RegExp(`\\./public/${f.replace('.', '\\.')}`), `${f} precached`);
});

test('index.html head: Apple metadata, PNG icons, viewport for the notch; install card without any share button', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="apple-touch-icon" href="public\/apple-touch-icon\.png" sizes="180x180">/);
  assert.match(html, /<link rel="icon" href="public\/icon-192\.png" sizes="192x192" type="image\/png">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Zuma">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">/);
  assert.match(html, /id="install-card"/);
  assert.match(html, /id="install-button"[^>]*>Installer Zuma</);
  assert.match(html, /id="install-ios"[^>]*>[\s\S]*?Touchez[\s\S]*?class="share-glyph"[\s\S]*?Partager puis « Sur l’écran d’accueil »/);
  assert.match(html, /id="install-mac"[^>]*>[\s\S]*?Fichier › Ajouter au Dock/);
  assert.match(html, /Ouvrez l’app une première fois avec une connexion : elle restera ensuite disponible hors ligne\./);
  assert.match(html, /id="install-play"[^>]*>Jouer</);
  assert.match(html, /id="install-close"/);
  assert.doesNotMatch(html, /Partager le jeu|navigator\.share|id="share/);
  assert.doesNotMatch(read('.compiled/main.js'), /navigator\.share/);
});

test('standalone strips the manifest and the PNG icon links (data-URL single file)', () => {
  const build = read('tools/build.mjs');
  assert.match(build, /\.replace\(\/<link rel="apple-touch-icon"\[\^>\]\*>\\n\?\/, ''\)/);
  assert.match(build, /\.replace\(\/<link rel="icon"\[\^>\]\*image\\\/png"\[\^>\]\*>\\n\?\/, ''\)/);
  if (fs.existsSync('standalone/zuma-standalone.html')) {
    const html = read('standalone/zuma-standalone.html');
    if (html.includes('R2.0.20') || html.includes("'2.0.20'")) {
      assert.doesNotMatch(html, /<link rel="manifest"/);
      assert.doesNotMatch(html, /<link rel="apple-touch-icon"/);
      assert.doesNotMatch(html, /icon-192\.png/);
    }
  }
});

// Fixtures: user agents of the D-38 platforms.
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

test('installGuidance: one instruction per platform, nothing once installed', async () => {
  const { installGuidance } = await import('../.compiled/pwa.js');
  const env = (userAgent, maxTouchPoints, extra = {}) => ({ userAgent, maxTouchPoints, standalone: false, displayMode: 'browser', promptAvailable: false, ...extra });
  const cases = [
    [env(UA.iphoneSafari, 5), 'ios-share'],
    [env(UA.iphoneChrome, 5), 'ios-share'],
    [env(UA.ipad, 5), 'ios-share', 'iPadOS announces a Mac: maxTouchPoints > 1'],
    [env(UA.macSafari, 0), 'mac-safari-dock'],
    [env(UA.macChrome, 0), 'none'],
    [env(UA.macChrome, 0, { promptAvailable: true }), 'prompt'],
    [env(UA.winEdge, 0, { promptAvailable: true }), 'prompt'],
    [env(UA.android, 5, { promptAvailable: true }), 'prompt'],
    [env(UA.android, 5), 'none'],
  ];
  for (const [e, expected, note] of cases) {
    assert.equal(installGuidance(e), expected, note ?? e.userAgent);
    assert.equal(installGuidance({ ...e, displayMode: 'standalone' }), 'installed', `${expected} installed (standalone)`);
    assert.equal(installGuidance({ ...e, displayMode: 'fullscreen' }), 'installed', `${expected} installed (fullscreen)`);
    assert.equal(installGuidance({ ...e, standalone: true }), 'installed', `${expected} installed (navigator.standalone)`);
  }
  const main = read('.compiled/main.js');
  assert.match(main, /'beforeinstallprompt'/);
  assert.match(main, /'appinstalled'/);
  assert.match(main, /installGuidance\(/);
  assert.match(main, /readInstallEnv\(/);
});

test('installGuidance: nothing when the page is not served over http(s) (the file:// standalone cannot be installed)', async () => {
  const { installGuidance } = await import('../.compiled/pwa.js');
  const base = { userAgent: UA.iphoneSafari, maxTouchPoints: 5, standalone: false, displayMode: 'browser', promptAvailable: false };
  assert.equal(installGuidance({ ...base, served: false }), 'none');
  assert.equal(installGuidance({ ...base, userAgent: UA.macSafari, maxTouchPoints: 0, served: false }), 'none');
  assert.equal(installGuidance({ ...base, served: true }), 'ios-share');
  assert.match(read('.compiled/pwa.js'), /served: \/\^https\?:\$\/\.test\(/);
});
