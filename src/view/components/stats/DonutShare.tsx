import { memo, type CSSProperties } from 'react';
import { formatCount, formatPercent } from './format';
import type { TagBucket } from '../../../core/stats/types';

/** Segmentos con color propio; el resto se agrupa para no partir el anillo en migas. */
const MAX_KEYS = 5;

const SIZE = 160;
const CENTER = SIZE / 2;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
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
 */
export const DonutShare = memo(function DonutShare({ tags, total, label }: DonutShareProps) {
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

  return (
    <div className="donut-share">
      <div className="donut-share-fig">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {drawn.map((part, index) => (
            <circle
              key={part.tag}
              className="donut-seg"
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              strokeWidth={STROKE}
              strokeDasharray={`${part.length} ${CIRCUMFERENCE - part.length}`}
              strokeDashoffset={-part.at}
              style={{ '--i': index } as CSSProperties}
            >
              <title>{`${part.tag}: ${part.games} (${formatPercent(part.percent)}%)`}</title>
            </circle>
          ))}
        </svg>
        <span className="donut-share-center">
          <b>{formatCount(total)}</b>
          <small>{label}</small>
        </span>
      </div>

      <ul className="donut-legend">
        {drawn.map((part, index) => (
          <li key={part.tag} style={{ '--i': index } as CSSProperties}>
            <span className="donut-key" aria-hidden="true" />
            <span className="donut-tag" title={part.tag}>{part.tag}</span>
            <b>{formatCount(part.games)}</b>
            <small>{formatPercent(part.percent)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
});
