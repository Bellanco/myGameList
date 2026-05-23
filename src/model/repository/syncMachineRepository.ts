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
}

const MIN_READ_INTERVAL_MS = 45_000;

let _state: SyncState = {
  status: 'idle',
  lastReadAt: 0,
  lastWriteAt: 0,
  lastErrorAt: null,
  errorCount: 0,
  pendingAction: null,
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

export function getNextReadDelayMs(): number {
  const diff = MIN_READ_INTERVAL_MS - (Date.now() - _state.lastReadAt);
  return diff > 0 ? diff : 0;
}

export function canWrite(): boolean {
  const { status } = _state;
  return status === 'idle' || status === 'dirty';
}

export function transitionTo(status: SyncStatus, extra?: Partial<SyncState>): void {
  setState({ status, ...(extra || {}) });
}

export function resetSyncState(): void {
  _state = {
    status: 'idle',
    lastReadAt: 0,
    lastWriteAt: 0,
    lastErrorAt: null,
    errorCount: 0,
    pendingAction: null,
  };
  _listeners.clear();
}

export function getBackoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 60_000);
  return base + Math.random() * base * 0.3;
}
