import type { KeyboardEvent } from 'react';

/**
 * Intro y Espacio activan un renglón pulsable (`HubPersonRow`, que es un `article` con `tabIndex`, no un botón), como
 * en las pantallas del hub (`handleProfileCardKeyDown`). Sin esto, con el teclado se llegaba al renglón y no se abría.
 */
export function activarConTeclado(accion: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    accion();
  };
}
