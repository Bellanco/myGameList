---
name: verificar-en-navegador
description: Cómo ver y fotografiar Mis Listas en un navegador de verdad — servidores (:8000 del usuario, :8001 propio), siembra de biblioteca y tema, maquetas del social y de /admin sin sesión, capturas de los ocho temas, CSS por paleta contra el build, antes/después en Chrome, texto grande de Android, rojos que solo salen en el CI de Linux y botones de OAuth atascados. Úsala al verificar un cambio visual o de layout, enseñar un diseño o reproducir un fallo de navegador.
---

## 0. Servidores y siembra

- **El :8000 es el servidor de desarrollo del usuario** (`vite.config.ts`). No lo pares ni levantes otro en su
  sitio. El tuyo, en el **:8001**: `npx vite --port 8001`. Para enseñarle una rama en su :8000, fusiónala ff en
  `develop` en local y su servidor la recoge.
- **Siembra** (en Playwright, `addInitScript` antes del `goto`; en e2e, `sembrarBiblioteca` de `tests/e2e/seed.ts`):
  - `mis-listas-v12-unified` (`STORAGE_KEY`): `{ c, v, e, p, d, updatedAt }` con `updatedAt: Date.now()` para ganar
    a IndexedDB. La biblioteca de referencia es `myGames.json` (ignorado por git, del usuario: ~149/87/2/64).
  - `mis-listas-palette`, `mis-listas-theme`, `mis-listas-analytics-consent: 'denied'`.
  - **Sin espacio social los temas se bloquean**: la app escribe `mis-listas-palette-locked` (`PALETTE_LOCK_KEY`) y
    pinta el tema por defecto. Impide esa escritura parcheando `Storage.prototype.setItem` como hace `seed.ts`, o
    capturarás ocho veces el mismo tema.
- **Listado: siempre con 120+ juegos** en la lista que miras (`WINDOW_VIRTUALIZE_MIN_ROWS = 120` en `GameTable.tsx`).
  Por debajo no virtualiza y los fallos de la tabla virtualizada (espaciadores con `colSpan`) no se ven.
  «Completados» del usuario siempre virtualiza; «En curso», nunca.
- Revisa al menos **390/360 y 1280**, y también **1512** (el MacBook del usuario) y **3840**: ahí salieron fallos
  que a 1280 no se veían. Claro y oscuro, y los temas con piel fuerte (grimdark, arcade, witcher, portal).
- **Firefox no arranca desde aquí** (macOS bloquea el perfil). Verifica en Chromium y razona el resto en el código.

## 1. Social y /admin sin sesión: las maquetas

El hub exige Google + GitHub y `/admin` el claim; no se entra con Playwright.

- `http://localhost:8001/docs/maquetas/social.html?pantalla=…` (pantallas y variantes en `PANTALLAS`/`VARIANTES` de
  `docs/maquetas/social.tsx`; la lista `TODAS` del script de capturas debe ir a la par). Tema:
  `&gl-palette=<id>&gl-theme=dark|light&gl-effects=off`; `&barra=0` quita la barra. Vista de admin:
  `?pantalla=amigos&abrir=admin`. `docs/maquetas/admin.html` hace lo mismo con el panel.
- Todas las capturas: `node scripts/capturar-maqueta-social.mjs` (uso en su cabecera). Si avisa de errores de
  consola, la maqueta se ha quedado vieja.
- `tsconfig.json` incluye `docs/maquetas/**/*.tsx`: si un componente del hub cambia de props, `tsc` falla.
- **Carátulas en la maqueta:** enciéndelas solo en el navegador aislado de Playwright
  (`localStorage.setItem('mis-listas-covers', 'on')`), nunca en el Chrome del usuario: el origen :8001 es el de su
  app de desarrollo. `/cover` lo resuelve el gemelo `localCoverApi`, con `.covers.local.json` ya poblado.
- **Capturas a medida sin fichero:** `node --input-type=module -e "import { chromium } from 'playwright'; …"`
  lanzado desde la raíz, con salida al scratchpad; `locator(...).screenshot()` para una sección.
- **Comparar una propuesta:** maqueta desechable `docs/maquetas/<x>.html` + `.tsx` (copia la cabecera anti-flash de
  `social.html`) con el componente real y la propuesta. Se borra al implementar.
- Límite de datos: de quien no es amigo solo hay nombre, foto y `lastActiveAt`. Nada que necesite su actividad es
  viable, ni para el admin.

## 2. Capturar los ocho temas

Una `preview.config.ts` en la raíz con `testMatch` propio, `baseURL` a tu :8001 y sin `webServer`, y un spec que use
`sembrarBiblioteca(page, { palette, theme, amplia: true })`. El «antes» sale de un worktree (ver §4), no de
`git stash`.

- `locator.textContent()` sobre un selector que no existe espera **30 s**: saca los textos de todas las tarjetas a
  la vez con `evaluateAll`.
- `screenshot({ animations: 'disabled' })` **espera** a que acabe la animación y varios temas titilan sin fin: se
  cuelga. Corta el movimiento con `addStyleTag` (`*{animation:none!important;transition:none!important}`) y no pases
  la opción. En esa hoja oculta también `.bottom-nav` y `.floating-controls`.
- La nota 0–100 no se siembra por localStorage: tras cargar, `page.evaluate` →
  `import('/src/model/repository/scorePreferenceRepository.ts')` → `persistScoreScale('x','grade')`, y otra vez
  antes de cada foto.
- La fila del mosaico sale a medio pintar por la animación de entrada de las cajas: recorta a `.game-card-art`.
- axe no ve el contraste de `text-shadow`, degradados ni lo no textual, y a mitad de animación da falsos positivos.

## 3. CSS que depende de la paleta, contra el build

- **App entera:** `npx vite preview --outDir dist --port <libre>` y un script que recorra las 16 combinaciones de
  tema y modo con la siembra de §0. Para un efecto disparado por la app:
  `document.dispatchEvent(new CustomEvent('gl:moment', …))` y captura a mitad de animación.
- **Una pieza suelta:** vuelca su marcado real con un test temporal en `tests/component/` (`writeFileSync(...,
  container.innerHTML)`) y sírvelo **por HTTP** con los CSS de `dist/assets/` (uno por skin, `index-*.css` del
  arranque y el de cada hoja de área). `data-palette` / `data-theme` / `data-effects` van en
  `document.documentElement`: los skins son `:root[data-palette="x"] …`.
- Comprueba de golpe con `getComputedStyle(el, '::before')` (`animationName`, `backgroundImage`) en las ocho paletas.
- Las gráficas de estadísticas no animan hasta entrar en pantalla: `scrollIntoViewIfNeeded` antes de leer.
- `file://` no sirve: `mask-image: url(...)` con SVG no carga (sin error) y `fetch()` falla por CORS.

## 4. Antes/después en Chrome para el usuario

Las maquetas se enseñan **en local en su Chrome**, nunca como artefacto de claude.ai.

- Dos worktrees en el scratchpad (antes = `develop` detached, después = la rama), cada uno con symlink a
  `node_modules` y una `vite.preview.config.ts` sin comitear dentro del worktree que haga `mergeConfig(base, …)` con
  `server.port` por variable de entorno, `cacheDir` propio (si no, los dos servidores se pisan) y un plugin
  `transformIndexHtml` que inyecte en `head-prepend` la siembra leída de la URL
  (`?gl-palette=&gl-theme=&gl-shape=&gl-seed=`).
- Página de comparación con dos iframes escalados con `transform`, servida con
  `python3 -m http.server 8010 --bind 127.0.0.1` y abierta con `open -a "Google Chrome" <url>`; modo «alternar» con
  la barra espaciadora para 3840. Copia las fuentes de `public/fonts/` junto a la página.

## 5. Texto grande del móvil del usuario

Sus capturas de Android llevan el texto del sistema ~+30 %. Con CDP antes del `goto`:
`cdp.send('Page.setFontSizes', { fontSizes: { standard: 21, fixed: 13 } })` a 360×640. Prueba 16 y 21, con el aviso
de cookies pendiente y el menú de Ajustes abierto. Un `position: sticky; bottom: 0` dentro de un contenedor con
`padding` se queda a la altura del relleno: hace falta `bottom: -<padding>`.

## 6. Rojos de medidas que solo salen en el CI de Linux

- Dos causas: la barra de desplazamiento de Linux se come ~15 px (`setViewportSize({width: 390})` deja 375 de
  contenido) y el texto mide hasta un 9–12 % más **con la letra ya cargada**. En el test: ensancha el viewport lo que
  mida `innerWidth - documentElement.clientWidth`, compara contra `clientWidth`, pide la cara con
  `document.fonts.load(...)` (`fonts.ready` es una foto, no una suscripción) y mete el porqué en el mensaje.
- **Reprodúcelo antes de tocar nada:** `npx vite build` en macOS, y en
  `mcr.microsoft.com/playwright:v<versión de node_modules/@playwright/test>-noble` copia el repo sin
  `node_modules`/`.git`, `npm ci --ignore-scripts` y `CI=1 npx playwright test …`. Abre Docker antes
  (`open -a Docker`); si la primera descarga corta con `unexpected EOF`, reabre y reintenta.
- Los skins pesan (0,3,0) y pueden anular reglas de las hojas comunes (pasó con el `letter-spacing` de la barra).

## 7. Botones de GitHub/Google que se quedan «pensando»

- bfcache: Chromium `headless: false`, sin `--disable-back-forward-cache`, **sin `context.route`** (la desactiva) y
  `goBack({ waitUntil: 'commit' })`.
- Navegaciones colgadas: `click({ noWaitAfter: true })` y `--host-resolver-rules` hacia un servidor TCP mudo.
- «Conectar con GitHub» en `npm run dev` necesita una OAuth App propia de desarrollo (`GITHUB_DEV_CLIENT_SECRET`);
  la de producción no vale en localhost.
