// El índice de «análisis sugeridos» de cada autor: `relidx:{uid}` (ver `keys.ts`).
//
// POR QUÉ EXISTE. El pie de un enlace público (`/api/share/related/:token`) es ANÓNIMO, y antes resolvía sus
// sugerencias con un `list()` del prefijo `user:{uid}:` más una lectura por cada artículo del autor. El plan
// gratuito de KV da 1.000 `list` al día para TODA la cuenta, y los comparten «mis enlaces» y publicar: mil visitas
// a enlaces compartidos —de gente sin cuenta, desde fuera de la app— dejaban a todo el mundo sin publicar hasta el
// día siguiente. Con este índice, una visita cuesta dos lecturas y ningún `list` (ver
// `docs/plan-capacidad-gratuita.md`, fase 2).
//
// QUÉ GUARDA: lo justo para puntuar y pintar las tarjetas, que es exactamente lo que `related` ya enseñaba —un
// adelanto del texto, la nota, la fecha y los géneros—. Nada que no saliera ya en su respuesta; el uid va en la
// clave, igual que en `owner:{token}`, y nunca en el valor.
//
// NO ES LA FUENTE DE VERDAD. Lo son las claves `user:{uid}:{token}`, que siguen mandando en la cuota y en la
// pantalla de gestión. El índice se DERIVA de ellas y se autorrepara: quien ya tiene el listado en la mano (abrir
// «mis enlaces», publicar) se lo pasa como `live`, y todo lo que no esté ahí sale del índice y lo que falte se
// añade leyendo su artículo. Por eso da igual que KV no tenga escrituras atómicas: si dos publicaciones del mismo
// autor se pisan, la siguiente visita a «mis enlaces» lo deja bien.
//
// Y NUNCA LO ESCRIBE QUIEN NO TIENE SESIÓN: `related` solo lee. Sin índice (un autor que no ha vuelto a abrir sus
// enlaces desde que esto existe) el pie sale vacío, que es su caso normal; el índice se crea en su siguiente
// visita, y los enlaces anteriores caducan solos en 7-90 días.
import { relatedIndexKey, shareKey, type KVNamespace } from './keys';

/** Adelanto del texto: el mismo recorte que el canal social (ver `buildReviewSnippet` en `socialProjection`). */
export const RELATED_SNIPPET_MAX_CHARS = 160;

/** Una fila del índice: una tarjeta candidata, tal y como la necesitan `rankRelatedReviews` y la respuesta. */
export interface RelatedIndexEntry {
  token: string;
  gameName: string;
  genres: string[];
  rating: number | null;
  grade: number | null;
  snippet: string;
  reviewedAt: number;
  createdAt: number;
  expiresAt: number;
}

/** Cómo cambia el índice. Se pueden combinar: primero se quita, luego se añade. */
export interface RelatedIndexChange {
  /** Los tokens vivos según el listado (`user:{uid}:`). Si viene, lo que no esté aquí sale del índice. */
  live?: readonly string[];
  /** Tokens que acaban de retirarse. */
  remove?: readonly string[];
  /** Una fila recién publicada o renovada: sustituye a la que tuviera ese token. */
  add?: RelatedIndexEntry | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * La fila de un artículo publicado. `null` si no se puede sugerir: sin juego o sin texto no hay tarjeta que pintar
 * (el mismo filtro que aplicaba `related` al leer los artículos uno a uno).
 */
export function entryFromArticle(token: string, article: unknown): RelatedIndexEntry | null {
  if (!article || typeof article !== 'object') return null;
  const source = article as Record<string, unknown>;
  const gameName = text(source.gameName);
  const review = text(source.review);
  if (!token || !gameName || !review.trim()) return null;
  return {
    token,
    gameName,
    genres: strings(source.genres),
    rating: asNumber(source.rating),
    grade: asNumber(source.grade),
    snippet: review.slice(0, RELATED_SNIPPET_MAX_CHARS).trimEnd(),
    reviewedAt: asNumber(source.reviewedAt) ?? 0,
    createdAt: asNumber(source.createdAt) ?? 0,
    expiresAt: asNumber(source.expiresAt) ?? 0,
  };
}

/** El TTL de KV borra solo, pero no al instante: lo caducado se descarta igualmente al leer y al escribir. */
export function isEntryExpired(entry: RelatedIndexEntry, now: number): boolean {
  return entry.expiresAt > 0 && entry.expiresAt < now;
}

/** Lo que haya en KV, reducido a filas válidas. Un valor corrupto o de otra forma se trata como índice vacío. */
export function parseRelatedIndex(raw: unknown): RelatedIndexEntry[] {
  const rows = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : null;
  if (!Array.isArray(rows)) return [];
  const entries: RelatedIndexEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const source = row as Record<string, unknown>;
    const token = text(source.token);
    const gameName = text(source.gameName);
    const snippet = text(source.snippet);
    if (!token || !gameName || !snippet.trim()) continue;
    entries.push({
      token,
      gameName,
      genres: strings(source.genres),
      rating: asNumber(source.rating),
      grade: asNumber(source.grade),
      snippet,
      reviewedAt: asNumber(source.reviewedAt) ?? 0,
      createdAt: asNumber(source.createdAt) ?? 0,
      expiresAt: asNumber(source.expiresAt) ?? 0,
    });
  }
  return entries;
}

/**
 * Aplica un cambio al índice, sin tocar KV. Devuelve las filas resultantes, los tokens vivos que faltan (hay que
 * leer su artículo para añadirlos) y si el resultado difiere de lo que había, para no escribir cuando no cambia.
 */
export function reconcileRelatedIndex(
  current: readonly RelatedIndexEntry[],
  change: RelatedIndexChange,
  now: number,
): { entries: RelatedIndexEntry[]; missing: string[]; changed: boolean } {
  const live = change.live ? new Set(change.live) : null;
  const removed = new Set(change.remove ?? []);
  const byToken = new Map<string, RelatedIndexEntry>();

  for (const entry of current) {
    if (isEntryExpired(entry, now) || removed.has(entry.token)) continue;
    if (live && !live.has(entry.token)) continue;
    byToken.set(entry.token, entry);
  }
  if (change.add && !isEntryExpired(change.add, now) && !removed.has(change.add.token)) {
    byToken.set(change.add.token, change.add);
  }

  const missing = live ? [...live].filter((token) => !byToken.has(token) && !removed.has(token)) : [];
  const entries = [...byToken.values()].sort((a, b) => a.token.localeCompare(b.token));
  const before = [...current].sort((a, b) => a.token.localeCompare(b.token));
  const changed = JSON.stringify(entries) !== JSON.stringify(before);
  return { entries, missing, changed };
}

/** Las filas vigentes del índice de un autor. Vacío si no tiene (o si lo que hay no se entiende). */
export async function readRelatedIndex(kv: KVNamespace, uid: string): Promise<RelatedIndexEntry[]> {
  return parseRelatedIndex(await kv.get(relatedIndexKey(uid), 'json'));
}

/**
 * Lleva el cambio a KV: una lectura del índice, las de los artículos que falten (solo al reparar) y UNA escritura,
 * y solo si algo cambia. Caduca con el enlace que más dure; sin filas, se borra.
 *
 * NUNCA LANZA. El índice es un acelerador de las sugerencias, no parte de publicar ni de retirar: un fallo aquí
 * deja el pie sin sugerencias hasta la siguiente reparación, y eso no justifica devolver un error por algo que sí
 * se ha publicado o retirado.
 */
export async function updateRelatedIndex(kv: KVNamespace, uid: string, change: RelatedIndexChange, now: number): Promise<void> {
  try {
    const current = await readRelatedIndex(kv, uid);
    const result = reconcileRelatedIndex(current, change, now);
    let { entries } = result;
    let changed = result.changed;

    if (result.missing.length > 0) {
      const found = await Promise.all(
        result.missing.map(async (token) => entryFromArticle(token, await kv.get(shareKey(token), 'json'))),
      );
      const added = found.filter((entry): entry is RelatedIndexEntry => entry !== null && !isEntryExpired(entry, now));
      if (added.length > 0) {
        entries = [...entries, ...added].sort((a, b) => a.token.localeCompare(b.token));
        changed = true;
      }
    }

    if (!changed) return;
    if (entries.length === 0) {
      await kv.delete(relatedIndexKey(uid));
      return;
    }
    const lastExpiry = Math.max(...entries.map((entry) => entry.expiresAt));
    // Sin fecha de caducidad conocida (no debería pasar: la pone el servidor) se guarda sin TTL; la siguiente
    // reparación lo recoloca.
    const options = lastExpiry > now ? { expirationTtl: Math.max(60, Math.ceil((lastExpiry - now) / 1000)) } : undefined;
    await kv.put(relatedIndexKey(uid), JSON.stringify({ v: 1, entries }), options);
  } catch {
    // Ver arriba: nunca tumba la operación que lo ha disparado.
  }
}
