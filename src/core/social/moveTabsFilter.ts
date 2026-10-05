// F4 — el filtro con el que cada uno decide DE QUÉ LISTAS ve los movimientos en su actividad.
//
// Vive separado de `moveActivity` (la proyección) por el presupuesto de arranque, y no por gusto: este filtro lo
// necesita `view/hooks/preferences`, que viaja en el chunk inicial de TODO el mundo, mientras que la proyección
// —derivar los mensajes, reconciliarlos con el gist— solo hace falta al publicar o al pintar el feed. Importar la
// una desde la otra metía el módulo entero en el arranque y rompía el presupuesto de `ci-validate`.
//
// Y no es un ajuste de privacidad: no decide qué se publica —eso son las listas ocultas del perfil, ver
// `moveActivity`—, decide qué se le muestra a quien lo toca.
//
// El valor es una CADENA de letras de lista en orden canónico ('cvepd' = todas, '~' = ninguna) y no una lista,
// porque viaja por `PreferenceStore.get()` hasta un `useSyncExternalStore`, que compara con `Object.is`: devolver
// un array nuevo en cada lectura sería un bucle de renders.
import { TAB_IDS, type TabId } from '../../model/types/game';

/**
 * Marca de «este valor ya conoce la lista de deseos». Va al final, y solo cuando `d` está APAGADA.
 *
 * La lista de deseos (`d`) llegó después que el filtro, y sin la marca un valor guardado antes —`'cvep'`, todas
 * las que había— sería indistinguible de uno que la apaga a propósito: quien hubiese tocado el ajuste alguna vez
 * se quedaría sin ver los deseos de nadie sin haberlo elegido. Así que:
 *  - con `d` dentro, el valor es inequívoco y no necesita marca;
 *  - sin `d` y con la marca, la apagó quien sabía que existía: se respeta;
 *  - sin ninguna de las dos, es un valor de antes de la lista y se le ENCIENDE, que es el defecto de todo el mundo.
 *    Salvo la cadena vacía: quien eligió no ver ninguno no ha cambiado de idea porque haya una lista más.
 *
 * Un cliente anterior ignora la marca al leer (solo se queda con letras de lista que conoce), así que no rompe.
 */
const KNOWS_WISHLIST = '~';

/** Todas las listas visibles: el valor por defecto (quien no ha tocado el ajuste lo ve todo). */
export const ALL_MOVE_TABS: string = TAB_IDS.join('');

/** Valor canónico de un conjunto de listas: letras en orden canónico y la marca si `d` va apagada. */
function canonical(selected: ReadonlySet<string>): string {
  const letters = TAB_IDS.filter((tab) => selected.has(tab)).join('');
  return selected.has('d') ? letters : `${letters}${KNOWS_WISHLIST}`;
}

/**
 * Sanea el valor guardado. `null`/`undefined` (nunca tocado) devuelve TODAS; una cadena vacía es una elección
 * legítima —no ver ninguno— y se respeta como tal. Ese es todo el motivo de que el parámetro admita null.
 */
export function parseMoveTabsValue(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) {
    return ALL_MOVE_TABS;
  }
  const text = String(raw).toLowerCase();
  const selected = new Set(text.split(''));
  const fromBeforeWishlist = !selected.has('d') && !text.includes(KNOWS_WISHLIST);
  if (fromBeforeWishlist && TAB_IDS.some((tab) => selected.has(tab))) {
    selected.add('d');
  }
  return canonical(selected);
}

/** Las listas del valor, ya saneadas. Para consumirlas en una vista (memoizando el array, no en cada render). */
export function moveTabsFromValue(value: string): TabId[] {
  const selected = new Set(parseMoveTabsValue(value).split(''));
  return TAB_IDS.filter((tab) => selected.has(tab));
}

/** Enciende o apaga una lista dentro del valor, devolviendo el valor canónico resultante. */
export function toggleMoveTabValue(value: string, tab: TabId): string {
  const selected = new Set(parseMoveTabsValue(value).split(''));
  if (selected.has(tab)) {
    selected.delete(tab);
  } else {
    selected.add(tab);
  }
  return canonical(selected);
}
