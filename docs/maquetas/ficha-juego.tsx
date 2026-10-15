// MAQUETA DESECHABLE de la ficha de juego (`docs/plan-ficha-de-juego-y-precios.md`): un panel que entra por la
// derecha, casi a toda pantalla, sin cabecera de modal, en columnas y con los botones fijos abajo. En el móvil, la
// pantalla entera. Ver `ficha-juego.html` para los parámetros.
//
// Detrás va la tabla REAL (`GameTable`) con una biblioteca inventada. Tocar una fila ya no despliega el detalle:
// abre la ficha, que lo sustituye. Abrirla añade `?juego=<clave>` a la URL con `pushState`, así que «atrás» la cierra
// en vez de salir de la lista. Es lo que haría la app.
//
// La ficha usa las piezas reales del hub y de los modales (`useNativeDialog`, `.modal`, `HubPersonRow`, `GameCover`,
// `StarRating`, `ScoreDisplay`). Lo único propio es `ficha-juego.scss`, que sería la hoja del modal.
//
// Carátulas: la ficha las pide en `solo-cache` al gemelo `localCoverApi`, que sirve lo ya resuelto en
// `.covers.local.json`. Sin ese fichero sale la portada de casa, que también vale para ver la composición.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/styles/index.scss';
import '../../src/styles/social.scss';
import './ficha-juego.scss';
import { IconSprite } from '../../src/view/components/IconSprite';
import { IconSpriteRest } from '../../src/view/components/IconSpriteRest';
import { Icon } from '../../src/view/components/Icon';
import { GameCover } from '../../src/view/components/GameCover';
import { GameTable } from '../../src/view/components/GameTable';
import { StarRating } from '../../src/view/components/StarRating';
import { ScoreDisplay } from '../../src/view/components/ScoreDisplay';
import { HubPersonRow } from '../../src/view/components/socialhub/HubPersonRow';
import { HubAvatar } from '../../src/view/components/socialhub/HubAvatar';
import { useNativeDialog } from '../../src/view/modals/useNativeDialog';
import { coverUrl } from '../../src/core/utils/coverUrl';
import { gameTitleKey } from '../../src/core/utils/gameTitleKey';
import { sharedSagaName } from '../../src/core/utils/gameSaga';
import { starsFromGrade } from '../../src/core/utils/scoreScale';
import { TAB_ACTIONS, UI_MESSAGES } from '../../src/core/constants/labels';
import { COMMON_ICONS } from '../../src/core/constants/icons';
import { categoryToneStyle } from '../../src/core/constants/categoryTone';
import { TAB_ICONS } from '../../src/core/constants/icons';
import { APP_LOCALE } from '../../src/core/constants/locale';
import { parsePaletteId } from '../../src/core/constants/palettes';
import { loadPaletteSkin } from '../../src/view/hooks/paletteSkin';
import type { GameItem, TabId } from '../../src/model/types/game';

loadPaletteSkin(parsePaletteId(document.documentElement.dataset.palette));

const params = new URLSearchParams(window.location.search);
const lista: 'c' | 'd' = params.get('lista') === 'c' ? 'c' : 'd';
const conSocial = params.get('social') !== '0';
// `?precio=0`: el servicio de precios no responde (sin red, ITAD caído o sin cupo). El bloque no se pinta.
const conPrecio = params.get('precio') !== '0';
const avisar = (que: string) => () => window.alert(`En la app: ${que}`);

// ─── Biblioteca inventada ────────────────────────────────────────────────────────────────────────────────────
const AHORA = Date.now();
function juego(id: number, name: string, extra: Partial<GameItem> = {}): GameItem {
  return { id, _ts: AHORA, name, platforms: ['PC'], genres: [], steamDeck: false, review: '', ...extra };
}

const BIBLIOTECA: Record<'c' | 'd', GameItem[]> = {
  c: [
    juego(1, 'Hollow Knight', {
      platforms: ['PC', 'Switch'],
      genres: ['Metroidvania', 'Plataformas'],
      grade: 92,
      score: 5,
      hours: 46,
      years: [2024, 2018],
      replayable: true,
      steamDeck: true,
      strengths: ['Exploración', 'Banda sonora', 'Jefes'],
      weaknesses: ['Mapa de pago'],
      review:
        'Un mapa que se descubre a mano, con el cartógrafo escondido y las bancas como único respiro. Los jefes opcionales son lo mejor del juego y el Panteón, lo más exigente que he jugado. La banda sonora de Christopher Larkin acompaña cada zona sin cansar, y Ciudad Lágrima es de esos sitios que se quedan.',
    }),
    juego(2, 'Hades', { genres: ['Roguelike', 'Acción'], grade: 95, score: 5, hours: 70, years: [2021], replayable: true, strengths: ['Combate', 'Narrativa'], review: 'El roguelike que convierte cada muerte en una conversación nueva. Las armas cambian la partida entera y los dioses tienen voz propia.' }),
    juego(3, 'Celeste', { genres: ['Plataformas'], grade: 90, score: 5, hours: 14, years: [2019], strengths: ['Control'], review: 'Precisión pura con un corazón enorme. La cara B de cada capítulo es otro juego.' }),
    juego(4, 'Outer Wilds', { genres: ['Aventura', 'Exploración'], grade: 97, score: 5, hours: 22, years: [2022], review: 'El mejor juego que no se puede volver a jugar. Todo está ahí desde el principio; lo que cambia eres tú.' }),
    juego(5, 'Dark Souls 3', { genres: ['Acción', 'RPG'], grade: 85, score: 4, hours: 60, years: [2020], strengths: ['Jefes', 'Ambientación'], weaknesses: ['Lineal'], review: 'Más lineal que el primero, pero con los mejores jefes de la saga.' }),
  ],
  d: [
    juego(11, 'Hollow Knight: Silksong', { platforms: ['PC', 'Switch', 'PS5'], genres: ['Metroidvania', 'Plataformas'], grade: 80, score: 4 }),
    juego(12, 'Hades 2', { genres: ['Roguelike', 'Acción'], grade: 75, score: 4 }),
    juego(13, "Baldur's Gate 3", { genres: ['RPG'], grade: 70, score: 4 }),
  ],
};
const TODOS = [...BIBLIOTECA.c, ...BIBLIOTECA.d];
const listaDe = (id: number): 'c' | 'd' => (BIBLIOTECA.c.some((g) => g.id === id) ? 'c' : 'd');
const clave = (name: string) => gameTitleKey(name).replace(/ /g, '-');

// ─── Lo que llega de fuera: amistades y precios ──────────────────────────────────────────────────────────────
interface Amistad {
  nombre: string;
  tab: TabId;
  nota?: number;
  cuando?: string;
  adelanto?: string;
}

interface Precio {
  ahora: number;
  normal: number;
  descuento: number;
  tienda: string;
  minimo: number;
  minimoCuando: string;
}

const AMISTADES: Record<string, Amistad[]> = {
  'Hollow Knight: Silksong': [
    { nombre: 'Marta Ruiz', tab: 'c', nota: 95, cuando: 'sept. 2025', adelanto: 'Más difícil que el primero y mejor en casi todo: Hornet se mueve como nadie y cada zona tiene su idea.' },
    { nombre: 'Nacho', tab: 'c', nota: 88, cuando: 'oct. 2025', adelanto: 'El acto 3 se alarga, pero el combate engancha de principio a fin.' },
    { nombre: 'Álvaro', tab: 'v', nota: 60, adelanto: 'Me pudo la dificultad de los jefes de la Ciudadela.' },
    { nombre: 'Lucía', tab: 'e' },
    { nombre: 'Sara', tab: 'd' },
    { nombre: 'Pablo', tab: 'd' },
  ],
  'Hollow Knight': [
    { nombre: 'Marta Ruiz', tab: 'c', nota: 98, cuando: 'mayo 2023', adelanto: 'Mi metroidvania favorito. Volvería a borrarme la memoria para jugarlo otra vez.' },
    { nombre: 'Lucía', tab: 'c', nota: 90, cuando: 'feb. 2024', adelanto: 'Las Tierras Desoladas me tuvieron perdida una tarde entera y no me importó.' },
    { nombre: 'Nacho', tab: 'c', nota: 85, cuando: 'ago. 2022' },
    { nombre: 'Álvaro', tab: 'p' },
  ],
  Hades: [
    { nombre: 'Nacho', tab: 'c', nota: 92, cuando: 'mar. 2021', adelanto: 'Cien horas y sigo encontrando diálogos nuevos.' },
    { nombre: 'Sara', tab: 'e' },
  ],
  'Hades 2': [{ nombre: 'Nacho', tab: 'e' }],
  'Outer Wilds': [{ nombre: 'Lucía', tab: 'c', nota: 99, cuando: 'jul. 2023', adelanto: 'Lo que hace con la curiosidad no lo ha hecho nadie más.' }],
};

const PRECIOS: Record<string, Precio> = {
  'Hollow Knight: Silksong': { ahora: 15.99, normal: 19.99, descuento: 20, tienda: 'GOG', minimo: 15.99, minimoCuando: 'jun. 2026' },
  'Hades 2': { ahora: 22.49, normal: 29.99, descuento: 25, tienda: 'Steam', minimo: 19.49, minimoCuando: 'ago. 2026' },
  "Baldur's Gate 3": { ahora: 59.99, normal: 59.99, descuento: 0, tienda: 'Steam', minimo: 41.99, minimoCuando: 'nov. 2025' },
};

const LISTA: Record<TabId, string> = { c: 'Completado', v: 'Abandonado', e: 'En curso', p: 'En próximos', d: 'En tus deseos' };
const euros = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: 'EUR' });

// ─── Piezas de la ficha ──────────────────────────────────────────────────────────────────────────────────────
function PrecioBloque({ p }: { p: Precio }) {
  const enMinimo = p.ahora <= p.minimo;
  return (
    <section className="gs-price" aria-label="Precio">
      <div className="gs-price-main">
        <span className="gs-price-now">{euros.format(p.ahora)}</span>
        {p.descuento > 0 ? <span className="gs-price-cut">−{p.descuento} %</span> : null}
        {p.descuento > 0 ? <span className="gs-price-regular">{euros.format(p.normal)}</span> : null}
      </div>
      {enMinimo ? <span className="gs-price-low">Mínimo histórico</span> : null}
      <p className="gs-price-meta">
        {p.descuento > 0 ? `Mejor precio en ${p.tienda}.` : `Sin oferta ahora. Precio en ${p.tienda}.`}{' '}
        {enMinimo ? `Igual que en ${p.minimoCuando}.` : `Mínimo: ${euros.format(p.minimo)} (${p.minimoCuando}).`}
      </p>
      <div className="gs-price-actions">
        <a className="btn btn-primary" href="#tienda" onClick={avisar(`abre ${p.tienda} con el enlace de IsThereAnyDeal`)}>
          Ver en {p.tienda}
        </a>
        <a className="gs-price-credit" href="#itad" onClick={avisar('abre la ficha en IsThereAnyDeal')}>
          Precios de IsThereAnyDeal
        </a>
      </div>
    </section>
  );
}

/** Sin cabecera de modal: el nombre va aquí, junto a la carátula. La X va en la esquina del panel. */
function Cabecera({ g, tab, amistades }: { g: GameItem; tab: 'c' | 'd'; amistades: Amistad[] }) {
  const loTienen = amistades.filter((a) => a.tab !== 'd');
  const notas = loTienen.map((a) => a.nota).filter((n): n is number => typeof n === 'number');
  const media = notas.length >= 3 ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
  return (
    <header className="gs-head">
      <div className="gs-cover">
        <GameCover name={g.name} src={coverUrl(g.name, ['PC'], 'normal', 'solo-cache')} src2x={coverUrl(g.name, ['PC'], 'medio', 'solo-cache')} />
      </div>
      <div className="gs-head-text">
        <h2 className="gs-title">{g.name}</h2>
        <div className="gs-pills">
          <span className={`gs-pill is-${tab}`}>
            <Icon name={TAB_ICONS[tab]} />
            {LISTA[tab]}
          </span>
        </div>
        {conSocial && loTienen.length ? (
          <dl className="gs-numbers">
            {media !== null ? (
              <div>
                <dt>Media de tus amistades</dt>
                <dd>{media} <small>· {notas.length} notas</small></dd>
              </div>
            ) : null}
            <div>
              <dt>Lo tienen</dt>
              <dd>{loTienen.length} <small>{loTienen.length === 1 ? 'amistad' : 'amistades'}</small></dd>
            </div>
          </dl>
        ) : null}
      </div>
    </header>
  );
}

// Los ayudantes del detalle de hoy (`GameTable.tsx:325-400`), copiados tal cual para la maqueta. En la app salen
// de `GameTable` a un módulo compartido y los usan la tabla y la ficha.
function chips(values: string[], className: string, tone = false) {
  if (!values.length) return <span className="chip-none" aria-hidden="true">—</span>;
  return (
    <div className="chips">
      {values.map((value) => (
        <span key={value} className={`chip ${className}`} style={tone ? categoryToneStyle(value) : undefined} data-text={value}>
          <span className="chip-text">{value}</span>
        </span>
      ))}
    </div>
  );
}

function insignia(type: 'replayable' | 'retry', value: boolean) {
  const label = type === 'replayable' ? UI_MESSAGES.table.replayBadge(value) : UI_MESSAGES.table.retryBadge(value);
  const cls = type === 'replayable' ? (value ? 'badge-rejugar-activo' : 'badge-rejugar-inactivo') : value ? 'badge-opp-activo' : 'badge-opp-inactivo';
  const icon = value ? (type === 'replayable' ? COMMON_ICONS.starOliveBranches : COMMON_ICONS.refresh) : COMMON_ICONS.lock;
  return (
    <span className={cls} role="img" aria-label={label} title={label}>
      <Icon name={icon} />
    </span>
  );
}

/**
 * TODO LO QUE ENSEÑA HOY EL DETALLE DE LA FILA, con su mismo marcado (`detail-content`, `detail-box`, chips e
 * insignias) y las mismas reglas por lista: años y rejugar solo en completados, horas en completados y abandonados,
 * puntos fuertes en c/v/e, débiles en c/e, motivos en v, reintentar en v. Así los temas que ya visten el detalle lo
 * visten aquí igual.
 */
function TusDatos({ g, tab }: { g: GameItem; tab: TabId }) {
  const D = UI_MESSAGES.detail;
  const sinJugar = tab === 'p' || tab === 'd';
  return (
    <div className="hub-detail-metadata gs-sec-datos">
      <div className="hub-metadata-section">
        <strong>Tus datos</strong>
        <div className="detail-content gs-detail">
          <div className="detail-box">
            <span className="detail-label">{D.platforms}</span>
            <div className="chips">
              {g.platforms.map((v) => (
                <span key={v} className="chip chip-plat" data-text={v}>
                  <span className="chip-text">{v}</span>
                </span>
              ))}
              {g.steamDeck ? (
                <span className="chip chip-deck">
                  <Icon name={COMMON_ICONS.steamDeck} />
                  <span>{D.steamDeck}</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="detail-box">
            <span className="detail-label">{D.genres}</span>
            <div>{chips(g.genres, 'chip-genre', true)}</div>
          </div>
          {tab === 'c' && g.years?.length ? (
            <div className="detail-box">
              <span className="detail-label">{D.yearsCompleted}</span>
              <div>{chips([...g.years].sort((x, y) => y - x).map(String), 'chip-generic')}</div>
            </div>
          ) : null}
          {(tab === 'c' || tab === 'v') && (g.hours ?? 0) > 0 ? (
            <div className="detail-box">
              <span className="detail-label">{D.playtime}</span>
              <div>{D.hoursSuffix(String(g.hours).replace('.', ','))}</div>
            </div>
          ) : null}
          {(tab === 'c' || tab === 'v' || tab === 'e') && g.strengths?.length ? (
            <div className="detail-box detail-strong">
              <span className="detail-label">{D.strengths}</span>
              <div>{chips(g.strengths, 'chip-pf')}</div>
            </div>
          ) : null}
          {(tab === 'c' || tab === 'e') && g.weaknesses?.length ? (
            <div className="detail-box detail-weak">
              <span className="detail-label">{D.weaknesses}</span>
              <div>{chips(g.weaknesses, 'chip-pd')}</div>
            </div>
          ) : null}
          {tab === 'v' && g.reasons?.length ? (
            <div className="detail-box detail-weak">
              <span className="detail-label">{D.weaknesses}</span>
              <div>{chips(g.reasons, 'chip-pd')}</div>
            </div>
          ) : null}
          {tab === 'c' || sinJugar || (tab === 'v' && g.scored) ? (
            <div className="detail-box">
              <span className="detail-label">{sinJugar ? D.interest : D.score}</span>
              <div>
                <ScoreDisplay game={g} />
              </div>
            </div>
          ) : null}
          {tab === 'c' ? (
            <div className="detail-box">
              <span className="detail-label">{D.replayability}</span>
              <div>{insignia('replayable', Boolean(g.replayable))}</div>
            </div>
          ) : null}
          {tab === 'v' ? (
            <div className="detail-box">
              <span className="detail-label">{D.retry}</span>
              <div>{insignia('retry', Boolean(g.retry))}</div>
            </div>
          ) : null}
        </div>
        {g.review ? (
          <div className="gs-review-box">
            <span className="detail-label">{D.review}</span>
            <p className="hub-feed-review-text gs-review">{g.review}</p>
            <a className="btn btn-open" href="#resena" onClick={avisar('abre tu reseña en /stats/resenas')} aria-label={D.reviewLinkAria(g.name)}>
              <Icon name={COMMON_ICONS.arrowsToEye} />
              <span>{D.reviewLink}</span>
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Amistades({ amistades }: { amistades: Amistad[] }) {
  const loTienen = amistades.filter((a) => a.tab !== 'd');
  const loQuieren = amistades.filter((a) => a.tab === 'd');
  if (!amistades.length) return null;
  // Orden: con reseña primero y, dentro, por nota.
  const orden = [...loTienen].sort((a, b) => Number(Boolean(b.adelanto)) - Number(Boolean(a.adelanto)) || (b.nota ?? -1) - (a.nota ?? -1));
  return (
    <div className="hub-detail-metadata gs-sec-amigos">
      {orden.length ? (
        <div className="hub-metadata-section">
          <strong>Tus amistades</strong>
          <ul className="gs-friends">
            {orden.map((a) => (
              <li key={a.nombre}>
                <HubPersonRow
                  name={a.nombre}
                  status={
                    <>
                      <span className={`hub-person-row-status is-${a.tab}`}>
                        <b>{LISTA[a.tab]}</b>
                        {a.cuando ? ` · ${a.cuando}` : ''}
                      </span>
                      {a.adelanto ? <span className="gs-snippet">«{a.adelanto}»</span> : null}
                    </>
                  }
                  onOpen={avisar(a.adelanto ? `abre la reseña de ${a.nombre}` : `abre el perfil de ${a.nombre}`)}
                  openAriaLabel={a.adelanto ? `Leer la reseña de ${a.nombre}` : `Ver el perfil de ${a.nombre}`}
                >
                  {typeof a.nota === 'number' ? <StarRating value={starsFromGrade(a.nota)} /> : null}
                </HubPersonRow>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {loQuieren.length ? (
        <div className="hub-metadata-section">
          <strong>Lo quieren</strong>
          <ul className="gs-wanters">
            {loQuieren.map((a) => (
              <li key={a.nombre} className="gs-wanter">
                <HubAvatar />
                {a.nombre}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Saga({ g, onOpen }: { g: GameItem; onOpen: (id: number) => void }) {
  // La saga, con la regla real (`sharedSagaName`) sobre tu biblioteca. En la app se suman las de tus amistades.
  const entregas = TODOS.filter((o) => o.id === g.id || sharedSagaName(g.name, o.name));
  if (entregas.length < 2) return null;
  return (
    <div className="hub-detail-metadata gs-sec-saga">
      <div className="hub-metadata-section">
        <strong>Saga</strong>
        <ul className="gs-saga">
          {entregas.map((s) => {
            const amistades = (AMISTADES[s.name] || []).filter((a) => a.tab !== 'd').length;
            const tuya = `Tú: ${listaDe(s.id) === 'c' ? 'Completado' : 'en deseos'}`;
            return (
              <li key={s.id}>
                <button className="gs-saga-item" type="button" aria-current={s.id === g.id ? 'true' : undefined} onClick={() => onOpen(s.id)}>
                  <GameCover name={s.name} src={coverUrl(s.name, ['PC'], 'normal', 'solo-cache')} />
                  <span className="gs-saga-name">{s.name}</span>
                  <span className="gs-saga-who">{conSocial && amistades ? `${tuya} · ${amistades} ${amistades === 1 ? 'amistad' : 'amistades'}` : tuya}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Los botones del detalle de hoy, fijos abajo: mover según la lista, editar, compartir (con reseña) y borrar. */
function BarraDeAcciones({ g, tab }: { g: GameItem; tab: 'c' | 'd' }) {
  return (
    <footer className="gs-bar">
      {TAB_ACTIONS[tab].map((a) => (
        <button key={a.target} className={`btn ${a.btnCls}`} type="button" onClick={avisar(`${a.label.toLowerCase()} (${tab} → ${a.target})`)}>
          <Icon name={a.icon} />
          <span className="gs-bar-label">{a.label}</span>
        </button>
      ))}
      <button className="btn btn-secondary" type="button" aria-label={`Editar ${g.name}`} onClick={avisar('abre el formulario del juego')}>
        <Icon name="edit" />
        <span className="gs-bar-label">Editar</span>
      </button>
      {tab === 'c' && g.review ? (
        <button className="btn btn-secondary" type="button" aria-label={`Compartir la reseña de ${g.name}`} onClick={avisar('abre «Compartir reseña»')}>
          <Icon name="share" />
          <span className="gs-bar-label">Compartir</span>
        </button>
      ) : null}
      <button className="btn btn-danger" type="button" aria-label={`Borrar ${g.name}`} onClick={avisar('pide confirmación y borra el juego')}>
        <Icon name="trash" />
        <span className="gs-bar-label">Borrar</span>
      </button>
    </footer>
  );
}

function FichaModal({ id, onClose, onOpen }: { id: number | null; onClose: () => void; onOpen: (id: number) => void }) {
  const open = id !== null;
  const dialogRef = useNativeDialog(open, onClose);
  const g = TODOS.find((x) => x.id === id) || null;
  const tab = g ? listaDe(g.id) : 'd';
  const amistades = g && conSocial ? AMISTADES[g.name] || [] : [];
  const precio = g && tab === 'd' && conPrecio ? PRECIOS[g.name] : undefined;
  // EL ESPACIO EN BLANCO, SIEMPRE EL MÍNIMO. El alto es siempre entero; el ancho se MIDE, de más estrecho a más
  // ancho, y se queda en el primero en el que todo cabe sin scroll:
  //   0 · una columna, 600 px;
  //   1 · dos columnas, 880 px;
  //   2 · dos columnas, 1.120 px (el tope; si tampoco cabe, aquí hace scroll el cuerpo).
  // Solo se pasa de 0 si hay algo que llevar a la segunda columna (amistades o saga). Se mide después de `showModal`
  // (el efecto de `useNativeDialog` va antes que este) y otra vez cada vez que el contenido cambia de tamaño
  // (`ResizeObserver`: la letra que llega tarde, una carátula, las amistades que llegan después). Ese caso SOLO
  // ensancha, así que no puede entrar en bucle. Cambiar el tamaño de la ventana sí vuelve a empezar por el más
  // estrecho. El panel entra deslizándose desde fuera, así que los cambios de ancho no llegan a verse.
  const scrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState<{ id: number; etapa: number } | null>(null);
  const [pasada, setPasada] = useState(0);
  const etapa = g !== null && medida?.id === g.id ? medida.etapa : 0;
  const hayLado = amistades.length > 0 || (g ? TODOS.some((o) => o.id !== g.id && sharedSagaName(g.name, o.name)) : false);

  useEffect(() => {
    const alCambiar = () => {
      setMedida(null);
      setPasada((n) => n + 1);
    };
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  useEffect(() => {
    const el = layoutRef.current;
    if (!open || !el) return;
    const observador = new ResizeObserver(() => setPasada((n) => n + 1));
    observador.observe(el);
    return () => observador.disconnect();
  }, [open, g]);

  useEffect(() => {
    const el = scrollRef.current;
    // En el móvil el panel es siempre la pantalla entera: no hay ancho que elegir.
    if (!open || !g || etapa >= 2 || !hayLado || !el || window.matchMedia('(max-width: 600px)').matches) return;
    if (el.scrollHeight > el.clientHeight + 1) setMedida({ id: g.id, etapa: etapa + 1 });
  }, [open, g, etapa, hayLado, pasada]);

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog gs-dialog"
      aria-label={g ? `Ficha de ${g.name}` : 'Ficha de juego'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && g ? (
        <div className={`modal gs-panel ${['is-estrecho', 'is-medio', 'is-ancho'][etapa]}`}>
          <button className="btn-icon gs-close" type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <Icon name="close" />
          </button>
          <div className="gs-scroll" key={g.id} ref={scrollRef}>
            {/* Dos columnas con ancho: lo tuyo a la izquierda (el precio también: solo sale en Deseados, que es donde
                tus datos son pocos) y lo de tus amistades a la derecha. En el móvil, una columna con el mismo orden. */}
            <div className="gs-layout" ref={layoutRef}>
              <div className="gs-main">
                <Cabecera g={g} tab={tab} amistades={amistades} />
                {precio ? <PrecioBloque p={precio} /> : null}
                <TusDatos g={g} tab={tab} />
              </div>
              {/* En el panel estrecho esta columna se disuelve (`display: contents`) y va debajo, por `order`. */}
              <div className="gs-side">
                <Amistades amistades={amistades} />
                <Saga g={g} onOpen={onOpen} />
              </div>
            </div>
          </div>
          <BarraDeAcciones g={g} tab={tab} />
        </div>
      ) : null}
    </dialog>
  );
}

// ─── La lista con la ficha encima ────────────────────────────────────────────────────────────────────────────
// `?juego=` en la URL: abrir hace `pushState` y «atrás» (o cerrar) lo quita. Acepta los alias de la primera
// versión de la maqueta (`silksong`, `hollow`).
const ALIAS: Record<string, string> = { silksong: clave('Hollow Knight: Silksong'), hollow: clave('Hollow Knight') };
function idDeLaUrl(): number | null {
  const valor = new URLSearchParams(window.location.search).get('juego');
  if (!valor) return null;
  const buscada = ALIAS[valor] || valor;
  return TODOS.find((g) => clave(g.name) === buscada)?.id ?? null;
}

function Pantalla(): ReactElement {
  const [abierto, setAbierto] = useState<number | null>(idDeLaUrl);

  useEffect(() => {
    const alVolver = () => setAbierto(idDeLaUrl());
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  const abrir = useCallback((id: number) => {
    const g = TODOS.find((x) => x.id === id);
    if (!g) return;
    const u = new URL(window.location.href);
    u.searchParams.set('juego', clave(g.name));
    // De una ficha a otra (la saga) se reemplaza: «atrás» vuelve a la lista, no a la ficha anterior.
    if (abierto === null) window.history.pushState({ ficha: true }, '', u);
    else window.history.replaceState({ ficha: true }, '', u);
    setAbierto(id);
  }, [abierto]);

  const cerrar = useCallback(() => {
    if ((window.history.state as { ficha?: boolean } | null)?.ficha) {
      window.history.back();
      return;
    }
    const u = new URL(window.location.href);
    u.searchParams.delete('juego');
    window.history.replaceState(null, '', u);
    setAbierto(null);
  }, []);

  return (
    <>
      <GameTable
        games={BIBLIOTECA[lista]}
        currentTab={lista}
        expandedId={null}
        onExpandedChange={(id) => {
          if (id !== null) abrir(id);
        }}
        onEdit={avisar('abre el formulario (doble clic, como hoy)')}
        onDelete={avisar('borra')}
        onMigrate={avisar('mueve de lista')}
        tabActions={TAB_ACTIONS[lista]}
      />
      <FichaModal id={abierto} onClose={cerrar} onOpen={abrir} />
    </>
  );
}

// ─── Barra de la maqueta (como la de social.tsx) ─────────────────────────────────────────────────────────────
const TEMAS = ['tierramedia', 'arcade', 'witcher', 'persona', 'portal', 'cyberpunk', 'seaofstars', 'grimdark'];

function Barra() {
  const ir = (cambios: Record<string, string>) => {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) u.searchParams.set(k, v);
      else u.searchParams.delete(k);
    }
    window.location.href = u.toString();
  };
  const raiz = document.documentElement;
  const tema = raiz.dataset.palette || 'tierramedia';
  const modo = raiz.dataset.theme === 'light' ? 'light' : 'dark';
  const caja: React.CSSProperties = { font: '12px/1.2 system-ui, sans-serif', padding: '4px 6px', borderRadius: 6, border: '1px solid #555', background: '#1b1d22', color: '#eee' };
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2147483000, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: 8, borderRadius: 10, background: 'rgba(15,16,20,.92)', boxShadow: '0 6px 20px rgba(0,0,0,.4)', maxWidth: 'calc(100vw - 24px)' }}>
      <select aria-label="Lista" style={caja} value={lista} onChange={(e) => ir({ lista: e.target.value, juego: '' })}>
        <option value="d">Deseados (con precio)</option>
        <option value="c">Completados</option>
      </select>
      <select aria-label="Precio" style={caja} value={conPrecio ? '1' : '0'} onChange={(e) => ir({ precio: e.target.value === '0' ? '0' : '' })}>
        <option value="1">Precio: responde</option>
        <option value="0">Precio: sin servicio</option>
      </select>
      <select aria-label="Social" style={caja} value={conSocial ? '1' : '0'} onChange={(e) => ir({ social: e.target.value === '0' ? '0' : '' })}>
        <option value="1">Con social</option>
        <option value="0">Sin social</option>
      </select>
      <select aria-label="Tema" style={caja} value={tema} onChange={(e) => ir({ 'gl-palette': e.target.value })}>
        {TEMAS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button type="button" style={{ ...caja, cursor: 'pointer' }} onClick={() => ir({ 'gl-theme': modo === 'dark' ? 'light' : 'dark' })}>
        {modo === 'dark' ? 'Oscuro → claro' : 'Claro → oscuro'}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <MemoryRouter>
    <IconSprite />
    <IconSpriteRest />
    <main id="contenido" className="main">
      <h1 className="sr-only">{lista === 'd' ? 'Deseados' : 'Completados'}</h1>
      <Pantalla />
    </main>
    {params.get('barra') !== '0' ? <Barra /> : null}
  </MemoryRouter>,
);
