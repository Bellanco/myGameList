import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatMonthYear } from './format';
import type { GameRef } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.wishlist;

/** Cuántos de los más antiguos se rotulan. Etiquetarlos todos convertiría la línea en un muro de texto. */
const LABELLED = 3;
/** Carriles verticales para separar puntos que caen casi en la misma fecha. */
const LANES = 4;

/**
 * Línea de tiempo de la lista de próximos: un punto por juego, colocado en la fecha en que entró.
 *
 * Sustituye a las barras de "los que más llevan esperando" Y a la lista de "los últimos en llegar": en un solo
 * eje se ve quién lleva años esperando, quién acaba de entrar y —lo que ningún ranking de cinco enseñaba— cómo
 * de repartidas están las altas en el tiempo, con sus rachas y sus parones.
 */
export const WaitingTimeline = memo(function WaitingTimeline({ games }: { games: GameRef[] }) {
  const dated = games.filter((game) => game.at > 0);
  if (dated.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const oldest = dated[0].at;
  const newest = dated[dated.length - 1].at;
  const span = newest - oldest;
  const at = (game: GameRef) => (span > 0 ? ((game.at - oldest) / span) * 100 : 50);

  // Los años que caen dentro del rango, como referencia del eje.
  const firstYear = new Date(oldest).getFullYear();
  const lastYear = new Date(newest).getFullYear();
  const years: Array<{ year: number; left: number }> = [];
  for (let year = firstYear + (span > 0 ? 1 : 0); year <= lastYear; year += 1) {
    const stamp = new Date(year, 0, 1).getTime();
    if (stamp >= oldest && stamp <= newest) years.push({ year, left: ((stamp - oldest) / span) * 100 });
  }

  return (
    <div className="timeline">
      <div className="timeline-track">
        {years.map((tick) => (
          <span key={tick.year} className="timeline-year" style={{ left: `${tick.left}%` } as CSSProperties}>
            <b>{tick.year}</b>
          </span>
        ))}
        <span className="timeline-axis" />
        {dated.map((game, index) => (
          <span
            key={game.id}
            className={`timeline-dot${index < LABELLED ? ' is-old' : ''}`}
            title={`${game.name} · ${formatMonthYear(game.at)}`}
            style={{ left: `${at(game)}%`, '--lane': index % LANES, '--i': Math.min(index, 30) } as CSSProperties}
          />
        ))}
      </div>

      <div className="timeline-ends">
        <span>{formatMonthYear(oldest)}</span>
        <span>{formatMonthYear(newest)}</span>
      </div>

      {/* Los más antiguos, con nombre: son los que la tarjeta promete señalar. */}
      <ol className="timeline-list">
        {dated.slice(0, LABELLED).map((game) => (
          <li key={game.id}>
            <span className="timeline-name" title={game.name}>{game.name}</span>
            <span className="timeline-since">{L.waitingSince(formatMonthYear(game.at))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
});
