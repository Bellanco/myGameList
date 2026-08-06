import { Fragment, memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import { COMMON_ICONS, TAB_ICONS } from '../../core/constants/icons';
import { TAB_TITLES, UI_MESSAGES } from '../../core/constants/labels';
import type { GameItem, TabId, TabSort } from '../../model/types/game';
import type { TabAction } from '../../viewmodel/useGameListViewModel';
import { resolveGrade } from '../../core/utils/scoreScale';
import { Icon } from './Icon';
import { ScoreDisplay } from './ScoreDisplay';

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
  /** Orden activo de la pestaña; si se pasa junto a `onSort`, las columnas ordenables son pulsables. */
  sort?: TabSort;
  onSort?: (tab: TabId, column: string) => void;
  /** Id del juego recién guardado (añadido/editado): su fila destella brevemente para localizar el cambio. */
  recentlyChangedId?: number | null;
  visibility?: {
    showYears?: boolean;
    showReplayable?: boolean;
    showRetry?: boolean;
    showHours?: boolean;
    /** Muestra el "Análisis" (reseña) en la fila expandida. En el perfil social se oculta: tiene pestaña propia. */
    showReview?: boolean;
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

// Columnas ordenables: etiqueta de cabecera → clave de orden que entiende `sortGames`/`sortBy`.
// El resto de cabeceras (Puntos fuertes/débiles, Rejugar…) no son ordenables.
const SORT_COLUMN: Record<string, string> = {
  Juego: 'name',
  Año: 'years',
  Plataformas: 'platforms',
  Géneros: 'genres',
  Puntuación: 'score',
  Interés: 'score',
};

function renderBooleanBadge(type: 'replayable' | 'retry', value: boolean) {
  if (type === 'replayable') {
    const label = value ? 'Rejugar: Sí' : 'Rejugar: No';
    return (
      <span className={value ? 'badge-rejugar-activo' : 'badge-rejugar-inactivo'} aria-label={label} title={label}>
        <Icon name={value ? COMMON_ICONS.starOliveBranches : COMMON_ICONS.lock} />
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
  sort,
  onSort,
  visibility,
  recentlyChangedId = null,
}: GameTableProps) {
  const showYears = visibility?.showYears ?? true;
  const showReplayable = visibility?.showReplayable ?? true;
  const showRetry = visibility?.showRetry ?? true;
  const showHours = visibility?.showHours ?? true;
  const showReview = visibility?.showReview ?? true;

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

  // QUIÉN SCROLLEA DE VERDAD. Hay dos virtualizadores y no son intercambiables: el de elemento necesita un
  // contenedor que scrollee, y apuntado a uno que no scrollea toma como viewport TODO el contenido y pinta todas
  // las filas (justo lo que se quería evitar).
  //
  // Se mide, no se deduce del CSS. Antes se leía `overflow-y === 'visible'` y eso daba dos falsos negativos:
  //  - en móvil/tablet `.table-wrap` es `overflow:visible` → se detectaba bien, pero el código renderizaba la
  //    tabla ENTERA a propósito (sin virtualizador de ventana): las bibliotecas grandes pintaban miles de filas
  //    precisamente en los dispositivos más lentos;
  //  - en escritorio es `overflow-y:auto` pero SIN altura acotada (es un `flex:1 1 auto` cuyo padre no limita la
  //    altura), así que su `clientHeight` es la tabla completa y tampoco scrollea nunca. Se detectaba como
  //    "scrollea el contenedor" y el virtualizador de elemento se quedaba sin efecto: también pintaba todo.
  // Resultado: la virtualización no estaba haciendo nada en ninguno de los dos casos. `scrollHeight >
  // clientHeight` distingue el caso real y sigue valiendo si algún día se acota la altura por CSS.
  const [pageScrolls, setPageScrolls] = useState(true);
  // Desplazamiento del inicio de la tabla dentro del documento: el virtualizador de ventana trabaja en
  // coordenadas de página, así que sin esto sus posiciones vendrían corridas por la altura de lo que hay encima
  // (barra de pestañas, toolbar, filtros abiertos…).
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const el = parentRef.current;
      if (!el) return;
      setPageScrolls(el.scrollHeight <= el.clientHeight + 1);
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    update();
    window.addEventListener('resize', update);
    // La toolbar y el panel de filtros cambian de alto sin que la tabla se entere (abrir filtros, envolver
    // chips): eso mueve el inicio de la tabla, así que hay que recalcular el margen cuando el layout cambia.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  // Por debajo de este número de filas se pinta la tabla entera aunque scrollee la página: virtualizar tiene su
  // propio coste (medición, spacers, re-render al scrollear) y con pocas filas no compensa. También mantiene el
  // comportamiento exacto de siempre en listas cortas, que son la mayoría.
  const WINDOW_VIRTUALIZE_MIN_ROWS = 120;

  // Clave ESTABLE por fila lógica (tipo + id), no por índice: al expandir/plegar el detalle se inserta/quita una
  // fila y TODOS los índices posteriores se desplazan. Sin clave estable, el virtualizador reasigna las alturas
  // cacheadas por índice a filas distintas (una fila normal ~50px hereda la altura de un detalle ~320px, o al
  // revés) → el tamaño total se infla, aparecen huecos y filas inalcanzables al final. Con la clave, cada fila
  // conserva su medida al cambiar de posición. Compartida por los dos virtualizadores.
  const getItemKey = useCallback(
    (index: number) => {
      const row = virtualRows[index];
      return row ? `${row.type}-${row.gameId}` : index;
    },
    [virtualRows],
  );
  const estimateSize = useCallback(
    (index: number) => (virtualRows[index]?.type === 'detail' ? 320 : 50),
    [virtualRows],
  );
  const measureElement = useCallback((element: Element) => element.getBoundingClientRect().height, []);

  const elementVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    measureElement,
    getItemKey,
    estimateSize,
    overscan: 5,
  });

  const windowVirtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    measureElement,
    getItemKey,
    estimateSize,
    scrollMargin,
    overscan: 5,
  });

  const useWindowScroller = pageScrolls && virtualRows.length >= WINDOW_VIRTUALIZE_MIN_ROWS;
  const virtualize = !pageScrolls || useWindowScroller;
  const virtualizer = useWindowScroller ? windowVirtualizer : elementVirtualizer;
  // El virtualizador de ventana devuelve posiciones ABSOLUTAS del documento; los spacers son relativos al inicio
  // de la tabla, así que hay que descontar el margen. El de elemento ya trabaja en coordenadas del contenedor.
  const originOffset = useWindowScroller ? scrollMargin : 0;

  const virtualRowEntries = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const topSpacerHeight = virtualRowEntries.length > 0 ? virtualRowEntries[0].start - originOffset : 0;
  const bottomSpacerHeight =
    virtualRowEntries.length > 0 ? totalSize - (virtualRowEntries[virtualRowEntries.length - 1].end - originOffset) : 0;
  // Red de seguridad: si el virtualizador elegido no devuelve nada habiendo filas (medidas degeneradas, entorno
  // sin layout), se pinta todo antes que dejar la tabla vacía.
  const fallbackToFullRender =
    !virtualize || (games.length > 0 && virtualRows.length > 0 && virtualRowEntries.length === 0);
  const rowIndexesToRender = fallbackToFullRender
    ? virtualRows.map((_, index) => index)
    : virtualRowEntries.map((entry) => entry.index);

  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  return (
    <div className="table-wrap" ref={parentRef}>
      <table>
        {/* A11y-4: la tabla no se anunciaba con ningún nombre, así que en la lista de tablas de un lector de
            pantalla aparecía como "tabla" sin más. Con varias listas (completados, vergüenza, en curso…) el
            nombre es lo único que las distingue. */}
        <caption className="sr-only">{UI_MESSAGES.table.caption(TAB_TITLES[currentTab], games.length)}</caption>
        <thead>
          <tr>
            {getTableHeaders().map((header) => {
              const sortKey = SORT_COLUMN[header];
              const sortable = Boolean(onSort && sortKey);
              const isSorted = sortable && sort?.col === sortKey;
              const dir = isSorted ? (sort?.asc ? 'asc' : 'desc') : undefined;
              const tip = sortable
                ? UI_MESSAGES.table.sortHeaderTip(header)
                : header === 'Rejugar'
                  ? UI_MESSAGES.table.replayHeaderTip
                  : header === 'Dar otra oportunidad'
                    ? UI_MESSAGES.table.retryHeaderTip
                    : undefined;
              const thClass = [cCol(C_COLUMN_CLASS[header]), sortable ? 'sortable' : '', isSorted ? 'sorted' : '', dir ?? '']
                .filter(Boolean)
                .join(' ');
              return (
                <th
                  key={header}
                  // A11y-4: `scope="col"` explícito. Sin él, la asociación celda↔cabecera depende de la
                  // heurística del navegador, y es la que permite a un lector de pantalla decir "Plataformas: PC"
                  // al recorrer una fila en vez de solo "PC".
                  scope="col"
                  title={tip}
                  className={thClass || undefined}
                  aria-sort={isSorted ? (sort?.asc ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
                >
                  {sortable ? (
                    <button type="button" className="th-sort-btn" onClick={() => onSort?.(currentTab, sortKey)}>
                      <span>{header}</span>
                      <span className="th-sort-caret" aria-hidden="true" />
                    </button>
                  ) : (
                    header
                  )}
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
                          // A11y-4: SIN `aria-label`. El nombre accesible sale del CONTENIDO del botón, y eso
                          // importa por lo que pasa en móvil: ahí todas las celdas de datos son `display:none`
                          // (así que no están en el árbol de accesibilidad) y el meta compacto de abajo es la
                          // ÚNICA presentación de puntuación, plataformas, géneros y año. Como un `aria-label`
                          // GANA sobre el contenido, con él un lector de pantalla en el móvil solo oía el nombre
                          // del juego: el resto de la fila era invisible para él. Sin etiqueta explícita, el
                          // nombre accesible sigue a lo que se ve en cada breakpoint (en escritorio, solo el
                          // nombre, porque ahí el meta es el que está oculto y los datos están en sus columnas).
                          // El estado plegado/desplegado ya lo anuncia `aria-expanded`, que es para lo que existe.
                          onClick={(event) => {
                            event.stopPropagation();
                            onExpandedChange(expanded ? null : game.id);
                          }}
                        >
                          <span className="row-chevron" aria-hidden="true" />
                          <span className="row-toggle-body">
                            <strong className="row-name">{game.name}</strong>
                            {/* Meta compacto solo en vista colapsada (móvil/tablet); revela categorías
                                según el ancho disponible vía container queries. A11y-4: ya NO va
                                `aria-hidden`. Lo llevaba con el razonamiento de que "la info ya está en las
                                columnas", que es cierto en escritorio y falso en móvil: ahí las columnas son
                                `display:none` y esto es lo único que queda, así que ocultarlo dejaba a un
                                lector de pantalla sin la puntuación ni las plataformas. */}
                            <span className="row-meta">
                              {(currentTab === 'c' || currentTab === 'p') && resolveGrade(game) > 0 ? (
                                <span className="row-meta-item rm-score">
                                  <ScoreDisplay game={game} />
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
                      {(currentTab === 'c' || currentTab === 'p') ? <td className={cCol('col-c-score')}><ScoreDisplay game={game} /></td> : null}
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
                        {(currentTab === 'c' || currentTab === 'v') && showHours && game.hours !== null && (
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
                        {(currentTab === 'c' || currentTab === 'p' || (currentTab === 'v' && game.scored)) && game.score !== null && (
                          <div className="detail-box">
                            <span className="detail-label">{currentTab === 'p' ? UI_MESSAGES.detail.interest : UI_MESSAGES.detail.score}</span>
                            <div>
                              <ScoreDisplay game={game} />
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
                        {showReview && supportsReview(currentTab) && game.review ? (
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
