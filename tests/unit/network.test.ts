// Clasificación de fallos de RED (core/utils/network).
//
// Lo que sostienen estos tests: los errores con los que cada capa cuenta lo MISMO —la capa HTTP de gists, Firebase
// y `fetch` a secas— se reconocen todos como falta de conexión, y un error de verdad (401, 404, un fallo de datos)
// NO se confunde con uno de red. De eso depende que el espacio social muestre el aviso de "sin conexión" en vez de
// dejar salir `network offline` o `Failed to fetch`, y que un 401 siga diciendo lo que dice.
import { afterEach, describe, expect, it } from 'vitest';
import { isNetworkFailure, isOffline } from '../../src/core/utils/network';
import { NetworkDeferredError } from '../../src/model/repository/githubHttp';

function setOnLine(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(navigator, 'onLine');
    return;
  }
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('isOffline', () => {
  afterEach(() => setOnLine(true));

  it('solo es cierto con un `navigator.onLine` explícitamente falso', () => {
    setOnLine(false);
    expect(isOffline()).toBe(true);
    setOnLine(true);
    expect(isOffline()).toBe(false);
  });
});

describe('isNetworkFailure', () => {
  it('reconoce los errores diferibles de la capa HTTP de gists', () => {
    expect(isNetworkFailure(new NetworkDeferredError('offline'))).toBe(true);
    expect(isNetworkFailure(new NetworkDeferredError('timeout'))).toBe(true);
    expect(isNetworkFailure(new NetworkDeferredError('network'))).toBe(true);
    // Cualquier error marcado como diferible, aunque no sea de esa clase (cruce de módulos, error serializado).
    expect(isNetworkFailure({ deferred: true, message: 'lo que sea' })).toBe(true);
  });

  it('reconoce los códigos de Firebase que significan «no se llegó al servidor»', () => {
    expect(isNetworkFailure({ code: 'auth/network-request-failed', message: 'Firebase: Error (auth/network-request-failed).' })).toBe(true);
    expect(isNetworkFailure({ code: 'unavailable', message: 'The operation could not be completed' })).toBe(true);
    expect(isNetworkFailure({ code: 'deadline-exceeded', message: 'deadline' })).toBe(true);
  });

  it('reconoce el fallo de `fetch` en cualquiera de sus redacciones y el chunk que no baja', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new TypeError('Load failed'))).toBe(true); // Safari
    expect(isNetworkFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkFailure(new Error('Failed to fetch dynamically imported module: /assets/SocialHub-abc.js'))).toBe(true);
  });

  it('reconoce la lectura de Firestore sin red y el timeout propio', () => {
    expect(isNetworkFailure(new Error('Failed to get document because the client is offline.'))).toBe(true);
    const aborted = new Error('abortada');
    aborted.name = 'AbortError';
    expect(isNetworkFailure(aborted)).toBe(true);
  });

  it('NO trata como falta de conexión lo que sí es una respuesta del servidor o un error de datos', () => {
    expect(isNetworkFailure(new Error('GitHub 401: Bad credentials'))).toBe(false);
    expect(isNetworkFailure(new Error('GitHub 404: Not Found'))).toBe(false);
    expect(isNetworkFailure({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(false);
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
  });
});
