---
applyTo: "tests/**"
---

# Tests (`tests/`)

- Runner is **Vitest** (`globals: true`, `jsdom` environment). Files: `tests/**/*.test.ts` (and colocated `src/**/*.test.ts`).
- Layout: `tests/unit/` (pure logic — CRDT merge, sanitize, sync), `tests/integration/` (cross‑module), `tests/e2e/` (smoke). `npm run test` runs unit + src; `npm run test:all` adds integration + e2e.
- Use the global `describe/it/expect/vi` (no imports needed thanks to `globals: true`).
- **The merge/sync logic is the highest‑value thing to test** — when you touch `syncRepository.ts` / `syncMachineRepository.ts`, add or extend tests there (`tests/unit/syncRepository.test.ts`, `tests/unit/syncMachineRepository.test.ts`).
- Prefer testing real exported functions over reimplementing logic. Mock network (Gist/Firestore) at the repository boundary; don't hit real APIs.
- Cover edge cases: empty/legacy data shapes, conflicting `_ts`, tombstones in `deleted[]`, ETag `304` paths.
- Keep tests deterministic — no real timers/dates/network. Match existing test style.

Verify: `npm run test` (or `npm run test:coverage`).
