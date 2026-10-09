// LO QUE SE ESTÁ LEYENDO EN EL ESPACIO SOCIAL: la ficha de un perfil, una reseña dentro de ella o una actividad
// abierta desde el feed.
//
// Sale de `useSocialViewModel` en un solo hook, y no en dos, por el ANCLA de las reseñas relacionadas: mezcla el
// evento abierto del feed con la reseña abierta de un perfil, y las dos leen los mismos listados ajenos
// (`useForeignProfileGames`). Partirlo obligaba a pasar media docena de piezas de un hook al otro.
//
// Lo que no puede cambiar al moverlo, y por eso viene escrito:
//  · El gist de un AMIGO se lee de su entrada del directorio ya saneada (`entry.socialGistId`), nunca del perfil:
//    con el del perfil, un directorio desfasado dejaba sus reseñas fuera del feed.
//  · El token de reserva llega como ESTADO (`fallbackToken`), resuelto por quien llama tras esperar al cifrado; aquí
//    no se lee `getSyncConfig()` en ningún inicializador, que es la carrera que mandaba el feed a Ajustes con 401.
import { useCallback, useEffect, useMemo } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { getSocialSyncConfig, readPublicSocialGistById, type SocialSharedGame } from '../../model/repository/socialGistRepository';
import { TAB_IDS, type GameItem, type TabData } from '../../model/types/game';
import type { RelationshipState, SocialProfileVisibility } from '../../model/types/social';
import type { RelatedReviewAnchor } from '../../core/social/relatedReviews';
import { isOwnProfileIdentity } from './socialIdentity';
import { isVisibilityKnown, type SocialActivityFeedItem, type SocialDirectoryEntry } from './socialFeed';
import { LOCKED_VISIBILITY } from '../../core/utils/profileVisibility';
import { OWN_PROFILE_ALIAS, type SocialRouteState } from './socialRoutes';
import { useForeignProfileGames } from './useForeignProfileGames';
import { useRelatedReviews } from './useRelatedReviews';

export interface SocialReadingInput {
  route: Pick<SocialRouteState, 'activePanel' | 'profileDetailId' | 'profileReviewGameId' | 'detailActorUid' | 'detailGameId' | 'detailEventType'>;
  directory: SocialDirectoryEntry[];
  /** La ventana entera en que el directorio aún puede traer lo que se busca (ver `useSocialDirectory`). */
  directoryLoading: boolean;
  patchDirectoryEntries: (
    match: (entry: SocialDirectoryEntry) => boolean,
    patch: Partial<SocialDirectoryEntry> | ((entry: SocialDirectoryEntry) => Partial<SocialDirectoryEntry>),
  ) => void;
  ownUid: string | undefined;
  ownProfileId: string | null;
  ownDisplayName: string;
  relationshipWith: (otherUid: string) => RelationshipState;
  localGames: TabData;
  isAdmin: boolean;
  defaultVisibility: SocialProfileVisibility;
  /** El token de la sincronización principal, ya hidratado: el de reserva para leer gists ajenos. */
  fallbackToken: string | null;
  navigate: NavigateFunction;
}

export function useSocialReading({
  route,
  directory,
  directoryLoading,
  patchDirectoryEntries,
  ownUid,
  ownProfileId,
  ownDisplayName,
  relationshipWith,
  localGames,
  isAdmin,
  defaultVisibility,
  fallbackToken,
  navigate,
}: SocialReadingInput) {
  const { activePanel, profileDetailId, profileReviewGameId, detailActorUid, detailGameId, detailEventType } = route;

  /**
   * Evento abierto a pantalla completa desde el feed (/social/user/:uid/game/:id/:tipo).
   *
   * Busca DIRECTAMENTE en el directorio, en una sola pasada y sin construir nada por el camino. Antes salía de un
   * `activityFeedItems` que aplanaba y ORDENABA toda la actividad del directorio (hasta 50 perfiles × 320 entradas)
   * para quedarse con 300 y luego buscar una — y se recalculaba con cada cambio del directorio aunque no hubiera
   * ningún detalle abierto, duplicando el trabajo que ya hace `feedItems`.
   *
   * De paso deja de estar limitado a esas 300: un evento más antiguo que el corte no se podía abrir por URL.
   * Ante duplicados (posibles al fusionar dos gists sociales) sigue ganando el más reciente, como antes.
   */
  const activeDetailEvent = useMemo(() => {
    if (activePanel !== 'detail' || !detailActorUid || detailGameId <= 0 || !detailEventType) {
      return null;
    }

    let best: SocialActivityFeedItem | null = null;
    for (const entry of directory) {
      // `|| []`: una entrada de caché antigua/malformada podría no traer `activity`.
      for (const activityEntry of entry.activity || []) {
        if (
          activityEntry.actorProfileId === detailActorUid &&
          activityEntry.gameId === detailGameId &&
          activityEntry.type === detailEventType &&
          (!best || activityEntry.updatedAt > best.updatedAt)
        ) {
          best = activityEntry;
        }
      }
    }
    return best;
  }, [activePanel, directory, detailActorUid, detailEventType, detailGameId]);

  // LOS LISTADOS DE OTRAS PERSONAS (`useForeignProfileGames`). Va AQUÍ, y el orden no es casual: necesita saber
  // qué perfil hay abierto —el de la ficha o el del evento del detalle— y lo alimentan tres de los que vienen
  // debajo (`selectedProfileDetail`, `detailReviewLoading`, `relatedReviews`), así que `activeDetailEvent` se
  // resuelve justo encima en vez de más abajo, donde estaba.
  const {
    foreignGames,
    foreignProfileFailed,
    getGameItemById,
  } = useForeignProfileGames({
    activePanel,
    profileDetailId,
    detailProfileId: activeDetailEvent?.profileId || '',
    ownUid,
    ownProfileId,
    directory,
    relationshipWith,
    localGames,
    isAdmin,
    defaultVisibility,
    fallbackToken,
  });

  const selectedProfileDetail = useMemo(() => {
    // La vista de perfil, la de reseñas y el detalle de una reseña comparten el mismo perfil seleccionado.
    if ((activePanel !== 'profile-detail' && activePanel !== 'profile-review') || !profileDetailId) {
      return null;
    }

    // `me` en la URL significa "mi perfil": lo usa el panel de estadísticas para enlazar a tus reseñas sin
    // conocer tu pseudónimo público, que solo se resuelve aquí dentro.
    const entry = (profileDetailId === OWN_PROFILE_ALIAS
      ? directory.find((item) => isOwnProfileIdentity(item.id, ownUid, ownProfileId))
      : directory.find((item) => item.id === profileDetailId)) || null;
    // Se puede abrir el detalle de cualquier perfil del directorio (para no-amigos: hero + "Añadir amigo").
    if (!entry) return null;

    // E3 deja `sharedLists` vacío para TODOS los perfiles del directorio (no se exponen las listas ajenas). Para el
    // perfil PROPIO repoblamos las listas desde `localGames` (juegos completos) para que el usuario SÍ vea sus
    // listados; la visibilidad (pestañas ocultas) la sigue aplicando el componente. Perfiles ajenos: index-only.
    // P1: propiedad por identidad (uid/profileId), no por email.
    const isOwn = isOwnProfileIdentity(entry.id, ownUid, ownProfileId);
    if (!isOwn) {
      // Perfiles ajenos: si ya bajamos su lista completa (gist de listados, filtrada por su visibilidad) la
      // mostramos; mientras llega (o si no hay token/datos) se queda index-only y el componente muestra el vacío.
      // Si aún no se sabe lo que esconde, la ficha lo pinta como todo oculto: es lo mismo con lo que se filtran sus
      // listados (ver `useForeignProfileGames`, regla 2).
      const shown = isVisibilityKnown(entry) ? entry : { ...entry, visibility: LOCKED_VISIBILITY };
      const foreign = foreignGames[entry.id];
      if (foreign) return { ...shown, sharedLists: foreign };
      return shown;
    }

    return {
      ...entry,
      sharedLists: {
        c: localGames.c,
        v: localGames.v,
        e: localGames.e,
        p: localGames.p,
        d: localGames.d,
      },
    };
  }, [activePanel, ownUid, foreignGames, localGames, ownProfileId, profileDetailId, directory]);

  // Reseña abierta a pantalla completa desde la lista de reseñas del perfil (/social/profiles/:id/game/:gameId/review).
  // Se busca el juego por id en los listados del perfil seleccionado (datos completos para el propio/amigos; los
  // no-amigos no muestran reseñas). Reúne TODA la información del análisis para el detalle: nota, texto, metadatos.
  const activeProfileReview = useMemo(() => {
    if (activePanel !== 'profile-review' || !selectedProfileDetail || profileReviewGameId <= 0) {
      return null;
    }
    const lists = selectedProfileDetail.sharedLists || {};
    let raw: (GameItem | SocialSharedGame) | null = null;
    for (const tab of TAB_IDS) {
      const found = (lists[tab] || []).find((game) => Number((game as { id?: number }).id || 0) === profileReviewGameId);
      if (found) {
        raw = found;
        break;
      }
    }
    if (!raw) return null;
    const publishedDate = Number(
      (selectedProfileDetail.activity || []).find(
        (entry) => entry.type === 'review' && entry.gameId === profileReviewGameId,
      )?.updatedAt || 0,
    );
    const game = raw as unknown as Record<string, unknown>;
    return {
      id: profileReviewGameId,
      name: String(game.name || ''),
      // Canal público index-only: para perfiles ajenos solo hay snippet/rating; para propios/amigos, review/score completos.
      review: String(game.review || game.snippet || '').trim(), // audit-allow: modelo de lectura para render del detalle (SocialHub), no es escritura a canal público
      score: Number(game.score || game.rating || 0), // audit-allow: modelo de lectura para render del detalle (SocialHub), no es escritura a canal público
      grade: typeof game.grade === 'number' ? game.grade : null,
      platforms: Array.isArray(game.platforms) ? (game.platforms as string[]) : [],
      genres: Array.isArray(game.genres) ? (game.genres as string[]) : [],
      strengths: Array.isArray(game.strengths) ? (game.strengths as string[]) : [],
      weaknesses: Array.isArray(game.weaknesses) ? (game.weaknesses as string[]) : [],
      reasons: Array.isArray(game.reasons) ? (game.reasons as string[]) : [],
      hours: typeof game.hours === 'number' ? game.hours : null, // audit-allow: modelo de lectura para render del detalle (SocialHub), no es escritura a canal público
      // Fecha unificada con el feed, por orden de fiabilidad: la de PUBLICACIÓN, `reviewedAt` (propia de la
      // reseña) y, en último lugar, el `_ts` del juego (que mueve cualquier edición).
      ts: publishedDate || Number(game.reviewedAt || 0) || (typeof game._ts === 'number' ? game._ts : 0),
    };
  }, [activePanel, selectedProfileDetail, profileReviewGameId]);

  /**
   * ¿EL EVENTO DEL DETALLE TODAVÍA PUEDE APARECER?
   *
   * `activeDetailEvent` se resuelve buscando dentro del directorio, así que llegar a `/social/user/…` por un
   * enlace directo, por una recarga o desde un aviso lo deja en `null` hasta que el directorio se hidrata. La
   * pantalla enseñaba entonces su variante de «no se ha encontrado»: un mensaje DEFINITIVO para un estado
   * TRANSITORIO, y a los pocos segundos la reseña aparecía de golpe.
   *
   * `directoryLoading` es el derivado que cubre la ventana ENTERA —resolver amistades, leer la caché y la
   * hidratación en vuelo—, que es justo la que hacía falta: el crudo se apagaba antes de tiempo y volvía a dejar
   * el «no se ha encontrado» a la vista. Ver su declaración en `useSocialDirectory`.
   */
  const detailEventLoading = activePanel === 'detail' && !activeDetailEvent && directoryLoading;

  /**
   * ¿EL PERFIL ABIERTO TODAVÍA PUEDE APARECER? Lo mismo que `detailEventLoading`, para `/social/profiles/:id`: el
   * perfil se resuelve contra el directorio, así que al recargar la página se quedaba en `null` hasta hidratarlo y
   * la pantalla decía «No se encontró el perfil» —definitivo— durante un estado transitorio.
   */
  const profileDetailLoading = (activePanel === 'profile-detail' || activePanel === 'profile-review')
    && Boolean(profileDetailId) && !selectedProfileDetail && directoryLoading;

  /**
   * ¿EL CUERPO DE LA RESEÑA ABIERTA TODAVÍA VIENE DE CAMINO?
   *
   * El detalle de una actividad se pinta con dos fuentes distintas y no llegan a la vez: la cabecera —juego,
   * autor, fecha, nota— sale del propio evento, que ya está en el directorio, y el ANÁLISIS COMPLETO (texto
   * entero, plataformas, géneros, puntos fuertes y débiles) vive en el gist de listados de esa persona, que se
   * baja aparte.
   *
   * Mientras no llegaba, la pantalla enseñaba el adelanto de 160 caracteres con el aviso de «esto es solo un
   * adelanto» y los cuatro bloques de chips vacíos: contenido real pero a medias, y un aviso que decía algo
   * FALSO —no era un adelanto, era que aún no había llegado—. Con esto, el cuerpo espera como esqueleto y el
   * aviso queda para cuando de verdad no hay nada más que el adelanto.
   *
   * Se calcula con las MISMAS condiciones que usa el efecto que baja el gist (unas líneas más abajo), y no con
   * un indicador de «en vuelo», a propósito: ese indicador lo enciende un efecto, que corre DESPUÉS de pintar,
   * así que habría un fotograma con el adelanto y el aviso antes de que empezara la espera. Preguntar «¿va a
   * llegar algo?» en vez de «¿está llegando?» no tiene ese hueco.
   */
  const detailReviewLoading = useMemo(() => {
    if (activePanel !== 'detail' || !activeDetailEvent) return false;
    const { profileId } = activeDetailEvent;
    // Reseña propia: el texto sale de los listados locales, que ya están.
    if (isOwnProfileIdentity(profileId, ownUid, ownProfileId)) return false;
    // Ya bajado. Aunque el juego no aparezca (su dueño esconde esa lista), no hay nada más que esperar.
    if (foreignGames[profileId]) return false;
    // Se intentó y no se pudo: a partir de aquí, el adelanto es lo que hay.
    if (foreignProfileFailed[profileId]) return false;
    const entry = directory.find((item) => item.id === profileId);
    // Sin gist de listados, o sin amistad, no se pide nada: tampoco hay nada que esperar.
    if (!entry?.gamesGistId || relationshipWith(entry.uid) !== 'friends') return false;
    return true;
  }, [
    activePanel, activeDetailEvent, ownUid, ownProfileId,
    foreignGames, foreignProfileFailed, directory, relationshipWith,
  ]);

  // Abre el DETALLE del perfil propio (vista pública con sus listados), no el editor. Si aún no existe entrada
  // propia en el directorio, cae al editor para que el usuario complete su perfil.
  const openOwnProfileDetail = useCallback(() => {
    // Por identidad, no por gist. Buscando por gist, un usuario sin canal social (`socialCfgGistId` vacío) casaba
    // con la PRIMERA entrada de id vacío —la de un desconocido— y "mi perfil" le abría el perfil de otro.
    const ownEntry = directory.find((entry) => isOwnProfileIdentity(entry.id, ownUid, ownProfileId));
    if (ownEntry) {
      void navigate(`/social/profiles/${encodeURIComponent(ownEntry.id)}`);
    } else {
      void navigate('/social/profile');
    }
  }, [ownUid, navigate, ownProfileId, directory]);

  const isOwnProfileDetail = useMemo(
    () => Boolean(selectedProfileDetail) && isOwnProfileIdentity(selectedProfileDetail!.id, ownUid, ownProfileId),
    [selectedProfileDetail, ownUid, ownProfileId],
  );

  /**
   * ¿La actividad abierta en el detalle es MÍA? Lo usa la pantalla para ofrecer compartir la reseña con un
   * enlace público, que solo tiene sentido sobre lo propio. Misma comprobación de identidad que el perfil, para
   * que no haya dos criterios de "esto es mío".
   */
  const isOwnDetailEvent = useMemo(
    () => isOwnProfileIdentity(activeDetailEvent?.profileId, ownUid, ownProfileId),
    [activeDetailEvent, ownUid, ownProfileId],
  );

  /** El mismo criterio de "esto es mío" que usan el perfil y el detalle, en forma de función reutilizable. */
  const isOwnProfileEntry = useCallback(
    (profileId: string) => isOwnProfileIdentity(profileId, ownUid, ownProfileId),
    [ownUid, ownProfileId],
  );

  /**
   * La reseña abierta, en la forma que necesita el bloque de RELACIONADAS. Sale de una pantalla o de la otra
   * según el panel, porque una reseña se lee por dos caminos: el detalle del feed y la lista de reseñas de un
   * perfil. Fuera de esos dos paneles es `null` y no se recolecta ninguna candidata.
   *
   * El autor se identifica con el `actorProfileId` DEL GIST en los dos casos. En el detalle viene en la propia
   * entrada; en la reseña de un perfil hay que buscarlo en su actividad, porque lo que la pantalla tiene a mano
   * es el id de la entrada del directorio —que para una amistad es su uid de Firebase— y son cosas distintas.
   */
  const activeReviewAnchor = useMemo<RelatedReviewAnchor | null>(() => {
    if (activePanel === 'detail' && activeDetailEvent) {
      return {
        gameName: activeDetailEvent.gameName,
        authorId: activeDetailEvent.actorProfileId,
        isOwn: isOwnDetailEvent,
        // Los géneros de la reseña abierta solo se conocen si su juego está en unos listados que tengamos: los
        // propios, o los de la amistad cuyo perfil se haya bajado. Si no, el bloque se relaciona por los otros
        // dos motivos y ya está.
        genres: getGameItemById(activeDetailEvent.profileId, activeDetailEvent.gameId)?.genres,
      };
    }
    if (activePanel === 'profile-review' && activeProfileReview && selectedProfileDetail) {
      const actorProfileId = (selectedProfileDetail.activity || []).find(
        (entry) => entry.type === 'review' && entry.gameId === activeProfileReview.id,
      )?.actorProfileId;
      return {
        gameName: activeProfileReview.name,
        authorId: String(actorProfileId || selectedProfileDetail.id || ''),
        isOwn: isOwnProfileDetail,
        genres: activeProfileReview.genres,
      };
    }
    return null;
  }, [
    activeDetailEvent,
    activePanel,
    activeProfileReview,
    getGameItemById,
    isOwnDetailEvent,
    isOwnProfileDetail,
    selectedProfileDetail,
  ]);

  const relatedReviews = useRelatedReviews({
    anchor: activeReviewAnchor,
    directory,
    localGames,
    foreignGames,
    isOwnProfile: isOwnProfileEntry,
    ownDisplayName,
  });

  // Amigo inactivo (su gist social no se leyó al hidratar el directorio, para no ocupar el feed ni gastar la
  // llamada) o cuyo gist no se pudo leer: al ABRIR su perfil sí se lee, para que su hero no salga a medias
  // (nombre/visibilidad/foto) y, sobre todo, para conocer lo que esconde: hasta entonces sus listados se filtran
  // como todo oculto. La actividad se deja fuera a propósito: el corte por inactividad es sobre el feed.
  useEffect(() => {
    if (activePanel !== 'profile-detail' && activePanel !== 'profile-review') return;
    if (!profileDetailId) return;
    const entry = directory.find((item) => item.id === profileDetailId);
    if (!(entry?.socialSkipped || entry?.socialUnreadable) || !entry.socialGistId) return;

    let cancelled = false;
    const token = getSocialSyncConfig()?.token || fallbackToken;
    void readPublicSocialGistById(entry.socialGistId, token)
      .then((socialData) => {
        if (cancelled) return;
        const showsPhoto = socialData.profile.visibility?.showPhoto !== false;
        patchDirectoryEntries((item) => item.id === profileDetailId, {
          displayName: socialData.profile.name || entry.displayName,
          photoURL: socialData.profile.photoURL || (showsPhoto ? entry.photoURL : ''),
          visibility: socialData.profile.visibility || defaultVisibility,
          socialSkipped: false,
          socialUnreadable: false,
        });
      })
      .catch(() => {
        /* best-effort: el perfil se queda index-only, como hasta ahora. */
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, defaultVisibility, fallbackToken, profileDetailId, directory, patchDirectoryEntries]);

  return {
    activeDetailEvent,
    selectedProfileDetail,
    activeProfileReview,
    getGameItemById,
    detailEventLoading,
    profileDetailLoading,
    detailReviewLoading,
    openOwnProfileDetail,
    isOwnProfileDetail,
    isOwnDetailEvent,
    relatedReviews,
  };
}
