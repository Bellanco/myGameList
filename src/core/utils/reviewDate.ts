/**
 * Fecha de la RESEÑA (`reviewedAt`), separada del reloj del merge (`_ts`).
 *
 * `_ts` no sirve como fecha de reseña: lo mueve cualquier edición del juego (nota, horas, plataformas) y la
 * importación de datos lo sella en bloque para ganar el merge. La fecha que publica el canal social y que
 * muestran el feed y la pestaña Reseñas tiene que ser estable, así que se guarda aparte y solo la mueve un
 * cambio del TEXTO.
 */
export function resolveReviewedAt(input: {
  /** Texto de la reseña que se está guardando (ya recortado). */
  review: string;
  /** Texto que tenía antes ('' si el juego es nuevo o no tenía reseña). */
  previousReview: string;
  /** `reviewedAt` que ya tuviera el juego. */
  previousReviewedAt?: number;
  now: number;
}): number | undefined {
  if (!input.review) {
    return undefined; // sin texto no hay reseña que fechar
  }
  if (input.review !== input.previousReview) {
    return input.now; // reseña nueva o reescrita
  }
  // Mismo texto: conserva su fecha. Si nunca la tuvo (juego anterior a este campo) se queda SIN fecha en vez de
  // inventar una: los lectores caen a la fecha publicada y, en su defecto, al `_ts`.
  return input.previousReviewedAt;
}
