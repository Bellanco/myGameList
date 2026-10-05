import type { GameItem, TabId, TabSort } from '../../model/types/game';
import { compareText } from './compare';
import { resolveGrade } from './scoreScale';

/**
 * Orden por defecto de cada pestaña. Fuente ÚNICA usada tanto por el listado principal
 * (useGameListViewModel) como por el perfil social (SocialProfileDetailScreen), para que
 * ambos ordenen igual.
 */
export const DEFAULT_SORT: Record<TabId, TabSort> = {
  c: { col: 'years', asc: false },
  // La vergüenza, por NOTA, de la mejor a la peor, como las listas que se puntúan. Ahí la nota es opcional y los
  // juegos sin puntuar valen 0: caen al final y, entre ellos, siguen por nombre (ver el desempate de `sortGames`),
  // que era el orden de esta lista hasta ahora.
  v: { col: 'score', asc: false },
  e: { col: 'name', asc: true },
  p: { col: 'score', asc: false },
  // Deseos, como Próximos: por interés.
  d: { col: 'score', asc: false },
};

// Columnas numéricas/booleanas cuyo orden natural al activarlas es descendente (mayor primero).
const DESC_FIRST_COLUMNS = ['score', 'years', 'hours', 'retry', 'replayable'];

/**
 * Siguiente orden al pulsar una cabecera: si es la columna activa, invierte la dirección; si es otra,
 * la activa con su dirección natural (desc para notas/años/…; asc para texto). Fuente ÚNICA compartida
 * por el listado principal y el perfil social para que el clic en cabecera se comporte igual en ambos.
 */
export function nextSort(current: TabSort, column: string): TabSort {
  if (current.col === column) return { ...current, asc: !current.asc };
  return { col: column, asc: !DESC_FIRST_COLUMNS.includes(column) };
}

/**
 * Ordena una lista de juegos según `sort` (columna + dirección). En la pestaña completista (c),
 * a igualdad de clave desempata por la llegada más reciente a la lista (`listedAt`/`_ts`); en la vergüenza (v),
 * por nombre, para que el bloque de juegos sin nota —todos a 0— no quede en el orden en que se añadieron.
 * Decorate-sort-undecorate: calcula la clave de orden UNA vez por juego.
 */
export function sortGames(games: GameItem[], sort: TabSort, tab: TabId): GameItem[] {
  const col = sort.col;

  const keyOf = (game: GameItem): string | number => {
    if (col === 'years') return game.years?.length ? Math.max(...game.years) : 0;
    // La columna de puntuación ordena por la nota fina EFECTIVA (0–100, `grade` o su fallback ×20), no por el
    // espejo `score` 0–5: si no, notas como 90/96/98/99/100 caen todas en 5★, empatan y el orden estable las deja
    // en el orden de inserción (p. ej. 96-98-90-99-100). Ver core/utils/scoreScale (resolveGrade).
    if (col === 'score') return resolveGrade(game);
    const raw = (game[col as keyof GameItem] as string | number | boolean | undefined) ?? '';
    return typeof raw === 'boolean' ? Number(raw) : raw;
  };

  // En completista el orden por defecto es el año; ante empate gana la llegada más reciente a la lista.
  const tieBreak = tab === 'c';
  const decorated = games.map((game) => ({ game, key: keyOf(game), tie: game.listedAt ?? game._ts ?? 0 }));

  decorated.sort((a, b) => {
    const va = a.key;
    const vb = b.key;

    let cmp: number;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = sort.asc ? va - vb : vb - va;
    } else {
      cmp = sort.asc ? compareText(String(va || ''), String(vb || '')) : compareText(String(vb || ''), String(va || ''));
    }

    if (cmp === 0 && tieBreak) return b.tie - a.tie; // completista: llegada más reciente primero
    if (cmp === 0 && tab === 'v') return compareText(a.game.name, b.game.name); // vergüenza: por nombre
    return cmp;
  });

  return decorated.map((entry) => entry.game);
}
