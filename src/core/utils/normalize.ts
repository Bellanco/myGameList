/** Normaliza un timestamp: devuelve el número si es finito y > 0, si no el fallback. */
export function normalizeTimestamp(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

/** Acota una puntuación al rango [0, 5]; 0 si no es finita. */
export function clampRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, numeric));
}

/**
 * Normaliza las horas jugadas: número finito y MAYOR que cero, o `null` («sin dato»).
 *
 * El 0 no es una afirmación ("lo jugué cero horas"), es la casilla sin rellenar: tratarlo como dato escondería
 * el hueco detrás de un valor falso y falsearía las medias de las estadísticas. Es el mismo criterio que ya
 * aplican `hoursOf` (logros) y `gameHours` (estadísticas), y el que decide si el detalle pinta la categoría.
 */
export function normalizeHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
