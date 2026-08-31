import { memo, useMemo, useState } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES, VALIDATION_MESSAGES } from '../../core/constants/labels';
import { SETTINGS_UI } from '../../core/constants/settingsLabels';
import { Icon } from './Icon';
import { PlayniteNote } from './import/PlayniteNote';

type AdminCategoryKey = 'genres' | 'platforms' | 'strengths' | 'weaknesses';

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
  lookups: {
    genres: string[];
    platforms: string[];
    strengths: string[];
    weaknesses: string[];
  };
  onEditTag: (key: AdminCategoryKey, oldValue: string, newValue: string) => void;
  onDeleteTag: (key: AdminCategoryKey, value: string) => void;
  /** Archivo JSON de «Playnite Library Exporter»: App lo parsea, lo mete en la bandeja y avisa. */
  onImportLibrary: (file: File) => void;
  /** Nº de juegos esperando en la bandeja (el acceso solo se ofrece si hay alguno). */
  inboxCount: number;
  onOpenInbox: () => void;
}

/**
 * Hub de ajustes con acciones de mantenimiento y sincronizacion.
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
  lookups,
  onEditTag,
  onDeleteTag,
  onImportLibrary,
  inboxCount,
  onOpenInbox,
}: SettingsHubProps) {
  const [showToken, setShowToken] = useState(false);
  const [showConfigHelp, setShowConfigHelp] = useState(false);
  // El manual de Playnite llega plegado: son cinco pasos que solo hacen falta la primera vez, y esta pantalla
  // ya es larga. La nota de arriba basta para saber qué hace la importación.
  const [showImportSteps, setShowImportSteps] = useState(false);
  // Con OAuth disponible, el modo manual (PAT) queda plegado como opción avanzada; sin OAuth, se muestra siempre.
  const [showManual, setShowManual] = useState(false);
  const manualVisible = !githubOAuthEnabled || showManual;
  const [activeAdminCategory, setActiveAdminCategory] = useState<AdminCategoryKey>('genres');
  const [editingTag, setEditingTag] = useState<{ key: AdminCategoryKey; value: string } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [mergePending, setMergePending] = useState(false);
  const [overwriteImport, setOverwriteImport] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);

  const categories = useMemo(
    () =>
      [
        { key: 'genres' as const, label: SETTINGS_UI.admin.genres, values: lookups.genres },
        { key: 'platforms' as const, label: SETTINGS_UI.admin.platforms, values: lookups.platforms },
        { key: 'strengths' as const, label: SETTINGS_UI.admin.strengths, values: lookups.strengths },
        { key: 'weaknesses' as const, label: SETTINGS_UI.admin.weaknesses, values: lookups.weaknesses },
      ],
    [lookups.genres, lookups.platforms, lookups.strengths, lookups.weaknesses],
  );

  const configuredGistId = connectedGistId || gistId;
  const activeCategory = categories.find((category) => category.key === activeAdminCategory) ?? categories[0];

  const startEdit = (key: AdminCategoryKey, value: string) => {
    setEditingTag({ key, value });
    setDraftValue(value);
    setMergePending(false);
    setAdminNotice(null);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setDraftValue('');
    setMergePending(false);
  };

  const saveEdit = (key: AdminCategoryKey, sourceValue: string, list: string[]) => {
    const nextValue = draftValue.trim();
    if (!nextValue || nextValue.toLowerCase() === sourceValue.toLowerCase()) {
      cancelEdit();
      return;
    }

    const duplicate = list.find((tag) => tag.toLowerCase() === nextValue.toLowerCase());
    if (duplicate && !mergePending) {
      setMergePending(true);
      setAdminNotice({ kind: 'warn', message: VALIDATION_MESSAGES.tagExists });
      return;
    }

    onEditTag(key, sourceValue, nextValue);
    setAdminNotice({
      kind: 'ok',
      message: duplicate ? VALIDATION_MESSAGES.tagMerged : VALIDATION_MESSAGES.tagUpdated,
    });
    cancelEdit();
  };

  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.title}>
      {/* Importación de la biblioteca. Vivía en una pantalla aparte (`/integraciones`) a la que esta tarjeta solo
          sabía navegar; ahora la acción está donde se busca, con su manual al lado. */}
      <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
        <div className="settings-card-head">
          <h2>{IMPORT_UI.title}</h2>
          <PlayniteNote />
        </div>
        <div className="settings-backup-info">
          <button
            type="button"
            className="import-guide-link"
            aria-expanded={showImportSteps}
            onClick={() => setShowImportSteps((prev) => !prev)}
          >
            {IMPORT_UI.stepsTitle}
          </button>
          {showImportSteps ? (
            <ol className="settings-card-note import-steps">
              {IMPORT_UI.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
        <div className="settings-backup-actions import-integrations-actions">
          {inboxCount > 0 ? (
            <button type="button" className="btn btn-secondary btn-accent" onClick={onOpenInbox}>
              <Icon name={COMMON_ICONS.download} />
              <span>{IMPORT_UI.viewInbox(inboxCount)}</span>
            </button>
          ) : null}
          <label className="btn btn-primary settings-import-label">
            <Icon name={COMMON_ICONS.upload} />
            <span>{IMPORT_UI.importBtn}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="input-hidden"
              aria-label={IMPORT_UI.importAria}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportLibrary(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="settings-card settings-card-status">
        <h2>{SETTINGS_UI.sync.title}</h2>
        <p>
          {SETTINGS_UI.sync.status}: <strong>{syncStatus}</strong>
        </p>
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
            <div className="sync-help">
              <strong>{SETTINGS_UI.sync.helpGithubTitle}</strong>
              <br />
              {SETTINGS_UI.sync.helpGithubBody}
            </div>

            {githubOAuthEnabled && (
              <>
                <div className="sync-help">{SETTINGS_UI.sync.oauthHelpBody}</div>
                <div className="settings-actions">
                  <button
                    className="btn btn-steam btn-connect"
                    type="button"
                    onClick={onGithubLogin}
                    disabled={githubLoggingIn}
                    style={{ marginRight: 'auto' }}
                  >
                    <Icon name="cloud-sync" />
                    <span className="btn-label">
                      {githubLoggingIn ? SETTINGS_UI.sync.oauthConnectingBtn : SETTINGS_UI.sync.oauthConnectBtn}
                    </span>
                  </button>
                </div>
                <div className="sync-help-actions">
                  <button
                    className="sync-help-toggle"
                    type="button"
                    onClick={() => setShowManual((prev) => !prev)}
                    aria-expanded={showManual}
                  >
                    {showManual ? SETTINGS_UI.sync.manualToggleHide : SETTINGS_UI.sync.manualToggleShow}
                  </button>
                </div>
              </>
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
        <div className="settings-card-head">
          <h2>{SETTINGS_UI.backup.title}</h2>
          <p className="settings-card-note">{SETTINGS_UI.backup.note}</p>
        </div>

        <div className="settings-backup-row">
          <div className="settings-backup-info">
            <p>{SETTINGS_UI.backup.description}</p>
          </div>

          <div className="settings-backup-actions">
            <button className="btn btn-secondary" type="button" onClick={onExport}>
              <Icon name={COMMON_ICONS.download} />
              <span>{SETTINGS_UI.backup.exportBtn}</span>
            </button>
            <label className="btn btn-secondary settings-import-label">
              <Icon name={COMMON_ICONS.upload} />
              <span>{SETTINGS_UI.backup.importBtn}</span>
              <input
                type="file"
                accept=".json"
                className="input-hidden"
                aria-label={SETTINGS_UI.backup.importAriaLabel}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImport(file, overwriteImport);
                  event.currentTarget.value = '';
                }}
              />
            </label>
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

        <div className="settings-backup-warning">
          {SETTINGS_UI.backup.overwriteHint}
        </div>
      </div>

      <div className="settings-card settings-card-admin">
        <h2>{SETTINGS_UI.admin.title}</h2>
        <p>{SETTINGS_UI.admin.description}</p>

        {adminNotice ? <div className={`admin-warning show ${adminNotice.kind}`}>{adminNotice.message}</div> : null}

        <div className="settings-admin-tabs" role="tablist" aria-label={SETTINGS_UI.admin.title}>
          {categories.map((category) => (
            <button
              key={category.key}
              className={`settings-admin-tab ${activeAdminCategory === category.key ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeAdminCategory === category.key}
              onClick={() => {
                setActiveAdminCategory(category.key);
                cancelEdit();
              }}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="fg">
          {activeCategory.values.length ? (
            activeCategory.values.map((tag) => {
              const isEditing = editingTag?.key === activeCategory.key && editingTag?.value === tag;

              return (
                <div key={`${activeCategory.key}-${tag}`} className={`admin-item ${isEditing ? 'editing' : ''}`}>
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        className={`finput ${mergePending ? 'has-warning' : ''}`.trim()}
                        value={draftValue}
                        placeholder={UI_MESSAGES.admin.editPlaceholder}
                        onChange={(event) => setDraftValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          saveEdit(activeCategory.key, tag, activeCategory.values);
                        }}
                      />
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon-text admin-action-btn" type="button" onClick={cancelEdit}>
                          <Icon name={COMMON_ICONS.close} />
                          <span>{UI_MESSAGES.admin.editCancelBtn}</span>
                        </button>
                        <button
                          className="btn btn-steam btn-icon-text admin-action-btn"
                          type="button"
                          onClick={() => saveEdit(activeCategory.key, tag, activeCategory.values)}
                        >
                          <Icon name={COMMON_ICONS.save} />
                          <span>{UI_MESSAGES.admin.editSaveBtn}</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="admin-item-name">{tag}</span>
                      <div className="row-actions">
                        <button
                          className="btn btn-secondary btn-icon-text admin-action-btn"
                          type="button"
                          onClick={() => startEdit(activeCategory.key, tag)}
                        >
                          <Icon name={COMMON_ICONS.edit} />
                          <span>{UI_MESSAGES.admin.editBtn}</span>
                        </button>
                        <button
                          className="btn btn-danger btn-icon-text admin-action-btn"
                          type="button"
                          onClick={() => onDeleteTag(activeCategory.key, tag)}
                        >
                          <Icon name={COMMON_ICONS.trash} />
                          <span>{UI_MESSAGES.admin.deleteBtn}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <span className="settings-admin-empty">{UI_MESSAGES.admin.noTags}</span>
          )}
        </div>
      </div>
    </section>
  );
});
