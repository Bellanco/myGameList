import type { GameItem, TabId, TabSort } from '../../model/types/game';
import { sortEs } from './compare';

/**
 * Orden por defecto de cada pestaña. Fuente ÚNICA usada tanto por el listado principal
 * (useGameListViewModel) como por el perfil social (SocialProfileDetailScreen), para que
 * ambos ordenen igual.
 */
export const DEFAULT_SORT: Record<TabId, TabSort> = {
  c: { col: 'years', asc: false },
  v: { col: 'name', asc: true },
  e: { col: 'name', asc: true },
  p: { col: 'score', asc: false },
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
 * a igualdad de clave desempata por la llegada más reciente a la lista (`listedAt`/`_ts`).
 * Decorate-sort-undecorate: calcula la clave de orden UNA vez por juego.
 */
export function sortGames(games: GameItem[], sort: TabSort, tab: TabId): GameItem[] {
  const col = sort.col;

  const keyOf = (game: GameItem): string | number => {
    if (col === 'years') return game.years?.length ? Math.max(...game.years) : 0;
    if (col === 'genres') return game.genres[0] || '';
    if (col === 'platforms') return game.platforms[0] || '';
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
      cmp = sort.asc ? sortEs(String(va || ''), String(vb || '')) : sortEs(String(vb || ''), String(va || ''));
    }

    if (cmp === 0 && tieBreak) return b.tie - a.tie; // completista: llegada más reciente primero
    return cmp;
  });

  return decorated.map((entry) => entry.game);
}
