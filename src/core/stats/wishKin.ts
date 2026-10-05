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
  /** Géneros que deseas sin ningún juego de ese género esperando en Próximos. */
  gaps: string[];
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

const named = (game: GameItem) => Boolean(game?.name?.trim());

export function computeWishKin(data: TabData): WishKinSummary {
  const wishes = (data.d || []).filter(named).map(prepare);
  const waiting = (data.p || []).filter(named).map(prepare);

  const pairs: Array<WishKinPair & { saga: boolean }> = [];
  for (const wish of wishes) {
    let best: { match: Match; kin: Prepared } | null = null;
    for (const kin of waiting) {
      // El mismo juego en las dos listas es una biblioteca corrupta, no un pariente.
      if (kin.name === wish.name) continue;
      const found = match(wish, kin);
      if (found && (!best || better({ match: found, kin }, best))) best = { match: found, kin };
    }
    if (best) {
      pairs.push({
        wish: wish.game,
        kin: best.kin.game,
        reason: best.match.saga ? { kind: 'saga' } : { kind: 'genres', shared: best.match.shared },
        saga: best.match.saga,
      });
    }
  }

  // Primero lo que más te interesa: es la compra que más pesa. Luego las sagas, que son el parentesco más claro.
  pairs.sort((a, b) =>
    b.wish.grade - a.wish.grade || Number(b.saga) - Number(a.saga) || compareText(a.wish.name, b.wish.name));

  const genres = new Map<string, WishKinGenre>();
  countGenres(wishes, genres, 'wished');
  countGenres(waiting, genres, 'waiting');
  const rows = [...genres.values()];

  return {
    wishes: wishes.length,
    withKin: pairs.length,
    pairs: pairs.slice(0, WISH_KIN_MAX_PAIRS).map(({ wish, kin, reason }) => ({ wish, kin, reason })),
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
      .map((row) => row.tag),
  };
}
