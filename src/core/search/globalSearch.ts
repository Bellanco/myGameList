// EL BUSCADOR GENERAL, sin interfaz (docs/plan-notificaciones-y-buscador.md, B1): de las fuentes y lo escrito, los
// resultados por grupo y en orden.
//
// TODO ES LOCAL. Las fuentes son lo que el dispositivo ya tiene: tus listas (en memoria), las reseñas de tus amistades
// y sus nombres (la copia del directorio social en IndexedDB) y las pantallas de la app. Buscar no hace ninguna
// petición, y lo que se escribe no sale de aquí: ni a la analítica ni a ningún otro sitio.
import { matchesSearch, normalizeSearchText } from '../utils/searchText';

export type SearchGroupKind = 'pick' | 'games' | 'reviews' | 'friends' | 'pages';

/** Un resultado: lo que se pinta (título y detalle) y adónde lleva. */
export interface SearchResult {
  /** Único en toda la búsqueda: es el id de la opción en el listado. */
  id: string;
  group: SearchGroupKind;
  title: string;
  /** La segunda línea: en qué lista está, de quién es la reseña, qué es la pantalla. */
  detail: string;
  path: string;
}

export interface SearchGroup {
  kind: SearchGroupKind;
  results: SearchResult[];
  /** Cuántos había antes de recortar: decide el «Ver más». */
  total: number;
}

/** Lo que se busca, ya con su destino resuelto: `title` es por lo que se busca. */
export type SearchSource = Omit<SearchResult, 'group'> & { keywords?: string };

export interface SearchSources {
  /** Los géneros que se pueden elegir en «¿A qué juego ahora?» (solo con espacio social; vacío si no). */
  pick: readonly SearchSource[];
  games: readonly SearchSource[];
  reviews: readonly SearchSource[];
  friends: readonly SearchSource[];
  pages: readonly SearchSource[];
}

/** Resultados por grupo antes del «Ver más». */
export const SEARCH_GROUP_LIMIT = 5;

/**
 * El orden de los grupos (decisión del usuario, 13-10-2026): lo tuyo primero —juegos y reseñas—, después «Elegir a qué
 * jugar» (solo sale cuando lo escrito es un género, «FPS»), las pantallas y, al final, las amistades.
 */
const GROUP_ORDER: readonly SearchGroupKind[] = ['games', 'reviews', 'pick', 'pages', 'friends'];

/**
 * Cuánto se parece un título a lo buscado (`query` ya normalizada); menos es mejor y `-1` es que no casa. Primero lo
 * idéntico, luego lo que empieza igual, luego lo que tiene una palabra que empieza igual y, al final, lo que lo
 * contiene en cualquier sitio.
 */
export function searchRank(title: string, query: string): number {
  if (!query) return -1;
  const text = normalizeSearchText(title);
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (` ${text}`.includes(` ${query}`)) return 2;
  return matchesSearch(title, query) ? 3 : -1;
}

/**
 * Los grupos con resultados, en orden fijo (juegos, reseñas, elegir, pantallas, amistades). `expanded` son los grupos en los
 * que se ha pedido «Ver más»: esos van enteros. Sin nada escrito no hay resultados.
 */
export function runSearch(
  sources: SearchSources,
  rawQuery: string,
  expanded: ReadonlySet<SearchGroupKind> = new Set(),
): SearchGroup[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const groups: SearchGroup[] = [];
  for (const kind of GROUP_ORDER) {
    const ranked = sources[kind]
      .map((source) => {
        const byTitle = searchRank(source.title, query);
        const byKeywords = source.keywords ? searchRank(source.keywords, query) : -1;
        // Las palabras clave (p. ej. «ajustes» para «Diseño») encuentran, pero detrás de lo que casa por el título.
        const rank = byTitle >= 0 ? byTitle : byKeywords >= 0 ? byKeywords + 4 : -1;
        return { source, rank };
      })
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.source.title.localeCompare(b.source.title, 'es') || a.source.detail.localeCompare(b.source.detail, 'es'));
    if (ranked.length === 0) continue;
    const visible = expanded.has(kind) ? ranked : ranked.slice(0, SEARCH_GROUP_LIMIT);
    groups.push({
      kind,
      total: ranked.length,
      results: visible.map(({ source }) => ({
        id: source.id,
        group: kind,
        title: source.title,
        detail: source.detail,
        path: source.path,
      })),
    });
  }
  return groups;
}
