# Migration prompts — adapted to the real stack

> **Status (2026-06-20): migración muy avanzada en `develop`.** La FUENTE ÚNICA de verdad sobre qué está hecho y qué
> falta es **`PENDING.md`** (checklist vivo); el roadmap consolidado end-to-end es **`MASTER-PLAN.md`**.
> Resumen: hecho y verde en CI (E1·M1·M2·M3·M4a·E2-base·F6.1·F6.3·E3 + **6.2a** profileId estable + **6.2b** uid→profileId
> en el gist social + **auto-upgrade del estado local** + **formato v4** del gist de juegos keyed+diccionarios GATED +
> slice F9 + tests). **6.4** (delta-sync) cerrada como no-aplicable.
> Pendiente: SOLO acciones de navegador/despliegue/2 dispositivos — Fase 0 (desplegar `firestore.rules`, revocar token,
> probar social), verificar 6.2a/6.2b/M3/E3 en navegador, **activar el formato v4** (flag, 2 pasos), y el resto de Fase 9.
>
> Estos 15 prompts numerados (`01`–`15`) son la **especificación/REFERENCIA original** de los pasos; su estado real
> consolidado vive en `PENDING.md`/`MASTER-PLAN.md`, no aquí.

## What the prompts now assume (the real stack)
- React 19, hooks (`useState`/`useReducer`) + Context (no Zustand), **raw IndexedDB** (no Dexie),
  SCSS (no Tailwind), Firebase v12 modular, TypeScript 6, Vite 8, Vitest 4. See `../../copilot-instructions.md` §2.
- Real paths: `src/model/types/`, `src/model/repository/`, `src/viewmodel/`, `src/view/`. See §3.
- Real model preserved as the starting point: `GameItem` with `id: number` and `_ts` clock, `TabData`
  buckets `c|v|e|p`, tombstones in `TabData.deleted`. Single-file gists `myGames.json` / `myGameList.social.json`.

## TARGET design — estado actual (✅ hecho / 🔶 parcial / ⏳ pendiente)
- ✅ **review/snippet split** — el canal social es index-only (solo `snippet` ≤160; nunca `review`/`score`/`hours`),
  reforzado con allowlist Zod (`assertValidSocialGist`, F6.1).
- ✅ **`profileId`** seudónimo en datos públicos en vez de `uid` (6.2a `96e0632` + 6.2b `f5ce4fb`): profileId estable entre
  dispositivos (recuperado de `privateConfig`/`userMap` al login) y el gist social ya identifica por `actorProfileId`/
  `fromProfileId` (no `uid`). ⏳ Falta verificar en 2 dispositivos.
- 🔶 **Firestore**: token YA fuera/cifrado (`privateConfig`, token en claro borrado con `deleteField`); `schemaVersion`
  añadido (F6.3). Se mantiene el modelo HÍBRIDO (email consentido) por decisión; NO index-only puro.
- 🔶 **Gist de juegos — formato v4 keyed + diccionarios** (`8c0eec8`) IMPLEMENTADO pero GATED tras
  `ENABLE_GAMES_WRAPPER_WRITE=false`: mapa por id (no `c/v/e/p`) + categorías deduplicadas en diccionarios + ancla padre con
  chunks hijos. Lectura retrocompatible (plano/v3/v4) + auto-upgrade. Activar = 2 pasos (ver nota en `gistRepository.ts`).
  ✅ guardas `assertNoSocialPrivateFields`/`toPublicGame`/guarda de tamaño; ✅ purga de tombstones; ✅ campos aditivos `_v`/`deletedAt`.
- 🔶 **`firestore.rules`** + tests de emulador: reconciliadas y validadas (7/7); ⏳ falta **desplegarlas** (Fase 0).

## How to use them
Only when actively advancing the migration. For each step: read the prompt as the goal, implement against
the real paths/stack, run `npx tsc --noEmit` + `npm run test`, and **confirm before adding any new dependency**
(`firebase-tools`, `@firebase/rules-unit-testing`, `fake-indexeddb`) or changing storage layout.
The orchestration agents live in `../../agents/migration/`.
