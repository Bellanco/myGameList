---
agent: agent
description: "Añadir o ampliar tests (Vitest) en Mis Listas"
---

# Tests para: ${input:target}

## Contexto
Lee `.github/copilot-instructions.md` (§4 modelo, §5 repository, §9 comandos) y
`.github/instructions/tests.instructions.md`.

## Qué cubrir
${input:description}

## Reglas
- Runner: **Vitest** (`globals: true`, `jsdom`). Aun así, todos los tests existentes importan
  `describe/it/expect/vi` de `'vitest'`: haz lo mismo.
- Ubicación:
  - lógica pura / merge / sanitize → `tests/unit/`
  - componentes React sobre jsdom → `tests/component/`
  - reglas de Firestore → `tests/integration/firestore.rules.test.ts` (`npm run test:rules`; fuera de Vitest normal)
  - lo que dependa del layout del navegador (scroll, alturas, service worker, chunks) → `tests/e2e/`
    (Playwright, contra el build: `npm run build && npm run test:e2e`)
- Testea **funciones exportadas reales**, no reimplementes la lógica.
- Mockea red (Gist/Firestore) en la frontera del repository — nunca llames a APIs reales.
- Casos de borde obligatorios para sync: `_ts` en conflicto, tombstones en `deleted[]`,
  datos legacy/vacíos, respuesta ETag `304`.
- Determinista: sin timers/fechas/red reales.
- Sigue el estilo de `tests/unit/sanitize.test.ts` y `tests/unit/syncRepository.test.ts`.

## Verificación
```bash
npm run test          # o: npm run test:coverage
npm run typecheck
```
