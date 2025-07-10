const CACHE_NAME = 'dokieli-app-cache-v1';

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
  const cacheKey = url.pathname;

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (!APP_FILES.includes(url.pathname)) return; 

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
