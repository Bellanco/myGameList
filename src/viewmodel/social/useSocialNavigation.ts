// A DÓNDE LLEVA CADA GESTO DEL HUB, en un solo sitio.
//
// Eran diez `useCallback` sueltos dentro de `useSocialViewModel`, cada uno con su dirección escrita a mano
// (`/social/profiles/${encodeURIComponent(id)}/logros`). El problema no era el tamaño: es que esas plantillas son
// LAS MISMAS que `SOCIAL_ROUTES` declara para leerlas, así que había dos copias de cada ruta —la que se lee y la
// que se escribe— y nada que impidiera que divergieran. Aquí se construyen CON `SOCIAL_ROUTES` y `generatePath`,
// que es el mismo par que usa el router para lo contrario.
//
// `generatePath` codifica los parámetros, así que no lleva `encodeURIComponent` a mano: hacerlo dos veces
// convertiría un `ñ` en `%25C3%25B1` y abriría la pantalla de otro (o de nadie).
import { useMemo } from 'react';
import { generatePath, type NavigateFunction } from 'react-router-dom';
import { OWN_PROFILE_ALIAS, SOCIAL_ROUTES, type SocialEventType } from './socialRoutes';

/** Lo que hace falta de una entrada de actividad para abrir su detalle. */
export interface ActivityTarget {
  actorProfileId: string;
  gameId: number;
  type: SocialEventType;
}

/** Lo que hace falta de una reseña relacionada: si es mía y de quién es si no lo es. */
export interface RelatedTarget {
  isOwn: boolean;
  authorId: string;
  gameId: number;
}

export interface SocialNavigation {
  openActivityDetail: (entry: ActivityTarget) => void;
  openMoveReview: (actorProfileId: string, gameId: number) => void;
  openProfileDetail: (profileId: string) => void;
  openProfileReviews: (profileId: string) => void;
  closeProfileReviews: (profileId: string) => void;
  openProfileReviewDetail: (profileId: string, gameId: number) => void;
  openProfileAchievements: (profileId: string) => void;
  closeProfileAchievements: (profileId: string) => void;
  openProfileGlobals: (profileId: string) => void;
  openRelatedReview: (entry: RelatedTarget) => void;
}

/**
 * Los destinos del hub. `pathname` solo lo necesita `openRelatedReview`, que apunta de dónde se viene.
 *
 * Se devuelve un objeto MEMOIZADO y no diez callbacks sueltos porque quien lo consume los reparte por props a
 * pantallas memoizadas: con identidades estables, abrir una ficha no repinta el árbol entero.
 */
export function useSocialNavigation(navigate: NavigateFunction, pathname: string): SocialNavigation {
  return useMemo(
    () => ({
      openActivityDetail: (entry) => {
        void navigate(
          generatePath(SOCIAL_ROUTES.activityDetail, {
            userId: entry.actorProfileId,
            gameId: String(entry.gameId),
            eventType: entry.type,
          }),
        );
      },

      /**
       * F4 — el análisis del autor sobre ese juego, desde el nombre del juego de un movimiento. Mismo destino
       * que `openActivityDetail` con el tipo fijo a `review`: es el único que un movimiento puede tener (no hay
       * pantalla de «movimiento», y no la necesita).
       *
       * `actorProfileId` es el pseudónimo que lleva la entrada de actividad DEL GIST, y el nombre lo dice a
       * propósito: el detalle se resuelve comparando con ese campo, así que pasar aquí el id de la entrada del
       * directorio —que para una amistad es su uid de Firebase— abría una pantalla vacía.
       */
      openMoveReview: (actorProfileId, gameId) => {
        void navigate(
          generatePath(SOCIAL_ROUTES.activityDetail, {
            userId: actorProfileId,
            gameId: String(gameId),
            eventType: 'review',
          }),
        );
      },

      // Cualquier perfil del directorio se puede abrir (para no-amigos: hero + «Añadir amigo»).
      openProfileDetail: (profileId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileDetail, { profileId }));
      },

      // Reseñas del perfil: alternar entre la ficha y la lista de reseñas, y abrir una reseña a pantalla
      // completa. Cerrar es volver a la ficha, no retroceder: así el botón de atrás del navegador sigue
      // significando lo mismo que en el resto del hub.
      openProfileReviews: (profileId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileReviews, { profileId }));
      },
      closeProfileReviews: (profileId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileDetail, { profileId }));
      },
      openProfileReviewDetail: (profileId, gameId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileReview, { profileId, gameId: String(gameId) }));
      },

      // Logros de ese perfil: mismo par abrir/cerrar que las reseñas, y por el mismo motivo.
      openProfileAchievements: (profileId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileAchievements, { profileId }));
      },
      closeProfileAchievements: (profileId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileDetail, { profileId }));
      },
      openProfileGlobals: (profileId) => {
        void navigate(generatePath(SOCIAL_ROUTES.profileGlobals, { profileId }));
      },

      /**
       * Una reseña relacionada: la propia va por el alias `me` —no por el pseudónimo, que puede no existir aún— y
       * la ajena por el pseudónimo de su autor.
       *
       * DE DÓNDE SE VIENE (`backTo`), para que el botón de volver lleve AHÍ y no al sitio por defecto de la
       * pantalla que se abre. Sin esto, saltar a un análisis propio ofrecía «volver a las reseñas» —la lista de
       * tus reseñas— a quien venía del feed y no había pasado por esa lista en su vida. Se usa el mecanismo que
       * el hub YA tiene para esto (lo estrenó el panel de estadísticas al enlazar tus reseñas).
       */
      openRelatedReview: (entry) => {
        const target = entry.isOwn
          ? generatePath(SOCIAL_ROUTES.profileReview, {
              profileId: OWN_PROFILE_ALIAS,
              gameId: String(entry.gameId),
            })
          : generatePath(SOCIAL_ROUTES.activityDetail, {
              userId: entry.authorId,
              gameId: String(entry.gameId),
              eventType: 'review',
            });
        void navigate(target, { state: { backTo: pathname } });
      },
    }),
    [navigate, pathname],
  );
}
