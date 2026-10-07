# Revisión general — septiembre de 2026

> **Alcance:** seguridad, rendimiento, escalabilidad, modularidad, duplicación, código muerto, pruebas y
> documentación. Sobre `develop` en `391902a` (18-09-2026), con los cambios sin commitear del rediseño de la
> tarjeta de GitHub en el árbol de trabajo.
>
> ⚠️ **Documento vivo.** Los números de aquí se midieron; las líneas citadas se mueven. Antes de tocar algo,
> vuelve a medir y actualiza este fichero con lo que cambie.
>
> **Remedido el 01-10-2026** sobre `develop` en `4a68dc73` (1.5.0), con los mismos comandos: tipos de los dos
> proyectos en verde, ESLint con los mismos 2 avisos, **3116 casos en 274 ficheros** (2 saltados), cobertura
> **80,3 % de líneas y 71,4 % de ramas**, y el arranque **al 97,6 % de su presupuesto** (hallazgo 14, recuperado
> ese mismo día hasta 180,2/190 kB). Hay dos
> hallazgos nuevos (13 y 14); las cifras antiguas se dejan donde explican una decisión, con la de hoy al lado.

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
| 5 | Modularidad | Media | `useSocialViewModel` **2373 líneas** (desde 2453) · **2 dominios extraídos (fases 3 y 4)**, resto pendiente · `useSyncViewModel` ya pasa de 1000 (1097) |
| 6 | Rendimiento | Baja | ~~El arranque lleva peso que no necesita~~ · **⚠️ parcial (fase 5)**: OAuth fuera; el peso real está en `IconSprite`, no donde decía este informe |
| 7 | CI | Baja | ~~Los 2266 casos se ejecutan dos veces por build~~ · **✅ hecho (fase 1)** |
| 8 | Cobertura | Baja | 80,3 % de líneas y 71,4 % de ramas (01-10-2026), con los huecos justo en el camino de sync |
| 9 | Documentación | Baja | ~~README con versiones caducadas; `package.json` en 1.3.2 con el CHANGELOG ya en 1.3.3~~ · **✅ resuelto** (los dos en 1.5.0; README repasado el 01-10-2026) |
| 10 | Código muerto | Baja | 127 `export` sin consumidor externo; solo 2 son código inalcanzable · **+2 símbolos de icono sin ninguna referencia** (`uncharted`, `keyboard-arrow-up`, 1,6 kB) · **✅ borrados (fase 5)** |
| 11 | Documentación | Baja | ~~«Diseño» sin cuenta de Google~~ · **✅ es así a propósito**; lo que estaba mal era la entrada de la 1.3.3, corregida |
| 12 | Rendimiento visual | **Media** | ~~La barra inferior se quedaba muda según la máquina~~ · **✅ arreglado** — un pestillo de un solo sentido y una constante desincronizada del CSS; lo cazó CI · **2.ª pasada:** la barra de desplazamiento de Linux se comía 15 px y el salto a iconos se decidía por dos; peldaño intermedio |
| 13 | Seguridad / coherencia | Baja | **Nuevo (01-10-2026).** ~~Dos criterios de administrador: `firestore.rules` decide por el *custom claim* y el borde, por `ADMIN_EMAIL`~~ · **✅ arreglado el mismo día**: el borde decide por el claim con la misma función que el cliente |
| 14 | Rendimiento | **Media** | **Nuevo (01-10-2026).** El arranque había vuelto a crecer: **crítico 185,5/190 kB** (97,6 %), holgura 4,5 kB · **✅ recuperado el mismo día** (`f62dc8a7`, `82978f93`): 180,2/190, holgura 9,8 kB |
| 15 | Rendimiento visual | **Media** | **Nuevo (07-10-2026).** Barrido de los ocho temas (Playwright, Chrome con GPU real, 300 juegos, escritorio y móvil ×4): el piloto rojo de «Social» repintaba la barra en cada fotograma (ahora destellos con pausa y solo `opacity`; reposo ÷10 en todos los temas); Portal/Cyberpunk animaban 1.204 chips en el mosaico (ahora 1 de cada 4); la barra de Arcade perdía los fotogramas animados (17-20 % → 1-1,6 % en móvil); Atkinson ya no se precarga fuera del tema por defecto (−33,5 kB). Witcher: fondo que sube con la página (29-48 % → 14-35 % en escritorio; 19-29 % → 16-24 % en móvil) y barrido más tenue; el resto es el papel rasgado de los carteles |

---

### 1 · CI no comprueba los tipos de `functions/` ni de `tests/integration` · **Alta** · ✅ HECHO

`tsconfig.json` incluye solo `src/**` y `tests/**`, y **excluye `tests/integration`**. El paso de CI es
`npx tsc --noEmit`, así que la verja **no mira `functions/`**: las 2152 líneas del borde (3498 el 01-10-2026) —canje de OAuth con el
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
2. `testTimeout: 10_000` en `vitest.config.mjs`, **por encima** del anterior a propósito: así el que salta primero
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

| Fichero | Líneas (18-09) | Líneas (01-10) | Señal |
|---|---|---|---|
| `src/viewmodel/useSocialViewModel.ts` | 2453 | 2373 | 94 hooks, 43 imports, 109 claves devueltas (18-09) |
| `src/App.tsx` | 1155 | 1312 | 52 hooks (18-09); 17,2 kB minificados en el chunk de entrada (01-10) |
| `src/view/components/GameTable.tsx` | 1372 | 1547 | 26 props (18-09); 20,2 kB minificados en el chunk de entrada (01-10) |
| `src/viewmodel/useSyncViewModel.ts` | — | 1097 | 11,2 kB minificados en el chunk de entrada (01-10) |
| `src/styles/stats.scss` | 3225 | 3353 | la hoja más larga (va en chunk perezoso, no en el arranque) |

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

**Lo que NO es un problema, y conviene no volver a levantarlo:** los `.map` que se publican con el deploy (72 y
7 MB al escribir esto; 94 y 7,9 MB el 01-10-2026). Está decidido y escrito en `vite.config.ts`: el código es GPL y público, los mapas no revelan nada que
no esté en el repositorio, y sirven para leer los stacks de telemetría.

### 7 · CI ejecuta la suite dos veces · Baja · ✅ HECHO

`Run unit tests` (`npm run test -- --reporter=verbose`) y `Run tests with coverage` (`npm run test:coverage`)
corrían **los mismos casos**. Se duplicaba el tiempo y la exposición al hallazgo 4.

**Arreglo aplicado** (fase 1): queda un solo paso, `npm run test:coverage -- --reporter=verbose` (reporta igual y
ya tenía `reportOnFailure: true`), y el navegador de Playwright se cachea con `actions/cache@v6` por versión de
`@playwright/test` en vez de descargar Chromium en cada build. Verificado: 195 ficheros, 2265 casos en verde y
2 saltados, con el paso de tipos de los dos proyectos delante.

### 8 · Cobertura: los huecos están en el camino de sync · Baja

Total al escribir esto: **79,4 % de líneas** (11 108/13 992) y **70,3 % de ramas** (8579/12 202). **Remedido el
01-10-2026: 80,3 % de líneas (13 656/17 015) y 71,4 % de ramas (10 893/15 247)**, con 3116 casos. Los peores,
entre los ficheros de más de 100 líneas ejecutables:

| Fichero | Líneas (18-09) | Líneas (01-10) | Ramas (01-10) |
|---|---|---|---|
| `view/components/stats/GenreBump.tsx` | 22,1 % | 22,1 % | 6,3 % |
| `model/repository/socialActivityHistory.ts` | 30,9 % | 30,9 % | 24,8 % |
| `view/components/roulette/RouletteModal.tsx` | 41,5 % | 41,5 % | 13,0 % |
| `App.tsx` | 57,2 % | 58,9 % | 37,1 % |
| `model/repository/gistRepository.ts` | 67,4 % | 68,1 % | 55,6 % |
| `model/repository/socialGistRepository.ts` | 69,6 % | 72,0 % | 62,7 % |
| `viewmodel/useSyncViewModel.ts` | 74,3 % | 78,5 % | 58,7 % |

`ListsRouletteModal.tsx` (la ruleta de las listas) sale al **0 %**: ningún test la monta, y no hace falta (fase 6,
punto 20).

Los tres últimos son los que importan: son exactamente donde han vivido los incidentes de pérdida de datos y de
sincronización que no propaga. El resto (gráficas, ruleta) es aceptable.

### 9 · Documentación desfasada · Baja · ✅ RESUELTO

**Estado (01-10-2026):** `package.json` y el CHANGELOG van los dos en 1.5.0, y el README se repasó entero contra el
código (características, árbol, scripts, variables, despliegue y la checklist con el `build` delante). Lo de
abajo es el registro de lo que había.

- `package.json` está en **1.3.2** y el CHANGELOG ya tiene `[1.3.3] - 2026-09-18` cerrada. El propio README
  advierte de que la versión se hornea en `__APP_VERSION__` y etiqueta la telemetría: sin subirla, los errores
  del despliegue nuevo se atribuyen al anterior.
- README: decía `react ^19.2.0` (está fijado en `19.3.0`), `vitest ^4.1.5` (es `^5.0.0`), **Node ≥ 20** en dos
  sitios (`engines` pide `>=22.16.0`) y `npm run typecheck` como «`tsc --noEmit`» (son dos proyectos).
  **Corregido en esta pasada.**
- `CHANGELOG.md` (176 KB; 220 KB el 01-10-2026) y `docs/plan-logros.md` (166 KB) en un solo fichero cada uno. No estorba a nadie
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

**TERCERA PASADA: el CI volvió a hablar, y esta vez dijo cuál era el otro factor.** Con el ancho ya compensado,
**390 px pasó** y siguieron en rojo **375 y 365**. Ese patrón tiene una sola lectura, y se comprueba con la
aritmética de la columna: si el texto midiera un **9 % más** que en macOS (apilado 69 → 75 px, apretado 65 → 71),
sale exactamente eso — 390 aguanta apretando el rótulo y 375/365 se quedan en iconos. Un 9 % no es redondeo: o es
**otra letra** (la de reserva) o es el motor de letra de Linux, que con el ajuste de contornos redondea el avance
de cada glifo y en una palabra de doce letras eso se acumula.

Las dos se atienden, porque desde aquí no se puede saber cuál de las dos era:

1. **`document.fonts.ready` NO ES UNA SUSCRIPCIÓN, ES UNA FOTO.** Resuelve con las cargas que hubiera EN MARCHA
   al preguntar, y el navegador no pide el `woff2` hasta que encuentra el primer texto que lo necesita: en una
   máquina cargada contesta «ya está» con la letra de reserva todavía puesta. El rescate se daba por hecho y no
   volvía a mirar. Ahora el componente escucha además **`loadingdone`**, que sí se dispara cada vez que termina
   una tanda de cargas — y de paso coge las tipografías que trae un tema al cambiar de paleta.
2. **El peldaño apretado estrena su propio reparto** (`.bottom-nav.is-tight`): menos aire a los lados, menos
   hueco entre pastillas y menos relleno interior, **~4,6 px más por columna**. Eso hace que la columna ya NO
   mida igual en todos los escalones; el medidor cuenta con ello —cada pasada mide rótulo **y** columna del
   escalón que está PINTADO, y al subir de escalón vuelve a medir para confirmar—.

**Y la prueba deja de medir a ciegas:** pide la cara que necesita con `document.fonts.load(…)` antes de mirar
nada —esperar a secas dependía de que otro la hubiera pedido ya— y cada aserción de «no puede quedarse muda»
lleva pegado el porqué: ancho útil, columna, rótulo más ancho, familia aplicada y si DM Sans estaba disponible.
Si esto vuelve a ponerse rojo en otra máquina, el log dirá cuál de las dos causas fue.

**Medido sobre el build, barriendo anchos con la letra normal y con el texto ensanchado un 9 % a propósito:**

| Ancho | Letra normal | Texto +9 % |
|---|---|---|
| 390 px | apilado, 15,6 px de aire | apilado, 12,6 |
| 375 px | apilado, 11,9 | **apretado, 18,5** |
| 365 px | apretado, 19,0 | **apretado, 16,0** |
| 350-360 px | apretado, 15-18 | apretado, 12-15 |
| 340 px | apretado, 12,7 | iconos (suelo) |

**Lo que esto NO cubre:** por debajo de ~348 px con la letra normal —o de ~345 con una un 9 % más ancha— la barra
sigue quedándose en iconos, que es el suelo de 280 px prometido y comprobado.

### 13 · Dos criterios de administrador · Baja · ✅ ARREGLADO (01-10-2026)

**Estado:** `verifyIdToken` devuelve `admin: hasAdminClaim(payload)` —la misma función de
`src/core/security/admin.ts` que usa el cliente, estricta contra `true` como las reglas— e `isAdmin(user)` decide
solo por eso. `ADMIN_EMAIL` salió de `wrangler.toml` (los tres entornos) y de `Env`, con lo que la dirección deja de
publicarse en el código vigente (el historial de git la conserva). Antes de cambiarlo se comprobó en producción que
la cuenta del administrador tiene el claim (`customAttributes: {"admin":true}`), así que no hay riesgo de quedarse
fuera al desplegar. Lo fijan cinco casos nuevos en `tests/unit/appCheckEdge.test.ts`: con claim sí; sin claim y con
el correo de antes, no; y no con `"true"`, `1` ni `false`. Lo de abajo es el diagnóstico original.

Desde que el panel pasó al *custom claim*, **las reglas y el borde preguntan cosas distintas**:

- `firestore.rules` (`isAdmin()`, línea 31): `request.auth.token.admin == true`. Lo mismo el cliente
  (`src/core/security/admin.ts`), y el claim lo concede o retira `scripts/set-admin-claim.mjs`.
- `functions/_lib/firebaseAuth.ts` (`isAdmin`), que usan `requireAdmin` y `caller.isAdmin` en
  `functions/_lib/context.ts:50`: correo verificado **igual a `ADMIN_EMAIL`** de `wrangler.toml`. De él dependen
  `/api/tmdb-search`, borrar el enlace compartido de otro (`api/share/[token].ts:48`) y los ajustes de cupo y vetos
  de compartir.

Hoy no abre nada —las dos vías señalan a la misma persona—, pero **el comentario de la función y el de
`wrangler.toml` dicen «mismo criterio que `firestore.rules`»**, y eso ya es falso. El día que se conceda el claim a
una segunda cuenta, o se le retire a la primera, el panel cambiará y el borde no, sin ningún error que lo cante.

**Arreglo propuesto (aplicado tal cual, ver el estado arriba):** que `verifyIdToken` devuelva también `payload.admin === true` (el claim viaja
en el ID token ya verificado, no hace falta leer nada más) y que `isAdmin` decida por él; `ADMIN_EMAIL` sale de
`wrangler.toml` en el mismo cambio. Ojo al orden de despliegue que ya avisa `firestore.rules`: el token tiene que
traer el claim, así que quien no haya vuelto a iniciar sesión desde que se le concedió se queda fuera hasta
hacerlo. Lleva test en `functions/` que fije que un token sin claim, con el correo de antes, ya no es admin.

### 14 · El arranque ha vuelto a crecer: 97,6 % del presupuesto · **Media** · ✅ RECUPERADO (01-10-2026)

**Estado:** el mismo día, `f62dc8a7` (los textos que solo pintan pantallas perezosas salen de `labels.ts` a
`consentLabels.ts`, `formLabels.ts` e `importLabels.ts`, y los avisos del carril salen del chunk de entrada) y
`82978f93` (los hooks de fondo se montan perezosos en idle). Medido sobre un worktree de `82978f93`: **crítico
180,2/190 kB** (holgura 9,8 kB), chunk de entrada **190,2 kB minificados (62,6 gzip)** y `labels.ts` de 14 404 a
**8 922** bytes minificados. Lo de abajo es la medición que lo destapó.

Medido con `npm run build && npm run validate` sobre `4a68dc73`: **«crítico 185,5/190 kB · total 218,7/240 kB»**.
La fase 5 lo había dejado en 179,1 con 10,9 kB de holgura; hoy quedan **4,5 kB**. El chunk de entrada pesa
**202,7 kB minificados (66,9 gzip)**, frente a 172,1 (58,0) tras partir `IconSprite`.

Atribución de bytes MINIFICADOS del chunk de entrada (mismo script de sourcemap de «Cómo se midió»):

| Fuente | Bytes minificados |
|---|---|
| `view/components/IconSprite.tsx` | 20 509 |
| `view/components/GameTable.tsx` | 20 178 |
| `App.tsx` | 17 171 |
| `core/constants/labels.ts` | **14 404** |
| `viewmodel/useSyncViewModel.ts` | 11 211 |
| `viewmodel/useGameListViewModel.ts` | 8 358 |
| `model/repository/indexedDbRepository.ts` | 6 977 |
| `view/components/Toolbar.tsx` | 5 509 |

Lo que se ve, y lo que falta por medir:

- **No es la guía de primeros pasos**: del arranque solo llevan `core/onboarding/tourState.ts` (1,2 kB) y
  `onboardingStore.ts` (0,3 kB); el resto ya va perezoso.
- **`labels.ts` es el candidato nuevo.** 34 KB de fuente (30 KB antes del 20-09), con `UI_MESSAGES` como un único
  objeto de ~400 líneas: al ser un objeto, el empaquetador no puede quedarse solo con las cadenas que usa el
  arranque. Cuánto de él lo pinta de verdad la lista está **por medir** (cobertura de Chromium, como el punto 16).
  Partirlo por pantalla es además lo que pide `docs/plan-idioma.md` para tener un fichero por idioma, así que
  conviene hacerlo una vez y con ese plan delante. Hecho en `f62dc8a7` (ver el estado arriba).
- `GameTable` (+2,3 kB desde la fase 5) y `App.tsx` (+2,3 kB) crecen con cada funcionalidad de las listas.

**Consecuencia práctica:** cualquier funcionalidad nueva que toque la pantalla de listas tiene que entrar por
`lazy()`/`import()`; con 4,5 kB, una tarjeta más en el grafo de arranque rompe el build. No se sube el tope: está
puesto para que esto se note.

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
- **Sin sumideros de XSS.** Un único `innerHTML` (`useSignatureEffects.ts:111`) y su interpolación son tres
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

## Plan

### Fase 1 — La verja · ✅ COMPLETADA (18-09-2026)

1. ✅ `.github/workflows/ci.yml`: `npx tsc --noEmit` → `npm run typecheck`. *(Hallazgo 1)*
2. ✅ Quitado el paso `Run unit tests`; queda `npm run test:coverage -- --reporter=verbose`. *(Hallazgo 7)*
3. ✅ `actions/cache@v6` sobre `~/.cache/ms-playwright`, con clave por versión de `@playwright/test`. *(7)*
4. ✅ Subir `package.json` a `1.3.3`: lo hizo el mantenedor al desplegar; hoy los dos van en 1.5.0. *(Hallazgo 9)*

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
14. ⏸️ **Cobertura de los tres ficheros de sync**: sin empezar. Estaban en 74,3 / 67,4 / 69,6 % de LÍNEAS; el
    01-10-2026, 78,5 / 68,1 / 72,0 % de líneas y **58,7 / 55,6 / 62,7 % de ramas**, que es lo que pide el criterio.

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
su alias de `COMMON_ICONS`—, así que el reparto final es 36 en el arranque y 13 en `IconSpriteRest` (38 y 13 el 01-10-2026: dos iconos nuevos entraron en el del arranque), montado **una sola vez desde `App` y en idle**
(`lazy()` lo saca del chunk; el idle evita que su descarga compita con el primer pintado). NO se sigue el patrón
de `AchievementSprite` —que lo monta cada pantalla, con relevo por orden de llegada— y la razón es a quién sirve
cada uno: aquel lo piden cinco pantallas que nunca coinciden; estos 13 los necesitan una decena de sitios
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

16. ❌ **Los módulos del chunk de entrada que no se ejecutan al arrancar se quedan donde están** (25-09-2026).
    Medido con la cobertura de Chromium (Playwright contra `vite preview`, biblioteca sembrada, tras el primer
    pintado y el idle): crítico **181,1 kB**, y en el chunk de entrada seis módulos no ejecutan ni un byte al
    pintar la lista —`FeedShell`, `SocialHubSkeleton`, `syncRepository`, `core/import/staging`, `githubHttp`,
    `crypto`, ~11 kB minificados—. Cinco están ahí A PROPÓSITO y con su porqué escrito: el esqueleto social es el
    `fallback` del `Suspense` (y arrastra `FeedShell`); `mergeCrdt` e `isDeferredNetworkError`/`getRetryAfterMs`
    los usan caminos síncronos del ciclo de sync (cabecera de `syncEngine.ts`); y `staging` lo mantiene
    `useImportInbox` al montar. Queda `crypto`: por `import()` desde `gistConfigRepository` baja el crítico a
    **180,3 kB** (−0,9 kB gzip), pero **abre un hueco en Chromium**. El service worker solo precachea el grafo
    estático y estrena caché en cada despliegue, así que el primer arranque sin red tras publicar no tiene el
    chunk; y **Chromium cachea el `import()` fallido** —el segundo intento ni sale a la red— mientras que Firefox
    y WebKit lo reintentan (medido en los tres con `page.route` abortando la primera petición). Resultado: al
    volver la red en esa misma sesión, el token seguiría sin descifrar y el hub social pediría «conecta la
    sincronización» estando conectado. Taparlo exige precachear el chunk y enseñar a `ci-validate.js` a no
    contarlo como crítico: demasiada maquinaria para un 0,5 % del arranque.

    **Lo que sí mueve la aguja está en las dependencias**: `react` (67,3 kB gzip, 35 % ejecutado al pintar) y
    `router` (14,5 kB, 38 %). El CSS de entrada solo usa el 21 % al pintar, pero casi todo lo demás es `:hover`,
    anchos y modo claro; las paletas inactivas son ~4–6 kB gzip, y sacarlas arriesga el primer fotograma.

17. ↩️ **Brotli del build en vez del de Cloudflare** (25-09-2026, verificado en vista previa). **Retirado el
    30-09-2026** (`7d84a1f6`: se borraron el plugin `brotliAssets` y `functions/_lib/brotliAsset.ts`): servirlo obligaba a que cada `/assets/*` pasara por una Pages Function, y eso gastaba el cupo
    gratuito de Workers (100.000/día) a razón de ~36 invocaciones por dispositivo nuevo y ~18 por despliegue. El
    404 de los chunks viejos lo da ahora un `404.html` sin Function; el arranque vuelve a viajar con la compresión
    de Cloudflare. Ver `docs/plan-capacidad-gratuita.md`, fase 3. Lo que sigue es el registro de lo que se hizo. Pages
    comprime al vuelo con un brotli de nivel bajo: en producción el chunk de React viaja con 67 745 bytes en `br`
    frente a 67 361 en `gzip`. Recomprimidos con calidad 11, los 15 ficheros del arranque de producción pasan de
    185,0 kB (gzip-9) a **158,7 kB** (−14 %), sin tocar la aplicación. El plugin `brotliAssets` (`vite.config.ts`)
    deja un `.br` junto a cada `.js`/`.css`, y la Function de `/assets/*` que ya existía (`functions/_lib/
    brotliAsset.ts`) lo sirve con `encodeBody: 'manual'` a quien acepta brotli; en cualquier otro caso sigue el
    camino de antes, con el 404 de los chunks viejos. No añade invocaciones: cada `/assets/*` ya pasaba por esa
    Function. `npm run validate` sigue midiendo el tope en gzip (el peor caso) y ahora imprime además el crítico
    en brotli (**155,6 kB** frente a 181,8) y falla si a algún asset del arranque le falta su `.br`.

    **Lo que NO se puede probar en local:** `wrangler pages dev` sirve el `.br` con `Accept-Encoding: br`, pero con
    la lista de un navegador (`gzip, deflate, br, zstd`) lo RECOMPRIME a gzip, porque elige por orden. El borde
    real prefiere `br` sea cual sea el orden, así que la prueba que vale es la de un despliegue de vista previa.

    **Verificado en la vista previa** (`5eed50cc.mygamelist.pages.dev`): con el `Accept-Encoding` de Chrome, Firefox
    y Safari llegan los bytes exactos del `.br` (entrada 54 549, CSS 21 530, React 58 016; en producción React
    viajaba con 67 745), y sin brotli sigue saliendo gzip. Las cabeceras son idénticas a las de la respuesta gzip
    salvo `Content-Encoding` (el `immutable`, la CSP y `nosniff` llegan copiados), un chunk inexistente sigue dando
    404 con `no-store`, y la app arranca en los tres motores con los cinco ficheros grandes del arranque en
    **150,3 kB frente a 176,2** de producción. El arranque sin red no se prueba en vista previa —la app desregistra
    ahí el service worker a propósito (`appUpdate.ts`)—, pero no cambia: producción ya servía `br` y arranca sin red.

**Criterio de aceptación:** el arranque baja de 182,8 a **179,1 kB** críticos (−2 %) sin perder funcionalidad, y
la holgura del presupuesto casi se dobla. Los tres ficheros de sync siguen por debajo del 80 % de ramas (punto
14, sin empezar).

### Fase 6 — Lo que salió al remedir (01-10-2026) · ✅ COMPLETADA

18. ✅ **Un solo criterio de administrador**: el borde lee el claim `admin` del ID token verificado y `ADMIN_EMAIL`
    sale de `wrangler.toml`. *(Hallazgo 13)*
19. ✅ **Recuperar holgura de arranque** antes de meter nada en las listas (`f62dc8a7`, `82978f93`: los textos que
    solo pintan pantallas perezosas salen de `labels.ts`, y los hooks de fondo se montan en idle; crítico 180,2 kB,
    holgura 9,8 kB). *(Hallazgo 14)*
20. ❌ ~~Un test que monte `ListsRouletteModal` (0 % de líneas)~~ **descartado**: son 36 líneas que solo calculan los
    candidatos con `buildListsPool`/`buildListsWeigher` y se los pasan a `RouletteModal`, y esas dos funciones ya
    tienen 23 casos en `tests/unit/roulette.test.ts`. Subiría la cifra sin vigilar nada. *(Hallazgo 8)*

**Criterio de aceptación — cumplido.** `isAdmin` del borde y `isAdmin()` de las reglas preguntan por el mismo claim,
con test que lo fija; y el crítico de `npm run validate` vuelve por debajo de 182 kB (180,2 kB).

## Lo que NO se hace

- **No se borran los `export` «sin usar» de `model/repository` ni de `model/types`.** Son staging de migración y
  hay falsos positivos conocidos. Los dos inalcanzables (`reiniciarMotorDeSync`, `parseImportedData`) se
  consultan antes de tocarlos.
- **No se retiran los sourcemaps del deploy.** Decisión tomada y documentada en `vite.config.ts`.
- **No se persigue la duplicación.** Con 0,18 % no hay nada que extraer que no empeore la lectura.
- **No se añade una regla de ESLint que prohíba a `view/` importar repositorios.** Ya se intentó y la medición la
  tumbó: la regla describía otra arquitectura (ver README, «Dónde la práctica se separa del esquema»).
