// LOS PRECIOS DE DESEADOS, EL HOOK (P3 del plan de la ficha y los precios): apagado no carga nada; encendido pinta lo
// guardado al momento y después pide con el plazo del rango, que si aún no se sabe no se pide.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWishlistPrices } from '../../src/viewmodel/prices/useWishlistPrices';
import { hasUnlimitedWishlist } from '../../src/core/constants/tiers';

const repo = vi.hoisted(() => ({
  readCachedPrices: vi.fn(async (): Promise<Record<string, unknown>> => ({})),
  loadWishlistPrices: vi.fn(async (): Promise<unknown> => ({ prices: {}, status: 'ok' })),
}));
vi.mock('../../src/model/repository/pricesRepository', () => repo);

const viejo = { titulo: 'Hades', marca: 'guardado' };
const nuevo = { titulo: 'Hades', marca: 'nuevo' };

describe('useWishlistPrices', () => {
  beforeEach(() => {
    repo.readCachedPrices.mockReset();
    repo.loadWishlistPrices.mockReset();
  });

  it('sin títulos (apagado o en otra pestaña) devuelve null y no carga nada', async () => {
    const { result } = renderHook(() => useWishlistPrices(null, 1000));
    await Promise.resolve();
    expect(result.current).toBeNull();
    expect(repo.readCachedPrices).not.toHaveBeenCalled();
  });

  it('pinta lo guardado y luego lo que llega, pidiendo con el plazo del rango', async () => {
    repo.readCachedPrices.mockResolvedValue({ Hades: viejo });
    let soltar: (valor: unknown) => void = () => {};
    repo.loadWishlistPrices.mockReturnValue(new Promise((resolve) => { soltar = resolve; }));
    const titulos = ['Hades'];
    const { result } = renderHook(() => useWishlistPrices(titulos, 1000));
    await waitFor(() => expect(result.current?.prices).toEqual({ Hades: viejo }));
    expect(repo.loadWishlistPrices).toHaveBeenCalledWith(['Hades'], 1000);
    soltar({ prices: { Hades: nuevo }, status: 'ok' });
    await waitFor(() => expect(result.current?.prices).toEqual({ Hades: nuevo }));
  });

  it('con el rango en vuelo, solo lo guardado', async () => {
    repo.readCachedPrices.mockResolvedValue({ Hades: viejo });
    const titulos = ['Hades'];
    const { result } = renderHook(() => useWishlistPrices(titulos, null));
    await waitFor(() => expect(result.current?.prices).toEqual({ Hades: viejo }));
    expect(repo.loadWishlistPrices).not.toHaveBeenCalled();
  });
});

describe('Deseados sin tope', () => {
  it('solo mithril', () => {
    expect(hasUnlimitedWishlist('mithril')).toBe(true);
    expect(['bronze', 'silver', 'gold'].map((tier) => hasUnlimitedWishlist(tier as 'bronze'))).toEqual([false, false, false]);
  });
});
