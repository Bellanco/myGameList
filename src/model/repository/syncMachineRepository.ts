export type SyncStatus =
  | 'idle'
  | 'checking'
  | 'merging'
  | 'writing'
  | 'dirty'
  | 'error_backoff';

export interface SyncState {
  status: SyncStatus;
  lastReadAt: number;
  lastWriteAt: number;
  lastErrorAt: number | null;
  errorCount: number;
  pendingAction: 'read' | 'write' | null;
  // S3: ms mínimos a esperar antes del próximo reintento, impuestos por el servidor (rate-limit 403/429).
  // El backoff usa `max(backoffExponencial, retryAfterMs)`. null = sin restricción del servidor.
  retryAfterMs?: number | null;
}

const MIN_READ_INTERVAL_MS = 45_000;

let _state: SyncState = {
  status: 'idle',
  lastReadAt: 0,
  lastWriteAt: 0,
  lastErrorAt: null,
  errorCount: 0,
  pendingAction: null,
  retryAfterMs: null,
};

const _listeners = new Set<(state: SyncState) => void>();

export function getSyncState(): Readonly<SyncState> {
  return _state;
}

export function subscribeSyncState(fn: (state: SyncState) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function setState(patch: Partial<SyncState>): void {
  _state = { ..._state, ...patch };
  _listeners.forEach((fn) => fn(_state));
}

export function canRead(): boolean {
  const { status, lastReadAt } = _state;
  if (status === 'error_backoff' || status === 'checking' || status === 'merging' || status === 'writing') return false;
  return Date.now() - lastReadAt > MIN_READ_INTERVAL_MS;
}

/**
 * Like `canRead` but allows forcing a read regardless of the lastReadAt throttle.
 * When `force` is true the only restriction is the current state (no reads while writing/merging/checking/error_backoff).
 */
export function canReadNow(force: boolean = false): boolean {
  const { status, lastReadAt } = _state;
  if (status === 'error_backoff' || status === 'checking' || status === 'merging' || status === 'writing') return false;
  if (force) return true;
  return Date.now() - lastReadAt > MIN_READ_INTERVAL_MS;
}

export function getNextReadDelayMs(): number {
  const diff = MIN_READ_INTERVAL_MS - (Date.now() - _state.lastReadAt);
  return diff > 0 ? diff : 0;
}

export function canWrite(): boolean {
  const { status } = _state;
  return status === 'idle' || status === 'dirty';
}

export function transitionTo(status: SyncStatus, extra?: Partial<SyncState>): void {
  const patch: Partial<SyncState> = { status, ...(extra || {}) };
  // S3: la restricción de rate-limit solo aplica mientras seguimos en backoff; al salir de él se limpia
  // (salvo que el llamador la fije explícitamente).
  if (status !== 'error_backoff' && !(extra && 'retryAfterMs' in extra)) {
    patch.retryAfterMs = null;
  }
  setState(patch);
}

export function resetSyncState(): void {
  _state = {
    status: 'idle',
    lastReadAt: 0,
    lastWriteAt: 0,
    lastErrorAt: null,
    errorCount: 0,
    pendingAction: null,
    retryAfterMs: null,
  };
  _locked = false;
  _listeners.clear();
}

// S2: mutex in-flight que SERIALIZA los ciclos de sync de alto nivel. La "máquina" de estado por sí sola no
// era un lock real (`transitionTo` solo escribe un campo), así que focus/visibility/poll/BroadcastChannel/backoff
// podían arrancar ciclos solapados cuyos `await` se entrelazaban y se pisaban etag/errorCount/datos.
let _locked = false;

export function isSyncInFlight(): boolean {
  return _locked;
}

export interface SyncLock {
  release: () => void;
}

/**
 * Intenta tomar el lock de sync. Devuelve un `SyncLock` (llamar `release()` en `finally`) o `null` si YA hay un
 * ciclo en vuelo → el llamador debe SALTARSE su ciclo (coalescing). Saltarse es seguro: el flag `dirty` se persiste
 * en disco, así que el ciclo en curso o el siguiente empujarán los cambios; no se pierde nada.
 *
 * El check-and-set es atómico (no hay `await` entre comprobar `_locked` y tomarlo, y JS es monohilo). `release()` es
 * idempotente. NO tomar el lock en operaciones ANIDADAS (p. ej. `writeWithConflictRecovery` dentro de un ciclo de
 * lectura que ya lo tiene): se bloquearían a sí mismas. Se aplica solo en los puntos de entrada de alto nivel.
 */
export function acquireSyncLock(): SyncLock | null {
  if (_locked) return null;
  _locked = true;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      _locked = false;
    },
  };
}

export function getBackoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 60_000);
  return base + Math.random() * base * 0.3;
}
