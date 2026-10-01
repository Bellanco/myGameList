/**
 * LA TARJETA DEL RESUMEN DEL AÑO en el feed. Pura.
 *
 * Cuando alguien abre su resumen en temporada (del 15 al 31 de diciembre) se publica en su perfil `{ year, at }`
 * (ver `publishYearSummarySeen`), y a sus amistades les sale una tarjeta destacada: «Lucía ya tiene su resumen de
 * 2026», que abre ese resumen. Una por persona y año —la guarda es de quien publica—, en su sitio por fecha (la
 * de cuando lo abrió) y durante `YEAR_SUMMARY_FEED_DAYS`, como los logros.
 *
 * No se publica ningún evento en ningún canal: sale del directorio que el feed ya trae, como el espejo de logros.
 */

/** Cuántos días se queda la tarjeta en el feed desde que se abrió el resumen. */
export const YEAR_SUMMARY_FEED_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Holgura frente a relojes adelantados: una fecha unos minutos en el futuro sigue valiendo. */
const CLOCK_SKEW_MS = 10 * 60 * 1000;

export interface YearSummaryFeedSource {
  id: string;
  displayName?: string;
  photoURL?: string;
  seen: { year: number; at: number } | null;
  own: boolean;
}

export interface YearSummaryFeedEntry {
  key: string;
  profileId: string;
  displayName: string;
  photoURL: string;
  year: number;
  updatedAt: number;
  own: boolean;
}

export function yearSummaryFeedEntries(sources: readonly YearSummaryFeedSource[], now: number = Date.now()): YearSummaryFeedEntry[] {
  return sources.flatMap((source) => {
    const seen = source.seen;
    if (!source.id || !seen || !Number.isInteger(seen.year) || !(seen.at > 0)) return [];
    if (seen.at > now + CLOCK_SKEW_MS || now - seen.at > YEAR_SUMMARY_FEED_DAYS * DAY_MS) return [];
    return [{
      key: `${source.id}:year-summary:${seen.year}`,
      profileId: source.id,
      displayName: String(source.displayName || ''),
      photoURL: String(source.photoURL || ''),
      year: seen.year,
      updatedAt: seen.at,
      own: source.own,
    }];
  });
}
