// Resumen de estadísticas del panel "Perfil", calculado en UNA sola pasada sobre las listas.
//
// Por qué una sola pasada y no una función por métrica: los cinco indicadores leen los MISMOS juegos, así que
// separarlos obligaría a recorrer la biblioteca cinco veces para no ganar nada; aquí cada bloque de acumuladores
// va comentado y las reglas de negocio (qué lista puntúa, a qué año van las horas) quedan juntas y en un único
// sitio. Función pura: sin React, sin repositorios, sin fechas del sistema → testeable directamente.
//
// REGLA DE ORO: esto solo LEE. No hay campos nuevos en `GameItem`, no se escribe nada en el gist ni se proyecta
// al canal social; si mañana hiciera falta persistir algo (histórico del backlog), va aparte y en local.
import { SCORE_BUCKET_FLOORS, STARS_MAX, GRADE_MAX, resolveGrade, starsFromGrade } from '../utils/scoreScale';
import { sortEs } from '../utils/compare';
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import type { GradeBucket, StatsSummary, TagBucket, YearBucket } from './types';

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
 * Resumen completo del panel. `data` es el estado que ya tiene el view-model en memoria, así que esto no toca
 * red ni almacenamiento: es O(juegos) y se memoiza en `useStatsViewModel`.
 */
export function computeStats(data: TabData): StatsSummary {
  const counts = { c: 0, v: 0, e: 0, p: 0 } as Record<TabId, number>;
  const yearBuckets = new Map<number, YearBucket>();
  const genres = new Map<string, TagBucket>();
  const platforms = new Map<string, TagBucket>();
  const grades = emptyGradeBuckets();

  let noYear: YearBucket | null = null;
  let totalHours = 0;
  let completedHours = 0;
  let gradeSum = 0;
  let scoredCount = 0;
  let longest: { name: string; hours: number } | null = null;

  for (const tab of TAB_IDS) {
    const played = PLAYED_TABS.includes(tab);
    const scores = SCORED_TABS.includes(tab);

    for (const game of data[tab] || []) {
      // Los registros sin nombre son filas a medio crear, no juegos: no deben pesar en ningún indicador.
      if (!game?.name?.trim()) continue;
      counts[tab] += 1;

      const hours = played ? gameHours(game) : 0;
      if (played) {
        totalHours += hours;
        for (const genre of game.genres || []) addTag(genres, genre, hours);
        for (const platform of game.platforms || []) addTag(platforms, platform, hours);
        if (hours > 0 && (!longest || hours > longest.hours)) {
          longest = { name: game.name.trim(), hours };
        }
      }

      if (scores && hasScore(game)) {
        const grade = resolveGrade(game);
        gradeSum += grade;
        scoredCount += 1;
        // `starsFromGrade` devuelve 1–5 aquí: la nota es > 0 por `hasScore`, así que nunca cae en el tramo 0.
        grades[starsFromGrade(grade) - 1].count += 1;
      }

      // El eje temporal es de COMPLETADOS: es la única lista con "Años completado" en el formulario.
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
        }
      }
    }
  }

  const years = [...yearBuckets.values()].sort((a, b) => (a.year as number) - (b.year as number));
  if (noYear) years.push(noYear);

  const decided = counts.c + counts.v;

  return {
    counts,
    totalGames: counts.c + counts.v + counts.e + counts.p,
    totalHours,
    completedHours,
    scored: {
      count: scoredCount,
      avgGrade: scoredCount ? gradeSum / scoredCount : 0,
    },
    completionRatio: {
      completed: counts.c,
      abandoned: counts.v,
      percent: decided ? (counts.c / decided) * 100 : 0,
    },
    years,
    grades,
    genres: [...genres.values()].sort(byWeight),
    platforms: [...platforms.values()].sort(byWeight),
    longest,
  };
}
