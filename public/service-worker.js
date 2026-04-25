/**
 * Service Worker for My Game List PWA
 * Enables offline functionality and caching strategy
 */

const CACHE_NAME = 'mygamelist-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/ts/app.ts',
  '/ts/sync.ts',
  '/ts/migrate.ts',
  '/manifest.json',
];

// Install: Cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Installing and caching assets');
      return cache.addAll(ASSETS).catch(() => {
        // Some assets might fail to cache (e.g., if offline during install)
        console.warn('[Service Worker] Some assets failed to cache');
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests and external requests
  if (request.method !== 'GET' || request.url.includes('gist.github')) {
    return;
  }

  event.respondWith(
    // Try network first
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const cache = caches.open(CACHE_NAME);
          cache.then((c) => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => {
        // Fall back to cache
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log('[Service Worker] Serving from cache:', request.url);
            return cached;
          }
          // Offline fallback for HTML pages
          if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
          // Generic offline response
          return new Response('Offline - Content unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        });
      })
  );
});

// Sync for background data sync (optional, requires user permission)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-games') {
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'SYNC_GAMES',
            timestamp: Date.now(),
          });
        });
      })
    );
  }
});
