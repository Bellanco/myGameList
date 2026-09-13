import { SYNC_BADGE_TEXT } from '../core/constants/labels';
import type { SyncStatus } from './useSyncViewModel';

/**
 * Qué dice la línea de estado de la sincronización.
 *
 * Vive fuera de `App` porque es una REGLA, no un renderizado: el orden en el que estas cuatro señales se pisan
 * unas a otras es lo único que decide si el usuario puede fiarse de lo que lee, y merece poder probarse sin
 * montar la pantalla entera.
 *
 * El orden, de más urgente a menos:
 *   1. un error, que es lo único que pide hacer algo;
 *   2. un ciclo en marcha, que explica la espera;
 *   3. cambios sin subir — por debajo de los dos anteriores a propósito: mientras se está subiendo, «subiendo»
 *      informa más que «sin subir», y son verdad las dos;
 *   4. y si no, lo de siempre: sincronizado o sin configurar.
 */
export function resolveSyncBadge(status: SyncStatus, pendingUpload: boolean): string {
  if (status === 'error') return SYNC_BADGE_TEXT.error;
  if (status === 'syncing') return SYNC_BADGE_TEXT.syncing;
  if (pendingUpload) return SYNC_BADGE_TEXT.pending;
  return SYNC_BADGE_TEXT[status] || SYNC_BADGE_TEXT.idle;
}
