import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useReturnTo } from '../../src/view/hooks/useReturnTo';

// El fallo que fija este test: Integraciones se abre desde ajustes Y desde el estado vacío de un listado, y su
// "Volver" estaba cableado a `/ajustes`, así que quien entraba desde un listado acababa en otra pantalla. El
// origen viaja en el `state` del historial; aquí se comprueba que se lee, se propaga y —sobre todo— se valida.

function wrapper(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries']) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

function renderReturnTo(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries']) {
  return renderHook(() => ({ flow: useReturnTo('/ajustes'), location: useLocation() }), {
    wrapper: wrapper(initialEntries),
  });
}

describe('useReturnTo', () => {
  it('sin origen vuelve al fallback', () => {
    const { result } = renderReturnTo(['/integraciones']);
    expect(result.current.flow.returnTo).toBe('/ajustes');
  });

  it('vuelve al origen que dejó quien abrió la pantalla', () => {
    const { result } = renderReturnTo([{ pathname: '/integraciones', state: { from: '/proximos' } }]);
    expect(result.current.flow.returnTo).toBe('/proximos');
  });

  it('descarta un origen que no es una ruta de la app', () => {
    // `state` viene del historial del navegador: puede estar manipulado o ser de una versión anterior con
    // rutas que ya no existen. Un origen así rebotaría al fallback global, así que no se acepta.
    const { result } = renderReturnTo([{ pathname: '/integraciones', state: { from: '/una-ruta-que-no-existe' } }]);
    expect(result.current.flow.returnTo).toBe('/ajustes');
  });

  it('descarta un origen que es la propia pantalla', () => {
    const { result } = renderReturnTo([{ pathname: '/integraciones', state: { from: '/integraciones' } }]);
    expect(result.current.flow.returnTo).toBe('/ajustes');
  });

  it('navigateFromHere recuerda la pantalla actual como origen', () => {
    const { result } = renderReturnTo(['/proximos']);
    act(() => result.current.flow.navigateFromHere('/integraciones'));

    expect(result.current.location.pathname).toBe('/integraciones');
    expect(result.current.flow.returnTo).toBe('/proximos');
  });

  it('navigateKeepingOrigin conserva el origen al saltar dentro del flujo', () => {
    // Integraciones → bandeja → volver a integraciones: sin propagar el origen, ese ida y vuelta lo perdía y el
    // "Volver" siguiente caía en el fallback en vez de en el listado del que se venía.
    const { result } = renderReturnTo([{ pathname: '/integraciones', state: { from: '/proximos' } }]);

    act(() => result.current.flow.navigateKeepingOrigin('/bandeja'));
    expect(result.current.flow.returnTo).toBe('/proximos');

    act(() => result.current.flow.navigateKeepingOrigin('/integraciones'));
    expect(result.current.location.pathname).toBe('/integraciones');
    expect(result.current.flow.returnTo).toBe('/proximos');
  });
});
