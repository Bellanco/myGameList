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

- [ ] **C1 — `persist` deja el estado `dirty` tras cada ciclo de sync → escritura espuria perpetua** **[v]**
  `useGameListViewModel.ts:200-201` hace `markDirty()` + `transitionTo('dirty')` al final de `persist`. Los ciclos de
  sync llaman `clearDirty()` dentro de `writeWithConflictRecovery` y *después* `persist(...)`, que vuelve a marcar dirty
  → en el siguiente 304 se dispara un PATCH innecesario; además contamina la memoización (ver P1).
  **Solución:** separar persistencia *por edición de usuario* (marca dirty) de la *de sync* (no debe). Variante
  `persistFromSync(data, meta)` sin `markDirty`. Fix acotado y verificable con los tests existentes.

- [ ] **C2 — El fix del bug 304 empuja sin re-mergear → riesgo de pisar datos remotos**
  `useSyncViewModel.ts:113-122, 257-266, 362-371`: en la rama `notModified`+`dirty` se escribe `getData()` con
  `Date.now()` sin re-leer. Combinado con que **`writeGist` no envía `If-Match`** (`gistRepository.ts:1079`), GitHub
  acepta el PATCH casi siempre y la recuperación 409 casi nunca se dispara → ventana de carrera read→write no protegida.
  **Solución:** en dirty-tras-304: `readGist(token, gistId, null)` forzado → `mergeCrdt` → escribir el merge. Unificar
  con la rama 409 en un `pushDirtyWithMerge()`. Investigar si la API de gists honra `If-Match`/`412`.

- [ ] **C3 — El "cifrado" del token es ofuscación, no confidencialidad** (2 revisores coinciden)
  `crypto.ts:26-45` + `firebaseRepository.ts:148-167`: clave derivada del `uid` (público, = clave del documento).
  Quien lea `privateConfig` descifra trivialmente. El comentario `firestore.ts:56` ("clave en IndexedDB") es **falso**.
  **Solución:** decidir (a) documentar honestamente que es ofuscación y que la frontera real es la regla owner-only, o
  (b) cifrado real con clave aleatoria persistida por dispositivo en IndexedDB. Corregir comentario y `SECURITY.md`.
  Usar PAT *fine-grained* con scope solo-gist y expiración.

- [ ] **C4 — Copia operativa del token en claro en localStorage** **[v]**
  `gistConfigRepository.ts:16-18`: `saveSyncConfig` serializa `{token, ...}` como JSON plano. Más expuesta que la de
  Firestore (legible por cualquier XSS). **Solución:** cifrar en reposo (WebCrypto + clave no exportable en IndexedDB)
  o mantener en memoria rehidratando desde la fuente cifrada.

- [ ] **C5 — Fuga de PII y mismatch reglas↔código en la capa social** (bloqueante antes de desplegar reglas)
  - `firestore.rules:41-47`: cualquier autenticado lee el doc `profiles` completo → expone `email` y `uid`. El código
    sigue leyendo `email` como fallback (`useSocialViewModel.ts:841,849`).
  - `firestore.rules:90-92`: `recommendations` es admin-only, pero el cliente escribe/lee ahí como usuario normal
    (`firebaseSocialRepository.ts:323,368,440`) → `permission-denied` en producción para todos menos el admin.
  **Solución:** mover el índice público a `ProfileIndexDoc` (sin email/uid); dejar de seleccionar `email` en el
  directorio. Decidir si `recommendations` está vivo (reglas con `fromUid==auth.uid` + validación) o muerto (borrar).

---

## 🟠 BLOQUE 2 — SEGURIDAD DEL TOKEN / CIFRADO

- [ ] **SE1 — Seed de cifrado volátil**: `crypto.ts:52-61` deriva de `UA|idioma|timezoneOffset` → cambia con DST/viaje/
  update del navegador y vuelve **indescifrable** lo cifrado sin secreto explícito. Persistir clave aleatoria por
  dispositivo en IndexedDB. (El token usa `uid` explícito, no le afecta; afecta a cualquier uso por defecto de `encrypt()`.)
- [ ] **SE2 — PBKDF2 débil para 2026**: salt fijo (`'myGameList-v1-salt'`) + iteraciones bajas. Salt aleatorio por mensaje
  guardado junto al ciphertext; subir iteraciones (OWASP ≥600k SHA-256). (Inseparable de C3.)
- [ ] **SE3 — `SECURITY.md` desactualizado**: vende la encriptación como capa fuerte y marca pendiente lo ya hecho.
  Actualizar a estado real tras decidir C3.

---

## 🟠 BLOQUE 3 — ROBUSTEZ DE SYNC (correctitud)

- [ ] **S1 — Desempate de `_ts` no determinista en `mergeCrdt`** **[v]**: `syncRepository.ts:112` (`local gana` en empate)
  → dos dispositivos pueden no converger. **Solución:** desempate estable `_ts → _v → hash/deviceId`, idéntico en ambos lados.
- [ ] **S2 — Sin mutex de sync**: focus/visibility/poll/BroadcastChannel/backoff solapan ciclos; `connectSync`/`syncNow`/
  `overwriteRemoteData` no consultan estado. **Solución:** lock async in-flight (como `socialGistInFlightByKey`) +
  `canWrite()` como guardia explícita.
- [ ] **S3 — Red sin timeout ni distinción offline/HTTP**: ningún `fetch` de `gistRepository.ts` tiene `AbortController`
  → socket colgado deja el estado atascado en `checking`/`writing`. Offline cuenta como error con backoff y notifica error.
  **Solución:** timeout en todos los fetch; tratar `TypeError`/`!navigator.onLine` como "diferido" (reintento en `online`);
  respetar `Retry-After`/`X-RateLimit-Reset` en 403/429.
- [ ] **S4 — Purga de tombstones puede revivir borrados** (documentado/aceptado): `syncRepository.ts:95-102`. Dispositivo
  offline >90 días con ítem vivo lo resucita. Registrado; subir ventana o confirmar al revivir si se quiere robustez.

---

## 🟡 BLOQUE 4 — RENDIMIENTO REACT (quick wins primero)

- [ ] **P3 — `FormModal` emite `onDraftChange` por keystroke → re-render de todo el árbol** (`FormModal.tsx:135,166`).
  **Mejor relación impacto/esfuerzo.** Draft local al modal, emitir solo en `onSave`.
- [ ] **P1 — VM retorna objeto literal no memoizado** (`useGameListViewModel.ts:573-611`) + `persist` depende de `meta`
  (que cambia en cada `persist`) → cascada de recreación de callbacks. Leer `meta` vía `metaRef`, `persist` con dep `[]`.
- [ ] **P2 — `useMemo` de `list` con deps mal declaradas** (`App.tsx:122`): usar `[vm.getFilteredList, currentTab]`.
- [ ] **P4 — `getFilteredList` recomputa `Math.max(...years)` en cada comparación del sort** (O(n log n·k)). Decorate-sort-undecorate.
- [ ] **P5 — `notify` guarda el timer como propiedad mutada de la función** (`useGameListViewModel.ts:343`). `useRef` + cleanup.

---

## 🟡 BLOQUE 5 — ACCESIBILIDAD

- [ ] **A11y-1 — Modales sin focus trap ni restauración de foco** (`FormModal.tsx`, `ConfirmModal.tsx`); `FormModal` usa
  `<div role="button">` como overlay. **Mayor déficit de a11y.** Migrar a `<dialog>`+`showModal()` (trap e `::backdrop` nativos).
- [ ] **A11y-2 — Fila expandible es `<tr tabIndex=0 aria-expanded>`** (no se anuncia como botón) y "editar = doble clic"
  sin equivalente de teclado (`GameTable.tsx:183-203`). Botón disparador real con `aria-controls` + atajo de teclado.
- [ ] **A11y-3 — `aria-live` del contador de caracteres anuncia en cada pulsación** (`FormModal.tsx:483`). Anunciar solo en umbrales.

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
