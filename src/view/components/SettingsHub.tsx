import { memo, useState } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { SETTINGS_UI } from '../../core/constants/settingsLabels';
import { FilePickerButton } from './FilePickerButton';
import { Icon } from './Icon';
import { PlayniteNote } from './import/PlayniteNote';
import { ImportGuides } from './import/ImportGuides';
// La hoja de las pantallas de Ajustes viaja en los chunks perezosos que la usan y no en el bundle base (mismo
// patrón que `stats.scss` y `social.scss`). Se importa desde CADA pantalla que la necesita: si se importara solo
// desde una, entrar por otra ruta la dejaría sin estilo.
import '../../styles/settings.scss';

const IMPORT_UI = UI_MESSAGES.import.integrations;

interface SettingsHubProps {
  syncStatus: string;
  hasSyncConfig: boolean;
  connectedGistId: string;
  token: string;
  gistId: string;
  syncError: string;
  recoveringGistId: boolean;
  githubOAuthEnabled: boolean;
  githubLoggingIn: boolean;
  onGithubLogin: () => void;
  onTokenChange: (value: string) => void;
  onGistIdChange: (value: string) => void;
  onConnectSync: () => void;
  onSyncNow: () => void;
  onDisconnectSync: () => void;
  onCopyGistId: () => void;
  onRecoverGistId: () => void;
  onExport: () => void;
  onImport: (file: File, overwrite: boolean) => void;
  /** Archivo JSON de «Playnite Library Exporter»: App lo parsea, lo mete en la bandeja y avisa. */
  onImportLibrary: (file: File) => void;
  /** Nº de juegos esperando en la bandeja (el acceso solo se ofrece si hay alguno). */
  inboxCount: number;
  onOpenInbox: () => void;
}

/**
 * «Integración» — todo lo que entra y sale de la aplicación: la sincronización con GitHub, la importación de
 * la biblioteca y las copias de seguridad.
 *
 * Aquí vivió también el editor de etiquetas, y compartir componente salía caro por los dos lados: esta
 * pantalla cargaba con aquel editor y la de filtros arrastraba todo esto —veinte props incluidas— sin usar
 * nada. Separadas, el chunk de cada una trae solo lo que pinta.
 */
export const SettingsHub = memo(function SettingsHub({
  syncStatus,
  hasSyncConfig,
  connectedGistId,
  token,
  gistId,
  syncError,
  recoveringGistId,
  githubOAuthEnabled,
  githubLoggingIn,
  onGithubLogin,
  onTokenChange,
  onGistIdChange,
  onConnectSync,
  onSyncNow: _onSyncNow,
  onDisconnectSync,
  onCopyGistId,
  onRecoverGistId,
  onExport,
  onImport,
  onImportLibrary,
  inboxCount,
  onOpenInbox,
}: SettingsHubProps) {
  const [showToken, setShowToken] = useState(false);
  const [showConfigHelp, setShowConfigHelp] = useState(false);
  /** «¿Qué es GitHub Gist?»: la explicación, plegada, para que el botón de conectar quede el primero. */
  const [showWhatIsGist, setShowWhatIsGist] = useState(false);
  // Con OAuth disponible, el modo manual (PAT) queda plegado como opción avanzada; sin OAuth, se muestra siempre.
  const [showManual, setShowManual] = useState(false);
  const manualVisible = !githubOAuthEnabled || showManual;
  const [overwriteImport, setOverwriteImport] = useState(false);

  const configuredGistId = connectedGistId || gistId;
  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.groups.integration.title}>
      {/* Importación de la biblioteca. Vivía en una pantalla aparte (`/integraciones`) a la que esta tarjeta solo
          sabía navegar; ahora la acción está donde se busca, con su manual al lado. */}
      {/* PRIMERO QUÉ HACE Y EL BOTÓN; el detalle, debajo. Antes esta tarjeta abría con cinco frases seguidas y
          el botón quedaba al final: para importar había que atravesar el muro, y quien ya sabía lo que quería
          lo atravesaba cada vez. */}
      {/* EL ORDEN ES EL DE QUIEN NO SABE TODAVÍA: qué hace esto, qué necesitas, de dónde lo trae, cómo se hace
          y —al final— el botón. Puesto arriba, el botón pedía elegir un fichero a quien aún no sabía qué fichero
          era ni de dónde salía; lo que se gana leyendo primero no lo compensa un clic ahorrado. */}
      <div className="settings-card settings-card-import" style={{ gridColumn: '1 / -1' }}>
        <h2>{IMPORT_UI.title}</h2>
        <p className="settings-card-sub">{IMPORT_UI.note}</p>

        <PlayniteNote />

        <ImportGuides />

        <div className="settings-actions-lead settings-actions-end">
          <FilePickerButton
            id="import-library-settings"
            className="btn btn-primary"
            label={IMPORT_UI.importBtn}
            ariaLabel={IMPORT_UI.importAria}
            accept=".json,application/json"
            onPick={onImportLibrary}
          />
          {inboxCount > 0 ? (
            <button type="button" className="btn btn-secondary btn-accent" onClick={onOpenInbox}>
              <Icon name={COMMON_ICONS.download} />
              <span>{IMPORT_UI.viewInbox(inboxCount)}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="settings-card settings-card-status">
        <div className="settings-card-head settings-card-head-row">
          <h2>{SETTINGS_UI.sync.title}</h2>
          {/* EL ESTADO, CON FORMA DE ESTADO. Era una línea de texto corrida —«Estado actual: No sincronizado»—
              perdida entre dos párrafos de ayuda, y es lo primero que se viene a mirar a esta pantalla. */}
          <p className={`sync-state ${hasSyncConfig ? 'is-on' : 'is-off'}`}>
            <span className="sync-state-dot" aria-hidden="true" />
            <span className="sr-only">{SETTINGS_UI.sync.status}: </span>
            {syncStatus}
          </p>
        </div>
        {hasSyncConfig && configuredGistId ? (
          <div className="sync-help">
            {SETTINGS_UI.sync.gistConnectedPrefix}: {configuredGistId}
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

        {!hasSyncConfig && (
          <>
            {/* EL BOTÓN PRIMERO. Aquí se llega a conectar, y antes había que bajar por dos cajas de ayuda —qué
                es un Gist, cómo funciona la conexión— para encontrarlo. La explicación sigue estando, debajo y
                plegada: quien la necesita la abre una vez y quien no, no la vuelve a ver. */}
            {githubOAuthEnabled && (
              <>
                <div className="settings-actions-lead">
                  <button
                    className="btn btn-steam btn-connect"
                    type="button"
                    onClick={onGithubLogin}
                    disabled={githubLoggingIn}
                  >
                    <Icon name="cloud-sync" />
                    <span className="btn-label">
                      {githubLoggingIn ? SETTINGS_UI.sync.oauthConnectingBtn : SETTINGS_UI.sync.oauthConnectBtn}
                    </span>
                  </button>
                  <button
                    className="sync-help-toggle"
                    type="button"
                    onClick={() => setShowManual((prev) => !prev)}
                    aria-expanded={showManual}
                  >
                    {showManual ? SETTINGS_UI.sync.manualToggleHide : SETTINGS_UI.sync.manualToggleShow}
                  </button>
                </div>
                <button
                  type="button"
                  className="import-guide-link"
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
            {!githubOAuthEnabled && (
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
              <label htmlFor="settings-sync-token" className="flabel">
                {SETTINGS_UI.sync.tokenLabel}
              </label>
              <div className="token-row">
                <input
                  id="settings-sync-token"
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
              <label htmlFor="settings-sync-gist" className="flabel">
                {SETTINGS_UI.sync.gistLabel}
              </label>
              <div className="sync-gist-row">
                <input
                  id="settings-sync-gist"
                  className="finput"
                  value={gistId}
                  onChange={(event) => onGistIdChange(event.target.value)}
                  placeholder={SETTINGS_UI.sync.gistPlaceholder}
                />
              </div>
            </div>

            <div className="settings-actions settings-actions-row">
              <button
                className="btn btn-steam btn-connect"
                type="button"
                onClick={onConnectSync}
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
                <span className="btn-label desktop-only">{recoveringGistId ? SETTINGS_UI.sync.recoveringBtn : SETTINGS_UI.sync.recoverBtn}</span>
              </button>
            </div>
            </>
            )}
          </>
        )}

        {syncError ? <div className="sync-status-msg err">{syncError}</div> : null}

        {hasSyncConfig && (
          <div className="settings-actions">
            <button className="btn btn-danger" type="button" onClick={onDisconnectSync}>
              <Icon name={COMMON_ICONS.close} />
              <span>{SETTINGS_UI.sync.disconnectBtn}</span>
            </button>
          </div>
        )}
      </div>

      <div className="settings-card settings-card-backup">
        <h2>{SETTINGS_UI.backup.title}</h2>
        <p className="settings-card-sub">{SETTINGS_UI.backup.description}</p>

        <div className="settings-backup-row">

          <div className="settings-backup-actions">
            <button className="btn btn-secondary" type="button" onClick={onExport}>
              <Icon name={COMMON_ICONS.download} />
              <span>{SETTINGS_UI.backup.exportBtn}</span>
            </button>
            <FilePickerButton
              id="import-backup-settings"
              className="btn btn-secondary"
              label={SETTINGS_UI.backup.importBtn}
              ariaLabel={SETTINGS_UI.backup.importAriaLabel}
              accept=".json"
              onPick={(file) => onImport(file, overwriteImport)}
            />
          </div>
        </div>

        <label className="settings-backup-toggle">
          <input
            type="checkbox"
            checked={overwriteImport}
            onChange={(event) => setOverwriteImport(event.target.checked)}
          />
          <span className="settings-backup-toggle-track">
            <span className="settings-backup-toggle-thumb" />
          </span>
          <span className="settings-backup-toggle-label">
            {SETTINGS_UI.backup.overwriteLabel}
          </span>
        </label>

        {/* El aviso solo cuando el interruptor está puesto: enseñarlo siempre gasta sitio y asusta a quien
            solo venía a exportar. Cuando se enciende, es exactamente lo que hay que leer. */}
        {overwriteImport ? (
          <div className="settings-backup-warning">
            {SETTINGS_UI.backup.overwriteHint}
          </div>
        ) : null}
      </div>


    </section>
  );
});
