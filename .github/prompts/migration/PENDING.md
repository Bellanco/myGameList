# PENDIENTES — lo que NO está hecho (para que no se olvide)

> Índice vivo de todo lo que queda. Marcar `[x]` al completar. Detalle de cada fase en `MASTER-PLAN.md`.
> Última actualización: 2026-06-20 (formato v4 keyed+diccionarios subido).
>
> 📋 **Mejoras de calidad/seguridad/rendimiento (revisión global 2026-06-21):** ver
> [`CODE-REVIEW-IMPROVEMENTS.md`](./CODE-REVIEW-IMPROVEMENTS.md) — lista priorizada de "futuros" (C1-C5 críticos,
> seguridad del token, robustez de sync, perf React, a11y, refactors, tests). Distinta de este PENDING (corte de migración).
> 🔌 **Integraciones para enriquecer (fuentes de datos + librerías):** ver [`INTEGRATIONS.md`](./INTEGRATIONS.md)
> — RAWG + Cloudflare Worker para autocompletar metadatos/carátulas; librerías mapeadas a hallazgos (react-hook-form, Radix Dialog, vite-plugin-pwa…).

## RESUMEN — qué está hecho y qué queda
**✅ HECHO y subido a `develop` (verde en CI):** toda la base previa (E1·M1·M2·M3·M4a·E2-base·F6.1·F6.3·E3) +
**6.2a** (profileId estable, `96e0632`) + **6.2b** (uid→profileId en gist social, `f5ce4fb`) + **auto-upgrade del estado
local** (`074ed68`) + **formato v4 del gist de juegos** (keyed por id + diccionarios de categorías + padre/chunks,
`8c0eec8`, GATED). **6.4** delta-sync CERRADA como no-aplicable (`b6c1614`).

**⏳ QUEDA — todo es acción del USUARIO (navegador/despliegue/2 dispositivos), no código pendiente:**
1. **Fase 0** (seguridad): desplegar `firestore.rules`, re-guardar perfil social, **revocar el token del chat**.
2. **Verificar en navegador**: 6.2a/6.2b en 2 dispositivos (profileId estable, activity por pseudónimo), flujo social (M3/E3).
3. **Activar el formato v4** (flag `ENABLE_GAMES_WRAPPER_WRITE`): ✅ **CÓDIGO ACTIVADO** (`= true`, `gistRepository.ts:53`)
   + test de borde `tests/unit/gistWrite.test.ts` (emisión v4 + round-trip write→read). Verde: tsc/132+1xfail/build.
   ⏳ **Pendiente:** desplegar y **verificar en navegador en 2 dispositivos** (A reescribe `myGames.json` a
   `{schemaVersion:4, fileType:"games-main"}`; B lo lee sin pérdida y lo mantiene v4; 2º sync sin cambios no reescribe).
   Seguro por diseño: el SW es network-first y `/assets/` siempre va a red → ningún cliente online sirve bundle viejo.
4. **Fase 9** (limpieza de `legacy*.ts`): solo tras el corte verificado en navegador.
5. Opcional: llevar diccionarios/chunking al gist social; poblar `privateConfig.gamesChunks`.

## A. Acciones del USUARIO (no son código — requieren navegador/despliegue)
- [ ] **Fase 0.1** — Probar B1–B5 en navegador real (perfil social, token cifrado en `privateConfig`, "recuperar desde Google", feed/perfil index-only). Ver `TEST-PLAN.md`.
- [x] **Fase 0.2** — `npm run test:rules` (emulador) ✅ **9/9 OK** (2026-06-21, incl. validación de esquema C5/T4); **reglas DESPLEGADAS** a `mylists-f7313` el 2026-06-21 (`firebase deploy --only firestore:rules`, cuenta `bellanco3@gmail.com`). Reglas endurecidas activas en producción.
- [ ] **Fase 0.3** — Tras desplegar, **re-guardar el perfil social una vez** (materializa el token cifrado y dispara el `deleteField()` que borra el token en claro legacy).
- [ ] **Fase 0.4** — **REVOCAR en GitHub el token** que pasó por el chat (seguridad).
- [ ] **Verificación M3 en navegador** — flujo social completo: gateway→login Google, crear/enlazar gist social, guardar perfil+favoritos+visibilidad, feed/directorio, detalle de actividad y de perfil, arrastre horizontal del feed, sign-out. (No hay test de componente que cubra runtime con datos reales; solo smoke.)

## B. APLAZADO — requiere verificación en navegador / 2 dispositivos
- [x] **6.2a — Estabilizar `profileId` entre dispositivos** (CÓDIGO HECHO, pendiente verificar en 2 dispositivos):
      `seedProfileIdFromRemote` (indexedDbRepository) reconcilia el `profileId` local con el remoto canónico (gana el
      remoto → sana divergencias); `recoverRemoteProfileId`/`getUserMapProfileId`/`resolveStableProfileId`
      (firebaseRepository) leen `privateConfig.profileId` (fallback `userMap`, ambos owner-readable) ANTES de generar uno
      local; las 2 escrituras sociales (`upsertProfileSocialReferences`/`ensureProfileByEmail`) usan `resolveStableProfileId`;
      siembra adicional al login en `recoverGistIdFromGoogle`. Resiliente (Firestore caído → comportamiento local). Tests en
      `tests/unit/profileIdentity.test.ts`. Verificado tsc/69+2/build/audit A:0 B:0/eslint. ⚠️ **Falta probar en 2 dispositivos
      reales** que el segundo dispositivo adopta el `profileId` del primero y no lo pisa. (Desbloquea 6.2b.)
- [x] **6.2b — uid→profileId en el gist social** (CÓDIGO HECHO, pendiente verificar en 2 dispositivos): `SocialActivityEntry.actorUid→actorProfileId`,
      `SocialRecommendationEntry.fromUid→fromProfileId`; `key` = `${actorProfileId}:${gameId}:${type}`. Lectura tolerante
      (`pickLegacyActorId`/`pickLegacyFromId` en legacySocialFormat: `actorProfileId ?? actorUid`); `socialGistNeedsRewrite`
      detecta uid-form. Escritura: `publishReviewActivity` y la reescritura proactiva de `useSocialViewModel` resuelven el
      profileId estable (6.2a) y **remapean** el gist propio `{miUid→miProfileId}` con `remapSocialActorIds` antes de escribir;
      ruta `/social/user/:id/...` y lookup del detalle pasan a `actorProfileId`. Schema Zod v2 (`actorProfileId`/`fromProfileId`
      + `schemaVersion`). Verificado tsc/77+2/build/audit A:0 B:0/eslint. ⚠️ **Degradación asimétrica**: un cliente NO actualizado
      que lea nuestro gist nuevo dejará de ver nuestra activity (su normalize exige `actorUid`) hasta que se actualice. Probar en
      2 dispositivos: que el segundo adopta el profileId y la activity se agrupa por pseudónimo. NO toca Firestore (doc-keys uid,
      modelo híbrido) ni la colección `recommendations` de Firestore (sigue `fromUid`).
- [ ] **6.2 — `consent`** en el gist social: necesita un **flujo de consentimiento (UX)** que aún no existe; no escribir un bloque hardcodeado.
- [x] **6.4 — Delta-sync + escritura granular** → **CERRADA COMO NO-APLICABLE** (decisión usuario 2026-06-20). Tras mapear la
      arquitectura real: el gist se escribe SIEMPRE entero (la API de GitHub reemplaza el fichero completo) y desde el **estado
      React** (`getData()`→`writeGist(vm.data)`); `localStorage`/`appState`/`games` son solo persistencia del mismo estado, y
      `games` ya es espejo exacto en cada guardado. Un consumidor de `syncQueue` no reduce el payload (no hay delta real contra
      GitHub) y mover "la fuente" de React→games es ceremonia que añade una 2ª/3ª fuente de verdad → riesgo de pérdida sin
      beneficio a <1000 juegos. Además NO eliminaría el blob `appState` (eso es "retirar appState", decidido NO hacer). Los
      accesores `upsertGame`/`deleteGame`/`getSyncQueue` quedan preparados pero inertes por si en el futuro hay un backend con
      delta real. No se toca la máquina de sync.

## C. FASES del plan aún por hacer
- [x] **Fase 7 — E3** (HECHA `f23289a`): el canal social ya NO lee el gist de juegos en crudo de otros usuarios; listas
      compartidas index-only vacías para ajenos; detalle muestra nombre/rating/snippet del evento; metadatos solo para
      juegos propios (fallback local). `readPublicGamesGistById` queda SIN USO → candidato a borrar en Fase 9.
      ⚠️ Verificar en navegador: el detalle de actividad de OTROS usuarios ya no muestra plataformas/géneros (degradación
      index-only intencionada); confirmar que la pantalla se ve bien sin ese bloque.
- [x] **Fase 8 — E4 + optimización de categorías** (IMPLEMENTADA pero GATED): builder multi-fichero (`buildGamesFiles`),
      escritura multi-fichero con borrado de chunks obsoletos, ensamblado en lectura (`assembleChunkedGames`), round-trip tests.
      **schemaVersion 4**: el ancla `GamesMainFile` usa **mapa por id** (no `c/v/e/p`) + **diccionarios de categorías**
      (`genres`/`platforms`/`strengths`/`weaknesses`/`reasons` deduplicadas; cada juego referencia por índice). El ancla
      (`myGames.json`) es el **padre**; los chunks hijos referencian sus diccionarios. Lectura retrocompatible: plano (`c/v/e/p`),
      keyed-v3 (sin dict) y keyed-v4 (`decodeGameCategories` expande índices→cadenas). Auto-upgrade: con el flag ON, `readGist`
      usa `gamesGistNeedsUpgradeToWrapper` → no-v4 se reescribe a v4, v4 no se toca. Verificado sobre `myGames.json` real:
      round-trip EXACTO (228→228, 0 categorías distintas), ~4% más pequeño que el plano-lean actual. 83+2 tests.
      `ENABLE_GAMES_WRAPPER_WRITE` SIGUE EN `false` → INERTE; camino plano intacto. La LECTURA de v4 ya está en esta versión
      independientemente del flag.
      ⏳ **Activar (acción usuario, 2 pasos)**: (1) desplegar ESTA versión a TODOS tus dispositivos (con el flag off ya ganan
      la lectura v4); (2) cuando todos estén al día, poner `ENABLE_GAMES_WRAPPER_WRITE=true` → el gist pasa a v4 y el
      auto-upgrade reescribe el viejo. ⚠️ NO activar antes: un dispositivo en versión anterior leería índices como números.
      Reversible (volver a flat). Pendiente menor: poblar `privateConfig.gamesChunks`.
- [ ] **Fase 9 — Limpieza** ⚠️ PREMATURA AHORA: borrar `src/model/migration/legacy*.ts` + fallbacks (token legacy,
      lectura plano del gist, claves localStorage viejas) SOLO cuando no queden datos ni clientes viejos. Hoy NO se cumple:
      la bandera de chunking está OFF, 6.2/6.4 aplazados, reglas sin desplegar, sin verificación en navegador. Borrar la
      compat ahora ROMPERÍA la lectura de datos viejos. → Mantener hasta completar el corte verificado.
      - [x] Slice SEGURO HECHO (`de0df82`): borrado `readPublicGamesGistById` (muerto tras E3) + sus cachés/estado huérfanos + mock del test.
      - PENDIENTE (gated): borrar `src/model/migration/legacy*.ts` + fallbacks SOLO tras el corte verificado en navegador.

## D. Notas / deuda menor
- ✅ **Auto-upgrade del estado LOCAL** (forward-migration, independiente de 6.4): al cargar, `loadLocalStateAsync` devuelve
  `wasLegacy` (detector puro `localStateNeedsUpgrade` en `legacyLocalStorage.ts`: campos legacy en español o sin `schemaVersion`)
  y `useGameListViewModel` reescribe UNA vez el estado en formato nuevo (sin tocar `updatedAt` ni marcar dirty → no fuerza push
  al gist). `saveLocalState` estampa `LOCAL_SCHEMA_VERSION` → el upgrade es único y no se repite. NO elimina el blob `appState`
  en sí (eso sería "retirar appState", descartado); solo garantiza que su CONTENIDO sea nuevo. Tests en `migrationFoundation.test.ts`.
- `myGames.json` en la raíz = **datos reales del usuario** (untracked). NO commitear (`.gitignore` solo cubre `/data/myGames.json`).
- `dist/index.html` se regenera en cada `build`; no commitear en fases de código.
- **M4b** (extraer `persist()` de `useGameListViewModel`): EVALUADO Y OMITIDO por criterio (MVVM correcto); no es deuda.
- Cobertura de test de componente ampliable: `GameTable`, `FormModal`, editor de perfil social, estados autenticados con datos.
- `npm update` (deps dentro de rango) quedó pendiente por red en sesiones previas; majors (ESLint 10, html-validate 11) descartados por decisión.
