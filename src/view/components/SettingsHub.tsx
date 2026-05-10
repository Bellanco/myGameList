import { memo, useMemo, useState } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES, VALIDATION_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';

type AdminCategoryKey = 'genres' | 'platforms' | 'strengths' | 'weaknesses';

interface SettingsHubProps {
  syncStatus: string;
  hasSyncConfig: boolean;
  connectedGistId: string;
  token: string;
  gistId: string;
  syncError: string;
  recoveringGistId: boolean;
  onTokenChange: (value: string) => void;
  onGistIdChange: (value: string) => void;
  onConnectSync: () => void;
  onSyncNow: () => void;
  onDisconnectSync: () => void;
  onCopyGistId: () => void;
  onRecoverGistId: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  lookups: {
    genres: string[];
    platforms: string[];
    strengths: string[];
    weaknesses: string[];
  };
  onEditTag: (key: AdminCategoryKey, oldValue: string, newValue: string) => void;
  onDeleteTag: (key: AdminCategoryKey, value: string) => void;
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
  onTokenChange,
  onGistIdChange,
  onConnectSync,
  onSyncNow,
  onDisconnectSync,
  onCopyGistId,
  onRecoverGistId,
  onExport,
  onImport,
  lookups,
  onEditTag,
  onDeleteTag,
}: SettingsHubProps) {
  const [showToken, setShowToken] = useState(false);
  const [openSections, setOpenSections] = useState<Record<AdminCategoryKey, boolean>>({
    genres: true,
    platforms: false,
    strengths: false,
    weaknesses: false,
  });
  const [editingTag, setEditingTag] = useState<{ key: AdminCategoryKey; value: string } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [mergePending, setMergePending] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);

  const categories = useMemo(
    () =>
      [
        { key: 'genres' as const, label: UI_MESSAGES.settings.admin.genres, values: lookups.genres },
        { key: 'platforms' as const, label: UI_MESSAGES.settings.admin.platforms, values: lookups.platforms },
        { key: 'strengths' as const, label: UI_MESSAGES.settings.admin.strengths, values: lookups.strengths },
        { key: 'weaknesses' as const, label: UI_MESSAGES.settings.admin.weaknesses, values: lookups.weaknesses },
      ],
    [lookups.genres, lookups.platforms, lookups.strengths, lookups.weaknesses],
  );

  const configuredGistId = connectedGistId || gistId;

  const toggleCategory = (key: AdminCategoryKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    <section className="settings-hub" aria-label={UI_MESSAGES.settings.title}>
      <div className="settings-card settings-card-status">
        <h2>{UI_MESSAGES.settings.sync.title}</h2>
        <p>
          {UI_MESSAGES.settings.sync.status}: <strong>{syncStatus}</strong>
        </p>


        {/* Si hay sync activa, solo mostrar el estado y gist conectado. Si no, mostrar los campos de configuración */}
        {hasSyncConfig && configuredGistId ? (
          <div className="sync-help">{UI_MESSAGES.settings.sync.gistConnectedPrefix}: {configuredGistId}</div>
        ) : null}

        {!hasSyncConfig && (
          <>
            <div className="sync-help">
              <strong>{UI_MESSAGES.settings.sync.helpGithubTitle}</strong>
              <br />
              {UI_MESSAGES.settings.sync.helpGithubBody}
            </div>
            <div className="sync-help">
              <strong>{UI_MESSAGES.settings.sync.helpConfigTitle}</strong>
              <br />
              {UI_MESSAGES.settings.sync.helpConfigBody}
            </div>

            <div className="fg">
              <label htmlFor="settings-sync-token" className="flabel">
                {UI_MESSAGES.settings.sync.tokenLabel}
              </label>
              <div className="token-row">
                <input
                  id="settings-sync-token"
                  className="finput"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(event) => onTokenChange(event.target.value)}
                  placeholder={UI_MESSAGES.settings.sync.tokenPlaceholder}
                />
                <button className="token-toggle" type="button" onClick={() => setShowToken((prev) => !prev)}>
                  <Icon name={showToken ? COMMON_ICONS.eyeOff : COMMON_ICONS.eye} />
                </button>
              </div>
            </div>

            <div className="fg">
              <label htmlFor="settings-sync-gist" className="flabel">
                {UI_MESSAGES.settings.sync.gistLabel}
              </label>
              <div className="sync-gist-row">
                <input
                  id="settings-sync-gist"
                  className="finput"
                  value={gistId}
                  onChange={(event) => onGistIdChange(event.target.value)}
                  placeholder={UI_MESSAGES.settings.sync.gistPlaceholder}
                />
                <div className="sync-gist-actions">
                  <button
                    className="sync-gist-action"
                    type="button"
                    aria-label={UI_MESSAGES.settings.sync.copyAriaLabel}
                    title={UI_MESSAGES.settings.sync.copyBtn}
                    onClick={onCopyGistId}
                    disabled={!gistId}
                  >
                    <Icon name={COMMON_ICONS.syncCopy} />
                  </button>
                  <button
                    className="sync-gist-action"
                    type="button"
                    aria-label={UI_MESSAGES.settings.sync.recoverAriaLabel}
                    title={recoveringGistId ? UI_MESSAGES.settings.sync.recoveringBtn : UI_MESSAGES.settings.sync.recoverBtn}
                    onClick={onRecoverGistId}
                    disabled={recoveringGistId}
                  >
                    <Icon name={COMMON_ICONS.googleRecover} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {syncError ? <div className="sync-status-msg err">{syncError}</div> : null}

        <div className="settings-actions">
          {!hasSyncConfig ? (
            <button className="btn btn-steam" type="button" onClick={onConnectSync}>
              <Icon name="cloud-sync" />
              <span>{UI_MESSAGES.settings.sync.connectBtn}</span>
            </button>
          ) : (
            <>
              <button className="btn btn-steam" type="button" onClick={onSyncNow}>
                <Icon name={COMMON_ICONS.refresh} />
                <span>{UI_MESSAGES.settings.sync.syncBtn}</span>
              </button>
              <button className="btn btn-danger" type="button" onClick={onDisconnectSync}>
                <Icon name={COMMON_ICONS.close} />
                <span>{UI_MESSAGES.settings.sync.disconnectBtn}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h2>{UI_MESSAGES.settings.backup.title}</h2>
        <p>{UI_MESSAGES.settings.backup.description}</p>
        <div className="settings-actions">
          <button className="btn btn-secondary" type="button" onClick={onExport}>
            <Icon name={COMMON_ICONS.download} />
            <span>{UI_MESSAGES.settings.backup.exportBtn}</span>
          </button>
          <label className="btn btn-secondary settings-import-label">
            <Icon name={COMMON_ICONS.upload} />
            <span>{UI_MESSAGES.settings.backup.importBtn}</span>
            <input
              type="file"
              accept=".json"
              className="input-hidden"
              aria-label={UI_MESSAGES.settings.backup.importAriaLabel}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="settings-card settings-card-admin">
        <h2>{UI_MESSAGES.settings.admin.title}</h2>
        <p>{UI_MESSAGES.settings.admin.description}</p>

        {adminNotice ? <div className={`admin-warning show ${adminNotice.kind}`}>{adminNotice.message}</div> : null}

        <div className="settings-admin-categories">
          {categories.map((category) => {
            const isOpen = openSections[category.key];

            return (
              <section key={category.key} className="settings-admin-category">
                <button
                  className="settings-admin-toggle"
                  type="button"
                  onClick={() => toggleCategory(category.key)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? UI_MESSAGES.settings.admin.collapseAria : UI_MESSAGES.settings.admin.expandAria}
                >
                  <strong>{category.label}</strong>
                  <Icon name={COMMON_ICONS.keyboardArrowUp} className={`ui-icon settings-admin-arrow ${isOpen ? 'open' : ''}`} />
                </button>

                {isOpen ? (
                  <div className="fg">
                    {category.values.length ? (
                      category.values.map((tag) => {
                        const isEditing = editingTag?.key === category.key && editingTag?.value === tag;

                        return (
                          <div key={`${category.key}-${tag}`} className={`admin-item ${isEditing ? 'editing' : ''}`}>
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
                                    saveEdit(category.key, tag, category.values);
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
                                    onClick={() => saveEdit(category.key, tag, category.values)}
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
                                    onClick={() => startEdit(category.key, tag)}
                                  >
                                    <Icon name={COMMON_ICONS.edit} />
                                    <span>{UI_MESSAGES.admin.editBtn}</span>
                                  </button>
                                  <button
                                    className="btn btn-danger btn-icon-text admin-action-btn"
                                    type="button"
                                    onClick={() => onDeleteTag(category.key, tag)}
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
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
});
