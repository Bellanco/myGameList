// Lo que cuenta el RENGLÓN de una persona en «Perfiles» (`/social/profiles`), además de su nombre: qué ha hecho
// últimamente un amigo y, para la administración, hace cuánto entró. Puro, sin React ni textos: los textos están en
// `socialLabels`.
import type { SocialMoveEntry } from './moveActivity';

/**
 * Lo que se cuenta en el renglón de un amigo: un juego y qué hizo con él. Las listas son las de siempre (`e` jugando,
 * `c` terminado, `v` abandonado, `p` próximos, `d` deseados) y `review`, que ha publicado su análisis.
 */
export type RowActivityKind = 'e' | 'c' | 'v' | 'p' | 'd' | 'review';

export interface RowActivity {
  kind: RowActivityKind;
  gameName: string;
}

type MoveLike = Pick<SocialMoveEntry, 'gameId' | 'gameName' | 'tab' | 'at'>;
type ReviewLike = { type: string; gameName: string; createdAt: number; updatedAt: number };

const LIST_KINDS: ReadonlySet<string> = new Set(['e', 'c', 'v', 'p', 'd']);

/**
 * ¿QUÉ SE CUENTA DE UN AMIGO? Todo sale de lo que el feed ya tiene cargado de él: no cuesta ninguna lectura. Y solo de
 * lo que publica: sus listas ocultas van aparte (`hiddenMoves`) y aquí no entran. Por orden:
 *
 *  1. A QUÉ JUEGA o qué acaba de terminar: el más reciente de sus mensajes de lista que diga «En curso» o
 *     «Completados» (30 días). Es lo que más dice de alguien.
 *  2. Si no, LO ÚLTIMO QUE MOVIÓ, a la lista que sea: lo que añadió a Próximos o a Deseados, o lo que abandonó
 *     (14-10-2026: un renglón sin nada parecía roto).
 *  3. Si en 30 días no ha movido nada, SU ÚLTIMA RESEÑA, que no caduca con esa ventana.
 *  4. Si tampoco, SU ÚLTIMO COMPLETADO (`lastCompleted`, ver `lastCompletedGame`). Sale de su biblioteca entera, que
 *     solo se baja para la administración (14-10-2026): para el resto, el renglón se queda sin esa línea.
 *
 * De cada juego cuenta su ÚLTIMO mensaje, no uno suelto: quien empezó algo el lunes y lo abandonó el miércoles no lo
 * está jugando, aunque el «empezó» siga en su canal. Sin nada de eso, `null`: un amigo inactivo, cuyo canal no se
 * lee, o alguien que no ha publicado nada.
 */
export function rowActivity(
  moves: readonly MoveLike[],
  activity: readonly ReviewLike[] = [],
  lastCompleted: string | null = null,
): RowActivity | null {
  const lastPerGame = new Map<string, MoveLike>();
  for (const move of moves) {
    if (!LIST_KINDS.has(move.tab) || !move.gameName.trim()) continue;
    const key = move.gameId ? String(move.gameId) : move.gameName.trim().toLowerCase();
    const previous = lastPerGame.get(key);
    if (!previous || move.at > previous.at) lastPerGame.set(key, move);
  }
  const latest = (pick: (move: MoveLike) => boolean): MoveLike | null => {
    let best: MoveLike | null = null;
    for (const move of lastPerGame.values()) if (pick(move) && (!best || move.at > best.at)) best = move;
    return best;
  };
  const move = latest((m) => m.tab === 'e' || m.tab === 'c') || latest(() => true);
  if (move) return { kind: move.tab as RowActivityKind, gameName: move.gameName.trim() };

  let review: ReviewLike | null = null;
  for (const item of activity) {
    if (item.type !== 'review' || !item.gameName.trim()) continue;
    const at = item.createdAt || item.updatedAt;
    if (!review || at > (review.createdAt || review.updatedAt)) review = item;
  }
  if (review) return { kind: 'review', gameName: review.gameName.trim() };
  return lastCompleted && lastCompleted.trim() ? { kind: 'c', gameName: lastCompleted.trim() } : null;
}

type CompletedLike = { name: string; finishedOn?: string; years?: readonly number[] };

/**
 * EL ÚLTIMO QUE TERMINÓ, de su lista de completados ya filtrada (`applyProfileVisibility`). Manda `finishedOn`
 * —`AAAA-MM-DD` para la administración, `AAAA-MM` para el resto; se comparan como texto—, que ya viene sin los días de
 * carga en bloque. Sin él en ningún juego, el de su año más reciente (`years`). En un empate, el primero de la lista.
 */
export function lastCompletedGame(games: readonly CompletedLike[]): string | null {
  let best: CompletedLike | null = null;
  for (const game of games) {
    if (!game.name?.trim() || !game.finishedOn) continue;
    if (!best || game.finishedOn > (best.finishedOn || '')) best = game;
  }
  if (best) return best.name.trim();

  let bestYear = -Infinity;
  for (const game of games) {
    if (!game.name?.trim()) continue;
    const year = Math.max(...(game.years || []).filter(Number.isFinite), -Infinity);
    if (year > bestYear) {
      bestYear = year;
      best = game;
    }
  }
  return best && Number.isFinite(bestYear) ? best.name.trim() : null;
}

/**
 * HACE CUÁNTOS DÍAS DE CALENDARIO, en la hora local: lo de anoche a las once es «ayer» aunque hayan pasado dos horas.
 * `null` si no hay dato (`lastActiveAt` es 0 en un amigo cuyo perfil no se deja leer): sin dato no se dice nada.
 */
export function calendarDaysAgo(ts: number, now: number = Date.now()): number | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const dayStart = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  // `round` y no `floor`: un día con cambio de hora mide 23 o 25 horas.
  return Math.max(0, Math.round((dayStart(now) - dayStart(ts)) / 86_400_000));
}
