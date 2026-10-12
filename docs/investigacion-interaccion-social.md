# Investigación: más relación entre usuarios, más visitas diarias y juegos mejor conectados

> **Estado (12-10-2026): investigación, nada implementado.** Recoge lo que hay hoy (leído en el código de
> `develop` tras `da15bfc7`), las restricciones que deciden qué cabe y una lista priorizada de ideas. Las
> decisiones de producto y privacidad del final son del usuario y van antes de cualquier plan de fases.
>
> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.
> Los costes en lecturas son estimaciones leyendo el código, no mediciones (la Fase 0 de
> `docs/plan-capacidad-gratuita.md` sigue pendiente).

## TL;DR

Hoy el social es **un escaparate de solo lectura entre amistades**: se publica (reseñas, avisos de lista, logros)
y se mira, pero no hay ninguna forma de **responder** a lo que publica otro. Tampoco hay motivo para volver cada
día: nada avisa de que haya novedades. Y los juegos no se relacionan entre sí porque **no tienen identidad
común**: el `id` es local a cada biblioteca y el cruce se hace por nombre (`gameTitleKey`).

Las tres palancas con más rendimiento por esfuerzo, encajadas en lo que ya hay:

1. **Interacciones que viven en el gist de quien las hace** (reacciones, «te lo recomiendo»): cero lecturas de
   Firestore, porque los gists de las amistades ya se leen.
2. **Novedades desde tu última visita**: un número en la pestaña Social y un separador en el feed. Es la razón
   para abrir la app que hoy falta.
3. **Identidad canónica del juego**: `/cover` ya encuentra la ficha de IGDB de cada juego y **tira su id**; se
   queda solo con el de la carátula. Guardarlo abre la ficha de juego, «amigos que lo tienen» y las sagas de verdad.

## 1. De dónde se parte

**Lo que hay** (rutas en `src/viewmodel/social/socialRoutes.ts`):

- Feed de amistades: reseñas (adelanto de 160 caracteres y nota), avisos de cambio de lista, logros y resumen
  del año. Publicaciones de texto libre, pero **bronce no puede publicar** (`PROFILE_TIER_POST_MAX_LENGTH`,
  `src/core/constants/tiers.ts`), así que en la práctica solo publica el administrador.
- Directorio (`/social/profiles`): amistades y los 34 perfiles recientes, con filtro local por nombre.
- Perfil de una amistad: sus listas (gist de juegos), reseñas, publicaciones, logros y estadísticas, que no se
  comparan con las tuyas.
- Reseñas relacionadas al final de una reseña: mismo juego, saga, autor y género (`core/social/relatedReviews.ts`).
- Resumen del año con un capítulo «en común» (afinidad, completados de los dos, sus juegos que tú tienes
  pendientes) en `core/stats/yearSummary.ts`. Solo existe en temporada.
- Premios (porra estacional), enlace público `/r/:token` e invitación genérica (sin token) para quien tiene menos
  de 3 amistades.

**Lo que no hay:**

- Reacciones, comentarios, menciones ni mensajes.
- Recomendaciones dirigidas a una persona (el tipo `recommendation` del gist es heredado).
- Avisos de novedades. El punto de la pestaña Social indica si el social está activo, no si hay algo nuevo.
- Push y correo.
- Sugerencias de amistad.
- Bloqueo o denuncia (punto «R», pendiente de decisión).
- Búsqueda fuera de tus listas. El directorio filtra por nombre («Filtrar perfiles por nombre»); había una constante
  sin usar que prometía «nombre, email o juego», corregida el 12-10-2026.
- Página de un juego, identificador común de juego y desarrolladora.

## 2. Lo que decide qué cabe

| Restricción | Dónde está | Qué implica para las ideas |
|---|---|---|
| Solo se lee la biblioteca de las **amistades**; de los demás, nombre y foto | `useForeignProfileGames.ts` (regla 1), `plan-directorio-amigos.md` | Nada de feed público, tendencias de desconocidos ni afinidad con no-amigos |
| Firestore gratuito: 50.000 lecturas al día; el social ya gasta 110–1.000 por usuario | `plan-capacidad-gratuita.md` | Toda interacción nueva debe costar **0 lecturas** de Firestore, o casi |
| Sin `onSnapshot` (`firestore/lite`); el feed **no** se materializa | `plan-escalabilidad-firestore.md`, «Lo que NO se hace» | Nada en tiempo real: las interacciones son asíncronas |
| KV: 1.000 escrituras y 1.000 *list* al día, compartidas con carátulas y enlaces | `plan-capacidad-gratuita.md` | KV solo para cosas raras (invitaciones), nunca por cada clic |
| Sin terceros en una visita anónima | `tests/e2e/smoke.test.ts` | Push y metadatos de IGDB, siempre por el borde propio |
| Rangos ocultos al usuario | memoria `rangos-ocultos-al-usuario` | Nada visible puede explicar algo «por tu rango» |
| No se pasa a plan de pago | `plan-capacidad-gratuita.md` | Cada idea lleva su coste en cupos |

### La pieza que lo hace posible: la interacción se guarda en el gist de quien la hace

La amistad es mutua y cada cliente ya lee los gists sociales de todas sus amistades para montar el feed. Por eso:

- Si **A reacciona** a una reseña de **B**, la reacción se escribe en el gist social **de A** como
  `{ a: uidB, item: idDeLaActividad, kind, at }`.
- B lee el gist de A porque son amistad, así que **ve la reacción sin coste nuevo**.
- **C**, amistad de los dos, también la ve. **D**, amistad solo de A, la descarta: apunta a contenido que D no
  puede leer.

Consecuencias que hay que aceptar:

- **Coste:** no hay lecturas nuevas de Firestore. Es una escritura en GitHub por ráfaga de reacciones, agrupada
  con lo que ya se publica.
- **Retraso:** llega con la frescura del feed (`PROFILE_TIER_FEED_TTL_MS`: 30 min en bronce), y no al instante.
- **Visibilidad parcial:** cada cual ve las interacciones de **sus** amistades, no todas. Es coherente con la
  promesa de privacidad, y el texto debe decirlo: «3 amigos tuyos», no «3 personas».
- **Tamaño:** hace falta una ventana (30 días, como los avisos) y un tope, como `moves`.

El mismo molde sirve para reacciones, recomendaciones dirigidas y, más adelante, comentarios.

## 3. Ideas

Esfuerzo: S (días), M (una o dos semanas), L (más). Coste: lo que gasta de los cupos.

### A. Que la gente se responda

**A1 · Reacciones a reseñas, publicaciones y avisos · M · coste ≈ 0.**
- Qué: un juego corto y fijo de reacciones con sentido en esta app, sin «me gusta» genérico: «De acuerdo», «Me
  lo apunto», «Discrepo» y «Ánimo» (este último para un aviso de abandono o de una lista larga).
- Cómo: molde del §2. «Me lo apunto» puede ofrecer de un toque añadir el juego a Deseados (`/deseados`). Es el
  puente directo entre el social y las listas.
- Por qué funciona: es la interacción más barata para quien la hace, y hace que publicar compense, porque alguien
  contesta. Es lo que Letterboxd y Backloggd usan para sostener la publicación.
- Riesgo: es poco (no hay texto libre), pero un «Discrepo» sin poder explicarse puede escocer. Decidir si entra.

**Coste de A1, leído en el código (12-10-2026):**

| Concepto | Por reacción | De dónde sale |
|---|---|---|
| Firestore | **0 lecturas, 0 escrituras** en el caso normal | El pseudónimo (`resolveStableProfileId`) ya está en memoria al abrir el hub, y la reacción **no** llama a `syncPublicIdentity`, que es lo que escribe en Firestore al publicar una reseña |
| GitHub, quien reacciona | 1 GET condicional, normalmente 304 desde la caché de sesión de 20 s, y 1 PATCH **por ráfaga** | `openSocialWrite` y `commitSocialWrite`, en la cola `serializeSocialWrite` |
| GitHub, quien lee | **0 peticiones nuevas**: viaja dentro del gist social que ya se relee con ETag | `useSocialDirectory`; un 304 autenticado no gasta cupo primario (la revalidación se arregló el 12-10-2026: ver el hallazgo de la Fase 3 en `plan-reacciones.md`) |
| Cloudflare (Functions y KV) | 0 | — |
| Tamaño | ~86 bytes. Con un tope de 300 y una ventana de 30 días, ~26 KB más como mucho por amistad en lectura en frío | El gist social va sin comprimir; el precedente son los 400 avisos de `MOVE_ACTIVITY_MAX` |
| Arranque crítico | 0, si todo vive en el chunk perezoso del social | Hoy 187,7 de 190 kB |

Lo que hay que respetar:
- **Agrupar las reacciones** varios segundos antes de escribir. GitHub tiene límites secundarios para escrituras
  (del orden de 80 por minuto) y quien reacciona a diez cosas seguidas no debe hacer diez PATCH.
- **El destino es estable.** El `id` de una reseña es `perfil + juego + tipo` (`buildActivityKey`), así que
  editarla no deja huérfanas sus reacciones. Contrapartida: un «De acuerdo» sigue pegado aunque la reseña se
  reescriba entera.

Lo que de verdad cuesta:
- **Una nueva aceptación legal.** El texto legal (`legal.ts`) enumera lo que se publica («las reseñas y los
  movimientos de listas»). Las reacciones son una categoría nueva, así que sube `LEGAL_VERSION` y todo el mundo
  vuelve a pasar por la puerta; hasta aceptar, no sale nada en segundo plano. Conviene juntarlo con A2, que
  también lo exige.
- **Los clientes viejos.** El esquema es `strictObject` y un cliente sin el campo lo tira al normalizar. Si
  alguien publica desde una versión antigua, borra sus propias reacciones del gist; es el mismo trato que ya
  tienen `hiddenMoves` y `editedAt`. A diferencia de los avisos de lista, las reacciones no se pueden volver a
  sacar de los datos locales, así que se pierden.
- **Esfuerzo.** Unas 1–1,5 semanas: esquema y normalización, escritura agrupada y retirar una reacción, lectura
  y cruce en el feed, interfaz en la tarjeta y el detalle, «Me lo apunto» → Deseados, texto legal, maqueta del
  social en 8 temas × 2 modos, y tests.

**A2 · «Te lo recomiendo» dirigido a una amistad · M · coste ≈ 0.**
- Qué: desde un juego de tus listas, eliges a una o varias amistades y, opcionalmente, añades una línea.
- Cómo: lo reciben en una bandeja «Te recomiendan» del hub, con «Añadir a Deseados» y «No me interesa».
- Datos: el molde del §2, con `to: uid`. Solo lo lee el destinatario.
- Por qué funciona: es lo más social que existe en una app de listas (alguien pensó en ti), y lleva a una acción
  concreta.
- Nota: el tipo `recommendation` del gist es heredado y de otra cosa. Conviene un campo nuevo para no mezclar.

**A3 · Abrir las publicaciones a todos · S · coste ≈ 0.** Hoy bronce = 0 caracteres, así que el feed solo tiene
lo que se genera solo. Con un tope modesto para bronce (280–500) la gente podría escribir «¿alguien ha jugado
X?». Es una decisión de producto, no técnica. Ojo: sin bloqueo (punto R), abrir texto libre es abrir la puerta a
lo que ese punto quiere cerrar.

**A4 · Comentarios en reseñas · L · coste ≈ 0 en cupos, alto en producto.** Encajan en el mismo molde, pero son
la pieza con más riesgo:
- Hilos que cada cual ve a medias (solo los comentarios de sus amistades).
- Moderación.
- El bloqueo como requisito previo.

Recomendación: **no antes** de A1–A2 y del punto R. Puede que A1 + A2 cubran lo que se busca.

### B. Razones para volver cada día

**B1 · Novedades desde tu última visita · S · coste 0.**
- Guardar en `LocalMeta` cuándo se vio el feed por última vez.
- Al hidratar, contar lo posterior y pintarlo como número en la pestaña Social: los avisos de lista solo cuentan
  si así lo eliges.
- En el feed, un separador «Desde tu última visita».
- Sin red ni lecturas: el directorio ya se hidrata en segundo plano (`backgroundSocialPass`).

Es la base de la que dependen A1 y A2: sin aviso, una reacción no se descubre.

**B2 · «Ahora juegan» · S · coste 0.**
- Una franja arriba del feed con lo que tus amistades tienen En curso, sacada de los avisos de lista que ya llegan.
- Destacar las coincidencias: «Ana y tú estáis con *Hades II*».
- Es contenido vivo cada día aunque nadie escriba.

**B3 · Reto del mes · M · coste bajo.**
- Un reto común definido desde el panel, por ejemplo «termina un juego de tu Vergüenza» o «uno de antes de 2010».
- Se sirve como el aviso, desde `/api/announcement` y KV, sin pasar por Firestore.
- El progreso es local y se publica como un logro más.
- Repite el tirón de premios con un ritmo mensual en vez de estacional.

**B4 · Tu semana · S–M · coste 0.** Una cápsula los lunes en el carril (el mismo armazón de `useLaneToast`) con
«esta semana tus amistades terminaron 4 juegos; Luis puso un 92 a *Astro Bot*». Todo sale del feed ya cargado.

Cómo se comportan hoy las cápsulas (`useToastLife`, montadas en `App.tsx` dentro de `.ach-toast-stack`):
- **Cambiar de pestaña del navegador** no la gasta: el reloj se para con la página oculta (`usePageVisible`).
- **Moverse por la app** (listas, estadísticas, ajustes) tampoco la quita: vive fuera del `main`.
- **Lo que sí la quita** son 10 s de vida con la página delante, sin el ratón ni el foco encima.
- **Se da por dicha al montarse** (`markShown`). Si pasa sin que se lea, no vuelve hasta la semana siguiente.
- **Hace cola** detrás del logro, las condiciones nuevas, el resumen del año y el aviso del administrador.

Para un resumen semanal eso es poco. Por eso la cápsula debe ser solo el aviso: el contenido vive en una tarjeta
«Tu semana» arriba del feed hasta el lunes siguiente, y sigue ahí aunque la cápsula se haya ido.

**B5 · Invitación personal · M · coste: 1 escritura de KV por invitación.**
- Qué: un enlace `/i/:token` que, al registrarse, deja creada la solicitud de amistad con quien invitó.
- Por qué: hoy la invitación es un enlace a la portada, y el que llega tiene que buscar a quien le invitó en un
  directorio que solo filtra por nombre.
- Es la palanca de crecimiento: cada usuario nuevo llega ya con una amistad, y el feed no le sale vacío.

**B6 · Notificaciones push · L · coste alto.** Lo dejo para el final:
- Exige un Worker aparte con disparo programado: las Pages Functions no tienen cron.
- Exige claves VAPID y guardar las suscripciones, a escrituras de KV por dispositivo.
- En iOS solo funciona con la PWA instalada.
- Con B1 cubierto, el beneficio extra es pequeño frente al coste.

### C. Juegos conectados y la información más a mano

**C1 · Identidad canónica del juego · M · coste: escrituras de KV al reemparejar.**
- Lo que pasa hoy: `functions/_lib/igdbCover.ts` empareja cada juego con su ficha de IGDB (`FichaIgdb.id`) y
  guarda en KV solo el id de la **carátula**.
- El cambio:
  - Que el borde devuelva también el id de juego.
  - Que el cliente lo guarde como campo **aditivo y opcional** en `GameItem` (por ejemplo `igdbId?`). Sin cota
    nueva en el esquema: ver `gamesGistSchema.ts`.
- Por qué así: el gist ya viaja a las amistades, así que el cruce entre bibliotecas pasaría de «mismo nombre
  normalizado» a «misma ficha», y *Hades 2* y *Hades II* dejan de depender de las reglas de `gameTitleKey`.
- Cuidado: rehacer los emparejamientos ya guardados gasta escrituras de KV (subir la versión de la clave). Debe
  hacerse **perezoso**, al pedir cada carátula, nunca en bloque. Mientras no haya id, el nombre sigue de respaldo.

**C2 · Ficha de juego · M–L · coste: lecturas de GitHub, 0 de Firestore.**
- Una pantalla por juego (`/juego/:clave`), con tu entrada y «tus amistades y este juego»: en qué lista lo
  tiene cada una, su nota, el adelanto de su reseña y la media entre amistades.
- Abajo, la saga: las otras entregas en tus listas y en las de tus amistades.
- Se entra desde tus listas, el feed, las reseñas y la búsqueda (C4).
- Datos: hoy los gists de juegos de las amistades se piden al abrir cada perfil. Para «quién lo tiene» hace falta
  un índice local `clave → [uid, lista, nota]`, construido en segundo plano y guardado en IndexedDB.
  - Coste: una lectura de GitHub por amistad y día, dentro de las 5.000 por hora del token.
  - Respeta la visibilidad de cada cual (`applyProfileVisibility`) al construirlo, no al pintarlo.
- Funciona ya con `gameTitleKey`, sin esperar a C1. Con C1 acierta más.

**C3 · «En común» todo el año en el perfil de una amistad · S–M · coste 0.**
- El capítulo del resumen del año (afinidad, dónde más chocáis, sus completados que tú tienes pendientes)
  existe solo en temporada y recortado a un año.
- Sacarlo sin corte de año como pestaña del perfil convierte cada perfil en una recomendación personal: «A Marta
  le encantó esto y tú lo tienes en Próximos».
- Ojo: coordinarlo con `docs/plan-resumen-del-ano.md`, que otra sesión está escribiendo.

**C4 · Búsqueda de verdad · S el arreglo, M la global.**
- Ya hecho: el texto del directorio dice lo que hace («Filtrar perfiles por nombre»).
- Después: una sola caja de búsqueda (atajo `/` en escritorio) que encuentre tus juegos, las fichas de juego
  (C2), tus amistades y las reseñas de tus amistades.
- Todo es local, porque ya está cargado o indexado.

**C5 · Datos de la ficha desde IGDB · L · depende de C1.**
- Qué: franquicia, desarrolladora, fecha de salida y duración media (IGDB las tiene).
- Para qué: sagas reales en lugar del prefijo de título (`gameSaga.ts`) y filtros nuevos en tus listas.
- Dónde guardarlos: en el **gist del usuario** al añadir el juego, no en KV (por el cupo de escrituras).
- Cómo pedirlos: por el borde, con el tope de 4 peticiones por segundo de IGDB y fallo blando, como las carátulas.

**C6 · Listas temáticas · M · coste ≈ 0.** Colecciones con título y orden («Mis 10 metroidvanias», «Para jugar
en pareja») como contenido nuevo del gist social. Se pueden compartir con `/r/`. Dan algo que leer que no es una
reseña, y las amistades pueden reaccionar a ellas (A1).

## 4. Lo que no recomiendo

- **Seguidores o perfiles abiertos a no-amigos.** Rompe la promesa de «nombre y foto» y obliga a leer bibliotecas
  ajenas.
- **Feed global o «tendencias» de la comunidad.** Por privacidad, y porque exige materializar el feed, que ya se
  descartó con la medición delante.
- **Sugerencias de amistad por afinidad con desconocidos.** Mismo motivo. «Amistades de tus amistades» solo con
  una aceptación expresa, y aun así la lista de amistades no está en el gist: hoy no hay de dónde sacarla.
- **Chat o mensajes directos.** No hay tiempo real (`firestore/lite`), y es la parte de moderación más cara.
- **Rachas diarias que castigan faltar.** Dan visitas a costa de ansiedad, y chocan con una app offline-first que
  se usa a rachas de verdad (al terminar un juego). Mejor ritmos semanales y mensuales (B3, B4).
- **Contar visitas del enlace público.** Ya descartado en `plan-compartir-resenas.md`.

## 5. Orden propuesto y cómo saber si funciona

| Paso | Ideas | Por qué en este orden |
|---|---|---|
| 0 | Medir | Sin línea base no se sabe si algo sube el tráfico. Ya existe `trackAnalyticsEvent` (`telemetryRepository.ts`). |
| 1 | B1, C4 (arreglo), B2 | Coste cero y días de trabajo. B1 es requisito de todo lo social que viene después. |
| 2 | A1, A2 | Las interacciones, con el molde del §2. Una sola pieza nueva en el gist para las dos. |
| 3 | C3, C2 | Relación entre juegos con lo que ya hay (nombre normalizado). |
| 4 | C1, después C5 | Identidad canónica y fichas ricas. |
| 5 | B5, B3, B4, A3 y C6 | Crecimiento y ritmo, según lo que digan las mediciones. |
| — | A4, B6 | Solo si lo anterior se queda corto, y después del bloqueo (R). |

Medición del paso 0, con eventos sin datos personales:
- **Uso:** usuarios activos al día y a la semana, y su cociente (la «pegajosidad»).
- **Social:** porcentaje de sesiones que abren el social.
- **Retención:** vuelta a los 7 días.

Y una cifra por idea:
- **A1:** reseñas con al menos una reacción.
- **A2:** recomendaciones aceptadas.
- **B1:** sesiones que entran con novedades.
- **C2:** fichas abiertas.

La analítica solo funciona con el consentimiento previo y revocable de `analyticsConsentRepository.ts`. Por eso
las cifras salen de **quien acepta**, no de todo el mundo, y sirven para comparar antes y después, no como
recuento absoluto.

## 6. Decisiones abiertas (del usuario)

1. **Reacciones:** ¿qué juego de reacciones? ¿Entra «Discrepo»?
2. **Publicaciones para bronce:** ¿se abren, y con qué tope? El texto no puede mencionar rangos.
3. **Bloqueo (punto R):** ¿se decide ya? Es requisito de A3 y de A4.
4. **Recomendaciones:** ¿recibirlas es opcional (se puede apagar) o siempre activo?
5. **Ficha de juego:** ¿la media de notas de tus amistades se muestra, o solo la lista de quién lo tiene?
6. **C1:** ¿se acepta guardar el id de IGDB en el gist de juegos? Es un dato público de catálogo, no personal.
7. **Invitación personal:** ¿la amistad queda **pendiente** de que la acepte quien invitó, o aceptada directamente?
