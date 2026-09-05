# Plan: logros

> Objetivo: reconocer lo que el usuario ya hace con su biblioteca —y empujar con tacto lo que mejora sus propios
> datos— con una vitrina que se vea en su panel (`/perfil`) y en la ficha de un amigo
> (`/social/profiles/:profileId`), **sin un evento nuevo en el gist de juegos**, sin backend que valide nada y con
> contenido que siga dando de sí durante años sin tener que inventar logros nuevos cada temporada.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al abordar cada paso, verifica el estado
> real del código (las líneas citadas pueden haberse movido) y actualiza este `.md`. Trátalo como código: se
> revisa con la implementación.

## Decisiones tomadas

| Decisión | Valor |
|---|---|
| Superficies | `/perfil` (los tuyos) y `/social/profiles/:profileId` (los de una amistad). **Nada en `/r/:token`** |
| Fuente de verdad | **Derivación pura** de la biblioteca, como `computeStats`. Ni cola de eventos, ni campo nuevo en `GameItem` |
| Canal hacia los demás | **Firestore**, en `profiles/{uid}.achievements`, empaquetado en una cadena con tope duro |
| Qué NO da ese canal | Verificación del hecho de fondo (§4). Da propiedad, forma y tamaño; no da prueba |
| Catálogo | Cuatro familias: **espejo** (lo que ya haces), **datos** (rellenar la ficha), **social** y **primeros pasos** (§6) |
| Escalonado | Cada logro tiene niveles; los hay **abiertos** (sin techo) y **repetibles por año natural** (§6.3) |
| Un logro nunca se retira | Marca de agua: lo conseguido no se pierde aunque la biblioteca encoja (§5.5) |
| Visibilidad | Los ve **toda amistad**, con **interruptor de opt-out** del dueño (§8.3). Sin puertas por rango |
| Comparación entre usuarios | **No hay.** Ni ranking, ni «tú 12 – él 30», ni contadores de visitas |
| Aviso a las amistades | Sí, en el feed, pero **deducido al leer** (§8.4): no publica ni un byte nuevo |
| Recompensa | **Solo cosmética**: temas desbloqueables (§6.5). Ninguna funcionalidad depende de un logro (§4) |

**Lo que NO se hace:** no se escribe nada en los gists (ni el de juegos ni el social); no se añade ningún campo a
`GameItem` ni al esquema del canal social; no hay logros por abrir la app a diario; no hay clasificación global
entre usuarios; no se cuentan visitas de ningún enlace; no se notifica nada fuera de la propia app.

---

## 1. Por qué derivar y no registrar

La tentación evidente es un registro de eventos: cada vez que pasa algo, se apunta y se comprueba si desbloquea
algo. Aquí eso es exactamente lo que no hay que hacer, y el repositorio ya tiene la lección aprendida y escrita en
`core/social/moveActivity.ts`:

> «La misma biblioteca produce siempre los mismos mensajes, con la misma fecha, se publique una vez o veinte,
> desde este dispositivo o desde otro. No hay cola de eventos que se pueda perder ni duplicar.»

Un registro de logros pagaría **tres precios** que este proyecto ya sabe lo que cuestan:

1. **Merge CRDT.** Cualquier campo nuevo dentro de `GameItem` entra en el LWW del objeto entero, así que un
   cliente antiguo que edite el juego se lo lleva por delante (lo dice el propio comentario de `enteredAt`). Un
   contador de logros perdido no se auto-repara como un sello: se pierde el logro.
2. **Sincronización.** Un documento que solo crece y que dos dispositivos escriben a la vez es precisamente la
   forma de los fallos que ya costaron caros aquí (el `dirty` que no se empujaba en un 304, la foto rancia del
   render que revertía ediciones).
3. **Retroactividad.** Con registro, quien importa 300 juegos no desbloquea nada, porque «no pasó mientras la app
   miraba». Con derivación, su biblioteca cuenta desde el primer día — que es lo que cualquiera espera.

Derivar tiene una contrapartida y conviene decirla: **solo se puede reconocer lo que la biblioteca sabe fechar**.
Los sellos disponibles son `listedAt`, `enteredAt` (primera entrada a cada lista), `reviewedAt`, `gradedAt` y
`years`. Lo que no deje huella en ellos no puede tener logro con fecha; puede tenerlo sin ella (§5.3).

---

## 2. Contexto de arquitectura (para quien implemente)

| Dato | Dónde vive | Quién lo ve |
|---|---|---|
| La biblioteca completa (`TabData`) | Gist de juegos, privado; espejo en IndexedDB | Su dueño; una amistad baja el gist para pintar su ficha, filtrado por `applyProfileVisibility` |
| Proyección pública (`PublicGame`) | Gist social, allowlist Zod estricta | Cualquier amistad |
| Perfil público | `profiles/{uid}` en Firestore | **Cualquier usuario autenticado** con `social.enabled == true` |
| Preferencias del dueño | `publicConfig/{uid}` | Solo el dueño (sincroniza entre dispositivos) |
| Reseña compartida | Cloudflare KV | Cualquiera con el enlace |

Tres hechos del código que mandan sobre todo lo que sigue:

- **`computeStats` es puro y de una sola pasada**, no consulta red y no persiste nada
  (`core/stats/computeStats.ts`). El módulo de logros se escribe con el mismo contrato.
- **El hub ya descarga `profiles/{uid}`** para el directorio y para la ficha de un perfil
  (`SocialDirectoryEntry`, `firebaseClient.ts:64`). Un campo ahí llega **sin una sola lectura extra**.
- **El panel de estadísticas entra por `lazy()`** y arrastra ~96 kB. `ci-validate` corta si el arranque crece,
  así que el evaluador de logros **no puede importar `core/stats`** (§7.2).

---

## 3. Qué se ve y dónde

**En `/perfil`** — es tu panel, así que aquí se ve todo: los conseguidos, los que están a medias con su barra de
progreso, y los que ni han empezado. Es la pantalla que da el «siguiente paso».

**En `/social/profiles/:profileId`** — es la ficha de otra persona, así que aquí se ve **solo lo conseguido**. El
progreso de un amigo hacia algo que no tiene no es asunto de nadie, y publicarlo diría cuántas horas anota o
cuántas reseñas lleva por una puerta lateral. La vitrina es una lista de medallas, no un informe.

---

## 4. El punto incómodo: qué seguridad da Firestore y cuál no

Guardarlos en Firestore es la decisión correcta, pero conviene ser exacto con lo que compra, porque la intuición
(«en el servidor no se puede trampear») no se cumple aquí:

**Lo que SÍ garantiza:**

- **Propiedad.** `allow create, update: if isOwner(userId)`: nadie puede escribir logros en el perfil de otro. Es
  la garantía que de verdad importa y la que un gist no da igual de bien.
- **Forma y tamaño.** La allowlist `hasOnly` de `profileWriteIsValid()` impide inventarse campos, y un tope de
  bytes impide que alguien infle lo que se descarga el directorio entero (§9.2).
- **Rastro.** El panel `/admin` ya lee estos documentos: un blob manipulado es visible y sancionable.
- **Coherencia.** Todo el mundo ve lo mismo que ve el dueño, incluso lo que se calcula con sellos privados que
  nunca salen del aparato (`enteredAt`) o de listas que el dueño esconde.

**Lo que NO garantiza, y no puede:**

- **El hecho de fondo.** La biblioteca vive en un gist de GitHub que ningún servidor nuestro lee. Nadie puede
  comprobar que hayas terminado 100 juegos: el cliente lo calcula y lo declara. Es exactamente el mismo modelo de
  confianza que el resto del canal social, y está dicho tal cual en `tiers.ts`: *«esto lo aplica el cliente, así
  que es un privilegio NO exigible»*.
- **Validación por elemento.** El lenguaje de reglas **no tiene bucles**: no se puede recorrer una lista de logros
  para validar cada uno. Se valida el conjunto (tipo, claves, tamaño); el resto lo hace un parser defensivo en el
  cliente que lee (§9.3).
- **Monotonía.** Por lo mismo, las reglas no pueden exigir «un nivel nunca baja». Se podría atar `at` a que no
  retroceda, pero no aporta gran cosa cuando el contenido no es verificable.

**Consecuencia de producto, y va en el documento a propósito:** los logros son un **adorno con nombre**, no una
credencial. Ninguna funcionalidad de la app puede depender de ellos (nada de desbloquear rangos, cuotas de
compartir ni bloques de estadísticas por logros): eso convertiría un adorno autodeclarado en una escalada de
privilegios. Los rangos los sigue asignando el administrador y las cuotas las sigue aplicando la Function.

> Curiosidad útil: los **únicos** logros verificables de verdad son los sociales, porque su dato sí vive en un
> servidor (amistades en Firestore, enlaces en KV). Si algún día hiciera falta una marca de «verificado», ahí es
> donde puede ponerse — y solo ahí.

---

## 5. Modelo de datos

Tres piezas, y solo una de ellas se persiste en un canal compartido.

### 5.1 El catálogo (código, no datos)

`src/core/achievements/catalog.ts`. Una tabla declarativa; añadir un logro es añadir una entrada, nunca tocar la
vista.

```ts
export interface AchievementDef {
  /** Identificador ESTABLE. Nunca se renombra ni se reutiliza: viaja en el canal y en el estado local. */
  id: string;                       // p. ej. 'creditos', 'constancia', 'fichas-completas'
  family: 'mirror' | 'data' | 'social';
  /** Umbrales de cada nivel, ascendentes. El último puede ser abierto (§6.3). */
  steps: readonly number[];
  /** Métrica que se compara con los umbrales, y de dónde sale su fecha. */
  metric: (input: AchievementInput) => AchievementMeasure;
  /** Textos: nombre por nivel, qué mide y cómo se dice en el perfil de otra persona. */
  labels: AchievementLabels;
  icon: IconName;
  /** Versión del catálogo en la que entró. Documental: sirve para leer el histórico de este fichero. */
  since: string;
}

/** Lo que devuelve una métrica: cuánto llevas y CUÁNDO alcanzaste cada umbral. */
export interface AchievementMeasure {
  value: number;
  /** Instante en que se alcanzó cada umbral, mismo índice que `steps`; 0 = alcanzado sin fecha deducible. */
  at: number[];
}
```

**Por qué la fecha la da la métrica y no un sello guardado.** Contar «cuántos» es fácil; saber «cuándo llegaste a
50» exige ordenar los hechos por su sello y quedarse con el que hace el número. Eso solo lo sabe la métrica, que
es la que conoce qué sello mira cada logro (`enteredAt.c` para los terminados, `reviewedAt` para las reseñas…).
Y como el sello es estable, la fecha **converge**: dos dispositivos calculan la misma sin hablar entre ellos.

### 5.2 El resultado (memoria, efímero)

```ts
export interface AchievementState {
  id: string;
  level: number;        // 0 = no conseguido
  value: number;        // progreso actual
  next: number | null;  // umbral del siguiente nivel; null = tope alcanzado
  unlockedAt: number;   // fecha del nivel actual; 0 = sin fecha deducible
}
```

### 5.3 El espejo (Firestore, `profiles/{uid}.achievements`)

```ts
{
  v: 1,                 // versión del formato de empaquetado
  at: 1789000000000,    // cuándo se publicó (para el saneado y el panel de admin)
  list: "creditos.3.2311,constancia.2.2280,resenas.4.2295"
}
```

`list` es **una cadena empaquetada**, y no una lista de objetos, por dos motivos concretos:

1. **Las reglas no saben iterar** (§4). Un array de mapas solo se puede validar «por encima»; una cadena se valida
   por lo único que de verdad protege el coste ajeno: su **tamaño**.
2. **El directorio se lo descarga entero.** El hub lee hasta `SOCIAL_DIRECTORY_LIMIT` perfiles por apertura. Con
   ~14 bytes por logro, cuarenta logros son ~560 bytes: cincuenta perfiles ≈ 28 kB, del orden de lo que ese
   documento ya mueve. Con objetos JSON sería el triple por el mismo contenido.

**Gramática:** entradas separadas por `,`; cada entrada es `id.nivel[.día][!]`, donde `día` son los días
transcurridos desde `2020-01-01` en la hora local del dueño. Sin la tercera parte, el logro está conseguido pero
sin fecha (biblioteca antigua sin sellos). El `!` final marca los **destacados** por el dueño (§8.2), como mucho
tres; el que lea aplica ese tope aunque lleguen más. **Solo se publican los logros CONSEGUIDOS** (nivel ≥ 1): el
progreso hacia lo que no se tiene no sale del aparato (§3). Los de la familia *primeros pasos* **no se publican
nunca** (§6.2).

**Granularidad de día, no de instante**, y es deliberado: un sello al minuto dice a qué horas usas la app, que es
justo el dato que `applyProfileVisibility` borra de los listados que baja una amistad. El día basta para pintar
«conseguido en marzo de 2026».

### 5.4 Lo local (`LocalMeta`, nunca sube)

```ts
achievementsPublished?: string;  // último `list` ya escrito en Firestore: evita reescribir lo mismo (§9.1)
achievementsSeen?: string;       // lo que el dueño ya ha visto: alimenta el aviso de «nuevos» (§7.3)
achievementsSeenAt?: number;
achievementsPeak?: string;       // marca de agua: el nivel más alto alcanzado por cada logro (§5.5)
```

Mismo patrón y mismo motivo que `friendshipHealedForGist` y `backlogHistory`: es estado de dispositivo, no dato
del usuario.

### 5.5 Un logro no se retira: la marca de agua

**El agujero que hay que tapar.** Derivar tiene un efecto que no se ve hasta que ocurre: si el número baja, el
logro desaparece. Borras cinco juegos duplicados, le quitas la marca `scored` a un abandono, corriges unos años
mal puestos — y una medalla que llevaba meses ahí se esfuma. Es la única cosa que un sistema de logros no puede
hacer: **lo conseguido no se devuelve.**

**La regla:** el nivel que se muestra y se publica es `max(derivado, marca de agua, publicado)`.

La marca de agua vive en `LocalMeta` (§5.4) y **el propio espejo actúa de segunda copia**: al publicar se lee lo
que ya había en `profiles/{uid}` y se toma el máximo. Eso hace que el mecanismo **converja entre dispositivos sin
sincronizar nada** —un aparato que estrena instalación recupera del espejo lo que él nunca vio— y que se
auto-repare, que es exactamente la propiedad que tiene el resto del sistema (§1).

**La fecha se queda con el nivel.** Si el nivel actual lo sostiene la marca de agua y no el cálculo de hoy, la
fecha es la que se guardó entonces: recalcularla diría que lo conseguiste hoy, que es falso.

**Letra pequeña, dicha aquí y no descubierta después.** El máximo es acumulativo, así que **también hace
permanente un nivel inyectado a mano**: quien manipule su cliente y publique `creditos.9` se lo queda, porque su
propio cliente lo republicará. Se acota con dos cosas y no hay una tercera: el nivel se recorta al máximo que el
catálogo define para ese logro (§9.3), y el administrador puede purgar el campo (§9.4). Es coherente con el §4:
esto es un adorno, y el precio de que no se pierda nunca es que tampoco se pierde lo falso.

---

## 6. El catálogo

### 6.1 Principio rector

**Se premia lo que ya ibas a hacer, o lo que mejora tus propios datos.** Nunca lo que ensucia el espacio de los
demás ni lo que obliga a abrir la app por abrir. La regla práctica para admitir un logro nuevo: *si la única
forma de conseguirlo es hacer algo que te da igual, no entra en el catálogo.*

### 6.2 Las cuatro familias

**Espejo — lo que ya haces.** Sale de la biblioteca; no pide ningún cambio de conducta.

| Logro | Métrica | Sello para la fecha |
|---|---|---|
| Créditos finales | Juegos completados | `enteredAt.c` |
| Saber soltar | Abandonos con razón anotada | `enteredAt.v` |
| Constancia | Mejor racha de semanas seguidas con actividad | `reviewedAt` / `enteredAt` |
| Mundo ancho | Géneros distintos con al menos un juego cerrado | `enteredAt` del que estrena género |
| Politeísta | Plataformas distintas | ídem |
| Segunda vuelta | Vueltas extra registradas (`years` por encima de la primera) | último año de `years` |
| Maratón | Juegos con 60 h o más anotadas | `enteredAt.c` |
| La paciencia | Juegos que esperaron más de un año en Próximos y acabaron terminados | `enteredAt.c` |
| Criterio propio | Desviación típica de tus notas, con un mínimo de notas puestas | `gradedAt` |
| Memoria larga | Años naturales distintos con algo completado | fin del año que lo cumple |
| Deshielo | Meses seguidos en que Próximos acabó con menos juegos de los que empezó | curva derivada (§6.2.1) |
| Limpieza de estantería | Juegos que salieron de Próximos hacia una lista jugada | `enteredAt` de la lista de destino |
| Veterano | Años con perfil, desde `profiles.createdAt` | el propio `createdAt` |

**«Veterano» es el único logro verificable de todo el catálogo**, y por eso está: `createdAt` lo sella el cliente
al crear el perfil y a partir de ahí **las reglas lo congelan** (`profileCreatedAtIsImmutable`), incluso para su
dueño. No se puede falsear sin que el panel de administración lo cante — de hecho ya existe la señal
`created-after-activity` para justo eso. Un catálogo entero de cosas autodeclaradas gana bastante con tener al
menos una que no lo es.

#### 6.2.1 El backlog, derivado del gist y no del aparato

Los dos logros de pendientes **no usan `backlogHistory`**. Esa serie es una instantánea mensual que vive en el
meta de IndexedDB, es **local y por dispositivo**, y su propio módulo lo dice: quien use dos aparatos tendrá dos
series parciales. Un logro calculado con eso diría cosas distintas en el móvil y en el portátil, que es
precisamente lo que no puede pasar con algo que se publica.

La fuente es **`enteredAt`, que sí viaja en el gist** y es un sello estable: de cada juego se sabe cuándo entró la
primera vez en Próximos y cuándo entró en la lista jugada que lo sacó de ahí. Con eso se reconstruye el **stock**
de pendientes mes a mes, y la reconstrucción es idéntica en cualquier dispositivo y en cualquier momento, que es
la propiedad que pide el §1.

Dos honestidades que van escritas en el propio logro:

- **No es la misma curva que pinta el gráfico.** El gráfico del panel usa `arrivals` (derivado de `listedAt`, que
  se reescribe al mover) o el histórico real si lo hay. Aquí se mide el stock con `enteredAt`. Que las dos cifras
  no cuadren al dedillo es correcto: miden cosas distintas. Lo que no puede pasar es que el logro diga una cosa y
  el gráfico la contraria, así que el test de coincidencia del §7.2 cubre también el sentido de la curva.
- **Las bibliotecas antiguas empiezan más tarde.** `enteredAt` es un campo reciente; los juegos anteriores solo
  tienen resembrado el sello de su lista actual (`normalizeGame`), así que la curva arranca donde arranca el
  sello. Se cuenta desde ahí, sin inventar meses previos.

**Datos — rellenar la ficha.** Aquí sí hay empuje, y es el empuje bueno: cada campo que se rellena mejora **las
estadísticas del propio usuario**. Es el único caso en que pedir algo tiene una contraprestación inmediata y
visible para quien lo hace.

| Logro | Métrica |
|---|---|
| Cronómetro | Juegos con horas anotadas |
| Palabra escrita | Reseñas escritas |
| Sin dejar cabos | Cobertura: % de lo cerrado (terminado + abandonado) que tiene reseña |
| Ficha completa | Juegos con géneros, plataforma, nota y reseña, los cuatro |
| Autopsia | Abandonos con razón anotada y reseña |
| Luces y sombras | Reseñas con puntos fuertes **y** débiles |

**Social — con los demás.** La familia delicada. Aquí los umbrales son **bajos y planos**, y el escalón alto mide
**constancia, no volumen**:

| Logro | Métrica | Por qué así |
|---|---|---|
| Buena compañía | Amistades confirmadas (1 / 3 / 10) | Se corta pronto a propósito: un logro por sumar contactos es una invitación a coleccionar desconocidos |
| Conversador | **Semanas distintas** con alguna publicación (2 / 8 / 26) | Si midiera publicaciones, el premio sería llenar el feed ajeno. Midiendo semanas, el premio es aparecer de vez en cuando |
| Puertas afuera | Enlaces de reseña creados (1 / 5 / 25) | Contador **acumulado en local**: el índice de KV solo tiene los **activos**, así que no sirve para contar historia (§12) |

**Primeros pasos — conocer la app.** Un puñado de logros de un solo nivel que enseñan lo que existe a quien acaba
de llegar: escribir la primera reseña, conectar la sincronización, poner la primera nota fina, probar la ruleta,
estrenar un tema. Tienen **tres reglas propias** que los separan del resto:

1. **No se publican nunca** (§5.3). La vitrina de alguien con quinientos juegos no puede empezar por «escribió su
   primera reseña»: ahí serían ruido, y además ocupan espacio en una cadena con tope.
2. **No dan recompensa cosmética** (§6.5). Si desbloquearan tema, dejarían de ser una guía para convertirse en un
   peaje de bienvenida.
3. **Se apagan solos.** Conseguidos todos, la sección desaparece del panel y no vuelve. No es una categoría
   permanente que quede a medias para siempre en la cuenta de «14 de 48».

> El riesgo de esta familia es convertir la bienvenida en un tutorial con premios. Se controla con el tamaño: si
> pasa de seis o siete entradas, ya no está enseñando la app, está pastoreando al usuario.

### 6.3 Que dure años sin catálogo nuevo

Tres mecanismos, ninguno con backend:

1. **Metas abiertas.** El último escalón de las familias de conteo no es un tope, es un **paso**: alcanzado el
   nivel 4 (p. ej. 400 completados), cada N más suma un nivel. En el espejo eso es `creditos.7`, el mismo espacio
   de siempre; en la vitrina, «Créditos finales VII». Quien lleva años usando la app sigue teniendo siguiente paso.
2. **Repetibles por año natural.** «Año redondo» (doce meses con actividad) y «Buena cosecha» (X juegos
   terminados en un año) se pueden conseguir **una vez por año**, y su nivel es *cuántos años lo has cumplido*. El
   calendario fabrica contenido nuevo solo, sin tocar el catálogo.
3. **Foco rotatorio.** El panel destaca cada mes un logro del catálogo, elegido por una función determinista de
   `(año, mes)`. Cero infraestructura, el mismo para todo el mundo, y hace que la pantalla no diga siempre lo
   mismo. No cambia ninguna regla: solo dónde mira el ojo.

### 6.4 Reglas del catálogo, para no romper el canal

- **Un `id` no se renombra ni se reutiliza jamás.** Viaja en la cadena empaquetada y en el estado local de todos
  los dispositivos.
- **Un logro retirado no se borra**: se marca `retired` y deja de ofrecerse, pero se sigue pintando a quien ya lo
  tiene publicado. Quitarlo del catálogo haría desaparecer medallas ajenas de un día para otro.
- **Un `id` desconocido al leer se ignora en silencio** (compatibilidad hacia delante: un amigo con una versión
  más nueva publicará logros que este cliente no conoce). Nunca es un error de parseo.
- **Los umbrales no se endurecen.** Subir el listón de un nivel ya concedido lo retira retroactivamente a quien lo
  tenía, y eso es lo único que la gente no perdona en un sistema de logros. Si un listón está mal, se crea otro
  logro. (La marca de agua del §5.5 amortigua el accidente, pero no es excusa para provocarlo.)

### 6.5 La recompensa: temas, y nada más

Un logro puede desbloquear **una paleta**. Nada más: ni cuota, ni rango, ni bloques de estadísticas, ni nada que
otro usuario pueda notar (§4). Lo cosmético es el único terreno donde una recompensa autodeclarada es inocua —
quien se la autoconceda manipulando su cliente se ha regalado un tema a sí mismo, y ahí se acaba el daño.

**Por qué encaja tan bien aquí:** añadir un tema ya es una operación aditiva y documentada paso a paso en la
cabecera de `core/constants/palettes.ts` (registro, tokens en `_base.scss`, `theme-init.js`, skin opcional). Cada
tema nuevo puede llegar con su logro, y eso es contenido nuevo de verdad —algo que ver y que tener— sin tocar ni
una regla del sistema. Es el tercer mecanismo de longevidad, junto a las metas abiertas y los repetibles (§6.3).

**Reglas de la puerta:**

- El desbloqueo **no se retira jamás**: se apoya en la marca de agua (§5.5). Quitarle a alguien el tema con el que
  usa la app a diario sería el peor fallo posible de todo esto.
- El tema bloqueado **se ve en el selector**, apagado y diciendo qué lo abre. Un premio que no se sabe que existe
  no motiva a nadie; y esconderlo del selector obligaría a que el selector supiera de logros, en vez de leer
  `PALETTES` como hace hoy.
- Los temas **que ya existen siguen siendo libres**. Esto se estrena con temas nuevos: quitarle a la gente uno que
  ya usa para «ponerlo de premio» es exactamente lo que el punto anterior prohíbe.
- La puerta la aplica el cliente, como la cadencia del feed y los topes de publicación (`tiers.ts`). No es una
  barrera de seguridad y no hace falta que lo sea.

---

## 7. Cálculo

### 7.1 Entradas

```ts
evaluateAchievements({
  games: TabData,                    // la biblioteca, ya cargada en memoria
  social: {                          // contadores que no salen de la biblioteca
    friends: number,                 // de `MyFriendships` (ya cargado por el hub)
    postWeeks: number,               // semanas distintas con publicación, del gist social propio
    sharesCreated: number,           // acumulado local (§12)
    profileCreatedAt: number,        // `profiles.createdAt`, inmutable por reglas: el logro de antigüedad
  },
  peak: string,                      // marca de agua: nada baja de aquí (§5.5)
  now: number,
}): AchievementState[]
```

`now` entra por parámetro y no se lee del sistema: función pura, testeable con fechas fijas, igual que
`computeStats`.

**Los contadores sociales pueden faltar, y no pasa nada.** Al publicar a rebufo de una reseña (§9.1) el hub puede
no estar abierto y el grafo de amistades no estar cargado: esos contadores llegan a cero y sus logros evalúan a
cero. La marca de agua (§5.5) es justo lo que impide que eso **retire** lo ya conseguido, así que no hace falta ni
bloquear la publicación ni ir a buscar datos que no están a mano. Se ponen al día en la próxima apertura del hub.

### 7.2 Dónde corre y cuánto cuesta

Una pasada sobre la biblioteca, dentro de `core/achievements/evaluate.ts`. Para 2.000 juegos son unos pocos
milisegundos, y se memoiza contra el mismo estado que ya memoiza el panel.

**El evaluador NO importa `core/stats`.** Necesita cifras que `computeStats` ya calcula, pero importarlo
arrastraría el chunk perezoso del panel (~96 kB) a cualquier sitio desde el que se publique, y `ci-validate`
corta por presupuesto de arranque. Se duplica lo mínimo, apoyándose en los helpers compartidos que ya existen
(`resolveGrade`, `localWeekKey`, `sortEs`).

> **Trampa a cerrar con un test, no con disciplina.** Dos contadores de lo mismo divergen tarde o temprano, y el
> usuario ve «312 terminados» en el panel y un logro que cuenta 310. Hay un test que fija, sobre una biblioteca de
> ejemplo, que las métricas de conteo del evaluador coinciden con las cifras equivalentes de `computeStats`.

### 7.3 Retroactividad y el aviso de novedades

Al derivar, una biblioteca importada desbloquea veinte logros de golpe. Eso está **bien** (son suyos), pero no
puede convertirse en veinte avisos de «¡nuevo!» sobre cosas que pasaron en 2014.

La regla: se marca como novedad lo que cumple **las dos** condiciones —no estaba en `achievementsSeen`, y su
`unlockedAt` cae dentro de los últimos 30 días—. Todo lo demás aparece ya conseguido, sin fanfarria. La primera
evaluación en un dispositivo siembra `achievementsSeen` sin avisar de nada.

**Nada de notificaciones.** El aviso es un punto en la pestaña del panel y una tira de novedades al abrirlo. Ni
push, ni modal, ni interrupción de lo que el usuario estaba haciendo.

---

## 8. Interfaz

### 8.1 `/perfil` — los tuyos

- **En el panel**, una cifra destacada más («Logros 14/48») junto a las que ya existen, y la tira de novedades si
  la hay. Nada más: el panel ya está lleno y los logros no son su tema.
- **`/perfil/logros`**, sub-ruta propia con la rejilla completa, exactamente el patrón que ya usa
  `/perfil/resenas` (ver `StatsHub`: `PANEL_ROUTE` / `REVIEWS_ROUTE`). Agrupada por familia, con los conseguidos
  arriba y el progreso de cada uno abajo.
- La hoja de estilos entra en el chunk perezoso del panel, como `stats.scss`.

### 8.2 `/social/profiles/:profileId` — los de una amistad

Una **vitrina**: fila de medallas conseguidas bajo la cabecera del perfil, con su nombre y su fecha. Sin barras de
progreso y sin huecos de lo que no tiene (§3). Es una lectura del espejo ya descargado: **cero peticiones nuevas**.

Si el perfil no publica logros (opt-out, o cliente antiguo), **la vitrina no se pinta**. Ni marco vacío ni «este
usuario no tiene logros»: no hay nada que decir.

**Destacados.** El dueño puede fijar hasta **tres** medallas que van primero (marca `!` en la cadena, §5.3). Es
personalización real por unos pocos bytes, y resuelve el problema de que la vitrina de alguien con treinta
medallas se lea toda igual: lo que esa persona quiere enseñar de sí misma lo decide ella, no el orden del
catálogo. Sin destacados, el orden es por familia y luego por nivel. El que lee **recorta a tres** aunque lleguen
más marcados: es una preferencia ajena, no una instrucción.

### 8.3 El interruptor

En el editor del perfil social, junto a los que ya hay (foto, listas ocultas). Su valor vive en
`publicConfig/{uid}.showAchievements`, con el mismo mecanismo que `feedMoveTabs` (`createPreferenceStore` con
`cloudField`, ver `feedMovePreference.ts`), para que siga al dueño entre dispositivos.

**Apagarlo BORRA el campo del perfil público** (`deleteField()`), no lo esconde al pintar. Es la misma lección que
la foto del autor en las reseñas compartidas: *ocultar al pintar no sirve de nada cuando el JSON llega igual al
navegador del que mira*.

### 8.4 Novedades de tus amistades, sin publicar nada

En el feed aparece «*Fulano* ha conseguido **Créditos finales IV**». Y **no cuesta ni un byte de canal**: el hub ya
cachea el directorio en IndexedDB, así que el lector compara el espejo que acaba de bajar con el que tenía
guardado de esa persona y deduce el cambio él solo. Ninguna escritura nueva, ningún campo nuevo, ninguna entrada
en el gist social.

Es la misma idea que sostiene todo el documento —derivar en vez de registrar— aplicada al otro lado del canal.

Reglas para que no se convierta en ruido, calcadas de las que F4 se puso a sí mismo:

- **Solo lo reciente.** Un logro cuyo día caiga fuera de los últimos 30 no se anuncia, aunque el lector lo vea por
  primera vez. Sin esto, quien lleva un mes sin abrir el hub recibe treinta anuncios de golpe (§7.3).
- **Uno por persona y día.** Si a alguien le suben tres medallas la misma tarde, se cuenta una vez: «ha conseguido
  tres logros». Es la regla de `keepLatestPerDay` de los mensajes de lista, por el mismo motivo.
- **La primera vez no anuncia nada.** Sin caché previa no hay «cambio», hay una foto inicial. Sembrar y callar.
- **Respeta el opt-out** por construcción: quien no publica no tiene espejo que comparar.

### 8.5 Diseño de las medallas

**El contrato visual ya está inventado en esta casa y es el de los rangos.** `_tiers.scss` lo dice en su cabecera:
*«cada clase solo aporta su color de metal en `--tier`; quien la use decide la forma»*, y de ahí sale la muesca de
la tarjeta del directorio, que no añade un adorno encima sino que **tiñe un tramo del borde que ya estaba ahí**.
Las medallas van igual: un token `--medal` por nivel, una forma base sobria, y que **cada tema las vista** en su
`themes/*.scss` si tiene algo que decir. Acabado sobre el diseño base, no un lenguaje visual paralelo.

**Trampa de chunk, y es de las que muerden en silencio.** Las medallas se pintan en **dos pantallas de dos chunks
perezosos distintos**: `/perfil/logros` (que carga `stats.scss`) y la ficha del hub social (`social.scss`).
Colgarlas de cualquiera de las dos hojas deja la otra pantalla **sin estilos y sin que salte ningún error** — es
exactamente lo que ya pasó con `ProfileReviewsList` en `/perfil/resenas` y con el medallón de la nota en
`/r/:token`. La solución tampoco es meterlas en el arranque, que tiene presupuesto vigilado
(`BOOT_PAYLOAD_BUDGET_KB`): **hoja propia, `styles/achievements.scss`, importada desde el componente de la
medalla**, igual que se hizo con `styles/reviews.scss`.

**Especificidad.** Los skins de paleta escriben `:root[data-palette="x"] .foo`, que pesa **(0,3,0)**. Una regla
normal de (0,2,1) pierde, y el síntoma es de manual: el ajuste «funciona» en el tema por defecto y no en los
otros cinco. Al medir, mirar el color calculado **en las seis paletas**, no solo en la clásica.

**Celebración.** El destello del desbloqueo va detrás de `data-effects` (la preferencia ya existe y ya sincroniza)
y de `prefers-reduced-motion`. Nunca un modal: un punto en la pestaña y la tira de novedades, como dice el §7.3.

**Accesibilidad.** Metal, brillos y degradados son el punto ciego conocido de las auditorías automáticas, que no
ven ni el `text-shadow` ni el contraste no textual. Reglas de partida: **el nivel nunca se dice solo con el
color** (el numeral va en texto), cada medalla tiene nombre accesible con su nivel y su fecha, y el brillo es
decorativo (`aria-hidden`). Y medir **con las animaciones quietas**: a mitad de transición salen falsos positivos.

---

## 9. Publicación

### 9.1 Cuándo se escribe

**A rebufo, nunca por su cuenta.** Es la misma decisión que F4 tomó con los mensajes de lista: mover un juego no
pide su propia escritura. El espejo se recalcula y se adjunta a una escritura del perfil que ya iba a ocurrir
(publicar una reseña, guardar el perfil, el latido diario de `profileTouchedAt`) y, si no ha ocurrido ninguna, al
abrir el hub social.

Antes de escribir se compara la cadena con `achievementsPublished` (§5.4): **si no ha cambiado, no se escribe
nada**. Coste real esperado: una o dos escrituras al día y por usuario, en el mismo `merge` que ya se hacía.

Si la escritura falla, no se reintenta ahí mismo: la cadena se recalcula sola la próxima vez. No hay nada que
perder porque no hay nada que no se pueda volver a derivar — que es todo el punto del §1.

**Detrás de un interruptor de despliegue.** La escritura del espejo va gated (`ENABLE_ACHIEVEMENTS_PUBLISH`, mismo
patrón que `ENABLE_SOCIAL_WRAPPER_WRITE`), y por el mismo motivo: permite entregar y probar la fase 3 entera —el
empaquetado, las reglas, el opt-out— **sin abrir todavía la puerta**, y cerrarla en caliente si algo sale mal sin
tener que revertir la versión.

### 9.2 Reglas de Firestore

En `profileWriteIsValid()`, añadir `"achievements"` al `hasOnly` y una validación propia:

```
function profileAchievementsAreSane() {
  return !("achievements" in request.resource.data)
    || (request.resource.data.achievements is map
        && request.resource.data.achievements.keys().hasOnly(["v", "at", "list"])
        && request.resource.data.achievements.v is number
        && request.resource.data.achievements.at is number
        && request.resource.data.achievements.list is string
        && request.resource.data.achievements.list.size() <= 1024);
}
```

Como el resto de campos de `profileFieldsAreSane()`, se valida **solo si está presente**: en un `update` por
merge, `request.resource.data` es el documento resultante, y exigirlo congelaría el perfil de quien no lo tenga.

El tope de 1.024 caracteres es el que protege el coste ajeno: es lo que se descarga el directorio entero. Con la
gramática de §5.3 caben ~70 logros, muy por encima del catálogo previsto.

### 9.3 Lectura defensiva

El espejo de otra persona **no pasa por Zod** (igual que el gist de un amigo: Zod solo corre al publicar lo
propio). El parser que lo lee es la única defensa y tiene que comportarse como el de `moveActivity`:

- tope de entradas procesadas y de longitud de cada `id` (`SOCIAL_ID_MAX` como referencia);
- `id` desconocido → se ignora, no es un error;
- nivel fuera del rango del catálogo → se recorta al máximo definido;
- día negativo, no numérico o en el futuro → el logro se pinta **sin fecha**, no se descarta;
- cadena entera ilegible → vitrina vacía, nunca una excepción que tumbe la ficha.

### 9.4 Moderación

Las reglas no pueden validar el contenido (§4), así que la única defensa contra un espejo fabricado es que **se
vea**. `/admin` ya tiene el mecanismo montado: un catálogo de señales (`AdminAnomaly`) con las graves destacadas
aparte de las informativas. Se añade una señal de logros imposibles, con tres heurísticas baratas:

- **nivel máximo en todo el catálogo** (nadie los tiene todos al tope, y menos de golpe);
- **fecha en el futuro**, que es la misma comprobación que ya hace `future-activity`;
- **cadena pegada al tope de 1 kB**, que es la firma de un blob generado a mano.

Y una acción: **purgar el campo**, botón aparte de las purgas legacy, porque borrar los logros de alguien no tiene
nada que ver con rescatarle un token en claro y no debe ir en el mismo gesto.

---

## 10. Privacidad y textos legales

**Qué información nueva sale al canal público:** una lista de identificadores de logro, su nivel y el día en que
se consiguieron. Nada de esto es un dato de la biblioteca (ni nombres de juego, ni notas, ni horas, ni textos),
pero **sí es información nueva** sobre el dueño: revela órdenes de magnitud (que ha terminado más de 150 juegos)
y una fecha por logro.

Consecuencias que hay que atender antes de entregar la fase 3:

1. **Declararlo en la política de privacidad** (`core/constants/legalContent.ts`), en el apartado de lo que
   publica el espacio social, junto a la actividad de listas de F4.
2. **Subir `LEGAL_VERSION`**, que hace que todo el mundo vuelva a pasar por la puerta del hub. Es lo que se hizo
   con las reseñas compartidas y por el mismo motivo: se publica algo que antes no se publicaba.
3. **El borrado de cuenta ya lo cubre**: el campo vive dentro de `profiles/{uid}`, que se borra entero
   (`allow delete: if isOwner(userId)`). No hay ninguna vía nueva de supresión que escribir.
4. **Sin logros que delaten hábitos.** Ninguna entrada del catálogo puede depender de la hora del día ni de días
   concretos («trasnochador», «finde completo»). La semana es la unidad más fina que se admite, que es la misma
   que ya usa `WeekActivity` y por el mismo razonamiento.

---

## 11. Entrega por fases

Cada fase es entregable por separado y deja la app en un estado coherente.

**F1 · Núcleo puro** — `core/achievements/{types,catalog,evaluate}.ts` con la familia *espejo* (incluida la curva
de pendientes del §6.2.1) y la marca de agua. Sin UI y sin publicación. Tests unitarios: cada métrica con su
fixture, la fecha derivada de cada umbral, biblioteca vacía, biblioteca sin sellos (legacy), **la biblioteca que
encoge** (el nivel no baja, §5.5), y el test de coincidencia con `computeStats` (§7.2).

**F2 · Tu panel** — cifra destacada, `/perfil/logros`, novedades con `achievementsSeen`, hoja propia
`achievements.scss` y forma base de la medalla (§8.5). Aquí ya hay producto completo para el dueño **sin publicar
un solo byte**. Tests de componente sobre la rejilla y la sub-ruta (patrón de `StatsHub.test.tsx`), y paso de axe
con las animaciones quietas.

**F3 · El espejo** — empaquetado, escritura a rebufo tras `ENABLE_ACHIEVEMENTS_PUBLISH`, reglas, opt-out en
`publicConfig`, señal y purga en `/admin`, textos legales y `LEGAL_VERSION`. Tests de reglas
(`vitest.rules.config.js`): el dueño escribe lo suyo; otro usuario no; un blob de más de 1 kB se deniega; una
clave inventada dentro de `achievements` se deniega; un perfil sin el campo sigue pudiendo escribirse.

**F4 · La vitrina ajena** — parser defensivo, fila de medallas en la ficha, destacados, silencio si no hay nada.
Tests de componente con espejos corruptos, vacíos, con ids desconocidos y con quince destacados marcados. E2E de
la ficha con la vitrina puesta.

**F5 · Novedades en el feed** — comparación con el directorio cacheado (§8.4). Va **después** de la vitrina a
propósito: sin espejos reales circulando no hay nada que comparar, y el corte de 30 días solo se puede afinar
viendo datos de verdad.

**F6 · Familias «datos», «social» y «primeros pasos» + foco rotatorio** — las que empujan conducta, al final y a
sabiendas: conviene ver antes cómo se comporta el espejo con datos reales.

**F7 · Temas desbloqueables** — la recompensa (§6.5), con un tema **nuevo** de estreno. Última porque depende de
que la marca de agua lleve tiempo demostrando que no retira nada, y porque el tema hay que hacerlo.

---

## 12. Riesgos y trampas conocidas

| Riesgo | Mitigación |
|---|---|
| Dos contadores de lo mismo divergen (panel vs. logro) | Test de coincidencia con `computeStats` (§7.2) |
| El evaluador arrastra el chunk del panel al arranque | Prohibido importar `core/stats`; lo vigila `ci-validate` |
| El estado de la pantalla va un render por detrás al publicar | Leer los listados con `loadLocalState()` en el momento de publicar, como hace `withMoveActivity`; **nunca** la foto del render (es el fallo de datos que ya costó una regresión de sincronización) |
| El directorio engorda para todos | Tope duro de 1 kB en reglas + gramática compacta; si algún día molesta, la salida es una subcolección leída solo al abrir una ficha |
| Los enlaces compartidos no se pueden contar | KV solo guarda los **activos**. El acumulado va en `LocalMeta`, con lo que es **por dispositivo**: hay que decirlo en el propio logro o dejar la familia social sin él |
| Alguien se fabrica logros | Asumido y declarado (§4). Se acota a que sea un adorno (**ninguna funcionalidad depende de un logro**), a los topes del parser y a la señal de `/admin` (§9.4) |
| La marca de agua vuelve permanente lo falso | Consecuencia aceptada del §5.5: recorte al máximo del catálogo y purga del administrador. No hay una tercera defensa |
| Un umbral mal puesto retira medallas ya dadas | Los umbrales no se endurecen nunca (§6.4) |
| Inflación de logros con los años | Metas abiertas, repetibles anuales y temas de estreno (§6.3, §6.5), no catálogo nuevo cada temporada |
| **La medalla sale sin estilos en una de las dos pantallas** | Hoja propia `achievements.scss` importada desde el componente, nunca colgada de `stats.scss` ni de `social.scss` (§8.5). Fallo MUDO: solo se ve abriendo la otra pantalla |
| El ajuste visual funciona en el tema clásico y en ninguno más | Los skins pesan (0,3,0): medir en las seis paletas (§8.5) |
| El feed se llena de anuncios de logros | Corte de 30 días, uno por persona y día, y silencio en la primera hidratación (§8.4) |
| Quien vuelve tras un mes recibe una avalancha | Mismo corte, en las dos puntas: sus novedades (§7.3) y las de sus amistades (§8.4) |

---

## 13. Dudas abiertas

1. **`LEGAL_VERSION` y el valor por defecto del interruptor.** Publicar por defecto (con subida de versión legal y
   la puerta del hub para todos) da adopción y es lo que se hizo con las reseñas compartidas; empezar apagado es
   más conservador pero deja la vitrina vacía para casi todo el mundo. **Propuesta: encendido por defecto + subida
   de `LEGAL_VERSION`.**
2. **El logro de enlaces compartidos** cuenta desde el dispositivo (el índice de KV solo guarda los activos).
   ¿Se acepta con esa letra pequeña, se cambia por «tener un enlace vivo ahora mismo», o se cae de la familia?
3. **Umbrales concretos.** Los de §6.2 son de partida y están pensados para una biblioteca de tamaño medio.
   Conviene fijarlos sobre tu biblioteca real antes de F1: un listón que nadie alcanza no motiva, y uno que se
   alcanza el primer día tampoco.
4. **Nombres del catálogo.** Los de este documento son de trabajo. Merece la pena decidir el tono (sobrio o
   guiñón) antes de escribirlos, porque los `id` no se pueden renombrar después (§6.4).
5. **Qué tema estrena la recompensa y con qué logro se abre** (§6.5). Conviene que sea uno **nuevo** —los seis
   actuales se quedan libres— y que el logro que lo abra sea alcanzable por alguien con una biblioteca normal:
   un premio que solo ve el 2% no cumple su función.
6. **¿Se anuncian en el feed los logros de la familia «datos»?** Los de espejo se leen bien («ha terminado 150
   juegos»); «ha anotado las horas de 100 juegos» dicho en público es más raro, y puede empujar justo el relleno
   por el premio que el §6.1 quiere evitar. Propuesta: **anunciar solo espejo y social**.
