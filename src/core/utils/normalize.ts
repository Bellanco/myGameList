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
