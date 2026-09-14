# F5 — Las dos formas del listado (lista y caja)

Estado: **en curso**, rama `feat/formas-listado`. Esto no es documentación de algo terminado: es dónde se
quedó el trabajo, qué se decidió y qué falta, para poder retomarlo sin reconstruir el razonamiento.

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
pasar por encima), el nombre tiene cuerpo de titular y debajo va `.row-data` con **los mismos datos que las
columnas** —años, plataformas, géneros, fuertes, débiles/motivos— y, al final de la línea, la insignia de
rejugar y la nota. En pantalla estrecha se sigue pintando el meta compacto de siempre (`.row-meta`), que es el
único que cabe; la elección se hace en JS (`wideRow`) para no pintar los dos.

**Forma caja.** Mosaico en rejilla. Cada fila de la rejilla es **una fila de tabla** (`tr.grid-row`) con una
celda `colSpan` que contiene las cajas: así el virtualizador sigue midiendo filas de verdad. `GameTable`
agrupa los juegos de N en N, con N calculado midiendo el contenedor (`GRID_CARD_MIN_PX`, que debe coincidir
con el `minmax` de `.game-grid`). El detalle abierto se inserta tras la fila que contiene la caja pulsada.

**El conmutador** (dos iconos nuevos en el sprite: `view-list`, `view-grid`) vive en la barra de filtros y no
recibe props: lee el store.

**El orden**, que antes lo llevaban las cabeceras de columna, pasa a un control con palabras dentro del
listado (`.list-sort`): desplegable de columna + botón de sentido.

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

- Vestido propio por tema: hoy las dos formas usan superficies y chips de la paleta, sin nada específico de
  cada skin. «Cámara de pruebas» era el tema de prueba.
- Las otras tres pestañas (Abandonados, En curso, Próximos) solo se han mirado de pasada.
- Tests: la preferencia (unit) y un recorrido (e2e) con biblioteca grande que compruebe que en mosaico no se
  pintan más cajas por fila de las que caben y que la virtualización sigue midiendo filas.
- Decidir si el conmutador va también en /cuenta → Apariencia (hoy solo en la barra).
- El detalle en mosaico funciona, pero no se ha probado con teclado.

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
