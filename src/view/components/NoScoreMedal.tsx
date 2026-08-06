import { memo } from 'react';

/**
 * Medallón "sin puntuación" (¿?) para la actividad social: reseñas de juegos sin nota (p. ej. la lista de la
 * vergüenza). Mismo lenguaje visual que el medallón de reseñas (`.hub-review-entry.is-noscore`): círculo azul
 * suave con el símbolo "¿?" en vez de un aro/estrellas vacíos.
 */
export const NoScoreMedal = memo(function NoScoreMedal(): React.JSX.Element {
  // A11y-4: `role="img"`, como en ScoreRing — sin rol, el aria-label de un span puede ignorarse y se anunciaría
  // el "¿?" literal.
  return (
    <span className="score-ring is-noscore" role="img" aria-label="Sin puntuar">
      <span className="score-ring-num">¿?</span>
    </span>
  );
});
