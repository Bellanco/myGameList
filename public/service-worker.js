/**
 * Service Worker for My Game List PWA
 * Enables offline functionality and caching strategy
 */

const CACHE_NAME = 'mygamelist-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: Cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {
        // Some assets might fail to cache (e.g., if offline during install)
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
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for navigation, no runtime caching for hashed assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Keep API/auth requests out of runtime cache to avoid stale sensitive data.
  if (request.method !== 'GET') {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.includes('/ts/') ||
      url.pathname.includes('@vite') ||
      url.pathname.includes('__vite')) {
    return;
  }

  const acceptHeader = request.headers.get('accept') || '';
  const isHtmlNavigation = request.mode === 'navigate' || acceptHeader.includes('text/html');
  const isImmutableAsset = url.pathname.startsWith('/assets/');

  // Always go to network for hashed assets to avoid stale chunk mismatch after deploys.
  if (isImmutableAsset) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isHtmlNavigation && response && response.status === 200 && response.type === 'basic') {
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', response.clone()));
        }
        return response;
      })
      .catch(async () => {
        if (isHtmlNavigation) {
          const offlineShell = await caches.match('/index.html');
          if (offlineShell) {
            return offlineShell;
          }
        }

        return new Response('Offline - Content unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
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
