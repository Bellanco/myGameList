import type { TabData } from '../../model/types/game';
import { buildListsPool, buildListsWeigher, type RouletteCandidate } from '../roulette/roulette';

/**
 * «¿A QUÉ JUEGO AHORA?» SIN INTERFAZ: qué juegos se ofrecen, cómo se filtran y en qué orden.
 *
 * Los candidatos son EXACTAMENTE los de la ruleta de los listados (`buildListsPool`): todos los próximos, los
 * abandonados con «¿Dar otra oportunidad?» y los completados con «Rejugar». Deseados y los que no llevan la casilla se
 * quedan fuera por la misma razón que en el dado (decisión del usuario, 13-10-2026). Si un día cambia lo que entra en
 * la ruleta, cambia aquí también: son la misma pregunta.
 *
 * El ORDEN es el peso de la ruleta sin el azar (nota × lista × saga, ver `buildListsWeigher`): arriba sale lo que el
 * dado elegiría más a menudo. A igual peso, por nombre, para que la lista no baile entre dos visitas.
 */

/** Lo que se puede filtrar: géneros y plataformas, varios a la vez y ninguno obligatorio. */
export interface PickFilters {
  genres: string[];
  platforms: string[];
}

export type PickFacet = keyof PickFilters;

/** Una opción de filtro con cuántos juegos quedarían al marcarla, contando con lo que ya está marcado en el OTRO. */
export interface PickOption {
  value: string;
  count: number;
}

export const EMPTY_PICK_FILTERS: PickFilters = { genres: [], platforms: [] };

/** Los candidatos, ya ordenados de más a menos probable en la ruleta. */
export function buildPickPool(data: TabData): RouletteCandidate[] {
  const weigh = buildListsWeigher(data);
  return buildListsPool(data)
    .map((candidate) => ({ candidate, weight: weigh(candidate) }))
    .sort((a, b) => b.weight - a.weight || a.candidate.game.name.localeCompare(b.candidate.game.name, 'es'))
    .map(({ candidate }) => candidate);
}

const FIELD: Record<PickFacet, 'genres' | 'platforms'> = { genres: 'genres', platforms: 'platforms' };

/**
 * ¿Pasa el juego los filtros? Dentro de un mismo filtro vale CUALQUIERA de lo marcado (FPS o TPS), igual que en la
 * barra de los listados; entre los dos, tienen que cumplirse ambos. `skip` ignora uno de los dos, que es lo que
 * necesitan los contadores de sus opciones.
 */
function passes(candidate: RouletteCandidate, filters: PickFilters, skip?: PickFacet): boolean {
  return (Object.keys(FIELD) as PickFacet[]).every((facet) => {
    if (facet === skip) return true;
    const selected = filters[facet];
    return selected.length === 0 || candidate.game[FIELD[facet]].some((value) => selected.includes(value));
  });
}

export function filterPickPool(pool: readonly RouletteCandidate[], filters: PickFilters): RouletteCandidate[] {
  return pool.filter((candidate) => passes(candidate, filters));
}

/**
 * Las opciones de un filtro, de la más a la menos frecuente en TODOS los candidatos (así no cambian de sitio al ir
 * marcando) y con el número de juegos que quedarían. El número sí cuenta lo marcado en el otro filtro: con «Epic»
 * marcado, «FPS» dice cuántos FPS hay en Epic. Lo marcado sale siempre, aunque se quede en cero.
 */
export function pickOptions(pool: readonly RouletteCandidate[], filters: PickFilters, facet: PickFacet): PickOption[] {
  const total = new Map<string, number>();
  const live = new Map<string, number>();
  for (const candidate of pool) {
    const values = new Set(candidate.game[FIELD[facet]]);
    const counts = passes(candidate, filters, facet);
    for (const value of values) {
      total.set(value, (total.get(value) ?? 0) + 1);
      if (counts) live.set(value, (live.get(value) ?? 0) + 1);
    }
  }
  return [...total.keys()]
    .sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || a.localeCompare(b, 'es'))
    .map((value) => ({ value, count: live.get(value) ?? 0 }));
}

/** Claves de la dirección: las mismas que usa la barra de los listados (`toolbarFilters`), repetidas por valor. */
const PARAM: Record<PickFacet, string> = { genres: 'genre', platforms: 'platform' };

export function parsePickFilters(params: URLSearchParams): PickFilters {
  return { genres: params.getAll(PARAM.genres), platforms: params.getAll(PARAM.platforms) };
}

export function serializePickFilters(filters: PickFilters): URLSearchParams {
  const params = new URLSearchParams();
  filters.genres.forEach((value) => params.append(PARAM.genres, value));
  filters.platforms.forEach((value) => params.append(PARAM.platforms, value));
  return params;
}

/** La dirección de la pantalla, con los filtros puestos si los hay (la usa el buscador para «Elegir entre tus FPS»). */
export const PICK_ROUTE = '/elegir';

export function pickPath(filters: PickFilters = EMPTY_PICK_FILTERS): string {
  const query = serializePickFilters(filters).toString();
  return query ? `${PICK_ROUTE}?${query}` : PICK_ROUTE;
}

/** Marca o desmarca un valor de un filtro. */
export function togglePickFilter(filters: PickFilters, facet: PickFacet, value: string): PickFilters {
  const current = filters[facet];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return { ...filters, [facet]: next };
}
