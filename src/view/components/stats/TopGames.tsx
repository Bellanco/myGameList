import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { ScoreDisplay } from '../ScoreDisplay';
import { ExplodedRose } from './ExplodedRose';
import { DonutShare } from './DonutShare';
import { ShineRows } from './ShineRows';
import { formatDecimal, formatHours } from './format';
import { GRADE_MAX, hueFromGrade } from '../../../core/utils/scoreScale';
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
  /**
   * Si se listan las fichas del resto del top. En la pestaña de un año se apaga: justo debajo va el listado
   * completo de ese año, y repetir sus doce primeros sería decir dos veces lo mismo.
   */
  showRest?: boolean;
}

export const TopGames = memo(function TopGames({ top, scale, average, showRest = true }: TopGamesProps) {
  if (top.sample === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? top.avgGrade : top.avgGrade / 20;
  const cutoffInScale = scale === 'grade' ? top.cutoff : top.cutoff / 20;
  // El podio ya enseña a los tres primeros: la lista recoge desde el cuarto.
  const rest = top.ranked.slice(top.podium.length);

  return (
    <>
      {/* El puesto va de MARCA DE AGUA al fondo de su tarjeta: da la jerarquía del podio sin robarle sitio al
          nombre, que es lo que se viene a leer. El metal lo dice además con palabras, para no depender del color. */}
      <ol className="podium">
        {top.podium.map((game, index) => (
          <li key={game.id} className={`podium-step is-${MEDALS[index]}`} style={{ '--i': index } as CSSProperties}>
            <span className="podium-ghost" aria-hidden="true">{index + 1}</span>
            <span className="podium-medal">{L.medals[index]}</span>
            <span className="podium-name" title={game.name}>{game.name}</span>
            <span className="podium-meta">
              <ScoreDisplay game={{ grade: game.grade }} />
              {game.replays > 1 ? (
                <b className="podium-replays" title={L.replaysTitle(game.replays)}>{L.replays(game.replays)}</b>
              ) : null}
              {game.hours > 0 ? <small>{L.hours(formatHours(game.hours))}</small> : null}
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
      {showRest && rest.length ? (
        <section>
          <h3>{L.ranked}</h3>
          {/* Misma receta que el podio —puesto al fondo— y una barra de nota al pie: puestas en rejilla, las
              barras dejan ver de un vistazo cómo caen las notas del cuarto al quince. */}
          <ol className="top-chips">
            {rest.map((game, index) => (
              <li key={game.id} style={{ '--i': index } as CSSProperties}>
                <span className="top-chip-ghost" aria-hidden="true">{index + top.podium.length + 1}</span>
                <span className="top-chip-name" title={game.name}>{game.name}</span>
                <span className="top-chip-meta">
                  <ScoreDisplay game={{ grade: game.grade }} />
                  {game.replays > 1 ? (
                    <b className="podium-replays" title={L.replaysTitle(game.replays)}>{L.replays(game.replays)}</b>
                  ) : null}
                </span>
                <span className="top-chip-bar" aria-hidden="true">
                  <i style={{ width: `${(game.grade / GRADE_MAX) * 100}%`, '--dot-hue': String(hueFromGrade(game.grade)) } as CSSProperties} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="stats-split">
        <section>
          <h3>{L.genres}</h3>
          <ExplodedRose tags={top.genres} total={top.sample} />
        </section>
        <section>
          <h3>{L.platforms}</h3>
          <DonutShare tags={top.platforms} total={top.sample} label={L.donutCenter} />
        </section>
      </div>

      {top.byGenre.length ? (
        <section>
          <h3>{L.byGenre}</h3>
          <ShineRows rows={top.byGenre} average={average} scale={scale} />
        </section>
      ) : null}
    </>
  );
});
