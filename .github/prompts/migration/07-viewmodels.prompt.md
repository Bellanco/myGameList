# Prompt 07 — ViewModels migration

## Prerequisites
Prompts 01–06 complete.

## Task
Migrate or create ViewModels so they reflect the new data model.
ViewModels read from IndexedDB only. They never call Gist APIs or Firestore directly.

## Output files
- `src/viewmodels/GamesListViewModel.ts`
- `src/viewmodels/GameDetailViewModel.ts`
- `src/viewmodels/SocialFeedViewModel.ts`
- `src/viewmodels/UserProfileViewModel.ts`
- `src/viewmodels/SyncStatusViewModel.ts`

---

## ViewModel contract

Every ViewModel must follow this pattern:

```ts
class SomeViewModel {
  // Observable state — use Zustand slices or React state depending on scope
  state: SomeState;

  /** Load initial data from IndexedDB */
  async load(): Promise<void>

  /** Subscribe to IndexedDB live queries (Dexie liveQuery) */
  subscribe(): () => void   // returns unsubscribe function

  /** Clean up subscriptions */
  dispose(): void
}
```

---

## `src/viewmodels/GamesListViewModel.ts`

Provides the games list UI with filtering, sorting, and grouping.

State shape:
```ts
interface GamesListState {
  games:      Game[];
  filtered:   Game[];
  loading:    boolean;
  error:      string | null;
  filter: {
    status:   GameStatus | 'all';
    query:    string;
    sortBy:   'name' | 'rating' | 'year' | 'modified';
    sortDir:  'asc' | 'desc';
  };
}
```

Methods:
```ts
setFilter(patch: Partial<GamesListState['filter']>): void
setQuery(query: string): void          // debounced 250ms
setSortBy(key, dir): void
getByStatus(status: GameStatus): Game[]
getStats(): { completed: number; abandoned: number; pending: number; avgScore: number }
```

**Key change from current code**: `review` is available here (full text from IndexedDB).
The ViewModel does NOT compute `snippet` — that is done by the social Gist manager at publish time.

---

## `src/viewmodels/GameDetailViewModel.ts`

Provides the full detail of a single game.

State shape:
```ts
interface GameDetailState {
  game:         Game | null;
  loading:      boolean;
  error:        string | null;
  isSaving:     boolean;
  hasUnsaved:   boolean;
}
```

Methods:
```ts
load(id: string): Promise<void>
save(patch: Partial<Game>): Promise<void>   // calls upsertGame, enqueues SyncOp
delete(): Promise<void>                     // calls deleteGame, enqueues SyncOp
toggleShare(): Promise<void>                // flips shareLevel, saves

/**
 * Returns a preview of the snippet that would be published.
 * snippet = game.review.slice(0, 160).trimEnd()
 * This is read-only — for display only, no state mutation.
 */
getSnippetPreview(): string
```

`save` must:
1. Validate the patch (no `snippet` field allowed in the patch — throw if present).
2. Call `upsertGame(db, { ...currentGame, ...patch })`.
3. The `upsertGame` helper automatically adds a `SyncOp` to the queue.

---

## `src/viewmodels/SocialFeedViewModel.ts`

Provides the social hub feed. Reads from Firestore via the feed repository,
then resolves full game details from the social Gist on demand.

State shape:
```ts
interface SocialFeedState {
  cards:         FirestoreFeedCard[];
  loading:       boolean;
  loadingMore:   boolean;
  error:         string | null;
  hasMore:       boolean;
  cursor:        DocumentSnapshot | null;
}
```

Methods:
```ts
load(): Promise<void>           // loads first page from Firestore
loadMore(): Promise<void>       // appends next page

/**
 * Loads the full review text for a single card.
 * Fetches the user's social Gist (via readSocialGist) and returns the
 * PublicGame.review… wait — NO.
 *
 * IMPORTANT: The full review lives in games-main.json (private Gist).
 * The social Gist only has the snippet.
 * For other users' full reviews, we do NOT have access to their private Gist.
 * Therefore: the full review for OTHER users is simply not available.
 * Only show the snippet (which is already in the feed card).
 *
 * For the CURRENT user's own games: the full review is available from IndexedDB.
 */
getFullReview(card: FirestoreFeedCard, currentProfileId: string): string
```

`getFullReview` logic:
- If `card.profileId === currentProfileId` → look up the game in IndexedDB by `card.gameId` and return `game.review`.
- Otherwise → return `card.snippet` (the only text available for other users' games).
- Add a comment explaining why we never fetch the private Gist of other users.

---

## `src/viewmodels/UserProfileViewModel.ts`

Provides a user's public profile and game list from their social Gist.

State shape:
```ts
interface UserProfileState {
  profile:       SocialProfile | null;
  games:         PublicGame[];
  activityFeed:  ActivityFeedItem[];
  loading:       boolean;
  loadingMore:   boolean;
  error:         string | null;
  isOwnProfile:  boolean;
  hasMoreChunks: boolean;
}
```

Methods:
```ts
load(profileId: string, socialGistId: string): Promise<void>
loadMoreGames(): Promise<void>      // fetches next chunk on demand
loadMoreFeed(): Promise<void>       // fetches next feed page chunk on demand
```

`load` flow:
1. Call `readSocialGist(socialGistId)` — fetches `social-main.json`.
2. Set state with the data from the anchor.
3. If `chunkIndex.chunks.length > 1`, set `hasMoreChunks = true` but do NOT fetch yet.

`loadMoreGames`:
1. Find the next unloaded chunk from `chunkIndex`.
2. Call `readSocialChunk(chunkRef)`.
3. Merge new games into `state.games` sorted by `updatedAt` desc.

---

## `src/viewmodels/SyncStatusViewModel.ts`

Exposes sync state to the UI (last sync time, errors, conflicts).

State shape:
```ts
interface SyncStatusState {
  lastPull:       number | null;
  lastPush:       number | null;
  isSyncing:      boolean;
  errors:         string[];
  conflicts:      SyncConflict[];
  queueLength:    number;
}
```

Methods:
```ts
resolveConflict(gameId: string, winner: 'local' | 'remote'): Promise<void>
clearErrors(): void
forceSync(): Promise<void>     // calls runSyncCycle() regardless of cooldown
```

---

## Migration notes for existing ViewModels

If the codebase has a `GamesViewModel.ts` or similar:
1. Identify all places where `snippet` is computed inside the ViewModel — remove them.
   Snippet computation belongs in `socialGistManager.ts → toPublicGame()`.
2. Identify all places where `review` is used to display in the social feed — replace with
   `getFullReview(card, currentProfileId)` which returns the snippet for other users.
3. Remove any direct Gist API calls from ViewModels.
4. Remove any direct Firestore calls from ViewModels — they go through repositories.

## Constraints
- ViewModels use Dexie `liveQuery` for reactive updates where possible.
- No ViewModel may import from `src/gist/` or `src/firebase/` directly.
  They use the stores (`src/db/`) and repositories (`src/firebase/`) only.
- `GameDetailViewModel.save()` must throw a TypeError if the patch contains a `snippet` field.
