import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { ANALYTICS_CONSENT_EVENT, readAnalyticsConsent } from '../../model/repository/analyticsConsentRepository';
import { INSTALL_PROMPT_EVENT, hasInstallOffer, isRunningInstalled, readInstallDismissed } from '../../model/repository/installPromptRepository';
import { SilentBoundary } from './SilentBoundary';

/**
 * LOS DOS AVISOS DEL CARRIL DE ABAJO, perezosos: el consentimiento de analítica y la invitación a instalar.
 *
 * Casi nunca hay ninguno que enseñar —el consentimiento se decide una vez y la invitación se ofrece una vez—, y aun
 * así viajaban en cada arranque con sus textos y su medida de altura. Aquí solo viaja la decisión de SI se montan,
 * que es leer dos claves y escuchar tres eventos; el aviso llega con su chunk.
 *
 * SOLO SE ENCIENDEN. Una vez montado, cada aviso escucha lo suyo, decide si se pinta y se retira solo —con su
 * limpieza de `data-consent`/`data-install` en la raíz—, así que desmontarlo desde aquí sería repetir esa lógica.
 *
 * La invitación se pide en cuanto hay oferta, sin esperar al consentimiento: así su chunk ya está cuando este se
 * decide, que es el momento en que ocupa el hueco (ver `InstallBanner`).
 *
 * Con su propio límite: si el chunk no llega (sin red, recién desplegado) no hay aviso y no pasa nada más. Sin
 * aviso no hay consentimiento, y sin consentimiento no se inicializa Analytics: el fallo cae del lado seguro.
 */
const ConsentBanner = lazy(() => import('./ConsentBanner').then((module) => ({ default: module.ConsentBanner })));
const InstallBanner = lazy(() => import('./InstallBanner').then((module) => ({ default: module.InstallBanner })));

const consentPending = (): boolean => readAnalyticsConsent() === null;
const installOffered = (): boolean => hasInstallOffer() && !readInstallDismissed() && !isRunningInstalled();

export const LaneBanners = memo(function LaneBanners() {
  const [consent, setConsent] = useState(consentPending);
  const [install, setInstall] = useState(installOffered);

  // La oferta de instalar llega cuando el navegador quiere, y otra pestaña puede borrar la decisión guardada.
  useEffect(() => {
    const sync = (): void => {
      if (consentPending()) setConsent(true);
      if (installOffered()) setInstall(true);
    };
    sync();
    window.addEventListener(INSTALL_PROMPT_EVENT, sync);
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, sync);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <>
      {consent ? (
        <SilentBoundary source="consent-banner">
          <Suspense fallback={null}>
            <ConsentBanner />
          </Suspense>
        </SilentBoundary>
      ) : null}
      {/* Los dos comparten carril y no coinciden nunca: la invitación espera a que el consentimiento se decida
          (ver `InstallBanner`). Van seguidos para que se lea aquí que el hueco es el mismo. */}
      {install ? (
        <SilentBoundary source="install-banner">
          <Suspense fallback={null}>
            <InstallBanner />
          </Suspense>
        </SilentBoundary>
      ) : null}
    </>
  );
});
