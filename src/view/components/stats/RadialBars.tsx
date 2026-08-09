import { memo, useId, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { TagBucket } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.genres;

/** Anillos que se dibujan. Más allá, las bandas se estrechan tanto que dejan de compararse. */
const MAX_RINGS = 5;

const WIDTH = 260;
const HEIGHT = 152;
const CX = WIDTH / 2;
const CY = HEIGHT - 16;
const OUTER = 116;
/** Grosor de cada anillo y hueco entre ellos. */
const BAND = 15;
const GAP = 5;
/**
 * MEDIA LUNA SUPERIOR: los arcos van de las nueve a las tres pasando por arriba.
 *
 * No es un capricho de forma, es lo que hace legible el rótulo. Con una vuelta de tres cuartos, el nombre
 * escrito sobre el anillo se daba la vuelta al cruzar la mitad inferior y había que leerlo cabeza abajo; en el
 * semicírculo de arriba el texto va siempre derecho, de izquierda a derecha.
 */
// 270° es "las nueve en punto" en esta convención (0 = arriba, 90 = derecha), y desde ahí media vuelta en el
// sentido del reloj pasa por arriba hasta las tres.
const START = 270;
const SWEEP = 180;
/** Ancho aproximado de un carácter al cuerpo del rótulo; sirve para saber si el nombre cabe dentro del arco. */
const CHAR = 5.6;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
}

/** Arco de `deg` grados desde las nueve en punto, en el sentido del reloj. */
function arc(deg: number, radius: number): string {
  const start = polar(START, radius);
  const end = polar(START + Math.min(deg, SWEEP), radius);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

/** Longitud en píxeles de un arco de `deg` grados a ese radio. */
function arcLength(deg: number, radius: number): number {
  return (deg / 360) * 2 * Math.PI * radius;
}

interface RadialBarsProps {
  tags: TagBucket[];
  /** Tamaño del conjunto que se reparte; solo se usa para el texto accesible. */
  total?: number;
  limit?: number;
}

/**
 * Barras radiales con el NOMBRE ESCRITO SOBRE CADA ANILLO.
 *
 * Es la variación del rosetón para un conjunto pequeño —allí cada género es un sector del mismo ángulo que
 * compite por radio; aquí cada uno tiene su órbita y lo que se compara es cuánto avanza en ella—, pero con una
 * diferencia que resultó ser la decisiva: en el rosetón y en el hexágono cada género lleva su rótulo al lado, y
 * en unos anillos de colores parecidos la identidad dependía de casar color con leyenda, que es justo lo que no
 * se distinguía. Con el nombre curvado sobre su propio anillo no hay nada que casar, y la leyenda sobra.
 *
 * El rótulo va DENTRO del arco cuando cabe —y se lee sobre el relleno— y, si no, justo después de la punta,
 * sobre la parte vacía del carril: así siempre hay sitio, mida lo que mida el valor.
 */
export const RadialBars = memo(function RadialBars({ tags, total, limit = MAX_RINGS }: RadialBarsProps) {
  const pathId = useId();

  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const rings = tags.slice(0, limit);
  const max = rings[0].games || 1;

  return (
    <div className="radial">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="radial-svg"
        role="img"
        aria-label={`${L.chartAria}${total ? ` (${total})` : ''}: ${rings.map((tag) => `${tag.tag} ${tag.games}`).join(', ')}`}
        style={{ '--n': rings.length } as CSSProperties}
      >
        <defs>
          {rings.map((tag, index) => (
            <path key={tag.tag} id={`${pathId}-${index}`} fill="none" d={arc(SWEEP, OUTER - index * (BAND + GAP))} />
          ))}
        </defs>

        {/* Referencia a media vuelta: sin ella, dos arcos de radios distintos con el mismo ángulo parecen medir
            cosas distintas, porque el de fuera recorre más camino. */}
        <line
          className="radial-guide"
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - OUTER - BAND / 2}
        />

        {rings.map((tag, index) => {
          const radius = OUTER - index * (BAND + GAP);
          const sweep = (tag.games / max) * SWEEP;
          const label = `${tag.tag} · ${tag.games}`;
          // Cabe dentro si el arco relleno da para el texto con margen; si no, se escribe pasada la punta.
          const filled = arcLength(sweep, radius);
          const width = label.length * CHAR;
          const inside = filled > width + 16;
          // Centrado en el arco relleno (o justo después de la punta): así el rótulo cae en la parte alta del
          // semicírculo, que es donde el texto queda horizontal, en vez de trepar en diagonal por el arranque.
          const offset = inside ? filled / 2 : filled + width / 2 + 8;

          return (
            <g key={tag.tag} style={{ '--i': index } as CSSProperties}>
              <path className="radial-track" d={arc(SWEEP, radius)} strokeWidth={BAND} />
              <path className="radial-value" d={arc(sweep, radius)} strokeWidth={BAND}>
                <title>{`${tag.tag}: ${tag.games}`}</title>
              </path>
              <text className={`radial-label${inside ? ' is-inside' : ''}`} dy="3.6" textAnchor="middle">
                <textPath href={`#${pathId}-${index}`} startOffset={offset}>{label}</textPath>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});
