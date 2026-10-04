/**
 * LO QUE VOTÓ CADA UNO, listo para pintar: por categoría, el nominado elegido, si acertó y cuánto valía.
 *
 * Sale de cruzar el resumen de votos (`premiosReveal`) con el ARCHIVO de la edición, que es de donde vienen los
 * nombres de los nominados, los pesos y los ganadores: el resumen no los repite (ver
 * `docs/plan-premios-votos-a-la-vista.md`). Acertar es lo mismo que en el recuento (`scoring`): el id elegido
 * coincide con el del ganador, normalizados los dos con `resolveOptionId`.
 */
import type { PremiosCategory, PremiosCategorySnapshot, PremiosRevealedBallot } from '../../model/types/premios';
import { getOptionLabel, resolveOptionId, tField } from './localize';

export interface RevealedPick {
  categoryId: string;
  title: string;
  /** Peso de la categoría: 1 si no dice otra cosa. */
  weight: number;
  /** Nombre del nominado votado; vacío si no votó en esa categoría. */
  voted: string;
  /** Nombre del ganador. */
  winner: string;
  hit: boolean;
}

export interface RevealedRow {
  entry: PremiosRevealedBallot;
  picks: RevealedPick[];
  hits: number;
}

/** El snapshot como categoría, que es lo que piden los ayudantes de `localize`. */
function asCategory(snapshot: PremiosCategorySnapshot): PremiosCategory {
  return { id: snapshot.id, title: snapshot.title, options: snapshot.options };
}

/**
 * Las filas de la clasificación final, en el orden de las categorías del archivo y de los puestos del resumen.
 *
 * Solo entran las categorías con ganador: sin él no hay acierto ni fallo que decir, y en el archivo ya no
 * contaron para los puntos.
 */
export function revealedRows(
  ballots: PremiosRevealedBallot[] | null | undefined,
  categoriesSnapshot: PremiosCategorySnapshot[] | null | undefined,
): RevealedRow[] {
  const categorias = (categoriesSnapshot || []).filter((snapshot) => snapshot.winner);

  return [...(ballots || [])]
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => {
      const picks = categorias.map((snapshot) => {
        const category = asCategory(snapshot);
        const winnerId = resolveOptionId(category, snapshot.winner);
        const votedRaw = entry.selections?.[snapshot.id] || '';
        const votedId = resolveOptionId(category, votedRaw);
        return {
          categoryId: snapshot.id,
          title: tField(snapshot.title),
          weight: snapshot.weight || 1,
          voted: votedRaw ? getOptionLabel(category, votedRaw) : '',
          winner: getOptionLabel(category, snapshot.winner || ''),
          hit: Boolean(winnerId) && votedId === winnerId,
        };
      });
      return { entry, picks, hits: picks.filter((pick) => pick.hit).length };
    });
}
