# Plan: «Me gusta» en el feed

> **Estado (12-10-2026): Fases 0 a 6 cerradas (sin push). La 5, sin rótulo, por decisión del usuario.** Sale de la idea A1 de
> `docs/investigacion-interaccion-social.md`. Las alternativas visuales que se compararon están en
> `docs/maquetas/reacciones.html` (con el servidor de desarrollo); la elegida es la C, reducida a una sola reacción.
>
> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## Qué es

Un único **«Me gusta»** sobre lo que tus amistades **escriben**: reseñas y publicaciones. Sin números: debajo de la
tarjeta, una frase con nombres, «A Marta y Nacho les gusta». La ven todas las amistades que ven la tarjeta.

**Dónde se guarda.** Cada «me gusta» vive en el gist social de **quien lo da**. Como la amistad es mutua y cada
cliente ya lee los gists de todas sus amistades, llega a quien lo recibe sin lecturas nuevas de Firestore ni
peticiones nuevas a GitHub. Los costes están detallados en la investigación (§A1).

## Fase 0 · Decisiones (12-10-2026, cerradas)

| Tema | Decisión | Por qué |
|---|---|---|
| Forma | Variante C de la maqueta: botón de texto con icono y frase con nombres | Nombres en vez de números: importa quién más que cuántos, y aquí solo ves a tus amistades |
| Juego de reacciones | **Solo «Me gusta».** Fuera «No me gusta», «Me encanta», «Discrepo», «Ánimo» y «Me lo apunto» | Lo negativo empeora la comunidad; dos intensidades obligan a elegir y abren la comparación; guardar no es una señal social y Deseados ya existe |
| Alcance | Reseñas y publicaciones. **No** avisos de lista ni logros | «Me gusta» en «abandonó X» es incómodo; el objetivo es que quien escribe se sienta leído |
| Icono | **Pulgar arriba** | El corazón ya es el botón «♥ Amigos» de la ficha (`FriendshipButton.tsx`) |
| Texto | Botón «Me gusta». Frase sin ti: «A Marta le gusta» / «A Marta y a Nacho les gusta» / con tres o más, **un solo nombre**: «A Nacho y a 5 más les gusta». **Sin** «tu reseña»: se sobreentiende | Revisado el 12-10-2026: que no ocupe varios renglones. Medido: en un móvil de 390 px la frase tiene ~225 px y dos nombres más la cuenta no caben. Sin «…» (el recorte no le gustó al usuario): de cada nombre va **solo la primera palabra** («Lucía R.» → «Lucía»), que es lo que la mantiene corta. Los nombres enteros, en el `title` |
| Activado | Píldora tintada + pulgar relleno + color `--like` (el acento por defecto) | Revisado el 12-10-2026: en Witcher el acento es el gris del acero (1,09:1 entre activado y apagado). `--like` propio en Witcher (púrpura del temple), Arcade (cian) y Mar de estrellas de día (el oro era invisible sobre el turquesa). Texto activado ≥ 4,5:1 sobre la píldora en los 16 casos |
| Quién ve los nombres | Todas las amistades que ven la tarjeta | Invita a leer lo que a otros les ha gustado |
| Lo tuyo | **Al pulsar, al momento** (sin esperar a que se envíe): el botón se activa, el pulgar da un salto y la frase te cuenta: «Te gusta», «A ti y a Nacho os gusta», «A ti y a 5 más os gusta» | Revisado el 12-10-2026 a petición del usuario: que se vea la inmediatez. Antes tu nombre no entraba en la frase |
| Vacío | Sin «me gusta» no se pinta nada: ni «0» ni «a nadie le gusta» | Enseñar la ausencia duele más que no enseñar nada |

El razonamiento, con fuentes, quedó en la conversación del 12-10-2026. En resumen: un «me gusta» de alguien cercano
se percibe como apoyo, así que basta para **sentirse leído**. Sentirse **escuchado** lo dan las palabras, que serían
los comentarios (A4), más adelante.

## Los clientes antiguos: un fichero aparte en el mismo gist

**El problema.** El esquema del gist social es `strictObject` y la normalización se queda solo con lo que conoce.
Si los «me gusta» fueran un campo más de `myGameList.social.json`, una versión antigua que publicara una reseña
tiraría el campo y **borraría los «me gusta» de esa persona**. A diferencia de los avisos de lista, que se
reproyectan desde los sellos locales, esto no se puede reconstruir.

**La solución.** Un fichero propio, `myGameList.social-reactions.json`, dentro del **mismo** gist. Esto es lo que
hacen los clientes ya desplegados, leído en `writeSocialGist` (`socialGistRepository.ts`):

- El `PATCH` solo envía `myGameList.social.json`. La API de gists **deja intactos los ficheros que no se nombran**.
- Solo borran (`null`) los ficheros que casan con `^myGameList\.social-chunk-.+\.json$`. El nombre nuevo **no** casa,
  y un test lo fija con una copia literal de esa expresión: está congelada en clientes que no se pueden actualizar.
- Al leer cogen `body.files['myGameList.social.json']` e ignoran el resto. Nada más en `src` ni en `functions`
  reconoce ficheros del gist social por nombre (comprobado con grep el 12-10-2026).

En la práctica:

| Quién | Qué pasa |
|---|---|
| Cliente viejo que **publica** | Reescribe su fichero de siempre; los «me gusta» siguen ahí. |
| Cliente viejo que **lee** | No ve «me gusta». No falla. |
| Cliente nuevo que lee un gist sin el fichero | Sin «me gusta». No es un error. |
| **Coste de leer** | El mismo `GET` del gist trae todos sus ficheros: ni una petición más. |

**Los huecos que quedan, y cómo se cierran:**

1. **Migrar el canal social** (`createSocialGistWithData`) crea un gist nuevo con un solo fichero.
   - Cliente nuevo: copia también el de reacciones, antes de repuntar las amistades.
   - Cliente viejo: los perdería. Es raro (la migración es puntual) y se acepta.
2. **Dos dispositivos propios a la vez.** Cada escritura lee, fusiona y escribe solo su fichero:
   - La fusión es por destino: gana el `at` más reciente; si empatan, gana quitar.
   - Quitar deja una lápida (`del: true`) durante 30 días, para que el otro dispositivo no lo resucite.
3. **El mismo problema, dentro del fichero nuevo.** El fichero lleva versión (`v`). Un cliente **nunca reescribe**
   un fichero de reacciones con una `v` mayor que la suya (`canRewriteReactionsFile`). Si algún día hay más tipos de
   reacción, la versión sube y los clientes viejos dejan de escribir en vez de borrar lo que no entienden.

## Fase 1 · Modelo y almacenamiento · S

- `core/social/reactions.ts` (puro, sin dependencias pesadas):
  - Tipos.
  - `reactionTargetKey`.
  - `setReaction`: poner o quitar.
  - `mergeReactions`: la fusión por destino con lápidas.
  - `pruneReactions`.
  - `normalizeReactions`: lectura defensiva sin Zod, para el gist ajeno.
  - `canRewriteReactionsFile`.
  - `indexReactionsByTarget`.
- **Topes, sin caducidad por fecha.** Un «me gusta» vivo no caduca: si caducara, una reseña antigua perdería los
  suyos. Lo que acota el tamaño es un tope de 300 vivos (`SOCIAL_REACTIONS_MAX`) y, aparte, de 300 lápidas, que sí
  caducan a los 30 días. Unos 110 bytes por entrada: ~33 KB como mucho.
- `model/schemas/socialReactionsSchema.ts` (`strictObject`):
  - Fichero: `{ v: 1, updatedAt, items }`.
  - Cada entrada: `{ on: 'activity' | 'post', to: profileId, item: id, kind: 'like', at, del? }`.
  - **Sin uid**: el destino es el pseudónimo público, como el resto del canal.
  - `kind` tiene un solo valor, pero se guarda para poder ampliarlo sin migrar.
- `SOCIAL_REACTIONS_FILENAME` en `socialProjection.ts`, junto a `socialChunkFilename`.
- Tests:
  - El nombre no casa con la expresión congelada de los chunks.
  - `writeSocialGist` no nombra el fichero, que sobrevive intacto en el gist.
  - Fusión con lápidas, desempate, topes y caducidad de las lápidas.
  - Lectura defensiva y guarda de versión.

## Fase 2 · Escritura · M · ✅ hecha (12-10-2026)

**Dónde quedó:**

- **La E/S del fichero** está en `model/repository/socialReactionsGist.ts`: `readSocialReactionsContent`,
  `readSocialReactionsRaw` y `writeSocialReactions`.
  - Va aparte de la cola para que el gist social pueda copiarlo al migrar sin una importación circular.
  - Lee con su propio ETag.
  - Si el fichero llega recortado o con el JSON roto, lanza en vez de sobrescribirlo.
- **La cola y la subida** están en `model/repository/socialReactionsRepository.ts`:
  - `setSocialLike` y `retireSocialLikesTo` apuntan la intención y la guardan en
    `LocalMeta.pendingReactions` / `pendingReactionPurges`.
  - `scheduleSocialLikesFlush` agrupa durante 4 s (`FLUSH_DELAY_MS`) y reintenta al volver la conexión (`online`).
  - `flushSocialLikes` va por `serializeSocialWrite` y escribe solo el fichero de reacciones.
  - `getPendingSocialLikes` es para que la interfaz pinte lo pulsado antes de que suba.
- **Lo que NO toca:**
  - No llama a `syncPublicIdentity`.
  - La puerta legal es `canPublishSocialInBackground`, sellada en local: cero lecturas de Firestore en el caso normal.
  - El canal se resuelve en local si ya hay gist.
- **La cola lleva dueño** (`LocalMeta.pendingReactionsUid`, añadido el 12-10-2026 al repasar el plan). La cola vive
  en el dispositivo: sin esto, lo que una cuenta dejó sin subir se subiría al gist de la siguiente que entrara en el
  mismo navegador. Si entra otra cuenta, se descarta; si vuelve la misma, se sube. Tests en `socialLikesWrite.test.ts`.
- **La migración del canal** (`ensureSecretSocialGist`) crea el gist nuevo con el fichero copiado tal cual, en la
  misma petición (`createSocialGistWithData`, parámetro `extraFiles`). Si no se puede leer, migra sin él.
- **Cambio sobre lo planeado.** Retirar los «me gusta» al dejar de ser amigos necesita el pseudónimo de la otra
  persona, y `deleteRelationship` (`useSocialFriendships`) solo conoce su uid. La API ya existe
  (`retireSocialLikesTo`); la llamada se conecta en la **Fase 3**, donde el directorio cruza uid y pseudónimo.
- **Tests:**
  - `tests/unit/socialLikesWrite.test.ts`: ráfaga en un solo `PATCH`, solo el fichero de reacciones, lápida de lo
    que solo estaba en el gist, fusión con otro dispositivo, lo pulsado mientras sube, purga, versión más nueva,
    fichero ilegible, sin red, cerrar la pestaña y las tres puertas.
  - `tests/unit/secretSocialGist.test.ts`: la copia al migrar.
- **Medido:** arranque crítico 189,6 de 190 kB, igual que HEAD sin la fase (worktree aparte). El margen estrecho ya
  venía de antes; la Fase 4 tiene que vigilarlo.

## Fase 3 · Lectura · M · ✅ hecha (12-10-2026)

**Dónde quedó:**

- **Los «me gusta» de tus amistades viajan dentro de la lectura de su gist**, sin una petición más:
  - `readPublicSocialGistById` (`socialGistRepository.ts`) normaliza también el fichero de reacciones y lo guarda en
    la MISMA entrada de la caché de sesión. Comparten ETag: o se sirven los dos o ninguno.
  - Se piden con el accesor síncrono `getPublicSocialReactions`.
  - **Por qué un accesor y no otro valor de vuelta:** los tests del presupuesto de lecturas cuentan las llamadas a
    `readPublicSocialGistById`, y así siguen valiendo tal cual.
  - Escribir el fichero principal (`writeSocialGist`) conserva en esa copia los «me gusta» ya leídos.
- **El directorio** (`useSocialDirectory`) guarda en cada entrada sus `reactions` vivos, fundidos de todos los
  candidatos legibles si hay deriva. `SOCIAL_DIRECTORY_CACHE_VERSION` sube a 8.
- **El cruce**, en `core/social/feedLikes.ts`:
  - `likeTargetOf`: solo reseñas (`type: 'review'`) y publicaciones; el destino es el `actorProfileId` /
    `authorProfileId` del elemento, nunca el id del directorio, que para una amistad es su uid.
  - `buildFeedLikes`: nombres del más reciente al más antiguo, sin repetidos ni lápidas; lo tuyo va aparte (`mine`).
- **El hook** `viewmodel/social/useSocialLikes.ts` expone `likesFor`, `canLike` y `toggleLike` en el bloque `feed`
  del view-model.
  - Tus «me gusta» salen de tu fichero más la cola (`getOwnSocialLikes`), no de tu entrada del directorio, que se
    guarda media hora.
  - **Coste:** 1 `GET` condicional a GitHub por apertura del hub; con ETag en memoria, normalmente un 304. Cero
    Firestore.
  - Lo tocado en la visita manda sobre una lectura que llegue tarde.
  - Al abrir el hub se reintenta la cola.
- **Dejar de ser amigos** retira tus «me gusta» a esa persona:
  - `useSocialFriendships` llama a `onFriendRemoved` solo con «dejar de ser amigos»; no al rechazar ni al retirar una
    petición.
  - El view-model lo pasa a `retireLikesOf`, que busca los pseudónimos con que firma en su gist.
- **Tests:**
  - `feedLikes.test.ts`.
  - `socialReactionsRead.test.ts`: misma petición, fichero roto, copia viva, la escritura del principal no los borra.
  - `useSocialLikes.test.ts`: lectura tardía en los dos sentidos, purga.
  - El caso del directorio en `socialDirectoryDegraded.test.ts`.
  - El aviso solo al dejar de ser amigos en `socialFriendshipEdges.test.ts`.
  - Los cuatro mocks del gist social, con el accesor nuevo.
- **Medido:** arranque crítico 189,6 de 190 kB, sin cambios. `npm run emulate:social` en verde, sin errores de
  consola.

**Hallazgo previo (no de esta fase), arreglado el 12-10-2026:** la copia de sesión de un gist social ajeno nunca
llegaba a revalidarse con ETag.

- `readPublicSocialGistById` consultaba primero la copia NO caducada, y al encontrarla caducada,
  `readPublicSocialGistCache` la BORRABA, de memoria y de `sessionStorage`.
- La segunda consulta (`includeExpired`) ya no la encontraba: nunca se enviaba `If-None-Match`, cada relectura bajaba
  el gist entero y gastaba cupo, y tampoco se servía la copia si GitHub limitaba.
- **Ahora mirar no borra nada.** La copia caducada se queda hasta que la sustituye la siguiente lectura buena.
- **Tests** en `socialReactionsRead.test.ts`: relectura con `If-None-Match`, también tras recargar, y servir la copia
  si GitHub limita. Los tres fallan sin el arreglo.

## Fase 4 · Interfaz · M · ✅ hecha (12-10-2026)

**Dónde quedó:**

- **El componente** es `view/components/socialhub/FeedLikeBar.tsx`. Va al pie de:
  - las tarjetas de reseña y publicación del feed (`SocialFeedScreen`, props `likesFor` / `toggleLike`);
  - el detalle de una reseña (`SocialDetailScreen` → `ReviewScreen`, hueco `footer`).
- **El botón:**
  - Es de texto, con el pulgar de Lucide (`icon-thumbs-up`, en `IconSpriteRest`, a trazo).
  - `aria-pressed`, y su nombre accesible dice de quién es lo que gusta.
  - No propaga ni el clic ni las teclas a la tarjeta, que abre el detalle.
- **Al pulsar, al momento:**
  - El estado del view-model cambia antes de subir nada.
  - El pulgar da un salto (`data-pop`; nada con `prefers-reduced-motion`).
  - La frase te cuenta.
- **El activado:**
  - Píldora tintada + pulgar relleno + `--like`.
  - `--like` propio en Witcher, Arcade y Mar de estrellas de día.
  - Texto activado aclarado de noche y oscurecido de día para pasar de 4,5:1 sobre la píldora. Medido en los 16 casos.
- **La frase** (`SOCIAL_UI.feed.likes.phrase` / `fullList`): primera palabra de cada nombre, un nombre con tres o más,
  sin «…», lista entera en el `title`.
- **Lo propio:** sin botón, solo la frase; nada si a nadie le gusta.
- **Maquetas:**
  - `docs/maquetas/social.tsx` lleva «me gusta» inventados (feed y detalle).
  - `docs/maquetas/me-gusta.html` enseña los 8 temas × 2 modos con los cuatro casos y se puede pulsar.
- **Tests:** `tests/component/FeedLikeBar.test.tsx`.
- **Medido:** arranque crítico 189,6 de 190 kB, sin cambios.
- **No incluido:** la pestaña «Reseñas» del perfil de una amistad (`SocialProfileReviewScreen`) no lleva el botón.

## Fase 5 · Saber que te han leído · S · cerrada sin rótulo (12-10-2026)

- **Decisión del usuario: no hay etiqueta «Nuevo»** en la tarjeta propia.
- Lo que hay es la frase en tus propias reseñas y publicaciones («A Marta y a Nacho les gusta»), que sale en cuanto el
  feed lee los gists de tus amistades.
- **Queda pendiente** un aviso de novedades fuera de la tarjeta (un número en la pestaña Social, «desde tu última
  visita»). Es la idea B1 de la investigación. Para contar los «me gusta» sin abrir el social haría falta leer los
  gists de las amistades fuera del hub, así que va con ella.

## Fase 6 · Texto legal · S · ✅ hecha (12-10-2026)

- **La puerta de aceptación** (`LEGAL_CONSENT_UI.body`, `legal.ts`) nombra los «me gusta» en lo que se publica.
- **La política de privacidad** (`legalContent.ts`) dice qué se publica, quién lo ve y cuándo se retira.
- **Los créditos** de los iconos citan a Lucide también para el pulgar.
- **`LEGAL_VERSION` sube a 2026-10-12b.** Se pensó meter los «me gusta» en la 2026-10-12, del resumen anual, para
  ahorrar una vuelta por la puerta, pero esa salió antes en la 1.6.11, con el texto sin «me gusta». Quien la aceptó no
  aceptó esto, así que sube (mismo criterio que la 2026-10-07b).
- **`writeSocialReactions`** pasa también la denylist (`assertNoSocialPrivateFields`) antes del esquema, con su test.
- **`npm run audit:privacy`** cubre el fichero nuevo (lo detecta por el `PATCH`): sale con 0, y los dos avisos
  informativos del correo están marcados con `audit-allow`.

## Despliegue

Sale en la **1.7.0** (la crea el usuario), junto con todo lo que no salió en la 1.6.11.

- **Los «me gusta» no tocan Firestore:** ni reglas ni índices nuevos. Viven en el gist de cada cual.
- **Sí hay que publicar a la vez el cliente y la versión legal** (`LEGAL_VERSION` 2026-10-12b), que van en el mismo
  código.
- **Lo que SÍ pide reglas en la 1.7.0 no es de este plan:** el ajuste `gameScenes` de `publicConfig` (animaciones al
  cambiar de lista, `6677824f`).
  - Comprobado el 12-10-2026: producción no lo tiene.
  - `publicConfig` exige una lista cerrada de claves, así que con las reglas viejas el cliente nuevo vería rechazada
    toda escritura de preferencias que lo lleve.
  - **Reglas antes que cliente.** `npm run test:rules` en verde con las de `develop`.
  - **Desplegadas el 12-10-2026** (`firebase deploy --only firestore:rules`, a petición del usuario). Producción ==
    `develop`, comprobado leyéndolas después.
  - Sin `audit:rules` (no está `firebase-admin`): el cambio solo AÑADE una clave opcional a la lista permitida, así que
    ningún documento existente puede quedar rechazado.
  - Índices sin tocar: no cambian desde la 1.6.10, y desplegarlos borra los que no estén en el fichero.

## Verificación

- Unit:
  - Fusión, topes, lápidas, esquema y lectura defensiva.
  - El nombre frente a la expresión de los chunks.
- Componente: tarjeta con «me gusta», `aria-pressed` y frase.
- **Compatibilidad, con un test explícito.** Un gist con los dos ficheros, escrito por el camino de siempre
  (`writeSocialGist`): el `PATCH` no nombra el de reacciones, y este sigue intacto.
- `npm run emulate:social` para ver lo que se lee y pinta.
- **Arranque crítico sin cambios** (medido con el build): todo va en el chunk perezoso del social.
- Suite completa y e2e en verde.
- **Pasada de axe (12-10-2026):** sin fallos en 64 casos sobre la maqueta del social (pantallas reales): el feed y el
  detalle de una reseña, en los 8 temas y los 2 modos, con el botón suelto y pulsado, analizando solo la barra del
  «me gusta» (`.hub-like-bar`) y con las animaciones terminadas. axe no mide sombras de texto ni contraste no
  textual: el contraste del activado se midió aparte en la Fase 4.

## Lo que NO se hace

- **No** se guardan reacciones en Firestore: cada una costaría una escritura y cada lectura del feed, N lecturas.
- **No** se cuentan «me gusta» de quien no es amistad tuya: no se leen sus gists.
- **No** hay números en la interfaz.
- **No** hay reacciones negativas ni de intensidad.
- **No** hay comentarios aquí: son la idea A4 y dependen del bloqueo (punto R).
