import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatCount, formatPercent } from './format';
import type { ShameSummary } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.shame;

/**
 * Mancuernas: por cada género, dos puntos unidos por una varilla —los que terminaste y los que dejaste— sobre
 * un eje común de número de juegos.
 *
 * Dice de una vez las dos cosas que antes necesitaban dos gráficos: el VOLUMEN (dónde caen los puntos en el
 * eje) y la PROPORCIÓN (cuánto separa a los dos puntos). Y al ir sobre un eje compartido, los géneros se
 * comparan entre sí sin tener que leer los números.
 */
export const Dumbbell = memo(function Dumbbell({ rows }: { rows: ShameSummary['abandonRate'] }) {
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((row) => row.completed), 1);
  const at = (value: number) => (value / max) * 100;

  return (
    <>
      <ul className="dumbbell">
        {rows.map((row, index) => (
          <li key={row.tag} style={{ '--i': index } as CSSProperties}>
            <span className="dumbbell-tag" title={row.tag}>{row.tag}</span>
            <span className="dumbbell-track">
              <span
                className="dumbbell-bar"
                style={{ left: `${at(Math.min(row.abandoned, row.completed))}%`, width: `${Math.abs(at(row.completed) - at(row.abandoned))}%` }}
              />
              <span className="dumbbell-dot is-abandoned" style={{ left: `${at(row.abandoned)}%` }}>
                <span className="dumbbell-num">{formatCount(row.abandoned)}</span>
              </span>
              <span className="dumbbell-dot is-completed" style={{ left: `${at(row.completed)}%` }}>
                <span className="dumbbell-num">{formatCount(row.completed)}</span>
              </span>
            </span>
            <span className="dumbbell-rate">{formatPercent(row.percent)}%</span>
          </li>
        ))}
      </ul>

      <ul className="stats-legend">
        <li><span className="stats-legend-dot is-c" aria-hidden="true" />{L.legendCompleted}</li>
        <li><span className="stats-legend-dot is-v" aria-hidden="true" />{L.legendAbandoned}</li>
      </ul>
    </>
  );
});
