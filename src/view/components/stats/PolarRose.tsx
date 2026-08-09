import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { TagRanking } from './TagRanking';
import type { TagBucket } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.genres;

/** Sectores del rosetón. Con más de diez, los rótulos se pisan y deja de leerse. */
const MAX_SECTORS = 10;
/** Por debajo de tres sectores no hay reparto que dibujar: dos mitades no son una figura, son un círculo partido. */
const MIN_SECTORS = 3;

const SIZE = 300;
const CENTER = SIZE / 2;
const MAX_R = 96;
const LABEL_R = MAX_R + 16;
/** Hueco entre sectores, en grados: separa las porciones sin que parezcan una tarta. */
const GAP = 2;
const RINGS = [0.5, 1];

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180; // -90: el primer sector arranca arriba
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

/** Sector circular desde el centro, entre dos ángulos y con un radio. */
function sectorPath(from: number, to: number, radius: number): string {
  const a = polar(from, radius);
  const b = polar(to, radius);
  const large = to - from > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`;
}

function shorten(tag: string): string {
  return tag.length > 13 ? `${tag.slice(0, 12)}…` : tag;
}

/**
 * Rosetón polar (diagrama de Nightingale): todos los sectores abarcan el mismo ángulo y lo que crece es el
 * RADIO. Sustituye al mosaico de rectángulos y al ranking de barras para el reparto de una etiqueta.
 *
 * El radio va con la raíz cuadrada del valor, no con el valor: el área de un sector crece con el cuadrado del
 * radio, así que a escala lineal un género con el doble de juegos ocuparía cuatro veces más superficie y la
 * figura exageraría las diferencias. Con la raíz, el área sí es proporcional al dato.
 */
export const PolarRose = memo(function PolarRose({ tags }: { tags: TagBucket[] }) {
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  // Con una o dos etiquetas el rosetón sale como un círculo partido por la mitad, que no dice nada: se cae al
  // ranking en texto, igual que hace el hexágono cuando no tiene ejes suficientes.
  if (tags.length < MIN_SECTORS) {
    return <TagRanking tags={tags} limit={MIN_SECTORS} />;
  }

  const sectors = tags.slice(0, MAX_SECTORS);
  const step = 360 / sectors.length;
  const max = sectors[0].games || 1;

  return (
    <div className="polar-rose">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${L.chartAria}: ${sectors.map((tag) => `${tag.tag} ${tag.games}`).join(', ')}`}
      >
        {RINGS.map((ring) => (
          <circle key={ring} className="polar-ring" cx={CENTER} cy={CENTER} r={MAX_R * ring} />
        ))}

        {sectors.map((tag, index) => {
          const radius = Math.max(Math.sqrt(tag.games / max) * MAX_R, 6);
          const from = index * step + GAP / 2;
          const to = (index + 1) * step - GAP / 2;
          return (
            <path
              key={tag.tag}
              className="polar-sector"
              d={sectorPath(from, to, radius)}
              style={{ '--i': index } as CSSProperties}
            >
              <title>{`${tag.tag}: ${tag.games}`}</title>
            </path>
          );
        })}

        {sectors.map((tag, index) => {
          const mid = index * step + step / 2;
          const at = polar(mid, LABEL_R);
          const dx = at.x - CENTER;
          const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end';
          return (
            <text key={tag.tag} className="polar-label" x={at.x} y={at.y} textAnchor={anchor} dominantBaseline="middle">
              {shorten(tag.tag)}
              <tspan className="polar-label-num" dx="4">{tag.games}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
});
