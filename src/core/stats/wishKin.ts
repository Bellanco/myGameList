// «Ya lo tienes en casa»: cada deseo frente a lo que ya tienes en Próximos (docs/plan-estadisticas-deseos.md).
//
// Vive aparte de `computeStats` a propósito: aquel recorre SOLO la biblioteca (`LIBRARY_TAB_IDS`), porque un
// deseo no es un juego que tengas, y meterle aquí la lista de deseos obligaría a excluirla en cada indicador.
// Esto es lo contrario: un cálculo que existe precisamente para cruzar las dos listas. PURO: sin reloj, sin E/S.
//
// SOLO CONTRA PRÓXIMOS. Próximos es «lo tengo y lo jugaré»: lo que se busca es si el próximo ya está listo antes
// de comprar otro. Contra Completados el cruce explicaría el deseo («te gustó la 1»), no lo sustituiría.
//
// LÍMITES CONOCIDOS. La saga se reconoce por el NOMBRE, así que no ve parientes que no lo compartan (Bloodborne y
// Dark Souls no lo son para esto), y un juego sin géneros solo puede emparentarse por saga. Los dos se quedan en
// este comentario y no en la interfaz: es lo que da de sí un dato que escribe el usuario.
import type { GameItem, TabData } from '../../model/types/game';
import { parseSeries } from '../utils/seriesName';
import { tagKey } from '../utils/tags';
import { resolveGrade } from '../utils/scoreScale';
import { compareText } from '../utils/compare';

/** Parejas que se enseñan. El resto cuenta en la cifra, pero una lista más larga deja de leerse. */
export const WISH_KIN_MAX_PAIRS = 5;
/** Géneros de la comparación entre deseos y Próximos. */
export const WISH_KIN_MAX_GENRES = 6;
/** Géneros que deseas sin nada esperando. */
export const WISH_KIN_MAX_GAPS = 5;
/**
 * Lo mínimo que tiene que tener la base de una saga para emparentar por PREFIJO («elden ring» con «elden ring
 * nightreign»): dos palabras o seis letras. Sin esto, «the» o «doom» emparentarían medio catálogo. Dos bases
 * iguales emparentan siempre, midan lo que midan.
 */
const PREFIX_MIN_WORDS = 2;
const PREFIX_MIN_LENGTH = 6;

/** Lo que la tarjeta necesita de cada juego de una pareja. */
export interface WishKinGame {
  id: number;
  name: string;
  /** Nota efectiva 0–100: en las dos listas es el INTERÉS previo, no una valoración. */
  grade: number;
}

export type WishKinReason = { kind: 'saga' } | { kind: 'genres'; shared: string[] };

export interface WishKinPair {
  wish: WishKinGame;
  kin: WishKinGame;
  reason: WishKinReason;
  /**
   * El género bajo el que se enseña la pareja, con la grafía de PRÓXIMOS: es el valor exacto que filtra ese
   * listado (`?genre=`). Uno de los géneros en común o, en una saga, uno del juego que ya tienes; `null` si es una
   * saga cuyo juego no lleva géneros.
   */
  genre: string | null;
}

export interface WishKinGenre {
  /** Con la grafía de la primera vez que aparece (la de los deseos, si está en las dos listas). */
  tag: string;
  wished: number;
  waiting: number;
}

export interface WishKinSummary {
  /** Deseos con nombre: la base de la cifra. */
  wishes: number;
  /** Cuántos de ellos tienen pariente en Próximos (todos, no solo los que se enseñan). */
  withKin: number;
  pairs: WishKinPair[];
  /** Deseos frente a Próximos por género. */
  genres: WishKinGenre[];
  /** Géneros que deseas sin ningún juego de ese género esperando en Próximos, con cuántos deseos tienen. */
  gaps: Array<{ tag: string; wished: number }>;
}

interface Prepared {
  game: WishKinGame;
  saga: string;
  name: string;
  genres: Map<string, string>;
  platforms: Set<string>;
  /** Desde cuándo espera en Próximos: el sello de entrada, o la llegada a la lista si no lo hay. */
  waitingSince: number;
}

/**
 * Base de la saga para emparentar: la de `parseSeries` sin tildes, y sin un AÑO al final, que en este caso es la
 * entrega («Football Manager 2009» y «Football Manager 2018» son la misma saga; para la ruleta no hace falta).
 */
function sagaBase(name: string): string {
  const base = tagKey(parseSeries(name).base);
  const withoutYear = base.replace(/\s+(19|20)\d{2}$/, '');
  return withoutYear || base;
}

function prepare(game: GameItem): Prepared {
  const genres = new Map<string, string>();
  for (const genre of game.genres || []) {
    const key = tagKey(genre);
    if (key && !genres.has(key)) genres.set(key, genre.trim());
  }
  return {
    game: { id: game.id, name: game.name.trim(), grade: resolveGrade(game) },
    saga: sagaBase(game.name),
    name: tagKey(game.name),
    genres,
    platforms: new Set((game.platforms || []).map(tagKey).filter(Boolean)),
    waitingSince: Number(game.enteredAt?.p) || Number(game.listedAt) || Number(game._ts) || 0,
  };
}

/** ¿Es una base lo bastante larga como para emparentar por prefijo? */
function longEnough(base: string): boolean {
  return base.split(' ').length >= PREFIX_MIN_WORDS || base.length >= PREFIX_MIN_LENGTH;
}

function sameSaga(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return longEnough(short) && long.startsWith(`${short} `);
}

interface Match {
  saga: boolean;
  shared: string[];
  jaccard: number;
  platform: boolean;
}

/**
 * Cómo se parecen un deseo y un juego de Próximos, o `null` si no se parecen.
 *
 * Por géneros hacen falta DOS en común, salvo que uno de los dos lleve un solo género: entonces basta ese. En la
 * biblioteca real la mitad de los juegos llevan uno solo («Hades: RogueLike»), y exigir dos los dejaría fuera.
 * La plataforma no emparenta: solo desempata.
 */
function match(wish: Prepared, kin: Prepared): Match | null {
  const saga = sameSaga(wish.saga, kin.saga);
  const shared = [...wish.genres.entries()].filter(([key]) => kin.genres.has(key)).map(([, tag]) => tag);
  const needed = Math.min(2, wish.genres.size, kin.genres.size);
  const byGenres = needed > 0 && shared.length >= needed;
  if (!saga && !byGenres) return null;

  const union = new Set([...wish.genres.keys(), ...kin.genres.keys()]).size;
  return {
    saga,
    shared: byGenres ? shared : [],
    jaccard: union ? shared.length / union : 0,
    platform: [...wish.platforms].some((platform) => kin.platforms.has(platform)),
  };
}

/** Mejor pareja: saga, luego Jaccard, luego nº de géneros comunes, plataforma y, al final, quien lleva más esperando. */
function better(a: { match: Match; kin: Prepared }, b: { match: Match; kin: Prepared }): boolean {
  if (a.match.saga !== b.match.saga) return a.match.saga;
  if (a.match.jaccard !== b.match.jaccard) return a.match.jaccard > b.match.jaccard;
  if (a.match.shared.length !== b.match.shared.length) return a.match.shared.length > b.match.shared.length;
  if (a.match.platform !== b.match.platform) return a.match.platform;
  if (a.kin.waitingSince !== b.kin.waitingSince) return a.kin.waitingSince < b.kin.waitingSince;
  return compareText(a.kin.game.name, b.kin.game.name) < 0;
}

function countGenres(games: Prepared[], into: Map<string, WishKinGenre>, field: 'wished' | 'waiting'): void {
  for (const game of games) {
    for (const [key, tag] of game.genres) {
      const row = into.get(key) || { tag, wished: 0, waiting: 0 };
      row[field] += 1;
      into.set(key, row);
    }
  }
}

interface Candidate {
  match: Match;
  kin: Prepared;
}

/** Claves de género bajo las que puede ir una pareja: las comunes o, en una saga, las del juego que ya tienes. */
function genreKeys({ match, kin }: Candidate): string[] {
  if (!match.saga) return match.shared.map(tagKey);
  return [...kin.genres.keys()];
}

/**
 * Las parejas que se enseñan, VARIADAS: ordenadas por interés, las parejas de un mismo género se comían la lista
 * (cinco filas de RPG). Dos pasadas por los deseos, de más a menos interés:
 *
 * 1. Una pareja por GÉNERO: cada deseo toma su mejor pariente con un género aún sin enseñar.
 * 2. Si quedan huecos, se repiten géneros, pero con un JUEGO de Próximos distinto: el mismo «ya tienes» cinco
 *    veces no dice nada nuevo. Por eso un deseo cuyos parientes ya salen todos se queda fuera de la lista (sigue
 *    contando en la cifra).
 */
function pickPairs(ranked: Array<{ wish: Prepared; candidates: Candidate[] }>): WishKinPair[] {
  const pairs: WishKinPair[] = [];
  const usedGenres = new Set<string>();
  const usedKin = new Set<Prepared>();
  const taken = new Set<Prepared>();

  const take = (wish: Prepared, candidate: Candidate, key: string | null) => {
    pairs.push({
      wish: wish.game,
      kin: candidate.kin.game,
      reason: candidate.match.saga ? { kind: 'saga' } : { kind: 'genres', shared: candidate.match.shared },
      genre: key ? candidate.kin.genres.get(key) ?? null : null,
    });
    if (key) usedGenres.add(key);
    usedKin.add(candidate.kin);
    taken.add(wish);
  };

  for (const { wish, candidates } of ranked) {
    if (pairs.length >= WISH_KIN_MAX_PAIRS) break;
    for (const candidate of candidates) {
      if (usedKin.has(candidate.kin)) continue;
      const key = genreKeys(candidate).find((genre) => !usedGenres.has(genre));
      if (key) {
        take(wish, candidate, key);
        break;
      }
    }
  }

  for (const { wish, candidates } of ranked) {
    if (pairs.length >= WISH_KIN_MAX_PAIRS) break;
    if (taken.has(wish)) continue;
    const candidate = candidates.find((option) => !usedKin.has(option.kin));
    if (candidate) {
      const keys = genreKeys(candidate);
      take(wish, candidate, keys.find((genre) => !usedGenres.has(genre)) ?? keys[0] ?? null);
    }
  }

  return pairs;
}

const named = (game: GameItem) => Boolean(game?.name?.trim());

export function computeWishKin(data: TabData): WishKinSummary {
  const wishes = (data.d || []).filter(named).map(prepare);
  const waiting = (data.p || []).filter(named).map(prepare);

  const ranked: Array<{ wish: Prepared; candidates: Candidate[] }> = [];
  for (const wish of wishes) {
    const candidates: Candidate[] = [];
    for (const kin of waiting) {
      // El mismo juego en las dos listas es una biblioteca corrupta, no un pariente.
      if (kin.name === wish.name) continue;
      const found = match(wish, kin);
      if (found) candidates.push({ match: found, kin });
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
    ranked.push({ wish, candidates });
  }

  // Primero lo que más te interesa: es la compra que más pesa. Luego las sagas, que son el parentesco más claro.
  ranked.sort((a, b) =>
    b.wish.game.grade - a.wish.game.grade ||
    Number(b.candidates[0].match.saga) - Number(a.candidates[0].match.saga) ||
    compareText(a.wish.game.name, b.wish.game.name));

  const genres = new Map<string, WishKinGenre>();
  countGenres(wishes, genres, 'wished');
  countGenres(waiting, genres, 'waiting');
  const rows = [...genres.values()];

  return {
    wishes: wishes.length,
    withKin: ranked.length,
    pairs: pickPairs(ranked),
    // Los géneros que más pesan en CUALQUIERA de las dos listas: compararlas exige ver los fuertes de las dos.
    genres: rows
      .filter((row) => row.wished > 0 || row.waiting > 0)
      .sort((a, b) =>
        Math.max(b.wished, b.waiting) - Math.max(a.wished, a.waiting) || b.wished - a.wished || compareText(a.tag, b.tag))
      .slice(0, WISH_KIN_MAX_GENRES),
    gaps: rows
      .filter((row) => row.wished > 0 && row.waiting === 0)
      .sort((a, b) => b.wished - a.wished || compareText(a.tag, b.tag))
      .slice(0, WISH_KIN_MAX_GAPS)
      .map((row) => ({ tag: row.tag, wished: row.wished })),
  };
}
