import type { GameItem } from '../../model/types/game';
import { tagKey } from './tags';

/** Campos de etiquetas del formulario que llevan sugerencias de un toque. */
export type SuggestedTagField = 'genres' | 'platforms' | 'strengths' | 'weaknesses' | 'reasons';
/** Campos cuyas sugerencias dependen de los géneros elegidos. */
export type GenreLinkedField = 'strengths' | 'weaknesses' | 'reasons';

/**
 * LAS SUGERENCIAS DEL FORMULARIO DE JUEGO, sacadas de la biblioteca del usuario: lo que más usa, por orden de
 * frecuencia, y —para los puntos fuertes, los débiles y las razones— cuántas veces sale cada uno en juegos de cada
 * género. Es lo que permite que, al elegir «Metroidvania», suban «Exploración» o «Backtracking» antes que lo que el
 * usuario escribe en general.
 *
 * Se cuenta la grafía tal y como está guardada: el formulario ya adopta la de las listas al añadir (`mergeTags`), así
 * que «acción» y «Acción» no conviven en datos nuevos.
 */
export interface FormSuggestions {
  /** Cada campo, de más a menos usado. */
  ranked: Record<SuggestedTagField, string[]>;
  /** género → valor → veces que ese valor aparece en juegos de ese género. */
  byGenre: Record<GenreLinkedField, Record<string, Record<string, number>>>;
}

/** Sin biblioteca (o en un test que no las necesite): sin sugerencias. */
export const EMPTY_FORM_SUGGESTIONS: FormSuggestions = {
  ranked: { genres: [], platforms: [], strengths: [], weaknesses: [], reasons: [] },
  byGenre: { strengths: {}, weaknesses: {}, reasons: {} },
};

function bump(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

/** De más a menos frecuente; a igual frecuencia, en el orden en que aparecieron (estable). */
function byFrequency(counts: Map<string, number>): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}

export function buildFormSuggestions(lists: ReadonlyArray<readonly GameItem[]>): FormSuggestions {
  const counts: Record<SuggestedTagField, Map<string, number>> = {
    genres: new Map(), platforms: new Map(), strengths: new Map(), weaknesses: new Map(), reasons: new Map(),
  };
  const byGenre: FormSuggestions['byGenre'] = { strengths: {}, weaknesses: {}, reasons: {} };

  for (const list of lists) {
    for (const game of list) {
      for (const value of game.genres) bump(counts.genres, value);
      for (const value of game.platforms) bump(counts.platforms, value);
      for (const field of ['strengths', 'weaknesses', 'reasons'] as const) {
        const values = game[field] || [];
        for (const value of values) bump(counts[field], value);
        if (!values.length) continue;
        for (const genre of game.genres) {
          const perGenre = (byGenre[field][genre] ??= {});
          for (const value of values) perGenre[value] = (perGenre[value] ?? 0) + 1;
        }
      }
    }
  }

  return {
    ranked: {
      genres: byFrequency(counts.genres),
      platforms: byFrequency(counts.platforms),
      strengths: byFrequency(counts.strengths),
      weaknesses: byFrequency(counts.weaknesses),
      reasons: byFrequency(counts.reasons),
    },
    byGenre,
  };
}

/**
 * Lo que se sugiere para un campo ligado al género: primero lo que más sale en los géneros elegidos (sumando los de
 * todos), después lo más usado en general, sin repetir y sin lo que se excluye (lo ya puesto en ese campo o en su
 * contrario: un punto no es fuerte y débil a la vez).
 */
export function suggestForGenres(
  suggestions: FormSuggestions,
  field: GenreLinkedField,
  genres: readonly string[],
  exclude: readonly string[],
  limit: number,
): string[] {
  const weight = new Map<string, number>();
  for (const genre of genres) {
    for (const [value, times] of Object.entries(suggestions.byGenre[field][genre] ?? {})) {
      weight.set(value, (weight.get(value) ?? 0) + times);
    }
  }
  const excluded = new Set(exclude.map((value) => value.toLocaleLowerCase()));
  const ordered = [...byFrequency(weight), ...suggestions.ranked[field]];
  const result: string[] = [];
  for (const value of ordered) {
    const key = value.toLocaleLowerCase();
    if (excluded.has(key)) continue;
    excluded.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

/** Lo que separa palabras dentro de una etiqueta («Acción/Aventura», «Hack'n'slash», «Shoot 'em up»). */
const WORD_BREAK = /[\s/\-'(]/;

/**
 * LAS SUGERENCIAS FILTRADAS POR LO QUE SE ESTÁ ESCRIBIENDO, que sustituyen al autocompletado: de `pool` (ya en orden
 * de preferencia), las que contienen lo escrito sin distinguir mayúsculas ni tildes (`tagKey`). Primero las que
 * EMPIEZAN por ello, luego las que tienen una palabra que empieza por ello y al final las que lo llevan en medio;
 * dentro de cada grupo se respeta el orden de `pool`. Sin repetir y sin lo de `exclude`. Sin nada escrito, las
 * primeras `limit` de `pool` tal cual.
 */
export function filterSuggestions(
  pool: ReadonlyArray<string>,
  query: string,
  exclude: ReadonlyArray<string | number>,
  limit: number,
): string[] {
  const needle = tagKey(query);
  const seen = new Set(exclude.map((value) => tagKey(value)));
  const groups: [string[], string[], string[]] = [[], [], []];
  for (const value of pool) {
    const key = tagKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!needle) {
      groups[0].push(value);
      continue;
    }
    const at = key.indexOf(needle);
    if (at < 0) continue;
    groups[at === 0 ? 0 : WORD_BREAK.test(key[at - 1]) ? 1 : 2].push(value);
  }
  return groups.flat().slice(0, limit);
}

/**
 * CUÁNTO SE ACERCA lo escrito a una etiqueta, de 0 a 1, para que la sugerencia se ilumine más cuanto más cerca se
 * esté de su nombre: la parte del nombre que ya se ha escrito (al cuadrado), rebajada si no casa por el principio (por el inicio de
 * otra palabra, o en medio). 1 solo cuando lo escrito ES la etiqueta. 0 sin nada escrito o si no casa.
 */
export function matchCloseness(value: string, query: string): number {
  const needle = tagKey(query);
  const key = tagKey(value);
  if (!needle || !key) return 0;
  const at = key.indexOf(needle);
  if (at < 0) return 0;
  const covered = needle.length / key.length;
  // Al cuadrado: lo que apenas casa se queda casi apagado y el salto hasta la que se está terminando se nota.
  return (at === 0 ? covered : covered * (WORD_BREAK.test(key[at - 1]) ? 0.75 : 0.5)) ** 2;
}

/**
 * EL BRILLO DE UNA SUGERENCIA FILTRADA, de 0 a 1: su cercanía (`matchCloseness`) más un empujón por quedar pocas.
 * Cuantas menos casan con lo escrito (`remaining`, todas las que casan, no solo las que caben en la fila), más se
 * encienden: si solo queda una, casi del todo aunque falte mucho por escribir; con dos, la mitad del camino que les
 * falta; con ocho o más, apenas nada.
 */
export function matchGlow(closeness: number, remaining: number): number {
  const scarcity = remaining > 0 ? 1 / remaining : 0;
  return closeness + (1 - closeness) * scarcity * 0.85;
}
