import { describe, expect, it } from 'vitest';
import { matchSocialRoute } from '../../src/viewmodel/social/socialRoutes';

// Las sub-rutas del hub se resolvían con siete expresiones regulares escritas a mano; ahora las resuelve el
// matcher de react-router. Este test fija el CONTRATO que tenían aquellas regex, para que el cambio de motor no
// mueva ninguna pantalla: los casos de abajo son los que ellas aceptaban (incluidas las barras finales, que
// llevaban un `\/?$` explícito) y los que rechazaban.

describe('rutas del hub social', () => {
  it('/social a secas es el feed', () => {
    expect(matchSocialRoute('/social').activePanel).toBe('feed');
  });

  it('reconoce las pantallas sin parámetros, con y sin barra final', () => {
    for (const [path, panel] of [
      ['/social/profile', 'profile'],
      ['/social/profile/', 'profile'],
      ['/social/profiles', 'profiles'],
      ['/social/profiles/', 'profiles'],
      ['/social/requests', 'requests'],
      ['/social/requests/', 'requests'],
    ] as const) {
      expect(matchSocialRoute(path).activePanel, path).toBe(panel);
    }
  });

  it('la ficha de un perfil no se confunde con el directorio', () => {
    const state = matchSocialRoute('/social/profiles/abc123');
    expect(state.activePanel).toBe('profile-detail');
    expect(state.profileDetailId).toBe('abc123');
    expect(state.profileReviewsView).toBe(false);
  });

  it('la pestaña de reseñas gana a la ficha (prefijo compartido)', () => {
    const state = matchSocialRoute('/social/profiles/abc123/reviews');
    expect(state.activePanel).toBe('profile-detail');
    expect(state.profileDetailId).toBe('abc123');
    expect(state.profileReviewsView).toBe(true);
  });

  it('la reseña concreta gana a las dos anteriores', () => {
    const state = matchSocialRoute('/social/profiles/abc123/game/42/review');
    expect(state.activePanel).toBe('profile-review');
    expect(state.profileDetailId).toBe('abc123');
    expect(state.profileReviewGameId).toBe(42);
  });

  it('decodifica el id del perfil (podía llegar escapado en la URL)', () => {
    expect(matchSocialRoute('/social/profiles/a%20b').profileDetailId).toBe('a b');
  });

  it('resuelve el detalle de actividad con su tipo de evento', () => {
    for (const type of ['review', 'recommendation'] as const) {
      const state = matchSocialRoute(`/social/user/uid-1/game/7/${type}`);
      expect(state.activePanel).toBe('detail');
      expect(state.detailActorUid).toBe('uid-1');
      expect(state.detailGameId).toBe(7);
      expect(state.detailEventType).toBe(type);
    }
  });

  it('un tipo de evento inventado NO abre el detalle', () => {
    // La regex vieja solo aceptaba (review|recommendation); sin esta guarda, un `eventType` cualquiera de la URL
    // llegaría hasta las pantallas como si fuera un tipo válido.
    expect(matchSocialRoute('/social/user/uid-1/game/7/borrar').activePanel).toBe('feed');
  });

  it('un id de juego no numérico no cuenta como juego', () => {
    // La regex exigía `\d+`. Con `matchPath` el parámetro llega como texto, así que la validación es explícita:
    // un id inválido debe quedar en 0, que es lo que las pantallas tratan como "sin juego".
    expect(matchSocialRoute('/social/user/uid-1/game/NaN/review').detailGameId).toBe(0);
    expect(matchSocialRoute('/social/profiles/abc/game/x/review').profileReviewGameId).toBe(0);
  });

  it('una ruta social desconocida cae al feed', () => {
    // Ninguna de las dos casa: `:profileId` cuelga de `/social/profiles/`, no de `/social/`, y el detalle de
    // actividad exige los cuatro segmentos. Mismo comportamiento que las regex.
    expect(matchSocialRoute('/social/loquesea').activePanel).toBe('feed');
    expect(matchSocialRoute('/social/user/uid-1').activePanel).toBe('feed');
  });

  it('un id escapado mal formado no tumba el matcher', () => {
    // `decodeURIComponent('%zz')` lanza; con una URL manipulada eso reventaría el render del hub.
    expect(() => matchSocialRoute('/social/profiles/%zz')).not.toThrow();
  });
});
