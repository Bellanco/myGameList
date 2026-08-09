import { useMemo, useState } from 'react';
import { computeStats } from '../core/stats/computeStats';
import { useScoreScale } from '../view/hooks/useScoreScale';
import type { StatsSummary } from '../core/stats/types';
import type { ScoreScale } from '../core/utils/scoreScale';
import type { TabData } from '../model/types/game';

/** Métrica del gráfico anual: nº de juegos completados o horas atribuidas a cada año. */
export type YearMetric = 'games' | 'hours';

export interface StatsViewModel {
  stats: StatsSummary;
  /** Escala de puntuación de la cuenta; decide si el histograma se etiqueta en estrellas o en nota 0–100. */
  scale: ScoreScale;
  yearMetric: YearMetric;
  setYearMetric: (metric: YearMetric) => void;
  /** ¿Hay algo que enseñar? Con la biblioteca vacía el panel muestra su estado vacío en vez de ceros. */
  isEmpty: boolean;
}

/**
 * View-model del panel "Perfil". Solo compone: el cálculo vive en `core/stats` (puro y testeable) y aquí se
 * memoiza contra `data`, que es la MISMA referencia que ya mantiene `useGameListViewModel` — así el resumen se
 * recalcula al editar un juego y en ningún otro render. El hub se carga con `lazy`, así que este hook (y su
 * pasada por la biblioteca) no existe hasta que se entra en la pantalla.
 */
export function useStatsViewModel(data: TabData): StatsViewModel {
  const stats = useMemo(() => computeStats(data), [data]);
  const scale = useScoreScale();
  const [yearMetric, setYearMetric] = useState<YearMetric>('games');

  return {
    stats,
    scale,
    yearMetric,
    setYearMetric,
    isEmpty: stats.totalGames === 0,
  };
}
