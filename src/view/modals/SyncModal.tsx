import { useEffect } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import type { SyncStatus } from '../../viewmodel/useSyncViewModel';
import { Icon } from '../components/Icon';

interface SyncModalProps {
  open: boolean;
  status: SyncStatus;
  hasConfig: boolean;
  connectedGistId: string;
  token: string;
  gistId: string;
  statusMessage: string;
  showToken: boolean;
  onClose: () => void;
  onTokenChange: (value: string) => void;
  onGistIdChange: (value: string) => void;
  onShowTokenToggle: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
}

export function SyncModal({
  open,
  status,
  hasConfig,
  connectedGistId,
  token,
  gistId,
  statusMessage,
  showToken,
  onClose,
  onTokenChange,
  onGistIdChange,
  onShowTokenToggle,
  onConnect,
  onDisconnect,
  onSyncNow,
}: SyncModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-ov active"
      role="button"
      tabIndex={0}
      aria-label="Cerrar modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="modal modal--sm">
        <div className="modal-hd">
          <div className="modal-title">Sincronización — GitHub Gist</div>
          <button className="btn-icon" type="button" onClick={onClose}>
            <Icon name={COMMON_ICONS.close} />
          </button>
        </div>
        <div className="modal-body" id="sync-body">
          {!hasConfig ? (
            <>
              <div className="sync-help">
                <strong>¿Qué es GitHub Gist?</strong>
                <br />
                GitHub Gist permite guardar tus listas en la nube privada para sincronizarlas entre dispositivos.
              </div>
              <div className="sync-help">
                <strong>Cómo configurar</strong>
                <br />
                Crea un token en GitHub con permiso gist y pégalo aquí.
              </div>
              <div className="fg">
                <label htmlFor="sync-token" className="flabel">Token *</label>
                <div className="token-row">
                  <input
                    id="sync-token"
                    className="finput"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(event) => onTokenChange(event.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <button className="token-toggle" type="button" onClick={onShowTokenToggle}>
                    <Icon name={showToken ? COMMON_ICONS.eyeOff : COMMON_ICONS.eye} />
                  </button>
                </div>
              </div>
              <div className="fg">
                <label htmlFor="sync-gist-id" className="flabel">Gist ID (vacío la primera vez)</label>
                <input
                  id="sync-gist-id"
                  className="finput"
                  value={gistId}
                  onChange={(event) => onGistIdChange(event.target.value)}
                  placeholder="Ej: a1b2c3d4e5f6..."
                />
              </div>
            </>
          ) : (
            <div className="sync-help">Gist conectado: {connectedGistId || gistId}</div>
          )}
          {statusMessage ? <div className="sync-status-msg err">{statusMessage}</div> : null}
        </div>
        <div className="modal-ft" id="sync-footer">
          {!hasConfig ? (
            <>
              <button className="btn btn-secondary" type="button" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn btn-steam" type="button" onClick={onConnect}>
                Conectar
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-danger" type="button" onClick={onDisconnect}>
                Desconectar
              </button>
              <button className="btn btn-secondary" type="button" onClick={onClose}>
                Cerrar
              </button>
              <button className="btn btn-steam" type="button" onClick={onSyncNow}>
                Sincronizar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
