/**
 * LOS GAME CLEAR, DE VERDAD (10-10-2026). Lo que cada tema hace al cerrar un juego, con las hojas REALES de los
 * temas y el hook REAL (`useSignatureEffects`): el botón emite el mismo momento que emite el listado al pasar un
 * juego a Completados (`emitMoment('game-closed')`), así que lo que se ve aquí es lo que sale en la app. Desde el
 * 12-10-2026 hay un segundo botón para EMPEZAR un juego (`emitMoment('game-started')`, al pasar a En curso).
 *
 * Necesita el servidor de desarrollo: `docs/maquetas/game-clear.html`. Con `?tema=<id>&modo=dark|light&solo=1` sale
 * un solo tema sin barra: así la monta `game-clear-todos.html`, que pone los ocho a la vista a la vez (un marco por
 * tema, porque los efectos cuelgan del `data-palette` del documento y dos temas no caben en el mismo).
 */
import { useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.scss';
import { PALETTES, type PaletteId } from '../../src/core/constants/palettes';
import { loadPaletteSkin } from '../../src/view/hooks/paletteSkin';
import { useSignatureEffects } from '../../src/view/hooks/useSignatureEffects';
import { emitMoment } from '../../src/core/effects/moments';
import { gameScenesPreference } from '../../src/view/hooks/preferences';
import { IconSprite } from '../../src/view/components/IconSprite';

/** Qué hace cada tema, en una línea, para leerlo junto al botón. */
const QUE_HACE: Record<PaletteId, string> = {
  tierramedia: 'El Anillo gira y se tumba sobre «Juego terminado».',
  arcade: 'La pantalla de récord.',
  witcher: 'La franja de «Contrato cerrado» con las coronas de la recompensa.',
  persona: '«Objetivo cumplido» en letras recortadas, estampado sobre una franja negra.',
  portal: 'La terminal de GLaDOS.',
  cyberpunk: 'El protocolo de brecha.',
  seaofstars: 'La ventana de «¡Victoria!».',
  grimdark: 'El sello de pureza con sus tiras de pergamino: «Deber cumplido».',
};

/** Qué hace al EMPEZAR un juego. */
const AL_EMPEZAR: Record<PaletteId, string> = {
  tierramedia: 'Al empezar: la puerta redonda de Bolsón Cerrado.',
  arcade: 'Al empezar: el atardecer synthwave con «STAGE 1».',
  witcher: 'Al empezar: «Nuevo contrato», con el cartel en rojo vivo.',
  persona: 'Al empezar: el calendario con la fecha de hoy.',
  portal: 'Al empezar: el cartel de la cámara, «PRUEBA EN CURSO».',
  cyberpunk: 'Al empezar: el escáner óptico.',
  seaofstars: 'Al empezar: el cartel de zona, «Nueva aventura».',
  grimdark: 'Al empezar: la transmisión astropática.',
};

/* En la app las escenas van detrás de su casilla de Diseño, apagada por defecto: la maqueta la enciende para que
   los botones enseñen algo (se queda guardada en el `localStorage` de este origen de desarrollo). */
gameScenesPreference.set(true);

const JUEGOS = ['Hollow Knight', 'Celeste', 'Hades', 'Outer Wilds'];

const URL_PARAMS = new URLSearchParams(location.search);
const TEMA_INICIAL = PALETTES.find((p) => p.id === URL_PARAMS.get('tema'))?.id ?? 'arcade';
const MODO_INICIAL = URL_PARAMS.get('modo') === 'light' ? 'light' : 'dark';
const SOLO = URL_PARAMS.get('solo') === '1';

/** El portal de todos los temas lanza los ocho a la vez llamando a esto en cada marco. */
declare global {
  interface Window { cerrarUnJuego?: () => void; empezarUnJuego?: () => void }
}
window.cerrarUnJuego = () => emitMoment('game-closed');
window.empezarUnJuego = () => emitMoment('game-started');

function Maqueta(): ReactElement {
  useSignatureEffects();
  const [palette, setPalette] = useState<PaletteId>(TEMA_INICIAL);
  const [theme, setTheme] = useState<'dark' | 'light'>(MODO_INICIAL);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-palette', palette);
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-effects', 'on');
    loadPaletteSkin(palette);
  }, [palette, theme]);

  return (
    <div className={SOLO ? 'gc is-solo' : 'gc'}>
      {/* El sprite trae los filtros de los temas (el desgarro del cartel de Plata y acero, por ejemplo). */}
      <IconSprite />
      <header className="gc-barra" hidden={SOLO}>
        <b>Game Clear · lo implementado</b>
        <span className="gc-temas">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === palette} onClick={() => setPalette(p.id)}>
              {p.label}
            </button>
          ))}
        </span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')} aria-label="Modo">
          <option value="dark">Oscuro</option>
          <option value="light">Claro</option>
        </select>
      </header>
      <div className="gc-mando">
        <button type="button" className="btn btn-steam gc-play" onClick={() => emitMoment('game-closed')}>
          ▶ Cerrar un juego
        </button>
        <button type="button" className="btn gc-play" onClick={() => emitMoment('game-started')}>
          ▶ Empezar un juego
        </button>
        <span>{QUE_HACE[palette]} {AL_EMPEZAR[palette]}</span>
      </div>
      <div className="gc-lista">
        {JUEGOS.map((j) => (
          <div key={j} className="gc-fila">
            <span className="row-name">{j}</span>
            <span className="chip">PC</span>
            <span className="gc-estrellas">★★★★☆</span>
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Maqueta />);
