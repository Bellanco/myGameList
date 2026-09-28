/**
 * DE DÓNDE VIENE LA BIBLIOTECA QUE SE ESTÁ PINTANDO: de una acción del usuario en este dispositivo, o de fuera.
 *
 * «De fuera» es el ciclo de sync (un merge con lo que otro dispositivo subió) y la hidratación desde IndexedDB.
 * Lo necesita el aviso de logros (`useAchievementNotice`), que decide «acabas de conseguir esto» comparando dos
 * evaluaciones seguidas: sin saber el origen, lo que se cerró en el móvil se celebraba OTRA VEZ en el portátil en
 * cuanto llegaba la sync —con su medalla y su «Has desbloqueado»—, una vez por cada dispositivo.
 *
 * Por IDENTIDAD del objeto y en un `WeakSet`, no como estado de React: quien escribe la biblioteca ya produce un
 * objeto nuevo en cada cambio, así que marcarlo no cuesta un render más, y lo que deja de pintarse se recoge solo.
 */
import type { TabData } from '../model/types/game';

const external = new WeakSet<TabData>();

/** Marca una biblioteca que NO sale de una acción del usuario en este dispositivo. */
export function markExternalLibrary(data: TabData): void {
  external.add(data);
}

/** ¿Esta biblioteca llegó de fuera (sync, hidratación)? `false` para todo lo que no se haya marcado. */
export function isExternalLibrary(data: TabData): boolean {
  return external.has(data);
}
