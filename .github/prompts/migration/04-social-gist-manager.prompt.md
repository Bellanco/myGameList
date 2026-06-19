# Prompt 04 — Social Gist manager

## Prerequisites
Prompts 01–03 complete. Import from `src/models/`, `src/db/`, and `src/gist/gamesGistManager.ts`
(only for `distributeIntoChunks` and `createOverflowGist`).

## Task
Create the module that builds and writes the public social Gist.
This Gist is readable by anyone without authentication.
It contains NO private fields — no `review`, no `score`, no `hours`.

## Output file
`src/gist/socialGistManager.ts`

---

## Constants

```ts
const SOCIAL_MAX_CHUNK_KB = 700;
const CHUNK_THRESHOLD     = 0.85;
const GIST_API            = 'https://api.github.com/gists';
const MAIN_FILENAME       = 'social-main.json';
const SNIPPET_MAX_CHARS   = 160;
const FEED_PAGE_SIZE      = 10;
```

---

## The snippet rule — enforce in every function

The snippet is always derived as:
```ts
const snippet = game.review.slice(0, SNIPPET_MAX_CHARS).trimEnd();
```

If `game.review` is empty, `snippet` is `''` and `hasFullReview` is `false`.

**The `review` field must never appear in any object written to this Gist.**
Add a runtime assertion before every PATCH:
```ts
function assertNoReview(obj: unknown, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return;
  if ('review' in obj) throw new Error(`review field found at ${path} — social Gist must not contain full review text`);
  for (const [k, v] of Object.entries(obj)) assertNoReview(v, `${path}.${k}`);
}
```
Call `assertNoReview(fileContent)` before every PATCH call.

---

## Functions to implement

### `publishSocial(meta: LocalMeta): Promise<{ chunksWritten: number; newChunksCreated: number }>`

1. Load public games from IndexedDB: `getPublicGames(db)` → filter `shareLevel === 'public'`.
2. Project each game to `PublicGame` via `toPublicGame(game)` (from `src/models/Game.ts`).
3. Sort by `updatedAt` descending.
4. Distribute `PublicGame[]` into chunks using `distributeIntoChunks` with `SOCIAL_MAX_CHUNK_KB * CHUNK_THRESHOLD`.
5. Build the activity feed from the same public games:
   - Only games where `game.review.length > 0` get a feed item.
   - Feed items are sorted by `_modified` descending.
   - Page 1 (20 items) goes into `social-main.json`.
   - Remaining pages go into respective overflow chunks.
6. For each chunk:
   a. Check if a Gist exists for it in `meta.socialChunks`.
   b. If not, call `createSocialOverflowGist(index)` (public: true).
   c. Build the file content.
   d. Call `assertNoReview` on the content.
   e. PATCH the Gist.
7. Update `meta.socialChunks` via `patchMeta`.

### `createSocialOverflowGist(index: number): Promise<string>`

Like `createOverflowGist` from the games manager but:
- `public: true`
- `description: 'Mi Lista — social chunk ${index}'`

### `buildSocialMainFile(meta: LocalMeta, games: Record<string, PublicGame>, feed: ActivityFeed, chunkIndex: ChunkIndex): SocialMainFile`

Build the anchor. Verify:
- No `review` field anywhere in `games` values.
- Every `snippet` in feed items is ≤ `SNIPPET_MAX_CHARS`.
- The `profile` comes from `meta.profile` (read from the `profileCache` store or computed).

### `buildSocialChunkFile(meta: LocalMeta, chunkId: string, games: Record<string, PublicGame>, feed: ActivityFeed): SocialChunkFile`

Build an overflow chunk. Same constraints as main — no review, snippets trimmed.

### `readSocialGist(socialGistId: string, cachedEtag?: string | null): Promise<{ data: SocialMainFile; etag: string | null; fromCache: boolean }>`

Used by the hub to read another user's social Gist.
- No `Authorization` header (public Gist, anonymous read).
- If the user is authenticated and it's their own Gist, optionally add the token to get higher rate limits.
- If 304 → return from `chunkCacheStore`.
- On success → store in `chunkCacheStore`.

### `readSocialChunk(chunkRef: ChunkRef): Promise<SocialChunkFile>`

- Fetch `GIST_API/{chunkRef.gistId}` without auth.
- Use ETag cache from `chunkCacheStore`.
- Return the parsed chunk file.

---

## Stats computation

```ts
function computeStats(games: Game[]): SocialProfile['stats'] {
  const pub = games.filter(g => g.shareLevel === 'public');
  return {
    totalCompleted: pub.filter(g => g.status === 'completed').length,
    totalAbandoned: pub.filter(g => g.status === 'abandoned').length,
    totalReviews:   pub.filter(g => g.review.length > 0).length,
    avgRating:      computeAvgRating(pub),
  };
}

function computeAvgRating(games: Game[]): number {
  const rated = games.filter(g => g.score !== null && g.status === 'completed');
  if (!rated.length) return 0;
  return Math.round((rated.reduce((s, g) => s + g.score!, 0) / rated.length) * 10) / 10;
}
```

---

## Constraints
- Never import from Firestore modules. Social Gist writes are Gist-only.
- `assertNoReview` must run before every PATCH — this is non-negotiable.
- Overflow Gists are created with `public: true`.
- The `githubToken` is required for writes but not for reads.
- Chunk distribution for the social Gist follows the same algorithm as games
  but with a separate threshold (`SOCIAL_MAX_CHUNK_KB`).
