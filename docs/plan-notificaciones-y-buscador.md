# Plan: «me gusta» en la campana y buscador general

> **Estado (13-10-2026): notificaciones (N1–N4) hechas, sin comitear; el buscador, sin empezar.** Sale de las ideas B1 y C4 de
> `docs/investigacion-interaccion-social.md`, con lo que el usuario decidió el 13-10-2026 (§2 y §4).
>
> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## 1. Qué es

1. **Notificaciones de «me gusta» en la campana del feed.** La campana que hoy solo avisa de solicitudes de amistad
   avisa también de los «me gusta» que han dado tus amistades a tus reseñas y publicaciones. Solo aparece cuando hay
   algo sin ver, y cada «me gusta» se avisa **una sola vez por persona y reseña**.
2. **Buscador general**, al estilo de Spotlight: una caja que se abre encima de cualquier pantalla y encuentra tus
   juegos en las cinco listas (sin distinguir acentos), los juegos con reseña en el social, tus amistades y las
   pantallas de la app.

## 2. Decisiones del usuario (13-10-2026)

| Tema | Decisión |
|---|---|
| Dónde se avisa | En la campana del feed (`FeedShell.tsx`), la de las solicitudes. Sin punto en la pestaña Social ni avisos fuera del hub |
| Cuándo sale la campana | Solo con algo que ver: solicitudes pendientes **o** «me gusta» sin ver. Se mantiene la regla del 09-10-2026: sin nada, no hay campana |
| Repetición | Una vez por persona y reseña (o publicación). Quitar y volver a poner el «me gusta» **no** vuelve a avisar |
| Buscador | General, como Spotlight. En las listas busca juegos sin distinguir acentos; en el social, juegos que tengan reseñas |
| Qué enseña la pantalla | **Solo lo nuevo.** Lo visto se borra de la pantalla (el «me gusta» sigue debajo de la reseña); no hay «Anteriores» |
| Forma de cada aviso | **Una fila por reseña** (o publicación), con la frase del feed: «A Marta y a Nacho les gusta tu reseña de *Hades II*» |
| Elegir un juego de tus listas | Lleva a **su lista filtrada** (`?q=`), que se quita desde su chip |
| Cómo se abre el buscador | **⌘K / Ctrl+K** y **`/`** (fuera de un campo de texto) en cualquier pantalla, y un **botón flotante con lupa, encima del dado** de la ruleta y más pequeño que él, **solo en las listas** |
| Icono de la lupa | **`sistrix`** de Font Awesome (brands, https://fontawesome.com/icons/sistrix), elegido por el usuario el 13-10-2026. Font Awesome Free ya está acreditado en los créditos (`legalContent.ts`, CC BY 4.0). Es el logotipo de una marca (SISTRIX): ver la nota de §7 |
| Cuándo se borra lo visto | **Al salir del social**, no al entrar en la pantalla: abrir un aviso y volver atrás no la deja vacía |

## 3. Lo comprobado en el código (13-10-2026)

### Notificaciones: se puede, con coste cero

- **El dato ya llega.** Cada «me gusta» guarda `to` (pseudónimo del autor), `on` (`activity` o `post`), `item`
  (id de la entrada) y `at` (`core/social/reactions.ts`). Los de tus amistades vienen dentro de su entrada del
  directorio (`SocialDirectoryEntry.reactions`, `useSocialDirectory.ts:466`), en la misma lectura de su gist
  social. Los que van a ti son los de `to === tu profileId` y sin `del`.
- **Coste:** 0 lecturas y 0 escrituras de Firestore, 0 peticiones nuevas a GitHub. No se publica nada nuevo, así
  que **no sube `LEGAL_VERSION`**: solo se reordena lo que ya se ve debajo de la tarjeta.
- **«Una vez por persona y reseña»** sale de la clave `quien|on|item`, sin `at`. Así, quitar y volver a poner no
  repite el aviso.
- **Retención:** los «me gusta» vivos no caducan por fecha; el tope es de 300 por persona (`SOCIAL_REACTIONS_MAX`).
- **Límites que se aceptan:**
  - **Frescura:** llegan con el directorio, a lo sumo 30 min en bronce y 20 en plata (`PROFILE_TIER_FEED_TTL_MS`).
  - **Por dispositivo:** lo visto se guarda en IndexedDB de cada aparato. Si lo ves en el móvil, el ordenador te
    lo seguirá enseñando como nuevo.
  - **Solo amistades:** el «me gusta» de alguien que deja de ser amistad desaparece (`retireLikesOf` y el filtro
    del directorio).
  - **El primer día:** al salir, todos los «me gusta» existentes cuentan como nuevos. Llevan desde la 1.7.0
    (12-10-2026), así que son pocos: no hace falta sembrarlos como vistos.

### Buscador: se puede, todo en local

| Fuente | De dónde sale | Red |
|---|---|---|
| Tus juegos, en las cinco listas | El view-model de listas, en memoria | No |
| Reseñas de tus amistades (juego, autor, nota, adelanto) | Directorio guardado en IndexedDB (`getCachedSocialDirectory` con `allowExpired`) cruzado con las amistades guardadas (`getCachedMyFriendships`). Cada `SocialActivityEntry` trae `gameName`, `gameId`, `grade` y `snippet` | No, y **sin cargar Firebase** |
| Tus reseñas publicadas | Tu entrada del mismo directorio | No |
| Tus amistades, por nombre | El mismo directorio | No |
| Pantallas de la app | Tabla fija, con las mismas puertas que la navegación (Diseño sin social, premios por temporada, admin solo con el claim) | No |

- **Acentos:** hoy `filterGames` solo pasa a minúsculas (`toolbarFilters.ts:79`), así que «pokemon» no encuentra
  «Pokémon». `gameTitleKey` ya quita diacríticos con `normalize('NFD')`. Se usa el mismo paso para buscar, pero no
  la clave entera: esa también quita sufijos de edición, y buscar «remastered» tiene que encontrar el juego.
- **El atajo ⌘ Espacio no se puede:** macOS lo reserva para Spotlight y no llega al navegador; en Windows, Ctrl
  Espacio cambia el idioma del teclado. Ctrl+F se podía capturar, pero quitaba la búsqueda del navegador en el
  resto de pantallas; Ctrl+S es «guardar» y Ctrl+E/B no son convención. Queda **⌘K / Ctrl+K** (el estándar de
  GitHub, Slack, Notion o Linear; en Chrome y Firefox de Windows lleva a la búsqueda web, que se cede) y **`/`**
  (GitHub, YouTube, Gmail). Hoy no hay ningún atajo global que choque: los únicos `metaKey` del código son
  Ctrl+Enter en el compositor y en las publicaciones.
- **Frescura del social:** el buscador ve lo que trajo la última visita al hub. Quien nunca abre el social no
  tiene ese apartado.
- **Arranque:** el chunk crítico tiene un techo que vigila `scripts/ci-validate.js`, y **solo quedan 0,5 kB** (189,5
  de 190 medido el 13-10-2026). En el arranque solo entran el
  atajo y la lupa; el panel y el índice van en un `import()`. Se mide con `npm run build` y `npm run validate`
  antes y después.
- **Privacidad:** el texto buscado no sale del dispositivo: ni a GA4 ni a telemetría (mismo criterio que la huella
  del nombre en `/stats/resenas`).

## 4. Ajustes que se discutieron (13-10-2026)

1. **Lo visto se borra al salir del social (aceptado).** Si se borrara al entrar, abrir un aviso para ver la reseña
   y volver atrás dejaría la pantalla vacía. Lo nuevo se queda mientras sigas dentro del hub y se borra al salir de
   él (o al recargar); la campana desaparece en ese momento.
2. **La lupa en todas las secciones (descartado por ahora).** El dado y el «+» solo se pintan en las listas
   (`activeSection === 'lists'`, `App.tsx:1322`), y la lupa va con ellos. Fuera de las listas el buscador se abre
   solo con el teclado, así que **en móvil no se puede buscar desde el social ni desde las estadísticas**: se
   acepta así y se revisa con el uso.
3. **Ctrl+F con salida al navegador (descartado).** Sustituido por ⌘K / Ctrl+K y `/`.

## 5. Fases

### Notificaciones · ✅ HECHAS (13-10-2026)

Dónde quedó: `core/social/likeNotifications.ts` (puro), `model/repository/likeNotificationsSeen.ts` (lo visto, en
`LocalMeta.seenLikes`, tope de 1.000 claves), `viewmodel/social/useLikeNotifications.ts` (el hook, cableado en
`useSocialViewModel`) y la pantalla en `SocialRequestsScreen`. La campana de `FeedShell` recibe `bellVisible` y
`bellCount`. Maqueta: variantes `solicitudes`, `notificaciones-me-gusta` y `solicitudes-vacia`. Tests:
`likeNotifications`, `likeNotificationsSeen`, `useLikeNotifications`, `FeedShell` y `SocialRequestsScreen`. El
arranque no cambia: crítico 189,5/190 kB antes y después (`npm run build` + `node scripts/ci-validate.js`, contra un
worktree de `HEAD`).

Lo que se planeó:

**N1 · Modelo puro.** `core/social/likeNotifications.ts`:
- Entrada: las amistades del directorio, tu `profileId`, tus reseñas y publicaciones, y las claves vistas.
- Salida: filas agrupadas por destino, con quién, el título del juego o el principio de la publicación, la fecha
  más reciente y si hay algo nuevo.
- Descarta lápidas, destinos que ya no están en tu gist (reseña borrada) y los «me gusta» a ti mismo.
- Tests unitarios.

**N2 · Lo visto, en local.** Las claves `quien|on|item` se guardan en IndexedDB. Al leerlas se podan las que ya no
existen para que no crezcan sin fin. Si IndexedDB falla (modo privado), todo cuenta como nuevo y no se rompe nada.

**N3 · Campana y pantalla.**
- Campana: sale si `pendingIncomingCount + likesNuevos > 0`, y el número es esa suma. La etiqueta accesible
  nombra las dos cosas.
- La pantalla de solicitudes pasa a «Notificaciones»: solicitudes arriba (piden respuesta) y «Me gusta» debajo. La
  dirección `/social/requests` se mantiene.
- Solo se enseña lo nuevo. Se marca visto al entrar, pero sigue en pantalla hasta salir del hub (§4.1); después
  desaparece.
- Cada fila abre tu reseña (`/social/profiles/me/game/:gameId/review`) o tus publicaciones
  (`/social/profiles/me/posts`).
- El aviso de vacío cambia: contestar la última solicitud ya no deja la pantalla vacía si hay «me gusta».

**N4 · Maqueta y pruebas.**
- La pantalla nueva entra en `docs/maquetas/social.html`, y se repasan las capturas en 8 temas × 2 modos con
  `scripts/capturar-maqueta-social.mjs`.
- Pasada de axe, y móvil a 390 px con texto grande.
- Tests de componente de la campana: sale solo con algo nuevo y la suma es correcta.

### Buscador · 0,5 días + 4–6 días

**B0 · Listas sin acentos (0,5 días).** Una sola función de normalización para buscar (`core/utils`), usada por
`filterGames`. Así la caja de cada lista deja de distinguir acentos, también sin el buscador nuevo. Tests.

**B1 · Índice y búsqueda puros.**
- `core/search/`: fuentes → resultados por grupo (Juegos, Reseñas, Amistades, Ir a…).
- Orden: empieza por > empieza una palabra > contiene. Hasta 5 por grupo, con «Ver más».
- Las reseñas, agrupadas por juego: «*Hades II* · Marta 92 · Nacho 85 · tú 90».
- Tests.

**B2 · El panel.**
- Diálogo modal con el patrón combobox + listbox: flechas, Enter, Esc, y el foco vuelve a donde estaba.
- Se abre con ⌘K / Ctrl+K o `/` en cualquier pantalla, y con la lupa flotante en las listas. El panel se carga
  perezoso; en el arranque solo entran el botón y el atajo. El atajo se enseña en la descripción de la lupa
  («Buscar · ⌘K», o Ctrl+K fuera de Mac) y en el pie del panel.
- Qué abre cada resultado:
  - Juego: su lista con `?q=` (duda 3).
  - Reseña de una amistad: `/social/user/:id/game/:gameId/review`.
  - Tu reseña: `/social/profiles/me/game/:gameId/review`.
  - Amistad: `/social/profiles/:id`.
  - Pantalla: su ruta.
- Al abrir no hay red: el social sale de IndexedDB y no carga Firebase (vigilar que el enlace público `/r/` siga
  sin cargarlo: `tests/e2e/sharedLink.test.ts`).

**B3 · Temas, medición y pruebas.**
- Maqueta en Chrome (8 temas × 2 modos, 1280, 1512 y 390 px) antes de cerrar la forma, con la lupa en la columna
  de las listas: `+` 58 px, dado 39 px, lupa ~32 px, alineada con el eje del dado (`_roulette.scss`). Se apaga con
  el menú de ajustes abierto, como los otros dos (`body.settings-menu-open`).
- Construcción de la lupa en cada tema, como la del dado (1 día).
- Delta del arranque con `npm run build` y `npm run validate`.
- e2e: ⌘K / Ctrl+K y `/` (y que `/` no se dispara escribiendo en un campo), búsqueda sin acentos y navegación a
  cada tipo de resultado. Pasada de axe.

## 6. Fuera de este plan

- La lupa fuera de las listas (§4.2).
- Aviso fuera del hub (punto en la pestaña Social, refresco en segundo plano de los «me gusta»): 1–2 días si se
  pide más adelante.
- Sincronizar lo visto entre dispositivos.
- «Qué amistades tienen este juego» en el buscador: exige bajar las listas completas de todas tus amistades
  (`useForeignProfileGames`, regla 1) y respetar su visibilidad; 3–5 días aparte.
- Acciones en el buscador («añadir juego», «cambiar tema»): fáciles de añadir sobre B2 si el panel se usa.

## 7. Nota sobre el icono

`sistrix` está en la colección de **marcas** de Font Awesome: es el logotipo de SISTRIX, una empresa de SEO, y Font
Awesome avisa de que las marcas siguen siendo de sus dueños. Como glifo genérico de «buscar», la alternativa sin marca
detrás es `magnifying-glass` (solid, misma licencia), que se ve casi igual. Se usa `sistrix` por decisión del usuario;
cambiarlo más adelante es tocar solo el símbolo del sprite.

