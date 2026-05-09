import { Fragment } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import type { IconName } from '../../core/constants/icons';
import type { GameItem, TabId } from '../../model/types/game';
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
  tabActions: Array<{ target: TabId; label: string; btnCls: string; icon: IconName }>;
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

export function GameTable({
  games,
  currentTab,
  expandedId,
  onExpandedChange,
  onEdit,
  onDelete,
  onMigrate,
  tabActions,
}: GameTableProps) {
  const getTableHeaders = (): string[] => {
    if (currentTab === 'c') return ['Juego', 'Año', 'Plataformas', 'Géneros', 'Puntos fuertes', 'Puntos débiles', 'Puntuación', 'Rejugar'];
    if (currentTab === 'v') return ['Juego', 'Plataformas', 'Géneros', 'Puntos fuertes', 'Puntos débiles', 'Dar otra oportunidad'];
    if (currentTab === 'e') return ['Juego', 'Plataformas', 'Géneros', 'Puntos fuertes', 'Puntos débiles'];
    return ['Juego', 'Plataformas', 'Géneros', 'Interés'];
  };

  const supportsScore = (tab: TabId) => tab === 'c' || tab === 'p';
  const supportsYears = (tab: TabId) => tab === 'c';
  const supportsReview = (tab: TabId) => tab !== 'p';
  const supportsStrengths = (tab: TabId) => tab === 'c' || tab === 'v' || tab === 'e';
  const supportsWeaknesses = (tab: TabId) => tab === 'c' || tab === 'e';
  const supportsReasons = (tab: TabId) => tab === 'v';
  const getColSpan = (tab: TabId) => {
    if (tab === 'c') return 8;
    if (tab === 'v') return 6;
    if (tab === 'e') return 5;
    return 4;
  };

  return (
    <div className="table-wrap">
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
            games.map((game, index) => {
              const expanded = expandedId === game.id;
              return (
                <Fragment key={game.id}>
                  <tr
                    className={`main-row ${index % 2 === 0 ? 'striped' : ''}`}
                    onClick={() => onExpandedChange(expanded ? null : game.id)}
                    onDoubleClick={() => onEdit(currentTab, game.id)}
                  >
                    <td>
                      <strong>{game.name}</strong>
                    </td>
                    {currentTab === 'c' ? <td>{renderTags(game.years?.map(String) || [], 'chip-generic')}</td> : null}
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
                    {currentTab === 'c' ? <td>{renderBooleanBadge('replayable', Boolean(game.replayable))}</td> : null}
                    {currentTab === 'v' ? <td>{renderBooleanBadge('retry', Boolean(game.retry))}</td> : null}
                  </tr>
                  <tr className={`detail-row ${expanded ? 'open' : ''}`}>
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
                        {currentTab === 'c' && game.years && game.years.length > 0 && (
                          <div className="detail-box">
                            <span className="detail-label">Años en los que se completó</span>
                            <div>{renderTags(game.years?.map(String) || [], 'chip-generic')}</div>
                          </div>
                        )}
                        {currentTab === 'c' && game.hours != null && (
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
                        {(currentTab === 'c' || currentTab === 'p') && game.score != null && (
                          <div className="detail-box">
                            <span className="detail-label">{currentTab === 'p' ? 'Interés' : 'Puntuación'}</span>
                            <div>
                              <StarRating value={game.score} />
                            </div>
                          </div>
                        )}
                        {currentTab === 'c' && (
                          <div className="detail-box">
                            <span className="detail-label">Rejugabilidad</span>
                            <div>{renderBooleanBadge('replayable', Boolean(game.replayable))}</div>
                          </div>
                        )}
                        {currentTab === 'v' && (
                          <div className="detail-box">
                            <span className="detail-label">Dar otra oportunidad</span>
                            <div>{renderBooleanBadge('retry', Boolean(game.retry))}</div>
                          </div>
                        )}
                        {supportsReview(currentTab) && game.review ? (
                          <div className="detail-box" style={{ gridColumn: '1/-1' }}>
                            <span className="detail-label">Análisis</span>
                            <div className="detail-value">{game.review.split('\n').map((line, i) => (
                              <Fragment key={i}>
                                {line}
                                {i < game.review.split('\n').length - 1 && <br />}
                              </Fragment>
                            ))}</div>
                          </div>
                        ) : null}
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
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
