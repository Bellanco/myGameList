import type { GameItem, TabId } from '../model/types/game';
import { resolveGrade, type ScoreScale } from '../core/utils/scoreScale';

export interface ListHeaderFigures {
  count: number;
  /** Suma de horas de la lista; `null` en Próximos, que aún no se han jugado. */
  hours: number | null;
  /** Nota media en la escala activa; `null` fuera de Completados o sin ningún juego puntuado. */
  avg: number | null;
}

/**
 * Las cifras de la CABECERA DE PANTALLA de una lista (`ScreenHeader`).
 *
 * La nota media sale con la misma cuenta que la ficha del panel (`computeStats`): solo los juegos con nota
 * EFECTIVA (`resolveGrade` > 0, no el flag `scored`) y en la escala que haya elegido el usuario —estrellas sobre 5 o
 * nota sobre 100—. Si las dos cuentas divergieran, la misma lista diría dos medias distintas según la pantalla.
 */
export function listHeaderFigures(tab: TabId, games: readonly GameItem[], scale: ScoreScale): ListHeaderFigures {
  let hours = 0;
  let gradeSum = 0;
  let graded = 0;
  for (const game of games) {
    const h = Number(game.hours);
    if (Number.isFinite(h) && h > 0) hours += h;
    const grade = resolveGrade(game);
    if (grade > 0) {
      gradeSum += grade;
      graded += 1;
    }
  }
  const avgGrade = graded ? gradeSum / graded : 0;
  return {
    count: games.length,
    hours: tab === 'p' ? null : hours,
    avg: tab === 'c' && graded ? (scale === 'grade' ? avgGrade : avgGrade / 20) : null,
  };
}
