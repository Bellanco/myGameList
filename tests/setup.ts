// Setup global para tests de componente (React Testing Library + jsdom).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
