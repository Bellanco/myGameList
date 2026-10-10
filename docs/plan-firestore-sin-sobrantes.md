# Plan 1.6.9: la amistad nueva, Firestore sin sobrantes y la fecha de alta

> **Estado (10-10-2026): Fase 1 hecha en `develop` (sin push); reglas del depósito cambiadas, SIN desplegar.** Medido leyendo producción (MCP de Firebase, solo lectura) y el código de
> `develop`. Los casos ya rotos y los datos sobrantes que ya existen se arreglan **cuando su dueño entra**, sin
> scripts. La única excepción es la fecha de alta (Fase 3): entrar la sellaría con la fecha de ese día, así que se
> rellena una vez con su fecha real.

> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## 1. El fallo de las 13:14 ya está arreglado en la 1.6.8

Un usuario nuevo pidió amistad a las 08:21 UTC con la 1.6.7, que manda la petición **sin** sus ids de gist; se fue a las 08:23, y la
amistad se aceptó a las 13:14. Sus ids solo los podía escribir él al volver al hub, y no ha vuelto. Conocía sus dos ids
desde las 08:20 (`privateConfig`), así que no hubo carrera de hidratación.

Con la 1.6.8 (`4e178363`) la petición deja los ids en el depósito `friendshipKeys` y quien acepta los copia en el acto.
Ese caso **no vuelve a pasar** en cuanto el cliente esté desplegado (las reglas ya lo están; hoy no hay ningún depósito
en producción porque ningún cliente lo escribe aún). Lo único que no cubre es aceptar desde un cliente viejo en
caché: entonces se cae al camino de antes (los escribe quien pidió al volver al hub).

**No hacen falta** las fases que proponía la versión anterior de este plan: el llavero (`gistKeys/{uid}`) duplicaba
datos; el resolvedor de ids y ampliar «faltan ids» al gist de listados tapaban una carrera que los datos no muestran
(el gist social solo existe si la sync principal, que trae el de listados, ya está cargada); y el mensaje de la ficha
no arregla nada del fallo.

## 2. Lo que sobra en Firestore

Inventario de cada campo de `profiles`, `privateConfig`, `publicConfig`, `userMap`, `friendships` y `friendshipKeys`
contra todo lo que lee (cliente, panel de admin, `functions/`, `scripts/` y condiciones de las reglas). «Sobra» quiere
decir que nadie lo lee, ni el admin, o que repite otro dato.

| Dato | Dónde | Por qué sobra | En producción |
|---|---|---|---|
| `social.etag` | `profiles` | nadie lo lee; el censo lo convierte en `hasSocialEtag` y ninguna pantalla lo usa | los 12 perfiles, ~75 B cada uno, y lo descarga todo el que carga el directorio |
| `achievements.v` | `profiles` | nadie lo lee; la versión ya va dentro de `list` (`"2:…"`, la comprueba `parseMirror`) | todos los que tienen vitrina |
| `userMap/{uid}` (colección entera) | `userMap` | repite `privateConfig.profileId`; solo se lee como respaldo si ese falta | 12 documentos, los 12 con su gemelo en `privateConfig` |
| `schemaVersion` | `privateConfig`, `publicConfig`, `userMap` | nadie lo lee (el de `profiles` sí: lo usan el saneado y el admin) | en todos |
| `listShape`, `gridSize` | `publicConfig` | dejaron de escribirse el 20-09 (preferencias del dispositivo) y nadie los lee | 5 documentos |
| `updatedAt` | `friendshipKeys` | nadie lo lee; el depósito se borra al recogerse | 0 documentos (cliente sin desplegar) |

**Se quedan**, aunque parezca que sobran:

- `publicConfig.consent.agreedAt`: ningún código lo lee, pero es la prueba de **cuándo** se aceptaron las
  condiciones (el RGPD obliga a poder demostrar el consentimiento, art. 7.1).
- `privateConfig.gamesChunks` / `socialChunks`: solo existen en las reglas y en el tipo, sin un byte guardado. Son
  zona de staging de la migración del gist (`CLAUDE.md`); no ocupan nada.
- `profiles.social.gistId` (queda en un perfil): se lee como respaldo y su purga ya existe
  (`purgeOwnPublicGistIds`); se va cuando él entre.

## 3. Cambios de la 1.6.9

### Fase 1 — Dejar de escribir lo que sobra, y borrarlo al pasar

> Hecha. El ETag se borra también en el latido de recencia (`touchOwnProfileActivity`), que es la única escritura que
> alcanza a quien no vuelve a guardar su perfil. `ensureProfileByEmail` ya no recibe `socialGistEtag`. Queda sin
> llamadores `peekOwnProfileTier` (`firebaseSocialRepository.ts`), que solo usaba la función borrada: no se ha
> tocado por la regla de `CLAUDE.md` sobre los exports de `src/model/repository/`.

Cada escritura que ya toca el documento borra a la vez el dato muerto (`deleteField()` en el mismo `setDoc` con
`merge`). Sin lecturas ni escrituras nuevas: el dato se va la próxima vez que su dueño guarde algo.

- `profiles.social.etag`: fuera de `ensureProfileByEmail` (`firebaseRepository.ts`); `hasSocialEtag` fuera del censo
  (`admin/adminCensus.ts`) y de su fixture de test. El saneado de identidad lo pone a `null` (`firebaseProfileHealRepository.ts`):
  pasa a borrarlo.
- `profiles.achievements.v`: `buildMirror` (`core/achievements/pack.ts`) deja de ponerlo y `publishAchievementMirror`
  lo borra.
- `schemaVersion` de `privateConfig` y `publicConfig`: `setPrivateConfig` y `setPublicConfig` dejan de sellarlo y lo
  borran.
- `listShape` y `gridSize`: `setPublicConfig` los borra.
- `friendshipKeys.updatedAt`: `keysFor` deja de escribirlo.
- `upsertProfileSocialReferences` (`firebaseRepository.ts`) no tiene llamadores y escribe tres de estos datos: se borra.

### Fase 2 — Fuera `userMap`

**No tiene sentido que exista.** Guarda solo `profileId`, que ya está en `privateConfig/{uid}`; las dos colecciones son
del dueño y nadie más las lee; se escriben siempre juntas (el lote de alta, `establishProfileIdentity` y los dos
saneados de `firebaseProfileHealRepository.ts`); y solo se lee como respaldo cuando `privateConfig` no tiene el
`profileId`, cosa que en producción no pasa con ninguno (12 de 12 con su gemelo). Si la escritura de
`privateConfig` fallase, `establishProfileIdentity` devuelve `false` y se reintenta en la siguiente pasada: el
respaldo no salva nada que no se salve igual. Decisión del usuario (10-10-2026): se borra.

- `establishProfileIdentity`, el lote de alta (`firebaseRepository.ts`) y los saneados de
  `firebaseProfileHealRepository.ts` dejan de escribirlo; el primero **borra** el documento del dueño en el mismo
  paso. Se va la primera vez que el dueño pase por ahí con la 1.6.9.
- `recoverRemoteProfileId` lee solo `privateConfig`; se van `getUserMapProfileId` y `setUserMap` (exports de
  `src/model/repository/`, borrado autorizado por el usuario).
- `accountDeletionRepository` la mantiene en su lista hasta que no quede ningún documento (una cuenta antigua puede
  darse de baja sin haber pasado por la 1.6.9). Comentarios que la nombran: `core/constants/schema.ts`,
  `forgetOwnAccountMemo`, `firebaseAdminRepository.ts`, `indexedDbRepository.ts`.
- Tests: `ownAccountMemo.test.ts`, `legacyProfileHeal.test.ts` y el de reglas.

### Fase 3 — La fecha de alta (`profiles.createdAt`)

**El fallo.** Ningún perfil de producción la tiene, ni los creados después de que existiera (`185096f8`, 02-08-2026),
como el del usuario nuevo del apartado 1 (10-10). Se lee para los logros de antigüedad («De la vieja escuela», «Otro año más»), que hoy no se
pueden conseguir, y para la fecha de alta del panel.

**Por qué.** Solo la sella `ensureProfileByEmail`, y solo si el perfil **no existía**. Pero tres escrituras crean el
documento antes, con `setDoc` + `merge` y sin la fecha: `updateProfilePhoto` (el saneado de la foto genérica de
Google, que corre en cuanto hay canal social), `publishAchievementMirror` y `publishYearSummarySeen`. Cuando llega el
alta, el perfil ya existe y la fecha no se pone nunca. En el caso del apartado 1 encaja con los tiempos: el perfil nace a las
08:20:14 con `photoURL: ""` (la genérica retirada) y su identidad no se guarda hasta las 08:20:41. Las reglas sí
dejan sellarla más tarde si falta (`profileCreatedAtIsImmutable`); simplemente nadie lo hace.

**El arreglo.**

- Esas tres escrituras pasan a `updateDoc`: si el perfil no existe, no lo crean (best-effort, como ya hace
  `touchOwnProfileActivity`; el alta escribe la foto y el siguiente arranque publica el espejo). Así solo crean el
  perfil los dos caminos que sellan la fecha: el alta (`ensureProfileByEmail`) y la cuenta ligera (`ensureLightAccount`).
- Red de seguridad para el despliegue: un cliente viejo en caché aún puede crear un perfil sin fecha. Si
  `ensureProfileByEmail` lee un perfil propio sin `createdAt`, la sella con una escritura aparte
  (`{ uid, createdAt: serverTimestamp() }`). Aparte y no en la escritura del perfil: si la copia local estuviera
  vieja y la fecha ya existiera, la regla la denegaría, y no debe arrastrar con ella el guardado del perfil.
- **Los perfiles que ya existen, rellenados una vez y ANTES de desplegar el cliente.** Si los sellase la red de
  seguridad, la fecha sería la de su próxima entrada, y como es inmutable, quien lleva meses en la app perdería los
  logros de antigüedad para siempre. La fecha real está en los metadatos de Firestore (`createTime`), que el
  cliente no puede leer; con el MCP se escribe en los 12 perfiles la más antigua de las `createTime` de sus
  documentos (`profiles`, `privateConfig`, `publicConfig`, `userMap`). Es una escritura de administración en
  producción: se hace con el visto bueno explícito del usuario y enseñándole antes los 12 valores.

  Valores calculados el 10-10-2026 (UTC, la `createTime` más antigua de sus cuatro documentos):

  | Perfil (por antigüedad) | `createdAt` | Sale de |
  |---|---|---|
  | 1 | 2026-05-10 15:39:00 | `profiles` |
  | 2 | 2026-05-11 18:01:36 | `profiles` |
  | 3 | 2026-05-14 18:01:58 | `profiles` |
  | 4 | 2026-05-15 12:30:21 | `profiles` |
  | 5 | 2026-05-17 12:11:47 | `profiles` |
  | 6 | 2026-05-20 18:55:26 | `profiles` |
  | 7 | 2026-07-02 05:06:02 | `profiles` |
  | 8 | 2026-07-05 15:03:41 | `profiles` |
  | 9 | 2026-07-26 09:57:11 | `publicConfig` |
  | 10 | 2026-07-30 21:27:05 | `profiles` |
  | 11 | 2026-08-26 07:44:12 | `publicConfig` |
  | 12 | 2026-10-10 08:20:12 | `publicConfig` |

  Límite: si un perfil se rehízo en un cutover de identidad, su `createTime` es la del documento nuevo y la fecha sale
  más reciente que la real. Antes de escribir, se contrasta con la primera amistad de cada uno (`friendships.createdAt`)
  y se toma la más antigua de las dos.

### Fase 4 — Ningún depósito sobrevive a la aceptación

Si quien acepta usa todavía un cliente viejo, el depósito no se recoge y se queda para siempre, sin que nadie lo lea.
Cuando quien pidió escribe sus ids en una amistad ya aceptada (saneado), borra su depósito en el **mismo lote**.
Borrar un documento que no existe no falla, y la regla ya lo permite.

### Reglas

Se aceptan los campos viejos mientras queden documentos que los lleven (un `hasOnly` que no cuadra rechaza la
escritura **entera**, y la de borrarlos también tiene que pasar):

- `friendshipKeys`: `updatedAt` pasa de obligatorio a opcional. Es lo único que hay que **desplegar antes** que el
  cliente.
- `profiles` (`etag`, `achievements.v`), `privateConfig`/`publicConfig` (`schemaVersion`), `publicConfig`
  (`listShape`, `gridSize`) y `userMap`: sin cambios ahora. Se retiran de las reglas en una versión posterior,
  cuando el MCP confirme que no queda ninguno.

## 4. Pruebas

- Las escrituras de las Fases 1, 2 y 4 mandan `deleteField()` para cada dato muerto y ya no lo crean
  (`firebaseRepository`, `pack`, `firebaseFriendshipRepository`, `firebaseProfileHealRepository`).
- `recoverRemoteProfileId` sin `userMap`; el alta borra el documento.
- Fecha de alta: foto, espejo y resumen del año no crean un perfil que no existe; el alta sella la fecha si falta, y
  un rechazo de esa escritura no tumba el guardado del perfil.
- `tests/integration/firestore.rules.test.ts`: depósito sin `updatedAt`; borrado de cada dato muerto aceptado;
  sellar `createdAt` en un perfil que no la tiene, sí; cambiarla, no.
- `parseMirror` sigue leyendo espejos con y sin `v`.
- Suite completa y la checklist del README antes de desplegar (`audit:rules` incluido).

## 5. Despliegue

1. Relleno de `createdAt` de los 12 perfiles con el MCP (valores enseñados antes y con visto bueno). **Antes** del
   cliente, o la red de seguridad sellaría la fecha de hoy.
2. Reglas (`friendshipKeys.updatedAt` opcional) → `audit:rules`.
3. Cliente 1.6.9, que incluye la 1.6.8.
4. Más adelante, con el MCP: contar lo que quede de cada dato muerto y de `userMap` y, a cero, quitarlos de las
   reglas y de la baja de cuenta.

## Fuera de alcance

- `appConfig` y las colecciones de premios no se han revisado.
- Nombre y foto en `friendships` repiten los de `profiles`, pero la bandeja de peticiones y los amigos con el perfil
  cerrado no tienen otra fuente.
