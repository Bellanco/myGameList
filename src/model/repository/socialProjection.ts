// Transforms PUROS de proyección/serialización para los gists (sin estado de módulo ni I/O).
// Responsabilidad: construir el formato destino del gist de juegos (chunking, envoltorio), la guarda de tamaño,
// la serialización magra, y la proyección pública (snippet/PublicGame) + la guarda de privacidad del canal social.
// Extraído de gistRepository.ts (M1) sin cambio de comportamiento.
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../types/game';
import { resolveGrade, starsFromGrade } from '../../core/utils/scoreScale';
import type { PublicGame } from '../types/social';
import type { CategoryDictionaries, CategoryKey, ChunkIndex, ChunkRef, EncodedGameItem, GamesChunkFile, GamesMainFile } from '../types/gist';

// 6.opt — Diccionarios de categorías (schemaVersion 4): deduplican géneros/plataformas/puntos fuertes/débiles/
// razones. Se construye un diccionario global (en el ancla) y cada juego referencia por índice.
const CATEGORY_KEYS: CategoryKey[] = ['genres', 'platforms', 'strengths', 'weaknesses', 'reasons'];

/** Construye los diccionarios globales + un mapa valor→índice por categoría a partir de TODOS los juegos. */
function buildCategoryDictionaries(games: Array<GameItem & { _tab: TabId }>): {
  dictionaries: CategoryDictionaries;
  indexMaps: Record<CategoryKey, Map<string, number>>;
} {
  const dictionaries: CategoryDictionaries = { genres: [], platforms: [], strengths: [], weaknesses: [], reasons: [] };
  const indexMaps: Record<CategoryKey, Map<string, number>> = {
    genres: new Map(), platforms: new Map(), strengths: new Map(), weaknesses: new Map(), reasons: new Map(),
  };
  for (const game of games) {
    for (const key of CATEGORY_KEYS) {
      for (const value of (game[key] as string[] | undefined) || []) {
        const v = String(value);
        if (!indexMaps[key].has(v)) {
          indexMaps[key].set(v, dictionaries[key].length);
          dictionaries[key].push(v);
        }
      }
    }
  }
  return { dictionaries, indexMaps };
}

/** Codifica un juego: sustituye las 5 categorías por índices al diccionario; el resto queda igual. PURA.
 *  Omite las categorías vacías/ausentes (serialización magra: el decoder las trata como []). */
function encodeGame(game: GameItem & { _tab: TabId }, indexMaps: Record<CategoryKey, Map<string, number>>): EncodedGameItem {
  const out = { ...game } as Record<string, unknown>;
  for (const key of CATEGORY_KEYS) {
    const values = (game[key] as string[] | undefined) || [];
    const indices = values.map((v) => indexMaps[key].get(String(v))).filter((i): i is number => typeof i === 'number');
    if (indices.length > 0) out[key] = indices;
    else delete out[key];
  }
  return out as unknown as EncodedGameItem;
}

/** Codifica un mapa de juegos id→juego usando los diccionarios dados. */
function encodeGamesRecord(
  rec: Record<number, GameItem & { _tab: TabId }>,
  indexMaps: Record<CategoryKey, Map<string, number>>,
): Record<number, EncodedGameItem> {
  const out: Record<number, EncodedGameItem> = {};
  for (const id of Object.keys(rec)) out[Number(id)] = encodeGame(rec[Number(id)], indexMaps);
  return out;
}

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
// (arrays vacíos, booleanos opcionales en false). ST10: también se omiten `steamDeck` (cuando false) y `review`
// (cuando vacío), simétrico con replayable/retry. La lectura los defaultea (migrateGame) → el GameItem en memoria
// queda completo. Compat-safe: clientes que leen toleran su ausencia (igual que replayable/retry desde siempre).
function leanGameItem(game: GameItem): GameItem {
  const out: Record<string, unknown> = {
    id: game.id,
    _ts: game._ts,
    name: game.name,
    platforms: Array.isArray(game.platforms) ? game.platforms : [],
    genres: Array.isArray(game.genres) ? game.genres : [],
  };
  if (game.steamDeck) out.steamDeck = true; // ST10: omitir cuando false
  if (game.review) out.review = game.review; // ST10: omitir cuando vacío
  if (game.score !== undefined && game.score !== null) out.score = game.score;
  if (game.grade !== undefined && game.grade !== null) out.grade = game.grade; // F2: nota fina 0–100 (privada)
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
  const withTab = gamesArrayWithTab(data);
  const { dictionaries, indexMaps } = buildCategoryDictionaries(withTab);
  const games = encodeGamesRecord(toGamesRecord(withTab), indexMaps);
  const generatedAt = Date.now();
  return {
    schemaVersion: 4,
    fileType: 'games-main',
    updatedAt: data.updatedAt || generatedAt,
    integrity: { algorithm: 'djb2', checksum: checksum32(JSON.stringify(games)), generatedAt },
    chunkIndex: { strategy: 'size', maxChunkKB: GAMES_CHUNK_MAX_KB, chunks: [{ chunkId: 'main', gistId: null, sizeKB: 0, updatedAt: generatedAt }] },
    syncMeta: { lamport: 0, updatedAt: generatedAt },
    dictionaries,
    games,
    deletedIndex: buildDeletedIndex(data),
  };
}

// E4 (chunking del gist de juegos): tamaño objetivo por fichero antes de repartir el excedente en chunks.
const GAMES_CHUNK_MAX_KB = 800;

/** Nombre del fichero de overflow dentro del MISMO gist para un `chunkId` dado (decisión: gistId null). */
export function gamesChunkFilename(chunkId: string): string {
  return `myGames-chunk-${chunkId}.json`;
}

function gamesArrayWithTab(data: TabData): Array<GameItem & { _tab: TabId }> {
  const out: Array<GameItem & { _tab: TabId }> = [];
  for (const tab of TAB_IDS) {
    for (const game of data[tab] || []) {
      if (!game || !(Number(game.id) > 0)) continue;
      out.push({ ...game, _tab: tab });
    }
  }
  return out;
}

function toGamesRecord(items: Array<GameItem & { _tab: TabId }>): Record<number, GameItem & { _tab: TabId }> {
  const rec: Record<number, GameItem & { _tab: TabId }> = {};
  for (const g of items) rec[g.id] = g;
  return rec;
}

function buildDeletedIndex(data: TabData): Record<number, { deletedAt: number; purgeAfter: number }> {
  const deletedIndex: Record<number, { deletedAt: number; purgeAfter: number }> = {};
  for (const tomb of data.deleted || []) {
    if (!tomb || !(Number(tomb.id) > 0)) continue;
    const ts = Number(tomb.deletedAt ?? tomb._ts) || 0;
    deletedIndex[tomb.id] = { deletedAt: ts, purgeAfter: ts };
  }
  return deletedIndex;
}

function sizeKB(content: string): number {
  return Math.round(new Blob([content]).size / 1024);
}

/**
 * E4: construye el conjunto de ficheros DESTINO del gist de juegos: el ancla `GamesMainFile` (con el bucket `main`
 * embebido) + un `GamesChunkFile` por cada bucket de overflow. Reparte por tamaño con `distributeIntoChunks`. El
 * `chunkIndex` del ancla referencia `main` + cada chunk (gistId null = vive en el mismo gist). Función PURA.
 * Con pocos juegos solo hay `main` y `chunkFiles` queda vacío (equivalente a un único fichero).
 */
export function buildGamesFiles(
  data: TabData,
  maxChunkKB: number = GAMES_CHUNK_MAX_KB,
): { anchorFile: GamesMainFile; chunkFiles: Record<string, GamesChunkFile> } {
  const generatedAt = Date.now();
  // Diccionarios GLOBALES (sobre todos los juegos, antes de repartir): viven en el ancla y los chunks los referencian.
  const allGames = gamesArrayWithTab(data);
  const { dictionaries, indexMaps } = buildCategoryDictionaries(allGames);

  // Reparto por tamaño sobre los juegos YA codificados (su tamaño real con índices, no con cadenas).
  const encodedAll = allGames.map((g) => ({ ...encodeGame(g, indexMaps), id: g.id }));
  const buckets = distributeIntoChunks(encodedAll, maxChunkKB * 1024); // { main, c1, c2, … }

  const toRecord = (items: EncodedGameItem[]): Record<number, EncodedGameItem> => {
    const rec: Record<number, EncodedGameItem> = {};
    for (const g of items) rec[g.id] = g;
    return rec;
  };

  const mainGames = toRecord(buckets.main || []);
  const chunkFiles: Record<string, GamesChunkFile> = {};
  const chunkRefs: ChunkRef[] = [
    { chunkId: 'main', gistId: null, sizeKB: sizeKB(JSON.stringify(mainGames)), updatedAt: generatedAt },
  ];

  for (const chunkId of Object.keys(buckets)) {
    if (chunkId === 'main') continue;
    const games = toRecord(buckets[chunkId]);
    const content = JSON.stringify(games);
    chunkFiles[gamesChunkFilename(chunkId)] = {
      schemaVersion: 4,
      fileType: 'games-chunk',
      chunkId,
      mainGistId: '', // chunks viven en el MISMO gist (gistId null); se puede sellar en escritura, no es necesario para leer
      updatedAt: generatedAt,
      integrity: { algorithm: 'djb2', checksum: checksum32(content), generatedAt },
      games,
    };
    chunkRefs.push({ chunkId, gistId: null, sizeKB: sizeKB(content), updatedAt: generatedAt });
  }

  const anchorFile: GamesMainFile = {
    schemaVersion: 4,
    fileType: 'games-main',
    updatedAt: data.updatedAt || generatedAt,
    integrity: { algorithm: 'djb2', checksum: checksum32(JSON.stringify(mainGames)), generatedAt },
    chunkIndex: { strategy: 'size', maxChunkKB, chunks: chunkRefs },
    syncMeta: { lamport: 0, updatedAt: generatedAt },
    dictionaries,
    games: mainGames,
    deletedIndex: buildDeletedIndex(data),
  };

  return { anchorFile, chunkFiles };
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
    // `rating` 0–5: espejo para clientes antiguos (validan max(5)), derivado de la nota fina o del score.
    rating: typeof game.grade === 'number' ? starsFromGrade(game.grade) : (game.score ?? null),
    // `grade` 0–100 (misma nombre que en el listado): nota fina real si el usuario la usa, si no derivada del score.
    grade: resolveGrade(game),
    years: game.years,
    snippet: buildReviewSnippet(game.review),
    hasFullReview: (game.review || '').length > 0,
    updatedAt: game._ts,
  };
}

// ── A6 (gated): chunking del gist social por `sharedLists` (la "lista pública" grande) ──────────────────────
// Mismo patrón que el gist de juegos: el ancla lleva el bucket `main` + `chunkIndex`; el excedente va a ficheros
// de overflow del MISMO gist (`gistId: null`). La LECTURA reensambla (assembleChunkedSocial) y es retrocompatible
// con gists planos (sin `chunkIndex`). La ESCRITURA va gated (ENABLE_SOCIAL_WRAPPER_WRITE) como hizo juegos.
export const SOCIAL_SHARED_CHUNK_MAX_KB = 800;

/** Nombre del fichero de overflow del gist social (sharedLists) para un `chunkId` (mismo gist, `gistId: null`). */
export function socialChunkFilename(chunkId: string): string {
  return `myGameList.social-chunk-${chunkId}.json`;
}

// Las funciones de chunking social solo dependen de `profile.sharedLists`, así que se tipan de forma ESTRUCTURAL
// (no del `SocialGistData` concreto del repositorio) para no acoplar ni crear ciclos de import. La entrada mínima
// necesaria es `id` (para repartir por tamaño); el resto de campos públicos se preservan tal cual.
type SharedListEntry = { id: number };
type SocialSharedLists = Partial<Record<string, SharedListEntry[]>>;

/** Fichero de overflow del gist social: una porción de `sharedLists` (proyección PÚBLICA, sin campos privados). */
export interface SocialSharedChunkFile {
  schemaVersion: 2;
  fileType: 'social-shared-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: string; checksum: string; generatedAt: number };
  sharedLists: Record<string, SharedListEntry[]>;
}

type SharedBucketItem = { id: number; _tab: string; game: SharedListEntry };

function flattenSharedLists(sharedLists: SocialSharedLists | undefined): SharedBucketItem[] {
  const out: SharedBucketItem[] = [];
  for (const tab of TAB_IDS) {
    for (const game of sharedLists?.[tab] || []) {
      if (!game || !(Number(game.id) > 0)) continue;
      out.push({ id: Number(game.id), _tab: tab, game });
    }
  }
  return out;
}

function groupSharedByTab(items: SharedBucketItem[]): Record<string, SharedListEntry[]> {
  const out: Record<string, SharedListEntry[]> = {};
  for (const { _tab, game } of items) (out[_tab] ||= []).push(game);
  return out;
}

/**
 * A6 (gated): construye los ficheros DESTINO del gist social: el ancla (con `chunkIndex` y el bucket `main` de
 * `sharedLists` embebido) + un `SocialSharedChunkFile` por bucket de overflow. Reparte por tamaño. Con pocas listas
 * solo hay `main` y `chunkFiles` queda vacío (gist de un único fichero). PURA. La privacidad la asegura el llamador
 * sobre cada fichero (assertNoSocialPrivateFields). Genérica en la forma del gist social (solo usa sharedLists).
 */
export function buildSocialFiles<T extends { profile: { sharedLists?: SocialSharedLists } }>(
  data: T,
  maxChunkKB: number = SOCIAL_SHARED_CHUNK_MAX_KB,
): { anchor: T & { chunkIndex: ChunkIndex }; chunkFiles: Record<string, SocialSharedChunkFile> } {
  const generatedAt = Date.now();
  const buckets = distributeIntoChunks(flattenSharedLists(data.profile?.sharedLists), maxChunkKB * 1024);

  const mainShared = groupSharedByTab(buckets.main || []);
  const chunkFiles: Record<string, SocialSharedChunkFile> = {};
  const chunkRefs: ChunkRef[] = [
    { chunkId: 'main', gistId: null, sizeKB: Math.round(new Blob([JSON.stringify(mainShared)]).size / 1024), updatedAt: generatedAt },
  ];

  for (const chunkId of Object.keys(buckets)) {
    if (chunkId === 'main') continue;
    const sharedLists = groupSharedByTab(buckets[chunkId]);
    const content = JSON.stringify(sharedLists);
    chunkFiles[socialChunkFilename(chunkId)] = {
      schemaVersion: 2,
      fileType: 'social-shared-chunk',
      chunkId,
      mainGistId: '', // viven en el MISMO gist (gistId null); se sella en escritura, no es necesario para leer
      updatedAt: generatedAt,
      integrity: { algorithm: 'djb2', checksum: checksum32(content), generatedAt },
      sharedLists,
    };
    chunkRefs.push({ chunkId, gistId: null, sizeKB: Math.round(new Blob([content]).size / 1024), updatedAt: generatedAt });
  }

  const chunkIndex: ChunkIndex = { strategy: 'size', maxChunkKB, chunks: chunkRefs };
  const anchor = { ...data, profile: { ...data.profile, sharedLists: mainShared }, chunkIndex } as T & { chunkIndex: ChunkIndex };
  return { anchor, chunkFiles };
}

/**
 * A6 (lectura multi-fichero): si `parsed` es un ancla social con `chunkIndex` que referencia overflow en el MISMO
 * gist (`gistId == null`), fusiona en `profile.sharedLists` (por pestaña) las listas de cada fichero de overflow
 * presente en la respuesta. Para gist social plano (sin `chunkIndex`/overflow) devuelve `parsed` SIN cambios.
 */
export function assembleChunkedSocial(
  parsed: unknown,
  files: Record<string, { content?: string } | undefined> | undefined,
): unknown {
  if (!parsed || typeof parsed !== 'object' || !files) return parsed;
  const anchor = parsed as {
    profile?: { sharedLists?: Record<string, unknown[]> };
    chunkIndex?: { chunks?: Array<{ chunkId?: string; gistId?: string | null }> };
  };
  const overflow = (anchor.chunkIndex?.chunks || []).filter(
    (c) => c && c.chunkId && c.chunkId !== 'main' && (c.gistId === null || c.gistId === undefined),
  );
  if (overflow.length === 0) return parsed;

  const merged: Record<string, unknown[]> = {};
  for (const tab of TAB_IDS) {
    const list = anchor.profile?.sharedLists?.[tab];
    if (Array.isArray(list)) merged[tab] = [...list];
  }
  for (const ref of overflow) {
    const content = files[socialChunkFilename(String(ref.chunkId))]?.content;
    if (!content) continue; // chunk ausente: se conserva lo disponible
    try {
      const chunk = JSON.parse(content) as { sharedLists?: Record<string, unknown[]> };
      for (const tab of TAB_IDS) {
        const list = chunk.sharedLists?.[tab];
        if (Array.isArray(list)) (merged[tab] ||= []).push(...list);
      }
    } catch {
      // chunk corrupto: se ignora
    }
  }
  return { ...anchor, profile: { ...(anchor.profile || {}), sharedLists: merged } };
}

// `grade` ya NO es privado: la nota fina 0–100 se publica a propósito (misma nombre que en el listado). El espejo
// 0–5 sigue en `rating`; el `score` local se mantiene privado (el canal usa `rating`).
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
