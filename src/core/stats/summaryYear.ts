/**
 * EL CALENDARIO DEL RESUMEN DEL AÑO. Puro y diminuto a propósito: lo consulta `App` para decidir el aviso del día
 * 15, y eso lo mete en el arranque; el cálculo del resumen (`yearSummary.ts`) se queda en su chunk perezoso.
 *
 * El resumen del año en curso SE ESTRENA el 15 de diciembre y sigue actualizándose, sin avisar, hasta el 31. El
 * resto del año se enseña el anterior, ya cerrado. La TEMPORADA (del 15 al 31) es además la única ventana en la
 * que se avisa al dueño y se publica a sus amistades que ya lo ha visto: fuera de ella el resumen se puede abrir,
 * pero no anuncia nada.
 */

/** Día de diciembre en que se estrena el resumen del año en curso. */
export const SUMMARY_RELEASE_DAY = 15;

/** ¿Estamos en la temporada del resumen (del 15 al 31 de diciembre)? */
export function isSummarySeason(now: Date = new Date()): boolean {
  return now.getMonth() === 11 && now.getDate() >= SUMMARY_RELEASE_DAY;
}

/** El año que se resume: en temporada, el que está acabando; el resto del año, el anterior. */
export function summaryYear(now: Date = new Date()): number {
  return isSummarySeason(now) ? now.getFullYear() : now.getFullYear() - 1;
}

/** ¿Completó algo ese año? Es la condición para que haya resumen —y botón, y aviso—. */
export function hasCompletedIn(completed: ReadonlyArray<{ years?: number[] }>, year: number): boolean {
  return completed.some((game) => Array.isArray(game.years) && game.years.includes(year));
}
