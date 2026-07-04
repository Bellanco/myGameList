import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { COMMON_ICONS, TAB_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import type { GameItem, TabId } from '../../model/types/game';
import type { TabAction } from '../../viewmodel/useGameListViewModel';
import { Icon } from './Icon';
import { StarRating } from './StarRating';

interface GameTableProps {
  games: GameItem[];
  currentTab: TabId;
  expandedId: number | null;
  onExpandedChange: (id: number | null) => void;
  onEdit: (tab: TabId, id: number) => void;
  onDelete: (tab: TabId, id: number) => void;
  onMigrate: (tab: TabId, id: number, target: TabId) => void;
  onAddGame?: () => void;
  tabActions: TabAction[];
  readOnly?: boolean;
  /** Id del juego recién guardado (añadido/editado): su fila destella brevemente para localizar el cambio. */
  recentlyChangedId?: number | null;
  visibility?: {
    showYears?: boolean;
    showReplayable?: boolean;
    showRetry?: boolean;
    showHours?: boolean;
  };
}

interface VirtualRow {
  type: 'main' | 'detail';
  gameId: number;
  index: number;
}

function renderTags(values: string[], className: string, maxVisible?: number) {
  if (!values.length) return <span>—</span>;
  const overflow = maxVisible && values.length > maxVisible ? values.length - maxVisible : 0;
  const visible = overflow ? values.slice(0, maxVisible) : values;
  return (
    <div className="chips">
      {visible.map((value) => (
        <span key={value} className={`chip ${className}`}>
          {value}
        </span>
      ))}
      {overflow ? (
        <span className="chip chip-more" title={values.slice(maxVisible).join(', ')}>
          {UI_MESSAGES.table.moreCount(overflow)}
        </span>
      ) : null}
    </div>
  );
}

/* Meta compacto (móvil/tablet): primer valor de una categoría + recuento "+N". */
function metaValue(values?: string[]) {
  if (!values?.length) return null;
  const extra = values.length - 1;
  return (
    <>
      {values[0]}
      {extra > 0 ? <span className="rm-more">{UI_MESSAGES.table.moreCount(extra)}</span> : null}
    </>
  );
}

const MAX_ROW_CHIPS = 3;

// Clase por columna en Completados (c): controla ancho por importancia y permite ocultar
// progresivamente las columnas menos importantes en escritorio estrecho (ver _table.scss).
const C_COLUMN_CLASS: Record<string, string> = {
  Juego: 'col-c-name',
  Puntuación: 'col-c-score',
  Plataformas: 'col-c-plat',
  Géneros: 'col-c-genre',
  Año: 'col-c-year',
  Rejugar: 'col-c-replay',
  'Puntos fuertes': 'col-c-strong',
  'Puntos débiles': 'col-c-weak',
};

function renderBooleanBadge(type: 'replayable' | 'retry', value: boolean) {
  if (type === 'replayable') {
    const label = value ? 'Rejugar: Sí' : 'Rejugar: No';
    return (
      <span className={value ? 'badge-rejugar-activo' : 'badge-rejugar-inactivo'} aria-label={label} title={label}>
        <Icon name={value ? COMMON_ICONS.star : COMMON_ICONS.lock} />
      </span>
    );
  }

  const label = value ? 'Dar otra oportunidad: Sí' : 'Dar otra oportunidad: No';
  return (
    <span className={value ? 'badge-opp-activo' : 'badge-opp-inactivo'} aria-label={label} title={label}>
      <Icon name={value ? COMMON_ICONS.refresh : COMMON_ICONS.lock} />
    </span>
  );
}

export const GameTable = memo(function GameTable({
  games,
  currentTab,
  expandedId,
  onExpandedChange,
  onEdit,
  onDelete,
  onMigrate,
  onAddGame,
  tabActions,
  readOnly = false,
  visibility,
  recentlyChangedId = null,
}: GameTableProps) {
  const showYears = visibility?.showYears ?? true;
  const showReplayable = visibility?.showReplayable ?? true;
  const showRetry = visibility?.showRetry ?? true;
  const showHours = visibility?.showHours ?? true;

  // Clase de columna de Completados, solo cuando la pestaña es 'c' (las celdas plat/género/score
  // se comparten con otras pestañas, que no llevan estas clases de peso/ocultación).
  const cCol = (cls: string | undefined) => (currentTab === 'c' ? cls : undefined);

  const getTableHeaders = (): string[] => {
    if (currentTab === 'c') {
      return [
        'Juego',
        ...(showYears ? ['Año'] : []),
        'Plataformas',
        'Géneros',
        'Puntos fuertes',
        'Puntos débiles',
        'Puntuación',
        ...(showReplayable ? ['Rejugar'] : []),
      ];
    }
    if (currentTab === 'v') {
      return [
        'Juego',
        'Plataformas',
        'Géneros',
        'Puntos fuertes',
        'Puntos débiles',
        ...(showRetry ? ['Dar otra oportunidad'] : []),
      ];
    }
    if (currentTab === 'e') return ['Juego', 'Plataformas', 'Géneros', 'Puntos fuertes', 'Puntos débiles'];
    return ['Juego', 'Plataformas', 'Géneros', 'Interés'];
  };

  const supportsReview = (tab: TabId) => tab !== 'p';
  const getColSpan = (tab: TabId) => {
    if (tab === 'c') return 6 + (showYears ? 1 : 0) + (showReplayable ? 1 : 0);
    if (tab === 'v') return 5 + (showRetry ? 1 : 0);
    if (tab === 'e') return 5;
    return 4;
  };

  // Create virtual rows (main + optionally detail rows)
  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = [];
    games.forEach((game, index) => {
      rows.push({ type: 'main', gameId: game.id, index });
      if (expandedId === game.id) {
        rows.push({ type: 'detail', gameId: game.id, index });
      }
    });
    return rows;
  }, [games, expandedId]);

  const parentRef = useRef<HTMLDivElement>(null);

  // En móvil/tablet (≤1400px) `.table-wrap` se declara `overflow:visible`: quien scrollea es la
  // ventana, no este contenedor. El virtualizador de elemento necesita un scroll-container propio;
  // apuntado a un elemento no-scrollable sus medidas dependen del motor (Chromium reporta la altura
  // completa y pinta todo; Firefox deja un spacer final que infla el contenedor). Por eso solo
  // virtualizamos cuando `.table-wrap` es realmente scrollable; si scrollea la página, render plano.
  const [pageScrolls, setPageScrolls] = useState(false);
  useLayoutEffect(() => {
    const update = () => {
      const el = parentRef.current;
      if (el) setPageScrolls(getComputedStyle(el).overflowY === 'visible');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const virtualize = !pageScrolls;

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    measureElement: (element) => element.getBoundingClientRect().height,
    estimateSize: (index) => {
      const row = virtualRows[index];
      return row?.type === 'detail' ? 320 : 50;
    },
    overscan: 5,
  });

  const virtualRowEntries = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const topSpacerHeight = virtualRowEntries.length > 0 ? virtualRowEntries[0].start : 0;
  const bottomSpacerHeight =
    virtualRowEntries.length > 0 ? totalSize - virtualRowEntries[virtualRowEntries.length - 1].end : 0;
  const fallbackToFullRender =
    !virtualize || (games.length > 0 && virtualRows.length > 0 && virtualRowEntries.length === 0);
  const rowIndexesToRender = fallbackToFullRender
    ? virtualRows.map((_, index) => index)
    : virtualRowEntries.map((entry) => entry.index);

  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  return (
    <div className="table-wrap" ref={parentRef}>
      <table>
        <thead>
          <tr>
            {getTableHeaders().map((header) => {
              const tip =
                header === 'Rejugar'
                  ? UI_MESSAGES.table.replayHeaderTip
                  : header === 'Dar otra oportunidad'
                    ? UI_MESSAGES.table.retryHeaderTip
                    : undefined;
              return (
                <th key={header} title={tip} className={cCol(C_COLUMN_CLASS[header])}>
                  {header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {!games.length ? (
            <tr>
              <td colSpan={getColSpan(currentTab)} className="table-empty-cell">
                <div className="table-empty">
                  <svg className="table-empty-icon" aria-hidden="true">
                    <use href={`#icon-${TAB_ICONS[currentTab]}`} />
                  </svg>
                  <p className="table-empty-title">{UI_MESSAGES.table.emptyTitle}</p>
                  {!readOnly && onAddGame ? (
                    <button type="button" className="btn btn-primary" onClick={onAddGame}>
                      <Icon name={COMMON_ICONS.plus} />
                      <span>{UI_MESSAGES.table.emptyCta}</span>
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : (
            <>
              {topSpacerHeight > 0 && !fallbackToFullRender ? (
                <tr aria-hidden="true">
                  <td colSpan={getColSpan(currentTab)} style={{ height: `${topSpacerHeight}px`, padding: 0, border: 0 }} />
                </tr>
              ) : null}
              {rowIndexesToRender.map((rowIndex) => {
                const row = virtualRows[rowIndex];
                const game = gameMap.get(row.gameId);
                if (!game) return null;

                if (row.type === 'main') {
                  const expanded = expandedId === game.id;
                  const detailId = `game-detail-${game.id}`;
                  return (
                    <tr
                      key={`main-${game.id}`}
                      data-index={rowIndex}
                      ref={virtualize ? virtualizer.measureElement : undefined}
                      className={`main-row ${row.index % 2 === 0 ? 'striped' : ''} ${game.id === recentlyChangedId ? 'just-changed' : ''}`.trim()}
                      // A11y-2: el disparador accesible es el botón de la 1ª celda (anunciado como botón + aria-controls).
                      // La fila conserva click/doble-click como atajos de RATÓN, pero ya no es un control focusable.
                      onClick={() => onExpandedChange(expanded ? null : game.id)}
                      onDoubleClick={() => {
                        if (!readOnly) {
                          onEdit(currentTab, game.id);
                        }
                      }}
                    >
                      <td className={cCol('col-c-name')}>
                        <button
                          type="button"
                          className="row-toggle"
                          aria-expanded={expanded}
                          aria-controls={detailId}
                          aria-label={UI_MESSAGES.table.rowDetailsAria(expanded, game.name)}
                          onClick={(event) => {
                            event.stopPropagation();
                            onExpandedChange(expanded ? null : game.id);
                          }}
                        >
                          <span className="row-chevron" aria-hidden="true" />
                          <span className="row-toggle-body">
                            <strong className="row-name">{game.name}</strong>
                            {/* Meta compacto solo en vista colapsada (móvil/tablet); revela categorías
                                según el ancho disponible vía container queries. aria-hidden: la info ya
                                está en las columnas/detalle y el botón anuncia el nombre. */}
                            <span className="row-meta" aria-hidden="true">
                              {(currentTab === 'c' || currentTab === 'p') && (game.score ?? 0) > 0 ? (
                                <span className="row-meta-item rm-score">
                                  <StarRating value={game.score || 0} />
                                </span>
                              ) : null}
                              {game.platforms?.length ? (
                                <span className="row-meta-item rm-plat">{metaValue(game.platforms)}</span>
                              ) : null}
                              {game.genres?.length ? (
                                <span className="row-meta-item rm-genre">{metaValue(game.genres)}</span>
                              ) : null}
                              {currentTab === 'c' && showYears && game.years?.length ? (
                                <span className="row-meta-item rm-year">{metaValue(game.years.map(String))}</span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </td>
                      {currentTab === 'c' && showYears ? <td className="col-c-year">{renderTags(game.years?.map(String) || [], 'chip-generic', MAX_ROW_CHIPS)}</td> : null}
                      <td className={cCol('col-c-plat')}>{renderTags(game.platforms, 'chip-plat', MAX_ROW_CHIPS)}</td>
                      <td className={cCol('col-c-genre')}>{renderTags(game.genres, 'chip-genre', MAX_ROW_CHIPS)}</td>
                      {(currentTab === 'c' || currentTab === 'v' || currentTab === 'e') ? (
                        <td className={cCol('col-c-strong')}>{renderTags(game.strengths || [], 'chip-pf', MAX_ROW_CHIPS)}</td>
                      ) : null}
                      {(currentTab === 'c' || currentTab === 'e') ? (
                        <td className={cCol('col-c-weak')}>{renderTags(game.weaknesses || [], 'chip-pd', MAX_ROW_CHIPS)}</td>
                      ) : null}
                      {currentTab === 'v' ? <td>{renderTags(game.reasons || [], 'chip-pd', MAX_ROW_CHIPS)}</td> : null}
                      {(currentTab === 'c' || currentTab === 'p') ? <td className={cCol('col-c-score')}><StarRating value={game.score || 0} /></td> : null}
                      {currentTab === 'c' && showReplayable ? <td className="col-c-replay">{renderBooleanBadge('replayable', Boolean(game.replayable))}</td> : null}
                      {currentTab === 'v' && showRetry ? <td>{renderBooleanBadge('retry', Boolean(game.retry))}</td> : null}
                    </tr>
                  );
                }

                const reviewLines = game.review ? game.review.split('\n') : [];

                return (
                  <tr key={`detail-${game.id}`} id={`game-detail-${game.id}`} data-index={rowIndex} ref={virtualize ? virtualizer.measureElement : undefined} className="detail-row open">
                    <td colSpan={getColSpan(currentTab)} style={{ padding: 0 }}>
                      <div className="detail-content">
                        <div className="detail-box">
                          <span className="detail-label">{UI_MESSAGES.detail.platforms}</span>
                          <div className="chips">
                            {renderTags(game.platforms, 'chip-plat')}
                            {game.steamDeck && (
                              <span className="chip chip-deck">
                                <Icon name={COMMON_ICONS.steamDeck} />
                                <span>{UI_MESSAGES.detail.steamDeck}</span>
                              </span>
                            )}
                          </div>
                          {game.platforms.length === 0 && !game.steamDeck && <span>—</span>}
                        </div>
                        <div className="detail-box">
                          <span className="detail-label">{UI_MESSAGES.detail.genres}</span>
                          <div>{renderTags(game.genres, 'chip-genre')}</div>
                        </div>
                        {currentTab === 'c' && showYears && game.years && game.years.length > 0 && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.yearsCompleted}</span>
                            <div>{renderTags(game.years?.map(String) || [], 'chip-generic')}</div>
                          </div>
                        )}
                        {currentTab === 'c' && showHours && game.hours !== null && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.playtime}</span>
                            <div>{UI_MESSAGES.detail.hoursSuffix(String(game.hours).replace('.', ','))}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'v' || currentTab === 'e') && game.strengths && game.strengths.length > 0 && (
                          <div className="detail-box detail-strong">
                            <span className="detail-label">{UI_MESSAGES.detail.strengths}</span>
                            <div>{renderTags(game.strengths, 'chip-pf')}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'e') && game.weaknesses && game.weaknesses.length > 0 && (
                          <div className="detail-box detail-weak">
                            <span className="detail-label">{UI_MESSAGES.detail.weaknesses}</span>
                            <div>{renderTags(game.weaknesses, 'chip-pd')}</div>
                          </div>
                        )}
                        {currentTab === 'v' && game.reasons && game.reasons.length > 0 && (
                          <div className="detail-box detail-weak">
                            <span className="detail-label">{UI_MESSAGES.detail.weaknesses}</span>
                            <div>{renderTags(game.reasons, 'chip-pd')}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'p') && game.score !== null && (
                          <div className="detail-box">
                            <span className="detail-label">{currentTab === 'p' ? UI_MESSAGES.detail.interest : UI_MESSAGES.detail.score}</span>
                            <div>
                              <StarRating value={Number(game.score || 0)} />
                            </div>
                          </div>
                        )}
                        {currentTab === 'c' && showReplayable && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.replayability}</span>
                            <div>{renderBooleanBadge('replayable', Boolean(game.replayable))}</div>
                          </div>
                        )}
                        {currentTab === 'v' && showRetry && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.retry}</span>
                            <div>{renderBooleanBadge('retry', Boolean(game.retry))}</div>
                          </div>
                        )}
                        {supportsReview(currentTab) && game.review ? (
                          <div className="detail-box" style={{ gridColumn: '1/-1' }}>
                            <span className="detail-label">{UI_MESSAGES.detail.review}</span>
                            <div className="detail-value">
                              {reviewLines.map((line, i) => (
                                <Fragment key={i}>
                                  {line}
                                  {i < reviewLines.length - 1 && <br />}
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {!readOnly ? (
                          <div className="detail-actions">
                            {tabActions.map((action) => (
                              <button
                                key={`${game.id}-${action.target}`}
                                className={`btn ${action.btnCls}`}
                                type="button"
                                title={UI_MESSAGES.table.actionAria(action.label, game.name)}
                                aria-label={UI_MESSAGES.table.actionAria(action.label, game.name)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onMigrate(currentTab, game.id, action.target);
                                }}
                              >
                                <Icon name={action.icon} />
                                <span>{action.label}</span>
                              </button>
                            ))}
                            <button
                              className="btn btn-secondary"
                              type="button"
                              title={UI_MESSAGES.table.editAria(game.name)}
                              aria-label={UI_MESSAGES.table.editAria(game.name)}
                              onClick={(event) => {
                                event.stopPropagation();
                                onEdit(currentTab, game.id);
                              }}
                            >
                              <Icon name={COMMON_ICONS.edit} />
                              <span>{UI_MESSAGES.table.edit}</span>
                            </button>
                            <button
                              className="btn btn-danger"
                              type="button"
                              title={UI_MESSAGES.table.deleteAria(game.name)}
                              aria-label={UI_MESSAGES.table.deleteAria(game.name)}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(currentTab, game.id);
                              }}
                            >
                              <Icon name={COMMON_ICONS.trash} />
                              <span>{UI_MESSAGES.table.delete}</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {bottomSpacerHeight > 0 && !fallbackToFullRender ? (
                <tr aria-hidden="true">
                  <td colSpan={getColSpan(currentTab)} style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 0 }} />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
});
