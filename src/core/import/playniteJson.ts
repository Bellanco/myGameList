// Parser de la extensión "Json Library Import Export" (sokolinthesky). PURO.
// Exporta la base de datos en VARIOS ficheros con GUIDs; aquí resolvemos GenreIds/PlatformIds/SourceId/
// CompletionStatusId contra los ficheros de lookup (como parsearMyGameList.py, pero resolviendo también
// plataformas, origen y estado, no solo géneros). Estructura fija en inglés (robusta, no localizada).

import type { RawExternalGame } from '../../model/types/import';
import {
  cleanNames,
  clampScore,
  mapCompletion,
  mapSource,
  normalizeGenreName,
  playtimeSecondsToHours,
  resolvePlatforms,
} from './playniteShared';

export interface JsonLibraryFiles {
  games: unknown; // games.json (obligatorio)
  genres?: unknown; // genres.json
  platforms?: unknown; // platforms.json
  sources?: unknown; // sources.json
  completionStatuses?: unknown; // completionstatuses.json
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : [];
}

/** Diccionario Id (GUID) → Name a partir de un fichero de lookup ([{ Id, Name }]). */
function idNameLookup(value: unknown): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of toRecordArray(value)) {
    const id = item.Id ?? item.id;
    const name = item.Name ?? item.name;
    if (typeof id === 'string' && typeof name === 'string') map.set(id, name);
  }
  return map;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function guidList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function resolveIds(ids: string[], lookup: Map<string, string>): string[] {
  return ids.map((id) => lookup.get(id)).filter((n): n is string => Boolean(n));
}

/** Mapea el export multi-fichero a RawExternalGame[]. Descarta juegos sin nombre. No lanza. */
export function parseJsonLibraryExport(files: JsonLibraryFiles): RawExternalGame[] {
  const games = toRecordArray(files.games);
  const genreLookup = idNameLookup(files.genres);
  const platformLookup = idNameLookup(files.platforms);
  const sourceLookup = idNameLookup(files.sources);
  const completionLookup = idNameLookup(files.completionStatuses);

  const out: RawExternalGame[] = [];

  for (const game of games) {
    const name = str(game.Name) || str(game.SortingName);
    if (!name) continue;

    const sourceName = str(sourceLookup.get(str(game.SourceId)));
    const source = mapSource(sourceName);

    const genres = cleanNames(resolveIds(guidList(game.GenreIds), genreLookup).map(normalizeGenreName));
    const platforms = resolvePlatforms(resolveIds(guidList(game.PlatformIds), platformLookup), source);
    const completionName = str(completionLookup.get(str(game.CompletionStatusId)));

    out.push({
      externalId: str(game.GameId) || str(game.Id),
      name,
      source,
      genres,
      platforms,
      hours: playtimeSecondsToHours(game.Playtime),
      suggestedTab: mapCompletion(completionName),
      grade: clampScore(game.UserScore ?? game.CriticScore),
    });
  }

  return out;
}
