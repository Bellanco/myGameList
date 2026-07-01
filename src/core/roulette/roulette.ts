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

/** Nota "neutra" para listas que NO se puntúan (la vergüenza): así no quedan atrás por no tener estrellas. */
export const NEUTRAL_SCORE = 4;

/**
 * Score efectivo para la ponderación por lista. Si no hay nota: la vergüenza (que no se puntúa) usa la neutra
 * para competir por prioridad de lista; el resto (próximos/completados sin nota) mantiene el peso base mínimo.
 */
function scoreForWeight(game: GameItem, tab: TabId): number {
  const s = Number(game.score || 0);
  if (s > 0) return s;
  return tab === 'v' ? NEUTRAL_SCORE : 0;
}

/** Ponderación en LISTADOS: curva de puntuación × multiplicador de lista (más probable lo de próximos). */
export function listsWeight(candidate: RouletteCandidate): number {
  return curveScore(scoreForWeight(candidate.game, candidate.sourceTab)) * (TAB_WEIGHT[candidate.sourceTab] ?? 1);
}

// ————— Conciencia de saga (orden dentro de una serie) —————

/** Penalización por cada entrega ANTERIOR que tienes y aún no has terminado (y suprime la saga si hay una en curso). */
export const SEQUEL_DECAY = 0.4;

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
};

/**
 * Descompone un nombre en (base de la saga, ordinal). El ordinal se detecta como número arábigo de 1–3 dígitos
 * (evita años como "2077"), número romano, o número antes de un subtítulo tras ":". Sin número → ordinal 1
 * (la primera entrega). Los números en medio del nombre ("Left 4 Dead") no cuentan.
 */
export function parseSeries(name: string): { base: string; ordinal: number } {
  const main = String(name || '').trim().split(':')[0].trim();
  const tokens = main.split(/\s+/);
  const last = (tokens[tokens.length - 1] || '').toLowerCase().replace(/[.,]$/, '');

  let ordinal = 1;
  let baseTokens = tokens;
  if (/^\d{1,3}$/.test(last)) {
    ordinal = Number(last);
    baseTokens = tokens.slice(0, -1);
  } else if (ROMAN[last] !== undefined) {
    ordinal = ROMAN[last];
    baseTokens = tokens.slice(0, -1);
  }

  const base = baseTokens.join(' ').trim().toLowerCase();
  // Si al quitar el ordinal no queda base (el número/romano era todo el nombre), trátalo como primera entrega.
  if (!base) return { base: main.toLowerCase(), ordinal: 1 };
  return { base, ordinal };
}

interface SeriesInfo {
  ownedOrdinals: Set<number>; // entregas presentes en cualquier lista
  completedOrdinals: Set<number>; // entregas en completados (c)
  hasInProgress: boolean; // alguna entrega en curso (e)
}

/** Índice de sagas a partir de TODO el catálogo (para saber qué está jugado / en curso / es tuyo). */
function buildSeriesIndex(data: TabData): Map<string, SeriesInfo> {
  const index = new Map<string, SeriesInfo>();
  const add = (game: GameItem, tab: TabId) => {
    const { base, ordinal } = parseSeries(game.name);
    let info = index.get(base);
    if (!info) {
      info = { ownedOrdinals: new Set(), completedOrdinals: new Set(), hasInProgress: false };
      index.set(base, info);
    }
    info.ownedOrdinals.add(ordinal);
    if (tab === 'c') info.completedOrdinals.add(ordinal);
    if (tab === 'e') info.hasInProgress = true;
  };
  for (const game of data.c) add(game, 'c');
  for (const game of data.v) add(game, 'v');
  for (const game of data.e) add(game, 'e');
  for (const game of data.p) add(game, 'p');
  return index;
}

/**
 * Factor de saga para un juego: 1 si no forma serie (o solo tienes una entrega). Si hay una entrega EN CURSO,
 * suprime la saga (termina esa antes). Si no, penaliza por cada entrega ANTERIOR que tienes y no has terminado
 * (así sale primero la más temprana pendiente; las entregas que NO tienes —saltos— no penalizan).
 */
function seriesFactor(index: Map<string, SeriesInfo>, name: string): number {
  const { base, ordinal } = parseSeries(name);
  const info = index.get(base);
  if (!info || info.ownedOrdinals.size < 2) return 1;
  if (info.hasInProgress) return SEQUEL_DECAY;

  let earlierPending = 0;
  for (const owned of info.ownedOrdinals) {
    if (owned < ordinal && !info.completedOrdinals.has(owned)) earlierPending++;
  }
  return SEQUEL_DECAY ** earlierPending;
}

/**
 * Weigher de LISTADOS con contexto global: ponderación por lista (con la vergüenza justa) × conciencia de saga.
 * Precomputa el índice de sagas una vez y devuelve el weigher para `pickWeighted`.
 */
export function buildListsWeigher(data: TabData): (candidate: RouletteCandidate) => number {
  const index = buildSeriesIndex(data);
  return (candidate) => listsWeight(candidate) * seriesFactor(index, candidate.game.name);
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
