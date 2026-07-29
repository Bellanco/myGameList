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

afterEach(() => {
  cleanup();
});
