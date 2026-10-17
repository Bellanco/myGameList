// LO QUE SE DICE DE UN PRECIO (P3 del plan de la ficha y los precios), puro: si está en su mínimo y si ITAD acertó con
// otro título. Lo usan el renglón, la caja del mosaico y el recuadro de la ficha.
import { gameTitleKey } from '../utils/gameTitleKey';
import type { PrecioItad } from '../../model/types/prices';

/** ¿El mejor precio de ahora iguala (o mejora) el mínimo histórico? Sin mínimo conocido, no. */
export function isHistoricLow(precio: PrecioItad): boolean {
  const mejor = precio.mejor?.precio;
  const historico = precio.minimos.historico?.precio;
  return typeof mejor === 'number' && typeof historico === 'number' && mejor <= historico;
}

/**
 * El título con el que acertó ITAD, si NO es el tuyo (comparados con `gameTitleKey`, que ignora mayúsculas, signos y
 * la forma de los números); `null` si es el mismo. Es lo que dice «Precio de: …».
 */
export function matchedOtherTitle(precio: PrecioItad, name: string): string | null {
  return gameTitleKey(precio.titulo) === gameTitleKey(name) ? null : precio.titulo;
}
