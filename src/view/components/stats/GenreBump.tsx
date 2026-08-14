import { memo, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import type { GenreRanks, GenreRankSeries } from '../../../core/stats/types';

const ROW = 38;
const PAD_Y = { top: 22, bottom: 34 };
/** Alto de la banda de «fuera de la tabla», al pie del gráfico. */
const OUT_ROW = 32;
const DOT = 5;
/** Separación mínima entre dos rótulos laterales; por debajo se leen como uno solo. */
const LABEL_GAP = 15;

/**
 * Espacio reservado a cada lado para los nombres.
 *
 * Se calcula con el nombre MÁS LARGO en vez de fijarlo: con un ancho fijo, un género como «Estrategia en tiempo
 * real» se salía del lienzo y se cortaba a media palabra. Aproximar el ancho del texto por el número de
 * caracteres basta —no hay que ajustar nada al píxel, solo garantizar que cabe— y evita medir en el DOM, que
 * obligaría a pintar dos veces.
 */
const CHAR_WIDTH = 6.4;
const LABEL_MIN = 76;
const LABEL_MAX = 190;
function labelWidth(tags: string[]): number {
  const longest = tags.reduce((max, tag) => Math.max(max, tag.length), 0);
  return Math.min(LABEL_MAX, Math.max(LABEL_MIN, longest * CHAR_WIDTH + 16));
}

/**
 * Margen izquierdo. Los nombres van SOLO a la derecha —a la izquierda repetían los mismos siete rótulos y
 * doblaban el ruido—, así que este lado solo tiene que dar cabida al rótulo de la banda de descartados.
 */
const LEFT = 96;

/** Ancho del lienzo. Se estira con los años para que dos puntos nunca queden pegados. */
function widthFor(years: number, right: number): number {
  return LEFT + right + Math.max(180, (years - 1) * 56);
}

/**
 * Trazo suave que pasa por todos los puntos (Catmull-Rom convertido a Bézier).
 *
 * La tensión es baja a propósito (0,2): la curva redondea el paso de un puesto a otro sin abombarse, así que
 * nunca se aleja de la recta lo bastante como para insinuar un puesto por el que no se pasó.
 */
function smooth(points: Array<{ x: number; y: number }>, from = 0, to = points.length - 1): string {
  if (to - from < 1) return '';
  let path = `M${points[from].x},${points[from].y}`;
  for (let index = from; index < to; index += 1) {
    // Los vecinos salen SIEMPRE del recorrido completo, aunque este trozo empiece más adelante: es lo que hace
    // que un tramo suelto tenga la misma curvatura que tendría dentro de la línea entera. Calculándolo solo con
    // sus dos extremos saldría recto, y la línea cambiaría de idioma a mitad de camino.
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const t = 0.2;
    // Los tiradores se ACOTAN al rango vertical del tramo. Sin esto, tras varios años seguidos en el mismo
    // puesto la curva se pasa de largo al saltar al siguiente —el rebote de Catmull-Rom— y dibuja una panza que
    // insinúa un puesto por el que nunca se pasó. Con el clamp, la curva redondea el codo y nada más.
    const low = Math.min(current.y, next.y);
    const high = Math.max(current.y, next.y);
    const clamp = (value: number) => Math.min(high, Math.max(low, value));
    const c1 = clamp(current.y + (next.y - previous.y) * t);
    const c2 = clamp(next.y - (after.y - current.y) * t);
    path += `C${current.x + (next.x - previous.x) * t},${c1} ${next.x - (after.x - current.x) * t},${c2} ${next.x},${next.y}`;
  }
  return path;
}

/**
 * Parte el recorrido en tramos según estén DENTRO de la tabla o fuera.
 *
 * El trazo que cruza la banda de descartados se dibuja aparte y discontinuo: recto y sólido se leía como un
 * puesto más —una raya firme a lo largo de varios años—, cuando lo que dice es justo lo contrario, que ahí no
 * hubo nada. El tramo de entrada y el de salida se incluyen en el trozo de fuera, que es donde ocurre el cambio.
 */
function split(
  points: GenreRankSeries['points'],
  coords: Array<{ x: number; y: number }>,
): { inside: string; outside: string } {
  let inside = '';
  let outside = '';
  // Los tramos de dentro se agrupan en RACHAS antes de suavizar: curvando cada segmento por separado, cada
  // curva pierde de vista a sus vecinas y el trazo sale quebrado, que es lo contrario de lo que se busca.
  let runStart = -1;
  const flush = (end: number) => {
    if (runStart >= 0 && end > runStart) inside += smooth(coords, runStart, end);
    runStart = -1;
  };
  for (let index = 0; index < points.length - 1; index += 1) {
    if (points[index].games > 0 && points[index + 1].games > 0) {
      if (runStart < 0) runStart = index;
      continue;
    }
    flush(index);
    // El tramo de fuera se suaviza igual que el resto: lo que lo distingue es el guion, no la geometría.
    outside += smooth(coords, index, index + 1);
  }
  flush(points.length - 1);
  return { inside, outside };
}

/** Recorrido de un género entre el primer año en que aparece y el último: la frase que resume su línea. */
function travel(series: GenreRankSeries): { from: number; to: number; delta: number; present: boolean } {
  const present = series.points.filter((point) => point.games > 0);
  if (present.length === 0) return { from: 0, to: 0, delta: 0, present: false };
  const from = present[0].rank;
  const to = present[present.length - 1].rank;
  return { from, to, delta: from - to, present: true };
}

/**
 * Reparte en vertical los rótulos que caerían unos encima de otros.
 *
 * Hace falta porque en una misma columna puede haber varios géneros a la misma altura: todos los que ese año
 * están FUERA de la tabla comparten la banda del pie. Sin repartir, sus nombres se imprimen uno sobre otro y no
 * se lee ninguno —que es justo lo que pasaba—. Se empuja hacia abajo desde el más alto, conservando el orden.
 */
function spread(values: number[]): number[] {
  const order = values
    .map((y, index) => ({ y, index }))
    .filter((entry) => Number.isFinite(entry.y))
    .sort((a, b) => a.y - b.y);
  let previous = -Infinity;
  for (const entry of order) {
    entry.y = Math.max(entry.y, previous + LABEL_GAP);
    previous = entry.y;
  }
  const out = values.slice();
  for (const entry of order) out[entry.index] = entry.y;
  return out;
}

/**
 * CÓMO CAMBIA TU GUSTO: el puesto de cada género, año a año. Un *bump chart*.
 *
 * Es la pieza que le faltaba al panel: todo lo demás retrata la biblioteca de HOY —cuánto has jugado, qué te
 * gusta, qué abandonas—, y ninguna contaba que el gusto se mueve. Aquí una línea que sube dice «esto lo he
 * descubierto» y una que cae, «esto lo he dejado atrás», sin leer una sola cifra.
 *
 * El eje Y es el PUESTO (1.º arriba), no la cantidad, y ese es el motivo de elegir esta forma: comparar cuentas
 * de años con distinta cosecha —veinticuatro juegos en 2025 frente a siete en 2024— haría que el año flojo
 * pareciera un desplome de todos los géneros a la vez. El puesto es relativo a su propio año y no tiene ese
 * problema.
 *
 * LOS QUE SE CAEN DE LA TABLA tienen su sitio: la banda del pie. Un género sin juegos ese año no ocupa ningún
 * puesto, así que dibujarle uno mentiría, y partir la línea perdía el recorrido —desaparecía sin decir a dónde—.
 * Bajándolo a una franja aparte, rotulada y separada, se ve cuándo se cayó y cuándo volvió. Es el mismo criterio
 * con el que el gráfico anual manda los completados sin año a un chip propio en vez de inventarles uno.
 *
 * COLOR: uno por género, de la rampa del tema (`--chart-from` → `--chart-to`), repartido por su puesto en el
 * último año. Es la misma rampa del rosetón de géneros y del hexágono, así que cada paleta la tiñe con su
 * identidad sin una sola regla por tema. Y como cada línea lleva su nombre escrito a los dos lados, la identidad
 * nunca depende solo del color.
 */
export const GenreBump = memo(function GenreBump({ ranks }: { ranks: GenreRanks }) {
  const L = useStatsLabels().genreRanks;
  const focus = useChartFocus();

  if (ranks.series.length === 0 || ranks.years.length < 2) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const { years, series } = ranks;
  const right = labelWidth(series.map((entry) => entry.tag));
  const width = widthFor(years.length, right);
  const total = series.length;
  const height = PAD_Y.top + total * ROW + OUT_ROW + PAD_Y.bottom;
  const outY = PAD_Y.top + total * ROW + OUT_ROW / 2;

  const x = (index: number) => LEFT + (index / (years.length - 1)) * (width - LEFT - right);
  /** Puesto → altura. Un género sin juegos ese año no tiene puesto: cae a la banda del pie. */
  const y = (point: { rank: number; games: number }) =>
    point.games > 0 ? PAD_Y.top + (point.rank - 1) * ROW + ROW / 2 : outY;

  const shown = series.find((entry) => entry.tag === focus.active) || null;
  const resting = series.reduce((best, entry) =>
    Math.abs(travel(entry).delta) > Math.abs(travel(best).delta) ? entry : best,
  );

  const summaryOf = (entry: GenreRankSeries): string => {
    const { from, to, delta, present } = travel(entry);
    if (!present) return entry.tag;
    if (delta > 0) return L.moveUp(entry.tag, from, to);
    if (delta < 0) return L.moveDown(entry.tag, from, to);
    return L.moveFlat(entry.tag, to);
  };

  const coords = series.map((entry) => entry.points.map((point, index) => ({ x: x(index), y: y(point) })));

  /**
   * A cada lado se rotula SOLO lo que ese año está en la tabla.
   *
   * Los que están fuera comparten la altura de la banda del pie, así que rotularlos ahí apilaba cuatro nombres
   * en el mismo renglón. Un género fuera en un extremo se rotula en el otro, y si está fuera en los dos, junto a
   * su primer punto dentro del gráfico: siempre tiene nombre, y nunca dos en el mismo sitio.
   */
  const inChart = (index: number, position: number) => series[index].points[position].games > 0;
  const lastPosition = years.length - 1;
  const tailY = spread(coords.map((line, index) => (inChart(index, lastPosition) ? line[lastPosition].y : Number.NaN)));
  /** Quien acaba fuera de la tabla no tiene rótulo a la derecha: se le pone junto a su último punto dentro. */
  const floating = series.map((entry, index) => {
    if (inChart(index, lastPosition)) return null;
    const position = entry.points.reduce((found, point, at) => (point.games > 0 ? at : found), -1);
    return position < 0 ? null : coords[index][position];
  });

  return (
    <div className="genre-bump">
      <p className="stats-note">{L.windowHint(ranks.window)}</p>
      <div className="genre-bump-canvas">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="genre-bump-svg"
          role="group"
          aria-label={L.chartAria}
          style={{ '--n': total } as CSSProperties}
        >
          {series.map((_unused, index) => (
            <line
              key={index}
              className="genre-bump-grid"
              x1={LEFT}
              y1={PAD_Y.top + index * ROW + ROW / 2}
              x2={width - right}
              y2={PAD_Y.top + index * ROW + ROW / 2}
            />
          ))}

          {/* La banda de los que se caen de la tabla: separada, con fondo propio y rotulada. */}
          <rect
            className="genre-bump-out"
            x={LEFT}
            y={outY - OUT_ROW / 2 + 3}
            width={width - LEFT - right}
            height={OUT_ROW - 6}
            rx="6"
          />

          {years.map((year, index) => (
            <text key={year} className="genre-bump-year" x={x(index)} y={height - 12} textAnchor="middle">
              {year}
            </text>
          ))}

          {series.map((entry, index) => {
            const line = coords[index];
            const { inside, outside } = split(entry.points, line);
            return (
              <g
                key={entry.tag}
                className={`genre-bump-line${focus.stateOf(entry.tag)}`}
                style={{ '--i': entry.points[entry.points.length - 1].rank - 1 } as CSSProperties}
                {...focus.controlProps(entry.tag, summaryOf(entry))}
              >
                {/* El tramo que cruza la banda de descartados, discontinuo y por debajo: recto y sólido se leía
                    como un puesto más, cuando dice justo lo contrario. */}
                {outside ? <path className="genre-bump-path is-out" d={outside} /> : null}
                <path className="genre-bump-path" d={inside} />
                {/* Objetivo ancho e invisible sobre el trazo: apuntar a una línea de 2,6 px es imposible con el dedo. */}
                <path className="genre-bump-hit" d={`${inside}${outside}`} />
                {entry.points.map((point, position) => (
                  <circle
                    key={point.year}
                    className={`genre-bump-dot${point.games > 0 ? '' : ' is-out'}`}
                    cx={line[position].x}
                    cy={line[position].y}
                    r={DOT}
                  >
                    <title>
                      {point.games > 0
                        ? L.rankAria(entry.tag, point.year, point.rank, point.games)
                        : L.outAria(entry.tag, point.year)}
                    </title>
                  </circle>
                ))}
                {/* El nombre SOLO a la derecha, donde acaba la línea. A la izquierda repetía los mismos siete
                    rótulos y doblaba el ruido de una figura que ya tiene siete trazos cruzándose. */}
                {Number.isFinite(tailY[index]) ? (
                  <text className="genre-bump-tag" x={width - right + 12} y={tailY[index] + 4}>
                    {entry.tag}
                  </text>
                ) : null}
                {floating[index] ? (
                  <text
                    className="genre-bump-tag is-floating"
                    x={floating[index].x}
                    y={floating[index].y - 12}
                    textAnchor="middle"
                  >
                    {entry.tag}
                  </text>
                ) : null}
              </g>
            );
          })}

          <text className="genre-bump-out-label" x={LEFT - 12} y={outY + 4} textAnchor="end">
            {L.outOfChart}
          </text>
        </svg>
      </div>

      <ChartDetail>
        {shown ? <span>{summaryOf(shown)}</span> : <ChartDetailHint>{summaryOf(resting)}</ChartDetailHint>}
      </ChartDetail>
    </div>
  );
});
