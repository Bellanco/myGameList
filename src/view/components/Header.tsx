import { Icon } from './Icon';
import { COMMON_ICONS } from '../../core/constants/icons';

interface HeaderProps {
  syncStatus: string;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenSync: () => void;
  onOpenAdmin: () => void;
}

export function Header({ syncStatus, onExport, onImport, onOpenSync, onOpenAdmin }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="app-title">Mis Listas</div>
        <button className="sync-badge s-idle" type="button" onClick={onOpenSync}>
          <span className="sync-dot" />
          <span className="sync-label">{syncStatus}</span>
        </button>
      </div>
      <div className="header-actions">
        <button 
          className="btn btn-secondary" 
          type="button" 
          title="Descargar datos como JSON"
          aria-label="Exportar datos"
          onClick={onExport}
        >
          <Icon name={COMMON_ICONS.download} />
          <span>Exportar</span>
        </button>
        <label className="btn btn-secondary" title="Cargar archivo JSON">
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
        <button 
          className="btn btn-secondary" 
          type="button" 
          title="Abrir ajustes"
          aria-label="Ajustes y administración"
          onClick={onOpenAdmin}
        >
          <Icon name={COMMON_ICONS.gear} />
          <span>Ajustes</span>
        </button>
      </div>
    </header>
  );
}
