import { memo } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { Icon } from './Icon';

interface SettingsHubProps {
  syncStatus: string;
  onOpenSync: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenAdmin: () => void;
}

/**
 * Hub de ajustes con acciones de mantenimiento y sincronizacion.
 */
export const SettingsHub = memo(function SettingsHub({ syncStatus, onOpenSync, onExport, onImport, onOpenAdmin }: SettingsHubProps) {
  return (
    <section className="settings-hub" aria-label="Ajustes">
      <div className="settings-card settings-card-status">
        <h2>Sincronizacion</h2>
        <p>Estado actual: <strong>{syncStatus}</strong></p>
        <button className="btn btn-secondary" type="button" onClick={onOpenSync}>
          <Icon name="cloud-sync" />
          <span>Abrir sincronizacion</span>
        </button>
      </div>

      <div className="settings-card">
        <h2>Respaldo de datos</h2>
        <p>Exporta o importa tus listados en formato JSON.</p>
        <div className="settings-actions">
          <button className="btn btn-secondary" type="button" onClick={onExport}>
            <Icon name={COMMON_ICONS.download} />
            <span>Exportar</span>
          </button>
          <label className="btn btn-secondary settings-import-label">
            <Icon name={COMMON_ICONS.upload} />
            <span>Importar</span>
            <input
              type="file"
              accept=".json"
              className="input-hidden"
              aria-label="Seleccionar archivo para importar"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="settings-card">
        <h2>Filtros y etiquetas</h2>
        <p>Gestiona generos, plataformas y etiquetas comunes desde administracion.</p>
        <button className="btn btn-secondary" type="button" onClick={onOpenAdmin}>
          <Icon name={COMMON_ICONS.gear} />
          <span>Administrar filtros</span>
        </button>
      </div>
    </section>
  );
});
