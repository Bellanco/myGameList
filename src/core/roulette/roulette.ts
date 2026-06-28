import type { GameItem, TabData, TabId } from '../../model/types/game';

/**
 * Lógica unificada de la "ruleta de juegos" (fuente única, sin React).
 *
 * Se usa en dos sitios con el MISMO motor de selección, cambiando solo cómo se arma el pool:
 *  - Listados: completados con "rejugar" + abandonados que "merecen otra oportunidad" + todos los próximos.
 *  - Perfil social: solo la lista de completados de ese perfil.
 *
 * La ponderación (a más puntuación, más probable) y el sorteo son comunes a ambos.
 */

export interface RouletteCandidate {
  game: GameItem;
  sourceTab: TabId;
}

/** Peso base para juegos sin puntuación: entran al sorteo con probabilidad mínima en vez de quedar fuera. */
export const BASE_WEIGHT = 1;

/** Curva de puntuación (cuadrática): a más nota, mucho más peso. Score 0 / sin puntuar → peso base. */
export function curveScore(score?: number): number {
  const s = Math.max(0, Math.min(5, Number(score || 0)));
  return s > 0 ? s * s : BASE_WEIGHT;
}

/** Peso lineal simple (score o base); ponderación por defecto de pickWeighted. */
export function gameWeight(game: GameItem): number {
  const score = Number(game.score || 0);
  return score > 0 ? score : BASE_WEIGHT;
}

/** Multiplicador por lista en LISTADOS: salen más los próximos, luego la vergüenza, luego completados. */
const TAB_WEIGHT: Record<TabId, number> = { p: 3, v: 2, c: 1, e: 1 };

/** Ponderación en LISTADOS: curva de puntuación × multiplicador de lista (más probable lo de próximos). */
export function listsWeight(candidate: RouletteCandidate): number {
  return curveScore(candidate.game.score) * (TAB_WEIGHT[candidate.sourceTab] ?? 1);
}

/** Empujón por rejugable en SOCIAL: cuenta, pero por debajo de un escalón de nota (un buen no-rejugable puede salir). */
const REPLAYABLE_BONUS = 1.5;

/** Ponderación en SOCIAL: curva de puntuación, con un plus si el juego es rejugable. */
export function profileWeight(candidate: RouletteCandidate): number {
  return curveScore(candidate.game.score) * (candidate.game.replayable ? REPLAYABLE_BONUS : 1);
}

/** Selección aleatoria ponderada. `weigher` define el peso de cada candidato; `rng` inyectable en tests. */
export function pickWeighted(
  candidates: RouletteCandidate[],
  weigher: (candidate: RouletteCandidate) => number = (c) => gameWeight(c.game),
  rng: () => number = Math.random,
): RouletteCandidate | null {
  if (!candidates.length) return null;
  const total = candidates.reduce((sum, c) => sum + weigher(c), 0);
  let r = rng() * total;
  for (const candidate of candidates) {
    r -= weigher(candidate);
    if (r <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

/** Normaliza el nombre para comparar duplicados entre usuarios (los IDs son locales y no comparables). */
export function normalizeName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

/**
 * Pool de la ruleta en los listados: completados con `replayable` ("rejugar") + abandonados con `retry`
 * ("merecen otra oportunidad") + todos los próximos. Deduplicado por id por seguridad.
 */
export function buildListsPool(data: TabData): RouletteCandidate[] {
  const out: RouletteCandidate[] = [];
  for (const game of data.c) if (game.replayable) out.push({ game, sourceTab: 'c' });
  for (const game of data.v) if (game.retry) out.push({ game, sourceTab: 'v' });
  for (const game of data.p) out.push({ game, sourceTab: 'p' });

  const seen = new Set<number>();
  return out.filter(({ game }) => {
    if (seen.has(game.id)) return false;
    seen.add(game.id);
    return true;
  });
}

/**
 * Pool de la ruleta en un perfil social: SOLO la lista de completados de ese perfil. Normaliza cada juego
 * a los campos que necesita la tarjeta-resultado (el canal público "index-only" trae snippet/rating).
 */
export function buildProfilePool(
  sharedLists: Partial<Record<TabId, unknown[]>> | undefined,
): RouletteCandidate[] {
  const completed = (sharedLists?.c || []) as Array<Record<string, unknown>>;
  return completed.map((raw) => {
    const game: GameItem = {
      id: Number(raw.id || 0),
      _ts: typeof raw._ts === 'number' ? (raw._ts as number) : 0,
      name: String(raw.name || ''),
      platforms: Array.isArray(raw.platforms) ? (raw.platforms as string[]) : [],
      genres: Array.isArray(raw.genres) ? (raw.genres as string[]) : [],
      steamDeck: Boolean(raw.steamDeck),
      review: String(raw.review || raw.snippet || ''),
      score: Number(raw.score || raw.rating || 0),
    };
    return { game, sourceTab: 'c' as TabId };
  });
}
