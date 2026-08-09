import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatCount, formatPercent } from './format';
import type { StatsSummary } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.ratio;

/**
 * Aro completados/abandonados. Se pinta con un `conic-gradient` sobre un solo elemento —misma técnica que el aro
 * de puntuación (`.score-ring`)— en vez de con un `<svg>` de dos arcos: una variable CSS y ninguna geometría.
 */
export const RatioDonut = memo(function RatioDonut({ ratio }: { ratio: StatsSummary['completionRatio'] }) {
  const { completed, abandoned } = ratio;
  if (completed + abandoned === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const percent = formatPercent(ratio.percent);

  return (
    <div className="ratio-block">
      <div
        className="ratio-donut"
        style={{ '--ratio-pct': String(percent) } as CSSProperties}
        role="img"
        aria-label={L.donutAria(percent, completed, abandoned)}
      >
        <span className="ratio-donut-num">{percent}%</span>
      </div>
      <ul className="ratio-legend">
        <li>
          <span className="ratio-dot is-completed" aria-hidden="true" />
          <span className="ratio-legend-label">{L.completed}</span>
          <b>{formatCount(completed)}</b>
        </li>
        <li>
          <span className="ratio-dot is-abandoned" aria-hidden="true" />
          <span className="ratio-legend-label">{L.abandoned}</span>
          <b>{formatCount(abandoned)}</b>
        </li>
      </ul>
    </div>
  );
});
