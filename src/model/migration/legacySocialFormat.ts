// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Compatibilidad de lectura del gist social: los docs VIEJOS guardaban el review completo en
// `review` (sharedLists) o `reviewText` (activity). El formato NUEVO usa `snippet`. Este helper
// elige el texto de origen para derivar el snippet, tolerando ambos formatos.

/** Devuelve el texto de reseña de origen, prefiriendo el snippet nuevo y cayendo a review/reviewText viejos. */
export function pickLegacyReviewText(source: Record<string, unknown>): string {
  return String(source.snippet ?? source.review ?? source.reviewText ?? '');
}

/** True si la lista contiene algún item con el texto de reseña completo legacy (`review`/`reviewText`). */
function hasLegacyReviewText(items: unknown): boolean {
  return (
    Array.isArray(items) &&
    items.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return 'review' in record || 'reviewText' in record;
    })
  );
}

/**
 * Condicional de upgrade proactivo del gist SOCIAL: ¿el contenido remoto conserva el texto de reseña
 * completo legacy (`review`/`reviewText`) en activity o recommendations? El formato actual es index-only
 * (solo `snippet`). Opera sobre el RAW parseado (antes de normalizar). Reescribir el gist lo deja snippet-only.
 */
export function socialGistNeedsRewrite(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (hasLegacyReviewText(o.activity) || hasLegacyReviewText(o.recommendations)) return true;
  const profile = (o.profile && typeof o.profile === 'object' ? o.profile : {}) as Record<string, unknown>;
  return hasLegacyReviewText(profile.recommendations);
}
