# Revisión general — septiembre de 2026

> **Alcance:** seguridad, rendimiento, escalabilidad, modularidad, duplicación, código muerto, pruebas y
> documentación. Sobre `develop` en `391902a` (18-09-2026), con los cambios sin commitear del rediseño de la
> tarjeta de GitHub en el árbol de trabajo.
>
> ⚠️ **Documento vivo.** Los números de aquí se midieron; las líneas citadas se mueven. Antes de tocar algo,
> vuelve a medir y actualiza este fichero con lo que cambie.

## Cómo se midió

| Qué | Con qué |
|---|---|
| Tipos | `npx tsc --noEmit` y `npx tsc -p tsconfig.functions.json` (los dos en verde) |
| Estilo | `npx eslint src tests functions` → 0 errores, 2 avisos (`no-console` en `tests/setup.ts`) |
| Pruebas | `npm test` (2266 casos) y `npm run test:coverage` |
| Peso del bundle | `dist/assets/*` con `gzip -c` por fichero; composición del chunk de entrada leyendo `sources`/`sourcesContent` de su `.map` |
| Arranque y lista | Playwright contra `vite preview` (Chromium, 1440×900), con una biblioteca sembrada de 400 juegos en `localStorage` |
| Duplicación | `jscpd@4` sobre `src` (ts/tsx) y sobre `src/styles` (scss) |
| Código muerto | script propio: todo `export` de `src/**` sin ninguna aparición del identificador en otro fichero de `src`, `tests`, `functions` o `scripts` |
| Dependencias | `npm audit --omit=dev` y `npm audit` |
| Presupuesto de arranque | `npm run validate` (lo mide `scripts/ci-validate.js` sobre el precache del service worker) |
| Composición del chunk de entrada | script propio: decodifica los `mappings` del sourcemap y atribuye bytes GENERADOS (no de fuente) a cada módulo |
| Iconos que alcanza el arranque | script propio: grafo de arranque = entrada + `modulepreload` de `dist/index.html` → fuentes de sus sourcemaps → referencias a iconos en sus tres formas (literal, `COMMON_ICONS.*`, `href="#icon-…"`), excluyendo los ficheros que solo DECLARAN el catálogo |

## Veredicto

El proyecto está **sano y por encima de la media en las cosas que normalmente se encuentran podridas**: no hay
duplicación, no hay código muerto real, no hay marcadores `TODO`/`FIXME` pendientes (los 111 aciertos del grep
son la palabra castellana «TODO» en mayúsculas dentro de comentarios), la lista virtualizada aguanta 400 juegos
sin sudar, el borde de Cloudflare verifica los JWT de Firebase a mano y bien, y los tres incidentes históricos
de sincronización están cerrados con su porqué escrito en el código.

Lo que queda son **cuatro problemas de verdad** —uno de ellos de seguridad por omisión de la verja de CI— y una
lista de mejoras de segundo orden. Ninguno es una emergencia.

## Hallazgos

| # | Eje | Severidad | Hallazgo |
|---|---|---|---|
| 1 | Seguridad / CI | **Alta** | ~~CI no comprueba los tipos de `functions/` ni de `tests/integration`~~ · **✅ hecho (fase 1)** |
| 2 | Rendimiento | **Media** | ~~El árbol social se repinta con cualquier cambio~~ · **✅ hecho (fase 3)** — la causa real era el borrador del compositor, no la falta de `memo` |
| 3 | Escalabilidad | **Media** | ~~La válvula de desborde del gist está apagada y sus pruebas se saltan solas~~ · **✅ hecho (fase 2)** — y al encenderlas, una fallaba |
| 4 | Pruebas | **Media** | ~~La suite es inestable bajo carga~~ · **✅ hecho (fase 2)** — el reloj que agotaba era el de Testing Library, no el de vitest |
| 5 | Modularidad | Media | `useSocialViewModel` **2370 líneas** (desde 2453), 90 hooks · **2 dominios extraídos (fases 3 y 4)**, resto pendiente |
| 6 | Rendimiento | Baja | ~~El arranque lleva peso que no necesita~~ · **⚠️ parcial (fase 5)**: OAuth fuera; el peso real está en `IconSprite`, no donde decía este informe |
| 7 | CI | Baja | ~~Los 2266 casos se ejecutan dos veces por build~~ · **✅ hecho (fase 1)** |
| 8 | Cobertura | Baja | 79,4 % de líneas y 70,3 % de ramas, con los huecos justo en el camino de sync |
| 9 | Documentación | Baja | README con versiones caducadas; `package.json` en 1.3.2 con el CHANGELOG ya en 1.3.3 |
| 10 | Código muerto | Baja | 127 `export` sin consumidor externo; solo 2 son código inalcanzable · **+2 símbolos de icono sin ninguna referencia** (`uncharted`, `keyboard-arrow-up`, 1,6 kB) · **✅ borrados (fase 5)** |
| 11 | Documentación | Baja | ~~«Diseño» sin cuenta de Google~~ · **✅ es así a propósito**; lo que estaba mal era la entrada de la 1.3.3, corregida |
| 12 | Rendimiento visual | **Media** | ~~La barra inferior se quedaba muda según la máquina~~ · **✅ arreglado** — un pestillo de un solo sentido y una constante desincronizada del CSS; lo cazó CI · **2.ª pasada:** la barra de desplazamiento de Linux se comía 15 px y el salto a iconos se decidía por dos; peldaño intermedio |

---

### 1 · CI no comprueba los tipos de `functions/` ni de `tests/integration` · **Alta** · ✅ HECHO

`tsconfig.json` incluye solo `src/**` y `tests/**`, y **excluye `tests/integration`**. El paso de CI es
`npx tsc --noEmit`, así que la verja **no mira `functions/`**: los 2152 líneas del borde —canje de OAuth con el
`client_secret`, verificación del ID token de Firebase, cuotas de compartir y de carátulas, moderación— entran
en producción sin comprobación de tipos. El script `npm run typecheck` sí hace los dos proyectos
(`tsc --noEmit && tsc -p tsconfig.functions.json`), pero CI no lo usa.

Hoy los dos proyectos están en verde, así que no hay daño: el problema es que **nada lo garantiza mañana**, y el
código que queda fuera es precisamente el que tiene el secreto y valida la identidad.

**Arreglo aplicado** (fase 1): en `.github/workflows/ci.yml` el paso pasa a ser `npm run typecheck`, que
encadena `tsc --noEmit && tsc -p tsconfig.functions.json`. Los dos proyectos verificados en verde.
`tests/integration` sigue fuera del `tsconfig` principal, pero ya no queda sin mirar: lo compila el emulador
en `npm run test:rules`, que sí corre en CI.

### 2 · El árbol social se repinta entero · **Media** · ✅ HECHO

**PRIMERO, UNA CORRECCIÓN DE ESTE INFORME.** La primera pasada decía que «de los 17 componentes de
`socialhub/`, ninguno está envuelto en `memo`». Estaba mal: el recuento venía de un listado truncado. La cuenta
real es **21 ficheros, de los cuales 7 ya estaban memoizados** —y entre ellos los tres que más pesan:
`SocialFeedScreen`, `SocialProfilesScreen` y `SocialProfileDetailScreen`, más `PostText`, `RelatedReviews`,
`ProfileAchievements` y `ProfileReviewsList`—. El árbol social **no** se repintaba por falta de `memo` en las
pantallas.

**Lo que sí pasaba, medido.** Con 30 publicaciones en el feed y 5 pulsaciones en el compositor:

| Componente | Renders antes | Renders después |
|---|---|---|
| `HubAvatar` (uno por fila, más el propio) | **155** | **0** |
| `PostBody` (cuerpo de cada publicación) | **150** | **0** |
| `FeedShell` (armazón del feed) | 5 | **0** |

La causa no era la memoización sino **dónde vivía el borrador**: `composePostText` era estado de
`useSocialCompose` → `useSocialViewModel` → `SocialHub` → `SocialFeedScreen`, así que cada tecla recorría esa
cadena y rehacía la lista entera. Y el coste crece con el tamaño del feed: con 200 publicaciones son 200
tarjetas por pulsación.

**Arreglo aplicado** (fase 3):
1. **`FeedComposer`** (`src/view/components/socialhub/FeedComposer.tsx`): el borrador es estado LOCAL suyo, con
   su autocrecimiento y su contador. Sale de ahí solo al publicar.
2. **`handlePublishPost(text)` devuelve un booleano.** Antes vaciaba el cuadro él mismo
   (`setComposePostText('')`); ahora lo vacía el compositor **solo si salió**, que es lo que mantiene la promesa
   del aviso de sin-red: «el texto sigue aquí».
3. `composePostText`/`setComposePostText` **salen de la superficie del ViewModel**: 109 → 107 claves.
4. `memo` en `HubAvatar` (155 → 0 medido) y en `HubStatus` (dos cadenas, lo pintan las cinco pantallas).

**Lo que NO se memoiza, y por qué** —para que nadie lo «arregle» luego sin medirlo—:
`HubUserCard`, `HubScreen`, `HubUserSection` y `FeedShell` reciben `children` o un `renderItem` en línea, así que
`memo` no descartaría nunca; `FriendshipButton` recibe flechas nuevas por fila
(`onAddOrAccept={() => onAddOrAcceptFriend(entry.uid)}`), lo mismo; y las pantallas restantes se montan **de una
en una** (`activePanel`), así que memoizarlas no evita ningún repintado.

**Cobertura de lo que se movió:** `tests/component/FeedComposer.test.tsx` (6 casos) recoge lo que comprobaba el
hook sobre el estado del cuadro —se vacía al publicar, NO se vacía si no salió— más el contador por rango, el
tope del campo y Ctrl+Enter. `tests/unit/socialCompose.test.ts` pasa a comprobar el contrato del booleano.

### 3 · La válvula de desborde del gist está apagada · **Media** · ✅ HECHO

En `gistRepository.ts`: `ENABLE_GAMES_WRAPPER_WRITE = true` y `ENABLE_GAMES_COMPRESSION = true` (fases ya
activadas), pero `ENABLE_GAMES_OVERFLOW_GISTS = false`. Los tests que documentan esa fase se saltan solos
(`describe.skipIf(!ENABLE_GAMES_OVERFLOW_GISTS)` en `tests/unit/gistOverflow.test.ts`), así que **el camino de
desborde no se ejecuta nunca en CI**.

Con compresión y troceado dentro del mismo gist el margen es amplio, así que esto no es urgente. Importa por
**la forma del fallo**, que es la misma que costó un mes de sincronización a un usuario real (la reseña de
21 265 caracteres): al rebasar el tope, la escritura **aborta entera** y el síntoma que ve su dueño es «mis
listas dejaron de actualizarse», sin error. Un camino de rescate que no se prueba es un camino que no se sabe
si funciona el día que hace falta.

**Y al encenderlas, no pasaban.** Medido antes de arreglar nada: con el flag en `true`, una de las dos pruebas
gated falla (`expected 0 to be greater than or equal to 1` — no se creaba ningún gist de desborde) y la otra
pasaba **en vacío**, porque «no crea uno nuevo» se cumple trivialmente cuando el primero tampoco se creó.

**El fallo no estaba en el reparto, sino en el material de la prueba** —y es la misma lección que la reseña de
21 265 caracteres, otra vez—. La prueba rellenaba las reseñas con `'x'.repeat(900)`, y se escribió cuando la
escritura medía JSON PLANO. Desde que `ENABLE_GAMES_COMPRESSION` está activo se mide el tamaño REAL almacenado,
y 6,82 MB de la misma letra se comprimen hasta caber en un solo fichero: no había excedente que repartir.
Medido con el camino real de escritura:

| Dataset (7000–12000 juegos, reseñas de 900) | Chunks con presupuesto plano | Gists de desborde creados | Ficheros en el PATCH |
|---|---|---|---|
| `'x'.repeat(900)` — el de la prueba | 8 | **0** | 1 |
| ruido incompresible, 7000 juegos | 8 | **1** | 5 (ancla + 4) |
| ruido incompresible, 12000 juegos | 14 | **3** | 5 |

Es decir: **la válvula funciona**; lo que estaba roto era la prueba que debía vigilarla.

**Arreglo aplicado** (fase 2):
1. `makeIncompressibleData` en `tests/unit/gistOverflow.test.ts`: ruido con congruencial lineal de semilla fija
   (determinista, así el número de gists no baila), usado por las dos pruebas de escritura.
2. La prueba de reutilización **afirma su premisa** (`expect(afterFirst).toBeGreaterThanOrEqual(1)`), de modo que
   no puede volver a pasar en vacío.
3. Job `overflow-flag` en CI: enciende el flag con `perl` sobre su copia desechable del repositorio, **verifica con
   `grep -qx` que el cambio se aplicó** —si alguien reformatea la línea, el job falla en vez de pasar sin probar
   nada— y corre esa batería. Va aparte para no alargar el job principal.

Verificado: 6 de 6 en verde con el flag encendido, y las dos de escritura tardando 1218 ms y 1740 ms, que es el
trabajo real de repartir. El flag de producción sigue en `false`.

### 4 · La suite es inestable bajo carga · **Media** · ✅ HECHO

Primera ejecución de `npm test`: `2 failed | 193 passed` ficheros, `5 failed | 2259 passed | 2 skipped` casos.
Los dos ficheros (`SocialHub.test.tsx`, y el nuevo `GithubSyncCard.test.tsx`) **pasan aislados** (79 casos en
verde) y la **segunda ejecución completa pasó entera** sin tocar una línea. El fallo era un `findByText` que
agota su espera, es decir, contención, no lógica.

La causa de fondo la canta Vitest al terminar: *«Environment jsdom was created 195 times · 122.48s total, 48%
of tracked time»*. Casi la mitad del presupuesto se va en montar entornos, y `SocialHub.test.tsx` —el fichero de
pruebas más grande del repositorio, 127 KB— compite por CPU con los otros 194.

**La causa exacta, medida:** el reloj que agotaba **no era el de vitest** (`testTimeout`, 5 s por defecto) sino
el de Testing Library, que trae **1000 ms** — así que subir el de vitest no habría arreglado nada.

**Arreglo aplicado** (fase 2):
1. `configure({ asyncUtilTimeout: 3000 })` en `tests/setup.ts`. Margen de sobra para la contención sin tapar un
   fallo: un elemento que no va a aparecer sigue fallando, solo tarda dos segundos más.
2. `testTimeout: 10_000` en `vitest.config.js`, **por encima** del anterior a propósito: así el que salta primero
   es el de Testing Library, cuyo error nombra el elemento que falta, en vez del «test timed out» de vitest, que
   no dice dónde mirar.

**`pool: 'vmThreads'` DESCARTADO, con la prueba delante.** No es que no mejorara: **rompe la suite**. Corriendo
con ese pool fallan de golpe `crypto.test.ts` (7/7), `gistWrite.test.ts` (6/6), `gamesSyncBudget.test.ts` (4/4),
`gistCompression*.test.ts` (14 casos), `dateTime.test.ts` y `socialFeedDayGroups.test.ts`. El motivo es el
esperado de un contexto `node:vm`: los globales del realm no son los mismos, y el primer síntoma es
`TypeError: Cannot read properties of undefined (reading 'importKey')` dentro de `deriveKey` — es decir,
**`crypto.subtle` no existe** ahí. Con eso caen el cifrado del token, la compresión gzip del gist y el manejo de
zonas horarias. No se vuelve a intentar sin resolver antes los globales del realm.

**Resultado:** tres ejecuciones completas seguidas en verde —26,17 s, 26,09 s y 26,10 s, 195 ficheros, 2265 casos
y 2 saltados— contra 26,73 s de la línea base. El margen extra **no cuesta tiempo cuando la suite pasa**, porque
solo espera quien está a punto de fallar. El 47 % de entorno sigue ahí: es el precio de un jsdom por fichero, y
la vía para bajarlo es partir los ficheros grandes (hallazgo 5), no cambiar de pool.

### 5 · Dos piezas hacen demasiado · Media

| Fichero | Líneas | Señal |
|---|---|---|
| `src/viewmodel/useSocialViewModel.ts` | 2453 | 94 hooks, 43 imports, 109 claves devueltas |
| `src/App.tsx` | 1155 | 52 hooks; 56 KB de fuente en el chunk de entrada |
| `src/view/components/GameTable.tsx` | 1372 | 26 props; 87 KB de fuente en el chunk de entrada |
| `src/styles/stats.scss` | 3225 | la hoja más larga (va en chunk perezoso, no en el arranque) |

El refactor que está ahora en el árbol de trabajo va **en la dirección correcta**: extraer `GithubSyncCard` +
`githubConnection` quita 249 líneas de `SettingsHub.tsx` y las comparte con `SocialHub`. Es el patrón a repetir
con el view-model social.

### 6 · El arranque lleva peso que no necesita, y el presupuesto está al 96 % · Baja

Medido (gzip): **161,7 KB de JS** y **25,8 KB de CSS** en el arranque, en 13 chunks precargados. De los 61,4 KB
del chunk de entrada, esto no hace falta para pintar la lista:

| Fuente en el chunk de entrada | Bytes de fuente | Cuándo se necesita de verdad |
|---|---|---|
| `core/security/crypto.ts` | 13 170 | solo al conectar o descifrar el token de GitHub |
| `core/announcement/announcement.ts` + `useAnnouncement.ts` | 23 266 | avisos: nunca en el primer pintado |
| `model/repository/githubOAuthRepository.ts` | 9 260 | solo en el retorno de OAuth |
| `view/hooks/useCoverBackfill.ts` + `coverDone` + `coverMemory` | 29 296 | recorrido de carátulas, ya diferido a idle |

Y el margen es estrecho: el presupuesto de arranque que ya vigila `scripts/ci-validate.js`
(`BOOT_CRITICAL_BUDGET_KB = 190`) va al **96 % de su tope** — el propio `npm run validate` lo canta:
«crítico 182,8/190 kB · total 218,8/240 kB (comprimidos)». Quedan 7,2 kB de holgura en el camino crítico, así
que la próxima pantalla que entre al grafo de arranque rompe el build.

Mover ese grupo a un chunk cargado en `idle` (el proyecto ya tiene `runWhenIdle` y el patrón de precarga de
modales) debería quitar del camino crítico del orden de 15–20 KB gzip sin cambiar ninguna funcionalidad.

**Lo que NO es un problema, y conviene no volver a levantarlo:** los 72 `.map` (7 MB) que se publican con el
deploy. Está decidido y escrito en `vite.config.ts`: el código es GPL y público, los mapas no revelan nada que
no esté en el repositorio, y sirven para leer los stacks de telemetría.

### 7 · CI ejecuta la suite dos veces · Baja · ✅ HECHO

`Run unit tests` (`npm run test -- --reporter=verbose`) y `Run tests with coverage` (`npm run test:coverage`)
corrían **los mismos casos**. Se duplicaba el tiempo y la exposición al hallazgo 4.

**Arreglo aplicado** (fase 1): queda un solo paso, `npm run test:coverage -- --reporter=verbose` (reporta igual y
ya tenía `reportOnFailure: true`), y el navegador de Playwright se cachea con `actions/cache@v6` por versión de
`@playwright/test` en vez de descargar Chromium en cada build. Verificado: 195 ficheros, 2265 casos en verde y
2 saltados, con el paso de tipos de los dos proyectos delante.

### 8 · Cobertura: los huecos están en el camino de sync · Baja

Total: **79,4 % de líneas** (11 108/13 992) y **70,3 % de ramas** (8579/12 202). Los peores, entre los ficheros
de más de 100 líneas ejecutables:

| Fichero | Líneas cubiertas |
|---|---|
| `view/components/stats/GenreBump.tsx` | 22,1 % |
| `model/repository/socialActivityHistory.ts` | 30,9 % |
| `view/components/roulette/RouletteModal.tsx` | 41,5 % |
| `App.tsx` | 57,2 % |
| `model/repository/gistRepository.ts` | 67,4 % |
| `model/repository/socialGistRepository.ts` | 69,6 % |
| `viewmodel/useSyncViewModel.ts` | 74,3 % |

Los tres últimos son los que importan: son exactamente donde han vivido los incidentes de pérdida de datos y de
sincronización que no propaga. El resto (gráficas, ruleta) es aceptable.

### 9 · Documentación desfasada · Baja

- `package.json` está en **1.3.2** y el CHANGELOG ya tiene `[1.3.3] - 2026-09-18` cerrada. El propio README
  advierte de que la versión se hornea en `__APP_VERSION__` y etiqueta la telemetría: sin subirla, los errores
  del despliegue nuevo se atribuyen al anterior.
- README: decía `react ^19.2.0` (está fijado en `19.3.0`), `vitest ^4.1.5` (es `^5.0.0`), **Node ≥ 20** en dos
  sitios (`engines` pide `>=22.16.0`) y `npm run typecheck` como «`tsc --noEmit`» (son dos proyectos).
  **Corregido en esta pasada.**
- `CHANGELOG.md` (176 KB) y `docs/plan-logros.md` (166 KB) en un solo fichero cada uno. No estorba a nadie
  todavía; el día que estorbe, se archiva por versiones (`docs/changelog/1.2.md`…).

### 10 · Código muerto: prácticamente no hay · Baja

127 `export` de `src/**` no tienen ninguna aparición fuera de su propio fichero. Al mirarlos uno a uno:

- **~105 son tipos e interfaces** (props de componentes, formas de retorno de hooks). Documentan una frontera;
  borrarlos no quita ni un byte del bundle.
- **~20 son constantes o funciones que sí se usan dentro de su fichero** (`FEATURED_MAX`, `MIN_HISTORY_POINTS`,
  `TOMBSTONE_RETENTION_MS`, `labelGroups`, `saveSyncDirtyState`, `SOCIAL_SHARED_CHUNK_MAX_KB`…). Lo sobrante es
  la palabra `export`, no el código.
- **2 son código inalcanzable de verdad:** `reiniciarMotorDeSync` (`syncEngine.ts:45`) y `parseImportedData`
  (`localRepository.ts:453`).

Los dos inalcanzables están en `src/model/repository/`, que es **zona de staging de la migración**: ahí hay
exports a propósito esperando a la fase que los usa, y hay falsos positivos conocidos de knip. **No se borra
nada de `model/repository` ni de `model/types` sin preguntar.**

### 11 · «Diseño» pide cuenta de Google para abrirse · ✅ ES ASÍ A PROPÓSITO (confirmado por el mantenedor)

Salió al escribir el recorrido de iconos, que no podía llegar a esa pantalla: el menú **esconde el grupo
«Diseño»** sin perfil social (`SettingsMenu.tsx:117`, `PUNTOS.filter((p) => p.group !== 'design')`) y
`App.tsx:244` **redirige fuera** de `/ajustes/diseño` en ese caso.

**Es deliberado**, y el motivo está en lo que comparte pantalla: la escala de nota y los enlaces publicados son
cosas de la cuenta. Sin ella, el cambio de tema sigue accesible arriba a la derecha.

**Lo que sí estaba mal era el CHANGELOG**, no el código: la 1.3.3 anunciaba que «la apariencia ya no se bloquea
sin cuenta de Google», y lo que aquel arreglo hizo fue sacar los interruptores de dentro de la tarjeta de la
escala —que los apagaba con ella— sin tocar la puerta de la pantalla. Corregido en esa misma entrada, con lo que
NO cambia dicho en voz alta.

**Consecuencia para las pruebas:** el recorrido de iconos cubre listados, hub social, estadísticas, Filtros y
Datos; los iconos de Diseño los cubre el recorrido de accesibilidad, que sí abre sesión.

### 12 · La barra inferior se quedaba muda según la máquina · **Media** · ✅ ARREGLADO

**Lo cazó la integración continua**, que es Linux, en un recorrido que en local pasaba: `bottomNav.test.ts`, «en
un móvil normal caben las cuatro CON su nombre a la vista» → la barra salía en `is-icons` a 390 px. Y no era un
fallo de la prueba: eran **dos** fallos del componente que se tapaban entre ellos.

**1) Un pestillo de un solo sentido.** `BottomNavigation` decide el escalón midiendo, y las medidas solo se
pueden tomar donde el rótulo está a la vista. El código solo las tomaba estando en `row`:

```js
if (layoutRef.current === 'row') { …mide lo que necesita… }
const next = column >= row ? 'row' : column >= stack ? 'stack' : 'icon';
```

La primera medida cae con la tipografía de RESERVA del sistema —y la de Linux es más ancha que la de macOS—, así
que en CI bajaba a `icon`. Había un rescate previsto (`document.fonts.ready.then(measure)`), pero **no podía
funcionar**: al volver a medir ya no estaba en `row`, así que reusaba los números malos y volvía a decidir lo
mismo. En `icon` el rótulo está fuera de pantalla y no hay nada que medir. Resultado: barra muda en un móvil
normal, en unas máquinas y no en otras. Trazado en el navegador: `row(rótulo 78, reserva) → stack(69) → 79 >
76,8 → icon`, y tras la fuente buena, otra vez `icon` con los mismos números.

**2) Una constante desincronizada del CSS.** `STACK_FONT_RATIO = 0.73 / 0.86` estimaba el ancho del rótulo
apilado multiplicando el de una línea por `--fs-2xs / --fs-sm`. Pero en pantalla estrecha
(`@media (max-width:620px)`) el rótulo de una línea **no es `--fs-sm`, es `--fs-xs`**, así que la estimación se
quedaba un 8 % corta. El propio comentario de la constante advertía «si allí cambia el cuerpo, aquí cambia el
número» — y no cambió. Efecto medido: a 370 px la barra decía «cabe» y el rótulo se quedaba con 8 px de aire,
por debajo de los 10 que el componente promete.

**El arreglo, en tres piezas:**
1. **La constante desaparece.** El escalón apilado ya no se estima: se mide **en dos pasadas** — en `row` se mide
   el ancho de una línea; si no cabe, se pasa a `stack` y se vuelve a medir en el siguiente fotograma, cuando el
   rótulo ya está apilado y con su cuerpo real. No puede oscilar (la columna mide igual en los tres escalones,
   así que cada pasada solo puede bajar) y termina siempre. Y no queda ningún número que mantener a mano en
   sintonía con la hoja de estilos, que es lo que falló.
2. **`remeasure()`**: cuando cambia lo que MIDE el texto —la tipografía que llega, el ajuste de mayúsculas— se
   vuelve al escalón de arriba y se mide desde ahí, en vez de re-decidir con medidas viejas. Eso es el pestillo.
3. **Sitio de verdad para el rótulo en móvil** (`@media (max-width:620px)`): aire de la barra 0,9 → 0,7 rem,
   hueco entre pastillas 0,4 → 0,3 rem y sin `letter-spacing` en el rótulo apilado, que a 11,7 px no se aprecia.
   Suman ~4,5 px por columna. Hacía falta porque con la cuenta honesta un iPhone SE (375 px) **perdía** los
   rótulos: la columna medía 78 px y la palabra pedía 79.

**Medido, barriendo anchos sobre el build:**

| Ancho | Antes | Ahora |
|---|---|---|
| 375 px (iPhone SE) | apilado, 8 px de aire (promesa: 10) | **apilado, 12 px** |
| 390 px (el más común) | apilado, 13 px de aire y **2,8 px** de margen en la decisión | **apilado, 16 px y ~6 px de margen** |
| 280 px (el suelo) | solo iconos, sin desbordar | igual |
| 620 px+ | una línea | igual |

El margen de 390 px es lo que hacía que CI y local discreparan: con 2,8 px, cualquier diferencia de renderizado
decide. Con 6 px, no.

**Guarda nueva:** `bottomNav.test.ts` añade el caso de **375 px**, que es el que la cuenta decide por los pelos
—y por tanto el primero que se cae si alguien recorta el sitio de la barra— mientras el de 390 podría seguir en
verde.

**SEGUNDA PASADA (mismo día): seguía en rojo en CI, y por una razón que no era la tipografía.** Los dos casos
—390 px y 375 px— volvieron a salir `is-icons` con todo verde en local. Lo que no se había visto: **en el Linux
del CI la barra de desplazamiento es de las que ocupan sitio y se come ~15 px de ancho**; en macOS flota sobre el
contenido y no cuesta nada. Así que allí el caso de 390 medía en realidad 375, y el del iPhone SE medía 360 —un
ancho en el que la barra no prometía los cuatro nombres—. Medido sobre el build: la columna sale de
`(ancho − 51,6) / 4`, y «Estadísticas» apilada pide 79 px → a 375 caben por 1,9 px y a 360 faltan 1,9.

Dos arreglos, uno en la prueba y otro en el producto:

1. **La prueba mide lo que dice.** `abrir()` ensancha el viewport lo que se lleve la barra de desplazamiento,
   de modo que `documentElement.clientWidth` sea exactamente los px del título del caso en cualquier máquina; y
   la comprobación de que la barra no sobresale usa ese ancho útil, no `innerWidth`.
2. **Un peldaño más antes de quedarse muda** (`tight`): si el rótulo apilado no cabe, se encoge un punto
   (`--fs-2xs` → `--fs-3xs`, ~5 px por columna) y solo si ni así entra se va a iconos. El salto de cuatro
   nombres a ninguno dejaba de decidirse por dos píxeles, que es lo que hacía que el mismo ancho saliera distinto
   en dos máquinas.

Además, el medidor ya no se fía de `layoutRef` para saber en qué escalón está midiendo: **lee las clases que la
barra tiene PINTADAS**. `aplicar()` solo pide el cambio a React; si la medida se tomaba antes del repintado, el
rótulo se medía con el cuerpo del escalón anterior —un 8 % más ancho— y la barra bajaba un escalón de más.

**Barrido sobre el build, después:** con nombre a la vista desde **348 px** (antes, 375); 355 → apretado con
11,9 px de aire; 365 → apretado, 14,4; 370-400 → apilado normal, 10,6-18,1; 620+ → una línea. Por debajo de 348
sigue siendo iconos, sin desbordar y con sus dianas de 48 px.

**Guarda nueva:** `bottomNav.test.ts` añade el caso de **365 px**, que es el que ejercita el peldaño apretado.

**Lo que esto NO cubre:** por debajo de ~348 px la barra sigue quedándose en iconos, que es el suelo de 280 px
prometido y comprobado. Y no se ha medido cuánto mide «Estadísticas» en el Linux del CI: si allí el texto pide
algún píxel más, ahora lo absorbe el peldaño apretado en vez de dejar la barra muda.

## Lo que se comprobó y está bien

Para no repetir el trabajo en la próxima pasada:

- **Duplicación: no hay.** jscpd: 0,18 % en TS/TSX (6 clones, ninguno mayor de 19 líneas) y 0,61 % en SCSS
  (4 clones, tres de ellos en los `_fonts.scss` de los temas, donde la repetición es la declaración `@font-face`).
- **Rendimiento de la lista: medido y sano.** Con 400 juegos sembrados: 10 filas en el DOM (virtualización
  activa), FCP 64 ms, 33 ms por pulsación en el buscador (incluye dos `requestAnimationFrame` de espera, ≈32 ms),
  51 ms para 8000 px de scroll y 19 filas en el DOM después.
- **Dependencias de producción: 0 vulnerabilidades.** Las 8 moderadas son de `firebase-tools` y su cadena
  (`@google-cloud/pubsub`, `csv-parse`, `re2`, `uuid`…), solo `devDependencies`; CI ya las trata como
  informativas.
- **Sin sumideros de XSS.** Un único `innerHTML` (`useSignatureEffects.ts:106`) y su interpolación son tres
  literales del propio código (`'signature'`, `'check'`, `'star-olive-branches'`). Ni `eval`, ni
  `dangerouslySetInnerHTML`, ni `document.write`.
- **El borde está bien hecho.** `verifyIdToken` comprueba RS256, `kid` vigente, firma, `iss`, `aud`, expiración,
  `iat` futuro y `sub`, con JWKS cacheado en KV y sin cuenta de servicio. `/api/github-oauth` exige `Origin` ==
  propio origen y que el `redirect_uri` sea de esta app. `/cover` tiene cuota por IP. `readJson` mide bytes de
  verdad, no unidades UTF-16.
- **Cabeceras:** CSP sin `unsafe-eval` ni comodines en `script-src`, HSTS, `X-Frame-Options: DENY`, COOP/CORP,
  `Permissions-Policy`. Cada excepción está justificada en el propio `_headers`.
- **Fan-out acotado.** El directorio social lee los gists con `mapWithConcurrency` + caché de sesión y
  revalidación por ETag, y degrada a «index-only» a los amigos inactivos. Las fases 1 y 2 del plan de
  escalabilidad de Firestore están implementadas.
- **Persistencia local:** la escritura a `localStorage` está diferida con volcado pendiente servido desde
  memoria, y avisa una vez si la cuota revienta en vez de callarse.
- **Sin fugas de temporizadores ni de escuchas en componentes.** Los cuatro ficheros con más `addEventListener`
  que `removeEventListener` son de ámbito de aplicación (`main.tsx`, `appUpdate.ts`, `localRepository.ts`), que
  viven lo que vive la pestaña.
- **Higiene del repositorio:** `firestore-debug.log` (871 KB), `myGames.json` (255 KB, datos reales),
  `audit-report.json`, `.dev.vars`, `.covers.local.json`, `dist/`, `coverage/` y `test-results/` están todos
  ignorados y ninguno trackeado.
- **El directorio `base/`** (4,8 MB, copia del proyecto anterior) no está en git: es solo residuo local.

## Plan

### Fase 1 — La verja · ✅ COMPLETADA (18-09-2026)

1. ✅ `.github/workflows/ci.yml`: `npx tsc --noEmit` → `npm run typecheck`. *(Hallazgo 1)*
2. ✅ Quitado el paso `Run unit tests`; queda `npm run test:coverage -- --reporter=verbose`. *(Hallazgo 7)*
3. ✅ `actions/cache@v6` sobre `~/.cache/ms-playwright`, con clave por versión de `@playwright/test`. *(7)*
4. ⏸️ Subir `package.json` a `1.3.3`: **lo hace el mantenedor al desplegar**, no el plan. *(Hallazgo 9)*

**Criterio de aceptación — cumplido.** Con los comandos exactos del workflow: `npm run typecheck` en verde (los
dos proyectos), `npm run test:coverage -- --reporter=verbose` en verde (195 ficheros, 2265 casos, 2 saltados),
`npm run validate` con 0 errores, y el YAML parseado: 17 pasos, uno menos de tests y dos nuevos de caché.

### Fase 2 — Estabilidad de las pruebas · ✅ COMPLETADA (18-09-2026)

5. ✅ `asyncUtilTimeout: 3000` (Testing Library) + `testTimeout: 10_000` (vitest), que es el par correcto: el
   reloj que agotaba era el primero. *(Hallazgo 4)*
6. ✅ `pool: 'vmThreads'` probado y **descartado**: rompe 35+ casos porque `crypto.subtle` no existe en el
   contexto `node:vm`. Anotado arriba con el detalle. *(4)*
7. ✅ Job `overflow-flag` en CI **más el arreglo de la prueba**, que estaba caduca desde que se activó la
   compresión. *(Hallazgo 3)*

**Criterio de aceptación — cumplido.** Tres ejecuciones completas seguidas sin un solo fallo (26,17 / 26,09 /
26,10 s) y `gistOverflow.test.ts` ejecutándose de verdad —no saltado, y ya no en vacío— en su propio job.

### Fase 3 — Repintado del espacio social · ✅ COMPLETADA (18-09-2026)

8. ✅ Medido primero: el problema no era `memo` en las pantallas (7 de 21 ya lo tenían, incluidas las tres
   gordas) sino el borrador del compositor viajando por todo el hub. *(Hallazgo 2)*
9. ✅ `FeedComposer` con estado local + `memo` en `HubAvatar` y `HubStatus`, con la medición antes/después en la
   tabla de arriba.

**Criterio de aceptación — cumplido.** 0 repintados de avatares, cuerpos de publicación y armazón del feed por
pulsación (antes 155 / 150 / 5), suite completa en verde (196 ficheros, 2271 casos), cobertura de líneas 79,44 %
(sube desde 79,38 %) y el recorrido end-to-end —incluidas las 16 combinaciones de tema y paleta con axe— sin
regresiones.

**Método de medición, para repetirlo:** un fichero de prueba temporal que renderiza `SocialFeedScreen` con 30
publicaciones y envuelve `HubAvatar`/`PostBody`/`FeedShell` con `vi.mock` en un contador; se dispara `change`
sobre el `textarea` cinco veces y se cuenta. El contador va **por fuera** del componente real, así que lo que
mide es lo que el padre le pide pintar.

### Fase 4 — Partir el view-model social · ⏸️ DOS DOMINIOS HECHOS, en pausa para revisión

10. **Dominios extraídos** (uno por pasada, con su fichero de pruebas propio):
    - ✅ **El compositor** (fase 3): `FeedComposer` se queda el borrador; el hook baja a `publishingPost` + el
      contrato del booleano. `tests/component/FeedComposer.test.tsx`, 6 casos.
    - ✅ **Los listados ajenos** (fase 4): `social/useForeignProfileGames.ts` (173 líneas) con la caché por
      perfil, el efecto que la llena, el refresco manual y `getGameItemById`.
      `tests/unit/foreignProfileGamesHook.test.ts`, 8 casos, que afirman las tres reglas de privacidad
      —solo de amistades, recorte al guardar, un fallo se apunta— que antes solo se ejercitaban de refilón.
    - ⏸️ **Pendientes**, en este orden por tamaño y frontera: el **detalle de una actividad**
      (`activeDetailEvent`, las dos esperas, los tres abridores y el ancla de relacionadas, ~190 líneas
      interconectadas con `selectedProfileDetail`), la **vitrina de logros** (espejo propio + publicación) y la
      **ficha de un perfil ajeno**.
11. ⏸️ `App.tsx`: los hooks de sesión (`use*Session`) a `viewmodel/`. Sin empezar.

**Estado medido:** `useSocialViewModel` pasa de **2453 a 2370 líneas** y de 94 a 90 hooks. Las 106 claves de su
superficie apenas bajan (eran 109) porque lo extraído sigue **reexportándose** hacia las pantallas: el hook es
hoy, en buena parte, una FACHADA sobre diez hooks de dominio. Adelgazar la fachada es el trabajo del punto 11,
no el de sacar dominios.

**Criterio de aceptación (sin cumplir todavía):** ningún fichero de `src/viewmodel/` por encima de 800 líneas y
`SocialHub.tsx` recibiendo piezas en vez de 106 claves.

### Fase 5 — Arranque y cobertura · ⚠️ PARCIAL, y con una corrección de este informe

**LA ESTIMACIÓN DE ESTA FASE ESTABA MAL, y el error se ve en la tabla del hallazgo 6: contaba BYTES DE FUENTE,
comentarios incluidos.** Medido sobre el bundle minificado —decodificando los `mappings` del sourcemap del chunk
de entrada para atribuir bytes generados a cada fuente—, el reparto real es otro:

| Fuente en el chunk de arranque | Bytes MINIFICADOS | % del chunk (177,8 kB) |
|---|---|---|
| `view/components/IconSprite.tsx` | **28 369** | 16 % |
| `view/components/GameTable.tsx` | 17 904 | 10 % |
| `App.tsx` | 14 837 | 8 % |
| `viewmodel/useSyncViewModel.ts` | 10 342 | 6 % |
| `core/security/crypto.ts` | 2 594 | 1,5 % |
| `model/repository/githubOAuthRepository.ts` | 2 528 | 1,4 % |
| `view/hooks/useAnnouncement.ts` + `core/announcement/announcement.ts` | 3 223 | 1,8 % |

Es decir: los candidatos de esta fase sumaban **~5,7 kB minificados (~2 kB gzip)**, no los 15–20 kB gzip que
decía el plan. Lo hecho y lo descartado, con ese dato delante:

12. ✅ **OAuth partido en dos.** `model/repository/githubOAuthChecks.ts` se queda las tres preguntas baratas que
    la app hace SIEMPRE (¿hay OAuth App?, ¿venimos de un retorno?, ¿de qué pantalla salimos?) y el trabajo
    —montar la autorización, generar y verificar el `state`, canjear el `code`— entra por `import()` en
    `useSyncViewModel`, con el mismo patrón que `cargarMotorDeSync`. **Medido: crítico 182,8 → 182,2 kB**
    comprimidos; la holgura del presupuesto pasa de 7,2 a 7,8 kB.
13. ❌ **Los avisos NO se sacan, y por qué.** Su política se llama desde un inicializador de `useState`
    (`parseSeen`, al montar), así que no puede ser dinámica sin mover el hook entero detrás de un componente
    perezoso — y eso **costaría una petición extra en el caso normal** (no hay aviso que enseñar casi nunca) a
    cambio de ~0,35 kB gzip. Mal cambio; se queda como está.
14. ⏸️ **Cobertura de los tres ficheros de sync**: sin empezar. Sigue en 74,3 / 67,4 / 69,6 % de ramas.

15. ✅ **`IconSprite` partido en dos** (era la palanca de verdad: 28,4 kB minificados, el mayor del arranque).

**La medición primero, que es la mitad del trabajo.** El grafo de arranque se lee **del build**: el script de
entrada de `dist/index.html` más sus `modulepreload`, y de cada chunk, las fuentes que declara su sourcemap — 13
chunks, 141 ficheros de `src/`. Sobre esas fuentes se buscan las referencias a iconos en sus tres formas
(literal del catálogo, alias `COMMON_ICONS.*` y `href="#icon-…"` a pelo, que es como pintan la silueta `HubAvatar`
y el dado de la ruleta `App`). El script está en la sección «Cómo se midió».

| Grupo | Símbolos | Marcado |
|---|---|---|
| Los dibuja el **arranque** | 36 | 17,9 kB |
| **Solo pantallas perezosas** | 13 | 6,4 kB |
| **Sin ninguna referencia** (`uncharted`, `keyboard-arrow-up`) | 2 | 1,6 kB · **borrados** |

Dos trampas que la medición evitó y un `grep` no habría:
- **El catálogo se cuenta a sí mismo.** `core/constants/icons.ts` está en el arranque y lleva los 51 nombres en
  su unión de tipos, así que la primera pasada decía «los 51 los usa el arranque». Los ficheros que DECLARAN no
  cuentan como uso.
- **El aviso del administrador puede pintar iconos del sprite general** (`ANNOUNCEMENT_ICONS`: `bell`, `star`,
  `rocket`, `trophy`, `dice-d20`, `checkered-flag`, `share-nodes`, `signature`), y su cápsula sale a los pocos
  segundos del arranque. Quedan cubiertos sin hacer nada porque `announcement.ts` vive en el arranque y su
  allowlist cuenta como referencia — pero de haberlos movido, un aviso habría salido con el disco vacío.

**Lo implementado.** Los dos símbolos sin referencia **se borraron** —del sprite y del catálogo `IconName`, con
su alias de `COMMON_ICONS`—, así que el reparto final es 36 en el arranque y 13 en `IconSpriteRest`, montado **una sola vez desde `App` y en idle**
(`lazy()` lo saca del chunk; el idle evita que su descarga compita con el primer pintado). NO se sigue el patrón
de `AchievementSprite` —que lo monta cada pantalla, con relevo por orden de llegada— y la razón es a quién sirve
cada uno: aquel lo piden cinco pantallas que nunca coinciden; estos 15 los necesitan una decena de sitios
repartidos, incluidos modales que se abren encima de cualquier pantalla. Un solo montaje no se puede olvidar.

**Medido después:** `IconSprite` pasa de **28 369 a 19 895 bytes minificados** (−30 %) y el chunk de entrada de
180,3 a **172,1 kB** (gzip 61,3 → **58,0**). El crítico del presupuesto: **182,2 → 179,1 kB**, con la holgura
subiendo de 7,8 a **10,9 kB**. El chunk nuevo pesa 8,6 kB (3,5 gzip) y llega en idle, fuera del precache.

**Y la red que hace esto mantenible**, porque el reparto es invisible en el código (`<Icon name="gear" />` se
escribe igual esté donde esté) y un icono en la mitad equivocada **no da ningún error: pinta un hueco**:
- `tests/unit/iconSprite.test.ts`: cada nombre del catálogo está declarado **exactamente una vez** entre los dos
  sprites, ninguno sobra, y los filtros del `<defs>` siguen en el del arranque (los referencia el CSS).
- `tests/e2e/iconos.test.ts`: sobre el build, recorre listados → hub social → estadísticas → dos grupos de
  ajustes y comprueba que **ningún `<use>` de la página apunta a un símbolo ausente**. Empieza por el arranque a
  propósito: es el instante en que el sprite perezoso puede no haber llegado, y por tanto cuando un icono mal
  colocado saldría hueco.

**La tercera vía (`.svg` externo) sigue descartada** para esta pasada: quitaría los 28 kB de golpe, pero la CSP
tiene `default-src 'none'` y un `<use>` externo se pide como documento —se quedaría sin iconos en producción
funcionando bien en local—, el CSS del documento no estiliza el contenido clonado, y habría que meterlo en el
precache. Es un cambio para probar en un despliegue de vista previa, no a ciegas.

**Criterio de aceptación:** el arranque baja de 182,8 a **179,1 kB** críticos (−2 %) sin perder funcionalidad, y
la holgura del presupuesto casi se dobla. Los tres ficheros de sync siguen por debajo del 80 % de ramas (punto
14, sin empezar).

## Lo que NO se hace

- **No se borran los `export` «sin usar» de `model/repository` ni de `model/types`.** Son staging de migración y
  hay falsos positivos conocidos. Los dos inalcanzables (`reiniciarMotorDeSync`, `parseImportedData`) se
  consultan antes de tocarlos.
- **No se retiran los sourcemaps del deploy.** Decisión tomada y documentada en `vite.config.ts`.
- **No se persigue la duplicación.** Con 0,18 % no hay nada que extraer que no empeore la lectura.
- **No se añade una regla de ESLint que prohíba a `view/` importar repositorios.** Ya se intentó y la medición la
  tumbó: la regla describía otra arquitectura (ver README, «Dónde la práctica se separa del esquema»).
