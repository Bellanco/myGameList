// Formas del resumen de estadísticas (panel "Perfil"). Todo es DERIVADO de las listas: no hay ningún campo
// nuevo en `GameItem`, nada se persiste y nada se publica al canal social. Ver `computeStats`.
import type { TabId } from '../../model/types/game';

/** Un punto del eje temporal. `year: null` = juegos completados a los que no se les registró año. */
export interface YearBucket {
  year: number | null;
  /** Juegos completados atribuidos a ese año. */
  completed: number;
  /** Horas de esos juegos (ver la regla de atribución en `computeStats`). */
  hours: number;
}

/** Una etiqueta (género o plataforma) con su peso en la biblioteca. */
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

export interface StatsSummary {
  /** Juegos por lista (c/v/e/p), ya descontados los registros sin nombre. */
  counts: Record<TabId, number>;
  totalGames: number;
  /** Horas de las listas JUGADAS (completados + abandonados + en curso). Próximos no cuenta. */
  totalHours: number;
  /** Horas solo de completados; es la suma de `years[].hours` y lo que representa el gráfico anual. */
  completedHours: number;
  /** Juegos con nota efectiva y su media (0–100). Ver qué listas puntúan en `computeStats`. */
  scored: { count: number; avgGrade: number };
  /** Completados frente a abandonados. `percent` es 0–100 y vale 0 si no hay ninguno de los dos. */
  completionRatio: { completed: number; abandoned: number; percent: number };
  /** Años ascendentes; el cajón "sin año" (`year: null`), si existe, va al final. */
  years: YearBucket[];
  /** Tramos 1–5 estrellas, en orden ascendente. */
  grades: GradeBucket[];
  /** Ordenados de más a menos juegos (desempate por horas y luego alfabético). */
  genres: TagBucket[];
  platforms: TagBucket[];
  /** El juego con más horas de las listas jugadas; null si nadie tiene horas. */
  longest: { name: string; hours: number } | null;
}
