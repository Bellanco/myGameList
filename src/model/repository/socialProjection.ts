// Transforms PUROS de proyección/serialización para los gists (sin estado de módulo ni I/O).
// Responsabilidad: construir el formato destino del gist de juegos (chunking, envoltorio), la guarda de tamaño,
// la serialización magra, y la proyección pública (snippet/PublicGame) + la guarda de privacidad del canal social.
// Extraído de gistRepository.ts (M1) sin cambio de comportamiento.
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../types/game';
import type { PublicGame } from '../types/social';
import type { GamesMainFile } from '../types/gist';

function checksum32(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * Reparte una lista en buckets `{ main, c1, c2, … }` por tamaño acumulado (JSON). Un item nunca cae en
 * dos buckets. Núcleo de eficiencia del chunking.
 */
export function distributeIntoChunks<T extends { id: number }>(items: T[], thresholdBytes: number): Record<string, T[]> {
  const buckets: Record<string, T[]> = { main: [] };
  let current = 'main';
  let size = 0;
  let chunkIdx = 0;
  for (const item of items) {
    const itemSize = new Blob([JSON.stringify(item)]).size;
    if (size + itemSize > thresholdBytes && buckets[current].length > 0) {
      chunkIdx += 1;
      current = `c${chunkIdx}`;
      buckets[current] = [];
      size = 0;
    }
    buckets[current].push(item);
    size += itemSize;
  }
  return buckets;
}

// E1 (escalabilidad): guarda de tamaño del gist. GitHub trunca/rechaza ficheros muy grandes (~1 MB). En vez de
// dejar que el PATCH falle en bucle (deadlock silencioso), avisamos por consola al acercarnos y lanzamos un error
// accionable al superar el umbral de bloqueo. El particionado real por tamaño llega en E4 (chunking).
const GIST_SIZE_WARN_BYTES = 700 * 1024;
const GIST_SIZE_BLOCK_BYTES = 950 * 1024;

function utf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

/** Lanza si el contenido supera el umbral seguro; avisa (sin lanzar) al acercarse. Devuelve el tamaño en bytes. */
export function assertGistSizeWithinLimit(content: string, label: string): number {
  const bytes = utf8ByteLength(content);
  const kb = Math.round(bytes / 1024);
  if (bytes >= GIST_SIZE_BLOCK_BYTES) {
    throw new Error(
      `El ${label} ocupa ${kb} KB y supera el límite seguro de gist (~${Math.round(GIST_SIZE_BLOCK_BYTES / 1024)} KB). ` +
        'No se ha subido para no fallar contra GitHub. Reduce datos (o espera al particionado por tamaño).',
    );
  }
  if (bytes >= GIST_SIZE_WARN_BYTES) {
    console.warn(`[gist] ${label} grande: ${kb} KB (aviso desde ${Math.round(GIST_SIZE_WARN_BYTES / 1024)} KB).`);
  }
  return bytes;
}

// E1 (escalabilidad): serialización magra. Omite campos OPCIONALES vacíos/por-defecto al escribir el gist de juegos
// (arrays vacíos, booleanos opcionales en false). Los campos requeridos (id/_ts/name/platforms/genres/steamDeck/review)
// se conservan siempre. Compat-safe: la lectura tolera ausencia de campos opcionales.
function leanGameItem(game: GameItem): GameItem {
  const out: Record<string, unknown> = {
    id: game.id,
    _ts: game._ts,
    name: game.name,
    platforms: Array.isArray(game.platforms) ? game.platforms : [],
    genres: Array.isArray(game.genres) ? game.genres : [],
    steamDeck: Boolean(game.steamDeck),
    review: game.review || '',
  };
  if (game.score !== undefined && game.score !== null) out.score = game.score;
  if (game.hours !== undefined && game.hours !== null) out.hours = game.hours;
  if (Array.isArray(game.years) && game.years.length) out.years = game.years;
  if (Array.isArray(game.strengths) && game.strengths.length) out.strengths = game.strengths;
  if (Array.isArray(game.weaknesses) && game.weaknesses.length) out.weaknesses = game.weaknesses;
  if (Array.isArray(game.reasons) && game.reasons.length) out.reasons = game.reasons;
  if (game.replayable) out.replayable = true;
  if (game.retry) out.retry = true;
  if (game._v !== undefined) out._v = game._v;
  if (game.shared) out.shared = true;
  return out as unknown as GameItem;
}

/** Devuelve una copia de `TabData` con cada juego en su forma magra (para escribir el gist más compacto). */
export function leanTabData(data: TabData): TabData {
  return {
    c: (data.c || []).map(leanGameItem),
    v: (data.v || []).map(leanGameItem),
    e: (data.e || []).map(leanGameItem),
    p: (data.p || []).map(leanGameItem),
    deleted: data.deleted || [],
    updatedAt: data.updatedAt,
  };
}

/**
 * Envuelve un `TabData` en el fichero ancla `GamesMainFile` (formato destino). Cada juego se anota con
 * `_tab` para que `unwrapGamesFile` pueda reconstruir el `TabData`. Función pura; no escribe nada.
 */
export function buildGamesMainFile(data: TabData): GamesMainFile {
  const games: Record<number, GameItem & { _tab: TabId }> = {};
  for (const tab of TAB_IDS) {
    for (const game of data[tab] || []) {
      if (!game || !(Number(game.id) > 0)) continue;
      games[game.id] = { ...game, _tab: tab };
    }
  }
  const deletedIndex: Record<number, { deletedAt: number; purgeAfter: number }> = {};
  for (const tomb of data.deleted || []) {
    if (!tomb || !(Number(tomb.id) > 0)) continue;
    const ts = Number(tomb.deletedAt ?? tomb._ts) || 0;
    deletedIndex[tomb.id] = { deletedAt: ts, purgeAfter: ts };
  }
  const generatedAt = Date.now();
  return {
    schemaVersion: 3,
    fileType: 'games-main',
    updatedAt: data.updatedAt || generatedAt,
    integrity: { algorithm: 'djb2', checksum: checksum32(JSON.stringify(games)), generatedAt },
    chunkIndex: { strategy: 'size', maxChunkKB: 800, chunks: [{ chunkId: 'main', gistId: null, sizeKB: 0, updatedAt: generatedAt }] },
    syncMeta: { lamport: 0, updatedAt: generatedAt },
    games,
    deletedIndex,
  };
}

const SNIPPET_MAX_CHARS = 160;

/** Deriva el snippet público (≤160) del review privado. Reemplaza al antiguo buildReviewExcerpt (muerto). */
export function buildReviewSnippet(review: string): string {
  return (review || '').slice(0, SNIPPET_MAX_CHARS).trimEnd();
}

/**
 * Proyección pública de un juego (canal social): copia campos públicos y deriva `snippet`,
 * OMITIENDO siempre los privados (`review`, `score`, `hours`, `steamDeck`, `retry`, `replayable`).
 * El `tab` se pasa porque vive en la estructura `TabData`, no en el `GameItem`.
 */
export function toPublicGame(game: GameItem, tab: TabId): PublicGame {
  return {
    id: game.id,
    name: game.name,
    genres: game.genres,
    platforms: game.platforms,
    strengths: game.strengths,
    weaknesses: game.weaknesses,
    tab,
    rating: game.score ?? null,
    years: game.years,
    snippet: buildReviewSnippet(game.review),
    hasFullReview: (game.review || '').length > 0,
    updatedAt: game._ts,
  };
}

const SOCIAL_PRIVATE_FIELDS = ['review', 'reviewText', 'score', 'hours', 'steamDeck', 'retry', 'replayable'];

/** Guarda de privacidad: lanza si algún campo privado aparece en lo que se escribirá al gist social. */
export function assertNoSocialPrivateFields(obj: unknown, path = ''): void {
  if (!obj || typeof obj !== 'object') return;
  for (const field of SOCIAL_PRIVATE_FIELDS) {
    if (field in (obj as Record<string, unknown>)) {
      throw new Error(`Campo privado '${field}' en ${path || 'root'}: el gist social no debe contenerlo`);
    }
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    assertNoSocialPrivateFields(value, path ? `${path}.${key}` : key);
  }
}
