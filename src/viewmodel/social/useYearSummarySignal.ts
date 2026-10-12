import { useCallback, useRef } from 'react';
import { isShareSeason, summaryYear } from '../../core/stats/summaryYear';
import { yearSummaryPublishedKey } from '../../core/constants/storageKeys';
import { publishYearSummarySeen } from '../../model/repository/firebaseRepository';

function readPublished(uid: string): number {
  try {
    return Number(localStorage.getItem(yearSummaryPublishedKey(uid))) || 0;
  } catch {
    return 0;
  }
}

function writePublished(uid: string, year: number): void {
  try {
    localStorage.setItem(yearSummaryPublishedKey(uid), String(year));
  } catch {
    /* Sin almacenamiento solo se pierde la caché: la próxima vez se volvería a publicar el mismo año. */
  }
}

export interface YearSummarySignal {
  /** ¿Ya les salió la tarjeta a tus amistades ese año? (en tu entrada del directorio o en la caché local) */
  isAnnounced: (year: number) => boolean;
  /**
   * Avisa a tus amistades. `true` si la tarjeta queda publicada (ahora o de antes); `false` si no toca o la
   * escritura falla (sin red, reglas), y entonces no se apunta nada y se puede volver a intentar.
   */
  announce: (year: number) => Promise<boolean>;
}

/**
 * «AVISAR A MIS AMISTADES»: lo que hace que a tus amistades les salga la tarjeta destacada de tu resumen del año en
 * el feed. Lo dispara COMPARTIR (la hoja del resumen, ver `docs/plan-resumen-del-ano.md`), no abrirlo: es un acto
 * explícito de quien lo publica.
 *
 * Solo publica si se cumple todo:
 *  - es TEMPORADA (del 15 de diciembre al 15 de enero) y el resumen es el del año que se estrenó;
 *  - tu perfil está publicado (sin él no hay documento que leer ni amistades a las que avisar);
 *  - ese año no está ya publicado: ni en tu entrada del directorio (`alreadySeenYear`), ni en la caché local.
 *
 * Una sola vez por año, por tanto: actualizar el enlace público después no genera otra tarjeta.
 */
export function useYearSummarySignal({
  uid,
  published,
  alreadySeenYear,
}: {
  uid: string;
  published: boolean;
  /** El año que tu entrada del directorio ya trae publicado, si lo hay. */
  alreadySeenYear: number | null;
}): YearSummarySignal {
  const inFlight = useRef<Promise<boolean> | null>(null);
  const isAnnounced = useCallback(
    (year: number) => Boolean(uid) && (alreadySeenYear === year || readPublished(uid) === year),
    [alreadySeenYear, uid],
  );
  const announce = useCallback(
    async (year: number) => {
      if (isAnnounced(year)) return true;
      const now = new Date();
      if (!uid || !published || !isShareSeason(now) || year !== summaryYear(now)) return false;
      if (inFlight.current) return inFlight.current;
      inFlight.current = publishYearSummarySeen(uid, year)
        .then(() => {
          writePublished(uid, year);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          inFlight.current = null;
        });
      return inFlight.current;
    },
    [isAnnounced, published, uid],
  );
  return { isAnnounced, announce };
}
