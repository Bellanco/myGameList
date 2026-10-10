import { useEffect } from 'react';
import { LEGACY_META_CLEANUP_KEY } from '../../core/constants/storageKeys';
import { runWhenIdle } from '../../core/utils/idle';
import { removeLegacyLocalMetaKeys } from '../../model/repository/localMetaCleanupRepository';

/** Valor de `LEGACY_META_CLEANUP_KEY` cuando ya está hecho. Cambiarlo hace que todos los dispositivos repitan. */
const CLEANUP_DONE = '1';

function alreadyDone(): boolean {
  try {
    return localStorage.getItem(LEGACY_META_CLEANUP_KEY) === CLEANUP_DONE;
  } catch {
    // Sin almacenamiento no se puede apuntar, y repetirlo en cada apertura sería una transacción por nada.
    return true;
  }
}

/**
 * Quita de `LocalMeta`, UNA vez por dispositivo y cuando el navegador queda ocioso, lo que ya no usa nadie (ver
 * `removeLegacyLocalMetaKeys`). Se monta desde `IdleWork`: no pinta nada ni corre prisa. Si falla, no se apunta y se
 * reintenta en la próxima apertura.
 */
export function useLegacyLocalMetaCleanup(): void {
  useEffect(() => {
    if (alreadyDone()) return undefined;
    return runWhenIdle(() => {
      void removeLegacyLocalMetaKeys()
        .then(() => {
          try {
            localStorage.setItem(LEGACY_META_CLEANUP_KEY, CLEANUP_DONE);
          } catch {
            /* sin almacenamiento, se repetirá: es barato */
          }
        })
        .catch(() => {});
    });
  }, []);
}
