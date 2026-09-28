import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportHandledError } from '../../model/repository/firebaseGateway';

interface Props {
  /** Etiqueta para la telemetría: qué pieza es la que no llegó. */
  source: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * LÍMITE DE ERROR PARA PIEZAS PRESCINDIBLES: si lo de dentro falla, no se pinta nada y la app sigue.
 *
 * Existe por las piezas que `App` monta en idle y por `lazy()` —el resto del sprite de iconos y los efectos de
 * firma—. Colgaban del límite RAÍZ, así que un `import()` que fallara (medido el 28-09-2026 cortando la
 * descarga del chunk, en Firefox y en Chromium) tumbaba la aplicación ENTERA a la pantalla de error, por unos
 * iconos y unos efectos. Aquí se quedan sin pintar, que es lo que valen, y el fallo se reporta como NO fatal.
 */
export class SilentBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    try {
      void reportHandledError(error, false, this.props.source);
    } catch {
      /* noop: la telemetría no puede romper esto */
    }
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
