import { memo, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ANALYTICS_UI } from '../../core/constants/labels';
import { LEGAL_ROUTES } from '../../core/constants/legal';
import { ANALYTICS_CONSENT_EVENT, persistAnalyticsConsent, readAnalyticsConsent } from '../../model/repository/analyticsConsentRepository';
import { enableAnalyticsAfterConsent } from '../../model/repository/firebaseGateway';

const A = ANALYTICS_UI;

/**
 * L2 — Aviso de consentimiento de la analítica. Se muestra UNA vez, mientras no haya decisión guardada; tanto
 * aceptar como rechazar lo hacen desaparecer para siempre en ese navegador.
 *
 * Al aceptar, se activa GA4 en caliente (`enableAnalyticsAfterConsent`) para no obligar a recargar. Rechazar no
 * necesita apagar nada: sin consentimiento, `firebaseClient` nunca llegó a inicializar Analytics.
 *
 * No bloquea la app (no es un modal): la app es plenamente utilizable sin decidir, y sin decisión no se envía
 * telemetría, que es lo que exige el consentimiento previo.
 */
export const ConsentBanner = memo(function ConsentBanner() {
  const [decided, setDecided] = useState(() => readAnalyticsConsent() !== null);

  // Otra pestaña (o Ajustes) puede fijar la preferencia: mantenerse en sincronía evita mostrar el aviso de nuevo.
  useEffect(() => {
    const sync = () => setDecided(readAnalyticsConsent() !== null);
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const decide = useCallback((granted: boolean) => {
    persistAnalyticsConsent(granted ? 'granted' : 'denied');
    setDecided(true);
    if (granted) {
      void enableAnalyticsAfterConsent();
    }
  }, []);

  /**
   * MARCA LA RAÍZ MIENTRAS ESTÁ PENDIENTE, porque el carril de abajo a la izquierda no es solo suyo: lo comparte
   * con el aviso de logro, que se sube por encima cuando este banner está en pantalla
   * (`:root[data-consent='pending'] .ach-toast-stack` en `achievements.scss`).
   *
   * Sin este atributo esa regla no se activaba nunca y el aviso nacía DEBAJO del consentimiento, tapado por él.
   * Se pone aquí y no en la hoja porque quién está pendiente solo lo sabe este componente.
   */
  useEffect(() => {
    if (decided) return;
    document.documentElement.setAttribute('data-consent', 'pending');
    return () => document.documentElement.removeAttribute('data-consent');
  }, [decided]);

  if (decided) {
    return null;
  }

  return (
    <div className="consent-banner" role="region" aria-label={A.bannerAria}>
      <div className="consent-banner-text">
        <strong>{A.bannerTitle}</strong>
        <p>{A.bannerBody}</p>
        <Link to={LEGAL_ROUTES.cookies}>{A.bannerMore}</Link>
      </div>
      {/* Los dos botones son del MISMO tamaño y están al mismo nivel (un clic cada uno): rechazar tiene que costar
          lo mismo que aceptar, o el consentimiento no vale. El acento ámbar solo destaca la acción principal. */}
      <div className="consent-banner-actions">
        <button type="button" className="btn btn-secondary consent-btn" onClick={() => decide(false)}>
          {A.bannerReject}
        </button>
        <button type="button" className="btn consent-btn consent-btn-accept" onClick={() => decide(true)}>
          {A.bannerAccept}
        </button>
      </div>
    </div>
  );
});
