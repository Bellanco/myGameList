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
  onSyncNow: _onSyncNow,
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
  const [showConfigHelp, setShowConfigHelp] = useState(false);
  const [activeAdminCategory, setActiveAdminCategory] = useState<AdminCategoryKey>('genres');
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
    <section className="settings-hub" aria-label={UI_MESSAGES.settings.title}>
      <div className="settings-card settings-card-status">
        <h2>{UI_MESSAGES.settings.sync.title}</h2>
        <p>
          {UI_MESSAGES.settings.sync.status}: <strong>{syncStatus}</strong>
        </p>
        {hasSyncConfig && configuredGistId ? (
          <div className="sync-help">
            {UI_MESSAGES.settings.sync.gistConnectedPrefix}: {configuredGistId}
            <button
              className="sync-gist-action"
              type="button"
              aria-label={UI_MESSAGES.settings.sync.copyAriaLabel}
              title={UI_MESSAGES.settings.sync.copyBtn}
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
              <strong>{UI_MESSAGES.settings.sync.helpGithubTitle}</strong>
              <br />
              {UI_MESSAGES.settings.sync.helpGithubBody}
            </div>
            <div className="sync-help">
              <strong>{UI_MESSAGES.settings.sync.helpConfigTitle}</strong>
              <br />
              {UI_MESSAGES.settings.sync.helpConfigBody}
              <br />
              <a
                href={UI_MESSAGES.settings.sync.helpConfigLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {UI_MESSAGES.settings.sync.helpConfigLinkLabel}
              </a>
              <div className="sync-help-actions">
                <button
                  className="sync-help-toggle"
                  type="button"
                  onClick={() => setShowConfigHelp((prev) => !prev)}
                  aria-expanded={showConfigHelp}
                >
                  {showConfigHelp ? UI_MESSAGES.settings.sync.helpConfigCollapse : UI_MESSAGES.settings.sync.helpConfigExpand}
                </button>
              </div>
              {showConfigHelp ? (
                <ol>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep1}</li>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep2}</li>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep3}</li>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep4}</li>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep5}</li>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep6}</li>
                  <li>{UI_MESSAGES.settings.sync.helpConfigStep7}</li>
                </ol>
              ) : null}
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
                <span className="btn-label desktop-only">{UI_MESSAGES.settings.sync.connectBtn}</span>
              </button>
              <button
                className="btn btn-secondary btn-recover"
                type="button"
                onClick={onRecoverGistId}
                disabled={recoveringGistId}
                style={{ marginLeft: 'auto' }}
              >
                <Icon name={COMMON_ICONS.googleRecover} />
                <span className="btn-label desktop-only">{recoveringGistId ? UI_MESSAGES.settings.sync.recoveringBtn : UI_MESSAGES.settings.sync.recoverBtn}</span>
              </button>
            </div>
          </>
        )}

        {syncError ? <div className="sync-status-msg err">{syncError}</div> : null}

        {hasSyncConfig && (
          <div className="settings-actions">
            <button className="btn btn-danger" type="button" onClick={onDisconnectSync}>
              <Icon name={COMMON_ICONS.close} />
              <span>{UI_MESSAGES.settings.sync.disconnectBtn}</span>
            </button>
          </div>
        )}
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

        <div className="settings-admin-tabs" role="tablist" aria-label={UI_MESSAGES.settings.admin.title}>
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
