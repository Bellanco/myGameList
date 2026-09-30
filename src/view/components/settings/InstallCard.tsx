import { memo, useEffect, useState } from 'react';
import { INSTALL_CARD } from '../../../core/constants/installCardLabels';
import { Icon } from '../Icon';
import { INSTALL_PROMPT_EVENT, hasInstallOffer, isRunningInstalled, showInstallPrompt } from '../../../model/repository/installPromptRepository';

/**
 * ¿Es un iPhone o un iPad? El iPad se presenta como un Mac de escritorio desde iPadOS 13, y lo que lo delata es
 * que un Mac no tiene pantalla táctil.
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * «INSTALAR LA APLICACIÓN», PARA QUIEN LA QUIERA: la misma puerta que el aviso del principio, pero en Ajustes y
 * sin caducar. Sale aunque se dijera «Ahora no» en el aviso —es justo para esa persona—.
 *
 * SOLO SALE DONDE SE PUEDE INSTALAR: con oferta del navegador (Chromium), un botón que abre su diálogo; en iOS,
 * que no avisa pero sí deja, la instrucción de Compartir. En el resto (Firefox, Chromium sin oferta en esta
 * visita) no hay nada que prometer y la tarjeta no existe. La oferta se gasta al usarla (ver
 * `showInstallPrompt`): si se cierra el diálogo sin instalar, la tarjeta se retira hasta la próxima.
 */
export const InstallCard = memo(function InstallCard() {
  const [offered, setOffered] = useState(() => hasInstallOffer());
  const [installed, setInstalled] = useState(() => isRunningInstalled());
  const [ios] = useState(isIos);

  useEffect(() => {
    const sync = (): void => setOffered(hasInstallOffer());
    const done = (): void => setInstalled(true);
    window.addEventListener(INSTALL_PROMPT_EVENT, sync);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, sync);
      window.removeEventListener('appinstalled', done);
    };
  }, []);

  if (installed || (!offered && !ios)) return null;

  return (
    <div className="settings-card settings-card-install">
      <span className="settings-install-icon" aria-hidden="true"><Icon name="download" /></span>
      <h2>{INSTALL_CARD.title}</h2>
      <p className="settings-card-sub">{INSTALL_CARD.lead}</p>
      {offered ? (
        <button type="button" className="btn btn-primary settings-install-btn" onClick={() => void showInstallPrompt()}>
          <Icon name="download" />
          {INSTALL_CARD.add}
        </button>
      ) : (
        <p className="settings-install-how">{INSTALL_CARD.ios}</p>
      )}
    </div>
  );
});
