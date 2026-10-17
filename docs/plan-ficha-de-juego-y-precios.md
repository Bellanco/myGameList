# Plan: ficha de juego y precios de IsThereAnyDeal

> **Estado (15-10-2026): plan cerrado y aparcado, nada implementado.** Todas las decisiones de producto están tomadas
> (tablas de decisiones de cada fase) y la app de ITAD está registrada (16-10-2026); antes de programar solo faltan
> las mediciones y la prueba de «Pendiente para cerrar el plan», al final. Sale de la idea C2 de
> `docs/investigacion-interaccion-social.md`, de una integración con IsThereAnyDeal (ITAD) para la lista de deseos y
> de traer a Deseados la lista de seguimiento de ITAD. Escrito leyendo `develop` tras `8bfd3b2d` y la documentación de
> la API de ITAD (v2.11.0). La ficha ya construida, con su precio, se ve en la maqueta social
> (`docs/maquetas/social.html?pantalla=ficha`, con el servidor de desarrollo).
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
   si está en su mínimo histórico, sacados de ITAD a través de un proxy propio. El aviso de bajada (P4) está
   aparcado: sin notificaciones por ahora.
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
| F0.17 | **En el móvil, el mismo panel lateral y se cierra deslizándolo hacia la derecha** (16-10-2026), como una hoja de Android o iOS pero en horizontal, para no tocar el scroll vertical. El panel deja una franja de unos 20 px de la lista a la izquierda (se lee como algo que está encima, no como una pantalla nueva) y tocarla cierra. Ver «Diseño» |
| F0.10 | **La ficha abre siempre, con o sin red.** Lo tuyo (datos, acciones, saga de tu biblioteca) sale siempre. Lo que viene de fuera (amistades, índice, precios, carátulas) es opcional: si no llega, por falta de conexión, un servicio caído o un cupo agotado, **esa sección no se pinta**, sin error ni hueco. Vale para todas las piezas de fuera. Ver «Sin conexión y servicios caídos» |

## Qué enseña la ficha

1. **Cabecera (F0.14):** carátula (`GameCover`, con `refEntradaDeImagen`), nombre, tu lista y desde cuándo, un
   resumen de una línea (primera plataforma, primer género y último año) y las cifras: tu nota o interés, la media de
   tus amistades y cuántas lo tienen. A la derecha, con ancho, el precio si es un deseo y si no la saga.
2. **Tus datos (F0.12), sin título:** todo lo que hoy enseña el detalle de la fila (`GameTable.tsx:1414-1505`), con su
   mismo marcado (`detail-content`, `detail-box`, chips e insignias) y sus mismas reglas por lista:
   - plataformas, con Steam Deck, y géneros, en todas, y los años en completados: renglones de chips sin etiqueta,
     separados por un filete (sin él, el género «Plataformas» se leía como una plataforma más);
   - las horas, en completados y abandonados, **en las cifras de la cabecera, a la izquierda de la nota**, y solo si
     las hay (revisión del 16-10-2026);
   - puntos fuertes, en c/v/e, y débiles, en c/e (motivos, en v), en dos columnas iguales;
   - rejugar en c y reintentar en v, con el rótulo y la insignia en la misma línea;
   - el análisis, en su propio bloque (para que las columnas lo puedan repartir), **vestido como el de una amistad**:
     el renglón de persona con el comienzo del texto en tres renglones y tu nota a la derecha (si es nota: c, y v con
     `scored`), **sin avatar ni nombre** (ya se sabe de quién es y el texto gana el sitio; las amistades sí los
     llevan). Tocarlo lleva al análisis entero (`statsReviewPath`).

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

**La ficha construida (F6):** `docs/maquetas/social.html?pantalla=ficha`, con la ficha real (`GameSheetPanelView`) y lo
de tus amistades inventado, en seis variantes (`abrir=`): con amistades, `sin-social`, `de-amistad` (desde el
perfil de Marta), `ajeno` (un juego que no tienes) y, con el precio inventado, `deseo` (P3) y `ajeno-precio` (P5). La
fotografía `scripts/capturar-maqueta-social.mjs`.

**La maqueta del diseño**, de antes de construirla (`docs/maquetas/ficha-juego.*`), se borró con la P5: la maqueta
social ya tiene la ficha real con el recuadro del precio (F0.15). Lo que decidió está abajo.

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
- **El realce** (17-10-2026, decisión del usuario): a todo el alto, una ficha con poco que contar (un deseo sin precio
  ni saga) dejaba media pantalla en blanco. Con el ancho y el relleno ya elegidos, la carátula crece por escalones
  (×1,3, ×1,55, ×1,85 y ×2,15, `is-realce-1…4`) y el título sube un tamaño; se queda el mayor que cabe sin scroll. Con
  tope donde la columna de al lado se quedaría sin sitio: ×1,5 en el móvil y ×1,55 con la saga en la cabecera. Al
  ensanchar el panel se vuelve a probar desde cero, y si el contenido crece después, es lo primero que se va.
- **Cómo se mide:** después de `showModal`, sobre el cuerpo (`scrollHeight` frente a `clientHeight`).
  - Se repite cada vez que el contenido cambia de tamaño (`ResizeObserver`): la letra que llega tarde, una carátula,
    las amistades que llegan después. Ese caso **solo ensancha**, así que no puede entrar en bucle.
  - Cambiar el tamaño de la ventana vuelve a empezar por el paso 0.
  - En el móvil no se mide: siempre es la pantalla entera.
  - El panel entra deslizándose desde fuera, así que los cambios de ancho al abrir no llegan a verse.

  El velo es ligero (40 %), para seguir viendo la lista.
- **Móvil (≤ 600 px), F0.17:** el mismo panel desde la derecha, con `calc(100% - 1.25rem)` de ancho (una franja de la
  lista a la izquierda) y un asa vertical en su borde izquierdo, solo en pantallas táctiles. Se cierra:
  - **deslizándolo hacia la derecha** (`useDeslizarParaCerrar`):
    - solo con el dedo o el lápiz (`pointerType`), nunca con el ratón, para no estorbar al seleccionar texto;
    - el eje se decide en los primeros 10 px: horizontal y hacia la derecha es del panel; vertical es del scroll, que
      se queda el navegador (`touch-action: pan-y`);
    - si empieza en algo que se desplaza en horizontal (la tira de la saga) y aún puede moverse, se mueve la tira;
    - al soltar, se cierra con más de un 30 % del ancho o con un gesto rápido (> 0,6 px/ms), y si no vuelve a su sitio;
    - mientras dura, la animación de entrada se apaga (con `both` pisaría el `transform` del dedo); con «reducir
      movimiento», sin transición;
  - tocando la franja de la izquierda, con la X, con Esc o con «atrás», también el gesto de «atrás» del sistema desde
    el borde (iOS y Android), que quita el `?juego=`.
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
- **Tus datos, rehechos (16-10-2026, decisión del usuario):** sin rótulos que no hacen falta y sin renglones con
  filetes, sino en secciones separadas. Un recuadro (solo el cerco) por clase de dato: plataformas, géneros y años en
  una fila; puntos fuertes (filo verde) y débiles o motivos (rojo) en otra. Solo con el color, en algunos temas todo
  parecía de la misma categoría. Rejugar o reintentar es la insignia de siempre, arriba, junto a la píldora de la lista
  (también en el bloque de una amistad). Tu análisis va en la misma sección que tus datos: aparte, las columnas lo
  mandaban a la otra. Con el bloque de una amistad, la ficha cabe ahora en el panel medio en vez del ancho.
- **En columnas CSS** (`columns: 2` con ancho): tus datos (con tu análisis), tus amistades, lo quieren y la saga (en
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

## Fase F1 · Núcleo puro · S · ✅ hecha (16-10-2026)

- `core/utils/gameSheetPath.ts`: `gameSheetSlug(name)` (`gameTitleKey` con guiones), `gameSheetSearch(name)`
  (`?juego=<slug>`), `matchesGameSheet(slug, name)` y `GAME_SHEET_PARAM`. Va en el arranque cuando lo usen la tabla y
  el buscador (F2, F5): medirlo entonces.
- `core/gameSheet/buildGameSheet.ts`, puro:
  - recibe la clave, tu `TabData` y las **señales** de tus amistades, de tres clases: `library` (una entrada de su
    biblioteca ya filtrada por visibilidad, F4), `review` (su reseña del canal social, F3) y `move` (su aviso de
    lista, F3);
  - junta las señales de cada amistad: la biblioteca manda en la lista; sin ella, el aviso más reciente; la reseña
    pone el adelanto y la nota;
  - devuelve tu entrada, las amistades ordenadas (con reseña primero, luego por nota), «lo quieren» aparte y sin
    nota, la media con las notas que haya (F0.2: completados, y abandonados solo con `scored`) y la saga (tu
    biblioteca y las bibliotecas de tus amistades, sin repetir y con el juego actual marcado);
  - `findOwnEntry` y `entriesForGame` para buscar un juego en una biblioteca (la F4 los usa tras
    `applyProfileVisibility`).
- **Tests** (`tests/unit/gameSheet.test.ts`, 18): claves (romanos, acentos, «The», sufijos de edición), listas
  ocultas, horas ocultas, juntar señales, orden, media con una y con varias notas, `scored`, en curso sin nota,
  deseados aparte, saga sin repetir y sin emparentar *Dead Space* con *Dead Cells*.

## Fase F2 · El modal, con lo propio, en lugar del detalle · M–L · ✅ hecha en dos tiempos (16-10-2026)

**Lo hecho:** panel, `?juego=`, ficha con lo propio, apertura desde tus listas (renglones y mosaico) y precache.
**Aplazado a la F5:** el borrado del detalle de `GameTable`, de sus estilos (F0.8) y de `UI_MESSAGES.detail`. El
perfil de una amistad sigue desplegando el detalle hasta que su fila abra la ficha (F0.7), así que `GameTable`
conserva las dos formas: con `onOpenGame` abre la ficha y sin ella despliega. `GameTableColumns.test.tsx` sigue
probando el detalle por eso. **A la F6:** el ancho medido (`useGameSheetWidth`) y devolver el foco a la fila, que
dependen del layout y jsdom no los ve.

- **Medido** (`npm run build` + `npm run validate`): el crítico pasa de 192,4 a 193,3 kB (de 195). El panel no entra:
  va diferido y precacheado (`DEFERRED_MODULES` en `vite.config.ts`), y cuenta solo en el total (234,1 de 240).
- **Revisión del 16-10-2026:** las horas suben a la cabecera, los años pierden su rótulo, el orden de las cajas
  (renglones de chips, fuertes y débiles en dos columnas, rejugar en línea), el análisis vestido como el de una
  amistad y **la salida animada**: el panel guarda la última ficha y sale mientras el velo se desvanece, y solo
  entonces se cierra el `<dialog>`. En el móvil entra y sale como un cajón (320 ms al salir); en ancho, desde el
  17-10-2026, asoma 2,5rem con un fundido (decisión del usuario: el cajón de 1.240 px se veía «muy bestia» en Firefox). Con «reducir movimiento», o si se cerró deslizándolo,
  se cierra en el acto. El ancho se mide antes de pintar (`useLayoutEffect`), para que no salte mientras entra.
- **Doble clic:** la fila abre la ficha al primer clic, también con ratón (17-10-2026: la espera de 250 ms para
  distinguir el doble clic se notaba como un clic que no hace nada). El segundo clic cae en el velo, que no cierra
  (`detail` 2) y abre el formulario de edición encima de la ficha; no desde el perfil de una amistad (`?de=`). Si el
  segundo clic aún llega a la fila, `App` espera a que la ficha esté en la URL para abrir el formulario encima.
- **Al cambiar de lista, la ficha se cierra** (`App.tsx`, con `ownGameSheetTab`): es lo que hacía el detalle, que se
  iba con su fila, y si no, la cápsula de un logro queda debajo del panel modal sin poder tocarse. Cancelar el
  formulario de «Pasar a» no mueve el juego y la ficha sigue abierta.
- **Contraste de los chips, arreglado de paso.** El recorrido de accesibilidad audita ya la ficha en las 16
  combinaciones, y destapó que los chips de años, puntos fuertes y débiles no llegaban a 4,5:1 en tierramedia,
  persona, portal y grimdark en claro, ni en cyberpunk (fuertes y débiles; débiles también en oscuro). No era de la
  ficha: en los renglones medían aún menos (hasta 3,18), pero axe no ve su fondo (un pseudo-elemento debajo) y los
  daba por buenos. Cada tema afina ahora su tinta (`--chip-generic-fg`, `--chip-pf-fg`, `--chip-pd-fg` en su
  `_colors.scss`; Cyberpunk, su `--chipc`), el mismo tono un punto más hondo, hasta 4,6:1 sobre el peor fondo.
  **Queda fuera:** el tono 1 de la escala de géneros de Portal en oscuro (`--cat-1-fg`, «Puzles») mide 3,5:1 sobre
  su velo en los renglones.
- **Verificado en Chromium:** abrir y cerrar no mueven el scroll de la lista (149 juegos, renglones y mosaico, con
  ratón y con el dedo), Esc y «atrás» cierran y
  quitan `?juego=`, y los 8 temas en claro y oscuro a 360 y 1.440 px (tierramedia también a 768 y 1.024), sin
  scroll horizontal.

- **El panel** (F0.11). `view/components/gameSheet/GameSheetPanel.tsx`, con `<dialog>` nativo y `useNativeDialog`.
  El ancho se mide con un hook propio (`useGameSheetWidth`: los tres pasos, el `ResizeObserver` que solo ensancha y
  el reinicio al cambiar la ventana), con su test de componente. El gesto de cerrar, con otro
  (`useSwipeToClose`, F0.17), con tests de componente que disparen `PointerEvent` sintéticos: rápido a la derecha
  cierra, corto y lento vuelve, vertical no mueve el panel, ratón no hace nada y la tira de la saga desplazada se
  respeta. Va lazy
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

## Fase F3 · Amistades desde el canal social (coste 0) · S · ✅ hecha (16-10-2026)

- **De dónde:** la copia del directorio que guarda el hub (`peekCachedSocialDirectory`), leída al abrir la ficha y
  solo si hay espacio social en este dispositivo (`getSocialSyncConfig`, como el buscador general). Sin red y sin
  Firebase. `viewmodel/gameSheet/gameSheetFriendSignals.ts` (pura salvo la lectura) y `useGameSheetFriendSignals`.
- **Qué sale:** las **reseñas** de tus amistades sobre el juego (`activity`: nota y adelanto de 160 caracteres; la nota
  vieja en estrellas pasa a 0–100) y sus **avisos de lista** (`moves`; el canal ya solo guarda los de 30 días).
- **Comprobado antes de pintar:**
  - **Solo amistades:** la copia lleva también a quien no lo es, y quién sí lo dice la huella de amistades
    (`friendUidsFromDirectoryKey`). En una copia anterior a la huella, la misma regla que el buscador: el directorio
    solo lee el canal de tus amistades.
  - **Visibilidad:** cada entrada trae la suya (`visibility`, `socialSkipped`, `socialUnreadable`), pero no hace
    falta aplicarla: la ficha solo enseña lo que ya está en el canal social, y los avisos de las listas que alguien
    esconde van aparte (`hiddenMoves`) y no se leen.
  - **La foto** ya llega resuelta con su `showPhoto`.
- **Pintado:** «Tus amistades» con el renglón de persona del hub (`HubPersonRow`, la piel de cada tema), con reseña
  primero; «Lo quieren» como relleno (F0.4); en la cabecera, la media en la escala de quien mira (F0.13) y «Lo
  tienen». Tocar una amistad lleva a su perfil; **con el juego abierto, en la F5**, cuando su perfil abra la ficha.
- **Estilos del renglón, en su hoja:** `styles/personRow.scss`, que importan `HubPersonRow` y `HubUserCard`.
  Importar `social.scss` desde la ficha metía el hub entero en el precache. Comprobado con la maqueta social: 48
  capturas (amigos, solicitudes y perfil; 8 temas, claro y oscuro) idénticas píxel a píxel antes y después.
- **Medido:** lo diferido pasa de 7,5 a 12,8 kB y el total del precache queda en 239,6 de 240 kB (resuelto en la
  F4: lo social sale del precache). La revisión
  del 16-10-2026 (salida animada, análisis como renglón) lo llevó a 240,1; lo devolvió a 239,6 sacar las direcciones
  del hub a `viewmodel/social/socialRoutePaths.ts`, para que la ficha no arrastre `socialRoutes` con su `matchPath`. La P5 (precio
  en la ficha) no cabe sin decidir antes: cargar las amistades aparte y sin precache (son opcionales, F0.10) o
  rehacer las mediciones del tope.
- **Tests:** `tests/unit/gameSheetFriendSignals.test.ts`, los de amistades de `GameSheetPanel.test.tsx`, el e2e
  `fichaAmistades.test.ts` y la pantalla «ficha con amistades» del recorrido de accesibilidad.

## Fase F4 · Índice de las bibliotecas de tus amistades · M · ✅ hecha (16-10-2026)

Para que «quién lo tiene» incluya también a quien lo tiene sin reseñar ni haberlo movido hace poco.

- `viewmodel/gameSheet/friendLibraryIndex.ts`: `planFriendIndex` (a quién se lee y con qué plazo, puro),
  `librarySignals` (su biblioteca filtrada, como señales) y `loadFriendLibraryIndex` (la carga, de 3 en 3).
  - **A quién:** tus amistades por la huella de amistades de la copia del directorio, activas (no `socialSkipped`) y
    con `gamesGistId`. Sin huella no hay índice: aquí no vale el atajo de la F3, que da por amistad a quien trae algo
    de su canal.
  - **Visibilidad:** la de su entrada, con `applyProfileVisibility`; si su canal no se pudo leer, `LOCKED_VISIBILITY`.
    La ficha no conoce el claim de quien mira, así que no hay excepción de administración: falla cerrado.
  - **Plazo:** `PROFILE_TIER_FRIEND_INDEX_TTL_MS` en `core/constants/tiers.ts` (bronce sin índice, plata 24 h, oro
    12 h, mithril 30 min), con el rango de tu propia entrada en la copia. Por cada amistad, si la última pregunta a
    GitHub (`cachedAt` de `profileCache`, que ahora devuelve `getCachedProfileGamesEntry`) es más nueva que el plazo,
    se sirve la guardada; si no, `loadForeignProfileGames` (condicional, y sin red sirve la caducada).
  - **En memoria** para la sesión mientras no venza el plazo; si alguna no se pudo leer, solo 5 minutos.
- **Sin red o con un gist caído:** se cuenta (`missing`) y la sección lo dice en una línea («No se ha podido consultar
  la biblioteca de 2 amistades.»), sin error.
- **Lo que trae de más:** el mes en que lo terminó (`finishedOn`, que ya calculaba `applyProfileVisibility`), tras
  la lista: «Completado · sept. 2025». Y la saga cuenta también las entregas de sus bibliotecas.
- **Al precache, nada de lo social (16-10-2026).** Con el índice dentro, el total pasaba de 240 kB. Como preveía la
  F3, lo de tus amistades es opcional (F0.10) y sale entero del precache: la carga del canal y la del índice van con
  `import()` desde `useGameSheetFriendSignals`, y la sección con `lazy()` (`GameSheetFriends`, con `HubPersonRow`,
  `HubAvatar` y `googlePhoto`), que solo se pide si hay amistades. Tu análisis sigue en el panel con el marcado del
  renglón escrito a mano, sin avatar. **Medido:** lo diferido baja de 12,8 a 11,1 kB y el total, de 239,6 a 237,9.
  De paso, el plugin del precache (`vite.config.ts`) deja fuera los `.js` que Vite vacía y borra al final (el de una
  hoja que importan varios módulos, como `personRow.scss`): uno así en la lista tumbaba la instalación del service
  worker.
- **Teclado:** los renglones de la ficha (tus amistades y tu análisis) se abren con Intro y Espacio
  (`activarConTeclado`), como los del hub. Faltaba desde la F3.
- **Tests:** `tests/unit/friendLibraryIndex.test.ts` (regla 1 con alguien que no es amistad y no se lee, el plazo por
  rango, bronce, inactivos, visibilidad, lo que falta y la memoria de la sesión), los del panel y el e2e
  `fichaAmistades.test.ts`, que comprueba sobre el build que dentro del plazo no sale ni una petición a GitHub.

## Fase F5 · Puntos de entrada · S · ✅ hecha (16-10-2026)

Todos abren la misma ficha sobre la pantalla en la que estás, poniendo `?juego=<clave>`.

| Desde | Cómo quedó |
|---|---|
| Fila o caja de tus listas (`GameTable`) | Abre la ficha (F0.6, en F2). El detalle desplegable ya no existe |
| Fila de las listas de una amistad (`SocialProfileDetailScreen`) | Abre la ficha con `&de=<perfil>`: su bloque arriba (F0.7). En tu propio perfil, la ficha de siempre |
| Chip del juego en una reseña (`ReviewDetailHead`) | Es un botón que abre la ficha, solo en el hub. La página pública y la ficha de la ruleta no lo ofrecen |
| Aviso de lista del feed (`FeedMoveCard`) | El nombre de un juego sin reseña abre la ficha con el bloque de quien lo movió. Con reseña, sigue abriendo la reseña. Las tarjetas de reseña no cambian |
| Buscador ⌘K (`searchSources`, `GlobalSearch`) | Un juego tuyo abre su ficha encima de donde estás, sin perder la pantalla ni sus filtros (F0.3). La dirección de respaldo es su lista con la ficha abierta |
| Saga, dentro de la ficha | Cada entrega, a su ficha (*replace*, F0.9), conservando el `de=` |
| Una amistad, dentro de la ficha | Su perfil **con el juego abierto** y su bloque arriba (F0.7) |

- **La ficha de un juego que no tienes.** `App` monta el panel con cualquier `?juego=`, y el panel decide si hay algo que
  enseñar: lo tuyo, lo de tus amistades o el bloque de `de=`. En vez de mover, editar y borrar, «Añadir a deseados» y
  «Añadir a próximos» (`addGameToWishlist` / `addGameToProximos`, con las plataformas que se sepan). Al añadirlo, la
  ficha pasa a ser la tuya sin cerrarse.
- **El bloque de la amistad (F0.7).** `loadFriendGameEntry` (en el chunk perezoso del índice, fuera del precache): su
  entrada de ese juego desde su biblioteca guardada (su perfil la acaba de bajar) o, si falta, una lectura
  condicional; solo si es amistad y con su visibilidad. Lleva su nombre de título, su lista y cuándo lo terminó, sus
  datos con el mismo marcado que los tuyos y su reseña, que lleva a la reseña entera en su perfil. Ella sale de la
  lista de abajo. **Decisión tomada al verlo (16-10-2026):** junto a su bloque, tus datos llevan el título «Tus
  datos»; sin bloque siguen sin él (F0.14), porque entonces sí se sabe de quién son.
- **Las pantallas del hub no dependen del router:** reciben `openGameSheet` de `SocialHub` por props, y sin ella lo
  pulsable se queda en texto (la maqueta, los tests).
- **Borrado lo que la F2 dejó en pie:** el detalle de `GameTable` (`expandedId`/`onExpandedChange`, la fila
  `detail`, `DETAIL_ROW_ESTIMATE_PX`, el detalle del mosaico y su marcado), las props que solo usaba él
  (`onDelete`, `onMigrate`, `tabActions`, `visibility.showHours`), el estado `expandedId` del view-model, el
  chevrón girado, la caja abierta del mosaico, las animaciones de cierre de esa fila (`_motion`, Persona, Portal) y
  los textos `score`, `interest`, `hoursSuffix` y `reviewLink` de `UI_MESSAGES.detail`. **Se quedan** la fila
  `detail-row` y su fondo, sus ajustes de móvil, su animación de entrada y el filo de Arcade (`.detail-row.open`):
  los usa la bandeja de importados (`ImportInboxTable`), que el plan no tenía en cuenta en F0.8. **Medido:** el
  crítico baja de 193,6 a 192,9 kB.
- **Tests:** `GameTableColumns` comprueba la fila de cajas del mosaico en vez del detalle; `GameTableHours` se fue y
  sus casos pasaron a la ficha, como el orden de los años; los de reseña del detalle se fueron y quedan los del
  mosaico. Nuevos: el `de=` en `useGameSheetParam`, la ficha ajena y el bloque en `GameSheetPanel`,
  `loadFriendGameEntry`, el chip de la reseña, el nombre del aviso del feed, el buscador y, sobre el build, el bloque,
  añadir un juego ajeno y la auditoría de accesibilidad de la ficha ajena con bloque en los 16 temas y modos.

## Fase F6 · Maqueta, accesibilidad y e2e · S · ✅ hecha (16-10-2026)

- **Maqueta:** la ficha está en `docs/maquetas/social.tsx` (`pantalla=ficha`) y en `TODAS` de
  `scripts/capturar-maqueta-social.mjs`, en cuatro variantes: con amistades, sin social, desde el perfil de una
  amistad y un juego que no tienes. Para pintarla con datos inventados sin sembrar el IndexedDB del origen de
  desarrollo —que es el de la app—, el panel se partió en `GameSheetPanel` (carga lo de tus amistades) y
  `GameSheetPanelView` (lo pinta, recibiéndolo por props). El script de capturas espera ahora a que terminen las
  animaciones de entrada (con tope), o fotografiaba el panel a medio entrar. Las variantes «con precio» llegaron con la
  P3 y la P5, y con ellas se borró `docs/maquetas/ficha-juego.*`.
- **e2e, contra el build** (`tests/e2e/fichaJuego.test.ts`):
  - con 130 juegos, abrir la ficha y volver atrás no mueven el scroll de la lista;
  - recargar con `?juego=` la abre, con el chunk en frío;
  - Esc la cierra y el foco vuelve al juego, en renglones y en el mosaico (y en el mosaico tampoco se mueve el scroll);
  - sin red y con el service worker recién instalado, abre con lo tuyo y sin lo de tus amistades, sin errores;
  - en un móvil emulado, deslizarla a la derecha la cierra y quita `?juego=`, y el gesto vertical es del scroll
    (`touch-action: pan-y`).

  El barrido de axe ya pasaba por la ficha (F2), con amistades (F3) y ajena con bloque (F5), en los 16 temas y modos.
- **Medido** (skill `medir`: worktree en `0394296a`, el commit anterior a la F2, contra el árbol de la F6; MacBook,
  16-10-2026): el crítico pasa de **192,4 a 192,9 kB** (tope 195): toda la ficha suma 0,5 kB al arranque, lo que lee
  `?juego=` y la monta perezosa; quitar el detalle de la tabla compensó parte. El total del precache, de 225,7 a
  238,2 kB (tope 240): el panel diferido (12,0 kB). El recurso de más del arranque (18 frente a 17) es un trozo que
  Vite separa al compartirlo con el panel, no peso nuevo.

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
| P0.5 | **Aparcado (16-10-2026):** el usuario quita los avisos de precios, «no entrarían por ahora». Lo decidido entonces, por si vuelve: **Aviso de bajada: desde plata, con casilla propia y llevando a la ficha** (15-10-2026). Solo avisa de tres cosas: **un mínimo histórico nuevo, un descuento de al menos el 75 % o que el juego entre en un bundle**. La cápsula y la campana abren la ficha del juego. Bajo el interruptor «IsThereAnyDeal», una casilla «Avisarme cuando baje» que solo ven plata, oro y mithril. Sin la casilla marcada, no hay aviso ni refresco en segundo plano |
| P0.6 | **Las tiendas, elegibles desde administración** (15-10-2026). En `/admin`, la lista de tiendas de ITAD (`/service/shops/v1`) con una casilla cada una; por defecto, todas. Se guarda en KV, como el aviso del administrador (memoria `avisos-admin-decisiones`), y `/api/precios` la pasa a ITAD como `shops=`. Una escritura de KV por cambio; leerla, una lectura por petición, de las 100.000 diarias |
| P0.9 | **Aparcado con la P4 (16-10-2026).** La casilla «Avisarme cuando baje» venía apagada (15-10-2026), como el interruptor de ITAD |
| P0.10 | **Aparcado con la P4 (16-10-2026);** los packs siguen llegando en `overview` sin coste, pero nada los pinta. Lo comprobado: **El aviso de bundle se queda** (comprobado en la especificación de ITAD, 15-10-2026). `/games/prices/v3` no trae bundles, pero `POST /games/overview/v2` devuelve los **bundles activos que contienen alguno de los juegos consultados**, y en cada uno, por tramos (`tiers[].games[]`), los juegos con su id: así se sabe cuál de tus deseos está en cuál. Cuesta **una llamada más por refresco** (hasta 200 juegos a la vez), solo para quien tiene la casilla de aviso marcada (desde plata), y pasa por la misma caché del borde |
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

## Fase P1 · Proxy `/api/precios` · M · ✅ hecha (16-10-2026)

**Cómo quedó** (`functions/_lib/itad.ts`, `functions/api/precios.ts`, `localPreciosApi` en `vite.config.ts`, y los
plazos y topes en `core/constants/tiers.ts`: `PROFILE_TIER_PRICE_TTL_MS` y `PROFILE_TIER_PRICE_REQUESTS_PER_HOUR`):

- **`/games/overview/v2` va en cada refresco, no solo con el aviso.** Leída la API: `/games/prices/v3` no trae la
  fecha del mínimo histórico ni el enlace a la página de ITAD, y el recuadro (F0.15) los pide. `overview` los da
  (`lowest.timestamp`, `urls.game`) y trae además los packs, así que el aviso de pack de la P4 (aparcada) saldría sin una llamada
  más. Cada petición cuesta como mucho la búsqueda de lo que falte (y su segunda pasada) más dos llamadas por cada
  200 juegos, y solo por lo que no esté en caché.
- **La tercera pasada, solo para mithril** (17-10-2026, decisión del usuario; `PROFILE_TIER_PRICE_EDITION_SEARCH`).
  *Marvel's Spider-Man* y *Dark Souls* aciertan por el título, pero con la entrada de consola, que ninguna tienda
  vende. Lo que se queda sin id o sin tiendas se busca (`/games/search/v1`, una llamada por título, hasta 10 por
  petición) y vale el primer juego que sea tu título más una coletilla de edición (`esEdicionDe`: *Remastered*,
  *Definitive Edition*, *GOTY*, *Director's Cut*…; *Remake* no, suele ser otro juego). Se guarda en la caché del borde
  aparte (`edicion/…`), para que los demás rangos no la reciban de rebote. El gemelo de desarrollo la tiene siempre.
- **El título de ITAD** no lo da ninguna de las tres llamadas: `/lookup/id/title/v1` solo devuelve el id. Como el
  emparejamiento es exacto, el título que se enseña («Precio de: …», P3) es la variante que acertó: el tuyo o el de
  la segunda pasada (*Hades 2* → *Hades II*).
- **La caché del borde** (`caches.default`) guarda cada valor con una clave `GET` inventada bajo el propio dominio
  (`<origen>/__cache/itad/id/…` y `…/precio/<id>`), porque `/api/precios` es `POST`. Un precio vive un día (más que
  el plazo de bronce, y así queda de respaldo si ITAD no contesta); cada petición decide con la hora guardada si le
  vale. `x-cache: hit|miss` lo dice en cada respuesta, para comprobarlo en el dominio real al desplegar.
- **Topes en memoria del aislado:** por usuario y hora según su rango (30/60/120/1.200) y 150 llamadas a ITAD por
  minuto en total. Al pasarse el del usuario, 429 con `Retry-After` hasta la hora siguiente.
- **Con ITAD sin cupo o caído,** lo guardado vale aunque sea viejo y la respuesta lleva `incompleto: true`; si no
  hay nada, 429 (sin cupo, con su `Retry-After`) o 503 (`unavailable`), como el resto de la API.
- **Las tiendas elegidas desde administración (P0.6) no entran todavía:** se pide a todas. Entran con su pantalla.
- **Comprobado contra ITAD** con el gemelo de desarrollo y la clave de `.dev.vars`: *Silksong* con su mejor oferta
  (PlayerLand), las dos tiendas siguientes, el mínimo histórico con su fecha y el enlace a ITAD; *Hades 2* acierta
  en la segunda pasada como *Hades II*; *Wario Land 2* se encuentra pero ninguna tienda lo vende (`mejor: null`); y
  la segunda petición sale de la caché (`x-cache: hit`).
- **Tests:** `tests/unit/preciosEndpoint.test.ts` (17): la variante numérica, la normalización (orden, una oferta por
  tienda, el mínimo con y sin fecha, las `url` sin tocar), los packs, la caché y los plazos por rango, ITAD caído o
  sin cupo, el `501`, la validación de la entrada, el tope por hora del rango y la cabecera `x-cache`.


- `functions/_lib/itad.ts`, puro salvo el `fetch`:
  - `buscarIds(titulos)`;
  - `buscarIds` hace una **segunda pasada** solo con los no encontrados, con los números romanos pasados a arábigos y
    al revés (medido: +1 de 64 y +4 de 149; ver «Pendiente para cerrar el plan»);
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
  - **Entrada:** `{ titulos: string[] }`, ≤ 400 (el tope de Deseados para el administrador, `WISHLIST_MAX_GAMES_ADMIN`; 100 para el resto, `WISHLIST_MAX_GAMES`), cada uno ≤ `MAX_NOMBRE`.
  - **Salida:** `{ juegos: Record<titulo, Precio | null> }`.
  - Sin datos personales en la petición a ITAD: solo títulos, y salen desde el borde, así que ITAD no ve la IP de
    quien pide.
- **La Cache API (`caches.default`) sí funciona en `*.pages.dev`**, según la documentación de Cloudflare (revisada el
  16-10-2026: «So do Pages functions, whether attached to custom domains or `*.pages.dev` domains»). Lo que obliga en
  el diseño:
  - **solo guarda peticiones `GET`**, y `/api/precios` es `POST`: la clave de cada valor es una petición `GET`
    sintética por juego (`https://cache.mis-listas/itad/precio/<id>`), no la del cliente;
  - **es por centro de datos**, no se replica: dos usuarios comparten la consulta si entran por el mismo (casi todo el
    tráfico de España entra por Madrid). El cupo de ITAD sigue protegido por los plazos de rango;
  - no admite `stale-while-revalidate` y no guarda respuestas con `Set-Cookie`.

  **Para todos los rangos, no solo desde plata (decisión del usuario, 16-10-2026):** la caché no da nada a quien la
  usa, solo AHORRA llamadas a ITAD con la clave, que es de toda la app; quitársela a bronce le haría gastar más cupo
  sin darle nada mejor. Lo que distingue a los rangos es la frescura que aceptan (bronce, un precio de 18 h; mithril,
  de 15 min), y eso ya va en P0.7. Es gratis: ni KV ni escrituras. Lo que más aprovecha es título → id (30 días, igual
  para todos) y los juegos populares; a la escala de hoy no es imprescindible (el cupo da para ~288.000 llamadas al
  día), es un seguro para cuando crezca.

  Nadie la usa todavía en este repo. **Al desplegar la P1 se comprueba en el dominio real** con una cabecera de
  diagnóstico (`x-cache: hit|miss`): dos peticiones seguidas por el mismo juego, la segunda tiene que decir `hit`.
- **Caché en el borde, sin KV** (P0, sujeto a la medición), con un valor por juego:
  - título normalizado → id de ITAD: 30 días; un `null`, 7 días (como el `MISS_TTL` de las carátulas);
  - id → precio, **con la hora a la que se pidió**. Cada petición acepta lo cacheado si es más reciente que el plazo
    de su rango (P0.7): para bronce vale un precio de hace 15 h y para mithril no, y ese caso sí se vuelve a pedir.

  Dos usuarios que desean el mismo juego comparten la consulta. Cada petición del cliente cuesta como mucho
  2 llamadas a ITAD, y solo por lo que no esté en caché o esté más viejo que su plazo.
- **Límites por usuario, no por IP:**
  - el plazo de su rango: si pide antes de tiempo, el borde contesta con lo cacheado sin preguntar a ITAD;
  - un tope de peticiones por usuario y hora **según su rango** (bronce 30, plata 60, oro 120 y mithril 1.200; ver
    «Límites por rango»), en memoria del aislado, por si un cliente se porta mal;
  - un tope global de **150 llamadas a ITAD por minuto** en memoria del aislado, por debajo de las 200 por minuto de
    media que da el cupo (1.000 cada 5 minutos). No es global de
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

## Fase P2 · Cliente: repositorio, caché y preferencia · S · ✅ hecha (16-10-2026)

**Cómo quedó:**

- **`model/repository/pricesRepository.ts`:** `fetchWishlistPrices(titulos)` contra `/api/precios`, con la sesión
  (`shareAuthHeaders`), y `loadWishlistPrices(titulos, plazoMs)`:
  - pide solo lo que no tiene precio o lo tiene más viejo que el plazo del rango de quien mira (P0.7), en tandas de
    400 (`PRICE_REQUEST_MAX_TITLES`);
  - mezcla lo que llega con lo guardado, quita lo que ya no está en Deseados y lo guarda;
  - **nunca lanza:** ante un `401`, `429`, `501`, `503` o sin red, devuelve lo guardado, aunque esté viejo, con un
    `status` (`ok`, `incompleto`, `sin-cupo`, `no-disponible`, `sin-sesion`, `sin-configurar`) para quien pinta. Si
    una tanda falla, las siguientes no se piden.

  Arrastra Firebase por las cabeceras, así que se carga con `import()` desde la P3, nunca en el arranque.
- **La lógica de la caché es pura** (`core/prices/priceCache.ts`): `titlesToRequest`, `mergePrices`, `pruneCache` y
  `chunk`. Cada juego guarda su precio y cuándo se pidió. El precio anterior, que era para detectar bajadas, salió
  al aparcar la P4.
- **Sin almacén nuevo ni `DB_VERSION` 5 → 6:** la caché es un registro (`__precios__`) dentro de `profileCache`, por
  `getPriceCache` y `putPriceCache` de `indexedDbRepository.ts`. Subir la versión sin un manejador de
  `versionchange` dejaba una pestaña vieja abierta bloqueando la apertura de IndexedDB en la nueva. Y el cierre de
  sesión ya vacía `profileCache`, que es lo que se quiere con unos precios pedidos con la sesión.
- **`itadPreference` se sincroniza** (P0.4, que manda sobre lo que decía antes esta fase): `cloudField: 'itad'`, el
  campo `itad` en `FirestorePublicConfig` y en el `hasOnly` de `publicConfig` (`firestore.rules`, validado como
  booleano, con su test de reglas). `parse` solo acepta un `'on'` explícito: apagada por defecto (P0.1). Hook
  `useItad`.
- `core/utils/money.ts`: `formatPrice(amount, currency = 'EUR')` con `Intl.NumberFormat(APP_LOCALE)`; un
  formateador por moneda.
- **El interruptor «Precios de IsThereAnyDeal»** (`view/components/settings/ItadToggle.tsx`) es una caja más de
  **Ajustes › Diseño › Preferencias**, junto a las carátulas, con sus dos botones y sin explicación debajo (lo que se
  envía lo dicen la privacidad y las cookies). Decisión del usuario (16-10-2026): estaba en «Integraciones» y no se
  encontraba. Preferencias solo se abre con espacio social (P0.2), y no lo esconde ningún rango.
- **Legal:** IsThereAnyDeal en los terceros del aviso legal, en «Empresas que tratan tus datos» de la privacidad
  (con la frase de P0.1), un apartado «Precios de IsThereAnyDeal» en cookies y una línea en los créditos.
  `LEGAL_VERSION` no sube (precedente de IGDB); la nota está en `legal.ts`.
- **Tests:** `tests/unit/preciosCliente.test.ts` (formato, caché y repositorio con `fetch` simulado),
  `tests/unit/itadPreference.test.ts` y `tests/component/ItadToggle.test.tsx`.
- **Sin CHANGELOG todavía:** el interruptor solo no enseña nada; la entrada va con la P3, que es cuando se ven precios.

## Fase P3 · Precios en Deseados · M · ✅ hecha (16-10-2026)

**Cómo quedó:**

- **Solo en Deseados** (decisión del usuario, 17-10-2026; el 16 estuvieron también en Próximos): lo que ya tienes en
  otra lista —próximos, en curso, abandonados o completados— no enseña precio, ni en la tabla ni en la ficha, la abras
  desde tus listas, el feed o el perfil de una amistad (`priceTitle` y `conPrecio` en `GameSheetPanel` miran TU entrada
  del juego). Un orden por precio que quedara puesto en Próximos se aplica como el de siempre. Los textos legales
  vuelven a «tu lista de deseos»; como no se había publicado, no hay versión que subir.
- **Deseados sin tope para mithril** (decisión del usuario, 16-10-2026): `hasUnlimitedWishlist` en
  `core/constants/tiers.ts`. `App` lee el rango propio (`useOwnTier`) y, con mithril, el tope es infinito. Sin tope,
  el recuento no se dice contra ningún número (no hay `listCap`) y no se pinta «llena». Mientras el rango no se sabe
  rige el tope de siempre, que solo frena altas; el claim `admin` sigue en 400. Nada visible nombra el rango.
- **Cuándo se piden:** con el interruptor encendido, espacio social y Deseados a la vista (`pricesOn` en `App`). En
  la lista, solo con Deseados abierta (`useWishlistPrices`); en la ficha, solo de un deseo tuyo (`useGamePrice`, con
  `loadGamePrice`, que pide ese título solo y no poda la caché). Primero se pinta lo guardado. Mientras el rango
  está en vuelo no se pide nada.
- **Por partes:** el cliente pide en tandas de 400 (P2) y el borde las parte en llamadas a ITAD de 200 ids.
- **El renglón:** en estrecho, el precio («11,99 € −60 %» y «Mínimo» si iguala el histórico) va en su línea, bajo
  el nombre; con sitio (`@container gamelist (min-width: 46rem)`, el corte del renglón ancho), sube junto a la nota y
  el aro sigue en el canto. Sin precio, la ranura no existe (`:empty`).
- **El mosaico:** en la caja plana, que tiene el alto fijo, el precio va en la línea de la nota, contra el canto; una
  línea más se salía por abajo con un título de dos. Con carátula, una línea bajo las etiquetas.
- **La ficha:** el recuadro de F0.15, como **primera sección del cuerpo** (detrás del bloque de una amistad), y la saga
  sigue en la cabecera. Decisión del usuario (16-10-2026), viéndolo con datos reales: en el lado de la cabecera la
  estiraba muy por encima de la carátula y dejaba vacía la columna del título. En el recuadro, la tienda la dice solo
  el botón («Ver en *tienda*»; debajo del precio, «Hasta el…» o «Sin oferta ahora»), los mínimos no repiten cifra (el
  del año y el de 3 meses, solo si cambian) y el crédito va siempre a la derecha. Las `url` de ITAD, tal cual y con
  `rel="noopener"`.
- **Emparejamiento visible:** «Precio de: *título de ITAD*» en el recuadro y, en el renglón, al pasar por encima
  (`matchedOtherTitle`, con `gameTitleKey`: *Hades II* y *Hades 2* son el mismo).
- **Sin precio** (sin red, sin emparejamiento, `429`, `501`): no se pinta nada, ni «—» ni un error.
- **Atribución:** «Precios de IsThereAnyDeal» al pie de Deseados y en el recuadro, con enlace; en `CREDITS` desde la P2.
- **Carga:** `view/components/prices/Prices.tsx` (con `prices.scss` y `pricesLabels.ts`) y `pricesRepository` son
  chunks propios, fuera del precache. La tabla recibe `renderPrice` y no carga nada de ellos. Si el chunk no llega
  (sin red y recién desplegado), no hay precios y nada falla.
- **Coste medido** (`npm run build && npm run validate`, 16-10-2026): crítico de 192,9 a **193,9 de 195 kB** (`index`
  +0,77 kB: el rango propio y el cableado en `App`); total de 238,2 a **239,5 de 240 kB**. Queda medio kB de total:
  la P5 y la P7 tendrán que diferir algo o rehacer las mediciones del tope.
- **Maqueta:** `docs/maquetas/social.html?pantalla=ficha&abrir=deseo`, la ficha real con un precio inventado
  (también en `capturar-maqueta-social.mjs`).
- **Segunda pasada (16-10-2026): orden y filtro.** Los chips «Precio» (de lo más barato) y «Descuento» (la rebaja más
  grande) se suman a los de Deseados, y la barra gana el filtro «En oferta» (`sale=1` en la URL). Como los precios no
  están en `GameItem`, los aplica `App` sobre lo que ya filtró y ordenó el view-model (`core/prices/priceSort.ts`:
  `sortByPrice`, con lo que no tiene precio siempre al final, y `onSaleOnly`). Sin precios, el filtro no se aplica y
  un orden por precio que quedara puesto se aplica como el de siempre de Deseados.
  - **Medido:** no cabía en el presupuesto total (240,1 de 240 kB). `priceSort` y la carga de los precios
    (`viewmodel/prices/wishlistPricesLoader.ts`) viajan ahora con los precios, con `import()`; en el arranque solo
    quedan el botón, los chips y la llamada. Queda: crítico **194,3 de 195 kB**, total **240,0 de 240 kB**, sin
    margen. Probé a traer también el botón del chunk de los precios y pesaba más (cada `lazy` cuesta lo suyo).
- **Tests:** `tests/component/Prices.test.tsx`, `GameSheetPrice.test.tsx`, `useWishlistPrices.test.tsx`,
  `ToolbarSale.test.tsx`, `tests/unit/priceSort.test.ts` y lo nuevo de `tests/unit/preciosCliente.test.ts`.

## Fase P4 · Aviso de bajada · aparcada (16-10-2026)

**No se hace por ahora** (decisión del usuario: las notificaciones «no entrarían por ahora»). Ni cápsula, ni entrada
en la campana, ni casilla «Avisarme cuando baje», ni refresco en segundo plano: los precios solo se piden al abrir
Deseados (P3) o la ficha (P5). Lo decidido para ella sigue en P0.5, P0.9 y P0.10 por si vuelve. Si vuelve, la caché
tendrá que guardar otra vez el último precio visto de cada juego (salió de `priceCache.ts` al aparcarla).

## Fase P5 · Precio en la ficha · S (depende de F2 y P2) · ✅ hecha (16-10-2026)

**Cómo quedó:**

- **De qué juego se pide** (`priceTitle` en `GameSheetPanel`): de un deseo tuyo (P3), con tu nombre; de uno que no
  tienes en ninguna lista, con el nombre de la primera amistad que lo nombra (`signalGameName`, el mismo con el que la
  ficha lo enseña) o el del bloque de la amistad desde cuyo perfil se abrió. De uno que ya tienes en c/v/e/p no se
  pide nada.
- **Un título solo**, con `loadGamePrice` y el plazo del rango de quien mira, sin podar la caché. Al abrir Deseados,
  la poda saca de la caché los precios de juegos que no son deseos.
- **El recuadro** es el mismo de la P3, en el lado de la cabecera, con «Añadir a deseados» y «Añadir a próximos»
  abajo, como ya tenía la ficha de un juego que no tienes.
- **Maqueta:** `docs/maquetas/social.html?pantalla=ficha&abrir=ajeno-precio` (Outer Wilds desde el perfil de Marta, sin
  oferta). Con ella se borró `docs/maquetas/ficha-juego.*`.
- **Coste medido** (`npm run build && npm run validate`): crítico **194,0 de 195 kB**, total **239,6 de 240 kB**. Al
  total le quedan 0,4 kB: lo siguiente que crezca en el precache tendrá que diferirse.
- **Tests:** el caso nuevo en `tests/component/GameSheetPrice.test.tsx` y `signalGameName` en `tests/unit/gameSheet.test.ts`.

## Fase P6 · Corregir el emparejamiento · S–M (según lo medido en P0)

- En el detalle: «¿No es este juego?» abre una búsqueda (`/games/search/v1` por el proxy) con 5 candidatos.
- El elegido se guarda **en local** (en la caché de precios, `título → itadId`) y no va al gist.
- Si se quiere que viaje entre dispositivos, es un campo aditivo de `GameItem` (decisión aparte, como el `igdbId`
  de C1).

## Fase P7 · Traer tu lista de seguimiento de ITAD a Deseados · M · aparcada (16-10-2026)

**Aparcada para más adelante** (decisión del usuario, 16-10-2026). Lo de abajo —la prueba P7.0 hecha, las decisiones y
los pasos— se queda tal cual para cuando se retome. Nada de la P7 está en el código: ni `/api/itad/token`, ni
`/itad/vuelta`, ni el botón «Traer de IsThereAnyDeal». El secreto de la app de ITAD y su pantalla de autorización ya
existen (ver «Pendiente para cerrar el plan»).

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
- **Deseados tiene un tope de 100** (`WISHLIST_MAX_GAMES`), **400 con el claim `admin`** (`WISHLIST_MAX_GAMES_ADMIN`).
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
- **Hecha (16-10-2026)**, con la cuenta del usuario y un receptor local en `localhost:8000/itad/vuelta` que no
  guardó ni el token ni los títulos:
  - **El canje NO necesita el secret:** con PKCE y sin `client_secret`, `/oauth/token/` devuelve el token (200). La
    Function de P7.1 puede canjear sin él; `ITAD_CLIENT_SECRET` se queda guardado por si ITAD empieza a pedirlo.
  - **El token:** `Bearer`, con caducidad de 2.682.000 s (31 días) y `refresh_token`. Da igual: se usa una vez y se
    descarta.
  - **Una lista real:** 286 entradas (263 `game`, 13 `dlc`, 10 `package`), todas con `added` en ISO con hora.
    Campos: `id`, `slug`, `title`, `type`, `assets` (`boxart`, `banner145`…`banner600`), `mature`, `added`. Pesa unos
    210 kB y tardó 317 ms. **Es casi el triple del tope de Deseados (100)**: la bandeja de P7.3 tiene que dejar
    elegir, no traerlo todo.
  - **`user_info` devuelve el nombre de la cuenta** (para decir con cuál se ha conectado).
  - **ITAD NO recuerda el consentimiento:** en la segunda autorización volvió a enseñar su pantalla (lo confirmó el
    usuario). Cada importación pasa por ella: el texto de P7.2 no puede prometer que «la segunda vez no pregunta».
  - **Una lista mayor que el tope de Deseados** (286 frente a 100): ver «Deseados sin tope para mithril» en P3.
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
- Limitada por usuario y hora según su rango (bronce 0 —no importa—, plata 3, oro 6 y mithril 60: una importación más
  los reintentos de un código caducado) y por las importaciones al día de su rango. Sin KV.
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
| `/api/precios`: peticiones por usuario y hora (red de seguridad; lo normal lo limita el refresco) | — | **30** | **60** | **120** | **1.200** | **Decidido** (16-10-2026): que dependa del rango, como todo; mithril, todo lo que se pueda sin quitar la red de seguridad |
| Deseados: tope de juegos | 100 | 100 | 100 | 100 | **Sin tope** | **Decidido** (16-10-2026). Con el claim `admin`, 400 (ya existía). Ver P3 |
| Precios: aviso de bajada al abrir (P4), con su casilla | — | — | — | — | — | **Aparcado** (16-10-2026) |
| Precios: otras tiendas y mínimos de 1 año y 3 meses en el recuadro | — | Sí | Sí | Sí | Sí | **Decidido:** para todos los que tienen precios (F0.15) |
| Importar de ITAD | **No** | **No** | Sí | Sí | Sí | **Decidido** (D8) |
| Importar: DLC y paquetes | — | — | No | Sí | Sí | **Decidido** (D8b) |
| Importar: juegos por importación | — | — | 50 | 100 | 100 | **Decidido** (D8c). El tope de Deseados sigue en 100 para todos |
| Importar: importaciones al día | — | — | 1 | 3 | Sin tope | **Decidido** |
| `/api/itad/token`: peticiones por usuario y hora (una importación y sus reintentos) | — | **0** | **3** | **6** | **60** | **Decidido** (16-10-2026) |

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
| 5 | P5 | Cruce ficha ↔ precio (P4, el aviso, aparcada) |
| 6 | P6 | Si la medición de P0 lo pide |
| — | P7 (P7.0 → P7.3) | **Aparcada** (16-10-2026), para más adelante. No depende de los precios |

Un commit por fase, y la fase se marca como hecha aquí en el mismo commit. Cada fase sale con `npm run typecheck`,
`npm run validate` y `npm run test` en verde. Las que tocan la ruta, el chunk perezoso o el layout llevan además
`npm run build` y `npm run test:e2e`.

## Despliegue

- **`public/_redirects`:** la ficha no lo necesita (es un parámetro, no una ruta). Sí la vuelta de ITAD,
  `/itad/vuelta` (P7.2).
- **Secreto `ITAD_API_KEY`** subido a Pages antes de publicar la versión con P1. Sin él, `/api/precios` da `501` y
  el cliente no enseña precios ni errores.
- **Firestore:** el campo `itad` de `publicConfig` (P0.4, P2). Las reglas se despliegan **antes** que la versión que lo
  escribe (`firebase deploy --only firestore:rules`); si no, la escritura de la preferencia la rechazan las reglas viejas.

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

- ✅ **App registrada en ITAD (16-10-2026):**
  - `ITAD_CLIENT_ID` en `wrangler.toml`, en sus tres bloques;
  - `ITAD_API_KEY` e `ITAD_CLIENT_SECRET` subidos como secretos de Pages (producción) y documentados en
    `.dev.vars.example`; en local, en el `.dev.vars` de cada uno;
  - la casilla «This app will NOT store OAuth secret securely», **desmarcada**: el canje lo hace una Function y el
    secret no llega al navegador;
  - redirecciones: `https://mygamelist.pages.dev/itad/vuelta` y, si ITAD la acepta, `http://localhost:8000/itad/vuelta`.
    Si solo admite una, una segunda app de ITAD para local, como la OAuth App de desarrollo de GitHub.
- ✅ **Dominio de producción:** `https://mygamelist.pages.dev`.
- ✅ **Prueba P7.0** (16-10-2026): el canje no necesita el secret; una lista real de 286 entradas con `added` y tres
  `type`s, y ITAD no recuerda el consentimiento: cada importación enseña su pantalla. Ver P7.0.
- ✅ **Comprobado contra ITAD (16-10-2026), con las claves de `.dev.vars` y sin mostrarlas:**
  - **API Key: funciona.** `/games/prices/v3` responde 200 con datos reales (7 tiendas para *Silksong*, con los tres
    mínimos); con una clave falsa, 403 «Invalid or expired api key». `/games/overview/v2` también responde.
  - **Client Secret: sin comprobar.** Con el real y con uno falso, `/oauth/token/` responde igual («invalid_grant»):
    rechaza el código inventado antes de mirar el secret. Se valida en P7.0, con un código de verdad.
  - **Redirect URI: bien.** Con la de producción y con la de `localhost:8000`, ITAD enseña la pantalla de
    autorización de la app; con una inventada, «Client authentication failed».
  - ✅ **Pantalla de autorización de ITAD:** con el nombre «Mis Listas» y su descripción, que es lo que verá cada
    usuario (decía «miListadeJuegos» y «Developer did not provide any description»). Hecho por el usuario.
  - **Tiendas de claves:** el mejor precio de *Silksong* sale en **PlayerLand**. Confirma que elegir las tiendas desde
    administración (P0.6) tiene sentido.
- ✅ **Medición P0, acierto por título** (`/lookup/id/title/v1` con los nombres reales de `myGames.json`):

  | Lista | Encontrados | Con la segunda pasada | Emparejamientos equivocados |
  |---|---|---|---|
  | Próximos (64) | 61 (95 %) | 62 (96 %) | 0 |
  | Completados (149) | 130 (87 %) | 134 (89 %) | 0 |

  - Los «títulos distintos» eran el mismo juego: ediciones GOTY, «™» o romanos frente a arábigos.
  - **La segunda pasada va en P1:** a los no encontrados, una llamada más con los números romanos pasados a arábigos
    y al revés. Recupera *Devil May Cry V*, *Hades 2* y *The Witcher II* y *III*.
  - **Lo que queda sin encontrar** son erratas de la propia biblioteca (*Max Paine*, *XCOM: Enemy Unknow*), títulos
    en español (*La Tierra Media: Sombras de Mordor*) y consolas que ITAD no cubre (*Pokémon*, *Wario Land*).
  - **Consecuencia para P6:** no hace falta para corregir emparejamientos equivocados, que no ha habido, sino para
    **buscar a mano lo que no se encontró**. Se queda como está, sin subir de prioridad.
- ✅ **`caches.default` en `*.pages.dev`:** según la documentación de Cloudflare, sí funciona en Pages Functions,
  también en `*.pages.dev`; por centro de datos y solo con `GET` (ver P1). Se comprueba de verdad al desplegar la P1.
- ✅ **En F3, mirando el código:** el directorio cacheado trae la visibilidad de cada perfil, y quién es amistad lo
  dice la huella de amistades (ver F3).
- ✅ **Arranque crítico, medido:** 193,3 de 195 kB con la ficha (F2), 192,9 tras quitar el detalle de la tabla (F5).
  El panel va precacheado y diferido, fuera del arranque; lo de tus amistades, fuera del precache (F4).
- ✅ **Los topes por usuario y hora**, por rango: `/api/precios` 30/60/120/1.200 y `/api/itad/token` 0/3/6/60
  (bronce, plata, oro y mithril). Mithril, alto pero con tope, para que un bucle propio se corte; lo que protege la
  clave es el tope global de 150 llamadas por minuto. Ver «Límites por rango».

