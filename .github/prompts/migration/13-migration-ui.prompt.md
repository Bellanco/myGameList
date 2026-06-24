# Prompt 13 — Migration UI

> Adaptado al stack real (React 19 / hooks + Context / **SCSS, no Tailwind** / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** los componentes viven en `src/view/` (modales en `src/view/modals/`,
> p. ej. `FormModal`/`ConfirmModal`/`AdminModal`), los estilos en `src/styles/*.scss`, los iconos con `<Icon name="…" />`.
> El estado global es `AppContext` + `useReducer` (**no Zustand**). La lógica de migración está en
> `migrateRepository.ts` (paso 08). El modal se muestra cuando `state.migrationNeeded === true` tras el login.

## Prerequisites
Prompts 01–12 completos.

## Task
UI de migración: un modal que guía al usuario por el proceso one-time. No ejecuta la lógica: llama a `runMigration()` de `migrateRepository.ts`.

## Output files (rutas reales)
- `src/view/components/migration/MigrationModal.tsx`
- `src/view/components/migration/TokenInput.tsx`
- `src/view/components/migration/MigrationProgress.tsx`
- `src/view/components/migration/MigrationError.tsx`
- `src/styles/_migration.scss` (importado en `index.scss`)
- `tests/unit/MigrationModal.test.tsx`

## Pasos visibles (indicador arriba)
```
1 — Actualización de seguridad   (introducir token nuevo)
2 — Actualizar cuenta            (migrar doc Firestore: sacar token/email)
3 — Importar juegos              (migrar gist de juegos)
4 — Configurar social            (crear gist social)
5 — Listo                        (confirmar y entrar)
```

## `MigrationModal.tsx`
- Modal a pantalla completa en **portal** (`createPortal` a `document.body`), backdrop semitransparente.
- Estado de paso local con `useReducer`; lee `migrationStep`/`migrationError` de `AppContext`.
- No descartable (ni click fuera ni Escape). Render por paso: 1 → `<TokenInput/>`; 2–4 → `<MigrationProgress/>`; 5 → pantalla de éxito; error → `<MigrationError/>`.
- Banner en el paso 1 que explica el porqué (real): *"Una versión anterior guardaba tu token de GitHub de forma insegura en Firestore. Genera un token nuevo para continuar."* — esto es cierto y es el motivo de la migración.

## `TokenInput.tsx`
```tsx
interface TokenInputProps { onTokenSubmit: (token: string) => void; validating: boolean; error: string | null; }
```
- Input tipo password (toggle mostrar). Botón "Generar token nuevo" → abre
  `https://github.com/settings/tokens/new?scopes=gist&description=Mi%20Lista` en pestaña nueva.
- Texto: "Selecciona solo el scope 'gist'." Submit deshabilitado mientras `validating`. Spinner al validar.
- Error inline en rojo; al validar OK, check verde y autoavance al paso 2 tras 800ms.
- Validación (en el padre): `fetch('https://api.github.com/user', { headers: { Authorization: 'token '+token } })` → `res.ok`.

## `MigrationProgress.tsx`
```tsx
interface MigrationProgressProps { currentStep: number; totalSteps: number; stepLabel: string; detail: string | null; gamesCount: number | null; }
```
- Barra animada (transición CSS sobre width). Etiqueta "Importando juegos… (47 / 163)" si hay `gamesCount`.
- Sin botón cancelar (la migración no se cancela a mitad). Tiempo estimado si `gamesCount > 50`: `Math.ceil(gamesCount / 20)` s.

## `MigrationError.tsx`
```tsx
interface MigrationErrorProps { error: string; step: number; onRetry: () => void; onContactSupport: () => void; }
```
- Icono de error + mensaje. "Reintentar" → `onRetry`. "Contactar soporte" → URL de issue de GitHub prerrellenada.
- Si `step === 1`: guía sobre el scope del token. Si `step === 3`: "Tus datos están a salvo; la importación no ha modificado tu Gist existente."

## `tests/unit/MigrationModal.test.tsx`
- Renderiza `TokenInput` en el paso 1 (envolver con el provider de `AppContext`, no "StoreProvider").
- No cierra con Escape. Avanza al paso 2 tras token válido (mock `fetch` 200). Muestra error con token inválido (mock 401).

## Constraints
- Estilos en SCSS (`_migration.scss`), **sin Tailwind**, sin librería de animación (solo transiciones CSS).
- `TokenInput` nunca loguea el valor del token.
- La URL de "Generar token" incluye el scope `gist` preseleccionado.
- Modal en portal a nivel `document.body`. Lazy-load con `React.lazy` (patrón de `App.tsx`).
- `tsc --noEmit` y `npm run test` deben pasar tras este paso.
