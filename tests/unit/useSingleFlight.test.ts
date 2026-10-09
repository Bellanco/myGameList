// Una sola ejecución en vuelo: el doble clic no lanza la acción dos veces (ver `useSingleFlight`).
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSingleFlight } from '../../src/viewmodel/useSingleFlight';

describe('useSingleFlight', () => {
  it('mientras una llamada está en vuelo, las siguientes se ignoran', async () => {
    let terminar = () => {};
    const accion = vi.fn(() => new Promise<void>((resolve) => { terminar = resolve; }));
    const { result } = renderHook(() => useSingleFlight(accion));

    const primera = result.current();
    void result.current();
    void result.current();
    expect(accion).toHaveBeenCalledTimes(1);

    terminar();
    await primera;
    // Terminada la primera, la siguiente sí entra.
    const segunda = result.current();
    terminar();
    await segunda;
    expect(accion).toHaveBeenCalledTimes(2);
  });

  it('si la acción falla, el cerrojo se abre igualmente', async () => {
    const accion = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSingleFlight(accion));

    await expect(result.current()).rejects.toThrow('red');
    await result.current();
    expect(accion).toHaveBeenCalledTimes(2);
  });
});
