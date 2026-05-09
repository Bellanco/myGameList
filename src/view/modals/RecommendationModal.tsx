import { memo, useCallback, useState } from 'react';
import { Icon } from '../components/Icon';
import { COMMON_ICONS } from '../../core/constants/icons';

interface RecommendationModalProps {
  open: boolean;
  game: { id: number; name: string } | null;
  currentUserName: string;
  onClose: () => void;
  onSend: (toEmail: string, message: string) => Promise<void>;
}

/**
 * Modal para publicar una recomendación en el gist social.
 * Permite opcionalmente etiquetar un email de destino y añadir un mensaje.
 */
export const RecommendationModal = memo(function RecommendationModal({
  open,
  game,
  currentUserName,
  onClose,
  onSend,
}: RecommendationModalProps) {
  const [toEmail, setToEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSend = useCallback(async () => {
    const cleanEmail = toEmail.trim().toLowerCase();

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Email no válido');
      return;
    }

    try {
      setSending(true);
      setErrorMsg('');
      await onSend(cleanEmail, message.trim());
      setToEmail('');
      setMessage('');
      onClose();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Error al enviar recomendación');
    } finally {
      setSending(false);
    }
  }, [toEmail, message, onSend, onClose]);

  const handleClose = useCallback(() => {
    setToEmail('');
    setMessage('');
    setErrorMsg('');
    onClose();
  }, [onClose]);

  if (!open || !game) {
    return null;
  }

  return (
    <div
      className="modal-ov active"
      role="button"
      tabIndex={0}
      aria-label="Cerrar modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          handleClose();
        }
      }}
    >
      <div className="modal">
        <div className="modal-hd">
          <div className="modal-title">Publicar recomendación social</div>
          <button className="btn-icon" type="button" onClick={handleClose} aria-label="Cerrar">
            <Icon name={COMMON_ICONS.close} />
          </button>
        </div>
        <div className="modal-body">
          <div className="frow">
            <div className="fg">
              <label className="flabel" htmlFor="rec-game-name">Juego</label>
              <input
                id="rec-game-name"
                className="finput"
                type="text"
                readOnly
                value={game.name}
              />
            </div>
          </div>

          <div className="frow">
            <div className="fg">
              <label className="flabel" htmlFor="rec-to-email">Email de destino (opcional)</label>
              <input
                id="rec-to-email"
                className="finput"
                type="email"
                placeholder="amigo@example.com"
                value={toEmail}
                onChange={(event) => {
                  setToEmail(event.target.value);
                  setErrorMsg('');
                }}
                disabled={sending}
              />
            </div>
          </div>

          <div className="frow">
            <div className="fg">
              <label className="flabel" htmlFor="rec-message">Mensaje (opcional)</label>
              <textarea
                id="rec-message"
                className="finput"
                placeholder={`Te recomiendo jugar "${game.name}" porque...`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={sending}
                rows={4}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="frow">
              <small className="tag-hint tag-hint--error" style={{ color: 'var(--color-error)' }}>
                {errorMsg}
              </small>
            </div>
          )}

          <div className="frow">
            <small className="tag-hint" style={{ color: 'var(--text-muted)' }}>
              {currentUserName} publicará "{game.name}" en su perfil social para que aparezca en el hub.
            </small>
          </div>
        </div>

        <div className="modal-ft">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={handleClose}
            disabled={sending}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleSend()}
            disabled={sending}
          >
            {sending ? 'Publicando...' : 'Publicar recomendación'}
          </button>
        </div>
      </div>
    </div>
  );
});
