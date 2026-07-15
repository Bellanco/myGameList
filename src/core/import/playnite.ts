// Mapper de un export JSON de Playnite → RawExternalGame[] (PURO y tolerante).
//
// ⚠️ PRIMERA VERSIÓN (provisional): los nombres de campos varían según la extensión de export. Está
// escrito de forma defensiva (acepta varias formas), pero hay que CONFIRMARLO con un JSON de muestra
// real (prerrequisito P2) y ajustar. Ver docs/plan-importacion-bibliotecas.md (Anexo B).

import type { TabId } from '../../model/types/game';
import type { ImportSource, RawExternalGame } from '../../model/types/import';

// --- helpers de lectura tolerante -------------------------------------------------

function pick(rec: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k];
  }
  return undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Playnite serializa listas de metadatos como strings o como objetos { Name }. Devuelve nombres. */
function toNames(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const out: string[] = [];
  for (const entry of arr) {
    if (typeof entry === 'string') {
      const s = entry.trim();
      if (s) out.push(s);
    } else if (entry && typeof entry === 'object') {
      const name = str((entry as Record<string, unknown>).Name ?? (entry as Record<string, unknown>).name);
      if (name) out.push(name);
    }
  }
  return out;
}

// --- mapeos de dominio -------------------------------------------------------------

// Tienda de origen (Source de Playnite) → nuestro ImportSource. Lo no reconocido cae a 'playnite'.
function mapSource(source: string): ImportSource {
  const s = source.toLowerCase();
  if (s.includes('steam')) return 'steam';
  if (s.includes('gog')) return 'gog';
  if (s.includes('epic')) return 'egs';
  if (s.includes('xbox') || s.includes('microsoft') || s.includes('game pass')) return 'xbox';
  if (s.includes('playstation') || s.includes('psn') || s.includes('sony')) return 'psn';
  return 'playnite';
}

// Etiqueta de plataforma para sustituir "PC" por la tienda de origen. 'playnite' (origen desconocido)
// no tiene etiqueta → se conserva "PC".
const SOURCE_PLATFORM_LABEL: Partial<Record<ImportSource, string>> = {
  steam: 'Steam',
  gog: 'GOG',
  egs: 'Epic',
  xbox: 'Xbox',
  psn: 'PlayStation',
};

function isPcPlatform(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('pc') || n.includes('windows') || n.includes('linux') || (n.includes('mac') && n.includes('pc'));
}

/**
 * Regla de plataformas: si la plataforma es de PC y conocemos la tienda de origen, se SUSTITUYE por la
 * tienda (Steam de PC → "Steam"). Las plataformas de consola se conservan. Si es PC sin tienda conocida,
 * se conserva "PC". Deduplica de forma insensible a mayúsculas.
 */
function resolvePlatforms(rawPlatforms: string[], source: ImportSource): string[] {
  const label = SOURCE_PLATFORM_LABEL[source];
  const mapped = rawPlatforms.map((p) => (isPcPlatform(p) && label ? label : p));
  // Si no había plataforma pero conocemos la tienda, usarla como plataforma (juego de PC sin platform).
  if (mapped.length === 0 && label) mapped.push(label);
  const seen = new Set<string>();
  return mapped.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// CompletionStatus de Playnite → lista destino sugerida.
function mapCompletion(status: string): TabId | undefined {
  const s = status.toLowerCase();
  if (s.includes('complet')) return 'c'; // Completed
  if (s.includes('abandon') || s.includes('dropped')) return 'v';
  if (s.includes('playing') || s === 'played' || s.includes('on hold') || s.includes('paused')) return 'e';
  if (s.includes('plan') || s.includes('not played') || s.includes('backlog')) return 'p';
  return undefined;
}

function secondsToHours(seconds: number | null): number | null {
  if (seconds === null || seconds <= 0) return null;
  return Math.round((seconds / 3600) * 10) / 10; // 1 decimal
}

function clampScore(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Extrae el array de juegos del JSON, tolerando `[...]`, `{ games: [...] }` o `{ Games: [...] }`. */
function extractGamesArray(json: unknown): Record<string, unknown>[] {
  const raw = Array.isArray(json)
    ? json
    : json && typeof json === 'object'
      ? (pick(json as Record<string, unknown>, ['games', 'Games', 'library', 'Library']) ?? [])
      : [];
  return (Array.isArray(raw) ? raw : []).filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object');
}

/**
 * Mapea un export de Playnite (ya parseado) a `RawExternalGame[]`. Descarta entradas sin nombre. No lanza:
 * ante un JSON inesperado devuelve `[]` (el llamador avisa del error de lectura).
 */
export function mapPlayniteExport(json: unknown): RawExternalGame[] {
  const games = extractGamesArray(json);
  const out: RawExternalGame[] = [];

  for (const rec of games) {
    const name = str(pick(rec, ['Name', 'name']));
    if (!name) continue;

    const source = mapSource(str(pick(rec, ['Source', 'source', 'Sources', 'sources'])));
    const platforms = resolvePlatforms(toNames(pick(rec, ['Platforms', 'platforms', 'Platform', 'platform'])), source);
    const genres = toNames(pick(rec, ['Genres', 'genres']));
    const hours = secondsToHours(num(pick(rec, ['Playtime', 'playtime'])));
    const externalId = str(pick(rec, ['GameId', 'gameId', 'Id', 'id']));
    const suggestedTab = mapCompletion(str(pick(rec, ['CompletionStatus', 'completionStatus'])));
    const grade = clampScore(num(pick(rec, ['UserScore', 'userScore'])));

    out.push({ externalId, name, source, platforms, genres, hours, suggestedTab, grade });
  }

  return out;
}
