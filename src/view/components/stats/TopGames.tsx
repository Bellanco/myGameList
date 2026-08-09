import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { GENRE_GRADE_MIN } from '../../../core/stats/computeStats';
import { ScoreDisplay } from '../ScoreDisplay';
import { RadialBars } from './RadialBars';
import { DonutShare } from './DonutShare';
import { Lollipop } from './Lollipop';
import { formatDecimal, formatHours } from './format';
import type { TopSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.top;

/** Metal de cada puesto del podio. El oro, la plata y el bronce se leen sin explicación. */
const MEDALS = ['gold', 'silver', 'bronze'];

/**
 * Retrato de tus mejores juegos: el podio, el resto del ranking y en qué se parecen entre sí.
 *
 * El podio son CIFRAS DESTACADAS, no un gráfico: tres valores no necesitan ejes. Lo que sí aporta un gráfico es
 * el agregado —qué géneros y plataformas se repiten en tu élite, y con cuál puntúas más alto—, porque puesto
 * al lado del reparto general responde a una pregunta que ninguno de los dos contesta solo: si lo que más te
 * gusta es lo que más juegas.
 */
interface TopGamesProps {
  top: TopSummary;
  scale: ScoreScale;
  /**
   * Nota media de TODO el ámbito (la biblioteca, o el año), que es contra la que se comparan los géneros.
   * Compararlos contra la media del top sería absurdo: ningún género podría superar a la élite que lo forma,
   * y todas las diferencias saldrían en negativo.
   */
  average: number;
}

export const TopGames = memo(function TopGames({ top, scale, average }: TopGamesProps) {
  if (top.sample === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? top.avgGrade : top.avgGrade / 20;
  const cutoffInScale = scale === 'grade' ? top.cutoff : top.cutoff / 20;
  // El podio ya enseña a los tres primeros: la lista recoge desde el cuarto.
  const rest = top.ranked.slice(top.podium.length);

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
                {game.replays > 1 ? (
                  <b className="podium-replays" title={L.replaysTitle(game.replays)}>{L.replays(game.replays)}</b>
                ) : null}
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

      {/* El resto del top en fichas: doce filas ocupaban media pantalla para decir lo mismo. */}
      {rest.length ? (
        <section>
          <h3>{L.ranked}</h3>
          <ol className="top-chips">
            {rest.map((game, index) => (
              <li key={game.id} style={{ '--i': index } as CSSProperties}>
                <span className="top-chip-pos" aria-hidden="true">{index + top.podium.length + 1}</span>
                <span className="top-chip-body">
                  <span className="top-chip-name" title={game.name}>{game.name}</span>
                  <span className="top-chip-meta">
                    <ScoreDisplay game={{ grade: game.grade }} />
                    {game.replays > 1 ? (
                      <b className="podium-replays" title={L.replaysTitle(game.replays)}>{L.replays(game.replays)}</b>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="stats-split">
        <section>
          <h3>{L.genres(top.sample)}</h3>
          <RadialBars tags={top.genres} />
        </section>
        <section>
          <h3>{L.platforms}</h3>
          <DonutShare tags={top.platforms} total={top.sample} label={L.donutCenter} />
        </section>
      </div>

      {top.byGenre.length ? (
        <section>
          <h3>{L.byGenre}</h3>
          <Lollipop rows={top.byGenre} average={average} scale={scale} />
          <p className="stats-note">{L.byGenreHint(GENRE_GRADE_MIN)}</p>
        </section>
      ) : null}
    </>
  );
});
