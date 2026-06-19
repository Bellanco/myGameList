# Prompt 02 — IndexedDB schema (Dexie)

## Prerequisites
Prompt 01 must be complete. Import types from `src/models/`.

## Task
Create the IndexedDB database definition and all access helpers using Dexie.js.
This is the local source of truth for the entire app.

## Output files
- `src/db/AppDatabase.ts`
- `src/db/gamesStore.ts`
- `src/db/metaStore.ts`
- `src/db/syncQueueStore.ts`
- `src/db/chunkCacheStore.ts`

---

## `src/db/AppDatabase.ts`

Define a Dexie subclass with the following stores:

```
games
  Primary key: id (UUID string)
  Indexes: status, shareLevel, _modified, socialSynced, [status+shareLevel]

meta
  Primary key: _key (always 'singleton')

syncQueue
  Primary key: id (UUID string)
  Indexes: type, createdAt, nextRetry

chunkCache
  Primary key: gistId (string)
  Indexes: cachedAt

profileCache
  Primary key: profileId (string)
  Indexes: cachedAt
```

Schema version starts at 1. Add a migration stub from v0 (localStorage) to v1 (IndexedDB):
- Read the old `mi-lista-v2` key from localStorage if it exists.
- Parse it and insert all games into the `games` store.
- Delete the localStorage key after successful migration.
- If localStorage is empty or parsing fails, proceed silently.

---

## `src/db/gamesStore.ts`

Export the following functions. Each takes the Dexie `db` instance as first arg.

```ts
/** Returns all games, sorted by _modified descending */
getAllGames(db): Promise<Game[]>

/** Returns only games with shareLevel 'public', sorted by _modified desc */
getPublicGames(db): Promise<Game[]>

/** Returns games modified after a given timestamp */
getGamesSince(db, since: number): Promise<Game[]>

/**
 * Upsert a game. Increments _v and sets _modified to Date.now().
 * Adds a 'upsertGame' entry to syncQueue automatically.
 */
upsertGame(db, game: Omit<Game, '_v' | '_modified' | '_hash'>): Promise<Game>

/**
 * Soft-delete: removes from games store, adds to a deletedIndex entry in meta,
 * adds a 'deleteGame' syncQueue entry.
 */
deleteGame(db, id: string): Promise<void>

/** Merge games from a remote chunk. Uses _modified to resolve conflicts. */
mergeRemoteGames(db, remote: Record<string, Game>): Promise<{ updated: number; skipped: number }>

/** Merge deletedIndex from remote. Removes local games if remote deletedAt > game._modified */
mergeRemoteDeleted(db, deletedIndex: Record<string, { deletedAt: number }>): Promise<number>
```

---

## `src/db/metaStore.ts`

```ts
getMeta(db): Promise<LocalMeta | undefined>
setMeta(db, meta: LocalMeta): Promise<void>
patchMeta(db, patch: Partial<LocalMeta>): Promise<void>
```

`patchMeta` must read the current meta, merge the patch, and write back atomically.

---

## `src/db/syncQueueStore.ts`

```ts
enqueue(db, op: Omit<SyncOp, 'id' | 'createdAt' | 'attempts' | 'nextRetry'>): Promise<void>
getAll(db): Promise<SyncOp[]>
getPending(db): Promise<SyncOp[]>  // attempts < 3 and nextRetry <= Date.now()
markFailed(db, id: string): Promise<void>   // increments attempts, sets nextRetry
clearProcessed(db, ids: string[]): Promise<void>
```

---

## `src/db/chunkCacheStore.ts`

```ts
interface CachedChunk {
  gistId: string;
  data: SocialMainFile | SocialChunkFile | GamesMainFile | GamesChunkFile;
  etag: string | null;
  cachedAt: number;
}

getCachedChunk(db, gistId: string): Promise<CachedChunk | undefined>
setCachedChunk(db, gistId: string, data: unknown, etag: string | null): Promise<void>

/** Evict entries older than maxAgeMs (default 24h) */
evictStale(db, maxAgeMs?: number): Promise<number>
```

## Constraints
- Every store access must be inside a Dexie transaction where multiple writes happen.
- `mergeRemoteGames` must be atomic — wrap in a single transaction.
- Export the database instance as a singleton: `export const db = new AppDatabase()`.
- Add JSDoc on every exported function.
