# Prompt 15 — CI pipeline & workspace config

## Prerequisites
Prompts 01–14 complete.

## Task
Create the GitHub Actions CI pipeline, VS Code workspace config,
and all project config files needed to run the full suite.

## Output files
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-rules.yml`
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `vitest.config.ts`
- `firebase.json`
- `.env.example`
- `package.json` (scripts section only — merge with existing)

---

## `.github/workflows/ci.yml`

Runs on every push and pull request to `main` and `develop`.

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  audit:
    name: Privacy audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Run privacy audit
        run: npm run audit:privacy
        # Exits 1 on any Category A violation

  lint:
    name: Lint & typecheck
    runs-on: ubuntu-latest
    needs: audit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    name: Unit tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Run tests with coverage
        run: npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with: { files: ./coverage/lcov.info }

  rules-test:
    name: Firestore rules tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Install Firebase CLI
        run: npm install -g firebase-tools
      - name: Run rules tests against emulator
        run: firebase emulators:exec --only firestore "npm run test:rules"
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_CI_TOKEN }}

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [test, rules-test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - name: Check bundle size
        run: npm run size-check
```

---

## `.github/workflows/deploy-rules.yml`

Manual trigger + auto on merge to `main`.

```yaml
name: Deploy Firestore Rules

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'firestore.rules'

jobs:
  deploy:
    name: Deploy rules
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Install Firebase CLI
        run: npm install -g firebase-tools
      - name: Run rules tests (must pass before deploy)
        run: firebase emulators:exec --only firestore "npm run test:rules"
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_CI_TOKEN }}
      - name: Deploy to Firebase
        run: firebase deploy --only firestore:rules
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_CI_TOKEN }}
```

---

## `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/models/**',
        'src/gist/**',
        'src/firebase/**',
        'src/migration/**',
        'src/sync/**',
        'src/db/**',
      ],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
        statements:80,
      },
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
```

Create `src/__tests__/setup.ts`:
```ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IndexedDB for tests
import 'fake-indexeddb/auto';

// Suppress console.error in tests (still fails if assertions fail)
vi.spyOn(console, 'error').mockImplementation(() => {});
```

---

## `firebase.json`

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

Create `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "feed",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status",    "order": "ASCENDING" },
        { "fieldPath": "expiresAt", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "feed",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "profileId", "order": "ASCENDING" },
        { "fieldPath": "status",    "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

## `.vscode/settings.json`

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,

  "github.copilot.chat.codeGeneration.instructions": [
    { "file": ".github/copilot-instructions.md" }
  ],

  "github.copilot.chat.agent.thinkingTool": true,

  "files.associations": {
    "*.prompt.md": "markdown",
    "*.agent.md":  "markdown"
  },

  "search.exclude": {
    "**/node_modules": true,
    "**/dist":         true,
    "audit-report.json": true
  },

  "[typescript]":  { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

---

## `.vscode/extensions.json`

```json
{
  "recommendations": [
    "GitHub.copilot",
    "GitHub.copilot-chat",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "vitest.explorer",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "usernamehw.errorlens"
  ]
}
```

---

## `package.json` — scripts to add/replace

```json
{
  "scripts": {
    "dev":            "vite",
    "build":          "tsc -b && vite build",
    "typecheck":      "tsc --noEmit",
    "lint":           "eslint src --ext .ts,.tsx --max-warnings 0",
    "lint:fix":       "eslint src --ext .ts,.tsx --fix",
    "test":           "vitest run",
    "test:watch":     "vitest",
    "test:coverage":  "vitest run --coverage",
    "test:rules":     "vitest run src/__tests__/firestore.rules.test.ts",
    "audit:privacy":  "tsx scripts/audit-privacy.ts",
    "migrate:dry":    "VITE_MIGRATION_DRY_RUN=true tsx src/migration/runMigration.ts",
    "size-check":     "npx bundlesize",
    "emulators":      "firebase emulators:start --only firestore"
  }
}
```

---

## `.env.example`

```
# Firebase — public config (safe to commit)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Feature flags
VITE_MIGRATION_DRY_RUN=false
VITE_USE_EMULATOR=false

# GitHub OAuth (Firebase provider — only client ID is public)
VITE_GITHUB_CLIENT_ID=

# Never put these in .env — they live in IndexedDB only:
# GITHUB_TOKEN, GIST_ID, FIREBASE_UID
```

Add a comment at the top:
```
# Copy to .env.local and fill in values.
# NEVER commit .env.local or any file containing real credentials.
# GitHub token and Gist IDs belong in IndexedDB, not here.
```

## Constraints
- `.env.local` and `audit-report.json` must be in `.gitignore`.
- The `audit` job in CI must run before `lint` and `test`.
- `test:rules` must use the Firebase emulator, not production.
- Bundle size limit: 500 KB gzipped for the main chunk.
