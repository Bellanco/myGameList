import { useCallback, useEffect, useState } from 'react';
import {
  ANALYTICS_CONSENT_EVENT,
  persistAnalyticsConsent,
  readAnalyticsConsent,
  type AnalyticsConsent,
} from '../../model/repository/analyticsConsentRepository';
import { enableAnalyticsAfterConsent } from '../../model/repository/firebaseGateway';

/**
 * L2 — Estado del consentimiento de analítica para la UI (banner y Ajustes de cuenta). `null` = sin decidir.
 *
 * Al conceder se activa GA4 en caliente. Al revocar NO se puede "desinicializar" Firebase Analytics en la sesión
 * en curso: se deja de considerar concedido (nada nuevo se inicializa) y el efecto es completo a partir de la
 * siguiente carga, que es el comportamiento honesto y así se refleja en la política de cookies.
 */
export function useAnalyticsConsent(): { consent: AnalyticsConsent | null; setConsent: (value: AnalyticsConsent) => void } {
  const [consent, setConsentState] = useState<AnalyticsConsent | null>(() => readAnalyticsConsent());

  useEffect(() => {
    const sync = () => setConsentState(readAnalyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setConsent = useCallback((value: AnalyticsConsent) => {
    persistAnalyticsConsent(value);
    setConsentState(value);
    if (value === 'granted') {
      void enableAnalyticsAfterConsent();
    }
  }, []);

  return { consent, setConsent };
}
