import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { ABANDON_RATE_MIN } from '../../../core/stats/computeStats';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { TagBars } from './TagBars';
import { TagChips } from './TagChips';
import { GameRefList } from './GameRefList';
import { formatDecimal, formatHours, formatPercent } from './format';
import type { ShameSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.shame;

/**
 * Apartado de la lista de la vergüenza. Vive solo en "General": los abandonos no llevan año (el formulario no
 * pide "Años completado" fuera de completados), así que no se pueden repartir por pestaña.
 *
 * Las razones van en nube de etiquetas y el índice de abandono en barras de porcentaje —no de recuento—, para
 * que el apartado no sea otra tanda de barras iguales a las de arriba.
 */
export const ShameCard = memo(function ShameCard({ shame, scale }: { shame: ShameSummary; scale: ScoreScale }) {
  if (shame.total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? shame.avgGrade : shame.avgGrade / 20;

  return (
    <>
      <div className="stats-tiles">
        <StatTile label={L.total} value={<CountUp value={shame.total} />} />
        <StatTile label={L.hours} value={<CountUp value={shame.hours} format={formatHours} />} unit="h" />
        {shame.scored > 0 ? (
          <StatTile
            label={L.avgGrade}
            value={<CountUp value={avgInScale} format={formatDecimal} />}
            unit={scale === 'grade' ? UI_MESSAGES.stats.tiles.outOf100 : UI_MESSAGES.stats.tiles.outOf5}
            hint={UI_MESSAGES.stats.tiles.avgGradeHint(shame.scored)}
          />
        ) : null}
        <StatTile label={L.retry} value={<CountUp value={shame.retry} />} />
      </div>

      <div className="stats-split">
        <section>
          <h3>{L.reasons}</h3>
          {shame.reasons.length ? <TagChips tags={shame.reasons} tone="danger" /> : <p className="stats-empty">{L.noReasons}</p>}
        </section>
        <section>
          <h3>{L.genres}</h3>
          <TagBars tags={shame.genres} limit={6} />
        </section>
      </div>

      {shame.abandonRate.length ? (
        <section>
          <h3>{L.rate}</h3>
          <ul className="rate-list">
            {shame.abandonRate.map((entry, index) => (
              <li key={entry.tag} style={{ '--i': index, '--rate': `${entry.percent}%` } as CSSProperties}>
                <span className="rate-tag" title={entry.tag}>{entry.tag}</span>
                <span className="rate-track"><span className="rate-fill" /></span>
                <span className="rate-value">{L.rateValue(formatPercent(entry.percent), entry.abandoned, entry.decided)}</span>
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
