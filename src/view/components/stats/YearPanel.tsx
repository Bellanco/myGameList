import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { StatTile } from './StatTile';
import { GenreRadar } from './GenreRadar';
import { GradeHistogram } from './GradeHistogram';
import { TagBars } from './TagBars';
import { GameRefList } from './GameRefList';
import { formatCount, formatDecimal, formatHours } from './format';
import type { YearSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats;

/**
 * Resumen de un año: solo COMPLETADOS. Los abandonados y los próximos no llevan año —el formulario únicamente
 * pide "Años completado" en completados—, así que su sitio es "General" y aquí se dice en el pie.
 */
export const YearPanel = memo(function YearPanel({ summary, scale }: { summary: YearSummary; scale: ScoreScale }) {
  const avgInScale = scale === 'grade' ? summary.avgGrade : summary.avgGrade / 20;

  return (
    <>
      <div className="stats-card stats-card-tiles">
        <div className="stats-tiles">
          <StatTile label={L.year.completed} value={formatCount(summary.completed)} />
          <StatTile label={L.year.hours} value={formatHours(summary.hours)} unit="h" />
          {summary.scored > 0 ? (
            <StatTile
              label={L.year.avgGrade}
              value={formatDecimal(avgInScale)}
              unit={scale === 'grade' ? L.tiles.outOf100 : L.tiles.outOf5}
              hint={L.tiles.avgGradeHint(summary.scored)}
            />
          ) : null}
          {summary.best ? (
            <StatTile
              label={L.year.best}
              value={<span className="stat-tile-text">{summary.best.name}</span>}
              hint={summary.longest && summary.longest.hours > 0 ? L.tiles.longestHint(formatHours(summary.longest.hours)) : undefined}
            />
          ) : null}
        </div>
        <p className="stats-note">{L.year.note}</p>
      </div>

      <div className="stats-card stats-card-half">
        <h2>{L.radar.title}</h2>
        <p className="stats-card-sub">{L.radar.subtitleYear(summary.year)}</p>
        <GenreRadar tags={summary.genres} />
      </div>

      <div className="stats-card stats-card-half">
        <h2>{L.grades.title}</h2>
        <p className="stats-card-sub">{L.grades.subtitle}</p>
        <GradeHistogram grades={summary.grades} scale={scale} />
      </div>

      {summary.platforms.length ? (
        <div className="stats-card">
          <h2>{L.wishlist.platforms}</h2>
          <TagBars tags={summary.platforms} limit={8} />
        </div>
      ) : null}

      <div className="stats-card">
        <h2>{L.year.gamesTitle(summary.year)}</h2>
        <p className="stats-card-sub">{L.year.gamesSubtitle}</p>
        <GameRefList games={summary.games} ranked />
      </div>
    </>
  );
});
