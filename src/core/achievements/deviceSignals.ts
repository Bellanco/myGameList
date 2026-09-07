// Señales LOCALES de los logros: lo poco que no deja rastro en la biblioteca y hay que registrar.
//
// Módulo propio y deliberadamente diminuto, por presupuesto de chunk: quien SELLA estas señales es la ruleta,
// y si el sello viviera en `viewmodel/useAchievements` —que importa el evaluador y el catálogo entero— abrir la
// ruleta arrastraría todo eso a su chunk sin pintar una sola medalla. Aquí solo hay dos accesos a
// `localStorage`, que es exactamente lo que ese punto necesita. Mismo criterio que separó `feedMovePreference`
// de `view/hooks/preferences`.
import { ROULETTE_USED_KEY } from '../constants/storageKeys';

function read(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    // localStorage no disponible (modo privado estricto): la señal se pierde y el logro no salta. Es preferible
    // a que un acceso al almacenamiento tumbe el render de la pantalla que lo lee.
    return '';
  }
}

/** Sello (ms) de la primera vez que se usó la ruleta, o 0. */
export function rouletteUsedAt(): number {
  return Number(read(ROULETTE_USED_KEY)) || 0;
}

/**
 * Marca la ruleta como usada. Idempotente: solo escribe la PRIMERA vez, para que el sello sea el de cuando de
 * verdad se descubrió y no el de la última tirada.
 */
export function markRouletteUsed(now = Date.now()): void {
  if (read(ROULETTE_USED_KEY)) return;
  try {
    localStorage.setItem(ROULETTE_USED_KEY, String(now));
  } catch {
    // Sin persistencia: vale para la sesión en curso y no se recordará.
  }
}
