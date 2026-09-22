import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSocialNavigation } from '../../src/viewmodel/social/useSocialNavigation';
import { matchSocialRoute } from '../../src/viewmodel/social/socialRoutes';

// Los destinos del hub vivían escritos a mano dentro de `useSocialViewModel`, con su propio `encodeURIComponent`;
// ahora se construyen con `SOCIAL_ROUTES` + `generatePath`. Este test fija el CONTRATO que tenían aquellas
// plantillas —dirección exacta, incluida la codificación— para que cambiar de motor no mueva ninguna pantalla.
//
// Y cierra el círculo: lo que se GENERA aquí tiene que volver a LEERSE como la misma pantalla con
// `matchSocialRoute`, que es lo que usa el hub para saber dónde está. Esa vuelta es justo lo que no podía
// comprobarse mientras las rutas se escribían dos veces.

function navegacion(pathname = '/social') {
  const navigate = vi.fn();
  const { result } = renderHook(() => useSocialNavigation(navigate as never, pathname));
  return { navigate, nav: result.current };
}

/** La dirección a la que se navegó en la última llamada. */
const destino = (navigate: ReturnType<typeof vi.fn>): string => String(navigate.mock.calls.at(-1)?.[0]);

describe('destinos del hub social', () => {
  it('lleva a cada pantalla por su dirección', () => {
    const { navigate, nav } = navegacion();

    nav.openProfileDetail('abc123');
    expect(destino(navigate)).toBe('/social/profiles/abc123');

    nav.openProfileReviews('abc123');
    expect(destino(navigate)).toBe('/social/profiles/abc123/reviews');

    nav.closeProfileReviews('abc123');
    expect(destino(navigate)).toBe('/social/profiles/abc123');

    nav.openProfileReviewDetail('abc123', 42);
    expect(destino(navigate)).toBe('/social/profiles/abc123/game/42/review');

    nav.openProfileAchievements('abc123');
    expect(destino(navigate)).toBe('/social/profiles/abc123/logros');

    nav.closeProfileAchievements('abc123');
    expect(destino(navigate)).toBe('/social/profiles/abc123');

    nav.openProfileGlobals('abc123');
    expect(destino(navigate)).toBe('/social/profiles/abc123/globales');

    nav.openActivityDetail({ actorProfileId: 'otra', gameId: 7, type: 'review' });
    expect(destino(navigate)).toBe('/social/user/otra/game/7/review');

    nav.openActivityDetail({ actorProfileId: 'otra', gameId: 7, type: 'recommendation' });
    expect(destino(navigate)).toBe('/social/user/otra/game/7/recommendation');

    // Un movimiento solo puede llevar al análisis: el tipo va fijo.
    nav.openMoveReview('otra', 9);
    expect(destino(navigate)).toBe('/social/user/otra/game/9/review');
  });

  it('codifica el pseudónimo UNA vez, no dos', () => {
    const { navigate, nav } = navegacion();
    nav.openProfileDetail('ñandú espacial');
    // Doble codificación daría `%25C3%25B1…` y abriría la pantalla de nadie.
    expect(destino(navigate)).toBe(`/social/profiles/${encodeURIComponent('ñandú espacial')}`);
    expect(destino(navigate)).not.toContain('%25');
  });

  it('lo que se genera se vuelve a leer como la misma pantalla', () => {
    const { navigate, nav } = navegacion();

    nav.openProfileAchievements('abc123');
    const logros = matchSocialRoute(destino(navigate));
    expect(logros.activePanel).toBe('profile-detail');
    expect(logros.profileAchievementsView).toBe(true);
    expect(logros.profileDetailId).toBe('abc123');

    nav.openActivityDetail({ actorProfileId: 'otra', gameId: 7, type: 'review' });
    const detalle = matchSocialRoute(destino(navigate));
    expect(detalle.activePanel).toBe('detail');
    expect(detalle.detailActorUid).toBe('otra');
    expect(detalle.detailGameId).toBe(7);
    expect(detalle.detailEventType).toBe('review');
  });

  it('la reseña propia va por el alias, y apunta de dónde se viene', () => {
    const { navigate, nav } = navegacion('/social');

    nav.openRelatedReview({ isOwn: true, authorId: 'da igual', gameId: 12 });
    expect(destino(navigate)).toBe('/social/profiles/me/game/12/review');
    expect(navigate.mock.calls.at(-1)?.[1]).toEqual({ state: { backTo: '/social' } });

    nav.openRelatedReview({ isOwn: false, authorId: 'otra', gameId: 12 });
    expect(destino(navigate)).toBe('/social/user/otra/game/12/review');
  });

  it('el `backTo` es la pantalla desde la que se abrió', () => {
    const { navigate, nav } = navegacion('/social/profiles/abc123/reviews');
    nav.openRelatedReview({ isOwn: true, authorId: '', gameId: 3 });
    expect(navigate.mock.calls.at(-1)?.[1]).toEqual({
      state: { backTo: '/social/profiles/abc123/reviews' },
    });
  });
});
