// Escala de puntuación 0–100 (F2, Paso 1). Se introduce el campo NUEVO `grade` (nota 0–100) como fuente fina;
// el `score` 0–5 de siempre se mantiene como ESPEJO para compatibilidad con clientes antiguos (leen/escriben
// `score`, ignoran `grade`) y se borrará en el futuro. La vista actual sigue mostrando 0–5 estrellas.
//
// Regla de lectura (fallback): si `grade` viene a null se deriva del `score` 0–5 (×20). Así los lectores ya
// prefieren `grade` y cuando se borre `score` el cambio será mínimo (quitar el fallback y el espejo).
// Ver .github/prompts/migration/FEATURE-PROPOSALS.md (F2).
//
// IMPORTANTE: el canal social (`rating`) sigue siendo 0–5 (clientes antiguos lo validan con `max(5)`); como
// el `score` 0–5 se mantiene como espejo, la proyección pública no cambia. No confundir escalas:
//  - `clampGrade`  → dominio de la NOTA fina (0–100), campo `grade`.
//  - `clampRating` → dominio de ESTRELLAS (0–5), campo `score`, en `core/utils/normalize`.

export const GRADE_MAX = 100;
export const STARS_MAX = 5;
/** Puntos de nota por estrella: 100 / 5 = 20 (representa la nota "llena" de cada estrella al elegir con el picker). */
export const GRADE_PER_STAR = GRADE_MAX / STARS_MAX;

/**
 * FUENTE ÚNICA del esquema estrellas↔nota (F2). `SCORE_BUCKET_FLOORS[n]` = nota MÍNIMA para tener n estrellas.
 * De aquí se derivan `starsFromGrade` (tramo de una nota) y las etiquetas del filtro (`gradeFloorForStars`).
 * Los tramos: ★=10–29, ★★=30–49, ★★★=50–69, ★★★★=70–89, ★★★★★=90–100 (0–9 = sin estrellas).
 */
export const SCORE_BUCKET_FLOORS: readonly number[] = [0, 10, 30, 50, 70, 90]; // índice = nº de estrellas (0..5)

/** Escala de puntuación elegida por el usuario (F2). `stars` = 0–5 estrellas (defecto); `grade` = aro 0–100. */
export type ScoreScale = 'stars' | 'grade';
export const SCORE_SCALES: readonly ScoreScale[] = ['stars', 'grade'];
export const DEFAULT_SCORE_SCALE: ScoreScale = 'stars';

/**
 * Tono HSL rojo→verde para una nota 0–100 (0=rojo, 100≈verde), como el medallón de reseñas privadas
 * (`--rev-hue`). Se usa para pintar el aro de puntuación.
 */
export function hueFromGrade(grade: unknown): number {
  return Math.round((clampGrade(grade) / GRADE_MAX) * 135);
}

/** Acota una nota fina al rango [0, 100]; 0 si no es finita. */
export function clampGrade(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(GRADE_MAX, numeric));
}

/** Convierte una nota fina (0–100) a estrellas (0–5) según los tramos de `SCORE_BUCKET_FLOORS`. */
export function starsFromGrade(grade: unknown): number {
  const g = clampGrade(grade);
  for (let stars = STARS_MAX; stars >= 1; stars -= 1) {
    if (g >= SCORE_BUCKET_FLOORS[stars]) return stars;
  }
  return 0;
}

/** Convierte una selección de estrellas (0–5) a nota fina (0–100) para guardar (nota "llena" del nivel: n×20). */
export function gradeFromStars(stars: unknown): number {
  const numeric = Number(stars);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(STARS_MAX, Math.round(numeric))) * GRADE_PER_STAR;
}

/** Nota MÍNIMA (suelo del tramo) para un nivel de estrellas; para etiquetar el filtro "N o más" en modo nota. */
export function gradeFloorForStars(stars: unknown): number {
  const n = Math.max(0, Math.min(STARS_MAX, Math.round(Number(stars) || 0)));
  return SCORE_BUCKET_FLOORS[n];
}

/** Forma mínima de un juego para resolver su puntuación (evita acoplar el tipo `GameItem`). */
export interface ScoredLike {
  grade?: number | null;
  score?: number | null;
}

/**
 * Nota fina EFECTIVA (0–100) de un juego: usa `grade` si está presente; si no, deriva del `score` 0–5 legacy
 * (×20). Punto único del fallback → al borrar `score` en el futuro basta con simplificar aquí.
 */
export function resolveGrade(game: ScoredLike): number {
  if (typeof game?.grade === 'number') return clampGrade(game.grade);
  return gradeFromStars(game?.score);
}

/** Estrellas EFECTIVAS (0–5) de un juego, para pintar/filtrar/ponderar con la escala visual actual. */
export function resolveStars(game: ScoredLike): number {
  return starsFromGrade(resolveGrade(game));
}
