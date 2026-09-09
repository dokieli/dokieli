const CACHE_NAME = 'dokieli-app-cache-v5';

const OFFLINE_SHELL = '/offline.html';

const APP_FILES = [
  '/',
  '/index.html',
  '/docs',
  '/media/css/basic.css',
  '/media/css/dokieli.css',
  '/media/images/logo.png',
  '/scripts/dokieli.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(APP_FILES.map(f => cache.add(f)));
      // Re-wrap to drop any redirect flag; redirected responses are rejected for navigations
      try {
        const response = await fetch(OFFLINE_SHELL);
        if (response.ok) {
          const body = await response.blob();
          await cache.put(OFFLINE_SHELL, new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        }
      } catch {}
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const cacheKey = url.pathname;

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Offline navigations fall back to the shell, which restores the device copy
  if (!APP_FILES.includes(url.pathname)) {
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).catch(() => caches.match(OFFLINE_SHELL))
      );
    }
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // console.log("fetching: ", req.url);
        const networkResponse = await fetch(req);
        const responseClone = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);
        // console.log("caching response for ", req.url);
        await cache.put(cacheKey, responseClone);
        return networkResponse;
      } catch (err) {
        // console.log(err)
        // console.log(req)
        const cached = await caches.match(cacheKey);
        // console.log(cached)
        // console.log("fetch failed, serving from cache: ", req.url);
        if (cached) return cached;
        else {
          throw new Error(err)
          // console.log(req.url)
        }
      }
    })()
  );
});
