// LO PROPIO QUE YA NO EXISTE AQUÍ: qué entradas de MI canal social describen un juego o una reseña que acabo de
// borrar en este dispositivo. Decisión PURA: sin React, sin red, sin gist.
//
// POR QUÉ EXISTE. El feed y la ficha pintan mi actividad desde mi gist social (vía el directorio y su caché de
// IndexedDB), y ese gist se pone al día DESPUÉS: la retirada viaja por red en segundo plano —o en la reconciliación
// al abrir el hub si falla—. Mientras tanto, quien acababa de borrar un juego o vaciar una reseña la seguía viendo en
// su propio feed, que es justo donde no puede parecer que no ha hecho caso. Mis amistades pueden recibirlo al
// actualizar; yo no: mi cambio tiene que verse al instante. Con esto el hub filtra lo que mis listas ya contradicen,
// sin esperar a nadie.
//
// EL CRITERIO ES CONSERVADOR A PROPÓSITO. Solo se oculta lo que las listas locales desmienten con un sello POSTERIOR
// a la publicación: una reseña escrita en otro dispositivo cuyos listados aún no han llegado aquí no se toca (para
// las listas de aquí, ese juego ni existe todavía). Es la misma regla que sigue `reconcileReviewActivity` para no
// retirar nada más nuevo que el reloj de los listados.

import { TAB_IDS, UNPLAYED_TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';

/** Lo que hace falta de una entrada de actividad para decidir. */
interface ActivityRef {
  type: string;
  gameId: number;
  updatedAt: number;
}

export interface OwnActivityGone {
  /** ¿Esta entrada de actividad propia ya no tiene reseña detrás en mis listas? */
  activity(entry: ActivityRef): boolean;
  /** ¿Este juego está borrado aquí después de `at` (y no ha vuelto)? Para los mensajes de lista. */
  game(gameId: number, at: number): boolean;
}

/**
 * Índice de lo que mis listas locales dan por desaparecido.
 *
 * - Juego BORRADO: no está en ninguna lista y tiene lápida con sello igual o posterior a la entrada. Una lápida más
 *   vieja que la entrada es de otra vida de ese id (se volvió a usar en otro dispositivo) y no cuenta.
 * - Reseña RETIRADA: el juego sigue, pero sin texto o en una lista sin reseña (próximos, deseados) —lo mismo que
 *   decide `decideReviewPublication` al guardar— y su `_ts` es igual o posterior a la publicación.
 */
export function ownActivityGone(games: Pick<TabData, TabId | 'deleted'>): OwnActivityGone {
  const present = new Map<number, { tab: TabId; game: GameItem }>();
  for (const tab of TAB_IDS) {
    for (const game of games[tab] || []) present.set(game.id, { tab, game });
  }
  const tombstones = new Map<number, number>();
  for (const dead of games.deleted || []) {
    tombstones.set(dead.id, Math.max(tombstones.get(dead.id) ?? 0, Number(dead._ts) || 0));
  }

  const game = (gameId: number, at: number): boolean => {
    if (present.has(gameId)) return false;
    const deletedAt = tombstones.get(gameId);
    return deletedAt !== undefined && deletedAt >= (Number(at) || 0);
  };

  const activity = (entry: ActivityRef): boolean => {
    const local = present.get(entry.gameId);
    if (!local) return game(entry.gameId, entry.updatedAt);
    if (entry.type !== 'review') return false;
    if ((Number(local.game._ts) || 0) < (Number(entry.updatedAt) || 0)) return false;
    return UNPLAYED_TAB_IDS.includes(local.tab) || !String(local.game.review || '').trim();
  };

  return { activity, game };
}
