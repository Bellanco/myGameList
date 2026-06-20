import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteGame,
  getAllGameRecords,
  getGamesAsTabData,
  getSyncQueue,
  upsertGame,
} from '../../src/model/repository/indexedDbRepository';
import { DELETED_STORE, GAMES_STORE, META_STORE, SYNC_QUEUE_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';
import type { GameItem } from '../../src/model/types/game';

function makeGame(id: number): GameItem {
  return { id, _ts: 1, name: `Game ${id}`, platforms: [], genres: [], steamDeck: false, review: '' };
}

async function resetStores(): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE, SYNC_QUEUE_STORE, META_STORE], 'readwrite');
    tx.objectStore(GAMES_STORE).clear();
    tx.objectStore(DELETED_STORE).clear();
    tx.objectStore(SYNC_QUEUE_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('games store write accessors', () => {
  beforeEach(async () => { await resetStores(); });

  it('upsertGame escribe el registro, fija _ts, incrementa _v y encola un SyncOp', async () => {
    const saved = await upsertGame(makeGame(1), 'c');
    expect(saved._v).toBe(1);
    expect(saved._ts).toBeGreaterThan(1);

    const data = await getGamesAsTabData();
    expect(data.c.map((g) => g.id)).toEqual([1]);
    expect(data.c[0]).not.toHaveProperty('_tab');

    const queue = await getSyncQueue();
    expect(queue.some((op) => op.type === 'upsertGame')).toBe(true);

    const again = await upsertGame(saved, 'c');
    expect(again._v).toBe(2);
  });

  it('deleteGame quita el registro, crea tombstone y encola un SyncOp', async () => {
    await upsertGame(makeGame(2), 'v');
    await deleteGame(2);

    const data = await getGamesAsTabData();
    expect(data.v.find((g) => g.id === 2)).toBeUndefined();
    expect(data.deleted.map((d) => d.id)).toContain(2);
    expect((await getAllGameRecords()).find((r) => r.id === 2)).toBeUndefined();
    expect((await getSyncQueue()).some((op) => op.type === 'deleteGame')).toBe(true);
  });

  it('revival: upsert tras delete elimina el tombstone y restaura el juego', async () => {
    await upsertGame(makeGame(3), 'c');
    await deleteGame(3);
    await upsertGame(makeGame(3), 'p');

    const data = await getGamesAsTabData();
    expect(data.p.map((g) => g.id)).toContain(3);
    expect(data.deleted.map((d) => d.id)).not.toContain(3);
  });
});
