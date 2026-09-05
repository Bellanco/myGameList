# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows the git tags.

## [Unreleased]

### Added
- **Análisis sugeridos también fuera del espacio social.** El bloque de "por dónde seguir leyendo" que ya existía
  en el hub aparece ahora en dos sitios más, y en los dos ofrece análisis de UNA sola persona, que es lo que
  cambia el criterio: donde se mezclan firmas, la firma es una razón para ofrecer algo; donde solo hay una, no
  distingue nada, así que ahí solo relacionan el JUEGO, la SAGA y el GÉNERO.
  - **En la página pública de un enlace compartido** (`/r/:token`), con otros enlaces públicos del MISMO autor.
    Los elige y los ordena el SERVIDOR (`GET /api/share/related/:token`), no el navegador: el filtro es también
    el límite de lo que se enseña, así que mandar la lista entera para recortarla en el cliente la dejaría
    igualmente a la vista en la respuesta. Como mucho seis, y solo los que se parecen al que se está leyendo, de
    modo que desde un enlace no se puede enumerar todo lo que esa persona tiene publicado. No viaja el uid del
    autor ni el texto completo de ninguna reseña: solo un adelanto, porque para leer una entera se abre SU
    enlace, que es el gesto que su autor autorizó. Cada tarjeta es un enlace de verdad a `/r/{token}`, así que se
    puede abrir en otra pestaña.
  - **En tus reseñas del panel** (`/perfil/resenas/:id`), con las tuyas, tomadas de las listas que ya están en
    memoria: ni una consulta de red, y funciona sin tener montado el espacio social.
  - Los relacionados del espacio social no cambian: conservan sus ponderaciones y su señal de autor.
- **Cada paleta nombra los juegos con su color.** "Clásico" y "Mar de estrellas" eran las dos que no vestían la
  etiqueta del nombre de un juego y caían en una píldora gris genérica; ahora llevan la suya —ámbar de insignia
  la primera, oro de sol la segunda—, con la misma fórmula de velo, filete y texto que el resto de etiquetas.
- **Análisis relacionados al final de una reseña.** Al leer una reseña en el espacio social —tanto desde el feed
  como desde la lista de reseñas de un perfil— aparece al pie un bloque con hasta seis reseñas por las que seguir
  leyendo. Cada una lleva un chip que dice POR QUÉ está ahí, que es lo que la convierte en una respuesta y no en
  una sugerencia suelta:
  - **«Mismo juego»:** otra persona hablando de lo que acabas de leer. Es el motivo de más peso y el único de
    cobertura completa.
  - **La misma saga:** otra entrega de lo que estás leyendo, como «Persona 3 Reloaded» bajo «Persona 5 Royal».
  - **«Más de Ana»:** otras reseñas de quien firma la que estás leyendo.
  - **El género** (**«Acción»**): otros juegos del mismo género. Cobertura irregular a propósito: los géneros no
    viajan por el canal social, así que solo se conocen los de tu biblioteca y los de la amistad cuyo perfil hayas
    abierto. Cuando no se sabe, el bloque se llena con los otros motivos.
  - **Tus reseñas cuentan, estén publicadas o no.** Son tuyas y solo las ves tú, así que ofrecerlas no enseña nada
    a nadie y multiplica lo que el bloque encuentra. Se firman como «Tú», y si la misma reseña llega también por el
    canal se ofrece una sola vez y con el texto completo, no con el adelanto de 160 caracteres.
  - **Ningún dato nuevo, ninguna lectura nueva.** Todo sale del directorio social ya cargado y de tus listados: no
    se publica nada, no se lee ningún gist de más, y solo puede aparecer gente cuyas reseñas ya veías en tu feed
    (el canal solo lee el gist de las amistades). Los juegos se cruzan por NOMBRE y no por id, que es lo único que
    significa lo mismo en dos bibliotecas distintas.
  - Un autor no pone más de dos reseñas en el bloque y ningún tipo de vínculo se lleva más de tres, para que la
    lista no la copie quien más escribe. Si no hay nada que ofrecer, no se pinta el bloque.
  - **La saga tiene preferencia, y se reconoce sin lista de franquicias.** Otra entrega de lo que estás leyendo
    habla casi de lo mismo, así que pesa (60) casi como el mismo juego (100) y mucho más que el género (30) o la
    firma (25); con eso, una reseña de otro Persona se pone por delante de cualquier cosa que solo comparta autor.
    La saga es el principio del título que dos juegos comparten, y para que cuente tiene que **nombrar algo**: los
    números, los artículos, las preposiciones y los pronombres no hacen saga, así que «Call of Duty» no es «Call of
    Cthulhu» ni «The Last of Us» es «The Last Guardian». Cuando lo compartido es una sola palabra —de una palabra
    son «dark», «star» o «super», que empiezan medio catálogo— hace falta además marca de serie: que en uno de los
    dos títulos esa palabra sea el título entero o vaya seguida de un número. Así entran «Doom» ~ «Doom Eternal»,
    «Halo 3» ~ «Halo Infinite» o «Nioh» ~ «Nioh 2», y se quedan fuera «Dark Souls» ~ «Dark Sector» o «Journey» ~
    «Journey to the Savage Planet». El precio, asumido: se escapan las sagas que solo se distinguen por subtítulo
    («Nier Automata» ~ «Nier Replicant»), que sale más barato que emparentar «Dead Space» con «Dead Cells».
  - **El género suma en vez de competir:** entre dos análisis de la misma persona sube el del género que estás
    leyendo, y quien no comparte ni juego ni autor sigue entrando solo por él. Compartir género (30) pesa más que
    compartir firma (25): que alguien haya escrito de otro juego del género que lees dice más que el mero hecho de
    ser la misma persona.
  - **Tus propios análisis quedan detrás de los de otra gente**, porque tu opinión ya la conoces — salvo sobre el
    MISMO juego, donde precisamente interesa comparar y siguen arriba. Cuando no hay nada de nadie más, los tuyos
    salen igual: el descuento los baja, no los elimina.
  - **El botón de volver nombra de dónde vienes.** Al saltar a un análisis propio desde el bloque, la pantalla
    ofrecía «volver a las reseñas» —la lista de las tuyas— a quien venía del feed y no había pasado por esa lista.
    Ahora se vuelve a la pantalla desde la que se saltó, con el rótulo del sitio al que de verdad se llega, y
    encadenando saltos se deshace el camino paso a paso.
  - **Abrir una reseña empieza por su principio:** el hub no rehacía el desplazamiento al cambiar de pantalla, y
    con el bloque al pie la pantalla creció lo bastante como para que abrir una reseña desde el final de una lista
    larga te dejara leyendo por el medio. Volver atrás sigue conservando dónde estabas.
  - **En pantalla estrecha, «volver» y «compartir» vuelven a la misma línea**, uno a cada extremo, en lugar de
    apilarse en dos renglones.
  - **Tu propia reseña se firma con tu nombre**, como las de los demás, y se distingue por el color de la firma en
    lugar de por un «Tú» que era la única del bloque que no parecía una persona.
  - **Se pintan las que llenen filas enteras.** Cuántas salen no es un número fijo: sale de cuántas columnas quepan
    en el ancho disponible —tres en el móvil, hasta quince en un monitor grande—, y si sobran candidatas se
    recorta a un múltiplo de las columnas para que no quede una tarjeta suelta con huecos al lado. La única fila
    que puede quedar a medias es la primera, cuando sencillamente no hay más reseñas que ofrecer.
  - **El bloque es una rejilla, no una lista.** Una reseña relacionada es un renglón corto, y a lo ancho de la
    pantalla ese renglón acababa a media línea dejando media tarjeta vacía. En columnas, el mismo alto enseña
    dos o tres. Se adapta al ancho disponible sin una sola consulta de medios —de una columna en el móvil a cinco
    en un monitor grande— y las tarjetas de una misma fila miden lo mismo.
  - **El mismo juego se reconoce aunque cada cual lo escriba a su manera:** «Marvel's Spider-Man» y «Marvels
    Spider Man», «Pokémon» y «Pokemon», «The Last of Us» y «Last of Us», «Final Fantasy VII» y «Final Fantasy 7»,
    y las reediciones con su original («Dark Souls Remastered», «…Game of the Year Edition», «Okami HD»). Lo que
    NO se funde: un remake con su original —«Final Fantasy VII Remake» es otro juego—, una secuela con su
    original (los números nunca se borran: «Nioh» y «Nioh 2» siguen siendo dos) ni «Mega Man X» con «Mega Man
    10». Estas reglas viven solo aquí: detectar duplicados al guardar o al importar sigue con el casado estricto
    de siempre, porque allí una coincidencia de más te impediría añadir un juego o fundiría dos al importar.

### Fixed
- **Los estilos de una reseña se cargaban solo dentro del espacio social.** Vivían en la hoja del hub, que se
  descarga con su chunk perezoso, pero el marcado que pintan lo usan también tus reseñas del panel y la página
  pública de un enlace. En esas dos pantallas la hoja no llegaba nunca y se veía: el medallón de la nota se
  quedaba en un número suelto a lo ancho de la tarjeta. Ahora viven en una hoja propia que importa cada
  componente que de verdad pinta una reseña.
- **El icono de las reseñas se veía negro** en `/perfil/resenas` y en el detalle de cualquier análisis, mientras
  el título de al lado sí salía en color: le faltaba el relleno, que estos iconos no heredan.
- **Las acciones de las pantallas del hub vuelven a una sola fila.** Por debajo de cierto ancho se apilaban en
  una torre alineada a la izquierda —«volver» y «compartir» en dos renglones, y lo mismo en la actividad y en el
  perfil de alguien— porque cada lado de la fila tomaba el ancho entero. Ahora cada lado mide lo que miden sus
  botones y es la fila la que pasa de línea solo cuando de verdad no hay sitio; en móvil, donde los botones ya
  son cuadrados de icono, entran todos en un renglón con sus extremos en su sitio.
- **Las categorías de juegos de un perfil ya no piden scroll en móvil.** Las cuatro con su nombre no caben en una
  pantalla estrecha y había que arrastrar el control para descubrir que existían «En curso» y «Próximos». Ahora
  se quedan en ICONO —los mismos de las pestañas de listas de la aplicación—, conservando el nombre para el
  lector de pantalla y al pasar el ratón. Además el control ocupa todo el ancho y reparte sus categorías a partes
  iguales, así que cada una es una diana grande en lugar de una palabra estrecha.
- **La barra inferior deja de sobresalir en la pantalla de perfil (móvil).** En un teléfono, la barra fija de
  Listados / Social / Estadísticas se salía por la derecha y quedaba cortada. La culpa era del globo de detalle de
  «Evolución del backlog»: el del último mes se abría hacia la derecha y se salía del lienzo, y como sigue
  midiendo aunque esté oculto, estiraba el ancho de scroll de la página; en móvil eso ensancha el viewport de
  composición y con él todo lo que va fijo al 100%. Ahora el globo se coloca según dónde caiga su mes —los
  primeros abren a la derecha, los últimos a la izquierda y los de en medio cuelgan centrados sobre su punto—,
  así que no se sale ni con dos meses ni con tres años de histórico, tampoco en pantallas de 320 px.
- **«Cómo cambia tu gusto» abre por los años recientes.** En un móvil el gráfico no cabe entero y se desplaza de
  lado, pero empezaba por el año más antiguo: se veía menos de la mitad de la figura y, como los nombres de los
  géneros viven en el extremo derecho, se leía a ciegas hasta el final del arrastre. Ahora arranca por el FINAL
  —en qué anda hoy tu gusto, con cada línea rotulada— y el pasado queda a un arrastre. El aire entre columnas se
  respeta a propósito: apretar el dibujo hasta el ancho de la pantalla lo hacía caber de una vez, pero dejaba
  siete trazos hechos un nudo. De paso, el suelo de ancho lo pone ahora el propio dibujo (56 px por año) en vez
  de un valor redondo de la hoja de estilo, que se le quedaba corto a un histórico largo y lo apelmazaba igual.
- **La barra inferior se ve entera en cualquier pantalla.** En un móvil estrecho los tres rótulos no caben en una
  línea y el más largo se salía de su pastilla: «Estadísticas» pegado al borde de la barra. Ahora la barra baja un
  escalón cuando hace falta: primero APILA el icono sobre el nombre —el gesto clásico de una barra inferior, que
  deja de pagar el ancho del icono y devuelve el rótulo a un móvil de 340 px—, y solo si tampoco así hay sitio se
  queda en ICONO, con el nombre en el DOM para el lector de pantalla. Las tres dianas siguen midiendo 48 px en
  todos los casos. El escalón no lo decide un ancho de corte a ojo, sino la medida real del rótulo: lo que ocupa
  cambia con el ajuste de MAYÚSCULAS y con el cuerpo de letra del navegador, y se vuelve a medir cuando entra la
  tipografía de la app —con la de reserva, más estrecha, la barra creía caber y luego se quedaba sin aire—.
- **Los nombres de «Tus géneros» ya no se cortan.** En el hexágono, los ejes de izquierda y derecha rotulan hacia
  fuera, así que un nombre largo —«Plataformas», «Metroidvania»— se salía del lienzo y la tarjeta lo cortaba a
  media palabra en cuanto la pantalla era estrecha. Ahora la figura pide el lienzo que sus nombres necesitan, a
  partes iguales por los dos lados para no descentrarla, y donde hay sitio el hexágono se sigue viendo igual de
  grande que antes: lo que crece es el margen del texto, no el dibujo.

### Changed
- **La cabecera del detalle de una reseña es una sola pieza.** Estaba escrita cuatro veces —detalle del feed,
  reseña de un perfil, ficha de la ruleta y página pública— y de esas copias habían salido DOS órdenes distintos
  para lo mismo. Ahora manda una sola regla: cuando hay firma que dar, el titular es la PERSONA y el juego baja a
  su etiqueta; cuando no la hay, el titular es el JUEGO. El avatar y el enlace al perfil solo aparecen cuando ese
  perfil se puede visitar.
- **Tus reseñas ya no se firman.** En `/perfil/resenas/:id` todas son tuyas, así que el chip que ponía "Tus
  reseñas" —que ni siquiera era un nombre— desaparece, y la cabecera se queda con el nombre del juego, que es lo
  único que ahí distingue una reseña de otra.
- **La página pública de un enlace compartido se parece por fin al detalle de dentro de la aplicación:** lleva su
  mismo encabezado (icono, título y subtítulo). Sigue sin botón de volver: desde un enlace no se ha venido de
  ninguna parte.
- **Perfiles y solicitudes: una sola tarjeta de persona, en rejilla.** Las dos pantallas del hub que listan gente
  (`/social/profiles` y `/social/requests`) comparten ahora la misma pieza y la misma rejilla, en vez de una
  tarjeta por pantalla —el directorio— y la burbuja del feed —la bandeja—.
  - **Se ve mucha más gente sin bajar.** La tarjeta es vertical y compacta (avatar, nombre y acción), y la rejilla
    pasa de tres columnas a cinco o seis en escritorio y garantiza DOS en móvil, donde la bandeja apilaba una
    burbuja debajo de otra: sus tres bloques —recibidas, enviadas y amigos— caben ahora de un vistazo.
  - **Cada bloque dice cuánta gente tiene y se pagina por filas**, con «Mostrar más (quedan N)», también en la
    bandeja: una lista larga de amigos ya no entierra las peticiones que hay que contestar.
  - **El rango se marca con una muesca en la esquina**, no con un punto: un triángulo pegado a la esquina superior
    derecha cuyos catetos son el propio borde de la tarjeta, en el color del rango, con la diagonal cerrándolo y un
    velo tenue dentro. El punto era un elemento más puesto encima, y en una rejilla la fila se llenaba de topos.
    La muesca se adapta al borde de cada tema (2px en Cámara de pruebas, 3px en Ladrones fantasma…) y hereda su
    radio, así que queda a escuadra donde el tema lo está.
  - **El rango llega también a la bandeja**, para quien esté en el directorio; de quien no lo esté no se inventa
    ninguno.
  - **Los amigos se listan por último uso de la aplicación**, primero quien más recientemente ha estado, en la
    bandeja y en Perfiles. La bandeja los ordenaba por la fecha del documento de amistad —cuándo se aceptó—, que es
    un orden congelado el día que os hicisteis amigos. Las peticiones siguen por fecha de petición: ahí lo que
    importa es cuál llegó antes.
  - **Sin peticiones no se dice que no las hay:** los bloques de recibidas y enviadas desaparecen enteros cuando
    están vacíos, en vez de dos frases anunciando la nada. El de amigos conserva la suya, que explica dónde se
    piden.
  - **Desde la bandeja se abre el perfil de un amigo** pulsando su tarjeta. Solo de un amigo: en una petición
    pendiente todavía no hay relación aceptada.
  - **Rechazar una petición y retirar una enviada piden confirmación**, como «dejar de ser amigos». Ninguna de las
    tres se deshace, y con los botones dentro de la tarjeta un toque de más costaba una petición.
  - En pantalla estrecha los botones se quedan en su icono —con la acción entera en el texto accesible— para que
    «Dejar de ser amigos» no ocupe tres líneas dentro de una tarjeta.

- **Actividad de listas: otras palabras, solo movimientos y tope por día.** Tres cambios sobre el aviso de una
  línea del feed social («Ada finalizó Hollow Knight 18:42»):
  - **Los verbos cambian de palabra:** «comenzó» en vez de «empezó», «finalizó» en vez de «terminó», «abandonó» en
    vez de «dejó» y «añadió» en vez de «apuntó».
  - **Movimientos, no altas.** La lista por la que un juego ENTRA en la biblioteca deja de publicar aviso: solo se
    cuenta lo que va de una lista a otra. Dar de alta un juego —o catalogar una colección entera— ya no anuncia
    nada, que era justo lo que dejaba a alguien recién llegado copando el feed de sus amistades. La lista de
    entrada es la del sello más antiguo, y se decide con todos los sellos (también los de las listas ocultas), así
    que un juego que entró por una lista escondida sí cuenta su siguiente movimiento. **Es retroactivo:** la
    reconciliación retira de los canales que ya existen los avisos que en realidad eran altas
    (`RECONCILE_LOGIC_VERSION` 5), sin que nadie tenga que hacer nada.
  - **De un mismo día, un solo aviso por juego: el último.** Empezar algo y abandonarlo esa tarde es una cosa, no
    dos: se cuenta **abandonado**. Empezarlo y terminarlo, **finalizado**. El colapso se aplica sobre los avisos ya
    publicables, así que uno descartado (un «finalizó» de un juego que en realidad se pasó hace años) no se lleva
    por delante el «comenzó» de ese día, y una lista oculta no tapa a una visible. Retroactivo por la misma vía que
    lo anterior (`RECONCILE_LOGIC_VERSION` 6).
  - **Tres avisos por persona y día.** Es un cupo de LECTURA, como el filtro de listas: recorta lo que el feed
    pinta —de lo ya publicado por todo el mundo, sin republicar nada— y se cuenta en el día LOCAL de quien mira,
    el mismo con el que el feed titula sus grupos. Las reseñas y las publicaciones no cuentan para él y siguen sin
    tope: una reseña se escribe, un movimiento cuesta un clic.
  - Política de privacidad al día: ahora se publica MENOS de lo ya declarado (el alta de un juego no sale), así que
    el texto se corrige pero la versión no sube y no se vuelve a pedir conformidad. El cupo diario no se menciona
    por lo mismo que el filtro de listas: cambia lo que ves tú, no lo que se publica de ti.

## [1.0.6] - 2026-08-25

> Esta sección era `[Unreleased]` y se cierra aquí. Las versiones 1.0.1–1.0.5 nunca tuvieron sección propia, así
> que lo que hay debajo es **todo lo acumulado desde 1.0.0**: parte se desplegó ya en esas versiones intermedias y
> parte llega con esta. Está todo presente en 1.0.6; no todo se estrena en 1.0.6.
>
> Y es la primera versión en la que `package.json` dice la verdad: llevaba `1.0.0` desde el principio, así que la
> telemetría etiquetaba como 1.0.0 los errores de las seis releases anteriores (ver `__APP_VERSION__` en
> `vite.config.ts`).

### Added
- **Actividad de listas en el feed social.** Al feed llegan, además de las reseñas y las publicaciones, los
  movimientos: cuando un juego entra por primera vez en una lista, tus amistades ven que lo has **apuntado,
  empezado, terminado o dejado**, con su fecha y su hora.
  - **Es una proyección, no un registro de eventos.** Sale del sello `enteredAt` de cada juego (la primera entrada
    a cada lista, que nunca se reescribe), así que la misma biblioteca produce siempre los mismos mensajes con las
    mismas fechas. No hay cola que se pueda perder ni duplicar, publicar dos veces no crea nada nuevo, y el
    historial de quien ya tenía los sellos entra solo — sin tener que volver a mover ningún juego. Su contrapartida
    declarada: volver a una lista de la que se salió no genera un mensaje nuevo.
  - **Sin una sola petición de más.** Mover un juego no escribe en GitHub. Los mensajes viajan a rebufo de la
    primera escritura del canal que ocurra por otro motivo (guardar una reseña, publicar una noticia) y, si no
    ocurre ninguna, los recoge la reconciliación al abrir el hub. Ahí es también donde se retiran los de un juego
    borrado, con la misma guarda de reloj que protege a las reseñas huérfanas: una biblioteca a medio sincronizar no
    puede vaciar el canal.
  - **Array propio en el canal, y no entradas de actividad.** Una entrada de reseña arrastra once campos (~240
    bytes) donde un movimiento necesita cuatro (~80), y `activity` tiene un cupo de 320 que los movimientos le
    habrían robado a las reseñas —en el gist, al hidratar el directorio y en la pestaña Reseñas—. Con array propio,
    cupo propio (400 mensajes, ~36 KB) y ni una reseña desplazada.
  - **Lo que se publica y lo que no.** El juego, la lista y el instante. El campo `enteredAt` sigue PROHIBIDO en el
    canal social y se sigue borrando de los listados que baja una amistad: lo que se publica es la primera entrada a
    cada lista, nunca el historial completo de movimientos. **De una lista oculta no se publica nada**, para no
    contar por otra puerta lo que el ajuste de visibilidad esconde. Está declarado en la política de privacidad, y
    por eso se vuelve a pedir la conformidad.
  - **Elige qué movimientos ves tú.** En *Editar mi perfil* hay un bloque nuevo, aparte del de visibilidad, para
    decidir de qué listas quieres ver movimientos en tu actividad. Es un ajuste de LECTURA: no cambia lo que se
    publica ni lo que ven los demás, se aplica al instante sin pulsar «Guardar» y te sigue entre dispositivos. El
    filtro se aplica sobre lo que ya está cargado, así que encender una lista no cuesta ninguna lectura de red.
  - **Un renglón, no una tarjeta.** El mensaje es la burbuja más callada del feed y eso está medido: 43 px de alto
    frente a los 195 de una reseña, con **el mismo ancho que ella** — el feed es una columna de burbujas alineadas y
    una que mida distinto a cada línea rompe esa rejilla, así que lo que lo hace ligero es su altura y su color, no
    su anchura. El lomo de color queda reservado a lo que alguien ESCRIBIÓ (reseñas y publicaciones); el movimiento lo
    lleva en el gris del borde. No repite el día que ya dice la cabecera del grupo: solo la hora, con la fecha
    completa al pasar el ratón. Y la tarjeta no es pulsable —no hay pantalla de «movimiento» que abrir—: de ella
    llevan a algún sitio el autor y, **cuando de verdad hay un análisis detrás**, el nombre del juego, que abre el
    detalle social de ese análisis y se distingue con el acento del tema rebajado hacia el gris del texto. Sin
    análisis, ese nombre es texto y no promete un gesto que no puede cumplir. El enlace viaja con el
    `actorProfileId` del gist —el identificador con el que el detalle resuelve—, y no con el de la entrada del
    directorio, que para una amistad es su uid de Firebase: son dos identificadores de la misma persona y con el
    segundo el enlace abría una pantalla vacía.
  - **Jugar, no catalogar.** Un juego que se terminó hace años y se mete hoy en la biblioteca no anuncia nada. El
    sello de Completados dice cuándo el juego llegó a esa lista EN LA APLICACIÓN, no cuándo se terminó: quien
    cataloga su historial estampaba sellos de hoy y el feed de sus amistades leía «terminó tal cosa» como si acabara
    de pasar. Ahora el mensaje de Completados exige que el año que dice el propio juego coincida con el del sello, y
    una rejugada cuenta (ese campo es multivalor). Sin año no se anuncia: el mensaje afirma una fecha y sin ella no
    hay forma de sostenerla. Apuntar o empezar algo viejo sí es actividad de hoy, así que el filtro es solo para
    Completados.
  - **Y limpia lo que ya se había publicado.** Filtrar la proyección no bastaba: los mensajes que ya estaban en el
    canal se quedaban ahí, porque la retirada solo alcanzaba a los juegos AUSENTES de la biblioteca. Ahora, con el
    juego delante, manda la biblioteca: si sus sellos y sus años no producen ese mensaje, se retira. Ocurre sola en
    la siguiente apertura del espacio social, sin pedir nada al usuario ni esperar a que caduque ningún sello.
  - **Cada tema lo cuenta a su manera.** Las seis paletas imponen su propio marco a las tarjetas del feed, así que
    la versión callada del mensaje se escribe en el idioma de cada una: en *Corazón rebelde* la viñeta de cómic se
    reduce a su tamaño pequeño (filete de 2 px, sombra de 3); en *Cámara de pruebas* se le retira el filete naranja
    y queda placa lisa; en *Sin futuro* pierde el filete amarillo de alerta y se queda en el cian del registro, con
    la hora en monoespaciada y su `//`; en *Solo hay guerra* pierde el doble filete dorado de documento oficial y la
    hora sale en la pixelada con su `>`; en *Sol y luna* se queda el recuadro sin el doble aro turquesa.

- **La aplicación abre sin conexión y el espacio social lo cuenta con sus palabras.** Arrancar sin red ya
  funcionaba (el service worker sirve el shell y los chunks del arranque desde su caché), pero en cuanto se
  entraba en el espacio social salía el error de la librería que fallara primero: `network offline`,
  `Failed to fetch` o «Failed to get document because the client is offline», en inglés y sin decir qué hacer.
  - **Aviso propio, con el guiño de cada tema.** Sin conexión aparece un aviso persistente —no un mensaje que se
    borra a los tres segundos, porque la condición dura hasta que vuelve la red— con el titular del tema («No hay
    conexión con el servidor», «No hay cobertura para llamar a tus Confidentes», «La Disformidad se ha tragado la
    señal»…) y, debajo, lo único que importa: que lo que se ve es lo último guardado en este dispositivo y que se
    actualizará solo. El feed vacío sin red ya no culpa a la falta de amigos ni ofrece «descubrir perfiles», que
    ahí no puede funcionar.
  - **Y ABRE de verdad: el feed y el perfil se sirven de la caché aunque haya caducado.** El TTL de las cachés del
    directorio y del perfil propio (30 min y 5 min) solo tiene sentido si hay a dónde ir a por algo más nuevo: sin
    red la alternativa era un espacio social vacío con un error. Ahora, sin conexión, se sirve lo guardado; si la
    lectura falla estando el navegador convencido de que hay red, se rescata igual en vez de vaciar la pantalla. La
    versión de FORMA de la caché sigue invalidando, que eso no es rancio, es ilegible.
  - **Dos señales para saber que no hay red, porque ninguna basta sola.** `navigator.onLine` detecta el modo avión
    o el cable fuera antes de intentar nada, pero da por buena una wifi conectada sin salida a internet; el fallo
    de la propia operación cubre justo ese caso. El aviso se enciende con cualquiera de las dos y se apaga con la
    primera lectura que vuelve a funcionar, y al recuperar la conexión el feed y el perfil se rehidratan solos, sin
    recargar.
  - **Un fallo de red ya no CIERRA el espacio social.** Se contaba como error duro, y eso encendía el bloqueo que
    frena la hidratación del feed y deja el editor de perfil cerrado: quedarse sin conexión, además de dejar sin
    datos nuevos, echaba al usuario de la sección. Ahora es un aviso, no un bloqueo. Publicar sin red tampoco se
    intenta: se dice que no se ha enviado y el texto se queda intacto en el compositor.
  - **Entrar sin red donde nunca se había entrado.** Si el chunk de una sección no está en la caché todavía, su
    descarga falla y antes se veía «algo ha ido mal / vuelve a cargar» —ni era verdad ni servía de nada: recargar
    volvía a fallar y se entraba en bucle—. Ahora se reconoce como falta de conexión, se dice que esa parte
    necesita red y que las listas siguen funcionando, y la acción lleva a las listas en lugar de recargar. Por el
    mismo motivo, sin red ya no se auto-recarga la página al fallar un `import()`: no traería el chunk y tiraba el
    estado de la pantalla.

### Performance
- **El arranque adelgaza otros 1,8 kB comprimidos (213,1 → 211,3) sacando del CSS inicial las hojas de dos
  pantallas que ya entraban por `lazy()`**: el panel de administración y el modal de la ruleta. Eran ~24 kB sin
  comprimir que descargaba todo el mundo para dos pantallas que casi nadie abre. El margen del presupuesto pasa de
  0,9 kB —donde el siguiente `import` rompía el build— a 3,7 kB.
- **El arranque adelgaza 2,6 kB comprimidos (214,3 → 211,7) sacando del chunk inicial los textos del espacio
  social.** Los 8 kB de `SOCIAL_UI` viajaban en la primera carga de TODO el mundo —incluido quien nunca abre el
  hub— porque vivían en `labels.ts`, que importa media aplicación. El único cordón que los ataba ahí era el
  esqueleto del `Suspense` (`SocialHubSkeleton`, que por definición tiene que estar cargado antes que el hub) y
  las TRES cadenas que leía de ellos: título, aviso de carga y nombre accesible. Ahora esas tres viven en
  `core/constants/socialShell` (unos cien bytes, y `SOCIAL_UI` las toma de ahí, así que no se duplican) y el resto
  se ha mudado a `core/constants/socialLabels`, que se descarga con el hub. Se descubrió al añadir la actividad de
  listas: sus textos empujaron el arranque por encima del presupuesto de `ci-validate`, y la causa no eran ellos.

### Fixed
- **La reseña se publicaba sobre un id adivinado.** `App` reimplementaba la regla de alta del ViewModel
  (`max(ids) + 1`) para saber sobre qué juego publicar en el canal social. Mientras las dos copias coincidieran no
  se notaba; en cuanto dejaran de coincidir, la reseña se colgaría de otro juego sin error ni rastro. Ahora el
  guardado devuelve el id real —y el estado previo del juego—, y nadie los recalcula.
- **El editor de perfil dejaba de exigir un juego completado.** Abrir el espacio social antes de que llegara la
  biblioteca fijaba la vía indulgente («aquí no hay biblioteca, no puedo afirmar que no tengas completados») y ahí
  se quedaba: al llegar la biblioteca con juegos y ningún completado, el callback no se recreaba.
- **Tres avisos del panel de administración no se veían.** Comparten clase con el cartel del gestor de etiquetas,
  que nace `display: none` y se enseña con `.show`; el panel los pinta condicionalmente y nunca añade esa clase, así
  que el aviso de censo recortado, la pista de nombre que no coincide y el tope de cuota se escribían en el DOM sin
  pintarse.
- **Copiar el enlace de una reseña compartida no acusaba nada, y ensuciaba la telemetría.** El botón lanzaba la
  copia sin capturar el rechazo, así que un permiso denegado subía como `unhandledrejection` y se reportaba como
  error de la aplicación. Ahora dice «Enlace copiado» y el fallo se trata como lo que es.
- **"No me sale el botón de compartir".** Dos agujeros distintos, ninguno relacionado con el rango del perfil
  (bronce puede compartir: tiene 5 enlaces de 7 días, y ni el cliente ni la Function miran el rango para eso).
  - **Desde tus reseñas del perfil social no se podía compartir.** El botón estaba en el panel de estadísticas y
    en el detalle de tu propia actividad del feed, pero no al abrir una reseña desde **Mi perfil → Reseñas**, que
    es el camino natural para quien quiere publicar la suya: era la misma pantalla, sin sus acciones. Ahora se
    ofrece también ahí. Sobre una reseña ajena sigue sin aparecer: no hay nada propio que publicar.
  - **Sin sesión de Google el botón desaparecía sin decir nada.** Publicar exige identidad, así que el botón no
    puede estar; pero quitarlo en silencio deja a la persona buscando algo que no existe y sin nada que hacer al
    respecto. Ahora se dice qué falta y dónde se resuelve. Mientras aún no se sabe si hay sesión no se pinta nada,
    para no enseñarlo y quitarlo medio segundo después. El aviso lo ve solo quien YA usa el espacio social en ese
    navegador —se sabe por la config local de su gist social, que sobrevive a que la sesión se caiga—: a quien
    nunca lo ha abierto no se le habla en su panel de reseñas de algo que no ha pedido.
- **Había que hacer Ctrl+Shift+R para ver una versión nueva.** El service worker ya se relevaba solo
  (`skipWaiting()`), y el HTML se sirve con `no-store`: en cuanto el navegador VUELVE A MIRAR
  `/service-worker.js`, la versión nueva entra sola. El agujero estaba en ese "vuelve a mirar": el navegador solo
  lo comprueba en una navegación de verdad —o, por su cuenta, cada 24 horas— y esta app es un SPA, donde moverse
  entre secciones no genera ninguna navegación. Una pestaña abierta, o una PWA instalada en móvil (que no se
  cierra nunca del todo), podía pasar días ejecutando el bundle anterior; volver desde la bfcache tampoco ayudaba,
  porque restaura el documento tal cual, con el JavaScript viejo dentro. Por eso el único gesto que funcionaba era
  el recargado forzado, que es lo único que salta a la vez el service worker y la caché HTTP. Ahora la app
  pregunta ella por versiones nuevas cuando el usuario vuelve a ella (foco, pestaña visible, restauración de
  bfcache, recuperación de red) y, si no vuelve, cada cuarto de hora.
  - **Cómo se aplica**, sin interrumpir y sin perder nada: con la app en segundo plano y nada a medias, se recarga
    sola —el usuario vuelve y ya está en la versión nueva, sin haber visto un parpadeo—. Con la app en primer
    plano NO se recarga nunca sola: eso perdería el scroll, los filtros y lo que se esté escribiendo, así que se
    enseña un aviso con un botón y decide el usuario. Con un modal abierto (una reseña a medio escribir vive solo
    en el DOM) o con cambios locales sin subir, tampoco: se espera. Si el aviso llega en primer plano y el usuario
    lo ignora, la recarga se hace sola en cuanto deja la app.
- **El avatar por defecto de Google se colaba como si fuera una foto.** Quien no sube foto a su cuenta no se queda
  sin `photoURL`: Google le genera un monograma —su inicial sobre un círculo de color— y lo sirve desde el mismo
  sitio y con el mismo formato de URL que una foto real, así que por la URL no se distinguen. Eso rompía dos cosas
  a la vez: en el hub se pintaba ese monograma en lugar de la silueta de la aplicación —justo la inicial-sobre-color
  que se decidió no hacer—, y como "tener URL" contaba como tener foto, esas cuentas podían encender **Mostrar mi
  foto de perfil** y ver las caras de sus amigos sin aportar la suya, que es el trato que la reciprocidad deshace.
  Ahora se reconocen mirando la imagen: una foto subida se sirve como JPEG y el monograma siempre como PNG diminuto
  de color plano, así que basta el formato para descartar las fotos reales sin decodificar nada, y el recuento de
  colores resuelve el resto. Con el monograma, el interruptor queda apagado y bloqueado —con un aviso que explica
  que esa imagen no es una foto, en vez del "tu cuenta no tiene foto" que sonaría a error a quien sí ve una— y esa
  URL deja de publicarse. Ante cualquier duda —red caída, formato inesperado— la foto se da por buena: quitarle la
  cara a quien sí la tiene es peor error que dejar pasar un monograma.
  - **Se retira también la que ya estaba publicada**, sin migración ni esperar a nadie: al pintar, porque esas URLs
    viven en los canales de mucha gente y en los documentos de amistad, y en el propio canal, que se sanea al abrir
    el hub. Un PNG pequeño y de color plano subido a propósito como foto —un logo, un dibujo liso— se marcaría como
    genérico; es el falso positivo asumido, y se arregla subiendo una foto.

### Changed

- **La decisión de publicar reseña y su efecto salen de `App`.** La decisión (qué publicar, qué retirar, qué no
  tocar) es pura y vive en `core/social/reviewPublication`; el efecto, en `viewmodel/applyReviewPublication`. Un
  componente no debe importar repositorios, y `App` lo hacía dos veces.
- **El layout de las pantallas de importación pasa a clases.** Eran 28 objetos de estilo inline mientras el resto
  de la aplicación usa clases: había reglas duplicadas byte a byte entre dos pantallas, otras copiadas con deriva
  (espaciados distintos por accidente), varias que no hacían nada —el reset global ya las aplicaba— y ninguna que
  los temas pudieran alcanzar, porque un estilo inline gana a cualquier selector.
- Copiar al portapapeles se unifica en `core/utils/clipboard` (había cinco copias del mismo `try/catch`), el
  utillaje de diagnóstico de fechas sale de `main.tsx` a un módulo aparte (95 de sus 210 líneas eran depuración) y
  se retira código muerto: dos helpers de Playnite huérfanos desde que se consolidaron las vías de importación, y
  varias constantes que se exportaban sin que nadie las usara fuera de su fichero.
- **La auditoría de seguridad de CI ya significa algo.** Auditaba todas las dependencias con
  `continue-on-error: true`, así que nunca bloqueaba: los seis avisos `moderate` de la cadena de `firebase-tools`
  la dejaban en rojo permanente y un aviso real en una dependencia de producción se habría perdido entre ellos.
  Ahora hay dos pasos: uno bloqueante sobre `--omit=dev` (lo que de verdad se despliega, hoy limpio) y otro
  informativo sobre las de desarrollo.

### Tests

- La decisión de publicar reseña y su efecto quedan cubiertos al 100 %, y `App.tsx` pasa de **0 %** a **54 %**:
  cinco pruebas de componente montan la aplicación y guardan desde el formulario de verdad. Antes ninguna suite
  ejecutaba sus manejadores —medida la cobertura V8 real de los e2e, el recorrido interactivo completo aportaba dos
  sentencias sobre el simple arranque—, y es justo donde se había colado el fallo del id.
- Regresiones nuevas para el saneado de amistades (un id vacío conserva el que consta), para el mapeo de géneros
  del importador y para el cifrado en reposo del canal social. En total, de 1274 a 1319 pruebas.

### Security

- **El token de GitHub ya no se guarda en claro en NINGÚN sitio del dispositivo.** Estaba cifrado en reposo en el
  canal de juegos, pero el canal social guardaba una COPIA DEL MISMO PAT en claro en la clave de al lado, así que el
  cifrado del primero no protegía nada: bastaba leer el registro del segundo. Ahora los dos canales usan el mismo
  mecanismo (AES-GCM con la clave de dispositivo no exportable de IndexedDB), con migración automática del token en
  claro que hubiera. Siguen siendo dos copias independientes a propósito: al desconectar la sincronización de
  juegos, el token social es lo único con lo que aún se puede escribir en el canal.
- **Y tampoco en IndexedDB.** El runner de migración local sembraba el token en la meta local, en claro, y NADIE lo
  leía: el fallback de recuperación recibe el perfil de Firestore, no esa meta. Era un secreto en disco a cambio de
  nada. Se retira la escritura y se vacía lo ya escrito al arrancar.
- **Las respuestas de `/api/*` salen de la caché del service worker.** Son por usuario y revocables, pero la Cache
  API guarda lo que se le manda ignorando su `Cache-Control: no-store`, y casa las entradas SOLO por URL (no hay
  `Vary: Authorization`). Se quedaban guardados `/api/share/mine` (mis enlaces, mi cuota, mi veto) y
  `/api/share/all` (el censo del panel), con tres consecuencias: sobrevivían a cerrar sesión y a borrar la cuenta,
  en un navegador compartido el siguiente usuario veía en el primer pintado la lista del anterior, y un enlace
  retirado se seguía sirviendo desde la caché local. El arreglo es retroactivo: al cambiar el identificador de
  build cambia el nombre de la caché, y el `activate` borra las que no son la actual.
- **El borrado de cuenta se lleva también la clave de dispositivo y la Cache Storage.** La clave AES vive en su
  propia base (`mygamelist-secure`), aparte de la de datos, así que borrar la de datos no se la llevaba: quedaba
  una clave huérfana después de ejercer el derecho de supresión.
- **La purga de perfiles legacy cubre el token y los ids de gist.** `scripts/purge-profile-pii.js` retira ahora
  `social.githubToken` —un PAT en claro en un documento que lee cualquier usuario autenticado— además del correo y
  los ids, con respaldo local previo porque para algunos usuarios es la única copia que queda. Y deja de saltarse
  los perfiles de id legacy, que eran los más antiguos y los más propensos a arrastrarlo.
- **Un id de gist vacío ya no borra el que consta en las amistades.** Varios llamantes pasan
  `mainSyncConfig?.gistId || ''`, y esa configuración se hidrata de forma asíncrona: un vacío significa «aquí y
  ahora no lo sé», no «este usuario ya no tiene gist». De esos campos denormalizados sacan las amistades la lista
  de juegos, así que guardar el perfil antes de que llegara la configuración se la dejaba en blanco a todas ellas.

## [1.0.0] - 2026-08-16

> Renumerado a 1.0.0. La numeración anterior (3.x) venía de las primeras versiones de la app y ya no decía nada
> sobre su madurez: se reinicia aquí, con la parte social asentada y la primera funcionalidad que publica
> contenido fuera de la aplicación.

### Added
- **Compartir una reseña con enlace público.** Hasta ahora el texto completo de una reseña NUNCA salía del ámbito
  privado —el canal social publica un fragmento de 160 caracteres—, y esta es la única puerta por la que sale, con
  tres condiciones: la abre su dueño reseña a reseña, caduca sola y se puede retirar.
  - **Ni un byte en los Gists.** El artículo vive en Cloudflare KV, no en el canal social ni en la biblioteca. El
    motivo no es de gusto: el gist social lo descargan todos tus amigos en cada hidratación del feed, así que cada
    KB añadido se multiplica por amigos y por refrescos contra las 5.000 peticiones/hora que se comparten con la
    sincronización. Publicar un enlace no gasta ninguna.
  - **Lo que se publica y lo que no.** Juego, nota, texto completo, plataformas, géneros, puntos fuertes y débiles,
    nick y fecha. Nunca el correo, el identificador, los identificadores de Gist, las horas de juego, la foto de
    perfil ni el resto de la biblioteca. Lo garantizan un esquema Zod de allowlist estricta y una lista de campos
    prohibidos, validados en el navegador y **otra vez** en el servidor, que es la que cuenta.
  - **La foto de perfil no viaja en el artículo**, y no por cómo se pinta: ocultarla al renderizar no serviría de
    nada porque el JSON llegaría igual al navegador de un desconocido.
  - **El nick lo pone el servidor**, leído del perfil con el token de quien publica: nadie puede firmar una reseña
    con el nombre de otra persona. Y el diálogo lo enseña antes de publicar, para que nadie descubra con qué nombre
    ha firmado cuando la reseña ya está en internet.
  - **Cuántos y cuánto duran**, según el rango del perfil: bronce 5 enlaces de 7 días, plata 10 de 10 días, oro 15
    de 14 y mithril 50 de 90. No es un cupo que se gaste: caducan solos y retirar uno libera el hueco al instante.
    A diferencia de los límites de publicación en el feed, esta cuota la aplica el **servidor**, porque lo que
    gobierna es almacenamiento del servicio y no un recurso del usuario.
  - **Volver a compartir la misma reseña la actualiza** sobre el mismo enlace, sin gastar cuota: así el que ya
    circula por un chat sigue vivo en vez de morir mientras otro nuevo da vueltas en paralelo.
  - **Página pública** en `/r/:token`, legible sin cuenta. Para quien no tiene la aplicación en ese navegador se
    monta sola, sin hub social, sin Firebase, sin analítica y sin instalar nada: sin cabecera, sin volver atrás, con
    el nombre del autor como texto plano —su perfil no es público— y una barra inferior con una única salida a la
    página principal.
  - **Previsualización en redes sociales**: una Pages Function reescribe el título y las etiquetas Open Graph con
    el juego, la nota y el arranque del texto. La sustitución la hace un parser de verdad (HTMLRewriter), que es lo
    que impide que el texto de un usuario inyecte marcado en los metadatos.
  - **Gestión en Cuenta**: los enlaces activos con su caducidad, el contador y «Dejar de compartir» —que se llama
    así y no «Borrar» porque retirar un enlace lo deja inaccesible, pero no recoge las copias que ya circulen.
  - **Moderación en `/admin`**, dentro de la ficha de cada usuario: sus enlaces, retirar cualquiera, vetarle la
    posibilidad de compartir (con o sin retirar lo ya publicado) y ajustarle la cuota por encima o por debajo de su
    rango. Todo con confirmación previa, como el resto del panel.
  - **Borrar la cuenta retira los enlaces** antes de borrar el perfil. Sin eso, el derecho de supresión quedaba
    incompleto: las reseñas seguirían siendo públicas hasta caducar.

### Changed
- **Los textos legales declaran el enlace público**: qué se publica, qué no, cuánto dura, que la copia es una foto
  del momento, que el destinatario pasa a ser cualquiera con el enlace, y que retirarlo no recoge lo ya compartido.
  Sube `LEGAL_VERSION`, así que la puerta del hub vuelve a pedir la conformidad.
- **Los enlaces compartidos se gestionan en «Cuenta»**, no en «Ajustes»: no son una preferencia de la aplicación,
  son contenido tuyo publicado en internet.
- El icono de compartir es el `share` de Material Symbols, la misma familia que el resto del catálogo.

### Fixed
- **La previsualización al compartir cualquier enlace de la aplicación estaba rota desde siempre**, por dos motivos
  a la vez: `og:image` apuntaba a un SVG —formato que ni X, ni WhatsApp, ni Facebook, ni LinkedIn renderizan— y
  `robots.txt` bloqueaba por nombre a los agentes que generan esas tarjetas. Ahora la imagen es un JPEG generado
  desde el mismo SVG (que sigue siendo la fuente editable) y esos agentes tienen permiso **solo** en `/r/`, sin
  abrir el resto del sitio ni permitir que nada se indexe.
- El subtítulo de la tarjeta de previsualización se salía del lienzo con la tipografía real; no se veía porque
  nadie la rasterizaba.

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
