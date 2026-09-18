import { createContext, useContext } from 'react';

/**
 * LA CONEXIÓN CON GITHUB, dicha en una sola interfaz.
 *
 * Es el trozo de `useSyncViewModel` que necesita quien quiera OFRECER la conexión: el estado, los dos campos del
 * modo manual y los seis botones. Ni el ciclo de sincronización, ni la copia de seguridad, ni la importación.
 *
 * Existe porque esto se pide desde dos sitios —la pantalla de Integración y la pasarela del hub social— y el
 * viewmodel de sincronización es UNO SOLO, montado en `App` y atado a los datos de la aplicación: no se puede
 * instanciar otro dentro del hub sin duplicar el ciclo de sync. Antes la pasarela lo resolvía navegando a
 * Ajustes, y quien venía de social acababa en otra pantalla sin camino de vuelta.
 */
export interface GithubConnection {
  /** Texto del semáforo, ya resuelto por `resolveSyncBadge` (no el estado crudo de la máquina). */
  statusText: string;
  /** ¿Hay sincronización configurada? Decide si se pinta la conexión o el desconectar. */
  hasConfig: boolean;
  /** Gist conectado, ya resuelto entre el recién conectado y el de la configuración vigente. */
  connectedGistId: string;
  /** Campo «Token» del modo manual. */
  token: string;
  /** Campo «Gist ID» del modo manual. */
  gistId: string;
  /** Último error de sincronización, o cadena vacía. */
  errorMessage: string;
  recoveringGistId: boolean;
  /** ¿Hay OAuth de GitHub en este build? Sin ella el modo manual es el único camino y se muestra desplegado. */
  oauthEnabled: boolean;
  oauthLoggingIn: boolean;
  onOAuthLogin: () => void;
  onTokenChange: (value: string) => void;
  onGistIdChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onCopyGistId: () => void;
  onRecoverGistId: () => void;
}

/**
 * `null` = nadie ha montado el proveedor. No es un caso de error: hace que la tarjeta se pueda pedir desde
 * cualquier pantalla sin obligar a todas las pruebas de componente a montar `App` entera; quien la pide decide
 * qué pintar mientras no haya conexión (la pasarela social, por ejemplo, vuelve a su botón de siempre).
 */
const GithubConnectionContext = createContext<GithubConnection | null>(null);

export const GithubConnectionProvider = GithubConnectionContext.Provider;

/** La conexión con GitHub que ofrece la aplicación, o `null` si esta parte del árbol no la tiene. */
export function useGithubConnection(): GithubConnection | null {
  return useContext(GithubConnectionContext);
}
