// Helpers PUROS del parser de Playnite: mapeo de origen, regla PC→tienda y horas.
//
// Nacieron como "compartidos" porque había DOS vías de import (JSON multi-fichero y CSV) y el commit `6b03372`
// las consolidó en una sola: `libraryExporter.ts`, hoy el único consumidor. Se quedan aquí, y no dentro de él,
// porque son lógica pura y comprobable aparte del recorrido del JSON.

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

// Interna desde que `libraryExporter` usa el flag de `cleanNames` en vez de mapearla a mano: `cleanNames` es el
// único punto de entrada, y así no hay dos formas de normalizar un género.
function normalizeGenreName(name: string): string {
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

function isPcPlatform(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('pc') || n.includes('windows') || n.includes('linux') || (n.includes('mac') && n.includes('pc'));
}

/**
 * Regla de plataformas: una plataforma de PC se SUSTITUYE por la etiqueta de la tienda de origen
 * (`storeLabel`, tal cual la reporta Playnite: "Steam", "GOG", "Epic", "EA app", "Ubisoft Connect"…).
 * Las de consola se conservan. Si es PC sin tienda conocida (`storeLabel` vacío), se conserva "PC…".
 * Si no hay plataforma pero sí tienda, se usa la tienda. Deduplica sin distinguir mayúsculas.
 */
export function resolvePlatforms(rawPlatforms: string[], storeLabel: string): string[] {
  const label = storeLabel.trim();
  const mapped = rawPlatforms.map((p) => (isPcPlatform(p) && label ? label : p));
  if (mapped.length === 0 && label) mapped.push(label);
  return cleanNames(mapped);
}

/** Playtime de Playnite (SEGUNDOS, confirmado: se serializa el ulong crudo) → horas con 1 decimal. */
export function playtimeSecondsToHours(seconds: unknown): number | null {
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 3600) * 10) / 10;
}
