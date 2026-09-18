import { memo } from 'react';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { SCORE_SCALES } from '../../../core/utils/scoreScale';
import { persistScoreScale } from '../../../model/repository/scorePreferenceRepository';
import { useScoreScale } from '../../hooks/useScoreScale';
import { Icon } from '../Icon';
import { StarRating } from '../StarRating';
import { ScoreRing } from '../ScoreRing';

/**
 * CÓMO SE PUNTÚA: estrellas o nota de 0 a 100, con su ejemplo dibujado al lado.
 *
 * ES LA ÚNICA PIEZA DE ESTA PANTALLA CON CANDADO, y por eso está sola en su fichero: se guarda en la nube
 * contra el uid de Google, así que sin sesión no hay dónde escribirla. Todo lo que tiene alrededor —el tema,
 * los cinco interruptores— vive en este dispositivo y funciona sin cuenta; cuando el candado envolvía a todos
 * ellos, quien no había entrado con Google se quedaba sin paleta y sin modo claro sin ninguna razón.
 */
export const ScoreScaleCard = memo(function ScoreScaleCard({ scoreScaleUid }: { scoreScaleUid: string | null }) {
  const scoreScale = useScoreScale();
  const labels = SETTINGS_UI.scoreScale;

  return (
    <>
      {!scoreScaleUid ? (
        <p className="score-scale-locked">
          <Icon name={COMMON_ICONS.lock} />
          {labels.lockedHint}
        </p>
      ) : null}
      <div className={`score-scale-choice${scoreScaleUid ? '' : ' is-locked'}`} role="radiogroup" aria-label={labels.groupAria}>
        {SCORE_SCALES.map((opt) => {
          const isStars = opt === 'stars';
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={scoreScale === opt}
              disabled={!scoreScaleUid}
              className={`score-scale-opt${scoreScale === opt ? ' on' : ''}`}
              onClick={() => { if (scoreScaleUid) void persistScoreScale(scoreScaleUid, opt); }}
            >
              <span className="score-scale-dot" aria-hidden="true" />
              <span className="score-scale-txt">
                <b>{isStars ? labels.starsLabel : labels.gradeLabel}</b>
                <span>{isStars ? labels.starsHint : labels.gradeHint}</span>
              </span>
              <span className="score-scale-sample" aria-hidden="true">
                {isStars ? <StarRating value={4} /> : <ScoreRing grade={80} />}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
});
