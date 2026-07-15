// Parser del CSV de la extensión "Library Exporter" (darklinkpower). PURO.
// El CSV tiene cabeceras LOCALIZADAS al idioma de Playnite (EN/ES cubiertos); las listas (géneros,
// plataformas) van unidas por ", " dentro de una celda entrecomillada. Playtime = segundos (crudo).

import type { RawExternalGame } from '../../model/types/import';
import { cleanNames, clampScore, mapCompletion, mapSource, normalizeGenreName, playtimeSecondsToHours, resolvePlatforms } from './playniteShared';

// Campo lógico → posibles cabeceras (EN + ES), ya sin acentos y en minúscula (ver normHeader).
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'nombre'],
  genres: ['genres', 'generos'],
  platforms: ['platforms', 'plataformas', 'platform', 'plataforma'],
  source: ['source', 'sources', 'fuente', 'fuentes', 'origen'],
  completion: ['completion status', 'estado de finalizacion', 'completionstatus'],
  playtime: ['time played', 'tiempo jugado', 'playtime'],
  userScore: ['user score', 'puntuacion del usuario', 'userscore'],
  gameId: ['game id', 'id del juego', 'gameid'],
};

function normHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Parser CSV mínimo (RFC 4180): comillas dobles, comas y saltos de línea dentro de comillas. */
export function parseCsvRows(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function splitList(cell: string): string[] {
  return cell
    .split(/\s*[;,]\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Mapea el CSV de Library Exporter a RawExternalGame[]. Descarta filas sin nombre. No lanza. */
export function parsePlayniteCsv(text: string): RawExternalGame[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normHeader);
  // campo lógico → índice de columna
  const col: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) col[field] = idx;
  }

  const get = (row: string[], field: string): string => {
    const idx = col[field];
    return idx === undefined ? '' : (row[idx] ?? '').trim();
  };

  const out: RawExternalGame[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue; // línea vacía
    const name = get(row, 'name');
    if (!name) continue;

    const source = mapSource(get(row, 'source'));
    const genres = cleanNames(splitList(get(row, 'genres')).map(normalizeGenreName));
    const platforms = resolvePlatforms(splitList(get(row, 'platforms')), source);

    out.push({
      externalId: get(row, 'gameId'),
      name,
      source,
      genres,
      platforms,
      hours: playtimeSecondsToHours(get(row, 'playtime')),
      suggestedTab: mapCompletion(get(row, 'completion')),
      grade: get(row, 'userScore') ? clampScore(get(row, 'userScore')) : null,
    });
  }
  return out;
}
