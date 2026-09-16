/**
 * Service Worker de My Game List (PWA).
 *
 * QUÉ ARREGLA ESTE FICHERO (bug histórico): la versión anterior decía cachear para funcionar offline, pero
 * precacheaba solo `['/', '/manifest.json']` y para `/assets/*` hacía `fetch(request)` a pelo, SIN caché ni
 * respaldo. Resultado sin red: la navegación devolvía el shell HTML cacheado, y acto seguido fallaban TODOS los
 * chunks de JS y CSS que ese HTML referencia → pantalla en blanco. La app se anunciaba como offline-first y no
 * arrancaba offline.
 *
 * ESTRATEGIA (cuatro reglas, por tipo de recurso):
 *  - Navegaciones (HTML) → RED PRIMERO, con el shell cacheado como respaldo. El HTML es lo único que cambia de
 *    contenido sin cambiar de URL, así que nunca se sirve de caché habiendo red (es también lo que hace el
 *    `Cache-Control: no-store` de `public/_headers`). Offline, cualquier ruta de la SPA cae en el shell, igual
 *    que hace `_redirects` en el servidor.
 *  - `/assets/*` → CACHÉ PRIMERO. Aquí no hay riesgo de servir algo viejo: Vite les pone un hash de contenido
 *    en el nombre, así que una URL identifica un contenido para siempre y un despliegue nuevo estrena nombres.
 *    Esta es la regla que hace que la app arranque de verdad sin red.
 *  - `/cover` → CACHÉ PRIMERO, con revalidación en segundo plano solo cuando la copia ya tiene sus días. Una
 *    carátula no cambia salvo que se corrija el título o IGDB estrene ficha, y son ~300 por biblioteca: pedirlas
 *    todas en cada visita era el gasto más grande del service worker (ver `COVER_REVALIDATE_AFTER_MS`).
 *  - Resto de GET del mismo origen (iconos, manifest) → CACHÉ Y REVALIDA en segundo plano.
 *
 * FUERA DE LA CACHÉ, SIEMPRE: `/api/*` (nuestras Pages Functions). Son respuestas por usuario y revocables; el
 * porqué en detalle está en el handler `fetch`, que es donde se descarta.
 *
 * PRECACHE: `PRECACHE_ASSETS` lo inyecta el build (plugin `serviceWorkerPrecache` de `vite.config.ts`) con los
 * chunks del ARRANQUE — el entry y lo que importa de forma estática, más su CSS. A propósito NO lleva los chunks
 * perezosos (Firebase, hub social, panel de administración, temas): son la mayor parte del peso y no hacen falta
 * para arrancar; los va guardando la regla de caché-primero a medida que el usuario los visita. Así la instalación
 * es ligera y las listas —el núcleo de la app— funcionan offline desde el primer arranque.
 *
 * ACTUALIZACIONES: se llama a `skipWaiting()`. Antes NO se llamaba, con este razonamiento: tomar el control a la
 * fuerza y borrar la caché vieja deja a una pestaña abierta sin los chunks que todavía puede necesitar. El
 * razonamiento es correcto pero el coste NO era nulo, y en producción salió carísimo: esperar a que se cierren
 * TODAS las pestañas del sitio es una condición que en móvil no se cumple casi nunca. Dispositivos reales se
 * quedaron con el SW ANTERIOR —el del bug de arriba— como controlador durante meses, sirviendo un shell obsoleto
 * que pide chunks ya borrados del servidor, mientras el SW nuevo, ya descargado y con todo precacheado, se
 * quedaba en `waiting` para siempre. Es un bloqueo mutuo: el bug que este fichero arregla impide que el arreglo
 * llegue. `skipWaiting()` lo rompe, y es la ÚNICA vía que alcanza a un dispositivo ya atascado, porque el
 * navegador comprueba e instala este script por su cuenta en cada navegación aunque el JavaScript de la app no
 * llegue a arrancar (`/service-worker.js` se sirve con `no-cache`, ver `public/_headers`).
 *
 * El riesgo que motivó no usarlo queda cubierto por `handleImmutableAsset`: un chunk que ya no está en el
 * servidor devuelve un 404 limpio, la app lo detecta por `vite:preloadError` y recarga una vez (ver `main.tsx`).
 */

// Sustituidos en el build. Los valores por defecto mantienen el fichero válido y funcional (sin precache) si se
// sirviera sin pasar por el plugin.
const BUILD_ID = self.__SW_BUILD_ID__ || 'dev';
const PRECACHE_ASSETS = self.__PRECACHE_ASSETS__ || [];

const CACHE_NAME = `mygamelist-${BUILD_ID}`;

/**
 * LAS CARÁTULAS VAN EN SU PROPIO CUBO, y sin el id del build en el nombre. La caché normal se tira entera en
 * cada despliegue (ver el `activate`), y eso es lo correcto para los chunks —el build nuevo estrena nombres—
 * pero sería absurdo para las carátulas: son de IGDB, no del build, no cambian al publicar y una biblioteca
 * grande son ~300 imágenes y varios megas. Con el nombre atado al build, cada versión que publicaras obligaría
 * a todo el mundo a volver a bajárselas.
 *
 * La `v1` del nombre es la manija para tirarlas a propósito si algún día hace falta; no la toques por publicar.
 */
const COVER_CACHE_NAME = 'mygamelist-covers-v1';

/**
 * CUÁNTO SE FÍA DE UNA CARÁTULA YA GUARDADA antes de volver a preguntar por ella.
 *
 * Las carátulas se servían con «caché y revalida», que es la regla del resto de estáticos, y ahí estaba mal: esa
 * regla vuelve a pedir SIEMPRE, así que abrir el mosaico con la biblioteca ya llena disparaba ~300 peticiones y
 * ~300 reescrituras del cubo para recibir trescientas veces exactamente los mismos bytes. La caché HTTP del
 * navegador solía absorber el viaje —la respuesta trae `max-age` de un mes—, pero la reescritura no la absorbe
 * nadie, y en cuanto esa caché desaloja una entrada el viaje sale de verdad a la red.
 *
 * Una carátula es lo más parecido a inmutable que hay aquí: el emparejamiento nombre → portada solo cambia si se
 * corrige una errata del título o si IGDB estrena ficha. Eso pasa en días, no en minutos, así que se sirve de
 * caché sin preguntar y solo se revalida —una vez, en segundo plano— la copia que ya tiene sus días encima.
 */
const COVER_REVALIDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * TOPE DE CARÁTULAS GUARDADAS. El cubo sobrevive a los despliegues a propósito (ver arriba), así que sin esto lo
 * único que hacía era crecer: los juegos que se renombran o se borran de la lista dejan su entrada dentro para
 * siempre, y nadie la vuelve a pedir.
 *
 * 800 sale de la biblioteca de referencia: 302 juegos que se piden hasta en dos tamaños (el del mosaico y el de
 * la franja del renglón) son ~600 entradas de uso legítimo, y el resto es margen para que la poda no muerda lo
 * que se está mirando. Cuando se pasa, se tiran las más antiguas: la Cache API devuelve las claves en el orden en
 * que se metieron, así que `keys()` ya da el orden de sacrificio.
 *
 * No es una cuota de bytes porque no hace falta que lo sea: lo que se quiere evitar es el crecimiento sin fin,
 * no apurar el almacenamiento. Si el origen llegara a su cuota, el navegador desaloja el origen ENTERO —shell y
 * chunks incluidos—, que es justo el estropicio que este tope aleja.
 */
const MAX_COVERS_EN_CACHE = 800;

/** Shell mínimo: la raíz (con la que se responde a cualquier ruta de la SPA offline) y el manifest. */
const SHELL = ['/', '/manifest.json'];

/** Peticiones del servidor de desarrollo de Vite: nunca se tocan. */
function isDevRequest(url) {
  return url.pathname.includes('/ts/') || url.pathname.includes('@vite') || url.pathname.includes('__vite');
}

/**
 * ¿La respuesta es el shell de la SPA colado donde se esperaba otra cosa?
 *
 * El `/* /index.html 200` de `public/_redirects` responde a CUALQUIER ruta sin fichero con el shell y un 200, así
 * que un chunk que ya no existe no da 404: da `index.html` con `Content-Type: text/html`. El navegador rechaza
 * el módulo por MIME y la app no arranca. Peor: la regla `/assets/*` de `public/_headers` le pone
 * `immutable, max-age=31536000` a ESA respuesta, de modo que la basura se queda un año en la caché HTTP, y sin
 * esta comprobación también se quedaba en la del service worker.
 *
 * `functions/assets/[[path]].ts` corta el problema en el servidor devolviendo un 404 de verdad; esto es la red de
 * seguridad del lado del cliente, y lo que rescata a un dispositivo que arrastre el envenenamiento de antes.
 */
function isShellFallback(request, response) {
  if (!response) {
    return false;
  }
  // La navegación es el ÚNICO caso en el que `text/html` es la respuesta correcta. Se comprueba por ahí y no por
  // `request.destination === 'script'`: `destination` viene vacío en bastantes contextos (peticiones creadas a
  // mano, entornos sin soporte completo) y una guarda que dependa de él deja pasar justo lo que busca.
  if (request && (request.mode === 'navigate' || request.destination === 'document')) {
    return false;
  }
  return (response.headers.get('content-type') || '').includes('text/html');
}

/**
 * Solo se guardan respuestas completas del propio origen (no opacas, no parciales, no errores), y nunca el shell
 * servido en lugar del recurso pedido.
 */
function isCacheable(response, request) {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return false;
  }
  return !isShellFallback(request, response);
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
    // Al final y no al principio: así se toma el control con el precache ya escrito, nunca con la caché a medias.
    // Ver la nota de ACTUALIZACIONES en la cabecera para por qué esto no es opcional.
    await self.skipWaiting();
  })());
});

// Activate: limpia las cachés de builds anteriores. Con `skipWaiting()` esto ocurre en cuanto termina la
// instalación, sin esperar a que se cierren las pestañas abiertas (ver la nota de la cabecera).
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // El cubo de carátulas SOBREVIVE al despliegue a propósito: ver `COVER_CACHE_NAME`.
    const conservar = new Set([CACHE_NAME, COVER_CACHE_NAME]);
    await Promise.all(names.filter((name) => !conservar.has(name)).map((name) => caches.delete(name)));
    // Y como el cubo de carátulas es el único que NO se tira, este es el momento de recortarlo: un despliegue es
    // el punto fijo que un cubo perpetuo no tiene. El resto del recorte lo hace `handleCover` mientras se llena.
    await podarCaratulas(await caches.open(COVER_CACHE_NAME)).catch(() => {});
    await self.clients.claim();
  })());
});

/**
 * Cuánto se espera a la red en una navegación antes de tirar del shell cacheado.
 *
 * No es un ajuste de rendimiento, es defensa ante un bloqueo de red. Un corte limpio (modo avión, wifi caído)
 * hace que `fetch` falle en milisegundos y el respaldo entra solo. Un BLOQUEO —el operador descarta los paquetes
 * hacia la IP, que es como se aplican en España las órdenes de bloqueo sobre rangos de Cloudflare, y este sitio
 * vive en uno— no falla: la petición se queda colgada hasta que expira el TCP, entre 30 y 90 segundos. Sin este
 * corte, `fetch` no rechaza, el `catch` no llega y el usuario mira una pantalla en blanco todo ese rato teniendo
 * una copia perfectamente servible a un centímetro. Tres segundos son de sobra para cualquier red real y
 * convierten un sitio inaccesible en uno que arranca al instante.
 */
const NAVIGATION_TIMEOUT_MS = 3000;

/** Navegación: red primero (con tope de espera); sin red, el shell cacheado (y si tampoco lo hay, un 503 legible). */
async function handleNavigation(request, url) {
  // Todas las navegaciones comparten una sola entrada de shell: `/`. `/index.html` se normaliza a `/` para no
  // guardar dos copias del mismo documento.
  const target = url.pathname === '/index.html'
    ? new Request('/', { method: 'GET', headers: request.headers, credentials: 'same-origin', redirect: 'follow', cache: 'no-cache' })
    : request;

  // El tope solo aplica si hay algo con lo que responder: sin shell cacheado, abortar dejaría al usuario con un
  // error donde antes tenía una espera larga pero con final feliz.
  const cache = await caches.open(CACHE_NAME);
  const shell = await cache.match('/');
  const controller = shell ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS) : null;

  try {
    const response = await fetch(controller ? new Request(target, { signal: controller.signal }) : target);
    // El shell se refresca desde cualquier navegación MENOS las de `/r/:token`. Esas las sirve una Function que
    // reescribe `<title>` y las etiquetas `og:` con los datos de UNA reseña concreta (ver `functions/r/[token]`),
    // así que guardarla bajo la clave `/` deja el shell de todo el mundo firmado con la reseña de otra persona.
    // No afecta a las previsualizaciones —los agentes de los chats no pasan por el service worker— pero el
    // documento que se sirve offline no tiene por qué llevar los metadatos del último enlace que se abrió.
    if (!url.pathname.startsWith('/r/') && isCacheable(response, request)) {
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    return shell || offlineResponse();
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
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

  // Chunk que ya no está en el servidor: llega el shell con un 200 en vez de un 404 (ver `isShellFallback`).
  // Se responde con un 404 propio para que el fallo sea el que la app sabe tratar —`vite:preloadError` recarga
  // una vez, ver `main.tsx`— en lugar de un error de MIME que no dispara nada. Y se tira el shell cacheado: es
  // el que referencia este chunk fantasma, así que la recarga tiene que ir a la red a por uno nuevo.
  if (isShellFallback(request, response)) {
    await cache.delete('/');
    return new Response('Asset no disponible: pertenece a un build anterior.', {
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }),
    });
  }

  if (isCacheable(response, request)) {
    await cache.put(request, response.clone());
  }
  return response;
}

/** Iconos, manifest y demás estáticos: se sirve la copia y se revalida en segundo plano. */
async function handleStaleWhileRevalidate(request, event, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const revalidate = fetch(request)
    .then(async (response) => {
      if (isCacheable(response, request)) {
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

/**
 * Edad de una respuesta guardada, en milisegundos, según su cabecera `Date`. `Infinity` cuando no se puede leer:
 * sin fecha no se puede afirmar que sea fresca, y el peor caso de equivocarse por ahí es revalidar de más —el
 * comportamiento de antes—, mientras que el de equivocarse al revés sería no refrescar jamás.
 */
function edadDe(response) {
  const fecha = Date.parse(response?.headers?.get('date') || '');
  return Number.isFinite(fecha) ? Date.now() - fecha : Infinity;
}

/**
 * EL TOPE, LEVANTADO. La aplicación puede pedir que no se pode (lo hace para el rango más alto, y solo mientras
 * el navegador diga que hay sitio de sobra: ver `core/utils/coverLimits`). El worker no puede comprobar ni el
 * rango ni el almacenamiento por su cuenta, así que se lo dicen por `postMessage`.
 *
 * La bandera se guarda en el propio cubo, como una entrada más, porque el worker se para y arranca cuando el
 * navegador quiere: en una variable se habría perdido en el primer reinicio y la poda habría vuelto sin que
 * nadie se enterara.
 */
const CLAVE_SIN_TOPE = '/__covers-sin-tope';

async function sinTopeDeCaratulas(cache) {
  return Boolean(await cache.match(CLAVE_SIN_TOPE));
}

self.addEventListener('message', (event) => {
  if (event.data?.tipo !== 'covers-sin-tope') {
    return;
  }
  event.waitUntil((async () => {
    const cache = await caches.open(COVER_CACHE_NAME);
    if (event.data.valor) {
      await cache.put(CLAVE_SIN_TOPE, new Response('1'));
    } else {
      // Al volver el tope se poda en el acto: si se ha llegado aquí es porque ya no hay sitio de sobra, y
      // esperar a la siguiente carátula nueva sería esperar justo cuando no se puede.
      await cache.delete(CLAVE_SIN_TOPE);
      await podarCaratulas(cache);
    }
  })());
});

/**
 * Deja el cubo de carátulas por debajo de su tope, tirando las más antiguas. Se cuentan las entradas y no los
 * bytes: `cache.keys()` es una lista de peticiones y medir el peso obligaría a abrir cada respuesta.
 */
async function podarCaratulas(cache) {
  if (await sinTopeDeCaratulas(cache)) {
    return;
  }
  const claves = await cache.keys();
  if (claves.length <= MAX_COVERS_EN_CACHE) {
    return;
  }
  const caratulas = claves.filter((clave) => !clave.url.endsWith(CLAVE_SIN_TOPE));
  if (caratulas.length <= MAX_COVERS_EN_CACHE) {
    return;
  }
  const sobran = caratulas.slice(0, caratulas.length - MAX_COVERS_EN_CACHE);
  await Promise.all(sobran.map((clave) => cache.delete(clave)));
}

/**
 * Cada cuántas carátulas NUEVAS se comprueba el tope. Contarlo en una variable del worker —que muere y renace a
 * menudo— es a propósito: quien llena una biblioteca entera lo hace en una sola sesión larga del worker y pasa
 * por aquí varias veces, mientras que quien solo abre la app y mira cuatro cajas no paga un recorrido de claves
 * por cada imagen.
 */
const CADA_CUANTAS_SE_PODA = 50;
let caratulasNuevas = 0;

/**
 * CARÁTULAS: CACHÉ PRIMERO, y la copia vieja se refresca sola por detrás (ver `COVER_REVALIDATE_AFTER_MS`).
 *
 * La diferencia con `handleStaleWhileRevalidate` es la que se ve al abrir el mosaico con la biblioteca llena:
 * allí son trescientas peticiones y trescientas reescrituras del cubo para recibir los mismos bytes; aquí, cero.
 */
async function handleCover(request, event) {
  const cache = await caches.open(COVER_CACHE_NAME);
  const hit = await cache.match(request);

  if (hit) {
    if (edadDe(hit) >= COVER_REVALIDATE_AFTER_MS) {
      // Una sola vez y en segundo plano: quien mira la caja se lleva la copia que ya hay, sin esperar a nada.
      event.waitUntil((async () => {
        try {
          const fresca = await fetch(request);
          if (isCacheable(fresca, request)) {
            await cache.put(request, fresca.clone());
          }
        } catch {
          // Sin red no pasa nada: la copia guardada sigue sirviendo y se reintentará en otra visita.
        }
      })());
    }
    return hit;
  }

  try {
    const response = await fetch(request);
    if (isCacheable(response, request)) {
      await cache.put(request, response.clone());
      caratulasNuevas += 1;
      if (caratulasNuevas % CADA_CUANTAS_SE_PODA === 0) {
        event.waitUntil(podarCaratulas(cache).catch(() => {}));
      }
    }
    return response;
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

  // NUESTRA propia API (`/api/*`, las Pages Functions) queda fuera de la caché igual que las externas, y por un
  // motivo que la comprobación de origen de arriba NO cubre: es del mismo origen, así que sin esto caía en
  // `handleStaleWhileRevalidate`. Y ahí no valen las cabeceras: la Cache API guarda lo que se le mande, ignorando
  // el `Cache-Control: no-store` que estas respuestas ya traen, y `cache.match()` casa SOLO por URL —no hay
  // `Vary: Authorization`—, así que una entrada servía para cualquier sesión. En la práctica se quedaban
  // guardados `/api/share/mine` (mis enlaces, mi cuota, mi veto con su motivo) y `/api/share/all` (el censo del
  // panel), y de ahí salían tres problemas: sobrevivían a cerrar sesión y a borrar la cuenta, en un navegador
  // compartido el siguiente usuario veía en el primer pintado la lista del anterior, y un enlace retirado se
  // seguía sirviendo desde la caché local —justo lo que el `max-age=60` corto pretendía evitar—.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
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

  // Carátulas: su propio cubo (para que un despliegue no se las lleve por delante) y su propia regla.
  if (url.pathname === '/cover') {
    event.respondWith(handleCover(request, event));
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
