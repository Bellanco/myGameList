import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ANALYTICS_UI } from '../../../core/constants/labels';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { LEGAL_ROUTES } from '../../../core/constants/legal';
import { LEGAL_DOCUMENTS } from '../../../core/constants/legalContent';
import { useAnalyticsConsent } from '../../hooks/useAnalyticsConsent';

/**
 * «Legal» — el pie del menú de Ajustes: lo que se consulta una vez al año, pero que tiene que seguir estando a
 * un toque.
 *
 * NO DEPENDE DE NINGUNA CUENTA, a propósito. El interruptor de la analítica es el «cambiar de idea» que promete
 * el aviso de cookies, y retirar un consentimiento debe costar lo mismo que darlo: esconderlo detrás de una
 * sesión sería romper esa promesa. Lo mismo con los tres documentos, que deben poder leerse desde la aplicación
 * y no solo desde el aviso.
 */
export const LegalSettings = memo(function LegalSettings() {
  const { consent, setConsent } = useAnalyticsConsent();
  const analyticsLabels = ANALYTICS_UI;

  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.groups.legal.title}>
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

      <div className="settings-card">
        <h2>{SETTINGS_UI.legal.title}</h2>
        <p className="settings-card-sub">{SETTINGS_UI.legal.subtitle}</p>
        <div className="settings-legal-links">
          <Link to={LEGAL_ROUTES.terms}>{LEGAL_DOCUMENTS.terms.title}</Link>
          <Link to={LEGAL_ROUTES.privacy}>{LEGAL_DOCUMENTS.privacy.title}</Link>
          <Link to={LEGAL_ROUTES.cookies}>{LEGAL_DOCUMENTS.cookies.title}</Link>
        </div>
      </div>
    </section>
  );
});
