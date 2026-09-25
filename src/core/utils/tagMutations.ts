import { nextVersion } from './gameStamps';
import type { GameItem, TabData, TabId } from '../../model/types/game';

export type TagCategory = 'genres' | 'platforms' | 'strengths' | 'weaknesses';
type TagField = 'genres' | 'platforms' | 'strengths' | 'weaknesses' | 'reasons';

/**
 * Campo de `GameItem` que almacena una categoría EN CADA pestaña, o `null` si esa pestaña no la usa.
 * Reglas de dominio (heredadas del comportamiento de remove/renameTagAcrossGames):
 *  - `genres`/`platforms`: presentes en todas las pestañas.
 *  - `strengths`: presente salvo en 'p' (próximos).
 *  - `weaknesses`: en 'c'/'e' es el campo `weaknesses`; en 'v' (abandonados) se almacena en `reasons`; ausente en 'p'.
 */
export function tagFieldForTab(tab: TabId, category: TagCategory): TagField | null {
  if (category === 'genres' || category === 'platforms') return category;
  if (category === 'strengths') return tab === 'p' ? null : 'strengths';
  if (tab === 'v') return 'reasons';
  if (tab === 'p') return null;
  return 'weaknesses';
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Aplica `transform` a la categoría indicada en cada juego de todas las pestañas (respetando qué campo usa cada
 * una) y devuelve un nuevo `TabData` inmutable con `updatedAt = ts`. PURA. Centraliza el patrón que antes se
 * repetía por pestaña en `removeTagAcrossGames`/`renameTagAcrossGames`.
 *
 * Solo se sella `_ts` en los juegos cuya etiqueta CAMBIA; el resto se devuelve tal cual. El merge es LWW por juego
 * entero (`mergeCrdt`): sellar un juego que no se ha tocado haría que esta copia ganase a una edición suya hecha
 * sin conexión en otro dispositivo, y renombrar una etiqueta borraría en silencio reseñas de toda la biblioteca.
 */
export function mapTabDataTags(
  data: TabData,
  category: TagCategory,
  transform: (values: string[]) => string[],
  ts: number,
): TabData {
  const mapGames = (games: GameItem[], tab: TabId): GameItem[] =>
    games.map((game) => {
      const field = tagFieldForTab(tab, category);
      if (!field) return game;
      const current = (game[field] as string[] | undefined) || [];
      const transformed = transform(current);
      if (sameValues(current, transformed)) return game;
      // `nextVersion` y no `ts` a secas: renombrar una etiqueta justo después de guardar un juego caía en el
      // mismo milisegundo y la reescritura se descartaba por tener la misma huella (ver `nextVersion`).
      return { ...game, _ts: nextVersion(game._ts, ts), [field]: transformed };
    });

  return {
    ...data,
    c: mapGames(data.c, 'c'),
    v: mapGames(data.v, 'v'),
    e: mapGames(data.e, 'e'),
    p: mapGames(data.p, 'p'),
    updatedAt: ts,
  };
}
