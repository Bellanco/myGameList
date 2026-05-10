import { Fragment, memo, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { COMMON_ICONS } from '../../core/constants/icons';
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
  tabActions: TabAction[];
  readOnly?: boolean;
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

function renderTags(values: string[], className: string) {
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

function renderBooleanBadge(type: 'replayable' | 'retry', value: boolean) {
  if (type === 'replayable') {
    return (
      <span className={value ? 'badge-rejugar-activo' : 'badge-rejugar-inactivo'} aria-label={value ? 'Rejugar: Sí' : 'Rejugar: No'}>
        <Icon name={value ? COMMON_ICONS.star : COMMON_ICONS.lock} />
      </span>
    );
  }

  return (
    <span className={value ? 'badge-opp-activo' : 'badge-opp-inactivo'} aria-label={value ? 'Dar otra oportunidad: Sí' : 'Dar otra oportunidad: No'}>
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
  tabActions,
  readOnly = false,
  visibility,
}: GameTableProps) {
  const showYears = visibility?.showYears ?? true;
  const showReplayable = visibility?.showReplayable ?? true;
  const showRetry = visibility?.showRetry ?? true;
  const showHours = visibility?.showHours ?? true;

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
  const fallbackToFullRender = games.length > 0 && virtualRows.length > 0 && virtualRowEntries.length === 0;
  const rowIndexesToRender = fallbackToFullRender
    ? virtualRows.map((_, index) => index)
    : virtualRowEntries.map((entry) => entry.index);

  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  return (
    <div className="table-wrap" ref={parentRef}>
      <table>
        <thead>
          <tr>
            {getTableHeaders().map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!games.length ? (
            <tr>
              <td colSpan={getColSpan(currentTab)} style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
                No hay juegos
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
                  return (
                    <tr
                      key={`main-${game.id}`}
                      data-index={rowIndex}
                      ref={virtualizer.measureElement}
                      className={`main-row ${row.index % 2 === 0 ? 'striped' : ''}`}
                      tabIndex={0}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Contraer' : 'Expandir'} detalles de ${game.name}`}
                      onClick={() => onExpandedChange(expanded ? null : game.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onExpandedChange(expanded ? null : game.id);
                        }
                      }}
                      onDoubleClick={() => {
                        if (!readOnly) {
                          onEdit(currentTab, game.id);
                        }
                      }}
                    >
                      <td>
                        <strong>{game.name}</strong>
                      </td>
                      {currentTab === 'c' && showYears ? <td>{renderTags(game.years?.map(String) || [], 'chip-generic')}</td> : null}
                      <td>{renderTags(game.platforms, 'chip-plat')}</td>
                      <td>{renderTags(game.genres, 'chip-genre')}</td>
                      {(currentTab === 'c' || currentTab === 'v' || currentTab === 'e') ? (
                        <td>{renderTags(game.strengths || [], 'chip-pf')}</td>
                      ) : null}
                      {(currentTab === 'c' || currentTab === 'e') ? (
                        <td>{renderTags(game.weaknesses || [], 'chip-pd')}</td>
                      ) : null}
                      {currentTab === 'v' ? <td>{renderTags(game.reasons || [], 'chip-pd')}</td> : null}
                      {(currentTab === 'c' || currentTab === 'p') ? <td><StarRating value={game.score || 0} /></td> : null}
                      {currentTab === 'c' && showReplayable ? <td>{renderBooleanBadge('replayable', Boolean(game.replayable))}</td> : null}
                      {currentTab === 'v' && showRetry ? <td>{renderBooleanBadge('retry', Boolean(game.retry))}</td> : null}
                    </tr>
                  );
                }

                const reviewLines = game.review ? game.review.split('\n') : [];

                return (
                  <tr key={`detail-${game.id}`} data-index={rowIndex} ref={virtualizer.measureElement} className="detail-row open">
                    <td colSpan={getColSpan(currentTab)} style={{ padding: 0 }}>
                      <div className="detail-content">
                        <div className="detail-box">
                          <span className="detail-label">Plataformas</span>
                          <div className="chips">
                            {renderTags(game.platforms, 'chip-plat')}
                            {game.steamDeck && (
                              <span className="chip chip-deck">
                                <Icon name={COMMON_ICONS.steamDeck} />
                                <span>Steam Deck</span>
                              </span>
                            )}
                          </div>
                          {game.platforms.length === 0 && !game.steamDeck && <span>—</span>}
                        </div>
                        <div className="detail-box">
                          <span className="detail-label">Géneros</span>
                          <div>{renderTags(game.genres, 'chip-genre')}</div>
                        </div>
                        {currentTab === 'c' && showYears && game.years && game.years.length > 0 && (
                          <div className="detail-box">
                            <span className="detail-label">Años en los que se completó</span>
                            <div>{renderTags(game.years?.map(String) || [], 'chip-generic')}</div>
                          </div>
                        )}
                        {currentTab === 'c' && showHours && game.hours !== null && (
                          <div className="detail-box">
                            <span className="detail-label">Tiempo jugado</span>
                            <div>{String(game.hours).replace('.', ',')} horas</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'v' || currentTab === 'e') && game.strengths && game.strengths.length > 0 && (
                          <div className="detail-box detail-strong">
                            <span className="detail-label">Puntos fuertes</span>
                            <div>{renderTags(game.strengths, 'chip-pf')}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'e') && game.weaknesses && game.weaknesses.length > 0 && (
                          <div className="detail-box detail-weak">
                            <span className="detail-label">Puntos débiles</span>
                            <div>{renderTags(game.weaknesses, 'chip-pd')}</div>
                          </div>
                        )}
                        {currentTab === 'v' && game.reasons && game.reasons.length > 0 && (
                          <div className="detail-box detail-weak">
                            <span className="detail-label">Puntos débiles</span>
                            <div>{renderTags(game.reasons, 'chip-pd')}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'p') && game.score !== null && (
                          <div className="detail-box">
                            <span className="detail-label">{currentTab === 'p' ? 'Interés' : 'Puntuación'}</span>
                            <div>
                              <StarRating value={Number(game.score || 0)} />
                            </div>
                          </div>
                        )}
                        {currentTab === 'c' && showReplayable && (
                          <div className="detail-box">
                            <span className="detail-label">Rejugabilidad</span>
                            <div>{renderBooleanBadge('replayable', Boolean(game.replayable))}</div>
                          </div>
                        )}
                        {currentTab === 'v' && showRetry && (
                          <div className="detail-box">
                            <span className="detail-label">Dar otra oportunidad</span>
                            <div>{renderBooleanBadge('retry', Boolean(game.retry))}</div>
                          </div>
                        )}
                        {supportsReview(currentTab) && game.review ? (
                          <div className="detail-box" style={{ gridColumn: '1/-1' }}>
                            <span className="detail-label">Análisis</span>
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
                                title={`${action.label} - ${game.name}`}
                                aria-label={`${action.label} - ${game.name}`}
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
                              title={`Editar - ${game.name}`}
                              aria-label={`Editar - ${game.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onEdit(currentTab, game.id);
                              }}
                            >
                              <Icon name={COMMON_ICONS.edit} />
                              <span>Editar</span>
                            </button>
                            <button
                              className="btn btn-danger"
                              type="button"
                              title={`Eliminar - ${game.name}`}
                              aria-label={`Eliminar - ${game.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(currentTab, game.id);
                              }}
                            >
                              <Icon name={COMMON_ICONS.trash} />
                              <span>Eliminar</span>
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
