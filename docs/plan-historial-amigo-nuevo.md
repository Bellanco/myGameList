# Plan: el historial de un amigo nuevo, al momento

> **Estado (10-10-2026): Fases 0, 1 y 2 implementadas en `develop`, sin desplegar. La 3 (aviso) no se ha hecho.**
> Desplegar **primero las reglas** (`friendshipKeys` y `friendshipCopyRequesterKeys`) y después el cliente. Con el
> cliente viejo no cambia nada; con el nuevo sin las reglas, la petición sale sola (sin depósito) y todo funciona
> como en la 1.6.7.
>
> Dónde quedó cada pieza: depósito, recogida y limpieza en `firebaseFriendshipRepository.ts`
> (`sendFriendRequest`, `claimRequesterKeys`, `writeOwnPendingKeys`, `deleteOwnFriendshipKeys`,
> `haveFriendshipEdgesChanged`); huella del directorio en `socialDirectoryFriendsKey` (`useSocialDirectory.ts`) y
> `getCachedSocialDirectory`; tarea `friendshipKeysAfterAccept` en `useSocialStartupTasks.ts`; aristas pendientes en
> `useSocialFriendships.ts`. La retroactividad de las peticiones pendientes de la 1.6.7 sale de subir
> `IDENTITY_FINGERPRINT_VERSION` a 2: cada dispositivo vuelve a sanear una vez y deja sus depósitos. Diagnóstico hecho leyendo el código de `develop` (1.6.7); no se ha
> reproducido en el navegador ni se han mirado los documentos de `friendships` en producción.

> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## El síntoma

Dos personas se hacen amigas, las dos tienen la amistad aceptada y ninguna ve la actividad de la otra en el feed
(ni su lista de juegos en el perfil). Aparece «sola» un rato después, o al salir y volver a entrar varias veces.
Lo esperado es que, en cuanto cada una sabe que sois amigos, el historial del otro esté ahí.

## Por qué pasa

Son tres huecos encadenados, uno de privacidad (buscado) y dos de caché (no buscados).

### 1. Quien pidió la amistad no deja sus ids en la petición

Desde `e0bf6081` (1.6.7) la petición sale **sin** `requesterSocialGistId` ni `requesterGamesGistId`: el
destinatario lee el documento aunque rechace, y esos ids son la llave de la biblioteca
(`firebaseFriendshipRepository.ts`, `sendFriendRequest`). Al aceptar solo se escriben los del que acepta
(`acceptFriendRequest`). Los del que pidió los escribe su propio dispositivo **cuando ve la amistad aceptada**:
`toFriendshipView` marca `ownGistIdsMissing` y la tarea `friendshipIdsAfterAccept` de `useSocialStartupTasks`
lanza el saneado forzado.

Mientras tanto, para quien aceptó ese amigo no tiene gist: el directorio lo deja *index-only* (nombre y foto,
`activity: []`) y su perfil no puede bajar juegos (`useForeignProfileGames` sale si falta `gamesGistId`).

El arreglo de privacidad protege el tramo **entre pedir y aceptar**, y ahí se mantiene. Pero depender de que quien
pidió vuelva a entrar no tiene justificación: al pedir la amistad ya consintió que, si se la aceptan, la otra
parte lea sus listas. La Fase 0 deja los ids en depósito para que los recoja quien acepta.

### 2. Nadie se entera de que la otra parte ha cambiado algo

Las amistades solo se leen dentro del hub, al abrirlo o al entrar en Solicitudes (`useSocialFriendships`), y con
copia de hasta 15 min (`MY_FRIENDSHIPS_MAX_AGE_MS`; 60 s en Solicitudes). Así que:

- **quien pidió** tarda hasta 15 min en ver que le han aceptado (y, por tanto, en escribir sus ids);
- **quien aceptó** tarda otros 15 min en ver esos ids, una vez escritos.

Con el hub abierto no se relee nunca: la copia caduca, pero nada vuelve a preguntar.

### 3. La copia del directorio no sabe quiénes son tus amigos

Cambiar la lista de amigos sí relanza la hidratación (`useSocialViewModel.ts`, efecto con `friendships.friends`),
pero sin forzar, y la copia de IndexedDB se identifica **solo por el gist propio**
(`getCachedSocialDirectory(ownGistId, ttl)`). Si tiene menos del TTL del feed (30 min en bronce, 15 en plata,
10 en oro, 1 en mithril), se sirve tal cual:

- a **quien pidió** le sale el directorio guardado *antes* de ser amigos, sin la otra persona;
- a **quien aceptó** le sale el que guardó justo al aceptar, con el otro *index-only*.

Solo las acciones propias (`refreshAfterFriendshipChange`) invalidan esa copia; lo que cambia la otra parte, no.

### Cuánto suma

| | Quien pidió (A) | Quien aceptó (B) |
|---|---|---|
| Ver la amistad aceptada | hasta 15 min tras abrir el hub | al momento |
| Ver los ids del otro | al momento (B los dejó al aceptar) | cuando A abra el hub + hasta 15 min |
| Que el feed los use | hasta 30 min más (bronce) | hasta 30 min más (bronce) |
| Disparo | solo al abrir el hub o cambiar de amigos | ídem |

## El arreglo

### Fase 0 — Los ids de quien pide, en depósito hasta que se acepte

Quien pide deja sus ids en un documento aparte que **el destinatario solo puede leer con la amistad aceptada**. Al
aceptar, quien acepta los recoge y los copia a la amistad. Desde ese momento todo lo de abajo funciona igual que si
los hubiera escrito quien pidió, y sin que tenga que volver a entrar.

**Modelo.** `friendshipKeys/{docId}`, con el mismo id que la amistad (`uidA__uidB`):
`{ requester, socialGistId, gamesGistId, updatedAt }`.

**Reglas** (desplegar ANTES que el cliente):

- *Crear o reescribir:* solo quien pide (`request.auth.uid == request.resource.data.requester`), con el uid dentro
  del `docId`, allowlist de campos y los mismos topes de tamaño que `denormGistIdIsSane`. Va en el mismo
  `writeBatch` que la petición, y la regla comprueba con `getAfter` que la amistad es suya y está pendiente.
- *Leer:* quien pide, siempre; quien recibe, **solo si `get(/friendships/{docId}).data.status == "accepted"`** y él
  es el `recipient`; el admin. Mientras esté pendiente, o si se rechazó (la amistad ya no existe), el destinatario
  no puede leerla: la protección de `e0bf6081` se conserva intacta.
- *Borrar:* cualquiera de los dos uids del `docId`, exista o no la amistad (para que cancelar, rechazar o eliminar
  limpien el depósito).
- *Copiar a la amistad:* regla nueva en `friendships`, `friendshipCopyRequesterKeys`: quien recibe, con la amistad
  ya aceptada, puede escribir **solo** `requesterSocialGistId`, `requesterGamesGistId` y `updatedAt`, y solo con
  los valores **idénticos** a los del depósito (`get(/friendshipKeys/{docId})`). No puede inventárselos.

**Cliente:**

- `sendFriendRequest`: la petición (sin ids, como ahora) y el depósito en un mismo lote.
- `acceptFriendRequest`: aceptar → leer el depósito → copiar los ids a la amistad → borrar el depósito. Son tres
  pasos porque el depósito no se puede leer antes de aceptar. Si alguno falla, la tarea siguiente lo completa.
- Tarea de arranque nueva, la gemela de `friendshipIdsAfterAccept` para el otro lado: **amistades aceptadas en las
  que soy el destinatario y al otro le faltan los ids** → intentar el depósito (1 lectura) y copiar. Cubre un fallo
  a medias al aceptar y a quien aceptó con una versión anterior.
- Tarea de quien pide: **peticiones pendientes mías sin depósito** (las creadas con la 1.6.7) → escribirlo una vez,
  con sello por `docId` en `LocalMeta`. Si mis ids cambian (rotación de canal) con peticiones pendientes, el
  saneado de identidad reescribe también sus depósitos.
- `deleteFriendship` (cancelar, rechazar, eliminar) borra el depósito en el mismo lote. La baja de cuenta
  (`accountDeletionRepository`) borra los depósitos donde soy `requester` (RGPD). Los borrados del panel de admin,
  igual. Un depósito huérfano no filtra nada (sin amistad aceptada no se puede leer), pero no se deja basura.

**Lo que no cubre:** las amistades **ya aceptadas** con la 1.6.7 cuyo solicitante no ha vuelto a entrar. Sus ids no
están en ningún sitio que el otro pueda leer, así que esas siguen esperando a que entre (`friendshipIdsAfterAccept`,
que ya existe). Son solo las aceptadas entre el despliegue de la 1.6.7 y el de esto.

**Resultado:** quien acepta ve el historial de quien pidió **al momento de aceptar**: `refreshAfterFriendshipChange`
ya invalida el directorio y relee las amistades, que ahora traen los ids.

### Fase 1 — La copia del directorio lleva la huella de los amigos (el grueso)

La copia se guarda con una **huella del grafo** que la produjo y no se sirve si el grafo de ahora es otro.

- Huella: `uid:otherSocialGistId:otherGamesGistId` de cada amigo, ordenada y unida (más el `ownProfileId`, que
  decide cuál es la entrada propia). Una función pura en `useSocialDirectory` o `socialFeed`, con test.
- `CachedSocialDirectory` gana `friendsKey?: string`; `putCachedSocialDirectory(gistId, entries, friendsKey)` la
  guarda y `getCachedSocialDirectory(gistId, ttl, { friendsKey })` devuelve `null` si no coincide.
- **Una copia sin `friendsKey` cuenta como distinta.** Es lo que la hace retroactiva: todas las copias que hay hoy
  en los navegadores se releen una vez al desplegar, sin subir `SOCIAL_DIRECTORY_CACHE_VERSION`.
- Los rescates (`allowExpired`: sin red, servicio caído, entrada previa de un amigo) **ignoran** la huella: ahí
  vale más lo viejo que nada, y es lo que ya hacen con el TTL.

Efecto: en cuanto `friends` cambia —amistad nueva, ids que llegan, amigo que se va, amigo que cambia de canal— la
siguiente hidratación va a red, sin esperar al TTL. Cubre los dos lados y, de paso, acorta la deriva de canal de
`social-directory-gist-drift`.

Coste: una hidratación de red más **solo cuando cambia el grafo**. En el caso normal (nada cambia) la copia sigue
sirviendo: `socialHubBudget.test.tsx` («con la caché caliente, volver a abrir no cuesta NI UNA lectura de gist»)
tiene que seguir en verde sin tocarlo.

### Fase 2 — Enterarse de las aristas pendientes sin esperar 15 min

Hay dos situaciones en las que **se sabe** que algo va a cambiar en el otro lado:

- tengo peticiones **enviadas** sin contestar (A esperando a que le acepten);
- tengo **amigos sin ids** (`otherSocialGistId` vacío). Con la Fase 0 solo queda el caso heredado de la 1.6.7;
  si se quiere, esta mitad se puede omitir.

Solo para esas, una comprobación dirigida: `getDoc` de cada uno de esos documentos (1 lectura por documento, con
`readFriendship`, que ya existe) en lugar de la consulta entera. Si alguno ha cambiado de estado o ha ganado ids,
`refreshFriendships(true)` (la consulta completa solo cuando de verdad hay novedad) → cambia `friends` → Fase 1.

Cuándo se comprueba (sin temporizadores):

- al abrir el hub y al volver a la pestaña (`visibilitychange` a visible) con el hub abierto;
- como mucho una vez cada 60 s (`MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS`);
- y con un tope por documento: una petición enviada hace semanas no merece una lectura en cada visita (p. ej.
  dejar de mirarla tras 7 días sin respuesta, cuando ya la cubre la relectura normal de 15 min).

Coste: 0 lecturas en el caso normal (nada pendiente); 1 por arista pendiente y apertura, con su tope.

Con esto, la secuencia completa queda así. B acepta → recoge del depósito los ids de A → su feed se rellena al
momento (Fases 0 y 1). A abre el hub o vuelve a la pestaña → ve la aceptación sin esperar 15 min → su feed se
rellena al momento (Fases 2 y 1).

> Se descarta un listener en tiempo real: el cliente usa `firebase/firestore/lite`, sin `onSnapshot`, y
> `ci-validate` lo vigila a propósito (`firebaseClient.ts`).
>
> Si se hace antes `docs/plan-amistades-incrementales.md`, esta fase se simplifica: la consulta «lo que ha
> cambiado» ya cuesta 1 lectura y bastaría con bajar su frescura mientras haya aristas pendientes.

### Fase 3 — Que la espera se entienda

Con la Fase 0 solo queda un caso de espera: amistades aceptadas con la 1.6.7 cuyo solicitante no ha vuelto a
entrar. Es poco y temporal, así que esta fase es opcional:

- tarjeta del amigo / cabecera de su perfil: «Sus reseñas aparecerán cuando vuelva a entrar en la app» mientras
  le falten los ids (`otherSocialGistId` vacío);
- **a comprobar:** qué pinta hoy el perfil de un amigo sin `gamesGistId`. `useForeignProfileGames` sale antes de
  apuntar el fallo, y si la pantalla espera a ese apunte se quedaría en esqueleto. Si es así, que caiga al aviso
  de arriba.
- añadir el estado a `docs/maquetas/social.html` (lo pide `CLAUDE.md` para cualquier vista nueva del hub).

## Coste y techo de usuarios

Estimación leyendo el código, como las de `docs/plan-capacidad-gratuita.md` (cuya Fase 0, medir el consumo real,
sigue pendiente). Se mide con `socialHubBudget.test.tsx` al implementarlo.

- **Fase 0 — una vez por amistad, no por visita.** Pedir: +1 escritura (el depósito) y la lectura de la regla
  con `getAfter`. Aceptar: ~3 lecturas (el depósito y las dos `get` de las reglas) y 2 escrituras (copiar y
  borrar). Unas 4 lecturas y 3 escrituras por amistad nueva en toda su vida, frente a las ~60–750 lecturas
  diarias de cada usuario. Las tareas de arranque nuevas no gastan nada sin casos pendientes, y llevan sello.
- **Fase 1 — Firestore y Cloudflare: nada nuevo.** La hidratación lee los gists de los amigos directamente de
  `api.github.com` con el token de cada usuario (`readPublicSocialGistById`), y los perfiles con su propia copia
  por uid de 2 h (`getSocialProfilesByUid`): un amigo nuevo cuesta 1 lectura de su perfil, la misma que costaría
  después. GitHub es un cupo **por usuario** (5.000/h, y un 304 por ETag no gasta), no compartido: no mueve el
  techo. Las carátulas del amigo nuevo (Functions) se piden antes, no más veces.
- **Fase 2 — Firestore: lo único que suma.** 1 lectura por arista pendiente y comprobación, como mucho una vez
  por minuto y solo al abrir el hub o volver a la pestaña; 0 sin nada pendiente. Más una consulta completa (N)
  cuando hay novedad, que adelanta la relectura de 15 min en vez de añadirse a ella. Para un usuario medio con
  una petición pendiente, del orden de 5–10 lecturas al día mientras dure (sobre ~60–100); para un intenso que
  entra y sale mucho, unas decenas (sobre ~600–750). Como solo lo paga quien tiene algo pendiente, y eso dura
  días, en la mezcla 70/25/5 queda muy por debajo del margen de error del techo de ~800–1.000 activos al día.
- **Si aprieta:** subir el intervalo de la Fase 2 (p. ej. 5 min) o comprobar solo al abrir el hub, no al volver
  a la pestaña. Con `plan-amistades-incrementales` hecho, la comprobación pasaría a ser 1 lectura en total, no 1
  por arista.

## Verificación

- **Unitarios:** huella estable (orden de amigos indiferente) y que cambie con un id nuevo; `getCachedSocialDirectory`
  devuelve `null` con huella distinta o ausente y la sirve con `allowExpired` aunque no coincida.
- **Hub (componente):** con copia fresca y un amigo que gana ids → hidratación de red que lee su gist; con copia
  fresca y el mismo grafo → cero lecturas (presupuesto actual intacto).
- **Reglas (emulador, `tests/integration/firestore.rules.test.ts`):** quien recibe NO lee el depósito con la
  amistad pendiente ni tras rechazarla, y sí con ella aceptada; un tercero, nunca; quien pide no puede crear un
  depósito para una amistad ajena ni para una ya aceptada; copiar a la amistad solo con valores idénticos al
  depósito y solo por quien recibe; borrar, cualquiera de los dos. `npm run audit:rules` antes de desplegar.
- **Repositorio:** pedir escribe los dos documentos en un lote; aceptar recoge, copia y borra; si la copia falla,
  la tarea de arranque la completa; cancelar, rechazar, eliminar y dar de baja la cuenta borran el depósito.
- **Fase 2:** sin aristas pendientes → ninguna lectura extra; con una enviada que pasa a aceptada → `getDoc` de esa
  y luego una consulta completa; con el tope de días → nada.
- **A mano**, con dos cuentas (la de desarrollo y otra): pedir, aceptar, y medir cuánto tarda cada lado en ver al
  otro antes y después. Y rechazar: comprobar en la consola que el depósito desaparece.
- **Despliegue:** reglas primero (con el cliente viejo no cambia nada: no escribe depósitos y su fallback sigue
  siendo `friendshipIdsAfterAccept`), y después el cliente.
- Suite completa en verde antes de comitear (suite y commit en llamadas separadas).

## Fuera de este plan

- Volver a mandar los ids con la petición: es exactamente lo que cerró `e0bf6081`. El depósito los guarda aparte
  y solo se pueden leer tras aceptar.
- Leer los ids del `privateConfig` de quien pidió: guarda más cosas que no deben salir de su dueño.
- Bajar los TTL del feed o de las amistades en general: el problema no es la frescura, es que la copia no sabe
  que ha quedado vieja.
