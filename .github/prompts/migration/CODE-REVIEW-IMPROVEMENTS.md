# MEJORAS FUTURAS — revisión global de código (post-migración)

> Lista viva de **mejoras a implementar a futuro**, salida de una revisión completa del código (2026-06-21).
> Distinta de `PENDING.md` (que cubre el corte de la migración: acciones de usuario, flags, fases 7-9).
> Aquí va la **deuda de calidad/seguridad/rendimiento** detectada al revisar todo `src/` con contexto global.
> Marcar `[x]` al completar. Cada ítem lleva ID, fichero:línea, problema y solución propuesta.
> Verificado por lectura directa lo marcado **[v]**; el resto son hallazgos de revisión a confirmar al abordarlos.

## CONTEXTO / VEREDICTO
Base sólida y madura: MVVM limpio, CRDT con tombstones, separación de canales público/privado vigilada por CI,
tests de caracterización (`it.fails`), CSP fuerte. Los problemas de fondo se concentran en **3 ejes**:
1. Robustez del ciclo de sync ante carreras (no-determinismo, sin lock, sin timeouts, fix 304 frágil).
2. Modelo de "cifrado" del token y frontera real de privacidad (ofuscación vendida como cifrado; PII en `profiles`).
3. Hooks/componentes que han crecido demasiado (`gistRepository`, `useSocialViewModel`, `useGameListViewModel`).

---

## 🔴 BLOQUE 1 — CRÍTICO (antes de activar flag v4 / desplegar `firestore.rules`)

> ✅ **C1-C5 IMPLEMENTADOS el 2026-06-21** (tsc · 101 tests incl. 9/9 reglas en emulador · eslint · build · audit A:0 B:0).
> Queda como acción de USUARIO: `firebase deploy --only firestore:rules` (C5) y verificación en navegador/2 dispositivos.
> El único resto de C5 es la migración PII (email/uid → índice pseudónimo), aplazada como tarea gated (abajo).

- [x] **C1 — `persist` dejaba el estado `dirty` tras cada ciclo de sync → escritura espuria perpetua** **[v]** ✅
      `persistInternal(markDirtyState)` + `persistFromSync`; el sync se cableó a la variante sin-dirty (App.tsx).
  `useGameListViewModel.ts:200-201` hace `markDirty()` + `transitionTo('dirty')` al final de `persist`. Los ciclos de
  sync llaman `clearDirty()` dentro de `writeWithConflictRecovery` y *después* `persist(...)`, que vuelve a marcar dirty
  → en el siguiente 304 se dispara un PATCH innecesario; además contamina la memoización (ver P1).
  **Solución:** separar persistencia *por edición de usuario* (marca dirty) de la *de sync* (no debe). Variante
  `persistFromSync(data, meta)` sin `markDirty`. Fix acotado y verificable con los tests existentes.

- [x] **C2 — El fix del bug 304 empujaba sin re-mergear → riesgo de pisar datos remotos** ✅
  Implementado `pushDirtyWithMerge()` (re-lee remoto sin etag → `mergeCrdt` → escribe → actualiza etag/meta/config) y
  reemplazadas las 3 ramas dirty-tras-304 (initialize/refresh/syncNow). Confirmado que el PATCH de gists no honra
  `If-Match` de forma fiable → el re-read+merge es el mecanismo correcto (no la cabecera).

- [x] **C3 — El "cifrado" del token de Firestore es ofuscación** (decisión: honestidad + higiene) ✅
  Corregidos los comentarios falsos (`firestore.ts:56`, cabecera de `crypto.ts`) y `SECURITY.md`. Higiene: cifrado v2
  con salt aleatorio por mensaje + 600k iteraciones PBKDF2, manteniendo lectura v1. El cross-device exige un secreto
  reproducible (uid) → no hay confidencialidad real client-side; la frontera es la regla owner-only (documentado).

- [x] **C4 — Copia operativa del token en claro en localStorage** **[v]** ✅
  `gistConfigRepository` reescrito: token cifrado en reposo con clave de dispositivo **no exportable** en IndexedDB
  (`encryptWithDeviceKey`); caché en memoria + `ensureSyncConfigLoaded()` (hidrata/migra el legacy en claro). Los
  campos no sensibles siguen síncronos. Tests en `gistConfig.test.ts` + `crypto.test.ts`.

- [~] **C5 — Fuga de PII y mismatch reglas↔código en la capa social** (parcial: hardening hecho; migración PII gated)
  - ✅ **Recomendaciones (código muerto) ELIMINADAS**: `sendGameRecommendation`/`getReceivedRecommendations`/
    `updateRecommendationStatus`/`upsertProfileIndex`/`upsertFeedCard` + sus cachés/re-exports/guarda. Sin consumidores.
  - ✅ **Reglas endurecidas (C5/T4)**: `hasOnly` de campos permitidos en `profiles` y `privateConfig` + guarda de
    existencia de `social` en la lectura. Tests de emulador 9/9 (incl. rechazo de campos fuera de allowlist).
  - [ ] **PENDIENTE GATED — migración PII**: `profiles` aún guarda `email`/`uid` (legibles por autenticados con
    `social.enabled`) porque `findSocialProfileByEmail` los necesita para "recuperar desde Google". El fix completo
    (índice pseudónimo por `profileId`, sin email/uid, + guarda recursiva de campos privados reintroducida) es la
    misma cutover que 6.2 → requiere verificación en navegador/2 dispositivos. NO ejecutar a ciegas. (audit C:15 = esto.)
  - ⏳ Acción de usuario: `firebase deploy --only firestore:rules` para activar las reglas endurecidas.

---

## 🟠 BLOQUE 2 — SEGURIDAD DEL TOKEN / CIFRADO

- [~] **SE1 — Seed de cifrado volátil**: `crypto.ts` `getSessionSeed` (UA|idioma|tz) sigue como default de `encrypt()`,
  pero ya NO se usa para datos persistentes: el token de Firestore usa `uid` explícito y el token local usa la clave de
  dispositivo en IndexedDB (C4). Riesgo residual solo si en el futuro se llama `encrypt()` sin secreto. Pendiente menor.
- [x] **SE2 — PBKDF2 débil**: ✅ v2 con salt aleatorio por mensaje + 600k iteraciones (lee v1). Hecho en C3.
- [x] **SE3 — `SECURITY.md` desactualizado**: ✅ actualizado (sección de cifrado + tabla de estado) en C3.

---

## 🟠 BLOQUE 3 — ROBUSTEZ DE SYNC (correctitud)

- [x] **S1 — Desempate de `_ts` no determinista en `mergeCrdt`** **[v]** ✅ (2026-06-21): `pickDeterministic()` con orden
  estable `_ts → _v → contentKey` (hash de contenido independiente del lado) reemplaza el `local._ts >= remote._ts`. Además
  el flagging de `needsUpdate` compara `contentKey` (divergencia de contenido, no solo `_ts`/`_tab`) → arregla también el bug
  caracterizado H1. Tests: convergencia desde ambas perspectivas + prioridad de `_v`. tsc/95+1/eslint OK.
- [x] **S2 — Sin mutex de sync** ✅ (2026-06-21): `acquireSyncLock()`/`isSyncInFlight()` en `syncMachineRepository`
  (mutex in-flight real; antes `transitionTo` solo escribía un campo → no era lock). Todos los puntos de entrada de
  alto nivel toman el lock: `refreshRemote`, `initializeSync`, `syncNow`, `connectSync` (+ el sync de
  `recoverGistIdFromGoogle`), `overwriteRemoteData` y los reintentos de escritura standalone (backoff + `online`). Si ya
  hay un ciclo en vuelo se COALESCE (skip): seguro porque `dirty` se persiste y el ciclo en curso/siguiente lo empuja
  (manual `syncNow`/`connectSync` avisan "sincronización ya en curso"). Las escrituras ANIDADAS (writeWithConflictRecovery/
  pushDirtyWithMerge dentro de un ciclo) NO toman el lock (se bloquearían a sí mismas). `release()` idempotente,
  `finally` siempre, `resetSyncState` lo libera. Tests: 3 nuevos en `syncMachineRepository.test.ts`. tsc/109+1/eslint/build OK.
- [x] **S3 — Red sin timeout ni distinción offline/HTTP** ✅ (2026-06-21): nueva capa `githubHttp.ts` (alineada con el
  split R1 futuro) centraliza TODOS los `fetch` del gist con `githubFetch` (AbortController + timeout 15s → un socket
  colgado ya no deja el estado atascado en `checking`/`writing`). `!navigator.onLine`/`AbortError`/`TypeError` se reescriben
  a `NetworkDeferredError` → la máquina de sync va a backoff PERO no spamea toast de error (mensaje "sin conexión") y un
  listener `online` reintenta la acción pendiente de inmediato. `403/429` con `Retry-After`/`X-RateLimit-Reset` adjuntan
  `retryAfterMs` al error (`buildGithubError` → `Error`) y el backoff usa `max(backoff, retryAfterMs)`
  (`SyncState.retryAfterMs`). Tests: `githubHttp.test.ts` (11). tsc/106+1/eslint/build OK.
- [ ] **S4 — Purga de tombstones puede revivir borrados** (documentado/aceptado): `syncRepository.ts:95-102`. Dispositivo
  offline >90 días con ítem vivo lo resucita. Registrado; subir ventana o confirmar al revivir si se quiere robustez.

---

## 🟡 BLOQUE 4 — RENDIMIENTO REACT (quick wins primero)

- [x] **P3 — `FormModal` emite `onDraftChange` por keystroke → re-render de todo el árbol** ✅ (2026-06-21): el borrador
  ahora es estado LOCAL del modal (`useState`, seedeado de la prop al abrir/cambiar de juego); todas las ediciones llaman
  a `setLocalDraft` y solo `onSave(nextDraft)` propaga al VM. Eliminada la prop `onDraftChange` (FormModal + App.tsx).
  Cada pulsación re-renderiza solo el modal, no App/GameTable. Test de componente `FormModal.test.tsx` (2): no emite por
  tecla + `onSave` recibe el draft editado. tsc/111+1/eslint/build OK.
- [x] **P1 — `persist` dependía de `meta` → cascada de recreación de callbacks** ✅ (2026-06-26): `metaRef` (sincronizado
  en render) reemplaza la dependencia `[meta]` en `persistInternal`/`persist`/`persistFromSync` → ahora estables
  (dep `[]`/`[persistInternal]`), no se recrean en cada guardado ni arrastran a saveDraft/deleteGame/etc.
- [x] **P2 — `useMemo` de `list` con deps mal declaradas** ✅ (2026-06-26): `App.tsx` usa `[vm.getFilteredList, currentTab]`
  (la función ya está memoizada sobre data/filters/sort) en vez de re-listar sus internals.
- [x] **P4 — `getFilteredList` recomputaba `Math.max(...years)` en cada comparación** ✅ (2026-06-26): decorate-sort-undecorate
  (`keyOf` calcula la clave una vez por juego, se ordena sobre la clave materializada).
- [x] **P5 — `notify` guardaba el timer como propiedad mutada de la función** ✅ (2026-06-26): `noticeTimerRef` (`useRef`)
  + cleanup `clearTimeout` al desmontar. (P1/P2/P4/P5 verificados juntos: tsc · eslint · 171 tests · build OK.)

---

## 🟡 BLOQUE 5 — ACCESIBILIDAD

- [x] **A11y-1 — Modales sin focus trap ni restauración de foco** ✅ (2026-06-21): hook compartido `useNativeDialog`
  (showModal/close + Esc vía evento `cancel`). `FormModal` deja de usar `<div role="button">` como overlay → ahora es un
  `<dialog className="modal-dialog">` (focus trap, restauración de foco y `::backdrop` nativos; CSS nuevo en
  `_overlays-and-responsive.scss`; el recuadro visible sigue siendo `.modal`); click en backdrop y Esc cierran.
  `ConfirmModal` pasa de `<dialog open>` (no-modal, sin backdrop) a `showModal()`; Esc → onCancel; sin dismiss por click
  fuera (confirmación destructiva). Polyfill mínimo de showModal/close en `tests/setup.ts` (jsdom no los implementa).
  Tests de componente: `FormModal.test.tsx` (+3 a11y) y `ConfirmModal.test.tsx` (4). tsc/118+1/eslint/build OK.
  ⚠️ Pendiente verificación visual en navegador (aspecto del `::backdrop`/centrado). `AdminModal` sigue con `.modal-ov`
  (fuera del alcance de A11y-1; mismo patrón a migrar si se quiere consistencia).
- [x] **A11y-2 — Fila expandible no se anunciaba como botón** ✅ (2026-06-26): el disparador de detalles es ahora un
  `<button class="row-toggle" aria-expanded aria-controls={game-detail-id}>` REAL en la 1ª celda (anunciado como botón,
  navegable y accionable por teclado con Enter/Espacio nativos); la `<tr>` deja de ser focusable y conserva click/doble-clic
  solo como atajos de ratón. El detalle expandido lleva `id` para `aria-controls`. Equivalente de teclado para editar:
  expandir → botón "Editar" del panel (ya existente, focusable). Estilo `.row-toggle` (texto plano + `:focus-visible`) en `_table.scss`.
- [x] **A11y-3 — `aria-live` del contador de caracteres anunciaba en cada pulsación** ✅ (2026-06-26): el conteo visible
  pierde `aria-live`; se añade una región `sr-only` `role="status" aria-live="polite"` con un mensaje de UMBRAL constante
  (90% / 100%) → el lector lo anuncia una vez al cruzar la banda, no por tecla. Strings nuevas en `labels.ts`
  (`charNearLimit`/`charLimitReached`). (A11y-2/A11y-3: tsc · eslint · 171 tests · build · html-validate OK.)

---

## 🟡 BLOQUE 6 — ARQUITECTURA / MANTENIBILIDAD (medio plazo)

- [ ] **R1 — Partir `gistRepository.ts` (1127 líneas)**: juegos (~150) vs social (~900). →
  `gamesGistRepository` / `socialGistRepository` / `githubHttp` / `socialGistCache`.
- [ ] **R2 — Descomponer `useSocialViewModel.ts` (1122)** en `useSocialAuth` / `useSocialGistResolution` /
  `useSocialProfile` / `useSocialDirectory` / `useSocialRouting` + `useDragScroll` genérico (el drag-scroll no es de dominio social).
- [ ] **R3 — Descomponer `useGameListViewModel` (612) + `App.tsx` (458)**: `useGamesData` / `useGameSelectors` /
  `useGameMutations` / `useListUiState`; deduplicar `removeTagAcrossGames`/`renameTagAcrossGames` con `mapAllTabs(fn)`.
- [ ] **R4 — Borrar código muerto social**: `upsertProfileIndex`, `upsertFeedCard`, `sendGameRecommendation`,
  `getReceivedRecommendations`, `updateRecommendationStatus` (sin consumidores, confirmado por grep). Borrar o `@deprecated`.

---

## 🟡 BLOQUE 7 — TESTING / TOOLING

- [ ] **T1 — Tests de módulos sensibles**: `crypto` (round-trip + estabilidad de seed), guarda `assertNoSocialPrivateFields`/
  campos prohibidos de Firestore, round-trip v4 de `gistRepository`. (El propio `audit-privacy.js` admite no poder verificar esas guardas.)
- [ ] **T2 — Umbral de cobertura**: `vitest.config.js` sin `thresholds`; Codecov con `continue-on-error`. Añadir 70-80% en `src/model/repository`.
- [ ] **T3 — `tsconfig`: activar `noUncheckedIndexedAccess`** (probablemente revele bugs reales en el merge/CRDT).
- [ ] **T4 — Reglas Firestore sin validación de esquema** (`hasOnly([...])`, tipos) → cliente hostil escribe campos arbitrarios.
  Añadir validación + tests de emulador para campos no permitidos.

---

## 🟣 BLOQUE 8 — ESTRUCTURA DE ALMACENAMIENTO (auditoría 2026-06-21: Firestore + ambos gists)
> Salida de 3 auditorías de modelado (Firestore, gist de juegos, gist social). Veredicto: base sólida (lean,
> guardas de tamaño, cachés ETag+dedup, merge/deleteField, deny-all, hasOnly, snippet-only+doble guarda,
> identidad por profileId). Las mejoras se concentran en privacidad del doc público, datos muertos y defensa de esquema.
> **Requisito transversal**: toda migración de estructura debe ser RETROCOMPATIBLE con auto-upgrade al leer (igual que
> el gist de juegos v3→v4): leer formato viejo y nuevo, transformar a nuevo al encontrarlo, sin romper clientes en versión previa.

> **Progreso P1 (solo código, sin despliegue) — 2026-06-21:** enabler de PROPIEDAD POR IDENTIDAD hecho. Helper puro
> `isOwnProfileIdentity(entryId, uid, profileId)` (exportado, testeado) + estado `ownProfileId` (resuelto de `uid` vía
> `resolveStableProfileId`). `getGameItemById` y `selectedProfileDetail` detectan lo propio por uid/profileId, NO por
> email; display ya no cae a email (`'Usuario'`). Tolera ambas eras (hoy id=uid; index-only id=profileId) sin tocar este
> código en el cutover. Tests: `socialIdentity.test.ts` (5). **Pendiente P1**: Enabler 1 (recuperación por uid en vez de
> `findSocialProfileByEmail`) — entrelazado con el fallback de token legacy y el flujo de login → se hará junto a P2 con
> verificación en 2 dispositivos. Reglas (P0/P3) y escritura minimal (P2) siguen pendientes (requieren deploy).

### 🔴 ALTA — privacidad del documento público `profiles`
- [ ] **ST1 — `email`/`photoURL` legibles por cualquier autenticado** (`firestore.rules:58-65`) y `email` emitido por
  `listSocialDirectory` sin uso (`firebaseSocialRepository.ts:207,219`). Es el refactor index-only (relacionado con C5, gated).
  *Quick win previo al cutover*: dejar de emitir/escribir `email` en el doc público. Fix completo: doc público pseudónimo por
  `profileId` (sin email/uid/photoURL) + doc privado por uid. **Auto-upgrade**: al leer un perfil viejo (email/uid en público),
  reescribir al esquema nuevo la próxima vez que el dueño guarde / al detectarlo.
- [ ] **ST2 — Barrido de purga del `social.githubToken` legacy en claro** (`firebaseRepository.ts:88-93`): hoy solo se borra
  cuando el dueño reguarda → un tercero podría leer el token de un perfil viejo. Falta purga proactiva (al detectar el campo en
  cualquier lectura propia → `deleteField`).

### 🟠 MEDIA — datos muertos / redundancia
- [x] **ST3 — `recommendations` top-level y `profile.recommendations` del gist social MUERTOS** ✅ (2026-06-21):
  eliminados del tipo `SocialGistData`/`SocialGistProfile`, del schema Zod estricto, de `normalizeSocialGistData`,
  `remapSocialActorIds` y `getEmptySocialGistData`. **Retrocompat/auto-upgrade**: la LECTURA sigue leyendo el raw
  `recommendations` y lo fusiona en `activity` (`mergeLegacyActivity`, sin pérdida); `socialGistNeedsRewrite` detecta
  arrays legacy con contenido → `wasLegacy` fuerza reescritura que los deja fuera. Tests en `migrationFoundation.test.ts`.
- [ ] **ST4 — `gamesGistId`/`etag` en el doc público `profiles`** (`firebaseRepository.ts:74,76`) → mover solo a `privateConfig`
  (owner-only). Auto-upgrade al reguardar.
- [ ] **ST5 — `actorName` duplicado en cada entrada de `activity`** (×320; `gistRepository.ts:483`) → normalizar a raíz
  (`actors:{[profileId]:{name}}`) o reusar `profile.name`. Lectura tolerante a ambos.
- [ ] **ST6 — `gamesChunks`/`socialChunks`** en reglas+tipos pero nunca escritos (`firestore.rules:40-42`) → campos muertos.
- [ ] **ST7 — `profileId` en 3 sitios** (`profiles`/`userMap`/`privateConfig`); `userMap` casi-redundante (fallback ya canónico).

### 🟠 MEDIA — defensa de esquema
- [x] **ST8 — Cotas Zod en el gist social** ✅ (2026-06-21): `actorName`/`gameName`/`profile.name`/`idName.name` `.max(500)`,
  `snippet` `.max(200)`, `recommendationText` `.max(5000)`, `rating` `.min(0).max(5)` (matchea clampRating). Cotas
  generosas: nunca rechazan datos válidos actuales, frenan abusos/bugs. `socialGistSchema.ts`.
- [x] **ST9 — `userMap` sin validación de esquema en reglas** ✅ (2026-06-21): `userMapWriteIsValid()` con
  `hasOnly(["profileId","schemaVersion"])` (`firestore.rules`). Test de emulador añadido (`firestore.rules.test.ts`).
  ✅ **DESPLEGADO** a `mylists-f7313` el 2026-06-21 (`firebase deploy --only firestore:rules`, compiló OK). Queda
  `npm run test:rules` (emulador) si se quiere verificar en local.

### 🟡 BAJA — eficiencia / limpieza
- [x] **ST10 — `leanGameItem` emitía `review:""` y `steamDeck:false`** ✅ (2026-06-21): ahora se omiten cuando vacíos/false
  (simétrico con replayable/retry). **Retrocompat**: `migrateGame` los DEFAULTEA en lectura (`withRequiredDefaults`) → el
  GameItem en memoria queda completo. Tests de round-trip en `migrationFoundation.test.ts`.
- [x] **ST11 — Flujo de guardado social = hasta 5 escrituras Firestore secuenciales** ✅ (2026-06-21): `upsertProfileSocialReferences`
  reescrito con un único `writeBatch` ATÓMICO (profiles + privateConfig + userMap, 1 RTT; las dos escrituras de privateConfig
  fusionadas; el borrado del token legacy va en el mismo set/merge del perfil). `firebaseRepository.ts`.
  ⚠️ **Sin cobertura automática** (todo mockeado) → verificar el guardado social en navegador.
- [ ] **ST12 — `listSocialDirectory` usa `where(documentId(),'!=','_placeholder')`** (fuerza índice; `firebaseSocialRepository.ts:182`)
  → filtrar el placeholder en cliente (ya lo hace) y quitar el `where`. Reducir el doc devuelto a campos públicos.
- [ ] **ST13 — `unwrapGamesFile` solo avisa si se pierden TODOS los juegos** (`legacyGamesFormat.ts:86`) → contador/warn cuando `placed < total`.

### 🔁 Ya conocido / gated (no nuevo)
- Tombstones sin purga: en v4 `purgeAfter` se calcula pero nadie barre (`socialProjection.ts:204`) — ver S4.
- Activar formato v4 (diccionarios+chunking): mayor ahorro + rompe deadlock del límite plano; gated (Fase 8, acción usuario).
- Reescritura completa del gist en cada PATCH: limitación inherente de la API de gists; el chunking de v4 la mitiga por-fichero.

---

## COLA LARGA (menor) — detallar al abordar
- `StarRating`/`StarPicker`: redondeo de scores decimales (`Math.round`), roving tabindex incorrecto (fija en estrella 1).
- `TagInput`: hace scraping del `<datalist>` del DOM → sugerencias desfasadas en Firefox-mobile; pasar `options={lookups.x}`
  (la prop ya existe). `useMemo`→`useCallback` en `updateFilter`. `onBlur` con `setTimeout(200)` sin cleanup.
- Cabeceras: falta `Strict-Transport-Security` (HSTS); `style-src 'unsafe-inline'` (probablemente inevitable por react-virtual; documentar).
- `import` de datos sin validación de esquema (`App.tsx:151-182`).
- `npm audit` no bloquea en CI; deps en majors recién salidos (vite 8 / ts 6) con rangos `^`.
- Datalists siempre montados aunque la sección no sea "lists" (`App.tsx:423-442`).

---

## ORDEN DE ATAQUE SUGERIDO
1. **Antes de activar v4 / desplegar reglas:** C1, C2, C5 (pérdida de datos / fuga de PII en el corte pendiente).
2. **Seguridad del token:** C3 + C4 + SE1/SE2/SE3.
3. **Robustez de sync:** S1, S2, S3 (lock + desempate determinista + timeouts).
4. **Quick wins UX/perf:** P3 (draft local) + A11y-1 (`<dialog>`).
5. **Refactors estructurales + tests:** R1-R4, T1-T4.
