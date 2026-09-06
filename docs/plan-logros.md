# Plan: logros

> Objetivo: reconocer lo que el usuario ya hace con su biblioteca —y empujar con tacto lo que mejora sus propios
> datos— con una vitrina que se vea en su panel (`/perfil`) y en la ficha de un amigo
> (`/social/profiles/:profileId`), **sin un evento nuevo en el gist de juegos**, sin backend que valide nada y con
> contenido que siga dando de sí durante años sin tener que inventar logros nuevos cada temporada.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al abordar cada paso, verifica el estado
> real del código (las líneas citadas pueden haberse movido) y actualiza este `.md`. Trátalo como código: se
> revisa con la implementación.

> 🔎 **Revisado contra el código el 6-sep-2026** (rama `develop`). Todo lo que el documento afirmaba del
> repositorio se ha comprobado símbolo a símbolo y **se sostiene**; lo que no se sostenía está corregido en el
> sitio donde se decía. Lo que cambió de verdad son cinco cosas, y las cinco están marcadas con **⚑ revisión**
> allí donde viven: el opt-out necesita una clave en las reglas de `publicConfig` que el plan no pedía (§8.3),
> los *primeros pasos* **no puntúan** (§6.10.2), las metas abiertas y los repetibles **se declaran** en el
> catálogo (§5.1), F5 no puede leer la línea base de la caché del directorio (§8.4), y **cuatro métricas están
> mal definidas y darían falsos positivos** (§7.5). El resto son números y nombres que habían quedado atrás.
>
> Se planteó además filtrar el espejo por los ajustes de visibilidad del dueño y **se decidió que no**: un logro
> publica una magnitud, no un dato. El razonamiento y lo único que sí obliga —una frase en la política de
> privacidad— están en el **§5.3bis**.

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
| Ajustes de visibilidad | **No alcanzan al espejo**, y es una decisión, no un olvido: un logro publica una magnitud, no un dato (§5.3bis) |
| Comparación entre usuarios | **Ni ranking, ni listas ordenadas, ni «tú 12 – él 30» en la misma vista**, ni contadores de visitas (§6.10.4) |
| Porcentaje por logro | **Sí, medido y a la vista, como en Steam** («lo tiene el 14 % · 6 de 43»). Se enseña; no decide nada (§6.6bis) |
| Porcentaje y nivel | **Se ven también en la ficha ajena**, como en Steam y PSN. Los **deriva el que lee** del espejo: no se publica ni un byte más (§6.10) |
| Aviso a las amistades | Sí, en el feed, pero **deducido al leer** (§8.4): no publica ni un byte nuevo |
| Recompensa | **Solo cosmética**: temas desbloqueables (§6.5), estrenando **«Casa de Hades»** con «New Game +». Ninguna funcionalidad depende de un logro (§4) |
| Rareza | **Declarada en el catálogo**, no medida sobre nadie (§6.6). Es una propiedad del logro, no de las personas |
| Ocultos | Un puñado, **solo de la familia espejo** (§6.7). Nunca los que guían conducta |
| Denominador | El catálogo cuenta **logros**, no niveles: la fracción se puede terminar (§6.3.1) |
| Puntos del nivel | Por **rareza**, escala suave 5 / 10 / 25 / 60 por nivel alcanzado (§6.10.2) |
| Nombres | **Con guiño a juegos concretos**, los seis temas incluidos; la descripción siempre dice la condición (§6.11) |
| Medalla | **Cuadrada, esquinas redondeadas**, icono propio por logro en sprite perezoso (§8.5) |
| Superficies, en detalle | Apartado en `/perfil` bajo «Lo mejor de tu biblioteca» · tira **solo-imagen** bajo el nombre en la ficha · listado estilo Steam en `/logros` (§8.1, §8.1b, §8.2) |
| El feed | Una entrada **por persona y día**, con todos sus logros dentro; sin filtro de rareza (§8.4) |
| El momento | El desbloqueo se dice **cuando ocurre**, en la región viva que ya existe (§7.4) |

**Lo que NO se hace:** no se escribe nada en los gists (ni el de juegos ni el social); no se añade ningún campo a
`GameItem` ni al esquema del canal social; no hay logros por abrir la app a diario; no hay clasificación global
entre usuarios; no se cuentan visitas de ningún enlace; no se notifica nada fuera de la propia app.

---

## 0. Referencias externas: qué se trae y qué se deja

Este documento no se ha escrito en el vacío. Se han mirado dos familias de sistemas reales, y conviene dejar
escrito **qué se copia y, sobre todo, qué se descarta a sabiendas** — porque lo segundo es lo que evita que
dentro de un año alguien «mejore» el plan reintroduciendo justo lo que aquí se rechazó.

### 0.1 Chollómetro / Pepper (mydealz, hotukdeals): el modelo que NO se sigue

Es el sistema de logros de una comunidad grande en español, así que la tentación de copiarlo es real. Su forma:
puntos por contribuir (una oferta que llega a caliente, un comentario con tres «útil», un voto), tres niveles
—plata 10, oro 30, platino 300—, **caducidad de los puntos a los 12 meses**, **degradación automática tras 7
días por debajo del umbral**, insignias de evento que no vuelven, y un premio semanal real de 2.500 € en tarjetas
regalo. Los niveles desbloquean iconos de app alternativos, quitar la publicidad, más estadísticas y más enlaces
de invitación.

**Lo que se trae:**

- **El icono de app como recompensa cosmética escalonada.** Es exactamente la forma del §6.5 (temas), validada en
  un producto de masas: una recompensa que no toca ninguna función, que se ve a diario y que no molesta a nadie.
- **«Mis insignias» con la condición y el progreso a la vista.** En hotukdeals cada insignia dice qué le falta.
  Es lo que hace el §8.1, y confirma que el sitio de eso es tu perfil y no la ficha de otro.
- **La lectura honesta del catálogo**: unas se consiguen el primer día y otras casi nadie las tiene. Un catálogo
  plano —todo alcanzable, todo del mismo peso— no engancha a nadie. De ahí sale la rareza declarada del §6.6.

**Lo que se descarta, y por qué:**

- **Puntos que caducan y niveles que se pierden.** Tienen todo el sentido *allí*: los puntos son la moneda de un
  bote de 2.500 € semanales, y sin caducidad ni degradación el sistema sería un caladero de fraude. Aquí no hay
  bote, no hay verificación y no hay nada que defender: caducar solo castigaría a quien deja de usar la app una
  temporada. Ver §5.5.
- **Una moneda única y un ranking.** El punto de Pepper es fungible y comparable, y de ahí salen la tabla y la
  competición. Este catálogo no tiene moneda: cada logro mide lo suyo y no se suma con los demás.
- **Insignias de evento que no vuelven.** Necesitan un reloj de servidor en el que todo el mundo confíe (aquí no
  lo hay: §4) y castigan al que no estaba mirando esa semana. El sustituto sano es el foco rotatorio y los
  repetibles por año natural del §6.3, que fabrican novedad sin fabricar exclusión.
- **Desbloquear funciones por nivel** (más estadísticas, sin anuncios). Pepper puede porque sus puntos los cuenta
  su servidor. Los nuestros los declara el cliente, así que hacerlo aquí sería una escalada de privilegios
  autoservida. Ver §4.

### 0.2 Steam: el vocabulario del que sí se copia

El otro referente es el que el usuario ya tiene interiorizado, y además es el de los juegos que dan nombre a los
temas de la app —Portal 2, Persona 5, Cyberpunk 2077, Sea of Stars, el 40k de «Solo hay guerra»—. Cinco cosas de
ahí entran en el plan:

1. **Rareza por logro.** Steam pone junto a cada logro el porcentaje global de quien lo tiene, y el perfil tiene
   una vitrina automática con los seis más raros. Es lo que le da peso a una medalla. Aquí no hay servidor que
   agregue nada, así que la rareza se **declara en el catálogo** (§6.6): sin infraestructura y sin medir a nadie.
2. **Dos vitrinas: la elegida a mano y la automática.** Steam tiene *Achievement Showcase* (tú eliges) y *Rarest
   Achievement Showcase* (lo elige él). El plan ya tenía la primera —los tres destacados—; la segunda es lo que
   arregla el orden por defecto del §8.2, que era el mismo para todo el mundo.
3. **Logros ocultos.** El nombre tapado hasta que se consigue. Es lo único que devuelve sorpresa a un sistema
   que, por derivar, tiende a leerse como una lista de tareas (§6.7).
4. **El nombre es un guiño; la descripción es el contrato.** «You Monster» y «Vertically Unchallenged» (Portal
   2), «The Fool» y «Must Be Rats» (Cyberpunk 2077), «Clockworkn't» (Sea of Stars): ninguno explica nada, y
   debajo siempre hay una línea que dice exactamente qué hay que hacer. De ahí sale la regla de nombres del §6.4.
5. **El instante del desbloqueo.** En Steam la medalla salta *en el momento*, y ese instante es toda la carga
   emocional del sistema. Derivar lo pone en peligro —la medalla podría aparecer callada en la siguiente carga—,
   y por eso el §7.4 existe.

Y una que se copia por omisión: **Steam publica la hora exacta del desbloqueo**. Aquí no; el día basta y el
minuto diría a qué horas usas la app (§5.3). En esto el plan es deliberadamente más estricto que su referente.

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

**En `/social/profiles/:profileId`** — es la ficha de otra persona, así que aquí se ve **solo lo conseguido**,
más las dos cifras que se derivan de ello (§6.10). El **progreso** hacia lo que no tiene no se ve, y ese es el
corte: una barra a medias diría cuántas reseñas lleva o cuántas horas anota por una puerta lateral, y un logro
conseguido solo dice el orden de magnitud que ya declara al publicarlo. La vitrina es una lista de medallas con
su cabecera, no un informe.

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
- **Coherencia de cálculo.** Todo el mundo ve el mismo número, porque lo calcula un solo sitio (el dueño) a
  partir de sellos privados que nunca salen del aparato (`enteredAt`). Nadie tiene que rehacer la cuenta con
  datos peores.

- **Coherencia de alcance.** El espejo se calcula sobre la biblioteca **entera**, incluidas las listas que el
  dueño esconde y las horas que no publica. No es un descuido: es lo que hace que el número signifique algo. Lo
  que sostiene esa decisión —y por qué no choca con los ajustes de visibilidad— está en el **§5.3bis**.

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

**Por qué Pepper sí puede y nosotros no.** Chollómetro desbloquea funciones por nivel —más estadísticas de
ofertas, quitar la publicidad, más enlaces de invitación— y hace bien: **sus puntos los cuenta su servidor**, con
el hecho de fondo (la oferta llegó a 100°, el comentario tiene tres «útil») en su propia base de datos. El nuestro
lo declara el cliente sobre un gist que ningún servidor nuestro lee. La misma mecánica, con distinta raíz de
confianza, cambia de naturaleza: allí es un permiso ganado; aquí sería un permiso autoconcedido. Es exactamente
la línea que separa lo que se copia de lo que no (§0.1), y merece estar escrita junto a la regla que la aplica.

---

## 5. Modelo de datos

Tres piezas, y solo una de ellas se persiste en un canal compartido.

### 5.1 El catálogo (código, no datos)

`src/core/achievements/catalog.ts`. Una tabla declarativa; añadir un logro es añadir una entrada, nunca tocar la
vista.

```ts
export interface AchievementDef {
  /**
   * Identificador ESTABLE. Nunca se renombra ni se reutiliza: viaja en el canal y en el estado local.
   * Slug de LO QUE SE MIDE, no el nombre visible: el nombre se puede retocar y este no (§6.4).
   */
  id: string;                       // p. ej. 'completados', 'constancia', 'fichas-completas'
  /**
   * ⚑ Revisión: cinco valores, no tres. El catálogo real (§6.9) tiene además los **repetibles por año natural**
   * (§6.3) y los **primeros pasos** (§6.2), y los dos se comportan distinto —los anuales crecen sin techo, los
   * primeros pasos ni se publican ni puntúan (§6.10.2)—, así que no pueden colarse dentro de `mirror`.
   *
   * Y `hidden` NO es una familia, es un estado previo al desbloqueo (§6.7): «Tesis doctoral» es de familia
   * `data` y está oculto. Meterlo aquí como sexto valor rompería el agrupado por familia del §8.1 (una sección
   * «ocultos» con nombre revela justo lo que se tapaba) y el filtro del feed del §8.4.
   */
  family: 'mirror' | 'data' | 'social' | 'annual' | 'onboarding';
  /** Umbrales de cada nivel, ascendentes. Es el catálogo CERRADO: lo abierto se declara en `open`/`annual`. */
  steps: readonly number[];
  /**
   * ⚑ Revisión: **meta abierta** (§6.3). Pasado el último `steps`, cada `every` más suma un nivel. Sin este
   * campo la meta abierta no existía en ninguna parte: ni el tipo ni `catalogo.json` decían qué logros la
   * tienen ni con qué paso, y el lector defensivo del §9.3 —que recorta «al máximo definido por el
   * catálogo»— no tenía máximo que aplicar, así que o clavaba el nivel en `steps.length` (matando la meta
   * abierta) o no recortaba nada (matando la defensa).
   *
   * `cap` es ese máximo: el nivel más alto que este logro puede alcanzar nunca. No es un techo de producto —a
   * los ritmos del §6.9 nadie lo roza— es la cota que el parser necesita para poder decir «esto es falso».
   */
  open?: { every: number; cap: number };
  /**
   * ⚑ Revisión: **repetible por año natural** (§6.3). El nivel es cuántos años se ha cumplido, así que crece
   * solo con el calendario y `steps` no lo puede describir. `cap` acota igual que arriba: el año de estreno del
   * catálogo más los años transcurridos, que es lo máximo que alguien puede haber cumplido de verdad.
   *
   * Deshace de paso la contradicción del §6.9 —«un excepcional tiene como mucho dos niveles»— con `ano-redondo`,
   * que es excepcional y anual: la regla de los dos niveles es sobre `steps`, y un anual no tiene escalera de
   * umbrales que estirar.
   */
  annual?: { since: number; cap: number };
  /** Métrica que se compara con los umbrales, y de dónde sale su fecha. */
  metric: (input: AchievementInput) => AchievementMeasure;
  /** Textos: nombre por nivel, qué mide y cómo se dice en el perfil de otra persona. */
  labels: AchievementLabels;
  icon: IconName;
  /** Cuánto pesa la medalla. Curado a mano; NO se mide sobre otros usuarios (§6.6). */
  rarity: 'comun' | 'infrecuente' | 'raro' | 'excepcional';
  /** Nombre y condición tapados hasta el nivel 1. Estado, no familia; ver §6.7 para qué puede ser oculto. */
  hidden?: true;
  /** Retirado: no se ofrece, pero se sigue pintando a quien ya lo tenga (§6.4). */
  retired?: true;
  /** Versión del catálogo en la que entró. Documental: sirve para leer el histórico de este fichero. */
  since: string;
}

/** Lo que devuelve una métrica: cuánto llevas y CUÁNDO alcanzaste cada umbral. */
export interface AchievementMeasure {
  value: number;
  /**
   * Instante en que se alcanzó cada NIVEL, empezando por el 1. Índice `n-1` = nivel `n`; 0 = alcanzado sin
   * fecha deducible.
   *
   * ⚑ Revisión: decía «mismo índice que `steps`», y con las metas abiertas y los repetibles eso no puede ser:
   * `completados` admite el nivel 7 y `steps` solo tiene cuatro entradas. El array es tan largo como niveles
   * haya alcanzado la métrica, y el evaluador no supone que mida `steps.length`.
   */
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

/** Las dos cifras del §6.10. Función pura de `AchievementState[]` + catálogo; no se publica (§6.10.3). */
export interface AchievementSummary {
  earned: number;       // logros con nivel ≥ 1
  total: number;        // catálogo actual, sin «primeros pasos» ni retirados (§6.3.1)
  percent: number;      // earned / total, redondeado; el 100 % es alcanzable
  points: number;       // suma de niveles × puntos de rareza (§6.10.2)
  level: number;        // nivel de perfil según la curva por tramos
  pointsIntoLevel: number;
  pointsToNext: number | null; // null nunca: la curva no tiene techo
}
```

### 5.3 El espejo (Firestore, `profiles/{uid}.achievements`)

> ⚑ **La gramática de esta sección es la versión 1 y ya no se escribe.** Con un logro por escalón (§6.3bis) el
> espejo es un **mapa de bits**; lo que sigue explica el porqué del canal —una cadena, no un array de mapas; día
> y no instante; recorte por prioridad— y todo eso sigue en pie. Lo que cambió es la codificación, y está en la
> cabecera de `core/achievements/pack.ts`.

```ts
{
  v: 1,                 // versión del formato de empaquetado
  at: 1789000000000,    // cuándo se publicó (para el saneado y el panel de admin)
  list: "completados.3.2311,constancia.2.2280,resenas.4.2295"
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

**Qué se recorta cuando no cabe.** ⚑ El tope de 1 kB (§9.2) da para **~54 logros** con los `id` reales —no los
~70 que suponía este párrafo estimando 14 bytes por entrada, cuando una completa son 20 (§9.2)— y los 32 de hoy
ocupan 608 bytes en el peor caso, así que no llega. Pero un plan que no dice qué hacer al desbordar acaba
truncando por donde caiga el corte —que es el orden de
declaración del catálogo, o sea, ninguno—. La regla: se publica **primero lo destacado, luego lo más raro y a más
nivel** (§6.6), y se corta la cola. Nunca al revés: si algo se pierde, que sea lo que menos dice de esa persona.
El que lee **no sabe que hubo recorte** y no debe intentar deducirlo: una vitrina es siempre una selección.

**Granularidad de día, no de instante**, y es deliberado: un sello al minuto dice a qué horas usas la app, que es
justo el dato que `applyProfileVisibility` borra de los listados que baja una amistad. El día basta para pintar
«conseguido en marzo de 2026».

### 5.3bis Los ajustes de visibilidad NO filtran el espejo, y por qué

**La pregunta se hace sola en cuanto se mira la lista de logros:** si alguien esconde Abandonados, ¿debería seguir
publicando «Retirada táctica III»? ¿Y quien esconde sus horas, «Un verano entero»? La respuesta es **sí**, y
conviene dejar escrito el razonamiento, porque el reflejo contrario —filtrar por si acaso— parece lo prudente y
no lo es.

**Un logro no muestra información: muestra una magnitud.** Lo que `applyProfileVisibility` protege son **datos**:
qué juegos hay en esa lista, cómo se llaman, qué nota tienen, cuántas horas les echaste, cuándo los moviste. Nada
de eso sale al espejo. Lo que sale es «este señor ha abandonado más de sesenta juegos anotando por qué» — el
orden de magnitud de una conducta, sin una sola fila de la lista que la produce. Son dos cosas distintas y
mezclarlas confunde una vitrina con una filtración.

**Y la asimetría lo confirma.** Una lista oculta lo está para que nadie hurgue en ella; un logro derivado de ella
no permite hurgar nada: no se puede ir hacia atrás desde «60 abandonos» a ningún juego concreto. La operación es
irreversible por construcción, igual que el porcentaje del §6.10 no permite reconstruir qué logros lo componen.

**Lo que esto sí obliga**, y va como requisito de F3 y no como nota al pie: **decirlo en la política de
privacidad** (§10). El texto vigente promete «si eliges ocultar tus horas, no las ve nadie» y «esconder una lista
esconde también su actividad», y las dos frases siguen siendo verdad —nadie ve tus horas ni la entrada de un
juego a una lista oculta— pero un lector cuidadoso puede leer «Un verano entero III» y preguntarse dónde encaja.
La frase que lo cierra es una: **los logros se calculan sobre tu biblioteca entera y publican solo su nivel, sin
ningún dato de los juegos que los producen**. Sin ella, la decisión es correcta y parece un descuido.

> **Y la salida, para quien no la quiera, ya existe y es mejor que un filtro por lista:** el interruptor del §8.3,
> que **borra el campo entero** del perfil público. Todo o nada es la forma honesta de un opt-out —un filtro
> parcial deja al dueño creyendo que publica menos de lo que publica— y además evita el desfase de cifras del
> §6.10.3, que un filtro por lista habría introducido para siempre.

### 5.3ter ⚑ Inventario de campos: qué hay que tocar y qué no

La afirmación central del plan es que esto **no añade nada al gist de juegos ni al canal social**. Se ha
comprobado métrica a métrica contra los tipos reales y **se sostiene**. Aquí está el inventario entero, para que
la próxima vez no haya que rehacerlo.

**Lo que NO se toca. Ni un campo.**

| Canal | Veredicto |
|---|---|
| `GameItem` (gist de juegos) | **Nada.** Las 32 métricas se derivan de lo que ya hay: `genres`, `platforms`, `steamDeck`, `review`, `grade`/`score`, `years`, `strengths`, `weaknesses`, `reasons`, `hours`, `scored`, `listedAt`, `reviewedAt`, `enteredAt`, `gradedAt` |
| `SocialSharedGame` / `PublicGame` (proyección pública) | **Nada.** Ningún logro se calcula sobre lo que se publica de un juego |
| `SocialGistData` (gist social) | **Nada.** `conversador` lee el gist **propio**, que su dueño ya tiene bajado: `posts[].createdAt` y `activity[].createdAt` (§7.5) |
| `friendships/{docId}` | **Nada.** `amistades` cuenta `MyFriendships`, que el hub ya carga |
| `SocialMoveEntry` (F4) | **Nada.** Los logros de trayecto salen de `enteredAt` en local, no de la proyección |

**Lo que sí, y dónde.**

| Sitio | Campo | Fase | Nota |
|---|---|---|---|
| `profiles/{uid}` | `achievements: { v, at, list }` | F3 | El único campo nuevo de todo el evolutivo en un canal compartido. Con su regla y su tope (§9.2) |
| `publicConfig/{uid}` | `showAchievements: boolean` | F3 | Y sus **cuatro** piezas, no una (§8.3) |
| `LocalMeta` | `achievementsPublished`, `achievementsSeen`, `achievementsSeenAt`, `achievementsPeak` | F2–F3 | Estado de dispositivo, nunca sube (§5.4) |
| `LocalMeta` | `achievementsPeerSeen` | F5 | Línea base del feed (§8.4) |
| `LocalMeta` | `rouletteUsedAt?: number` | F6 | ⚑ Ver abajo: es el único dato que hoy **no existe en ninguna parte** |

**⚑ El único agujero de datos de todo el plan, y es diminuto: la ruleta no deja rastro.**

Los seis *primeros pasos* se dan por derivables, y cinco lo son:

| Logro | De dónde sale hoy |
|---|---|
| `paso-primer-juego` | Cualquier lista con algo dentro |
| `paso-resena` | Algún `review` no vacío |
| `paso-nota` | Algún `grade` puesto |
| `paso-sync` | `LocalMeta.gamesGistId` no vacío |
| `paso-tema` | `palettePreference.get() !== DEFAULT_PALETTE` — y si vuelve a «Clásico», la marca de agua (§5.5) lo conserva, que es justo para lo que está |
| **`paso-ruleta`** | **Nada.** `core/roulette/roulette.ts` es una función pura: tira, devuelve un juego y no persiste ni un byte |

Así que F6 necesita **un sello local**, `rouletteUsedAt`, escrito la primera vez que se abre la ruleta. Va en
`LocalMeta` como todo lo demás —no sube, no se publica, no entra en el espejo (los *primeros pasos* no se
publican nunca, §5.3)— y es la excepción que confirma la regla: **el único dato que este evolutivo tiene que
empezar a registrar en vez de derivar**, y es un número que solo se escribe una vez, en el aparato, para un logro
que nadie más ve. Con eso, el §1 sigue en pie sin asteriscos.

> La alternativa era quitar `paso-ruleta` del catálogo, como se hizo con el logro de enlaces compartidos (§6.2).
> No aplica: aquel se cayó porque **no convergía entre dispositivos** y su cifra habría dicho cosas distintas en
> el móvil y en el portátil. Este no tiene ese problema —es de un solo nivel, no se publica, y lo peor que pasa
> es que quien estrene un segundo aparato tenga que tirar la ruleta otra vez para verlo—, así que se queda.

### 5.4 Lo local (`LocalMeta`, nunca sube)

```ts
achievementsPublished?: string;  // último `list` ya escrito en Firestore: evita reescribir lo mismo (§9.1)
achievementsSeen?: string;       // lo que el dueño ya ha visto: alimenta el aviso de «nuevos» (§7.3)
achievementsSeenAt?: number;
achievementsPeak?: string;       // marca de agua: el nivel más alto alcanzado por cada logro (§5.5)
achievementsPeerSeen?: Record<string, string>; // ⚑ último espejo visto de cada amistad: la línea base de F5 (§8.4)
```

⚑ **`achievementsPeerSeen` es nuevo y no es un lujo:** el §8.4 daba por hecho que la línea base para deducir las
novedades de una amistad se saca de la caché del directorio, y no se puede. El porqué está allí; lo que hay que
saber aquí es que este mapa es `profileId → cadena` (una línea por amistad, del orden de 600 bytes cada una) y
que **no caduca ni se invalida**: es una foto de lo último visto, no un caché. Se poda con el grafo de amistad,
para que no crezca con gente que ya no está.

Mismo patrón y mismo motivo que `friendshipHealedForGist` y `backlogHistory`: es estado de dispositivo, no dato
del usuario. Y como `backlogHistory`, **es por dispositivo y no converge**: un aparato recién estrenado no ha
visto nada, así que calla en su primera pasada (§8.4) y recupera del espejo lo que necesita saber (§5.5).

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

**Y por qué el sistema de referencia hace lo contrario.** En Chollómetro los puntos **caducan a los 12 meses** y
el nivel **se degrada tras 7 días** por debajo del umbral. No es un descuido suyo ni un despiste nuestro: sus
puntos son la moneda de un bote semanal de 2.500 €, así que la caducidad es a la vez control de fraude y control
de inflación —sin ella, quien acumuló en 2019 cobraría para siempre—. Aquí no hay bote, no hay nada que cobrar y
no hay nada que verificar; lo único que produciría la caducidad es castigar a quien pasó un semestre sin abrir la
app. **Cuando alguien proponga «que los logros caduquen para que signifiquen algo», este párrafo es la
respuesta:** significan algo porque el catálogo tiene fondo (§6.6), no porque se puedan perder.

**Letra pequeña, dicha aquí y no descubierta después.** El máximo es acumulativo, así que **también hace
permanente un nivel inyectado a mano**: quien manipule su cliente y publique `completados.9` se lo queda, porque su
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
| Créditos finales (`completados`) | Juegos completados | `enteredAt.c` |
| Retirada táctica (`abandonos-razonados`) | Abandonos con razón anotada | `enteredAt.v` |
| Aún estás aquí (`constancia`) | Mejor racha de semanas seguidas con actividad | `reviewedAt` / `enteredAt` |
| Mundo abierto (`generos`) | Géneros distintos con al menos un juego cerrado | `enteredAt` del que estrena género |
| Guerra de consolas (`plataformas`) | Plataformas distintas | ídem |
| New Game + (`rejugados`) | Vueltas extra registradas (`years` por encima de la primera) | último año de `years` |
| Un verano entero (`maraton`) | Juegos con 60 h o más anotadas | `enteredAt.c` |
| Ya iba siendo hora (`paciencia`) | Juegos que esperaron más de un año en Próximos y acabaron terminados | `enteredAt.c` |
| Nota del crítico (`criterio`) | Desviación típica de tus notas, con un mínimo de notas puestas | `gradedAt` |
| Partida guardada (`memoria-larga`) | Años naturales distintos con algo completado | fin del año que lo cumple |
| El deshielo (`deshielo`) | Meses seguidos en que Próximos acabó con menos juegos de los que empezó | curva derivada (§6.2.1) |
| La pila de la vergüenza (`estanteria`) | Juegos que salieron de Próximos hacia una lista jugada | `enteredAt` de la lista de destino |
| De la vieja escuela (`veterano`) | Años con perfil, desde `profiles.createdAt` | el propio `createdAt` |

> ⚑ **Revisión — esta tabla llevaba los nombres viejos y uno de ellos era una bomba.** Llamaba «Segunda vuelta»
> al logro de vueltas extra, que en §6.9, en §6.11 y en `catalogo.json` es `rejugados`; y `segunda-vuelta` es
> otra cosa distinta —el oculto «Volver a la hoguera», terminar un juego que habías abandonado—. Como **un `id`
> no se renombra ni se reutiliza jamás** (§6.4) y viaja en el canal y en el estado local de todos los
> dispositivos, esto había que cerrarlo antes de escribir la primera línea de F1, no descubrirlo después. La
> tabla lleva ahora el nombre del §6.11 con su `id` al lado, que es la única forma de que las dos no vuelvan a
> separarse.

**«Veterano» es el único logro verificable de todo el catálogo**, y por eso está: ⚑ `createdAt` lo sella el
**servidor** (`serverTimestamp()` en `firebaseRepository`, no el reloj del cliente como decía este párrafo) y a
partir de ahí **las reglas lo congelan** (`profileCreatedAtIsImmutable`), incluso para su dueño. Es decir, es
todavía más sólido de lo que el plan presumía.

> ⚑ **Pero hoy el cliente no lo lee, y sin eso el logro no se puede escribir.** `createdAt` se escribe en
> `profiles/{uid}` y ninguna lectura lo mapea: no está en `SocialProfileReference` ni en `SocialDirectoryEntry`.
> Tarea de F1/F2, pequeña y con una trampa conocida: llega como **Timestamp de Firestore, no como número**, así
> que hay que convertirlo con el mismo patrón que ya usa `updatedAt` (`toMillis?.()` con caída a 0), o el logro
> contará años desde 1970. No se puede falsear sin que el panel de administración lo cante — de hecho ya existe la señal
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
- **Las bibliotecas antiguas empiezan más tarde** — y al medirlo resultó ser **más duro que «más tarde»**: en una
  biblioteca de 302 juegos, los que tienen sello de **dos** listas distintas son **cero**, que es justo el par que
  esta curva necesita. Los detalles y las consecuencias, en el §6.8. La curva se cuenta desde donde haya sello,
  sin inventar meses previos, y este logro es de los que arrancan dormidos.

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

> **La familia social se queda en dos, y es a propósito.** Hubo un tercero —enlaces de reseña creados— y se cayó
> del catálogo: KV solo guarda los enlaces **activos**, así que el histórico solo se puede llevar en el aparato, y
> un logro que dice 7 en el móvil y 2 en el portátil rompe la única propiedad que este sistema no puede perder
> (§1, §6.2.1). Añadir logros es aditivo, así que si algún día KV guarda el histórico, vuelve. Lo que no se hace
> es entregarlo con una letra pequeña que haya que explicar en la tarjeta.

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
   nivel 4 (p. ej. 400 completados), cada N más suma un nivel. En el espejo eso es `completados.7`, el mismo espacio
   de siempre; en la vitrina, «Créditos finales VII». Quien lleva años usando la app sigue teniendo siguiente paso.
2. **Repetibles por año natural.** «Año redondo» (doce meses con actividad) y «Buena cosecha» (X juegos
   terminados en un año) se pueden conseguir **una vez por año**, y su nivel es *cuántos años lo has cumplido*. El
   calendario fabrica contenido nuevo solo, sin tocar el catálogo.
3. **Foco rotatorio.** El panel destaca cada mes un logro del catálogo, elegido por una función determinista de
   `(año, mes)`. Cero infraestructura, el mismo para todo el mundo, y hace que la pantalla no diga siempre lo
   mismo. No cambia ninguna regla: solo dónde mira el ojo.

#### 6.3.1 El precio de las metas abiertas: un denominador que se pueda terminar

Los tres mecanismos de arriba tienen una contrapartida que hay que resolver aquí y no descubrir en la primera
pantalla: **si el catálogo no tiene techo, no hay 100 %**. En Steam los logros son finitos y binarios, y por eso
existe el «juego perfecto» y existe la gente que lo persigue; un sistema con niveles infinitos le quita a esa
persona su objetivo y, con él, la mitad de la motivación.

> ⚑ **Esta sección se escribió cuando un logro tenía niveles.** Desde el §6.3bis cada escalón ES un logro, así
> que la distinción de abajo desaparece: la fracción cuenta escalones y cada uno suma una vez. Las reglas del
> denominador —fuera los primeros pasos y los retirados, dentro los ocultos, y decirlo en pantalla— siguen
> valiendo tal cual.

**La regla: la fracción cuenta LOGROS, no niveles.** Un logro está conseguido en cuanto se alcanza su nivel 1, y
ahí deja de mover el numerador para siempre. Los niveles siguientes —incluidos los abiertos y los repetibles
anuales— alimentan una segunda cifra distinta, la **profundidad** (la suma de niveles), que sí es infinita a
propósito. Así conviven las dos personas: la que quiere completar la lista puede, y la que ya la completó sigue
teniendo siguiente paso.

Y el denominador tiene sus propias reglas, porque si baila la cifra miente:

- **Fuera los «primeros pasos»** (§6.2): se apagan solos, y un denominador que encoge al terminarlos convertiría
  un logro en un castigo estadístico.
- **Fuera los retirados** (§6.4): dejan de contar para quien no los tenía; a quien ya los tiene se le siguen
  pintando, pero fuera de la fracción.
- **Dentro los ocultos** (§6.7), y contados desde el principio. Restarlos del denominador delataría cuántos hay
  y, con el tiempo, cuáles.
- **Añadir logros al catálogo baja la fracción de todo el mundo.** Es el mismo efecto que tiene en Steam publicar
  logros de DLC, y no tiene arreglo bonito: se asume y **se dice en la pantalla** («22 de 32 del catálogo
  actual»). Lo que no se hace nunca es congelar la fracción por versión, que sería inventarse un número.

### 6.3bis ⚑ Cada nivel es un logro

**Decidido el 6-sep-2026, después de repasar el catálogo entero contra una biblioteca real.** Una escalera de
cuatro escalones deja de ser *un logro con grados* y pasa a ser **cuatro logros**, cada uno con su `id`, su
casilla en el porcentaje y su bit en el espejo. Es el cambio que reordena medio documento, así que va aquí, justo
detrás del §6.3.1 que lo contradecía.

**Por qué.** El catálogo medido era un retrato, no un motor: sobre 302 juegos catalogados hacia atrás, **22 de
32 logros saltaban en el primer render** (69 %) y lo que quedaba dependía de terminar juegos de verdad, uno a
uno. Con los escalones sueltos —y con las escaleras alargadas donde había recorrido— la misma biblioteca sale a
**113 de 251 (45 %)**. La diferencia no es cosmética: es la diferencia entre una cuenta grande que ya lo ha visto
todo y una a la que le queda más de la mitad.

**Lo que se declara y lo que se publica.** El fichero sigue siendo una tabla de escaleras —`AchievementLadder`:
una métrica, un dibujo, una rareza, unos umbrales— y `expand()` produce un `AchievementDef` por umbral. La métrica
se escribe una vez y corre una vez; once escalones de «Créditos finales» no son once recorridos de la biblioteca.

**El `id` lleva el umbral, no la posición** (`completados-50`, nunca `completados-3`). Es lo que hace ADITIVO
insertar un escalón intermedio: meter el 25 entre el 10 y el 50 no toca a nadie. Con el índice dentro del `id`,
esa misma inserción correría todos los siguientes y retiraría retroactivamente un logro ya publicado a todo el
mundo, que es lo único que el §6.4 no permite.

**La zanahoria.** El listado enseña los escalones conseguidos **y uno más**: el siguiente, con su barra. Los
posteriores no se pintan. Sin esto, 251 filas no son una pantalla, son un inventario — y enseñarle los once
escalones de «Créditos finales» a quien lleva diez juegos no le dice cuánto le falta, le dice que no va a llegar.

**Lo que arrastra, y conviene no descubrirlo dos meses después:**

| Qué | Antes | Ahora |
|---|---|---|
| Logros publicables | 32 | **251** |
| Formato del espejo | `id.nivel.día`, 608 B en el peor caso | **mapa de bits**, 44 caracteres + cola de fechas |
| Denominador | 32 | 251 · la fracción de todo el mundo baja, y se dice en pantalla |
| Puntos con todo conseguido | 895 | **5.135** (curva del §6.10.2 duplicada) |
| Nivel de perfil | infinito, por las metas abiertas | **finito**: el techo son 37 |
| Medallas por dibujar | una por logro | una por **escalera**; el grado lo pone el triángulo |

**El espejo, en concreto.** Un escalón solo puede estar conseguido o no, así que la lista de texto sobra: se
publica un bit por entrada de `MIRROR_ORDER` en base64url —**44 caracteres para los 253 bits**— y detrás, tras un
`~`, solo lo que el bitmap no sabe decir: la fecha (en días desde 2020-01-01, base 36) y el `!` de destacado. Sobre
la biblioteca real el espejo entero ocupa **186 de los 1.024 caracteres** que valida la regla de Firestore.

Y trae una regla nueva que antes no existía: **el orden del catálogo es contrato**. Cada bit significa lo que
significa por su posición, así que `MIRROR_ORDER` incluye también los RETIRADOS —retirar un logro no puede correr
los índices de los que van detrás— y los escalones nuevos se añaden al final de su escalera, nunca en medio de la
lista.

**Las dos metas abiertas desaparecen.** `open` y `annual` no tienen sentido cuando el `id` lleva el umbral: un
número de escalones sin acotar es un número de `id` sin acotar. Los repetibles anuales se declaran ahora como lo
que son —una escalera de umbrales sobre «cuántos años lo has cumplido»— con su último escalón como tope. El
precio es el de la tabla: el nivel de perfil deja de ser infinito, y lo que sostiene el «siempre hay un paso más»
pasa a ser el calendario y los escalones que se vayan añadiendo.

**Los dos logros que miden sobre otros logros.** «Tutorial superado» y «Cien por cien» necesitan saber qué se ha
concedido ya, así que el evaluador hace **dos pasadas**: la normal y, con el conjunto de `id` conseguidos en la
mano, la de las escaleras marcadas como meta. No se ven entre ellas, así que el orden dentro de la segunda da
igual.

### 6.4 Reglas del catálogo, para no romper el canal

- **Un `id` no se renombra ni se reutiliza jamás.** Viaja en la cadena empaquetada y en el estado local de todos
  los dispositivos.
- **Y por eso el `id` NO es el nombre.** El `id` es un slug descriptivo y aburrido de lo que se mide
  (`completados`, `abandonos-razonados`, `cobertura-resenas`); el nombre visible es otra cosa y **sí se puede
  retocar**. Confundirlos es el error clásico: se elige `creditos-finales` como `id`, seis meses después el nombre
  no convence, y ya no se puede tocar sin romper el canal de todo el mundo. Con esta separación, el §13.4 deja de
  ser una decisión irreversible y pasa a ser un ajuste de texto.
- **El nombre es un guiño; la descripción es el contrato.** Lo que hacen bien los referentes del §0.2: «You
  Monster» no explica nada y debajo pone exactamente qué hay que hacer. Aquí igual — nombre corto y con carácter,
  y **siempre** una línea debajo con la condición literal y el umbral del siguiente nivel. Sin esa línea, el
  guiño se convierte en un acertijo, que es la única forma de que un nombre bonito estorbe.
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

**El que estrena: «Casa de Hades», violeta y fuego, abierto por «New Game +».**

| Pieza | Valor |
|---|---|
| `id` de la paleta | `hades` |
| Etiqueta | «Casa de Hades» |
| `accent` / `accent2` | violeta · fuego (a fijar al dibujarlo) |
| Lo abre | `rejugados` — **New Game +**, vueltas extra registradas |

Dos razones y las dos importan. La primera es de color: **no hay ni un tema violeta** entre los seis, y los que
hay se reparten azul (dos), rojo, amarillo, ámbar y verde. Un tema nuevo que repita acento no se ve como un tema
nuevo, se ve como una variante — y el selector los enseña por su muestra de color.

La segunda es que **el premio y la medalla que lo abre cuentan la misma broma**: el juego que va literalmente de
volver a empezar una y otra vez lo abre el logro de volver a empezar una y otra vez. Es exactamente el remate que
pedía el §6.11, y es la clase de detalle que hace que una recompensa cosmética se sienta puesta a mano.

Y cumple la condición que la abre a todo el mundo: `rejugados` mide vueltas extra registradas (`years` por encima
de la primera), o sea algo que **cualquiera con una biblioteca normal ya tiene** sin proponérselo. Un premio que
solo alcanza el 2 % no cumple su función.

### 6.6 Rareza: declarada, no medida

Lo que hace que una medalla pese en Steam no es su icono, es el «0,8 % de los jugadores lo tiene». Sin esa
señal, cuarenta medallas se leen todas igual y la vitrina del §8.2 es una fila de adornos intercambiables.

⚑ **Y además se mide, que es lo que hace Steam.** El documento decía aquí que medir la rareza «no se hace»; se
hace, y el §6.6bis explica cómo y con qué honestidad. Lo que sigue en pie —y hay que leerlo con eso delante— es
que **la rareza DECLARADA no desaparece**: es la que gobierna los puntos, el aura y la prioridad de recorte, y
tiene que ser estable. El porcentaje medido se **enseña**; no decide nada.

**Lo declarado: un campo más en el catálogo.**

```ts
/** Cuánto pesa la medalla. Curado a mano, NO medido sobre nadie: es una propiedad del logro. */
rarity: 'comun' | 'infrecuente' | 'raro' | 'excepcional';
```

Se cura a ojo sobre bibliotecas reales (§13.3, la misma sesión en que se fijan los umbrales) y es **honesto sobre
lo que es**: no dice «lo tiene el 4 %», dice «esto es difícil». Nadie puede desmentirlo porque no afirma un dato,
y a cambio da tres cosas que el plan necesitaba:

1. **Orden por defecto de la vitrina ajena** (§8.2), que hasta ahora era el mismo para todo el mundo.
2. **Filtro de ruido en el feed** (§8.4): un anuncio por lo común es spam; por lo excepcional, una noticia.
3. **Prioridad de recorte** al empaquetar (§5.3).
4. **Los puntos del nivel** (§6.10.2), que es lo que hace que un logro difícil pese más que el tutorial.

**Cómo se pinta: aura exterior, escala de loot de RPG.** La rareza va en un **halo de color alrededor de la
medalla**, con la escala que cualquiera que haya jugado a un RPG lee sin que se la expliquen: gris apagado el
común, verde el infrecuente, morado el raro y naranja de legendario el excepcional.

**La regla de higiene sigue en pie, y es lo que hace que esto funcione: son dos canales distintos.** La moldura
dice el **nivel** —cuánto llevas— y el aura dice la **rareza** —cuánto pesa—; lo prohibido era meter las dos
variables en el *mismo* elemento, no darle color a la segunda. Con eso, la lección de `_tiers.scss` sobre separar
por tono, luminosidad y saturación se aplica dentro de cada escala, no entre ellas.

**Y la escala se salta el azul a propósito.** La clásica de RPG es gris → verde → azul → morado, pero el azul ya
es el acento de la app y el color de la moldura: ahí chocarían las dos cosas que había que separar. Se sube un
peldaño —morado para el raro, naranja para el excepcional— y de paso el tope se lleva el naranja de legendario,
que es el que todo el mundo asocia con lo mejor.

### 6.6bis ⚑ El porcentaje medido: cuánta gente lo tiene

En Steam, debajo de cada logro pone «lo tiene el 4,2 % de los jugadores», y **eso es lo que le da peso a la
medalla**. Va en el listado del §8.1b, en la columna de la derecha, debajo del día del desbloqueo, y se ve tanto
en el propio como en el de una amistad.

**De dónde sale, y cuesta cero.** El hub ya se descarga hasta `SOCIAL_DIRECTORY_LIMIT` (50) perfiles al abrirse, y
a partir de F3 cada uno de ellos trae su espejo. Contar cuántos llevan cada `id` es recorrer cincuenta cadenas de
unos 600 bytes que **ya están en memoria**: ni una petición nueva, ni un campo nuevo, ni un byte más de canal.

**Y a la escala de hoy, esa muestra ES el total.** El directorio son los perfiles públicos ordenados por uso
reciente, y mientras haya menos de cincuenta el listado los contiene a todos: el porcentaje no es una
aproximación, es la cifra. Eso es lo que hace que esto se pueda entregar en F4 sin backend y sin asteriscos.

**Las cuatro reglas que lo mantienen honesto:**

1. **Se dice sobre cuántos.** «Lo tiene el 14 % · 6 de 43» y no un porcentaje suelto. Un porcentaje sin
   denominador es lo único de esta pantalla que se puede leer como una afirmación global, y no lo es.
2. **Suelo de muestra.** Por debajo de **20** perfiles con espejo, **no se pinta nada**. Con siete personas, «el
   14 %» es una persona: enseñarlo es peor que callarlo.
3. **No decide nada.** Ni puntos, ni aura, ni orden de la vitrina, ni prioridad de recorte: todo eso lo sigue
   gobernando la rareza declarada (§6.6). Si el porcentaje moviera los puntos, el nivel de perfil bailaría al
   ritmo de quién ha abierto la app esta semana, y un nivel que baja solo es el único fallo que el §5.5 no
   permite.
4. **Sigue sin haber ranking.** Es una propiedad **del logro**, no de las personas: no ordena a nadie, no pone dos
   personas en la misma vista y no aparece en el directorio ni en la bandeja. Las cuatro reglas del §6.10.4
   aguantan enteras, porque lo que prohibían era **ordenar gente**, y esto no ordena gente.

> **Cuándo deja de valer, y qué se hace entonces.** Pasados los ~50 perfiles públicos, el directorio deja de ser
> el censo y pasa a ser una muestra sesgada hacia quien más usa la app —que es justo el sesgo que infla los
> porcentajes—. El día que eso ocurra, la salida es un agregado de verdad: una **Pages Function** (ya hay
> infraestructura, `functions/api/` valida tokens de Firebase y hay KV a mano) que recorra los perfiles públicos
> una vez al día, cuente y deje `{ id → porcentaje, n }` en KV. **El cliente no cambia**: se le pide a esa
> función lo mismo que hoy calcula él, con la misma forma. Se diseña así desde F4 —una fuente detrás de una
> interfaz de una línea— para que ese cambio sea sustituir de dónde viene el objeto y nada más.

### 6.7 Ocultos: la parte que no se puede planificar

Un catálogo enteramente derivado y enteramente visible tiene un problema de tono: se lee como una lista de
tareas. Sabes lo que hay, sabes lo que te falta, y la app pasa de reconocer lo que haces a decirte lo que te
queda. Los logros ocultos de Steam son la contramedida, y aquí valen igual: **entradas cuyo nombre y condición
solo se revelan al conseguirlas**, en su hueco de la rejilla con un «?» y un contador que sí cuenta (§6.3.1).

**Cuántos: nueve, sobre 32 publicables.** El documento decía «cuatro o cinco» antes de medir; con los datos
reales (§6.8) la cuenta subió por dos motivos y los dos convencen. El primero, que **cuatro de los cinco
originales arrancan dormidos** por falta de sellos, así que cinco entradas dejaban la sorpresa entera apagada el
primer día. El segundo, que a un catálogo de 32 le sientan bien nueve casillas con «?»: es aproximadamente la
proporción que gastan los juegos de Steam, y es lo que hace que la rejilla se mire dos veces. Nueve es el techo,
no el punto de partida de otra subida: pasado ahí, la rejilla deja de tener forma y se vuelve una quiniela.

Tres reglas, y son estrictas porque el mecanismo se estropea fácil:

- **Nada que pida una campaña por toda la biblioteca.** La regla era «solo de la familia espejo», y al aplicarla
  se vio que estaba apuntando mal: lo que hace dañino a un oculto no es su familia, es **pedir un trabajo largo
  que no se puede empezar porque no se sabe cuál es**. Un oculto no puede empujar conducta —nadie sabe que
  existe—, así que el peligro real es otro: descubrir a toro pasado que había que haber rellenado trescientas
  fichas. Por eso «Tesis doctoral» (una reseña larga, familia *datos*) entra sin problema —es un hecho suelto que
  se reconoce, no una campaña— y un hipotético «rellena las horas de todo» seguiría prohibido.
- **Se consiguen haciendo algo natural, nunca adivinando.** El buen oculto es el que sale solo —terminar un juego
  el mismo día que lo añades, volver a un juego años después de abandonarlo, cerrar el último pendiente de tu
  lista— y al saltar hace sonreír. El malo es el que exige leer una guía: eso es una gincana, y aquí no hay
  ninguna razón para tener una.
- **Al conseguirse se publican y se pintan como cualquier otro** (§5.3). Ocultar es un estado del catálogo antes
  del desbloqueo, no una categoría permanente ni un secreto entre amistades.

> Y una consecuencia que hay que aceptar: un cliente antiguo que reciba el `id` de un oculto que aún no conoce lo
> ignora en silencio (§6.4). Es el comportamiento correcto y no hay que tocarlo — el oculto reaparecerá en cuanto
> esa persona actualice.

### 6.8 Lo que dice una biblioteca real: 302 juegos medidos

Todo lo anterior estaba calibrado a ojo. Se ha medido contra una biblioteca de verdad —**302 juegos**: 149
terminados, 87 abandonados, 64 pendientes, 2 en curso— replicando `normalizeGame` tal cual, siembra de sellos
incluida. Los números mandan sobre las intuiciones del documento y por eso van aquí.

**Lo que apareció, y es lo importante: los sellos de listas ANTERIORES no existen.**

| Medición | Resultado |
|---|---|
| Juegos con `enteredAt` de **dos** listas distintas | **0 de 302** |
| Juegos con el sello de su lista actual | 101 de 302 (33 %) |
| Juegos que comparten **una sola** fecha sellada en bloque | **203 de 302** |
| Con `reviewedAt` | 11 (3,6 %) · con `gradedAt`: 8 (2,6 %) |
| Rango entero de fechas fiables | **10 semanas** (26-jun-2026 → 3-sep-2026) |

La causa está en `normalizeEnteredAt`: siembra **solo el sello de la lista actual** desde `listedAt`, y **lo omite
si esa fecha va sellada en bloque** (`bulkStampedDates`, ocho juegos o más con el mismo milisegundo). En esta
biblioteca dos tercios entraron en una importación, así que ni siquiera tienen el de su lista actual. El §6.2.1
decía que las bibliotecas antiguas «empiezan más tarde»; el dato dice algo más duro: **empiezan en cero, y el par
de sellos que hace falta para medir un trayecto solo aparece cuando el juego se mueve con la app ya instalada**.

**Consecuencia asumida:** seis logros arrancan a cero y tardarán meses o años en despertar — `paciencia`,
`estanteria`, `deshielo`, `ano-redondo` y los ocultos `speedrun` y `segunda-vuelta`. **Se quedan en el catálogo
igualmente**, contando desde hoy, porque miden lo que hay que medir y el problema es de historia, no de diseño.
Lo que sí parecía haber que hacer era **decirlo en la tarjeta** —«este empieza a contar desde que lo
instalaste»—, y ⚑ **al verlo en pantalla se retiró**: seis logros con su párrafo de disculpa convertían el
listado en una hoja de excusas, y el que llega nuevo no tiene con qué comparar para echar de menos nada. El campo
`note` ya no existe en el catálogo (§10bis).

> **El fallo mudo que la medición cazó, y que habría llegado a producción.** El oculto **Speedrun** («terminar un
> juego el mismo día que lo añades») estaba a punto de implementarse como «`enteredAt.c` cae el mismo día que
> `listedAt`». Sobre esta biblioteca eso da **42 aciertos**, y **los 42 son falsos**: catalogar hacia atrás un
> juego viejo directamente como terminado sella las dos fechas el mismo día. La definición correcta exige el par
> —**entró en Próximos y se cerró el mismo día**— y sobre estos datos da 0, que es la respuesta verdadera. La
> regla general: **ningún logro puede compararse contra `listedAt` de la lista actual**, porque en un juego
> catalogado hacia atrás esa fecha es la de catalogarlo, no la de nada que pasara.

**Y el arreglo que sale gratis: lo anual se saca de `years`, no de `enteredAt`.**

| Fuente | Años distintos con algo completado |
|---|---|
| `enteredAt.c` | **1** (solo 2026) |
| `years` | **22** (2000–2026), poblado al 100 % |

`years` es exactamente la granularidad que estos dos logros necesitan —el año— y `normalizeEnteredAt` lo excluye
a propósito de los sellos justo porque *«de ahí solo sale el año y un sello con día y hora fabricados se leería
como exacto»*. Aquí no se fabrica nada: se usa el año como año. **`memoria-larga` y `buena-cosecha` miden sobre
`years`.** (`ano-redondo`, que necesita los doce meses, no puede: se queda en el grupo de los que empiezan hoy.)

### 6.9 Umbrales y rarezas, medidos

> ⚑ **La tabla de abajo es la primera calibración, la de 32 logros con cuatro niveles cada uno.** Los umbrales
> vigentes están en `docs/logros/catalogo.json`, regenerado desde el código, y son más finos: las escaleras se
> alargaron con escalones intermedios al pasar a un logro por escalón (§6.3bis). Lo que sigue valiendo es el
> MÉTODO —medir contra una biblioteca real y no calibrar a ojo— y los tres hallazgos del §6.8, que no dependen de
> dónde caiga cada listón. Cambios de fondo que sí hay que leer aquí: «Un verano entero» baja su listón de 60 h a
> **40** (con 60 solo 11 juegos de 302 lo pasaban y el tope era inalcanzable), «Lo terminé por orgullo» pasa de
> «menos de 40» a **menos de 50**, «Sin cabos sueltos» se queda en PORCENTAJE —contado en unidades decía
> exactamente lo mismo que «Con mis palabras»— y «Speedrun» se retira: pedía el par de sellos que ninguna
> biblioteca preexistente tiene Y además el mismo día.

Fijados contra esa biblioteca. El criterio: **nivel 1 en las primeras semanas** y **nivel 4 por encima de un
usuario intenso**, para que quede recorrido. La columna «real» es lo que da esa biblioteca de 302 juegos, que es
un usuario del extremo alto — no de la media.

| `id` | Umbrales | Rareza | Real | Nivel |
|---|---|---|---|---|
| `completados` | 10 / 50 / 150 / 400 → abierto | raro | 149 | 2 |
| `abandonos-razonados` | 5 / 20 / 60 / 150 | infrecuente | 87 | 3 |
| `constancia` (semanas seguidas) | 2 / 4 / 12 / 26 | raro | 11 | 2 |
| `generos` | 5 / 12 / 25 / 40 | infrecuente | 34 | 3 |
| `plataformas` | 3 / 6 / 12 / 20 | común | 18 | 3 |
| `rejugados` (vueltas extra) | 1 / 5 / 15 / 40 | infrecuente | 28 | 3 |
| `maraton` (≥ 60 h) | 1 / 3 / 10 / 25 | raro | 11 | 3 |
| `paciencia` | 1 / 3 | excepcional | 0 | 0 |
| `criterio` (notas, con desv. ≥ 12) | 20 / 75 / 200 / 500 | infrecuente | 274 | 3 |
| `memoria-larga` (años vía `years`) | 3 / 8 / 15 / 25 | raro | 22 | 3 |
| `deshielo` | 2 / 4 | excepcional | 0 | 0 |
| `estanteria` | 5 / 20 / 60 / 150 | raro | 0 | 0 |
| `veterano` (años con perfil) | 1 / 2 / 3 / 5 | común | — | — |
| `horas` | 10 / 40 / 100 / 250 | común | 76 | 2 |
| `resenas` | 5 / 25 / 75 / 200 | infrecuente | 98 | 3 |
| `cobertura` (%) | 25 / 50 / 75 / 90 | raro | 42 | 1 |
| `ficha-completa` | 10 / 40 / 100 / 250 | infrecuente | 92 | 2 |
| `autopsia` | 3 / 10 / 30 / 75 | infrecuente | 15 | 2 |
| `luces-y-sombras` | 5 / 25 / 75 / 150 | infrecuente | 85 | 3 |
| `amistades` | 1 / 3 / 10 | común | — | — |
| `conversador` | 2 / 8 / 26 | infrecuente | — | — |
| `ano-redondo` (años cumplidos) | 1 / 2 | excepcional | 0 | 0 |
| `buena-cosecha` (en un año) | 5 / 12 / 20 / 30 | raro | 24 | 3 |

**Ocultos** (§6.7)

| `id` | Nombre | Umbrales | Rareza | Real | Nivel |
|---|---|---|---|---|---|
| `obra-maestra` | Obra maestra | 1 / 3 | excepcional | 1 | 1 |
| `sofa` | Jugado en el sofá | 5 / 25 / 75 | común | 70 | 2 |
| `speedrun` | Speedrun | 1 / 3 | excepcional | 0 | 0 |
| `segunda-vuelta` | Volver a la hoguera | 1 / 3 / 10 | raro | 0 | 0 |
| `estanteria-cero` | Exterminatus | 1 | excepcional | 0 | 0 |
| `orgullo` | **Lo terminé por orgullo** | 1 / 3 / 10 | raro | 7 | 2 |
| `no-eres-tu` | **No eres tú, soy yo** | 1 / 3 / 10 | raro | 11 | 3 |
| `tesis` | **Tesis doctoral** | 1 / 5 / 20 | infrecuente | 29 | 3 |
| `vida-entera` | **Una vida entera** | 1 / 2 / 4 | raro | 4 | 3 |

Los cuatro en negrita son nuevos y entran porque **sí tienen dato hoy**: reponen a los ocultos que arrancan en
cero, para que la parte del catálogo que da sorpresa no esté toda dormida el primer día. Sus condiciones:
terminar un juego al que pusiste menos de 40 · abandonar uno al que pusiste 70 o más · escribir una reseña de más
de 1.000 caracteres · acumular 300 horas o más en un solo juego.

> **Regla que salió de cuadrar los puntos: un logro EXCEPCIONAL tiene como mucho dos niveles.** A 60 puntos por
> nivel (§6.10.2), cuatro niveles de un excepcional son 240 puntos — más que ningún otro logro del catálogo, y
> bastante para mover el nivel de perfil dos escalones él solo. Lo excepcional es excepcional por *conseguirse*,
> no por repetirse: si algo admite una escalera larga, no era excepcional, era raro.

**Reparto final:** 5 comunes · 10 infrecuentes · 11 raros · 6 excepcionales, sobre 32 logros publicables (más 6
de primeros pasos). El §13.3 suponía ~12/16/9/5 sobre ~48; el catálogo real es más pequeño y con más peso en la
mitad alta, y el dimensionado del §6.10.2 **aguanta**: esa biblioteca de 302 juegos sale a **22 de 32 (69 %)**,
**895 puntos** y **nivel 21**, con recorrido de sobra hasta el 41 que predecía el documento para «casi todo al
máximo».

> ⚑ **Revisión — la cuenta era 915 puntos y nivel 22, y no cuadra con esta misma tabla.** Sumando `nivelReal ×
> puntos de su rareza` sobre las 32 filas de arriba salen **895**, y 895 en la curva del §6.10.2 (180 hasta el
> nivel 10, luego 60 por nivel) dan **nivel 21 con 55 puntos hacia el 22**. Los 915 estaban también en
> `docs/logros/catalogo.json`, que ya lleva el número corregido. No cambia ninguna decisión —el dimensionado
> aguanta igual— pero era la única cifra del documento que no se podía reproducir desde sus propios datos, y una
> cifra así es la que hace dudar de las demás.

### 6.10 Las dos cifras: porcentaje (Steam) y nivel (PlayStation)

Los dos referentes resuelven cosas distintas y por eso van los dos. El **porcentaje** de Steam contesta «¿cuánto
me queda?» y **se puede terminar**. El **nivel** de PlayStation contesta «¿cuánto llevo?» y **no termina nunca**.
Con una sola, o el veterano se queda sin horizonte o el completista se queda sin meta; es exactamente la tensión
que abrió el §6.3.1, y estas dos cifras son su resolución.

#### 6.10.1 El porcentaje: logros, no niveles

```
Logros 22/32 · 69 %
```

Numerador: logros con nivel ≥ 1. Denominador: el catálogo actual **menos** los *primeros pasos* y **menos** los
retirados, **con** los ocultos dentro desde el principio (§6.3.1). El 100 % es alcanzable y ese es todo el punto.

#### 6.10.2 El nivel: puntos por rareza, curva por tramos

Cada **nivel alcanzado de cada logro publicable** suma los puntos de la **rareza de ese logro** (§6.6). No hay una
moneda que se gane por usar la app: se gana por lo que hay en la biblioteca, igual que todo lo demás.

> ⚑ **Revisión — los «primeros pasos» NO puntúan, y esto era un fallo de verdad.** El ejemplo de abajo sumaba
> `tutorial-resena · 5 pts` y el catálogo medido dice de esa familia «un nivel, rareza común, 5 pts». Pero los
> primeros pasos **no se publican nunca** (§5.3), así que el amigo que reconstruye el nivel desde el espejo no
> los tiene: el dueño se vería el nivel 7 y su amistad le vería el 6, con las dos cuentas correctas y ninguna
> forma de conciliarlas. Eso rompe de frente la propiedad que el §6.10.3 declara como la que hace esto
> defendible —«el dueño y quien mira ven lo mismo»— y la rompe en silencio, que es lo peor.
>
> **La regla queda simétrica y en una línea: lo que no se publica, no cuenta.** Ni en el numerador (ya estaba
> así), ni en el denominador (ya estaba así), ni en los puntos (esto es lo que se corrige). Los primeros pasos
> enseñan la app y se apagan solos; no son moneda. Igual que los retirados (§6.4), que dejan de contar en la
> fracción pero **sí conservan sus puntos**: esos se publicaron en su día y el que mira los ve.

| Rareza | Puntos por nivel |
|---|---|
| Común | 5 |
| Infrecuente | 10 |
| Raro | 25 |
| Excepcional | 60 |

```
completados      nivel 3 · raro         → 3 × 25 = 75
constancia       nivel 2 · infrecuente  → 2 × 10 = 20
plataformas      nivel 1 · común        → 1 ×  5 =  5
                                          ───────
                                           100 pts → Nivel 6 (faltan 20 para el 7)

paso-resena      nivel 1 · primeros pasos → NO puntúa (§6.10.2): no se publica, no cuenta
```

La escala es **suave a propósito** (5/10/25/60 y no 15/30/90/300 como PSN): con un catálogo de 32 entradas
publicables, un solo logro excepcional con la escala de PSN dispara el nivel de golpe y la curva deja de
sentirse ganada.

**La curva** — barata al principio, cara después, sin techo. Es la forma de PSN y por su mismo motivo: los
primeros niveles tienen que llegar en la primera semana o nadie llega al segundo.

| Tramo | Coste de cada nivel | Acumulado al final del tramo |
|---|---|---|
| 2 – 10 | 20 pts | 180 |
| 11 – 25 | 60 pts | 1.080 |
| 26 – 50 | 120 pts | 4.080 |
| 51 en adelante | 250 pts | sin techo |

Contra el catálogo previsto: una semana de uso normal ronda el **nivel 3**; una biblioteca madura con casi todo a
nivel 4 se queda sobre el **41**. Queda sitio de sobra por arriba y no hay ningún escalón que se alcance por
accidente.

**El nivel nunca baja**, y no hace falta escribir nada para conseguirlo: sale de niveles de logro que ya están
protegidos por la marca de agua (§5.5). Si un día bajara, el fallo estaría en la marca de agua, no aquí.

#### 6.10.3 Las dos cifras las calcula el que mira

Ni el porcentaje ni el nivel se publican. **No hacen falta**: el espejo ya lleva la lista de logros con su nivel
(§5.3) y el catálogo lleva la rareza de cada uno, así que cualquier cliente los reconstruye exactamente. Publicar
un número que se puede derivar es justo lo que el §1 dice que no se hace, y además crearía un segundo sitio donde
mentir.

**Y el dueño y quien mira ven lo mismo**, que es la propiedad que hace esto defendible: el espejo lleva
exactamente los logros conseguidos, el denominador ya excluía los *primeros pasos* (que no se publican, §5.3) y
los retirados, así que las dos cuentas salen iguales sin coordinar nada. Es la misma convergencia sin hablar que
tienen las fechas del §5.1.

Tiene dos aristas y van escritas. La primera: **un cliente con el catálogo desactualizado ve un poco menos**. Los `id`
que no conoce los ignora en silencio (§6.4) y su denominador es más pequeño, así que su cuenta se queda corta. Es la
dirección segura del error —nunca infla, siempre desmerece— y se corrige sola en cuanto esa persona actualiza. Lo que
**no** se hace es intentar taparlo publicando el número: eso cambia un desfase temporal por un dato falsable.

La segunda: si algún día la cadena tocara el tope de 1 kB y hubiera que recortar (§5.3), el que mira contaría de
menos. Con el catálogo medido no pasa —los 32 publicables ocupan **608 bytes en el peor caso** y el tope da para
unos 54 con los `id` actuales— y, si pasara, el error vuelve a ir a la baja. Lo importante es no *arreglarlo*
publicando la cifra, por lo mismo de siempre.

Y no hay una tercera: se estudió filtrar el espejo por los ajustes de visibilidad, que habría metido un desfase
permanente entre lo que ve el dueño y lo que ve su amistad, y **se descartó** (§5.3bis). Las dos cuentas salen
iguales.

#### 6.10.4 Las cifras se ven fuera, y esto es lo que las mantiene sanas

El nivel y el porcentaje **se pintan también en la ficha de una amistad**, como en Steam y en PSN. Eso mueve la
línea que la tabla de decisiones tenía en «no hay comparación», así que la línea se redibuja donde de verdad
importa: **el problema nunca fue que se vea un número ajeno, fue ordenar a la gente por él**. Cuatro reglas, y las
cuatro son de construcción, no de buena voluntad:

- **Nada se ordena por nivel.** Ni el directorio, ni la bandeja, ni el feed. Un ranking es una lista ordenada: sin
  lista ordenada no hay ranking, por mucho que cada ficha enseñe su cifra.
- **Nunca dos personas con sus cifras en la misma vista.** El nivel se pinta en la ficha individual y en ningún
  sitio más — en particular, **no en la tarjeta del directorio**, que es una rejilla de muchas y convertiría la
  pantalla en una tabla de clasificación sin haberla programado.
- **Subir de nivel no se anuncia en el feed.** El feed anuncia logros y solo los raros (§8.4). Un aviso por nivel
  llenaría el feed del que más juega, que es lo contrario de lo que el §6.1 persigue.
- **El nivel no desbloquea nada.** Los temas los abre un logro concreto (§6.5), nunca el nivel. Es exactamente la
  trampa de Pepper del §0.1: en cuanto un número agregado abre puertas, deja de ser un adorno y pasa a ser una
  escalada de privilegios autoservida (§4).

### 6.11 Nombres e iconos

El tono queda fijado: **guiño en el nombre, contrato en la línea de debajo** (§6.4). Los guiños son a juegos
concretos —los seis temas de la app incluidos, que para eso están— y la condición se dice siempre en claro
debajo, que es lo que impide que un nombre bonito se convierta en un acertijo.

Cada logro lleva **su propio icono**, en un sprite aparte y perezoso (§8.5). Los nombres son propuesta y se pueden
retocar; los `id` no (§6.4).

**Espejo**

| `id` | Nombre | Condición (la línea de debajo) | Guiño | Icono |
|---|---|---|---|---|
| `completados` | **Créditos finales** | Juegos que has terminado | — | rodillo de créditos |
| `abandonos-razonados` | **Retirada táctica** | Abandonos con la razón anotada | táctico | flecha en U sobre escudo |
| `constancia` | **Aún estás aquí** | Semanas seguidas con actividad | *Portal* («Still Alive») | onda de pulso |
| `generos` | **Mundo abierto** | Géneros distintos con algo cerrado | género | brújula |
| `plataformas` | **Guerra de consolas** | Plataformas distintas en tu biblioteca | cultura | dos mandos cruzados |
| `rejugados` | **New Game +** | Vueltas extra registradas | *Chrono Trigger* | flecha circular con `+` |
| `maraton` | **Un verano entero** | Juegos con 60 h o más anotadas | *Persona 5* | sol sobre calendario |
| `paciencia` | **Ya iba siendo hora** | Terminados tras más de un año en Próximos | — | reloj de arena |
| `criterio` | **Nota del crítico** | Tus notas tienen criterio, no una sola nota para todo | — | pluma sobre nota |
| `memoria-larga` | **Partida guardada** | Años naturales distintos con algo completado (fuente: `years`, §6.8) | tarjeta de memoria | disquete |
| `deshielo` | **El deshielo** | Meses seguidos con Próximos a la baja | — | copo derritiéndose |
| `estanteria` | **La pila de la vergüenza** | Juegos rescatados de Próximos y jugados | cultura | pila de cajas |
| `veterano` | **De la vieja escuela** | Años con perfil en la app | — | cartucho |

**Espejo · ocultos** (§6.7) — nombre y condición tapados hasta conseguirlos

| `id` | Nombre | Condición | Guiño | Icono |
|---|---|---|---|---|
| `speedrun` | **Speedrun** | Un juego que **entró en Próximos y se cerró el mismo día** (§6.8: el par de sellos, nunca `listedAt`) | universal | cronómetro con rayo |
| `segunda-vuelta` | **Volver a la hoguera** | Terminar un juego que habías abandonado | *Dark Souls* | hoguera |
| `estanteria-cero` | **Exterminatus** | Dejar Próximos a cero | *Warhammer 40.000* | planeta con haz |
| `obra-maestra` | **Obra maestra** | Poner un 100 a un juego | — | laurel |
| `sofa` | **Jugado en el sofá** | Juegos marcados como Steam Deck | *Steam Deck* | `steamdeck` (ya existe) |
| `orgullo` | **Lo terminé por orgullo** | Terminar un juego al que pusiste menos de 40 | — | puño apretado |
| `no-eres-tu` | **No eres tú, soy yo** | Abandonar un juego al que pusiste 70 o más | — | corazón partido |
| `tesis` | **Tesis doctoral** | Escribir una reseña de más de 1.000 caracteres | — | pergamino |
| `vida-entera` | **Una vida entera** | 300 horas o más en un **solo** juego | — | reloj de arena lleno |

**Datos**

| `id` | Nombre | Condición | Icono |
|---|---|---|---|
| `horas` | **Tiempo jugado** | Juegos con las horas anotadas | reloj |
| `resenas` | **Con mis palabras** | Reseñas escritas | `signature` (ya existe) |
| `cobertura` | **Sin cabos sueltos** | Parte de lo que cierras que acaba con reseña | lazo deshecho |
| `ficha-completa` | **Ficha de manual** | Juegos con géneros, plataforma, nota y reseña | ficha con cuatro casillas |
| `autopsia` | **Informe forense** | Abandonos con razón **y** reseña | lupa sobre calavera |
| `luces-y-sombras` | **Luces y sombras** | Reseñas con puntos fuertes y débiles | media luna partida |

**Social**

| `id` | Nombre | Condición | Guiño | Icono |
|---|---|---|---|---|
| `amistades` | **Modo cooperativo** | Amistades confirmadas | universal | dos siluetas |
| `conversador` | **Charla de taberna** | Semanas distintas en que has publicado algo | posada de RPG | jarra |

**Repetibles por año natural** (§6.3)

| `id` | Nombre | Condición | Guiño | Icono |
|---|---|---|---|---|
| `ano-redondo` | **Solsticio a solsticio** | Un año natural con actividad los doce meses | *Sea of Stars* | sol y luna |
| `buena-cosecha` | **Cosecha del año** | Un año natural con muchos juegos terminados (fuente: `years`, §6.8) | — | espigas |

**Primeros pasos** (no se publican, no dan tema, se apagan solos)

| `id` | Nombre | Condición | Guiño | Icono |
|---|---|---|---|---|
| `paso-primer-juego` | **Empieza la partida** | Añade tu primer juego | — | `plus` (ya existe) |
| `paso-resena` | **Despierta, samurái** | Escribe tu primera reseña | *Cyberpunk 2077* | ojo que se abre |
| `paso-sync` | **Partida en la nube** | Conecta la sincronización | — | `cloud-sync` (ya existe) |
| `paso-nota` | **Del 0 al 100** | Pon tu primera nota fina | — | dial |
| `paso-ruleta` | **Tira el dado** | Prueba la ruleta | RPG de mesa | `dice-d20` (ya existe) |
| `paso-tema` | **Ajustes de vídeo** | Estrena un tema | cultura | monitor |

> **Regla de higiene del guiño.** La referencia va **en el nombre y solo ahí**. La línea de debajo dice qué hay
> que hacer, en castellano llano y sin la broma: quien no pilla la cita tiene que poder usar el catálogo igual de
> bien que quien la pilla. Un guiño que hay que explicar en la descripción ya no es un guiño, es un peaje.

---

## 7. Cálculo

### 7.1 Entradas

```ts
evaluateAchievements({
  games: TabData,                    // la biblioteca, ya cargada en memoria
  social: {                          // contadores que no salen de la biblioteca
    friends: number,                 // de `MyFriendships` (ya cargado por el hub)
    postWeeks: number,               // semanas distintas con publicación, del gist social propio
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

### 7.4 El instante: lo único que la derivación se puede dejar por el camino

Todo lo anterior describe cómo se **encuentra** un logro al abrir el panel. Falta lo otro, y es lo que de verdad
sostiene un sistema de logros: **el momento en que salta**. En Steam la medalla aparece encima de lo que estabas
haciendo, justo cuando lo hiciste, y esa coincidencia es toda la carga emocional del mecanismo. Un sistema
derivado la pierde con una facilidad alarmante: marcas un juego como terminado, la app guarda, y el logro número
150 aparece callado tres días después cuando se te ocurre entrar en `/perfil`. Técnicamente correcto y
emocionalmente nulo.

**La regla: se reevalúa después de cada escritura de la biblioteca, y si un nivel ha subido EN ESA escritura, se
dice ahí mismo.** No hace falta inventar nada para decirlo: el aviso va por el mismo sitio que «Juego guardado»
—`StatusBanner`, que ya tiene su región viva siempre montada y su `role="status"` de cortesía— con el texto
«Logro conseguido: Créditos finales IV». Un aviso más de los que ya existen, no una capa nueva.

Cuatro condiciones para que no se vuelva molesto:

- **Solo lo que sube en ESTA escritura**, comparando contra el estado inmediatamente anterior. Nunca el arrastre
  de retroactividad del §7.3: quien importa una biblioteca entera no recibe veinte avisos, recibe la tira de
  novedades al entrar en el panel.
- **Uno por escritura.** Si una edición sube tres logros a la vez, el aviso es «3 logros conseguidos» y el
  detalle está en el panel. Misma regla que el §8.4 y por el mismo motivo.
- **Nunca bloquea.** Es el banner de siempre, con su `role="status"` y no `alert`: no interrumpe al lector de
  pantalla ni se pone delante del formulario que el usuario estaba rellenando.
- **El destello, detrás de `data-effects` y de `prefers-reduced-motion`** (§8.5). Sin efectos, el aviso sigue
  saliendo: lo decorativo es el brillo, no la noticia.

> Coste: la reevaluación completa tras cada guardado. Son unos pocos milisegundos sobre 2.000 juegos (§7.2) y ya
> se memoiza, así que no hace falta ni diferirlo. Si algún día molestara, el arreglo es evaluar solo los logros de
> la familia espejo en ese punto — nunca dejar de avisar.


### 7.5 ⚑ Las métricas, una a una: dónde la ausencia de dato se lee como dato

El §6.8 cazó un falso positivo —«Speedrun» comparando contra `listedAt`: 42 aciertos, los 42 falsos— y dejó la
regla general escrita. Al recorrer las 32 métricas contra los tipos reales aparecen **cuatro más de la misma
familia**, y todas por el mismo motivo: en este modelo **la ausencia de un dato tiene un valor numérico**, y ese
valor cae dentro del rango que la métrica busca.

**`orgullo` — «Lo terminé por orgullo», terminar un juego al que pusiste menos de 40.** `resolveGrade` devuelve
**0** para un juego sin nota (`grade` ausente y `score` ausente), y 0 es menor que 40. Tal como está definida, la
métrica cuenta **todos los completados sin puntuar**, que en una biblioteca normal son muchos. Es exactamente el
error de «Speedrun» con otro campo.
→ **Guarda: `grade > 0 && grade < 40`.** Y va en la definición, no en un comentario.

**`criterio` — «Nota del crítico», desviación típica de tus notas.** Mismo campo, dos daños distintos: los
juegos sin nota entran en el recuento con un 0 que **infla el contador** y a la vez **infla artificialmente la
desviación** (un montón de ceros junto a notas reales dispara la dispersión, que es justo lo contrario de lo que
el logro quiere premiar). El catálogo dice «nº de notas», y una nota que no existe no es una nota.
→ **Guarda: contar y promediar solo `grade > 0`.**

**`obra-maestra` y `no-eres-tu`** buscan hacia arriba (`== 100`, `>= 70`), así que el 0 no los toca. Se dejan
escritas aquí igualmente para que quede constancia de que se miraron: el criterio no es «qué métricas tienen
guarda», es «qué hace cada una con la nota ausente», y las cuatro tienen respuesta.

**`estanteria-cero` — «Exterminatus», dejar Próximos a cero.** Es un **estado**, no un hecho, y ahí está la
trampa: `p.length === 0` es cierto para quien vació su pila… y **también para quien acaba de instalar la app**.
Un usuario nuevo desbloquearía en su primer render un logro **excepcional** de 60 puntos —el más caro del
catálogo— por no tener nada. Y como la marca de agua no retira nada (§5.5), se lo quedaría para siempre.
→ **Guarda: `p.length === 0 && existe algún juego con `enteredAt.p`.`** O sea: hay que haber **tenido** una pila
para poder vaciarla. Encaja con su bloque `dormido` del catálogo y con el §6.8: mide un trayecto, y un trayecto
necesita punto de partida.

**`cobertura` — «Sin cabos sueltos», % de lo cerrado que tiene reseña.** Denominador `c + v`, que en una
biblioteca vacía es 0.
→ **Guarda: sin nada cerrado, el valor es 0, no `NaN`.** No es un falso positivo, es una división; se anota aquí
porque es la única métrica del catálogo que puede dividir por cero y porque un `NaN` recorriendo el
empaquetado ensucia la cadena sin que salte ningún error.

**`conversador` — «Charla de taberna», semanas distintas en que has publicado algo.** No es un falso positivo,
son dos definiciones que había que fijar:

- **Qué cuenta como «publicar»:** las publicaciones de texto (`posts`) **y** las reseñas (`activity` de tipo
  `review`). Las dos aparecen en el feed de sus amistades, que es lo que el logro mide. Contar solo `posts`
  dejaría fuera a quien participa escribiendo reseñas, que es la forma principal de aparecer en el feed de esta
  app.
- **El histórico se pierde por arriba, y es tolerable:** `posts` está recortado a **100** entradas y `activity` a
  **320** en el propio gist. Quien publique mucho durante años perderá las semanas más viejas y el **valor** de la
  métrica bajará. La **marca de agua** (§5.5) impide que el nivel baje con él, y —esto es lo que separa este caso
  del logro de enlaces compartidos que se cayó del catálogo (§6.2)— **el recorte lo hace el gist, que es
  compartido**, así que los dos dispositivos del mismo usuario ven exactamente la misma lista recortada y siguen
  convergiendo. Ese, y no otro, era el defecto que descalificaba a los enlaces.

> **La regla que resume las cinco, y merece ir en el mismo sitio que la de `listedAt`:** *ninguna métrica puede
> tratar un campo ausente como un valor.* Ni la nota que no está (0), ni la lista que aún no existe (vacía), ni
> el denominador que todavía no tiene nada dentro. Un test por métrica con **una biblioteca recién creada** y con
> **una biblioteca sin puntuar** las caza todas de golpe, y las dos fixtures cuestan diez líneas.

---

## 8. Interfaz

### 8.1 `/perfil` — un apartado propio, debajo de «Lo mejor de tu biblioteca»

⚑ **No es una cifra destacada en la cabecera: es una tarjeta más del panel**, con su `<h2>` y su subtítulo, como
las demás. Va **inmediatamente después del bloque `top`** —«Lo mejor de tu biblioteca»— y antes de `years`. El
sitio no es casual: `top` es lo que la biblioteca tiene de mejor y los logros son lo que su dueño ha hecho con
ella; leídos seguidos, cuentan la misma historia desde los dos lados.

El punto de enganche exacto es el `has('top') ? … : null` de `StatsPanel.tsx`, y la tarjeta nueva sigue su misma
forma: `<div className="stats-card">` con título, subtítulo y contenido. Entra además en `OWN_STATS_BLOCKS`
(`core/stats/types.ts`) como bloque `'achievements'`, que es lo que decide qué ve un espectador y qué no.

**Qué lleva la tarjeta**, y nada más:

- **La cifra** (§6.10): «Logros 22/32 · 69 %», con su barra. ⚑ El **nivel de perfil se calcula pero no se
  enseña** mientras no esté decidido cómo se presenta (§10bis). ⚑ El denominador son **32**: los publicables del catálogo medido (§6.9), sin los
  seis *primeros pasos* y sin los retirados. Son **logros**, no niveles, y la etiqueta lo dice con esas palabras
  (§6.3.1).
- **Una fila de las últimas medallas conseguidas**, solo imagen, con el mismo comportamiento que la de la ficha
  social (§8.2): el nombre aparece al pasar por encima. Es un adelanto, no la rejilla.
- **La tira de novedades** si la hay (§7.3), y el foco del mes (§6.3).
- **Un enlace a `/logros`**, que es donde está todo.

La hoja de la tarjeta entra en el chunk perezoso del panel, como `stats.scss`; **la de la medalla no** —esa es
propia y la importa el componente (§8.5).

### 8.1b `/logros` — el listado, como en Steam

⚑ **Ruta de primer nivel, `/logros`**, y no una sub-ruta del panel. Cuesta **una línea** en `APP_ROUTES`
(`core/constants/routes.ts`) con `section: 'stats'`, y a cambio es una dirección que se dice en voz alta y se
comparte. El comodín `/perfil/*` habría salido gratis, pero deja la pantalla escondida detrás del nombre de otra
cosa: el panel se llama «Perfil» por herencia de cuando la pestaña se llamaba así, y meter los logros ahí dentro
los ata a esa herencia para siempre.

**Y la forma es la de Steam: un listado, no una rejilla.** Una fila por logro, y cada fila lleva —siempre, en este
orden— **la imagen, el nombre, la descripción y el día en que se desbloqueó**. Es la disposición que ese usuario
ya sabe leer sin que nadie se la explique, y resuelve de paso lo que una rejilla de cuarenta cuadros no puede: la
descripción cabe entera, sin recortes ni globos de ayuda.

| Zona de la fila | Contenido |
|---|---|
| Izquierda | La medalla a **72 px**, con su aura de rareza y su triángulo de grado |
| Centro | **Nombre** en una línea y **descripción** debajo — la condición literal y, si no está al tope, el progreso con la forma de Steam: ⚑ «13 de 20 · 65 %» (§6.4) |
| Derecha | **El día del desbloqueo**, y debajo el **porcentaje de gente que lo tiene** (§6.6bis) |

- ⚑ **Los conseguidos arriba y lo que falta debajo, en UNA sola lista y sin agrupar por familia** (§10bis).
  Dentro de la primera mitad manda la fecha —lo último, primero—; en la segunda, **lo cerca que está de caer**,
  que es lo útil de ese tramo. El **oculto** que no se tiene ocupa su fila con «?» y «se revela al conseguirlo»,
  nunca una pista — ni siquiera su rareza, que con seis excepcionales en el catálogo ya sería una.
- **Sin fecha, sin fila coja.** Un logro conseguido cuyo sello no se puede deducir (§5.3) deja ese hueco vacío, no
  pone «desconocido» ni inventa una fecha.
- **El nivel y su barra** encabezan la pantalla, con el desglose por familia y su propio porcentaje.
- La misma pantalla sirve para una amistad (§8.2), cambiando de dónde salen los datos: es el patrón que ya usan
  `StatsReviews` y `ProfileReviewsList`, que son la misma lista leyendo dos fuentes.

### 8.2 `/social/profiles/:profileId` — los de una amistad

⚑ **La fila de medallas va DEBAJO DEL NOMBRE, y ahí solo se ve la imagen.** El punto exacto es el
`hub-profile-hero` de `SocialProfileDetailScreen.tsx`: avatar, `<h3 className="hub-profile-hero-name">` y, justo
después, la tira. Sin rótulos, sin fechas, sin cifras alrededor: **una fila de cuadros a 48 px y nada más**.

**El nombre aparece al pasar por encima**, y esa es toda la interacción de esa fila. Que sea solo imagen es lo que
la hace funcionar en ese sitio: la cabecera de una ficha ya tiene avatar, nombre y muesca de rango, y una fila de
medallas con su rótulo debajo la convertiría en un listado. Así es una firma —lo que esa persona ha hecho, de un
vistazo— y quien quiera el detalle entra en el listado.

**Cómo se dice el nombre, y no vale con un `title`.** El `title` de HTML no sale con teclado, no sale en táctil y
los lectores de pantalla lo tratan de forma desigual. Cada medalla es un `<button>` (o un enlace al listado) con
su **nombre accesible completo** —«Créditos finales IV, conseguido el 12 de marzo de 2026»— y el rótulo visible
sale en `:hover` **y en `:focus-visible`**, para que llegue igual por teclado. En táctil no hay hover: ahí el toque
lleva al listado, que es donde está el nombre escrito.

**Las dos cifras** —nivel y porcentaje (§6.10)— van en la cabecera de la ficha, junto al nombre, **no dentro de la
tira**. Y el resto —fechas, descripciones, el porcentaje de cada logro— vive en
**`/social/profiles/:profileId/logros`**, que es el mismo listado del §8.1b leyendo el espejo de esa persona. Esa
sub-ruta la resuelve el hub por su cuenta con `matchSocialRoute` (una entrada más en `SOCIAL_ROUTES`, junto a
`profileReviews`), así que **no toca `routes.ts`**.

Todo esto es una lectura del espejo ya descargado —y las dos cifras las calcula el propio cliente a partir de él
(§6.10.3)—: **cero peticiones nuevas y cero bytes más de canal**. Sin barras de progreso y sin huecos de lo que no
tiene (§3).

Las cifras se pintan **aquí y en ningún otro sitio**: nunca en la tarjeta del directorio ni en la bandeja, que son
rejillas de muchas personas y convertirían la pantalla en una tabla de clasificación (§6.10.4).

Si el perfil no publica logros (opt-out, o cliente antiguo), **la vitrina no se pinta**. Ni marco vacío ni «este
usuario no tiene logros»: no hay nada que decir.

**Y la misma tira va en la ficha propia**, debajo del propio nombre, por la razón de siempre en este
repositorio: lo que se enseña de uno mismo se mira en el mismo sitio en que lo miran los demás, o no hay forma de
saber qué está viendo la otra persona.

**Destacados.** El dueño puede fijar hasta **tres** medallas que van primero (marca `!` en la cadena, §5.3). Es
personalización real por unos pocos bytes, y resuelve el problema de que la vitrina de alguien con treinta
medallas se lea toda igual: lo que esa persona quiere enseñar de sí misma lo decide ella, no el orden del
catálogo. El que lee **recorta a tres** aunque lleguen más marcados: es una preferencia ajena, no una instrucción.

**Y sin destacados, la vitrina se ordena sola por rareza y luego por nivel** (§6.6) — no por familia, que era el
orden anterior y tenía un defecto silencioso: producía **la misma vitrina para todo el mundo**, siempre encabezada
por el mismo logro de espejo, porque el catálogo se recorre en el mismo orden para todos. Es la lección de las dos
vitrinas de Steam (§0.2): la de a mano dice lo que esa persona quiere enseñar; la automática dice lo que tiene de
particular. Con la mayoría de la gente sin tocar nunca los destacados, el orden por defecto **es** la vitrina, y
tiene que decir algo.

### 8.3 El interruptor

En el editor del perfil social, junto a los que ya hay (foto, listas ocultas). Su valor vive en
`publicConfig/{uid}.showAchievements`, con el mismo mecanismo que `feedMoveTabs` (`createPreferenceStore` con
`cloudField`, ver `feedMovePreference.ts`), para que siga al dueño entre dispositivos.

> ⚑ **Revisión — son cuatro sitios, no uno, y saltarse el cuarto es un fallo mudo ya documentado en las reglas.**
> `createPreferenceStore` con `cloudField` no basta por sí solo:
>
> 1. **`publicConfigWriteIsValid()` en `firestore.rules`**: la allowlist es un `hasOnly` cerrado. Sin
>    `"showAchievements"` dentro, Firestore **deniega la escritura entera** de `publicConfig` —no solo esa
>    clave— y la preferencia no sincroniza nunca. Esto ya pasó en este repositorio y está escrito en el
>    comentario de esa misma función: *«`effects` faltaba en la allowlist aunque el cliente ya lo escribía […]
>    sin él, esa preferencia se denegaba en silencio y nunca sincronizaba»*. Va con su validación de tipo,
>    como las demás: `!("showAchievements" in …) || … is bool`.
> 2. **`FirestorePublicConfig`** (`model/types/firestore.ts`): `cloudField` está tipado como
>    `keyof FirestorePublicConfig`, así que sin el campo no compila.
> 3. **Una clave en `core/constants/storageKeys.ts`**, que es donde viven las de las demás preferencias.
> 4. **Registrarla donde se declaran las preferencias con nube.** Lo dice la cabecera de `feedMovePreference.ts`:
>    *«`hydratePreferencesFromCloud` solo hidrata las preferencias YA declaradas»*. Si el módulo solo se importa
>    desde el hub, quien inicie sesión sin abrirlo no recibirá su propia preferencia del otro dispositivo. Y va
>    en módulo propio por el mismo motivo que aquella: colgarla de `view/hooks/preferences` mete ese módulo y sus
>    dependencias en el chunk de arranque y `ci-validate` lo corta.
>
> Test de reglas de F3, junto a los otros: **`publicConfig` con `showAchievements: false` se acepta; con
> `showAchievements: "no"` se deniega.**

**Apagarlo BORRA el campo del perfil público** (`deleteField()`), no lo esconde al pintar. Es la misma lección que
la foto del autor en las reseñas compartidas: *ocultar al pintar no sirve de nada cuando el JSON llega igual al
navegador del que mira*.

### 8.4 Novedades de tus amistades, sin publicar nada

En el feed aparece «*Fulano* ha conseguido **Créditos finales IV**». Y **no cuesta ni un byte de canal**: el
lector compara el espejo que acaba de bajar con el último que vio de esa persona y deduce el cambio él solo.
Ninguna escritura nueva, ningún campo nuevo, ninguna entrada en el gist social.

Es la misma idea que sostiene todo el documento —derivar en vez de registrar— aplicada al otro lado del canal.

> ⚑ **Revisión — la foto anterior NO puede ser la caché del directorio, y esto tumbaba F5 entero.** El plan decía
> «el hub ya cachea el directorio en IndexedDB, así que el lector compara […] con el que tenía guardado». Esa
> caché (`getCachedSocialDirectory`) es un **caché con TTL, no un registro**, y las tres propiedades que la hacen
> buena para su trabajo la inhabilitan para este:
>
> 1. **Caduca, y el TTL lo pone el rango de quien mira** (`PROFILE_TIER_FEED_TTL_MS`: 30 min bronce, 15 plata, 10
>    oro, **60 s mithril**). Pasado el TTL devuelve `null`, que para el §8.4 significa «no hay foto previa» y por
>    tanto «sembrar y callar». El resultado sería exactamente el revés de lo que el rango promete: **cuanto más
>    alto el rango, menos logros de amigos se anuncian**, y un mithril no vería ninguno jamás.
> 2. **Se invalida con el grafo de amistad** (`invalidateCachedSocialDirectory` al aceptar o eliminar): aceptar a
>    alguien borraría la línea base de todos los demás.
> 3. **Se descarta entera al subir `SOCIAL_DIRECTORY_CACHE_VERSION`**, y añadir `achievements` a las entradas
>    obliga a subirla a 5. La propia versión que estrena F5 se quedaría muda el primer día.
>
> **La línea base va aparte, en `achievementsPeerSeen` de `LocalMeta` (§5.4): un mapa `profileId → cadena`, sin
> TTL, que se actualiza en cada hidratación y solo se poda cuando la amistad desaparece.** Es el mismo patrón que
> `friendshipHealedForGist` y por el mismo motivo: lo que hay que recordar «hasta la próxima vez» no cabe en algo
> que existe para caducar. La caché del directorio se sigue usando para lo que es —traer el espejo sin releer
> Firestore—, y **sí** hay que subir su versión a 5 al añadir el campo.

⚑ **Y se agrupa POR DÍA, no por logro.** Es la regla que ya se puso F4 a sí mismo y aquí se aplica igual: una
entrada por persona y día, con **todos los logros de ese día dentro**. No cinco entradas seguidas del mismo
nombre bajando por el feed.

```
Fulano · hace 2 días
Ha conseguido 3 logros
[🏅] Créditos finales IV   [🏅] Un verano entero II   [🏅] Tesis doctoral
```

La entrada lleva la medalla de cada uno y su nombre, y pincharla abre `/social/profiles/:profileId/logros`. Con un
solo logro, el texto es «Ha conseguido **Créditos finales IV**» y la fila es una medalla: no se dice «1 logro».

**El agrupado es de LECTURA, no de publicación**, y esa distinción importa: no se publica nada nuevo (§8.4 no
escribe un byte), así que agrupar es simplemente cómo el lector presenta la diferencia que acaba de deducir. Es la
misma decisión que F4 tomó con los mensajes de lista y por el mismo motivo.

Reglas para que no se convierta en ruido:

- **Solo lo reciente.** Un logro cuyo día caiga fuera de los últimos 30 no se anuncia, aunque el lector lo vea por
  primera vez. Sin esto, quien lleva un mes sin abrir el hub recibe treinta anuncios de golpe (§7.3). Es el corte
  que de verdad acota el volumen.
- **La primera vez no anuncia nada.** Sin línea base no hay «cambio», hay una foto inicial. Sembrar y callar —y
  ahora la línea base es duradera, así que «la primera vez» es de verdad una vez por dispositivo y no una vez
  cada TTL.
- **Respeta el opt-out** por construcción: quien no publica no tiene espejo que comparar.
- ⚑ **Todos los logros cuentan, y el filtro de rareza se cae.** El documento reservaba el feed para lo raro, y ese
  filtro existía para acotar el volumen — trabajo que **el agrupado por día ya hace, y mejor**: con una entrada
  por persona y día, alguien que desbloquea seis medallas en una tarde ocupa un renglón, no seis. Filtrar además
  por rareza dejaba fuera precisamente lo que más se celebra al principio, que es cuando alguien acaba de
  empezar y todo lo que consigue es común.
- **Solo espejo, anual y social**, nunca la familia *datos*: ver §13.6, que esta pasada da por resuelto. ⚑ Los
  **anuales** entran con el espejo —«Cosecha del año» es una noticia y no empuja a rellenar nada— y los
  **ocultos** entran cuando se consiguen, como cualquier otro (§6.7): anunciarlos no revela nada que el catálogo
  del lector no supiera ya. Los *primeros pasos* no pueden entrar aunque se quisiera: no se publican (§5.3).

### 8.5 Diseño de las medallas

**El contrato visual ya está inventado en esta casa y es el de los rangos.** `_tiers.scss` lo dice en su cabecera:
*«cada clase solo aporta su color de metal en `--tier`; quien la use decide la forma»*, y de ahí sale la muesca de
la tarjeta del directorio, que no añade un adorno encima sino que **tiñe un tramo del borde que ya estaba ahí**.
Las medallas van igual: un token `--medal` por nivel, una forma base sobria, y que **cada tema las vista** en su
`themes/*.scss` si tiene algo que decir. Acabado sobre el diseño base, no un lenguaje visual paralelo.

**La forma: cuadrado de esquinas redondeadas, y la imagen A SANGRE.** El cuadrado gana por una razón que no es de
gusto: la rejilla de `/perfil/logros` tiene casi cuarenta celdas y la fila de la ficha social comparte espacio con
el avatar y la muesca de rango. Un cuadrado teselado se alinea solo; un escudo o una copa —la forma de PSN— deja
huecos irregulares y obliga a inventar una caja invisible alrededor de cada uno. **Y no hay marco**: la imagen
ocupa el cuadrado entero, con apenas un 4 % de redondeo.

| Pieza | Valor |
|---|---|
| Lado | ⚑ **48 px** en el listado y en la tira de una ficha · 28 px en la tarjeta del feed. Los 72 px que decía este plan hacían cada fila casi tan alta como ancho su cuadro (§10bis) |
| Radio | **4 % del lado.** Lo justo para que no sea un cuadrado crudo |
| Marco | **Ninguno** |
| Imagen | `viewBox` de 32, **a sangre**, recortada por el radio |
| Aura | Halo exterior de color: dice la **rareza** (§6.6) |
| Triángulo | 48 % del lado en el ángulo inferior derecho, con degradado a 135°: dice el **grado** |
| Numeral | Romano I–IV, dentro del triángulo, en texto y con `tabular-nums` |
| Pintura | `filter: url(#imp)` — turbulencia, desenfoque y empaste (`feDiffuseLighting`) |

**Todas miden exactamente lo mismo**, tenga el logro el grado que tenga y esté conseguido, bloqueado u oculto:
una rejilla de medallas de distinto tamaño no cuadricula.

> Los tres activos —el catálogo medido, el sprite de los 38 cuadros y la hoja de estilos— están escritos y listos
> en **[`docs/logros/`](logros/)**, con su `README`. No hay que rehacerlos: F1 y F2 los recogen tal cual.

**El grado NO se pinta sobre la imagen ni sobre un marco: vive entero en el triángulo.** Lo único que cambia
entre un grado y otro es el numeral. La imagen no se toca y el tamaño tampoco.

Se llegó ahí descartando tres versiones, y las tres merecen quedar escritas porque son las que se vuelven a
proponer solas:

- **Teñir un marco con el grado** (cuatro escalones del acento). Se cae porque el acento azul está en toda la app
  y porque compite con el aura de rareza (§6.6), que es la señal que sí tiene que verse de lejos.
- **Engordar el marco con el grado.** Se cae porque cambia el tamaño de la imagen y del bulto: una rejilla de
  medallas de distinto tamaño no cuadricula.
- **Tener marco, siquiera neutro.** Se cae porque no aportaba nada una vez que el grado salió de él, y le quitaba
  sitio a lo único que de verdad importa, que es el cuadro.

Y sigue en pie la prohibición de fondo: **nada de los cuatro metales**. Bronce, plata, oro y platino ya son el
rango de perfil de `_tiers.scss`, y en la ficha social la tarjeta que lleva la muesca de rango es **la misma** que
va a llevar la vitrina de medallas.

**Consecuencia asumida, y va dicha:** el grado deja de leerse de un vistazo en una rejilla — hay que buscarlo en
el triángulo. Es deliberado: lo que se compara de lejos es el **peso** del logro (el aura), no cuántas vueltas
lleva su contador.

**El acabado es pictórico, y también está resuelto.** Las escenas se dibujan planas y las pinta un único filtro
compartido por las 38 (`#imp`): dos desplazamientos por turbulencia que rompen el contorno, un desenfoque que
funde los tonos y un relieve de **empaste** iluminado a contraluz con `feDiffuseLighting`, que es lo que hace que
parezca tener grosor. Encima, grano de lienzo y una luz cálida arriba / índigo abajo. Coste: cero por icono.

> **Lo que se probó y se quitó:** superponer trazos curvos dibujados a mano sobre cada cuadro. Eran los mismos en
> las 38 y no sabían nada de lo que tenían debajo, así que no leían como pincelada sino como garabato encima del
> dibujo. La textura tiene que salir del propio cuadro —el relieve reacciona a cada forma— y no de una capa
> postiza.

**El sprite va aparte y es perezoso.** `IconSprite` lo monta `App.tsx` en el arranque —48 símbolos, 26 kB de
paths— y el presupuesto es de 215 kB comprimidos (`BOOT_PAYLOAD_BUDGET_KB` en `scripts/ci-validate.js`). Meter
ahí **otros 38 símbolos** que solo se ven en dos rutas perezosas es exactamente el error que `ci-validate` está
puesto para cazar. Va un **`AchievementSprite` propio**, con los `id` bajo el prefijo `#ach-`, montado por la rejilla y por la
vitrina —nunca por `App.tsx`—. (El sprite existente usa el prefijo `#icon-`, así que no hay forma de que
colisionen.) Las dos pantallas viven en chunks distintos, así que el empaquetador lo sacará a un
chunk compartido: es lo correcto y no hay que forzarlo. Y como son rutas distintas, nunca hay dos sprites montados
a la vez y no hay colisión de `id` que temer.

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

**Las dos cifras.** ⚑ Hoy solo se pinta el **porcentaje**: el nivel de perfil se calcula pero no se enseña
(§10bis). Se pinta como texto, no como medalla: es una cifra, no un logro, y darle forma de medalla haría creer
que se puede conseguir. En `/perfil` van con su barra hacia el siguiente
nivel (con `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, que es una barra de progreso de verdad); en la ficha
ajena van sin barra, porque el progreso de otra persona hacia algo que no tiene no es asunto de nadie (§3).

**Tamaño constante, pase lo que pase.** La medalla mide **exactamente lo mismo** en los cinco estados —grado I a
IV, bloqueada y oculta—. ⚑ El grado no puede cambiar ni una medida y **vive entero en el triángulo**: este
párrafo decía «se lee en el color de la moldura, el filete interior, el hilo del canto y el numeral», que es la
versión anterior —la que tenía marco— y contradecía la tabla de tres párrafos más arriba, donde **Marco:
Ninguno**. Lo que se lee es el numeral, y nada más.

**El numeral, dentro del triángulo y bajito.** Pequeño, muy espaciado y a poco contraste: quien quiere el dato
exacto lo lee, y quien recorre la rejilla ve antes el aura, que es lo que de verdad se compara de un vistazo. Un
numeral grande convierte cada medalla en una etiqueta.

⚑ **Y el coste de pintado, que no estaba medido y es el único riesgo abierto de F2.** El acabado es un
`filter: url(#imp)` con `feTurbulence` × 2, `feGaussianBlur` y `feDiffuseLighting`, más dos capas con
`mix-blend-mode` (`overlay` y `soft-light`) — por medalla. En la vitrina de una ficha son cinco o seis y no hay
nada que discutir; en la rejilla de `/perfil/logros` son **38 a la vez**, y un filtro con turbulencia se
rasteriza por elemento y no se comparte entre instancias por mucho que el `<filter>` esté declarado una sola vez.
No se sabe si janquea porque no se ha medido en un móvil de gama baja. **Antes de cerrar F2: medir la rejilla
completa con el perfil de rendimiento.** Si molesta, el arreglo ya está inventado en esta casa y es el mismo que
el destello — atar el filtro a `data-effects` (§7.4), con el cuadro plano como fallback: los dibujos se leen
perfectamente sin empaste, y quien apaga los efectos ya está pidiendo justo eso. Lo que no se hace es quitar el
acabado para todos por un problema que quizá no exista.

**Bloqueado.** El logro que no se tiene es **la misma forma, desaturada** —no un hueco, no un candado que sea el
único indicio—, y esto solo pasa en `/perfil`: en la ficha ajena no hay bloqueados que pintar (§3). La
desaturación no puede ser la única señal (es color puro, y el punto ciego del párrafo de accesibilidad): el
estado va también en el texto de la tarjeta y en el nombre accesible. El **oculto** (§6.7) es un caso aparte:
misma forma, sin icono, con «?» y el texto «se revela al conseguirlo» — nunca una pista de cuál es.

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

En `profileWriteIsValid()`, añadir `"achievements"` al `hasOnly`, **encadenar la función nueva al `&&` de esa
misma función** (o a `profileFieldsAreSane()`, que es donde viven sus hermanas) y escribirla así:

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

El tope de 1.024 caracteres es el que protege el coste ajeno: es lo que se descarga el directorio entero. ⚑ Con la
gramática de §5.3 y los `id` reales del §6.9 —9,9 caracteres de media— caben **~54 logros**, no los ~70 que
suponía el documento cuando las entradas se estimaron en 14 bytes: una entrada completa (`completados.12.4999`)
son 20. Los 32 publicables de hoy ocupan **608 bytes en el peor caso** (todos conseguidos, niveles de dos
dígitos, tres destacados), así que el margen sigue siendo de más del 40 % — pero es margen para veintitantos
logros más, no para el doble del catálogo. Cuando el catálogo pase de ~45 entradas, toca revisar el tope o la
gramática, y la regla de recorte del §5.3 deja de ser teórica.

⚑ **Y lo que ese tope cuesta al que mira, dicho con el número delante:** el directorio baja hasta
`SOCIAL_DIRECTORY_LIMIT` (50) perfiles por apertura, así que el peor caso absoluto que las reglas permiten son
**+51 kB por hidratación**; el caso real de hoy, con 32 logros, son **~30 kB**. No cambia el número de lecturas
de Firestore (siguen siendo 50 documentos), solo los bytes, y la caché del directorio ya evita releerlo dentro
del TTL. Es asumible, y es exactamente por lo que el tope es duro y va en las reglas y no en el cliente.

### 9.3 Lectura defensiva

El espejo de otra persona **no pasa por Zod** (igual que el gist de un amigo: Zod solo corre al publicar lo
propio). El parser que lo lee es la única defensa y tiene que comportarse como el de `moveActivity`:

- tope de entradas procesadas y de longitud de cada `id` (`SOCIAL_ID_MAX` como referencia);
- `id` desconocido → se ignora, no es un error;
- nivel fuera del rango del catálogo → se recorta al máximo definido, que es `steps.length` para un logro
  cerrado y el `cap` de `open`/`annual` para los demás (§5.1: sin ese campo declarado, este recorte no se puede
  escribir);
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
2. **Subir `LEGAL_VERSION`** (⚑ vive en `core/constants/legal.ts`, no en `legalContent.ts`, que solo la importa;
   hoy vale `'2026-08-22'`), que hace que todo el mundo vuelva a pasar por la puerta del hub. Es lo que se hizo
   con las reseñas compartidas y por el mismo motivo: se publica algo que antes no se publicaba.
3. **El borrado de cuenta ya lo cubre**: el campo vive dentro de `profiles/{uid}`, que se borra entero
   (`allow delete: if isOwner(userId)`). No hay ninguna vía nueva de supresión que escribir.
4. **Sin logros que delaten hábitos.** Ninguna entrada del catálogo puede depender de la hora del día ni de días
   concretos («trasnochador», «finde completo»). La semana es la unidad más fina que se admite, que es la misma
   que ya usa `WeekActivity` y por el mismo razonamiento.
5. **El porcentaje y el nivel no añaden ni un dato al canal** (§6.10.3): son función de la lista que ya se publica,
   y quien puede verlos ya podía calcularlos. No hay nada nuevo que declarar por ellos — pero sí conviene que el
   texto legal hable de «logros conseguidos **y las cifras que se derivan de ellos**», para que nadie lea la
   política, vea un nivel en una ficha y piense que se publicó algo que no se contó.
6. ⚑ **Y hay que decir que los logros se calculan sobre la biblioteca entera** (§5.3bis). Los ajustes de
   visibilidad **no** filtran el espejo, y esa decisión no se puede dejar sin escribir: el texto vigente promete
   «si eliges ocultarlas, no las ve nadie» y «esconder una lista esconde también su actividad», las dos siguen
   siendo verdad —no sale ni una hora ni la entrada de un juego a una lista oculta— pero quien lea «Un verano
   entero III» en una ficha tiene que poder situarlo. Una frase basta: **los logros se calculan sobre tu
   biblioteca entera y publican solo su nivel, sin ningún dato de los juegos que los producen.** Es requisito de
   entrada de F3, como el resto de este apartado.
7. ⚑ **Y lo que el interruptor NO puede prometer**, dicho aquí y no descubierto luego: apagarlo borra el campo de
   `profiles/{uid}` (§8.3), pero mientras esté encendido **el espejo llega en el JSON a cualquier usuario
   autenticado**, sea amistad o no, porque el documento entero es legible con `social.enabled == true` y el hub
   se lo descarga para el directorio. Que la vitrina solo se **pinte** a una amistad (§13.9) es producto, no
   privacidad. Es exactamente lo mismo que ya pasa con el nick, la foto y el rango, y por eso no cambia nada del
   diseño — pero el que lo lea tiene que saber cuál de las dos cosas le está protegiendo.

---

## 10bis. ⚑ Lo construido: F1 y F2 en modo maqueta

> **Estado al 6-sep-2026.** F1 y F2 están escritas y funcionando detrás de `ENABLE_ACHIEVEMENTS`, con la
> publicación (`ENABLE_ACHIEVEMENTS_PUBLISH`) **apagada**: no se escribe nada en `profiles/{uid}`, no hay reglas
> nuevas y el texto legal no se ha tocado. Los espejos de otras personas los fabrica `dev/achievementsSeed`, que
> solo existe en desarrollo. Esta sección dice **en qué se apartó la implementación del diseño**, porque probar
> las pantallas con datos reales cambió cinco cosas y un plan que no lo recoge deja de servir de guía.

**Dónde vive cada cosa**

| Pieza | Fichero |
|---|---|
| Catálogo, evaluador, resumen, empaquetado, feed | `core/achievements/{types,catalog,metrics,evaluate,summary,pack,feed,flags,deviceSignals}.ts` |
| Estado y lista de pantalla | `viewmodel/useAchievements.ts` · `view/hooks/useAchievementNotice.ts` |
| Medalla, tira, fila, cifra, pantalla, tarjeta | `view/components/stats/Achievement*.tsx` |
| Vitrina y globales de un perfil | `view/components/socialhub/ProfileAchievements.tsx` |
| Sprite y hoja | `view/components/AchievementSprite.tsx` · `styles/achievements.scss` |

**Lo que cambió respecto a este documento, y por qué**

1. **El listado NO se agrupa por familia.** Las categorías partían la pantalla en cinco tramos y dentro de cada
   uno volvía a empezar el orden, así que para saber qué llevas había que recorrerla entera. Es una sola lista:
   **primero lo conseguido y luego lo que falta**, como en Steam. Dentro de la primera mitad manda la fecha; en la
   segunda, **lo cerca que está de caer**, que es la información útil de ese tramo. La familia sigue en el
   catálogo haciendo su trabajo —el filtro del feed y el denominador—, solo que ya no titula secciones.

2. **El nivel de perfil no se enseña.** Los puntos por rareza y la curva por tramos se calculan y se prueban
   igual (§6.10.2), pero no salen a pantalla mientras no esté decidido cómo se presentan. Hay un test que fija
   justo eso: **se calcula y no se pinta**. Lo que sí se ve es la fracción con su porcentaje.

3. **La línea «empieza a contar desde que lo instalaste» se retiró del catálogo entero.** El §6.8 la pedía en la
   tarjeta de los seis logros dormidos; en pantalla resultó ser un párrafo de disculpa repetido seis veces. El
   campo `note` ya no existe, así que no puede volver por descuido, y hay un test que lo comprueba.

4. **La rareza NO se pinta como color de texto.** Los cuatro colores de la escala de loot están pensados para el
   **aura** —un halo alrededor de un cuadro, donde la 1.4.11 pide 3:1— y como texto de 11 px se quedan cortos
   frente al 4,5:1 de la 1.4.3: el morado del raro daba **3,07:1**. La auditoría de axe lo cazó en las doce
   combinaciones de paleta y tema. El chip lleva ahora **punto de color y texto atenuado**, que es exactamente lo
   que el activo de diseño ya proponía y que la implementación se había saltado.

5. **La medalla mide 48 px en el listado**, no 72. A 72 cada fila era casi tan alta como ancho su cuadro y la
   lista se leía como una pila de fichas. Y la decide el componente, no la hoja: llegó a haber dos sitios donde
   cambiarla —un `!important` para la vista global y una prop para el listado— y ya habían empezado a separarse.

**Lo que se añadió y no estaba escrito**

- **§6.6bis, el porcentaje medido.** El documento lo descartaba por no tener con qué medirlo; sí lo hay, cuesta
  cero y a la escala de hoy es exacto. Está documentado en su sección.
- **Los logros globales** (`/social/profiles/:id/globales`), que son donde ese porcentaje se lee, con recuadro en
  lo que ese perfil tiene y relleno de fondo por porcentaje.
- **La baldosa final de la tira**, del tamaño de una medalla, que cuenta lo que no cabe y lleva al listado. Antes
  el acceso era un enlace pequeño debajo, y en la ficha de una amistad no existía ninguno.

**Lo que el plan pide y NO está construido** (por orden de lo que se echará en falta antes):

| Falta | Dónde estaba previsto |
|---|---|
| La **tira de novedades** y el punto en la pestaña | §7.3 · F2 |
| El **destello** del desbloqueo tras `data-effects` | §8.5 · F2 |
| El **foco rotatorio** del mes | §6.3 · F2 |
| Elegir **destacados** (el empaquetado y el parser ya los entienden) | §8.2 · F4 |
| Todo F3 en bloque: escritura, reglas, opt-out, `/admin`, textos legales | §9, §10 |
| El **coste de pintado** de 38 filtros: medido en escritorio, **no en móvil de gama baja** | §8.5 |

---

## 11. Entrega por fases

Cada fase es entregable por separado y deja la app en un estado coherente.

**F0 · Cerrar el catálogo antes de escribir código** — ⚑ media hora y evita lo único irreversible de todo el
plan. Fijar los 32 `id` definitivos (el choque de `segunda-vuelta` del §6.2 ya está resuelto en este documento) y
recorrer `docs/logros/catalogo.json` comprobando que cada entrada trae, si le toca, `open` o `annual` con su
`cap` (§5.1), y que las cuatro métricas del §7.5 llevan su guarda escrita en la definición. Un `id` no se renombra jamás (§6.4): esto se hace ahora o no se hace.

**F1 · Núcleo puro** — `core/achievements/{types,catalog,evaluate}.ts` con la familia *espejo* (incluida la curva
de pendientes del §6.2.1), la marca de agua, y ya con `rarity`, `hidden`, ⚑ `open` y `annual` en el
catálogo (§6.6, §6.7, §5.1): son campos declarativos, no cuestan nada aquí, y añadirlos después
obligaría a revisar entrada por entrada. ⚑ Aquí entra también exponer `profiles.createdAt` en la lectura del
perfil propio, que hoy no se mapea y sin lo cual `veterano` no se puede calcular (§6.2). **Los umbrales y
las rarezas entran ya fijados** desde §6.9 — están medidos, no supuestos. ⚑ Y las **cinco guardas del §7.5** escritas en la definición de su métrica, no en un comentario. Tests que salen
directos de esa medición: que **ninguna métrica compara contra `listedAt`** (el falso positivo de «Speedrun»: 42 aciertos, los 42
falsos) y que `memoria-larga`/`buena-cosecha` **miden sobre `years`** y no sobre `enteredAt`, que da 1 año en vez
de 22. Sin UI y sin
publicación. Tests unitarios: cada métrica con su fixture, la fecha derivada de cada umbral, biblioteca vacía,
biblioteca sin sellos (legacy), **la biblioteca que encoge** (el nivel no baja, §5.5), y el test de coincidencia
con `computeStats` (§7.2). Entra aquí también el cálculo de **porcentaje y nivel** (§6.10), que es función pura de
`AchievementState[]` + catálogo: se prueba con la tabla de tramos en la mano, incluidos el nivel 1 con cero puntos
y el salto de tramo exacto (180 → nivel 10, 181 → nivel 11).

**F2 · Tu panel** — ⚑ **el apartado del panel bajo «Lo mejor de tu biblioteca»** (§8.1) y ⚑ **el listado
`/logros` estilo Steam** —imagen, nombre, descripción y día, en UNA sola lista con lo conseguido delante
(§8.1b, §10bis)—, novedades con `achievementsSeen`, **el aviso del instante del §7.4**, hoja propia
`achievements.scss`, **`AchievementSprite` perezoso** y forma base de la medalla —cuadrado de radio **4 %**, como
dicen la tabla del §8.5 y el activo; el «22 %» que ponía aquí era el `--radius-lg` del cromo de la app, no el de
la medalla— con sus tres estados —conseguido, bloqueado, oculto— (§8.5). Aquí ya hay producto completo para el dueño **sin publicar un
solo byte**. Tests de componente sobre la rejilla y la sub-ruta (patrón de `StatsHub.test.tsx`), test de que el aviso
salta al subir un nivel en una escritura y **no** salta en la primera evaluación del dispositivo, y paso de axe con
las animaciones quietas.

**F3 · El espejo** — empaquetado, escritura a rebufo tras
`ENABLE_ACHIEVEMENTS_PUBLISH`, reglas, opt-out en `publicConfig` ⚑ **con sus cuatro piezas (§8.3)**, señal y purga
en `/admin`, textos legales y `LEGAL_VERSION`. Tests de reglas (`vitest.rules.config.js`): el dueño escribe lo
suyo; otro usuario no; un blob de más de 1 kB se deniega; una clave inventada dentro de `achievements` se
deniega; un perfil sin el campo sigue pudiendo escribirse; ⚑ `publicConfig` acepta `showAchievements: false` y
rechaza `showAchievements: "no"`.

> ⚑ **F3 tiene una dependencia de despliegue que conviene no descubrir el día del corte:** `audit-privacy.js`
> marca `hours`, `steamDeck`, `review` y `score` como campos prohibidos en cualquier fichero que escriba a un
> canal público. El módulo que empaqueta y publica el espejo **lee** esos campos (es su trabajo) pero no puede
> **construir** un objeto con esas claves; si por lo que sea hiciera falta, se marca con `// audit-allow: <razón>`
> como ya hace el resto del repositorio. `npm run audit:privacy` es puerta de CI (categoría A = 0).

**F4 · La vitrina ajena** — parser defensivo, **nivel y porcentaje derivados del espejo** (§6.10.3), ⚑ **la tira
solo-imagen bajo el nombre** con el rótulo en `hover` y en `focus-visible` (§8.2), ⚑ **el listado de esa persona en
`/social/profiles/:profileId/logros`** reutilizando la pantalla de F2, ⚑ **el porcentaje medido sobre el
directorio, con su denominador a la vista y su suelo de 20 perfiles** (§6.6bis), destacados, **orden automático
por rareza cuando no los hay** (§8.2), silencio si no hay nada. Test de que las cifras NO aparecen en la tarjeta del directorio ni en la bandeja (§6.10.4): es una regla que
se rompe sola en cuanto alguien reutiliza el componente de la ficha. Tests de componente con espejos corruptos,
vacíos, con ids desconocidos y con quince destacados marcados. E2E de la ficha con la vitrina puesta.

**F5 · Novedades en el feed** — ⚑ **una entrada por persona y día, con todos sus logros dentro** (§8.4), y
comparación con ⚑ `achievementsPeerSeen` (§5.4), **no con la caché del directorio**: el porqué está en el §8.4 y es lo que impide que un mithril no vea jamás un logro ajeno. Incluye
subir `SOCIAL_DIRECTORY_CACHE_VERSION` a 5 al añadir `achievements` a las entradas cacheadas. Va **después** de la
vitrina a propósito: sin espejos reales circulando no hay nada que comparar, y el corte de 30 días solo se puede
afinar viendo datos de verdad. Test: **con la caché del directorio caducada, la línea base sigue ahí y el aviso
sale igual** — es justo el caso que el diseño anterior no pasaba.

**F6 · Familias «datos», «social» y «primeros pasos» + foco rotatorio** — las que empujan conducta, al final y a
sabiendas: conviene ver antes cómo se comporta el espejo con datos reales.

**F7 · Temas desbloqueables** — la recompensa (§6.5): la puerta en el selector (tema apagado que dice qué lo
abre) y **«Casa de Hades»** de estreno, abierto por «New Game +». Última porque depende de que la marca de agua
lleve tiempo demostrando que no retira nada, y porque el tema hay que dibujarlo: `PaletteId` y entrada en
`PALETTES`, los ~26 tokens en `_base.scss` (oscuro y claro), el `--bg` en `theme-init.js` y el skin opcional en
`_themes.scss` — los cinco pasos que ya están escritos en la cabecera de `palettes.ts`. Test de que el desbloqueo
**no se retira** aunque el logro caiga por debajo del umbral (§5.5), que es el único fallo inaceptable aquí.

---

## 12. Riesgos y trampas conocidas

Las filas en **⚑** salieron de la revisión del 6-sep-2026 y no estaban en el documento.

| Riesgo | Mitigación |
|---|---|
| ⚑ **Cuatro métricas dan falsos positivos: la nota ausente vale 0** | Guarda explícita en la definición y un test por métrica (§7.5). Es la misma familia del falso positivo de «Speedrun»: la ausencia de dato se lee como dato |
| ⚑ **«Exterminatus» salta el primer día, con la biblioteca vacía** | Exige haber tenido pendientes: al menos un juego con `enteredAt.p` (§7.5). Sin la guarda, un usuario nuevo estrena 60 puntos por no tener nada |
| Alguien lee «Un verano entero» de quien esconde sus horas y cree que es una fuga | No lo es —sale una magnitud, no un dato (§5.3bis)— pero **la política de privacidad tiene que decirlo** (§10.6): es requisito de entrada de F3 |
| ⚑ **El opt-out no sincroniza nunca y nadie se entera** | `showAchievements` en el `hasOnly` de `publicConfigWriteIsValid()`, más el tipo, la clave y el registro de la preferencia (§8.3). Ya ocurrió aquí con `effects`, y su comentario en las reglas es la prueba |
| ⚑ **El dueño se ve un nivel y su amistad le ve otro** | Los *primeros pasos* no puntúan: lo que no se publica, no cuenta (§6.10.2) |
| ⚑ **Las metas abiertas no existen en ninguna parte y el parser no puede recortar** | `open: { every, cap }` y `annual: { since, cap }` declarados en el catálogo (§5.1); el recorte del §9.3 usa ese `cap` |
| ⚑ **F5 calla justo para quien más mira (mithril, TTL de 60 s)** | Línea base propia y sin TTL en `LocalMeta`, no la caché del directorio (§8.4, §5.4) |
| ⚑ **Dos logros distintos comparten el `id` `segunda-vuelta`** | Cerrado en F0 antes de escribir código: un `id` no se renombra jamás (§6.2, §6.4) |
| ⚑ **38 filtros con turbulencia en una rejilla janquean el móvil** | Medir la rejilla completa antes de cerrar F2 y, si molesta, atar el filtro a `data-effects` con el cuadro plano de fallback (§8.5) |
| Dos contadores de lo mismo divergen (panel vs. logro) | Test de coincidencia con `computeStats` (§7.2) |
| El evaluador arrastra el chunk del panel al arranque | Prohibido importar `core/stats`; lo vigila `ci-validate` |
| El estado de la pantalla va un render por detrás al publicar | Leer los listados con `loadLocalState()` en el momento de publicar, como hace `withMoveActivity`; **nunca** la foto del render (es el fallo de datos que ya costó una regresión de sincronización) |
| El directorio engorda para todos | Tope duro de 1 kB en reglas + gramática compacta; si algún día molesta, la salida es una subcolección leída solo al abrir una ficha |
| Los enlaces compartidos no se pueden contar | Resuelto quitando el logro (§6.2): KV solo guarda los **activos** y el acumulado local no converge entre dispositivos. Si alguien lo reintroduce, este es el motivo por el que no está |
| Alguien se fabrica logros | Asumido y declarado (§4). Se acota a que sea un adorno (**ninguna funcionalidad depende de un logro**), a los topes del parser y a la señal de `/admin` (§9.4) |
| La marca de agua vuelve permanente lo falso | Consecuencia aceptada del §5.5: recorte al máximo del catálogo y purga del administrador. No hay una tercera defensa |
| Un umbral mal puesto retira medallas ya dadas | Los umbrales no se endurecen nunca (§6.4) |
| Inflación de logros con los años | Metas abiertas, repetibles anuales y temas de estreno (§6.3, §6.5), no catálogo nuevo cada temporada |
| **La medalla sale sin estilos en una de las dos pantallas** | Hoja propia `achievements.scss` importada desde el componente, nunca colgada de `stats.scss` ni de `social.scss` (§8.5). Fallo MUDO: solo se ve abriendo la otra pantalla |
| El ajuste visual funciona en el tema clásico y en ninguno más | Los skins pesan (0,3,0): medir en las seis paletas (§8.5) |
| El feed se llena de anuncios de logros | ⚑ Agrupado **por día** (una entrada por persona, con todos sus logros dentro), corte de 30 días y silencio en la primera hidratación (§8.4). El agrupado hace el trabajo que antes se le pedía al filtro de rareza |
| ⚑ **El porcentaje medido se lee como una cifra global y no lo es** | Se dice siempre con su denominador («14 % · 6 de 43») y no se pinta por debajo de 20 perfiles con espejo (§6.6bis) |
| ⚑ **El porcentaje medido acaba moviendo los puntos y el nivel baila** | Prohibido: los puntos, el aura y el recorte los gobierna la rareza **declarada** (§6.6). Lo medido se enseña y no decide (§6.6bis) |
| ⚑ **La tira bajo el nombre solo dice el nombre al pasar por encima, y con teclado no** | Nombre accesible completo en cada medalla y rótulo en `:hover` **y** `:focus-visible`; en táctil, el toque lleva al listado (§8.2) |
| Quien vuelve tras un mes recibe una avalancha | Mismo corte, en las dos puntas: sus novedades (§7.3) y las de sus amistades (§8.4) |
| **El logro salta callado y se pierde el momento** | Reevaluar tras cada escritura y avisar en el `StatusBanner` que ya existe (§7.4). Es el fallo que no da error y que vacía el sistema por dentro |
| Con metas abiertas no hay 100 % y el completista se va | La fracción cuenta logros, no niveles; la profundidad es otra cifra aparte (§6.3.1) |
| Todas las vitrinas se parecen | Orden automático por rareza cuando no hay destacados (§8.2, §6.6) |
| El catálogo se lee como una lista de tareas | **Nueve** ocultos sobre 32 publicables, y no todos son espejo: la regla es que ninguno pida una campaña por toda la biblioteca (§6.7) |
| La rareza se convierte en comparación entre usuarios | Se **declara** en el catálogo, nunca se mide sobre el directorio, aunque salga gratis (§6.6) |
| Un nombre elegido con prisa queda congelado | El `id` es el slug de lo medido y el nombre es texto retocable (§6.4) |
| Se desborda el 1 kB y se trunca por donde caiga | Prioridad de recorte: destacados, luego rareza y nivel (§5.3) |
| Alguien propone que los logros caduquen «para que valgan» | Ya contestado con el porqué del modelo Pepper (§5.5, §0.1) |
| **El nivel se pinta en el directorio y nace un ranking sin querer** | Las cifras solo en la ficha individual (§6.10.4), con test que lo fija. Es la regla que se rompe sola al reutilizar el componente |
| Las medallas usan los cuatro metales y se confunden con el rango | El nivel va en intensidad del acento + numeral; los metales son de `_tiers.scss` y ahí se quedan (§8.5). En la ficha social las dos escalas conviven a dos centímetros |
| Los 38 iconos entran en el sprite del arranque | `AchievementSprite` propio y perezoso, prefijo `#ach-`, nunca en `App.tsx` (§8.5). Lo corta `ci-validate` a 215 kB. El sprite ya está escrito (`docs/logros/achievement-sprite.svg`, 38 símbolos + el filtro `#imp`, 26 kB sin comprimir) |
| Un cliente viejo enseña un nivel ajeno más bajo del real | Aceptado: los `id` desconocidos se ignoran, así que el error va siempre a la baja y se corrige al actualizar (§6.10.3). No se arregla publicando el número |
| El nivel acaba desbloqueando algo | Prohibido en §6.10.4: los temas los abre un logro concreto, nunca una cifra agregada |
| Un guiño que no se entiende deja el logro ilegible | La referencia va solo en el nombre; la condición, en llano debajo (§6.11) |
| **Un logro compara contra `listedAt` y acierta en falso** | Prohibido (§6.8). En un juego catalogado hacia atrás esa fecha es la de catalogarlo. Medido: la definición ingenua de «Speedrun» daba **42 aciertos y los 42 falsos** |
| Seis logros salen a cero y parecen rotos | Asumido y **sin explicarlo en la tarjeta**: la línea se probó y se quitó (§10bis). No hay sellos de listas anteriores en ninguna biblioteca preexistente (0 de 302), y quien llega nuevo no echa de menos lo que nunca vio |
| ⚑ **La rareza se pinta como color de texto y falla el contraste** | Va en el punto del chip, no en el texto: los colores del aura son para la 1.4.11 (3:1), no para la 1.4.3 (4,5:1). Lo cazó la auditoría de axe, que ahora recorre también `/logros` en las doce combinaciones (§10bis) |
| Lo anual se mide con `enteredAt` y da 1 año en vez de 22 | `memoria-larga` y `buena-cosecha` miden sobre `years`, que está poblado al 100 % (§6.8) |
| Un excepcional con escalera larga descuadra el nivel | Máximo dos niveles: cuatro serían 240 pts, más que ningún otro logro (§6.9) |

---

## 13. Dudas abiertas

1. ~~**`LEGAL_VERSION` y el valor por defecto del interruptor.**~~ **Resuelta: encendido por defecto + subida de
   `LEGAL_VERSION`.** Es lo que se hizo con las reseñas compartidas y por el mismo motivo: se publica algo que
   antes no se publicaba, así que todo el mundo vuelve a pasar por la puerta del hub y lo aprueba (o no pasa, y
   entonces no publica nada — el hub ya funciona así). La alternativa conservadora, empezar apagado, deja la
   vitrina ajena vacía para casi todos, y una vitrina que nunca tiene nada deja de mirarse: el opt-out del §8.3
   es la salida para quien no lo quiera, no el estado de partida. **Lo que esto obliga:** el §10 deja de ser una
   tarea de última hora y se convierte en un requisito de entrada de F3 — sin el texto legal y la subida de
   versión, F3 no sale.
2. ~~**El logro de enlaces compartidos.**~~ **Resuelta: fuera del catálogo.** El índice de KV solo guarda los
   enlaces activos, así que el histórico solo cabe en `LocalMeta` y no converge entre dispositivos — el mismo
   defecto que tumbó `backlogHistory` como fuente en el §6.2.1. La familia social se queda en «Modo cooperativo»
   y «Charla de taberna». Añadir logros es aditivo: si algún día hay histórico de verdad, se añade entonces.
3. ~~**Umbrales concretos y reparto de rarezas.**~~ **Resuelta: medidos** sobre una biblioteca real de 302
   juegos. La tabla completa está en §6.9 y el reparto final es 5 comunes / 10 infrecuentes / 11 raros / 6
   excepcionales. El dimensionado del §6.10.2 aguanta sin tocar la tabla de tramos. Lo que la medición cambió de
   verdad no fueron los umbrales, fue el §6.8 entero.
4. ~~**Nombres del catálogo.**~~ **Resuelta en esta pasada.** El `id` es el slug de lo que se mide y el nombre es
   texto retocable (§6.4), así que ya no es una decisión irreversible. Y el tono queda fijado: **guiño en el
   nombre, contrato en la descripción**, que es lo que hacen los referentes del §0.2. Lo único que sigue abierto,
   y es menor, es cuánto se permite que el nombre guiñe a un juego concreto: un catálogo lleno de referencias
   deja fuera a quien no las pilla. Propuesta: referencias solo en los logros que abren tema (§6.5), donde el
   guiño es al propio tema y se entiende igual.
5. ~~**Qué tema estrena la recompensa y con qué logro se abre.**~~ **Resuelta: «Casa de Hades» (violeta y
   fuego), abierto por «New Game +»** (§6.5). Llena el único hueco de color que le queda a la app y empareja el
   juego de volver a empezar con el logro de volver a empezar. Lo que sigue abierto es solo **dibujarlo**: los
   valores exactos de `accent`/`accent2`, los ~26 tokens de `_base.scss` en sus dos variantes y el skin opcional
   de `_themes.scss`, con la plantilla que ya está en la cabecera de ese fichero.
6. ~~**¿Se anuncian en el feed los logros de la familia «datos»?**~~ **Resuelta: solo espejo y social**, y
   además con el filtro de rareza del §8.4 por encima. «Ha anotado las horas de 100 juegos» dicho en público
   empuja justo el relleno por el premio que el §6.1 quiere evitar, y con la rareza como segundo tamiz el feed
   solo cuenta lo que de verdad es una noticia.

7. ~~**Cuántos ocultos y cuáles.**~~ **Resuelta: nueve**, listados con sus umbrales en §6.9. Cuatro son nuevos
   —«Lo terminé por orgullo», «No eres tú, soy yo», «Tesis doctoral», «Una vida entera»— y entran porque **tienen
   dato hoy**: los cinco originales dependían en su mayoría de sellos que aún no existen, y cinco casillas
   dormidas no dan ninguna sorpresa. La regla de «solo familia espejo» se afinó al aplicarla (§6.7).

8. **Los «estados».** **Decidido: fuera de las siete fases**, anotado aquí para revisarlo **después de F6**,
   cuando se vea si el catálogo ya cubre esa función. Chollómetro tiene insignias que reflejan *cómo estás ahora*
   y que se pierden («difíciles de mantener»), y aquí hay un hueco natural: «biblioteca al día», «sin fichas a
   medias». Chocan de frente con la marca de agua (§5.5), así que **si algún día entran, es con las tres
   condiciones que los hacen inofensivos**: no se publican nunca, viven solo en `/perfil`, y no cuentan en la
   fracción (§6.3.1) — es decir, no son logros, son un termómetro con forma de medalla.

9. ~~**¿Se enseña el nivel a quien todavía no es amistad?**~~ **Resuelta: no, y la regla ya existía.** La ficha
   de un no-amigo **no** baja su gist ni pinta sus listados, y el comentario que lo hace lo dice con estas
   palabras: *«para no-amigos no se lee nada […] coherente con "perfil no-amigo = solo nombre y foto"»*
   (`useSocialViewModel.ts`, el efecto que llama a `loadForeignProfileGames`). La vitrina, el nivel y el
   porcentaje van detrás de la misma puerta —`relationshipWith(uid) === 'friends'`—, sin inventar una condición
   nueva.

   **Y la letra pequeña, porque aquí no aplica el reflejo del §8.3.** El campo `achievements` vive en
   `profiles/{uid}`, que es legible por cualquier autenticado y que el hub ya se descarga entero para el
   directorio: al no-amigo **le llega igualmente en el JSON**, aunque no se le pinte. Esa puerta es una decisión
   de producto, no una garantía de privacidad, y la garantía sigue siendo el opt-out, que **borra el campo**
   (§8.3). Se dice aquí para que nadie la venda como lo que no es.

10. **El resumen del año.** **Decidido: fuera de las siete fases**, anotado para no perderlo. Los referentes
   reparten trofeos anuales (los Pepper Awards, con umbral publicado) y a este catálogo ya le entran los
   repetibles por año natural (§6.3), así que un «tu año en logros» al empezar enero —solo para el dueño y
   derivado como todo lo demás— sería contenido casi gratis. Pero es una pantalla más y una fecha más que
   mantener, y el plan ya tiene siete fases: se mira cuando las siete estén entregadas.
