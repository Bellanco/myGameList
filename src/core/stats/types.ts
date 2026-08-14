// Formas del resumen de estadísticas (panel "Perfil"). Todo es DERIVADO de las listas que ya están en memoria:
// no hay ningún campo nuevo en `GameItem`, nada se persiste, nada se publica y NO se hace una sola consulta de
// red — la fuente es el gist de juegos que la app ya tiene cargado. Ver `computeStats`.
import type { TabId } from '../../model/types/game';

/** Un punto del eje temporal. `year: null` = juegos completados a los que no se les registró año. */
export interface YearBucket {
  year: number | null;
  /** Juegos completados atribuidos a ese año (un rejugado cuenta en CADA año que registraste). */
  completed: number;
  /** Horas de esos juegos (ver la regla de atribución en `computeStats`). */
  hours: number;
  /**
   * Reparto por nota de esos completados, para la tira de calidad del gráfico anual: cinco posiciones, de 1★ a
   * 5★. Va aquí y no se recalcula en la vista porque la vista no tiene los juegos del año, solo el cubo.
   */
  stars: number[];
  /** Completados de ese año a los que no pusiste nota. */
  unscored: number;
}

/** Una etiqueta (género, plataforma o razón de abandono) con su peso. */
export interface TagBucket {
  tag: string;
  games: number;
  hours: number;
}

/**
 * Un género con su AFINIDAD: cuánto pesa en tu biblioteca contando también lo que te gustó, no solo cuántos
 * juegos tiene. Es lo que dibuja la figura de "Tus géneros" —el ranking por cantidad ya lo cuenta el rosetón
 * de "Géneros más jugados"—, y por eso los dos gráficos ya no dicen lo mismo con dos formas distintas.
 */
export interface GenreAffinity {
  tag: string;
  /** Juegos del género, para poder decir de cuántos sale la cifra. */
  games: number;
  /** De esos, cuántos tienen nota. */
  scored: number;
  /** Nota media (0–100) de los puntuados; 0 si no hay ninguno. */
  avgGrade: number;
  /** Suma ponderada: cada juego aporta su nota sobre 100 (ver `computeStats`). */
  weight: number;
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
  /**
   * Cuántas veces lo has completado (años registrados). 1 en el caso normal; 0 si no es un completado.
   *
   * En el resumen de UN año es la cuenta hasta ese año inclusive, no el total: en la pestaña del año de la
   * primera vuelta vale 1 (y la ficha no dice nada), en la siguiente 2… Ver `computeStats`.
   */
  replays: number;
  /** ¿Tiene reseña escrita? Es lo que decide si la ficha se marca y se puede abrir. */
  hasReview: boolean;
  /**
   * Primeras líneas de tu reseña, para citarla. Es un RECORTE: el panel enseña una cita, nunca el texto entero
   * —para eso está la pantalla de reseñas—, y guardar el review completo por juego inflaría el resumen.
   *
   * Queda VACÍA cuando la reseña es demasiado corta para citarse (un "x" de recordatorio no es una cita); el
   * juego sigue contando como reseñado, que es cosa de `hasReview`.
   */
  quote: string;
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

/**
 * Los bloques del panel de estadísticas. UNA sola pantalla lo pinta (`StatsPanel`) tanto en tu perfil como en el
 * de otra persona, y esta es la lista de piezas que puede montar; el orden en que van lo decide la pantalla.
 *
 * Existe como tipo de dominio porque quien recorta la lista no es la vista: en un perfil ajeno la recorta el
 * RANGO de quien mira (ver `friendStatsBlocks`), y esa es una regla de producto, no de pintado.
 */
export type StatsBlock =
  | 'top'
  | 'years'
  | 'radar'
  | 'ratio'
  | 'backlog'
  | 'grades'
  | 'genres'
  | 'reviews'
  | 'shame'
  | 'wishlist'
  | 'genreRanks'
  | 'ridge'
  | 'activity'
  | 'replay'
  | 'demand';

/** El panel completo: lo que ves de TI mismo, sin recortar nada. */
export const OWN_STATS_BLOCKS: readonly StatsBlock[] = [
  'top',
  'years',
  'genreRanks',
  'radar',
  'ratio',
  'backlog',
  'grades',
  // `replay` y `demand` ya no montan tarjeta: viven como cifras destacadas en la cabecera del panel. Siguen en
  // la lista porque es ella la que decide si el espectador puede verlas.
  'demand',
  'genres',
  'replay',
  'activity',
  'reviews',
  'shame',
  'wishlist',
];

/** Entradas a cada lista en un mes, derivadas de `listedAt`. `m` es `AAAA-MM`. */
export interface ArrivalPoint {
  m: string;
  c: number;
  v: number;
  e: number;
  p: number;
}

/**
 * Puesto de un género en un año: lo que dibuja la evolución del gusto.
 *
 * El puesto sale de una VENTANA MÓVIL de varios años (ver `GENRE_RANK_WINDOW`), no del año suelto. Con ocho o
 * veinte juegos terminados al año, un solo título mueve un género tres puestos y la figura se vuelve ruido; la
 * ventana enseña la tendencia, que es lo que este gráfico viene a contar.
 */
export interface GenreRankPoint {
  year: number;
  /** 1 = el género más terminado de la ventana. */
  rank: number;
  /** Juegos de ese género en la ventana que acaba en `year`. */
  games: number;
}

export interface GenreRankSeries {
  tag: string;
  /** Un punto por año, en el mismo orden que `GenreRanks.years`. */
  points: GenreRankPoint[];
}

export interface GenreRanks {
  /** Años con puesto calculable (los primeros de la biblioteca se van en llenar la ventana). */
  years: number[];
  /** Cuántos años acumula cada punto. */
  window: number;
  /** Un género por serie, ordenados por su puesto en el ÚLTIMO año: así la leyenda se lee de arriba abajo. */
  series: GenreRankSeries[];
}

/**
 * Una semana con actividad fechada. `w` es la clave ISO `AAAA-Www` (ver `localWeekKey`).
 *
 * POR SEMANAS Y NO POR DÍAS: una lista de juegos no se toca a diario —se anota lo que se termina, y eso pasa
 * cada pocos días—, así que un calendario diario sería casi todo huecos y haría parecer inactivo a quien no lo
 * está. La semana es la unidad en la que esta afición tiene ritmo.
 */
export interface WeekActivity {
  w: string;
  /** Reseñas escritas o reescritas (`reviewedAt`). */
  reviews: number;
  /** Entradas a una lista (`enteredAt`): lo que has empezado, terminado, dejado o apuntado. */
  moves: number;
  total: number;
}

/**
 * Constancia: la serie semanal completa, sin huecos, desde la primera semana con actividad hasta la última.
 *
 * Las semanas VACÍAS van incluidas a propósito: son el dato: una racha se ve porque a su lado hay semanas en
 * blanco. Rellenarlas aquí (y no en la vista) mantiene el calendario del dispositivo en un único sitio.
 */
export interface ActivitySummary {
  weeks: WeekActivity[];
  /** Semanas con algo de actividad, sobre el total del periodo. */
  active: number;
  /** Racha más larga de semanas seguidas con actividad, y la que sigue viva al final de la serie. */
  bestStreak: number;
  currentStreak: number;
  /** Semana más movida. Null si no hay ni una con actividad. */
  busiest: WeekActivity | null;
}

/**
 * Rejugabilidad: lo que de verdad dice que un juego te gustó.
 *
 * Son dos cosas distintas y por eso se cuentan aparte: haber VUELTO (varios años registrados en `years`) es un
 * hecho; querer volver (`replayable`) es una intención. Un juego que ya rejugaste no vuelve a contar como
 * intención aunque siga marcado, o se contaría dos veces en el mismo reparto.
 */
export interface ReplaySummary {
  /** Completados: el total sobre el que se reparte todo lo demás. */
  total: number;
  replayed: number;
  willReplay: number;
  /** Ni rejugados ni marcados: la mayoría, normalmente. */
  once: number;
  /** Cuántas vueltas suman los rejugados (años registrados por encima de la primera). */
  extraRuns: number;
  /** Los géneros que más repites, por porcentaje de vuelta (rejugados + marcados) sobre sus completados. */
  byGenre: Array<{ tag: string; games: number; back: number; percent: number }>;
  /** Los que has terminado más veces, de más a menos vueltas. */
  most: GameRef[];
}

/**
 * Exigencia al puntuar: no la nota media, sino cuánto se SEPARA de ella lo que pones.
 *
 * La media sola no distingue a quien pone 70 a todo de quien reparte 30 y 95 a partes iguales, y son dos formas
 * opuestas de valorar. La desviación típica es lo que las separa.
 */
export interface DemandSummary {
  count: number;
  avgGrade: number;
  /** Desviación típica poblacional (se mide la biblioteca entera, no una muestra de ella). */
  deviation: number;
  /** La banda «normal»: media ± una desviación, acotada a la escala. */
  low: number;
  high: number;
  /** Cuántas notas caen dentro de esa banda. */
  inBand: number;
  /** La nota más baja y la más alta que has puesto. */
  min: number;
  max: number;
  /** Reparto por tramos, el mismo que el histograma (`grades`), para dibujar la banda encima. */
  grades: GradeBucket[];
}

/** Resumen completo de un año concreto: es lo que pinta la pestaña de ese año. */
export interface YearSummary {
  year: number;
  completed: number;
  hours: number;
  scored: number;
  avgGrade: number;
  genres: TagBucket[];
  /** Los géneros del año por afinidad, para la figura de la pestaña del año. */
  genreAffinity: GenreAffinity[];
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

/** Lo que escribes: cuántas reseñas, qué parte de lo cerrado cubren y qué destacas al escribirlas. */
export interface ReviewSummary {
  /** Juegos con reseña escrita, de cualquier lista. */
  count: number;
  /** Juegos ya cerrados (completados + abandonados): la base contra la que se mide la cobertura. */
  closed: number;
  /**
   * Porcentaje de lo cerrado que has llegado a comentar. Numerador y denominador miran lo mismo —solo
   * completados y abandonados—: con las reseñas de lo que estás jugando dentro, podía pasar del 100%.
   */
  coverage: number;
  strengths: TagBucket[];
  weaknesses: TagBucket[];
  /** Los juegos reseñados, de mejor a peor nota: es el listado de la pantalla de reseñas. */
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
  /** Los mismos géneros, ordenados por AFINIDAD (cantidad ponderada por nota). Para la figura del hexágono. */
  genreAffinity: GenreAffinity[];
  platforms: TagBucket[];
  /** El juego con más horas de las listas jugadas; null si nadie tiene horas. */
  longest: GameRef | null;
  /** Retrato de tus mejores juegos de siempre. */
  top: TopSummary;
  /** Lo que escribes: cuántas reseñas y qué destacas en ellas. */
  reviews: ReviewSummary;
  shame: ShameSummary;
  wishlist: WishlistSummary;
  /** Cómo cambia tu gusto: el puesto de cada género, año a año. */
  genreRanks: GenreRanks;
  /** Constancia semanal, a partir de las fechas que la app registra sola. */
  activity: ActivitySummary;
  /** A cuáles vuelves. */
  replay: ReplaySummary;
  /** Cómo de duro puntúas. */
  demand: DemandSummary;
}
