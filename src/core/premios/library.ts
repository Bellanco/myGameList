/**
 * El puente entre un nominado y TU biblioteca.
 *
 * Es lo que hace que esta sección sea parte de la aplicación y no un inquilino con los mismos colores: los
 * nominados son juegos, y aquí sabemos cuáles tienes, en qué lista y con qué nota. Votar deja de ser a ciegas.
 *
 * SE CRUZA POR NOMBRE NORMALIZADO, que es lo único comparable: los identificadores de la biblioteca son locales
 * de cada persona y los de los nominados los escribe el administrador a mano. `core/utils/normalizeName` existe
 * exactamente para esto y ya se usa para lo mismo en el listado, en la bandeja y en lo social.
 *
 * SI NO CASA, NO PASA NADA: la tarjeta no enseña nada y no molesta. No se intenta adivinar con parecidos ni se
 * pregunta a ningún servicio — un falso positivo diría que terminaste un juego que no has jugado.
 */
import { normalizeName } from '../utils/normalizeName';
import { TAB_IDS, type TabData, type TabId } from '../../model/types/game';

export interface LibraryMatch {
  /** En qué lista lo tienes. */
  tab: TabId;
  /** Nota fina 0–100, o `null` si no lo has puntuado. */
  grade: number | null;
}

/**
 * Índice de la biblioteca por nombre normalizado.
 *
 * Se construye UNA vez por pantalla y no por tarjeta: con veintiséis categorías de cinco nominados son ciento
 * treinta búsquedas, y recorrer la biblioteca entera en cada una es justo el patrón que hace que una lista de
 * trescientos juegos se note.
 *
 * Si el mismo juego está en dos listas —no debería, pero los datos mandan— gana la primera según el orden
 * canónico de pestañas: completados antes que abandonados, y así.
 */
export function buildLibraryIndex(games: TabData | null | undefined): Map<string, LibraryMatch> {
  const index = new Map<string, LibraryMatch>();
  if (!games) return index;

  for (const tab of TAB_IDS) {
    for (const game of games[tab] || []) {
      const key = normalizeName(game.name);
      if (!key || index.has(key)) continue;
      const grade = typeof game.grade === 'number' ? game.grade : null;
      // Un juego sin puntuar (la lista de la vergüenza es opt-in) no tiene nota que enseñar.
      index.set(key, { tab, grade: game.scored === false ? null : grade });
    }
  }

  return index;
}

/** Lo que sabes de un nominado, si es que está en tu biblioteca. */
export function findInLibrary(
  index: Map<string, LibraryMatch>,
  nombre: string,
): LibraryMatch | null {
  return index.get(normalizeName(nombre)) || null;
}
