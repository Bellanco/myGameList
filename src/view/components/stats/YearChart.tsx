import { memo, useId, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { YearBucket } from '../../../core/stats/types';
import type { YearMetric } from '../../../viewmodel/useStatsViewModel';
import type { ScoreScale } from '../../../core/utils/scoreScale';
import { formatCount, formatHours } from './format';

const L = UI_MESSAGES.stats.years;

/** Cuántas etiquetas de año caben en el eje sin apelotonarse (en pantalla estrecha, el CSS aún quita la mitad). */
const AXIS_LABELS = 8;
/** Altura del lienzo en unidades del `viewBox`; el ancho es 100. */
const H = 100;
/** Aire por arriba, para que el punto más alto no se coma el borde ni su rótulo. */
const TOP_ROOM = 12;

interface YearChartProps {
  years: YearBucket[];
  metric: YearMetric;
  onMetricChange: (metric: YearMetric) => void;
  /**
   * ¿Se puede cambiar de métrica? En el panel de un amigo no: las horas no viajan por el canal social, así que
   * el conmutador solo llevaría a un gráfico vacío.
   */
  switchable?: boolean;
  /**
   * Abrir el resumen de un año al pinchar su punto. Es un ATAJO al selector de arriba, no su sustituto: quien
   * está mirando la curva y ve un año que le llama la atención lo abre desde ahí mismo. Sin este callback los
   * puntos son adorno y no se anuncian como pulsables.
   */
  onSelectYear?: (year: number) => void;
  /** Escala de la cuenta: decide si los extremos de la tira se rotulan en estrellas o sobre 100. */
  scale?: ScoreScale;
}

function valueOf(bucket: YearBucket, metric: YearMetric): number {
  return metric === 'hours' ? bucket.hours : bucket.completed;
}

/**
 * Los tramos de la tira, de arriba abajo: 5★ arriba y 1★ abajo, como una escala de verdad. Cada nivel tiene su
 * propio color de la rampa de puntuación (ver `stats.scss`).
 *
 * Los completados SIN nota no pintan: un juego terminado lleva su puntuación, y reservarles un trozo gris en
 * cada barra metía en la escala algo que no es una nota. El dato no se pierde —sigue en la tabla de abajo—,
 * simplemente no ocupa sitio en una figura que habla de notas.
 */
const BANDS = [5, 4, 3, 2, 1].map((stars) => ({
  key: `s${stars}`,
  label: L.quality.stars(stars),
  of: (bucket: YearBucket) => bucket.stars[stars - 1],
}));

/**
 * Curva suave por los puntos de la serie. Las bézier se apoyan en el punto medio horizontal entre cada par, que
 * es el suavizado que no se pasa de frenada: nunca inventa un pico por encima del año más alto ni un valle por
 * debajo del más bajo, cosa que sí hace un Catmull-Rom con tensión alta.
 */
function curveThrough(points: Array<{ x: number; y: number }>): string {
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    const midX = (points[i - 1].x + points[i].x) / 2;
    d += ` C ${midX.toFixed(2)} ${points[i - 1].y.toFixed(2)} ${midX.toFixed(2)} ${points[i].y.toFixed(2)} ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return d;
}

/**
 * Evolución por años: una CURVA con el total del año y, debajo, una TIRA con el reparto por nota de ese año,
 * columna a columna y alineada con la curva.
 *
 * Por qué una curva y no las columnas de antes: veinte años en columnas obligaban a desplazar el gráfico a lo
 * ancho y a leer veinte valores sueltos; la línea enseña la forma —cuándo jugaste más y cuándo paraste— de un
 * vistazo y cabe entera. Y por qué la tira aparte y no una curva apilada por nota: son dos preguntas distintas
 * (cuánto y qué tal) y cada una merece su escala; apilada, las capas de arriba son ilegibles.
 *
 * A11y: la figura va `aria-hidden` y los datos se exponen en una tabla `sr-only` que ahora incluye también el
 * reparto por nota, que es lo que la tira añade. La animación de entrada la gobierna la tarjeta
 * (`useRevealOnScroll` la mantiene en pausa hasta que se llega a ella) y desaparece con `prefers-reduced-motion`.
 */
export const YearChart = memo(function YearChart({ years, metric, onMetricChange, switchable = true, onSelectYear, scale = 'stars' }: YearChartProps) {
  const grade = scale === 'grade';
  // Un id por instancia: el degradado del área es un `<defs>` y en el panel de un amigo hay otro gráfico igual.
  const fillId = useId();

  if (years.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  // La serie va de más antiguo a más reciente (el tiempo avanza a la derecha), al revés que los cubos, que
  // llegan del más reciente al más antiguo. El cajón "sin año" no es un punto del eje: sale a un chip aparte.
  const undated = years.find((bucket) => bucket.year === null) || null;
  const series = years.filter((bucket) => bucket.year !== null).slice().reverse();

  if (series.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const max = series.reduce((top, bucket) => Math.max(top, valueOf(bucket, metric)), 0) || 1;
  const span = series.length - 1 || 1;
  const points = series.map((bucket, index) => ({
    bucket,
    x: (index / span) * 100,
    y: H - (valueOf(bucket, metric) / max) * (H - TOP_ROOM),
  }));

  const line = curveThrough(points);
  const area = `${line} L 100 ${H} L 0 ${H} Z`;
  const peak = points.reduce((best, point) => (valueOf(point.bucket, metric) > valueOf(best.bucket, metric) ? point : best), points[0]);
  const axisStep = Math.max(1, Math.ceil(series.length / AXIS_LABELS));
  const format = metric === 'hours' ? formatHours : formatCount;
  const metricName = metric === 'hours' ? L.metricHours.toLowerCase() : L.metricGames.toLowerCase();
  // Tres marcas en la escala: el máximo, la mitad y cero. Más líneas en un lienzo de 13 rem es reja, no guía.
  const ticks = [max, max / 2, 0];

  return (
    <>
      {switchable ? (
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
      ) : null}

      <div className="year-trend" aria-hidden="true">
        <div className="year-trend-canvas">
          {/* Solo la marca de arriba lleva la unidad: dice de qué va la escala sin repetirla tres veces. */}
          <div className="year-trend-scale">
            {ticks.map((value, index) => (
              <span key={value} style={{ top: `${((H - (value / max) * (H - TOP_ROOM)) / H) * 100}%` } as CSSProperties}>
                {format(value)}{index === 0 ? <em>{metricName}</em> : null}
              </span>
            ))}
          </div>

          <div className="year-trend-plot">
            {/* `preserveAspectRatio="none"`: el lienzo se estira con la tarjeta y la curva con él. Por eso los
                puntos, los rótulos y la escala son HTML —dentro del SVG saldrían deformados. */}
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" focusable="false">
              <defs>
                <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                  <stop className="year-fill-top" offset="0%" />
                  <stop className="year-fill-bottom" offset="100%" />
                </linearGradient>
              </defs>
              <g className="year-grid">
                {ticks.map((value) => {
                  const y = H - (value / max) * (H - TOP_ROOM);
                  return <line key={value} x1="0" x2="100" y1={y} y2={y} />;
                })}
              </g>
              <path className="year-area" d={area} fill={`url(#${fillId})`} />
              <path className="year-line" d={line} />
            </svg>

            {points.map((point, index) => {
              const year = point.bucket.year as number;
              const summary = `${year}: ${format(valueOf(point.bucket, metric))} ${metricName}`;
              const style = { left: `${point.x}%`, top: `${point.y}%`, '--i': index } as CSSProperties;
              const className = `year-node${point === peak ? ' is-peak' : ''}`;

              // Con callback, el punto es un ATAJO para abrir ese año con el ratón o el dedo. Va fuera del
              // recorrido de teclado (`tabIndex={-1}`) a propósito: toda la figura está en `aria-hidden`, y un
              // control enfocable dentro de una región oculta es una trampa para un lector de pantalla. Quien
              // navega con teclado tiene el mismo atajo —y todos los años— en el selector de arriba.
              return onSelectYear ? (
                <button
                  key={year}
                  type="button"
                  tabIndex={-1}
                  className={`${className} is-link`}
                  style={style}
                  title={summary}
                  onClick={() => onSelectYear(year)}
                />
              ) : (
                // El dato exacto al pasar por encima; la vía principal sigue siendo la tabla de abajo.
                <span key={year} className={className} style={style} title={summary} />
              );
            })}

            {/* La cifra va ENCIMA de su punto, no al lado: a un lado se montaba sobre la propia línea y había
                tramos donde la curva desaparecía detrás del rótulo. El récord va marcado. */}
            {points.map((point, index) => (
              <span
                key={point.bucket.year}
                className={`year-value${point === peak ? ' is-peak' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%`, '--i': index } as CSSProperties}
              >
                {format(valueOf(point.bucket, metric))}
              </span>
            ))}
          </div>
        </div>

        <div className="year-axis">
          {points.map((point, index) => (
            index % axisStep === 0 || index === points.length - 1 ? (
              <span key={point.bucket.year} style={{ left: `${point.x}%` } as CSSProperties}>{point.bucket.year}</span>
            ) : null
          ))}
        </div>

        {/* Tira de calidad: comparte la proyección de la curva —cada columna centrada en la x de su año— para
            que se puedan leer juntas sin buscar la correspondencia. Los dos extremos de la escala van
            rotulados en la calle de la izquierda: es todo lo que hace falta para saber leerla. */}
        <div className="year-strip">
          {points.map((point, index) => {
            const bucket = point.bucket;
            return (
              <div
                key={bucket.year}
                className="year-strip-col"
                // El tope de ancho no es capricho: media barra de las de los extremos vuela fuera del lienzo,
                // y solo cabe en el margen de la tarjeta si la barra es estrecha.
                style={{ left: `${point.x}%`, width: `${Math.min((100 / span) * 0.52, 3.2)}%`, '--i': index } as CSSProperties}
              >
                {BANDS.map((band) => {
                  const count = band.of(bucket);
                  if (count === 0) return null;
                  return (
                    <span
                      key={band.key}
                      className={`year-strip-seg is-${band.key}`}
                      style={{ flexGrow: count } as CSSProperties}
                      title={L.quality.cell(String(bucket.year), band.label, count, bucket.completed)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bajo la tira, solo la escala de color: los mismos cinco pasos que se apilan en cada barra. La frase que
            había aquí explicaba lo que la propia regleta ya dice. */}
        <div className="year-strip-foot">
          <p className="year-scale">
            <span>{L.quality.low(grade)}</span>
            <i className="year-scale-ramp" />
            <span>{L.quality.high(grade)}</span>
          </p>
        </div>
      </div>

      {/* La alternativa textual va envuelta en un `div.sr-only`: la clase sobre la propia `<table>` no la oculta
          —en una tabla, `height` es un MÍNIMO y `overflow` no la recorta—, así que con series largas la tabla
          crecía de verdad y añadía miles de píxeles de scroll invisible a la página. */}
      <div className="sr-only">
        <table>
          <caption>{L.chartAria(metric === 'hours' ? L.metricHours : L.metricGames)}</caption>
          <thead>
            <tr>
              <th scope="col">{L.colYear}</th>
              <th scope="col">{L.colGames}</th>
              <th scope="col">{L.colHours}</th>
              {BANDS.map((band) => <th key={band.key} scope="col">{band.label}</th>)}
              {/* La tabla sí conserva los completados sin nota: la figura no los pinta, pero el dato existe y
                  aquí es donde se puede consultar todo. */}
              <th scope="col">{L.quality.unscored}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((bucket) => (
              <tr key={bucket.year === null ? 'sin-anyo' : bucket.year}>
                <th scope="row">{bucket.year === null ? L.noYear : bucket.year}</th>
                <td>{formatCount(bucket.completed)}</td>
                <td>{formatHours(bucket.hours)}</td>
                {BANDS.map((band) => <td key={band.key}>{formatCount(band.of(bucket))}</td>)}
                <td>{formatCount(bucket.unscored)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="stats-note">
        {L.peak(peak.bucket.year as number, format(valueOf(peak.bucket, metric)), metricName)}
        {undated ? ` · ${L.noYearChip(format(valueOf(undated, metric)), metricName)}` : ''}
      </p>
    </>
  );
});
