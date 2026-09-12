import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAnnouncement } from '../../src/view/hooks/useAnnouncement';
import { ANNOUNCEMENT_SEEN_KEY } from '../../src/core/constants/storageKeys';
import { parseSeen, type Announcement } from '../../src/core/announcement/announcement';

// LO QUE SE PRUEBA ES LA CONVERSACIÓN ENTRE LAS TRES PIEZAS: el documento que llega, la política que decide y la
// cuenta que se guarda en el aparato. La política en sí ya está probada suelta en `tests/unit/announcement`.

const AVISO: Announcement = {
  id: 'av-1',
  kicker: 'Ya puedes votar',
  title: 'Vota los juegos del año',
  body: 'Hasta el domingo.',
  url: 'https://ejemplo.org/votar',
  icon: 'bell',
  active: true,
  repeats: 3,
  intervalHours: 24,
  updatedAt: 0,
};

const loadAnnouncement = vi.fn(async () => AVISO as Announcement | null);

vi.mock('../../src/model/repository/announcementRepository', () => ({
  loadAnnouncement: () => loadAnnouncement(),
  saveAnnouncement: vi.fn(),
}));

/** El camino entero: el turno de reposo, la lectura y la espera antes de aparecer. */
async function llegaLaCapsula(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(10);
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(3000);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  loadAnnouncement.mockClear();
  loadAnnouncement.mockResolvedValue(AVISO);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('el aviso del administrador en una apertura de la app', () => {
  /**
   * ⚑ EN MODO ESTRICTO, QUE ES COMO CORRE LA APP EN DESARROLLO. React monta, desmonta y vuelve a montar cada
   * efecto para cazar los que no saben limpiarse, y una guarda de «esto ya se ha pedido» dejaba el aviso sin
   * salir NUNCA: el primer montaje marcaba la guarda y se cancelaba al desmontar, y el segundo se la encontraba
   * puesta. Se vio abriendo la app, no en esta batería, así que este caso se queda escrito.
   */
  it('sale también con el doble montaje del modo estricto, y pide el documento una sola vez', async () => {
    const { result } = renderHook(() => useAnnouncement(), { wrapper: StrictMode });
    await llegaLaCapsula();

    expect(result.current.announcement?.id).toBe('av-1');
    expect(loadAnnouncement).toHaveBeenCalledTimes(1);
  });

  it('sale con retraso, no en el mismo fotograma que la app', async () => {
    const { result } = renderHook(() => useAnnouncement());

    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });
    expect(result.current.announcement, 'todavía no').toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(result.current.announcement?.id).toBe('av-1');
  });

  /** La cuenta la gasta el PINTADO, y por eso la apunta quien pinta: el hook solo la guarda cuando se lo dicen. */
  it('no apunta nada hasta que la cápsula dice que se ha pintado', async () => {
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();

    expect(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY)).toBeNull();

    act(() => { result.current.markShown(); });
    const seen = parseSeen(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY));
    expect(seen).toMatchObject({ id: 'av-1', shown: 1, clicked: false });
    expect(seen.lastAt).toBeGreaterThan(0);

    // Y dos veces seguidas no cuentan dos: la misma cápsula solo se ha visto una vez.
    act(() => { result.current.markShown(); });
    expect(parseSeen(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY)).shown).toBe(1);
  });

  /**
   * ⚑ CON LA PESTAÑA DE FONDO NO SE PINTA, Y NO GASTA. Es el caso que hace que un aviso «no salga nunca»: se abre
   * la app y se sigue con otra cosa, la cápsula se pinta contra un escritorio que nadie mira, se va sola a los
   * ocho segundos y ha gastado una de las tres veces. Al volver no queda nada.
   */
  it('espera a que se mire la pestaña antes de pintarse', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();

    expect(result.current.announcement, 'no se pinta contra una pestaña oculta').toBeNull();

    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(result.current.announcement?.id).toBe('av-1');
  });

  it('pulsar lo cierra y lo calla para siempre en este aparato', async () => {
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();

    act(() => { result.current.markShown(); });
    act(() => { result.current.markClicked(); });

    expect(result.current.announcement).toBeNull();
    expect(parseSeen(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY)).clicked).toBe(true);
  });

  it('no vuelve a salir si ya se dijo hace un rato', async () => {
    localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, JSON.stringify({
      id: 'av-1', shown: 1, lastAt: Date.now() - 3600_000, clicked: false,
    }));

    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();
    expect(result.current.announcement).toBeNull();
  });

  it('ni cuando ya se dijo las veces acordadas', async () => {
    localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, JSON.stringify({
      id: 'av-1', shown: 3, lastAt: 0, clicked: false,
    }));

    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();
    expect(result.current.announcement).toBeNull();
  });

  it('sin aviso publicado no pasa nada', async () => {
    loadAnnouncement.mockResolvedValue(null);
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();
    expect(result.current.announcement).toBeNull();
  });
});
