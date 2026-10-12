// LA DIRECCIÓN DE UNA RESEÑA DEL PANEL: `/stats/resenas/7-k3f9a2`.
//
// El `7` es el id del juego, que se asigna por biblioteca (`max(ids)+1`): el 7 de una persona es otro juego en la de
// otra. Abierta en otro navegador —una dirección copiada de la barra—, enseñaba la reseña de OTRO juego de quien la
// abría. La huella (`k3f9a2`) sale del nombre del juego y lo distingue: si no casa con el juego 7 de esta biblioteca,
// la reseña no es esta (12-10-2026).
//
// HUELLA Y NO EL NOMBRE, por dos motivos: la ruta viaja a la analítica (Firebase Analytics, con consentimiento, y la
// telemetría propia, ver `telemetryRepository`), y en claro diría qué juegos reseña cada uno; y un título largo
// alargaría la dirección sin límite. Seis caracteres siempre. No es anónima frente a quien calcule la huella de un
// catálogo de títulos a propósito, pero no lo deja a la vista.
//
// LO QUE NO CAMBIA: la forma vieja, `/stats/resenas/7`, se sigue leyendo (marcadores, `/perfil/resenas/7`) y abre la
// reseña como siempre. Renombrar un juego cambia su huella: sus direcciones con la anterior dejan de abrirla.

export const STATS_REVIEWS_ROUTE = '/stats/resenas';

const FINGERPRINT_LENGTH = 6;
const FINGERPRINT_SPACE = 36 ** FINGERPRINT_LENGTH;

/**
 * Huella del nombre: FNV-1a de 32 bits sobre el nombre recortado y en minúsculas, en base 36. Sin quitar ediciones ni
 * signos (no es `gameTitleKey`): aquí solo hace falta que el mismo texto dé la misma huella, y cuanto más sencilla
 * sea la regla, menos riesgo hay de que un cambio en ella rompa las direcciones ya compartidas.
 */
export function reviewFingerprint(name: string): string {
  const text = String(name || '').trim().normalize('NFC').toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % FINGERPRINT_SPACE).toString(36).padStart(FINGERPRINT_LENGTH, '0');
}

export function statsReviewPath(gameId: number, name: string): string {
  return `${STATS_REVIEWS_ROUTE}/${gameId}-${reviewFingerprint(name)}`;
}

/**
 * La reseña que pide la ruta: `gameId` 0 = el listado (o una ruta que no es de una reseña). `fingerprint` vacío =
 * dirección de la forma vieja, que no se puede comprobar.
 */
export function parseStatsReviewPath(pathname: string): { gameId: number; fingerprint: string } {
  const match = /^\/stats\/resenas\/(\d+)(?:-([0-9a-z]+))?$/.exec(pathname);
  if (!match) return { gameId: 0, fingerprint: '' };
  return { gameId: Number(match[1]), fingerprint: match[2] || '' };
}

/** ¿Es esta la reseña que pide la dirección? Sin huella (forma vieja), basta el id. */
export function matchesReviewFingerprint(fingerprint: string, name: string): boolean {
  return !fingerprint || fingerprint === reviewFingerprint(name);
}
