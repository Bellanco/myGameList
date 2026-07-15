import { type CSSProperties, useMemo, useState } from 'react';
import type { TabId } from '../../../model/types/game';
import type { ImportedGame } from '../../../model/types/import';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';
import { ImportInboxTable } from './ImportInboxTable';

const M = UI_MESSAGES.import.inbox;

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  width: '100%',
  maxWidth: '72rem',
  margin: '0 auto',
};

const toolbarStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' };
const selectAllStyle: CSSProperties = { display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' };

interface InboxScreenProps {
  imported: ImportedGame[];
  onClassify: (item: ImportedGame, tab: TabId) => void;
  onDiscard: (id: number) => void;
  onDiscardMany: (ids: number[]) => void;
  onClear: () => void;
  onGoIntegrations: () => void;
}

/** Pantalla de la Bandeja: mismo aspecto que los listados (ImportInboxTable) + multiselección y borrado en lote. */
export function InboxScreen({ imported, onClassify, onDiscard, onDiscardMany, onClear, onGoIntegrations }: InboxScreenProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const selectedCount = useMemo(() => imported.filter((g) => selectedIds.has(g.id)).length, [imported, selectedIds]);
  const allSelected = imported.length > 0 && selectedCount === imported.length;

  if (imported.length === 0) {
    return (
      <div style={screenStyle}>
        <div className="settings-card">
          <div className="settings-card-head">
            <h2>{M.title}</h2>
            <p className="settings-card-note">{M.empty}</p>
          </div>
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={onGoIntegrations}>
            <Icon name={COMMON_ICONS.upload} />
            <span>{M.goIntegrations}</span>
          </button>
        </div>
      </div>
    );
  }

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(imported.map((g) => g.id)));

  const deleteSelected = () => {
    const ids = imported.filter((g) => selectedIds.has(g.id)).map((g) => g.id);
    if (ids.length === 0) return;
    onDiscardMany(ids);
    setSelectedIds(new Set());
  };

  return (
    <div style={screenStyle}>
      <div className="settings-card">
        <div className="settings-card-head">
          <h2>{M.title}</h2>
          <p className="settings-card-note">{M.note}</p>
        </div>
        <div style={toolbarStyle}>
          <label style={selectAllStyle}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={M.selectAll} />
            <span>{M.selectAll}</span>
          </label>
          {selectedCount > 0 ? <span className="settings-card-note">{M.selectedCount(selectedCount)}</span> : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-danger" onClick={deleteSelected} disabled={selectedCount === 0}>
            <Icon name={COMMON_ICONS.trash} />
            <span>{M.deleteSelected}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClear}>
            <Icon name={COMMON_ICONS.trash} />
            <span>{M.clear}</span>
          </button>
        </div>
      </div>

      <ImportInboxTable
        items={imported}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onClassify={onClassify}
        onDiscard={onDiscard}
      />
    </div>
  );
}
