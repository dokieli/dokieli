const CACHE_NAME = 'dokieli-app-cache-v6';

const OFFLINE_SHELL = '/offline.html';

// Precached on install.
const APP_SHELL = [
  '/',
  '/index.html',
  '/docs',
  '/media/css/basic.css',
  '/media/css/dokieli.css',
  '/media/images/logo.png',
  '/scripts/dokieli.js'
];

// Cache-first, revalidated against the server in the background.
const STATIC_ASSETS = new Set([
  '/media/css/basic.css',
  '/media/css/dokieli.css',
  '/media/images/logo.png',
  '/scripts/dokieli.js'
]);

// Network-first, cache only as an offline fallback.
const HTML_PAGES = new Set([
  '/',
  '/index.html',
  '/docs'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(APP_SHELL.map(f => cache.add(f)));
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
    caches.keys()
      .then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : undefined)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (STATIC_ASSETS.has(path)) {
    event.respondWith(staleWhileRevalidate(req, path));
  }
  else if (HTML_PAGES.has(path)) {
    event.respondWith(networkFirst(req, path));
  }
  // Offline navigations fall back to the shell, which restores the device copy
  else if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_SHELL))
    );
  }
  // Anything else: no interception, let the browser handle it normally.
});

// Serve from cache immediately; revalidate against the server regardless of HTTP freshness.
async function staleWhileRevalidate(req, key) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);

  const networked = fetch(req, { cache: 'no-cache' })
    .then(response => {
      if (response && response.ok) {
        cache.put(key, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networked) || Response.error();
}

// Prefer the network; fall back to the cached copy when offline.
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(req);
    if (response && response.ok) {
      cache.put(key, response.clone());
    }
    return response;
  }
  catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}
