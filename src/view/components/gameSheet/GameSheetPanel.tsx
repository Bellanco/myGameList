import { Suspense, forwardRef, lazy, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { GAME_SHEET_UI } from '../../../core/constants/gameSheetLabels';
import { COMMON_ICONS, TAB_ICONS } from '../../../core/constants/icons';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { coverDeCaja, type PedidoDePortada } from '../../../core/utils/coverDelListado';
import { starsFromGrade } from '../../../core/utils/scoreScale';
import type { GameSheet, GameSheetSagaEntry } from '../../../core/gameSheet/buildGameSheet';
import { UNPLAYED_TAB_IDS, type GameItem, type TabData, type TabId } from '../../../model/types/game';
import { useGameSheetFriendSignals } from '../../../viewmodel/gameSheet/useGameSheetFriendSignals';
import { useGameSheetViewModel } from '../../../viewmodel/gameSheet/useGameSheetViewModel';
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

/** Lo que dura la salida del panel (`gsSale` en `styles/gameSheet.scss`). */
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
 * TODO LO QUE ENSEÑABA EL DETALLE DE LA FILA (F0.12), con su mismo marcado (`detail-content`, `detail-box`, chips e
 * insignias) y sus mismas reglas por lista: años y rejugar en completados, puntos fuertes en c/v/e, débiles en c/e,
 * motivos en v y reintentar en v. La nota y las horas no van aquí: suben a las cifras de la cabecera.
 *
 * ORDEN, DE LO QUE ES EL JUEGO A LO QUE TE PARECIÓ (16-10-2026):
 *  · arriba, los renglones de chips SIN TÍTULO (F0.14): plataformas, géneros y, en completados, los años. Cada uno en
 *    su renglón y separados por un filete, porque sin rótulo un género como «Plataformas» se confundía con las
 *    plataformas de encima;
 *  · debajo, puntos fuertes y débiles, en dos columnas iguales;
 *  · al final, rejugar o reintentar, con su rótulo y la insignia en la misma línea.
 */
function TusDatos({ tab, item }: { tab: TabId; item: GameItem }) {
  const D = UI_MESSAGES.detail;
  const fuertes = tab === 'c' || tab === 'v' || tab === 'e' ? item.strengths : undefined;
  const malos = tab === 'v' ? item.reasons : tab === 'c' || tab === 'e' ? item.weaknesses : undefined;
  const anios = tab === 'c' ? yearsDesc(item.years) : [];
  return (
    <div className="hub-detail-metadata gs-sec-datos">
      <div className="hub-metadata-section">
        {/* Un solo `detail-content`, como el detalle de la fila: es el que Persona, Arcade y Cyberpunk visten. */}
        <div className="detail-content gs-detail">
          <div className="detail-box gs-renglon" aria-label={GAME_SHEET_UI.platformsAria}>
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
          {item.genres.length ? (
            <div className="detail-box gs-renglon" aria-label={GAME_SHEET_UI.genresAria}>
              {renderTags(item.genres, 'chip-genre', undefined, true)}
            </div>
          ) : null}
          {anios.length ? (
            <div className="detail-box gs-renglon" aria-label={GAME_SHEET_UI.yearsAria}>
              {renderTags(anios, 'chip-generic')}
            </div>
          ) : null}
          {fuertes?.length ? (
            <div className="detail-box detail-strong">
              <span className="detail-label">{D.strengths}</span>
              <div>{renderTags(fuertes, 'chip-pf')}</div>
            </div>
          ) : null}
          {malos?.length ? (
            <div className="detail-box detail-weak">
              <span className="detail-label">{D.weaknesses}</span>
              <div>{renderTags(malos, 'chip-pd')}</div>
            </div>
          ) : null}
          {tab === 'c' || tab === 'v' ? (
            <div className="detail-box gs-insignia">
              <span className="detail-label">{tab === 'c' ? D.replayability : D.retry}</span>
              {renderBooleanBadge(tab === 'c' ? 'replayable' : 'retry', Boolean(tab === 'c' ? item.replayable : item.retry))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * TU ANÁLISIS, VESTIDO COMO EL DE UNA AMISTAD (16-10-2026): el mismo renglón de persona (el de `HubPersonRow`), con el
 * comienzo del texto entre comillas, recortado a tres renglones, y tu nota a la derecha cuando la hay (la misma regla
 * que en la cabecera). SIN AVATAR NI NOMBRE: dicen de quién es, y aquí se sabe; sin ellos el texto gana el sitio. En
 * su propio bloque, para que las columnas del cuerpo lo puedan repartir aparte de los datos. Tocarlo lleva al análisis
 * entero, a la misma pantalla que «Ver análisis» desde la tabla.
 */
function Analisis({ tab, item, reviewTarget }: { tab: TabId; item: GameItem; reviewTarget: GameSheetReviewTarget }) {
  const D = UI_MESSAGES.detail;
  const navigate = useNavigate();
  if (!item.review || UNPLAYED_TAB_IDS.includes(tab)) return null;
  const destino = reviewTarget(tab, item);
  const abrir = () => { void navigate(destino.to, { state: destino.state }); };
  return (
    <div className="hub-detail-metadata gs-sec-analisis">
      <div className="hub-metadata-section">
        <strong>{D.review}</strong>
        <ul className="gs-friends">
          <li>
            {/* El marcado del renglón de persona (`HubPersonRow`) sin avatar ni nombre, escrito aquí para no arrastrar
                al panel el avatar del hub, que solo usan tus amistades y va en su chunk. */}
            <article
              className="hub-feed-card hub-user-card hub-person-row is-clickable"
              tabIndex={0}
              aria-label={D.reviewLinkAria(item.name)}
              onClick={abrir}
              onKeyDown={activarConTeclado(abrir)}
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
  const { signals, missing } = useGameSheetFriendSignals(open);
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
  // Su perfil (F0.7). Con el juego abierto llegará en la F5, cuando su perfil abra la ficha.
  const openFriend = useCallback((profileId: string) => {
    void navigate(generatePath(SOCIAL_ROUTES.profileDetail, { profileId }));
  }, [navigate]);
  const swipe = useSwipeToClose(panelRef, cerrar);

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
  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog gs-dialog${saliendo ? ' is-saliendo' : ''}`}
      aria-label={ficha ? GAME_SHEET_UI.panelAria(ficha.name) : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cerrar();
      }}
    >
      {ficha && (visible || saliendo) ? (
        <div
          ref={panelRef}
          className={`modal gs-panel ${width}`}
          {...swipe}
          onAnimationEnd={(event) => {
            if (saliendo && event.target === event.currentTarget && event.animationName === 'gsSale') terminarSalida();
          }}
        >
          <span className="gs-asa-lateral" aria-hidden="true" />
          <button className="btn-icon gs-close" type="button" onClick={cerrar} aria-label={GAME_SHEET_UI.close} title={GAME_SHEET_UI.close}>
            <Icon name={COMMON_ICONS.close} />
          </button>
          <div className="gs-scroll" key={ficha.slug} ref={scrollRef}>
            <div className="gs-contenido" ref={contentRef}>
              {/* Con ancho, el lado de la cabecera es la saga (sin precio, ese hueco quedaba vacío); en estrecho, la
                  saga va al final del cuerpo. Se pinta en los dos sitios y el CSS esconde la que no toca. */}
              <Cabecera
                sheet={ficha}
                covers={covers}
                lado={ficha.saga.length ? <Saga saga={ficha.saga} onOpenGame={onOpenGame} covers={covers} className="is-cabecera" /> : null}
              />
              <div className="gs-cuerpo">
                {own ? <TusDatos tab={own.tab} item={own.item} /> : null}
                {own ? <Analisis tab={own.tab} item={own.item} reviewTarget={reviewTarget} /> : null}
                {ficha.friends.length || ficha.wishers.length ? (
                  <Suspense fallback={null}>
                    <GameSheetFriends
                      friends={ficha.friends}
                      wishers={ficha.wishers}
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
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
