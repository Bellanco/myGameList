// La TEMPORADA del resumen del año y lo que pasa en ella: la tarjeta del feed (`core/social/yearSummaryFeed`), la
// señal que se publica al abrir tu resumen (`useYearSummarySignal`) y el aviso propio del 15 (`useYearSummaryNotice`).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { yearSummaryFeedEntries, YEAR_SUMMARY_FEED_DAYS } from '../../src/core/social/yearSummaryFeed';
import { YEAR_SUMMARY_TOLD_KEY, yearSummaryPublishedKey } from '../../src/core/constants/storageKeys';
import type { GameItem } from '../../src/model/types/game';

const publish = vi.fn(async () => {});
vi.mock('../../src/model/repository/firebaseRepository', () => ({ publishYearSummarySeen: (...args: unknown[]) => publish(...args) }));

const { useYearSummarySignal } = await import('../../src/viewmodel/social/useYearSummarySignal');
const { useYearSummaryNotice } = await import('../../src/view/hooks/useYearSummaryNotice');

const DAY = 24 * 60 * 60 * 1000;
const game = (years: number[]): GameItem => ({ id: 1, _ts: 1, name: 'Halo', platforms: [], genres: [], steamDeck: false, review: '', years });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  publish.mockClear();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('la tarjeta del feed', () => {
  const now = new Date(2026, 11, 20).getTime();
  const source = (at: number, extra = {}) => ({ id: 'ada', displayName: 'Ada', seen: { year: 2026, at }, own: false, ...extra });

  it('sale en su fecha y se queda 30 días', () => {
    expect(yearSummaryFeedEntries([source(now - DAY)], now)).toEqual([
      { key: 'ada:year-summary:2026', profileId: 'ada', displayName: 'Ada', photoURL: '', year: 2026, updatedAt: now - DAY, own: false },
    ]);
    expect(yearSummaryFeedEntries([source(now - (YEAR_SUMMARY_FEED_DAYS + 1) * DAY)], now)).toEqual([]);
  });

  it('sin aviso, o con uno roto o del futuro, no hay tarjeta', () => {
    expect(yearSummaryFeedEntries([{ id: 'ada', seen: null, own: false }], now)).toEqual([]);
    expect(yearSummaryFeedEntries([source(now + DAY)], now)).toEqual([]);
    expect(yearSummaryFeedEntries([source(0)], now)).toEqual([]);
  });
});

describe('la señal al abrir tu resumen', () => {
  const props = { uid: 'uid-a', published: true, alreadySeenYear: null as number | null };

  it('en temporada, publica el año una sola vez', async () => {
    vi.setSystemTime(new Date(2026, 11, 16));
    const { result } = renderHook(() => useYearSummarySignal(props));
    await act(async () => result.current(2026));
    expect(publish).toHaveBeenCalledWith('uid-a', 2026);
    expect(localStorage.getItem(yearSummaryPublishedKey('uid-a'))).toBe('2026');
    await act(async () => result.current(2026));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('fuera de temporada, o con el resumen de otro año, no publica', async () => {
    vi.setSystemTime(new Date(2026, 9, 1));
    const { result } = renderHook(() => useYearSummarySignal(props));
    await act(async () => result.current(2025));
    vi.setSystemTime(new Date(2026, 11, 16));
    await act(async () => result.current(2025));
    expect(publish).not.toHaveBeenCalled();
  });

  it('sin perfil publicado, o con el año ya en el directorio, tampoco', async () => {
    vi.setSystemTime(new Date(2026, 11, 16));
    const sinPerfil = renderHook(() => useYearSummarySignal({ ...props, published: false }));
    await act(async () => sinPerfil.result.current(2026));
    const yaVisto = renderHook(() => useYearSummarySignal({ ...props, alreadySeenYear: 2026 }));
    await act(async () => yaVisto.result.current(2026));
    expect(publish).not.toHaveBeenCalled();
  });

  it('si la escritura falla, no lo da por publicado y lo reintenta', async () => {
    vi.setSystemTime(new Date(2026, 11, 16));
    publish.mockRejectedValueOnce(new Error('sin red'));
    const { result } = renderHook(() => useYearSummarySignal(props));
    await act(async () => result.current(2026));
    expect(localStorage.getItem(yearSummaryPublishedKey('uid-a'))).toBeNull();
    await act(async () => result.current(2026));
    expect(publish).toHaveBeenCalledTimes(2);
  });
});

describe('el aviso del 15', () => {
  it('en temporada, con perfil y algo completado ese año, una vez', () => {
    vi.setSystemTime(new Date(2026, 11, 15));
    const { result } = renderHook(() => useYearSummaryNotice(true, [game([2026])]));
    expect(result.current.year).toBe(2026);
    act(() => result.current.dismiss());
    expect(result.current.year).toBeNull();
    expect(localStorage.getItem(YEAR_SUMMARY_TOLD_KEY)).toBe('2026');
    // Otra visita el mismo año: ya dicho.
    expect(renderHook(() => useYearSummaryNotice(true, [game([2026])])).result.current.year).toBeNull();
  });

  it('no sale antes del 15, sin perfil social ni sin nada completado ese año', () => {
    vi.setSystemTime(new Date(2026, 11, 14));
    expect(renderHook(() => useYearSummaryNotice(true, [game([2026])])).result.current.year).toBeNull();
    vi.setSystemTime(new Date(2026, 11, 20));
    expect(renderHook(() => useYearSummaryNotice(false, [game([2026])])).result.current.year).toBeNull();
    expect(renderHook(() => useYearSummaryNotice(true, [game([2025])])).result.current.year).toBeNull();
  });
});
