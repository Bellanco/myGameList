import { memo, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import { labelLines } from './labelLines';
import { formatPercent } from './format';
import type { TagBucket } from '../../../core/stats/types';

/** Piezas que se dibujan. Con más, la figura se cierra y deja de leerse como un conjunto de trozos sueltos. */
const MAX_PIECES = 5;

const WIDTH = 380;
const HEIGHT = 288;
const CX = WIDTH / 2;
const CY = 142;
/** Radio de la pieza mayor. Manda sobre el lienzo: lo que sobra a los lados es sitio para los rótulos de fuera. */
const MAX_R = 106;
/** Hueco entre porciones, en grados. */
const GAP = 6;
/** Cuánto se separa cada pieza del centro, en unidades del lienzo. */
const EXPLODE = 12;
/** Anillos de referencia, en fracción del radio máximo. */
const RINGS = [0.55, 1];
/** Ancho aproximado de un carácter al cuerpo del rótulo; sirve para saber si el nombre cabe dentro. */
const CHAR = 5.6;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180; // -90: la primera pieza arranca arriba
  return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
}

function point(angleDeg: number, radius: number): string {
  const at = polar(angleDeg, radius);
  return `${at.x.toFixed(1)} ${at.y.toFixed(1)}`;
}

/**
 * Rosetón ABIERTO: el mismo reparto que el de "Géneros más jugados" —todas las porciones abarcan el mismo
 * ángulo y lo que crece es el radio— pero con cada pieza separada del centro y con SU NOMBRE ESCRITO DENTRO.
 *
 * Las dos diferencias son deliberadas y resuelven el problema que traía la figura anterior. Separar las piezas
 * evita que este bloque se confunda con el rosetón de la biblioteca entera, que está unas tarjetas más abajo:
 * son dos lecturas distintas —tu élite frente a todo lo que juegas— y tenían que verse distintas. Y con el
 * nombre dentro de su porción no hay leyenda que casar, que era justo lo que no se distinguía cuando cinco
 * géneros compartían una gama de colores parecida.
 *
 * El radio va con la raíz cuadrada del valor: el área de un sector crece con el cuadrado del radio, así que a
 * escala lineal un género con el doble de juegos ocuparía cuatro veces más superficie.
 *
 * SE PUEDE TOCAR: cada porción se señala con el ratón, con el dedo o con el tabulador, y al hacerlo se abre un poco
 * más, las demás se apartan y el pie de la figura dice su parte exacta —«Acción · 6 juegos · 40%»—. El porcentaje
 * es justo lo que un rosetón no puede pintar: los radios comparan bien entre ellos, pero nadie mide a ojo qué
 * fracción del conjunto es una porción. Las piezas son botones, así que el recorrido no depende de tener ratón.
 */
export const ExplodedRose = memo(function ExplodedRose({
  tags,
  total,
  limit = MAX_PIECES,
}: {
  tags: TagBucket[];
  /** Tamaño del conjunto que se reparte: el texto accesible y el porcentaje del pie salen de aquí. */
  total?: number;
  limit?: number;
}) {
  const L = useStatsLabels().genres;
  const focus = useChartFocus();
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const pieces = tags.slice(0, limit);
  const step = 360 / pieces.length;
  const max = pieces[0].games || 1;
  // El reparto se mide contra el conjunto que se está resumiendo (el top), no contra la suma de las porciones
  // dibujadas: un juego cuenta en todos sus géneros, así que esa suma pasa del 100% y el porcentaje mentiría.
  const whole = total || pieces.reduce((acc, tag) => acc + tag.games, 0);
  const shown = pieces.find((tag) => tag.tag === focus.active) || null;

  return (
    <div className="burst">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="burst-svg"
        // `group` y no `img`: dentro hay controles, y `img` haría que un lector de pantalla se saltara su
        // contenido. El resumen completo sigue anunciándose aquí, y cada porción se anuncia como su botón.
        role="group"
        aria-label={`${L.chartAria}${total ? ` (${total})` : ''}: ${pieces.map((tag) => `${tag.tag} ${tag.games}`).join(', ')}`}
        style={{ '--n': pieces.length } as CSSProperties}
      >
        {RINGS.map((ring) => (
          <circle key={ring} className="burst-ring" cx={CX} cy={CY} r={MAX_R * ring} />
        ))}

        {pieces.map((tag, index) => {
          const radius = Math.max(Math.sqrt(tag.games / max) * MAX_R, 14);
          const from = index * step + GAP / 2;
          const to = (index + 1) * step - GAP / 2;
          const mid = index * step + step / 2;
          // Desplazamiento de la pieza: hacia fuera desde el centro, por su propia bisectriz.
          const push = polar(mid, EXPLODE);
          const dx = push.x - CX;
          const dy = push.y - CY;

          const lines = labelLines(tag.tag);
          const widest = Math.max(...lines.map((line) => line.length * CHAR));
          // El rótulo va dentro cuando la cuerda de la porción da para el texto; si no, fuera de la punta con
          // una línea que lo ata a su pieza.
          const band = radius * 0.62;
          const chord = 2 * band * Math.sin(((to - from) * Math.PI) / 360);
          const inside = chord > widest + 8 && radius > 46;

          const anchor = polar(mid, inside ? band : radius + 16);
          const x = anchor.x + dx;
          const y = anchor.y + dy;
          const align = inside ? 'middle' : anchor.x > CX + 6 ? 'start' : anchor.x < CX - 6 ? 'end' : 'middle';
          const tip = polar(mid, radius + 2);
          const lead = polar(mid, radius + 11);

          const percent = whole > 0 ? (tag.games / whole) * 100 : 0;

          return (
            <g key={tag.tag} style={{ '--i': index, '--dx': `${dx.toFixed(1)}px`, '--dy': `${dy.toFixed(1)}px` } as CSSProperties}>
              <g
                className={`burst-piece${focus.stateOf(tag.tag)}`}
                {...focus.controlProps(tag.tag, `${tag.tag}: ${L.games(tag.games)}, ${formatPercent(percent)}%`)}
              >
                <path d={`M ${CX} ${CY} L ${point(from, radius)} A ${radius} ${radius} 0 0 1 ${point(to, radius)} Z`}>
                  <title>{`${tag.tag}: ${tag.games}`}</title>
                </path>
              </g>

              {inside ? null : (
                <line
                  className="burst-lead"
                  x1={(tip.x + dx).toFixed(1)}
                  y1={(tip.y + dy).toFixed(1)}
                  x2={(lead.x + dx).toFixed(1)}
                  y2={(lead.y + dy).toFixed(1)}
                />
              )}

              <text
                className={`burst-label${inside ? ' is-inside' : ''}`}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                textAnchor={align}
              >
                {lines.map((line, row) => (
                  <tspan key={line} x={x.toFixed(1)} dy={row === 0 ? (lines.length > 1 ? '-0.55em' : '-0.05em') : '1.05em'}>
                    {line}
                  </tspan>
                ))}
                <tspan className="burst-num" x={x.toFixed(1)} dy="1.2em">{tag.games}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      <ChartDetail>
        {shown ? (
          <>
            <b>{shown.tag}</b>
            <span>{L.games(shown.games)}</span>
            <span>{formatPercent(whole > 0 ? (shown.games / whole) * 100 : 0)}%</span>
          </>
        ) : (
          <ChartDetailHint>{L.games(whole)}</ChartDetailHint>
        )}
      </ChartDetail>
    </div>
  );
});
