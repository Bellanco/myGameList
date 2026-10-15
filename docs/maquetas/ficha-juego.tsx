// MAQUETA DESECHABLE de la ficha de juego (`docs/plan-ficha-de-juego-y-precios.md`). Ver `ficha-juego.html` para los
// parámetros. Usa las piezas REALES del hub (cáscara de pantalla, renglón de persona, avatar, carátula, estrellas y
// nota) con datos inventados; lo único propio es la hoja `ficha-juego.scss`, que sería la de la pantalla.
//
// Carátulas: se piden en `solo-cache` al gemelo `localCoverApi` del servidor de desarrollo, que sirve lo ya resuelto
// en `.covers.local.json`. Sin ese fichero sale la portada de casa, que también vale para ver la composición.
import { type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/styles/index.scss';
import '../../src/styles/social.scss';
import './ficha-juego.scss';
import { IconSprite } from '../../src/view/components/IconSprite';
import { IconSpriteRest } from '../../src/view/components/IconSpriteRest';
import { Icon } from '../../src/view/components/Icon';
import { GameCover } from '../../src/view/components/GameCover';
import { StarRating } from '../../src/view/components/StarRating';
import { ScoreDisplay } from '../../src/view/components/ScoreDisplay';
import { HubScreen } from '../../src/view/components/socialhub/HubScreen';
import { HubPersonRow } from '../../src/view/components/socialhub/HubPersonRow';
import { HubAvatar } from '../../src/view/components/socialhub/HubAvatar';
import { coverUrl } from '../../src/core/utils/coverUrl';
import { starsFromGrade } from '../../src/core/utils/scoreScale';
import { TAB_ICONS } from '../../src/core/constants/icons';
import { APP_LOCALE } from '../../src/core/constants/locale';
import { parsePaletteId } from '../../src/core/constants/palettes';
import { loadPaletteSkin } from '../../src/view/hooks/paletteSkin';
import type { TabId } from '../../src/model/types/game';

loadPaletteSkin(parsePaletteId(document.documentElement.dataset.palette));

const params = new URLSearchParams(window.location.search);
const juegoId = params.get('juego') === 'hollow' ? 'hollow' : 'silksong';
const conSocial = params.get('social') !== '0';
const avisar = (que: string) => () => window.alert(`En la app: ${que}`);

// ─── Datos inventados ────────────────────────────────────────────────────────────────────────────────────────
const LISTA: Record<TabId, string> = { c: 'Completado', v: 'Abandonado', e: 'En curso', p: 'En próximos', d: 'En tus deseos' };
const VER_EN: Record<TabId, string> = { c: 'Completados', v: 'Vergüenza', e: 'En curso', p: 'Próximos', d: 'Deseados' };

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

interface Juego {
  nombre: string;
  plataformas: string[];
  generos: string[];
  anio: number;
  tuyo: { tab: TabId; nota?: number; horas?: number; cuando?: string; resena?: string; fuertes?: string[] };
  amistades: Amistad[];
  loQuieren: string[];
  precio?: Precio;
}

const JUEGOS: Record<'silksong' | 'hollow', Juego> = {
  silksong: {
    nombre: 'Hollow Knight: Silksong',
    plataformas: ['PC', 'Switch', 'PS5'],
    generos: ['Metroidvania', 'Plataformas'],
    anio: 2025,
    tuyo: { tab: 'd', nota: 80, cuando: 'desde marzo' },
    amistades: [
      { nombre: 'Marta Ruiz', tab: 'c', nota: 95, cuando: 'sept. 2025', adelanto: 'Más difícil que el primero y mejor en casi todo: Hornet se mueve como nadie y cada zona tiene su idea.' },
      { nombre: 'Nacho', tab: 'c', nota: 88, cuando: 'oct. 2025', adelanto: 'El acto 3 se alarga, pero el combate engancha de principio a fin.' },
      { nombre: 'Álvaro', tab: 'v', nota: 60, adelanto: 'Me pudo la dificultad de los jefes de la Ciudadela.' },
      { nombre: 'Lucía', tab: 'e' },
    ],
    loQuieren: ['Sara', 'Pablo'],
    precio: { ahora: 15.99, normal: 19.99, descuento: 20, tienda: 'GOG', minimo: 15.99, minimoCuando: 'jun. 2026' },
  },
  hollow: {
    nombre: 'Hollow Knight',
    plataformas: ['PC', 'Switch'],
    generos: ['Metroidvania', 'Plataformas'],
    anio: 2017,
    tuyo: {
      tab: 'c',
      nota: 92,
      horas: 46,
      cuando: 'enero de 2024',
      resena: 'Un mapa que se descubre a mano, con el cartógrafo escondido y las bancas como único respiro. Los jefes opcionales son lo mejor del juego y el Panteón, lo más exigente que he jugado.',
      fuertes: ['Exploración', 'Banda sonora', 'Jefes'],
    },
    amistades: [
      { nombre: 'Marta Ruiz', tab: 'c', nota: 98, cuando: 'mayo 2023', adelanto: 'Mi metroidvania favorito. Volvería a borrarme la memoria para jugarlo otra vez.' },
      { nombre: 'Nacho', tab: 'c', nota: 85, cuando: 'ago. 2022' },
      { nombre: 'Lucía', tab: 'c', nota: 90, cuando: 'feb. 2024', adelanto: 'Las Tierras Desoladas me tuvieron perdida una tarde entera y no me importó.' },
      { nombre: 'Álvaro', tab: 'p' },
    ],
    loQuieren: [],
  },
};

// La saga: las dos entregas, cada una con dónde la tienes tú y cuántas amistades.
const SAGA: Array<{ id: 'hollow' | 'silksong'; nombre: string; quien: string }> = [
  { id: 'hollow', nombre: 'Hollow Knight', quien: 'Tú: Completado · 4 amistades' },
  { id: 'silksong', nombre: 'Hollow Knight: Silksong', quien: 'Tú: en deseos · 4 amistades' },
];

const euros = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: 'EUR' });

// ─── Piezas ──────────────────────────────────────────────────────────────────────────────────────────────────
function PrecioBloque({ p }: { p: Precio }) {
  const enMinimo = p.ahora <= p.minimo;
  return (
    <section className="gs-price" aria-label="Precio">
      <div className="gs-price-main">
        <span className="gs-price-now">{euros.format(p.ahora)}</span>
        <span className="gs-price-cut">−{p.descuento} %</span>
        <span className="gs-price-regular">{euros.format(p.normal)}</span>
      </div>
      {enMinimo ? <span className="gs-price-low">Mínimo histórico</span> : null}
      <p className="gs-price-meta">
        Mejor precio en {p.tienda}. {enMinimo ? `Igual que en ${p.minimoCuando}.` : `Mínimo: ${euros.format(p.minimo)} (${p.minimoCuando}).`}
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

function Cabecera({ j }: { j: Juego }) {
  const notas = j.amistades.map((a) => a.nota).filter((n): n is number => typeof n === 'number');
  const media = notas.length >= 3 ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
  const tuyo = j.tuyo;
  return (
    <div className="gs-hero">
      <div className="gs-cover">
        <GameCover name={j.nombre} src={coverUrl(j.nombre, ['PC'], 'normal', 'solo-cache')} src2x={coverUrl(j.nombre, ['PC'], 'medio', 'solo-cache')} />
      </div>
      <div className="gs-hero-text">
        <p className="gs-facts">{j.plataformas.join(' · ')}</p>
        <p className="gs-facts">{[...j.generos, String(j.anio)].join(' · ')}</p>
        <div className="gs-pills">
          <span className={`gs-pill is-${tuyo.tab}`}>
            <Icon name={TAB_ICONS[tuyo.tab]} />
            {LISTA[tuyo.tab]}
          </span>
        </div>
        {conSocial ? (
          <dl className="gs-numbers">
            {media !== null ? (
              <div>
                <dt>Media de tus amistades</dt>
                <dd>{media} <small>· {notas.length} notas</small></dd>
              </div>
            ) : null}
            <div>
              <dt>Lo tienen</dt>
              <dd>{j.amistades.length} <small>amistades</small></dd>
            </div>
          </dl>
        ) : null}
      </div>
      <div className="gs-actions">
        {tuyo.tab === 'd' ? (
          <button className="btn btn-secondary" type="button" onClick={avisar('pasa el juego a Próximos (d → p)')}>
            <Icon name="rocket" />
            Ya lo tengo
          </button>
        ) : null}
        <button className="btn btn-secondary" type="button" onClick={avisar('abre el formulario del juego')}>
          <Icon name="edit" />
          Editar
        </button>
        <button className="btn btn-secondary" type="button" onClick={avisar(`va a /${VER_EN[tuyo.tab].toLowerCase()} con el juego buscado`)}>
          <Icon name={TAB_ICONS[tuyo.tab]} />
          Ver en {VER_EN[tuyo.tab]}
        </button>
      </div>
    </div>
  );
}

function TuEntrada({ j }: { j: Juego }) {
  const t = j.tuyo;
  if (!t.resena) return null;
  return (
    <div className="hub-detail-metadata">
      <div className="hub-metadata-section gs-own">
        <strong>Tu reseña</strong>
        <div className="gs-own-line">
          <ScoreDisplay game={{ grade: t.nota, score: starsFromGrade(t.nota) }} />
          {t.horas ? <span>{t.horas} h</span> : null}
          {t.cuando ? <span>Terminado en {t.cuando}</span> : null}
          {t.fuertes?.length ? <span>{t.fuertes.join(' · ')}</span> : null}
        </div>
        <p className="hub-feed-review-text">{t.resena}</p>
        <div>
          <button className="btn btn-secondary" type="button" onClick={avisar('abre tu reseña en /stats/resenas')}>
            Leer tu reseña
          </button>
        </div>
      </div>
    </div>
  );
}

function Amistades({ j }: { j: Juego }) {
  // Orden: con reseña primero y, dentro, por nota.
  const orden = [...j.amistades].sort((a, b) => Number(Boolean(b.adelanto)) - Number(Boolean(a.adelanto)) || (b.nota ?? -1) - (a.nota ?? -1));
  return (
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
                onOpen={avisar(a.adelanto ? `abre la reseña de ${a.nombre}` : `abre el perfil de ${a.nombre}`)}
                openAriaLabel={a.adelanto ? `Leer la reseña de ${a.nombre}` : `Ver el perfil de ${a.nombre}`}
              >
                {typeof a.nota === 'number' ? <StarRating value={starsFromGrade(a.nota)} /> : null}
              </HubPersonRow>
            </li>
          ))}
        </ul>
      </div>
      {j.loQuieren.length ? (
        <div className="hub-metadata-section">
          <strong>Lo quieren</strong>
          <ul className="gs-wanters">
            {j.loQuieren.map((n) => (
              <li key={n} className="gs-wanter">
                <HubAvatar />
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Saga() {
  return (
    <div className="hub-detail-metadata">
      <div className="hub-metadata-section">
        <strong>Saga</strong>
        <ul className="gs-saga">
          {SAGA.map((s) => (
            <li key={s.id}>
              <button
                className="gs-saga-item"
                type="button"
                aria-current={s.id === juegoId ? 'true' : undefined}
                onClick={() => {
                  const u = new URL(window.location.href);
                  u.searchParams.set('juego', s.id);
                  window.location.href = u.toString();
                }}
              >
                <GameCover name={s.nombre} src={coverUrl(s.nombre, ['PC'], 'normal', 'solo-cache')} />
                <span className="gs-saga-name">{s.nombre}</span>
                <span className="gs-saga-who">{conSocial ? s.quien : s.quien.split(' · ')[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Ficha(): ReactElement {
  const j = JUEGOS[juegoId];
  return (
    <HubScreen
      ariaLabel={`Ficha de ${j.nombre}`}
      title={j.nombre}
      back={{ onBack: avisar('vuelve a donde estabas'), destination: 'Volver a Deseados' }}
    >
      <article className="hub-feed-card hub-feed-card-detail gs-card">
        <div className="gs-top">
          <Cabecera j={j} />
          {j.precio ? <PrecioBloque p={j.precio} /> : null}
        </div>
        <TuEntrada j={j} />
        {conSocial ? <Amistades j={j} /> : null}
        <Saga />
      </article>
    </HubScreen>
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
      <select aria-label="Juego" style={caja} value={juegoId} onChange={(e) => ir({ juego: e.target.value })}>
        <option value="silksong">Silksong (en deseos, con precio)</option>
        <option value="hollow">Hollow Knight (completado)</option>
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
    <main id="contenido" className="main main-social">
      <h1 className="sr-only">Ficha de juego</h1>
      <Ficha />
    </main>
    {params.get('barra') !== '0' ? <Barra /> : null}
  </MemoryRouter>,
);
