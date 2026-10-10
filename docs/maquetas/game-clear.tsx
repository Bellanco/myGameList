/**
 * LOS GAME CLEAR, DE VERDAD (10-10-2026). Lo que cada tema hace al cerrar un juego, con las hojas REALES de los
 * temas y el hook REAL (`useSignatureEffects`): el botón emite el mismo momento que emite el listado al pasar un
 * juego a Completados (`emitMoment('game-closed')`), así que lo que se ve aquí es lo que sale en la app. Los temas
 * que sortean entre varias escenas sacan una distinta cada vez: pulsa varias veces.
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

/** Qué hace cada tema, en una línea, para leerlo junto al botón. */
const QUE_HACE: Record<PaletteId, string> = {
  tierramedia: '«Juego terminado» con letra de título de las películas.',
  arcade: 'Al azar: pantalla de récord o atardecer synthwave.',
  witcher: 'La franja de «Contrato cerrado» con las coronas de la recompensa.',
  persona: '«Objetivo cumplido» en letras recortadas.',
  portal: 'Al azar: el cartel de la cámara o la terminal de GLaDOS.',
  cyberpunk: 'El protocolo de brecha.',
  seaofstars: 'La ventana de «¡Victoria!».',
  grimdark: '«Deber cumplido» con un escudo imperial al azar.',
};

const JUEGOS = ['Hollow Knight', 'Celeste', 'Hades', 'Outer Wilds'];

const URL_PARAMS = new URLSearchParams(location.search);
const TEMA_INICIAL = PALETTES.find((p) => p.id === URL_PARAMS.get('tema'))?.id ?? 'arcade';
const MODO_INICIAL = URL_PARAMS.get('modo') === 'light' ? 'light' : 'dark';
const SOLO = URL_PARAMS.get('solo') === '1';

/** El portal de todos los temas lanza los ocho a la vez llamando a esto en cada marco. */
declare global {
  interface Window { cerrarUnJuego?: () => void }
}
window.cerrarUnJuego = () => emitMoment('game-closed');

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
        <span>{QUE_HACE[palette]}</span>
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
