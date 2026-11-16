const CACHE_PREFIX = 'nexus-eq-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const APP_ROOT = self.registration.scope;

self.addEventListener('install', () => {
  // Keep the new worker waiting until the user accepts the update.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key =>
      (key.startsWith(CACHE_PREFIX) || key.startsWith('nexus-equalizer-shell-')) && key !== CACHE_NAME
    ).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'NEXUS_SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(new URL('./', APP_ROOT), response.clone());
          await cache.put(new URL('./index.html', APP_ROOT), response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(new URL('./index.html', APP_ROOT))) || Response.error();
      }
    })());
    return;
  }

  const url = new URL(request.url);
  if (url.pathname.includes('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
