import { memo } from 'react';

/**
 * Medallón "sin puntuación" (¿?) para la actividad social: reseñas de juegos sin nota (p. ej. la lista de la
 * vergüenza). Mismo lenguaje visual que el medallón de reseñas (`.hub-review-entry.is-noscore`): círculo azul
 * suave con el símbolo "¿?" en vez de un aro/estrellas vacíos.
 */
export const NoScoreMedal = memo(function NoScoreMedal(): React.JSX.Element {
  return (
    <span className="score-ring is-noscore" aria-label="Sin puntuar">
      <span className="score-ring-num">¿?</span>
    </span>
  );
});
