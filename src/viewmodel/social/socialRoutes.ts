// Sub-rutas del hub social. Una tabla de patrones de react-router en lugar de las siete expresiones regulares
// escritas a mano que había antes: los patrones son los mismos que entiende `<Link>`/`navigate`, así que dejan
// de poder divergir del resto del enrutado, y el decodificado de parámetros lo hace el router.
import { matchPath } from 'react-router-dom';

/** Panel visible del hub. `feed` es el estado por defecto (y el de `/social` a secas). */
export type SocialPanel = 'feed' | 'profile' | 'profiles' | 'requests' | 'profile-detail' | 'profile-review' | 'detail';

export type SocialEventType = 'review' | 'recommendation';

export interface SocialRouteState {
  activePanel: SocialPanel;
  /** Perfil abierto; común a las tres sub-rutas de detalle (ficha, reseñas y reseña concreta). */
  profileDetailId: string;
  /** ¿Se está en la pestaña de reseñas de ese perfil? */
  profileReviewsView: boolean;
  profileReviewGameId: number;
  detailActorUid: string;
  detailGameId: number;
  detailEventType: SocialEventType | '';
}

export const SOCIAL_ROUTES = {
  profileEdit: '/social/profile',
  profiles: '/social/profiles',
  requests: '/social/requests',
  profileDetail: '/social/profiles/:profileId',
  profileReviews: '/social/profiles/:profileId/reviews',
  profileReview: '/social/profiles/:profileId/game/:gameId/review',
  activityDetail: '/social/user/:userId/game/:gameId/:eventType',
} as const;

const EMPTY: SocialRouteState = {
  activePanel: 'feed',
  profileDetailId: '',
  profileReviewsView: false,
  profileReviewGameId: 0,
  detailActorUid: '',
  detailGameId: 0,
  detailEventType: '',
};

/**
 * Descodifica un parámetro de la URL. `matchPath` los entrega TAL CUAL (a diferencia de las regex de antes, que
 * pasaban por `decodeURIComponent` a mano), así que sin esto un id con caracteres escapados —`a%20b`— llegaría
 * escapado y no casaría con ningún perfil.
 *
 * Tolera lo mal formado: `decodeURIComponent('%zz')` LANZA, y una URL manipulada no debe tumbar el render del
 * hub. Se devuelve el valor crudo, que simplemente no encontrará perfil.
 */
function decodeParam(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Alias del PERFIL PROPIO en la URL. El panel de estadísticas enlaza a tus reseñas —que ya viven en el hub
 * social— y ahí fuera no se conoce el pseudónimo público, que se resuelve al hidratar el directorio. Con este
 * comodín el enlace se puede escribir sin saberlo: `/social/profiles/me/reviews`.
 */
export const OWN_PROFILE_ALIAS = 'me';

/** Id numérico de un parámetro de ruta; 0 (que ninguna pantalla considera válido) si no lo es. */
function toGameId(raw: string | undefined): number {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

/**
 * Estado del hub para un pathname.
 *
 * El ORDEN importa: se prueba de la más específica a la más general, porque `/social/profiles/:profileId` también
 * casaría el prefijo de `/social/profiles/:profileId/reviews`. Con las regex el orden lo imponía una cadena de
 * ternarios de catorce ramas; aquí es la lectura de arriba abajo.
 */
export function matchSocialRoute(pathname: string): SocialRouteState {
  if (matchPath(SOCIAL_ROUTES.profileEdit, pathname)) {
    return { ...EMPTY, activePanel: 'profile' };
  }
  if (matchPath(SOCIAL_ROUTES.profiles, pathname)) {
    return { ...EMPTY, activePanel: 'profiles' };
  }
  if (matchPath(SOCIAL_ROUTES.requests, pathname)) {
    return { ...EMPTY, activePanel: 'requests' };
  }

  const review = matchPath(SOCIAL_ROUTES.profileReview, pathname);
  if (review) {
    return {
      ...EMPTY,
      activePanel: 'profile-review',
      profileDetailId: decodeParam(review.params.profileId),
      profileReviewGameId: toGameId(review.params.gameId),
    };
  }

  const reviews = matchPath(SOCIAL_ROUTES.profileReviews, pathname);
  if (reviews) {
    return { ...EMPTY, activePanel: 'profile-detail', profileDetailId: decodeParam(reviews.params.profileId), profileReviewsView: true };
  }

  const profile = matchPath(SOCIAL_ROUTES.profileDetail, pathname);
  if (profile) {
    return { ...EMPTY, activePanel: 'profile-detail', profileDetailId: decodeParam(profile.params.profileId) };
  }

  const detail = matchPath(SOCIAL_ROUTES.activityDetail, pathname);
  // El tipo de evento viaja en la URL, así que se valida contra los dos que existen: cualquier otra cosa no es
  // una ruta de detalle y cae al feed, en vez de propagarse como un tipo inventado hasta las pantallas.
  if (detail && (detail.params.eventType === 'review' || detail.params.eventType === 'recommendation')) {
    return {
      ...EMPTY,
      activePanel: 'detail',
      detailActorUid: decodeParam(detail.params.userId),
      detailGameId: toGameId(detail.params.gameId),
      detailEventType: detail.params.eventType,
    };
  }

  return EMPTY;
}
