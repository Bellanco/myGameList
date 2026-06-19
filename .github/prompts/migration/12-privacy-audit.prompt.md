# Prompt 12 — Privacy audit

## Prerequisites
Prompts 01–11 complete. All source files exist in `src/`.

## Task
Perform a full static audit of the codebase before running the migration.
Find every place where private data could leak into public channels.
Output a structured report and fix all issues found.

## Output files
- `src/__tests__/privacy-audit.test.ts`
- `scripts/audit-privacy.ts`  ← runnable standalone script

---

## What counts as a violation

### Category A — Critical (block migration)
A field from this list appears in an object that is written to:
- The social Gist (`social-main.json` / `social-chunk-N.json`)
- Any Firestore collection other than `/privateConfig`
- Any HTTP response body sent to a non-owner

Forbidden fields: `review`, `score`, `hours`, `steamDeck`, `retry`,
`replayable`, `uid`, `email`, `githubToken`, `gamesGistId`, `photoURL`.

### Category B — Warning (fix before release)
- A `snippet` field computed inside a ViewModel (should only be in `socialGistManager`).
- A direct `fetch('https://api.github.com')` call outside `src/gist/`.
- A direct `setDoc` / `updateDoc` / `addDoc` call outside `src/firebase/`.
- A `localStorage.setItem` call anywhere (all persistence must be IndexedDB).
- A `console.log` that could print a token or uid.

### Category C — Info (document but do not block)
- Any `TODO` or `FIXME` comment related to sync or privacy.
- Any `as any` cast in a function that handles game data.

---

## `scripts/audit-privacy.ts`

Implement as a Node.js script using the TypeScript compiler API or
simple regex scanning. It must:

1. Recursively scan all `.ts` and `.tsx` files under `src/`.
2. For each file, check for Category A violations using AST analysis:
   - Find all object literals or `set()`/`update()` calls where a
     forbidden field name appears as a key.
   - Track whether the surrounding function is in a module that writes
     to Firestore or the social Gist.
3. Check for Category B violations using regex:
   ```ts
   const B_PATTERNS = [
     { pattern: /snippet\s*[:=]/g,        file: /ViewModel\.ts$/, message: 'snippet computed in ViewModel' },
     { pattern: /fetch\(['"]https:\/\/api\.github/g, notFile: /gistManager/, message: 'Gist API call outside gistManager' },
     { pattern: /setDoc|updateDoc|addDoc/g, notFile: /Repository/, message: 'Firestore write outside repository' },
     { pattern: /localStorage\.setItem/g,  message: 'localStorage write — use IndexedDB' },
     { pattern: /console\.log.*token|console\.log.*uid/gi, message: 'Potential token/uid leak in console.log' },
   ];
   ```
4. Output a JSON report to `audit-report.json`:
   ```json
   {
     "runAt": "<ISO timestamp>",
     "summary": { "critical": 0, "warnings": 0, "info": 0 },
     "violations": [
       {
         "category": "A",
         "file": "src/viewmodels/GameDetailViewModel.ts",
         "line": 42,
         "field": "score",
         "context": "setDoc(ref, { score: game.score, ... })",
         "message": "Private field 'score' in Firestore write"
       }
     ]
   }
   ```
5. Exit with code 1 if any Category A violations are found.
6. Exit with code 0 if only B or C violations exist (but still print them).

Add an npm script:
```json
"audit:privacy": "tsx scripts/audit-privacy.ts"
```

---

## `src/__tests__/privacy-audit.test.ts`

Unit tests for the audit script logic itself.

```ts
describe('detectForbiddenFields', () => {
  it('flags score in an object passed to setDoc', () => {
    const code = `setDoc(ref, { profileId: 'x', score: 5, displayName: 'Y' })`;
    const violations = detectForbiddenFields(code, 'test.ts');
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe('score');
    expect(violations[0].category).toBe('A');
  });

  it('does not flag score inside gamesGistManager', () => {
    const code = `const payload = { score: game.score };`;
    const violations = detectForbiddenFields(code, 'src/gist/gamesGistManager.ts');
    expect(violations).toHaveLength(0);
  });

  it('flags review in social Gist write', () => {
    const code = `patchGist(id, filename, { games: { id1: { review: 'text' } } })`;
    const violations = detectForbiddenFields(code, 'src/gist/socialGistManager.ts');
    expect(violations[0].field).toBe('review');
  });

  it('flags snippet computation in ViewModel', () => {
    const code = `const snippet = game.review.slice(0, 160);`;
    const warnings = detectPatternB(code, 'src/viewmodels/GamesListViewModel.ts');
    expect(warnings[0].message).toContain('snippet computed in ViewModel');
  });

  it('flags direct fetch to GitHub API outside gistManager', () => {
    const code = `fetch('https://api.github.com/gists/123')`;
    const warnings = detectPatternB(code, 'src/sync/syncManager.ts');
    expect(warnings[0].message).toContain('Gist API call outside gistManager');
  });
});
```

---

## Integration with CI

Add to `.github/workflows/ci.yml` (created in Prompt 15):
```yaml
- name: Privacy audit
  run: npm run audit:privacy
  # Fails the build on any Category A violation
```

## Constraints
- The script must run without the app being built — pure static analysis.
- No false positives on comments (`// score: ...` must not trigger).
- The report file `audit-report.json` must be gitignored.
- Add `audit-report.json` to `.gitignore`.
