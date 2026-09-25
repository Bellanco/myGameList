# Plan: unificar «El reto del jugador» dentro de myGameList

> Objetivo: que la porra de premios —hoy una aplicación aparte (`../GA`, `tga-ballot`, con su propio proyecto de
> Firebase, su propio panel y su propio tema)— **deje de existir como aplicación** y quede como una sección más de
> esta, en `/premios`, con su identidad, sus rangos, sus medallas, su panel y su sistema visual.
>
> No es un puerto: es una absorción. **Esta aplicación es la principal y la porra se amolda a ella**; lo que GA
> traiga por duplicado se tira (§1.5) y lo que choque con una convención de la casa, cede (§Principio rector). Tres
> piezas se diseñan aquí por primera vez: la cuenta ligera, el palmarés y la sección estacional.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al abordar cada paso, verifica el estado
> real del código (las líneas citadas pueden haberse movido), confirma en la consola lo marcado como
> *(por confirmar)* y actualiza este `.md`. Trátalo como código: se revisa con la implementación.

> **Estado:** escrito el 20-09-2026 con las decisiones de esa fecha (§Decisiones).
> **F0 COMPLETA** (rama `feature/unificar-premios`, 20-09-2026): el criterio de administrador es el custom claim,
> el claim está concedido en producción y las reglas nuevas están desplegadas en `mylists-f7313`, en ese orden
> (§3.1). El resto de fases, sin empezar.

---

## Principio rector — una sola aplicación

**Esta aplicación es la principal, y la porra se amolda a ella. No al revés, y nunca a medias.**

El resultado no puede ser «myGameList, y además dentro va otra cosa». Tiene que ser una sección más de esta app,
indistinguible del resto para quien la usa: mismo tema, misma letra, mismo cromo, misma sesión, mismo panel, mismos
avisos, misma voz. Si alguien entra en `/premios` y nota que ha cambiado de aplicación, la integración ha fallado,
aunque el código compile y los tests pasen.

De ahí salen cinco reglas que mandan sobre todo lo demás de este documento:

1. **Nada se copia tal cual.** Cada fichero de GA pasa por un filtro antes de entrar: *¿esto ya existe aquí?* Si la
   respuesta es sí, el de GA **se tira** y se usa el de casa — aunque el de GA sea más bonito o esté más probado.
   Lo que entra es la lógica que no existe: reglas del voto, recuento, calendario de la edición, premios.
2. **Cero infraestructura paralela.** Una sesión, un tema, un idioma, un sistema de avisos, un panel de
   administración, un error boundary, un juego de primitivos, un fichero de reglas, un proyecto de Firebase, un
   despliegue. Dos de cualquiera de esas cosas es la definición de lo que no queremos.
3. **El vocabulario es el de esta casa.** Rutas en español, textos en su módulo de labels, iconos del catálogo,
   colores por token, medallas con su receta. Un «award» suelto entre «logros» canta, y un `.jsx` con clases de
   Tailwind entre `.tsx` con SCSS canta más.
4. **La porra conoce la biblioteca.** Una sección integrada de verdad no solo comparte estilos: usa los datos de la
   app. Los nominados son juegos, y esta app sabe qué juegos tienes, cuáles terminaste y qué nota les pusiste
   (§6.5). Si la porra no habla con la biblioteca, seguirán siendo dos aplicaciones aunque compartan menú.
5. **Cuando haya duda, manda lo de casa.** Si una decisión de GA choca con una convención de esta app —la barra de
   navegación, el presupuesto de arranque, la política de fotos, el tono de los textos— cede GA. Las excepciones
   se escriben aquí, con su motivo, y son pocas: hoy solo una (la letra impresa de la lámina del trofeo, §6.4).

**Cómo se comprueba que se ha cumplido:** la lista de §13. No es retórica; son ocho comprobaciones concretas, y la
unificación no está terminada mientras alguna falle.

---

## Decisiones tomadas

| # | Decisión | Valor |
|---|---|---|
| 0 | **Quién manda** | **Esta app.** GA se integra hasta desaparecer como aplicación; nada de dos sistemas conviviendo (§Principio rector, §13) |
| 1 | Proyecto Firebase | **Uno solo: `mylists-f7313`**. `game-awards-d7881` se retira |
| 2 | Datos que se migran | **Solo `categories`**. El resto se crea vacío: no hay ninguna edición publicada todavía |
| 3 | Administrador | **Custom claim `admin: true`** en los dos lados. GL abandona el email escrito en las reglas |
| 4 | Idioma | Español ahora, **datos bilingües conservados**. La i18n de la app va en su propio plan posterior |
| 5 | Entrada en la app | Ruta `/premios`, **sección estacional** con interruptor del administrador |
| 6 | Identidad al votar | **Cuenta ligera sin GitHub** (`profiles/{uid}` sin canal social) |
| 7 | Resultados | **Públicos con enlace, sin indexar** (como `/r/{token}`) |
| 8 | Avatares en la clasificación | Sí, **con las reglas de reciprocidad del hub social** |
| 9 | Qué desbloquea el rango | La lámina del trofeo **y las oportunidades de envío**: 5/10/15/20 por rango, y **1 sin cuenta social**. El voto sigue valiendo lo mismo para todos (§5.1) |
| 10 | Trofeo | **Palmarés aparte** (`profiles/{uid}.palmares`), escrito solo por el admin |
| 11 | Quién ve el palmarés | Todo el que pueda ver ese perfil, igual que las medallas |
| 12 | Capa visual | **Reescritura a SCSS** con los 8 temas y los tokens de la casa |
| 13 | Pruebas | Se porta la lógica (utils, servicios, reglas); la interfaz se rehace |
| 14 | Calendario | Sin fecha de corte. La primera edición se abre cuando esté cerrado y probado |
| 15 | Retirada de GA | Redirección permanente + repositorio archivado |
| 16 | Forma de trabajo | Plan primero (este documento), luego implementación **fase a fase**, parando al final de cada una |

**Lo que NO se hace:** no se migran votos ni histórico (no existen); no se toca el catálogo de logros ni su mapa de
bits; no hay voto ponderado por rango; no se levanta el `noindex` del dominio; no se abre la lectura de `profiles`
ajenos para pintar avatares (se denormaliza, ver §4.1).

---

## 0. Qué es GA hoy, medido

Inventario del 20-09-2026 (`find src -type f -name '*.js*' ! -name '*.test.*' | xargs wc -l`): **10.259 líneas**
productivas, más **4.707** de pruebas repartidas en 33 ficheros.

| Área | Líneas | Qué hay |
|---|---|---|
| `components/` | 4.874 | 17 pantallas y diálogos + 9 sub-paneles de admin + 10 primitivos (`ui/`, `form/`, `layouts/`) |
| `utils/` | 1.501 | 15 módulos puros: scoring, calendario, rejilla, premios, pseudónimo, localización |
| `hooks/` | 1.261 | 13 hooks: flujo de voto, sesión, config, temporada, resultados |
| `services/` | 1.226 | 7 servicios; toda escritura a Firestore pasa por aquí |
| `data/` | 703 | i18n ES + EN (335 líneas cada uno) + índice |
| `styles/` + `index.css` | ~465 | tokens, semántica y movimiento, sobre Tailwind 4 |
| `App.jsx` + `main.jsx` + `firebase.js` | 630 | orquestador, entrada y configuración |

Diferencias estructurales con esta app, que son las que fijan el trabajo:

| | GA | GL |
|---|---|---|
| Lenguaje | JavaScript con JSDoc | TypeScript estricto (dos proyectos en `typecheck`) |
| Estilos | Tailwind 4 + 3 CSS de tokens | SCSS, 4 capas, 8 temas × 2 modos, axe en 12 combinaciones |
| Rutas | Sin router; paso en estado + `history.pushState` | `react-router` con tabla única (`core/constants/routes.ts`) |
| Idioma | Bilingüe ES/EN | Solo español, sin mecanismo de i18n |
| Admin | Custom claim `admin: true` | Email en `firestore.rules` (`isAdmin()`, línea 13) |
| Backend | Firestore + Auth | Firestore + Auth + Gists de GitHub + KV de Cloudflare |

---

## 1. Dónde va cada cosa

La regla: **lo puro a `core/`, las escrituras a `model/repository/`, el estado con ciclo de vida a `viewmodel/`, la
pintura a `view/`.** Es la misma división que GA ya respeta (`utils` / `services` / `hooks` / `components`), así que
el mapeo es casi mecánico; lo que cambia es el nombre de la carpeta y el idioma del fichero.

**Antes de mover un fichero, el filtro del principio rector:** *¿esto ya existe en esta app?* Las tablas de abajo
llevan una fila «—» en el destino para todo lo que **no entra**, y §1.5 reúne lo que desaparece por duplicado. De
las 10.259 líneas de GA, **~1.400 no llegan nunca**: son la infraestructura que esta app ya tiene resuelta.

### 1.1 Cálculo puro → `src/core/premios/`

| Origen (GA) | Destino | Nota |
|---|---|---|
| `utils/scoring.js` (115) | `core/premios/scoring.ts` | Puntos y `assignDenseRanks` (ranking denso). **Intocable**: define quién gana |
| `utils/awards.js` (50) | `core/premios/awards.ts` | Qué lámina y qué caja de texto le toca a cada puesto |
| `utils/awardCanvas.js` (289) | `core/premios/awardCanvas.ts` | Encaje del nombre y descarga. Recibe la medición inyectada: se prueba sin canvas |
| `utils/closingDate.js` (184) | `core/premios/closingDate.ts` | Instantes del calendario en `Europe/Madrid` |
| `utils/votingSchedule.js` (143) | `core/premios/votingSchedule.ts` | Semántica abierto / cerrado / publicado |
| `utils/seasonId.js` (57) | `core/premios/seasonId.ts` | Slug de la edición y sus respaldos |
| `utils/options.js` (52) | `core/premios/options.ts` | `buildStableOptions`: ids de nominado estables. **Intocable** |
| `utils/localize.js` (148) | `core/premios/localize.ts` | `tField`, `getOptionLabel`, `resolveOptionId`. Se queda aunque hoy solo haya español (§7) |
| `utils/ballotEdits.js` (49) | `core/premios/ballotEdits.ts` | Oportunidades de envío. Las reparte el rango (§5.1) |
| `utils/pseudonym.js` (65) | — *(revisar)* | Huella FNV-1a del uid para reconocer tu fila. **Esta app ya tiene un pseudónimo público**: el `profileId` del perfil. Si el archivo lo lleva (§4.1), este módulo sobra entero |
| `utils/gridDensity.js` (177) | `core/premios/gridDensity.ts` | **Hay que recalibrar** al cambiar de Tailwind a SCSS (§6.3) |
| `utils/gradients.js` (66) | — | Se descarta: el color lo pone el tema |
| `utils/sanitize.js` (25) | — | Usar `core/security/` de GL *(por confirmar: comprobar que cubre los mismos casos)* |
| `utils/routes.js` (52) | — | Se disuelve en `core/constants/routes.ts` (§6.1) |
| `utils/authErrors.js` (29) | `core/premios/` o común | *(por confirmar)* si GL ya traduce códigos de Firebase Auth, se reutiliza |

### 1.2 Escrituras → `src/model/repository/`

| Origen | Destino | Nota |
|---|---|---|
| `services/ballotService.js` (114) | `premiosBallotRepository.ts` | Enviar y comprobar voto |
| `services/categoriesService.js` (267) | `premiosCategoriesRepository.ts` | Cargar, guardar, borrar y reordenar categorías |
| `services/seasonService.js` (488) | `premiosSeasonRepository.ts` | Ciclo de vida: abrir, cerrar, publicar, archivar. El más grande y el más delicado |
| `services/winnersService.js` (150) | `premiosWinnersRepository.ts` | Ganadores en `admin/winners` + migración del modelo antiguo |
| `services/analyticsService.js` (67) | — | Se descarta: GL tiene su Analytics gated |
| `services/errorService.js` (112), `loggerService.js` (28) | — | Se descartan a favor de los mecanismos de GL *(por confirmar)* |

### 1.3 Estado → `src/viewmodel/premios/`

| Origen | Destino | Nota |
|---|---|---|
| `hooks/useVotingFlow.js` (154) | `usePremiosVotingFlow.ts` | **Se reescribe**: los pasos pasan a ser rutas (§6.1) |
| `hooks/useStepHistory.js` (75) | — | Desaparece: lo hace el router |
| `hooks/useVotingConfig.js` (113) | `usePremiosConfig.ts` | Calendario y estado de la edición |
| `hooks/useFirestoreCategories.js` (57) | `usePremiosCategories.ts` | |
| `hooks/useFirestoreBallots.js` (75) | `usePremiosBallots.ts` | Solo admin |
| `hooks/useBallotStats.js` (117) | `usePremiosBallotStats.ts` | Recuento y resolución de nombres del panel |
| `hooks/useSeasonControls.js` (236) | `usePremiosSeasonControls.ts` | Abrir / cerrar / publicar + vista previa |
| `hooks/useSeasonResults.js` (97) | `usePremiosResults.ts` | Lectura del archivo publicado |
| `hooks/useAdminCheck.js` (71) | — | Se sustituye por el mecanismo de admin de GL, ya unificado por claim (§3.1) |
| `hooks/useTheme.js` (64), `useViewport.js` (59) | — | GL ya los tiene |

### 1.4 Pintura → `src/view/components/premios/` + `src/styles/premios.scss`

| Origen | Destino | Trabajo |
|---|---|---|
| `App.jsx` (523) | `PremiosHub.tsx` | Se parte: el enrutado va a la tabla de rutas, la cascada de pantallas se queda |
| `VoteScreen.jsx` (464) | `PremiosVoteScreen.tsx` | La pantalla grande. Rejilla de nominados + `gridDensity` |
| `GameCard.jsx` (205) | `NomineeCard.tsx` | Tarjeta de nominado. 100 % tipográfica: encaja de serie con el sistema |
| `ReviewScreen.jsx` (228) | `PremiosReviewScreen.tsx` | Revisión antes de enviar |
| `ResultsScreen.jsx` (207) | `PremiosResultsScreen.tsx` | Ganadores + clasificación + trofeos. Aquí entran los avatares (§4.1) |
| `AwardCard.jsx` (106), `AwardDialog.jsx` (72) | `AwardPanel.tsx` | Canvas con `role="img"`. El `<dialog>` se retiró (22-09-2026): la lámina vive en la página, encima de los ganadores, y cambia al pulsar cualquier trofeo |
| `SuccessScreen.jsx` (130), `AlreadyVotedScreen.jsx` (96), `DeadlineScreen.jsx` (132), `LoginScreen.jsx` (151) | idem con prefijo | Cuatro pantallas de estado. `LoginScreen` se funde con la puerta de GL |
| `AutoSizeText.jsx` (121) | `AutoSizeText.tsx` | Ajuste del cuerpo de letra al hueco. **Revisar contra la escala tipográfica** (§6.3) |
| `AdminPanel.jsx` (235) + `admin/*` (1.092) | `view/components/admin/premios/` | Seis pestañas que pasan a ser una sección del `AdminHub` |
| `ErrorBoundary.jsx` (52) | `PremiosErrorBoundary.tsx` | Mismo patrón que `SocialErrorBoundary` |
| `Icons.jsx` (259) | — | Se mapean a los iconos de GL (`core/constants/icons.ts`); hay un e2e que recorre iconos |
| `ui/`, `form/`, `layouts/` (~490) | — | Se descartan a favor de los equivalentes de GL. Lo que no exista, se crea en su sitio |
| `context/AppContext.jsx` (51) | — | GL ya tiene tema y preferencias |
| `data/i18n/es.js` (335) | `core/constants/premiosLabels.ts` | Un módulo de textos más, como `socialLabels` |
| `data/i18n/en.js` (335) | **No se trajo** | Ni en el árbol ni en el historial (comprobado el 2026-09-25, ver `plan-idioma.md`) |

**Recuento del trabajo**: ~3.900 líneas se portan con tipos (lógica), ~4.900 se reescriben (interfaz), ~1.400 se
descartan por duplicadas. La reescritura visual es **la mitad larga del esfuerzo**.

### 1.5 Lo que desaparece porque esta app ya lo tiene

Ninguna de estas piezas entra. No es ahorro de trabajo: es lo que decide si al final hay una aplicación o dos.

| Pieza de GA | Líneas | Qué la sustituye aquí |
|---|---|---|
| `LoginScreen.jsx` | 151 | La puerta de sesión de esta app. **No puede haber dos pantallas de «entrar con Google»** |
| `hooks/useAuthSession.js` | 126 | La sesión de Google que ya gestiona la app (`firebaseGateway`, `use*Session`) |
| `hooks/useAdminCheck.js` | 71 | El criterio de administrador único, ya por claim (§3.1) |
| `hooks/useTheme.js` + `context/AppContext.jsx` | 115 | El tema de la casa: 8 paletas × 2 modos, `data-palette` en `:root` |
| `hooks/useViewport.js` | 59 | Los utilidades de viewport existentes |
| `hooks/useStepHistory.js` | 75 | El router: los pasos son rutas (§6.1) |
| `components/ui/*` (Button, Card, Alert, Header, Footer, Spinner, controles) | ~380 | Los componentes de esta app |
| `components/form/*`, `components/layouts/*` | ~150 | Idem, más el cromo por sección (`AppSection`) |
| `components/Icons.jsx` | 259 | `core/constants/icons.ts` (y su recorrido e2e de iconos) |
| `components/ErrorBoundary.jsx` | 52 | El patrón de `SocialErrorBoundary`, con la voz del tema |
| `services/analyticsService.js` | 67 | La analítica de la casa, con su consentimiento |
| `services/errorService.js` + `loggerService.js` | 140 | Los mecanismos de aviso y registro existentes |
| `utils/gradients.js` | 66 | El color lo pone el tema; no hay degradados propios |
| `utils/sanitize.js` | 25 | `core/security/` |
| `utils/routes.js` | 52 | La tabla de rutas única |
| `utils/authErrors.js` | 29 | *(por confirmar)* si ya se traducen los códigos de Firebase Auth |
| `firebase.js` + `main.jsx` | 107 | Una sola inicialización de Firebase y un solo punto de entrada |
| `index.css` + `styles/*.css` | ~465 | Los tokens y las cuatro capas de `_base.scss` |

**Total que no entra: ~1.400 líneas.** Y dos ficheros que tampoco viajan: `firebase.json` y `firestore.rules` de GA
—se funden en los de esta app— y su `package.json`, que se disuelve en el de aquí (ninguna dependencia nueva:
`react`, `firebase` y `vite` ya están, y **Tailwind no se instala**).


---

## 2. Modelo de datos

### 2.1 Las colecciones que llegan, con prefijo

GA guarda en `ballots`, `categories`, `config`, `results`, `winners`, `surveyWinners` y `admin`. **Esos nombres no
pueden entrar tal cual en un proyecto compartido**: `config` y `categories` son palabras que esta app puede querer
para lo suyo cualquier día —`categories` suena a géneros de juego, no a categorías de premio— y una colección mal
llamada no se renombra después sin migrar datos.

Todas se prefijan:

| GA | Aquí | Contenido | Quién lee |
|---|---|---|---|
| `categories` | `premiosCategories/{id}` | Título bilingüe + nominados con `optionId` estable | Cualquiera con sesión |
| `config/voting` | `premiosConfig/voting` | Calendario, `seasonId`, `seasonName`, `lastPublishedId`, **`visible`** (§6.2) | Público (hace falta antes de la sesión) |
| `ballots/{uid}` | `premiosBallots/{uid}` | El voto. Uno por persona | Su dueño y el admin |
| `results/{seasonId}` | `premiosResults/{seasonId}` | Archivo publicado: ganadores + clasificación | **Público** (§4.2) |
| `admin/winners` | `premiosAdmin/winners` | Ganadores antes de publicar | Solo admin |
| `surveyWinners` | `premiosAdmin/surveyWinners` | Idem | Solo admin |

Migración: **solo `premiosCategories`**, con un script que copie documento a documento conservando el `id` de cada
opción (`buildStableOptions` los hizo estables a propósito: derivarlos otra vez corrompería cualquier voto futuro).
El resto nace vacío.

### 2.2 La cuenta ligera — el concepto nuevo

Hoy, para existir en lo social hacen falta **las dos cosas**: sesión de Google y GitHub conectado. El canal de
publicación es el gist social, y el directorio filtra por `social.enabled == true`; un perfil con esa marca y sin
gist está tratado explícitamente como roto (`firebaseSocialRepository.ts:437`, señal `enabled-without-gist`).

Exigir eso para votar sería poner un muro de GitHub el día de más afluencia del año. Así que se define un tercer
estado, que hasta ahora no existía:

```
sin cuenta            → no ha entrado
CUENTA LIGERA         → profiles/{uid} con displayName, photoURL, profileId, createdAt, updatedAt
                        · SIN social.enabled · SIN gist · NO sale en el directorio · NO publica actividad
                        · SÍ tiene avatar en la clasificación, rango (si el admin se lo pone) y palmarés
perfil social completo→ lo de hoy: + social.enabled + gist + canal + feed
```

**Tres reglas que hacen que esto no rompa nada de lo que ya hay:**

1. **Nunca se escribe `social.enabled` sin gist.** Esa combinación ya significa «perfil roto» en el código que
   hidrata el directorio, y usarla para otra cosa haría que las cuentas ligeras aparecieran como perfiles
   averiados en el hub de todo el mundo.
2. **La cuenta ligera se crea SIN el campo `tier`.** Comprobado en `firestore.rules:180`
   (`profileTierNotSelfAssigned`): en un `create` —donde `resource == null`— la regla exige que `tier` **no esté**
   en la escritura. Un `create` con `tier: 'bronze'` sería denegado. El rango lo pone el admin después, y quien no
   lo tenga se trata como bronce por el valor por omisión del código (`DEFAULT_PROFILE_TIER`).
3. **Ascender no reescribe lo que ya hay.** Al conectar GitHub, la escritura es un `merge` que añade `social`; el
   `createdAt` es inmutable por regla y `displayName`/`photoURL` solo se tocan si el usuario los cambia.

*(por confirmar antes de implementar)*: si la cuenta ligera debe crear también `userMap/{uid}`, que hoy guarda
`{ profileId, schemaVersion }` y es owner-only. Probablemente sí, para que el `profileId` sea el mismo al ascender.

### 2.3 El palmarés

Ganar una porra **no se deriva de nada**: es un hecho externo que alguien concede. El catálogo de logros de esta app
es derivación pura de la biblioteca y su espejo es un mapa de bits con el orden congelado (`MIRROR_ORDER`), así que
meter ahí un premio concedido rompería el contrato de todos los espejos ya publicados. Va en su propio carril:

```ts
/** Una entrada por edición ganada. Se escribe SOLO desde el panel, al publicar. */
interface PalmaresEntry {
  seasonId: string;    // clave del archivo (`premiosResults/{seasonId}`)
  seasonName: string;  // nombre visible, congelado en el momento de conceder
  rank: number;        // puesto DENSO (1..5): los empatados comparten puesto
  awardedAt: number;   // sello de la concesión
}
```

Vive en `profiles/{uid}.palmares` (array, tope 50 entradas). Tres decisiones:

- **Solo el admin lo escribe**, con la misma forma de protección que el rango: una función
  `profilePalmaresNotSelfAssigned()` que en escrituras del dueño exige que el campo **no cambie**. Sin eso,
  cualquiera se concede un trofeo en su propio documento, que lo lee todo el directorio.
- **`palmares` entra en la allowlist** de `profileWriteIsValid()` (`firestore.rules:36`), que hoy es
  `["schemaVersion", "uid", "profileId", "displayName", "photoURL", "social", "updatedAt", "tier", "createdAt",
  "achievements"]`. Sin tocar esa lista, **toda escritura del perfil sería denegada** en cuanto el documento tenga
  el campo: recuérdese que en un `update` por merge lo que se valida es el documento RESULTANTE.
- **Se pinta con la receta de la medalla** (`docs/logros/receta-medalla.md`): disco en penumbra, icono de Lucide,
  temple del filo. No abre una dirección visual nueva. La lámina descargable de GA se conserva aparte, como
  «póster», que es otra cosa y se comparte distinto.

Y tres más que salieron al usarlo:

- **La vitrina se ve en la ficha PROPIA igual que en la ajena.** Salía de buscar el perfil abierto en el directorio
  ya filtrado, que excluye por identidad a quien mira: quien había ganado una edición se la veía a los demás y no a
  sí mismo. Se resuelve contra el perfil abierto (`selectedProfileDetail`), que se busca en el directorio entero y
  entiende además el alias `me`. Es el mismo tropiezo que ya tuvo el espejo de logros.
- **Cada trofeo enlaza al resumen de los votos de su edición** (`/premios/resultados/:seasonId`), que es donde está
  lo que la medalla resume. Misma dirección que reparte el botón de compartir, y sin sesión (§4.2): el archivo se
  ve igual desde el perfil que desde un enlace recibido.
- **El trofeo lo decide el panel, edición por edición, y se va con ella** (20-09-2026). Publicar sigue
  concediéndolo, pero el histórico lleva un interruptor —un icono de trofeo al final de cada fila— que lo retira
  de los perfiles y lo devuelve, y **borrar una edición del histórico retira el suyo**: la medalla enlaza al
  archivo, así que dejarla puesta sobre una edición borrada era un logro por una porra de la que no queda nada.
  Para que sea reversible hace falta saber a quién se le dio, y eso ya no está en ninguna parte cuando se pulsa
  —el archivo publicado no puede llevar uid (§4.1) y las papeletas se retiran al publicar—: cada edición deja un
  registro en `premiosAdmin/palmares-{seasonId}` con la lista de premiados, en la colección que solo lee el
  administrador. Retirar barre además los perfiles, que es lo que permite apagar también las ediciones
  publicadas antes de que esto existiera, sin registro (se enseñan encendidas, que es lo que hay en los
  perfiles).

### 2.4 `premiosConfig/voting.visible` — la sección estacional

Un booleano que decide si la porra se ofrece en la navegación. Lo escribe el panel. La regla de presentación:

```
visible === false           → la sección no se ofrece (la ruta sigue respondiendo a quien tenga el enlace)
visible === true            → se ofrece siempre
visible ausente (por defecto)→ se ofrece si hay edición abierta, o si hay resultados publicados hace < 30 días
```

Así el interruptor del admin manda, y sin tocarlo el comportamiento razonable sale solo.

### 2.5 Lo que no se toca

El gist de juegos, el gist social, `privateConfig`, `friendships`, `activity_events` y el catálogo de logros. La
porra es **solo Firestore**: no gasta ni una petición del rate-limit de GitHub, que es el techo real de esta app.

---

## 3. Reglas de Firestore

### 3.1 El administrador pasa a custom claim

Hoy `isAdmin()` (`firestore.rules:13`) compara el email del token con una dirección escrita en el fichero. GA usa
`request.auth.token.admin == true`. Se unifica en el claim, que es lo correcto: no ata las reglas a una cuenta, no
publica tu correo en el repositorio y permite un segundo administrador.

```
function isAdmin() {
  return isSignedIn() && request.auth.token.admin == true;
}
```

**Hecho en la rama** (F0): la regla, el módulo `core/security/admin.ts` (que ahora exporta `ADMIN_CLAIM` y
`hasAdminClaim`), la lectura del claim en `firebaseAuthRepository.readAdminClaim` con su paso por la fachada
perezosa, los dos consumidores (`useIsAdmin`, `useAdminViewModel`), los tests de reglas y de componente, el script
`scripts/set-admin-claim.mjs` y la sección de SECURITY.md. Comprobado: `typecheck` limpio, 2.316 tests en verde,
91 de reglas en verde, `audit:privacy` sin categoría A.

**Dos cuidados que el cambio destapó** y que están escritos en el código, porque no son evidentes:

- **Leer el claim es asíncrono**, y eso obliga a volver a «comprobando» en CADA cambio de sesión y a descartar
  respuestas viejas con una marca de generación. Sin lo primero, quien inicia sesión estando ya en `/admin` ve la
  puerta cerrada aunque mande: entre la emisión del usuario y la respuesta del token hay renders con sesión
  presente y permiso aún sin resolver. Es el mismo fallo que GA documenta en su `useAdminCheck`.
- **El ID token se cachea hasta una hora**, así que un claim recién asignado no aparece solo. El panel lo
  reintenta forzando el refresco; el resto de la app lee el token que haya, para no pagar una petición por cada
  usuario normal.

**Hecho en producción** (20-09-2026), en este orden:

1. Claim concedido a `bellanco3@gmail.com` (uid `Yh7LuEKhrvYT2LrkIRuT8b9THYe2`), verificado con `--check` →
   `{"admin":true}`. Antes no lo tenía ninguna de las 12 cuentas del proyecto, así que desplegar primero habría
   dejado el panel sin nadie dentro: se comprobó antes de tocar nada.
2. `firestore.rules` desplegado en `mylists-f7313`. El único cambio funcional es la línea de `isAdmin()`.

**Dos trampas del Admin SDK**, documentadas en la cabecera de `scripts/set-admin-claim.mjs` porque costaron dos
intentos y volverán a aparecer cuando haya que nombrar a alguien:

- **`NODE_PATH` no sirve** para decirle a un módulo ES dónde está un paquete: esa variable solo la mira la
  resolución de CommonJS. De ahí `--sdk`, que resuelve con `createRequire` desde la carpeta indicada.
- **Desde `firebase-admin` 14 la API namespaced no existe**: `require('firebase-admin')` devuelve la API modular y
  `admin.credential` / `admin.auth()` son `undefined`. Se usan los subpaths `firebase-admin/app` y
  `firebase-admin/auth`, estables desde la v10.

**Aviso operativo:** revocar un claim no es inmediato —el token vive hasta una hora—, así que quitar el permiso de
administrador a alguien tarda en surtir efecto. Con un solo administrador da igual; conviene saberlo.

### 3.2 Las reglas que llegan

Se portan las de GA con los nombres nuevos (§2.1) y la **regla de cierre de esta app deniega todo lo que no esté
declarado**, así que hasta que estén escritas la porra no puede leer ni escribir nada. En resumen:

| Colección | Lectura | Escritura |
|---|---|---|
| `premiosCategories` | con sesión | admin |
| `premiosConfig/voting` | **pública** (hace falta antes de iniciar sesión) | admin |
| `premiosBallots/{uid}` | dueño o admin | dueño, con esquema válido, **dentro de plazo** y `editCount` = anterior + 1 (tope 5); borra solo el admin |
| `premiosResults/{id}` | **pública** (§4.2) | admin |
| `premiosAdmin/**` | admin | admin |

Lo que **no** puede relajarse al portarlas, porque es lo que sostiene la porra:

- El **plazo se valida en el servidor**, no solo en la interfaz: pasada la fecha de cierre, las reglas rechazan
  cualquier voto.
- El **contador de ediciones** se comprueba contra el valor anterior (`next.editCount == prev.editCount + 1`). Con
  solo «no pasar de 5», un cliente hostil reenviaría siempre `editCount: 1` y editaría sin fin.
- Los **ganadores nunca viven en la colección de categorías**, que es de lectura abierta: un `winner` ahí es un
  ganador publicado antes de tiempo.

### 3.3 Cambios en `profiles`

```
+ "palmares" en la allowlist de profileWriteIsValid()
+ function profilePalmaresNotSelfAssigned()   // el dueño no puede añadirlo ni cambiarlo
+ validación de forma: lista ≤ 50, cada entrada con seasonId/seasonName/rank/awardedAt y nada más
```

Y **ningún cambio** para la cuenta ligera: un documento sin `social` y sin `tier` ya pasa las reglas de hoy. Lo que
cambia es quién lo crea y cuándo.

### 3.4 Índices — medido: no hace falta ninguno

Comprobado el 20-09-2026 sobre los repositorios ya portados: las cinco lecturas de la porra son de COLECCIÓN
ENTERA, sin un solo `where` ni `orderBy`. El orden se calcula en el cliente (`sortCategoriesByOrder`,
`assignDenseRanks`, y el histórico ordena en memoria), así que `firestore.indexes.json` se queda como está.

**Cuándo dejaría de ser cierto:** en cuanto una pantalla del panel pida un `orderBy` sobre el servidor —por
ejemplo, listar el histórico ordenado por fecha—, Firestore exigirá un índice. Si falta, la consulta falla en
producción y no en desarrollo, así que conviene añadirlo en el mismo cambio que introduzca la consulta.

---

## 4. Identidad y privacidad

### 4.1 Avatares en la clasificación

Hoy el archivo publicado quita el `userId` de cada entrada y deja una huella (`uidHash`, FNV-1a de 64 bits). Fue una
decisión consciente: la pantalla solo necesita poder decir «esta fila eres tú», y no hay razón para publicar una
lista de identificadores junto a los nombres. **Eso se conserva.**

Lo que se añade es lo mínimo para pintar una cara:

```ts
interface LeaderboardEntry {
  nickname: string;   // el nombre que la persona eligió al votar
  points: number;
  rank: number;       // puesto denso
  profileId: string;  // pseudónimo público del perfil — NO el uid
}
```

**LA FOTO NO SE PUBLICA, y esto corrige lo que decía este documento.** La idea era denormalizarla al archivar,
hasta que al implementarlo se vio el precio: el archivo es **público y permanente**, así que congelar ahí la URL
de la foto de cada participante deja datos personales en un documento abierto —y quitar la foto de la cuenta ya no
la retiraría de ahí—. Decidido el 20-09-2026: el archivo lleva solo nombre y pseudónimo, y **la cara se resuelve
al PINTAR**, desde el directorio social que la sesión ya se descarga, aplicando la reciprocidad de verdad (que es
dinámica: depende de si quien mira enseña la suya hoy). Sin sesión, iniciales.

**Tampoco se guarda el correo en la papeleta**, que es lo que hacía la aplicación de origen: los correos se
purgaron de Firestore y las reglas los prohíben en el perfil, así que no vuelven por esta puerta. El panel
identifica a cualquiera por su uid, su pseudónimo y el nombre que eligió.

**Un solo pseudónimo, el que ya usa esta app.** GA calculaba una huella propia del uid (`pseudonym.js`, FNV-1a)
solo para reconocer tu fila. Aquí no hace falta: votar crea cuenta ligera (§2.2), toda cuenta tiene `profileId`
—un pseudónimo público que no expone ni el uid ni el correo— y con él se reconoce la fila propia **y** se enlaza el
perfil. Mantener las dos formas de decir lo mismo sería exactamente el tipo de duplicado que este plan evita.

**La foto va denormalizada, y no se resuelve leyendo el perfil de cada uno.** Dos motivos: las reglas solo dejan
leer un perfil ajeno si tiene `social.enabled == true` —las cuentas ligeras, justo las que trae la porra, no lo
tienen— y abrir esa lectura repetiría la exposición de datos personales que ya costó una purga
(`scripts/purge-profile-pii.js`). Denormalizar es además lo que ya hace el documento de amistad con `otherPhoto`.

**Cuándo se pinta**, aplicando en el cliente las cuatro puertas que ya existen en `core/social/photoVisibility.ts`:

1. la persona publica foto (`visibility.showPhoto`),
2. la foto es real y no el monograma que Google genera solo (`core/social/googlePhoto`),
3. quien mira **también** enseña la suya —la reciprocidad—,
4. hay amistad, con la exención del rango `mithril` para moderar.

Quien no pase las cuatro sale con su inicial, exactamente igual que en el hub. Y el nombre del participante lleva
enlace a su perfil cuando lo tiene: **ahí está el puente** entre la porra y lo social, que es la mitad del valor de
esta idea.

### 4.2 Resultados públicos con enlace

`premiosResults/{seasonId}` pasa a ser de lectura pública y la pantalla de resultados se puede abrir sin sesión, con
el mismo patrón que una reseña compartida: `noindex` intacto en todo el dominio y `robots.txt` abriendo la ruta
**solo a los agentes de previsualización** (WhatsApp, Discord, X, Slack, Telegram…). Quien pegue el enlace verá
título, edición y ganadores en la tarjeta del chat.

Lo que **no** sale en público: ningún voto individual, ningún email, ningún uid, y las fotos solo bajo las reglas de
§4.1 (un visitante sin sesión no es amigo de nadie, así que ve iniciales).

### 4.3 Consentimiento

Subir `LEGAL_VERSION` (`core/constants/legal.ts:56`, hoy `'2026-09-07'`) devuelve a **todo el mundo** a la puerta de
aceptación. Se hace **una sola vez**, agrupando los cuatro cambios: resultados públicos, avatares en la
clasificación, cuenta ligera y palmarés.

**Punto que hay que resolver al implementar:** hoy la puerta legal vive en el hub social
(`useSocialLegalConsent`), y un votante con cuenta ligera puede no pasar nunca por ahí. El consentimiento se
registra en `publicConfig/{uid}.consent`, que es del dueño y le sigue entre dispositivos, así que la solución es
**reutilizar el mismo mecanismo desde la porra** —misma versión, mismo documento, otra puerta— y no inventar un
segundo registro de aceptación.

---

## 5. El rango y el trofeo

### 5.1 Qué desbloquea el rango

**La calidad de la lámina descargable y las oportunidades de envío.** En pantalla el trofeo se ve igual para
todos; lo que cambia es la resolución del archivo que uno se lleva (y, si se quiere, la marca):

| Rango | Lámina |
|---|---|
| bronce | 1000 px |
| plata | 1400 px |
| oro | 2000 px (el tamaño nativo del arte de hoy) |
| mithril | 2000 px |

**Las OPORTUNIDADES** (revisado el 20-09-2026; antes eran 5 para todo el mundo). Una oportunidad es un envío de
la papeleta: la primera es la que se gasta al enviarla y cada corrección gasta otra.

| Quién | Oportunidades |
|---|---|
| sin cuenta social (la cuenta ligera del voto) | 1 |
| bronce | 5 |
| plata | 10 |
| oro | 15 |
| mithril | 20 |

**Tener cuenta social es tener canal** (`social.enabled`). La cuenta ligera que se crea al votar tiene perfil y
no tiene canal, así que se queda en una: envía y su papeleta queda como esté, que es lo que hacía todo el mundo
cuando el voto era inmutable.

**Lo que esto cuesta**, y es el precio de haber cambiado la decisión: las reglas **leen el perfil** para resolver
el cupo. Se paga **solo en las correcciones** —el primer envío vale igual para todos y no pasa por ahí—, que es
justo el momento de más carga del año, así que la avalancha de papeletas sigue sin pagar ninguna lectura extra. Y
son **dos** pares duplicados cliente/reglas más (`PREMIOS_OPPORTUNITIES_BY_TIER` y
`PREMIOS_OPPORTUNITIES_WITHOUT_SOCIAL`), atados por `tests/integration/firestore.rules.test.ts`.

**Lo que el usuario NO puede darse a sí mismo:** el `tier`, que es lo que abre 10, 15 y 20, lo asigna el
administrador y `profileTierNotSelfAssigned()` lo impide. El `social.enabled` sí lo escribe su dueño, así que
quien manipule su cliente puede colarse en el cupo de bronce (de 1 a 5) — y aparecer como perfil roto en el hub
de todos, por la señal `enabled-without-gist`. Se asume: no hay nada que robar más allá de cuatro correcciones.

### 5.1bis Dos trofeos: la lámina en privado, la medalla en público

Decidido el 20-09-2026, al mirar el arte real. Las cinco láminas son **collages ilustrados con material de
terceros** (una ola de Hokusai, personajes de Cuphead, Sea of Stars y Cyberpunk) rotulados «Ganador Game Awards»
en Comic Sans. Eso choca con tres cosas ya escritas: que esta app no enseña ni una imagen de juego
(`DESIGN.md`), que las páginas públicas no llevan arte ajeno (`plan-compartir-resenas.md`), y que los resultados
van a ser públicos con enlace (§4.2).

| Dónde | Qué se ve |
|---|---|
| Pantalla de resultados **con sesión** y descarga del premiado | La **lámina** de siempre, intacta |
| Página **pública** de resultados y vitrina del perfil | La **medalla** tipográfica, con los tokens del tema y la receta de `docs/logros/receta-medalla.md` |

Dos consecuencias para quien implemente: las láminas **no pueden servirse desde `public/`** tal cual —eso es una
URL abierta—, sino tras una comprobación de sesión (la Pages Function ya sabe verificar un ID token); y hay que
**rerotularlas** desde los ficheros fuente, porque «Game Awards» es el nombre de un certamen real y el evento se
llama **«El reto del jugador»** (la sección se titula «Premios» y cada edición lleva su año).

### 5.2 Lo que no se hace

- **Voto ponderado por rango.** Rompe la equidad de la porra, que es justo lo que la hace divertida. El rango
  reparte cuántas veces puedes *rehacer* tu papeleta (§5.1), no cuánto vale: un acierto de mithril y uno de
  bronce suman los mismos puntos.
- **El trofeo como logro del catálogo.** Ver §2.3.
- **Un segundo sistema de niveles.** El rango ya existe y lo asignas tú; la porra lo consume, no lo produce.

### 5.3 Logros que sí se pueden derivar

Una vez exista el palmarés, del palmarés **sí** se derivan logros con todas las de la ley, y esos entran en el
catálogo por la puerta buena (una escalera nueva, al final de su familia, sin tocar el orden existente):
«participaste en N ediciones», «primer podio». Queda anotado como continuación, no como parte de esta entrega.

---

## 6. Interfaz

### 6.1 Rutas

GA no usa router: el paso de votación es estado de React y empuja historial sin cambiar la URL. Aquí las rutas son
tabla única (`core/constants/routes.ts`) y las sub-rutas las resuelve cada pantalla, como hace el hub social con
`matchSocialRoute`. Se sigue ese patrón:

```
/premios                      → portada de la edición (o resultados, si ya se publicó)
/premios/votar/:paso          → una categoría por paso
/premios/revisar              → revisión antes de enviar
/premios/resultados           → última edición publicada
/premios/resultados/:seasonId → una edición concreta (esta es la que se comparte)
```

En la tabla de rutas entra **una sola línea** con comodín (`{ path: '/premios/*', section: 'premios' }`), por el
mismo motivo por el que social y estadísticas lo hacen: declararlas una a una obliga a tocar el fichero cada vez que
se añade una pantalla, y olvidarse es el fallo que ya costó `/social/requests`.

`useStepHistory` desaparece: el botón «atrás» del navegador lo resuelve el router.

### 6.2 Cómo entra en la navegación (y por qué NO como quinta pestaña)

**Conflicto comprobado:** la barra inferior promete **cuatro** pestañas y hay un e2e (`tests/e2e/bottomNav.test.ts`)
que mide que quepan enteras en 280 px con el rótulo más largo («Estadísticas»), apilando icono sobre rótulo y
apretando el cuerpo de letra antes de quedarse en icono solo. **Una quinta columna rompe esa promesa y ese test.**

Así que la sección estacional entra por otro sitio:

1. **Un aviso en la portada** cuando hay edición abierta o resultados recientes, con enlace a `/premios`. La app ya
   tiene un mecanismo de avisos servido desde `/api/announcement`, que es exactamente esta forma.
2. **Un punto en el hub social**, donde está la gente, y **una entrada en Ajustes** para llegar siempre.
3. **La ruta responde siempre**, haya aviso o no: quien tenga el enlace entra.

Si en algún momento se quiere de verdad en la barra, la decisión no es «añadir una quinta»: es **sustituir** una
mientras dura la edición, y eso hay que probarlo con el mismo test de anchos.

### 6.3 La reescritura visual

4.874 líneas de componentes escritos con utilidades de Tailwind entran en un sistema de cuatro capas con ocho temas,
dos modos y auditoría axe sobre el render real (`tests/e2e/a11y.test.ts` recorre doce combinaciones). Reglas de la
casa que aplican desde la primera línea: **ningún hex en un componente**, **ningún `font-size` literal**, el foco con
`--focus-ring`, y AA en las dieciséis combinaciones.

Tres puntos concretos de cuidado:

- **`gridDensity`** decide cuántas columnas de nominados caben. **Recalibrado el 20-09-2026** con una bifurcación
  según si la caja llevaba **carátula** (`withCovers`), y **simplificado el 24-09-2026**: la tarjeta lleva siempre
  portada y la de solo texto se retiró, así que queda una sola calibración, la de la pieza del mosaico de la
  biblioteca —~205 px, la de `GRID_CARD_MIN_PX` de `GameTable`—. La regla de la fila huérfana
  (`balanceColumns`) manda por encima.
- **`AutoSizeText`** busca el mayor cuerpo de letra que quepa. No se ha portado: el nombre del nominado se acota a
  dos líneas con la escala de la casa (`-webkit-line-clamp`), que es lo que hace el resto de la aplicación. Si
  alguna vez hace falta el ajuste fino, que sea **entre pasos de la escala** y no en píxeles libres.
- **La tarjeta de nominado** marca la selección con una franja de acento en el borde inferior, más borde y halo, no
  con un icono flotante. Eso encaja de serie con el lenguaje de la casa; conviene conservarlo tal cual.

**La maqueta de la porra se trajo el 20-09-2026** (la estructura, no la piel): cabecera con contador, porcentaje y
barra de progreso; rejilla que **reparte el alto disponible** para que la categoría quepa sin desplazarse
(`useAltoDisponible` mide el hueco real hasta el fondo de la ventana, descontando el relleno del contenedor); pie
fijo con anterior / siguiente y **finalizar siempre disponible**; revisión como **índice en rejilla** con una
tarjeta por categoría que lleva a ella; confirmación con su marca, sus tres garantías y el cupo restante; y
resultados a **dos columnas** (ganadores | puntuación) con los tres primeros puestos vestidos con los metales de
`_tiers.scss`. El color, la letra y las sombras los siguen poniendo los ocho temas: no entró ni un hex ni una
tipografía nueva.

### 6.4 La lámina del trofeo

Se conserva el enfoque de GA, que está bien resuelto: canvas a resolución nativa escalado por CSS (lo que se ve y lo
que se descarga son el mismo píxel), una caja de texto por lámina medida en fracciones sobre el arte real, `<dialog>`
nativo y `role="img"` con `aria-label`, porque para un lector de pantalla un canvas es una caja vacía.

Dos cosas que **hay que revisar al traerlo**:

- **La letra de la lámina es la del cartel impreso** (Comic Sans MS, con Comic Neue como sustituta libre), que GA
  pide a Google Fonts bajo demanda. **Aquí eso no vale tal cual**: la CSP de esta app declara `font-src 'self' data:`
  y las fuentes se sirven desde el propio origen (`functions/fonts/[[path]].ts`). La sustituta hay que **servirla
  desde casa**, o la lámina caerá en una fuente cualquiera sin que nadie se entere.
- **El arte debe servirse del mismo origen** (`img-src 'self'`), o el canvas queda contaminado y `toBlob` muere en
  silencio: la descarga no falla, simplemente no ocurre.

### 6.5 Integración de dominio: la porra habla con la biblioteca

Compartir estilos no es integrar. Lo que hace que esto **sea** esta aplicación y no un inquilino es que los datos se
crucen. Los nominados son juegos, y aquí sabemos qué juegos tienes. `core/utils/normalizeName.ts` es justo la pieza
que lo permite: el nombre normalizado es lo único comparable entre bibliotecas distintas, y ya se usa para eso en el
listado, en la bandeja y en lo social.

Cuatro cruces, ordenados por lo que aportan frente a lo que cuestan:

| Cruce | Qué se ve | Dónde |
|---|---|---|
| ~~**El nominado, contra tu biblioteca**~~ | ~~En la tarjeta de votación: si lo tienes, en qué lista está y qué nota le pusiste~~ · **RETIRADO el 20-09-2026** (ver abajo) | — |
| **Tu voto, contra tu nota** | Al cerrarse la edición: en qué coincidiste contigo mismo y en qué no | Panel de estadísticas |
| **La edición, en el feed** | «Fulano ha votado» mientras el plazo está abierto (sin revelar el voto) y «Fulano ganó la edición» al publicar | Canal social, actividad derivada |
| **Añadir un nominado a Próximos** | Desde la propia pantalla de resultados, un juego que no tenías | Acción de la biblioteca, ya existente |

Ninguno publica un dato nuevo: todos se derivan de lo que ya hay a un lado y a otro.

**EL PRIMERO SE IMPLEMENTÓ Y SE RETIRÓ**, y conviene que quede escrito por qué, porque contradice la regla 4 del
principio rector. La tarjeta de nominado llevó debajo del nombre «Lo terminaste · Tu nota: 88». Con la maqueta
nueva —cinco portadas repartiéndose el alto de la pantalla— esa línea aparecía en una tarjeta de cada diez (casi
ningún nominado está en tu biblioteca) y le quitaba sitio al título justo cuando la rejilla va más justa. Se quitó
el 20-09-2026 a petición del usuario. **El cruce sigue escrito** (`core/premios/library`, con sus pruebas) y la
pieza que lo hace posible —`normalizeName`— no se ha tocado: si vuelve, será en un sitio donde se lea de verdad
(el resumen de la papeleta, o el panel de estadísticas al cerrarse la edición). Mientras tanto, la porra habla con
la biblioteca por los otros tres cruces, que siguen pendientes.

*(Decisión pendiente al implementar)*: si el cruce por nombre falla —los títulos de los nominados los escribe el
administrador a mano—, no se enseña nada y no molesta. No se intenta adivinar ni se pide a IGDB.

### 6.6 La voz y los estados son los de la casa

Lo que más delata a una sección injertada no es el color: son los mensajes. Así que la porra usa **los mecanismos de
esta app, no los suyos**:

- **Errores y sin conexión con la voz del tema.** El hub social tiene dos frases por paleta
  (`socialVoiceByPalette`, en `themes/<id>.social.ts`): lo que ha caído contado como lo contaría ese mundo. La porra
  necesita las suyas —lo que se cae aquí es la votación— con el mismo mecanismo y en el mismo sitio.
- **Avisos por el sistema de avisos de la app** (`notify`, `Notice`), no con una alerta propia.
- **Confirmaciones con los modales de la casa**, perezosos como los demás. El `<dialog>` nativo del trofeo se
  conserva solo si el modal de casa no da el foco atrapado y el Escape que esa pantalla necesita; si los da, se usa
  el de casa.
- **El esqueleto de carga** con el patrón de `SocialHubSkeleton`: el armazón se pinta cargado de antemano y el resto
  llega perezoso.
- **Textos en `premiosLabels.ts`**, con la misma disciplina que costó aprender en lo social: si un módulo del
  arranque necesita una cadena de ahí, **no la importa de ahí** — va al armazón o se pasa por props.

---

## 7. Idioma: qué se conserva ahora para no pagar dos veces

La app irá a varios idiomas en su propio plan, después de esta unificación. Aquí no se monta el mecanismo, pero **sí
se conserva todo lo que costaría recuperar**:

- Los **títulos de categoría siguen guardándose bilingües** (`{ es, en }`), como hoy en GA. La interfaz pinta
  español; el dato no se pierde. Si se guardara plano, volver a bilingüe sería una migración de datos.
- Se portan `localize.ts` (`tField`, `getOptionLabel`, `resolveOptionId`) y su tolerancia a los formatos antiguos.
- ~~`data/i18n/en.js` se conserva en el repositorio como material del plan siguiente.~~ No llegó a traerse: no está
  en el árbol ni en el historial (comprobado el 2026-09-25). El plan del idioma es `plan-idioma.md`.
- Los textos nuevos van a **un módulo propio** (`premiosLabels.ts`), nunca dispersos en los componentes: es la misma
  disciplina que permitió sacar los 8 kB de textos sociales del arranque de todo el mundo.

---

## 8. Entrega por fases

Cada fase termina con algo comprobable y con la suite en verde. Se para al final de cada una.

| Fase | Qué entra | Cómo se comprueba | Peso |
|---|---|---|---|
| **F0** · Preparación | Claim de admin asignado; `isAdmin()` por claim en las reglas de esta app + sus tests; rama `feature/unificar-premios` desde `develop` | `npm run test:rules` en verde y `/admin` accesible tras re-loguear | 5 % |
| **F1** · Lógica | `core/premios/` y `model/repository/premios*` en TypeScript, con los tests de `utils` y servicios portados | `npm run typecheck` + `npm test`; scoring y plazo cubiertos | 25 % |
| | **Hecha, salvo los hooks.** Los tipos, los **diez módulos de cálculo** de `core/premios/` y los **cuatro repositorios** de `model/repository/premios/`, con 189 pruebas. Los hooks pasan a F3 a propósito: ver la nota de abajo | | |

**Por qué los hooks se van a F3.** El plan los metía aquí, pero al llegar se ve que no son lógica: son el cableado
entre un repositorio y una pantalla que todavía no existe. `useVotingFlow` hay que reescribirlo entero (los pasos
pasan a ser rutas, §6.1) y los demás son finos —leen, guardan y exponen estado—, así que su forma la decide la
pantalla. Portarlos ahora significaría escribirlos dos veces. Lo que sí estaba en F1 y era el grueso —el cálculo y
las escrituras— está hecho y probado sin depender de nada visual.
| **F2** · Datos y reglas | Colecciones prefijadas, reglas nuevas, índices, script de copia de `categories` | Tests de reglas nuevos (voto fuera de plazo, `editCount`, ganador en categoría) + copia verificada contra el emulador | 10 % |
| | ✅ **HECHA.** Reglas de las cinco colecciones, con 19 pruebas nuevas (110 en total), **desplegadas** en `mylists-f7313`. Índices: ninguno necesario (§3.4). **26 categorías migradas** a `premiosCategories` el 20-09-2026, con su título bilingüe, su peso y su orden; sin nominados, que los pone cada edición | | |
| **F3** · Interfaz | `/premios` como chunk perezoso con su error boundary: votar, revisar, enviar, resultados. Cromo, avisos, esqueleto y voz por paleta de la casa (§6.6); el nominado ya se cruza con tu biblioteca (§6.5) | e2e de votación y resultados rehechos; axe en las doce combinaciones; presupuesto de arranque intacto | 35 % |
| | ✅ **HECHA.** Portada, votación con el paso en la URL, revisión, envío, las tres salidas del flujo, el cruce con la biblioteca, la rejilla midiendo el contenedor, **resultados** (ganadores, clasificación, fila propia por pseudónimo y enlace al perfil), **el trofeo** (arte traído, Comic Neue vendorizada, diálogo con canvas y descarga), hoja propia con tokens, **la voz de cada tema** en los mensajes de error y de falta de conexión, **axe en las 16 combinaciones** y pruebas de componente | | |

**La pantalla de resultados, rehecha por dentro (20-09-2026).** Abría con veintiséis fichas de categoría y una
lista de catorce renglones iguales, donde quien había ganado la porra pesaba lo mismo que el decimotercero.
Ahora empieza por el **podio** —un escalón por PUESTO, con los empatados juntos, y el metal de las clases de
rango de la casa—, la clasificación sigue **desde el cuarto** sin repetir a nadie, la categoría de más peso sale
como **titular** del panel de ganadores (se elige por el `weight` archivado, no por su nombre) y el aviso de «tu
premio» solo aparece si no estás en el podio. De paso se fueron tres ruidos: las versalitas de los veintiséis
rótulos de categoría, la palabra «puntos» repetida en cada renglón y los cinco botones de trofeo con texto, hoy
un icono. Auditada con axe en ocho combinaciones de paleta y tema × tres estados de sesión, y con dos fallos de
contraste corregidos que venían de antes (`--text-dim` sobre superficie elevada: 3,6:1 en los temas oscuros).
**No la cubre el axe del CI**, porque la auditoría de `tests/e2e/a11y.test.ts` necesita una edición publicada y
en el build de pruebas no hay ninguna.

**Dónde vive el arte del podio, dicho sin adornos.** Las cinco láminas están en `public/awards/` (1,2 MB), tal y
como venían, **con su rótulo original**: se trajeron sin rerotular por decisión del 20-09-2026. La consecuencia es
que quien adivine su URL puede abrirlas en blanco; no se enlazan en ninguna parte pública, el dominio va con
`noindex` y `robots.txt` cierra el paso, y el botón del trofeo solo se ofrece con sesión. **Eso NO es privacidad
de verdad**: si algún día hace falta, el camino es servirlas desde KV tras comprobar el token, como ya se hace con
las reseñas compartidas. La medalla tipográfica (`PalmaresMedal`) sigue siendo lo único que se enseña en abierto.

**La entrada estacional, hecha el 20-09-2026.** Dos accesos, los dos gobernados por `core/premios/visibility` y
por el interruptor «Dónde se ve» del panel: un punto **en ámbar** en el menú de Ajustes, detrás de «Diseño», y un
botón con el rey de ajedrez junto a las solicitudes del espacio social. Se leen sin cargar Firebase: la respuesta
se guarda en este navegador y solo se refresca cuando ya hay sesión (ver `usePremiosVisible`), así que el arranque
sube 0,4 kB y no 172. El ámbar es `--warn` **mezclado con el color de texto al 54 %**: a pelo se quedaba en 2,67:1
sobre las paletas claras, y axe lo comprueba ahora en las dieciséis combinaciones.

**Lo que decía antes este documento, y por qué ya no aplica.** El plan la pone aquí (§6.2: aviso en portada, punto en el
hub, entrada en Ajustes), pero **hoy no hay ninguna edición que anunciar**: abrir una exige el panel, que es
justo lo que trae F4. Un aviso que nunca puede aparecer no se puede ni probar. Además, leer el calendario desde
la portada de la app metería el SDK de Firebase en el grafo de arranque —172 kB para todo el mundo, incluido
quien no vota nunca—, así que cuando se haga hay que resolverlo por otra vía (la función de avisos ya sirve
desde KV, sin Firebase).
| **F4** · Panel | Las seis pestañas dentro del `AdminHub` | e2e de admin rehecho: abrir edición, publicar, archivar | 15 % |
| | ✅ **HECHA.** La porra como una VISTA MÁS de `AdminHub` (sin segundo `/admin` ni segunda guarda), con sus **cinco pestañas**: Temporada (abrir, cerrar, publicar), Categorías (crear, editar, ordenar, eliminar; los nominados son un campo cada uno y conservan su id), Ganadores, Votos (censo + clasificación provisional) e Histórico (renombrar y borrar, con reapunte de la pantalla pública) | | |
| **F5** · Social | Cuenta ligera, avatares en la clasificación, palmarés en el perfil, trofeo por rango, los tres cruces restantes de §6.5 (feed, estadísticas, añadir a Próximos), `LEGAL_VERSION` | Tests de reglas de `palmares`; comprobación manual de las cuatro puertas de la foto | 10 % |
| | **Casi hecha.** Cuenta ligera al votar, palmarés concedido al publicar y enseñado como logro en la ficha del perfil (con sus 5 pruebas de reglas), la fila de la clasificación enlaza al perfil, y `LEGAL_VERSION` subida a `2026-09-20` con los tres tratamientos nuevos declarados. **Las caras en la clasificación quedan fuera**, con motivo medido: ver abajo | | |

**Por qué la clasificación no enseña fotos (20-09-2026).** La decisión era aplicar las cuatro puertas del hub, y
una de ellas no se puede evaluar desde esta sección: la RECIPROCIDAD necesita saber si quien mira publica su
propia foto, y ese interruptor (`visibility.showPhoto`) vive **dentro del gist social**. Resolverlo aquí obligaría
a cargar el canal de GitHub solo para decidir si se pinta un círculo — y en una URL pública compartida no hay
sesión que lo cargue.

Lo que NO vale es asumir que quien tiene foto la publica: quien la ha escondido a propósito vería las de los demás
sin enseñar la suya, que es justo el trato que la regla deshace. Las dos salidas, por si se retoma: replicar ese
interruptor en `publicConfig/{uid}` —owner-only, ya sincroniza preferencias y se lee con una consulta— o pasar el
espectador ya resuelto cuando se llegue desde el hub. Mientras tanto, iniciales para todo el mundo y **la fila
enlaza al perfil**, que era la mitad del valor de la idea.
| **F6** · Retirada | Redirección permanente del sitio viejo, repositorio archivado, un solo proyecto de Pages | El enlace antiguo lleva a `/premios` | Pequeño |

**Orden recomendado:** F0 → F1 → F2 → F3 → F4 → F5 → F6. Datos y reglas **antes** que la interfaz: es donde
aparecen las sorpresas, y descubrirlas con la pantalla ya hecha obliga a rehacerla.

**Si hubiera prisa** (no la hay, por decisión): F5 es lo único recortable. La porra funciona entera sin avatares, sin
palmarés y sin cuenta ligera; lo que no se puede recortar es F2.

---

## 9. Pruebas

Se portan tal cual (con tipos) los tests que protegen lo que no se puede romper: `scoring` (146), `options` (85),
`closingDate` (150), `votingSchedule` (142), `seasonId` (57), `localize` (164), `ballotEdits` (54), `pseudonym` (44),
`awards` (60), `awardCanvas` (81), `gridDensity` (172) y los de servicios (`ballotService`, `categoriesService`,
`seasonService`, `winnersService`: 730 líneas). Y los de reglas (569), adaptados a los nombres nuevos.

Se rehacen contra la interfaz nueva los de componentes y los cinco de Playwright (`voting`, `results`, `awards`,
`admin`, `a11y`), que miran una maqueta que deja de existir.

Se añaden, porque son casos que hoy no cubre nadie:

- **Los pares duplicados del cupo de oportunidades** (`PREMIOS_OPPORTUNITIES_BY_TIER` y
  `PREMIOS_OPPORTUNITIES_WITHOUT_SOCIAL` ↔ `premiosOpportunities()` de las reglas). Van en
  `tests/integration/firestore.rules.test.ts`, que es donde ya viven los otros pares y el único sitio que lee las
  reglas de verdad; en un test unitario no cabe, porque bajo Vitest `import.meta.url` no es una URL `file:`.

- **La cuenta ligera**: que se crea sin `tier` y sin `social.enabled`, y que asciende sin perder `createdAt`.
- **El palmarés**: que el dueño no puede escribírselo (regla), y que la vitrina aguanta un valor corrupto.
- **Las cuatro puertas de la foto** en la clasificación, incluida la reciprocidad.
- **El presupuesto de arranque**: que ningún módulo de la porra entra en el grafo de arranque.

---

## 10. Despliegue y retirada

1. Reglas e índices **antes** que la aplicación (si falta un índice, la consulta falla en producción).
2. Subir versión, `npm run audit:rules`, suite completa en verde — la lista del README no es opcional.
3. `_headers` y `_redirects` fusionados, con el hash del script en línea recalculado y `src/test/csp.test.js`
   equivalente en verde.
4. Un solo proyecto de Cloudflare Pages. El dominio viejo, con redirección **permanente** a `/premios`.
5. El repositorio de GA se archiva en solo lectura. El proyecto `game-awards-d7881` de Firebase **no se borra hasta
   confirmar** que no queda nada que leer allí.

---

## 11. Conflictos comprobados (auditoría del 20-09-2026)

Esto es lo que se ha ido a mirar al código expresamente para saber qué puede romper la función nueva. Cada punto está
verificado sobre el fichero que se cita.

### Bloqueantes — si se ignoran, no funciona

| # | Conflicto | Evidencia | Salida |
|---|---|---|---|
| 1 | **La cuenta ligera no puede crearse con `tier`** | `firestore.rules:180` — en `create` (`resource == null`) exige que `tier` **no** esté en la escritura | Crear sin el campo; el rango lo pone el admin |
| 2 | **`social.enabled` sin gist ya significa «perfil roto»** | `firebaseSocialRepository.ts:437`, señal `enabled-without-gist` | La cuenta ligera **nunca** escribe esa marca |
| 3 | **`palmares` fuera de la allowlist congela el perfil** | `profileWriteIsValid()`, `firestore.rules:36` — valida el documento RESULTANTE, así que un campo no listado deniega **toda** escritura posterior | Añadirlo a la lista **en el mismo despliegue** que lo escribe |
| 4 | **La regla de cierre deniega lo no declarado** | final de `firestore.rules`: `match /{document=**} { allow read, write: if false; }` | Las colecciones de la porra no existen hasta que sus reglas estén escritas |
| 5 | **Una quinta pestaña rompe la barra y su test** | `tests/e2e/bottomNav.test.ts`: cuatro columnas medidas en 280 px | Entrada estacional por aviso, hub y ajustes (§6.2) |
| 6 | **Dos rutas `/admin`** | `routes.ts` de esta app y `ROUTES.admin` de GA | Un solo panel: la porra es una sección más del `AdminHub` |

### Que rompen en silencio — no fallan, hacen algo raro

| # | Conflicto | Evidencia | Salida |
|---|---|---|---|
| 7 | **Claves de almacenamiento sin prefijo** | GA usa `appTheme`, `appLanguage`, `votingProgress`; aquí todo es `mis-listas-*` y lo lee también `public/theme-init.js` | Prefijar y declararlas en `storageKeys.ts`; el tema y el idioma los pone esta app, no la porra |
| 8 | **Dos fuentes de tema** | `hooks/useTheme.js` + `context/AppContext.jsx` de GA | Se descartan los dos |
| 9 | **Nombres de colección genéricos** | `categories`, `config`, `results`, `winners` | Prefijo `premios*` (§2.1) |
| 10 | **La fuente de la lámina se pide a Google Fonts** | `ensureFont()` en GA; aquí `font-src 'self' data:` y fuentes servidas por `functions/fonts/[[path]].ts` | Servir la sustituta desde el propio origen o el trofeo saldrá con otra letra |
| 11 | **Arte de otro origen contamina el canvas** | `toBlob` falla en silencio | Láminas desde `self` |
| 12 | **Analítica duplicada** | `services/analyticsService.js` de GA + la de esta app, con consentimiento propio | Se descarta la de GA |
| 13 | **Iconos propios** | `Icons.jsx` (259 líneas) frente a `core/constants/icons.ts` y su e2e | Mapear a los de casa |
| 14 | **Nombres de componente que ya existen** | `ReviewScreen`, `ResultsScreen`, `GameCard`, `ErrorBoundary` viven ya en `socialhub/` y `stats/` | Prefijo `Premios*` y carpeta propia |

### A vigilar — dependen de cómo se implemente

| # | Riesgo | Por qué | Qué hacer |
|---|---|---|---|
| 15 | **Presupuesto de arranque** | 190 kB críticos / 240 kB totales (`scripts/ci-validate.js:111`). Ya pasó con los textos sociales: 8 kB viajaban al arranque de todo el mundo por un import | La porra entera perezosa; **ningún** módulo del arranque puede importar sus textos |
| 16 | **App Check y las lecturas públicas** *(por confirmar)* | Los resultados se leen **sin sesión**, y el comentario de `public/_headers` dice que reCAPTCHA solo se carga con sesión de Google iniciada. Si la exigencia de App Check está activada en la consola, esas lecturas anónimas podrían responder 403 | Comprobarlo en la consola **antes** de F2 y, si aplica, servir los resultados públicos por otra vía |
| 17 | **Service worker y despliegues** | Las pantallas perezosas solo funcionan sin red tras visitarlas una vez, y un `index.html` cacheado tras un despliegue puede dejar un chunk sin descargar (el fallo C1b que ya documenta `plan-feed-actividad-primera-resena.md`) | Manejar `vite:preloadError` en la sección y no dar por hecho que el chunk llega |
| 18 | **Pico de escrituras el día del cierre** | La porra concentra en horas lo que el resto reparte en meses | Contrastar con `plan-escalabilidad-firestore.md` y con las cuotas antes de abrir la primera edición |
| 19 | **La puerta legal no cubre al votante ligero** | `useSocialLegalConsent` vive en el hub social; el consentimiento se guarda en `publicConfig/{uid}.consent` | Reutilizar el mismo mecanismo desde la porra: misma versión, mismo documento, otra puerta |
| 20 | **Detectores de código muerto** | Los `export` nuevos de `model/repository/` disparan falsos positivos conocidos | No borrar nada de ahí sin preguntar, como ya manda `CLAUDE.md` |

### Comprobado y **sin** conflicto

- **Rate-limit de GitHub**: la porra es solo Firestore. No gasta ni una petición del techo de 5.000/hora que
  comparten la sincronización y el fan-out social.
- **Gists**: no se toca ninguno. Ni el de juegos ni el social cambian de forma.
- **Catálogo de logros y su espejo**: intactos; el palmarés va por otro carril (§2.3).
- **`_redirects`**: esta app ya tiene el catch-all que GA necesita (`/* /index.html 200`).
- **Rutas**: `/premios` está libre; no choca con `/logros` ni con `/stats`.
- **Migración de UID**: **no existe**, porque no se migran ni votos ni histórico. Era la fricción número uno del
  análisis inicial y la decisión de no migrar la ha eliminado entera.

---

## 12. Trampas conocidas

1. **No derives nunca un `optionId` del índice del array.** Borrar una opción y añadir otra reutilizaría el id de
   una superviviente y corrompería votos y recuento. `buildStableOptions()` existe por eso.
2. **No ablandes ni endurezcas un umbral del catálogo de logros** al añadir los derivados del palmarés: se añaden
   escalones, no se mueven los que hay.
3. **El puesto es denso, no la posición en la lista.** Dos empatados en primero y el siguiente es **segundo**. Por
   eso puede haber más de cinco premiados y nunca más de cinco títulos distintos.
4. **La fecha de cierre es un instante en `Europe/Madrid`**, y la validan las reglas. No la conviertas a UTC por el
   camino.
5. **No publiques reseñas ni datos privados por esta puerta**: la porra no toca el canal social ni su allowlist.
6. **Recalibra `gridDensity` con medidas reales**, no a ojo: su test comprueba el reparto sin fila huérfana.

---

## 13. Criterios de aceptación de la integración

La unificación **no está terminada** mientras alguna de estas ocho comprobaciones falle. Son la forma de comprobar
el principio rector sin discutir de gustos.

1. **Ni un `.jsx` ni una clase de Tailwind** en el repositorio, y `tailwindcss` no aparece en `package.json`.
2. **Una sola pantalla de inicio de sesión**, un solo `isAdmin()`, un solo error boundary por sección, un solo
   sistema de avisos, un solo mecanismo de tema. `grep` de `appTheme`, `appLanguage` y `AppContext` sin resultados.
3. **Cambiar de tema en Ajustes cambia `/premios`** — los ocho, en claro y en oscuro — y axe pasa AA en las doce
   combinaciones auditadas, con la porra incluida en el recorrido.
4. **El presupuesto de arranque no se mueve**: ningún módulo de la porra entra en el grafo crítico
   (`scripts/ci-validate.js`), igual que no entra el hub social.
5. **La barra inferior sigue teniendo cuatro pestañas** y su test de anchos sigue en verde.
6. **Los nominados se ven con la caja de la biblioteca**: la misma ranura de `GameCover` y la misma carátula
   servida por `/cover`. Es la comprobación de que las dos mitades se hablan, y la que ninguna capa de estilo puede
   fingir.

   *(Revisado el 24-09-2026.)* Ya **no** depende de la preferencia de imágenes: los nominados salen con carátula
   para todo el mundo. Se piden con `c=1` —solo lo ya resuelto— y las resuelve el panel al abrir la edición y al
   guardar cada categoría (`resolverCaratulasDeNominados`), así que votar no consulta IGDB ni escribe en KV.

   *(Revisado el 20-09-2026.)* Este punto pedía antes que en la tarjeta se reconociera **tu** juego —«lo
   terminaste, tu nota»—; esa marca se retiró (§6.5) y con ella se fue el único consumidor de
   `core/premios/library`. El criterio se sustituye por el cruce que **sí** está en pie, que además es el que se
   ve en cada categoría. Si algún día vuelve la marca personal, este punto recupera su forma original.
7. **Un solo despliegue, un solo proyecto de Firebase, un solo fichero de reglas**, y el dominio viejo redirige.
8. **Alguien que no sepa nada de esto no distingue** `/premios` del resto de la aplicación: mismo encabezado, misma
   letra, mismos botones, mismos mensajes de error y de falta de conexión, misma forma de volver atrás.
