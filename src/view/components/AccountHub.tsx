import { memo } from 'react';
import { Link } from 'react-router-dom';
import { COMMON_ICONS } from '../../core/constants/icons';
import { ANALYTICS_UI } from '../../core/constants/labels';
import { SETTINGS_UI } from '../../core/constants/settingsLabels';
import { LEGAL_ROUTES } from '../../core/constants/legal';
import { LEGAL_DOCUMENTS } from '../../core/constants/legalContent';
import { SCORE_SCALES } from '../../core/utils/scoreScale';
import { persistScoreScale } from '../../model/repository/scorePreferenceRepository';
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent';
import { useScoreScale } from '../hooks/useScoreScale';
import { Icon } from './Icon';
import { SharedReviewsCard } from './SharedReviewsCard';
import { StarRating } from './StarRating';
import { ScoreRing } from './ScoreRing';
import { AppearanceSettings } from './AppearanceSettings';
import { DangerZone } from './DangerZone';

interface AccountHubProps {
  scoreScaleUid: string | null; // uid de Google (para gatear/guardar la escala); null → candado
  /** ¿Tiene espacio social? De ahí salen el nick y el rango, así que sin él no hay enlaces que gestionar. */
  hasSocialProfile: boolean;
}

/**
 * F1 — Pantalla "Cuenta": reúne todos los ajustes ligados a la cuenta de Google (escala de nota + apariencia
 * + visibilidad del botón de Steam Deck). Solo se llega aquí con sesión de Google (la pestaña inferior "Cuenta"
 * únicamente aparece con sesión; App redirige `/cuenta` a la lista si no hay cuenta).
 */
export const AccountHub = memo(function AccountHub({ scoreScaleUid, hasSocialProfile }: AccountHubProps) {
  const scoreScale = useScoreScale();
  const scoreScaleLabels = SETTINGS_UI.scoreScale;
  const analyticsLabels = ANALYTICS_UI;
  const { consent, setConsent } = useAnalyticsConsent();

  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.account.title}>
      <div className="settings-card settings-card-score">
        <h2>{SETTINGS_UI.account.title}</h2>
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

      {/* L2 — la analítica es opt-in y revocable: esta fila es el "cambiar de idea" que promete el aviso. No se
          bloquea con `inert` como el resto: no depende de la cuenta, sino del navegador. */}
      <div className="settings-card">
        <h2>{analyticsLabels.title}</h2>
        <p className="settings-card-sub">{analyticsLabels.subtitle}</p>
        <div className="theme-mode-row" role="group" aria-label={analyticsLabels.groupAria}>
          <button
            type="button"
            className={`btn btn-toggle${consent === 'granted' ? ' active' : ''}`}
            aria-pressed={consent === 'granted'}
            onClick={() => setConsent('granted')}
          >
            <span>{analyticsLabels.on}</span>
          </button>
          <button
            type="button"
            className={`btn btn-toggle${consent === 'denied' ? ' active' : ''}`}
            aria-pressed={consent === 'denied'}
            onClick={() => setConsent('denied')}
          >
            <span>{analyticsLabels.off}</span>
          </button>
        </div>
      </div>

      {/* L4 — los documentos legales deben ser accesibles desde la app, no solo desde el aviso de cookies. */}
      <div className="settings-card">
        <h2>{SETTINGS_UI.legal.title}</h2>
        <p className="settings-card-sub">{SETTINGS_UI.legal.subtitle}</p>
        <div className="settings-legal-links">
          <Link to={LEGAL_ROUTES.terms}>{LEGAL_DOCUMENTS.terms.title}</Link>
          <Link to={LEGAL_ROUTES.privacy}>{LEGAL_DOCUMENTS.privacy.title}</Link>
          <Link to={LEGAL_ROUTES.cookies}>{LEGAL_DOCUMENTS.cookies.title}</Link>
        </div>
      </div>

      {/* Los enlaces públicos van en CUENTA y no en Ajustes: no son una preferencia de la app, son contenido tuyo
          publicado en internet. Y van los últimos, justo antes de la zona de riesgo, porque retirar un enlace es
          lo más cercano a esas acciones que hay en esta pantalla. */}
      <SharedReviewsCard enabled={hasSocialProfile} />

      <DangerZone />
    </section>
  );
});
