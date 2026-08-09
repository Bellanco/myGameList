import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { ABANDON_RATE_MIN } from '../../../core/stats/computeStats';
import { StatTile } from './StatTile';
import { TagBars } from './TagBars';
import { GameRefList } from './GameRefList';
import { formatCount, formatDecimal, formatHours, formatPercent } from './format';
import type { ShameSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.shame;

/**
 * Apartado de la lista de la vergüenza. Vive solo en "General": los abandonos no llevan año (el formulario no
 * pide "Años completado" fuera de completados), así que no se pueden repartir por pestaña.
 */
export const ShameCard = memo(function ShameCard({ shame, scale }: { shame: ShameSummary; scale: ScoreScale }) {
  if (shame.total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? shame.avgGrade : shame.avgGrade / 20;

  return (
    <>
      <div className="stats-tiles">
        <StatTile label={L.total} value={formatCount(shame.total)} />
        <StatTile label={L.hours} value={formatHours(shame.hours)} unit="h" />
        {shame.scored > 0 ? (
          <StatTile
            label={L.avgGrade}
            value={formatDecimal(avgInScale)}
            unit={scale === 'grade' ? UI_MESSAGES.stats.tiles.outOf100 : UI_MESSAGES.stats.tiles.outOf5}
            hint={UI_MESSAGES.stats.tiles.avgGradeHint(shame.scored)}
          />
        ) : null}
        <StatTile label={L.retry} value={formatCount(shame.retry)} />
      </div>

      <div className="stats-split">
        <section>
          <h3>{L.reasons}</h3>
          {shame.reasons.length ? <TagBars tags={shame.reasons} limit={6} /> : <p className="stats-empty">{L.noReasons}</p>}
        </section>
        <section>
          <h3>{L.genres}</h3>
          <TagBars tags={shame.genres} limit={6} />
        </section>
      </div>

      {shame.abandonRate.length ? (
        <section>
          <h3>{L.rate}</h3>
          <ul className="stats-bars">
            {shame.abandonRate.map((entry) => (
              <li className="stats-bar-row" key={entry.tag}>
                <span className="stats-bar-label" title={entry.tag}>{entry.tag}</span>
                <span className="stats-bar-track">
                  <span className="stats-bar-fill is-danger" style={{ '--bar-width': `${entry.percent}%` } as CSSProperties} />
                </span>
                <span className="stats-bar-value">{L.rateValue(formatPercent(entry.percent), entry.abandoned, entry.decided)}</span>
              </li>
            ))}
          </ul>
          <p className="stats-note">{L.rateHint(ABANDON_RATE_MIN)}</p>
        </section>
      ) : null}

      <section>
        <h3>{L.recent}</h3>
        <GameRefList games={shame.recent} meta="hours" />
      </section>
    </>
  );
});
