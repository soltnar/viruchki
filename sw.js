const CACHE = 'revenue-offline-v6';
const ROOT = new URL('./', self.location.href);
const OFFLINE = new URL('offline.html', ROOT).href;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('revenue-offline-') && key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()).then(async () => {
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      const url = new URL(client.url);
      if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname) ||
          url.searchParams.has('code') || /access_token|error=/.test(url.hash)) continue;
      url.searchParams.set('v', '20261008-13');
      await client.navigate(url.href);
    }
  }));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Cache only a public offline screen. API responses, OAuth and application data stay network-only.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
      url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(OFFLINE)));
});
