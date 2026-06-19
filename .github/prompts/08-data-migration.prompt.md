# Prompt 08 — Data migration script

## Prerequisites
Prompts 01–07 complete.

## Task
Create a one-time migration script that transforms existing data
(old Gist format + current Firestore document) to the new architecture.
This runs once on first app launch after the update.

## Output file
`src/migration/runMigration.ts`

---

## Migration steps in order

### Step 0 — Check if migration is needed

```ts
async function isMigrationNeeded(): Promise<boolean>
```

- Check IndexedDB for a `migrationVersion` key in the `meta` store.
- If `migrationVersion >= 3` → already migrated, return false.
- If old `mi-lista-v2` localStorage key exists → migration needed.
- If `mi-lista-v2` doesn't exist but the games store is empty → first install, no migration.

### Step 1 — Rotate the GitHub token

```ts
async function rotateToken(oldMeta: OldLocalStorage): Promise<string>
```

The current token stored in Firestore is compromised. This step:
1. Reads the token from the old localStorage or Firestore document.
2. Prompts the user to input a new GitHub Personal Access Token with `gist` scope.
   (Show a UI dialog — emit an event to the Zustand store that triggers a modal.)
3. Validates the new token by making a GET to `https://api.github.com/user`.
4. Stores the new token in IndexedDB meta only.
5. Returns the new token.

**This step must block the rest of the migration until the token is provided.**

### Step 2 — Migrate Firestore document

```ts
async function migrateFirestoreDocument(uid: string, newToken: string): Promise<{
  profileId: string;
  socialGistId: string;
  gamesGistId: string;
}>
```

Read the current Firestore document at `/users/{uid}` (old structure).
Extract the fields we need:
- `gamesGistId` → move to `/privateConfig/{uid}`
- `gistId` (profile Gist) → becomes `socialGistId` in `/privateConfig/{uid}`
- `displayName` → keep in `/users/{profileId}` (new structure)

Then:
1. Generate a new `profileId` = `crypto.randomUUID()`.
2. Create `/privateConfig/{uid}` with `{ profileId, gamesGistId, socialGistId, gamesChunks: [], socialChunks: [] }`.
3. Create `/users/{profileId}` with the cleaned public structure (no private fields).
4. Delete the fields from the old document: `githubToken`, `email`, `uid`, `gamesGistId`, `gistId`, `etag`, `photoURL`.
   Use `FieldValue.delete()` for each.

### Step 3 — Migrate games Gist

```ts
async function migrateGamesGist(gamesGistId: string, token: string): Promise<number>
```

1. Fetch `games-main.json` from the existing games Gist.
2. Parse the old format (arrays `c`, `v`, `e`, `p` or the intermediate format from earlier refactors).
3. For each game:
   a. Generate a UUID v4 id if the current id is a number.
   b. Map `status`:
      - array `c` → `'completed'`
      - array `v` → `'abandoned'`
      - array `e` → `'excluded'`
      - array `p` → `'pending'`
   c. Set `shareLevel: 'private'` as default (user will opt-in to public).
   d. Set `_created = _ts`, `_modified = _ts`, `_v = 1`.
   e. Set `socialSynced = null`.
   f. Ensure `snippet` is NOT present (remove it if found — it belongs in social layer).
   g. Ensure `review` is present (copy from `reviewText` if that was the old field name).
   h. Compute `_hash` = CRC32 of the content fields.
4. Insert all games into IndexedDB via `upsertGame`.
5. PATCH the games Gist with the new `games-main.json` format.
6. Return the count of migrated games.

Old format detection — handle these variants:
```ts
function detectOldFormat(raw: unknown): 'arrays' | 'normalized-v1' | 'normalized-v2' | 'unknown'
```
- `arrays`: has keys `c`, `v`, `e`, `p` at the root with arrays of games.
- `normalized-v1`: has a `games` object with integer IDs and a `_list` field.
- `normalized-v2`: has a `games` object with UUID IDs and a `status` field.
- `unknown`: throw a migration error asking the user to contact support.

### Step 4 — Create social Gist from scratch

```ts
async function createSocialGist(profileId: string, token: string, games: Game[]): Promise<string>
```

1. Create a new **public** Gist via POST to `GIST_API` with an empty `social-main.json`.
2. Get the new Gist ID.
3. Call `publishSocial(meta)` to populate it with the current public games.
   (No games will be public yet — the Gist will have an empty games section. That's correct.)
4. Store the new `socialGistId` in IndexedDB and `privateConfig`.
5. Return the new Gist ID.

**Do not create the social Gist from the old profile Gist.**
The old profile Gist may contain stale data or the wrong format.
Start fresh and let the user opt-in to sharing each game.

### Step 5 — Mark migration complete

```ts
async function completeMigration(): Promise<void>
```

- Set `migrationVersion = 3` in IndexedDB meta.
- Log `'Migration complete'` to console.
- Emit a `migrationComplete` event to the Zustand store.

---

## Migration runner

```ts
export async function runMigration(): Promise<MigrationResult>

interface MigrationResult {
  skipped:         boolean;
  gamesImported:   number;
  tokenRotated:    boolean;
  firestoreCleaned:boolean;
  errors:          Error[];
}
```

- Wraps all steps.
- If any step throws a non-retryable error, halt and store the error in a `migrationError` key in IndexedDB so the user sees it on next launch.
- Steps 1–5 must run sequentially — never in parallel.

---

## UI integration (not in this file — add a comment pointing to where)

The migration runner emits events that the app shell must handle:
- `'migration:tokenRequired'` → show the token input modal
- `'migration:progress'` → update a progress bar with `{ step, total, message }`
- `'migration:complete'` → dismiss modal, reload app state
- `'migration:error'` → show error screen with retry button

---

## Constraints
- Never delete data from the games Gist until the IndexedDB write is confirmed.
- The migration must be idempotent: running it twice must produce the same result.
- If `migrationVersion` is already 3, return `{ skipped: true }` immediately.
- Add a `DRY_RUN` mode (env flag `VITE_MIGRATION_DRY_RUN=true`) that logs all
  operations without writing anything.
