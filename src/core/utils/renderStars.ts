import { clampRating } from './normalize';

/** Puntuación (0-5) como cadena de estrellas llenas (★) y vacías (☆). */
export function renderStars(value: number): string {
  const n = clampRating(value);
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}
