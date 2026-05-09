/**
 * Componente para mostrar una puntuación de 1-5 estrellas.
 * Renderiza estrellas llenas (★) y vacías (☆) de forma óptima en React.
 *
 * @param value - Valor numérico de puntuación (0-5)
 */
export function StarRating({ value }: { value: number }): JSX.Element {
  const n = Math.max(0, Math.min(5, Number(value || 0)));
  const fullStars = n;
  const emptyStars = 5 - n;

  return (
    <span className="stars">
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={`full-${i}`} className="f">
          ★
        </span>
      ))}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <span key={`empty-${i}`}>☆</span>
      ))}
    </span>
  );
}
