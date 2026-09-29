import { useState, type ReactNode } from 'react';
import { INVITE_UI } from '../../../core/constants/inviteLabels';
import { copyText } from '../../../core/utils/clipboard';
import { Icon } from '../Icon';
// Viaja con el componente: lo montan dos chunks perezosos distintos (la guía y el hub social), y una regla metida
// en la hoja de uno dejaría al otro sin estilo.
import '../../../styles/invite.scss';

export interface InviteLinkProps {
  /** Tras compartir con la hoja del sistema (no al cancelarla). */
  onShared?: () => void;
  /** Botón secundario de quien lo pinta; recibe si el enlace ya se copió, para cambiar su rótulo. */
  secondary?: (copied: boolean) => ReactNode;
  /** Clase de ancho de los botones, la del contenedor que lo pinta. */
  buttonClassName?: string;
}

/**
 * EL ENLACE PARA INVITAR, con su VISTA PREVIA: la misma tarjeta que enseñan WhatsApp o Telegram al pegarlo
 * (`/share-card.jpg`, la del `og:image`), para que se vea qué se manda antes de mandarlo. Debajo, la dirección
 * completa con su botón de copiar, y la acción principal: compartir donde el navegador sabe (móvil) y copiar
 * donde no.
 */
export function InviteLink({ onShared, secondary, buttonClassName = '' }: InviteLinkProps) {
  const [message, setMessage] = useState('');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    setMessage((await copyText(INVITE_UI.url)) ? INVITE_UI.copied : INVITE_UI.copyFailed);
  };

  const share = async () => {
    try {
      await navigator.share({ title: INVITE_UI.shareTitle, text: INVITE_UI.shareText, url: INVITE_UI.url });
      onShared?.();
    } catch (error) {
      // Cerrar la hoja de compartir del sistema no es un error: se sigue aquí, con el enlace delante.
      if ((error as { name?: string } | null)?.name !== 'AbortError') setMessage(INVITE_UI.copyFailed);
    }
  };

  return (
    <div className="invite-link">
      <figure className="invite-preview">
        <img src="/share-card.jpg" width={1200} height={630} alt={INVITE_UI.previewAlt} decoding="async" loading="lazy" />
        <figcaption className="invite-preview-link">
          <span className="invite-url">{INVITE_UI.url}</span>
          <button type="button" className="invite-copy" aria-label={INVITE_UI.copy} title={INVITE_UI.copy} onClick={copy}>
            <Icon name="content-copy" />
          </button>
        </figcaption>
      </figure>
      <p className="invite-msg" aria-live="polite">{message}</p>
      <div className="invite-actions">
        {canShare ? (
          <button type="button" className={`btn btn-primary ${buttonClassName}`.trim()} onClick={share}>
            <Icon name="share-nodes" /><span>{INVITE_UI.share}</span>
          </button>
        ) : (
          <button type="button" className={`btn btn-primary ${buttonClassName}`.trim()} onClick={copy}>
            <Icon name="content-copy" /><span>{INVITE_UI.copy}</span>
          </button>
        )}
        {secondary?.(message === INVITE_UI.copied)}
      </div>
      <p className="invite-privacy"><Icon name="lock" /><span>{INVITE_UI.privacy}</span></p>
    </div>
  );
}
