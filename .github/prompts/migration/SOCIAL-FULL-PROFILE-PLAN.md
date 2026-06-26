# Plan: Fotos de perfil, reseña/perfil completos de otros usuarios y caché diaria en IndexedDB

## Diagnóstico (causa raíz de cada problema)

1. **Solo se ve la foto propia.** La foto propia sale de la sesión Google (`useSocialViewModel.ts:950`, `ownPhotoURL`). La de otros depende exclusivamente de `socialData.profile.photoURL` publicado en su gist social, y solo se publica `if (showPhoto && authUser.photoURL)` (`useSocialViewModel.ts:1121`). Hay que (a) diagnosticar por qué no propaga (probable: gists ya publicados sin `photoURL`, o falta de re-publicación) y (b) garantizar que se muestra por defecto. Además, hoy el **avatar no es clicable** y el **nombre solo es clicable en el detalle** (`SocialDetailScreen.tsx:88-95`), no en el feed ni en la actividad.

2. **De otros solo se ve "la parte social" (snippet).** Es **intencionado** por el diseño de privacidad E3: a otros se les deja `sharedLists` vacío y `getGameItemById` devuelve `null` para perfiles ajenos (`useSocialViewModel.ts:462, 552-588, 961`). No hay lista de juegos, ni puntos fuertes/débiles, ni categorías.

3. **Lecturas repetidas agotan el rate-limit del token.** La caché actual es de sesión (`sessionStorage`, 45 s social / 20 s juegos). No hay caché persistente por usuario.

## Hallazgo técnico clave

`readGist(token, gistId)` lee cualquier gist **por su ID usando el token del lector** (no el del dueño). Los gists "privados" de GitHub son en realidad *secretos* (accesibles por ID sin ser propietario) y `gamesGistId` ya viaja en el directorio de Firestore. Por tanto se puede leer el gist de listados de cada persona directamente, sin duplicar nada en el gist social. La decodificación (chunks/diccionarios v4) ya la hace `buildGistReadResponse`.

## Decisiones confirmadas
- **Privacidad:** respetar la visibilidad de cada usuario (pestañas ocultas, `hideReplayable`, `hideRetry`, `hideGameTime`).
- **Origen de datos:** leer la lista completa del **gist de listados de cada persona** por su `gamesGistId` (sin duplicar en el gist social).
- **Caché:** IndexedDB, servir **24 h sin tocar la red** + botón de refresco manual.
- **Fotos:** mostrar la de todos por defecto (respetando a quien la oculte).

> ⚠️ **Matiz de privacidad:** al leer el gist de listados completo, el filtro de visibilidad es **del lado cliente** (se descargan todos los datos y se ocultan en la UI los campos/pestañas marcados). Es lo coherente con la petición (ver la reseña completa, incluido el texto), pero el texto de reseña y demás campos pasan a ser legibles por quien tenga el `gamesGistId`. Se mantiene intacta la guarda `assertNoSocialPrivateFields` del **gist social** (ese canal sigue snippet-only); el cambio solo afecta a la lectura directa del gist de juegos.

## Bloques de trabajo

**Bloque 0 — Capa de datos: leer gist de listados ajeno** (`gistRepository.ts`)
- Nueva función `readForeignGamesGist(readerToken, gamesGistId)`: lee por ID con el token del lector, decodifica con la tubería existente (`assembleChunkedGames` → `unwrapGamesFile` → `migrateData`) y devuelve `TabData`. Sin efectos secundarios de migración/escritura ni el cache de sesión de "formato verificado".
- Errores: 404 (gist borrado), 403/rate-limit (propaga `retryAfterMs`), token ausente → el llamador hace fallback a snippet-only.

**Bloque 1 — Caché persistente 1 día en IndexedDB** (`indexedDbRepository.ts`)
- Reutilizar el object store **`profileCache`** ya existente (`idbConnectionRepository.ts:58-60`, keyPath `profileId`, índice `cachedAt`) — **no requiere migración de esquema**.
- Registro: `{ profileId, gamesGistId, cachedAt, games: TabData, visibility }`. Helpers `getCachedProfileGames`, `putCachedProfileGames`, `invalidateProfileGames`.
- Política: si `now - cachedAt < 24h` → servir de IndexedDB sin red. `forceRefresh` salta la caché y reescribe. Limpieza oportunista de caducados.

**Bloque 2 — Foto de perfil de todos** (`useSocialViewModel.ts`, pantallas social)
- Confirmar y arreglar la propagación de `photoURL` para otros (re-publicar al guardar perfil; `showPhoto` por defecto `true`).
- Mostrar la foto en feed, detalle y perfil de otros cuando exista.

**Bloque 3 — Reseña completa de otros** (`SocialDetailScreen.tsx`, `useSocialViewModel.ts`)
- Al abrir `/social/user/:id/game/:gameId/:type` de un perfil ajeno: obtener (vía caché del Bloque 1) su lista de juegos, localizar el `GameItem` por `gameId` y renderizar reseña completa + puntos fuertes/débiles + categorías, aplicando su visibilidad.
- Reemplazar el `return null` para perfiles ajenos en `getGameItemById` (`useSocialViewModel.ts:575-579`) por la lectura cacheada. Estado de carga + fallback a snippet.

**Bloque 4 — Perfil completo de otros** (`SocialProfileDetailScreen.tsx`, `useSocialViewModel.ts`)
- Al entrar a `/social/profiles/:profileId`: cargar la lista completa desde caché y renderizarla con `GameTable` en modo solo-lectura, filtrada por visibilidad.
- Botón de **refrescar** que fuerza relectura (invalida caché de ese perfil).

**Bloque 5 — Navegación a perfil (nombre + foto)**
- Hacer **nombre y avatar/foto clicables** hacia el perfil del usuario en feed, detalle y actividad. Misma acción `openProfileDetail(profileId)`. Accesible por teclado y con `aria-label`.

**Bloque 6 — Filtro de visibilidad (cliente)**
- Función pura que, dada la `visibility` del perfil y su `TabData`, devuelve lo visible (oculta pestañas y campos marcados). Se aplica en detalle (Bloque 3) y perfil (Bloque 4).

**Bloque 7 — Tests**
- Unit: `readForeignGamesGist`, caché TTL 24 h (hit/expiración/forceRefresh/invalidar), filtro de visibilidad.
- Componente: `SocialDetailScreen` y `SocialProfileDetailScreen` con datos de otro usuario; avatar/nombre clicables.

## Riesgos y consideraciones
- **Rate-limit/tokens:** mitigado por la caché de 24 h. Sin token → degradar a snippet-only.
- **Tamaño del gist de juegos:** puede venir en varios chunks; la tubería existente ya los ensambla.
- **Privacidad:** filtro cliente (matiz arriba). El gist social sigue snippet-only.
- **Sin migración de IndexedDB:** se reaprovecha `profileCache` (v3); no se sube `DB_VERSION`.

## Orden de entrega (commits independientes)
1. `feat(social): read foreign games gist by id` (Bloque 0)
2. `feat(social): cache foreign profiles in indexeddb 24h` (Bloque 1)
3. `fix(social): show every user's profile photo` (Bloque 2)
4. `feat(social): full review detail for other users` (Bloques 3 + 6)
5. `feat(social): full game list on other profiles` (Bloque 4 + refresco)
6. `feat(social): make name and avatar open the profile` (Bloque 5)
7. `test(social): cover foreign profile reads, cache and visibility` (Bloque 7)
