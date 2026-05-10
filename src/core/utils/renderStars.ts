/**
 * Renderiza una representación visual de puntuación con estrellas (0-5).
 *
 * @param value - Valor numérico de puntuación
 * @returns Cadena de estrellas llenas (★) y vacías (☆)
 */
export function renderStars(value: number): string {
  const n = Math.max(0, Math.min(5, Number(value || 0)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}
