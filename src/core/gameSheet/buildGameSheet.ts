import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import { buildPickPool, filterPickPool } from '../pick/pickNext';
import { gameSheetSlug, matchesGameSheet } from '../utils/gameSheetPath';
import { sharedSagaName } from '../utils/gameSaga';
import { resolveGrade } from '../utils/scoreScale';

/**
 * EL MODELO DE LA FICHA DE UN JUEGO, puro: sin red, sin React y sin repositorios. Junta tu entrada, lo que se sabe
 * de tus amistades sobre ese juego y su saga (ver `docs/plan-ficha-de-juego-y-precios.md`, F1).
 *
 * El juego se identifica por su CLAVE (`gameSheetSlug`), no por su `id`: el `id` es `max+1` en cada biblioteca, así
 * que entre dos personas el nombre normalizado es lo único que vale.
 */

/** Quién es una amistad, lo justo para pintarla. */
export interface GameSheetFriendRef {
  id: string;
  name: string;
  photoURL?: string;
}

/**
 * LO QUE SE SABE DE UNA AMISTAD SOBRE UN JUEGO, por tres vías que llegan por separado y con distinto coste:
 *  · `library`: una entrada de su biblioteca, ya filtrada con su visibilidad (`applyProfileVisibility`). La da el
 *    índice de bibliotecas (F4), desde plata.
 *  · `review`: su reseña del canal social, con el adelanto de 160 caracteres (F3). Coste cero.
 *  · `move`: su aviso de cambio de lista de los últimos 30 días (F3). Coste cero.
 */
export type GameSheetSignal =
  | { kind: 'library'; friend: GameSheetFriendRef; tab: TabId; item: GameItem & { finishedOn?: string } }
  | { kind: 'review'; friend: GameSheetFriendRef; gameName: string; grade: number | null; snippet: string; at: number }
  | { kind: 'move'; friend: GameSheetFriendRef; gameName: string; tab: TabId; at: number };

/** Una amistad ya resuelta para la ficha: dónde lo tiene, su nota (si cuenta) y el adelanto de su reseña. */
export interface GameSheetFriend {
  id: string;
  name: string;
  photoURL?: string;
  tab: TabId;
  grade: number | null;
  snippet: string;
  finishedOn?: string;
}

/**
 * Una entrega de la saga: en qué lista la tienes tú (o `null`) y cuántas amistades la tienen. Lleva las plataformas
 * (las tuyas si la tienes; si no, las de una amistad) porque desempatan la carátula entre homónimos.
 */
export interface GameSheetSagaEntry {
  slug: string;
  name: string;
  platforms: string[];
  ownTab: TabId | null;
  friendCount: number;
  current: boolean;
}

/** La ficha entera, lista para pintar. */
export interface GameSheet {
  slug: string;
  name: string;
  own: { tab: TabId; item: GameItem } | null;
  friends: GameSheetFriend[];
  wishers: GameSheetFriend[];
  average: { grade: number; count: number } | null;
  saga: GameSheetSagaEntry[];
  /** Sin saga, Más de «<género>»: tus juegos de su género principal (`buildSameGenre`). `null` si no hay. */
  sameGenre: { genre: string; games: GameSheetSagaEntry[] } | null;
}

export interface BuildGameSheetInput {
  slug: string;
  own: TabData;
  signals: readonly GameSheetSignal[];
}

/** Tu entrada de ese juego, en la primera lista en la que aparezca (`TAB_IDS`), o `null` si no lo tienes. */
export function findOwnEntry(own: TabData, slug: string): { tab: TabId; item: GameItem } | null {
  for (const tab of TAB_IDS) {
    const item = (own[tab] || []).find((game) => matchesGameSheet(slug, game.name));
    if (item) return { tab, item };
  }
  return null;
}

/**
 * Todas las entradas de ese juego en una biblioteca. Se usa con la de una amistad YA filtrada por su visibilidad, así
 * que una lista que esconde no aporta nada.
 */
export function entriesForGame(
  lists: Partial<Record<TabId, GameItem[]>>,
  slug: string,
): Array<{ tab: TabId; item: GameItem }> {
  const found: Array<{ tab: TabId; item: GameItem }> = [];
  for (const tab of TAB_IDS) {
    for (const item of lists[tab] || []) {
      if (matchesGameSheet(slug, item.name)) found.push({ tab, item });
    }
  }
  return found;
}

/**
 * La nota que CUENTA, con las mismas reglas que el detalle de la fila: en completados siempre; en abandonados solo si
 * se puntuó (`scored`); en curso, próximos y deseados nunca (en curso vale 0 y no dice nada; en los otros dos es un
 * interés, no una nota). Un 0 tampoco es nota.
 */
function scoredGrade(tab: TabId, item: GameItem): number | null {
  if (tab === 'c' || (tab === 'v' && item.scored)) {
    const grade = resolveGrade(item);
    return grade > 0 ? grade : null;
  }
  return null;
}

function signalName(signal: GameSheetSignal): string {
  return signal.kind === 'library' ? signal.item.name : signal.gameName;
}

/**
 * El nombre de ese juego tal y como lo escribe la PRIMERA amistad que lo nombra, o `null` si ninguna. Es el que enseña
 * la ficha de un juego que no tienes, y con el que se pide su precio (P5 del plan de la ficha y los precios).
 */
export function signalGameName(slug: string, signals: readonly GameSheetSignal[]): string | null {
  const first = signals.find((signal) => matchesGameSheet(slug, signalName(signal)));
  return first ? signalName(first) : null;
}

/**
 * Junta en una sola amistad todo lo que llega de ella:
 *  · su biblioteca MANDA en la lista (es su estado de verdad, no un aviso de hace días);
 *  · sin biblioteca, el aviso de lista MÁS RECIENTE; una reseña sin aviso supone completados;
 *  · la reseña pone el adelanto y, si lleva nota, la nota.
 */
function mergeFriends(slug: string, signals: readonly GameSheetSignal[]): GameSheetFriend[] {
  const byFriend = new Map<string, GameSheetFriend & { libraryTab: boolean; moveAt: number }>();
  for (const signal of signals) {
    if (!matchesGameSheet(slug, signalName(signal))) continue;
    const current = byFriend.get(signal.friend.id) ?? {
      id: signal.friend.id,
      name: signal.friend.name,
      photoURL: signal.friend.photoURL,
      tab: 'p' as TabId,
      grade: null,
      snippet: '',
      libraryTab: false,
      moveAt: -1,
    };
    if (signal.kind === 'library') {
      current.tab = signal.tab;
      current.libraryTab = true;
      current.grade = scoredGrade(signal.tab, signal.item) ?? current.grade;
      if (signal.item.finishedOn) current.finishedOn = signal.item.finishedOn;
    } else if (signal.kind === 'review') {
      current.snippet = signal.snippet;
      if (signal.grade !== null && signal.grade > 0) current.grade = signal.grade;
      if (!current.libraryTab && current.moveAt < 0) current.tab = 'c';
    } else if (!current.libraryTab && signal.at > current.moveAt) {
      current.tab = signal.tab;
      current.moveAt = signal.at;
    }
    byFriend.set(signal.friend.id, current);
  }
  return [...byFriend.values()].map(({ libraryTab: _l, moveAt: _m, ...friend }) => friend);
}

/** Con reseña primero (es lo que más se quiere leer), después por nota y, a igualdad, por nombre. */
function compareFriends(a: GameSheetFriend, b: GameSheetFriend): number {
  const byReview = Number(Boolean(b.snippet)) - Number(Boolean(a.snippet));
  if (byReview) return byReview;
  const byGrade = (b.grade ?? -1) - (a.grade ?? -1);
  if (byGrade) return byGrade;
  return a.name.localeCompare(b.name, 'es');
}

/**
 * LA SAGA, con la regla de `sharedSagaName` (prefijo de palabras común que nombra de verdad una saga): las entregas de
 * tu biblioteca y de las bibliotecas de tus amistades, sin repetir. Los deseos de las amistades no cuentan como
 * «la tienen». Con una sola entrega no hay saga que enseñar.
 */
function buildSaga(
  slug: string,
  name: string,
  own: TabData,
  signals: readonly GameSheetSignal[],
): GameSheetSagaEntry[] {
  const entries = new Map<string, GameSheetSagaEntry & { friends: Set<string> }>();
  const touch = (gameName: string) => {
    const key = gameSheetSlug(gameName);
    if (!key) return null;
    if (key !== slug && !sharedSagaName(name, gameName)) return null;
    const entry = entries.get(key) ?? {
      slug: key,
      name: gameName,
      platforms: [] as string[],
      ownTab: null,
      friendCount: 0,
      current: key === slug,
      friends: new Set<string>(),
    };
    entries.set(key, entry);
    return entry;
  };
  for (const tab of TAB_IDS) {
    for (const item of own[tab] || []) {
      const entry = touch(item.name);
      if (entry && entry.ownTab === null) {
        entry.ownTab = tab;
        entry.name = item.name;
        entry.platforms = item.platforms || [];
      }
    }
  }
  for (const signal of signals) {
    if (signal.kind !== 'library' || signal.tab === 'd') continue;
    const entry = touch(signal.item.name);
    if (!entry) continue;
    entry.friends.add(signal.friend.id);
    if (!entry.platforms.length) entry.platforms = signal.item.platforms || [];
  }
  if (!entries.has(slug)) touch(name);
  const saga = [...entries.values()].map(({ friends, ...entry }) => ({ ...entry, friendCount: friends.size }));
  if (saga.length < 2) return [];
  return saga.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Cuántos juegos enseña Más de «<género>». */
export const SAME_GENRE_MAX = 8;

/**
 * «MÁS DE <GÉNERO>», para que una ficha sin saga no se quede sin tira (17-10-2026, decisión del usuario): tus juegos
 * de su género principal (el primero, el del resumen), solo de tu biblioteca. Son los candidatos de «¿A qué juego
 * ahora?» y en su orden (`buildPickPool`: el peso de la ruleta sin el azar), así que salen tus próximos, los
 * abandonados con «otra oportunidad» y los completados con «rejugar»; nunca el juego de la ficha.
 */
function buildSameGenre(slug: string, genre: string | undefined, own: TabData): GameSheet['sameGenre'] {
  if (!genre) return null;
  const games = filterPickPool(buildPickPool(own), { genres: [genre], platforms: [] })
    .filter(({ game }) => gameSheetSlug(game.name) !== slug)
    .slice(0, SAME_GENRE_MAX)
    .map(({ game, sourceTab }) => ({
      slug: gameSheetSlug(game.name),
      name: game.name,
      platforms: game.platforms || [],
      ownTab: sourceTab,
      friendCount: 0,
      current: false,
    }));
  return games.length ? { genre, games } : null;
}

/**
 * Monta la ficha de un juego. Los deseos de las amistades van aparte («lo quieren») y sin nota; la media sale con las
 * notas que haya, por pocas que sean (F0.2), y dice cuántas son. El nombre que se enseña es el tuyo si lo tienes y,
 * si no, el de la primera amistad que lo nombra.
 */
export function buildGameSheet({ slug, own, signals }: BuildGameSheetInput): GameSheet {
  const ownEntry = findOwnEntry(own, slug);
  const all = mergeFriends(slug, signals).sort(compareFriends);
  const friends = all.filter((friend) => friend.tab !== 'd');
  const wishers = all.filter((friend) => friend.tab === 'd').map((friend) => ({ ...friend, grade: null }));
  const grades = friends.map((friend) => friend.grade).filter((grade): grade is number => grade !== null);
  const average = grades.length
    ? { grade: Math.round(grades.reduce((sum, grade) => sum + grade, 0) / grades.length), count: grades.length }
    : null;
  const name = ownEntry?.item.name ?? signalGameName(slug, signals) ?? slug.replace(/-/g, ' ');
  const saga = buildSaga(slug, name, own, signals);
  const deAmistad = signals.find((signal): signal is Extract<GameSheetSignal, { kind: 'library' }> =>
    signal.kind === 'library' && matchesGameSheet(slug, signal.item.name) && Boolean(signal.item.genres?.length));
  const genre = ownEntry?.item.genres?.[0] ?? deAmistad?.item.genres[0];
  return {
    slug,
    name,
    own: ownEntry,
    friends,
    wishers,
    average,
    saga,
    sameGenre: saga.length ? null : buildSameGenre(slug, genre, own),
  };
}
