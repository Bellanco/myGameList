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

  // El eje lo fijan LAS DOS series, no solo los terminados: con un género que se deja más veces de las que se
  // acaba (5 abandonos frente a 2 finales), el máximo salía de la serie equivocada y su punto se colocaba en el
  // 138% —fuera del carril, fuera de la tarjeta y con scroll horizontal en toda la vista—.
  const max = Math.max(...rows.flatMap((row) => [row.completed, row.abandoned]), 1);
  // Margen a los lados: el punto tiene diámetro y su cifra va centrada encima, así que un valor colocado en el
  // 100% exacto se salía del carril —y con él, de la tarjeta y de la pantalla, forzando scroll horizontal.
  const INSET = 6;
  const at = (value: number) => INSET + (value / max) * (100 - INSET * 2);

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
