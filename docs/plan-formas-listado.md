# F5 — Las dos formas del listado (lista y caja)

Estado: **en curso**, rama `feat/formas-listado`. Esto no es documentación de algo terminado: es dónde se
quedó el trabajo, qué se decidió y qué falta, para poder retomarlo sin reconstruir el razonamiento.

> **Al día de 2026-09-15**, los dos problemas de la §3 están resueltos y el renglón y la caja se rehicieron
> sobre una maqueta de referencia. Lo que cambió está en la §6, al final; la §3 se conserva porque es el
> diagnóstico del que salieron las decisiones.

---

## 1. Qué se pidió

> «Quiero mejorar el listado: que deje de parecer un excel, y que tenga opciones para seleccionar entre forma
> lista y forma caja.»

Y, aclarando la forma de lista:

> «Quiero que sea una lista, pero que no se note que lo es; que sea algo más moderno, más agradable y adaptado
> para el día de hoy, en lugar de parecer tanto un excel.»

Más dos condiciones que salieron sobre la marcha:

> «Es importante, al menos en el formato lista, que salgan los mismos datos que antes; si no, debería tener un
> tercer formato para verlo.»

> Probarlo con la biblioteca real (`myGames.json`, 302 juegos) y con las notas 0–100.

---

## 2. Lo que está hecho

**La preferencia.** `listShapePreference` (`view/hooks/preferences.ts`) con su clave local
(`LIST_SHAPE_KEY`), su campo en la nube (`FirestorePublicConfig.listShape`) y su hook (`useListShape`).
Escribe `data-list-shape` en `<html>`. Valores: `list` (por defecto) y `grid`.

**La forma la decide UN sitio.** Antes el colapso a tarjeta lo decidían dos: `GameTable` (para estimar la
altura de fila) y una media query de `≤1100px` en `_table.scss` + `_overlays-and-responsive.scss` (para
ocultar columnas). Ahora lo decide el componente —preferencia **o** pantalla estrecha— y el CSS obedece a la
clase `is-cards` / `is-grid`. Sin esto, la forma no podía ser una preferencia.

**Forma lista.** La fila es una pieza (fondo, canto redondeado, `border-spacing` entre filas, elevación al
pasar por encima) y el nombre tiene cuerpo de titular. *(Cómo se reparte por dentro se rehízo después: ver la
§6. En esta primera versión los datos iban en una línea de chips, `.row-data`, y el teléfono tenía un marcado
aparte, `.row-meta`.)*

**Forma caja.** Mosaico en rejilla. Cada fila de la rejilla es **una fila de tabla** (`tr.grid-row`) con una
celda `colSpan` que contiene las cajas: así el virtualizador sigue midiendo filas de verdad. `GameTable`
agrupa los juegos de N en N, con N calculado midiendo el contenedor (`GRID_CARD_MIN_PX`, que debe coincidir
con el `minmax` de `.game-grid`). El detalle abierto se inserta tras la fila que contiene la caja pulsada.

**El conmutador** (dos iconos nuevos en el sprite: `view-list`, `view-grid`) vive en la barra de filtros y no
recibe props: lee el store.

**El orden**, que antes lo llevaban las cabeceras de columna, pasa a un control dentro del listado
(`.list-sort`). *(Era un desplegable + un botón de sentido; hoy son chips: ver la §6.3.)*

---

## 3. Lo que falla (y es lo primero que hay que resolver al retomar)

> «Me gusta el diseño, pero creo que pierde usabilidad: al no tener el orden en el listado, parecen datos ahí a
> lo loco, mientras que en la vista de tarjeta, tiene a veces datos, a veces no.»

### 3.1 En la lista: los datos no están ordenados en el espacio

Los chips se pintan seguidos (`display: flex; flex-wrap`), así que **cada fila empieza sus categorías donde le
toca**: el género de una fila no cae debajo del género de la siguiente. Al quitar las cabeceras se perdió lo
único que decía qué era cada cosa, y sin alineación vertical tampoco se puede deducir. El color ayuda a medias
(género teñido por la rampa, fuertes en verde, débiles en rojo, año ámbar, plataforma neutra) pero no basta.

Opciones, de más a menos recomendable:

1. **Columnas invisibles.** Que `.row-data` sea una rejilla de columnas fijas —igual que ya hace `.row-meta` en
   móvil, que se diseñó exactamente para este problema— con una columna por categoría y anchos elásticos. Se
   recupera la lectura vertical (y con ella el sentido de «qué es cada chip») sin dibujar ni una línea ni una
   cabecera. Es la opción que conserva el diseño y arregla el fondo del problema.
2. **Rótulos en versalitas** delante de cada grupo (`AÑO`, `PLATAFORMA`…). Resuelve el «qué es esto» pero mete
   mucho ruido en una lista de 300 filas.
3. **Separadores** (·) entre grupos. Barato, pero solo agrupa: no alinea.

Si se elige (1), hay que decidir qué pasa cuando una categoría está vacía: reservar su columna (filas siempre
alineadas, algún hueco en blanco) o dejarla colapsar (menos aire muerto, peor alineación). En `.row-meta` se
optó por RESERVAR, y por buenas razones — ver su comentario en `_table.scss`.

### 3.2 En las cajas: el contenido es irregular

Una caja enseña dos chips y la de al lado cuatro; unas llevan año y otras no, según lo que tenga cada juego.
Como todas las cajas de una fila miden lo mismo, la desigualdad se ve como descuido.

Opciones:

1. **Ranura fija**: siempre las mismas tres cosas y en el mismo sitio —un género, una plataforma, el año—, con
   `+N` cuando haya más y un hueco tenue cuando falte el dato.
2. **Tope por categoría** (hoy: 2 géneros + 1 plataforma + 1 año) bajado a uno por categoría.
3. Dejar que la caja crezca y que las filas midan distinto (rompe la rejilla; descartado).

La (1) es la que hace que el mosaico se lea como una colección y no como fichas sueltas.

---

## 4. Lo que falta, además de eso

- ~~Vestido propio por tema~~: las dos formas usan superficies y chips de la paleta, así que cada skin les pone
  su canto, su letra y su color —comprobado en las ocho—, y desde el gesto de entrada de la carátula hay además
  dos con firma propia («Sin futuro»/Grimdark y Portal). Queda por decidir si el renglón y la caja merecen algún
  gesto más allá de eso.
- ~~Las otras tres pestañas~~: revisadas. Próximos y En curso no tienen año ni insignia, y la rejilla deja esas
  ranuras a cero sin dejar hueco; Abandonados lleva la nota solo si algún juego está puntuado.
- Tests: un recorrido (e2e) con biblioteca grande que compruebe que en mosaico no se pintan más cajas por fila
  de las que caben y que la virtualización sigue midiendo filas. *(Ya están cubiertas la alineación del renglón
  y la regularidad de la caja (`GameTableColumns.test.tsx`), las tres caras de la carga (`GameCover.test.tsx`) y
  la preferencia de tamaño (`gridSizePreference.test.ts`).)*
- Decidir si el conmutador va también en /cuenta → Apariencia (hoy solo en la barra del listado).
- El detalle en mosaico funciona, pero no se ha probado con teclado.

**~~Y lo que queda por limpiar~~ — HECHO:** la tabla clásica era código muerto y se ha ido. `shape` solo vale
`list` o `grid`, así que el `<table>` llevaba siempre `is-cards` o `is-grid` y las dos escondían el `<thead>`: se
pintaban 8 celdas por fila de las que 7 eran `display:none`, más una cabecera con cinco botones de ordenar que
nadie podía pulsar. Con ella se fueron `C_COLUMN_CLASS`, `cCol()`, `getColSpan()`, el `<thead>`, el `<colgroup>`
y, en el CSS, los anchos de `@media (min-width: 1101px)`, el plegado del escritorio estrecho y el bloque
`.th-sort-*`. **326 nodos menos** en la pantalla del listado.

Lo que SÍ se queda es el `<table>`: es lo que permite que el virtualizador mida FILAS de verdad —cada renglón,
cada fila de tarjetas y cada detalle son un `<tr>` que se mide— mientras el CSS pinta piezas sueltas. Y con una
sola columna desaparece la clase de fallo que obligó a poner el `<colgroup>` (el reparto de ancho entre 6-8
columnas que dejaba el nombre a un carácter por línea): ya no hay nada que repartir. El invariante «una sola
columna» está cubierto en `GameTableColumns.test.tsx`.

`thead th` sigue en la hoja de estilos, y no es un resto: la bandeja de importados es una tabla de tres columnas
con cabecera de verdad.

---

## 5. Cómo reproducir la prueba

La biblioteca real y la escala 0–100 se montaron a mano, y los dos apaños se revirtieron antes de commitear:

```bash
cp myGames.json public/_prueba-mygames.json   # servir los datos (borrar después)
```

```js
// en la consola del navegador, con la app abierta
const datos = await (await fetch('/_prueba-mygames.json')).json();
localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
  ...datos, deleted: [], updatedAt: Date.now(), schemaVersion: 1,
}));
location.reload();
```

Para las notas 0–100 sin sesión de Google: poner `DEFAULT_SCORE_SCALE` a `'grade'` en
`core/utils/scoreScale.ts` mientras dure la prueba (la preferencia de verdad vive en Firestore).

---

## 6. La forma definitiva (2026-09-15)

Sobre una maqueta HTML de referencia —colocación y estructura de ella, piezas y color de la app— se rehizo el
renglón, la caja y el control de orden. Tres decisiones de producto se tomaron antes de escribir nada:

| Decisión | Elegido | Por qué |
| --- | --- | --- |
| Fuertes y débiles en el renglón | **En un recuadro, sin rótulos y solo en pantalla ancha** | Se probó a dejarlos solo en el detalle, por densidad, y al verlo faltaban: son la razón de ser de estas listas. Vuelven en un recuadro hundido de dos mitades. Los rótulos se quitaron después: el recuadro ya los separa de las categorías, y cuál es cuál lo dicen el color y el sitio. En el teléfono no caben sin recortarlos a una palabra, así que allí no se pintan. |
| Carátula en el renglón | **Una franja recortada, a todo el ancho** | Como la maqueta §1: la portada llena el renglón y se recorta por arriba y por abajo, así que lo que se ve es un renglón recortado de ella. Para que no salga borrosa, el renglón pide a IGDB la imagen grande (ver §6.4). Sin carátula, superficie plana (su §2). |
| Control de orden | **Chips segmentados** | Ver abajo. |

### 6.1 El renglón: tres pisos y columnas invisibles

Resuelve la §3.1. Cada renglón es una pieza con tres líneas:

1. **Cabecera** (`.row-head`): el nombre a la izquierda; la nota y la insignia pegadas al canto derecho. Antes
   la nota viajaba al final de una línea de chips cuya longitud cambia en cada fila.
2. **Categorías** (`.row-cats`): año, plataformas y géneros, cada uno en su ranura. En pantalla ancha es una
   rejilla de columnas fijas (`auto 13rem 1fr`) **sin una sola línea dibujada**; en estrecha las ranuras se
   apilan —plataforma arriba, género debajo—, que es la maqueta §4.

Y **un solo marcado para todos los anchos**: desaparece el `.row-meta` de mini-píldoras que había para el
teléfono. Lo único que cambia con el ancho es cuántos chips caben antes del «+N». Mantener dos versiones de la
misma fila es lo que hacía que la lista y la app móvil se fueran separando.

Dos medidas que no son de gusto sino de que la lista no se descuadre:

- La ranura de la **nota se reserva entera** aunque ese juego no la tenga (`meta-score` / `meta-grade`), o la
  insignia de al lado se correría de sitio en unas filas sí y en otras no.
- La ranura de la **plataforma no crece a dos líneas** (tope de 2 chips + `nowrap`). Sin eso, «Cat Quest» y
  «The Messenger» —tres plataformas de nombre largo— salían 34 px más altos que los otros 300 renglones.
- El **año va sin contador**: «2026 +2» se lee como una suma. Solo el más reciente; todos, en el detalle.

3. **La opinión** (`.row-notes`): un recuadro hundido con los puntos fuertes a la izquierda y los débiles —o
   los MOTIVOS, en la vergüenza— a la derecha, las dos mitades siempre puestas aunque una esté vacía. **Sin
   rótulos**: el recuadro ya lo separa de las categorías y cuál es cuál lo dicen el color (verde/rojo, los de
   toda la app) y el sitio. Son **DOS recuadros independientes**, uno por grupo: hubo una versión con uno solo
   partido en dos mitades y se leía como una tabla de dos celdas. Y son **columnas invisibles como las de
   arriba**: la de los fuertes tiene ancho fijo, así que el recuadro de lo malo arranca siempre en el mismo
   píxel tenga la fila de arriba un punto fuerte o cuatro; el de lo malo mide lo que miden sus chips. Un grupo
   vacío no deja un recuadro con un guion dentro: no se pinta. Próximos no los lleva —todavía no se ha jugado a
   nada— y el teléfono tampoco: a ese ancho se quedarían en una palabra.

Las tres ranuras de categoría **se reparten todo el ancho** del renglón (`fr`, no `rem`): lo que tiene que
casar es el reparto entre filas, no una medida concreta, y así el género —que es el que lleva el texto largo—
se queda con la parte del león. La columna del año solo existe donde hay años (clase `has-year`); en Próximos
y En curso se queda a cero y la plataforma empieza pegada al canto.

**Y las columnas invisibles también en el teléfono**, que es lo que faltaba: allí las ranuras se reparten en
dos líneas —año y plataformas arriba, género debajo— pero siguen siendo una rejilla, así que el año de una
fila cae sobre el año de la siguiente. Por debajo de 22 rem de contenedor el año desaparece: sus 6,6 rem son
justo los que la plataforma necesita para verse entera, y de los tres es el que menos se busca.

El año enseña **varios con su «+N»**, como llevaba en su columna: tres en escritorio, uno en el teléfono.

Medido sobre el build con la biblioteca real: **las 302 filas miden 151 px exactas** a 1200 y a 1440 px de
ancho (129 en un teléfono de 412), y el género de todas empieza en el mismo píxel. Eso sale de reservar el
alto de un chip (`--chip-slot-h`, 27 px medidos) en toda ranura que pueda quedarse vacía.

### 6.2 La caja: ranuras fijas y el medidor del pie

Resuelve la §3.2. La carátula va con aire alrededor (no a sangre), la **nota flota sobre su canto superior** y
la **insignia sobre el inferior**: las dos señales ocupan las esquinas libres de la lámina y dejan el cuerpo
entero para lo que se lee. Debajo, **siempre las mismas dos ranuras** —plataformas y géneros, sin año— y al pie un
**medidor** que cruza la caja de lado a lado con el tono rojo→verde del aro (`--score-hue`), así que la fila se
ordena de un vistazo incluso con la escala de estrellas puesta.

**El año no está en la caja** y las cajas son más anchas: el mínimo subió de 168 a 205 px (de 7 columnas de
191 px a 6 de 225 a 1440), que es lo que hace falta para que la plataforma y el género se lean enteros. En el
teléfono ese mínimo daría UNA columna a pantalla completa, así que allí se queda en 168 y siguen saliendo dos.
El reparto de chips no es el mismo en las dos ranuras y tiene su motivo: las plataformas son nombres cortos y
caben dos; dos géneros largos («Coleccionista de criaturas» y «Puzles») salen los dos recortados a la vez, y
dos ranuras con puntos suspensivos se leen peor que una entera con su «+1» al lado.

**Y la ranura de la carátula solo existe si hay carátulas.** Con la preferencia apagada —que es como viene la
app— reservar el marco 3:4 son trescientos píxeles de alto por caja para no enseñar ninguna imagen: el mosaico
se leía como una parrilla de azulejos de color con el nombre repetido dentro y debajo, y la fila medía 422 px
para decir lo que cabe en 171. Sin marco, la nota y la insignia dejan de flotar sobre nada y encabezan la caja
**en la misma línea**, una a cada canto.

Lo decide la PREFERENCIA y no el juego: si dependiera de que cada carátula llegue, dentro de la misma fila unas
cajas tendrían marco y otras no. Con las carátulas encendidas el marco se reserva siempre y el juego que no
tenga imagen enseña su portada de casa, que es para lo que se hizo. La altura estimada del virtualizador mira
la preferencia (`GRID_ROW_FLAT_ESTIMATE_PX`) y las medidas guardadas se tiran al cambiarla, porque cambia el
alto de todas las cajas a la vez.

El mosaico **también funciona en el teléfono** (dos columnas a 412 px): elegir «cuadros» en el móvil ya no
revertía a renglones sin avisar.

### 6.3 La cabecera del listado: recuento, orden y forma

Las tres cosas que dicen QUÉ se está viendo y CÓMO, en **una sola pieza** (`.list-head`) con la misma
superficie y el mismo canto que las filas: es la pieza que abre la lista, no algo apoyado encima.

Venían de dos sitios y las dos se leían como añadidos: el conmutador de forma estaba metido en la caja de
filtros —donde parecía un filtro más— y el orden era un desplegable del sistema con un botón de flecha al
lado, colgando encima de la primera fila. Ahora:

- **Recuento** de lo que hay con los filtros puestos, separado por un filete de lo que sigue.
- **Orden en palabras**, con todas las columnas a la vista. Sin óvalo: cinco píldoras seguidas dentro de la
  barra se leían como cinco botones puestos ahí —tres cercos, uno dentro de otro, contando la barra—. Lo
  único que dice cuál manda es su tinta y una punta pequeña a media tinta; volver a pulsarla invierte el
  sentido. El carril se desplaza de lado en vez de envolver.
- **Forma** (lista / cuadros) al canto derecho, al lado de lo que cambia.

En pantalla estrecha la barra se parte en dos pisos: arriba el recuento y la forma, abajo el carril del orden.

Y **nada de esto fuerza versales**: el recuento, el rótulo y los nombres de columna van a la lista de
`data-uppercase` (`_base.scss`), o sea que las mayúsculas las decide la preferencia de apariencia, como en el
resto del «chrome». Los chips entran con ellos porque son las cabeceras de columna de siempre dichas de otra
forma, y `thead th` ya estaba en esa lista: dejarlos fuera pondría «ORDENAR» en versales y «Año» no, en la
misma línea.

### 6.4 La carátula del renglón, y por qué en desarrollo no se ve

`/cover` **no es un fichero: es una Pages Function** (`functions/cover.ts`, que habla con IGDB y sirve los
bytes desde este dominio). `npm run dev` y `vite preview` sirven estáticos y no ejecutan Functions, así que
`/cover?n=…` cae en el `_redirects` de la SPA y devuelve `index.html`: el `<img>` recibe HTML, no una imagen, y
no se pinta nada — con la preferencia encendida y sin un solo error visible. Para verlas en local hace falta el
runtime de Cloudflare, que además lee el `IGDB_CLIENT_SECRET` de `.dev.vars`:

```bash
npm run build && npx wrangler pages dev --port 8000 --ip 127.0.0.1
```

Con eso `/cover?n=Hades&p=Steam` responde `200 image/jpeg`.

En el **renglón** la portada llena el ancho manteniendo su proporción y se recorta por arriba y por abajo: lo
que se ve es un renglón recortado de la carátula. Encima cae la capa —la superficie del tema, casi opaca por
la izquierda, donde están el nombre y las etiquetas, y abriéndose hacia la derecha—; en el teléfono la capa
cierra más, porque allí el texto ocupa la fila entera.

**Y por eso `/cover` tiene dos tamaños.** Con los 264 px de `t_cover_big`, llenar 1.400 son casi seis aumentos
y lo que queda es una mancha de color. El renglón pide `s=ancho` (`t_1080p`, ~762 px) y el aumento baja a menos
de dos. Cuesta ~120 kB por juego en vez de 25, y por eso no es el tamaño por defecto: el mosaico sigue con la
pequeña, que es la que cabe en su ranura. Cada tamaño va en la URL y no en una cabecera porque el service
worker cachea por URL y sin `Vary`: sin eso, el mosaico acabaría pintando la grande —o al revés— según cuál
se pidiera primero.

En la **caja**, la carátula va a sangre y sin marco propio: la imagen llega a los tres cantos y son sus
esquinas las que forman el canto de la pieza (las recorta el `overflow: hidden` de la caja). Antes llevaba un
margen alrededor y la caja dibujaba su borde por fuera — dos cantos separados por unos milímetros, y la portada
se leía como una lámina pegada encima en vez de como la cara de la pieza.

### 6.5 Cómo entra una carátula, y el tamaño de los cuadros

**Cómo entra una carátula.** La imagen aparecía de golpe sobre la portada de casa: un salto seco de un
fotograma al siguiente que se lee como un fallo de pintado. `GameCover` tiene tres caras (`data-carga`):
**cargando** —se ve la portada de casa, QUIETA—, **lista** —la imagen entra con el gesto del tema— y **sin**
—no hay URL o la petición falló: la portada de casa se queda—. El estado vive y muere con el elemento: no se
guarda nada, que es lo que evita el viejo problema de `onError` marcando como rotas carátulas buenas que la
rejilla virtualizada había cancelado.

**El gesto es la ENTRADA, no la espera**, y la distinción importó: hubo una versión con un esqueleto animado
mientras se esperaba, y sobraba por dos motivos. Uno, mientras no hay imagen no falta nada —ya hay una portada
pintada, y un barrido encima es ruido sobre algo que está completo—. Dos, con `loading="lazy"` hay noventa y
pico cuadros fuera de pantalla en estado «cargando»: eran noventa animaciones infinitas corriendo para nadie.

Y **lo pone cada tema**, porque materializar algo también es interfaz: el componente solo decide CUÁNDO ocurre.
La versión base es un fundido con un punto de acercamiento; «Sin futuro» y Grimdark rearman la imagen a franjas
descolocadas (`steps(1, end)`, que es lo que lo hace glitch y no barrido), y Portal la enciende a parpadeos,
como el tubo fluorescente de sus chips. Los dos son gestos de FIRMA, así que van con los efectos encendidos;
apagados queda el fundido de la casa.

**Duran 1,8 s**, que es largo para una transición de interfaz y corto para lo que es: la carátula
INSTALÁNDOSE. A medio segundo el gesto pasaba tan deprisa que volvía a leerse como un salto.

**La animación es decoración sobre un estado que ya funciona**: la opacidad final la pone la regla y no el
último fotograma (nada de `fill-mode: both`), así que con `prefers-reduced-motion`, con los efectos apagados o
en un navegador que no entienda alguna propiedad, la imagen se ve igual. Comprobado en los cinco casos.

**El tamaño de los cuadros.** Un deslizador en la cabecera, visible solo en mosaico, con forma de **cuña**:
fina a la izquierda (cuadros pequeños, caben más) y gruesa a la derecha. Es la figura de un control de volumen,
que se entiende sin rótulo y dibuja lo que hace. Cambia el ancho mínimo de cuadro con el que `GameTable`
reparte columnas: a 1440 px salen **8, 6 o 5**; en un teléfono de 412, **3, 2 o 1**.

Por dentro es un `<input type="range">` de verdad —trae el teclado, el arrastre y el papel de deslizador
gratis— con el carril nativo en transparente: la cuña son dos capas recortadas con el mismo `clip-path` sobre
la cápsula (el canal apagado y el relleno, tan ancho como diga `--grid-size-pos`). Y con `aria-valuetext`, para
que no se anuncie «2 de 3» sino «Normales».

**Y SINCRONIZA**, lo que obligó a arreglar de paso un fallo viejo: el `hasOnly` de `publicConfig` en
`firestore.rules` no incluía `listShape` ni `covers`, que el cliente lleva escribiendo desde que existen. Un
`hasOnly` que no cuadra **rechaza la escritura ENTERA**, así que a quien hubiera cambiado la forma del listado
le dejaban de sincronizarse también la paleta y el tema. Es el mismo caso que le pasó a `effects` (test «L2»).
Las tres claves entran ahora en la lista con su validación, cubiertas por un test nuevo («F5»), y las reglas
están desplegadas: añadir claves solo ABRE lo que se admite, ningún documento que antes se guardaba deja de
guardarse.

### 6.6 El color de la plataforma

La plataforma es una categoría más del renglón y comparte sitio con otras cuatro que **ya tienen su familia de
color con significado**: rojo los puntos débiles, verde los fuertes, ámbar el año, gris el «+N». Su chip lo
teñía cada tema con su acento y cuatro paletas caían de lleno en una familia ocupada —Plata y acero, Portal y
Persona en gris; Grimdark en verde— y Forja tiraba a ámbar: el renglón dejaba de poder leerse por color.

Sigue siendo identidad de cada paleta, pero **dentro de la familia fría** (azul, violeta, cian), y el tono sale
de lo que ya tenía cada una: el azul de su rampa en Forja, el yrden en Plata y acero, el azul de Aperture en
Portal, el índigo de su rampa en Persona, un violeta frío en Grimdark. Cian de Sin futuro, violeta de Inserte
moneda y turquesa de Mar de estrellas ya cumplían. La regla está escrita en `themes/_index.scss` para que la
siga la próxima paleta.

### 6.7 Lo que se quedó por el camino

- `.row-meta` y las mini-píldoras `.rm-plat` / `.rm-genre` / `.rm-strong`, con sus container queries de
  revelado progresivo y sus pegatinas en los skins de «Inserte moneda» y «Plata y acero».
- El `row-meta` que la **bandeja de importados** arrastraba: solo se encendía dentro de `table.is-cards`, clase
  que esa tabla nunca ha tenido, así que llevaba tiempo sin verse en ningún ancho.
