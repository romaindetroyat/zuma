// R2.0.20 (plan 05-16, D-42) : hébergement derrière Cloudflare Access. Le service worker ne sert jamais une réponse
// redirigée à une navigation (Pages redirige `/index.html` vers `/`, et `start_url` vaut `../index.html`), laisse le
// flux de connexion Access (`/cdn-cgi/`) et `/api/` au réseau, et le manifeste part avec le cookie Access
// (`crossorigin="use-credentials"`). Harnais `node:vm` recopié de r220-pwa (les tests ne s'importent pas entre eux).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { swSource } from '../tools/swgen.mjs';

const read = file => fs.readFileSync(file, 'utf8');

/**
 * Runs the generated worker in node:vm over simulated caches / fetch. `stored` maps a cache name to a list of URLs
 * (plain cached responses) or [url, response] pairs (custom responses, e.g. redirected ones). The real Response
 * class is exposed to the worker.
 */
function harness(src, { scope, stored = {}, online = true } = {}) {
  const abs = u => new URL(typeof u === 'string' ? u : u.url, scope).href;
  const plain = (u, name) => ({ ok: true, status: 200, redirected: false, url: abs(u), from: name, clone() { return this; } });
  const store = new Map(Object.entries(stored).map(([name, list]) => [name, new Map(list.map(e => (Array.isArray(e) ? [abs(e[0]), e[1]] : [abs(e), plain(e, name)])))]));
  const log = { fetched: [], put: [] };
  const state = { online };
  const fetch = async r => {
    const url = abs(r);
    log.fetched.push(url);
    if (!state.online) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, redirected: false, url, from: 'network', clone() { return { ...this }; } };
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
    put: async (r, res) => { log.put.push(abs(r)); store.get(name).set(abs(r), res); },
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
    location: new URL('sw.js', scope),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(src, { self, caches, fetch, Request, Response, Headers, URL, Promise, console });
  const respond = async (url, mode = 'cors', method = 'GET') => {
    const ev = { request: new Request(url, { mode, method }), respondWith(p) { this.p = p; } };
    handlers.fetch(ev);
    if (!ev.p) return { intercepted: false };
    try { return { intercepted: true, response: await ev.p }; } catch (error) { return { intercepted: true, error }; }
  };
  return { store, log, state, respond, handlers };
}

const SHELL = 'zuma-shell-B1';
const generated = () => swSource(read('public/sw.js'), { build: 'B1', shell: ['./', './index.html', './js/main.js'], assets: ['pack.json'], assetsHash: 'abcdef012345' });

/** What Pages stores for ./index.html once precached: the 308 to / was followed, so the response is `redirected`. */
const redirectedIndex = scope => ({
  ok: true, status: 200, statusText: 'OK', redirected: true, url: scope,
  headers: new Headers({ 'content-type': 'text/html; charset=utf-8', 'x-shell': 'B1' }),
  body: '<!doctype html><title>Zuma</title>',
  clone() { return this; },
});

for (const scope of ['https://zuma-x.pages.dev/', 'https://h.example/zuma/']) {
  test(`navigation never receives a redirected response (cached ./index.html after Pages' 308), scope ${scope}`, async () => {
    const index = redirectedIndex(scope);
    const h = harness(generated(), { scope, stored: { [SHELL]: [[`${scope}index.html`, index], `${scope}js/main.js`] } });
    // start_url ../index.html: the installed app launches on /index.html.
    const nav = await h.respond(`${scope}index.html`, 'navigate');
    assert.ok(nav.intercepted && nav.response, 'served from the shell');
    assert.equal(nav.response.redirected, false, 'redirected flag cleared');
    assert.equal(nav.response.status, 200);
    assert.equal(nav.response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(nav.response.headers.get('x-shell'), 'B1');
    assert.equal(await nav.response.text(), index.body, 'same body');
    // Offline fallback for an unknown page: the cached ./index.html, cleaned too.
    h.state.online = false;
    const deep = await h.respond(`${scope}niveau/inconnu`, 'navigate');
    assert.equal(deep.response.redirected, false);
    assert.equal(await deep.response.text(), index.body);
  });
}

test('a response that was not redirected is served as is (same object)', async () => {
  const scope = 'https://zuma-x.pages.dev/';
  const h = harness(generated(), { scope, stored: { [SHELL]: ['./', './index.html'] } });
  const cached = h.store.get(SHELL).get(`${scope}index.html`);
  const nav = await h.respond(`${scope}index.html`, 'navigate');
  assert.equal(nav.response, cached);
  h.state.online = false;
  const deep = await h.respond(`${scope}x/y`, 'navigate');
  assert.equal(deep.response, cached);
});

test('Access login flow and /api/ stay on the network: never intercepted, never cached (navigations included)', async () => {
  for (const scope of ['https://zuma-x.pages.dev/', 'https://h.example/zuma/']) {
    const h = harness(generated(), { scope, stored: { [SHELL]: ['./', './index.html'] } });
    const urls = [
      `${scope}cdn-cgi/access/authorized?token=abc.def.ghi&meta=x`,
      `${scope}cdn-cgi/access/logout`,
      'https://zuma-x.pages.dev/cdn-cgi/access/authorized?token=x',
      `${scope}api/scores`,
    ];
    for (const url of urls) {
      for (const mode of ['navigate', 'cors', 'no-cors']) {
        const r = await h.respond(url, mode);
        assert.equal(r.intercepted, false, `${mode} ${url}`);
      }
    }
    assert.deepEqual(h.log.put, [], 'nothing cached');
    assert.deepEqual(h.log.fetched, [], 'the worker itself fetched nothing');
  }
});

test('index.html: manifest fetched with credentials (Access cookie); the standalone strip still matches it', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="public\/manifest\.webmanifest" crossorigin="use-credentials">/);
  // Same expression as tools/build.mjs --standalone: the extra attribute does not defeat it.
  const build = read('tools/build.mjs');
  assert.match(build, /\.replace\(\/<link rel="manifest"\[\^>\]\*>\\n\?\/, ''\)/);
  assert.doesNotMatch(html.replace(/<link rel="manifest"[^>]*>\n?/, ''), /<link rel="manifest"/);
});

test('public/sw.js: clean() for redirected responses, passThrough unchanged; the public build carries both', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /function clean\(response\)/);
  assert.match(sw, /response\.redirected/);
  assert.match(sw, /function passThrough\(url\)[\s\S]*?\/\^\\\/\(api\|cdn-cgi\)\\\/\//, 'passThrough keeps api/ and cdn-cgi/');
  if (fs.existsSync('dist/sw.js')) {
    const built = read('dist/sw.js');
    assert.match(built, /function clean\(response\)/);
    assert.match(built, /function passThrough\(url\)/);
  }
});
