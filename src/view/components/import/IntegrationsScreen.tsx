import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';
import { PlayniteNote } from './PlayniteNote';
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.integrations;

interface IntegrationsScreenProps {
  /** El archivo JSON exportado por Playnite Library Exporter; App parsea/mapea/inserta y avisa. */
  onImport: (file: File) => void;
  /** Volver a la pantalla desde la que se abrió Integraciones (ajustes, un listado…). */
  onBack: () => void;
  /** Nº de juegos en la bandeja (para el acceso "Ver bandeja"). */
  inboxCount: number;
  /** Abrir la bandeja de importados. */
  onOpenInbox: () => void;
}

/** Pantalla de Integraciones. Única vía: importar el JSON de la extensión «Playnite Library Exporter». */
function IntegrationsScreenBase({ onImport, onBack, inboxCount, onOpenInbox }: IntegrationsScreenProps) {
  return (
    <div className="import-screen">
      <div className="import-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <Icon name={COMMON_ICONS.arrowBack} />
          <span>{UI_MESSAGES.import.back}</span>
        </button>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h2>{M.title}</h2>
          <PlayniteNote />
        </div>
        <div className="settings-backup-info">
          <p className="settings-card-note import-steps-title">{M.stepsTitle}</p>
          <ol className="settings-card-note import-steps">
            {M.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="settings-backup-actions import-integrations-actions">
          {inboxCount > 0 ? (
            <button type="button" className="btn btn-secondary btn-accent" onClick={onOpenInbox}>
              <Icon name={COMMON_ICONS.download} />
              <span>{M.viewInbox(inboxCount)}</span>
            </button>
          ) : null}
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

/**
 * Memoizada: `App` reconstruye el mapa de secciones en cada render, así que sin esto la pantalla se volvía a
 * renderizar por cualquier cambio de la aplicación. Sus cuatro props son estables (manejadores en `useCallback`
 * y un número), que es lo que hace que el `memo` sirva de algo y no solo añada una comparación.
 */
export const IntegrationsScreen = memo(IntegrationsScreenBase);
