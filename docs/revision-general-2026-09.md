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
| 2 | Rendimiento | **Media** | El árbol social entero se repinta con cualquier cambio: 109 claves en un hook y 17 componentes sin `memo` |
| 3 | Escalabilidad | **Media** | La válvula de desborde del gist (`ENABLE_GAMES_OVERFLOW_GISTS`) está apagada y sus pruebas se saltan solas en CI |
| 4 | Pruebas | **Media** | La suite es inestable bajo carga: 5 casos fallaron en una ejecución y pasaron en la siguiente sin tocar nada |
| 5 | Modularidad | Media | `useSocialViewModel` (2453 líneas, 94 hooks, 109 claves) y `App.tsx` (1155 líneas, 52 hooks) |
| 6 | Rendimiento | Baja | El chunk de arranque lleva cifrado, OAuth y avisos que no hacen falta para pintar la lista, con el presupuesto al 96 % |
| 7 | CI | Baja | ~~Los 2266 casos se ejecutan dos veces por build~~ · **✅ hecho (fase 1)** |
| 8 | Cobertura | Baja | 79,4 % de líneas y 70,3 % de ramas, con los huecos justo en el camino de sync |
| 9 | Documentación | Baja | README con versiones caducadas; `package.json` en 1.3.2 con el CHANGELOG ya en 1.3.3 |
| 10 | Código muerto | Baja | 127 `export` sin consumidor externo; solo 2 son código inalcanzable |

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

### 2 · El árbol social se repinta entero · **Media**

Dos cosas que se suman:

- `useSocialViewModel` devuelve un objeto con **109 claves**, y tiene **un único consumidor**: `SocialHub.tsx`
  (755 líneas), que las desestructura todas. Cualquier `setState` de los 94 hooks del view-model re-renderiza
  ese componente completo.
- De los **17 componentes de `src/view/components/socialhub/`, ninguno está envuelto en `memo`**. El contraste
  está en el mismo repositorio: `src/view/components/stats/` los tiene memoizados casi todos.

Así que escribir en el compositor, abrir una ficha o que llegue una lectura de gist arrastra el repintado de
feed, perfiles, solicitudes y detalle. No es un fallo visible en un equipo de sobremesa con pocos amigos; lo
será en móvil con el directorio lleno.

**Arreglo:** envolver en `memo` los componentes de pantalla de `socialhub/` (barato y sin riesgo) y, después,
partir el valor de retorno del hook en piezas por dominio (feed, amistades, perfil, compositor) para que cada
pantalla se suscriba solo a la suya.

### 3 · La válvula de desborde del gist está apagada · **Media**

En `gistRepository.ts`: `ENABLE_GAMES_WRAPPER_WRITE = true` y `ENABLE_GAMES_COMPRESSION = true` (fases ya
activadas), pero `ENABLE_GAMES_OVERFLOW_GISTS = false`. Los tests que documentan esa fase se saltan solos
(`describe.skipIf(!ENABLE_GAMES_OVERFLOW_GISTS)` en `tests/unit/gistOverflow.test.ts`), así que **el camino de
desborde no se ejecuta nunca en CI**.

Con compresión y troceado dentro del mismo gist el margen es amplio, así que esto no es urgente. Importa por
**la forma del fallo**, que es la misma que costó un mes de sincronización a un usuario real (la reseña de
21 265 caracteres): al rebasar el tope, la escritura **aborta entera** y el síntoma que ve su dueño es «mis
listas dejaron de actualizarse», sin error. Un camino de rescate que no se prueba es un camino que no se sabe
si funciona el día que hace falta.

**Arreglo:** un job de CI que ejecute `tests/unit/gistOverflow.test.ts` con el flag forzado a `true` (variable
de entorno leída por el test, sin tocar el valor de producción).

### 4 · La suite es inestable bajo carga · **Media**

Primera ejecución de `npm test`: `2 failed | 193 passed` ficheros, `5 failed | 2259 passed | 2 skipped` casos.
Los dos ficheros (`SocialHub.test.tsx`, y el nuevo `GithubSyncCard.test.tsx`) **pasan aislados** (79 casos en
verde) y la **segunda ejecución completa pasó entera** sin tocar una línea. El fallo era un `findByText` que
agota su espera, es decir, contención, no lógica.

La causa de fondo la canta Vitest al terminar: *«Environment jsdom was created 195 times · 122.48s total, 48%
of tracked time»*. Casi la mitad del presupuesto se va en montar entornos, y `SocialHub.test.tsx` —el fichero de
pruebas más grande del repositorio, 127 KB— compite por CPU con los otros 194.

**Arreglo:** subir los tiempos de espera de los casos de `SocialHub.test.tsx` que van con `findBy*` y evaluar
`pool: 'vmThreads'` (mantiene el aislamiento por fichero) o `isolate: false`. Partir ese fichero de pruebas cae
por su peso con el hallazgo 5.

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

### Fase 2 — Estabilidad de las pruebas (una tarde)

5. Subir el tiempo de espera de los `findBy*` de `SocialHub.test.tsx` que fallaron bajo carga. *(Hallazgo 4)*
6. Probar `pool: 'vmThreads'` en `vitest.config.js` y quedarse con él solo si la suite sigue verde tres
   ejecuciones seguidas. Si no, dejarlo como está y anotar el resultado aquí. *(4)*
7. Job de CI con `ENABLE_GAMES_OVERFLOW_GISTS` forzado por variable de entorno para que `gistOverflow.test.ts`
   deje de saltarse. *(Hallazgo 3)*

**Criterio de aceptación:** cinco ejecuciones completas seguidas de `npm test` sin un solo fallo, y
`gistOverflow.test.ts` ejecutándose (no saltado) en algún job.

### Fase 3 — Repintado del espacio social (uno o dos días)

8. `memo` en los 17 componentes de `socialhub/`, igualando lo que ya hace `stats/`. *(Hallazgo 2)*
9. Verificar la mejora con una medición reproducible (Playwright + sesión sembrada) y apuntarla aquí.

**Criterio de aceptación:** los tests de componente del hub social siguen en verde y el número de repintados por
pulsación en el compositor baja de forma medible.

### Fase 4 — Partir el view-model social (una semana, a trozos)

10. Sacar de `useSocialViewModel` un dominio por pasada, empezando por el compositor (el que ya tiene su
    fichero, `social/useSocialCompose.ts`) y siguiendo por amistades y perfil. Cada pasada deja el hook con
    menos claves y su propio fichero de pruebas, partiendo `SocialHub.test.tsx` en el mismo movimiento.
    *(Hallazgos 5 y 4)*
11. Con el hook partido, `App.tsx`: los hooks de sesión (`use*Session`) a `viewmodel/`, como ya reconoce el
    README que corresponde.

**Criterio de aceptación:** ningún fichero de `src/viewmodel/` por encima de 800 líneas; `SocialHub.tsx`
recibiendo piezas, no 109 claves.

### Fase 5 — Arranque y cobertura (a conveniencia)

12. Chunk perezoso en `idle` para cifrado + OAuth + avisos. Medir antes y después con el mismo método de este
    documento. *(Hallazgo 6)*
13. Subir a ≥80 % de ramas `useSyncViewModel`, `gistRepository` y `socialGistRepository`, empezando por los
    caminos de error (404, 304, conflicto, cuota) que son donde han estado los incidentes. *(Hallazgo 8)*

**Criterio de aceptación:** el arranque baja de 161,7 KB gzip de JS sin perder funcionalidad; los tres ficheros
de sync por encima del 80 % de ramas.

## Lo que NO se hace

- **No se borran los `export` «sin usar» de `model/repository` ni de `model/types`.** Son staging de migración y
  hay falsos positivos conocidos. Los dos inalcanzables (`reiniciarMotorDeSync`, `parseImportedData`) se
  consultan antes de tocarlos.
- **No se retiran los sourcemaps del deploy.** Decisión tomada y documentada en `vite.config.ts`.
- **No se persigue la duplicación.** Con 0,18 % no hay nada que extraer que no empeore la lectura.
- **No se añade una regla de ESLint que prohíba a `view/` importar repositorios.** Ya se intentó y la medición la
  tumbó: la regla describía otra arquitectura (ver README, «Dónde la práctica se separa del esquema»).
