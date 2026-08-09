import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { useStatsViewModel } from '../../../viewmodel/useStatsViewModel';
import { StatTile } from './StatTile';
import { YearChart } from './YearChart';
import { GradeHistogram } from './GradeHistogram';
import { TagBars } from './TagBars';
import { RatioDonut } from './RatioDonut';
import { formatCount, formatDecimal, formatHours } from './format';
import type { TabData } from '../../../model/types/game';
// La hoja del panel se importa AQUÍ y no desde `index.scss`: como el hub entra por `lazy()`, Vite emite su CSS
// en el mismo chunk perezoso y el arranque no carga ni un byte de estilos de esta pantalla.
import '../../../styles/stats.scss';

const L = UI_MESSAGES.stats;

/**
 * Panel "Perfil": la biblioteca en números. Todo lo que se ve aquí es DERIVADO de las listas que ya están en
 * memoria (ver `core/stats/computeStats`): no lee de red, no escribe nada y no publica nada al canal social.
 */
export const StatsHub = memo(function StatsHub({ games }: { games: TabData }) {
  const { stats, scale, yearMetric, setYearMetric, isEmpty } = useStatsViewModel(games);

  if (isEmpty) {
    return (
      <section className="stats-hub" aria-label={UI_MESSAGES.nav.stats}>
        <div className="stats-card">
          <h2>{L.empty.title}</h2>
          <p className="stats-card-sub">{L.empty.body}</p>
        </div>
      </section>
    );
  }

  const { counts } = stats;
  // La nota media se muestra en la escala que use la cuenta: sobre 100 (nota fina) o sobre 5 (estrellas).
  const avgInScale = scale === 'grade' ? stats.scored.avgGrade : stats.scored.avgGrade / 20;

  return (
    <section className="stats-hub" aria-label={UI_MESSAGES.nav.stats}>
      <div className="stats-card stats-card-tiles">
        <p className="stats-card-sub">{L.subtitle}</p>
        <div className="stats-tiles">
          <StatTile
            label={L.tiles.games}
            value={formatCount(stats.totalGames)}
            hint={L.tiles.gamesHint(counts.e, counts.p)}
          />
          <StatTile
            label={L.tiles.hours}
            value={formatHours(stats.totalHours)}
            unit="h"
            hint={L.tiles.hoursHint(formatHours(stats.completedHours))}
          />
          <StatTile
            label={L.tiles.avgGrade}
            value={stats.scored.count ? formatDecimal(avgInScale) : L.tiles.noData}
            unit={stats.scored.count ? (scale === 'grade' ? L.tiles.outOf100 : L.tiles.outOf5) : undefined}
            hint={stats.scored.count ? L.tiles.avgGradeHint(stats.scored.count) : undefined}
          />
          <StatTile
            label={L.tiles.longest}
            value={<span className="stat-tile-text">{stats.longest ? stats.longest.name : L.tiles.noData}</span>}
            hint={stats.longest ? L.tiles.longestHint(formatHours(stats.longest.hours)) : undefined}
          />
        </div>
      </div>

      <div className="stats-card">
        <h2>{L.years.title}</h2>
        <p className="stats-card-sub">{L.years.subtitle}</p>
        <YearChart years={stats.years} metric={yearMetric} onMetricChange={setYearMetric} />
      </div>

      <div className="stats-card stats-card-half">
        <h2>{L.grades.title}</h2>
        <p className="stats-card-sub">{L.grades.subtitle}</p>
        <GradeHistogram grades={stats.grades} scale={scale} />
      </div>

      <div className="stats-card stats-card-half">
        <h2>{L.ratio.title}</h2>
        <p className="stats-card-sub">{L.ratio.subtitle}</p>
        <RatioDonut ratio={stats.completionRatio} />
      </div>

      <div className="stats-card">
        <h2>{L.genres.title}</h2>
        <p className="stats-card-sub">{L.genres.subtitle}</p>
        <TagBars tags={stats.genres} />
      </div>
    </section>
  );
});
