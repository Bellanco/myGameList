# Migration agents — adapted to the real stack (design still PLANNED)

> **Status:** the prompts/agents have been **adapted to the real codebase** (React 19 / hooks + Context /
> raw IndexedDB / SCSS / Firebase v12, real paths under `src/model/`, `src/viewmodel/`, `src/view/`).
> Paths, stack and script names now match reality. **The target *design* is still NOT implemented in code** —
> these agents orchestrate that future migration; they don't describe how the app works today.

| Agent | What it does | Real-stack caveats |
|-------|--------------|--------------------|
| `migrate.agent.md` | Orchestrates prompts 01→15, verifies each step | `npx tsc --noEmit` (no `typecheck` alias yet). Scripts `audit:privacy`/`test:rules`/`migrate:dry` are **created by** steps 12/10/08/15 — only invoked after. |
| `deploy-rules.agent.md` | Validates + deploys `firestore.rules` | Rules/`firebase.json`/emulator don't exist until step 10. Public collection is `profiles` (not `users`). `firebase-tools`/`@firebase/rules-unit-testing` are new deps — confirm first. |
| `validate-sync.agent.md` | End-to-end sync scenarios | Raw IndexedDB (no Dexie), ids are `number`, clock is `_ts`, public opt-in is `shared`, social file `myGameList.social.json`. Run as Vitest integration tests vs emulator. |
| `audit-privacy.agent.md` | Scans for private-data leaks | Real paths under `src/model/repository/` & `src/viewmodel/`. `localStorage` allowed only in `localRepository.ts`. `audit-report.json` requires step 12's script. |

**Current sensitive reality:** the live `profiles` doc still stores `email`/`uid`/`githubToken`/`gamesGistId`
(see `../../copilot-instructions.md` §5). Removing that is one of the goals of this migration (the index-only model
is the *target*, not the current state).

For day-to-day work use the real agents in `../` (`dev`, `debug`, `review`).
