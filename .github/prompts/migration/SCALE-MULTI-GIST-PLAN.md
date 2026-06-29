# Plan de escala — usuario grande y "varios gists"

> Pregunta de partida: ¿está la app preparada (offline · sync gist · sync Google) para un usuario que, **por tamaño**, deba repartir sus datos en **varios gists**? ¿Los listados rinden? ¿Lo social es eficiente?
>
> Fuentes verificadas en código (no diseño): `gistRepository.ts`, `socialProjection.ts`, `legacyGamesFormat.ts`, `firebaseRepository.ts`, `firestore.rules`, `useSyncViewModel.ts`, `syncMachineRepository.ts`, `syncRepository.ts`, `localRepository.ts`, `indexedDbRepository.ts`, `useSocialViewModel.ts`, `GameTable.tsx`. Alineado con `MASTER-PLAN.md` (E4/Fase 8) y `PHASE-B-FLIP.md`.

---

## TL;DR

| Eje | Estado | Veredicto a escala |
|-----|--------|--------------------|
| **Offline** | ✅ Sólido (local-first, IndexedDB + cola + dirty, reintento al volver online, CRDT determinista) | Funciona; degrada por **carga íntegra en memoria** y por **blob completo en localStorage** (cuota ~5 MB). |
| **Sync GitHub Gist** | ⚠️ **1 gist, 1 fichero plano** en producción | **Muro duro a ~950 KB**: la escritura se **bloquea** (excepción) y el usuario no puede guardar. |
| **Sync Google (Firebase)** | ✅ Correcto: Firestore solo guarda **metadatos** (perfil público, `privateConfig`, `userMap`), **no** los juegos | Sin problema de tamaño (esquiva el límite de 1 MiB/doc). |
| **Listados** | ✅ Virtualizados (`GameTable` + `@tanstack/react-virtual`) | Bien hasta ~10 k; filtro/orden O(n) en memoria empieza a notarse después. |
| **Social** | ✅ Eficiente en su mayoría (cachés IDB, dedupe in-flight, ETag/304) | Gaps: **N+1** en el directorio (30 gists en paralelo), feed **sin virtualizar**, cada publicación **reescribe el gist social entero**. |

**Respuesta directa a "varios gists":** **NO está preparada.** La app crea como máximo **2 gists** (juegos + social) y nunca uno de overflow. El _chunking_ existe pero está **apagado tras un flag**, y aun activándolo **solo parte en varios FICHEROS dentro de UN gist** — nunca en varios gists. El campo `ChunkRef.gistId` y los `gamesChunks`/`socialChunks` de Firestore son **tipos sin implementación**. El propio roadmap lo confirma: _"Chunks de overflow = ficheros del mismo gist (`gistId: null`)"_ y _"Escala <1.000/usuario → E4 … no urgente"_ (`MASTER-PLAN.md`).

---

## Diagnóstico detallado

### 1. El _chunking_ está implementado pero GATED

- `gistRepository.ts:55` → `export const ENABLE_GAMES_WRAPPER_WRITE = false;`
- Camino de escritura `writeGist` (`gistRepository.ts:1224-1256`):
  - `if (ENABLE_GAMES_WRAPPER_WRITE)` → `buildGamesFiles()` (ancla + `myGames-chunk-cN.json`) **+ diccionarios v4 deduplicados**.
  - `else` (**producción hoy**) → **un único fichero plano** `{ [GIST_FILENAME]: JSON.stringify(lean) }`.
- Lectura `assembleChunkedGames` (`legacyGamesFormat.ts:99-122`) sí reensambla chunks, pero **solo del mismo gist** (`gistId === null`); ignora silenciosamente cualquier `gistId != null`.

### 2. El muro de 950 KB bloquea, no degrada

- `socialProjection.ts:91-112` → `assertGistSizeWithinLimit` **lanza** a `GIST_SIZE_BLOCK_BYTES = 950*1024` (aviso a 700 KB).
- Se invoca **por fichero** en `writeGist` (`gistRepository.ts:1254`) y en el social (`gistRepository.ts:1051`).
- Con el fichero plano (flag OFF), al superar 950 KB **la escritura entera falla** → el cambio local queda `dirty`, sin destino. Es un fallo de cara al usuario, no una degradación elegante.
- **No existe** guarda de **tamaño total** del gist (suma de ficheros): aun con chunking activo, nada impide superar el límite práctico del gist completo.

### 3. "Varios gists" no existe (ni en código ni en plan)

- `createGist` solo se llama para **juegos** (`useSyncViewModel.ts:240`) y **social** (gateway social). Nunca para overflow.
- Reparto de chunks (`socialProjection.ts:242-258`): **siempre** `gistId: null`.
- Firestore `privateConfig` admite `gamesChunks`/`socialChunks` (`firestore.rules:40-43`, `types/firestore.ts:65-66`) — **pensado** para rastrear gists de overflow cross-device — pero **no se escriben ni se leen** en `src` (solo aparecen en tipos).

### 4. Offline — sólido, con dos cuellos a escala

- Local-first real: `loadLocalStateAsync` combina localStorage + IndexedDB y elige el más fresco (`localRepository.ts:159-190`); `saveLocalState` hace **dual-write** (`localRepository.ts:192-202`).
- Cola de operaciones (`syncQueue`) + flag `dirty`; reintento inmediato al volver online (`useSyncViewModel.ts:540-557`); backoff con respeto a `Retry-After` (S3) y lock anti-solape (S2, `syncMachineRepository.ts`).
- Merge CRDT determinista (`syncRepository.ts:mergeCrdt`): desempate `_ts` → `_v` → hash de contenido. Convergente.
- Bug histórico de 304 **resuelto**: en el primer 304 de sesión se relee sin `If-None-Match` para evaluar `wasLegacy` (`gistRepository.ts:1133-1163`).
- ⚠️ **Cuellos:** (a) `localStorage.setItem` serializa **todo** el estado; con listas grandes salta `QuotaExceededError` (capturado en silencio → solo sobrevive IndexedDB). (b) Carga e _hidratación_ leen **todo** con `getAll()` sin paginar (`indexedDbRepository.ts`); el merge construye mapas de todo el dataset en RAM.

### 5. Firebase/Google — correcto

- Firestore guarda solo: `profiles/{uid}` (ref pública), `privateConfig/{uid}` (gistIds + token GitHub cifrado), `userMap/{uid}`. **Los juegos viven en el gist**, no en Firestore → sin riesgo del límite de 1 MiB/doc.
- Lecturas con `getDoc`/`getDocs` puntuales (sin `onSnapshot` que fugue), con caché en memoria + sessionStorage y dedupe in-flight (`firebaseSocialRepository.ts`).
- Reglas endurecidas con `hasOnly` + ownership + deny-all (`firestore.rules`).

### 6. Listados — bien

- `GameTable.tsx:188-197` usa `useVirtualizer` (overscan 5; estima 50 px fila / 320 px detalle).
- `filterGames`/`sortGames` operan sobre el array completo de la pestaña, memoizados por `[data, sort]` (`useGameListViewModel.ts:266-269`). Correcto hasta ~10 k; recálculo total por cambio de filtro/pestaña a partir de ahí.
- Perfiles ajenos: carga el gist completo y luego pagina (15) + scroll infinito + `GameTable` virtualizado.

### 7. Social — eficiente con gaps

- Cachés IDB: directorio 30 min, juegos ajenos 24 h, perfil propio (`indexedDbRepository.ts`); dedupe `inFlightByGamesGist` (`foreignProfileRepository.ts:8`); ETag/304 y cachés de sesión por gist (`gistRepository.ts`).
- ⚠️ **N+1** al hidratar el directorio: `Promise.all` de ~30 lecturas de gist (`useSocialViewModel.ts:1068-1158`).
- ⚠️ **Feed sin virtualizar**: mantiene hasta 300 items en memoria y renderiza 25 (`useSocialViewModel.ts:507-514`, `SocialFeedScreen.tsx`).
- ⚠️ **Publicación = reescritura total** del gist social (`socialPublishRepository.ts`); crece con cada reseña.

---

## Compatibilidad con usuarios actuales (verificado)

Pregunta: ¿activar E4 (Fase A) **afecta a los usuarios actuales**? Conclusión: **no hay riesgo de pérdida de datos**; el único efecto transitorio posible es *churn* (reescrituras de ida y vuelta) en un escenario acotado y autosanable. Evidencia:

### ✅ Lo que protege a los usuarios actuales

1. **La lectura v4 ya está desplegada en todas las versiones publicadas.** `assembleChunkedGames`, `unwrapGamesFile`, `decodeGameCategories` e `isGamesMainWrapper` existen **desde el tag 1.5** (verificado: `git tag --contains` del commit `ab1035e`/`623e9d6` → 1.5…2.5). En `master` (2.5, lo desplegado) el camino de lectura los invoca (`gistRepository.ts:1102-1105`). Por tanto, cualquier cliente ≥1.5 que lea un gist ya en formato v4 **lo reconstruye correctamente** — no existe el caso "cliente viejo interpreta el envoltorio como plano y sobrescribe con vacío".
2. **Salvaguarda anti‑pérdida.** `unwrapGamesFile` **lanza** en vez de devolver listas vacías si el envoltorio traía juegos pero ninguno se pudo ubicar (`legacyGamesFormat.ts:86-88`); `assembleChunkedGames` conserva lo disponible si falta/está corrupto un chunk (`legacyGamesFormat.ts:113-119`). Una escritura nunca parte de un estado vacío por error de parseo.
3. **Cutover idempotente y sin pérdida, con test.** `gistV4Cutover.realData.test.ts` reproduce sin red el flip exacto sobre los **datos reales** del usuario: plano → detecta upgrade → reescribe v4 → segunda lectura reconstruye el `TabData` **idéntico** → v4→v4 ya no pide re‑upgrade. Las suites de escritura v4 (`gistWrite.test.ts`) pasan con el flag ON (comprobado en local).
4. **Ningún gist actual supera el límite.** El camino flag‑OFF bloquea la escritura a 950 KB (`assertGistSizeWithinLimit`), así que **no hay gists planos por encima de 950 KB**. La reescritura de upgrade (ancla + chunks <800 KB con deduplicación) **cabe** y la primera migración no puede fallar por tamaño.
5. **Service worker orientado a frescura.** *Network‑first* para navegación HTML y *always‑network* para `/assets/` con hash (`public/service-worker.js:56-83`), `skipWaiting()` + `clients.claim()` y purga de cachés viejas en `activate`. Una recarga con red entrega el bundle nuevo; subir `CACHE_NAME` acelera la adopción.
6. **Lectura social ajena es de solo lectura.** Otros usuarios que lean tu gist de juegos usan `readForeignGamesGist` (`gistRepository.ts:1183-1203`): misma tubería de decodificación, **sin** reescritura ni upgrade. La parte social no es un vector de churn.

### ⚠️ Único efecto transitorio: flip‑flop entre dispositivos con bundles mezclados

Mientras conviven, para el **mismo usuario**, un dispositivo con el bundle nuevo (flag ON, escribe v4) y otro con un bundle viejo aún cargado (flag OFF), ocurre que:

- el cliente flag‑OFF lee el v4 correctamente, **pero** `gamesGistNeedsRewrite` devuelve `true` para el envoltorio (`legacyGamesFormat.ts:143`) → lo **rebaja a plano** en su siguiente sync;
- el cliente flag‑ON vuelve a subirlo a v4 → ping‑pong.

Acotación del riesgo: **los datos convergen** (merge CRDT determinista, sin pérdida); es churn de ancho de banda/rate‑limit, no corrupción. Solo afecta a usuarios **multi‑dispositivo** con una pestaña vieja **abierta sin recargar** durante el despliegue. Se autosana en cuanto esa pestaña recarga (el SW network‑first entrega el bundle nuevo).

**Mitigaciones (elige según cuánto quieras blindar):**
- **Mínima (recomendada):** subir `CACHE_NAME` (A4) y publicar como tag nuevo. La ventana de churn queda en "pestañas viejas abiertas", autosanable; cero pérdida.
- **Cero‑churn (opcional, release intermedia):** antes del flip, publicar una versión con el flag aún OFF donde `gamesGistNeedsRewrite` **deje de rebajar** un envoltorio v4 válido (devolver `false` para v4 bien formado). Así un cliente flag‑OFF *tolera* el v4 sin pelear. (Nota: una **edición** desde un cliente flag‑OFF aún reescribe plano, porque su `writeGist` escribe plano por definición; por eso esto reduce, no elimina, y solo merece la pena si hay muchos usuarios multi‑dispositivo simultáneos.)

### Resumen

| Escenario | ¿Afecta? | Detalle |
|-----------|----------|---------|
| Usuario 1 dispositivo, recarga normal | ✅ No | Upgrade único a v4, round‑trip exacto |
| Usuario ≥1.5 leyendo gist v4 | ✅ No | Lectura ya soportada desde 1.5 |
| Lectura social de gist ajeno | ✅ No | Solo lectura, sin reescritura |
| Multi‑dispositivo, bundles mezclados | ⚠️ Churn transitorio | Sin pérdida (CRDT); autosana al recargar |
| Bundle **pre‑1.5** abierto sin recargar | ❗ Teórico | Único caso sin lector v4; inexistente en la práctica (actual = 2.5) |

---

## Plan

Dos frentes: **(A) capacidad por usuario grande dentro de un gist** (barato, casi hecho) y **(B) verdadero multi-gist** (net-new, solo si A no basta). Más **(C)** higiene de offline/listados/social.

### Fase A — Activar E4: multi-fichero + diccionarios v4 (1 gist) — *prioridad alta, bajo coste*

Es el mayor salto de capacidad por menor esfuerzo: los diccionarios deduplicados reducen mucho el tamaño y el multi-fichero aleja el muro. Código ya escrito; falta el flip gated. **La compatibilidad con usuarios actuales está verificada — ver sección "Compatibilidad" más abajo.**

Pasos en orden:

1. **A1 — Pre-requisito ya cumplido (verificado).** La lectura del envoltorio v4 (`assembleChunkedGames` + `unwrapGamesFile` + `decodeGameCategories`) existe **desde el tag 1.5** y está en `master`/2.5 desplegado. No hace falta un deploy previo de "solo lectura": ya está en producción.
2. **A2 — Arreglar el test de semántica flag‑OFF.** `tests/unit/gistLegacyUpgrade.test.ts` ("ante un 304 con gist ya ACTUAL… sin reescritura espuria") asume que *actual = plano*. Con el flag ON, un gist plano pasa a *necesita upgrade* (`gamesGistNeedsUpgradeToWrapper`), así que ese test **falla** (comprobado). Actualizarlo para que "ya ACTUAL" signifique un **envoltorio v4** cuando el flag está activo.
3. **A3 — Flip.** Poner `ENABLE_GAMES_WRAPPER_WRITE = true` (`gistRepository.ts:55`). Con esto:
   - escritura ancla + `myGames-chunk-cN.json` + borrado de chunks obsoletos (ya implementado, `gistRepository.ts:1238-1250`);
   - `wasLegacy` pasa a `gamesGistNeedsUpgradeToWrapper` (ya cableado, `gistRepository.ts:1109`): cada gist plano existente se reescribe **una vez** a v4 en el primer sync (cutover idempotente; cubierto por `gistV4Cutover.realData.test.ts`, que valida round‑trip exacto sobre los datos reales del usuario).
4. **A4 — Forzar bundle fresco.** Subir `CACHE_NAME` del service worker (`public/service-worker.js:6`, `mygamelist-v6` → `v7`). El `activate` purga cachés viejas y `clients.claim()` adopta el nuevo SW; combinado con la estrategia *network‑first* para HTML y *always‑network* para `/assets/`, los clientes con red convergen al flag ON en la siguiente navegación. Esto **minimiza la ventana de flip‑flop** (ver Compatibilidad).
5. **A5 — Verificación pre‑release.** Ejecutar la batería con el flag ON en la rama de release (las suites `describe.skipIf(!ENABLE_GAMES_WRAPPER_WRITE)` de `gistWrite.test.ts` y `gistV4Cutover.realData.test.ts` solo corren entonces). Confirmar: round‑trip exacto, idempotencia v4→v4, y que ningún fichero supera 950 KB.
6. **A6 — Gist social (paralelo).** Aplicar el mismo envoltorio + `chunkIndex` al gist social (`SocialGistData.chunkIndex` ya tipado) para que la lista pública grande también particione.
7. **A7 — Reescritura incremental.** En `writeGist`, recomputar y subir **solo los chunks cuyo checksum cambió** (el ancla siempre). Hoy reescribe todos los ficheros en cada PATCH; con datos grandes esto es ancho de banda y rate‑limit desperdiciados.

**Salida:** un usuario realista (miles de juegos) deja de chocar con 950 KB; el gist se reparte en ficheros <800 KB dentro de un único gist, y la deduplicación de categorías reduce el tamaño total.

### Fase B — Guarda de tamaño total + overflow a un segundo gist — *solo si A no alcanza*

Activar únicamente cuando el **gist completo** (ancla + todos los chunks) se acerque al límite práctico de GitHub.

1. **B1.** Añadir guarda de **tamaño total** del gist (suma de ficheros) además de la guarda por fichero; al superar el umbral, **no lanzar**: derivar a overflow.
2. **B2.** Implementar **gists de overflow** (lo que hoy es solo tipo):
   - escritura: crear gist(s) adicionales, escribir chunks con `ChunkRef.gistId = <id overflow>`;
   - persistir los IDs en `privateConfig.gamesChunks` / `socialChunks` (las reglas **ya lo permiten**, `firestore.rules:40-43`) para descubrimiento cross-device;
   - lectura: ampliar `assembleChunkedGames` para **buscar chunks con `gistId != null`** (fetch del gist de overflow) además del mismo gist;
   - merge/CRDT y borrado de chunks obsoletos a través de varios gists.
3. **B3.** Recuperación cross-device: al recuperar config por Google, leer `gamesChunks`/`socialChunks` de Firestore para reconstruir el conjunto de gists.

> Nota: el roadmap actual marcó esto como _"no urgente"_ y eligió multi-fichero. Esta fase es la que **realmente** habilita "varios gists" y debe planificarse explícitamente si ese requisito es firme.

### Fase C — Higiene de escala (independiente) — *prioridad media*

1. **C1 (offline/localStorage).** Dejar de serializar el estado completo en localStorage cuando supere un umbral; usar IndexedDB como fuente primaria y localStorage solo como _hint_/arranque. Evita `QuotaExceededError` silencioso.
2. **C2 (carga).** Hidratación/merge por lotes o diferida para listas grandes (los stores `games`/`deleted` ya tienen índices `_tab`/`_ts`); evitar `getAll()` íntegro y mapas de todo el dataset en RAM.
3. **C3 (social N+1).** Cargar el directorio de forma incremental/perezosa (por viewport) en lugar de 30 lecturas en `Promise.all`; subir TTL o revalidar por ETag para no refrescar tras 30 min al cambiar de pestaña.
4. **C4 (feed).** Virtualizar el feed social (mismo patrón que `GameTable`) y no materializar 300 items.
5. **C5 (publicación social).** Publicar **deltas** del gist social (append al `activityFeed`/chunk afectado) en vez de reescribir el documento completo.
6. **C6 (listados >10k).** Si se persigue >10 k juegos: indexar en memoria (Map por id/nombre) o mover filtro/orden a un Web Worker.

---

## Recomendación

- Si el objetivo es **"un usuario grande funcione sin romperse"** → **Fase A** (+ C1/C2) cubre el caso real con poco riesgo: quita el muro de 950 KB y aprovecha la deduplicación. Es lo que el propio diseño dejó listo y apagado.
- Si el requisito de **"varios gists"** es firme (datos por encima de lo que cabe en un único gist incluso troceado) → hay que ejecutar **Fase B**, que es trabajo nuevo no contemplado hoy.
- **C3–C5** mejoran la eficiencia social y conviene abordarlas en paralelo, son ortogonales a A/B.
