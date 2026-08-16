import { memo, useEffect, useState } from 'react';
import { useNativeDialog } from './useNativeDialog';
import { SHARE_UI } from '../../core/constants/labels';
import { LEGAL_VERSION } from '../../core/constants/legal';
import { SHARE_CONSENT_KEY } from '../../core/constants/storageKeys';
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
  publishing,
  error,
  publishedUrl,
  renewed,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  gameName: string;
  quota: ShareQuota | null;
  publishing: boolean;
  error: string;
  /** URL ya publicada; mientras sea vacía, el diálogo está en modo "confirmar". */
  publishedUrl: string;
  renewed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useNativeDialog(open, onCancel);
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);

  const consentGiven = readConsent() === LEGAL_VERSION;

  useEffect(() => {
    if (open) {
      setAccepted(false);
      setCopied(false);
    }
  }, [open]);

  const confirm = () => {
    if (!consentGiven) {
      writeConsent();
    }
    onConfirm();
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

  return (
    <dialog ref={dialogRef} className="alert-dialog share-dialog" aria-label={SHARE_UI.dialogTitle}>
      {open ? (
        <div className="dialog-content">
          <div className="dialog-title">{publishedUrl ? SHARE_UI.shared : SHARE_UI.dialogTitle}</div>
          <p className="share-dialog-game">{gameName}</p>

          {publishedUrl ? (
            <>
              {renewed ? <p className="share-dialog-note">{SHARE_UI.renewed}</p> : null}
              <p className="share-dialog-url">{publishedUrl}</p>
              <div className="dialog-actions">
                <button className="btn btn-secondary" type="button" onClick={onCancel}>
                  {SHARE_UI.cancel}
                </button>
                <button className="btn btn-primary" type="button" onClick={copy}>
                  {copied ? SHARE_UI.copied : SHARE_UI.copyLink}
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
              {consentGiven ? null : (
                <label className="share-dialog-accept">
                  <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                  <span>{SHARE_UI.consentAccept}</span>
                </label>
              )}
              {error ? <p className="share-dialog-error">{error}</p> : null}
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
    </dialog>
  );
});

function readConsent(): string {
  try {
    return localStorage.getItem(SHARE_CONSENT_KEY) || '';
  } catch {
    return '';
  }
}

function writeConsent(): void {
  try {
    localStorage.setItem(SHARE_CONSENT_KEY, LEGAL_VERSION);
  } catch {
    // Sin almacenamiento (modo privado estricto): se volverá a pedir el consentimiento la próxima vez, que es
    // el lado seguro por el que fallar.
  }
}
