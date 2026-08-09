import { memo, useId, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { CUMULATIVE_WINDOW, accumulate, fillMonthGaps } from '../../../core/stats/months';
import { formatCount, formatMonthLabel } from './format';
import type { ArrivalPoint } from '../../../core/stats/types';
import type { TabId } from '../../../model/types/game';

const L = UI_MESSAGES.stats.backlog;

/** Orden de apilado, de abajo arriba: lo ya cerrado primero y lo que aún espera arriba. */
const SERIES: TabId[] = ['c', 'v', 'e', 'p'];

/** Por debajo de esta cantidad de meses se rotula mes a mes y se marcan los puntos; por encima, años. */
const SHORT_SERIES = 15;
/** Series cortas: sin suavizado. Una curva entre tres puntos se inventa una forma que el dato no tiene. */
const SMOOTH_FROM = 6;

interface BacklogAreaProps {
  points: ArrivalPoint[];
  /** `real` = instantáneas registradas (tamaño de las listas); `derived` = altas deducidas de `listedAt`. */
  mode: 'real' | 'derived';
}

interface Point {
  x: number;
  y: number;
}

/** Trazado suave por cuadráticas entre puntos medios: no se pasa de frenada ni inventa picos ni bajadas. */
function linePath(points: Point[], smooth: boolean): string {
  if (points.length === 0) return '';
  const head = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 1) return head;
  if (!smooth) return `${head} ${points.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}`;

  let d = head;
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += ` Q ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return `${d} Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
}

/** Escala "bonita" para la rejilla: 1, 2, 5, 10, 20, 50… por encima del máximo. */
function niceStep(max: number, lines: number): number {
  const raw = Math.max(max / lines, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Evolución del backlog: área apilada ACUMULADA, una banda por lista.
 *
 * Dos decisiones que son la diferencia entre que esto se lea o no:
 *
 *  1. **Acumulado, no altas por mes.** Las altas mensuales de una biblioteca real son números pequeños y
 *     erráticos, y como área daban una sierra ilegible. Acumuladas describen lo que la tarjeta promete —cómo
 *     ha ido creciendo cada lista— y terminan justo en el tamaño de hoy.
 *  2. **El dibujo se estira, el texto no.** El área va en un SVG sin relación de aspecto (`preserveAspectRatio
 *     = none`) para ocupar todo el ancho disponible, y los ejes y rótulos son HTML por fuera. Con todo dentro
 *     del SVG, estirarlo agrandaba los años y engordaba los trazos de forma grotesca.
 *
 * Con pocos meses —lo normal recién estrenado el registro— no se suaviza la línea y se marcan los puntos, para
 * que tres datos parezcan tres datos y no una curva inventada.
 */
export const BacklogArea = memo(function BacklogArea({ points, mode }: BacklogAreaProps) {
  const gradientId = useId();
  // El histórico real ya son tamaños absolutos; la curva derivada son altas y hay que acumularlas.
  const filled = fillMonthGaps(points, CUMULATIVE_WINDOW);
  const series = mode === 'real' ? filled : accumulate(filled);

  if (series.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const totals = series.map((point) => point.c + point.v + point.e + point.p);
  const max = Math.max(...totals, 1);
  const step = niceStep(max, 4);
  const top = Math.ceil(max / step) * step;
  const gridValues: number[] = [];
  for (let value = step; value <= top; value += step) gridValues.push(value);

  const single = series.length === 1;
  const x = (index: number) => (single ? 100 : (index * 100) / (series.length - 1));
  const y = (value: number) => 100 - (value / top) * 100;
  const smooth = series.length >= SMOOTH_FROM;
  const showDots = series.length <= SHORT_SERIES;

  // Fronteras acumuladas: cada banda va entre la suma de las anteriores y la suma incluyéndola.
  const stacks: number[][] = [];
  let running = series.map(() => 0);
  for (const tab of SERIES) {
    running = running.map((value, index) => value + series[index][tab]);
    stacks.push([...running]);
  }

  // Rótulos del eje: mes a mes en series cortas; el año, en las largas.
  const ticks = showDots
    ? series.map((point, index) => ({ index, label: formatMonthLabel(point.m) }))
    : series
      .map((point, index) => ({ index, label: point.m.slice(0, 4) }))
      .filter((tick, index, all) => index === 0 || tick.label !== all[index - 1].label);

  return (
    <div className="backlog">
      <ul className="stats-legend">
        {SERIES.map((tab) => (
          <li key={tab}>
            <span className={`stats-legend-dot is-${tab}`} aria-hidden="true" />
            {L.lists[tab]}
          </li>
        ))}
      </ul>

      <div className="backlog-plot" aria-hidden="true">
        <div className="backlog-yaxis">
          {gridValues.map((value) => (
            <span key={value} className="backlog-ytick" style={{ '--y': `${y(value)}%` } as CSSProperties}>
              {formatCount(value)}
            </span>
          ))}
        </div>

        <div className="backlog-canvas">
          {gridValues.map((value) => (
            <span key={value} className="backlog-gridline" style={{ '--y': `${y(value)}%` } as CSSProperties} />
          ))}

          <svg className="backlog-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              {SERIES.map((tab) => (
                <linearGradient key={tab} id={`${gradientId}-${tab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className={`backlog-stop-top is-${tab}`} />
                  <stop offset="100%" className={`backlog-stop-bottom is-${tab}`} />
                </linearGradient>
              ))}
            </defs>

            <g className="backlog-reveal">
              {SERIES.map((tab, layer) => {
                const upper = stacks[layer].map((value, index) => ({ x: x(index), y: y(value) }));
                const lower = layer === 0
                  ? series.map((_unused, index) => ({ x: x(index), y: y(0) }))
                  : stacks[layer - 1].map((value, index) => ({ x: x(index), y: y(value) }));
                // La vuelta por la frontera inferior es el mismo trazado al revés, con su `M` convertida en `L`
                // para que enlace con la ida en lugar de empezar un subtrazado nuevo.
                const back = linePath([...lower].reverse(), smooth).replace(/^M/, 'L');
                return (
                  <g key={tab}>
                    <path className={`backlog-fill is-${tab}`} d={`${linePath(upper, smooth)} ${back} Z`} fill={`url(#${gradientId}-${tab})`} />
                    <path className={`backlog-line is-${tab}`} d={linePath(upper, smooth)} vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Los puntos van en HTML y no en el SVG: dentro se deformarían en óvalos al estirar el lienzo. */}
          {showDots ? series.map((point, index) => (
            SERIES.map((tab, layer) => (
              point[tab] > 0 ? (
                <span
                  key={`${point.m}-${tab}`}
                  className={`backlog-dot is-${tab}`}
                  style={{ left: `${x(index)}%`, top: `${y(stacks[layer][index])}%` }}
                />
              ) : null
            ))
          )) : null}

          {/* Zonas de paso del ratón: una por mes, con su desglose. Puro CSS, sin estado ni escuchas. */}
          <div className="backlog-hits">
            {series.map((point, index) => (
              <div className="backlog-hit" key={point.m}>
                <div className={`backlog-tip${index > series.length / 2 ? ' is-left' : ''}`}>
                  <strong>{formatMonthLabel(point.m)}</strong>
                  {SERIES.map((tab) => (
                    <span key={tab}>
                      <i className={`stats-legend-dot is-${tab}`} />
                      {L.lists[tab]}
                      <b>{formatCount(point[tab])}</b>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="backlog-xaxis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick.label} className="backlog-xtick" style={{ left: `${x(tick.index)}%` } as CSSProperties}>
            {tick.label}
          </span>
        ))}
      </div>

      {/* La alternativa textual va envuelta en un `div.sr-only`: la clase sobre la propia `<table>` no la oculta
          —en una tabla, `height` es un MÍNIMO y `overflow` no la recorta—, así que con series largas la tabla
          crecía de verdad y añadía miles de píxeles de scroll invisible a la página. */}
      <div className="sr-only">
        <table>
        <caption>{L.tableAria}</caption>
        <thead>
          <tr>
            <th scope="col">{L.colMonth}</th>
            {SERIES.map((tab) => <th scope="col" key={tab}>{L.lists[tab]}</th>)}
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.m}>
              <th scope="row">{formatMonthLabel(point.m)}</th>
              {SERIES.map((tab) => <td key={tab}>{formatCount(point[tab])}</td>)}
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      <p className="stats-note">{mode === 'real' ? L.realNote : L.derivedNote}</p>
    </div>
  );
});
