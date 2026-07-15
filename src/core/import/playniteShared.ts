// Helpers PUROS compartidos por los dos parsers de Playnite (Json Library Import Export multi-fichero
// y Library Exporter CSV). Mapeo de origen, regla PC→tienda, estado (EN/ES), horas y nota.

import type { TabId } from '../../model/types/game';
import type { ImportSource } from '../../model/types/import';

// Normalización de nombres de género (IGDB/Playnite → forma corta habitual).
const GENRE_MAP: Record<string, string> = {
  'Role-playing (RPG)': 'RPG',
  'Role-Playing': 'RPG',
  Simulator: 'Simulation',
  Platform: 'Platformer',
  "Hack and slash/Beat 'em up": 'Hack and Slash',
  'Real Time Strategy (RTS)': 'RTS',
  'Turn-based strategy (TBS)': 'Turn-Based Strategy',
  'Point-and-click': 'Point & Click',
  Sport: 'Sports',
};

export function normalizeGenreName(name: string): string {
  const trimmed = name.trim();
  return GENRE_MAP[trimmed] ?? trimmed;
}

/** Limpia (trim), aplica normalización de géneros opcional y deduplica sin distinguir mayúsculas. */
export function cleanNames(values: string[], normalizeGenres = false): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = normalizeGenres ? normalizeGenreName(raw) : raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// Tienda de origen (Source de Playnite) → ImportSource. Lo no reconocido cae a 'playnite'.
export function mapSource(source: string): ImportSource {
  const s = source.toLowerCase();
  if (s.includes('steam')) return 'steam';
  if (s.includes('gog')) return 'gog';
  if (s.includes('epic')) return 'egs';
  if (s.includes('xbox') || s.includes('microsoft') || s.includes('game pass')) return 'xbox';
  if (s.includes('playstation') || s.includes('psn') || s.includes('sony')) return 'psn';
  return 'playnite';
}

// Etiqueta con la que se sustituye "PC" por la tienda de origen. 'playnite' (desconocido) no sustituye.
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
 * Regla de plataformas: una plataforma de PC se SUSTITUYE por la tienda de origen (Steam de PC → "Steam").
 * Las de consola se conservan. Si es PC sin tienda conocida, se conserva "PC". Si no hay plataforma pero sí
 * tienda, se usa la tienda. Deduplica sin distinguir mayúsculas.
 */
export function resolvePlatforms(rawPlatforms: string[], source: ImportSource): string[] {
  const label = SOURCE_PLATFORM_LABEL[source];
  const mapped = rawPlatforms.map((p) => (isPcPlatform(p) && label ? label : p));
  if (mapped.length === 0 && label) mapped.push(label);
  return cleanNames(mapped);
}

/**
 * Estado de finalización de Playnite (localizado, EN/ES) → lista destino sugerida.
 * Orden importante: "no jugado/sin jugar/not played" se comprueba ANTES que "jugado/played".
 */
export function mapCompletion(status: string): TabId | undefined {
  const s = status.trim().toLowerCase();
  if (!s) return undefined;
  if (s.includes('sin jugar') || s.includes('no jugado') || s.includes('not played') || s.includes('backlog')) return 'p';
  if (s.includes('plan') || s.includes('planeo')) return 'p';
  if (s.includes('complet') || s.includes('beaten') || s.includes('superad') || s.includes('vencid') || s.includes('terminad'))
    return 'c';
  if (s.includes('abandon')) return 'v';
  if (s.includes('jugando') || s.includes('playing') || s.includes('pausa') || s.includes('espera') || s.includes('hold'))
    return 'e';
  if (s.includes('jugado') || s.includes('played')) return 'e';
  return undefined;
}

/** Playtime de Playnite (SEGUNDOS, confirmado: se serializa el ulong crudo) → horas con 1 decimal. */
export function playtimeSecondsToHours(seconds: unknown): number | null {
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 3600) * 10) / 10;
}

/** UserScore/CriticScore de Playnite (0–100) → nota 0–100 acotada y redondeada. */
export function clampScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
