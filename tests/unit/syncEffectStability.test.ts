import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabData } from '../../src/model/types/game';

/**
 * Regresión: LOS EFECTOS DEL CICLO DE SYNC NO PUEDEN COLGAR DE LA IDENTIDAD DE SUS CALLBACKS.
 *
 * `App.tsx` montaba el hook con tres funciones escritas en línea (`getData: () => dataRef.current`, …), nuevas en
 * cada render. De ellas cuelga toda la cadena interna (`applyRemoteCycle` → `refreshRemote` → `initializeSync` →
 * `startPolling`), así que los cinco efectos se desmontaban y volvían a montar con CADA render de una pantalla
 * que re-renderiza con cada tecla del buscador. Tres consecuencias, y las tres se fijan aquí:
 *
 *   1. el `setInterval` del sondeo se mataba y se recreaba, sin llegar nunca a sus 60 s;
 *   2. el efecto de arranque corría en cada render, de modo que los ciclos periódicos ocurrían POR RENDER
 *      (acotados solo por el throttle de 45 s) en vez de por el temporizador;
 *   3. y el `setTimeout` del reintento tras un error, que vive en uno de esos efectos, se cancelaba con su
 *      limpieza: el sync se quedaba en `error_backoff` hasta que algo externo lo despertara.
 *
 * El cuarto bloque cubre el cambio hermano (S3): volver a la pestaña ya no se salta el throttle de lectura.
 */

const { readGist, writeGist } = vi.hoisted(() => ({
  readGist: vi.fn(async () => ({ notModified: true }) as { notModified: boolean }),
  writeGist: vi.fn(async () => ({ etag: 'etag-written', updatedAt: 5_000 })),
}));

const SYNC_CONFIG = {
  token: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaa',
  gistId: 'abcdef1234567890',
  etag: 'W/"etag-local"',
  lastRemoteUpdatedAt: 0,
};

vi.mock('../../src/model/repository/gistRepository', () => ({
  readGist,
  writeGist,
  getSyncConfig: () => SYNC_CONFIG,
  saveSyncConfig: vi.fn(),
  clearSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  createGist: vi.fn(),
  findGamesGistId: vi.fn(async () => ''),
  whoAmI: vi.fn(async () => {}),
  getRetryAfterMs: () => 0,
  isDeferredNetworkError: () => false,
}));

// Dependencias importadas por el hook pero ajenas a lo que se ejercita aquí.
vi.mock('../../src/model/repository/firebaseGateway', () => ({
  getCurrentSocialAuthUser: vi.fn(),
  getPrivateConfig: vi.fn(),
  recoverGithubToken: vi.fn(),
  resolveOwnProfile: vi.fn(),
  resolveStableProfileId: vi.fn(),
  setAnalyticsUser: vi.fn(),
  setPrivateConfig: vi.fn(),
  signInWithGoogle: vi.fn(),
  trackAnalyticsEvent: vi.fn(),
}));
vi.mock('../../src/model/migration/legacyTokenRecovery', () => ({
  readLegacyPlaintextToken: vi.fn(() => null),
}));

import { useSyncViewModel } from '../../src/viewmodel/useSyncViewModel';
import { clearDirty } from '../../src/model/repository/syncStateRepository';
import { resetSyncState } from '../../src/model/repository/syncMachineRepository';

function emptyTabData(): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1_000 };
}

/**
 * Monta el hook con callbacks NUEVOS en cada render, que es justo lo que hacía `App.tsx`. Los tests de aquí
 * comprueban que el hook aguanta ese maltrato: si algún día alguien vuelve a escribirlos en línea, lo que puede
 * pasar es que sobren renders, no que se caiga el ciclo de sincronización.
 */
function mountWithUnstableDeps() {
  const local = { data: emptyTabData(), meta: { updatedAt: 0, etag: null as string | null, lastRemoteUpdatedAt: 0 } };
  return renderHook(() =>
    useSyncViewModel({
      getData: () => local.data,
      getMeta: () => local.meta,
      setData: (next: TabData) => {
        local.data = next;
      },
      setMeta: (m) => {
        local.meta = m;
      },
      onNotice: () => {},
      persist: (next: TabData) => {
        local.data = next;
      },
    }),
  );
}

/** Cuenta cuántas veces se suscribe cada escucha de ventana, para detectar el churn de efectos. */
function spyOnWindowListeners() {
  const doc = vi.spyOn(document, 'addEventListener');
  const win = vi.spyOn(window, 'addEventListener');
  return () =>
    doc.mock.calls.filter((call) => call[0] === 'visibilitychange').length +
    win.mock.calls.filter((call) => call[0] === 'focus' || call[0] === 'online').length;
}

beforeEach(() => {
  localStorage.clear();
  clearDirty();
  resetSyncState();
  readGist.mockClear();
  writeGist.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  resetSyncState();
});

describe('estabilidad de los efectos del ciclo de sync', () => {
  it('no vuelve a suscribir las escuchas de ventana al re-renderizar', async () => {
    const contar = spyOnWindowListeners();
    const { rerender } = mountWithUnstableDeps();
    await act(async () => {});
    const trasMontar = contar();

    await act(async () => {
      rerender();
      rerender();
      rerender();
    });

    expect(contar()).toBe(trasMontar);
  });

  it('un render no arranca un ciclo de sync, aunque haya vencido el throttle de lectura', async () => {
    const { rerender } = mountWithUnstableDeps();
    await waitFor(() => expect(readGist).toHaveBeenCalledTimes(1)); // el del arranque

    // Más allá del MIN_READ_INTERVAL_MS (45 s): antes, cualquier render de aquí en adelante leía el gist.
    const ahora = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => ahora + 120_000);

    await act(async () => {
      rerender();
      rerender();
    });

    expect(readGist).toHaveBeenCalledTimes(1);
  });

  it('mantiene un único temporizador de sondeo entre renders', async () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');
    // Solo los del SONDEO (60 s): `waitFor` y compañía arman intervalos propios, y contarlos todos haría
    // que este test hablara de testing-library en vez de del hook.
    const sondeos = () => setInterval.mock.calls.filter((call) => call[1] === 60_000);
    const idsDeSondeo = () =>
      new Set(setInterval.mock.results.filter((_, index) => setInterval.mock.calls[index][1] === 60_000).map((r) => r.value));

    const { result, rerender } = mountWithUnstableDeps();
    // El sondeo solo arranca con un gist conectado, que es lo que deja el ciclo de arranque.
    await waitFor(() => expect(result.current.connectedGistId).toBe(SYNC_CONFIG.gistId));
    expect(sondeos()).toHaveLength(1);

    await act(async () => {
      rerender();
      rerender();
      rerender();
    });

    // Ni un intervalo de sondeo más, ni la cancelación del que ya había: antes se mataba y se recreaba en cada
    // render, así que sus 60 s no se cumplían nunca.
    expect(sondeos()).toHaveLength(1);
    const cancelados = clearInterval.mock.calls.filter((call) => idsDeSondeo().has(call[0]));
    expect(cancelados).toHaveLength(0);
  });

  /**
   * Este NO es un test de regresión: con el código anterior también se acababa leyendo pasado el minuto, solo
   * que por la vía equivocada —el efecto de montaje, que corría en cada render—. Está aquí para fijar el
   * comportamiento que ahora sostiene el temporizador, ya que es lo que queda cuando esa vía desaparece.
   */
  it('el sondeo periódico lee pasado el minuto, con renders por el medio', async () => {
    vi.useFakeTimers();
    const { result, rerender } = mountWithUnstableDeps();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.connectedGistId).toBe(SYNC_CONFIG.gistId);
    expect(readGist).toHaveBeenCalledTimes(1); // el del arranque

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      rerender(); // como teclear en el buscador
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(readGist).toHaveBeenCalledTimes(2);
  });

  it('el reintento programado tras un error sobrevive a los renders', async () => {
    vi.useFakeTimers();
    readGist.mockRejectedValueOnce(new Error('Read failed: 500'));

    const { rerender } = mountWithUnstableDeps();
    // Deja correr el ciclo de arranque hasta que falla y la máquina programa el reintento.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(readGist).toHaveBeenCalledTimes(1);

    // Renders ANTES de que venza el backoff: aquí es donde se perdía el temporizador.
    await act(async () => {
      rerender();
      rerender();
    });

    // getBackoffMs(1) ≈ 2.000-2.600 ms; con margen de sobra.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(readGist.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('volver a la app no se salta el throttle de lectura (S3)', () => {
  it('ignora focus y visibilitychange dentro del mínimo entre lecturas', async () => {
    mountWithUnstableDeps();
    await waitFor(() => expect(readGist).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });

    // Antes eran tres lecturas más: los dos handlers forzaban, y `force` se salta `canReadNow`.
    expect(readGist).toHaveBeenCalledTimes(1);
  });

  it('vuelve a leer cuando el mínimo ya ha pasado', async () => {
    mountWithUnstableDeps();
    await waitFor(() => expect(readGist).toHaveBeenCalledTimes(1));

    const ahora = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => ahora + 60_000);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(readGist).toHaveBeenCalledTimes(2));
  });

  it('el botón de sincronizar sigue leyendo aunque el throttle esté vigente', async () => {
    const { result } = mountWithUnstableDeps();
    await waitFor(() => expect(readGist).toHaveBeenCalledTimes(1));

    // Gesto explícito del usuario: nunca pasa por `canReadNow`, solo por el candado.
    await act(async () => {
      await result.current.syncNow();
    });

    expect(readGist).toHaveBeenCalledTimes(2);
  });
});
