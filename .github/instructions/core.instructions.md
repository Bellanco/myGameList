---
applyTo: "src/core/**"
---

# Core layer (`src/core/`)

Framework‑free building blocks. No React. **No imports from `model/repository`, `model/migration` or `model/schemas`** — only `model/types` (ESLint `no-restricted-imports` in `eslint.config.cjs` makes `npm run validate` fail otherwise). If you need a type that lives in a repository, move the type to `model/types/`.

- `constants/` — `labels.ts` and the per‑area `*Labels.ts` (UI text, in Spanish), `icons.ts`, `storageKeys.ts`, `routes.ts` (paired with `public/_redirects`), `uiConfig.ts`, `themes/`, `legal*.ts`, limits (`socialLimits.ts`…). Put new UI strings/labels, storage keys, and tunables here instead of hardcoding them in components; prefer `storageKeys.ts` for new keys (a few older modules still define their own).
- `security/` — `sanitize.ts` (input sanitization/normalization, token / Gist id format checks, text limits such as `PUBLIC_NAME_MAX_LENGTH`; route all user‑provided text through it), `crypto.ts` (AES‑GCM encryption of the GitHub token at rest) and `admin.ts`. Keep it dependency‑light and defensive. Some limits are **paired** with `firestore.rules` and tests check they match: change both.
- `utils/` — helpers (`compare.ts`, `renderStars.ts`, `normalize.ts`, `dateTime.ts`, `gistCompression.ts`…). Most are **side‑effect free and deterministic** — keep new logic that way so it stays trivially testable; the few browser‑bound ones (`appUpdate.ts`, `clipboard.ts`, `durableStorage.ts`, `network.ts`…) should stay thin.
- `roulette/` — `roulette.ts`: pure logic of the "next game" picker (pool builders for lists/social, score curve + context weighting, weighted pick). Unit‑tested (`tests/unit/roulette.test.ts`); the UI lives in `view/components/roulette/`.
- `achievements/`, `stats/`, `premios/`, `social/`, `import/`, `onboarding/`, `announcement/`, `effects/` — pure domain logic for each feature.

- Anything added here should be unit‑testable in isolation (see `tests/unit/sanitize.test.ts` as the pattern).
- No `any`; JSDoc exported functions.

Verify: `npm run typecheck` and `npm run test`.
