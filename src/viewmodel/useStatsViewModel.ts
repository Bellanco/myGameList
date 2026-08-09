import { useEffect, useMemo, useState } from 'react';
import { computeStats } from '../core/stats/computeStats';
import { loadBacklogHistory } from '../model/repository/statsSnapshotRepository';
import { useScoreScale } from '../view/hooks/useScoreScale';
import type { StatsSummary, YearSummary } from '../core/stats/types';
import type { ScoreScale } from '../core/utils/scoreScale';
import type { TabData } from '../model/types/game';
import type { BacklogSnapshot } from '../model/types/local';

/** Métrica del gráfico anual: nº de juegos completados o horas atribuidas a cada año. */
export type YearMetric = 'games' | 'hours';

/** Qué se está mirando: el resumen completo o un año concreto. */
export type StatsScope = 'general' | number;

/** Cuántos puntos hace falta tener registrados para que el histórico real desbanque a la curva derivada. */
export const MIN_HISTORY_POINTS = 2;

export interface StatsViewModel {
  stats: StatsSummary;
  /** Escala de puntuación de la cuenta; decide si las notas se etiquetan en estrellas o en nota 0–100. */
  scale: ScoreScale;
  yearMetric: YearMetric;
  setYearMetric: (metric: YearMetric) => void;
  /** ¿Hay algo que enseñar? Con la biblioteca vacía el panel muestra su estado vacío en vez de ceros. */
  isEmpty: boolean;
  scope: StatsScope;
  setScope: (scope: StatsScope) => void;
  /** Años con juegos completados, de más reciente a más antiguo. Es la lista de pestañas. */
  availableYears: number[];
  /** Resumen del año seleccionado; null cuando se está en "General". */
  yearSummary: YearSummary | null;
  /** Instantáneas mensuales reales registradas en este dispositivo (ver `statsSnapshotRepository`). */
  history: BacklogSnapshot[];
  /** true cuando el histórico real ya tiene puntos suficientes y sustituye a la curva derivada. */
  hasRealHistory: boolean;
}

/**
 * View-model del panel "Perfil". Solo compone: el cálculo vive en `core/stats` (puro y testeable) y aquí se
 * memoiza contra `data`, que es la MISMA referencia que ya mantiene `useGameListViewModel` — así el resumen se
 * recalcula al editar un juego y en ningún otro render. El hub se carga con `lazy`, de modo que este hook (y su
 * pasada por la biblioteca) no existe hasta que se entra en la pantalla.
 *
 * La única lectura asíncrona es el histórico del backlog, que vive en el meta local de IndexedDB porque no se
 * puede derivar de los datos (ver `statsSnapshotRepository`). Todo lo demás sale del gist de juegos ya cargado:
 * ni una consulta de red.
 */
export function useStatsViewModel(data: TabData): StatsViewModel {
  const stats = useMemo(() => computeStats(data), [data]);
  const scale = useScoreScale();
  const [yearMetric, setYearMetric] = useState<YearMetric>('games');
  const [scope, setScope] = useState<StatsScope>('general');
  const [history, setHistory] = useState<BacklogSnapshot[]>([]);

  useEffect(() => {
    let alive = true;
    void loadBacklogHistory().then((points) => {
      // Sin puntos no hay nada que cambiar: se evita un render extra en el caso más común, que es el de quien
      // todavía no tiene histórico (la función acaba de empezar a registrar).
      if (alive && points.length > 0) setHistory(points);
    });
    return () => {
      alive = false;
    };
  }, []);

  const availableYears = useMemo(() => stats.byYear.map((summary) => summary.year), [stats.byYear]);

  // Si el año seleccionado desaparece (se borró el último juego de ese año), se vuelve a "General" en vez de
  // quedarse en una pestaña que ya no existe.
  useEffect(() => {
    if (typeof scope === 'number' && !availableYears.includes(scope)) setScope('general');
  }, [availableYears, scope]);

  const yearSummary = useMemo(
    () => (typeof scope === 'number' ? stats.byYear.find((summary) => summary.year === scope) ?? null : null),
    [scope, stats.byYear],
  );

  return {
    stats,
    scale,
    yearMetric,
    setYearMetric,
    isEmpty: stats.totalGames === 0,
    scope,
    setScope,
    availableYears,
    yearSummary,
    history,
    hasRealHistory: history.length >= MIN_HISTORY_POINTS,
  };
}
