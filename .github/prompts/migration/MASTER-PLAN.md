# Plan maestro — cerrar seguridad + migración + base modular/escalable (end-to-end)

> Documento único que **consolida todo el proceso**: lo pendiente de seguridad/privacidad del gist+Firestore, la
> **integración de migración old→new** (la app usa SIEMPRE el formato nuevo; los datos viejos se transforman al leer
> mediante compat **aislada y borrable**), y el plan de base modular/escalable. Sustituye como índice a los planes
> parciales, que quedan como detalle:
> - `MIGRATION-FORWARD-PLAN.md` — estrategia forward-migration (Fase 1 ya hecha).
> - `MODERN-FOUNDATION-PLAN.md` — ejes E1–E4 / M1–M4 / modernización + decisiones 1–7.
> - `TEST-PLAN.md` — pruebas end-to-end. `PHASE-B-FLIP.md` — detalle del flip B1–B6.

## Principios (invariantes en todas las fases)
- **La app trabaja siempre con el modelo NUEVO.** Si llega un dato en formato viejo, se **transforma al leer y se
  reescribe en nuevo** (auto-upgrade). Nada de ramas "modo viejo" en la lógica de negocio.
- **Toda la compat vive aislada en `src/model/migration/legacy*.ts`** (cabecera `// LEGACY COMPAT — borrar tras migrar`).
  Borrar la migración el día de mañana = borrar esos ficheros y sus llamadas. Ningún `if (legacy)` fuera de esa carpeta.
- **Canal PRIVADO vs PÚBLICO**: el gist de juegos es privado (lo controlan tus dispositivos → corte de formato
  por-usuario). El gist social + Firestore son públicos (deben degradar suave para versiones viejas de otros usuarios).
- **Sync cross-device perfecto** (ver `sync-cross-device-requirement`): la eficiencia nunca impide la propagación.
- **Verificación por fase**: `tsc` + `vitest` + `build` + `audit:privacy A:0` (+ `test:rules` si tocan reglas).
  Commits de una línea por unidad. Cada fase termina desplegable.

---

## FASE 0 — Cerrar seguridad/privacidad (lo que falta del gist+Firestore)

Estado: el grueso (B1–B5) está implementado y el **upgrade proactivo** + **borrado del token en claro** (Fase 1 del
forward-plan) ya commiteado (`659c760`, `6c55fb5`, `8fc3ad0`). `recoverGistIdFromGoogle` ya prioriza el token cifrado
(`recoverGithubToken`) con fallback legacy. Queda lo que requiere navegador/despliegue:

- [ ] **0.1** Probar B1–B5 en navegador real (perfil social: guardar, token cifrado en `privateConfig`, recuperar
      "desde Google", feed/perfil index-only). Seguir `TEST-PLAN.md`.
- [ ] **0.2** `npm run test:rules` (emulador, 7/7) y luego `firebase deploy --only firestore:rules`.
- [ ] **0.3** Re-guardar el perfil social UNA vez tras desplegar → materializa el token cifrado y dispara el
      `deleteField()` que borra el token en claro legacy.
- [ ] **0.4** **Revocar en GitHub el token** que pasó por el chat (acción de seguridad pendiente desde la sesión previa).

---

## FASE 1 — Integración de migración old→new (capa de compat, transversal)

Esta es la pieza que el usuario pide explícitamente: **un único punto, aislado y borrable, que pase de antiguo a nuevo.**
Regla de oro: **cada cambio de formato de las fases siguientes añade aquí su lector/upgrader**, nunca lógica dispersa.

### 1.1 Inventario de compat (módulo ↔ qué migra ↔ estado)
| Formato nuevo | Módulo aislado `src/model/migration/` | Qué hace | Estado |
|---|---|---|---|
| Gist juegos: plano → `GamesMainFile` chunked | `legacyGamesFormat.ts` | `unwrapGamesFile` (lee plano+envoltorio), `isLegacyFlatTabData`, `gamesGistNeedsRewrite` | ✅ lectura/upgrade plano; **ampliar a chunks en E4** |
| Gist social: `review`/`reviewText` → `snippet` | `legacySocialFormat.ts` | `pickLegacyReviewText`, `socialGistNeedsRewrite` | ✅ hecho |
| Gist social: `actorUid`/`fromUid` → `actorProfileId`/`fromProfileId` | `legacySocialFormat.ts` (NUEVO) | mapear uid→profileId al leer + migrar la `key` de `activity` | ⬜ Fase 6 |
| Firestore: token en claro → cifrado en `privateConfig` | `legacyTokenRecovery.ts` | `readLegacyPlaintextToken` (fallback) + `deleteField` al guardar | ✅ hecho |
| Firestore: docs sin `schemaVersion` → con versión + `gamesChunks`/`socialChunks` | normalizador de lectura (default `schemaVersion: 0→1`) | aditivo, no destructivo | ⬜ Fase 6 |
| localStorage: claves v8–v11 → v12 | `legacyLocalStorage.ts` | `LEGACY_STORAGE_KEYS` + barrido al cargar | ✅ hecho |
| IndexedDB: blob `appState` → stores normalizados (`games`/`deleted`/`meta`) | `dataMigrationRepository.ts` (runner) | dry-run + migración idempotente no destructiva | ✅ escrito; **cablear en E2** |

### 1.2 Contrato de auto-upgrade (idéntico en todos los canales)
1. Al **leer**, un detector puro `*NeedsRewrite(raw)` decide si el dato está en forma vieja.
2. Si lo está → la app marca *dirty* / fuerza una **reescritura en formato nuevo** en el siguiente ciclo de sync/guardado.
3. La lectura tolera ambos formatos; la **escritura siempre emite el nuevo**.
4. Cada detector/transformador lleva su **test** en `tests/unit/migrationFoundation.test.ts`.

### 1.3 Salida (Fase 9): cuando no queden datos viejos, borrar `legacy*.ts` + sus llamadas + los fallbacks.

---

## FASE 2 — E1: escalabilidad barata (sin romper a nadie)
- Guarda de tamaño en `writeGist`/`writeSocialGist`: avisar (≈700 KB) y bloquear con mensaje accionable (≈950 KB)
  **en vez de** deadlock silencioso al superar el límite de GitHub.
- Purga de tombstones: descartar `deleted` con `_ts` > 90 días (conservador, no rompe propagación reciente).
- Serialización magra: omitir campos vacíos/por-defecto al escribir (compat-safe).
- Verificar: tests de guarda y purga; `audit A:0`.

## FASE 3 — M1+M2: partir los god-files (code-motion, sin cambio de comportamiento)
- M1 `gistRepository.ts` → `githubGistApi.ts` (HTTP) · `gistConfigRepository.ts` (localStorage) · `gistSessionCache.ts`
  (cachés) · `socialProjection.ts` (toPublicGame/snippet/normalizadores) + fachada.
- M2 `firebaseRepository.ts` → `firebaseClient.ts` · `telemetryRepository.ts` · `firebaseAuthRepository.ts` ·
  `firebaseProfileRepository.ts` · `firebaseSocialRepository.ts`.
- Verificar con los tests existentes (no cambia comportamiento).

## FASE 4 — E2: IndexedDB autoritativo (CERRADA — base ya en su sitio)
- ✅ **Runner cableado** en `main.tsx` (idle, idempotente, no destructivo): puebla `games`/`deleted` desde `appState`.
- ✅ **Lectura games-autoritativa cuando está al día** (corte A3 previo); `appState` como backup/fallback.
- ⏭️ **Escritura granular MOVIDA a la Fase 6**: reescribir el camino caliente a `upsertGame`/`deleteGame` está acoplado
  al consumidor de `syncQueue` (delta-sync). Hacerlo aislado crearía SyncOps huérfanas y doble fuente de verdad para el
  gist (riesgo de pérdida) sin beneficio a <1.000 juegos. Decisión 2026-06-20: se hace junto al delta-sync en Fase 6.

## FASE 5 — M3+M4: viewmodel social + sacar lógica de la vista (HECHA)
- ✅ M3 (`6b5efc5`): extraído `useSocialViewModel.ts` (1140) verbatim; `SocialHub.tsx` 1296→285, presentacional.
- ✅ M4a (`3ce1f40`): `publishReviewActivity` movido de `App.tsx` a `socialPublishRepository.ts` (orquestación pura, sin
  estado React); App pierde 8 imports sociales.
- ⏭️ M4b (orquestación de persistencia de `useGameListViewModel`): EVALUADO Y OMITIDO. `persist()` son 4 líneas de
  efectos; extraerlas conflaría capas (helper de persistencia importando la máquina de sync) o sería indirección trivial.
  Que el viewmodel orqueste persist+marcar-dirty es MVVM correcto. Reabrir solo si se aborda el verdadero peso del VM
  (gestión de tags/filtros), fuera del alcance de M4.
- ⚠️ Sin tests de componente: el flujo social (gateway/login, perfil, feed, directorio, detalle, sign-out) necesita
  verificación en NAVEGADOR tras M3.

## FASE 6 — Modernización (schemaVersion + Zod + cambios de formato público)
> Estado por sub-paso: ✅ 6.1 (`5b48a14`) Zod + allowlist estricta del gist social validada antes de escribir ·
> ✅ 6.3 (`71d24c6`) `schemaVersion` aditivo en docs Firestore · ⏸️ 6.2 (uid→profileId) APLAZADA: bloqueada por
> `profileId` no estable entre dispositivos (requiere 6.2a recuperar profileId de Firestore al login) + necesita prueba
> en 2 dispositivos; `consent` necesita UX inexistente · ⏸️ 6.4 (delta-sync + escritura granular) APLAZADA: alto riesgo,
> necesita navegador. 6.2 y 6.4 se agrupan en un esfuerzo verificado en navegador/2 dispositivos.

- Añadir **`schemaVersion`** a cada artefacto persistido y **validación runtime con Zod** antes de escribir
  (integridad + privacidad; sustituye/complementa `assertNoSocialPrivateFields`).
- **Gist social a `schemaVersion: 2` + `consent`** y **`uid`→`profileId`** en el canal público
  (`actorProfileId`/`fromProfileId`), con su compat de lectura en `legacySocialFormat.ts` (Fase 1.1).
- Firestore: `schemaVersion` en docs + `gamesChunks`/`socialChunks` en `privateConfig` (modelo híbrido, sin index-only puro).
- **Delta-sync + escritura granular** (lo que se movió de E2): reescribir el camino caliente a `upsertGame`/`deleteGame`
  (escritura por registro) + un **consumidor de `syncQueue`** que sincronice solo los cambios encolados, no el blob entero.
  Aquí sí es coherente: `appState` deja de ser la fuente del gist y el store `games` pasa a autoritativo en escritura.

## FASE 7 — E3: desacoplar la lectura cross-user del gist de juegos
- El directorio/perfil social deja de leer el gist de juegos en crudo de otros usuarios (`readPublicGamesGistById`);
  usa solo el gist social index-only. Mejora privacidad y deja el formato del gist de juegos como asunto del propio usuario.

## FASE 8 — E4: gist de juegos multi-fichero con chunking (gated, por-usuario)
- Activar `GamesMainFile`; **implementar de verdad** `distributeIntoChunks` en escritura + `chunkIndex`; chunks de
  overflow como **ficheros del mismo gist** (`gistId: null`); reescribir solo chunks cambiados; `deletedIndex.purgeAfter`.
- Ampliar `legacyGamesFormat.unwrapGamesFile` para seguir `chunkIndex` y juntar chunks (compat de lectura).
- Gate: tras E3 + actualizar tus dispositivos. Escala objetivo <1.000 → se implementa como capacidad, no urgencia.

## FASE 9 — Limpieza final (cuando no queden datos viejos ni lectores viejos)
- Borrar `src/model/migration/legacy*.ts` + sus llamadas + fallbacks (token legacy, lectura plano del gist, claves
  localStorage viejas). El lector del gist pasa a esperar solo el formato nuevo. `tsc/test/build/audit/test:rules`.

---

## Orden global y decisiones
**Orden:** Fase 0 (seguridad) → 1 (compat) → 2 (E1) → 3 (M1+M2) → 4 (E2) → 5 (M3+M4) → 6 (moderniz.) → 7 (E3) → 8 (E4) → 9 (limpieza).

**Decisiones tomadas (2026-06-20)** — ver `MODERN-FOUNDATION-PLAN.md §6`:
1. Escala <1.000/usuario → E4 preparado y gated, no urgente.
2. Validación runtime con **Zod**.
3. Orden **intercalado** (el de arriba).
4. Gist de juegos: **chunking por-usuario tras E3**.
5. Chunks de overflow = **ficheros del mismo gist** (`gistId: null`).
6. Gist social: `schemaVersion: 2` + `consent` + **uid→profileId** en canal público.
7. Firestore: **híbrido** + `schemaVersion` + chunks en `privateConfig` (sin index-only puro).
