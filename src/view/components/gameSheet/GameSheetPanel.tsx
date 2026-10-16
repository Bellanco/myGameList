import { forwardRef, useEffect, useRef, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { GAME_SHEET_UI } from '../../../core/constants/gameSheetLabels';
import { COMMON_ICONS, TAB_ICONS } from '../../../core/constants/icons';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { coverDeCaja, type PedidoDePortada } from '../../../core/utils/coverDelListado';
import type { GameSheet, GameSheetSagaEntry } from '../../../core/gameSheet/buildGameSheet';
import { UNPLAYED_TAB_IDS, type GameItem, type TabData, type TabId } from '../../../model/types/game';
import { useGameSheetViewModel } from '../../../viewmodel/gameSheet/useGameSheetViewModel';
import type { TabAction } from '../../../viewmodel/useGameListViewModel';
import { useNativeDialog } from '../../modals/useNativeDialog';
import { useCovers } from '../../hooks/useCovers';
import { GameCover } from '../GameCover';
import { Icon } from '../Icon';
import { ScoreDisplay } from '../ScoreDisplay';
import { renderBooleanBadge, renderTags, yearsDesc } from '../gameTags';
import { useGameSheetWidth } from './useGameSheetWidth';
import { useSwipeToClose } from './useSwipeToClose';
import '../../../styles/gameSheet.scss';

/** A dónde lleva «Ver análisis» desde la ficha (el mismo destino que desde la tabla). */
export type GameSheetReviewTarget = (tab: TabId, game: GameItem) => { to: string; state?: unknown };

export interface GameSheetPanelProps {
  open: boolean;
  /** Tu biblioteca y la clave abierta: la ficha se monta aquí, dentro del chunk perezoso, y no en el arranque. */
  data: TabData;
  slug: string;
  onClose: () => void;
  /** Abrir la ficha de otro juego (una entrega de la saga). */
  onOpenGame: (name: string) => void;
  tabActions: Record<TabId, TabAction[]>;
  onEdit: (tab: TabId, id: number) => void;
  onDelete: (tab: TabId, id: number) => void;
  onMigrate: (tab: TabId, id: number, target: TabId) => void;
  reviewTarget: GameSheetReviewTarget;
}

const PEDIDO_PROPIO: PedidoDePortada = { preferirConocidas: false, soloCache: false };
const PEDIDO_AJENO: PedidoDePortada = { preferirConocidas: true, soloCache: true };

/** Un `GameItem` mínimo para pedir la carátula de un juego del que solo se sabe el nombre y las plataformas. */
function juegoParaCaratula(name: string, platforms: string[]): GameItem {
  return { id: 0, _ts: 0, name, platforms, genres: [], steamDeck: false, review: '' };
}

/**
 * ¿Lleva nota tu entrada, y con qué rótulo? Las MISMAS reglas que el detalle de la fila: nota en completados; interés
 * en próximos y deseados; en abandonados solo si se puntuó (`scored`); en curso nunca (ahí vale 0 y no dice nada).
 */
function rotuloDeNota(tab: TabId, item: GameItem): string | null {
  if (tab === 'c' || (tab === 'v' && item.scored)) return GAME_SHEET_UI.yourScore;
  if (UNPLAYED_TAB_IDS.includes(tab)) return GAME_SHEET_UI.yourInterest;
  return null;
}

function Saga({ saga, onOpenGame, covers, className = '' }: {
  saga: GameSheetSagaEntry[];
  onOpenGame: (name: string) => void;
  covers: boolean;
  className?: string;
}) {
  if (!saga.length) return null;
  return (
    <div className={`hub-detail-metadata gs-sec-saga ${className}`.trim()}>
      <div className="hub-metadata-section">
        <strong>{GAME_SHEET_UI.saga}</strong>
        <ul className="gs-saga">
          {saga.map((entry) => {
            const { src } = coverDeCaja(covers, juegoParaCaratula(entry.name, entry.platforms), entry.ownTab ? PEDIDO_PROPIO : PEDIDO_AJENO);
            const quien = [GAME_SHEET_UI.sagaOwn(entry.ownTab), entry.friendCount ? GAME_SHEET_UI.sagaFriends(entry.friendCount) : '']
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={entry.slug}>
                <button
                  className="gs-saga-item"
                  type="button"
                  aria-current={entry.current ? 'true' : undefined}
                  aria-label={entry.current ? undefined : GAME_SHEET_UI.sagaOpenAria(entry.name)}
                  onClick={() => { if (!entry.current) onOpenGame(entry.name); }}
                >
                  <GameCover name={entry.name} src={src} />
                  <span className="gs-saga-name">{entry.name}</span>
                  <span className="gs-saga-who">{quien}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Cabecera({ sheet, covers, lado }: { sheet: GameSheet; covers: boolean; lado: ReactElement | null }) {
  const own = sheet.own;
  const item = own?.item;
  const { src, src2x } = coverDeCaja(covers, item ?? juegoParaCaratula(sheet.name, []), item ? PEDIDO_PROPIO : PEDIDO_AJENO);
  const desde = own ? item?.enteredAt?.[own.tab] : undefined;
  const ultimoAnio = own?.tab === 'c' && item?.years?.length ? Math.max(...item.years) : null;
  const resumen = item ? [item.platforms[0], item.genres[0], ultimoAnio].filter(Boolean).join(' · ') : '';
  const rotulo = own && item ? rotuloDeNota(own.tab, item) : null;
  const amistades = sheet.friends.length;
  return (
    <header className="gs-head">
      <div className="gs-cover">
        <GameCover name={sheet.name} src={src} src2x={src2x} />
      </div>
      <div className="gs-head-text">
        <h2 className="gs-title">{sheet.name}</h2>
        {own ? (
          <div className="gs-linea">
            <span className={`gs-pill is-${own.tab}`}>
              <Icon name={TAB_ICONS[own.tab]} />
              {GAME_SHEET_UI.listPill(own.tab)}
            </span>
            {desde ? <span className="gs-desde">{GAME_SHEET_UI.since(desde)}</span> : null}
          </div>
        ) : null}
        {/* Un resumen de una línea, sin chips (F0.14): las listas enteras van en el cuerpo. */}
        {resumen ? <p className="gs-resumen">{resumen}</p> : null}
      </div>
      {rotulo || amistades ? (
        <dl className="gs-numbers gs-head-numbers">
          {rotulo && item ? (
            <div>
              <dt>{rotulo}</dt>
              <dd className="gs-media">
                <ScoreDisplay game={item} />
              </dd>
            </div>
          ) : null}
          {amistades ? (
            <div>
              <dt>{GAME_SHEET_UI.friendsOwning}</dt>
              <dd>
                {amistades} <small>{GAME_SHEET_UI.friendsCount(amistades)}</small>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {lado ? <div className="gs-head-lado">{lado}</div> : null}
    </header>
  );
}

/**
 * TODO LO QUE ENSEÑABA EL DETALLE DE LA FILA (F0.12), con su mismo marcado (`detail-content`, `detail-box`, chips e
 * insignias) y sus mismas reglas por lista: años y rejugar en completados, horas en completados y abandonados, puntos
 * fuertes en c/v/e, débiles en c/e, motivos en v y reintentar en v. Sin los títulos obvios (F0.14): plataformas y
 * géneros son dos renglones de chips sin etiqueta. La nota no va aquí: sube a las cifras de la cabecera.
 */
function TusDatos({ tab, item }: { tab: TabId; item: GameItem }) {
  const D = UI_MESSAGES.detail;
  const malos = tab === 'v' ? item.reasons : tab === 'c' || tab === 'e' ? item.weaknesses : undefined;
  return (
    <div className="hub-detail-metadata gs-sec-datos">
      <div className="hub-metadata-section">
        <div className="detail-content gs-detail">
          <div className="detail-box gs-fila" aria-label={GAME_SHEET_UI.platformsAria}>
            <div className="chips">
              {item.platforms.map((platform) => (
                <span key={platform} className="chip chip-plat" data-text={platform}>
                  <span className="chip-text">{platform}</span>
                </span>
              ))}
              {item.steamDeck ? (
                <span className="chip chip-deck">
                  <Icon name={COMMON_ICONS.steamDeck} />
                  <span>{D.steamDeck}</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="detail-box gs-fila" aria-label={GAME_SHEET_UI.genresAria}>
            <div>{renderTags(item.genres, 'chip-genre', undefined, true)}</div>
          </div>
          {tab === 'c' && item.years?.length ? (
            <div className="detail-box">
              <span className="detail-label">{D.yearsCompleted}</span>
              <div>{renderTags(yearsDesc(item.years), 'chip-generic')}</div>
            </div>
          ) : null}
          {(tab === 'c' || tab === 'v') && (item.hours ?? 0) > 0 ? (
            <div className="detail-box">
              <span className="detail-label">{D.playtime}</span>
              <div>{D.hoursSuffix(String(item.hours).replace('.', ','))}</div>
            </div>
          ) : null}
          {(tab === 'c' || tab === 'v' || tab === 'e') && item.strengths?.length ? (
            <div className="detail-box detail-strong">
              <span className="detail-label">{D.strengths}</span>
              <div>{renderTags(item.strengths, 'chip-pf')}</div>
            </div>
          ) : null}
          {malos?.length ? (
            <div className="detail-box detail-weak">
              <span className="detail-label">{D.weaknesses}</span>
              <div>{renderTags(malos, 'chip-pd')}</div>
            </div>
          ) : null}
          {tab === 'c' ? (
            <div className="detail-box">
              <span className="detail-label">{D.replayability}</span>
              <div>{renderBooleanBadge('replayable', Boolean(item.replayable))}</div>
            </div>
          ) : null}
          {tab === 'v' ? (
            <div className="detail-box">
              <span className="detail-label">{D.retry}</span>
              <div>{renderBooleanBadge('retry', Boolean(item.retry))}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * El análisis, en su propio bloque para que las columnas del cuerpo lo puedan repartir aparte de los datos. Recortado
 * a cuatro renglones: entero, en su pantalla («Ver análisis», un enlace porque es navegación).
 */
function Analisis({ tab, item, reviewTarget }: { tab: TabId; item: GameItem; reviewTarget: GameSheetReviewTarget }) {
  const D = UI_MESSAGES.detail;
  if (!item.review || UNPLAYED_TAB_IDS.includes(tab)) return null;
  const destino = reviewTarget(tab, item);
  return (
    <div className="hub-detail-metadata gs-sec-analisis">
      <div className="hub-metadata-section gs-review-box">
        <span className="detail-label">{D.review}</span>
        <p className="hub-feed-review-text gs-review">{item.review}</p>
        <Link className="btn btn-open" to={destino.to} state={destino.state} aria-label={D.reviewLinkAria(item.name)}>
          <Icon name={COMMON_ICONS.arrowsToEye} />
          <span>{D.reviewLink}</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * LOS BOTONES DEL DETALLE DE HOY, anclados abajo y sin barra: mover según la lista (con su color), editar y borrar,
 * este separado a la derecha. En el panel estrecho y en el móvil solo el primero lleva texto; los demás, icono con su
 * nombre en `aria-label`.
 */
const BarraDeAcciones = forwardRef<HTMLElement, {
  tab: TabId;
  item: GameItem;
  actions: TabAction[];
  onEdit: (tab: TabId, id: number) => void;
  onDelete: (tab: TabId, id: number) => void;
  onMigrate: (tab: TabId, id: number, target: TabId) => void;
}>(function BarraDeAcciones({ tab, item, actions, onEdit, onDelete, onMigrate }, ref) {
  return (
    <footer className="gs-bar" ref={ref}>
      {actions.map((action) => (
        <button
          key={action.target}
          className={`btn ${action.btnCls}`}
          type="button"
          aria-label={UI_MESSAGES.table.actionAria(action.label, item.name)}
          onClick={() => onMigrate(tab, item.id, action.target)}
        >
          <Icon name={action.icon} />
          <span className="gs-bar-label">{action.label}</span>
        </button>
      ))}
      <button className="btn btn-secondary" type="button" aria-label={UI_MESSAGES.table.editAria(item.name)} onClick={() => onEdit(tab, item.id)}>
        <Icon name={COMMON_ICONS.edit} />
        <span className="gs-bar-label">{UI_MESSAGES.table.edit}</span>
      </button>
      <button className="btn btn-danger" type="button" aria-label={UI_MESSAGES.table.deleteAria(item.name)} onClick={() => onDelete(tab, item.id)}>
        <Icon name={COMMON_ICONS.trash} />
        <span className="gs-bar-label">{UI_MESSAGES.table.delete}</span>
      </button>
    </footer>
  );
});

/**
 * LA FICHA DE UN JUEGO, un panel que entra por la derecha y sustituye al detalle que se desplegaba bajo la fila
 * (`docs/plan-ficha-de-juego-y-precios.md`, F2). Va lazy en `App.tsx`, montado una vez para toda la app, y abre con
 * `?juego=<clave>` en la URL (`useGameSheetParam`).
 *
 * Es un `<dialog>` modal (`useNativeDialog`): foco atrapado, Esc, pulsar fuera y el foco de vuelta a la fila al
 * cerrar. Por eso el `<dialog>` se queda siempre montado y lo que entra y sale es su contenido.
 *
 * Sin cabecera de modal (F0.11): el nombre va junto a la carátula y la X en la esquina. El ancho se mide para que el
 * espacio en blanco sea el mínimo (`useGameSheetWidth`) y en el móvil se cierra deslizándolo hacia la derecha
 * (`useSwipeToClose`). Los botones flotan abajo y el cuerpo les reserva justo su alto (`--gs-botones`).
 */
export function GameSheetPanel({
  open,
  data,
  slug,
  onClose,
  onOpenGame,
  tabActions,
  onEdit,
  onDelete,
  onMigrate,
  reviewTarget,
}: GameSheetPanelProps) {
  const sheet = useGameSheetViewModel({ data, slug });
  const visible = open && sheet !== null;
  const dialogRef = useNativeDialog(visible, onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const { covers } = useCovers();
  const key = sheet?.slug ?? '';
  const { width } = useGameSheetWidth(visible, key, scrollRef, contentRef, false);
  const swipe = useSwipeToClose(panelRef, onClose);

  /* EL HUECO DE LOS BOTONES SE MIDE: el cuerpo reserva abajo justo lo que ocupan (más un respiro), sea cual sea el
     tema, el tamaño de letra o si en el móvil las dianas son de 48 px. Fijo, se quedaba corto y tapaban lo último. */
  useEffect(() => {
    const barra = barRef.current;
    const panel = panelRef.current;
    if (!visible || !barra || !panel || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(() => {
      panel.style.setProperty('--gs-botones', `${Math.ceil(barra.getBoundingClientRect().height) + 8}px`);
    });
    observador.observe(barra);
    return () => observador.disconnect();
  }, [visible, key]);

  const own = sheet?.own ?? null;
  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog gs-dialog"
      aria-label={sheet ? GAME_SHEET_UI.panelAria(sheet.name) : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {visible && sheet ? (
        <div ref={panelRef} className={`modal gs-panel ${width}`} {...swipe}>
          <span className="gs-asa-lateral" aria-hidden="true" />
          <button className="btn-icon gs-close" type="button" onClick={onClose} aria-label={GAME_SHEET_UI.close} title={GAME_SHEET_UI.close}>
            <Icon name={COMMON_ICONS.close} />
          </button>
          <div className="gs-scroll" key={sheet.slug} ref={scrollRef}>
            <div className="gs-contenido" ref={contentRef}>
              {/* Con ancho, el lado de la cabecera es la saga (sin precio, ese hueco quedaba vacío); en estrecho, la
                  saga va al final del cuerpo. Se pinta en los dos sitios y el CSS esconde la que no toca. */}
              <Cabecera
                sheet={sheet}
                covers={covers}
                lado={sheet.saga.length ? <Saga saga={sheet.saga} onOpenGame={onOpenGame} covers={covers} className="is-cabecera" /> : null}
              />
              <div className="gs-cuerpo">
                {own ? <TusDatos tab={own.tab} item={own.item} /> : null}
                {own ? <Analisis tab={own.tab} item={own.item} reviewTarget={reviewTarget} /> : null}
                <Saga saga={sheet.saga} onOpenGame={onOpenGame} covers={covers} className="is-solo-estrecho" />
              </div>
            </div>
          </div>
          {own ? (
            <BarraDeAcciones
              ref={barRef}
              tab={own.tab}
              item={own.item}
              actions={tabActions[own.tab] || []}
              onEdit={onEdit}
              onDelete={onDelete}
              onMigrate={onMigrate}
            />
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
