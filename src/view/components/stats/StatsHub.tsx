import { memo, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStatsViewModel } from '../../../viewmodel/useStatsViewModel';
import { StatsPanel } from './StatsPanel';
import { StatsReviews } from './StatsReviews';
import { AchievementsCard } from './AchievementsCard';
import { AchievementsScreen } from './AchievementsScreen';
import { listForScreen, useAchievements } from '../../../viewmodel/useAchievements';
import { useAchievementsConfig } from '../../hooks/useAchievementsConfig';
import { useOpenFrontier } from '../../hooks/useOpenFrontier';
import { ENABLE_ACHIEVEMENTS } from '../../../core/achievements/flags';
import { libraryStart } from '../../../core/achievements/metrics';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import { OWN_STATS_BLOCKS } from '../../../core/stats/types';
import type { TabData } from '../../../model/types/game';
// La hoja del panel se importa AQUÍ y no desde `index.scss`: como el hub entra por `lazy()`, Vite emite su CSS
// en el mismo chunk perezoso y el arranque no carga ni un byte de estilos de esta pantalla.
import '../../../styles/stats.scss';

/**
 * Tus reseñas viven en una sub-ruta del panel. La PANTALLA no es nueva: reutiliza la lista y el detalle del hub
 * social (ver `StatsReviews`); lo que cambia es la ruta y de dónde salen los datos. Enlazar directamente al hub
 * las habría dejado detrás de su asistente de configuración para quien no tenga espacio social montado, y una
 * reseña propia no depende de eso.
 */
const PANEL_ROUTE = '/perfil';
const REVIEWS_ROUTE = '/perfil/resenas';
/**
 * Los LOGROS son de primer nivel: `/logros`, no `/perfil/logros`. Está declarada en `core/constants/routes` con
 * `section: 'stats'`, así que el cromo es el mismo y la resuelve este hub, igual que las reseñas.
 */
const ACHIEVEMENTS_ROUTE = '/logros';
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
  // Lo que el panel decide para todo el mundo: qué escaleras están ocultas y hasta dónde las ha abierto la
  // comunidad. Llega vacío y se pone al día un instante después: la pantalla no espera a la red para pintarse
  // (ver `useAchievementsConfig`), y vacío significa el comportamiento de siempre.
  const achievementsConfig = useAchievementsConfig();
  // La apertura entra también en la FRACCIÓN: el denominador cuenta lo que hoy está abierto, no el catálogo
  // entero, así que ampliar el catálogo no le baja el porcentaje de golpe a nadie.
  const achievements = useAchievements({ games, open: achievementsConfig.open });
  // El día en que empieza la biblioteca, que es el suelo con el que se fecha lo conseguido antes de que hubiera
  // con qué fecharlo. Una pasada sobre la biblioteca, contra la misma referencia que ya memoiza el panel.
  const libraryFloor = useMemo(() => libraryStart(games), [games]);
  /**
   * Y ABRE PARA LOS DEMÁS lo que hayas alcanzado tú: en cuanto alguien llega a un escalón, ese escalón queda
   * abierto para todo el mundo, que es lo que hace que el denominador («196 de 249») sea el mismo en todos los
   * aparatos. Solo escribe cuando adelanta algo — ver `core/achievements/frontier.ts`.
   */
  useOpenFrontier(achievements.byId, achievementsConfig.open);
  const navigate = useNavigate();
  const location = useLocation();
  const openReviews = useCallback(() => { void navigate(REVIEWS_ROUTE); }, [navigate]);
  const openAchievements = useCallback(() => { void navigate(ACHIEVEMENTS_ROUTE); }, [navigate]);
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

  if (ENABLE_ACHIEVEMENTS && location.pathname.startsWith(ACHIEVEMENTS_ROUTE)) {
    return (
      <AchievementsScreen
        items={listForScreen(achievements.byId, achievementsConfig)}
        summary={achievements.summary}
        // NADA DE OTRAS PERSONAS EN ESTA SECCIÓN, y es la regla que decide las dos ausencias de abajo: aquí no se
        // lee un dato que no sea tuyo. El porcentaje comparado sale de los espejos que descarga el directorio del
        // hub, así que aquí no se pinta — y tampoco se va a buscar.
        rarity={null}
        since={libraryFloor}
        backLabel={ACHIEVEMENTS_UI.backToPanel}
        onBack={backToPanel}
        // Y POR ESO TAMPOCO HAY BOTÓN DE «LOGROS GLOBALES»: esa vista mide el catálogo contra las vitrinas de
        // otras personas, así que vive donde esos datos están —la pantalla de logros del hub— y no aquí. Estuvo,
        // llevando a `/social/profiles/me/globales`, y además de traerse datos ajenos al panel dejaba al usuario
        // en otra sección sin camino de vuelta al sitio de entrada.
      />
    );
  }

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

  return (
    <StatsPanel
      stats={vm.stats}
      scale={vm.scale}
      // De ti mismo se ve TODO: aquí no hay rango que recorte ni datos que no hayan llegado.
      blocks={OWN_STATS_BLOCKS}
      voice="own"
      full
      scope={vm.scope}
      years={vm.availableYears}
      onScope={vm.setScope}
      yearSummary={vm.yearSummary}
      yearMetric={vm.yearMetric}
      onYearMetric={vm.setYearMetric}
      backlog={{
        points: vm.hasRealHistory ? vm.history : vm.stats.arrivals,
        mode: vm.hasRealHistory ? 'real' : 'derived',
      }}
      onOpenReviews={openReviews}
      onOpenReview={openReviewFromPanel}
      achievements={
        ENABLE_ACHIEVEMENTS ? (
          <AchievementsCard
            summary={achievements.summary}
            earned={achievements.earned}
            onOpen={openAchievements}
          />
        ) : null
      }
    />
  );
});
