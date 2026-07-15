import type { CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';

const M = UI_MESSAGES.import.integrations;

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  width: '100%',
  maxWidth: '72rem',
  margin: '0 auto',
};

const stepsStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  paddingLeft: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

interface IntegrationsScreenProps {
  /** El archivo JSON exportado por Playnite Library Exporter; App parsea/mapea/inserta y avisa. */
  onImport: (file: File) => void;
  /** Volver a la pantalla anterior (Cuenta). */
  onBack: () => void;
  /** Nº de juegos en la bandeja (para el acceso "Ver bandeja"). */
  inboxCount: number;
  /** Abrir la bandeja de importados. */
  onOpenInbox: () => void;
}

/** Pantalla de Integraciones. Única vía: importar el JSON de la extensión «Playnite Library Exporter». */
export function IntegrationsScreen({ onImport, onBack, inboxCount, onOpenInbox }: IntegrationsScreenProps) {
  return (
    <div style={screenStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <Icon name={COMMON_ICONS.arrowBack} />
          <span>{UI_MESSAGES.import.back}</span>
        </button>
        <span style={{ flex: 1 }} />
        {inboxCount > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={onOpenInbox}>
            <Icon name={COMMON_ICONS.download} />
            <span>{M.viewInbox(inboxCount)}</span>
          </button>
        ) : null}
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h2>{M.title}</h2>
          <p className="settings-card-note">{M.note}</p>
        </div>
        <div className="settings-backup-info">
          <p className="settings-card-note" style={{ fontWeight: 600 }}>{M.stepsTitle}</p>
          <ol className="settings-card-note" style={stepsStyle}>
            {M.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="settings-backup-actions" style={{ marginTop: '0.9rem' }}>
          <label className="btn btn-secondary settings-import-label">
            <Icon name={COMMON_ICONS.upload} />
            <span>{M.importBtn}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="input-hidden"
              aria-label={M.importAria}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
