import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { GAME_SHEET_STATE, useGameSheetParam } from '../../src/viewmodel/gameSheet/useGameSheetParam';

// LA FICHA VIVE EN `?juego=` (F2): abrir hace push (para que «atrás» la cierre), pasar de una ficha a otra hace
// replace (F0.9) y cerrar vuelve atrás si la abrió la app o quita el parámetro si se llegó con la URL puesta.

function montar(entrada: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[entrada]}>{children}</MemoryRouter>;
  return renderHook(() => ({ param: useGameSheetParam(), location: useLocation() }), { wrapper });
}

describe('useGameSheetParam', () => {
  it('abrir pone la clave en la URL, conserva lo que había y marca la entrada', () => {
    const { result } = montar('/completados?q=hol');
    act(() => result.current.param.openSheet('Hollow Knight'));
    expect(result.current.location.pathname).toBe('/completados');
    expect(new URLSearchParams(result.current.location.search).get('q')).toBe('hol');
    expect(result.current.param.slug).toBe('hollow-knight');
    expect((result.current.location.state as Record<string, unknown>)[GAME_SHEET_STATE]).toBe(true);
  });

  it('cerrar vuelve atrás, a la lista de la que se vino', () => {
    const { result } = montar('/completados');
    act(() => result.current.param.openSheet('Hades'));
    act(() => result.current.param.closeSheet());
    expect(result.current.location.search).toBe('');
    expect(result.current.param.slug).toBe('');
  });

  it('pasar de una ficha a otra no suma pasos: cerrar vuelve a la lista, no a la ficha anterior', () => {
    const { result } = montar('/completados');
    act(() => result.current.param.openSheet('Hollow Knight'));
    act(() => result.current.param.openSheet('Hollow Knight: Silksong'));
    expect(result.current.param.slug).toBe('hollow-knight-silksong');
    act(() => result.current.param.closeSheet());
    expect(result.current.location.search).toBe('');
  });

  it('con la URL ya puesta (un enlace, una recarga), cerrar quita el parámetro sin crear otra entrada', () => {
    const { result } = montar('/deseados?juego=hades-2');
    expect(result.current.param.slug).toBe('hades-2');
    act(() => result.current.param.closeSheet());
    expect(result.current.location.pathname).toBe('/deseados');
    expect(result.current.location.search).toBe('');
  });

  it('abrir la misma ficha que ya está abierta no navega', () => {
    const { result } = montar('/completados');
    act(() => result.current.param.openSheet('Hades'));
    const clave = result.current.location.key;
    act(() => result.current.param.openSheet('Hades'));
    expect(result.current.location.key).toBe(clave);
  });
});
