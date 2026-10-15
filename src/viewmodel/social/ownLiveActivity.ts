// MI ENTRADA DEL DIRECTORIO, AL DÍA CON MIS LISTAS: aplica `core/social/ownActivityGone` a la entrada propia para
// que el feed, la ficha y el detalle dejen de pintar al instante lo que acabo de borrar, sin esperar a que el gist
// social se reescriba. Solo toca la entrada PROPIA; las ajenas, y la propia cuando no hay nada que quitar, salen con
// la MISMA referencia para no recalcular el feed por nada.
import { ownActivityGone } from '../../core/social/ownActivityGone';
import type { TabData } from '../../model/types/game';
import type { SocialMoveFeedItem } from './socialFeed';

/** Lo que se toca de una entrada del directorio (el resto viaja intacto). */
interface OwnEntryShape {
  id: string;
  activity: Array<{ type: string; gameId: number; updatedAt: number }>;
  moves: SocialMoveFeedItem[];
  hiddenMoves?: SocialMoveFeedItem[];
}

/**
 * Devuelve el directorio con la entrada propia filtrada contra las listas locales VIVAS:
 * fuera las reseñas retiradas y la actividad de juegos borrados, fuera los mensajes de lista de juegos borrados, y
 * sin enlace a la reseña en los mensajes de un juego cuya reseña ya no está.
 */
export function withOwnLiveActivity<E extends OwnEntryShape>(
  directory: E[],
  isOwn: (entryId: string) => boolean,
  games: TabData | null | undefined,
): E[] {
  if (!games || directory.length === 0) return directory;
  const index = directory.findIndex((entry) => isOwn(entry.id));
  if (index < 0) return directory;

  const own = directory[index];
  const gone = ownActivityGone(games);
  const activity = own.activity.filter((entry) => !gone.activity(entry));
  const retiredReviews = new Set(
    own.activity.filter((entry) => entry.type === 'review' && !activity.includes(entry)).map((entry) => entry.gameId),
  );

  const liveMoves = (moves: SocialMoveFeedItem[]): SocialMoveFeedItem[] => {
    let changed = false;
    const next: SocialMoveFeedItem[] = [];
    for (const move of moves) {
      if (gone.game(move.gameId, move.at)) {
        changed = true;
        continue;
      }
      if (move.reviewActorId && retiredReviews.has(move.gameId)) {
        changed = true;
        next.push({ ...move, reviewActorId: undefined });
        continue;
      }
      next.push(move);
    }
    return changed ? next : moves;
  };

  const moves = liveMoves(own.moves);
  const hiddenMoves = own.hiddenMoves ? liveMoves(own.hiddenMoves) : own.hiddenMoves;
  if (activity.length === own.activity.length && moves === own.moves && hiddenMoves === own.hiddenMoves) {
    return directory;
  }

  const next = directory.slice();
  // El filtro devuelve el tipo base de la restricción; los elementos son los mismos objetos de `own`.
  next[index] = { ...own, activity, moves, ...(hiddenMoves ? { hiddenMoves } : {}) } as E;
  return next;
}
