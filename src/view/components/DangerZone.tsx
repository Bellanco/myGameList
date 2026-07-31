import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DIALOG_MESSAGES, UI_MESSAGES } from '../../core/constants/labels';
import { getCurrentSocialAuthUser } from '../../model/repository/firebaseGateway';
import { useNativeDialog } from '../modals/useNativeDialog';

const D = UI_MESSAGES.settings.danger;

type Feedback = { kind: 'ok' | 'warn' | 'err'; text: string } | null;

/**
 * L3 — "Zona de riesgo": borrado de cuenta (RGPD art. 17) ejecutable por el propio usuario.
 *
 * Doble confirmación (diálogo + escribir la palabra) porque la acción es irreversible y destruye también los
 * datos locales del dispositivo. El repositorio se carga con `import()` dinámico para no arrastrar el SDK de
 * Firestore al chunk de la pantalla de cuenta: solo hace falta si de verdad se pulsa el botón.
 */
export const DangerZone = memo(function DangerZone() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const close = useCallback(() => {
    if (busy) return; // no dejar cerrar a media faena
    setOpen(false);
    setWord('');
  }, [busy]);

  const dialogRef = useNativeDialog(open, close);

  const confirm = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const user = await getCurrentSocialAuthUser();
      const { deleteOwnAccount } = await import('../../model/repository/accountDeletionRepository');
      const result = await deleteOwnAccount(String(user?.uid || ''));
      setOpen(false);
      setWord('');
      setFeedback(result.remoteComplete ? { kind: 'ok', text: D.deletedOk } : { kind: 'warn', text: D.deletedPartial });
      if (!result.remoteComplete) {
        console.warn('[cuenta] borrado incompleto:', result.failures);
      }
      // Fuera de la cuenta: sin sesión ni datos locales, esta pantalla ya no aplica.
      navigate('/completados', { replace: true });
    } catch (error) {
      console.warn('[cuenta] no se pudo borrar:', error);
      setFeedback({ kind: 'err', text: D.deleteError });
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  return (
    <div className="settings-card settings-card-danger">
      <h2>{D.title}</h2>
      <p className="settings-card-sub">
        <strong>{D.deleteTitle}</strong>
      </p>
      <p>{D.deleteBody}</p>
      <p className="settings-card-note">
        {D.deleteGistsNote}{' '}
        <a href={D.deleteGistsUrl} target="_blank" rel="noreferrer noopener">
          {D.deleteGistsLink}
        </a>
      </p>
      {feedback ? <p className={`settings-danger-feedback ${feedback.kind}`}>{feedback.text}</p> : null}
      <div>
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          {D.deleteBtn}
        </button>
      </div>

      <dialog ref={dialogRef} className="alert-dialog" data-type="delete" aria-label={D.confirmTitle}>
        {open ? (
          <div className="dialog-content">
            <div className="dialog-title">{D.confirmTitle}</div>
            <p className="settings-card-note">{D.deleteBody}</p>
            <label className="settings-danger-confirm">
              <span>{D.confirmHint}</span>
              <input
                type="text"
                value={word}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setWord(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>
                {DIALOG_MESSAGES.cancel}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy || word.trim().toUpperCase() !== D.confirmWord}
                onClick={() => void confirm()}
              >
                {busy ? D.deleting : D.confirmLabel}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
});
