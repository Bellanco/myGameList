# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows the git tags.

## [Unreleased]

### Added
- **Cinco bloques nuevos en el panel «Perfil»**, todos derivados de lo que ya está en memoria (misma pasada
  única de `computeStats`, sin campos nuevos y sin una consulta de red):
  - **Cómo cambia tu gusto** — un *bump chart* con el puesto de cada género año a año. Era la única pregunta que
    el panel no respondía: todo lo demás retrata la biblioteca de HOY, y esto cuenta que el gusto se mueve. El eje
    es el PUESTO y no la cantidad, porque comparar cosechas desiguales —veinticuatro juegos un año, siete al
    siguiente— haría parecer un desplome de todos los géneros a la vez lo que solo fue un año flojo. Cada punto
    acumula tres años (con uno suelto, el puesto lo mueve un único título) y los años cuya ventana no reúne cinco
    juegos no se dibujan, en vez de sacar un ranking del azar de una temporada. Compiten **siete** géneros, los
    suficientes para que aparezcan los que entran y salen, con **un color cada uno** de la rampa del tema (la
    misma del rosetón y del hexágono, así que cada paleta los tiñe con su identidad sin una regla por tema).
  - Y los que se caen de la tabla tienen **su propia banda al pie**, rotulada y separada, a la que baja la línea
    el año en que el género no tiene ni un juego. Dibujarle un puesto mentiría —no estaba— y partir la línea
    perdía el recorrido: desaparecía sin decir a dónde. Es el mismo criterio con el que el gráfico anual manda
    los completados sin año a un chip propio en vez de inventarles uno. Ese tramo va **discontinuo y sin curva**
    (recto y sólido se leía como un puesto sostenido, que es justo lo contrario), el punto en la banda es hueco,
    y el recorrido («sube del 5.º al 1.º») se mide entre el primer año en que aparece y el último.
  - Los **nombres van solo a la derecha**: a la izquierda repetían los mismos siete rótulos, doblaban el ruido de
    una figura que ya tiene siete trazos cruzándose y se apilaban ilegibles cuando varios géneros compartían la
    banda del pie. Ese margen lo ocupa ahora el rótulo de la banda. Y el suavizado **acota sus tiradores** al
    tramo: sin eso, tras varios años en el mismo puesto la curva se pasaba de largo al saltar y dibujaba una
    panza que insinuaba un puesto por el que nunca se pasó.
  - **Cuánto vuelves y cuánto exiges**, como cifras destacadas de la cabecera, con el mismo tamaño y diseño que
    las que ya había: «volverías a jugar el 52%» (con su barra, porque es una parte de un todo) y «tu exigencia,
    ±0,9★». Empezaron siendo dos tarjetas con gráfico propio, pero decían en media pantalla lo que cabe en una
    cifra, y el panel ya tiene bastantes formas. Las dos llevan su barra al pie, como las demás cifras que son
    parte de un todo. La de la exigencia no es una barra de progreso, sino la **zona sobre la escala completa con
    tu media marcada en su centro**: esa cifra no dice «cuánto de un todo» sino «dónde, y alrededor de qué», y una
    barra que crece desde cero no puede decir ni dónde empieza la zona ni qué la ordena. El signo va pegado al
    número: una desviación sin él se lee como una nota, que es justo lo que no es.
  - **Tu constancia** — un mapa de calor donde cada cuadro es una **semana, no un día**: una lista de juegos no
    se toca a diario, así que el mapa diario clásico saldría casi entero en blanco y haría parecer inactivo a
    quien lleva años cuidando su biblioteca. Cuenta solo fechas que la app registra sola (`enteredAt`,
    `reviewedAt`), nunca `_ts` —que lo sella en bloque una importación y enseñaría una única semana frenética—.
    Cuatro niveles de intensidad discretos y no una rampa continua, porque lo que se lee aquí es el patrón (dónde
    hay racha y dónde hueco). La serie tiene **cota dura de dos años**: incluye las semanas vacías —son el dato,
    una racha se ve porque a su lado hay blancos—, así que sin tope crecería con la antigüedad de la biblioteca y
    quien lleve diez años apuntando arrastraría más de quinientos puntos en cada recálculo para enseñar los
    últimos cincuenta y dos. Es un bloque **solo propio**: esas fechas son privadas y no viajan por el canal
    social.
  - **A cuáles vuelves** — el reparto de los completados entre los que ya has rejugado, los que te apetece
    repetir y los de una sola vez. Volver a un juego es el desempate que el panel ya usaba en su ranking, y ese
    dato no se enseñaba en ninguna parte: `replayable` solo lo miraba la ruleta. Haber vuelto es un hecho y
    querer volver una intención, así que van en tramos distintos y un juego ya rejugado no cuenta además como
    intención (si no, el reparto pasaría del 100%).
  - **Tu exigencia** — la desviación típica de tus notas sobre la escala completa, con tu zona habitual
    iluminada y la media marcada. La media sola no distingue a quien pone un 70 a todo de quien reparte 30 y 95,
    y son dos formas opuestas de valorar; lo que las separa es la anchura de esa zona. Comparte forma con «A
    cuáles vuelves» a propósito: las dos responden a cómo se reparte un todo, y usar el mismo lenguaje visual
    hace que el panel se lea como una pantalla y no como una colección de gráficos sueltos. El número va con su
    lectura en palabras, porque un «±18,4» no le dice nada a nadie hasta que se traduce.
  - **La distribución de notas pasa a ocupar el ancho completo** y dobla su altura: a lo ancho y con poco alto,
    los puntos de un mismo tramo se apilaban en una columna larga y fina. Su fondo deja de usar el semáforo
    rojo→verde de las notas —competía con el color de los propios puntos, que ya llevan la nota— y pasa a la
    rampa del tema, muy diluida y con un borde de la paleta: lo justo para orientar hacia dónde crece la escala,
    y teñido por cada skin sin una regla por tema.
  - Se descartó un *ridgeline* del reparto de notas por año: el panel ya tiene tres formas hablando de notas —el
    enjambre, la tira del gráfico anual y la cifra de exigencia— y esa era la cuarta. Estaba terminado y probado,
    así que si algún día se quiere recuperar, vive en el commit `b24da5a` (`GradeRidge.tsx`).
  - **Una sola escala por pieza**: si la cuenta puntúa sobre 100, el eje, la media y la frase de tendencia van en
    puntos; si puntúa con estrellas, las tres en estrellas. Y los nombres largos de género (`Estrategia en tiempo
    real`) caben enteros en la evolución del gusto: el espacio de los rótulos se calcula con el más largo en vez
    de fijarse, que era lo que los cortaba a media palabra.
  - «Volverías a jugar» no se monta en un perfil ajeno sin datos completos: suma los ya rejugados y los marcados
    como «rejugar», y esa marca es privada, así que con la proyección pública el porcentaje contaría solo la mitad
    y se leería como el total.
  - En un perfil ajeno, la evolución del gusto entra ya en **bronce** (es el mismo retrato contado en el tiempo,
    y sale de `genres` y `years`, que el canal social ya publica); las dos piezas de notas llegan con **plata**;
    la rejugabilidad se queda en administración, porque `replayable` es privado.
- **Sellos automáticos de la vida de un juego (`enteredAt`, `gradedAt`)**: cuándo entró en cada lista y cuándo
  cambió su nota. **Nadie los teclea** —el formulario no crece ni un campo—: los escribe la propia transición,
  por los tres caminos que puede tomar un juego (el formulario, el movimiento directo de la ruleta y el alta
  desde el perfil de otra persona). Es lo que `listedAt` no podía ser: esa fecha marca la llegada a la lista
  **actual** y se reescribe al mover el juego, así que al terminar algo se borraba la fecha en que se añadió a
  Próximos, y con ella la única respuesta a *cuánto tiempo llevaba esperando* —la pregunta central de una lista
  de pendientes—. Cada lista tiene ahora su marca y ninguna pisa a la anterior.
  - Es la **PRIMERA** entrada a cada lista, a propósito: un valor que no se reescribe no ensucia el merge y hace
    que dos dispositivos converjan al mismo número. Volver a una lista de la que se salió (una rejugada) ya lo
    cuenta `years`, que es multivalor justo para eso.
  - **Aditivos y opcionales**, como `reviewedAt`: un cliente antiguo que lea el gist los ignora. Y como el merge
    es LWW del objeto de juego entero, uno que **escriba** puede borrarlos; por eso `normalizeGame` vuelve a
    sembrar el sello de la lista actual desde `listedAt` en cada carga y el dato se **auto-repara**. Lo único que
    no vuelve es el paso por listas anteriores, que no se inventa.
  - Esa misma siembra es la migración: quien actualice no estrena la versión con el historial vacío. Con dos
    fuentes excluidas a propósito, y por el mismo motivo: **`years`**, porque de ahí solo sale el año y un sello
    con día y hora fabricados se leería como exacto en un calendario; y las **fechas selladas en bloque** —las
    que comparten ocho juegos o más al milisegundo, imposible a mano y típico de una importación—, que no son la
    llegada de nada. En una biblioteca importada, sembrar de ahí diría que las doscientas partidas entraron el
    mismo día. En ambos casos se deja el hueco: un dato ausente la vista lo enseña como ausente, mientras que uno
    inventado se lee como bueno. La exclusión solo frena la siembra; un sello que la app vio ocurrir no se
    descarta nunca.
  - **Privados por las dos puertas**: ni el canal social los publica (entran en `SOCIAL_PRIVATE_FIELDS`, y sobre
    esa denylist hay además una allowlist estricta que rechaza cualquier campo extra), ni el gist de LISTADOS los
    deja pasar —una amistad lo baja para ver tu perfil, y ahí los juegos van completos—: se descartan en la
    LECTURA del gist ajeno, antes de que la caché de perfiles los guarde en el aparato de quien mira, y el filtro
    de visibilidad los vuelve a quitar después como red de seguridad, para cualquier rango y sin ajuste que los
    rescate. Un registro
    de cuándo mueves cada juego describe tus **hábitos** —a qué horas usas la app, qué días juegas—, y eso es más
    de lo que nadie consiente al compartir una lista. Lo temporal que se publica sigue siendo `years`.
  - **Restaurar un respaldo no se los lleva por delante**: un fichero exportado por esta app los trae y manda él,
    pero uno anterior a los sellos —o de otra herramienta— no puede aportarlos, así que tampoco tiene por qué
    borrarlos. La importación conserva los que ya hubiera aquí y solo rellena huecos. La fusión con un juego que
    ya está en la biblioteca nunca los tocó: aporta un parche de campos del juego, no el juego entero.
  - Coste medido sobre una biblioteca real de 228 juegos: **228 bytes** en el gist ya comprimido (un byte por
    juego). En plano son 4,5 KB, pero gzip deduplica los nombres de campo repetidos y se los come casi enteros.

### Security
- **App Check (reCAPTCHA v3) contra el abuso de la cuota de Firebase.** La clave web es pública por diseño, así
  que cualquier autenticado podía recorrer el directorio de perfiles o inundar de peticiones de amistad desde
  fuera de la app. Se inicializa **solo cuando hay sesión de Google** (al iniciarla o al restaurarla), nunca en
  el arranque: hacerlo en el arranque habría cargado un script de Google en cada visita anónima y habría vuelto
  falsa la promesa de la política de cookies. Todo el proveedor vive en un único módulo desmontable
  (`appCheckRepository`) y se apaga vaciando `VITE_RECAPTCHA_SITE_KEY`, sin tocar código. Queda **registrado
  pero sin aplicar** hasta que las métricas confirmen que los tokens se verifican.
- **Validación de esquema del gist de JUEGOS** (Zod, en carga diferida como el social). Al escribir falla
  cerrado, pero **solo por tipos** y después de normalizar: un campo aditivo nuevo no puede dejar a nadie sin
  sincronizar, y un remoto con tipos sucios se sanea en vez de bloquear. Al leer solo diagnostica: descartar
  entradas ante un esquema demasiado estrecho se llevaría juegos buenos, y en un dispositivo recién instalado no
  habría copia local con la que recuperarlos.

### Fixed
- **Contraste insuficiente en la pestaña ACTIVA del selector de periodo** en dos paletas: el blanco sobre el rojo
  de Persona en oscuro se quedaba en 3,81:1 y el marrón sobre el ámbar de Portal en claro, en 4,01:1 —ambos bajo
  el 4,5 que exige la AA, y es el rótulo que dice qué pestaña está abierta—. Se corrige oscureciendo y aclarando
  el fondo un punto, sin salirse de la gama de cada tema. Lo destapó la auditoría de accesibilidad al extenderse
  al panel: hasta ahora solo recorría la lista.
- **Mover un juego de lista estrenaba la fecha de su reseña.** `reviewedAt` existe para no depender de `_ts`
  —que lo mueve cualquier edición— y su contrato es que solo la toca un cambio del **texto**: ni la nota, ni un
  cambio de lista, ni una importación. Pero al guardar se buscaba el estado anterior **solo en la lista de
  destino**, así que en una migración no había con qué comparar, el texto previo se leía como vacío y la reseña
  se re-fechaba en cada movimiento. Al pasar a Completados algo reseñado hace años, el feed y la pestaña de
  reseñas lo anunciaban como recién escrito.
- **Insignias mudas para un lector de pantalla.** "Rejugar" y "Otra oportunidad" eran un `<span>` con
  `aria-label`; un span sin rol es `generic` y ARIA prohíbe nombrarlo, así que la etiqueta se descartaba y esas
  celdas no anunciaban nada. Lo destapó la auditoría con axe sobre el render, que es lo único que puede verlo:
  el linter lee JSX estático y el rol resulta al pintar.
- **Contraste insuficiente en la pestaña inactiva** en cinco de las seis paletas oscuras (entre 4,00 y 4,28
  sobre el 4,5 que exige la AA). Corregido subiendo solo la luminosidad de `--text-dim`, con el tono y la
  saturación de cada identidad intactos; `seaofstars` ya cumplía.
- **Los años de un juego se muestran del más reciente al más antiguo.** Con más de tres, el truncado de la fila
  dejaba ver los tres más viejos justo cuando lo interesante es el último.

### Performance
- **La copia en `localStorage` sale del hilo crítico.** Se escribía la biblioteca entera —`JSON.stringify` más
  `setItem`, ambos síncronos— en cada edición y en cada persistencia del ciclo de sync. Ahora IndexedDB se
  escribe inmediato y la copia de `localStorage` se aplaza a un hueco ocioso, fundiendo las ráfagas en una sola
  escritura. Con volcado síncrono en `pagehide`/`visibilitychange` para no perder la última edición, y los
  lectores servidos desde memoria mientras está pendiente, así que el aplazamiento es invisible y **la
  precedencia de arranque entre almacenes no cambia**. Además, un fallo de cuota ya no se traga en silencio.

### Tests
- **Auditoría de accesibilidad sobre el render** (`@axe-core/playwright`): 6 paletas × 2 temas sobre la lista
  con una fila desplegada **y sobre el panel de estadísticas**, que es donde está el color propio de la app
  —rampas de nota, mapas de calor, bandas— y donde hay controles dentro de SVG. Con una biblioteca amplia,
  porque con tres juegos casi todos sus bloques enseñan su estado vacío y auditar una pantalla vacía no audita
  nada. De 1 a 27 recorridos end-to-end.
- Pruebas del esquema del gist de juegos, del módulo de App Check y de la escritura diferida del estado local.
- **Sellos automáticos**: 25 pruebas entre las funciones puras (un sello no se reescribe, la nota no se re-fecha
  al reescribir la reseña) y el recorrido real de un juego por las listas sobre el view-model, más el round-trip
  por el gist —escribir v4 comprimido, leer y normalizar— y la garantía de que no salen por el canal social.

### Changed
- **Un solo panel de estadísticas para tu perfil y para el de otra persona.** Había dos pantallas montando las
  mismas piezas (`StatsHub` y `FriendStats`), y la ajena se quedaba atrás en todo lo que no fuera el cálculo: sin
  subtítulos, con el resumen de año reescrito a mano —sin el ranking de plataformas ni el listado completo— y
  hablando en segunda persona de la biblioteca de otro («Lo mejor de **tu** biblioteca» en el perfil de un
  amigo). Ahora las dos son envolturas de `StatsPanel` con tres ejes de variación: qué bloques deja ver tu rango,
  con qué datos se calcula y **de quién se habla** (los textos con voz tienen su versión en tercera persona, con
  los guiños intactos, y viajan por contexto porque viven dentro de las piezas). Las reglas de rango y de
  reciprocidad no cambian: bronce sigue en los cuatro bloques de retrato, plata y oro suman notas y ratio, y lo
  que escondes de tus listas sigue sin verse de las ajenas.
- **La administración ve de sus amistades lo mismo que ve de sí misma.** El panel de un amigo se calculaba
  siempre con la proyección pública, aunque el hub ya tuviera en memoria los juegos completos de su gist de
  listados. Para mithril pasa a usarlos: horas, evolución del backlog, razones de abandono y su lista de próximos
  con las fechas. Y las ocultaciones de su dueño dejan de aplicarle —las listas escondidas y las marcas de
  «rejugable» y «merece otra oportunidad»—, **salvo el tiempo de juego**, que se respeta frente a todo el mundo.
  Queda declarado en la política de privacidad, en un párrafo escrito en tono tranquilo (es un dato, no una
  advertencia), y por eso sube `LEGAL_VERSION`: la puerta del hub vuelve a pedir la conformidad. Para el resto de rangos no cambia nada: el rango dice a qué datos hay derecho, y tener el dato
  cargado no autoriza a pintarlo. Sus **reseñas** siguen fuera del panel en todos los casos (tienen su propio
  apartado en el perfil), y si el gist de listados no llegó, ni la administración pinta el panel completo: se
  queda en la proyección pública en vez de enseñar ceros.
- **Las figuras del panel se pueden tocar, todas con el mismo gesto.** Eran estampas con, como mucho, un `title` del
  sistema: tarda un segundo en salir y en una pantalla táctil no existe. Ahora se señalan con el ratón, con el dedo o
  con el tabulador, la parte señalada manda, las demás se apartan y un pie cuenta **lo que el dibujo no puede
  pintar**. Una pieza por figura, y en cada una lo que faltaba:
  - **Dónde los juegas** (anillo): el centro pasa a contar la parte señalada en vez del total, y la leyenda son
    botones de verdad. El radio se calcula con el grosor ampliado, que es lo que hacía que el anillo apareciera
    cortado justo en el segmento que se estaba mirando.
  - **Tus mejores géneros** (rosetón abierto): la porción se abre más y el pie da su parte exacta, «Acción · 6
    juegos · 40%» — los radios comparan bien entre ellos, pero nadie mide a ojo una fracción.
  - **Tus géneros** (hexágono): el radio del eje se enciende y el pie suelta la afinidad, los juegos y la nota
    media, que **solo existían en el `aria-label`**: quien veía la figura tenía la forma y ningún número.
  - **Géneros más jugados** (rosetón polar): añade las **horas** del grupo, que el radio no cuenta.
  - **Completados y abandonados**: los dos contadores son botones y al señalarlos dicen su **porcentaje**, el puente
    que faltaba entre las dos cifras y el dial grande.
  - **Dónde brillas**, **Plataformas** (matriz de puntos): la fila se aísla de las demás, que es lo que permite
    leerla contra la guía de la media sin cinco barras al lado compitiendo.
  - **Distribución de notas** y **Cuándo llegó cada uno**: el punto señalado dice de qué juego es. Estos dos NO
    entran en el recorrido del teclado —hay un punto por juego, serían cientos—; su dato tiene su salida en la tabla
    y en la lista de cada bloque.

  El gesto vive en un solo sitio (`useChartFocus` + `ChartDetail`), no repetido ocho veces. Un toque **fija** la
  selección, para las pantallas donde no existe «pasar por encima»: señalado y fijado son estados distintos, porque
  en táctil el toque llega después de su propio `pointerenter` y con uno solo el gesto se leía como «suéltala».
  `aria-pressed` cuenta lo fijado, no lo que persigue el ratón, y las figuras con controles dentro pasan de
  `role="img"` a `role="group"` (con `img`, un lector de pantalla se salta el contenido).
- **La evolución del backlog se apila en el orden del recorrido**: próximos al ras del eje, encima en curso, luego
  abandonados y completados coronando el área. Con los completados abajo, lo que más crece empujaba a todo lo demás
  hacia arriba y la banda de próximos flotaba en lo alto sin apoyarse en nada. La leyenda y la tabla no se invierten:
  siguen en el orden canónico de la app, que es el de las bandas leídas de arriba abajo.
- **El linter ya vigila lo que más caro ha salido.** `eslint-plugin-react-hooks` (`rules-of-hooks` no encontró
  ni un error; quedan 14 avisos de `exhaustive-deps` por revisar) y cuatro reglas **tipadas** sobre `model` y
  `viewmodel`: `no-floating-promises`, `no-misused-promises`, `await-thenable` y `require-await`. Destaparon 12
  promesas sueltas, todas de `navigate()`, que en react-router 7 devuelve promesa.
- **Node 22 en CI y en `engines`**: la 20 salió de soporte en abril de 2026, así que el CI corría sobre un
  runtime sin parches. Es además el mínimo de html-validate 11.
- Once dependencias al día dentro de rango, más jest-dom 7 y html-validate 11. **TypeScript 7 y ESLint 10 se
  quedan fuera a propósito**: `@typescript-eslint` exige `typescript <6.1.0`, y `eslint-plugin-react`/`jsx-a11y`
  aún no aceptan ESLint 10. Subirlos rompería el análisis tipado recién puesto.
- **La pestaña "Perfil" pasa a llamarse "Estadísticas"** y se mueve a la derecha del todo. La ruta sigue siendo
  `/perfil`.
- Red de seguridad en `pre-push` (tipos, linter y pruebas) versionada en `.githooks/`, activada sola con
  `npm install`. Prettier queda configurado pero **sin aplicar**: el barrido tocaría 168 de 294 ficheros y
  merece su propio commit.

### Added
- **Panel "Perfil" (`/perfil`), nueva pestaña de la barra inferior**: la biblioteca en números —juegos, horas,
  nota media y partida más larga, año a año (con conmutador juegos/horas), distribución de notas, ratio de
  completados frente a abandonados y géneros más jugados. Todo es **derivado y de solo lectura**: se calcula en
  el dispositivo a partir de las listas que ya están en memoria (`core/stats/computeStats`, una única pasada
  O(n) memoizada), sin campos nuevos en `GameItem`, sin escribir en el gist y sin publicar nada al canal social.
  El hub y su hoja de estilos entran por `lazy()`, así que no pesan en el arranque.
  - Reglas que fija el cálculo: "Próximos" no cuenta como jugado (ni horas, ni géneros, ni su nota, que ahí es
    el **interés** previo y no una valoración); "En curso" no puntúa; las horas de un juego completado varias
    veces cuentan enteras en el **último** año (repartirlas inventaría un dato que nadie registró); los
    completados sin año van a un cajón propio en vez de desaparecer del gráfico.
  - Accesibilidad: los gráficos densos exponen sus datos en una tabla `sr-only` en vez de en una etiqueta
    kilométrica, y el aro de completados se anuncia con su reparto.
- **Registro del histórico del backlog**: una instantánea mensual con el tamaño de cada lista, guardada en el
  meta local de IndexedDB. Entra ya, sin pantalla que la pinte, porque es lo único de este trabajo que **no se
  puede recuperar a posteriori**: `listedAt` se reescribe al mover un juego de lista, así que la serie solo
  puede construirse hacia delante y cada mes sin registrar es un punto perdido para siempre. Local y por
  dispositivo (no sube al gist ni a Firestore), en idle, un punto por mes que se actualiza al último estado
  observado, con tope de 120 meses. No estampa una biblioteca vacía: al arrancar podría no estar hidratada aún.
  - El **gráfico** de evolución ya está: mientras la serie no tenga dos puntos, la tarjeta enseña la curva
    derivada de `listedAt` (y lo dice al pie); en cuanto los tiene, el histórico real la sustituye solo.
- **El panel se reparte en "General" y una pestaña por año.** Los años los pone el contenido —solo aquellos en
  los que completaste algo—, así que nunca se ofrece una pestaña que lleve a una pantalla vacía. Cada año
  resume sus completados: cifras, figura de géneros, distribución de notas, plataformas y el listado completo
  ordenado por nota. Los abandonados y los próximos **no llevan año** (el formulario solo pide "Años
  completado" en completados), así que viven en "General".
- **Figura de géneros al estilo del "Resumen del año" de Steam**: un hexágono con tus seis géneros principales,
  en SVG a mano (treinta líneas de trigonometría, cero dependencias). Con menos de tres géneros no hay figura
  posible y cae al ranking en texto en vez de dibujar un segmento.
- **Apartado de la lista de la vergüenza**: horas invertidas, nota media, cuántos merecen otra oportunidad, el
  **desenlace por género** —solo con géneros que tengan al menos tres juegos ya decididos, porque un 100% sobre
  uno no dice nada—, las razones de abandono más repetidas (el campo `reasons`, que solo existe en esa lista) y
  los últimos en caer.
- **Apartado de la lista de próximos**: cuántos son, el interés medio (que NO se mezcla con las valoraciones:
  en esa lista el campo es el interés previo), los compatibles con Deck, los géneros y plataformas que más
  esperas y **cuándo llegó cada uno**.
- **Gráficos rediseñados**: color semántico fijo por lista en todo el panel (completados verde, abandonados
  rojo, en curso ámbar, próximos acento), degradados y curvas de entrada suaves, cebra en los listados largos y
  rejilla propia. Todo con las variables de la paleta activa, así que funciona en los cinco temas y en claro y
  oscuro sin una sola regla por tema; las animaciones se apagan con `prefers-reduced-motion`.
- **Cada gráfico usa la forma que le corresponde**, en vez de repetir barras horizontales por todo el panel:
  - **Enjambre de puntos** para la distribución de notas: un punto por juego sobre el eje 0–100, con la media
    marcada. Enseña dónde se agolpan las notas, qué huecos hay y qué juegos se salen —cosas que cinco columnas
    de un histograma esconden—. Los puntos crecen si hay pocos y encogen a partir de 120.
  - **Rosetón polar** para el reparto de géneros. El radio va con la raíz cuadrada del valor, no con el valor:
    el área de un sector crece con el cuadrado del radio, así que a escala lineal la figura exageraría las
    diferencias.
  - **Mancuernas** para el desenlace por género: dos puntos unidos —terminados y dejados— sobre un eje común.
    Dice a la vez el volumen y la proporción, y sustituye a los dos gráficos que hacían falta antes.
  - **Línea de tiempo** para la lista de próximos: un punto por juego en su fecha de alta. Reemplaza a "los que
    más llevan esperando" y a "los últimos en llegar", y además enseña las rachas y los parones.
  - **Tarta** para completados frente a abandonados: dos categorías que suman el total, que es de las pocas
    veces en que una tarta es la forma correcta. Las porciones se separan al pasar el ratón y el color sale de
    los tokens de la paleta, así que se adapta sola a cada tema.
  - **Nube de etiquetas** para las razones de abandono y **ranking en texto** (puesto, etiqueta y cifra) para
    las plataformas, donde una barra no añadía nada al número.
  - Se mantienen el hexágono, el aro, el área acumulada y las columnas del gráfico anual.
  - Las formas que necesitan un mínimo de datos caen a un ranking en texto cuando no lo tienen: el hexágono por
    debajo de tres ejes y el rosetón por debajo de tres sectores (dos mitades no son una figura).
  - El enjambre lleva además **silueta de densidad** detrás, las guías de **media y mediana** y el nombre de
    los dos extremos: con la biblioteca entera los puntos se tocan y la silueta es lo único que sigue diciendo
    dónde está el grueso. Su reparto por tramo va también en la tabla alternativa, para que el dato exacto
    nunca dependa solo de pasar el ratón.
  - Completados frente a abandonados pasa a **cifra protagonista con la tarta de apoyo**: con dos categorías el
    número ES el gráfico, y los porcentajes salen de dentro de las porciones, donde repetían esa misma cifra y
    en un reparto desigual no cabían sin recortarse.
  - Repaso a los detalles de trazado: rejillas y ejes en hairline **sólida** (una rejilla punteada se lee como
    umbral, no como rejilla), rellenos de área más velados, separación de 2 px entre porciones, cifras
    proporcionales en las tarjetas destacadas (los dígitos de ancho fijo son para columnas que se alinean) y
    diana de 24 px alrededor de cada punto, que señalar un círculo de nueve píxeles era imposible.
  - **Barras radiales en media luna, con el nombre escrito sobre cada anillo**, para los géneros de tus
    mejores: es la variación del rosetón —misma familia circular, lectura distinta— y no sufre su problema con
    pocos valores, que es que tres sectores se ven como una tarta rota. El rótulo curvado resuelve lo único que
    fallaba: en unos anillos de colores parecidos la identidad dependía de casar color con leyenda, y así no hay
    nada que casar. Va dentro del arco cuando cabe y pasada la punta cuando no, siempre centrado en la parte
    alta del semicírculo, que es donde el texto queda derecho —con una vuelta de tres cuartos se leía cabeza
    abajo al cruzar la mitad inferior—. Y una guía a media vuelta, porque sin referencia común dos arcos de
    radios distintos con el mismo ángulo parecen medir cosas distintas.
  - **Anillo repartido con el total en el centro** para saber dónde juegas tus favoritos: compara cada
    plataforma con el todo y deja el hueco central para la cifra que da contexto.
  - **Piruletas** para tu nota media por género, con el carril completo, la guía de tu media global y la
    diferencia contra ella: un "84" no dice si es mucho o poco PARA TI; un "+6 sobre tu media", sí. La escala
    llega a la nota máxima en vez de recortarse al rango de los datos, que convertiría cuatro medias parecidas
    en diferencias abismales.
  - **Matriz de puntos** para las plataformas de tu lista de próximos: un recuento que se cuenta con el dedo y
    funciona igual con tres juegos que con cuarenta.
  - El resto del top pasa a **fichas en rejilla**: doce filas ocupaban media pantalla para decir lo mismo.
  - Los rótulos largos de las figuras circulares se parten en **dos líneas** por el espacio más equilibrado en
    vez de recortarse: "Aventura gráfica" perdía justo la parte que la distinguía de "Aventura".
- **"Lo mejor de tu biblioteca", en general y en cada año**: el podio de tus tres primeros, el resto del top
  hasta quince títulos y —lo que ninguna lista de favoritos cuenta— **en qué se parecen esos mismos quince**:
  qué géneros se repiten, dónde los juegas, cuánto duran de media y qué nota hace de listón para entrar. La
  muestra del agregado y la lista son el mismo conjunto a propósito: si la pantalla enseña quince títulos, los
  géneros y las plataformas tienen que ser los de esos quince y no los de un subconjunto que nadie ve. Puesto al
  lado del reparto general responde a una pregunta que ninguno de los dos contesta solo: si lo que más te gusta
  es lo que más juegas. Incluye **"dónde brillas"**: tu nota media por género, que no siempre coincide con el
  género que más juegas.
  - El puesto lo desempatan las **rejugadas**: entre dos notas iguales sube el que volviste a jugar, porque
    volver a un juego es el voto más sincero que existe. La marca «×2» lo dice en el listado.
- **Guiños a frases icónicas del videojuego** en los textos del panel, empezando por los juegos que dan nombre
  a los temas de la app: la tarta que no es mentira (Portal), despertar samurái (Cyberpunk 2077), los que te
  robaron el corazón (Persona 5), la flecha en la rodilla de la lista de la vergüenza (Skyrim), la princesa que
  está en otro castillo (Super Mario Bros.), lo peligroso de ir solo (Zelda) y terminar esta pelea (Halo).
- **Cada tema viste el panel con su propio lenguaje.** Las tarjetas entran en la receta de tarjeta que ya tenía
  cada skin (tinta de cómic en Corazón rebelde, filo naranja en Cámara de pruebas, marco cian y filete amarillo
  en Sin futuro, moldura dorada en Solo hay guerra, marco doble pixelado en Mar de estrellas), y cada uno añade
  su firma: cifras en cursiva pop, monoespaciada de terminal, neón con scanlines, fósforo verde con VT323 o
  puntos cuadrados sobre un campo de estrellas.
- **Los repartos usan la DUALIDAD de color de cada tema.** El rosetón y el hexágono recorren una rampa entre dos
  tonos de la paleta —los dos portales, rojo y oro, amarillo y magenta, fósforo y oro, agua y noche— en vez de
  ser un degradado de un solo color. La interpolación va en OKLCH y no en un espacio rectangular: mezclando dos
  tonos opuestos, el camino recto atraviesa el gris y los sectores centrales salían apagados.
- **Los gráficos responden al ratón**: sectores que se avivan, puntos que crecen, filas que se resaltan y
  tarjetas de cifra que se elevan. Es lo que invita a explorarlos y a descubrir que llevan el dato exacto en el
  `title`.
- **Los ejes de tiempo se adaptan al periodo.** La escala la elige el propio recorrido de los datos (días,
  quincenas, meses o años salteados), así que el dibujo ocupa el ancho tanto si han pasado tres meses como si
  han pasado trece años. Antes un eje fijo en años dejaba los periodos cortos sin una sola referencia.
- **Efectos de entrada**: el hexágono crece desde el centro, las columnas y barras se despliegan en cascada, el
  aro se rellena girando y las cifras cuentan hacia arriba. Todo se apaga con `prefers-reduced-motion` (y el
  conteo ni siquiera se calcula).
  - Las tarjetas se destapan **al llegar a ellas**, no todas al montar: el panel es más alto que la pantalla y
    media se "cargaba" sin que nadie la viera. Sus gráficos esperan con ellas, en pausa al 0%. La marca que lo
    activa la pone el JavaScript, así que sin él —o con menos movimiento pedido— todo queda visible desde el
    primer pintado, y un barrido por posición destapa lo que un salto de scroll (la tecla Fin, un ancla, la
    posición restaurada al recargar) haga cruzar la pantalla entre dos fotogramas sin que el observador lo vea.
- **Las horas salen de los rankings de etiquetas.** La columna de la derecha cambiaba de ancho fila a fila
  ("9" frente a "9 · 677 h") y descolocaba las barras. Las horas siguen donde de verdad se leen: las cifras
  destacadas y el gráfico anual.

### Fixed
- **La evolución del backlog dibujaba altas por mes, no una evolución.** Los ingresos mensuales de una
  biblioteca real son números pequeños y erráticos, así que el área salía como una sierra ilegible. Ahora la
  serie es **acumulada**: describe cómo ha ido creciendo cada lista y termina en el tamaño de hoy. Además el
  lienzo se estira y los ejes son HTML por fuera —con todo dentro del SVG, estirarlo agrandaba los años y
  engordaba los trazos—, y con pocos meses no se suaviza la curva y se marcan los puntos, para que tres datos
  parezcan tres datos y no una curva inventada.
- **La tabla alternativa de los gráficos añadía miles de píxeles de scroll invisible.** `.sr-only` no oculta
  una `<table>`: en una tabla `height` es un MÍNIMO y `overflow` no la recorta. Con una serie larga (156 meses)
  la página crecía de 3.700 a 9.400 px. Ahora la tabla va envuelta en un `div.sr-only`.
- **"El mejor del año" mostraba las horas del juego más largo**, que casi nunca es el mismo. Ahora enseña las
  suyas, y el más largo del año tiene su propia tarjeta cuando no coinciden.
- **El índice de abandono dejaba media tarjeta vacía**: la barra se acotaba a un ancho máximo y el resto de la
  fila quedaba en blanco. Las mancuernas ocupan el ancho completo.
- **Las mancuernas podían salirse de la pantalla y forzar scroll horizontal**: los porcentajes de un hijo
  absoluto se resuelven contra la caja de relleno, así que el padding del carril no apartaba los extremos. El
  margen lo pone ahora el cálculo de posiciones.
- **La línea de tiempo amontonaba los juegos que entraron el mismo día** (lo típico tras una importación):
  repartía por el índice, no por choque. Ahora cada punto sube o baja hasta encontrar hueco libre.

### Performance
- **El estado de arranque de las listas se lee una vez por montaje, no en cada render.** `loadLocalState()`
  estaba en el cuerpo del hook raíz y `normalizeData()` como argumento de `useState` (no como inicializador
  perezoso), así que la biblioteca entera se releía de `localStorage`, se parseaba y se normalizaba —dos veces—
  en cada render: cada filtro, cada fila expandida, cada aviso y cada ciclo de sync. El coste era proporcional
  al número de juegos y el resultado se descartaba. Con test de regresión que cuenta lecturas.
- **Los modales dejan de descargarse en el render inicial.** `FormModal`, `ConfirmModal` y `RouletteModal` se
  declaraban `lazy` pero se renderizaban siempre (con `open={false}`), así que React arrancaba su `import()` en
  el primer render y sus chunks competían con la ruta crítica. Ahora se montan en su primera apertura y se
  precargan en idle, de modo que abrir sigue siendo instantáneo. No se desmontan al cerrar: el `<dialog>` tiene
  que seguir vivo para que `close()` restaure el foco (A11y-1).
- **El canal social sale del chunk de arranque.** `gistRepository` mezclaba el gist de juegos y el social en un
  único módulo de 2.171 líneas, y como el de juegos lo importa `useSyncViewModel` —estático desde App—, los
  ~54 kB de fuente del social viajaban en el arranque de todo el mundo, abriera o no el hub. Separado en
  `socialGistRepository` (+ `githubGistApi` para lo común), ahora solo lo descarga quien entra en social.

### Changed
- **Una sola tabla de rutas.** Había dos listas que mantener en sincronía: una cadena de ternarios sobre el
  `pathname` elegía la pantalla, y un `<Routes>` aparte —con todos sus `element={null}`— declaraba qué caminos
  eran válidos; olvidar una entrada en la segunda hacía que la pantalla rebotara a `/completados`, como le pasó
  a `/social/requests`. Ahora `<Routes>` se genera de `APP_ROUTES` y la sección activa sale del mismo matcher.
  Las sub-rutas del hub las cubre `/social/*`, así que **añadir una pantalla social ya no obliga a tocar App**.
- **Las sub-rutas del hub se resuelven con `matchPath`**, no con siete expresiones regulares escritas a mano.
  De paso, el descodificado de parámetros deja de poder lanzar: `decodeURIComponent('%zz')` reventaba el render
  del hub ante una URL manipulada.
- **Las cinco preferencias de apariencia** (tema, paleta, caja, efectos, botón de Steam Deck) pasan a un único
  store sobre `useSyncExternalStore`. Eran cinco hooks copiados y cinco funciones de repositorio idénticas salvo
  el nombre del campo, sincronizadas por cuatro eventos distintos de `window`. Cierra además el agujero del
  patrón anterior: la suscripción vivía en un `useEffect`, así que un cambio ocurrido entre el primer render y
  el montaje —la hidratación desde la nube— podía perderse.
- **`useSocialViewModel` baja de 2.544 a 2.257 líneas**: salen a `viewmodel/social/` el enrutado, el feed, el
  compositor de publicaciones, el consentimiento legal y el formulario de perfil. La visibilidad del perfil se
  normalizaba campo a campo en seis sitios; ahora una sola vez.
- El `target` del compilador se alinea con el del build (ES2022): comprobar contra ES2020 y emitir a ES2022
  dejaba fuera del typecheck APIs que en producción sí existen.

### Fixed
- **Un `hiddenTabs` que no fuera una lista tumbaba la hidratación del perfil social.** La comprobación era
  `hiddenTabs || []`, que da por bueno cualquier valor truthy: un `"c"` —gist editado a mano, formato antiguo—
  pasaba el filtro y reventaba en el `forEach`. Alcanzable solo por caminos que no pasan por el saneado del
  lector del gist, pero el normalizador ya no depende de que alguien haya limpiado antes.

### Tests
- Primeras pruebas del **flujo de publicación** (no tenía ninguna: los tests del hub no llegaban a
  `handlePublishPost`) y de la **normalización de visibilidad del perfil**. Entre ellas queda fijado que un fallo
  al publicar **no borra el texto escrito**.
- Nuevas pruebas del matcher de rutas sociales y de la tabla de rutas de la app.

## [3.8] - 2026-08-06

### Added
- **Panel de administración** (`/admin`, ruta oculta sin enlace en la navegación): censo de perfiles
  —incluidos los que tienen el social desactivado, que el directorio no muestra— con sus amistades, y
  acciones de moderación: suspender el social, purgar los restos legacy del perfil público (email,
  gist de juegos y token en claro) y borrar perfil + amistades. El acceso lo concede `isAdmin()` en
  las reglas de Firestore, no el cliente. El borrado es parcial a propósito: `privateConfig`,
  `publicConfig` y `userMap` son owner-only y sobreviven, igual que la cuenta de Google y los Gists.
- **Unificación del canal social** cuando un usuario acabó con dos gists en circulación (el clonado de
  `updateGistPrivacy` dejaba uno huérfano): se decide con evidencia —cuál es legible sin autenticación y cuál
  tiene el contenido, no a dedo— y se escribe ese en su perfil y en todas sus amistades. Ejecutable desde el panel
  sin esperar al usuario, y el auto-saneado de su propio cliente usa el MISMO árbitro, así que ambos convergen al
  mismo id en vez de reescribirse mutuamente. Si el gist vivo no es el que tiene configurado el dispositivo, el
  cliente lo **adopta en su configuración local**, para que el usuario deje de publicar en el descartado. No se
  borra ningún gist, y la unificación se abstiene si el descartado es público y tiene actividad: mientras hay
  deriva el hub fusiona los dos, así que ahí solo puede resolver bien el cliente de su dueño.
- **Fecha de alta del perfil** (`createdAt`): se sella al crearlo y las reglas la declaran inmutable, así que
  ni su dueño puede reescribirla. Los perfiles anteriores no la tienen; el panel la estima con la fecha de su
  amistad más antigua y lo marca como estimación.
- **Ficha completa por usuario en el panel**, con todo lo que las reglas permiten leer (pseudónimo, gist social,
  ETag, esquema, foto, fechas y desglose de amistades) y **señales** de estado fuera de lo esperado: social
  activado sin gist, gist divergente respecto a sus amistades, fechas imposibles, restos legacy, inactividad.
- **Auto-saneado del perfil legacy al iniciar sesión**: el navegador del propio usuario respalda el token de
  GitHub cifrado y el id del gist de juegos en `privateConfig` (owner-only) y solo entonces los borra —junto al
  `email`— del perfil público. Si el respaldo falla no se purga nada y se reintenta en el siguiente arranque.
  Es el único actor que puede hacerlo: `privateConfig` no es legible ni escribible por el administrador.
- **Rango de perfil** (`tier`): bronce por defecto, plata, oro y mithril. Lo asigna el administrador
  desde el panel; las reglas impiden que el dueño se lo cambie. Mithril queda reservado a la cuenta
  del administrador. Se muestra como un punto de color en la esquina de cada tarjeta del directorio
  social, y determina cada cuánto se rehidrata el feed de QUIEN MIRA: bronce 30 min (como siempre),
  plata 15, oro 10 y mithril al abrir (con un suelo de 12 s). Las reglas impiden que el dueño se lo
  asigne, lo cambie o lo borre; solo puede conservarlo tal cual.
- El rango decide también **quién puede publicar** en el feed y con qué extensión: bronce no publica
  (el compositor no aparece), plata 1.000 caracteres, oro 10.000 y mithril sin límite. El compositor
  pasa a ser un campo de una línea que crece al saltar de línea, con el mismo contador de caracteres
  que el análisis de un juego; se publica con el botón o con Ctrl/⌘+Enter.
- **Tema claro "arena"** — paleta clara con tonos cálidos manteniendo el azul de marca.
- **Nota en el listado de la vergüenza**: la puntuación de esa lista es opt-in y solo se veía al expandir la
  fila; ahora tiene su columna, con la nota de los juegos que la tienen y nada en los que no. La columna aparece
  solo si algún juego de la lista tiene nota, para no dejar una columna vacía a quien no puntúe ahí.
- **Documentos legales** (`/legal/aviso`, `/legal/privacidad`, `/legal/cookies`) accesibles desde la
  app, con aceptación registrada por cuenta antes de activar lo social.
- **Analítica opt-in**: Google Analytics no se inicializa hasta que se acepta en el aviso, y se
  puede revocar desde Cuenta.
- **Borrado de cuenta** (RGPD art. 17): elimina perfil, amistades y configuración en la nube, y
  limpia los datos del dispositivo. Los Gists, al ser de la cuenta de GitHub del usuario, no se tocan.

### Changed
- El panel de administración pasa de tabla a rejilla de fichas: la tabla obligaba a scroll horizontal en tablet
  apaisada y era ilegible en móvil.
- El perfil público deja de publicar `email` y `social.gamesGistId`: el perfil propio se resuelve por
  uid y el gist de juegos se recupera de `privateConfig` (solo el dueño). Se purgan de los perfiles
  existentes en su siguiente guardado.
- Colores de acento centralizados en tokens `--*-rgb` theme-aware; eliminados los `rgba()` con
  valores incrustados en los partials SCSS.
- El perfil social ya no tiene juegos favoritos: desaparecen del editor, del directorio y del
  detalle, y dejan de publicarse en el gist. Para crear el perfil ahora basta con un nombre y al
  menos un juego completado.

### Security
- **La política de cookies declara las cookies de Google del inicio de sesión.** No mencionaba ninguna de
  terceros y afirmaba que el almacenamiento local era "todo lo que guarda": al iniciar sesión, Firebase Auth
  carga un script de `apis.google.com` y Google guarda cookies suyas (`_GRECAPTCHA` entre ellas) para su control
  de abuso. Se citan como ejemplo, no como lista cerrada, porque las decide Google. La entradilla pasa a afirmar
  algo más fuerte y medido —una visita sin sesión, sin sincronización y con la analítica rechazada no contacta con
  ningún servidor ajeno ni guarda cookies—, y hay un test e2e que lo vigila. `LEGAL_VERSION` no cambia: no varía
  el tratamiento ni los términos aceptados, así que nadie tiene que volver a aceptar; para eso la fecha de
  "actualizado" pasa a ser propia de cada documento.
- **Validación de tipo y tamaño del contenido del perfil público y de los campos denormalizados de
  amistad** (C7). La allowlist de claves (`hasOnly`) impedía inventarse campos, pero no decía nada de lo
  que se guarda dentro: un cliente autenticado hostil podía escribir en su propio documento —el que lee
  todo el directorio social— un `displayName` de cientos de KB o un `photoURL` con `javascript:`, y lo
  mismo en la petición de amistad que aterriza en la bandeja de otro usuario (su nombre y su foto los
  pinta el destinatario). Ahora las reglas exigen tipo, longitud máxima y `https://` en las fotos. Cada
  campo se valida solo si está presente, para no congelar los perfiles legacy (en un merge,
  `request.resource.data` es el documento resultante). El nombre público se recorta en el cliente al
  mismo límite (`PUBLIC_NAME_MAX_LENGTH`), porque el nombre de la cuenta de Google entra por el fallback
  sin pasar por ningún campo de la UI.
- **El canjeador de OAuth de GitHub deja de estar abierto**: `functions/api/github-oauth.ts` exige que el
  `Origin` y el `redirect_uri` sean de la propia app. Sin eso, cualquier página podía usar el endpoint
  —y con él nuestro `client_secret`— para canjear un `code`; como el canje es de un solo uso, gastarlo
  rompía además el flujo del usuario legítimo.

### Fixed
- **La PWA no arrancaba sin red**, a pesar de anunciarse como offline-first: el service worker precacheaba
  solo `['/', '/manifest.json']` y para `/assets/*` iba a la red sin caché ni respaldo, así que offline se
  servía el shell HTML y acto seguido fallaban todos los chunks que ese HTML referencia → pantalla en
  blanco. Ahora hay tres estrategias por tipo de recurso (HTML con red primero y respaldo cacheado,
  `/assets/*` con caché primero —son inmutables, llevan hash de contenido—, y el resto caché y revalida), y
  un plugin del build inyecta en el service worker la lista real de chunks del arranque. Los chunks
  perezosos (Firebase, hub social, panel, temas) quedan fuera del precache a propósito y se van guardando
  al visitarlos: instalación ligera y listas disponibles offline desde el primer arranque. Verificado con
  el servidor caído. `scripts/ci-validate.js` falla si el precache vuelve a quedarse vacío.
- El service worker ya no llama a `skipWaiting()`: tomar el control a la fuerza y borrar la caché anterior
  dejaba a una pestaña abierta sin los chunks del despliegue viejo, que ya no están en el servidor.
- **`__APP_VERSION__` etiquetaba mal toda la telemetría**: `package.json` seguía en `3.2.0` con cinco
  versiones publicadas por delante, así que ningún error de Analytics se podía correlacionar con su
  despliegue.
- La preferencia de efectos visuales no llegaba a sincronizarse: faltaba `effects` en la allowlist de
  las reglas de `publicConfig`, que la denegaba en silencio.
- `encrypt`/`decrypt` ya no tienen semilla por defecto derivada del navegador
  (`userAgent|language|timezoneOffset`): el `userAgent` cambia con cada actualización del navegador, así
  que cualquier dato cifrado con ella habría quedado ilegible para siempre semanas después, lejos del
  código que lo causó. Nadie usaba ese valor por defecto; ahora el secreto es obligatorio y explícito. De
  paso, el paso a base64 se hace por bloques (`String.fromCharCode(...bytes)` desborda el stack con
  entradas grandes).

### Accessibility
- **En móvil, un lector de pantalla solo oía el nombre del juego.** A ≤1400 px las celdas de datos son
  `display:none` (fuera del árbol de accesibilidad) y el meta compacto que las sustituye estaba `aria-hidden`,
  con el razonamiento de que "la info ya está en las columnas" —cierto en escritorio, falso en móvil—. Encima el
  `aria-label` del botón de fila ganaba sobre el contenido, así que exponer el meta no habría bastado. Retirada
  esa etiqueta: el nombre accesible sigue a lo que se ve en cada breakpoint, y `aria-expanded` ya anuncia el
  estado plegado/desplegado.
- **La puntuación no se anunciaba**: `StarRating` no tenía ninguna alternativa textual (se leía "★☆☆☆☆" carácter
  a carácter) y los `aria-label` de `ScoreRing`/`NoScoreMedal` iban sobre un `<span>` sin rol, donde pueden
  ignorarse. Los tres llevan `role="img"`.
- **Las cuatro pestañas de listado se anunciaban como "1", "0", "0", "0"**: su título visible se oculta en
  pantallas estrechas y solo quedaba el contador. Ahora tienen nombre explícito y `aria-current` para decir cuál
  está activa, que hasta ahora era información puramente visual.
- **Los avisos no se anunciaban**: la región viva se montaba junto con el mensaje, y una región viva solo anuncia
  lo que cambia mientras ella existe. Ahora está siempre en el DOM.
- Estructura que faltaba: un `<h1>` por pantalla (oculto visualmente, el diseño es headerless), enlace "saltar al
  contenido", `<caption>` en la tabla, `scope="col"` en las cabeceras y un `<noscript>` en vez de una página en
  blanco sin explicación.
- Fuera el bloqueo de orientación del manifest, que impedía el apaisado en la PWA instalada (WCAG 1.3.4), y las
  reglas de accesibilidad de ESLint pasan de `warn` a `error` con 14 reglas nuevas.

### Performance
- **Tipografías servidas desde el propio origen.** La hoja de Google Fonts era una petición bloqueante a un
  tercero en la ruta crítica, y con dos saltos (`fonts.googleapis.com` para el CSS y `fonts.gstatic.com` para
  el `.woff2`, cada uno con su DNS y su TLS antes de poder pedir la fuente); además transmitía la IP del
  visitante a Google en cada carga. Las 9 familias se vendorizan con `scripts/vendor-fonts.mjs` (subconjuntos
  latin/latin-ext, todas OFL), la base va precargada y precacheada —así que también hay tipografía sin red— y
  las de cada paleta siguen entrando con su skin, que ya cargaba en diferido. La **CSP deja de permitir Google**
  en `style-src` y `font-src`. Verificado en Chrome: 0 peticiones a Google con la paleta por defecto y con un
  tema activo.
- **Firestore en su variante `lite`**: el SDK completo traía ~108 kB comprimidos de maquinaria de tiempo
  real y caché offline que esta app no usa (Firestore aquí es directorio de perfiles + grafo de amistad +
  preferencias, todo con lecturas y escrituras puntuales; los datos pesados viven en Gists e IndexedDB, y
  nunca se activó la persistencia offline). Chunk de firebase: **584 → 218 kB (173 → 65 kB comprimidos)**.
  `lite` no tiene `onSnapshot`, así que `scripts/ci-validate.js` impide reintroducir el SDK completo por
  descuido.
- **La virtualización de la tabla de juegos ahora surte efecto.** No lo hacía en ningún caso: si scrolleaba
  la página (móvil/tablet) se renderizaba la tabla entera a propósito, y en escritorio `.table-wrap` es
  `overflow-y:auto` pero sin altura acotada, así que su `clientHeight` es la tabla completa y nunca
  scrollea — el virtualizador de elemento tomaba como viewport todo el contenido y también pintaba todas
  las filas. Ahora se mide quién scrollea de verdad en vez de deducirlo del CSS, y el caso de la ventana usa
  `useWindowVirtualizer`. Medido en móvil con 800 juegos: **800 → 14 filas en el DOM, 33.600 → 590 nodos,
  107 → 26 ms al reordenar**. Por debajo de 120 filas se sigue pintando todo (virtualizar no compensa).
- **El espejo del store `games` escribe solo lo que cambia.** Corría en cada guardado reemplazando el store
  completo (`clear` + un `put` por juego), así que editar la nota de un juego costaba tantas escrituras como
  juegos hubiera en la biblioteca. Ahora se recuerda en memoria lo espejado y se compara contra `_ts`, el
  marcador de versión LWW que toda ruta de edición estrena. Medido con 800 juegos: del segundo guardado en
  adelante, **800 → 1 escritura y 37 → 7 ms de transacción**; el primero de cada sesión sigue reemplazando,
  porque el índice arranca sin saber qué hay en el store y esa es la posición segura. De paso,
  `gamesUpdatedAt` (el sello con el que el arranque decide si ese store puede servir de recuperación) pasa a
  escribirse en la MISMA transacción que los datos, así que ya no puede afirmar que el store está al día si
  no lo está.
- Presupuesto de bytes del arranque en `npm run validate` (187 kB comprimidos hoy, tope 200): engordar la
  carga inicial pasa a ser una decisión consciente y no el efecto colateral de un import.
- Las etiquetas y los contadores de pestaña ya no se recalculan en cada guardado cuando lo único que cambia
  es la meta del ciclo de sync, y se dejó de duplicar la biblioteca en memoria para recorrerla.
- Los avatares del hub se cargan en diferido y con su hueco reservado: se pedían todos al abrir el feed y su
  llegada desplazaba el texto de al lado.

### Changed
- **El smoke test end-to-end se reescribe y entra en CI.** El que había probaba una app imaginaria (pulsaba "Add
  Game", rellenaba `input[name="gameName"]`, migraba arrastrando: nada de eso existe) y estaba excluido de todos
  los runners, así que nadie lo notó. El nuevo corre contra el build servido por `vite preview` —lo único que ve
  el grafo de chunks, la minificación y el service worker— y cubre el **arranque sin red**, que era un bug real y
  que ningún otro test cubría.
- Los tests de reglas de Firestore (`npm run test:rules`) corren en CI. Eran la única barrera real del
  modelo de datos y no los comprobaba nada automáticamente.
- Se emiten sourcemaps `hidden` en producción: con minificación y `dropConsole`, los stacks que llegaban a
  la telemetría venían de código ofuscado e ilegibles.
- Eliminados dos índices de Firestore de una colección `feed` que no existe (ninguna regla la permite y
  ningún código la consulta): se pagaban sin servir para nada.

## [3.3] - 2026-07-09

### Added
- Ordenación por columnas en las listas y en las tablas de detalle de perfil, con indicador sutil.

### Fixed
- La columna de puntuación ordena por nota fina, no por el espejo de 0–5 estrellas.
- El feed de reseñas ya no salta de posición en ediciones que solo cambian la nota.
- Se persiste `listedAt` para mantener el orden de completados al editar.
- La última fila de la lista deja de quedar tapada por la barra inferior fija.

### Changed
- Buckets estrella↔nota unificados y etiquetas del filtro de puntuación corregidas.
- Se deja de trackear la salida de cobertura generada.

## [3.2] - 2026-07-06

### Added
- **Escala de puntuación 0–100** opcional bajo la vista de 5 estrellas, elegible en Ajustes,
  sincronizada vía Firestore y publicada en el canal social. Nuevos juegos por defecto a 60 (3★).
- **Observabilidad**: error boundary global, handlers de `window` y telemetría enriquecida;
  analítica de eventos clave e identificación de usuario.

### Performance
- Cutover de compresión del gist de juegos; tamaño de chunks calculado por su huella comprimida.

## [3.1] - 2026-07-04

### Added
- **Compresión gzip del gist** (lectura + escritura *gated* por flag, con tests de cutover).
- Rediseño social: reseñas con medallón de nota, editor de perfil, estantería de favoritos y botón
  de peticiones; reseñas sin nota con medallón azul "¿?".
- Ruleta con dados 3D y micro-interacciones de movimiento en toda la app.

### Changed
- Extracción de componentes sociales (MetaSection, HubStatus, HubBackButton) y de helpers de sync;
  limpieza de código muerto y comentarios engañosos.

## [3.0] - 2026-07-02

### Added
- **Sistema de amistades**: directorio dividido en amigos/otros, peticiones y confirmación al dejar
  de ser amigos. Error boundary del hub social con reintento throttled.

### Fixed
- Varias condiciones de carrera y de caché del feed social: hidratar solo tras resolver amistades,
  revalidación de caché con `If-None-Match`, auto-sanado de `gistId` obsoleto, uso del nick social
  (nunca el nombre de Google) y endurecimiento frente a entradas de actividad malformadas.

## [2.1 – 2.9] - 2026-06-27 → 2026-07-01

- Base moderna tras la migración: React 19 + TypeScript, capa Firebase (Firestore/Auth), IndexedDB,
  canal social sobre Gist y sincronización CRDT endurecida, con numerosas correcciones.
  (~76 commits consolidados en este rango.)

## [2.0.1] - 2026-04-26

### Fixed
- **Button Double-Processing** — event deduplication flag to prevent toggle buttons firing twice.
- **Service Worker in Development** — SW auto-unregisters in localhost for proper module loading.
- **Form Button Labels** — `form:` structure in TAB_V_LABELS for correct bool button labels.

## [2.0.0] - 2026-04-25

### Added
- **TypeScript** support, **unit tests** (CRDT + UI helpers), **CRDT Sync** with GitHub Gist,
  **PWA** (Service Worker + manifest), responsive design, dynamic filters and an admin panel for
  tags (genres, platforms, years, strengths, weaknesses).

### Removed
- Duplicate `public/js/` folder and duplicate `ci.yml`.
