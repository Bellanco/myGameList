/**
 * El recuento: cuántos puntos saca cada papeleta y en qué puesto queda.
 *
 * Un voto acierta cuando el `optionId` elegido coincide con el del ganador de esa categoría, y suma el `weight`
 * de la categoría (1 si no dice otra cosa). Votos y ganadores se guardan por id, nunca por nombre, así que el
 * recuento es independiente del idioma.
 *
 * LOS GANADORES LLEGAN POR PARÁMETRO, y no se leen de la categoría. Vivían en `categories/{id}.winner`, pero esa
 * colección es de lectura abierta —hace falta para poder votar—, así que cualquiera podía consultar los ganadores
 * antes del anuncio. Hoy viven en `premiosAdmin/winners`, que solo lee quien manda. Se sigue aceptando
 * `category.winner` como respaldo porque es lo que traen los archivos históricos.
 */
import type {
  PremiosBallot,
  PremiosCategory,
  PremiosLeaderboardEntry,
  PremiosWinnersMap,
} from '../../model/types/premios';
import { resolveOptionId } from './localize';

/** Ganador efectivo de una categoría: el del mapa si lo hay; si no, el que traiga la propia categoría. */
function winnerOf(category: PremiosCategory, winners: PremiosWinnersMap | null): string {
  const raw = winners && category?.id in winners ? winners[category.id] : category?.winner;
  return resolveOptionId(category, raw);
}

/**
 * Puntos de una papeleta frente a los ganadores dados.
 *
 * Los dos lados de la comparación se normalizan con `resolveOptionId`: así una papeleta antigua que guardó el
 * NOMBRE del nominado sigue contando contra un ganador guardado por id, sin migrar nada.
 */
export function scoreBallot(
  ballot: PremiosBallot | null | undefined,
  categories: PremiosCategory[],
  winners: PremiosWinnersMap | null = null,
): number {
  if (!ballot?.selections) return 0;
  return (categories || []).reduce((total, category) => {
    const winnerId = winnerOf(category, winners);
    const voteId = resolveOptionId(category, ballot.selections[category.id]);
    if (winnerId && voteId === winnerId) {
      return total + (category.weight || 1);
    }
    return total;
  }, 0);
}

/**
 * Reparte los puestos con ranking DENSO: los empatados comparten puesto y el siguiente es el inmediatamente
 * posterior, sin huecos (9, 9, 4 puntos → puestos 1, 1, 2).
 *
 * No es estética: el puesto es lo que reparte los trofeos del podio (ver `awards`). Con dos primeros, quien les
 * sigue recibe el título de SEGUNDO, no el de tercero — y por eso puede haber más de cinco premiados y nunca más
 * de cinco títulos distintos.
 *
 * Es idempotente y reordena por puntos, así que vale igual para una clasificación recién calculada que para la de
 * un archivo antiguo que guardaba el puesto como posición en la lista: se recalcula al leerlo y no hay migración.
 */
export function assignDenseRanks<T extends { points?: number }>(
  leaderboard: T[] | null | undefined,
): Array<T & { rank: number }> {
  const sorted = [...(leaderboard || [])].sort((a, b) => (b?.points || 0) - (a?.points || 0));

  let rank = 0;
  let previousPoints: number | null = null;

  return sorted.map((entry) => {
    const points = entry?.points || 0;
    if (points !== previousPoints) {
      rank += 1;
      previousPoints = points;
    }
    return { ...entry, rank };
  });
}

/**
 * Clasificación ordenada de mayor a menor puntuación, con el puesto ya denso.
 *
 * Cada fila lleva el `userId` —lo necesita el panel, que trabaja sobre los votos en vivo— y el `profileId`, que
 * es lo ÚNICO de los dos que sobrevive al archivar: el archivo publicado no puede llevar identificadores reales
 * (ver `docs/plan-unificar-premios.md` §4.1). Una papeleta sin perfil deja el pseudónimo vacío y su fila
 * simplemente no enlaza a ninguna parte.
 *
 * El nombre es el que la persona eligió mostrar; si no eligió ninguno, el de su cuenta de Google; y si tampoco,
 * «Anónimo», que es mejor que una fila sin nadie.
 */
export function computeLeaderboard(
  ballots: PremiosBallot[] | null | undefined,
  categories: PremiosCategory[],
  winners: PremiosWinnersMap | null = null,
): PremiosLeaderboardEntry[] {
  return assignDenseRanks(
    (ballots || []).map((ballot) => ({
      userId: ballot.userId,
      profileId: ballot.profileId || '',
      nickname: ballot.userDisplayName || ballot.userNickname || 'Anónimo',
      points: scoreBallot(ballot, categories, winners),
    })),
  );
}
