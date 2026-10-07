/**
 * LO QUE VOTÓ CADA UNO, listo para pintar: por categoría, el nominado elegido, si acertó y cuánto valía.
 *
 * Sale de cruzar el resumen de votos (`premiosReveal`) con el ARCHIVO de la edición, que es de donde vienen los
 * nombres de los nominados, los pesos y los ganadores: el resumen no los repite (ver
 * `docs/plan-premios-votos-a-la-vista.md`). Acertar es lo mismo que en el recuento (`scoring`): el id elegido
 * coincide con el del ganador, normalizados los dos con `resolveOptionId`.
 */
import type {
  PremiosBallot,
  PremiosCategory,
  PremiosCategorySnapshot,
  PremiosRevealedBallot,
  PremiosWinnersMap,
} from '../../model/types/premios';
import { getValidWinnerId } from './archivable';
import { getOptionLabel, resolveOptionId, tField } from './localize';
import { computeLeaderboard } from './scoring';

export interface RevealedPick {
  categoryId: string;
  title: string;
  /** Peso de la categoría: 1 si no dice otra cosa. */
  weight: number;
  /** Nombre del nominado votado; vacío si no votó en esa categoría. */
  voted: string;
  /** Nombre del ganador; vacío si la categoría todavía no tiene. */
  winner: string;
  /** ¿Tiene ganador? Sin él no hay acierto ni fallo que decir (solo pasa en el panel, antes de publicar). */
  decided: boolean;
  hit: boolean;
}

export interface RevealedRow {
  entry: PremiosRevealedBallot;
  picks: RevealedPick[];
  hits: number;
  /** Las categorías con ganador: el denominador de los aciertos. */
  decided: number;
}

export interface RevealedRowsOptions {
  /**
   * ¿Entran también las categorías SIN ganador? En la pantalla de resultados no —en el archivo no contaron—, pero
   * el panel de administración enseña la edición antes de publicarla, con la votación abierta incluso, y ahí lo que
   * se quiere ver es la papeleta entera.
   */
  includeUndecided?: boolean;
}

/** El snapshot como categoría, que es lo que piden los ayudantes de `localize`. */
function asCategory(snapshot: PremiosCategorySnapshot): PremiosCategory {
  return { id: snapshot.id, title: snapshot.title, options: snapshot.options };
}

/**
 * Las filas de la clasificación final, en el orden de las categorías del archivo y de los puestos del resumen.
 *
 * Solo entran las categorías con ganador: sin él no hay acierto ni fallo que decir, y en el archivo ya no
 * contaron para los puntos. Salvo que se pidan todas (`includeUndecided`).
 *
 * Cada fila lleva como `entry` el MISMO objeto que se le pasó: quien necesite casarla con algo suyo (el panel, con
 * la cuenta de cada papeleta) puede hacerlo por referencia sin depender del orden.
 */
export function revealedRows(
  ballots: PremiosRevealedBallot[] | null | undefined,
  categoriesSnapshot: PremiosCategorySnapshot[] | null | undefined,
  options: RevealedRowsOptions = {},
): RevealedRow[] {
  const categorias = (categoriesSnapshot || []).filter((snapshot) => options.includeUndecided || snapshot.winner);
  const decididas = categorias.filter((snapshot) => snapshot.winner).length;

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
          winner: snapshot.winner ? getOptionLabel(category, snapshot.winner) : '',
          decided: Boolean(snapshot.winner),
          hit: Boolean(winnerId) && votedId === winnerId,
        };
      });
      return { entry, picks, hits: picks.filter((pick) => pick.hit).length, decided: decididas };
    });
}

/** Una fila del panel: la de la clasificación, con la papeleta de la que sale (para su cuenta y sus correcciones). */
export interface LiveRevealedRow extends RevealedRow {
  ballot: PremiosBallot;
}

/**
 * LA EDICIÓN EN CURSO, con las mismas filas que la clasificación final, para el panel de administración.
 *
 *  - **Votación abierta** (`scored: false`): sin recuento ni ganadores. Van por ORDEN DE VOTO, del primer envío al
 *    último —el `submittedAt` no cambia al corregir—, y cada fila es la papeleta tal cual.
 *  - **Cerrada sin publicar** (`scored: true`): el recuento de `computeLeaderboard` con los ganadores marcados hasta
 *    ahora, que es exactamente el que se archivará al publicar (ver `buildRevealSnapshot`). Las categorías que aún
 *    no tienen ganador se enseñan igual, sin acierto ni fallo.
 */
export function liveEditionRows(
  ballots: PremiosBallot[],
  categories: PremiosCategory[],
  winners: PremiosWinnersMap,
  { scored }: { scored: boolean },
): LiveRevealedRow[] {
  const snapshot: PremiosCategorySnapshot[] = categories.map((category) => ({
    id: category.id,
    title: category.title,
    winner: scored ? getValidWinnerId(category, winners) || null : null,
    weight: category.weight || 1,
    options: category.options || [],
  }));

  const porCuenta = new Map(ballots.map((ballot) => [ballot.userId, ballot] as const));
  const ordenDeVoto = (ballot: PremiosBallot) => ballot.submittedAt || '\uffff'; // sin fecha, al final
  const entradas = scored
    ? computeLeaderboard(ballots, categories, winners).map(({ userId, ...entry }) => ({ userId, entry }))
    : [...ballots]
      .sort((a, b) => ordenDeVoto(a).localeCompare(ordenDeVoto(b)))
      .map((ballot, index) => ({
        userId: ballot.userId,
        entry: {
          // Sin recuento el puesto no se pinta; el orden es el de la lista.
          rank: index + 1,
          profileId: ballot.profileId || '',
          nickname: ballot.userDisplayName || ballot.userNickname || 'Anónimo',
          points: 0,
        },
      }));

  const deCadaFila = new Map<PremiosRevealedBallot, PremiosBallot>();
  const revealed = entradas.flatMap(({ userId, entry }) => {
    const ballot = porCuenta.get(userId);
    if (!ballot) return [];
    const fila: PremiosRevealedBallot = { ...entry, selections: ballot.selections || {} };
    deCadaFila.set(fila, ballot);
    return [fila];
  });

  return revealedRows(revealed, snapshot, { includeUndecided: true }).map((row) => ({
    ...row,
    ballot: deCadaFila.get(row.entry) as PremiosBallot,
  }));
}

