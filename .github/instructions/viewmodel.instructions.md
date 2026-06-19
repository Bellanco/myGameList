---
applyTo: "src/viewmodel/**"
---

# ViewModel layer (`src/viewmodel/`)

- ViewModels are **React custom hooks** named `use{Feature}ViewModel` — **not classes**. State via `useState`/`useReducer` inside the hook.
- Consume the repository layer (`src/model/repository/`). **Never** call `fetch`, `localStorage`, IndexedDB, the Gist API, or Firestore directly from here.
- Existing hooks: `useGameListViewModel()` (list/filter/sort/CRUD, `GameDraft`, `LookupData`, `TabAction`) and `useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist })` (exposes `SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'`).
- **Immutable updates only** — spread/clone, never mutate state objects/arrays. This matters for the CRDT payload.
- Clean up every effect: clear intervals/timeouts, close `BroadcastChannel`, unsubscribe — in the `useEffect` return.
- Watch for stale closures in `useCallback`/`useEffect` deps, and avoid kicking off overlapping sync cycles.
- Surface errors via `onNotice` / `StatusNotice` — don't swallow them.

Verify: `npx tsc --noEmit` and `npm run test`.
