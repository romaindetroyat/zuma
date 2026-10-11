/*
 * Zuma PWA service worker template (R2.0.20, plan 05-14, D-42). tools/build.mjs fills it through tools/swgen.mjs:
 * build stamp, shell list (every module + the files of dist/public) and the list / fingerprint of the pack in
 * dist/assets (empty without pack). Two caches: the shell of this build, and the pack keyed by its fingerprint, kept
 * from one code version to the next. A new version waits until the page posts « skip-waiting » (« Mettre à jour »).
 */
const VERSION = '__BUILD__';
const SHELL_CACHE = 'zuma-shell-' + VERSION;
const ASSETS_CACHE = 'zuma-assets-__ASSETS_HASH__';
const SHELL = [
  './', './index.html', './public/style.css', './public/manifest.webmanifest', './public/icon.svg',
  './js/core.js', './js/feedback.js', './js/levels.js', './js/audio.js', './js/upscale.js', './js/original.js', './js/pwa.js',
  './js/bitmapfont.js', './js/statsdialog.js', './js/render.js', './js/menudialog.js', './js/progress.js', './js/welcome.js', './js/main.js',
];
const ASSETS = [/* __ASSETS__ */];
const BATCH = 8;
const BASE = new URL('./', self.location.href);

/** Path relative to the worker's folder, or null outside it. */
function relative(url) {
  return url.href.startsWith(BASE.href) ? url.pathname.slice(BASE.pathname.length) : null;
}

/** Hosting endpoints (scores API, Cloudflare Access) always go to the network, untouched and never cached. */
function passThrough(url) {
  const rel = relative(url) ?? '';
  return /^\/(api|cdn-cgi)\//.test(url.pathname) || /^(api|cdn-cgi)\//.test(rel);
}

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
  // Only the pack entries not cached yet: an unchanged pack is not downloaded again when only the code changes.
  // A failed entry does not abort the install; it is fetched (and kept) at its first request.
  const assets = await caches.open(ASSETS_CACHE);
  const missing = [];
  for (const url of ASSETS) if (!(await assets.match(url))) missing.push(url);
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(missing.slice(i, i + BATCH).map(u => assets.add(new Request(u, { cache: 'reload' })).catch(() => undefined)));
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precache());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== ASSETS_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/**
 * A cached response that followed a redirect, rebuilt as a plain one (same status, headers and body). Pages redirects
 * /index.html to / and the manifest's start_url is ../index.html, so the precached ./index.html is `redirected`;
 * a navigation (redirect mode « manual ») cannot be answered with such a response and the installed app would not start.
 */
function clean(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function navigation(request) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = await shell.match(request, { ignoreSearch: true });
  if (hit) return clean(hit);
  try {
    return await fetch(request);
  } catch (error) {
    const index = await shell.match('./index.html');
    if (index) return clean(index);
    throw error;
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
  return response;
}

async function shellFile(request) {
  const shell = await caches.open(SHELL_CACHE);
  return (await shell.match(request)) || fetch(request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || passThrough(url)) return;
  if (request.mode === 'navigate') event.respondWith(navigation(request));
  else if ((relative(url) ?? '').startsWith('assets/')) event.respondWith(asset(request));
  // Any other same-origin GET: this build's shell, else the network; an error stays an error (never index.html).
  else event.respondWith(shellFile(request));
});
