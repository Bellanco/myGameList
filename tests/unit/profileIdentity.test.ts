import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLocalMeta,
  patchLocalMeta,
  seedProfileIdFromRemote,
} from '../../src/model/repository/indexedDbRepository';
import { META_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';

async function clearMeta(): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('6.2a — seedProfileIdFromRemote (estabilidad del profileId entre dispositivos)', () => {
  beforeEach(async () => { await clearMeta(); });

  it('siembra el remoto canónico cuando el dispositivo aún no tiene profileId local', async () => {
    const result = await seedProfileIdFromRemote('canonico-123');
    expect(result).toBe('canonico-123');
    expect((await getLocalMeta())?.profileId).toBe('canonico-123');
  });

  it('reconcilia (gana el remoto) cuando el local YA divergió con un UUID propio', async () => {
    await patchLocalMeta({ profileId: 'local-divergente' });
    const result = await seedProfileIdFromRemote('canonico-123');
    expect(result).toBe('canonico-123');
    expect((await getLocalMeta())?.profileId).toBe('canonico-123');
  });

  it('conserva el profileId local cuando no hay remoto (sin escritura redundante)', async () => {
    await patchLocalMeta({ profileId: 'local-existente' });
    const result = await seedProfileIdFromRemote(null);
    expect(result).toBe('local-existente');
    expect((await getLocalMeta())?.profileId).toBe('local-existente');
  });

  it('es idempotente cuando remoto y local ya coinciden', async () => {
    await patchLocalMeta({ profileId: 'mismo-id' });
    const result = await seedProfileIdFromRemote('mismo-id');
    expect(result).toBe('mismo-id');
    expect((await getLocalMeta())?.profileId).toBe('mismo-id');
  });

  it('crea uno nuevo (primer dispositivo) cuando no hay ni remoto ni local', async () => {
    const result = await seedProfileIdFromRemote('');
    expect(result).toBeTruthy();
    expect((await getLocalMeta())?.profileId).toBe(result);
  });
});
