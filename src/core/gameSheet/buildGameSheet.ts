import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import { gameSheetSlug, matchesGameSheet } from '../utils/gameSheetPath';
import { sharedSagaName } from '../utils/gameSaga';
import { resolveGrade } from '../utils/scoreScale';

export interface GameSheetFriendRef {
  id: string;
  name: string;
  photoURL?: string;
}

export type GameSheetSignal =
  | { kind: 'library'; friend: GameSheetFriendRef; tab: TabId; item: GameItem & { finishedOn?: string } }
  | { kind: 'review'; friend: GameSheetFriendRef; gameName: string; grade: number | null; snippet: string; at: number }
  | { kind: 'move'; friend: GameSheetFriendRef; gameName: string; tab: TabId; at: number };

export interface GameSheetFriend {
  id: string;
  name: string;
  photoURL?: string;
  tab: TabId;
  grade: number | null;
  snippet: string;
  finishedOn?: string;
}

export interface GameSheetSagaEntry {
  slug: string;
  name: string;
  ownTab: TabId | null;
  friendCount: number;
  current: boolean;
}

export interface GameSheet {
  slug: string;
  name: string;
  own: { tab: TabId; item: GameItem } | null;
  friends: GameSheetFriend[];
  wishers: GameSheetFriend[];
  average: { grade: number; count: number } | null;
  saga: GameSheetSagaEntry[];
}

export interface BuildGameSheetInput {
  slug: string;
  own: TabData;
  signals: readonly GameSheetSignal[];
}

export function findOwnEntry(own: TabData, slug: string): { tab: TabId; item: GameItem } | null {
  for (const tab of TAB_IDS) {
    const item = (own[tab] || []).find((game) => matchesGameSheet(slug, game.name));
    if (item) return { tab, item };
  }
  return null;
}

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

function compareFriends(a: GameSheetFriend, b: GameSheetFriend): number {
  const byReview = Number(Boolean(b.snippet)) - Number(Boolean(a.snippet));
  if (byReview) return byReview;
  const byGrade = (b.grade ?? -1) - (a.grade ?? -1);
  if (byGrade) return byGrade;
  return a.name.localeCompare(b.name, 'es');
}

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
    const entry = entries.get(key) ?? { slug: key, name: gameName, ownTab: null, friendCount: 0, current: key === slug, friends: new Set<string>() };
    entries.set(key, entry);
    return entry;
  };
  for (const tab of TAB_IDS) {
    for (const item of own[tab] || []) {
      const entry = touch(item.name);
      if (entry && entry.ownTab === null) {
        entry.ownTab = tab;
        entry.name = item.name;
      }
    }
  }
  for (const signal of signals) {
    if (signal.kind !== 'library' || signal.tab === 'd') continue;
    const entry = touch(signal.item.name);
    entry?.friends.add(signal.friend.id);
  }
  if (!entries.has(slug)) touch(name);
  const saga = [...entries.values()].map(({ friends, ...entry }) => ({ ...entry, friendCount: friends.size }));
  if (saga.length < 2) return [];
  return saga.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildGameSheet({ slug, own, signals }: BuildGameSheetInput): GameSheet {
  const ownEntry = findOwnEntry(own, slug);
  const all = mergeFriends(slug, signals).sort(compareFriends);
  const friends = all.filter((friend) => friend.tab !== 'd');
  const wishers = all.filter((friend) => friend.tab === 'd').map((friend) => ({ ...friend, grade: null }));
  const grades = friends.map((friend) => friend.grade).filter((grade): grade is number => grade !== null);
  const average = grades.length
    ? { grade: Math.round(grades.reduce((sum, grade) => sum + grade, 0) / grades.length), count: grades.length }
    : null;
  const firstSignal = signals.find((signal) => matchesGameSheet(slug, signalName(signal)));
  const name = ownEntry?.item.name ?? (firstSignal ? signalName(firstSignal) : slug.replace(/-/g, ' '));
  return {
    slug,
    name,
    own: ownEntry,
    friends,
    wishers,
    average,
    saga: buildSaga(slug, name, own, signals),
  };
}
