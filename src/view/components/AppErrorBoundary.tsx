import { Component, type ErrorInfo, type ReactNode } from 'react';
import { APP_ERROR_UI } from '../../core/constants/labels';
import { parsePaletteId } from '../../core/constants/palettes';
import { loadPaletteSkin } from '../hooks/paletteSkin';
import { reportHandledError } from '../../model/repository/firebaseGateway';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary RAÍZ de la app. Captura errores de RENDER de cualquier parte del árbol (los que no atrapa un
 * boundary más específico como el del hub social) y evita la pantalla en blanco mostrando un fallback con recarga.
 * Reporta el error como FATAL a la telemetría (tumbó el árbol). No cubre errores async ni de event handlers: esos
 * los captan los listeners globales de `main.tsx` (`error`/`unhandledrejection`) o el try/catch de cada ViewModel.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Best-effort: no debe romper el fallback si la telemetría falla.
    try {
      void reportHandledError(error, true, 'app-boundary');
    } catch {
      /* noop */
    }
    // El skin del tema (tipografía y formas) lo pide un hook DENTRO de la app, así que si el árbol cae antes
    // de montarlo la pantalla de error se queda con los colores del tema pero la tipografía base. Se pide aquí
    // para que el aviso hable también con la letra de su tema. Best-effort: la función ya se traga sus fallos.
    try {
      loadPaletteSkin(parsePaletteId(document.documentElement.dataset.palette));
    } catch {
      /* noop */
    }
    if (import.meta.env?.DEV) {
      console.error('[App] error de render capturado:', error, info.componentStack);
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="app-error error-screen" role="alert" aria-label={APP_ERROR_UI.sectionAria}>
        <div className="error-plain">
          {/* El titular se queda solo para lectores de pantalla: visualmente la pantalla es el mensaje y la
              acción, pero sin ningún encabezado la página perdería su estructura al navegar por títulos. */}
          <h1 className="sr-only">{APP_ERROR_UI.title}</h1>
          {/* La paleta se lee del <html>, que la fija el script anti-flash de `index.html` antes del primer
              render: sigue ahí aunque el árbol de React se haya venido abajo. Sin atributo → tema por defecto. */}
          <p className="error-lead">{APP_ERROR_UI.leadByPalette[parsePaletteId(document.documentElement.dataset.palette)]}</p>
          <p className="error-hint">{APP_ERROR_UI.hint}</p>
          <div className="error-actions">
            <button className="btn btn-ghost error-ghost" type="button" onClick={this.handleReload}>
              {APP_ERROR_UI.reload}
            </button>
          </div>
        </div>
      </section>
    );
  }
}
