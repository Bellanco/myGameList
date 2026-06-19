# Prompt 11 — Bootstrap & Auth flow

## Prerequisites
Prompts 01–10 complete.

## Task
Create the app bootstrap sequence: Firebase Auth, IndexedDB init,
migration check, and sync start. This runs once on app load.

## Output files
- `src/bootstrap/bootstrap.ts`
- `src/bootstrap/authManager.ts`
- `src/store/appStore.ts`

---

## `src/store/appStore.ts`

Zustand store — global app state. All ViewModels subscribe to slices of this.

```ts
interface AppState {
  // Auth
  uid:            string | null;
  profileId:      string | null;
  isAuthenticated:boolean;
  authLoading:    boolean;

  // Migration
  migrationNeeded:  boolean;
  migrationRunning: boolean;
  migrationStep:    string | null;
  migrationError:   string | null;

  // Sync
  syncStatus:     'idle' | 'pulling' | 'pushing' | 'error';
  lastSync:       number | null;
  syncErrors:     string[];
  queueLength:    number;
  conflicts:      SyncConflict[];

  // Token flow
  tokenModalOpen: boolean;
  tokenValid:     boolean | null;

  // Notifications
  toasts: Toast[];
}

interface Toast {
  id:      string;
  type:    'success' | 'error' | 'info' | 'warning';
  message: string;
  ttl:     number;
}

// Actions — define as a separate interface, implement in the store
interface AppActions {
  setAuth(uid: string, profileId: string): void;
  clearAuth(): void;
  setMigrationStep(step: string): void;
  setMigrationError(error: string): void;
  completeMigration(): void;
  setSyncStatus(status: AppState['syncStatus']): void;
  addSyncError(error: string): void;
  clearSyncErrors(): void;
  setQueueLength(n: number): void;
  addConflict(conflict: SyncConflict): void;
  resolveConflict(gameId: string): void;
  openTokenModal(): void;
  closeTokenModal(): void;
  setTokenValid(valid: boolean): void;
  addToast(toast: Omit<Toast, 'id'>): void;
  removeToast(id: string): void;

  // Events for migration runner
  emit(event: 'migration:tokenRequired'
            | 'migration:complete'
            | string,
       payload?: unknown): void;
}
```

Use `create<AppState & AppActions>()` with the `immer` middleware for ergonomic updates.
Auto-remove toasts after their `ttl` using `setTimeout` inside `addToast`.

---

## `src/bootstrap/authManager.ts`

```ts
/**
 * Sets up Firebase Auth listener.
 * On sign-in: loads or creates the local meta, checks migration,
 * then starts the sync cycle.
 * On sign-out: stops sync, clears app state.
 */
export function initAuth(): () => void  // returns unsubscribe

/**
 * Sign in with GitHub OAuth via Firebase.
 * After sign-in, stores the GitHub access token in IndexedDB ONLY —
 * never in Firestore.
 */
export async function signInWithGitHub(): Promise<void>

/**
 * Sign out. Clears IndexedDB auth fields but preserves game data.
 */
export async function signOut(): Promise<void>

/**
 * Called after GitHub OAuth completes.
 * Extracts the GitHub token from the OAuth credential and stores
 * it in IndexedDB meta.
 */
async function persistGitHubToken(credential: OAuthCredential): Promise<void>
```

`initAuth` flow on sign-in:
1. Get Firebase user.
2. Load `LocalMeta` from IndexedDB.
3. If meta exists and `meta.uid === user.uid` → resume session.
4. If meta is empty → call `loadOrCreateMeta(user)`.
5. Update `appStore.setAuth(uid, profileId)`.
6. Check `isMigrationNeeded()` → if true, set `migrationNeeded = true`.
7. If no migration needed → call `startSyncCycle()`.

`loadOrCreateMeta` flow:
1. Try `privateConfigRepository.get(user.uid)` to recover config after reinstall.
2. If found → restore `gamesGistId`, `socialGistId`, `gamesChunks`, `socialChunks` from Firestore.
3. If not found → this is a fresh install, set `migrationNeeded = true`.
4. Generate `deviceId = crypto.randomUUID()` if not present.

---

## `src/bootstrap/bootstrap.ts`

```ts
/**
 * Main entry point. Call once from main.tsx before rendering the React tree.
 * Returns a cleanup function for HMR.
 */
export async function bootstrap(): Promise<() => void>
```

Bootstrap sequence:
1. Initialize Dexie database (`AppDatabase`).
2. Call `evictStale(db)` to clean old chunk cache entries.
3. Call `initAuth()` — sets up the Firebase Auth listener.
4. Set up global error handler for unhandled promise rejections
   → route to `appStore.addToast({ type: 'error', ... })`.
5. Set up `visibilitychange` listener → calls `runSyncCycle()` on visible.
6. Return cleanup function that calls `stopSyncCycle()` and unsubscribes auth.

---

## `main.tsx` integration

```tsx
// src/main.tsx
import { bootstrap } from './bootstrap/bootstrap';
import { App } from './App';

let cleanup: (() => void) | undefined;

bootstrap().then(fn => {
  cleanup = fn;
  // Render only after bootstrap completes
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
});

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => cleanup?.());
}
```

## Constraints
- `signInWithGitHub` must extract the GitHub OAuth token from the credential
  using `GithubAuthProvider.credentialFromResult(result)?.accessToken`.
- The token must be stored in IndexedDB immediately and never passed to any
  function that writes to Firestore.
- `bootstrap` must be idempotent — safe to call on HMR reloads.
