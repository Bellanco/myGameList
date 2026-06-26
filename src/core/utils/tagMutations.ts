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

/**
 * Aplica `transform` a la categoría indicada en cada juego de todas las pestañas (respetando qué campo usa cada
 * una), marca `_ts`/`updatedAt = ts` y devuelve un nuevo `TabData` inmutable. PURA. Centraliza el patrón que antes
 * se repetía por pestaña en `removeTagAcrossGames`/`renameTagAcrossGames`.
 */
export function mapTabDataTags(
  data: TabData,
  category: TagCategory,
  transform: (values: string[]) => string[],
  ts: number,
): TabData {
  const mapGames = (games: GameItem[], tab: TabId): GameItem[] =>
    games.map((game) => {
      const next: GameItem = { ...game, _ts: ts };
      const field = tagFieldForTab(tab, category);
      if (!field) return next;
      const transformed = transform((game[field] as string[] | undefined) || []);
      return { ...next, [field]: transformed };
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
