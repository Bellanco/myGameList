# Copilot instructions — myGameList ("Mi Lista")

> **Read this first.** This file describes the app **exactly as it exists in the code today**.
> Everything here is verified against `src/`. If a suggestion you are about to make
> relies on a function, file, script or field, confirm it appears in this document or
> in the actual source — **do not invent APIs**. Aspirational/future work lives in a
> clearly separated section at the bottom and in `.github/prompts/migration/`.

---

## 1. What the app is

**myGameList** (UI label: *Mi Lista*) is a personal video‑game tracking PWA.
A user keeps lists of games (completed / playing / excluded / pending), and can
optionally share a public social profile with other users.

- **Sync**: each user's data lives in **their own GitHub Gists** (one private‑ish gist for games, one for the social profile). Conflict‑free merge (CRDT‑style) on every cycle.
- **Social**: optional Google sign‑in publishes a social profile and an activity feed; a **Firestore** directory lets users find each other and send game recommendations.
- **Offline‑first**: dual local storage (IndexedDB primary, localStorage fallback).
- **Hosting**: static build deployed on **Cloudflare Pages**.
- **Next‑game picker** (*"Elige tu próximo juego"*): a score‑weighted roulette that suggests what to play next. In the lists it draws from completed‑with‑replayable + excluded‑with‑retry + all pending (biased toward pending); in a social profile it draws from that user's completed games. Shared UI + pure weighting (see §3 / §7).

Architecture is **MVVM**: `model` (data) → `viewmodel` (React hooks) → `view` (components).

---

## 2. Stack (verified against `package.json`)

| Area | Tech | Version |
|------|------|---------|
| UI | React + React DOM | `^19.2.0` |
| Routing | react-router-dom | `^7.9.5` |
| Virtualized table | @tanstack/react-virtual | `^3.13.24` |
| Backend SDK | firebase (modular v9 API) | `^12.13.0` |
| Language | TypeScript | `^6.0.3` |
| Build/dev | Vite | `^8.0.11` |
| Styling | SCSS (`sass`) — **no Tailwind, no CSS‑in‑JS** | `^1.99.0` |
| Tests | Vitest (+ `@vitest/coverage-v8`, jsdom) | `^4.1.5` |
| Lint | ESLint 9 (flat config) + jsx-a11y + react | `^9.39.4` |
| HTML lint | html-validate | `^10.13.1` |

- TS config: `strict: true`, `noUnusedLocals/Parameters`, `noImplicitAny`, `jsx: react-jsx`, `moduleResolution: Bundler`, `noEmit: true`. No `any`.
- Node `>=20` (`engines`). Deployed via Cloudflare Pages (`wrangler.toml` → `pages_build_output_dir = ./dist`).

---

## 3. Directory layout (actual)

```
src/
  App.tsx                       # Router + top-level orchestration; lazy-loads SocialHub & SettingsHub
  main.tsx                      # React root, idle Firebase init, service-worker registration
  core/
    constants/                  # icons.ts, labels.ts, storageKeys.ts, uiConfig.ts
    security/                   # crypto.ts, sanitize.ts (input sanitization/normalization)
    utils/                      # compare.ts, renderStars.ts (pure helpers)
    roulette/                   # roulette.ts — pure next-game picker (pool builders + context weighting)
  model/
    types/game.ts               # ALL shared types (see §4)
    repository/                 # the ONLY layer allowed to touch storage / network (see §5)
  viewmodel/
    useGameListViewModel.ts     # list state, filters, sort, CRUD, modal drafts
    useSyncViewModel.ts         # the sync cycle (connect, push/pull, status)
  view/
    components/                 # GameTable, Header, Toolbar, TabBar, SocialHub, SettingsHub, …
    components/socialhub/       # SocialFeedScreen, SocialProfileScreen, SocialProfileDetailScreen, SocialDetailScreen
    components/roulette/        # RouletteModal — shared "next game" roulette (lists + social profile detail)
    modals/                     # FormModal, ConfirmModal, AdminModal
    hooks/                      # useDebouncedValue
  styles/                       # SCSS partials (_base, _layout, _table, _forms-and-buttons, _overlays-and-responsive, _roulette) + index.scss
tests/{unit,integration,e2e}/   # Vitest
scripts/ci-validate.js          # checks required files exist (run by `npm run validate`)
```

Path‑specific rules live in **`.github/instructions/*.instructions.md`** (auto‑applied by file glob).

---

## 4. Data model — `src/model/types/game.ts` (source of truth)

```ts
type TabId = 'c' | 'v' | 'e' | 'p';   // completed / playing(en curso) / excluded / pending

interface GameItem {
  id: number; _ts: number;            // _ts = last-modified timestamp (the CRDT clock)
  name: string; platforms: string[]; genres: string[];
  steamDeck: boolean; review: string;
  score?: number; years?: number[];
  strengths?: string[]; weaknesses?: string[]; reasons?: string[];
  replayable?: boolean; retry?: boolean; hours?: number | null;
}
interface DeletedItem { id: number; _ts: number; }                 // tombstone
interface TabData  { c; v; e; p: GameItem[]; deleted: DeletedItem[]; updatedAt: number; }
interface StoragePayload extends TabData { etag: string | null; lastRemoteUpdatedAt: number; }
interface SyncConfig { token: string; gistId: string; etag: string | null; lastRemoteUpdatedAt: number; }
interface TabSort { col: string; asc: boolean; }
interface ToolbarFilters { search; genre; platform; score; hours: string; only; deck: boolean; }
interface StatusNotice { kind: 'ok' | 'warn' | 'err'; message: string; }
```

**The CRDT clock is `_ts` (a number), per item.** There is **no** `_v`, `_modified`,
`deletedAt`, `SyncConflict`, `shareLevel`, `snippet`, or `profileId` field in the real code.
Deletions are tombstones in `TabData.deleted`. Merge = newest `_ts` wins, tombstones respected.

---

## 5. Repository layer — `src/model/repository/` (the data boundary)

**Every** storage/network access goes through here. ViewModels and components never call
`fetch`, `localStorage`, IndexedDB, the Gist API, or Firestore directly.

| File | Responsibility | Notable exports |
|------|----------------|-----------------|
| `localRepository.ts` | localStorage + IndexedDB read/write of the game payload (legacy‑compatible) | (load/save payload) |
| `indexedDbRepository.ts` | raw IndexedDB ops | |
| `idbConnectionRepository.ts` | IndexedDB connection lifecycle | |
| `migrateRepository.ts` | normalize/upgrade legacy data shapes | |
| `gistRepository.ts` | **all GitHub Gist I/O** (games + social) | see below |
| `firebaseRepository.ts` | Firebase Auth (Google), Firestore profiles + recommendations, Analytics | see below |
| `syncRepository.ts` | CRDT merge algorithm | |
| `syncMachineRepository.ts` | throttle / backoff / sync state machine | |
| `syncStateRepository.ts` | dirty‑state persistence | |

### Gist model (real)
- **Two gists per user, one JSON file each** — there is **no chunking**:
  - Games gist file: **`myGames.json`** → holds a `TabData`.
  - Social gist file: **`myGameList.social.json`** → holds `SocialGistData` (profile + activity feed).
- Key `gistRepository.ts` exports: `getSyncConfig` / `saveSyncConfig` / `clearSyncConfig` (+ `*SocialSyncConfig`), `whoAmI`, `createGist` / `createSocialGist`, `readGist` / `writeGist`, `readSocialGist` / `writeSocialGist`, `readPublicGamesGistById` / `readPublicSocialGistById`, `updateGistPrivacy`, `upsertReviewActivity` / `upsertRecommendationActivity`.
- Writes use **ETags** for conflict detection (`If-Match` / `304 Not Modified`). Always pass a fresh ETag through; a stale push risks a 409/lost update.
- ⚠️ `buildReviewExcerpt()` exists but is **dead code (never called)** — the social gist currently stores the **full `reviewText`**, not a truncated snippet. Don't assume snippet truncation exists.

### Firestore model (real — read this carefully)
- Auth: **Google sign‑in only** (`signInWithGoogle`). No email/password.
- Collection **`profiles`**, document id = **Firebase `uid`**. Written by `upsertProfileSocialReferences` / `ensureProfileByEmail`. Stored fields:
  `uid`, `email`, `displayName`, `photoURL`, `social: { gistId, gamesGistId, githubToken, etag, enabled }`, `updatedAt`.
- Collection **`recommendations`**: `fromUid`, `fromEmail`, `fromDisplayName`, `toEmail`, `gameId`, `gameName`, `message`, `status`, timestamps.
- Directory listing via `listSocialDirectory`; lookup via `findSocialProfileByEmail`; recommendations via `sendGameRecommendation` / `getReceivedRecommendations` / `updateRecommendationStatus`.
- 🔐 **Known sensitive reality:** the current `profiles` doc **does** contain `email`, `uid`, `social.githubToken`, and `social.gamesGistId`. This is the live behavior. Treat it as sensitive — **never log these, never widen what is written, and flag it** if a task touches profile writes. (The "index‑only / no‑token" model is *future* design, see §10 — it is **not** implemented.)

> All Firestore writes go through `firebaseRepository.ts` functions — never inline `setDoc`/`updateDoc` elsewhere.

---

## 6. ViewModel layer — `src/viewmodel/`

- ViewModels are **React custom hooks** (`use*ViewModel`), **not classes**. State via `useState`/`useReducer` inside the hook.
- `useGameListViewModel()` — list/filter/sort state, CRUD, modal drafts (`GameDraft`, `LookupData`, `TabAction`). Roulette helpers: `moveGameToTab`, `moveGameToCurrentByName`, `addGameToProximos` (adds an external game to *pending*, deduping by normalized name across all lists), `hasGameInLists`.
- `useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist })` — drives the sync cycle; exposes `SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'`.
- Components consume hooks; hooks call repositories. Keep state updates **immutable** (spread/clone, never mutate). Clean up effects (intervals, BroadcastChannel, subscriptions) in the `useEffect` return.

---

## 7. View layer — `src/view/`

- Components are presentational: they receive data/handlers from a ViewModel hook or parent props. They do **not** import repositories.
- `App.tsx` lazy‑loads heavy sections (`SocialHub`, `SettingsHub`) and modals with `React.lazy()` — follow this for new heavy sections.
- Table is virtualized via `@tanstack/react-virtual`. Icons use the existing `<Icon name="…" />` (`Icon.tsx` + `IconSprite.tsx`).
- The **next‑game roulette** is `view/components/roulette/RouletteModal.tsx` — one shared, lazy‑loaded modal used both from the lists (floating launcher above the FAB) and the social profile detail (button next to "Reseñas"). It takes `candidates`, a context `weight` function, and an `action` resolver; the **pure** pool building + weighting live in `core/roulette/roulette.ts` (`buildListsPool`, `buildProfilePool`, `listsWeight`, `profileWeight`, `pickWeighted`). Change weighting there, not in the component.
- Styling is **SCSS** in `src/styles/`. Add to the right partial or create `_feature.scss` and import it in `index.scss`. Mobile‑first; verify at **360 / 768 / 1024 / 1440 px**. Accessibility: ARIA labels, semantic roles, keyboard nav (jsx‑a11y is enforced by ESLint).

---

## 8. Conventions & code style

- `async/await` over `.then()` chains.
- No `any`; lean on the types in `game.ts`. Optional fields use `?`.
- **Never swallow errors** — log and rethrow, or surface via `StatusNotice` / `onNotice`.
- Sanitize user input through `src/core/security/sanitize.ts`. No `dangerouslySetInnerHTML` with unsanitized data; no `eval`/`Function`.
- Spanish comments are fine (the author uses them). JSDoc on exported functions is the norm — match it.
- Don't add npm dependencies without asking.
- File naming: `use{Feature}ViewModel.ts`, `{feature}Repository.ts`, `{Entity}` types in `model/types/`, `{ComponentName}.tsx`, `_{feature}.scss`, `tests/{unit|integration|e2e}/{name}.test.ts`.

---

## 9. Commands (only these scripts exist — `package.json`)

```bash
npm run dev            # Vite dev server
npm run build          # production build → dist/
npm run preview        # preview built app
npm run validate       # node scripts/ci-validate.js + html-validate index.html + eslint src tests
npm run lint           # eslint --fix
npm run test           # vitest run tests/unit src   (unit + colocated src tests)
npm run test:all       # vitest run  (includes integration + e2e)
npm run test:watch     # vitest watch
npm run test:coverage  # vitest run --coverage
npx tsc --noEmit       # typecheck (there is NO `npm run typecheck` alias)
```

**Definition of done for a change:** `npx tsc --noEmit` ✓, `npm run validate` ✓, `npm run test` ✓ (and `npm run build` for anything structural).

CI: **`.github/workflows/ci.yml`** runs build → `tsc --noEmit` → tests → coverage → validate → `npm audit`.
There are **no** scripts named `typecheck`, `audit:privacy`, `test:rules`, `migrate:dry`, or `size`. If a prompt/agent references one, it belongs to the unimplemented future plan (§10) — do not run it.

---

## 10. Planned / NOT implemented (future migration — do not treat as real)

`.github/prompts/migration/` (15 numbered prompts) and `.github/agents/migration/`
(`migrate`, `deploy-rules`, `validate-sync`, `audit-privacy`) describe a **future** redesign
that **does not exist in the current code**. They have been **adapted to the real stack**
(React 19, hooks + Context, raw IndexedDB, SCSS, Firebase v12, real paths under `src/model/`,
`src/viewmodel/`, `src/view/`), so paths/stack/scripts now match reality — but the **target
design** they implement (review/snippet split, `profileId`, index-only Firestore, gist chunking,
`firestore.rules`, additive `_v`/`deletedAt`) is still **not built**. Use them as a roadmap for
that transformation, never as a description of how the code works today.

The future design (aspirational, NOT current) includes:
- **review/snippet split** — public channel would store only a ≤160‑char `snippet`, never `review`.
- **`profileId` pseudonym** (UUID v4) replacing `uid` in all public data. *(Today: `uid` is used directly.)*
- **Firestore as index‑only** — no token/email/private stats in Firestore. *(Today: token + email ARE stored — see §5.)*
- **Gist chunking** (`*-chunk-N.json`, size thresholds). *(Today: single file per gist.)*
- **`firestore.rules`** + emulator tests. *(No rules file or emulator in the repo today.)*
- Per‑item `_v` / `_modified` / `deletedAt` clocks. *(Today: a single `_ts` per item + tombstones.)*

When asked to *advance* this migration, follow the relevant numbered prompt **but adapt every
path/stack detail to the real project** (see §2–§7), and confirm before introducing new
dependencies or restructuring storage.

---

## 11. How the `.github/` context is organized

- `copilot-instructions.md` *(this file)* — global, always‑on context. The source of truth.
- `instructions/*.instructions.md` — path‑scoped rules auto‑applied by `applyTo` glob (model / viewmodel / view / core / styles / tests).
- `prompts/*.prompt.md` — task templates for real work: `new-component`, `new-feature`, `fix-bug`, `refactor`, `add-test`.
- `prompts/remediation-plan.prompt.md` — **phased global fix plan** (security → data integrity → performance → reusability) built from a full audit of the real code; execute one sub‑phase at a time.
- `prompts/migration/` & `agents/migration/` — the unimplemented future plan (§10).
- `agents/{dev,debug,review}.agent.md` — working agents that reflect the real stack.
