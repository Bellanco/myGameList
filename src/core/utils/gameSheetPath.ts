import { gameTitleKey } from './gameTitleKey';

export const GAME_SHEET_PARAM = 'juego';

export function gameSheetSlug(name: string): string {
  return gameTitleKey(name).replace(/ /g, '-');
}

export function gameSheetSearch(name: string): string {
  return `?${GAME_SHEET_PARAM}=${encodeURIComponent(gameSheetSlug(name))}`;
}

export function matchesGameSheet(slug: string, name: string): boolean {
  return Boolean(slug) && gameSheetSlug(name) === slug;
}
