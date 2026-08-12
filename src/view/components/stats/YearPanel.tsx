import { memo } from 'react';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { GenreRadar } from './GenreRadar';
import { Beeswarm } from './Beeswarm';
import { TagRanking } from './TagRanking';
import { GameCards } from './GameCards';
import { TopGames } from './TopGames';
import { useStatsLabels } from './statsVoice';
import { formatDecimal, formatHours } from './format';
import type { YearSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

/**
 * Resumen de un año: solo COMPLETADOS. Los abandonados y los próximos no llevan año —el formulario únicamente
 * pide "Años completado" en completados—, así que su sitio es "General" y aquí se dice en el pie.
 *
 * Es el mismo resumen en tu perfil y en el de otra persona (ver `StatsPanel`): lo único que cambia es la voz de
 * los textos y, con `full` a false, las piezas de tiempo, que sin horas no tienen nada que decir.
 */
export const YearPanel = memo(function YearPanel({
  summary,
  scale,
  full = true,
}: {
  summary: YearSummary;
  scale: ScoreScale;
  /** ¿Hay datos privados (horas)? Con la proyección pública el año se cuenta sin tiempo de juego. */
  full?: boolean;
}) {
  const L = useStatsLabels();
  const avgInScale = scale === 'grade' ? summary.avgGrade : summary.avgGrade / 20;
  const hasHours = full && summary.hours > 0;

  return (
    <>
      <div className="stats-card stats-card-tiles">
        <div className="stats-tiles">
          <StatTile label={L.year.completed} value={<CountUp value={summary.completed} />} />
          {hasHours ? (
            <StatTile label={L.year.hours} value={<CountUp value={summary.hours} format={formatHours} />} unit="h" />
          ) : null}
          {summary.scored > 0 ? (
            <StatTile
              label={L.year.avgGrade}
              value={<CountUp value={avgInScale} format={formatDecimal} />}
              unit={scale === 'grade' ? L.tiles.outOf100 : L.tiles.outOf5}
              hint={L.tiles.avgGradeHint(summary.scored)}
            />
          ) : null}
          {summary.best ? (
            <StatTile
              label={L.year.best}
              value={<span className="stat-tile-text">{summary.best.name}</span>}
              // Las horas son las SUYAS: antes se colaban aquí las del juego más largo del año, que casi nunca
              // es el mismo y hacía que la tarjeta dijera una cosa y mostrara otra.
              hint={summary.best.hours > 0 ? L.tiles.longestHint(formatHours(summary.best.hours)) : undefined}
            />
          ) : null}
          {hasHours && summary.longest && summary.longest.id !== summary.best?.id ? (
            <StatTile
              label={L.tiles.longest}
              value={<span className="stat-tile-text">{summary.longest.name}</span>}
              hint={L.tiles.longestHint(formatHours(summary.longest.hours))}
            />
          ) : null}
        </div>
      </div>

      {summary.top.sample > 0 ? (
        <div className="stats-card">
          <h2>{L.top.titleYear(summary.year)}</h2>
          <p className="stats-card-sub">{L.top.subtitle}</p>
          <TopGames top={summary.top} scale={scale} average={summary.avgGrade} showRest={false} year={summary.year} />
        </div>
      ) : null}

      <div className="stats-card stats-card-half">
        <h2>{L.radar.title}</h2>
        <p className="stats-card-sub">{L.radar.subtitleYear(summary.year)}</p>
        <GenreRadar tags={summary.genreAffinity} />
      </div>

      <div className="stats-card stats-card-half">
        <h2>{L.grades.title}</h2>
        <p className="stats-card-sub">{L.grades.subtitle}</p>
        <Beeswarm games={summary.games.filter((game) => game.grade > 0)} scale={scale} />
      </div>

      {summary.platforms.length ? (
        <div className="stats-card">
          <h2>{L.wishlist.platforms}</h2>
          <TagRanking tags={summary.platforms} limit={8} />
        </div>
      ) : null}

      <div className="stats-card">
        <h2>{L.year.gamesTitle(summary.year)}</h2>
        <p className="stats-card-sub">{L.year.gamesSubtitle}</p>
        <GameCards games={summary.games} ranked />
      </div>
    </>
  );
});
