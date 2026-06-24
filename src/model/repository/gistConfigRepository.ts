// Configuración de sincronización en localStorage (token + gistId + etag) para el gist de juegos y el social.
// Responsabilidad única: persistir/leer/borrar la `SyncConfig` de cada canal. Sin I/O de red ni estado de módulo.
// Extraído de gistRepository.ts (M1).
//
// C4: el token del gist de JUEGOS se guarda CIFRADO EN REPOSO con la clave de dispositivo no exportable (IndexedDB),
// nunca en claro. Como el cifrado es async pero `getSyncConfig()` se usa síncrono en toda la capa, el token descifrado
// se mantiene en una caché en memoria que se hidrata al iniciar (`ensureSyncConfigLoaded`). Los campos no sensibles
// (gistId/etag/lastRemoteUpdatedAt) siguen en claro y disponibles de forma síncrona.
// El gist SOCIAL mantiene su formato previo (su token es el mismo PAT; se recupera por el mismo canal).
import { GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY } from '../../core/constants/storageKeys';
import { decryptWithDeviceKey, encryptWithDeviceKey } from '../../core/security/crypto';
import type { SyncConfig } from '../types/game';

interface StoredGistConfig {
  gistId: string;
  etag: string | null;
  lastRemoteUpdatedAt: number;
  encToken?: string; // blob device-key (formato nuevo)
  token?: string; // legacy en claro (se migra a encToken al cargar)
}

let _cachedToken: string | null = null;
let _tokenLoaded = false;

function readStored(): StoredGistConfig | null {
  try {
    const raw = localStorage.getItem(GIST_CFG_KEY);
    return raw ? (JSON.parse(raw) as StoredGistConfig) : null;
  } catch {
    return null;
  }
}

function writeStored(stored: StoredGistConfig): void {
  localStorage.setItem(GIST_CFG_KEY, JSON.stringify(stored));
}

export function getSyncConfig(): SyncConfig | null {
  const stored = readStored();
  if (!stored) return null;
  // Token: caché en memoria (formato cifrado) o, si aún no se hidrató y hay legacy en claro, el legacy.
  const token = _cachedToken ?? (stored.token || '');
  return {
    token,
    gistId: stored.gistId,
    etag: stored.etag ?? null,
    lastRemoteUpdatedAt: stored.lastRemoteUpdatedAt ?? 0,
  };
}

/**
 * Hidrata la caché del token desde localStorage (descifra el blob device-key o migra el legacy en claro a cifrado).
 * Idempotente y barato tras la primera llamada. Llamar al inicio del ciclo de sync antes de usar el token.
 */
export async function ensureSyncConfigLoaded(): Promise<void> {
  if (_tokenLoaded) return;
  const stored = readStored();
  if (!stored) {
    _tokenLoaded = true;
    return;
  }
  if (stored.token) {
    // Legacy en claro → cifrar en reposo y reescribir sin el token plano.
    _cachedToken = stored.token;
    try {
      const encToken = await encryptWithDeviceKey(stored.token);
      writeStored({
        gistId: stored.gistId,
        etag: stored.etag ?? null,
        lastRemoteUpdatedAt: stored.lastRemoteUpdatedAt ?? 0,
        encToken,
      });
    } catch {
      // Si el cifrado falla, se conserva el legacy para no perder el token.
    }
  } else if (stored.encToken) {
    try {
      _cachedToken = await decryptWithDeviceKey(stored.encToken);
    } catch {
      _cachedToken = null; // clave de dispositivo ausente/incompatible → recuperar token por otro canal
    }
  }
  _tokenLoaded = true;
}

export function saveSyncConfig(config: SyncConfig): void {
  _cachedToken = config.token || null;
  _tokenLoaded = true;
  const base: StoredGistConfig = {
    gistId: config.gistId,
    etag: config.etag,
    lastRemoteUpdatedAt: config.lastRemoteUpdatedAt,
  };
  // Persiste ya lo no sensible (sin token en claro); cifra el token en segundo plano.
  writeStored(base);
  if (config.token) {
    void encryptWithDeviceKey(config.token)
      .then((encToken) => {
        const current = readStored();
        // Solo escribe el encToken si seguimos en la misma config (evita pisar tras disconnect/reconnect).
        if (current && current.gistId === base.gistId && !current.token) {
          writeStored({ ...current, encToken });
        }
      })
      .catch(() => {});
  }
}

export function clearSyncConfig(): void {
  _cachedToken = null;
  _tokenLoaded = true;
  localStorage.removeItem(GIST_CFG_KEY);
}

export function getSocialSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SOCIAL_GIST_CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSocialSyncConfig(config: SyncConfig): void {
  localStorage.setItem(SOCIAL_GIST_CFG_KEY, JSON.stringify(config));
}

// Hidratación temprana best-effort: arranca la carga del token en cuanto se importa el módulo.
void ensureSyncConfigLoaded();
