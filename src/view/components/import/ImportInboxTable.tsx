import { Fragment } from 'react';
import { TAB_IDS, type TabId } from '../../../model/types/game';
import type { ImportedGame } from '../../../model/types/import';
import { TAB_TITLES, TAB_TOOLTIPS, UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS, TAB_ICONS } from '../../../core/constants/icons';
import { Icon } from '../Icon';

const M = UI_MESSAGES.import.inbox;

// Color de la píldora de "ya en tus listas" según la lista, con los mismos colores que los listados.
const LIST_CHIP_CLASS: Record<TabId, string> = { c: 'chip-list-c', v: 'chip-list-v', e: 'chip-list-e', p: 'chip-list-p' };

interface ImportInboxTableProps {
  items: ImportedGame[];
  isInLists: (name: string) => boolean;
  /** ¿En qué lista está el juego? (para mostrarlo junto a la marca "Ya en tus listas"). null si no está. */
  listOf: (name: string) => TabId | null;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onClassify: (item: ImportedGame, tab: TabId) => void;
  onEnrich: (item: ImportedGame) => void;
  onDiscard: (id: number) => void;
  /** Copia el nombre del juego al portapapeles (al pulsar sobre él). */
  onCopyName: (name: string) => void;
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
 * Tabla de la Bandeja de importados. Reutiliza las clases visuales de `GameTable`, incluida su vista
 * móvil: en pantallas estrechas solo se muestra la PRIMERA columna, así que el checkbox, el nombre y un
 * `row-meta` (plataforma/género en mini-píldoras) van todos en ella. El `.table-wrap` es un contenedor
 * `gamelist` para que el revelado progresivo del meta funcione igual que en el listado principal.
 * El detalle está siempre abierto y contiene solo los botones (clasificar/actualizar + descartar).
 */
export function ImportInboxTable({ items, isInLists, listOf, selectedIds, onToggleSelect, onClassify, onEnrich, onDiscard, onCopyName }: ImportInboxTableProps) {
  return (
    <div className="table-wrap import-inbox">
      <table>
        <thead>
          <tr>
            <th>{M.game}</th>
            <th>{UI_MESSAGES.detail.platforms}</th>
            <th>{UI_MESSAGES.detail.genres}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const existing = isInLists(item.name);
            const inListTab = existing ? listOf(item.name) : null;
            return (
              <Fragment key={item.id}>
                <tr className={`main-row ${index % 2 === 0 ? 'striped' : ''}`.trim()}>
                  <td>
                    <div className="import-name-cell">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        aria-label={M.selectRowAria(item.name)}
                        onChange={() => onToggleSelect(item.id)}
                      />
                      <span className="row-toggle-body">
                        <span className="import-name-line">
                          <button
                            type="button"
                            className="row-name row-name-copy"
                            title={M.copyNameAria(item.name)}
                            aria-label={M.copyNameAria(item.name)}
                            onClick={() => onCopyName(item.name)}
                          >
                            <strong>{item.name}</strong>
                          </button>
                          {existing ? (
                            <span className="chip chip-more" title={M.existingBadge}>
                              {M.existingBadge}
                            </span>
                          ) : null}
                          {inListTab ? (
                            <span className={`chip ${LIST_CHIP_CLASS[inListTab]}`} title={TAB_TITLES[inListTab]}>
                              {TAB_TOOLTIPS[inListTab]}
                            </span>
                          ) : null}
                        </span>
                        {/* Meta para móvil/tablet (oculto en escritorio; ahí se ven las columnas). */}
                        <span className="row-meta" aria-hidden="true">
                          {item.platforms.map((p) => (
                            <span key={`p-${p}`} className="row-meta-item rm-plat">
                              {p}
                            </span>
                          ))}
                          {item.genres.map((g) => (
                            <span key={`g-${g}`} className="row-meta-item rm-genre">
                              {g}
                            </span>
                          ))}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>{chips(item.platforms, 'chip-plat')}</td>
                  <td>{chips(item.genres, 'chip-genre')}</td>
                </tr>

                <tr className="detail-row open">
                  <td colSpan={3} style={{ padding: 0 }}>
                    <div className="detail-content">
                      <div className="detail-actions" style={{ gridColumn: '1 / -1' }}>
                        {existing ? (
                          <button type="button" className="btn btn-secondary" title={M.enrichHint} onClick={() => onEnrich(item)}>
                            <Icon name={COMMON_ICONS.edit} />
                            <span>{M.enrich}</span>
                          </button>
                        ) : (
                          TAB_IDS.map((tab) => {
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
                          })
                        )}
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
