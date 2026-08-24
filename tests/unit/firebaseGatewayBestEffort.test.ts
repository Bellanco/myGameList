// La frontera perezosa hacia Firebase cuando el chunk NO se puede cargar (sin red, o un despliegue que rotó los
// hashes con la pestaña abierta). El reparto es el que fija este archivo: la telemetría —que se invoca con `void`
// y no tiene a nadie detrás— se traga el fallo, y los caminos que el llamante espera y maneja lo propagan.
//
// Regresión de CI: `void trackAnalyticsEvent(...)` en el view-model dejaba la carga del SDK en vuelo al terminar
// el test; cuando el entorno ya estaba desmontado, ese import rechazaba y los rechazos sin gestionar tumbaban la
// suite (exit 1) con los 1267 tests en verde. En producción la misma grieta se realimentaba: el rechazo llegaba
// al gancho `unhandledrejection` de `main.tsx`, que responde con `reportHandledError`... y vuelta a empezar.
import { describe, expect, it, vi } from 'vitest';

// El chunk que no baja: el factory lanza, así que la importación del módulo rechaza igual que un `import()` cuyo
// fichero ya no está en el servidor. El contador vive en `vi.hoisted` porque el mock se iza por encima del módulo.
const carga = vi.hoisted(() => ({ intentos: 0 }));
vi.mock('../../src/model/repository/firebaseRepository', () => {
  carga.intentos += 1;
  throw new Error('Failed to fetch dynamically imported module');
});

const gateway = await import('../../src/model/repository/firebaseGateway');

describe('frontera perezosa de Firebase con el chunk caído', () => {
  it('la telemetría no propaga el fallo de carga', async () => {
    // Se resuelven, no rechazan: es lo que evita el `unhandledrejection` en el `void` del llamante.
    await expect(gateway.trackAnalyticsEvent('game_saved', { tab: 'c' })).resolves.toBeUndefined();
    await expect(gateway.reportHandledError(new Error('x'), false, 'test')).resolves.toBeUndefined();
    await expect(gateway.setAnalyticsUser('uid-1')).resolves.toBeUndefined();
    await expect(gateway.clearAnalyticsUser()).resolves.toBeUndefined();
    await expect(gateway.enableAnalyticsAfterConsent()).resolves.toBeUndefined();
  });

  it('un fallo de carga no se queda cacheado: se reintenta', async () => {
    const antes = carga.intentos;
    await gateway.trackAnalyticsEvent('game_moved', { from: 'p', to: 'e' });
    // Si el rechazo se cachease, este segundo intento no volvería a pedir el módulo y Firebase quedaría muerto
    // para el resto de la sesión aunque la conexión volviese.
    expect(carga.intentos).toBeGreaterThan(antes);
  });

  it('los caminos que el llamante maneja SÍ propagan el fallo', async () => {
    // La otra mitad del contrato: al silenciar la telemetría no se ha silenciado lo que la app necesita saber.
    // Se afirma el rechazo y no su mensaje, porque Vitest sustituye el error de un factory por un aviso propio.
    await expect(gateway.getPrivateConfig('uid-1')).rejects.toThrow();
    await expect(gateway.signInWithGoogle()).rejects.toThrow();
  });

  it('la suscripción de auth avisa con null en vez de romper', async () => {
    const visto: unknown[] = [];
    const teardown = gateway.subscribeSocialAuth((user) => visto.push(user));
    await vi.waitFor(() => expect(visto).toEqual([null]));
    expect(() => teardown()).not.toThrow();
  });
});
