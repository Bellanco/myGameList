import { Component, type ErrorInfo, type ReactNode } from 'react';
import { APP_ERROR_UI } from '../../core/constants/labels';
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
      <section className="app-error" role="alert" aria-label={APP_ERROR_UI.sectionAria}>
        <div className="app-error-card">
          <h1>{APP_ERROR_UI.title}</h1>
          <p>{APP_ERROR_UI.body}</p>
          <button className="btn btn-primary" type="button" onClick={this.handleReload}>
            {APP_ERROR_UI.reload}
          </button>
        </div>
      </section>
    );
  }
}
