import { TAB_IDS, type GameItem, type TabData } from '../types/game';
import { normalizeTimestamp } from '../../core/utils/normalize';

/**
 * E1 (escalabilidad): ventana de retención de tombstones. Un borrado más antiguo que esto se purga del estado
 * sincronizado SIEMPRE que ya no exista copia viva del item en ningún lado (evita que el array `deleted` infle el
 * gist indefinidamente). Conservador: 90 días cubren de sobra a un dispositivo que sincroniza con normalidad; solo
 * un dispositivo offline >90 días podría "revivir" un item borrado.
 */
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

type MergeItem = GameItem & { _tab: 'c' | 'v' | 'e' | 'p' };

/**
 * Clave canónica del contenido de un item. Recorre las claves ORDENADAS para que el resultado no dependa
 * del orden de inserción del objeto de origen (dos dispositivos generan la misma clave para el mismo contenido).
 * Sirve para dos cosas: (a) desempate determinista e independiente del lado y (b) detectar divergencia real.
 */
function contentKey(item: MergeItem): string {
  return Object.keys(item)
    .sort()
    .map((k) => `${k}=${JSON.stringify((item as unknown as Record<string, unknown>)[k] ?? null)}`)
    .join('|');
}

/**
 * S1: desempate determinista del ganador de un merge. Orden estable e IDÉNTICO en ambos dispositivos:
 *   1. `_ts` mayor gana (reloj CRDT).
 *   2. empate de `_ts` → `_v` mayor gana (versión; ausente = 0).
 *   3. empate de `_v` → `contentKey` menor gana (hash de contenido estable, no depende de qué lado es "local").
 * El paso 3 es la corrección clave: antes `local._ts >= remote._ts` hacía ganar SIEMPRE al lado local, así que dos
 * dispositivos con el mismo `_ts` y distinto contenido elegían cada uno SU versión y nunca convergían.
 */
function pickDeterministic(a: MergeItem, b: MergeItem): MergeItem {
  if (a._ts !== b._ts) return a._ts > b._ts ? a : b;
  const av = Number.isFinite(Number(a._v)) ? Number(a._v) : 0;
  const bv = Number.isFinite(Number(b._v)) ? Number(b._v) : 0;
  if (av !== bv) return av > bv ? a : b;
  const ak = contentKey(a);
  const bk = contentKey(b);
  if (ak !== bk) return ak < bk ? a : b;
  return a; // contenido idéntico → da igual cuál
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

  const now = Date.now();
  const merged: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: now };
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
      // E1: purga de tombstones antiguos. Solo si NO hay copia viva en ningún lado (maxItemTs === 0) y el borrado
      // es anterior a la ventana de retención: se descarta y se marca needsUpdate para que ambos lados lo suelten.
      if (maxItemTs === 0 && maxDelTs < now - TOMBSTONE_RETENTION_MS) {
        if (localDeleted.has(id)) localNeedsUpdate = true;
        if (remoteDeleted.has(id)) remoteNeedsUpdate = true;
        continue;
      }
      merged.deleted.push({ id, _ts: maxDelTs });
      // deleted differs from local/remote states
      const ldt = localDeleted.get(id) || 0;
      const rdt = remoteDeleted.get(id) || 0;
      if (ldt !== maxDelTs) localNeedsUpdate = true;
      if (rdt !== maxDelTs) remoteNeedsUpdate = true;
      continue;
    }

    const winner = localItem && remoteItem ? pickDeterministic(localItem, remoteItem) : (localItem || remoteItem);

    if (winner) {
      const { _tab, ...game } = winner;
      merged[_tab].push(game);
      const winnerKey = contentKey(winner);
      // Marca needsUpdate si el ganador difiere del contenido que tenía ese lado (no solo por `_ts`/`_tab`):
      // un empate de `_ts` con distinto contenido también deja a un lado obsoleto y debe re-escribirse.
      if (!localItem || contentKey(localItem) !== winnerKey) localNeedsUpdate = true;
      if (!remoteItem || contentKey(remoteItem) !== winnerKey) remoteNeedsUpdate = true;
    }
  }

  return { merged, localNeedsUpdate, remoteNeedsUpdate };
}
