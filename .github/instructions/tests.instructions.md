---
applyTo: "tests/**"
---

# Tests (`tests/`)

- Runner is **Vitest** (`globals: true`, `jsdom` environment). Files: `tests/**/*.test.ts` (and colocated `src/**/*.test.ts`).
- Layout real, con lo que ejecuta cada uno:
  - `tests/unit/` — lógica pura (merge CRDT, sanitizado, sync, endpoints de `functions/`).
  - `tests/component/` — React sobre **jsdom**. Es el grueso de las pruebas de interfaz.
  - `tests/integration/`, `tests/emulacion/` — **excluidos** de la configuración de Vitest; se lanzan aparte.
  - `tests/e2e/` — **Playwright**, no Vitest, y contra el **build de producción** servido por `vite preview`.
- `npm run test` = `vitest run tests/unit tests/component src` (lo de cada commit).
  `npm run test:all` = `vitest run` y **NO incluye e2e ni integration**: `vitest.config.js` los excluye. Decir
  «he pasado los e2e» tras un `test:all` es falso.
  `npm run test:e2e` = `playwright test`. **Reconstruye antes** (`npm run build`): sirve `dist/`, no las fuentes.
- Use the global `describe/it/expect/vi` (no imports needed thanks to `globals: true`).
- **The merge/sync logic is the highest‑value thing to test** — when you touch `syncRepository.ts` / `syncMachineRepository.ts`, add or extend tests there (`tests/unit/syncRepository.test.ts`, `tests/unit/syncMachineRepository.test.ts`).
- Prefer testing real exported functions over reimplementing logic. Mock network (Gist/Firestore) at the repository boundary; don't hit real APIs.
- Cover edge cases: empty/legacy data shapes, conflicting `_ts`, tombstones in `deleted[]`, ETag `304` paths.
- Keep tests deterministic — no real timers/dates/network. Match existing test style.

## Qué NO puede probar jsdom

No hay layout: `window.scrollY` vale siempre 0, no hay alturas, no hay `scrollIntoView`, no hay service worker ni
chunks reales. **Todo lo que dependa de eso va a `tests/e2e/`**, o el test pasa en verde con la funcionalidad
rota — que es exactamente lo que ocurrió con la restauración del scroll al volver atrás (`scroll.test.ts`).

Para depurar dentro de un e2e, `console.*` no vale: el build de producción los elimina (`dropConsole` en
`vite.config.ts`). Usa una variable global (`window.__algo`) y léela con `page.evaluate`.

Verify: `npm run test` (or `npm run test:coverage`). Y `npm run build && npm run test:e2e` si tocas layout.
