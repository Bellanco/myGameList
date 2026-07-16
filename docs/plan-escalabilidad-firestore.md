# Plan: escalabilidad de la integración con Firestore (grafo social)

> Objetivo: dejar escalable la capa social en Firestore para un objetivo realista de
> **cientos de amigos por usuario** (~500), sin sobre-ingeniar hacia "miles+". El foco es
> reducir el coste que crece linealmente con el número de amigos, que **no está en el número
> de documentos** sino en los **patrones de acceso** (escrituras y lecturas).

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al abordar cada fase,
> verifica el estado real del código (las líneas citadas pueden haberse movido), confirma los
> índices contra la consola de Firebase y actualiza este `.md` (marca lo confirmado, corrige lo
> que cambie, anota decisiones). Trátalo como código: se revisa y se actualiza con la implementación.

## TL;DR / recomendación

- **El modelo de datos ya es correcto.** `friendships` usa **un documento por pareja** (id canónico
  `minUid__maxUid`), no un doc por usuario ni A→B + B→A duplicados. Para N amistades globales hay N docs.
  **No hay que rediseñar el esquema.**
- Lo que crece "brutalmente" con el nº de amigos son **tres patrones de acceso**:
  1. **Amplificación de escrituras** en `healOwnFriendshipIdentity` — el más caro. *(Fase 1)*
  2. **Lectura no paginada** en `getMyFriendships`. *(Fase 2)*
  3. **Fan-out N+1 de gists** en el feed (contra GitHub, no Firestore). *(Fase 4 — fuera de alcance para "cientos")*
- Prioridad: **Fase 1** (80% del beneficio, mínimo riesgo) → **Fase 2 + 3** (código + índices) → Fase 4 solo documentada.

## Contexto de arquitectura (para quien implemente)

Firestore **no** guarda los datos pesados (juegos, reseñas, actividad social); esos viven en **GitHub
Gists**. Firestore actúa como **directorio de perfiles + grafo de amistad + configuración por usuario**.
Consecuencia: el fan-out costoso a escala del feed es contra la **API de GitHub Gists**, no contra Firestore.

Colecciones (todas en `src/model/repository/`):

| Colección | Fichero principal | Uso |
|---|---|---|
| `friendships/{minUid__maxUid}` | `firebaseFriendshipRepository.ts` | Grafo de amistad, 1 doc por pareja, identidad denormalizada |
| `profiles/{uid}` | `firebaseRepository.ts`, `firebaseSocialRepository.ts` | Directorio público (nombre/foto/gistId, `social.enabled`) |
| `privateConfig/{uid}` | `firebaseRepository.ts` | Owner-only: ids de gist + token GitHub cifrado |
| `publicConfig/{uid}` | `firebaseRepository.ts` | Owner-only: preferencias no sensibles (escala, tema…) |
| `userMap/{uid}` | `firebaseRepository.ts` | Owner-only: mapa uid→profileId |
| `feed`, `recommendations`, `activity_events` | — | **Sin uso desde el cliente** (staging de migración / admin-only) |

Único consumidor de alto nivel: `src/viewmodel/useSocialViewModel.ts`.

Esquema de `friendships` (`src/model/types/firestore.ts:64-79`): campos de identidad **denormalizados**
(`requesterName/Photo/SocialGistId/GamesGistId` + `recipient*`); cada parte escribe solo los suyos.
Esta denormalización es una **decisión deliberada** (resolver lista/bandeja/feed sin leer el directorio ni
chocar con las reglas de `profiles`) y **se mantiene** en este plan.

---

## Fase 1 — Matar la amplificación de escrituras · *prioridad máxima*

**Problema.** `healOwnFriendshipIdentity` (`firebaseFriendshipRepository.ts:276-324`) relee todos mis docs de
amistad y hace **1 `updateDoc` por cada amigo** (`Promise.all`, sin batching ni límite de concurrencia). Se
dispara al **abrir el hub** (1×/sesión, `useSocialViewModel.ts:499`) y en **cada guardado de perfil**
(`useSocialViewModel.ts:1646`). Con 500 amigos = 500 escrituras, la mayoría **inútiles** (el nick/foto casi
nunca cambian entre sesiones).

**Cambios.**

1. **Guard por huella de identidad (el gran ahorro).**
   - Calcular un `fingerprint` de `{name, photo, socialGistId, gamesGistId}` (hash estable, p. ej. el mismo
     util de `src/core/security/crypto.ts` o un hash simple).
   - Persistirlo por `uid` (IndexedDB vía `indexedDbRepository.ts`, o `localStorage`).
   - En `healOwnFriendshipIdentity`: si el fingerprint coincide con el último persistido → **return temprano
     sin leer ni escribir nada**. Actualizar el fingerprint solo tras un heal correcto.
   - Efecto: el caso normal (identidad estable) pasa a **0 lecturas y 0 escrituras**.

2. **Batching cuando sí hay cambio.**
   - Sustituir el `Promise.all` de N `updateDoc` por `writeBatch` en trozos de **≤450 operaciones** (límite
     Firestore = 500).
   - Las reglas `friendshipHealOwnFields` (`firestore.rules:174-188`) validan cada op del batch por separado,
     así que **no cambian**.
   - De N round-trips a 1-2 batches.

3. **Mantener** el guard once-per-session existente (`friendshipHealedRef`, `useSocialViewModel.ts:492-505`).

**Impacto.** De ~N escrituras por edición/sesión a **0 en el caso común** y 1-2 batches cuando de verdad
cambia la identidad. Resuelve el cuello principal.

**Riesgo.** Bajo. Cambio localizado en el repositorio + helper de fingerprint.

**Tests.** Ampliar `tests/unit/friendshipRepository.test.ts`: (a) skip total si el fingerprint no cambió;
(b) se emiten writes en batch si cambió; (c) el fingerprint se actualiza solo tras éxito. Revisar
`tests/unit/healOwnDirectoryGist.test.ts` por analogía.

---

## Fase 2 — Acotar la lectura no paginada

**Problema.** `getMyFriendships` (`firebaseFriendshipRepository.ts:102-175`) hace `where('users',
'array-contains', myUid)` **sin `limit`**: trae todos los docs. A "cientos" es asumible (1 query, cacheada
60 s), pero no hay cinturón de seguridad ante el caso patológico.

**Cambios.**

1. Añadir constante `FRIENDSHIPS_HARD_CAP` (p. ej. `1000`) y aplicar `limit(FRIENDSHIPS_HARD_CAP)` +
   `orderBy('updatedAt', 'desc')` para lectura determinista.
2. Si se alcanza el tope, emitir telemetría/log (nunca truncar en silencio) — reutilizar
   `reportHandledError`/`trackAnalyticsEvent` de `telemetryRepository.ts`.
3. **No** se pagina la UI: a "cientos" no compensa; la UI necesita `byOtherUid` completo para el estado O(1)
   en tarjetas/perfiles. La cota es una salvaguarda, no paginación real.

**Impacto.** Protege contra el caso patológico sin tocar la UI.

**Riesgo.** Bajo, pero `orderBy` + `array-contains` **exige índice compuesto** → ver Fase 3.

---

## Fase 3 — Alinear índices y limpiar deuda

1. **Declarar** en `firestore.indexes.json` el índice compuesto que exija la Fase 2:
   `friendships` → `users` (array-contains) + `updatedAt` (desc).
2. **Verificar** en la consola de Firebase si la query del directorio
   (`profiles`: `where('social.enabled','==',true)` + `where(documentId(),'!=','_placeholder')` + `limit`,
   `firebaseSocialRepository.ts:181-186`) requiere índice compuesto; declararlo si Firebase lo pide.
3. **Índices `feed`:** los 2 únicos índices declarados hoy apuntan a la colección `feed`, que **no se usa
   desde el cliente**. ⚠️ `feed` es un **destino de migración documentado** (`firestore.ts:24-40`).
   **No borrar por defecto** — señalar como deuda y decidir explícitamente. (Coherente con la regla de no
   eliminar staging de migración.)

---

## Fase 4 — Fan-out de gists del feed · *fuera de alcance para "cientos", solo documentado*

**Problema.** El feed lee **1 gist de GitHub por amigo** (`useSocialViewModel.ts:1353-1449`,
`readPublicSocialGistById`), crece linealmente con el nº de amigos y consume rate-limit de GitHub.

**Mitigaciones ya existentes (suficientes a "cientos"):** feed solo-amigos (`useSocialViewModel.ts:1320-1323`),
concurrencia limitada (`SOCIAL_DIRECTORY_FETCH_CONCURRENCY = 6`), caché persistente del directorio en
IndexedDB (30 min), throttling del refresco manual (`FORCED_REFRESH_MIN_MS = 12 s`).

**Solución "miles+" (NO implementar ahora):** materializar un feed / doc de "última actividad" por usuario en
Firestore para el corte visible, leyendo el gist solo al abrir el detalle. Implica reintroducir escrituras al
publicar actividad y (posiblemente) la colección `feed`. Anotado como trabajo futuro.

---

## Qué NO se hace (por decisión de escala "cientos")

- **No** des-normalizar la identidad (sería el rediseño "miles+"; obliga a tocar reglas de seguridad).
- **No** materializar el feed (Fase 4).
- **No** borrar índices/tipos de `feed`/`recommendations`/`activity_events` (staging de migración).
- **No** paginar la UI de amigos.

## Orden de entrega sugerido

1. **PR-1 (Fase 1):** guard por fingerprint + batching en `healOwnFriendshipIdentity`. Pequeño, alto impacto.
2. **PR-2 (Fases 2 + 3):** cota de lectura + índices (`firestore.indexes.json`).
3. **Fase 4:** queda solo como esta sección del documento.

## Checklist de verificación al implementar

- [ ] Fase 1: editar el perfil sin cambiar nada → 0 escrituras en `friendships` (comprobar en Network/consola Firestore).
- [ ] Fase 1: cambiar nick → 1-2 batches, no N writes sueltas.
- [ ] Fase 2: el índice compuesto está desplegado antes de mergear la query con `orderBy`.
- [ ] Fase 3: query del directorio de `profiles` no lanza "requires an index" en consola.
- [ ] Tests unitarios verdes (`friendshipRepository`, `healOwnDirectoryGist`).
