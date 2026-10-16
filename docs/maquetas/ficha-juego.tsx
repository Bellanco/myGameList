import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type Ref, type RefObject } from 'react';
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
import { ScoreRing } from '../../src/view/components/ScoreRing';
import { HubPersonRow } from '../../src/view/components/socialhub/HubPersonRow';
import { HubAvatar } from '../../src/view/components/socialhub/HubAvatar';
import { useNativeDialog } from '../../src/view/modals/useNativeDialog';
import { coverUrl } from '../../src/core/utils/coverUrl';
import { gameTitleKey } from '../../src/core/utils/gameTitleKey';
import { sharedSagaName } from '../../src/core/utils/gameSaga';
import { resolveGrade, resolveStars, starsFromGrade, type ScoredLike } from '../../src/core/utils/scoreScale';
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
type Lista = 'c' | 'v' | 'e' | 'd';
const LISTAS: readonly Lista[] = ['c', 'v', 'e', 'd'];
const lista: Lista = (LISTAS as readonly string[]).includes(params.get('lista') || '') ? (params.get('lista') as Lista) : 'd';
const conSocial = params.get('social') !== '0';

const conPrecio = params.get('precio') !== '0';

const escala: 'stars' | 'grade' = params.get('nota') === '100' ? 'grade' : 'stars';

function Nota({ game }: { game: ScoredLike }) {
  return escala === 'grade' ? <ScoreRing grade={resolveGrade(game)} /> : <StarRating value={resolveStars(game)} />;
}
const avisar = (que: string) => () => window.alert(`En la app: ${que}`);

const AHORA = Date.now();
function juego(id: number, name: string, extra: Partial<GameItem> = {}): GameItem {
  return { id, _ts: AHORA, name, platforms: ['PC'], genres: [], steamDeck: false, review: '', ...extra };
}

const RESENA_LARGA = Array.from({ length: 14 }, (_, i) =>
  [
    'Empieza despacio y engancha a la tercera hora, cuando el sistema de combate termina de enseñar sus cartas.',
    'La historia no es lo mejor, pero los personajes secundarios sostienen los tramos más flojos.',
    'Hay picos de dificultad que obligan a repetir demasiado, y ahí es donde más se nota la falta de puntos de control.',
    'El apartado artístico aguanta muy bien el paso del tiempo.',
  ][i % 4],
).join(' ');

const BIBLIOTECA: Record<Lista, GameItem[]> = {
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
      enteredAt: { c: new Date(2024, 0, 20).getTime() },
      strengths: ['Exploración', 'Banda sonora', 'Jefes'],
      weaknesses: ['Mapa de pago'],
      review:
        'Un mapa que se descubre a mano, con el cartógrafo escondido y las bancas como único respiro. Los jefes opcionales son lo mejor del juego y el Panteón, lo más exigente que he jugado. La banda sonora de Christopher Larkin acompaña cada zona sin cansar, y Ciudad Lágrima es de esos sitios que se quedan.',
    }),
    juego(2, 'Hades', { genres: ['Roguelike', 'Acción'], grade: 95, score: 5, hours: 70, years: [2021], replayable: true, strengths: ['Combate', 'Narrativa'], review: 'El roguelike que convierte cada muerte en una conversación nueva. Las armas cambian la partida entera y los dioses tienen voz propia.' }),
    juego(3, 'Celeste', { genres: ['Plataformas'], grade: 90, score: 5, hours: 14, years: [2019], strengths: ['Control'], review: 'Precisión pura con un corazón enorme. La cara B de cada capítulo es otro juego.' }),
    juego(4, 'Outer Wilds', { genres: ['Aventura', 'Exploración'], grade: 97, score: 5, hours: 22, years: [2022], review: 'El mejor juego que no se puede volver a jugar. Todo está ahí desde el principio; lo que cambia eres tú.' }),
    juego(5, 'Dark Souls 3', { genres: ['Acción', 'RPG'], grade: 85, score: 4, hours: 60, years: [2020], strengths: ['Jefes', 'Ambientación'], weaknesses: ['Lineal'], review: 'Más lineal que el primero, pero con los mejores jefes de la saga.' }),
    juego(6, 'Portal', {
      platforms: ['Steam', 'GOG', 'Epic'],
      steamDeck: true,
      genres: ['Puzles', 'Coleccionista de criaturas'],
      grade: 94,
      score: 5,
      hours: 12.5,
      years: [2015, 2017, 2023, 2025, 2026],
      replayable: true,
      strengths: ['Jugabilidad', 'Historia', 'Ambientación', 'Diseño artístico', 'Protagonista'],
      weaknesses: ['Duración', 'Curva de dificultad', 'Movimiento del personaje'],
      review: RESENA_LARGA,
      enteredAt: { c: new Date(2015, 5, 2).getTime() },
    }),
    juego(7, 'Football Manager 2018', { platforms: ['Steam'], genres: ['Simulador de gestión'], score: 4, hours: 900, years: [2018], strengths: ['Jugabilidad'], weaknesses: ['Repetitividad'] }),
  ],
  v: [
    juego(21, 'Brütal Legend', {
      platforms: ['Steam', 'Amazon', 'itch.io'],
      steamDeck: true,
      genres: ['Tower Defense', 'Hack & Slash'],
      strengths: ['Ambientación', 'Banda Sonora'],
      reasons: ['Repetitividad', 'Jugabilidad', 'Minijuegos'],
      scored: true,
      grade: 29,
      score: 1,
      hours: 9.3,
      retry: true,
      review: RESENA_LARGA.slice(0, 1100),
    }),
    juego(22, 'Warhammer 40,000: Boltgun - Words of Vengeance', { platforms: ['Steam'], genres: ['FPS'], reasons: ['Frustración'], hours: 0.3, retry: false }),
  ],
  e: [
    juego(31, 'Persona 5 Strikers', { platforms: ['Steam'], genres: ['Musou'], strengths: ['Personajes', 'Diseño artístico', 'Música'], weaknesses: ['Cámara', 'Repetitividad', 'Frustración'], score: 0 }),
  ],
  d: [
    juego(11, 'Hollow Knight: Silksong', { platforms: ['PC', 'Switch', 'PS5'], genres: ['Metroidvania', 'Plataformas'], grade: 80, score: 4, enteredAt: { d: new Date(2026, 2, 10).getTime() } }),
    juego(12, 'Hades 2', { genres: ['Roguelike', 'Acción'], grade: 75, score: 4 }),
    juego(13, "Baldur's Gate 3", { genres: ['RPG'], grade: 70, score: 4 }),
    juego(14, 'Like a Dragon Gaiden: The Man Who Erased His Name', { platforms: ['Steam', 'Ubisoft Connect', 'Sega Mega Drive'], steamDeck: true, genres: ['Hack & Slash', 'Estrategia en tiempo real'], grade: 17, score: 1, enteredAt: { d: new Date(2025, 10, 3).getTime() } }),
  ],
};
const TODOS = LISTAS.flatMap((t) => BIBLIOTECA[t]);
const listaDe = (id: number): Lista => LISTAS.find((t) => BIBLIOTECA[t].some((g) => g.id === id)) ?? 'd';
const clave = (name: string) => gameTitleKey(name).replace(/ /g, '-');

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
  hasta?: string;
  minimo: number;
  minimoCuando: string;
  minimoAnio?: number;
  minimo3m?: number;
  otras: Array<{ tienda: string; precio: number; descuento: number }>;
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
  'Hollow Knight: Silksong': {
    ahora: 15.99, normal: 19.99, descuento: 20, tienda: 'GOG', hasta: '22 de octubre',
    minimo: 15.99, minimoCuando: 'jun. 2026', minimoAnio: 15.99, minimo3m: 15.99,
    otras: [{ tienda: 'Steam', precio: 17.99, descuento: 10 }, { tienda: 'Epic', precio: 19.99, descuento: 0 }],
  },
  'Hades 2': {
    ahora: 22.49, normal: 29.99, descuento: 25, tienda: 'Steam', hasta: '30 de octubre',
    minimo: 19.49, minimoCuando: 'ago. 2026', minimoAnio: 19.49, minimo3m: 19.49,
    otras: [{ tienda: 'GOG', precio: 23.99, descuento: 20 }, { tienda: 'Epic', precio: 29.99, descuento: 0 }],
  },
  "Baldur's Gate 3": {
    ahora: 59.99, normal: 59.99, descuento: 0, tienda: 'Steam',
    minimo: 41.99, minimoCuando: 'nov. 2025', minimoAnio: 47.99, minimo3m: 53.99,
    otras: [{ tienda: 'GOG', precio: 59.99, descuento: 0 }],
  },
  'Like a Dragon Gaiden: The Man Who Erased His Name': {
    ahora: 12.49, normal: 49.99, descuento: 75, tienda: 'Steam', hasta: '19 de octubre',
    minimo: 9.99, minimoCuando: 'mar. 2026', minimoAnio: 9.99, minimo3m: 14.99,
    otras: [{ tienda: 'Fanatical', precio: 13.29, descuento: 73 }, { tienda: 'Microsoft Store', precio: 49.99, descuento: 0 }],
  },
};

const LISTA: Record<TabId, string> = { c: 'Completado', v: 'Abandonado', e: 'En curso', p: 'En próximos', d: 'En tus deseos' };
const TITULO_LISTA: Record<Lista, string> = { c: 'Completados', v: 'Abandonados', e: 'En curso', d: 'Deseados' };
const euros = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: 'EUR' });
const mesYAnio = new Intl.DateTimeFormat(APP_LOCALE, { month: 'long', year: 'numeric' });

function PrecioBloque({ p }: { p: Precio }) {
  const enMinimo = p.ahora <= p.minimo;
  const minimos: Array<[string, number | undefined, string?]> = [
    ['Histórico', p.minimo, p.minimoCuando],
    ['Último año', p.minimoAnio],
    ['3 meses', p.minimo3m],
  ];
  return (
    <section className="gs-price" aria-label="Precio">
      <div className="gs-price-arriba">
        <div className="gs-price-main">
          <span className="gs-price-now">{euros.format(p.ahora)}</span>
          {p.descuento > 0 ? <span className="gs-price-cut">−{p.descuento} %</span> : null}
          {p.descuento > 0 ? <span className="gs-price-regular">{euros.format(p.normal)}</span> : null}
        </div>
        {enMinimo ? <span className="gs-price-low">Mínimo histórico</span> : null}
      </div>
      <p className="gs-price-donde">
        {p.descuento > 0 ? `En ${p.tienda}` : `Sin oferta ahora · ${p.tienda}`}
        {p.hasta ? <span> · hasta el {p.hasta}</span> : null}
      </p>
      <dl className="gs-price-minimos">
        {minimos.map(([etiqueta, valor, cuando]) =>
          typeof valor === 'number' ? (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>
                {euros.format(valor)}
                {cuando ? <small>{cuando}</small> : null}
              </dd>
            </div>
          ) : null,
        )}
      </dl>
      {p.otras.length ? (
        <ul className="gs-price-otras">
          {p.otras.slice(0, 2).map((o) => (
            <li key={o.tienda}>
              <span>{o.tienda}</span>
              <span className="gs-price-otras-precio">
                {euros.format(o.precio)}
                {o.descuento > 0 ? <small> −{o.descuento} %</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
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

function Cabecera({ g, tab, amistades, lado }: { g: GameItem; tab: Lista; amistades: Amistad[]; lado?: ReactElement | null }) {
  const loTienen = amistades.filter((a) => a.tab !== 'd');
  const notas = loTienen.map((a) => a.nota).filter((n): n is number => typeof n === 'number');
  const media = notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
  const desde = g.enteredAt?.[tab];
  const ultimoAnio = tab === 'c' && g.years?.length ? Math.max(...g.years) : null;
  const resumen = [g.platforms[0], g.genres[0], ultimoAnio].filter(Boolean).join(' · ');
  return (
    <header className="gs-head">
      <div className="gs-cover">
        <GameCover name={g.name} src={coverUrl(g.name, ['PC'], 'normal', 'solo-cache')} src2x={coverUrl(g.name, ['PC'], 'medio', 'solo-cache')} />
      </div>
      <div className="gs-head-text">
        <h2 className="gs-title">{g.name}</h2>
        <div className="gs-linea">
          <span className={`gs-pill is-${tab}`}>
            <Icon name={TAB_ICONS[tab]} />
            {LISTA[tab]}
          </span>
          {desde ? <span className="gs-desde">desde {mesYAnio.format(desde)}</span> : null}
        </div>
        {resumen ? <p className="gs-resumen">{resumen}</p> : null}
      </div>
      <dl className="gs-numbers gs-head-numbers">
          {tab === 'c' || tab === 'd' || (tab === 'v' && g.scored) ? (
            <div>
              <dt>{tab === 'd' ? 'Tu interés' : 'Tu nota'}</dt>
              <dd className="gs-media">
                <Nota game={g} />
              </dd>
            </div>
          ) : null}
          {conSocial && media !== null ? (
            <div>
              <dt>Media de tus amistades</dt>
              <dd className="gs-media">
                {escala === 'grade' ? media : <StarRating value={starsFromGrade(media)} />} <small>· {notas.length} {notas.length === 1 ? 'nota' : 'notas'}</small>
              </dd>
            </div>
          ) : null}
          {conSocial && loTienen.length ? (
            <div>
              <dt>Lo tienen</dt>
              <dd>{loTienen.length} <small>{loTienen.length === 1 ? 'amistad' : 'amistades'}</small></dd>
            </div>
          ) : null}
      </dl>
      {lado ? <div className="gs-head-lado">{lado}</div> : null}
    </header>
  );
}

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

function TusDatos({ g, tab }: { g: GameItem; tab: TabId }) {
  const D = UI_MESSAGES.detail;
  return (
    <div className="hub-detail-metadata gs-sec-datos">
      <div className="hub-metadata-section">
        <div className="detail-content gs-detail">
          <div className="detail-box gs-fila">
            <div className="chips" aria-label={D.platforms}>
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
          <div className="detail-box gs-fila" aria-label={D.genres}>
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
      </div>
    </div>
  );
}

function Analisis({ g }: { g: GameItem }) {
  const D = UI_MESSAGES.detail;
  if (!g.review) return null;
  return (
    <div className="hub-detail-metadata gs-sec-analisis">
      <div className="hub-metadata-section gs-review-box">
        <span className="detail-label">{D.review}</span>
        <p className="hub-feed-review-text gs-review">{g.review}</p>
        <a className="btn btn-open" href="#resena" onClick={avisar('abre tu reseña en /stats/resenas')} aria-label={D.reviewLinkAria(g.name)}>
          <Icon name={COMMON_ICONS.arrowsToEye} />
          <span>{D.reviewLink}</span>
        </a>
      </div>
    </div>
  );
}

function Amistades({ amistades, conQuieren }: { amistades: Amistad[]; conQuieren: boolean }) {
  const loTienen = amistades.filter((a) => a.tab !== 'd');
  const loQuieren = conQuieren ? amistades.filter((a) => a.tab === 'd') : [];
  if (!loTienen.length && !loQuieren.length) return null;
  const orden = [...loTienen].sort((a, b) => Number(Boolean(b.adelanto)) - Number(Boolean(a.adelanto)) || (b.nota ?? -1) - (a.nota ?? -1));
  return (
    <>
      {orden.length ? (
        <div className="hub-detail-metadata">
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
                  onOpen={avisar(`va al perfil de ${a.nombre} con este juego abierto (sus datos y su reseña)`)}
                  openAriaLabel={`Ver ${a.nombre}: su perfil, con este juego abierto`}
                >
                  {typeof a.nota === 'number' ? <Nota game={{ grade: a.nota }} /> : null}
                </HubPersonRow>
              </li>
            ))}
          </ul>
        </div>
        </div>
      ) : null}
      {loQuieren.length ? (
        <div className="hub-detail-metadata">
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
        </div>
      ) : null}
    </>
  );
}

function Saga({ g, onOpen, className = '' }: { g: GameItem; onOpen: (id: number) => void; className?: string }) {
  const entregas = TODOS.filter((o) => o.id === g.id || sharedSagaName(g.name, o.name));
  if (entregas.length < 2) return null;
  return (
    <div className={`hub-detail-metadata gs-sec-saga ${className}`.trim()}>
      <div className="hub-metadata-section">
        <strong>Saga</strong>
        <ul className="gs-saga">
          {entregas.map((s) => {
            const amistades = (AMISTADES[s.name] || []).filter((a) => a.tab !== 'd').length;
            const tuya = `Tú: ${LISTA[listaDe(s.id)].replace('En tus deseos', 'en deseos')}`;
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

function BarraDeAcciones({ g, tab, ref }: { g: GameItem; tab: Lista; ref?: Ref<HTMLElement> }) {
  return (
    <footer className="gs-bar" ref={ref}>
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

function useDeslizarParaCerrar(panelRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
  const gesto = useRef<{ x: number; y: number; t: number; eje: 'x' | 'y' | null; id: number } | null>(null);

  const devolver = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = '';
    window.setTimeout(() => panel.classList.remove('is-gesto'), 240);
  }, [panelRef]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    for (let n = e.target as HTMLElement | null; n && n !== e.currentTarget; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1 && n.scrollLeft > 0 && getComputedStyle(n).overflowX !== 'visible') return;
    }
    gesto.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, eje: null, id: e.pointerId };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    const panel = panelRef.current;
    if (!g || !panel || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.eje) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.eje = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (g.eje === 'x') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
        }
        panel.classList.add('is-gesto', 'is-arrastrando');
      }
    }
    if (g.eje === 'x') panel.style.transform = `translateX(${Math.max(0, dx)}px)`;
  }, [panelRef]);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    const panel = panelRef.current;
    gesto.current = null;
    if (!g || !panel || g.eje !== 'x') return;
    panel.classList.remove('is-arrastrando');
    const dx = Math.max(0, e.clientX - g.x);
    const velocidad = dx / Math.max(1, e.timeStamp - g.t);
    if (dx > panel.offsetWidth * 0.3 || velocidad > 0.6) {
      const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.style.transform = 'translateX(100%)';
      window.setTimeout(onClose, sinMovimiento ? 0 : 220);
    } else {
      devolver();
    }
  }, [panelRef, onClose, devolver]);

  const onPointerCancel = useCallback(() => {
    const g = gesto.current;
    gesto.current = null;
    if (g?.eje === 'x') {
      panelRef.current?.classList.remove('is-arrastrando');
      devolver();
    }
  }, [panelRef, devolver]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

function FichaModal({ id, onClose, onOpen }: { id: number | null; onClose: () => void; onOpen: (id: number) => void }) {
  const open = id !== null;
  const dialogRef = useNativeDialog(open, onClose);
  const g = TODOS.find((x) => x.id === id) || null;
  const tab = g ? listaDe(g.id) : 'd';
  const amistades = g && conSocial ? AMISTADES[g.name] || [] : [];
  const precio = g && tab === 'd' && conPrecio ? PRECIOS[g.name] : undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLElement>(null);
  const [medida, setMedida] = useState<{ id: number; etapa: number } | null>(null);
  const [quieren, setQuieren] = useState<{ id: number; estado: 'probando' | 'si' | 'no' } | null>(null);
  const [pasada, setPasada] = useState(0);
  const etapa = g !== null && medida?.id === g.id ? medida.etapa : 0;

  useEffect(() => {
    const alCambiar = () => {
      setMedida(null);
      setQuieren(null);
      setPasada((n) => n + 1);
    };
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  useEffect(() => {
    const barra = barraRef.current;
    const panel = panelRef.current;
    if (!open || !barra || !panel) return;
    const observador = new ResizeObserver(() => {
      panel.style.setProperty('--gs-botones', `${Math.ceil(barra.getBoundingClientRect().height) + 8}px`);
    });
    observador.observe(barra);
    return () => observador.disconnect();
  }, [open, g]);

  useEffect(() => {
    const el = layoutRef.current;
    if (!open || !el) return;
    const observador = new ResizeObserver(() => setPasada((n) => n + 1));
    observador.observe(el);
    return () => observador.disconnect();
  }, [open, g]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !g || !el) return;
    const esMovil = window.matchMedia('(max-width: 600px)').matches;
    const sobra = el.scrollHeight > el.clientHeight + 1;
    const estadoQuieren = quieren?.id === g.id ? quieren.estado : null;
    if (estadoQuieren === 'probando') {
      setQuieren({ id: g.id, estado: sobra ? 'no' : 'si' });
      return;
    }
    if (sobra) {
      if (estadoQuieren === 'si') {
        setQuieren({ id: g.id, estado: 'no' });
        return;
      }
      const secciones = el.querySelector('.gs-cuerpo')?.children.length ?? 0;
      if (!esMovil && etapa < 2 && secciones > 1) {
        setMedida({ id: g.id, etapa: etapa + 1 });
        setQuieren(null);
      }
      return;
    }
    if (estadoQuieren === null && amistades.some((a) => a.tab === 'd')) setQuieren({ id: g.id, estado: 'probando' });
  }, [open, g, etapa, pasada, quieren, amistades]);

  const gestoCerrar = useDeslizarParaCerrar(panelRef, onClose);

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
        <div ref={panelRef} className={`modal gs-panel ${['is-estrecho', 'is-medio', 'is-ancho'][etapa]}`} {...gestoCerrar}>
          <span className="gs-asa-lateral" aria-hidden="true" />
          <button className="btn-icon gs-close" type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <Icon name="close" />
          </button>
          <div className="gs-scroll" key={g.id} ref={scrollRef}>
            <div className="gs-contenido" ref={layoutRef}>
              <Cabecera
                g={g}
                tab={tab}
                amistades={amistades}
                lado={precio ? <PrecioBloque p={precio} /> : <Saga g={g} onOpen={onOpen} className="is-cabecera" />}
              />
              <div className="gs-cuerpo">
                <TusDatos g={g} tab={tab} />
                <Analisis g={g} />
                <Amistades amistades={amistades} conQuieren={quieren?.id === g.id && quieren.estado !== 'no'} />
                <Saga g={g} onOpen={onOpen} className={precio ? '' : 'is-solo-estrecho'} />
              </div>
            </div>
          </div>
          <BarraDeAcciones g={g} tab={tab} ref={barraRef} />
        </div>
      ) : null}
    </dialog>
  );
}

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
        <option value="v">Abandonados</option>
        <option value="e">En curso</option>
      </select>
      <select aria-label="Nota" style={caja} value={escala} onChange={(e) => ir({ nota: e.target.value === 'grade' ? '100' : '' })}>
        <option value="stars">Nota: estrellas</option>
        <option value="grade">Nota: 0–100</option>
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
      <h1 className="sr-only">{TITULO_LISTA[lista]}</h1>
      <Pantalla />
    </main>
    {params.get('barra') !== '0' ? <Barra /> : null}
  </MemoryRouter>,
);
