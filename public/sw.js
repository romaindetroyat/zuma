/* Zuma PWA service worker: cache-first app shell, network for everything else. */
const VERSION = '__BUILD__';
const CACHE = `zuma-${VERSION}`;
const SHELL = [
  './', './index.html', './public/style.css', './public/manifest.webmanifest', './public/icon.svg',
  './js/core.js', './js/feedback.js', './js/levels.js', './js/audio.js', './js/upscale.js', './js/original.js', './js/bitmapfont.js', './js/statsdialog.js', './js/render.js', './js/menudialog.js', './js/main.js',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      if (res.ok && new URL(event.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
