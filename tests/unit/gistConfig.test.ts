import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY } from '../../src/core/constants/storageKeys';

// El token cifrado en reposo (C4) se cachea en estado de módulo. Para simular "sesiones" independientes
// (recargas), se reimporta el módulo con vi.resetModules() — localStorage e IndexedDB son globales y persisten,
// que es justo lo que queremos: el blob cifrado y la clave de dispositivo sobreviven a la recarga.
async function freshModule() {
  vi.resetModules();
  return import('../../src/model/repository/gistConfigRepository');
}

/**
 * Espera a que el cifrado EN SEGUNDO PLANO haya escrito el `encToken`.
 *
 * Antes había un `setTimeout(30)` fijo, y eso convertía la prueba en una apuesta: el cifrado es AES-GCM con una
 * clave de dispositivo no exportable, así que su duración depende de lo cargada que esté la máquina. En una
 * suite completa —o en CI— 30 ms no bastan y el test fallaba sin que nada estuviera roto, que es la peor clase
 * de test: el que te enseña a ignorarlo. Ahora se sondea hasta que la condición se cumple.
 */
async function esperarTokenCifrado(): Promise<string> {
  return vi.waitFor(() => {
    const raw = localStorage.getItem(GIST_CFG_KEY) || '';
    if (!raw.includes('encToken')) {
      throw new Error('el cifrado en segundo plano todavía no ha escrito el encToken');
    }
    return raw;
  }, { timeout: 5000, interval: 10 });
}

describe('gistConfigRepository (C4) — token cifrado en reposo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveSyncConfig NO guarda el token en claro y lo deja accesible en memoria', async () => {
    const mod = await freshModule();
    mod.saveSyncConfig({ token: 'ghp_secreto', gistId: 'gid', etag: 'e1', lastRemoteUpdatedAt: 5 });
    const raw = await esperarTokenCifrado();
    expect(raw).not.toContain('ghp_secreto');
    expect(raw).toContain('encToken');
    expect(mod.getSyncConfig()?.token).toBe('ghp_secreto');
  });

  it('hidrata el token cifrado en una nueva sesión (reimport del módulo)', async () => {
    const first = await freshModule();
    first.saveSyncConfig({ token: 'ghp_persistido', gistId: 'gid2', etag: null, lastRemoteUpdatedAt: 0 });
    await esperarTokenCifrado();

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

/**
 * El canal SOCIAL guarda una copia del MISMO PAT (la hace `socialChannel.resolveSocialChannel`), y durante un
 * tiempo la guardó en claro: el cifrado del canal de juegos quedaba anulado, porque el mismo secreto era legible
 * en la clave de al lado. Estos tests fijan que los dos canales se tratan igual.
 */
describe('gistConfigRepository (C4) — el canal social se cifra igual que el de juegos', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  async function esperarSocialCifrado(): Promise<string> {
    return vi.waitFor(() => {
      const raw = localStorage.getItem(SOCIAL_GIST_CFG_KEY) || '';
      if (!raw.includes('encToken')) {
        throw new Error('el cifrado en segundo plano todavía no ha escrito el encToken');
      }
      return raw;
    }, { timeout: 5000, interval: 10 });
  }

  it('saveSocialSyncConfig NO guarda el token en claro y lo deja accesible en memoria', async () => {
    const mod = await freshModule();
    mod.saveSocialSyncConfig({ token: 'ghp_social', gistId: 'sid', etag: 'e1', lastRemoteUpdatedAt: 5 });
    const raw = await esperarSocialCifrado();
    expect(raw).not.toContain('ghp_social');
    expect(raw).toContain('encToken');
    expect(mod.getSocialSyncConfig()?.token).toBe('ghp_social');
    expect(mod.getSocialSyncConfig()?.gistId).toBe('sid');
  });

  it('hidrata el token social cifrado en una nueva sesión', async () => {
    const first = await freshModule();
    first.saveSocialSyncConfig({ token: 'ghp_social_persistido', gistId: 'sid2', etag: null, lastRemoteUpdatedAt: 0 });
    await esperarSocialCifrado();

    const next = await freshModule();
    await next.ensureSyncConfigLoaded(); // hidrata LOS DOS canales
    expect(next.getSocialSyncConfig()?.token).toBe('ghp_social_persistido');
  });

  it('migra el token social legacy en claro a encToken al cargar', async () => {
    localStorage.setItem(
      SOCIAL_GIST_CFG_KEY,
      JSON.stringify({ token: 'ghp_social_legacy', gistId: 'sid3', etag: 'e9', lastRemoteUpdatedAt: 1 }),
    );
    const mod = await freshModule();
    await mod.ensureSyncConfigLoaded();

    const raw = localStorage.getItem(SOCIAL_GIST_CFG_KEY) || '';
    expect(raw).not.toContain('ghp_social_legacy');
    expect(raw).toContain('encToken');
    expect(mod.getSocialSyncConfig()?.token).toBe('ghp_social_legacy');
  });

  it('los dos canales son independientes: desconectar la sync de juegos no borra el token social', async () => {
    const mod = await freshModule();
    mod.saveSyncConfig({ token: 'ghp_juegos', gistId: 'gid', etag: null, lastRemoteUpdatedAt: 0 });
    mod.saveSocialSyncConfig({ token: 'ghp_social', gistId: 'sid', etag: null, lastRemoteUpdatedAt: 0 });

    mod.clearSyncConfig();

    // Es lo único con lo que aún se puede escribir en el canal social (ver `socialChannel.resolveSocialChannel`).
    expect(mod.getSyncConfig()).toBeNull();
    expect(mod.getSocialSyncConfig()?.token).toBe('ghp_social');
  });
});
