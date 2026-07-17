import { memo } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { SCORE_SCALES } from '../../core/utils/scoreScale';
import { persistScoreScale } from '../../model/repository/scorePreferenceRepository';
import { useScoreScale } from '../hooks/useScoreScale';
import { Icon } from './Icon';
import { StarRating } from './StarRating';
import { ScoreRing } from './ScoreRing';
import { AppearanceSettings } from './AppearanceSettings';
import { PlayniteNote } from './import/PlayniteNote';

interface AccountHubProps {
  scoreScaleUid: string | null; // uid de Google (para gatear/guardar la escala); null → candado
  onOpenIntegrations: () => void; // navega a la pantalla de Integraciones (importar de Playnite)
}

/**
 * F1 — Pantalla "Cuenta": reúne todos los ajustes ligados a la cuenta de Google (escala de nota + apariencia
 * + visibilidad del botón de Steam Deck). Solo se llega aquí con sesión de Google (la pestaña inferior "Cuenta"
 * únicamente aparece con sesión; App redirige `/cuenta` a la lista si no hay cuenta).
 */
export const AccountHub = memo(function AccountHub({ scoreScaleUid, onOpenIntegrations }: AccountHubProps) {
  const scoreScale = useScoreScale();
  const scoreScaleLabels = UI_MESSAGES.settings.scoreScale;

  return (
    <section className="settings-hub" aria-label={UI_MESSAGES.settings.account.title}>
      <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
        <div className="settings-card-head">
          <h2>{UI_MESSAGES.import.integrations.title}</h2>
          <PlayniteNote />
        </div>
        <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={onOpenIntegrations}>
          <Icon name={COMMON_ICONS.download} />
          <span>{UI_MESSAGES.import.integrations.importBtn}</span>
        </button>
      </div>

      <div className="settings-card settings-card-score">
        <h2>{UI_MESSAGES.settings.account.title}</h2>
        <p className="settings-card-sub">{scoreScaleLabels.subtitle}</p>
        {!scoreScaleUid ? (
          <p className="score-scale-locked">
            <Icon name={COMMON_ICONS.lock} />
            {scoreScaleLabels.lockedHint}
          </p>
        ) : null}
        <div className="settings-account-body" inert={!scoreScaleUid}>
          <div className={`score-scale-choice${scoreScaleUid ? '' : ' is-locked'}`} role="radiogroup" aria-label={scoreScaleLabels.groupAria}>
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
                    <b>{isStars ? scoreScaleLabels.starsLabel : scoreScaleLabels.gradeLabel}</b>
                    <span>{isStars ? scoreScaleLabels.starsHint : scoreScaleLabels.gradeHint}</span>
                  </span>
                  <span className="score-scale-sample" aria-hidden="true">
                    {isStars ? <StarRating value={4} /> : <ScoreRing grade={80} />}
                  </span>
                </button>
              );
            })}
          </div>
          <AppearanceSettings />
        </div>
      </div>
    </section>
  );
});
