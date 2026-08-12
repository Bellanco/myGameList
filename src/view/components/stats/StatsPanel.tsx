import { memo, useRef, type ReactNode } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { StatTile } from './StatTile';
import { ScopeTabs } from './ScopeTabs';
import { YearPanel } from './YearPanel';
import { YearChart } from './YearChart';
import { GenreRadar } from './GenreRadar';
import { Beeswarm } from './Beeswarm';
import { BacklogArea } from './BacklogArea';
import { PolarRose } from './PolarRose';
import { SpeedGauge } from './SpeedGauge';
import { TopGames } from './TopGames';
import { ReviewTraits } from './ReviewTraits';
import { ShameCard } from './ShameCard';
import { WishlistCard } from './WishlistCard';
import { CountUp } from './CountUp';
import { useRevealOnScroll } from './useRevealOnScroll';
import { STATS_LABELS, StatsLabelsProvider, type StatsVoice } from './statsVoice';
import { formatDecimal, formatHours } from './format';
import type { ArrivalPoint, StatsBlock, StatsSummary, YearSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';
import type { StatsScope, YearMetric } from '../../../viewmodel/useStatsViewModel';

export interface StatsPanelProps {
  /** Resumen ya calculado (`computeStats`), sea de tu biblioteca o de la de otra persona. */
  stats: StatsSummary;
  scale: ScoreScale;
  /** Bloques que este espectador puede ver. El ORDEN lo manda el panel, no la lista. */
  blocks: readonly StatsBlock[];
  /** De quién habla: decide los textos (ver `statsVoice`) y el matiz visual del panel ajeno. */
  voice: StatsVoice;
  /**
   * ¿Se está calculando con los juegos COMPLETOS o con la proyección pública? Con la proyección se apagan las
   * piezas que dependen de campos que no viajan (horas, fecha de llegada, razones de abandono), en vez de
   * pintarlas a cero y hacer creer que esa persona no anota nada.
   */
  full: boolean;
  scope: StatsScope;
  /** Años con completados. Con `onScope` a null no hay selector y da igual lo que traiga. */
  years: number[];
  /** Cambiar de periodo; null cuando el espectador no tiene pestañas de año. */
  onScope: ((scope: StatsScope) => void) | null;
  yearSummary: YearSummary | null;
  yearMetric: YearMetric;
  onYearMetric: (metric: YearMetric) => void;
  /** Puntos de la evolución del backlog y de dónde salen (histórico real del aparato o curva derivada). */
  backlog: { points: ArrivalPoint[]; mode: 'real' | 'derived' } | null;
  /** Abre la pantalla con todas las reseñas desde la cifra destacada; null = sin enlace. */
  onOpenReviews: (() => void) | null;
  /** Abre la reseña de un juego desde el podio o el top; null = las fichas no son pulsables. */
  onOpenReview: ((gameId: number) => void) | null;
  /** Avisos de la vista bajo las cifras destacadas (reciprocidad de listas, por ejemplo). */
  notes?: ReactNode;
  /** Aviso de cierre (lo que el rango de quien mira todavía no alcanza). */
  footNote?: ReactNode;
}

/**
 * EL panel de estadísticas. Uno solo, para tu perfil y para el de cualquier otra persona.
 *
 * Antes había dos pantallas que montaban las mismas piezas con dos JSX distintos, y la ajena se quedaba atrás en
 * todo lo que no fuera el cálculo: sin subtítulos, con el resumen de año recortado a mano y hablando en segunda
 * persona de la biblioteca de otro. Aquí solo hay tres ejes de variación, y ninguno duplica pantalla:
 *
 *  - `blocks`: qué piezas se pueden ver. En tu perfil, todas; en el de otra persona lo decide tu RANGO.
 *  - `full`: con qué datos se ha calculado, que es lo que apaga las piezas sin dato en vez de pintarlas a cero.
 *  - `voice`: de quién se habla, que es lo único que cambia en los textos.
 *
 * Todo lo que se ve es DERIVADO de listas que ya están en memoria (ver `core/stats/computeStats`): ni una
 * consulta de red, ni un gist nuevo, ni una escritura.
 */
export const StatsPanel = memo(function StatsPanel({
  stats,
  scale,
  blocks,
  voice,
  full,
  scope,
  years,
  onScope,
  yearSummary,
  yearMetric,
  onYearMetric,
  backlog,
  onOpenReviews,
  onOpenReview,
  notes,
  footNote,
}: StatsPanelProps) {
  const L = STATS_LABELS[voice];
  // Las tarjetas se destapan al llegar a ellas. Se rearma al cambiar de periodo, porque las de la pestaña
  // nueva son otros elementos y entran sin haberse visto nunca.
  const hub = useRef<HTMLElement>(null);
  useRevealOnScroll(hub, scope);

  /**
   * Abrir un año desde la curva: además de cambiar de periodo, sube al principio del panel. Sin esto, el clic
   * dejaba al usuario a media página de un panel que ya es otro, con el selector —la pista de dónde está— tres
   * pantallas más arriba. El selector de arriba no lo necesita: quien lo usa ya está mirándolo.
   */
  const openYearFromChart = onScope
    ? (year: number) => {
        onScope(year);
        hub.current?.scrollIntoView({ block: 'start' });
      }
    : undefined;

  /**
   * De TI se enseña el panel COMPLETO, huecos incluidos: cada pieza dice lo que falta («todavía no has puntuado
   * ningún juego», «0 h») y eso es media guía de qué rellenar. De otra persona, no: un hueco en su panel no es
   * tarea de nadie, así que lo que no tiene nada que contar directamente no se monta.
   */
  const own = voice === 'own';
  const label = own ? UI_MESSAGES.nav.stats : L.friend.title;
  const has = (block: StatsBlock) => blocks.includes(block);
  // Las horas mandan sobre varias piezas a la vez: la cifra de tiempo, la partida más larga y la métrica que se
  // puede conmutar en el año a año. Faltan con la proyección pública y también con quien oculta su tiempo de
  // juego, y en los dos casos la respuesta es la misma: de otra persona no se enseña lo que no hay.
  const hasHours = full && stats.totalHours > 0;

  const body = () => {
    if (stats.totalGames === 0) {
      return (
        <div className="stats-card">
          <h2>{L.empty.title}</h2>
          <p className="stats-card-sub">{L.empty.body}</p>
        </div>
      );
    }

    if (yearSummary) {
      return <YearPanel summary={yearSummary} scale={scale} full={full} />;
    }

    const { counts } = stats;
    // La nota media se muestra en la escala que use la cuenta: sobre 100 (nota fina) o sobre 5 (estrellas).
    const avgInScale = scale === 'grade' ? stats.scored.avgGrade : stats.scored.avgGrade / 20;

    return (
      <>
        <div className="stats-card stats-card-tiles">
          <p className="stats-card-sub">{L.subtitle}</p>
          <div className="stats-tiles">
            <StatTile
              label={L.tiles.games}
              value={<CountUp value={stats.totalGames} />}
              // Sin nada en curso ni en próximos la pista no dice nada; con listas que no se comparten, mentiría.
              hint={counts.e + counts.p > 0 ? L.tiles.gamesHint(counts.e, counts.p) : undefined}
            />
            {own || hasHours ? (
              <StatTile
                label={L.tiles.hours}
                value={<CountUp value={stats.totalHours} format={formatHours} />}
                unit="h"
                hint={L.tiles.hoursHint(formatHours(stats.completedHours))}
              />
            ) : null}
            <StatTile
              label={L.tiles.avgGrade}
              value={stats.scored.count ? <CountUp value={avgInScale} format={formatDecimal} /> : L.tiles.noData}
              unit={stats.scored.count ? (scale === 'grade' ? L.tiles.outOf100 : L.tiles.outOf5) : undefined}
              hint={stats.scored.count ? L.tiles.avgGradeHint(stats.scored.count) : undefined}
            />
            {own || (hasHours && stats.longest) ? (
              <StatTile
                label={L.tiles.longest}
                value={<span className="stat-tile-text">{stats.longest ? stats.longest.name : L.tiles.noData}</span>}
                hint={stats.longest ? L.tiles.longestHint(formatHours(stats.longest.hours)) : undefined}
              />
            ) : null}
            {has('reviews') && stats.reviews.count > 0 && onOpenReviews ? (
              <StatTile
                label={L.reviews.tile}
                value={<CountUp value={stats.reviews.count} />}
                hint={L.reviews.tileHint(Math.round(stats.reviews.coverage))}
                progress={stats.reviews.coverage}
                onClick={onOpenReviews}
                actionLabel={L.reviews.tileAction}
              />
            ) : null}
          </div>
          {notes}
        </div>

        {has('top') && (own || stats.top.sample > 0) ? (
          <div className="stats-card">
            <h2>{L.top.title}</h2>
            <p className="stats-card-sub">{L.top.subtitle}</p>
            <TopGames
              top={stats.top}
              scale={scale}
              average={stats.scored.avgGrade}
              onOpenReview={onOpenReview ?? undefined}
            />
          </div>
        ) : null}

        {has('years') && (own || stats.years.length > 0) ? (
          <div className="stats-card">
            <h2>{L.years.title}</h2>
            <p className="stats-card-sub">{L.years.subtitle}</p>
            {/* Pinchar un año de la curva abre su resumen: el mismo destino que el selector de arriba. Sin
                pestañas de año (rango que no llega) la curva se queda como lectura, sin destino. */}
            <YearChart
              years={stats.years}
              metric={hasHours ? yearMetric : 'games'}
              onMetricChange={onYearMetric}
              switchable={hasHours}
              onSelectYear={openYearFromChart}
              scale={scale}
            />
          </div>
        ) : null}

        {has('radar') ? (
          <div className="stats-card stats-card-half">
            <h2>{L.radar.title}</h2>
            <p className="stats-card-sub">{L.radar.subtitle}</p>
            <GenreRadar tags={stats.genreAffinity} />
          </div>
        ) : null}

        {has('ratio') ? (
          <div className="stats-card stats-card-half">
            <h2>{L.ratio.title}</h2>
            <p className="stats-card-sub">{L.ratio.subtitle}</p>
            <SpeedGauge ratio={stats.completionRatio} />
          </div>
        ) : null}

        {has('backlog') && backlog && (own || backlog.points.length > 0) ? (
          <div className="stats-card">
            <h2>{L.backlog.title}</h2>
            {/* En cuanto el histórico real tiene puntos suficientes, sustituye a la curva derivada; hasta
                entonces se enseña la aproximación, dicha como tal en el pie del gráfico. */}
            <p className="stats-card-sub">
              {backlog.mode === 'real' ? L.backlog.realSubtitle : L.backlog.derivedSubtitle}
            </p>
            <BacklogArea points={backlog.points} mode={backlog.mode} />
          </div>
        ) : null}

        {has('grades') && (own || stats.scored.count > 0) ? (
          <div className="stats-card stats-card-half">
            <h2>{L.grades.title}</h2>
            <p className="stats-card-sub">{L.grades.subtitle}</p>
            <Beeswarm games={stats.scored.games} scale={scale} />
          </div>
        ) : null}

        {has('genres') ? (
          <div className="stats-card stats-card-half">
            <h2>{L.genres.title}</h2>
            <p className="stats-card-sub">{L.genres.subtitle}</p>
            <PolarRose tags={stats.genres} />
          </div>
        ) : null}

        {has('reviews') && (stats.reviews.strengths.length || stats.reviews.weaknesses.length) ? (
          <div className="stats-card">
            <h2>{L.reviews.title}</h2>
            <p className="stats-card-sub">{L.reviews.subtitle}</p>
            <ReviewTraits strengths={stats.reviews.strengths} weaknesses={stats.reviews.weaknesses} />
          </div>
        ) : null}

        {has('shame') && (own || stats.shame.total > 0) ? (
          <div className="stats-card">
            <h2>{L.shame.title}</h2>
            <p className="stats-card-sub">{L.shame.subtitle}</p>
            <ShameCard shame={stats.shame} scale={scale} publicOnly={!full} />
          </div>
        ) : null}

        {has('wishlist') && (own || stats.wishlist.total > 0) ? (
          <div className="stats-card">
            <h2>{L.wishlist.title}</h2>
            <p className="stats-card-sub">{L.wishlist.subtitle}</p>
            <WishlistCard wishlist={stats.wishlist} scale={scale} publicOnly={!full} />
          </div>
        ) : null}

        {footNote}
      </>
    );
  };

  return (
    <StatsLabelsProvider value={L}>
      <section className={`stats-hub${own ? '' : ' is-friend'}`} aria-label={label} ref={hub}>
        {onScope && years.length > 0 ? <ScopeTabs scope={scope} years={years} onChange={onScope} /> : null}
        {body()}
      </section>
    </StatsLabelsProvider>
  );
});
