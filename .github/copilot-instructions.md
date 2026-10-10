# Copilot instructions — myGameList ("Mis Listas")

> **Read this first.** This file describes the app **exactly as it exists in the code today**.
> Everything here was verified against `src/` on 2026-10-10. If a suggestion you are about to make
> relies on a function, file, script or field, confirm it appears in the actual source — **do not invent
> APIs**. If this document and the code disagree, **the code wins** (and this file should be fixed).

---

## 1. What the app is

**myGameList** (UI label: *Mis Listas*) is a personal video‑game tracking PWA.
A user keeps five lists of games (completed / abandoned "vergüenza" / in progress / next / wishlist), and can
optionally share a social profile with friends.

- **Sync**: each user's data lives in **their own GitHub Gists** (a secret gist for games, another for the social channel). Conflict‑free merge (CRDT‑style) on every cycle.
- **Social**: optional Google sign‑in; profiles, mutual **friendships** (Firestore) and a feed of reviews, posts and list moves (social gist), public review links (`/r/:token`), invites and a year summary.
- **Also**: stats, achievements (*logros*), the seasonal awards (`/premios`), Playnite import, eight themes × light/dark, an onboarding tour.
- **Offline‑first**: dual local storage (IndexedDB primary, localStorage fallback) + service worker.
- **Hosting**: static build + a few Pages Functions (`functions/`) on **Cloudflare Pages**.
- **Next‑game picker** (*"Elige tu próximo juego"*): a score‑weighted roulette that suggests what to play next. In the lists it draws from completed‑with‑replayable + abandoned‑with‑retry + all next (biased toward next); in a social profile it draws from that user's completed games. Shared UI + pure weighting (see §3 / §7).

Architecture is **MVVM**: `model` (data) → `viewmodel` (React hooks) → `view` (components), plus framework‑free
`core`. The README («Arquitectura MVVM») documents, on purpose, **where practice deviates** from that scheme
(some `view/` files import network repositories directly; `view/hooks/use*Session` are session view‑models in
all but name). Don't "fix" that in passing: it is measured and documented. The only boundary enforced by tooling
is that `src/core/` cannot import `model/repository|migration|schemas` (`eslint.config.cjs`).

---

## 2. Stack (verified against `package.json`)

Major versions only — the exact ranges live in `package.json` and move with every dependency bump.

| Area | Tech | Major |
|------|------|---------|
| UI | React + React DOM (pinned, no `^`: the pair must match) | 19 |
| Routing | react-router-dom | 7 |
| Virtualized table | @tanstack/react-virtual | 3 |
| Backend SDK | firebase (modular API: Auth, Firestore, Analytics, App Check) | 12 |
| Schemas | zod (`src/model/schemas/`) | 4 |
| Language | TypeScript | 6 |
| Build/dev | Vite (+ `@vitejs/plugin-react`) | 8 |
| Styling | SCSS (`sass`) — **no Tailwind, no CSS‑in‑JS** | 1 |
| Tests | Vitest (+ `@vitest/coverage-v8`, jsdom, Testing Library) · Playwright (+ axe) for e2e | 5 · 1 |
| Lint | ESLint (flat config, `eslint.config.cjs`) + typescript-eslint + jsx-a11y + react + react-hooks | 9 |
| HTML lint | html-validate | 11 |

- TS config: `strict: true`, `noUnusedLocals/Parameters`, `noImplicitAny`, `noImplicitReturns`, `jsx: react-jsx`, `moduleResolution: Bundler`, `noEmit: true`. No `any`. `functions/` has its own `tsconfig.functions.json`.
- Node `>=24.8.0` (`engines`); the version actually used by `nvm use`, CI and Cloudflare Pages comes from `.nvmrc` (`24`) — Pages ignores `engines`. Deployed via Cloudflare Pages (`wrangler.toml` → `pages_build_output_dir = ./dist`).

---

## 3. Directory layout (actual)

```
src/
  App.tsx                       # Router + top-level orchestration; lazy-loads hubs, settings screens, modals
  main.tsx                      # React root, idle Firebase init (via firebaseGateway), service-worker registration
  core/                         # pure, framework-free logic — may NOT import repositories (ESLint enforces it)
    constants/                  # labels (*Labels.ts), icons, storageKeys, routes, uiConfig, legal, themes/…
    security/                   # sanitize.ts (input sanitization + limits), crypto.ts (token at rest), admin.ts
    utils/                      # compare, renderStars, normalize, dateTime, gistCompression, … (pure helpers)
    roulette/                   # roulette.ts — pure next-game picker (pool builders + context weighting)
    achievements/ stats/ premios/ social/ import/ onboarding/ announcement/ effects/   # pure logic per domain
  model/
    types/                      # shared contracts: game.ts, social.ts, firestore.ts, gist.ts, local.ts, share.ts, premios.ts, import.ts
    repository/                 # storage / network access (see §5); admin/, import/, premios/ subfolders
    migration/                  # legacy gist / localStorage formats and their reassembly
    schemas/                    # Zod schemas: gamesGistSchema, socialGistSchema, shareSchema
  viewmodel/                    # hooks: useGameListViewModel, useSyncViewModel, useSocialViewModel, useStatsViewModel,
                                #   useAdminViewModel, useShareViewModel, …; social/, premios/, sync/ subfolders
  view/
    components/                 # GameTable, Toolbar, TabBar, SocialHub, SettingsHub, AdminHub, Icon, …
    components/socialhub/       # SocialFeedScreen, SocialProfileScreen, SocialProfileDetailScreen, SocialDetailScreen, …
    components/roulette/        # RouletteModal / ListsRouletteModal — shared "next game" roulette
    components/{stats,settings,premios,onboarding,import,invite,sync,appearance}/
    modals/                     # FormModal, ConfirmModal, ShareReviewModal (+ useNativeDialog)
    hooks/                      # UI hooks (theme, palette, preferences…) and the use*Session hooks (see §1)
  styles/                       # SCSS: index.scss + partials, area sheets (social.scss, stats.scss…), themes/<id>/
  dev/                          # development-only helpers
functions/                      # Cloudflare Pages Functions (GitHub OAuth, share links /r, /cover, /poster, premios…)
tests/{unit,component,integration,emulacion,e2e}/  # unit+component: Vitest/jsdom · e2e: Playwright contra el build
scripts/ci-validate.js          # required files, boot byte budget, SW precache markers, fonts… (run by `npm run validate`)
```

Path‑specific rules live in **`.github/instructions/*.instructions.md`** (auto‑applied by file glob).

---

## 4. Data model — `src/model/types/` (`game.ts` is the core; abridged below)

```ts
const TAB_IDS = ['c', 'v', 'e', 'p', 'd'] as const; // completed / abandoned ("vergüenza") / in progress / next / wishlist
type TabId = (typeof TAB_IDS)[number];               // also LibraryTabId (all but 'd') and UNPLAYED_TAB_IDS ('p','d')

interface GameItem {
  id: number; _ts: number;            // _ts = last-modified timestamp (the CRDT clock)
  name: string; platforms: string[]; genres: string[];
  steamDeck: boolean; review: string;
  score?: number;                     // legacy 0–5 mirror, kept for old clients
  grade?: number | null;              // fine 0–100 grade (the source); derived from score when absent
  years?: number[]; strengths?: string[]; weaknesses?: string[]; reasons?: string[];
  replayable?: boolean; retry?: boolean; hours?: number | null; scored?: boolean;
  _v?: number; shared?: boolean;      // additive migration targets (metadata; _ts is still the clock)
  listedAt?: number; reviewedAt?: number; gradedAt?: number;
  enteredAt?: Partial<Record<TabId, number>>;
}
interface DeletedItem { id: number; _ts: number; deletedAt?: number; }      // tombstone
interface TabData  { c; v; e; p; d: GameItem[]; deleted: DeletedItem[]; updatedAt: number; }
interface StoragePayload { /* TabData fields */ etag: string | null; lastRemoteUpdatedAt: number; schemaVersion?: number; }
interface SyncConfig { token: string; gistId: string; etag: string | null; lastRemoteUpdatedAt: number; }
interface TabSort { col: string; asc: boolean; }
interface ToolbarFilters { search: string; genres: string[]; platforms: string[]; score: string; hours: string; only: boolean; deck: boolean; }
interface StatusNotice { kind: 'ok' | 'warn' | 'err'; message: string; }
```

**The CRDT clock is `_ts` (a number), per item.** `_v`, `shared` and `deletedAt` exist but are additive
metadata, not the clock. Deletions are tombstones in `TabData.deleted`. Merge (`mergeCrdt` in
`syncRepository.ts`) = newest `_ts` wins, tombstones respected. Social, Firestore, gist‑format, local‑meta,
share, premios and import types live in their own files under `model/types/`.

> ⚠️ **Do not delete "unused" exports from `src/model/repository/` or `src/model/types/`.** They are the staging
> area of the gist‑format migration and dead‑code detectors give known false positives there. Ask first.

---

## 5. Repository layer — `src/model/repository/` (the data boundary)

Storage/network access lives here (the README documents which `view/` files still call network repositories
directly — don't add new ones). New code: ViewModels and components never call `fetch`, `localStorage`,
IndexedDB, the Gist API, or Firestore directly.

| File(s) | Responsibility |
|---------|----------------|
| `localRepository.ts` | local game payload (localStorage + IndexedDB, legacy‑compatible), `normalizeData` |
| `indexedDbRepository.ts` / `idbConnectionRepository.ts` | IndexedDB ops (incl. `LocalMeta`) / connection lifecycle |
| `migrateRepository.ts` (+ `model/migration/`) | normalize/upgrade legacy data shapes |
| `gistRepository.ts` | **games** gist I/O: v4 envelope, compression, chunks/overflow (`readGist`, `writeGist`, `createGist`, `whoAmI`…) |
| `socialGistRepository.ts` | **social** gist: types, pure transforms (`upsertReviewActivity`, `upsertPost`, `mergeSocialGistData`…) and I/O |
| `githubHttp.ts` / `githubGistApi.ts` / `gistConfigRepository.ts` | GitHub fetch (timeouts, rate limit) / shared gist primitives / `SyncConfig` storage |
| `socialProjection.ts` | pure projection of the public channel + privacy guard `assertNoSocialPrivateFields` |
| `firebaseGateway.ts` → `firebaseRepository.ts` | lazy boundary to Firebase (no static `firebase/*` import) → facade |
| `firebaseClient.ts`, `firebaseAuthRepository.ts`, `firebaseSocialRepository.ts`, `firebaseFriendshipRepository.ts`, … | Firestore/Auth by area; `admin/`, `premios/`, `import/` subfolders |
| `syncRepository.ts` / `syncLogicRepository.ts` | CRDT merge (`mergeCrdt`) / pure sync helpers |
| `syncEngine.ts` | the sync engine, loaded on demand |
| `syncMachineRepository.ts` / `syncStateRepository.ts` | throttle / backoff / sync state machine / dirty‑state persistence |

### Gist model (real)
- **Two gists per user**: games (`myGames.json`, created secret) and social (`myGameList.social.json`).
- The games file is written as the **v4 envelope** (map by id + category dictionaries) **gzip‑compressed**
  (`ENABLE_GAMES_WRAPPER_WRITE` and `ENABLE_GAMES_COMPRESSION` are `true`); reading stays backward‑compatible
  with plain/legacy shapes. Chunk files exist for size; **overflow to extra gists is off**
  (`ENABLE_GAMES_OVERFLOW_GISTS = false`). Zod schemas in `model/schemas/` validate on write.
- **No length caps in the games gist schema** (`gamesGistSchema.ts` explains why: a long review is legitimate
  data and rejecting it aborts the whole upload). Size is bounded compressed, at write time.
- ETags: **reads** are conditional (`If-None-Match` → `304 Not Modified`). **Writes** (PATCH) carry no
  `If-Match` — the Gist API is last‑write‑wins — so the cycle is read → `mergeCrdt` → write, and
  `writeWithConflictRecovery` (`useSyncViewModel.ts`) re‑reads and re‑merges if a write fails with 409.
- The social channel never carries private fields: `SOCIAL_PRIVATE_FIELDS` (`socialProjection.ts`: `review`,
  `reviewText`, `score`, `hours`, `steamDeck`, `retry`, `replayable`, `enteredAt`, `gradedAt`) is enforced by
  `assertNoSocialPrivateFields`. Review activity stores a **`snippet`** (≤160 chars, `buildReviewSnippet`), not
  the full text; a friend's full reviews are read from their **games** gist.

### Firestore model (real — read this carefully)
- Auth: **Google sign‑in only** (`signInWithGoogle`). No email/password.
- Rules in **`firestore.rules`** (indexes in `firestore.indexes.json`), tested with `npm run test:rules`.
  Collections: `profiles`, `privateConfig`, `publicConfig`, `userMap`, `friendships`, `friendshipKeys`,
  `appConfig`, `premios*`; `recommendations` and `activity_events` are admin‑only.
- **`profiles/{uid}`** is readable by any signed‑in user when `social.enabled`. Allowed keys (`hasOnly`):
  `schemaVersion`, `uid`, `profileId`, `displayName`, `photoURL`, `social: { enabled, etag, gistId, gamesGistId }`,
  `updatedAt`, `tier`, `createdAt`, `achievements`, `palmares`, `yearSummary`. **No `email`, no token.**
- The GitHub token is encrypted at rest locally (`core/security/crypto.ts`) and backed up **encrypted** in the
  owner‑only `privateConfig/{uid}` (`backupGithubToken` / `recoverGithubToken`). See `SECURITY.md`.
- 🔐 Treat profile writes as sensitive: **never log ids/tokens, never widen what is written**, and flag it.
- **Paired limits:** several caps live both in the client and in `firestore.rules` (e.g. `PUBLIC_NAME_MAX_LENGTH`
  in `sanitize.ts`), and tests check they match. Changing one means changing the other.

> Firestore writes stay inside `src/model/repository/` (`firebase*Repository.ts`, `admin/`, `premios/`…) —
> never inline `setDoc`/`updateDoc` in viewmodels or components.

---

## 6. ViewModel layer — `src/viewmodel/`

- ViewModels are **React custom hooks** (`use*ViewModel`, plus `use*` hooks under `social/`, `premios/`), **not classes**. State via `useState`/`useReducer` inside the hook.
- `useGameListViewModel()` — list/filter/sort state, CRUD, modal drafts (`GameDraft`, `LookupData`, `TabAction`). Roulette helpers: `moveGameToTab`, `moveGameToCurrentByName`, `addGameToProximos` (adds an external game to *next*, deduping by normalized name across all lists), `hasGameInLists`.
- `useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist })` — drives the sync cycle; exposes `SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'` (the internal machine in `syncMachineRepository.ts` has its own finer states).
- `useSocialViewModel` orchestrates the social hub, split into hooks under `viewmodel/social/`.
- Components consume hooks; hooks call repositories. Keep state updates **immutable** (spread/clone, never mutate). Clean up effects (intervals, BroadcastChannel, subscriptions) in the `useEffect` return.

---

## 7. View layer — `src/view/`

- Components are presentational: they receive data/handlers from a ViewModel hook or parent props. New components should **not** import repositories (see the documented deviation in §1).
- `App.tsx` lazy‑loads heavy sections (`SocialHub`, `SettingsHub`, `StatsHub`, `PremiosHub`, `AdminHub`…) and modals (`FormModal`, `ConfirmModal`, the roulette) with `React.lazy()` — follow this for new heavy sections.
- Table is virtualized via `@tanstack/react-virtual`. Icons use the existing `<Icon name="…" />` (`Icon.tsx` + `IconSprite.tsx` / `IconSpriteRest.tsx`).
- The **next‑game roulette** is `view/components/roulette/RouletteModal.tsx` — one shared, lazy‑loaded modal used from the lists (via `ListsRouletteModal`) and from the social profile detail (`SocialProfileDetailScreen`). It takes `candidates`, a context `weight` function, and an `action` resolver; the **pure** pool building + weighting live in `core/roulette/roulette.ts` (`buildListsPool`, `buildProfilePool`, `buildListsWeigher`, `listsWeight`, `profileWeight`, `pickWeighted`). Change weighting there, not in the component.
- Styling is **SCSS** in `src/styles/` (see `.github/instructions/styles.instructions.md` and `DESIGN.md`): neutral components built from tokens; a theme's character goes in `styles/themes/<id>/<id>.scss`. Mobile‑first; verify at **360 / 768 / 1024 / 1440 px**. Accessibility: ARIA labels, semantic roles, keyboard nav (jsx‑a11y is enforced by ESLint; `tests/e2e/a11y.test.ts` runs axe on every theme × mode).
- Social hub screens need a Google + GitHub session; to review their design use `docs/maquetas/social.html` (dev server) and `node scripts/capturar-maqueta-social.mjs`. **A new hub screen or view must be added to that mock‑up too.**

---

## 8. Conventions & code style

- `async/await` over `.then()` chains.
- No `any`; lean on the types in `game.ts`. Optional fields use `?`.
- **Never swallow errors** — log and rethrow, or surface via `StatusNotice` / `onNotice`.
- Sanitize user input through `src/core/security/sanitize.ts`. No `dangerouslySetInnerHTML` with unsanitized data; no `eval`/`Function`.
- Spanish comments are fine (the author uses them). JSDoc on exported functions is the norm — match it.
- **UI text is Spanish** and lives in `src/core/constants/*Labels.ts` / `labels.ts`, not hardcoded in components.
- Don't add npm dependencies without asking.
- File naming: `use{Feature}ViewModel.ts`, `{feature}Repository.ts`, `{Entity}` types in `model/types/`, `{ComponentName}.tsx`, `_{feature}.scss` or `{area}.scss`, `tests/{unit|component|integration|e2e}/{name}.test.ts(x)`.
- **Measure before claiming.** Performance, coverage and bundle numbers come from concrete commands (see «Cómo se midió» in `docs/revision-general-2026-09.md`): reproduce them, don't estimate. Check that document before proposing a cleanup — it may already be ruled out.
- `DESIGN.md`, `docs/plan-*.md` and the review are **living documents**: if a line disagrees with the code, the code wins; fix the doc in the same pass.
- **Commits:** Conventional Commits like `master`'s history — `<type>(<optional scope>): <short lowercase description>` in English, no trailing period (types in use: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`). One line by default; body only if really needed (`- ` bullets). **No assistant trailers** (`Co-Authored-By`, "Generated with…").

---

## 9. Commands (`package.json` — use only scripts listed there)

```bash
npm run dev            # Vite dev server
npm run build          # production build → dist/
npm run preview        # preview built app
npm run validate       # node scripts/ci-validate.js + html-validate index.html + eslint src tests functions
npm run lint           # eslint src tests functions --fix
npm run format         # prettier --write (no lo pases a un fichero ajeno entero: reformatea lo que no tocas)
npm run test           # vitest run tests/unit tests/component src   (lo que corre el hook pre-push)
npm run test:all       # vitest run  — OJO: NO incluye e2e, integration ni emulacion (vitest.config.mjs los EXCLUYE)
npm run test:e2e       # playwright test — los e2e, contra el BUILD de producción (ver abajo)
npm run test:rules     # reglas de Firestore contra el emulador (necesita JDK 21+)
npm run test:watch     # vitest watch
npm run test:coverage  # vitest run --coverage
npm run typecheck      # tsc --noEmit && tsc -p tsconfig.functions.json  (src/tests + functions)
npm run audit:privacy  # auditoría estática de fugas de datos privados a canales públicos
npm run audit:rules    # solo lectura: datos de producción contra firestore.rules (antes de desplegar reglas)
npm run audit:deploy   # el HTML desplegado no carga nada de otro origen
```

Other scripts (`typecheck:functions`, `format:check`, `emulators`, `emulate:social`, `screenshots`,
`build:share-card`) are described in the README («Scripts»).

**Presupuesto de arranque:** `ci-validate` vigila DOS números (`scripts/ci-validate.js`): **crítico** —el JS y el
CSS que bloquean el primer pintado, que es el que no debe crecer— y **total** —todo el precache, fuentes
incluidas, que solo mide lo que cuesta quedar listo para funcionar sin red—. Si el crítico sube, difiere algo con
`import()`; subir el tope es lo último y exige rehacer las mediciones que ese fichero documenta.

**Definition of done for a change:** `npm run typecheck` ✓, `npm run validate` ✓, `npm run test` ✓ (and `npm run build` for anything structural; `validate` measures the `dist` that exists, so build first when the bundle matters). If you touch `firestore.rules`, also `npm run test:rules`.

**Y si el cambio depende del LAYOUT del navegador** (scroll, alturas, posiciones, service worker, chunks perezosos): además `npm run build` **y** `npm run test:e2e`. En jsdom no hay layout —`window.scrollY` vale siempre 0—, así que un test de componente puede pasar con la funcionalidad rota. Ocurrió con la restauración del scroll al volver atrás: verde en jsdom, rota en el navegador.

**Depurar en un e2e:** el build de producción elimina los `console.*` (`dropConsole: true` en `vite.config.ts`), así que para instrumentar hay que usar una variable global (`window.__lo_que_sea`) y leerla con `page.evaluate`. Y recuerda **reconstruir** antes de volver a lanzar Playwright: `vite preview` sirve `dist/`, no las fuentes.

CI: **`.github/workflows/ci.yml`** runs parallel jobs (Node from `.nvmrc`): `checks` (build → `npm run typecheck`
→ `validate` → `audit:privacy` → `npm audit`), `unit` (`test:coverage` + Codecov), `rules` (`test:rules` on the
Firestore emulator), `e2e` (build + Playwright in 3 `--shard`s) and `overflow-flag` (`gistOverflow.test.ts` with
the flag on). The scripts `migrate:dry` and `size` do not exist — do not run them.

**Before deploying**, the README checklist («Antes de desplegar») is not optional — each step is there because of
an incident: bump the version (+ close `[Unreleased]` in the CHANGELOG), `npm run audit:rules`, deploy Firestore
rules and indexes (`firebase deploy --only firestore:rules,firestore:indexes`), and the full suite green
(`build`, `typecheck`, `validate`, `test`, `test:rules`, `test:e2e`).

---

## 10. How the `.github/` context is organized

- `copilot-instructions.md` *(this file)* — global, always‑on context. Mirrors `CLAUDE.md` and the README; the code is the source of truth.
- `instructions/*.instructions.md` — path‑scoped rules auto‑applied by `applyTo` glob (model / viewmodel / view / core / styles / tests).
- `prompts/*.prompt.md` — task templates for real work: `new-component`, `new-feature`, `fix-bug`, `refactor`, `add-test`.
- `prompts/remediation-plan.prompt.md` — **historical** phased fix plan (June 2026 audit). Most of it is done; the
  current open findings and plan live in `docs/revision-general-2026-09.md`. Don't run it blindly.
- `agents/{dev,debug,review}.agent.md` — working agents that reflect the real stack.
