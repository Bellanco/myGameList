import { memo, useMemo, useState } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { computeStats } from '../../../core/stats/computeStats';
import {
  FRIEND_STATS_MAX_BLOCKS,
  friendGamesAreFull,
  friendStatsBlocks,
  friendStatsData,
  friendStatsHasYearTabs,
  friendVisibleTabs,
  toFriendTabData,
  type FriendGame,
} from '../../../core/stats/friendStats';
import { useScoreScale } from '../../hooks/useScoreScale';
import { StatsPanel } from './StatsPanel';
import { TAB_IDS, type TabId } from '../../../model/types/game';
import type { ProfileTier } from '../../../core/constants/tiers';
import type { StatsScope, YearMetric } from '../../../viewmodel/useStatsViewModel';
// Misma hoja que el panel propio: entra en el chunk del hub social, que también es perezoso.
import '../../../styles/stats.scss';

const L = UI_MESSAGES.stats;

/** Nombre de cada lista para el aviso de reciprocidad. */
const TAB_NAMES: Record<TabId, string> = L.backlog.lists;

interface FriendStatsProps {
  sharedLists: Partial<Record<TabId, FriendGame[]>>;
  /** Rango de QUIEN MIRA: es su privilegio y decide cuánto ve. */
  viewerTier: ProfileTier;
  /** Listas que el espectador esconde en su propio perfil. Lo que esconde, no lo ve. */
  viewerHiddenTabs: readonly TabId[];
}

/**
 * Las estadísticas de otra persona, dentro de su perfil.
 *
 * NO es una pantalla aparte: monta el MISMO `StatsPanel` que tu panel de perfil, con el mismo `computeStats` y las
 * mismas piezas. Lo único que hace este componente es aplicar las reglas de quién mira, que son tres y viven en
 * `core/stats/friendStats`:
 *
 *  - el RANGO decide qué bloques se ven y si hay pestañas de año (`friendStatsBlocks`),
 *  - el RANGO decide también con qué datos se calcula (`friendStatsData`): la administración usa los juegos del
 *    gist de listados que el hub ya bajó —filtrados por los ajustes de privacidad de su dueño—, y el resto se
 *    queda en la proyección pública, aunque los juegos completos estén en memoria,
 *  - la RECIPROCIDAD quita las listas que el propio espectador esconde (`friendVisibleTabs`), de la que la cuenta
 *    de administración está exenta.
 *
 * Sus RESEÑAS no se pintan aquí en ningún caso: tienen su propio apartado en este mismo perfil.
 */
export const FriendStats = memo(function FriendStats({ sharedLists, viewerTier, viewerHiddenTabs }: FriendStatsProps) {
  const scale = useScoreScale();
  const [scope, setScope] = useState<StatsScope>('general');
  const [yearMetric, setYearMetric] = useState<YearMetric>('games');

  const available = useMemo(
    () => TAB_IDS.filter((tab) => (sharedLists[tab]?.length || 0) > 0),
    [sharedLists],
  );
  const { tabs, blockedByViewer } = useMemo(
    () => friendVisibleTabs(available, viewerHiddenTabs, viewerTier),
    [available, viewerHiddenTabs, viewerTier],
  );

  // El rango dice a qué datos tiene derecho; los datos dicen qué hay. Si el gist de listados no llegó, ni la
  // administración pinta el panel completo: se queda en la proyección pública en vez de enseñar ceros.
  const level = friendStatsData(viewerTier) === 'full' && friendGamesAreFull(sharedLists) ? 'full' : 'public';
  const stats = useMemo(() => computeStats(toFriendTabData(sharedLists, tabs, level)), [sharedLists, tabs, level]);
  const blocks = friendStatsBlocks(viewerTier);
  const years = useMemo(() => stats.byYear.map((summary) => summary.year), [stats.byYear]);
  const yearSummary = typeof scope === 'number' ? stats.byYear.find((summary) => summary.year === scope) ?? null : null;
  const withYears = friendStatsHasYearTabs(viewerTier);

  if (available.length === 0) {
    return <p className="stats-empty">{L.friend.empty}</p>;
  }

  // Reciprocidad total: quien lo esconde todo no ve nada, y se le dice por qué en vez de dejar el hueco mudo.
  if (tabs.length === 0) {
    return <p className="stats-note">{L.friend.blockedAll}</p>;
  }

  const blockedNames = blockedByViewer.map((tab) => TAB_NAMES[tab].toLowerCase()).join(', ');

  return (
    <StatsPanel
      stats={stats}
      scale={scale}
      blocks={blocks}
      voice="other"
      full={level === 'full'}
      scope={scope}
      years={years}
      onScope={withYears ? setScope : null}
      yearSummary={yearSummary}
      yearMetric={yearMetric}
      onYearMetric={setYearMetric}
      // Del backlog ajeno solo cabe la curva DERIVADA de sus fechas de llegada: el histórico mes a mes se
      // registra en tu aparato y no viaja con nadie.
      backlog={{ points: stats.arrivals, mode: 'derived' }}
      // Sus reseñas tienen su apartado en el perfil: aquí no hay cifra que abrir ni citas que pulsar.
      onOpenReviews={null}
      onOpenReview={null}
      notes={blockedByViewer.length ? <p className="stats-note">{L.friend.blocked(blockedNames)}</p> : null}
      // Al que no llega su rango se le dice, en vez de dejar que se pregunte si su amigo no tiene más.
      footNote={blocks.length < FRIEND_STATS_MAX_BLOCKS ? <p className="stats-note">{L.friend.tierMore}</p> : null}
    />
  );
});
