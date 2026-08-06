/**
 * Service Worker de My Game List (PWA).
 *
 * QUÉ ARREGLA ESTE FICHERO (bug histórico): la versión anterior decía cachear para funcionar offline, pero
 * precacheaba solo `['/', '/manifest.json']` y para `/assets/*` hacía `fetch(request)` a pelo, SIN caché ni
 * respaldo. Resultado sin red: la navegación devolvía el shell HTML cacheado, y acto seguido fallaban TODOS los
 * chunks de JS y CSS que ese HTML referencia → pantalla en blanco. La app se anunciaba como offline-first y no
 * arrancaba offline.
 *
 * ESTRATEGIA (tres reglas, por tipo de recurso):
 *  - Navegaciones (HTML) → RED PRIMERO, con el shell cacheado como respaldo. El HTML es lo único que cambia de
 *    contenido sin cambiar de URL, así que nunca se sirve de caché habiendo red (es también lo que hace el
 *    `Cache-Control: no-store` de `public/_headers`). Offline, cualquier ruta de la SPA cae en el shell, igual
 *    que hace `_redirects` en el servidor.
 *  - `/assets/*` → CACHÉ PRIMERO. Aquí no hay riesgo de servir algo viejo: Vite les pone un hash de contenido
 *    en el nombre, así que una URL identifica un contenido para siempre y un despliegue nuevo estrena nombres.
 *    Esta es la regla que hace que la app arranque de verdad sin red.
 *  - Resto de GET del mismo origen (iconos, manifest) → CACHÉ Y REVALIDA en segundo plano.
 *
 * PRECACHE: `PRECACHE_ASSETS` lo inyecta el build (plugin `serviceWorkerPrecache` de `vite.config.ts`) con los
 * chunks del ARRANQUE — el entry y lo que importa de forma estática, más su CSS. A propósito NO lleva los chunks
 * perezosos (Firebase, hub social, panel de administración, temas): son la mayor parte del peso y no hacen falta
 * para arrancar; los va guardando la regla de caché-primero a medida que el usuario los visita. Así la instalación
 * es ligera y las listas —el núcleo de la app— funcionan offline desde el primer arranque.
 *
 * ACTUALIZACIONES: NO se llama a `skipWaiting()`. El SW nuevo espera a que se cierren las pestañas que usa el
 * viejo, y solo entonces borra las cachés anteriores. Tomar el control a la fuerza y borrar la caché vieja deja a
 * una pestaña abierta sin los chunks que todavía puede necesitar (los del despliegue anterior, que ya no están en
 * el servidor). El coste de esperar es nulo: el HTML se sirve con red primero, así que recargar siempre trae la
 * versión nueva; lo único que va un paso por detrás es la copia offline.
 */

// Sustituidos en el build. Los valores por defecto mantienen el fichero válido y funcional (sin precache) si se
// sirviera sin pasar por el plugin.
const BUILD_ID = self.__SW_BUILD_ID__ || 'dev';
const PRECACHE_ASSETS = self.__PRECACHE_ASSETS__ || [];

const CACHE_NAME = `mygamelist-${BUILD_ID}`;

/** Shell mínimo: la raíz (con la que se responde a cualquier ruta de la SPA offline) y el manifest. */
const SHELL = ['/', '/manifest.json'];

/** Peticiones del servidor de desarrollo de Vite: nunca se tocan. */
function isDevRequest(url) {
  return url.pathname.includes('/ts/') || url.pathname.includes('@vite') || url.pathname.includes('__vite');
}

/** Solo se guardan respuestas completas del propio origen (no opacas, no parciales, no errores). */
function isCacheable(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic';
}

function offlineResponse() {
  return new Response('Offline - Content unavailable', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({ 'Content-Type': 'text/plain' }),
  });
}

// Install: precachea el shell y los chunks del arranque.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // `allSettled` y no `addAll`: si una sola URL falla (lista desincronizada tras un despliegue a medias, red
    // intermitente), `addAll` abortaría la instalación entera y nos quedaríamos sin SW. Mejor un precache
    // parcial —que la regla de caché-primero completará sola— que ninguno.
    // `cache: 'reload'` evita que la caché HTTP del navegador cuele una copia vieja en el precache.
    await Promise.allSettled(
      [...SHELL, ...PRECACHE_ASSETS].map((path) => cache.add(new Request(path, { cache: 'reload' }))),
    );
  })());
});

// Activate: limpia las cachés de builds anteriores. Solo ocurre cuando este SW toma el control de verdad, es
// decir cuando ya no queda ninguna pestaña usando el anterior (ver la nota de `skipWaiting` arriba).
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/** Navegación: red primero; sin red, el shell cacheado (y si tampoco lo hay, un 503 legible). */
async function handleNavigation(request, url) {
  // Todas las navegaciones comparten una sola entrada de shell: `/`. `/index.html` se normaliza a `/` para no
  // guardar dos copias del mismo documento.
  const target = url.pathname === '/index.html'
    ? new Request('/', { method: 'GET', headers: request.headers, credentials: 'same-origin', redirect: 'follow', cache: 'no-cache' })
    : request;

  try {
    const response = await fetch(target);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const shell = await cache.match('/');
    return shell || offlineResponse();
  }
}

/** Assets con hash de contenido: caché primero. La URL identifica el contenido, así que no puede quedar vieja. */
async function handleImmutableAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) {
    return hit;
  }

  // Sin copia local: se pide a la red y se guarda. Es lo que va poblando la caché con los chunks perezosos
  // (hub social, temas, panel) a medida que se visitan, para que después estén disponibles offline.
  const response = await fetch(request);
  if (isCacheable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

/** Iconos, manifest y demás estáticos: se sirve la copia y se revalida en segundo plano. */
async function handleStaleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);

  const revalidate = fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    });

  if (hit) {
    // La revalidación no debe morir con el handler ni provocar un rechazo sin capturar.
    event.waitUntil(revalidate.catch(() => {}));
    return hit;
  }

  try {
    return await revalidate;
  } catch {
    return offlineResponse();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET del mismo origen. Las APIs externas (GitHub, Firebase) quedan fuera de la caché a propósito: son
  // datos sensibles y con su propia semántica de frescura (ETag, reglas).
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isDevRequest(url)) {
    return;
  }

  const acceptHeader = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || acceptHeader.includes('text/html')) {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleImmutableAsset(request));
    return;
  }

  event.respondWith(handleStaleWhileRevalidate(request, event));
});

// Sync en segundo plano (opcional, requiere permiso del usuario): avisa a los clientes para que sincronicen.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-games') {
    event.waitUntil(
      self.clients.matchAll().then((clientList) => {
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
