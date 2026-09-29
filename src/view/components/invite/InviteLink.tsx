import { Fragment, useState, type ReactNode } from 'react';
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
  /**
   * `compact`: la vista previa en MINIATURA al lado de la dirección y el botón en secundario. Es la de la pantalla
   * de Amigos, donde la invitación acompaña a la lista y no puede pesar más que ella. La grande, por defecto, es la
   * del último paso de la guía, donde invitar ES lo que se está haciendo.
   */
  variant?: 'full' | 'compact';
}

/**
 * EL ENLACE PARA INVITAR, con su VISTA PREVIA: la misma tarjeta que enseñan WhatsApp o Telegram al pegarlo
 * (`/share-card.jpg`, la del `og:image`), para que se vea qué se manda antes de mandarlo. Debajo, la dirección
 * completa con su botón de copiar, y la acción principal: compartir donde el navegador sabe (móvil) y copiar
 * donde no.
 */
export function InviteLink({ onShared, secondary, buttonClassName = '', variant = 'full' }: InviteLinkProps) {
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

  const compact = variant === 'compact';
  // UN SOLO BOTÓN, «Compartir», con el icono de compartir de Carbon. Donde el navegador tiene la hoja de compartir
  // del sistema (móvil, Safari, Chrome) la abre; donde no, copia el enlace y lo dice: el gesto es el mismo para
  // quien lo pulsa, y no hay que decidir entre dos botones.
  const shareButton = (
    <button
      type="button"
      className={`btn ${compact ? 'btn-secondary' : 'btn-primary'} invite-share ${buttonClassName}`.trim()}
      onClick={canShare ? share : copy}
    >
      <Icon name="share" /><span>{INVITE_UI.share}</span>
    </button>
  );

  return (
    <div className={`invite-link${compact ? ' is-compact' : ''}`}>
      <figure className="invite-preview">
        <img src="/share-card.jpg" width={1200} height={630} alt={INVITE_UI.previewAlt} decoding="async" loading="lazy" />
        <figcaption className="invite-preview-link">
          {/* LA DIRECCIÓN TAMBIÉN COPIA al pulsarla: es lo primero que se toca para copiar un enlace. Es un botón con
              aspecto de texto, y no un texto con `onClick`, para que llegue también con teclado y lector de pantalla.
              Con un punto de corte tras cada barra: en un móvil baja por «/completados» y no a mitad de palabra.
              `<wbr>` no añade nada al texto. */}
          <button
            type="button"
            className="invite-url"
            aria-label={INVITE_UI.copyUrlAria(INVITE_UI.url)}
            title={INVITE_UI.copy}
            onClick={copy}
          >
            {INVITE_UI.url.split('/').map((part, index, parts) => (
              <Fragment key={index}>{part}{index < parts.length - 1 ? <>/<wbr /></> : null}</Fragment>
            ))}
          </button>
          {/* En la compacta el botón va DENTRO del bloque, bajo la dirección: todo lo de compartir en una pieza. */}
          {compact ? shareButton : (
            <button type="button" className="invite-copy" aria-label={INVITE_UI.copy} title={INVITE_UI.copy} onClick={copy}>
              <Icon name="content-copy" />
            </button>
          )}
        </figcaption>
      </figure>
      <p className="invite-msg" aria-live="polite">{message}</p>
      {!compact || secondary ? (
        <div className="invite-actions">
          {compact ? null : shareButton}
          {secondary?.(message === INVITE_UI.copied)}
        </div>
      ) : null}
    </div>
  );
}
