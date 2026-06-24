# Prompt 15 — CI pipeline & workspace config

> Adaptado al stack real (Vitest 4 · jsdom · Cloudflare Pages para la app · Firebase solo para reglas). Diseño destino conservado.
>
> **Punto de partida real:** **ya existe** `.github/workflows/ci.yml` (build → `tsc --noEmit` → tests → coverage → `validate` → `npm audit`).
> El typecheck real es `npx tsc --noEmit` (**no** hay alias `typecheck`). La app se despliega en **Cloudflare Pages** (`wrangler.toml`),
> no en Firebase Hosting. Scripts reales: `dev build preview validate lint test test:all test:watch test:coverage`.
> Este paso **extiende** ci.yml y **añade** los scripts nuevos que crean los pasos previos.

## Prerequisites
Prompts 01–14 completos.

## Output files
- `.github/workflows/ci.yml`           — **ya existe**: añadir jobs `audit` y `rules-test`
- `.github/workflows/deploy-rules.yml`  — nuevo (solo reglas de Firestore)
- `vitest.config.ts`                    — **ya existe**: ajustar coverage a rutas reales
- `firebase.json` + `firestore.indexes.json` — nuevos (raíz)
- `.vscode/settings.json` + `.vscode/extensions.json`
- `.env.example`
- `package.json` (solo la sección scripts — fusionar con la existente)

---

## `ci.yml` — añadir a lo existente (no reescribir lo que funciona)
Conservar los pasos actuales (`build`, `tsc --noEmit`, `test`, `test:coverage`, `validate`, `npm audit`) y añadir:
```yaml
  audit:
    name: Privacy audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run audit:privacy        # exit 1 en cualquier violación Categoría A

  rules-test:
    name: Firestore rules tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm install -g firebase-tools
      - run: firebase emulators:exec --only firestore "npm run test:rules"
```
> El job `build`/lint/test existente debe depender de `audit` (`needs: audit`). El despliegue de la **app** sigue en Cloudflare Pages (no tocar).

## `deploy-rules.yml` (nuevo — solo reglas)
```yaml
name: Deploy Firestore Rules
on:
  workflow_dispatch:
  push: { branches: [master], paths: ['firestore.rules'] }   # rama por defecto real: master
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g firebase-tools
      - run: firebase emulators:exec --only firestore "npm run test:rules"   # deben pasar antes
        env: { FIREBASE_TOKEN: ${{ secrets.FIREBASE_CI_TOKEN }} }
      - run: firebase deploy --only firestore:rules
        env: { FIREBASE_TOKEN: ${{ secrets.FIREBASE_CI_TOKEN }} }
```

## `vitest.config.ts` (ajustar coverage a rutas reales)
```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'html'],
  include: ['src/model/**', 'src/model/repository/**', 'src/viewmodel/**'],
  thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
},
// environment: 'jsdom'  (el proyecto usa jsdom, no happy-dom)
```
Si se necesita mock de IndexedDB en tests, `fake-indexeddb` es **dep nueva** → confirmar antes de instalar.

## `firebase.json` + `firestore.indexes.json` (raíz)
```json
{ "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": true, "port": 4000 } } }
```
Índices del feed: `(status, expiresAt, createdAt desc)` y `(profileId, status, createdAt desc)`.

## `.vscode/extensions.json` (sin Tailwind)
Recomendar: `GitHub.copilot`, `GitHub.copilot-chat`, `dbaeumer.vscode-eslint`, `vitest.explorer`, `usernamehw.errorlens`.
**Quitar** `bradlc.vscode-tailwindcss` (no se usa Tailwind). Prettier solo si el proyecto lo adopta (hoy el formato lo lleva ESLint).

## `.vscode/settings.json`
Mantener `editor.codeActionsOnSave.source.fixAll.eslint`, `typescript.tsdk`, asociaciones `*.prompt.md`/`*.agent.md` → markdown,
`search.exclude` de `node_modules`/`dist`/`audit-report.json`, y el enlace a `.github/copilot-instructions.md`.

## `package.json` — scripts a añadir (fusionar, no borrar los reales)
```json
{
  "typecheck":     "tsc --noEmit",
  "test:rules":    "vitest run tests/unit/firestore.rules.test.ts",
  "audit:privacy": "node scripts/audit-privacy.js",
  "migrate:dry":   "VITE_MIGRATION_DRY_RUN=true vitest run tests/integration/migration.dry.test.ts",
  "emulators":     "firebase emulators:start --only firestore"
}
```
> `audit:privacy` usa **node** (estilo `scripts/ci-validate.js`), no `tsx` (evita dep nueva). `migrate:dry` se valida vía un test
> de integración en modo dry-run (sin runner nuevo). Conservar todos los scripts existentes (`dev build preview validate lint test …`).
> No añadir `size-check`/`bundlesize` salvo que el usuario lo pida (dep nueva).

## `.env.example`
```
# Firebase — config pública (segura de commitear)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Flags
VITE_MIGRATION_DRY_RUN=false
VITE_USE_EMULATOR=false

# NUNCA aquí (viven solo en IndexedDB): GITHUB_TOKEN (PAT), GIST_ID, FIREBASE_UID
```
> No hay `VITE_GITHUB_CLIENT_ID`: GitHub no es proveedor de Firebase Auth (se usa un PAT introducido por el usuario).
> Cabecera: "Copia a `.env.local` y rellena. NUNCA commitees `.env.local`. El token de GitHub y los Gist IDs van en IndexedDB, no aquí."

## Constraints
- `.env.local` y `audit-report.json` en `.gitignore`.
- El job `audit` corre antes que `lint`/`test`.
- `test:rules` usa el emulador de Firebase, nunca producción.
- Despliegue de la app: Cloudflare Pages (existente); Firebase solo para reglas.
- Confirmar antes de instalar deps nuevas (`firebase-tools`, `@firebase/rules-unit-testing`, `fake-indexeddb`).
