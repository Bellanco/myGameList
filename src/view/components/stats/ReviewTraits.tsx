import { memo, type CSSProperties } from 'react';
import { STATS_UI } from '../../../core/constants/statsLabels';
import type { TagBucket } from '../../../core/stats/types';

const L = STATS_UI.reviews;

/** Filas por lado. Más abajo la cola es de etiquetas escritas una o dos veces, que no dicen nada. */
const MAX_ROWS = 8;

interface ReviewTraitsProps {
  strengths: TagBucket[];
  weaknesses: TagBucket[];
}

/**
 * Lo que destacas frente a lo que te chirría, enfrentado sobre un mismo eje —una pirámide de población—.
 *
 * Sale de los puntos fuertes y débiles que anotas al reseñar, que hasta ahora no se veían en ninguna pantalla.
 * Es el único bloque del panel que contesta QUÉ valoras y no cuánto, y va enfrentado a propósito: las dos
 * columnas comparten escala, así que se ve de un vistazo si celebras más de lo que criticas.
 *
 * El nombre va FUERA de la barra: dentro, cualquier etiqueta corta con una cuenta baja se salía de su relleno.
 */
export const ReviewTraits = memo(function ReviewTraits({ strengths, weaknesses }: ReviewTraitsProps) {
  const good = strengths.slice(0, MAX_ROWS);
  const bad = weaknesses.slice(0, MAX_ROWS);

  if (good.length === 0 && bad.length === 0) {
    return <p className="stats-empty">{L.traitsEmpty}</p>;
  }

  // Una sola escala para los dos lados: con un máximo por columna, tres menciones a la izquierda parecerían
  // tanto como veinte a la derecha.
  const max = Math.max(...good.map((tag) => tag.games), ...bad.map((tag) => tag.games), 1);
  const rows = Math.max(good.length, bad.length);
  const side = (tag: TagBucket | undefined, tone: 'good' | 'bad') => (
    <span className={`traits-side is-${tone}`}>
      {tag ? (
        <>
          <span className="traits-name" title={tag.tag}>{tag.tag}<b>{tag.games}</b></span>
          <span className="traits-bar"><i style={{ '--pct': `${(tag.games / max) * 100}%` } as CSSProperties} /></span>
        </>
      ) : null}
    </span>
  );

  return (
    <div className="traits">
      <p className="traits-heads" aria-hidden="true">
        <span>{L.strengths}</span>
        <span>{L.weaknesses}</span>
      </p>

      <ul className="traits-rows">
        {Array.from({ length: rows }, (_unused, index) => (
          <li key={good[index]?.tag || bad[index]?.tag || index} style={{ '--i': index } as CSSProperties}>
            {side(good[index], 'good')}
            {side(bad[index], 'bad')}
          </li>
        ))}
      </ul>
    </div>
  );
});
