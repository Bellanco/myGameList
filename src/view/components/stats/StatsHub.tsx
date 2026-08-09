import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { useStatsViewModel } from '../../../viewmodel/useStatsViewModel';
import { StatTile } from './StatTile';
import { ScopeTabs } from './ScopeTabs';
import { YearChart } from './YearChart';
import { YearPanel } from './YearPanel';
import { GenreRadar } from './GenreRadar';
import { Beeswarm } from './Beeswarm';
import { BacklogArea } from './BacklogArea';
import { PolarRose } from './PolarRose';
import { RatioPie } from './RatioPie';
import { TopGames } from './TopGames';
import { ShameCard } from './ShameCard';
import { WishlistCard } from './WishlistCard';
import { CountUp } from './CountUp';
import { formatDecimal, formatHours } from './format';
import type { TabData } from '../../../model/types/game';
// La hoja del panel se importa AQUÍ y no desde `index.scss`: como el hub entra por `lazy()`, Vite emite su CSS
// en el mismo chunk perezoso y el arranque no carga ni un byte de estilos de esta pantalla.
import '../../../styles/stats.scss';

const L = UI_MESSAGES.stats;

/**
 * Panel "Perfil": la biblioteca en números, con una vista general y una pestaña por año.
 *
 * Todo lo que se ve aquí es DERIVADO de las listas que ya están en memoria (ver `core/stats/computeStats`), es
 * decir, del gist de juegos que la app ya tiene cargado: ni una consulta de red, ni un gist nuevo, ni una
 * escritura. La única lectura extra es el histórico mensual del backlog, que vive en el meta local porque no se
 * puede deducir de los datos.
 */
export const StatsHub = memo(function StatsHub({ games }: { games: TabData }) {
  const vm = useStatsViewModel(games);
  const { stats, scale, scope, yearSummary } = vm;

  if (vm.isEmpty) {
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
      <ScopeTabs scope={scope} years={vm.availableYears} onChange={vm.setScope} />

      {yearSummary ? (
        <YearPanel summary={yearSummary} scale={scale} />
      ) : (
        <>
          <div className="stats-card stats-card-tiles">
            <p className="stats-card-sub">{L.subtitle}</p>
            <div className="stats-tiles">
              <StatTile
                label={L.tiles.games}
                value={<CountUp value={stats.totalGames} />}
                hint={L.tiles.gamesHint(counts.e, counts.p)}
              />
              <StatTile
                label={L.tiles.hours}
                value={<CountUp value={stats.totalHours} format={formatHours} />}
                unit="h"
                hint={L.tiles.hoursHint(formatHours(stats.completedHours))}
              />
              <StatTile
                label={L.tiles.avgGrade}
                value={stats.scored.count ? <CountUp value={avgInScale} format={formatDecimal} /> : L.tiles.noData}
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
            <h2>{L.top.title}</h2>
            <p className="stats-card-sub">{L.top.subtitle}</p>
            <TopGames top={stats.top} scale={scale} />
          </div>

          <div className="stats-card">
            <h2>{L.years.title}</h2>
            <p className="stats-card-sub">{L.years.subtitle}</p>
            <YearChart years={stats.years} metric={vm.yearMetric} onMetricChange={vm.setYearMetric} />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.radar.title}</h2>
            <p className="stats-card-sub">{L.radar.subtitle}</p>
            <GenreRadar tags={stats.genres} />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.ratio.title}</h2>
            <p className="stats-card-sub">{L.ratio.subtitle}</p>
            <RatioPie ratio={stats.completionRatio} />
          </div>

          <div className="stats-card">
            <h2>{L.backlog.title}</h2>
            {/* En cuanto el histórico real tiene puntos suficientes, sustituye a la curva derivada; hasta
                entonces se enseña la aproximación, dicha como tal en el pie del gráfico. */}
            <p className="stats-card-sub">{vm.hasRealHistory ? L.backlog.realSubtitle : L.backlog.derivedSubtitle}</p>
            <BacklogArea
              points={vm.hasRealHistory ? vm.history : stats.arrivals}
              mode={vm.hasRealHistory ? 'real' : 'derived'}
            />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.grades.title}</h2>
            <p className="stats-card-sub">{L.grades.subtitle}</p>
            <Beeswarm games={stats.scored.games} scale={scale} average={stats.scored.avgGrade} />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.genres.title}</h2>
            <p className="stats-card-sub">{L.genres.subtitle}</p>
            <PolarRose tags={stats.genres} />
          </div>

          <div className="stats-card">
            <h2>{L.shame.title}</h2>
            <p className="stats-card-sub">{L.shame.subtitle}</p>
            <ShameCard shame={stats.shame} scale={scale} />
          </div>

          <div className="stats-card">
            <h2>{L.wishlist.title}</h2>
            <p className="stats-card-sub">{L.wishlist.subtitle}</p>
            <WishlistCard wishlist={stats.wishlist} scale={scale} />
          </div>
        </>
      )}
    </section>
  );
});
