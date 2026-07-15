import type { CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import type { ImportMethod } from '../../../model/types/import';
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
  /** Método elegido en /cuenta: determina qué apartado se muestra. */
  method: ImportMethod;
  /** Varios .json de "Json Library Import Export"; App parsea/mapea/inserta y avisa. */
  onImportJsonLibrary: (files: FileList) => void;
  /** CSV de "Library Exporter". */
  onImportCsv: (file: File) => void;
  /** Volver a la pantalla anterior (Cuenta). */
  onBack: () => void;
  /** Nº de juegos en la bandeja (para el acceso "Ver bandeja"). */
  inboxCount: number;
  /** Abrir la bandeja de importados. */
  onOpenInbox: () => void;
}

/**
 * Pantalla de un método de importación de Playnite. El método se elige en /cuenta (dos botones); aquí
 * solo se muestra el apartado correspondiente (mensaje + pasos + importación).
 */
export function IntegrationsScreen({ method, onImportJsonLibrary, onImportCsv, onBack, inboxCount, onOpenInbox }: IntegrationsScreenProps) {
  const cfg = method === 'json' ? M.jsonLib : M.csv;

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
          <h2>{cfg.title}</h2>
          <p className="settings-card-note">{cfg.desc}</p>
        </div>
        <div className="settings-backup-info">
          <p className="settings-card-note" style={{ fontWeight: 600 }}>{M.stepsTitle}</p>
          <ol className="settings-card-note" style={stepsStyle}>
            {cfg.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="settings-backup-actions" style={{ marginTop: '0.9rem' }}>
          <label className="btn btn-secondary settings-import-label">
            <Icon name={COMMON_ICONS.upload} />
            <span>{cfg.importBtn}</span>
            <input
              type="file"
              accept={method === 'json' ? '.json,application/json' : '.csv,text/csv'}
              multiple={method === 'json'}
              className="input-hidden"
              aria-label={cfg.importAria}
              onChange={(event) => {
                const files = event.target.files;
                if (files && files.length > 0) {
                  if (method === 'json') onImportJsonLibrary(files);
                  else onImportCsv(files[0]);
                }
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
