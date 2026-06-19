# Copilot workspace instructions — Mi Lista

## Project context

**Mi Lista** is a personal game tracking web app (React + TypeScript) that syncs
data via GitHub Gist and has a social layer powered by Firestore.
The app is a PWA deployed on Cloudflare Pages.

---

## Current architecture (live)

### Data model
- **`GameItem`** — `{ id, name, genres, platforms, steamDeck, review, score, years, strengths, weaknesses, reasons, replayable, retry, hours, _ts }`
- **`TabData`** — Games split into four tabs: `c` (completed), `v` (playing), `e` (excluded), `p` (pending) + `deleted[]` + `updatedAt`
- **`SyncConfig`** — `{ token, gistId, etag, lastRemoteUpdatedAt }`
- Types live in `src/model/types/game.ts`

### Storage & sync
- **LocalStorage + IndexedDB** — dual storage; IndexedDB is primary, localStorage as fallback
- **Single private Gist** — all game data in one file, CRDT merge with ETags
- **Social Gist** — public Gist with shared games, snippets, activity feed
- **Firestore** — social profiles directory, used as index only (no private data)
- Sync cycle: local → Gist push/pull → CRDT merge → persist

### File structure (actual)
```
src/
  App.tsx                              # Main router + orchestration
  main.tsx                             # React root, Firebase idle init, SW
  core/constants/                      # icons, labels, storageKeys, uiConfig
  core/security/                       # crypto, sanitize (DOMPurify-like)
  core/utils/                          # compare, renderStars
  model/types/game.ts                  # GameItem, TabData, SyncConfig, etc.
  model/repository/
    localRepository.ts                 # localStorage + IndexedDB read/write
    gistRepository.ts                  # Games Gist + Social Gist operations
    firebaseRepository.ts             # Firebase Auth + Firestore queries
    syncRepository.ts                  # CRDT merge algorithm
    syncMachineRepository.ts           # Throttle, backoff, state machine
    syncStateRepository.ts             # Dirty state persistence
    indexedDbRepository.ts             # Raw IndexedDB operations
    idbConnectionRepository.ts         # IndexedDB connection management
    migrateRepository.ts               # Data migration helpers
  view/components/                     # UI components (GameTable, SocialHub, etc.)
  view/modals/                         # FormModal, ConfirmModal, AdminModal
  view/hooks/                          # useDebouncedValue
  viewmodel/
    useGameListViewModel.ts            # Filter, sort, CRUD (React hook)
    useSyncViewModel.ts                # Sync cycle management (React hook)
styles/                                # SCSS modules (_base, _table, etc.)
```

### Key patterns in current code
- ViewModels are React custom hooks (`use*ViewModel`), not classes
- State management via `useState`/`useReducer` inside hooks, no Zustand yet
- Components receive data from hooks, never call repositories directly
- Sync uses BroadcastChannel for multi-tab coordination
- Social layer: Google Auth → Firestore profile → Social Gist read/write
- Virtualized table via `@tanstack/react-virtual`

---

## Target architecture (migration)

The 15-step migration plan in `.github/prompts/` transitions to:

### Data split: review vs snippet (NEVER duplicate)
- `games-main.json` (private Gist): stores the **full `review` text**. No snippet field.
- `social-main.json` (public Gist): stores only the **`snippet`** (≤160 chars). No review field.
- The snippet is always derived from `review.slice(0, 160)` at publish time.

### Two-Gist model (target)
| Gist | Visibility | Purpose | Size limit |
|------|-----------|---------|-----------|
| `games-main.json` + `games-chunk-N.json` | Private | Full game data, sync source of truth | 800 KB/chunk |
| `social-main.json` + `social-chunk-N.json` | Public | Social display, no auth needed to read | 700 KB/chunk |

### Firestore is an index only
Firestore documents must never contain:
- `review` (full text), `score` or `hours` (private stats)
- `steamDeck`, `retry`, `replayable` (private flags)
- `uid` (Firebase real identity), `email`, `photoURL`, `githubToken`, `gamesGistId`

### Identity (target)
- `uid` — Firebase Auth real ID. Lives only in IndexedDB and `/privateConfig/{uid}`.
- `profileId` — UUID v4 pseudonym. Used in all public documents and Firestore.
- Never expose `uid` in public Firestore collections or in any Gist file.

### Chunk management (target)
- Chunks created when the active chunk exceeds 85% of its size limit.
- `*-main.json` are anchors with `chunkIndex`. Never rebalance retroactively.

---

## Stack (actual)
- React 19.2, TypeScript 6, Vite 8
- SCSS (no Tailwind) — `src/styles/`
- Firebase JS SDK v12 (modular) — Auth + Firestore + Analytics
- `@tanstack/react-virtual` for table virtualization
- GitHub REST API v3 for Gist operations
- Vitest 4 for testing, ESLint 9
- Cloudflare Pages for hosting

## File naming conventions
- ViewModels: `src/viewmodel/use{Feature}ViewModel.ts` (React hooks)
- Repository layer: `src/model/repository/{feature}Repository.ts`
- Data models/types: `src/model/types/{entity}.ts`
- Components: `src/view/components/{ComponentName}.tsx`
- Modals: `src/view/modals/{ModalName}.tsx`
- Constants: `src/core/constants/{domain}.ts`
- Tests: `tests/{unit|integration|e2e}/{name}.test.ts`

## Code style
- Prefer `async/await` over `.then()` chains.
- All public functions must have JSDoc with `@param` and `@returns`.
- Error handling: never swallow errors silently. Always log and rethrow or surface to UI.
- Use `Result<T, E>` pattern for operations that can fail gracefully.
- All Firestore writes go through repository functions, never inline `setDoc`/`updateDoc`.
- Comments in Spanish are acceptable (the author uses them frequently).
- Mobile-first responsive design — test at 360px, 768px, 1024px, 1440px.

## Commands
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run test` — unit tests
- `npm run test:all` — all tests including e2e
- `npm run validate` — ESLint + HTML validation + typecheck
- `npm run lint` — ESLint with autofix
