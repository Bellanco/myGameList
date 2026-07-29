import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCachedSocialDirectory, invalidateCachedSocialDirectory, putCachedSocialDirectory } from '../../src/model/repository/indexedDbRepository';
import { PROFILE_CACHE_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';

// La caché del directorio social solo caducaba por tiempo (30 min). Si cambia la FORMA de lo que se guarda en
// cada entrada, el usuario seguía viendo la vieja hasta que caducara — y no hay forma de forzarlo desde la UI.
// Pasó al subir el tope de actividad por perfil de 40 a 320: la pestaña Reseñas seguía sin fecha publicada para
// las reseñas que el tope viejo había recortado.

const GIST = 'aabbcc0011223344';
const KEY = `__dir__:${GIST}`;

/** Escribe un registro CRUDO en el store, para simular una caché de otra versión de la app. */
async function writeRawRecord(record: Record<string, unknown>): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROFILE_CACHE_STORE, 'readwrite');
    tx.objectStore(PROFILE_CACHE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

beforeEach(async () => {
  await invalidateCachedSocialDirectory(GIST);
});

describe('caché del directorio social — versión de forma', () => {
  it('sirve lo que ella misma escribió', async () => {
    await putCachedSocialDirectory(GIST, [{ id: 'ada' }]);

    await expect(getCachedSocialDirectory(GIST)).resolves.toEqual([{ id: 'ada' }]);
  });

  it('IGNORA una caché sin versión (escrita por una versión anterior), aunque esté fresca', async () => {
    await writeRawRecord({ profileId: KEY, cachedAt: Date.now(), entries: [{ id: 'ada' }] });

    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });

  it('IGNORA una caché con otra versión de forma', async () => {
    await writeRawRecord({ profileId: KEY, cachedAt: Date.now(), version: 99, entries: [{ id: 'ada' }] });

    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });

  it('sigue caducando por tiempo (TTL de 30 min)', async () => {
    await writeRawRecord({
      profileId: KEY,
      cachedAt: Date.now() - 31 * 60 * 1000,
      version: 2,
      entries: [{ id: 'ada' }],
    });

    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });
});
