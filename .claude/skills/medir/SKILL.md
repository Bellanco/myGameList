---
name: medir
description: Recetas para medir de verdad en Mis Listas antes de afirmar un número — peso del arranque contra HEAD, arranque y listado con Playwright, scroll y rasterizado con GPU real, coste de la traza en los e2e y altura de x al elegir una fuente. Úsala cuando haya que dar una cifra de rendimiento, peso del bundle o tamaño de letra, o comparar un antes y un después.
---

Regla del proyecto: **los números se miden, no se estiman.** Las cifras de la documentación salen de los comandos de
«Cómo se midió» en `docs/revision-general-2026-09.md`; reprodúcelos con esos mismos comandos y apunta fecha, commit
y máquina junto al número.

Dos trampas que valen para todo lo de abajo:

- **Los scripts van en la raíz del proyecto**, no en el scratchpad: desde fuera, `node` no resuelve
  `@playwright/test` ni `playwright` (`ERR_MODULE_NOT_FOUND`). Si el script tiene que vivir fuera, importa
  `chromium` desde `<proyecto>/node_modules/playwright/index.mjs`. Bórralo al terminar.
- **`npm run test:e2e` y `vite preview` sirven el `dist` que haya.** Reconstruye antes (`npm run build`) o medirás
  código viejo en verde. Pista típica: instrumentas un componente y la traza sale vacía.
- No uses `git stash` para sacar un «antes»: suele haber otra sesión con cambios sin comitear. Usa un worktree.

## 1. Peso del arranque (delta contra HEAD)

`scripts/ci-validate.js` vigila dos números: el **crítico** (JS + CSS que bloquean el primer pintado; tope
`BOOT_CRITICAL_BUDGET_KB`) y el **total** del precache. Para saber cuánto añade un cambio:

```bash
git worktree add <scratchpad>/base-build HEAD --detach
ln -s "$PWD/node_modules" <scratchpad>/base-build/node_modules
npx vite build <scratchpad>/base-build --config <scratchpad>/base-build/vite.config.ts   # raíz posicional; no hay --root en Vite 8
npm run build && npm run validate                                                           # el de tu árbol, con su línea de presupuesto
git worktree remove --force <scratchpad>/base-build && git worktree prune
```

- No hagas `cd` al worktree: el directorio de trabajo se resetea en cada llamada. Pasa las rutas como argumentos.
- En el build del worktree el plugin del service worker no imprime la línea de presupuesto: compara el gzip de los
  ficheros (`gzip -c <f> | wc -c`) de `dist/assets/` que estén en el grafo de arranque (entrada + `modulepreload`
  de `dist/index.html`), no solo `index-*.js`.
- Si el crítico sube, la salida es diferir algo con `import()`. Subir el tope es lo último y exige rehacer las
  mediciones que documenta ese fichero.

## 2. Arranque y listado con Playwright

`npx vite preview --port 4173` y un script propio con `chromium`. Siembra antes del `goto` con
`page.addInitScript`: `localStorage['mis-listas-v12-unified']` (`STORAGE_KEY`; la forma del payload está en
`tests/e2e/seed.ts`) con **400 juegos**, que es la referencia de la revisión. Ventana 1440×900.

- Qué medir: FCP (`performance.getEntriesByName('first-contentful-paint')`), filas en el DOM, ms por pulsación en
  el buscador (incluye dos `requestAnimationFrame` de espera). Referencia del 18-09-2026: 10 filas, FCP 64 ms,
  33 ms por pulsación.
- `vite preview` no ejecuta las Pages Functions (`/cover`, `/api/*`): sin carátulas ni compartir. Para carátulas,
  sírvelas con `page.route` o usa el servidor de desarrollo (que tiene el gemelo `localCoverApi`).
- El MCP de Chrome DevTools (`lighthouse_audit`, `list_pages`) falla si el Chrome del usuario ya usa su perfil;
  no cierres su navegador. Usa Playwright.
- El usuario tiene el claim de admin: si lo que mides cambia con el claim, dilo; no des por buena una medición «sin
  sesión» para algo que él ve con sesión.

## 3. Scroll, fotogramas perdidos y rasterizado

**Headless usa SwiftShader** (también con `channel: 'chrome'`): el mismo `RasterTask` oscila entre 0,8 y 4,9 s de una
pasada a otra. Para comparar, GPU real:

```js
chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-gpu'] })
```

(comprueba que el renderer WebGL diga la GPU del Mac).

- **Traza:** `browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame', 'cc'] })` durante N `mouse.wheel`. Suma `RasterTask`, `Paint`,
  `UpdateLayoutTree` e `ImageDecodeTask`.
- **Fotogramas perdidos y huecos:** eventos `PipelineReporter` (ph `b`) con `args.frame_reporter.state`
  (`STATE_DROPPED`…) y `checkerboarded_needs_raster`. El `requestAnimationFrame` del hilo principal no los ve.
- «Al bajar se ve el fondo en vez de las carátulas» es **raster que no llega**, no carga de imagen. Para aislar la
  causa, apaga una pieza del tema cada vez con `addStyleTag` y cuenta `document.getAnimations()`.
- Lo caro aquí ya medido: animar `background-position` (en el `body` re-rasteriza la página entera cada fotograma;
  mejor `::before` fijo + `transform`), filtros SVG de turbulencia bajo chips animados, y cualquier animación en
  piezas de una lista sin virtualizar (el mosaico con <120 filas y el feed hasta 300 entradas).
- Con carátulas, `networkidle` no llega: `load` + una espera tolerante. Pre-descodificar con `img.decode()` se midió
  y no sirve (Chrome vuelve a descodificar al rasterizar).
- En zsh, `set -- $cfg` no parte en palabras: `a=(${=cfg})`.

## 4. Tests e2e lentos o con timeout solo en CI

`playwright.config.ts` lleva `trace: 'retain-on-failure'`: se graba en todos los tests y fotografía el DOM antes de
cada llamada (~300 ms por llamada en `/logros` frente a 2 ms sin traza). Diagnóstico: cronometra
`page.evaluate(() => 1)` con `--trace=on` frente a `--trace=off`. Arreglo: lee muchas filas en un solo
`page.evaluate` dentro de `expect.poll` (`leerFilas` en `tests/e2e/achievements.test.ts`).

Si el rojo es de anchuras, mira la skill `verificar-en-navegador` (CI de Linux con Docker).

## 5. «Esta letra se ve más pequeña al mismo font-size»

Es la **altura de x**, no la escala. Antes de proponer una fuente: Playwright + Chromium, una página de usar y tirar
con las candidatas, `await document.fonts.load(...)` de cada cara, y `measureText('x').actualBoundingBoxAscent` a
100 px comparado con la familia actual. Mide también la anchura de una línea real (si no coincide, la tabla se
recoloca al cambiar de tema) y el caso estrecho (280/375 px) por si el rótulo de la barra inferior se cae. Para
enseñarlo, una muestra en los colores del tema abierta con `open`, mejor que una tabla.
