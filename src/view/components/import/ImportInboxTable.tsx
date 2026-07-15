import { Fragment } from 'react';
import { TAB_IDS, type TabId } from '../../../model/types/game';
import type { ImportedGame } from '../../../model/types/import';
import { TAB_TOOLTIPS, UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS, TAB_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';

const M = UI_MESSAGES.import.inbox;

interface ImportInboxTableProps {
  items: ImportedGame[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onClassify: (item: ImportedGame, tab: TabId) => void;
  onDiscard: (id: number) => void;
}

function chips(values: string[], className: string) {
  if (!values.length) return <span>—</span>;
  return (
    <div className="chips">
      {values.map((value) => (
        <span key={value} className={`chip ${className}`}>
          {value}
        </span>
      ))}
    </div>
  );
}

/**
 * Tabla de la Bandeja de importados. Reutiliza las MISMAS clases visuales que `GameTable`
 * (table-wrap/main-row/detail-*) para que se vea como los demás listados. El detalle está SIEMPRE
 * abierto en todos los elementos y contiene ÚNICAMENTE los botones (clasificar + descartar).
 * No virtualiza (la bandeja es una zona de paso de tamaño modesto).
 */
export function ImportInboxTable({ items, selectedIds, onToggleSelect, onClassify, onDiscard }: ImportInboxTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="col-select" aria-label={M.selectAll} />
            <th>{M.game}</th>
            <th>{UI_MESSAGES.detail.platforms}</th>
            <th>{UI_MESSAGES.detail.genres}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            return (
              <Fragment key={item.id}>
                <tr className={`main-row ${index % 2 === 0 ? 'striped' : ''}`.trim()}>
                  <td className="col-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      aria-label={M.selectRowAria(item.name)}
                      onChange={() => onToggleSelect(item.id)}
                    />
                  </td>
                  <td>
                    <strong className="row-name">{item.name}</strong>
                    {item.existsInLists ? (
                      <span className="chip chip-more" title={M.existingBadge} style={{ marginLeft: '0.4rem' }}>
                        {M.existingBadge}
                      </span>
                    ) : null}
                  </td>
                  <td>{chips(item.platforms, 'chip-plat')}</td>
                  <td>{chips(item.genres, 'chip-genre')}</td>
                </tr>

                <tr className="detail-row open">
                  <td colSpan={4} style={{ padding: 0 }}>
                    <div className="detail-content">
                      <div className="detail-actions" style={{ gridColumn: '1 / -1' }}>
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
                        <button type="button" className="btn btn-danger" onClick={() => onDiscard(item.id)}>
                          <Icon name={COMMON_ICONS.trash} />
                          <span>{M.discard}</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
