import { TAB_IDS, type TabData, type TabId } from '../../model/types/game';
import { gameTitleKey } from './gameTitleKey';

/**
 * LA FICHA DE UN JUEGO SE ABRE CON UN PARÁMETRO, NO CON UNA RUTA: `?juego=<clave>` sobre la pantalla en la que se
 * esté. Así no hace falta línea en `public/_redirects`, «atrás» la cierra y el parámetro no cambia el `pathname`, que
 * es lo que dispara la View Transition de cambio de pantalla (ver `docs/plan-ficha-de-juego-y-precios.md`, F0.1).
 *
 * Este módulo va en el ARRANQUE (lo usan la tabla, el buscador y `App`), así que se queda mínimo: funciones sobre
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

/**
 * ¿En qué lista tienes el juego de esa clave? `null` si en ninguna. Es lo único que necesita el ARRANQUE para saber
 * si hay ficha que abrir, y para cerrarla cuando el juego cambia de lista: montarla (`buildGameSheet`, con amistades
 * y saga) se hace ya dentro del chunk perezoso del panel. Busca en el mismo orden que `findOwnEntry`.
 */
export function ownGameSheetTab(data: TabData, slug: string): TabId | null {
  if (!slug) return null;
  return TAB_IDS.find((tab) => (data[tab] || []).some((game) => matchesGameSheet(slug, game.name))) ?? null;
}
