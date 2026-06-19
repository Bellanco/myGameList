# Prompt 03 — Games Gist manager

## Prerequisites
Prompts 01 and 02 complete. Import from `src/models/` and `src/db/`.

## Task
Create the module that reads and writes the private games Gist.
This Gist is the sync backbone between devices.
The social Gist (Prompt 04) is separate — this module never touches it.

## Output file
`src/gist/gamesGistManager.ts`

---

## Constants

```ts
const GAMES_MAX_CHUNK_KB = 800;
const CHUNK_THRESHOLD    = 0.85;   // start new chunk at 85% of max
const GIST_API           = 'https://api.github.com/gists';
const MAIN_FILENAME      = 'games-main.json';
```

---

## Core types (local to this file)

```ts
interface PullResult {
  fromCache: boolean;
  changed:   boolean;
  newEtag:   string | null;
}

interface PushResult {
  chunksWritten: number;
  newChunksCreated: number;
}
```

---

## Functions to implement

### `pullGames(meta: LocalMeta): Promise<PullResult>`

1. GET `GIST_API/{meta.gamesGistId}` with `Authorization` and `If-None-Match: meta.gamesEtag`.
2. If 304 → return `{ fromCache: true, changed: false, newEtag: null }`.
3. Parse the anchor file `games-main.json` from the response.
4. If `chunkIndex.chunks.length > 1`, fetch all overflow chunks in parallel.
   Each overflow chunk: GET `GIST_API/{chunkRef.gistId}`, respect its ETag from `chunkCacheStore`.
5. Collect all `games` records across all chunks.
6. Call `mergeRemoteGames(db, allRemoteGames)`.
7. Call `mergeRemoteDeleted(db, anchor.deletedIndex)`.
8. Update `meta.gamesEtag` and `meta.lastGistPull` via `patchMeta`.
9. Return `{ fromCache: false, changed: true, newEtag }`.

### `pushGames(meta: LocalMeta): Promise<PushResult>`

1. Load all games from IndexedDB via `getAllGames(db)`.
2. Call `distributeIntoChunks(games, GAMES_MAX_CHUNK_KB * CHUNK_THRESHOLD)`.
   This returns `{ main: Game[], c1?: Game[], c2?: Game[], … }`.
3. For each chunk group:
   a. Determine target gistId from `meta.gamesChunks`.
   b. If the chunk group is new (no matching `chunkRef`), call `createOverflowGist('games', index)` to create a new private Gist and register it in `meta.gamesChunks` and in Firestore `privateConfig`.
   c. Build the file content (`buildGamesMainFile` or `buildGamesChunkFile`).
   d. PATCH `GIST_API/{targetGistId}` with the file content.
4. After all patches succeed, update `meta.gamesChunks` and `meta.lastGistPull` via `patchMeta`.
5. Return `{ chunksWritten, newChunksCreated }`.

### `distributeIntoChunks(games: Game[], thresholdBytes: number): Record<string, Game[]>`

- Iterate games sorted by `_modified` ascending (oldest first in main, newest in latest chunk).
- Accumulate byte size using `new Blob([JSON.stringify(game)]).size`.
- When accumulated size exceeds `thresholdBytes`, start a new bucket (`c1`, `c2`, …).
- Return `{ main: [...], c1?: [...], … }`.

### `createOverflowGist(type: 'games' | 'social', index: number): Promise<string>`

- POST to `GIST_API` with:
  - `public: false` (games are always private)
  - `description: 'Mi Lista — games chunk ${index}'`
  - Empty initial content for `games-chunk-${index}.json`
- Return the new Gist ID.
- Register in Firestore `privateConfig` via the repository (import from `src/firebase/privateConfigRepository.ts`).

### `buildGamesMainFile(meta: LocalMeta, games: Game[], catalog: Catalog): GamesMainFile`

Builds the full anchor JSON. The `games` parameter contains only the main chunk's games.
The `chunkIndex` reflects the current `meta.gamesChunks`.
Compute `integrity.checksum` as CRC32 of the serialized `games` object.
Set `syncMeta.lamport = meta.lamport + 1`.

### `buildGamesChunkFile(meta: LocalMeta, chunkId: string, games: Game[]): GamesChunkFile`

Builds an overflow chunk file. Does NOT include `catalog`, `privacy`, or `chunkIndex`.

---

## Error handling rules

- All network errors must be caught and wrapped in a custom `GistError` class with `status`, `message`, and `retryable` fields.
- 409 Conflict on PATCH → mark as retryable, return without updating meta.
- 404 on the anchor → throw non-retryable (gist deleted, user must re-authenticate).
- Never swallow errors silently.

## Constraints
- This module must not import anything from `src/gist/socialGistManager.ts`.
- No direct Firestore calls except via the `privateConfigRepository`.
- All PATCH operations must include the ETag check (`If-Match` header) to prevent concurrent overwrites.
- The `githubToken` must come from `meta.githubToken` — never hardcoded or from env.
