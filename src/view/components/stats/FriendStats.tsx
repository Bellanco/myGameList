import { memo, useMemo, useRef, useState } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { computeStats } from '../../../core/stats/computeStats';
import { friendStatsBlocks, friendStatsHasYearTabs, friendVisibleTabs, toFriendTabData } from '../../../core/stats/friendStats';
import { useScoreScale } from '../../hooks/useScoreScale';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { ScopeTabs } from './ScopeTabs';
import { YearChart } from './YearChart';
import { GenreRadar } from './GenreRadar';
import { PolarRose } from './PolarRose';
import { Beeswarm } from './Beeswarm';
import { SpeedGauge } from './SpeedGauge';
import { TopGames } from './TopGames';
import { GameCards } from './GameCards';
import { useRevealOnScroll } from './useRevealOnScroll';
import { formatDecimal } from './format';
import { TAB_IDS, type TabId } from '../../../model/types/game';
import type { ProfileTier } from '../../../core/constants/tiers';
import type { SocialSharedGame } from '../../../model/repository/socialGistRepository';
// Misma hoja que el panel propio: entra en el chunk del hub social, que también es perezoso.
import '../../../styles/stats.scss';

const L = UI_MESSAGES.stats;

/** Nombre de cada lista para el aviso de reciprocidad. */
const TAB_NAMES: Record<TabId, string> = L.backlog.lists;

interface FriendStatsProps {
  sharedLists: Partial<Record<TabId, SocialSharedGame[]>>;
  /** Rango de QUIEN MIRA: es su privilegio y decide cuánto ve. */
  viewerTier: ProfileTier;
  /** Listas que el espectador esconde en su propio perfil. Lo que esconde, no lo ve. */
  viewerHiddenTabs: readonly TabId[];
}

/**
 * Las estadísticas de otra persona, dentro de su perfil.
 *
 * Se calculan con el MISMO `computeStats` que el panel propio, alimentado con lo que su gist social ya publica:
 * ni una consulta más ni un dato nuevo. Lo que no viaja por ese canal —las horas, la fecha de llegada a la
 * lista, las razones de abandono— no se enseña, así que aquí no hay bloques de horas ni evolución del backlog.
 *
 * Dos reglas gobiernan lo que se ve: el RANGO de quien mira (cuántos bloques) y la RECIPROCIDAD (lo que uno
 * esconde de sus listas tampoco lo ve de las ajenas). La cuenta de administración queda fuera de la segunda.
 */
export const FriendStats = memo(function FriendStats({ sharedLists, viewerTier, viewerHiddenTabs }: FriendStatsProps) {
  const scale = useScoreScale();
  const [scope, setScope] = useState<'general' | number>('general');
  const hub = useRef<HTMLElement>(null);
  useRevealOnScroll(hub, scope);

  const available = useMemo(
    () => TAB_IDS.filter((tab) => (sharedLists[tab]?.length || 0) > 0),
    [sharedLists],
  );
  const { tabs, blockedByViewer } = useMemo(
    () => friendVisibleTabs(available, viewerHiddenTabs, viewerTier),
    [available, viewerHiddenTabs, viewerTier],
  );

  const stats = useMemo(() => computeStats(toFriendTabData(sharedLists, tabs)), [sharedLists, tabs]);
  const blocks = friendStatsBlocks(viewerTier);
  const years = useMemo(() => stats.byYear.map((summary) => summary.year), [stats.byYear]);
  const yearSummary = typeof scope === 'number' ? stats.byYear.find((summary) => summary.year === scope) ?? null : null;
  const withYears = friendStatsHasYearTabs(viewerTier) && years.length > 0;

  if (available.length === 0) {
    return <p className="stats-empty">{L.friend.empty}</p>;
  }

  // Reciprocidad total: quien lo esconde todo no ve nada, y se le dice por qué en vez de dejar el hueco mudo.
  if (tabs.length === 0) {
    return <p className="stats-note">{L.friend.blockedAll}</p>;
  }

  const avgInScale = scale === 'grade' ? stats.scored.avgGrade : stats.scored.avgGrade / 20;
  const blockedNames = blockedByViewer.map((tab) => TAB_NAMES[tab].toLowerCase()).join(', ');

  return (
    <section className="stats-hub is-friend" aria-label={L.friend.title} ref={hub}>
      {withYears ? <ScopeTabs scope={scope} years={years} onChange={setScope} /> : null}

      {yearSummary ? (
        <>
          <div className="stats-card stats-card-tiles">
            <div className="stats-tiles">
              <StatTile label={L.year.completed} value={<CountUp value={yearSummary.completed} />} />
              {yearSummary.scored > 0 ? (
                <StatTile
                  label={L.year.avgGrade}
                  value={<CountUp value={scale === 'grade' ? yearSummary.avgGrade : yearSummary.avgGrade / 20} format={formatDecimal} />}
                  unit={scale === 'grade' ? L.tiles.outOf100 : L.tiles.outOf5}
                />
              ) : null}
              {yearSummary.best ? (
                <StatTile label={L.year.best} value={<span className="stat-tile-text">{yearSummary.best.name}</span>} />
              ) : null}
            </div>
          </div>

          {yearSummary.top.sample > 0 ? (
            <div className="stats-card">
              <h2>{L.top.titleYear(yearSummary.year)}</h2>
              <TopGames top={yearSummary.top} scale={scale} average={yearSummary.avgGrade} showRest={false} />
            </div>
          ) : null}

          <div className="stats-card stats-card-half">
            <h2>{L.radar.title}</h2>
            <GenreRadar tags={yearSummary.genres} />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.grades.title}</h2>
            <Beeswarm games={yearSummary.games.filter((game) => game.grade > 0)} scale={scale} average={yearSummary.avgGrade} />
          </div>

          <div className="stats-card">
            <h2>{L.year.gamesTitle(yearSummary.year)}</h2>
            <GameCards games={yearSummary.games} ranked />
          </div>
        </>
      ) : (
        <>
          <div className="stats-card stats-card-tiles">
            <p className="stats-card-sub">{L.friend.subtitle}</p>
            <div className="stats-tiles">
              <StatTile label={L.tiles.games} value={<CountUp value={stats.totalGames} />} />
              {stats.scored.count > 0 ? (
                <StatTile
                  label={L.tiles.avgGrade}
                  value={<CountUp value={avgInScale} format={formatDecimal} />}
                  unit={scale === 'grade' ? L.tiles.outOf100 : L.tiles.outOf5}
                  hint={L.tiles.avgGradeHint(stats.scored.count)}
                />
              ) : null}
            </div>
            {blockedByViewer.length ? <p className="stats-note">{L.friend.blocked(blockedNames)}</p> : null}
          </div>

          {blocks.includes('top') && stats.top.sample > 0 ? (
            <div className="stats-card">
              <h2>{L.top.title}</h2>
              <TopGames top={stats.top} scale={scale} average={stats.scored.avgGrade} />
            </div>
          ) : null}

          {blocks.includes('years') && stats.years.length > 0 ? (
            <div className="stats-card">
              <h2>{L.years.title}</h2>
              {/* Sin conmutador de métrica: las horas no viajan por el canal social, así que solo hay juegos. */}
              <YearChart years={stats.years} metric="games" onMetricChange={() => {}} switchable={false} />
            </div>
          ) : null}

          {blocks.includes('radar') ? (
            <div className="stats-card stats-card-half">
              <h2>{L.radar.title}</h2>
              <GenreRadar tags={stats.genres} />
            </div>
          ) : null}

          {blocks.includes('genres') ? (
            <div className="stats-card stats-card-half">
              <h2>{L.genres.title}</h2>
              <PolarRose tags={stats.genres} />
            </div>
          ) : null}

          {blocks.includes('grades') && stats.scored.count > 0 ? (
            <div className="stats-card stats-card-half">
              <h2>{L.grades.title}</h2>
              <Beeswarm games={stats.scored.games} scale={scale} average={stats.scored.avgGrade} />
            </div>
          ) : null}

          {blocks.includes('ratio') ? (
            <div className="stats-card stats-card-half">
              <h2>{L.ratio.title}</h2>
              <SpeedGauge ratio={stats.completionRatio} />
            </div>
          ) : null}

          {/* Al que no llega su rango se le dice, en vez de dejar que se pregunte si su amigo no tiene más. */}
          {blocks.length < 6 ? <p className="stats-note">{L.friend.tierMore}</p> : null}
        </>
      )}
    </section>
  );
});
