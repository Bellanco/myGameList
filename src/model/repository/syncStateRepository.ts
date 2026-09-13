import { STORAGE_KEY } from '../../core/constants/storageKeys';

const SYNC_STATE_KEY = `${STORAGE_KEY}.syncState`;

export interface SyncDirtyState {
  isDirty: boolean;
  dirtyAt: number;
}

export function loadSyncDirtyState(): SyncDirtyState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return { isDirty: false, dirtyAt: 0 };
    const parsed = JSON.parse(raw) as Partial<SyncDirtyState> | null;
    if (!parsed) return { isDirty: false, dirtyAt: 0 };
    return {
      isDirty: Boolean(parsed.isDirty),
      dirtyAt: Number(parsed.dirtyAt || 0),
    };
  } catch {
    return { isDirty: false, dirtyAt: 0 };
  }
}

/**
 * Quién quiere enterarse de que la marca ha cambiado.
 *
 * Existe porque hay dos cosas que dependen de ella y no pueden ir preguntando: el empujón automático de lo
 * pendiente y el aviso de «cambios sin subir» del badge. Deducirlo de las transiciones de la máquina de sync no
 * vale —la escritura pasa a `idle` ANTES de limpiar la marca, así que el último aviso llegaría al revés—, y
 * consultarlo en cada render significa leer y parsear `localStorage` en cada tecla.
 *
 * Se notifica desde `saveSyncDirtyState`, que es el único sitio por el que la marca se escribe.
 */
const dirtyListeners = new Set<(state: SyncDirtyState) => void>();

export function subscribeSyncDirtyState(listener: (state: SyncDirtyState) => void): () => void {
  dirtyListeners.add(listener);
  return () => {
    dirtyListeners.delete(listener);
  };
}

export function saveSyncDirtyState(state: SyncDirtyState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  // Fuera del try: que no se pueda escribir en disco no es motivo para que la pantalla se quede sin enterarse
  // (el estado en memoria sigue siendo el bueno para esta sesión).
  dirtyListeners.forEach((listener) => listener(state));
}

export function markDirty(): void {
  // Actualiza SIEMPRE `dirtyAt`, incluso si ya estaba dirty: así una edición hecha mientras un ciclo de
  // sync está escribiendo avanza el sello, y `clearDirtyIfUnchanged` detecta que hay algo nuevo sin subir.
  saveSyncDirtyState({ isDirty: true, dirtyAt: Date.now() });
}

export function clearDirty(): void {
  saveSyncDirtyState({ isDirty: false, dirtyAt: 0 });
}

/**
 * Limpia dirty SOLO si no llegó una edición más reciente que la capturada al arrancar la escritura.
 * Si `dirtyAt` avanzó durante el ciclo, es que el usuario guardó algo que aún NO está en el remoto:
 * se conserva dirty para que el siguiente ciclo lo empuje (evita perder ediciones concurrentes con el sync).
 */
export function clearDirtyIfUnchanged(dirtyAt: number): void {
  const current = loadSyncDirtyState();
  if (current.dirtyAt !== dirtyAt) return;
  clearDirty();
}
