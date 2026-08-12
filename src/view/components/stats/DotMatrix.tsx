import { memo, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { formatCount } from './format';
import type { TagBucket } from '../../../core/stats/types';

/** Tope de puntos dibujados por fila; a partir de ahí se resume, porque contar cien puntos no lo hace nadie. */
const MAX_DOTS = 24;

/**
 * Matriz de puntos: un punto por juego, agrupados por etiqueta.
 *
 * Es un recuento que se cuenta con el dedo, no una longitud que hay que comparar contra un eje: funciona igual
 * de bien con tres juegos que con cuarenta, y no necesita escala ni rejilla. Cuando una fila pasa del tope se
 * dibujan los primeros y se remata con "+N", que es honesto y ocupa lo mismo.
 *
 * SE PUEDE TOCAR: cada fila se señala y se aísla de las demás. Son pocas —seis como mucho— y todo su dato ya está
 * escrito, así que aquí no hay pie de detalle: lo que faltaba era poder mirar una sin las otras cinco al lado.
 */
export const DotMatrix = memo(function DotMatrix({ tags, limit = 6 }: { tags: TagBucket[]; limit?: number }) {
  const L = useStatsLabels().wishlist;
  const focus = useChartFocus();
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  return (
    <ul className="dot-matrix">
      {tags.slice(0, limit).map((tag, index) => {
        const dots = Math.min(tag.games, MAX_DOTS);
        return (
          <li key={tag.tag} className={focus.stateOf(tag.tag).trim()} style={{ '--i': index } as CSSProperties}>
            <button type="button" className="dot-matrix-row" {...focus.buttonProps(tag.tag)}>
              <span className="dot-matrix-tag" title={tag.tag}>{tag.tag}</span>
              <span className="dot-matrix-dots">
                {Array.from({ length: dots }, (_unused, dot) => (
                  <i key={dot} style={{ '--d': dot } as CSSProperties} />
                ))}
                {tag.games > dots ? <em>+{tag.games - dots}</em> : null}
              </span>
              <span className="dot-matrix-num">{formatCount(tag.games)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
});
