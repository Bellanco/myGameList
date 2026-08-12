import { memo, useId } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import { TagRanking } from './TagRanking';
import { labelLines } from './labelLines';
import { formatDecimal } from './format';
import type { GenreAffinity } from '../../../core/stats/types';

/** Ejes de la figura. Seis como mucho —de ahí el hexágono—; con menos géneros sale un pentágono, cuadrado o triángulo. */
const MAX_AXES = 6;
/** Mínimo para que la figura signifique algo: con dos ejes es un segmento, no un reparto. */
const MIN_AXES = 3;

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 82;
const LABEL_RADIUS = RADIUS + 22;
const RINGS = [0.25, 0.5, 0.75, 1];

interface Point {
  x: number;
  y: number;
}

function vertex(index: number, total: number, ratio: number, radius = RADIUS): Point {
  // Primer eje arriba y giro horario, como se lee un reloj.
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return { x: CENTER + Math.cos(angle) * radius * ratio, y: CENTER + Math.sin(angle) * radius * ratio };
}

function polygon(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

/**
 * Figura de géneros al estilo del "Resumen del año" de Steam: un hexágono cuyos vértices son tus seis géneros
 * principales y cuya silueta dice de un vistazo hacia dónde tiras.
 *
 * Lo que mide cada eje es la AFINIDAD, no el número de juegos: cada juego cuenta por la nota que le pusiste
 * (ver `affinityOf` en `computeStats`), así que un género de muchos juegos regulares puede quedar por detrás
 * de otro más pequeño que te encantó. El recuento puro ya lo dibuja el rosetón de "Géneros más jugados"; si
 * este hexágono contara lo mismo, serían dos formas distintas diciendo lo mismo.
 *
 * SVG a mano y no una librería: son treinta líneas de trigonometría, hereda los colores del tema por variables
 * CSS y no añade un solo kilobyte de dependencia al bundle.
 *
 * SE PUEDE TOCAR: cada eje se señala con el ratón, el dedo o el tabulador, y el pie dice entonces lo que la silueta
 * no puede decir —su afinidad, cuántos juegos la sostienen y con qué nota media—. Ese dato existía únicamente en el
 * `aria-label`: quien ve la figura tenía la forma, y el número solo lo oía un lector de pantalla.
 */
export const GenreRadar = memo(function GenreRadar({ tags }: { tags: GenreAffinity[] }) {
  const L = useStatsLabels().radar;
  const focus = useChartFocus();
  const gradientId = useId();

  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  // Con uno o dos géneros no hay figura posible: se enseña el reparto en barras, que sí se entiende.
  if (tags.length < MIN_AXES) {
    return (
      <>
        <p className="stats-note">{L.tooFew}</p>
        <TagRanking tags={tags.map((tag) => ({ tag: tag.tag, games: tag.games, hours: 0 }))} limit={MIN_AXES} />
      </>
    );
  }

  const axes = tags.slice(0, MAX_AXES);
  const total = axes.length;
  const max = axes[0].weight || 1;
  // Suelo del 12%: la escala es lineal (el área dice la verdad), pero un género con un solo juego frente a
  // uno con veinte quedaría pegado al centro y su vértice desaparecería de la figura.
  const shape = axes.map((tag, index) => vertex(index, total, Math.max(tag.weight / max, 0.12)));
  const shown = axes.find((tag) => tag.tag === focus.active) || null;

  return (
    <div className="genre-radar">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="genre-radar-svg"
        // `group` y no `img`: dentro hay un control por eje, y con `img` un lector de pantalla se saltaría su
        // contenido. El resumen entero se sigue anunciando aquí.
        role="group"
        aria-label={L.aria(axes.map((tag) => L.axisValue(tag.tag, formatDecimal(tag.weight), tag.games, tag.avgGrade)).join(', '))}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="genre-radar-stop-top" />
            <stop offset="100%" className="genre-radar-stop-bottom" />
          </linearGradient>
        </defs>

        {/* Telaraña: los anillos de referencia y los radios de cada eje. */}
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            className="genre-radar-ring"
            points={polygon(axes.map((_unused, index) => vertex(index, total, ring)))}
          />
        ))}
        {axes.map((tag, index) => {
          const end = vertex(index, total, 1);
          return <line key={tag.tag} className="genre-radar-spoke" x1={CENTER} y1={CENTER} x2={end.x} y2={end.y} />;
        })}

        <polygon className="genre-radar-shape" points={polygon(shape)} fill={`url(#${gradientId})`} />

        {/* Un objetivo por eje: el vértice se ve, pero apuntar a un círculo de 3,4 unidades es imposible con el
            dedo, así que lo que se señala es un disco transparente mucho mayor centrado en él. */}
        {shape.map((point, index) => {
          const tag = axes[index];
          return (
            <g
              key={tag.tag}
              className={`genre-radar-axis${focus.stateOf(tag.tag)}`}
              {...focus.controlProps(tag.tag, L.axisValue(tag.tag, formatDecimal(tag.weight), tag.games, tag.avgGrade))}
            >
              <line className="genre-radar-reach" x1={CENTER} y1={CENTER} x2={point.x} y2={point.y} />
              <circle className="genre-radar-dot" cx={point.x} cy={point.y} r="3.4" />
              <circle className="genre-radar-hit" cx={point.x} cy={point.y} r="14" />
            </g>
          );
        })}

        {axes.map((tag, index) => {
          const label = vertex(index, total, 1, LABEL_RADIUS);
          const dx = label.x - CENTER;
          const anchor = Math.abs(dx) < 6 ? 'middle' : dx > 0 ? 'start' : 'end';
          return (
            <text
              key={tag.tag}
              className="genre-radar-label"
              x={label.x}
              y={label.y}
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {/* Solo el nombre del género: la cifra de afinidad no es una cantidad que nadie vaya a comparar
                  —lo que se lee es la FORMA de la figura—, y quitándola cabe un cuerpo de letra mayor. El dato
                  numérico sigue en el `aria-label`, para quien no ve la silueta. */}
              {labelLines(tag.tag).map((line, row, all) => (
                <tspan key={line} x={label.x} dy={row === 0 ? (all.length > 1 ? '-0.5em' : '0') : '1.1em'}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>

      {/* En reposo el pie habla del eje que MANDA (el primero, que es el de más afinidad): es el que la silueta
          ya está señalando con su punta, así que la frase de descanso no es un relleno. El texto sale entero de
          `axisValue`, el mismo que describe la figura para quien no la ve. */}
      <ChartDetail>
        {shown ? (
          <span>{L.axisValue(shown.tag, formatDecimal(shown.weight), shown.games, shown.avgGrade)}</span>
        ) : (
          <ChartDetailHint>
            {L.axisValue(axes[0].tag, formatDecimal(axes[0].weight), axes[0].games, axes[0].avgGrade)}
          </ChartDetailHint>
        )}
      </ChartDetail>
    </div>
  );
});
