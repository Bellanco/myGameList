import { TAB_IDS, type GameItem, type TabData } from '../types/game';

function normalizeTimestamp(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function asValidData(data: unknown): TabData {
  const d = (data && typeof data === 'object' ? (data as Partial<TabData>) : {}) as Partial<TabData>;
  const toValidGames = (items: unknown): GameItem[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((g) => g as GameItem)
      .filter((g) => Boolean(g && Number(g.id) > 0))
      .map((g) => ({ ...g }));
  };

  const deleted = Array.isArray(d.deleted)
    ? (d.deleted as Array<{ id: number; _ts: number }>).filter((it) => it && Number(it.id) > 0).map((it) => ({ id: Number(it.id), _ts: Number(it._ts || 0) }))
    : [];

  return {
    c: toValidGames(d.c),
    v: toValidGames(d.v),
    e: toValidGames(d.e),
    p: toValidGames(d.p),
    deleted,
    updatedAt: normalizeTimestamp((d as any).updatedAt, Date.now()),
  };
}

export function mergeCrdt(
  localData: TabData,
  localTs: number,
  remoteData: TabData,
  remoteTs: number,
): { merged: TabData; localNeedsUpdate: boolean; remoteNeedsUpdate: boolean } {
  const local = asValidData(localData);
  const remote = asValidData(remoteData);

  const localMap = new Map<number, GameItem & { _tab: 'c' | 'v' | 'e' | 'p' }>();
  const remoteMap = new Map<number, GameItem & { _tab: 'c' | 'v' | 'e' | 'p' }>();

  TAB_IDS.forEach((tab) => {
    for (const game of local[tab]) {
      if (!game?.id) continue;
      const ts = Number(game._ts);
      const nts = Number.isFinite(ts) && ts > 0 ? ts : localTs;
      const current = localMap.get(game.id);
      if (!current || nts > current._ts) localMap.set(game.id, { ...game, _tab: tab, _ts: nts });
    }

    for (const game of remote[tab]) {
      if (!game?.id) continue;
      const ts = Number(game._ts);
      const nts = Number.isFinite(ts) && ts > 0 ? ts : remoteTs;
      const current = remoteMap.get(game.id);
      if (!current || nts > current._ts) remoteMap.set(game.id, { ...game, _tab: tab, _ts: nts });
    }
  });

  const localDeleted = new Map<number, number>(
    (local.deleted || []).map((entry) => [entry.id, Number(entry._ts) > 0 ? Number(entry._ts) : 1]),
  );
  const remoteDeleted = new Map<number, number>(
    (remote.deleted || []).map((entry) => [entry.id, Number(entry._ts) > 0 ? Number(entry._ts) : 1]),
  );

  const allIds = new Set<number>([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...localDeleted.keys(),
    ...remoteDeleted.keys(),
  ]);

  const merged: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
  let localNeedsUpdate = false;
  let remoteNeedsUpdate = false;

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
      // deleted differs from local/remote states
      const ldt = localDeleted.get(id) || 0;
      const rdt = remoteDeleted.get(id) || 0;
      if (ldt !== maxDelTs) localNeedsUpdate = true;
      if (rdt !== maxDelTs) remoteNeedsUpdate = true;
      continue;
    }

    const winner = localItem && remoteItem ? (localItem._ts >= remoteItem._ts ? localItem : remoteItem) : (localItem || remoteItem);

    if (winner) {
      const { _tab, ...game } = winner;
      merged[_tab].push(game);
      const localTsVal = localItem?._ts || 0;
      const remoteTsVal = remoteItem?._ts || 0;
      // if winner differs from what local had
      if (!localItem || winner._ts !== localTsVal || winner._tab !== (localItem as any)._tab) {
        localNeedsUpdate = true;
      }
      // if winner differs from what remote had
      if (!remoteItem || winner._ts !== remoteTsVal || winner._tab !== (remoteItem as any)._tab) {
        remoteNeedsUpdate = true;
      }
    }
  }

  return { merged, localNeedsUpdate, remoteNeedsUpdate };
}
