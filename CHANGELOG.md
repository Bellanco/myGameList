# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows the git tags.

## [Unreleased]

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

### Changed
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
