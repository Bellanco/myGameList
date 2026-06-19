# ⚠️ Migration agents — for FUTURE work only

> **Status: PLANNED / NOT IMPLEMENTED.** These agents orchestrate the future redesign in
> `../../prompts/migration/`. They reference commands, files and infrastructure that **do
> not exist** in the repo today and must not be run as‑is.

| Agent | Assumes (NOT present today) |
|-------|------------------------------|
| `migrate.agent.md` | `MIGRATION_STATE.md`, prompt paths, `npm run typecheck`/`migrate:dry`/`audit:privacy`/`test:rules` |
| `deploy-rules.agent.md` | `firestore.rules`, Firebase emulator, `npm run test:rules` |
| `validate-sync.agent.md` | chunks, `profileId`, `snippet`, `_v`/`_modified`, emulator, `publishSocial`/`distributeIntoChunks` |
| `audit-privacy.agent.md` | `npm run audit:privacy`, `audit-report.json`, snippet split, Firestore index‑only |

**Reality check:** the only npm scripts that exist are `dev build preview validate lint test
test:all test:watch test:coverage` (+ `npx tsc --noEmit`). The live Firestore `profiles` doc
**does** store `email`/`uid`/`githubToken` (the audit‑privacy agent assumes it must not — that
is the *target*, not the current state). See `../../copilot-instructions.md` §5 and §10.

For day‑to‑day work use the real agents in `../` (`dev`, `debug`, `review`).
