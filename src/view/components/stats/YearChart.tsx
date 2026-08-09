import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { YearBucket } from '../../../core/stats/types';
import type { YearMetric } from '../../../viewmodel/useStatsViewModel';
import { formatCount, formatHours } from './format';

const L = UI_MESSAGES.stats.years;

interface YearChartProps {
  years: YearBucket[];
  metric: YearMetric;
  onMetricChange: (metric: YearMetric) => void;
}

function valueOf(bucket: YearBucket, metric: YearMetric): number {
  return metric === 'hours' ? bucket.hours : bucket.completed;
}

/**
 * Columnas por año. Las barras son `div`s con una altura en porcentaje y no un `<svg>`: escalan solas con el
 * contenedor, heredan los colores de la paleta y no hay que medir nada en JS.
 *
 * A11y: la gráfica va `aria-hidden` y los datos se exponen en una tabla `sr-only`. Una etiqueta única para
 * veinte barras sería impracticable de escuchar, y la tabla se recorre celda a celda como cualquier otra.
 */
export const YearChart = memo(function YearChart({ years, metric, onMetricChange }: YearChartProps) {
  if (years.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  // El máximo fija el 100% de altura. Nunca es 0 aquí salvo que todas las horas estén a cero (biblioteca sin
  // horas registradas): en ese caso las barras quedan al mínimo visible en vez de dividir por cero.
  const max = years.reduce((top, bucket) => Math.max(top, valueOf(bucket, metric)), 0);

  return (
    <>
      <div className="stats-metric-switch" role="group" aria-label={L.metricAria}>
        <button
          type="button"
          className={`btn btn-toggle${metric === 'games' ? ' active' : ''}`}
          aria-pressed={metric === 'games'}
          onClick={() => onMetricChange('games')}
        >
          <span>{L.metricGames}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${metric === 'hours' ? ' active' : ''}`}
          aria-pressed={metric === 'hours'}
          onClick={() => onMetricChange('hours')}
        >
          <span>{L.metricHours}</span>
        </button>
      </div>

      <div className="year-chart" aria-hidden="true">
        {years.map((bucket) => {
          const value = valueOf(bucket, metric);
          const height = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
          const label = bucket.year === null ? L.noYear : String(bucket.year);
          return (
            <div className="year-col" key={label}>
              <span className="year-col-value">{metric === 'hours' ? formatHours(value) : formatCount(value)}</span>
              <div className="year-col-track">
                <div
                  className={`year-col-bar${bucket.year === null ? ' is-undated' : ''}`}
                  style={{ '--bar-height': `${height}%` } as CSSProperties}
                />
              </div>
              <span className="year-col-label">{label}</span>
            </div>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>{L.chartAria(metric === 'hours' ? L.metricHours : L.metricGames)}</caption>
        <thead>
          <tr>
            <th scope="col">{L.colYear}</th>
            <th scope="col">{L.colGames}</th>
            <th scope="col">{L.colHours}</th>
          </tr>
        </thead>
        <tbody>
          {years.map((bucket) => (
            <tr key={bucket.year === null ? 'sin-anyo' : bucket.year}>
              <th scope="row">{bucket.year === null ? L.noYear : bucket.year}</th>
              <td>{formatCount(bucket.completed)}</td>
              <td>{formatHours(bucket.hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {years.some((bucket) => bucket.year === null) ? <p className="stats-note">{L.noYearHint}</p> : null}
    </>
  );
});
