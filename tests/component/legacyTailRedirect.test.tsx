// EL NOMBRE VIEJO DE UNA PANTALLA CON HIJOS NO PUEDE PERDER LA COLA.
//
// El panel de estadísticas se llamó `/perfil`. Renombrarlo a `/stats` con un `<Navigate to="/stats">` a secas
// habría mandado al panel a cualquiera que abriese `/perfil/resenas/7`, que es una dirección hecha para
// abrirse en otra pestaña y copiarse (ver el enlace del detalle en `GameTable`). Este fichero es lo único que
// separa de producción esa pérdida silenciosa: el enlace seguiría "funcionando", solo que llevando a otro sitio.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LEGACY_ROUTE_REDIRECTS } from '../../src/core/constants/routes';
import { LegacyTailRedirect } from '../../src/view/components/LegacyTailRedirect';

/** Dice dónde se ha acabado, con dirección completa: es lo que se quiere comprobar. */
function Destino() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="destino">{`${pathname}${search}${hash}`}</div>;
}

/** El mismo montaje que hace `App`: la tabla de retirados, pintada igual que allí. */
function montar(entrada: string) {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/stats/*" element={<Destino />} />
        <Route path="/abandonados" element={<Destino />} />
        {LEGACY_ROUTE_REDIRECTS.map(({ from, to }) => (
          <Route
            key={from}
            path={from}
            element={from.endsWith('/*') ? <LegacyTailRedirect to={to} /> : <Navigate to={to} replace />}
          />
        ))}
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId('destino').textContent;
}

describe('redirección de nombres retirados', () => {
  it('lleva el detalle de una reseña guardado con el nombre viejo a su dirección nueva', () => {
    expect(montar('/perfil/resenas/7')).toBe('/stats/resenas/7');
  });

  it('el nombre pelado va al panel, sin barra suelta detrás', () => {
    expect(montar('/perfil')).toBe('/stats');
  });

  it('la búsqueda y el ancla viajan con la cola', () => {
    expect(montar('/perfil/resenas/7?de=feed#nota')).toBe('/stats/resenas/7?de=feed#nota');
  });

  it('un nombre retirado SIN hijos sigue redirigiendo como siempre', () => {
    expect(montar('/visitados')).toBe('/abandonados');
  });
});
