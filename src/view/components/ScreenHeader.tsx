import { memo } from 'react';

interface ScreenHeaderProps {
  kicker: string;
  title: string;
}

/**
 * LA CABECERA DE PANTALLA: rótulo y título. Es una pieza NEUTRA: en la base es `display: none` y la enciende el
 * tema que la quiera (hoy solo Forja, ver su skin), así que otro tema puede adoptarla mañana sin tocar TypeScript.
 *
 * `aria-hidden` a propósito: no sustituye al `<h1 class="sr-only">` de `main` —habría dos encabezados— y lo que
 * dice ya lo dice ese `h1`. Así la lectura con lector de pantalla es la misma en los ocho temas.
 *
 * Llevó hasta tres cifras (juegos · horas · nota media) y se quitaron el 27-09-2026: repetían la pestaña y el
 * panel. Y salía también en las listas, en la banda de las pestañas («Biblioteca» y el nombre de la lista): se
 * quitó el 05-10-2026, porque la pestaña activa ya dice en qué lista estás.
 */
export const ScreenHeader = memo(function ScreenHeader({ kicker, title }: ScreenHeaderProps) {
  return (
    <header className="screen-header" aria-hidden="true">
      <div className="screen-header-inner">
        <div className="screen-header-text">
          <span className="screen-header-kicker">{kicker}</span>
          <span className="screen-header-title">{title}</span>
        </div>
      </div>
    </header>
  );
});
