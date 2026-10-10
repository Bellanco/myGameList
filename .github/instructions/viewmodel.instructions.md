---
applyTo: "src/viewmodel/**"
---

# ViewModel layer (`src/viewmodel/`)

- ViewModels are **React custom hooks** named `use{Feature}ViewModel` (or `use*` hooks inside `social/`, `premios/`) — **not classes**. State via `useState`/`useReducer` inside the hook.
- Consume the repository layer (`src/model/repository/`). Don't call `fetch`, IndexedDB, the Gist API, or Firestore directly from here; new persistent state goes through a repository. (A few hooks keep small `localStorage` marks inline — e.g. `useAchievements`, `usePremiosVoting` — don't extend that pattern.)
- Main hooks: `useGameListViewModel()` (list/filter/sort/CRUD, `GameDraft`, `LookupData`, `TabAction`), `useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist })` (exposes `SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'`; the sync engine itself is lazy‑loaded from `model/repository/syncEngine.ts`), `useSocialViewModel` (split into `social/use*`), `useStatsViewModel`, `useAdminViewModel`, `useShareViewModel`, `useAchievements`, and the `premios/use*` hooks.
- **Immutable updates only** — spread/clone, never mutate state objects/arrays. This matters for the CRDT payload.
- Clean up every effect: clear intervals/timeouts, close `BroadcastChannel`, unsubscribe — in the `useEffect` return.
- Watch for stale closures in `useCallback`/`useEffect` deps: the getters `App.tsx` passes to `useSyncViewModel` read refs (`dataRef.current`), not a render snapshot — an edit made during an in‑flight sync cycle was reverted when they didn't. Avoid kicking off overlapping sync cycles; for async actions triggered by a button, `useSingleFlight` drops repeated calls while one is in flight.
- Surface errors via `onNotice` / `StatusNotice` — don't swallow them.

Verify: `npm run typecheck` and `npm run test`.
