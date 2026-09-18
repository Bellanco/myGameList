import { describe, expect, it } from 'vitest';
import { APP_ROUTES, FALLBACK_ROUTE, LEGACY_ROUTE_REDIRECTS, isKnownRoute, legacyRedirectTarget, matchAppSection } from '../../src/core/constants/routes';
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

  it('/stats es el panel de estadísticas, no el perfil social', () => {
    // El panel se llamó `/perfil` y la ficha pública vive en `/social/profile`: son dos pantallas distintas y
    // ninguna debe robarle la ruta a la otra. El renombrado a `/stats` es lo que deshace el equívoco.
    expect(matchAppSection('/stats')).toBe('stats');
    expect(matchAppSection('/stats/resenas')).toBe('stats');
    expect(matchAppSection('/stats/resenas/7')).toBe('stats');
    expect(matchAppSection(SOCIAL_ROUTES.profileEdit)).toBe('social');
  });

  it('/admin resuelve aunque esté oculta en la navegación', () => {
    expect(matchAppSection('/admin')).toBe('admin');
  });

  it('un camino desconocido cae a listados, que es a donde lo lleva el catch-all', () => {
    expect(matchAppSection('/no-existe')).toBe('lists');
    expect(matchAppSection(FALLBACK_ROUTE)).toBe('lists');
  });

  it('el nombre retirado de una lista redirige al actual en vez de rebotar a completados', () => {
    // `/visitados` era el nombre de la lista de abandonados. Renombrarla en seco habría mandado al rebote
    // cualquier marcador o acceso directo ya guardado, que es la razón de que la redirección exista.
    expect(LEGACY_ROUTE_REDIRECTS).toContainEqual({ from: '/visitados', to: '/abandonados' });
    expect(LEGACY_ROUTE_REDIRECTS).toContainEqual({ from: '/perfil', to: '/stats' });
    // «Cuenta» fue pantalla y pestaña; su contenido vive ahora en el grupo de personalización.
    expect(LEGACY_ROUTE_REDIRECTS).toContainEqual({ from: '/cuenta', to: '/ajustes/personalizacion' });
    // El destino de cada redirección tiene que RESOLVER; si no, el salto acaba en el catch-all y el nombre
    // viejo, que existía para no perder a nadie, pierde a todo el mundo. Se pregunta con el matcher y no
    // buscando el camino en la tabla: hay destinos que cubre un comodín (`/ajustes/*`) y ahí la comparación
    // exacta diría que no existen.
    for (const { from, to } of LEGACY_ROUTE_REDIRECTS) {
      expect(isKnownRoute(to), to).toBe(true);
      // Y el nombre RETIRADO no puede seguir declarado como pantalla: si lo estuviera, ganaría él y la
      // redirección no se alcanzaría nunca.
      expect(APP_ROUTES.some((route) => route.path === from), from).toBe(false);
    }
  });

  it('isKnownRoute distingue lo declarado de lo inventado, que `matchAppSection` no puede', () => {
    // Justo por eso existe: al caer todo lo desconocido en 'lists', el matcher de sección no sirve para validar
    // un pathname que viene de fuera (el origen del "Volver" guardado en el historial).
    for (const { path } of APP_ROUTES) {
      if (path.endsWith('/*') || path.includes(':')) continue;
      expect(isKnownRoute(path), path).toBe(true);
    }
    expect(isKnownRoute('/social/requests')).toBe(true);
    // Un nombre retirado SIGUE resolviendo (redirige), así que el "Volver" puede fiarse de él.
    expect(isKnownRoute('/visitados')).toBe(true);
    expect(isKnownRoute('/no-existe')).toBe(false);
  });

  it('el nombre retirado del panel sigue reconociéndose CON su cola', () => {
    // `/perfil/resenas/:id` se abre en otra pestaña y se copia, así que un enlace guardado con el nombre viejo
    // tiene que seguir siendo una ruta conocida; si no, el "Volver" lo trataría como dirección inventada.
    expect(isKnownRoute('/perfil')).toBe(true);
    expect(isKnownRoute('/perfil/resenas')).toBe(true);
    expect(isKnownRoute('/perfil/resenas/7')).toBe(true);
    // El comodín no puede tragarse un nombre que solo EMPIECE igual.
    expect(isKnownRoute('/perfiles')).toBe(false);
  });

  it('la redirección con comodín conserva lo que colgaba del nombre viejo', () => {
    expect(legacyRedirectTarget('/stats', 'resenas/7')).toBe('/stats/resenas/7');
    expect(legacyRedirectTarget('/stats', '')).toBe('/stats');
  });
});
