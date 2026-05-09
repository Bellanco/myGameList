import type { GameItem, TabData } from '../types/game';

function asValidData(data: unknown): TabData {
  const d = data as Partial<TabData>;
  if (!d || typeof d !== 'object') {
    return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
  }

  return {
    c: Array.isArray(d.c) ? (d.c as GameItem[]) : [],
    v: Array.isArray(d.v) ? (d.v as GameItem[]) : [],
    e: Array.isArray(d.e) ? (d.e as GameItem[]) : [],
    p: Array.isArray(d.p) ? (d.p as GameItem[]) : [],
    deleted: Array.isArray(d.deleted) ? d.deleted : [],
    updatedAt: Number(d.updatedAt || Date.now()),
  };
}

export function mergeCrdt(localData: TabData, localTs: number, remoteData: TabData, remoteTs: number): { merged: TabData; hasChanges: boolean } {
  const local = asValidData(localData);
  const remote = asValidData(remoteData);

  const localMap = new Map<number, GameItem & { _tab: 'c' | 'v' | 'e' | 'p' }>();
  const remoteMap = new Map<number, GameItem & { _tab: 'c' | 'v' | 'e' | 'p' }>();

  (['c', 'v', 'e', 'p'] as const).forEach((tab) => {
    for (const game of local[tab]) {
      if (!game?.id) continue;
      const ts = game._ts || localTs;
      const current = localMap.get(game.id);
      if (!current || ts > current._ts) localMap.set(game.id, { ...game, _tab: tab, _ts: ts });
    }

    for (const game of remote[tab]) {
      if (!game?.id) continue;
      const ts = game._ts || remoteTs;
      const current = remoteMap.get(game.id);
      if (!current || ts > current._ts) remoteMap.set(game.id, { ...game, _tab: tab, _ts: ts });
    }
  });

  const localDeleted = new Map<number, number>((local.deleted || []).map((entry) => [entry.id, entry._ts || localTs]));
  const remoteDeleted = new Map<number, number>((remote.deleted || []).map((entry) => [entry.id, entry._ts || remoteTs]));

  const allIds = new Set<number>([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...localDeleted.keys(),
    ...remoteDeleted.keys(),
  ]);

  const merged: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
  let hasChanges = false;

  for (const id of allIds) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);
    const localDelTs = localDeleted.get(id) || 0;
    const remoteDelTs = remoteDeleted.get(id) || 0;
    const maxDelTs = Math.max(localDelTs, remoteDelTs);
    const maxLocalTs = localItem?._ts || 0;
    const maxRemoteTs = remoteItem?._ts || 0;
    const maxItemTs = Math.max(maxLocalTs, maxRemoteTs);

    if (maxDelTs > 0 && maxDelTs > maxItemTs) {
      merged.deleted.push({ id, _ts: maxDelTs });
      hasChanges = true;
      continue;
    }

    const winner =
      localItem && remoteItem
        ? localItem._ts >= remoteItem._ts
          ? localItem
          : remoteItem
        : (localItem || remoteItem);

    if (winner) {
      const { _tab, ...game } = winner;
      merged[_tab].push(game);
      if (!localItem || !remoteItem || localItem._ts !== remoteItem._ts) {
        hasChanges = true;
      }
    }
  }

  return { merged, hasChanges };
}
