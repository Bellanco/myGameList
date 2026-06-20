// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Lectura multiformato del gist de juegos: acepta el formato VIEJO (TabData plano) y el NUEVO
// (envoltorio GamesMainFile). Una vez todo migrado, el lector puede simplificarse a solo-nuevo.
import type { GameItem, TabData, TabId } from '../types/game';

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
