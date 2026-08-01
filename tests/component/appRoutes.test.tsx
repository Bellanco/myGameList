import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { APP_ROUTE_PATHS } from '../../src/App';
import { LEGAL_ROUTES } from '../../src/core/constants/legal';

// Regresión: el `<Route path="*">` de App redirige a /completados toda ruta NO listada en APP_ROUTE_PATHS.
// Una sub-ruta social declarada en el ViewModel pero ausente aquí (como pasó con /social/requests) rebotaría a
// completados. Este test reconstruye el matching real de App a partir de la MISMA lista exportada.

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {APP_ROUTE_PATHS.map((p) => (
          <Route key={p} path={p} element={<div>{`MATCH:${p}`}</div>} />
        ))}
        <Route path="*" element={<Navigate to="/completados" replace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('App routes (regresión de rutas sociales)', () => {
  it('incluye todas las sub-rutas sociales que produce el ViewModel', () => {
    for (const path of ['/social', '/social/profile', '/social/profiles', '/social/requests']) {
      expect(APP_ROUTE_PATHS).toContain(path);
    }
  });

  it('/social/requests casa una ruta propia (no rebota a /completados)', () => {
    renderAt('/social/requests');
    expect(screen.getByText('MATCH:/social/requests')).toBeInTheDocument();
  });

  it('las rutas sociales dinámicas también casan', () => {
    renderAt('/social/profiles/abc');
    expect(screen.getByText('MATCH:/social/profiles/:profileId')).toBeInTheDocument();
  });

  it('L4: los documentos legales tienen ruta propia y no rebotan a /completados', () => {
    for (const path of Object.values(LEGAL_ROUTES)) {
      expect(APP_ROUTE_PATHS).toContain(path);
    }

    renderAt(LEGAL_ROUTES.privacy);
    expect(screen.getByText(`MATCH:${LEGAL_ROUTES.privacy}`)).toBeInTheDocument();
  });

  it('/admin tiene ruta propia aunque esté oculta (sin ella, el catch-all la rebotaría)', () => {
    expect(APP_ROUTE_PATHS).toContain('/admin');
    renderAt('/admin');
    expect(screen.getByText('MATCH:/admin')).toBeInTheDocument();
  });

  it('una ruta desconocida sí rebota a /completados (catch-all)', () => {
    renderAt('/ruta-inexistente');
    // El Navigate del catch-all lleva a /completados, cuya ruta renderiza su marcador.
    expect(screen.getByText('MATCH:/completados')).toBeInTheDocument();
  });
});
