import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAnnouncement } from '../../src/view/hooks/useAnnouncement';
import { ANNOUNCEMENT_SEEN_KEY } from '../../src/core/constants/storageKeys';
import {
  ANNOUNCEMENT_CHANNEL,
  ANNOUNCEMENT_PUBLISHED_EVENT,
  parseSeen,
  type Announcement,
} from '../../src/core/announcement/announcement';

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

  /**
   * ⚑ AL VOLVER A LA APP SE VUELVE A MIRAR. Sin esto, una pestaña abierta desde ayer —o la PWA del móvil, que no
   * se cierra nunca del todo— no se enteraba de un aviso publicado después: había que recargar a mano. Se vio
   * publicando desde el panel y volviendo a las listas sin que saliera nada.
   */
  it('se entera de un aviso publicado después, sin recargar', async () => {
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();

    act(() => { result.current.markShown(); });
    act(() => { result.current.dismiss(); });

    // Se publica otra campaña mientras la app sigue abierta y se vuelve a ella pasado el rato.
    loadAnnouncement.mockResolvedValue({ ...AVISO, id: 'av-2', title: 'Otra cosa' });
    vi.advanceTimersByTime(6 * 60_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    // La cápsula sale SIN el retraso de la apertura: la app ya estaba en pie. El turno de reloj va en su propio
    // `act` porque el `setTimeout` lo programa la promesa de la consulta, que se resuelve en el anterior.
    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(result.current.announcement?.id).toBe('av-2');
  });

  /**
   * Y AL PUBLICARLO DESDE EL PANEL sale enseguida, sin recargar ni cambiar de pestaña: es la misma pestaña, y
   * ese es el gesto de quien acaba de escribirlo —publicar y mirar si sale—.
   */
  it('sale al publicarlo desde el panel, en la misma pestaña', async () => {
    loadAnnouncement.mockResolvedValue(null);
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();
    expect(result.current.announcement).toBeNull();

    loadAnnouncement.mockResolvedValue(AVISO);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_PUBLISHED_EVENT));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(result.current.announcement?.id).toBe('av-1');
  });

  /**
   * Y DESDE OTRA PESTAÑA, que es como se prueba esto de verdad: se publica en una y se mira en la otra. El
   * evento de `window` no sale de su pestaña, así que la segunda se quedaba esperando una recarga —comprobado en
   * Firefox con dos pestañas—; el canal lo reparte a todas.
   */
  it('se entera de lo publicado en otra pestaña', async () => {
    if (typeof BroadcastChannel !== 'function') return;
    loadAnnouncement.mockResolvedValue(null);
    const { result } = renderHook(() => useAnnouncement());
    await llegaLaCapsula();
    expect(result.current.announcement).toBeNull();

    loadAnnouncement.mockResolvedValue(AVISO);
    const otraPestaña = new BroadcastChannel(ANNOUNCEMENT_CHANNEL);
    await act(async () => {
      otraPestaña.postMessage('av-1');
      await new Promise((listo) => { setTimeout(listo, 0); vi.advanceTimersByTime(1); });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    otraPestaña.close();

    expect(result.current.announcement?.id).toBe('av-1');
  });

  /** Y no se pone a preguntar cada vez que se cambia de pestaña: hay un rato mínimo entre consultas. */
  it('no vuelve a preguntar al volver si acaba de hacerlo', async () => {
    renderHook(() => useAnnouncement());
    await llegaLaCapsula();
    expect(loadAnnouncement).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(loadAnnouncement).toHaveBeenCalledTimes(1);
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
