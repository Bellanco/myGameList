# Plan — comprimir el contenido del Gist (ahorro de espacio y crecimiento más lento)

> Plan **accionable**: comprimir el JSON que se guarda en el gist con gzip + base64, tras un envoltorio versionado, para reducir el tamaño real almacenado ~70–75 % y alejar el muro de 950 KB / la necesidad de gists de overflow.
>
> Contexto verificado (código en `develop`, 2026): el contenido del gist se guarda hoy como `JSON.stringify` **plano** (`files[<nombre>].content: string`). **No hay compresión de ningún tipo.** El envoltorio v4 (`ENABLE_GAMES_WRAPPER_WRITE = true`) ya deduplica categorías por diccionario, pero solo logró **~4 % menor** (ver `gistRepository.ts:55`). gzip encima ataca el problema donde el v4 se quedó corto.

> **Estado de implementación (juegos):** Fases 0, 1, 2 y 3 **hechas** en `develop`. Util `src/core/utils/gistCompression.ts` (gzip nativo + base64 troceado, sobre `{enc,payload}` schemaVersion 5). Lectura retrocompatible (`decodeGistContent` en `buildGistReadResponse` y en los merges de overflow). Escritura **gated** por `ENABLE_GAMES_COMPRESSION` (hoy `false`) → cuando esté `true` comprime ancla + chunks + overflow antes de `assertGistSizeWithinLimit`. Tests: `gistCompression.test.ts` (util), `gistCompressionReadWrite.test.ts` (lectura de gists comprimidos con/sin chunks, `readForeignGamesGist`, `enc` desconocido → no rompe, ratio, y escritura comprimida `skipIf(!flag)`); `gistWrite`/`gistV4Cutover`/`gistLegacyUpgrade` hechos robustos al flag (decodifican antes de inspeccionar formato). Verificado con el flag ON: round-trip write→read sin pérdida + idempotente; ratio medido ≈ **31% del original (~69% de ahorro)** sobre datos v4 repetitivos. Pendiente ejecutar el **cutover** (Fase 4) y decidir el social (diferido).
>
> **Decisión sobre el chunking (punto 8):** el particionado (`buildGamesFiles`/`distributeIntoChunks`) sigue midiendo sobre JSON **sin comprimir** (presupuesto 800 KB) — conservador y seguro (el contenido comprimido nunca supera ese presupuesto). Solo el contenido **almacenado y medido** (`assertGistSizeWithinLimit`) va comprimido. Optimizar el nº de chunks según el tamaño comprimido (menos overflow) queda **diferido**: es una mejora, no un requisito de corrección.

---

## TL;DR

- **Sí es viable.** JSON con texto repetitivo (géneros, plataformas, nombres, reseñas) comprime muy bien: gzip **~80–90 %**; con base64 (+33 %) el neto almacenado es **~70–75 % menos**. Un orden de magnitud mejor que el 4 % del v4.
- **Cero dependencias nuevas:** `CompressionStream('gzip')` / `DecompressionStream` son nativas del navegador (Chrome/Edge, Safari 16.4+, Firefox 113+); base64 ya está en `src/core/security/crypto.ts:37-42` (`bytesToBase64`/`base64ToBytes`).
- **Efecto buscado:** el crecimiento del gist se ralentiza mucho y `assertGistSizeWithinLimit` (bloqueo a ~950 KB) pasa a ser casi inalcanzable → los **gists de overflow** dejan de necesitarse en la práctica.
- **Prioridad: gist de JUEGOS** (privado, solo tus dispositivos → cutover controlado). El gist **social se difiere** (es público, lo leen clientes de amigos, y romper la verificación de privacidad es un riesgo real — ver más abajo).
- **Mismo patrón disciplinado del repo:** lectura retrocompatible primero, escritura **gated** por flag, **cutover en 2 pasos**, reversible.

---

## Estado actual verificado (qué toca esto)

- Cliente de gist: `src/model/repository/gistRepository.ts`. Serialización magra + envoltorio: `src/model/repository/socialProjection.ts`. Lectura/detección de formato: `src/model/migration/legacyGamesFormat.ts`. Tipos/versión: `src/model/types/gist.ts`.
- **Gist de juegos** — fichero `myGames.json`. Escritura: `writeGist` (`gistRepository.ts:1555`). Lectura: `buildGistReadResponse` (`gistRepository.ts:1293`) → `assembleChunkedGames` → `unwrapGamesFile` → `migrateData`. Envoltorio v4 `GamesMainFile` (`schemaVersion: 4`, `fileType`, `games`, `dictionaries`, `integrity`, `chunkIndex`).
- **Guardas de tamaño** (`socialProjection.ts:88-112`): `GIST_SIZE_WARN_BYTES = 700*1024`, `GIST_SIZE_BLOCK_BYTES = 950*1024`; `assertGistSizeWithinLimit(content, label)` **lanza** al superar ~950 KB. Se invoca en cada escritura de ancla/chunk.
- **Chunking por tamaño**: `GAMES_CHUNK_MAX_KB = 800`; `distributeIntoChunks` mide `JSON.stringify`/`Blob`.
- **Detección de "legacy"** (`gamesGistNeedsRewrite`, `gamesGistNeedsUpgradeToWrapper`, `legacyGamesFormat.ts`) inspecciona **claves del JSON crudo parseado** (`'c' in o`, `fileType`, `schemaVersion`). ⚠️ Sobre un blob comprimido, `JSON.parse` no daría esas claves → **hay que descomprimir ANTES de estos detectores**.
- **ETag/304, caché de sesión, `updated_at`**: en la capa HTTP; **no** se ven afectados por comprimir (operan sobre la respuesta, no sobre el content).
- **Fuera de alcance:** `directory`/`profiles`/`friendships` viven en **Firestore**, no en gist. `truncated`/`raw_url` de GitHub no se manejan hoy, pero las guardas mantienen cada fichero <950 KB (no llega a truncarse).

---

## Formato — envoltorio versionado (sigue siendo JSON válido)

El content del gist debe seguir siendo una cadena que **parsee como JSON** (para que un cliente sin soporte no explote, solo lo trate como no-legible). Sobre propuesto:

```json
{ "fileType": "games", "schemaVersion": 5, "enc": "gzip+b64", "payload": "<base64-del-gzip-del-JSON-v4>" }
```

- `enc: "gzip+b64"` marca contenido comprimido. Sin `enc`, comportamiento actual intacto (plano / keyed-v3 / v4).
- `payload` = base64(gzip(`JSON.stringify(GamesMainFile v4)`)). Es decir, **se comprime el JSON v4 completo** (mapa + diccionarios + integrity + chunkIndex); no se reinventa el formato interno.
- Un cliente que no entienda `enc` → no puede reconstruir → trata el gist como no-legible. Por eso el gate en 2 pasos.

---

## Plan de implementación

Mismo contrato que v4/overflow: **lectura primero (retrocompatible), escritura gated, cutover en 2 pasos, reversible.**

### Fase 0 — Utilidad de compresión
1. `src/core/util/gistCompression.ts`:
   - `compressToBase64(str: string): Promise<string>` — `CompressionStream('gzip')` sobre `TextEncoder().encode(str)`, recoger bytes, `bytesToBase64` (reutilizado de `crypto.ts`). Trocear al convertir para no desbordar el stack en cadenas grandes.
   - `decompressFromBase64(b64: string): Promise<string>` — inverso con `DecompressionStream('gzip')` + `TextDecoder`.
2. Test unitario de round-trip (`str → compress → decompress === str`), incluyendo Unicode/emoji.

### Fase 1 — Lectura retrocompatible (se despliega con la escritura APAGADA)
3. En `legacyGamesFormat.ts` (o al inicio de `buildGistReadResponse`): detectar `enc === 'gzip+b64'`, descomprimir `payload`, `JSON.parse` del resultado y **continuar el pipeline existente** (`assembleChunkedGames` → `unwrapGamesFile` → `migrateData` → detectores `wasLegacy`). Sin `enc`, ruta actual sin cambios.
4. Ajustar `gamesGistNeedsUpgradeToWrapper` para marcar "necesita re-encodear" cuando el gist **no** esté comprimido y la escritura comprimida esté activa (auto-upgrade en la siguiente sync, como el cutover v4).

### Fase 2 — Escritura gated
5. Flag nuevo, con el mismo bloque de aviso "activar en 2 pasos" que `ENABLE_GAMES_WRAPPER_WRITE`:
   ```ts
   export const ENABLE_GAMES_COMPRESSION = false;
   ```
6. En `writeGist` (y las rutas de chunk/overflow), cuando el flag esté `true`: tras construir el JSON v4, envolverlo en el sobre `{fileType, schemaVersion:5, enc, payload}` **antes** del PATCH.
7. **Orden crítico:** comprimir **antes** de `assertGistSizeWithinLimit`, de modo que la guarda de 950 KB mida el tamaño **ya comprimido** (así el bloqueo casi nunca se alcanza — objetivo del plan).
8. **Chunking sobre tamaño comprimido:** con gzip casi todo cabrá en el gist principal. Decidir explícitamente: comprimir el ancla completa y trocear solo si el sobre supera el presupuesto (evita chunks innecesarios). Documentar la decisión junto a `distributeIntoChunks`.

### Fase 3 — Tests y verificación
9. Round-trip exacto sobre datos reales (como hizo el v4): `data → v4 → comprimir → PATCH-mock → leer → descomprimir → deep-equal`, reportando el **ratio real** de compresión.
10. Retrocompat: cliente nuevo leyendo gist **plano/v3/v4** antiguo; y lectura de `enc` desconocido → no rompe (gist tratado como no-legible, no como corrupto silencioso).
11. `typecheck` + `test` + `validate` verdes.

### Fase 4 — Cutover (operativo, lo ejecuta el usuario)
12. Desplegar Fases 0–3 con `ENABLE_GAMES_COMPRESSION = false` a **todos los dispositivos** (ya ganan la LECTURA; siguen escribiendo v4 plano) → nadie se rompe.
13. Cuando **todos** estén al día: `true` + commit + push. La siguiente sync reescribe el gist comprimido. **Reversible** volviendo a `false` (se rebaja a v4 plano).

---

## Diferido — Gist social (más delicado, va aparte)

Replicar el patrón con `ENABLE_SOCIAL_COMPRESSION`, pero **solo** cuando se pueda garantizar que los clientes de los amigos ya tienen la lectura desplegada. Dos obstáculos propios del canal social:

1. **Schema Zod estricto** — `socialGistSchema` es `z.strictObject` (allowlist), así que un sobre `{enc, payload}` **no valida**. Requiere una rama/schema nueva que reconozca el envoltorio comprimido.
2. **Verificación de privacidad** — `assertNoSocialPrivateFields` recorre el objeto para garantizar que no se filtran datos privados (review/score/hours/…) al canal público. Sobre un blob comprimido **no puede recorrer nada**. Por tanto en social hay que **verificar la privacidad en claro y comprimir en el ÚLTIMO paso**, después de los asserts.

Además el gist social es público-secreto y lo lee `hydrateSocialDirectory` de otros usuarios: comprimirlo exige que **todos** los clientes de amigos sepan descomprimir antes de activar la escritura.

---

## Riesgos y mitigaciones

- **Cliente viejo lee content comprimido** → `JSON.parse` del sobre no explota (es JSON), pero no entiende `enc` → trata el gist como no-legible. **Mitigación:** cutover en 2 pasos (lectura desplegada antes que escritura).
- **Coste CPU** de comprimir/descomprimir → despreciable para estos tamaños (cientos de KB) en navegador moderno.
- **Compatibilidad de `CompressionStream`** → soportado en el target; si algún navegador objetivo no lo tuviera, `enc` distinto de plano se detecta y se puede caer a escritura plana. Verificar antes del paso 2 del cutover.
- **Doble ahorro con v4** → parte del ahorro semántico ya está tomado por los diccionarios (~4 %); la ganancia real de gzip se mide sobre el v4, no sobre el legacy plano (test de Fase 3 lo reporta).

---

## Archivos a tocar

- `src/core/util/gistCompression.ts` (nuevo) — util gzip+base64.
- `src/model/repository/gistRepository.ts` — flag `ENABLE_GAMES_COMPRESSION`, envoltorio en `writeGist`, descompresión en `buildGistReadResponse`.
- `src/model/migration/legacyGamesFormat.ts` — detección `enc` y unwrap previo a los detectores.
- `src/model/repository/socialProjection.ts` — orden de `assertGistSizeWithinLimit` sobre contenido comprimido; nota de chunking.
- `src/model/types/gist.ts` — `schemaVersion: 5` / campo `enc` en el tipo del ancla.
- Diferido (social): `src/model/schemas/socialGistSchema.ts` + rama de privacidad.
- Reutiliza: `src/core/security/crypto.ts:37-42` (`bytesToBase64`/`base64ToBytes`).
