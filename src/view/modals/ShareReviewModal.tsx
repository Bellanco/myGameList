import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNativeDialog } from './useNativeDialog';
import { SHARE_UI } from '../../core/constants/labels';
import { Icon } from '../components/Icon';
import { grantShareConsent, hasShareConsent } from '../../model/repository/shareConsentRepository';
import type { ShareQuota } from '../../core/constants/tiers';

/**
 * Diálogo de compartir una reseña con enlace público.
 *
 * DOS PANTALLAS EN UNA, y el orden importa: la primera vez (o cuando cambia lo que se publica) se enseña el
 * aviso COMPLETO con casilla obligatoria; después, solo el resumen y el botón. No se guarda un `true` sino la
 * versión legal aceptada, así que si cambia lo que sale publicado el aviso vuelve a aparecer entero.
 *
 * Tras publicar, el diálogo no se cierra: enseña el enlace con su botón de copiar. Cerrarlo de golpe dejaría al
 * usuario sin lo único que ha venido a buscar.
 */
export const ShareReviewModal = memo(function ShareReviewModal({
  open,
  gameName,
  quota,
  nick,
  nickIsAccountName,
  publishing,
  error,
  errorHint,
  publishedUrl,
  renewed,
  expiresAt,
  onCancel,
  onConfirm,
  onRenew,
}: {
  open: boolean;
  gameName: string;
  quota: ShareQuota | null;
  /** Nick con el que el servidor firmará la reseña, para poder verlo ANTES de publicar. */
  nick: string;
  /** Ese nick es el nombre de la cuenta de Google: se avisa, porque casi nadie lo elegiría a propósito. */
  nickIsAccountName: boolean;
  publishing: boolean;
  error: string;
  /** Qué puede hacer el usuario ante ese error (p. ej. sin enlaces libres). Vacío cuando no aplica. */
  errorHint: string;
  /** URL ya publicada; mientras sea vacía, el diálogo está en modo "confirmar". */
  publishedUrl: string;
  renewed: boolean;
  /** Cuándo deja de estar accesible el enlace que se está enseñando. 0 = no se sabe. */
  expiresAt: number;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * Rehace el enlace con el texto de AHORA y le da otra vez su duración completa, sobre el mismo token.
   *
   * Solo se pasa cuando la reseña YA estaba compartida. Es lo que evita que quien corrige una errata acabe con
   * dos enlaces —uno muerto circulando por un chat y otro nuevo— y no gasta cuota, porque no crea nada.
   */
  onRenew?: () => void;
}) {
  const dialogRef = useNativeDialog(open, onCancel);
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);

  const consentGiven = hasShareConsent();

  useEffect(() => {
    if (open) {
      setAccepted(false);
      setCopied(false);
    }
  }, [open]);

  const confirm = () => {
    if (!consentGiven) {
      grantShareConsent();
    }
    onConfirm();
  };

  /**
   * Hoja de compartir del sistema. Es la vía correcta para llevar el enlace a cualquier red: la lista de destinos
   * la pone el dispositivo, así que funciona con las que el usuario tenga instaladas sin que aquí haya que
   * enumerar ninguna ni mantener enlaces de intención por servicio.
   *
   * No existe en todos los navegadores de escritorio (Firefox, por ejemplo). Cuando falta, el botón no se pinta:
   * el enlace y su botón de copiar siguen ahí, que es lo que de verdad hace falta.
   */
  const canShareNatively = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareNatively = async () => {
    try {
      await navigator.share({ title: gameName, url: publishedUrl });
    } catch {
      // Cancelar la hoja de compartir lanza: no es un error que haya que contarle a nadie.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
    } catch {
      // Sin portapapeles (permiso denegado, contexto no seguro): el enlace está a la vista y se puede copiar a
      // mano, así que no se convierte en un error.
    }
  };

  /**
   * El diálogo cuelga de <body>, no de donde vive el botón que lo abre.
   *
   * Ese botón se monta en la barra de acciones del detalle (`.hub-screen-actions`), que en móvil aprieta sus
   * botones a 44×44 con `font-size: 0` para dejarlos en icono. Como el diálogo era hermano suyo, la regla
   * alcanzaba también a los botones DE DENTRO y salían como dos cajas vacías. Colgarlo del body lo deja fuera
   * del alcance de cualquier estilo pensado para esa barra, ahora y en adelante.
   */
  return createPortal(
    <dialog ref={dialogRef} className="alert-dialog share-dialog" aria-label={SHARE_UI.dialogTitle}>
      {open ? (
        <div className="dialog-content">
          <div className="dialog-title">{publishedUrl ? SHARE_UI.shared : SHARE_UI.dialogTitle}</div>
          <p className="share-dialog-game">{gameName}</p>

          {publishedUrl ? (
            <>
              {renewed ? <p className="share-dialog-note">{SHARE_UI.renewed}</p> : null}
              {!renewed && expiresAt > 0 ? (
                <p className="share-dialog-note">{SHARE_UI.expiresIn(Math.ceil((expiresAt - Date.now()) / 86_400_000))}</p>
              ) : null}
              {/* El enlace con su botón de copiar DENTRO, al final, como en cualquier caja de compartir de la
                  web: el gesto está donde está el dato, en vez de en un botón al pie que hay que buscar. */}
              <div className="share-dialog-url">
                <span className="share-dialog-url-text">{publishedUrl}</span>
                <button
                  className="share-dialog-copy"
                  type="button"
                  aria-label={SHARE_UI.copyLink}
                  title={SHARE_UI.copyLink}
                  onClick={copy}
                >
                  <Icon name="content-copy" />
                </button>
              </div>
              {/* Aviso en vivo para quien no ve el cambio del icono (lectores de pantalla). */}
              <p className="share-dialog-note" role="status">{copied ? SHARE_UI.copied : ''}</p>
              {error ? (
                <p className="share-dialog-error">
                  {error}
                  {errorHint ? ` ${errorHint}` : ''}
                </p>
              ) : null}
              <div className="dialog-actions">
                {onRenew ? (
                  <button className="btn btn-secondary" type="button" disabled={publishing} onClick={onRenew}>
                    {publishing ? SHARE_UI.renewing : SHARE_UI.renew}
                  </button>
                ) : null}
                {canShareNatively ? (
                  <button className="btn btn-secondary" type="button" onClick={shareNatively}>
                    <Icon name="share-nodes" />
                    <span>{SHARE_UI.shareNative}</span>
                  </button>
                ) : null}
                <button className="btn btn-primary" type="button" onClick={onCancel}>
                  {SHARE_UI.accept}
                </button>
              </div>
            </>
          ) : (
            <>
              {consentGiven ? null : (
                <div className="share-dialog-consent">
                  <p className="share-dialog-consent-title">{SHARE_UI.consentTitle}</p>
                  <p>{SHARE_UI.consentPublished}</p>
                  <p>{SHARE_UI.consentPrivate}</p>
                  <p>{SHARE_UI.consentRevocable}</p>
                </div>
              )}
              {quota ? <p className="share-dialog-note">{SHARE_UI.consentDuration(quota.ttlDays, quota.maxActive)}</p> : null}
              {nick ? (
                <p className={`share-dialog-note${nickIsAccountName ? ' share-dialog-warn' : ''}`}>
                  {SHARE_UI.signedAs(nick)}
                  {nickIsAccountName ? ` ${SHARE_UI.signedAsAccountName}` : ''}
                </p>
              ) : null}
              {consentGiven ? null : (
                <label className="share-dialog-accept">
                  <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                  <span>{SHARE_UI.consentAccept}</span>
                </label>
              )}
              {error ? (
                <p className="share-dialog-error">
                  {error}
                  {errorHint ? ` ${errorHint}` : ''}
                </p>
              ) : null}
              <div className="dialog-actions">
                <button className="btn btn-secondary" type="button" onClick={onCancel}>
                  {SHARE_UI.cancel}
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={confirm}
                  disabled={publishing || (!consentGiven && !accepted)}
                >
                  {publishing ? SHARE_UI.publishing : SHARE_UI.confirm}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </dialog>,
    document.body,
  );
});
