// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Compatibilidad de lectura del gist social: los docs VIEJOS guardaban el review completo en
// `review` (sharedLists) o `reviewText` (activity). El formato NUEVO usa `snippet`. Este helper
// elige el texto de origen para derivar el snippet, tolerando ambos formatos.

/** Devuelve el texto de reseña de origen, prefiriendo el snippet nuevo y cayendo a review/reviewText viejos. */
export function pickLegacyReviewText(source: Record<string, unknown>): string {
  return String(source.snippet ?? source.review ?? source.reviewText ?? '');
}

// 6.2b — uid→profileId en el canal social. El formato NUEVO identifica al actor con `actorProfileId`
// (pseudónimo); el VIEJO usaba `actorUid` (uid de Firebase). Igual para recomendaciones
// (`fromProfileId` nuevo / `fromUid` viejo). Estos lectores toleran ambos: prefieren el pseudónimo y
// caen al uid (que, en gists ajenos aún sin migrar, se usa como identificador hasta que su dueño reescriba).

/** Identificador del actor de una entrada de activity (nuevo `actorProfileId` / viejo `actorUid`). */
export function pickLegacyActorId(source: Record<string, unknown>): string {
  return String(source.actorProfileId ?? source.actorUid ?? '').trim();
}

/** Identificador "from" de una recomendación (nuevo `fromProfileId` / viejo `fromUid`). */
export function pickLegacyFromId(source: Record<string, unknown>): string {
  return String(source.fromProfileId ?? source.fromUid ?? '').trim();
}

/** True si algún item conserva la forma vieja con uid (`actorUid`/`fromUid`) sin el pseudónimo nuevo. */
function hasLegacyUidIdentity(items: unknown): boolean {
  return (
    Array.isArray(items) &&
    items.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return ('actorUid' in record && !('actorProfileId' in record)) || ('fromUid' in record && !('fromProfileId' in record));
    })
  );
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
  // 6.2b: también si el gist aún identifica al actor por uid (actorUid/fromUid) en vez de profileId.
  if (hasLegacyUidIdentity(o.activity) || hasLegacyUidIdentity(o.recommendations)) return true;
  const profile = (o.profile && typeof o.profile === 'object' ? o.profile : {}) as Record<string, unknown>;
  if (hasLegacyReviewText(profile.recommendations)) return true;
  // ST3: arrays de recomendaciones legacy (top-level o en profile) con contenido → reescribir para dejarlos fuera
  // (se fusionan en activity en la lectura; el rewrite los elimina del gist). El formato actual no los lleva.
  if (Array.isArray(o.recommendations) && o.recommendations.length > 0) return true;
  if (Array.isArray(profile.recommendations) && profile.recommendations.length > 0) return true;
  return false;
}
