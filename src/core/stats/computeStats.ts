// Resumen de estadísticas del panel "Perfil", calculado en UNA sola pasada sobre las listas.
//
// Por qué una sola pasada y no una función por métrica: todos los indicadores leen los MISMOS juegos, así que
// separarlos obligaría a recorrer la biblioteca una vez por cada uno para no ganar nada. Aquí cada bloque de
// acumuladores va comentado, y las reglas de negocio (qué lista puntúa, a qué año van las horas) quedan juntas
// y en un único sitio. Función pura: sin React, sin repositorios, sin fechas del sistema → testeable directa.
//
// REGLA DE ORO: esto solo LEE, y lee lo que la app ya tiene en memoria (el gist de juegos). No hay campos
// nuevos en `GameItem`, no se escribe en el gist, no se proyecta al canal social y no se consulta la red.
import { SCORE_BUCKET_FLOORS, STARS_MAX, GRADE_MAX, resolveGrade, starsFromGrade } from '../utils/scoreScale';
import { sortEs } from '../utils/compare';
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import type {
  ArrivalPoint,
  TopSummary,
  GameRef,
  GradeBucket,
  ShameSummary,
  StatsSummary,
  TagBucket,
  WishlistSummary,
  YearBucket,
  YearSummary,
} from './types';

/**
 * Listas que representan juegos JUGADOS. "Próximos" queda fuera de todo lo que mida experiencia (horas,
 * géneros, juego más largo): es una lista de deseos, y contarla inflaría cada indicador con juegos que no se
 * han tocado.
 */
export const PLAYED_TABS: readonly TabId[] = ['c', 'v', 'e'];

/**
 * Listas cuya nota es una VALORACIÓN de lo jugado, que es lo único que tiene sentido en el histograma:
 *  - `c` completados: la nota es obligatoria en el formulario.
 *  - `v` abandonados: la nota es opcional (check `scored`); los no puntuados se guardan con nota 0.
 * Se quedan fuera `p` —ahí el campo es el INTERÉS previo, no una valoración (ver `FormModal`, etiqueta
 * "interés")— y `e`, que no tiene campo de nota y solo arrastraría la que tuviera de un paso anterior.
 */
const SCORED_TABS: readonly TabId[] = ['c', 'v'];

/** Cuántos juegos decididos (completados + abandonados) necesita un género para entrar en el índice de abandono. */
export const ABANDON_RATE_MIN = 3;

/** Cuántos juegos se listan en los rankings cortos (últimos abandonos, próximos que más esperan…). */
export const STATS_SHORTLIST = 5;

/**
 * Cuántos juegos forman "tu élite" en el retrato del top. Diez es suficiente para que los géneros repetidos
 * signifiquen algo y bastante poco como para que sigan siendo tus favoritos y no media biblioteca.
 */
export const STATS_TOP_SIZE = 10;
/** Cuántos suben al podio. */
const PODIUM = 3;

/**
 * ¿Tiene el juego una nota que contar? Se mira la nota EFECTIVA y no el flag `scored`, igual que hace la tabla
 * (`GameTable`): los juegos guardados antes de que ese flag existiera tienen nota pero no flag, y mirándolo se
 * les descartaría una puntuación que sí pusieron.
 */
function hasScore(game: GameItem): boolean {
  return resolveGrade(game) > 0;
}

/** Horas del juego como número utilizable (0 si viene a null, vacío o mal formado). */
function gameHours(game: GameItem): number {
  const hours = Number(game.hours);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * Año al que se atribuye un juego completado: el ÚLTIMO de sus años.
 *
 * `years` ("Años completado") es multivalor porque un juego puede completarse varias veces, y `hours` es el
 * total del juego, no el de cada pasada. Repartir ese total entre los años inventaría un dato que nadie ha
 * registrado, así que se cuenta entero en la última pasada, que es la que el usuario recuerda como "el año que
 * lo jugué". Devuelve null si no hay ningún año (juegos importados o completados antes de que el campo se
 * rellenara), y esos caen en el cajón "sin año" en vez de desaparecer del gráfico.
 */
function attributionYear(game: GameItem): number | null {
  const years = (game.years || []).map(Number).filter((year) => Number.isFinite(year));
  return years.length ? Math.max(...years) : null;
}

/** Mes `AAAA-MM` de una marca de tiempo, en el calendario local (el que usa quien mira el gráfico). */
function monthOf(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toRef(game: GameItem): GameRef {
  return {
    id: game.id,
    name: game.name.trim(),
    grade: resolveGrade(game),
    hours: gameHours(game),
    at: Number(game.listedAt) || Number(game._ts) || 0,
    // Se reutilizan las MISMAS arrays del juego (no se copian): el panel solo las lee.
    genres: game.genres || [],
    platforms: game.platforms || [],
  };
}

/** De mejor a peor nota; a igualdad, el más largo primero; a igualdad, alfabético (orden estable). */
function byRank(a: GameRef, b: GameRef): number {
  return b.grade - a.grade || b.hours - a.hours || sortEs(a.name, b.name);
}

/**
 * Retrato de los mejores: coge el top N por nota y resume en qué se parecen.
 *
 * Los géneros y las plataformas se cuentan SOLO dentro de ese top, que es justo lo que lo hace interesante:
 * comparado con el reparto general, enseña si lo que más te gusta coincide con lo que más juegas.
 */
function topSummary(games: GameRef[], limit = STATS_TOP_SIZE): TopSummary {
  const ranked = games.filter((game) => game.grade > 0).sort(byRank).slice(0, limit);
  if (ranked.length === 0) {
    return { podium: [], sample: 0, avgGrade: 0, avgHours: 0, cutoff: 0, genres: [], platforms: [] };
  }

  const genres = new Map<string, TagBucket>();
  const platforms = new Map<string, TagBucket>();
  let gradeSum = 0;
  let hoursSum = 0;
  let withHours = 0;

  for (const game of ranked) {
    gradeSum += game.grade;
    if (game.hours > 0) {
      hoursSum += game.hours;
      withHours += 1;
    }
    for (const genre of game.genres) addTag(genres, genre, game.hours);
    for (const platform of game.platforms) addTag(platforms, platform, game.hours);
  }

  return {
    podium: ranked.slice(0, PODIUM),
    sample: ranked.length,
    avgGrade: gradeSum / ranked.length,
    // Media SOLO sobre los que tienen horas: contar como cero a los que no las anotaron hundiría el dato.
    avgHours: withHours ? hoursSum / withHours : 0,
    cutoff: ranked[ranked.length - 1].grade,
    genres: sortedTags(genres),
    platforms: sortedTags(platforms),
  };
}

/** Suma una etiqueta al acumulador (un juego con 3 géneros cuenta en los 3). */
function addTag(target: Map<string, TagBucket>, tag: string, hours: number): void {
  const key = tag.trim();
  if (!key) return;
  const bucket = target.get(key);
  if (bucket) {
    bucket.games += 1;
    bucket.hours += hours;
    return;
  }
  target.set(key, { tag: key, games: 1, hours });
}

/** De más a menos juegos; a igualdad, más horas; a igualdad, alfabético (para que el orden sea estable). */
function byWeight(a: TagBucket, b: TagBucket): number {
  return b.games - a.games || b.hours - a.hours || sortEs(a.tag, b.tag);
}

function sortedTags(source: Map<string, TagBucket>): TagBucket[] {
  return [...source.values()].sort(byWeight);
}

/** Tramos vacíos del histograma (1–5 estrellas). El 0 no es un tramo: nota 0 significa "sin puntuar". */
function emptyGradeBuckets(): GradeBucket[] {
  return Array.from({ length: STARS_MAX }, (_unused, index) => {
    const stars = index + 1;
    return {
      stars,
      floor: SCORE_BUCKET_FLOORS[stars],
      // Techo del tramo = suelo del siguiente menos 1; el último llega a 100.
      ceiling: stars === STARS_MAX ? GRADE_MAX : SCORE_BUCKET_FLOORS[stars + 1] - 1,
      count: 0,
    };
  });
}

/** Acumulador mutable de un año mientras dura la pasada; se convierte en `YearSummary` al cerrar. */
interface YearAccumulator {
  year: number;
  hours: number;
  scored: number;
  gradeSum: number;
  genres: Map<string, TagBucket>;
  platforms: Map<string, TagBucket>;
  grades: GradeBucket[];
  games: GameRef[];
}

function newYearAccumulator(year: number): YearAccumulator {
  return {
    year,
    hours: 0,
    scored: 0,
    gradeSum: 0,
    genres: new Map(),
    platforms: new Map(),
    grades: emptyGradeBuckets(),
    games: [],
  };
}

function closeYear(acc: YearAccumulator): YearSummary {
  // De mejor a peor nota; a igualdad, el más largo primero (así el listado del año se lee como un ranking).
  const games = acc.games.slice().sort(byRank);
  const longest = acc.games.reduce<GameRef | null>(
    (top, game) => (game.hours > 0 && (!top || game.hours > top.hours) ? game : top),
    null,
  );

  return {
    year: acc.year,
    completed: acc.games.length,
    hours: acc.hours,
    scored: acc.scored,
    avgGrade: acc.scored ? acc.gradeSum / acc.scored : 0,
    genres: sortedTags(acc.genres),
    platforms: sortedTags(acc.platforms),
    grades: acc.grades,
    best: games[0]?.grade > 0 ? games[0] : null,
    longest,
    top: topSummary(games),
    games,
  };
}

/**
 * Resumen completo del panel. `data` es el estado que ya tiene el view-model en memoria, así que esto no toca
 * red ni almacenamiento: es O(juegos) y se memoiza en `useStatsViewModel`.
 */
export function computeStats(data: TabData): StatsSummary {
  const counts = { c: 0, v: 0, e: 0, p: 0 } as Record<TabId, number>;
  const yearBuckets = new Map<number, YearBucket>();
  const yearSummaries = new Map<number, YearAccumulator>();
  const arrivals = new Map<string, ArrivalPoint>();
  const genres = new Map<string, TagBucket>();
  const platforms = new Map<string, TagBucket>();
  const grades = emptyGradeBuckets();
  // Completados vs abandonados por género, para el índice de abandono.
  const outcomes = new Map<string, { completed: number; abandoned: number }>();

  // Acumuladores de las dos listas con apartado propio.
  const shameGenres = new Map<string, TagBucket>();
  const shameReasons = new Map<string, TagBucket>();
  const shameGames: GameRef[] = [];
  const wishGenres = new Map<string, TagBucket>();
  const wishPlatforms = new Map<string, TagBucket>();
  const wishGames: GameRef[] = [];

  let noYear: YearBucket | null = null;
  let totalHours = 0;
  let completedHours = 0;
  let gradeSum = 0;
  const scoredGames: GameRef[] = [];
  let longest: GameRef | null = null;
  let shameHours = 0;
  let shameScored = 0;
  let shameGradeSum = 0;
  let shameRetry = 0;
  let wishInterestCount = 0;
  let wishInterestSum = 0;
  let wishDeck = 0;

  for (const tab of TAB_IDS) {
    const played = PLAYED_TABS.includes(tab);
    const scores = SCORED_TABS.includes(tab);

    for (const game of data[tab] || []) {
      // Los registros sin nombre son filas a medio crear, no juegos: no deben pesar en ningún indicador.
      if (!game?.name?.trim()) continue;
      counts[tab] += 1;

      const ref = toRef(game);
      const hours = played ? ref.hours : 0;

      // Entradas por mes: `listedAt` es la fecha de llegada a la lista ACTUAL y `normalizeGame` garantiza que
      // siempre tenga valor (cae a `_ts` en los juegos anteriores al campo, que es una aproximación).
      if (ref.at > 0) {
        const key = monthOf(ref.at);
        const point = arrivals.get(key) || { m: key, c: 0, v: 0, e: 0, p: 0 };
        point[tab] += 1;
        arrivals.set(key, point);
      }

      if (played) {
        totalHours += hours;
        for (const genre of game.genres || []) addTag(genres, genre, hours);
        for (const platform of game.platforms || []) addTag(platforms, platform, hours);
        if (hours > 0 && (!longest || hours > longest.hours)) longest = ref;
      }

      if (scores && hasScore(game)) {
        gradeSum += ref.grade;
        scoredGames.push(ref);
        // `starsFromGrade` devuelve 1–5 aquí: la nota es > 0 por `hasScore`, así que nunca cae en el tramo 0.
        grades[starsFromGrade(ref.grade) - 1].count += 1;
      }

      // Desenlace por género: solo cuenta lo YA decidido (completado o abandonado); en curso y próximos
      // todavía no dicen nada sobre si ese género se termina o se deja.
      if (tab === 'c' || tab === 'v') {
        for (const genre of game.genres || []) {
          const key = genre.trim();
          if (!key) continue;
          const outcome = outcomes.get(key) || { completed: 0, abandoned: 0 };
          if (tab === 'c') outcome.completed += 1;
          else outcome.abandoned += 1;
          outcomes.set(key, outcome);
        }
      }

      if (tab === 'c') {
        completedHours += hours;
        const year = attributionYear(game);

        if (year === null) {
          noYear = noYear || { year: null, completed: 0, hours: 0 };
          noYear.completed += 1;
          noYear.hours += hours;
        } else {
          const bucket = yearBuckets.get(year) || { year, completed: 0, hours: 0 };
          bucket.completed += 1;
          bucket.hours += hours;
          yearBuckets.set(year, bucket);

          // Resumen del año: mismo juego, mismo año de atribución. Así la pestaña de 2024 y la columna de
          // 2024 del gráfico anual no pueden discrepar.
          const acc = yearSummaries.get(year) || newYearAccumulator(year);
          acc.hours += hours;
          acc.games.push(ref);
          for (const genre of game.genres || []) addTag(acc.genres, genre, hours);
          for (const platform of game.platforms || []) addTag(acc.platforms, platform, hours);
          if (hasScore(game)) {
            acc.scored += 1;
            acc.gradeSum += ref.grade;
            acc.grades[starsFromGrade(ref.grade) - 1].count += 1;
          }
          yearSummaries.set(year, acc);
        }
      }

      if (tab === 'v') {
        shameHours += hours;
        shameGames.push(ref);
        if (game.retry) shameRetry += 1;
        for (const genre of game.genres || []) addTag(shameGenres, genre, hours);
        // `reasons` (razones del abandono) solo existe en esta lista; es lo más cercano a un "por qué".
        for (const reason of game.reasons || []) addTag(shameReasons, reason, hours);
        if (hasScore(game)) {
          shameScored += 1;
          shameGradeSum += ref.grade;
        }
      }

      if (tab === 'p') {
        wishGames.push(ref);
        if (game.steamDeck) wishDeck += 1;
        for (const genre of game.genres || []) addTag(wishGenres, genre, 0);
        for (const platform of game.platforms || []) addTag(wishPlatforms, platform, 0);
        // En esta lista la nota es el INTERÉS previo: se resume aparte y nunca se mezcla con las valoraciones.
        if (ref.grade > 0) {
          wishInterestCount += 1;
          wishInterestSum += ref.grade;
        }
      }
    }
  }

  const years = [...yearBuckets.values()].sort((a, b) => (a.year as number) - (b.year as number));
  if (noYear) years.push(noYear);

  const decided = counts.c + counts.v;
  const byRecent = (a: GameRef, b: GameRef) => b.at - a.at || sortEs(a.name, b.name);

  const shame: ShameSummary = {
    total: counts.v,
    hours: shameHours,
    scored: shameScored,
    avgGrade: shameScored ? shameGradeSum / shameScored : 0,
    retry: shameRetry,
    genres: sortedTags(shameGenres),
    reasons: sortedTags(shameReasons),
    recent: shameGames.slice().sort(byRecent).slice(0, STATS_SHORTLIST),
    abandonRate: [...outcomes.entries()]
      .map(([tag, outcome]) => ({
        tag,
        completed: outcome.completed,
        abandoned: outcome.abandoned,
        decided: outcome.completed + outcome.abandoned,
        percent: (outcome.abandoned / (outcome.completed + outcome.abandoned)) * 100,
      }))
      // Con uno o dos juegos, un 100% de abandono no dice nada: se pide un mínimo de recorrido.
      .filter((entry) => entry.decided >= ABANDON_RATE_MIN && entry.abandoned > 0)
      .sort((a, b) => b.percent - a.percent || b.decided - a.decided || sortEs(a.tag, b.tag))
      .slice(0, STATS_SHORTLIST),
  };

  const wishlist: WishlistSummary = {
    total: counts.p,
    genres: sortedTags(wishGenres),
    platforms: sortedTags(wishPlatforms),
    interest: {
      count: wishInterestCount,
      avgGrade: wishInterestCount ? wishInterestSum / wishInterestCount : 0,
    },
    deck: wishDeck,
    recent: wishGames.slice().sort(byRecent).slice(0, STATS_SHORTLIST),
    // Los que llevan más tiempo esperando: el dato que de verdad describe un backlog.
    oldest: wishGames.slice().sort((a, b) => a.at - b.at || sortEs(a.name, b.name)).slice(0, STATS_SHORTLIST),
    games: wishGames.slice().sort((a, b) => a.at - b.at || sortEs(a.name, b.name)),
  };

  return {
    counts,
    totalGames: counts.c + counts.v + counts.e + counts.p,
    totalHours,
    completedHours,
    scored: {
      count: scoredGames.length,
      avgGrade: scoredGames.length ? gradeSum / scoredGames.length : 0,
      games: scoredGames,
    },
    completionRatio: {
      completed: counts.c,
      abandoned: counts.v,
      percent: decided ? (counts.c / decided) * 100 : 0,
    },
    years,
    byYear: [...yearSummaries.values()].sort((a, b) => b.year - a.year).map(closeYear),
    arrivals: [...arrivals.values()].sort((a, b) => sortEs(a.m, b.m)),
    grades,
    genres: sortedTags(genres),
    platforms: sortedTags(platforms),
    longest,
    top: topSummary(scoredGames),
    shame,
    wishlist,
  };
}
