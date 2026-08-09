import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { fillMonthGaps } from '../../../core/stats/months';
import { formatCount, formatMonthLabel } from './format';
import type { ArrivalPoint } from '../../../core/stats/types';
import type { TabId } from '../../../model/types/game';

const L = UI_MESSAGES.stats.backlog;

/** Orden de apilado: de abajo arriba, del final del recorrido al principio. */
const SERIES: TabId[] = ['c', 'v', 'e', 'p'];

interface BacklogChartProps {
  points: ArrivalPoint[];
  /** `real` = instantáneas registradas (tamaño de las listas); `derived` = entradas deducidas de `listedAt`. */
  mode: 'real' | 'derived';
}

/**
 * Evolución del backlog: una columna por mes, repartida entre las cuatro listas.
 *
 * Sirve a las DOS fuentes posibles con el mismo dibujo, porque la lectura es la misma (cuánto y cómo se
 * reparte, mes a mes) y lo único que cambia es qué significa la altura: en el histórico real, el tamaño de
 * cada lista a cierre de mes; en la curva derivada, cuántos juegos de los que hoy están en cada lista entraron
 * ese mes. El pie de la tarjeta lo dice con todas las letras: sin esa nota, la aproximación se leería como un
 * histórico que no es.
 */
export const BacklogChart = memo(function BacklogChart({ points, mode }: BacklogChartProps) {
  const months = fillMonthGaps(points);
  if (months.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const totals = months.map((point) => point.c + point.v + point.e + point.p);
  const max = Math.max(...totals, 1);

  return (
    <>
      <ul className="stats-legend">
        {SERIES.map((tab) => (
          <li key={tab}>
            <span className={`stats-legend-dot is-${tab}`} aria-hidden="true" />
            {L.lists[tab]}
          </li>
        ))}
      </ul>

      <div className="month-chart" aria-hidden="true">
        {months.map((point, index) => {
          const total = totals[index];
          // Con veinticuatro columnas no caben veinticuatro etiquetas: se rotula una de cada tres y la última.
          const labelled = index % 3 === 0 || index === months.length - 1;
          return (
            <div className="month-col" key={point.m}>
              <div className="month-col-track" title={`${formatMonthLabel(point.m)} · ${formatCount(total)}`}>
                <div className="month-col-stack" style={{ height: `${(total / max) * 100}%` }}>
                  {SERIES.map((tab) => (
                    point[tab] > 0 ? (
                      <span
                        key={tab}
                        className={`month-col-seg is-${tab}`}
                        style={{ '--seg': `${(point[tab] / total) * 100}%` } as CSSProperties}
                      />
                    ) : null
                  ))}
                </div>
              </div>
              <span className={`month-col-label${labelled ? '' : ' is-hidden'}`}>{formatMonthLabel(point.m)}</span>
            </div>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>{L.tableAria}</caption>
        <thead>
          <tr>
            <th scope="col">{L.colMonth}</th>
            {SERIES.map((tab) => <th scope="col" key={tab}>{L.lists[tab]}</th>)}
          </tr>
        </thead>
        <tbody>
          {months.map((point) => (
            <tr key={point.m}>
              <th scope="row">{formatMonthLabel(point.m)}</th>
              {SERIES.map((tab) => <td key={tab}>{formatCount(point[tab])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="stats-note">{mode === 'real' ? L.realNote : L.derivedNote}</p>
    </>
  );
});
