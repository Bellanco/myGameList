import { memo, useId, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import { formatDecimal } from './format';
import { STARS_MAX } from '../../../core/utils/scoreScale';
import type { ScoreScale } from '../../../core/utils/scoreScale';
import type { YearSummary } from '../../../core/stats/types';

/** Años que se apilan. En una tarjeta a un tercio de ancho, seis crestas son las que caben sin apretarse. */
const MAX_YEARS = 6;
/** Un año necesita esta cantidad de notas para que su silueta signifique algo. */
const MIN_SCORED = 4;

const ROW = 34;
const WIDTH = 300;
/** El hueco de la derecha carga la media Y el recuento, así que necesita sitio para «75,0 · 20 juegos». */
const PAD = { left: 42, right: 96, top: 10 };
/** Alto de la cresta más alta. El resto se escala contra ella. */
const PEAK = 26;

interface Ridge {
  year: number;
  /** Reparto por tramos del año, en proporción sobre su propio total. */
  shares: number[];
  scored: number;
  avgGrade: number;
}

/** Curva suave que pasa por los puntos (Catmull-Rom → Bézier), para que la cresta no sea un zigzag. */
function ridgePath(points: Array<{ x: number; y: number }>): string {
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const tension = 0.2;
    path += `C${current.x + (next.x - previous.x) * tension},${current.y + (next.y - previous.y) * tension} ${next.x - (after.x - current.x) * tension},${next.y - (after.y - current.y) * tension} ${next.x},${next.y}`;
  }
  return path;
}

/**
 * FUERA DEL PANEL POR AHORA. La pieza está terminada y probada, pero no se monta: el panel ya tiene tres formas
 * hablando de notas (el enjambre de la distribución, la tira del gráfico anual y la cifra de exigencia) y esta
 * era la cuarta. Se conserva entera —cálculo, textos y estilos— porque la decisión es de encuadre, no de
 * calidad, y volver a montarla es añadir su bloque a `OWN_STATS_BLOCKS` y a `StatsPanel`.
 *
 * ¿PUNTÚAS MÁS DURO CON LOS AÑOS? Un *ridgeline*: una cresta por año con el reparto de sus notas, apiladas para
 * compararlas de un vistazo.
 *
 * El histograma general (`Beeswarm`) enseña dónde caen TODAS tus notas, pero funde treinta años en una sola
 * figura y con eso no se puede responder a lo único que interesa aquí: si el criterio se ha movido. Apilando un
 * año por fila, la respuesta es la forma —crestas que se desplazan a la derecha con el tiempo son notas que
 * suben— y no hace falta leer ni una cifra.
 *
 * Cada cresta se normaliza contra SU PROPIO total, no contra el año más prolífico: si no, un año de siete juegos
 * sería una raya plana al lado de otro de veinticuatro y parecería que ese año no puntuaste, cuando lo que pasa
 * es que jugaste menos. Lo que se compara es la FORMA del reparto; la cantidad va escrita al lado.
 *
 * No usa un cálculo propio: sale de `byYear`, que el panel ya tiene montado para las pestañas de año.
 */
export const GradeRidge = memo(function GradeRidge({ years, scale }: { years: YearSummary[]; scale: ScoreScale }) {
  const L = useStatsLabels().ridge;
  const focus = useChartFocus();
  const gradientId = useId();

  const ridges: Ridge[] = years
    .filter((year) => year.scored >= MIN_SCORED)
    .slice(0, MAX_YEARS)
    .map((year) => {
      const counts = year.grades.map((bucket) => bucket.count);
      const total = counts.reduce((sum, count) => sum + count, 0) || 1;
      return {
        year: year.year,
        shares: counts.map((count) => count / total),
        scored: year.scored,
        avgGrade: year.avgGrade,
      };
    });

  if (ridges.length < 2) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const height = PAD.top + ridges.length * ROW + 26;
  const step = (WIDTH - PAD.left - PAD.right) / STARS_MAX;
  const ceiling = Math.max(...ridges.flatMap((ridge) => ridge.shares)) || 1;
  const inScale = (grade: number) => (scale === 'grade' ? formatDecimal(grade) : formatDecimal(grade / 20));
  /**
   * UNA SOLA ESCALA en toda la pieza: si la cuenta puntúa sobre 100, el eje va en puntos y la media también; si
   * puntúa con estrellas, las dos en estrellas. Mezclarlas —un eje de estrellas con una media sobre 100— obliga a
   * traducir mentalmente entre dos números que hablan de lo mismo.
   */
  const unit = scale === 'grade' ? ` ${L.points}` : '★';
  const axisLabel = (index: number) =>
    scale === 'grade' ? String(years[0]?.grades[index]?.floor ?? '') : `${index + 1}★`;

  const shown = ridges.find((ridge) => String(ridge.year) === focus.active) || null;
  // En reposo habla el año MÁS RECIENTE: es el que contesta a la pregunta del título.
  const resting = ridges[0];
  const detailOf = (ridge: Ridge) => L.yearAria(ridge.year, inScale(ridge.avgGrade), ridge.scored);

  // La frase de tendencia compara el año más antiguo con el más nuevo de los que se dibujan.
  const oldest = ridges[ridges.length - 1];
  const drift = resting.avgGrade - oldest.avgGrade;
  // La magnitud se dice en la MISMA escala que el resto de la pieza: «4,3 puntos» al lado de un eje de estrellas
  // obliga a traducir mentalmente entre dos formas de decir lo mismo.
  const driftAmount = `${inScale(Math.abs(drift))}${scale === 'grade' ? ` ${L.points}` : '★'}`;
  const trend = Math.abs(drift) < 3 ? L.trendFlat : drift > 0 ? L.trendUp(driftAmount) : L.trendDown(driftAmount);

  return (
    <div className="grade-ridge">
      {/* La cifra manda: el listón del año más reciente, que es lo que contesta al título. La figura, al pie. */}
      <div className="stat-card-lead">
        <span className="stat-card-label">{L.latest(resting.year)}</span>
        <strong className="stat-card-value">
          {inScale(resting.avgGrade)}
          <small>{unit}</small>
        </strong>
        <span className="stat-card-hint">{trend}</span>
      </div>

      <div className="stat-card-figure">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="grade-ridge-svg" role="group" aria-label={L.chartAria}>
        <defs>
          {/* Un degradado horizontal por la rampa de NOTA: la silueta se tiñe de rojo a verde según dónde caiga.
              El color deja de ser decorativo y dice lo mismo que la posición, que es lo que hace que un año
              flojo se distinga de uno bueno sin leer la cifra. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" className="grade-ridge-stop-1" />
            <stop offset="30%" className="grade-ridge-stop-2" />
            <stop offset="55%" className="grade-ridge-stop-3" />
            <stop offset="78%" className="grade-ridge-stop-4" />
            <stop offset="100%" className="grade-ridge-stop-5" />
          </linearGradient>
        </defs>
        {ridges.map((ridge, row) => {
          const base = PAD.top + row * ROW + 20;
          // Con anclas a cero medio paso antes del 1★ y medio después del 5★: sin ellas la curva termina a la
          // altura del último tramo y el relleno se corta en vertical, como si el gráfico estuviera recortado.
          const points = [
            { x: PAD.left, y: base },
            ...ridge.shares.map((share, index) => ({
              x: PAD.left + step * (index + 0.5),
              y: base - (share / ceiling) * PEAK,
            })),
            { x: PAD.left + step * STARS_MAX, y: base },
          ];
          const line = ridgePath(points);
          const area = `${line} L${points[points.length - 1].x},${base} L${points[0].x},${base} Z`;
          return (
            <g
              key={ridge.year}
              className={`grade-ridge-row${focus.stateOf(String(ridge.year))}`}
              style={{ '--i': row } as CSSProperties}
              {...focus.controlProps(String(ridge.year), detailOf(ridge))}
            >
              <line className="grade-ridge-base" x1={PAD.left} y1={base} x2={WIDTH - PAD.right} y2={base} />
              <path className="grade-ridge-area" d={area} fill={`url(#${gradientId})`} />
              <path className="grade-ridge-line" d={line} />
              <text className="grade-ridge-year" x={PAD.left - 10} y={base + 4} textAnchor="end">
                {ridge.year}
              </text>
              {/* Media y recuento, cada uno con su unidad. Antes ponía «75,0 · 20» y no había forma de saber qué
                  era cada número ni en qué escala estaba el primero. */}
              <text className="grade-ridge-value" x={WIDTH - PAD.right + 10} y={base + 1}>
                {inScale(ridge.avgGrade)}
                {unit}
              </text>
              <text className="grade-ridge-count" x={WIDTH - PAD.right + 10} y={base + 13}>
                {L.games(ridge.scored)}
              </text>
              {/* Objetivo de toda la fila: las crestas son finas y hay que poder señalarlas con el dedo. */}
              <rect className="grade-ridge-hit" x={PAD.left} y={base - ROW + 6} width={WIDTH - PAD.left - PAD.right} height={ROW} />
            </g>
          );
        })}
        {Array.from({ length: STARS_MAX }, (_unused, index) => (
          <text
            key={index}
            className="grade-ridge-axis"
            x={PAD.left + step * (index + 0.5)}
            y={height - 8}
            textAnchor="middle"
          >
            {axisLabel(index)}
          </text>
        ))}
        {scale === 'grade' ? (
          <text className="grade-ridge-axis" x={WIDTH - PAD.right + 10} y={height - 8}>
            {L.points}
          </text>
        ) : null}
      </svg>

      </div>

      <ChartDetail>
        {shown ? <span>{detailOf(shown)}</span> : <ChartDetailHint>{L.hint}</ChartDetailHint>}
      </ChartDetail>
    </div>
  );
});
