import { memo } from 'react';
import { resolveGrade, resolveStars, type ScoredLike } from '../../core/utils/scoreScale';
import { useScoreScale } from '../hooks/useScoreScale';
import { StarRating } from './StarRating';
import { ScoreRing } from './ScoreRing';

/**
 * Muestra la puntuación de un juego PROPIO según la escala elegida por el usuario (F2): estrellas (0–5) o aro
 * de nota (0–100). Reactivo vía `useScoreScale`. Para puntuaciones de OTROS (canal social 0–5) se sigue usando
 * `StarRating` directamente.
 */
export const ScoreDisplay = memo(function ScoreDisplay({ game }: { game: ScoredLike }): React.JSX.Element {
  const scale = useScoreScale();
  return scale === 'grade' ? <ScoreRing grade={resolveGrade(game)} /> : <StarRating value={resolveStars(game)} />;
});
