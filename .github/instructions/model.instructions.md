---
applyTo: "src/model/**"
---

# Model layer (`src/model/`)

This is the **data boundary**. It is the only layer allowed to touch storage and the network.

## Types — `src/model/types/game.ts`
- This file is the single source of truth for shared types. Reuse `GameItem`, `TabData`, `DeletedItem`, `SyncConfig`, `StoragePayload`, `ToolbarFilters`, `TabSort`, `StatusNotice`, `TabId`.
- The per‑item CRDT clock is **`_ts: number`**. There is no `_v`, `_modified`, `deletedAt`, `snippet`, `shareLevel`, or `profileId`. Deletions are tombstones in `TabData.deleted`.
- No `any`. Optional fields use `?`. Don't duplicate fields across types.

## Repository — `src/model/repository/`
- No React, no DOM, no JSX here. Pure data/network functions.
- **Never swallow errors.** Log + rethrow, or return a typed result the caller can surface.
- **Gist I/O is in `gistRepository.ts` only.** Two gists per user, one JSON file each: games → `myGames.json` (a `TabData`); social → `myGameList.social.json` (`SocialGistData`). There is **no chunking**.
- Always thread the **ETag** through reads/writes (`If-Match` / handle `304`). A push without a fresh ETag risks a 409 / lost update.
- `buildReviewExcerpt()` is currently **dead code** — the social gist stores the full review. Don't build features assuming a stored snippet without wiring it end‑to‑end.
- **Firestore I/O is in `firebaseRepository.ts` only.** Collections: `profiles` (doc id = Firebase `uid`) and `recommendations`. Auth is Google‑only.
- 🔐 The `profiles` doc currently stores `email`, `uid`, `social.githubToken`, `social.gamesGistId`. This is sensitive — never log it and don't widen what's written. Flag it if your change touches profile writes.
- CRDT merge lives in `syncRepository.ts`; throttle/backoff/state in `syncMachineRepository.ts`; dirty state in `syncStateRepository.ts`. Changing merge semantics can lose data — add/adjust tests in `tests/unit/sync*` and explain the impact.
- Keep `migrateRepository.ts` backward‑compatible: it must keep loading legacy data shapes.

Verify: `npx tsc --noEmit` and `npm run test`.
