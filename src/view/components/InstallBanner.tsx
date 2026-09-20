import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { INSTALL_UI } from '../../core/constants/labels';
import { ANALYTICS_CONSENT_EVENT, readAnalyticsConsent } from '../../model/repository/analyticsConsentRepository';
import {
  INSTALL_PROMPT_EVENT,
  hasInstallOffer,
  isRunningInstalled,
  persistInstallDismissed,
  readInstallDismissed,
  showInstallPrompt,
} from '../../model/repository/installPromptRepository';
import { usePublishedHeight } from '../hooks/usePublishedHeight';

const I = INSTALL_UI;

/**
 * Invitación a instalar la app en la pantalla de inicio.
 *
 * SIN ESTO NO LA INSTALA NADIE salvo quien conozca el menú del navegador — y sin instalar no hay pantalla
 * completa, ni atajos, ni icono propio: tres cosas que la app ya sabe hacer y que no se llegan a ver. Aquí no
 * se decide nada, solo se enseña una puerta que el navegador ya había abierto (ver `installPromptRepository`).
 *
 * NUNCA A LA VEZ QUE EL CONSENTIMIENTO, y esa es la regla que evita el cuarto vecino del carril. El carril de
 * abajo a la izquierda ya lo comparten tres piezas con una coreografía escrita (barra 120, aviso de logro 125,
 * consentimiento 130): meter un aviso más habría obligado a que cada uno supiera esquivar a los otros dos. Como
 * la primera visita es justo cuando el consentimiento está pendiente, basta con esperar a que se decida —una
 * decisión legal primero, una sugerencia después—, y entonces el carril está libre y este aviso ocupa el hueco
 * que el otro acaba de dejar. Por eso comparte la clase `.consent-banner`: es literalmente el mismo sitio y la
 * misma forma, incluido apagarse con el menú de Ajustes abierto.
 *
 * Solo aparece donde el navegador ofrece instalar, que hoy es Chromium. En Safari de iOS la instalación se hace
 * a mano desde el menú de compartir y no hay evento que atrapar: allí este aviso no sale, y decirlo con un
 * texto distinto sería otra pieza, no esta.
 */
export const InstallBanner = memo(function InstallBanner() {
  const [offered, setOffered] = useState(() => hasInstallOffer());
  const [dismissed, setDismissed] = useState(() => readInstallDismissed() || isRunningInstalled());
  const [consentPending, setConsentPending] = useState(() => readAnalyticsConsent() === null);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  // La oferta llega tarde (el navegador la da cuando quiere) y el consentimiento se decide en el banner de al
  // lado: las dos cosas pasan con esta pieza ya montada, así que hay que escucharlas.
  useEffect(() => {
    const sync = (): void => {
      setOffered(hasInstallOffer());
      setDismissed(readInstallDismissed() || isRunningInstalled());
      setConsentPending(readAnalyticsConsent() === null);
    };
    window.addEventListener(INSTALL_PROMPT_EVENT, sync);
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, sync);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const visible = offered && !dismissed && !consentPending;

  /**
   * MARCA LA RAÍZ Y PUBLICA SU ALTURA, por lo mismo que el consentimiento: el aviso de logro vive en este carril
   * y necesita saber que hay algo debajo (`data-install='offered'`) y cuánto mide (`--install-h`).
   */
  useEffect(() => {
    if (!visible) return;
    document.documentElement.setAttribute('data-install', 'offered');
    return () => document.documentElement.removeAttribute('data-install');
  }, [visible]);

  usePublishedHeight(bannerRef, '--install-h', visible);

  const decline = useCallback(() => {
    persistInstallDismissed();
    setDismissed(true);
  }, []);

  /**
   * Aceptar cede el turno al diálogo del navegador, que es quien instala de verdad. Pase lo que pase allí, este
   * aviso se retira: la oferta ya se ha gastado (no se puede volver a enseñar) y repetir la invitación sin poder
   * cumplirla sería un botón muerto. Si se instaló, además queda apuntado por el evento `appinstalled`.
   */
  const accept = useCallback(() => {
    void showInstallPrompt().finally(() => setDismissed(true));
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="consent-banner install-banner" role="region" aria-label={I.bannerAria} ref={bannerRef}>
      <div className="consent-banner-text">
        <strong>{I.bannerTitle}</strong>
        <p>{I.bannerBody}</p>
      </div>
      <div className="consent-banner-actions">
        <button type="button" className="btn btn-secondary consent-btn" onClick={decline}>
          {I.bannerReject}
        </button>
        <button type="button" className="btn consent-btn consent-btn-accept" onClick={accept}>
          {I.bannerAccept}
        </button>
      </div>
    </div>
  );
});
