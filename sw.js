const CACHE = 'revenue-offline-v1';
const ROOT = new URL('./', self.location.href);
const OFFLINE = new URL('offline.html', ROOT).href;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('revenue-offline-') && key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Cache only a public offline screen. API responses, OAuth and application data stay network-only.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
      url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
