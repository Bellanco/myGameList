import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { SOCIAL_UI } from '../../../core/constants/socialLabels';
import { parsePaletteId } from '../../../core/constants/palettes';
import { isNetworkFailure, isOffline } from '../../../core/utils/network';
import { reportHandledError } from '../../../model/repository/firebaseRepository';

// Cooldown de reintento: 15 min. Un fallo de render del hub social muestra el fallback; el reintento NO es inmediato
// ni ilimitado (evita reintentar de forma indiscriminada un fallo persistente, que reharía la misma carga fallida).
const RETRY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Pantalla de reemplazo cuando el hub social lanza un error de render. Muestra el aviso y un botón de reintento
 * BLOQUEADO hasta que pasen 15 min desde el (último) fallo, con una cuenta atrás. Componente de función para poder
 * usar hooks (temporizador de la cuenta atrás); el boundary de clase la renderiza.
 */
function SocialErrorFallback({ canRetryAt, onRetry, offline }: { canRetryAt: number; onRetry: () => void; offline: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.max(0, canRetryAt - now);
  // Si lo que falló fue la RED, la espera de 15 minutos no aplica: no había nada roto que reintentar en vano, y en
  // cuanto vuelve la conexión el reintento tiene todas las papeletas de funcionar. Se habilita el botón al recuperarla.
  const [backOnline, setBackOnline] = useState(() => offline && !isOffline());
  const canRetry = remainingMs <= 0 || (offline && backOnline);

  // Vigila la vuelta de la red mientras el fallback está en pantalla (solo si el fallo fue de red).
  useEffect(() => {
    if (!offline) {
      return;
    }
    const goOnline = () => setBackOnline(true);
    window.addEventListener('online', goOnline);
    return () => window.removeEventListener('online', goOnline);
  }, [offline]);

  useEffect(() => {
    if (canRetry) {
      return;
    }
    // Un ÚNICO despertador al instante exacto en que expira la espera, en vez de un tic cada segundo: ya no hay
    // cuenta atrás que repintar, y lo único que queda por hacer es habilitar el botón cuando toque.
    const id = window.setTimeout(() => setNow(Date.now()), remainingMs);
    return () => window.clearTimeout(id);
  }, [canRetry, remainingMs]);

  return (
    <section className="hub-hub hub-screen error-screen" aria-label={SOCIAL_UI.errorBoundary.sectionAria}>
      {/* Sin tarjeta, igual que la pantalla raíz: el aviso se apoya en el fondo de la sección. */}
      <div className="error-plain error-plain-inline">
        {/* La paleta se lee del <html> (la fija el script anti-flash de `index.html`), igual que en el boundary
            raíz, así no hay que enhebrar la preferencia por props hasta aquí. */}
        <h2 className="error-lead">
          {(offline ? SOCIAL_UI.offline.leadByPalette : SOCIAL_UI.errorBoundary.titleByPalette)[
            parsePaletteId(document.documentElement.dataset.palette)
          ]}
        </h2>
        <p className="error-hint">{offline ? SOCIAL_UI.offline.bodyEmpty : SOCIAL_UI.errorBoundary.body}</p>
        <div className="error-actions">
          <button
            className="btn btn-ghost error-ghost"
            type="button"
            onClick={onRetry}
            disabled={!canRetry}
            aria-disabled={!canRetry}
            aria-label={canRetry ? undefined : SOCIAL_UI.errorBoundary.retryBlockedAria}
          >
            <Icon name="refresh" />
            {SOCIAL_UI.errorBoundary.retry}
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
  /** ¿El fallo fue por falta de RED (chunk que no baja, lectura que no llega)? Cambia el aviso y la espera. */
  offline: boolean;
}

/**
 * Error boundary del hub social. Captura errores de RENDER de su subárbol (no de event handlers ni de código async;
 * esos se siguen gestionando con try/catch en el ViewModel) y evita la pantalla en blanco mostrando un fallback.
 * El reintento está limitado a 1 cada 15 min: cada error (incluido un reintento que vuelve a fallar) reinicia el
 * cooldown, de modo que no se puede machacar el botón ni reintentar en bucle un fallo persistente.
 */
export class SocialErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, canRetryAt: 0, offline: false };

  static getDerivedStateFromError(error: unknown): State {
    // Un chunk perezoso que no se puede descargar («Failed to fetch dynamically imported module») llega aquí como
    // un error de render cualquiera, y es exactamente lo que pasa al entrar sin red en una sección todavía no
    // visitada. Contarlo como avería de la aplicación era el diagnóstico equivocado.
    return { hasError: true, canRetryAt: Date.now() + RETRY_COOLDOWN_MS, offline: isNetworkFailure(error) || isOffline() };
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
    // Guardia dura: aunque la UI deshabilite el botón, no se reintenta antes de que expire el cooldown. La
    // excepción es el fallo de red con la red ya recuperada: ahí el reintento es lo correcto y no hay nada que acotar.
    if (Date.now() < this.state.canRetryAt && !(this.state.offline && !isOffline())) {
      return;
    }
    this.setState({ hasError: false, canRetryAt: 0, offline: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <SocialErrorFallback
          canRetryAt={this.state.canRetryAt}
          onRetry={this.handleRetry}
          offline={this.state.offline}
        />
      );
    }
    return this.props.children;
  }
}
