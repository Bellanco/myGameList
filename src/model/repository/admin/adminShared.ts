// Piezas comunes a las cuatro áreas del panel de administración (censo, moderación, cutover y borrado).
//
// Aquí solo vive lo que usan VARIAS de ellas: el centinela de la colección, los umbrales de tiempo, la forma del
// resultado de una acción y los cuatro ayudantes de acceso a Firestore. Lo que use una sola área vive con ella.
//
// TODO lo que hay en `admin/` lo autoriza `isAdmin()` en firestore.rules (mismo correo + email verificado). Para
// cualquier otra sesión, cada función responde `permission-denied`: estos módulos no conceden nada por sí mismos,
// solo hablan con Firestore como el resto de repositorios.
import { initializeFirebaseServices, isPermissionDeniedError } from '../firebaseClient';

/** Documento centinela de la colección: ni es un usuario ni las reglas dejan tocarlo. */
export const PLACEHOLDER_ID = '_placeholder';

export const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A partir de cuándo una solicitud ENVIADA y nunca aceptada se considera fosilizada. Son dos umbrales distintos a
 * propósito, y el orden importa:
 *
 * - `STALE_PENDING_MS` (90 días) solo AVISA (señal `stale-pending-out`). A los tres meses ya no es una petición
 *   reciente que el otro no haya visto todavía: o no le interesa o no vuelve.
 * - `FOSSIL_PENDING_MS` (180 días) es el que habilita la purga. El doble de margen antes de BORRAR algo de dos
 *   personas: la señal es reversible (desaparece si la aceptan) y el borrado no.
 */
export const STALE_PENDING_MS = 90 * 24 * 60 * 60 * 1000;
export const FOSSIL_PENDING_MS = 180 * 24 * 60 * 60 * 1000;


/** Campos legacy purgables, uno a uno: cada uno tiene consecuencias distintas para su dueño. */
export type LegacyProfileField = 'email' | 'gamesGistId' | 'token';

export const LEGACY_FIELD_PATHS: Record<LegacyProfileField, string> = {
  email: 'email', // audit-allow: es la RUTA del campo a borrar con deleteField(), no un email almacenado
  gamesGistId: 'social.gamesGistId', // audit-allow: es la RUTA del campo a borrar con deleteField(), no un valor almacenado
  token: 'social.githubToken',
};

export interface AdminActionResult {
  ok: boolean;
  failures: string[];
}

/** Lo que se sabe de un uid a partir de sus documentos de amistad. */

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `updatedAt` puede venir como Timestamp de Firestore o como número (docs de clientes antiguos). */
export function toMillis(value: { toMillis?: () => number } | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const millis = value?.toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : 0;
}

/** Traduce el `permission-denied` de las reglas al lenguaje del panel (la causa siempre es la misma: no eres admin). */
export function toAdminError(error: unknown, what: string): Error {
  if (isPermissionDeniedError(error)) {
    return new Error(`Sin permisos de administrador para ${what}. Inicia sesión con la cuenta de administrador.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function requireServices() {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  return services;
}

/**
 * Amistades agregadas por uid. Una única lectura de la colección entera: el admin las ve todas (regla `isAdmin()`),
 * y contarlas en el cliente evita N consultas (una por usuario) para un dato que es puramente informativo.
 */
