import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { SOCIAL_UI } from '../../../core/constants/labels';
import { reportHandledError } from '../../../model/repository/firebaseRepository';

// Cooldown de reintento: 15 min. Un fallo de render del hub social muestra el fallback; el reintento NO es inmediato
// ni ilimitado (evita reintentar de forma indiscriminada un fallo persistente, que reharía la misma carga fallida).
const RETRY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Pantalla de reemplazo cuando el hub social lanza un error de render. Muestra el aviso y un botón de reintento
 * BLOQUEADO hasta que pasen 15 min desde el (último) fallo, con una cuenta atrás. Componente de función para poder
 * usar hooks (temporizador de la cuenta atrás); el boundary de clase la renderiza.
 */
function SocialErrorFallback({ canRetryAt, onRetry }: { canRetryAt: number; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.max(0, canRetryAt - now);
  const canRetry = remainingMs <= 0;

  useEffect(() => {
    if (canRetry) {
      return;
    }
    // Solo mientras hay cuenta atrás: refresca cada segundo para actualizar los minutos restantes y habilitar el botón.
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [canRetry]);

  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.errorBoundary.sectionAria}>
      <div className="hub-hub-card hub-screen-card">
        <div className="hub-hub-title-wrap">
          <Icon name="bottom-hub" className="hub-hub-icon" />
          <h2>{SOCIAL_UI.errorBoundary.title}</h2>
        </div>
        <p>{SOCIAL_UI.errorBoundary.body}</p>
        <div className="hub-screen-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={onRetry}
            disabled={!canRetry}
            aria-disabled={!canRetry}
          >
            <Icon name="refresh" />
            {canRetry ? SOCIAL_UI.errorBoundary.retry : SOCIAL_UI.errorBoundary.retryIn(remainingMin)}
          </button>
        </div>
      </div>
    </section>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  canRetryAt: number;
}

/**
 * Error boundary del hub social. Captura errores de RENDER de su subárbol (no de event handlers ni de código async;
 * esos se siguen gestionando con try/catch en el ViewModel) y evita la pantalla en blanco mostrando un fallback.
 * El reintento está limitado a 1 cada 15 min: cada error (incluido un reintento que vuelve a fallar) reinicia el
 * cooldown, de modo que no se puede machacar el botón ni reintentar en bucle un fallo persistente.
 */
export class SocialErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, canRetryAt: 0 };

  static getDerivedStateFromError(): State {
    return { hasError: true, canRetryAt: Date.now() + RETRY_COOLDOWN_MS };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Best-effort: registra el error para diagnóstico (no debe romper el fallback si la telemetría falla).
    try {
      void reportHandledError(error);
    } catch {
      /* noop */
    }
    if (import.meta.env?.DEV) {
      console.error('[SocialHub] error de render capturado:', error, info.componentStack);
    }
  }

  handleRetry = (): void => {
    // Guardia dura: aunque la UI deshabilite el botón, no se reintenta antes de que expire el cooldown.
    if (Date.now() < this.state.canRetryAt) {
      return;
    }
    this.setState({ hasError: false, canRetryAt: 0 });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <SocialErrorFallback canRetryAt={this.state.canRetryAt} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
