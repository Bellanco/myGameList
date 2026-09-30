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
 * sin caducar. Sale aunque se dijera «Ahora no» en el aviso —es justo para esa persona— y solo se retira cuando la
 * app ya está instalada.
 *
 * Con oferta del navegador (Chromium) hay botón y lo hace él. Sin oferta no hay botón que funcione, así que se
 * explica cómo hacerlo a mano: en iOS desde Compartir, en el resto desde el menú del navegador. La oferta se
 * gasta al usarla (ver `showInstallPrompt`): si se cierra el diálogo sin instalar, la tarjeta pasa a explicarlo.
 */
export const InstallCard = memo(function InstallCard() {
  const [offered, setOffered] = useState(() => hasInstallOffer());
  const [installed, setInstalled] = useState(() => isRunningInstalled());

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

  if (installed) return null;

  return (
    <div className="settings-card settings-card-install">
      <h2>{INSTALL_CARD.title}</h2>
      <p className="settings-card-sub">{INSTALL_CARD.lead}</p>
      <ul className="settings-install-perks">
        {INSTALL_CARD.perks.map((perk) => (
          <li key={perk}>
            <span className="settings-install-perk-icon" aria-hidden="true"><Icon name="check" /></span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      {offered ? (
        <button type="button" className="btn btn-secondary settings-install-btn" onClick={() => void showInstallPrompt()}>
          {INSTALL_CARD.add}
        </button>
      ) : (
        <p className="settings-install-how">{isIos() ? INSTALL_CARD.ios : INSTALL_CARD.manual}</p>
      )}
    </div>
  );
});
