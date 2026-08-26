import { describe, expect, it } from 'vitest';
import { APP_ROUTES, FALLBACK_ROUTE, isKnownRoute, matchAppSection } from '../../src/core/constants/routes';
import { LEGAL_ROUTES } from '../../src/core/constants/legal';
import { SOCIAL_ROUTES } from '../../src/viewmodel/social/socialRoutes';

// Regresión de rutas. Antes, App mantenía DOS listas: una cadena de ternarios elegía la pantalla y un `<Routes>`
// aparte declaraba qué caminos eran válidos; olvidar una entrada en la segunda hacía que la pantalla rebotara a
// /completados (le pasó a `/social/requests`). Ese test reconstruía el matching a partir de la lista exportada.
//
// Ahora la tabla es única y `<Routes>` se genera de ella, así que lo que hay que comprobar es otra cosa: que el
// matcher que usa App (`matchAppSection`) mande cada camino a su sección, y sobre todo que las sub-rutas del hub
// NO necesiten declararse aquí — las cubre el comodín `/social/*`, que es lo que elimina aquella clase de fallo.

describe('rutas de la app', () => {
  it('cada camino de la tabla resuelve a su propia sección', () => {
    for (const { path, section } of APP_ROUTES) {
      // El comodín se comprueba abajo con caminos reales; `matchRoutes` no casa el patrón contra sí mismo.
      if (path.endsWith('/*')) continue;
      expect(matchAppSection(path), path).toBe(section);
    }
  });

  it('TODA sub-ruta social cae en la sección social sin declararla', () => {
    // Justo la clase de fallo que costó `/social/requests`: estas rutas las produce el hub, no esta tabla.
    const paths = [
      '/social',
      ...Object.values(SOCIAL_ROUTES).map((pattern) => pattern
        .replace(':profileId', 'abc')
        .replace(':userId', 'uid-1')
        .replace(':gameId', '42')
        .replace(':eventType', 'review')),
      '/social/una-pantalla-que-todavia-no-existe',
    ];

    for (const path of paths) {
      expect(matchAppSection(path), path).toBe('social');
    }
  });

  it('los documentos legales tienen sección propia', () => {
    for (const path of Object.values(LEGAL_ROUTES)) {
      expect(matchAppSection(path), path).toBe('legal');
    }
  });

  it('/perfil es el panel de estadísticas, no el perfil social', () => {
    // La pestaña inferior se llama "Perfil" y la ficha pública vive en `/social/profile`: son dos pantallas
    // distintas y ninguna debe robarle la ruta a la otra.
    expect(matchAppSection('/perfil')).toBe('stats');
    expect(matchAppSection(SOCIAL_ROUTES.profileEdit)).toBe('social');
  });

  it('/admin resuelve aunque esté oculta en la navegación', () => {
    expect(matchAppSection('/admin')).toBe('admin');
  });

  it('un camino desconocido cae a listados, que es a donde lo lleva el catch-all', () => {
    expect(matchAppSection('/no-existe')).toBe('lists');
    expect(matchAppSection(FALLBACK_ROUTE)).toBe('lists');
  });

  it('isKnownRoute distingue lo declarado de lo inventado, que `matchAppSection` no puede', () => {
    // Justo por eso existe: al caer todo lo desconocido en 'lists', el matcher de sección no sirve para validar
    // un pathname que viene de fuera (el origen del "Volver" guardado en el historial).
    for (const { path } of APP_ROUTES) {
      if (path.endsWith('/*') || path.includes(':')) continue;
      expect(isKnownRoute(path), path).toBe(true);
    }
    expect(isKnownRoute('/social/requests')).toBe(true);
    expect(isKnownRoute('/no-existe')).toBe(false);
  });
});
