---
applyTo: "src/model/**"
---

# Model layer (`src/model/`)

This is the **data boundary**: storage and network access live here (`repository/`), with `types/`, `schemas/` (Zod) and `migration/` (legacy formats) beside it.

## Types — `src/model/types/`
- `game.ts` holds the core shared types. Reuse `GameItem`, `TabData`, `DeletedItem`, `SyncConfig`, `StoragePayload`, `ToolbarFilters`, `TabSort`, `StatusNotice`, `TabId` (`'c' | 'v' | 'e' | 'p' | 'd'`, from `TAB_IDS`). Social, Firestore, gist‑format, local‑meta, share, premios and import types have their own files (`social.ts`, `firestore.ts`, `gist.ts`, `local.ts`…).
- The per‑item CRDT clock is **`_ts: number`**. `_v`, `shared` and `DeletedItem.deletedAt` exist as additive migration metadata — they are not the clock. Deletions are tombstones in `TabData.deleted`.
- No `any`. Optional fields use `?`. Don't duplicate fields across types.
- ⚠️ **Do not delete "unused" exports from `src/model/repository/` or `src/model/types/`.** They are the staging area of the gist‑format migration, and dead‑code detectors (knip…) give known false positives there. Ask first.

## Repository — `src/model/repository/`
- No React, no JSX, no UI rendering here. Data/network functions.
- **Never swallow errors.** Log + rethrow, or return a typed result the caller can surface.
- **Games gist I/O is in `gistRepository.ts`; the social gist in `socialGistRepository.ts`**; shared GitHub plumbing in `githubHttp.ts` / `githubGistApi.ts`. Two gists per user: games → `myGames.json` (written as the v4 envelope, gzip‑compressed; reads stay compatible with plain/legacy shapes); social → `myGameList.social.json` (`SocialGistData`). Chunk files exist for size; overflow to extra gists is gated off (`ENABLE_GAMES_OVERFLOW_GISTS = false`).
- ETags: reads are conditional (`If-None-Match` → handle `304`, which carries no body). Writes carry no `If-Match` (the Gist API is last‑write‑wins), so callers read → merge → write; keep the stored ETag current after every read/write.
- **No length caps in `schemas/gamesGistSchema.ts`** (the file explains why: a long review is legitimate data and rejecting it aborts the whole upload). Size is bounded compressed, at write time.
- The social channel must never carry private fields: `assertNoSocialPrivateFields` (`socialProjection.ts`) guards it, and `npm run audit:privacy` checks it statically. Reviews go out as a ≤160‑char `snippet` (`buildReviewSnippet`).
- **Firestore I/O stays in the repository layer** — `firebaseGateway.ts` (lazy boundary, no static `firebase/*` import) → `firebaseRepository.ts` (facade) and the `firebase*Repository.ts`, `admin/`, `premios/` modules. Rules live in `firestore.rules` (test with `npm run test:rules`). Auth is Google‑only.
- 🔐 `profiles/{uid}` is readable by any signed‑in user when `social.enabled`; its allowlist has **no `email` and no token**. The GitHub token is encrypted and backed up only in owner‑only `privateConfig/{uid}`. Never log ids/tokens and don't widen what's written; flag it if your change touches profile writes.
- **Paired limits:** caps such as `PUBLIC_NAME_MAX_LENGTH` exist both in the client and in `firestore.rules`, and tests check they match. Changing one means changing the other.
- CRDT merge (`mergeCrdt`) lives in `syncRepository.ts`; pure sync helpers in `syncLogicRepository.ts`; throttle/backoff/state in `syncMachineRepository.ts`; dirty state in `syncStateRepository.ts`. Changing merge semantics can lose data — add/adjust tests in `tests/unit/sync*` and explain the impact.
- Keep `migrateRepository.ts` and `model/migration/` backward‑compatible: they must keep loading legacy data shapes.

Verify: `npm run typecheck` and `npm run test` (plus `npm run test:rules` if you touch `firestore.rules`).
