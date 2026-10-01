import type { GameItem } from '../../model/types/game';
import type { PalmaresEntry } from '../../model/types/premios';
import { isParticipation, palmaresYear } from '../premios/palmares';
import { normalizeName } from '../utils/normalizeName';
import { resolveGrade } from '../utils/scoreScale';
import type { FinishedGame, FinishPrecision } from '../utils/finishDates';

/**
 * EL RESUMEN DEL AÑO de un perfil: qué completó, cuál fue su juego del año, cuándo los terminó, qué géneros, qué
 * valoró y qué compartís. Puro: recibe las listas ya recortadas a lo que quien mira puede ver.
 *
 * NO es el panel de un año de Estadísticas con otra cara. Lo que tiene de propio es lo que aquel no cuenta: la
 * cita de su reseña, el mes (o el día) de cada fin, lo que más valoró y le chirrió, la comparación con el año
 * anterior y lo que tenéis en común. Y lo que NO lleva, a propósito: horas. El tiempo de juego es el dato que cada
 * cual puede esconder a todo el mundo, y un resumen que lo enseñara a medias se leería como poco jugado.
 *
 * Todo sale de COMPLETADOS: es la única lista con año (`years`), y el año es lo que este resumen pregunta.
 */

/**
 * El año que se resume: en diciembre, el que está acabando (que es cuando apetece mirarlo); el resto del año, el
 * anterior, ya cerrado.
 */
export function summaryYear(now: Date = new Date()): number {
  return now.getMonth() === 11 ? now.getFullYear() : now.getFullYear() - 1;
}

/** Cuántos caracteres de su reseña se citan: los mismos que el extracto que ya publica la proyección pública. */
export const QUOTE_MAX_CHARS = 160;

export interface Ranked {
  name: string;
  count: number;
}

export interface SummaryGenre extends Ranked {
  /** Nota media de los de ese género con nota; `null` si ninguno la tiene. */
  avgGrade: number | null;
  /** El de mejor nota de ese género (el primero que se completó, si no hay notas). */
  bestName: string;
}

export interface SummaryWhenEdge {
  /** Mes 0–11. */
  month: number;
  /** Día del mes, solo con precisión de día. */
  day?: number;
  /** Los juegos que comparten ese primer (o último) momento: con precisión de mes puede haber varios. */
  names: string[];
}

export interface SummaryWhen {
  precision: FinishPrecision;
  /** Juegos terminados por mes, 0–11. */
  months: number[];
  /** Los meses con más juegos (varios si empatan). */
  topMonths: number[];
  topCount: number;
  /** Juegos del año con fecha y sin ella (importados en bloque, rejugadas o anteriores al sello). */
  dated: number;
  undated: number;
  first: SummaryWhenEdge;
  last: SummaryWhenEdge;
  /** Solo con precisión de día: cada día con algún fin (`AAAA-MM-DD` → nombres) y el día de la semana favorito. */
  days?: {
    finishes: Array<{ key: string; names: string[] }>;
    /** 0 = domingo … 6 = sábado; `null` si ninguno destaca (empate en cabeza). */
    topWeekday: number | null;
    topWeekdayCount: number;
  };
}

/** Lo mínimo de un juego para pedir su carátula: nombre y plataformas (la clave con la que se resolvió). */
export interface SummaryCoverRef {
  name: string;
  platforms: string[];
}

export interface YearSummary {
  year: number;
  count: number;
  /** Los juegos del año de mejor a peor nota, con lo justo para pedir sus carátulas (la composición de la portada). */
  covers: SummaryCoverRef[];
  /** Media de nota (0–100) de los que tienen nota; `null` si ninguno. */
  avgGrade: number | null;
  /** Cuántos de ese año tienen reseña escrita. */
  withReview: number;
  platforms: Ranked[];
  best: { name: string; grade: number; genre: string | null; platform: string | null; platforms: string[]; quote: string } | null;
  /** Segundo y tercero, detrás del juego del año. */
  podium: Array<{ name: string; grade: number }>;
  genres: SummaryGenre[];
  /** `null` cuando ningún juego del año tiene fecha: la tarjeta no se pinta en vez de enseñar doce ceros. */
  when: SummaryWhen | null;
  strengths: Ranked[];
  weaknesses: Ranked[];
  previous: { year: number; count: number; avgGrade: number | null } | null;
  /** Solo al mirar a OTRA persona: lo que completasteis los dos ese año. */
  common: { names: string[]; top: SummaryCoverRef | null; gap: { name: string; theirs: number; yours: number } | null } | null;
  /** Su resultado en la porra de ese año: puesto 1–5, o 0 si participó sin entrar en los cinco. */
  palmares: { rank: number; seasonName: string } | null;
}

const STRENGTHS_MAX = 8;
const WEAKNESSES_MAX = 4;

function completedIn(games: readonly GameItem[], year: number): GameItem[] {
  return games.filter((game) => Array.isArray(game.years) && game.years.includes(year));
}

function gradeOf(game: GameItem): number {
  return resolveGrade(game);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

/** Recuento de etiquetas sin distinguir mayúsculas, con la primera grafía que aparece. */
function tally(lists: Array<readonly string[] | undefined>): Ranked[] {
  const counts = new Map<string, Ranked>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const raw of list || []) {
      const name = String(raw || '').trim();
      const key = name.toLocaleLowerCase('es');
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { name, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * La cita del juego del año: su reseña recortada a `QUOTE_MAX_CHARS`, por el final de una frase si cabe alguna
 * entera que no sea un suspiro; si no, por la última palabra y con puntos suspensivos.
 */
export function quoteFromReview(review: string): string {
  const text = String(review || '').replace(/\s+/g, ' ').trim();
  if (text.length <= QUOTE_MAX_CHARS) return text;
  const head = text.slice(0, QUOTE_MAX_CHARS);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('… '));
  if (sentenceEnd >= 60) return head.slice(0, sentenceEnd + 1);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[,;:]$/, '')}…`;
}

function byGradeThenName(a: { grade: number; name: string }, b: { grade: number; name: string }): number {
  return b.grade - a.grade || a.name.localeCompare(b.name, 'es');
}

function buildGenres(games: GameItem[]): SummaryGenre[] {
  return tally(games.map((game) => game.genres)).map(({ name, count }) => {
    const key = name.toLocaleLowerCase('es');
    const own = games.filter((game) => (game.genres || []).some((genre) => genre.trim().toLocaleLowerCase('es') === key));
    const graded = own.map((game) => ({ name: game.name, grade: gradeOf(game) })).filter((game) => game.grade > 0);
    const best = graded.sort(byGradeThenName)[0]?.name || own[0]?.name || '';
    return { name, count, avgGrade: average(graded.map((game) => game.grade)), bestName: best };
  });
}

function edge(entries: Array<{ key: string; name: string }>, pick: 'first' | 'last', precision: FinishPrecision): SummaryWhenEdge {
  const keyLength = precision === 'day' ? 10 : 7;
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  const target = (pick === 'first' ? sorted[0] : sorted[sorted.length - 1]).key.slice(0, keyLength);
  const names = sorted.filter((entry) => entry.key.slice(0, keyLength) === target).map((entry) => entry.name);
  return {
    month: Number(target.slice(5, 7)) - 1,
    ...(precision === 'day' ? { day: Number(target.slice(8, 10)) } : {}),
    names,
  };
}

function buildWhen(games: FinishedGame[], year: number, precision: FinishPrecision): SummaryWhen | null {
  // Una fecha solo vale para ESTE año si cae en él: el sello es de la primera vez que entró en completados, así
  // que la rejugada de un juego terminado otro año se queda sin fecha en vez de contar en el mes equivocado.
  const prefix = `${year}-`;
  const dated = games
    .filter((game) => typeof game.finishedOn === 'string' && game.finishedOn.startsWith(prefix))
    .map((game) => ({ key: game.finishedOn as string, name: game.name }));
  if (dated.length === 0) return null;

  const months = Array.from({ length: 12 }, () => 0);
  for (const entry of dated) months[Number(entry.key.slice(5, 7)) - 1] += 1;
  const topCount = Math.max(...months);
  const when: SummaryWhen = {
    precision,
    months,
    topMonths: months.flatMap((count, month) => (count === topCount ? [month] : [])),
    topCount,
    dated: dated.length,
    undated: games.length - dated.length,
    first: edge(dated, 'first', precision),
    last: edge(dated, 'last', precision),
  };

  if (precision === 'day' && dated.every((entry) => entry.key.length >= 10)) {
    const perDay = new Map<string, string[]>();
    for (const entry of dated) perDay.set(entry.key, [...(perDay.get(entry.key) || []), entry.name]);
    const weekdays = Array.from({ length: 7 }, () => 0);
    for (const entry of dated) weekdays[new Date(`${entry.key}T12:00:00`).getDay()] += 1;
    const topWeekdayCount = Math.max(...weekdays);
    const leaders = weekdays.filter((count) => count === topWeekdayCount).length;
    when.days = {
      finishes: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, names]) => ({ key, names })),
      topWeekday: leaders === 1 && topWeekdayCount > 1 ? weekdays.indexOf(topWeekdayCount) : null,
      topWeekdayCount,
    };
  }
  return when;
}

function buildCommon(theirs: GameItem[], viewer: readonly GameItem[], year: number): YearSummary['common'] {
  const mine = new Map(completedIn(viewer, year).map((game) => [normalizeName(game.name), game]));
  const shared = theirs.filter((game) => mine.has(normalizeName(game.name)));
  let gap: { name: string; theirs: number; yours: number } | null = null;
  for (const game of shared) {
    const their = gradeOf(game);
    const your = gradeOf(mine.get(normalizeName(game.name)) as GameItem);
    if (their <= 0 || your <= 0) continue;
    if (!gap || Math.abs(their - your) > Math.abs(gap.theirs - gap.yours)) gap = { name: game.name, theirs: their, yours: your };
  }
  // Un «donde más chocáis» con dos notas iguales no dice nada.
  if (gap && gap.theirs === gap.yours) gap = null;
  // El MEJOR en común —el de la carátula de fondo— es el que más os gustó a los dos: la media de las dos notas.
  const both = (game: GameItem) => (gradeOf(game) + gradeOf(mine.get(normalizeName(game.name)) as GameItem)) / 2;
  const topGame = [...shared].sort((a, b) => both(b) - both(a) || a.name.localeCompare(b.name, 'es'))[0];
  return {
    names: shared.map((game) => game.name),
    top: topGame ? { name: topGame.name, platforms: topGame.platforms || [] } : null,
    gap,
  };
}

function buildPalmares(entries: readonly PalmaresEntry[], year: number): YearSummary['palmares'] {
  const ofYear = entries.filter((entry) => palmaresYear(entry) === year);
  if (ofYear.length === 0) return null;
  const placed = ofYear.filter((entry) => !isParticipation(entry)).sort((a, b) => a.rank - b.rank)[0];
  const entry = placed || ofYear[0];
  return { rank: placed ? entry.rank : 0, seasonName: entry.seasonName };
}

export interface YearSummaryInput {
  /** Sus completados, ya recortados a lo que quien mira puede ver y con `finishedOn` donde lo haya. */
  completed: readonly FinishedGame[];
  year: number;
  precision: FinishPrecision;
  /** Los completados de QUIEN MIRA, para «contigo». `null` en el perfil propio. */
  viewerCompleted?: readonly GameItem[] | null;
  palmares?: readonly PalmaresEntry[];
}

/** El resumen del año, o `null` si ese año no completó nada (y entonces no hay botón que ofrecer). */
export function buildYearSummary({ completed, year, precision, viewerCompleted = null, palmares = [] }: YearSummaryInput): YearSummary | null {
  const games = completedIn(completed, year) as FinishedGame[];
  if (games.length === 0) return null;

  const graded = games.map((game) => ({ name: game.name, grade: gradeOf(game), game })).filter((entry) => entry.grade > 0);
  const ranked = [...graded].sort(byGradeThenName);
  const top = ranked[0];
  const previousGames = completedIn(completed, year - 1);

  const byGrade = [...games].sort((a, b) => gradeOf(b) - gradeOf(a) || a.name.localeCompare(b.name, 'es'));

  return {
    year,
    count: games.length,
    covers: byGrade.map((game) => ({ name: game.name, platforms: game.platforms || [] })),
    avgGrade: average(graded.map((entry) => entry.grade)),
    withReview: games.filter((game) => String(game.review || '').trim().length > 0).length,
    platforms: tally(games.map((game) => game.platforms)),
    best: top
      ? {
          name: top.name,
          grade: top.grade,
          genre: top.game.genres?.[0] || null,
          platform: top.game.platforms?.[0] || null,
          platforms: top.game.platforms || [],
          quote: quoteFromReview(top.game.review),
        }
      : null,
    podium: ranked.slice(1, 3).map(({ name, grade }) => ({ name, grade })),
    genres: buildGenres(games),
    when: buildWhen(games, year, precision),
    strengths: tally(games.map((game) => game.strengths)).slice(0, STRENGTHS_MAX),
    weaknesses: tally(games.map((game) => game.weaknesses)).slice(0, WEAKNESSES_MAX),
    previous: previousGames.length
      ? {
          year: year - 1,
          count: previousGames.length,
          avgGrade: average(previousGames.map(gradeOf).filter((grade) => grade > 0)),
        }
      : null,
    common: viewerCompleted ? buildCommon(games, viewerCompleted, year) : null,
    palmares: buildPalmares(palmares, year),
  };
}
