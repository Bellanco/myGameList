import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { timeTicks } from '../../../core/stats/timeAxis';
import { formatMonthYear, formatTick } from './format';
import type { GameRef } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.wishlist;

/** Cuántos de los más antiguos se rotulan. Etiquetarlos todos convertiría la línea en un muro de texto. */
const LABELLED = 3;
/** Carriles disponibles a cada lado del eje. */
const LANES = 3;
/** Distancia mínima entre dos puntos del mismo carril, en % del eje. Menos que eso, se pisan. */
const MIN_GAP = 3.2;
/** Solo si TODO entró en el mismo instante no hay recorrido que representar. */
const NO_SPAN = 0;

interface Placed {
  game: GameRef;
  x: number;
  lane: number;
}

/**
 * Coloca cada juego en el primer carril donde no choque con el anterior.
 *
 * Repartir por el índice —`index % carriles`— parecía suficiente y no lo era: cuando media lista entra el
 * mismo día (lo típico tras una importación), todos esos puntos caen en la misma X y solo cuatro carriles fijos
 * los dejaban amontonados unos encima de otros. Aquí el carril se elige por CHOQUE: mientras haya sitio libre,
 * el punto sube o baja hasta encontrar hueco.
 */
function place(games: GameRef[], span: number, oldest: number): Placed[] {
  // Orden de carriles: centro, arriba, abajo, arriba del todo… así el enjambre crece equilibrado.
  const order = [0, -1, 1, -2, 2, -3, 3].slice(0, LANES * 2 + 1);
  const lastX = new Map<number, number>();

  return games.map((game) => {
    const x = span > 0 ? ((game.at - oldest) / span) * 100 : 50;
    const lane = order.find((candidate) => Math.abs(x - (lastX.get(candidate) ?? -Infinity)) >= MIN_GAP)
      // Si TODOS los carriles están ocupados a esa altura, se usa el que quedó más atrás.
      ?? order.reduce((best, candidate) => ((lastX.get(candidate) ?? -Infinity) < (lastX.get(best) ?? -Infinity) ? candidate : best), order[0]);
    lastX.set(lane, x);
    return { game, x, lane };
  });
}

/**
 * Línea de tiempo de la lista de próximos: un punto por juego, colocado en la fecha en que entró.
 *
 * Sustituye a las barras de "los que más llevan esperando" Y a la lista de "los últimos en llegar": en un solo
 * eje se ve quién lleva años esperando, quién acaba de entrar y cómo de repartidas están las altas, con sus
 * rachas y sus parones. Si todo entró a la vez no hay recorrido que representar y se enseña solo la lista: un
 * eje temporal en el que las posiciones no significan nada engaña más de lo que informa.
 */
export const WaitingTimeline = memo(function WaitingTimeline({ games }: { games: GameRef[] }) {
  const dated = games.filter((game) => game.at > 0);
  if (dated.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const oldest = dated[0].at;
  const newest = dated[dated.length - 1].at;
  const span = newest - oldest;
  const flat = span <= NO_SPAN;
  const placed = place(dated, span, oldest);

  // El eje se adapta al recorrido: días si las altas caben en una semana, meses si caben en un par de años y
  // años cuando la lista lleva media década. Así el dibujo ocupa siempre el ancho y transmite el periodo real.
  const ticks = timeTicks(oldest, newest).map((tick) => ({ ...tick, left: ((tick.at - oldest) / span) * 100 }));

  return (
    <div className="timeline">
      {flat ? null : (
        <>
          <div className="timeline-track">
            {ticks.map((tick) => (
              <span key={tick.at} className="timeline-year" style={{ left: `${tick.left}%` } as CSSProperties}>
                <b>{formatTick(tick.at, tick.unit)}</b>
              </span>
            ))}
            <span className="timeline-axis" />
            {placed.map((dot, index) => (
              <span
                key={dot.game.id}
                className={`timeline-dot${index < LABELLED ? ' is-old' : ''}`}
                title={`${dot.game.name} · ${formatMonthYear(dot.game.at)}`}
                style={{ left: `${dot.x}%`, '--lane': dot.lane, '--i': Math.min(index, 30) } as CSSProperties}
              />
            ))}
          </div>

          <div className="timeline-ends">
            <span>{formatMonthYear(oldest)}</span>
            <span>{formatMonthYear(newest)}</span>
          </div>
        </>
      )}

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
