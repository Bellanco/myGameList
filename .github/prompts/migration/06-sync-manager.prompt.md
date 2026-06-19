# Prompt 06 — SyncManager

## Prerequisites
Prompts 01–05 complete.

## Task
Create the central sync orchestrator. This is the only module allowed to
coordinate between IndexedDB, the games Gist, the social Gist, and Firestore.
ViewModels never call sync directly — they go through the sync queue.

## Output file
`src/sync/syncManager.ts`

---

## Constants

```ts
const GIST_COOLDOWN_MS   = 60_000;    // min 60s between Gist pulls
const BATCH_DELAY_MS     = 5_000;     // accumulate changes for 5s before push
const MAX_QUEUE_AGE_MS   = 300_000;   // force flush if queue is 5min old
const MAX_RETRY_ATTEMPTS = 3;
```

---

## Main entry point

```ts
/**
 * Run a full sync cycle. Safe to call on every visibilitychange event.
 * Returns early if a cycle is already running (uses a lock).
 */
export async function runSyncCycle(): Promise<SyncCycleResult>

interface SyncCycleResult {
  gistPulled:       boolean;
  gistPushed:       boolean;
  socialPublished:  boolean;
  firestoreUpdated: boolean;
  errors:           Error[];
}
```

---

## Cycle steps (implement in this order)

### Step 1 — Pull games Gist

```ts
async function maybeePullGames(meta: LocalMeta): Promise<boolean>
```

- Skip if `Date.now() - meta.lastGistPull < GIST_COOLDOWN_MS`.
- Call `pullGames(meta)` from the games Gist manager.
- On 304 (fromCache): update `lastGistPull` timestamp only.
- Return true if data changed, false otherwise.

### Step 2 — Process sync queue

```ts
async function shouldFlushQueue(meta: LocalMeta, queue: SyncOp[]): Promise<boolean>
```

Returns true if:
- Queue is non-empty AND
- (oldest op age > `MAX_QUEUE_AGE_MS` OR last op age > `BATCH_DELAY_MS`)

### Step 3 — Push games Gist

```ts
async function pushGamesIfNeeded(meta: LocalMeta): Promise<boolean>
```

- Call `pushGames(meta)`.
- On success: clear the syncQueue entries with types `upsertGame` and `deleteGame`.
- Return whether any push happened.

### Step 4 — Publish social Gist

```ts
async function publishSocialIfNeeded(meta: LocalMeta): Promise<boolean>
```

- Get public games modified since `meta.lastFirestorePush`.
- If none → skip.
- Call `publishSocial(meta)` from the social Gist manager.
- Return whether publish happened.

### Step 5 — Update Firestore index

```ts
async function updateFirestoreIfNeeded(meta: LocalMeta, changedGames: Game[]): Promise<boolean>
```

- Filter `changedGames` to `shareLevel === 'public'`.
- For each: if `game.review.length > 0`, upsert a feed card via `feedRepository.batchUpsert`.
  - Build `FirestoreFeedCard` from the public game — snippet only, no review.
  - If `game.review` was cleared (now empty), call `feedRepository.hideCard`.
- Update user stats via `userRepository.updateStats`.
- Update `meta.lastFirestorePush` via `patchMeta`.
- Return true if any write happened.

---

## Conflict resolution (for pull step)

When `mergeRemoteGames` finds a game where `remote._v === local._v` but content differs
(true concurrent edit), add a `SyncConflict` entry to a separate IndexedDB store (define it
in `AppDatabase`) and emit a Zustand event so the UI can show a resolution dialog.

```ts
interface SyncConflict {
  id: string;
  gameId: string;
  detectedAt: number;
  local: Partial<Game>;
  remote: Partial<Game>;
  resolved: boolean;
}
```

---

## Lifecycle hooks

```ts
/** Call on app start and on visibilitychange (visible) */
export function startSyncCycle(): void

/** Call on app unmount */
export function stopSyncCycle(): void
```

`startSyncCycle` sets up:
- An interval that calls `runSyncCycle` every 30s.
- A `visibilitychange` listener that calls `runSyncCycle` immediately when the tab becomes visible.
- A `beforeunload` listener that attempts a best-effort push if the queue is non-empty.

---

## Error handling

- Each step is wrapped in its own try/catch.
- Errors from step N do not prevent step N+1 from running.
- All errors are collected in `SyncCycleResult.errors`.
- A `GistError` with `retryable: false` triggers a toast notification via the Zustand store.
- Network errors are always retryable.

## Constraints
- Use a `WeakRef`-based lock or a simple boolean flag to prevent concurrent cycles.
- Never call `publishSocial` if `pushGames` failed — data would be inconsistent.
- The sync manager must not import from any ViewModel.
