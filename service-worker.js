const CACHE_NAME = 'dokieli-app-cache-v1';

const APP_FILES = [
  '/',
  '/docs',
  '/media/css/basic.css',
  '/media/css/dokieli.css',
  '/media/images/logo.png',
  '/scripts/dokieli.js'
];

  // does not wait for the service worker to be activated before using it - TODO: is this correct?
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES))
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

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (!APP_FILES.includes(url.pathname)) return; 

  //XXX: Keep false when not developing from localhost
  // const simulateOffline = false;

  event.respondWith(
    (async () => {
      // if (simulateOffline) {
      //   console.log("Simulating offline for localhost: ", req.url);
      //   // Simulated offline for localhost: serve from cache only
      //   const cached = await caches.match(req);
      //   if (cached) return cached;
      //   return new Response('cache not found', {
      //     status: 503,
      //     statusText: 'Service Unavailable',
      //     headers: { 'Content-Type': 'text/plain' },
      //   });
      // }

      // online behavior: fetch and update cache
      try {
        console.log("fetching: ", req.url);
        const networkResponse = await fetch(req);
        const responseClone = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);

        console.log("caching response for ", req.url);
        await cache.put(req, responseClone);
        return networkResponse;
        // if it cannot fetch it serves cached
      } catch (err) {
        const cached = await caches.match(req);
        console.log(cached)
        console.log("fetch failed, serving from cache: ", req.url);
        if (cached) return cached;
        return new Response('cache not found', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })()
  );
});
