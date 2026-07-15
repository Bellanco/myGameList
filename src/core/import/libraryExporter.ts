// Parser del export JSON de la extensión "Playnite Library Exporter". PURO.
// Es un ÚNICO fichero con `games[]` y NOMBRES ya resueltos (no GUIDs): `name`/`sortingName`,
// `genres[]`, `platforms[]`, `sourceName`, `playtimeSeconds`, `providerGameId`/`steamAppId`.
// Este export NO incluye estado de finalización ni nota de usuario (por eso no hay lista sugerida
// ni nota precargada por esta vía). Estructura fija en inglés → robusta.

import type { RawExternalGame } from '../../model/types/import';
import { cleanNames, mapSource, normalizeGenreName, playtimeSecondsToHours, resolvePlatforms } from './playniteShared';

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Mapea el JSON de Playnite Library Exporter a RawExternalGame[]. Acepta `{ games: [...] }` o un array
 * directo. Descarta juegos sin nombre. No lanza (ante un JSON inesperado devuelve []).
 */
export function parseLibraryExporter(input: unknown): RawExternalGame[] {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? (input as Record<string, unknown>).games
      : undefined;
  const games = toRecordArray(source);

  const out: RawExternalGame[] = [];
  for (const game of games) {
    const name = str(game.name) || str(game.sortingName);
    if (!name) continue;

    const sourceName = str(game.sourceName);
    const gameSource = mapSource(sourceName);
    const genres = cleanNames(strArray(game.genres).map(normalizeGenreName));
    const platforms = resolvePlatforms(strArray(game.platforms), sourceName);
    const externalId =
      str(game.providerGameId) || (typeof game.steamAppId === 'number' ? String(game.steamAppId) : '') || str(game.playniteId);

    out.push({
      externalId,
      name,
      source: gameSource,
      genres,
      platforms,
      hours: playtimeSecondsToHours(game.playtimeSeconds),
      // Este export no trae estado ni nota:
      suggestedTab: undefined,
      grade: null,
    });
  }
  return out;
}
