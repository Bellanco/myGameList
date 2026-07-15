import type { CSSProperties } from 'react';
import { TAB_IDS, type TabId } from '../../../model/types/game';
import type { ImportedGame } from '../../../model/types/import';
import { TAB_TOOLTIPS, UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS, TAB_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';

const M = UI_MESSAGES.import.inbox;

interface InboxScreenProps {
  imported: ImportedGame[];
  onClassify: (item: ImportedGame, tab: TabId) => void;
  onDiscard: (id: number) => void;
  onClear: () => void;
  onGoIntegrations: () => void;
}

// Layout mínimo en línea (evita SCSS nuevo); los tokens visuales (chips/botones) reutilizan clases existentes.
// Ojo: NO usar `.settings-hub` como contenedor de la lista (es un grid multi-columna que la descoloca).
const styles: Record<string, CSSProperties> = {
  screen: { display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '72rem', margin: '0 auto' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' },
  main: { display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '12rem', flex: '1 1 16rem' },
  name: { fontWeight: 600 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '0.3rem' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' },
  label: { fontSize: '0.8rem', opacity: 0.7 },
};

function GameRow({
  item,
  onClassify,
  onDiscard,
}: {
  item: ImportedGame;
  onClassify: InboxScreenProps['onClassify'];
  onDiscard: InboxScreenProps['onDiscard'];
}) {
  return (
    <li className="settings-card" style={styles.row}>
      <div style={styles.main}>
        <span style={styles.name}>{item.name}</span>
        <div style={styles.tags}>
          {item.platforms.map((p) => (
            <span key={`p-${p}`} className="chip-plat">
              {p}
            </span>
          ))}
          {item.genres.map((g) => (
            <span key={`g-${g}`} className="chip-genre">
              {g}
            </span>
          ))}
        </div>
      </div>
      <div style={styles.actions}>
        <span style={styles.label}>{M.classifyTo}:</span>
        {TAB_IDS.map((tab) => {
          const suggested = item.suggestedTab === tab;
          return (
            <button
              key={tab}
              type="button"
              className={`btn btn-secondary ${suggested ? 'active' : ''}`.trim()}
              title={`${TAB_TOOLTIPS[tab]}${suggested ? ` (${M.suggested})` : ''}`}
              onClick={() => onClassify(item, tab)}
            >
              <Icon name={TAB_ICONS[tab]} />
              <span>{TAB_TOOLTIPS[tab]}</span>
            </button>
          );
        })}
        <button type="button" className="btn btn-secondary" onClick={() => onDiscard(item.id)}>
          <Icon name={COMMON_ICONS.trash} />
          <span>{M.discard}</span>
        </button>
      </div>
    </li>
  );
}

/** Pantalla de la Bandeja: secciones "Nuevos" / "Ya en tus listas"; clasificar/descartar por item. */
export function InboxScreen({ imported, onClassify, onDiscard, onClear, onGoIntegrations }: InboxScreenProps) {
  const fresh = imported.filter((g) => !g.existsInLists);
  const existing = imported.filter((g) => g.existsInLists);

  if (imported.length === 0) {
    return (
      <div style={styles.screen}>
        <div className="settings-card">
          <div className="settings-card-head">
            <h2>{M.title}</h2>
            <p className="settings-card-note">{M.empty}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onGoIntegrations}>
            <Icon name={COMMON_ICONS.upload} />
            <span>{M.goIntegrations}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <div className="settings-card">
        <div className="settings-card-head" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2>{M.title}</h2>
            <p className="settings-card-note">{M.note}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClear}>
            <Icon name={COMMON_ICONS.trash} />
            <span>{M.clear}</span>
          </button>
        </div>
      </div>

      {fresh.length > 0 ? (
        <section>
          <h3 className="settings-card-note" style={{ margin: '0.5rem 0' }}>{M.sectionNew} ({fresh.length})</h3>
          <ul style={styles.list}>
            {fresh.map((item) => (
              <GameRow key={item.id} item={item} onClassify={onClassify} onDiscard={onDiscard} />
            ))}
          </ul>
        </section>
      ) : null}

      {existing.length > 0 ? (
        <section>
          <h3 className="settings-card-note" style={{ margin: '0.5rem 0' }}>{M.sectionExisting} ({existing.length})</h3>
          <ul style={styles.list}>
            {existing.map((item) => (
              <GameRow key={item.id} item={item} onClassify={onClassify} onDiscard={onDiscard} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
