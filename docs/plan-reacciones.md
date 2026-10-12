# Plan: reacciones en el feed

> **Estado (12-10-2026): sin empezar.** Sale de la idea A1 de `docs/investigacion-interaccion-social.md`. Antes de
> la Fase 1 hay que cerrar las decisiones de la Fase 0. Las alternativas visuales se ven en
> `docs/maquetas/reacciones.html`, con el servidor de desarrollo.
>
> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## Qué es

Un juego corto de reacciones (propuesta: «De acuerdo», «Me lo apunto», «Discrepo» y «Ánimo») sobre lo que publican
tus amistades: reseñas, publicaciones y avisos de lista. «Me lo apunto» ofrece además añadir el juego a Deseados.

**Dónde se guarda.** Cada reacción vive en el gist social de **quien reacciona**. Como la amistad es mutua y cada
cliente ya lee los gists de todas sus amistades, la reacción llega a quien la recibe sin lecturas nuevas de
Firestore ni peticiones nuevas a GitHub. Los costes están detallados en la investigación (§A1).

## Los clientes antiguos: un fichero aparte en el mismo gist

**El problema.** El esquema del gist social es `strictObject` y la normalización se queda solo con lo que conoce.
Si las reacciones fueran un campo más de `myGameList.social.json`, una versión antigua que publicara una reseña
leería el gist, tiraría el campo y reescribiría el fichero, y con ello **borraría las reacciones de esa persona**.
Con los avisos de lista eso no importa, porque se reproyectan desde los sellos locales; las reacciones no se pueden
reconstruir.

**La solución.** Un fichero propio, `myGameList.social-reactions.json`, dentro del **mismo** gist. Esto es lo que
hacen los clientes ya desplegados, leído en `writeSocialGist` (`socialGistRepository.ts`):

- El `PATCH` solo envía `myGameList.social.json`. La API de gists **deja intactos los ficheros que no se nombran**.
- Solo borran (`null`) los ficheros que casan con `^myGameList\.social-chunk-.+\.json$`. El nombre nuevo **no**
  casa, y un test lo fija: esa expresión está congelada en clientes que no se pueden actualizar.
- Al leer cogen `body.files['myGameList.social.json']` e ignoran el resto.

En la práctica:

| Quién | Qué pasa |
|---|---|
| Cliente viejo que **publica** | Reescribe su fichero de siempre; las reacciones siguen ahí. |
| Cliente viejo que **lee** | No ve reacciones. No falla. |
| Cliente nuevo que lee un gist sin el fichero | Sin reacciones. No es un error. |
| **Coste de leer** | El mismo `GET` del gist trae todos sus ficheros: ni una petición más. Cambiar las reacciones cambia el ETag del gist, así que quien lee se descarga el gist entero (que es lo que necesita). |

**Los dos huecos que quedan, y cómo se cierran:**

1. **Migrar el canal social** (`createSocialGistWithData`) crea un gist nuevo con un solo fichero.
   - Cliente nuevo: copia también el fichero de reacciones, antes de repuntar las amistades.
   - Cliente viejo: perdería las reacciones al migrar. Es raro (la migración es puntual) y se acepta.
2. **Dos dispositivos propios reaccionando a la vez.** Cada escritura lee, fusiona y escribe solo su fichero:
   - La fusión es por par `(destino, elemento)`: gana el `at` más reciente.
   - Quitar una reacción deja una lápida (`del: true`) durante la ventana, para que el otro dispositivo no la
     resucite.

## Fase 0 · Decisiones (del usuario)

1. **Forma visual.** Las variantes están en la maqueta: A (fila de chips con contador), B (un botón con paleta y
   resumen), C (dos verbos según el contexto y nombres en vez de números) y D (caras de las amistades con la
   reacción encima).
2. **El juego de reacciones.** ¿Entra «Discrepo»? ¿«Ánimo» solo en los avisos de lista?
3. **Números o nombres.** Como solo se ven las reacciones de tus amistades, un «3» engaña (no son todas). Propuesta:
   nombres, «Marta y 2 más».
4. **A qué se reacciona.** Reseñas, publicaciones y avisos de lista. ¿También logros y resumen del año?
5. **¿Una o varias por persona y elemento?** Propuesta: una (cambiarla sustituye la anterior), como en la variante C.

## Fase 1 · Modelo y almacenamiento · S

- `core/social/reactions.ts` (puro):
  - Tipos.
  - `mergeReactions`, la fusión por par con lápidas.
  - `pruneReactions`, que aplica la ventana de 30 días (`FEED_RECENT_DAYS`) y un tope de 300.
  - `indexReactionsByTarget`, que agrupa por destino.
- `model/schemas/socialReactionsSchema.ts`, `strictObject`:
  - Fichero: `{ v: 1, updatedAt, items: [...] }`.
  - Cada entrada: `{ to: profileId, item: id, kind, at, del? }`.
  - **Sin uid**: el destino es el pseudónimo público, como el resto del canal.
- La constante del nombre del fichero junto a `SOCIAL_GIST_FILENAME`.
- Tests:
  - El nombre no casa con la expresión de borrado de los chunks.
  - El cuerpo del `PATCH` de `writeSocialGist` nunca lo nombra.
  - Fusión con lápidas, ventana y tope.

## Fase 2 · Escritura · M

- `reactToItem` / `unreactToItem` en `socialPublishRepository.ts`:
  - Pasan por `serializeSocialWrite` y escriben **solo** el fichero de reacciones.
  - **Sin** `syncPublicIdentity`: es lo que mantiene a cero el coste en Firestore.
- Agrupar unos 4 s: varias reacciones seguidas son un solo `PATCH`, por los límites secundarios de GitHub.
- Sin red, quedan pendientes en `LocalMeta` y se envían al volver; la interfaz las enseña ya puestas.
- La puerta legal es la del hub: solo se reacciona desde dentro.
- Al **dejar de ser amigos**, se retiran las reacciones a esa persona en la siguiente escritura.
- La migración del canal copia el fichero (hueco 1).

## Fase 3 · Lectura · M

- Que los lectores del gist ajeno (`readPublicSocialGistById` y compañía) devuelvan también el fichero de reacciones
  validado; si no valida, lista vacía y aviso en telemetría, nunca un fallo de lectura del perfil.
- `useSocialDirectory` guarda las reacciones por perfil, con un tope por perfil como `SOCIAL_MOVES_PER_PROFILE`.
- El feed cruza el índice con sus elementos por `(perfil del autor, id)`. Las que apuntan a algo que quien mira no
  ve se descartan.
- Las tuyas salen de tu propio fichero.

## Fase 4 · Interfaz · M

- La variante elegida en las tarjetas de reseña, publicación y aviso, y en el detalle de una actividad.
- «Me lo apunto»:
  - Al pulsarlo, ofrece «Añadir a Deseados» con el nombre ya puesto.
  - Si ya lo tienes (`gameTitleKey`), dice en qué lista.
- Accesibilidad:
  - `aria-pressed` en cada reacción.
  - El nombre accesible lleva quién («De acuerdo: Marta y Nacho»).
  - Región viva al reaccionar.
- La maqueta del social (`docs/maquetas/social.tsx`) lleva reacciones en sus datos inventados, y se fotografía en los
  8 temas × 2 modos con `scripts/capturar-maqueta-social.mjs`.

## Fase 5 · Saber que te han respondido · S

- Que cuenten en «novedades desde tu última visita» (idea B1 de la investigación): las reacciones a lo tuyo
  posteriores a la última vez que viste el feed.
- Si B1 no existe todavía, como mínimo un rótulo en la tarjeta propia: «2 reacciones nuevas».

## Fase 6 · Texto legal · S

- El aviso del espacio social (`legal.ts`) enumera lo que se publica. Hay que añadir las reacciones («y las
  reacciones a la actividad de tus amistades») y subir `LEGAL_VERSION`.
- Juntarlo con «Te lo recomiendo» (A2) si va cerca, para pedir una sola aceptación.
- `audit:privacy` y `assertNoSocialPrivateFields` también tienen que cubrir el fichero nuevo.

## Verificación

- Unit: fusión, ventana, tope, esquema y el nombre frente a la expresión de los chunks.
- Componente: tarjeta con reacciones, `aria-pressed` y «Me lo apunto».
- **Compatibilidad, con un test explícito.** Un gist con los dos ficheros, escrito por el camino viejo
  (`writeSocialGist` con solo el principal): el cuerpo del `PATCH` no menciona el de reacciones.
- `npm run emulate:social` para ver lo que se lee y pinta.
- **Arranque crítico sin cambios** (medido con el build, hoy 187,7 de 190 kB): todo va en el chunk perezoso del
  social.
- Suite completa y e2e en verde.

## Lo que NO se hace

- **No** se guardan reacciones en Firestore: cada una costaría una escritura y cada lectura del feed, N lecturas.
- **No** se cuentan reacciones de quien no es amistad tuya: no se leen sus gists.
- **No** hay comentarios aquí: son la idea A4 y dependen del bloqueo (punto R).
