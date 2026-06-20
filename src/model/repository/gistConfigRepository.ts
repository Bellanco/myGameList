// Configuración de sincronización en localStorage (token + gistId + etag) para el gist de juegos y el social.
// Responsabilidad única: persistir/leer/borrar la `SyncConfig` de cada canal. Sin I/O de red ni estado de módulo.
// Extraído de gistRepository.ts (M1) sin cambio de comportamiento.
import { GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY } from '../../core/constants/storageKeys';
import type { SyncConfig } from '../types/game';

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(GIST_CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(GIST_CFG_KEY, JSON.stringify(config));
}

export function clearSyncConfig(): void {
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
