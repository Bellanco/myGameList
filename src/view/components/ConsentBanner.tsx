import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ANALYTICS_UI } from '../../core/constants/labels';
import { LEGAL_ROUTES } from '../../core/constants/legal';
import { ANALYTICS_CONSENT_EVENT, persistAnalyticsConsent, readAnalyticsConsent } from '../../model/repository/analyticsConsentRepository';
import { enableAnalyticsAfterConsent } from '../../model/repository/firebaseGateway';
import { usePublishedHeight } from '../hooks/usePublishedHeight';

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
  const bannerRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * Y PUBLICA SU ALTURA REAL en `--consent-h`, porque el que se aparta necesita saber cuánto.
   *
   * EL FALLO QUE ESTO EVITA. La regla del carril subía el aviso de logro una cantidad FIJA (`9.4rem`), que era
   * la altura de este banner medida una vez en un escritorio. Pero este banner mide lo que mide su texto: su
   * bloque es `flex: 1 1 260px`, así que según el ancho de la ventana y las métricas de la fuente el párrafo
   * envuelve una línea más y el banner crece. Medido: 9,23rem en macOS a 1280px —2,7px de holgura sobre la
   * constante— y suficiente más en el Linux de CI para que el aviso lo pisara por 15px. Un test se rompía allí
   * y no aquí, que es la peor forma de tener razón.
   *
   * El cómo se mide vive en `usePublishedHeight`, que es el mismo que usa la invitación a instalar: la medida
   * de un aviso del carril no se escribe dos veces.
   */
  usePublishedHeight(bannerRef, '--consent-h', !decided);

  if (decided) {
    return null;
  }

  return (
    <div className="consent-banner" role="region" aria-label={A.bannerAria} ref={bannerRef}>
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
