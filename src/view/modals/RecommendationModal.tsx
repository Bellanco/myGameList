import { memo, useCallback, useState } from 'react';
import { Icon } from '../components/Icon';
import { COMMON_ICONS } from '../../core/constants/icons';

interface RecommendationModalProps {
  open: boolean;
  game: { id: number; name: string; score: number } | null;
  currentUserName: string;
  onClose: () => void;
  onSend: () => Promise<void>;
}

/**
 * Modal para publicar una recomendación en el gist social.
 * Solo permite activar/desactivar la recomendación del juego.
 */
export const RecommendationModal = memo(function RecommendationModal({
  open,
  game,
  currentUserName,
  onClose,
  onSend,
}: RecommendationModalProps) {
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSend = useCallback(async () => {
    try {
      setSending(true);
      setErrorMsg('');
      await onSend();
      onClose();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Error al publicar recomendación');
    } finally {
      setSending(false);
    }
  }, [onSend, onClose]);

  const handleClose = useCallback(() => {
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
              <label className="flabel" htmlFor="rec-puntuacion">Puntuación</label>
              <input
                id="rec-puntuacion"
                className="finput"
                type="text"
                readOnly
                value={game.score > 0 ? `${game.score}/5` : 'Sin puntuación'}
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
              {currentUserName} publicará "{game.name}" como recomendación en el feed social de sus contactos.
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
