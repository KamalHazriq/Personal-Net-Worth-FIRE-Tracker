// FIRE Tracker Service Worker
// Cache-first for static assets, network-first for API calls.

const CACHE_NAME = 'fire-tracker-v2'; // bumped: v1 could poison dev with stale modules
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icons/icon.svg'];

// Install: pre-cache critical shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch auth — tokens and lock status must always come from the server.
  if (url.pathname.startsWith('/api/auth/')) return;

  // Network-first for API calls — always try the server, fall back to cache.
  // Only GET responses are cacheable (cache.put throws on POST/PUT/PATCH).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for everything else (static assets, JS/CSS bundles, etc.)
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Only cache same-origin, successful GET responses
          if (response.ok && request.method === 'GET' && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }),
    ),
  );
});
