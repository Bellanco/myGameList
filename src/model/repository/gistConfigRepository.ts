// Configuración de sincronización en localStorage (token + gistId + etag) para el gist de juegos y el social.
// Responsabilidad única: persistir/leer/borrar la `SyncConfig` de cada canal. Sin I/O de red ni estado de módulo.
// Extraído de gistRepository.ts (M1).
//
// C4: el token de GitHub se guarda CIFRADO EN REPOSO con la clave de dispositivo no exportable (IndexedDB), nunca
// en claro, en LOS DOS canales. Como el cifrado es async pero `getSyncConfig()`/`getSocialSyncConfig()` se usan de
// forma síncrona en toda la capa, el token descifrado se mantiene en una caché en memoria que se hidrata al
// iniciar (`ensureSyncConfigLoaded`). Los campos no sensibles (gistId/etag/lastRemoteUpdatedAt) siguen en claro y
// disponibles de forma síncrona.
//
// POR QUÉ LOS DOS CANALES Y NO SOLO EL DE JUEGOS: el token social es una COPIA del mismo PAT (la hace
// `socialChannel.resolveSocialChannel` al darse de alta), así que guardarlo en claro aquí ANULABA el cifrado del
// otro canal — el mismo secreto quedaba legible en la clave de al lado, y la promesa de "el token nunca se guarda
// en claro" era falsa para cualquiera que tuviese el hub social conectado.
//
// SIGUEN SIENDO DOS COPIAS INDEPENDIENTES, a propósito: cuando la sync de juegos se desconecta
// (`clearSyncConfig`), el token social es lo único con lo que aún se puede escribir en el canal. Derivar uno del
// otro habría dejado el hub sin escritura en ese caso.
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

/** Copia descifrada del token de un canal y si ya se intentó hidratarla. Estado de módulo, nunca persistido. */
interface ChannelTokenState {
  token: string | null;
  loaded: boolean;
}

// Un estado por canal: los dos guardan el mismo PAT, pero cada uno con su propio ciclo de vida (el social
// sobrevive a desconectar la sync de juegos).
const tokenStates: Record<string, ChannelTokenState> = {
  [GIST_CFG_KEY]: { token: null, loaded: false },
  [SOCIAL_GIST_CFG_KEY]: { token: null, loaded: false },
};

function readStored(key: string): StoredGistConfig | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredGistConfig) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, stored: StoredGistConfig): void {
  localStorage.setItem(key, JSON.stringify(stored));
}

/**
 * Config de un canal, con el token resuelto: el legacy EN CLARO si todavía está ahí, y si no la caché en memoria.
 *
 * Ese orden no es indiferente. Un token en claro en el registro solo puede significar "escrito por una versión
 * anterior y aún sin migrar", porque `writeChannelConfig` nunca lo guarda: mientras exista es el valor vigente, y
 * dejar que una caché de memoria lo tapase serviría un token viejo teniendo el bueno delante. En cuanto
 * `hydrateChannelToken` lo migra, el campo desaparece y manda la caché, que es el caso normal.
 */
function readChannelConfig(key: string): SyncConfig | null {
  const stored = readStored(key);
  if (!stored) return null;
  const token = stored.token || tokenStates[key].token || '';
  return {
    token,
    gistId: stored.gistId,
    etag: stored.etag ?? null,
    lastRemoteUpdatedAt: stored.lastRemoteUpdatedAt ?? 0,
  };
}

/** Descifra el blob device-key de un canal, o migra su token legacy en claro a cifrado. Idempotente. */
async function hydrateChannelToken(key: string): Promise<void> {
  const state = tokenStates[key];
  if (state.loaded) return;
  const stored = readStored(key);
  if (!stored) {
    state.loaded = true;
    return;
  }
  if (stored.token) {
    // Legacy en claro → cifrar en reposo y reescribir sin el token plano.
    state.token = stored.token;
    try {
      const encToken = await encryptWithDeviceKey(stored.token);
      writeStored(key, {
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
      state.token = await decryptWithDeviceKey(stored.encToken);
    } catch {
      state.token = null; // clave de dispositivo ausente/incompatible → recuperar token por otro canal
    }
  }
  state.loaded = true;
}

function writeChannelConfig(key: string, config: SyncConfig): void {
  const state = tokenStates[key];
  state.token = config.token || null;
  state.loaded = true;
  const base: StoredGistConfig = {
    gistId: config.gistId,
    etag: config.etag,
    lastRemoteUpdatedAt: config.lastRemoteUpdatedAt,
  };
  // Persiste ya lo no sensible (sin token en claro); cifra el token en segundo plano.
  writeStored(key, base);
  if (config.token) {
    void encryptWithDeviceKey(config.token)
      .then((encToken) => {
        const current = readStored(key);
        // Solo escribe el encToken si seguimos en la misma config (evita pisar tras disconnect/reconnect).
        if (current && current.gistId === base.gistId && !current.token) {
          writeStored(key, { ...current, encToken });
        }
      })
      .catch(() => {});
  }
}

function clearChannelConfig(key: string): void {
  const state = tokenStates[key];
  state.token = null;
  state.loaded = true;
  localStorage.removeItem(key);
}

export function getSyncConfig(): SyncConfig | null {
  return readChannelConfig(GIST_CFG_KEY);
}

/**
 * Hidrata la caché del token de LOS DOS canales (descifra el blob device-key o migra el legacy en claro a
 * cifrado). Idempotente y barato tras la primera llamada. Llamar al inicio del ciclo de sync antes de usar el
 * token.
 *
 * Cubre ambos canales a propósito: así cada `await ensureSyncConfigLoaded()` que ya existía deja listos los dos
 * tokens, y no hay una segunda función que se pueda olvidar en un camino nuevo del hub social.
 */
export async function ensureSyncConfigLoaded(): Promise<void> {
  await Promise.all([hydrateChannelToken(GIST_CFG_KEY), hydrateChannelToken(SOCIAL_GIST_CFG_KEY)]);
}

export function saveSyncConfig(config: SyncConfig): void {
  writeChannelConfig(GIST_CFG_KEY, config);
}

export function clearSyncConfig(): void {
  clearChannelConfig(GIST_CFG_KEY);
}

export function getSocialSyncConfig(): SyncConfig | null {
  return readChannelConfig(SOCIAL_GIST_CFG_KEY);
}

export function saveSocialSyncConfig(config: SyncConfig): void {
  writeChannelConfig(SOCIAL_GIST_CFG_KEY, config);
}

// Hidratación temprana best-effort: arranca la carga de los dos tokens en cuanto se importa el módulo.
void ensureSyncConfigLoaded();
