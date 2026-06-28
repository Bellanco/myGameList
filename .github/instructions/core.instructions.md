---
applyTo: "src/core/**"
---

# Core layer (`src/core/`)

Pure, framework‑free building blocks. No React, no repository imports.

- `constants/` — `icons.ts`, `labels.ts`, `storageKeys.ts`, `uiConfig.ts`. Put new UI strings/labels, storage keys, and tunables here instead of hardcoding them in components. Storage keys live in `storageKeys.ts` only.
- `security/` — `sanitize.ts` (input sanitization/normalization; route all user‑provided text through it) and `crypto.ts`. This is the place for validation of formats like the GitHub token / Gist id. Keep it dependency‑light and defensive.
- `utils/` — pure helpers (`compare.ts`, `renderStars.ts`). Functions here must be **side‑effect free and deterministic** so they stay trivially testable.
- `roulette/` — `roulette.ts`: pure logic of the "next game" picker (pool builders for lists/social, score curve + context weighting, weighted pick). Framework‑free and unit‑tested (`tests/unit/roulette.test.ts`); the UI lives in `view/components/roulette/`.

- Anything added here should be unit‑testable in isolation (see `tests/unit/sanitize.test.ts` as the pattern).
- No `any`; JSDoc exported functions.

Verify: `npx tsc --noEmit` and `npm run test`.
