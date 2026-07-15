import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { TabId } from '../../../model/types/game';
import type { ImportedGame } from '../../../model/types/import';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { normalizeName } from '../../../core/roulette/roulette';
import { Icon } from '../Icon';
import { ImportInboxTable } from './ImportInboxTable';

const M = UI_MESSAGES.import.inbox;
const PAGE = 40; // scroll infinito: se renderizan de PAGE en PAGE

const screenStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '72rem', margin: '0 auto' };
const toolbarStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' };
const selectAllStyle: CSSProperties = { display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer' };
const searchStyle: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'inherit',
};

interface InboxScreenProps {
  imported: ImportedGame[];
  isInLists: (name: string) => boolean;
  onClassify: (item: ImportedGame, tab: TabId) => void;
  onEnrich: (item: ImportedGame) => void;
  onDiscard: (id: number) => void;
  onDiscardMany: (ids: number[]) => void;
  onClear: () => void;
  onGoIntegrations: () => void;
}

/** Bandeja: buscador por texto + scroll infinito (render incremental) + multiselección. */
export function InboxScreen({ imported, isInLists, onClassify, onEnrich, onDiscard, onDiscardMany, onClear, onGoIntegrations }: InboxScreenProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return q ? imported.filter((g) => normalizeName(g.name).includes(q)) : imported;
  }, [imported, query]);

  // Reinicia la ventana al buscar (y si mengua la lista).
  useEffect(() => setVisible(PAGE), [query]);

  const shown = filtered.slice(0, visible);

  // Carga más al acercarse al final (IntersectionObserver sobre un centinela).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => (v < filtered.length ? v + PAGE : v));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const selectedCount = useMemo(() => imported.filter((g) => selectedIds.has(g.id)).length, [imported, selectedIds]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((g) => selectedIds.has(g.id));

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

  const toggleAll = () => setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map((g) => g.id)));

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
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label={M.selectAll} />
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
        <p className="settings-card-note" style={{ margin: 0 }}>{M.showing(shown.length, filtered.length)}</p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={M.search}
        aria-label={M.search}
        style={searchStyle}
      />

      <ImportInboxTable
        items={shown}
        isInLists={isInLists}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onClassify={onClassify}
        onEnrich={onEnrich}
        onDiscard={onDiscard}
      />
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
    </div>
  );
}
