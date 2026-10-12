import type { Ranked, SummaryWhen, SummaryWhenEdge, YearSummary } from './yearSummary';

/**
 * LO QUE SALE DEL RESUMEN DEL AÑO AL COMPARTIRLO CON ENLACE (`/r/`). Puro.
 *
 * Quien abre el enlace puede no ser nadie conocido, así que esto es una ALLOWLIST: se copia campo a campo lo que
 * se publica, y lo que no se nombra aquí no sale aunque mañana se añada al resumen. Lo que se queda fuera, a
 * propósito (ver `docs/plan-resumen-del-ano.md`, Fase 3):
 *  - `common`: es la comparación con quien MIRA, no un dato del autor;
 *  - `best.quote`: la cita de su reseña (decisión del usuario, 12-10-2026);
 *  - el DÍA de cada fin: solo el mes, que es lo que ya ven sus amistades (`when.days` y el `day` de los extremos).
 *
 * Y acota los listados, porque el artículo vive en KV y lo valida un esquema con topes: las carátulas de la
 * portada (solo las que pinta), y plataformas, géneros y nombres hasta una cifra que ningún año real alcanza.
 */
export const PUBLIC_YEAR_SUMMARY_LIMITS = {
  /** Las que usa la composición de la portada (`COLLAGE_MAX` en `YearSummary.tsx`). */
  covers: 9,
  ranked: 30,
  edgeNames: 10,
} as const;

const ranked = (list: readonly Ranked[]): Ranked[] =>
  list.slice(0, PUBLIC_YEAR_SUMMARY_LIMITS.ranked).map(({ name, count }) => ({ name, count }));

const edge = ({ month, names }: SummaryWhenEdge): SummaryWhenEdge => ({
  month,
  names: names.slice(0, PUBLIC_YEAR_SUMMARY_LIMITS.edgeNames),
});

function when(source: SummaryWhen | null): SummaryWhen | null {
  if (!source) return null;
  return {
    precision: 'month',
    months: [...source.months],
    topMonths: [...source.topMonths],
    topCount: source.topCount,
    dated: source.dated,
    undated: source.undated,
    first: edge(source.first),
    last: edge(source.last),
  };
}

export function publicYearSummary(summary: YearSummary): YearSummary {
  const { best, previous, palmares } = summary;
  return {
    year: summary.year,
    count: summary.count,
    covers: summary.covers
      .slice(0, PUBLIC_YEAR_SUMMARY_LIMITS.covers)
      .map(({ name, platforms }) => ({ name, platforms: [...platforms] })),
    avgGrade: summary.avgGrade,
    withReview: summary.withReview,
    platforms: ranked(summary.platforms),
    best: best
      ? { name: best.name, grade: best.grade, genre: best.genre, platform: best.platform, platforms: [...best.platforms], quote: '' }
      : null,
    podium: summary.podium.map(({ name, grade }) => ({ name, grade })),
    genres: summary.genres
      .slice(0, PUBLIC_YEAR_SUMMARY_LIMITS.ranked)
      .map(({ name, count, avgGrade, bestName }) => ({ name, count, avgGrade, bestName })),
    when: when(summary.when),
    strengths: ranked(summary.strengths),
    weaknesses: ranked(summary.weaknesses),
    previous: previous
      ? {
          year: previous.year,
          count: previous.count,
          avgGrade: previous.avgGrade,
          months: previous.months ? [...previous.months] : null,
          undated: previous.undated,
          genreRise: previous.genreRise ? { ...previous.genreRise } : null,
        }
      : null,
    common: null,
    palmares: palmares ? { rank: palmares.rank, seasonName: palmares.seasonName } : null,
  };
}
