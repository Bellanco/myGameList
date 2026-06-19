---
mode: agent
description: "Añadir o ampliar tests (Vitest) en Mi Lista"
---

# Tests para: {{target}}

## Contexto
Lee `.github/copilot-instructions.md` (§4 modelo, §5 repository, §9 comandos) y
`.github/instructions/tests.instructions.md`.

## Qué cubrir
{{description}}

## Reglas
- Runner: **Vitest** (`globals: true`, `jsdom`). No hace falta importar `describe/it/expect/vi`.
- Ubicación:
  - lógica pura / merge / sanitize → `tests/unit/`
  - varios módulos juntos → `tests/integration/`
  - humo de UI → `tests/e2e/`
- Testea **funciones exportadas reales**, no reimplementes la lógica.
- Mockea red (Gist/Firestore) en la frontera del repository — nunca llames a APIs reales.
- Casos de borde obligatorios para sync: `_ts` en conflicto, tombstones en `deleted[]`,
  datos legacy/vacíos, respuesta ETag `304`.
- Determinista: sin timers/fechas/red reales.
- Sigue el estilo de `tests/unit/sanitize.test.ts` y `tests/unit/syncRepository.test.ts`.

## Verificación
```bash
npm run test          # o: npm run test:coverage
npx tsc --noEmit
```
