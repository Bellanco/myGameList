// Setup global para tests de componente (React Testing Library + jsdom).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

// jsdom no implementa HTMLDialogElement.showModal()/close() (A11y-1). Polyfill mínimo que refleja el atributo
// `open` para que la lógica de `useNativeDialog` (showModal/close + evento `cancel`) se ejercite en los tests.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}

// jsdom tampoco implementa IntersectionObserver, que usan los centinelas de scroll infinito (lista de reseñas
// del perfil, feed). Sin él, cualquier vista con más elementos que el lote inicial revienta al montar y el error
// boundary del hub se come el render, que se confunde fácilmente con un fallo de la vista. Stub inerte: no
// dispara callbacks, así que la paginación se queda en el primer lote (que es lo que interesa comprobar).
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = '';
    readonly scrollMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// jsdom responde `matches: false` a todo, así que los componentes que consultan `prefers-reduced-motion` se
// comportan como si el usuario quisiera animación: el panel de estadísticas contaría sus cifras desde cero con
// `requestAnimationFrame` y una aserción síncrona leería un valor intermedio. Se fuerza la preferencia de MENOS
// movimiento, que es la variante determinista: los componentes pintan su estado final desde el primer render.
const realMatchMedia = window.matchMedia?.bind(window);
window.matchMedia = ((query: string) => {
  const matches = query.includes('prefers-reduced-motion');
  const list = realMatchMedia?.(query);
  return list ? Object.create(list, { matches: { value: matches } }) : {
    matches,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  };
}) as typeof window.matchMedia;

/**
 * LAS TRAZAS DE DIAGNÓSTICO NO SALEN EN LOS TESTS, y no es por limpieza de la salida: es lo que quita una carrera
 * que rompía la suite entera de vez en cuando.
 *
 * La app deja trazas de sus pasadas asíncronas —la reconciliación del hub en cada visita, el índice que le falta
 * a Firestore, la copia de localStorage que no cupo—. Cuando el trabajo que las emite termina justo mientras
 * vitest cierra el worker del fichero, el mensaje llega tarde y la ejecución muere con un error que no es de
 * ningún test: «EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending». La suite quedaba en
 * verde y el proceso salía con error igualmente, así que el `pre-push` cortaba el envío sin nada que arreglar.
 *
 * Se descartan ANTES de llegar al reporter —ahí es donde se abre el canal— y solo las que llevan uno de los
 * prefijos de la app. Cualquier otro mensaje sigue saliendo, y un test que quiera comprobar una traza puede
 * seguir espiando `console` como siempre: su espía sustituye a esto.
 */
const PREFIJOS_DE_TRAZA = [
  '[App]', '[IndexedDB]', '[SocialHub]', '[admin]', '[cuenta]', '[cutover]',
  '[dev]', '[firebase]', '[gist]', '[saneado]', '[social]', '[sync]', '[estado local]',
];
for (const nivel of ['log', 'info', 'warn'] as const) {
  const original = console[nivel].bind(console);
  console[nivel] = (...args: unknown[]): void => {
    const primero = args[0];
    if (typeof primero === 'string' && PREFIJOS_DE_TRAZA.some((prefijo) => primero.startsWith(prefijo))) return;
    original(...args);
  };
}

afterEach(() => {
  cleanup();
});

/**
 * NINGÚN TEST HABLA CON UN SERVIDOR DE VERDAD, y ahora se cumple en vez de confiarse.
 *
 * El motivo no es teórico. Al montar el emulador del espacio social (`npm run emulate:social`) sin aislar la
 * configuración de logros, el hub habló con el Firestore de PRODUCCIÓN —`mylists-f7313`— e intentó un `Commit`
 * sobre `appConfig/achievements`. Falló con `permission-denied` porque un test no tiene sesión, pero el intento
 * salió del portátil: la app usa un respaldo con el proyecto real incrustado (ver `firebaseClient`), así que
 * cualquier camino que no esté mockeado apunta a producción. Que la suite actual no lo provoque es cuestión de
 * los datos que usa, no de que algo lo impida.
 *
 * Lo que hace: cualquier `fetch` a un host que no sea local rompe el test EN EL SITIO, con el host y el remedio
 * en el mensaje. Un test que necesite ejercitar la red mockea `fetch` por su cuenta y sustituye a esto, que es lo
 * que ya hacen los que lo necesitan.
 */
/** Intentos de salida a la red del test en curso. Los vacía y los revisa el `afterEach` de abajo. */
const violacionesDeRed: string[] = [];

const fetchReal = globalThis.fetch;
if (typeof fetchReal === 'function') {
  const ES_LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;
  /**
   * Hosts que NO cuentan como salir a la red, y hay que distinguirlos o el guard no vale nada.
   *
   * Los fixtures usan URLs inventadas —`https://f/me.png`, `https://x/foto.png`— para probar el camino de la
   * foto de perfil. No resuelven en ninguna parte y nunca fueron tráfico: marcarlas ponía 95 tests en rojo por
   * ruido y escondía los cuatro intentos que sí importan. Un host SIN PUNTO no existe fuera de una red local, y
   * los dominios de `example.*` están reservados por la RFC 2606 justo para esto.
   */
  const ES_FICTICIO = (host: string) => !host.includes('.')
    || /(^|\.)(example\.(com|net|org)|test|invalid|localhost)$/i.test(host);
  globalThis.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada?.url || '';
    // Las relativas no salen a ningún sitio en jsdom; las locales son emuladores y servidores de pruebas.
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
    const esExterna = /^[a-z]+:\/\//i.test(url) && !ES_LOCAL.test(url) && Boolean(host) && !ES_FICTICIO(host);
    if (esExterna) {
      // Se APUNTA además de lanzar. Lanzar solo no basta: el SDK de Firebase captura la excepción, la registra
      // como «RPC_ERROR HTTP error has no status» y sigue, así que el test pasaba y el intento quedaba escondido
      // entre el ruido. Con el registro, `afterEach` puede suspender el test que lo provocó.
      violacionesDeRed.push(`${host} (${url.slice(0, 120)})`);
      throw new Error(
        `Un test ha intentado salir a la red: ${host}. Los tests no hablan con servidores reales —y menos con el ` +
        'proyecto de Firebase de producción, al que apunta el respaldo del cliente. Mockea el repositorio que hace ' +
        `esa llamada (o el hook que lo usa) en este fichero. URL completa: ${url}`,
      );
    }
    return fetchReal(entrada as RequestInfo, init);
  }) as typeof globalThis.fetch;
}

/**
 * RESUMEN AL FINAL DE LA EJECUCIÓN, y no un fallo por test. Es una decisión, no una rendición.
 *
 * Suspender el test que lo provoca sería lo ideal, pero hoy pondría 78 tests en rojo repartidos por cuatro
 * ficheros: tres no mockean `achievementsConfigRepository` —por donde pasan `useAchievementsConfig`,
 * `useOpenFrontier` y la caché— y uno lee de verdad el avatar de Google. Ninguno de esos fallos sería un fallo de
 * la aplicación, y arreglarlos es una tarea aparte de la release que los destapó.
 *
 * Lo que NO se puede volver a perder es la señal: el intento se registra con su fichero y su host, y se imprime
 * al acabar. Lanzar a secas no bastaba —el SDK de Firebase captura la excepción, la registra como
 * «RPC_ERROR HTTP error has no status» y sigue—, así que la suite pasaba y el aviso se ahogaba en el ruido.
 *
 * Para pasar a bloquear: mockea los cuatro ficheros que salen en el resumen y cambia esto por un `throw` en un
 * `afterEach`.
 */
const destinosPorFichero = new Map<string, Set<string>>();

/** Tipo mínimo de `process.stderr`: el proyecto NO lleva `@types/node` a propósito (cambiaría los tipos globales
 *  de todo el repositorio), así que se declara lo justo aquí, como se hace con `HTMLRewriter` en `functions/`. */
declare const process: { stderr: { write(texto: string): void } };

afterEach((contexto) => {
  if (violacionesDeRed.length === 0) {
    return;
  }
  const fichero = contexto?.task?.file?.name || 'fichero desconocido';
  const destinos = destinosPorFichero.get(fichero) || new Set<string>();
  violacionesDeRed.forEach((destino) => destinos.add(destino.replace(/ \(.*$/, '')));
  destinosPorFichero.set(fichero, destinos);
  violacionesDeRed.length = 0;
});

afterAll(() => {
  if (destinosPorFichero.size === 0) {
    return;
  }
  const lineas = [...destinosPorFichero.entries()]
    .map(([fichero, destinos]) => `  · ${fichero} → ${[...destinos].join(', ')}`)
    .join('\n');
  // `process.stderr` y no `console.warn`: el reporter por defecto de vitest se guarda la consola de los ficheros
  // que PASAN, que es justo el caso de todos estos. Escrito así, el aviso se ve siempre.
  process.stderr.write(
    '\n[red] INTENTOS DE SALIDA A LA RED BLOQUEADOS.\n'
    + 'Ninguno llegó a salir, pero mientras estén ahí la suite depende de que el guard los pare.\n'
    + lineas + '\n'
    + 'Remedio: mockea el repositorio que hace la llamada. Para la configuración de logros, que no pasa por la\n'
    + "fachada de Firebase, el sitio es `vi.mock('.../model/repository/achievementsConfigRepository', …)`.\n",
  );
});
