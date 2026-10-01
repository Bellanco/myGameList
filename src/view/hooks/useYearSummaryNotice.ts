import { useCallback, useState } from 'react';
import { YEAR_SUMMARY_TOLD_KEY } from '../../core/constants/storageKeys';
import { hasCompletedIn, isSummarySeason, summaryYear } from '../../core/stats/summaryYear';
import type { GameItem } from '../../model/types/game';

function readTold(): number {
  try {
    return Number(localStorage.getItem(YEAR_SUMMARY_TOLD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeTold(year: number): void {
  try {
    localStorage.setItem(YEAR_SUMMARY_TOLD_KEY, String(year));
  } catch {
    /* Sin almacenamiento el aviso podría volver a salir en otra visita: es un aviso, no un dato. */
  }
}

/**
 * EL AVISO DEL 15 DE DICIEMBRE: «tu resumen de 2026 ya está aquí», en el carril de abajo a la izquierda.
 *
 * Sale una vez por año y navegador, la primera vez que se abre la app en TEMPORADA (del 15 al 31), y solo si
 * hay dónde verlo: un perfil social (el resumen vive en él) y algo completado ese año (si no, no hay resumen).
 * Se apunta como dado al MONTARSE la cápsula (`markShown`), como el aviso del administrador: si un logro se queda
 * el carril, este no se ha dicho todavía y espera su turno.
 */
export function useYearSummaryNotice(
  hasSocialProfile: boolean,
  completed: readonly GameItem[],
): { year: number | null; markShown: () => void; dismiss: () => void } {
  const [closedYear, setClosedYear] = useState(readTold);
  const now = new Date();
  const year = summaryYear(now);
  const show = hasSocialProfile && isSummarySeason(now) && closedYear !== year && hasCompletedIn(completed, year);
  const markShown = useCallback(() => writeTold(year), [year]);
  const dismiss = useCallback(() => {
    writeTold(year);
    setClosedYear(year);
  }, [year]);
  return { year: show ? year : null, markShown, dismiss };
}
