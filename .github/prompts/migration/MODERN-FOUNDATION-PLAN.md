# Plan: base sólida, modular, moderna y escalable

> Objetivo del usuario: que **todo** sea óptimo, **modular** y **escalable**; que los gists **no se queden sin
> tamaño** al crecer; y tener una **base sólida y moderna** sobre la que crecer. Este plan revisa la app capa por
> capa, recoge lo ya hecho en la migración previa (forward-migration, compat aislada, privacidad index-only) y
> propone fases **implementables y verificables**, cada una con build verde + tests + `audit:privacy A:0`.

## Principios heredados (no romper)
- **Forward-migration**: la app trabaja con el modelo nuevo; al leer datos viejos los transforma y reescribe. Toda
  la compat vive aislada en `src/model/migration/legacy*.ts` y se borra cuando ya no quedan datos viejos (Fase 4 del plan previo).
- **Canal PRIVADO vs PÚBLICO**: el gist de juegos (`myGames.json`) es privado del usuario; el gist social
  (`myGameList.social.json`) + Firestore son el canal público que leen otros usuarios. El privado tolera un corte de
  formato **por-usuario** (basta con actualizar tus dispositivos); el público debe degradar suave para versiones viejas.
- **Sync cross-device perfecto** (ver `sync-cross-device-requirement`): la eficiencia nunca debe impedir que un cambio
  se propague entre dispositivos.
- **Verificación**: `tsc` + `vitest` + `build` + `audit:privacy A:0` en cada fase. Commits de una línea por unidad.

---

## 1. Diagnóstico por capas (estado actual, verificado)

### 1.1 Lo que está BIEN (mantener)
- **Arquitectura MVVM** limpia: `core/` · `model/` (types + repositories + migration) · `view/` · `viewmodel/`.
- **Merge CRDT** (`syncRepository.mergeCrdt`): LWW **por-item** con `_ts`, función **pura y testeable**. Base sólida.
- **Máquina de estados de sync** (`syncMachineRepository`): ETag 304, polling 60s, throttle de lectura 45s, backoff
  exponencial, `BroadcastChannel` entre pestañas. Buena.
- **UI ya virtualizada**: `GameTable` usa `@tanstack/react-virtual` (renderiza ~30 filas aunque haya miles). El render NO es el cuello de botella.
- **IndexedDB normalizado ya existe** (schema v4): stores `games` (keyPath id, índices `_tab`/`_ts`), `deleted`, `meta`, `syncQueue`.
- **Stack moderno**: React 19, Vite 8 (manualChunks por vendor), Firebase 12, react-router 7, TS 6.
- **Privacidad**: canal social index-only, token cifrado en `privateConfig`, auditor como gate de CI.

### 1.2 Techos de ESCALABILIDAD (el problema de "quedarse sin tamaño")
1. **Sync de blob completo**: cada cambio reescribe y sube **todo** el `TabData` al gist (`writeGist` →
   `JSON.stringify(payload)`). El merge baja el blob entero. → ancho de banda O(tamaño) por cambio.
2. **Sin guarda de tamaño**: al superar ~1 MB GitHub rechaza el PATCH → `error_backoff` en bucle → **deadlock
   silencioso** sin acción para el usuario. Este es literalmente "se queda sin tamaño".
3. **Tombstones sin purga**: el array `deleted` crece indefinidamente e infla el blob para siempre.
4. **Persistencia local de blob completo**: editar 1 juego reescribe todo `appState` (localStorage + IndexedDB). Los
   stores normalizados (`games`) existen pero son **espejo best-effort**, no la fuente autoritativa de escritura.
5. **Lectura cross-user del gist de juegos en crudo**: `SocialHub:838` (`readPublicGamesGistById`) lee el gist de
   juegos de OTROS usuarios para el directorio social → (a) *smell* de privacidad (debería leer el gist social
   index-only) y (b) acopla el formato del gist de juegos a clientes de otros usuarios (impide el corte por-usuario).
6. **Directorio social N+1**: por cada perfil (~50) se leen 2 gists (social + juegos). Escala mal con muchos usuarios.

### 1.3 Deuda de MODULARIDAD
- **`gistRepository.ts` (1263 líneas)**: ~13 responsabilidades (HTTP GitHub, caché de sesión, config en localStorage,
  transforms sociales, chunking, privacidad).
- **`firebaseRepository.ts` (1082)**: ~9 responsabilidades (init, telemetría, auth, token cifrado, índice de perfil,
  directorio, recomendaciones, identidad).
- **`SocialHub.tsx` (1296)**: **god component** — 30 `useState`, 12 `useEffect`, accede directo a 3 repos. No existe `useSocialViewModel`.
- **`App.tsx` (507)**: orquesta de más; `publishReviewActivity` accede directo a 4 repos (debería vivir en un viewmodel).
- `useGameListViewModel` mezcla orquestación de persistencia (mirror + markDirty + transitionTo).

---

## 2. EJE ESCALABILIDAD — que el gist nunca se quede sin tamaño

> Estrategia: primero **medidas compat-safe que ya quitan presión** (no rompen a nadie), luego **IndexedDB como fuente
> de verdad local** (permite escritura granular), y por último el **gist multi-fichero con chunking** (capacidad
> efectivamente ilimitada), hecho como corte gated.

### Fase E1 — Guardas y limpieza compat-safe (sin romper a nadie) — PRIORIDAD ALTA, barata
- **Guarda de tamaño en `writeGist`**: antes del PATCH, medir bytes del contenido. Si supera un umbral configurable
  (p.ej. 700 KB de aviso, 950 KB de bloqueo), avisar al usuario con un mensaje accionable **en vez de** entrar en
  deadlock. Loguear el tamaño. (Convierte un fallo silencioso en una señal clara.)
- **Purga de tombstones**: en `mergeCrdt`/persistencia, descartar tombstones con `_ts` anterior a N días (p.ej. 90),
  conservando los recientes para que el borrado siga propagando a dispositivos que sincronizan dentro de la ventana.
  Hacerlo de forma conservadora y documentada. Reduce el crecimiento del blob.
- **Serialización magra**: omitir campos vacíos/por-defecto al escribir el gist (`review: ""`, arrays vacíos). Los
  clientes ya toleran campos opcionales ausentes (compat-safe). Ahorro modesto pero gratis.
- Verificar: tests de la guarda (umbral) y de la purga (no purga recientes, sí antiguos). `audit:privacy A:0`.

### Fase E2 — IndexedDB como fuente de verdad local (escritura granular) — PRIORIDAD ALTA
- **Promover los stores `games`/`deleted`/`meta` a fuente autoritativa** de escritura: al editar/borrar UN juego,
  `upsertGame`/`deleteGame` escriben **solo ese registro** (ya existen estos accesores). `appState` (blob) pasa a ser
  un **backup derivado** que se reconstruye en background, no la ruta de escritura caliente.
- **Lectura de arranque** desde `games` (ya soportado por `getGamesAsTabData`), con `appState` como fallback. Esto ya
  está parcialmente hecho (A3 del plan previo); cerrar el ciclo para que la escritura también sea granular.
- Beneficio: editar 1 juego deja de reescribir N. Habilita el delta-sync de E4.
- Mantener el dual-write durante la transición; retirar `appState` solo cuando E2 esté probado en navegador.
- Verificar: tests con `fake-indexeddb` (escritura granular, arranque desde `games`, idempotencia, no-pérdida).

### Fase E3 — Desacoplar la lectura cross-user del gist de juegos — PRIORIDAD MEDIA (habilitador + privacidad)
- **El directorio/perfil social deja de leer el gist de juegos en crudo de otros usuarios**; pasa a usar **solo el
  gist social index-only** (`readPublicSocialGistById`) que ya contiene la proyección pública (sharedLists/activity con snippet).
- Quitar `readPublicGamesGistById` del flujo social (o limitarlo al propio usuario). Mejora privacidad **y** deja el
  formato del gist de juegos como asunto **solo de tus dispositivos** → habilita el corte por-usuario de E4.
- Verificar: el perfil social de otros usuarios se sigue viendo (desde el gist social), `audit:privacy A:0`.

### Fase E4 — Gist de juegos multi-fichero con chunking (capacidad ~ilimitada) — GATED
- **Activar el formato envoltorio** (`GamesMainFile`) e **implementar de verdad** `distributeIntoChunks` en la
  escritura (hoy está definido pero no se llama, y `chunkIndex` es un stub). Estructura ya tipada
  (`GamesMainFile` ancla + `GamesChunkFile` de overflow, referenciados por `chunkIndex`).
- **Escritura incremental**: reescribir solo los chunks cuyo contenido cambió (no todos), usando `_ts`/checksums.
- **Lectura**: el lector ya es retrocompatible (`unwrapGamesFile` lee plano y envoltorio). Extenderlo para seguir
  `chunkIndex` y juntar los chunks. La compat de lectura vive en `src/model/migration/legacyGamesFormat.ts`.
- **Auto-upgrade** (ya implementado en Fase 1 del plan previo): al detectar formato viejo, reescribir en el nuevo.
- **Gate**: solo tras E3 (ningún cliente ajeno lee el gist de juegos) y tras actualizar **tus** dispositivos. Es un
  corte de una sola dirección, pero acotado a un único usuario.
- Resultado: el gist de juegos puede crecer repartiéndose en N ficheros (cada uno < límite de GitHub) → no se queda sin tamaño.

> Nota de decisión: si tu escala real es de cientos de juegos, E1–E2 ya bastan y E4 es prematuro. E4 solo merece la
> pena al acercarse al límite de un fichero. Ver decisiones al final.

---

## 3. EJE MODULARIDAD — partir los god-files (base mantenible)

> Refactors de **code-motion** (sin cambio de comportamiento), verificables con tests existentes. Cada split es un commit.

### M1 — Partir `gistRepository.ts` en módulos cohesivos
- `githubGistApi.ts` (HTTP puro: fetch/PATCH/crear, headers, errores).
- `gistConfigRepository.ts` (get/save/clear de `syncConfig` y `socialSyncConfig` en localStorage).
- `gistSessionCache.ts` (cachés de sesión con TTL).
- `socialProjection.ts` (toPublicGame, buildReviewSnippet, normalizadores sociales, upsertReviewActivity).
- `gistRepository.ts` queda como **fachada** que orquesta los anteriores (lee/escribe gist de juegos y social).

### M2 — Partir `firebaseRepository.ts`
- `firebaseClient.ts` (init de Firestore/Auth).
- `telemetryRepository.ts` (error reporting + analytics).
- `firebaseAuthRepository.ts` (Google sign-in/out).
- `firebaseProfileRepository.ts` (perfil, identidad uid→profileId, token cifrado, privateConfig, userMap).
- `firebaseSocialRepository.ts` (directorio, índice público, recomendaciones).

### M3 — Extraer `useSocialViewModel.ts` y adelgazar `SocialHub.tsx`
- Mover los 30 `useState`, 12 `useEffect` y la orquestación (hydration de perfil/directorio, `handleSaveProfile`,
  sign-in/out) al nuevo `useSocialViewModel`. `SocialHub.tsx` queda **presentacional** (routing + render de subpantallas).
- Las subpantallas (`SocialFeedScreen`, etc.) ya son presentacionales; tipar fuerte sus props (quitar `any`).

### M4 — Sacar la orquestación social de `App.tsx` y la persistencia de `useGameListViewModel`
- `publishReviewActivity` → método del viewmodel (juego + publicación social en un solo punto del modelo).
- Extraer la orquestación de persistencia (mirror + markDirty + transitionTo) a un helper/hook dedicado, dejando el
  viewmodel centrado en datos+filtros.

---

## 4. EJE MODERNIZACIÓN — base sólida para crecer

- **`schemaVersion` explícito** en cada artefacto persistido (gist juegos, gist social, docs Firestore, IndexedDB) +
  **validación en runtime antes de escribir** (integridad + privacidad) con **Zod** (decisión tomada). Hoy solo hay
  `assertNoSocialPrivateFields`; se sustituye/complementa por esquemas Zod que validan cada artefacto antes de persistir.
- **Delta-sync** (tras E2): sincronizar solo registros cambiados desde el último `_ts` conocido, no el blob entero.
  Encaja con `syncQueue` (ya existe el store).
- **Telemetría de sync** (opcional): tamaño del gist, nº de chunks, tiempo de merge → para anticipar el techo de tamaño.
- Mantener los gates de CI (tests, `audit:privacy A:0`, reglas Firestore).

---

## 5. Orden recomendado de ejecución
1. **E1** (guardas + purga + serialización magra) — barato, quita presión de tamaño ya, sin romper nada.
2. **M1 + M2** (partir repos) — code-motion seguro; facilita todo lo demás.
3. **E2** (IndexedDB autoritativo + escritura granular) — habilita delta-sync.
4. **M3 + M4** (useSocialViewModel + sacar lógica de App) — sobre repos ya partidos.
5. **E3** (desacoplar lectura cross-user del gist de juegos) — privacidad + habilitador de E4.
6. **Modernización** (schemaVersion + validación runtime; delta-sync sobre E2).
7. **E4** (chunking del gist de juegos) — **solo si la escala lo requiere**, gated tras E3 y actualización de tus dispositivos.

Cada fase termina en estado desplegable y verificado. La compat de lectura sigue aislada en `src/model/migration/`
para borrarla cuando no queden datos viejos.

---

## 6. Decisiones tomadas (2026-06-20)
1. **Escala**: < 1.000 juegos por usuario. → E4 (chunking) **no es urgente**; se construye la base (E1–E3) y se deja
   E4 **preparado y gated**, activándolo solo al acercarse al límite de tamaño de un fichero de gist.
2. **Validación en runtime**: **Zod** (esquemas declarativos, escalable). Se añade como dependencia y se definen
   esquemas para los artefactos persistidos (gist juegos/social, docs Firestore, payload IndexedDB).
3. **Prioridad**: **intercalado** — E1 → M1+M2 → E2 → M3+M4 → E3 → modernización (Zod + delta-sync) → E4 (gated).
4. **Gist de juegos a largo plazo**: **chunking por-usuario tras E3**. El destino es el gist multi-fichero; el corte
   queda acotado a los dispositivos del propio usuario una vez E3 desacopla la lectura cross-user.

> Con escala < 1.000, E1 + E2 ya eliminan el riesgo real de tamaño (guarda + purga + escritura granular). E4 se
> implementa como capacidad de crecimiento, no como urgencia.

### Decisiones de FORMATO destino (2026-06-20)
5. **Gist de juegos**: envoltorio `GamesMainFile` chunked (mapa `games` por id con `_tab`, `chunkIndex`, `integrity`,
   `syncMeta`, `deletedIndex` con `purgeAfter`). Los chunks de overflow son **ficheros del MISMO gist**
   (`ChunkRef.gistId = null`, p.ej. `myGames-chunk-c1.json`), no gists separados. Solo se reescriben chunks cambiados.
6. **Gist social**: `schemaVersion: 2` + `consent` (caducidad/scope). **Sustituir el uid de Firebase por el
   `profileId` seudónimo** en el canal público: `actorUid → actorProfileId`, `fromUid → fromProfileId`, y migrar las
   claves de `activity` (`key`) en lectura. Sigue index-only (solo `snippet`).
7. **Firestore**: mantener el **modelo híbrido actual** (`profiles/{uid}` con email consentido + `userMap` +
   `privateConfig`), solo añadiendo `schemaVersion` a cada doc y `gamesChunks`/`socialChunks` (ChunkRef[]) a
   `privateConfig`. NO migrar a index-only puro (rompería descubrimiento por email y exigiría reescribir reglas).
   Las `firestore.rules` ya están reconciliadas con el híbrido.
