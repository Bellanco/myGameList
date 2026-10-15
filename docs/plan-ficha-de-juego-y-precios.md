# Plan: ficha de juego y precios de IsThereAnyDeal

> **Estado (15-10-2026): plan cerrado y aparcado, nada implementado.** Todas las decisiones de producto están tomadas
> (tablas de decisiones de cada fase); antes de programar solo faltan los datos de «Pendiente para cerrar el plan»,
> al final (la clave y las credenciales de ITAD, el dominio y unas mediciones). Sale de la idea C2 de
> `docs/investigacion-interaccion-social.md`, de una integración con IsThereAnyDeal (ITAD) para la lista de deseos y
> de traer a Deseados la lista de seguimiento de ITAD. Escrito leyendo `develop` tras `8bfd3b2d` y la documentación de
> la API de ITAD (v2.11.0). Diseño de la ficha: `docs/maquetas/ficha-juego.html` (con el servidor de desarrollo).
>
> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.
> Las decisiones de la Fase 0 de cada parte son del usuario y van antes de escribir código.

## Qué es

Tres piezas que se tocan entre sí:

1. **Ficha de juego**: un **modal** que se abre sobre la pantalla en la que estás (`?juego=<clave>` en la URL) con
   tus datos del juego, lo que tus amistades han hecho con él (lista, nota, reseña), la saga y el precio.
   **Sustituye al detalle que hoy se despliega al tocar una fila** (decisión del usuario, 15-10-2026). Hoy un juego
   no tiene vista propia: la fila de la tabla se despliega y el nombre en una reseña es un chip sin acción
   (`ReviewDetailHead.tsx:102-105`).
2. **Precios en Deseados**. Junto a cada juego de la lista de deseos, el mejor precio actual, el descuento, la tienda y
   si está en su mínimo histórico, sacados de ITAD a través de un proxy propio. Al abrir la app, un aviso si algo que
   deseas ha bajado.
3. **Traer tu lista de ITAD a Deseados** (Fase P7). Entras en ITAD y tu lista de seguimiento llega a la misma bandeja
   que usa Playnite, para pasarla a Deseados en bloque. Qué se puede traer depende del rango.

La ficha de un juego que **no tienes** enseña su precio y ofrece «Añadir a deseados», y los juegos traídos de ITAD
aciertan siempre con su precio porque llegan con su id.

## Lo que decide el diseño (comprobado en el código)

| Hecho | Dónde | Qué implica |
|---|---|---|
| No hay id común de juego: el `id` es `max+1` por biblioteca y el cruce es por título | `core/utils/gameTitleKey.ts:3-6, 108` | La clave de la ficha es `gameTitleKey`. ITAD también se consulta por título |
| `GameItem` no guarda ids externos; `/cover` tira el id de la ficha de IGDB y guarda solo el de la carátula | `model/types/game.ts:18-76`, `functions/_lib/igdbCover.ts:625-627` | Nada de esto depende de C1 (`igdbId`). Si C1 llega, ficha y precios aciertan más |
| `useSocialViewModel` solo se monta dentro de `SocialHub` | `view/components/SocialHub.tsx:73` | El modal se abre también desde las listas, fuera del hub: el directorio se lee de la caché |
| Tocar una fila (o una caja del mosaico) despliega el detalle, y en el mosaico ese detalle es un bloque metido en la rejilla virtualizada | `GameTable.tsx:631-643, 1199, 1309` | Sustituirlo por el modal quita la fila `detail` de la virtualización (`VirtualRow`, `DETAIL_ROW_ESTIMATE_PX`) |
| La misma tabla, en solo lectura, pinta las listas de una amistad en su perfil, y allí el detalle enseña **sus** datos | `SocialProfileDetailScreen.tsx:767-781` | Decisión F0.7: qué abre una fila en el perfil de otra persona |
| El detalle lo visten tres skins | `themes/{persona,arcade,cyberpunk}/*.scss` | Al quitarlo, sus reglas se borran o se pasan al modal, que los skins ya visten (`.modal`) |
| Ya hay modales nativos con foco atrapado, Esc y vuelta del foco | `view/modals/useNativeDialog.ts`; la ruleta se monta desde dos sitios | El modal de la ficha sigue ese molde |
| El directorio cacheado se lee sin red y sin Firebase (ya lo hace el buscador) | `viewmodel/search/searchSources.ts:142`, `indexedDbRepository.ts:651` | La ficha puede enseñar amistades **sin cargar Firebase** |
| Nadie descarga los gists de JUEGOS de todas las amistades; cada perfil se baja al abrirlo | `viewmodel/social/useForeignProfileGames.ts:74, 126` | «Quién lo tiene» entero necesita un índice nuevo (Fase F4) |
| La caché `profileCache` guarda el gist ajeno 24 h, con ETag, y se invalida si cambia `gamesGistId` | `indexedDbRepository.ts:486-551`, `foreignProfileRepository.ts:21` | El índice se construye sobre esa caché: no hace falta un almacén nuevo |
| Solo se lee la biblioteca de una amistad (`'friends'`) y se filtra con su visibilidad | `useForeignProfileGames.ts:11-13, 133`; `core/utils/profileVisibility.ts:36` | La ficha no puede enseñar nada que el perfil de esa amistad no enseñe ya |
| Las Functions no usan la Cache API; cachean en KV y con `Cache-Control` | `functions/cover.ts:44, 414-417` | KV tiene 1.000 escrituras al día **para toda la cuenta**: los precios no pueden escribir en KV por usuario |
| Los usuarios sin sesión de Google no tienen ID token; `/cover` está abierto y limitado por IP | `functions/_lib/context.ts:18-52`, `cover.ts:116-138` | Decidido (P0.2): precios solo con espacio social, con `requireUser` y el rango |
| El cliente solo habla con su propio origen salvo GitHub y Firebase; la CSP no incluye ITAD | `public/_headers:2`, `tests/e2e/smoke.test.ts:65-91` | Todo pasa por `/api/precios`. La CSP no cambia |
| Arranque crítico: 187,7 de 190 kB | `docs/investigacion-interaccion-social.md` (§A1) | Modal, proxy y formato de precios, todo en chunks perezosos. Al arranque solo van el helper de la clave y la lectura de `?juego=` |
| No hay formato de moneda en `src/` | solo `APP_LOCALE = 'es-ES'` (`core/constants/locale.ts:10`) | Helper nuevo `core/utils/money.ts` |

---

# Parte 1 · Ficha de juego

## Fase F0 · Decisiones

**Cerradas por el usuario (15-10-2026):**

| # | Decisión |
|---|---|
| F0.1 | **Por encima, no como pantalla** (modal o panel: la forma es F0.11). Se abre sobre la pantalla en la que estás y pone `?juego=<clave>` en la URL. «Atrás» lo cierra, y recargar o compartir la URL lo vuelve a abrir. Sin ruta nueva ni línea en `_redirects`. Funciona sin social: tus datos, la saga y el precio |
| F0.6 | **Sustituye al detalle desplegado de la fila.** Tocar una fila o una caja del mosaico abre la ficha; el doble clic sigue abriendo la edición. Una sola vista por juego, se abra desde donde se abra |
| F0.11 | **Panel lateral** (15-10-2026). Entra por la derecha, **siempre a todo el alto**, y el **ancho se mide para que el espacio en blanco sea siempre el mínimo**: el más estrecho de tres (una columna en 600 px, dos en 880 px, dos en 1.240 px) en el que todo cabe sin scroll. En el móvil, la pantalla entera. **Sin cabecera de modal:** el nombre va junto a la carátula y solo queda la X en la esquina. **Aprovechar el espacio para evitar el scroll:** dos columnas con ancho. **Los botones, fijos en una barra abajo.** Pulsar fuera cierra |
| F0.12 | **La ficha lleva todo lo que llevaba el detalle** (15-10-2026): plataformas y Steam Deck, géneros, años, horas, puntos fuertes y débiles (o motivos), nota o interés, rejugar o reintentar y el análisis, con el mismo marcado y **las mismas reglas por lista**. La nota o el interés suben a la cifras de la cabecera: en completados, nota; en próximos y deseos, interés; en abandonados, solo si se puntuó (`scored`); en curso, nunca (ahí vale 0) |
| F0.14 | **Cabecera con aire y sin títulos obvios** (15-10-2026). En la cabecera, sin chips: tu lista y desde cuándo (`enteredAt`), un resumen de una línea (la primera plataforma, el primer género y, en completados, el último año) y la fila de cifras. Las listas enteras de plataformas y géneros, como chips, en el cuerpo, en dos renglones **sin etiqueta**. Fuera los títulos «Tus datos», «Plataformas» y «Géneros»: se dan por supuestos |
| F0.15 | **El recuadro del precio, completo y repartido en diagonal** (15-10-2026): precio, descuento y precio normal arriba a la izquierda; el sello «Mínimo histórico» arriba a la derecha; dónde y hasta cuándo; los tres mínimos (histórico con su fecha, último año y últimos 3 meses) en una fila; las dos tiendas siguientes más baratas; «Ver en *tienda*» abajo a la izquierda y el crédito de ITAD abajo a la derecha. Ocupa todo el alto de su columna |
| F0.13 | **Las notas, en la escala de quien mira** (15-10-2026). La media de tus amistades sale como cifra («91 · 3 notas») solo con la nota 0–100; con estrellas, en estrellas («★★★★★ · 3 notas»). Las notas de cada amistad y las tuyas, con `ScoreDisplay` (aro o estrellas), como en el resto de la app |
| F0.2 | **La media de notas de tus amistades, con las que haya** (15-10-2026), con cuántas al lado («81 · 3 notas», «92 · 1 nota»), en la escala de quien mira (F0.13) |
| F0.3 | **El buscador ⌘K, al elegir un juego, abre su ficha** (15-10-2026) |
| F0.4 | **«Lo quieren» es relleno** (15-10-2026): sale solo si sobra sitio. Primero se elige el ancho sin esa sección; después se prueba a añadirla y, si así ya no cabe sin scroll, se quita. Nunca ensancha el panel ni provoca scroll. Si el contenido crece después (la letra, una carátula), es lo primero que se va |
| F0.5 | **La saga entra, para todos** (15-10-2026). Sale de `sharedSagaName` (ver «Qué enseña la ficha», 4): tus entregas siempre, también sin social; las de tus amistades, con social y según lo que llegue de ellas (F3 en bronce; el índice F4 desde plata) |
| F0.7 | **Las amistades llevan a su perfil, con el juego abierto** (15-10-2026). Tocar una amistad en la ficha lleva a su perfil con ese juego abierto: sus datos y su reseña. Y en su perfil, tocar un juego de sus listas lo abre ahí, con sus datos |
| F0.8 | **De los estilos del detalle antiguo, solo se borra lo de la fila desplegada** (15-10-2026): el filo de color de Arcade (`.detail-row.open`) y la animación de cierre de Persona (`tr.detail-row.is-leaving`). Lo de las cajas, las etiquetas y los chips (`detail-box`, `detail-label`, `.detail-content .chip` en Persona, Arcade y Cyberpunk) **se queda**: la ficha usa ese mismo marcado y así cada tema la viste igual |
| F0.9 | **Saltar de una ficha a otra no suma pasos a «atrás»** (15-10-2026): se **reemplaza** el `?juego=`, así que «atrás» siempre vuelve a la lista |
| F0.16 | **Nada más de la ficha depende del rango** (15-10-2026): solo el índice de bibliotecas (F4) |
| F0.10 | **La ficha abre siempre, con o sin red.** Lo tuyo (datos, acciones, saga de tu biblioteca) sale siempre. Lo que viene de fuera (amistades, índice, precios, carátulas) es opcional: si no llega, por falta de conexión, un servicio caído o un cupo agotado, **esa sección no se pinta**, sin error ni hueco. Vale para todas las piezas de fuera. Ver «Sin conexión y servicios caídos» |

## Qué enseña la ficha

1. **Cabecera (F0.14):** carátula (`GameCover`, con `refEntradaDeImagen`), nombre, tu lista y desde cuándo, un
   resumen de una línea (primera plataforma, primer género y último año) y las cifras: tu nota o interés, la media de
   tus amistades y cuántas lo tienen. A la derecha, con ancho, el precio si es un deseo y si no la saga.
2. **Tus datos (F0.12), sin título:** todo lo que hoy enseña el detalle de la fila (`GameTable.tsx:1414-1505`), con su
   mismo marcado (`detail-content`, `detail-box`, chips e insignias) y sus mismas reglas por lista:
   - plataformas, con Steam Deck, y géneros, en todas, en dos renglones de chips sin etiqueta;
   - años y rejugar, en completados;
   - horas, en completados y abandonados;
   - puntos fuertes, en c/v/e; débiles, en c/e; motivos, en v;
   - reintentar, en v;
   - el análisis, en su propio bloque (para que las columnas lo puedan repartir), recortado a cuatro renglones, con
     «Ver análisis» a `statsReviewPath`.

   Respeta las mismas columnas ocultas (`visibility`).
   **Acciones, las mismas del detalle:** los movimientos de `TAB_ACTIONS` con sus colores, «Editar», «Compartir» (con
   reseña) y «Borrar». Si no lo tienes: «Añadir a deseados» (`addGameToWishlist`, `useGameListViewModel.ts:775`) y
   «Añadir a próximos».
3. **Tus amistades:** una fila por amistad con avatar, nombre, lista, nota (`StarRating`), mes en que lo terminó
   (`finishedOn`) y adelanto de la reseña, que lleva a su reseña (`activityDetail`). Orden: con reseña primero; dentro,
   por nota. La media va arriba, según F0.2. Debajo, aparte, «Lo quieren».
4. **Saga:** las otras entregas en tu biblioteca y en las de tus amistades. Cada una enlaza a su ficha.
   - **De dónde sale:** `sharedSagaName` (`core/utils/gameSaga.ts`), que ya usan las reseñas relacionadas y las
     estadísticas de Deseados. No hay datos externos ni lista de franquicias: compara los títulos y se queda con el
     prefijo de palabras común cuando nombra de verdad una saga («Hollow Knight» ~ «Hollow Knight: Silksong»,
     «Persona 3» ~ «Persona 5»). Las cifras y las palabras de función no cuentan, y una sola palabra necesita marca
     de serie, para no emparentar «Dead Space» con «Dead Cells».
   - **Lo que se le escapa, a conciencia:** sagas que solo se distinguen por subtítulo («Nier Automata» ~ «Nier
     Replicant») y las de nombre distinto («Dark Souls» ~ «Demon's Souls», «Thronebreaker» ~ «The Witcher»). Las
     arreglaría la franquicia de IGDB (idea C5 de la investigación), fuera de este plan.
   - **Quién la ve:** cada uno, en su ficha y solo sobre lo que puede ver. Tus entregas, siempre, también sin social.
     Las de tus amistades, solo con social y según su visibilidad: con el índice de bibliotecas (F4, desde plata)
     todas; sin él (bronce), solo las que han reseñado o movido de lista en los últimos 30 días. Nadie ve tu saga:
     tus amistades ven tus juegos en sus fichas, con tu visibilidad.
5. **Precio** (Parte 2, Fase P5): solo si no lo tienes en c/v/e/p y los precios están activados.

Sin sesión social se pintan 1, 2, 4 (solo con tu biblioteca) y 5. Sin entrada tuya ni de nadie, un estado vacío
con «Añadir a deseados».

## Diseño (maqueta del 15-10-2026)

`docs/maquetas/ficha-juego.html` con el servidor de desarrollo (`npx vite --port 8001`).
- **Detrás va la tabla real** (`GameTable`) con una biblioteca inventada que reproduce los extremos de una biblioteca
  real (ver «Lo que enseñó una biblioteca real»). Tocar una fila abre la ficha.
- **La URL hace lo que haría la app:** abrir pone `?juego=`, y «atrás», Esc, la X o pulsar fuera lo cierran.
- **La barra de abajo a la derecha** cambia de lista (Completados, Abandonados, En curso, Deseados), la escala de
  la nota (estrellas o 0–100), el precio («sin servicio» lo quita), con o sin social, y el tema y el modo.
- **Piezas reales:** `useNativeDialog`, `.modal`, `GameTable`, el marcado del detalle (`detail-content`,
  `detail-box`, chips e insignias), `HubPersonRow`, `HubAvatar`, `GameCover`, `StarRating` y `ScoreRing`. Lo único
  propio es `ficha-juego.scss`, que sería `src/styles/gameSheet.scss`.

**El panel (F0.11):**
- **Siempre a todo el alto, y el ancho se mide para que el espacio en blanco sea el mínimo.** Se prueba de más
  estrecho a más ancho y se queda en el primero en el que todo cabe sin scroll:

  | Paso | Ancho | Reparto |
  |---|---|---|
  | 0 | 600 px | Una columna |
  | 1 | 880 px | Cabecera en tres columnas y cuerpo en dos |
  | 2 | 1.240 px | Igual, más ancho. Es el tope: si tampoco cabe, el cuerpo hace scroll |

  **Los anchos dejan siempre unos 80 px de la lista a la vista** (`calc(100vw - 5rem)`), por donde se pulsa para
  cerrar. Solo se pasa del paso 0 si el cuerpo tiene más de una sección que repartir.
- **Cómo se mide:** después de `showModal`, sobre el cuerpo (`scrollHeight` frente a `clientHeight`).
  - Se repite cada vez que el contenido cambia de tamaño (`ResizeObserver`): la letra que llega tarde, una carátula,
    las amistades que llegan después. Ese caso **solo ensancha**, así que no puede entrar en bucle.
  - Cambiar el tamaño de la ventana vuelve a empezar por el paso 0.
  - En el móvil no se mide: siempre es la pantalla entera.
  - El panel entra deslizándose desde fuera, así que los cambios de ancho al abrir no llegan a verse.

  El velo es ligero (40 %), para seguir viendo la lista.
- **Móvil (≤ 600 px):** la pantalla entera, también desde la derecha. Se cierra con la X, «atrás» o Esc.
- **Sin cabecera de modal:** el nombre va en la ficha, junto a la carátula. La X queda en la esquina, fuera del
  scroll.
- **Botones anclados abajo, sin barra:**
  - flotan sobre el final del cuerpo, sin fondo ni borde;
  - el cuerpo les reserva justo su alto (`--gs-botones`, medido con un `ResizeObserver`);
  - lo que pasa por detrás al hacer scroll se desvanece con una máscara, igual en todos los temas;
  - mover según la lista, «Editar», «Compartir» con reseña y «Borrar», separado a la derecha;
  - en el móvil y en el panel estrecho solo el primero lleva texto, en una línea.

**La cabecera (F0.14, F0.15):**
- **Columnas:**
  - en el móvil, junto a la carátula solo van el título, tu lista y el resumen; las cifras, debajo a todo el ancho;
  - desde 32 rem, todo junto a la carátula;
  - desde 46 rem, una tercera columna a la derecha: **el precio si es un deseo y, si no, la saga**, que cabe a la
    altura de la carátula (sin eso quedaba vacía). Información y lado se reparten a partes iguales lo que deja la
    carátula: con más ancho, el precio es más bajo y no alarga la cabecera.
- **Sin chips:** el resumen de una línea («Steam · Metroidvania · 2024») y las cifras, con aire. Los chips arriba
  dejaban todo demasiado junto, sobre todo con nombres de 49 caracteres.
- **El precio, repartido en diagonal** y estirado a todo el alto de su columna (F0.15).

**El cuerpo:**
- **En columnas CSS** (`columns: 2` con ancho): tus datos, el análisis, tus amistades, lo quieren y la saga (en
  estrecho; con ancho va arriba). El navegador las equilibra solas.
- **«Lo quieren» es relleno** (F0.4): solo sale si cabe sin scroll y sin ensanchar el panel.
- **Ninguna sección se parte:** partida, la de amistades dejaba una persona suelta y sin título al principio de la
  segunda columna. Si así no cabe, el panel se ensancha.
- **El margen de cada sección va abajo y no arriba:** en columnas, el de arriba se pierde al saltar de columna y las
  dos no empezarían a la misma altura.

**Medido** con 10 juegos (los extremos de la biblioteca real incluidos) en 1000 × 900 (cyberpunk), 1280 × 800 y
1512 × 857. Resultado: **0 px de scroll en los 30 casos**, sin desborde horizontal y sin errores de consola. En
390 × 844 hay scroll donde hay mucho contenido, con los botones fijos. Se borra al implementar F2/F6.

## Lo que enseñó una biblioteca real (`myGames.json`, 302 juegos, 15-10-2026)

Analizada con un script que solo saca recuentos y longitudes; no se copió ninguna reseña.

| Hallazgo | Ejemplo | Qué decidió |
|---|---|---|
| Las plataformas son **tiendas**: 18 distintas, hasta 3 por juego más Steam Deck | Steam, Epic, GOG, Ubisoft Connect, Sega Mega Drive | Plataformas en un renglón de chips propio. D4 (ITAD → `PC`) no encaja: ver P7 |
| Géneros de hasta 26 caracteres, hasta 2 por juego | «Coleccionista de criaturas» | El otro renglón de chips |
| Nombres de hasta 49 caracteres | *Like a Dragon Gaiden: The Man Who Erased His Name* | Título en dos líneas con `text-wrap: balance` y sin chips al lado |
| Hasta 5 puntos fuertes, 3 débiles y 3 motivos; hasta 5 años | *Portal*: 2015 a 2026 | Cajas de `detail-box` que crecen hacia abajo; nada se recorta |
| Horas de 0,3 a 900 | *Football Manager 2018* | Decimales con coma, como el detalle |
| Reseñas de hasta 2.381 caracteres | — | El análisis, recortado a cuatro renglones |
| En curso con nota 0 | *Persona 5 Strikers* | «Tu nota» sigue las reglas del detalle (F0.12): en curso no sale |
| 70 abandonados puntuados (`scored`) | — | En abandonados, la nota solo si `scored` |
| 28 juegos con `score` y sin `grade` | — | Nota de `resolveGrade` (×20) |
| Datos guardados que el detalle de hoy no enseña | 2 abandonados con débiles que duplican sus motivos; 1 en curso con motivos | Se mantienen las mismas reglas: la ficha no enseña más que el detalle |

## Sin conexión y servicios caídos

Decisión del usuario (15-10-2026, F0.10): **la ficha se mantiene; lo que no llega, no se enseña.** Es la regla que ya
sigue la app (memoria `degradacion-servicios`: degradar a lo local sin errores; con copia, no avisar).

### Lo que sale siempre (local)

Cabecera con tu entrada, «Tus datos», las acciones y la saga **dentro de tu biblioteca**. Ninguna de estas piezas
puede depender de la red, de Firebase ni de un chunk que pueda faltar.

### El riesgo del chunk perezoso (comprobado en el código)

- El service worker solo precachea el grafo **estático** del arranque. El plugin `service-worker-precache` de
  `vite.config.ts` deja fuera los `dynamicImports` a propósito.
- Los chunks perezosos se guardan la primera vez que se usan, y la caché se estrena en cada despliegue.
- **Chromium no reintenta un `import()` que falló** hasta recargar (memoria `chromium-cachea-import-fallido`).

Si el modal fuera un chunk perezoso más, sin red y justo después de publicar, **tocar una fila no abriría nada**. Hoy
el detalle va dentro de `GameTable` y siempre funciona, así que sería ir a peor.

**Cómo se evita:**
- **El modal con lo propio va precacheado.** El plugin añade a `precachePaths` el chunk del modal (por su
  `facadeModuleId`) y su CSS, además del grafo estático. Así está disponible sin red desde la instalación del
  service worker, pero **no pesa en el arranque crítico**: solo en el total de `ci-validate`, que mide lo que cuesta
  quedar listo sin red. Es la alternativa a meterlo en el arranque, donde ocupa el sitio del detalle que sale de
  `GameTable`; se elige midiendo las dos (skill `medir`).
- **Lo de fuera va en sus propios chunks, sin precachear:** las amistades (F3/F4) y el precio (P5). Si su `import()`
  falla, la sección no se pinta durante esa sesión. Es lo mismo que si no hubiera datos.

### Cada pieza de fuera, cuando no llega

| Pieza | Sin red, caída o sin cupo | Con copia guardada |
|---|---|---|
| Amistades (F3, directorio cacheado) | Sin sección «Tus amistades», sin «Lo quieren» y sin las cifras de la cabecera | Se enseña la copia, sin aviso |
| Índice de bibliotecas (F4) | La ficha se queda con lo de F3 | `profileCache` caducada, como ya hace `foreignProfileRepository` |
| Cifras «Media» y «Lo tienen» | No se pintan. Nunca «0 amistades» | Calculadas con lo que haya |
| Saga | Solo con tu biblioteca. Con una sola entrega, no sale | Suma lo que haya de tus amistades |
| Carátula | La portada de casa (`GameCover` ya lo hace) | — |
| Precio (P3, P5) | Sin bloque de precio | **No se enseña** (P0.8): solo con conexión y dentro del plazo de su rango |
| Rango (para los límites) | Se usa el último conocido en el dispositivo; sin ninguno, el más bajo. El borde vuelve a comprobarlo | — |
| «Traer de IsThereAnyDeal» (P7) | El botón sigue; al pulsarlo sin red, aviso en una línea | — |

**Mientras carga:** un esqueleto en la sección como mucho unos segundos. Si no ha llegado nada, desaparece sin
dejar hueco. Nunca un esqueleto que se queda para siempre.

**Tests:**
- de componente: cada sección de fuera, con su fuente fallando, no se pinta y lo propio sigue entero;
- e2e contra el build: sin red y con el service worker recién instalado, tocar una fila abre la ficha con lo propio.

Ojo: `setOffline` de Playwright no cambia `navigator.onLine` (memoria `offline-detection-two-signals`). Hay que cortar
las peticiones con `page.route`.

## Fase F1 · Núcleo puro · S

- `core/utils/gameSheetPath.ts`:
  - `gameSheetSlug(name)`: `gameTitleKey(name)` con los espacios cambiados por `-`.
  - `gameSheetSearch(name)`: `?juego=<slug>`, para enlazar desde cualquier pantalla.
  - `matchesGameSheet(slug, name)`.

  Este módulo va en el arranque (lo usan la tabla y el buscador): mantenerlo mínimo y medirlo.
- `core/gameSheet/buildGameSheet.ts`, puro. Recibe tu `TabData`, las entradas de tus amistades ya filtradas por
  visibilidad (`{ friend, tab, item }[]`) y la actividad social cacheada. Devuelve el modelo de la ficha: cabecera
  unida, tu entrada, amistades ordenadas, media (con el umbral de F0.2), «lo quieren» y saga.
- **Tests** (`tests/unit/gameSheet.test.ts`):
  - casos de la clave: *Hades II* y *Hades 2*, sufijos de edición, «The», acentos;
  - una amistad con la lista oculta no aparece;
  - las horas ocultas no salen;
  - la media no sale con menos de 3 notas;
  - la saga no incluye el propio juego.

## Fase F2 · El modal, con lo propio, en lugar del detalle · M–L

- **El panel** (F0.11). `view/components/gameSheet/GameSheetPanel.tsx`, con `<dialog>` nativo y `useNativeDialog`.
  El ancho se mide con un hook propio (`useGameSheetWidth`: los tres pasos, el `ResizeObserver` que solo ensancha y
  el reinicio al cambiar la ventana), con su test de componente. Va lazy
  en `App.tsx`, montado **una vez** para toda la app, como la ruleta, y **precacheado** por el service worker
  (ver «Sin conexión y servicios caídos»): sin eso, sin red tras un despliegue no se abriría. El `<dialog>` se queda montado, como pide el
  hook, para devolver el foco a la fila al cerrar. Mientras carga el chunk la primera vez, la fila no se mueve. El
  chunk se precarga en reposo al entrar en una lista (`requestIdleCallback`).
- **`?juego=` en la URL.** `viewmodel/gameSheet/useGameSheetParam.ts` lee y escribe el parámetro con react-router
  (`useSearchParams` / `navigate` con `state`):
  - abrir hace *push*, para que «atrás» cierre;
  - pasar de una ficha a otra hace *replace* (F0.9);
  - cerrar con la X o Esc hace `navigate(-1)` si la entrada la puso el modal, y quita el parámetro si se llegó con
    la URL ya puesta.

  El parámetro no cambia el `pathname`, así que no dispara la View Transition de cambio de pantalla (memoria
  `view-transition-query-params`). Nada de ruta nueva ni de `_redirects`.
- **`viewmodel/gameSheet/useGameSheetViewModel.ts`:** recibe la biblioteca desde `App.tsx` y llama a
  `buildGameSheet`. Las acciones son las mismas funciones que hoy recibe `GameTable` (`onEdit`, `onDelete`,
  `onMigrate`, compartir). No toca Firebase.
- **`GameTable` deja de desplegar:**
  - tocar la fila o la caja llama a `onOpenGame(id)`;
  - se borran `expandedId`/`onExpandedChange`, la fila `detail` de `VirtualRow`, `DETAIL_ROW_ESTIMATE_PX`, el bloque
    del mosaico (`:631-643`) y el marcado del detalle (`:1414-1555`);
  - el doble clic sigue editando;
  - `readOnly` y `reviewLink` se quedan para el perfil de una amistad (F0.7).
- **Los ayudantes del detalle salen de `GameTable`:** `renderTags`, `yearsDesc` y `renderBooleanBadge`
  (`GameTable.tsx:325-400`) pasan a un módulo compartido (`view/components/gameTags.tsx`) que usan la tabla y la ficha.
- **Estilos:** `styles/gameSheet.scss`, atado al chunk del panel. Se borran las reglas del detalle de `_table.scss`
  y de los skins de Persona, Arcade y Cyberpunk (F0.8).
- **Textos** en `core/constants/gameSheetLabels.ts`. Los del detalle que ya no se usen salen de `UI_MESSAGES.detail`.
- **Tests:**
  - reescribir `tests/component/GameTableColumns.test.tsx`, que hoy despliega el detalle;
  - test de componente del modal: abre, cierra con Esc y devuelve el foco a la fila;
  - test del hook del parámetro: *push* al abrir, *replace* entre fichas, quitar al cerrar.
- **Verificar:**
  - 360/768/1024/1440 px y los 8 temas × claro/oscuro (skill `verificar-en-navegador`);
  - con **120+ juegos**, para que la tabla virtualice;
  - en renglones y en mosaico.

## Fase F3 · Amistades desde el canal social (coste 0) · S

- Leer el directorio cacheado (`peekCachedSocialDirectory`) solo si hay perfil social en este dispositivo
  (`useSocialProfileStatus`). Nunca cargar Firebase por abrir la ficha (memoria `enlace-publico-sin-firebase`).
- De ahí salen, sin red:
  - las **reseñas** de tus amistades sobre el juego (`activity`: nota y adelanto de 160 caracteres);
  - los **avisos de lista** de los últimos 30 días (`moves`).
- Esto ya llena la sección de amistades en la mayoría de los casos: quien reseñó o movió el juego hace poco.
- **Comprobar en F3, antes de pintar:**
  - si cada entrada del directorio cacheado trae la visibilidad de la amistad (`hiddenTabs`…);
  - si trae el estado `'friends'`.

  Si no lo trae, la ficha aplica `LOCKED_VISIBILITY`, como `useForeignProfileGames`, y solo enseña lo que ya está
  en el canal social, que ya es público entre amistades.

## Fase F4 · Índice de las bibliotecas de tus amistades · M

Para que «quién lo tiene» incluya también a quien lo tiene sin reseñar ni haberlo movido hace poco.

- `viewmodel/gameSheet/useFriendLibraryIndex.ts` recorre las amistades activas (no `socialSkipped`) que tienen
  `gamesGistId`:
  - las lee con `foreignProfileRepository`, de 3 en 3, con el token de `getSocialSyncConfig()`;
  - les aplica `applyProfileVisibility`;
  - construye en memoria `slug → [{ friend, tab, item }]`.
- **Cuándo:** al abrir la primera ficha de la sesión, en segundo plano. Mientras tanto, se pinta lo de F3, y lo
  demás va entrando con fundido.
- **Coste:**
  - **GitHub:** una lectura por amistad en cada refresco, con el plazo del rango: plata 24 h, oro 12 h y mithril
    30 min. Bronce no tiene índice: su ficha se queda con lo de F3. Las lecturas son condicionales (ETag), así que
    casi siempre vuelve un 304. `foreignProfileRepository` ya pregunta siempre con `If-None-Match` cuando hay token,
    de modo que un plazo más corto que las 24 h de `profileCache` no obliga a cambiar la caché: el índice decide
    cuándo volver a preguntar. Mithril con 100 amistades: unas 200 peticiones por hora, frente a las 5.000 del token.
  - **Firestore, KV y Functions:** 0.
- **Sin almacén nuevo:** el índice se deriva de `profileCache`, que ya persiste los gists.
- **Regla 1 intacta:** solo amistades. Lo vigila un test que pase un perfil `'none'` y compruebe que no se lee.
- **Sin red:** la caché caducada vale (como en `foreignProfileRepository`). Si falta, la sección dice que faltan
  datos y no da un error.

## Fase F5 · Puntos de entrada · S

Todos abren el mismo modal sobre la pantalla en la que estás, poniendo `?juego=<clave>`.

| Desde | Cambio |
|---|---|
| Fila o caja de tus listas (`GameTable`) | Abre la ficha **en lugar del detalle** (F0.6, hecho en F2) |
| Fila de las listas de una amistad (`SocialProfileDetailScreen.tsx:767`) | Abre la ficha con el bloque de esa persona arriba (F0.7) |
| `ReviewDetailHead.tsx:102-105` | El chip del nombre pasa a ser un botón que abre la ficha |
| Feed (`FeedMoveCard.tsx:74` y tarjetas de reseña) | El nombre del juego abre la ficha si no hay reseña. Si la hay, se mantiene la reseña |
| Buscador (`searchSources.ts:22`) | Según F0.3 |
| Saga, dentro de la ficha | Cada entrega, a su ficha (*replace*, F0.9) |

## Fase F6 · Maqueta, accesibilidad y e2e · S

- Añadir la ficha a `docs/maquetas/social.tsx` (`PANTALLAS`, `:828-876`) y a `TODAS` de
  `scripts/capturar-maqueta-social.mjs:31-37`, en tres variantes: sin social, con amistades, con precio. Además, la
  ficha abierta desde el perfil de una amistad (F0.7). Después se borra `docs/maquetas/ficha-juego.*`.
- e2e, contra el build:
  - tocar una fila abre el modal, y «atrás» lo cierra **sin mover el scroll de la lista** (con 120+ juegos);
  - recargar con `?juego=<slug>` lo abre (chunk perezoso en frío);
  - Esc cierra y el foco vuelve a la fila;
  - en el mosaico, igual;
  - **sin red** y con el service worker recién instalado, la ficha abre con lo propio y sin las secciones de fuera;
  - el modal entra en el barrido de axe de `tests/e2e/a11y.test.ts`.
- Medir que el arranque crítico no sube más que `gameSheetPath` y la lectura de `?juego=` (skill `medir`). Quitar
  el detalle de `GameTable` debería **bajarlo**: medirlo también.

---

# Parte 2 · Precios de IsThereAnyDeal

## La API (leída en docs.isthereanydeal.com el 15-10-2026)

| Lo que se usa | Endpoint | Notas |
|---|---|---|
| Título → id de ITAD | `POST /lookup/id/title/v1` (array de títulos) | Devuelve el id o `null` por título |
| Precios y mínimos (**el que se usa**, F0.15) | `POST /games/prices/v3?country=ES` (1–200 ids) | Clave de API. Por juego: las ofertas de cada tienda (precio, normal, `cut`, `expiry`, `url`) y `historyLow` (`all`, `y1`, `m3`). Da todo lo que pinta el recuadro |
| Resumen más ligero (descartado) | `POST /games/overview/v2?country=ES` | Solo el mejor precio y el mínimo histórico: no alcanza para «hasta cuándo», los otros mínimos ni las otras tiendas |
| Elegir otro emparejamiento | `GET /games/search/v1?title=` | Solo para la Fase P6 |

**Condiciones de uso que afectan al diseño:**
- **Límite:** 1.000 peticiones cada 5 minutos por clave; a partir de ahí, `429` con `Retry-After`. «Attempts to work
  around the limits will cause ban».
- **Datos:** no se pueden alterar, ni los precios ni las etiquetas de afiliado. Las `url` van tal cual.
- **Mención:** «SHOULD provide a link to IsThereAnyDeal.com». Se pone un enlace y una línea en `CREDITS`.
- **Otras:** no dar a entender que hay relación con ITAD, y no competir con ITAD. Mis Listas no es un comparador:
  el precio es un añadido de Deseados.
- **Uso comercial:** permitido si la app es pública.
- **Clave:** se obtiene registrando la app en `isthereanydeal.com/apps/my/`.

## Fase P0 · Decisiones y preparación

**Cerradas por el usuario (15-10-2026):**

| # | Decisión |
|---|---|
| P0.1 | **Un solo interruptor, «IsThereAnyDeal», en Ajustes, apagado por defecto.** Enciende toda la integración: los precios (P2–P5) y el botón «Traer de IsThereAnyDeal» (P7). Apagado, no se pide nada a ITAD. Es el precedente de las carátulas, que permitió no subir `LEGAL_VERSION` con IGDB (`5c58166a`) |
| P0.2 | **Solo con espacio social.** Sin social, el interruptor no aparece. Así el borde siempre sabe quién pide (`requireUser`) y aplica su rango; no hace falta limitar por IP |
| P0.8 | **Si el servicio no está, el precio no se muestra** (15-10-2026). Sin conexión, con ITAD caído o sin cupo, el bloque no sale, aunque haya un precio guardado. Con conexión y dentro del plazo de su rango, el guardado vale: es el funcionamiento normal, y no se pregunta a ITAD |
| P0.3 | **España y euros, fijos** (15-10-2026). La preferencia de región, más adelante (P8) |
| P0.4 | **La preferencia se sincroniza entre dispositivos** (15-10-2026): campo nuevo en `FirestorePublicConfig` y en el `hasOnly` de `publicConfig` en `firestore.rules`, con su despliegue de reglas y `npm run test:rules`, como `covers` |
| P0.5 | **Aviso de bajada: desde plata, con casilla propia y llevando a la ficha** (15-10-2026). Solo avisa de tres cosas: **un mínimo histórico nuevo, un descuento de al menos el 75 % o que el juego entre en un bundle**. La cápsula y la campana abren la ficha del juego. Bajo el interruptor «IsThereAnyDeal», una casilla «Avisarme cuando baje» que solo ven plata, oro y mithril. Sin la casilla marcada, no hay aviso ni refresco en segundo plano |
| P0.6 | **Las tiendas, elegibles desde administración** (15-10-2026). En `/admin`, la lista de tiendas de ITAD (`/service/shops/v1`) con una casilla cada una; por defecto, todas. Se guarda en KV, como el aviso del administrador (memoria `avisos-admin-decisiones`), y `/api/precios` la pasa a ITAD como `shops=`. Una escritura de KV por cambio; leerla, una lectura por petición, de las 100.000 diarias |
| P0.9 | **La casilla «Avisarme cuando baje» viene apagada** (15-10-2026), como el interruptor de ITAD |
| P0.10 | **El aviso de bundle se queda** (comprobado en la especificación de ITAD, 15-10-2026). `/games/prices/v3` no trae bundles, pero `POST /games/overview/v2` devuelve los **bundles activos que contienen alguno de los juegos consultados**, y en cada uno, por tramos (`tiers[].games[]`), los juegos con su id: así se sabe cuál de tus deseos está en cuál. Cuesta **una llamada más por refresco** (hasta 200 juegos a la vez), solo para quien tiene la casilla de aviso marcada (desde plata), y pasa por la misma caché del borde |
| P0.7 | **Precios para todos los rangos, desde bronce. El refresco depende del rango:** bronce 18 h, plata 12 h, oro 6 h y mithril 15 min. Ver «Límites por rango» |

**Preparación (la hace el usuario):** registrar la app en ITAD, guardar la clave como secreto de Pages
(`npx wrangler pages secret put ITAD_API_KEY`) y en `.dev.vars` (con la entrada comentada en `.dev.vars.example`).

**Medir antes de construir:**
- **Acierto por título.** Pasar por `/lookup/id/title/v1` los nombres reales de unas listas de deseos (los del
  usuario y los de la maqueta) y contar aciertos, `null` y emparejamientos equivocados. Si los equivocados pasan
  del ~5 %, P6 sube de prioridad.
- **Cache API en el dominio desplegado.** Comprobar que `caches.default` guarda y devuelve en las Pages Functions
  del dominio real: en `*.workers.dev` es una no-operación, y en este repo nadie la usa todavía. Si no funciona,
  P1 cachea solo en el cliente y los plazos de refresco por rango pasan a ser lo único que protege la clave.

## Fase P1 · Proxy `/api/precios` · M

- `functions/_lib/itad.ts`, puro salvo el `fetch`:
  - `buscarIds(titulos)`;
  - `leerPrecios(ids, pais)` contra `/games/prices/v3`;
  - `leerBundles(ids, pais)` contra `/games/overview/v2`, solo si quien pide tiene el aviso activado (P0.10): de su
    respuesta solo se usa `bundles[]`, cruzado con los ids de `tiers[].games[]`;
  - normalizar la respuesta a `{ titulo, itadId, mejor: { tienda, precio, normal, descuento, hasta, url },
    otras: [{ tienda, precio, descuento, url }] (las dos siguientes más baratas), minimos: { historico: { precio, fecha },
    anio, tresMeses }, urlFicha }` (F0.15).
- **Timeout** de 5 s (`AbortSignal.timeout`, como `serviceAccount.ts:28`). Un reintento con espera ante `429`/`5xx`,
  respetando `Retry-After`.
- `functions/api/precios.ts`, `POST`, con `requireUser` (P0.2):
  - lee el rango del perfil, como la cuota de compartir (`functions/_lib/quota.ts`): una lectura de Firestore por
    petición;
  - **Entrada:** `{ titulos: string[] }`, ≤ 100 (el tope de Deseados, `WISHLIST_MAX_GAMES`), cada uno ≤ `MAX_NOMBRE`.
  - **Salida:** `{ juegos: Record<titulo, Precio | null> }`.
  - Sin datos personales en la petición a ITAD: solo títulos, y salen desde el borde, así que ITAD no ve la IP de
    quien pide.
- **Caché en el borde, sin KV** (P0, sujeto a la medición), con un valor por juego:
  - título normalizado → id de ITAD: 30 días; un `null`, 7 días (como el `MISS_TTL` de las carátulas);
  - id → precio, **con la hora a la que se pidió**. Cada petición acepta lo cacheado si es más reciente que el plazo
    de su rango (P0.7): para bronce vale un precio de hace 15 h y para mithril no, y ese caso sí se vuelve a pedir.

  Dos usuarios que desean el mismo juego comparten la consulta. Cada petición del cliente cuesta como mucho
  2 llamadas a ITAD, y solo por lo que no esté en caché o esté más viejo que su plazo.
- **Límites por usuario, no por IP:**
  - el plazo de su rango: si pide antes de tiempo, el borde contesta con lo cacheado sin preguntar a ITAD;
  - un tope de peticiones por usuario y hora, en memoria del aislado, por si un cliente se porta mal;
  - un tope global por minuto en memoria del aislado, muy por debajo de 1.000 cada 5 minutos. No es global de
    verdad (Cloudflare reparte entre aislados), así que lo que de verdad protege la clave son la caché y los plazos.

  Al pasarse, `429` con `Retry-After`, y el cliente se queda con lo que tiene.
- **Errores:**
  - sin `ITAD_API_KEY`: `501`, como `igdb-search.ts:24-27`;
  - ITAD caído: `503` vía `_middleware.ts`.
- **Gemelo de desarrollo:** `localPreciosApi` en `vite.config.ts`, junto a `localCoverApi` (`:397`), con la clave de
  `.dev.vars`. Sin cupos.
- **Tests** (`tests/unit/preciosEndpoint.test.ts`, por el molde de `coverEndpoint.test.ts`):
  - validación de la entrada;
  - normalización;
  - la caché se reutiliza;
  - el `429` de ITAD llega al cliente como `429`/`503` sin romper;
  - nada de la respuesta altera la `url` ni el precio.

## Fase P2 · Cliente: repositorio, caché y preferencia · S

- `model/repository/pricesRepository.ts`:
  - `fetchWishlistPrices(titulos)` contra `/api/precios`;
  - caché local en un almacén nuevo `priceCache` de IndexedDB (`DB_VERSION` 5 → 6, con un bloque en
    `ensureStores`, `idbConnectionRepository.ts:32-83`), con el plazo del rango por juego (P0.7).

  Abrir Deseados pide solo lo caducado o lo que no tiene precio.
- Se guarda también el último precio visto de cada juego, para detectar bajadas (P4).
- `itadPreference` con `createPreferenceStore`, sin `cloudField` (P0.4), y la clave en `storageKeys.ts`. Apagada por
  defecto (P0.1).
- `core/utils/money.ts`: `formatPrice(amount, currency)` con `Intl.NumberFormat(APP_LOCALE, { style: 'currency' })`.
- **El interruptor «IsThereAnyDeal»** va en Ajustes › Integración (`SettingsHub`), junto a la importación de
  Playnite: es una integración, no una opción de diseño. Debajo, cuando está encendido, sale «Traer de
  IsThereAnyDeal» (P7.2, si el rango lo permite).
  - Solo aparece con espacio social (P0.2).
  - Si la lista de deseos está oculta, los precios no se piden aunque esté encendido.

## Fase P3 · Precios en Deseados · M

- **Tabla (`GameTable`, solo en la pestaña `d` con el interruptor encendido):**
  - en escritorio, una columna «Precio» tras «Interés», con «11,99 € · −60 %» y una marca «Mínimo» si el precio
    iguala el histórico;
  - en la tarjeta de móvil, la misma línea bajo el nombre.
- **En la ficha** (que sustituye al detalle de la fila, F0.6), el recuadro completo de F0.15. Las `url` de ITAD, tal
  cual y con `rel="noopener"`.
- **Emparejamiento visible:** si el título de ITAD no coincide con el tuyo (comparado con `gameTitleKey`), se muestra
  «Precio de: *título de ITAD*», para que un emparejamiento equivocado se vea.
- **Sin precio:** sin red, sin emparejamiento o con el `429`, la celda se queda vacía. No sale «—» ni un error
  (memoria `degradacion-servicios`).
- **Orden y filtro:** ordenar por precio y por descuento, y un filtro «Solo en oferta». Es opcional; se puede dejar
  para una segunda pasada.
- **Atribución:** una línea discreta al pie de Deseados, «Precios de IsThereAnyDeal», con enlace. También en `CREDITS`.
- **Carga:** todo el código de precios en un chunk que solo se pide con el interruptor encendido y Deseados abierto.

## Fase P4 · Aviso de bajada · S (decidido en P0.5)

- Al refrescar los precios, comparar con el último visto: hay aviso con un **mínimo histórico nuevo** o una bajada
  ≥ 50 % (P0.5).
- Cápsula del carril (armazón de `useLaneToast`), por ejemplo «*Hollow Knight* está en su mínimo: 7,49 €», y una
  entrada en la campana, que solo enseña lo nuevo (memoria `notificaciones-y-buscador-decisiones`).
- **Un solo aviso por juego y bajada:** no se repite mientras el precio no vuelva a subir.
- Los precios solo se refrescan al abrir Deseados. Para que el aviso salga sin entrar allí: un refresco silencioso
  en segundo plano, como mucho una vez cada 12 h, solo con el interruptor encendido y en reposo
  (`requestIdleCallback`).

## Fase P5 · Precio en la ficha · S (depende de F2 y P2)

- Si el juego no está en tus listas c/v/e/p, la ficha pide su precio (un título, normalmente ya en caché) y lo
  enseña con «Añadir a deseados».
- Si ya lo tienes, no se pide nada.

## Fase P6 · Corregir el emparejamiento · S–M (según lo medido en P0)

- En el detalle: «¿No es este juego?» abre una búsqueda (`/games/search/v1` por el proxy) con 5 candidatos.
- El elegido se guarda **en local** (`priceCache`, `título → itadId`) y no va al gist.
- Si se quiere que viaje entre dispositivos, es un campo aditivo de `GameItem` (decisión aparte, como el `igdbId`
  de C1).

## Fase P7 · Traer tu lista de seguimiento de ITAD a Deseados · M

**Para qué.** Quien ya tiene una *Waitlist* en IsThereAnyDeal la trae a Mis Listas sin volver a escribir cada juego.
Decisión del usuario (15-10-2026): **la dirección es ITAD → Deseados.** Lo contrario (que tus deseos de aquí lleguen a
ITAD) no entra en esta fase.

### Lo que dice la API (leído en la especificación OpenAPI de docs.isthereanydeal.com, 15-10-2026)

| Tema | Hecho | Fuente |
|---|---|---|
| Flujo | OAuth 2, *authorization code* + PKCE. Autorizar en `https://isthereanydeal.com/oauth/authorize/`; el token se pide en `https://isthereanydeal.com/oauth/token/` | `securitySchemes.OAuth2` |
| Scope necesario | Solo **`wait_read`** (más `user_info` si se quiere enseñar con qué cuenta se ha conectado) | ídem |
| Leer la lista | `GET /waitlist/games/v1` → `[{ id (UUID), slug, title, type: game\|dlc\|package\|null, assets.boxart…, mature, added (fecha o null) }]` | `paths` |
| Secreto del cliente | La documentación no lo menciona. La extensión oficial (Augmented Steam) canjea el código **sin secreto** | `AugmentedSteam/.../Authorization.ts` |
| Duración del token | No está documentada. **Aquí no importa:** el token se usa una vez y se descarta | — |
| CORS (probado desde Chromium) | `/oauth/token/` no lo permite y la API no acepta `Authorization` desde el navegador | prueba del 15-10-2026 |
| Cuenta | El usuario necesita cuenta de ITAD (con Steam o con correo; no hay acceso con Google) | isthereanydeal.com |

**Conclusión:** el canje del código y la lectura de la lista van por una Function propia. Como solo se lee una vez,
**el token no se guarda en ningún sitio**: ni en el dispositivo, ni en Firestore, ni en el borde.

### Lo que decide el diseño (comprobado en el código)

- **Dar de alta en Deseados se anuncia siempre en el feed.** Las demás altas no; esta sí («añadió … a su lista de
  deseos»: `core/social/moveActivity.ts:259-262`), y la fecha es el sello `enteredAt.d`. Importar 60 juegos con la
  fecha de hoy serían 60 avisos para tus amistades. Ver P7·D2.
- **La bandeja de importados ya hace casi todo:** deduplica por nombre, marca lo que ya está en tus listas
  (`existsInLists`), funde orígenes y caduca a los 30 días (`core/import/staging.ts`). Pero se diseñó para
  Playnite: clasifica de uno en uno abriendo el formulario, y **no** clasifica en Deseados (`plan-lista-deseos.md`).
- **Deseados tiene un tope de 100** (`WISHLIST_MAX_GAMES`).
- `ImportSource` (`model/types/import.ts:10`) no tiene `'itad'`: sería un valor nuevo, aditivo.

### P7 · Decisiones

**Cerradas por el usuario (15-10-2026):**

| # | Decisión |
|---|---|
| D1 | **Por dónde entra: la misma pantalla que Playnite**, la bandeja de importados (`InboxScreen`), con origen `itad` y una acción en bloque nueva, «Añadir a Deseados (n)». Es una excepción a «la bandeja no clasifica en Deseados» que solo vale para orígenes que son deseos |
| D8 | **Depende del rango:** (a) si se puede importar o no, (b) si se pueden importar DLC y paquetes y (c) el tope de juegos |
| D9 | **Solo con espacio social.** Sin social, el botón «Traer de IsThereAnyDeal» no aparece, como `/elegir` |
| D2 | **Cada juego entra con la fecha en que se apuntó en ITAD** (`added` → `enteredAt.d`): lo apuntado allí hace más de 30 días no se anuncia en el feed; lo reciente sí. Sin `added`, hoy menos 31 días. `_ts` es el de ahora |
| D4 | **Plataforma: la tienda del mejor precio en ITAD, si se conoce; si no, vacía,** para elegirla en la bandeja. Las bibliotecas reales usan tiendas (Steam, Epic, GOG…), no «PC» |
| D5 | **Si no caben todos, entran primero los apuntados más recientemente** (`added`) |
| D6 | **Volver a importar, a mano, con el mismo botón.** Es idempotente. Lo borrado en ITAD no se borra aquí |
| D7 | **El id de ITAD, solo en el dispositivo** (`gameTitleKey → UUID` en la caché de precios), para acertar con el precio. No va al gist |
| D11 | **Las cifras por rango y que el tope limite solo cada importación** (ver «Límites por rango»): bronce no importa; plata, 50 sin DLC y una vez al día; oro, 100 con DLC y tres veces al día; mithril, 100 con DLC y sin tope. Deseados sigue en 100 para todos |
| D12 | **El panel de administración enseña el límite de importación** de cada usuario, en su ficha, como ya hace con los enlaces compartidos |
| D10 | **El tope no se explica.** Si el rango deja pasar menos juegos de los que hay, se marcan los que caben y el resto queda desmarcado en la bandeja, sin texto que lo explique. Tampoco se nombra el rango en ningún sitio (memoria `rangos-ocultos-al-usuario`). Si el rango no permite importar, el botón no aparece |

**Cómo encaja con lo que ya hay:**
- Los límites por rango van en `core/constants/tiers.ts`, como `PROFILE_TIER_SHARE_MAX_ACTIVE`. Por ejemplo,
  `PROFILE_TIER_ITAD_IMPORT: Record<ProfileTier, { enabled: boolean; dlc: boolean; max: number }>`, con un
  `resolveItadImport(tier)` puro y sus tests.
- **Se hace cumplir en el borde, no solo en la interfaz.** Como hay sesión de Google (D9), `/api/itad/token` usa
  `requireUser` y lee el rango del perfil, como lo hace la cuota de compartir (`functions/_lib/quota.ts`). Recorta
  la lista: con `enabled: false` responde `403`, quita DLC y paquetes si no tocan y corta a `max`. Cuesta una
  lectura de Firestore por importación.
- El cliente usa la misma tabla solo para enseñar u ocultar el botón y para marcar las casillas.
- En el panel de administración, la ficha de un usuario ya enseña sus límites por rango. Añadir allí este, si se
  quiere, sería un renglón más.

### P7.0 · Prueba de concepto (½ día)

- Registrar la app en `isthereanydeal.com/apps/my/` con `wait_read` (y `user_info`). Redirección:
  `https://<dominio>/itad/vuelta`, y la de localhost si ITAD la acepta.
- Completar el flujo a mano una vez y anotar aquí:
  - si el canje necesita secreto;
  - qué devuelve `GET /waitlist/games/v1` con una lista real: el tamaño, si viene `added` y qué `type`s aparecen;
  - si ITAD recuerda el consentimiento, de modo que la segunda importación no vuelva a preguntar.
- No hace falta la clave de API de los precios: la lectura solo usa OAuth. **P7 no depende de P1–P3** y puede ir
  antes.

### P7.1 · El borde · S

- `functions/api/itad/token.ts`, `POST { code, verifier, redirectUri }`, con `requireUser` (D9) y el rango leído
  del perfil (D8):
  - canjea en `oauth/token/` y llama en el acto a `GET /waitlist/games/v1`;
  - devuelve **solo la lista** normalizada (`{ id, title, type, added }`), así que el token no llega a salir de la
    Function;
  - si hace falta secreto, es un secreto de Pages (`ITAD_CLIENT_SECRET`), como el de `github-oauth.ts`.
- Errores:
  - sin configuración: `501`;
  - ITAD caído: `503`;
  - código caducado o usado: `400`, con un mensaje para volver a intentarlo.
- Limitada por usuario, como `/api/precios`, y por las importaciones al día de su rango. Sin KV.
- Gemelo de desarrollo en `vite.config.ts`, como `localGithubOAuthApi`.
- **Tests:**
  - el token no aparece en la respuesta ni en ningún `console`;
  - normalización;
  - el `400` del canje.

### P7.2 · Conectar y volver · S

- Ajustes › Integración (`SettingsHub`), junto a la importación de Playnite, con el botón «Traer de IsThereAnyDeal».
  Solo aparece con espacio social (D9), con el interruptor «IsThereAnyDeal» encendido (P0.1) y si el rango lo
  permite (D8a).
- El cliente:
  - genera el `verifier` de PKCE y el `state`, y los guarda en `sessionStorage` solo hasta la vuelta;
  - lleva a `oauth/authorize?scope=wait_read…`.
- La ruta `/itad/vuelta` necesita su línea en `public/_redirects` y el test de `redirectsRoutes`. Al volver:
  - comprueba el `state`;
  - llama a `/api/itad/token`;
  - mete la lista en la bandeja (P7.3);
  - lleva a la bandeja.

  Si se cancela o falla, vuelve a Ajustes con un aviso en una línea.

### P7.3 · Bandeja y alta en bloque · M

- La lista llega ya recortada por el borde según el rango (D8). El cliente no vuelve a decidir nada.
- `core/import/itad.ts` (puro): convierte una entrada de ITAD en `RawExternalGame` con `source: 'itad'`,
  `externalIds.itad = id`, `platforms: ['PC']` (D4) y la fecha `added`. Después, `staging.ts` hace lo de siempre.
- En la bandeja:
  - un grupo «De tu lista de IsThereAnyDeal», con una casilla por juego y la carátula;
  - la marca «DLC» donde toque, solo si el rango deja importarlos (D8b);
  - las secciones de siempre para lo que ya tienes;
  - la acción «Añadir a Deseados (n)». Si no cabe todo, se marcan los que caben y el resto queda desmarcado, sin
    explicación (D10).
- El alta en bloque es una función nueva del view-model, `addGamesToWishlist(games)`, que hace **una sola**
  actualización del estado. Si se llamara n veces a `addGameToWishlist`, saldrían n avisos y n escrituras de
  persistencia. Fija `enteredAt.d` y `listedAt` desde `added` (D2).
- Un aviso al terminar: «Añadidos 37 juegos a Deseados · 5 ya estaban en tus listas».
- **Tests:**
  - conversión;
  - deduplicado contra Deseados y contra c/v/e/p;
  - tope de 100 y tope por rango;
  - en el borde: `403` sin permiso, sin DLC cuando no tocan y lista cortada a `max`;
  - un juego con `added` de hace 40 días no genera aviso de lista (con `buildMoveActivity` o como se llame su
    proyección) y uno de hace 2 días sí.

### P7 · Texto legal

Solo hay que añadir una frase en `legalContent.ts`, junto a IGDB:

> «Si importas tu lista de seguimiento de IsThereAnyDeal, inicias sesión en su web y autorizas una única lectura:
> nuestro servidor la recibe, la deja en tu bandeja de importados y no conserva ningún acceso a tu cuenta.»

No se guarda ningún token y la acción es a mano, así que, con el precedente de IGDB, **no se sube `LEGAL_VERSION`**.

### P7 · Lo que NO se hace

- **Sincronización continua en ninguna dirección.** Exigiría guardar un token de duración desconocida y decidir qué
  lista manda.
- **Enviar tus deseos a ITAD** para que te avise por correo. Si se quiere más adelante, la vía estudiada es
  `PUT /profiles/sync/waitlist/v1` (scope `profiles`; ITAD empareja por título). Pero pide un `shop` numérico sin
  documentar y un token vivo en cada envío. Las notas de la investigación del 15-10-2026 están en la conversación.

## Fase P8 · Más adelante

- **Región y moneda** como preferencia (P0.3).
- **Precios por Steam appid** en lugar de por título (`/lookup/id/shop/{shopId}/v1`), si algún día el appid de
  Playnite se conserva al clasificar (hoy no: decisión 5 de `plan-importacion-bibliotecas.md`).

---

## Límites por rango

Ningún límite se explica en pantalla ni nombra el rango (memoria `rangos-ocultos-al-usuario`): o se nota sin decirlo,
como un refresco más espaciado, o la opción no aparece. Van en `core/constants/tiers.ts`, como las escaleras que ya
hay (`PROFILE_TIER_SHARE_MAX_ACTIVE`, `PROFILE_TIER_FEED_TTL_MS`).

**Dónde se aplican:**
- **En el borde, siempre:** lo que gasta algo compartido. Precios e importación gastan de la clave de ITAD, que es
  una sola para toda la app (1.000 peticiones cada 5 min).
- **Solo en el cliente:** lo que gasta del propio usuario. El índice de amistades gasta de su token de GitHub; si
  alguien se lo salta, solo se perjudica a sí mismo.

| Capacidad | Sin social | Bronce | Plata | Oro | Mithril | Estado |
|---|---|---|---|---|---|---|
| Ficha: tus datos, saga y precio | Sí (sin precio) | Sí | Sí | Sí | Sí | Propuesta |
| Ficha: reseñas y avisos de tus amistades (F3) | — | Sí | Sí | Sí | Sí | Propuesta |
| Ficha: índice completo de sus bibliotecas (F4), cada | — | **No** | **24 h** | **12 h** | **30 min** | **Decidido** (15-10-2026) |
| Interruptor «IsThereAnyDeal» | **No aparece** | Sí | Sí | Sí | Sí | **Decidido** (P0.1, P0.2) |
| Precios: refresco cada | — | **18 h** | **12 h** | **6 h** | **15 min** | **Decidido** (P0.7) |
| Precios: aviso de bajada al abrir (P4), con su casilla | — | No | Sí | Sí | Sí | **Decidido** (P0.5) |
| Precios: otras tiendas y mínimos de 1 año y 3 meses en el recuadro | — | Sí | Sí | Sí | Sí | **Decidido:** para todos los que tienen precios (F0.15) |
| Importar de ITAD | **No** | **No** | Sí | Sí | Sí | **Decidido** (D8) |
| Importar: DLC y paquetes | — | — | No | Sí | Sí | **Decidido** (D8b) |
| Importar: juegos por importación | — | — | 50 | 100 | 100 | **Decidido** (D8c). El tope de Deseados sigue en 100 para todos |
| Importar: importaciones al día | — | — | 1 | 3 | Sin tope | **Decidido** |

Con mithril a 15 minutos, la caché del borde no puede tener un plazo fijo más largo: por eso guarda la hora de
cada precio y es cada petición la que decide si le vale (P1).

## Texto legal

- **Ficha:** nada nuevo. Enseña lo que el perfil de cada amistad ya enseña, con la misma visibilidad.
- **Precios:** si es opcional y viene apagado (P0.1), el precedente de IGDB y TMDB es **no** subir `LEGAL_VERSION`.
  Sí hay que añadir a `legalContent.ts`, junto a IGDB (`:170-174, 283-294`):

  > «Si activas los precios, nuestro servidor envía a IsThereAnyDeal los nombres de los juegos de tu lista de
  > deseos. IsThereAnyDeal no recibe tu IP ni ningún dato de tu cuenta.»

  Más la línea de `CREDITS`. Lo de P7 (traer la lista de ITAD) tiene su propio apartado legal.

## Costes

| | Ficha | Precios |
|---|---|---|
| Firestore | 0 | 1 lectura por petición (el rango). Como mucho, dos al día por usuario de bronce; mithril, hasta 96 |
| KV | 0 | 0 |
| Functions | 0 | 1 petición por refresco de Deseados, según el plazo del rango |
| GitHub | ≤ 1 lectura por amistad y día (casi siempre 304) | 0 |
| ITAD | — | ≤ 2 llamadas por petición, solo por lo no cacheado |
| Arranque crítico | `gameSheetPath` + `?juego=` (a medir), menos el detalle que sale de `GameTable` | 0 |

## Orden propuesto

| Paso | Fases | Por qué |
|---|---|---|
| 1 | F0, P0 (decisiones, clave de ITAD, las dos mediciones) | Sin la clave y el acierto por título no se sabe cuánto vale P6 |
| 2 | F1, F2, F3 | Ficha útil con coste cero |
| 3 | P1, P2, P3 | Precios en Deseados |
| 4 | F4, F5, F6 | Ficha completa y con sus entradas |
| 5 | P4, P5 | Aviso y cruce ficha ↔ precio |
| 6 | P6 | Si la medición de P0 lo pide |
| — | P7 (P7.0 → P7.3) | No depende de los precios: puede ir en cualquier momento, incluso antes que P1 |

Un commit por fase, y la fase se marca como hecha aquí en el mismo commit. Cada fase sale con `npm run typecheck`,
`npm run validate` y `npm run test` en verde. Las que tocan la ruta, el chunk perezoso o el layout llevan además
`npm run build` y `npm run test:e2e`.

## Despliegue

- **`public/_redirects`:** la ficha no lo necesita (es un parámetro, no una ruta). Sí la vuelta de ITAD,
  `/itad/vuelta` (P7.2).
- **Secreto `ITAD_API_KEY`** subido a Pages antes de publicar la versión con P1. Sin él, `/api/precios` da `501` y
  el cliente no enseña precios ni errores.
- **Firestore:** sin cambios de reglas (salvo que P0.4 cambie).

## Lo que NO se hace

- **Guardar precios o ids de ITAD en el gist.** Son datos de catálogo que caducan en horas; viven en la caché local.
- **Escribir en KV por usuario o por juego.** El cupo es de 1.000 escrituras al día para toda la cuenta.
- **Llamar a ITAD desde el navegador.** La clave es secreta, la CSP no lo permite y la visita anónima no habla con
  terceros.
- **Notificaciones push de ofertas.** Necesitan un Worker con cron y claves VAPID (investigación §B6).
- **Feed público de «lo más deseado» o precios de juegos de desconocidos.** Va contra la promesa de privacidad del
  social.
- **Comparador de tiendas a toda página.** Las condiciones de ITAD prohíben competir con su servicio. El precio es un
  dato dentro de Deseados y de la ficha, con enlace a ITAD para el resto.

---

## Pendiente para cerrar el plan

Todo lo que falta antes de escribir código. Cuando una línea se resuelva, se mueve a la tabla de decisiones de su
fase y se borra de aquí.

### Decisiones del usuario

Ninguna: todas cerradas el 15-10-2026. Lo que queda son datos.

### Datos que hay que conseguir

- **Registrar la app en ITAD** (`isthereanydeal.com/apps/my/`), que lo hace el usuario:
  - la **clave de API** para los precios, subida como secreto `ITAD_API_KEY` a Pages y en `.dev.vars`;
  - las **credenciales OAuth** para la importación, con el scope `wait_read`, la redirección
    `https://<dominio>/itad/vuelta` y la de localhost si la acepta.
- **El dominio de producción** donde se despliega, para la redirección de OAuth y para probar la Cache API.
- **Prueba P7.0** (½ día): si el canje necesita `client_secret`, qué devuelve una lista real (tamaño, `added`,
  `type`) y si ITAD recuerda el consentimiento.
- **Medición P0:** el porcentaje de acierto de `/lookup/id/title/v1` con los nombres reales de unas listas de deseos.
  Decide si P6 (corregir el emparejamiento) sube de prioridad.
- **Medición P0:** si `caches.default` guarda y devuelve en las Pages Functions del dominio real. Si no, la caché de
  precios va solo en el cliente.
- **En F3, mirando el código:** si el directorio cacheado (`peekCachedSocialDirectory`) trae la visibilidad y el
  estado de amistad de cada perfil. Si no, la ficha solo enseña lo del canal social.
- **Medir el arranque crítico** con `gameSheetPath` añadido (hoy, 187,7 de 190 kB), y comparar el modal
  precacheado con el modal dentro del arranque.
- **El tope por usuario y hora de `/api/precios` y `/api/itad/token`** (el de respaldo, en memoria del aislado).

