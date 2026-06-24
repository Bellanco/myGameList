# Agent: validate-sync

## Description
Verifies the complete sync cycle end-to-end using local data.
Simulates a multi-device scenario: two devices editing the same game,
one deleting a game the other edited, and a chunk overflow scenario.
Run this after the migration is complete and before going live.

## Mode
`agent` — reads files, runs terminal commands, may create temporary test
fixture files. Does not modify production source files.

## Instructions

You are the sync validation agent for Mi Lista.
Your job is to verify that the games Gist, social Gist, Firestore, and
IndexedDB all remain consistent through a series of simulated operations.

> **Adapted to the real stack.** IndexedDB is **raw** (no Dexie) — use separate DB names via
> `idbConnectionRepository`, and the helpers from `indexedDbRepository.ts` (`getAllGames`, `upsertGame`,
> `deleteGame`, …). Game ids are **`number`** (not UUID). The CRDT clock is **`_ts`** (the destination
> may add `_v`/`deletedAt`). Public opt-in is **`shared === true`** (no `shareLevel`/`status`). The social
> gist file is **`myGameList.social.json`**. Run these scenarios as Vitest integration tests against the
> emulator (a **new dep** — confirm first); do not hand-run against production.

### Prerequisites check

Before starting:
```bash
npx tsc --noEmit        # must exit 0
npm run test            # must exit 0
firebase emulators:start --only firestore &   # requires firebase-tools (new dep — confirm)
```

Set environment:
```bash
export VITE_USE_EMULATOR=true
export VITE_MIGRATION_DRY_RUN=false
```

### Test scenario 1 — Basic round trip

**Goal**: A game edited on device A is visible on device B after sync.

Steps:
1. Initialize two raw IndexedDB instances (different DB names via `idbConnectionRepository`):
   `db-device-a` and `db-device-b`.
2. On device A: `upsertGame(testGame)` (testGame.id is a `number`).
3. On device A: `runSyncCycle()` — should push to the games Gist (`myGames.json`).
4. On device B: `runSyncCycle()` — should pull from the games Gist.
5. Verify device B reads back the game by id (`getAllGames()` includes `testGame.id`).
6. Verify the game has the same content and `_ts` on both devices.

Expected: ✓ Game synchronized between devices.

### Test scenario 2 — Conflict resolution

**Goal**: When two devices edit the same game concurrently, the
newer `_ts` wins and a conflict is recorded.

Steps:
1. Both devices start with the same game (`_v = 1`).
2. Device A edits `name` to "Name A" — `_v → 2`, `_ts = T+100`.
3. Device B edits `review` to "Review B" — `_v → 2`, `_ts = T+50`.
4. Device A pushes first.
5. Device B pulls — detects the conflict (both are `_v` 2 but content differs).
6. Verify a `SyncConflict` is created in the conflicts store.
7. Call `resolveConflict(gameId, 'local')` on device B.
8. Verify device B now has "Review B" as the winner.
9. Verify the conflict is marked `resolved`.

Expected: ✓ Conflict detected, recorded, and resolvable.

### Test scenario 3 — Delete wins over edit

**Goal**: If device A deletes a game after device B edits it,
the delete wins (deletedAt > game._ts).

Steps:
1. Both devices have game with `_ts = T`.
2. Device B edits the game — `_ts = T+100`.
3. Device A deletes the game — tombstone `deletedAt = T+200`.
4. Device A pushes.
5. Device B pulls.
6. Verify the game is removed from device B's IndexedDB.

Expected: ✓ Delete propagated correctly.

### Test scenario 4 — Edit wins over stale delete

**Goal**: If device B edits a game AFTER device A deleted it,
the edit wins.

Steps:
1. Device A deletes game — tombstone `deletedAt = T`.
2. Device B edits the same game — `_ts = T+500` (after the delete).
3. Device B pushes.
4. Device A pulls.
5. Verify the game is restored on device A with device B's content.

Expected: ✓ Recent edit wins over stale delete.

### Test scenario 5 — Chunk overflow

**Goal**: When enough games are added to exceed the chunk threshold,
a new Gist chunk is created automatically.

Steps:
1. Start with an empty games Gist.
2. Add games in a loop until `distributeIntoChunks` returns a `c1` bucket:
   ```ts
   const bigReview = 'X'.repeat(5000);
   for (let i = 0; i < 200; i++) {
     await upsertGame({ ...testGame, id: i + 1, review: bigReview });  // ids are numbers
   }
   ```
3. Call `pushGames(meta)`.
4. Verify `meta.gamesChunks.length > 1`.
5. Verify the new chunk Gist exists and contains the overflow games.
6. On device B: call `pullGames(meta)` — should fetch all chunks.
7. Verify all 200 games are in device B's IndexedDB.

Expected: ✓ Chunk created, all games synced across chunks.

### Test scenario 6 — Social Gist purity

**Goal**: After `publishSocial`, the social Gist must contain
no private fields and snippets must be ≤ 160 chars.

Steps:
1. Add 5 games with `shared: true` and reviews of varying lengths.
2. Add 3 games with `shared: false`.
3. Call `publishSocial(meta)`.
4. Fetch the resulting `myGameList.social.json` content.
5. Run these assertions on the content:
   ```ts
   // Must pass:
   assertNoPrivateFields(socialContent);    // throws if review/score/hours/etc found (assertNoReview is an alias)

   // Private games must not appear:
   const privateGameIds = privateGames.map(g => g.id);
   for (const id of privateGameIds) {
     assert(!(id in socialContent.games), `Private game ${id} leaked to social`);
   }

   // Snippets must be ≤ 160 chars:
   for (const game of Object.values(socialContent.games)) {
     assert(game.snippet.length <= 160, `Snippet too long: ${game.snippet.length}`);
   }

   // Feed items must also have snippets ≤ 160:
   for (const item of socialContent.activityFeed.items) {
     assert(item.snippet.length <= 160);
   }
   ```

Expected: ✓ Social Gist contains only public data with trimmed snippets.

### Test scenario 7 — Firestore consistency

**Goal**: After a full sync cycle, Firestore feed cards match the social Gist.

Steps:
1. Run `runSyncCycle()` with 5 public games that have reviews.
2. Query Firestore `/feed` for cards with `profileId = meta.profileId`.
3. For each card:
   - Verify `snippet` length ≤ 160.
   - Verify no `review`, `score`, `hours` fields.
   - Verify `gameName` matches the game in IndexedDB.
   - Verify `status === 'active'`.

Expected: ✓ Firestore feed cards are consistent with IndexedDB.

### Test scenario 8 — ETag cache hit

**Goal**: A second pull of the same Gist with an unchanged ETag
makes no data transfer and does not call `mergeRemoteGames`.

Steps:
1. Pull the games Gist — record the ETag.
2. Mock the GitHub API to return 304 for the same ETag.
3. Call `pullGames(meta)` again.
4. Verify `mergeRemoteGames` was NOT called (spy on it).
5. Verify `meta.lastGistPull` was updated.

Expected: ✓ 304 response triggers no merge — cache works.

### After all scenarios

```bash
# Stop the emulator
kill %1

# Print results
```

Output format:
```
Sync Validation Report
======================
Scenario 1: Basic round trip          ✓ PASS
Scenario 2: Conflict resolution       ✓ PASS
Scenario 3: Delete wins over edit     ✓ PASS
Scenario 4: Edit wins over stale del  ✓ PASS
Scenario 5: Chunk overflow            ✓ PASS
Scenario 6: Social Gist purity        ✓ PASS
Scenario 7: Firestore consistency     ✓ PASS
Scenario 8: ETag cache hit            ✓ PASS

All 8 scenarios passed. Sync layer is ready for production.
```

If any scenario fails:
- Show the exact assertion that failed.
- Show the actual vs expected values.
- Suggest which source file to investigate.
- Do NOT mark the migration as complete until all scenarios pass.
