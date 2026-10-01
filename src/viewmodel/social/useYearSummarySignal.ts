import { useCallback, useRef } from 'react';
import { isSummarySeason, summaryYear } from '../../core/stats/summaryYear';
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
    /* Sin almacenamiento solo se pierde la caché: la próxima apertura volvería a publicar el mismo año. */
  }
}

/**
 * «YA HE VISTO MI RESUMEN»: lo que se llama al abrir tu propio resumen del año, y lo que hace que a tus amistades
 * les salga la tarjeta destacada en el feed.
 *
 * Solo publica si se cumple todo:
 *  - es TEMPORADA (del 15 al 31 de diciembre) y el resumen abierto es el del año que se estrena;
 *  - tu perfil está publicado (sin él no hay documento que leer ni amistades a las que avisar);
 *  - ese año no está ya publicado: ni en tu entrada del directorio (`alreadySeenYear`), ni en la caché local.
 *
 * Una sola vez por año, por tanto: las actualizaciones silenciosas hasta el 31 no generan otra tarjeta. Si la
 * escritura falla (sin red, reglas), no se apunta nada y se vuelve a intentar la próxima vez que lo abras.
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
}): (year: number) => void {
  const inFlight = useRef(false);
  return useCallback(
    (year: number) => {
      const now = new Date();
      if (!uid || !published || !isSummarySeason(now) || year !== summaryYear(now)) return;
      if (alreadySeenYear === year || readPublished(uid) === year || inFlight.current) return;
      inFlight.current = true;
      publishYearSummarySeen(uid, year)
        .then(() => writePublished(uid, year))
        // Best-effort, como el espejo de logros: fallar solo retrasa la tarjeta de tus amistades.
        .catch(() => undefined)
        .finally(() => {
          inFlight.current = false;
        });
    },
    [alreadySeenYear, published, uid],
  );
}
