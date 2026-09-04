// Recolector de candidatas para el bloque de reseñas RELACIONADAS: junta lo que ya está en memoria y se lo da
// al módulo puro que las ordena (`core/social/relatedReviews`).
//
// NO LEE NADA. Ni una llamada de red, ni una lectura de gist: todo sale del directorio social ya hidratado y de
// los listados locales. Es lo que permite que el bloque aparezca al instante bajo la reseña y que abrir una
// relacionada no cueste más que abrirla desde el feed.
//
// DOS PUERTAS, UNA MISMA COLA. Las reseñas llegan del canal social (la actividad del directorio, que solo trae
// el adelanto de ≤160) y de la biblioteca local (con el texto entero). Las propias entran por las dos y el
// módulo puro las funde quedándose con la completa; las propias que NUNCA se publicaron entran solo por la
// segunda, y valen igual: son tuyas y solo las ves tú, así que ofrecerlas no enseña nada a nadie.
//
// COSTE. El tope del canal es de 50 perfiles × 320 entradas, así que la cola se arma UNA vez por sesión de
// lectura y se reutiliza mientras el directorio y los listados no cambien. Sin reseña abierta no se arma nada:
// mientras se navega el feed, este hook no hace trabajo.
import { useMemo } from 'react';
import {
  rankRelatedReviews,
  reviewNameKey,
  type RelatedReview,
  type RelatedReviewAnchor,
  type RelatedReviewCandidate,
} from '../../core/social/relatedReviews';
import { resolveGrade, starsFromGrade } from '../../core/utils/scoreScale';
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import type { SocialActivityFeedItem } from './socialFeed';

/** Lo único que este hook necesita de una entrada del directorio (mismo criterio que `useSocialFeed`). */
type RelatedSource = { id: string; activity?: SocialActivityFeedItem[] };

export interface UseRelatedReviewsInput {
  /** La reseña abierta. `null` mientras no haya ninguna: entonces no se arma la cola de candidatas. */
  anchor: RelatedReviewAnchor | null;
  directory: ReadonlyArray<RelatedSource>;
  /** Listados propios: aportan tus reseñas (publicadas o no) y el grueso del índice de géneros. */
  localGames: TabData;
  /** Listados de perfiles ajenos ya bajados. Solo aportan géneros: sus reseñas ya vienen por el canal. */
  foreignGames: Record<string, Record<TabId, GameItem[]>>;
  /** ¿Esa entrada del directorio es la del usuario? Se recibe hecha para no duplicar el criterio de identidad. */
  isOwnProfile: (profileId: string) => boolean;
  /** Cómo se firma la reseña propia en la tarjeta. */
  ownDisplayName: string;
}

/**
 * Fecha con la que se ordena una reseña PROPIA que aún no ha pasado por el canal.
 *
 * `reviewedAt` es la fecha del texto y la que muestra la pestaña Reseñas; `_ts` es el reloj del merge y lo mueve
 * cualquier edición, pero es lo único que hay en los juegos anteriores a ese campo. Aproximar con él es
 * preferible a dejar la reseña fuera del bloque por no tener fecha.
 */
function ownReviewTimestamp(game: GameItem): number {
  return Number(game.reviewedAt || 0) || Number(game._ts || 0);
}

/** Añade los géneros de un juego al índice sin pisar lo que ya hubiera: la primera fuente en llegar manda. */
function indexGenres(index: Map<string, string[]>, game: { name?: string; genres?: string[] }): void {
  const key = reviewNameKey(String(game?.name || ''));
  const genres = Array.isArray(game?.genres) ? game.genres.filter(Boolean) : [];
  if (!key || genres.length === 0 || index.has(key)) {
    return;
  }
  index.set(key, genres);
}

export function useRelatedReviews({
  anchor,
  directory,
  localGames,
  foreignGames,
  isOwnProfile,
  ownDisplayName,
}: UseRelatedReviewsInput): RelatedReview[] {
  const hasAnchor = Boolean(anchor);

  const candidates = useMemo<RelatedReviewCandidate[]>(() => {
    if (!hasAnchor) {
      return [];
    }

    const collected: RelatedReviewCandidate[] = [];

    // Puerta 1 — el canal social. Toda la actividad de tipo reseña del directorio, que por construcción es la de
    // las amistades y la propia: el gist de un no-amigo no se lee, así que aquí no puede haber nada que quien
    // mira no pudiera ver ya en su feed.
    for (const entry of directory) {
      const isOwn = isOwnProfile(entry.id);
      for (const item of entry.activity || []) {
        if (item.type !== 'review') {
          continue;
        }
        collected.push({
          // El id de la entrada es único dentro de SU gist, no entre gists (el feed mezcla autores), así que la
          // clave de render tiene que combinarlo con el perfil de origen.
          key: `channel:${entry.id}:${item.id || item.key || item.gameId}`,
          gameId: Number(item.gameId || 0),
          gameName: String(item.gameName || ''),
          // El pseudónimo del GIST, no el id de la entrada del directorio: son identificadores distintos de la
          // misma persona, y el detalle de una reseña se resuelve por el primero (ver `openMoveReview`).
          authorId: String(item.actorProfileId || ''),
          authorName: String(item.profileDisplayName || item.actorName || ''),
          isOwn,
          rating: Number(item.rating || 0),
          grade: typeof item.grade === 'number' ? item.grade : null,
          snippet: String(item.snippet || ''),
          updatedAt: Number(item.updatedAt || 0),
        });
      }
    }

    // Puerta 2 — la biblioteca. Cualquier juego con texto, esté en la lista que esté y se haya publicado o no.
    for (const tab of TAB_IDS) {
      for (const game of localGames?.[tab] || []) {
        const review = String(game?.review || '').trim();
        if (!review || !String(game?.name || '').trim()) {
          continue;
        }
        collected.push({
          key: `local:${game.id}`,
          gameId: Number(game.id || 0),
          gameName: String(game.name),
          // Da igual lo que se ponga: la identidad propia se compara por `isOwn`, precisamente porque la misma
          // reseña llega con dos ids distintos según la puerta por la que entre.
          authorId: `local:${game.id}`,
          authorName: ownDisplayName,
          isOwn: true,
          rating: starsFromGrade(resolveGrade(game)),
          grade: typeof game.grade === 'number' ? game.grade : null,
          snippet: review,
          updatedAt: ownReviewTimestamp(game),
          full: true,
        });
      }
    }

    return collected;
  }, [directory, hasAnchor, isOwnProfile, localGames, ownDisplayName]);

  // Índice de géneros por nombre de juego. Los géneros NO viajan por el canal social (las listas compartidas
  // quedan vacías para perfiles ajenos, decisión E3), así que solo se conocen de estas dos fuentes y la
  // cobertura es necesariamente parcial: un juego que no tengas y cuyo perfil no hayas abierto no tiene género.
  // La biblioteca propia se indexa primero porque es la fuente sin filtrar; la ajena llega ya recortada por la
  // visibilidad de su dueño.
  const genresByName = useMemo(() => {
    const index = new Map<string, string[]>();
    if (!hasAnchor) {
      return index;
    }
    for (const tab of TAB_IDS) {
      for (const game of localGames?.[tab] || []) {
        indexGenres(index, game);
      }
    }
    for (const lists of Object.values(foreignGames || {})) {
      for (const tab of TAB_IDS) {
        for (const game of lists?.[tab] || []) {
          indexGenres(index, game);
        }
      }
    }
    return index;
  }, [foreignGames, hasAnchor, localGames]);

  return useMemo(
    () => (anchor ? rankRelatedReviews(anchor, candidates, genresByName) : []),
    [anchor, candidates, genresByName],
  );
}
