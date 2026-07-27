# Plan — reseñas que no salen en el feed de actividad (usuarios recién llegados)

> **Estado:** pasos 1, 1b, 1c y 2 IMPLEMENTADOS. Pendientes: 3 (deriva de gist), 4 (tope del directorio) y
> 5 (`updateGistPrivacy`). La Fase 0 sigue siendo útil para confirmar en los usuarios ya afectados que su
> actividad se recupera (o si además hay deriva de gist, que es el paso 3).
>
> Piezas nuevas: `src/model/repository/socialActivityReconcile.ts` (reconciliación + marca de pendiente) y
> `src/model/repository/socialChannel.ts` (`resolveSocialChannel`). Tests:
> `tests/unit/socialActivityReconcile.test.ts`, `tests/unit/socialPublishArmChannel.test.ts` y la regresión de
> C2 en `tests/component/SocialHub.test.tsx`.

## Síntoma

Un amigo publica su primera reseña. En su **perfil → Reseñas** se ve perfectamente, pero en el **feed
social → Actividad** no aparece nunca (ni tras dos días, así que no es caché).

## Por qué el perfil sí y el feed no: son dos fuentes de datos distintas

| Vista | Fuente | Cómo se alimenta |
| --- | --- | --- |
| Perfil → Reseñas | **gist de JUEGOS** del amigo (`loadForeignProfileGames` → `sharedLists`) | Sale gratis del sync normal de listados: cualquier reseña guardada está ahí |
| Feed → Actividad | **gist SOCIAL** del amigo (`activity[]`) | Solo se escribe como efecto colateral de guardar una reseña (`publishReviewActivity`) |

Referencias: `src/viewmodel/useSocialViewModel.ts:954` (perfil, gist de juegos),
`src/view/components/socialhub/SocialProfileDetailScreen.tsx:171` (reseñas desde `sharedLists`),
`src/viewmodel/useSocialViewModel.ts:1388` (feed, gist social del amigo).

Conclusión: el feed no "filtra" la reseña — **la entrada de `activity` no existe (o el lector está leyendo
otro gist)**. Y no hay ningún mecanismo que reconcilie `activity` con las reseñas reales: la única vía de
escritura es `handleSaveDraft` (`src/App.tsx:481`).

## Causas encontradas, por probabilidad

### C1 — La publicación de actividad es frágil y no hay backfill (causa principal)

`publishReviewActivity` (`src/model/repository/socialPublishRepository.ts:19`) es la **única** vía de escritura
de `activity[]`, se dispara solo al guardar una reseña cuyo texto/nota/nombre cambió (`src/App.tsx:477`), y no
existe nada que reconcilie después. Cualquier publicación perdida es permanente.

Y hay cuatro formas de perderla **incluso con el usuario dado de alta, con sesión activa y siendo ya amigo**:

**C1a — el canal social se arma POR DISPOSITIVO.** `publishReviewActivity` sale en silencio si
`getSocialSyncConfig()` no tiene token+gistId (`socialPublishRepository.ts:25-28`), y esa config vive en
localStorage (`mis-listas-social-gist-config`). Los **únicos** sitios que la crean son los del hub
(`useSocialViewModel.ts:348, 434, 1085, 1643`): el mount del hub, el sign-in, el auto-create y el guardado de
perfil. `socialPublishRepository` solo la *refresca*, nunca la crea. Igual con la sesión de Google: el
sign-in ocurre dentro del hub, y la persistencia de Firebase es por navegador.

Consecuencia: un usuario perfectamente dado de alta y amigo mío, que escriba reseñas desde **otro
dispositivo/navegador donde nunca abrió el hub social**, publica cero actividad. El perfil sigue mostrando
esas reseñas (gist de juegos, que sí sincroniza en todos los dispositivos) y el feed no muestra ninguna.
Nada lo detecta ni lo reintenta.

Nótese que `publishReviewActivity` **no** intenta recuperar el gistId desde Firestore por email —cosa que sí
hace el hub en su `hydrate` (`useSocialViewModel.ts:327-355`)— ni llama a `ensureSyncConfigLoaded()`.

**C1b — la publicación va colgada de un import dinámico.** `src/App.tsx:481` hace
`void import('./model/repository/socialPublishRepository')` en el momento de guardar. Si ese chunk no se puede
descargar (index.html cacheado tras un despliegue, red intermitente), el `.catch` solo pinta un
`notify('warn', 'Juego guardado, pero no se pudo actualizar la actividad social de reseña.')`. No hay
manejador de `vite:preloadError` en el proyecto ni reintento.

**C1c — cualquier error de GitHub pierde la publicación**: 403 por rate-limit, 5xx o corte de red terminan en
el mismo `catch` con un aviso efímero. No hay cola de pendientes.

**C1d — el token del canal social es una copia** que puede quedar rancia: si el usuario rota el PAT, la config
principal se actualiza pero la social conserva el viejo hasta que pase por `attachExistingSocialGist`; entre
medias, todo `readSocialGist` del publicador da 401.

A esto se suma el caso más simple, que sigue vigente para quien todavía no era amigo: las reseñas escritas
**antes** de darse de alta en social nunca se publican, porque solo se publica al guardar.

En los cuatro casos el resultado es idéntico al reportado: perfil completo, feed vacío, y permanente.

### C2 — Autodespublicado de reseñas propias con una foto obsoleta de los listados

`src/viewmodel/useSocialViewModel.ts:793` — al abrir el detalle de una reseña **propia**, si el juego no
aparece en los listados locales, se considera huérfana y se **despublica del gist social**
(`unpublishReviewActivity`) sin preguntar.

El problema es que los listados se leen de `localState = useMemo(() => loadLocalState(), [])`
(`src/viewmodel/useSocialViewModel.ts:452`): una **foto de localStorage tomada al montar el hub**, que no se
refresca durante la visita y que solo mira localStorage (no IndexedDB). Escenario real: publico la reseña en
el móvil → abro el hub en el escritorio antes de que termine el sync de juegos → toco mi propia tarjeta del
feed ("a ver cómo se ve") → el juego no está en esa foto → **mi cliente borra mi propia actividad** y me
devuelve al feed. La reseña sigue en el gist de juegos (perfil OK), desaparece del feed de todos, y es
permanente.

La guarda `ownGames.length === 0` solo cubre el caso de listados totalmente vacíos, no el de listados
desfasados.

### C3 — Deriva de gist social: el lector prefiere el id de la amistad, que puede ser el viejo

En la hidratación del directorio (`src/viewmodel/useSocialViewModel.ts:1336-1370`) para un amigo se prefiere
`otherSocialGistId` (doc de amistad) sobre `social.gistId` (directorio Firestore). Ese orden se eligió para
arreglar la deriva inversa, pero las dos fuentes se sanean de forma **asimétrica**:

- `healOwnDirectoryGist` → al abrir el hub, sincroniza el directorio (`firebaseRepository.ts:426`).
- `healOwnFriendshipIdentity` → al abrir el hub (condicionado a tener nick cargado) y al guardar perfil.
- `publishReviewActivity` / `publishPost` → llaman a `ensureProfileByEmail`, que actualiza **solo el
  directorio**, nunca los docs de amistad.

Es decir: si el id del gist social del autor cambia y luego publica reseñas sin volver a abrir el hub, el
directorio apunta al gist nuevo y la amistad al viejo → el lector lee el viejo → cero actividad, mientras el
perfil (que usa `gamesGistId`) sigue bien.

Disparadores del cambio de id: alta en un segundo dispositivo o tras limpiar datos cuando
`findSocialProfileByEmail` no devuelve el perfil (crea un gist social nuevo,
`useSocialViewModel.ts:1066`), y el clonado de `updateGistPrivacy` (ver C5).

### C4 — El directorio está capado a 30 perfiles ordenados por id de documento

`listSocialDirectory` (`src/model/repository/firebaseSocialRepository.ts:180`):

```js
where('social.enabled', '==', true), where(documentId(), '!=', '_placeholder'), limit(30)
```

El filtro de desigualdad sobre `documentId()` obliga a Firestore a ordenar por `__name__`, así que el
directorio son "los 30 perfiles con uid alfabéticamente menor", no los 30 más recientes. Al pasar de 30
perfiles sociales, los nuevos quedan fuera de forma determinista y arbitraria.

Hoy no basta para explicar el síntoma (un amigo ausente del directorio se sintetiza desde el doc de amistad,
`useSocialViewModel.ts:1348`), pero ese rescate **exige `otherSocialGistId` no vacío**: un amigo con ese
campo vacío desaparece por completo del hub. Es una bomba de relojería a medida que crece la base.

### C5 — `updateGistPrivacy` clona el gist ante cualquier fallo de lectura anónima

`src/model/repository/gistRepository.ts:1837`: en cada guardado de perfil se comprueba la visibilidad con una
lectura **anónima** (`readPublicSocialGistById(gistId, null)`, límite de 60 req/hora por IP). Si esa lectura
falla por cualquier motivo transitorio, se interpreta "no es público" y se **clona el gist a un id nuevo**,
dejando el anterior huérfano y cambiando el id del canal social (alimenta C3). Los datos se copian, así que
no hay pérdida directa, pero el churn de ids sí rompe a los lectores.

## Fase 0 — Confirmar sobre datos reales (antes de tocar código)

Con la sesión abierta en `npm run dev` (los `import()` de rutas de `src/` no existen en el bundle de
producción), en la consola del navegador — solo lecturas:

```js
// 1) ¿Qué gist social ve el lector para ese amigo, y qué gist dice cada fuente?
const dir = await (await import('/src/model/repository/firebaseRepository.ts')).listSocialDirectory(30, { forceRefresh: true });
console.table(dir.map(e => ({ id: e.id, name: e.displayName, social: e.socialGistId, games: e.gamesGistId })));

// 2) El doc de amistad (id del gist social denormalizado por el amigo)
const me = (await (await import('/src/model/repository/firebaseRepository.ts')).getCurrentSocialAuthUser()).uid;
const fs = await (await import('/src/model/repository/firebaseRepository.ts')).getMyFriendships(me, { forceRefresh: true });
console.table(fs.friends.map(f => ({ uid: f.otherUid, name: f.otherName, social: f.otherSocialGistId, games: f.otherGamesGistId })));

// 3) Contenido crudo de los DOS candidatos de gist del amigo afectado
const raw = async (id) => (await (await fetch(`https://api.github.com/gists/${id}`)).json()).files['myGameList.social.json'].content;
JSON.parse(await raw('<gistIdDelDirectorio')).activity;
JSON.parse(await raw('<gistIdDeLaAmistad')).activity;
```

Interpretación:

- `activity` vacío en **ambos** gists → C1 (o C2 si la tarjeta llegó a verse alguna vez).
- La reseña está en uno y el lector lee el otro → C3.
- El amigo no sale en `listSocialDirectory` pero sí en `friends` → C4 en camino.

Tres preguntas al usuario afectado que discriminan C1 sin depender de datos (son las más baratas):

1. ¿En qué dispositivo escribiste la reseña, y **habías abierto alguna vez el hub social en ese
   dispositivo/navegador**? Si no → C1a confirmado.
2. ¿Te apareció el aviso *"Juego guardado, pero no se pudo actualizar la actividad social de reseña"*?
   Si sí → C1b/C1c.
3. ¿Llegaste a ver tu propia reseña en tu feed y luego desapareció? Si sí → C2.

## Plan de implementación

### Paso 1 — Reconciliación de `activity` contra las reseñas reales (arregla C1 y sustituye a C2)

Nuevo `src/model/repository/socialActivityReconcile.ts`:

```ts
reconcileReviewActivity(input: { games: TabData; max?: number }): Promise<{ added: number; removed: number }>
```

- Lee el gist social propio una vez; resuelve `profileId` con `resolveStableProfileId`.
- **Añade** una entrada `review` por cada juego de `c|v|e` con `review` no vacío que no tenga ya entrada
  (`key = profileId:gameId:review`), usando `game._ts` como `createdAt`/`updatedAt` (fecha real de la reseña,
  no `Date.now()`: así no se inunda el feed de los amigos con reseñas antiguas puestas hoy) y `snippet`
  derivado como hace `upsertReviewActivity`.
- **Quita** las entradas cuyo juego ya no existe o cuya reseña se vació — con la lista completa delante, que
  es lo que hoy intenta adivinar el efecto por-detalle.
- Tope `max` (p. ej. las 60 reseñas más recientes) para acotar el tamaño del gist.
- Una sola escritura si hubo cambios + `invalidateCachedSocialDirectory`.

Puntos de llamada:

1. Al final de `handleSaveProfile` (`useSocialViewModel.ts:1581`) — momento clave del usuario nuevo: acaba de
   crear su perfil y sus reseñas previas entran al feed.
2. Una vez por sesión al abrir el hub, con sello en `meta` (`patchLocalMeta({ activityReconciledAt })`) para
   no reescribir el gist en cada apertura.

Los juegos se pasan explícitamente desde el VM (`vm.data` / `localState`), no se releen dentro del repo.

Dos requisitos que salen de C1a y que **no** son opcionales:

- La reconciliación no puede exigir que la reseña se haya escrito en este dispositivo. Trabaja sobre los
  listados locales (que llegan por el sync de juegos) contra el gist social propio, así que el dispositivo
  donde sí está armado el canal repara lo que se escribió en cualquier otro. Es la pieza que arregla el caso
  "tenía sesión y era amigo, pero escribió desde el otro móvil".
- El sello `activityReconciledAt` no puede ser el único freno: si el número de reseñas locales no cuadra con
  el de entradas publicadas, hay que reconciliar aunque el sello esté fresco (la comparación es en memoria,
  sin coste de red; solo escribe el gist si hay diferencias).

### Paso 1b — Que el publicador ARME el canal en vez de rendirse en silencio (C1a, C1d)

En `publishReviewActivity` / `publishPost` (`socialPublishRepository.ts`):

- `await ensureSyncConfigLoaded()` al entrar (hoy no se llama; hace falta para disponer del token principal).
- Si hay sesión de Google pero no hay config social, recuperar el gist por email igual que el hub
  (`findSocialProfileByEmail` → `socialGistId` + token de `getSyncConfig()`) y `saveSocialSyncConfig(...)`
  antes de publicar. Extraer ese bloque de `useSocialViewModel.ts:327-355` a una función compartida
  (`resolveSocialChannel()`) para no duplicar la lógica.
- Refrescar el token de la config social con el de la principal cuando difieran (mata C1d).
- Si aun así no se puede publicar (sin sesión de Google en este dispositivo), **dejar rastro**:
  `patchLocalMeta({ pendingActivity: true })` en lugar de un `return` mudo.

### Paso 1c — No perder publicaciones por fallos transitorios (C1b, C1c)

- Marcar `pendingActivity` también en el `catch` de `src/App.tsx:462` y `:481` (cubre tanto el fallo del import
  dinámico como el error de GitHub). La reconciliación del Paso 1 lo consume y lo limpia: con `pendingActivity`
  activo se fuerza pasada, ignorando el sello.
- Añadir un manejador de `vite:preloadError` (recarga controlada) como higiene general: hoy un despliegue puede
  dejar sin publicar cualquier reseña guardada con el index.html viejo en caché.
- Mantener el aviso al usuario, pero con texto que refleje que se reintentará al abrir el hub.

### Paso 2 — Retirar el autodespublicado por foto obsoleta (C2)

- Borrar el efecto `useSocialViewModel.ts:793-831` (`unpublishReviewActivity` desde el detalle) y dejar la
  limpieza de huérfanas al Paso 1.
- Si se quiere conservar algo en el detalle, que solo muestre el aviso "esta reseña ya no tiene juego" sin
  escribir nada.
- `unpublishReviewActivity` se mantiene: la usa `handleSaveDraft` al vaciar una reseña (`src/App.tsx:459`),
  que sí es una señal explícita del usuario.

### Paso 3 — Curar la deriva de gist en las dos direcciones (C3)

- En `hydrateSocialDirectory`: si `otherSocialGistId` y `entry.socialGistId` **difieren**, leer ambos y
  fusionar (`activity`/`posts` deduplicados por `key`/`id`; perfil el de `updatedAt` mayor). Solo cuesta una
  lectura extra en el caso divergente, que es raro.
- En `publishReviewActivity` y `publishPost`: llamar también a `healOwnFriendshipIdentity` (ya escribe solo si
  hay divergencia), para que la corrección ocurra en origen sin depender de abrir el hub.

### Paso 4 — Directorio: quitar el tope arbitrario (C4)

- Sustituir `where(documentId(), '!=', '_placeholder')` por un filtro en cliente y ordenar por `updatedAt`
  desc (índice compuesto `social.enabled` + `updatedAt` en `firestore.indexes.json`); subir
  `SOCIAL_DIRECTORY_LIMIT` con criterio.
- `friendOnlyEntries`: sintetizar al amigo **aunque no traiga `otherSocialGistId`** (index-only, sin lectura
  de gist) para que nunca desaparezca del hub.

### Paso 5 — `updateGistPrivacy` deja de clonar por fallos transitorios (C5)

- Distinguir "no accesible" (404 definitivo) de "no se pudo comprobar" (403/rate-limit/red): en el segundo
  caso, no migrar y devolver el id actual.
- Hacer la comprobación con token (no anónima) y saltarla si el gist lo creó la propia app como público.

### Paso 6 — Tests

- `socialActivityReconcile.test.ts`: reseñas previas al alta → se publican con `_ts`; idempotencia (segunda
  pasada sin escrituras); reseña vaciada/juego borrado → se retira; tope `max`; con `pendingActivity` se
  reconcilia aunque el sello esté fresco.
- `socialPublishArmChannel.test.ts`: sin config social pero con sesión y perfil en Firestore → recupera el
  gistId y publica (hoy es un no-op silencioso); sin sesión → marca `pendingActivity` y no lanza.
- `socialDirectoryGistDrift.test.ts`: amistad y directorio con ids distintos → la actividad aparece igual.
- `firebaseSocialRepository`: el directorio ya no depende del orden por `documentId()`.
- Regresión de C2: abrir el detalle de una reseña propia con listados desfasados **no** escribe en el gist.

## Orden sugerido

Pasos 1 + 1b + 1c + 2 juntos: cierran las cuatro vías de pérdida de C1 y el borrado destructivo de C2, que es
lo que explica el caso reportado. Después 3, y por último 4 y 5 (escalabilidad e higiene).
