import { memo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { SpeedGauge } from './SpeedGauge';
import { TopGames } from './TopGames';
import { ReviewTraits } from './ReviewTraits';
import { StatsReviews } from './StatsReviews';
import { useRevealOnScroll } from './useRevealOnScroll';
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
 * Tus reseñas viven en una sub-ruta del panel. La PANTALLA no es nueva: reutiliza la lista y el detalle del hub
 * social (ver `StatsReviews`); lo que cambia es la ruta y de dónde salen los datos. Enlazar directamente al hub
 * las habría dejado detrás de su asistente de configuración para quien no tenga espacio social montado, y una
 * reseña propia no depende de eso.
 */
const PANEL_ROUTE = '/perfil';
const REVIEWS_ROUTE = '/perfil/resenas';
const reviewRoute = (gameId: number) => `/perfil/resenas/${gameId}`;

/** Id del juego cuya reseña se abre, leído de la ruta; 0 = el listado. */
function reviewIdFrom(pathname: string): number {
  const match = /^\/perfil\/resenas\/(\d+)$/.exec(pathname);
  return match ? Number(match[1]) : 0;
}

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
  const navigate = useNavigate();
  const location = useLocation();
  const openReviews = useCallback(() => { void navigate(REVIEWS_ROUTE); }, [navigate]);
  /**
   * Abrir una reseña recuerda DE DÓNDE se vino: quien la abre desde el podio o desde una ficha del top espera
   * volver al panel, y quien la abre desde el listado, al listado. El origen viaja en el estado de la ruta, así
   * que el atrás del navegador y el botón de la pantalla llevan al mismo sitio.
   */
  const openReviewFrom = useCallback(
    (gameId: number, backTo: string) => { void navigate(reviewRoute(gameId), { state: { backTo } }); },
    [navigate],
  );
  const openReviewFromPanel = useCallback((gameId: number) => openReviewFrom(gameId, PANEL_ROUTE), [openReviewFrom]);
  const openReviewFromList = useCallback((gameId: number) => openReviewFrom(gameId, REVIEWS_ROUTE), [openReviewFrom]);
  const backToPanel = useCallback(() => { void navigate(PANEL_ROUTE); }, [navigate]);
  const backFromReview = useCallback(() => {
    const from = (location.state as { backTo?: string } | null)?.backTo;
    void navigate(from === PANEL_ROUTE ? PANEL_ROUTE : REVIEWS_ROUTE);
  }, [navigate, location.state]);
  const onReviewsRoute = location.pathname.startsWith(REVIEWS_ROUTE);
  // Las tarjetas se destapan al llegar a ellas. Se rearma al cambiar de periodo, porque las de la pestaña
  // nueva son otros elementos y entran sin haberse visto nunca.
  const hub = useRef<HTMLElement>(null);
  useRevealOnScroll(hub, scope);

  /**
   * Abrir un año desde la curva: además de cambiar de periodo, sube al principio del panel. Sin esto, el clic
   * dejaba al usuario a media página de un panel que ya es otro, con el selector —la pista de dónde está— tres
   * pantallas más arriba. El selector de arriba no lo necesita: quien lo usa ya está mirándolo.
   */
  const openYearFromChart = useCallback((year: number) => {
    vm.setScope(year);
    hub.current?.scrollIntoView({ block: 'start' });
  }, [vm]);

  if (onReviewsRoute) {
    return (
      <StatsReviews
        games={games}
        gameId={reviewIdFrom(location.pathname)}
        onBack={backToPanel}
        onOpenReview={openReviewFromList}
        onBackToList={backFromReview}
        backToPanel={(location.state as { backTo?: string } | null)?.backTo === PANEL_ROUTE}
      />
    );
  }

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
    <section className="stats-hub" aria-label={UI_MESSAGES.nav.stats} ref={hub}>
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
              {stats.reviews.count > 0 ? (
                <StatTile
                  label={L.reviews.tile}
                  value={<CountUp value={stats.reviews.count} />}
                  hint={L.reviews.tileHint(Math.round(stats.reviews.coverage))}
                  progress={stats.reviews.coverage}
                  onClick={openReviews}
                  actionLabel={L.reviews.tileAction}
                />
              ) : null}
            </div>
          </div>

          <div className="stats-card">
            <h2>{L.top.title}</h2>
            <p className="stats-card-sub">{L.top.subtitle}</p>
            <TopGames top={stats.top} scale={scale} average={stats.scored.avgGrade} onOpenReview={openReviewFromPanel} />
          </div>

          <div className="stats-card">
            <h2>{L.years.title}</h2>
            <p className="stats-card-sub">{L.years.subtitle}</p>
            {/* Pinchar un año de la curva abre su resumen: el mismo destino que el selector de arriba. */}
            <YearChart
              years={stats.years}
              metric={vm.yearMetric}
              onMetricChange={vm.setYearMetric}
              onSelectYear={openYearFromChart}
              scale={scale}
            />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.radar.title}</h2>
            <p className="stats-card-sub">{L.radar.subtitle}</p>
            <GenreRadar tags={stats.genreAffinity} />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.ratio.title}</h2>
            <p className="stats-card-sub">{L.ratio.subtitle}</p>
            <SpeedGauge ratio={stats.completionRatio} />
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
            <Beeswarm games={stats.scored.games} scale={scale} />
          </div>

          <div className="stats-card stats-card-half">
            <h2>{L.genres.title}</h2>
            <p className="stats-card-sub">{L.genres.subtitle}</p>
            <PolarRose tags={stats.genres} />
          </div>

          {stats.reviews.strengths.length || stats.reviews.weaknesses.length ? (
            <div className="stats-card">
              <h2>{L.reviews.title}</h2>
              <p className="stats-card-sub">{L.reviews.subtitle}</p>
              <ReviewTraits strengths={stats.reviews.strengths} weaknesses={stats.reviews.weaknesses} />
            </div>
          ) : null}

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
