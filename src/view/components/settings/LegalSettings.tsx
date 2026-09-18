import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ANALYTICS_UI } from '../../../core/constants/labels';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { LEGAL_ROUTES } from '../../../core/constants/legal';
import { LEGAL_DOCUMENTS } from '../../../core/constants/legalContent';
import { Icon } from '../Icon';
import { useAnalyticsConsent } from '../../hooks/useAnalyticsConsent';
import { DangerZone } from '../DangerZone';

/**
 * «Legal» — el pie del menú de Ajustes: lo que se consulta una vez al año, pero que tiene que seguir estando a
 * un toque.
 *
 * NO DEPENDE DE NINGUNA CUENTA, a propósito. El interruptor de la analítica es el «cambiar de idea» que promete
 * el aviso de cookies, y retirar un consentimiento debe costar lo mismo que darlo: esconderlo detrás de una
 * sesión sería romper esa promesa. Lo mismo con los tres documentos, que deben poder leerse desde la aplicación
 * y no solo desde el aviso.
 *
 * Y AQUÍ CIERRA EL BORRADO DE LA CUENTA. Es donde se busca: las tres cosas de esta pantalla son las que la ley
 * te reconoce sobre tus datos —saber qué se recoge, dejar de darlo y hacer que desaparezca—, y la última es la
 * más seria de las tres, así que va al final y detrás de su propia confirmación.
 */
export const LegalSettings = memo(function LegalSettings() {
  const { consent, setConsent } = useAnalyticsConsent();
  const analyticsLabels = ANALYTICS_UI;

  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.groups.legal.title}>
      <div className="settings-card">
        <div className="settings-card-head settings-card-head-row">
          <h2>{analyticsLabels.title}</h2>
          {/* El estado con la misma marca que la sincronización: un punto y su palabra. Aquí importa doble —es
              un consentimiento— y con dos botones a medio camino entre sí no se ve cuál está puesto sin mirar
              fino cuál lleva el acento. */}
          <p className={`sync-state ${consent === 'granted' ? 'is-on' : 'is-off'}`}>
            <span className="sync-state-dot" aria-hidden="true" />
            {consent === 'granted' ? analyticsLabels.on : analyticsLabels.off}
          </p>
        </div>
        <p className="settings-card-sub">{analyticsLabels.subtitle}</p>

        {/* Las dos listas van ANTES de los botones: primero se sabe qué se está decidiendo y luego se decide. */}
        <div className="analytics-scope">
          <div className="analytics-scope-col">
            <p className="settings-card-sub">{analyticsLabels.collectsLabel}</p>
            <ul className="analytics-scope-list">
              {analyticsLabels.collects.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="analytics-scope-col is-never">
            <p className="settings-card-sub">{analyticsLabels.neverLabel}</p>
            <ul className="analytics-scope-list">
              {analyticsLabels.never.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </div>

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

      {/* LOS TRES DOCUMENTOS, EN FILAS. Iban seguidos en una línea que envolvía por donde le tocaba: dos
          títulos arriba, uno abajo y ninguno con forma de destino. Como filas se cuentan de un vistazo, cada
          una es una diana entera y la flecha dice que llevan a otra pantalla. */}
      <div className="settings-card">
        <h2>{SETTINGS_UI.legal.title}</h2>
        <p className="settings-card-sub">{SETTINGS_UI.legal.subtitle}</p>
        <ul className="settings-legal-links">
          {[
            { to: LEGAL_ROUTES.terms, label: LEGAL_DOCUMENTS.terms.title },
            { to: LEGAL_ROUTES.privacy, label: LEGAL_DOCUMENTS.privacy.title },
            { to: LEGAL_ROUTES.cookies, label: LEGAL_DOCUMENTS.cookies.title },
          ].map(({ to, label }) => (
            <li key={to}>
              <Link to={to} className="settings-legal-link">
                <span>{label}</span>
                <Icon name="angle-right" className="ui-icon" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <DangerZone />
    </section>
  );
});
