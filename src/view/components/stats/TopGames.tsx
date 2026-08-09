import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { STATS_TOP_SIZE } from '../../../core/stats/computeStats';
import { ScoreDisplay } from '../ScoreDisplay';
import { TagRanking } from './TagRanking';
import { formatDecimal, formatHours } from './format';
import type { TopSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.top;

/** Metal de cada puesto del podio. El oro, la plata y el bronce se leen sin explicación. */
const MEDALS = ['gold', 'silver', 'bronze'];

/**
 * Retrato de tus mejores juegos: el podio y en qué se parecen entre sí.
 *
 * El podio son CIFRAS DESTACADAS, no un gráfico: tres valores no necesitan ejes. Lo que sí aporta un gráfico
 * es el agregado —qué géneros y plataformas se repiten en tu élite—, porque puesto al lado del reparto general
 * responde a una pregunta que ninguno de los dos contesta solo: si lo que más te gusta es lo que más juegas.
 */
export const TopGames = memo(function TopGames({ top, scale }: { top: TopSummary; scale: ScoreScale }) {
  if (top.sample === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? top.avgGrade : top.avgGrade / 20;
  const cutoffInScale = scale === 'grade' ? top.cutoff : top.cutoff / 20;

  return (
    <>
      <ol className="podium">
        {top.podium.map((game, index) => (
          <li key={game.id} className={`podium-step is-${MEDALS[index]}`} style={{ '--i': index } as CSSProperties}>
            <span className="podium-pos" aria-hidden="true">{index + 1}</span>
            <span className="podium-body">
              <span className="podium-name" title={game.name}>{game.name}</span>
              <span className="podium-meta">
                <ScoreDisplay game={{ grade: game.grade }} />
                {game.hours > 0 ? <small>{L.hours(formatHours(game.hours))}</small> : null}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="top-figures">
        <span><b>{formatDecimal(avgInScale)}</b>{L.avgGrade(top.sample)}</span>
        {top.avgHours > 0 ? <span><b>{formatHours(top.avgHours)} h</b>{L.avgHours}</span> : null}
        <span><b>{formatDecimal(cutoffInScale)}</b>{L.cutoff}</span>
      </div>

      <div className="stats-split">
        <section>
          <h3>{L.genres(top.sample)}</h3>
          <TagRanking tags={top.genres} limit={5} />
        </section>
        <section>
          <h3>{L.platforms}</h3>
          <TagRanking tags={top.platforms} limit={5} />
        </section>
      </div>

      {top.sample >= STATS_TOP_SIZE ? <p className="stats-note">{L.note(STATS_TOP_SIZE)}</p> : null}
    </>
  );
});
