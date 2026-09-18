import { memo, useState } from 'react';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import type { GithubConnection } from '../../../viewmodel/sync/githubConnection';
import { Icon } from '../Icon';
// La hoja de la tarjeta viaja CON LA TARJETA y no con la pantalla que la pinta: la montan dos chunks perezosos
// distintos (Integración y el hub social), así que una regla metida en la hoja de uno dejaría al otro sin
// estilo. Ver la cabecera de `sync-card.scss`.
import '../../../styles/sync-card.scss';

/**
 * Dónde se está pintando la tarjeta. No es un tema ni un tamaño: cambia cuánto se enseña y con qué armazón.
 *
 *  - `settings`: la tarjeta completa, dentro de la rejilla de Ajustes. Es la pantalla donde se ADMINISTRA la
 *    sincronización, así que enseña el semáforo, el gist conectado y el botón de desconectar.
 *  - `gateway`: la pasarela del hub social, donde solo se viene a DARSE DE ALTA. Un botón y nada más —el mismo
 *    que el de Google—, con el modo manual detrás de un enlace discreto.
 */
export type GithubSyncCardVariant = 'settings' | 'gateway';

export interface GithubSyncCardProps {
  connection: GithubConnection;
  variant?: GithubSyncCardVariant;
  /**
   * Clases del botón de conectar. Lo decide la PANTALLA, no la tarjeta, y es lo que hace que en la pasarela
   * «Conectar con GitHub» sea exactamente el mismo botón que «Continuar con Google»: mismo tamaño, mismo peso y
   * mismo sitio. Si la tarjeta lo impusiera, el primer paso tendría un aspecto y el segundo otro.
   */
  ctaClassName?: string;
}

/**
 * LA CONEXIÓN CON GITHUB, en una tarjeta que se puede pedir desde cualquier pantalla.
 *
 * Estaba escrita dentro de `SettingsHub`, que es la única pantalla que la pintaba, y por eso la pasarela del hub
 * social no tenía más remedio que mandar a Ajustes a quien quisiera crear su cuenta —y no había camino de vuelta—.
 * Aquí dentro está todo lo que hace falta para conectar: el semáforo, el botón de OAuth, el modo manual (token +
 * gist) plegado como opción avanzada y las ayudas.
 *
 * COMPONENTE PRESENTACIONAL PURO: la conexión entra por props ({@link GithubConnection}), nunca de un hook propio.
 * Quien la pinta la saca de `useGithubConnection()`, que es lo que permite que el viewmodel de sincronización siga
 * siendo uno solo, montado en `App`.
 */
export const GithubSyncCard = memo(function GithubSyncCard({
  connection,
  variant = 'settings',
  ctaClassName = 'btn btn-steam btn-connect',
}: GithubSyncCardProps) {
  const {
    statusText,
    hasConfig,
    connectedGistId,
    token,
    gistId,
    errorMessage,
    recoveringGistId,
    oauthEnabled,
    oauthLoggingIn,
    onOAuthLogin,
    onTokenChange,
    onGistIdChange,
    onConnect,
    onDisconnect,
    onCopyGistId,
    onRecoverGistId,
  } = connection;

  const [showToken, setShowToken] = useState(false);
  const [showConfigHelp, setShowConfigHelp] = useState(false);
  /** «¿Qué es GitHub Gist?»: la explicación, plegada, para que el botón de conectar quede el primero. */
  const [showWhatIsGist, setShowWhatIsGist] = useState(false);
  // Con OAuth disponible, el modo manual (PAT) queda plegado como opción avanzada; sin OAuth, se muestra siempre.
  const [showManual, setShowManual] = useState(false);
  const manualVisible = !oauthEnabled || showManual;

  const isGateway = variant === 'gateway';
  // Los identificadores de los campos llevan la variante: hoy solo los pinta Ajustes, pero un `id` repetido rompe
  // en silencio la asociación con su `<label>` en cuanto dos tarjetas coincidan en una pantalla.
  const tokenFieldId = `sync-token-${variant}`;
  const gistFieldId = `sync-gist-${variant}`;

  /** El botón que de verdad conecta. Uno solo, compartido por el modo sencillo y por la tarjeta completa. */
  const botonOAuth = (
    <button
      className={ctaClassName}
      type="button"
      onClick={onOAuthLogin}
      disabled={oauthLoggingIn}
    >
      <Icon name="cloud-sync" />
      <span className="btn-label">
        {oauthLoggingIn ? SETTINGS_UI.sync.oauthConnectingBtn : SETTINGS_UI.sync.oauthConnectBtn}
      </span>
    </button>
  );

  /** La puerta al modo manual, solo en Ajustes (ver la nota de la variante `gateway`). */
  const enlaceManual = (
    <button
      className="sync-help-toggle"
      type="button"
      onClick={() => setShowManual((prev) => !prev)}
      aria-expanded={showManual}
    >
      {showManual ? SETTINGS_UI.sync.manualToggleHide : SETTINGS_UI.sync.manualToggleShow}
    </button>
  );

  /**
   * LA PASARELA: UN BOTÓN, COMO EL DE GOOGLE. Ni tarjeta, ni título, ni semáforo, ni token. Dar de alta el
   * espacio social son dos gestos —autorizar en GitHub y entrar con Google—, y cualquier cosa que se ponga
   * delante del primero cuenta una tercera historia: qué es un gist, qué es un token personal, qué permisos
   * lleva. Eso es una pantalla de configuración, y esa pantalla ya existe: Integración.
   *
   * El error sí se queda: es la única forma de enterarse de que la autorización no salió bien.
   *
   * Y si en este build no hay OAuth, aquí no hay nada que ofrecer: el único camino sería el token a mano, que es
   * justo lo que no debe salir. Se devuelve `null` y la pantalla enseña su propio camino a Ajustes, que es donde
   * ese modo vive (ver `showSyncCard` en `SocialHub`).
   */
  if (isGateway) {
    if (!oauthEnabled || hasConfig) return null;
    return (
      <div className="sync-card-simple">
        {botonOAuth}
        {errorMessage ? <div className="sync-status-msg err">{errorMessage}</div> : null}
      </div>
    );
  }

  return (
    <div className="settings-card settings-card-status">
      <div className="sync-card-head">
        <h2>{SETTINGS_UI.sync.title}</h2>
        {/* EL ESTADO, CON FORMA DE ESTADO. Era una línea de texto corrida —«Estado actual: No sincronizado»—
            perdida entre dos párrafos de ayuda, y es lo primero que se viene a mirar a esta pantalla. */}
        <p className={`sync-state ${hasConfig ? 'is-on' : 'is-off'}`}>
          <span className="sync-state-dot" aria-hidden="true" />
          <span className="sr-only">{SETTINGS_UI.sync.status}: </span>
          {statusText}
        </p>
      </div>

      {hasConfig && connectedGistId ? (
        <div className="sync-help">
          {SETTINGS_UI.sync.gistConnectedPrefix}: {connectedGistId}
          <button
            className="sync-gist-action"
            type="button"
            aria-label={SETTINGS_UI.sync.copyAriaLabel}
            title={SETTINGS_UI.sync.copyBtn}
            onClick={onCopyGistId}
            style={{ marginLeft: '0.5rem' }}
          >
            <Icon name={COMMON_ICONS.syncCopy} />
          </button>
        </div>
      ) : null}

      {!hasConfig && (
        <>
          {/* EL BOTÓN PRIMERO. Aquí se llega a conectar, y antes había que bajar por dos cajas de ayuda —qué
              es un Gist, cómo funciona la conexión— para encontrarlo. La explicación sigue estando, debajo y
              plegada: quien la necesita la abre una vez y quien no, no la vuelve a ver. */}
          {oauthEnabled && (
            <>
              <div className="sync-card-lead">
                {botonOAuth}
                {enlaceManual}
              </div>
              <button
                type="button"
                className="sync-card-link"
                aria-expanded={showWhatIsGist}
                onClick={() => setShowWhatIsGist((prev) => !prev)}
              >
                {SETTINGS_UI.sync.helpGithubTitle}
              </button>
              {showWhatIsGist ? (
                <div className="sync-help">
                  {SETTINGS_UI.sync.helpGithubBody}
                  <br />
                  {SETTINGS_UI.sync.oauthHelpBody}
                </div>
              ) : null}
            </>
          )}

          {/* Sin OAuth disponible no hay atajo que ofrecer, así que la explicación va a la vista: el modo
              manual es el único camino y hay que saber qué se está montando. */}
          {!oauthEnabled && (
            <div className="sync-help">
              <strong>{SETTINGS_UI.sync.helpGithubTitle}</strong>
              <br />
              {SETTINGS_UI.sync.helpGithubBody}
            </div>
          )}

          {manualVisible && (
            <>
              <div className="sync-help">
                <strong>{SETTINGS_UI.sync.helpConfigTitle}</strong>
                <br />
                {SETTINGS_UI.sync.helpConfigBody}
                <br />
                <a
                  href={SETTINGS_UI.sync.helpConfigLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {SETTINGS_UI.sync.helpConfigLinkLabel}
                </a>
                <div className="sync-help-actions">
                  <button
                    className="sync-help-toggle"
                    type="button"
                    onClick={() => setShowConfigHelp((prev) => !prev)}
                    aria-expanded={showConfigHelp}
                  >
                    {showConfigHelp ? SETTINGS_UI.sync.helpConfigCollapse : SETTINGS_UI.sync.helpConfigExpand}
                  </button>
                </div>
                {showConfigHelp ? (
                  <ol>
                    <li>{SETTINGS_UI.sync.helpConfigStep1}</li>
                    <li>{SETTINGS_UI.sync.helpConfigStep2}</li>
                    <li>{SETTINGS_UI.sync.helpConfigStep3}</li>
                    <li>{SETTINGS_UI.sync.helpConfigStep4}</li>
                    <li>{SETTINGS_UI.sync.helpConfigStep5}</li>
                    <li>{SETTINGS_UI.sync.helpConfigStep6}</li>
                    <li>{SETTINGS_UI.sync.helpConfigStep7}</li>
                  </ol>
                ) : null}
              </div>

              <div className="fg">
                <label htmlFor={tokenFieldId} className="flabel">
                  {SETTINGS_UI.sync.tokenLabel}
                </label>
                <div className="token-row">
                  <input
                    id={tokenFieldId}
                    className="finput"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(event) => onTokenChange(event.target.value)}
                    placeholder={SETTINGS_UI.sync.tokenPlaceholder}
                  />
                  <button
                    className="token-toggle"
                    type="button"
                    aria-label={SETTINGS_UI.sync.tokenToggle(showToken)}
                    title={SETTINGS_UI.sync.tokenToggle(showToken)}
                    aria-pressed={showToken}
                    onClick={() => setShowToken((prev) => !prev)}
                  >
                    <Icon name={showToken ? COMMON_ICONS.eyeOff : COMMON_ICONS.eye} />
                  </button>
                </div>
              </div>

              <div className="fg">
                <label htmlFor={gistFieldId} className="flabel">
                  {SETTINGS_UI.sync.gistLabel}
                </label>
                <div className="sync-gist-row">
                  <input
                    id={gistFieldId}
                    className="finput"
                    value={gistId}
                    onChange={(event) => onGistIdChange(event.target.value)}
                    placeholder={SETTINGS_UI.sync.gistPlaceholder}
                  />
                </div>
              </div>

              <div className="sync-card-actions sync-card-actions-row">
                <button
                  className="btn btn-steam btn-connect"
                  type="button"
                  onClick={onConnect}
                  style={{ marginRight: 'auto' }}
                >
                  <Icon name="cloud-sync" />
                  <span className="btn-label desktop-only">{SETTINGS_UI.sync.connectBtn}</span>
                </button>
                <button
                  className="btn btn-secondary btn-recover"
                  type="button"
                  onClick={onRecoverGistId}
                  disabled={recoveringGistId}
                  style={{ marginLeft: 'auto' }}
                >
                  <Icon name={COMMON_ICONS.googleRecover} />
                  <span className="btn-label desktop-only">
                    {recoveringGistId ? SETTINGS_UI.sync.recoveringBtn : SETTINGS_UI.sync.recoverBtn}
                  </span>
                </button>
              </div>
            </>
          )}
        </>
      )}

      {errorMessage ? <div className="sync-status-msg err">{errorMessage}</div> : null}

      {/* DESCONECTAR SOLO DONDE SE ADMINISTRA LA CUENTA, que es esta pantalla: en la pasarela social no se llega
          a pintar la tarjeta, y ofrecer allí el botón que tira abajo la sincronización de toda la aplicación
          sería poner la salida de emergencia en mitad del camino de entrada. */}
      {hasConfig && (
        <div className="sync-card-actions">
          <button className="btn btn-danger" type="button" onClick={onDisconnect}>
            <Icon name={COMMON_ICONS.close} />
            <span>{SETTINGS_UI.sync.disconnectBtn}</span>
          </button>
        </div>
      )}
    </div>
  );
});
