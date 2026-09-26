import { memo } from 'react';

interface ScreenHeaderProps {
  kicker: string;
  title: string;
  /** La de las listas va en la banda de las pestañas; la del panel y Ajustes, dentro de `main`. */
  variant?: 'band' | 'main';
}

/**
 * LA CABECERA DE PANTALLA: rótulo y título. Es una pieza NEUTRA: en la base es `display: none` y la enciende el
 * tema que la quiera (hoy solo Forja, ver su skin), así que otro tema puede adoptarla mañana sin tocar TypeScript.
 *
 * `aria-hidden` a propósito: no sustituye al `<h1 class="sr-only">` de `main` —habría dos encabezados— y lo que
 * dice ya lo dice ese `h1`. Así la lectura con lector de pantalla es la misma en los ocho temas.
 *
 * Llevó hasta tres cifras (juegos · horas · nota media) y se quitaron el 27-09-2026: repetían la pestaña y el
 * panel.
 */
export const ScreenHeader = memo(function ScreenHeader({ kicker, title, variant = 'main' }: ScreenHeaderProps) {
  return (
    <header className={`screen-header is-${variant}`} aria-hidden="true">
      <div className="screen-header-inner">
        <div className="screen-header-text">
          <span className="screen-header-kicker">{kicker}</span>
          <span className="screen-header-title">{title}</span>
        </div>
      </div>
    </header>
  );
});
