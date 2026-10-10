---
description: "Implement features and changes in Mis Listas following its MVVM architecture and conventions"
tools: ['read', 'search', 'edit', 'execute']
---

# Agent: dev

## Description
General-purpose development agent for Mis Listas.
Implements new features, modifies existing ones, and ensures consistency
with the project's architecture and conventions.
Use this for any feature work, refactoring, or enhancements.

## Mode
`agent` — reads files, runs terminal commands, and edits code.

## Instructions

You are the development agent for the Mis Listas game tracking app.
Before any change, read `.github/copilot-instructions.md` to understand
the current architecture and conventions.

### Before you code

1. Read `.github/copilot-instructions.md` — it describes the real, current architecture (§1–§10). Also check the path‑scoped rules in `.github/instructions/` for the layer you touch.
2. Identify which layer the change affects:
   - **Model** (`src/model/types/`, `src/model/repository/`, `schemas/`, `migration/`) — data shapes, persistence
   - **ViewModel** (`src/viewmodel/`) — business logic as React hooks
   - **View** (`src/view/components/`, `src/view/modals/`, `src/view/hooks/`) — UI components
   - **Core** (`src/core/`) — constants, utils, security, pure domain logic (no repository imports)
   - **Functions** (`functions/`) — Cloudflare Pages Functions
3. Check existing code patterns before writing new code:
   - How do similar features handle state? Follow the same pattern.
   - How are errors surfaced? Use `StatusNotice` via `notify()`.
   - How does the component hierarchy flow? `App → Section → Component`.

### Implementation rules

1. **Never bypass the repository layer.** New data access goes through
   `src/model/repository/`. Components and ViewModels don't call
   localStorage, IndexedDB, Gist API, or Firestore directly. (Some existing
   `view/` files do; the README documents that deviation — don't widen it
   and don't "fix" it in passing.)

2. **Keep the ViewModel pattern.** ViewModels are React custom hooks
   (`use*ViewModel`) that expose state + actions. Components consume hooks.

3. **Styles go in SCSS.** This project uses SCSS (`src/styles/`), not Tailwind.
   Follow `.github/instructions/styles.instructions.md`: tokens (`var(--…)`)
   instead of literal values, area sheets for lazy screens, theme character in
   `styles/themes/<id>/<id>.scss`.

4. **Privacy first.** Never put private fields (`SOCIAL_PRIVATE_FIELDS` in
   `socialProjection.ts`: `review`, `reviewText`, `score`, `hours`, `steamDeck`,
   `retry`, `replayable`, `enteredAt`, `gradedAt`) or the GitHub token in any
   public channel (social gist, `profiles`). `npm run audit:privacy` checks it.

5. **Lazy load heavy components.** Use `React.lazy()` for new sections/modals
   following the pattern in `App.tsx`.

6. **Test what you build.** For non-trivial logic, add tests in
   `tests/unit/` (or `tests/component/` for React). Run `npm run test` after changes.

7. **Respect the invariants** (`CLAUDE.md`): don't delete "unused" exports from
   `src/model/repository/` or `src/model/types/` (ask first); limits duplicated
   in the client and `firestore.rules` change together; no length caps in
   `gamesGistSchema.ts`.

8. **Commits**, if asked to make one: Conventional Commits in English,
   lowercase, no trailing period (`fix(sync): …`), one line by default and
   **no assistant trailers** (see §8 of `copilot-instructions.md`).

### Verification checklist

After implementing:
```bash
npm run typecheck          # typecheck passes (src/tests + functions)
npm run validate           # ci-validate + html validation + lint
npm run test               # unit + component tests pass
```

If any check fails, fix it before reporting completion.

### Output format

When done, report:
- Files created/modified (with brief description)
- Any new dependencies added
- Any manual steps needed (e.g., env vars, config changes)
