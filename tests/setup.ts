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

afterEach(() => {
  cleanup();
});
