import type { CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';

const M = UI_MESSAGES.import.integrations;

// Columna a todo el ancho (no usar el grid de `.settings-hub`, que estrecha las tarjetas en pantallas anchas).
const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  width: '100%',
  maxWidth: '72rem',
  margin: '0 auto',
};

interface IntegrationsScreenProps {
  /** El fichero exportado de Playnite; App se encarga de parsear/mapear/insertar y avisar. */
  onImportPlaynite: (file: File) => void;
  /** Volver a la pantalla anterior (Cuenta). */
  onBack: () => void;
}

/**
 * Pantalla de Integraciones. Primera integración: Playnite (import de fichero, sin backend). El resto de
 * plataformas (Steam/Xbox/PSN/GOG/EGS) son añadidos futuros (aún no se muestran).
 */
export function IntegrationsScreen({ onImportPlaynite, onBack }: IntegrationsScreenProps) {
  return (
    <div style={screenStyle}>
      <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name={COMMON_ICONS.arrowBack} />
        <span>{UI_MESSAGES.import.back}</span>
      </button>

      <div className="settings-card">
        <div className="settings-card-head">
          <h2>{M.playniteTitle}</h2>
          <p className="settings-card-note">{M.note}</p>
        </div>
        <div className="settings-backup-row">
          <div className="settings-backup-info">
            <p>{M.playniteDesc}</p>
          </div>
          <div className="settings-backup-actions">
            <label className="btn btn-secondary settings-import-label">
              <Icon name={COMMON_ICONS.upload} />
              <span>{M.importBtn}</span>
              <input
                type="file"
                accept=".json,application/json"
                className="input-hidden"
                aria-label={M.importAriaLabel}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImportPlaynite(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
