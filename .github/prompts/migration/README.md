# Migration prompts — adapted to the real stack (target design still PLANNED)

> **Status:** these 15 numbered prompts (`01`–`15`) have been **adapted to the real codebase**.
> Paths, stack and npm scripts now target the actual project. They describe the **transformation FROM
> the current architecture TO a more modern, secure and efficient one** — the target design is the goal,
> not a description of today's code.

## What the prompts now assume (the real stack)
- React 19, hooks (`useState`/`useReducer`) + Context (no Zustand), **raw IndexedDB** (no Dexie),
  SCSS (no Tailwind), Firebase v12 modular, TypeScript 6, Vite 8, Vitest 4. See `../../copilot-instructions.md` §2.
- Real paths: `src/model/types/`, `src/model/repository/`, `src/viewmodel/`, `src/view/`. See §3.
- Real model preserved as the starting point: `GameItem` with `id: number` and `_ts` clock, `TabData`
  buckets `c|v|e|p`, tombstones in `TabData.deleted`. Single-file gists `myGames.json` / `myGameList.social.json`.

## What is the TARGET design (introduced by these prompts, not yet in code)
- **review/snippet split** — public channel stores only a ≤160-char `snippet`, never `review`/`score`/`hours`.
- **`profileId`** (UUID v4 pseudonym) for all public data instead of `uid`.
- **Firestore index-only** — token/email out of Firestore (today they ARE stored — §5/§10).
- **Gist chunking**, **`firestore.rules`** + emulator tests, guards `assertNoPrivateFields`/`toPublicGame`,
  optional additive per-item `_v`/`deletedAt` (keeping `_ts` as the base clock).

## How to use them
Only when actively advancing the migration. For each step: read the prompt as the goal, implement against
the real paths/stack, run `npx tsc --noEmit` + `npm run test`, and **confirm before adding any new dependency**
(`firebase-tools`, `@firebase/rules-unit-testing`, `fake-indexeddb`) or changing storage layout.
The orchestration agents live in `../../agents/migration/`.
