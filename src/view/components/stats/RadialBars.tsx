import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatCount } from './format';
import type { TagBucket } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.genres;

/** Anillos que se dibujan. Más allá, las bandas se estrechan tanto que dejan de compararse. */
const MAX_RINGS = 5;

const SIZE = 230;
const CENTER = SIZE / 2;
const OUTER = 104;
/** Grosor de cada anillo y hueco entre ellos. */
const BAND = 12;
const GAP = 5;
/** Radio por debajo del cual la cifra no cabe dentro de la banda sin apelmazarse contra el centro. */
const NUM_MIN_R = 50;
/** Vuelta que da el anillo lleno: tres cuartos. La abertura deja claro dónde empieza y dónde acaba. */
const SWEEP = 270;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

/** Arco desde el ángulo 0 (arriba) hasta `to`, sin relleno: se dibuja con el grosor del trazo. */
function arc(to: number, radius: number): string {
  const start = polar(0, radius);
  // Un arco de 360° no se puede trazar de una vez: se queda a un pelo para que el trazo cierre visualmente.
  const end = polar(Math.min(to, 359.9), radius);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 ${to > 180 ? 1 : 0} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

interface RadialBarsProps {
  tags: TagBucket[];
  /** Tamaño del conjunto que se reparte; solo se usa para el texto accesible. */
  total?: number;
  limit?: number;
}

/**
 * Barras radiales: un anillo por etiqueta, con la vuelta que da proporcional a su valor.
 *
 * Es la VARIACIÓN del rosetón para un conjunto pequeño: el rosetón reparte el círculo en sectores del mismo
 * ángulo y juega con el radio; aquí cada categoría tiene su propia órbita y lo que se compara es cuánto avanza
 * en ella. Misma familia circular, lectura distinta —y sin el problema del rosetón cuando hay pocos valores,
 * que es que tres sectores se ven como una tarta rota.
 */
export const RadialBars = memo(function RadialBars({ tags, total, limit = MAX_RINGS }: RadialBarsProps) {
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const rings = tags.slice(0, limit);
  const max = rings[0].games || 1;

  return (
    <div className="radial">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="radial-svg"
        role="img"
        aria-label={`${L.chartAria}${total ? ` (${total})` : ''}: ${rings.map((tag) => `${tag.tag} ${tag.games}`).join(', ')}`}
      >
        {/* Guía a media vuelta: sin una referencia común, dos arcos de radios distintos con el mismo ángulo
            parecen medir cosas distintas —el de fuera recorre más camino—, y era lo que hacía que todos se
            vieran "a tres cuartos". */}
        <line
          className="radial-guide"
          x1={CENTER}
          y1={CENTER}
          x2={polar(SWEEP / 2, OUTER + BAND / 2).x}
          y2={polar(SWEEP / 2, OUTER + BAND / 2).y}
        />

        {rings.map((tag, index) => {
          const radius = OUTER - index * (BAND + GAP);
          const sweep = (tag.games / max) * SWEEP;
          // La cifra va DENTRO del arco, cerca de su punta, y solo si el arco da para escribirla: fuera se
          // pisaría con la leyenda y con las puntas de los demás anillos.
          const at = polar(Math.max(sweep - 11, 6), radius);
          return (
            <g key={tag.tag} style={{ '--i': index } as CSSProperties}>
              <path className="radial-track" d={arc(SWEEP, radius)} strokeWidth={BAND} />
              <path className="radial-value" d={arc(sweep, radius)} strokeWidth={BAND}>
                <title>{`${tag.tag}: ${tag.games}`}</title>
              </path>
              {sweep >= 40 && radius >= NUM_MIN_R ? (
                <text className="radial-num" x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central">
                  {tag.games}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <ul className="radial-legend">
        {rings.map((tag, index) => (
          <li key={tag.tag} style={{ '--i': index } as CSSProperties}>
            <span className="radial-key" aria-hidden="true" />
            <span className="radial-tag" title={tag.tag}>{tag.tag}</span>
            <b>{formatCount(tag.games)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
});
