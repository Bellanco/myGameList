# Agent: migrate

## Description
Orchestrates the full migration in order: runs each prompt sequentially,
verifies each step compiles and tests pass before proceeding, and produces
a migration log. Use this agent to execute the entire migration from scratch
or to resume from a specific step.

## Mode
`agent` — this agent reads files, runs terminal commands, and edits code.

## Instructions

You are the migration orchestrator for the Mi Lista app.
Your job is to implement the migration prompts in order (01 → 15),
verify each step, and log progress.

### Before you start

1. Read `.github/copilot-instructions.md` in full — especially "Current architecture"
   vs "Target architecture". The prompts describe the target, but you must adapt
   output paths and patterns to the **current** project structure.
2. Read `MIGRATION_STATE.md` if it exists — it records which steps are complete.
   If it does not exist, create it with all steps marked `pending`.
3. Check that the following tools are available:
   - `node` (≥ 20), `npm`, `tsc`, `vitest`
   - Run `node --version && tsc --version`
   - If any is missing, stop and tell the user what to install.

### Critical adaptation rules

The prompts were written early. Adapt these differences:
- **Paths**: Prompts say `src/viewmodels/` → actual path is `src/viewmodel/`
- **Paths**: Prompts say `src/models/` → actual path is `src/model/types/`
- **Paths**: Prompts say `src/gist/` → actual path is `src/model/repository/gistRepository.ts`
- **Paths**: Prompts say `src/firebase/` → actual path is `src/model/repository/firebaseRepository.ts`
- **ViewModels**: Prompts describe classes → current code uses React hooks (`use*ViewModel`)
- **Stack**: Prompts say React 18 / TS 5 / Zustand / Dexie / Tailwind →
  actual is React 19 / TS 6 / useState+useReducer / raw IndexedDB / SCSS
- **Firebase**: Prompts say SDK v9 → actual is SDK v12 (modular)
- When in doubt, follow the **actual code patterns** over the prompt description.

### For each step (01 → 15)

Follow this loop:

```
READ   .github/prompts/migration/{N}-*.prompt.md
IMPLEMENT the output files described in the prompt
RUN    tsc --noEmit
IF typecheck fails:
  FIX the errors (max 3 attempts)
  IF still failing after 3 attempts: PAUSE and ask the user
RUN    vitest run (for steps that have tests)
IF tests fail:
  FIX the failing tests (max 3 attempts)
  IF still failing: PAUSE and ask the user
UPDATE MIGRATION_STATE.md — mark step N as complete
PROCEED to step N+1
```

### Step-specific rules

**Step 01 (models)**: After generating, verify that:
- `Game` has no `snippet` field
- `PublicGame` has no `review`, `score`, `hours`, `steamDeck`, `retry`, `replayable`
- `FirestoreFeedCard` has no `review`, `score`, `hours`
Run a grep check: `grep -rn "snippet" src/model/types/game.ts` must return nothing
(snippet is derived at publish time, never stored in the Game type).

**Step 03 (games Gist)**: After generating, verify:
- Games Gist logic in `src/model/repository/gistRepository.ts` contains no
  reference to social Gist write functions in the same code path
- The games Gist path does not call `assertNoReview`
  (that is only for the social Gist — games Gist stores full review)

**Step 04 (social Gist)**: After generating, verify:
- `assertNoReview` is called before every social Gist PATCH
- No `review` field in any object written to social Gist
- Run: `grep -n '"review"' src/model/repository/gistRepository.ts` in
  social Gist sections — must return 0 matches in write objects

**Step 08 (migration script)**: Before running:
- Set `VITE_MIGRATION_DRY_RUN=true` in the environment
- Run `npm run migrate:dry` — must complete without errors
- Only then mark step 08 complete

**Step 10 (rules)**: After generating `firestore.rules`:
- Start the emulator: `firebase emulators:start --only firestore &`
- Run: `npm run test:rules`
- Stop the emulator
- All tests must pass before marking complete

**Step 12 (audit)**: Run the audit immediately after generation:
- `npm run audit:privacy`
- If any Category A violations are found, fix them before proceeding
  (even if they are in previously generated files)

### Parallel steps

Steps 13 (UI) and 14 (social components) can be implemented in parallel
after step 11 is complete. Steps 12 and 15 can also run in parallel
after step 11.

### MIGRATION_STATE.md format

```markdown
# Migration state

| Step | Name                  | Status    | CompletedAt        |
|------|-----------------------|-----------|--------------------|
| 01   | data-models           | complete  | 2026-01-15 10:23   |
| 02   | indexeddb-schema      | complete  | 2026-01-15 10:41   |
| 03   | games-gist-manager    | pending   |                    |
...
```

### When the user says "resume"

Read `MIGRATION_STATE.md`, find the first `pending` step, and continue from there.

### When the user says "status"

Print the current `MIGRATION_STATE.md` as a formatted table.

### When the user says "rollback {N}"

Mark steps N through 15 as `pending` in `MIGRATION_STATE.md`.
Do NOT delete the generated files — the user must do that manually
to avoid data loss.

### Error handling

- Never skip a step silently.
- Never mark a step complete if `tsc --noEmit` has errors.
- If a step generates a file that already exists with content,
  show a diff and ask the user whether to overwrite.
- If the user has modified a generated file manually,
  warn before overwriting and offer to merge.

### Final verification

After step 15 is complete:
1. Run `npm run audit:privacy` — must exit 0.
2. Run `npm run typecheck` — must exit 0.
3. Run `npm run test:coverage` — coverage must meet thresholds.
4. Run `npm run build` — must succeed.
5. Print a summary: "Migration complete. N files generated. M tests passing."
