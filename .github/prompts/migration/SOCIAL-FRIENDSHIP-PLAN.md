# Plan: Sistema de amistad (peticiones con aceptación mutua) en la parte social

## Objetivo

Introducir relaciones de **amistad bidireccionales** en el hub social:

- **Feed ("Actividad social")**: solo muestra actividad/publicaciones de **tus amigos** (hoy es global → ~30 gists).
- **Perfiles (directorio)**: siguen apareciendo **todos**, pero el perfil de quien **no es amigo** muestra **solo nombre y foto + botón "Añadir amigo"** (sin reseñas, sin ruleta "Elige tu próximo juego", sin listados de juegos).
- **Amistad = mutua**: solo se es amigo cuando **ambos** han confirmado (uno envía petición, el otro la acepta).
- **Eficiencia**: el rediseño **reduce** llamadas, no las aumenta (ver §"Presupuesto de llamadas").

### Decisiones confirmadas con el usuario
1. **Perfil no-amigo** → solo nombre y foto (el directorio deja de leer gists ajenos).
2. **Gestión de peticiones** → bandeja global de "Solicitudes" con icono + badge de pendientes.
3. **Acciones** → ciclo completo: enviar, cancelar (enviada), aceptar, rechazar (recibida), eliminar amistad.

### Ajustes v2 (tras revisar el código)
- **A1 — Denormalización en el doc de amistad**: cada parte escribe SUS datos (`name`, `photo`, `socialGistId`, `gamesGistId`) en el propio doc. El directorio está capado a 30 (`SOCIAL_DIRECTORY_LIMIT`) y leer perfiles sueltos por `uid` choca con las reglas (`profiles` solo legible si `social.enabled==true`). Denormalizar hace el doc **autosuficiente** (lista de amigos, bandeja y feed sin depender del directorio ni de su tope) → escala y minimiza llamadas.
- **A2 — `uid` en la proyección de `listSocialDirectory`**: necesario para mapear tarjeta→estado y para enviar peticiones; robusto ante el cutover `uid→profileId`.
- **A3 — Feed desacoplado del directorio**: se construye leyendo los gists de amigos por su `socialGistId` denormalizado + la actividad propia.
- **A4 — Reglas en dos fases** (`diff().affectedKeys()`): el `requester` escribe sus campos en `create`; el `recipient` acepta y escribe los suyos en `update`; cada parte puede "sanear" (heal) solo sus propios campos.
- **Coste asumido**: nombre/foto denormalizados pueden quedar levemente desactualizados en la lista (el detalle lee en vivo del gist). Mitigable con "heal on save" (paso posterior opcional).

---

## Diagnóstico de la base actual (lo que condiciona el diseño)

- **Identidad verificable**: Firebase Auth (Google) → `uid` estable + `email` verificado. En reglas de Firestore solo `request.auth.uid` es comprobable ⇒ **la amistad se modela por `uid`**.
- **Directorio**: colección Firestore `profiles/{uid}` con `{ uid, profileId, email, displayName, photoURL, social:{ enabled, gistId, gamesGistId } }`; legible por cualquier autenticado si `social.enabled==true`. Ya devuelve **nombre y foto sin leer ningún gist**.
- **Stubs ya reservados**: las reglas (`firestore.rules`) ya tienen `match /friendships/{docId}` (hoy **admin-only**) — el sitio existe; hay que abrir las reglas y escribir la capa cliente (hoy no hay código de amistad).
- **Feed actual** (`useSocialViewModel.ts` → `hydrateSocialDirectory`): lee `listSocialDirectory(30)` y, **por cada perfil**, su gist social (concurrencia 6) para sacar favoritos/actividad/posts. Es la operación cara.
- **Detalle de perfil ajeno**: además baja su **gist de listados completo** (caché IndexedDB 24 h) para reseñas/listados + ruleta. Más caro todavía.
- **Cutover futuro**: hay un plan de pasar el id del doc de directorio de `uid` → `profileId` (`isOwnProfileIdentity` ya tolera ambos). La amistad será **uid-based**; la resolución de nombre/foto se hará por el **campo `uid`** del doc de perfil (siempre presente por `profileWriteIsValid`), no por el id del doc → robusto ante el cutover. **Riesgo registrado**, ver §Riesgos.

---

## Modelo de datos (Firestore — colección `friendships`)

**Un documento por par no ordenado**, con **id determinista canónico** para garantizar un único doc por pareja y evitar duplicados A→B / B→A:

```
docId = `${minUid}__${maxUid}`   // los dos uid ordenados lexicográficamente
```

Campos del documento (denormalizados — cada parte escribe SOLO los suyos):

```ts
interface FriendshipDoc {
  users: [string, string];           // [uidA, uidB] ORDENADOS — habilita `array-contains` y la regla
  requester: string;                 // uid de quien envió la petición (∈ users)
  recipient: string;                 // uid del otro (∈ users)
  status: 'pending' | 'accepted';
  createdAt: number;
  updatedAt: number;
  // Identidad/punteros denormalizados (A1) — el requester los pone en create; el recipient los suyos al aceptar.
  requesterName: string;  requesterPhoto: string;  requesterSocialGistId: string;  requesterGamesGistId: string;
  recipientName: string;  recipientPhoto: string;  recipientSocialGistId: string;  recipientGamesGistId: string;
}
```

Con esto la bandeja, la lista de amigos y el feed se resuelven **desde el propio doc**, sin leer el directorio ni perfiles sueltos (evita el tope de 30 y el choque con las reglas de `profiles`).

- **Amigos** = doc con `status === 'accepted'`.
- **Pendiente** = `status === 'pending'`; el `recipient` puede **aceptar** (→`accepted`) o **rechazar** (borra doc); el `requester` puede **cancelar** (borra doc).
- **Eliminar amistad** = borrar el doc `accepted`.
- **Rechazo/cancelación = borrado del doc** (sin tombstone): mantiene la colección pequeña y permite volver a pedir. *(Si más adelante se quiere "bloquear tras rechazo", se añade un estado `blocked`; fuera de alcance ahora.)*

### Por qué id canónico
Si A y B se piden a la vez, ambos resuelven al **mismo** `docId`: una creación gana y la otra falla por doc existente. Además, si B pulsa "Añadir" cuando A ya le envió petición, el doc ya existe con `requester=A, status=pending` ⇒ el cliente convierte el "Añadir" en **Aceptar** (lo sabe por el estado ya cacheado). Cero documentos duplicados, cero peticiones cruzadas.

---

## Reglas de Firestore (reescribir `match /friendships/{docId}`)

Sustituir el bloque admin-only por reglas que el dueño pueda usar, validando integridad:

```
match /friendships/{docId} {
  function isParticipant() {
    return isSignedIn() && request.auth.uid in resource.data.users;
  }
  function newDocIsValid() {
    return request.resource.data.keys().hasOnly([
        'users','requester','recipient','status','createdAt','updatedAt',
        'requesterName','requesterPhoto','requesterSocialGistId','requesterGamesGistId'
      ])
      && request.resource.data.users.size() == 2
      && request.resource.data.users[0] < request.resource.data.users[1]      // orden canónico
      && docId == request.resource.data.users[0] + '__' + request.resource.data.users[1] // id canónico
      && request.auth.uid == request.resource.data.requester                  // solo creas peticiones TUYAS
      && request.resource.data.requester in request.resource.data.users
      && request.resource.data.recipient in request.resource.data.users
      && request.resource.data.recipient != request.resource.data.requester
      && request.resource.data.status == 'pending';
  }
  function acceptTransition() {
    // El recipient pasa pending → accepted y escribe SOLO sus campos denormalizados + updatedAt.
    return request.auth.uid == resource.data.recipient
      && resource.data.status == 'pending'
      && request.resource.data.status == 'accepted'
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
        'status','updatedAt','recipientName','recipientPhoto','recipientSocialGistId','recipientGamesGistId'
      ]);
  }
  function healOwnFields() {
    // Cada parte puede refrescar SOLO sus propios campos denormalizados (nombre/foto), sin tocar estado ni identidad.
    return request.resource.data.status == resource.data.status
      && request.resource.data.users == resource.data.users
      && request.resource.data.requester == resource.data.requester
      && request.resource.data.recipient == resource.data.recipient
      && (
        (request.auth.uid == resource.data.requester
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'requesterName','requesterPhoto','requesterSocialGistId','requesterGamesGistId','updatedAt']))
        ||
        (request.auth.uid == resource.data.recipient
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'recipientName','recipientPhoto','recipientSocialGistId','recipientGamesGistId','updatedAt']))
      );
  }

  allow read:   if !isPlaceholder(docId) && (isAdmin() || isParticipant());
  allow create: if !isPlaceholder(docId) && (isAdmin() || newDocIsValid());
  allow update: if !isPlaceholder(docId) && (isAdmin() || (isParticipant() && (acceptTransition() || healOwnFields())));
  allow delete: if !isPlaceholder(docId) && (isAdmin() || isParticipant());   // cancelar / rechazar / eliminar
}
```

> **Acción de usuario**: desplegar `firestore.rules` (consistente con `PENDING.md`, los despliegues de reglas son acciones manuales). El emulador permite testearlas (§Tests).

**Sin índices compuestos**: las consultas usan `array-contains` de campo único (auto-indexado) y el filtrado por estado se hace en cliente (ver abajo).

---

## Consultas y estrategia de lectura (núcleo de la eficiencia)

### Una sola consulta para TODO el estado de relación
```ts
query(collection(db,'friendships'), where('users','array-contains', myUid))
```
Devuelve **todas** mis relaciones (pendientes + aceptadas) en **una lectura**. Se derivan en cliente:
- `friends`   = docs `accepted` → set de uids.
- `incoming`  = docs `pending` con `recipient === myUid`.
- `outgoing`  = docs `pending` con `requester === myUid`.

Sin índice compuesto, sin doble query. Se **cachea** (IndexedDB + caché de sesión corta ~60 s + dedupe in-flight, mismo patrón que `findSocialProfileByEmail`). Se **invalida** tras cualquier mutación.

### Resolución de nombre/foto de amigos y solicitantes
Los docs guardan `uid`. Para pintar nombre/foto: `getProfilesByUids(uids)` →
```ts
query(profiles, where(documentId(),'in', batchDe30(uids)))   // 1 lectura por lote de ≤30
```
Cacheado como el directorio (~30 min). **No** lee ningún gist.

---

## Rediseño del flujo de lecturas (dónde se ahorran llamadas)

Hoy `hydrateSocialDirectory` lee `listSocialDirectory(30)` **y** el gist social de cada perfil. Se **divide** en dos caminos:

1. **Directorio (pantalla Perfiles)** → **solo Firestore**, sin gists. `listSocialDirectory` ya trae `displayName` + `photoURL`. Cada tarjeta = avatar + nombre + botón de estado (el estado sale del set de amistad cacheado). **0 lecturas de gist** (hoy son ~30).
2. **Feed ("Actividad social")** → leer el gist social **solo de los amigos** que estén en el directorio. Si no tienes amigos → feed vacío con CTA "añade amigos", **0 lecturas de gist**.
3. **Detalle de perfil**:
   - **Amigo / propio** → comportamiento completo actual (gist social + gist de listados con caché 24 h, reseñas, ruleta, listados).
   - **No amigo** → solo hero (nombre/foto) + botón "Añadir amigo"/estado. **No** se dispara `loadForeignProfileGames` (hay que añadir esa guarda en el efecto de `useSocialViewModel.ts` que hoy baja la lista ajena).
4. **Bandeja de solicitudes** → nombres/fotos vía `getProfilesByUids` (Firestore). **0 gists.**

---

## Presupuesto de llamadas (antes vs después)

| Acción | Hoy | Con amistad |
|---|---|---|
| Abrir Perfiles (directorio) | 1 query + **~30 gists** | 1 query + **1 query amistad** (cacheada) + **0 gists** |
| Abrir Feed | incluido en lo anterior (~30 gists) | **nº de amigos** gists (≤ amigos), 0 si no hay amigos |
| Abrir perfil de no-amigo | gist social + **gist de listados** | **0 gists** |
| Abrir perfil de amigo | gist social + gist de listados | igual (caché 24 h) |
| Ver solicitudes | — | 1 query (cacheada) + 1 query perfiles por lote |

Resultado: el caso común (navegar el directorio, mirar el feed con pocos amigos) pasa de decenas de lecturas de gist a **un puñado de queries Firestore baratas + los gists solo de tus amigos**.

---

## Capa cliente nueva: `src/model/repository/friendshipRepository.ts`

- `getMyFriendships(myUid, { forceRefresh? }): Promise<{ friends, incoming, outgoing, byOtherUid: Map<uid, FriendshipDoc> }>`
  - 1 query `array-contains`; categoriza; caché IndexedDB + sesión + dedupe in-flight; degradación a vacío si Firestore falla (no rompe la UI, mismo criterio que el resto del social).
- `requestOrAccept(myUid, otherUid)`:
  - Mira el estado cacheado. Si existe doc `pending` con `recipient===myUid` → **aceptar**. Si no existe → **crear** `pending` con id canónico (`setDoc`, sin merge). Maneja "ya existe" releyendo y resolviendo.
- `acceptFriendRequest(docId)` → `updateDoc({ status:'accepted', updatedAt })` (las reglas garantizan que solo el recipient puede).
- `cancelFriendRequest(docId)` / `rejectFriendRequest(docId)` / `removeFriend(docId)` → `deleteDoc`.
- `getProfilesByUids(uids)` → resolución de identidad por lotes (en `firebaseSocialRepository.ts`).
- Toda mutación **invalida** la caché de amistad y notifica al VM para re-derivar.

Tipos en `src/model/types/social.ts`: `FriendshipDoc`, `FriendshipStatus`, `RelationshipState = 'none' | 'outgoing' | 'incoming' | 'friends'`.

---

## Cambios en el ViewModel (`src/viewmodel/useSocialViewModel.ts`)

- Estado nuevo: `friends: Set<uid>`, `incomingRequests`, `outgoingRequests`, `loadingFriendships`.
- Efecto que llama a `getMyFriendships` al entrar al espacio social (tras tener `authUser`); cacheado/dedupe.
- Helper `relationshipWith(uid): RelationshipState` para que las tarjetas y el detalle pinten el botón correcto.
- `feedItems` / `activityFeedItems`: filtrar a `entry` cuyo dueño ∈ `friends` (mapeo entry→uid por `entry.id`/campo uid del perfil).
- Dividir `hydrateSocialDirectory` en `loadDirectoryList` (Firestore, sin gists) + `hydrateFriendsFeed` (gists solo de amigos).
- Guarda en el efecto que baja la lista ajena: **no** ejecutar `loadForeignProfileGames` si el perfil no es amigo ni propio.
- Handlers: `handleAddOrAccept`, `handleCancel`, `handleReject`, `handleRemoveFriend` (optimistas + invalidación + feedback con los `SOCIAL_UI.status` existentes).
- Conteo `pendingIncomingCount` para el badge.

---

## Cambios de UI

- **Cabecera social** (`SocialFeedScreen.tsx` / `SocialHub.tsx`): icono **"Solicitudes"** con **badge** = nº de pendientes recibidas. Ruta nueva `/social/requests`.
- **Nueva pantalla `SocialRequestsScreen.tsx`** (presentacional): dos listas — **Recibidas** (Aceptar / Rechazar) y **Enviadas** (Cancelar), cada una con avatar + nombre (de `getProfilesByUids`). Estados vacíos y accesibilidad (botones con `aria-label`, badge con texto accesible, navegación por teclado) siguiendo los patrones del hub.
- **`SocialProfilesScreen.tsx`**: tarjetas = avatar + nombre + **botón de estado** (`Añadir amigo` / `Pendiente` / `Aceptar` / `Amigos ✓`). Se elimina de la tarjeta la info derivada de gist (favoritos/recomendaciones) porque el directorio ya no lee gists.
- **`SocialProfileDetailScreen.tsx`**: si **no** es amigo ni propio → ocultar botón **Reseñas**, **"Elige tu próximo juego"** (ruleta) y los **listados/pestañas**; mostrar hero (nombre/foto) + CTA **"Añadir amigo"**/estado. Si es amigo/propio → comportamiento completo actual intacto.
- **`SocialFeedScreen.tsx`**: estado vacío cuando no hay amigos → CTA hacia Perfiles.
- Etiquetas nuevas en `src/core/constants/labels.ts` (`SOCIAL_UI`): textos de botones/estado/solicitudes/feedback (es).

---

## Migración / rollout

- **Aditivo**: nueva colección + reglas + UI nueva. **No** cambia el formato de gists ni los esquemas existentes.
- **Caché de amistad en IndexedDB**: añadir object store `friendshipsCache` (keyPath por `myUid`) ⇒ subir `DB_VERSION` con upgrade aditivo. *(Alternativa sin bump: reutilizar `localMeta` como kv; se elige store dedicado por claridad y limpieza por TTL.)*
- **Despliegue de reglas** requerido antes de activar la UI (acción de usuario).
- **Efecto en usuarios existentes**: el feed pasa de global a solo-amigos ⇒ tras el rollout verán el feed vacío hasta añadir amigos. Mitigación: el estado vacío del feed enlaza a Perfiles ("descubre y añade amigos"). La pantalla Perfiles sigue mostrando a todos.

---

## Riesgos y consideraciones

- **Cutover `uid`→`profileId` del directorio**: la amistad es uid-based (única identidad verificable en reglas). La resolución de nombre/foto se hace por el **campo `uid`** del doc de perfil (estable en ambas eras), no por el id del doc. Documentado para no romper en el cutover.
- **Privacidad**: el gist social y el de listados siguen siendo "secretos" legibles por ID (postura actual). El gating amigo/no-amigo es **de UI** y, de hecho, **deja de exponer** datos de no-amigos al no leer sus gists. Sin regresión de privacidad; mejora el consumo.
- **Carreras de petición simultánea**: resueltas por el id canónico (un único doc por par) + lógica `requestOrAccept`.
- **Amigo que borra perfil / desactiva social**: el doc de amistad persiste pero su perfil no resuelve → mostrar "Usuario no disponible" + permitir eliminar.
- **Escala de amigos > 30**: `getProfilesByUids` por lotes de 30 (`in`); `array-contains` no tiene tope práctico aquí.
- **Rate-limit GitHub**: los gists de amigos quedan acotados por el nº de amigos y siguen usando las cachés de sesión + IndexedDB existentes.

---

## Orden de entrega (commits independientes, Conventional Commits)

1. `feat(social): friendship data model and firestore rules` — tipos `FriendshipDoc`, reescritura de `match /friendships`, `friendshipRepository` (queries + mutaciones + `getProfilesByUids`). *(Desplegar reglas.)*
2. `feat(social): load friendship state in social view model` — carga/caché/derivación de friends/incoming/outgoing + `relationshipWith`.
3. `feat(social): requests inbox with badge` — `SocialRequestsScreen` + ruta `/social/requests` + icono/badge en cabecera.
4. `feat(social): add-friend button and relationship states on profiles` — tarjetas del directorio + CTA en el detalle.
5. `feat(social): gate reviews, roulette and lists to friends` — gating en `SocialProfileDetailScreen` + guarda para no bajar el gist de listados de no-amigos.
6. `feat(social): friends-only activity feed` — dividir `hydrateSocialDirectory` (lista Firestore-only + feed solo-amigos) + estado vacío con CTA.
7. `test(social): cover friendship rules, repository and ui states` — reglas (emulador), repositorio, y componentes/VM.

> Los ahorros de llamadas aterrizan en los pasos **4–6**. El paso **1** exige desplegar reglas.

---

## Plan de tests

- **Reglas (emulador Firestore)**: solo el `recipient` acepta; solo participantes leen/borran; `requester == auth.uid` en create; id canónico obligatorio; campos inmutables en update.
- **Unit `friendshipRepository`**: categorización friends/incoming/outgoing; id canónico (orden de uids); `requestOrAccept` (crea vs acepta); TTL/invalidación de caché; degradación a vacío sin Firestore.
- **Componentes**: estados del botón en las tarjetas; bandeja (aceptar/rechazar/cancelar); `SocialProfileDetailScreen` no-amigo (oculta reseñas/ruleta/listados, muestra "Añadir amigo"); feed solo-amigos + estado vacío.
- **VM**: el feed se reduce a amigos; el directorio no dispara lecturas de gist.
