import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { isMigrationNeeded, runMigration } from '../../src/model/repository/dataMigrationRepository';
import { getGamesAsTabData, getLocalMeta, patchLocalMeta } from '../../src/model/repository/indexedDbRepository';
import { saveSyncConfig } from '../../src/model/repository/gistConfigRepository';
import { GAMES_STORE, META_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';
import { saveLocalState } from '../../src/model/repository/localRepository';
import type { GameItem, StoragePayload } from '../../src/model/types/game';

function makeGame(id: number): GameItem {
  return { id, _ts: 1000 + id, name: `Game ${id}`, platforms: ['Steam'], genres: ['RPG'], steamDeck: false, review: '' };
}

async function resetStores(): Promise<void> {
  localStorage.clear();
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, META_STORE, 'appState'], 'readwrite');
    tx.objectStore(GAMES_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.objectStore('appState').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function seed(): void {
  const payload: StoragePayload = {
    c: [makeGame(1)], v: [makeGame(2)], e: [], p: [makeGame(3)],
    deleted: [], updatedAt: Date.now(), etag: null, lastRemoteUpdatedAt: 0,
  };
  saveLocalState(payload);
}

describe('dataMigrationRepository.runMigration (Vía A, local)', () => {
  beforeEach(async () => {
    await resetStores();
  });

  it('dry-run no escribe pero reporta lo que migraría', async () => {
    seed();
    expect(await isMigrationNeeded()).toBe(true);
    const result = await runMigration({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.gamesImported).toBe(3);
    // No escribió nada:
    const data = await getGamesAsTabData();
    expect(data.c.length + data.v.length + data.e.length + data.p.length).toBe(0);
    expect(await isMigrationNeeded()).toBe(true);
  });

  it('migra los juegos al store games agrupados por pestaña y marca la versión', async () => {
    seed();
    const result = await runMigration();
    expect(result.skipped).toBe(false);
    expect(result.gamesImported).toBe(3);
    expect(result.errors).toEqual([]);

    const data = await getGamesAsTabData();
    expect(data.c.map((g) => g.id)).toEqual([1]);
    expect(data.v.map((g) => g.id)).toEqual([2]);
    expect(data.p.map((g) => g.id)).toEqual([3]);
    expect(data.c[0]).not.toHaveProperty('_tab');

    const meta = await getLocalMeta();
    expect(meta?.migrationVersion).toBe(3);
    expect(await isMigrationNeeded()).toBe(false);
  });

  // C4 — el runner sembraba el PAT en claro en el meta de IndexedDB, y nadie lo leía de ahí: era un secreto en
  // disco a cambio de nada, y dejaba sin efecto el cifrado en reposo del registro de localStorage.
  it('no siembra el token de GitHub en el meta', async () => {
    seed();
    saveSyncConfig({ token: 'ghp_no_deberia_persistir', gistId: 'gid-mig', etag: 'e1', lastRemoteUpdatedAt: 0 });

    await runMigration();

    const meta = await getLocalMeta();
    expect(meta?.gamesGistId).toBe('gid-mig'); // el id del gist sí se siembra: no es un secreto y se usa
    expect(meta?.githubToken || '').toBe('');
  });

  it('purga un token en claro ya sembrado por una versión anterior, aunque la migración esté hecha', async () => {
    seed();
    await runMigration();
    // Simula el residuo de la versión anterior en un dispositivo que YA migró.
    await patchLocalMeta({ githubToken: 'ghp_residuo_de_antes' });
    expect((await getLocalMeta())?.githubToken).toBe('ghp_residuo_de_antes');

    const second = await runMigration();

    expect(second.skipped).toBe(true); // sigue cortando por versión...
    expect((await getLocalMeta())?.githubToken).toBe(''); // ...pero la purga se hace igual
  });

  it('el dry-run no purga (no escribe nada, por definición)', async () => {
    seed();
    await runMigration();
    await patchLocalMeta({ githubToken: 'ghp_residuo_de_antes' });

    await runMigration({ dryRun: true });

    expect((await getLocalMeta())?.githubToken).toBe('ghp_residuo_de_antes');
  });

  it('es idempotente: una segunda ejecución se omite', async () => {
    seed();
    await runMigration();
    const second = await runMigration();
    expect(second.skipped).toBe(true);
    expect(second.gamesImported).toBe(0);
  });

  it('no es destructivo: appState sigue intacto tras migrar', async () => {
    seed();
    await runMigration();
    const db = await openSharedDatabase();
    const appState = await new Promise<unknown>((resolve) => {
      const req = db.transaction('appState', 'readonly').objectStore('appState').get('latest');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    expect(appState).toBeTruthy();
    expect((appState as StoragePayload).c.map((g) => g.id)).toContain(1);
  });
});
