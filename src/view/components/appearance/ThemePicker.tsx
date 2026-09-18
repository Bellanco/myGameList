import { memo, type CSSProperties } from 'react';
import { APPEARANCE_UI } from '../../../core/constants/labels';
import { PALETTES } from '../../../core/constants/palettes';
import { usePalette } from '../../hooks/usePalette';

const A = APPEARANCE_UI;

/**
 * EL SELECTOR DE TEMA. Cada opción es una MINI-PREVISUALIZACIÓN: el fondo oscuro del tema, su barra de acento
 * y una esquina con el fondo claro, así que los tres colores se ven antes de elegir.
 *
 * Va aparte de los interruptores de apariencia porque no comparte nada con ellos: ni el estado —es el único que
 * usa `usePalette`—, ni el sitio —tiene tarjeta propia, a lo ancho, porque es lo único que pide espacio—, ni la
 * forma. Estuvieron en un mismo componente con un `only` que decidía qué mitad pintar, que es la manera fina de
 * tener dos componentes en un fichero.
 *
 * No lleva rótulo propio: el encabezado de su tarjeta ya dice «Temas» y repetirlo debajo es una línea de ruido.
 */
export const ThemePicker = memo(function ThemePicker() {
  const { palette, setPalette } = usePalette();

  return (
      <div className="score-scale-choice" role="radiogroup" aria-label={A.paletteAria}>
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={palette === p.id}
            className={`score-scale-opt${palette === p.id ? ' on' : ''}`}
            style={{ '--sw-accent': p.accent, '--sw-accent2': p.accent2 ?? p.accent, '--sw-dark': p.bg.dark, '--sw-light': p.bg.light } as CSSProperties}
            onClick={() => setPalette(p.id)}
          >
            <span className="score-scale-dot" aria-hidden="true" />
            <span className="score-scale-txt"><b>{p.label}</b></span>
            <span className="score-scale-sample" aria-hidden="true">
              <span className="palette-swatch" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
  );
});
