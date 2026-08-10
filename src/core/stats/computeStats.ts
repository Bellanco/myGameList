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
  GenreAffinity,
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
 * Cuántos juegos forman "tu élite": los que se listan Y los que alimentan el agregado. Es un solo número a
 * propósito — si la pantalla enseña quince títulos, los géneros y las plataformas tienen que ser los de esos
 * quince, no los de un subconjunto que nadie ve.
 */
export const STATS_TOP_SIZE = 15;
/** Juegos puntuados que necesita un género para que su nota media entre en el ranking. */
export const GENRE_GRADE_MIN = 3;
/** Largo de la cita del panel y mínimo por debajo del cual no merece la pena buscar un corte limpio. */
const QUOTE_MAX = 220;
const QUOTE_MIN = 60;
/** Por debajo de esto no hay cita que enseñar: una reseña de dos letras es una nota para uno mismo. */
const QUOTE_WORTH = 24;
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
 * TODOS los años en los que se completó el juego, de menor a mayor y sin repetidos.
 *
 * `years` ("Años completado") es multivalor porque un juego puede completarse varias veces, y el panel cuenta
 * cada pasada en SU año: quien terminó Cuphead en 2018, 2020 y 2022 lo jugó los tres años, y verlo solo en el
 * último borraba dos de las tres veces que pasó. Devuelve la lista vacía si no hay ningún año (juegos
 * importados o completados antes de que el campo se rellenara), y esos caen en el cajón "sin año" en vez de
 * desaparecer del gráfico.
 *
 * Las HORAS son otra cosa: `hours` es el total del juego, no el de cada pasada, así que repartirlo entre los
 * años inventaría un dato que nadie ha registrado y sumarlo entero en cada uno multiplicaría las horas de la
 * biblioteca. Se atribuyen enteras al ÚLTIMO año —el que se recuerda como "el año que lo jugué"— y en los
 * demás el juego suma como completado con cero horas. Así la suma de los años sigue cuadrando con el total.
 */
function completionYears(game: GameItem): number[] {
  const years = (game.years || []).map(Number).filter((year) => Number.isFinite(year));
  return [...new Set(years)].sort((a, b) => a - b);
}

/** Mes `AAAA-MM` de una marca de tiempo, en el calendario local (el que usa quien mira el gráfico). */
function monthOf(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Cita para el panel: la primera frase de la reseña, y si es muy larga, un recorte con puntos suspensivos.
 *
 * Se corta por el PUNTO y no por el número de caracteres a secas porque una cita partida a mitad de palabra en
 * el podio se lee como un error, no como una cita. El texto entero vive en el juego, y la pantalla de reseñas
 * lo saca de ahí: guardarlo en el resumen lo duplicaría entero en memoria para enseñar dos líneas.
 */
function quoteFrom(review: unknown): string {
  const text = String(review || '').trim().replace(/\s+/g, ' ');
  if (text.length < QUOTE_WORTH) return '';
  if (text.length <= QUOTE_MAX) return text;

  const stop = text.slice(0, QUOTE_MAX).lastIndexOf('. ');
  if (stop > QUOTE_MIN) return text.slice(0, stop + 1);

  const space = text.slice(0, QUOTE_MAX).lastIndexOf(' ');
  return `${text.slice(0, space > QUOTE_MIN ? space : QUOTE_MAX).trimEnd()}…`;
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
    replays: (game.years || []).length,
    hasReview: String(game.review || '').trim().length > 0,
    quote: quoteFrom(game.review),
  };
}

/**
 * De mejor a peor nota; a igualdad manda haberlo REJUGADO, luego las horas y por último el alfabeto.
 *
 * El desempate por rejugadas es lo que distingue "le puse un 10" de "le puse un 10 y volví": volver a un juego
 * es el voto más sincero que existe, y entre dos notas iguales coloca arriba al que de verdad te atrapó.
 */
function byRank(a: GameRef, b: GameRef): number {
  return b.grade - a.grade || b.replays - a.replays || b.hours - a.hours || sortEs(a.name, b.name);
}

/**
 * Retrato de los mejores: coge el top N por nota y resume en qué se parecen.
 *
 * Los géneros y las plataformas se cuentan SOLO dentro de ese top, que es justo lo que lo hace interesante:
 * comparado con el reparto general, enseña si lo que más te gusta coincide con lo que más juegas.
 */
function topSummary(games: GameRef[], limit = STATS_TOP_SIZE): TopSummary {
  const scored = games.filter((game) => game.grade > 0).sort(byRank);
  const ranked = scored.slice(0, limit);
  if (ranked.length === 0) {
    return { podium: [], sample: 0, avgGrade: 0, avgHours: 0, cutoff: 0, genres: [], platforms: [], byGenre: [], ranked: [] };
  }

  // Nota media por género sobre TODO lo puntuado del ámbito, no solo sobre el top: la pregunta es con qué
  // género puntúas más alto, y para eso hacen falta también los que no llegaron a la élite.
  const perGenre = new Map<string, { sum: number; games: number }>();
  for (const game of scored) {
    for (const genre of game.genres) {
      const key = genre.trim();
      if (!key) continue;
      const entry = perGenre.get(key) || { sum: 0, games: 0 };
      entry.sum += game.grade;
      entry.games += 1;
      perGenre.set(key, entry);
    }
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
    ranked,
    byGenre: [...perGenre.entries()]
      .filter(([, entry]) => entry.games >= GENRE_GRADE_MIN)
      .map(([tag, entry]) => ({ tag, games: entry.games, avgGrade: entry.sum / entry.games }))
      .sort((a, b) => b.avgGrade - a.avgGrade || b.games - a.games || sortEs(a.tag, b.tag)),
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

/**
 * Peso de un juego en la afinidad, en escala EXPONENCIAL: cada estrella que baja vale la MITAD que la anterior.
 *
 *   5★ → 1     4★ → 0,5     3★ → 0,25     2★ → 0,125     1★ → 0,0625
 *
 * Con un peso lineal (la nota partida por 100) tres juegos del montón adelantaban a uno excelente, que es justo
 * lo contrario de lo que dice esta figura: un juegazo pesa más que un montón de juegos correctos. La curva es
 * continua, así que con la escala 0–100 un 85 pesa algo más que un 80 sin saltos por tramos.
 */
const GRADE_PER_HALVING = GRADE_MAX / STARS_MAX;
function gradeWeight(grade: number): number {
  return 2 ** ((Math.min(grade, GRADE_MAX) - GRADE_MAX) / GRADE_PER_HALVING);
}

/**
 * AFINIDAD por género: cuánto pesa cada género contando también qué notas le pusiste.
 *
 * Cada juego aporta el peso EXPONENCIAL de su nota (ver `gradeWeight`), así que un género de veinte juegos
 * regulares puede pesar menos que uno de tres que te encantaron. Es lo que distingue esta figura del rosetón de
 * "Géneros más jugados", que cuenta cabezas y ya está.
 *
 * Los juegos SIN nota no valen cero: pesan como la media de la biblioteca (`fallback`). Contarlos a cero
 * hundiría a quien puntúa poco —y a los géneros donde se puntúa menos— por no haber escrito un número, que es
 * una ausencia de dato, no una opinión mala.
 */
function affinityOf(games: GameRef[], fallback: number): GenreAffinity[] {
  const perGenre = new Map<string, { games: number; scored: number; gradeSum: number; weight: number }>();

  for (const game of games) {
    for (const genre of game.genres) {
      const key = genre.trim();
      if (!key) continue;
      const entry = perGenre.get(key) || { games: 0, scored: 0, gradeSum: 0, weight: 0 };
      entry.games += 1;
      if (game.grade > 0) {
        entry.scored += 1;
        entry.gradeSum += game.grade;
        entry.weight += gradeWeight(game.grade);
      } else {
        entry.weight += gradeWeight(fallback);
      }
      perGenre.set(key, entry);
    }
  }

  return [...perGenre.entries()]
    .map(([tag, entry]) => ({
      tag,
      games: entry.games,
      scored: entry.scored,
      avgGrade: entry.scored ? entry.gradeSum / entry.scored : 0,
      weight: entry.weight,
    }))
    .sort((a, b) => b.weight - a.weight || b.games - a.games || sortEs(a.tag, b.tag));
}

/** Cubo de un año recién estrenado: sin juegos, sin horas y sin reparto de notas. */
function emptyYearBucket(year: number | null): YearBucket {
  return { year, completed: 0, hours: 0, stars: new Array<number>(STARS_MAX).fill(0), unscored: 0 };
}

/**
 * Añade un completado a su año: la cuenta, sus horas y la estrella que le pusiste.
 *
 * El reparto va por los CINCO niveles y no por grupos (4–5★, 3★…): un 5★ y un 4★ no son lo mismo, y la tira
 * del gráfico anual los pinta por separado. `stars` en 0 significa completado sin puntuar, que no es un nivel
 * bajo sino ausencia de nota, y por eso tiene su propio contador.
 */
function countInYear(bucket: YearBucket, hours: number, stars: number): void {
  bucket.completed += 1;
  bucket.hours += hours;
  if (stars >= 1) bucket.stars[stars - 1] += 1;
  else bucket.unscored += 1;
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

function closeYear(acc: YearAccumulator, libraryAvg: number): YearSummary {
  // De mejor a peor nota; a igualdad, el más largo primero (así el listado del año se lee como un ranking).
  const games = acc.games.slice().sort(byRank);
  const longest = acc.games.reduce<GameRef | null>(
    (top, game) => (game.hours > 0 && (!top || game.hours > top.hours) ? game : top),
    null,
  );
  const yearAvg = acc.scored ? acc.gradeSum / acc.scored : 0;

  return {
    year: acc.year,
    completed: acc.games.length,
    hours: acc.hours,
    scored: acc.scored,
    avgGrade: yearAvg,
    genres: sortedTags(acc.genres),
    // Los sin nota de un año pesan como la media de ESE año si la hay; si no puntuaste nada, como la de la
    // biblioteca. Así un año sin notas no aplana su figura a cero.
    genreAffinity: affinityOf(acc.games, yearAvg || libraryAvg),
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
  /** Refs de las listas JUGADAS (completados, abandonados y en curso): la base de la afinidad por género. */
  const playedGames: GameRef[] = [];
  let longest: GameRef | null = null;
  let shameHours = 0;
  let shameScored = 0;
  let shameGradeSum = 0;
  let shameRetry = 0;
  const strengths = new Map<string, TagBucket>();
  const weaknesses = new Map<string, TagBucket>();
  const reviewed: GameRef[] = [];
  let reviewedClosed = 0;
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

      // Lo que escribes. Los puntos fuertes y débiles se cuentan aunque el texto esté vacío: son etiquetas del
      // juego, no del texto, y quien las marca sin escribir también está diciendo qué valora.
      if (ref.hasReview) {
        reviewed.push(ref);
        // La cobertura solo mira lo CERRADO: contando también las reseñas de lo que estás jugando, el
        // porcentaje podía pasar del 100% (más reseñas que juegos terminados o dejados).
        if (tab === 'c' || tab === 'v') reviewedClosed += 1;
      }
      for (const point of game.strengths || []) addTag(strengths, point, hours);
      for (const point of game.weaknesses || []) addTag(weaknesses, point, hours);

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
        playedGames.push(ref);
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
        const years = completionYears(game);
        const scoredGame = hasScore(game);
        const stars = scoredGame ? starsFromGrade(ref.grade) : 0;

        if (!years.length) {
          noYear = noYear || emptyYearBucket(null);
          countInYear(noYear, hours, stars);
        } else {
          // Las horas van enteras en la última pasada; las demás suman el juego con cero horas (ver
          // `completionYears`), y así la suma de los años sigue cuadrando con las horas de la biblioteca.
          const lastYear = years[years.length - 1];

          for (const year of years) {
            const yearHours = year === lastYear ? hours : 0;

            const bucket = yearBuckets.get(year) || emptyYearBucket(year);
            countInYear(bucket, yearHours, stars);
            yearBuckets.set(year, bucket);

            // Resumen del año: mismos juegos y mismos años que el gráfico. Así la pestaña de 2024 y la
            // columna de 2024 no pueden discrepar, tampoco con los rejugados.
            const acc = yearSummaries.get(year) || newYearAccumulator(year);
            acc.hours += yearHours;
            acc.games.push(ref);
            for (const genre of game.genres || []) addTag(acc.genres, genre, yearHours);
            for (const platform of game.platforms || []) addTag(acc.platforms, platform, yearHours);
            if (scoredGame) {
              acc.scored += 1;
              acc.gradeSum += ref.grade;
              acc.grades[stars - 1].count += 1;
            }
            yearSummaries.set(year, acc);
          }
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

  // Del más reciente al más antiguo: lo que interesa mirar primero es el año en curso, no aquel en el que
  // empezaste. Mismo criterio que los años de la ficha de un juego y que `byYear`.
  const years = [...yearBuckets.values()].sort((a, b) => (b.year as number) - (a.year as number));
  // El cajón "sin año" va SIEMPRE al final: no es un año, así que no compite en la ordenación.
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

  // Media de la biblioteca: es la referencia con la que pesan los juegos sin nota en la afinidad por género.
  const libraryAvg = scoredGames.length ? gradeSum / scoredGames.length : 0;

  return {
    counts,
    totalGames: counts.c + counts.v + counts.e + counts.p,
    totalHours,
    completedHours,
    scored: {
      count: scoredGames.length,
      avgGrade: libraryAvg,
      games: scoredGames,
    },
    completionRatio: {
      completed: counts.c,
      abandoned: counts.v,
      percent: decided ? (counts.c / decided) * 100 : 0,
    },
    years,
    byYear: [...yearSummaries.values()].sort((a, b) => b.year - a.year).map((acc) => closeYear(acc, libraryAvg)),
    arrivals: [...arrivals.values()].sort((a, b) => sortEs(a.m, b.m)),
    grades,
    genres: sortedTags(genres),
    genreAffinity: affinityOf(playedGames, libraryAvg),
    platforms: sortedTags(platforms),
    longest,
    reviews: {
      count: reviewed.length,
      closed: counts.c + counts.v,
      coverage: counts.c + counts.v > 0 ? (reviewedClosed / (counts.c + counts.v)) * 100 : 0,
      strengths: sortedTags(strengths),
      weaknesses: sortedTags(weaknesses),
      games: reviewed.sort(byRank),
    },
    top: topSummary(scoredGames),
    shame,
    wishlist,
  };
}
