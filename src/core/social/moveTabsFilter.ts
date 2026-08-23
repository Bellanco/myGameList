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
// El valor es una CADENA de letras de lista en orden canónico ('cvep' = todas, '' = ninguna) y no una lista,
// porque viaja por `PreferenceStore.get()` hasta un `useSyncExternalStore`, que compara con `Object.is`: devolver
// un array nuevo en cada lectura sería un bucle de renders.
import { TAB_IDS, type TabId } from '../../model/types/game';

/** Todas las listas visibles: el valor por defecto (quien no ha tocado el ajuste lo ve todo). */
export const ALL_MOVE_TABS: string = TAB_IDS.join('');

/**
 * Sanea el valor guardado. `null`/`undefined` (nunca tocado) devuelve TODAS; una cadena vacía es una elección
 * legítima —no ver ninguno— y se respeta como tal. Ese es todo el motivo de que el parámetro admita null.
 */
export function parseMoveTabsValue(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) {
    return ALL_MOVE_TABS;
  }
  const selected = new Set(String(raw).toLowerCase().split(''));
  return TAB_IDS.filter((tab) => selected.has(tab)).join('');
}

/** Las listas del valor, ya saneadas. Para consumirlas en una vista (memoizando el array, no en cada render). */
export function moveTabsFromValue(value: string): TabId[] {
  const selected = new Set(parseMoveTabsValue(value).split(''));
  return TAB_IDS.filter((tab) => selected.has(tab));
}

/** Enciende o apaga una lista dentro del valor, devolviendo el valor canónico resultante. */
export function toggleMoveTabValue(value: string, tab: TabId): string {
  const selected = new Set(parseMoveTabsValue(value).split('') as TabId[]);
  if (selected.has(tab)) {
    selected.delete(tab);
  } else {
    selected.add(tab);
  }
  return TAB_IDS.filter((candidate) => selected.has(candidate)).join('');
}
