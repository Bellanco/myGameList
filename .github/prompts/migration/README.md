# ⚠️ Future migration prompts — NOT the current architecture

> **Status: PLANNED / NOT IMPLEMENTED.** Nothing in this folder reflects how the app
> works today. Do **not** use these prompts as a description of the codebase.

These 15 numbered prompts (`01`–`15`) are a **roadmap for a future redesign**. They were
drafted against a **different/outdated stack** and reference files, fields, functions and
npm scripts that **do not exist** in the repository:

- Stack assumed here: React 18, Zustand, Dexie, Tailwind, Firebase v9.
  **Real stack:** React 19, hooks (`useState`/`useReducer`), raw IndexedDB, SCSS, Firebase v12. See `../../copilot-instructions.md` §2.
- Paths assumed here: `src/models/`, `src/gist/`, `src/firebase/`, `src/sync/`.
  **Real paths:** `src/model/types/`, `src/model/repository/`. See `copilot-instructions.md` §3.
- Concepts assumed here (chunks, `profileId` pseudonym, `snippet` split, Firestore
  index‑only, `firestore.rules`, per‑item `_v`/`_modified`/`deletedAt`) are **aspirational**.
  **Real model:** single‑file gists, `uid` used directly, full review stored, single `_ts` clock.

## How to use them
Only when explicitly advancing the migration. For each step:
1. Read the numbered prompt as a **goal**, not a spec.
2. **Translate every path/stack/field detail to the real project** (`copilot-instructions.md` §2–§7).
3. Confirm before adding dependencies or changing storage layout.

The companion orchestration agents live in `../../agents/migration/` and carry the same caveats.
