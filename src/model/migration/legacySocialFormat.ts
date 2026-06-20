// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Compatibilidad de lectura del gist social: los docs VIEJOS guardaban el review completo en
// `review` (sharedLists) o `reviewText` (activity). El formato NUEVO usa `snippet`. Este helper
// elige el texto de origen para derivar el snippet, tolerando ambos formatos.

/** Devuelve el texto de reseña de origen, prefiriendo el snippet nuevo y cayendo a review/reviewText viejos. */
export function pickLegacyReviewText(source: Record<string, unknown>): string {
  return String(source.snippet ?? source.review ?? source.reviewText ?? '');
}
