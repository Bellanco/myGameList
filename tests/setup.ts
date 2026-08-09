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

afterEach(() => {
  cleanup();
});
