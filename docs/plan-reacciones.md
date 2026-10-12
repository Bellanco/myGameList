# Plan: «Me gusta» en el feed

> **Estado (12-10-2026): Fase 0 cerrada; Fase 1 en curso.** Sale de la idea A1 de
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
| Texto | Botón «Me gusta»; frase «A Marta le gusta» / «A Marta y Nacho les gusta» / «A Marta, Nacho y 2 más les gusta». **Sin** «tu reseña»: se sobreentiende | — |
| Quién ve los nombres | Todas las amistades que ven la tarjeta | Invita a leer lo que a otros les ha gustado |
| Lo tuyo | El botón queda marcado; tu nombre no entra en la frase | El botón ya lo dice |
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

## Fase 2 · Escritura · M

- `likeItem` / `unlikeItem` en `socialPublishRepository.ts`:
  - Pasan por `serializeSocialWrite` y escriben **solo** el fichero de reacciones.
  - **Sin** `syncPublicIdentity`: es lo que mantiene a cero el coste en Firestore.
- Agrupar unos 4 s: varios «me gusta» seguidos son un solo `PATCH`, por los límites secundarios de GitHub.
- Sin red, quedan pendientes en `LocalMeta` y se envían al volver; la interfaz los enseña ya puestos.
- La puerta legal es la del hub: solo se da «me gusta» desde dentro.
- Al **dejar de ser amigos**, se retiran los «me gusta» a esa persona en la siguiente escritura.
- La migración del canal copia el fichero (hueco 1). Con un fichero de versión mayor, no se escribe (hueco 3).

## Fase 3 · Lectura · M

- Que los lectores del gist ajeno (`readPublicSocialGistById` y compañía) devuelvan también el fichero de reacciones,
  pasado por `normalizeReactions`. Si no se entiende, lista vacía; nunca un fallo de lectura del perfil.
- `useSocialDirectory` guarda los «me gusta» por perfil.
- El feed cruza el índice con sus elementos por `(on, perfil del autor, id)`. Los que apuntan a algo que quien mira
  no ve se descartan.
- Los tuyos salen de tu propio fichero.

## Fase 4 · Interfaz · M

- En las tarjetas de reseña y publicación del feed, y en el detalle de una actividad: el botón «Me gusta» con el
  pulgar y la frase con nombres.
- Accesibilidad:
  - `aria-pressed` en el botón.
  - Región viva al pulsar.
  - La frase forma parte del texto de la tarjeta.
- **La forma del botón la pone cada tema.** En la maqueta se neutralizó para comparar; ver «Botones por tema».
- La maqueta del social (`docs/maquetas/social.tsx`) lleva «me gusta» en sus datos inventados, y se fotografía en
  los 8 temas × 2 modos con `scripts/capturar-maqueta-social.mjs`.

## Fase 5 · Saber que te han leído · S

- Que cuenten en «novedades desde tu última visita» (idea B1 de la investigación): los «me gusta» a lo tuyo
  posteriores a la última vez que viste el feed.
- Si B1 no existe todavía, como mínimo un rótulo en la tarjeta propia.

## Fase 6 · Texto legal · S

- El aviso del espacio social (`legal.ts`) enumera lo que se publica. Hay que añadir los «me gusta» y subir
  `LEGAL_VERSION`.
- `audit:privacy` y `assertNoSocialPrivateFields` también tienen que cubrir el fichero nuevo.

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

## Lo que NO se hace

- **No** se guardan reacciones en Firestore: cada una costaría una escritura y cada lectura del feed, N lecturas.
- **No** se cuentan «me gusta» de quien no es amistad tuya: no se leen sus gists.
- **No** hay números en la interfaz.
- **No** hay reacciones negativas ni de intensidad.
- **No** hay comentarios aquí: son la idea A4 y dependen del bloqueo (punto R).
