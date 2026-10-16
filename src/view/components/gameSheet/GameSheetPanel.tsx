import { Suspense, forwardRef, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { GAME_SHEET_UI } from '../../../core/constants/gameSheetLabels';
import { COMMON_ICONS, TAB_ICONS } from '../../../core/constants/icons';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { coverDeCaja, type PedidoDePortada } from '../../../core/utils/coverDelListado';
import { starsFromGrade } from '../../../core/utils/scoreScale';
import { findOwnEntry, signalGameName, type GameSheet, type GameSheetFriend, type GameSheetSagaEntry, type GameSheetSignal } from '../../../core/gameSheet/buildGameSheet';
import { gameSheetSearch, matchesGameSheet } from '../../../core/utils/gameSheetPath';
import { UNPLAYED_TAB_IDS, type GameItem, type TabData, type TabId } from '../../../model/types/game';
import { useGameSheetFriendSignals } from '../../../viewmodel/gameSheet/useGameSheetFriendSignals';
import { useGameSheetFriendEntry } from '../../../viewmodel/gameSheet/useGameSheetFriendEntry';
import type { FriendGameEntry } from '../../../viewmodel/gameSheet/friendLibraryIndex';
import { useGameSheetViewModel } from '../../../viewmodel/gameSheet/useGameSheetViewModel';
import { useGamePrice } from '../../../viewmodel/prices/useGamePrice';
import type { PrecioItad } from '../../../model/types/prices';
import { SOCIAL_ROUTES } from '../../../viewmodel/social/socialRoutePaths';
import type { TabAction } from '../../../viewmodel/useGameListViewModel';
import { useNativeDialog } from '../../modals/useNativeDialog';
import { useCovers } from '../../hooks/useCovers';
import { useScoreScale } from '../../hooks/useScoreScale';
import { GameCover } from '../GameCover';
import { Icon } from '../Icon';
import { ScoreDisplay } from '../ScoreDisplay';
import { StarRating } from '../StarRating';
import { renderBooleanBadge, renderTags, yearsDesc } from '../gameTags';
import { useGameSheetWidth } from './useGameSheetWidth';
import { useSwipeToClose } from './useSwipeToClose';
import { activarConTeclado } from './activarConTeclado';
// El renglón de persona del hub, para tu análisis. Lo de tus amistades llega con su propio chunk (`GameSheetFriends`).
import '../../../styles/personRow.scss';
import '../../../styles/gameSheet.scss';

/* LO DE TUS AMISTADES, PEREZOSO Y FUERA DEL PRECACHE (F3 y F4): solo se pide si hay amistades que enseñar. Es una
   pieza de fuera, opcional (F0.10): si no llega, la sección no se pinta. Con ella dentro, el panel no cabía en el
   presupuesto total del precache. */
const GameSheetFriends = lazy(() => import('./GameSheetFriends').then((module) => ({ default: module.GameSheetFriends })));
/* EL RECUADRO DEL PRECIO (P3 y P5), en el chunk de los precios: solo se pide con un precio que enseñar, y no entra en
   el precache de la ficha. Sin red y sin el chunk, el lado se queda vacío y la saga sigue en el cuerpo: sin errores. */
type PriceBoxType = typeof import('../prices/Prices').PriceBox;
const SIN_RECUADRO: PriceBoxType = () => null;
const PriceBox = lazy(() => import('../prices/Prices').then((module) => ({ default: module.PriceBox }), () => ({ default: SIN_RECUADRO })));

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
  /** La amistad desde cuyo perfil se abrió (`?de=`): su bloque va arriba (F0.7). */
  friendId?: string;
  /** Un juego que no tienes: añadirlo a deseados o a próximos, con lo que se sepa de él. */
  onAddGame: (game: Partial<GameItem>, tab: 'p' | 'd') => void;
  /**
   * LOS PRECIOS DE ISTHEREANYDEAL (P3 del plan de la ficha y los precios): encendidos (interruptor y espacio social) y
   * el plazo del rango de quien mira, `null` mientras no se sabe (entonces vale lo guardado).
   */
  pricesOn?: boolean;
  priceTtlMs?: number | null;
}

/** Lo que dura la salida del panel, la más larga de las dos (`gsSale`, en el móvil, en `styles/gameSheet.scss`). */
const SALIDA_MS = 320;

const PEDIDO_PROPIO: PedidoDePortada = { preferirConocidas: false, soloCache: false };
const PEDIDO_AJENO: PedidoDePortada = { preferirConocidas: true, soloCache: true };

/** Un `GameItem` mínimo para pedir la carátula de un juego del que solo se sabe el nombre y las plataformas. */
function juegoParaCaratula(name: string, platforms: string[]): GameItem {
  return { id: 0, _ts: 0, name, platforms, genres: [], steamDeck: false, review: '' };
}

/** ¿Es una NOTA (y no un interés)? En completados siempre; en abandonados, solo si se puntuó (`scored`). */
function llevaNota(tab: TabId, item: GameItem): boolean {
  return tab === 'c' || (tab === 'v' && Boolean(item.scored));
}

/**
 * ¿Lleva nota tu entrada, y con qué rótulo? Las MISMAS reglas que el detalle de la fila: nota en completados; interés
 * en próximos y deseados; en abandonados solo si se puntuó (`scored`); en curso nunca (ahí vale 0 y no dice nada).
 */
function rotuloDeNota(tab: TabId, item: GameItem): string | null {
  if (llevaNota(tab, item)) return GAME_SHEET_UI.yourScore;
  if (UNPLAYED_TAB_IDS.includes(tab)) return GAME_SHEET_UI.yourInterest;
  return null;
}

/** Las horas jugadas, con la regla del detalle: solo en completados y abandonados, y solo si las hay. */
function horasJugadas(tab: TabId, item: GameItem): number | null {
  return (tab === 'c' || tab === 'v') && (item.hours ?? 0) > 0 ? Number(item.hours) : null;
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

/**
 * La media de tus amistades, EN LA ESCALA DE QUIEN MIRA (F0.13): con la nota 0–100, la cifra; con estrellas, en
 * estrellas. Al lado, cuántas notas la forman (F0.2: sale con las que haya, por pocas que sean).
 */
function MediaDeAmistades({ average }: { average: { grade: number; count: number } }) {
  const scale = useScoreScale();
  return (
    <>
      {scale === 'grade' ? average.grade : <StarRating value={starsFromGrade(average.grade)} />}{' '}
      <small>{GAME_SHEET_UI.friendsAverageCount(average.count)}</small>
    </>
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
  const horas = own && item ? horasJugadas(own.tab, item) : null;
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
            <Insignia tab={own.tab} item={own.item} />
          </div>
        ) : null}
        {/* Un resumen de una línea, sin chips (F0.14): las listas enteras van en el cuerpo. */}
        {resumen ? <p className="gs-resumen">{resumen}</p> : null}
      </div>
      {horas || rotulo || amistades || sheet.average ? (
        <dl className="gs-numbers gs-head-numbers">
          {horas ? (
            <div>
              <dt>{UI_MESSAGES.detail.playtime}</dt>
              <dd>
                {GAME_SHEET_UI.hours(horas)} <small>{GAME_SHEET_UI.hoursUnit(horas)}</small>
              </dd>
            </div>
          ) : null}
          {rotulo && item ? (
            <div>
              <dt>{rotulo}</dt>
              <dd className="gs-media">
                <ScoreDisplay game={item} />
              </dd>
            </div>
          ) : null}
          {sheet.average ? (
            <div>
              <dt>{GAME_SHEET_UI.friendsAverage}</dt>
              <dd className="gs-media">
                <MediaDeAmistades average={sheet.average} />
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
 * TUS DATOS Y TU ANÁLISIS, EN UNA SOLA SECCIÓN (16-10-2026, decisión del usuario: sin rótulos que no hacen falta, sin
 * dividirlo en líneas y en secciones separadas). Lo que enseñaba el detalle de la fila (F0.12), con sus reglas por
 * lista: años en completados, puntos fuertes en c/v/e, débiles en c/e y motivos en v. La nota y las horas suben a
 * las cifras de la cabecera, y rejugar o reintentar, junto a la lista (`Insignia`). El análisis va en la misma sección que tus datos:
 * en su propio bloque, las columnas del cuerpo lo separaban de ellos (con el bloque de una amistad, a la otra columna).
 */
function TusDatos({ tab, item, reviewTarget, conTitulo = false }: { tab: TabId; item: GameItem; reviewTarget: GameSheetReviewTarget; conTitulo?: boolean }) {
  const navigate = useNavigate();
  const destino = item.review && !UNPLAYED_TAB_IDS.includes(tab) ? reviewTarget(tab, item) : null;
  return (
    <div className="hub-detail-metadata gs-sec-datos">
      <div className="hub-metadata-section">
        {/* Sin título (F0.14), salvo junto al bloque de una amistad: ahí ya no se sabe de quién son. */}
        {conTitulo ? <strong>{GAME_SHEET_UI.yourData}</strong> : null}
        <DatosDelJuego tab={tab} item={item} />
        {destino ? (
          <RenglonDeAnalisis
            tab={tab}
            item={item}
            aria={UI_MESSAGES.detail.reviewLinkAria(item.name)}
            onOpen={() => { void navigate(destino.to, { state: destino.state }); }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * REJUGAR O REINTENTAR, CON LA INSIGNIA DE SIEMPRE y arriba, junto a la lista (16-10-2026, decisión del usuario): sin el
 * rótulo «Rejugabilidad», que no hacía falta; la insignia lleva su nombre en `aria-label` y `title`. Solo en
 * completados (rejugar) y abandonados (reintentar).
 */
function Insignia({ tab, item }: { tab: TabId; item: GameItem }) {
  if (tab !== 'c' && tab !== 'v') return null;
  return <span className="gs-insignia">{renderBooleanBadge(tab === 'c' ? 'replayable' : 'retry', Boolean(tab === 'c' ? item.replayable : item.retry))}</span>;
}

/**
 * Los datos de una entrada, los tuyos o los de una amistad (su bloque, F0.7), en RECUADROS SIN RÓTULO, uno por clase de
 * dato, como los fuertes y débiles del renglón de la tabla (16-10-2026, decisión del usuario: secciones separadas y no
 * renglones con filetes; solo con el color, en algunos temas todo parecía de la misma categoría):
 *  · lo que es el juego: plataformas (y Steam Deck), géneros y, en completados, los años;
 *  · lo que te pareció: puntos fuertes (recuadro verde) y débiles o motivos (rojo).
 * Cada recuadro lleva su nombre accesible. Dentro de `detail-content`, que es lo que visten los temas.
 */
function DatosDelJuego({ tab, item }: { tab: TabId; item: GameItem }) {
  const D = UI_MESSAGES.detail;
  const fuertes = tab === 'c' || tab === 'v' || tab === 'e' ? item.strengths ?? [] : [];
  const malos = (tab === 'v' ? item.reasons : tab === 'c' || tab === 'e' ? item.weaknesses : undefined) ?? [];
  const anios = tab === 'c' ? yearsDesc(item.years) : [];
  return (
    <div className="detail-content gs-detail">
      <div className="gs-grupos">
        <div className="chips gs-grupo" role="group" aria-label={GAME_SHEET_UI.platformsAria}>
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
        {item.genres.length ? (
          <div className="gs-grupo" role="group" aria-label={GAME_SHEET_UI.genresAria}>
            {renderTags(item.genres, 'chip-genre', undefined, true)}
          </div>
        ) : null}
        {anios.length ? (
          <div className="gs-grupo" role="group" aria-label={D.yearsCompleted}>
            {renderTags(anios, 'chip-generic')}
          </div>
        ) : null}
      </div>
      {fuertes.length || malos.length ? (
        <div className="gs-grupos">
          {fuertes.length ? (
            <div className="gs-grupo is-bueno" role="group" aria-label={D.strengths}>
              {renderTags(fuertes, 'chip-pf')}
            </div>
          ) : null}
          {malos.length ? (
            <div className="gs-grupo is-malo" role="group" aria-label={D.weaknesses}>
              {renderTags(malos, 'chip-pd')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * El renglón de un análisis: el comienzo del texto en tres renglones y la nota a la derecha, si es nota. Es el marcado
 * del renglón de persona (`HubPersonRow`) sin avatar ni nombre, escrito aquí para no arrastrar al panel el avatar del
 * hub, que solo usan tus amistades y va en su chunk.
 */
function RenglonDeAnalisis({ tab, item, aria, onOpen }: { tab: TabId; item: GameItem; aria: string; onOpen: () => void }) {
  return (
    <ul className="gs-friends">
      <li>
        <article
          className="hub-feed-card hub-user-card hub-person-row is-clickable"
          tabIndex={0}
          aria-label={aria}
          onClick={onOpen}
          onKeyDown={activarConTeclado(onOpen)}
        >
          <div className="hub-person-row-text">
            <span className="gs-snippet is-propio">{GAME_SHEET_UI.friendSnippet(item.review)}</span>
          </div>
          {llevaNota(tab, item) ? (
            <div className="hub-person-row-action">
              <ScoreDisplay game={item} />
            </div>
          ) : null}
        </article>
      </li>
    </ul>
  );
}

/**
 * EL BLOQUE DE LA AMISTAD desde cuyo perfil se abrió la ficha (F0.7), arriba del todo: su nombre como título, dónde lo
 * tiene y cuándo lo terminó, su nota, sus datos con el mismo marcado que los tuyos (ya filtrados por lo que ella
 * esconde) y su reseña, que lleva a la reseña entera en su perfil. Sin avatar: su nombre ya es el título.
 */
function BloqueDeAmistad({ entrada, onOpenReview }: { entrada: FriendGameEntry; onOpenReview: () => void }) {
  const { friend, tab, item } = entrada;
  return (
    <div className="hub-detail-metadata gs-sec-de-amistad">
      <div className="hub-metadata-section">
        <strong>{friend.name}</strong>
        <div className="gs-linea">
          <span className={`gs-pill is-${tab}`}>
            <Icon name={TAB_ICONS[tab]} />
            {GAME_SHEET_UI.listPill(tab)}
          </span>
          {item.finishedOn ? <span className="gs-desde">{GAME_SHEET_UI.finishedOn(item.finishedOn)}</span> : null}
          <Insignia tab={tab} item={item} />
          {llevaNota(tab, item) && !item.review ? <ScoreDisplay game={item} /> : null}
        </div>
        <DatosDelJuego tab={tab} item={item} />
        {item.review && !UNPLAYED_TAB_IDS.includes(tab) ? (
          <RenglonDeAnalisis tab={tab} item={item} aria={GAME_SHEET_UI.friendReviewAria(friend.name, item.name)} onOpen={onOpenReview} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * UN JUEGO QUE NO TIENES (abierto desde el feed, una reseña, el buscador o el perfil de una amistad): en vez de mover,
 * editar y borrar, añadirlo a deseados o a próximos, con lo que se sepa de él (sus plataformas, si alguna amistad lo
 * tiene). Al añadirlo, la ficha pasa a ser la tuya sin cerrarse.
 */
const BarraDeAnadir = forwardRef<HTMLElement, { name: string; platforms: string[]; onAddGame: GameSheetPanelProps['onAddGame'] }>(
  function BarraDeAnadir({ name, platforms, onAddGame }, ref) {
    const A = UI_MESSAGES.rouletteActions;
    return (
      <footer className="gs-bar" ref={ref}>
        {/* Con su nombre en `aria-label`: en el panel estrecho y en el móvil solo el primero enseña el texto. */}
        <button className="btn btn-secondary" type="button" aria-label={A.toWishlist} title={A.toWishlist} onClick={() => onAddGame({ name, platforms }, 'd')}>
          <Icon name={TAB_ICONS.d} />
          <span className="gs-bar-label">{A.toWishlist}</span>
        </button>
        <button className="btn btn-upcoming" type="button" aria-label={A.toProximos} title={A.toProximos} onClick={() => onAddGame({ name, platforms }, 'p')}>
          <Icon name={TAB_ICONS.p} />
          <span className="gs-bar-label">{A.toProximos}</span>
        </button>
      </footer>
    );
  },
);

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
export function GameSheetPanel(props: GameSheetPanelProps) {
  const { open, friendId = '', slug, data, pricesOn = false, priceTtlMs = null } = props;
  const { signals, missing } = useGameSheetFriendSignals(open);
  const deAmistad = useGameSheetFriendEntry(open, friendId, slug);
  const titulo = open && pricesOn ? priceTitle(data, slug, signals, deAmistad) : null;
  const price = useGamePrice(titulo, priceTtlMs);
  return <GameSheetPanelView {...props} signals={signals} missing={missing} friendEntry={deAmistad} price={titulo ? price : undefined} />;
}

/**
 * DE QUÉ JUEGO SE PIDE EL PRECIO: de uno de tus deseos (P3), con tu nombre, y de uno que no tienes (P5), con el de la
 * primera amistad que lo nombra, como lo enseña la ficha. De uno que ya tienes en otra lista, próximos incluidos, no
 * se pide nada (17-10-2026, decisión del usuario).
 */
function priceTitle(data: TabData, slug: string, signals: readonly GameSheetSignal[], deAmistad: FriendGameEntry | null): string | null {
  const own = findOwnEntry(data, slug);
  if (own) return own.tab === 'd' ? own.item.name : null;
  const deSuBloque = deAmistad?.item && matchesGameSheet(slug, deAmistad.item.name) ? deAmistad.item.name : null;
  return signalGameName(slug, signals) ?? deSuBloque;
}

/** Lo que la ficha sabe de tus amistades, ya cargado: lo pone `GameSheetPanel` o, con datos inventados, la maqueta. */
export interface GameSheetSocialData {
  /** Canal social (F3) e índice de bibliotecas (F4). */
  signals: readonly GameSheetSignal[];
  /** De cuántas amistades no se pudo leer la biblioteca. */
  missing: number;
  /** El bloque de la amistad desde cuyo perfil se abrió (F0.7), o `null`. */
  friendEntry: FriendGameEntry | null;
  /** El precio del juego, si es un deseo (P3) o no lo tienes (P5) y se sabe; `null` si ITAD no lo tiene. */
  price?: PrecioItad | null;
}

/**
 * LA FICHA, PINTADA: todo lo de `GameSheetPanel` salvo cargar lo de tus amistades, que llega por props. Así la maqueta
 * social (`docs/maquetas/social.tsx`) monta la ficha real con datos inventados, sin tocar el IndexedDB del origen de
 * desarrollo, que es el mismo que el de la app.
 */
export function GameSheetPanelView({
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
  onAddGame,
  friendId,
  signals: canalEIndice,
  missing,
  friendEntry: deAmistad,
  price,
}: GameSheetPanelProps & GameSheetSocialData) {
  // Lo de la amistad del bloque cuenta también para la ficha: así se abre aunque solo ella lo tenga.
  const signals = useMemo<readonly GameSheetSignal[]>(
    () => (deAmistad ? [...canalEIndice, { kind: 'library', friend: deAmistad.friend, tab: deAmistad.tab, item: deAmistad.item }] : canalEIndice),
    [canalEIndice, deAmistad],
  );
  const sheet = useGameSheetViewModel({ data, slug, signals });
  const visible = open && sheet !== null;

  /* LA SALIDA SE ANIMA (16-10-2026). La ficha la cierra la URL —se va el `?juego=`, y con él la ficha—, así que el
     panel guarda la última que enseñó y la sigue pintando mientras sale por la derecha (`.is-saliendo`); al terminar,
     se cierra el `<dialog>` y el foco vuelve a la fila. Se ajusta durante el render y no en un efecto: un efecto
     llegaría tarde, con el `<dialog>` ya cerrado y el panel desaparecido de golpe. Volver a abrir en mitad de la
     salida la corta y el panel entra otra vez. */
  const [mostrada, setMostrada] = useState<GameSheet | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  if (visible && sheet && (mostrada !== sheet || saliendo)) {
    setMostrada(sheet);
    setSaliendo(false);
  }
  if (!visible && mostrada && !saliendo) setSaliendo(true);
  const ficha = visible ? sheet : mostrada;
  const terminarSalida = useCallback(() => {
    setSaliendo(false);
    setMostrada(null);
  }, []);
  // Mientras sale, ni Esc, ni pulsar fuera, ni la X vuelven a cerrar: la URL ya está cerrada y sería otro «atrás».
  const cerrar = useCallback(() => {
    if (visible) onClose();
  }, [visible, onClose]);

  const dialogRef = useNativeDialog(visible || saliendo, cerrar);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const { covers } = useCovers();
  const key = ficha?.slug ?? '';
  const { width, showFiller } = useGameSheetWidth(visible, key, scrollRef, contentRef, Boolean(ficha?.wishers.length));
  const navigate = useNavigate();
  // Su perfil CON EL JUEGO ABIERTO y su bloque arriba (F0.7).
  const nombreAbierto = ficha?.name ?? '';
  const openFriend = useCallback((profileId: string) => {
    void navigate(`${generatePath(SOCIAL_ROUTES.profileDetail, { profileId })}${gameSheetSearch(nombreAbierto, profileId)}`);
  }, [navigate, nombreAbierto]);
  const openFriendReview = useCallback(() => {
    if (!deAmistad) return;
    void navigate(generatePath(SOCIAL_ROUTES.profileReview, { profileId: deAmistad.friend.id, gameId: String(deAmistad.item.id) }));
  }, [navigate, deAmistad]);
  const swipe = useSwipeToClose(panelRef, cerrar);
  /* EL DOBLE CLIC SOBRE UN JUEGO EDITA (17-10-2026). La fila abre la ficha al primer clic, así que el segundo cae en el
     velo: aquí se convierte en editar, con el formulario encima de la ficha, como su botón «Editar». No desde el perfil
     de una amistad (`?de=`): el doble clic sobre su juego no edita el tuyo. */
  const editarConDobleClic = () => {
    const propia = ficha?.own;
    if (visible && propia && !friendId) onEdit(propia.tab, propia.item.id);
  };

  /* Si no hay animación que esperar, la salida termina ya: con «reducir movimiento», o si el panel ya se fue
     deslizándolo con el dedo (`.is-gesto` lo deja fuera y apaga la animación). Y, por si `animationend` no llega
     (una pestaña en segundo plano no anima), un tope un poco más largo que la animación. */
  useEffect(() => {
    if (!saliendo) return undefined;
    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (sinMovimiento || panelRef.current?.classList.contains('is-gesto')) {
      terminarSalida();
      return undefined;
    }
    const tope = window.setTimeout(terminarSalida, SALIDA_MS + 150);
    return () => window.clearTimeout(tope);
  }, [saliendo, terminarSalida]);

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

  const own = ficha?.own ?? null;
  // El bloque de la amistad, solo si es de ESTA ficha; y ella, fuera de la lista de abajo, donde se repetiría.
  const bloque = deAmistad && ficha && deAmistad.item && matchesGameSheet(ficha.slug, deAmistad.item.name) ? deAmistad : null;
  const sinBloque = (lista: GameSheetFriend[]) => (bloque ? lista.filter((friend) => friend.id !== bloque.friend.id) : lista);
  const amigos = ficha ? sinBloque(ficha.friends) : [];
  const quieren = ficha ? sinBloque(ficha.wishers) : [];
  // El recuadro, de un deseo o de un juego que no tienes, y solo con un mejor precio: sin tienda que lo venda, la
  // cabecera se queda como sin precio.
  const conPrecio = Boolean((own === null || own.tab === 'd') && price?.mejor);
  const plataformas = ficha?.saga.find((entry) => entry.current)?.platforms ?? bloque?.item.platforms ?? [];
  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog gs-dialog${saliendo ? ' is-saliendo' : ''}`}
      aria-label={ficha ? GAME_SHEET_UI.panelAria(ficha.name) : undefined}
      onMouseDown={(event) => {
        // El segundo clic de un doble clic no cierra: es el de la fila, que ya abrió la ficha (ver `onDoubleClick`).
        if (event.target === event.currentTarget && event.detail < 2) cerrar();
      }}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) editarConDobleClic();
      }}
    >
      {ficha && (visible || saliendo) ? (
        <div
          ref={panelRef}
          className={`modal gs-panel ${width}`}
          {...swipe}
          onAnimationEnd={(event) => {
            if (saliendo && event.target === event.currentTarget && event.animationName.startsWith('gsSale')) terminarSalida();
          }}
        >
          <span className="gs-asa-lateral" aria-hidden="true" />
          <button className="btn-icon gs-close" type="button" onClick={cerrar} aria-label={GAME_SHEET_UI.close} title={GAME_SHEET_UI.close}>
            <Icon name={COMMON_ICONS.close} />
          </button>
          <div className="gs-scroll" key={ficha.slug} ref={scrollRef}>
            <div className="gs-contenido" ref={contentRef}>
              {/* Con ancho, el lado de la cabecera es la saga (sin ella, ese hueco quedaba vacío); en estrecho, la saga
                  va al final del cuerpo. Se pinta en los dos sitios y el CSS esconde la que no toca. */}
              <Cabecera
                sheet={ficha}
                covers={covers}
                lado={ficha.saga.length ? <Saga saga={ficha.saga} onOpenGame={onOpenGame} covers={covers} className="is-cabecera" /> : null}
              />
              <div className="gs-cuerpo">
                {bloque ? <BloqueDeAmistad entrada={bloque} onOpenReview={openFriendReview} /> : null}
                {/* EL PRECIO, PRIMERA SECCIÓN DEL CUERPO (16-10-2026, decisión del usuario). En el lado de la cabecera
                    (F0.15) la estiraba muy por encima de la carátula y dejaba vacía la columna del título; aquí lo
                    reparten las columnas del cuerpo como a lo demás. Detrás del bloque de una amistad, que va arriba
                    (F0.7). */}
                {conPrecio && price ? (
                  <div className="hub-detail-metadata gs-sec-precio">
                    <Suspense fallback={null}>
                      <PriceBox precio={price} name={ficha.name} />
                    </Suspense>
                  </div>
                ) : null}
                {own ? <TusDatos tab={own.tab} item={own.item} reviewTarget={reviewTarget} conTitulo={Boolean(bloque)} /> : null}
                {amigos.length || quieren.length ? (
                  <Suspense fallback={null}>
                    <GameSheetFriends
                      friends={amigos}
                      wishers={quieren}
                      showWishers={showFiller}
                      missing={missing}
                      onOpenFriend={openFriend}
                    />
                  </Suspense>
                ) : null}
                <Saga saga={ficha.saga} onOpenGame={onOpenGame} covers={covers} className="is-solo-estrecho" />
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
          ) : (
            <BarraDeAnadir ref={barRef} name={ficha.name} platforms={plataformas} onAddGame={onAddGame} />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
