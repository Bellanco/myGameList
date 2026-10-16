import { gameTitleKey } from './gameTitleKey';

/**
 * LA FICHA DE UN JUEGO SE ABRE CON UN PARÁMETRO, NO CON UNA RUTA: `?juego=<clave>` sobre la pantalla en la que se
 * esté. Así no hace falta línea en `public/_redirects`, «atrás» la cierra y el parámetro no cambia el `pathname`, que
 * es lo que dispara la View Transition de cambio de pantalla (ver `docs/plan-ficha-de-juego-y-precios.md`, F0.1).
 *
 * Este módulo va en el ARRANQUE (lo usan la tabla y el buscador), así que se queda mínimo: tres funciones sobre
 * `gameTitleKey`, que ya está ahí.
 */
export const GAME_SHEET_PARAM = 'juego';

/**
 * Clave de la ficha de un juego: la de `gameTitleKey` con guiones en vez de espacios, para que se lea en la URL.
 * Dos nombres con la misma clave abren la misma ficha («Hades II» y «Hades 2»).
 */
export function gameSheetSlug(name: string): string {
  return gameTitleKey(name).replace(/ /g, '-');
}

/** El `?juego=<clave>` que abre la ficha de un juego, para enlazarla desde cualquier pantalla. */
export function gameSheetSearch(name: string): string {
  return `?${GAME_SHEET_PARAM}=${encodeURIComponent(gameSheetSlug(name))}`;
}

/** ¿Es este nombre el juego de esa clave? Una clave vacía no casa con nada (ni siquiera con un nombre vacío). */
export function matchesGameSheet(slug: string, name: string): boolean {
  return Boolean(slug) && gameSheetSlug(name) === slug;
}
