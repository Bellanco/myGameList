/**
 * EL VOTO POPULAR: qué eligió la gente, y no quién acertó.
 *
 * La porra se gana acertando al jurado; esto cuenta lo otro, lo que votó más gente en cada categoría. Sale de las
 * papeletas, que se RETIRAN al publicar (ver `publishAndArchiveSeason`), así que el recuento se congela en el
 * archivo en ese momento o se pierde para siempre. Las ediciones publicadas antes de que existiera no tienen con
 * qué rehacerlo, y su pantalla simplemente no se ofrece.
 *
 * SOLO CIFRAS. El archivo es de lectura pública, así que lo que se guarda es cuántos votos tuvo cada nominado,
 * nunca quién los dio.
 */
import type {
  PremiosBallot,
  PremiosCategory,
  PremiosCategorySnapshot,
  PremiosSeasonResult,
  PremiosVoteTally,
} from '../../model/types/premios';
import { getOptionId, resolveOptionId } from './localize';

/** Los ids de los nominados de una categoría, en su orden. */
function optionIdsOf(category: Pick<PremiosCategory, 'id' | 'options'>): string[] {
  return (category.options || []).map((option, index) => getOptionId(option, category.id, index));
}

/**
 * Cuenta los votos de cada nominado, por categoría.
 *
 * El voto pasa por `resolveOptionId`, igual que en el recuento de puntos: una papeleta antigua que guardó el
 * nombre cuenta para el mismo nominado que una que guardó el id. Lo que no casa con ningún nominado se descarta:
 * un voto a algo que no figura no tiene dónde pintarse.
 */
export function tallyVotes(
  ballots: PremiosBallot[] | null | undefined,
  categories: PremiosCategory[] | null | undefined,
): PremiosVoteTally {
  const tally: PremiosVoteTally = {};
  for (const category of categories || []) {
    const ids = new Set(optionIdsOf(category));
    const cuenta: Record<string, number> = {};
    for (const ballot of ballots || []) {
      const voto = resolveOptionId(category, ballot?.selections?.[category.id]);
      if (!ids.has(voto)) continue;
      cuenta[voto] = (cuenta[voto] || 0) + 1;
    }
    if (Object.keys(cuenta).length > 0) tally[category.id] = cuenta;
  }
  return tally;
}

/** El más votado de una categoría. Con empate van TODOS los empatados: ninguno sacó más que otro. */
export interface PopularWinner {
  category: PremiosCategorySnapshot;
  /** Ids de los nominados con más votos, en el orden en que figuran en la categoría. */
  optionIds: string[];
  /** Votos del más votado (de cada uno, si hay empate). */
  votes: number;
  /** Cuánta gente votó esa categoría: la suma de todos sus nominados. */
  total: number;
}

/** ¿Este archivo guardó el recuento? Sin él no hay pantalla que ofrecer. */
export function hasPopularVote(result: PremiosSeasonResult | null | undefined): boolean {
  return Boolean(result?.votes && Object.keys(result.votes).length > 0);
}

/**
 * Los ganadores del voto popular, en el orden de las categorías archivadas.
 *
 * Se recorren las categorías del ARCHIVO y no las claves del recuento: el orden de un mapa de Firestore no es el
 * de la edición, y esta pantalla tiene que leerse en el mismo orden que la de resultados.
 */
export function popularWinners(result: PremiosSeasonResult | null | undefined): PopularWinner[] {
  if (!result?.votes) return [];
  const ganadores: PopularWinner[] = [];
  for (const category of result.categoriesSnapshot || []) {
    const cuenta = result.votes[category.id];
    if (!cuenta) continue;
    const valores = Object.values(cuenta).filter((n) => Number.isFinite(n) && n > 0);
    if (valores.length === 0) continue;
    const votes = Math.max(...valores);
    const total = valores.reduce((suma, n) => suma + n, 0);
    // El orden de la categoría, no el del mapa: un empate se lee igual cada vez que se abre.
    const optionIds = optionIdsOf(category).filter((id) => cuenta[id] === votes);
    if (optionIds.length === 0) continue;
    ganadores.push({ category, optionIds, votes, total });
  }
  return ganadores;
}
