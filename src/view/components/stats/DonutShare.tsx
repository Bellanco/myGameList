import { memo, type CSSProperties } from 'react';
import { useChartFocus } from './useChartFocus';
import { formatCount, formatPercent } from './format';
import type { TagBucket } from '../../../core/stats/types';

/** Segmentos con color propio; el resto se agrupa para no partir el anillo en migas. */
const MAX_KEYS = 5;

const SIZE = 160;
const CENTER = SIZE / 2;
const STROKE = 22;
/**
 * Grosor del segmento señalado. Está aquí y no solo en la hoja de estilos porque el RADIO se calcula con él: el
 * trazo crece hacia los dos lados de la circunferencia, así que con el radio ajustado al grosor normal la parte
 * ampliada se salía del `viewBox` y el anillo aparecía cortado justo en el segmento que se estaba mirando.
 */
const STROKE_ACTIVE = 27;
const RADIUS = (SIZE - STROKE_ACTIVE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Hueco entre segmentos, en unidades de trazo: separa sin pintar un borde. */
const GAP = 3;

interface DonutShareProps {
  tags: TagBucket[];
  /** Cifra grande del centro y su etiqueta. */
  total: number;
  label: string;
}

/**
 * Anillo repartido, con el total en el hueco central.
 *
 * Sustituye a la barra al 100%, que decía lo mismo pero plana: el anillo compara cada parte con el todo Y deja
 * el centro libre para la cifra que da contexto, que en una barra no cabía en ninguna parte. Los segmentos se
 * dibujan con `stroke-dasharray` sobre un único círculo, así que el hueco entre ellos es exacto.
 *
 * SE PUEDE TOCAR: al señalar un segmento —o su fila de la leyenda— ese segmento se destaca, los demás se apartan
 * y **el centro pasa a contar esa parte** en lugar del total. Es lo que convierte el anillo en una lectura y no en
 * una estampa: el reparto se ve de un vistazo, pero «cuántos exactamente en PC» había que ir a buscarlo a la
 * leyenda y volver. La leyenda son BOTONES de verdad, así que el recorrido funciona igual con el dedo y con el
 * teclado; el hueco entre los dos mundos —señalar con el ratón, fijar con un toque— lo cubre el mismo estado.
 */
export const DonutShare = memo(function DonutShare({ tags, total, label }: DonutShareProps) {
  const focus = useChartFocus();
  const sum = tags.reduce((acc, tag) => acc + tag.games, 0);
  if (sum === 0) return null;

  const top = tags.slice(0, MAX_KEYS);
  const rest = tags.slice(MAX_KEYS).reduce((acc, tag) => acc + tag.games, 0);
  const parts = rest > 0 ? [...top, { tag: '—', games: rest, hours: 0 }] : top;

  let offset = 0;
  const drawn = parts.map((part) => {
    const length = (part.games / sum) * CIRCUMFERENCE;
    const at = offset;
    offset += length;
    return { ...part, at, length: Math.max(length - GAP, 1), percent: (part.games / sum) * 100 };
  });

  const shown = drawn.find((part) => part.tag === focus.active) || null;

  return (
    <div className="donut-share">
      <div className="donut-share-fig">
        {/* La figura no se anuncia: lo que dice está en la leyenda de al lado, que es texto real y además el
            control. Duplicarlo obligaría a un lector de pantalla a oír dos veces el mismo reparto. */}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {drawn.map((part, index) => (
            <circle
              key={part.tag}
              className={`donut-seg${focus.stateOf(part.tag)}`}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              strokeWidth={STROKE}
              strokeDasharray={`${part.length} ${CIRCUMFERENCE - part.length}`}
              strokeDashoffset={-part.at}
              style={{ '--i': index } as CSSProperties}
              {...focus.hoverProps(part.tag)}
            >
              <title>{`${part.tag}: ${part.games} (${formatPercent(part.percent)}%)`}</title>
            </circle>
          ))}
        </svg>
        {/* El centro cuenta la parte señalada y, si no hay ninguna, el total. Es el mismo sitio a propósito: la
            vista no se mueve del anillo para leer la cifra. */}
        <span className="donut-share-center">
          <b>{formatCount(shown ? shown.games : total)}</b>
          <small>{shown ? shown.tag : label}</small>
        </span>
      </div>

      <ul className="donut-legend">
        {drawn.map((part, index) => (
          <li key={part.tag} style={{ '--i': index } as CSSProperties}>
            <button
              type="button"
              className={`donut-legend-row${focus.stateOf(part.tag)}`}
              {...focus.buttonProps(part.tag)}
            >
              <span className="donut-key" aria-hidden="true" />
              <span className="donut-tag" title={part.tag}>{part.tag}</span>
              <b>{formatCount(part.games)}</b>
              <small>{formatPercent(part.percent)}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});
