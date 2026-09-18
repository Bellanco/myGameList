import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { GithubSyncCard } from '../../src/view/components/sync/GithubSyncCard';
import type { GithubConnection } from '../../src/viewmodel/sync/githubConnection';
import { SETTINGS_UI } from '../../src/core/constants/settingsLabels';

/**
 * LA TARJETA DE CONEXIÓN CON GITHUB, que ahora pintan DOS pantallas: Integración y la pasarela del hub social.
 *
 * Lo que se fija aquí es el contrato que hace que compartirla sea seguro: que las dos variantes lleven al MISMO
 * sitio —autorizar en GitHub— y que se diferencien solo en lo que se decidió que las diferenciara: en Ajustes, la
 * tarjeta completa, que es la pantalla donde se ADMINISTRA la sincronización (semáforo, gist, modo manual con su
 * token, desconectar); en la pasarela social, un botón a secas, igual que el de Google, porque ahí solo se viene
 * a darse de alta. Sin esto, la versión de social podía quedarse atrás en cualquier retoque de la de Ajustes, que
 * es justo lo que se ha venido a evitar.
 */
function conexion(overrides: Partial<GithubConnection> = {}): GithubConnection {
  return {
    statusText: 'No sincronizado',
    hasConfig: false,
    connectedGistId: '',
    token: '',
    gistId: '',
    errorMessage: '',
    recoveringGistId: false,
    oauthEnabled: true,
    oauthLoggingIn: false,
    onOAuthLogin: vi.fn(),
    onTokenChange: vi.fn(),
    onGistIdChange: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onCopyGistId: vi.fn(),
    onRecoverGistId: vi.fn(),
    ...overrides,
  };
}

describe('GithubSyncCard', () => {
  it('las dos variantes conectan con GitHub por el mismo sitio', () => {
    const { unmount } = render(<GithubSyncCard connection={conexion()} variant="settings" />);
    expect(screen.getByText(SETTINGS_UI.sync.oauthConnectBtn)).toBeInTheDocument();
    unmount();

    render(<GithubSyncCard connection={conexion()} variant="gateway" />);
    expect(screen.getByText(SETTINGS_UI.sync.oauthConnectBtn)).toBeInTheDocument();
  });

  /**
   * EL PASO 1, IGUAL QUE EL PASO 2. En la pasarela social conectar es un gesto —autorizar en GitHub—, y tiene que
   * verse como el de Google: un botón. La tarjeta entera contaba una tercera historia (un semáforo, un gist, un
   * campo llamado «Token») justo delante del primero de los dos pasos.
   */
  it('en la pasarela es UN botón, con las clases que le pasa la pantalla', () => {
    const conn = conexion();
    const { container } = render(
      <GithubSyncCard connection={conn} variant="gateway" ctaClassName="btn hub-gateway-btn-primary" />,
    );

    const boton = screen.getByRole('button', { name: SETTINGS_UI.sync.oauthConnectBtn });
    expect(boton).toHaveClass('hub-gateway-btn-primary');

    // NADA MÁS. Ni tarjeta, ni título, ni semáforo, ni token, ni la puerta al modo manual: el paso 1 es un gesto,
    // como el de Google, y cualquier cosa delante cuenta una historia que aquí no toca.
    expect(container.querySelector('.sync-card')).toBeNull();
    expect(container.querySelector('.sync-state')).toBeNull();
    expect(screen.queryByText(SETTINGS_UI.sync.title)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(SETTINGS_UI.sync.tokenLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(SETTINGS_UI.sync.manualToggleShow)).not.toBeInTheDocument();

    fireEvent.click(boton);
    expect(conn.onOAuthLogin).toHaveBeenCalled();
  });

  /**
   * SIN OAUTH EN EL BUILD, LA PASARELA NO PINTA NADA. Lo único que quedaría por ofrecer es pegar un token a mano,
   * que es justo lo que no debe salir ahí; la pantalla enseña entonces su propio camino a Integración, que es
   * donde ese modo se explica. Devolver la tarjeta completa sería colar el formulario por la puerta de atrás.
   */
  it('en la pasarela sin OAuth no se pinta nada', () => {
    const { container } = render(<GithubSyncCard connection={conexion({ oauthEnabled: false })} variant="gateway" />);

    expect(container).toBeEmptyDOMElement();
  });

  // El error de la autorización SÍ se queda: es la única forma de enterarse de que no salió bien.
  it('en la pasarela, el error de la conexión se sigue viendo', () => {
    render(<GithubSyncCard connection={conexion({ errorMessage: 'No se pudo obtener el token' })} variant="gateway" />);

    expect(screen.getByText('No se pudo obtener el token')).toBeInTheDocument();
  });

  it('en Ajustes el modo manual llega plegado y despliega los dos campos', () => {
    const conn = conexion();
    render(<GithubSyncCard connection={conn} variant="settings" />);

    // Plegado: con OAuth disponible, el token es la opción avanzada y no lo primero que se ve.
    expect(screen.queryByLabelText(SETTINGS_UI.sync.tokenLabel)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(SETTINGS_UI.sync.manualToggleShow));

    fireEvent.change(screen.getByLabelText(SETTINGS_UI.sync.tokenLabel), { target: { value: 'ghp_x' } });
    fireEvent.change(screen.getByLabelText(SETTINGS_UI.sync.gistLabel), { target: { value: 'gist-1' } });
    fireEvent.click(screen.getByRole('button', { name: SETTINGS_UI.sync.connectBtn }));

    expect(conn.onTokenChange).toHaveBeenCalledWith('ghp_x');
    expect(conn.onGistIdChange).toHaveBeenCalledWith('gist-1');
    expect(conn.onConnect).toHaveBeenCalled();
  });

  // Sin OAuth en el build no hay atajo que ofrecer: el modo manual es el único camino y va a la vista.
  it('sin OAuth configurada, el modo manual se muestra desplegado', () => {
    render(<GithubSyncCard connection={conexion({ oauthEnabled: false })} variant="settings" />);

    expect(screen.queryByText(SETTINGS_UI.sync.oauthConnectBtn)).not.toBeInTheDocument();
    expect(screen.getByLabelText(SETTINGS_UI.sync.tokenLabel)).toBeInTheDocument();
  });

  /**
   * DESCONECTAR SOLO DONDE SE ADMINISTRA LA CUENTA. En la pasarela la tarjeta está para entrar; el botón que tira
   * abajo la sincronización de toda la aplicación no puede estar en mitad del camino de alta.
   */
  it('solo Ajustes ofrece desconectar', () => {
    const conectada = { hasConfig: true, connectedGistId: 'gist-1' };
    const { unmount } = render(<GithubSyncCard connection={conexion(conectada)} variant="settings" />);
    expect(screen.getByText(SETTINGS_UI.sync.disconnectBtn)).toBeInTheDocument();
    unmount();

    render(<GithubSyncCard connection={conexion(conectada)} variant="gateway" />);
    expect(screen.queryByText(SETTINGS_UI.sync.disconnectBtn)).not.toBeInTheDocument();
  });

  it('el semáforo dice si hay sincronización y el gist conectado se puede copiar', () => {
    const conn = conexion({ hasConfig: true, connectedGistId: 'gist-1', statusText: 'Sincronizado' });
    const { container } = render(<GithubSyncCard connection={conn} variant="settings" />);

    expect(container.querySelector('.sync-state.is-on')).not.toBeNull();
    fireEvent.click(screen.getByLabelText(SETTINGS_UI.sync.copyAriaLabel));
    expect(conn.onCopyGistId).toHaveBeenCalled();
  });
});
