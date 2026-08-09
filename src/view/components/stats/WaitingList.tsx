import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatMonthYear } from './format';
import type { GameRef } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.wishlist;

interface WaitingListProps {
  games: GameRef[];
  /** Alta más reciente de TODA la lista de próximos; hace de "ahora" para medir la espera. */
  reference?: number;
}

/**
 * Los juegos que llevan más tiempo esperando, con una barra proporcional a lo que llevan.
 *
 * La referencia es la última alta de la lista y no el reloj del sistema: así el cálculo sigue siendo puro y,
 * sobre todo, la comparación es correcta. Midiendo solo dentro de estos cinco, el quinto salía con la barra a
 * cero —como si acabara de llegar— cuando en realidad también lleva años esperando.
 */
export const WaitingList = memo(function WaitingList({ games, reference = 0 }: WaitingListProps) {
  const dates = games.map((game) => game.at).filter((at) => at > 0);
  const oldest = dates.length ? Math.min(...dates) : 0;
  const newest = Math.max(reference, ...(dates.length ? dates : [0]));
  const span = newest - oldest;

  return (
    <ul className="waiting-list">
      {games.map((game, index) => {
        // Sin margen entre fechas (todos llegaron a la vez) todas las barras van llenas: comparar no aporta.
        const ratio = span > 0 && game.at > 0 ? (newest - game.at) / span : 1;
        return (
          <li key={game.id} style={{ '--i': index, '--wait': `${Math.max(ratio * 100, 6)}%` } as CSSProperties}>
            <span className="waiting-name" title={game.name}>{game.name}</span>
            <span className="waiting-bar" aria-hidden="true"><span className="waiting-fill" /></span>
            <span className="waiting-since">{game.at > 0 ? L.waitingSince(formatMonthYear(game.at)) : ''}</span>
          </li>
        );
      })}
    </ul>
  );
});
