import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GIST_CFG_KEY } from '../../src/core/constants/storageKeys';

// El token cifrado en reposo (C4) se cachea en estado de módulo. Para simular "sesiones" independientes
// (recargas), se reimporta el módulo con vi.resetModules() — localStorage e IndexedDB son globales y persisten,
// que es justo lo que queremos: el blob cifrado y la clave de dispositivo sobreviven a la recarga.
async function freshModule() {
  vi.resetModules();
  return import('../../src/model/repository/gistConfigRepository');
}

describe('gistConfigRepository (C4) — token cifrado en reposo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveSyncConfig NO guarda el token en claro y lo deja accesible en memoria', async () => {
    const mod = await freshModule();
    mod.saveSyncConfig({ token: 'ghp_secreto', gistId: 'gid', etag: 'e1', lastRemoteUpdatedAt: 5 });
    await new Promise((r) => setTimeout(r, 30)); // espera el cifrado en segundo plano

    const raw = localStorage.getItem(GIST_CFG_KEY) || '';
    expect(raw).not.toContain('ghp_secreto');
    expect(raw).toContain('encToken');
    expect(mod.getSyncConfig()?.token).toBe('ghp_secreto');
  });

  it('hidrata el token cifrado en una nueva sesión (reimport del módulo)', async () => {
    const first = await freshModule();
    first.saveSyncConfig({ token: 'ghp_persistido', gistId: 'gid2', etag: null, lastRemoteUpdatedAt: 0 });
    await new Promise((r) => setTimeout(r, 30));

    // Nueva sesión: módulo reimportado (caché de token vacía), mismo localStorage/IndexedDB.
    const next = await freshModule();
    await next.ensureSyncConfigLoaded();
    expect(next.getSyncConfig()?.token).toBe('ghp_persistido');
    expect(next.getSyncConfig()?.gistId).toBe('gid2');
  });

  it('migra un token legacy en claro a encToken al cargar', async () => {
    localStorage.setItem(
      GIST_CFG_KEY,
      JSON.stringify({ token: 'ghp_legacy', gistId: 'gid3', etag: 'e9', lastRemoteUpdatedAt: 1 }),
    );
    const mod = await freshModule();
    await mod.ensureSyncConfigLoaded();

    const raw = localStorage.getItem(GIST_CFG_KEY) || '';
    expect(raw).not.toContain('ghp_legacy'); // ya no hay token en claro
    expect(raw).toContain('encToken');
    expect(mod.getSyncConfig()?.token).toBe('ghp_legacy'); // sigue accesible descifrado
  });

  it('clearSyncConfig borra el registro', async () => {
    const mod = await freshModule();
    mod.saveSyncConfig({ token: 't', gistId: 'g', etag: null, lastRemoteUpdatedAt: 0 });
    mod.clearSyncConfig();
    expect(mod.getSyncConfig()).toBeNull();
  });
});
