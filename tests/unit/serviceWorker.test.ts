import { beforeEach, describe, expect, it, vi } from 'vitest';
// `?raw` y no `node:fs`: el tsconfig del proyecto deja fuera `@types/node` a propósito (ver su comentario), así
// que leer el fichero con APIs de Node rompería `npm run typecheck`. Vite resuelve el contenido en el propio
// build de los tests y el import queda tipado por `vite/client`.
import SW_SOURCE from '../../public/service-worker.js?raw';

// Service worker de la PWA. Estos tests existen porque `public/service-worker.js` no tenía ninguno y se llevó por
// delante la app en producción: dispositivos móviles que se quedaban indefinidamente en "cargando". Cada bloque
// fija una de las tres invariantes de las que dependía aquel fallo.
//
// El fichero es un script de `public/`, sin exports y pensado para el ámbito global de un worker, así que aquí se
// evalúa dentro de un `self` simulado y se capturan sus manejadores para poder invocarlos.

const ORIGIN = 'https://mygamelist.pages.dev';

/**
 * `Request` que resuelve las rutas relativas contra el origen del sitio. El worker construye peticiones con rutas
 * absolutas de servidor (`'/'`, `'/assets/app.js'`), que el `Request` de Node rechaza por no ser URLs completas.
 */
class ScopedRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, ORIGIN).toString() : input, init);
  }
}

interface FakeCache {
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function html(body = '<!DOCTYPE html>'): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function javascript(body = 'export default 1;'): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/javascript' } });
}

/**
 * Evalúa el service worker en un ámbito controlado y devuelve lo necesario para dirigirlo: sus manejadores, la
 * caché simulada y el `fetch` espiado.
 *
 * `response.type` es de solo lectura en la implementación nativa y el worker lo exige para cachear
 * (`isCacheable`), así que se fuerza a `'basic'` sobre cada respuesta que devuelve el `fetch` simulado.
 */
function loadServiceWorker(options: { fetchImpl?: (request: Request) => Promise<Response>; shell?: Response | undefined } = {}) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const cache: FakeCache = {
    put: vi.fn(async () => {}),
    match: vi.fn(async (key: unknown) => (String((key as Request)?.url ?? key).endsWith('/') ? options.shell : undefined)),
    add: vi.fn(async () => {}),
    delete: vi.fn(async () => true),
  };

  // El `fetch` real rechaza con `AbortError` cuando se aborta su señal, y de eso depende el tope de espera de las
  // navegaciones: un mock que la ignore convierte el test en un cuelgue de diez segundos en lugar de una prueba.
  const fetchMock = vi.fn((input: Request | string) => {
    const request = input instanceof Request ? input : new ScopedRequest(input);
    const call = (async () => {
      const response = options.fetchImpl ? await options.fetchImpl(request) : javascript();
      Object.defineProperty(response, 'type', { value: 'basic', configurable: true });
      return response;
    })();

    const signal = request.signal;
    if (!signal) {
      return call;
    }
    return Promise.race([
      call,
      new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }),
    ]);
  });

  const self = {
    __SW_BUILD_ID__: 'test',
    __PRECACHE_ASSETS__: ['/assets/app.js'],
    location: { origin: ORIGIN },
    registration: { unregister: vi.fn(async () => true) },
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []) },
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => handlers.set(type, handler),
    caches: { open: vi.fn(async () => cache), keys: vi.fn(async () => ['mygamelist-test']), delete: vi.fn(async () => true) },
  };

  new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', 'setTimeout', 'clearTimeout', SW_SOURCE)(
    self, self.caches, fetchMock, Response, ScopedRequest, URL, setTimeout, clearTimeout,
  );

  return { self, cache, fetchMock, handlers };
}

/** Dispara un manejador de `fetch` del worker y devuelve la respuesta con la que contestó. */
async function respondTo(sw: ReturnType<typeof loadServiceWorker>, request: Request): Promise<Response> {
  let responded: Promise<Response> | Response = new Response(null, { status: 599 });
  sw.handlers.get('fetch')?.({
    request,
    respondWith: (value: Promise<Response> | Response) => { responded = value; },
    waitUntil: () => {},
  });
  return responded;
}

describe('service worker — instalación', () => {
  it('llama a skipWaiting para poder relevar a un worker anterior con pestañas abiertas', async () => {
    // La versión sin esto dejaba al worker nuevo en `waiting` para siempre en móvil, donde las pestañas no se
    // cierran nunca: el dispositivo se quedaba servido por un shell obsoleto que ya no sabía arrancar la app.
    const sw = loadServiceWorker();
    let installed: Promise<unknown> = Promise.resolve();
    sw.handlers.get('install')?.({ waitUntil: (value: Promise<unknown>) => { installed = value; } });
    await installed;

    expect(sw.self.skipWaiting).toHaveBeenCalled();
    expect(sw.cache.add).toHaveBeenCalled();
  });

  it('precachea antes de relevar, nunca con la caché a medias', async () => {
    const order: string[] = [];
    const sw = loadServiceWorker();
    sw.cache.add.mockImplementation(async () => { order.push('add'); });
    sw.self.skipWaiting.mockImplementation(async () => { order.push('skipWaiting'); });

    let installed: Promise<unknown> = Promise.resolve();
    sw.handlers.get('install')?.({ waitUntil: (value: Promise<unknown>) => { installed = value; } });
    await installed;

    expect(order.at(-1)).toBe('skipWaiting');
    expect(order).toContain('add');
  });
});

describe('service worker — chunk de un build anterior', () => {
  // `_redirects` responde a cualquier ruta sin fichero con el shell y un 200. Para un chunk borrado eso significa
  // recibir `text/html` donde se esperaba JavaScript: el módulo se rechaza por MIME, no salta `vite:preloadError`
  // y —con la regla `immutable` de `_headers`— el navegador se guarda la basura un año.
  it('responde 404 en vez de dejar pasar el shell servido como asset', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => html() });
    const response = await respondTo(sw, new Request('https://mygamelist.pages.dev/assets/viejo-abc123.js'));

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('no guarda en caché el shell colado como asset', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => html() });
    await respondTo(sw, new Request('https://mygamelist.pages.dev/assets/viejo-abc123.js'));

    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it('descarta el shell cacheado, que es el que referencia ese chunk fantasma', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => html() });
    await respondTo(sw, new Request('https://mygamelist.pages.dev/assets/viejo-abc123.js'));

    expect(sw.cache.delete).toHaveBeenCalledWith('/');
  });

  it('sigue cacheando con normalidad un asset que sí existe', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => javascript() });
    const response = await respondTo(sw, new Request('https://mygamelist.pages.dev/assets/app-nuevo.js'));

    expect(response.status).toBe(200);
    expect(sw.cache.put).toHaveBeenCalled();
  });
});

describe('service worker — navegación con la red bloqueada', () => {
  beforeEach(() => { vi.useRealTimers(); });

  // Un bloqueo por IP —como los que se aplican en España sobre rangos de Cloudflare, donde vive este sitio— no
  // devuelve error: descarta los paquetes y la petición cuelga hasta que expira el TCP. Sin tope de espera, el
  // respaldo cacheado no llegaba a entrar y el usuario veía una pantalla en blanco durante minutos.
  it('sirve el shell cacheado en lugar de esperar indefinidamente a la red', async () => {
    const shell = html('<!DOCTYPE html><title>cacheado</title>');
    const sw = loadServiceWorker({
      shell,
      fetchImpl: () => new Promise<Response>(() => {}), // nunca resuelve ni rechaza: eso es un bloqueo
    });

    const response = await respondTo(sw, new Request('https://mygamelist.pages.dev/', { headers: { accept: 'text/html' } }));

    expect(await response.text()).toContain('cacheado');
  }, 10_000);

  it('sin shell cacheado espera a la red, porque abortar solo empeoraría el resultado', async () => {
    const sw = loadServiceWorker({
      shell: undefined,
      fetchImpl: async () => html('<!DOCTYPE html><title>de red</title>'),
    });

    const response = await respondTo(sw, new Request('https://mygamelist.pages.dev/', { headers: { accept: 'text/html' } }));

    expect(await response.text()).toContain('de red');
  });
});
