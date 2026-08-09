import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { ScoreDisplay } from '../ScoreDisplay';
import { formatHours, formatMonthYear } from './format';
import type { GameRef } from '../../../core/stats/types';

interface GameRefListProps {
  games: GameRef[];
  /** Qué se muestra a la derecha de cada juego. */
  meta?: 'grade' | 'hours' | 'since';
  /** Numera las filas (para los rankings del año). */
  ranked?: boolean;
}

/**
 * Listado compacto de juegos (rankings del año, últimos abandonos, los que más esperan). La nota va por
 * `ScoreDisplay`, que ya elige estrellas o aro según la escala de la cuenta: la misma que en los listados.
 */
export const GameRefList = memo(function GameRefList({ games, meta = 'grade', ranked = false }: GameRefListProps) {
  return (
    <ol className={`game-ref-list${ranked ? ' is-ranked' : ''}`}>
      {games.map((game, index) => (
        <li key={game.id}>
          {ranked ? <span className="game-ref-rank" aria-hidden="true">{index + 1}</span> : null}
          <span className="game-ref-name" title={game.name}>{game.name}</span>
          {meta === 'grade' && game.grade > 0 ? <ScoreDisplay game={{ grade: game.grade }} /> : null}
          {meta === 'hours' ? (
            <span className="game-ref-meta">
              {game.hours > 0 ? `${formatHours(game.hours)} h` : UI_MESSAGES.stats.year.noHours}
            </span>
          ) : null}
          {meta === 'since' && game.at > 0 ? (
            <span className="game-ref-meta">{UI_MESSAGES.stats.wishlist.waitingSince(formatMonthYear(game.at))}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
});
