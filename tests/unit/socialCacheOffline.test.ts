import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCachedSocialDirectory,
  getCachedSocialProfile,
  invalidateCachedSocialDirectory,
  invalidateCachedSocialProfile,
  putCachedSocialDirectory,
  putCachedSocialProfile,
} from '../../src/model/repository/indexedDbRepository';
import { PROFILE_CACHE_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';

// SIN CONEXIÓN, las cachés del espacio social dejan de caducar: el TTL solo tiene sentido si hay a dónde ir a por
// algo más nuevo. Esto es lo que hace que el espacio social ABRA sin red (feed y perfil tal y como quedaron) en vez
// de quedarse vacío con un error de red. La versión de FORMA de la caché sigue invalidando: eso no es rancio, es
// ilegible.

const GIST = 'aabbcc0011223399';
const DIR_KEY = `__dir__:${GIST}`;
const PROFILE_KEY = `__profile__:${GIST}`;
/** Versión de forma VIGENTE del directorio (ver `SOCIAL_DIRECTORY_CACHE_VERSION`). */
const CURRENT_VERSION = 4;

async function writeRawRecord(record: Record<string, unknown>): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROFILE_CACHE_STORE, 'readwrite');
    tx.objectStore(PROFILE_CACHE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

beforeEach(async () => {
  await invalidateCachedSocialDirectory(GIST);
  await invalidateCachedSocialProfile(GIST);
});

afterEach(() => setOnLine(true));

describe('caché del directorio social sin conexión', () => {
  it('sirve una caché CADUCADA cuando no hay red', async () => {
    await writeRawRecord({
      profileId: DIR_KEY,
      cachedAt: Date.now() - 5 * 60 * 60 * 1000, // cinco horas: caducada con cualquier rango
      version: CURRENT_VERSION,
      entries: [{ id: 'ada' }],
    });

    setOnLine(false);
    await expect(getCachedSocialDirectory(GIST)).resolves.toEqual([{ id: 'ada' }]);

    // Con red, la misma caché se descarta y toca rehidratar: el comportamiento de siempre no cambia.
    setOnLine(true);
    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });

  it('sin red sigue descartando una caché de OTRA versión de forma (ilegible, no rancia)', async () => {
    await writeRawRecord({ profileId: DIR_KEY, cachedAt: Date.now(), version: 99, entries: [{ id: 'ada' }] });

    setOnLine(false);
    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });

  it('sin red y sin nada guardado devuelve null (no hay caché que servir)', async () => {
    setOnLine(false);
    await expect(getCachedSocialDirectory(GIST)).resolves.toBeNull();
  });
});

describe('caché del perfil propio sin conexión', () => {
  const profile = {
    name: 'Ada',
    hiddenTabs: [],
    hideReplayable: false,
    hideRetry: false,
    hideGameTime: false,
    showPhoto: true,
    profileExists: true,
    activity: [],
  };

  it('sirve el perfil guardado aunque haya pasado su ventana de 5 min', async () => {
    await putCachedSocialProfile(GIST, profile);
    await writeRawRecord({ profileId: PROFILE_KEY, cachedAt: Date.now() - 60 * 60 * 1000, ...profile });

    setOnLine(false);
    await expect(getCachedSocialProfile(GIST)).resolves.toMatchObject({ name: 'Ada', profileExists: true });

    setOnLine(true);
    await expect(getCachedSocialProfile(GIST)).resolves.toBeNull();
  });
});

describe('caché fresca', () => {
  it('se sirve igual con red y sin ella', async () => {
    await putCachedSocialDirectory(GIST, [{ id: 'ada' }]);

    await expect(getCachedSocialDirectory(GIST)).resolves.toEqual([{ id: 'ada' }]);
    setOnLine(false);
    await expect(getCachedSocialDirectory(GIST)).resolves.toEqual([{ id: 'ada' }]);
  });
});
