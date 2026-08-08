import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCachedSocialDirectory, invalidateCachedSocialDirectory, putCachedSocialDirectory } from '../../src/model/repository/indexedDbRepository';
import { PROFILE_CACHE_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';
import { PROFILE_TIER_FEED_TTL_MS } from '../../src/core/constants/tiers';

// La caché del directorio social solo caducaba por tiempo (30 min). Si cambia la FORMA de lo que se guarda en
// cada entrada, el usuario seguía viendo la vieja hasta que caducara — y no hay forma de forzarlo desde la UI.
// Pasó al subir el tope de actividad por perfil de 40 a 320: la pestaña Reseñas seguía sin fecha publicada para
// las reseñas que el tope viejo había recortado.

const GIST = 'aabbcc0011223344';
const KEY = `__dir__:${GIST}`;
/** Versión de forma VIGENTE. Subirla aquí al subirla en `indexedDbRepository` (hoy 3: las entradas traen `tier`). */
const CURRENT_VERSION = 3;

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

  // OJO al tocar `SOCIAL_DIRECTORY_CACHE_VERSION`: este registro tiene que llevar la versión VIGENTE, o el test
  // pasaría por descarte de versión en vez de por caducidad y dejaría de comprobar el TTL.
  it('sigue caducando por tiempo (TTL por defecto de 30 min)', async () => {
    await writeRawRecord({
      profileId: KEY,
      cachedAt: Date.now() - 31 * 60 * 1000,
      version: CURRENT_VERSION,
      entries: [{ id: 'ada' }],
    });

    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });

  // El TTL lo pone el RANGO de quien mira (`PROFILE_TIER_FEED_TTL_MS`): oro ve como rancio lo que a bronce
  // todavía le vale, y por eso rehidrata más a menudo.
  describe('TTL por rango', () => {
    it('una caché de 12 min: bronce la sirve, oro la descarta', async () => {
      await writeRawRecord({
        profileId: KEY,
        cachedAt: Date.now() - 12 * 60 * 1000,
        version: CURRENT_VERSION,
        entries: [{ id: 'ada' }],
      });

      await expect(getCachedSocialDirectory(GIST, PROFILE_TIER_FEED_TTL_MS.bronze)).resolves.toEqual([{ id: 'ada' }]);
      await expect(getCachedSocialDirectory(GIST, PROFILE_TIER_FEED_TTL_MS.gold)).resolves.toBeNull();
    });

    it('mithril descarta la caché pasado su suelo, pero dentro de él no relee en cada navegación', async () => {
      // Los márgenes se derivan del propio suelo, no de un número escrito a mano: así, cuando el suelo se mueva
      // (lo fija el rate-limit de GitHub, ver tiers.ts), este test siga comprobando lo que dice comprobar.
      const suelo = PROFILE_TIER_FEED_TTL_MS.mithril;

      await putCachedSocialDirectory(GIST, [{ id: 'ada' }]);
      // Recién escrita: dentro del suelo → se sirve (feed→detalle→feed no dispara ~50 lecturas de gist).
      await expect(getCachedSocialDirectory(GIST, suelo)).resolves.toEqual([{ id: 'ada' }]);

      // Justo por debajo del suelo: todavía se sirve.
      await writeRawRecord({
        profileId: KEY,
        cachedAt: Date.now() - Math.round(suelo * 0.5),
        version: CURRENT_VERSION,
        entries: [{ id: 'ada' }],
      });
      await expect(getCachedSocialDirectory(GIST, suelo)).resolves.toEqual([{ id: 'ada' }]);

      // Pasado el suelo: se descarta y toca rehidratar.
      await writeRawRecord({
        profileId: KEY,
        cachedAt: Date.now() - (suelo + 1_000),
        version: CURRENT_VERSION,
        entries: [{ id: 'ada' }],
      });
      await expect(getCachedSocialDirectory(GIST, suelo)).resolves.toBeNull();
    });

    it('sin TTL explícito se comporta como bronce (la cadencia de siempre)', async () => {
      await writeRawRecord({
        profileId: KEY,
        cachedAt: Date.now() - 20 * 60 * 1000,
        version: CURRENT_VERSION,
        entries: [{ id: 'ada' }],
      });

      await expect(getCachedSocialDirectory(GIST)).resolves.toEqual([{ id: 'ada' }]);
    });
  });
});
