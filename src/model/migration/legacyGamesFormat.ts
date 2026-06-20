// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Lectura multiformato del gist de juegos: acepta el formato VIEJO (TabData plano) y el NUEVO
// (envoltorio GamesMainFile). Una vez todo migrado, el lector puede simplificarse a solo-nuevo.
import type { GameItem, TabData, TabId } from '../types/game';
import { gamesChunkFilename } from '../repository/socialProjection';

/**
 * Detecta el envoltorio DESTINO del gist de juegos (`GamesMainFile`: schemaVersion/fileType/games),
 * frente al formato VIEJO plano (`TabData` con c/v/e/p).
 */
export function isGamesMainWrapper(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (o.fileType === 'games-main') return true;
  return typeof o.schemaVersion === 'number' && 'games' in o && !('c' in o) && !('v' in o);
}

/** True si el contenido es el formato VIEJO plano (TabData), que en Fase 2 debe reescribirse a nuevo. */
export function isLegacyFlatTabData(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return !isGamesMainWrapper(value) && ('c' in o || 'v' in o || 'e' in o || 'p' in o);
}

/**
 * Lectura retrocompatible: si el contenido viene en el formato DESTINO (envoltorio `GamesMainFile`),
 * lo "desenvuelve" a `TabData` plano. Para el formato VIEJO plano (o legacy) lo devuelve tal cual.
 * Salvaguarda anti-pérdida: si el envoltorio traía juegos pero ninguno se pudo ubicar, lanza
 * en vez de devolver listas vacías (evita sobrescribir el gist con datos vacíos).
 */
export function unwrapGamesFile(parsed: unknown): unknown {
  if (!isGamesMainWrapper(parsed)) return parsed;

  const o = parsed as {
    games?: Record<string, GameItem & { _tab?: TabId }>;
    deletedIndex?: Record<string, { deletedAt?: number } | undefined>;
    updatedAt?: number;
  };

  const buckets: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Number(o.updatedAt) || Date.now() };
  const games = o.games || {};
  let placed = 0;

  for (const key of Object.keys(games)) {
    const game = games[key];
    if (!game) continue;
    const tab = game._tab;
    if (tab !== 'c' && tab !== 'v' && tab !== 'e' && tab !== 'p') continue; // sin tab no se puede ubicar
    const clean = { ...game } as GameItem & { _tab?: TabId };
    delete clean._tab;
    buckets[tab].push(clean);
    placed += 1;
  }

  const deletedIndex = o.deletedIndex || {};
  for (const key of Object.keys(deletedIndex)) {
    const id = Number(key);
    if (!(id > 0)) continue;
    const ts = Number(deletedIndex[key]?.deletedAt) || 0;
    buckets.deleted.push({ id, _ts: ts, deletedAt: ts });
  }

  if (Object.keys(games).length > 0 && placed === 0) {
    throw new Error('Gist en formato games-main no reconstruible (faltan tabs); se aborta para no perder datos');
  }

  return buckets;
}

/**
 * E4 (lectura multi-fichero): si `parsed` es un ancla `GamesMainFile` cuyo `chunkIndex` referencia chunks de overflow
 * que viven en el MISMO gist (`gistId == null`), fusiona en `games` los registros de cada `GamesChunkFile` presente en
 * la respuesta del gist (`files[<myGames-chunk-cN.json>].content`). Devuelve un ancla combinado listo para `unwrapGamesFile`.
 * Para gist plano o ancla de un solo fichero (solo `main`), devuelve `parsed` SIN cambios (comportamiento actual).
 */
export function assembleChunkedGames(parsed: unknown, files: Record<string, { content?: string } | undefined> | undefined): unknown {
  if (!isGamesMainWrapper(parsed) || !files) return parsed;
  const anchor = parsed as {
    games?: Record<string, unknown>;
    chunkIndex?: { chunks?: Array<{ chunkId?: string; gistId?: string | null }> };
  };
  const overflow = (anchor.chunkIndex?.chunks || []).filter(
    (c) => c && c.chunkId && c.chunkId !== 'main' && (c.gistId === null || c.gistId === undefined),
  );
  if (overflow.length === 0) return parsed;

  const mergedGames: Record<string, unknown> = { ...(anchor.games || {}) };
  for (const ref of overflow) {
    const content = files[gamesChunkFilename(String(ref.chunkId))]?.content;
    if (!content) continue; // chunk ausente: se conserva lo disponible (la salvaguarda anti-pérdida de unwrap actuará si todo falla)
    try {
      const chunkParsed = JSON.parse(content) as { games?: Record<string, unknown> };
      Object.assign(mergedGames, chunkParsed.games || {});
    } catch {
      // chunk corrupto: se ignora ese chunk
    }
  }
  return { ...anchor, games: mergedGames };
}

/**
 * Claves de juego en español/legacy que `migrateData` normaliza a su equivalente nuevo (EN).
 * Su presencia indica que el contenido remoto NO está en el formato actual y debe reescribirse.
 */
const LEGACY_GAME_KEYS = [
  'nombre', 'plataformas', 'plataforma', 'generos', 'genero', 'puntuacion', 'reseña',
  'razones', 'razon', 'horas', 'años', 'pf', 'pd', 'steam_deck', 'volver', 'rejugabilidad',
] as const;

/**
 * Condicional de upgrade proactivo del gist de juegos: ¿el contenido remoto está en una forma VIEJA
 * que conviene reescribir al formato actual (plano, campos EN)? Devuelve `true` si:
 *  - viene en el envoltorio `GamesMainFile` (con la escritura en plano, se rebaja a plano legible por todos), o
 *  - algún juego carece de `name` o conserva claves legacy en español.
 * Es puro y opera sobre el RAW parseado (antes de `unwrapGamesFile`/`migrateData`). Cuando el gist ya está
 * en formato actual devuelve `false`, de modo que no genera reescrituras innecesarias.
 */
export function gamesGistNeedsRewrite(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  if (isGamesMainWrapper(parsed)) return true;

  const o = parsed as Record<string, unknown>;
  for (const tab of ['c', 'v', 'e', 'p'] as const) {
    const arr = o[tab];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const game = item as Record<string, unknown>;
      if (!('name' in game)) return true;
      for (const key of LEGACY_GAME_KEYS) {
        if (key in game) return true;
      }
    }
  }
  return false;
}
