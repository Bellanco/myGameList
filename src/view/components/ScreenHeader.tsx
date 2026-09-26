import { memo } from 'react';

export interface ScreenHeaderFigure {
  value: string;
  unit: string;
}

interface ScreenHeaderProps {
  kicker: string;
  title: string;
  figures?: readonly ScreenHeaderFigure[];
  /** La de las listas va en la banda de las pestañas; la del panel y Ajustes, dentro de `main`. */
  variant?: 'band' | 'main';
}

/**
 * LA CABECERA DE PANTALLA: rótulo, título y hasta tres cifras. Es una pieza NEUTRA: en la base es `display: none`
 * y la enciende el tema que la quiera (hoy solo Forja, ver su skin), así que otro tema puede adoptarla mañana sin
 * tocar TypeScript.
 *
 * `aria-hidden` a propósito: no sustituye al `<h1 class="sr-only">` de `main` —habría dos encabezados— y todo lo
 * que dice está ya en otra parte (el recuento en la pestaña, las horas y la nota en el panel). Así la lectura con
 * lector de pantalla es la misma en los ocho temas.
 */
export const ScreenHeader = memo(function ScreenHeader({ kicker, title, figures = [], variant = 'main' }: ScreenHeaderProps) {
  return (
    <header className={`screen-header is-${variant}`} aria-hidden="true">
      <div className="screen-header-inner">
        <div className="screen-header-text">
          <span className="screen-header-kicker">{kicker}</span>
          <span className="screen-header-title">{title}</span>
        </div>
        {figures.length > 0 ? (
          <div className="screen-header-figures">
            {figures.map((figure) => (
              <span key={figure.unit} className="screen-header-figure">
                <b>{figure.value}</b> {figure.unit}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
});
