// Formas del resumen de estadísticas (panel "Perfil"). Todo es DERIVADO de las listas que ya están en memoria:
// no hay ningún campo nuevo en `GameItem`, nada se persiste, nada se publica y NO se hace una sola consulta de
// red — la fuente es el gist de juegos que la app ya tiene cargado. Ver `computeStats`.
import type { TabId } from '../../model/types/game';

/** Un punto del eje temporal. `year: null` = juegos completados a los que no se les registró año. */
export interface YearBucket {
  year: number | null;
  /** Juegos completados atribuidos a ese año. */
  completed: number;
  /** Horas de esos juegos (ver la regla de atribución en `computeStats`). */
  hours: number;
}

/** Una etiqueta (género, plataforma o razón de abandono) con su peso. */
export interface TagBucket {
  tag: string;
  games: number;
  hours: number;
}

/** Un tramo del histograma de notas; se corresponde 1:1 con los tramos de `SCORE_BUCKET_FLOORS`. */
export interface GradeBucket {
  /** Estrellas del tramo (1–5). El 0 no es un tramo: nota 0 significa "sin puntuar". */
  stars: number;
  /** Nota mínima y máxima del tramo (para etiquetarlo en escala 0–100). */
  floor: number;
  ceiling: number;
  count: number;
}

/** Referencia ligera a un juego, para rankings y listados del panel. */
export interface GameRef {
  id: number;
  name: string;
  /** Nota efectiva 0–100. En "Próximos" no es una valoración, sino el INTERÉS previo. */
  grade: number;
  hours: number;
  /** Fecha de llegada a la lista actual (`listedAt`). */
  at: number;
  /** Las MISMAS referencias del juego original (no copias): el agregado del top las recorre. */
  genres: string[];
  platforms: string[];
  /** Cuántas veces lo has completado (años registrados). 1 en el caso normal; 0 si no es un completado. */
  replays: number;
}

/**
 * Retrato de tus mejores juegos: el podio y en qué se parecen entre sí.
 *
 * La pregunta que responde no es "cuál es el mejor" —eso ya lo dice una cifra— sino "qué tienen en común los
 * que más te gustan": qué géneros se repiten, cuánto duran y en qué plataforma los juegas.
 */
export interface TopSummary {
  /** Los tres primeros, de mejor a peor nota. */
  podium: GameRef[];
  /** Cuántos juegos entran en el agregado (el top N, o menos si no hay tantos). */
  sample: number;
  avgGrade: number;
  /** Media de horas de los del top que tienen horas anotadas; 0 si ninguno las tiene. */
  avgHours: number;
  /** Nota mínima para entrar en el top: el listón de tu élite. */
  cutoff: number;
  genres: TagBucket[];
  platforms: TagBucket[];
  /**
   * Nota media POR GÉNERO sobre todos los juegos puntuados del ámbito (no solo los del top), con un mínimo de
   * juegos para que la media signifique algo. De mayor a menor: es el ranking de lo que de verdad te gusta.
   */
  byGenre: Array<{ tag: string; games: number; avgGrade: number }>;
  /** El top completo, de mejor a peor: el podio son los tres primeros. */
  ranked: GameRef[];
}

/** Entradas a cada lista en un mes, derivadas de `listedAt`. `m` es `AAAA-MM`. */
export interface ArrivalPoint {
  m: string;
  c: number;
  v: number;
  e: number;
  p: number;
}

/** Resumen completo de un año concreto: es lo que pinta la pestaña de ese año. */
export interface YearSummary {
  year: number;
  completed: number;
  hours: number;
  scored: number;
  avgGrade: number;
  genres: TagBucket[];
  platforms: TagBucket[];
  grades: GradeBucket[];
  /** Mejor valorado y más largo del año. */
  best: GameRef | null;
  longest: GameRef | null;
  /** Retrato de los mejores del año. */
  top: TopSummary;
  /** Los juegos del año, de mejor a peor nota. */
  games: GameRef[];
}

/** Lista de la vergüenza: qué abandonas, por qué y cuánto te cuesta. */
export interface ShameSummary {
  total: number;
  hours: number;
  scored: number;
  avgGrade: number;
  /** Marcados como "dar otra oportunidad". */
  retry: number;
  genres: TagBucket[];
  /** Razones de abandono más repetidas (campo `reasons`, exclusivo de esta lista). */
  reasons: TagBucket[];
  /** Últimos abandonos, por fecha de llegada a la lista. */
  recent: GameRef[];
  /**
   * Desenlace por género: cuántos terminaste y cuántos dejaste. Solo géneros con recorrido suficiente, porque
   * un 100% de abandono sobre un único juego no dice nada.
   */
  abandonRate: Array<{ tag: string; completed: number; abandoned: number; decided: number; percent: number }>;
}

/** Lista de próximos: qué te espera y desde cuándo. */
export interface WishlistSummary {
  total: number;
  genres: TagBucket[];
  platforms: TagBucket[];
  /** La nota de esta lista es el INTERÉS previo, no una valoración. */
  interest: { count: number; avgGrade: number };
  /** Compatibles con Steam Deck. */
  deck: number;
  /** Últimos en llegar y los que llevan más tiempo esperando. */
  recent: GameRef[];
  oldest: GameRef[];
  /** TODOS los próximos, del más antiguo al más reciente: es lo que dibuja la línea de tiempo. */
  games: GameRef[];
}

export interface StatsSummary {
  /** Juegos por lista (c/v/e/p), ya descontados los registros sin nombre. */
  counts: Record<TabId, number>;
  totalGames: number;
  /** Horas de las listas JUGADAS (completados + abandonados + en curso). Próximos no cuenta. */
  totalHours: number;
  /** Horas solo de completados; es la suma de `years[].hours` y lo que representa el gráfico anual. */
  completedHours: number;
  /**
   * Juegos con nota efectiva y su media (0–100). `games` lleva cada juego puntuado uno a uno, porque el
   * enjambre de la distribución dibuja un punto por juego y no un total por tramo.
   */
  scored: { count: number; avgGrade: number; games: GameRef[] };
  /** Completados frente a abandonados. `percent` es 0–100 y vale 0 si no hay ninguno de los dos. */
  completionRatio: { completed: number; abandoned: number; percent: number };
  /** Años ascendentes; el cajón "sin año" (`year: null`), si existe, va al final. */
  years: YearBucket[];
  /** Resumen por año, de más reciente a más antiguo. Solo años con juegos completados. */
  byYear: YearSummary[];
  /** Entradas por mes a cada lista, ascendente. */
  arrivals: ArrivalPoint[];
  /** Tramos 1–5 estrellas, en orden ascendente. */
  grades: GradeBucket[];
  /** Ordenados de más a menos juegos (desempate por horas y luego alfabético). */
  genres: TagBucket[];
  platforms: TagBucket[];
  /** El juego con más horas de las listas jugadas; null si nadie tiene horas. */
  longest: GameRef | null;
  /** Retrato de tus mejores juegos de siempre. */
  top: TopSummary;
  shame: ShameSummary;
  wishlist: WishlistSummary;
}
